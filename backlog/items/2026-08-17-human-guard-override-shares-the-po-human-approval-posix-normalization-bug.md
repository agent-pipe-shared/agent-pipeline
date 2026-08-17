---
schema: pipeline.backlog-item.v1
id: pipeline.human-guard-override-shares-the-po-human-approval-posix-normalization-bug
type: defect
owner: pipeline
status: open
created: 2026-08-17
source: "Independently flagged twice this session as an out-of-scope disclosure: once by the round-1 Critic reviewing d2e2fc4c (NVA-WINPATH-1), once by the NVA-WINPATH-2 goldfish-deep dispatch that fixed the sibling bug. Neither investigated it (explicitly out of scope for both); confirmed directly against this repository's source before filing."
---

# `human-guard-override.mjs`'s `safePath()`/`crossBoundaryTarget()` share `po-human-approval.mjs`'s pre-fix unconditional-backslash-normalization pattern

## Description

`plugins/pipeline-core/scripts/po-human-approval.mjs`'s `outside()` had a
fail-open regression (fixed in `NVA-WINPATH-2`, commit `ba562481`, after a
Critic FAIL on the first attempt, `d2e2fc4c`): it applied
`.split("\\").join("/")` to a `path.relative()` result UNCONDITIONALLY,
including on POSIX, where backslash is a legal filename character — a
directory literally named `..\<name>` (a single path component, not a
traversal) got misclassified after normalization.

`plugins/pipeline-core/lib/human-guard-override.mjs` has the textually
identical pattern, unconditional (not even platform-gated), at THREE call
sites in TWO functions:

- `safePath()` (`:693-712`, specifically `:696`):
  `const rel = relative(root, absolute).split("\\").join("/");`
- `crossBoundaryTarget()` (`:774-782`, specifically `:777` and `:780`):
  `const rel = relative(root, absolute).split("\\").join("/");` and
  `if (hardBoundaryPath(absolute.split("\\").join("/"))) return null;`

**Preliminary risk-direction read (NOT a full analysis — the actual fix
dispatch must verify this properly, this is only what a same-session
source read established):**

- `safePath()` returns `null` (rejects) when `rel` matches an escape-like
  pattern (`..`, `../`, absolute). A genuinely in-root directory literally
  named `..\<name>` would, after the buggy normalization, spuriously match
  `startsWith("../")` and be WRONGLY REJECTED as unsafe — a fail-CLOSED
  direction (denies something legitimate), not obviously a security hole
  by itself.
- `crossBoundaryTarget()` returns non-null (accepts as a legitimate
  "cross-repository-target", ADR-0059 Decision 6) ONLY WHEN `rel` matches
  the same escape-like pattern. The SAME in-root `..\<name>`-named
  directory would, after the buggy normalization, be WRONGLY CLASSIFIED as
  escaping root — meaning an in-repository path could be routed through
  the cross-repository-target eligibility class instead of ordinary
  in-repository protections. Whether this is exploitable, and whether the
  cross-repository class is actually weaker/different in a way that
  matters here, is NOT established by this filing — that determination
  belongs to whoever picks this up, with the same rigor `NVA-WINPATH-1`'s
  Critic review applied (reproduce the exact misclassification, trace
  every downstream consumer of `crossBoundaryTarget()`'s return value,
  not just the two functions themselves).

## Affected artifact

`plugins/pipeline-core/lib/human-guard-override.mjs`, functions
`safePath()` and `crossBoundaryTarget()`.

## Proposal

Mirror `NVA-WINPATH-2`'s fix exactly (`po-human-approval.mjs`'s `outside()`,
commit `ba562481`): scope the backslash→forward-slash normalization to
platforms where backslash is an actual path separator (win32) — never
apply it to a POSIX-computed relative path. Add POSIX regression tests for
both `safePath()` and `crossBoundaryTarget()` covering a backslash-bearing
single-component directory name, mirroring `NVA-WINPATH-2`'s own new test
case. Given the genuine, not-yet-fully-mapped `crossBoundaryTarget()`
misclassification risk above, this is guardrail/security-adjacent work —
`goldfish-deep` plus mandatory Critic review, same discipline as the
sibling fix, not a same-session edit.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** accepted — confirmed with exact line numbers against this
  repository's current source, not just trusted from the two disclosures
  that flagged it. Not dispatched this AFK block (queued behind
  `NVA-SUITEREG-2` and the `guard-lifecycle-ready.mjs` allowlist fix to
  avoid concurrent non-isolated Goldfish writers sharing this checkout).
- **Rationale:** same defect class, same fix pattern, same file family
  (HGO/push-approval ceremony) as the already-fixed, already-Critic-PASSed
  (pending re-review) sibling in `po-human-approval.mjs`. `human-guard-
  override.mjs` is itself the TP-3 override mechanism's own implementation
  — high scrutiny warranted.
- **Assignment (if accepted):** next available dispatch slot in this AFK
  block, after the currently in-flight/queued work above.
- **Date:** 2026-08-17
