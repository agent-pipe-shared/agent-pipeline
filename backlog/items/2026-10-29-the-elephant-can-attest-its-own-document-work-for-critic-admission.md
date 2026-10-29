---
schema: pipeline.backlog-item.v1
id: pipeline.the-elephant-can-attest-its-own-document-work-for-critic-admission
type: workflow-improvement
owner: pipeline
status: open
created: 2026-10-29
priority: P1
release: 0.7.0
sprint: none
source: "PO direction 2026-10-29 (chat, Toolbox consumer finding): the dispatch record write should also let the Elephant add its own work afterwards, so the Critic can review it"
done_when: manual
---

# The Elephant can attest its own document work for Critic admission

## Evidence

A Toolbox consumer reached `session-critic-finalizer admit` and was refused with `CPP-REVIEW-ADMISSION`: "found 0 ... the expected record is `evidence/dispatch-record-<taskId>.json`". Critic admission wants a dispatch record that attests that a Goldfish delivered the reviewed state. Everything since the first review round was Elephant work on documents and pipeline state: a spec addendum, PRD A8, the adoption rebind, review round 2 and the state file; the only code change was comments. There is no Goldfish record for that work, and the Pipeline itself demanded these corrections.

The existing route does not cover it: `critic-packet-preflight.mjs` offers `dispatch-record-write.mjs --attested-request` (schema `pipeline.dispatch-attested-request.v1`) only when the reviewed range carries a Goldfish `Dispatch:` trailer, and its request names a briefing and a Goldfish hand-back.

## Proposal

1. **A second attested kind: `elephant-authored`.** The Elephant writes a dispatch record for a range it authored itself, through the same `dispatch-record-write.mjs` writer, with `producer: elephant` stated in the record (never passed off as a Goldfish) and the base and candidate commits bound.
2. **Scope is closed, not open (EL-01 stays intact).** The writer accepts the kind only when every path in the range is a document, spec, state, backlog or evidence path, or a comment-only change of a code file (checked by the writer from the diff, not claimed by the Elephant). Any other changed path refuses the kind and names the path; implementation still needs a Goldfish record.
3. **The Critic sees it as it is.** The Critic packet carries the producer kind, so a review of Elephant-authored text is labelled as such; `dispatch-record-strip-for-critic.mjs` keeps stripping the same fields.
4. **The refusal text names the route.** `CPP-REVIEW-ADMISSION` with zero admitted records and no Goldfish trailer says that an Elephant-authored range can be attested with `dispatch-record-write.mjs --elephant-attested-request <request.json>`.

## Open question for the PO (tile)

Whether a comment-only code change counts as document work for this kind, or only files without executable content do. The proposal above allows comment-only changes because the Toolbox case needs it.

## Acceptance

- The Toolbox case (documents, state, comment-only code) is admitted by `session-critic-finalizer admit` after one `dispatch-record-write.mjs` call by the Elephant.
- A range that changes executable code is refused for this kind, naming the first offending path.
- The record states `producer: elephant`; the packet shows it.
- Pin tests: admitted document range, refused code range, refused mixed range, comment-only classification (including a diff that hides code in a comment-looking line).
- Kernel paths are involved (`critic-packet-preflight.mjs`, `dispatch-record*.mjs`): held patch under the Guard Maintenance Window.
