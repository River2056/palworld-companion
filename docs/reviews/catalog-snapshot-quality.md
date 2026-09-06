# Independent quality review — immutable catalog snapshot contract

**Target:** `730828e` (`feat(catalog): add verified immutable snapshot contract`)

**Verdict: APPROVED for the isolated contract layer.** No important or critical defect found in the reviewed scope. This is not runtime, persistence, backup, migration, UI, or whole-project integration signoff.

## Scope and evidence

Read the actual implementation and adjacent tests, `docs/reviews/catalog-snapshot-contract.md`, and the relevant closure-plan contracts. `git diff 730828e -- src/domain/catalog-snapshot.ts src/domain/catalog-snapshot.test.ts docs/reviews/catalog-snapshot-contract.md` returned no differences: the reviewed contract files match the target commit. The shared tree contains unrelated active work; none was changed or included in this approval.

### Verified properties

- **[GOOD] Deterministic, complete content identity** — `src/domain/catalog-snapshot.ts:53–85,91–103`. Object keys sort lexically, arrays retain order, JSON scalar encoding feeds UTF-8 SHA-256, and import checks the exact lowercase digest identifier against the complete manifest/crafting/Pal payload. Import does not trust a claimed ID, normalize it, or substitute bundled contents. Numeric-looking key ordering and the entire bundled digest were additionally checked independently with Node SHA-256.
- **[GOOD] Serialization rejection and repaired array-prototype boundary** — `src/domain/catalog-snapshot.ts:55–75`; regression at `src/domain/catalog-snapshot.test.ts:79–86`. Descriptor inspection rejects ordinary accessors before property-value traversal; unsafe keys, symbols, unsupported values, sparse/extended arrays, cycles, and nonstandard array prototypes fail closed. The repaired prototype check occurs before `v.map`; the inherited-map regression passes and verifies that the malicious method is not invoked. Null-prototype plain objects remain supported.
- **[GOOD] Detached immutable snapshots, including import** — `src/domain/catalog-snapshot.ts:87–103`. Canonical serialization/parse creates owned data synchronously before the first asynchronous digest. Recursive freezing covers every returned object and array, not only the tested ingredient. Independent probes traversed the complete returned graph and mutated the caller's import envelope while its digest was pending; the returned snapshot remained unchanged.
- **[GOOD] Deterministic selection without silent fallback** — `src/domain/catalog-snapshot.ts:34–45`; tests at `src/domain/catalog-snapshot.test.ts:17–32`. Own root choice wins over own per-item override, then persisted default; recipe ordering is not a selection policy. Missing/invalid explicit choices remain unresolved and output identity is checked. Independent runtime probes also confirmed explicit `undefined` root/override values and an empty root choice do not fall back. Root-only selection versus intermediate overrides remains the caller's documented responsibility.
- **[GOOD] Strict bundle gate does not destroy retained incomplete catalogs** — `src/domain/catalog-snapshot.ts:149–165,179–237`; tests at `src/domain/catalog-snapshot.test.ts:93–141`. Shape validation rejects ambiguous identities and malformed quantities while allowing semantic missing references/defaults and dependency cycles. Strict validation checks every alternative, output/default alignment, crafting and Pal references, and declared Pal totals. Semantic cycles remain hash-verifiable/importable for downstream diagnostics. Conservative union-of-alternatives cycle rejection is explicit, not an accidental default-only check.
- **[GOOD] Bounded recursion and iterative graph validation** — `src/domain/catalog-snapshot.ts:56,220–227`. Canonical JSON nesting is capped at 100; strict dependency validation uses an iterative topological walk. Independent checks accepted nesting at 100 and rejected 101, accepted a 3,000-node dependency chain, and rejected the corresponding long cycle without graph recursion overflow.

## Non-blocking boundaries and integration obligations

1. **[NOTICE] Depth limits are not total resource limits** — `src/domain/catalog-snapshot.ts:53–85,91–102`; contract assessment `docs/reviews/catalog-snapshot-contract.md:72`. There is no byte, node, string-length, or collection-count budget in this layer. Canonicalization materializes complete strings, performs repeated traversals during construction/import, and expands shared object references as repeated JSON values. Broad inputs can therefore consume substantial synchronous CPU/memory despite the nesting cap. This is an explicitly documented downstream responsibility, not a newly discovered contract violation. Before exposing backup imports, enforce byte and payload-count budgets; do not describe this module alone as a bounded hostile-input ingestion service. No destructive memory-exhaustion probe was run.
2. **[NOTICE] In-memory JavaScript objects are not an execution sandbox** — `src/domain/catalog-snapshot.ts:61–75`. The verified rejection covers ordinary getters and custom prototypes. JavaScript Proxy reflection traps and globally modified built-ins are outside the protection demonstrated here; parsed JSON envelopes in a trusted realm are the intended import input. Do not extrapolate the custom-array fix into a promise that arbitrary executable objects cannot run code during inspection.
3. **[NOTICE] Content identity is not authenticity or factual validation** — `src/domain/catalog-snapshot.ts:111–128`; contract assessment `docs/reviews/catalog-snapshot-contract.md:49–58`. Hash verification does not establish source trust, license permission, compatibility, or game correctness. The bundle preserves explicit unknown/unverified provenance. No stronger approval is given here.
4. **[NOTICE] Catalog-gate wiring is outside this commit's approval.** The current shared `package.json:7` already includes the snapshot suite in `validate:catalog`, whereas the committed assessment describes the earlier pre-integration state. This is concurrent integrator work, not a contract implementation defect. Registry equality, bounded backups, resolver consumers, and runtime initialization still need their own acceptance evidence.

## Actual independent execution

- `npm test -- src/domain/catalog-snapshot.test.ts` — **1 file passed; 39 tests passed**, exit 0.
- `npx eslint src/domain/catalog-snapshot.ts src/domain/catalog-snapshot.test.ts --max-warnings 0` — **no issues**, exit 0.
- `git show --format= --check 730828e` — no whitespace diagnostics, exit 0.
- Read-only Node probe using TypeScript's installed transpiler and an in-memory data-URL module — **11 checks passed**, exit 0: lexical numeric keys; null-prototype objects; getter nonexecution; nesting boundary; negative zero/extended arrays; independent full-payload SHA-256; whole-graph freezing; import mutation isolation; undefined/empty selection behavior; long acyclic graph; long cyclic graph.

The standalone probes were executed in memory, not added to the maintained suite. Full-tree tests/typecheck/build and runtime/database checks were intentionally not run for this isolated review; no parent-reported combined result is presented as independent evidence.

## Changes made by this review

Only this report was created. No source/test/configuration changes, commits, external database access, or edits to other workers' files.
