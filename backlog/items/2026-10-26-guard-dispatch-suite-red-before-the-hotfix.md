---
schema: pipeline.backlog-item.v1
id: pipeline.guard-dispatch-suite-red-before-the-hotfix
type: defect
owner: pipeline
status: open
created: 2026-10-26
priority: P1
release: 0.7.0
source: "D165 fix wave, 2026-10-26: baseline measurement of hooks/guard-dispatch.test.mjs in fresh clones"
done_when: manual
---

# The guard-dispatch suite is red at the pre-hotfix commit too

`node plugins/pipeline-core/hooks/guard-dispatch.test.mjs`, run in a fresh `git clone --shared` of `10e8573b5` (the
commit before the D163 hotfix) from inside a live Elephant session, exits 1 with these cases failing: GD12, GD13,
GD14, GD22, GD23, GD27, GD33, GD34, GD36, GD38, GD39, GD41, GD42, GD43, GD58 to GD65. Run at the D165 HEAD the set
differs slightly (it adds GD35, GD37 and GD40 and drops GD58, GD63 to GD65), so the hotfix did not introduce the
failures, and some of them move with the state of the surrounding repository.

Two readings are open and the measurement does not separate them: the cases depend on live state of the outer
checkout (queue rows, the 70 legacy dispatch records, environment variables of the running session), or they are
genuinely red. The first reading is itself a defect: a unit suite that changes with the machine it runs on is not a
gate. Full Verify runs it in a clean environment, so the first thing to measure is the result there.

Wanted: run the suite under Verify's environment on the unchanged HEAD and record which cases stay red; then either
isolate the environment-bound cases (fixtures instead of the outer queue) or fix the real failures. GD27 is the case
that pins `routeSha("a\nb\n")` and blocks PF-63 part B.

Measured with `scratch/wave3/gd-baseline.mjs` (untracked one-off; promote it to `scripts/` if it is reused).
