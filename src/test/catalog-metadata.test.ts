// Offline contract checks, not legal clearance or proof of current-game accuracy.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { expect, test } from 'vitest';
import crafting from '../../docs/research/crafting-reference.json';
import completeCrafting from '../../docs/research/crafting-catalog.json';
import acquisition from '../../docs/research/material-acquisition.json';
import acquisitionEvidence from '../../docs/research/material-acquisition-source.json';
import pals from '../../docs/research/pal-reference.json';

type Row = Record<string, unknown>;
function check(ok: unknown, label: string): asserts ok { if (!ok) throw new Error(label); }
function row(v: unknown): Row { check(v !== null && typeof v === 'object' && !Array.isArray(v), 'object'); return v as Row; }
function list(v: unknown): unknown[] { check(Array.isArray(v) && v.length > 0, 'nonempty array'); return v; }
function text(v: unknown): string { check(typeof v === 'string' && v.trim().length > 0 && v === v.trim(), 'text'); return v; }
function integer(v: unknown, min = 1) { check(typeof v === 'number' && Number.isSafeInteger(v) && v >= min, 'integer'); }
function url(v: unknown): URL { const u = new URL(text(v)); check(u.protocol === 'https:' && !u.username && !u.password && !u.hash, 'https URL'); return u; }
function timestamp(v: unknown) { check(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(text(v)) && Number.isFinite(Date.parse(text(v))), 'timestamp'); }
function keys(v: Row, required: string[], optional: string[] = []) { check(required.every(k => k in v) && Object.keys(v).every(k => [...required, ...optional].includes(k)), 'schema keys'); }
function unique(values: string[]) { check(new Set(values).size === values.length, 'unique IDs'); }
function id(v: unknown, pattern = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/): string { const s = text(v); check(pattern.test(s), 'ID format'); return s; }
function strings(v: unknown) { return list(v).map(text); }

