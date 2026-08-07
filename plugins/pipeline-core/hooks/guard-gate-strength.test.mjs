#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * An agent must not be able to weaken the gate that authorizes its own actions.
 *
 * The question this answers was asked directly: what stops an agent writing
 * `gates.push_approval: "chat"` into pipeline.user.yaml and pushing on its own
 * authority? Measured answer at the time: nothing. guard-testpath, guard-devplan and
 * guard-lifecycle-ready all returned 0 for that Edit, and the file was edited during
 * the very session that asked. A prior review had recorded the path as protected
 * because `human-guard-override.mjs` lists it in a function named `protectedPath()`
 * — which classifies what an override may touch and gates nothing.
 */
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { GATE_STRENGTH_PATHS, LIVE_PLUGIN_RULE, gateStrengthRuleFor, insideLivePlugin, livePluginRoots } from "./guard-gate-strength.mjs";
import { installGuardMaintenanceWindow, prepareGuardMaintenanceWindowRequest } from "../lib/guard-maintenance-window.mjs";
import { createPoApprovalIntent, PO_APPROVAL_PROOF_SCHEMA } from "../lib/po-approval-proof.mjs";
import {
  HGO_SIGNATURE_REASON,
  authorizeHumanGuardOverride,
  authorizeHumanGuardOverrideBySignature,
  planHumanGuardOverride,
  prepareHumanGuardOverrideAuthorization,
  recordHumanGuardDenial,
} from "../lib/human-guard-override.mjs";

const HOOKS = dirname(fileURLToPath(import.meta.url));
const GUARD = join(HOOKS, "guard-gate-strength.mjs");
const PLUGIN_ROOT = join(HOOKS, "..");
const OVERRIDE_SCRIPT = join(PLUGIN_ROOT, "scripts", "guard-human-override.mjs");
const roots = [];

function governed() {
  const base = mkdtempSync(join(tmpdir(), "gate-strength-"));
  roots.push(base);
  mkdirSync(join(base, "project"), { recursive: true });
  writeFileSync(join(base, "pipeline.user.yaml"), 'schema: "pipeline.user.v3"\ngates:\n  push_approval: "signature"\n');
  writeFileSync(join(base, "project", "pipeline.yaml"), "schema: pipeline.manifest.v0\n");
  writeFileSync(join(base, "project", "guard-config.json"), '{"protectedTestPaths":[]}\n');
  writeFileSync(join(base, "project", "critical-human-proof.json"), '{"schema":"pipeline.critical-human-proof-policy.v1","requiredKinds":["push"]}\n');
  writeFileSync(join(base, "README.md"), "# fixture\n");
  return base;
}
function ask(root, filePath, extraEnv = {}) {
  const env = { ...process.env, CLAUDE_PROJECT_DIR: root, ...extraEnv };
  for (const [key, value] of Object.entries(extraEnv)) if (value === undefined) delete env[key];
  const result = spawnSync(process.execPath, [GUARD], {
    input: JSON.stringify({ tool_name: "Edit", tool_input: { file_path: filePath }, cwd: root }),
    encoding: "utf8",
    cwd: root,
    env,
  });
  return { blocked: result.status !== 0, stderr: result.stderr ?? "" };
}

let passed = 0;
let failed = 0;
function check(name, callback) {
  try { callback(); console.log(`PASS ${name}`); passed += 1; }
  catch (error) { console.error(`FAIL ${name}: ${error.message}`); failed += 1; }
}

