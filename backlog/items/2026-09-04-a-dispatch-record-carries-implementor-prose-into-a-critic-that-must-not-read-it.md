---
schema: pipeline.backlog-item.v1
id: pipeline.a-dispatch-record-carries-implementor-prose-into-a-critic-that-must-not-read-it
type: defect
owner: pipeline
status: open
created: 2026-09-04
sprint: nova-b
done_when: manual
tracking: "Nova B — the dispatch record is the only artifact that binds a commit to its work package, so a Critic needs it; it also carries the implementor's narrative, which the Critic contract forbids as input. There is no way to hand over one without the other."
source: "Reported by the round-2 Critic on the capture-evidence package, 2026-09-04, as briefing violation 1 (contaminated dispatch). The dispatch was built by the Elephant from templates/prompts/critic-review.md and referenced evidence/dispatch-record-NVA-B-REDFIX-1.json as authorship evidence, which the template itself prescribes."
---

# A dispatch record carries implementor prose into a Critic that must not read it

## The conflict, stated exactly

`templates/prompts/critic-review.md` requires both of these, and they collide:

- **Dispatch records are input.** "Dispatch-record evidence (authorship
  evidence — the Critic can only verify diff authorship when dispatch records
  are in the evidence set)". Without it the Critic cannot check `commits`,
  `report.changedFiles`, `outcome`, or whether a `Dispatch:` trailer resolves.
- **Implementor prose is not.** For a fix-verification round: "the input
  describing what was fixed = a neutral findings registry (the prior finding IDs
  `F1..Fn`), NEVER the implementor's justification prose for why/how it was
  fixed (CR-02/EL-09)."

`report.text` is a mandatory field of the record and holds exactly that prose.
So handing over the record satisfies the first requirement by violating the
second. There is no spelling of the dispatch that satisfies both today.

## The measured instance

On the round-2 review of the capture-evidence package, the referenced record's
`report.text` carried roughly 1,500 characters of per-finding narrative — "F1
fixed / F2 fixed", each with its rationale — including a self-assessment of the
exact output channel one of the round's new findings concerns.

The reviewer disclosed it rather than absorbing it, and bounded the effect
honestly: it read the field in the same tool batch as the source file, so it
claimed no temporal precedence for the overlapping finding, and noted that the
finding stands on the code and on the file's own doc comment independently. That
is the contract working. It does not make the input legal.

## Why the existing remedy does not reach this

The repository already solves the same shape for backlog items.
`plugins/pipeline-core/scripts/backlog-item-strip-for-dispatch.mjs` exists
precisely because an item's own Triage and Closure prose records a prior verdict
about the thing under review — the "circular measuring stick" incident. The
dispatch cites the stripped copy, never the raw item.

No equivalent exists for dispatch records. The Elephant has no way to produce a
record that carries the binding fields and not the narrative, so the rule is
unenforceable in practice and was in fact broken by a dispatch built correctly
from the template in every other respect.

## Direction to evaluate

The reviewer named the remedy: reference a stripped record exposing only
`taskId`, `agentType`, `model`, `effort`, `commits` and `report.changedFiles`.

That is a sibling of the existing stripper and could be one, but three questions
come first:

1. **Is `report.changedFiles` itself safe?** It is a path list, so probably —
   but an entry of the form `"<path> - why it changed"` is permitted by the
   template, and the tail of that is implementor rationale.
2. **Should the stripping be the Elephant's step or the Critic's?** The backlog
   stripper is explicitly the dispatcher's job, "not a disregard instruction
   asked of the Critic". Consistency argues for the same here; a fail-closed
   argument argues the Critic should refuse an unstripped record outright, which
   would make the rule enforceable rather than merely stated.
3. **Does `outcome` belong in the safe set?** It is one enum value, but
   `completed` versus `partial` is a claim about the work's success, which is
   the reviewer's own question to answer.

## Affected artifacts

- `templates/prompts/critic-review.md` — carries both requirements
- `plugins/pipeline-core/scripts/backlog-item-strip-for-dispatch.mjs` — the
  existing sibling and the obvious model
- `templates/prompts/goldfish-task.md` — defines the record's shape, including
  `report` as an object with `text` and `changedFiles`
- `plugins/pipeline-core/scripts/dispatch-authorship-verify.mjs` — the consumer
  whose needs define the minimum safe field set
- `roles/critic.md` — CR-02/EL-09, the input contract
