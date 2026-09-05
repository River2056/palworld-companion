import craftReference from '../../docs/research/crafting-reference.json';
import palReference from '../../docs/research/pal-reference.json';
import type { Catalog, Material, Source } from './catalog';

export type SnapshotId = `sha256:${string}`;
export type CatalogBinding = { state: 'bound'; snapshotId: SnapshotId } | { state: 'legacy-unbound'; claimedVersion?: string };
export type DeepReadonly<T> = T extends object ? { readonly [K in keyof T]: DeepReadonly<T[K]> } : T;
/** Extracted from the JSON, independent of UI/owned-Pal interfaces. */
export type PalCatalog = typeof palReference;
export interface ItemV2 extends Material { kind: 'raw' | 'craftable' }
export interface RecipeV2 {
  id: string; outputItemId: string; output_count: number;
  inputs: { item: string; count: number }[];
  stations: string[]; unlock_level: number | null;
  source: Source; notes?: string; variant?: string;
}
export interface CatalogV2 {
  items: ItemV2[]; recipes: RecipeV2[]; defaultRecipeByItem: Record<string, string>;
}
export interface CatalogManifest {
  datasetId: string; schemaVersion: 2; gameVersion: string | null; verificationStatus: string;
  sources: { url: string; revisionUrl: string | null; attribution: string; license: string; permissionStatus: string }[];
  notes?: string[];
}
export interface CatalogSnapshotPayload { manifest: CatalogManifest; craft: CatalogV2; pals: PalCatalog }
export type CatalogSnapshot = DeepReadonly<CatalogSnapshotPayload & { id: SnapshotId }>;

export interface RecipeSelection { recipeId?: string; recipeOverrides?: Readonly<Record<string, string>> }
export type RecipeResolution =
  | { status: 'raw'; item: DeepReadonly<ItemV2> }
  | { status: 'resolved'; item: DeepReadonly<ItemV2>; recipe: DeepReadonly<RecipeV2> }
  | { status: 'unresolved'; code: 'item-missing' | 'recipe-missing' | 'recipe-output-mismatch'; itemId: string; recipeId?: string };
/** Pass recipeId only at the root; intermediate callers pass only overrides. */
export function resolveRecipe(craft: DeepReadonly<CatalogV2>, itemId: string, selection: RecipeSelection = {}): RecipeResolution {
  const item = craft.items.find(i => i.id === itemId);
  if (!item) return { status: 'unresolved', code: 'item-missing', itemId };
  const explicit = Object.hasOwn(selection, 'recipeId') || Object.hasOwn(selection.recipeOverrides ?? {}, itemId);
  const recipeId = Object.hasOwn(selection, 'recipeId') ? selection.recipeId
    : Object.hasOwn(selection.recipeOverrides ?? {}, itemId) ? selection.recipeOverrides![itemId]
    : Object.hasOwn(craft.defaultRecipeByItem, itemId) ? craft.defaultRecipeByItem[itemId] : undefined;
  if (item.kind === 'raw' && !explicit) return { status: 'raw', item };
  const recipe = craft.recipes.find(r => r.id === recipeId);
  if (!recipe) return { status: 'unresolved', code: 'recipe-missing', itemId, ...(recipeId === undefined ? {} : { recipeId }) };
  if (recipe.outputItemId !== itemId || item.kind === 'raw') return { status: 'unresolved', code: 'recipe-output-mismatch', itemId, recipeId };
  return { status: 'resolved', item, recipe };
}

export const CANONICALIZATION_VERSION = 1 as const;
const unsafeKeys = new Set(['__proto__', 'constructor', 'prototype']);
function requireValue(ok: unknown, message: string): asserts ok { if (!ok) throw new Error(message); }

