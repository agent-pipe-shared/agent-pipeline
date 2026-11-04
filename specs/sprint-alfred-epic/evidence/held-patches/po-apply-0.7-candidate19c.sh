#!/usr/bin/env bash
# Candidate 19c apply script (grows while the rest of candidate 19 is built on top of the stamped interim candidate 19a, commit 6193380d0; each held patch is one commit, in this
# order, then the derived files in ONE follow-up commit through scripts/refresh-derived-files.mjs). PO terminal, repository root.
# Plan: specs/sprint-alfred-epic/plans/candidate-19-plan-2026-11-02.md, section "PO decisions of the 2026-11-04 sitting".
#   w138  (PO decision 2026-11-04: now default, no opt-in) a closed predecessor's design receipt is accepted when the design is equal (F1)
#   w162  (PO decision 2026-11-04: now default, no opt-in) a Verify or Security record is carried across evidence-only commits (D4b/E3 step 3)
#   w190  the control-plane scan module and the push gate path modules are registered in the guard split map, the never-liftable kernel paths and the threat model (found by the regression suites)
#   w165  a pending-unavailable Goldfish stop failure names its cause and the recover helper plan and apply command (E1 text part; Windows greenfield)
#   w166  one shared reader of the bound authority documents returns sealed and digests (late-binding build step 1a; inert, no reader moves onto it yet)
#   w171  the managed pre-push hook and the security completeness gate take the shared freshness verdict; the carry-forward is active (D4b/E3 rest)
#   w167  a signed feature-package reconcile commits exactly its own files with one commit capability; the close steps before the ceremony leave a clean tree (D3)
#   w168  Windows authority failures name path and cause and repair; the preflight probes close and push and reports the bootstrap facts (E2, Q10 node half, W1, W2, W7)
#   w169  the PowerShell guard admits what the Bash guard admits and its refusals name the way out (E7 PowerShell part, W4, W5)
#   w170  one typed orchestrator commit helper: check, commit with the trailer, write the dispatch record (E1 second half)
# Run with: bash specs/sprint-alfred-epic/evidence/held-patches/po-apply-0.7-candidate19c.sh   (repository root, clean tree, HEAD = the commit that carries this script)
set -euo pipefail
H=specs/sprint-alfred-epic/evidence/held-patches
STAGE=(.gitignore .gitleaksignore .gitleaks.toml setup.test.mjs plugins/pipeline-core harness docs scripts evidence roles templates guardrails policies schemas backlog specs)
# One held patch, one commit; the subject is given inline (GIT-03 trailers only). --no-verify is used here and nowhere else.
step2() {
  # Idempotent: a patch whose exact commit subject is already in the history of HEAD was applied by an earlier run of this script and is skipped.
  local subjects
  subjects=$(git log --format=%s)
  if grep -Fxq -- "$2" <<<"$subjects"; then echo "already applied $1"; return 0; fi
  local patch="$H/$1.patch"
  if [ -f "$H/$1.rebased.patch" ]; then patch="$H/$1.rebased.patch"; fi
  git apply "$patch"
  git add -A -- "${STAGE[@]}"
  git commit --no-verify -m "$2" -m $'AI-Assisted: true\nDispatch: stage-0 (elephant)'
  echo "applied $1"
}
step2 w138-f1-a-closed-predecessors-design-receipt-is-accepted-for-the-next-feature-when-the-design-is-equal "feat(architecture): accept the design receipt of a closed predecessor feature when the design package and every target digest are equal"
step2 w162-d4b-stage-3-a-verify-or-security-record-is-carried-across-evidence-only-commits-opt-in "feat(push): a Verify or Security record is carried across evidence-only commits by the push guard and push-prepare, behind the opt-in block"
step2 w165-e1-a-pending-unavailable-stop-failure-names-its-cause-and-the-recover-helper "fix(hook): a pending-unavailable Goldfish stop failure names its cause and the recover helper plan and apply command"
step2 w166-late-binding-step-1a-one-shared-reader-of-the-bound-authority-returns-sealed-and-digests "feat(authority): one shared reader of the bound authority documents returns sealed and digests, inert until the readers move onto it"
step2 w190-fix-the-control-plane-scan-module-and-the-push-gate-path-modules-are-registered-in-the-guard-pins "fix(guard): the control-plane script scan module and the push gate path modules are listed in the split map, the never-liftable kernel paths and the threat model"
step2 w171-d4b-the-pre-push-hook-and-the-security-gate-take-the-shared-freshness-verdict-and-the-carry-forward-is-on "feat(push): the managed pre-push hook and the security completeness gate take the shared freshness verdict and the carry-forward of Verify and Security across evidence-only commits is active"
step2 w167-d3-a-signed-reconcile-commits-its-own-files-and-the-close-chain-leaves-a-clean-tree-before-the-ceremony "feat(close): a signed feature-package reconcile commits exactly its own files with one commit capability and the close steps before the ceremony leave a clean tree"
step2 w168-win-authority-failures-name-path-and-cause-and-the-preflight-probes-the-platform "feat(windows): authority failures name the path, the cause and the repair, and the preflight probes close and push and reports the bootstrap facts"
step2 w169-ps-the-powershell-guard-admits-what-the-bash-guard-admits-and-its-refusals-name-the-way-out "feat(guard): the PowerShell guard admits what the Bash guard admits and its refusals name the way out"
step2 w170-e1-one-typed-orchestrator-commit-helper-checks-commits-with-the-trailer-and-writes-the-dispatch-record "feat(dispatch): one typed orchestrator commit helper checks a Goldfish diff, commits it with the trailer and writes the dispatch record"
# The derived files, in one step: backlog ledger transitions, inventory baseline (needs the HEAD of the source commit above), Reader inputs.
node scripts/refresh-derived-files.mjs
git add -A -- docs plugins/pipeline-core backlog
git diff --cached --quiet || git commit --no-verify -m "chore(inventory): refresh the derived files after candidate 19c (ledger, inventory baseline, Reader inputs)" -m $'AI-Assisted: true\nDispatch: stage-0 (elephant)'
echo "derived files refreshed"
git log --oneline -10
git status --short
