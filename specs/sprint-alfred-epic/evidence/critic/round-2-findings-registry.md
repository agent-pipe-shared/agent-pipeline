# Round-2 findings registry — sprint-alfred-epic design package

Neutral findings registry per `templates/prompts/critic-review.md` (input
contract for fix-verification dispatches): finding IDs with gap, severity,
evidence, and spec-ref only. No verdicts, no trajectory prose, no
dispositions, no implementor justification. All `file:line` references bind
to the reviewed base commit `ea392b28`, not to any later state.

- **R2-F1** · major · `spec.md` §4.1 asserts the TP-4 `hooks.json`
  `$comment` replacement is feasible through the existing
  human-guard-override signature ceremony with "no new authorization route
  … required", unreconciled against
  `templates/prompts/agent-obligations.md:79-84`, which states that for
  Pipeline plugin source in a source checkout the override plans
  `author-repair-required` rather than `planned`, and that needing such a
  path is a stop condition; TP-4's pattern
  (`plugins/pipeline-core/hooks/hooks\.json$`, `agent-obligations.md:91`) is
  plugin source in this checkout; mechanism at
  `plugins/pipeline-core/lib/human-guard-override.mjs:2458-2460`. Spec-ref:
  successor to B-F3; `agent-obligations.md` §2.
- **R2-F2** · minor · `acceptance.md:34` §B header labels the criteria
  "(2026-08-27 class)" while IR-3 (`acceptance.md:40`) covers the four seed
  interruption classes re-dated in the same commit to 2026-08-27,
  2026-08-18, and 2026-08-08 (`spec.md` §6.1). Spec-ref: A-F2 (incomplete
  propagation).
- **R2-F3** · minor · `ea392b28` carries `AI-Assisted: true` and no
  `Dispatch:` trailer in either form sanctioned by `agent-obligations.md`
  §6; the pattern spans three consecutive design commits. Spec-ref: A-F1 /
  B-F10; `agent-obligations.md` §6 (GIT-03).
- **R2-F4** · minor ·
  `specs/sprint-alfred-epic/evidence/design-authoring-record.json:45`
  declares the PRD marker "bound to spec.md as committed in 584acbda",
  while at head the marker (`prd:4`) is recomputed and binds `spec.md` at
  `ea392b28`. Spec-ref: `technical-spec-sha256` package invariant.
