#!/usr/bin/env bash
# PO apply script for candidate 30e: 14 held patches exported from the build clone chain 05d6da38c..3c8569ed3
# by scripts/export-held-chain.mjs, each applied as one commit with its original subject, then the derived files in ONE follow-up commit.
# Run from the repository root with a clean tree: bash <this script>
# Idempotent: a patch whose exact subject is already in the history of HEAD is skipped. `git apply --index` stages exactly the
# files each patch touches (root files such as pipeline.user.yaml included), so nothing else in the tree is swept in.
set -euo pipefail
H=specs/sprint-alfred-epic/evidence/held-patches/candidate30e
step() {
  local subjects
  subjects=$(git log --format=%s)
  if grep -Fxq -- "$2" <<<"$subjects"; then echo "already applied $1"; return 0; fi
  git apply --binary --index "$H/$1.patch"
  git commit --no-verify -F "$H/$1.msg"
  echo "applied $1"
}
step 01-0a2388c19 'fix(push): the carry-forward evidence lists know the audit bundle'"'"'s real location'
step 02-f8bc44b85 'fix(resume-hint): hyphen-joined words and short numbers are not an opaque token'
step 03-e3320e793 'fix(antigravity): a native read of the pipeline-start skill consumes the bootstrap barrier'
step 04-20793081f 'fix(architecture): fitness class 1 does not count the Pipeline'"'"'s own records as module paths'
step 05-93f080688 'feat(state): a State entry the continuity authority does not admit is refused with a typed repair'
step 06-e3c3f5757 'feat(state): the continuity authority admits the two cancel entries that advance the continuity revision by one'
step 07-ec9dfea44 'feat(critic): the diagnostic accepts evidence-only follower commits behind the candidate'
step 08-89df21761 'fix(critic): the packet consumers honour a diagnostic produced behind evidence-only followers'
step 09-701bb797e 'feat(critic): admit the full review of a discarded feature'"'"'s successor over the inherited range'
step 10-61625414d 'feat(critic): the successor review route is reachable by --successor-of and consumable by the finalizer'
step 11-f3416a054 'fix(critic): the session finalizer carries the optional successorOf course input'
step 12-de6610008 'feat(security): a missing required scanner is refused at the plan gate for every project that has not opted out'
step 13-486a0c7b2 'test(security): the installed-plugin scan fixture copies the toolchain registry the plan-gate refusal now imports'
step 14-3c8569ed3 'test(verify): the case-completion policy lists the case ids the 30f suites now declare'

node scripts/refresh-derived-files.mjs
git add -A -- docs plugins/pipeline-core backlog
git diff --cached --quiet || git commit --no-verify -m 'chore(inventory): refresh the derived files after candidate 30e (ledger, inventory baseline, Reader inputs)' -m "AI-Assisted: true" -m "Dispatch: stage-0 (elephant)"
echo "derived files refreshed"
git log --oneline -5
git status --short
