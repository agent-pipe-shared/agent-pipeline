#!/usr/bin/env bash
# PO apply script for candidate 22b: 9 held patches exported from the build clone chain 8627df377..133352788
# by scripts/export-held-chain.mjs, each applied as one commit with its original subject, then the derived files in ONE follow-up commit.
# Run from the repository root with a clean tree: bash <this script>
# Idempotent: a patch whose exact subject is already in the history of HEAD is skipped. `git apply --index` stages exactly the
# files each patch touches (root files such as pipeline.user.yaml included), so nothing else in the tree is swept in.
set -euo pipefail
H=specs/sprint-alfred-epic/evidence/held-patches/c22b-chain
step() {
  local subjects
  subjects=$(git log --format=%s)
  if grep -Fxq -- "$2" <<<"$subjects"; then echo "already applied $1"; return 0; fi
  git apply --binary --index "$H/$1.patch"
  git commit --no-verify -F "$H/$1.msg"
  echo "applied $1"
}
step 01-966465574 'fix(preflight): drop the cloud-folder key warning and stop the false registry alarm after compact'
step 02-1b2449228 'feat(security): discount scanner matches on generated digest fields and print the count'
step 03-12891c084 'fix(architecture): let the blocking check decide and show the stored view beside it'
step 04-0d6ee7e04 'test(signature): prove the critical action signature round trip per command'
step 05-884e19c3f 'feat(calibration): promote the repository mode to remote-tracked with one narrow command'
step 06-1d2f362cd 'fix(close): report product and evidence commits separately in the close result and audit bundle'
step 07-e99be7c27 'fix(guard): close the protected kernel list over the candidate 22 imports'
step 08-814aa4c62 'chore(verify): register the candidate 22b test suites'
step 09-133352788 'feat(guard): admit a short-flag cluster of rg and grep when every flag in it is admitted on its own'

node scripts/refresh-derived-files.mjs
git add -A -- docs plugins/pipeline-core backlog
git diff --cached --quiet || git commit --no-verify -m 'chore(inventory): refresh the derived files after candidate 22b (ledger, inventory baseline, Reader inputs)' -m "AI-Assisted: true" -m "Dispatch: stage-0 (elephant)"
echo "derived files refreshed"
git log --oneline -5
git status --short
