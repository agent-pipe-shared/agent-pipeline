// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { win32 } from "node:path";
import { openSync } from "node:fs";
import { registerTestCaseCompletion } from "./test-case-completion.mjs";
import * as signedQuality from "./signed-quality-package.mjs";
import { devNull } from "node:os";

const completionFd = process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD === undefined
  ? openSync(devNull, "w")
  : Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD);
registerTestCaseCompletion({
  cases: [{
    id: "QWP001",
    name: "Windows path grammar admits canonical drive separators without admitting files",
    run() {
      const isCanonicalPhysicalQualityPackagePath = signedQuality.isCanonicalPhysicalQualityPackagePath;
      assert.equal(typeof isCanonicalPhysicalQualityPackagePath, "function", "pure lexical contract helper is required");
      assert.equal(isCanonicalPhysicalQualityPackagePath(String.raw`C:\agent\repo\intent.json`, "win32"), true);
      assert.equal(isCanonicalPhysicalQualityPackagePath(String.raw`C:/agent/repo/intent.json`, "win32"), false);
      assert.equal(isCanonicalPhysicalQualityPackagePath(String.raw`C:\agent\repo\..\intent.json`, "win32"), false);
      assert.equal(isCanonicalPhysicalQualityPackagePath(`C:\\agent\\repo\\intent\u0000.json`, "win32"), false);
      assert.equal(isCanonicalPhysicalQualityPackagePath(String.raw`C:\agent\repo\intent.json`, "posix"), false);
      assert.equal(isCanonicalPhysicalQualityPackagePath("/agent/repo/intent\\.json", "posix"), false);
      assert.equal(isCanonicalPhysicalQualityPackagePath("/agent/repo/intent.json", "posix"), true);
      assert.equal(win32.resolve(String.raw`C:\agent\repo\intent.json`), String.raw`C:\agent\repo\intent.json`);
    },
  }],
  fd: completionFd,
  maxBytes: 4096,
});
