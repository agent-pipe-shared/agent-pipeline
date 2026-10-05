// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { registerTestCaseCompletion } from "../lib/test-case-completion.mjs";
import { openSync as openCompletionDescriptor } from "node:fs";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir, devNull } from "node:os";
import { join, resolve } from "node:path";
import { inspectDesignCourse } from "./design-course-coordinator.mjs";
const completionCases = [];
function test(name, optionsOrRun, possibleRun) {
  const options = typeof optionsOrRun === "function" ? {} : optionsOrRun ?? {};
  const run = typeof optionsOrRun === "function" ? optionsOrRun : possibleRun;
  if (typeof name !== "string" || typeof run !== "function") throw new TypeError("invalid callback registration");
  const entry = { id: "K19" + String(completionCases.length + 1).padStart(3, "0"), name, run };
  if (options.skip === true) entry.mode = "skip";
  completionCases.push(entry);
}


test("course inspection exposes runner-specific readiness and preserves typed native Advisor unavailability", () => {
  const root = mkdtempSync(join(tmpdir(), "design-course-coordinator-"));
  try {
    mkdirSync(join(root, "project"));
    writeFileSync(join(root, "project", "pipeline-state.json"), JSON.stringify({
      planSubmission: { profile: "feature", featureId: "greenfield-feature" },
    }));
    const runGit = (_exe, args) => args[1] === "HEAD^{tree}" ? `${"b".repeat(40)}\n` : `${"a".repeat(40)}\n`;
    const claude = inspectDesignCourse({ rootDir: resolve(root), runner: "claude", runGit });
    assert.equal(claude.advisor.status, "native-initial-answer-provenance-unavailable");
    assert.equal(claude.advisor.childStarted, false);
    assert.equal(claude.readiness.script, "scripts/runner-design-readiness-bootstrap.mjs");
    assert.equal(claude.poSignaturesBeforeFinalPresentation, 0);
    assert.equal(claude.implementationAuthority, false);
    const codex = inspectDesignCourse({ rootDir: resolve(root), runner: "codex", runGit });
    assert.equal(codex.advisor.status, "route-available");
    assert.equal(codex.readiness.script, "scripts/codex-design-readiness-host.mjs");
    const noRunner = inspectDesignCourse({ rootDir: resolve(root), runGit });
    assert.equal(noRunner.status, "runner-required");
    assert.deepEqual(noRunner.nextAction.inputs, ["runner"]);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

if (completionCases.length !== 1) throw new Error("case completion count drift: expected 1, got " + completionCases.length);
const completionFd = process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD === undefined
  ? openCompletionDescriptor(devNull, "w")
  : Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD);
registerTestCaseCompletion({ cases: completionCases, fd: completionFd, maxBytes: 65536 });
