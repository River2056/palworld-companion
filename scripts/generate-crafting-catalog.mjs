import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { URL } from 'node:url';

const revision = 42892;
const expectedSha256 = '304fe3f6e87773708288693d6a8fdb4f84d45c7ad28d95acda4430ac4e99bc84';
const apiUrl = `https://palworld.wiki.gg/api.php?action=query&prop=revisions&revids=${revision}&rvprop=ids%7Ctimestamp%7Ccontent&rvslots=main&format=json&formatversion=2`;
const pageUrl = 'https://palworld.wiki.gg/wiki/Module:DataManager/item_data.json';
const revisionUrl = `${pageUrl}?oldid=${revision}`;
const outputPath = new URL('../docs/research/crafting-catalog.json', import.meta.url);

const response = await globalThis.fetch(apiUrl, {headers: {'user-agent': 'PalworldCompanionCatalogResearch/0.1 (local catalog generator)'}});
if (!response.ok) throw new Error(`Catalog fetch failed: ${response.status}`);
const envelope = await response.json();
const fetchedRevision = envelope?.query?.pages?.[0]?.revisions?.[0];
if (fetchedRevision?.revid !== revision) throw new Error('Catalog revision mismatch');
const sourceText = fetchedRevision?.slots?.main?.content;
if (typeof sourceText !== 'string') throw new Error('Catalog source content missing');
const sha256 = createHash('sha256').update(sourceText).digest('hex');
if (sha256 !== expectedSha256) throw new Error('Catalog source digest mismatch');
const source = JSON.parse(sourceText);

const slug = name => name.toLowerCase().replaceAll(/[’']/g, '').replaceAll(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const parseInput = value => {
  const match = /^(.*)\*([0-9]+)$/.exec(value);
  if (!match || !source[match[1]] || !Number.isSafeInteger(Number(match[2])) || Number(match[2]) < 1) throw new Error(`Invalid recipe input: ${value}`);
  return {item: slug(match[1]), count: Number(match[2])};
};

const candidates = [];
for (const [name, item] of Object.entries(source)) {
  if (item.legal === false) continue;
  const holders = [['', item], ...Object.entries(item.variants ?? {})];
  for (const [variant, holder] of holders) {
    for (const recipe of holder.recipe ?? []) {
      if (!Array.isArray(recipe.materials) || recipe.materials.length === 0) continue;
      if (!Number.isSafeInteger(recipe.production_count) || recipe.production_count < 1) throw new Error(`Invalid output count: ${name}`);
      const inputs = recipe.materials.map(parseInput);
      const inputRanks = recipe.materials.map(value => source[value.replace(/\*[^*]+$/, '')]?.rank ?? 0);
      const isUpConversion = recipe.craft_exp_rate === 0 && inputRanks.every(rank => rank < (item.rank ?? 0));
      candidates.push({
        outputItemId: slug(name),
        inputs,
        output_count: recipe.production_count,
        stations: [],
        unlock_level: null,
        ...(variant ? {variant} : {}),
        ...(recipe.required_schematic ? {notes: `Requires ${recipe.required_schematic}.`} : {}),
        priority: recipe.craft_exp_rate === 0 ? (isUpConversion ? 1 : 2) : 0,
      });
    }
  }
}

const outputIds = new Set(candidates.map(recipe => recipe.outputItemId));
const allNames = new Map();
for (const [name, item] of Object.entries(source)) {
  if (item.legal === false) continue;
  const id = slug(name);
  const displayName = item.name ?? name;
  if (allNames.has(id)) throw new Error(`Item ID collision: ${allNames.get(id)} / ${displayName}`);
  allNames.set(id, displayName);
}

const edges = new Map([...outputIds].map(id => [id, new Set()]));
const createsCycle = (output, inputs) => {
  const reaches = (from, target, seen = new Set()) => {
    if (from === target) return true;
    if (seen.has(from)) return false;
    seen.add(from);
    return [...(edges.get(from) ?? [])].some(next => reaches(next, target, seen));
  };
  return inputs.some(({item}) => outputIds.has(item) && reaches(item, output));
};
const accepted = [];
const skippedCycles = [];
const ordered = [...candidates].sort((a, b) => a.priority - b.priority);
for (const candidate of ordered) {
  if (createsCycle(candidate.outputItemId, candidate.inputs)) {
    skippedCycles.push(candidate);
    continue;
  }
  accepted.push(candidate);
  const edge = edges.get(candidate.outputItemId);
  for (const {item} of candidate.inputs) if (outputIds.has(item)) edge.add(item);
}
const missingOutputs = [...outputIds].filter(id => !accepted.some(recipe => recipe.outputItemId === id));
for (const id of missingOutputs) outputIds.delete(id);
const sequence = new Map();
const recipes = accepted.map(candidate => {
  const recipe = globalThis.structuredClone(candidate);
  delete recipe.priority;
  const next = (sequence.get(recipe.outputItemId) ?? 0) + 1;
  sequence.set(recipe.outputItemId, next);
  const suffix = next === 1 ? '' : `--${slug(recipe.variant ?? `alternative-${next}`)}`;
  return {id: `${recipe.outputItemId}${suffix}`, ...recipe};
});
const duplicateRecipeIds = recipes.map(recipe => recipe.id).filter((id, index, ids) => ids.indexOf(id) !== index);
if (duplicateRecipeIds.length) throw new Error(`Recipe ID collision: ${duplicateRecipeIds[0]}`);

const referencedIds = new Set(recipes.flatMap(recipe => [recipe.outputItemId, ...recipe.inputs.map(input => input.item)]));
const items = [...referencedIds].map(id => ({id, name: allNames.get(id) ?? id, kind: outputIds.has(id) ? 'craftable' : 'raw'}));
const catalog = {
  schemaVersion: 1,
  source: {
    title: 'Palworld Wiki structured item data',
    url: pageUrl,
    revisionUrl,
    revision,
    sourceTimestamp: fetchedRevision.timestamp,
    sha256,
    attribution: 'Palworld Wiki contributors',
    license: 'CC-BY-SA-4.0',
  },
  notes: [
    'Recipe and item records are normalized from one pinned wiki data-module revision; this does not establish compatibility with a Palworld game patch.',
    'The source does not identify crafting stations or technology unlock levels, so those fields remain unknown.',
    `${skippedCycles.length} conversion alternatives that would introduce recipe dependency cycles are excluded; ${missingOutputs.length} cyclic-only output is treated as a raw acquisition boundary.`,
  ],
  items,
  recipes,
  defaultRecipeByItem: Object.fromEntries([...outputIds].map(id => [id, recipes.find(recipe => recipe.outputItemId === id).id])),
};
await writeFile(outputPath, JSON.stringify(catalog, null, 2) + '\n');
globalThis.console.log(JSON.stringify({items: items.length, craftableItems: outputIds.size, recipes: recipes.length, skippedCycles: skippedCycles.length, output: outputPath.pathname}, null, 2));
