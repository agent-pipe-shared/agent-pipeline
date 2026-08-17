---
schema: pipeline.backlog-item.v1
id: pipeline.mixed-authority-migration-requires-a-vendored-plugin-copy-marketplace-installs-never-have
type: defect
owner: pipeline
status: open
created: 2026-08-17
source: "Relayed by the PO 2026-08-17 from a live D:\\Dev\\Web\\Toolbox (Windows Claude) session's handover, live-blocking. Independently verified line-for-line against this repository's current source before filing."
---

# `loadedPackageEvidence()` requires a vendored, byte-identical local plugin copy, which a marketplace-installed consumer project never has — permanently dead-ends the "mixed" project-authority migration path

## Description

`loadedPackageEvidence(destination)` (`plugins/pipeline-core/lib/project-authority.mjs:98-116`)
requires `<destination>/plugins/pipeline-core/` to exist as a physical copy
of the plugin package, with a file-inventory digest byte-identical to the
currently-loaded module's own root (`MODULE_PLUGIN_ROOT`, line 100-107). If
that directory doesn't exist at all (line 105), the function throws and
`inspectProjectAuthorityProvenance()` (`:119-127`) returns `status:
"unavailable"`.

Both call sites of `inspectProjectAuthorityProvenance()` convert a
non-`"ready"` result to `provenance: undefined` before calling
`planProjectAuthorityMigration()`:
- `plugins/pipeline-core/scripts/project-authority-migration.mjs:75-79`
  (`plan`) and `:82-86` (`apply`) — the CLI's own `plan`/`apply` subcommands.
- `plugins/pipeline-core/lib/project-onboarding-v3.mjs:3463-3467` — the V4
  `inspect` lifecycle path, when the project's authority status is `mixed`.

`planProjectAuthorityMigration()`'s own handling for `current.status ===
"mixed"` (`project-authority.mjs:605-606`) unconditionally refuses with
`status: "provenance-rejected"`, `code: "PA-PROVENANCE-REQUIRED"` whenever
`provenance === undefined`. Confirmed directly, not inferred: this is the
ONLY handler for `mixed` authority status — there is no alternate path.

**A project that references this plugin through the documented,
standard Claude Code marketplace mechanism (`enabledPlugins`/
`extraKnownMarketplaces` in `.claude/settings.json`) never has, and
structurally cannot have, a vendored `plugins/pipeline-core/` copy inside
its own repository tree — the plugin is loaded from the marketplace
cache, never copied into the consumer project.** For any such project,
`loadedPackageEvidence()` therefore always throws, provenance is always
`unavailable`, and the `mixed`-authority migration path is permanently
unreachable — not a misconfiguration, a structural gap in the standard
installation path itself.

Consequence traced end to end in `project-onboarding-v3.mjs`'s V4 `inspect`
path: when `migration.status !== "ready"` (as it always is here), the
`mixed`/`PA-LEGACY-STATE-RETIREMENT-REQUIRED` branch at `:3468-3495` is
skipped, and the code falls through to a generic `status: "invalid"` result
with `nextAction: null` in the common case (no session-cleanup-recovery or
privatization plan applicable) — a dead end with no actionable next step.

## Triggering situation

A live D:\Dev\Web\Toolbox (Windows, Claude runner) session ran
`apply-partial-authority` successfully (writes the neutral MANIFEST,
`project/pipeline.yaml`, and `.claude/pipeline.yaml`, both new). The
project's real, months-maintained legacy CALIBRATION
(`.claude/pipeline.json`) still exists; the new schema wants that
information under the neutral `project/pipeline.json` instead, which
`apply-partial-authority` never creates. `initialize-runtime` then failed:
`invalid`, `"neutral authority has no neutral calibration while legacy
calibration remains"`. The system's own suggested repair,
`project-authority-migration.mjs`, hit exactly this provenance dead end.
Session paused; last observed V4 status `invalid`
(`project_authority_invalid`, `nextAction: null`).

## Affected artifact

`plugins/pipeline-core/lib/project-authority.mjs` (`loadedPackageEvidence`,
`inspectProjectAuthorityProvenance`, `planProjectAuthorityMigration`'s
`mixed` branch), `plugins/pipeline-core/scripts/project-authority-migration.mjs`,
`plugins/pipeline-core/lib/project-onboarding-v3.mjs` (V4 `inspect`'s
`mixed`-authority handling, `:3463-3495`).

## Related, not the same bug

Thematically the same underlying assumption — "a governed checkout can
prove its plugin-code provenance by comparing byte-identical local vendored
bytes" — recurs in `human-guard-override.mjs`'s
`externalLocalMarketplaceObservation()`
(`backlog/items/2026-08-17-this-hosts-local-marketplace-copy-is-not-symlinked-to-source.md`,
a different function/file, requires a symlink resolving back to the
checkout instead of a vendored copy, also fails for a legitimate non-symlink
deployment shape). Both are provenance-verification gaps against a
legitimate marketplace-standard installation shape; a shared design pass
might address both, but they are independent code paths and neither fix
should be inferred to also fix the other.

## Proposal

Not designed here — this is a trust-boundary/security-relevant design
question, not a missing allowlist shape (unlike NVA-LCGUARD's gaps). Two
directions worth weighing, per the reporting session's own assessment:
1. A genuine alternate provenance-proof path for a marketplace-standard
   consumer (no vendored copy expected; prove trust some other way — e.g.
   against the marketplace registry's own attested manifest, or drop the
   byte-identity requirement for this specific adoption case in favor of a
   weaker but still meaningful check).
2. Have `apply-partial-authority` create the neutral calibration
   (`project/pipeline.json`) directly at the same time it creates the
   neutral manifest, so the `mixed`-authority migration path is never
   needed for this specific transition in the first place.
Whichever direction, the provenance check's fail-closed default for every
OTHER case it protects must not regress.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** accepted — confirmed line-for-line against current source,
  end to end through both call sites and the V4 dead-end fallthrough. Real,
  structural, live-blocking for the standard marketplace install path, not
  a Toolbox-specific misconfiguration.
- **Rationale:** `loadedPackageEvidence`/`inspectProjectAuthorityProvenance`
  gate a project-authority migration (a trust-relevant operation); weakening
  or redesigning that gate needs explicit design input, not a same-session
  patch, matching this session's own standing treatment of the sibling
  `human-guard-override.mjs` marketplace-provenance gap.
- **Assignment:** queued for a future design/PO-decision session; not
  agent-dispatchable as-is. Toolbox session left paused, `project/` in a
  recoverable `invalid` state, nothing written or bypassed.
- **Date:** 2026-08-17
