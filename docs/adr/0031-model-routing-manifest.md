# ADR-0031: One Routing Authority with Generated Runner Projections

## Status

Accepted on 2026-07-07. The original manual-projection authority model was superseded for Phase 2 on 2026-07-13.

## Context

Routing policy becomes ambiguous when prose, a runtime manifest, and runner files can each be edited as if authoritative. A projection is useful for runtime tools, but only when it is derived from one policy source and cannot become a second truth.

## Historical Decision (2026-07-07)

The original decision made `policies/model-policy.md` canonical and treated the `modelRouting` block in `.claude/pipeline.yaml` as a manually synchronized machine-readable projection. It correctly rejected a manifest-owned second policy, but manual synchronization left a drift path.

## Phase 2 Supersession (2026-07-13)

The routing architecture is:

1. The kernel owns exactly one provider-neutral routing authority. It assigns the selected profile, every profile-bound design/execution route, and each role to capability and effort classes without concrete provider identities.
2. Each runner adapter owns only the mapping from those abstract assignments to that runner's concrete models and effort syntax. A mapping resolves policy; it does not create or override policy.
3. Runner manifests and configuration files must be generated projections of the authority plus the selected adapter mapping. They must never be hand-maintained routing policy.
4. Generation must record source provenance, and deterministic tests must compare every projected role, capability, effort, selected profile, and profile-bound route against the authority. Missing, stale, or conflicting projection data must fail the routing check instead of choosing a second source.
5. Prose documents explain constraints and revision history but do not duplicate mutable routing values.

The Claude adapter retains its existing assignments unchanged. The Codex adapter resolves every Fable assignment to `gpt-5.6-sol` at the same assigned effort tier and must not invent another provider identity or silently substitute a different tier.

`.claude/pipeline.yaml` is therefore a managed Claude projection. Equivalent files for other runners are their own generated projections; none is canonical.

The Phase 2 implementation stores the provider-neutral default assignments in `plugins/pipeline-core/config/routing-authority.json`, runner mappings separately in `plugins/pipeline-core/config/runner-mappings.json`, and compiles the Claude manifest through `setup.mjs`. The deterministic projection gate checks the committed user configuration, full manifest routing matrix, fixed agent frontmatter, and source hashes. Its Codex scope is intentionally partial: it proves only Fable → `gpt-5.6-sol` with unchanged effort and fail-closed behavior for unsupported identities; it does not claim a complete Codex runner projection.

## Phase 2.6 / P3 Direct-route extension (2026-07-15)

`pipeline.user.v1` replaces the user-facing subscription presets with one direct, versioned route source. Each active worktype phase and duty declares exactly a runner, a selector (`alias` or `model-id`), an effort tier, an unavailability policy, and a required dispatch receipt. Setup recognizes an unversioned or v0 source only as a migration input, prints a v0-to-v1 preview, and writes no v1 source or runtime projection until the complete v1 shape validates.

The legacy Claude `modelRouting` projection is retained solely for compatibility and is deterministically checked as semantically identical to Shared candidate `654ebaf`; Claude runner mappings and agent frontmatter remain unchanged. The additive `runnerRoutes` projection is provider-neutral at the manifest boundary. It does not substitute or infer a model identity.

For the Codex binding, Design and independent Critic request the observed `gpt-5.6-sol` model ID at the assigned `xhigh` effort. Implementation, Goldfish, mechanic, and deep request the unresolved `terra` alias at `xhigh`; that alias remains unresolved rather than fabricated. A route is attested only by a valid host/CLI dispatch receipt. An agent self-report is insufficient evidence, and a missing or invalid receipt leaves the route unresolved or unavailable according to its declared policy.

## Consequences

Runtime tools retain a machine-readable view without creating competing policy. Adding a runner requires a bounded adapter mapping and projection tests rather than edits throughout the kernel.

Generation and drift validation become required build responsibilities. Until a projection passes them, its routing data cannot be treated as current.

## Rejected Alternatives

- Manifest as an independent authority: it creates a second truth.
- Prose plus manual projection synchronization: it cannot reliably prevent drift.
- Concrete provider names in the kernel: it couples product policy to one runner.
- Silent fallback when a mapping is missing: it changes capability or effort without authorization.

## Follow-up

Any routing-policy or adapter-mapping revision regenerates and tests every affected projection before use. Full Verify runs setup tests, projection tests, and the live drift checker. Dated provider or pricing evidence may motivate a revision but does not become kernel truth.
