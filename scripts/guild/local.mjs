/* global process, console, Buffer, URL, setTimeout, fetch */
/* eslint no-empty: ["error", { "allowEmptyCatch": true }] */
// Isolated real Supabase Auth + PostgREST. No public database port.
import {execFileSync} from 'node:child_process';
import {randomBytes,createHmac} from 'node:crypto';
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
const prefix='pw-guild-local';
const run=(...args)=>execFileSync('podman',args,{encoding:'utf8',stdio:['pipe','pipe','pipe']});
if(process.argv[2]==='stop') {
 for(const name of ['auth','rest','db']) {try {run('rm','-f',`${prefix}-${name}`);}catch{}}
 try{run('network','rm',prefix);}catch{}
 console.log('Removed only pw-guild-local containers/network.');process.exit(0);
}
if (process.argv[2] && process.argv[2] !== 'start') throw Error('Usage: node scripts/guild/local.mjs [start|stop]');
for (const name of ['auth','rest','db']) {
 let exists=false; try {run('container','inspect',`${prefix}-${name}`); exists=true;} catch {}
 if (exists) throw Error('Existing local guild stack detected; refusing to replace its credentials.');
}
const dir=new URL('./.local/',import.meta.url);mkdirSync(dir,{recursive:true,mode:0o700});
const secret=randomBytes(48).toString('hex');const password=randomBytes(24).toString('hex');
const jwt=(role)=>{const h=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url');const p=Buffer.from(JSON.stringify({role,iss:'supabase',exp:Math.floor(Date.now()/1000)+86400})).toString('base64url');return `${h}.${p}.${createHmac('sha256',secret).update(`${h}.${p}`).digest('base64url')}`;};
function envFile(name,values){const url=new URL(`${name}.env`,dir);writeFileSync(url,Object.entries(values).map(([k,v])=>`${k}=${v}`).join('\n'),{mode:0o600});return url.pathname;}
async function ready(check,label){for(let i=0;i<90;i++){try{if(await check())return;}catch{} await new Promise(r=>setTimeout(r,1000));}throw Error(`Timed out waiting for ${label}`);}
try {
 for(const image of ['docker.io/library/postgres:15-alpine','docker.io/supabase/gotrue:v2.177.0','docker.io/postgrest/postgrest:v12.2.12']) {console.log(`Pulling ${image}`);run('pull',image);}
 run('network','create',prefix);
 run('run','-d','--name',`${prefix}-db`,'--network',prefix,'--env-file',envFile('db',{POSTGRES_PASSWORD:password}),'docker.io/library/postgres:15-alpine');
 await ready(()=>run('exec',`${prefix}-db`,'pg_isready','-U','postgres').includes('accepting connections'),'postgres');
 const bootstrap=`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls; create role authenticator login password '${password}' noinherit; grant anon, authenticated, service_role to authenticator; create role supabase_auth_admin login password '${password}' createrole; create schema auth authorization supabase_auth_admin; alter role supabase_auth_admin set search_path=auth; grant all on database postgres to supabase_auth_admin; grant usage on schema auth to authenticated;`;
 execFileSync('podman',['exec','-i',`${prefix}-db`,'psql','-U','postgres','-v','ON_ERROR_STOP=1'],{input:bootstrap,stdio:['pipe','pipe','pipe']});
 const migration=readFileSync(new URL('../../supabase/migrations/202609060001_guild.sql',import.meta.url));

 run('run','-d','--name',`${prefix}-auth`,'--network',prefix,'-p','127.0.0.1:55431:9999','--env-file',envFile('auth',{GOTRUE_API_HOST:'0.0.0.0',GOTRUE_API_PORT:9999,API_EXTERNAL_URL:'http://127.0.0.1:55431',GOTRUE_DB_DRIVER:'postgres',GOTRUE_DB_DATABASE_URL:`postgres://supabase_auth_admin:${password}@${prefix}-db:5432/postgres`,GOTRUE_SITE_URL:'http://127.0.0.1:5173',GOTRUE_JWT_SECRET:secret,GOTRUE_JWT_EXP:3600,GOTRUE_JWT_AUD:'authenticated',GOTRUE_JWT_DEFAULT_GROUP_NAME:'authenticated',GOTRUE_DISABLE_SIGNUP:false,GOTRUE_MAILER_AUTOCONFIRM:true,GOTRUE_RATE_LIMIT_EMAIL_SENT:100,GOTRUE_RATE_LIMIT_SIGN_UPS:100}),'docker.io/supabase/gotrue:v2.177.0');
 run('run','-d','--name',`${prefix}-rest`,'--network',prefix,'-p','127.0.0.1:55432:3000','--env-file',envFile('rest',{PGRST_DB_URI:`postgres://authenticator:${password}@${prefix}-db:5432/postgres`,PGRST_DB_SCHEMAS:'public',PGRST_DB_ANON_ROLE:'anon',PGRST_JWT_SECRET:secret}),'docker.io/postgrest/postgrest:v12.2.12');
 await ready(async()=> (await fetch('http://127.0.0.1:55431/health')).ok,'GoTrue');
 execFileSync('podman',['exec','-i',`${prefix}-db`,'psql','-U','postgres','-v','ON_ERROR_STOP=1'],{input:Buffer.concat([Buffer.from("create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claims',true)::jsonb ->> 'sub','')::uuid $$; grant execute on function auth.uid() to authenticated;\n"),migration]),stdio:['pipe','pipe','pipe']});
 run('restart',`${prefix}-rest`);
 await ready(async()=> (await fetch('http://127.0.0.1:55432/')).ok,'PostgREST');
 for(const name of ['auth','rest']){const ports=JSON.parse(run('inspect',`${prefix}-${name}`))[0].NetworkSettings.Ports;for(const bindings of Object.values(ports))for(const b of bindings??[])if(b.HostIp!=='127.0.0.1')throw Error('Unsafe port binding');}
 writeFileSync(new URL('config.json',dir),JSON.stringify({authUrl:'http://127.0.0.1:55431',restUrl:'http://127.0.0.1:55432',anonKey:jwt('anon')}),{mode:0o600});
 console.log('READY: real auth and REST; verified only 127.0.0.1 bindings. Config in ignored scripts/guild/.local/config.json');
} catch(e) {console.error('Local setup failed:',e.message?.replaceAll(password,'[redacted]').replaceAll(secret,'[redacted]')); console.error('Inspect named container logs locally; clean up with node scripts/guild/local.mjs stop');process.exitCode=1;}
