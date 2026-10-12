// SPDX-License-Identifier: SUL-1.0
//
// R7-1a: git child environments in these modules take the null-device value from GIT_NULL_DEVICE,
// never from a win32 "NUL" literal (Git for Windows 2.56 rejects NUL).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { GIT_NULL_DEVICE } from "./git-null-device.mjs";

const MODULES = ["calibration-verify-commit-transition.mjs", "critic-verify-lifecycle.mjs"];

for (const name of MODULES) {
  const source = readFileSync(new URL(`./${name}`, import.meta.url), "utf8");

  test(`${name}: no win32 "NUL" literal as a git env or -c value`, () => {
    const offenders = source.split(/\r?\n/u)
      .map((text, i) => ({ line: i + 1, text }))
      .filter(({ text }) => /["'`]NUL["'`]/u.test(text));
    assert.deepEqual(offenders, []);
  });

  test(`${name}: git null-device values come from GIT_NULL_DEVICE`, () => {
    assert.match(source, /import\s*\{[^}]*\bGIT_NULL_DEVICE\b[^}]*\}\s*from\s*"\.\/git-null-device\.mjs"/u);
    assert.match(source, /GIT_CONFIG_GLOBAL:\s*GIT_NULL_DEVICE\b/u);
    assert.doesNotMatch(source, /GIT_CONFIG_(?:GLOBAL|SYSTEM):\s*"\/dev\/null"/u);
    assert.doesNotMatch(source, /GIT_CONFIG_(?:GLOBAL|SYSTEM):\s*process\.platform/u);
  });
}

test("shared constant is /dev/null", () => {
  assert.equal(GIT_NULL_DEVICE, "/dev/null");
});
