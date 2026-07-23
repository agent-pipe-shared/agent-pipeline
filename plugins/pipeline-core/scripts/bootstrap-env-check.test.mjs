#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

import assert from "node:assert/strict";
import test from "node:test";

import { inspectBootstrapEnvironment } from "./bootstrap-env-check.mjs";

test("unset override emits an explicit clear receipt", () => {
  const env = {};
  assert.deepEqual(inspectBootstrapEnvironment(env), {
    schema: "pipeline.bootstrap-env-check.v1",
    status: "clear",
    variable: "CLAUDE_CODE_SUBAGENT_MODEL",
    set: false,
  });
});

test("set override blocks without disclosing its value", () => {
  const secret = "do-not-print-this-model";
  const receipt = inspectBootstrapEnvironment({ CLAUDE_CODE_SUBAGENT_MODEL: secret });
  assert.equal(JSON.stringify(receipt).includes(secret), false);
  assert.equal(receipt.status, "blocked");
});
