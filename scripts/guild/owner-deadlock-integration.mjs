/* global console, process, setTimeout, clearTimeout, URL */
// Test-only barriers live exclusively in a unique scratch database, never migrations.
import assert from 'node:assert/strict';
import {spawn, execFileSync} from 'node:child_process';
import {readFileSync, readdirSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
const container=process.env.GUILD_DB_CONTAINER;
assert.ok(container && container!=='pw-guild-local-db' && /^[a-z][a-z0-9-]+-db$/.test(container),'Explicit isolated GUILD_DB_CONTAINER required');
const expectDeadlock=process.argv.includes('--expect-deadlock');
const database=`guild_deadlock_${randomUUID().replaceAll('-','')}`;
const command=(db,sql)=>execFileSync('podman',['exec','-i',container,'psql','-X','-U','postgres','-d',db,'-v','ON_ERROR_STOP=1','-Atq'],{input:sql,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
const sessions=[];
function session() {
 const child=spawn('podman',['exec','-i',container,'psql','-X','-U','postgres','-d',database,'-Atq']);
 let buffer='',pending=null,errors='';
 child.stdout.on('data',data=>{buffer+=data;if(pending&&buffer.includes(pending.marker+'\n')){const p=pending;pending=null;clearTimeout(p.timer);const [result,rest]=buffer.split(p.marker+'\n');buffer=rest;const match=result.match(/STATE (\w+)/);if(match?.[1]!=='00000')p.reject(Object.assign(Error(errors),{code:match?.[1]}));else p.resolve(result.replace(/STATE \w+\s*$/,'').trim());}});
 child.stderr.on('data',data=>{errors+=data;});
 child.on('exit',code=>{if(pending){clearTimeout(pending.timer);pending.reject(Error(`psql exited ${code}: ${errors}`));pending=null;}});
 const s={query(sql){assert.equal(pending,null);return new Promise((resolve,reject)=>{const marker=`barrier_${randomUUID()}`;pending={marker,resolve,reject,timer:setTimeout(()=>{reject(Error(`SQL timeout: ${errors}`));child.kill();},20000)};child.stdin.write(`${sql}\n\\echo STATE :SQLSTATE\n\\echo ${marker}\n`);});},close(){child.stdin.end('rollback;\n\\q\n');}};
 sessions.push(s);return s;
}
async function blocked(waiter,holder,label){
 const deadline=Date.now()+8000;
 while(Date.now()<deadline){if(command(database,`select ${holder}=any(pg_blocking_pids(${waiter}));`)==='t'){console.log(`BARRIER ${label}: dependency observed`);return;}await new Promise(r=>setTimeout(r,10));}
 assert.fail(`Missing lock dependency: ${label}`);
}
const user=randomUUID(),guild=randomUUID(),task=randomUUID();
const auth=`set role authenticated; set request.jwt.claims='{"sub":"${user}"}';`;
const row=table=>JSON.parse(command(database,`select row_to_json(t) from ${table} t where id='${table==='guilds'?guild:task}';`));
const digest=()=>JSON.parse(command(database,`${auth} select coalesce(json_agg(t),'[]'::json) from public.guild_digest('${guild}') t;`));
const rename=name=>`select public.rename_guild('${guild}','${name}');`;
try {
 command('postgres',`create database ${database};`);
 command(database,`create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claims',true)::jsonb->>'sub','')::uuid $$; grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;`);
 const dir=new URL('../../supabase/migrations/',import.meta.url);
 for(const file of readdirSync(dir).filter(f=>f.endsWith('.sql')).sort()) {
  let source=readFileSync(new URL(file,dir),'utf8');
  // Optional negative control restores only the historical lock in scratch SQL.
  // Default execution always tests the migration source exactly as shipped.
  if(expectDeadlock && file==='202609060007_owner_activity.sql') {
   assert.match(source,/select \* into old_guild from guilds where id=p_guild for (?:no key )?update;/);
   source=source.replace('select * into old_guild from guilds where id=p_guild for no key update;','select * into old_guild from guilds where id=p_guild for update;');
  }
  command(database,source);
 }
 // Catalog guard: name is not part of any unique key and no application trigger
 // changes guild keys. The scratch barrier below returns NEW without modification.
 assert.equal(command(database,`select count(*) from pg_index i join pg_attribute a on a.attrelid=i.indrelid and a.attnum=any(i.indkey) where i.indrelid='public.guilds'::regclass and i.indisunique and a.attname='name';`),'0');
 assert.equal(command(database,`select count(*) from pg_trigger where tgrelid='public.guilds'::regclass and not tgisinternal;`),'0');
 command(database,`insert into auth.users values('${user}'); insert into guilds(id,name) values('${guild}','Original'); insert into guild_members(guild_id,user_id,role) values('${guild}','${user}','owner'); insert into guild_tasks(id,guild_id,title,created_by) values('${task}','${guild}','Original task','${user}'); insert into guild_activity(guild_id,actor,kind) values('${guild}','${user}','baseline'); create function public.test_rename_barrier() returns trigger language plpgsql as $$ begin perform pg_advisory_xact_lock(6047007); return new; end $$; create trigger test_rename_barrier before update on guilds for each row execute function public.test_rename_barrier();`);
 const beforeGuild=row('guilds'),beforeTask=row('guild_tasks');
 const a=session(),b=session(),gate=session(),probe=session();
 const [pidA,pidB,pidGate,pidProbe]=await Promise.all([a,b,gate,probe].map(s=>s.query('select pg_backend_pid();').then(Number)));
 for(const s of [a,b])await s.query(`set deadlock_timeout='3s'; ${auth} begin;`);
 await gate.query('begin; select pg_advisory_xact_lock(6047007);');
 const renamed=a.query(rename('First')).then(value=>({value}),error=>({error}));
 await blocked(pidA,pidGate,'rename holds guild snapshot lock and waits at BEFORE UPDATE barrier');
 const updated=b.query(`select public.mutate_task('${guild}','update','${task}',1,'Updated task',null,null,null,'${randomUUID()}');`).then(value=>({value}),error=>({error}));
 if(expectDeadlock)await blocked(pidB,pidA,'task activity FK KEY SHARE waits on rename guild UPDATE');
 else assert.ok(!(await updated).error,'task update completes under rename NO KEY UPDATE');
 const counterProbe=probe.query(`begin; select 1 from guild_activity_counters where guild_id='${guild}' for update;`).then(value=>({value}),error=>({error}));
 await blocked(pidProbe,pidB,'counter row is held by task transaction');
 command(database,`select pg_cancel_backend(${pidProbe});`);await counterProbe;await probe.query('rollback;');
 await gate.query('commit;');
 await blocked(pidA,pidB,'rename activity waits on task counter');
 if(expectDeadlock){
  const results=await Promise.all([renamed,updated]);
  const deadlock=results.find(r=>r.error?.code==='40P01');
  assert.ok(deadlock,'real PostgreSQL deadlock SQLSTATE');
  await a.query('rollback;');await b.query('rollback;');
  assert.deepEqual(row('guilds'),beforeGuild);assert.deepEqual(row('guild_tasks'),beforeTask);assert.equal(digest().length,1);
  console.log('RED CONFIRMED 40P01: guild UPDATE -> counter / counter -> guild KEY SHARE; full rollback');
 } else {
  await b.query('commit;');assert.ok(!(await renamed).error);await a.query('commit;');
  const afterGuild=row('guilds'),afterTask=row('guild_tasks');
  assert.deepEqual({...afterGuild,name:beforeGuild.name},beforeGuild,'non-key fields unchanged');
  let events=digest();assert.deepEqual(events.map(e=>e.kind),['baseline','update','guild_renamed']);
  assert.deepEqual(events.map(e=>e.activity_cursor),[1,2,3]);
  assert.deepEqual(events[1].details.before,beforeTask);assert.deepEqual(events[1].details.after,afterTask);
  assert.deepEqual(events[2].details.before,beforeGuild);assert.deepEqual(events[2].details.after,afterGuild);
  // Real overlapping renames: B must wait and snapshot A's committed row.
  await a.query(`begin; ${rename('Second')}`);
  const middle=JSON.parse(await a.query(`select row_to_json(g) from guilds g where id='${guild}';`));
  const second=b.query(rename('Third'));
  await blocked(pidB,pidA,'concurrent rename serializes snapshot');
  await a.query('commit;');await second;
  events=digest();assert.deepEqual(events.map(e=>e.activity_cursor),[1,2,3,4,5]);
  assert.deepEqual(events[3].details.before,afterGuild);assert.deepEqual(events[3].details.after,middle);
  assert.deepEqual(events[4].details.before,middle);assert.deepEqual(events[4].details.after,row('guilds'));
  command(database,`${auth} select public.mark_seen('${guild}',${events.at(-1).id});`);assert.deepEqual(digest(),[]);
  console.log('PASS NO KEY UPDATE: both RPCs commit, exact task/guild snapshots, cursor/digest order, serialized concurrent renames, acknowledgement');
 }
} finally {
 for(const s of sessions)s.close();
 command('postgres',`drop database if exists ${database} with (force);`);
 assert.equal(command('postgres',`select count(*) from pg_database where datname='${database}';`),'0');
 console.log('CLEANUP scratch database absence verified');
}
