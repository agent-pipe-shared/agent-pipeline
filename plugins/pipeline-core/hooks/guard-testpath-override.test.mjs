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
 * The setting lives in `pipeline.user.yaml`. This header used to claim that GS-1 refuses
 * that file "through both the write lane and the shell lane", so an agent could not reach
 * `chat` by writing it. That was the T2 Critic's C1 blocker and it is false: the shell lane
 * matches the literal filename in the command text, so a name assembled at runtime walks
 * past it, and no string matching fixes that. The correction landed in guard-testpath.mjs
 * but this copy of the claim survived, which the T3 Critic then found as K2 -- the same
 * sentence, still asserting the wrong mechanism, in the very suite that tests it.
 *
 * What actually makes this a gate: `readPushApprovalMode` refuses to trust a working-tree
 * copy that differs from the blob committed at that file's own path, and returns the
 * strongest mode instead. An in-session write therefore cannot weaken this gate -- though a
 * write FOLLOWED BY A COMMIT can, which is recorded rather than papered over. OT15..OT18
 * below exercise exactly that boundary.
 *
 * Lives in its own file because `guard-testpath.test.mjs` is TP-2 protected.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { criticalProofWaiverFor } from "../lib/critical-human-proof-policy.mjs";
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

  check("OT02 signature mode refuses in-session activation and offers the signed route (ADR-0059 Decision 3/4)", () => {
    // Since ADR-0059 Decision 3, signature mode is no longer a hard wall: the guard always
    // attempts to consume first (harmless here -- nothing is armed), then offers the
    // mode-appropriate next step. What signature mode still refuses is the in-session
    // `activate` continuation; what it now offers instead is the signed route.
    const { blocked, stderr } = ask(fixture({ mode: "signature" }), PROTECTED);
    assert.equal(blocked, true);
    assert.match(stderr, /gates\.push_approval is "signature"/u);
    assert.match(stderr, /in-session activation step is refused/u);
    assert.match(stderr, /A signed override is admitted instead/u);
    assert.match(stderr, /--request-sha256\s+[a-f0-9]{64}\b/u, "signature mode must offer the signed route");
    assert.match(stderr, /authorize-by-signature\b/u);
    assert.doesNotMatch(stderr, /--activate\b/u, "signature mode must not offer the in-session activate step");
    assert.match(stderr, /outside\s+this session/u);
  });

  check("OT03 an absent, unreadable or unrecognised setting falls back to signature and offers the signed route", () => {
    for (const mode of [null, "whatever", ""]) {
      const { blocked, stderr } = ask(fixture({ mode }), PROTECTED);
      assert.equal(blocked, true, `mode=${String(mode)}`);
      assert.match(stderr, /gates\.push_approval is "signature"/u, `mode=${String(mode)}`);
      assert.match(stderr, /in-session activation step is refused/u, `mode=${String(mode)}`);
      assert.match(stderr, /--request-sha256\s+[a-f0-9]{64}\b/u, `mode=${String(mode)} offered no route`);
      assert.match(stderr, /authorize-by-signature\b/u, `mode=${String(mode)}`);
      assert.doesNotMatch(stderr, /--activate\b/u, `mode=${String(mode)} must not offer the in-session activate step`);
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
    assert.match(stderr, /gates\.push_approval is "signature"/u);
    assert.match(stderr, /in-session activation step is refused/u);
    assert.match(stderr, /authorize-by-signature\b/u);
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

  // ---- C1: an in-session write to the setting must not weaken this gate ------------

  check("OT15 an uncommitted chat setting does not admit the chat-mode continuation", () => {
    // The T2 Critic's blocker, as a test. The shell lane refuses the literal filename but
    // not a name assembled at runtime, so the write itself is assumed to succeed -- the
    // fixture simply performs it. What must hold is that the write buys nothing: the
    // resolved mode stays signature, so the route offered (if any) is the signed one, not
    // the chat-mode activate continuation the uncommitted write asked for.
    const root = fixture({ mode: "signature" });
    writeFileSync(join(root, "pipeline.user.yaml"),
      'schema: "pipeline.user.v3"\ngates:\n  push_approval: "chat"\n');
    const { blocked, stderr } = ask(root, PROTECTED);
    assert.equal(blocked, true, "an uncommitted flip to chat opened the gate");
    assert.match(stderr, /gates\.push_approval is "signature"/u, "an uncommitted flip to chat must not change the resolved mode");
    assert.match(stderr, /in-session activation step is refused/u);
    assert.match(stderr, /--request-sha256\s+[a-f0-9]{64}\b/u, "the committed (signature) mode still offers its own route");
    assert.match(stderr, /authorize-by-signature\b/u);
    assert.doesNotMatch(stderr, /--activate\b/u, "an uncommitted flip to chat must not offer the in-session activate step");
  });

  check("OT16 the same setting, committed, is honoured", () => {
    // The other half, so OT15 cannot pass by the reader being broken outright: identical
    // content, the only difference being that HEAD carries it.
    const root = fixture({ mode: "chat" });
    assert.match(ask(root, PROTECTED).stderr, /--request-sha256\s+[a-f0-9]{64}\b/u,
      "a committed chat setting was ignored, so OT15 proves nothing");
  });

  check("OT17 modifying a committed chat setting drops it to the strongest mode", () => {
    // The asymmetry, from the only starting point where it can be observed: HEAD says
    // chat, so the gate is open, and ANY in-session modification closes it again. Writing
    // the identical bytes back is deliberately not included -- that is not a modification,
    // and asserting it would pin the wrong property. The resolved mode still falls back to
    // signature, which (since ADR-0059 Decision 3/4) offers its own signed route rather than
    // no route at all -- what must not survive the modification is the chat continuation.
    for (const written of ["signature", "nonsense", ""]) {
      const root = fixture({ mode: "chat" });
      assert.match(ask(root, PROTECTED).stderr, /--request-sha256/u, "precondition: open");
      writeFileSync(join(root, "pipeline.user.yaml"),
        `schema: "pipeline.user.v3"\ngates:\n  push_approval: "${written}"\n`);
      const { blocked, stderr } = ask(root, PROTECTED);
      assert.equal(blocked, true, `written=${written}`);
      assert.match(stderr, /gates\.push_approval is "signature"/u, `written=${written}`);
      assert.match(stderr, /in-session activation step is refused/u, `written=${written}`);
      assert.match(stderr, /--request-sha256\s+[a-f0-9]{64}\b/u, `written=${written} must still offer the signed route`);
      assert.doesNotMatch(stderr, /--activate\b/u, `written=${written} must not offer the in-session activate step`);
    }
  });

  check("OT18 the push proof is not waived by an uncommitted setting either", () => {
    // The write's second and worse consequence: the same file also decides whether `push`
    // demands a detached Ed25519 proof. Checked through the policy reader directly.
    const root = fixture({ mode: "signature" });
    writeFileSync(join(root, "project", "critical-human-proof.json"), JSON.stringify({
      schema: "pipeline.critical-human-proof-policy.v1", requiredKinds: ["push"],
    }));
    writeFileSync(join(root, "pipeline.user.yaml"),
      'schema: "pipeline.user.v3"\ngates:\n  push_approval: "chat"\n');
    assert.equal(criticalProofWaiverFor(root, "push").waived, false,
      "an uncommitted flip to chat stood the push proof down");
  });

  console.log(`\nguard-testpath-override: ${passed} passed, ${failed} failed`);
} finally {
  for (const entry of roots) rmSync(entry, { recursive: true, force: true });
}
process.exit(failed === 0 ? 0 : 1);
