import 'fake-indexeddb/auto';
import {render,screen,fireEvent,waitFor,cleanup,act} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import {PalWorkspace,BaseWorkspace} from './Workspaces';
import {PalDatabase,PalStore} from './storage';
afterEach(cleanup);
it('retains a newer draft when an earlier save finishes after live data refresh',async()=>{
 const store=new PalStore(new PalDatabase('ui-delayed-'+crypto.randomUUID()));
 const save=store.savePal.bind(store);
 let release!:()=>void;
 const gate=new Promise<void>(resolve=>{release=resolve;});
 vi.spyOn(store,'savePal').mockImplementation(async pal=>{await save(pal);await gate;});
 render(<PalWorkspace store={store}/>);
 await screen.findByText('No Pals yet. Add your first individual below.');
 fireEvent.change(screen.getByLabelText('Nickname'),{target:{value:'First'}});
 fireEvent.click(screen.getByRole('button',{name:'Save Pal'}));
 fireEvent.click(await screen.findByRole('button',{name:'Edit First'}));
 fireEvent.change(screen.getByLabelText('Nickname'),{target:{value:'Newer draft'}});
 expect(screen.getByRole('button',{name:'Save Pal'})).toBeDisabled();
 await act(async()=>{release();});
 await waitFor(()=>expect(screen.getByRole('button',{name:'Save Pal'})).toBeEnabled());
 expect(screen.getByLabelText('Nickname')).toHaveValue('Newer draft');
 cleanup();await store.db.delete();
});
it('creates, edits and archives a roster individual through accessible forms',async()=>{
 const store=new PalStore(new PalDatabase('ui-'+crypto.randomUUID()));render(<PalWorkspace store={store}/>);
 await screen.findByText('No Pals yet. Add your first individual below.');
 fireEvent.change(screen.getByLabelText('Nickname'),{target:{value:'Fluffy'}});fireEvent.click(screen.getByRole('button',{name:'Save Pal'}));
 await screen.findByRole('button',{name:'Edit Fluffy'});fireEvent.click(screen.getByRole('button',{name:'Edit Fluffy'}));
 fireEvent.change(screen.getByLabelText('Nickname'),{target:{value:'Fluff'}});
 await waitFor(()=>expect(screen.getByRole('button',{name:'Save Pal'})).toBeEnabled());
 expect(screen.getByLabelText('Nickname')).toHaveValue('Fluff');
 fireEvent.click(screen.getByRole('button',{name:'Save Pal'}));
 await waitFor(()=>expect(screen.getByRole('button',{name:'Archive Fluff'})).toBeEnabled());fireEvent.click(screen.getByRole('button',{name:'Archive Fluff'}));
 await waitFor(async()=>expect((await store.snapshot()).pals[0].archived).toBe(true));cleanup();await store.db.delete();
});
it('creates a base and persists an explicit simultaneous work slot',async()=>{
 const store=new PalStore(new PalDatabase('ui-base-'+crypto.randomUUID()));render(<BaseWorkspace store={store}/>);
 await screen.findByText('No bases yet. Create a base below.');
 fireEvent.change(screen.getByLabelText('Base name'),{target:{value:'North'}});fireEvent.click(screen.getByRole('button',{name:'Add work slot'}));fireEvent.click(screen.getByRole('button',{name:'Save base'}));
 await screen.findByRole('button',{name:'Edit North'});expect((await store.snapshot()).bases[0].slots).toHaveLength(1);cleanup();await store.db.delete();
});

it('saves a supported checklist and retains manual progress across remount',async()=>{
 const store=new PalStore(new PalDatabase('ui-route-'+crypto.randomUUID()));
 await store.savePal({id:'h',speciesId:'RedArmorBird',nickname:'Hawk',gender:'male',passives:[],notes:'',location:'',archived:false});
 await store.savePal({id:'c',speciesId:'ChickenPal',nickname:'Hen',gender:'female',passives:[],notes:'',location:'',archived:false});
 render(<PalWorkspace store={store} initialTargetSpeciesId="Ronin"/>);
 fireEvent.click(await screen.findByRole('button',{name:'Save route checklist'}));
 fireEvent.click(await screen.findByLabelText('Step 1 complete (manual)'));
 await waitFor(async()=>expect((await store.snapshot()).routes[0].completed).toHaveLength(1));cleanup();
 render(<PalWorkspace store={store}/>);expect(await screen.findByLabelText('Step 1 complete (manual)')).toBeChecked();cleanup();await store.db.delete();
});
it('shows a storage failure rather than pretending an empty roster loaded',async()=>{
 const store=new PalStore(new PalDatabase('ui-error-'+crypto.randomUUID()));
 store.db.close({disableAutoOpen:true});render(<PalWorkspace store={store}/>);
 expect(await screen.findByRole('alert')).toHaveTextContent('Storage unavailable');cleanup();await store.db.delete();
});
