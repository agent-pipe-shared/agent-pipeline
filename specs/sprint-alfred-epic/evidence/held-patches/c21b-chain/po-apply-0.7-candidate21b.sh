#!/usr/bin/env bash
# PO apply script for candidate 21b: 17 held patches exported from the build clone chain cf73ce22d..b4cb894a8
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
step 01-33ad1664d 'fix(critic): send a verdict-less Antigravity Critic message back once so the close needs no PO signature'
step 02-6fc14c118 'fix(close): stop before Verify when no Result is bound and name the exact repair for caller-authored Critics and proof refusals'
step 03-3e05ccd30 'fix(security): use the repo-root Gitleaks ruleset only in the source checkout, never a stray file above an installed plugin'
step 04-3c66bfa27 'fix(critic): refuse a misplaced Verify evidence path before the capture and say what to do'
step 05-1456959c0 'fix(pipeline): bind the caller-authored Critic acknowledgement to the reviewed candidate'
step 06-b993152ad 'fix(critic): issue no Source return for a verdict that contradicts its own pass'
step 07-a3825286c 'fix(critic): accept punctuation after a split scope marker'
step 08-b521e3558 'fix(pipeline-core): admit a Goldfish return wrapped in one fence around the whole message'
step 09-77d3ca163 'fix(dispatch-budget): keep the copied grant line within the per-grant limit'
step 10-e736962ae 'fix(dispatch-budget): restate the native return contract when a child resumes on a grant'
step 11-6801a5ebc 'fix(critic): a released first round no longer blocks the corrected candidate, and a batch refusal prints its repair'
step 12-fccd736d2 'test(critic): register the released-round takeover case'
step 13-740753e7e 'test(critic): pin the rename direction the correction derivation still refuses'
step 14-9f2367dcd 'test(critic): walk a released round through the takeover to the corrected candidate'
step 15-6441c3dfd 'fix(pipeline): name the cause of a refused proof on approve-push and the residual acceptance'
step 16-9c94fa928 'test(pipeline): pin the proof refusal cause on approve-push'
step 17-b4cb894a8 'fix(guard-push): name the spellings that read a commit when a marker refuses one'

node scripts/refresh-derived-files.mjs
git add -A -- docs plugins/pipeline-core backlog
git diff --cached --quiet || git commit --no-verify -m 'chore(inventory): refresh the derived files after candidate 21b (ledger, inventory baseline, Reader inputs)' -m "AI-Assisted: true" -m "Dispatch: stage-0 (elephant)"
echo "derived files refreshed"
git log --oneline -5
git status --short
