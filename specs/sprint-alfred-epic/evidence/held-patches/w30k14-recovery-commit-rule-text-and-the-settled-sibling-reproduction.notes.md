# w30k14 — the recovery-commit rule is written down and the settled-sibling refusal is reproduced; the stage 2 change as briefed is NOT in this patch because it regresses an existing safety case (candidate 30k, C30K-K14, stages 0 and 1; stage 2 stopped)

Applies AFTER the integrated 30j tree (the clone int30j: the 30i chain plus every 30j lane): the patch is a delta on that state and does not apply to the real checkout before it (`apply --check` is exit 0 on the int30j clone, exit 1 on the real HEAD, as expected). The check test therefore never runs `git apply` against the repository. Criterion binding: AC-112 is the closest existing accepted criterion; the PRD and the Spec are unchanged. The Critic is suspended by the PO for candidates of this repository and no Full Verify ran, so this change is verified by tests only.

Source: `specs/sprint-alfred-epic/plans/parallel-slices-per-worktree-routes-2026-11-18.md`, stages 0, 1 and 2 of section 10 (stage 2 released by the PO on 2026-11-18). Nothing of stage 3 or 4 is built.

## Outcome in one paragraph

Stage 0 (text) is delivered. Stage 1 (the reproduction) was written first and is RED: the mechanism of section 4.1 is confirmed, a recovery commit on a settled lane's paths makes the running sibling's host commit fail with `native-concurrent-unowned-head`. Stage 2 as briefed (leave a sibling that `readSettledItemSliceIds` reports as settled out of `siblingScopes` and `inFlightSiblings`) was built and made the reproduction GREEN, but it turned the existing safety case `NGSP9F` (K-34) RED, and that case may not be weakened. So the premise of the source document does not hold at line 848 for one kind of "settled", and the stage was backed out of the patch (the net diff of `native-goldfish-host-state.mjs` is empty). The patch therefore carries stage 0 and the one stage 1 case that is green on the original code; the two red reproduction cases are in the section "Reproduction" below, not in the patch, so applying the patch cannot turn a suite red. This is a PO decision (D1 of the source document).

## What the patch changes

- `plugins/pipeline-core/skills/pipeline-start/references/workflow-dispatch.md`: one paragraph after the parallel host-commit paragraph (D76): (a) the Coordinator rule, land a recovery commit only while `session-authority-repair.mjs inspect --root <root>` (read-only) shows no native item reservation of another lane still in flight, otherwise wait until that lane ends, with the reason (the `native-concurrent-unowned-head` refusal); (b) the premise correction: the governed admission, the baseline-dirty refusal, the sibling-commit exception and the admission budget belong to the shared-tree host-commit route, and the clone-slice route adds only the patch export and the chain steps (D4: the clone-slice route stays); (c) the overlap-rule note D3: the guard skips the overlap check for an isolated call and the queue reservation covers governed items (text only). The paragraph states the rule as it holds today, including for a lane that is finished but not yet released (no stage 2 exemption is described); if D1 is decided for a narrower change, that sentence is the one to update. There is no second copy of the reference: `generate-vendored-canon.mjs` does not vendor it, and the two other copies under `specs/.../checkpoint-2026-10-12/` are historical evidence, not shipped files. The reference stays below its 32 KiB budget (28768 bytes).
- `docs/operating-tools.md`, Clone-slice route section: one sentence with the premise correction (D5).
- `plugins/pipeline-core/lib/native-goldfish-host-state.test.mjs`: documentation-contract case `NGHSK14` (RED before the paragraphs existed, GREEN after). Id: the case-completion channel needs ascending ids and the existing last id is `NGHS77`.
- `plugins/pipeline-core/lib/native-goldfish-host-stop-pair.test.mjs`: case `NGSPK14A`, two pending siblings, the first unsettled with an ordinary commit on its paths: the second one's host commit keeps refusing with `native-concurrent-unowned-head` and commits nothing (GREEN on the original code, pins what must stay). Id: ascending order after `NGSP9F`.

## Why stage 2 stopped (measured, not inferred)

A sibling's own host commit carries the trailer `Dispatch: <id> (goldfish)` (`agy-host-commit-execution.mjs`, the commit message). `readSettledItemSliceIds` also counts a slice as settled once a commit with that trailer touches its scope on HEAD (D40/D40b, `readOrchestratorCommitIntegratedSlices`). So the moment a running sibling lands its host commit it is "settled" by that read while it is still writing its lineage proof, and the stage 2 edit then stops the settle loop from waiting for it and stops the K-34 refusal from naming it. Measured in the clone, stage 2 as briefed:

- `NGSPK14` reproduction cases (below): GREEN.
- `native-goldfish-host-stop-pair.test.mjs`: 23 of 24 pass, `NGSP9F` FAILS (the second stop ended `authored-commit-recorded` where the case requires `NGHF-COMMIT-EXCEPTION` / `native-concurrent-sibling-commit-unrecorded`). Exit 1. The case was not restated: it is a safety examiner, not a text pin.

