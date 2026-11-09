#!/usr/bin/env bash
# PO apply script for candidate 22: 39 held patches exported from the build clone chain 91b08e8f3..dd01a4007
# by scripts/export-held-chain.mjs, each applied as one commit with its original subject, then the derived files in ONE follow-up commit.
# Run from the repository root with a clean tree: bash <this script>
# Idempotent: a patch whose exact subject is already in the history of HEAD is skipped. `git apply --index` stages exactly the
# files each patch touches (root files such as pipeline.user.yaml included), so nothing else in the tree is swept in.
set -euo pipefail
H=specs/sprint-alfred-epic/evidence/held-patches/c22-chain
step() {
  local subjects
  subjects=$(git log --format=%s)
  if grep -Fxq -- "$2" <<<"$subjects"; then echo "already applied $1"; return 0; fi
  git apply --binary --index "$H/$1.patch"
  git commit --no-verify -F "$H/$1.msg"
  echo "applied $1"
}
step 01-112faa585 'fix(close): name the Critic-bound push Verify at closed-local so push-init does not stop on a missing file'
step 02-ac727af4d 'feat(guard): say at the edit that an approved architecture file drifts, and name the permitted route'
step 03-c3d1aec33 'fix(close): a rerun rolls back its own outputs of an earlier attempt instead of stopping on a dirty tree'
step 04-8b94927fc 'fix(close): replace a Critic addendum that no longer binds when exactly one receipt covers the record'
step 05-238aaa132 'fix(push): name the wait for a human signature as a stop, so a run does not poll for it'
step 06-ef122e2b5 'fix(forensics): end a Codex turn at its own task_complete and report the tools a code-mode script calls'
step 07-92d329b97 'feat(security): block a skipped scanner in a critical project unless a named expiring exception was recorded'
step 08-bbef80af4 'docs(close-feature): name the exception route for a critical scanner that did not run'
step 09-d787e8367 'fix(security): a named scanner exception counts only as HEAD holds it, so one written at the close admits nothing'
step 10-4ea74e925 'feat(state): name a missing security scanner before the signature and at implementation entry, so it is installed then'
step 11-a47bfbd3f 'fix(readiness): hand over the proof wait at push-init, name a missing active feature at regrounding, warn about a synchronised key folder'
step 12-d92330525 'feat(codex): project a second Critic role critic-high-risk and accept it for the Source return'
step 13-cea76d1bc 'test(codex): restate the pinned owned-target lists and add the tracked critic-high-risk role file'
step 14-d59cc8ff1 'feat(codex): give both Critic roles a read-only sandbox with a launch route that always ends in a running Critic'
step 15-505f053ad 'test(codex): restate the owned-key and agent-count pins for the sandboxed Critic roles'
step 16-6fa9369d0 'feat(guard): admit exactly the unquoted tree read and register the Critic launch route suite'
step 17-ccfa24643 'docs(obligations): record the retry habits, the guard limit and the one-time push credential question'
step 18-7f45c41b0 'feat(close): ask the human acceptance once, hash the effects the close touched, close the handover and carry every Critic report'
step 19-7b3b59dd9 'docs(close): describe the acceptance question and regenerate the close runbooks'
step 20-125620a27 'test(dispatch): restate the pinned per-grant limit at 40'
step 21-888946f70 'feat(push): report an unfilled threat model and a stale repository mode at push preparation'
step 22-970fb5171 'feat(security): show which rules each scanner really ran and what the v2 plan source means'
step 23-59bff2101 'feat(antigravity): name the untracked files before a branch workspace is prepared'
step 24-3ebc9843c 'feat(close): an Antigravity close takes its only session descriptor as its own and names several'
step 25-ff06ff7bb 'fix(rigor): name unknown inputs apart from triggers, supply protected identity and untracked line counts; record open minors in the handover'
step 26-bb6a62bb8 'fix(critic): state the requested effort as a request and the applied effort as not observed'
step 27-7b4531c3d 'test(rigor): restate the untracked-count pin in place with its reason'
step 28-4a82e6160 'feat(critic): name unreviewed corrections at the design signature, hand over ready Critic releases, settle a resumed child and explain a lock-refused start'
step 29-aa9052e9d 'fix(critic): sync the copied coverage advisory with the close'"'"'s own addendum route'
step 30-287a1d398 'feat(close): list the open minors of the bound Critic round in the handover and name them in the close result'
step 31-9dd9f85e8 'feat(critic): state the assurance of the planned Critic route and its close acknowledgement before dispatch'
step 32-3fcac3833 'test(close): walk the one-shot close CLI on the real fixture through the acceptance stop, the close commits and the resume'
step 33-dfc709e2d 'feat(recovery): record per-answer effort from runner events, unobserved where not recorded'
step 34-0855bc654 'feat(architecture): label every architecture verdict with candidate, date, scope, effect and currency'
step 35-bef829151 'fix(architecture): keep the wall clock out of the byte-compared bootstrap orientation'
step 36-cc81e42c6 'chore(verify): register the new suites of candidate 22'
step 37-85133f151 'chore(inventory): categorize the five verify suites added for candidate 22'
step 38-a71cd51a1 'test(preflight): pin the plugin list in the trusted Windows custody case'
step 39-dd01a4007 'test(verify): restate the completion pin for the candidate 22 suites'

node scripts/refresh-derived-files.mjs
git add -A -- docs plugins/pipeline-core backlog
git diff --cached --quiet || git commit --no-verify -m 'chore(inventory): refresh the derived files after candidate 22 (ledger, inventory baseline, Reader inputs)' -m "AI-Assisted: true" -m "Dispatch: stage-0 (elephant)"
echo "derived files refreshed"
git log --oneline -5
git status --short
