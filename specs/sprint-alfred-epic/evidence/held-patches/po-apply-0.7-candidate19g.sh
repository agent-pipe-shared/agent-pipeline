#!/usr/bin/env bash
# Candidate 19g apply script (on top of the applied and stamped candidate 19f, stamp commit 66d5f7f75; each held patch is one commit, then the
# derived files in ONE follow-up commit through scripts/refresh-derived-files.mjs). PO terminal, repository root. This is the FINAL candidate of
# the joint Windows work (PO decision 2026-11-05: one more candidate only). Evidence: the Windows measurements of 19e and 19f with the Windows
# consumer session; plan: specs/sprint-alfred-epic/plans/windows-authority-latency-plan-2026-11-04.md (sections 2g to 2j)
#   w225  a slice whose queue row is gone (queue file restored while a dispatch ran) kept its reservation for ever: cancel, heal and move-aside each refused or
#         deferred; a started cancel now re-creates the row as cancelled from the dispatch state (protected file, hence PO applies)
#   w226  one registry lock cycle costs 130 to 180 PowerShell starts and every hook is a new process: read-only native observations are kept across processes in a
#         bounded private file, answered only for the identical object identity (protected file)
#   w227  a stop read its pending state through the registry and reported it missing at the first held lock (NGHF-PENDING-UNAVAILABLE on Windows); it now waits (90 s)
#   w228  a registry lock whose owner is gone is refused with the heal that retires it, not with wait and release-lock
# Run with: bash /absolute/path/to/specs/sprint-alfred-epic/evidence/held-patches/po-apply-0.7-candidate19g.sh   (from the repository root, clean tree, HEAD = the commit that carries this script)
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
step2 w225-a-started-cancel-of-a-slice-whose-queue-row-is-gone-re-creates-the-row-as-cancelled "fix(repair): a started cancel of a slice whose queue row is gone re-creates the row as cancelled and releases the reservation"
step2 w226-read-only-native-observations-of-an-unchanged-object-are-kept-across-hook-processes "perf(authority): read-only native observations of an unchanged object are kept across hook processes, validated by the same identity check"
step2 w227-a-stop-waits-for-the-registry-lock-a-sibling-hook-still-holds-before-it-reads-its-pending-state "fix(stop): a stop waits for the registry lock a sibling hook still holds before it reads its pending state, instead of reporting the state missing"
step2 w228-a-registry-lock-whose-owner-is-gone-is-refused-with-the-heal-that-retires-it "fix(dispatch-briefing): a registry lock whose owner is gone is refused with the heal that retires it, not with wait and release-lock"

node scripts/refresh-derived-files.mjs
git add -A -- docs plugins/pipeline-core backlog
git diff --cached --quiet || git commit --no-verify -m "chore(inventory): refresh the derived files after candidate 19g (ledger, inventory baseline, Reader inputs)" -m $'AI-Assisted: true\nDispatch: stage-0 (elephant)'
echo "derived files refreshed"
git log --oneline -6
git status --short
