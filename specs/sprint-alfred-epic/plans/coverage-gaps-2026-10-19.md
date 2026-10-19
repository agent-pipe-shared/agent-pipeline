# 0.7.0 coverage gaps, 2026-10-19

Read-only coverage audit at HEAD 7fc28f828, checked against the current text of every source.
It answers whether every blocker and major finding from the greenfield runs, every 0.7.0 AC and
every 0.7.0 backlog item is in the next candidate. **Answer: not yet.** This file is the tracked
work list until each row has a delivery commit or a recorded decision. No project identifiers are
copied from the source reports, and the source reports themselves stay local.

## Sources

| Run | Ids | Fold-in |
|---|---|---|
| Greenfield, Claude Code on Windows (2026-10-18) | P0-1..5, P1-1..7, P2-1..8, P3 | fix packages G1-G10 (this file replaces the local mapping) |
| Greenfield, Codex on WSL (2026-10-17) | P0-1..2, P1-1..3, P2 | 0ac30fb44 |
| Greenfield, Antigravity on WSL (2026-10-17/18) | F-01..F-08, Prio 1-5 | dacf773b6 |
| Real greenfield project report (2026-10-18/19) | PF-01..PF-28 | 3636e4332, aabfd86c9, e3fbb6fe3; D10-D19 |

## Blocker and major findings without a delivery

| Finding | Package / AC | What is missing |
|---|---|---|
| Claude P0-2 `--by` used in the PO's name | G9 / AC-264 | Rule and label docs delivered in 4ea2b4031 (EL-36). Still open: role binding of `--by` is a design change (backlog) |
| Claude P0-3 guard bypass via the PO running an agent-prepared step | G9 / AC-264 | Rule delivered in 4ea2b4031 (EL-37). Critic flag: built while the guards were dark |
| Claude P0-5 hold point ignored | G9 / AC-264 | Decided as D33: typed acceptance points in the plan, `hold-po` only for dependent slices, chat release covered by the push signature. Open: ADR and register entry, lib and tests, then a ceremony on `scripts/pipeline-state.mjs` for the release verb |
| 2026-10-19 incident: a test fixture wrote the real repository's governance record (state declined, guards silent) | BLOCKER | Fixtures never resolve to the enclosing repository: GIT_CEILING_DIRECTORIES in the fixture helpers, a root/common-dir assertion before any decide/apply, a tripwire against mutating the process's own root, and a regression case with TMPDIR inside a throwaway checkout |
| Same incident: the sweep ran with TMPDIR inside the checkout | BLOCKER | Reshaped by D32: fixtures stay in the repository and are secured. Measured by ALF-B24-FIXESC2: production Git discovery (`worktree-lifecycle.mjs` gitEnvironment allow-list) drops GIT_CEILING_DIRECTORIES, so the ceiling must reach production discovery |
| Same incident: an active-to-declined flip was silent, and recovery was manual | HIGH | A flip to declined is reported loudly at preflight. A typed recovery exists for a pending enrollment retirement whose barrier no longer matches .git/config, and it restores the state file's private mode: after the hand restore the state was 644, the approval observer failed with CVCT-FILE, and its catch-all reported only the generic CVCT-APPROVAL-UNAVAILABLE |
| TP shell classifier gaps (ALF-B23-TPSHELL) | HIGH | `lib/protected-test-paths.mjs` misses `cp -t`, directory destinations and archive extraction. `guard-lifecycle-ready` main() has no try/catch. A TP-7 file re-copied by an unidentified writer is still unexplained |
| Claude P1-1 entry gate contradicts itself | G10 / AC-127 | Replay on a greenfield fixture at HEAD; reopen only if it reproduces |
| Claude P1-5 signing setup (trust file, recursive ACL advice) | G8 / AC-264 | Onboarding blocks on the trust-file problem, the signature helper creates the file, and no recursive takeown/icacls advice is ever emitted |
| Claude P1-6 approved spec locks itself after one edit | G6 / AC-115 | Decided as D31: pre-edit warning, self-revert path, and a spec-amendment route without reopen-design (ceremony where `scripts/pipeline-state.mjs` is touched) |
| Claude P1-7 tests not separated from implementation | G7 / AC-186 | Decided as D34: same Goldfish, tests first, proven by a captured RED run checked at host commit, plus a Critic test focus |
| Claude P1-4 `configure-verify` root cause | AC-150 | Fix in the protected `scripts/pipeline-state.mjs` (CVCT-FILE); needs a ceremony |
| Codex P0-2 / P1 implementer-owned checks | AC-186 | Same as G7 |
| Codex P1-1 dispatch recovery | AC-245 | Three P1-1 clauses uncovered |
| Codex P1-2 forensics | AC-133 | Agent part delivered in b6d3c7a91 (repository-filtered scan, lineage, honest truncation; pin 14/14). Open: the parent/child link field spellings against a live Codex store, and the native Windows positive path |
| Codex P1-3 decision continuity | AC-155 | Re-checked at fb99d8f62: no significance logic in `lib/design-review-receipt.mjs`, no fitness run at the boundary. Still open |
| AGY Prio 3 rigor 2 ran with no Critic | AC-142 | Close gate delivered in d621b2871, budget next step in 10819d460 (pin 9/9). Cap confirmed by the PO as D35. No agent work left |
| AGY F-02/04/05 exit 127, dispatch prepare, parallel writes | AC-108 | Uncovered clauses; native-host open |
| AGY F-01 interpreter opacity clause | AC-115 | Clause open |
| AGY F-03 signature UX | AC-264 | No single PO command |
| AC-264 plan-readiness hand-off | D30 | Design spike done (ALF-B21-AC264SPIKE); lib, tests, then a ceremony on `scripts/pipeline-state.mjs` |
| AC-147/209 catalog half | D29 | Codex-host session, then a ceremony on `lib/guard/read-scope.mjs` |
| PF-21, PF-26, PF-27 | C2, C3, C1 | In source; effective once the ceremony runs |

