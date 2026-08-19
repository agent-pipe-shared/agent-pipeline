---
schema: pipeline.backlog-item.v1
id: pipeline.gmw-kernel-closure-test-does-not-model-spawn-edges
type: defect
owner: pipeline
status: closed
created: 2026-08-17
source: "Critic round-2 review of NVA-A7FIX-2 (4736d913..ad512e80), finding F-B, 2026-08-17."
---

# The GMW kernel transitive-closure test only walks static imports, not process-spawn edges

## Description

`plugins/pipeline-core/lib/guard-maintenance-window-kernel-closure.test.mjs`
(GMWKC01) walks only relative `import`/`export … from` specifiers to prove
`NEVER_LIFTABLE_KERNEL_PATHS` is transitively closed under first-party
imports. `plugins/pipeline-core/lib/project-onboarding-v3.mjs` — itself a
kernel path — reaches three further first-party scripts through the process
boundary instead of an import:

```
project-onboarding-v3.mjs:160  ONBOARDING_SCRIPT = .../scripts/project-onboarding-v3.mjs
project-onboarding-v3.mjs:165  PO_AUTHORITY_REBIND_WRITER = .../scripts/pipeline-state.mjs
project-onboarding-v3.mjs:166  PO_PROFILE_REPAIR_WRITER = .../scripts/po-gate-profile-repair.mjs
```

spawned via `fs.spawnSync(process.execPath, [writer, …])` at lines 1434,
1501, 1571. None of the three appear in `NEVER_LIFTABLE_KERNEL_PATHS`.

The test's own header claims it "closes the class of bug rather than one
instance of it" and "FAILS CLOSED on a shape it cannot classify," naming
dynamic `import(` as that shape — but a spawn edge is neither modeled nor
detected; it is simply invisible to the walk, not fail-closed against.

## Why this is minor, not major

Pre-existing in kind (not introduced by the diff that added the closure
test) — the same recursive-hole risk ADR-0058 Decision 3 already names in
general terms, just not caught by this specific mechanical check for this
specific edge type. No demonstrated path from this gap to actually
corrupting window verification: a GS-6-scoped window covering
`project-onboarding-v3.mjs` could, in principle, also reach one of these
three writer scripts via spawn without the closure test noticing — but no
live exploit or reachable-in-practice scenario has been constructed.

## Affected artifact

`plugins/pipeline-core/lib/guard-maintenance-window-kernel-closure.test.mjs`
(the walk itself); `plugins/pipeline-core/lib/project-onboarding-v3.mjs`
(the spawn edges it doesn't model).

## Proposal

Not designed here. Two directions worth weighing when this is picked up:

1. Extend the closure walk to also follow `spawnSync(process.execPath, [path, ...])`
   call shapes with a statically-resolvable first argument, the same way it
   already follows `import`/`export … from`.
2. Add the three spawned writer scripts to `NEVER_LIFTABLE_KERNEL_PATHS`
   directly, narrower and cheaper, but leaves the general spawn-edge blind
   spot in the walk itself for the next kernel path that spawns something.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** accepted, deferred to Sprint Alfred.
- **Rationale:** matches Alfred's scope ("mechanical governance, measurable
  rigor, and control integrity") precisely — extending a kernel
  transitive-closure check to a second edge type (process-spawn, alongside
  the existing static-import walk). The item's own "Why this is minor, not
  major" section already establishes no demonstrated live exploit path;
  confirmed not blocking current Nova/Phoenix delivery.
- **Assignment (if accepted):** next available Alfred slot.
- **Date:** 2026-08-17

## Closure, 2026-08-19 (verified live against current code, not against status text)

Confirmed resolved in code by an independent, code-first verification pass
(Workflow task wdyd7rk9g, 2026-08-19) run in response to a PO directive to
actively check every open backlog item against current code rather than
trusting frontmatter status. The item's own frontmatter/Triage text had not
been updated to reflect the landed fix; this closure catches that drift.

plugins/pipeline-core/lib/guard-maintenance-window-kernel-closure.test.mjs now contains a full spawn-edge scanner (SPAWN_EXEC_PATH_RE, SCRIPT_PATH_CONST_RE, spawnEdgeSpecifiers(), resolveScriptPathIdentifier()) that follows spawnSync(process.execPath, [...]) calls the same way it follows import/export...from, tracing identifiers back to fileURLToPath(new URL(...)) constants and failing closed (throwing) on any unclassifiable shape (lines 32-171 header + implementation). The three previously-missing writer scripts (scripts/pipeline-state.mjs, scripts/po-gate-profile-repair.mjs, scripts/project-onboarding-v3.mjs) are now present in NEVER_LIFTABLE_KERNEL_PATHS (plugins/pipeline-core/lib/guard-maintenance-window.mjs lines 217, 218, 221). Ran the test directly: 'PASS GMWKC01 ... PASS GMWKC02 ... 2 passed, 0 failed'. Fixed by commits ad512e80 ('fix(guards): close the GMW kernel's transitive-closure gap with a test') and 73b7abbe ('fix(guard-maintenance-window): close spawn-edge and static-import gaps in the kernel-closure array').