A probe of a narrower variant (not in the patch, a PO design call): skip a sibling only when its governed queue row is `cancelled` (not when it is integrated by commit evidence). Measured with `--name "NGSPK14|NGSP9F|NGSP9C|NGSP2"`: 9 of 10 pass; the cancelled-lane reproduction, `NGSP9F`, `NGSP9C*` and `NGSP2*` are green, and the integrated-by-trailer reproduction stays red, because a recovery commit with that trailer and a sibling's own host commit are the same shape in git and in the registry. Whether the host-commit marker line (the second line after the trailer) can tell them apart was not examined. D1 of the source document is therefore not "settled sibling" but "which settled kind", and the PO decides.

## Reproduction (RED on the original code; not in the patch)

Both cases use the fixture of `native-goldfish-host-stop-pair.test.mjs` (`setup`, `launch(0)`, `launch(1)`, both admitted, `finalizeNativeGoldfishHostReturn(..., { lockWait: { budgetMs: 0 } })` for the second one) and need `cancelUnstartedGovernedItemSlice` imported from `native-goldfish-host-state.mjs`:

- Cancelled lane: write `first.file`, `git add` and an ordinary `git commit -m "docs: land the finished lane by hand"`; then `cancelUnstartedGovernedItemSlice({ root, sliceId: first.id, reason: "finished, landed by hand", started: true, cancelClass: "integrated-elsewhere" })` (status `cancelled`); write `second.file`, finalize the second return. Expected `authored-commit-recorded` with the host commit on top of the ordinary commit. Original code: `recovery-required`, `NGHF-COMMIT-EXCEPTION`, `detail.reason` `native-concurrent-unowned-head`.
- Integrated lane: the same ordinary commit with the message `-m "docs: land the finished lane by hand" -m "AI-Assisted: true\nDispatch: SLICE-0 (goldfish)"` and no cancel. Same expectation, same original result.

## Tests (clone, `test-in.mjs`, one suite at a time)

- RED first, before any production edit: `native-goldfish-host-stop-pair.test.mjs --name NGSPK14` with the three cases of the first draft: 3 tests, 1 pass (the unsettled one), 2 fail (cancelled and integrated lane: `recovery-required`, `native-concurrent-unowned-head`). Exit 1. `native-goldfish-host-state.test.mjs --name NGHSK14` RED before the paragraphs existed (the first regex over `workflow-dispatch.md` did not match), exit 1. No separate evidence file; the counts are here.
- GREEN of the delivered state (final patch, clone commit after the `<plugin-root>` wording fix): `native-goldfish-host-stop-pair.test.mjs` 22 of 22, exit 0 (21 before plus `NGSPK14A`); `native-goldfish-host-state.test.mjs --name NGHSK14` 1 of 1, exit 0; `lib/pins/greenfield-machine-output-and-skill-budget.test.mjs` 15 of 15; `harness/scripts/check-consumer-safe-paths.test.mjs` 9 of 9; `harness/scripts/check-doc-contracts.test.mjs` 76 of 76; `harness/scripts/generate-vendored-canon.test.mjs` 8 of 8 (the vendored-copy sync check; all exit 0). The check test of this patch: 2 of 2 (`node --test`).
- NOT yet read at hand-back: the FULL `native-goldfish-host-state.test.mjs` run (about 2250 lines, started last, still running when the budget checkpoint fired). The only change in that file is the new case `NGHSK14`, which passes alone; the Coordinator should run the full file once, alone.
- `harness/scripts/check-verify-case-completion.test.mjs` (outside the write list, not changed) is already red on the base for many suites (for example `critic-course-admission` 455 against a pinned 353, `critic-dispatch-preflight` 654 against 616); for this suite the measured count of `native-goldfish-host-stop-pair` is 115 against a pinned 111, which is exactly the 4 assertion sites of `NGSPK14A`. The Coordinator restates those pins in one QG-04 extension hunk.

## Not changed

- `native-goldfish-host-state.mjs` and every other production file: untouched in the net diff. No new gate, no new status, no expiry, no record shape or digest byte.
- `guard-dispatch.mjs` (the overlap rule is changed by text only, D3), `goldfish-host-commit-recover.mjs`, the queue and the registry.
- Stages 3 and 4 (the attended Claude worktree probe and a Claude copy of the Antigravity shape): not released, not built.

## Not proven

- No Full Verify, no Critic round, no architecture-boundary run. Which raise site fired in the four real 30j incidents is not readable from the repository: the test shows that the settled-lane shape raises `native-concurrent-unowned-head` at the lineage loop (the ordinary-commit branch), not that this was the cause of all four.
- The order of `slice-queue cancel --started` and the recovery commit in the Coordinator's practice was not measured.
- Follow-up outside the write list (Coordinator): the new ids `NGSPK14A` and `NGHSK14` need case-completion policy rows (`cc-sync`), and the assertion-site counts of `native-goldfish-host-stop-pair` and `native-goldfish-host-state` in `harness/scripts/check-verify-case-completion.test.mjs` move (measured numbers are in the Tests section above).
