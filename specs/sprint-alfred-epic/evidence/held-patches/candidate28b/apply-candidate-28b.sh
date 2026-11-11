#!/usr/bin/env bash
# PO apply script for candidate 28b: 18 held patches exported from the build clone chain 946dd2ea2..f2b2bc9c8
# by scripts/export-held-chain.mjs, each applied as one commit with its original subject, then the derived files in ONE follow-up commit.
# Run from the repository root with a clean tree: bash <this script>
# Idempotent: a patch whose exact subject is already in the history of HEAD is skipped. `git apply --index` stages exactly the
# files each patch touches (root files such as pipeline.user.yaml included), so nothing else in the tree is swept in.
set -euo pipefail
H=specs/sprint-alfred-epic/evidence/held-patches/candidate28b
step() {
  local subjects
  subjects=$(git log --format=%s)
  if grep -Fxq -- "$2" <<<"$subjects"; then echo "already applied $1"; return 0; fi
  git apply --binary --index "$H/$1.patch"
  git commit --no-verify -F "$H/$1.msg"
  echo "applied $1"
}
step 01-43c8d3d8d 'feat(critic): lift the Critic turn limit to 100 and keep the part size derived from it'
step 02-db712b77b 'feat(architecture): refuse unbound ADR drafts at submit-plan, link accepted ADRs and warn on a first module cut without a vertical slice'
step 03-5ee7abc41 'feat(close): project the dispatch records into the audit bundle, show four status facts and flag a lagging queue head'
step 04-7be285d15 'fix(guard): refuse credential reads through find, sed and the hash tools alike, admit registered suites in a design draft and stop offering a signature for refused help and read compositions'
step 05-00ec74e0b 'feat(onboarding): ask the Advisor consent inside the first question, probe the host route before the mutating init, ask all missing fields at once and remember the push transport'
step 06-8424ec797 'fix(guard): admit the push transport answer of push-init and the ADR draft discard of create-adr in their closed shapes'
step 07-f714838f3 'fix(state): count the PRD in HEAD from the direct entries of the feature directory and read the audit index with a large buffer'
step 08-6e2227eb8 'fix(host-commit): admit a history that mixes proven sibling commits and ordinary commits, and extend the stop-pair case policy to its declared cases'
step 09-dbf5c42b3 'test(verify): extend case-completion policies and restate observed counts for the candidate 28 cases'
step 10-41b1124fa 'fix(skills): bring the start skill back under its size pin and name the four status facts and the lagging queue head in the close-feature skill'
step 11-6e1f3ea40 'fix(docs): regenerate the obligations document with the cd allowlist entry and the enforcement page after the hook matcher change'
step 12-6dd71fcb6 'fix(docs): carry the recursive-delete guardrail into the vendored guardrails copy'
step 13-35e1b768a 'docs(backlog): record the missing read-only preview of the architecture check before the design signature'
step 14-752ca4e5d 'docs(backlog): state what the code already covers of the architecture check findings and keep only the preview open'
step 15-621a46155 'fix(critic): name the shipped maxTurns 100 and its working cap of 85 in the Critic briefing template and re-pin the template once'
step 16-67182a9ec 'fix(guard): offer no human override for a credential-target read on any lane'
step 17-6b48dce37 'feat(package): admit completed back to implementing for a proven correction round and let the declined acceptance write the record back'
step 18-f2b2bc9c8 'feat(architecture): preview the boundary check against the proposed design of a PRD before the design signature'

node scripts/refresh-derived-files.mjs
git add -A -- docs plugins/pipeline-core backlog
git diff --cached --quiet || git commit --no-verify -m 'chore(inventory): refresh the derived files after candidate 28b (ledger, inventory baseline, Reader inputs)' -m "AI-Assisted: true" -m "Dispatch: stage-0 (elephant)"
echo "derived files refreshed"
git log --oneline -5
git status --short
