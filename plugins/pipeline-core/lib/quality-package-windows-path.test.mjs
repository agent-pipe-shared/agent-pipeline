import test from "node:test";
import assert from "node:assert/strict";
import { win32 } from "node:path";
import * as signedQuality from "./signed-quality-package.mjs";

test("Windows path grammar admits canonical drive separators without admitting files", () => {
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
});
