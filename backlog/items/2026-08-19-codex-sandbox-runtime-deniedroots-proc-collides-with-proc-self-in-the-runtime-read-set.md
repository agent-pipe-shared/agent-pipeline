---
schema: pipeline.backlog-item.v1
id: pipeline.codex-sandbox-runtime-deniedroots-proc-collides-with-proc-self-in-the-runtime-read-set
type: defect
owner: pipeline
status: open
created: 2026-08-19
source: "Dispatch NVA-BL-CSANDBOX-2 (2026-08-19), building integration-path test coverage for codex-sandbox-runtime.mjs's real call into codex-sandbox-preflight.mjs — discovered while trying to construct an honest PASSING preflight-outcome test case."
---

# `codex-sandbox-runtime.mjs`'s intermediate readback always fails closed: `deniedRoots: ["/proc"]` collides with `/proc/self` in its own runtime read set

## Description

`codex-sandbox-runtime.mjs`'s `compiledIntermediateReadback()` (line 90)
hardcodes `deniedRoots: ["/proc"]`. The same function (line 87) builds
`runtimeReadSet` from `resolveNodeRuntimeReadSet(process.execPath)`
(`codex-sandbox-preflight.mjs` line 595-606), which **always** includes the
literal path `/proc/self` in its returned set — unconditionally, for every
caller, with no way to opt out.

`codex-sandbox-preflight.mjs`'s own overlap-checking logic (around line 106,
`compilePermissionProfile`/`validateCodexSandboxState`) correctly treats
`/proc/self` as nested inside the denied root `/proc` and fails closed with
`profile-error`, exactly as its own design intends: a read path inside a
denied root is a genuine conflict.

The result: **every real call into `compiledIntermediateReadback()` fails
closed today**, for any physically valid inputs — not an edge case, the
ordinary path. This affects every one of its 4 call sites in
`codex-sandbox-runtime.mjs` (lines 170, 210, 293, 310) — the
`createCoordinatorScratch()`/`bridge.readback()`-shaped intermediate-lane
flows.

## Triggering situation

Found while building `NVA-BL-CSANDBOX-2` (a dispatch closing a remaining
test-coverage gap on `codex-sandbox-critic-longterm`: proving
`codex-sandbox-runtime.mjs` actually calls into `codex-sandbox-preflight.mjs`).
The dispatch could not construct an honest PASSING-outcome test case through
this seam — every attempt with real, unmocked preflight code hit this exact
collision. Confirmed structurally, not just once empirically: `deniedRoots`
is a fixed literal, `resolveNodeRuntimeReadSet`'s inclusion of `/proc/self`
is unconditional, so the collision is deterministic, not timing- or
environment-dependent. The dispatch delivered thorough FAILING-case coverage
instead (both real integration seams, both consumption channels — thrown
error and return-value propagation) and flagged this rather than working
around it or fabricating a passing result.

## Affected artifact

- `plugins/pipeline-core/scripts/codex-sandbox-runtime.mjs` —
  `compiledIntermediateReadback()` (line 82-90ish), and its 4 call sites.
- `plugins/pipeline-core/scripts/codex-sandbox-preflight.mjs` —
  `resolveNodeRuntimeReadSet()` (line 595-606), the source of the always-included
  `/proc/self` entry.
- Test coverage: `plugins/pipeline-core/scripts/codex-sandbox-runtime.test.mjs`
  (the new integration test added by NVA-BL-CSANDBOX-2 documents the failing
  behavior live; a fix here should let a genuine passing-outcome case be added
  to the same file, closing the one remaining gap that dispatch's own report
  named).

## Proposal

Not designed here — needs a decision on which side owns the fix:

1. `compiledIntermediateReadback()`'s `deniedRoots` value is a placeholder
   (`["/proc"]`) that was seemingly never checked against what
   `resolveNodeRuntimeReadSet()` actually returns — narrowing it (e.g. to
   specific `/proc` subpaths that are genuinely sensitive, excluding
   `/proc/self`) may be the correct, minimal fix if `/proc` as a whole was
   never actually meant to be blanket-denied.
2. Alternatively, if `/proc` blanket-denial is intentional and correct,
   `resolveNodeRuntimeReadSet()`'s unconditional inclusion of `/proc/self`
   is the side that needs to change (e.g. only included for callers that
   don't also deny `/proc`), which is a shared function with other callers
   (`codex-sandbox-preflight.mjs` line 638) — a change there needs checking
   against every caller, not just this one.
3. Either way, this needs new regression coverage proving the fix actually
   lets a real intermediate-lane call reach an `ok` outcome (the passing-case
   test `NVA-BL-CSANDBOX-2` could not honestly write) — that test becomes
   part of this fix's own DoD, not a separate follow-up.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
