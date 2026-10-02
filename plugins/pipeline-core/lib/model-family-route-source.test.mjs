// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { registerTestCaseCompletion } from "./test-case-completion.mjs";
const cases = [];
function test(name, run) { cases.push({ id: `MFR${String(cases.length + 1).padStart(3, "0")}`, name, run }); }
import { registeredFunctionalTaskRoutes } from "./model-role-route-source.mjs";
import { registeredModelFamilyTaskRoutes } from "./model-family-route-source.mjs";

const find = (source, runner, taskRoute) => source.taskRoutes.find((route) =>
  route.runner === runner && route.taskRoute === taskRoute);

test("family inventory is the complete 46-cell projection and leaves historical inventory untouched", () => {
  const historic = registeredFunctionalTaskRoutes();
  const before = structuredClone(historic);
  const family = registeredModelFamilyTaskRoutes({ historicSource: historic });
  assert.equal(family.ok, true, family.code);
  assert.equal(family.taskRoutes.length, 46);
  assert.equal(family.unavailableTaskRoutes.length, 14);
  assert.equal(family.taskRoutes.filter((route) => route.runner === "codex" && route.state !== "unavailable").length, 15);
  assert.deepEqual(historic, before);
  assert.deepEqual(new Set(family.taskRoutes.map((route) => `${route.runner}:${route.taskRoute}`)).size, 46);
  assert.deepEqual(family.unavailableTaskRoutes, before.unavailableTaskRoutes);
});

test("Codex mechanic target lowers only the proposed Luna effort to medium", () => {
  const historic = registeredFunctionalTaskRoutes();
  const family = registeredModelFamilyTaskRoutes({ historicSource: historic });
  assert.equal(find(historic, "codex", "duty.mechanic").effort, "high");
  assert.equal(find(family, "codex", "duty.mechanic").effort, "medium");
  assert.deepEqual(find(family, "codex", "duty.mechanic").selector,
    find(historic, "codex", "duty.mechanic").selector);
  assert.equal(find(family, "claude", "duty.mechanic").effort,
    find(historic, "claude", "duty.mechanic").effort);
});

test("Codex normal Critic target raises only its proposed Sol effort to xhigh", () => {
  const historic = registeredFunctionalTaskRoutes();
  const family = registeredModelFamilyTaskRoutes({ historicSource: historic });
  assert.equal(find(historic, "codex", "duty.critic_normal").effort, "medium");
  assert.equal(find(family, "codex", "duty.critic_normal").effort, "xhigh");
  assert.deepEqual(find(family, "codex", "duty.critic_normal").selector,
    find(historic, "codex", "duty.critic_normal").selector);
  assert.equal(find(family, "claude", "duty.critic_normal").effort,
    find(historic, "claude", "duty.critic_normal").effort);
});

test("only Codex advisory and high-risk Critic selectors change to Astra", () => {
  const historic = registeredFunctionalTaskRoutes();
  const family = registeredModelFamilyTaskRoutes({ historicSource: historic });
  for (const taskRoute of ["duty.advisory", "duty.critic_high_risk"]) {
    assert.deepEqual(find(family, "codex", taskRoute).selector,
      { kind: "model-id", value: "gpt-6-astra" });
    assert.equal(find(family, "codex", taskRoute).effort, "max");
    assert.deepEqual(find(historic, "codex", taskRoute).selector,
      { kind: "model-id", value: "gpt-6-sol" });
  }
  assert.deepEqual(find(family, "claude", "duty.advisory").selector,
    find(historic, "claude", "duty.advisory").selector);
  assert.deepEqual(find(family, "codex", "duty.read").selector,
    find(historic, "codex", "duty.read").selector);
});

test("missing, duplicate, or incomplete historic cells cannot yield a partial target", () => {
  const historic = registeredFunctionalTaskRoutes();
  assert.equal(registeredModelFamilyTaskRoutes({ historicSource: { ...historic, taskRoutes: historic.taskRoutes.slice(1) } }).ok, false);
  const duplicate = { ...historic, taskRoutes: [...historic.taskRoutes, historic.taskRoutes[0]] };
  assert.equal(registeredModelFamilyTaskRoutes({ historicSource: duplicate }).code, "MODEL-FAMILY-ROUTE-SOURCE-HISTORIC");
});

registerTestCaseCompletion({ cases, fd: 3, maxBytes: 65536 });
