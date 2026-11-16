#!/usr/bin/env bash
# PO apply script for candidate30: 4 held patches exported from the build clone chain 5df67f885..20ab62639
# by scripts/export-held-chain.mjs, each applied as one commit with its original subject, then the derived files in ONE follow-up commit.
# Run from the repository root with a clean tree: bash <this script>
# Idempotent: a patch whose exact subject is already in the history of HEAD is skipped. `git apply --index` stages exactly the
# files each patch touches (root files such as pipeline.user.yaml included), so nothing else in the tree is swept in.
set -euo pipefail
H=specs/sprint-alfred-epic/evidence/held-patches/candidate30
step() {
  local subjects
  subjects=$(git log --format=%s)
  if grep -Fxq -- "$2" <<<"$subjects"; then echo "already applied $1"; return 0; fi
  git apply --binary --index "$H/$1.patch"
  git commit --no-verify -F "$H/$1.msg"
  echo "applied $1"
}
step 01-712872ab4 'feat(onboarding): make the consent question scannable (C30-1)'
step 02-0cd44152e 'feat(design-review): one full round and two delta rounds, blocking findings apart from questions (C30-6)'
step 03-479c30c2c 'feat(verify): tests and Verify clean up the folders they leave in the home folder (C30-5)'
step 04-20ab62639 'fix(guard): list design-review-observation as a kernel path (C30-6)'

node scripts/refresh-derived-files.mjs
git add -A -- docs plugins/pipeline-core backlog
git diff --cached --quiet || git commit --no-verify -m 'chore(inventory): refresh the derived files after candidate30 (ledger, inventory baseline, Reader inputs)' -m "AI-Assisted: true" -m "Dispatch: stage-0 (elephant)"
echo "derived files refreshed"
git log --oneline -5
git status --short
