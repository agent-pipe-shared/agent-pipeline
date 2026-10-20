// SPDX-License-Identifier: SUL-1.0
//
// Shared fixture builders for the two session-cleanup suites
// (`scripts/session-cleanup-binding.test.mjs`, `lib/session-cleanup-recovery.test.mjs`). Fixture code only: no
// stubs, no test cases.
//
// K1c (AC-203): `bindOnboardingSessionCleanup` refuses outside a Source-owned bound requester context, and binds
// only the requester's own {sessionId, descriptorSha256}. Production (session-power-controller.mjs `direct`) creates
// the session descriptor first, binds a requester to exactly that descriptor, and runs the work inside
// `withSourceOwnedAuthorityContext`. The `start` verb creates its descriptor and binds in one call (and `bind-orphan`
// binds a descriptor that already exists), so the fixtures rebuild the production order through the bridge's own
// fixture builder at the two points the CLI already exposes as dependencies: descriptor creation returns the
// descriptor the builder created and bound a requester to, and the REAL `bindOnboardingSessionCleanup` runs inside
// that requester's own context. Nothing is stubbed into a `bound` result; a plain process is still refused.

import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

import { bindContinuitySessionCleanup } from "./continuity-state.mjs";
import {
  applyOnboardingKickoff,
  bindOnboardingSessionCleanup,
  observeSessionCleanupState,
  planOnboardingKickoff,
  readOnboardingSessionCleanupBinding,
} from "./onboarding-continuity.mjs";
import {
  applyProjectAuthorityMigration,
  planProjectAuthorityMigration,
} from "./project-authority.mjs";
import { createControlledMethodRuntimeFixture } from "./session-requester-bridge.mjs";
import { prepareSessionAuthorityRegistryFixture } from "./test-item-approved-course-fixture.mjs";
import {
  inspectSignedDescriptorCustodyRepository,
  loadSessionDescriptor,
  startSessionDescriptor,
} from "./worktree-lifecycle.mjs";
import { main as sessionCleanupMain } from "../scripts/session-cleanup.mjs";

// A real `git init` project with the legacy layout (State in `.claude/pipeline-state.json`), activated through the
// onboarding kickoff builders.
export function createLegacyLayoutFixture({ prefix, name, goal }) {
  const root = mkdtempSync(join(tmpdir(), `${prefix}-${name}-`));
  mkdirSync(join(root, ".claude"), { recursive: true });
  const git = spawnSync("git", ["init", "-q"], { cwd: root, encoding: "utf8", shell: false });
  assert.equal(git.status, 0, git.stderr);
  writeFileSync(join(root, ".claude", "pipeline.json"), `${JSON.stringify({
    project: "fixture",
    verify: "node verify.mjs",
    autonomy: "bounded",
    branchModel: "local",
    worktree: "supported",
    stakes: "high",
    constraints: [],
  }, null, 2)}\n`);
  const plan = planOnboardingKickoff({ rootDir: root, goal });
  applyOnboardingKickoff({ plan, expectedPlanSha256: plan.planSha256, activate: true });
  return root;
}

export function gitRun(root, args) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8", shell: false });
  assert.equal(result.status, 0, result.stderr);
  return String(result.stdout).trim();
}

export function rewriteAsLegacyDescriptor(root, sessionId) {
  const loaded = loadSessionDescriptor(root, sessionId);
  const descriptor = JSON.parse(readFileSync(loaded.path, "utf8"));
  descriptor.schema = "pipeline.session-descriptor.v1";
  delete descriptor.ownerRuntime;
  writeFileSync(loaded.path, `${JSON.stringify(descriptor, null, 2)}\n`, { mode: 0o600 });
  return loadSessionDescriptor(root, sessionId);
}

const boundRequesterRuntimes = new Map();
const registryPreparedRoots = new Set();
// Roots a case pins to the legacy layout: their bound start is not migrated and stays refused.
export const legacyLayoutRoots = new Set();
let boundRequesterSequence = 0;
function boundRequesterKey(repository, sessionId) { return `${repository.primaryRoot}\n${sessionId}`; }

// The existing authority-migration builders.
export function migrateToNeutral(root) {
  writeFileSync(join(root, ".claude", "pipeline.yaml"), "schema: pipeline.manifest.v0\n");
  const plan = planProjectAuthorityMigration({ rootDir: root });
  assert.equal(plan.status, "ready");
  assert.equal(applyProjectAuthorityMigration(plan, { rootDir: root, activate: true }).status, "applied");
}

