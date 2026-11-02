// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { normalizeRootArgument } from "./root-argument.mjs";

const PLUGIN = join(dirname(fileURLToPath(import.meta.url)), "..");

test("win32 spelling: forward slashes become backslashes, nothing else changes", () => {
  assert.equal(normalizeRootArgument("C:/work/repo", "win32"), "C:\\work\\repo");
  assert.equal(normalizeRootArgument("C:\\work\\repo", "win32"), "C:\\work\\repo");
  assert.equal(normalizeRootArgument("C:/work/../repo", "win32"), "C:\\work\\..\\repo", ".. stays a refusal for the strict check");
  assert.equal(normalizeRootArgument("C:/work/repo/", "win32"), "C:\\work\\repo\\", "a trailing separator stays a refusal");
});

test("every other platform and every non-string value is returned unchanged", () => {
  for (const platform of ["linux", "darwin"]) assert.equal(normalizeRootArgument("/a/b/../c", platform), "/a/b/../c");
  assert.equal(normalizeRootArgument("C:/work/repo", "linux"), "C:/work/repo");
  assert.equal(normalizeRootArgument(undefined, "win32"), undefined);
  assert.equal(normalizeRootArgument(7, "win32"), 7);
});

test("the strict root entries normalise the argument before comparing it", () => {
  for (const [file, needle] of [
    ["scripts/dispatch-recovery.mjs", 'parsed.options["--root"] = normalizeRootArgument(parsed.options["--root"]);'],
    ["scripts/continuity-owner-route.mjs", "const root = normalizeRootArgument(rawRoot);"],
    ["scripts/continuity-owner-route.mjs", "const orphanRoot = normalizeRootArgument(argv[2]);"],
    ["scripts/design-course-session.mjs", '(key === "root" || key === "pluginRoot") ? normalizeRootArgument(value) : value;'],
  ]) {
    assert.ok(readFileSync(join(PLUGIN, file), "utf8").includes(needle), `${file} must contain ${needle}`);
  }
});
