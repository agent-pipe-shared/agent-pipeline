---
schema: pipeline.backlog-item.v1
id: pipeline.authority-decision-apply-defaults-to-codex
type: defect
owner: pipeline
status: closed
closed_at: 2026-08-11
closure_repository: self
closure_commit: e5a6a9b2bffc691be0610275c14a5c5b82036047
closure_evidence: specs/sprint-nova-epic/evidence/backlog/2026-08-11-pareto-triage-report.md
created: 2026-08-08
due: 2026-08-22
source: "Found while checking the approval layer for runner neutrality on 2026-08-08, after the PO named that layer as a target for the next candidate. The residue is documented in the source itself."
---

# The authority decision-apply path still resolves the runner as Codex

## What is there

`plugins/pipeline-core/scripts/pipeline-state.mjs:4433` —
`runPoAuthorityRebindApply` takes a `runner` option, and its own comment records
that one caller does not supply it:

```js
// Left undefined for the po-authority-decision-apply caller, which passes
// no runner: inspectV4 below then falls through to inspectProjectOnboardingV3's
// own "codex" default, preserving that path's prior behavior unchanged.
runner,
```

So the rebind path resolves the invoking runner properly — explicit `--runner`,
validated, with an environment fallback (`resolvePoRebindRunner`, `:4244`) — and
the decision-apply path does not. It inspects as `codex` for every runner.

## Why it is filed although it is deliberate

The comment is honest and the choice was defensible when it was made: it says
"preserving that path's prior behavior unchanged", which is the correct
conservative move inside a fix scoped to the rebind path. The item that fixed that
path (`2026-08-05-pipeline-state-rebind-codex-default-runner.md`) is `closed`, and
correctly so — it did what it claimed.

What was never filed is the residue. A documented deliberate gap with no item is
indistinguishable from an undocumented accidental one six weeks later, and this
one sits on the authority surface a human is sent to when an approval no longer
validates — i.e. exactly when things are already going wrong.

## What is not yet established

Whether the Codex default is *harmful* here or merely wrong. The rebind path
needed the runner because its recovery behaviour differed per runner (an App-Server
readback that a Claude session cannot satisfy). Whether the decision-apply path's
`inspectV4` reaches any runner-dependent behaviour has not been measured, and this
item must not assume it does.

That measurement is the first task, not the fix.

## Direction, not a design

1. **Measure whether the default is reachable and consequential** on the
   decision-apply path, for a Claude-rooted project. A negative result closes this
   item with a note, and that is a good outcome.
2. **If it is consequential**, give the caller the same explicit resolution the
   rebind path already has, rather than inventing a second mechanism.
3. **Either way, remove the silent fallthrough.** A parameter left `undefined` so
   that a default two layers down applies is the shape that made this invisible;
   an explicit pass of the resolved runner, or an explicit statement that this path
   is runner-independent, both survive the next reader.

## Related

- `2026-08-05-pipeline-state-rebind-codex-default-runner.md` — closed; this is the
  residue its scope deliberately left.
- `2026-08-08-runner-neutrality-must-hold-before-a-third-runner-lands.md` — the
  class this belongs to; another instance of an identity accepted at the edge and
  replaced by a default further in.
- `2026-08-08-kickoff-apply-action-drops-the-runner-the-plan-was-made-for.md` —
  the same shape on the onboarding surface.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
