# Canonical artifact topology

`governance/artifact-topology.json` is the versioned, closed taxonomy and
state contract. `node plugins/pipeline-core/scripts/check-artifact-topology.mjs`
is its read-only validator. Compatibility mode inventories the declared
contract without moving legacy history. Enforced feature packages use
`specs/<feature-id>/` with stable authority and candidate-evidence paths;
transitions remain manifest-bound and preview-first.
