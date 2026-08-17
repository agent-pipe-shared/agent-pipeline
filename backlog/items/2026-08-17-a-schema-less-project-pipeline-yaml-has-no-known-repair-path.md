---
schema: pipeline.backlog-item.v1
id: pipeline.a-schema-less-project-pipeline-yaml-has-no-known-repair-path
type: defect
owner: pipeline
status: open
created: 2026-08-17
source: "Relayed by the PO 2026-08-17 from a live D:\\Dev\\HA (native Windows Claude) session's handover, which attributed this to runner-profile-migration-v3.mjs's generator omitting a schema field. That specific root-cause attribution is checked against source and appears WRONG -- filed here with the corrected, narrower, still-unresolved finding."
---

# A `project/pipeline.yaml` missing the required `schema: pipeline.manifest.v0` field has no CLI repair path, and the actual generator responsible is not yet identified

## Description

`scripts/pipeline-manifest.schema.json:7` requires a `schema` field
(enum `pipeline.manifest.v0`) on the manifest root. `loadManifest()`
(`plugins/pipeline-core/lib/manifest.mjs:726`) validates against this schema
and only returns `status: "ok"` when it passes.
`planProjectOnboardingManifestRepairV4` (`lib/project-onboarding-v3.mjs:2789-2800`)
throws the diagnostic `canonical_manifest_requires_owner_repair` when
`loadManifest()` doesn't return `ok` — this diagnostic and the schema
requirement are both real and directly confirmed.

**The originally-relayed root-cause attribution does not hold up.** The
report blamed `runner-profile-migration-v3.mjs`'s manifest generator for
omitting the `schema:` field. On inspection: that script never writes
`project/pipeline.yaml` (`NEUTRAL_MANIFEST`) at all — its write targets are
`.claude/*`/`.codex/*` only. Every manifest-generating code path actually
traced DOES correctly include `schema: pipeline.manifest.v0`:
`freshManifestBytes()` (`lib/project-onboarding-v3.mjs:1018-1023`) and
`runner-profile-migration-v3.mjs`'s own `LEGACY_V3_RUNTIME_SEEDS[".claude/pipeline.yaml"]`
(`:97`). The one schema-less literal that does exist in that file
(`LEGACY_CLASSIFIER_BASELINES[".claude/pipeline.yaml"]`, `:78`) is used only
for baseline comparison/classification, never as a write seed for
`project/pipeline.yaml`.

**Net result: the observed dead-end (a schema-less `project/pipeline.yaml`
that no CLI command can repair) is real, but WHICH code path actually
produced that specific file's content is not yet established.** Candidates
not yet ruled out: an older pipeline-core version's generator (before the
`schema:` requirement existed or before it was added to whatever wrote this
file), a hand-edited file, or a generator path not covered by this
investigation's search scope.

## Triggering situation

A live D:\Dev\HA bootstrap session's `project/pipeline.yaml` (sha256
`3f7dad85f1...`, 1459 bytes, containing `language`/`source`/... but no
`schema:` field) permanently fails manifest validation; `plan-manifest-repair`
reports `status: "noop"` (identical sha256 before/after) because whatever
generated this content considers it already correct, while the validator
permanently rejects it. `project-authority-migration.mjs recover` also
reports `status: "none"` — from its own view there is nothing to repair.
The session's resolved pipeline-core version was noted as
`0.5.5+codex.20260817072703.d2e2fc4c` — worth checking separately whether
that local marketplace copy is simply stale relative to current source,
since `d2e2fc4c` is an early commit from this same AFK block's own work
(superseded by later commits the same night); if so, a resync of that
consumer's vendored copy may be a much cheaper first diagnostic step than
hunting for a phantom generator bug in current source.

## Affected artifact

`plugins/pipeline-core/lib/project-onboarding-v3.mjs` (`planProjectOnboardingManifestRepairV4`,
`freshManifestBytes`), `plugins/pipeline-core/lib/manifest.mjs` (`loadManifest`),
`scripts/pipeline-manifest.schema.json`. The actual offending generator is
NOT YET IDENTIFIED — see above.

## Proposal

Not designed here, and NOT ready for a fix dispatch — the root cause is not
located yet, so any fix proposal (including the original report's "add
`schema:` to the generator") risks patching a script that was never the
actual source of the bad file, leaving the real bug live. Next step should
be investigation, not implementation:
1. First, cheaply rule out version staleness: confirm whether the D:\Dev\HA
   session's local marketplace copy predates the fix (if any) that's
   actually relevant, by checking its pinned commit against current Nova
   HEAD.
2. If still reproducible on current source: find every code path capable of
   writing `project/pipeline.yaml` (not just the ones already checked) and
   determine which one, under what prior version or condition, could have
   produced schema-less content.
3. Separately, regardless of root cause: consider whether `loadManifest()`
   should detect a schema-less-but-otherwise-recognizable manifest and
   offer a normalizing repair (with a visible diagnostic, never silent)
   rather than leaving `plan-manifest-repair` as a permanent, silent no-op
   dead end — this would make the system self-healing for this failure
   class regardless of how the schema-less file originated.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** accepted as a real, reproducible dead-end symptom;
  EXPLICITLY NOT accepted as ready-to-fix, since the relayed root-cause
  attribution was checked against source and does not hold — the actual
  generator is unidentified. Do not dispatch a fix based on the original
  report's proposal (patching `runner-profile-migration-v3.mjs`) without
  first re-confirming it actually touches the affected file, which this
  investigation found it does not.
- **Rationale:** blindly applying an externally-relayed "fix" that targets
  the wrong script would look like progress while leaving the real
  consumer-blocking bug live.
- **Assignment:** queued as an investigation task (not a fix dispatch) for
  a future session; check version-staleness first (cheapest diagnostic),
  then locate the actual generator if still reproducible on current
  source.
- **Date:** 2026-08-17
