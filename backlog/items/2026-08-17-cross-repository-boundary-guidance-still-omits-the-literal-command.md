---
schema: pipeline.backlog-item.v1
id: pipeline.cross-repository-boundary-guidance-still-omits-the-literal-command
type: defect
owner: pipeline
status: closed
created: 2026-08-17
closed_at: 2026-08-18
closure_repository: self
closure_commit: b095535da9d5190dcefeecdddf95c4bf3b9495da
closure_evidence: plugins/pipeline-core/hooks/codex-pretool-guard.test.mjs
source: "Found while investigating two orphaned worktrees (agent-a2b2a34b84f687185, agent-ae0bcdcb0ead6ecec) left over from prior sessions, 2026-08-17. Both worktrees' own commits were confirmed already superseded on main and discarded; this is a genuine, separate, still-open gap noticed while comparing GF-059's original fix against the current file."
---

# `codex-pretool-guard.mjs`'s cross-repository-boundary guidance still omits the literal command

## Description

GF-059 (2026-08-09) found that `codex-pretool-guard.mjs`'s external-operator
guidance carried only `toolInputSha256` in its `action` payload — a hash a
human attending the real terminal cannot act on — and added the literal
`command` alongside it. That finding was correctly incorporated, but only
at ONE of the two sites that share the exact same problem shape.

**Fixed, with real care (Critic F2/F3, GF-064):** the `HGO-GIT`/`HGO-ROOT`/
`HGO-COMMON-DIR` host-boundary catch block
(`plugins/pipeline-core/hooks/codex-pretool-guard.mjs:522-564`) now includes
`command` and a `copyCommand` rendering, gated behind a `commandIsSafe`
secret-screen (`toolName === "Bash" && !secretBearing`) so a secret-bearing
or non-Bash command is never disclosed.

**Not fixed, same shape, no gate at all:** the cross-repository-only-denial
branch (`crossRepositoryOnlyDenial`, lines 388-404) still emits
`action: { toolName, toolInputSha256, repositoryRoot: projectRoot }` —
GF-059's original, pre-Critic-review shape, unconditionally missing
`command` for every case, not even behind the same safety gate.

## Triggering situation

Noticed while investigating two stale worktrees from prior sessions during
the current AFK block. `agent-a2b2a34b84f687185` held GF-059's original,
now-superseded commit (`20d562bf`) as evidence for comparison; reading the
current file to confirm it was safely supersedable surfaced this second,
still-open site.

## Affected artifact

`plugins/pipeline-core/hooks/codex-pretool-guard.mjs`, the
`crossRepositoryOnlyDenial` branch (lines 388-404).

## Proposal

Not designed here. Two questions for whoever picks this up:

1. Is the plugin-cache boundary genuinely a different risk class from the
   Git host boundary (e.g. because the command there is more likely to
   carry external-authority-sensitive content), justifying the asymmetry
   deliberately — or was this simply the one site GF-059's own dispatch
   never reached?
2. If it should be fixed the same way, the existing `commandIsSafe`
   secret-screen logic at lines 522-564 is directly reusable — extracting
   it into a small local helper both branches call would also close the
   risk of the two sites drifting again.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** accepted, stays open, current scope (not deferred).
- **Rationale:** small, well-scoped, and the fix pattern (the
  `commandIsSafe` secret-screen from lines 522-564) already exists and is
  directly reusable — not architecture/design-latitude work, just closing a
  second site to match a pattern already accepted at the first. Not urgent
  enough to interrupt in-flight work, but cheap enough not to defer to a
  future sprint either.
- **Assignment (if accepted):** candidate for a goldfish-implementor
  dispatch (extract `commandIsSafe` into a shared helper both branches call,
  apply the same `command`/`copyCommand` disclosure to
  `crossRepositoryOnlyDenial`) once question 1 (deliberate asymmetry vs.
  oversight) is answered — not yet dispatched.
- **Date:** 2026-08-17

### Closed 2026-08-18 (overnight AFK block, NVA-MICRO-3)

Question 1 answered: measured to be an oversight (GF-059's dispatch never
reached `crossRepositoryOnlyDenial`), not a deliberate risk-class
distinction. Fixed per question 2: extracted the shared `commandIsSafe`
secret-screen logic into `commandDisclosureFields()`, applied to
`crossRepositoryOnlyDenial` identically to the already-fixed host-boundary
site. Two new regression checks (safe command discloses `command`/
`copyCommand`; secret-bearing command never leaks the secret verbatim).
Independently re-verified: `node --test
plugins/pipeline-core/hooks/codex-pretool-guard.test.mjs` → both new checks
green; one pre-existing, unrelated failure (Codex manifest-stamp format
drift in `.codex-plugin/plugin.json`, untouched by this commit — confirmed
via `git show --stat`) is unaffected, not a regression from this diff.
