/* global URL, fetch, console, AbortSignal, process */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID, createHash} from 'node:crypto';
// Deliberately require a named isolated stack; never silently target user data.
const prefix=process.env.GUILD_LOCAL_PREFIX;
assert.ok(prefix && prefix!=='pw-guild-local' && /^[a-z][a-z0-9-]{0,62}$/.test(prefix),'Set an isolated GUILD_LOCAL_PREFIX');
const config=JSON.parse(await readFile(new URL(`./.local/${prefix}/config.json`,import.meta.url)));
async function request(path,body,user,method='POST') {
 const res=await fetch(`${config.restUrl}/${path}`,{method,signal:AbortSignal.timeout(10000),headers:{apikey:config.anonKey,Authorization:`Bearer ${user?.access_token??config.anonKey}`,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
 const text=await res.text();return {ok:res.ok,status:res.status,data:text?JSON.parse(text):null};
}
const good=r=>{assert.ok(r.ok,`HTTP ${r.status}: ${r.data?.message??'request failed'}`);return r.data;};
const rpc=(name,body,user)=>request(`rpc/${name}`,body,user);
const users=[];
for(let i=0;i<3;i++) {
 const res=await fetch(`${config.authUrl}/signup`,{method:'POST',signal:AbortSignal.timeout(10000),headers:{apikey:config.anonKey,'Content-Type':'application/json'},body:JSON.stringify({email:`owner-activity-${randomUUID()}@example.test`,password:`Test-${randomUUID()}!`})});
 const user=await res.json();assert.ok(res.ok&&user.access_token,`Signup ${res.status}`);users.push(user);
}
const [owner,member,outsider]=users;
const guild=good(await rpc('create_guild',{p_name:'Original name'},owner));
const read=async(table,filter,user=owner)=>good(await request(`${table}?${filter}`,undefined,user,'GET'));
const events=(user=owner)=>read('guild_activity',`guild_id=eq.${guild}&order=activity_cursor`,user);
const [before]=await read('guilds',`id=eq.${guild}`);
good(await rpc('rename_guild',{p_guild:guild,p_name:'  Renamed name  '},owner));
const [after]=await read('guilds',`id=eq.${guild}`);
const renamed=(await events()).find(e=>e.kind==='guild_renamed');
assert.deepEqual(renamed.details.before,before,'rename preserves exact prior row');
assert.deepEqual(renamed.details.after,after,'rename preserves exact committed row');
assert.equal(after.name,'Renamed name');
console.log('PASS exact rename before/after through real authenticated RPC and activity read');
const tokens=[];
const issue=async()=>{const token=good(await rpc('create_invite',{p_guild:guild,p_hours:1},owner));tokens.push(token);return token;};
const token=await issue();
const [invite]=good(await rpc('list_pending_invites',{p_guild:guild},owner));
const issued=(await events()).find(e=>e.kind==='invite_issued');
assert.ok(issued,'invite issue produces activity');
assert.deepEqual(issued.details.before,null);
assert.deepEqual(issued.details.after,invite,'invite snapshot is exact public metadata allowlist');
assert.equal(good(await rpc('revoke_invite',{p_guild:guild,p_invite:invite.id},owner)),true);
const revoked=(await events()).find(e=>e.kind==='invite_revoked');
assert.deepEqual(revoked.details.before,invite);
assert.equal(revoked.details.after,null);
const checkpoint=await events();
assert.equal(good(await rpc('revoke_invite',{p_guild:guild,p_invite:invite.id},owner)),false);
assert.deepEqual(await events(),checkpoint,'revoke retry emits no duplicate');
assert.equal((await rpc('redeem_invite',{p_token:token,p_accept:true},member)).ok,false);
console.log('PASS invite issue/revoke exact safe metadata and no-op retry');
good(await rpc('redeem_invite',{p_token:await issue(),p_accept:true},member));
const base={p_guild:guild,p_action:'create',p_task:null,p_revision:null,p_title:'North base delivery',p_status:null,p_source:'wood',p_checksum:'catalog-v1',p_key:randomUUID(),p_type:'gathering',p_description:'Keep historical delivery',p_requested:10,p_delivered:3};
const tasks=[];
for(const status of ['open','doing','blocked','done','cancelled']) {
 let task=good(await rpc('mutate_task',{...base,p_key:randomUUID()},owner));
 task=good(await rpc('mutate_task',{...base,p_action:'claim',p_task:task.id,p_revision:task.revision,p_key:randomUUID()},member));
 task=good(await rpc('mutate_task',{...base,p_action:'update',p_task:task.id,p_revision:task.revision,p_status:status,p_key:randomUUID()},member));
 tasks.push(task);
}
const [membership]=await read('guild_members',`guild_id=eq.${guild}&user_id=eq.${member.user.id}`);
assert.equal(good(await rpc('remove_member',{p_guild:guild,p_user:member.user.id},owner)),true);
const history=await events();
const removed=history.find(e=>e.kind==='member_removed');
assert.deepEqual(removed.details.before,membership,'removed membership exact before snapshot');
assert.equal(removed.details.after,null);
const releases=history.filter(e=>e.kind==='claim_released');
assert.equal(releases.length,3);
for(const task of tasks) {
 const [current]=await read('guild_tasks',`id=eq.${task.id}`);
 const event=releases.find(e=>e.task_id===task.id);
 if(['done','cancelled'].includes(task.status)) {assert.equal(event,undefined);assert.deepEqual(current,task);continue;}
 assert.deepEqual(event.details.before,task,'full locked task before release');
 assert.deepEqual(event.details.after,current,'full committed task after release');
 assert.deepEqual({...current,updated_at:task.updated_at},{...task,assignee:null,status:'open',revision:task.revision+1});
 assert.ok(event.activity_cursor<removed.activity_cursor);
}
assert.equal(good(await rpc('remove_member',{p_guild:guild,p_user:member.user.id},owner)),false);
assert.deepEqual(await events(),history,'remove retry produces no additional events');
// Failed/unauthorized requests must not mutate either business state or history.
for(const user of [member,outsider,null]) {
 for(const [name,body] of [
  ['rename_guild',{p_guild:guild,p_name:'Forbidden'}],
  ['create_invite',{p_guild:guild,p_hours:1}],
  ['revoke_invite',{p_guild:guild,p_invite:invite.id}],
  ['remove_member',{p_guild:guild,p_user:owner.user.id}],
  ['guild_digest',{p_guild:guild}],
 ]) {const r=await rpc(name,body,user);assert.ok([401,403].includes(r.status));}
 if(user) assert.deepEqual(await events(user),[],'outsider/removed-member RLS denies history');
}
for(const [name,body] of [
 ['rename_guild',{p_guild:guild,p_name:' '}],
 ['create_invite',{p_guild:guild,p_hours:0}],
 ['remove_member',{p_guild:guild,p_user:owner.user.id}],
]) assert.equal((await rpc(name,body,owner)).ok,false);
assert.deepEqual(await events(),history);
for(const method of ['POST','PATCH','DELETE']) assert.equal((await request(`guild_activity?guild_id=eq.${guild}`,method==='DELETE'?undefined:{details:{}},owner,method)).ok,false);
assert.deepEqual(await events(),history,'activity remains immutable after direct write attempts');
good(await rpc('rename_guild',{p_guild:guild,p_name:'Later name'},owner));
good(await rpc('redeem_invite',{p_token:await issue(),p_accept:true},member));
const finalHistory=await events(member);
assert.deepEqual(finalHistory.filter(e=>history.some(old=>old.id===e.id)),history,'later rename/rejoin cannot rewrite history');
for(const event of finalHistory.filter(e=>['guild_renamed','invite_issued','invite_revoked','member_removed','claim_released'].includes(e.kind))) {
 assert.equal(event.actor,owner.user.id);assert.equal(event.details.actor,owner.user.id);
 assert.ok(Number.isFinite(Date.parse(event.created_at)));assert.ok(event.details.summary.length>0);
 assert.deepEqual(Object.keys(event.details).sort(),['actor','after','before','summary']);
}
for(let i=1;i<finalHistory.length;i++) assert.equal(finalHistory[i].activity_cursor,finalHistory[i-1].activity_cursor+1);
const serialized=JSON.stringify(finalHistory);
assert.equal(/token|secret|password/i.test(serialized),false);
for(const secret of tokens) {
 assert.equal(serialized.includes(secret),false);
 assert.equal(serialized.includes(createHash('sha256').update(secret).digest('hex')),false);
}
assert.deepEqual(good(await rpc('guild_digest',{p_guild:guild},member)),finalHistory);
good(await rpc('mark_seen',{p_guild:guild,p_through_id:finalHistory.at(-1).id},member));
assert.deepEqual(good(await rpc('guild_digest',{p_guild:guild},member)),[]);
console.log('PASS exact membership and 3 active claim-release snapshots; 2 closed assignments preserved; authorization/RLS, rollback/no-op, immutable history, secret exclusion, actor/time and cursor digest acknowledgement');
