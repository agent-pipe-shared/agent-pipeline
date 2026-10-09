#!/bin/bash
# MECH-HAIKU-F after-capture (Elephant): the six routing pin files in parallel on WSL, one capture per file.
cd <repo-root-in-wsl> || exit 1
mkdir -p "$HOME/pipeline-test-tmp"
export PIPELINE_TEST_TMP_BASE="$HOME/pipeline-test-tmp"
mkdir -p evidence/MECH-HAIKU-F-20261009/after
for f in plugins/pipeline-core/scripts/check-routing-projections.test.mjs plugins/pipeline-core/lib/p3b-runner-conformance.test.mjs plugins/pipeline-core/lib/runner-profile-migration-v2.test.mjs plugins/pipeline-core/lib/runner-profile-migration-v3.test.mjs plugins/pipeline-core/lib/project-onboarding-v3.test.mjs plugins/pipeline-core/scripts/runner-contracts.schema.test.mjs; do
  n=$(basename $f .test.mjs)
  ( timeout 1500 node plugins/pipeline-core/scripts/capture-evidence.mjs --out evidence/MECH-HAIKU-F-20261009/after/$n.txt --label mech-haiku-after-$n -- node --test --test-timeout=600000 $f > /dev/null 2>&1; echo "$n rc=$? $(grep -E '^(# |ℹ )(tests|pass|fail|skipped|cancelled) ' evidence/MECH-HAIKU-F-20261009/after/$n.txt 2>/dev/null | tr '\n' ' ')" ) &
done
wait
echo DRIVER-DONE
