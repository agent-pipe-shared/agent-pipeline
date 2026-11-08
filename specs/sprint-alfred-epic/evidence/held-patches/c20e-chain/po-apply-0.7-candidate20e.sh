#!/usr/bin/env bash
# PO apply script for candidate 20e: 9 held patches exported from the build clone chain 2c0ac6572..062b616c5
# by scripts/export-held-chain.mjs, each applied as one commit with its original subject, then the derived files in ONE follow-up commit.
# Run from the repository root with a clean tree: bash <this script>
# Idempotent: a patch whose exact subject is already in the history of HEAD is skipped. `git apply --index` stages exactly the
# files each patch touches (root files such as pipeline.user.yaml included), so nothing else in the tree is swept in.
set -euo pipefail
H=specs/sprint-alfred-epic/evidence/held-patches/c20e-chain
step() {
  local subjects
  subjects=$(git log --format=%s)
  if grep -Fxq -- "$2" <<<"$subjects"; then echo "already applied $1"; return 0; fi
  git apply --binary --index "$H/$1.patch"
  git commit --no-verify -F "$H/$1.msg"
  echo "applied $1"
}
step 1-68bd9b5bd 'fix(dispatch): a dispatch without a model names its own agent type'"'"'s duty selector, not the implementation default (G20-70)'
step 2-c08c59ca6 'fix(dispatch): the model-missing repair for an Opus Critic route names the MP-07 batch scope and rationale lines (G20-70)'
step 3-a1222fc42 'fix(dispatch-budget): the checkpoint notice carries the exact grant line and the grant script answers --help (G20-73)'
step 4-c17db9404 'fix(dispatch-briefing): the briefing names the obligations file that exists for the project (G20-75)'
step 5-3bb6420ac 'feat(critic): the Critic preflight prints the complete admit request and the MP-07 lines of an Opus route (G20-69, G20-71)'
step 6-6661a072c 'feat(audit): the push and release approval proofs reach the audit bundle in one evidence-only follow-up commit, each bound by digest to the private store record'
step 7-54cf9fabb 'fix(pipeline-core): the signature wait counts a proof only for the expected subject (G20-76)'
step 8-f97587351 'feat(critic): a review range too large for one Critic is split per module, and one Source return per child ends in one source-issued verdict (G20-72)'
step 9-062b616c5 'test(verify): the case registry follows the candidate 20e suites (eight preflight cases, four measured counts, one converted suite; QG-04 restated in place)'

node scripts/refresh-derived-files.mjs
git add -A -- docs plugins/pipeline-core backlog
git diff --cached --quiet || git commit --no-verify -m 'chore(inventory): refresh the derived files after candidate 20e (ledger, inventory baseline, Reader inputs)' -m "AI-Assisted: true" -m "Dispatch: stage-0 (elephant)"
echo "derived files refreshed"
git log --oneline -5
git status --short
