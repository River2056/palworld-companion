# Foundation final review

**Reviewed state:** HEAD `0617eb5abc420db8758e6614d53cb2354c41937c` plus the working-tree catalog/version label in `src/app/App.tsx` and its component regression test in `src/app/App.test.tsx`.

**Scope:** React + TypeScript + Vite responsive foundation shell only. Review was performed sequentially: spec-fix verification first, then code quality, error handling, accessibility, and test review. Research/attribution documents are unintegrated and are not shipped shell data. This is not approval of the complete Phase 0 data/storage gate or later crafting, breeding, base, or guild functionality.

## 1. Spec compliance — PASS

The prior blocking finding in `docs/reviews/foundation-spec.md` is resolved.

- `src/app/App.tsx:31` now renders `Catalog: not loaded · Game version: unverified` outside destination-specific content. These are honest uncertainty states, not invented compatibility claims.
- `src/app/App.test.tsx:5-8` adds a passing visibility assertion for that exact status.
- An independent Chromium probe against the production build confirmed the status is visible on Today, Craft, and Settings at both required widths.
- The shell remains dark and responsive, with a genuine Today empty state; manual entry/no game connection are explained (`src/app/App.tsx:33-34`). Craft explicitly says it is unavailable and contains no recipes or calculations (`src/app/App.tsx:36`). Upcoming modules remain noninteractive text (`src/app/App.tsx:26`).
- Settings explains the absence of current progress storage, future browser-local/manual data, potential browser-data loss, unavailable backups, and the running-server requirement (`src/app/App.tsx:37`). The unofficial/non-affiliation disclosure remains visible (`src/app/App.tsx:38`).
- Required scripts exist and all executed successfully. Direct dependencies are exactly pinned; `npm ls --depth=0` completed successfully. Repository-local author values read back as `river2056` / `chen0625tung@gmail.com`.

### Exact-width production verification

A temporary loopback Vite preview server on port 4279 served the just-built `dist` output. A Node/Playwright probe navigated each route, waited for its heading, asserted catalog-status visibility, checked document width, and collected page errors. The server and browser were stopped afterward.

| Destination | Viewport width | Document scroll width | Catalog/version status visible |
| --- | ---: | ---: | --- |
| Today | 390 | 390 | Yes |
| Craft | 390 | 390 | Yes |
| Settings | 390 | 390 | Yes |
| Today | 1440 | 1440 | Yes |
| Craft | 1440 | 1440 | Yes |
| Settings | 1440 | 1440 | Yes |

**Result:** No horizontal overflow in any of these six cases; no page errors observed. No additional foundation spec gaps identified.

## 2. Code quality — PASS WITH NON-BLOCKING NOTES

**Blocking findings:** None identified within the foundation scope.

### Reviewed behavior

- **[GOOD] Bounded routing and lifecycle cleanup:** `src/app/App.tsx:3-15` restricts destinations to a typed constant list, falls back to Today for unknown hashes, and removes the hash listener on cleanup. Browser tests exercise navigation, reload, history, and unknown-route fallback (`tests/e2e/shell.spec.ts:17-27,36-42`).
- **[GOOD] Appropriate error surface for this shell:** There are no current catalog fetches, storage writes, user-entered calculations, or asynchronous service operations needing loading/retry/transaction handling. Missing data and unavailable functionality are explicit text, not fake success. The root non-null assertion at `src/main.tsx:6` is backed by the static root element in `index.html:2`. No runtime page errors occurred in the existing browser suite or supplemental production probe. Future storage/network error handling is outside this review, not a missing shell feature.
- **[GOOD] Accessibility basics:** The document declares English (`index.html:2`); navigation has an accessible label and current-page state; decorative navigation symbols are hidden from assistive technology; there is one route heading and a focusable main landmark (`src/app/App.tsx:19-30`). Keyboard skip-link behavior passes in desktop and mobile Chromium. Focus-visible styling is defined at `src/app/styles.css:5,45-46`. Catalog status and upcoming availability are conveyed in text rather than color alone.
- **[GOOD] Honest tests and tooling:** Unit tests assert visible output and click real links. Test cleanup unmounts components and resets the hash (`src/test/setup.ts:5`). TypeScript strict mode and React hook lint rules are enabled. E2E tests collect page errors and external requests and passed with empty collections (`tests/e2e/shell.spec.ts:4-7,32-33`). No test or build script is a placeholder success command.

### Non-blocking notes

#### [MINOR] Keep the exact acceptance viewport/status checks in the committed browser suite

**Files:** `tests/e2e/shell.spec.ts:26-28`; `playwright.config.ts:2`; `src/app/App.test.tsx:5-8`.

The existing E2E overflow assertion runs only after returning to Today and uses device-preset viewports rather than explicitly fixing 390px and 1440px. The new catalog assertion is component-level only. The independent production probe above verifies the requested behavior now, so this is a regression-coverage improvement, not an observed layout or visibility defect.

**Recommendation:** When extending the suite, parameterize all three destinations at the exact acceptance widths and assert catalog/status visibility alongside scroll width.

#### [MINOR] Dense formatting increases review cost

**Files:** `src/app/App.tsx:19-38`; `src/app/styles.css:47`; `playwright.config.ts:2`; `src/app/App.test.tsx:25`.

Several full JSX sections, the entire mobile media query, and the browser configuration occupy single lines; the App import appears between test declarations. These are valid and all checks pass, but make future diffs and line-level reviews harder to follow.

**Recommendation:** In a separate formatting-only change, expand nested JSX/configuration/media rules and group imports at the top. No abstraction or routing-library rewrite is needed for this small shell.

### Accessibility verification limits

This review covers source semantics, real keyboard skip-link behavior, navigation, visible state, and responsive width checks. It does not claim a complete WCAG audit, screen-reader certification, automated contrast audit, or non-Chromium browser coverage.

## 3. Actual execution evidence

Executed in `/Users/tungchinchen/projects/palworld-companion`, using Node `v20.20.2` and npm `10.8.2`.

| Command/check | Actual result |
| --- | --- |
| `npm test` | Exit 0; Vitest 3.2.7; 1 test file passed, 3 tests passed |
| `npm run typecheck` | Exit 0; `tsc --noEmit` passed |
| `npm run lint` | Exit 0; no ESLint issues |
| `npm run build` | Exit 0; Vite 6.4.3; 29 modules transformed |
| `npm run test:e2e` | Exit 0; 4 tests passed, desktop/mobile Chromium |
| Supplemental production Chromium probe | Exit 0; all six route/width cases passed; no page errors |
| `git diff --check` | Exit 0; no whitespace errors |
| `npm ls --depth=0` | Exit 0; installed direct dependencies resolved |

Production output: `dist/index.html` 0.50 kB, CSS 4.64 kB, JavaScript 192.05 kB (gzip 0.32 / 1.77 / 60.55 kB respectively). The required command chain completed without interruption. No failed commands, failed tests, installation blockers, or runtime errors were encountered during this review.

## 4. Changes and disposition

- Created only this review document; no application code, tests, configuration, or existing documentation were edited by the reviewer.
- The requested build and E2E runs generated/refreshed ignored `dist/` and `test-results/` artifacts; tooling may maintain ignored caches.
- Existing parent-owned source fixes and documentation/research changes were preserved. The earlier spec report describes the pre-fix state and is superseded by this report for the reviewed working tree.

**Final disposition:** Foundation spec **PASS**; foundation code quality **PASS WITH NON-BLOCKING NOTES**. The shell is eligible to proceed to the next milestone; this verdict does not assert that any later feature or data gate is complete.
