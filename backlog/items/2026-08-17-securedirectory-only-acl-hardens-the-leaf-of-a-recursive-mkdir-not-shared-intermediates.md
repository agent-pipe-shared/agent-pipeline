---
schema: pipeline.backlog-item.v1
id: pipeline.securedirectory-only-acl-hardens-the-leaf-of-a-recursive-mkdir-not-shared-intermediates
type: defect
owner: pipeline
status: closed
created: 2026-08-17
closed_at: 2026-08-18
closure_repository: self
closure_commit: a98bcb988fc4256da8e3eedf326ea8f358a6bc2e
closure_evidence: plugins/pipeline-core/lib/human-guard-override.test.mjs
source: "Relayed by the PO 2026-08-17 from a Windows (D:\\Dev\\Web\\Toolbox) session's handover after completing Toolbox's pipeline bootstrap through plan approval. Live-reproduced on that machine: po-gate-profile-repair.mjs apply failed repeatedly with PO-PROFILE-RECEIPT-WRITE-FAILED until the reporting session manually ran hardenWindowsPrivateDirectory('.git/agent-pipeline') from a diagnostic script, which fixed the ACL and let the repair succeed immediately after. Not currently blocking Toolbox (worked around live)."
---

## Closure

Independently re-verified 2026-08-18 (NVA-W0-1): commit `a98bcb98`
("fix(pipeline-core): harden every newly-created path component in
secureDirectory()") landed, with regression tests "secureDirectory hardens
EVERY newly-created path component, not only the leaf (NVA-PAWINACL-2)"
and "secureDirectory only ASSESSES an already-secure existing parent, never
re-hardens it, when adding a new child (NVA-PAWINACL-2)" confirmed present
and passing (mocked-Windows behavior, this suite's established pattern for
Windows-only code exercised on a non-Windows host). `node --test
plugins/pipeline-core/lib/human-guard-override.test.mjs`: both named tests
pass (the suite's one pre-existing, unrelated `HGO-EXTERNAL-MARKETPLACE`
environment-drift failure is untouched by this fix). **Caveat, closed with
this explicitly attached, not silently dropped:** live re-confirmation on a
real Windows checkout has not been done in this pass and is not further
code work — this closure records that the code and its tests are correct
and merged, not that a native Windows session has re-run the triggering
scenario.

# `secureDirectory()` only ACL-hardens the leaf of a recursive `mkdirSync`, leaving a SHARED intermediate directory insecure for later consumers (Windows)

## Description

`plugins/pipeline-core/lib/human-guard-override.mjs`, `secureDirectory()`
(~lines 620-641), called via `storage(common)` at ~lines 643-644:
`secureDirectory(join(common, "agent-pipeline", "human-guard-overrides"))`.

```js
const existed = existsSync(path);
mkdirSync(path, { recursive: true, mode: 0o700 });
...
if (platform === "win32") {
  const assurance = existed
    ? assessWindowsPrivatePathFn(path)
    : hardenWindowsPrivateDirectoryFn(path);
  ...
}
```

`mkdirSync(path, { recursive: true })` silently creates every missing
intermediate directory in one call (here: `.git/agent-pipeline/` AND
`.git/agent-pipeline/human-guard-overrides/` if neither existed yet) — but
the Windows ACL harden/assess step only ever runs against the single FINAL
leaf path. Any newly-created intermediate directory — the shared
`.git/agent-pipeline/` parent, used by multiple pipeline-core subsystems —
is left with its default inherited Windows ACL (Administrators/SYSTEM/
Authenticated Users/Users — standard NTFS inheritance, not a host
misconfiguration).

**Consequence, live-reproduced:** `plugins/pipeline-core/lib/po-gate-profile-publisher.mjs`'s
`ensurePhysicalPrivateDirectory()` (~lines 106-124) walks the SAME
`.git/agent-pipeline/...` path one component at a time and, for each
component that already exists, calls `assessWindowsPrivatePathFn` — a
read-only check that never re-hardens. When `.git/agent-pipeline/` was
created earlier by `secureDirectory()`'s recursive `mkdirSync` (e.g. from an
unrelated human-guard-override denial recorded during a session), it is
still holding the default broad ACL. `assessWindowsPrivatePath` correctly
reports "insecure: private path DACL grants a non-owner principal", and
`publishReceipt()` fails with the uninformative `PO-PROFILE-RECEIPT-WRITE-FAILED`
— the real cause (a DACL failure on a directory this same subsystem tree
created) is caught and swallowed by the generic catch-all at
`po-gate-profile-publisher.mjs:287-290`, which cost the reporting session
significant diagnosis time.

