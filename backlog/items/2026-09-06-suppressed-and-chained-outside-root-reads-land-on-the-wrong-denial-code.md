---
schema: pipeline.backlog-item.v1
id: pipeline.read-scope-denial-code-accuracy-f3
type: defect
owner: pipeline
status: open
created: 2026-09-06
sprint: nova-b
tracking: "Nova B — NVA-B-READCONTAIN-1's T1 Critic (round 1) finding F3, carried in backlog/evidence/2026-09-06-nva-b-readcontain-1-findings.md but never given its own backlog/items/ entry. Filed now to close that tracking gap; the underlying behavior is unchanged and non-blocking (the command is still refused end-to-end, only the printed reason code is wrong)."
done_when: manual
source: "T1 Critic review (opus, max) of commit cbc30756252ff1573b53ab2ada34ae2f02569f8d, F3, recorded in backlog/evidence/2026-09-06-nva-b-readcontain-1-findings.md."
---

# Suppressed and chained outside-root reads land on the wrong denial code

## The gap

Two command shapes lose their true-reason denial code without losing
refusal: a single outside-root read with a trailing `2>/dev/null` stderr
suppressor, and an `&&`-chained outside-root read of the same shape. Both are
still refused (no admission bypass — this is a diagnostics-accuracy gap, not
a security gap), but land on `GUARD-REDIRECT-UNAPPROVED` /
`GUARD-OPERATOR-UNAPPROVED` instead of the true-reason
`GUARD-READ-SCOPE-OUTSIDE-ROOT` code that every other outside-root read shape
this restoration covers now reports correctly.

Root cause: `isOutsideRootSingleCommandRead()` / `isOutsideRootBoundedDiagnosticRead()`
(the functions that decide which denial code to print) exclude any command
carrying a redirect/operator up front, so a redirect- or operator-bearing
outside-root read never reaches the read-scope classifier at all and falls
through to whichever earlier, less-specific check catches it first.

## Why this was left open

Explicitly out of scope for both NVA-B-READCONTAIN-1 correction rounds
(fixing it would have meant teaching the redirect/operator classifiers to
look past their own operator before delegating to the read-scope check — a
larger, separately-scoped change). Disclosed and deferred in the findings
registry at the time; this item exists only to give it a `backlog/items/`
home per this repository's normal tracking convention.

## Acceptance criteria

- A single outside-root read with a trailing `2>/dev/null`, and an
  `&&`-chained outside-root read, both report `GUARD-READ-SCOPE-OUTSIDE-ROOT`
  (or its accurate current equivalent) rather than a redirect/operator code.
- Regression tests cover both shapes.
- Every other command shape's existing denial code is unchanged (this is a
  refinement of an already-refusing path, never a change to what is admitted).
