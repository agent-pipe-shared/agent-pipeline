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
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { GATE_STRENGTH_PATHS, gateStrengthRuleFor, insideLivePlugin } from "./guard-gate-strength.mjs";

const HOOKS = dirname(fileURLToPath(import.meta.url));
const GUARD = join(HOOKS, "guard-gate-strength.mjs");
const PLUGIN_ROOT = join(HOOKS, "..");
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

  console.log(`\nguard-gate-strength: ${passed} passed, ${failed} failed`);
} finally {
  for (const entry of roots) rmSync(entry, { recursive: true, force: true });
}
process.exit(failed === 0 ? 0 : 1);
