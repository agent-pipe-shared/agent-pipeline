# CYB-3 — SBOM lifecycle (feature spec)

> **Status: IMPLEMENTATION, PO-authorized 2026-08-01.** Translates issue #39
> (fetched verbatim via `gh issue view 39`, 2026-07-25) into checkable form.
> Phase II depends on the CYB-1 applicability boundary (resolved by the
> scoped F1 Critic PASS at `20cc401`); the PO's direction to complete the
> Cyborg epic authorizes implementation under the approved epic plan.

## 1. Problem (condensed)

ADR-0032 currently treats `third-party-licenses.json` + vulnerability-scan
evidence as mandatory baseline while full CycloneDX SBOM stays optional — not
a complete component inventory (no resolved dependency graph, transitive
relationships, candidate binding, provenance, or immutable release snapshot).
Outcome: a versioned, provider-neutral SBOM lifecycle producing a validated
machine-readable inventory per exact candidate, with an immutable snapshot/
digest bound to release.

## 2. Core invariants (verbatim from #39, already checkable)

1. Exact-candidate identity (repo authority, component scope, candidate
   commit/tree, source-manifest/lockfile digests, build-artifact digest).
2. Inventory ≠ security verdict — findings/VEX/risk-acceptance/release-approval
   stay separately typed (feeds CYB-8's separation requirement).
3. Declared completeness — partial/unsupported stays visibly so, never
   collapsed into success.
4. Machine discoverability via #22 inventory, not hard-coded paths.
5. Generated, reproducible authority — no manual payload edits; generation
   inputs/tool identity/schema version/config recorded.
6. Release immutability — regeneration creates a new version, never rewrites
   historical release inventory.
7. Provider-neutral core — external integrations are adapters/projections,
   never a competing authority.

## 3. Acceptance criteria — checkable form

| # | #39 AC (paraphrased) | Checkable criterion | Evidence class |
| --- | --- | --- | --- |
| AC1 | ADR-0032 amended/superseded with clear decision | ADR diff exists naming applicability/format/completeness/lifecycle/migration explicitly | ADR review |
| AC2 | #22 recognizes SBOM as governed class, no competing path | `governance/artifact-topology.json`-style registration exists; no second hard-coded SBOM path in the codebase | Topology registration + grep-based drift check |
| AC3 | One read-only command resolves exact candidate/release SBOM, no path guessing | CLI fixture: same command resolves correctly across ≥2 differently-laid-out fixture repos | CLI fixture |
| AC4 | CycloneDX JSON + SPDX JSON validate against pinned profiles + canonical digest | Schema fixture per format; canonicalization fixture proves same logical content → same digest despite volatile serials/timestamps | Schema + canonicalization fixture |
| AC5 | Manifest identifies provenance/inputs/bindings/completeness/freshness/privacy/digest | Manifest schema fixture requires all named fields | Schema fixture |
| AC6 | Governed-input/candidate change deterministically marks prior SBOM stale | Fixture: touch a governed lockfile → re-check reports `stale`, not silently reused | Staleness fixture |
| AC7 | Partial/unsupported inventory cannot report as complete | Fixture: partial-ecosystem generation asserts result ≠ `complete` | Negative-gate fixture |
| AC8 | Release manifest binds immutable SBOM + prior-release delta | Release fixture asserts payload/digest binding and a computed delta record | Release-binding fixture |
| AC9 | Missing/stale/invalid/partial/unsupported/unavailable/not-applicable have stable distinct diagnostics | One fixture per state (7 total) asserting distinct typed codes | Fixture set |
| AC10 | Monorepo aggregation preserves boundaries/provenance/scopes/relationships/completeness | Multi-package monorepo fixture: aggregate does not flatten per-component provenance | Monorepo fixture |
| AC11 | Consumers use discovery/export interface without becoming canonical authority | Interface contract doc + fixture: an external projection cannot mutate the canonical record | Contract fixture |
| AC12 | Private metadata follows explicit export/redaction; secrets excluded by schema+fixtures | Redaction fixture: private registry coordinates/internal names excluded from public export path | Privacy fixture |
| AC13 | #9 audit bundles can include/reference exact SBOM+digest+policy+completeness+validation+release binding | Audit-bundle fixture references all six | Cross-package fixture |
| AC14 | #6 exact-candidate checks enforce applicability/freshness/integrity/completeness without a human viewer | Headless (non-UI) check fixture | Fixture |
| AC15 | Fixtures cover the full class list (single/multi-ecosystem, monorepo, missing transitive deps, unsupported components, stale lockfiles, malformed payload, digest mismatch, lossy conversion, private metadata, unsafe topology, deterministic regeneration, release deltas, legacy baseline-only) | Full fixture inventory — 13 classes, single-/multi-ecosystem counted separately per `backlog-acceptance-matrix.md` note (→ 14) | Fixture matrix |
| AC16 | Existing conforming artifacts require no byte changes until explicit migration approved | Migration-preview fixture: dry-run on current tree produces zero writes | Migration fixture |
| AC17 | Docs describe generation/validation/discovery/export/privacy/failure-recovery, and distinguish inventory/findings/VEX/approval | Doc review checklist | Doc check |

Coverage note: matches `backlog-acceptance-matrix.md`'s "17 (14 counting
single-/multi-ecosystem separately)" for #39.

## 4. Scope carried (from #39 §1-§10, mapped to spec.md's CYB-3 summary)

ADR-0032 amendment · #22 topology-class wiring · `sbom-manifest.v1` · CycloneDX/
SPDX validated profiles with deterministic canonicalization/digesting · Node
reference generation adapter (proving ≥1 single-ecosystem + ≥1 multi-ecosystem/
monorepo path, per #39 §4, without making one generator part of the portable
core) · staleness/invalidation triggers (§39 §5) · release binding via L6 ·
migration + `not-applicable` paths (§39 §10). Zero-byte legacy compat: existing
ADR-0032 baseline artifacts get no byte changes pre-migration (AC16).

## 5. Non-goals (verbatim from #39)

Declaring vulnerability-free because an SBOM exists; embedding findings/risk
acceptance into inventory (CYB-8's job); mandating one commercial generator;
uploading SBOMs externally by default; committing signing keys/credentials;
replacing lockfiles/build-provenance/vulnerability-evidence/release approval;
inventing components/versions/relationships/history; requiring an SBOM for a
validly not-applicable repository.

## 6. Dependencies

#22 (canonical artifact topology, hard prerequisite) · #40 (exact-candidate
binding, resolved in Sentinel) · #41/CYB-1 (applicability only). Cyborg-internal
coordination: #42/CYB-2 consumes SBOM capability/coverage; #45/CYB-7 binds SBOM
subjects to provenance; #47/CYB-8 keeps VEX disposition separate.

## 7. Gate

Universal package rule (Verify + Security green, fresh Critic, PO gate). No
dispatch before the epic-level PO gate and CYB-1 boundary are resolved; schema/
adapter/fixture work may start once boundaries are approved (issue's own
"Parallelism" note).

## 8. Rollback

Every CYB-3 slice is independently reversible. If a consumer rejects the new
manifest contract or its profile bindings, stop adoption, revert that slice and
its Verify registration together, retain any previously immutable release
inventory unchanged, and record the candidate and evidence that triggered the
rollback. No rollback may rewrite an historical SBOM or activate migration;
the legacy baseline remains available until a separately approved migration.
