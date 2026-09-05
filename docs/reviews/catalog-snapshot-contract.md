# Catalog snapshot contract — isolated layer 1

## Delivered boundary

Only `src/domain/catalog-snapshot.ts`, its adjacent test, and this review document belong to this change. Existing planner, persistence, backups, migrations, bindings on saved records, and UI are **not integrated or changed**. This is not completion of `docs/plans/catalog-snapshot-closure.md`.

The agreed public seams are the legacy-reference adapter, recipe selection, snapshot construction/import, and shape-versus-strict validation. Tests use the current references plus synthetic alternate recipes **only inside the test file**. No alternate production fact is invented.

### Types

- `SnapshotId = sha256:${string}`; runtime imports require lowercase 64-character SHA-256 hex after the prefix.
- `CatalogBinding`: `{ state: 'bound', snapshotId }` or `{ state: 'legacy-unbound', claimedVersion? }`. This type declares the downstream contract; it does not migrate records, validate binding resolution, or select a catalog.
- `ItemV2`: existing material identity/provenance plus explicit `raw | craftable` kind.
- `RecipeV2`: independent `id`, `outputItemId`, yield, ingredients, station/unlock/provenance and optional notes/variant.
- `CatalogV2`: items, recipes, and persisted `defaultRecipeByItem`.
- `PalCatalog` derives directly from the reference JSON (`typeof palReference`), not an in-progress feature interface.
- `CatalogManifest`, `CatalogSnapshotPayload`, deeply readonly `CatalogSnapshot`, `RecipeSelection`, and discriminated `RecipeResolution` are exported.

### APIs

| API | Contract |
| --- | --- |
| `normalizeCatalog(reference: Catalog): CatalogV2` | Detached mutable adapter output. Preserves every original item/recipe ID in separate namespaces; each legacy recipe outputs the corresponding same-ID item and gets an explicit default. Validates structure/identity, not dependency semantics. |
| `bundledSnapshotPayload(): CatalogSnapshotPayload` | Fresh mutable payload assembled from the existing research JSON; no eager singleton or storage. |
| `createBundledCatalogSnapshot(): Promise<CatalogSnapshot>` | Strictly validates the shipped payload, then returns an immutable content-addressed snapshot. Preferred production entry point. |
| `createCatalogSnapshot(payload): Promise<CatalogSnapshot>` | Shape-validates and clones before the first asynchronous digest; deeply freezes the result. Intentionally permits missing semantic references and dependency cycles for downstream diagnostics. |
| `importCatalogSnapshot(value: unknown): Promise<CatalogSnapshot>` | Accepts a parsed JSON envelope, not a JSON string. Validates shape and exact digest, returns a detached deeply frozen result. Does not fix or normalize an invalid ID. |
| `validateCatalogShape(value)` | Assert crafting structure, safe whole quantities, explicit kinds and namespace uniqueness. Missing references/defaults and dependency cycles are not structural failures. |
| `validateSnapshotShape(value)` | Assert the **payload** `{ manifest, craft, pals }`, not the `{ id, ...payload }` envelope. Validate manifest schema 2, Pal schema 1, reference-derived Pal field structure, tuple sizes and independent species/pair/source/chain identities. |
| `validateBundledCatalog(value)` | Strict **payload** gate: all crafting references/outputs/defaults, cycles across **all** alternatives, Pal source/species/pair/chain references and declared totals. Does not establish in-game truth or implement breeding optimization. |
| `resolveRecipe(craft, itemId, selection?)` | Explicit root `recipeId` wins, then per-item override, then persisted default. Pass only overrides at intermediate nodes. Returns `resolved`, `raw`, or `unresolved` (`item-missing`, `recipe-missing`, `recipe-output-mismatch`). |
| `canonicalJson(value)` / `digestCanonicalJson(value)` | Public deterministic serialization/digest utilities, also used by the import boundary. |

An explicitly present invalid choice—including an empty/undefined choice passed at runtime—is unresolved, never replaced with a default. The resolver checks the selected recipe's output identity. Raw materials terminate only when there is no explicit selection; an explicit recipe targeting a raw item is not accepted as a craftable recipe. Recipe-array order never selects a default.

## Identity, JSON, and immutability

`CANONICALIZATION_VERSION = 1` is fixed for this schema:

1. Recursively sort object keys using JavaScript's UTF-16 lexical ordering (including numeric-looking keys).
2. Encode keys/scalars with JSON string/number encoding; preserve array order; do not normalize Unicode.
3. Encode the canonical string as UTF-8 and hash with Web Crypto SHA-256.
4. Hash the complete `{ manifest, craft, pals }` payload, never the envelope ID. Prefix lowercase hex with `sha256:`. A future canonicalization change needs an explicit schema/version decision, not a silent implementation replacement.

