#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

import assert from "node:assert/strict";
import {
  chmodSync,
  closeSync,
  cpSync,
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
import { main as guardHumanOverrideMain } from "../scripts/guard-human-override.mjs";
import { consumeRuntimeReadback, issueLaunchTicket, readRestartBarrier, sha256 } from "../lib/codex-onboarding-runtime.mjs";

const hookDir = dirname(fileURLToPath(import.meta.url));
const pluginRoot = join(hookDir, "..");
const adapter = join(hookDir, "codex-pretool-guard.mjs");
const humanOverrideScript = join(pluginRoot, "scripts", "guard-human-override.mjs");
const onboardingScript = join(pluginRoot, "scripts", "project-onboarding-v3.mjs");
let passed = 0;

/**
 * authorizeHumanGuardOverride()'s chat-mode/pipeline-author-repair activation now requires
 * a genuine attended terminal (lib/chat-gate-ceremony.mjs, AGY-HGOFIX-2) -- unreachable from
 * a real detached `spawnSync` subprocess by design; that is the property the fix exists to
 * guarantee. Call the CLI's own exported `main()` in-process instead, injecting the same
 * test-only `dependencies` seam AGY-HGOFIX-2/3 already use in human-guard-override.test.mjs
 * and guard-lifecycle-ready.test.mjs, so this still exercises the real `authorize` command
 * logic end to end. `argv[0]` is the script path (see authorizeAction.argv's own shape in
 * human-guard-override.mjs); `main()` expects argv starting from the subcommand.
 */
function activateAuthorization(authorizeAction, selectionSha256) {
  let stdout = "";
  let stderr = "";
  const status = guardHumanOverrideMain(authorizeAction.argv.slice(1), {
    write: (text) => { stdout += text; }, writeError: (text) => { stderr += text; },
  }, { dependencies: { isattyFn: () => true, readLineFn: () => `HGO-${selectionSha256.slice(0, 8).toUpperCase()}` } });
  return { status, stdout, stderr };
}

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "codex-pretool-"));
  mkdirSync(join(root, ".claude"), { recursive: true });
  return root;
}

function validPipelineUser(mode = "signature") {
  return readFileSync(join(pluginRoot, "..", "..", "pipeline.user.yaml"), "utf8")
    .replace('push_approval: "signature"', `push_approval: "${mode}"`);
}

function writeCanonicalManifest(root) {
  mkdirSync(join(root, "project"), { recursive: true });
  writeFileSync(join(root, "project", "pipeline.yaml"),
    readFileSync(join(pluginRoot, "..", "..", "project", "pipeline.yaml"), "utf8"));
}

function lifecycleCommand(root, ...args) {
  const result = spawnSync(process.execPath, [onboardingScript, ...args], {
    cwd: root,
    encoding: "utf8",
    shell: false,
  });
  assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`);
  return JSON.parse(result.stdout);
}

function followLifecycleAction(root, result, name) {
  assert.equal(result.nextAction?.argv?.[1], name, JSON.stringify(result));
  return lifecycleCommand(root, ...result.nextAction.argv.slice(1));
}

function executeFixtureAction(root, action, replacements) {
  const result = spawnSync(action.executable, action.argv.map((value) => replacements[value] ?? value), { cwd: root, encoding: "utf8", shell: false });
  assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`);
  return JSON.parse(result.stdout);
}

