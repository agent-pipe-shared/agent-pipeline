#!/bin/bash
# E2E-ONB-B3 sandbox git steps (evidence tooling). Runs ONLY inside the throwaway sandbox repository under the
# WSL home. Contains no push and no remote. Tests hypothesis H1: pipeline.user.yaml and specs/ get committed.
# Output is also written to a machine-local step log beside this script, with the WSL home path scrubbed.
set -u
LOGF="$(cd "$(dirname "$0")" && pwd)/step-08-sandbox-commit.txt"
main() {
  echo "08a  bash git-step.sh (sandbox only, no push, no remote)"
  cd "$HOME/tmp/e2e-onb-b3-20261009" || return 4
  case "$PWD" in
    "$HOME"/tmp/e2e-onb-b3-20261009) ;;
    *) echo "refusing: not in the sandbox"; return 3 ;;
  esac
  if [ -d .git ]; then echo "pre-state: .git already exists"; else echo "pre-state: .git absent"; fi
  git init -b main || return 5
  git config user.name "E2E Walk" || return 6
  git config user.email "e2e@example.invalid" || return 6
  mkdir -p scratch
  # the sandbox commit-msg hook (GIT-03) named both trailers on the first attempt (see the step log), so the retry carries them
  printf '%s\n' "docs: add the word counter design package" "" "AI-Assisted: true" "Dispatch: E2E-ONB-B3-20261009 (goldfish)" > scratch/commit-msg.txt
  git add -- specs pipeline.user.yaml || return 7
  git commit -F scratch/commit-msg.txt -- specs pipeline.user.yaml || { echo "COMMIT-REFUSED exit=$?"; return 8; }
  echo "== status after commit =="
  git status --short
  echo "== last commit =="
  git log -1 --stat
  return 0
}
main 2>&1 | sed -u -e "s#$HOME#<wsl-home>#g" | tee -a "$LOGF"
exit "${PIPESTATUS[0]}"
