# w175 -- runbooks of every lifecycle path and the runbook link in the first call (C19-G5 rest)

Status: CHECKPOINT. The patch below is a working, tested part of the item; the registration and kernel-list parts are not in it yet (see "not proven / remaining").

Criterion binding: AC-108 is the closest existing accepted criterion and is used as a fresh bounded attempt under its unchanged Spec text. The PRD and the Spec are unchanged.

## Apply order

The patch is a delta on the held patch w190 (it edits the same files). Apply w190 first, then `w175-...patch`. Against the repository alone it does not apply; against the w190 state `apply --check` exits 0.

## What

- `plugins/pipeline-core/lib/runbook-paths.mjs` (new, generator side only): the runbook documents of four more lifecycle paths -- `start` (preflight, inspect), `plan` (inspect, set-feature, submit-plan, present-plan, sign-intent, approve-plan and the three recovery verbs), `implement` (inspect, set-phase, dispatch-briefing, dispatch, dispatch-record-write, verify, materialize-push-threat-model) and `push`. The push path takes its rows (layer, command, who runs it) from the quick-reference table of `docs/push-release-flow.md`; a small annotation table adds needs, evidence, commit and next, and a row without annotation (or the reverse) is refused with `RUNBOOK-SOURCE-ROW`. Also `validateRunbook`, the schema check.
- `plugins/pipeline-core/scripts/generate-runbook.mjs`: writes and `--check`s all five path files plus the index (close path bytes unchanged).
- `plugins/pipeline-core/runbooks/{start,plan,implement,push}-path.v1.json` and the extended `index.v1.json` (generated).
- `plugins/pipeline-core/lib/runbook-link.mjs` (new, runtime): `{ path, digest, step }` from the index; once per session and path through one private marker file `agent-pipeline/runbook-shown-<session hash>-<path>` under the Git common directory (created with `wx`, mode 0600, directory 0700); a refusal always carries the link and neither reads nor writes the marker; no session id, no Git directory or any file error fails toward showing the link.
- The field is added as the last key / last line of the first result of: `pipeline-start-preflight.mjs` (start, `preflight`; refusal = non-zero exit), `pipeline-state.mjs inspect` (path follows the lifecycle: start, plan or implement; step `inspect`) and `submit-plan` (plan, `submit-plan`; prose output, so one typed line `runbook: {json}` on stdout, on stderr for a refusal), `close-coordinator.mjs drive` (close, the phase being driven; refusal = the error JSON, `inputs-missing`, `human-gate`), `push-init.mjs` and `push-prepare.mjs` (push, `driver`; `--close` is `layer-5c`).
- Tests: the existing `generate-runbook.test.mjs` suite (already registered as `generate-runbook-tests`) gained 13 cases: index lists five paths, schema validity (and refusal of a broken document), fixed step keys / known actors / `next` ids exist, every catalogued step names an existing script, a verb that script knows (PIPELINE_STATE_COMMANDS for pipeline-state) and a command composed from its argv, closed shapes accepted by `sanctionedPipelineStateArgs`, the plan and implement paths cover every verb `buildInspectNextAction` can hand out, the push path equals the quick-reference table, drift on a changed table row / missing annotation / changed committed file, the link once per session and path, always on a refusal, existing fields byte-identical, and the CLI-level fields of drive, push-init, push-prepare, inspect, submit-plan and the preflight.
- One existing case was adjusted with justification: "index lists the path file with its sha256" asserted exactly one index entry; the index now lists five, so the case finds the close entry by id and keeps the sha check.

## Why

PO idea of 2026-11-03 (plan row C19-G5): the first call of a standard command links a machine-readable runbook that states the prerequisites and the steps in order, kept current by construction. Stage 1 generated the close path only.

## Evidence (in the clone, one suite at a time)

- `generate-runbook.test.mjs`: 20 tests, 20 pass (RED before the implementation: 13 of 20 failed).
- `pipeline-state-inspect.test.mjs`: 26 of 26 pass. `pipeline-start-preflight.test.mjs`: 98 of 98 pass.
- `apply --check` of the patch on the w190 state: exit 0.

## Not changed

- The close path document bytes. The `notGenerated` list of the close path. Any existing result field.
- Recovery branches that depend on state (buildInspectNextAction prints the structural action for the current state; the runbook names the verbs, not the branch).

## Not proven / remaining (the checkpoint)

- `harness/verify-suites.json`: the `invariantPinned` text of `generate-runbook-tests` still describes the close path only (no new suite file was added, so no new registration or inventory row is needed).
- `NEVER_LIFTABLE_KERNEL_PATHS` (`lib/guard-maintenance-window.mjs`) and `docs/guard-maintenance-window-threat-model.md` do NOT yet list `plugins/pipeline-core/lib/runbook-link.mjs` (imported by pipeline-state, pipeline-start-preflight, push-init, push-prepare and close-coordinator); the kernel closure test is expected to be red until they do. `runbook-paths.mjs` is imported only by the generator and needs no entry.
- Existing suites of `close-coordinator`, `push-init` and `push-prepare` were not run after the change.
- `docs/push-release-flow.md` and the pipeline-start references do not yet name the runbook link.
- `push-prepare.mjs` argument errors print the typed line on stderr only; `submit-plan` prose output carries the line, not a JSON key.
- The session marker lives as a flat file under the Git common directory's agent-pipeline folder; the session authority registry walks only its own subfolder, which the inspect suite confirms, but a full Verify has not been run.
