import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';
import { Craft } from './Craft';
import { Settings } from './Settings';
import { emptyWorkspace, workspaceStore } from '../data/workspace';

test('recent pins are newest first and padded aliases still resolve', async () => {
  const user = userEvent.setup();
  render(<Craft data={{...emptyWorkspace(), recent:['cloth','arrow']}} update={vi.fn()}/>);
  expect((await screen.findAllByRole('button',{name:/Select /})).slice(0,2).map(b=>b.textContent)).toEqual(['Cloth','Arrow']);
  await user.type(screen.getByLabelText('Search items and recipes'),'  sphere  ');
  await user.click(screen.getByRole('button',{name:'Select Pal Sphere'}));
  expect(screen.getByText(/Output per run:/)).toBeVisible();
});

test('search and pin use the complete known-recipe catalog, not the curated sample', async () => {
  const user = userEvent.setup();
  const update = vi.fn().mockResolvedValue(true);
  render(<Craft data={emptyWorkspace()} update={update}/>);
  await user.type(await screen.findByLabelText('Search items and recipes'), 'mega sphere');
  await user.click(screen.getByRole('button', {name: 'Select Mega Sphere'}));
  await user.click(screen.getByRole('button', {name: 'Pin craft goal'}));
  expect(update).toHaveBeenCalledWith(expect.objectContaining({
    goals: [expect.objectContaining({item: 'mega-sphere', quantity: 1})],
  }));
});

test('searching a material shows how it can be obtained', async () => {
  const user = userEvent.setup();
  render(<Craft data={emptyWorkspace()} update={vi.fn()}/>);
  await user.type(await screen.findByLabelText('Search items and recipes'), 'wood');
  await user.click(screen.getByRole('button', {name: 'Select Wood'}));
  expect(screen.getByRole('heading', {name: 'How to obtain Wood'})).toBeVisible();
  expect(screen.getByText('Material for structures and items. Can be obtained by cutting trees.')).toBeVisible();
  expect(screen.queryByRole('button', {name: 'Pin craft goal'})).not.toBeInTheDocument();
});

test('unresolved leaf recipe is disclosed; failed replacement retains preview and reset confirmation', async () => {
  const user = userEvent.setup(); const update=vi.fn().mockResolvedValue(false);
  const importFailure=vi.spyOn(workspaceStore,'import').mockRejectedValue(new Error('disk full'));
  render(<Settings data={emptyWorkspace()} update={update}/>);
  const backup={...emptyWorkspace(),goals:[{id:'g',item:'wood',quantity:1,completed:0,notes:''}]};
  await user.click(screen.getByLabelText('Backup JSON'));
  await user.paste(JSON.stringify(backup));
  await user.click(screen.getByRole('button',{name:'Preview import'}));
  expect(within(screen.getByRole('region',{name:'Import preview'})).getByText(/wood: 1 · legacy-unbound/)).toBeVisible();
  await user.click(screen.getByRole('button',{name:'Confirm replace'}));
  expect(screen.getByRole('region',{name:'Import preview'})).toBeVisible();
  expect(screen.getByLabelText('Backup JSON')).toHaveValue(JSON.stringify(backup));
  await user.click(screen.getByRole('button',{name:'Reset crafting workspace'}));
  await user.click(screen.getByRole('button',{name:'Confirm reset'}));
  expect(screen.getByRole('region',{name:'Reset confirmation'})).toBeVisible();
  expect(importFailure).toHaveBeenCalledWith(JSON.stringify(backup));importFailure.mockRestore();
});
