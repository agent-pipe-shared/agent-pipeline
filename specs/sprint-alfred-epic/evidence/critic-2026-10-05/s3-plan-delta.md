# Critic record — S3 split plan revision (fix verification of s3-plan F1, F2, trajectory)

- Review object (enumerated): `f7199d5ec` (`specs/sprint-alfred-epic/design/s3-state-split-plan.md`)
- Spec: `specs/sprint-alfred-epic/plans/0.7-candidate-implementation-plan-2026-10-03.md` (stage table, row S3+R5),
  `specs/sprint-alfred-epic/design/fable-review-2026-10-04/process-findings.md`,
  `specs/sprint-alfred-epic/design/s2-guard-split-plan.md`; registry: s3-plan F1, F2, trajectory
- Route: requested `claude-opus-5-5` at max; effective `claude-opus-5-5` (observed in the dispatch's own runtime
  prompt; effort not observed); route pre-check passed
- Lane: functional-equivalent-read-only; OS isolation not asserted
- Budget: checkpoint at call 20 of 24; notes persisted in the Critic's own scratch directory
- **Verdict: pass/fail withheld — partial review** (not reached: `guardrails/quality-gates.md`, `guardrails/global.md`,
  IC-n definition in the candidate plan, `s2-guard-split-plan.md` citations, `pipeline-state.mjs:9867-9993` (edge 7),
  `guard-split-map.mjs:28-29`, plan text outside the diff hunks). Four minor findings; nothing major or blocking.

## Findings (all minor)

### F-A — §5.7 calls the guard repoint P2-D independent although P2-A removes the state fields the guard reads

P2-A stops writing `planSubmission.profile` and `planApproved` (PF-21, PF-23 rows) and `migrate-state` rewrites old
states on first write, while the protected guard still reads them until P2-D lands; P2-D must precede P2-A or ship with
it. Spec-ref: process-findings.md:215-219, :229-235, :297-298.

### F-B — §5.2 binds the Verify contract in two places

The new paragraph binds it once at `present-plan`; the touch-point list still says `approve-plan` absorbs the branch and
needs `--verify-command` intake. The P2-B test dispatch would get two incompatible targets. Spec-ref: PF-15
(process-findings.md:182-185, :48-50, :271-273).

### F-C — the §2.2a leftover-edge rule does not cover chains or mutual pairs

Moving every L4 importer up one layer leaves a chain X→Y→Z as a same-layer edge at L5, and a mutual pair X↔Y becomes an
upward edge that `guard-split-map.mjs:850` reports; only a merge fixes that, offered for edge 4 only. The claim "safe for
every L4 importer / repeated until no same-layer edge is left" is too strong. Spec-ref: registry s3-plan F2;
`harness/scripts/guard-split-map.mjs:850`.

### F-D — the revision rests on ignored scratch files and an unlocated report

§2.2a cites line numbers of `scratch/S3PLAN/analyze2.out.txt`; §5.5 and the matrix rest on
`scratch/S3PLAN3/consumer-safe-paths.log`; "forced follow-ups are listed in the S3PLAN3 report" has no path, owner or
due date. Spec-ref: `templates/prompts/agent-obligations.md:117-120`; ADR-0063.

## Deliberately not flagged (summary)

Stage row quoted verbatim; every process-findings citation checked (three small offsets only: `:194-207` vs table end
`:208`, PF-1 `:52` vs `:48-52`, unchanged "S3-74 last" row); every R5 finding has a landing place in §5.8; §5.7 migration
order matches findings steps 4–6 and 8; all 36 module import lists re-checked by hand, strictly downward, layer sums and
wave sizes consistent; dropped candidate edges 1–4 confirmed absent in code; edges 5 and 6 confirmed (`:3499`, `:9737`);
trailers clean, folding of three dispatches under one trailer disclosed in the body; docs-only, no tests, secrets, host
paths or dependencies; English.

## Trajectory

Consistency script: consistent (exit 0; 37 rows, 110 imports, 0 mismatches; matches the hand re-check; the log does not
record which plan version it checked). The §5.5 consumer-safe-paths re-run claim: not verifiable (log not supplied).

## Registry status

s3-plan F1 (PF/R refs traced): resolved apart from F-A/F-B. s3-plan F2 (layering): resolved apart from F-C. Trajectory
item: consistent for the consistency check, not verifiable for §5.5 (F-D).

## Briefing violations

None. The plan header points to the prior Critic record; the Critic did not open it.
