// SPDX-License-Identifier: SUL-1.0
// Regression pin: pipeline.model-role-confirmation-prompt-obscures-required-digest (AC-214).
// Exercises the real model-role-bootstrap module; only its documented injection seams
// (route source, store, observations) are supplied, never the behavior under test.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { registeredFunctionalTaskRoutes } from "../model-role-route-source.mjs";
import { confirmModelRoleMapping, modelRoleBootstrapExitCode, runModelRoleBootstrap,
  runModelRoleBootstrapTransport } from "../../scripts/model-role-bootstrap.mjs";

const scriptPath = fileURLToPath(new URL("../../scripts/model-role-bootstrap.mjs", import.meta.url));
const routeSource = registeredFunctionalTaskRoutes();
const selected = (route) => `model-${route.runner}-${route.role}-${route.effort}`;
const approvedPolicies = routeSource.configuredRoutes.map((route) => ({
  runner: route.runner, role: route.role, effort: route.effort,
  policy: { schema: "pipeline.model-role-policy.v1", runner: route.runner, role: route.role,
    approved: [{ modelId: selected(route), rank: 1, efforts: [route.effort],
      compatibilityEvidenceSha256: "a".repeat(64) }] },
}));
const observations = routeSource.configuredRoutes.map((route) => ({
  runner: route.runner, role: route.role, effort: route.effort, ok: true,
  assurance: route.runner === "claude" ? "host-observed-single-call-not-provider-attested" : "installed-host-observed",
  availableModelIds: [selected(route)],
}));
const codexCount = routeSource.configuredRoutes.filter((route) => route.runner === "codex").length;

function fixture(overrides = {}) {
  const rows = new Map();
  const store = { inspect: (id) => ({ ok: true, status: rows.has(id) ? "present" : "absent" }),
    read: (id) => ({ ok: rows.has(id), ...rows.get(id) }),
    latest: (exclude) => {
      const entry = [...rows.entries()].filter(([id]) => id !== exclude).at(-1);
      return { ok: true, sessionId: entry?.[0] ?? null, receipts: entry?.[1].receipts ?? [] };
    },
    persist: (value) => { rows.set(value.sessionId, value); return { ok: true }; } };
  const input = { rootDir: "/repo", runner: "codex",
    env: { CODEX_SESSION_ID: "session-1", CODEX_THREAD_ID: "session-1" },
    familyInvocationEntry: { observeActivation: () => ({ ok: true, status: "inactive" }) },
    routeSource, readGitState: () => ({ candidateCommit: "b".repeat(40), commonDir: "/repo/.git" }),
    readApprovedPolicy: () => ({ ok: true, approvedPolicies }),
    collectObservations: async ({ routeSource: scoped }) => ({ ok: true,
      observations: observations.filter((entry) => scoped.configuredRoutes.some((route) =>
        route.runner === entry.runner && route.role === entry.role && route.effort === entry.effort)) }),
    makeStore: () => store, now: () => "2026-09-26T12:00:00.000Z", ...overrides };
  return { input, rows };
}

test("AC1: prompt shows the exact expected 64-char digest next to the input, outside the JSON payload", async () => {
  const written = [], prompts = [];
  const readback = { readbackSha256: "c".repeat(64), mappings: [] };
  const ok = await confirmModelRoleMapping(readback, { write: (t) => written.push(t),
    question: async (p) => { prompts.push(p); return "c".repeat(64); } });
  assert.equal(ok, true);
  assert.equal(prompts.length, 1);
  assert.ok(prompts[0].includes(`Paste this exact 64-character mapping digest to confirm: ${"c".repeat(64)}`));
  assert.ok(prompts[0].endsWith("Digest: "));
});

test("AC1: 'Confirm' is rejected with an explanation naming the expected digest and next step", async () => {
  const written = [];
  const readback = { readbackSha256: "d".repeat(64) };
  const ok = await confirmModelRoleMapping(readback, { write: (t) => written.push(t),
    question: async () => "Confirm" });
  assert.equal(ok, false);
  const text = written.join("");
  assert.match(text, /input must match the exact 64-character digest shown above/u);
  assert.ok(text.includes(`Expected digest: ${"d".repeat(64)}`));
  assert.match(text, /Run the attended command again/u);
  assert.match(text, /no confirmation was recorded/u);
});

test("AC1: wrong input through the real transport records nothing and keeps the V3 fallback", async () => {
  const f = fixture(), output = [];
  const result = await runModelRoleBootstrapTransport({ ...f.input, bootstrapOptions: f.input,
    interactive: true, write: (t) => output.push(t), question: async () => "Confirm" });
  assert.equal(result.code, "MODEL-ROLE-BOOTSTRAP-NOT-CONFIRMED");
  assert.equal(f.rows.size, 0);
  assert.ok(output.join("").includes(`Expected digest: ${result.readback.readbackSha256}`));
  assert.equal(result.fallback, "legacy-v3");
  assert.equal(modelRoleBootstrapExitCode(result), 0);
});

