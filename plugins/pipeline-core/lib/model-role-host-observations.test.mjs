// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { openSync } from "node:fs";
import { collectModelRoleHostObservations } from "./model-role-host-observations.mjs";
import { functionalTaskRoutesForRunner, registeredFunctionalTaskRoutes } from "./model-role-route-source.mjs";
import { registerTestCaseCompletion } from "./test-case-completion.mjs";
import { devNull } from "node:os";

const cases = [];
function test(name, run) { cases.push({ id: `MRO${String(cases.length + 1).padStart(2, "0")}`, name, run }); }
const source = { ok: true, configuredRoutes: [
  { runner: "antigravity", role: "worker", effort: "medium", selector: { kind: "model-id", value: "flash" } },
  { runner: "claude", role: "frontier", effort: "high", selector: { kind: "alias", value: "opus" } },
  { runner: "claude", role: "frontier", effort: "medium", selector: { kind: "alias", value: "opus" } },
  { runner: "codex", role: "frontier", effort: "high", selector: { kind: "model-id", value: "sol" } },
] };

test("collects the complete set and probes one Claude alias only once", async () => {
  const calls = [];
  const result = await collectModelRoleHostObservations({ routeSource: source,
    observeAgy: () => { calls.push("agy"); return { ok: true, assurance: "installed-host-observed", availableModelIds: ["flash"] }; },
    observeClaude: ({ alias }) => { calls.push(`claude:${alias}`); return { ok: true,
      observation: { alias, modelId: "opus-exact", assurance: "host-observed-single-call-not-provider-attested" } }; },
    observeCodex: ({ effort }) => { calls.push(`codex:${effort}`); return { ok: true,
      assurance: "installed-host-observed", availableModelIds: ["sol-exact"] }; },
  });
  assert.equal(result.ok, true);
  assert.deepEqual(calls, ["agy", "claude:opus", "codex:high"]);
  assert.equal(result.observations.length, 4);
  assert.deepEqual(result.observations.slice(1, 3).map((item) => item.availableModelIds),
    [["opus-exact"], ["opus-exact"]]);
});

test("incomplete or API-only Claude observations fail without partial admission", async () => {
  const common = { routeSource: source,
    observeAgy: () => ({ ok: true, assurance: "installed-host-observed", availableModelIds: ["flash"] }),
    observeCodex: () => ({ ok: true, assurance: "installed-host-observed", availableModelIds: ["sol"] }) };
  const missing = await collectModelRoleHostObservations({ ...common, observeClaude: () => ({ ok: false }) });
  assert.equal(missing.code, "MODEL-ROLE-HOST-OBSERVATION-UNAVAILABLE");
  assert.deepEqual(missing.observations, []);
  const apiOnly = await collectModelRoleHostObservations({ ...common, observeClaude: () => ({ ok: true,
    observation: { alias: "opus", modelId: "opus-exact", assurance: "api-credential-only" } }) });
  assert.equal(apiOnly.code, "MODEL-ROLE-HOST-OBSERVATION-UNAVAILABLE");
  assert.deepEqual(apiOnly.observations, []);
});

test("a source with duplicate route slots is rejected before any provider observation", async () => {
  let calls = 0;
  const result = await collectModelRoleHostObservations({ routeSource: { ok: true,
    configuredRoutes: [source.configuredRoutes[0], source.configuredRoutes[0]] },
  observeAgy: () => { calls += 1; return { ok: true }; } });
  assert.equal(result.code, "MODEL-ROLE-HOST-ROUTE-SOURCE-INVALID");
  assert.equal(calls, 0);
});

test("the actual registered route set is observed without promoting V3-unavailable duties", async () => {
  const routes = registeredFunctionalTaskRoutes();
  assert.equal(routes.ok, true);
  const result = await collectModelRoleHostObservations({ routeSource: routes,
    observeAgy: () => ({ ok: true, assurance: "installed-host-observed", availableModelIds: ["flash"] }),
    observeClaude: ({ alias }) => ({ ok: true, observation: { alias, modelId: `exact-${alias}`,
      assurance: "host-observed-single-call-not-provider-attested" } }),
    observeCodex: () => ({ ok: true, assurance: "installed-host-observed", availableModelIds: ["sol", "luna"] }),
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.observations.map((item) => `${item.runner}:${item.role}:${item.effort}`),
    routes.configuredRoutes.map((item) => `${item.runner}:${item.role}:${item.effort}`));
  assert.equal(result.observations.some((item) => item.runner === "antigravity"
    && item.role === "frontier"), false);
});

test("a single-runner installation never probes the other two providers", async () => {
  const routeSource = functionalTaskRoutesForRunner(registeredFunctionalTaskRoutes(), "codex");
  assert.equal(routeSource.ok, true);
  const result = await collectModelRoleHostObservations({ routeSource,
    observeAgy: () => { throw new Error("uninstalled Agy must not be called"); },
    observeClaude: () => { throw new Error("uninstalled Claude must not be called"); },
    observeCodex: () => ({ ok: true, assurance: "installed-host-observed",
      availableModelIds: ["gpt-6-sol", "gpt-6-luna"] }),
  });
  assert.equal(result.ok, true);
  assert.equal(result.observations.length, routeSource.configuredRoutes.length);
  assert.ok(result.observations.every((entry) => entry.runner === "codex"));
});

test("a Claude-only installation needs no Codex or Antigravity account", async () => {
  const routeSource = functionalTaskRoutesForRunner(registeredFunctionalTaskRoutes(), "claude");
  assert.equal(routeSource.ok, true);
  const result = await collectModelRoleHostObservations({ routeSource,
    observeAgy: () => { throw new Error("uninstalled Agy must not be called"); },
    observeCodex: () => { throw new Error("uninstalled Codex must not be called"); },
    observeClaude: ({ alias }) => ({ ok: true, observation: { alias,
      modelId: `exact-${alias}`, assurance: "host-observed-single-call-not-provider-attested" } }),
  });
  assert.equal(result.ok, true);
  assert.equal(result.observations.length, routeSource.configuredRoutes.length);
  assert.ok(result.observations.every((entry) => entry.runner === "claude"));
});

test("an Antigravity-only installation needs no Claude or Codex account", async () => {
  const routeSource = functionalTaskRoutesForRunner(registeredFunctionalTaskRoutes(), "antigravity");
  assert.equal(routeSource.ok, true);
  const result = await collectModelRoleHostObservations({ routeSource,
    observeClaude: () => { throw new Error("uninstalled Claude must not be called"); },
    observeCodex: () => { throw new Error("uninstalled Codex must not be called"); },
    observeAgy: () => ({ ok: true, assurance: "installed-host-observed",
      availableModelIds: ["gemini-3.8-flash", "gemini-3.8-pro"] }),
  });
  assert.equal(result.ok, true);
  assert.equal(result.observations.length, routeSource.configuredRoutes.length);
  assert.ok(result.observations.every((entry) => entry.runner === "antigravity"));
});

assert.equal(cases.length, 7);
const completionFd = process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD === undefined
  ? openSync(devNull, "w")
  : Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD);
registerTestCaseCompletion({ cases: cases, fd: completionFd,
  maxBytes: Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_MAX_BYTES ?? "65536") });
