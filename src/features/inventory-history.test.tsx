import 'fake-indexeddb/auto';
import { useState } from 'react';
import { render, screen, within, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi, afterEach, beforeEach } from 'vitest';
import { emptyWorkspace, WorkspaceStore, type Workspace } from '../data/workspace';
import { Inventory, Queue } from './Queue';
import { plan } from '../domain/planner';
import { catalog } from '../domain/catalog';
import {loadCatalogRuntime, type CatalogRuntime} from './catalog-runtime';
let runtime:CatalogRuntime;
beforeEach(async()=>{runtime=await loadCatalogRuntime();});
const bound=(item:string)=>({catalogBinding:{state:'bound' as const,snapshotId:runtime.metadata.selectedCatalog},recipeId:item});

// Public seams: inventory/queue actions -> whole-workspace save -> reload and planner.
function WorkspaceHarness({initial, store}: {initial: Workspace; store: WorkspaceStore}) {
  const [data, setData] = useState(initial);
  const [error, setError] = useState('');
  const update = async (next: Workspace) => {
    try { await store.save(next); setData(await store.load()); setError(''); return true; }
    catch { setError('Save failed'); return false; }
  };
  return <>{error && <p role="alert">{error}</p>}<Queue data={data} update={update}/><Inventory data={data} update={update}/></>;
}

afterEach(() => vi.restoreAllMocks());

test('failed completion keeps the active goal and partial progress can explicitly finish it', async () => {
  const user = userEvent.setup();
  const store = new WorkspaceStore('partial-history-' + crypto.randomUUID());
  const initial: Workspace = {...emptyWorkspace(), goals: [{...bound('arrow'), id: 'g', item: 'arrow', quantity: 11, completed: 4, notes: 'Partial'}], stock: {wood: 0}};
  try {
    await store.save(initial);
    render(<WorkspaceHarness initial={initial} store={store}/>);
    const save = vi.spyOn(store, 'save').mockRejectedValueOnce(new Error('disk full'));
    await user.click(await screen.findByRole('button', {name: 'Complete Arrow'}));
    await screen.findByRole('alert');
    expect(await store.load()).toEqual(initial);
    expect(within(screen.getByRole('region', {name: 'Active craft goals'})).getByRole('heading', {name: 'Arrow · 4 / 11'})).toBeVisible();
    expect(within(screen.getByRole('region', {name: 'Completed goal history'})).getByText('No completed goals yet.')).toBeVisible();
    save.mockRestore();
    await user.click(screen.getByText('Edit Arrow / partial progress'));
    await user.clear(screen.getByLabelText('Completed units'));
    await user.type(screen.getByLabelText('Completed units'), '11');
    await user.click(screen.getByRole('button', {name: 'Save goal'}));
    await waitFor(() => expect(within(screen.getByRole('region', {name: 'Completed goal history'})).getByRole('heading', {name: 'Arrow · 11 / 11'})).toBeVisible());
    expect((await store.load()).stockUpdatedAt).toBeUndefined();
    expect((await store.load()).stock).toEqual({wood: 0});
  } finally { await store.delete(); }
});