function createReadyLifecycleFixture(mode = "chat") {
  // TEST-ONLY fixture inputs below are explicit synthetic PO answers. The
  // real CLI creates authority/checkpoint state; the real readback consumer
  // verifies its ticket and digests before the native adapter probes it.
  const root = mkdtempSync(join(tmpdir(), "codex-ready-hgo-"));
  const portable = followLifecycleAction(root, lifecycleCommand(root, "plan", "--root", root, "--runner", "codex"), "apply-portable-seed");
  const initialized = spawnSync(process.execPath, [join(pluginRoot, "scripts", "onboarding-init.mjs"), "--root", root, "--runner", "codex", "--git-author-name", "Test Fixture", "--git-author-email", "fixture@example.invalid", "--push-approval", mode], { cwd: root, encoding: "utf8", shell: false });
  assert.equal(initialized.status, 0, `${initialized.stderr}\n${initialized.stdout}`);
  assert.match(readFileSync(join(root, "pipeline.user.yaml"), "utf8"), new RegExp(`push_approval: "${mode}"`, "u"));
  assert.match(readFileSync(join(root, "pipeline.user.yaml"), "utf8"), new RegExp(`human_approval: "${mode}"`, "u"));
  for (const args of [["config", "user.name", "Test Fixture"], ["config", "user.email", "fixture@example.invalid"], ["add", "pipeline.user.yaml"], ["commit", "-m", "test fixture policy"]]) {
    const git = spawnSync("git", args, { cwd: root, encoding: "utf8", shell: false });
    assert.equal(git.status, 0, git.stderr);
  }
  const barrier = readRestartBarrier({ rootDir: root }); const issued = issueLaunchTicket({ rootDir: root, barrierSha256: barrier.rawSha256 });
  consumeRuntimeReadback({ rootDir: root, ticketId: issued.ticketId, token: issued.token, receipt: { schema: "pipeline.codex-project-runtime-readback.v1", barrierSha256: barrier.rawSha256, repositoryFingerprint: barrier.barrier.repositoryFingerprint, sourceSha256: barrier.barrier.sourceSha256, runtimeTargetsSha256: barrier.barrier.runtimeTargetsSha256, readerGenerationSha256: sha256("test-hgo-readback"), effectiveConfigSha256: sha256("test-hgo-config"), validatedAgentsSha256: sha256("test-hgo-agents"), ticketId: issued.ticketId, observedAtEpochMs: Date.now() } });
  const collect = (result, values, material = null) => { const argv = result.nextAction.applyAction.argv.map((value) => values[value] ?? value); const index = argv.indexOf("--text-file"); if (material !== null && index >= 0) { const path = join(root, argv[index + 1]); mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, material); } return lifecycleCommand(root, ...argv.slice(1)); };
  collect(lifecycleCommand(root, "inspect", "--root", root, "--runner", "codex"), { "<PO_INTAKE_GIT_AUTHOR_NAME>": "Test Fixture", "<PO_INTAKE_GIT_AUTHOR_EMAIL>": "fixture@example.invalid", "<PO_INTAKE_LANGUAGE>": "en", "<PO_INTAKE_PROFILE>": "feature" }, "HGO test fixture material.\n");
  collect(lifecycleCommand(root, "inspect", "--root", root, "--runner", "codex"), { "<PO_INTAKE_DESIGN_ANSWERS_JSON>": JSON.stringify([{ question: "Scope?", answer: "HGO fixture." }]) });
  const generated = followLifecycleAction(root, lifecycleCommand(root, "inspect", "--root", root, "--runner", "codex"), "intake-generate-plan");
  lifecycleCommand(root, "intake-generate-apply", "--root", root, "--plan-sha256", generated.planSha256, "--activate", "--runner", "codex");
  const bind = followLifecycleAction(root, lifecycleCommand(root, "inspect", "--root", root, "--runner", "codex"), "bootstrap-bind-plan");
  followLifecycleAction(root, bind, "bootstrap-bind-apply");
  assert.equal(lifecycleCommand(root, "inspect", "--root", root, "--runner", "codex").status, "ready");
  return root;
}

// The full Codex onboarding path is an integration fixture.  It is intentionally
// exercised once per committed approval mode, then copied before each consumer:
// every test still receives its own `.git` directory and may mutate its own runtime
// receipts, but the repeated seven-process onboarding ceremony no longer dominates
// this guard suite's wall-clock time.
const readyLifecycleTemplates = new Map();
const readyLifecycleCloneParents = new Set();
process.once("exit", () => {
  for (const parent of readyLifecycleCloneParents) rmSync(parent, { recursive: true, force: true });
  for (const template of readyLifecycleTemplates.values()) rmSync(template, { recursive: true, force: true });
});

