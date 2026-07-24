# Canonical artifact topology

`governance/artifact-topology.json` is the versioned, closed taxonomy and
state contract. `node plugins/pipeline-core/scripts/check-artifact-topology.mjs`
is its read-only validator. Compatibility mode inventories the declared
contract without moving legacy history. Enforced feature packages use
`specs/<feature-id>/` with stable authority and candidate-evidence paths.

For a rigor-1/2 package, `lifecycle.json` is the closed
`pipeline.feature-package.v1` manifest. It binds the safe feature ID, rigor,
state, exact artifact paths and byte digests, authority/mutability/retention,
and (from verification onward) the exact candidate commit and tree. The
validator rejects aliases, symlinks, traversal, case-fold and Unicode
normalization collisions, duplicate authorities, stale digests, and missing
required artifacts. Legacy packages are reported as legacy; no historic state
or evidence is invented.

| Class | Canonical package home | Authority / retention |
| --- | --- | --- |
| PRD, Spec, acceptance, Result | `prd.md`, `spec.md`, `acceptance.md`, `result.md` | One PRD and Spec authority while active; Result is append-only. |
| Design and plan | `design/`, `plans/` | Mutable working inputs; retain when referenced. |
| Candidate evidence | `evidence/` | Immutable, non-authoritative, exact-candidate bound. |
| ADR, backlog, handover, release, retention, supply-chain, private-local | Their established dedicated roots | Governed by their existing schemas; private/local artifacts never join a portable package. |

`planFeaturePackageTransition()` produces a deterministic, non-mutating
preview of the manifest change and required authority. It intentionally does
not convert a preview into a write or a PO approval.
