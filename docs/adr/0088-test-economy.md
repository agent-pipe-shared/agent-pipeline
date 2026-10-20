# ADR-0088 — Test economy: a fast gate, a fresh full run, and a test surface that shrinks with the product

## Status

Accepted, 2026-10-20, by PO decision D69 (`specs/sprint-alfred-epic/plans/po-decisions-2026-10-18.md`).
The rules apply from this decision on; the rebuild of this repository's Verify (tiers, consolidation)
is its own package after 0.7.0.

## Date

2026-10-20

## Context

This repository's Full Verify runs 1057 steps over 1049 suite files with about 13 000 statically
counted cases (more with loop-generated ones), and takes about five hours. Because a full run is so
expensive, it was not run for weeks. The measurement run of `c1771bc98`
(`specs/sprint-alfred-epic/evidence/full-verify-c1771bc98/`) then found 138 red steps, about 100 of
them real test failures that had accumulated unmeasured, many already present at the import
commit `d02409a8a`. Part of the correction work repairs tests of routes an ADR had already retired
(ADR-0085). Every finding has been pinned by its own test, and pins outlive the code they pin.
Consuming projects have one calibrated `verify` command and no notion of tiers.

## Decision

1. **Fast gate and full run.** A fast gate runs at every commit and push boundary, with a target
   under 10 minutes; the full run runs nightly and before every candidate.
2. **Freshness.** A candidate is cut only with a full run that is at most N days or M commits old;
   the project sets N and M. A red full run is never older than the candidate it is cited for.
3. **Quarantine, not silence.** A case that cannot be green yet is quarantined with an owner item
   and an expiry. Its assertions stay unchanged and it is counted and reported as quarantined, not
   as passed. A permanently red case and a deleted case are both refused. The typed pending cases
   of D66 are the first instance.
4. **Retire on supersede.** When an ADR retires a route, the tests of that route leave in the same
   change, each with the ADR as its reason; a test that still pins surviving behaviour is retargeted
   instead.
5. **Ratchet.** The count of red or quarantined cases never grows from one full run to the next.
6. **Runtime budget, not a case count** (this repository): fast gate under 10 minutes, full run
   under 60 minutes on WSL, a per-suite runtime budget whose overrun is a finding. Consolidation
   starts with the most expensive and the superseded cases, measured.
7. **Consuming projects.** The calibration gains optional `verify.quick` and `verify.full`. The
   Pipeline runs `quick` at commit and push boundaries and `full` before candidate and release, under
   a project-set freshness rule. Quarantine and ratchet are offered as tools, not imposed. A project
   without the new keys keeps today's behaviour (one command for every boundary).

## Consequences

The 0.7.0 candidate applies rules 3 and 4 now: the D66 cases are quarantined, and the ADR-0085
tests of correction cluster K2 are retired or retargeted with their reason. Rules 1, 2, 5 and 6 and
the consumer calibration need Verify and calibration changes; they are built after 0.7.0, together
with the open runtime items (strictly sequential Verify, runtime concentrated in ten suites, Full
Verify on Windows taking hours). Until then the full run stays the one gate, and its age is stated
whenever a result is cited.

## Rejected alternatives

- A fixed case-count target (for example halving): easy to state, says little about value or runtime.
- Rules only, without a size or runtime target: the surface does not shrink.
- Rebuilding the whole test organisation inside the 0.7.0 candidate: several extra days, and test
  surgery during a red correction reads as making red disappear.
- Mandatory tiers in every consuming project: friction at onboarding and for existing projects.

## Review

At the post-0.7.0 Verify rebuild, and when the first consuming project calibrates `verify.quick`.