test('priority changes skip retained history; unknown completed recipes can reopen without data loss', async () => {
  const user = userEvent.setup();
  const store = new WorkspaceStore('history-priority-' + crypto.randomUUID());
  const first = {...bound('arrow'), id: 'a', item: 'arrow', quantity: 1, completed: 0, notes: 'First'};
  const unknown = {...bound('future-recipe'), id: 'h', item: 'future-recipe', quantity: 2, completed: 2, notes: 'Retain unknown'};
  const last = {...bound('cloth'), id: 'b', item: 'cloth', quantity: 1, completed: 0, notes: 'Last'};
  const initial: Workspace = {...emptyWorkspace(), goals: [first, unknown, last]};
  try {
    await store.save(initial);
    render(<WorkspaceHarness initial={initial} store={store}/>);
    expect(await screen.findByRole('button', {name: 'Move Arrow up'})).toBeDisabled();
    expect(screen.getByRole('button', {name: 'Move Cloth down'})).toBeDisabled();
    await user.click(screen.getByRole('button', {name: 'Move Cloth up'}));
    await waitFor(() => expect(screen.getByRole('button', {name: 'Move Cloth up'})).toBeDisabled());
    expect((await store.load()).goals).toEqual([last, unknown, first]);
    await user.click(screen.getByRole('button', {name: 'Reopen future-recipe (progress only)'}));
    await waitFor(() => expect(screen.getByText('Unresolved goal retained. Review diagnostics in Craft; legacy adoption is in Settings.')).toBeVisible());
    const saved = await store.load();
    expect(saved.goals).toEqual([last, {...unknown, completed: 0}, first]);
    expect(plan(catalog, saved.goals, saved.stock).blocked).toEqual(['future-recipe']);
    expect(saved.stockUpdatedAt).toBeUndefined();
  } finally { await store.delete(); }
});

test('saving an unchanged zero count refreshes only that entry; invalid counts never write', async () => {
  const update = vi.fn().mockResolvedValue(true);
  const data: Workspace = {...emptyWorkspace(), stock: {wood: 0, stone: 4}, stockUpdatedAt: {wood: '2020-01-01T00:00:00.000Z'}};
  render(<Inventory data={data} update={update}/>);
  const form = (await screen.findByLabelText('Wood stock')).closest('form')!;
  fireEvent.change(screen.getByLabelText('Wood stock'), {target: {value: '-1'}});
  fireEvent.submit(form);
  expect(update).not.toHaveBeenCalled();
  expect(screen.getByRole('alert')).toHaveTextContent('Stock must be a nonnegative safe whole number.');
  fireEvent.change(screen.getByLabelText('Wood stock'), {target: {value: '0'}});
  fireEvent.submit(form);
  expect(update).toHaveBeenCalledTimes(1);
  const saved: Workspace = update.mock.calls[0][0];
  expect(saved.stock).toEqual(data.stock);
  expect(saved.stockUpdatedAt!.wood).not.toBe(data.stockUpdatedAt!.wood);
  expect(Number.isFinite(Date.parse(saved.stockUpdatedAt!.wood))).toBe(true);
  expect(saved.stockUpdatedAt!.stone).toBeUndefined();
  expect(data.stockUpdatedAt!.wood).toBe('2020-01-01T00:00:00.000Z');
});

