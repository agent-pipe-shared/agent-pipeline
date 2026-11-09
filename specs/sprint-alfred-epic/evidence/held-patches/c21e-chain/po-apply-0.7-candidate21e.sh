#!/usr/bin/env bash
# PO apply script for candidate 21e: 4 held patches exported from the build clone chain ce02fb438..09b5bcaf4
# by scripts/export-held-chain.mjs, each applied as one commit with its original subject, then the derived files in ONE follow-up commit.
# Run from the repository root with a clean tree: bash <this script>
# Idempotent: a patch whose exact subject is already in the history of HEAD is skipped. `git apply --index` stages exactly the
# files each patch touches (root files such as pipeline.user.yaml included), so nothing else in the tree is swept in.
set -euo pipefail
H=specs/sprint-alfred-epic/evidence/held-patches/c21e-chain
step() {
  local subjects
  subjects=$(git log --format=%s)
  if grep -Fxq -- "$2" <<<"$subjects"; then echo "already applied $1"; return 0; fi
  git apply --binary --index "$H/$1.patch"
  git commit --no-verify -F "$H/$1.msg"
  echo "applied $1"
}
step 01-42b4d9a52 'fix(close): derive the closing Antigravity conversation from a record of its pretool hook'
step 02-521063688 'fix(close): write the Critic addenda before Verify in the one-shot close'
step 03-c753b216e 'fix(close): carry the evidence index and the Critic acknowledgement proof in the audit bundle'
step 04-09b5bcaf4 'fix(close): name the uncommitted paths at the acknowledgement stop before the PO is asked to sign'

node scripts/refresh-derived-files.mjs
git add -A -- docs plugins/pipeline-core backlog
git diff --cached --quiet || git commit --no-verify -m 'chore(inventory): refresh the derived files after candidate 21e (ledger, inventory baseline, Reader inputs)' -m "AI-Assisted: true" -m "Dispatch: stage-0 (elephant)"
echo "derived files refreshed"
git log --oneline -5
git status --short