test("AC2: noninteractive result offers an attended command bound to the observed session, runner and root", async () => {
  const f = fixture({ rootDir: "/repo with spaces", env: { CODEX_THREAD_ID: "observed-session-42" } });
  const output = [];
  const result = await runModelRoleBootstrapTransport({ ...f.input, bootstrapOptions: f.input,
    interactive: false, write: (t) => output.push(t),
    question: async () => { throw new Error("noninteractive must not ask"); } });
  assert.equal(result.code, "MODEL-ROLE-BOOTSTRAP-HUMAN-CONFIRMATION-REQUIRED");
  assert.equal(result.attendedAction.executionBoundary, "attended-terminal");
  assert.equal(result.attendedAction.sessionId, "observed-session-42");
  assert.deepEqual(result.attendedAction.argv, [scriptPath, "--repo-root", "/repo with spaces",
    "--runner", "codex", "--host-session-id", "observed-session-42"]);
  assert.ok(output.join("").includes(result.attendedAction.text));
  assert.equal(f.rows.size, 0, "guidance never confirms or records on the agent's behalf");
});

test("AC2: no observed session means no invented session and no attended action", async () => {
  const f = fixture({ env: {} });
  const result = await runModelRoleBootstrapTransport({ ...f.input, bootstrapOptions: f.input });
  assert.equal(result.code, "MODEL-ROLE-SESSION-IDENTITY-UNAVAILABLE");
  assert.equal(result.attendedAction, undefined);
  assert.equal(f.rows.size, 0);
});

test("AC2: the real CLI without a terminal refuses a transferred session instead of confirming", () => {
  const out = execFileSync(process.execPath, [scriptPath, "--repo-root", process.cwd(), "--runner", "codex",
    "--host-session-id", "observed"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  const result = JSON.parse(out);
  assert.equal(result.code, "MODEL-ROLE-ATTENDED-SESSION-REQUIRES-TERMINAL");
  assert.equal(result.fallback, "legacy-v3");
  assert.equal(result.lifecycleImpact, "none");
});

test("AC3: a digest from a previous proposal cannot confirm a changed mapping", async () => {
  const f = fixture();
  const prior = await runModelRoleBootstrap(f.input);
  const changedPolicies = structuredClone(approvedPolicies);
  for (const entry of changedPolicies) if (entry.runner === "codex") entry.policy.approved[0].modelId += "-changed";
  const changed = { ...f.input, readApprovedPolicy: () => ({ ok: true, approvedPolicies: changedPolicies }),
    collectObservations: async () => ({ ok: true, observations: observations
      .filter((entry) => entry.runner === "codex")
      .map((entry) => ({ ...entry, availableModelIds: entry.availableModelIds.map((id) => `${id}-changed`) })) }) };
  const rejected = await runModelRoleBootstrapTransport({ ...changed, bootstrapOptions: changed,
    interactive: true, question: async () => prior.readback.readbackSha256 });
  assert.equal(rejected.code, "MODEL-ROLE-BOOTSTRAP-NOT-CONFIRMED");
  assert.notEqual(rejected.readback.readbackSha256, prior.readback.readbackSha256);
  assert.equal(f.rows.size, 0);
});

test("AC4/AC5: exact digest admits once; unchanged rerun reuses every receipt without asking again", async () => {
  const f = fixture();
  let questions = 0;
  const ready = await runModelRoleBootstrapTransport({ ...f.input, bootstrapOptions: f.input,
    interactive: true, question: async (prompt) => { questions += 1; return ` ${prompt.match(/[a-f0-9]{64}/u)[0]} `; } });
  assert.equal(ready.code, "MODEL-ROLE-BOOTSTRAP-READY");
  const held = structuredClone(f.rows.get("session-1"));
  assert.equal(held.receipts.length, codexCount);
  assert.ok(held.receipts.length > 0);
  const reused = await runModelRoleBootstrapTransport({ ...f.input, bootstrapOptions: f.input,
    interactive: false, question: async () => { throw new Error("must not ask again"); } });
  assert.equal(reused.code, "MODEL-ROLE-BOOTSTRAP-REUSED");
  assert.deepEqual(reused.receipts, held.receipts);
  assert.equal(reused.readbackSha256, held.admission.readbackSha256);
  assert.equal(questions, 1);
});

test("AC4: unchanged mapping in a later session needs no confirmation; optional confirmation never blocks V3", async () => {
  const f = fixture();
  assert.equal((await runModelRoleBootstrap({ ...f.input, confirm: async () => true })).ok, true);
  const next = await runModelRoleBootstrap({ ...f.input, env: { CODEX_THREAD_ID: "session-2" } });
  assert.equal(next.ok, true);
  assert.equal(next.readback.acknowledgementRequired, false);
  const pending = fixture();
  const diag = await runModelRoleBootstrapTransport({ ...pending.input, bootstrapOptions: pending.input,
    interactive: false });
  assert.equal(diag.fallback, "legacy-v3");
  assert.equal(diag.lifecycleImpact, "none");
  assert.equal(modelRoleBootstrapExitCode(diag), 0);
});
