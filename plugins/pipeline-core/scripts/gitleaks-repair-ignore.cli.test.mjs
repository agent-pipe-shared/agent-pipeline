// SPDX-License-Identifier: SUL-1.0
/**
 * CLI entry test for gitleaks-repair-ignore.mjs: invoked as a process (including on native
 * Windows), the entry check must run main() instead of exiting 0 silently.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, openSync as openCompletionDescriptor, rmSync } from "node:fs";
import { tmpdir, devNull } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { registerTestCaseCompletion } from "../lib/test-case-completion.mjs";

const completionCases = [];
function test(name, run) {
  if (typeof name !== "string" || typeof run !== "function") throw new TypeError("invalid callback registration");
  completionCases.push({ id: "GLCLI" + String(completionCases.length + 1).padStart(3, "0"), name, run });
}

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), "gitleaks-repair-ignore.mjs");

test("CLI with no arguments runs main and reports the missing flags", () => {
  const cwd = mkdtempSync(join(tmpdir(), "glcli-"));
  try {
    const result = spawnSync(process.execPath, [SCRIPT], { cwd, encoding: "utf8" });
    assert.equal(result.status, 1, `stdout=${result.stdout} stderr=${result.stderr}`);
    assert.match(result.stderr, /missing required flag\(s\)/u);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

if (completionCases.length !== 1) throw new Error("case completion count drift: expected 1, got " + completionCases.length);
const completionFd = process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD === undefined
  ? openCompletionDescriptor(devNull, "w")
  : Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD);
registerTestCaseCompletion({ cases: completionCases, fd: completionFd, maxBytes: 65536 });
