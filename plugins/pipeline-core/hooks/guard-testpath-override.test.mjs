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
import {
  authorizeHumanGuardOverride,
  planHumanGuardOverride,
  prepareHumanGuardOverrideAuthorization,
  recordHumanGuardDenial,
} from "../lib/human-guard-override.mjs";

const HOOKS = dirname(fileURLToPath(import.meta.url));
const GUARD = join(HOOKS, "guard-testpath.mjs");
const PLUGIN_ROOT = join(HOOKS, "..");
const OVERRIDE_SCRIPT = join(PLUGIN_ROOT, "scripts", "guard-human-override.mjs");
const PROTECTED = "harness/scripts/verify.mjs";
/** Exactly the denial string guard-testpath builds from the fixture config: `<id>: <reason>`. */
const TP3_DENIAL = "TP-3: the single verify-gate script";
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

/**
 * Arm a real one-time capability through the whole v2 chain, exactly as the human would:
 * denial -> plan -> prepare-authorization -> authorize --activate.
 *
 * Driven through the library rather than the CLI so a failure names the step that broke.
 * Every digest below is part of the binding, so anything the guard hashes differently --
 * tool name, tool input, denial string, plugin identity -- yields a capability the guard
 * will not accept, which is the property OT11 exercises.
 */
function arm(root, toolInput, denialReason, { toolName = "Edit" } = {}) {
  const denials = [{ guard: "guard-testpath.mjs", reason: denialReason }];
  const shared = { rootDir: root, pluginRoot: PLUGIN_ROOT, scriptPath: OVERRIDE_SCRIPT };
  const recorded = recordHumanGuardDenial({ ...shared, toolName, toolInput, denials });
  assert.equal(recorded.status, "planned", `denial not plannable: ${JSON.stringify(recorded)}`);
  const { requestSha256 } = recorded;
  const planned = planHumanGuardOverride({ ...shared, requestSha256 });
  const reason = "briefed test-change task";
  const prepared = prepareHumanGuardOverrideAuthorization({
    ...shared, requestSha256, planSha256: planned.planSha256, reason,
  });
  const armed = authorizeHumanGuardOverride({
    ...shared,
    requestSha256,
    planSha256: planned.planSha256,
    selectionSha256: prepared.selectionSha256,
    reason,
    reasonSha256: prepared.reasonSha256,
    activate: true,
  });
  assert.equal(armed.status, "armed");
  return { planSha256: planned.planSha256, requestSha256 };
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

  // ---- F3: the allow path, which no test walked until now -------------------------

  check("OT10 an armed capability admits exactly the edit it was bound to", () => {
    const root = fixture({ mode: "chat" });
    assert.equal(ask(root, PROTECTED).blocked, true, "precondition: refused while unarmed");
    arm(root, { file_path: PROTECTED }, TP3_DENIAL);
    const { blocked, status, stderr } = ask(root, PROTECTED);
    assert.equal(blocked, false, `armed capability did not admit the edit (exit ${status}):\n${stderr}`);
    assert.match(stderr, /\[pipeline-human-override\] guard-testpath TP-3/u);
    assert.match(stderr, /capability consumed/u);
  });

  check("OT11 a capability bound to a different edit does not admit this one", () => {
    // The binding is the whole point: arming for file A must not open file B. Both are
    // TP-3 matches here, so only the tool-input digest separates them.
    const root = fixture({ mode: "chat" });
    arm(root, { file_path: PROTECTED }, TP3_DENIAL);
    const other = "nested/harness/scripts/verify.mjs";
    const { blocked, stderr } = ask(root, other);
    assert.equal(blocked, true, "a capability bound elsewhere admitted this edit");
    assert.match(stderr, /Rule ID: TP-3/u);
    assert.doesNotMatch(stderr, /capability consumed/u);
  });

  check("OT12 the capability is single-use: the same edit is refused again", () => {
    const root = fixture({ mode: "chat" });
    arm(root, { file_path: PROTECTED }, TP3_DENIAL);
    assert.equal(ask(root, PROTECTED).blocked, false, "precondition: first use is admitted");
    const { blocked, stderr } = ask(root, PROTECTED);
    assert.equal(blocked, true, "a consumed capability was accepted a second time");
    assert.doesNotMatch(stderr, /capability consumed/u);
  });

  check("OT13 signature mode ignores an armed capability entirely", () => {
    // The mode gate must sit in front of the capability, not beside it. Arming happens in
    // a chat-mode fixture, then the setting is flipped to signature under the same store.
    const root = fixture({ mode: "chat" });
    arm(root, { file_path: PROTECTED }, TP3_DENIAL);
    writeFileSync(join(root, "pipeline.user.yaml"),
      'schema: "pipeline.user.v3"\ngates:\n  push_approval: "signature"\n');
    const { blocked, stderr } = ask(root, PROTECTED);
    assert.equal(blocked, true, "signature mode consumed a capability it must not consult");
    assert.match(stderr, /no in-session override is admitted/u);
    assert.doesNotMatch(stderr, /capability consumed/u);
  });

  check("OT14 a protected test path under plugins/pipeline-core gets no plain route", () => {
    // Not a defect of this guard, but a coverage boundary worth pinning: eligibility treats
    // every `plugins/pipeline-core/**` write as Pipeline-author repair, which needs an
    // explicit source root and so never reaches "planned". In THIS repository that is four
    // of the five TP entries -- TP-1, TP-2, TP-4, TP-5 -- leaving TP-3 the only one the
    // override can serve. If eligibility ever changes, this check is where it surfaces.
    const root = mkdtempSync(join(tmpdir(), "testpath-override-src-"));
    roots.push(root);
    mkdirSync(join(root, "project"), { recursive: true });
    writeFileSync(join(root, "project", "guard-config.json"), JSON.stringify({
      protectedTestPaths: [
        { id: "TP-2", pattern: "plugins/pipeline-core/hooks/guard-testpath\\.test\\.mjs$", reason: "gates this very guard" },
        { id: "TP-3", pattern: "harness/scripts/verify\\.mjs$", reason: "the single verify-gate script" },
      ],
    }));
    writeFileSync(join(root, "pipeline.user.yaml"), 'schema: "pipeline.user.v3"\ngates:\n  push_approval: "chat"\n');
    spawnSync("git", ["init", "-q", root], { encoding: "utf8" });
    spawnSync("git", ["-C", root, "config", "user.email", "fixture@example.invalid"]);
    spawnSync("git", ["-C", root, "config", "user.name", "fixture"]);
    spawnSync("git", ["-C", root, "add", "-A"]);
    spawnSync("git", ["-C", root, "commit", "-qm", "fixture"]);

    const source = ask(root, "plugins/pipeline-core/hooks/guard-testpath.test.mjs");
    assert.equal(source.blocked, true);
    assert.match(source.stderr, /Rule ID: TP-2/u);
    assert.doesNotMatch(source.stderr, /--request-sha256\s+\S/u,
      "a plain override route was offered for a Pipeline-source path");

    // The differential half: the SAME fixture, same mode, same store -- only the path
    // differs. Without this, "no route" could just as well mean "this fixture never
    // produces one", and the check above would pass for the wrong reason.
    const ordinary = ask(root, PROTECTED);
    assert.equal(ordinary.blocked, true);
    assert.match(ordinary.stderr, /--request-sha256\s+[a-f0-9]{64}\b/u,
      "the fixture produces no route at all, so the assertion above proves nothing");
  });

  console.log(`\nguard-testpath-override: ${passed} passed, ${failed} failed`);
} finally {
  for (const entry of roots) rmSync(entry, { recursive: true, force: true });
}
process.exit(failed === 0 ? 0 : 1);
