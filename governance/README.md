# Governance directory map

This is a map, not a control itself: it names what lives under `governance/`
and where to read further. For the assembled evidence of one reviewed
candidate (a single Feature Package), read
[`../docs/audit-bundles.md`](../docs/audit-bundles.md) instead — an Audit
Bundle is a create-only, offline-verifiable copy of that candidate's
validated artifacts, not a compliance claim.

## `events/` — the hash-chained human-decision event log

[ADR-0071](../docs/adr/0071-governance-event-kernel.md) defines the
governance event kernel: one closed common envelope split into separate
human, agent, and lifecycle streams, each a chain of canonical individual
files with a monotonic sequence and a previous-event digest.

- `registry.json` declares the three streams (`human`, `agent`, `lifecycle`)
  and each stream's genesis point.
- `heads.json` is the current head (sequence + digest) per stream — a
  replaceable index, not itself an authority.
- `capture-policy.json` is the admission policy for what may be written to
  each stream (default-deny; personal/contextual identifiability
  prohibited).
- Individual stream directories (for example `events/human/`) hold the
  append-only chain of event files themselves, plus a `.lock.guard` file
  used to serialize writes to that stream — it is not an event and carries
  no content of its own.

Per ADR-0071, this generic event kernel is not itself the historical source
for human authority — the Human Governance Decision Ledger is — and a chain
here verifies only internal prefix integrity; completeness requires a
candidate-bound retained checkpoint.

Related public-facing views built on this log: `docs/agent-decision-journal.md`
(the agent observation record), `docs/governance-replay.md` (read-only
lifecycle-stream reconstruction), and `docs/governance-event-export.md`
(one-way export to an external destination).

## `schemas/` — machine-readable contracts, not documentation

Each `*.schema.json` file here is the validation contract for one governance
artifact shape (event envelopes, the stream registry, the capture policy,
audit-bundle manifests, change-control profiles/receipts, organization
policy packs, and related records). Read a schema to know exactly what a
producer or consumer is permitted to write or expect — read the linked
`docs/*.md` pages above for the narrative explanation of what the artifact
is for.

## `security-controls/catalog.json`

A catalog of the security controls the Pipeline defines. Read the file
directly; it is a machine-readable inventory rather than prose.

## Top-level policy and topology files

- `artifact-topology.json` — the canonical artifact topology.
- `github-actions-permissions.json` — declared GitHub Actions token
  permissions.
- `observation-doc-governance.json` — the inventory and lifecycle policy
  that classifies every `docs/**` file by audience and lifecycle, and the
  observation/backlog governance contract it is checked against.
- `spec-retention.json` — spec retention policy.

## `examples/` — advisory examples for an adopting project

[`examples/README.md`](examples/README.md) is the existing map for this
subdirectory: generic, fictional guideline and policy fixtures a hosted
project copies and fills in with its own content. It is not part of this
repository's own governance configuration — see that README for the
guidelines-vs-policies distinction and the hierarchy it documents.
