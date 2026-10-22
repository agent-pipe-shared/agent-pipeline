// SPDX-License-Identifier: SUL-1.0
// Pin for pipeline.agy-driver-dispatch-and-design-routes-incomplete (AC-108),
// slice ALF-C-P20-12B: Antigravity bootstrap lock freshness and per-session isolation.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, statSync, utimesSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { evaluateLifecycleReadyGuard } from "../guard/evaluate.mjs";
import { registeredFunctionalTaskRoutes } from "../model-role-route-source.mjs";
import { evaluateRoleRoutePreflight } from "../role-route-preflight.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "../../../..");
// Env seam: lets a scratch mirror of an older hook file be pinned for RED runs.
const LOCK_MODULE = process.env.AGY_BOOTSTRAP_LOCK_MODULE
  || join(REPO, "plugins/pipeline-core/hooks/antigravity-bootstrap-lock.mjs");
const { armAntigravityBootstrapSession } = await import(pathToFileURL(LOCK_MODULE).href);

const FIXTURES = join(REPO, "scratch", "p2012b");
const VERSION = "9.9.9-fixture";
const STALE_MS = 40 * 60 * 1000;

function sessionDir(name) {
  const dir = join(FIXTURES, name);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  return dir;
}
function age(file, ms) {
  const t = new Date(Date.now() - ms);
  utimesSync(file, t, t);
}

test("an expired lock of the SAME session is refreshed on re-arm without re-arming the barrier", () => {
  const dir = sessionDir("same-session");
  armAntigravityBootstrapSession(dir, VERSION);
  const lock = join(dir, "requires-bootstrap.lock");
  const pending = join(dir, "requires-bootstrap.pending");
  rmSync(pending); // barrier already consumed
  age(lock, STALE_MS);
  const before = statSync(lock).mtimeMs;
  const result = armAntigravityBootstrapSession(dir, VERSION);
  assert.equal(result.status, "already-armed");
  assert.ok(statSync(lock).mtimeMs > before + 30 * 60 * 1000, "stale lock mtime must be renewed");
  assert.equal(existsSync(pending), false, "a consumed barrier is never re-armed");
});

test("re-arming one session never touches another session's lock", () => {
  const a = sessionDir("session-a");
  const b = sessionDir("session-b");
  armAntigravityBootstrapSession(a, VERSION);
  armAntigravityBootstrapSession(b, VERSION);
  const lockB = join(b, "requires-bootstrap.lock");
  age(lockB, STALE_MS);
  const beforeB = statSync(lockB).mtimeMs;
  age(join(a, "requires-bootstrap.lock"), STALE_MS);
  armAntigravityBootstrapSession(a, VERSION);
  assert.equal(statSync(lockB).mtimeMs, beforeB, "session B lock mtime is untouched by session A re-arm");
});

test("a fresh lock is not rewritten by a ready re-arm", () => {
  const dir = sessionDir("fresh");
  armAntigravityBootstrapSession(dir, VERSION);
  const lock = join(dir, "requires-bootstrap.lock");
  const t = new Date(Date.now() - 60 * 1000);
  utimesSync(lock, t, t);
  const before = statSync(lock).mtimeMs;
  const result = armAntigravityBootstrapSession(dir, VERSION);
  assert.equal(result.wrote, false);
  assert.equal(statSync(lock).mtimeMs, before);
  writeFileSync(join(dir, ".done"), "");
});

// ---------------------------------------------------------------------------
// Slice ALF-C-P20-12E: Befund 2 (F2) the denied session is told its way out,
// Befund 4 (F4) the AGY design-readiness route is retired, not half-built, and
// Befund 7 (F7) every documented Dispatch trailer example is admitted.
// ---------------------------------------------------------------------------

// Env seam: lets a scratch mirror of the PRE-FIX guard
// (`git show ae262e962:plugins/pipeline-core/hooks/antigravity-pretool-guard.mjs`
// with its relative imports rewritten to absolute file URLs) be pinned for the
// RED run. The guard installs process.on uncaught handlers that exit 2, so it
// is only ever imported in a CHILD process, never in this test process.
const GUARD_MODULE = process.env.AGY_PRETOOL_GUARD_MODULE
  || join(REPO, "plugins/pipeline-core/hooks/antigravity-pretool-guard.mjs");