/** v1: UTF-16 key sort, JSON scalar encoding, array order unchanged; no Unicode normalization. */
export function canonicalJson(value: unknown): string {
  const ancestors = new Set<object>();
  function encode(v: unknown, depth: number): string {
    requireValue(depth <= 100, 'JSON nesting limit');
    if (v === null || typeof v === 'string' || typeof v === 'boolean') return JSON.stringify(v);
    if (typeof v === 'number') { requireValue(Number.isFinite(v) && !Object.is(v, -0), 'Non-JSON number'); return JSON.stringify(v); }
    requireValue(typeof v === 'object' && v !== null, 'Non-JSON value');
    requireValue(!ancestors.has(v), 'Cyclic JSON object');
    const prototype = Object.getPrototypeOf(v);
    requireValue(Array.isArray(v) ? prototype === Array.prototype : prototype === Object.prototype || prototype === null, 'Non-JSON object');
    ancestors.add(v);
    const keys = Reflect.ownKeys(v);
    for (const key of keys) {
      requireValue(typeof key === 'string' && !unsafeKeys.has(key), 'Unsafe JSON key');
      const descriptor = Object.getOwnPropertyDescriptor(v, key)!;
      requireValue('value' in descriptor && (descriptor.enumerable || (Array.isArray(v) && key === 'length')), 'Non-JSON property');
    }
    let result: string;
    if (Array.isArray(v)) {
      requireValue(keys.length === v.length + 1 && Array.from({ length: v.length }, (_, i) => Object.hasOwn(v, i)).every(Boolean), 'Sparse or extended JSON array');
      result = '[' + v.map(child => encode(child, depth + 1)).join(',') + ']';
    } else {
      result = '{' + Object.keys(v).sort().map(key => JSON.stringify(key) + ':' + encode((v as Record<string, unknown>)[key], depth + 1)).join(',') + '}';
    }
    ancestors.delete(v);
    return result;
  }
  return encode(value, 0);
}
export async function digestCanonicalJson(value: unknown): Promise<SnapshotId> {
  const bytes = new TextEncoder().encode(canonicalJson(value));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return `sha256:${Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('')}`;
}
function freeze<T>(value: T): DeepReadonly<T> {
  if (value !== null && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value as DeepReadonly<T>;
}
export async function createCatalogSnapshot(payload: DeepReadonly<CatalogSnapshotPayload>): Promise<CatalogSnapshot> {
  const copy: unknown = JSON.parse(canonicalJson(payload));
  validateSnapshotShape(copy);
  const id = await digestCanonicalJson(copy);
  return freeze({ id, ...copy });
}
export async function importCatalogSnapshot(value: unknown): Promise<CatalogSnapshot> {
  const copy = JSON.parse(canonicalJson(value)) as CatalogSnapshot;
  requireValue(typeof copy.id === 'string' && /^sha256:[a-f0-9]{64}$/.test(copy.id), 'Invalid snapshot ID');
  const { id, ...payload } = copy;
  const snapshot = await createCatalogSnapshot(payload);
  requireValue(snapshot.id === id, 'Snapshot digest mismatch');
  return snapshot;
}
export async function createBundledCatalogSnapshot(): Promise<CatalogSnapshot> {
  const payload = bundledSnapshotPayload();
  validateBundledCatalog(payload);
  return createCatalogSnapshot(payload);
}

export function bundledSnapshotPayload(): CatalogSnapshotPayload {
  const craft = normalizeCatalog(craftReference);
  return structuredClone({ manifest: {
    datasetId: `crafting-reference-v1+${palReference.catalogId}`,
    schemaVersion: 2 as const, gameVersion: null, verificationStatus: 'unverified',
    notes: [...craftReference.notes, palReference.compatibility.notice],
    sources: [
      ...[...craftReference.recipes, ...craftReference.leaf_materials].map(r => ({
        url: r.source.url, revisionUrl: r.source.revision_url,
        attribution: r.source.attribution, license: r.source.license,
        permissionStatus: 'License stated by source; public distribution approval remains a separate gate',
      })),
      ...palReference.sources.map(s => ({ url: s.repository, revisionUrl: s.url,
        attribution: `${s.author}; ${s.copyright}`, license: s.license,
        permissionStatus: 'MIT notice retained in pal-attribution.md; game assets and trademarks are not licensed by this assertion',
      })),
    ],
  }, craft, pals: palReference });
}

function record(value: unknown): Record<string, unknown> {
  requireValue(value !== null && typeof value === 'object' && !Array.isArray(value), 'Expected object');
  return value as Record<string, unknown>;
}
function list(value: unknown): unknown[] { requireValue(Array.isArray(value), 'Expected array'); return value; }
function text(value: unknown): asserts value is string { requireValue(typeof value === 'string' && value.trim().length > 0, 'Expected nonempty string'); }
function identity(value: unknown): asserts value is string { text(value); requireValue(!unsafeKeys.has(value), 'Unsafe identity'); }
function count(value: unknown, min = 0) { requireValue(typeof value === 'number' && Number.isSafeInteger(value) && value >= min, 'Unsafe quantity'); }
function texts(value: unknown) { list(value).forEach(text); }
function unique(values: unknown[]) {
  const ids = new Set<string>();
  values.forEach(value => { identity(value); requireValue(!ids.has(value), 'Duplicate identity'); ids.add(value); });
}
function source(value: unknown) {
  const s = record(value); ['url', 'attribution', 'license'].forEach(k => text(s[k]));
  if (s.revision_url !== null) text(s.revision_url);
}
/** Structural only: absent semantic references/defaults and dependency cycles are allowed. */
export function validateCatalogShape(value: unknown): asserts value is CatalogV2 {
  canonicalJson(value);
  const c = record(value), items = list(c.items), recipes = list(c.recipes);
  unique(items.map(i => record(i).id)); unique(recipes.map(r => record(r).id));
  for (const value of items) {
    const i = record(value); text(i.name); source(i.source);
    requireValue(i.kind === 'raw' || i.kind === 'craftable', 'Invalid item kind');
    for (const key of ['aliases', 'acquisition']) if (Object.hasOwn(i, key)) texts(i[key]);
  }
  for (const value of recipes) {
    const r = record(value); identity(r.outputItemId); count(r.output_count, 1); texts(r.stations); source(r.source);
    if (r.unlock_level !== null) count(r.unlock_level);
    for (const key of ['notes', 'variant']) if (Object.hasOwn(r, key)) text(r[key]);
    const inputs = list(r.inputs); requireValue(inputs.length > 0, 'Missing recipe inputs');
    unique(inputs.map(i => record(i).item)); inputs.forEach(i => count(record(i).count, 1));
  }
  for (const [item, recipe] of Object.entries(record(c.defaultRecipeByItem))) { identity(item); identity(recipe); }
}
/** Match the reference's structural schema, not its facts or array lengths. */
function palShape(value: unknown, template: unknown): void {
  if (template === null) { requireValue(value === null, 'Invalid Pal null field'); return; }
  if (Array.isArray(template)) { list(value).forEach(v => palShape(v, template[0])); return; }
  if (typeof template === 'object') {
    const v = record(value), t = record(template);
    requireValue(Object.keys(v).length === Object.keys(t).length, 'Invalid Pal fields');
    Object.keys(t).forEach(k => { requireValue(Object.hasOwn(v, k), 'Missing Pal field'); palShape(v[k], t[k]); });
  } else if (typeof template === 'number') count(value);
  else if (typeof template === 'string') text(value);
  else requireValue(typeof value === typeof template, 'Invalid Pal field type');
}
export function validateSnapshotShape(value: unknown): asserts value is CatalogSnapshotPayload {
  canonicalJson(value);
  const p = record(value);
  requireValue(Object.keys(p).sort().join(',') === 'craft,manifest,pals', 'Invalid snapshot payload fields');
  validateCatalogShape(p.craft);
  const m = record(p.manifest);
  requireValue(m.schemaVersion === 2, 'Unsupported manifest schema');
  text(m.datasetId); text(m.verificationStatus); if (m.gameVersion !== null) text(m.gameVersion);
  if (Object.hasOwn(m, 'notes')) texts(m.notes);
  list(m.sources).forEach(value => {
    const s = record(value); ['url', 'attribution', 'license', 'permissionStatus'].forEach(k => text(s[k]));
    if (s.revisionUrl !== null) text(s.revisionUrl);
  });
  palShape(p.pals, palReference);
  const pals = p.pals as PalCatalog;
  requireValue(pals.schemaVersion === 1, 'Unsupported Pal schema');
  [pals.species, pals.breedingPairs, pals.sources, pals.exampleChains].forEach(rows => unique(rows.map(r => r.id)));
  pals.species.forEach(s => { count(s.paldexNumber, 1); identity(s.sourceId); });
  pals.breedingPairs.forEach(pair => {
    requireValue(pair.parentIds.length === 2 && pair.sourceParentGenders.length === 2, 'Invalid Pal parent tuple');
    [...pair.parentIds, pair.childId, pair.sourceId].forEach(identity);
  });
  pals.exampleChains.forEach(chain => { [...chain.startingSpeciesIds, ...chain.stepPairIds, chain.targetSpeciesId].forEach(identity); });
}
/** Production gate: every alternative participates in the dependency graph. */
export function validateBundledCatalog(value: unknown): asserts value is CatalogSnapshotPayload {
  validateSnapshotShape(value);
  const { craft, pals } = value;
  const items = new Map(craft.items.map(i => [i.id, i]));
  const recipes = new Map(craft.recipes.map(r => [r.id, r]));
  const dependencies = new Map<string, Set<string>>();
  craft.recipes.forEach(r => {
    requireValue(items.get(r.outputItemId)?.kind === 'craftable', 'Missing or non-craftable recipe output');
    const edges = dependencies.get(r.outputItemId) ?? new Set<string>();
    r.inputs.forEach(i => { requireValue(items.has(i.item), 'Missing recipe dependency'); edges.add(i.item); });
    dependencies.set(r.outputItemId, edges);
  });
  for (const [itemId, recipeId] of Object.entries(craft.defaultRecipeByItem)) {
    requireValue(items.get(itemId)?.kind === 'craftable' && recipes.get(recipeId)?.outputItemId === itemId, 'Invalid default recipe output');
  }
  craft.items.forEach(i => { if (i.kind === 'craftable') requireValue(Object.hasOwn(craft.defaultRecipeByItem, i.id), 'Missing default recipe'); });
  // Iterative topological check avoids call-stack overflow on long imported graphs.
  const indegree = new Map(craft.items.map(i => [i.id, 0]));
  dependencies.forEach(edges => edges.forEach(id => indegree.set(id, indegree.get(id)! + 1)));
  const ready = [...indegree].filter(([, n]) => n === 0).map(([id]) => id);
  for (let index = 0; index < ready.length; index++) {
    dependencies.get(ready[index])?.forEach(id => { const n = indegree.get(id)! - 1; indegree.set(id, n); if (n === 0) ready.push(id); });
  }
  requireValue(ready.length === items.size, 'Recipe cycle');
  const species = new Set(pals.species.map(s => s.id)), pairs = new Set(pals.breedingPairs.map(p => p.id)), sources = new Set(pals.sources.map(s => s.id));
  pals.species.forEach(s => requireValue(sources.has(s.sourceId), 'Missing Pal source'));
  pals.breedingPairs.forEach(p => {
    requireValue([...p.parentIds, p.childId].every(id => species.has(id)), 'Missing Pal species');
    requireValue(sources.has(p.sourceId), 'Missing Pal source');
  });
  pals.exampleChains.forEach(c => {
    requireValue([...c.startingSpeciesIds, c.targetSpeciesId].every(id => species.has(id)) && c.stepPairIds.every(id => pairs.has(id)), 'Missing Pal chain reference');
  });
  requireValue(pals.counts.species === pals.species.length && pals.counts.breedingPairs === pals.breedingPairs.length && pals.counts.exampleChains === pals.exampleChains.length, 'Pal count mismatch');
}

export function normalizeCatalog(reference: Catalog): CatalogV2 {
  canonicalJson(reference);
  const normalized: CatalogV2 = structuredClone({
    items: [...reference.recipes.map(r => ({ id: r.id, name: r.name, source: r.source,
      ...(r.aliases ? { aliases: r.aliases } : {}), ...(r.acquisition ? { acquisition: r.acquisition } : {}), kind: 'craftable' as const })),
    ...reference.leaf_materials.map(m => ({ ...m, kind: 'raw' as const }))],
    recipes: reference.recipes.map(r => ({ ...r, outputItemId: r.id })),
    defaultRecipeByItem: Object.fromEntries(reference.recipes.map(r => [r.id, r.id])),
  });
  validateCatalogShape(normalized);
  return normalized;
}
