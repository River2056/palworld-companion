import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { Settings } from './Settings';
import { emptyWorkspace, workspaceStore } from '../data/workspace';
import { createBundledCatalogSnapshot } from '../domain/catalog-snapshot';

vi.mock('./CatalogMigrationPanel',()=>({CatalogMigrationPanel:()=>null}));
afterEach(()=>vi.restoreAllMocks());
const backup=(item:string)=>JSON.stringify({...emptyWorkspace(),goals:[{id:item,item,quantity:1,completed:0,notes:''}]});
function setup() {
 const update=vi.fn().mockResolvedValue(false);
 render(<Settings data={emptyWorkspace()} update={update}/>);
 const input=screen.getByLabelText('Backup JSON');
 const preview=()=>fireEvent.click(screen.getByRole('button',{name:'Preview import'}));
 const type=(source:string)=>fireEvent.change(input,{target:{value:source}});
 return {update,input,preview,type};
}
function delayedFile(name='new.json') {
 let resolve!:(value:string)=>void, reject!:(error:Error)=>void;
 const promise=new Promise<string>((yes,no)=>{resolve=yes;reject=no;});
 const file=new File(['deferred'],name,{type:'application/json'});
 Object.defineProperty(file,'text',{value:()=>promise});
 fireEvent.change(screen.getByLabelText('Import JSON file'),{target:{files:[file]}});
 return {resolve:async(value:string)=>act(async()=>{resolve(value);await promise;}),reject:async()=>act(async()=>{reject(new Error('read failed'));await promise.catch(()=>{});})};
}

test('a pending file invalidates old preview and cannot authorize new bytes',async()=>{
 const {type,preview,input}=setup();type(backup('arrow'));preview();
 const file=delayedFile();
 expect(screen.queryByRole('region',{name:'Import preview'})).not.toBeInTheDocument();
 expect(screen.getByRole('button',{name:'Preview import'})).toBeDisabled();
 preview();await file.resolve(backup('nail'));
 expect(input).toHaveValue(backup('nail'));
 expect(screen.queryByRole('button',{name:'Confirm replace'})).not.toBeInTheDocument();
 preview();expect(screen.getByRole('region',{name:'Import preview'})).toHaveTextContent('nail: 1');
});

test('typing supersedes a pending read and its eventual completion preserves newer consent',async()=>{
 const {type,preview,input}=setup();const file=delayedFile();
 type(backup('arrow'));preview();await file.resolve(backup('nail'));
 expect(input).toHaveValue(backup('arrow'));
 expect(screen.getByRole('region',{name:'Import preview'})).toHaveTextContent('arrow: 1');
 type(backup('wood'));expect(screen.queryByRole('button',{name:'Confirm replace'})).not.toBeInTheDocument();
});

test('older reads and errors cannot overwrite a newer file selection',async()=>{
 const {input,preview}=setup();const old=delayedFile('old.json');const latest=delayedFile();
 await latest.resolve(backup('nail'));preview();await old.resolve(backup('arrow'));
 expect(input).toHaveValue(backup('nail'));
 expect(screen.getByRole('region',{name:'Import preview'})).toHaveTextContent('nail: 1');
 const failing=delayedFile('failure.json');const newer=delayedFile();await newer.resolve(backup('wood'));await failing.reject();
 expect(input).toHaveValue(backup('wood'));expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

test('failed reads retain the prior input but require fresh review',async()=>{
 const {type,preview,input}=setup();type(backup('arrow'));preview();const file=delayedFile();await file.reject();
 expect(input).toHaveValue(backup('arrow'));expect(screen.getByRole('alert')).toHaveTextContent('read failed');
 expect(screen.queryByRole('button',{name:'Confirm replace'})).not.toBeInTheDocument();
 expect(screen.getByRole('button',{name:'Preview import'})).toBeEnabled();
});

test('cancel performs no writes; reset and import consent cannot carry across input changes',()=>{
 const save=vi.spyOn(workspaceStore,'import');const {type,preview,update}=setup();
 type(backup('arrow'));preview();fireEvent.click(screen.getByRole('button',{name:'Cancel import'}));
 expect(save).not.toHaveBeenCalled();expect(update).not.toHaveBeenCalled();
 expect(screen.queryByRole('button',{name:'Confirm replace'})).not.toBeInTheDocument();
 preview();fireEvent.click(screen.getByRole('button',{name:'Reset crafting workspace'}));
 expect(screen.queryByRole('button',{name:'Confirm replace'})).not.toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:'Cancel reset'}));expect(update).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'Reset crafting workspace'}));type(backup('nail'));
 expect(screen.queryByRole('button',{name:'Confirm reset'})).not.toBeInTheDocument();
});

test('failed save retries the exact reviewed schema-2 envelope, not just parsed workspace',async()=>{
 const save=vi.spyOn(workspaceStore,'import').mockRejectedValue(new Error('disk full'));
 const {type,preview,input}=setup();
 const snapshot=await createBundledCatalogSnapshot();
 const workspace=JSON.parse(backup('arrow'));
 workspace.goals[0].catalogBinding={state:'bound',snapshotId:snapshot.id};
 const source=JSON.stringify({schemaVersion:2,scope:'craft',workspace,snapshots:[snapshot],missingSnapshotIds:[]},null,2);
 type(source);preview();
 await act(async()=>{fireEvent.click(screen.getByRole('button',{name:'Confirm replace'}));});
 expect(screen.getByRole('alert')).toHaveTextContent('disk full');expect(input).toHaveValue(source);
 expect(screen.getByRole('region',{name:'Import preview'})).toHaveTextContent('arrow: 1');
 await act(async()=>{fireEvent.click(screen.getByRole('button',{name:'Confirm replace'}));});
 expect(save.mock.calls).toEqual([[source],[source]]);
});
