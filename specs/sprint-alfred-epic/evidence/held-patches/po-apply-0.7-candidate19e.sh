#!/usr/bin/env bash
# Candidate 19e apply script (grows on top of the applied and stamped candidate 19d, stamp commit 8bd2ac9b4; each held patch is one commit, in this order,
# then the derived files in ONE follow-up commit through scripts/refresh-derived-files.mjs). PO terminal, repository root.
# This is the FINAL script the PO applies before the last Full Verify: it collects every fix that the joint work with the Windows consumer session
# found after 19d was installed. Plan: specs/sprint-alfred-epic/plans/windows-authority-latency-plan-2026-11-04.md; evidence:
# specs/sprint-alfred-epic/evidence/windows-consumer-probe-stage2-result.md
#   w213  the repair cycle seen on Windows: a deferred heal and a cancel of a slice without a queue row now name the repair that can really be run (move-aside when no Goldfish runs)
#   w214  the first Windows trace: inspect met a registry.lock that vanished between the closure walk's listing and its stat; a vanished lock is skipped, every other vanished entry stays a fault
#   w215  19d marks, dispatch A and B: 320 PowerShell starts in 330 s; 92 were participant() re-reading every installed source file at each port construction; the digest is kept per process by file identity
#   w218  the same marks: every native write cleared the whole native memo; a write now drops only the written object, its directory and what is below it
#   w219  the same marks: a refused command with no capability paid ~110 starts (lock, whole registry, domain-owner reads) in the consumption attempt; no capability file now answers absent first (protected file, hence PO applies)
#   w220  the same marks: the 295 s admission deadline fires but is cleared before the queue rollback, which then runs a whole unbounded registry cycle until the host ends the hook; the preparation now stops at 245 s and the rollback runs under a second, later deadline (builds on w215: same test file)
# Run with: bash /absolute/path/to/specs/sprint-alfred-epic/evidence/held-patches/po-apply-0.7-candidate19e.sh   (from the repository root, clean tree, HEAD = the commit that carries this script)
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
step2 w213-a-deferred-heal-and-a-cancel-without-a-queue-row-name-a-runnable-repair "fix(repair): a deferred heal and a cancel of a slice without a queue row name the repair that can really be run"
step2 w214-the-closure-walk-skips-a-registry-lock-that-vanished-between-listing-and-stat "fix(authority): the registry closure walk skips a registry.lock that vanished between its listing and its stat"
step2 w215-an-installed-source-file-is-read-once-per-file-identity "fix(authority): an installed source file is read once per file identity instead of at every port construction"
step2 w218-a-native-write-drops-only-the-memo-entries-of-the-written-object-its-directory-and-what-is-below-it "fix(authority): a native write drops only the memo entries of the written object, its directory and what is below it"
step2 w219-a-consumption-with-no-capability-file-answers-absent-before-the-registry-boundary "fix(guard): a consumption with no capability file answers absent before it enters the registry boundary"
step2 w220-the-queue-rollback-of-a-refused-admission-runs-under-its-own-later-deadline "fix(dispatch): the queue rollback of a refused admission runs under its own later deadline instead of none"

node scripts/refresh-derived-files.mjs
git add -A -- docs plugins/pipeline-core backlog
git diff --cached --quiet || git commit --no-verify -m "chore(inventory): refresh the derived files after candidate 19e (ledger, inventory baseline, Reader inputs)" -m $'AI-Assisted: true\nDispatch: stage-0 (elephant)'
echo "derived files refreshed"
git log --oneline -5
git status --short
