// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { registerTestCaseCompletion } from "../lib/test-case-completion.mjs";
import { openSync as openCompletionDescriptor } from "node:fs";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir, devNull } from "node:os";
import { join, resolve } from "node:path";
import { DESIGN_COURSE_RETIRED } from "../lib/retired-design-codes.mjs";
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


test("retired course inspection returns DESIGN-COURSE-RETIRED for every runner, without authority or git access", () => {
  const root = mkdtempSync(join(tmpdir(), "design-course-coordinator-"));
  try {
    mkdirSync(join(root, "project"));
    writeFileSync(join(root, "project", "pipeline-state.json"), JSON.stringify({
      planSubmission: { profile: "feature", featureId: "greenfield-feature" },
    }));
    const runGit = () => { throw new Error("retired coordinator must not run git"); };
    for (const runner of ["claude", "codex", undefined]) {
      const result = inspectDesignCourse({ rootDir: resolve(root), runner, runGit });
      assert.equal(result.ok, false);
      assert.equal(result.code, DESIGN_COURSE_RETIRED);
      assert.equal(result.implementationAuthority, false);
      assert.equal(typeof result.hint, "string");
      assert.equal(result.advisor, undefined);
      assert.equal(result.readiness, undefined);
    }
  } finally { rmSync(root, { recursive: true, force: true }); }
});

if (completionCases.length !== 1) throw new Error("case completion count drift: expected 1, got " + completionCases.length);
const completionFd = process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD === undefined
  ? openCompletionDescriptor(devNull, "w")
  : Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD);
registerTestCaseCompletion({ cases: completionCases, fd: completionFd, maxBytes: 65536 });
