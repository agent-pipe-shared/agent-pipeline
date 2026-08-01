#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

import assert from "node:assert/strict";
import {
  closeSync,
  mkdtempSync,
  mkdirSync,
  openSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const hookDir = dirname(fileURLToPath(import.meta.url));
const pluginRoot = join(hookDir, "..");
const adapter = join(hookDir, "codex-pretool-guard.mjs");
const humanOverrideScript = join(pluginRoot, "scripts", "guard-human-override.mjs");
let passed = 0;

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "codex-pretool-"));
  mkdirSync(join(root, ".claude"), { recursive: true });
  return root;
}

function run(input, root = fixture(), {
  claudeProjectDir = root,
  hookCwd = root,
} = {}) {
  const envelope = typeof input === "string" ? input : {
    cwd: root,
    ...input,
  };
  const inputRoot = mkdtempSync(join(tmpdir(), "codex-pretool-input-"));
  const inputPath = join(inputRoot, "input.json");
  writeFileSync(inputPath, typeof envelope === "string" ? envelope : JSON.stringify(envelope));
  const inputFd = openSync(inputPath, "r");
  try {
    return spawnSync(process.execPath, [adapter], {
      cwd: hookCwd,
      env: { ...process.env, CLAUDE_PROJECT_DIR: claudeProjectDir },
      encoding: "utf8",
      stdio: [inputFd, "pipe", "pipe"],
      timeout: 8_000,
    });
  } finally {
    closeSync(inputFd);
    rmSync(inputRoot, { recursive: true, force: true });
  }
}

function check(name, fn) {
  try {
    fn();
    passed++;
    process.stdout.write(`ok ${passed} - ${name}\n`);
  } catch (error) {
    process.stderr.write(`not ok - ${name}\n${error.stack}\n`);
    process.exitCode = 1;
  }
}

function decision(result) {
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout).hookSpecificOutput;
}

check("Codex manifest matches the repository version and has a native hook descriptor", () => {
  const manifest = JSON.parse(readFileSync(join(pluginRoot, ".codex-plugin", "plugin.json"), "utf8"));
  const repositoryVersion = readFileSync(join(pluginRoot, "..", "..", "VERSION"), "utf8").trim();
  assert.equal(manifest.name, "pipeline-core");
  const [baseVersion, buildMetadata = null] = manifest.version.split("+");
  assert.equal(baseVersion, repositoryVersion);
  if (buildMetadata !== null) assert.match(buildMetadata, /^codex\.\d{14}$/u);
  assert.equal(manifest.hooks, "./hooks/codex-hooks.json");
});

check("descriptor uses quoted PLUGIN_ROOT with Windows parity for both routing families", () => {
  const descriptor = JSON.parse(readFileSync(join(hookDir, "codex-hooks.json"), "utf8"));
  const sessionStart = descriptor.hooks.SessionStart;
  assert.equal(sessionStart.length, 1);
  assert.equal(sessionStart[0].matcher, "startup|resume|clear|compact");
  assert.equal(sessionStart[0].hooks[0].command, "node \"${PLUGIN_ROOT}/hooks/codex-session-start-hint.mjs\"");
  assert.equal(sessionStart[0].hooks[0].commandWindows, sessionStart[0].hooks[0].command);
  assert.equal(sessionStart[0].hooks[0].timeout, 3);
  const entries = descriptor.hooks.PreToolUse;
  assert.deepEqual(entries.map((entry) => entry.matcher), ["Bash", "apply_patch|Edit|Write"]);
  for (const entry of entries) {
    assert.equal(entry.hooks.length, 1);
    const hook = entry.hooks[0];
    assert.equal(hook.command, "node \"${PLUGIN_ROOT}/hooks/codex-pretool-guard.mjs\"");
    assert.equal(hook.commandWindows, hook.command);
    assert.equal(hook.timeout, 10);
    assert.match(hook.statusMessage, /^Checking Agent-Pipeline /);
  }
});

check("Human override Git observation keeps a bounded cold-repository budget", () => {
  const source = readFileSync(adapter, "utf8");
  assert.match(source, /\{ capMs: 2_000, reserveMs: 750 \}/u);
  assert.doesNotMatch(source, /\{ capMs: 300, reserveMs: 400 \}/u);
});