export function startDescriptorWithBoundRequester(repoPath, options = {}) {
  const repository = inspectSignedDescriptorCustodyRepository(repoPath);
  // A Source-owned bound bind is admitted only for a neutral project (`continuityJoinActualBoundCleanupOwner`
  // requires `observed.neutral`), so the first bound start migrates a legacy-layout fixture through the existing
  // builders, unless the case pins the legacy layout (that case then stays refused and is named as such).
  if (!legacyLayoutRoots.has(repository.primaryRoot) && !observeSessionCleanupState(repository.primaryRoot).neutral) {
    migrateToNeutral(repository.primaryRoot);
  }
  // A cleanup binding reserves its member in the session-authority registry: initialize the real, empty registry
  // (no stub) once per root, on the first bound start, so cases that never start stay fast.
  if (!registryPreparedRoots.has(repository.primaryRoot)) {
    prepareSessionAuthorityRegistryFixture({ root: repository.primaryRoot, excludeFromStatus: true });
    registryPreparedRoots.add(repository.primaryRoot);
  }
  const sessionId = options.sessionId ?? `session-${randomBytes(12).toString("hex")}`;
  boundRequesterSequence += 1;
  const runtime = createControlledMethodRuntimeFixture({
    repository,
    fixtureRoot: join(repository.commonDir, "agent-pipeline", "controlled-method-fixtures", `${sessionId}-${boundRequesterSequence}`),
    sessionId,
  });
  boundRequesterRuntimes.set(boundRequesterKey(repository, sessionId), runtime);
  const loaded = loadSessionDescriptor(repoPath, sessionId);
  return {
    repo: loaded.repo,
    path: loaded.path,
    sessionId: loaded.sessionId,
    ownerNonce: loaded.ownerNonce,
    descriptorSha256: loaded.descriptorSha256,
  };
}

// A binding the way the historic legacy writer left it (D70 (b)): bytes in the legacy State, as an artifact. A Source-owned
// bound bind admits only a neutral project (`continuityJoinActualBoundCleanupOwner` requires `observed.neutral`), so a
// legacy-layout root (State in `.claude/pipeline-state.json`) can no longer reach `bound` through `start`. The legacy
// writer is `bindOnboardingSessionCleanupInternal`'s non-neutral branch (`lib/onboarding-continuity.mjs`): the real
// `bindContinuitySessionCleanup` over the State's continuity (revision + 1, `runtime.sessionCleanup` = the exact
// {sessionId, descriptorSha256}), written as `JSON.stringify(state, null, 2)` plus a newline at 0o600. The reader
// (`observeSessionCleanupState` / `readOnboardingSessionCleanupBinding`) then returns `bound` for that tuple. A plain
// descriptor is started (a legacy root admits it); nothing is stubbed into a `bound` result, and the reader is asserted.
// Returns the shape of the `start` output the cases read: `{ code: 0, output: { sessionId, descriptorSha256 } }`.
// `ownerPid` is the plain descriptor's own owner option (a legacy-root descriptor admits `-1`, which reads as owner
// `unavailable`: the state a crashed host leaves).
export function writeHistoricLegacyBinding({ root, sessionId, ownerPid }) {
  const observed = observeSessionCleanupState(root);
  assert.equal(observed.neutral, false, "a historic legacy binding is written only into a legacy-layout State");
  assert.equal(observed.sessionCleanup, null, "the legacy State must be unbound before the historic binding is written");
  const descriptor = startSessionDescriptor(root, { sessionId, ...(ownerPid === undefined ? {} : { ownerPid }) });
  const sessionCleanup = { sessionId: descriptor.sessionId, descriptorSha256: descriptor.descriptorSha256 };
  const proposal = bindContinuitySessionCleanup(observed.state.continuity, {
    expectedRevision: observed.revision,
    sessionCleanup,
  }, observed.activeFeatureId);
  assert.equal(proposal.ok, true, `the historic legacy bind was rejected (${proposal.code})`);
  const next = structuredClone(observed.state);
  next.continuity = proposal.state;
  writeFileSync(observed.path, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 });
  const binding = readOnboardingSessionCleanupBinding({ rootDir: root });
  assert.equal(binding.status, "bound");
  assert.deepEqual(binding.sessionCleanup, sessionCleanup);
  return { code: 0, output: { ...sessionCleanup } };
}

export function bindInsideRequesterContext(request) {
  const repository = inspectSignedDescriptorCustodyRepository(request.rootDir);
  const runtime = boundRequesterRuntimes.get(boundRequesterKey(repository, request.sessionCleanup?.sessionId));
  // No requester bound to this descriptor: run the real function in the caller's plain context (it refuses).
  if (runtime === undefined) return bindOnboardingSessionCleanup(request);
  return runtime.run(() => bindOnboardingSessionCleanup(request));
}

