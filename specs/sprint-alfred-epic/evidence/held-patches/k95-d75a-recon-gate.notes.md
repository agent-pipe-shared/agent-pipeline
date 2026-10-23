# K95-D75A-RECON-GATE notes (clone k95, base: rehearsal clone, head `rehearsal: C28 critic preimage repin`)

Status: implementation complete in clone; independent Critic read, operator commit of the protected parts and PO acceptance pending.

## Cause
PO decision D75 (A): a re-dispatch after a wrong-premise stop had no recon requirement; the generator happily re-bound the same premise.

## Change
- `scripts/dispatch-briefing.mjs` (unprotected, committed in clone `4b973e758`): `generateDispatchBinding` reads all governed queue rows (new injectable dep `queueRows`, default `defaultQueueRows`: governed item queue slices, `[]` outside an approved course or on any read error). A row with `state: cancelled`, `cancelClass: wrong-premise`, same `delivery.itemId` as the new briefing and a different id makes a recon note mandatory, else refusal `DBG-RECON-REQUIRED` (names slice, earlier attempt id(s), class meaning, repair: write note, add `reconNote` / pass `--recon-note`, regenerate). The note must be a non-empty regular file (real-path-safe read); a bad path shape is `DBG-PATH-INVALID`. New flag `--recon-note` (binding) so the refusal is repairable on the binding route too; `build` passes `pkg.reconNote`.
- `lib/dispatch-briefing-build.mjs` (KERNEL path, line 799 of `NEVER_LIFTABLE_KERNEL_PATHS` in `lib/guard-maintenance-window.mjs` -> protected diff): optional closed package field `reconNote` (non-empty string, `isReconNotePath`: repo-relative under `scratch/` or `specs/`, else `DBG-PACKAGE-FIELD-TYPE` with repair), added to `namedPackagePaths` (so a missing file is `DBG-PACKAGE-PATH-MISSING`), and one context line in field 2 only when set. No new module, no kernel-list or threat-model change.
- `skills/pipeline-start/references/workflow-dispatch.md`: one paragraph after the D76 paragraph (unprotected, no vendored copy, no pin on the sentence).
- `templates/prompts/goldfish-task.md` NOT changed (reading: "teach the template ... nothing new unless the field is set" needs no template text; the budget-checkpoint P5 pin stays untouched).

## Protection check
`protected-baseline.json` matches none of the three unprotected files (patterns: guard hooks, `lib/guard/*`, verify-suites, `check-protected-delta`, `pipeline-state`, `goldfish-antigravity-host`). Kernel list: only `lib/dispatch-briefing-build.mjs` (and `-route-record.mjs`) of this family.

## Decisions on points the decision leaves open (smallest reading)
- "Same slice" = same item (`delivery.itemId`): a cancelled row cannot be rebound under its own id (existing `DBG-QUEUE-ROW-NOT-READY` says choose a new id), so a re-dispatch always arrives under a new id for the same item.
- A note is checked for existence/non-emptiness only when required; path shape and (package route) existence are checked whenever the field is present.
- Unclassified (pre-D75) cancels are not wrong-premise: no change.

## Counts (one suite at a time, private TMPDIR; runner `scratch/K95-D75A-RECON-GATE-run.mjs`; log `scratch/agent-out/K95-D75A-RECON-GATE-results.txt`)
Command form: `node scratch/K95-D75A-RECON-GATE-run.mjs <base|red|after> <file relative to clone>`
- dispatch-briefing.test.mjs: before 55/55 -> RED run (7 new cases added): 62 tests, 5 fail (the 5 new cases that need the feature; 2 "unaffected" cases pass by design) -> after 62/62.
- lib/dispatch-briefing-route-record.test.mjs 13/13 -> 13/13.
- lib/slice-queue.test.mjs 40/40 -> 40/40; scripts/slice-queue.test.mjs 19/19 -> 19/19.
- pins/budget-checkpoint-fires-below-the-briefed-cap.test.mjs (P5) 11/11 -> 11/11.
- pins/greenfield-machine-output-and-skill-budget.test.mjs (reads workflow-dispatch.md) 15/15 after.
- harness/scripts/check-consumer-safe-paths.test.mjs 9/9 after. Vendored-canon generator: not run (no vendored file touched).
RED reasons: no refusal (ok true), `--recon-note` flag unknown, package key `reconNote` unknown = the feature is absent, not fixture failures.

## Diffs (both `git apply --check` clean against the main checkout; they also touch no bundle-changed hunk)
- `scratch/agent-out/K95-D75A-RECON-GATE-k95-protected.diff`: `plugins/pipeline-core/lib/dispatch-briefing-build.mjs` -> applies after the bundle (and on main). Operator applies it BEFORE or WITH the unprotected commit: the script imports `isReconNotePath` and `RECON_NOTE_PREFIXES` from it, and 5 of the 7 new cases are green only with it.
- `scratch/agent-out/K95-D75A-RECON-GATE-k95-unprotected.diff`: script, test, workflow-dispatch.md (same content as clone commit `4b973e758`).
- Clone state: commit `4b973e758` carries the unprotected parts; the protected lib edit is still in the clone's working tree (not reverted, needed to keep the tests green there).

## Risks
- Default `defaultQueueRows` relies on `resolveGovernedItemQueue(...).normalized.slices` (same shape the existing `defaultQueueRow` uses).
- A queue holding a wrong-premise cancel for an item keeps requiring the note for every later briefing of that item, also after the successor delivered (regeneration needs the same note; harmless).

## Ratchet effect (report only)
`architecture-boundary-check.mjs --root scratch/clones/k95`: 31 violations, all pre-existing rehearsal-clone ones (none in dispatch-briefing files; script 806 lines, test 887 lines, both under 1000). No ratchet raised.

## Proposed commit message for the protected part
```
feat(dispatch-briefing): accept the reconNote package field and list it as a context file (D75 A)

AI-Assisted: true
Dispatch: K95-D75A-RECON-GATE (goldfish)
```
