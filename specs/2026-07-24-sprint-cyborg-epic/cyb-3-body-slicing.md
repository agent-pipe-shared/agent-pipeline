# CYB-3 implementation plan — SBOM lifecycle

> Implements `cyb-3-feature-spec.md` without weakening ADR-0032's existing
> greenfield/no-automatic-migration boundary. This plan is governed by the
> approved Sprint Cyborg epic plan and the PO's 2026-08-01 direction to finish
> the remaining Cyborg requirements.

## Outcome and boundaries

CYB-3 adds a canonical, candidate-bound SBOM manifest and a read-only
discovery/export interface. It does not make an SBOM a security verdict,
release approval, VEX statement, or external publication request. Existing
`third-party-licenses.json` and historical release artifacts stay byte-stable
until an explicit migration action is approved.

The implementation is split by stable boundaries so that schemas and pure
state evaluation are proved before any filesystem adapter or release consumer
uses them.

| Slice | Owns | Depends on | Acceptance coverage |
| --- | --- | --- | --- |
| CYB-3A | ADR-0032 amendment, `supply-chain` topology registration, closed SBOM schema and canonical JSON/digest validator | CYB-1 applicability boundary | AC1, AC2, AC4, AC5, AC9 (schema-invalid), AC15 malformed/digest classes |
| CYB-3B | Pure lifecycle evaluator: applicability, freshness, completeness, invalidation and seven typed diagnostics | CYB-3A | AC6, AC7, AC9, AC14, AC15 stale/unsupported/not-applicable classes |
| CYB-3C | Deterministic Node reference adapter and single-/multi-ecosystem fixtures | CYB-3A/B | AC3, AC4, AC7, AC10, AC15 single/multi/monorepo/missing-transitive/deterministic classes |
| CYB-3D | Read-only discovery CLI, export/redaction view, and migration-preview | CYB-3A/B/C | AC2, AC3, AC11, AC12, AC16, AC17 |
| CYB-3E | Immutable release binding, prior-release delta, audit-bundle links, scoped Verify registration | CYB-3A-D | AC8, AC13, AC14, AC15 release/unsafe-topology/lossy-conversion classes |

No slice may modify the canonical SBOM payload after its digest is published.
Later slices link to an earlier payload by `{schema, digest}` and fail closed
on a missing, malformed, stale, partial, unsupported, unavailable, or
not-applicable state.

## CYB-3A — authority and schema freeze

1. Amend ADR-0032 rather than silently replacing it. The amendment retains:
   greenfield adoption, no automatic historical migration, and CycloneDX as a
   project-selected adapter. It adds the portable `pipeline.sbom-manifest.v1`
   contract, lifecycle states, candidate binding, and explicit migration
   preview.
2. Extend `governance/artifact-topology.json` with the already declared
   `supply-chain` class only; no second canonical SBOM root or literal
   discovery path may be introduced.
3. Add a pure SBOM module with a closed root shape. Its manifest binds:
   - `candidate` (`repositoryFingerprint`, commit, tree);
   - source-input digests, adapter identity/version/config, and format/profile
     identifiers;
   - per-component scope/provenance/relationships;
   - completeness, freshness, privacy/export classification, and payload
     digest;
   - typed lifecycle outcome plus stable reason code.
4. Use deterministic canonical JSON. Volatile generator serials, timestamps,
   and external tool text are normalized into recorded metadata, never into
   the digest-bearing logical component graph.

Tests first: closed-key rejection; each required field omitted; malformed and
digest-mismatch fixtures; equivalent CycloneDX/SPDX logical fixture pairs;
and topology rejection for a competing path.

## CYB-3B — lifecycle semantics

The evaluator is pure and receives already-observed candidate/input facts. It
returns one of the seven externally visible states without inspecting the
filesystem itself:

| State | Required meaning |
| --- | --- |
| `complete` | Exact candidate and every declared applicable component has a validated inventory. |
| `stale` | Candidate or governed source digest differs from the bound manifest. |
| `invalid` | Schema/profile/digest binding fails. |
| `partial` | At least one applicable component was observed but coverage is incomplete. |
| `unsupported` | A declared applicable component has no supported adapter. |
| `unavailable` | Required observation/adapter could not run; it is never a clean empty inventory. |
| `not-applicable` | A closed applicability decision establishes that the repository has no SBOM subject. |

`partial`, `unsupported`, `unavailable`, and `not-applicable` remain distinct.
Only `complete` may satisfy a release-binding precondition. A missing input is
never an applicability exemption.

Tests first: one positive and one negative fixture for each state, frozen
input/purity assertions, exact candidate drift, lockfile drift, and an
unsupported adapter that never becomes `complete`.

## CYB-3C — deterministic adapter

The reference Node adapter accepts fixture-provided dependency graph input;
it does not auto-install, execute project code, or contact a registry. It
produces CycloneDX JSON and SPDX JSON profile views from one normalized graph,
then returns a canonical manifest that links their payload digests.

The monorepo fixture contains at least two component scopes and a relationship
between them. Aggregation must retain source scope, component provenance and
edge ownership instead of flattening components into one package list.

Tests first: single ecosystem, multi ecosystem, monorepo, absent transitive
dependency, malformed upstream payload, deterministic regeneration, and
lossy-format conversion rejection.

## CYB-3D — discovery, export, and migration boundary

One read-only command accepts a repository root and optional release selector.
It resolves a registered `supply-chain` artifact through topology metadata; it
never guesses a path. The same command must work for two fixture repositories
whose canonical artifact directories differ below their roots.

The public export is a derived, non-authoritative view. It redacts private
registry coordinates and internal component names according to the manifest's
privacy classification. Neither the export nor a consumer projection may edit
the canonical payload.

Migration is preview-only: current ADR-0032 baseline artifacts produce a
zero-write `not-applicable`/preview result until an explicit activation is
introduced in a separately approved change.

Tests first: two layouts; missing/unsafe topology; public redaction; rejected
consumer mutation; and pre-migration byte-for-byte no-write proof.

## CYB-3E — release and audit binding

Release binding accepts only a `complete`, exact, validated canonical SBOM.
It stores the payload and manifest digests plus a deterministic delta from the
prior bound release; a historical release entry is immutable. The audit-bundle
view references (not duplicates) SBOM, policy, completeness, validation and
release-binding digests.

All new suites register through scoped Verify registration. The final slice
runs focused suites, the configured Verify command, Security, and a
diff-scoped Critic review before CYB-3 is marked complete.

Tests first: exact release binding; prior-release added/removed/changed delta;
stale/partial release rejection; unsafe topology; audit bundle with all six
required links; and Verify registration drift.

## Prohibitions and rollback

- No manual canonical payload edits, automatic migration, package-manager
  installation, registry access, secret/credential storage, or external SBOM
  publication.
- No finding, VEX, waiver, or approval field in the canonical SBOM payload.
- No hard-coded canonical path outside topology validation/discovery.

Each slice is separately revertible. If a released consumer cannot process the
new schema, stop adoption, revert the affected slice and its scoped Verify
registration together, retain the previous immutable release artifact, and
record the candidate/evidence that triggered the rollback. Never overwrite a
historical release inventory to simulate rollback.
