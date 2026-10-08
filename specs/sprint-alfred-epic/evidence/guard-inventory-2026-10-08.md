# Guard/hook inventory against PO decision BI (2026-10-08 late: remove toil causers that protect no critical feature)

Source: `plugins/pipeline-core/hooks/hooks.json` at `f2df2f742` (TP-4 protected → a change needs the signed package).
Criterion: KEEP only what protects a critical feature — push/signature, secrets/env dump, protected tests (QG-04),
destructive git, consumer onboarding consent. Everything else → advisory (exit 0/1, never blocks) or removed. Toil
references are rows of `toil-log-2026-10-06-07.md`. **Status: superseded — rejected by the PO as too far-reaching (BI
amendment, 2026-10-08 late); replaced by the per-toil-row design note `../design/toil-resolution-2026-10-08.md`. Kept
only as an index of the hooks.**

| # | Hook (event/matcher) | Protects | Live toil | Proposal |
|---|---|---|---|---|
| 1 | guard-git (Bash/PS) | destructive git (force-push, history rewrite, hook skip) | low | **KEEP** |
| 2 | guard-push (Bash/PS) | push gate + signature | T38, T74 (fires on read-only `git grep`) | **KEEP**, classifier scoped to a real `git push` only |
| 3 | guard-testpath (Edit/Write) | protected tests (QG-04/TP-*) | ceremony cost (TP-13) | **KEEP** |
| 4 | guard-lifecycle-ready (Bash/PS/Read/Grep/Glob) | closed shell grammar, env-dump refusal, read targets | T57, T60, T63, T72, T74 (~10 refusals per diagnosis) | **SPLIT**: keep env-dump + credential-root reads; drop the closed read grammar (admit every read-only command) |
| 5 | guard-lifecycle-ready (Edit/Write) + guard-devplan | no implementation before plan approval | T70, T73, T75, T76 — locked all work twice after a device switch / upgrade | **ADVISORY** for an approved feature (approval verified once at `set-phase`, never re-derived per write); blocking only in draft phase |
| 6 | guard-gate-strength (Edit/Write) | calibration file tampering | T63 | KEEP narrowly (calibration file only) |
| 7 | guard-dispatch (Task/Agent/Workflow) | freehand briefing structure | low | ADVISORY |
| 8 | guard-advisor-prohibition (advisor) | MP-26 prohibition for a bound dispatch | none seen | KEEP (cheap, narrow) |
| 9 | guard-dispatch-budget (all tools) | harness maxTurns cliff | T34 (~170 ms/call), T37, T47, T49, T54, T56 | **SIMPLIFY**: counter + notice; refusal only at the Goldfish cap; no governance-scope probe per call |
| 10 | guard-worktree-isolation (all tools) | detection only (exit 1) | per-call cost | REMOVE (dispatch-time check is enough) |
| 11 | guard-onboarding-consent-lock (Edit/Write) | onboarding consent in consumer repos | none here | KEEP |
| 12 | guard-el01-tripwire (Edit/Write) | Elephant writes no production code | low | ADVISORY |
| 13 | guard-handover-size (Edit/Write) | handover file size | low | ADVISORY |
| 14 | guard-slicing (Task/Agent/…) | already advisory | none | KEEP |
| 15 | native-goldfish-host (PostToolUse) | opt-in host commit route | unknown | KEEP |
| 16 | claude-task-output-scope-posttool | task output read scope | low | KEEP |
| 17 | claude-intake-prompt-capture | onboarding intake | none | KEEP |
| 18 | stop-suggest (Stop) | advisory | noise | KEEP |
| 19–21 | staleness / setup / codex-hint (SessionStart) | advisory | Codex hint shown in Claude | KEEP; Codex hint only for Codex |
| 22 | post-compact-reground | advisory | none | KEEP |

Beyond the hooks: the per-write re-derivation of the design-advisory / readiness / course / host-receipt chain (DWP*,
DAA*, DACS*, DRHS*) is the largest toil source of this candidate (T35, T64, T70, T76). Proposal: verify the approval
chain once at `approve-plan` / `set-phase implementation`, persist a tracked verification record, and let the guard read
only that record plus "PRD/Spec bytes unchanged". Another device rebinds through R7-5 `rebind-approval`.
