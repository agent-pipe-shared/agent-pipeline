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

test("C20 separator sweep: an equivalent spelling of the current directory becomes that directory's own spelling", () => {
  const cwd = "D:\\Dev\\App";
  for (const typed of ["D:/Dev/App", "d:/dev/app", "/d/Dev/App", "D:\\Dev\\App\\", "d:\\DEV\\app"]) {
    assert.equal(normalizeRootArgument(typed, "win32", { cwd }), cwd, typed);
  }
  // another directory keeps the separator-only rule; MSYS is now understood there too
  assert.equal(normalizeRootArgument("/d/Dev/Other", "win32", { cwd }), "D:\\Dev\\Other");
  assert.equal(normalizeRootArgument("D:/Dev/App/../App", "win32", { cwd }), "D:\\Dev\\App\\..\\App", "a dot segment is never mapped");
  // darwin: an NFD spelling of the NFC working directory is that directory; Linux stays byte-exact
  const nfc = "/Users/po/Übung".normalize("NFC");
  assert.equal(normalizeRootArgument(nfc.normalize("NFD"), "darwin", { cwd: nfc }), nfc);
  assert.equal(normalizeRootArgument("/home/u/app/", "linux", { cwd: "/home/u/app" }), "/home/u/app/");
});

test("the strict root entries normalise the argument before comparing it", () => {
  for (const [file, needle] of [
    ["scripts/doc-reader-course.mjs", "const root=normalizeRootArgument(argv[2]),storePath=argv[4];"],
    ["scripts/governance-scope-diagnose.mjs", "const rootDir=normalizeRootArgument(argv[1]);"],
    ["scripts/dispatch-recovery.mjs", 'parsed.options["--root"] = normalizeRootArgument(parsed.options["--root"]);'],
    ["scripts/continuity-owner-route.mjs", "const root = normalizeRootArgument(rawRoot);"],
    ["scripts/continuity-owner-route.mjs", "const orphanRoot = normalizeRootArgument(argv[2]);"],
    ["scripts/design-course-session.mjs", '(key === "root" || key === "pluginRoot") ? normalizeRootArgument(value) : value;'],
  ]) {
    assert.ok(readFileSync(join(PLUGIN, file), "utf8").includes(needle), `${file} must contain ${needle}`);
  }
});