try {
  check("GST01 every gate-strength path is refused, by absolute and relative form", () => {
    const root = governed();
    for (const rule of GATE_STRENGTH_PATHS) {
      if (rule.path.startsWith(".claude/")) continue; // not present in this fixture
      for (const form of [join(root, rule.path), rule.path]) {
        const { blocked, stderr } = ask(root, form);
        assert.equal(blocked, true, `${rule.id} not refused for ${form}`);
        assert.match(stderr, new RegExp(rule.id, "u"));
      }
    }
  });

  check("GST02 the refusal names the one sanctioned escape and offers no in-session override", () => {
    const root = governed();
    const { stderr } = ask(root, "pipeline.user.yaml");
    assert.match(stderr, /the PO edits this file directly, outside an agent session/u);
    assert.doesNotMatch(stderr, /PIPELINE_GUARD_OVERRIDE|OVERRIDE </u,
      "an in-session override for weakening one's own gate is the same hole with an extra step");
  });

  check("GST03 ordinary files are untouched", () => {
    const root = governed();
    for (const path of ["README.md", "docs/state.md", "plugins/pipeline-core/lib/manifest.mjs", "project/pipeline-state.json"]) {
      assert.equal(ask(root, path).blocked, false, `${path} must not be refused`);
    }
  });

  check("GST04 a path escaping the repository is not claimed by this guard", () => {
    const root = governed();
    assert.equal(ask(root, "/etc/pipeline.user.yaml").blocked, false);
    assert.equal(ask(root, "../pipeline.user.yaml").blocked, false);
  });

  check("GST05 a directory with no pipeline marker at all is left alone", () => {
    // The marker set is the file NAMES themselves, so a repository that carries any of
    // them is governed for this purpose even if their contents are unrelated. That is
    // deliberate and conservative: over-protecting a file called pipeline.user.yaml
    // costs a stranger nothing, under-protecting it costs the gate everything.
    const base = mkdtempSync(join(tmpdir(), "gate-strength-plain-"));
    roots.push(base);
    writeFileSync(join(base, "README.md"), "# unrelated project\n");
    assert.equal(ask(base, "project/pipeline.yaml").blocked, false);
    assert.equal(ask(base, "pipeline.user.yaml").blocked, false);
  });

  check("GST06 the rule resolver is case-insensitive and separator-agnostic", () => {
    const root = governed();
    assert.ok(gateStrengthRuleFor("PROJECT/Guard-Config.JSON", root));
    assert.ok(gateStrengthRuleFor(join(root, "project", "pipeline.yaml"), root));
    assert.equal(gateStrengthRuleFor("project/pipeline-state.json", root), null);
  });

  check("GST07 the guard is actually wired into PreToolUse for every write tool", () => {
    // A guard that is correct and unwired protects nothing. This is the half that the
    // prior review assumed and that did not exist. Asserted per tool name rather than
    // against an exact matcher string, so adding a newly discovered write tool is a
    // one-line wiring change and not a test rewrite -- NotebookEdit was added on
    // 2026-08-06 after it was found to be covered by no matcher at all.
    const hooks = JSON.parse(readFileSync(join(HOOKS, "hooks.json"), "utf8"));
    const wired = (hooks.hooks?.PreToolUse ?? []).filter((entry) =>
      (entry.hooks ?? []).some((hook) => String(hook.command).includes("guard-gate-strength.mjs")));
    assert.equal(wired.length, 1, `expected exactly one wiring, found ${wired.length}`);
    const tools = String(wired[0].matcher).split("|");
    for (const tool of ["Edit", "Write", "NotebookEdit"]) {
      assert.ok(tools.includes(tool), `matcher "${wired[0].matcher}" does not name ${tool}`);
    }
  });

  check("GST08 this repository's own gate is not currently weakened", () => {
    // Reads the live source of truth: if a `chat` mode were ever committed here it
    // would be a finding, not a configuration choice.
    const repoRoot = join(HOOKS, "..", "..", "..");
    const source = readFileSync(join(repoRoot, "pipeline.user.yaml"), "utf8");
    const line = source.split("\n").map((entry) => entry.trim()).find((entry) => entry.startsWith("push_approval:"));
    assert.equal(line, 'push_approval: "signature"', `gate strength reads ${line}`);
  });

  check("GST09 the guard code that is enforcing right now is not agent-writable (GS-6)", () => {
    // hooks.json is read once at session start, so rewiring it only bites next session. A guard
    // SCRIPT is re-read per invocation, so `process.exit(0)` written into the installed
    // guard-push.mjs disarms the push gate immediately, in the same session. Measured before
    // this rule existed: nothing in the guard family claimed that write.
    const base = mkdtempSync(join(tmpdir(), "gate-strength-live-"));
    roots.push(base);
    writeFileSync(join(base, "README.md"), "# unrelated, ungoverned\n");
    for (const target of ["hooks/guard-push.mjs", "hooks/hooks.json", "lib/manifest.mjs", "skills/pipeline-start/SKILL.md"]) {
      const { blocked, stderr } = ask(base, join(PLUGIN_ROOT, target));
      assert.equal(blocked, true, `${target} inside the live plugin must be refused`);
      assert.match(stderr, /GS-6/u);
    }
  });

  check("GST10 GS-6 does not depend on the project being governed", () => {
    // The plugin root is Pipeline code wherever it sits; an ungoverned cwd must not excuse it.
    const base = mkdtempSync(join(tmpdir(), "gate-strength-live2-"));
    roots.push(base);
    assert.equal(ask(base, join(PLUGIN_ROOT, "hooks", "guard-git.mjs")).blocked, true);
  });

  check("GST11 an over-broad CLAUDE_PLUGIN_ROOT cannot turn this into a blanket refusal", () => {
    const base = mkdtempSync(join(tmpdir(), "gate-strength-broad-"));
    roots.push(base);
    writeFileSync(join(base, "README.md"), "# unrelated\n");
    // A declared root with no hooks/ and no .claude-plugin/plugin.json is not this plugin.
    for (const declared of [base, "/", tmpdir()]) {
      assert.equal(ask(base, join(base, "README.md"), { CLAUDE_PLUGIN_ROOT: declared }).blocked, false,
        `CLAUDE_PLUGIN_ROOT=${declared} must not claim ordinary files`);
    }
  });

  check("GST12 a source checkout stays writable when it is not the enforcing copy", () => {
    // In development the installed plugin enforces and the repository copy is ordinary product
    // source under Verify, Critic and the PO gate. Asserted on the boundary function directly,
    // because in this test process the live root IS the repository copy.
    const installed = join(tmpdir(), "installed-plugin-root", "pipeline-core");
    assert.equal(insideLivePlugin(join(installed, "hooks", "guard-push.mjs"), [installed]), true);
    assert.equal(insideLivePlugin(join(PLUGIN_ROOT, "hooks", "guard-push.mjs"), [installed]), false);
    // A sibling whose name merely shares a prefix is outside, not inside.
    assert.equal(insideLivePlugin(`${installed}-evil/hooks/guard-push.mjs`, [installed]), false);
    assert.equal(insideLivePlugin(installed, [installed]), false, "the root itself is not a file in it");
  });

  // ---- the shell lane -------------------------------------------------------------
  // GS-1..GS-6 refuse an Edit or a Write. A shell command is neither, and this guard is
  // wired into exactly one PreToolUse entry (GST07) whose matcher names only write tools.
  // Measured 2026-08-06: `touch project/guard-config.json` was admitted with nothing
  // claiming it, so the Edit refusal could be stepped around with `node -e`. Enforcement
  // for the shell lives in guard-lifecycle-ready.mjs, which is already Bash-wired and
  // already owns the read-only classifier; these checks assert it from the outside.
  const LIFECYCLE_GUARD = join(HOOKS, "guard-lifecycle-ready.mjs");
  function shell(root, command) {
    const result = spawnSync(process.execPath, [LIFECYCLE_GUARD, "--runner", "claude"], {
      input: JSON.stringify({ tool_name: "Bash", tool_input: { command }, cwd: root }),
      encoding: "utf8",
      cwd: root,
      env: { ...process.env, CLAUDE_PROJECT_DIR: root },
    });
    return { blocked: result.status !== 0, stderr: result.stderr ?? "" };
  }

  check("GST13 a shell command that writes a gate-strength file is refused", () => {
    const root = governed();
    const commands = [
      "touch project/guard-config.json",
      "cp /tmp/evil.yaml pipeline.user.yaml",
      "mv /tmp/evil.yaml project/pipeline.yaml",
      "git checkout -- project/guard-config.json",
      // The token-blind case: the path sits inside a quoted script argument.
      `node -e 'require("fs").writeFileSync("pipeline.user.yaml", "gates:\\n  push_approval: chat\\n")'`,
    ];
    for (const command of commands) {
      const { blocked, stderr } = shell(root, command);
      assert.equal(blocked, true, `admitted: ${command}`);
      assert.match(stderr, /GUARD-GATE-STRENGTH-SHELL/u, `wrong refusal for: ${command}`);
    }
  });

  check("GST14 reading a gate-strength file from the shell is never claimed by this rule", () => {
    // A guard that stops `cat pipeline.user.yaml` would make the repository unworkable.
    // Asserted as "not refused BY THIS RULE" rather than "admitted", because a governed
    // fixture with no ready bootstrap has its own separate reasons to refuse.
    const root = governed();
    for (const command of [
      "cat pipeline.user.yaml",
      "sha256sum project/guard-config.json",
      "git diff project/pipeline.yaml",
      "rg push_approval pipeline.user.yaml",
      "head -n 5 project/critical-human-proof.json",
    ]) {
      assert.doesNotMatch(shell(root, command).stderr, /GUARD-GATE-STRENGTH-SHELL/u,
        `read-only command claimed by the gate-strength rule: ${command}`);
    }
  });

  check("GST15 the shell refusal offers no in-session override either", () => {
    const root = governed();
    const { stderr } = shell(root, "touch pipeline.user.yaml");
    assert.match(stderr, /outside an agent session/u);
    assert.doesNotMatch(stderr, /PIPELINE_GUARD_OVERRIDE/u);
  });

  check("GST16 an unrelated command in the same repository is untouched", () => {
    const root = governed();
    assert.doesNotMatch(shell(root, "touch README.md").stderr, /GUARD-GATE-STRENGTH-SHELL/u);
  });

  check("GST17 every rule in the table is refused by both lanes", () => {
    // An earlier version of this check asserted that each basename had "at least one
    // covering rule" -- but the basename was derived from the same array it then searched,
    // so the assertion could not fail. The T2 Critic caught it (C2); it is recorded here
    // because a test that cannot fail is worse than no test, and this one carried a name
    // suggesting it guarded F5.
    //
    // What is actually checked now: both lanes refuse every path in the table. That can
    // fail -- if the shell lane stopped deriving its needles from GATE_STRENGTH_PATHS, or
    // a rule were added whose exact path the write lane matches but whose spelling the
    // shell lane misses, this goes red.
    //
    // Its limits, stated in full because the T3 Critic found the earlier version of this
    // note too generous (K6). It cannot catch a tier absent from BOTH lanes, and -- the
    // case that matters, since it is F5's own shape -- it cannot catch a tier the SHELL
    // lane refuses while the write lane does not. The shell needle is
    // `basename(rule.path)`, so `guard-config.json` covers both `project/` and `.claude/`
    // spellings whether or not the table lists them, and only paths already in the table
    // are iterated here. GST18 names the tiers explicitly for exactly that reason, and the
    // write-lane half below largely duplicates GST01.
    const root = governed();
    for (const rule of GATE_STRENGTH_PATHS) {
      const write = spawnSync(process.execPath, [GUARD], {
        input: JSON.stringify({ tool_name: "Edit", tool_input: { file_path: rule.path }, cwd: root }),
        encoding: "utf8",
        cwd: root,
        env: { ...process.env, CLAUDE_PROJECT_DIR: root },
      });
      assert.notEqual(write.status, 0, `write lane admits ${rule.path}`);
      assert.match(write.stderr ?? "", new RegExp(`Rule ID: ${rule.id}\\b`, "u"));
      assert.match(shell(root, `touch ${rule.path}`).stderr, /GUARD-GATE-STRENGTH-SHELL/u,
        `shell lane admits ${rule.path}`);
    }
  });

  check("GST18 both authority tiers of the guard config are defended", () => {
    // Named rather than derived, so dropping either tier fails loudly instead of shrinking
    // the loop above into agreement with itself.
    const paths = GATE_STRENGTH_PATHS.map((rule) => rule.path);
    assert.ok(paths.includes("project/guard-config.json"), "neutral-tier guard config is unprotected");
    assert.ok(paths.includes(".claude/guard-config.json"), "legacy-tier guard config is unprotected");
    assert.ok(paths.includes("project/pipeline.yaml"), "neutral-tier manifest is unprotected");
    assert.ok(paths.includes(".claude/pipeline.yaml"), "legacy-tier manifest is unprotected");
  });

  check("GST19 a legacy-tier project's guard config is refused through the write lane", () => {
    // The end-to-end shape of F5: a repository that never migrated, governed only by its
    // legacy marker, editing the file that names every other guard's protected paths.
    const root = mkdtempSync(join(tmpdir(), "gate-strength-legacy-"));
    roots.push(root);
    mkdirSync(join(root, ".claude"), { recursive: true });
    writeFileSync(join(root, ".claude", "guard-config.json"), JSON.stringify({ protectedTestPaths: [] }));
    const result = spawnSync(process.execPath, [GUARD], {
      input: JSON.stringify({ tool_name: "Edit", tool_input: { file_path: ".claude/guard-config.json" }, cwd: root }),
      encoding: "utf8",
      cwd: root,
      env: { ...process.env, CLAUDE_PROJECT_DIR: root },
    });
    assert.notEqual(result.status, 0, "the legacy-tier guard config was writable");
    assert.match(result.stderr ?? "", /Rule ID: GS-7/u);
  });

  check("GST20 a real armed GS-6 window lifts an ordinary plugin file but a kernel path stays refused", () => {
    const root = mkdtempSync(join(tmpdir(), "gate-strength-gmw-"));
    roots.push(root);
    execFileSync("git", ["init", "-q"], { cwd: root });
    execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: root });
    execFileSync("git", ["config", "user.name", "Test"], { cwd: root });
    mkdirSync(join(root, "project"), { recursive: true });
    writeFileSync(join(root, "plan.md"), "plan\n");
    writeFileSync(join(root, "spec.md"), "spec\n");
    const pair = generateKeyPairSync("ed25519");
    const publicKey = pair.publicKey.export({ type: "spki", format: "pem" });
    const publicKeySha256 = createHash("sha256").update(publicKey).digest("hex");
    writeFileSync(join(root, "project", "critical-human-proof.json"), JSON.stringify({
      schema: "pipeline.critical-human-proof-policy.v1", requiredKinds: ["push"],
      trustAnchor: { keyReference: "gst-e2e", publicKeySha256 },
    }));
    execFileSync("git", ["add", "-A"], { cwd: root });
    execFileSync("git", ["commit", "-q", "-m", "gmw-fixture"], { cwd: root });
    const livePluginRoot = livePluginRoots()[0];
    const { intent, request } = prepareGuardMaintenanceWindowRequest({
      rootDir: root, scopeRuleIds: ["GS-6"], ttlSeconds: 300, reason: "GST20",
      featureId: "gst20", planSha256: createHash("sha256").update("plan\n").digest("hex"),
      specSha256: createHash("sha256").update("spec\n").digest("hex"), policyRevision: "gst20-v1", livePluginRoot,
    });
    const proof = {
      schema: PO_APPROVAL_PROOF_SCHEMA, intentSha256: intent.sha256, keyReference: "gst-e2e", publicKey,
      signatureBase64: sign(null, Buffer.from(intent.sha256, "utf8"), pair.privateKey).toString("base64"),
    };
    installGuardMaintenanceWindow({ rootDir: root, request, trustPolicy: { keyReference: "gst-e2e", publicKeySha256 }, proof, livePluginRoot });

    const ordinary = ask(root, join(PLUGIN_ROOT, "hooks", "guard-git.mjs"));
    assert.equal(ordinary.blocked, false, "ordinary plugin file should be lifted under the active window");
    assert.match(ordinary.stderr, /guard-maintenance-window.*GS-6 lifted/u);

    const kernel = ask(root, join(PLUGIN_ROOT, "hooks", "guard-gate-strength.mjs"));
    assert.equal(kernel.blocked, true, "kernel path must stay refused under the SAME active window");
    assert.doesNotMatch(kernel.stderr, /lifted/u);
    const kernel2 = ask(root, join(PLUGIN_ROOT, "hooks", "hooks.json"));
    assert.equal(kernel2.blocked, true);
  });

  // ---- ADR-0059 Decision 3 / its follow-up on this guard specifically: the
  // always-attempt-consume-first lift for GS-1..GS-5/GS-7, and the GS-6 exclusion
  // that stays completely unchanged. Fixture helpers mirror
  // guard-testpath-override.test.mjs's own `arm()` shape (denial -> plan ->
  // prepare-authorization -> authorize) rather than reinventing it, plus a second
  // arming path for the genuine detached-signature route this guard also offers.
  function governedGit({ mode = "chat", trustAnchor = null } = {}) {
    const base = mkdtempSync(join(tmpdir(), "gate-strength-hgo-"));
    roots.push(base);
    mkdirSync(join(base, "project"), { recursive: true });
    writeFileSync(join(base, "pipeline.user.yaml"), `schema: "pipeline.user.v3"\ngates:\n  push_approval: "${mode}"\n`);
    writeFileSync(join(base, "project", "pipeline.yaml"), "schema: pipeline.manifest.v0\n");
    writeFileSync(join(base, "project", "guard-config.json"), '{"protectedTestPaths":[]}\n');
    const policy = trustAnchor
      ? { schema: "pipeline.critical-human-proof-policy.v1", requiredKinds: ["push"], trustAnchor }
      : { schema: "pipeline.critical-human-proof-policy.v1", requiredKinds: ["push"] };
    writeFileSync(join(base, "project", "critical-human-proof.json"), JSON.stringify(policy));
    writeFileSync(join(base, "README.md"), "# fixture\n");
    execFileSync("git", ["init", "-q"], { cwd: base });
    execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: base });
    execFileSync("git", ["config", "user.name", "Test"], { cwd: base });
    execFileSync("git", ["add", "-A"], { cwd: base });
    execFileSync("git", ["commit", "-q", "-m", "fixture"], { cwd: base });
    return base;
  }

  function keyPair() {
    const pair = generateKeyPairSync("ed25519");
    const publicKeyPem = pair.publicKey.export({ type: "spki", format: "pem" });
    return {
      privateKey: pair.privateKey,
      publicKeyPem,
      publicKeySha256: createHash("sha256").update(publicKeyPem).digest("hex"),
    };
  }

  function denialFor(rule) {
    return `${rule.id}: ${rule.reason}`;
  }

  /** Exactly the chain a human clears in `chat` mode: denial -> plan -> prepare -> authorize --activate. */
  function armByChat(root, toolInput, denialReason, { toolName = "Edit" } = {}) {
    const denials = [{ guard: "guard-gate-strength.mjs", reason: denialReason }];
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
    assert.equal(armed.status, "armed", `chat arming failed: ${JSON.stringify(armed)}`);
    return { planSha256: planned.planSha256, requestSha256 };
  }

  /**
   * The genuine detached-signature chain (ADR-0059 Decision 1): denial -> plan ->
   * prepare (fixed HGO_SIGNATURE_REASON text) -> sign the rebuilt PO-approval intent
   * -> authorize-by-signature. No in-session `activate` step exists for this path;
   * presence of a verified signature IS the authorization.
   */
  function armBySignature(root, toolInput, denialReason, { toolName = "Edit", pair, keyReference } = {}) {
    const denials = [{ guard: "guard-gate-strength.mjs", reason: denialReason }];
    const shared = { rootDir: root, pluginRoot: PLUGIN_ROOT, scriptPath: OVERRIDE_SCRIPT };
    const recorded = recordHumanGuardDenial({ ...shared, toolName, toolInput, denials });
    assert.equal(recorded.status, "planned", `denial not plannable: ${JSON.stringify(recorded)}`);
    const { requestSha256 } = recorded;
    const planned = planHumanGuardOverride({ ...shared, requestSha256 });
    const prepared = prepareHumanGuardOverrideAuthorization({
      ...shared, requestSha256, planSha256: planned.planSha256, reason: HGO_SIGNATURE_REASON,
    });
    const intent = createPoApprovalIntent({
      kind: "guard-override",
      featureId: "human-guard-override",
      planSha256: createHash("sha256").update("pipeline.human-guard-override-signature-plan.v1").digest("hex"),
      specSha256: createHash("sha256").update("pipeline.human-guard-override-signature-spec.v1").digest("hex"),
      candidate: { commit: planned.repository.head, tree: planned.repository.tree },
      policyRevision: "human-guard-override-signature-v1",
      subjectSha256: prepared.selectionSha256,
      decision: "authorize",
    });
    const proof = {
      schema: PO_APPROVAL_PROOF_SCHEMA,
      intentSha256: intent.sha256,
      keyReference,
      publicKey: pair.publicKeyPem,
      signatureBase64: sign(null, Buffer.from(intent.sha256, "utf8"), pair.privateKey).toString("base64"),
    };
    const armed = authorizeHumanGuardOverrideBySignature({
      ...shared, requestSha256, planSha256: planned.planSha256, proof,
    });
    assert.equal(armed.status, "armed", `signature arming failed: ${JSON.stringify(armed)}`);
    return { planSha256: planned.planSha256, requestSha256 };
  }

  /** A GS-6 target that lives INSIDE the fixture itself, via a declared plugin root. */
  function declaredLivePluginFixture({ mode = "chat" } = {}) {
    const base = governedGit({ mode });
    const declaredRoot = join(base, "declared-plugin");
    mkdirSync(join(declaredRoot, "hooks"), { recursive: true });
    mkdirSync(join(declaredRoot, ".claude-plugin"), { recursive: true });
    writeFileSync(join(declaredRoot, ".claude-plugin", "plugin.json"), JSON.stringify({ name: "pipeline-core", version: "0.0.0-fixture" }));
    writeFileSync(join(declaredRoot, "hooks", "some-guard.mjs"), "// fixture\n");
    return { base, declaredRoot, targetFile: join(declaredRoot, "hooks", "some-guard.mjs") };
  }

  check("GST21 a chat-armed capability admits the exact bound edit to a GS-1..GS-5/GS-7 path", () => {
    const rule = GATE_STRENGTH_PATHS.find((entry) => entry.id === "GS-4");
    const root = governedGit({ mode: "chat" });
    assert.equal(ask(root, rule.path).blocked, true, "precondition: refused while unarmed");
    armByChat(root, { file_path: rule.path }, denialFor(rule));
    const { blocked, stderr } = ask(root, rule.path);
    assert.equal(blocked, false, `armed capability did not admit the edit:\n${stderr}`);
    assert.match(stderr, /\[pipeline-human-override\] guard-gate-strength GS-4: exact one-time capability consumed/u);
  });

  check("GST22 a signature-armed capability admits it regardless of the committed mode", () => {
    const rule = GATE_STRENGTH_PATHS.find((entry) => entry.id === "GS-3");
    const pair = keyPair();
    const trustAnchor = { keyReference: "gst-hgo-signature", publicKeySha256: pair.publicKeySha256 };
    // Armed and consumed once with the committed mode at "signature" (this repository's
    // actual default), once at "chat" -- proving admission does not depend on either.
    for (const mode of ["signature", "chat"]) {
      const root = governedGit({ mode, trustAnchor });
      const absolutePath = join(root, rule.path);
      assert.equal(ask(root, absolutePath).blocked, true, `precondition (mode=${mode}): refused while unarmed`);
      armBySignature(root, { file_path: absolutePath }, denialFor(rule), { pair, keyReference: "gst-hgo-signature" });
      const { blocked, stderr } = ask(root, absolutePath);
      assert.equal(blocked, false, `mode=${mode}: signature-armed capability was not admitted:\n${stderr}`);
      assert.match(stderr, /\[pipeline-human-override\] guard-gate-strength GS-3: exact one-time capability consumed/u, `mode=${mode}`);
    }
  });

  check("GST23 with nothing armed, the refusal names the mode-appropriate next command", () => {
    const rule = GATE_STRENGTH_PATHS.find((entry) => entry.id === "GS-4");

    const chatStderr = ask(governedGit({ mode: "chat" }), rule.path).stderr;
    assert.match(chatStderr, /plan --repo/u);
    assert.match(chatStderr, /prepare-authorization --repo/u);
    assert.match(chatStderr, /--selection-sha256/u);
    assert.match(chatStderr, /--activate/u);
    assert.doesNotMatch(chatStderr, /authorize-by-signature/u);

    const sigStderr = ask(governedGit({ mode: "signature" }), rule.path).stderr;
    assert.match(sigStderr, /plan --repo/u);
    assert.match(sigStderr, /prepare-authorization --repo/u);
    assert.match(sigStderr, /authorize-by-signature --repo/u);
    assert.match(sigStderr, /--proof/u);
    assert.doesNotMatch(sigStderr, /--activate/u);
    assert.doesNotMatch(sigStderr, /--selection-sha256/u);
  });

  check("GST24 an unusable override store leaves the refusal exactly as it was", () => {
    const rule = GATE_STRENGTH_PATHS.find((entry) => entry.id === "GS-4");
    const root = governed(); // no git: the override store has no repository to bind to
    const { blocked, stderr } = ask(root, rule.path);
    assert.equal(blocked, true, "a broken override store must not become an authorization");
    assert.match(stderr, new RegExp(`Rule ID: ${rule.id}\\b`, "u"));
    assert.doesNotMatch(stderr, /--request-sha256/u);
    assert.doesNotMatch(stderr, /capability consumed/u);
    assert.doesNotMatch(stderr, /Human override available/u);
  });

  check("GST25 a capability bound to a different edit does not admit this one", () => {
    const ruleA = GATE_STRENGTH_PATHS.find((entry) => entry.id === "GS-4");
    const ruleB = GATE_STRENGTH_PATHS.find((entry) => entry.id === "GS-3");
    const root = governedGit({ mode: "chat" });
    armByChat(root, { file_path: ruleA.path }, denialFor(ruleA));
    const { blocked, stderr } = ask(root, ruleB.path);
    assert.equal(blocked, true, "a capability bound elsewhere admitted this edit");
    assert.match(stderr, new RegExp(`Rule ID: ${ruleB.id}\\b`, "u"));
    assert.doesNotMatch(stderr, /capability consumed/u);
  });

  check("GST26 the capability is single-use: the same edit is refused again", () => {
    const rule = GATE_STRENGTH_PATHS.find((entry) => entry.id === "GS-4");
    const root = governedGit({ mode: "chat" });
    armByChat(root, { file_path: rule.path }, denialFor(rule));
    assert.equal(ask(root, rule.path).blocked, false, "precondition: first use is admitted");
    const { blocked, stderr } = ask(root, rule.path);
    assert.equal(blocked, true, "a consumed capability was accepted a second time");
    assert.doesNotMatch(stderr, /capability consumed/u);
  });

  check("GST27 GS-6 is never lifted by this path, even with a real, valid, exactly-matching armed capability", () => {
    // The exclusion most worth pinning (ADR-0059's follow-up decision): GS-1..GS-5/GS-7
    // get the always-attempt-consume-first lift, GS-6 never does, and no special-casing
    // is needed to prove it -- the code path that would consume never runs for GS-6 at
    // all. Proven the hard way: a genuinely armed capability, built to match EXACTLY
    // what the guard would need to consume for this edit if it ever tried to, still
    // does not admit it.
    const { base, declaredRoot, targetFile } = declaredLivePluginFixture({ mode: "chat" });
    const before = ask(base, targetFile, { CLAUDE_PLUGIN_ROOT: declaredRoot });
    assert.equal(before.blocked, true);
    assert.match(before.stderr, /Rule ID: GS-6\b/u, "precondition: the declared root is not classified GS-6");

    armByChat(base, { file_path: targetFile }, denialFor(LIVE_PLUGIN_RULE));

    const { blocked, stderr } = ask(base, targetFile, { CLAUDE_PLUGIN_ROOT: declaredRoot });
    assert.equal(blocked, true, "GS-6 was lifted by an armed HGO capability");
    assert.match(stderr, /Rule ID: GS-6\b/u);
    assert.doesNotMatch(stderr, /capability consumed/u);
    assert.doesNotMatch(stderr, /lifted/u);
    assert.match(stderr, /no in-session override/u);
  });

  check("GST28 the HGO consume call is reached only when the matched rule is not GS-6", () => {
    // A static companion to GST27: the consume call site itself must be lexically
    // inside the `matched !== LIVE_PLUGIN_RULE` block, not merely behaved-as-if by
    // this fixture's particular inputs.
    const source = readFileSync(GUARD, "utf8");
    const guardIndex = source.indexOf("if (matched !== LIVE_PLUGIN_RULE) {");
    const consumeIndex = source.indexOf("consumeHumanGuardOverride({");
    assert.ok(guardIndex > 0 && consumeIndex > 0, "expected both the GS-6 exclusion guard and the consume call");
    assert.ok(guardIndex < consumeIndex, "the consume call is not gated behind the GS-6 exclusion");
  });

  check("GST29 the refusal text differs: GS-6 states there is no in-session override, the lifted rules do not", () => {
    const base = mkdtempSync(join(tmpdir(), "gate-strength-text-"));
    roots.push(base);
    writeFileSync(join(base, "README.md"), "# unrelated, ungoverned\n");
    const gs6 = ask(base, join(PLUGIN_ROOT, "hooks", "guard-git.mjs"));
    assert.equal(gs6.blocked, true);
    assert.match(gs6.stderr, /no in-session override/u);

    const rule = GATE_STRENGTH_PATHS.find((entry) => entry.id === "GS-4");
    const lifted = ask(governed(), rule.path);
    assert.equal(lifted.blocked, true);
    assert.doesNotMatch(lifted.stderr, /no in-session override/u);
  });

  console.log(`\nguard-gate-strength: ${passed} passed, ${failed} failed`);
} finally {
  for (const entry of roots) rmSync(entry, { recursive: true, force: true });
}
process.exit(failed === 0 ? 0 : 1);
