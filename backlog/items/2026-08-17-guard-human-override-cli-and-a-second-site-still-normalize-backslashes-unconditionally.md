---
schema: pipeline.backlog-item.v1
id: pipeline.guard-human-override-cli-and-a-second-site-still-normalize-backslashes-unconditionally
type: defect
owner: pipeline
status: closed
created: 2026-08-17
closed_at: 2026-08-17
closure_repository: self
closure_commit: 5cb07a93377206f14ed4447fb03ba7e7687fad73
closure_evidence: plugins/pipeline-core/scripts/guard-human-override.test.mjs
source: "Critic review of NVA-HGOFIX-1 (a4aeaca4, claude-opus-5 at max), finding F3 — explicitly an out-of-scope disclosure, not counted against that diff's PASS verdict."
---

# The unconditional-backslash-normalization pattern (`NVA-WINPATH-2`/`NVA-HGOFIX-1`'s bug class) survives in two more places

## Description

`NVA-WINPATH-2` (`po-human-approval.mjs`'s `outside()`) and `NVA-HGOFIX-1`
(`human-guard-override.mjs`'s `safePath()`/`crossBoundaryTarget()`) both
fixed the same pattern: `.split("\\").join("/")` (or equivalent) applied
UNCONDITIONALLY to a path value, including on POSIX, where backslash is an
ordinary filename character, never a separator. The `NVA-HGOFIX-1` Critic
review found two more, unrelated occurrences while checking security surface
beyond the reviewed diff's three named sites:

1. **`plugins/pipeline-core/scripts/guard-human-override.mjs:58`**
   (`externalJson()`): `const rel = api.relative(root, source).split("\\").join("/");`,
   feeding the ADR-0059 Decision 1 "proof supplied outside the repository"
   check. On POSIX, a proof file at an in-repository path whose first
   component is literally named `..\x` would be misread as external. Impact
   is bounded — the proof still has to verify against an Ed25519 key held
   outside the repository — so this only relocates where a proof file may
   live, not an authorization bypass, but it is a defence-in-depth loss in
   the fail-open direction.
2. **`plugins/pipeline-core/lib/human-guard-override.mjs:1385`**
   (`token.replace(/\\/gu, "/")`, feeding `hardBoundaryPath`/`protectedPath`
   and the emitted `paths` list): POSIX-side fail-CLOSED only (a legitimate
   in-root token could be misclassified), not itself a security hole by the
   same reasoning `NVA-HGOFIX-1`'s own backlog item applied to `safePath()`.

Neither site was investigated further — this is a disclosure, not a
completed analysis, exactly like the two prior filings in this same bug
family.

## Affected artifact

`plugins/pipeline-core/scripts/guard-human-override.mjs` (`externalJson()`,
`:58`); `plugins/pipeline-core/lib/human-guard-override.mjs` (`:1385`).

## Proposal

Same fix pattern as the two already-closed siblings: scope each rewrite to
win32 only (or remove it if the value can never carry a win32-style
separator on this call path — verify per site), add regression coverage.
Given the ceremony-relevant call site at `:58` (ADR-0059 Decision 1's
external-proof boundary), treat as guardrail/security-adjacent —
`goldfish-deep` plus mandatory Critic review before closure.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** accepted — both occurrences independently corroborated
  against current source before filing (not just trusted from the Critic's
  report).
- **Rationale:** same defect class as two already-fixed siblings in this
  exact file family; worth closing out the class entirely rather than
  leaving two known residual instances.
- **Assignment:** queued; not dispatched this AFK block.
- **Date:** 2026-08-17

### Closed 2026-08-17 (already resolved by a prior same-day commit, confirmed during a later AFK block)

Both sites fixed by commit `5cb07a93` ("`NVA-HGOFIX-2`"), which predates
this confirmation: `guard-human-override.mjs`'s `externalJson()` (site 1,
`:58`) now gates its split/join on `platform === "win32"`; the
`token.replace(/\\/gu, "/")` site (site 2, was `:1385`, confirmed live at
its current shifted location) is gated the same way. Independently
re-verified against current source and `node --test` on both touched
files (green apart from the known pre-existing `HGO-EXTERNAL-MARKETPLACE`
class).
