#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * The audited escape hatch for guard-testpath (PO decision, 2026-08-06).
 *
 * Until this existed, guard-testpath had no override of any kind. That looked strict but
 * left the repository holding an authorization nothing could exercise: "a genuine test
 * change is its own briefed task" is a sanctioned reason, and the only documented route —
 * editing the guard config — is itself refused to an agent by GS-4. Every such change
 * therefore cost a human round trip that left no record of why.
 *
 * Lives in its own file because `guard-testpath.test.mjs` is TP-2 protected and was
 * deliberately NOT lifted for this work.
 *
 * What is asserted here is the SAFETY half: the refusal still stands without an armed
 * capability, it survives an unusable override store, and it now names the audited route.
 * Arming and consuming a capability is the v2 protocol's own contract and is covered by
 * `human-guard-override` and `codex-pretool-guard`; this file does not re-test it.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HOOKS = dirname(fileURLToPath(import.meta.url));
const GUARD = join(HOOKS, "guard-testpath.mjs");
const PROTECTED = "harness/scripts/verify.mjs";
const roots = [];

function fixture({ git }) {
  const base = mkdtempSync(join(tmpdir(), "testpath-override-"));
  roots.push(base);
  mkdirSync(join(base, "project"), { recursive: true });
  writeFileSync(join(base, "project", "guard-config.json"), JSON.stringify({
    protectedTestPaths: [{ id: "TP-3", pattern: "harness/scripts/verify\\.mjs$", reason: "the single verify-gate script" }],
  }));
  writeFileSync(join(base, "project", "pipeline.yaml"), "schema: pipeline.manifest.v0\n");
  if (git) {
    // A bare `git init` is NOT enough: the override's repository observation needs a
    // real HEAD, and without one it degrades to "no route offered". Found by probing,
    // after an earlier version of this fixture made OT04 pass vacuously.
    spawnSync("git", ["init", "-q", base], { encoding: "utf8" });
    spawnSync("git", ["-C", base, "config", "user.email", "fixture@example.invalid"]);
    spawnSync("git", ["-C", base, "config", "user.name", "fixture"]);
    spawnSync("git", ["-C", base, "add", "-A"]);
    spawnSync("git", ["-C", base, "commit", "-qm", "fixture"]);
  }
  return base;
}

function ask(root, filePath) {
  const result = spawnSync(process.execPath, [GUARD], {
    input: JSON.stringify({ tool_name: "Edit", tool_input: { file_path: filePath }, cwd: root }),
    encoding: "utf8",
    cwd: root,
    env: { ...process.env, CLAUDE_PROJECT_DIR: root },
  });
  return { blocked: result.status !== 0, status: result.status, stderr: result.stderr ?? "" };
}

let passed = 0;
let failed = 0;
function check(name, callback) {
  try { callback(); console.log(`PASS ${name}`); passed += 1; }
  catch (error) { console.error(`FAIL ${name}: ${error.message}`); failed += 1; }
}

try {
  check("OT01 a protected test path is still refused with no capability armed", () => {
    // The override is opt-in per action. Its mere existence must never soften the default.
    const { blocked, stderr } = ask(fixture({ git: true }), PROTECTED);
    assert.equal(blocked, true);
    assert.match(stderr, /Rule ID: TP-3/u);
  });

  check("OT02 the refusal names the audited route instead of only a human round trip", () => {
    const { stderr } = ask(fixture({ git: true }), PROTECTED);
    assert.match(stderr, /audited override/u,
      "the refusal should tell the operator the sanctioned route exists");
  });

  check("OT03 an unusable override store leaves the refusal exactly as it was", () => {
    // No Git control path -> the override machinery cannot record anything. That must
    // degrade to the plain refusal, never to an allow.
    const { blocked, stderr } = ask(fixture({ git: false }), PROTECTED);
    assert.equal(blocked, true, "a broken override store must not become an authorization");
    assert.match(stderr, /Rule ID: TP-3/u);
    assert.doesNotMatch(stderr, /--request-sha256\s+\S/u,
      "no route may be offered when no request could be recorded");
  });

  check("OT04 the route is actually produced, with a real request digest", () => {
    // Asserted as present, not merely as well-formed-if-present: the earlier version of
    // this check tolerated absence and therefore proved nothing.
    const { stderr } = ask(fixture({ git: true }), PROTECTED);
    const match = stderr.match(/--request-sha256\s+([a-f0-9]{64})\b/u);
    assert.notEqual(match, null, `no override route was offered:\n${stderr}`);
    assert.match(stderr, /plan --repo/u, "the offered route must be the read-only planner");
  });

  check("OT05 an unrelated file is untouched by any of this", () => {
    assert.equal(ask(fixture({ git: true }), "src/app.mjs").blocked, false);
  });

  check("OT06 the guard consults the override before it refuses, not after", () => {
    // Ordering matters: consuming after emitting would make the capability unusable.
    const source = String(spawnSync(process.execPath, ["-e",
      `process.stdout.write(require("fs").readFileSync(${JSON.stringify(GUARD)}, "utf8"))`],
    { encoding: "utf8" }).stdout);
    const consumeAt = source.indexOf("consumeHumanGuardOverride({");
    const emitAt = source.indexOf("emit(2, [");
    assert.ok(consumeAt > 0 && emitAt > 0, "expected both the consume call and the refusal");
    assert.ok(consumeAt < emitAt, "the capability is consumed after the refusal is emitted");
  });

  console.log(`\nguard-testpath-override: ${passed} passed, ${failed} failed`);
} finally {
  for (const entry of roots) rmSync(entry, { recursive: true, force: true });
}
process.exit(failed === 0 ? 0 : 1);
