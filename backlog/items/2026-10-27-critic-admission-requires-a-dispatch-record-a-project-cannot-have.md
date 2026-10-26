---
schema: pipeline.backlog-item.v1
id: pipeline.critic-admission-requires-a-dispatch-record-a-project-cannot-have
type: defect
owner: pipeline
status: open
created: 2026-10-27
priority: P0
release: 0.7.0
sprint: alfred
source: "Consumer blocker relayed 2026-10-27 (Glossover, PF-79, handover-07 Nachtrag 2) on the installed build 0.7.0+claude.20261026222010.17e002a: Epic 1 cannot start its Critic, so there is no signed push"
done_when: manual
---

# The last step before the Critic (packet admission) demands a dispatch record the project cannot honestly have

## Evidence (consumer report, not yet reproduced here)

- The chain up to the finished Critic packet now runs without hand edits on pipeline files (PF-78 fixed): Verify in
  critic mode green, diagnostic evidence produced and registered (consumer commit 6b731be), preflight says
  `packet-ready` with a base before the Epic 1 code.
- The next step, admission of the packet, refuses: it wants a dispatch record (`evidence/dispatch-record-<taskId>.json`)
  that every Goldfish dispatch should have written. The project has none.
- TWO DIFFERENT CAUSES fit that sentence, and they need different fixes (Elephant correction 2026-10-27 after the
  D172 recon; the first version of this item assumed the second):
  (a) dispatches DID happen but no record was ever written. In this very repository a background `Agent` dispatch ends in
  `NGHF-PENDING-UNAVAILABLE` and the hook tells the Elephant to commit with the `Dispatch:` trailer and "write the
  dispatch record via scripts/dispatch-record-write.mjs"; that route is documented nowhere a consumer reads and needs
  host-observed pending state, so an Elephant that follows the briefing never produces a record. The repository's own
  wave dispatches of 2026-10-26/27 have trailers and no records either.
  (b) the range was never dispatched (human or undispatched agent code).
  The consumer's wording ("die jeder Goldfish-Auftrag hätte schreiben sollen") points to (a); only the consumer can
  confirm. Fix (a) needs a documented, executable record route; fix (b) needs the new shape of Wanted 2.
- The review-unit route and the historical route need such records too.
- How a record is written is described nowhere; the consumer handover had already listed that as a side finding.
- The consumer will not invent a record afterwards. That is correct: a retro-fitted record is a forged record.

## Wanted

1. Recon first (read only): which function inside admission refuses, with which code, and what exactly it reads from
   the record (`critic-packet-preflight.mjs` `localDispatchEvidence`, `historical-fresh-review-admission.mjs`,
   `critic-generic-batch.mjs`, `session-critic-finalizer.mjs`). Name the full set of facts the record is asked to
   prove, so a replacement can prove the same facts honestly.
2. (Only if the consumer confirms cause (b); BLOCKED on a PO decision, see the D172 recon notes Q1 to Q3: who may declare
   "no dispatch history", mixed ranges, unknown model/effort.) A sanctioned, honest route for a candidate range that has NO dispatch history: the packet binds the range to
   what is observable (commit list, authorship from git, the fact that no dispatch existed) and says so, instead of
   demanding a record that would be invented. It must be visibly distinguishable from a dispatched range in the
   evidence the Critic and the PO read, and it must not weaken the dispatched case.
3a. (Cause (a)) Recon, then make the post-hoc record route for a BACKGROUND dispatch real: what `dispatch-record-write.mjs`
   needs (request shape, host-observed pending state), whether an Elephant can produce it from the real briefing and the
   real hand-back, and one documented command sequence in the pipeline-start references and the dispatch skill. A record
   written this way states what was observed (briefing binding, hand-back, commit) and nothing it cannot know.
3. Where records are legitimately wanted, the producer is documented where the consumer looks: the pipeline-start
   references and the critic-review skill name `init-dispatch-record.mjs`, its input (a generated briefing) and the
   target path, and the refusal text names that route.
4. The refusal names the missing record path and the sanctioned alternative (see PF-80 for the error display).

## Acceptance

- A consumer project with committed work and no dispatch record can reach an admitted Critic packet without hand edits
  to pipeline files and without a forged record; the admission result states the range had no dispatch history.
- A range WITH dispatch history is judged exactly as before (no new accepted shape for dispatched work).
- A chain test: no-record project, prepare, admit; and the same project with one record.

## Boundaries

- Custody paths (`critic-packet-preflight.mjs`, `session-critic-finalizer.mjs`, `critic-generic-batch.mjs`): the
  independent Critic review stays a parent-owned batch gate. Held patch, operator applies it.
- Native consumer qualification, full Verify and PO acceptance are separate gates.
