#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * The audited escape hatch for guard-testpath, and the setting that decides whether it
 * counts at all.
 *
 * First shape of this feature was a blocker, found by the T1 Critic on 511d7d7: the v2
 * override's activation step (`guard-human-override.mjs authorize … --activate`) is an
 * ordinary command, and a ready session may run ordinary commands, so the agent the guard
 * constrains could arm its own capability. An override that its subject can arm is not an
 * override.
 *
 * PO decision: bind it to the same setting that decides how a human clears the push gate
 * (ADR-0056). `signature` -- the value in this repository and the fail-closed default for
 * anything absent, unreadable or unrecognised -- admits no in-session clearance at all.
 * Only an explicit `chat` admits the audited capability, and then the refusal says on its
 * face that it is attribution rather than proof.
 *
 * The setting lives in `pipeline.user.yaml`, which GS-1 refuses to the agent through both
 * the write lane and (since efe452c) the shell lane. That is what makes this a gate: an
 * agent cannot reach `chat` by writing it.
 *
 * Lives in its own file because `guard-testpath.test.mjs` is TP-2 protected.
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

/** `mode: null` writes no pipeline.user.yaml at all -- the fail-closed default path. */
function fixture({ git = true, mode = null } = {}) {
  const base = mkdtempSync(join(tmpdir(), "testpath-override-"));
  roots.push(base);
  mkdirSync(join(base, "project"), { recursive: true });
  writeFileSync(join(base, "project", "guard-config.json"), JSON.stringify({
    protectedTestPaths: [{ id: "TP-3", pattern: "harness/scripts/verify\\.mjs$", reason: "the single verify-gate script" }],
  }));
  writeFileSync(join(base, "project", "pipeline.yaml"), "schema: pipeline.manifest.v0\n");
  if (mode !== null) {
    writeFileSync(join(base, "pipeline.user.yaml"), `schema: "pipeline.user.v3"\ngates:\n  push_approval: "${mode}"\n`);
  }
  if (git) {
    // A bare `git init` is NOT enough: the override's repository observation needs a real
    // HEAD, and without one it degrades to "no route offered". Found by probing, after an
    // earlier version of this fixture made the route check pass vacuously.
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
  check("OT01 a protected test path is refused with no capability armed", () => {
    const { blocked, stderr } = ask(fixture({ mode: "chat" }), PROTECTED);
    assert.equal(blocked, true);
    assert.match(stderr, /Rule ID: TP-3/u);
  });

  check("OT02 signature mode admits no in-session override and offers no route", () => {
    // The blocker, stated as a test. In signature mode the capability is never consulted.
    const { blocked, stderr } = ask(fixture({ mode: "signature" }), PROTECTED);
    assert.equal(blocked, true);
    assert.match(stderr, /no in-session override is admitted/u);
    assert.doesNotMatch(stderr, /--request-sha256/u, "a route must not be offered in signature mode");
    assert.match(stderr, /outside\s+this session/u);
  });

  check("OT03 an absent, unreadable or unrecognised setting falls back to signature", () => {
    for (const mode of [null, "whatever", ""]) {
      const { blocked, stderr } = ask(fixture({ mode }), PROTECTED);
      assert.equal(blocked, true, `mode=${String(mode)}`);
      assert.match(stderr, /no in-session override is admitted/u, `mode=${String(mode)}`);
      assert.doesNotMatch(stderr, /--request-sha256/u, `mode=${String(mode)} offered a route`);
    }
  });

  check("OT04 chat mode offers the audited route, with a real request digest", () => {
    const { stderr } = ask(fixture({ mode: "chat" }), PROTECTED);
    assert.notEqual(stderr.match(/--request-sha256\s+([a-f0-9]{64})\b/u), null,
      `no override route was offered:\n${stderr}`);
    assert.match(stderr, /plan --repo/u, "the offered route must be the read-only planner");
  });

  check("OT05 chat mode says on its face that the override is attribution, not proof", () => {
    assert.match(ask(fixture({ mode: "chat" }), PROTECTED).stderr, /attribution, not proof/u);
  });

  check("OT06 an unusable override store leaves the refusal exactly as it was", () => {
    // No Git control path -> the override machinery cannot record anything. That must
    // degrade to the plain refusal, never to an allow.
    const { blocked, stderr } = ask(fixture({ git: false, mode: "chat" }), PROTECTED);
    assert.equal(blocked, true, "a broken override store must not become an authorization");
    assert.match(stderr, /Rule ID: TP-3/u);
    assert.doesNotMatch(stderr, /--request-sha256\s+\S/u);
  });

  check("OT07 an unrelated file is untouched by any of this", () => {
    assert.equal(ask(fixture({ mode: "chat" }), "src/app.mjs").blocked, false);
    assert.equal(ask(fixture({ mode: "signature" }), "src/app.mjs").blocked, false);
  });

  check("OT08 the guard consults the override before it refuses, not after", () => {
    // Ordering matters: consuming after emitting would make the capability unusable.
    const source = String(spawnSync(process.execPath, ["-e",
      `process.stdout.write(require("fs").readFileSync(${JSON.stringify(GUARD)}, "utf8"))`],
    { encoding: "utf8" }).stdout);
    const consumeAt = source.indexOf("consumeHumanGuardOverride({");
    const emitAt = source.indexOf("emit(2, [");
    assert.ok(consumeAt > 0 && emitAt > 0, "expected both the consume call and the refusal");
    assert.ok(consumeAt < emitAt, "the capability is consumed after the refusal is emitted");
  });

  check("OT09 the mode is read from pipeline.user.yaml, which GS-1 protects", () => {
    // If the setting were readable from somewhere an agent may write, the gate would be a
    // request again. Pinned against the shared reader's own source path.
    const source = String(spawnSync(process.execPath, ["-e",
      `process.stdout.write(require("fs").readFileSync(${JSON.stringify(join(HOOKS, "..", "lib", "critical-human-proof-policy.mjs"))}, "utf8"))`],
    { encoding: "utf8" }).stdout);
    assert.match(source, /USER_SOURCE_PATH/u);
    assert.match(source, /gates\?\.push_approval/u);
  });

  console.log(`\nguard-testpath-override: ${passed} passed, ${failed} failed`);
} finally {
  for (const entry of roots) rmSync(entry, { recursive: true, force: true });
}
process.exit(failed === 0 ? 0 : 1);
