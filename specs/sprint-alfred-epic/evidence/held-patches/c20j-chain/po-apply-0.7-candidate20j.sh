#!/usr/bin/env bash
# PO apply script for 20j (all three greenfield transcripts, implementation entry gate): 18 held patches exported from the build clone chain dc40e9cc4..4bd6b287d
# by scripts/export-held-chain.mjs, each applied as one commit with its original subject, then the derived files in ONE follow-up commit.
# Run from the repository root with a clean tree: bash <this script>
# Idempotent: a patch whose exact subject is already in the history of HEAD is skipped. `git apply --index` stages exactly the
# files each patch touches (root files such as pipeline.user.yaml included), so nothing else in the tree is swept in.
set -euo pipefail
H=specs/sprint-alfred-epic/evidence/held-patches/c20j-chain
step() {
  local subjects
  subjects=$(git log --format=%s)
  if grep -Fxq -- "$2" <<<"$subjects"; then echo "already applied $1"; return 0; fi
  git apply --binary --index "$H/$1.patch"
  git commit --no-verify -F "$H/$1.msg"
  echo "applied $1"
}
step 01-5aac018eb 'fix(onboarding): regenerate a bound design input that holds a private identifier'
step 02-b026fc06f 'test(verify): register the guard cases of the recapture verb'
step 03-9bfcc2c2f 'fix(onboarding): name the review receipts in the recapture next step and prove the onboarding status holds'
step 04-b9bb02e06 'feat(lifecycle): one implementation entry gate that reports every open point before the signature and at set-phase'
step 05-9c96ff467 'fix(lifecycle): the entry gate names paths and the cancel route, and submit-plan refuses an uncommitted PRD or Spec'
step 06-9d6f19ee0 'fix(design): the binding step refuses an ignored or identifier-bearing selection, and a receipt refuses a report bound to other bytes'
step 07-80bb31820 'fix(dispatch): the Antigravity briefing names its route model and a correctable dispatch refusal gets a typed correction'
step 08-c97b1f151 'fix(guard): read-only diagnostics are admitted by name, and a commit message refusal offers no override'
step 09-791b9d865 'fix(lifecycle): the signature wait outlasts a human step, main-module guards work on Windows, and a route refusal lists the routes'
step 10-8fe09fd5e 'fix(lifecycle): the registrar rebuilds a manifest that lists only earlier approvals of the feature'
step 11-44f9d44a3 'fix(antigravity): name the flat dispatch request, the host'"'"'s branch refusal and the exact recovery read'
step 12-704cc8910 'fix(guard): the generated Codex files are committable, a lifecycle refusal is not called a message fault, and a refusal before the signature names the agent'"'"'s way back'
step 13-c76bb3bfe 'fix(dispatch): an Antigravity record lands only what a taken-over child branch delivered'
step 14-5abcfe2f4 'fix(lifecycle): held answers are used, seal and receipt instructions agree, a Windows access conflict is retried, and hand-written receipts offer no override'
step 15-7e87d39c5 'test(verify): register the eleventh dispatch-select case'
step 16-767e52627 'fix(design): routes and findings are named honestly, digests refresh once, the planned surface ignores compounds and design records, and refusal texts say what to do'
step 17-784cade21 'docs(onboarding): the seeded manifest names the signature and materialization steps'
step 18-4bd6b287d 'test(lifecycle): a later reopen keeps its own time, and the bare ADR refresh is admitted'

node scripts/refresh-derived-files.mjs
git add -A -- docs plugins/pipeline-core backlog
git diff --cached --quiet || git commit --no-verify -m 'chore(inventory): refresh the derived files after 20j (all three greenfield transcripts, implementation entry gate) (ledger, inventory baseline, Reader inputs)' -m "AI-Assisted: true" -m "Dispatch: stage-0 (elephant)"
echo "derived files refreshed"
git log --oneline -5
git status --short
