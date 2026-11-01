# w65 — the happy-path command chain per runner is a lazily loaded start reference (candidate 17, PO request of 2026-11-01)

Applies on the nine-patch chain; docs and one pin test.

## What went wrong

The PO asked for an "assembly manual" for the happy path: runners get lost between a ready bootstrap and a push because no document lists the lifecycle verbs in order with their
flags. A read of the shipped documents found the chain scattered over `design-course.md`, `implementation-continuation.md`, the close-feature skill, the critic-review skill,
`antigravity-feature-close.md` and `docs/push-release-flow.md`, and found that `set-feature`, `submit-plan`, `approve-plan` and `set-phase` have no command line in any of them.

## Change

- New `skills/pipeline-start/references/happy-path.md`: five stages (design, implementation, Critic, close, push) in lifecycle order, each step one command or one owner reference, with the runner
  differences that the sources state (Claude `Agent`/`Task`, Codex `spawn_agent` worker, Antigravity prepare then `invoke_subagent`, the Antigravity single close entry, the Claude-only telemetry row, the
  runner's own approval prompt at the push). Flags for `set-feature`, `set-phase`, `submit-plan` and `present-plan` were taken from the script's own refusal text, the rest from the owning document.
  Steps without a complete documented line say **no syntax documented** instead of inventing one, and a closing section lists the gaps.
- `SKILL.md` loads it in the typed lazy-loading list. The mandatory skill is at its 24 KiB cap, so the same change shortens three other bullets (workflow-dispatch, antigravity-native-dispatch,
  transcript-forensics) by wording only; the pinned lazy-loading intro is untouched.
- New pin `lib/pins/happy-path-guide-names-only-existing-scripts.test.mjs`: every script the guide names ships in `scripts/`, the skill lists the reference, the gap markers stay, and the guide holds
  no host path. 144 tests pass across the start-skill, payload-budget, reground and doc-contract suites plus the pin.

## Not changed / not proven

- Not a generated section of the ready message and not a tracked file in the consumer repository (the PO's build note allowed either); a reference loaded on demand keeps the mandatory payload bounded.
  Projecting it into the ready message is a follow-up if the lazy load proves too quiet.
- The chain was assembled from documents and refusal text, not run end to end on any runner. Nothing was measured on Codex or Antigravity.
- Open conflicts recorded in the guide: the `--architecture-impact` value lists differ between the close-feature skill and the Antigravity close reference; complete lines for `approve-plan`,
  the Critic preflight and the `plan-transition` phases are not documented.
- The pin was not mutation-checked.