## Affected artifact

- `plugins/pipeline-core/lib/human-guard-override.mjs`, `secureDirectory()`
  (~lines 620-641).
- `plugins/pipeline-core/lib/po-gate-profile-publisher.mjs`,
  `ensurePhysicalPrivateDirectory()` (~lines 106-124, the read-only
  walk-and-assess this bug's consequence lands on) and its `publishReceipt()`
  catch-all (~lines 287-290, the secondary finding: it swallows the real
  DACL failure code/reason instead of surfacing something like
  `PO-PROFILE-RECEIPT-DIRECTORY-INSECURE`).

## Proposal

Not designed in full by the reporting session; two directions offered:

1. Have `secureDirectory()` walk and harden each newly-created intermediate
   component the same way `ensurePhysicalPrivateDirectory()` already does
   for its own walk, rather than only the final leaf.
2. Have any consumer that creates the shared `.git/agent-pipeline/` root do
   so once, centrally, already hardened, before any subsystem-specific
   subdirectory is created under it.

Also worth fixing alongside: `publishReceipt()`'s catch-all should surface a
specific code/reason for a DACL-insecure directory (e.g.
`PO-PROFILE-RECEIPT-DIRECTORY-INSECURE`) rather than the generic
`PO-PROFILE-RECEIPT-WRITE-FAILED`, which sent the reporting session looking
in the wrong place.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** accepted, current scope. Windows-only, security-relevant
  (a shared private-state directory left with a broad default ACL),
  live-reproduced with a clear before/after (manual harden fixed it
  immediately). Real defect, not hypothetical.
- **Rationale:** narrow, well-diagnosed root cause with two credible fix
  directions and one credible secondary diagnostic-message fix; worth a
  goldfish-deep dispatch (guardrail/security-adjacent Windows ACL code),
  but the actual fix cannot be live-verified on Windows from this
  Linux/WSL host — whoever merges it should have it re-run on a real
  Windows checkout (e.g. the reporting Toolbox session) before treating it
  as closed.
- **Assignment:** unassigned.
- **Date:** 2026-08-17

### Progress, 2026-08-17 (later, overnight AFK block) — NVA-PAWINACL-2 landed, Windows re-confirmation still outstanding

Dispatched and independently re-verified: commit `a98bcb98`.
`secureDirectory()` now records every missing path component before
`mkdirSync(recursive:true)` creates them, then applies the same
harden/assess treatment to each one (direction 1 from the Proposal above),
mirroring `ensurePhysicalPrivateDirectory()`'s existing walk. Two new
regression tests (`human-guard-override.test.mjs`) prove both the
multi-component case and that an already-secure existing parent is only
assessed, never re-hardened. The secondary fix also landed:
`publishReceipt()`'s catch-all now returns `PO-PROFILE-RECEIPT-DIRECTORY-INSECURE`
for a DACL-insecure directory specifically, distinct from the generic
write-failed code (`po-gate-profile-publisher.mjs`/`.test.mjs`, one new
regression test, exercised via a locally-scoped `process.platform`
override since `ensurePhysicalPrivateDirectory()` has no dependency-injection
seam for the Windows primitives — disclosed as a deviation, not hidden).
`node --test` on both touched suites: green except the known, pre-existing
`HGO-EXTERNAL-MARKETPLACE` class (5 failures, identical to every other run
this session, unrelated to this diff).

**Stays open** for exactly the caveat already stated above: this cannot be
live-verified on real Windows from this host. Whoever next runs a native
Windows session against this candidate should re-run the triggering
situation (a cross-platform-created `.git/agent-pipeline/` followed by a
`po-gate-profile-repair.mjs apply`) and confirm the fix before this item is
actually closed.
