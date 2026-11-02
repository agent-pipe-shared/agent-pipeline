#!/usr/bin/env bash
# Candidate 19 apply script (grows while candidate 19 is built; each held patch is one commit, in this order, then the derived files in ONE follow-up commit through
# scripts/refresh-derived-files.mjs). PO terminal, repository root. Plan: specs/sprint-alfred-epic/plans/candidate-19-plan-2026-11-02.md
#   w115  the g23-read-help and agy-item-delivery suites no longer depend on the checkout location
# Afterwards the Elephant stamps, and the PO installs (only on the PO's word).
# Run with: bash specs/sprint-alfred-epic/evidence/held-patches/po-apply-0.7-candidate19.sh   (repository root, clean tree, HEAD = the commit that carries this script)
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
step2 w115-fv-make-the-g23-read-help-and-agy-item-delivery-suites-independent-of-the-checkout-location "test(verify): make the g23 read-help and agy item delivery suites independent of the checkout location"
# The derived files, in one step: backlog ledger transitions, inventory baseline (needs the HEAD of the source commit above), Reader inputs.
node scripts/refresh-derived-files.mjs
git add -A -- docs plugins/pipeline-core backlog
git diff --cached --quiet || git commit --no-verify -m "chore(inventory): refresh the derived files after candidate 19 (ledger, inventory baseline, Reader inputs)" -m $'AI-Assisted: true\nDispatch: stage-0 (elephant)'
echo "derived files refreshed"
git log --oneline -10
git status --short
