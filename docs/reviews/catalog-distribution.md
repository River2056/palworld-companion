# Catalog metadata and distribution verification

## Scope and decision

The accepted local prototype retains its small, patch-unverified reference sets. Crafting uses mixed wiki article revisions (and explicitly unknown revisions where extraction did not expose them); article IDs do not pin transcluded templates or prove a game patch. Pal species and explicit breeding pairs use one pinned Pal Calc snapshot. Missing pairs remain unsupported, not impossible. No reference records, runtime catalog/planner/Pal/Guild/storage/UI logic, dependency versions or lockfile were changed by this work.

This gate verifies structural metadata and notice preservation, **not legal clearance**, upstream authorship, live URL reachability, source-body hash authenticity, current game compatibility or in-game accuracy. Public release still needs review of wiki exceptions, underlying game/database/trademark rights, ShareAlike scope and effective user-facing attribution placement. There is no invented permission or artwork in these changes.

## Repeatable gate

From the repository root:

```sh
npm run validate:catalog
npm run build
VERIFY_CATALOG_DIST=1 npm run validate:catalog
npx eslint src/test/catalog-metadata.test.ts --max-warnings 0
```

`validate:catalog` retains the existing runtime catalog tests and adds `src/test/catalog-metadata.test.ts`, which imports **both actual research JSON files**. The offline tests require no source refetch and reject malformed synthetic in-memory copies without editing research records.

Checks include:

- Exact required schema fields, unique well-formed IDs, case-sensitive resolved references and declared Pal counts.
- Positive safe-integer ingredient quantities and yields; nonnegative integer work levels (zero preserved, no invented maximum); positive Paldeck numbers.
- Complete source metadata, HTTPS source/license URLs, contributor/copyright notices, revision URL/ID agreement, explicit unknown wiki revisions, retrieval timestamps and SHA-256 syntax.
- Full Git revisions and matching commit-pinned Pal source/license URLs; same Pal database/release snapshot; valid source pointers and pair IDs.
- Explicit prototype compatibility/scope decisions, WILDCARD metadata, ordered explicit example-chain dependencies.
- Verbatim copies of local research attributions; verbatim complete upstream MIT notice; every actual source/revision/license URL and wiki contributor history represented in distributed notices.
- Full primary CC legal text pinned by SHA-256 and all eight sections; linked notice index; optional byte-for-byte comparison of **every notice asset** in `public` and the newly built `dist`.

The distribution test is explicitly skipped in a normal run; use the build-then-opt-in sequence above rather than treating an old dist as fresh evidence. If research notices change, synchronize their public copies; if reference revisions change, update source coverage in the notices after review. Never delete historical limitations just to pass validation.

## Emitted assets

Vite's public-directory copying emits these without a bundler plugin or runtime-code edits:

- `dist/attribution.html`: human-readable index, adaptation/license scope, primary links, disclaimers and supplementary Cloth contributor-history link.
- `dist/notices/crafting-attribution.md`: complete unchanged `docs/research/crafting-attribution.md`, including mixed-revision evidence and contributor histories.
- `dist/notices/pal-attribution.md`: complete unchanged `pal-attribution.md`, including source contract and full MIT notice.
- `dist/notices/PalCalc-MIT.txt`: exact fenced MIT text from the Pal attribution plus a final newline; preserves Copyright 2024, Tyler Camp, permission conditions and warranty/liability disclaimer.
- `dist/notices/CC-BY-SA-4.0.txt`: complete text fetched from <https://creativecommons.org/licenses/by-sa/4.0/legalcode.txt>, not the abbreviated deed.
- `dist/notices/license-provenance.json`: primary legal-text URL, actual retrieval timestamp, SHA-256 and limited decision statement.

The HTML uses relative notice links, so the index works beneath a deployment base path. No deployment was performed. A public-release UI link to `attribution.html` is outside this worker's permitted UI scope; shipping files is not a claim that all attribution-placement requirements are satisfied.

## Findings and execution evidence

- A coverage test exposed the original crafting attribution's missing **Cloth unlock contributor-history link**. The supplemental link is now in the public HTML index; the original research document remains unchanged and the revision remains explicitly unknown.
- Python's primary-license request returned HTTP 403; `curl --fail --location` successfully fetched the primary text without weakening TLS or inventing content.
- Initial full `npm run build` passed (`tsc --noEmit && vite build`, 64 modules). The initial distribution gate passed all 60 tests before the extra source-link coverage test was added.
- Final standard gate: **60 passed, 1 intentionally skipped (61)**. Final `npm run build` passed TypeScript and Vite (64 modules); `VERIFY_CATALOG_DIST=1 npm run validate:catalog` then passed **61/61**, including byte-for-byte checks of all six emitted assets. Scoped ESLint passed. The staged diff check passes with `git -c core.whitespace=-blank-at-eof diff --cached --check`: the primary CC text's original final blank line is intentionally preserved rather than changing licensed source bytes.
- A transient build during parallel work hit an unfinished `catalog-snapshot` import in another worker's test; the final build above passed after that worker supplied its module. No unrelated file was modified to bypass it.
