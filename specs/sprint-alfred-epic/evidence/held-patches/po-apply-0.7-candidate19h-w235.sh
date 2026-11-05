#!/usr/bin/env bash
# Candidate 19h, OPTIONAL step, applied only with the PO's consent and only AFTER po-apply-0.7-candidate19h.sh (w233, w234 applied).
#   w235  the cross-process authority memo also keeps the byte-less inspect and ancestor observations (option O3 (i) of
#         specs/sprint-alfred-epic/evidence/native-checks-options-2026-11-05.md; what it gives up: native-checks-recommendation-2026-11-05.md
#         and the w235 notes), and the authority trace reports persisted hits (protected files)
# Run with: bash /absolute/path/to/specs/sprint-alfred-epic/evidence/held-patches/po-apply-0.7-candidate19h-w235.sh   (from the repository root, clean tree)
set -euo pipefail
H=specs/sprint-alfred-epic/evidence/held-patches
STAGE=(.gitignore .gitleaksignore .gitleaks.toml setup.test.mjs plugins/pipeline-core harness docs scripts evidence roles templates guardrails policies schemas backlog specs)
step2() {
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
# w235 needs w233 and w234 first.
for need in "fix(dispatch): the governed queue preparation of a second launch waits for a sibling's registry lock within the admission deadline" "fix(stop): a SubagentStop that meets the registry lock waits for it, the stop-failure record names the holder and the stop hooks are traced"; do
  git log --format=%s | grep -Fxq -- "$need" || { echo "run po-apply-0.7-candidate19h.sh first (missing: $need)"; exit 2; }
done
step2 w235-the-cross-process-memo-keeps-the-byte-less-inspect-and-ancestor-observations "perf(authority): the cross-process memo keeps the byte-less inspect and ancestor observations, and the trace reports persisted hits"

node scripts/refresh-derived-files.mjs
git add -A -- docs plugins/pipeline-core backlog
git diff --cached --quiet || git commit --no-verify -m "chore(inventory): refresh the derived files after w235 (ledger, inventory baseline, Reader inputs)" -m $'AI-Assisted: true\nDispatch: stage-0 (elephant)'
echo "derived files refreshed"
git log --oneline -3
git status --short
