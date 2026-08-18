---
schema: pipeline.backlog-item.v1
id: pipeline.windows-posix-mode-bit-checks-are-meaningless-on-ntfs
type: defect
owner: pipeline
status: open
created: 2026-08-18
source: "PO, 2026-08-18, relaying a diagnosis from a separate Windows Claude Code session working on an unrelated consumer project ('Toolbox'), which vendors the same `plugins/pipeline-core` source via the marketplace. `project-onboarding-v3.mjs inspect --intent session` was returning `continuity-observation-unavailable` on that Windows machine even though pipeline-state.json/PRD/spec content was independently verified byte-correct (checked via `certutil -hashfile`). Two of the reported hit locations (`lib/onboarding-continuity.mjs:617,625`, `lib/local-supervisor-state.mjs:61,65,69`) were independently spot-checked against this repo's own current source and confirmed to match exactly, including that this exact same file already has correct win32-aware branching elsewhere (onboarding-continuity.mjs:1211,4482) but not at the two reported lines -- corroborating the report rather than taking it on faith."
---

# Windows-only: unconditional POSIX mode-bit checks fail closed on every NTFS session

## Description

Node's `fs.lstatSync(path).mode` on native Windows is synthesized from the
read-only attribute alone, not from real ACLs — an exact-equality POSIX
mode check like `(info.mode & 0o777) !== 0o700` is effectively **always
true** (always "wrong") for any real-world directory on Windows, so any
such check fails closed unconditionally, regardless of whether the
directory is actually secure.

The codebase already has the correct fix pattern in several places —
branch on `process.platform === "win32"` and use the shared DACL-based
`assessWindowsPrivatePath`/`hardenWindowsPrivateDirectory` (or
`codex-onboarding-runtime.mjs`'s `assurePrivateDirectory`/
`assurePrivateFile`) instead of a POSIX mode comparison. Example of the
correct pattern, `lib/afk-ledger.mjs:336-340`:

```js
function privateRegularFile(path, parentSecure, { platform, assessWindowsPrivate }) {
  const info = lstatSync(path);
  if (!info.isFile() || info.isSymbolicLink()) return false;
  if (platform === "win32") return parentSecure() && assessWindowsPrivate(path).status === "secure";
  return (info.mode & 0o600) === 0o600;
}
```

Several other call sites duplicate a bare POSIX mode check inline instead,
with no win32 branch at all — same file that already branches correctly
elsewhere for a *different* check.

## Confirmed bug (reproduced live on the reporting Windows machine, spot-checked against this repo's own source)

`lib/onboarding-continuity.mjs:617` and `:625` (function `observeDetailed`):

```js
if (existsSync(privatePaths.directory) && (lstatSync(privatePaths.directory).mode & 0o777) !== 0o700) {
  fail("KICKOFF-PRIVATE-UNAVAILABLE", "private onboarding state directory is not mode 0700");
}
...
if ((lstatSync(historyPath).mode & 0o777) !== 0o600) {
  fail("KICKOFF-PRIVATE-UNAVAILABLE", "private continuity history is not mode 0600");
}
```

No `platform === "win32"` branch, even though this exact file already has
correct win32-aware branching at lines 1211 and 4482 for other checks —
this one duplicates the check inline instead of delegating to the
existing correct helper.

**Effect:** `classifyOnboardingContinuity()` throws
`KICKOFF-PRIVATE-UNAVAILABLE` whenever `.git/agent-pipeline/onboarding/`
exists on Windows (which it always will after the first session). The
catch block in `observeDetailed()` swallows the typed error and returns
`continuity: { status: "unavailable", ... }`.
`project-onboarding-v3.mjs` then reports
`status: "continuity-observation-unavailable"` with `nextAction: null` —
a dead end with no built-in repair path, because
`planOnboardingContinuityRepair` only handles `continuity.status ===
"damaged"`, never `"unavailable"` (by design — it cannot tell what broke).

**Reproduction:** on any Windows machine, once
`.git/agent-pipeline/onboarding/` exists (e.g. after any prior session),
run `project-onboarding-v3.mjs inspect --root <repo> --intent session
--runner claude` on a repo with an active feature in
`pipeline-state.json`. Status comes back
`continuity-observation-unavailable` deterministically, every time,
regardless of whether the state/PRD/spec content is actually fine.

**A workaround tried on the reporting machine did NOT fix it**: renaming
`.git/agent-pipeline/onboarding/` aside and letting
`session-cleanup.mjs apply-recovery` recreate it did not change the
outcome — the freshly created directory still fails the same check on the
next `inspect`, because the bug is in the check itself, not in directory
corruption.

