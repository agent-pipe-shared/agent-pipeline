# Critic record — SF22v exact pin and PKGFIX both-order proof (fix verification)

- Review object (enumerated): `de4d37afa` (FANOUT-SF22v, test-only), `5ba157e97` (PKGFIX, package READMEs + reverse-order
  proof)
- Spec: `specs/sprint-alfred-epic/design/s2-guard-split-plan.md`, `guardrails/quality-gates.md`; registry: s1c-sf22 F-C,
  package-split F-1..F-3
- Route: requested `claude-sonnet-5-5`; effective `claude-sonnet-5-5` (observed in the dispatch's own runtime prompt);
  standard class, no A/G/S pre-check
- Lane: functional-equivalent-read-only; OS isolation not asserted
- Budget: checkpoint at call 20 of 24
- **Verdict: pass/fail withheld — partial review** (not reached: `guardrails/global.md`, sha256 of the seven package
  inputs against the tree, independent host-path scan of the two JSON files, README link targets, step-level output of
  the reverse proof beyond ids and exit codes, the SF22 backlog item's owner/expiry, the dispatch-record binding). One
  minor finding.

## Findings

### F1 — minor: the tolerated red state's expiry is a milestone, not a date

`verify-registration-package-1/README.md:119-121` gives reason and owner for the suite-registration exit 2 (Q11 pair)
but "expiry — before the 0.7.0 release candidate"; QG-06 (`guardrails/quality-gates.md:86-87`) requires an expiry date.

### Candidate not taken through the gate (Elephant follow-up)

The README's measured end state ("exactly two UNREGISTERED") rests on proofs at `bcdeab014` and `97407974f`; commit
`3f85cff0c` (after both) added `plugins/pipeline-core/scripts/gitleaks-repair-ignore.value-binding.test.mjs` under a
registered root, which the package does not register. **Elephant check:** the file is new and unregistered, so at the
current HEAD the package's end state would show three UNREGISTERED files, not two. Routed: the registration package
gains this suite and the proof is re-run (follow-up dispatch).

## Deliberately not flagged (summary)

SF22: `<=` became `===` on win32 only, strictly stronger, case ids unchanged; the Critic's run gave 23/23 with exactly
4 PowerShell spawns observed. QG-04 held (test-only, own dispatch). Scope exact for both commits. Reverse proof: all 12
patch steps exit 0, no fuzz, the five targets identical in both orders, the only differing paths are the two `.orig`
backups; end state after both packages suite-registration exit 2 with the Q11 pair only, case-completion exit 0
(297 → 304); cross-checks against `regproof-result.json` all true; the S2 README discloses review pending and PO
acceptance open. No new dependency; English; trailers clean.

## Trajectory — consistent (for everything reached)

README numbers match the machine artifact (schema `pipeline.alfred.regproof.v1`); the Critic's SF22 run reproduces the
pinned 4. Not verifiable: dispatch-record binding (records not supplied).

## Registry status

s1c-sf22 F-C resolved. package-split F-1 resolved (manifest links the equivalence evidence and review state), F-2
resolved (both-order proof on current bytes), F-3 resolved apart from F1 above (expiry date).

## Briefing violations

None. The spec has no apply-order requirement between two packages; order independence was judged against the machine
evidence only.