## 0.7.0 backlog items with no AC row and no decision

- `codex-signed-candidate-worktree-admission` (accepted for the next local candidate; no delivery found)
- `owned-gitignore-without-evidence-breaks-every-item-governed-host-commit` (open defect in the PF-26 flow)
- `test-fixtures-inside-the-checkout-write-the-real-repository` (partial 4679f8a6d, dbd497fcc; tripwire clause unverified)
- `restricted-governance-put-re-hardens-the-root-on-every-write` (after 0.7.0, D37 amends D36: no AC row, behaviour already correct)
- `licensing-outlook-states-a-zero-price-today` (in this candidate, D36; final wording is the PO's)
- `machine-wide-key-directory-resolution`, `typed-plugin-update-next-action`,
  `model-role-bootstrap-ignores-version-bumps-within-a-family`,
  `correction-critic-reuses-the-full-review-context`, role binding of `--by` (after 0.7.0, D36)

## Measurement gaps

- AC-1..AC-37 and IR-1..IR-4 have no status newer than 2026-10-09.
- 32 of the 174 item ACs were never part of a counted sweep.
- No Full Verify PASS on any host, no Critic batch, and no PO acceptance yet (stage 100 = 0).
- Two records disagree on AC-175: E10 narrows it, while the batch table says closed-by-decision. E10 is later and governs.
- D9's text was never persisted.
- `hooks/guard-dispatch.test.mjs` GD22, GD26 and GD27 (incomplete briefing; the real critic-review.md and goldfish-task.md templates, filled, are dispatchable) were red at 38b3b8a65 with and without the 203a53687 template change. Fixed in 66aacfc2e (Dispatch ALF-B28-GD2, 66/66; RED baseline 63/66). They did not read the real checkout; the hook resolves CLAUDE_PROJECT_DIR, which is the fixture. The causes were two fixture defects: the enrolled fixture lacked project authority files (SQ-AUTHORITY-UNAVAILABLE masked the briefing finding), and GD8 filled an Opus model with no MP-07 rationale. Critic batch and PO acceptance are pending. Backlog observation (protected guard, not a 0.7.0 fix): guard-dispatch runs item admission before role preflight even when policy findings already exist, which hides the briefing finding. AC-260 binding note: the item's original acceptance concerns `design-workflow-signing-default.test.mjs`, already addressed by 32169fca8, 89d8446be and 087529609. This repair is a separate red-test fix bound to the same row.

## Correction

The 2026-10-19 note that an Edit on `hooks/guard-lifecycle-ready.mjs` was admitted is not a guard
gap. That path matches no TP pattern (`templates/prompts/agent-obligations.md` TP table). Its
`PB-GUARD-HOOKS` protection is enforced when the candidate is checked, which is by design. It stays a
Critic-batch check item.
