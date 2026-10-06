# Critic record — S3 plan second fix verification (S3PLAN6, S3PLAN7)

- Review object (enumerated): `68f27ba17` (S3PLAN6), `b86567500` (S3PLAN7)
- Spec: `specs/sprint-alfred-epic/design/fable-review-2026-10-04/process-findings.md`,
  `specs/sprint-alfred-epic/plans/0.7-candidate-implementation-plan-2026-10-03.md` (lines 192-216); registry:
  s3-plan-delta F-A..F-D
- Route: requested `claude-opus-5-5` at max; effective `claude-opus-5-5` (observed in the dispatch's own runtime
  prompt; effort max); route pre-check passed
- Lane: functional-equivalent-read-only; OS isolation not asserted; notes persistence refused by
  `guard-lifecycle-ready` (see backlog item `2026-10-06-critic-scratch-notes-write-is-refused-again.md`)
- Budget: checkpoint at call 20 of 24
- **Verdict: pass/fail withheld — partial review** (not reached: `guardrails/quality-gates.md`,
  `guardrails/global.md`, evidence-file contents, plan §2.2 table, §2.2a summary, §3.3 waves, §5.3, §5.8, §6). **Two
  major findings.**

## Findings

### F1 — major: the `planApproved` drop is scheduled inside the both-shapes release

§5.7 (`68f27ba17`, plan :533) has P2-A stop writing `planSubmission.profile` and `planApproved` in the same signed
package that first ships the both-shape readers, and the PF-23 row (`b86567500`, :497) lets the flag-writer change ship
"together with or after P2-D". Migration step 6 (`process-findings.md:297-298`) and the plan's own unchanged §5.1
(:488) drop `planApproved` only **after** the one release in which readers accept both shapes. Built as written, a
previous-release guard (rollback, second install, other runner copy) reading a migrated flagless state fails
`planApproved !== false` in `sanctionedDesignCourseArgs` (`guard-lifecycle-ready.mjs:5533`) and is stranded in design.
Spec-ref: process-findings migration step 6; PF-23.

### F2 — major: the only pre-implementation Verify-command intake was removed with no replacement

After `b86567500`, `present-plan` is refused unless the Verify contract already holds and carries no intake;
`approve-plan` has no `--verify-command`; `set-phase implementation` becomes a replay or goes; `configure-verify`
requires an established implementing lifecycle (`pipeline-state.mjs:10308-10311`) and baseline-only twins
(`:10319-10321`); a draft-phase edit of `project/pipeline.json` is outside the exempt prefixes. A project whose Verify
command is missing or the seeded placeholder can then never reach `presented` — PF-1's defect class at presentation.
Today's refusal (`:10261`) names exactly the intake the plan deletes. Spec-ref: candidate plan :202 ("verify binding");
PF-15 (:182-185); PF-1 (:30, :47-52); target lifecycle :271-273.

**Elephant note:** the F-B text came from the S3PLAN7 briefing, where the Elephant stated the binding design ("no
`--verify-command` intake at `approve-plan`") without naming where the intake moves. The defect is the Elephant's
briefing, not the dispatch's execution.

### Candidates not taken through the gate

C-a: §2.2a (:288-291) states layer equality ("1 + the highest layer among its imports") but cascades only importers "at
or below the new layer". C-b: whether the §2.2 layer column and §3.3 waves satisfy the restated rule (e.g.
`verify-binding` L3 imports `store`, a W3 slice). C-c: §5.5 cites a placeholder log path instead of the tracked copy.

## Deliberately not flagged (summary)

Single-`graph`-run lift claim holds (`guard-split-map.mjs:850, 857, 872`); bound arithmetic; "a cycle is never lifted";
line cites `:194-208`, `:48-52`, `:10302`, guard reads `:460`, `:1234`, `:5533`; §5.7 cross-references; PF-21 inline
copy drop with the both-shape readers is consistent with step 6; evidence copies present, ADR-0063 placement, no host
paths; no `scratch/` citation left; trailers clean; English.

## Trajectory — consistent (for every claim examined)

`no-scratch.log` reproduces at `b86567500`. Not verifiable: consumer-safe-paths exit code, analysis-file line cites,
copy fidelity.

## Briefing violations

None.
