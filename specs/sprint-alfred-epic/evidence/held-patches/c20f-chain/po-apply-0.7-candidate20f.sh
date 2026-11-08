#!/usr/bin/env bash
# PO apply script for candidate 20f Critic split and operating model: 4 held patches exported from the build clone chain b6a95bb78..00de20c87
# by scripts/export-held-chain.mjs, each applied as one commit with its original subject, then the derived files in ONE follow-up commit.
# Run from the repository root with a clean tree: bash <this script>
# Idempotent: a patch whose exact subject is already in the history of HEAD is skipped. `git apply --index` stages exactly the
# files each patch touches (root files such as pipeline.user.yaml included), so nothing else in the tree is swept in.
set -euo pipefail
H=specs/sprint-alfred-epic/evidence/held-patches/c20f-chain
step() {
  local subjects
  subjects=$(git log --format=%s)
  if grep -Fxq -- "$2" <<<"$subjects"; then echo "already applied $1"; return 0; fi
  git apply --binary --index "$H/$1.patch"
  git commit --no-verify -F "$H/$1.msg"
  echo "applied $1"
}
step 1-cf9277aae 'fix(critic): a split without a module plan or with a very large module is cut along directories, so no entry is larger than one Critic can read (G20-72 live measurement)'
step 2-5bf5dd484 'test(verify): the case registry follows the split fallback (one new preflight case, one measured count restated under QG-04)'
step 3-9a7494259 'fix(critic): a split leaves out exactly the bound exclusions and allows 256 entries, and a range above that is refused before anything is reserved'
step 4-00de20c87 'docs(operating-model): test_author is a route key, not a separate role; one Goldfish writes the tests first in the same dispatch'

node scripts/refresh-derived-files.mjs
git add -A -- docs plugins/pipeline-core backlog
git diff --cached --quiet || git commit --no-verify -m 'chore(inventory): refresh the derived files after candidate 20f Critic split and operating model (ledger, inventory baseline, Reader inputs)' -m "AI-Assisted: true" -m "Dispatch: stage-0 (elephant)"
echo "derived files refreshed"
git log --oneline -5
git status --short
