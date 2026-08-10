# Closure evidence: profile-staged Goldfish-dispatch instruction

- **Item:** `2026-08-09-consumer-projects-have-no-goldfish-dispatch-requirement-for-implementation.md`
- **Decision:** option (c) from the item's own Direction section — staged by
  project profile — chosen by the PO, 2026-08-10, with an explicit scope
  limit: instruction-level only, no guard-technical enforcement.
- **Fix commit:** `4b730f41e036238369a5aba74057139f8581ed88` (GF-088,
  goldfish-implementor) — adds to `plugins/pipeline-core/skills/pipeline-start/SKILL.md`'s
  "Gate authority and autonomous continuation" section, immediately after
  GF-083's Critic-review requirement: "Implementation work under an `epic`-
  or `feature`-profile plan is dispatched to a Goldfish subagent (via the
  Agent/Task tool) rather than written directly by this session; a
  `mini`-profile plan may be implemented directly. This is a followed
  instruction, not a technically guard-enforced rule — no guard blocks or
  detects a non-dispatched write."
- **Independent verification (Elephant, this session):** `git show
  4b730f41` reviewed directly: touches only `SKILL.md`, matches the exact
  three profile values (`epic`/`feature`/`mini`) confirmed against
  `pipeline-state.mjs`'s `submit-plan --profile` validation, correctly
  states the instruction-only (non-guard-enforced) nature per the PO's
  explicit scope limit.
- **Not reopened by this closure:** the sibling proportionality question
  (`2026-08-09-push-approval-signature-ceremony-is-not-staged-by-project-profile.md`)
  was separately declined by the PO in the same decision round — see its own
  closure evidence.
