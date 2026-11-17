#!/usr/bin/env bash
# PO apply script for candidate 30g: 6 held patches exported from the build clone chain a01eda721..71d385a20
# by scripts/export-held-chain.mjs, each applied as one commit with its original subject, then the derived files in ONE follow-up commit.
# Run from the repository root with a clean tree: bash <this script>
# Idempotent: a patch whose exact subject is already in the history of HEAD is skipped. `git apply --index` stages exactly the
# files each patch touches (root files such as pipeline.user.yaml included), so nothing else in the tree is swept in.
set -euo pipefail
H=specs/sprint-alfred-epic/evidence/held-patches/candidate30g
step() {
  local subjects
  subjects=$(git log --format=%s)
  if grep -Fxq -- "$2" <<<"$subjects"; then echo "already applied $1"; return 0; fi
  git apply --binary --index "$H/$1.patch"
  git commit --no-verify -F "$H/$1.msg"
  echo "applied $1"
}
step 01-52e6c926b 'feat(close): the human acceptance accepts plainly positive answers on a closed list'
step 02-10064a8c8 'fix(critic): CCA-MANIFEST-READ names --successor-of for a feature that replaces a discarded one'
step 03-b27dd1e66 'test(critic): restate the pinned digest of the CCA-MANIFEST-READ repair text'
step 04-46110ca20 'fix(close): a refused Result close names its cause, the owner route carries the entry text and the one-shot names an unclosable Result before Verify'
step 05-14ff57be6 'fix(close): the close leftovers have a recovery and every one-shot stop names a runnable step'
step 06-71d385a20 'fix(recovery): every refusal after a plugin reload names its one recovery and the attestation readback says what differs'

node scripts/refresh-derived-files.mjs
git add -A -- docs plugins/pipeline-core backlog
git diff --cached --quiet || git commit --no-verify -m 'chore(inventory): refresh the derived files after candidate 30g (ledger, inventory baseline, Reader inputs)' -m "AI-Assisted: true" -m "Dispatch: stage-0 (elephant)"
echo "derived files refreshed"
git log --oneline -5
git status --short
