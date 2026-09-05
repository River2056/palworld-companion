import { integer, validateCatalog, type Catalog } from './catalog';
export interface Goal { id: string; item: string; quantity: number; completed: number; notes: string }
export type Stock = Record<string, number>;
export interface Contribution { goalId: string; required: number; reserved: number; planned: number; missing: number }
export interface Row { item: string; required: number; have: number; reserved: number; planned: number; missing: number; contributions: Contribution[] }
export function plan(c: Catalog, queue: Goal[], stock: Stock) {
 validateCatalog(c); Object.values(stock).forEach(n => integer(n));
 let goalId = "";
 const recipes = new Map(c.recipes.map(r => [r.id,r]));
 const blocked: string[] = []; const steps: { item: string; batches: number; output: number }[] = [];
 const goals: { id: string; batches: number; output: number; surplus: number }[] = [];
 const ledger = new Map(Object.entries(stock)); const surplus = new Map<string,number>();
 const directSurplus = new Map<string,number>();
 const directLedger = new Map(Object.entries(stock)); const direct = new Map<string,Row>(); const raw = new Map<string,Row>();
 const add = (a: number,b: number) => integer(a+b); const mul = (a: number,b: number) => integer(a*b);
 function allocate(rows: Map<string,Row>, available: Map<string,number>, item: string, count: number, planned = 0) {
  const reserved = Math.min(available.get(item) ?? 0,count); available.set(item,(available.get(item) ?? 0)-reserved);
  const row = rows.get(item) ?? {item,required:0,have:stock[item] ?? 0,reserved:0,planned:0,missing:0,contributions:[]};
  const contribution = row.contributions.find(g=>g.goalId===goalId) ?? {goalId,required:0,reserved:0,planned:0,missing:0};
  if (!row.contributions.includes(contribution)) row.contributions.push(contribution);
  contribution.required=add(contribution.required,count+planned); contribution.reserved=add(contribution.reserved,reserved); contribution.planned=add(contribution.planned,planned); contribution.missing=add(contribution.missing,count-reserved);
  row.required=add(row.required,count+planned); row.reserved=add(row.reserved,reserved); row.planned=add(row.planned,planned); row.missing=add(row.missing,count-reserved); rows.set(item,row); return count-reserved;
 }
 function requireItem(item: string,count: number) {
  // Owned intermediates precede expansion; hypothetical surplus is a separate ledger.
  const owned = Math.min(ledger.get(item) ?? 0,count);
  const extra = Math.min(surplus.get(item) ?? 0,count-owned); surplus.set(item,(surplus.get(item) ?? 0)-extra);
  const remaining = allocate(raw,ledger,item,count-extra,extra);
  const r = recipes.get(item); if (!remaining || !r) return;
  const batches = integer(Math.ceil(remaining/r.output_count),1); const output=mul(batches,r.output_count);
  r.inputs.forEach(i => requireItem(i.item,mul(i.count,batches)));
  surplus.set(item,add(surplus.get(item) ?? 0,output-remaining)); steps.push({item,batches,output});
 }
 for (const goal of queue) {
  goalId=goal.id;
  integer(goal.quantity,1); integer(goal.completed); if(goal.completed>goal.quantity) throw new Error('Progress exceeds goal');
  const remaining=goal.quantity-goal.completed; if (!remaining) continue;
  const r=recipes.get(goal.item); if (!r) { blocked.push(goal.item); continue; }
  // Only planned excess can satisfy another craft-more target, never physical target stock.
  const reused=Math.min(surplus.get(goal.item)??0,remaining);
  surplus.set(goal.item,(surplus.get(goal.item)??0)-reused);
  const batches=integer(Math.ceil((remaining-reused)/r.output_count)); const output=mul(batches,r.output_count);
  goals.push({id:goal.id,batches,output,surplus:output-(remaining-reused)});
  const directReused=Math.min(directSurplus.get(goal.item)??0,remaining);
  const directBatches=integer(Math.ceil((remaining-directReused)/r.output_count));
  directSurplus.set(goal.item,(directSurplus.get(goal.item)??0)-directReused);
  r.inputs.forEach(i => {
    const count=mul(i.count,directBatches);
    const owned=Math.min(directLedger.get(i.item)??0,count);
    const extra=Math.min(directSurplus.get(i.item)??0,count-owned);
    directSurplus.set(i.item,(directSurplus.get(i.item)??0)-extra);
    if(count) allocate(direct,directLedger,i.item,count-extra,extra);
    if(batches) requireItem(i.item,mul(i.count,batches));
  });
  directSurplus.set(goal.item,add(directSurplus.get(goal.item)??0,mul(directBatches,r.output_count)-(remaining-directReused)));
  if(batches) steps.push({item:goal.item,batches,output});
  surplus.set(goal.item,add(surplus.get(goal.item) ?? 0,output-(remaining-reused)));
 }
 return {goals,direct:[...direct.values()],raw:[...raw.values()].filter(r => !recipes.has(r.item)),allocations:[...raw.values()],steps,blocked};
}
