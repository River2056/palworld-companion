/* global process, console, Buffer, URL, setTimeout, setInterval, clearInterval, fetch, AbortSignal */
// Private, durable local Supabase Auth + PostgREST. No public database port.
import {execFileSync} from 'node:child_process';
import {randomBytes, createHmac, createHash} from 'node:crypto';
import {mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, rmSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const prefix=process.env.GUILD_LOCAL_PREFIX ?? 'pw-guild-local';
if (!/^[a-z][a-z0-9-]{0,62}$/.test(prefix)) throw Error('Invalid GUILD_LOCAL_PREFIX');
const dir=new URL(prefix==='pw-guild-local' ? './.local/' : `./.local/${prefix}/`,import.meta.url);
const action=process.argv[2] ?? 'start';
if (!['start','resume','stop','destroy'].includes(action)) throw Error('Usage: node scripts/guild/local.mjs [start|resume|stop|destroy --confirm-destroy]');
const run=(...args)=>execFileSync('podman',args,{encoding:'utf8',stdio:['pipe','pipe','pipe']});
const exists=(type,name)=>run(type,'exists',name); // Only status 1 means absent; connection errors must propagate.
function present(type,name) {try {exists(type,name);return true;} catch(e) {if(e.status===1)return false;throw e;}}
const names=['rest','auth','db'];
if(action==='stop' || action==='destroy') {
 if(action==='destroy' && process.argv[3]!=='--confirm-destroy') throw Error('Destructive operation requires --confirm-destroy; stop preserves data.');
 for(const name of names) if(present('container',`${prefix}-${name}`)) run(action==='stop'?'stop':'rm',...(action==='destroy'?['-f']:[]),`${prefix}-${name}`);
 if(action==='destroy') {
  if(present('volume',`${prefix}-data`)) run('volume','rm',`${prefix}-data`);
  if(present('network',prefix)) run('network','rm',prefix);
  if(prefix==='pw-guild-local') {
   // The default directory also contains isolated stacks; never erase their state.
   for(const file of ['state.json','config.json','db.env','auth.env','rest.env'])rmSync(new URL(file,dir),{force:true});
  } else rmSync(dir,{recursive:true,force:true});
 }
 console.log(action==='stop'?`Stopped ${prefix}; database, containers, credentials and network preserved.`:`Destroyed only ${prefix} and its saved credentials.`);
 process.exit(0);
}
const stateFile=new URL('state.json',dir);
const existing=names.filter(name=>present('container',`${prefix}-${name}`));
// Legacy stacks have no ledger. Never guess which manually installed migrations ran.
if(!existsSync(stateFile) && (existing.length || present('volume',`${prefix}-data`))) {
 if(action==='resume' && existing.length===3) {
  for(const name of [...names].reverse())run('start',`${prefix}-${name}`);
  console.log(`Resumed legacy ${prefix} without schema changes. Its migration history is unknown; use a separate GUILD_LOCAL_PREFIX for a fully migrated fresh stack.`);
  process.exit(0);
 }
 throw Error('Unmanaged/legacy stack detected; refusing to replace data or credentials. Use resume, or a separate GUILD_LOCAL_PREFIX for a fresh migrated stack.');
}
if(action==='resume' && !existsSync(stateFile))throw Error('No saved stack to resume; use start.');
mkdirSync(dir,{recursive:true,mode:0o700});
const port=(key,fallback)=>{const value=Number(process.env[key]??fallback);if(!Number.isInteger(value)||value<1024||value>65535)throw Error(`Invalid ${key}`);return value;};
const state=existsSync(stateFile)?JSON.parse(readFileSync(stateFile,'utf8')):{prefix,secret:randomBytes(48).toString('hex'),password:randomBytes(24).toString('hex'),authPort:port('GUILD_AUTH_PORT',55431),restPort:port('GUILD_REST_PORT',55432)};
if(state.prefix!==prefix)throw Error('Saved stack prefix mismatch');
if(state.authPort===state.restPort)throw Error('Auth and REST ports must differ');
if(!existsSync(stateFile))writeFileSync(stateFile,JSON.stringify(state),{mode:0o600,flag:'wx'});
const {secret,password,authPort,restPort}=state;
const authUrl=`http://127.0.0.1:${authPort}`, restUrl=`http://127.0.0.1:${restPort}`;
const jwt=(role)=>{const h=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url');const p=Buffer.from(JSON.stringify({role,iss:'supabase',exp:Math.floor(Date.now()/1000)+86400})).toString('base64url');return `${h}.${p}.${createHmac('sha256',secret).update(`${h}.${p}`).digest('base64url')}`;};
function envFile(name,values){const url=new URL(`${name}.env`,dir);writeFileSync(url,Object.entries(values).map(([k,v])=>`${k}=${v}`).join('\n'),{mode:0o600});return fileURLToPath(url);}
async function ready(check,label){
 // AbortSignal.timeout is unref'ed; retain the event loop during cold-start fetches.
 const keepAlive=setInterval(()=>{},1000);
 try {for(let i=0;i<90;i++){try{if(await check())return;}catch {/* Not ready yet. */} await new Promise(r=>setTimeout(r,1000));}throw Error(`Timed out waiting for ${label}`);}
 finally {clearInterval(keepAlive);}
}
const sql=(input)=>execFileSync('podman',['exec','-i',`${prefix}-db`,'psql','-U','postgres','-v','ON_ERROR_STOP=1','-At'],{input,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
function start(name,image,args) {
 if(present('container',`${prefix}-${name}`)) {run('start',`${prefix}-${name}`);return;}
 if(!present('image',image))run('pull',image);
 run('run','-d','--name',`${prefix}-${name}`,'--network',prefix,...args,image);
}
try {
 if(!present('network',prefix))run('network','create',prefix);
 if(!present('volume',`${prefix}-data`))run('volume','create',`${prefix}-data`);
 start('db','docker.io/library/postgres:15-alpine',['--volume',`${prefix}-data:/var/lib/postgresql/data`,'--env-file',envFile('db',{POSTGRES_PASSWORD:password})]);
 await ready(()=>run('exec',`${prefix}-db`,'pg_isready','-U','postgres').includes('accepting connections'),'postgres');
 if(sql("select count(*) from pg_roles where rolname='authenticator'")==='0') {
  sql(`begin; create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls; create role authenticator login password '${password}' noinherit; grant anon, authenticated, service_role to authenticator; create role supabase_auth_admin login password '${password}' createrole; create schema auth authorization supabase_auth_admin; alter role supabase_auth_admin set search_path=auth; grant all on database postgres to supabase_auth_admin; grant usage on schema auth to authenticated; commit;`);
 }
 start('auth','docker.io/supabase/gotrue:v2.177.0',['-p',`127.0.0.1:${authPort}:9999`,'--env-file',envFile('auth',{GOTRUE_API_HOST:'0.0.0.0',GOTRUE_API_PORT:9999,API_EXTERNAL_URL:authUrl,GOTRUE_DB_DRIVER:'postgres',GOTRUE_DB_DATABASE_URL:`postgres://supabase_auth_admin:${password}@${prefix}-db:5432/postgres`,GOTRUE_SITE_URL:'http://127.0.0.1:5173',GOTRUE_JWT_SECRET:secret,GOTRUE_JWT_EXP:3600,GOTRUE_JWT_AUD:'authenticated',GOTRUE_JWT_DEFAULT_GROUP_NAME:'authenticated',GOTRUE_DISABLE_SIGNUP:false,GOTRUE_MAILER_AUTOCONFIRM:true,GOTRUE_RATE_LIMIT_EMAIL_SENT:100,GOTRUE_RATE_LIMIT_SIGN_UPS:100})]);
 await ready(async()=> (await fetch(`${authUrl}/health`,{signal:AbortSignal.timeout(2000)})).ok,'GoTrue');
 sql("create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claims',true)::jsonb ->> 'sub','')::uuid $$; grant execute on function auth.uid() to authenticated; create schema if not exists guild_local; revoke all on schema guild_local from public; create table if not exists guild_local.migrations(name text primary key, checksum text not null);");
 const migrationsDir=new URL('../../supabase/migrations/',import.meta.url);
 const files=readdirSync(migrationsDir).filter(name=>/^\d+_[a-z0-9_]+\.sql$/.test(name)).sort();
 if(!files.length)throw Error('No migrations found');
 const applied=new Map(sql('select name || chr(9) || checksum from guild_local.migrations order by name').split('\n').filter(Boolean).map(line=>line.split('\t')));
 for(const name of applied.keys())if(!files.includes(name))throw Error(`Applied migration missing: ${name}`);
 for(const name of files) {
  const source=readFileSync(new URL(name,migrationsDir),'utf8');const checksum=createHash('sha256').update(source).digest('hex');
  if(applied.has(name)){if(applied.get(name)!==checksum)throw Error(`Applied migration changed: ${name}`);continue;}
  if([...applied.keys()].some(previous=>previous>name))throw Error(`Out-of-order migration: ${name}`);
  // Repository migrations own a BEGIN/COMMIT pair; include the ledger write in that transaction.
  if(!/^begin;/i.test(source.trim()) || !/commit;\s*$/i.test(source))throw Error(`Migration must have outer BEGIN/COMMIT: ${name}`);
  sql(source.replace(/commit;\s*$/i,`insert into guild_local.migrations values ('${name}','${checksum}');\ncommit;`));
  applied.set(name,checksum);console.log(`Applied ${name}`);
 }
 start('rest','docker.io/postgrest/postgrest:v12.2.12',['-p',`127.0.0.1:${restPort}:3000`,'--env-file',envFile('rest',{PGRST_DB_URI:`postgres://authenticator:${password}@${prefix}-db:5432/postgres`,PGRST_DB_SCHEMAS:'public',PGRST_DB_ANON_ROLE:'anon',PGRST_JWT_SECRET:secret})]);
 run('restart',`${prefix}-rest`);
 await ready(async()=> (await fetch(`${restUrl}/`,{signal:AbortSignal.timeout(2000)})).ok,'PostgREST');
 for(const name of ['auth','rest']){const ports=JSON.parse(run('inspect',`${prefix}-${name}`))[0].NetworkSettings.Ports;for(const bindings of Object.values(ports))for(const b of bindings??[])if(b.HostIp!=='127.0.0.1')throw Error('Unsafe port binding');}
 writeFileSync(new URL('config.json',dir),JSON.stringify({authUrl,restUrl,anonKey:jwt('anon')}),{mode:0o600});
 console.log(`READY ${prefix}: ${applied.size} migrations; only 127.0.0.1 bindings. Config: ${fileURLToPath(new URL('config.json',dir))}`);
} catch(e) {console.error('Local setup failed:',e.message?.replaceAll(password,'[redacted]').replaceAll(secret,'[redacted]'));console.error(`Data retained. Retry start with the same GUILD_LOCAL_PREFIX (${prefix}); stop is non-destructive.`);process.exitCode=1;}
