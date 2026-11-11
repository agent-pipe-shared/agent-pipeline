#!/usr/bin/env bash
# PO apply script for candidate 28: 43 held patches exported from the build clone chain c9f50c10c..a795c822e
# by scripts/export-held-chain.mjs, each applied as one commit with its original subject, then the derived files in ONE follow-up commit.
# Run from the repository root with a clean tree: bash <this script>
# Idempotent: a patch whose exact subject is already in the history of HEAD is skipped. `git apply --index` stages exactly the
# files each patch touches (root files such as pipeline.user.yaml included), so nothing else in the tree is swept in.
set -euo pipefail
H=specs/sprint-alfred-epic/evidence/held-patches/candidate28
step() {
  local subjects
  subjects=$(git log --format=%s)
  if grep -Fxq -- "$2" <<<"$subjects"; then echo "already applied $1"; return 0; fi
  git apply --binary --index "$H/$1.patch"
  git commit --no-verify -F "$H/$1.msg"
  echo "applied $1"
}
step 01-70d707096 'fix(verify): bring the case-completion policies of 18 suites up to their declared cases'
step 02-9659fdc80 'fix(verify): record the in-place case-list extension of 4c37267c1'
step 03-7d79f6e22 'fix(verify): regenerate obligations and close the small registration gaps from Full Verify 27'
step 04-a1ac3f10b 'test(guard): restate seven pins that still described refusals the PO has since lifted'
step 05-26a0d6363 'test(guard): keep three host pins running against the current production shape'
step 06-d0114611d 'test(critic): keep the residual acceptance fixtures on a round that still fails'
step 07-e0171897b 'docs(backlog): quote the source of four items as JSON strings'
step 08-b88b105d8 'test(verify): keep the N22 acceptance fixture on a round that still fails'
step 09-5b3fafb60 'test(onboarding): walk the Antigravity restart stop in three onboarding tests'
step 10-7f3ac220f 'fix(security): bind the scan to the remote the current branch pushes to'
step 11-d4b52f4ae 'test(agy): give the installer fixtures the publication readback hook script'
step 12-a14579d40 'fix(state): let a reopened design reach the PO again after the first Goldfish'
step 13-14f18c420 'fix(guard): admit heal'"'"'s own flag and any spelling of the project root on Windows'
step 14-3898fb15d 'docs(skill): name the repository mode command in the push reference'
step 15-4cb0e8e9b 'fix(architecture): refresh the receipt when a reopened design is approved again'
step 16-32ee9374e 'fix(architecture): name the blocking decision finding and the retained reference'
step 17-1feaeb4a3 'fix(architecture): read only the newest retained approval of a feature'
step 18-cd619050b 'feat(guard): allow recursive deletes only in throwaway folders'
step 19-3299ba547 'fix(onboarding): write the answered Git author before the first commit'
step 20-532e3cb46 'docs(guardrails): describe the recursive delete rule and throwawayDirs'
step 21-9060f05f1 'fix(guard): stop reporting refused plugin reads as outside the project'
step 22-87267277a 'fix(guard): say why a git read with a backslash is refused as a push'
step 23-b2a72daa9 'fix(state): name the real cause when a verb needs an owning context'
step 24-602a7f00a 'test(state): carry the reopened design chain into set-phase'
step 25-bd75cf8b8 'docs(backlog): file the dispatch start queue and the design addendum for after 0.7.0'
step 26-ef24b4cfe 'docs(happy-path): see a result work yourself before handing it to the PO'
step 27-1fedd912b 'docs(happy-path): give the signing command whenever waiting for a signature'
step 28-80863abce 'fix(dispatch): name the branch workspace in an Antigravity briefing'
step 29-13e974b98 'fix(critic): keep the generated Critic prompt lines inside the Contamination Rule'
step 30-ba5533693 'fix(critic): read the Opus route cell for the runner the session really is'
step 31-9b474500a 'fix(dispatch): name Workspace "branch" in the Antigravity next step'
step 32-c49a913fb 'feat(critic): build the filled Critic briefing in prepare-dispatch'
step 33-95a7e3007 'fix(guard): keep the outside-root label for a dot-dot plugin path'
step 34-df6c5383b 'fix(guard): name the findings and the readiness block in the fitness denial'
step 35-ad2e8ecfc 'fix(close): commit an owned feature manifest only with the evidence it lists'
step 36-e86fa8dae 'fix(critic): name a damaged course history and the one way on'
step 37-2d83eb3c0 'fix(state): admit a discard with a bound Result only for a damaged Critic course'
step 38-17eae99a4 'feat(ledger): print a run timeline for all three runners'
step 39-6a7d60cf2 'docs(spec): ask recoverability and unintended valid input for data operations'
step 40-7f39c7ab1 'feat(close): route a declined acceptance back into a correction round'
step 41-2b418bede 'feat(security): widen the default rule pack and report scans honestly'
step 42-ae025902f 'feat(critic): size parts to the budget and keep reviews to their sources'
step 43-a795c822e 'feat(host-commit): warn on commits into a running Goldfish'"'"'s scope and recover idempotently'

node scripts/refresh-derived-files.mjs
git add -A -- docs plugins/pipeline-core backlog
git diff --cached --quiet || git commit --no-verify -m 'chore(inventory): refresh the derived files after candidate 28 (ledger, inventory baseline, Reader inputs)' -m "AI-Assisted: true" -m "Dispatch: stage-0 (elephant)"
echo "derived files refreshed"
git log --oneline -5
git status --short
