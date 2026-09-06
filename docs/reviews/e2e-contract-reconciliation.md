# E2E contract reconciliation

## Confirmed frozen-source product blocker (reported immediately)

Fresh browser, `/#/breeding`: add Ragnahawk male (Hawk), then Chikipi female (Hen), select Bushi, click **Save route checklist**. UI displays a valid two-step route but save fails **Data changed; search again before saving route.** Same-tab roster writes leave the app's captured runtime revision stale; a **Local data changed** draft banner remains. No legacy import or external writer is involved. Reproduced on desktop and Pixel 7 against frozen source at `/tmp/palworld-e2e-reconcile-frozen`, dedicated port 4287. The scoped backup test reproduces the same failure after UI roster creation. These cases stop at the bug; no reload/workaround is added to mask it.

Evidence: `/tmp/palworld-reconcile-artifacts/pals-completeness-target-→-4f2d7-fspring-→-favorite-→-reload-desktop/{error-context.md,trace.zip}`; baseline JSON `/Users/tungchinchen/Library/Application Support/rtk/tee/1788650068_playwright.log` (36 executed, 16 passed, 20 failed). Baseline includes stale contracts; not all failures are product bugs. No transient moving-source JSX/Vite error is classified as a product bug.

Further reconciliation and verified batch results pending below.