const GUARD_CHILD_SOURCE = [
  'import { pathToFileURL } from "node:url";',
  'import { resolve } from "node:path";',
  'const emit = (value) => process.stdout.write("RESULT:" + JSON.stringify(value) + "\\n", () => process.exit(0));',
  "try {",
  "  const mod = await import(pathToFileURL(resolve(process.env.AGY_PRETOOL_GUARD_MODULE)).href);",
  '  const missing = ["isBootstrapReadCommand", "bootstrapBarrierConsumeCommand", "bootstrapBarrierDenialReason"]',
  '    .filter((name) => typeof mod[name] !== "function");',
  "  if (missing.length > 0) emit({ missing });",
  "  else {",
  "    const command = mod.bootstrapBarrierConsumeCommand();",
  "    const posixSkill = \"/opt/plugin/skills/pipeline-start/SKILL.md\";",
  "    const posixCommand = mod.bootstrapBarrierConsumeCommand({ pipelineStartSkill: posixSkill, platform: \"linux\" });",
  "    const unspellable = \"/opt/pl\" + String.fromCharCode(34) + \"ug\" + String.fromCharCode(39) + \"in/skills/pipeline-start/SKILL.md\";",
  "    emit({",
  "      command,",
  "      reason: mod.bootstrapBarrierDenialReason(),",
  "      accepted: mod.isBootstrapReadCommand(command),",
  '      acceptedOtherFile: typeof command === "string" ? mod.isBootstrapReadCommand(command.replace("SKILL.md", "OTHER.md")) : null,',
  "      posixCommand,",
  '      posixAccepted: mod.isBootstrapReadCommand(posixCommand, { pipelineStartSkill: posixSkill, platform: "linux" }),',
  '      unspellableCommand: mod.bootstrapBarrierConsumeCommand({ pipelineStartSkill: unspellable, platform: "linux" }),',
  '      unspellableReason: mod.bootstrapBarrierDenialReason({ pipelineStartSkill: unspellable, platform: "linux" }),',
  "    });",
  "  }",
  "} catch (error) {",
  "  emit({ failure: String((error && error.stack) || error) });",
  "}",
].join("\n");

let guardProbe;
function probeGuardInChild() {
  if (guardProbe !== undefined) return guardProbe;
  const child = spawnSync(process.execPath, ["--input-type=module", "-e", GUARD_CHILD_SOURCE], {
    cwd: REPO,
    env: { ...process.env, AGY_PRETOOL_GUARD_MODULE: GUARD_MODULE },
    encoding: "utf8", shell: false, windowsHide: true, timeout: 120_000,
  });
  const line = String(child.stdout ?? "").split(/\r?\n/u).find((entry) => entry.startsWith("RESULT:"));
  assert.ok(line, `guard child printed no RESULT line (status ${child.status}, signal ${child.signal}): ${child.stderr}`);
  guardProbe = JSON.parse(line.slice("RESULT:".length));
  return guardProbe;
}

const BARRIER_PREFIX = /^BLOCKED \(Hardening Layer\): Mandatory Session Bootstrap\./u;

