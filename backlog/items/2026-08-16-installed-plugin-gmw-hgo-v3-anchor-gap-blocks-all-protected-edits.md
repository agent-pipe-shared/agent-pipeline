---
schema: pipeline.backlog-item.v1
id: pipeline.installed-plugin-gmw-hgo-v3-anchor-gap-blocks-all-protected-edits
type: defect
owner: pipeline
status: closed
created: 2026-08-16
source: "Found 2026-08-16 overnight: a real, correctly-signed, correctly-scoped GMW window (TP-1..TP-12, ~3.7h TTL) was installed, but every single edit it should have covered was refused by the live guard hooks. Traced to source, not guessed."
due: 2026-08-20
closed_at: 2026-08-18
closure_repository: nova
closure_evidence: "confirmed directly against ~/agent-pipeline-local-marketplace/plugins/pipeline-core/lib/{guard-maintenance-window,human-guard-override}.mjs (NVA-GMWFIX-2 / NVA-HGOFIX-1)"
closure_commit: "8e8dd393fd7eba110f85ecf5ce69be5f41f6bd6b"
---

# The installed plugin's GMW window and HGO override ceremonies cannot clear ANY protected-path edit in this repository, because their trust-anchor read is unpatched for schema v3

## Description

This repository's `project/critical-human-proof.json` was migrated to schema v3
(`trustAnchors`, a SET, committed empty = "any well-formed Ed25519 key may sign" —
ADR-0056's 2026-08-16 correction). Earlier the same night, this session ported v3
support into the REPO-LOCAL copies of `lib/critical-human-proof-policy.mjs`,
`lib/critical-action-authorization.mjs`, `lib/guard-maintenance-window.mjs`, and
`lib/human-guard-override.mjs` (commits `6a548cf9`, `3f466662`, `11783228`,
`c88b2125`).

**That porting only helps SCRIPTS, not HOOKS, and nobody noticed the split until a
real ceremony was attempted end-to-end.** `harness/scripts/verify.mjs` and
`plugins/pipeline-core/scripts/*.mjs` are invoked directly (`node
plugins/pipeline-core/scripts/pipeline-state.mjs ...`), so their imports resolve to
THIS repository's own `lib/` — already patched, which is why tonight's
`feature-package-reconcile` ceremony (a script) worked correctly against a real PO
signature. PreToolUse HOOKS (`hooks/guard-testpath.mjs`,
`hooks/guard-gate-strength.mjs`, etc.) instead run from the INSTALLED plugin
distribution root (`~/agent-pipeline-local-marketplace/plugins/pipeline-core/` on
this machine), whose OWN copies of `lib/guard-maintenance-window.mjs` (line ~638)
and `lib/human-guard-override.mjs` (line ~2210) still gate on the pre-v3 singular
`policy.trustAnchor`, confirmed by direct read:

```
lib/guard-maintenance-window.mjs:638
  if (!policy.ok || policy.trustAnchor === null) return { status: "absent" };
lib/human-guard-override.mjs:2210-2213
  if (!policy.ok || policy.trustAnchor === null) {
    fail("HGO-TRUST-ANCHOR-MISSING", ...);
  }
```

Against a v3-empty document, `policy.trustAnchor` is always `null`. So:

- `currentGuardMaintenanceWindow`/`windowCoversRule`, called from inside
  `guard-testpath.mjs`/`guard-gate-strength.mjs`, always return `"absent"`/
  `covered: false` — **even when a real, validly-installed, unexpired,
  correctly-scoped window exists on disk.** Verified live: `guard-maintenance-window.mjs
  status --repo-root <repo>` (a script, repo-local code) correctly reports
  `"active"` for the exact same window a hook invocation (installed code) refuses
  to see.
- The older HGO `authorize-by-signature` capability-arming route has the identical
  gap, so it is not a working fallback either.

**Net effect: no signature-based mechanism can clear ANY `TP-*`/`GS-*` protected-path
edit in this repository right now**, no matter how many times the PO signs. This
was discovered only because a real overnight ceremony (window install + attempted
consumption) was carried through end-to-end; no test suite exercises the
installed-vs-repo-local split, because none of them run against the real installed
plugin root.

## Triggering situation

2026-08-16 overnight: PO signed and installed a GMW window scoped to `TP-1`..`TP-12`
specifically so the Elephant could fix `OT09`/`guard-testpath.test.mjs` (TP-2)/
`guard-gate-strength.test.mjs` (TP-6)/register two suites into `verify.mjs` (TP-3)
autonomously. All four edits were refused. Traced as above; none were forced through.

## Affected artifact

`~/agent-pipeline-local-marketplace/plugins/pipeline-core/lib/guard-maintenance-window.mjs`,
`~/agent-pipeline-local-marketplace/plugins/pipeline-core/lib/human-guard-override.mjs`
(installed plugin distribution, NOT this repository's tracked files — this item is
about the DISTRIBUTION being behind the source it was built from tonight, a
version-skew defect the same class as the ADR-0061 skew already tracked in
`backlog/items/2026-08-07-push-release-flow-unusable-for-third-party-adopters.md`).

## Proposal

Port the exact same v3 `trustAnchors`-SET fix already applied to this repository's
`lib/guard-maintenance-window.mjs` (commits `6a548cf9`, `3f466662`, `11783228`) and
`lib/human-guard-override.mjs` (`6a548cf9`) into the installed plugin distribution,
then have the PO refresh/re-point this machine's installation at the patched build —
this is the local-development plugin update flow the PO already anticipated needing
("Du bekommst aber gleich vorab die passende version dann lokal") for
`critical-human-proof-policy.mjs`/`critical-action-authorization.mjs`, just not yet
extended to these two sibling files.

Once patched, re-verify end-to-end (not just unit tests): install a real GMW window
against this repository and confirm a hook actually honors it — the exact gap unit
tests missed tonight, since `lib/guard-maintenance-window.test.mjs` and its siblings
all construct their own fixtures rather than exercising the real installed-plugin
hook path.

Until fixed, `OT09`/`guard-testpath.test.mjs` (TP-2)/`guard-gate-strength.test.mjs`
(TP-6)/the two-suite `verify.mjs` registration (TP-3) stay parked, pre-diagnosed with
exact replacement text in `docs/state.md`'s 2026-08-16 checkpoint — zero
re-investigation needed once this unblocks.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** closed (superseded, resolved elsewhere)
- **Rationale:** confirmed 2026-08-18 by directly reading the CURRENT installed marketplace distribution: `~/agent-pipeline-local-marketplace/plugins/pipeline-core/lib/guard-maintenance-window.mjs` now checks `Array.isArray(policy.trustAnchors) && policy.trustAnchors.length > 0` (no remaining `policy.trustAnchor === null` singular-only path), and `lib/human-guard-override.mjs` carries a v3-array-first read with a v2-singular fallback, its own comment naming the exact fix: "NVA-HGOFIX-1: this used to read the legacy SINGULAR `policy.trustAnchor` field only". The Nova branch (`origin/feat/sprint-nova-codex-v046`) authored and shipped this fix under `NVA-GMWFIX-2`/`NVA-HGOFIX-1`; this machine's installed distribution has since been refreshed from that work. The gap this item reported no longer exists.
- **Assignment (if accepted):** n/a — not accepted, already resolved by Nova's own fix.
- **Date:** 2026-08-18
