#!/usr/bin/env bash
# Candidate 19m apply script (on top of the applied and stamped candidate 19l, stamp commit 0acdc1980; the held patch is one commit, then the
# derived files in ONE follow-up commit through scripts/refresh-derived-files.mjs). PO terminal, repository root.
# PO decision 2026-11-06 evening: a 19 candidate built to fix the Full Verify also carries the two minor findings of the 19l Windows run.
# Plan: specs/sprint-alfred-epic/plans/candidate-19-plan-2026-11-02.md
#   w251  the 19l Full Verify reds (doc reference, append-history witness and entry, kernel closure, inventory order, two QG-04 restatements,
#         the installed-package import under the permission model) and the two minor findings (preflight lock row, failures cause code)
# Run with: bash /absolute/path/to/specs/sprint-alfred-epic/evidence/held-patches/po-apply-0.7-candidate19m.sh   (from the repository root, clean tree, HEAD = the commit that carries this script)
set -euo pipefail
H=specs/sprint-alfred-epic/evidence/held-patches
STAGE=(.gitignore .gitleaksignore .gitleaks.toml setup.test.mjs plugins/pipeline-core harness docs scripts evidence roles templates guardrails policies schemas backlog specs)
# One held patch, one commit; the subject is given inline (GIT-03 trailers only). --no-verify is used here and nowhere else.
step2() {
  # Idempotent: a patch whose exact commit subject is already in the history of HEAD was applied by an earlier run of this script and is skipped.
  local subjects
  subjects=$(git log --format=%s)
  if grep -Fxq -- "$2" <<<"$subjects"; then echo "already applied $1"; return 0; fi
  local patch="$H/$1.patch"
  if [ -f "$H/$1.rebased.patch" ]; then patch="$H/$1.rebased.patch"; fi
  git apply "$patch"
  git add -A -- "${STAGE[@]}"
  git commit --no-verify -m "$2" -m $'AI-Assisted: true\nDispatch: stage-0 (elephant)'
  echo "applied $1"
}
step2 w251-the-19l-full-verify-reds-and-two-minor-findings "fix(verify): the 19l Full Verify reds, the preflight lock row and the failures cause code"

node scripts/refresh-derived-files.mjs
git add -A -- docs plugins/pipeline-core backlog
git diff --cached --quiet || git commit --no-verify -m "chore(inventory): refresh the derived files after candidate 19m (ledger, inventory baseline, Reader inputs)" -m $'AI-Assisted: true\nDispatch: stage-0 (elephant)'
echo "derived files refreshed"
git log --oneline -4
git status --short
