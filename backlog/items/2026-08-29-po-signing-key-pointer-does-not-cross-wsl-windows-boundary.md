---
schema: pipeline.backlog-item.v1
id: pipeline.po-signing-key-pointer-does-not-cross-wsl-windows-boundary
type: defect
owner: pipeline
status: open
created: 2026-08-29
sprint: nova
done_when: manual
source: "Claude/Windows self-audit report (docs/pipeline-audit-claude-session.md §3.2) and the PO's own observation, cited by scratch/greenfield-triage-2026-08-29.md finding F15, observed during the 2026-08-29 three-runner greenfield test."
---

# The machine-plane PO signing-key pointer is keyed per-OS-environment, not per-physical-machine

## What happened

A PO signing-key pointer was registered earlier in a WSL session on a given
physical machine. Later the same day, a Claude session running on the
Windows side of the *same physical machine* reported "this machine has no PO
signing key recorded at all." The physical key itself is shared across both
environments via the Windows/WSL filesystem bridge, but the pointer/plane
that tells a session where to look for it appears to be keyed per operating-
system environment (WSL vs. Windows), not per physical machine as the
guidance implies. Separately, the Codex runner needed a manual trust-anchor
overwrite in both of its sessions the same day.

## Where it is

Searched this repository's `plugins/pipeline-core/scripts/` and
`plugins/pipeline-core/lib/` for the pointer-registration mechanism
(`human-authority-grant.mjs`, `guard-human-override.mjs`,
`critical-human-proof-policy.mjs`) and found the consumption side —
`human-authority-grant.mjs` line ~271 throws `HAG-TRUST-ANCHOR-MISSING` when
`project/critical-human-proof.json` carries no `trustAnchor` — but **could
not locate, in this repository's own source, the specific registration path
that decides which OS-scoped location a session reads the key pointer from**,
nor confirmed the WSL-vs-Windows keying claim directly in code. This finding
rests on the runners' own reports plus the PO's own direct observation
across two sessions on the same physical machine, not a controlled
reproduction performed in this dispatch.

Per the briefing's sanitization constraint, this item deliberately does not
name the key's directory, its OS-scoped storage plane, or any anchor value —
only the PLANE/boundary distinction the runners observed.

## Proposal

Because the concrete registration/lookup mechanism was not located during
this investigation, a future session should first do the location work this
dispatch could not (find the actual code path that resolves the trust-anchor
pointer per session, likely something env-var- or well-known-path-based,
scoped separately for a WSL shell vs. a native Windows shell on the same
physical machine) before proposing a fix shape. Once located, the fix
direction implied by the observed symptom is: resolve the key pointer by
PHYSICAL MACHINE identity (or explicitly document that it is intentionally
per-OS-environment and instruct operators to register it twice, once per
environment, if that is accepted as correct behavior) — the current silent
mismatch, where one environment simply reports "no key" with no hint that a
sibling environment on the same box has one, is the actual defect regardless
of which resolution direction is chosen.

## Acceptance

- A future session locates the exact code path that resolves the PO
  signing-key trust-anchor pointer and records it in this item before
  closing.
- Given the same physical machine, registering the key pointer once is
  sufficient for both a WSL session and a native Windows session to find it
  — OR, if the PO decides per-environment registration is intentional, the
  "no key recorded" message explicitly says so and names the registration
  command for the current environment, rather than reading as an unqualified
  absence.
- `manual` is used here (per the briefing's grammar) because, absent the
  located mechanism, no mechanical predicate can yet be written honestly;
  once the mechanism is located, this item's `done_when` should be updated
  to a `contains`/`script-exit-zero` predicate naming the actual fix file.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** accepted
- **Rationale:** Observed directly by the PO across two sessions on the same
  physical machine, and independently corroborated by Codex needing a manual
  trust-anchor overwrite in both of its own sessions the same day — two
  independent signals of the same class of friction around key-pointer
  scoping.
- **Assignment:** `sprint: nova`; blocks the 0.6.0 candidate — a PO who
  cannot locate their own already-registered key on a machine they already
  configured is a hard block on any ceremony needing a signature.
- **Date:** 2026-08-29
