// SPDX-License-Identifier: SUL-1.0
/**
 * Pin: GG-11 / GG-15 admit env templates and env files under tests/fixtures/ (PO decision D17).
 * Drives the real hooks/guard-git.mjs as a subprocess with a PreToolUse Bash payload.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { createGovernanceScopeController } from "../governance-scope.mjs";

const GUARD = fileURLToPath(new URL("../../hooks/guard-git.mjs", import.meta.url));
const root = mkdtempSync(join(tmpdir(), "gg11-pin-"));

function enroll(dir) {
  const init = spawnSync("git", ["init", "-q", dir], { encoding: "utf8" });
  assert.equal(init.status, 0, init.stderr);
  const controller = createGovernanceScopeController({ hostStateRoot: join(dir, ".git", "fixture-hoststate") });
  const plan = controller.planDecision({ rootDir: dir, decision: "enroll", by: "disposable-guard-fixture" });
  controller.applyDecision(plan, { activate: true, planSha256: plan.planSha256 });
  mkdirSync(join(dir, ".claude"), { recursive: true });
  writeFileSync(join(dir, ".claude", "guard-config.json"), JSON.stringify({ commitTrailerPolicy: "off" }));
}
enroll(root);
test.after(() => rmSync(root, { recursive: true, force: true }));

function guard(command) {
  const { PIPELINE_GUARD_OVERRIDE: _drop, ...baseEnv } = process.env;
  const res = spawnSync(process.execPath, [GUARD], {
    input: JSON.stringify({ tool_input: { command } }),
    encoding: "utf8",
    cwd: root,
    env: { ...baseEnv, CLAUDE_PROJECT_DIR: root },
  });
  return { code: res.status, stderr: res.stderr ?? "" };
}

const ADMITTED = [
  ".env.example",
  ".env.sample",
  ".env.template",
  ".env.local.example",
  ".env.a.b.example",
  "config/.env.example",
  "tests/fixtures/ci.env",
  "tests/fixtures/.env",
  "pkg/tests/fixtures/x/.env",
];
const BLOCKED = [
  ".env",
  ".env.local",
  ".env.production",
  ".env.example.bak",
  ".env.examples",
  "config/.env",
  "mytests/fixtures/x.env",
  "tests/fixtures-old/x.env",
  "tests/fixtures/../.env",
  "tests/fixtures/secrets.yaml",
  "tests/fixtures/id_rsa",
  "tests/fixtures/id_ed25519",
  "tests/fixtures/a.pem",
  "tests/fixtures/a.key",
  "secrets.yaml",
];

for (const p of ADMITTED) {
  test(`admits unquoted: git add -- ${p}`, () => {
    const r = guard(`git add -- ${p}`);
    assert.equal(r.code, 0, r.stderr);
  });
  test(`admits quoted: git add -- "${p}"`, () => {
    assert.equal(guard(`git add -- "${p}"`).code, 0);
    assert.equal(guard(`git add -- '${p}'`).code, 0);
  });
}

for (const p of BLOCKED) {
  test(`blocks unquoted: git add -- ${p}`, () => {
    const r = guard(`git add -- ${p}`);
    assert.equal(r.code, 2);
    assert.match(r.stderr, /GG-11/);
  });
  test(`blocks quoted: git add -- "${p}"`, () => {
    for (const q of [`"${p}"`, `'${p}'`]) {
      const r = guard(`git add -- ${q}`);
      assert.equal(r.code, 2, q);
      assert.match(r.stderr, /GG-15/);
    }
  });
}

test("a mix of an admitted and a non-admitted path blocks", () => {
  assert.equal(guard("git add .env.example .env").code, 2);
  assert.equal(guard("git add .env .env.example").code, 2);
  assert.equal(guard("git add -- tests/fixtures/ci.env .env.local").code, 2);
  assert.equal(guard(`git add ".env.example" ".env"`).code, 2);
  assert.equal(guard(`git add ".env.example" .env.production`).code, 2);
});

test("mixed admitted paths together are allowed", () => {
  assert.equal(guard("git add -- .env.example tests/fixtures/ci.env README.md").code, 0);
});

test("a later git add segment is still checked", () => {
  assert.equal(guard("git add .env.example && git add .env").code, 2);
});

test("git add . and -A behave as before (allowed by GG-11)", () => {
  assert.equal(guard("git add .").code, 0);
  assert.equal(guard("git add -A").code, 0);
});

test("global-option interposition does not bypass", () => {
  assert.equal(guard("git -C sub add .env").code, 2);
  assert.equal(guard("git -C sub add .env.example").code, 0);
});
