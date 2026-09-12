# LND-2 envelope/store reader admission

Date: 2026-09-12  
Scope: ADR-0083 LND-2, runner-neutral governance storage

The foundation commit `12a304ce` admits
`pipeline.governance-action-event.v1` only on the existing lifecycle origin,
non-authoritative authority class and lifecycle stream. The portable store
selects the closed action validator, recomputes both identifiers, and enforces
the complete D4a payload/envelope equality table. New lifecycle-v1 writes for
the five historical action kinds are refused; existing lifecycle-v1 records
remain readable. No producer is enabled.

The first independent Critic found two major reader-first defects: persisted
action payloads were not revalidated on read, and the published envelope JSON
schema did not itself constrain lifecycle events to the lifecycle stream.
Correction commit `3ffa075e` moves the action validation and equality checks
into one append-and-read helper, adds an adversarial canonical injected-record
test, and aligns the schema constraint with the runtime.

Focused verification after correction:

- governance envelope/runtime: 12/12 passing;
- governance action payload: 7/7 passing;
- governance event store: 50/50 passing outside the restricted process sandbox
  because its local Git fixtures otherwise receive `spawnSync git EPERM`;
- lifecycle runtime: 7/7 passing;
- lifecycle schema parity: 3/3 passing;
- human governance ledger: 24/24 passing outside the same process boundary;
- JSON parsing and `git diff --check`: passing.

The corrected independent review found no remaining implementation defect. It
withheld a final release PASS because checklist item 2 requires a detached
threat-model approval request bound to the eventual stable delivery candidate
and effective policy. That candidate does not yet exist. The obligation is
therefore collected for candidate freeze and blocks only push/release, not the
remaining accepted Nova-B implementation slices.
