// SPDX-License-Identifier: SUL-1.0
// Pin: pipeline.agy-managed-copy-first-start-lacks-attestation (AC-111, slice ALF-C-P18-02).
// Qualifies the original acceptance of backlog item 2026-09-29 against the real installer,
// refresh host and preflight. Only documented injection seams are used (observeSource,
// observeTopology, runCli, writeInstalledReceipt, the preflight Fn seams); nothing under test is mocked.
// Fixtures live under the repository scratch/ directory, never the OS temp dir.
import test from "node:test";
import assert from "node:assert/strict";
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { refreshAntigravityInstallation, verifyAntigravityInstallerSource } from "../../install-agy.mjs";
import { observePipelineStartPreflight } from "../../scripts/pipeline-start-preflight.mjs";
import { createGovernanceScopeController } from "../governance-scope.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, "..", "..", "..", "..");
const SCRATCH = join(REPO_ROOT, "scratch");

function modeBitsSupported() {
  mkdirSync(SCRATCH, { recursive: true });
  const probeDir = mkdtempSync(join(SCRATCH, "agy-p18-02-modeprobe-"));
  try {
    const file = join(probeDir, "probe");
    writeFileSync(file, "x");
    chmodSync(file, 0o600);
    return (statSync(file).mode & 0o077) === 0;
  } finally { rmSync(probeDir, { recursive: true, force: true }); }
}
const MODE_BITS = modeBitsSupported();
// Typed host limitation (PO decision K7): the receipt writer and verifier refuse group/other mode bits.
const HOST_LIMITATION = {
  skip: MODE_BITS ? false
    : "host-limitation: POSIX file/directory mode bits unavailable on this host (receipt writer requires mode & 0o077 == 0); owner Coordinator; due 2026-10-19 (Linux/WSL run, PO decision K7)",
};

/** Clean Git source repo, a gitless marketplace copy, an empty non-Git workspace and a fixture config root. */
function build(t, label) {
  mkdirSync(SCRATCH, { recursive: true });
  const base = mkdtempSync(join(SCRATCH, `agy-p18-02-${label}-`));
  t.after(() => rmSync(base, { recursive: true, force: true }));
  const configRoot = join(base, "home", ".gemini");
  const workspaceRoot = join(base, "empty-workspace");
  const sourceRepo = join(base, "source");
  const sourcePluginRoot = join(sourceRepo, "plugins", "pipeline-core");
  const marketplaceRoot = join(base, "marketplace", "plugins", "pipeline-core");
  const installedPluginRoot = join(configRoot, "config", "plugins", "agent-pipeline-core");
  mkdirSync(workspaceRoot, { recursive: true });
  mkdirSync(join(configRoot, "config", "plugins"), { recursive: true });
  for (const d of ["hooks", join("skills", "critic-review"), "scripts"]) mkdirSync(join(sourcePluginRoot, d), { recursive: true });
  writeFileSync(join(sourcePluginRoot, "plugin.json"), '{"name":"agent-pipeline-core","version":"0.7.0","description":"Synthetic test plugin"}\n');
  writeFileSync(join(sourcePluginRoot, "hooks.json"), '{"pipeline-core":{"PreInvocation":[{"type":"command","command":"node hooks/antigravity-start-hint.mjs"}]}}\n');
  for (const p of ["hooks/antigravity-pretool-guard.mjs", "hooks/antigravity-start-hint.mjs", "skills/critic-review/SKILL.md", "scripts/pipeline-start-preflight.mjs"]) {
    writeFileSync(join(sourcePluginRoot, p), "// synthetic fixture\n");
  }
  execFileSync("git", ["-C", sourceRepo, "init", "--initial-branch", "main"], { stdio: "ignore" });
  execFileSync("git", ["-C", sourceRepo, "remote", "add", "origin", "https://example.invalid/synthetic-pipeline.git"], { stdio: "ignore" });
  execFileSync("git", ["-C", sourceRepo, "add", "."], { stdio: "ignore" });
  execFileSync("git", ["-C", sourceRepo, "-c", "user.name=Fixture", "-c", "user.email=fixture@example.test", "commit", "-m", "fixture"], { stdio: "ignore" });
  cpSync(sourcePluginRoot, marketplaceRoot, { recursive: true });
  assert.equal(existsSync(join(workspaceRoot, ".git")), false, "workspace must be a non-Git project");
  assert.equal(existsSync(join(base, "marketplace", ".git")), false, "marketplace copy must be Gitless");
  const runCli = (argv) => {
    if (argv[0] === "--version") return { status: "ok", version: "1.2.12" };
    if (argv[1] === "install") {
      cpSync(marketplaceRoot, installedPluginRoot, { recursive: true });
      writeFileSync(join(configRoot, "config", "import_manifest.json"), '{"imports":[{"name":"agent-pipeline-core"}]}\n');
    }
    return { status: "ok" };
  };
  return { base, configRoot, workspaceRoot, sourcePluginRoot, marketplaceRoot, installedPluginRoot, runCli };
}

