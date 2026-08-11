---
schema: pipeline.backlog-item.v1
id: pipeline.agents-are-judged-by-rules-no-artifact-ever-tells-them
type: defect
owner: pipeline
status: closed
closed_at: 2026-08-11
closure_repository: self
closure_commit: d71aa710abe437ac1c81bece5bacb12c0355529b
closure_evidence: specs/sprint-nova-epic/evidence/backlog/2026-08-11-pareto-triage-report.md
created: 2026-08-08
due: 2026-08-15
source: "PO hypothesis, 2026-08-08: 'kann es sein dass sie durch die vielen neuen guards und vorgaben zu wenig Pflichtwissen darüber haben was erlaubt ist und was nicht und dadurch zu viele guard blocks und hook blocks produzieren?' — measured and confirmed by the Elephant the same day."
---

# Every dispatched agent is judged by rules that no artifact it reads ever states

## The measurement

```
rg -c 'one simple command|closed shell grammar|GUARD-PARSE-UNSUPPORTED' \
   plugins/pipeline-core/agents templates/prompts roles
```

Zero hits. The closed shell grammar enforced by `guard-lifecycle-ready.mjs` —
exactly ONE simple command per Bash call, no `&&`, no `;`, no redirects, no line
continuations, only bounded `rg | rg` and `rg | head` pipelines — appears in
**no agent contract, no dispatch template, and no role file**. A Goldfish learns
it the way every Goldfish before it did: by being refused.

The same holds for the other obligations a dispatch is measured against. They
are enforced at runtime and absent from the briefing surface:

| Obligation | Enforced by | Stated in a briefing artifact? |
|---|---|---|
| Closed shell grammar | `guard-lifecycle-ready` | no |
| Protected test paths (TP-1…TP-10), and that there is **no** in-session override for plugin source in a source checkout | `guard-testpath` + `recordHumanGuardDenial` | no |
| `scratch/` is gitignored here, so work left there is lost | — (nothing enforces it) | partially, and it said the opposite until today |
| Draft-phase write prefixes | `guard-devplan` | no |
| Six mandatory briefing fields, by heading | `guard-dispatch` | yes — `goldfish-task.md` |

Only the last row has a stated rule. It is also the only one that was never the
cause of a wasted dispatch.

## Why this is the expensive kind of defect

An agent that does not know a rule does not fail once. It fails, reads a refusal
written for a different reader, forms a wrong theory, and retries — and each
retry costs a tool use from a budget that is also the stop condition. Measured
instances:

- **PHX-ADJ** (PO, same day): 50 tool uses burned, nothing delivered. Its last
  sentence names the cause — it was fighting the shell grammar, which its
  briefing never mentioned. Re-dispatched with one added paragraph, it worked.
- **R1B** (this repo, 2026-08-08): dispatched with the grammar paragraph added by
  hand; still truncated at 65 tool uses, ending mid-sentence at *"Now let's stage
  and commit the changes."* The work was staged and green; the Elephant finished
  the commit itself.
- **C2** (this repo, 2026-08-06): truncated at 53 tool uses with two acceptance
  criteria uncommitted.

The pattern is not that agents are careless. It is that the guard union grew
faster than the briefing surface, and the gap is carried by whoever writes the
briefing — by hand, from memory, differently every time. That is exactly the
failure mode `templates/prompts/goldfish-task.md` exists to prevent for the six
fields it does cover.

## Direction

1. **A single obligations block, shipped, not hand-copied.** One reference the
   dispatch template pulls in verbatim, stating the grammar, the protected
   paths, the no-override fact, and the scratch caveat. The template already
   proves the shape works.
2. **Derive it, do not transcribe it.** The C1 lesson from this same block: a
   hand-written second copy of a rule the guard owns drifts, and nothing catches
   the drift. The protected-path list has a machine-readable source
   (`project/guard-config.json`); the grammar has one implementation. What is
   shipped to agents should come from those, with a test asserting the two agree
   — the same contract-test shape as
   `hooks/guard-lifecycle-recovery-contract.test.mjs` and
   `scripts/pipeline-state-inspection-contract.test.mjs`.
3. **Refusals should teach.** `GUARD-PARSE-UNSUPPORTED` already prints the rule;
   `guard-dispatch` already names the exact missing fields. Both are good. The
   test-path refusal is the counter-example — it refuses without saying that no
   route exists, which is why three separate dispatches in two blocks tried to
   find one.

## Related

- `2026-08-08-the-test-path-guard-blocks-the-briefed-edit-and-offers-no-route.md`
  — the third instance of the refusal-without-a-route half of this.
- `2026-08-08-shipped-guidance-sends-agents-to-a-directory-a-gate-refuses.md` —
  the case where the shipped instruction was present and named the *wrong* guard.
- `2026-08-08-the-bootstrap-skill-grows-by-budget-raise-instead-of-by-module.md`
  — the obligations block is content, and content is what that item is about;
  sequence them.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