function wikiSource(value: unknown) {
  const s = row(value);
  keys(s, ['title', 'url', 'oldid', 'revision_url', 'revision_evidence', 'retrieved_at', 'attribution', 'license'], ['section']);
  text(s.title); text(s.revision_evidence); timestamp(s.retrieved_at);
  check(s.attribution === 'Palworld Wiki contributors' && s.license === 'CC-BY-SA-4.0', 'wiki license/attribution');
  const canonical = url(s.url);
  check(canonical.hostname === 'palworld.wiki.gg' && canonical.pathname.startsWith('/wiki/') && !canonical.search, 'wiki source URL');
  if (s.oldid === null) {
    check(s.revision_url === null && s.revision_evidence === 'not exposed by extraction', 'explicit unknown revision');
  } else {
    integer(s.oldid);
    const revision = url(s.revision_url);
    check(revision.origin === canonical.origin && revision.pathname === canonical.pathname && revision.search === `?oldid=${s.oldid}`, 'revision URL/ID match');
  }
  if ('section' in s) text(s.section);
}
function validateCrafting(value: unknown) {
  const c = row(value);
  keys(c, ['schema_version', 'purpose', 'patch_compatibility', 'verified_game_version', 'license', 'license_url', 'notes', 'recipes', 'leaf_materials']);
  check(c.schema_version === 1 && c.patch_compatibility === 'unverified' && c.verified_game_version === null, 'crafting compatibility decision');
  text(c.purpose); strings(c.notes);
  check(c.license === 'CC-BY-SA-4.0' && url(c.license_url).href === 'https://creativecommons.org/licenses/by-sa/4.0/', 'crafting license');
  const recipes = list(c.recipes).map(row), leaves = list(c.leaf_materials).map(row);
  const ids = [...recipes, ...leaves].map(r => id(r.id)); unique(ids);
  for (const r of [...recipes, ...leaves]) { text(r.name); wikiSource(r.source); check(r.patch_compatibility === 'unverified', 'record compatibility'); }
  for (const r of recipes) {
    keys(r, ['id', 'name', 'inputs', 'output_count', 'stations', 'stations_scope', 'unlock_level', 'patch_compatibility', 'source'], ['variant', 'unlock_source', 'notes']);
    integer(r.output_count); if (r.unlock_level !== null) integer(r.unlock_level);
    strings(r.stations); text(r.stations_scope);
    const inputs = list(r.inputs).map(row);
    unique(inputs.map(i => id(i.item)));
    for (const input of inputs) { keys(input, ['item', 'count']); integer(input.count); check(ids.includes(id(input.item)), 'ingredient reference'); }
    if ('unlock_source' in r) wikiSource(r.unlock_source);
    for (const k of ['variant', 'notes']) if (k in r) text(r[k]);
  }
  for (const l of leaves) { keys(l, ['id', 'name', 'acquisition', 'source', 'scope', 'patch_compatibility']); strings(l.acquisition); text(l.scope); }
}
const workKeys = ['Kindling', 'Watering', 'Planting', 'GenerateElectricity', 'Handiwork', 'Gathering', 'Lumbering', 'Mining', 'MedicineProduction', 'Cooling', 'Transporting', 'Farming'];
function validatePals(value: unknown) {
  const p = row(value);
  keys(p, ['schemaVersion', 'catalogId', 'compatibility', 'scope', 'sources', 'species', 'breedingPairs', 'exampleChains', 'counts']);
  check(p.schemaVersion === 1, 'Pal schema version'); id(p.catalogId, /^[a-z0-9.-]+$/);
  const compatibility = row(p.compatibility);
  keys(compatibility, ['status', 'inGameVerified', 'gamePatch', 'notice']);
  check(compatibility.status === 'unverified' && compatibility.inGameVerified === false && compatibility.gamePatch === null, 'Pal compatibility decision'); text(compatibility.notice);
  const scope = row(p.scope);
  keys(scope, ['breedingMode', 'fullOptimizer', 'missingPairMeans', 'parentOrderMatters', 'genderPolicy', 'workSuitabilityPolicy']);
  check(scope.breedingMode === 'explicit-pairs-only' && scope.fullOptimizer === false && scope.missingPairMeans === 'unsupported-not-impossible' && scope.parentOrderMatters === false, 'Pal scope decision');
  text(scope.genderPolicy); text(scope.workSuitabilityPolicy);
  const sources = list(p.sources).map(row);
  const sourceIds = sources.map(s => id(s.id)); unique(sourceIds);
  check([...sourceIds].sort().join(',') === 'palcalc-breeding,palcalc-license,palcalc-species', 'source IDs');
  const paths: Record<string, string> = { 'palcalc-species': 'PalCalc.Model/db.json', 'palcalc-breeding': 'PalCalc.Model/breeding.json', 'palcalc-license': 'LICENSE.txt' };
  for (const s of sources) {
    keys(s, ['id', 'project', 'author', 'url', 'repository', 'revision', 'releaseTag', 'databaseVersion', 'retrievedAt', 'sha256', 'license', 'licenseUrl', 'copyright']);
    for (const k of ['project', 'author', 'releaseTag', 'databaseVersion', 'copyright']) text(s[k]);
    check(/^[a-f0-9]{40}$/.test(text(s.revision)), 'full Git revision'); check(/^[a-f0-9]{64}$/.test(text(s.sha256)), 'SHA-256 format'); timestamp(s.retrievedAt);
    check(s.license === 'MIT' && s.copyright === 'Copyright 2024, Tyler Camp', 'Pal license notice');
    check(url(s.repository).href === 'https://github.com/tylercamp/palcalc', 'Pal repository');
    const root = `https://raw.githubusercontent.com/tylercamp/palcalc/${s.revision}/`;
    check(url(s.url).href === root + paths[text(s.id)] && url(s.licenseUrl).href === root + 'LICENSE.txt', 'pinned source/license URLs');
  }
  for (const k of ['revision', 'releaseTag', 'databaseVersion']) check(new Set(sources.map(s => s[k])).size === 1, 'single Pal snapshot');
  const species = list(p.species).map(row), pairs = list(p.breedingPairs).map(row), chains = list(p.exampleChains).map(row);
  const speciesIds = species.map(s => id(s.id, /^[A-Za-z][A-Za-z0-9_]*$/)); unique(speciesIds);
  const pairIds = pairs.map(s => id(s.id)); unique(pairIds); unique(chains.map(s => id(s.id)));
  for (const s of species) {
    keys(s, ['id', 'name', 'paldexNumber', 'isVariant', 'workSuitability', 'sourceId', 'sourcePointer']);
    text(s.name); integer(s.paldexNumber); check(typeof s.isVariant === 'boolean', 'variant');
    const work = row(s.workSuitability); keys(work, workKeys); Object.values(work).forEach(n => integer(n, 0));
    check(s.sourceId === 'palcalc-species' && /^\/Pals\/(0|[1-9]\d*)$/.test(text(s.sourcePointer)), 'species provenance');
  }
  for (const pair of pairs) {
    keys(pair, ['id', 'parentIds', 'childId', 'sourceId', 'sourcePointer', 'sourceParentGenders']);
    const parents = strings(pair.parentIds); check(parents.length === 2 && [...parents, text(pair.childId)].every(i => speciesIds.includes(i)), 'pair species references');
    check(pair.sourceId === 'palcalc-breeding' && /^\/Breeding\/(0|[1-9]\d*)$/.test(text(pair.sourcePointer)), 'pair provenance');
    check(pair.id === `palcalc-pair-${text(pair.sourcePointer).split('/')[2]}`, 'pair ID/pointer');
    const genders = strings(pair.sourceParentGenders); check(genders.length === 2 && genders.every(g => g === 'WILDCARD'), 'gender metadata');
  }
  for (const chain of chains) {
    keys(chain, ['id', 'startingSpeciesIds', 'stepPairIds', 'targetSpeciesId', 'note']); text(chain.note);
    const start = strings(chain.startingSpeciesIds); unique(start); check(start.every(i => speciesIds.includes(i)), 'chain species');
    const available = new Set(start);
    for (const step of strings(chain.stepPairIds)) {
      const pair = pairs.find(pair => pair.id === step); check(pair, 'chain pair reference');
      check(strings(pair.parentIds).every(i => available.has(i)), 'ordered chain prerequisites'); available.add(text(pair.childId));
    }
    check(speciesIds.includes(text(chain.targetSpeciesId)) && available.has(text(chain.targetSpeciesId)), 'chain target');
  }
  const counts = row(p.counts); keys(counts, ['species', 'breedingPairs', 'exampleChains']);
  for (const [k, records] of [['species', species], ['breedingPairs', pairs], ['exampleChains', chains]] as const) { integer(counts[k]); check(counts[k] === records.length, 'declared count'); }
}