const refreshOptions = (f, scope = "global") => ({
  configRoot: f.configRoot, workspaceRoot: f.workspaceRoot, approvedSourceRoot: f.marketplaceRoot,
  attestationSourceRoot: f.sourcePluginRoot, scope, globalChangeApproved: scope === "global",
});

// ---- Acceptance 1: source gate before a managed copy can be bound -------------------------------------

function assertSourceGate(verify, f) {
  const input = { configRoot: f.configRoot, workspaceRoot: f.workspaceRoot, sourcePluginRoot: f.marketplaceRoot, attestationSourceRoot: f.sourcePluginRoot, scope: "global" };
  assert.equal(verify(input).status, "attestable-source", "clean Git source + exact copy is attestable");
  writeFileSync(join(f.marketplaceRoot, "hooks", "antigravity-pretool-guard.mjs"), "// changed after approval\n");
  const changed = verify(input);
  assert.equal(changed.status, "rejected", "a copy changed after approval must not inherit the Git source identity");
  assert.equal(changed.reason, "ATR-SOURCE-ATTESTATION-UNAVAILABLE");
}

test("AC1: a gitless copy is attestable only when it matches the clean Git source byte for byte", (t) => {
  assertSourceGate(verifyAntigravityInstallerSource, build(t, "gate"));
});

test("AC1 RED proof: a verifier that always accepts fails the same pin (scratch mirror)", (t) => {
  const alwaysAccept = () => ({ status: "attestable-source" });
  assert.throws(() => assertSourceGate(alwaysAccept, build(t, "gate-red")), /changed after approval/u);
});

test("AC1: refusal happens before the CLI runs and before any receipt is written", (t) => {
  const f = build(t, "refuse");
  writeFileSync(join(f.marketplaceRoot, "hooks", "antigravity-pretool-guard.mjs"), "// drifted\n");
  const result = refreshAntigravityInstallation(refreshOptions(f), {
    runCli: () => { throw new Error("unattestable source must refuse before invoking the CLI"); },
    writeInstalledReceipt: () => { throw new Error("unattestable source must never write a receipt"); },
  });
  assert.equal(result.status, "refused");
  assert.equal(result.reason, "ATR-SOURCE-ATTESTATION-UNAVAILABLE");
  assert.deepEqual(result.completed, []);
  assert.equal(existsSync(f.installedPluginRoot), false, "no managed copy was installed");
});

// ---- Acceptance 2: exact readback; stale copy requires explicit topology update ------------------------

test("AC1/AC2: the receipt is requested only after install readback, bound to the Git source and the managed copy", (t) => {
  const f = build(t, "order");
  const calls = [];
  const result = refreshAntigravityInstallation(refreshOptions(f), {
    runCli: f.runCli,
    writeInstalledReceipt: (input) => {
      calls.push({ ...input, copyExistedAtWrite: existsSync(join(input.installedPluginRoot, "plugin.json")) });
      return { status: "written" };
    },
  });
  assert.equal(result.status, "refreshed", JSON.stringify(result));
  assert.ok(result.completed.includes("install"));
  assert.equal(calls.length, 1, "exactly one receipt per refresh");
  assert.equal(calls[0].provider, "antigravity");
  assert.equal(calls[0].sourcePluginRoot, f.sourcePluginRoot, "receipt names the Git source, not the Gitless copy");
  assert.notEqual(calls[0].installedPluginRoot, calls[0].sourcePluginRoot);
  assert.equal(calls[0].copyExistedAtWrite, true, "the exact copy was read back before attestation");
  assert.equal(existsSync(join(f.workspaceRoot, ".git")), false, "installation does not turn the project into a Git repo");
});

test("AC1: a receipt-write failure is a typed partial result demanding a fresh session, never success", (t) => {
  const f = build(t, "receipt-fail");
  const result = refreshAntigravityInstallation(refreshOptions(f), { runCli: f.runCli, writeInstalledReceipt: () => ({ status: "rejected" }) });
  assert.equal(result.status, "partial");
  assert.equal(result.reason, "ATR-ATTESTATION-FAILED");
  assert.equal(result.requiresFreshExecutingSession, true);
});

