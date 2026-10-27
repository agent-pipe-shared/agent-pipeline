# Held patch: carry diagnostic evidence across registered evidence-only commits (D51, slice G1)

Slice W7-D51-EVIDENCE-CARRY-C1-20261027. Candidate 590e1c760f8d4da7e03cfa1f775fdb03ccf5af7d. Patch: `w7-d51-evidence-carry.patch` (git diff --binary of a scratch clone against the candidate; two files).
Status: targeted delivery green; held, NOT applied to the repository tree. Independent Critic review, Full Verify and PO acceptance stay parent-owned batch gates and are pending.

## Cause
`deterministic()` in `plugins/pipeline-core/lib/critic-course-admission.mjs` (line 485 at the candidate) skipped any registered diagnostic whose nested `candidate` differed from the review candidate, so evidence for commit A was invisible for any later candidate B, even when A..B contained only registered evidence-registration commits. Recon lines re-verified against the clone: `deterministic()` 483-488, `evidenceCommitV2` 444-453 (the V2 helper behind `evidenceOnlyCommits`, line 481), `range` 443 (bounded 512), `critic-diagnostic-evidence.mjs` untouched.

## Change (clone only; patch carries it)
`plugins/pipeline-core/lib/critic-course-admission.mjs`:
- `deterministic()`: a diagnostic whose candidate is not B now calls new `carryProof(...)`. On a proof it validates the evidence against its OWN bound commit/tree (A), records `{path, proofSha256}` in a new `carry` list, and returns `carry` additionally. `sha256` is `sha256Canonical(entries)` as before when there is no carry, and `sha256Canonical({entries, carry})` when there is, so the carry proof digest is part of `deterministicEvidenceSha256` of the admission. `entries` is unchanged in shape (the delta-request equality check still holds).
- new `carryProof(root, registrationCommit, featureId, from, fromTree, to)`: requires `from` tree equals the evidence-bound tree; `range(from, B)` linear-ancestor and at most 512 commits; EVERY commit passes `evidenceCommitV2` (single parent, manifest plus newly added registered evidence only; any other commit is a correction commit and refuses); and `git diff --name-only from B` is a subset of the manifest plus registered evidence paths (explicit non-evidence-identical re-check). Any failure or exception returns null, so the old skip behaviour and `CCA-DETERMINISTIC-UNAVAILABLE` stand.
`plugins/pipeline-core/lib/critic-course-admission.test.mjs`: new `carryFixture()` and five cases appended before the completion registration (+52 lines). No existing case changed.
Spec/guardrail digest (c): evidence digests are read from the bound commit A, and a changed spec file at B is a non-evidence change, so it is a correction commit and refuses; the dedicated case changes spec content.

## RED / GREEN
- RED (patched test file, unchanged code, clone): 38 tests incl. the new ones; `CCA038 D51-CARRY (a)` failed with `CCA-DETERMINISTIC-UNAVAILABLE`; exit 1. (b), (c), (d), (e) were already green before the change: they are regression guards of existing behaviour, not RED by nature.
- GREEN (patched): `tests 42 / pass 42 / fail 0`, exit 0. New ids CCA038 (a) carry accepted + digest differs from the entries-only digest, CCA039 (b) non-evidence file refused, CCA040 (c) spec content refused, CCA041 (d) correction commit refused, CCA042 (e) exact-commit unchanged and digest equals `sha256Canonical(entries)`.
- Whole file, baseline clone2 (unchanged candidate): `tests 37 / pass 37 / fail 0`, exit 0. Failing-name sets: baseline empty, patched empty; no pre-existing failure. Logs: `scratch/agent-out/w7ff/{red,green,base}.critic-course-admission.test.mjs.log` (untracked, removed with clones only).
- Apply check: `git apply --check` of the patch in clone2 at the candidate, exit 0.
- Commands: `node scratch/agent-out/w7ff/driver.mjs run LABEL plugins/pipeline-core/lib/critic-course-admission.test.mjs` (cwd of the clone); driver modes setup, setup2, run, patch, check, cleanup.

## NOT done
- The strict Verify receipt check `inspectCriticVerifyDiagnostic` (critic-diagnostic-evidence.mjs line about 65) is untouched: the seven-minute Verify rerun is a different gate.
- `critic-diagnostic-evidence.mjs` not changed (not needed).
- The carry proof is visible only through `deterministicEvidenceSha256`; no new projection key (the V2 projection key set is closed). The proof object itself is not persisted.
- Only the V2 runtime path (`deterministic()`); the V1 `evidenceOnlyCommit` classifier is not changed. A diagnostic whose evidence-bound commit equals B is the unchanged exact path.
- No two-hop carry beyond what one range proof shows; no Windows/CRLF run.

## Proposed commit
`fix(critic): carry diagnostic evidence across registered evidence-only commits`

## Operator flow
1. `git apply specs/sprint-alfred-epic/evidence/held-patches/w7-d51-evidence-carry.patch` at the candidate.
2. `git add -u -- plugins/pipeline-core/lib/critic-course-admission.mjs plugins/pipeline-core/lib/critic-course-admission.test.mjs`
3. commit with `--no-verify` per the held-patch ceremony, then stamp and install.

## Protected-path classification observed
Neither patched file matches a protected test pattern of `templates/prompts/agent-obligations.md` section 2 (TP-1..TP-13). `critic-course-admission.mjs` is plugin source, hence the held-patch route, not guard-refused by pattern; I did not attempt a repository edit. Both new files under `specs/` are in the draft-phase exempt prefix.

## Gate
Independent Critic review remains a parent-owned batch gate.
