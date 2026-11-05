#!/usr/bin/env bash
# Candidate 19h apply script (on top of the applied and stamped candidate 19g, stamp commit 5412f8937; each held patch is one commit, then the
# derived files in ONE follow-up commit through scripts/refresh-derived-files.mjs). PO terminal, repository root.
# PO decision 2026-11-05 (late) on the Windows measurement of 19g: option B, both lock failures are fixed; the native operations are analysed
# separately (specs/sprint-alfred-epic/evidence/native-checks-options-2026-11-05.md). Plan: specs/sprint-alfred-epic/plans/candidate-19-plan-2026-11-02.md
#   w233  E4: the governed queue preparation of a second launch waited only the 10 s default for the first launch's registry lock and was refused
#         after 13.1 s; it now waits within the admission deadline (protected files)
#   w234  SubagentStop: two of three stops failed at once with registry-lock-held although the read waits 90 s; root cause, holder in the
#         stop-failure record, and trace lines for the stop and start hooks (protected files)
# Run with: bash /absolute/path/to/specs/sprint-alfred-epic/evidence/held-patches/po-apply-0.7-candidate19h.sh   (from the repository root, clean tree, HEAD = the commit that carries this script)
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
step2 w233-e4-the-queue-preparation-waits-for-a-sibling-launch-lock-within-the-admission-deadline "fix(dispatch): the governed queue preparation of a second launch waits for a sibling's registry lock within the admission deadline"
step2 w234-a-subagent-stop-that-meets-the-registry-lock-waits-for-it-and-names-the-holder "fix(stop): a SubagentStop that meets the registry lock waits for it, the stop-failure record names the holder and the stop hooks are traced"

node scripts/refresh-derived-files.mjs
git add -A -- docs plugins/pipeline-core backlog
git diff --cached --quiet || git commit --no-verify -m "chore(inventory): refresh the derived files after candidate 19h (ledger, inventory baseline, Reader inputs)" -m $'AI-Assisted: true\nDispatch: stage-0 (elephant)'
echo "derived files refreshed"
git log --oneline -4
git status --short
