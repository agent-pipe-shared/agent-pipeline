---
schema: pipeline.backlog-item.v1
id: pipeline.marketplace-install-topology-unattested
type: defect
owner: pipeline
status: open
created: 2026-08-07
source: Critic finding F1, delta re-review of the F-A/F-C/F-D/F-B rework (specs/sprint-phoenix-epic/evidence/wp2wp3-parta-rework-2-delta-critic-review-412d33d.md); the residual of *how* Critic finding F2 (WP2-WP3-partA-rework-1) was resolved. Recorded via the WP2-WP3-partA-rework-3 dispatch.
---

# No origin/content integrity check runs for the non-git marketplace-install topology

## Description

Part A of the design
`specs/sprint-phoenix-epic/design/bootstrap-origin-allowlist-and-codex-wsl-freshness.md`
restores an origin/content attestation (allowlisted origin URL + no
uncommitted local drift) into the ordinary bootstrap readiness gate. Critic
finding F2 (`WP2-WP3-partA-rework-1`) found that the shipped attestation
failed permanently for every real install, because the observers it reuses
(`observeGit`/`observeCodexPublicCoreIdentity`/`observePublicCoreIdentity` in
`plugins/pipeline-core/lib/public-core-observation.mjs`) require a real git
checkout and reject unconditionally otherwise. The PO-confirmed fix gated the
attestation on `.git` presence at the self-application layout
(`pluginRootHasSelfApplicationGit(pluginRoot)`,
`plugins/pipeline-core/scripts/pipeline-start-preflight.mjs:204-206`; call
site `if (version && pluginRootHasSelfApplicationGit(pluginRoot))`, `:274`).

That fix is correct for the failure it addressed, and it leaves a residual
this item exists to track: **a real marketplace-installed plugin copy (e.g.
`~/.claude/plugins/cache/<marketplace>/pipeline-core/<version>`) has no `.git`
at all**, so the attestation there is skipped entirely — not attempted, not
failed — and `status` falls through unmodified to the pre-existing
version/`installedIdentity`/`installedVersion` decision that predates Part A.

Consequence: **in the topology every ordinary end-user install actually ships
to, no origin check and no content check runs at all.** A forked or locally
altered marketplace copy whose version string matches still passes readiness
undetected there — precisely the gap Part A was created to close, now closed
only for the self-application/dev-checkout topology.

This is a *distinct* subject from
`backlog/items/2026-08-07-self-application-integrity-check-absent.md`, which
tracks the original 0.5.2 merge-loss gap that Part A closes (that item is
`status: in_progress`, its design phase is DONE, and it is not rewritten or
repurposed by this one). The design document's three "this gap is tracked"
citations (§A.1 disclosed limitation 1, §A.5 case 2, §A.7) point here instead,
per Critic finding F1: before this item existed, those citations resolved to a
file that did not carry the claimed content, so the limitation the design
correctly discloses had no owner, no next step, and no tracking item anywhere
(QG-06's "documented instead of fixed").

## Triggering situation

Critic finding F1, delta re-review of commits `ac8bd06`/`4e1ac8a`/`627d053`/
`412d33d`
(`specs/sprint-phoenix-epic/evidence/wp2wp3-parta-rework-2-delta-critic-review-412d33d.md`),
against the `WP2-WP3-partA-rework-2` fix for the earlier finding F-A. Recorded
as a backlog item (not code-fixed) by dispatch `WP2-WP3-partA-rework-3`, whose
scope is design-document + backlog only, explicitly no code change.

## Affected artifact

`plugins/pipeline-core/scripts/pipeline-start-preflight.mjs` (the
`pluginRootHasSelfApplicationGit` gate at `:204-206` and its call site at
`:274`), `plugins/pipeline-core/lib/public-core-observation.mjs` (the
observers, which require a git checkout by construction), and
`specs/sprint-phoenix-epic/design/bootstrap-origin-allowlist-and-codex-wsl-freshness.md`
(§A.1 disclosed limitation 1, §A.5 case 2, §A.7's non-git exclusion entry),
which disclose this residual and cite this item.

## Proposal

**Owner: PO.** This needs its own scoping decision before any code is written
— explicitly not decided and not implemented by this item. Concrete next step:
the PO decides (a) whether the marketplace-install topology should get an
integrity check at all, or whether Part A's guarantee is deliberately scoped
to self-application/dev checkouts for good, and (b) if it should, whether that
gets its own design pass first — the same design-first → Critic-review →
implement sequence Part A itself received, given that any answer changes the
bootstrap readiness gate again. Candidate directions, disclosed here rather
than pre-selected:

1. A non-git content attestation for the installed copy: compare a content
   hash of the installed plugin subtree against a trusted expected value.
   `observePublicCoreIdentity` already produces a `contentSha256` for the git
   case (consumed at `pipeline-start-preflight.mjs:288`), but the non-git case
   has no trusted *expected* value to compare against — supplying one is a
   distribution-side change (a published/signed release manifest), not only a
   client-side one.
2. A remote-read check at bootstrap (resolve the expected identity from the
   allowlisted origin). This would close both this gap and the design's
   disclosed limitation 2 (an allowlisted origin checked out at an arbitrary
   *committed* history), but it introduces a network dependency in the
   bootstrap readiness path that Part A deliberately has none of — Part A
   performs no remote read at all, only local `rev-parse`/`remote
   get-url origin`/`status --porcelain`.
3. Accept the residual as an explicit, permanent scope boundary: the integrity
   guarantee is claimed only for self-application/dev checkouts, end-user
   installs rely on the marketplace/host distribution channel's own integrity,
   and the design document's disclosed limitation 1 becomes the final
   statement rather than an interim one.

No implementation until the PO has made this scoping decision. Note that
option 1 and option 2 both re-touch the bootstrap readiness gate's `status`
decision, which is the exact change class the PO already ruled needs the
design-first treatment (MP-22/23) when accepting the companion item
`backlog/items/2026-08-07-self-application-integrity-check-absent.md`.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