test("F2: the bootstrap barrier denial names the one command the barrier itself admits", () => {
  const result = probeGuardInChild();
  assert.equal(result.failure, undefined, `guard module failed to load in the child: ${result.failure}`);
  assert.deepEqual(result.missing ?? [], [], "the guard must export the barrier command and denial-reason helpers");
  assert.equal(typeof result.command, "string", "a copy-safe consume command must exist for the loaded plugin root");
  assert.match(result.command, /^cat ["'].*pipeline-start\/SKILL\.md["']$/u);
  if (process.platform === "win32") assert.equal(result.command.includes("\\"), false, "no backslash spelling on Windows");
  assert.equal(result.accepted, true, `isBootstrapReadCommand must admit the advertised command: ${result.command}`);
  assert.equal(result.acceptedOtherFile, false, "control: only the pipeline-start SKILL read is admitted");
  assert.match(result.reason, BARRIER_PREFIX, "the denial keeps its Mandatory Session Bootstrap prefix");
  assert.ok(result.reason.includes(result.command), "the denial text must contain the advertised consume command");
  assert.equal(result.posixCommand, 'cat "/opt/plugin/skills/pipeline-start/SKILL.md"');
  assert.equal(result.posixAccepted, true, "the POSIX spelling is admitted for its own skill path");
});

test("F2: with no copy-safe spelling the denial keeps its prefix and advertises no command", () => {
  const result = probeGuardInChild();
  assert.equal(result.failure, undefined, `guard module failed to load in the child: ${result.failure}`);
  assert.deepEqual(result.missing ?? [], [], "the guard must export the barrier command and denial-reason helpers");
  assert.equal(result.unspellableCommand, null);
  assert.match(result.unspellableReason, BARRIER_PREFIX);
  assert.equal(result.unspellableReason.includes("cat "), false, "a denial never advertises a command the barrier would refuse");
});

test("F4: the Antigravity design-readiness bootstrap is retired with a typed refusal and grants no authority", async () => {
  const { runRunnerDesignReadinessBootstrap } = await import(
    pathToFileURL(join(REPO, "plugins/pipeline-core/scripts/runner-design-readiness-bootstrap.mjs")).href);
  // Retired before parsing, state access, dispatch or publication: any
  // dependency read would throw and fail this case.
  const untouched = new Proxy({}, { get(_target, key) { throw new Error(`retired route read dependency ${String(key)}`); } });
  const result = await runRunnerDesignReadinessBootstrap(["--runner", "antigravity"], untouched);
  assert.equal(result.ok, false);
  assert.equal(result.code, "DESIGN-COURSE-RETIRED");
  assert.equal(result.implementationAuthority, false);
});

test("F7: every Dispatch trailer example in the agent obligations is admitted and the design (elephant) form is documented", async () => {
  const { finishedCommitMessageFindings } = await import(
    pathToFileURL(join(REPO, "plugins/pipeline-core/lib/commit-message-policy.mjs")).href);
  const text = readFileSync(join(REPO, "templates/prompts/agent-obligations.md"), "utf8");
  assert.equal(text.includes("Dispatch: design (elephant)"), true, "the admitted design-trailer form (AC-205, PO decision 2026-10-16 #12) must be documented");
  const examples = [...text.matchAll(/`Dispatch:[ \t]+([^`\n]+)`/gu)]
    // Evidence-bound bindings (administrative, generated, signed integration) are admitted only with their own
    // independent evidence; they are not unconditional work-package examples and are pinned elsewhere.
    .filter((match) => !/administrative \(elephant\)$|\(elephant-generated\)$|\(integration\)$/u.test(match[1].trim()))
    .map((match) => match[1].trim().replace(/<[A-Za-z_]+>/gu, "ALF-C-P20-12E"));
  assert.ok(examples.length >= 3, `expected the documented Dispatch examples, found ${JSON.stringify(examples)}`);
  assert.ok(examples.includes("stage-0 (elephant)"));
  assert.ok(examples.some((value) => value.endsWith("(goldfish)")));
  const malformed = (value) => finishedCommitMessageFindings(
    `docs: example\n\nbody\n\nAI-Assisted: true\nDispatch: ${value}\n`,
    { requireMarker: true, requireDispatch: true },
  ).findings.filter((finding) => finding.code === "GIT-03-DISPATCH-MALFORMED");
  for (const value of examples) assert.deepEqual(malformed(value), [], `documented example is rejected: Dispatch: ${value}`);
  assert.equal(malformed("bogus (nobody)").length, 1, "control: a bogus trailer value is reported as malformed");
});

test("AC-108: the AGY Goldfish dispatch reference forbids parallel file writes in one turn until the hook race is fixed", () => {
  const text = readFileSync(join(REPO, "plugins/pipeline-core/skills/pipeline-start/references/antigravity-native-dispatch.md"), "utf8").replace(/\s+/gu, " ");
  assert.match(text, /A Goldfish makes no parallel file writes in one turn until the hook race is fixed/u);
});

test("AC-108: the start preflight reports a sandbox-unreachable node with a typed code and the one-time remedy, and unknown is never ready", async () => {
  const { observeNodeSandboxProbe } = await import(
    pathToFileURL(join(REPO, "plugins/pipeline-core/lib/node-sandbox-probe.mjs")).href);
  const ok = { status: 0, stdout: "v22.0.0\n" };
  const manager = observeNodeSandboxProbe({ execPath: "/home/u/.local/share/fnm/node-versions/v22/installation/bin/node", spawn: () => ok });
  assert.equal(manager.status, "version-manager-path");
  assert.equal(manager.code, "NODE-SANDBOX-UNREACHABLE");
  assert.equal(typeof manager.remedy, "string");
  assert.equal(manager.ready, false);
  const win = observeNodeSandboxProbe({ execPath: "C:\\Users\\u\\AppData\\Local\\fnm_multishells\\1\\node.exe", spawn: () => ok });
  assert.equal(win.status, "version-manager-path");
  const stable = observeNodeSandboxProbe({ execPath: "/usr/bin/node", spawn: () => ok });
  assert.equal(stable.status, "stable-path");
  assert.equal(stable.ready, true);
  const unknown = observeNodeSandboxProbe({ execPath: "/usr/bin/node", spawn: () => ({ status: null, error: new Error("ETIMEDOUT") }) });
  assert.equal(unknown.status, "unknown");
  assert.equal(unknown.ready, false);
  assert.equal(observeNodeSandboxProbe({ execPath: "", spawn: () => ok }).status, "unknown");
});

// ---------------------------------------------------------------------------
// Added 0.7.0 acceptance (2026-10-22 measurement): the main agent can update the calibrated handover
// (docs/state.md) through an admitted route in every phase, and Critic, Advisor and Verify have an
// Antigravity route or the recorded self-dispatch fallback.
// ---------------------------------------------------------------------------
const ADAPTER = join(REPO, "plugins/pipeline-core/hooks/antigravity-pretool-guard.mjs");

/** A governed, high-risk project in a given phase. No dispatch record is open: the EL-01 tripwire's own refusal condition holds. */
function phaseFixture({ planApproved, phase }) {
  const root = mkdtempSync(join(tmpdir(), "agy-handover-pin-"));
  for (const dir of [".claude", "project", ".agent-pipeline", "specs/feat-1", "docs"]) mkdirSync(join(root, dir), { recursive: true });
  writeFileSync(join(root, ".claude", "pipeline.json"), JSON.stringify({ project: "test", verify: "node verify.mjs" }));
  writeFileSync(join(root, ".agent-pipeline", "onboarding-consent.json"), JSON.stringify({
    schema: "pipeline.onboarding-consent-marker.v1", status: "consent-given-onboarding-incomplete", consentGivenAt: "2026-10-02T00:00:00.000Z",
  }));
  writeFileSync(join(root, "project", "pipeline-state.json"), JSON.stringify({
    schema: "pipeline.state.v0", planApproved, activeFeature: { id: "feat-1", phase, planPath: "specs/feat-1/prd.md" },
  }));
  writeFileSync(join(root, "specs", "feat-1", "spec.md"), "| Risk class | high |\n| Rigor level | 2 |\n");
  writeFileSync(join(root, "docs", "state.md"), "# State\n");
  return root;
}
function runAdapter(root, toolCall) {
  const result = spawnSync(process.execPath, [ADAPTER], {
    cwd: root, env: { ...process.env, CLAUDE_PROJECT_DIR: root }, input: JSON.stringify({ workspacePaths: [root], toolCall }),
    encoding: "utf8", timeout: 60_000,
  });
  if (result.status === 2) return { decision: "deny", reason: String(result.stderr) };
  assert.equal(result.status, 0, `adapter failed: ${result.stderr}`);
  return { decision: "allow", reason: "" };
}
const handoverWrite = (root) => ({ name: "write_to_file", args: { TargetFile: join(root, "docs", "state.md"), CodeContent: "# State\nupdated\n" } });
const codeWrite = (root) => ({ name: "write_to_file", args: { TargetFile: join(root, "src", "code.js"), CodeContent: "const a = 1;" } });

for (const [name, fixture] of [["design phase before plan approval", { planApproved: false, phase: "design" }], ["implementation phase", { planApproved: true, phase: "implementation" }]]) {
  test(`AC-108: ${name}: the only guard that can still refuse a docs/state.md write through the Antigravity adapter is lifecycle readiness (EL-01 and the dev-plan gate exempt docs/)`, () => {
    const root = phaseFixture(fixture);
    try {
      const handover = runAdapter(root, handoverWrite(root));
      assert.doesNotMatch(handover.reason, /guard-el01-tripwire|guard-devplan|guard-handover-size|guard-testpath|guard-gate-strength/u, handover.reason);
      // Control: the same fixture refuses a production-code write for the EL-01 tripwire's own reason, so the exemption is what lets the handover through.
      const code = runAdapter(root, codeWrite(root));
      assert.equal(code.decision, "deny");
      assert.match(code.reason, /guard-el01-tripwire|guard-devplan/u, code.reason);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
}

test("AC-108: with project readiness satisfied the lifecycle guard admits the handover write for the antigravity runner whatever the feature phase", () => {
  const ready = { schema: "pipeline.project-onboarding-ready-gate.v1", status: "ready", intent: "session" };
  for (const [name, fixture] of [["design", { planApproved: false, phase: "design" }], ["implementation", { planApproved: true, phase: "implementation" }]]) {
    const root = phaseFixture(fixture);
    try {
      for (const tool_name of ["Write", "Edit"]) {
        const result = evaluateLifecycleReadyGuard({ tool_name, tool_input: { file_path: "docs/state.md" } },
          { projectDir: root, runner: "antigravity", requireProjectOnboardingReadyFn() { return ready; } });
        assert.deepEqual(result, { exitCode: 0, stderr: "" }, `${name}/${tool_name}`);
      }
    } finally { rmSync(root, { recursive: true, force: true }); }
  }
});

test("AC-108: Antigravity has a native route for the implementor and the plan verifier, and every other role resolves to a typed state, never a silent gap", () => {
  const source = registeredFunctionalTaskRoutes();
  assert.equal(source.ok, true);
  const observed = (kind) => ({ kind, evidenceSha256: "a".repeat(64), hookRecordedStart: true, hookRecordedTerminal: true });
  const roles = ["advisor", "critic", "goldfish.implement", "goldfish.mechanic", "goldfish.deep", "readiness", "plan-verifier"];
  const result = evaluateRoleRoutePreflight({ source, runner: "antigravity", hostObservations: Object.fromEntries(roles.map((role) => [role, observed("native")])) });
  assert.equal(result.roles["goldfish.implement"].state, "native");
  assert.equal(result.roles["plan-verifier"].state, "native");
  for (const role of roles) {
    assert.ok(["native", "fallback-self-dispatch", "unavailable"].includes(result.roles[role].state), role);
    assert.match(result.roles[role].reasonCode, /^RRP-/u, role);
  }
});

// PO decision D122 (2026-10-22): the recorded self-dispatch fallback is admitted for the Antigravity Advisor and Critic with an
// honest assurance label; native AGY route cells wait for an authenticated per-call carrier (D63/AC-109). Every other cell is unchanged.
test("AC-108: Critic and Advisor each have an Antigravity route or the recorded self-dispatch fallback (D122: self-dispatch without an authenticated per-call carrier)", () => {
  const source = registeredFunctionalTaskRoutes();
  const observed = (kind) => ({ kind, evidenceSha256: "a".repeat(64), hookRecordedStart: true, hookRecordedTerminal: true });
  const roles = ["advisor", "critic", "goldfish.implement", "goldfish.mechanic", "goldfish.deep", "readiness", "plan-verifier"];
  const result = evaluateRoleRoutePreflight({ source, runner: "antigravity", hostObservations: Object.fromEntries(roles.map((role) => [role, observed("native")])) });
  for (const role of ["critic", "advisor"]) {
    assert.deepEqual(result.roles[role], { state: "fallback-self-dispatch", reasonCode: "RRP-FALLBACK-SELF-DISPATCH-NO-CARRIER", evidence: "a".repeat(64) }, role);
  }
  // Every other antigravity cell is unchanged: an unavailable registry cell stays RRP-ROUTE-CELL-UNAVAILABLE, a native route stays native.
  for (const role of ["goldfish.mechanic", "goldfish.deep", "readiness"]) {
    assert.deepEqual(result.roles[role], { state: "unavailable", reasonCode: "RRP-ROUTE-CELL-UNAVAILABLE", evidence: "" }, role);
  }
  assert.equal(result.roles["goldfish.implement"].state, "native");
  assert.equal(result.roles["plan-verifier"].state, "native");
  // Without a native observation there is no evidence to rest the fallback on, and a Critic without a hook-recorded start and terminal stays unavailable.
  const bare = evaluateRoleRoutePreflight({ source, runner: "antigravity", hostObservations: {} });
  assert.equal(bare.roles.advisor.reasonCode, "RRP-ROUTE-CELL-UNAVAILABLE");
  assert.equal(bare.roles.critic.reasonCode, "RRP-ROUTE-CELL-UNAVAILABLE");
  const noHook = evaluateRoleRoutePreflight({ source, runner: "antigravity", hostObservations: { critic: { ...observed("native"), hookRecordedTerminal: false } } });
  assert.equal(noHook.roles.critic.state, "unavailable");
  // The Claude cells are unchanged: the native routes stay native, never relabelled as a no-carrier self-dispatch.
  const claude = evaluateRoleRoutePreflight({ source, runner: "claude", hostObservations: { advisor: observed("native"), critic: observed("native") } });
  assert.equal(claude.roles.advisor.state, "native");
  assert.equal(claude.roles.critic.state, "native");
});
