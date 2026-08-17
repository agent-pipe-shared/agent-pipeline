---
schema: pipeline.backlog-item.v1
id: pipeline.guard-command-grammar-dialectfor-infers-shell-dialect-from-os-not-actual-shell
type: defect
owner: pipeline
status: closed
created: 2026-08-17
closed_at: 2026-08-17
closure_repository: self
closure_commit: 5e26fa6f
closure_evidence: backlog/items/2026-08-17-command-grammar-guesses-shell-dialect-from-host-os-not-the-actual-tool-shell.md
merged-into: 2026-08-17-command-grammar-guesses-shell-dialect-from-host-os-not-the-actual-tool-shell.md
source: "Relayed by the PO 2026-08-17 from a live Windows (D:\\Dev\\Web\\Toolbox) Claude session's handover, item #2, found while diagnosing the NVA-PAWINACL-1 blocker; independently confirmed against this repository's current source before filing, including both call sites."
---

**Rejected as a duplicate (found 2026-08-17, later same session):** this
item and `backlog/items/2026-08-17-command-grammar-guesses-shell-dialect-from-host-os-not-the-actual-tool-shell.md`
(commit `5e26fa6f`, filed earlier the same day) independently report the
exact same defect from the exact same underlying Windows Toolbox session
report. The earlier item is more complete (names all five
`guard-lifecycle-ready.mjs` call sites, states the two unverified follow-on
effects explicitly) and is kept as canonical; this one is closed per
`backlog/README.md`'s duplicate-merge convention ("the newer item points to
the older one"). No content unique to this item is lost — both cover the
`process.platform`-vs-actual-shell root cause, the `$PWD` consequence, and
the explicit Codex-path-unverified caveat.

# `dialectFor()` selects the shell dialect from `process.platform`, not from which shell is actually invoking the command

## Description

`guard-command-grammar.mjs`'s `dialectFor(command, platform)` (`:59-65`):

```js
function dialectFor(command, platform) {
  if (/^\s*Get-Content(?:\s|$)/iu.test(command)) return "powershell-fixed-read";
  if (platform === "win32"
    || /^\s*(?:[A-Za-z]:\\|\\\\)/u.test(command)
    || /^\s*[^\s"']+\.exe(?:\s|$)/iu.test(command)) return "windows-direct";
  return "posix-simple";
}
```

`platform === "win32"` unconditionally forces the `"windows-direct"` dialect
for EVERY command on a Windows host, regardless of which actual shell
invoked it. `tokenize()`'s `$PWD`/`${PWD}` literal-expansion branches
(`finishToken()`, gated behind `!windows` at `:70`, and the bare-`$`/quoted
detection at `:94-99`/`:115`/`:152`) are therefore dead code on every
Windows host — `$PWD`/`${PWD}` is passed through as a literal 4-character
string instead of being replaced with the real project root.

Confirmed via source: `guard-lifecycle-ready.mjs:2036` calls
`parseGuardCommand(input.tool_input.command, root)` with NO `platform`
option (i.e. `dialectFor`'s default, `process.platform`) inside a branch
gated on `toolName === "Bash"` exclusively (`:2035`) — Claude Code's `Bash`
tool, per its own documented contract, always runs Git Bash (a POSIX shell)
regardless of host OS. For this specific call path, `platform === "win32"`
is the wrong signal: it should ask "which shell is this", not "what OS is
this".

A second call site, `codex-pretool-guard.mjs:220`
(`parseGuardCommand(command, process.cwd(), { platform })`), serves the
Codex runner and explicitly threads a `platform` option — whether Codex's
actual native shell on Windows is genuinely `cmd`/PowerShell (making
`windows-direct` correct there) or something else has NOT been verified.
Blanket-removing the `platform === "win32"` branch would risk breaking
Codex's correct behavior if it does run a native Windows shell.

Not currently blocking: the reporting session worked around it by passing
literal Windows paths instead of `$PWD` in Bash commands. It will bite the
next project/session that follows the `pipeline-start` skill's own
documented happy-path commands verbatim on a Windows host running Claude's
Bash tool.

Two unverified (not live-tested) downstream consequences of the same root
cause, in `isBoundedReadOnlyPipeline()`/`validateRg()`
(`guard-command-grammar.mjs`, ~`:283-320`), which branches on the same
forced `windows` flag: the documented `rg | rg` / `rg | head` bounded
diagnostic-pipe exception may require literal `rg.exe`/`head.exe` instead
of the idiomatic Git-Bash `rg`/`head`, and `2>/dev/null` may need to be
written as `2>nul`.

## Affected artifact

`plugins/pipeline-core/hooks/guard-command-grammar.mjs` — `dialectFor()`
(`:59-65`); its two call sites, `plugins/pipeline-core/hooks/guard-lifecycle-ready.mjs:2036`
(Claude/Bash, no `platform` threaded) and
`plugins/pipeline-core/hooks/codex-pretool-guard.mjs:220` (Codex, `platform`
threaded).

## Proposal

Not designed here — needs Codex's actual native-shell reality confirmed
before the Codex call site is touched, per the reporting session's own
stated caution. Most likely direction: thread an explicit shell-dialect
signal from each CALLER into `parseGuardCommand()`/`dialectFor()` (e.g.
`guard-lifecycle-ready.mjs`'s own Bash-only call site asserts POSIX
directly, since it already knows `toolName === "Bash"` unconditionally),
rather than inferring dialect from `process.platform` — mirroring this
plugin's own stated convention of threading identity explicitly rather than
reading it from ambient environment (the same "echoed, never inferred"
pattern already used for runner identity elsewhere, e.g.
`project-onboarding-ready-gate.mjs`). Before touching the Codex call site,
confirm what shell `codex-pretool-guard.mjs` actually governs on a Windows
host.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** accepted — both call sites and the `dialectFor()` logic
  independently confirmed against current source before filing, including
  the exact claim that `guard-lifecycle-ready.mjs`'s Bash-only call site
  threads no `platform` option.
- **Rationale:** genuine defect, not currently blocking (workaround in use),
  but will recur for the next Windows/Claude session that follows the
  documented happy path literally. Deliberately NOT fixed same-session: the
  Codex call site needs its actual shell reality verified first (the
  reporting session's own explicit caution), and this is exactly the kind
  of guess this session's own standing practice refuses to make blind.
- **Assignment:** queued; needs a Codex-shell-reality verification step
  before a fix can be safely dispatched.
- **Date:** 2026-08-17
