# Critic record — S3 state-writer split plan

- Review object (enumerated): `bd7841a4c`, `7cba02c0f` (`specs/sprint-alfred-epic/design/s3-state-split-plan.md`)
- Spec: `specs/sprint-alfred-epic/plans/0.7-candidate-implementation-plan-2026-10-03.md` row S3+R5 (line 202);
  `specs/sprint-alfred-epic/design/s2-guard-split-plan.md`
- Route: requested `claude-opus-5-5` at max; effective `claude-opus-5-5`, effort marker max (observed in the
  dispatch's own runtime prompt); route pre-check passed
- Lane: functional-equivalent-read-only; OS isolation not asserted
- Budget: checkpoint at call 20 of 24 after Phase B was complete
- **Verdict: FAIL** (on F1)

## Findings

### F1 — major: the stage row's refs (MP-2, PF-1, PF-20…24, PF-3…6, R5) and IC-3 are not traced

The plan quotes the row without its refs and IC columns (:17-20). §5.3 and Q11 call the "simplified design-course
ledger with `revise`" unspecified, although `specs/sprint-alfred-epic/design/fable-review-2026-10-04/process-findings.md`
defines it (item 6 at :18; PF-3…6 at :61-95; R5 at :295: resumable ledger authoring → advisor → readiness → package,
idempotent stages, resume, `revise`, authoring id leaving continuity). §5.1 limits the authority record to not
re-deriving `checkPoGateAuthority` and calls `continuity.authority.{prd,spec}` "not the same object", while the findings
define ONE record (`planPath/planSha256/specPath/specSha256/profile`) referenced from submission, approval, briefing and
continuity, dropping `planApproved` (item 5 at :17; PF-20…24 at :203-245; "One source per fact" :284-285). PF-21…24
(profile stored five times, duplicated package digest and proof facts, derived booleans, audit records in live state)
have no place in §5. Package 2 is scoped narrower than its stage, and Q11 asks the PO to specify what is specified.
Spec-ref: candidate plan :202 (refs and IC columns); the S2 plan maps its own refs to landing places.

### F2 — minor: the layering rule contradicts the module table

§2.1 (:196) requires imports from a strictly lower layer, which the reused extractor enforces
(`harness/scripts/guard-split-map.mjs:850`, doc :28-29); §2.2 lists same-layer edges (`primitives`→`constants` L0
:204; `push-proof`→`store` L2 :212; `plan-verb-support`→`store` L2 :214; `po-authority-common`→`plan-profile` L3
:220). Where real, S3-01's `graph` fails on the plan's own map and re-layering shifts the waves. Spec-ref: plan §2.1;
S2 plan :150, :181-182.

## Deliberately not flagged (summary)

Every other clause of the row covered; only the plan file touched; b2 self-path rewrite sound; no dynamic import /
`createRequire` / `__dirname`; protected-status table matches the PB baseline and TP table; inferred items have owning
slices; no secrets or host paths; English. Measured claims spot-checked and correct: 72 entries in
`PIPELINE_STATE_COMMANDS` plus five unlisted verbs = 77; adoption verbs in `CONTINUITY_SUBCOMMANDS`; 26
`import.meta` lines (4 + 21 + 1); extractor anchors.

## Trajectory — inconsistent (one claim)

The matrix's observed cell (:499) claims one test file run, §5.5 (:437) says no test was run in this dispatch; both
added in `7cba02c0f`, no artifact backs the run in the plan.

## Not verified

29-export list, importer counts, `run` routes 10004-10073 and the `deps` seam, catalogue and sanctioned-args anchors,
cluster ranges and sizes, `guardrails/quality-gates.md` and `guardrails/global.md` text.

## Briefing violations

None.
