import type { Workspace } from '../../data/workspace';
import { catalog, itemName } from '../../domain/catalog';
import { plan } from '../../domain/planner';
import type { Task } from './client';
export interface PublicationSource { kind: 'pin' | 'shortage'; title: string; source: string; requirement: string; checksum: string; quantity: number }
const prefix = 'personal:v1:';
/** A projection, not a workspace export. Notes and owned quantities never leave this boundary. */
export function publicationSources(data: Workspace): PublicationSource[] {
 const allocation = plan(catalog, data.goals, data.stock);
 const sources: PublicationSource[] = [];
 function add(kind: PublicationSource['kind'], goal: string, item: string, quantity: number) {
  const requirement = prefix + JSON.stringify([goal,kind,item]);
  if (!quantity || requirement.length > 300 || item.length > 200) return;
  // Versioned exact quantity snapshot; identity already binds goal, kind and item.
  sources.push({kind,title:`${kind === 'pin' ? 'Craft' : 'Gather'} ${itemName(item)}`.slice(0,200),source:item,requirement,checksum:`quantity-v1:${quantity}`,quantity});
 }
 for (const goal of data.goals) if (goal.completed < goal.quantity && catalog.recipes.some(r=>r.id===goal.item)) add('pin',goal.id,goal.item,goal.quantity);
 for (const row of allocation.direct) for (const contribution of row.contributions) add('shortage',contribution.goalId,row.item,contribution.missing);
 return sources;
}
export function sourceChange(task: Pick<Task,'source_requirement_id'|'snapshot_checksum'|'requested_quantity'>, sources: PublicationSource[]): 'changed' | 'removed' | null {
 if (!task.source_requirement_id?.startsWith(prefix)) return null;
 const source = sources.find(s=>s.requirement===task.source_requirement_id);
 if (!source) return 'removed';
 return source.checksum !== task.snapshot_checksum || source.quantity !== task.requested_quantity ? 'changed' : null;
}
