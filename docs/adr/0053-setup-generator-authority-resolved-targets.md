# ADR-0053: `setup.mjs` writes to the resolved project-authority tier, not a hardcoded legacy path

> Agent-Pipeline · Sprint Nova · as of 2026-08-06

**Status:** accepted (generator fix), partially deferred (stale-mirror removal) · **Basis:** Dispatch AUTHORITY-GEN-07.

## Context

`plugins/pipeline-core/lib/project-authority.mjs` exports `resolveProjectAuthorityPaths()`
and the path constants `NEUTRAL_MANIFEST`/`NEUTRAL_CALIBRATION`
(`project/pipeline.yaml`/`project/pipeline.json`) and `LEGACY_MANIFEST`/
`LEGACY_CALIBRATION` (`.claude/pipeline.yaml`/`.claude/pipeline.json`). In this
repository the resolver reports `source: "neutral"` — the calibration/manifest
authority already lives under `project/`.

`setup.mjs`, however, hardcoded its compiled write targets at
`.claude/pipeline.json`/`.claude/pipeline.yaml` and never referenced the
resolver at all. The two tiers had drifted structurally as a result:
`gates.push.approval` (`standing-approved` vs `required`), `session.keep_awake`
(`false` vs `true`), the PO display label, a `pipelineUpdateChannel` present in
only one copy, and different model/effort routing for the same duties — the
last of which collides directly with the mandatory MP-05/MP-07 model
discipline, because reading the stale mirror yields a different routing
decision than the live authority declares. This drift already produced one
concrete misdiagnosis: a session read `.claude/pipeline.yaml`, saw
`approval: required`, and concluded a push gate was active that the live
`project/pipeline.yaml` (`standing-approved`) does not have.

**A second finding, established before any code change:** exhaustive
control-flow analysis of `run()` (traced against every early `return`) showed
that this repository's compile-and-write section had been **unreachable dead
code** since the `pipeline.user.v3` authority cutover. Once
`hasV3Source` is true, `run()` always exits from within the
`if (existingUserYamlRaw !== null)` block (`return toolchain.exitCode` is
unconditional there); everything below it, including the write section, can
never execute for a v3-authority project — which every project this compiler
serves now is (`v3MigrationRequiredMessage`). The top-level
`PIPELINE_JSON_PATH`/`PIPELINE_YAML_PATH` constants this ADR replaces were
referenced nowhere; the write section itself referenced `settingsJsonPath`,
`pipelineJsonPath`, `pipelineYamlPath` and `renderPipelineYamlFn` as bare,
undeclared identifiers (a `ReferenceError` had it ever run). `setup.test.mjs`
independently confirms this is by design, not oversight: its "unchanged
sentinel" tests assert that `.claude/settings.json`/`pipeline.json`/
`pipeline.yaml` remain byte-identical across every currently exercised `run()`
scenario, including successful v3 verification (`"setup performed no
writes"`). Real V3-authority writes are owned by the explicit migration tool
(`runner-profile-migration-v3.mjs`), not by this compiler.

**A third finding, from a repository-wide grep before any deletion:** dozens
of files beyond `setup.mjs` still hardcode `.claude/pipeline.json` and/or
`.claude/pipeline.yaml` as read targets, including `harness/scripts/verify.mjs`
(the protected Full Verify entry point), `harness/scripts/
check-claude-md-lines.mjs`, `harness/scripts/check-po-language-projection.mjs`,
`plugins/pipeline-core/scripts/check-routing-projections.mjs`,
`plugins/pipeline-core/scripts/toolchain-preflight.mjs`,
`plugins/pipeline-core/scripts/session-power.mjs`, several hooks
(`guard-devplan.mjs`, `guard-lifecycle-ready.mjs`, `codex-*-guard.mjs`) and
library modules (`critic-packet-governance.mjs`, `human-guard-override.mjs`,
`runtime-projection-v3.mjs`, `project-onboarding-v3.mjs`,
`runner-profile-migration-v3.mjs`). `setup.mjs` itself has two such readers,
independent of its write path: `migrateAgentsAdapter()` (the
`--migrate-agents-adapter` authority check) and the `--publish-po-profile`
flow, both of which `readFileSync(join(rootDir, ".claude", "pipeline.yaml"))`
directly rather than through the resolver.

