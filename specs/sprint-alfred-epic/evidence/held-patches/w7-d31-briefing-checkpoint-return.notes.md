# Held patch notes: D31 briefing checkpoint return (W7-D31-BRIEFING-CHECKPOINT-RETURN-C1-20261027)

Status: INTERIM (budget checkpoint at call 32 of 40). The patch holds ONLY the four RED cases. The production edit is NOT made.
The patch is `git diff --binary` of the scratch clone against candidate 5370962e3. It was not apply-checked in clone2 and not run.

## Cause (re-verified at the candidate)
`lib/dispatch-briefing-build.mjs` line 256 (inside `renderGoldfishBriefing`) tells the Goldfish: "otherwise stop and return a
plain-text stop report instead of the JSON (no commit happens then)". The recon claims were re-verified:
`validateNativeGoldfishFinal(text, { binding, allowCheckpoint })` in `lib/native-goldfish-host-return.mjs` (lines 101-122) already
accepts outcome `checkpoint` when `allowCheckpoint === true` (opt-in, SubagentStop route) and requires a non-empty, sorted,
duplicate-free `changedPaths` within the write scope.

## Done
Four RED cases appended to `lib/pins/claude-background-goldfish-is-host-committed-at-subagent-stop.test.mjs` (clone), ids (xiii)-(xvi),
after (xii); two import lines added (`renderGoldfishBriefing`, `validateNativeGoldfishFinal`). They render the briefing directly with
`renderGoldfishBriefing` and a minimal fake `generated`/`calibration`:
- (xiii) paragraph names `checkpoint`, "continuation card", "done, remaining, next step", "Never invent another `outcome` word".
- (xiv) no longer contains "otherwise stop and return a plain-text stop report instead of the JSON"; names the plain-text report only for the "no file at all" case.
- (xv) the JSON example validates with outcome `succeeded` (expected green already today).
- (xvi) a hand-built checkpoint final with changedPaths validates with `allowCheckpoint: true` and fails without it (expected green already today).
Expected RED before the edit: (xiii) and (xiv). (xv) and (xvi) pin existing behaviour and should be green before and after. THESE WERE NOT RUN.

## NOT done
- The production edit (clone only, never the repository tree) of line 256. Proposed replacement of the first sentence, every other
  sentence byte-identical: "`outcome` is `succeeded` only when every targeted check below is green. At the budget checkpoint, at a
  stop condition, or whenever a targeted check is not green, the final message is still this same JSON object with `outcome` set to
  `checkpoint`: the `report` string carries the condensed report plus a continuation card (done, remaining, next step), and
  `changedPaths` lists the files you have changed so far, so the host keeps the reservation live and the work can be resumed (a
  checkpoint commits nothing). Never invent another `outcome` word. Only when no file at all has been changed is a plain-text stop report the one legal form (no commit happens then)."
  Edit target is `plugins/pipeline-core/lib/dispatch-briefing-build.mjs`, which is NOT in this dispatch's write scope, so the patch
  as briefed ("Files that may differ") needs that file added to the patch; do it in the clone.
- RED run, GREEN run, whole-file baseline versus patched failing-name comparison (clone vs clone2), `scripts/dispatch-briefing.test.mjs`
  and `goldfish-test-briefs-lack-targeted-and-quick-command-routes.test.mjs` runs, driver `check`, driver `cleanup`
  (both clones remain under scratch/agent-out/w7qy/, ignored; driver at scratch/agent-out/w7qy/driver.mjs, modes setup/setup2/run/patch/check/cleanup).

## Pins and other copies (searched)
- No test pins the replaced sentence (`rg -F "instead of the JSON"` in plugins finds only the builder and an unrelated
  finalizer test string). The generator digest is computed dynamically (`sha256(body)`, builder lines 317-318), so no digest or golden pin
  changes are expected. Not yet confirmed by running `scripts/dispatch-briefing.test.mjs`.
- `templates/prompts/goldfish-task.md` line 478 mentions "a stop report" (restore-before-yield context); not edited, review whether it contradicts.
- No copy in `skills/` or `agents/`.

## Proposed commit message
feat(dispatch): brief a Goldfish to return a typed checkpoint at a budget stop

## Operator flow
Complete the work first (production edit + runs), then apply-diff, `git add -u -- <paths>`, `git commit --no-verify`, stamp, install.
Briefings built before installation keep the old wording (scratch/wave3 included). Protected-path classification: none of the touched files matches TP-1..TP-13.
An independent Critic review stays a parent-owned batch gate.

## Continuation card
done: RED cases written, patch (cases only) written. remaining: production edit in clone, RED/GREEN runs, baseline comparison, apply check, cleanup, update this note. next step: `node scratch/agent-out/w7qy/driver.mjs run red <test file>` in clone, then edit line 256 in the clone.
