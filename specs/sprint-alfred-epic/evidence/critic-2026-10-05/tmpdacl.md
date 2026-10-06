# Critic record — TMPDACL

- Review object (enumerated): `34f6ea0c7`
- Spec: `specs/sprint-alfred-epic/evidence/verify-2026-10-05/winacl-diagnosis.md` (Verdict, Fix proposal, Protected-path status, Matrix)
- Route: requested `claude-sonnet-5-5` at max (standard class); effective `claude-sonnet-5-5` (observed in the dispatch's own runtime prompt)
- Lane: functional-equivalent-read-only; OS isolation not asserted
- Budget: stopped at the 80 % checkpoint (20 of 24); notes persistence unavailable (this file is the Elephant's record)
- First dispatch attempt stopped at the reference boundary (spec reference pointed at a backlog item without criteria, and the dispatch carried summary labels) — a dispatcher defect; re-dispatched with the diagnosis as spec and no labels.
- **Verdict: FAIL** (F1 major)

## Findings

### F1 — major: fixture-only workaround the contract does not recommend; no demonstrated effect

The diagnosis's Fix proposal prescribes hardening in the hook installers plus a Windows-gated installer test, and its
fourth sentence rejects a fixture-only workaround because it would hide the production gap. The commit adds a hardened
fixture temp root and swaps the Codex suite's `tmpdir` import; the helper header claims the failure "has nothing to do
with the code under test", contradicting the Verdict ("Production defect … exposed by the fixtures"). The helper's own
win32 test shows a plain nested `mkdirSync` under the hardened root assesses secure — the masking the spec warns about.
Neither codex log contains an ACL-assurance string; the failing sets are identical apart from case 1.
Evidence: `winacl-diagnosis.md:6-16`, `:59-61`; `private-tmp.mjs:6-9`; `private-tmp.test.mjs:45-60`;
`codex-pretool-guard.test.mjs:17-20`; `scratch/TMPDACL/codex-before.log:3`, `:5-17`. Spec-ref: diagnosis Verdict and Fix
proposal; QG-06; QG-09.
Elephant note (outside the review object): the production fix is `b54b108d9`.

### F2 — minor: the new helper test was not registered in `verify.mjs` (QG-08; `verify.mjs:428-430`).

### F3 — minor: durable failing counts (31/30) contradict the logs (28/27) and the table's own enumeration.

## Deliberately not flagged (summary)

POSIX unaffected by code reading (non-win32 helper is `mkdir 0o700` plus lstat); scope matches the record except the
evidence document; `privateTmpRoot` consumed by the Codex suite; authorship trailers clean; only the import swap changed
in an existing test; helper red/green evidenced; no secrets, no network, no new dependencies; English.

## Trajectory — inconsistent (counts only); before/after trees not bound to commits (not verifiable)

## Disposition by the Elephant

Reverted (code and helper removed, import restored); the measurement and corrected counts are kept in
`../night-2026-10-05/tmpdacl-runs.md`. F2 is moot after the revert.
