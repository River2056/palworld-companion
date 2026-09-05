# Semantic Guild source verification

## Outcome

Recovered the timed-out semantic publication work and verified its actual asynchronous UI consumer. Publication uses retained, exact catalog snapshots, not the currently bundled catalog. The resolved hook returns source arrays; `PublicationPicker` remains a synchronous array consumer (no Promise props and no duplicated hook).

- `semantic-v2` canonical fingerprints include exact snapshot identity, selected root recipe, overrides/selected closure, goal quantities/progress, and the selected pin or shortage quantities.
- `personal:v2` identities include personal workspace identity, goal, source kind and item. Recipe/snapshot changes preserve that identity; distinct personal workspaces do not collide.
- Legacy quantity-only fingerprints are explicitly unverified and require fresh preview plus consent. Reconfirming retains legacy requirement identity for backend deduplication/history.
- Missing snapshots, legacy-unbound goals and invalid recipe selections yield unavailable diagnostics, never a latest-catalog fallback.
- Only selected public task fields are copied. Notes, unrelated inventory, other goals and full snapshots are not sent. The fingerprint is local; semantic inputs themselves are not transmitted.
- Async projection discards superseded generations. Subscription errors invalidate pending generations. Readiness is scoped to the database and workspace key. Submission rereads revision/workspace and recomputes the projection to detect even retained-snapshot removal without a metadata revision change.
- Source/quantity/guild changes reset preview consent; claimed and historical shared work remain unchanged until explicit reconfirmation.

## Verification executed

- `npx vitest run src/features/guild`: **42 passed, 0 failed**.
- `npx tsc --noEmit`: **no errors**.
- ESLint on the publication helper, hook, picker, prompt and their tests: **no issues**.
- `node src/features/guild/semantic-source-smoke.mjs`: **PASS** against the already-created isolated `pw-guild-semantic-unique` real backend and Vite at port 5197, using a fresh browser context and unique account/guild. No default backend reset.
- Browser scenario publishes one selected shortage, retries publication and verifies exactly one task, claims it, changes to an equal-quantity alternate recipe, verifies stale UI plus byte-identical backend task/no automatic mutation, explicitly reconfirms and reads back changed checksum with unchanged quantity, identity, assignee and delivered quantity, and checks mutation payload privacy and absence of browser errors.
- Unit coverage also checks equal-quantity override and snapshot changes, stable workspace-scoped identity, canonical override ordering, legacy unverified status, exact planner contributions, missing/invalid/unbound sources, snapshot deletion after preview, stale workspace props and consent reset.

## Integration ownership / parent action

`GuildWorkspace.tsx` was read but NOT edited or committed by this recovery worker (PRIVACYFIX owns it). Its current working-tree integration already imports `usePublicationSources`, passes its resolved `sources` array to both consumers, suppresses them while loading/error, passes `unavailable` to `SourceChangePrompt`, and calls `await assertCurrent()` before publish/reconfirm. Full typecheck and the real browser consumer passed with that integration. No additional call-site patch is needed; the parent/PRIVACYFIX owner must retain and commit those existing lines. This helper commit alone depends on that separately-owned integration.

Browser script accepts `GUILD_TEST_CONFIG` (isolated config file path) and `GUILD_TEST_APP_URL`; it does not start or reset backend infrastructure. Existing isolated services were left running for the parent. Scratch files and other workers' changes are excluded.

## Boundary

Consent verification is a local point-in-time check immediately before the explicit remote mutation, not an atomic transaction spanning IndexedDB and the remote server. Normal server revision/conflict guards remain authoritative. No automatic remote update or catalog migration is introduced.
