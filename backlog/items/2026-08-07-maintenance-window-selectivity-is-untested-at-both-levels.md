---
schema: pipeline.backlog-item.v1
id: pipeline.maintenance-window-selectivity-is-untested-at-both-levels
type: defect
owner: pipeline
status: open
created: 2026-08-07
source: "Observation from a parallel Phoenix session on the marketplace snapshot that each guard hook carries only one maintenance-window test, sharpened and empirically checked against the live TP-2/TP-6/TP-7 window during the 2026-08-07 Nova session."
due: 2026-09-06
---

# A maintenance window's selectivity holds, and nothing tests it

## Description

The Guard Maintenance Window's central safety property is that a window lifts
**only** the rules it names. Nothing tests that property, at either level.

`plugins/pipeline-core/lib/guard-maintenance-window.test.mjs` covers scope
**validity** thoroughly — GMW02 and the F3 defense-in-depth cases reject
non-liftable rule ids at prepare time, at install time, and again at read time.
What no case covers is scope **selectivity**: that a valid, active window
naming one liftable rule leaves a different liftable rule refused. Every
`windowCoversRule` assertion in the suite queries a rule the window already
contains.

At hook level the coverage is one case each, and they are not equivalent to one
another. `guard-gate-strength.test.mjs` GST20 does carry a negative — it asserts
that a kernel path stays refused while an ordinary plugin file is lifted under
the same GS-6 window — so the original observation understates it.
`guard-testpath.test.mjs` TP09 is a pure happy path: an armed window scoped to
TP-1 lifts a matching Edit, and nothing else is asserted.

The consequence of a regression here is not subtle. `windowCoversRule` reduces
to `window.scopeRuleIds.includes(ruleId)`, and each guard passes its own
`matched.id` into it. If either the membership test or the id being passed
degraded, a window opened for one protected test path would open every
protected test path, and the suites would stay green.

## Triggering situation

A Phoenix session reviewing the marketplace snapshot noted that the two guard
hooks carry one maintenance-window test each and flagged it as thin for a
feature that can disable guard rules. The Nova session verified the claim
rather than accepting it, corrected the GST20 half, and then checked the
property empirically against a genuinely signed, live window scoped to
`TP-2,TP-6,TP-7` by invoking `guard-testpath.mjs` through stdin exactly as the
hook does:

```text
TP-3 (out of scope): REFUSED (exit 2)
TP-1 (out of scope): REFUSED (exit 2)
TP-2 (in scope):     ALLOWED [window-lifted]
TP-6 (in scope):     ALLOWED [window-lifted]
```

So selectivity is intact in the current build. This item is therefore not a
live defect but an untested invariant — the class of gap that stays invisible
until the day it is not intact.

## Affected artifact

- `plugins/pipeline-core/lib/guard-maintenance-window.mjs` — `windowCoversRule`
  and the scope membership test it performs.
- `plugins/pipeline-core/lib/guard-maintenance-window.test.mjs` — the library
  suite, where the selectivity case belongs.
- `plugins/pipeline-core/hooks/guard-testpath.test.mjs` — TP09, the pure
  happy-path hook case.
- `plugins/pipeline-core/hooks/guard-gate-strength.test.mjs` — GST20, which
  already carries the kernel-path negative and is the model to follow.
- [ADR-0058](../../docs/adr/0058-guard-maintenance-window.md).

Both hook suites are themselves protected test paths (TP-2, TP-6), so this work
needs a maintenance window of its own — the same signing round that unblocked
the ADR-0059 coverage.

## Proposal

Add, at library level, a case asserting that an active window scoped to one
liftable rule reports `covered: false` for a different liftable rule — not
merely for an invalid or non-liftable id, which is already covered.

Add, at hook level, the negative each suite is missing: for `guard-testpath`, a
window scoped to one TP rule while the edit matches a different TP rule, which
must stay refused. `guard-gate-strength`'s GST20 already has its negative; the
gap there is narrower and may need nothing.

Consider also pinning the two states adjacent to selectivity that decide
whether a lift applies at all: an expired window, and a closed one. If the
library suite already covers those, say so rather than duplicating them at hook
level — the point is the invariant, not the case count.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
