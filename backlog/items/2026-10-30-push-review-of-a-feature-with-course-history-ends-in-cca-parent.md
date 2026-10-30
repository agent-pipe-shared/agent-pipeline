---
schema: pipeline.backlog-item.v1
id: pipeline.push-review-of-a-feature-with-course-history-ends-in-cca-parent
type: defect
owner: pipeline
status: open
created: 2026-10-30
sprint: alfred
priority: P0
release: 0.7.0
source: "Consumer report PF-102 follow-up relayed by the PO 2026-10-30 (installed candidate 0.7.0+claude.20261030091213.ca4e1c4)"
done_when: manual
---

# A push review of a feature with course history ends in CCA-PARENT with no route

## Evidence (consumer report)

- Call: `critic-dispatch-preflight.mjs --root <root> --base <merge-base with the push target> --candidate HEAD --spec
  specs/<feature>/spec.md --evidence <verify evidence, mode critic>`; no `--delta-request`, `--prior-critic` or
  `--correction-input-bindings` (an exact full range review). The base is what the push-init remedy names.
- Refused `CCA-PARENT`, `repair.route: none`.
- Registered lineage: round 1 (candidate `2a28268e`, 0 of 3 correction commits), round 2 (`7f9d6be1`, 3 of 3).
  Round 3 passed but is not registered as lineage. Commits follow it.
- `inspect-course-takeover` was not run: it requires a `--request` file whose shape the consumer could not find.
- Three refusals that did not explain themselves: `CDP-INPUT` (does not say `--root` is missing),
  `CDP-EVIDENCE-SCHEMA` (does not say security evidence is not admitted there), `CDP-EVIDENCE-MODE` / `CDI-VERIFY`
  (does not say a Verify evidence of mode critic is required; the push-init remedy does not say it either).

## Source reading (2026-10-30, branch head c7508bf6c)

`deriveRegisteredCriticCourseSource` (`lib/critic-course-admission.mjs` line 174) refuses `CCA-PARENT` whenever the
feature has registered history and the base is not the last registered round's candidate. The push-init remedy
names the merge base, so a push review of any feature that already has a course always lands here, and the refusal
names no route.

## Wanted

1. The `CCA-PARENT` refusal names the last registered round, its candidate and the expected base, and a repair that
   is proven to admit: the route for a passed but unregistered round (register its lineage, or retire it by takeover
   and rerun as a delta from the last registered round), and the delta route from the last registered candidate.
2. The push-init remedy and the preflight agree: push-init names the base the preflight will accept for a feature
   with course history.
3. If the only admissible route is blocked by the correction-commit budget, the refusal says so and names the PO
   decision; it never ends with route none.
4. The three refusals above name what is missing; `inspect-course-takeover --help` shows the `--request` shape.

## Done when

An end-to-end fixture with the consumer's lineage shape (two registered rounds, a passed unregistered third round,
later commits) follows the named repair from the first refusal to an admitted Critic dispatch, or to a typed PO
decision when the budget blocks it.
