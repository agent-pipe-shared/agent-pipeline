// SPDX-License-Identifier: SUL-1.0
//
// R7-1a: git child environments in these modules take the null-device value from GIT_NULL_DEVICE,
// never from a win32 "NUL" literal (Git for Windows 2.56 rejects NUL).
import { registerTestCaseCompletion } from "./test-case-completion.mjs";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { GIT_NULL_DEVICE } from "./git-null-device.mjs";
import { courseGitBytes } from "./critic-verify-lifecycle.mjs";

const MODULES = ["calibration-verify-commit-transition.mjs", "critic-verify-lifecycle.mjs"];

// Stable case ids, in registration order; never renumbered (append new cases at the end).
const cases = [];
const check = (id, name, run) => cases.push({ id, name, run });

for (const [index, name] of MODULES.entries()) {
  const source = readFileSync(new URL(`./${name}`, import.meta.url), "utf8");
  const ids = [`GND00${index * 2 + 1}`, `GND00${index * 2 + 2}`];

  check(ids[0], `${name}: no win32 "NUL" literal as a git env or -c value`, () => {
    const offenders = source.split(/\r?\n/u)
      .map((text, i) => ({ line: i + 1, text }))
      .filter(({ text }) => /["'`]NUL["'`]/u.test(text));
    assert.deepEqual(offenders, []);
  });

  check(ids[1], `${name}: git null-device values come from GIT_NULL_DEVICE`, () => {
    assert.match(source, /import\s*\{[^}]*\bGIT_NULL_DEVICE\b[^}]*\}\s*from\s*"\.\/git-null-device\.mjs"/u);
    assert.match(source, /GIT_CONFIG_GLOBAL:\s*GIT_NULL_DEVICE\b/u);
    assert.doesNotMatch(source, /GIT_CONFIG_(?:GLOBAL|SYSTEM):\s*"\/dev\/null"/u);
    assert.doesNotMatch(source, /GIT_CONFIG_(?:GLOBAL|SYSTEM):\s*process\.platform/u);
  });
}

check("GND005", "shared constant is /dev/null", () => {
  assert.equal(GIT_NULL_DEVICE, "/dev/null");
});

check("GND006", "critic-verify-lifecycle courseGitBytes hands the stub git the GIT_NULL_DEVICE env values", () => {
  let seen = null;
  const stub = (command, args, options) => {
    seen = { command, args, env: options.env };
    return { status: 0, signal: null, stdout: Buffer.from("ok"), stderr: Buffer.alloc(0) };
  };
  const out = courseGitBytes("/some/root", ["--version"], stub);
  assert.equal(out.toString(), "ok");
  assert.equal(seen.command, "git");
  assert.equal(seen.env.GIT_CONFIG_GLOBAL, GIT_NULL_DEVICE);
  assert.equal(seen.env.GIT_CONFIG_SYSTEM, GIT_NULL_DEVICE);
  assert.notEqual(seen.env.GIT_CONFIG_GLOBAL, ["N", "UL"].join(""));
});

const realGit = spawnSync("git", ["--version"], { encoding: "utf8" });
const gitAvailable = !realGit.error && realGit.status === 0;

check("GND007", "real git accepts GIT_CONFIG_GLOBAL=GIT_NULL_DEVICE (exit 0)", (context) => {
  if (!gitAvailable) { context.skip("git not on PATH"); return; }
  const result = spawnSync("git", ["config", "--global", "--list"], {
    encoding: "utf8", env: { ...process.env, GIT_CONFIG_GLOBAL: GIT_NULL_DEVICE, GIT_CONFIG_NOSYSTEM: "1" } });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr);
});

check("GND008", "real git runs through courseGitBytes with the constant", (context) => {
  if (!gitAvailable) { context.skip("git not on PATH"); return; }
  const out = courseGitBytes(dirname(fileURLToPath(import.meta.url)), ["--version"]);
  assert.match(out.toString("utf8"), /^git version /u);
});

registerTestCaseCompletion({ cases, fd: 3, maxBytes: 65536 });
