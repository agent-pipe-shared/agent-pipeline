---
schema: pipeline.backlog-item.v1
id: pipeline.scratch-must-remain-writable-across-lifecycle-states
type: requirement
owner: pipeline
status: open
created: 2026-09-27
sprint: alfred
done_when: manual
source: "PO ruling, 2026-09-27: 'scratch muss immer gehen'; live Alfred design/draft write probe and guard-lifecycle-ready.test.mjs session-capability-unavailable fixture."
---

# Keep contained scratch writes available in every lifecycle state

The PO requires the repository's own `scratch/` to remain available for notes,
reports and correction preparation even when the pipeline blocks protected
work. A write in Alfred's current design/draft state succeeded, but
`guard-lifecycle-ready.test.mjs` currently expects a contained scratch write
to be refused under `session-capability-unavailable`. Existing fixes cover
individual intake and restart states; they do not establish an all-state
contract.

A 2026-09-28 Codex preparation probe confirmed a second guard boundary:
`apply_patch` targeting an inert tracked-source snapshot under
`scratch/0.7-integration-tree/` was refused by `guard-testpath` with
`PB-GUARD-HOOKS` and `TP-4`. The copied hook implementation and copied
`hooks.json` were matched as protected authority surfaces by their path
suffix, despite not being the installed plugin or productive repository
surface. No canonical source file was edited. Thus lifecycle-only scratch
admission does not fulfill the PO's all-scratch requirement.

## Required behavior

- Admit ordinary `Write` and `Edit` of physically contained `scratch/` files in
  every supported lifecycle and readiness state, including error and recovery
  states. Provide a safe way to create a missing nested scratch directory.
- Preserve symlink/outside-root containment and protection of machine state.
  Do not treat this requirement as permission for arbitrary shell mutation.
- If the host itself denies an admitted scratch write, report that boundary
  honestly and provide a usable host-level route; no silent success claim.
- Apply the contained-scratch distinction consistently across lifecycle,
  testpath and gate-strength guards. Preparing inert code/test/hook copies
  inside physical scratch does not edit the active authority surface and must
  not require a PO signature merely because a path suffix resembles that
  surface. Resolve physical containment and active-root identity first;
  symlinks or traversal into productive source or the live plugin remain
  protected.

## Acceptance

A state-sweep fixture covers every supported readiness status and the ordinary
scratch write/create lanes. Live readback confirms a blocked session can save
a report without a PO override. Near-miss paths escaping `scratch/` remain
refused. Reconcile the skill's scratch promise with the guard and tests.
Include inert nested hook/test/config snapshots and their ordinary edits in
the live guard union sweep, plus symlink and traversal attempts into each real
protected surface. The same distinction must hold for Write/Edit/apply_patch
and admitted shell preparation lanes; no opaque-script workaround is accepted
as the fix.

## Triage

- **Decision:** pending
- **Assignment:** Alfred release preparation
- **Date:** 2026-09-27

## Integration preparation (2026-09-28)

The lifecycle B slice and shared physical-boundary proposal now compose in
`scratch/0.7-virtual-integration.patch` against `40059ebc`, together with
onboarding, architecture, process identity, Codex readiness and design-package
corrections. The aggregate has 45 proposed files, passes exact Git dry
application, and all 39 proposed JavaScript files pass syntax checks. Relative
dependencies resolve. The metadata binds original and proposed file hashes.

Composition exposed preparation defects which were corrected before source
integration: imports before hook shebangs, malformed worker-test addition
prefixes, out-of-order contexts and one handover indentation mismatch. The
aggregate additionally adds the physical scratch helper to the protected kernel
and registers its test in Verify. Seven previously passing physical-boundary
fixtures still bind the unchanged helper/test bytes; these syntax and patch
checks do not prove the all-state live guard union.

Only flat inert scratch revisions and patch bytes were written. Previously
denied nested hook copies and canonical guard files remain unchanged. Productive
integration, official kernel closure, integrated tests and the required live
state/guard sweep are pending; this item remains open.

### Remaining content-only scratch denial

During Spec-marker preparation, writing an inert `.txt` fixture under physical
`scratch/` was refused with `GUARD-BOOTSTRAP-ACKNOWLEDGEMENT-WRITER-ONLY` because
its source text contained a literal human acknowledgement marker. The attempted
patch was not applied. The test was safely prepared through the existing
sanctioned acknowledgement fixture writer instead.

Source confirms `isBootstrapAcknowledgementMarkerMutation` searches payload
strings, and the lifecycle guard calls it before its scratch lane without a
target-path distinction. The current prepared physical-boundary union does not
yet reconcile this earlier content-only branch. Prepare and test a distinction
between inert contained scratch source and actual acknowledgement authority,
retaining physical alias/live-root exclusions and writer-only authority on real
PRDs. This is an additional reproduced boundary case; earlier seven containment
fixtures do not prove it is repaired.
