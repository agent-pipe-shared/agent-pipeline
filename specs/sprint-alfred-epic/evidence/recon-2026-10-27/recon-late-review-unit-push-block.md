# Recon: pipeline.consumer-push-blocked-by-late-review-unit (P0, stage 25)

Source: read-only Explore agent, 2026-10-27. Model output; cited lines re-verifiable. Backlog item: backlog/items/2026-10-26-consumer-push-blocked-by-late-review-unit.md. Snapshot row: snapshot.json:7563-7597 (open[]: agent, native-host, verify-wsl, critic, po-acceptance).

## Cause (re-verified in code)
- PF-75 (late-added unit leaves no admissible range): FIXED in b8a2ec6c2 (critic-generic-batch.mjs:273-299 `declarationCommit`; critic-course-admission.mjs:506-533 `introducingCommit`/`featureReviewUnit`). Tests critic-generic-batch.test.mjs:439-474 (5 cases) and pins/critic-round-cap-and-delta-scope... AC4 at :120.
- Blocker 1, mainRef: lib/critic-generic-batch.mjs:295-303 (`reviewUnitSource`) fails CGB-MAIN-INTEGRATION unless `deliveryBoundary.mainRef` equals primary checkout `symbolic-ref HEAD` (:297-298) and the candidate is an ancestor (:302-303). A unit naming refs/heads/feat/<branch> fails when the primary checkout is on main.
- Blocker 2, no named route: scripts/push-prepare.mjs:748-752 `critic-bound-verify` remedy says only "candidate qualification unavailable (<code>)" + generic lifecycle text; code from lib/critic-verify-readiness.mjs:41/50 (`private-critic-binding-unavailable`). No repair-map route (lib/repair-map.mjs does not exist; scripts/repair-map.mjs has no critic text).
- CCA-RANGE-BOUND: critic-course-admission.mjs:443 caps range() at 512 commits; no fix planned, surface only.

## Already delivered
b8a2ec6c2 (PF-75 A+B), 1bcce7add (D165 held patches S1,S2,S3,S5,S7a,CDR applied), 29540db4d (interim stamp). Not delivered: mainRef handling, concrete route in remedy / repair-map, merge-base-first-base RV-style check.

## Slice R (safe, no PO decision) - 1 Goldfish dispatch, 12-16 calls
- Change scripts/push-prepare.mjs:751 only: remedy names the route, e.g. `node ${PIPELINE_PLUGIN_ROOT}/scripts/critic-dispatch-preflight.mjs ... --base <merge-base of HEAD with the publication target> --candidate HEAD`, then Verify bound to that candidate. For code `private-critic-binding-unavailable` add a line: a late-added review unit may use the merge base with the publication target as first base.
- Test file: scripts/push-prepare.test.mjs (templates :783-799, :801-810). Write scope: push-prepare.mjs + that test (+ held-patch outputs). No new source files.
- Cases RED-first: (1) code private-critic-binding-unavailable -> remedy matches /critic-dispatch-preflight\.mjs/ and /merge base/; (2) other code (verify-evidence-not-exact-green) keeps generic remedy; (3) ok:true adds no remedy; (4) checkpoint profile still has no critic-bound-verify check.
- Keep remedy single-line, short (72-char human-text limit, POSIX/PowerShell/cmd variants).

## Slice M (needs PO answer first) - 25-30 calls
critic-generic-batch.mjs:297-303: accept a unit whose mainRef is a feat/ ref when primary checkout is on main and candidate is an ancestor of primary HEAD. Relaxes a security-relevant integration check; PO question (which branch the primary checkout sits on) open in the backlog item. Test file lib/critic-generic-batch.test.mjs next to D165-PF75A cases. Cases: feat/x mainRef + primary main + ancestor accepted; primary on unrelated branch still CGB-MAIN-INTEGRATION; non-ancestor still refused. Needs ADR-style note and Critic.

## Risks / protected paths
push-prepare.mjs is in NEVER_LIFTABLE_KERNEL_PATHS (lib/guard-maintenance-window.mjs:384); critic-generic-batch.mjs (:777), critic-verify-readiness.mjs (:778), critic-course-admission.mjs (:544) same closure. Deliver as held patch (<id>.patch + .notes.md) applied by operator, as D165. Test files likely protected-test paths too.

## Runner-neutrality
Plain Node ESM + git plumbing; remedy text uses ${PIPELINE_PLUGIN_ROOT} and neutral node-command wording, no Claude-only skill/hook/slash names.

## Recommendation
Held patch YES for both; dispatch Slice R now, hold Slice M for the PO answer. Item stays open (native-host, verify-wsl, critic, po-acceptance pending). Matrix effect of R alone: the `agent` entry still has mainRef open, so the row does not reach 75 by R alone.