check("Bash, apply_patch, Edit and Write each reach their intended guard family", () => {
  const root = fixture();
  writeFileSync(join(root, ".claude", "guard-config.json"), JSON.stringify({
    protectedTestPaths: [{ id: "NATIVE-TEST", pattern: "locked\\.test\\.mjs$", reason: "locked fixture" }],
  }));

  const bash = decision(run({ tool_name: "Bash", tool_input: { command: "git reset --hard" } }, root));
  assert.equal(bash.permissionDecision, "deny");
  assert.match(bash.permissionDecisionReason, /git-guard/);

  const patch = decision(run({
    tool_name: "apply_patch",
    tool_input: { command: "*** Begin Patch\n*** Update File: locked.test.mjs\n@@\n-old\n+new\n*** End Patch" },
  }, root));
  assert.equal(patch.permissionDecision, "deny");
  assert.match(patch.permissionDecisionReason, /guard-testpath/);

  for (const tool_name of ["Edit", "Write"]) {
    const output = decision(run({ tool_name, tool_input: { file_path: "locked.test.mjs" } }, root));
    assert.equal(output.permissionDecision, "deny");
    assert.match(output.permissionDecisionReason, /NATIVE-TEST/);
  }
});

check("multiple Bash guard denials are aggregated into one Codex decision", () => {
  const root = fixture();
  writeFileSync(join(root, ".claude", "pipeline.yaml"), [
    "schema: pipeline.manifest.v0",
    "gates:",
    "  push:",
    "    mode: blocking",
    "    type: human",
    "    approval: required",
    "",
  ].join("\n"));
  const output = decision(run({
    tool_name: "Bash",
    tool_input: { command: "git reset --hard && git push origin deadbeef:refs/heads/test" },
  }, root));
  assert.equal(output.permissionDecision, "deny");
  assert.match(output.permissionDecisionReason, /git-guard/);
  assert.match(output.permissionDecisionReason, /guard-push/);
});

check("bounded rg-to-rg search filtering remains read-only without an override loop", () => {
  const root = fixture();
  const git = (...args) => spawnSync("git", args, { cwd: root, encoding: "utf8", shell: false });
  git("init", "-q", "-b", "main");
  git("config", "user.name", "Fixture");
  git("config", "user.email", "fixture@example.invalid");
  writeFileSync(join(root, "README.md"), "fixture\n");
  git("add", "README.md");
  git("commit", "-q", "-m", "fixture");
  writeFileSync(join(root, "pipeline.user.yaml"), "schema: pipeline.user.v3\n");
  const startedAt = Date.now();
  const output = run({
    tool_name: "Bash",
    tool_input: { command: "rg --files . | rg lifecycle" },
  }, root);
  const elapsedMs = Date.now() - startedAt;
  assert.ok(elapsedMs < 2_000, `grammar denial exceeded strict elapsed bound: ${elapsedMs}ms`);
  assert.equal(output.status, 0, output.stderr);
  assert.equal(output.stdout, "");
});

check("attended Human override admits only the exact next tool call and is then consumed", () => {
  const root = fixture();
  const git = (...args) => spawnSync("git", args, { cwd: root, encoding: "utf8", shell: false });
  git("init", "-q", "-b", "main");
  git("config", "user.name", "Fixture");
  git("config", "user.email", "fixture@example.invalid");
  writeFileSync(join(root, "README.md"), "fixture\n");
  git("add", "README.md");
  git("commit", "-q", "-m", "fixture");
  writeFileSync(join(root, "pipeline.user.yaml"), "schema: pipeline.user.v3\n");
  const input = { tool_name: "Write", tool_input: { file_path: "notes.md", content: "attended\n" } };
  const first = decision(run(input, root));
  assert.equal(first.permissionDecision, "deny");
  const request = first.permissionDecisionReason.match(/--request-sha256 ([a-f0-9]{64})/u)?.[1];
  assert.match(request ?? "", /^[a-f0-9]{64}$/u);
  const planned = spawnSync(process.execPath, [
    humanOverrideScript, "plan", "--repo", root, "--request-sha256", request,
  ], { cwd: root, encoding: "utf8", shell: false });
  assert.equal(planned.status, 0, planned.stderr);
  const plan = JSON.parse(planned.stdout);
  const reason = "PO explicitly approved this exact attended test write";
  const prepared = spawnSync(process.execPath, [
    humanOverrideScript,
    "prepare-authorization",
    "--repo",
    root,
    "--request-sha256",
    request,
    "--plan-sha256",
    plan.planSha256,
    "--reason",
    reason,
  ], { cwd: root, encoding: "utf8", shell: false });
  assert.equal(prepared.status, 0, prepared.stderr);
  const authorization = JSON.parse(prepared.stdout);
  const authorized = spawnSync(process.execPath, [
    ...authorization.authorizeAction.argv,
  ], { cwd: root, encoding: "utf8", shell: false });
  assert.equal(authorized.status, 0, authorized.stderr);
  const allowed = run(input, root);
  assert.equal(allowed.status, 0, allowed.stderr);
  assert.equal(allowed.stdout, "");
  assert.match(allowed.stderr, /exact one-time capability consumed/u);
  const replay = decision(run(input, root));
  assert.equal(replay.permissionDecision, "deny");
});

