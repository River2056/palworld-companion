# Crafting catalog attribution

**Patch compatibility: unverified.** The runtime catalog contains 913 craftable outputs, 1,275 recipes and 199 acquisition boundaries normalized from the Palworld Wiki structured item-data module at revision 42892 (2026-08-12). It covers every legal item with a usable recipe in that source except one cyclic-only conversion output. It is not a claim of every game item, current-patch compatibility, or in-game verification.

## Attribution and reuse

Recipe and item facts were normalized from **Palworld Wiki contributors** on [Palworld Wiki](https://palworld.wiki.gg/). Wiki page content is offered under [Creative Commons Attribution–ShareAlike 4.0](https://creativecommons.org/licenses/by-sa/4.0/) unless otherwise noted. This research adaptation is offered under the same license. See the [pinned data module](https://palworld.wiki.gg/wiki/Module:DataManager/item_data.json?oldid=42892) and its [contributor history](https://palworld.wiki.gg/wiki/Module:DataManager/item_data.json?action=history). No endorsement by the wiki or Pocketpair is implied. Palworld names and underlying game content remain the property of their respective owners.

Changes: retained English item names, converted names into stable lowercase-hyphen identifiers, separated output items from recipe variants, retained ingredient counts and batch yields, and omitted descriptions, images and unrelated item fields. The source does not identify stations or technology unlock levels, so those remain unknown. Thirteen alternatives that would create dependency cycles are excluded; Giant Pal Soul is treated as an acquisition boundary because its only recipe would close such a cycle. The reproducible transform is `scripts/generate-crafting-catalog.mjs`; it verifies the pinned source SHA-256 before writing `docs/research/crafting-catalog.json`. This license statement covers the research adaptation, not unrelated application code.

## Interpretation and limitations

- Each input count is consumed once per batch; `output_count` is the resulting batch yield. Do not treat 1 Ingot → 2 Nails or 2 Ingot + 1 Gunpowder → 20 Coarse Ammo as one-output recipes.
- Acquisition boundaries mean the selected recipe graph stops there, not that an item is impossible to craft or obtain another way.
- Null unlocks and empty station lists mean unknown/not established by this structured source. Fuel, work suitability, construction costs and inventory are outside scope.
- Wiki `oldid` pins the data-module revision. It is not a game patch identifier.

## Historical curated reference

The earlier 10-recipe/7-material mixed-revision research remains below as provenance for `crafting-reference.json` and legacy tests. It is no longer the runtime catalog.
- Retrieval began 2026-09-05 UTC (2026-09-06 Taiwan time). Extraction services can return cached or partial text. Browser/direct requests encountered Cloudflare/403; successful extraction results were used instead.
- Ingot 31174, Pal Sphere 31056 and Arrow 41963 were verified by the parent researcher and supplied in task context; this worker's attempts at those pinned URLs failed. Other recipe quantities were read from successfully fetched pages.
- Nail quantities were extracted from its canonical page; revision 31177 was independently exposed by web search, not a successful pinned-page fetch. Cloth quantities/station come from Wool revision 44444, with unlock level from the unpinned Cloth page (which warns it needs updating).
- Arrow canonical extraction returned an older revision 31125 with yield 3, whereas the selected parent-verified revision 41963 uses 2 Wood + 2 Stone → 10. Parent reports its history describes a 1.0 change from 1 Wood + 1 Stone → 3. That is source history, **not** a current-game compatibility claim.

## Recipe source index

| Record | Source / revision | Contributor history |
|---|---|---|
| Ingot | [Ingot / 31174](https://palworld.wiki.gg/wiki/Ingot?oldid=31174) | [History](https://palworld.wiki.gg/wiki/Ingot?action=history) |
| Nail | [Nail / 31177](https://palworld.wiki.gg/wiki/Nail?oldid=31177) | [History](https://palworld.wiki.gg/wiki/Nail?action=history) |
| Crossbow | [Crossbow / 38995](https://palworld.wiki.gg/wiki/Crossbow?oldid=38995) | [History](https://palworld.wiki.gg/wiki/Crossbow?action=history) |
| Charcoal | [Charcoal / 31186](https://palworld.wiki.gg/wiki/Charcoal?oldid=31186) | [History](https://palworld.wiki.gg/wiki/Charcoal?action=history) |
| Gunpowder | [Gunpowder / 31143](https://palworld.wiki.gg/wiki/Gunpowder?oldid=31143) | [History](https://palworld.wiki.gg/wiki/Gunpowder?action=history) |
| Coarse Ammo | [Coarse Ammo / 41978](https://palworld.wiki.gg/wiki/Coarse_Ammo?oldid=41978) | [History](https://palworld.wiki.gg/wiki/Coarse_Ammo?action=history) |
| Arrow | [Arrow / 41963](https://palworld.wiki.gg/wiki/Arrow?oldid=41963) | [History](https://palworld.wiki.gg/wiki/Arrow?action=history) |
| Pal Sphere | [Pal Sphere / 31056](https://palworld.wiki.gg/wiki/Pal_Sphere?oldid=31056) | [History](https://palworld.wiki.gg/wiki/Pal_Sphere?action=history) |
| Cloth | [Wool / 44444](https://palworld.wiki.gg/wiki/Wool?oldid=44444) | [History](https://palworld.wiki.gg/wiki/Wool?action=history) |
| Fire Arrow | [Fire Arrow / 41965](https://palworld.wiki.gg/wiki/Fire_Arrow?oldid=41965) | [History](https://palworld.wiki.gg/wiki/Fire_Arrow?action=history) |

Cloth unlock: [Cloth](https://palworld.wiki.gg/wiki/Cloth), revision unavailable in extraction.

## Leaf acquisition sources

- **Wood**: [Wood](https://palworld.wiki.gg/wiki/Wood?oldid=38840); revision 38840; [contributors](https://palworld.wiki.gg/wiki/Wood?action=history).
- **Stone**: [Stone](https://palworld.wiki.gg/wiki/Stone); revision not exposed; [contributors](https://palworld.wiki.gg/wiki/Stone?action=history).
- **Ore**: [Ore](https://palworld.wiki.gg/wiki/Ore); revision not exposed; [contributors](https://palworld.wiki.gg/wiki/Ore?action=history).
- **Wool**: [Wool](https://palworld.wiki.gg/wiki/Wool?oldid=44444); revision 44444; [contributors](https://palworld.wiki.gg/wiki/Wool?action=history).
- **Sulfur**: [Sulfur](https://palworld.wiki.gg/wiki/Sulfur?oldid=31454); revision 31454; [contributors](https://palworld.wiki.gg/wiki/Sulfur?action=history).
- **Paldium Fragment**: [Paldium Fragment](https://palworld.wiki.gg/wiki/Paldium_Fragment); revision not exposed; [contributors](https://palworld.wiki.gg/wiki/Paldium_Fragment?action=history).
- **Flame Organ**: [Flame Organ](https://palworld.wiki.gg/wiki/Flame_Organ); revision not exposed; [contributors](https://palworld.wiki.gg/wiki/Flame_Organ?action=history).