function validateAcquisition(value: unknown) {
  const a = row(value); keys(a, ['schemaVersion', 'source', 'coverage', 'materials']); check(a.schemaVersion === 1, 'acquisition schema'); text(a.coverage);
  const source = row(a.source); keys(source, ['attribution', 'license', 'licenseUrl', 'pages']);
  check(source.attribution === 'Palworld Wiki contributors' && source.license === 'CC-BY-SA-4.0', 'acquisition attribution'); url(source.licenseUrl);
  const pages = list(source.pages).map(row); unique(pages.map(page => text(page.title)));
  for (const page of pages) { keys(page, ['title', 'revision', 'timestamp', 'sha256', 'url']); integer(page.revision); timestamp(page.timestamp); check(/^[a-f0-9]{64}$/.test(text(page.sha256)), 'acquisition digest'); const pinned=url(page.url); check(pinned.hostname === 'palworld.wiki.gg' && pinned.pathname.startsWith('/wiki/') && pinned.search === `?oldid=${page.revision}`, 'pinned acquisition URL'); }
  const declaredUrls = new Set(pages.map(page => text(page.url)));
  const rawIds = completeCrafting.items.filter(item => item.kind === 'raw').map(item => item.id);
  const materials = list(a.materials).map(row); unique(materials.map(material => id(material.itemId)));
  for (const material of materials) {
    check(rawIds.includes(id(material.itemId)), 'acquisition material reference');
    const methods = list(material.methods).map(row); unique(methods.map(method => id(method.id)));
    for (const method of methods) {
      keys(method, ['id', 'type', 'title', 'summary', 'sourceUrl'], ['location', 'mapUrl', 'pals']);
      check(['pal-drop', 'merchant', 'ranch', 'gathering', 'other'].includes(text(method.type)), 'acquisition type'); text(method.title); text(method.summary); check(declaredUrls.has(url(method.sourceUrl).href), 'declared method source');
      if ('location' in method) text(method.location);
      if ('mapUrl' in method) check(declaredUrls.has(url(method.mapUrl).href), 'declared method map');
      if ('pals' in method) for (const pal of list(method.pals).map(row)) { keys(pal, ['name', 'quantity', 'chance', 'location', 'mapUrl']); text(pal.name); text(pal.quantity); text(pal.chance); text(pal.location); const map=url(pal.mapUrl); check(map.hostname === 'pindrop.gg' && map.pathname === '/palworld/map' && map.searchParams.get('pal') === pal.name, 'filtered Pal map'); }
    }
  }
  const dropRows = list(row(list(materials[0].methods)[0]).pals).map(row);
  expect(dropRows.map(pal => ({name:pal.name,quantity:pal.quantity,chance:pal.chance}))).toEqual(acquisitionEvidence.palDrops.map(({name,quantity,chance})=>({name,quantity,chance})));
}

