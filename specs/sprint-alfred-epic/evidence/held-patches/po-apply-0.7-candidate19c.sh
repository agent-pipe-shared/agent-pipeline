#!/usr/bin/env bash
# Candidate 19c apply script (grows while the rest of candidate 19 is built on top of the stamped interim candidate 19a, commit 6193380d0; each held patch is one commit, in this
# order, then the derived files in ONE follow-up commit through scripts/refresh-derived-files.mjs). PO terminal, repository root.
# Plan: specs/sprint-alfred-epic/plans/candidate-19-plan-2026-11-02.md, section "PO decisions of the 2026-11-04 sitting".
#   w165  a pending-unavailable Goldfish stop failure names its cause and the recover helper plan and apply command (E1 text part; Windows greenfield)
# Run with: bash specs/sprint-alfred-epic/evidence/held-patches/po-apply-0.7-candidate19c.sh   (repository root, clean tree, HEAD = the commit that carries this script)
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
step2 w165-e1-a-pending-unavailable-stop-failure-names-its-cause-and-the-recover-helper "fix(hook): a pending-unavailable Goldfish stop failure names its cause and the recover helper plan and apply command"
# The derived files, in one step: backlog ledger transitions, inventory baseline (needs the HEAD of the source commit above), Reader inputs.
node scripts/refresh-derived-files.mjs
git add -A -- docs plugins/pipeline-core backlog
git diff --cached --quiet || git commit --no-verify -m "chore(inventory): refresh the derived files after candidate 19c (ledger, inventory baseline, Reader inputs)" -m $'AI-Assisted: true\nDispatch: stage-0 (elephant)'
echo "derived files refreshed"
git log --oneline -10
git status --short
