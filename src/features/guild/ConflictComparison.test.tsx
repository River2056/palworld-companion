import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ConflictComparison } from './ConflictComparison';
import type { Task, TaskInput } from './client';

afterEach(cleanup);
const task:Task=Object.freeze({id:'t',title:'Server title',status:'open',assignee:null,revision:3,requested_quantity:8,delivered_quantity:2});
const input:TaskInput=Object.freeze({p_guild:'g',p_action:'claim',p_task:'t',p_revision:1,p_title:null,p_status:null,p_source:null,p_checksum:null,p_key:'rejected-key'});
function setup(current:Task=task, changes:Partial<TaskInput>={}, owner=false, disabled=false) {
 const proposal={kind:'task' as const,input:Object.freeze({...input,...changes})};
 const onConfirm=vi.fn();
 const onDiscard=vi.fn();
 render(<ConflictComparison proposal={proposal} tasks={[current]} stock={[]} owner={owner} user="signed-in-actor" disabled={disabled} onConfirm={onConfirm} onDiscard={onDiscard}/>);
 return {onConfirm,onDiscard,proposal};
}
function values(heading:string) {
 return JSON.parse(screen.getByRole('heading',{name:heading}).nextElementSibling!.textContent!);
}
function consent() { fireEvent.click(screen.getByRole('checkbox')); }
function reapply() { return screen.getByRole('button',{name:'Confirm and reapply'}); }

it.each([false,true])('renders the signed-in claim intent for owner=%s and requires an explicit reapply without mutating inputs', owner => {
 const {onConfirm,onDiscard,proposal}=setup(task,{},owner);
 expect(values('Current server values')).toEqual(task);
 expect(values('Proposed values')).toEqual({...task,assignee:'signed-in-actor',status:'doing'});
 expect(reapply()).toBeDisabled();
 expect(onConfirm).not.toHaveBeenCalled();
 consent();
 expect(onConfirm).not.toHaveBeenCalled();
 expect(reapply()).toBeEnabled();
 fireEvent.click(reapply());
 expect(onConfirm).toHaveBeenCalledTimes(1);
 expect(reapply()).toBeDisabled();
 expect(onDiscard).not.toHaveBeenCalled();
 expect(task).toMatchObject({assignee:null,status:'open',revision:3});
 expect(proposal.input).toEqual(input);
});

it.each([
 {...task,assignee:'another-member',status:'doing' as const},
 {...task,status:'done' as const},
 {...task,status:'cancelled' as const},
])('keeps claim reapply disabled for latest assignment/status $assignee/$status', current => {
 const {onConfirm}=setup(Object.freeze(current));
 expect(values('Current server values')).toEqual(current);
 expect(values('Proposed values')).toEqual({...current,assignee:'signed-in-actor',status:'doing'});
 expect(screen.getByText(/cannot be reapplied with your current role or task state/)).toBeVisible();
 consent();
 expect(reapply()).toBeDisabled();
 fireEvent.click(reapply());
 expect(onConfirm).not.toHaveBeenCalled();
 expect(values('Current server values')).toEqual(current);
});

it('can review a newly released claim without inheriting a previous actor', () => {
 const released=Object.freeze({...task,status:'open' as const,assignee:null,revision:4});
 setup(released);
 expect(values('Current server values')).toEqual(released);
 expect(values('Proposed values')).toEqual({...released,assignee:'signed-in-actor',status:'doing'});
 consent();
 expect(reapply()).toBeEnabled();
});

it.each(['open','cancelled'] as const)('renders an owner update to %s without treating it as a claim release', status => {
 const current=Object.freeze({...task,assignee:'another-member',status:'doing' as const});
 const {onConfirm}=setup(current,{p_action:'update',p_status:status,p_title:'Edited'},true);
 expect(values('Current server values')).toEqual(current);
 expect(values('Proposed values')).toEqual({...current,title:'Edited',status});
 consent();
 expect(reapply()).toBeEnabled();
 expect(onConfirm).not.toHaveBeenCalled();
});

it('does not grant update permission to a non-owner who is not the assignee', () => {
 const {onConfirm}=setup({...task,assignee:'another-member'},{p_action:'update',p_status:'cancelled'});
 consent();
 expect(reapply()).toBeDisabled();
 fireEvent.click(reapply());
 expect(onConfirm).not.toHaveBeenCalled();
});

it('keeps disconnected/busy comparison read-only', () => {
 const {onConfirm}=setup(task,{},false,true);
 expect(screen.getByRole('checkbox')).toBeDisabled();
 expect(reapply()).toBeDisabled();
 fireEvent.click(reapply());
 expect(onConfirm).not.toHaveBeenCalled();
});

it('discards a rejected claim without confirming or changing the loaded task', () => {
 const {onConfirm,onDiscard}=setup();
 fireEvent.click(screen.getByRole('button',{name:'Discard rejected proposal'}));
 expect(onDiscard).toHaveBeenCalledTimes(1);
 expect(onConfirm).not.toHaveBeenCalled();
 expect(values('Current server values')).toEqual(task);
});
