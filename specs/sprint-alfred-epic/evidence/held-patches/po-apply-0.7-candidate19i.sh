#!/usr/bin/env bash
# Candidate 19i apply script (on top of the applied and stamped candidate 19h, stamp commit bd72dab68; each held patch is one commit, then the
# derived files in ONE follow-up commit through scripts/refresh-derived-files.mjs). PO terminal, repository root.
# PO decision 2026-11-06 on the Windows measurement and CPU profile of 19h. Plan: specs/sprint-alfred-epic/plans/candidate-19-plan-2026-11-02.md
#   w236  every registry boundary entry of an admission waits for a sibling's lock within the admission deadline; a queue changed only by a
#         sibling's admitted, disjoint slice is re-read instead of refused (protected files)
#   w237  SubagentStop: attributed to code sites, repeated reads removed, reads under the read scope (O10), lock only for the writes (protected files)
#   w238  registry: O7 no second inspect, O8 entry heal once, O3 (ii) persisted source digests, O9 own producer only, settled members pruned (protected files)
#   w239  Windows private reads and inspects in Node (O5c) and native ancestors only at the roots (O1a); protection loss accepted by the PO (protected files)
#   w241  custody inspection and private-state checks start git and PowerShell once per unchanged object (protected files)
#   w240  registration of the new test cases (Verify suites and case-completion)
# Run with: bash /absolute/path/to/specs/sprint-alfred-epic/evidence/held-patches/po-apply-0.7-candidate19i.sh   (from the repository root, clean tree, HEAD = the commit that carries this script)
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
# Order = the rehearsed chain order (each patch applies on the previous one).
step2 w236-every-admission-registry-entry-waits-for-a-sibling-lock-within-the-admission-deadline "fix(dispatch): every registry entry of an admission waits for a sibling's lock within the admission deadline, including the predecessor-integration read"
step2 w239-windows-private-reads-and-inspects-use-node-and-ancestors-are-observed-natively-only-at-the-roots "perf(windows): private reads and inspects use Node and ancestors are observed natively only at the roots (O5c, O1a)"
step2 w241-custody-inspection-and-private-state-checks-spawn-git-and-powershell-once-per-unchanged-object "perf(custody): custody inspection and private-state checks start git and PowerShell once per unchanged object"
step2 w238-the-registry-checks-each-object-once-heals-once-keeps-source-digests-and-prunes-settled-members "perf(registry): the registry checks each object once, heals once, keeps source digests and prunes settled members (O7, O8, O3 ii, O9)"
step2 w237-the-subagent-stop-reads-under-the-read-scope-and-holds-the-registry-lock-only-for-its-writes "perf(stop): the SubagentStop reads under the read scope and holds the registry lock only for its writes (O10)"
step2 w240-the-new-test-suites-of-candidate-19i-are-registered "test(verify): the new test suites of candidate 19i are registered"

node scripts/refresh-derived-files.mjs
git add -A -- docs plugins/pipeline-core backlog
git diff --cached --quiet || git commit --no-verify -m "chore(inventory): refresh the derived files after candidate 19i (ledger, inventory baseline, Reader inputs)" -m $'AI-Assisted: true\nDispatch: stage-0 (elephant)'
echo "derived files refreshed"
git log --oneline -8
git status --short
