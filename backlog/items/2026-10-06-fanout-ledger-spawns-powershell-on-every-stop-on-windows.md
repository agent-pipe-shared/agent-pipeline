---
schema: pipeline.backlog-item.v1
id: pipeline.fanout-ledger-spawns-powershell-on-every-stop-on-windows
type: defect
owner: pipeline
status: closed
created: 2026-10-06
source: "Observed live during the Alfred night run, 2026-10-06 (FANOUT-F5b2 spawn tripwire, stop-fanout.test.mjs SF22)."
sprint: alfred
done_when: manual
closed_at: 2026-10-09
closure_repository: self
closure_commit: 7d2837f8d9dd077e2079fbbb766c573bf01978b3
closure_evidence: specs/sprint-alfred-epic/signed-package/tranche-2/README.md
---

# First Stop per common dir: one-time directory-creation latency, accepted (re-scoped from "the fan-out ledger spawns PowerShell on every Stop evaluation on native Windows")

> **Re-scoped and closed 2026-10-09 (Ruling 87, FANOUT-WIN-M).** The original premise "spawns on every Stop" does not
> hold. Only the FIRST ledger-writing Stop per git common dir spawns 4 `powershell.exe`, all from `ensureLedgerDirectory`
> -> `ensurePrivateDirectory` creating the directory (about 1.2 s once). Every later Stop spawns 0 (about 0.24 s). The
> one-time latency is accepted; there is no production fix in 0.7.0. The body below is the original observation, kept
> as written (append-only).

## Closure

- **Measurement** (`evidence/FANOUT-WIN-M-20261009/spawns.txt`, git-ignored, so the numbers are copied here; native
  win32, node v24.20.0, x64, one run, real hook process per Stop, tripwire control recorded 1):

  | Stop | Common dir | Ledger dir pre-existed | Decision | Wall | Spawns |
  |---|---|---|---|---|---|
  | 1 (enforce, fresh common dir A) | fresh | false | block | 1158 ms | 4 (`powershell.exe`=4, git=0) |
  | 2 (same dir A, same session) | A | true | block, ledger append | 244 ms | 0 |
  | 2b (same dir A, different session id) | A | true | block | 235 ms | 0 |
  | 3 (`requiresEnforcement:false`, fresh dir B) | B | false | silent, nothing created | 234 ms | 0 |

  The 4 spawns of Stop 1 all share one chain: `windows-private-state.mjs>private-boundary.mjs>fanout-ledger.mjs>stop-fanout.mjs`.
- **Ruling 87** (`specs/sprint-alfred-epic/plans/0.7-execution-order.md`, "Ruling 87 (FANOUT-WIN-M, 2026-10-09 night)"):
  no production fix; SF22's bound of 4 is correct for its fresh sandbox and stays.
- **Tranche-2 pin SF22b** (`specs/sprint-alfred-epic/signed-package/tranche-2/README.md`, section SF22b; test commit
  `7d2837f8d`): a second Stop against the same common dir pins 0 spawns, so a regression to per-Stop spawning goes red.
- **Not measured:** WSL, macOS, Codex, agy (the hook is the Claude Stop adapter; SF22 already pins 0 off win32).

## Description

Design `specs/sprint-alfred-epic/design/fanout-enforcement-design.md` §3.6 ("Hook cost") requires the Stop hook to
spawn nothing ("no `git`, no network (stop-suggest's rule)"), and §8 (native Windows) repeats it. After FANOUT-F5b2
the Claude Stop adapter itself spawns nothing, but one enforce-mode evaluation on native Windows still spawns
`powershell.exe` four times, measured by the real-process tripwire in `plugins/pipeline-core/hooks/stop-fanout.test.mjs`
(SF22 diagnostic): `windows-private-state.mjs` <- `private-boundary.mjs` <- `fanout-ledger.mjs` <- `stop-fanout.mjs`.
Each run costs about 1.2 s. Once the hook is wired (slice S8), that cost lands on every orchestrator turn end on
Windows. A second transitive spawn exists when the fan-out config carries no boolean `requiresEnforcement`:
`observeGovernanceScope` runs git (`lib/governance-scope.mjs:256-258` -> `lib/worktree-lifecycle.mjs:255-277`).

## Triggering situation

FANOUT-F5b2, commit `ee8c016b5`; Critic finding F-A on `f02a811d8`
(`specs/sprint-alfred-epic/evidence/critic-2026-10-05/fanout-f5-delta.md`).

## Affected artifact

`plugins/pipeline-core/lib/fanout-ledger.mjs` (private-directory assurance per append),
`plugins/pipeline-core/lib/private-boundary.mjs`, `plugins/pipeline-core/lib/windows-private-state.mjs`,
`plugins/pipeline-core/lib/governance-scope.mjs`.

## Proposal

Assure the ledger's private directory once (at queue validation or on first use per session, cached by inode/mtime
of the directory), not on every append; on the hot Stop path only re-check cheap facts (`lstat`, owner via the
cached assessment). Let the fan-out config carry `requiresEnforcement` explicitly (written by whoever writes the
config) so the governance observation never runs git at turn end. Keep fail-open on any error (rule 1). Add a
real-process spawn test on Windows that asserts zero spawns per Stop after the first. Due before slice S8 wires the
hook (and in any case before the 0.7.0 release candidate); until then SF22 must pin the ledger-side spawns exactly
(executable, call chain, count) rather than tolerate them unbounded (FANOUT category-7 Critic F1,
`specs/sprint-alfred-epic/evidence/critic-2026-10-05/fanout-category7.md`).

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** closed, re-scoped to "first Stop per common dir: one-time directory-creation latency, accepted" (Ruling 87).
- **Rationale:** measured premise failure: only the first ledger-writing Stop per common dir spawns (4 `powershell.exe`, about 1.2 s once); later Stops spawn 0. Steady state is pinned by SF22b.
- **Assignment (if accepted):** none; no production fix in 0.7.0.
- **Date:** 2026-10-09
