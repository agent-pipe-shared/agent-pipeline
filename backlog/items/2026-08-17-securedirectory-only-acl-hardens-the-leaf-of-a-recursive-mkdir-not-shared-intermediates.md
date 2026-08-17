---
schema: pipeline.backlog-item.v1
id: pipeline.securedirectory-only-acl-hardens-the-leaf-of-a-recursive-mkdir-not-shared-intermediates
type: defect
owner: pipeline
status: open
created: 2026-08-17
source: "Relayed by the PO 2026-08-17 from a Windows (D:\\Dev\\Web\\Toolbox) session's handover after completing Toolbox's pipeline bootstrap through plan approval. Live-reproduced on that machine: po-gate-profile-repair.mjs apply failed repeatedly with PO-PROFILE-RECEIPT-WRITE-FAILED until the reporting session manually ran hardenWindowsPrivateDirectory('.git/agent-pipeline') from a diagnostic script, which fixed the ACL and let the repair succeed immediately after. Not currently blocking Toolbox (worked around live)."
---

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
