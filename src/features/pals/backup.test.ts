import 'fake-indexeddb/auto';
import {createElement} from 'react';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import {PalDatabase,PalStore,type PalSnapshot} from './storage';
import {createPalBackup,parsePalBackup,replacePalBackup,validatePalBackup} from './backup';
import {PalBackupPanel} from './BackupPanel';
const stores:PalStore[]=[];
function store(){const s=new PalStore(new PalDatabase('backup-'+crypto.randomUUID()));stores.push(s);return s;}
afterEach(async()=>{cleanup();vi.restoreAllMocks();await Promise.all(stores.splice(0).map(s=>s.db.delete()));});
const snapshot:PalSnapshot={pals:[{id:'p',speciesId:'unreleased-species',nickname:'Unknown',gender:'unknown',passives:['future-passive'],notes:'keep me',location:'box',archived:false}],bases:[{id:'b',name:'Home',capacity:1,workerIds:['p'],slots:[]}],routes:[{id:'r',targetId:'future-target',sourceVersion:'legacy',conditional:true,completed:['s'],steps:[{id:'s',pairId:'future-pair',childId:'future-target',parents:['owned:p','owned:removed'],conditional:true}]}]};
it('exports and imports all three stores with unknown IDs and missing original parents preserved',async()=>{
 const s=store();const backup=createPalBackup(snapshot,new Date('2026-01-01T00:00:00.000Z'));
 const preview=parsePalBackup(JSON.stringify(backup));
 expect(preview.warnings.join(' ')).toContain('unreleased-species');expect(preview.warnings.join(' ')).toContain('future-pair');expect(preview.warnings.join(' ')).toContain('owned:removed');
 await replacePalBackup(s,preview.backup);expect(await s.snapshot()).toEqual(snapshot);
 expect(createPalBackup(await s.snapshot(),new Date(backup.exportedAt))).toEqual(backup);
});
it('rejects malformed, duplicate and broken cross-reference imports before any writes',async()=>{
 const s=store();await replacePalBackup(s,createPalBackup(snapshot));
 const mutations=[(v:PalSnapshot)=>{v.pals[0].archived='no' as unknown as boolean;},(v:PalSnapshot)=>{v.pals.push(v.pals[0]);},(v:PalSnapshot)=>{v.bases[0].workerIds=['missing'];},(v:PalSnapshot)=>{v.routes[0].steps[0].parents[0]='step:missing';},(v:PalSnapshot)=>{v.routes[0].completed=['missing'];},(v:PalSnapshot)=>{v.bases[0].capacity=NaN;}];
 for(const mutate of mutations){const backup=createPalBackup(snapshot);mutate(backup.snapshot);await expect(replacePalBackup(s,backup)).rejects.toThrow();expect(await s.snapshot()).toEqual(snapshot);}
 expect(()=>validatePalBackup({schemaVersion:2})).toThrow();expect(()=>parsePalBackup('{')).toThrow();expect(()=>parsePalBackup(' '.repeat(10*1024*1024+1))).toThrow('10 MiB');
});
it('rolls back clears and puts when a later table write fails',async()=>{
 const s=store();await replacePalBackup(s,createPalBackup(snapshot));
 vi.spyOn(s.db.routes,'bulkPut').mockRejectedValueOnce(new Error('disk failure'));
 const changed=createPalBackup(snapshot);changed.snapshot.pals[0].nickname='replacement';
 await expect(replacePalBackup(s,changed)).rejects.toThrow('disk failure');expect(await s.snapshot()).toEqual(snapshot);
});
async function previewFile(){fireEvent.change(screen.getByLabelText('Preview Pal backup JSON (maximum 10 MiB)'),{target:{files:[{size:100,text:async()=>JSON.stringify(createPalBackup(snapshot))}]}});await screen.findByText('Import preview — no data changed');}
it('previews and cancels without writes, and requires explicit confirmation',async()=>{
 const s=store();render(createElement(PalBackupPanel,{store:s}));await previewFile();
 expect(screen.getByRole('button',{name:'Replace Pal data'})).toBeDisabled();expect(await s.snapshot()).toEqual({pals:[],bases:[],routes:[]});
 fireEvent.click(screen.getByRole('button',{name:'Cancel Pal import'}));expect(screen.queryByText('Import preview — no data changed')).not.toBeInTheDocument();expect(await s.snapshot()).toEqual({pals:[],bases:[],routes:[]});
});
it('keeps preview on restore failure and supports retry',async()=>{
 const s=store();render(createElement(PalBackupPanel,{store:s}));await previewFile();
 vi.spyOn(s.db.routes,'bulkPut').mockRejectedValueOnce(new Error('disk failure'));
 fireEvent.click(screen.getByRole('checkbox'));fireEvent.click(screen.getByRole('button',{name:'Replace Pal data'}));
 expect(await screen.findByRole('alert')).toHaveTextContent('disk failure');expect(screen.getByText('Import preview — no data changed')).toBeInTheDocument();expect(await s.snapshot()).toEqual({pals:[],bases:[],routes:[]});
 fireEvent.click(screen.getByRole('button',{name:'Replace Pal data'}));await waitFor(()=>expect(screen.getByRole('status')).toHaveTextContent('restored'));expect(await s.snapshot()).toEqual(snapshot);
});