## Additional candidates, found via repo-wide grep on the reporting session, not yet independently reproduced live but spot-checked (2 of the listed files confirmed matching this repo's current source)

**High confidence — no win32 branch anywhere in the file:**

- `lib/local-supervisor-state.mjs:61,65,69` (`trustedAncestor`,
  `ownedStateDirectory`, `ownedStateFile`) — unconditional
  `(stat.mode & 0o022) === 0`, plus `stat.uid === PROCESS_UID` (uid
  semantics are also not meaningful on native Windows). **Spot-checked
  against this repo 2026-08-18: confirmed, file has zero win32 branches
  for these checks.**
- `scripts/worktree-create.mjs:81` — unconditional
  `(stat.mode & 0o077) !== 0`. Zero win32 mentions anywhere in the file
  (per the reporting session's grep; not independently re-checked here).
- `scripts/pipeline-state.mjs:3222,3411,3423,3443` — several
  `(stat.mode & 0o077)` guards around private-state directory/file
  assurance. Main state writer for the whole pipeline — high blast radius
  if hit on Windows.
- `scripts/afk-claude-host.mjs:141` (`loadPrepared`) —
  `(stat.mode & 0o777) !== 0o600`. Name suggests this runs specifically
  under Claude Code sessions, so likely reachable on Windows.
- `scripts/critic-route-activation.mjs:189` (`assertPrivate`) —
  unconditional `(stat.mode & 0o077) !== 0`.
- `scripts/session-cleanup.mjs:248` — unconditional; lower impact
  (opt-in CLI flag, not part of the default flow).

**Already correctly guarded, per the reporting session's own audit (no
action needed):** `lib/afk-ledger.mjs:340`,
`lib/codex-onboarding-runtime.mjs:109,110,122`,
`lib/guard-maintenance-window.mjs:289,291,301`,
`lib/human-guard-override.mjs:636,638,672`,
`lib/session-cleanup-recovery.mjs:197,199,217`,
`scripts/verify-journal.mjs:80,96`, `lib/project-authority.mjs:443`,
`lib/po-gate-authority.mjs:524,532`, plus every file already using an
inline `process.platform !== "win32" && (...mode...)` guard
(`codex-host-layout.mjs`, `close-coordinator.mjs`,
`codex-critic-host.mjs`, `codex-sandbox-select.mjs`,
`critic-packet-preflight.mjs`, `document-binding.mjs`,
`document-adapter.mjs`, `document-render-controller.mjs`,
`private-boundary.mjs`, `worktree-lifecycle.mjs`,
`release-version-plan.mjs`, `public-baseline-diagnostic.mjs`, and others).

**Not checked in depth / probably out of scope for native Windows:**
`scripts/codex-goal-host.mjs:29`, `scripts/session-power.mjs:104` — both
check `info.isSocket()` plus `process.getuid()` (undefined on native
Windows, would throw rather than just fail the mode check); likely only
run inside a Unix-domain-socket / Codex sandbox context.
`lib/onboarding-continuity.mjs:417` (`readPhysicalFile`) — unconditional
`(info.mode & 0o444) === 0` (readability check, not exact-mode equality)
— lower risk since Windows files are essentially always owner-readable.

## Affected artifact

`plugins/pipeline-core/lib/onboarding-continuity.mjs` (confirmed,
reproduced) primarily; the candidate list above for a follow-up sweep.

## Triage

Not yet decided. Suggested approach for whoever picks this up:

1. Fix the confirmed, reproduced bug first:
   `lib/onboarding-continuity.mjs:617` and `:625`. Delegate to the
   existing, already-correct `assurePrivateDirectory`/`assurePrivateFile`
   helpers from `lib/codex-onboarding-runtime.mjs`, or mirror their
   `platform === "win32"` branch inline, consistent with
   `lib/afk-ledger.mjs:336-340`.
2. Work through the "High confidence" list one file at a time, same fix
   pattern. Each has an existing unit-test file
   (`*.test.mjs`) in the same directory — check whether the test suite
   even exercises the Windows branch (several tests skip with
   `if (process.platform !== "win32")`), which would explain why these
   bugs could ship unnoticed if there is no Windows CI.
3. This repo (Nova) is the right place to fix this — it is the same
   `plugins/pipeline-core` source the reporting Windows session's
   consumer project vendors via the marketplace; a fix here (once
   verified and stamped) is what would actually reach that project on its
   next `claude plugin update`.
