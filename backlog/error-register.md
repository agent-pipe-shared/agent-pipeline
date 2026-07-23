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
