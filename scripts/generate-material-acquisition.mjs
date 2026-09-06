import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { URL } from 'node:url';

const outputPath = new URL('../docs/research/material-acquisition.json', import.meta.url);
const evidencePath = new URL('../docs/research/material-acquisition-source.json', import.meta.url);
const evidence = JSON.parse(await readFile(evidencePath, 'utf8'));
const pages = [
  {title: 'Ice Organ', revision: 44461, timestamp: '2026-09-03T01:20:34Z', sha256: '18a148b6c6cf38d017d27e75523e0db6b2709a2c933345fa5384b4a4d05ed923'},
  {title: 'Pengullet', revision: 44345, timestamp: '2026-08-29T21:46:47Z', sha256: 'd1940080c2b36a462c7712f8ed018d392dbaaf3b86f710281e37edf7a157290c'},
  {title: 'Foxcicle', revision: 44028, timestamp: '2026-08-28T20:54:12Z', sha256: '1e1f72cc6d05dc2409bc5bca517ad868b3cf992fc0f91f512d485157997ae306'},
  {title: 'Mau Cryst', revision: 44458, timestamp: '2026-09-03T01:12:43Z', sha256: 'b7db56286ef1de5338de006afd141925d0b6064b1c44129190e59a217cd2018a'},
  {title: 'Duneshelter', revision: 20885, timestamp: '2025-04-21T10:28:35Z', sha256: '3341f37beaaa77bae429ce33fcaabb409aa1b1f9c257ddfb9ad9af302b1840bd'},
];
const sourceText = new Map();
for (const page of pages) {
  const apiUrl = `https://palworld.wiki.gg/api.php?action=query&prop=revisions&revids=${page.revision}&rvprop=ids%7Ctimestamp%7Ccontent&rvslots=main&format=json&formatversion=2`;
  const response = await globalThis.fetch(apiUrl, {headers: {'user-agent': 'PalworldCompanionAcquisitionResearch/0.1 (local catalog generator)'}});
  if (!response.ok) throw new Error(`Acquisition fetch failed: ${response.status}`);
  const revision = (await response.json())?.query?.pages?.[0]?.revisions?.[0];
  const text = revision?.slots?.main?.content;
  if (revision?.revid !== page.revision || revision.timestamp !== page.timestamp || typeof text !== 'string') throw new Error(`Acquisition revision mismatch: ${page.title}`);
  if (createHash('sha256').update(text).digest('hex') !== page.sha256) throw new Error(`Acquisition source digest mismatch: ${page.title}`);
  sourceText.set(page.title, text);
}
const wiki = title => `https://palworld.wiki.gg/wiki/${title.replaceAll(' ', '_')}`;
const oldid = (title, revision) => `${wiki(title)}?oldid=${revision}`;
const expectedIceUrl = oldid('Ice Organ', 44461);
if (evidence.schemaVersion !== 1 || evidence.reviewedSource?.url !== expectedIceUrl || evidence.palDrops?.length !== 29) throw new Error('Invalid reviewed acquisition evidence');
const palNames = evidence.palDrops.map(pal => pal.name);
if (new Set(palNames).size !== palNames.length || evidence.palDrops.some(pal => !pal.name || !pal.quantity || pal.chance !== '100%')) throw new Error('Invalid reviewed Pal drops');
if (!sourceText.get('Ice Organ').includes('{{Shops}}') || !sourceText.get('Ice Organ').includes('{{Drops}}')) throw new Error('Ice Organ transclusion markers missing');
const ranchLine = `Possible drop from {{I|${evidence.ranchPals[0]}}} and {{i|${evidence.ranchPals[1]}}} when assigned to a [[Ranch]].`;
if (!sourceText.get('Ice Organ').includes(ranchLine)) throw new Error('Ranch evidence mismatch');
for (const [name, page] of [['Pengullet', 'Pengullet'], ['Foxcicle', 'Foxcicle'], ['Mau Cryst', 'Mau Cryst']]) {
  const location = evidence.palDrops.find(pal => pal.name === name)?.location;
  if (!location || !location.split(',')[0].split(' and ')[0].split(' Mountains')[0] || !sourceText.get(page).includes(location.split(',')[0].split(' and ')[0])) throw new Error(`${name} habitat evidence mismatch`);
}
const duneshelter = evidence.merchants.find(merchant => merchant.name === 'Duneshelter Red Shirt Merchant');
if (!duneshelter || !sourceText.get('Duneshelter').includes(`Duneshelter''' (${duneshelter.coordinates})`)) throw new Error('Duneshelter coordinate evidence mismatch');
const mapUrl = name => `https://pindrop.gg/palworld/map?pal=${encodeURIComponent(name)}`;
const mapLocation = pal => pal.location ?? 'Open the filtered habitat map for exact spawn regions and points.';
const catalog = {
  schemaVersion: 1,
  source: {
    attribution: 'Palworld Wiki contributors',
    license: 'CC-BY-SA-4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
    pages: pages.map(page => ({...page, url: oldid(page.title, page.revision)})),
  },
  coverage: 'Selected detailed material guides; all other raw materials retain catalog source guidance.',
  materials: [{
    itemId: 'ice-organ',
    methods: [
      {
        id: 'ice-pal-drops', type: 'pal-drop', title: 'Pal drops',
        summary: `Capture or defeat one of the ${evidence.palDrops.length} Pals in the cited drop table. Normal and Alpha duplicates are combined.`,
        sourceUrl: expectedIceUrl,
        pals: evidence.palDrops.map(pal => ({...pal, location: mapLocation(pal), mapUrl: mapUrl(pal.name)})),
      },
      {
        id: 'duneshelter-merchant', type: 'merchant', title: 'Merchant',
        summary: `Buy Ice Organ for ${duneshelter.price} each from the ${duneshelter.name}. The cited item page also lists the Caravan Leader.`,
        location: `${duneshelter.location} · coordinates ${duneshelter.coordinates}`, sourceUrl: expectedIceUrl,
        mapUrl: oldid('Duneshelter', 20885),
      },
      {
        id: 'ranch-production', type: 'ranch', title: 'Ranch',
        summary: `Assign ${evidence.ranchPals.join(' and ')} to a Ranch for a chance to produce Ice Organ.`,
        location: 'Any player Ranch', sourceUrl: oldid('Ice Organ', 44461),
      },
    ],
  }],
};
await writeFile(outputPath, JSON.stringify(catalog, null, 2) + '\n');
globalThis.console.log(JSON.stringify({materials: catalog.materials.length, sources: pages.length, output: outputPath.pathname}, null, 2));
