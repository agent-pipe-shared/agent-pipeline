#!/usr/bin/env bash
# PO apply script for candidate30d: 11 held patches exported from the build clone chain 9857a43c5..445cd15e7
# by scripts/export-held-chain.mjs, each applied as one commit with its original subject, then the derived files in ONE follow-up commit.
# Run from the repository root with a clean tree: bash <this script>
# Idempotent: a patch whose exact subject is already in the history of HEAD is skipped. `git apply --index` stages exactly the
# files each patch touches (root files such as pipeline.user.yaml included), so nothing else in the tree is swept in.
set -euo pipefail
H=specs/sprint-alfred-epic/evidence/held-patches/candidate30d
step() {
  local subjects
  subjects=$(git log --format=%s)
  if grep -Fxq -- "$2" <<<"$subjects"; then echo "already applied $1"; return 0; fi
  git apply --binary --index "$H/$1.patch"
  git commit --no-verify -F "$H/$1.msg"
  echo "applied $1"
}
step 01-070dce1f7 'fix(push): the audit-proof follow-up admits every push proof the store holds for the approved commit'
step 02-7ea6b1f9e 'fix(agy): the take-over names the one-call route and forwards the briefing and hand-back files'
step 03-00370e46e 'fix(dispatch): the Antigravity Critic briefing asks for the session'"'"'s concrete model id, not the word inherit'
step 04-25829a327 'fix(architecture): the successor of a discarded feature materializes its signed design'
step 05-93acad736 'feat(close): a first sentence on the closed yes list accepts, the rest is recorded and never read'
step 06-0501094ac 'fix(critic): a delta request that makes the next round a full round needs the Coordinator'"'"'s explicit yes'
step 07-2f5bb9c60 'fix(critic): the diagnostic refusal names the order trap and the way out'
step 08-daadc6790 'feat(close): the one-shot close binds the Continuity Result itself when it needs agent authority only'
step 09-c8e795d23 'feat(dispatch): a filled Critic briefing is handed to the Critic as a verified pointer'
step 10-97582a9fb 'docs(critic): the full-round cost of a delta request and the pointer item reach the canonical template, the protected pins follow'
step 11-445cd15e7 'test(close): the real one-shot walk expects the close to bind the Result itself'

node scripts/refresh-derived-files.mjs
git add -A -- docs plugins/pipeline-core backlog
git diff --cached --quiet || git commit --no-verify -m 'chore(inventory): refresh the derived files after candidate30d (ledger, inventory baseline, Reader inputs)' -m "AI-Assisted: true" -m "Dispatch: stage-0 (elephant)"
echo "derived files refreshed"
git log --oneline -5
git status --short
