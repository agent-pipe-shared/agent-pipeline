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
| Claude P0-5 hold point ignored | G9 / AC-264 | Blocked on a design decision (ALF-B23-G9C): the approved course carries no machine-readable PO acceptance point and there is no release primitive, so `hold-po` cannot be seeded (EL-04) |
| 2026-10-19 incident: a test fixture wrote the real repository's governance record (state declined, guards silent) | BLOCKER | Fixtures never resolve to the enclosing repository: GIT_CEILING_DIRECTORIES in the fixture helpers, a root/common-dir assertion before any decide/apply, a tripwire against mutating the process's own root, and a regression case with TMPDIR inside a throwaway checkout |
| Same incident: the sweep ran with TMPDIR inside the checkout | BLOCKER | The test runner refuses a TMPDIR inside any checkout and a cwd at the repository root |
| Same incident: an active-to-declined flip was silent, and recovery was manual | HIGH | A flip to declined is reported loudly at preflight. A typed recovery exists for a pending enrollment retirement whose barrier no longer matches .git/config |
| TP shell classifier gaps (ALF-B23-TPSHELL) | HIGH | `lib/protected-test-paths.mjs` misses `cp -t`, directory destinations and archive extraction. `guard-lifecycle-ready` main() has no try/catch. A TP-7 file re-copied by an unidentified writer is still unexplained |
| Claude P1-1 entry gate contradicts itself | G10 / AC-127 | Replay on a greenfield fixture at HEAD; reopen only if it reproduces |
| Claude P1-5 signing setup (trust file, recursive ACL advice) | G8 / AC-264 | Onboarding blocks on the trust-file problem, the signature helper creates the file, and no recursive takeown/icacls advice is ever emitted |
| Claude P1-6 approved spec locks itself after one edit | G6 / AC-115 | Pre-edit warning, self-revert path, and a spec-amendment route without reopen-design |
| Claude P1-7 tests not separated from implementation | G7 / AC-186 | Test-authorship split per slice or a mandatory Critic test focus; guard-testpath distinguishes per task |
| Claude P1-4 `configure-verify` root cause | AC-150 | Fix in the protected `scripts/pipeline-state.mjs` (CVCT-FILE); needs a ceremony |
| Codex P0-2 / P1 implementer-owned checks | AC-186 | Same as G7 |
| Codex P1-1 dispatch recovery | AC-245 | Three P1-1 clauses uncovered |
| Codex P1-2 forensics | AC-133 | Major clause still uncovered; native-host check open |
| Codex P1-3 decision continuity | AC-155 | Decision-continuity check and fitness run |
| AGY Prio 3 rigor 2 ran with no Critic | AC-142 | Self-declared rigor/risk (E3/E20) |
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
- `restricted-governance-put-re-hardens-the-root-on-every-write` (needs a decision)
- `licensing-outlook-states-a-zero-price-today` (PO: before the 0.7.0 release)
- `machine-wide-key-directory-resolution`, `typed-plugin-update-next-action`,
  `model-role-bootstrap-ignores-version-bumps-within-a-family`,
  `correction-critic-reuses-the-full-review-context` (scheduling under D20 unresolved)

## Measurement gaps

- AC-1..AC-37 and IR-1..IR-4 have no status newer than 2026-10-09.
- 32 of the 174 item ACs were never part of a counted sweep.
- No Full Verify PASS on any host, no Critic batch, and no PO acceptance yet (stage 100 = 0).
- Two records disagree on AC-175: E10 narrows it, while the batch table says closed-by-decision.
- D9's text was never persisted.

## Correction

The 2026-10-19 note that an Edit on `hooks/guard-lifecycle-ready.mjs` was admitted is not a guard
gap. That path matches no TP pattern (`templates/prompts/agent-obligations.md` TP table). Its
`PB-GUARD-HOOKS` protection is enforced when the candidate is checked, which is by design. It stays a
Critic-batch check item.
