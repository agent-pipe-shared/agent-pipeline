// SPDX-License-Identifier: SUL-1.0
// Candidate 19c, w168 (AC-108, the Windows native runs E2, E4, Q10, W1, W2, W7): Windows authority refusals name the path,
// the cause and the repair; the preflight probes whether close and push can work on the platform and reports the bootstrap
// facts itself. Every platform-dependent decision takes an injected platform or probe, so this runs on any machine.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import * as readiness from "../lib/windows-authority-readiness.mjs";
import * as bridge from "../lib/session-requester-bridge.mjs";
import * as registry from "../lib/session-authority-registry.mjs";
import * as preflight from "./pipeline-start-preflight.mjs";
import * as refresh from "./refresh-mandatory-hooks.mjs";
import * as producer from "./verify-evidence-producer.mjs";

const here = (relative) => fileURLToPath(new URL(relative, import.meta.url));
const SCHEMA = "pipeline.windows-authority-readiness.v1";
const roots = { projectRoot: "C:\\proj", pluginRoot: "C:\\plug", privateRoot: "C:\\proj\\.git\\agent-pipeline" };
const unavailableAt = (path, reason = "WIN-AUTH-OPEN") => () => ({ schema: SCHEMA, status: "unavailable", causes: [{ pathClass: "project", reason, path }] });

// --- Q10: WIN-AUTH-OPEN names the exact path and offers a preview of the repair ------------------------------------------------

test("Q10: a WIN-AUTH-OPEN refusal names the exact folder, a preview that changes nothing, and the apply command", () => {
  assert.equal(typeof readiness.describeWindowsAuthorityRefusal, "function");
  const text = readiness.describeWindowsAuthorityRefusal({ reason: "WIN-AUTH-OPEN", platform: "win32", ...roots, assess: unavailableAt("C:\\proj\\evidence") });
  assert.match(text, /C:\\proj\\evidence/u);
  assert.match(text, /icacls "C:\\proj\\evidence"(?! \/)/u, "the preview is icacls with the path only: it lists the access list and changes nothing");
  assert.match(text, /icacls "C:\\proj\\evidence" \/grant /u, "the apply command is named separately");
  assert.match(text, /preview/iu);
  assert.match(text, /only one Goldfish launch at a time|one at a time/iu, "the concurrent-launch rule is stated where the second launch was refused");
});

test("Q10: off Windows, for a non-authority reason, or when the probe throws, no text is invented", () => {
  const args = { reason: "WIN-AUTH-OPEN", ...roots, assess: unavailableAt("C:\\proj\\evidence") };
  assert.equal(readiness.describeWindowsAuthorityRefusal({ ...args, platform: "linux" }), "");
  assert.equal(readiness.describeWindowsAuthorityRefusal({ ...args, platform: "win32", reason: "SDC-LOCK-HELD" }), "");
  const thrown = readiness.describeWindowsAuthorityRefusal({ ...args, platform: "win32", assess: () => { throw new Error("probe"); } });
  assert.match(thrown, /windowsAuthorityReadiness/u, "an unlocated path points at the preflight field that carries it");
  assert.doesNotMatch(thrown, /icacls/u);
});

test("Q10: the readiness cause for WIN-AUTH-OPEN carries the same preview and apply commands", () => {
  const result = readiness.assessWindowsAuthorityReadiness({ ...roots, exists: () => false, assessPrivateRoot: () => ({ status: "secure" }), probe: () => { throw new Error("unused"); } });
  const open = result.causes.find((cause) => cause.reason === "WIN-AUTH-OPEN");
  assert.ok(open, "an absent ancestor yields WIN-AUTH-OPEN");
  const commands = open.nextAction.repairPreview?.commands ?? [];
  assert.ok(commands.some((entry) => entry.command === `icacls "${open.path}"`), "preview command present");
  assert.ok(commands.some((entry) => /\/grant /u.test(entry.command)), "apply command present");
});

