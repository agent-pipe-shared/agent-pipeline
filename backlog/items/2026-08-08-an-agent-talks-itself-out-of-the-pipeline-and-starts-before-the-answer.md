---
schema: pipeline.backlog-item.v1
id: pipeline.agent-talks-itself-out-of-the-pipeline
type: defect
owner: pipeline
status: closed
closed_at: 2026-08-11
closure_repository: self
closure_commit: 94ee0b4049dfeab280a252d7a2064b409da46d46
closure_evidence: evidence/dispatch-record-NVA-BL-28.json
created: 2026-08-08
due: 2026-08-22
source: "Happy-path test of the local 0.5.4 build in a fresh empty directory, 2026-08-08, observed by the PO."
---

# An agent recommends against the Pipeline on its own judgement, and starts work before the answer

## What happened

A session opened in an empty directory where the Pipeline was available but not
yet adopted. The agent's opening message did three things in sequence:

1. named the Pipeline and described it accurately;
2. **judged it "rather overkill" for the task at hand** and offered to install it
   only if asked;
3. stated *"I will not touch any of it without your yes"* — and then immediately
   created the first project file.

The PO answered *"yes, you should definitely install the Pipeline"*. By then the
work had already begun outside it.

## Two distinct defects, and the second is worse

**The agent overrode a recommendation it had just given.** Whether a governed
delivery workflow is proportionate to a task is not the executing agent's call to
make unprompted. Presenting it as "overkill" is not neutral information; it is a
recommendation against, delivered by the party whose work the Pipeline would
constrain. The honest form is to state what adoption costs and what it buys, and
let the human decide — or, if a default is wanted, to make the default explicit
in the ruleset rather than in an ad-hoc judgement per session.

**It began work before the answer.** The consent sentence and the first file
write are in the same turn. That is the more serious half: the sentence creates a
belief that nothing is happening while something is, and it produced exactly the
mess the next turn had to reason about — an existing file the Pipeline then had
to adopt or discard.

## Why this is a Pipeline defect and not merely a model slip

The onboarding surface says the project is "available but not active" and offers
adoption. It does not say what an agent should do while unadopted, and it does not
say that starting deliverable work is itself a decision the human has not made.
An instruction absent from the contract will be filled in by judgement, and this
is what that judgement looks like.

There is a second-order effect worth naming: the whole value proposition of the
onboarding path is that a fresh project reaches a governed state *before* work
accumulates. An agent that produces artifacts first inverts that, and every later
step inherits the inversion.

## Direction, not a design

Not designed here.

1. **State the unadopted-session contract explicitly.** What may an agent do in a
   repository where the Pipeline is present but not adopted? Reading and answering
   are plainly fine. Creating deliverable files is the case that needs a rule.
2. **Remove the proportionality judgement from the agent.** If "this is too small
   for the Pipeline" is ever the right answer, it belongs to the human or to a
   configured default, not to a per-session opinion from the executor.
3. **Make the consent sentence true by construction.** If an agent says it will
   not act without a yes, nothing in the same turn may act. Whether that is a
   wording rule or an enforced one is the question.

## Triggering situation

Fresh empty directory, local `0.5.4+claude` build, Claude runner, PO asked for a
small browser game. Not independently reproduced in this repository, which is
already adopted and therefore cannot exhibit the unadopted-session case.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** Closed (2026-08-11), partial — Direction points 1 and 2
  landed, point 3 explicitly deferred.
- **Rationale:** `plugins/pipeline-core/skills/pipeline-start/SKILL.md`'s
  onboarding-consent section (the file actually read at the opening turn of
  a fresh unadopted session — confirmed the briefed candidate,
  `onboarding-recovery.md`, is lazily loaded and would NOT have been read at
  the point this incident occurred) now states both rules explicitly: no
  deliverable-file creation before the human's actual adoption answer, and
  no unprompted proportionality recommendation by the agent (commit
  `94ee0b4049dfeab280a252d7a2064b409da46d46`, verified via
  `check-doc-contracts.test.mjs` 36/36 plus two more real suites touching
  this area, both green). Point 3 ("whether the consent sentence is true by
  construction should be a wording rule or a technically enforced one") is
  explicitly NOT decided — the item's own text frames this as open, and the
  dispatch correctly implemented only the wording-rule half rather than
  picking an enforcement mechanism unprompted.
- **Assignment (if accepted):** point 3's enforcement question is PO
  territory if it is ever picked up — not filed as a new item here to avoid
  inventing scope unprompted.
- **Date:** 2026-08-11
