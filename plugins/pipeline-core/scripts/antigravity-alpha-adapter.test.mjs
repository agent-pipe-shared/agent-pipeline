#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  ANTIGRAVITY_ALPHA_ADAPTER_SCHEMA,
  ANTIGRAVITY_ALPHA_ADAPTER_VERSION,
  describeAntigravityAlpha,
  selectAntigravityAlpha,
} from "./antigravity-alpha-adapter.mjs";

let passed = 0;
const failures = [];
function check(name, fn) {
  try { fn(); passed += 1; console.log(`PASS ${name}`); }
  catch (error) { failures.push(`${name}: ${error.message}`); console.error(`FAIL ${name} -- ${error.message}`); }
}

check("B3A01 exposes Antigravity as an explicit Alpha third-runner boundary", () => {
  const value = describeAntigravityAlpha();
  assert.equal(value.schema, "pipeline.antigravity-alpha-adapter.v1");
  assert.equal(ANTIGRAVITY_ALPHA_ADAPTER_SCHEMA, value.schema);
  assert.equal(value.adapterVersion, "0.1.0-alpha");
  assert.equal(ANTIGRAVITY_ALPHA_ADAPTER_VERSION, value.adapterVersion);
  assert.deepEqual(value.runner, { id: "antigravity", status: "alpha-documentation-only", modelFamily: "gemini", selection: "fail-closed-not-activated" });
  assert.equal(Object.isFrozen(value), true);
});

check("B3A02 binds only the reviewed documentation decision", () => {
  const value = describeAntigravityAlpha();
  assert.equal(value.source.decisionPath, "specs/sprint-nova-epic/evidence/nova-b/antigravity-contract-decision-amendment-v1.json");
  assert.match(value.source.decisionSha256, /^[0-9a-f]{64}$/u);
  assert.deepEqual(value.followUp, { issue: 69, sprint: "none", requirement: "dedicated-agy-sprint" });
});

check("B3A03 all AGY actions and privileged cells remain unavailable", () => {
  const value = describeAntigravityAlpha();
  assert.deepEqual(value.runtime, { executable: "agy", discovery: "not-attempted", installation: "not-authorized", authentication: "not-authorized", network: "not-authorized", invocation: "unavailable" });
  const available = value.capabilities.filter((cell) => cell.status === "available").map((cell) => cell.capabilityId);
  assert.deepEqual(available, ["adapter.describe"]);
  for (const id of ["agy.discover", "agy.install", "agy.authenticate", "agy.invoke", "advisor", "review", "write"]) {
    assert.equal(value.capabilities.find((cell) => cell.capabilityId === id).status, "unavailable");
  }
});

check("B3A04 selection is a typed fail-closed non-success", () => {
  const result = selectAntigravityAlpha();
  assert.deepEqual({ selected: result.selected, code: result.code }, { selected: false, code: "AGY-ALPHA-NOT-ACTIVATED" });
  assert.equal(result.descriptor, describeAntigravityAlpha());
  assert.equal(Object.isFrozen(result), true);
});

check("B3A05 implementation has no execution, network, or AGY-discovery primitive", () => {
  const source = readFileSync(new URL("./antigravity-alpha-adapter.mjs", import.meta.url), "utf8");
  for (const forbidden of ["child_process", "spawn(", "exec(", "fetch(", "http://", "https://", "command -v"]) {
    assert.equal(source.includes(forbidden), false, forbidden);
  }
});

console.log(`\nantigravity-alpha-adapter: ${passed}/${passed + failures.length} checks passed.`);
if (failures.length) {
  for (const failure of failures) console.error(failure);
  process.exitCode = 1;
}
