import reference from '../../docs/research/crafting-reference.json';
export interface Source { url: string; revision_url: string | null; attribution: string; license: string }
export interface Material { id: string; name: string; source: Source; acquisition?: string[]; aliases?: string[] }
export interface Recipe extends Material { inputs: { item: string; count: number }[]; output_count: number; stations: string[]; unlock_level: number | null; notes?: string; variant?: string }
export interface Catalog { recipes: Recipe[]; leaf_materials: Material[] }
export function integer(n: number, minimum = 0): number { if (!Number.isSafeInteger(n) || n < minimum) throw new Error('Counts must be safe whole numbers'); return n; }
export function validateCatalog(c: Catalog) {
 const items = [...c.recipes, ...c.leaf_materials]; const ids = new Set<string>();
 for (const item of items) { if (!item.id || ids.has(item.id)) throw new Error('Duplicate or empty item ID'); ids.add(item.id); }
 const recipes = new Map(c.recipes.map(r => [r.id, r]));
 for (const r of c.recipes) { integer(r.output_count, 1); if (!r.inputs.length) throw new Error('Missing inputs'); const used = new Set<string>(); for (const i of r.inputs) { integer(i.count, 1); if (!ids.has(i.item) || used.has(i.item)) throw new Error('Missing or duplicate dependency'); used.add(i.item); } }
 const done = new Set<string>();
 function visit(id: string, path: Set<string>) { if (path.has(id)) throw new Error('Recipe cycle'); if (done.has(id)) return; const next = new Set(path).add(id); recipes.get(id)?.inputs.forEach(i => visit(i.item, next)); done.add(id); }
 c.recipes.forEach(r => visit(r.id, new Set()));
}
export const catalog: Catalog = reference;
validateCatalog(catalog);
export const materials = [...catalog.recipes, ...catalog.leaf_materials];
export const itemName = (id: string) => materials.find(i => i.id === id)?.name ?? `Unknown: ${id}`;
