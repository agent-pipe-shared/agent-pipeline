# Agy imported-copy verification and triage

2026-09-28. Scope: two assigned backlog items and their evidence only. No installer,
global configuration, CLI installation, running session, state, staging, reconcile,
commit or HEAD mutation. English backlog content retained under ADR-0011.

## Independent physical observations

Command: `node backlog/evidence/agy-imported-snapshot-20260928-observe.mjs`.
Actual terminal `5a8883`, exit 0. The script physically read only named Pipeline
registries/import metadata/manifests/hook metadata and the two fixture lock files,
and wrote its own sanitized backlog evidence. It did not execute any hooks or CLI.

`agy-imported-snapshot-20260928-readback.json` SHA256:
`68e51fe4ff8aa88fa205d1244874ff84867f03775d39e50d111e9c7e6036d6a3`.

- Managed manifest `3850fede7d3431c98aa1f233637aaf056be31be1afe5b78171dcae52e61c86ae`:
  `0.6.2+antigravity.20260913103423.c1e799c`.
- Marketplace manifest `e2f88941ec8b6a64241cde23fe01c875b95a7c8c423fa667306daf699e60f795`:
  `0.7.0+antigravity.20260927174722.15c963ef`.
- Registry `c5b548994449e1a9d431776b7d015d7233869eb1c28baa36f9cbac261f02e666`:
  names the marketplace path.
- Import metadata `2cb885fb1961720417da749c6bbac4ddeb372fabcfc162a842dd1f51a300cb1d`:
  Pipeline imported 2026-09-15T20:18:50Z from `antigravity`, skills/agents/hooks.
- Global hook metadata `9977826576d4d4eef6d905d7274865ac063ad797ae2c94f11ceda63dab6f690b`:
  two absolute marketplace start/pretool commands. Creation origin unverified.
- Fixture stale-version lock `2c269356176b70d7d944d53b828c8e09891f75f299d07249da5cc8783c7c665e`:
  locked=true, version=0.6.2. Current mtime 2026-09-27T19:27:27.928Z;
  mtime is not creation-time or writer provenance.
- Dummy lock `65f0a18098dab291a8c97693fdf9526e2479b86a8e55ea53fe29e4b8b0f577fa`:
  version=0.7.0 without `locked`. Different shape does not prove manual origin.
- Fixture workspace registry is absent. Cross-runner settings were not inspected.

## Source conclusions

- `plugins/pipeline-core/install-agy.mjs:86–150,205–220` updates selected
  registry entries while preserving other entries, and offers an explicitly
  labelled optional global target. Its later optional settings/attestation do
  not discover or retire imported managed copies. Workspace-local is already
  the default. The duplicate physical source is outside this refresh surface.
- `plugins/pipeline-core/scripts/installed-plugin-attestation-host.mjs:298–313`
  compares loaded root against exact matching registry entries; it returns null
  unless exactly one root matches. It has no managed-copy enumeration.
- `plugins/pipeline-core/scripts/pipeline-start-preflight.mjs:490–551` skips
  mismatched-version locks as unavailable freshness evidence. That refusal is
  fail-closed, but loses the distinct mismatch diagnostic. Keep the refusal while
  improving the explanation. `:1080–1082` uses the registry-only observer.
- `plugins/pipeline-core/hooks/antigravity-start-hint.mjs:103–118` derives its
  own root version and writes `{locked:true,version}`. Current canonical writer
  semantics are verified; this does not independently attest the historic writer.
  Its earlier governed/Git checks avoid arming ungoverned/uninitialized roots.

No actual Agy loader/precedence execution was performed. The optional direct
read of the old snapshot hook source was refused by the installed read-scope
guard (`GUARD-READ-SCOPE-OUTSIDE-ROOT`); no equivalent read or bypass was attempted
after refusal. Existing manifest/import/hook metadata projections were admitted
through the bounded diagnostic script. The readback and current source findings
are sufficient for the narrower triage; exact historic hook code remains outside
this independently verified evidence.

## Disposition

Per explicit PO decision, the 2026-09-27 stale-run item is `closed` as superseded
with a body link and rationale; no unsupported superseded status/frontmatter was
introduced. The 2026-09-28 item remains `open`, carries the historical acceptance
requirement, and owns the root-cause investigation/diagnostic/refresh work. The
historical run remains unavailable as 0.7 acceptance; this closure is not a fix.

The original handover's detailed proposed S1–S6, topology observer, host lifecycle
remediation, tests and docs plan is retained, with explicit pending status. Claims
about every historical session, exact executed path, manual authorship, full-global
activation, contradictory CLI precedence and cross-runner settings are qualified
or removed. CLI changelog/help/validate claims remain handover references awaiting
controlled reproduction. Tests must use injected config paths or isolated accounts,
not a reassigned HOME or the PO's real configuration. No actual mutation spike ran.

Root owns ledger reconciliation and commits after the open ceremony. No live
acceptance, formal Critic/Reader gate, new installer behaviour or resolved root
cause is claimed by this triage.