test('actual crafting schema and provenance retain the prototype decisions', () => validateCrafting(crafting));
test('actual Pal schema and provenance retain the prototype decisions', () => validatePals(pals));
test('detailed acquisition guides are pinned and reference raw catalog items', () => validateAcquisition(acquisition));
test.each([
  ['undeclared method source', (a: typeof acquisition) => { a.materials[0].methods[0].sourceUrl = 'https://example.test/source'; }],
  ['unfiltered Pal map', (a: typeof acquisition) => { a.materials[0].methods[0].pals![0].mapUrl = 'https://example.test/map'; }],
  ['undeclared merchant map', (a: typeof acquisition) => { a.materials[0].methods[1].mapUrl = 'https://example.test/map'; }],
  ['drop fact drift', (a: typeof acquisition) => { a.materials[0].methods[0].pals![0].quantity = '999'; }],
] as const)('rejects acquisition fixture with %s', (_name, mutate) => { const fixture=structuredClone(acquisition); mutate(fixture); expect(()=>validateAcquisition(fixture)).toThrow(); });

// Every mutation is a synthetic in-memory fixture, never a source record edit.
const craftingMutations: [string, (c: typeof crafting) => void][] = [
  ['duplicate ID', c => { c.leaf_materials[0].id = c.recipes[0].id; }],
  ['invalid ID', c => { c.recipes[0].id = ' Bad ID'; }],
  ['unresolved ingredient', c => { c.recipes[0].inputs[0].item = 'missing'; }],
  ['duplicate ingredient', c => { c.recipes[0].inputs.push(c.recipes[0].inputs[0]); }],
  ['empty recipes', c => { c.recipes = []; }],
  ['missing source field', c => { Reflect.deleteProperty(c.recipes[0].source, 'attribution'); }],
  ['unsafe URL', c => { c.recipes[0].source.url = 'javascript:alert(1)'; }],
  ['wrong license URL', c => { c.license_url = 'https://example.org/'; }],
  ['wrong license', c => { c.recipes[0].source.license = 'MIT'; }],
  ['mismatched revision', c => { c.recipes[0].source.oldid = 1; }],
  ['unexplained null revision', c => { c.leaf_materials[1].source.revision_evidence = ''; }],
  ['unpinned unlock pretends pinned', c => { Reflect.set(c.recipes[8].unlock_source!, 'oldid', 1); }],
  ['bad timestamp', c => { c.recipes[0].source.retrieved_at = 'yesterday'; }],
  ['unsupported patch claim', c => { c.patch_compatibility = 'verified'; }],
  ...[0, -1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1].flatMap(n => [
    [`input ${n}`, (c: typeof crafting) => { c.recipes[0].inputs[0].count = n; }],
    [`yield ${n}`, (c: typeof crafting) => { c.recipes[0].output_count = n; }],
  ] as [string, (c: typeof crafting) => void][]),
];
test.each(craftingMutations)('rejects synthetic crafting fixture: %s', (_name, mutate) => { const fixture = structuredClone(crafting); mutate(fixture); expect(() => validateCrafting(fixture)).toThrow(); });
const palMutations: [string, (p: typeof pals) => void][] = [
  ['duplicate species', p => { p.species[1].id = p.species[0].id; }],
  ['case-mismatched reference', p => { p.breedingPairs[0].parentIds[0] = 'anubis'; }],
  ['duplicate pair', p => { p.breedingPairs[1].id = p.breedingPairs[0].id; }],
  ['missing source', p => { p.sources.pop(); }],
  ['unknown source', p => { p.species[0].sourceId = 'missing'; }],
  ['missing license', p => { Reflect.deleteProperty(p.sources[0], 'license'); }],
  ['wrong license', p => { p.sources[0].license = 'CC-BY-SA-4.0'; }],
  ['unpinned source URL', p => { p.sources[0].url = p.sources[0].url.replace(p.sources[0].revision, 'main'); }],
  ['unpinned license URL', p => { p.sources[0].licenseUrl = 'https://example.org/LICENSE'; }],
  ['short revision', p => { p.sources[0].revision = 'deadbeef'; }],
  ['bad digest', p => { p.sources[0].sha256 = 'not-a-digest'; }],
  ['mixed database', p => { p.sources[0].databaseVersion = 'other'; }],
  ['bad timestamp', p => { p.sources[0].retrievedAt = 'not-a-date'; }],
  ['missing work key', p => { Reflect.deleteProperty(p.species[0].workSuitability, 'Farming'); }],
  ['negative work', p => { p.species[0].workSuitability.Farming = -1; }],
  ['fractional work', p => { p.species[0].workSuitability.Farming = 0.5; }],
  ['invalid Paldeck number', p => { p.species[0].paldexNumber = 0; }],
  ['invalid pointer', p => { p.species[0].sourcePointer = '/Pals/-1'; }],
  ['pair pointer mismatch', p => { p.breedingPairs[0].sourcePointer = '/Breeding/0'; }],
  ['missing parent', p => { p.breedingPairs[0].parentIds.pop(); }],
  ['wrong gender metadata', p => { p.breedingPairs[0].sourceParentGenders[0] = 'MALE'; }],
  ['unknown chain pair', p => { p.exampleChains[0].stepPairIds[0] = 'missing'; }],
  ['reversed chain', p => { p.exampleChains[0].stepPairIds.reverse(); }],
  ['wrong declared count', p => { p.counts.species += 1; }],
  ['unsupported verification', p => { p.compatibility.inGameVerified = true; }],
  ['unsupported optimizer', p => { p.scope.fullOptimizer = true; }],
  ['undocumented field', p => { Object.assign(p, { legalClearance: true }); }],
];
test.each(palMutations)('rejects synthetic Pal fixture: %s', (_name, mutate) => { const fixture = structuredClone(pals); mutate(fixture); expect(() => validatePals(fixture)).toThrow(); });

