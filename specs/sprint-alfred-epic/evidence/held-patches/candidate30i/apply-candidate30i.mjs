#!/usr/bin/env bash
# PO apply script for candidate 30i: 11 held patches exported from the build clone chain 6d8226f72..69ac37983
# by scripts/export-held-chain.mjs, each applied as one commit with its original subject, then the derived files in ONE follow-up commit.
# Run from the repository root with a clean tree: bash <this script>
# Idempotent: a patch whose exact subject is already in the history of HEAD is skipped. `git apply --index` stages exactly the
# files each patch touches (root files such as pipeline.user.yaml included), so nothing else in the tree is swept in.
set -euo pipefail
H=specs/sprint-alfred-epic/evidence/held-patches/candidate30i
step() {
  local subjects
  subjects=$(git log --format=%s)
  if grep -Fxq -- "$2" <<<"$subjects"; then echo "already applied $1"; return 0; fi
  git apply --binary --index "$H/$1.patch"
  git commit --no-verify -F "$H/$1.msg"
  echo "applied $1"
}
step 01-3d0937929 'fix(skills): the three oversized shipped skills fit the 24000-byte body limit the Antigravity runner loads'
step 02-44ba7db23 'fix(antigravity): the runner view marks every shipped Pipeline agent as a subagent only and pins the inherited defaults'
step 03-0fb8a98db 'fix(continuity): a bound session can run the advancing State entries end to end'
step 04-0909956b1 'feat(registration): feature package registration can record the discarded predecessor a successor replaces'
step 05-aee202b69 'fix(approval): a mistyped passphrase or an ended ceremony no longer blocks the next signature entry'
step 06-94e0aa9f2 'fix(close): a close resumed after a move-aside keeps its resume behaviour and a stale manifest names the PO-signed reconcile route'
step 07-0cae29aeb 'fix(guard): the one-command commit with trailers is read as Git writes it and every refusal teaches it first'
step 08-af69eb9ec 'docs(plans): state machine simplification analysis and staged plan'
step 09-511f8f66c 'fix(obligations): the generated agent obligations teach the one-command commit and state the guard-push limit exactly'
step 10-6df52f018 'feat(approval): the attended signature confirmation opens with a plain-language card of what is signed'
step 11-69ac37983 'docs(plans): the state machine analysis carries its last refinement'

node scripts/refresh-derived-files.mjs
git add -A -- docs plugins/pipeline-core backlog
git diff --cached --quiet || git commit --no-verify -m 'chore(inventory): refresh the derived files after candidate 30i (ledger, inventory baseline, Reader inputs)' -m "AI-Assisted: true" -m "Dispatch: stage-0 (elephant)"
echo "derived files refreshed"
git log --oneline -5
git status --short
