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

### Triage confirmation (2026-08-18) — remediation posture decided, queued for dispatch

The 2026-08-17 Triage above accepted the defect but left the remediation
posture ("should the assess-only branch auto-remediate?") as an open design
question blocking dispatch. Deciding it now, since it is not deferred to any
named still-open sprint and the 0.6.0 release bar requires a real decision:

- **Remediation posture: auto-remediate uniformly.** When
  `assessWindowsPrivatePath()` reports an existing directory insecure,
  `assureWindowsLocalDirectories()` should call
  `hardenWindowsPrivateDirectory()` on it rather than only failing closed —
  for every directory in this family, transient or credential-adjacent
  alike. Rationale: hardening only ever *tightens* an ACL to owner-only; it
  never loosens access or changes file contents, so there is no
  credential-exposure argument for treating a long-lived directory
  differently from a transient one — the asymmetry the original Proposal
  worried about does not actually exist once the fix is understood as
  ACL-only. This mirrors the `secureDirectory()` fix already landed for the
  sibling item (`pipeline.securedirectory-only-acl-hardens-the-leaf-of-a-recursive-mkdir-not-shared-intermediates`,
  commit `a98bcb98`, NVA-PAWINACL-2) — same remediate-not-just-assess shape.
- **Ancestor-skip gap: close it.** Walk and assess/remediate every ancestor
  component above a newly-created directory, not only the immediate
  `parent` when `created.length > 0` skips the assessment path entirely.
- **Disposition: queued for a `goldfish-deep` dispatch** (Windows ACL
  security-adjacent code, `worktree-lifecycle.mjs` /
  `windows-private-state.mjs`) implementing both points above, with new
  regression tests. Cannot be live-verified from this Linux/WSL host — the
  same caveat already recorded on the sibling item applies here: whoever
  merges it should have it re-run on a real Windows checkout before this is
  treated as closed.
- **Date:** 2026-08-18

### Implementation landed, closure withheld pending live-Windows re-verify (2026-08-18, evening)

Both points above are implemented, tested (mocked Windows behavior, this
suite's existing pattern), and merged to `feat/sprint-nova-codex-v046` via
an earlier same-day dispatch (commit `b8f28a792dd6eb192a26b109231ceee304260ccb`,
"fix(windows-acl): auto-remediate pre-existing insecure directories and
close ancestor-skip gap"). Verified live:
`node --test plugins/pipeline-core/lib/worktree-lifecycle.test.mjs` →
39/39 pass, including `WT-LOCAL-WINDOWS-ASSURANCE` auto-remediation,
still-fails-closed-when-unremediable, and ancestor-skip-gap cases. A
parallel wave-1 dispatch confirmed this same finding independently
(no-op, nothing further to implement) rather than duplicating the fix.

**Kept open, not closed:** per this item's own Triage above, live
verification on a real Windows checkout is the explicit precondition for
treating this as closed, and this session runs on Linux/WSL only. The
sibling item (`securedirectory-only-acl-hardens-the-leaf-of-a-recursive-
mkdir-not-shared-intermediates`) carries the identical caveat. Both need
the same PO-driven live-Windows confirmation step before closure — a
single Windows session re-running both suites once would clear both.