Reject unsupported values rather than silently dropping them: undefined, functions, bigint, symbols, non-finite numbers, negative zero, sparse/extended arrays, accessors/non-enumerable properties, non-plain objects, cyclic object references, nesting beyond 100, and prototype-pollution keys (`__proto__`, `constructor`, `prototype`). Unsafe identity strings are also rejected. Quantities/work levels/Pal numbers must be safe integers with their declared lower bounds. JSON object cycles differ from semantic recipe cycles: the former are invalid serialization; the latter remain importable for diagnostics.

Cloning occurs synchronously before hashing can yield, preventing caller mutation during an in-flight digest. Every nested returned object/array is frozen, and public snapshot types are recursively readonly. Selection from a snapshot therefore exposes immutable records without a mutable Map/Set hidden inside it.

Digest verification establishes byte identity, **not authenticity, license approval, catalog completeness, or game compatibility**. No fetching, network trust policy, database lookup, or automatic fallback is implemented.

## Provenance and limitations

- Crafting data remains the mixed wiki revision reference, with unchanged original source records and notes. The adapter changes structure, not yields or inputs.
- Pal payload is retained as provided: pinned Pal Calc sources, species, explicit pairs, example chains, hashes, limitations and counts.
- Manifest `gameVersion` is `null`; `verificationStatus` is `unverified`. Source licenses/attribution are copied from existing references. Distribution permission is not represented as blanket approval; the existing license/attribution documents remain authoritative.
- Strict cycle validation conservatively includes the union of every alternative's dependencies, even if a particular choice avoids a cycle. This is a production-bundle gate, not a claim that every imported cyclic alternative is unusable. The planner's future diagnostics/choice-aware expansion remain separate work.
- The Pal structural schema deliberately follows the current JSON schema, not evolving feature-layer interfaces. Pal schema evolution requires updating this boundary/tests intentionally.
- The browser runtime requires Web Crypto and TextEncoder (secure context/localhost); no hashing dependency or Node-only runtime import is added.

## Actual verification

Red-to-green was exercised at the adapter, resolver, snapshot/hash, validation split, and strict bundle factory boundaries. Initial failures were missing module/export behavior, then corresponding implementation passes. A sparse-array fixture initially failed scoped lint; it now constructs the sparse array explicitly, preserving the rejection test without violating the lint rule.

Final recovery verification (supersedes the original worker's earlier green shared-tree typecheck):

- Added a canonicalization regression first: **1 failed, 38 passed**. A custom array prototype could previously supply an inherited `map` method, execute code, and replace the serialized array contents. The boundary now requires the standard array prototype before invoking array methods; ordinary and null-prototype plain objects remain supported. No public exports or valid JSON digest bytes changed.
- `npm test -- src/domain/catalog-snapshot.test.ts src/domain/catalog.test.ts src/domain/planner.test.ts src/domain/planner-provenance.test.ts src/test/catalog-metadata.test.ts` — **5 files passed, 106 tests passed, 1 existing metadata test skipped**, including **39 snapshot contract tests**.
- `npm run typecheck` — exit **2** in the concurrently edited shared tree. **No diagnostics in either owned snapshot file.** Errors were in the active worker's `src/domain/snapshot-planner.test.ts` (missing implementation and resulting implicit-any callbacks) and `tests/e2e/pals-backup-roundtrip.spec.ts` (two `AuditedWindow` casts). These are not changed by this contract recovery.
- `npx eslint src/domain/catalog-snapshot.ts src/domain/catalog-snapshot.test.ts --max-warnings 0` — **no issues**, exit **0**.
- Scoped whitespace verification is recorded with the commit check.

Independent spec assessment: immutable cloning/freezing, full-payload hash import verification, separate item/recipe namespaces, persisted deterministic choices, semantic-gap retention versus strict all-alternative/Pal-reference validation, and explicit unknown patch/licensing provenance match the layer-1 contract. The concrete custom-array prototype gap was fixed test-first. The existing `validate:catalog` package script still does not invoke this new strict bundle suite; package/build-gate integration belongs to the parent acceptance integrator, not these owned files. Size limits for backup envelopes and storage put-if-absent equality remain downstream responsibilities, not guarantees of this module.

The fixed UTF-8 digest vector was independently computed with Python `hashlib.sha256` for `{"a":"雪","z":[3,1]}`: `5a84b5bc749ffa4bb5135a770172033cec65b904e88239fbfa8335b6615ebd63`. Tests also cover stable identity despite object-key reorder, changed identity on recipe-array reorder, tampering in each payload section, import ID format, mutation isolation, explicit wrong/unknown choices, duplicate identities, missing semantic references and an alternate-only dependency cycle.

No storage/UI verification is claimed: those integrations are intentionally absent.
