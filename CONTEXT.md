# Palworld companion context

## Purpose

A second-screen planner for crafting, breeding, base work suitability, and guild coordination. The core question is "what should I do next?", not a general wiki.

## Approved decisions

- Read `docs/plans/palworld-companion-plan.md` for the full approved spec and `docs/acceptance-matrix.md` for release gates.
- Direct recipe ingredients are the default; nested/raw expansion is optional.
- Inventory is manually maintained. Progress actions never silently deduct it.
- Finished-unit goals, whole recipe batches, owned stock, planned surplus, and fulfilled progress are distinct concepts.
- One shared allocation ledger for all active personal goals in a workspace. Guild stock is a separate scope.
- Use stable catalog IDs, not display names, as references.
- Pure domain modules own calculations; UI renders results.
- Catalog facts and images require separate provenance/permission decisions. No invented game data. Synthetic fixtures belong only under tests.
- No current-version/completeness claims without verified evidence.
- Browser-first personal persistence; shared guild operations require real authentication and server-side authorization.
- No remote publishing/deployment without further authorization.

## Execution

- Repository-local Git author: river2056 <chen0625tung@gmail.com>. Do not alter the global Git profile.
- Implement sequentially in tested vertical slices. Verify focused failures before implementation and regression passes afterward.
- Spec compliance review precedes quality review. Resolve material issues before marking milestones complete.
- Keep local commits coherent. Never commit tokens, secrets, local databases, browser profiles, or test artifacts.
- Record actual commands/results and remaining blockers in `docs/implementation-status.md`.
- Canonical user note: `/Users/tungchinchen/Documents/notes/side-projects/palworld/palworld-companion-plan.md`.
