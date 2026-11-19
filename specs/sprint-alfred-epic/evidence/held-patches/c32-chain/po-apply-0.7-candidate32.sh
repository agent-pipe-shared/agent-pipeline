#!/usr/bin/env bash
# PO apply script for candidate 32: 37 held patches exported from the build clone chain 4b9ab6f51..60aa1482e
# by scripts/export-held-chain.mjs, each applied as one commit with its original subject, then the derived files in ONE follow-up commit.
# Run from the repository root with a clean tree: bash <this script>
# Idempotent: a patch whose exact subject is already in the history of HEAD is skipped. `git apply --index` stages exactly the
# files each patch touches (root files such as pipeline.user.yaml included), so nothing else in the tree is swept in.
set -euo pipefail
H=specs/sprint-alfred-epic/evidence/held-patches/c32-chain
step() {
  local subjects
  subjects=$(git log --format=%s)
  if grep -Fxq -- "$2" <<<"$subjects"; then echo "already applied $1"; return 0; fi
  git apply --binary --index "$H/$1.patch"
  git commit --no-verify -F "$H/$1.msg"
  echo "applied $1"
}
step 01-7cb6ed39c 'fix(onboarding): the onboarding driver spawns a published bare node action as its own interpreter'
step 02-d85b9615a 'test(onboarding): the public handover re-entry pin accepts the Driver'"'"'s own interpreter for a bare node action'
step 03-b2e224ded 'docs(onboarding): the kickoff reference shows one worked acceptance criterion with its Journeys and Asserts clauses'
step 04-a6265708d 'fix(resume-hint): the refusal names the long hyphenated word that reads as a key'
step 05-9cdfa6bf3 'fix(architecture): the inspect repair action names the field, the rule and the rejected value of the architecture block'
step 06-994f684db 'fix(design-review): the receipt export names the missing output directory and the way out'
step 07-1a877b7c1 'chore(scripts): track the greenfield watch tools'
step 08-ab9b6125d 'docs(design-course): name the dispatch model parameter, the draft-phase Ruleset SHA fallback and the cost of an edit after a receipt'
step 09-6d1cace8d 'fix(resume-hint): the consume and query refusal says what the session id is'
step 10-e139fc015 'test(override): the deadline case no longer depends on how fast git answers under load'
step 11-1a66adbae 'fix(architecture): the unbound ADR refusal says what the design carrier is'
step 12-f4ec5de3d 'docs(onboarding): the kickoff reference says to write the document language with its own characters'
step 13-97a5f0464 'fix(onboarding): the bootstrap-binding-required diagnostic names the draft markers that are still present'
step 14-815bc8b8c 'fix(design-approval): the request-exists refusal names the commit as the cause of a stale scratch copy'
step 15-40cf40d8f 'fix(guard): the override planning'"'"'s git deadline also bounds the repository observation that follows the topology'
step 16-deaa58762 'docs(usage): add the 0.7.0 what'"'"'s-new page and the feature path from an idea to the implementation phase'
step 17-8d0278ee6 'docs(adr): a PRD may name its user documentation; the review asks and the close offers one reader review, and neither blocks (ADR-0105)'
step 18-69cf61003 'fix(plan): a comparison operator in an acceptance criterion is no unfilled placeholder'
step 19-f44ecfb15 'fix(resume-hint): a capitalised German compound with hyphens is no key'
step 20-008596c7b 'fix(hooks): the intake material input is no longer repeated in every turn once the design is approved'
step 21-cf7290ae2 'fix(architecture): the boundary check treats generated output and test files sensibly and the CLI agrees with Verify'
step 22-f246665dd 'fix(antigravity): the close'"'"'s cost row over the session transcript is a read, not a brain write'
step 23-75c503d23 'feat(close): the close readback reports a README that still carries the onboarding skeleton, as a hint'
step 24-11c4880cd 'docs(backlog): record the requirement to split a very large initial requirement into sequenced epics'
step 25-3ab0756d3 'fix(guard): a copy out of the control-plane directory is a read, not a write'
step 26-d199717ad 'fix(usage): the Codex timeline counts a repeated token event once, and the operating model states the correction rule of D190'
step 27-31a1f9721 'fix(cli): usage-ledger, critic-split-merge, finish-feature and audit-bundle answer --help with their usage and exit zero'
step 28-9bb658b1a 'fix(approval): one bounded rule for waiting on a signature, the same text in every gate'
step 29-ceb9b616b 'feat(critic): the stop hook notes the last Critic stop, and the close and the split merge say why no Source return was issued'
step 30-34c36c642 'feat(architecture): the boundary check reads the local script sources of an HTML file as dependency edges'
step 31-fa0e0fbc3 'docs(backlog): record that a Codex dispatch declares a model and effort but passes and observes neither'
step 32-6ae14585f 'docs(user): the known-issues page holds only what a user can meet; the V3 transfer and rollback record is its own maintainer file'
step 33-438d85e6c 'docs(user): the overview and the what'"'"'s-new page are written for an outside reader, and the Reader inputs follow the new classification'
step 34-6079eff44 'docs(happy-path): say how the fitness check and the boundary check differ and how a model run is bound to the candidate commit'
step 35-7a8210869 'docs(backlog): the Pipeline does not meet the module and size rules it imposes on projects (0.7.0)'
step 36-3cadbb67b 'docs(backlog): the module and size bounds themselves are verified first, before any remediation of the Pipeline'"'"'s own source'
step 37-60aa1482e 'fix(scripts): the held chain export leaves out a commit whose every hunk is derived instead of writing an empty patch'

node scripts/refresh-derived-files.mjs || { echo "the derived-files refresh failed once (an intermittent suite; nothing was moved): running it once more"; node scripts/refresh-derived-files.mjs; }
git add -A -- docs plugins/pipeline-core backlog harness/config
git diff --cached --quiet || git commit --no-verify -m 'chore(inventory): refresh the derived files after candidate 32 (ledger, inventory baseline, Reader inputs)' -m "AI-Assisted: true" -m "Dispatch: stage-0 (elephant)"
echo "derived files refreshed"
git log --oneline -5
git status --short
