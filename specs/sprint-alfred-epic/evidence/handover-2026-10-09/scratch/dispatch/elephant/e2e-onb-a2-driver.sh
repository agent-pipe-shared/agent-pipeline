#!/bin/bash
# E2E-ONB-A2 (Elephant): the onboarding/design-chain suite matrix on WSL with fixtures on a Linux-native
# filesystem (TMPBASE, e59ac5750), 540 s cap per file, one summary line per file.
cd <repo-root-in-wsl> || exit 1
mkdir -p "$HOME/pipeline-test-tmp"
export PIPELINE_TEST_TMP_BASE="$HOME/pipeline-test-tmp"
mkdir -p evidence/E2E-ONB-A2-20261009
for f in $(find plugins/pipeline-core/scripts plugins/pipeline-core/lib -name '*onboarding*.test.mjs' -o -name '*intake*.test.mjs' -o -name '*design-workflow*.test.mjs' -o -name '*design-course*.test.mjs' -o -name '*readiness*.test.mjs' -o -name '*kickoff*.test.mjs' -o -name '*resume-hint*.test.mjs' -o -name '*bootstrap-binding*.test.mjs' -o -name '*pipeline-start-preflight*.test.mjs' | sort); do
  d=$(basename $(dirname $f))
  n=$(basename $f .test.mjs)
  out=evidence/E2E-ONB-A2-20261009/$d-$n.txt
  s=$(date +%s)
  timeout 540 node plugins/pipeline-core/scripts/capture-evidence.mjs --out $out --label $d-$n -- node --test --test-timeout=300000 $f > /dev/null 2>&1
  rc=$?
  e=$(( $(date +%s) - s ))
  echo "$d/$n rc=$rc t=${e}s $(grep -E '^(# |ℹ )(tests|pass|fail|skipped|cancelled) ' $out 2>/dev/null | tr '\n' ' ')"
done
echo DRIVER-DONE