const read = (path: string) => readFileSync(path, 'utf8');
test('public attribution copies are complete and MIT notice is verbatim', () => {
  expect(read('public/notices/crafting-attribution.md')).toBe(read('docs/research/crafting-attribution.md'));
  expect(read('public/notices/material-acquisition-attribution.md')).toBe(read('docs/research/material-acquisition-attribution.md'));
  const palNotice = read('pal-attribution.md');
  expect(read('public/notices/pal-attribution.md')).toBe(palNotice);
  const fullMIT = palNotice.match(/```text\n([\s\S]*?)\n```/)?.[1];
  expect(fullMIT).toBeTruthy();
  expect(read('public/notices/PalCalc-MIT.txt')).toBe(fullMIT + '\n');
});
test('distributed attributions cover every actual source and license link', () => {
  const craftNotice = read('public/notices/crafting-attribution.md') + read('public/attribution.html');
  expect(completeCrafting.items.filter(item => item.kind === 'craftable')).toHaveLength(913);
  expect(completeCrafting.recipes).toHaveLength(1275);
  for (const field of ['url', 'revisionUrl', 'attribution', 'license'] as const) expect(craftNotice).toContain(String(completeCrafting.source[field]));
  expect(craftNotice).toContain(crafting.license_url);
  for (const source of [...crafting.recipes.map(r => r.source), ...crafting.leaf_materials.map(r => r.source), ...crafting.recipes.flatMap(r => r.unlock_source ? [r.unlock_source] : [])]) {
    expect(craftNotice).toContain(source.revision_url ?? source.url);
    expect(craftNotice).toContain(`${source.url}?action=history`);
    expect(craftNotice).toContain(source.attribution);
  }
  const palNotice = read('public/notices/pal-attribution.md');
  for (const source of pals.sources) {
    for (const field of ['url', 'licenseUrl', 'revision', 'copyright', 'author'] as const) expect(palNotice).toContain(source[field]);
  }
  const acquisitionNotice = read('public/notices/material-acquisition-attribution.md') + read('public/attribution.html');
  for (const page of acquisition.source.pages) expect(acquisitionNotice).toContain(page.url);
  expect(acquisitionNotice).toContain(acquisition.source.licenseUrl);
});
test('complete CC legal text is pinned and distribution index links all notices', () => {
  const license = readFileSync('public/notices/CC-BY-SA-4.0.txt');
  const manifest = JSON.parse(read('public/notices/license-provenance.json'));
  expect(manifest.url).toBe('https://creativecommons.org/licenses/by-sa/4.0/legalcode.txt');
  expect(createHash('sha256').update(license).digest('hex')).toBe(manifest.sha256);
  for (let section = 1; section <= 8; section++) expect(license.toString()).toContain(`Section ${section} --`);
  const index = read('public/attribution.html');
  for (const file of ['crafting-attribution.md', 'material-acquisition-attribution.md', 'pal-attribution.md', 'PalCalc-MIT.txt', 'CC-BY-SA-4.0.txt', 'license-provenance.json']) expect(index).toContain(`href="notices/${file}"`);
  expect(index).toContain('not legal clearance');
});
// Opt-in so normal tests cannot accidentally certify an old build.
test.runIf(process.env.VERIFY_CATALOG_DIST === '1')('built distribution preserves every notice byte-for-byte when requested', () => {
  for (const file of ['attribution.html', ...['crafting-attribution.md', 'material-acquisition-attribution.md', 'pal-attribution.md', 'PalCalc-MIT.txt', 'CC-BY-SA-4.0.txt', 'license-provenance.json'].map(f => `notices/${f}`)]) {
    expect(readFileSync(`dist/${file}`).equals(readFileSync(`public/${file}`)), file).toBe(true);
  }
});
