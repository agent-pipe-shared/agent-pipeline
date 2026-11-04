#!/usr/bin/env bash
# Candidate 19d apply script (grows on top of the applied and stamped candidate 19c, stamp commit 49074c0ff; each held patch is one commit, in this order,
# then the derived files in ONE follow-up commit through scripts/refresh-derived-files.mjs). PO terminal, repository root.
# Plan: specs/sprint-alfred-epic/plans/candidate-19-plan-2026-11-02.md; Windows run evidence: specs/sprint-alfred-epic/evidence/windows-consumer-probe-stage2-result.md
#   w208  E1: the recorded stop-failure reason and stage reach the recover plan, the build warning and the hook notice, and the notice no longer calls a missing pending state at a stop the normal case of a launch (found by the second Windows run of 19c)
#   w209  Direction 0 of the Windows latency plan: a deadline checked in the registry read loops, so a too-slow admission refuses (GUARD-DISPATCH-SLOW) before the host ends the guard at 330 s and starts the dispatch unguarded
#   w210  Direction 5: a refusal that shows the human no command journals no hand-off offer (PO tile 2026-11-04); touches the protected human-guard-override.mjs, so the PO applies this script
#   w211  measurement gap of the two Windows runs of a normal dispatch: the deadline covers the whole preparation from the process start, every admission phase and every native observation (with its caller site) is appended to the authority trace file as it happens, and the two new modules join the never-liftable kernel list
#   w212  the human-override denial path marks its phases (tool and guard reason code only), because three refusals of a missing project file cost 126 to 144 s each
# Run with: bash /absolute/path/to/specs/sprint-alfred-epic/evidence/held-patches/po-apply-0.7-candidate19d.sh   (from the repository root, clean tree, HEAD = the commit that carries this script)
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
step2 w208-stop-failure-reason-reaches-the-plan-the-build-warning-and-the-notice "fix(dispatch): the recorded stop-failure reason and stage reach the recover plan, the build warning and the hook notice, and the notice names the stop as the place the pending state could not be read (E1)"

step2 w209-the-admission-deadline-refuses-before-the-host-ends-the-guard "fix(dispatch): the admission refuses before the host ends the guard, with a deadline checked in the registry read loops (GUARD-DISPATCH-SLOW)"
step2 w210-a-refusal-that-shows-no-command-journals-no-offer "fix(guard): an external-operator route journals its offer only when it hands the human a command, so a refusal that shows none returns at once"
step2 w211-the-admission-deadline-covers-the-whole-preparation-and-every-phase-is-marked "fix(dispatch): the admission deadline covers the whole preparation from the process start, and every admission phase and native observation is marked in the authority trace as it happens"
step2 w212-the-denial-path-marks-its-phases-in-the-authority-trace "fix(guard): the human-override denial path marks its phases in the authority trace with the tool and the guard reason code only"

node scripts/refresh-derived-files.mjs
git add -A -- docs plugins/pipeline-core backlog
git diff --cached --quiet || git commit --no-verify -m "chore(inventory): refresh the derived files after candidate 19d (ledger, inventory baseline, Reader inputs)" -m $'AI-Assisted: true\nDispatch: stage-0 (elephant)'
echo "derived files refreshed"
git log --oneline -5
git status --short
