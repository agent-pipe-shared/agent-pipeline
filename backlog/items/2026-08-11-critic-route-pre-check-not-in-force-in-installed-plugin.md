---
schema: pipeline.backlog-item.v1
id: pipeline.critic-route-pre-check-not-in-force-in-installed-plugin
type: defect
owner: pipeline
status: open
created: 2026-08-11
sprint: alfred
due: 2026-08-25
done_when: manual
source: "Critic review (FAIL, F3) of NVA-BL-42 (plugins/pipeline-core/agents/critic.md, goldfish-deep.md, templates/prompts/critic-review.md, commit 08684e7874b79c04a44601c487f343be0dfaefa5), 2026-08-11."
---

# The A/G/S route pre-check landed in the repo checkout but is not in force in the runtime it governs

## Description

`NVA-BL-42` added a "route pre-check" duty to `plugins/pipeline-core/agents/critic.md`,
`plugins/pipeline-core/agents/goldfish-deep.md`, and
`templates/prompts/critic-review.md`: on an ARCHITECTURE/GUARDRAIL/SECURITY dispatch,
the Critic or goldfish-deep agent compares its requested route against its own
observed effective model identity and stops before substantive work if they
contradict. The diff correctly edits the repository source files.

The running agent, however, is loaded from the **installed plugin package**
(`~/.claude/plugins/cache/agent-pipeline/pipeline-core/0.5.4/agents/critic.md`),
not from the repository checkout. The Critic reviewing this exact commit
confirmed empirically that its own loaded `critic.md` carried neither new
paragraph — the diff had not reached the runtime that is supposed to enforce
it. The mechanism therefore only takes effect after a republish/reinstall of
the plugin package, and nothing in the commit, the originating backlog item's
Triage, or the dispatch record disclosed that dependency with an owner or
expiry, even though the commit message and closure notes described the
mechanism as now applying.

## Triggering situation

Found by the Critic reviewing `NVA-BL-42`'s diff (finding F3, FAIL verdict,
major severity — one of three majors the Critic weighed as independently
disqualifying for this self-referential GUARDRAIL-class diff). The Critic's
own dispatch was itself run under the pre-diff `critic.md`, which is direct
empirical proof of the gap, not an inference.

## Affected artifact

The plugin distribution/release path — whatever process moves
`plugins/pipeline-core/**` from the repository checkout into
`~/.claude/plugins/cache/agent-pipeline/pipeline-core/<version>/`. No single
source file is "wrong"; the gap is that landing a repo commit to an
agent-definition or template file is silently treated as equivalent to that
duty being live, when a separate release step actually gates it.

## Proposal

This is a release-process gap, not a code fix — do not brief it as a goldfish
dispatch. Two things would close it:

1. A disclosure convention: any commit that edits `plugins/pipeline-core/agents/**`,
   `plugins/pipeline-core/skills/**`, or `templates/prompts/**` and claims a
   new/changed agent duty takes effect should name, in its own commit message
   or the backlog item's Triage, that the duty is live in THIS repo checkout
   only until the next plugin republish/reinstall — so closure notes stop
   asserting present-tense enforcement for something still pending a release
   step.
2. Whatever local-development refresh path already exists for working on the
   ruleset itself (`harness/session-bootstrap.md`, "Working on the ruleset
   itself": `claude --plugin-dir <checkout>/plugins/pipeline-core` +
   `/reload-plugins`) should be the stated route to actually exercise a
   just-landed agent-definition change same-session, rather than assuming the
   installed package already reflects it.

## Related

- `2026-08-11` NVA-BL-42 Critic review (F1: broke the
  `codex-isolated-critic-protected-preimage.v1.json` content-integrity pin on
  `critic.md` without updating or disclosing it; F2: verify evidence was a
  hand-run single suite, not the calibrated `node harness/scripts/verify.mjs`
  gate) — both filed for direct fix, unlike this release-process item.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** deferred — owned by Sprint Alfred.
- **Rationale:** matches Alfred's confirmed scope — "mechanical governance,
  measurable rigor, and control integrity" (`docs/adr/0043-post-go-live-
  sprint-model.md`, 2026-08-17 amendment). Both proposed directions
  (a disclosure convention for release-pending agent-definition duties, and
  using the existing local-development refresh path to actually exercise a
  just-landed change same-session) are release-process/governance fixes, not
  urgent — not blocking current Nova/Phoenix work.
- **Assignment (if accepted):** next available Alfred slot.
- **Date:** 2026-08-17


### Dispatch attempt, 2026-08-18 (wave 1, dispatch NVA-W1-1) — pulled forward by mistake, not implemented

This item's own Triage above ("Decision: accepted, deferred to Sprint
Alfred" / "Assignment: next available Alfred slot") was mistakenly included
in a Sprint Nova wave-1 implementation batch. The dispatched Goldfish
correctly caught the contradiction (this item is Alfred's, not Nova's) and
stopped before touching anything -- no branch created, no files changed.
This item's Alfred deferral stands unchanged; it should not be picked up
again from a Nova session. Recorded here as a process note: the Elephant's
own wave-composition step missed this item's sprint assignment during
triage-of-triage vetting.
