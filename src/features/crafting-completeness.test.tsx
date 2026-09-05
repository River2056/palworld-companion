import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';
import { Craft } from './Craft';
import { Shopping } from './Shopping';
import { emptyWorkspace } from '../data/workspace';

test('material disclosure shows queue-attributed reservations and shortages',async()=>{
 const user=userEvent.setup();
 render(<Shopping data={{...emptyWorkspace(),stock:{wood:3},goals:[{id:'a',item:'arrow',quantity:11,completed:0,notes:'first'},{id:'b',item:'arrow',quantity:11,completed:0,notes:'second'}]}}/>);
 const disclosure=screen.getAllByText('Contributing goals for Wood')[0].parentElement!;
 await user.click(screen.getAllByText('Contributing goals for Wood')[0]);
 expect(within(disclosure).getByText('Goal 1 · Arrow · first: Need 4 · Reserved 3 · Planned 0 · Missing 1')).toBeVisible();
 expect(within(disclosure).getByText('Goal 2 · Arrow · second: Need 2 · Reserved 0 · Planned 0 · Missing 2')).toBeVisible();
});

test('completed duplicate overflow is disabled and failed writes retain the choice',async()=>{
 const user=userEvent.setup();const update=vi.fn().mockResolvedValue(false);
 const original={id:'full',item:'arrow',quantity:Number.MAX_SAFE_INTEGER,completed:Number.MAX_SAFE_INTEGER,notes:''};
 render(<Craft data={{...emptyWorkspace(),goals:[original]}} update={update}/>);
 await user.click(screen.getByRole('button',{name:'Select Arrow'}));
 await user.click(screen.getByRole('button',{name:'Pin craft goal'}));
 expect(screen.getByRole('button',{name:/Increase existing goal/})).toBeDisabled();
 await user.click(screen.getByRole('button',{name:'Create separate pin'}));
 expect(screen.getByRole('region',{name:'Duplicate pin choice'})).toBeVisible();
 expect(update.mock.calls[0][0].goals[0]).toEqual(original);
});

test('duplicate pin explicitly increases a chosen goal preserving progress or creates a separate pin', async()=>{
 const user=userEvent.setup(); const update=vi.fn().mockResolvedValue(true);
 const original={id:'old',item:'arrow',quantity:11,completed:4,notes:'keep'};
 render(<Craft data={{...emptyWorkspace(),goals:[original]}} update={update}/>);
 await user.click(screen.getByRole('button',{name:'Select Arrow'}));
 await user.click(screen.getByRole('button',{name:'Pin craft goal'}));
 expect(update).not.toHaveBeenCalled();
 await user.click(screen.getByRole('button',{name:/Increase existing goal/}));
 expect(update.mock.calls[0][0].goals).toEqual([{...original,quantity:12}]);
 await user.click(screen.getByRole('button',{name:'Pin craft goal'}));
 await user.click(screen.getByRole('button',{name:'Create separate pin'}));
 expect(update.mock.calls[1][0].goals).toEqual([original,expect.objectContaining({item:'arrow',quantity:1,completed:0})]);
});
