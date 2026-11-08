#!/usr/bin/env bash
# PO apply script for candidate 21b: 5 held patches exported from the build clone chain cf73ce22d..1456959c0
# by scripts/export-held-chain.mjs, each applied as one commit with its original subject, then the derived files in ONE follow-up commit.
# Run from the repository root with a clean tree: bash <this script>
# Idempotent: a patch whose exact subject is already in the history of HEAD is skipped. `git apply --index` stages exactly the
# files each patch touches (root files such as pipeline.user.yaml included), so nothing else in the tree is swept in.
set -euo pipefail
H=specs/sprint-alfred-epic/evidence/held-patches/c21b-chain
step() {
  local subjects
  subjects=$(git log --format=%s)
  if grep -Fxq -- "$2" <<<"$subjects"; then echo "already applied $1"; return 0; fi
  git apply --binary --index "$H/$1.patch"
  git commit --no-verify -F "$H/$1.msg"
  echo "applied $1"
}
step 1-33ad1664d 'fix(critic): send a verdict-less Antigravity Critic message back once so the close needs no PO signature'
step 2-6fc14c118 'fix(close): stop before Verify when no Result is bound and name the exact repair for caller-authored Critics and proof refusals'
step 3-3e05ccd30 'fix(security): use the repo-root Gitleaks ruleset only in the source checkout, never a stray file above an installed plugin'
step 4-3c66bfa27 'fix(critic): refuse a misplaced Verify evidence path before the capture and say what to do'
step 5-1456959c0 'fix(pipeline): bind the caller-authored Critic acknowledgement to the reviewed candidate'

node scripts/refresh-derived-files.mjs
git add -A -- docs plugins/pipeline-core backlog
git diff --cached --quiet || git commit --no-verify -m 'chore(inventory): refresh the derived files after candidate 21b (ledger, inventory baseline, Reader inputs)' -m "AI-Assisted: true" -m "Dispatch: stage-0 (elephant)"
echo "derived files refreshed"
git log --oneline -5
git status --short
