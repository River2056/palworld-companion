import { render, screen } from '@testing-library/react';
import { expect, test } from 'vitest';
import userEvent from '@testing-library/user-event';

test('navigates only to available destinations and marks future modules upcoming', async () => {
  const user = userEvent.setup();
  render(<App />);
  await user.click(screen.getByRole('link', { name: 'Craft' }));
  expect(await screen.findByRole('heading', { name: 'Craft' })).toBeInTheDocument();
  expect(screen.getByText('Crafting workspace is not available yet.')).toBeInTheDocument();
  await user.click(screen.getByRole('link', { name: 'Settings' }));
  expect(await screen.findByRole('heading', { name: 'Settings' })).toBeInTheDocument();
  expect(screen.getByText(/No account, telemetry, or cloud sync/)).toBeInTheDocument();
  for (const name of ['Breeding', 'Base', 'Guild']) {
    expect(screen.getByText(name)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
  }
});
import App from './App';
test('opens an honest empty Today dashboard with privacy guidance', () => {
  render(<App />);
  expect(screen.getByRole('heading', { name: 'Today' })).toBeInTheDocument();
  expect(screen.getByText('Your next adventure starts here.')).toBeInTheDocument();
  expect(screen.getByText(/No plans yet/)).toBeInTheDocument();
  expect(screen.getByText(/No game connection/)).toBeInTheDocument();
});