check("Pipeline Author Repair selects one exact source root and consumes one patch", () => {
  const root = fixture();
  const git = (...args) => spawnSync("git", args, { cwd: root, encoding: "utf8", shell: false });
  git("init", "-q", "-b", "main");
  git("config", "user.name", "Fixture");
  git("config", "user.email", "fixture@example.invalid");
  writeFileSync(join(root, "README.md"), "fixture\n");
  writeFileSync(join(root, "pipeline.user.yaml"), "schema: pipeline.user.v3\n");
  const sourceRoot = join(root, "plugins", "pipeline-core");
  mkdirSync(join(sourceRoot, ".codex-plugin"), { recursive: true });
  mkdirSync(join(sourceRoot, "lib"), { recursive: true });
  writeFileSync(join(sourceRoot, ".codex-plugin", "plugin.json"), '{"name":"pipeline-core","version":"0.4.7"}\n');
  writeFileSync(join(sourceRoot, "lib", "repair.mjs"), "export const repaired = false;\n");
  git("add", "README.md", "pipeline.user.yaml", "plugins/pipeline-core");
  git("commit", "-q", "-m", "fixture");
  const input = {
    tool_name: "apply_patch",
    tool_input: {
      command: "*** Begin Patch\n*** Update File: plugins/pipeline-core/lib/repair.mjs\n@@\n-export const repaired = false;\n+export const repaired = true;\n*** End Patch",
    },
  };
  const first = decision(run(input, root));
  assert.equal(first.permissionDecision, "deny");
  assert.match(first.permissionDecisionReason, /Pipeline Author Repair is available/u);
  assert.match(first.permissionDecisionReason, new RegExp(`--author-source-root ${JSON.stringify(sourceRoot)}`, "u"));
  const request = first.permissionDecisionReason.match(/--request-sha256 ([a-f0-9]{64})/u)?.[1];
  assert.match(request ?? "", /^[a-f0-9]{64}$/u);
  const planned = spawnSync(process.execPath, [
    humanOverrideScript, "plan", "--repo", root, "--request-sha256", request,
    "--author-source-root", sourceRoot,
  ], { cwd: root, encoding: "utf8", shell: false });
  assert.equal(planned.status, 0, planned.stderr);
  const plan = JSON.parse(planned.stdout);
  assert.equal(plan.mode, "pipeline-author-repair");
  assert.equal(plan.authorSourceRoot, sourceRoot);
  const reason = "PO explicitly approved this exact source repair";
  const prepared = spawnSync(process.execPath, [
    humanOverrideScript, "prepare-authorization", "--repo", root,
    "--request-sha256", request, "--plan-sha256", plan.planSha256,
    "--reason", reason, "--author-source-root", sourceRoot,
  ], { cwd: root, encoding: "utf8", shell: false });
  assert.equal(prepared.status, 0, prepared.stderr);
  const authorization = JSON.parse(prepared.stdout);
  const authorized = spawnSync(process.execPath, authorization.authorizeAction.argv, {
    cwd: root, encoding: "utf8", shell: false,
  });
  assert.equal(authorized.status, 0, authorized.stderr);
  const allowed = run(input, root);
  assert.equal(allowed.status, 0, allowed.stderr);
  assert.equal(allowed.stdout, "");
  assert.match(allowed.stderr, /exact one-time capability consumed/u);
  assert.equal(decision(run(input, root)).permissionDecision, "deny");
});