test("AC2: a stale managed copy is not refreshed by a workspace-scope run without explicit global approval", (t) => {
  const f = build(t, "stale");
  const first = refreshAntigravityInstallation(refreshOptions(f), { runCli: f.runCli, writeInstalledReceipt: () => ({ status: "written" }) });
  assert.equal(first.status, "refreshed", JSON.stringify(first));
  // The approved source moves on; the installed managed copy is now stale.
  writeFileSync(join(f.sourcePluginRoot, "scripts", "pipeline-start-preflight.mjs"), "// newer source\n");
  writeFileSync(join(f.marketplaceRoot, "scripts", "pipeline-start-preflight.mjs"), "// newer source\n");
  const execGit = (...a) => execFileSync("git", ["-C", join(f.sourcePluginRoot, "..", ".."), ...a], { stdio: "ignore" });
  execGit("add", ".");
  execGit("-c", "user.name=Fixture", "-c", "user.email=fixture@example.test", "commit", "-m", "newer");
  let cliCalls = 0;
  const refused = refreshAntigravityInstallation({ ...refreshOptions(f, "workspace"), globalChangeApproved: false }, {
    runCli: (argv) => { if (argv[0] !== "--version") cliCalls += 1; return f.runCli(argv); },
    writeInstalledReceipt: () => { throw new Error("no receipt without an explicit topology update"); },
  });
  assert.equal(refused.status, "refused", JSON.stringify(refused));
  assert.equal(refused.reason, "ATR-GLOBAL-SCOPE");
  assert.equal(cliCalls, 0, "no lifecycle change without explicit approval");
});

// ---- Acceptance 3: first new session; already-affected copy gets one exact recovery action -----------

function preflightFor(f) {
  const controller = createGovernanceScopeController({ hostStateRoot: join(f.base, "scope-state") });
  const plan = controller.planDecision({ rootDir: f.workspaceRoot, decision: "enroll", by: "Fixture Owner" });
  controller.applyDecision(plan, { activate: true, planSha256: plan.planSha256 });
  return observePipelineStartPreflight({
    env: { ANTIGRAVITY_AGENT: "1" }, cwd: f.workspaceRoot,
    scriptUrl: pathToFileURL(join(f.installedPluginRoot, "scripts", "pipeline-start-preflight.mjs")).href,
    antigravityConfigRoot: f.configRoot,
    observeGovernanceScopeFn: () => controller.observe({ rootDir: f.workspaceRoot }),
    pluginList: () => JSON.stringify({ installed: [] }),
    observeAntigravityHardEnforcementFn: () => ({ observed: true }),
    observePrePushHookInstallationFn: () => ({ state: "repository-unresolved" }),
    observeUnseenPushToRemoteFn: () => ({ state: "not-checked" }),
    requireProjectOnboardingReadyFn: () => ({ status: "ready" }),
    observeArchitectureAdoptionOrientationFn: () => ({ status: "not-required" }),
    inspectEffectiveArchitectureDecisionsFn: () => ({ status: "advisory", projectionSha256: "a".repeat(64), decisions: [], activeExceptions: [], findings: [] }),
  });
}

test("AC3: real installer receipt lets the first preflight in an empty non-Git project pass attestation", HOST_LIMITATION, (t) => {
  const f = build(t, "first-start");
  // The real receipt writer and verifier resolve their directory from the operator home; point HOME at the
  // fixture home so no receipt or locator can reach the real ~/.gemini (same seam as the global-refresh pin).
  const realHome = homedir();
  const originalHome = process.env.HOME;
  process.env.HOME = join(f.base, "home");
  t.after(() => { if (originalHome === undefined) delete process.env.HOME; else process.env.HOME = originalHome; });
  const result = refreshAntigravityInstallation(refreshOptions(f), { runCli: f.runCli });
  assert.equal(result.status, "refreshed", JSON.stringify(result));
  const receipts = readdirSync(join(f.configRoot, "agent-pipeline", "installed-plugin-attestations"));
  assert.ok(receipts.some((n) => n.endsWith(".source.json")));
  assert.ok(receipts.some((n) => n.endsWith(".json") && !n.endsWith(".source.json")));
  const preflight = preflightFor(f);
  assert.equal(preflight.antigravityTopology.loadedKind, "managed-copy");
  assert.equal(preflight.installedPluginAttestation.status, "verified", JSON.stringify(preflight.installedPluginAttestation));
  assert.notEqual(preflight.status, "plugin-attestation-required");
  // AC4: no source or operator identifiers enter the evidence the run emits.
  const emitted = JSON.stringify({ result, attestation: preflight.installedPluginAttestation });
  assert.equal(emitted.includes(f.sourcePluginRoot), false, "source path must not appear in emitted evidence");
  assert.equal(emitted.includes(realHome), false, "operator home must not appear in emitted evidence");
});

