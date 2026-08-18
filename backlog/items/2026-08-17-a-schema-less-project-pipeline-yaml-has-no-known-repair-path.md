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

**UPDATE — the "no repair path" half is now conclusively root-caused; the
"which generator" half is now moot for fix design.** Traced the full repair
chain end to end:

- `replaceClaudeTarget()` (`plugins/pipeline-core/lib/runtime-projection-v3.mjs:377-429`)
  is the byte-preserving renderer that produces the "after" projection
  `planRunnerProfileMigrationV3` compares against the on-disk file. Its owned
  spans are enumerated exhaustively by `yamlOwnedSpans()` (`:333-341`):
  human-facing language, optional `session`, `modelRouting` (required),
  optional `runnerRoutes`, optional `criticExport`. **`schema:` is not in
  this list — it is always "unowned" content**, preserved byte-for-byte by
  the `beforeUnowned !== afterUnowned` invariant check (`:410`) whether
  present, absent, or malformed.
- `planRunnerProfileMigrationV3`'s noop classification
  (`publicTarget()`, `:530-539`) is a plain digest comparison of before vs.
  this rendered after. For a schema-less file, the renderer's "after" is
  BYTE-IDENTICAL to "before" (since it never touches `schema:` either way) —
  so `changed: false`, `status: "noop"` is the CORRECT output of this
  mechanism, not a bug in the comparison itself. The mechanism simply has no
  concept of "add a missing key I don't own."
- `project-authority.mjs`'s `changedTargets()` (`:321-327`) then copies this
  legacy file into `project/pipeline.yaml` byte-for-byte with no validation
  (`after: source = image(root, target.legacy)`).
- `loadManifest()` then permanently rejects the result for the missing
  `schema:` field, and `planProjectOnboardingManifestRepairV4` throws
  `canonical_manifest_requires_owner_repair` — with no path back through
  `plan-manifest-repair` (reports `noop`) or
  `project-authority-migration.mjs recover` (reports `none`), because
  neither tool's model includes "seed a required key the byte-preserving
  renderer was never told to own."

This means **any** legacy `.claude/pipeline.yaml` missing `schema:` — however
it came to be missing it, whatever wrote it, whatever version — is
permanently unrepairable by the existing tooling, by construction, not by
accident. The original "which generator produced this specific file"
question no longer gates a fix: the fix targets the repair chain's structural
blind spot, not a specific writer.

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

### 0.6.0 release-bar confirmation (2026-08-18)

Re-checked during the Nova 0.6.0 release triage sweep: the decision above is
already specific and bounded (version-staleness check first, then generator
location, then consider a self-healing `loadManifest()` repair) and names no
future sprint, so per the release bar it stays a same-release dispatch
target rather than a close or a sprint deferral. Not attempted here — the
investigation needs either an out-of-session artifact (the D:\Dev\HA
marketplace pin) or code changes to `manifest.mjs`/`project-onboarding-v3.mjs`
that need test coverage to trust. No change to the recorded decision.

### Investigation/Implementation, 2026-08-18 (wave 2, dispatch NVA-W2-1)

**Finding: the Proposal's step 3 fix is already implemented, tested, and
committed on this branch — landed in a commit made AFTER this item's own
"0.6.0 release-bar confirmation" note above, which was never updated to
record it.** No new production code was needed or written by this dispatch;
this section documents the discovery and re-verifies it, per the "re-verify
an inherited 'still open' claim" rule (`CLAUDE.md` Hard rules).

