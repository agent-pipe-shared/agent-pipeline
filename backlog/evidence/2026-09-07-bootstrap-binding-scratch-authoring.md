# Bootstrap-binding scratch authoring evidence

Date: 2026-09-07  
Dispatch: `NVA-B-GREENFIELD-SCRATCH-1`

At `bootstrap-binding-required`, the lifecycle guard now admits only `Edit`
and `Write` targets physically contained in the repository's `scratch/`
directory. The existing exact generated PRD/spec admission remains separate.
`NotebookEdit` and Bash commands remain on the normal not-ready path.

The contained pre-fix proof expected scratch authoring to be admitted and was
red because the guard returned `GUARD-LIFECYCLE-NOT-READY`:

- `node --test scratch/NVA-B-GREENFIELD-SCRATCH-1/bootstrap-binding-scratch-red.test.mjs`
  exited 1; machine-written evidence:
  `scratch/NVA-B-GREENFIELD-SCRATCH-1/bootstrap-binding-scratch-red.json`.

The complete lifecycle suite passed after the narrow admission. Its new test
covers contained relative and absolute scratch paths; rejects a symlink escape,
traversal, outside-root path, scratch sibling, State authority path,
resume-hint near miss, NotebookEdit, and immutable design input; and retains
the intake, restart, generated PRD/spec, capability-unavailable, and GL09
contracts:

- `node --test plugins/pipeline-core/hooks/guard-lifecycle-ready.test.mjs`
  exited 0; machine-written evidence:
  `scratch/NVA-B-GREENFIELD-SCRATCH-1/guard-lifecycle-ready-green.json`.
- `node --test harness/scripts/check-consumer-safe-paths.test.mjs` exited 0;
  machine-written evidence:
  `scratch/NVA-B-GREENFIELD-SCRATCH-1/consumer-safe-paths.json`.

The lifecycle test injects the typed `bootstrap-binding-required` readiness
result into the actual guard entrypoint. It is not live capability evidence.
The separate `guard-apply-patch` wrapper continues to translate each patch
path into that `Edit` guard shape; it has no dependency seam for injecting this
lifecycle state, so no live wrapper claim is made here.

The current sanctioned read contract admits `sha256sum` only when every named
path is project-contained. It does not admit a `pipeline-state.mjs inspect`
argv: `sanctionedPipelineStateArgs()` accepts its defined recovery/plan forms,
not `inspect`. That reported prerequisite remains a separate read-contract
mismatch; this narrow write-admission slice does not broaden diagnostics.

## Physical-containment continuation

`NVA-B-GREENFIELD-SCRATCH-CONTAINMENT-1` corrected the earlier lexical
description. During `bootstrap-binding-required`, only an Edit/Write target
whose nearest existing ancestor resolves within the physical `scratch/` root
is admitted. A real generated-checkpoint native Codex regression demonstrated
that aliases from `scratch/` to `src/` and `.claude/` had otherwise allowed
pre-plan product and authority authoring. A symlinked scratch root, external
sibling alias, and dangling leaf alias are also denied. First creation of
`scratch/` and legitimate nested paths remain admitted at the intake and
restart lifecycle stages; bootstrap binding remains Edit/Write only.
Only an `ENOENT` inspection result is treated as first creation. Injected
`EACCES` and `EIO` failures at the scratch root and a missing-path ancestor
remain lifecycle-denied.

Machine evidence is the expected native red capture
`scratch/NVA-B-GREENFIELD-SCRATCH-CONTAINMENT-1/generated-native-scratch-alias-red.txt`,
the green direct suites
`scratch/NVA-B-GREENFIELD-SCRATCH-CONTAINMENT-1/guard-lifecycle-and-native-green.txt`,
and the green consumer check
`scratch/NVA-B-GREENFIELD-SCRATCH-CONTAINMENT-1/consumer-safe-paths.txt`.
The fixture uses the sanctioned empty-root producer and a documented simulated
host runtime-readback observation; it does not claim live provider or PO
approval evidence.
