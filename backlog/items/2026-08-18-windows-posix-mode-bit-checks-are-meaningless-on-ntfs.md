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

## Triage (2026-08-18, goldfish-deep dispatch NVA-WINMODE-1)

- **Decision:** accepted. All 7 files named in the dispatch (the confirmed
  reproduced bug plus the full "High confidence" list) were fixed with the
  same pattern: branch on `platform === "win32"` and delegate to the shared
  DACL-based `assessWindowsPrivatePath` (from `lib/windows-private-state.mjs`
  — the actual export source; `human-guard-override.mjs` only imports it,
  it does not re-export it) instead of a bare POSIX mode-bit comparison,
  mirroring `lib/afk-ledger.mjs:336-340`. POSIX (non-win32) behavior is
  byte-for-byte unchanged in every file.
- **Files fixed, with commit SHA and test evidence (suite name + pass
  count):**
  1. `lib/onboarding-continuity.mjs` (`observeDetailed`, lines 617/625,
     the confirmed reproduced bug) — commit `b1e28a70`.
     `node --test plugins/pipeline-core/lib/onboarding-continuity.test.mjs`
     → 158/158 pass.
  2. `lib/local-supervisor-state.mjs` (`trustedAncestor`,
     `ownedStateDirectory`, `ownedStateFile`) — commit `22f321c0`.
     `node --test plugins/pipeline-core/lib/local-supervisor-state.test.mjs`
     → 25/25 pass.
  3. `scripts/worktree-create.mjs` (`ownerNonce`) — commit `24f71290`.
     `node --test plugins/pipeline-core/scripts/worktree-create.test.mjs`
     (new file; none existed before) → 3/3 pass.
  4. `scripts/pipeline-state.mjs` (`ensureCaseMigrationDirectory`,
     `ensureBootstrapPrivateDirectory`, `observeBootstrapPrivateDirectory`,
     `readPrivateBootstrap`) — commit `00053e64`.
     `node --test plugins/pipeline-core/scripts/pipeline-state-result-case-migration.test.mjs`
     → 3/3 pass;
     `node --test plugins/pipeline-core/scripts/pipeline-state-result-bootstrap.test.mjs`
     → 6/6 pass;
     `node --test plugins/pipeline-core/scripts/pipeline-state.test.mjs`
     (regression check on the shared file) → 1/1 pass.
  5. `scripts/afk-claude-host.mjs` (`loadPrepared`) — commit `45bfe87e`.
     `node --test plugins/pipeline-core/scripts/afk-claude-host.test.mjs`
     → 9/9 pass (2 new tests exercise the real, previously fully-stubbed
     `loadPrepared` via a real scratch git repo).
  6. `scripts/critic-route-activation.mjs` (`assertPrivate`) — commit
     `7d6cb1a9`. `node --test plugins/pipeline-core/scripts/critic-route-activation.test.mjs`
     → 8/8 pass.
  7. `scripts/session-cleanup.mjs` (`ownerNonce`, same bug/pattern as
     `worktree-create.mjs`) — commit `a285912f`.
     `node --test plugins/pipeline-core/scripts/session-cleanup-owner-nonce.test.mjs`
     (new file; none existed before) → 3/3 pass; regression check on
     `session-cleanup-binding.test.mjs` → 45/45 pass and
     `session-cleanup-power.test.mjs` → 2/2 pass.
  - `node --test harness/scripts/check-consumer-safe-paths.test.mjs` → 9/9
    pass (required since this dispatch touched `plugins/pipeline-core/**`).
- **Stopped-on files:** none. All 7 files matched the expected fix pattern;
  no per-file stop condition was triggered.
- **Notable finding during implementation (not a stop, a design note):**
  the directory-level check at `onboarding-continuity.mjs:617` turned out
  to be effectively unreachable-as-failing on POSIX even before this fix —
  `resolvePrivate()` in the same file delegates to
  `codex-onboarding-runtime.mjs`'s own already-correct
  `assurePrivateDirectory`, which auto-repairs (`chmodSync(path, 0o700)`)
  an insecure directory it observes on POSIX before this file's own inline
  check ever runs. The fix was still applied for consistency and because it
  is the code path Windows actually hits (no such auto-repair exists for
  win32 there), but a POSIX regression test specifically isolating "the bare
  directory check fails on an insecure-mode directory" could not be
  constructed for that reason (see commit `b1e28a70`'s test-file comment).
  The sibling file-level check (`:625`, the continuity history file) has no
  such auto-repair and its POSIX regression is directly tested.
- **New test files created** (in scope per the dispatch; TP-3 protected, so
  the dispatch itself could not register them): `scripts/worktree-create.test.mjs`,
  `scripts/session-cleanup-owner-nonce.test.mjs`. **Registered in
  `harness/scripts/verify.mjs` 2026-08-18** via two PO-signed
  human-guard-override ceremonies (ADR-0059), commits `93911e70` and
  `51d483a7` — both suites now run as part of the standard Verify gate.
- **Not yet done — explicit scope boundary, not an oversight:** production
  callers of the now win32-capable checks (e.g. `loadPersistedActivation`,
  `finalizeClaudeWorker`, the `pipeline-state.mjs` private-state helpers)
  still default to `process.platform`/the real `assessWindowsPrivatePath`
  when no override is supplied, so no caller needs to change to pick up the
  fix — but this dispatch did not go hunting for every indirect production
  call site to double-check each one's real-Windows reachability beyond the
  ones the backlog item named.
- **Status: implementation and mocked-Windows testing are complete, but
  closure is withheld.** This dispatch ran on Linux/WSL only and cannot
  perform a live-Windows re-verification. `status:` frontmatter stays
  `open`. Per this repo's own established convention for this exact
  situation (see `backlog/items/2026-08-17-windows-acl-hardening-never-
  remediates-a-pre-existing-insecure-directory.md`'s own Triage), whoever
  next runs a native-Windows session against this branch should re-run all
  7 suites above (plus the two regression suites) live before this item is
  treated as closed.
- **Date:** 2026-08-18
