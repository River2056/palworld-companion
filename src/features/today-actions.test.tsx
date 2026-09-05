import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { Today } from './Today';
import { emptyWorkspace } from '../data/workspace';
import { palStore, type PalSnapshot } from './pals/storage';
import { catalog, speciesName, type Pal, type SavedRoute } from './pals/domain';

const pair=catalog.breedingPairs[0];
function fixture():PalSnapshot {
 const pals:Pal[]=pair.parentIds.map((speciesId,i)=>({id:`parent-${i}`,speciesId,nickname:`Parent ${i}`,gender:i===0?'male':'female',passives:[],notes:'',location:'',archived:false}));
 const route:SavedRoute={id:'saved-route',targetId:pair.childId,sourceVersion:catalog.catalogId,conditional:false,completed:['first'],steps:['first','second'].map(id=>({id,pairId:pair.id,childId:pair.childId,parents:['owned:parent-0','owned:parent-1'],conditional:false}))};
 return {pals,routes:[route],bases:[{id:'ore-base',name:'Ore Outpost',capacity:3,workerIds:[],slots:[{id:'mining-slot',work:'Mining',minimum:4,priority:8}]}]};
}
async function seed(snapshot:PalSnapshot) {
 await palStore.db.transaction('rw',palStore.db.pals,palStore.db.routes,palStore.db.bases,async()=>{
  await palStore.db.pals.bulkPut(snapshot.pals);await palStore.db.routes.bulkPut(snapshot.routes);await palStore.db.bases.bulkPut(snapshot.bases);
 });
}
function show(){return render(<Today data={emptyWorkspace()} update={vi.fn().mockResolvedValue(true)}/>);}
beforeEach(async()=>{await palStore.db.pals.clear();await palStore.db.routes.clear();await palStore.db.bases.clear();});
afterEach(()=>vi.restoreAllMocks());

test('nonempty snapshot names next incomplete child/target and named slot gaps with existing routes',async()=>{
 await seed(fixture());show();
 expect(await screen.findByText(`Next incomplete step 2: breed ${speciesName(pair.childId)} for target ${speciesName(pair.childId)}.`)).toBeVisible();
 expect(screen.getByText(/Ore Outpost: Mining · minimum level 4 · priority 8 · slot mining-slot is uncovered/)).toBeVisible();
 expect(screen.getByRole('link',{name:`Review saved route for ${speciesName(pair.childId)}`})).toHaveAttribute('href','#/breeding');
 expect(screen.getByRole('link',{name:'Review assignments for Ore Outpost'})).toHaveAttribute('href','#/bases');
 const before=await palStore.snapshot();
 await userEvent.click(screen.getByRole('link',{name:`Review saved route for ${speciesName(pair.childId)}`}));
 expect(await palStore.snapshot()).toEqual(before);
 expect(screen.getByText(/No plans yet/)).toBeVisible();
 expect(screen.getByText(/Guild data is not loaded on Today/)).toBeVisible();
});

test('live local writes update next action and distinguish manual completion from verified offspring',async()=>{
 const snapshot=fixture();await seed(snapshot);show();await screen.findByText(/Next incomplete step 2/);
 await act(async()=>{await palStore.saveRoute({...snapshot.routes[0],completed:['first','second']});});
 expect(await screen.findByText(/All saved steps marked complete manually; offspring and gender are not verified/)).toBeVisible();
 expect(screen.queryByText(/Next incomplete step/)).not.toBeInTheDocument();
});

test('empty routes and unconfigured base slots are not called complete',async()=>{
 const snapshot=fixture();snapshot.routes=[];snapshot.bases[0].slots=[];await seed(snapshot);show();
 expect(await screen.findByText(/No saved breeding routes/)).toBeVisible();
 expect(screen.getByText(/No work slots configured; coverage has not been assessed/)).toBeVisible();
});

test('zero steps and corrupt completion IDs report unknown progress without hiding other cards',async()=>{
 const snapshot=fixture();snapshot.routes[0].steps=[];
 snapshot.routes.push({...fixture().routes[0],id:'corrupt-checklist',completed:['ghost-step']});
 await seed(snapshot);show();
 expect(await screen.findByText(/Saved route saved-route has missing steps/)).toBeVisible();
 expect(screen.getByText(/Saved route corrupt-checklist has missing steps/)).toBeVisible();
 expect(screen.getByText(/slot mining-slot is uncovered/)).toBeVisible();
 expect(screen.queryByText(/All saved steps marked complete/)).not.toBeInTheDocument();
});

test('unknown saved species, pairs and parent/worker IDs remain visible and block clean completion claims',async()=>{
 const snapshot=fixture();const route=snapshot.routes[0];
 route.targetId='legacy-child';route.completed=['first','second'];
 route.steps.forEach(step=>{step.childId='legacy-child';step.pairId='legacy-pair';step.parents=['owned:lost-parent','owned:parent-1'];});
 snapshot.bases[0].workerIds=['lost-worker'];snapshot.bases[0].slots=[];
 await seed(snapshot);show();
 expect(await screen.findByRole('heading',{name:'Breeding target: Unknown species ID: legacy-child'})).toBeVisible();
 expect(screen.getByText('Unknown breeding pair ID: legacy-pair')).toBeVisible();
 expect(screen.getByText('Missing parent ID: owned:lost-parent')).toBeVisible();
 expect(screen.getByText('Missing worker ID: lost-worker')).toBeVisible();
 expect(screen.getByText(/Checklist marked complete, but saved references need review/)).toBeVisible();
 expect(screen.getByText(/Coverage is not confirmed/)).toBeVisible();
});

test('archived parents and unsupported work IDs stay actionable',async()=>{
 const snapshot=fixture();snapshot.pals[0].archived=true;
 snapshot.bases[0].workerIds=['parent-0'];snapshot.bases[0].slots[0].work='legacy-work';
 await seed(snapshot);show();
 expect(await screen.findByText('Archived parent: Parent 0 (owned:parent-0)')).toBeVisible();
 expect(screen.getByText('Archived worker: Parent 0 (parent-0)')).toBeVisible();
 expect(screen.getByText(/Ore Outpost: legacy-work/)).toBeVisible();
});

test('valid saved coverage is explicitly limited to configured slots',async()=>{
 const snapshot=fixture();const species=catalog.species.find(s=>s.id===snapshot.pals[0].speciesId)!;
 const work=Object.entries(species.workSuitability).find(([,level])=>level>0)![0];
 snapshot.bases[0].workerIds=['parent-0'];snapshot.bases[0].slots=[{id:'covered',work,minimum:1,priority:1}];
 await seed(snapshot);show();
 expect(await screen.findByText('All configured work slots covered by the saved assignments.')).toBeVisible();
});

test('read errors show unknown state, retain crafting, and can retry without writing personal data',async()=>{
 const read=vi.spyOn(palStore,'snapshot').mockRejectedValue(new Error('read denied'));
 show();expect(await screen.findByRole('alert')).toHaveTextContent('Personal progress and coverage are unknown');
 expect(screen.getByText(/No plans yet/)).toBeVisible();
 read.mockRestore();await userEvent.click(screen.getByRole('button',{name:'Retry personal summary'}));
 expect(await screen.findByText(/No saved breeding routes/)).toBeVisible();
 await waitFor(()=>expect(screen.queryByRole('alert')).not.toBeInTheDocument());
});
