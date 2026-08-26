# Delta Critic re-review: WP5-phx2-rework-1 (F1/F4/F5)

**Reviewer:** pipeline-core:critic, functional-equivalent-read-only lane, requested route claude-opus-5 at max.
**Reviewed object:** enumerated commits `db271b5`, `befadd2`, `f01f111` (union, not a range — 12 unrelated commits interleave between base `f16b8f2` and head `f01f111` on the branch; confirmed via path-restricted `git log` that these three are the only ones touching the six named files).
**Verdict: PASS — no findings.**

## Per-finding resolution status

- **F1 (blocker) — resolved.** `runner-profiles-v3.mjs:237` now admits `push_external_ledger` in `validateClosedObject`'s optional list; `check-routing-projections.mjs`'s live validation path no longer rejects it. 20/20 reproduced, including the pre-existing closed-object rejection case (untouched, still fires for a genuinely unknown key).
- **F4 (major) — resolved.** `external-push-ledger.mjs`'s `committedUserYamlBytes` now returns a three-way result; the working tree is never parsed for the key's value. EPL20/EPL21 (new) and EPL16/EPL17/PGXL06 (pre-existing, invariant-b asymmetry) all reproduced green.
- **F5 (minor) — resolved.** `guard-push.mjs`'s read-side calls now source from `fallbackProjectDir()`, matching the ADR-0056 waiver pattern. New end-to-end case PGXL07 (nested session-root-vs-target-repo) reproduced green.

## Deliberately not flagged

Zero deleted/modified lines in any test file (pure-insertion diff hunks only) — no pre-existing case weakened. A write-side regression suite (`pipeline-state-external-push-ledger.test.mjs`) not present in the submitted evidence was independently run (5/5 green, including PSXL05). Authorship clean (all three commits carry the `Dispatch: WP5-phx2-rework-1 (goldfish)` trailer). No new dependency, no dangling reference from F4's `lstatSync` import removal. No secrets/machine-specific paths; Conventional Commits; English throughout.

## Trajectory check

**Consistent.** All reproduced results match the submitted evidence artifact exactly; the six reviewed files are byte-identical between candidate `f01f111` and the current branch tip (only an intervening docs-only commit). The evidence artifact's own disclosure (Elephant-run, not a `verify.mjs` substitute) was honest and verified correct.

## Briefing violations

None.
