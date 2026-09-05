import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test } from 'vitest';
import { catalog } from '../domain/catalog';
import { IngredientTree } from './IngredientTree';
test('expandable tree distinguishes per-run ratios and rounded branch output from shopping totals',async()=>{
 const user=userEvent.setup();render(<IngredientTree catalog={catalog} item="arrow" quantity={11}/>);
 await user.click(screen.getByText('Recipe ingredient tree'));
 await user.click(screen.getByText(/Arrow: 11 units/));
 expect(screen.getByText(/2 runs × 10 output = 20 units; 9 branch surplus/)).toBeVisible();
 expect(screen.getByText(/Wood: 2 per run; 2\/10 per output unit; 4 for this branch/)).toBeVisible();
});
test('unknown and cyclic branches stop with an explicit explanation',()=>{
 const c=structuredClone(catalog);c.recipes.find(r=>r.id==='arrow')!.inputs=[{item:'arrow',count:1},{item:'absent',count:1}];
 render(<IngredientTree catalog={c} item="arrow" quantity={1}/>);
 expect(screen.getByText(/Cycle blocked: Arrow/)).toBeInTheDocument();
 expect(screen.getByText(/Unknown ingredient: absent/)).toBeInTheDocument();
});
