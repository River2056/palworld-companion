import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';
import { Craft } from './Craft';
import { Settings } from './Settings';
import { emptyWorkspace } from '../data/workspace';

test('recent pins are newest first and padded aliases still resolve', async () => {
  const user = userEvent.setup();
  render(<Craft data={{...emptyWorkspace(), recent:['cloth','arrow']}} update={vi.fn()}/>);
  expect(screen.getAllByRole('button',{name:/Select /}).slice(0,2).map(b=>b.textContent)).toEqual(['Cloth','Arrow']);
  await user.type(screen.getByLabelText('Search recipes'),'  sphere  ');
  await user.click(screen.getByRole('button',{name:'Select Pal Sphere'}));
  expect(screen.getByText(/Output per run:/)).toBeVisible();
});

test('unresolved leaf recipe is disclosed; failed replacement retains preview and reset confirmation', async () => {
  const user = userEvent.setup(); const update=vi.fn().mockResolvedValue(false);
  render(<Settings data={emptyWorkspace()} update={update}/>);
  const backup={...emptyWorkspace(),goals:[{id:'g',item:'wood',quantity:1,completed:0,notes:''}]};
  await user.click(screen.getByLabelText('Backup JSON'));
  await user.paste(JSON.stringify(backup));
  await user.click(screen.getByRole('button',{name:'Preview import'}));
  expect(within(screen.getByRole('region',{name:'Import preview'})).getByText(/Unknown records retained: wood/)).toBeVisible();
  await user.click(screen.getByRole('button',{name:'Confirm replace workspace'}));
  expect(screen.getByRole('region',{name:'Import preview'})).toBeVisible();
  expect(screen.getByLabelText('Backup JSON')).toHaveValue(JSON.stringify(backup));
  await user.click(screen.getByRole('button',{name:'Reset local data'}));
  await user.click(screen.getByRole('button',{name:'Confirm delete all data'}));
  expect(screen.getByRole('alertdialog')).toBeVisible();
});