check("local plugin-cache installation returns one external boundary without an audit retry loop", () => {
  const output = decision(run({
    tool_name: "Bash",
    tool_input: { command: "codex plugin add pipeline-core@agent-pipeline-local" },
  }, join(pluginRoot, "..", "..")));
  assert.equal(output.permissionDecision, "deny");
  assert.match(output.permissionDecisionReason, /GUARD-CROSS-REPO-MUTATION/u);
  assert.match(output.permissionDecisionReason, /HGO-EXTERNAL-PLUGIN-CACHE-BOUNDARY/u);
  assert.match(output.permissionDecisionReason, /separate-session-rooted-at-plugin-cache/u);
  assert.doesNotMatch(output.permissionDecisionReason, /verify-audit/u);
  assert.doesNotMatch(output.permissionDecisionReason, /effect-reconciliation-required/u);
  assert.doesNotMatch(output.permissionDecisionReason, /Human override available/u);
});

check("override persistence failure remains a sanitized fail-closed denial", () => {
  const root = fixture();
  const git = (...args) => spawnSync("git", args, { cwd: root, encoding: "utf8", shell: false });
  git("init", "-q", "-b", "main");
  git("config", "user.name", "Fixture");
  git("config", "user.email", "fixture@example.invalid");
  writeFileSync(join(root, "README.md"), "fixture\n");
  git("add", "README.md");
  git("commit", "-q", "-m", "fixture");
  writeFileSync(join(root, "pipeline.user.yaml"), "schema: pipeline.user.v3\n");
  mkdirSync(join(root, ".git", "agent-pipeline"), { recursive: true, mode: 0o700 });
  writeFileSync(join(root, ".git", "agent-pipeline", "human-guard-overrides"), "not-a-directory\n", { mode: 0o600 });
  const denied = decision(run({
    tool_name: "Write",
    tool_input: { file_path: "notes.md", content: "still denied\n" },
  }, root));
  assert.equal(denied.permissionDecision, "deny");
  assert.match(denied.permissionDecisionReason, /HGO-ADAPTER-FAILURE/u);
  assert.doesNotMatch(denied.permissionDecisionReason, /EEXIST|stack|node:fs/u);
});

check("Codex routes a documented Git override prefix to the Push-Gate's actual command", () => {
  const root = fixture();
  writeFileSync(join(root, ".claude", "pipeline.yaml"), [
    "schema: pipeline.manifest.v0",
    "gates:",
    "  push:",
    "    mode: blocking",
    "    type: human",
    "    approval: standing-approved",
    "",
  ].join("\n"));
  const output = decision(run({
    tool_name: "Bash",
    tool_input: {
      command: 'PIPELINE_GUARD_OVERRIDE="GG-03|20260726-codex-adapter|PO-approved fixture" git push origin deadbeef:refs/heads/main',
    },
  }, root));
  assert.equal(output.permissionDecision, "deny");
  assert.match(output.permissionDecisionReason, /push repository cannot be resolved to a non-bare worktree/u);
  assert.doesNotMatch(output.permissionDecisionReason, /push command prefix is ambiguous/u);
});

check("ordinary ungoverned shell commands do not start heavyweight guards", () => {
  const root = mkdtempSync(join(tmpdir(), "codex-pretool-plain-"));
  const result = run({ tool_name: "Bash", tool_input: { command: "pwd" } }, root);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, "");
});

check("runtime-only V3 targets activate lifecycle enforcement in the outer adapter", () => {
  for (const marker of [".codex/config.toml", ".codex/agents/critic.toml"]) {
    const root = fixture();
    mkdirSync(dirname(join(root, marker)), { recursive: true });
    writeFileSync(join(root, marker), "runtime-only\n");
    const output = decision(run({
      tool_name: "Bash",
      tool_input: { command: "touch bypassed" },
    }, root));
    assert.equal(output.permissionDecision, "deny", marker);
    assert.match(output.permissionDecisionReason, /guard-lifecycle-ready/u, marker);
  }
});

