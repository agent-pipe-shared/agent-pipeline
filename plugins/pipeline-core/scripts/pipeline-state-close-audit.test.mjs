// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { registerTestCaseCompletion } from "../lib/test-case-completion.mjs";
import { openSync as openCompletionDescriptor } from "node:fs";
const completionCases = [];
function test(name, run) {
  if (arguments.length !== 2 || typeof run !== "function") throw new TypeError("Required completion expects the preserved sibling callback registration");
  completionCases.push({ id: "PSC" + String(completionCases.length + 1).padStart(3, "0"), name, run });
}
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

// Register each original sibling callback directly with the canonical recorder.
if (completionCases.length !== 1) throw new Error("Required completion case count drift");
const completionFd = process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD === undefined
  ? openCompletionDescriptor(process.platform === "win32" ? "NUL" : "/dev/null", "w")
  : Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD);
registerTestCaseCompletion({ cases: completionCases, fd: completionFd,
  maxBytes: Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_MAX_BYTES ?? "65536") });
