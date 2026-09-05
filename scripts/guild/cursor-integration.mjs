/* global console, process, setTimeout, clearTimeout, URL */
// Real PostgreSQL concurrency; creates/drops only a uniquely named scratch database.
import assert from 'node:assert/strict';
import {spawn, execFileSync} from 'node:child_process';
import {readFileSync, readdirSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
const container=process.env.GUILD_DB_CONTAINER??'pw-guild-local-db';
const database=`guild_cursor_${randomUUID().replaceAll('-','')}`;
const command=(db,sql)=>execFileSync('podman',['exec','-i',container,'psql','-X','-U','postgres','-d',db,'-v','ON_ERROR_STOP=1','-Atq'],{input:sql,encoding:'utf8'}).trim();
const sessions=[];
function session() {
 const child=spawn('podman',['exec','-i',container,'psql','-X','-U','postgres','-d',database,'-v','ON_ERROR_STOP=1','-Atq']);
 let buffer='',pending=null,errors='';
 child.stdout.on('data',data=>{buffer+=data; if(pending&&buffer.includes(pending.marker+'\n')) {const p=pending;pending=null;clearTimeout(p.timer);const [result,rest]=buffer.split(p.marker+'\n');buffer=rest;p.resolve(result.trim());}});
 child.stderr.on('data',data=>{errors+=data;});
 child.on('exit',code=>{if(pending){clearTimeout(pending.timer);pending.reject(Error(`psql exited ${code}: ${errors}`));pending=null;}});
 const s={query(sql){assert.equal(pending,null,'one query per connection');return new Promise((resolve,reject)=>{const marker=`barrier_${randomUUID()}`;pending={marker,resolve,reject,timer:setTimeout(()=>{reject(Error(`SQL barrier timeout: ${sql}; ${errors}`));child.kill();},15000)};child.stdin.write(`${sql}\n\\echo ${marker}\n`);});},close(){child.stdin.end('rollback;\n\\q\n');}};
 sessions.push(s);return s;
}
const user=randomUUID(),guild=randomUUID(),other=randomUUID();
const event=(kind,time='2000-01-01',g=guild)=>`insert into public.guild_activity(guild_id,actor,kind,created_at) values('${g}','${user}','${kind}','${time}') returning id;`;
const digest=`select coalesce(json_agg(a order by activity_cursor),'[]'::json) from public.guild_digest('${guild}') a;`;
const seen=id=>`select public.mark_seen('${guild}',${id});`;
try {
 command('postgres',`create database ${database};`);
 // Minimal auth.uid fixture; application migrations and authenticated SQL grants are real.
 command(database,`create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claims',true)::jsonb->>'sub','')::uuid $$; grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;`);
 const dir=new URL('../../supabase/migrations/',import.meta.url);
 const legacyUser=randomUUID(),legacyGuild=randomUUID();
 for(const file of readdirSync(dir).filter(f=>f.endsWith('.sql')).sort()) {
  if(file==='202609060006_activity_cursor.sql') command(database,`insert into auth.users values('${legacyUser}'); insert into public.guilds(id,name) values('${legacyGuild}','Legacy'); insert into public.guild_members(guild_id,user_id,role,last_seen) values('${legacyGuild}','${legacyUser}','owner','2026-01-01'); insert into public.guild_activity(guild_id,actor,kind,created_at) values('${legacyGuild}','${legacyUser}','legacy_seen','2000-01-01'),('${legacyGuild}','${legacyUser}','legacy_equal','2000-01-01');`);
  command(database,readFileSync(new URL(file,dir),'utf8'));
 }
 assert.equal(command(database,`set role authenticated; set request.jwt.claims='{"sub":"${legacyUser}"}'; select count(*) from public.guild_digest('${legacyGuild}');`),'2','safe cutover replays historical events instead of guessing a timestamp prefix');
 assert.equal(command(database,`select string_agg(activity_cursor::text,',' order by activity_cursor) from public.guild_activity where guild_id='${legacyGuild}';`),'1,2');
 command(database,`insert into auth.users values('${user}'); insert into public.guilds(id,name) values('${guild}','Cursor test'),('${other}','Independent guild'); insert into public.guild_members(guild_id,user_id,role) values('${guild}','${user}','owner'),('${other}','${user}','owner');`);
 const a=session(),b=session(),reader=session();
 const pidA=Number(await a.query('select pg_backend_pid();'));
 const pidB=Number(await b.query('select pg_backend_pid();'));
 await reader.query(`set role authenticated; set request.jwt.claims='{"sub":"${user}"}';`);
 const baseline=Number(await a.query(event('baseline','2026-01-01')));
 assert.equal(JSON.parse(await reader.query(digest)).length,1);
 await a.query('begin;');
 // Allocate a low identity early, then commit it after higher IDs. Cursor must win.
 const reserved=Number(await a.query("select nextval(pg_get_serial_sequence('public.guild_activity','id'));"));
 const high=Number(await b.query(event('higher_id','2026-01-01')));
 await reader.query(seen(high));
 await a.query(`insert into public.guild_activity(id,guild_id,actor,kind,created_at) overriding system value values(${reserved},'${guild}','${user}','late_low_id','1999-01-01');`);
 const blocked=b.query(`begin; ${event('blocked_equal','1999-01-01')}`);
 // Observe an actual lock dependency, not a timing-based sleep assumption.
 let observed=false;
 for(let i=0;i<100;i++) {
  if(command(database,`select ${pidA}=any(pg_blocking_pids(${pidB}));`)==='t'){observed=true;break;}
  await new Promise(resolve=>setTimeout(resolve,20));
 }
 assert.ok(observed,'second same-guild allocation waits on first transaction');
 assert.deepEqual(JSON.parse(await reader.query(digest)),[],'uncommitted event is invisible');
 await reader.query(seen(high));
 command(database,event('other_guild','2000-01-01',other));
 await a.query('commit;');
 await blocked;
 let rows=JSON.parse(await reader.query(digest));
 assert.deepEqual(rows.map(r=>r.kind),['late_low_id']);
 assert.ok(rows[0].id<high,'identity allocation order inverted');
 await reader.query(seen(rows.at(-1).id));
 await b.query('commit;');
 rows=JSON.parse(await reader.query(digest));
 assert.deepEqual(rows.map(r=>r.kind),['blocked_equal'],'equal timestamp committed later remains unread');
 const finalCursor=rows.at(-1).activity_cursor;
 await reader.query(seen(rows.at(-1).id));
 await reader.query(seen(baseline));
 assert.deepEqual(JSON.parse(await reader.query(digest)),[],'older acknowledgement cannot regress cursor');
 await a.query(`begin; ${event('rolled_back')}`);
 await a.query('rollback;');
 await a.query(event('after_rollback','1998-01-01'));
 rows=JSON.parse(await reader.query(digest));
 assert.deepEqual(rows.map(r=>r.kind),['after_rollback']);
 assert.equal(rows[0].activity_cursor,finalCursor+1,'counter allocation is transactional');
 await reader.query(seen(rows[0].id));
 const foreignId=Number(command(database,`select id from public.guild_activity where guild_id='${other}';`));
 await reader.query(`do $$ begin perform public.mark_seen('${guild}',${foreignId}); raise exception 'unexpected success' using errcode='XX000'; exception when raise_exception then null; end $$;`);
 assert.deepEqual(JSON.parse(await reader.query(digest)),[]);
 assert.equal(command(database,"select has_table_privilege('authenticated','public.guild_activity_counters','UPDATE') or has_function_privilege('authenticated','public.assign_guild_activity_cursor()','EXECUTE');"),'f');
 console.log('PASS full migration stack; real concurrent same-guild lock barrier; independent guild; late lower-ID/older timestamp; equal timestamps; invisible in-flight write; monotonic acknowledgement; rollback; cross-guild rejection; private counter grants');
} finally {
 for(const s of sessions)s.close();
 command('postgres',`drop database if exists ${database} with (force);`);
}
