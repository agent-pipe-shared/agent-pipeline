# Error Register — curated triage authority

This is the sole public form authority for the error register. It is a small,
sanitized board of semantically consolidated friction classes, never an incident
log, chronology, analytics source, or briefing context. It starts intentionally
empty; do not copy private rows or history here.

The only allowed table form is:

| Class | Category | Triage |
| --- | --- | --- |
| Independent review context can be contaminated by coordinator status traffic. | process | new |
| Production delivery provenance can be incomplete when required dispatch metadata is omitted. | process | new |
| Cross-repository guard overrides can bind audit storage to the coordinator checkout instead of the target repository. | tooling | new |
| Open-ended reference-variant hardening can expand review scope and delay delivery. | process | recurring -> mechanism: prefer closed structured channels with fail-closed validation before adding free-text variant parsers |
| Retained public authority copies can drift from active bytes after an approved correction. | quality | new |
| Code exercised only on one host OS can carry unnoticed OS-specific assumptions (path-separator literals, permission-bit semantics, self-invocation URL comparison, directory-fsync behavior) that only an actual native run on the other OS surfaces. | quality | recurring -> template: a cross-platform portability claim must cite evidence from an actual native run on the target OS, not code review or same-OS test coverage alone |
| Platform-specific filesystem and privilege assumptions can make a declared host surface unusable. | tooling | new |
| Composed local read-only inspections can be misclassified as cross-root mutation. | tooling | recurring -> deferred: preserve fail-closed root enforcement and add closed command-shape coverage before changing the guard |
| Mandatory design-close records can be blocked as implementation changes before the approval gate. | process | new |
| A declared attended-human-override requirement can execute unenforced when the same sanctioned writer is invoked outside the intercepted tool surface. | safety | new |
| A signed authority binding can be silently replaced by an ordinary unsigned submission that rebinds the same authority field. | safety | new |
| An independent review can be dispatched below its mandatory tier when the escalation trigger is read from a generated projection instead of the routing authority. | process | recurring -> mechanism: cite the routing authority file for the duty, never a generated compatibility projection, and derive the tier from the bound PRD rigor and risk class plus the diff class |
| A review packet can name the canonical handover as evidence, offering the reviewer exactly the prior narrative its contract excludes. | process | new |
| A publication chain can be complete in its executor while lacking producers for the evidence records that executor requires, leaving no honest path that does not end in self-written attestations. | tooling | new |
| An in-place verification abort can write terminal evidence that a later reader cannot distinguish from a genuine failure of the same candidate. | quality | new |
| A guard's behaviour can be asserted from working-tree source while an older installed build is the one actually intercepting, so the reasoning describes code that never ran. | quality | recurring -> mechanism: establish enforced behaviour by invoking the installed artifact and reading its exit status, never by reading the working-tree source of the same guard |
| A long-lived branch can re-derive a capability that already exists more completely upstream, producing a partial local validator that accepts records the upstream one refuses. | process | recurring -> mechanism: before implementing a named schema or capability, check whether the integration target already carries it, and take the divergence to the rebase rather than reconstructing it locally |
| A closed value grammar can be mistaken for a privacy boundary when its admissible shapes still include credentials and digests of arbitrary text. | safety | new |
| An extension channel can inherit a namespace registry written for a different trust context, admitting namespaces the new context must never retain. | safety | new |

Use one concise, generic class per distinct root cause. Similar classes are
merged; the board holds at most approximately 30 classes. `new` is allowed for
a first qualitative observation. A recurring class must be resolved in the same
close using exactly one of `recurring -> mechanism: <sanitized action>`,
`recurring -> template: <sanitized action>`, `recurring -> lesson: <sanitized
action>`, or `recurring -> deferred: <reason>`. Prefer mechanism, then
template, then lesson. A bare recurring marker is invalid.

Never add counts, numeric order, frequency, priority, dates, raw events,
people, providers, models, sessions, hosts, accounts, repository coordinates,
paths, credentials, or diagnostic excerpts. Never inject, cite, or load this
board in a Goldfish or Critic briefing.
