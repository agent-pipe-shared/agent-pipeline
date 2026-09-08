# Continuity and placement Governs coverage

Task `NVA-B-ADR-GOVERNS-CONTINUITY-6` adds declarations only. The raw,
machine-written parser capture is retained unchanged at
`scratch/NVA-B-ADR-GOVERNS-CONTINUITY-6/raw-parser-capture-before-rationale.md`.
The final machine capture is cited below after the corrected declarations.

## ADR-0060 — reachable handover placement and retention

- Decisions 1–2 make `docs/state.md` the mandatory first-reachable handover
  and make later topical relocation a follow-up. `harness/session-bootstrap.md`
  requires the full handover read; `templates/handover.md` supplies the
  canonical handover shape.
- Decision 3 separates durable rules from transient handover material.
  `roles/elephant.md` publishes the register-plus-ADR duty; the Goldfish and
  Critic role contracts publish the same canonical-state precedence; and
  `plugins/pipeline-core/skills/pipeline-start/SKILL.md` carries the
  foundational-decision-to-register path.
- Decision 4 makes shrinking/retention an operational duty. The current
  canonical ritual publisher is `plugins/pipeline-core/skills/close-block/SKILL.md`:
  it updates the sole open/next carrier and routes retained historical material
  into the archive path. The two rotation implementations themselves are
  declared by ADR-0066/0073, whose later decisions close ADR-0060 Decision 5.

No extra topical directory or automated durable-rule classifier is declared:
ADR-0060 explicitly rejects treating topical relocation as the primary write
and leaves extraction judgment to later rotation decisions.

## ADR-0063 — directory kinds, publication, and enforcement

- Decision 1's anchored root and tracked/ignored boundary are represented by
  `.gitignore`; exact dispatch-record placement is read by
  `plugins/pipeline-core/scripts/dispatch-authorship-verify.mjs` and exercised
  by its direct test.
- Decision 2's unanchored-directory rule is checked by
  `harness/scripts/check-directory-contract.mjs` and its direct test.
- Decision 3 requires both runtime and dispatch-facing publication. The current
  runtime readers are `harness/session-bootstrap.md` and
  `plugins/pipeline-core/skills/pipeline-start/SKILL.md`; the canonical
  dispatch templates are `templates/prompts/goldfish-task.md` and
  `templates/prompts/critic-review.md`. The generated common obligation
  surface is owned by `harness/scripts/generate-agent-obligations.mjs`, its
  byte-equality test, and `templates/prompts/agent-obligations.md`.
- Decision 4's deliberately lean check is the directory-contract checker and
  `harness/scripts/check-session-bootstrap-directory-contract.test.mjs`.

The header does not claim a whole-repository taxonomy: ADR-0063 defers that
Nightwing revision and the checker documents its narrow top-level/anchoring
contract.

## ADR-0066 — generalized two-trigger rotation and live write gate

- The explicit extraction-acknowledged path is implemented and tested by
  `plugins/pipeline-core/lib/handover-rotation.mjs` and
  `plugins/pipeline-core/scripts/handover-rotate.mjs`, with their direct tests.
- The independent closed-section path is
  `plugins/pipeline-core/scripts/rotate-handover-sections.mjs`, its test, and
  the close-block ritual.
- The hard-size PreToolUse gate is the source/test pair
  `guard-handover-size.*`, its live matcher registration in `hooks.json`, and
  both native bridges plus direct tests (`codex-pretool-guard.*` and
  `antigravity-pretool-guard.*`). The Antigravity adapter's live chain includes
  `guard-handover-size.mjs`; both adapter pairs are therefore declared instead
  of treating an unwired guard source as enforcement.
- Decision 3(a) names both close triggers. `close-feature/SKILL.md` and its
  `pipeline-state.mjs` writer/test are included as the current feature-close
  endpoint. They presently record the feature close and handover update but do
  not invoke a rotation; this is a disclosed integration obligation, not a
  claim that the missing call already exists.

## ADR-0073 — this repository's adopted placement and adaptation

- The repository-specific live artifacts are `docs/state.md`, the narrow
  `docs/state-archive/**` directory, and
  `governance/observation-doc-governance.json` for archive classification.
- The adopted shape reuses the shared section-scoped-v2 configuration library,
  explicit rotation script, hard-size guard, closed-section rotation script,
  their direct tests, and the close-block ritual.

ADR-0066 governs the general pipeline mechanism, its hook registration/native
adapter, and the unintegrated feature-close endpoint. ADR-0073 governs this
repository's concrete handover/archive placement and its adoption of that same
shared mechanism. Their overlapping implementation paths are therefore
intentional and do not merge their distinct decisions.

## Fixed-baseline proof

`scratch/NVA-B-ADR-GOVERNS-CONTINUITY-6/check.mjs` compares every
header-stripped ADR body to fixed baseline
`83a37b9d6a67f7050d1df9b4cc31dbd6efd949ea`, parses the headers with
`parseGovernsGlobs`, requires tracked/nonempty targets, confirms all four ADRs
are absent from `UNIVERSAL_ADRS`, and copies the approved status classifier
without its historical-write side effect. The final sanitized machine capture
is `scratch/NVA-B-ADR-GOVERNS-CONTINUITY-6/final-parser-capture-agy-adapter.md`.

The proof reports the local four-of-four increment. Its global
accepted/governed count is observational only because concurrent packages may
change it before parent integration.
