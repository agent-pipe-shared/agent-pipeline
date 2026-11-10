#!/usr/bin/env bash
# PO apply script for candidate 24: 25 held patches exported from the build clone chain 31f3b1816..d3a1009ae
# by scripts/export-held-chain.mjs, each applied as one commit with its original subject, then the derived files in ONE follow-up commit.
# Run from the repository root with a clean tree: bash <this script>
# Idempotent: a patch whose exact subject is already in the history of HEAD is skipped. `git apply --index` stages exactly the
# files each patch touches (root files such as pipeline.user.yaml included), so nothing else in the tree is swept in.
set -euo pipefail
H=specs/sprint-alfred-epic/evidence/held-patches/candidate24
step() {
  local subjects
  subjects=$(git log --format=%s)
  if grep -Fxq -- "$2" <<<"$subjects"; then echo "already applied $1"; return 0; fi
  git apply --binary --index "$H/$1.patch"
  git commit --no-verify -F "$H/$1.msg"
  echo "applied $1"
}
step 01-1279a2e25 'fix(close): stop a one-shot close early on a Critic round that did not pass and name the way out'
step 02-9447defea 'fix(windows): treat forward and back slashes in a started script path as one file'
step 03-1473ff494 'fix(close): keep the Critic packet in every printed resume command'
step 04-91172b8c7 'fix(close): name the proof flags and their preparation in the Critic stop'
step 05-0981c45ca 'fix(architecture): say what a boundary verdict cannot see and why a drifted map is not missing'
step 06-c9effa961 'docs(approval): list the residual acceptance form in the approval usage'
step 07-a51908c73 'fix(architecture): state what a drifted map affects and pin it on a real drifted design'
step 08-ca623cce8 'feat(review): ask for the first complete path and a real run before acceptance'
step 09-4d8b16a03 'docs(backlog): record the complete forensic export decided for after the release'
step 10-d02009e98 'fix(rebind): let an approval outlive a routing change in the generated runtime manifest'
step 11-111b8046e 'feat(dispatch): prepare a Goldfish or Critic dispatch with one command'
step 12-0490d8612 'fix(dispatch): keep a filled Critic request and refuse evidence of another candidate'
step 13-32eca5233 'fix(architecture): say what the drift finding does not stop'
step 14-86c103b62 'fix(dispatch): let the preflight derive the registration commit and show a silent step'"'"'s output'
step 15-e702f7de3 'fix(agy): let a re-dispatch claim the untracked files of its stopped predecessor'
step 16-418e99746 'fix(guard): admit the repository mode promote command in its one exact shape'
step 17-62f10e12f 'fix(guard): name a repeated option in the refusal of a read command'
step 18-f7d54355a 'fix(critic): name the repository root for Antigravity children and a local-only calibration before the round'
step 19-0c0abf245 'feat(close): state the security scope, a stale local-only calibration and which tracked digests are empty'
step 20-c81a2b2c8 'feat(architecture): name the drifted map files and whether each was committed after the design'
step 21-b73912662 'docs(close): say what a fix after a passed Critic round means and how to read an Antigravity child'"'"'s commit'
step 22-c11947fbb 'fix(guard): name a repeated option only when the repeat is the whole fault'
step 23-96b150a40 'fix(close): read the security scope from the capability outcomes a real scan writes'
step 24-cdd45e375 'fix(push): tell one story about when the repository mode commit belongs, and accept the second Antigravity marker'
step 25-d3a1009ae 'feat(push): record what the remote holds after a push, append-only and without a commit'

node scripts/refresh-derived-files.mjs
git add -A -- docs plugins/pipeline-core backlog
git diff --cached --quiet || git commit --no-verify -m 'chore(inventory): refresh the derived files after candidate 24 (ledger, inventory baseline, Reader inputs)' -m "AI-Assisted: true" -m "Dispatch: stage-0 (elephant)"
echo "derived files refreshed"
git log --oneline -5
git status --short