export const BOUND_REQUESTER_DEPENDENCIES = Object.freeze({
  startSessionDescriptorFn: startDescriptorWithBoundRequester,
  bindOnboardingSessionCleanupFn: bindInsideRequesterContext,
});

// Runs the session-cleanup CLI. By default through the bound requester; `bound: false` is the pre-K1c shape: the CLI
// exactly as a plain terminal reaches it, with no requester context.
export function invokeCleanupCli(argv, env, dependencies = {}, { bound = true } = {}) {
  let output = "";
  const code = sessionCleanupMain(argv, env, {
    requireProjectOnboardingReadyFn() { return { status: "ready" }; },
    writeFn(value) { output += value; },
    ...(bound ? BOUND_REQUESTER_DEPENDENCIES : {}),
    ...dependencies,
  });
  return { code, output: output === "" ? null : JSON.parse(output) };
}


// A recovery apply in a process of its own, as the PO's terminal reaches it: no requester context inherited from this
// test process. The child prints one JSON line (the result, or { error }); the parent parses the last stdout line.
export function applyRecoveryInFreshProcess({ rootDir, expectedPlanSha256 }) {
  const moduleUrl = new URL("./session-cleanup-recovery.mjs", import.meta.url).href;
  const code = "import { applySessionCleanupRecovery } from " + JSON.stringify(moduleUrl) + ";\n"
    + "try {\n"
    + "  const result = applySessionCleanupRecovery({ rootDir: " + JSON.stringify(rootDir)
    + ", expectedPlanSha256: " + JSON.stringify(expectedPlanSha256) + ", activate: true });\n"
    + "  console.log(JSON.stringify(result));\n"
    + "} catch (error) {\n"
    + "  console.log(JSON.stringify({ error: { code: error?.code ?? null, message: String(error?.message ?? error), repair: error?.repair ?? null } }));\n"
    + "}\n";
  const run = spawnSync(process.execPath, ["--input-type=module", "-e", code], { encoding: "utf8", shell: false });
  const lines = String(run.stdout ?? "").trim().split("\n");
  let parsed = null;
  try { parsed = JSON.parse(lines[lines.length - 1]); } catch { parsed = null; }
  if (parsed === null || parsed.error !== undefined) {
    throw new Error("fresh-process recovery failed: " + JSON.stringify(parsed?.error ?? { status: run.status, stderr: String(run.stderr ?? "").slice(-600) }));
  }
  return parsed;
}

// Runs a module snippet in a node process of its own; the snippet prints one JSON line (the result, or { error }).
function runJsonChild(source, label) {
  const run = spawnSync(process.execPath, ["--input-type=module", "-e", source], { encoding: "utf8", shell: false });
  const lines = String(run.stdout ?? "").trim().split("\n");
  let parsed = null;
  try { parsed = JSON.parse(lines[lines.length - 1]); } catch { parsed = null; }
  if (parsed === null || parsed.error !== undefined) {
    throw new Error(label + " failed: " + JSON.stringify(parsed?.error ?? { status: run.status, stderr: String(run.stderr ?? "").slice(-600) }));
  }
  return parsed;
}

const CHILD_CATCH = "} catch (error) {\n"
  + "  console.log(JSON.stringify({ error: { code: error?.code ?? null, message: String(error?.message ?? error), repair: error?.repair ?? null } }));\n"
  + "}\n";

// A session-cleanup verb in a process of its own, as the PO's terminal reaches it: plain context, no requester, no
// readiness consult. Returns { code, output } like `invokeCleanupCli`.
export function sessionCleanupInFreshProcess(argv) {
  const mainUrl = new URL("../scripts/session-cleanup.mjs", import.meta.url).href;
  return runJsonChild("import { main } from " + JSON.stringify(mainUrl) + ";\n"
    + "try {\n"
    + "  let out = \"\";\n"
    + "  const code = main(" + JSON.stringify(argv) + ", {}, {\n"
    + "    requireProjectOnboardingReadyFn() { throw new Error(\"this verb must not consult onboarding readiness\"); },\n"
    + "    writeFn(value) { out += value; },\n"
    + "  });\n"
    + "  console.log(JSON.stringify({ code, output: out === \"\" ? null : JSON.parse(out) }));\n"
    + CHILD_CATCH, "session-cleanup in a fresh process");
}
