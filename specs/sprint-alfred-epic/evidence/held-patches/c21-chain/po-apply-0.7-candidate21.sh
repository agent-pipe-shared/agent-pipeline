#!/usr/bin/env bash
# PO apply script for candidate 21 (live findings of the three greenfield runs, Codex association repair, read grammar): 12 held patches exported from the build clone chain 03d51f690..91e9e6991
# by scripts/export-held-chain.mjs, each applied as one commit with its original subject, then the derived files in ONE follow-up commit.
# Run from the repository root with a clean tree: bash <this script>
# Idempotent: a patch whose exact subject is already in the history of HEAD is skipped. `git apply --index` stages exactly the
# files each patch touches (root files such as pipeline.user.yaml included), so nothing else in the tree is swept in.
set -euo pipefail
H=specs/sprint-alfred-epic/evidence/held-patches/c21-chain
step() {
  local subjects
  subjects=$(git log --format=%s)
  if grep -Fxq -- "$2" <<<"$subjects"; then echo "already applied $1"; return 0; fi
  git apply --binary --index "$H/$1.patch"
  git commit --no-verify -F "$H/$1.msg"
  echo "applied $1"
}
step 01-ce89d7097 'fix(guard): admit the bare node spelling in PowerShell and refuse an unquoted subexpression'
step 02-da9abe757 'fix(guard): admit the read-only module slice proposal in draft by its exact argv'
step 03-d1ef1cd62 'fix(design): one module refusal names every invalid module and every reason with its repair'
step 04-ddd98229c 'fix(onboarding): make the answers file the default route for design question answers'
step 05-bee987d92 'feat(onboarding): stop for the Antigravity restart after creating the repository and ask the Windows rights step in the first round'
step 06-ffb383e30 'fix(preflight): the printed lock repair names the root the catalogue requires'
step 07-a5edaa1ad 'fix(antigravity): a model tier refusal names the exact value to pass'
step 08-be98b664d 'fix(verify): repair the reds of the 20j full verify run'
step 09-66e2744fc 'fix(guidance): printed next steps can be walked as printed'
step 10-6175bc2a9 'fix(session-authority): heal retires the Codex agent association of a pending state that left'
step 11-37c89bcfd 'test(onboarding): the existing-key cell follows the Antigravity restart before its first question round'
step 12-91e9e6991 'feat(guard): admit the listing and context read forms workers reach for first'

node scripts/refresh-derived-files.mjs
git add -A -- docs plugins/pipeline-core backlog
git diff --cached --quiet || git commit --no-verify -m 'chore(inventory): refresh the derived files after candidate 21 (live findings of the three greenfield runs, Codex association repair, read grammar) (ledger, inventory baseline, Reader inputs)' -m "AI-Assisted: true" -m "Dispatch: stage-0 (elephant)"
echo "derived files refreshed"
git log --oneline -5
git status --short
