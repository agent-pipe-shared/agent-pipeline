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
  that every Goldfish dispatch should have written. The project has none, because Epic 1 code was delivered before any
  dispatch existed in it.
- The review-unit route and the historical route need such records too.
- How a record is written is described nowhere; the consumer handover had already listed that as a side finding.
- The consumer will not invent a record afterwards. That is correct: a retro-fitted record is a forged record.

## Wanted

1. Recon first (read only): which function inside admission refuses, with which code, and what exactly it reads from
   the record (`critic-packet-preflight.mjs` `localDispatchEvidence`, `historical-fresh-review-admission.mjs`,
   `critic-generic-batch.mjs`, `session-critic-finalizer.mjs`). Name the full set of facts the record is asked to
   prove, so a replacement can prove the same facts honestly.
2. A sanctioned, honest route for a candidate range that has NO dispatch history: the packet binds the range to
   what is observable (commit list, authorship from git, the fact that no dispatch existed) and says so, instead of
   demanding a record that would be invented. It must be visibly distinguishable from a dispatched range in the
   evidence the Critic and the PO read, and it must not weaken the dispatched case.
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
