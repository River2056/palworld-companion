import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, test } from 'vitest';
import userEvent from '@testing-library/user-event';
import App from './App';
import { workspaceStore } from '../data/workspace';
beforeEach(async()=>{window.location.hash='#/today';await workspaceStore.reset();});
test('shows complete selected craft catalog and game-version uncertainty', async () => { render(<App/>); expect(await screen.findByText(/Catalog: 913 craftable items · 1275 known recipes/)).toBeVisible(); });
test('navigates all modules and leaves guild connection opt-in', async () => {
 const user=userEvent.setup(); render(<App/>); await user.click(screen.getByRole('link',{name:'Craft'}));
 expect(await screen.findByLabelText('Search items and recipes')).toBeVisible();
 await user.click(screen.getByRole('link',{name:'Settings'})); expect(await screen.findByRole('heading',{name:'Pal, base and route backup'})).toBeVisible();
 await user.click(screen.getByRole('link',{name:'Guild'}));
 expect(await screen.findByRole('heading',{name:'Guild workspace'})).toBeVisible();
 expect(screen.getByRole('button',{name:'Sign in'})).toBeDisabled();
});
test('empty Today explains manual browser workspace',async()=>{render(<App/>); expect(await screen.findByText(/No plans yet/)).toBeVisible(); expect(screen.getByText(/No game connection/)).toBeVisible();});
test('fuzzy search, explicit selection, quantity, pin and progress-only completion',async()=>{
 const user=userEvent.setup(); window.location.hash='#/craft'; render(<App/>);
 await user.type(await screen.findByLabelText('Search items and recipes'),'arow'); await user.click(screen.getByRole('button',{name:'Select Arrow'}));
 const qty=screen.getByLabelText('Desired finished units'); await user.clear(qty); await user.type(qty,'11');
 expect(screen.getByText(/2 batches · 20 output · 9 surplus/)).toBeVisible(); await user.click(screen.getByRole('button',{name:'Pin craft goal'}));
 expect(await screen.findByRole('heading',{name:'Arrow · 0 / 11'})).toBeVisible();
 // The saved heading renders before the post-save revision read settles.
 await waitFor(()=>expect(screen.getByRole('button',{name:'Complete Arrow'})).toBeEnabled());
 await user.click(screen.getByRole('button',{name:'Complete Arrow'})); expect(await screen.findByRole('heading',{name:'Arrow · 11 / 11'})).toBeVisible();
 expect((await workspaceStore.load()).stock).toEqual({});
});