/** Reproduce the reported state: a managed copy is installed, but no receipt was ever written. */
function affected(t, label, registeredSource) {
  const f = build(t, label);
  const root = registeredSource === "git" ? f.sourcePluginRoot : f.marketplaceRoot;
  const runCli = (argv) => {
    if (argv[1] === "install") {
      cpSync(root, f.installedPluginRoot, { recursive: true });
      writeFileSync(join(f.configRoot, "config", "import_manifest.json"), '{"imports":[{"name":"agent-pipeline-core"}]}\n');
      return { status: "ok" };
    }
    return f.runCli(argv);
  };
  const result = refreshAntigravityInstallation({ ...refreshOptions(f), approvedSourceRoot: root, attestationSourceRoot: root }, { runCli, writeInstalledReceipt: () => ({ status: "written" }) });
  assert.equal(result.status, "refreshed", JSON.stringify(result));
  assert.equal(existsSync(join(f.configRoot, "agent-pipeline", "installed-plugin-attestations")), false, "no receipt was written");
  return f;
}

test("AC3: an already-affected managed copy of the Git source is refused by preflight with one exact host recovery action", (t) => {
  const f = affected(t, "affected-git", "git");
  const preflight = preflightFor(f);
  assert.equal(preflight.status, "plugin-attestation-required", JSON.stringify(preflight.installedPluginAttestation));
  const action = preflight.nextAction;
  assert.ok(action && typeof action === "object" && !Array.isArray(action), "exactly one typed recovery action is named");
  assert.equal(action.kind, "host-postinstall");
  assert.equal(action.mutation, true);
  assert.equal(action.executionBoundary, "host");
  assert.equal(action.expected.status, "written");
  assert.ok(action.argv.includes(f.sourcePluginRoot) && action.argv.includes(f.installedPluginRoot), "the action binds the exact source and copy");
});

// The reported scenario registers a GITLESS marketplace copy as the plugin source. Recovery must come from a
// verified Git source checkout (local-plugin-attestation.md), never from the copy itself or a guessed path, so
// the preflight emits NO executable action but a typed manual-recovery result naming the documented route.
test("AC3: an already-affected GITLESS marketplace copy is refused by preflight with a typed manual recovery and no executable action", (t) => {
  const f = affected(t, "affected-gitless", "gitless");
  const preflight = preflightFor(f);
  assert.equal(preflight.status, "plugin-attestation-required");
  assert.equal(preflight.nextAction ?? null, null, "no executable action is invented for a gitless source");
  const attestation = preflight.installedPluginAttestation;
  assert.equal(attestation.setupAction, undefined, "no host setup action without a verified Git source");
  const manual = attestation.manualRecovery;
  assert.ok(manual && typeof manual === "object", "a typed manual recovery is named");
  assert.equal(manual.schema, "pipeline.installed-plugin-attestation-manual-recovery.v1");
  assert.equal(manual.kind, "manual-source-checkout-recovery");
  assert.equal(manual.executableAction, false);
  assert.equal(manual.script, "install-agy.mjs");
  assert.equal(manual.runFrom, "clean-git-source-checkout");
  assert.equal(manual.restartRunner, true);
  const emitted = JSON.stringify(manual);
  assert.equal(emitted.includes(f.marketplaceRoot), false, "the gitless copy path is not offered as a source");
  assert.equal(emitted.includes(f.sourcePluginRoot), false, "no source path is guessed or emitted");
});

test("AC3: the Git-source affected copy carries an executable action and no manual recovery", (t) => {
  const f = affected(t, "affected-git-nomanual", "git");
  const attestation = preflightFor(f).installedPluginAttestation;
  assert.ok(attestation.setupAction, "executable action present");
  assert.equal(attestation.manualRecovery, undefined);
});

test("AC3 RED proof: a preflight that skips the receipt requirement fails the affected-copy pin (scratch mirror)", (t) => {
  const f = affected(t, "affected-red", "git");
  const mutant = (g) => ({ ...preflightFor(g), status: "ready" });
  assert.throws(() => assert.equal(mutant(f).status, "plugin-attestation-required"), /plugin-attestation-required/u);
});

// ---- Acceptance 4: native fresh-runner observation is reported separately, not inferred ----------------

test("AC4: native fresh-runner observation is outside this fixture and is not inferred from it", { skip: "host-limitation: native Antigravity fresh-runner observation needs the installed candidate and a real agy session; reported separately as installed/native evidence; owner Coordinator; due 2026-10-19" }, () => {});