**Remediation note (2026-08-06, Critic finding F2, dispatch
CRITIC-REMEDY-09):** an independent T1 Critic review established that the
resolver's `missing` status (`project-authority.mjs`, `readLayer()`/
`authority()`) is keyed off the *manifest* (`pipeline.yaml`) alone at both
tiers; it does not by itself distinguish a genuinely pristine project from a
project that already holds a legacy *calibration* (`.claude/pipeline.json`)
but never adopted the optional manifest (CLAUDE.md documents the manifest as
"optional, additive" -- a legacy consumer that skipped it is the expected
case, not an exotic one; reproduced with a fixture holding only
`.claude/pipeline.json` and `.claude/settings.json`). Decision 1's `missing`
mapping, read literally against `resolveProjectAuthorityPaths()`'s status
alone, would have seeded such a project at the neutral tier and orphaned its
live `.claude/pipeline.json` -- exactly the drift class this ADR's Context
above exists to prevent, and in direct tension with this ADR's own
Consequences claim that "a legacy-tier consumer project is never silently
migrated by running `setup.mjs`". `resolveCompiledRuntimeTargets()` now checks
directly for a present legacy calibration file before honoring a `missing`
status as pristine, keeping such a project on the legacy tier; a `missing`
status is treated as the neutral-seeding case from Decision 1 only when no
legacy calibration exists either, i.e. the project is genuinely pristine.
This keeps the Consequences claim above literally true rather than requiring
it to be corrected. Covered by a dedicated test in `setup.test.mjs`.

## Decision

1. **`setup.mjs` derives its compiled write targets from
   `resolveProjectAuthorityPaths()`** via a new exported
   `resolveCompiledRuntimeTargets(rootDir)`:
   - `status: "ready"` (neutral or legacy) is honored as-is. A legacy-tier
     project keeps its compiled files in `.claude/` — running setup never
     silently migrates an existing consumer to the neutral tier — and a
     neutral-tier project's compiled files land in `project/`.
   - `status: "missing"` (a **pristine** project with no authority manifest
     at either tier yet) is deliberately seeded at the **neutral** tier. This
     is the one genuine design judgement in this change: the runner-neutral
     tier is the documented direction of travel (ADR-0046), and no code path
     was found — in `setup.mjs` or in the resolver itself — that requires a
     brand-new project to start on the legacy tier. Covered by a dedicated
     test.
   - Any other resolver status (`unsafe`, `migration-required`, `mixed`,
     `invalid-root`, `invalid`) means the on-disk authority state is already
     ambiguous or broken. The generator does not attempt to repair that
     itself; it keeps the previously established **legacy** target rather
     than guessing which tier the operator intended. Covered by a `mixed`
     fixture test.
   - `.claude/settings.json` is unaffected — it is Claude Code's own
     settings surface, never project authority, and stays hardcoded.
2. The dead-code write section in `run()` is corrected in place (the three
   undeclared identifiers now resolve to `resolveCompiledRuntimeTargets()`
   output and `deps.renderPipelineYamlFn ?? renderPipelineYaml`, matching the
   `renderPipelineYamlFn` deps-override key `setup.test.mjs` already
   references) rather than deleted, since existing tests already encode the
   `deps.renderPipelineYamlFn` injection point as intentional and the fix
   does not change reachability — it remains unreachable under the current
   V3-cutover control flow, so no currently-passing test's behavior changes.
