// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { test } from "node:test";

import { assureWindowsPrivateDirectories } from "../private-boundary.mjs";
import { assessWindowsPrivatePath } from "../windows-private-state.mjs";
import { cleanupPrivateTmp, privateMkdtempSync, privateTmpRoot } from "./private-tmp.mjs";

const windowsOnly = { skip: process.platform !== "win32" ? "native Windows DACL behaviour" : false };
const posixOnly = { skip: process.platform === "win32" ? "POSIX mode bits are not meaningful on native Windows" : false };

test("the private root is created once per process, directly below the OS temp directory", () => {
  const first = privateTmpRoot();
  const second = privateTmpRoot();
  assert.equal(first, second);
  assert.equal(resolve(dirname(first)), resolve(tmpdir()));
  assert.equal(statSync(first).isDirectory(), true);
});

test("fixtures are distinct directories beneath the private root and keep the requested prefix", () => {
  const a = privateMkdtempSync("tmpdacl-a-");
  const b = privateMkdtempSync("tmpdacl-b-");
  assert.notEqual(a, b);
  for (const [fixture, prefix] of [[a, "tmpdacl-a-"], [b, "tmpdacl-b-"]]) {
    assert.equal(dirname(fixture), privateTmpRoot());
    assert.equal(basename(fixture).startsWith(prefix), true);
    assert.equal(statSync(fixture).isDirectory(), true);
  }
});

test("a prefix that could leave the private root is refused", () => {
  for (const prefix of ["", "../escape-", "nested/escape-", "nested\\escape-", 7, null, undefined]) {
    if (prefix === undefined) {
      // The default prefix is a supported spelling, not a refusal.
      assert.equal(basename(privateMkdtempSync()).startsWith("fixture-"), true);
      continue;
    }
    assert.throws(() => privateMkdtempSync(prefix), /private temp fixture prefix/, `prefix ${String(prefix)}`);
  }
});

test("win32: the root, a fixture, a nested child directory and a nested file all pass the private-state assessment", windowsOnly, () => {
  const fixture = privateMkdtempSync("tmpdacl-win-");
  const nested = join(fixture, "child", "grandchild");
  mkdirSync(nested, { recursive: true });
  const file = join(nested, "state.json");
  writeFileSync(file, "{}\n");
  // created:false makes the primitive assess rather than harden, so this proves
  // the DACL the fixture inherited rather than one this test applied itself.
  assureWindowsPrivateDirectories([
    { directory: privateTmpRoot(), created: false },
    { directory: fixture, created: false },
    { directory: dirname(nested), created: false },
    { directory: nested, created: false },
  ]);
  assert.equal(assessWindowsPrivatePath(file).status, "secure");
});

test("non-win32: the root and every fixture are mode 0o700", posixOnly, () => {
  const fixture = privateMkdtempSync("tmpdacl-posix-");
  assert.equal(statSync(privateTmpRoot()).mode & 0o777, 0o700);
  assert.equal(statSync(fixture).mode & 0o777, 0o700);
});

test("cleanup removes the root with its fixtures, and a later request builds a fresh private root", () => {
  const oldRoot = privateTmpRoot();
  const fixture = privateMkdtempSync("tmpdacl-clean-");
  writeFileSync(join(fixture, "payload.txt"), "x");
  assert.equal(cleanupPrivateTmp(), true);
  assert.equal(existsSync(fixture), false);
  assert.equal(existsSync(oldRoot), false);
  assert.equal(cleanupPrivateTmp(), false, "a second cleanup has nothing to remove");
  const freshRoot = privateTmpRoot();
  assert.notEqual(freshRoot, oldRoot);
  assert.equal(statSync(freshRoot).isDirectory(), true);
  assert.equal(cleanupPrivateTmp(), true);
});
