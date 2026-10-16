// SPDX-License-Identifier: SUL-1.0
// Pin for pipeline.agy-driver-dispatch-and-design-routes-incomplete (AC-108),
// slice ALF-C-P20-12B: Antigravity bootstrap lock freshness and per-session isolation.
import assert from "node:assert/strict";
import { mkdirSync, rmSync, statSync, utimesSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

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

test("F7: every Dispatch trailer example in the agent obligations is an admitted work-package binding", async () => {
  const { finishedCommitMessageFindings } = await import(
    pathToFileURL(join(REPO, "plugins/pipeline-core/lib/commit-message-policy.mjs")).href);
  const text = readFileSync(join(REPO, "templates/prompts/agent-obligations.md"), "utf8");
  assert.equal(text.includes("Dispatch: design (elephant)"), false, "the retired design-trailer example must not be documented");
  const examples = [...text.matchAll(/`Dispatch:[ \t]+([^`\n]+)`/gu)]
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