check("Codex outer adapter admits only the exact pre-ready V4 recovery diagnostics", () => {
  const root = fixture();
  writeFileSync(join(root, "pipeline.user.yaml"), "schema: pipeline.user.v3\n");
  const onboarding = join(pluginRoot, "scripts", "project-onboarding-v3.mjs");
  const authority = join(pluginRoot, "scripts", "v3-bootstrap-authority.mjs");
  const digest = "d".repeat(64);
  for (const command of [
    `node '${onboarding}' plan-source-recovery --root '${root}'`,
    `node '${onboarding}' plan-manifest-repair --root '${root}'`,
    `node '${onboarding}' apply-manifest-repair --root '${root}' --plan-sha256 ${digest} --activate`,
    `node '${authority}' --root '${root}'`,
  ]) {
    const result = run({ tool_name: "Bash", tool_input: { command } }, root);
    assert.equal(result.status, 0, `${command}\n${result.stderr}`);
    assert.equal(result.stdout, "", command);
  }
  for (const command of [
    `node '${onboarding}' apply-manifest-repair --root '${root}' --activate`,
    `node '${onboarding}' apply-manifest-repair --root '${root}' --plan-sha256 ${digest} --activate $(touch bypassed)`,
    `node '${authority}' --root '${root}' --extra`,
    `node '${authority}' --root '${root}'; touch bypassed`,
  ]) {
    const output = decision(run({ tool_name: "Bash", tool_input: { command } }, root));
    assert.equal(output.permissionDecision, "deny", command);
    assert.match(output.permissionDecisionReason, /guard-lifecycle-ready/u, command);
  }
});

check("Codex native cwd wins over a stale inherited CLAUDE_PROJECT_DIR", () => {
  const current = mkdtempSync(join(tmpdir(), "codex-pretool-current-"));
  const stale = fixture();
  writeFileSync(join(stale, "pipeline.user.yaml"), "schema: pipeline.user.v3\n");

  const currentResult = run({
    tool_name: "Bash",
    tool_input: { command: "touch bypassed" },
  }, current, { claudeProjectDir: stale });
  assert.equal(currentResult.status, 0, currentResult.stderr);
  assert.equal(currentResult.stdout, "");

  writeFileSync(join(current, "pipeline.user.yaml"), "schema: pipeline.user.v3\n");
  const staleResult = decision(run({
    tool_name: "Bash",
    tool_input: { command: "touch bypassed" },
  }, current, { claudeProjectDir: mkdtempSync(join(tmpdir(), "codex-pretool-stale-plain-")) }));
  assert.equal(staleResult.permissionDecision, "deny");
  assert.match(staleResult.permissionDecisionReason, /guard-lifecycle-ready/);
});

check("governed bootstrap can read only its loaded pipeline-start skill and current directory", () => {
  const root = fixture();
  writeFileSync(join(root, "pipeline.user.yaml"), "schema: pipeline.user.v3\n");
  const skill = join(pluginRoot, "skills", "pipeline-start", "SKILL.md");
  for (const command of [
    `sed -n '1,260p' '${skill}'`,
    `cat -- "${skill}"`,
    `Get-Content -LiteralPath "${skill}"`,
    `Get-Content -LiteralPath "${skill}" -Raw`,
    "pwd",
    "pwd -P",
  ]) {
    const result = run({ tool_name: "Bash", tool_input: { command } }, root);
    assert.equal(result.status, 0, `${command}\n${result.stderr}`);
    assert.equal(result.stdout, "", command);
  }
  const chained = decision(run({
    tool_name: "Bash",
    tool_input: { command: `sed -n '1,260p' '${skill}'; touch bypassed` },
  }, root));
  assert.equal(chained.permissionDecision, "deny");
  assert.match(chained.permissionDecisionReason, /guard-lifecycle-ready/);
  assert.doesNotMatch(chained.permissionDecisionReason, /effect-reconciliation-required/);
  for (const command of [
    `gc -LiteralPath "${skill}" -Raw`,
    `Get-Content -Path "${skill}" -Raw`,
    `Get-Content -LiteralPath "${skill}" -Encoding utf8`,
    `Get-Content -LiteralPath "${skill}" -Raw | Select-Object -First 1`,
  ]) {
    const output = decision(run({ tool_name: "Bash", tool_input: { command } }, root));
    assert.equal(output.permissionDecision, "deny", command);
  }
});