test('complete -> history -> reload -> reopen preserves the goal and stock while recomputing allocations', async () => {
  const user = userEvent.setup();
  const store = new WorkspaceStore('history-ui-' + crypto.randomUUID());
  const original = {...bound('arrow'), id: 'first', item: 'arrow', quantity: 11, completed: 0, notes: 'Keep this goal'};
  const second = {...bound('arrow'), id: 'second', item: 'arrow', quantity: 11, completed: 0, notes: 'Next goal'};
  const initial: Workspace = {...emptyWorkspace(), goals: [original, second], stock: {wood: 3}, stockUpdatedAt: {wood: '2026-09-05T00:00:00.000Z'}};
  const wood = (data: Workspace) => plan(catalog, data.goals, data.stock).direct.find(row => row.item === 'wood');
  try {
    await store.save(initial);
    let view = render(<WorkspaceHarness initial={await store.load()} store={store}/>);
    expect(wood(initial)).toMatchObject({required: 6, reserved: 3, missing: 3});
    await user.click((await screen.findAllByRole('button', {name: 'Complete Arrow'}))[0]);
    await waitFor(() => expect(within(screen.getByRole('region', {name: 'Completed goal history'})).getByText('Keep this goal')).toBeVisible());
    const completed = await store.load();
    expect(completed.goals).toEqual([{...original, completed: 11}, second]);
    expect(completed.stock).toEqual(initial.stock);
    expect(completed.stockUpdatedAt).toEqual(initial.stockUpdatedAt);
    expect(wood(completed)).toMatchObject({required: 4, reserved: 3, missing: 1, contributions: [{goalId: 'second', reserved: 3, missing: 1}]});
    view.unmount();
    view = render(<WorkspaceHarness initial={await store.load()} store={store}/>);
    const history = await screen.findByRole('region', {name: 'Completed goal history'});
    expect(within(history).getByText('Keep this goal')).toBeVisible();
    expect(within(history).getByText(/resets completed units to zero/)).toBeVisible();
    expect(within(history).queryByRole('button', {name: 'Save goal'})).not.toBeInTheDocument();
    const save = vi.spyOn(store, 'save').mockRejectedValueOnce(new Error('disk full'));
    await user.click(within(history).getByRole('button', {name: 'Reopen Arrow (progress only)'}));
    await screen.findByRole('alert');
    expect(await store.load()).toEqual(completed);
    expect(within(history).getByText('Keep this goal')).toBeVisible();
    save.mockRestore();
    await user.click(within(history).getByRole('button', {name: 'Reopen Arrow (progress only)'}));
    await waitFor(() => expect(within(screen.getByRole('region', {name: 'Completed goal history'})).getByText('No completed goals yet.')).toBeVisible());
    expect(await store.load()).toEqual(initial);
    expect(wood(await store.load())).toMatchObject({required: 6, reserved: 3, missing: 3, contributions: [{goalId: 'first', reserved: 3, missing: 1}, {goalId: 'second', reserved: 0, missing: 2}]});
    view.unmount();
    render(<WorkspaceHarness initial={await store.load()} store={store}/>);
    expect(await screen.findAllByRole('button', {name: 'Complete Arrow'})).toHaveLength(2);
  } finally { await store.delete(); }
});

test('manual save timestamps only the edited entry; failed save keeps old count and timestamp for retry', async () => {
  const store = new WorkspaceStore('inventory-ui-' + crypto.randomUUID());
  const initial: Workspace = {...emptyWorkspace(), stock: {wood: 3, stone: 4, 'future-material': 7}, stockUpdatedAt: {stone: '2026-09-05T00:00:00.000Z'}};
  try {
    await store.save(initial);
    render(<WorkspaceHarness initial={await store.load()} store={store}/>);
    expect(await screen.findByText(/Stale manual counts can misstate shortages/)).toBeVisible();
    expect(within(screen.getByLabelText('Wood stock').closest('form')!).getByText(/Last updated: Unknown/)).toBeVisible();
    expect(within(screen.getByLabelText('Stone stock').closest('form')!).getByText('2026-09-05T00:00:00.000Z')).toHaveAttribute('datetime', '2026-09-05T00:00:00.000Z');
    const save = vi.spyOn(store, 'save').mockRejectedValueOnce(new Error('disk full'));
    fireEvent.change(screen.getByLabelText('Wood stock'), {target: {value: '8'}});
    fireEvent.click(screen.getByRole('button', {name: 'Save Wood stock'}));
    await screen.findByRole('alert');
    expect(await store.load()).toEqual(initial);
    expect(within(screen.getByLabelText('Wood stock').closest('form')!).getByText(/Last updated: Unknown/)).toBeVisible();
    save.mockRestore();
    const before = Date.now();
    fireEvent.click(screen.getByRole('button', {name: 'Save Wood stock'}));
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    const saved = await store.load();
    expect(saved.stock).toEqual({wood: 8, stone: 4, 'future-material': 7});
    expect(Date.parse(saved.stockUpdatedAt!.wood)).toBeGreaterThanOrEqual(before);
    expect(Date.parse(saved.stockUpdatedAt!.wood)).toBeLessThanOrEqual(Date.now());
    expect(saved.stockUpdatedAt!.stone).toBe(initial.stockUpdatedAt!.stone);
    expect(saved.stockUpdatedAt!['future-material']).toBeUndefined();
    expect(within(screen.getByLabelText('Wood stock').closest('form')!).getByText(saved.stockUpdatedAt!.wood)).toBeVisible();
  } finally { await store.delete(); }
});
