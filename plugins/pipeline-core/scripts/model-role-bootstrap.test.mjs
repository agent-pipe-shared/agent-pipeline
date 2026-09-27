// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, openSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { registeredFunctionalTaskRoutes } from "../lib/model-role-route-source.mjs";
import { modelRoleBootstrapCliResult, modelRoleBootstrapExitCode,
  observeAgyModelRoleHookSession, runModelRoleBootstrap } from "./model-role-bootstrap.mjs";
import { registerTestCaseCompletion } from "../lib/test-case-completion.mjs";

const cases = [];
function test(name, run) { cases.push({ id: `MRB${String(cases.length + 1).padStart(2, "0")}`, name, run }); }
const routeSource = registeredFunctionalTaskRoutes();
const selected = (route) => `model-${route.runner}-${route.role}-${route.effort}`;
const approvedPolicies = routeSource.configuredRoutes.map((route) => ({
  runner: route.runner, role: route.role, effort: route.effort,
  policy: { schema: "pipeline.model-role-policy.v1", runner: route.runner,
    role: route.role, approved: [{ modelId: selected(route), rank: 1,
      efforts: [route.effort], compatibilityEvidenceSha256: "a".repeat(64) }] },
}));
const observations = routeSource.configuredRoutes.map((route) => ({
  runner: route.runner, role: route.role, effort: route.effort,
  ok: true, assurance: route.runner === "claude"
    ? "host-observed-single-call-not-provider-attested" : "installed-host-observed",
  availableModelIds: [selected(route)],
}));
function fixture(overrides = {}) {
  const rows = new Map();
  let modelCalls = 0;
  const store = { inspect: (id) => ({ ok: true, status: rows.has(id) ? "present" : "absent" }),
    read: (id) => ({ ok: rows.has(id), ...rows.get(id) }),
    latest: (exclude) => {
      const entry = [...rows.entries()].filter(([id]) => id !== exclude).at(-1);
      return { ok: true, sessionId: entry?.[0] ?? null, receipts: entry?.[1].receipts ?? [] };
    },
    persist: (value) => { rows.set(value.sessionId, value); return { ok: true }; } };
  const input = { rootDir: "/repo", runner: "codex",
    env: { CODEX_SESSION_ID: "session-1", CODEX_THREAD_ID: "session-1" },
    routeSource, readGitState: () => ({ candidateCommit: "b".repeat(40), commonDir: "/repo/.git" }),
    readApprovedPolicy: () => ({ ok: true, approvedPolicies }),
    collectObservations: async ({ routeSource: scoped }) => { modelCalls += 1;
      return { ok: true, observations: observations.filter((entry) =>
        scoped.configuredRoutes.some((route) => route.runner === entry.runner
          && route.role === entry.role && route.effort === entry.effort)) }; },
    makeStore: () => store, now: () => "2026-09-26T12:00:00.000Z", ...overrides };
  return { input, rows, get modelCalls() { return modelCalls; } };
}

test("new host session presents the exact mapping before publishing", async () => {
  const f = fixture();
  const pending = await runModelRoleBootstrap(f.input);
  assert.equal(pending.code, "MODEL-ROLE-BOOTSTRAP-HUMAN-CONFIRMATION-REQUIRED");
  assert.equal(f.rows.size, 0);
  assert.equal(pending.readback.mappings.length,
    routeSource.configuredRoutes.filter((route) => route.runner === "codex").length);
  const ready = await runModelRoleBootstrap({ ...f.input, confirm: async (readback) => {
    assert.equal(readback.readbackSha256, pending.readback.readbackSha256);
    return true;
  } });
  assert.equal(ready.ok, true);
  assert.equal(f.rows.size, 1);
  const reused = await runModelRoleBootstrap(f.input);
  assert.equal(reused.code, "MODEL-ROLE-BOOTSTRAP-REUSED");
  assert.equal(f.modelCalls, 2, "the reused session performs no third catalogue observation");
});

test("a later unchanged mapping is admitted without a second human confirmation", async () => {
  const f = fixture();
  assert.equal((await runModelRoleBootstrap({ ...f.input, confirm: async () => true })).ok, true);
  const next = await runModelRoleBootstrap({ ...f.input,
    env: { CODEX_THREAD_ID: "session-2" }, now: () => "2026-09-26T12:01:00.000Z" });
  assert.equal(next.ok, true);
  assert.equal(next.readback.acknowledgementRequired, false);
});

