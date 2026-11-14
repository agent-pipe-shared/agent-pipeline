#!/usr/bin/env bash
# PO apply script for candidate 29e: 25 held patches exported from the build clone chain 7c539d75d..57709f656
# by scripts/export-held-chain.mjs, each applied as one commit with its original subject, then the derived files in ONE follow-up commit.
# Run from the repository root with a clean tree: bash <this script>
# Idempotent: a patch whose exact subject is already in the history of HEAD is skipped. `git apply --index` stages exactly the
# files each patch touches (root files such as pipeline.user.yaml included), so nothing else in the tree is swept in.
set -euo pipefail
H=specs/sprint-alfred-epic/evidence/held-patches/candidate29e
step() {
  local subjects
  subjects=$(git log --format=%s)
  if grep -Fxq -- "$2" <<<"$subjects"; then echo "already applied $1"; return 0; fi
  git apply --binary --index "$H/$1.patch"
  git commit --no-verify -F "$H/$1.msg"
  echo "applied $1"
}
step 01-bcbde10da 'feat(close): name the evidence follow-up and label the security coverage'
step 02-0704c12ba 'docs(elephant): name the scope-change route next to the budget release'
step 03-f5cb22d82 'refactor(pipeline-state): move the closed-evidence restore/repin verbs into a lib'
step 04-7e4bf8870 'docs(adr): accept ADR-0101, the stage-0 fast path admits small changes with tests'
step 05-b06ac32d7 'docs(canon): state the ADR-0101 stage-0 fast path and retire "Tier-0"'
step 06-d83305688 'feat(provenance): check the ADR-0101 stage-0 caps, with a production-line cap'
step 07-901b91fe9 'feat(gmw): an elephant-direct window accepts the ADR-0101 caps, still no test files'
step 08-f8b4578f1 'docs(el01-tripwire): name the ADR-0101 stage-0 fast path without rigor 0'
step 09-e51682e27 'fix(critic): a split part'"'"'s envelope names its scope marker, a stage-0 commit without production code is no finding, re-pin once'
step 10-24d0a7315 'fix(provenance): the Dispatch: stage-0 (elephant) trailer is a stage-0 self-declaration'
step 11-eb787e3f6 'test(critic): prove the guard admits a split part'"'"'s envelope with its scope-marker row'
step 12-dfde12025 'test(critic): match the indented scope-marker row of the raw template envelope'
step 13-d7842ea5c 'feat(hooks): remind the main session to work in parallel'
step 14-84b9144eb 'docs(adr): record ADR-0102, the main session is reminded to work in parallel'
step 15-6ea973afe 'test(runtime-projection): pin that the parallel reminder key stays in the source'
step 16-3aa84dde8 'feat(security): add the Trivy adapter for infrastructure and container files'
step 17-54843836c 'feat(security): the close scan runs Trivy and blocks only on findings the feature added'
step 18-774ba401d 'fix(security): Trivy applicability reads tracked files and skips List documents'
step 19-855923e9b 'fix(security): the Trivy scan sends no usage data and asks for no update'
step 20-f192915e3 'test(security): the Semgrep-only diagnostics fixture disables Trivy'
step 21-3b23c2db4 'feat(toolchain): Trivy is a registry tool asked for only where infrastructure files exist'
step 22-eb582ea7b 'test(verify): register the Trivy adapter and baseline suites'
step 23-cce30c8a0 'docs(adr): record ADR-0103, the close scans infrastructure files with Trivy'
step 24-a8512bce0 'test(security): fixtures that disable every other scanner disable Trivy too'
step 25-57709f656 'test(security): restate two expectations for the Trivy scanner row and files'

node scripts/refresh-derived-files.mjs
git add -A -- docs plugins/pipeline-core backlog
git diff --cached --quiet || git commit --no-verify -m 'chore(inventory): refresh the derived files after candidate 29e (ledger, inventory baseline, Reader inputs)' -m "AI-Assisted: true" -m "Dispatch: stage-0 (elephant)"
echo "derived files refreshed"
git log --oneline -5
git status --short
