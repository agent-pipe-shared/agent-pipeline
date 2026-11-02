#!/usr/bin/env bash
# Candidate 18, second apply script (the findings of the Full Verify below the home directory, after po-apply-0.7-candidate18.sh was applied and installed):
# five held patches, one commit each, in this order, then the derived files in ONE follow-up commit through scripts/refresh-derived-files.mjs. PO terminal, repository root.
#   w110  the four sites counts of the case-completion registry (VCR01)
#   w111  four pins restated for candidate 18 changes (submit-plan verify warning, ruleset identity source, signing refusal before the prompt, host-commit drift detail)
#   w112  the observed Critic preflight prints the producer's refusal bytes (a real, small product defect)
#   w113  four pins that predate candidate 18 (feature-package preview digest, Codex preflight key list, backlog-state D222 exceptions, AC-203 runner marker)
#   w114  the case-completion policies of eleven suites that candidate 18 grew (the Full Verify rejects a suite that declares case ids its policy does not list)
# Left open on purpose: codex-isolated-critic-protected-preimage-tests (the pinned hash of the Critic review skill is a trust anchor; the re-pin is the PO's decision).
# Afterwards the Elephant stamps again, and the PO installs (only on the PO's word).
# Run with: bash specs/sprint-alfred-epic/evidence/held-patches/po-apply-0.7-candidate18-fixes.sh   (repository root, clean tree, HEAD = the commit that carries this script)
set -euo pipefail
H=specs/sprint-alfred-epic/evidence/held-patches
STAGE=(.gitignore .gitleaksignore .gitleaks.toml setup.test.mjs plugins/pipeline-core harness docs scripts evidence roles templates guardrails policies schemas backlog specs)
# One held patch, one commit; the subject is given inline (GIT-03 trailers only). --no-verify is used here and nowhere else.
step2() {
  local patch="$H/$1.patch"
  if [ -f "$H/$1.rebased.patch" ]; then patch="$H/$1.rebased.patch"; fi
  git apply "$patch"
  git add -A -- "${STAGE[@]}"
  git commit --no-verify -m "$2" -m $'AI-Assisted: true\nDispatch: stage-0 (elephant)'
  echo "applied $1"
}
step2 w110-fv-restate-the-four-sites-counts-of-the-case-completion-registry "test(verify): restate the four sites counts of the case-completion registry"
step2 w111-fv-restate-four-pins-for-the-candidate-18-changes "test(verify): restate four pins for the candidate 18 changes"
step2 w112-fv-the-observed-critic-preflight-prints-the-producer-refusal-bytes "fix(critic): print the producer's refusal bytes in the observed Critic preflight"
step2 w113-fv-restate-four-pins-that-predate-candidate-18 "test(verify): restate four pins that predate candidate 18"
step2 w114-fv-extend-the-case-completion-policies-of-eleven-suites-that-candidate-18-grew "test(verify): extend the case-completion policies of eleven suites that candidate 18 grew"
# The derived files, in one step: backlog ledger transitions, inventory baseline (needs the HEAD of the source commit above), Reader inputs.
node scripts/refresh-derived-files.mjs
git add -A -- docs plugins/pipeline-core backlog
git diff --cached --quiet || git commit --no-verify -m "chore(inventory): refresh the derived files after the candidate 18 fixes (ledger, inventory baseline, Reader inputs)" -m $'AI-Assisted: true\nDispatch: stage-0 (elephant)'
echo "derived files refreshed"
git log --oneline -10
git status --short