test("missing policy offers read-only exact-model discovery, while an invalid session ID fails before probes", async () => {
  const f = fixture({ readApprovedPolicy: () => ({ ok: false, code: "unsigned" }) });
  const missingPolicy = await runModelRoleBootstrap(f.input);
  assert.equal(missingPolicy.code, "MODEL-ROLE-BOOTSTRAP-POLICY-REQUIRED");
  const fallback = modelRoleBootstrapCliResult(missingPolicy);
  assert.equal(fallback.fallback, "legacy-v3");
  assert.equal(fallback.lifecycleImpact, "none");
  assert.equal(modelRoleBootstrapExitCode(fallback), 0);
  const invalidSource = modelRoleBootstrapCliResult({ ok: false,
    code: "MODEL-ROLE-BOOTSTRAP-SOURCE" });
  assert.equal(invalidSource.fallback, "legacy-v3");
  assert.equal(invalidSource.lifecycleImpact, "none");
  assert.equal(modelRoleBootstrapExitCode(invalidSource), 0);
  assert.equal(missingPolicy.baseline.length,
    routeSource.configuredRoutes.filter((route) => route.runner === "codex").length);
  assert.ok(missingPolicy.baseline.some((entry) => entry.disposition
    === "v3-assignment-approved-compatibility-required"));
  assert.equal(missingPolicy.baseline.some((entry) => entry.runner !== "codex"), false);
  assert.equal(f.modelCalls, 1);
  assert.ok(missingPolicy.observedModelIds.length > 0);
  assert.equal(f.rows.size, 0);
  assert.equal((await runModelRoleBootstrap({ ...f.input, env: {
    CODEX_SESSION_ID: "one", CODEX_THREAD_ID: "two" } })).code,
  "MODEL-ROLE-SESSION-IDENTITY-CONFLICT");
  assert.equal(f.modelCalls, 1);
});

test("an unsafe existing receipt and rejected human confirmation cannot launch or publish", async () => {
  const f = fixture({ confirm: async () => false });
  assert.equal((await runModelRoleBootstrap(f.input)).code, "MODEL-ROLE-BOOTSTRAP-NOT-CONFIRMED");
  assert.equal(f.rows.size, 0);
  f.rows.set("session-1", { ok: false });
  assert.equal((await runModelRoleBootstrap(f.input)).code, "MODEL-ROLE-BOOTSTRAP-STORE-UNAVAILABLE");
});

test("one installed runner needs no catalogue or account access for the other two", async () => {
  const f = fixture({ collectObservations: async ({ routeSource: scoped }) => {
    assert.ok(scoped.configuredRoutes.length > 0);
    assert.ok(scoped.configuredRoutes.every((route) => route.runner === "codex"));
    return { ok: true, observations: observations.filter((entry) => entry.runner === "codex") };
  } });
  const pending = await runModelRoleBootstrap(f.input);
  assert.equal(pending.code, "MODEL-ROLE-BOOTSTRAP-HUMAN-CONFIRMATION-REQUIRED");
  assert.ok(pending.readback.mappings.every((entry) => entry.runner === "codex"));
});

test("Claude-only bootstrap admits its exact approved routes without the other runners", async () => {
  const f = fixture({ runner: "claude", env: { CLAUDE_CODE_SESSION_ID: "claude-session-1" },
    collectObservations: async ({ routeSource: scoped }) => {
      assert.ok(scoped.configuredRoutes.length > 0);
      assert.ok(scoped.configuredRoutes.every((route) => route.runner === "claude"));
      return { ok: true, observations: observations.filter((entry) => entry.runner === "claude") };
    } });
  const ready = await runModelRoleBootstrap({ ...f.input, confirm: async () => true });
  assert.equal(ready.ok, true);
  assert.ok(ready.readback.mappings.every((entry) => entry.runner === "claude"));
  assert.ok(f.rows.get("claude-session-1").receipts.every((entry) => entry.runner === "claude"));
});

test("PO-approved exact V3 selectors need host compatibility but no duplicate policy signature", async () => {
  const f = fixture({ readApprovedPolicy: () => ({ ok: false, code: "absent" }),
    collectObservations: async ({ routeSource: scoped }) => ({ ok: true,
      observations: scoped.configuredRoutes.map((route) => ({ runner: route.runner,
        role: route.role, effort: route.effort, ok: true,
        assurance: "installed-host-observed", availableModelIds: [route.selector.value] })) }) });
  const pending = await runModelRoleBootstrap(f.input);
  assert.equal(pending.code, "MODEL-ROLE-BOOTSTRAP-HUMAN-CONFIRMATION-REQUIRED");
  assert.equal(f.rows.size, 0);
  const ready = await runModelRoleBootstrap({ ...f.input, confirm: async () => true });
  assert.equal(ready.ok, true);
  assert.equal(f.rows.get("session-1").authority.mode, "v3-baseline");
  assert.equal(f.rows.get("session-1").receipts.every((receipt) =>
    routeSource.configuredRoutes.some((route) => route.runner === "codex"
      && route.role === receipt.role && route.effort === receipt.effort
      && route.selector.value === receipt.modelId)), true);
});

