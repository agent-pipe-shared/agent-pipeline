# Antigravity execution-fixture lifetime — evidence

The preserved full-gate source artifact
`evidence/verify-1788893559906-fd5c81249bddf0d9.json` records
`antigravity-execution-host-tests` as exit 1 at commit `37aa24fc`; this
dispatch did not run the full gate.

The unchanged direct-suite baseline is captured at
`scratch/NVA-B-AGY-ASYNC-FIXTURE-LIFETIME-1/baseline-source-suite.txt`:

`node plugins/pipeline-core/lib/antigravity-execution-host.test.mjs` → exit 0.

The controlled legacy reproduction at
`scratch/NVA-B-AGY-ASYNC-FIXTURE-LIFETIME-1/controlled-old-lifetime-red.txt`
uses only a mock subprocess. It exits 1 deliberately after showing both that
the production model-mismatch/match paths work while the fixture exists and
that removing the old fixed fixture path after one second makes subsequent
model calls report `AGY-NOT-INSTALLED`. This distinguishes fixture lifetime
from model-comparison logic.

The repaired suite creates each mock fixture with `mkdtempSync`, awaits all
async cases within `try`/`finally`, and removes the fixture only afterward.
Its final capture is
`scratch/NVA-B-AGY-ASYNC-FIXTURE-LIFETIME-1/final-source-suite.txt`:

`node plugins/pipeline-core/lib/antigravity-execution-host.test.mjs` → exit 0,
15/15 checks. EPH12 and EPH13 cross the former one-second teardown boundary;
EPH14 and EPH15 prove cleanup after success and failure; EPH16 proves that
cleanup of one concurrently created fixture leaves the other usable within one
suite process.

Process-level isolation is separately captured by actual concurrent suite
invocations. `node scratch/NVA-B-AGY-ASYNC-FIXTURE-LIFETIME-1/run-parallel-suites.mjs`
starts two complete test-suite processes simultaneously and exits 0 only when
both have exit 0 and `15/15 checks passed.`. Its distinct machine-written
captures are
`scratch/NVA-B-AGY-ASYNC-FIXTURE-LIFETIME-1/parallel-suite-a.txt` and
`scratch/NVA-B-AGY-ASYNC-FIXTURE-LIFETIME-1/parallel-suite-b.txt`; each records
exit 0 and 15/15. This process-level proof is distinct from EPH16.

The required consumer check is captured at
`scratch/NVA-B-AGY-ASYNC-FIXTURE-LIFETIME-1/consumer-safe-paths.txt`:

`node --test harness/scripts/check-consumer-safe-paths.test.mjs` → exit 0.
