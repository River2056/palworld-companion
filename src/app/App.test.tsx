import { render, screen } from '@testing-library/react';
import { beforeEach, expect, test } from 'vitest';
import userEvent from '@testing-library/user-event';
import App from './App';
import { workspaceStore } from '../data/workspace';
beforeEach(async()=>{await workspaceStore.reset();});
test('shows explicit selected catalog and game-version uncertainty', async () => { render(<App/>); expect(await screen.findByText(/Catalog: 10 reference recipes/)).toBeVisible(); });
test('navigates available destinations and preserves upcoming modules', async () => {
 const user=userEvent.setup(); render(<App/>); await user.click(screen.getByRole('link',{name:'Craft'}));
 expect(await screen.findByLabelText('Search recipes')).toBeVisible();
 await user.click(screen.getByRole('link',{name:'Settings'})); expect(await screen.findByText(/No account, telemetry, or cloud sync/)).toBeVisible();
 for(const name of ['Guild']) { expect(screen.getByText(name)).toBeVisible(); expect(screen.queryByRole('link',{name})).not.toBeInTheDocument(); expect(screen.queryByRole('button',{name})).not.toBeInTheDocument(); }
});
test('empty Today explains manual browser workspace',async()=>{render(<App/>); expect(await screen.findByText(/No plans yet/)).toBeVisible(); expect(screen.getByText(/No game connection/)).toBeVisible();});
test('fuzzy search, explicit selection, quantity, pin and progress-only completion',async()=>{
 const user=userEvent.setup(); window.location.hash='#/craft'; render(<App/>);
 await user.type(await screen.findByLabelText('Search recipes'),'arow'); await user.click(screen.getByRole('button',{name:'Select Arrow'}));
 const qty=screen.getByLabelText('Desired finished units'); await user.clear(qty); await user.type(qty,'11');
 expect(screen.getByText(/2 batches · 20 output · 9 surplus/)).toBeVisible(); await user.click(screen.getByRole('button',{name:'Pin craft goal'}));
 expect(await screen.findByRole('heading',{name:'Arrow · 0 / 11'})).toBeVisible();
 await user.click(screen.getByRole('button',{name:'Complete Arrow'})); expect(await screen.findByRole('heading',{name:'Arrow · 11 / 11'})).toBeVisible();
 expect((await workspaceStore.load()).stock).toEqual({});
});
