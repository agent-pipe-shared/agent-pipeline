# Pre-fix reproduction — Codex fresh protected root

Observed on 2026-07-26 against the released 0.4.4 commit
`84d10c00de74ea77e76d1acd869e7a95f2d85aee`.

The reproducer creates an otherwise empty root with the protected Codex
control directories, applies the 0.4.4 portable onboarding plan, and requires
the next read to expose the typed V4 `kickoff-required` state. The assertion is
the contract that 0.4.4 violated:

```bash
node --input-type=module -e '
import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  applyProjectOnboardingV3,
  inspectProjectOnboardingV3,
  planProjectOnboardingV3,
} from "./plugins/pipeline-core/lib/project-onboarding-v3.mjs";
const root = mkdtempSync(join(tmpdir(), "pipeline-045-prefx-red-"));
try {
  for (const name of [".agents", ".codex", ".git"]) {
    mkdirSync(join(root, name), { mode: 0o555 });
  }
  const plan = planProjectOnboardingV3({ rootDir: root });
  const applied = applyProjectOnboardingV3(plan, {
    rootDir: root,
    activate: true,
  });
  const observed = inspectProjectOnboardingV3({ rootDir: root });
  console.error(JSON.stringify({
    applied: applied.status,
    schema: observed.schema,
    status: observed.status,
  }));
  assert.equal(observed.schema, "pipeline.project-onboarding.v4");
  assert.equal(observed.status, "kickoff-required");
} finally {
  for (const name of [".agents", ".codex", ".git"]) {
    try { chmodSync(join(root, name), 0o755); } catch {}
  }
  rmSync(root, { recursive: true, force: true });
}'
```

Pre-fix result:

```text
{"applied":"applied","schema":"pipeline.project-onboarding.v3","status":"ready"}
AssertionError [ERR_ASSERTION]:
+ actual - expected
+ 'pipeline.project-onboarding.v3'
- 'pipeline.project-onboarding.v4'
exit=1
```

The false terminal `ready` state omitted the typed kickoff, Git-init, restart,
and guard-readback progression that a fresh protected root requires.

The permanent regression is
`plugins/pipeline-core/lib/project-onboarding-v3.test.mjs`, case
`a recognized read-only host control layout receives portable onboarding
without an overwrite attempt`. On the 0.4.5 candidate it reports:

```text
PASS  a recognized read-only host control layout receives portable onboarding without an overwrite attempt
project-onboarding-v3: 34 passed, 0 failed
```

Command:

```bash
node plugins/pipeline-core/lib/project-onboarding-v3.test.mjs
```