test("Claude alias discovery cannot bypass approval of its exact resolved ID", async () => {
  const f = fixture({ runner: "claude", env: { CLAUDE_CODE_SESSION_ID: "claude-session-1" },
    readApprovedPolicy: () => ({ ok: false, code: "absent" }),
    collectObservations: async ({ routeSource: scoped }) => ({ ok: true,
      observations: scoped.configuredRoutes.map((route) => ({
        runner: route.runner, role: route.role, effort: route.effort, ok: true,
        assurance: "host-observed-single-call-not-provider-attested",
        availableModelIds: [`exact-${route.selector.value}`],
      })) }) });
  const result = await runModelRoleBootstrap(f.input);
  assert.equal(result.code, "MODEL-ROLE-BOOTSTRAP-POLICY-REQUIRED");
  assert.equal(result.baselineCode, "MODEL-ROLE-V3-BASELINE-ALIAS-NEEDS-EXACT-APPROVAL");
  assert.equal(f.rows.size, 0);
});

test("Antigravity-only bootstrap uses its host hook identity and never needs another runner", async () => {
  const f = fixture({ runner: "antigravity", env: {}, hostHookSessionId: "agy-session-1",
    collectObservations: async ({ routeSource: scoped }) => {
      assert.ok(scoped.configuredRoutes.length > 0);
      assert.ok(scoped.configuredRoutes.every((route) => route.runner === "antigravity"));
      return { ok: true, observations: observations.filter((entry) => entry.runner === "antigravity") };
    } });
  const pending = await runModelRoleBootstrap(f.input);
  assert.equal(pending.code, "MODEL-ROLE-BOOTSTRAP-HUMAN-CONFIRMATION-REQUIRED");
  assert.ok(pending.readback.mappings.every((entry) => entry.runner === "antigravity"));
  const ready = await runModelRoleBootstrap({ ...f.input, confirm: async () => true });
  assert.equal(ready.ok, true);
  assert.ok(f.rows.has("agy-session-1"));
});

test("Antigravity CLI accepts only the exact fresh hook-session lock of this plugin version", () => {
  const rootDir = mkdtempSync(join(tmpdir(), "model-role-agy-hook-"));
  const pluginRoot = join(rootDir, "plugin");
  const sessionDir = join(rootDir, ".git", "agent-pipeline", "run", "session-agy-1");
  try {
    mkdirSync(pluginRoot);
    mkdirSync(sessionDir, { recursive: true });
    writeFileSync(join(pluginRoot, "plugin.json"), JSON.stringify({ version: "0.7.0-test" }));
    const lock = join(sessionDir, "requires-bootstrap.lock");
    writeFileSync(lock, JSON.stringify({ locked: true, version: "0.7.0-test" }));
    // Use the observed file timestamp, not a racing wall-clock sample. Some
    // filesystems round mtime forward and make an immediately fresh lock look
    // spuriously "from the future" to this exact-window test.
    const nowEpochMs = statSync(lock).mtimeMs + 1;
    const input = { rootDir, pluginRoot, sessionId: "agy-1", nowEpochMs };
    assert.equal(observeAgyModelRoleHookSession(input).ok, true);
    assert.equal(observeAgyModelRoleHookSession({ ...input, sessionId: "other" }).ok, false);
    assert.equal(observeAgyModelRoleHookSession({ ...input, sessionId: "../escape" }).ok, false);
    assert.equal(observeAgyModelRoleHookSession({ ...input,
      nowEpochMs: nowEpochMs + 31 * 60 * 1000 }).ok, false);
    writeFileSync(lock, JSON.stringify({ locked: true, version: "old-build" }));
    const staleHook = observeAgyModelRoleHookSession(input);
    assert.equal(staleHook.ok, false);
    const diagnostic = modelRoleBootstrapCliResult(staleHook);
    assert.equal(diagnostic.fallback, "legacy-v3");
    assert.equal(modelRoleBootstrapExitCode(diagnostic), 0);
    rmSync(lock);
    symlinkSync(join(pluginRoot, "plugin.json"), lock);
    assert.equal(observeAgyModelRoleHookSession(input).ok, false);
  } finally { rmSync(rootDir, { recursive: true, force: true }); }
});

assert.equal(cases.length, 10);
const completionFd = process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD === undefined
  ? openSync(process.platform === "win32" ? "NUL" : "/dev/null", "w")
  : Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD);
registerTestCaseCompletion({ cases: cases, fd: completionFd,
  maxBytes: Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_MAX_BYTES ?? "65536") });
