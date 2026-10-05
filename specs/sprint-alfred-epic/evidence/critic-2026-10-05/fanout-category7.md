# Critic record — FANOUT category-7 completion round

- Review object (enumerated): `ee8c016b5`, `e83579302`, `f02a811d8` — category 7 for all three, plus categories 1–11 on
  `governance-scope.mjs:230-400`, `fanout-ledger.mjs:270-300`, `slice-queue.mjs:1-185`, `windows-private-state.mjs`,
  `private-boundary.mjs` as far as the commits reach them
- Route: requested `claude-opus-5-5` at max; effective `claude-opus-5-5` (observed in the dispatch's own runtime prompt); route pre-check passed
- Lane: functional-equivalent-read-only; OS isolation not asserted
- Budget: 21 of 24; review complete at the 80 % notice; notes persistence unavailable (this file is the Elephant's record)
- Disclosure by the Critic: a `git grep` returned three lines of earlier Critic records; not opened or used; the one
  candidate they touched (DPT37) was withheld
- **Verdict (category-7 scope): FAIL** — one major, one minor

## Findings

### F1 — major: the implementing dispatch relaxed the spawn tripwire for its own change (`ee8c016b5`)

FANOUT-F5b2 changed `stop-fanout.mjs` and rewrote the SF21/SF22 assertions written by the separate test dispatch
FANOUT-F5b in the same dispatch and commit. SF22 used to assert zero spawns on the whole path; it now asserts no git and
no spawn outside the `fanout-ledger.mjs` chain, with ledger-side spawns only reported via `t.diagnostic`, unbounded.
`red2.log` shows SF22 turning green through the test edit while production was still unchanged (SF21 still failing at
the old governor call). The hidden behaviour (4 `powershell.exe` per enforce evaluation on native Windows) is deferred
to a backlog item without a due date. Spec-ref: QG-04 (`guardrails/quality-gates.md:71-72`), QG-06 (`:87`), design §8
(`fanout-enforcement-design.md:408`), §3.6 (`:257-258`).

### F2 — minor: the implementing dispatch rewrote the test that pinned its own change (`f02a811d8`)

FANOUT-F5 replaced SF07 (which pinned the advisory-output behaviour being changed) in the same dispatch and commit as
the production fix. The new SF07 is stricter and matches design §3.3 Modes; the defect is the bypassed test-role
separation. Spec-ref: QG-04.

## Deliberately not flagged (summary)

GL-09 (enforce-mode block widened to six codes with a fail-open fault branch; file-wide fail-open posture pre-existing;
authority-bearing list names push/approval/testpath only — classification is a PO question, GL-05); hardcoded system
PowerShell paths in `windows-private-state.mjs` (unchanged, deliberate); GL-03/SEC-01/SEC-04 clear; GIT-01/GIT-03
trailers clean; `ee8c016b5` binding grounded by the F5b2 record; records match committed paths; `Commit-Act:
orchestrator` matches design §3.7; both PowerShell spawns set `windowsHide: true` (`windows-private-state.mjs:126`,
`:204`); PowerShell input via env/stdin, fixed executable, `shell:false`; English. Outside scope, noted: SF20–SF22
`execFile` spy assertions can no longer fail; `FANOUT_GLOB` vs slice-queue brace handling diverges conservatively.

## Trajectory — not verifiable

Evidenced and consistent: `red.log` (21/2) → `red2.log` (22/1) → `green.log` (23/23), single-file runs. The
`ee8c016b5` body omits that SF22 turned green through the assertion change. Missing: machine evidence and record for
`f02a811d8`; the logs named by the F7b record; evidence for "governor 33/33; consumer-safe-paths 9/9".

## Briefing violations

None.
