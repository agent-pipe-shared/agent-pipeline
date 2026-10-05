---
schema: pipeline.backlog-item.v1
id: pipeline.fanout-ledger-spawns-powershell-on-every-stop-on-windows
type: defect
owner: pipeline
status: open
created: 2026-10-06
source: "Observed live during the Alfred night run, 2026-10-06 (FANOUT-F5b2 spawn tripwire, stop-fanout.test.mjs SF22)."
sprint: alfred
done_when: manual
---

# The fan-out ledger spawns PowerShell on every Stop evaluation on native Windows

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

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
