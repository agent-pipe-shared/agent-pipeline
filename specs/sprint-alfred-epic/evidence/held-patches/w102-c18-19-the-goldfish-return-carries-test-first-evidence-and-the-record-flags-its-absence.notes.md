# w102 — the Goldfish return carries test-first evidence and the record flags its absence (candidate 18, C18-19)

Applies after w76, w90, w95, w96-c18-1e and w97, in that order: the patch is the delta on that chain (it edits the same files) and does not apply to a checkout without it. Criterion binding: AC-239 is the closest existing accepted criterion; the PRD and the Spec are unchanged.

## Why

QG-04 says (PO 2026-10-21) that within one dispatch the owner writes the criterion-bound tests first, records them RED against the original code, then implements and runs them GREEN, but nothing checks it. PO decision 2026-11-02: check at the END of the dispatch, as evidence in the return plus a file-existence check by the finalizer. This is self-attested evidence and file existence, nothing more: the order of events (RED before the first production edit) is not observed and not claimed.

## What it adds

- `lib/native-goldfish-host-return.mjs`: the return accepts one OPTIONAL closed key `testFirst: { red: [ { command, exitCode, evidencePath } ], greenCommand }`. At least one red entry, at most 16; commands are non-empty single-line strings of at most 500 characters; `exitCode` is a non-zero safe integer; `evidencePath` is a normalized repository-relative path; any other shape is refused as `NGHR-FINAL-SHAPE` with a closed `detail.condition` slug naming the field (`test-first-type`, `-fields`, `-red-type`, `-red-empty`, `-red-too-many`, `-red-fields`, `-red-command`, `-red-exit-code`, `-red-evidence-path`, `-green-command`). A return without the key is accepted exactly as before and every earlier refusal is unchanged. The validated `final` carries `testFirst` only when present.
- The result digest (`resultSha256`) is computed over the return WITHOUT `testFirst`. Reason: the observation receipt re-derives that digest from the dispatch record alone (`native-goldfish-host-observation.mjs`, `recordMatches`), and the record has no place for the block; hashing the block in made every receipt draft fail with `NGHO-DRAFT-BINDING`. Returns without the block hash identically to before.
- `lib/native-goldfish-host-finalizer.mjs`: new exported `testFirstEvidenceStatus(root, testFirst)`, run after the commit and before the record draft: `attested` when every red `evidencePath` is a regular, non-empty, non-symlink file whose real path is inside the repository (working tree); `unverifiable` when a block was returned but a file is missing, empty, a symlink or outside; `absent` otherwise. The result of `finalizeNativeGoldfishHostReturn` gains `testFirstEvidence`, and the published record states it in the `note` of its existing `host-return-observed` log entry (`testFirstEvidence: <status> (self-attested; evidence file existence only, the order of events was not observed).`). The commit is never refused or delayed because of it.
- `lib/dispatch-briefing-build.mjs`: one new exported function `testFirstEvidenceParagraph(pkg)` and one call site after the return-contract paragraph. For a package with a `criterion` and at least one test among its `paths` or its `check`, one fixed paragraph asks for the `testFirst` block (RED command, non-zero exit code, evidence file written with the redacting evidence writer the template names) and says the flag appears in the record, is self-attested, and is never a gate. Packages without a criterion (or without any test path) render byte-identically.
- Cases: `NGHR11` in the return suite; `NGHF-TF1`..`NGHF-TF4` (attested, missing file, empty file, absent) in the finalizer suite; three cases at the end of `dispatch-briefing.test.mjs`.

## Deviations and design notes

- The briefing says the host record and the dispatch outcome carry the field. The v4 dispatch record is a closed schema (`dispatch-record.mjs`, outside the write scope; `report.text` is hash-bound), so a new top-level record key was not possible. The flag is therefore in the record's `log` note and as `testFirstEvidence` on the finalizer result. A first-class record key needs a change to `dispatch-record.mjs` and is left to the Coordinator.
- The `host-return-observed` entry is extended rather than a third log entry added, because the existing case NGHF06 pins `log.length === 2`.
- The briefing-builder cases were written before the implementation but the RED run against the original code was not captured separately for those three cases (the function did not exist, so they could not pass); the return and finalizer cases were run RED first.

## Verification by the Elephant (2026-11-02, in the slice clone on the chain base, suites run one at a time)

- `native-goldfish-host-return.test.mjs`: 11 of 11.
- `native-goldfish-host-finalizer.test.mjs`: 48 of 48 (the 44 existing cases plus NGHF-TF1..TF4).
- `dispatch-briefing.test.mjs`: 139 of 140; the one failure is the environment case named below.
- `check-consumer-safe-paths.test.mjs`: 9 of 9.
- The delivered patch is byte-identical to a patch regenerated from the clone HEAD. Not checked against the repository root (it applies only after the chain above).

## Environment note

The `dispatch-briefing` suite fails one case (`public --help ... HELP-FORBIDDEN-IO`) in any checkout below the home directory, with or without this change.

## Not changed / not proven

- No guardrail, `goldfish-task.md` or guard changed; QG-04's own text still says the rule is not enforced by a gate, which stays true.
- Not proven: the full Verify; a live background SubagentStop run carrying a `testFirst` block; reading the evidence file from the committed tree (only the working tree is read, which is where a gitignored evidence file lives).
- A new test file is not added; all new cases are in existing suites.