test("Q10: the dispatch guard and the Verify producer call the shared description", () => {
  assert.ok(/describeWindowsAuthorityRefusal/u.test(readFileSync(here("../hooks/guard-dispatch.mjs"), "utf8")), "guard-dispatch calls the shared description");
  assert.equal(typeof producer.formatVerifyEvidenceFailure, "function");
  const line = producer.formatVerifyEvidenceFailure(Object.assign(new Error("WIN-AUTH-OPEN"), { reason: "WIN-AUTH-OPEN" }), { platform: "win32", describe: () => "Path: C:\\proj\\evidence." });
  assert.equal(line, "verify-evidence-producer: VEP-ERROR: WIN-AUTH-OPEN Path: C:\\proj\\evidence.\n");
  // The description owns the platform gate (see the Q10 off-Windows case); an empty description leaves the old line byte for byte.
  assert.equal(producer.formatVerifyEvidenceFailure(new Error("boom"), { platform: "linux", describe: () => "" }), "verify-evidence-producer: VEP-ERROR: boom\n");
  assert.equal(producer.formatVerifyEvidenceFailure(new Error("boom"), { describe: () => { throw new Error("x"); } }), "verify-evidence-producer: VEP-ERROR: boom\n");
});

// --- E2: lock owner classification and the repair text ---------------------------------------------------------------------------

const nativeRecord = { platform: "win32", pid: 4242, start: "win32-1", cwd: null };
test("E2: a Windows owner route process is dead when it vanished or was replaced, live only on a matching identity", () => {
  assert.equal(typeof bridge.ownerRouteProcessStatus, "function");
  const same = (a, b) => a.start === b.start;
  const status = (observed) => bridge.ownerRouteProcessStatus(nativeRecord, { platform: "win32", observeWindows: () => observed, same });
  assert.equal(status({ status: "absent" }), "dead");
  assert.equal(status({ status: "present", process: { ...nativeRecord } }), "live");
  assert.equal(status({ status: "present", process: { ...nativeRecord, start: "win32-2" } }), "dead");
  assert.equal(status({ status: "unavailable" }), "unknown");
  assert.equal(bridge.ownerRouteProcessStatus({ pid: 1 }, { platform: "win32", observeWindows: () => ({ status: "absent" }), same }), "unknown", "a record without a Windows identity proves nothing");
  assert.equal(bridge.ownerRouteProcessStatus(nativeRecord, { platform: "win32", observeWindows: () => { throw new Error("x"); }, same }), "unknown");
});

test("E2: the lock repair text names inspect, then heal, last resort move-aside", () => {
  assert.equal(typeof registry.registryLockRepairText, "function");
  for (const owner of ["live", "unknown", "dead"]) {
    const text = registry.registryLockRepairText({ owner, pid: 7, ageSeconds: 141, waitedMs: 0 }, "/repo");
    assert.match(text, /session-authority-repair\.mjs inspect --root \/repo/u);
    assert.match(text, /heal/u);
    assert.match(text, /move-aside/u);
    assert.ok(text.indexOf("inspect") < text.indexOf("heal") && text.indexOf("heal") < text.indexOf("move-aside"));
  }
});

// --- E2: the fail-fast capability probe -------------------------------------------------------------------------------------------

const okProbes = { nodePath: "/node", exists: () => true, lockProbe: () => ({ status: "absent" }), ownerRouteProbe: () => ({ status: "ready" }) };
test("E2: capability probe is ready when every check passes and carries one typed row per check", () => {
  assert.equal(typeof preflight.observeCloseAndPushCapability, "function");
  const cap = preflight.observeCloseAndPushCapability({ platform: "win32", windowsAuthorityReadiness: { schema: SCHEMA, status: "ready", causes: [] }, ...okProbes });
  assert.equal(cap.schema, "pipeline.close-push-capability.v1");
  assert.equal(cap.status, "ready");
  assert.deepEqual(cap.checks.map((row) => row.id), ["node", "acl", "lock", "ownerRoute"]);
  assert.ok(cap.checks.every((row) => row.status === "ready" && row.nextAction === null));
});

test("E2: capability probe names the repair per failing check", () => {
  const cap = preflight.observeCloseAndPushCapability({
    platform: "win32", ...okProbes, exists: () => false,
    windowsAuthorityReadiness: { schema: SCHEMA, status: "unavailable", causes: [{ reason: "WIN-AUTH-OPEN", path: "C:\\proj\\evidence" }] },
    lockProbe: () => ({ status: "held", owner: "dead", ageSeconds: 141 }),
    ownerRouteProbe: () => ({ status: "unavailable" }), rootDir: "/repo",
  });
  assert.equal(cap.status, "unavailable");
  const byId = Object.fromEntries(cap.checks.map((row) => [row.id, row]));
  assert.equal(byId.node.status, "unavailable");
  assert.match(byId.acl.nextAction, /C:\\proj\\evidence/u);
  // Live Codex run: the printed inspect without --root was refused by the closed catalogue.
  assert.match(byId.lock.nextAction, /session-authority-repair\.mjs inspect --root \/repo,/u);
  assert.match(byId.ownerRoute.nextAction, /\S/u);
});