check("outer Codex routing admits the exact bounded diagnostic pipeline while non-ready", () => {
  const root = fixture();
  writeFileSync(join(root, "pipeline.user.yaml"), "schema: pipeline.user.v3\n");
  const allowed = run({
    tool_name: "Bash",
    tool_input: { command: "rg -n lifecycle . 2>/dev/null | head -n 40" },
  }, root);
  assert.equal(allowed.status, 0, allowed.stderr);
  assert.equal(allowed.stdout, "");
  for (const command of [
    "rg -n lifecycle . 2>diagnostic.log | head -n 40",
    "rg -n lifecycle . | head -n 0",
    "rg -n lifecycle . | tee diagnostic.log",
  ]) {
    const output = decision(run({ tool_name: "Bash", tool_input: { command } }, root));
    assert.equal(output.permissionDecision, "deny", command);
    assert.match(output.permissionDecisionReason, /GUARD-(?:REDIRECT|OPERATOR|LIFECYCLE)/u, command);
  }
});

check("lifecycle readiness is additive and aggregates with existing write guards", () => {
  const root = fixture();
  writeFileSync(join(root, "pipeline.user.yaml"), "schema: pipeline.user.v3\n");
  writeFileSync(join(root, ".claude", "guard-config.json"), JSON.stringify({
    protectedTestPaths: [{ id: "LIFECYCLE-AGGREGATE", pattern: "locked\\.test\\.mjs$", reason: "locked fixture" }],
  }));
  const output = decision(run({ tool_name: "Edit", tool_input: { file_path: "locked.test.mjs" } }, root));
  assert.equal(output.permissionDecision, "deny");
  assert.match(output.permissionDecisionReason, /LIFECYCLE-AGGREGATE/);
  assert.match(output.permissionDecisionReason, /guard-lifecycle-ready/);
});

check("Codex adapter blocks consumer-to-source drift for Edit, apply_patch and plugin mutation", () => {
  const root = fixture();
  const outside = mkdtempSync(join(tmpdir(), "codex-pretool-pipeline-source-"));
  writeFileSync(join(root, "pipeline.user.yaml"), "schema: pipeline.user.v3\n");
  const outsideFile = join(outside, "plugins", "pipeline-core", "SKILL.md");

  const edited = decision(run({
    tool_name: "Edit",
    tool_input: { file_path: outsideFile },
  }, root));
  assert.equal(edited.permissionDecision, "deny");
  assert.match(edited.permissionDecisionReason, /only inside its own physical project root/u);

  const patched = decision(run({
    tool_name: "apply_patch",
    tool_input: {
      command: `*** Begin Patch\n*** Add File: ${outsideFile}\n+drift\n*** End Patch`,
    },
  }, root));
  assert.equal(patched.permissionDecision, "deny");
  assert.match(patched.permissionDecisionReason, /separate session rooted at the exact target/u);

  const installed = decision(run({
    tool_name: "Bash",
    tool_input: { command: "codex plugin add pipeline-core@agent-pipeline-local" },
  }, root));
  assert.equal(installed.permissionDecision, "deny");
  assert.match(installed.permissionDecisionReason, /plugin installation/u);
});

check("existing write-guard warnings remain warnings in an ungoverned repository", () => {
  const root = fixture();
  writeFileSync(join(root, ".claude", "guard-config.json"), "{broken");
  const result = run({ tool_name: "Edit", tool_input: { file_path: "src/warning.mjs" } }, root);
  assert.equal(result.status, 0);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /guard-testpath/);
});

check("malformed, unsupported and incomplete tool inputs fail closed", () => {
  for (const input of [
    "not-json",
    { tool_name: "Unknown", tool_input: {} },
    { tool_name: "Bash", tool_input: {} },
    { tool_name: "Edit", tool_input: {} },
  ]) {
    const output = decision(run(input));
    assert.equal(output.permissionDecision, "deny");
    assert.match(output.permissionDecisionReason, /fail closed|Unsupported or missing/);
  }
});

if (process.exitCode) process.exit(process.exitCode);
process.stdout.write(`1..${passed}\n`);
