---
schema: pipeline.backlog-item.v1
id: pipeline.commit-producer-path-order-failures-count-against-the-tool-cap
type: defect
owner: pipeline
status: open
created: 2026-10-05
source: "Live observation 2026-10-05 (Alfred session): ALFRED-BACKLOG-20261005 defect 4."
sprint: alfred
done_when: manual
---

# Commit-producer path-order failures count against the hard tool cap

## Description

`goldfish-commit-command-flow.mjs` refuses unsorted `--path` values with `GF-COMMAND-PATH-ORDER`. Each refused call spends a tool use against the hard cap. Twice, a Goldfish reached the cap with the producer still failing and the Elephant had to hand-compose the commit, which the producer exists to avoid.

## Triggering situation

Two Goldfish dispatches on 2026-10-05 near their cap. Reproduction shape: pass `--path` values in non-lexicographic order to the producer.

## Affected artifact

`plugins/pipeline-core/scripts/goldfish-commit-command-flow.mjs`, the budget guard's counting rules, `templates/prompts/goldfish-task.md` commit instructions.

## Proposal

Fix direction: sort the paths inside the producer (the order is canonical, so rejecting rather than normalizing buys nothing), or exempt producer refusals from the counted budget; at minimum state the sorted-order requirement in the briefing template next to the command.

## Observed again 2026-10-06 (night run, Claude × native Windows × own repo)

- The producer's refusals are not only path order: DOCCAP2 got `GF-COMMAND-INPUT` twice (once without `--summary`, once
  with it) and hand-composed the commit; REGADD needed three attempts until `--summary` and at least one `--body` were
  both present. The template example shows both flags but does not say they are mandatory.
- GLREP-t2, REGADD and GLREP-t3 reported that the producer's multi-line POSIX `copyCommand` is refused by the shell
  grammar for containing a newline; only the single-line `command` field is usable, while the template tells agents to
  execute `copyCommand.posix`.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** fixed in source — closes after the 0.7.0 candidate host checklist (status stays `open` until then).
- **Rationale:** commit(s) `c277e4aac`.
- **Assignment (if accepted):** sprint-alfred-epic close-out batch.
- **Date:** 2026-10-08.

## Verification 2026-10-22: every observed refusal path is closed and pinned

All three observed failure shapes were re-checked against the current source, not the earlier characterization:

- Path order: `plugins/pipeline-core/scripts/goldfish-commit-command-flow.mjs` sorts the `--path` values before calling the
  library, so any permutation yields the identical result (cases "CLI normalizes unsorted --path input" and "never spends a
  refusal on path order for any permutation"). Duplicates and invalid paths are still refused, by design.
- `--summary` and `--body`: `templates/prompts/goldfish-task.md` (final-report section) and its vendored copy state that
  both are mandatory and that omitting either gives `GF-COMMAND-INPUT`; case "the template states that --summary and --body
  are mandatory" pins the sentence and the refusal code.
- Multi-line `copyCommand`: both `copyCommand.posix` and `copyCommand.powershell` are one physical line, admitted by the
  guard grammar at linux and win32 (COMMITFLOW-T2 cases (b) to (e) for three scenarios).

Counted result, `node --test plugins/pipeline-core/scripts/goldfish-commit-command-flow.test.mjs`, run alone on 2026-10-22:
29 cases, 29 pass, 0 fail, 0 skipped, 0 todo. The suite is registered in `harness/verify-suites.json` as
`goldfish-commit-command-flow-tests`. A refused producer call still spends one counted tool use by design; the item's
"exempt producer refusals from the counted budget" alternative was not taken and is not needed once the three shapes above
cannot occur.
