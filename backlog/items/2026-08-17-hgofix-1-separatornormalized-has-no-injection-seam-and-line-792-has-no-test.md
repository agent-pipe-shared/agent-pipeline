---
schema: pipeline.backlog-item.v1
id: pipeline.hgofix-1-separatornormalized-has-no-injection-seam-and-line-792-has-no-test
type: defect
owner: pipeline
status: closed
created: 2026-08-17
closed_at: 2026-08-17
closure_repository: self
closure_commit: 5cb07a93377206f14ed4447fb03ba7e7687fad73
closure_evidence: plugins/pipeline-core/lib/human-guard-override.test.mjs
source: "Critic review of NVA-HGOFIX-1 (a4aeaca4, claude-opus-5 at max), findings F1 and F2. Verdict PASS; both minor, filed as follow-ups rather than reworked into that commit."
---

# `separatorNormalized()` has no platform-injection seam, and the third call site's POSIX behavioural delta is untested and undisclosed

## Description

`NVA-HGOFIX-1` (commit `a4aeaca4`) fixed the unconditional
backslash-to-forward-slash normalization bug in
`human-guard-override.mjs`'s `safePath()`/`crossBoundaryTarget()`, modeled
explicitly on the sibling fix in `po-human-approval.mjs`'s `outside()`
(`ba562481`). Two gaps against that model, both minor:

1. **No injection seam.** `separatorNormalized(value)`
   (`human-guard-override.mjs:703`) reads `process.platform` directly:
   `(value) => (process.platform === "win32" ? value.split("\\").join("/") : value)`.
   The sibling fix instead injects `platform` as a parameter
   (`po-human-approval.mjs:218`, `export function outside(repoRoot, path,
   platform = process.platform)`), and the file's own two existing seams
   (`human-guard-override.mjs:505`, `:543`) already use exactly this idiom,
   already exercised by the suite (`human-guard-override.test.mjs:1379`
   etc., `platform: "win32"`). Without the seam, the win32 branch of this
   security-relevant normalization is unprovable from a POSIX host and
   unreachable from a win32 host's own test run — not a live regression
   (POSIX behaviour is unchanged), but a future one could ship silently.

2. **Untested/undisclosed POSIX delta at the third site.** `:792`,
   `if (hardBoundaryPath(separatorNormalized(absolute))) return null;`
   (was `hardBoundaryPath(absolute.split("\\").join("/"))`), now feeds the
   sensitive-pattern regex (`:754`) the raw absolute path on POSIX rather
   than a rewritten one. An out-of-root candidate whose final path
   component merely *contains* a backslash (e.g. `..\secrets`) is no
   longer refused by that regex's component-anchored match. The Critic
   judged this correct (no capability gained — any non-matching name
   achieves the same, and the `cross-repository-target` class already runs
   no symlink walk), but neither the commit message nor a code comment
   states that this site's POSIX behaviour changed, and no test reaches
   this line — both new regression tests terminate before `escapes`
   becomes true.

## Affected artifact

`plugins/pipeline-core/lib/human-guard-override.mjs` — `separatorNormalized()`
(`:703`) and `crossBoundaryTarget()`'s `hardBoundaryPath()` call (`:792`).

## Proposal

- Give `separatorNormalized` an injectable `platform = process.platform`
  parameter, mirroring `po-human-approval.mjs`'s `outside()`; add win32-driven
  assertions for at least one of the two already-fixed call sites, matching
  the existing `platform: "win32"` test idiom already used elsewhere in this
  suite.
- Add one test reaching `:792` on POSIX with a `..\secrets`-shaped final
  component, pinning the now-intentional non-refusal, and one sentence (code
  comment or commit-message equivalent) stating that this site's POSIX
  behaviour changed.

Small, mechanical, no design latitude — a `goldfish-implementor` dispatch is
sufficient; still HGO/guardrail-adjacent code, so a Critic review before
closure remains required per CLAUDE.md MP-07.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** accepted — both findings independently corroborated in the
  Critic's report against current source; genuinely minor, correctly
  deferred rather than blocking `NVA-HGOFIX-1`'s closure.
- **Rationale:** cheap, well-scoped hardening of already-shipped, already-PASS
  security-relevant code; no urgency, no live defect.
- **Assignment:** queued; not dispatched this AFK block.
- **Date:** 2026-08-17

### Closed 2026-08-17 (already resolved by a prior same-day commit, confirmed during a later AFK block)

While dispatching an unrelated batch (`NVA-MICRO-1`), found this was
already fully fixed earlier the same day by commit `5cb07a93`
("`NVA-HGOFIX-2`"), which predates that dispatch: `separatorNormalized()`
gained the injectable `platform = process.platform` parameter mirroring
the file's own existing idiom, and a POSIX regression test now reaches the
`:792`-class `hardBoundaryPath(separatorNormalized(...))` call with a
`..\secrets`-shaped component, pinning the documented intentional
non-refusal. Independently re-verified live in source (current line
numbers shifted to ~878/972 after intervening commits) and via `node
--test plugins/pipeline-core/lib/human-guard-override.test.mjs` (green
apart from the known pre-existing `HGO-EXTERNAL-MARKETPLACE` class).
