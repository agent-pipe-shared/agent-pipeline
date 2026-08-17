---
schema: pipeline.backlog-item.v1
id: pipeline.command-grammar-guesses-shell-dialect-from-host-os-not-the-actual-tool-shell
type: defect
owner: pipeline
status: open
created: 2026-08-17
source: "Reported by the PO on 2026-08-17, relaying a live diagnosis from a downstream consumer-project session (Windows, D:\\Dev\\Web\\Toolbox) whose own guard-recovery command used --root \"$PWD\" and failed. Independently confirmed against this repository's own source before filing; no fix proposed yet, see Proposal."
---

# `guard-command-grammar.mjs`'s `dialectFor()` selects the shell dialect from `process.platform`, which is the wrong signal for Claude's Bash tool on Windows

## Description

`dialectFor(command, platform)` (`plugins/pipeline-core/hooks/guard-command-grammar.mjs:59`)
forces `"windows-direct"` dialect whenever `platform === "win32"`. Every
`guard-lifecycle-ready.mjs` call site (lines 840, 1034, 1232, 1999 — the
Claude runner's guard) calls `parseGuardCommand(command, root)` with no
`options` object at all, so `platform` always defaults to
`process.platform` (`guard-command-grammar.mjs:176`).

On a Windows host, Claude Code's Bash tool always executes through
Git-Bash/POSIX, never `cmd.exe`/PowerShell natively — confirmed by the
reporting session by checking that `parseGuardCommand()` is only invoked
from `guard-lifecycle-ready.mjs` when `toolName === "Bash"`. `process.platform`
is therefore the wrong signal for this specific call path: it reflects the
HOST operating system, not the actual shell dialect the Bash tool is
running.

**Concrete, reproduced consequence:** `windows-direct` dialect disables
`$PWD`/`${PWD}` expansion entirely. `tokenize()`'s expansion detection
(`guard-command-grammar.mjs:115`, `if (char === "$" && !windows) state.expansion
= true`) is skipped whenever `dialect === "windows-direct"`
(`guard-command-grammar.mjs:84`, `const windows = dialect === "windows-direct"`),
so `finishToken()`'s `$PWD`/`${PWD}` → `root` substitution
(`guard-command-grammar.mjs:70`) never triggers on a Windows host for the
Claude/Bash path. `docs/onboarding-recovery.md` prescribes several recovery
commands using exactly `--root "$PWD"` — all of them silently fail to
expand on Windows, which is exactly what the reporting session hit.

**Scope of what is and is not verified:** `codex-pretool-guard.mjs:220`
(the Codex runner's guard) calls `parseGuardCommand(command, process.cwd(),
{ platform })` with an EXPLICIT `platform` value already threaded through —
whether that value correctly reflects Codex's actual shell dialect on a
Windows host has NOT been checked (by either the reporting session or this
one). This item is scoped to the Claude/Bash path only; do not change the
Codex path without separately verifying it first.

## Affected artifact

`plugins/pipeline-core/hooks/guard-command-grammar.mjs`, function
`dialectFor()` (line 59) and its callers in
`plugins/pipeline-core/hooks/guard-lifecycle-ready.mjs` (the five
`parseGuardCommand(...)` call sites that pass no `options`).

## Proposal

**No finished patch — this needs a design decision, not a one-liner,**
per the reporting session's own assessment (which this Elephant session
has not second-guessed, only independently confirmed the underlying
`process.platform` signal problem). Direction stated by the reporting
session, consistent with this repository's own stated convention ("thread
identity explicitly, never guess from environment"): the CALLER should pass
the actual shell dialect explicitly to `parseGuardCommand()`/`dialectFor()`,
rather than have `dialectFor()` infer it from `process.platform` — scoped
to the Claude/Bash call path in `guard-lifecycle-ready.mjs` only, leaving
`codex-pretool-guard.mjs`'s already-explicit `platform` threading
unchanged unless and until that path is separately verified as also wrong.

**Two plausible but unverified follow-on effects, named by the reporting
session, not yet checked here:** (1) the `rg`-to-`rg`/`rg`-to-`head`
bounded diagnostic pipeline exception may need `rg.exe`/`head.exe` instead
of the current Git-Bash-native assumption if the dialect changes; (2)
`2>/dev/null` redirect handling may need a `2>nul` equivalent. Verify both
before or as part of implementing the fix, not after.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** accepted as a confirmed defect, NOT dispatched this AFK
  block. The root-cause `process.platform` signal problem and its
  reproduced `$PWD` consequence are independently confirmed against this
  repository's own source; the fix direction is credible but explicitly
  incomplete (spans two files, needs a design call on exactly how identity
  is threaded, and the two follow-on effects are unverified). Guardrail/hook
  file (MP-07) plus genuine design latitude — `goldfish-deep` territory once
  a concrete design exists, but not yet ready to brief.
- **Rationale:** dispatching an underspecified guardrail-hook change risks
  a repeat of this same session's two Critic FAILs (NVA-WINPATH-1, the
  plugin-dedup settings fix) — both were dispatched or self-implemented
  before the full consequence set was verified. This item stays open until
  a concrete "how identity is threaded" design exists.
- **Assignment (if accepted):** deferred — needs a PO/design decision on the
  threading approach before a dispatch briefing can be written; not this
  AFK block's immediate next action.
- **Date:** 2026-08-17