function readyLifecycleFixture(mode = "chat") {
  let template = readyLifecycleTemplates.get(mode);
  if (!template) {
    template = createReadyLifecycleFixture(mode);
    readyLifecycleTemplates.set(mode, template);
  }
  const parent = mkdtempSync(join(tmpdir(), "codex-ready-clone-"));
  const root = join(parent, "project");
  cpSync(template, root, { recursive: true, dereference: false });
  readyLifecycleCloneParents.add(parent);
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

/** Isolate and parse the trailing "Guard recovery route:" JSON blob a denial reason carries. */
function guardRecoveryRoute(reason) {
  const marker = "Guard recovery route:\n";
  const index = reason.lastIndexOf(marker);
  assert.notEqual(index, -1, `no "Guard recovery route:" block in: ${reason}`);
  return JSON.parse(reason.slice(index + marker.length));
}

// Local-build stamp convention: <semver>+codex.<YYYYMMDDHHMMSS>.<short-oid>,
// where <short-oid> is the 7-character OID of the functional commit whose
// content the build carries. Documented in
// docs/claude-local-plugin-development.md ("The cachebuster mechanism and
// version convention"); the Claude manifest carries the same shape with a
// `claude.` prefix. Base versions are compared by splitting at `+`, so both
// manifests agree while carrying different stamps.
const CODEX_BUILD_METADATA = /^codex\.\d{14}\.[0-9a-f]{7}$/u;

check("Codex manifest matches the repository version and has a native hook descriptor", () => {
  const manifest = JSON.parse(readFileSync(join(pluginRoot, ".codex-plugin", "plugin.json"), "utf8"));
  const repositoryVersion = readFileSync(join(pluginRoot, "..", "..", "VERSION"), "utf8").trim();
  assert.equal(manifest.name, "pipeline-core");
  const [baseVersion, buildMetadata = null] = manifest.version.split("+");
  assert.equal(baseVersion, repositoryVersion);
  if (buildMetadata !== null) assert.match(buildMetadata, CODEX_BUILD_METADATA);
  assert.equal(manifest.hooks, "./hooks/codex-hooks.json");
});

check("Codex build-metadata stamp admits timestamp-and-OID and rejects malformed forms", () => {
  for (const accepted of [
    "codex.20260808104333.c4be063",
    "codex.20260101000000.0000000",
    "codex.20991231235959.abcdef0",
  ]) {
    assert.match(accepted, CODEX_BUILD_METADATA);
  }
  for (const rejected of [
    "codex.20260808104333", // timestamp only, no OID
    "codex.20260808104333.c4be06", // OID too short
    "codex.20260808104333.c4be0633", // OID too long
    "codex.20260808104333.C4BE063", // OID not lowercase hex
    "codex.20260808104333.zzzzzzz", // OID not hex
    "codex.2026080810433.c4be063", // timestamp too short
    "codex.202608081043330.c4be063", // timestamp too long
    "claude.20260808104333.c4be063", // wrong runner
    "codex.20260808104333.c4be063.extra", // trailing segment
    "xcodex.20260808104333.c4be063", // unanchored prefix
    "codex.20260808104333.c4be063 ", // trailing whitespace
    "", // empty
  ]) {
    assert.doesNotMatch(rejected, CODEX_BUILD_METADATA);
  }
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
  assert.deepEqual(entries.map((entry) => entry.matcher), ["spawn_agent|update_plan", "Bash", "apply_patch|Edit|Write"]);
  const [slicing, ...guardEntries] = entries;
  assert.equal(slicing.hooks.length, 1);
  const slicingHook = slicing.hooks[0];
  assert.equal(slicingHook.command, "node \"${PLUGIN_ROOT}/hooks/codex-slicing-hint.mjs\" PreToolUse");
  assert.equal(slicingHook.commandWindows, slicingHook.command);
  assert.equal(slicingHook.timeout, 3);
  assert.equal(slicingHook.statusMessage, "Evaluating optional task slicing");
  for (const entry of guardEntries) {
    assert.equal(entry.hooks.length, 1);
    const hook = entry.hooks[0];
    assert.equal(hook.command, "node \"${PLUGIN_ROOT}/hooks/codex-pretool-guard.mjs\"");
    assert.equal(hook.commandWindows, hook.command);
    assert.equal(hook.timeout, 45);
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

// F1 (NVA-A7FIX-1, Nova A Slice A7 comprehensive gate Critic review): the adapter's
// own guard-push.mjs spawn-decision regex used to be a SECOND, hand-maintained
// approximation of "is this a push", narrower than guard-push.mjs's own detector
// (which normalizes through lib/git-cmd.mjs's normalizeGlobalGitOptions before
// testing). `git --git-dir=.git --work-tree=. push origin main` and a repeated `-C`
// override both matched guard-push.mjs's own detector but NOT the adapter's old
// regex, so on Codex this exact shape reached the shell with the push gate never
// evaluated at all. The fix shares the SAME normalization primitive both files rely
// on instead of a second regex that can drift from it.
check("F1: codex adapter recognizes every push shape guard-push.mjs itself recognizes, via shared normalization", () => {
  const root = fixture();
  // guard-push.mjs's own comment (guard-push.mjs:328-335) names these two forms as
  // exactly what its whole-string, normalized detector catches that a positional
  // detector cannot -- the regression basis for this fix.
  for (const command of [
    "git --git-dir=.git --work-tree=. push origin main",
    "git -C repo -C nested push origin main",
  ]) {
    const output = decision(run({ tool_name: "Bash", tool_input: { command } }, root));
    assert.equal(output.permissionDecision, "deny", command);
    // guard-push.mjs's own denial text always names itself ("BLOCKED (guard-push,
    // ..."); this string appearing in the aggregated reason is proof guard-push.mjs
    // was actually spawned and evaluated the command, not merely that SOME guard
    // denied it (guard-git.mjs is also spawned for any `git` command, but is
    // documented not to block a plain push).
    assert.match(output.permissionDecisionReason, /guard-push/, `${command}\n${output.permissionDecisionReason}`);
  }
});

// Negative case for the same fix: a command that merely CONTAINS the substring
// "push" -- or is a `git` command at all -- must not be misclassified as a push by
// the new normalized detector. `git status` and `git commit -m "chore: push later"` are
// both fully allowed today (no push gate applies); the fixed detector must keep
// allowing them, proving the shared-normalization fix narrows to real pushes and
// does not silently widen scope to any command whose text merely mentions "push".
// The commit subject carries a `chore:` prefix so this fixture stays GIT-01-clean
// (an unrelated, later-landed conventional-commit-type check) rather than being
// independently blocked for a reason that has nothing to do with what this case
// is actually proving.
check("F1: the shared-normalization fix does not widen push detection to non-push commands", () => {
  const root = fixture();
  for (const command of ["git status", 'git commit -m "chore: push later"']) {
    const result = run({ tool_name: "Bash", tool_input: { command } }, root);
    assert.equal(result.status, 0, `${command}\n${result.stderr}`);
    assert.equal(result.stdout, "", command);
  }
});

// F1 round 2 (NVA-A7FIX-2, fixing Critic F-1 against the round-1 fix itself): the round-1
// shared-normalization fix imported ONLY guard-push.mjs's whole-string branch
// (stripQuotedSegments + normalizeGlobalGitOptions), silently dropping the coverage its
// OWN cruder old regex happened to provide for guard-push.mjs's other two branches
// (`directPush`, `shellWrapperPush`): `git.exe -C repo push origin main`,
// `sh -c "git push origin main"`, `bash -c 'git push'`, `ssh host "git push"` all matched
// guard-push.mjs's own detector but not the round-1 adapter regex. The fix now calls
// guard-push.mjs's own single shared `commandIsGitPush` function (all three branches),
// so codex-pretool-guard.mjs and guard-push.mjs can never independently drift again.
// A manifest with an active, human-approval-required push gate is required here (unlike
// the two whole-string-branch cases above, which block via the manifest-independent
// cross-repository-ambiguity check) so guard-push.mjs's own evaluation actually reaches a
// blocking decision for the positional/wrapper shapes, proving the guard was truly spawned
// and evaluated the command rather than merely not crashing.
check("F1 round 2: codex adapter recognizes the directPush and shellWrapperPush shapes guard-push.mjs itself recognizes", () => {
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
  for (const command of [
    "git.exe -C repo push origin main", // directPush: git.exe -C <dir> push
    'sh -c "git push origin main"', // shellWrapperPush: sh -c "git push ..."
    "bash -c 'git push'", // shellWrapperPush: bash -c 'git push'
    'ssh host "git push"', // shellWrapperPush: ssh host "git push"
  ]) {
    const output = decision(run({ tool_name: "Bash", tool_input: { command } }, root));
    assert.equal(output.permissionDecision, "deny", command);
    assert.match(output.permissionDecisionReason, /guard-push/, `${command}\n${output.permissionDecisionReason}`);
  }
});

// F1 round 3 (NVA-PUSHCLASS-1): the shared classifier itself (commandIsGitPush,
// lib/git-cmd.mjs) missed a backslash-escaped whitespace value inside a `-c` global
// option and an unrecognized `--config-env` global option -- both slipped past this
// adapter's prefilter (`commandIsGitPush(command) ? ["guard-push.mjs"] : []` above)
// entirely, so guard-push.mjs never even ran to evaluate them; one of these exact
// shapes reached a remote past a blocking signature gate in a real session. Fixed at
// the shared classifier (both callers reuse it, so neither can independently drift),
// proven here the same way F1 rounds 1/2 are: the adapter must now spawn
// guard-push.mjs for these forms too.
check("F1 round 3: codex adapter recognizes the escaped-value and unrecognized-global-option push shapes lib/git-cmd.mjs now classifies", () => {
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
  for (const command of [
    // backslash-escaped whitespace inside a -c value (synthetic path, not a real key)
    "git -c core.sshCommand=ssh\\ -i\\ /home/u/.ssh/id\\ -o\\ IdentitiesOnly=yes push -u origin branch",
    // --config-env: an unrecognized global option before the subcommand
    "git --config-env=core.sshCommand=VAR push origin HEAD",
  ]) {
    const output = decision(run({ tool_name: "Bash", tool_input: { command } }, root));
    assert.equal(output.permissionDecision, "deny", command);
    assert.match(output.permissionDecisionReason, /guard-push/, `${command}\n${output.permissionDecisionReason}`);
  }
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
  const root = readyLifecycleFixture("chat");
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
  const authorized = activateAuthorization(authorization.authorizeAction, authorization.selectionSha256);
  assert.equal(authorized.status, 0, authorized.stderr);
  const allowed = run(input, root);
  assert.equal(allowed.status, 0, allowed.stderr);
  assert.equal(allowed.stdout, "");
  assert.match(allowed.stderr, /exact one-time capability consumed/u);
  const replay = decision(run(input, root));
  assert.equal(replay.permissionDecision, "deny");
});

check("ADR-0059 Decision 4: the continuation names the configured mode's own final step, in both modes", () => {
  // The adapter prints the `authorize-by-signature` continuation in exactly one branch, and
  // until now no fixture in this suite ever reached it -- both HGO fixtures pinned
  // push_approval to "chat", so the signature branch had zero coverage while three of the
  // four guards in this family already carried the equivalent pin. Decision 4 makes it a
  // DoD item: the printed next-step command must match the LIVE configuration, so both
  // modes are exercised here and each assertion is bound to the mode the fixture actually
  // committed, not to the loop variable that produced it.
  for (const mode of ["chat", "signature"]) {
    const root = readyLifecycleFixture(mode);
    // Read back what the repository carries. readPushApprovalMode() honours the COMMITTED
    // bytes and nothing else, so this -- not the loop variable -- is the live configuration
    // the printed command has to agree with.
    const committed = readFileSync(join(root, "pipeline.user.yaml"), "utf8")
      .match(/human_approval:\s*"([a-z]+)"/u)?.[1];
    assert.equal(committed, mode, "fixture did not commit the mode it claims");

    const denied = decision(run({
      tool_name: "Write",
      tool_input: { file_path: "notes.md", content: "decision-4\n" },
    }, root));
    assert.equal(denied.permissionDecision, "deny", `mode=${committed}`);
    const reason = denied.permissionDecisionReason;
    // The mode-common first step is always the read-only planner.
    assert.match(reason, /Human override available for this exact action/u, `mode=${committed}`);
    assert.match(reason, /\bplan --repo\b/u, `mode=${committed}`);
    assert.match(reason, /prepare-authorization --repo/u, `mode=${committed}`);
    if (committed === "signature") {
      assert.match(reason, new RegExp(`gates\\.human_approval is "${committed}"`, "u"), `mode=${committed}`);
    }
    if (committed === "chat") {
      assert.match(reason, /\bauthorize --repo\b[^\n]*--selection-sha256[^\n]*--activate/u,
        "chat mode must offer the in-session activate step");
      assert.doesNotMatch(reason, /authorize-by-signature/u,
        "chat mode must not offer the signature-only final step");
      assert.doesNotMatch(reason, /emit-signature-digest/u,
        "chat mode has no signing step; nothing to emit a digest for");
    } else {
      // NVA-SIGENTRY-2 F2: the digest-emission step must be reachable from the printed
      // guidance alone, at the point where the human/agent actually needs it -- before
      // signing, i.e. between prepare-authorization and authorize-by-signature.
      assert.match(reason, /emit-signature-digest --repo/u,
        "signature mode must offer the digest-emission step before signing");
      // PO decision 2026-08-18 #12 (backlog/items/2026-08-18-hgo-signature-ceremony-
      // requires-more-human-steps-than-the-key-actually-needs.md): prepare-authorization
      // and emit-signature-digest are pure local digest computation (ADR-0059 Decision 1)
      // and now run agentically, in-session; only authorize-by-signature still needs the
      // external Ed25519 key and is labelled "outside this session". An inserted mode-
      // change label line now sits between emit-signature-digest and authorize-by-signature,
      // so the adjacency check allows one extra labelled line there while still pinning the
      // overall order and the in-session/outside-this-session split.
      assert.match(
        reason,
        /prepare-authorization --repo[^\n]*\n[^\n]*emit-signature-digest --repo[^\n]*\n(?:[^\n]*\n)?[^\n]*authorize-by-signature --repo/u,
        "emit-signature-digest must sit between prepare-authorization and authorize-by-signature",
      );
      assert.match(
        reason,
        /Then, in this session[^\n]*\n[^\n]*prepare-authorization --repo/u,
        "prepare-authorization must be labelled as running in this session",
      );
      assert.match(
        reason,
        /Then, outside this session[^\n]*\n[^\n]*authorize-by-signature --repo/u,
        "authorize-by-signature must be labelled as running outside this session",
      );
      assert.match(reason, /\bauthorize-by-signature --repo\b[^\n]*--proof <external-proof\.json>/u,
        "signature mode must offer its own decisive final step");
      assert.doesNotMatch(reason, /--activate/u,
        "signature mode must not offer the in-session activate step");
      assert.doesNotMatch(reason, /--selection-sha256/u,
        "signature mode has no in-session selection to confirm");
    }
    rmSync(root, { recursive: true, force: true });
  }
});

check("Pipeline Author Repair selects one exact source root and consumes one patch", () => {
  const root = readyLifecycleFixture("chat");
  const git = (...args) => spawnSync("git", args, { cwd: root, encoding: "utf8", shell: false });
  const sourceRoot = join(root, "plugins", "pipeline-core");
  mkdirSync(join(sourceRoot, ".codex-plugin"), { recursive: true });
  mkdirSync(join(sourceRoot, "lib"), { recursive: true });
  writeFileSync(join(sourceRoot, ".codex-plugin", "plugin.json"), '{"name":"pipeline-core","version":"0.4.7"}\n');
  writeFileSync(join(sourceRoot, "lib", "repair.mjs"), "export const repaired = false;\n");
  git("add", "plugins/pipeline-core");
  git("commit", "-q", "-m", "author repair fixture");
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
  const authorized = activateAuthorization(authorization.authorizeAction, authorization.selectionSha256);
  assert.equal(authorized.status, 0, authorized.stderr);
  const allowed = run(input, root);
  assert.equal(allowed.status, 0, allowed.stderr);
  assert.equal(allowed.stdout, "");
  assert.match(allowed.stderr, /exact one-time capability consumed/u);
  assert.equal(decision(run(input, root)).permissionDecision, "deny");
});

// The `doesNotMatch(/Human override available/)` this check carried until c609ac0 was a
// PROXY, not the property. When fe59eb4 wrote it (2026-08-01), GUARD-CROSS-REPO-MUTATION had
// no human-override route at all, so "no route text" and "no self-service retry loop" were
// the same observation. c609ac0 routed that denial class through HGO (ADR-0059 Decision 6),
// and this command was already HGO-classifiable before then -- eligibility()'s
// exactLocalPluginInstall / "global-plugin-install" mode landed in a483675, an ancestor of
// b108b3e. Measured, not inferred: this check is green at c609ac0^ and red at c609ac0, and
// b108b3e (the out-of-root eligible class) is not involved.
//
// The property fe59eb4 actually fixed survives intact and is pinned positively below. The
// defect it closed was an agent-executable LOOP: the cross-repository denial used to route to
// HGO-NARROWER-WRITER-REQUIRED, whose next action is `verify-audit` followed by "retry the
// exact original denial" -- every step runnable by the agent alone, ending back at the same
// denial without ever changing the allowed execution boundary. What replaced it is one
// terminal external boundary. The override route now printed alongside it is not that loop:
// it terminates at a human authorization the agent cannot issue for itself, which is a
// different thing from a self-service retry and is asserted as such.
check("local plugin-cache installation returns one external boundary without an audit retry loop", () => {
  const root = readyLifecycleFixture("chat");
  try {
    const output = decision(run({
      tool_name: "Bash",
      tool_input: { command: "codex plugin add pipeline-core@agent-pipeline-local" },
    }, root));
    assert.equal(output.permissionDecision, "deny");
    const reason = output.permissionDecisionReason;
    assert.match(reason, /GUARD-CROSS-REPO-MUTATION/u);
    assert.match(reason, /HGO-EXTERNAL-PLUGIN-CACHE-BOUNDARY/u);
    assert.match(reason, /separate-session-rooted-at-plugin-cache/u);
    assert.doesNotMatch(reason, /verify-audit/u);
    assert.doesNotMatch(reason, /effect-reconciliation-required/u);
    // ONE external boundary, still: the denial names it exactly once, so the agent is given a
    // single terminal destination rather than a menu of competing recoveries.
    assert.equal((reason.match(/HGO-EXTERNAL-PLUGIN-CACHE-BOUNDARY/gu) ?? []).length, 1);
    assert.equal((reason.match(/separate-session-rooted-at-plugin-cache/gu) ?? []).length, 1);
    // NO audit retry loop, still: nothing instructs the agent to re-run the denied command
    // after a step it could have taken by itself.
    assert.doesNotMatch(reason, /retry the exact original denial/u);
    assert.doesNotMatch(reason, /fresh emergency plan/u);
    // The route that IS offered is human-gated, which is why it is not a loop: the decisive
    // step is an authorization the agent cannot mint. Asserted mode-independently -- this
    // fixture commits chat mode as part of its real onboarding setup, and that setting is not
    // this check's subject; neither route lets the agent clear the denial by repeating it.
    if (/Human override available/u.test(reason)) {
      assert.match(reason, /prepare-authorization --repo/u,
        "an override route was advertised without the human authorization step that gates it");
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// backlog: cross-repository-boundary-guidance-still-omits-the-literal-command. The
// crossRepositoryOnlyDenial branch used to emit only `toolInputSha256` -- a hash a human
// attending the real terminal cannot act on -- unconditionally, not even behind the same
// `commandIsSafe` gate the sibling host-boundary route (GF-064) already applies. These two
// checks mirror that sibling's GF-064 pairing for this second site.
check("a safe Bash cross-repository-boundary denial carries the literal command and a copyCommand", () => {
  const root = readyLifecycleFixture("chat");
  const command = "codex plugin add pipeline-core@agent-pipeline-local";
  try {
    const output = decision(run({
      tool_name: "Bash",
      tool_input: { command },
    }, root));
    assert.equal(output.permissionDecision, "deny");
    const route = guardRecoveryRoute(output.permissionDecisionReason);
    assert.equal(route.code, "HGO-EXTERNAL-PLUGIN-CACHE-BOUNDARY");
    assert.equal(route.nextAction.action.command, command);
    assert.ok(route.nextAction.action.copyCommand, "copyCommand field is missing");
    assert.equal(route.nextAction.action.copyCommand.maxColumns, 72);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

check("a secret-bearing Bash cross-repository-boundary denial never carries the secret verbatim", () => {
  const root = readyLifecycleFixture("chat");
  const secret = "ghp_FAKEFAKEFAKEFAKE1234567890AB";
  const command = `codex plugin remove ${secret}`;
  const output = decision(run({
    tool_name: "Bash",
    tool_input: { command },
  }, root));
  assert.equal(output.permissionDecision, "deny");
  assert.doesNotMatch(output.permissionDecisionReason, /ghp_FAKEFAKEFAKEFAKE/u,
    "the secret-bearing Bash command leaked verbatim into the denial reason");
  const route = guardRecoveryRoute(output.permissionDecisionReason);
  assert.equal(route.code, "HGO-EXTERNAL-PLUGIN-CACHE-BOUNDARY");
  assert.equal(route.nextAction.action.command, null,
    "command must be suppressed when the eligibility secret screen flags the command");
  assert.equal(route.nextAction.action.copyCommand, null,
    "copyCommand must be suppressed exactly like command, never a bypass around the secret screen");
});

check("override persistence failure remains a sanitized fail-closed denial", () => {
  const root = readyLifecycleFixture("chat");
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
  const root = readyLifecycleFixture("chat");
  const output = decision(run({
    tool_name: "Bash",
    tool_input: {
      command: 'PIPELINE_GUARD_OVERRIDE="GG-03|20260726-codex-adapter|PO-approved fixture" git push origin deadbeef:refs/heads/main',
    },
  }, root));
  assert.equal(output.permissionDecision, "deny");
  assert.match(output.permissionDecisionReason, /raw Bash\/Git cannot publish refs\/heads\/main/u);
  assert.match(output.permissionDecisionReason, /PUSH-PROOF-COMMIT-UNRESOLVED/u);
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
  const root = guidanceFixture();
  writeFileSync(join(root, ".claude", "guard-config.json"), JSON.stringify({
    protectedTestPaths: [{ id: "HGO-LIFECYCLE-AGGREGATE", pattern: "locked\\.test\\.mjs$", reason: "locked fixture" }],
  }));
  const output = decision(run({ tool_name: "Edit", tool_input: { file_path: "locked.test.mjs" } }, root));
  assert.equal(output.permissionDecision, "deny");
  assert.match(output.permissionDecisionReason, /HGO-LIFECYCLE-AGGREGATE/);
  assert.match(output.permissionDecisionReason, /guard-lifecycle-ready/);
  assert.doesNotMatch(output.permissionDecisionReason, /Human override available|authorize-by-signature|verify-audit/u);
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

// GF-060/GF-064/GF-094 used this no-Git fixture as a proxy for HGO's host-boundary
// route. Lifecycle now correctly refuses it before HGO topology, so it proves the
// nonliftable native behavior instead. Shared command/copy disclosure is exercised by
// human-guard-override.test.mjs and the real cross-repository route above.
function nonReadyLifecycleFixture() {
  const root = fixture();
  writeFileSync(join(root, "pipeline.user.yaml"), "schema: pipeline.user.v3\n");
  return root;
}

check("GF-060/GF-064: an invalid lifecycle denial has no HGO route and never discloses a secret", () => {
  const root = nonReadyLifecycleFixture();
  const secret = "ghp_FAKEFAKEFAKEFAKE1234567890AB";
  const output = decision(run({
    tool_name: "Bash",
    tool_input: { command: `touch ${secret}` },
  }, root));
  assert.equal(output.permissionDecision, "deny");
  assert.match(output.permissionDecisionReason, /GUARD-LIFECYCLE-NOT-READY/u);
  assert.match(output.permissionDecisionReason, /Technical repair is required before retrying/u);
  assert.doesNotMatch(output.permissionDecisionReason, /ghp_FAKEFAKEFAKEFAKE/u,
    "the secret-bearing content leaked verbatim into the denial reason");
  assert.doesNotMatch(output.permissionDecisionReason, /Guard recovery route:|Human override available|copyCommand|authorize-by-signature/u);
});

check("GF-060/GF-094: an invalid lifecycle denial suppresses raw command and copy guidance", () => {
  const root = nonReadyLifecycleFixture();
  const command = "node lib/project-onboarding-v3.mjs kickoff plan --root /some/project --goal HTML Minispiel gemäß Übergabe --language de";
  const output = decision(run({
    tool_name: "Bash",
    tool_input: { command },
  }, root));
  assert.equal(output.permissionDecision, "deny");
  assert.match(output.permissionDecisionReason, /GUARD-LIFECYCLE-NOT-READY/u);
  assert.doesNotMatch(output.permissionDecisionReason, new RegExp(command.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u"));
  assert.doesNotMatch(output.permissionDecisionReason, /copyCommand|Guard recovery route:/u);
});

// NVA-CROSSREPOGUIDANCE-1 (backlog/items/2026-08-18-codex-pretool-guard-cross-repository-
// recovery-guidance-points-at-the-wrong-repo.md): NVA-CROSSREPOLEDGER-1 rebound a
// "cross-repository-target" denial's ledger to the TARGET repository, but this adapter
// kept printing `--repo <projectRoot>` -- the coordinator -- in every override-ceremony
// line. A human following the printed guidance literally would point
// guard-human-override.mjs at a repository where the request does not exist. The ordinary
// same-repo case cannot show this: there the two roots coincide and the bug is invisible,
// so the cross-repository case is the one pinned here, end to end, by RUNNING the exact
// command the adapter printed.
function guidanceFixture(mode = "chat") {
  const root = fixture();
  const git = (...args) => spawnSync("git", args, { cwd: root, encoding: "utf8", shell: false });
  git("init", "-q", "-b", "main");
  git("config", "user.name", "Fixture");
  git("config", "user.email", "fixture@example.invalid");
  writeFileSync(join(root, "README.md"), "fixture\n");
  writeFileSync(join(root, "pipeline.user.yaml"), `schema: "pipeline.user.v3"\ngates:\n  push_approval: "${mode}"\n`);
  git("add", "README.md", "pipeline.user.yaml");
  git("commit", "-q", "-m", "fixture");
  // git reports the real path; the printed guidance is built from the same resolution, so
  // the fixture compares against that rather than against the mkdtemp spelling.
  return git("rev-parse", "--path-format=absolute", "--show-toplevel").stdout.trim();
}

/**
 * Isolate THIS adapter's own override-ceremony block and read the `plan --repo <root>
 * --request-sha256 <sha>` pair out of it. A denial reason aggregates the inner denying
 * guard's text as well, and that guard prints its own separate ceremony block from its own
 * root variable -- a different code path, untouched here -- so the assertions below must
 * not accidentally read the inner guard's line instead of the adapter's.
 */
function adapterCeremony(reason) {
  const marker = "Human override available for this exact action (one use; audited; explicit confirmation required):";
  const index = reason.indexOf(marker);
  assert.notEqual(index, -1, `no adapter override-ceremony block in: ${reason}`);
  const block = reason.slice(index);
  const match = block.match(/plan --repo "([^"]+)" --request-sha256 ([a-f0-9]{64})/u);
  assert.notEqual(match, null, `no plan guidance line in the adapter block: ${block}`);
  return { block, repo: match[1], request: match[2] };
}

check("NVA-CROSSREPOGUIDANCE-1: a cross-repository denial prints the TARGET repo in every ceremony line, and the printed plan command actually resolves there", () => {
  const root = guidanceFixture(); // the coordinating session's own root
  const target = guidanceFixture(); // the guarded patch's actual, distinct physical target
  try {
    const denied = decision(run({
      tool_name: "apply_patch",
      tool_input: {
        command: `*** Begin Patch\n*** Update File: ${join(target, "README.md")}\n@@\n-fixture\n+patched\n*** End Patch`,
      },
    }, root));
    assert.equal(denied.permissionDecision, "deny");
    const ceremony = adapterCeremony(denied.permissionDecisionReason);

    // The defect, stated directly: this printed --repo used to be the coordinator.
    assert.equal(ceremony.repo, target,
      "the printed ceremony must name the target repository the ledger actually bound to");
    assert.notEqual(ceremony.repo, root,
      "naming the coordinator is exactly the defect under test");
    // Every continuation line, not just the first, has to agree -- they are one ceremony.
    for (const step of ["prepare-authorization", "authorize"]) {
      assert.match(ceremony.block, new RegExp(`${step} --repo ${JSON.stringify(target)} `, "u"),
        `the ${step} step must name the target repository too`);
    }
    assert.doesNotMatch(ceremony.block, new RegExp(`--repo ${JSON.stringify(root)}`, "u"),
      "no line of the adapter's ceremony may name the coordinator for a cross-repository denial");

    // Decisive: run the command the adapter printed, verbatim. It has to succeed against
    // the printed root and fail against the coordinator -- proving the guidance is
    // executable, not merely differently worded.
    const planned = spawnSync(process.execPath, [
      humanOverrideScript, "plan", "--repo", ceremony.repo, "--request-sha256", ceremony.request,
    ], { cwd: root, encoding: "utf8", shell: false });
    assert.equal(planned.status, 0, planned.stderr);
    const plan = JSON.parse(planned.stdout);
    assert.equal(plan.commandClass, "cross-repository-target");
    assert.equal(plan.root, target);

    const misdirected = spawnSync(process.execPath, [
      humanOverrideScript, "plan", "--repo", root, "--request-sha256", ceremony.request,
    ], { cwd: root, encoding: "utf8", shell: false });
    assert.notEqual(misdirected.status, 0,
      "the coordinator root must not resolve this request -- that is why printing it was a defect");
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(target, { recursive: true, force: true });
  }
});

check("NVA-CROSSREPOGUIDANCE-1: an ordinary in-root denial still prints the session's own root, unchanged", () => {
  const root = readyLifecycleFixture("chat");
  try {
    const denied = decision(run({
      tool_name: "Write",
      tool_input: { file_path: "notes.md", content: "ordinary\n" },
    }, root));
    assert.equal(denied.permissionDecision, "deny");
    const ceremony = adapterCeremony(denied.permissionDecisionReason);
    assert.equal(ceremony.repo, root,
      "the ordinary same-repo case must keep naming the session's own root");
    const planned = spawnSync(process.execPath, [
      humanOverrideScript, "plan", "--repo", ceremony.repo, "--request-sha256", ceremony.request,
    ], { cwd: root, encoding: "utf8", shell: false });
    assert.equal(planned.status, 0, planned.stderr);
    assert.equal(JSON.parse(planned.stdout).root, root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

check("lifecycle-not-ready denial does not advertise a human override ceremony", () => {
  const root = fixture();
  try {
    writeFileSync(join(root, ".claude", "pipeline.json"), JSON.stringify({ project: "test", verify: "node verify.mjs" }));
    for (const filePath of ["notes.md", join(root, "absolute-notes.md")]) {
      const denied = decision(run({ tool_name: "Edit", tool_input: { file_path: filePath, old_string: "", new_string: "x" } }, root));
      assert.equal(denied.permissionDecision, "deny");
      assert.match(denied.permissionDecisionReason, /GUARD-LIFECYCLE-NOT-READY/u);
      assert.match(denied.permissionDecisionReason, /Technical repair is required before retrying/u);
      assert.doesNotMatch(denied.permissionDecisionReason, /Re-run the typed project-onboarding-v3 inspection/u);
      assert.doesNotMatch(denied.permissionDecisionReason, /Human override available|authorize-by-signature|verify-audit/u);
    }
  } finally { rmSync(root, { recursive: true, force: true }); }
});

if (process.exitCode) process.exit(process.exitCode);
process.stdout.write(`1..${passed}\n`);