test("E2: off Windows the ACL check is not applicable and a lock of unknown state degrades instead of blocking", () => {
  const cap = preflight.observeCloseAndPushCapability({ platform: "linux", ...okProbes, lockProbe: () => ({ status: "held", owner: "unknown", ageSeconds: 5 }) });
  assert.equal(cap.checks.find((row) => row.id === "acl").status, "not-applicable");
  assert.equal(cap.checks.find((row) => row.id === "lock").status, "degraded");
  assert.equal(cap.status, "degraded");
});

test("E2: a probe that throws is reported as unknown, never swallowed into ready", () => {
  const cap = preflight.observeCloseAndPushCapability({ platform: "linux", ...okProbes, lockProbe: () => { throw new Error("x"); } });
  assert.equal(cap.checks.find((row) => row.id === "lock").status, "degraded");
  assert.notEqual(cap.status, "ready");
});

test("E2 (C19m w251): the real lock probe on a real repository with no lock reports absent, so the lock row is ready, not degraded", () => {
  const root = mkdtempSync(join(tmpdir(), "w251-lock-"));
  try {
    const git = (...args) => spawnSync("git", ["-C", root, "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "-c", "commit.gpgsign=false", ...args], { encoding: "utf8" });
    assert.equal(git("init", "-q").status, 0);
    assert.equal(git("commit", "--allow-empty", "-q", "-m", "base").status, 0);
    let seen = null;
    const spied = preflight.defaultRegistryLockProbe({ cwd: root, inspect: (input) => { seen = input; return registry.inspectSessionAuthorityLock(input); } });
    assert.deepEqual(Object.keys(seen.repository).sort(), ["candidate", "commonDir", "primaryRoot"], "the registry receives exactly the custody repository shape");
    assert.deepEqual(spied, { status: "absent" });
    assert.deepEqual(preflight.defaultRegistryLockProbe({ cwd: root }), { status: "absent" });
    const cap = preflight.observeCloseAndPushCapability({ platform: "linux", ...okProbes, lockProbe: () => preflight.defaultRegistryLockProbe({ cwd: root }) });
    assert.equal(cap.checks.find((row) => row.id === "lock").status, "ready");
    assert.equal(preflight.defaultRegistryLockProbe({ cwd: join(root, "missing") }).status, "unknown", "an unreadable repository still degrades, never ready");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

// --- W2: the four digest-bound bootstrap facts -----------------------------------------------------------------------------------

function projectWith(files) {
  const root = mkdtempSync(join(tmpdir(), "w168-facts-"));
  for (const [name, content] of Object.entries(files)) { mkdirSync(join(root, name, ".."), { recursive: true }); writeFileSync(join(root, name), content); }
  return root;
}

test("W2: the facts carry runtime status, role and model readback, calibration with handover date, and Verify availability", () => {
  assert.equal(typeof preflight.observeBootstrapFacts, "function");
  const root = projectWith({ "project/pipeline.json": JSON.stringify({ project: "demo", verify: "node verify.mjs", handover: "docs/state.md" }), "docs/state.md": "# State\n\nLast updated: 2026-11-04\n" });
  try {
    const facts = preflight.observeBootstrapFacts({ rootDir: root, status: "ready", role: "goldfish", modelRoleBootstrap: { status: "ready", code: "MODEL-ROLE-BOOTSTRAP-READY" } });
    assert.equal(facts.schema, "pipeline.bootstrap-facts.v1");
    assert.deepEqual(facts.runtime, { status: "ready" });
    assert.deepEqual(facts.modelRole, { role: "goldfish", status: "ready", code: "MODEL-ROLE-BOOTSTRAP-READY" });
    assert.equal(facts.calibration.file, "project/pipeline.json");
    assert.equal(facts.calibration.project, "demo");
    assert.equal(facts.calibration.handover, "docs/state.md");
    assert.equal(facts.calibration.handoverDate, "2026-11-04");
    assert.match(facts.calibration.sha256, /^[a-f0-9]{64}$/u);
    assert.match(facts.calibration.handoverSha256, /^[a-f0-9]{64}$/u);
    assert.deepEqual(facts.verify, { available: true });
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("W2: an unreadable calibration is reported as nulls with Verify unavailable, never invented", () => {
  const root = projectWith({});
  try {
    const facts = preflight.observeBootstrapFacts({ rootDir: root, status: "ready" });
    assert.equal(facts.calibration.file, null);
    assert.equal(facts.calibration.handoverDate, null);
    assert.deepEqual(facts.verify, { available: false });
    assert.equal(facts.modelRole.role, "elephant");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("W2: a policy-required model-role bootstrap carries a nextAction", () => {
  assert.equal(typeof preflight.modelRoleBootstrapField, "function");
  const field = preflight.modelRoleBootstrapField({ status: "refused", code: "MODEL-ROLE-BOOTSTRAP-POLICY-REQUIRED" });
  assert.equal(field.status, "unavailable");
  assert.equal(field.code, "MODEL-ROLE-BOOTSTRAP-POLICY-REQUIRED");
  assert.match(field.nextAction, /\S{10}/u);
  assert.equal(Object.hasOwn(preflight.modelRoleBootstrapField({ status: "ready", code: "X" }), "nextAction"), false);
});

// --- W1: hook refresh output and status text -------------------------------------------------------------------------------------

test("W1: the refresh output names the plugin version it bound to", () => {
  const plan = () => ({ status: "ready" }); // never ready-to-upgrade, so nothing is applied
  const out = refresh.refreshMandatoryHooks(process.cwd(), { checkCloneProvisioning: () => ({ checks: [] }), plans: { "pre-commit-hook": plan, "commit-msg-hook": plan, "pre-push-hook": plan }, pluginVersion: () => "9.9.9" });
  assert.equal(out.pluginVersion, "9.9.9");
});

test("W1: a hook-refresh-required status prints a plain sentence with the runnable command; the machine status and exit code stay", () => {
  assert.equal(typeof preflight.hookRefreshNotice, "function");
  const result = { status: "hook-refresh-required", nextAction: { kind: "command", executable: "node", argv: ["/p/scripts/refresh-mandatory-hooks.mjs", "--root", "/r"] } };
  const text = preflight.hookRefreshNotice(result);
  assert.match(text, /hook-refresh-required/u);
  assert.match(text, /exit code 2 is intentional/u);
  assert.match(text, /refresh-mandatory-hooks\.mjs/u);
  assert.equal(preflight.hookRefreshNotice({ status: "ready" }), "");
  assert.equal(preflight.pipelineStartPreflightExitCode(result), 2, "the exit code is pinned by the enforcement tests");
});

// --- W7: one JSON document on stdout, nothing structured on stderr ---------------------------------------------------------------

test("W7: the process prints one JSON document on stdout and no housekeeping object on stderr; the receipts ride under named keys", () => {
  const cwd = mkdtempSync(join(tmpdir(), "w168-w7-"));
  try {
    const run = spawnSync(process.execPath, [here("./pipeline-start-preflight.mjs")], { cwd, env: { PATH: process.env.PATH ?? "", HOME: cwd }, encoding: "utf8", timeout: 120000 });
    const lines = run.stdout.split("\n").filter((line) => line !== "");
    assert.equal(lines.length, 1);
    const envelope = JSON.parse(lines[0]);
    if (envelope.statusScope === "pipeline-governance-activation") {
      assert.equal(Object.hasOwn(envelope, "bootstrapHousekeeping"), false, "an ungoverned project ran no housekeeping before, and still runs none");
    } else {
      assert.equal(envelope.bootstrapHousekeeping?.scratchLifecycle?.schema, "pipeline.bootstrap-scratch-lifecycle.v1");
      assert.equal(envelope.bootstrapHousekeeping?.worktreeSweep?.schema, "pipeline.bootstrap-worktree-sweep.v1");
    }
    assert.equal(envelope.closeAndPushCapability?.schema, "pipeline.close-push-capability.v1");
    assert.equal(envelope.bootstrapFacts?.schema, "pipeline.bootstrap-facts.v1");
    for (const line of run.stderr.split("\n")) assert.doesNotMatch(line, /^\{.*"schema":"pipeline\.bootstrap-/u, "stderr carries no JSON housekeeping object");
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});
