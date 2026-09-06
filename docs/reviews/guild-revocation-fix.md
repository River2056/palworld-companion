# Guild revocation stale-state fix

## Outcome
The confirmed refresh confidentiality blocker in `guild-independent.md` is fixed within the guild frontend. Backend authorization and broader membership-management features are unchanged.

- An authoritative guild list excluding the selection clears the selection, tasks, members/owner controls, digest, issued invitation, publication consent, task title, invitation acceptance and pending task retry/conflict state. It does not load the inaccessible selection afterward.
- Auth/access denial (401/403 or permission code 42501) clears private state and cached guild choices. HTTP denial remains authoritative even with a non-JSON body. A 401 additionally clears the in-memory session and endpoint approval, requiring explicit sign-in consent again.
- Empty membership or membership lacking the signed-in user is treated as confirmed loss. Settled aggregate results prioritize permission denial and membership loss over simultaneous transport failures; successful sibling responses cannot restore cleared private state.
- Uncertain network/server outcomes retain data and immutable pending task requests, but expose an explicit disconnected/read-only state. All writes, including exact retry and mark-seen, remain disabled until successful explicit refresh. The action dispatcher also blocks writes, not just disabled fieldsets. Refresh and local sign-out remain available.
- Endpoint trust, in-memory credentials/session, conflict handling, immutable idempotent retry payloads, and displayed-event watermark behavior are preserved.

## Regression evidence
`src/features/guild/revocation.test.tsx` uses rendered public controls and a deterministic fetch boundary, not component internals. Cases cover removed guild selection; non-JSON 403 racing a task network failure; empty membership racing a task network failure; expired authentication; and transient failure retaining private data read-only, blocking writes, recovering after verified refresh, retaining pending retry through connectivity recovery, and purging retry on subsequent revocation. Re-selection verifies invitation and publication consent do not resurrect.

During regression development, a synthetic click could bypass an inherited disabled fieldset; an action-dispatch guard was added and the regression now verifies no request is emitted.

## Executed verification
- `npm test -- src/features/guild`: exit 0, **3 files / 11 tests passed** (the original 6 plus 5 regression cases).
- `npm run typecheck`: exit 0.
- `npx eslint src/features/guild --max-warnings 0`: exit 0, no issues.
- `git diff --check`: exit 0.

No live backend membership mutation or full-browser acceptance was performed. Existing broader specification gaps and concurrent digest watermark limitation from the independent review remain out of scope. No App, Settings, integration, or backend files were edited. This report does not assert full guild milestone acceptance.
