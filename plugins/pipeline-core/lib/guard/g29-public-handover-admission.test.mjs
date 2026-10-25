// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { registerTestCaseCompletion } from "../test-case-completion.mjs";
const cases = [];
function test(name, run) { cases.push({ id: `G29P${String(cases.length + 1).padStart(3, "0")}`, name, run }); }
import { fileURLToPath } from "node:url";
import { isSanctionedLifecycleCommand } from "./command-catalogue.mjs";
import { evaluateLifecycleReadyGuard } from "../../hooks/guard-lifecycle-ready.mjs";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
const root = fileURLToPath(new URL("../../../..", import.meta.url)).replace(/\/$/u, "");
const script = fileURLToPath(new URL("../../scripts/pipeline-state.mjs", import.meta.url));
test("public handover publication admits exact relative and absolute script forms", () => {
  for (const path of [script, "plugins/pipeline-core/scripts/pipeline-state.mjs"]) {
    assert.equal(isSanctionedLifecycleCommand(`node ${path} update-public-handover`, root), true);
    for (const extra of [" --root /foreign", " --activate", " --by anybody", " update-public-handover", " --publish-private"]) {
      assert.equal(isSanctionedLifecycleCommand(`node ${path} update-public-handover${extra}`, root), false, extra);
    }
  }
});

test("the actual lifecycle guard admits the explicit public action in a ready governed project", () => {
  const path = mkdtempSync(join(root, "scratch/g29-admission-"));
  try {
    mkdirSync(join(path, ".agent-pipeline"));
    writeFileSync(join(path, ".agent-pipeline/onboarding-consent.json"), JSON.stringify({
      schema: "pipeline.onboarding-consent-marker.v1", status: "consent-given-onboarding-incomplete",
      consentGivenAt: "2026-10-24T00:00:00.000Z",
    }));
    const deps = { projectDir: path, requireProjectOnboardingReadyFn: () => ({
      schema: "pipeline.project-onboarding-ready-gate.v1", status: "ready", intent: "session",
    }) };
    const command = `node ${JSON.stringify(script)} update-public-handover`;
    const result = evaluateLifecycleReadyGuard({ tool_name: "Bash", tool_input: { command } }, deps);
    assert.deepEqual(result, { exitCode: 0, stderr: "" });
  } finally { rmSync(path, { recursive: true, force: true }); }
});

if (cases.length !== 2) throw new Error("g29-public-handover-admission-tests case count drift");
registerTestCaseCompletion({ cases, fd: Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD ?? "3"), maxBytes: 65536 });
