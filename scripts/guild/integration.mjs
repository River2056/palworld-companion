/* global URL, fetch, console, AbortSignal */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
const sql = (query) => execFileSync('podman', ['exec','-i','pw-guild-local-db','psql','-U','postgres','-v','ON_ERROR_STOP=1','-At'], {input:query, encoding:'utf8'}).trim();
const config = JSON.parse(await readFile(new URL('./.local/config.json', import.meta.url)));
const users = [];
async function request(path, body, token, method = 'POST') {
  const res = await fetch(`${config.restUrl}/${path}`, { method, signal: AbortSignal.timeout(10000), headers: { apikey: config.anonKey, Authorization: `Bearer ${token ?? config.anonKey}`, 'Content-Type': 'application/json' }, ...(body === undefined ? {} : {body: JSON.stringify(body)}) });
  const text = await res.text(); return {ok: res.ok, status: res.status, data: text ? JSON.parse(text) : null};
}
async function rpc(name, body, user = users[0]) { return request(`rpc/${name}`, body, user?.access_token); }
for (let i = 0; i < 4; i++) {
  const res = await fetch(`${config.authUrl}/signup`, {method:'POST', signal: AbortSignal.timeout(10000), headers:{'Content-Type':'application/json', apikey: config.anonKey}, body:JSON.stringify({email:`guild-${randomUUID()}@example.test`,password:randomUUID()+'Aa1!'})});
  const user = await res.json(); assert.ok(res.ok && user.access_token, `real signup failed (${res.status})`); users.push(user);
}
const created = await rpc('create_guild',{p_name:'Integration guild'});
assert.ok(created.ok, JSON.stringify(created)); const guild = created.data;
assert.equal((await rpc('create_invite',{p_guild:guild,p_hours:1},users[2])).ok,false);
const invite = await rpc('create_invite',{p_guild:guild,p_hours:1}); assert.ok(invite.ok);
assert.equal((await rpc('redeem_invite',{p_token:invite.data,p_accept:false},users[1])).ok,false);
const joins = await Promise.all([users[1],users[3]].map(u=>rpc('redeem_invite',{p_token:invite.data,p_accept:true},u)));
assert.equal(joins.filter(x=>x.ok).length,1,'single-use invite race');
const member = joins[0].ok ? users[1] : users[3];
assert.equal((await rpc('redeem_invite',{p_token:invite.data,p_accept:true},users[2])).ok,false);
assert.equal((await rpc('create_invite',{p_guild:guild,p_hours:1},member)).ok,false);
const key=randomUUID(); const input={p_guild:guild,p_action:'create',p_task:null,p_revision:null,p_title:'Make supplies',p_status:null,p_source:'item:wood',p_checksum:'abc',p_key:key};
const [a,b]=await Promise.all([rpc('mutate_task',input),rpc('mutate_task',input)]); assert.ok(a.ok && b.ok,JSON.stringify([a,b])); assert.deepEqual(a.data,b.data,'retry exactly same result');
const task=a.data;
assert.equal((await rpc('mutate_task',{...input,p_title:'Different'})).ok,false,'key payload mismatch');
const claims = await Promise.all([users[0],member].map(u=>rpc('mutate_task',{...input,p_action:'claim',p_task:task.id,p_revision:1,p_key:randomUUID()},u)));
assert.equal(claims.filter(x=>x.ok).length,1,'claim race has one winner');
assert.equal(claims.find(x=>!x.ok).status,409);
assert.equal(claims.find(x=>!x.ok).data.code,'PT409');
assert.equal((await rpc('mutate_task',{...input,p_action:'update',p_task:task.id,p_revision:1,p_status:'done',p_key:randomUUID()})).ok,false,'stale revision');
assert.equal((await rpc('mutate_task',{...input,p_key:randomUUID()},users[2])).ok,false,'outsider RPC');
for(const table of ['guilds','guild_members','guild_tasks','guild_activity']) {
 const hidden=await request(`${table}?guild_id=eq.${guild}`,undefined,users[2].access_token,'GET');
 if(table==='guilds') {const r=await request('guilds',undefined,users[2].access_token,'GET');assert.deepEqual(r.data,[]);} else assert.deepEqual(hidden.data,[]);
 const direct=await request(table,{},member.access_token); assert.equal(direct.ok,false,`${table} direct insert forbidden`);
}
const tasks=await request(`guild_tasks?guild_id=eq.${guild}`,undefined,member.access_token,'GET');assert.equal(tasks.data.length,1);
const digest=await rpc('guild_digest',{p_guild:guild},member); assert.ok(digest.ok); assert.ok(digest.data.length>=2);
const observed = digest.data.at(-1).id;
const deniedUpdate=await rpc('mutate_task',{...input,p_action:'update',p_task:task.id,p_revision:2,p_status:'done',p_key:randomUUID()},users[2]); assert.equal(deniedUpdate.status,403);
const next = await rpc('mutate_task',{...input,p_title:'After rendered digest',p_key:randomUUID()},member); assert.ok(next.ok);
assert.ok((await rpc('mark_seen',{p_guild:guild,p_through_id:observed},member)).ok);
const unread=await rpc('guild_digest',{p_guild:guild},member); assert.equal(unread.data.length,1); assert.equal(unread.data[0].task_id,next.data.id);
assert.ok((await rpc('mark_seen',{p_guild:guild,p_through_id:unread.data[0].id},member)).ok);
assert.deepEqual((await rpc('guild_digest',{p_guild:guild},member)).data,[]);
assert.equal((await rpc('mark_seen',{p_guild:guild,p_through_id:observed},users[2])).ok,false);
const otherGuild=await rpc('create_guild',{p_name:'Other guild'},users[2]);
const otherActivity=await rpc('guild_digest',{p_guild:otherGuild.data},users[2]);
assert.equal((await rpc('mark_seen',{p_guild:guild,p_through_id:otherActivity.data[0].id},member)).ok,false);
assert.equal((await rpc('mark_seen',{p_guild:guild,p_through_id:null},member)).ok,false);
// No anonymous mutations, role escalation, or actor forgery.
assert.equal((await request('rpc/create_guild',{p_name:'anonymous'})).ok,false);
assert.equal((await request('rpc/redeem_invite',{p_token:invite.data,p_accept:true})).ok,false);
for(const method of ['PATCH','DELETE']) {
 assert.equal((await request(`guild_members?guild_id=eq.${guild}&user_id=eq.${member.user.id}`,method==='PATCH'?{role:'owner'}:undefined,member.access_token,method)).ok,false);
 assert.equal((await request(`guild_tasks?id=eq.${task.id}`,method==='PATCH'?{created_by:users[2].user.id}:undefined,member.access_token,method)).ok,false);
}
for(const table of ['guild_invites','guild_requests']) assert.equal((await request(table,undefined,users[0].access_token,'GET')).ok,false);
assert.equal((await rpc('guild_digest',{p_guild:guild},users[2])).ok,false);
const winning=claims.find(x=>x.ok).data;
const assignee=users.find(u=>u.user.id===winning.assignee);
const other=assignee.user.id===member.user.id?users[0]:member;
if(other===member) assert.equal((await rpc('mutate_task',{...input,p_action:'update',p_task:task.id,p_revision:winning.revision,p_status:'done',p_key:randomUUID()},member)).ok,false);
const updated=await rpc('mutate_task',{...input,p_action:'update',p_task:task.id,p_revision:winning.revision,p_status:'done',p_key:randomUUID()},assignee); assert.ok(updated.ok); assert.equal(updated.data.status,'done');
const ownerUpdated=await rpc('mutate_task',{...input,p_action:'update',p_task:task.id,p_revision:updated.data.revision,p_status:'open',p_key:randomUUID()}); assert.ok(ownerUpdated.ok);
assert.equal(ownerUpdated.data.created_by,users[0].user.id);
const activity=await request(`guild_activity?guild_id=eq.${guild}&task_id=eq.${task.id}&order=id.desc`,undefined,member.access_token,'GET');
assert.equal(activity.data[0].actor,users[0].user.id); assert.equal(activity.data[1].actor,assignee.user.id);
const deniedMember=await rpc('mutate_task',{...input,p_action:'update',p_task:next.data.id,p_revision:1,p_status:'done',p_key:randomUUID()},member); assert.equal(deniedMember.status,403);
const memberClaim=await rpc('mutate_task',{...input,p_action:'claim',p_task:next.data.id,p_revision:1,p_key:randomUUID()},member); assert.ok(memberClaim.ok);
const memberUpdate=await rpc('mutate_task',{...input,p_action:'update',p_task:next.data.id,p_revision:2,p_status:'done',p_key:randomUUID()},member); assert.ok(memberUpdate.ok); assert.equal(memberUpdate.data.status,'done');
const expired=await rpc('create_invite',{p_guild:guild,p_hours:1}); assert.ok(expired.ok);
assert.equal(sql(`select count(*) from public.guild_invites where guild_id='${guild}' and token_hash=digest('${expired.data}','sha256') and octet_length(token_hash)=32;`),'1');
sql(`update public.guild_invites set expires_at=clock_timestamp()-interval '1 second' where guild_id='${guild}' and token_hash=digest('${expired.data}','sha256');`);
assert.equal((await rpc('redeem_invite',{p_token:expired.data,p_accept:true},users[2])).ok,false);
assert.equal((await rpc('create_invite',{p_guild:guild,p_hours:0})).ok,false);
console.log('PASS watermark preserves later activity; cross-guild watermark denied; anonymous denied; role escalation denied; owner/assignee updates; server-authored actors; expired hashed invite denied');
console.log('PASS real GoTrue signup; owner/member/outsider RLS; opt-in; invite race; claim race; idempotency; stale revision; protected writes; digest');
