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

### Prepared marker-quotation correction (2026-09-28)

The additional source proposal skips the payload-only acknowledgement refusal
only when the target satisfies the existing shared physical scratch predicate.
It does not return early from the guard: bootstrap receipt, cross-root,
protected-path and lifecycle checks still apply. Real PRDs and authority paths,
symlink/hardlink aliases, traversal and active plugin roots remain writer-only.
This is a preparation fix; the installed guard has not changed.

Three new cases are included in the proposed regular guard test file. Those
cases and the existing direct-PRD refusal case pass against exact proposed
bytes: native Write/Edit and translated marker flags in scratch across six
readiness outcomes; real authority, aliases and traversal; an active plugin
under scratch; and normal ready-state PRD protection. Terminal/hash evidence is
`scratch/scratch-marker-quotation-evidence.json`. The aggregate remains 55 files
with 47 passing syntax checks and successful Git dry application.

This supersedes the unprepared payload-only branch above. Full guard-union,
mixed apply-patch adapter, subagent bootstrap and installed Codex sweeps remain
pending; no universal live scratch guarantee or release stamp is claimed.

### Additional shell-output boundary (2026-09-28)

The supported read-only `pipeline-state.mjs inspect --root <this repo> --runner
codex` succeeds. Attempting to save its output with a shell `>` redirect to the
flat contained `scratch/codex-autonomous-preparation-state-2026-09-28.json`
was refused before execution: `GUARD-REDIRECT-UNAPPROVED`, empty retryActions,
and override planner `HGO-EXTERNAL-PROJECT-BOUNDARY` / external operator required.
No override, alternate implementation of that denied action or signature was
attempted. The existing read result remains available; no snapshot was written.

This is a separate shell grammar boundary, not a failure of admitted native
Write/Edit. Any future contained output-capture route needs explicit physical
target checking and command admission; blanket shell redirection would not be
a justified fix. The PO's scratch guarantee remains incomplete for this shape.

### Implementation confirmation: inert sanctioned-writer snapshot

The installed Codex guard also refused a native `apply_patch` targeting
`scratch/0.7-reenrollment-retirement-fix-20260928/runtime/plugins/pipeline-core/scripts/pipeline-state.mjs`
with `PB-SANCTIONED-WRITER`. Request digest:
`ead0a37c6d04ae02d8fb63e2e3961860e602b8080862fa4f8011df553d9ef0ee`;
action digest:
`a4d3c37584446f387207bbdaaf4f5cb91f36e8ad90de714f5297299c9be78a9c`.
The physically inert copy was not changed. No alternate writer or human
override was consumed. This confirms the existing item rather than creating
a duplicate defect.

The integrated public helper already distinguishes physical Scratch from
active roots. The held guard successor passes its root into that helper; a
further exact proposal also supplies the executing hook's plugin root when
the helper is loaded from a different public tree. This retains protection
for an active plugin installed beneath Scratch. Preparation is bound in
`scratch/0.7-scratch-guard-context-preparation-20260928/manifest.json`:
syntax and inverse preservation pass, but protected Source delivery and a
live native guard regression remain pending. Installing a recovery build
does not establish the all-state guarantee.

### Further opaque Scratch preparation refusal (2026-09-29)

A worker's shell generator for its contained proposed test postimage was
refused before execution with `GUARD-DEVPLAN-SHELL`,
`DWP-SOURCE-PHYSICAL` and `opaque-interpreter-code`. Request digest:
`e6920583a55fe3fc01f1f000a681545270787e868a521d41546dbbed86a7b395a`;
action digest:
`1150fa47ce30be262e6fd2fb787a3ed0a42e7da6114ba63d64ff613332c2bd2e`.
The denied generator was abandoned; no alternate Scratch writer or override
was used. The worker's own canonical inspection subsequently returned ready.
A separately authorized native Source test amendment was admitted, with a
different target and effect; it is not evidence that the Scratch action works.

The nine protected guard/writer/Verify deliveries now exist in Source after
two actual PO signatures. This new observation still describes the loaded
recovery build, not an installed successor qualification. Keep the item open
until the new candidate's physical Scratch and host-boundary sweeps establish
the required supported preparation lanes.