- **Commit `e4d2a036`** ("fix(manifest): self-heal a schema-less-but-otherwise-valid
  project manifest", authored 2026-08-18T14:31:39+02:00) is an ancestor of
  this dispatch's base HEAD `7eca44ca` — confirmed by reading the checked-out
  file content directly (the code is present) and via `git log -- plugins/pipeline-core/lib/manifest.mjs`.
  It postdates commit `29ac4508` (2026-08-18T10:21:54+02:00, the "0.6.0
  release-bar confirmation" text above) by roughly 4 hours: the confirmation's
  "not attempted here" was accurate at the moment it was written, then went
  stale a few hours later without the item being revisited.
- **What the commit does, verified by reading the current source:**
  - `plugins/pipeline-core/lib/manifest.mjs:698-723` — `detectSchemaLessRepair()`
    (private helper): returns `{ available: true, kind: "missing-schema-field",
    normalizedManifest, message }` only when the manifest is a plain object
    with no own `schema` key AND `{ schema: "pipeline.manifest.v0", ...manifest }`
    validates with zero errors (schema + semantics). Returns `null` for every
    other case, including "has a schema key already" and "still has an
    unrelated defect after adding schema" — matches the Proposal's "never
    silently" requirement.
  - `manifest.mjs:744-782` — `validateManifest()` now accepts a `selfHeal`
    option (default `false`, so every existing caller's behavior is
    byte-for-byte unchanged). On any invalid manifest it always attempts
    `detectSchemaLessRepair()` and attaches the result as `.repair` on the
    returned object regardless of `selfHeal` — so a caller that never opts in
    still *sees* a repair is available instead of a bare "invalid" dead end.
    Only `selfHeal: true` flips `status` to `"ok"`, using the in-memory
    normalized manifest, and always appends the repair message to `warnings`
    (never a silent accept).
  - `manifest.mjs:798-847` — `loadManifest()` threads the same `selfHeal`
    option through to `validateManifest()`.
  - `plugins/pipeline-core/lib/project-onboarding-v3.mjs:2861-2887` —
    `planProjectOnboardingManifestRepairV4` now branches on
    `canonicalManifest.repair?.available`: when true it emits the NEW
    diagnostic `canonical_manifest_schema_missing_repairable` with an
    actionable remediation string naming `selfHeal: true` and the owning
    authority workflow, instead of falling into the old generic
    `canonical_manifest_requires_owner_repair` dead end (which is still used,
    correctly, for every other absent/invalid case).
  - Test coverage in `plugins/pipeline-core/lib/project-onboarding-v3.test.mjs:4837-4893`
    (three tests, already registered in `harness/scripts/verify.mjs` since
    they live in an existing suite file, per the file's own inline comment at
    `:4833-4836` explaining why no new test file was created): (1) the
    positive `validateManifest` repair-detect + selfHeal path, including the
    "never mutates the input object" assertion, (2) the negative "a second,
    unrelated defect still blocks repair" case, (3) an end-to-end test that
    reproduces the exact backlog scenario — takes `freshManifestBytes()` (the
    real generator's own output), strips `schema: pipeline.manifest.v0\n`
    from it (this is explicitly commented as producing "the same class of
    file the backlog item's traced repair chain produces"), writes it to
    `project/pipeline.yaml`, and confirms `loadManifest()` surfaces
    `.repair.available === true`, `loadManifest(..., { selfHeal: true })`
    heals it to `status: "ok"`, and
    `planProjectOnboardingManifestRepairV4` now reports the new diagnostic
    code end to end.
- **Independently re-verified rather than trusted from the commit message:**
  - `git merge-base`/direct file inspection: `e4d2a036` present at this
    dispatch's HEAD `7eca44ca` — confirmed (its `manifest.mjs`/
    `project-onboarding-v3.mjs` code is on disk after the self-heal checkout,
    before any edit made by this dispatch).
  - The commit's version-staleness claim ("pinned commit `d2e2fc4c` is 271
    commits and a day behind current HEAD"): `d2e2fc4c` exists
    (`fix(po-human-approval): make outside() separator-aware on win32`,
    2026-08-17T09:22:16+02:00 — one day before `e4d2a036`, as claimed).
    `git rev-list --count d2e2fc4c..7eca44ca` returns 329 from this
    dispatch's later HEAD (not 271) — expected, not a discrepancy: more
    commits landed between `e4d2a036`'s authoring time and this dispatch's
    base commit; the underlying claim (hundreds of commits of staleness) is
    confirmed either way.
  - Searched the rest of `backlog/` for any other item referencing
    `detectSchemaLessRepair` / `canonical_manifest_schema_missing_repairable`
    / this item's own filename stem — none found; this fix was not
    double-filed or done under a different item's dispatch.
  - Ran `node --test plugins/pipeline-core/lib/project-onboarding-v3.test.mjs`
    from this dispatch's checkout: **127 passed, 0 failed**, including the
    three tests named above (exit reported via the node test runner's own
    summary, not reformulated).
- **What this dispatch did NOT do, and why:** did not re-implement the fix
  (already present and tested — a second implementation would be redundant,
  duplicate work against the exact same code); did not touch `manifest.mjs`
  or `project-onboarding-v3.mjs` (nothing to change); did not change this
  item's `status:` frontmatter or add a Closure section (out of this
  dispatch's DoD — that decision belongs to a future Elephant/PO session,
  which should treat the fix above as already shipped when re-triaging this
  item, not as still-open work).
- **Open question for a future session:** confirm whether `e4d2a036` carries
  a `Dispatch:` trailer identifying which prior dispatch produced it — the
  commit message body has no such trailer, which is a minor process-hygiene
  gap (dispatch attribution), not a functional one; not investigated further
  here as it is outside this item's own scope.
