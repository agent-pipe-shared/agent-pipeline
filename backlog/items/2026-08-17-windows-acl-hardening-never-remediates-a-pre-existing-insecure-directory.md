---
schema: pipeline.backlog-item.v1
id: pipeline.windows-acl-hardening-never-remediates-a-pre-existing-insecure-directory
type: defect
owner: pipeline
status: open
created: 2026-08-17
source: "Relayed by the PO 2026-08-17 from a live D:\\Dev\\HA (native Windows Claude) session's handover; the report's own mechanism claim ('silently skipped') was checked against source and found imprecise -- the real gap is narrower but still real, confirmed by direct code reading."
---

# Windows ACL hardening only auto-remediates newly-created directories; a pre-existing insecure one is only assessed, never fixed

## Description

`assureWindowsLocalDirectories()` (`plugins/pipeline-core/lib/worktree-lifecycle.mjs:309-319`),
called from `writeAtomic()` (`:331`) under win32, does NOT silently skip a
pre-existing insecure directory as originally reported — when the immediate
`parent` already exists (`created.length === 0`), it correctly calls
`assessWindowsPrivatePath(existing)` and fails closed if insecure. The real,
narrower gap: it only actively `hardenWindowsPrivateDirectory()`s NEWLY
CREATED directories; a pre-existing insecure one is only ever assessed and
refused, never auto-remediated — matching the practically-observed symptom
(a directory created by an earlier cross-platform/WSL session, with normal
inheriting ACLs, permanently blocks a later native-Windows session until a
human manually re-applies the hardening) even though the "silently skipped"
framing in the original report was wrong.

A second, more severe gap not articulated in the original report: if
`parent` needs creating but an ANCESTOR further up the path (not `existing`)
is insecure, and a new directory then gets created below that ancestor, the
ancestor is never assessed at all — the `created.length > 0` branch skips
the assessment path entirely.

## Triggering situation

`.git/agent-pipeline/session-descriptors/active` in a D:\Dev\HA checkout was
created by an earlier WSL/Codex session (Linux `process.platform`, so
Windows hardening never ran) with ordinary Windows-inherited ACLs. A later
native-Windows Claude session's `session-capability-diagnose.mjs`
permanently reported `{"status":"unavailable","stage":"descriptor-publication"}`
until the ACLs were manually hardened outside the session.

## Affected artifact

`plugins/pipeline-core/lib/worktree-lifecycle.mjs` (`assureWindowsLocalDirectories`,
`writeAtomic`), `plugins/pipeline-core/lib/windows-private-state.mjs`
(`assessWindowsPrivatePath`, `hardenWindowsPrivateDirectory`).

## Proposal

Not designed here. Whoever picks this up should decide: should the assess-only
branch for a pre-existing insecure directory auto-remediate (call
`hardenWindowsPrivateDirectory()` there too) rather than only fail closed —
and if so, does that apply uniformly, or does a transient session-descriptor
directory warrant a different remediation posture than a long-lived
credential-adjacent directory (e.g. `po-key-directory.json`)? Separately,
close the ancestor-skip gap: an ancestor above a newly-created directory
needs assessment too, not just the immediate parent when nothing was
created.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** accepted — confirmed against source; original "silently
  skipped" framing corrected to "assessed but never auto-remediated," plus
  an additional ancestor-skip gap found during verification, not in the
  original report.
- **Rationale:** cross-runner (WSL/Codex ↔ native-Windows/Claude) checkout
  reuse is a real, already-observed scenario, and this permanently blocks a
  session's local descriptor publication until manual out-of-band
  intervention.
- **Assignment:** queued behind the current Windows-hotfix candidate; needs
  a design decision on remediation posture before a goldfish-deep dispatch.
- **Date:** 2026-08-17
