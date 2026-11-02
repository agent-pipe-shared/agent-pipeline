# w87 — the Claude intake capture action prints the working text-file form with its digest (candidate 18, C18-14)

Edits `plugins/pipeline-core/lib/project-onboarding-v3.mjs` and `plugins/pipeline-core/lib/claude-intake-prompt-capture.test.mjs` only. Criterion binding: AC-145 is the closest existing accepted criterion (fresh bounded attempt under its unchanged Spec text); the PRD and the Spec are unchanged.

## What it adds

- The Claude branch of `intakeCaptureAction` now returns, next to `applyAction` (turn reference) and `existingFileApplyAction`, a typed `textFileApplyAction`: `intake-capture-apply --root <root> --text-file scratch/onboarding-intake.txt --text-file-sha256 <sha256-of-scratch-text-file> --activate --runner claude`.
- Its guidance names the file (`scratch/onboarding-intake.txt`), says the PO's first material message goes there verbatim and once, and names the digest command `sha256sum scratch/onboarding-intake.txt` (a form the closed shell grammar admits). A consumer PO no longer has to give the material twice when the native reference is unusable.
- The refusal raised for a native text-turn reference (`INTAKE-TEXT-TURN-REF-*`, from `intakeTextTurnReferenceFailure`) carries the same pointer sentence in its message.
- `intakeCaptureAction` is now exported so the test can read the action directly (additive; no behaviour change).
- Unchanged: capture semantics, consent gating, who may capture, every code, the non-Claude branch, `applyAction` and `existingFileApplyAction` of the Claude branch. The auto-take of the first message as intake text is not part of this slice.

## Tests

New cases in `claude-intake-prompt-capture.test.mjs` (written first, RED against the original code, then GREEN): CIP004 pins the exact argv of the three Claude actions and the guidance, and that the non-Claude branch is unchanged; CIP005 pins the pointer in the refused-reference message. No existing assertion was moved or weakened (QG-04): the one guidance sentence of the Claude branch was reworded, and no existing case pinned it.

## Checks (slice clone)

- `claude-intake-prompt-capture.test.mjs`: 5 of 5 pass (3 existing, 2 new).
- `intake-material-reference.test.mjs`: 13 of 13 pass.
- `project-onboarding-v3-argv-closure.test.mjs`: 42 of 42 pass.
- `harness/scripts/check-consumer-safe-paths.test.mjs`: 9 of 9 pass.
- The patch applies to the real HEAD (`git apply --check` exit 0); `w87-...check.test.mjs` pins that and the touched-file list (3 of 3 pass).

## Not changed / not proven

- The refusal texts of `INTAKE-CAPTURE-TEXT-AMBIGUOUS` (`plugins/pipeline-core/scripts/project-onboarding-v3.mjs`, line ~151) and the `CLAUDE-INTAKE-REFERENCE-SHAPE` / `CLAUDE-INTAKE-CAPTURE-UNAVAILABLE` unavailability codes (`plugins/pipeline-core/lib/claude-intake-prompt-capture.mjs`, lines ~101, 220, 239) live outside this slice's two files and do not carry the pointer yet. A follow-up slice with those files in scope is needed.
- Not run: `project-onboarding-v3.test.mjs` and other suites that might pin the Claude capture guidance wording, the full Verify, and a plugin-managed consumer run.
- `textFileApplyAction` admission by the live guard grammar was not exercised beyond the argv-closure suite.
