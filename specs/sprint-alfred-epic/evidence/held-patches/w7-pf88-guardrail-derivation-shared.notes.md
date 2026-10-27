# Held patch notes: PF-88 slices 1 and 3, shared Critic guardrail derivation and required paths in the CDI-GUARDRAILS failure

Candidate 56f2b265db7f1f00cb648bfe38199cb5932d5284. Patch: `w7-pf88-guardrail-derivation-shared.patch` (git diff --binary against the candidate, 3 files, +214 -56).

## Cause
The derivation of the required Critic guardrails was private to `scripts/critic-dispatch-preflight.mjs`, so no second caller could share it, and the `CDI-GUARDRAILS` evidence failure named no path (recon: `w7-recon-pf88-guardrail-name-refusal.notes.md`, sections 1 and 3). Re-verified in the clone: the cited preflight block and `reasonForChangedPath` (`changed-manifest`) match the recon.

## Changed files (patch only; repository tree untouched)
- NEW `plugins/pipeline-core/lib/critic-required-guardrails.mjs`: exports `deriveRequiredCriticGuardrails({root, candidate, base, changedPaths, explicitGuardrails, requirementPaths, onStage})` returning `{files, byPath, governance, required:[{path, reasons}], paths}` (sorted; reasons include governance reasons such as `changed-manifest`, plus `explicit` and `requirement-map`), and `CriticGuardrailDerivationError` (carries the CDP-* code). The inventory, manifest parse, diff and governance steps keep the original order and git call sequence.
- `scripts/critic-dispatch-preflight.mjs`: calls the shared function; the requirement-map evaluation stays in the preflight and runs inside it via the `requirementPaths` callback (same position, same CDP-REQUIREMENT-* failures); derivation errors are re-raised through the preflight's own `fail` with the same code and message, so stage observation is unchanged. Dropped the now unused `candidateInventory`, `parseYaml` and governance imports. In `matchingCandidateEvidence`, a `CDI-GUARDRAILS` diagnostic failure now carries `details.requiredGuardrailPaths` (the preflight guardrail paths) and the message names them; every other diagnostic code keeps the old message and details.
- `scripts/critic-dispatch-preflight.test.mjs`: two new cases appended (ids stay ascending, no existing id moves): CDPF047 (changed JSON manifest is required with reason `changed-manifest`, exact sorted path list) and CDPF048 (`CDI-GUARDRAILS` failure carries exactly the required paths, message names them).

## RED then GREEN
- RED (clone, unchanged production code, new cases only added): CDPF047 and CDPF048 failed, all others passed (log `scratch/agent-out/w7pc/red.*.log`).
- GREEN (clone, whole file): `tests 48, pass 48, fail 0`, CDPF047 and CDPF048 included.
- Baseline (clone2 at the candidate, unchanged, 46 cases): the run finished, but I ran out of tool budget before reading its summary; the failing-name set comparison is NOT done. The patched file has zero failures, so any baseline failure could only be a pre-existing one that the patch does not reproduce. Log: `scratch/agent-out/w7pc/base.critic-dispatch-preflight.test.mjs.log` (deleted by cleanup if that ran).
- Apply check: `git apply --check` of the patch in clone2 at the candidate: exit 0.

## Not done
- No change to `lib/critic-diagnostic-evidence.mjs`, `scripts/critic-diagnostic-evidence.mjs`, `lib/critic-diagnostic-producer.mjs` (slice 2 adds `--base`) or the gate-strength lane (custody slice).
- The new lib duplicates four small git/path helpers of the preflight (the preflight still needs them for other steps); deduplication is a follow-up.
- Baseline vs patched failing-name comparison (see above). Whole-file run only, no other suite.
- Independent Critic review stays a parent-owned batch gate.

## Proposed commit message
refactor(critic): share the required guardrail derivation and list the required paths in the CDI-GUARDRAILS failure

## Operator flow
Apply the diff in the repository (`git apply`), `git add -u` with a path limit plus `git add` for the new lib file, `git commit --no-verify` via a message file, stamp, install.

## Protected-path classification
None of the three patched files matches TP-1..TP-13 (observed from `agent-obligations.md` section 2); no custody file is touched. The lib file needs no registration (no test file of its own).
