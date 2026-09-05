import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import {afterEach,expect,test,vi} from 'vitest';
import {PersonalDatabase} from './personal-db';
const databases:Dexie[]=[];
const track=<T extends Dexie>(db:T):T=>{databases.push(db);return db;};
afterEach(async()=>{
 for(const db of databases)db.close();
 for(const name of new Set(databases.map(db=>db.name)))await Dexie.delete(name);
 databases.length=0;
});
const pal={id:'p',speciesId:'unknown',nickname:'legacy',gender:'unknown',passives:[],notes:'retain',location:'box',archived:false,favorite:true,unknownFutureField:{verbatim:['keep',42]}};
async function legacy(){
 const db=track(new Dexie('fence-source-'+crypto.randomUUID()));
 db.version(1).stores({pals:'id,speciesId',bases:'id',routes:'id,targetId'});
 db.version(2).stores({pals:'id,speciesId',bases:'id',routes:'id,targetId',consolidation:'id'});
 await db.table('pals').put(pal);await db.table('consolidation').put({id:'read-only'});db.close();return db.name;
}
test('archive keeps raw unknown fields and indexes after final-copy rollback and fresh-instance retry',async()=>{
 const name=await legacy();const db=track(new PersonalDatabase('fence-target-'+crypto.randomUUID(),name));
 vi.spyOn(db.metadata,'add').mockRejectedValueOnce(new Error('final write failed'));
 await expect(db.ready()).rejects.toThrow('final write failed');
 expect(await db.pals.count()).toBe(0);expect(await db.metadata.count()).toBe(0);
 const archive=track(new Dexie(name));await archive.open();
 expect(await archive.table('legacyPals').where('speciesId').equals('unknown').first()).toEqual(pal);
 expect(archive.tables.map(t=>t.name).sort()).toEqual(['consolidation','legacyBases','legacyPals','legacyRoutes']);archive.close();db.close();
 const retry=track(new PersonalDatabase(db.name,name));await retry.ready();expect(await retry.pals.count()).toBe(1);
 await retry.write(async()=>{await retry.pals.update('p',{notes:'new authority'})});retry.close();
 const reopened=track(new PersonalDatabase(db.name,name));await reopened.ready();expect((await reopened.pals.get('p'))?.notes).toBe('new authority');
});
test('existing destination metadata does not bypass repairing the marker-only source',async()=>{
 const name=await legacy();const initial=track(new PersonalDatabase('fence-existing-'+crypto.randomUUID(),false));await initial.ready();
 await initial.pals.put({...pal,gender:'unknown',notes:'authoritative newer edit'});const meta=await initial.personalMetadata();initial.close();
 const repaired=track(new PersonalDatabase(initial.name,name));await repaired.ready();
 expect(await repaired.personalMetadata()).toEqual(meta);expect((await repaired.pals.get('p'))?.notes).toBe('authoritative newer edit');
 const archive=track(new Dexie(name));await archive.open();expect(archive.backendDB().version).toBe(Number.MAX_SAFE_INTEGER);
 expect(await archive.table('legacyPals').get('p')).toEqual(pal);
});
