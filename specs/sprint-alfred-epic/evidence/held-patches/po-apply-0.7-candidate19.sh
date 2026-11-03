#!/usr/bin/env bash
# Candidate 19 apply script (grows while candidate 19 is built; each held patch is one commit, in this order, then the derived files in ONE follow-up commit through
# scripts/refresh-derived-files.mjs). PO terminal, repository root. Plan: specs/sprint-alfred-epic/plans/candidate-19-plan-2026-11-02.md
#   w115  the g23-read-help and agy-item-delivery suites no longer depend on the checkout location
#   w116  the draft inspection refuses an uncovered design scope before the PO signs (C18-12 follow-up)
#   w117  a bound-document drift names its cause and its two typed exits (C19-G3)
#   w119  the Full Verify keeps bounded logs of red suites and can resume an interrupted run
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
step2 w116-c18-12-the-draft-inspection-refuses-an-uncovered-design-scope-before-the-po-signs "feat(architecture): refuse an uncovered design scope on the draft, before the PO signs"
step2 w117-c19-g3-a-drift-that-a-typed-command-lifts-is-never-worded-as-a-block "fix(continuity): name the cause and the two typed exits of a bound-document drift instead of reading as a dead end"
step2 w119-c19-the-full-verify-keeps-red-suite-logs-and-resumes-from-its-journal "feat(verify): keep bounded logs of red suites and resume an interrupted Full Verify from its journal"
# The derived files, in one step: backlog ledger transitions, inventory baseline (needs the HEAD of the source commit above), Reader inputs.
node scripts/refresh-derived-files.mjs
git add -A -- docs plugins/pipeline-core backlog
git diff --cached --quiet || git commit --no-verify -m "chore(inventory): refresh the derived files after candidate 19 (ledger, inventory baseline, Reader inputs)" -m $'AI-Assisted: true\nDispatch: stage-0 (elephant)'
echo "derived files refreshed"
git log --oneline -10
git status --short
