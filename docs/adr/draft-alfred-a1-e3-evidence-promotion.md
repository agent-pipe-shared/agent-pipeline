# Draft: Alfred A1 to E3 evidence promotion without candidate self-reference

## Status

Proposed on 2026-09-25. This is not an accepted gate change, native-hook
measurement, or E3 admission.

## Date

2026-09-25.

## Context

Alfred Spec §4.1 measures native enforcement against a committed source
candidate. Its `pipeline.enforcement-conformance.v1` record names that
candidate. Spec §8.1 then expects the tracked A1 record and tracked E3 gate
readback to be current for the candidate running the E3 fixture. The current
readers require every named commit and tree to equal that candidate exactly.

These requirements cannot all hold for a normal in-repository publication:
the measurement must precede the record, while committing the record changes
the commit/tree. A readback that names its own containing commit is likewise
self-referential. Repeating the measurement after each evidence commit does
not solve this. A synthetic test can place a current-looking file in a fixture
worktree, but that is not a committed candidate-bound promotion proof.

## Decision proposed

Separate the **qualified source candidate C** from one **evidence carrier P**.
The native producer and independent host reader qualify C. A deterministic
producer then writes only the canonical A1 record, a derived A2 placement
addendum, and E3 promotion readback, all naming C and the exact native
receipt. None names P. P is a
single-parent direct child of C. At E3 admission the consumer independently
derives P from Git, verifies its tree and complete NUL-delimited C→P delta,
and compares all three committed evidence blobs byte-for-byte with independently
reconstructed expected content. No caller-supplied `evidenceOnly` flag,
ancestor claim, path prefix or digest grants admission.

The proposed closed list is
`policies/enforcement-conformance.antigravity.json`,
`policies/alfred-e3-a2-placement-addendum.v1.json`, and
`policies/alfred-e3-gate-readback.v1.json`, each a new regular `100644` file
with a fixed schema. It excludes source, manifests, hooks, schemas,
configuration, test registrations, the A2 control-placement table, A3
baseline and A5 authority/state changes. Those source contracts must be final
at C. The A2 table is allowed to retain its truthful `unavailable` status at
C: its later, canonical addendum does not rewrite that history. An
independent producer derives the addendum from the unchanged C table, its
E3 placement row, the verified native A1 receipt and the C-bound posthoc
implementation. E3 admits the derived placement only when this addendum
and the source table both validate. The addendum is not a free-standing
`enforced` assertion or a general A2-status override.
The reader rechecks all A1 source preimage bytes, runner/plugin versions,
native host provenance, A2/A3/A5 bindings and protected paths against C and
P. Any changed declared input, missing provenance, ambiguous Git history,
symlink, dirty worktree, source drift or unexpected delta returns unavailable.
P's evidence receipt never claims that Verify or Security executed on P;
their separate promotion/input-overlap rules remain in force.

The existing exact-candidate path remains the default. This narrow C→P path
must be jointly implemented in the A1 checker, E3 readback, producer, schemas
and tests before activation. The current `unavailable` gate state remains
unchanged until a real host-observed A1 run and this complete reader pass.

## Consequences

The local candidate can retain an immutable source identity while carrying
reviewable evidence in a later commit. A newer ordinary source commit is not
automatically covered; it needs a new qualification. A fresh clone can check
the committed C→P relationship, but cannot claim the private native host
observation was independently witnessed unless the approved portable
provenance mechanism is also present. This decision does not create that
trust anchor or silently substitute the PO signing key for a host marker.

## Affected contracts

- Alfred Spec §4.1 A1 record and independent native readback.
- Alfred Spec §8.1 E3 gate readback and candidate identity.
- A2 E3 control-placement status and derived addendum; A3 protected
  baseline; A5 CAS authority.
- `enforcement-conformance-cli.mjs` and `goldfish-antigravity-host.mjs`.
- Candidate-bound Verify/Security evidence and Nova G20 promotion rules.

## Required verification before acceptance

Use a disposable real Git repository: qualify C, add only the generated
record/readback as P, and prove both readers independently accept exactly P
after real native provenance is available. Negative cases cover self-named
P, uncommitted or edited evidence, a source/A2/A3/A5 change, an extra file,
rename, mode change, merge, replayed marker, wrong runner/plugin version,
changed declared input, an A2 addendum that disagrees with its still-unavailable
source table, and a forged current-looking JSON file. Without a
host trust anchor the positive test must remain unavailable, not synthetic
PASS. Independent Critic and PO architecture acceptance precede activation.

The preparatory `scratch/0.7-a1-e3-carrier-proof.mjs` has five real-Git
structural tests. Its result explicitly says `structuralProofOnly` and
`nativeMeasurementVerified: false`; it is not wired into the E3 consumer.
