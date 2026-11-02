# w92 — the remaining intake refusals point to the text-file form (candidate 18, C18-14B)

Edits `plugins/pipeline-core/scripts/project-onboarding-v3.mjs`, `plugins/pipeline-core/lib/claude-intake-prompt-capture.mjs` and `plugins/pipeline-core/lib/claude-intake-prompt-capture.test.mjs` only. Criterion binding: AC-145 is the closest existing accepted criterion (fresh bounded attempt under its unchanged Spec text); the PRD and the Spec are unchanged. Independent of w87 (a different file); no ordering needed.

## What it adds

- `claude-intake-prompt-capture.mjs` exports one sentence, `INTAKE_TEXT_FILE_POINTER`: write the PO's intake material verbatim to a file under `scratch/` and capture it with the text-file apply action that `project-onboarding-v3.mjs` prints (`--text-file <path> --text-file-sha256 <digest>`, digest from `sha256sum <file>`).
- `CLAUDE-INTAKE-REFERENCE-SHAPE` and `CLAUDE-INTAKE-CAPTURE-UNAVAILABLE`: the unavailable result now carries an additional `message` string ending with that sentence (the thrown shape error at the record path carries it too). `status` and `code` are unchanged; the fallback code only gets the message when no more specific code applies.
- `scripts/project-onboarding-v3.mjs`: the `INTAKE-CAPTURE-TEXT-AMBIGUOUS` error and the two argv-level "accepts exactly one of" errors end with the sentence; the reference-unavailable error now uses the result's `message` when present (code unchanged).
- No capture semantics, consent gating or codes changed.

## Tests

New case CIP006 in `claude-intake-prompt-capture.test.mjs` (written first, RED against the original code, then GREEN): each of the three refusal texts names `--text-file`, `--text-file-sha256`, `sha256sum` and `scratch/`. The unavailable-capture trigger was changed once after the first GREEN attempt (a tampered record instead of a deleted one, because a missing file carries its own error code); the assertion itself was not weakened. No existing assertion moved (QG-04): the pin in `pins/cross-runner-chat-intake-reference-needs-host-capture.test.mjs` is an unanchored regex on "accepts exactly one of ..." and still matches.

## Checks (slice clone)

See the dispatch report for counts: `claude-intake-prompt-capture.test.mjs`, `project-onboarding-v3-argv-closure.test.mjs`, `check-consumer-safe-paths.test.mjs`, and `w92-...check.test.mjs`.

## Not changed / not proven

- `lib/project-onboarding-v3.mjs` untouched. The argv-level duplicate check (lines ~451-456 of the script) is left as two identical blocks.
- Not run: the `pins/` suites beyond reading the one pin, the full Verify, a plugin-managed consumer run.
- The `message` field is additive on two unavailable results; consumers other than the script do not read it.
