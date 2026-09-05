import { expect, it } from 'vitest';
import { publicationSources, sourceChange } from './publication';
import { catalog } from '../../domain/catalog';
import { plan } from '../../domain/planner';
import type { Workspace } from '../../data/workspace';
it('publishes one allocated requirement without notes or inventory and keeps identity across changes', () => {
 const recipe = catalog.recipes[0];
 const data: Workspace = {version:1,goals:[{id:'personal-one',item:recipe.id,quantity:2,completed:0,notes:'PRIVATE'}],stock:{},recent:['PRIVATE']};
 const row=plan(catalog,data.goals,data.stock).direct[0];
 const sources=publicationSources(data);
 const shortage=sources.find(s=>s.kind==='shortage' && s.source===row.item)!;
 expect(shortage.quantity).toBe(row.contributions[0].missing);
 expect(JSON.stringify(sources)).not.toContain('PRIVATE');
 const changed=publicationSources({...data,stock:{[row.item]:1}}).find(s=>s.requirement===shortage.requirement)!;
 expect(changed.checksum).not.toBe(shortage.checksum);
 expect(sourceChange({source_requirement_id:shortage.requirement,snapshot_checksum:shortage.checksum,requested_quantity:shortage.quantity},[changed])).toBe('changed');
 expect(sourceChange({source_requirement_id:shortage.requirement},[])).toBe('removed');
 expect(sourceChange({source_requirement_id:'manual'},[])).toBeNull();
});
