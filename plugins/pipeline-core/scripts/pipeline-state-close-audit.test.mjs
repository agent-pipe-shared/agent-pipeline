// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { run } from "./pipeline-state.mjs";

test("direct or legacy close is a typed zero-write migration refusal", (t) => {
  const root = mkdtempSync(join(tmpdir(), "pipeline-state-close-audit-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, ".claude"));
  const statePath = join(root, ".claude", "pipeline-state.json");
  writeFileSync(statePath, JSON.stringify({
    schema: "pipeline.state.v0", planApproved: true,
    activeFeature: { id: "audit-feature", planPath: "specs/audit/prd.md", phase: "implementation" },
  }));
  const before = readFileSync(statePath);
  const code = run(["close-feature", "--by", "PO", "--architecture-impact", "no-architecture-impact"], {
    dir: root, now: () => "2026-09-19T10:00:00.000Z",
  });
  assert.equal(code, 2);
  assert.deepEqual(readFileSync(statePath), before);
});
