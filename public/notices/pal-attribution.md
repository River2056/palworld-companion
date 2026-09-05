# Pal reference: attribution and contract

## Scope and compatibility

`docs/research/pal-reference.json` is a deliberately small, source-checked reference: **12 species, 6 explicit breeding pairs, and 1 two-step example**. Species facts and pairs are adapted from the same Pal Calc snapshot, release tag `v1.20.2`, commit `d040d12ad362167e99937601b39714c4a145db94`, database version `v27`.[1][2]

**Patch compatibility is explicitly unverified. Nothing here was verified in game.** Do not present this catalog as current patch truth, a complete breeding database, or a full optimizer. An absent pair means **unsupported**, not impossible. No breeding-rank formula or tie-breaking algorithm was inferred or implemented. Selection was made for a compact reference, not exhaustive coverage even among these species.

The example is **Relaxaurus + Lamball → Penking; Penking + Ragnahawk → Bushi**, using explicit upstream records `/Breeding/5392` and `/Breeding/34242`.[2] It demonstrates reaching the snapshot's Bushi with Lumbering level 3; it is not an optimality or time/cost claim.[1]

## Attribution and adaptations

Upstream: **Pal Calc**, Tyler Camp and contributors, <https://github.com/tylercamp/palcalc>. The distributed license bears **Copyright 2024, Tyler Camp** and grants MIT-style permissions; the complete upstream notice is reproduced below.[3]

This companion's adaptation selects records, renames structural keys (`InternalName` → `id`, `WorkSuitability` → `workSuitability`), removes unrelated fields, assigns pair IDs from zero-based upstream array positions, and adds provenance, limitations and an example chain. Pal names, internal identifiers, snapshot Paldeck numbers, all twelve work-suitability keys and their numeric values are retained from upstream.[1] Explicit parent/child tuples and `WILDCARD` gender metadata are retained from upstream.[2] No artwork, descriptive game prose, or wiki text is copied. Atlas and wiki.gg data are not included in this artifact, avoiding a mixture of different data revisions.

The upstream software/data license is not a claim to ownership of Palworld names, trademarks, or game assets. This is an unofficial fan reference; no Pocketpair endorsement is asserted.

## Consumer rules

- Use the **case-sensitive internal `id`**, not the display name or Paldeck number, as the species identity. Numbers are snapshot values, not cross-version identifiers.
- Work levels are integers ≥ 0. Zero explicitly means no suitability in the snapshot. Preserve levels as provided rather than clamping to a remembered maximum; this snapshot includes Anubis Handiwork 6 and Mining 6.[1]
- Do not mix this snapshot's work levels with an older breeding chart and describe the result as a single verified patch.
- Parent order does not encode sex. The included source pairs all carry `WILDCARD` in both parent gender fields.[2] Resolve compatible genders from actual owned individuals at runtime; do not treat these strings as an assertion that same-sex breeding works. An intermediate offspring's usable gender is not guaranteed by a species route.
- A chain is an ordered list of included pair IDs. Its starting-species list is a species-level prerequisite, not a count of owned individuals, gender assignment, passive inheritance forecast or guarantee of feasibility.
- `sourcePointer` is an RFC 6901-style JSON pointer into the pinned source, with zero-based array indices. Each source includes its fetched UTF-8 content's SHA-256 and retrieval timestamp for auditability.
- All fields shown below are required; no additional fields are part of schema version 1. URLs and timestamps are strings; `revision` is a full Git commit SHA and `sha256` is a lowercase 64-character hex digest. All counts and numeric work/Paldeck values are integers; work values are nonnegative and Paldeck numbers positive. Species IDs and pair IDs must be unique; references must resolve inside this file.

## Exact schema version 1 (TypeScript notation)

```ts
type WorkKey = "Kindling" | "Watering" | "Planting" | "GenerateElectricity"
  | "Handiwork" | "Gathering" | "Lumbering" | "Mining"
  | "MedicineProduction" | "Cooling" | "Transporting" | "Farming";
type SourceId = "palcalc-species" | "palcalc-breeding" | "palcalc-license";
interface Reference {
  schemaVersion: 1;
  catalogId: string;
  compatibility: {
    status: "unverified"; inGameVerified: false; gamePatch: null; notice: string;
  };
  scope: {
    breedingMode: "explicit-pairs-only"; fullOptimizer: false;
    missingPairMeans: "unsupported-not-impossible"; parentOrderMatters: false;
    genderPolicy: string; workSuitabilityPolicy: string;
  };
  sources: Array<{
    id: SourceId; project: string; author: string; url: string;
    repository: string; revision: string; releaseTag: string;
    databaseVersion: string; retrievedAt: string; sha256: string;
    license: "MIT"; licenseUrl: string; copyright: string;
  }>;
  species: Array<{
    id: string; name: string; paldexNumber: number; isVariant: boolean;
    workSuitability: Record<WorkKey, number>;
    sourceId: "palcalc-species"; sourcePointer: string;
  }>;
  breedingPairs: Array<{
    id: string; parentIds: [string, string]; childId: string;
    sourceId: "palcalc-breeding"; sourcePointer: string;
    sourceParentGenders: ["WILDCARD", "WILDCARD"];
  }>;
  exampleChains: Array<{
    id: string; startingSpeciesIds: string[]; stepPairIds: string[];
    targetSpeciesId: string; note: string;
  }>;
  counts: { species: number; breedingPairs: number; exampleChains: number };
}
```

## MIT license notice (verbatim)

Source: pinned upstream `LICENSE.txt`.[3]

```text
Copyright 2024, Tyler Camp

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the “Software”), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED “AS IS”, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
```

## Sources

[1] https://raw.githubusercontent.com/tylercamp/palcalc/d040d12ad362167e99937601b39714c4a145db94/PalCalc.Model/db.json
[2] https://raw.githubusercontent.com/tylercamp/palcalc/d040d12ad362167e99937601b39714c4a145db94/PalCalc.Model/breeding.json
[3] https://raw.githubusercontent.com/tylercamp/palcalc/d040d12ad362167e99937601b39714c4a145db94/LICENSE.txt
