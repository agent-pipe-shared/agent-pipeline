# Held patch notes: PF-88 slice 2, the Critic diagnostic evidence run derives the required guardrails when --base is given

Candidate dd42bcda046502243bb9752309c858a4e0b0f3fc. Patch: `w7-pf88-diagnostic-evidence-auto-guardrails.patch` (git diff --binary against a LOCAL stack-base commit in the scratch clone, 3 files, +73 -3).

APPLY ORDER: the held patch `w7-pf88-guardrail-derivation-shared.patch` first (it adds `lib/critic-required-guardrails.mjs`), this patch second.

## Cause
`critic-diagnostic-evidence.mjs` took only explicit `--guardrail` paths, so the operator had to name the JSON manifest in a command the gate-strength shell lane refuses (recon `w7-recon-pf88-guardrail-name-refusal.notes.md`, sections 1 and 3).

## Changed lines (patch only; repository tree untouched)
- `scripts/critic-diagnostic-evidence.mjs`: usage line gains `[--base REF]`; flag map gains `"--base": "baseRef"`.
- `lib/critic-diagnostic-producer.mjs`: imports `deriveRequiredCriticGuardrails`; new optional option `baseRef`. When defined: resolve it with `git rev-parse --verify <ref>^{commit}` (failure throws `CDI-BASE`), call the derivation (candidate commit, resolved base, explicit guardrails) and use its sorted deduplicated `paths` as the guardrail set hashed from the candidate commit (`{path, sha256}` exactly as before). Derivation errors are rethrown with their CDP-* code. Without `baseRef` nothing changes.
- `lib/critic-diagnostic-evidence.test.mjs`: four cases appended, ascending: PF88-S2 (i) CLI with `--base`, no `--guardrail`, manifest + sha256 present and `validateCriticDiagnostic` accepts; (ii) explicit plus derived is a deduplicated sorted union; (iii) no base: guardrails equal the explicit set; (iv) non-commit base (unknown ref, tree oid) throws `CDI-BASE`.

## RED then GREEN
- RED (clone, unchanged production code): (i), (ii), (iv) failed; (iii) passed (it pins unchanged behaviour). Log `scratch/agent-out/w7pd/red.critic-diagnostic-evidence.test.mjs.log`.
- First GREEN run: (i) failed on a mistake in my own assertion (`validateCriticDiagnostic` returns no `.guardrails`); I replaced the final assertion with `assert.doesNotThrow(validate...)`, which is stricter about the thing the criterion needs (acceptance), not weaker. No production change followed from it.
- GREEN (clone, whole file): tests 9, pass 9, fail 0.
- Baseline (clone2 at the candidate with the held patch applied, unchanged): tests 5, pass 5, fail 0. Failing-name sets: both empty; the only difference is the 4 new cases.

## Not done
- Apply check (`driver check`, git apply --check in clone2) NOT run: tool budget exhausted. Patch was written from the clone diff against the local base; run `git apply --check` after the held patch.
- Driver cleanup NOT run: `scratch/agent-out/w7pd/clone` and `clone2` still exist (untracked scratch; delete them).
- The preflight's requirement-map path is NOT derived here. If the packet's requirement map names a path outside governance and changed-manifest paths, the preflight still fails `CDI-GUARDRAILS` and needs `--guardrail` for that path (its failure now lists the required paths via slice 3 of the held patch).
- `--base` accepts range mode only; no current-artifact scope.
- Independent Critic review stays a parent-owned batch gate.

## Proposed commit message
feat(critic): derive the required guardrails in the diagnostic evidence run when --base is given

## Operator flow
Apply the held shared-derivation patch, then this one (`git apply`), `git add -u` with a path limit (plus the new lib file from the first patch), `git commit --no-verify` via a message file, stamp, install.

## Protected-path classification
None of the three patched files matches TP-1..TP-13 (observed from `agent-obligations.md` section 2). No new test file, so no Verify registration.
