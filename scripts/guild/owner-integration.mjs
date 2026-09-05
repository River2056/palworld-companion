/* global URL, fetch, console, AbortSignal, process */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
const config = JSON.parse(await readFile(new URL(process.env.GUILD_LOCAL_PREFIX ? `./.local/${process.env.GUILD_LOCAL_PREFIX === 'pw-guild-local' ? '' : process.env.GUILD_LOCAL_PREFIX + '/'}config.json` : './.local/config.json', import.meta.url)));
async function request(path, body, user, method = 'POST') {
 const res = await fetch(`${config.restUrl}/${path}`, {method, signal:AbortSignal.timeout(10000), headers:{apikey:config.anonKey, Authorization:`Bearer ${user?.access_token ?? config.anonKey}`, 'Content-Type':'application/json'}, ...(body === undefined ? {} : {body:JSON.stringify(body)})});
 const text = await res.text(); return {ok:res.ok,status:res.status,data:text ? JSON.parse(text) : null};
}
const rpc = (name, body, user) => request(`rpc/${name}`,body,user);
const users=[];
for(let i=0;i<3;i++) {
 const res=await fetch(`${config.authUrl}/signup`,{method:'POST',signal:AbortSignal.timeout(10000),headers:{apikey:config.anonKey,'Content-Type':'application/json'},body:JSON.stringify({email:`owner-${randomUUID()}@example.test`,password:randomUUID()+'Aa1!'})});
 const user=await res.json(); assert.ok(res.ok && user.access_token,`Signup failed ${res.status}`); users.push(user);
}
const [owner,member,outsider]=users;
const success = r => {assert.ok(r.ok,JSON.stringify(r));return r.data;};
const denied = r => {assert.ok([401,403].includes(r.status),JSON.stringify(r)); assert.equal(r.data.code,'42501');};
const guild=success(await rpc('create_guild',{p_name:'Owner API tests'},owner));
const other=success(await rpc('create_guild',{p_name:'Other owner'},outsider));
const issue = async () => success(await rpc('create_invite',{p_guild:guild,p_hours:1},owner));
const token=await issue();
success(await rpc('redeem_invite',{p_token:token,p_accept:true},member));
const pendingToken=await issue();
const pending=success(await rpc('list_pending_invites',{p_guild:guild},owner));
assert.equal(pending.length,1);
assert.deepEqual(Object.keys(pending[0]).sort(),['created_by','expires_at','guild_id','id']);
assert.equal(JSON.stringify(pending).includes(pendingToken),false);
for(const user of [member,outsider,undefined]) {
 denied(await rpc('list_pending_invites',{p_guild:guild},user));
 denied(await rpc('revoke_invite',{p_guild:guild,p_invite:pending[0].id},user));
 denied(await rpc('remove_member',{p_guild:guild,p_user:member.user.id},user));
 denied(await rpc('rename_guild',{p_guild:guild,p_name:'Unauthorized'},user));
}
assert.equal(success(await rpc('revoke_invite',{p_guild:other,p_invite:pending[0].id},outsider)),false,'cross-guild ID cannot revoke');
assert.equal(success(await rpc('remove_member',{p_guild:other,p_user:member.user.id},outsider)),false);
assert.equal(success(await rpc('list_pending_invites',{p_guild:guild},owner)).length,1);
assert.equal(success(await rpc('revoke_invite',{p_guild:guild,p_invite:pending[0].id},owner)),true);
assert.equal((await rpc('redeem_invite',{p_token:pendingToken,p_accept:true},outsider)).ok,false);
assert.deepEqual(success(await rpc('list_pending_invites',{p_guild:guild},owner)),[]);
assert.equal(success(await rpc('revoke_invite',{p_guild:guild,p_invite:pending[0].id},owner)),false);
// Real overlapping requests: exactly one of successful revoke/redemption wins.
for(let i=0;i<5;i++) {
 const raceToken=await issue();
 const [invite]=success(await rpc('list_pending_invites',{p_guild:guild},owner));
 const [revoked,redeemed]=await Promise.all([
  rpc('revoke_invite',{p_guild:guild,p_invite:invite.id},owner),
  rpc('redeem_invite',{p_token:raceToken,p_accept:true},outsider),
 ]);
 assert.equal(Number(success(revoked)===true)+Number(redeemed.ok),1);
 assert.equal((await rpc('redeem_invite',{p_token:raceToken,p_accept:true},outsider)).ok,false);
 if(redeemed.ok) assert.equal(success(await rpc('remove_member',{p_guild:guild,p_user:outsider.user.id},owner)),true);
}
success(await rpc('rename_guild',{p_guild:guild,p_name:'  Renamed guild  '},owner));
assert.equal(success(await request(`guilds?id=eq.${guild}`,undefined,member,'GET'))[0].name,'Renamed guild');
assert.equal((await rpc('rename_guild',{p_guild:guild,p_name:' '},owner)).ok,false);
assert.equal((await rpc('rename_guild',{p_guild:guild,p_name:'x'.repeat(101)},owner)).ok,false);
denied(await rpc('rename_guild',{p_guild:other,p_name:'Cross guild'},owner));
denied(await rpc('remove_member',{p_guild:guild,p_user:owner.user.id},owner));
const members=success(await request(`guild_members?guild_id=eq.${guild}`,undefined,member,'GET'));
assert.equal(members.length,2); assert.equal(members.find(m=>m.user_id===owner.user.id).role,'owner');
const base={p_guild:guild,p_action:'create',p_task:null,p_revision:null,p_title:'Release me',p_status:null,p_source:null,p_checksum:null,p_key:randomUUID()};
const task=success(await rpc('mutate_task',base,owner));
const claimed=success(await rpc('mutate_task',{...base,p_action:'claim',p_task:task.id,p_revision:1,p_key:randomUUID()},member));
assert.equal(claimed.assignee,member.user.id);
assert.equal(success(await rpc('remove_member',{p_guild:guild,p_user:member.user.id},owner)),true);
const [released]=success(await request(`guild_tasks?id=eq.${task.id}`,undefined,owner,'GET'));
assert.equal(released.assignee,null); assert.equal(released.status,'open');assert.equal(released.revision,claimed.revision+1);
const activity=success(await request(`guild_activity?guild_id=eq.${guild}&kind=eq.claim_released`,undefined,owner,'GET'));
assert.ok(activity.some(a=>a.task_id===task.id && a.actor===owner.user.id));
assert.ok(success(await rpc('guild_digest',{p_guild:guild},owner)).some(a=>a.kind==='member_removed' && a.actor===owner.user.id));
for(const table of ['guilds','guild_members','guild_tasks','guild_activity']) {
 const filter=table==='guilds'?'id':'guild_id';
 assert.deepEqual(success(await request(`${table}?${filter}=eq.${guild}`,undefined,member,'GET')),[]);
}
denied(await rpc('guild_digest',{p_guild:guild},member));
denied(await rpc('mutate_task',{...base,p_key:randomUUID()},member));
// Even replaying an old successful task request must not bypass lost membership.
denied(await rpc('mutate_task',{...base,p_key:randomUUID()},outsider));
assert.equal(success(await rpc('remove_member',{p_guild:guild,p_user:member.user.id},owner)),false);
for(const table of ['guild_invites','guild_members','guilds']) {
 assert.equal((await request(table,{},owner,'POST')).ok,false);
 assert.equal((await request(`${table}?${table==='guilds'?'id':'guild_id'}=eq.${guild}`,table==='guilds'?{name:'Forbidden'}:table==='guild_members'?{role:'owner'}:{redeemed_by:owner.user.id},owner,'PATCH')).ok,false);
 assert.equal((await request(table,undefined,owner,'DELETE')).ok,false);
}
assert.equal((await request('guild_invites',undefined,owner,'GET')).ok,false);
// Removal versus an overlapping claim cannot leave an active orphan assignment.
for(let i=0;i<5;i++) {
 const rejoin=await issue(); success(await rpc('redeem_invite',{p_token:rejoin,p_accept:true},member));
 const next=success(await rpc('mutate_task',{...base,p_key:randomUUID()},owner));
 const claimInput={...base,p_action:'claim',p_task:next.id,p_revision:1,p_key:randomUUID()};
 const [claim,remove]=await Promise.all([rpc('mutate_task',claimInput,member),rpc('remove_member',{p_guild:guild,p_user:member.user.id},owner)]);
 assert.equal(success(remove),true); assert.ok(claim.ok || claim.status===403);
 const [after]=success(await request(`guild_tasks?id=eq.${next.id}`,undefined,owner,'GET'));
 assert.equal(after.assignee,null);assert.equal(after.status,'open');
 assert.equal(after.revision,claim.ok?3:1);
 denied(await rpc('mutate_task',claimInput,member));
}
console.log('PASS owner/member/outsider/anonymous permissions; hash-hidden pending invites; committed revoke and 5 revoke/redeem races; cross-guild denials; rename validation; owner protected; RLS and RPC access lost; active claim release with revision/activity; direct writes denied; 5 remove/claim races; removed-member retry denied');
