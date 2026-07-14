# Error Register — curated triage authority

This is the sole public form authority for the error register. It is a small,
sanitized board of semantically consolidated friction classes, never an incident
log, chronology, analytics source, or briefing context. It starts intentionally
empty; do not copy private rows or history here.

The only allowed table form is:

| Class | Category | Triage |
| --- | --- | --- |

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