3. **This repository's own stale `.claude/pipeline.json`/`.claude/pipeline.yaml`
   mirrors are NOT removed by this change.** The briefed removal step
   required first confirming that nothing in the executable path reads them
   while the neutral tier is present. That confirmation failed: `setup.mjs`'s
   own `--migrate-agents-adapter` and `--publish-po-profile` readers, `Full
   Verify` itself (`harness/scripts/verify.mjs`), and roughly a dozen other
   scripts/hooks/libraries listed above all still read the legacy path
   directly. Deleting the two files today would break Full Verify and
   multiple guard/hook code paths in this very repository. Per the
   briefing's explicit instruction for this case, the removal is deferred
   and reported rather than performed.

## Consequences

**Positive:** a project whose authority resolves as neutral now gets its
neutral calibration/manifest pair actually maintained by the generator (once
this code path becomes reachable again, e.g. if a future change reintroduces
a legacy-authoring flow); a legacy-tier consumer project is never silently
migrated by running `setup.mjs`; the drift class described in Context
(gate/session/model-routing divergence between two write targets) cannot
recur for anything this generator produces, because there is exactly one
resolver-derived write target now instead of two independently maintained
ones.

**Negative / residual:** the repository-wide legacy-path hardcoding survives
this change untouched (dozens of files, listed above) — this ADR's scope was
the generator only (`plugins/pipeline-core/lib/project-authority.mjs` was
explicitly out of scope, and rewriting Full Verify or the guard/hook layer is
a separate, much larger, and separately-sequenced migration). Until that
migration lands, this repository's own `.claude/pipeline.json`/
`.claude/pipeline.yaml` remain unmaintained duplicates of the live
`project/*` authority, and the drift risk they pose (documented in Context)
persists for every consumer that still reads them directly instead of
through `resolveProjectAuthorityPaths()`.

## Rejected alternatives

- **Delete `.claude/pipeline.json`/`.claude/pipeline.yaml` anyway, since the
  generator no longer maintains them.** Rejected: confirmed by direct
  invocation that `Full Verify`'s manifest-gated phase steps
  (`harness/scripts/verify.mjs`) and multiple other scripts read them
  directly; deleting them would break the verify gate and several guards in
  this repository today, not just in a hypothetical consumer project.
- **Fix the `--migrate-agents-adapter`/`--publish-po-profile` readers in
  `setup.mjs` (and, by extension, the rest of the repository-wide readers) as
  part of this same change, to unblock the deletion.** Rejected as
  out-of-scope for this dispatch: the briefed allowlist covers `setup.mjs`'s
  write path, not its unrelated read paths, and the repository-wide surface
  (Full Verify plus roughly a dozen other files) is large enough to need its
  own sequenced task rather than being absorbed silently into a generator
  fix.
- **Leave the two now-unused top-level constants (`PIPELINE_JSON_PATH`,
  `PIPELINE_YAML_PATH`) in place as dead code, changing only the
  now-nonexistent write call sites.** Rejected: those constants were
  referenced nowhere in the file (confirmed by grep before editing); keeping
  them would have left a second, still-hardcoded, still-misleading pair of
  path literals sitting unused next to the fix this ADR makes.

## Follow-up

- **Repository-wide legacy-path migration** (much larger than this dispatch):
  every reader listed in Context's third finding — starting with
  `harness/scripts/verify.mjs` and `setup.mjs`'s own two readers — needs to
  be migrated to `resolveProjectAuthorityPaths()` before
  `.claude/pipeline.json`/`.claude/pipeline.yaml` can be safely deleted from
  this repository. This is a separate, sequenced task; it should be scoped
  and dispatched on its own, given the number of files involved.
- **Documentation repointing** (already known, separate task, explicitly
  out of scope here per the dispatch briefing): roughly fourteen normative
  documents still point agents at `.claude/pipeline.json` as *the*
  calibration path. That task is unaffected by this ADR and remains
  independently sequenced.
- Once both follow-ups land, the stale-mirror removal this ADR deferred can
  be completed as a small, low-risk final step.
