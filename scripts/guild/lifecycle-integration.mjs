/* global process, console, URL */
// Destructive cleanup is restricted to this run's random namespace; never the user stack.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {randomUUID, createHash} from 'node:crypto';
import {existsSync, readFileSync, readdirSync} from 'node:fs';
import {createServer} from 'node:net';
import {fileURLToPath} from 'node:url';
const podman=(...args)=>execFileSync('podman',args,{encoding:'utf8',stdio:['pipe','pipe','pipe']});
const prefix=`pw-guild-test-${randomUUID().slice(0,8)}`;
const dir=new URL(`./.local/${prefix}/`,import.meta.url);
const local=fileURLToPath(new URL('./local.mjs',import.meta.url));
async function freePort(){const server=createServer();await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});const port=server.address().port;await new Promise(resolve=>server.close(resolve));return port;}
const authPort=await freePort();let restPort=await freePort();while(restPort===authPort)restPort=await freePort();
const env={...process.env,GUILD_LOCAL_PREFIX:prefix,GUILD_AUTH_PORT:String(authPort),GUILD_REST_PORT:String(restPort),GUILD_DB_CONTAINER:`${prefix}-db`};
const lifecycle=(...args)=>execFileSync(process.execPath,[local,...args],{env,stdio:'inherit'});
const sql=input=>execFileSync('podman',['exec','-i',`${prefix}-db`,'psql','-U','postgres','-v','ON_ERROR_STOP=1','-Atq'],{input,encoding:'utf8'}).trim();
function userSnapshot(){
 const names=podman('ps','-a','--format','{{.Names}}').trim().split('\n').filter(name=>/^pw-guild-local-(db|auth|rest)$/.test(name)).sort();
 const containers=names.map(name=>{const c=JSON.parse(podman('inspect',name))[0];return {name,id:c.Id,started:c.State.StartedAt,status:c.State.Status};});
 const config=new URL('./.local/config.json',import.meta.url);
 return {containers,configHash:existsSync(config)?createHash('sha256').update(readFileSync(config)).digest('hex'):null};
}
const before=userSnapshot();
try {
 lifecycle('start');
 const expected=readdirSync(new URL('../../supabase/migrations/',import.meta.url)).filter(name=>/^\d+_[a-z0-9_]+\.sql$/.test(name)).sort();
 assert.deepEqual(sql('select name from guild_local.migrations order by name').split('\n'),expected);
 for(const script of ['integration.mjs','owner-integration.mjs','owner-activity-integration.mjs','details-integration.mjs','cursor-integration.mjs']) {
  execFileSync(process.execPath,[fileURLToPath(new URL(script,import.meta.url))],{env,stdio:'inherit'});
 }
 sql("create table guild_local.persistence_probe(value text); insert into guild_local.persistence_probe values ('survives');");
 const state=readFileSync(new URL('state.json',dir),'utf8');
 const users=sql('select count(*) from auth.users');assert.notEqual(users,'0');
 const ids=()=>['db','auth','rest'].map(name=>JSON.parse(podman('inspect',`${prefix}-${name}`))[0].Id);
 const originalIds=ids();
 lifecycle('stop');
 for(const name of ['db','auth','rest'])assert.equal(JSON.parse(podman('inspect',`${prefix}-${name}`))[0].State.Running,false);
 assert.equal(readFileSync(new URL('state.json',dir),'utf8'),state);
 lifecycle('resume');
 assert.deepEqual(ids(),originalIds,'stop/resume keeps containers');
 assert.equal(sql('select value from guild_local.persistence_probe'),'survives');
 assert.equal(sql('select count(*) from auth.users'),users);
 assert.deepEqual(sql('select name from guild_local.migrations order by name').split('\n'),expected);
 lifecycle('start'); // Repeated start is idempotent.
 assert.equal(sql('select value from guild_local.persistence_probe'),'survives');
 // Prove the named volume, not just container writable layers, preserves the database.
 for(const name of ['rest','auth','db'])podman('rm','-f',`${prefix}-${name}`);
 lifecycle('start');
 assert.equal(sql('select value from guild_local.persistence_probe'),'survives');
 assert.equal(sql('select count(*) from auth.users'),users);
 assert.equal(readFileSync(new URL('state.json',dir),'utf8'),state);
 console.log(`PASS: ${expected.length} sorted migrations, all guild integration suites, stop/resume, repeat start, container recreation with durable users/data/credentials.`);
} finally {
 lifecycle('destroy','--confirm-destroy');
 assert.equal(existsSync(dir),false);
 for(const [type,name] of [['container',`${prefix}-db`],['container',`${prefix}-auth`],['container',`${prefix}-rest`],['volume',`${prefix}-data`],['network',prefix]]) {
  try {podman(type,'exists',name);assert.fail(`${type} ${name} survived cleanup`);}catch(e){assert.equal(e.status,1);}
 }
 assert.deepEqual(userSnapshot(),before,'existing user containers and config unchanged');
 console.log('PASS: isolated cleanup verified; existing user container IDs/start times/state and config unchanged.');
}
