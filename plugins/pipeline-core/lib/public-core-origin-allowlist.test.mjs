#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

import assert from "node:assert/strict";
import test from "node:test";

import { PUBLIC_MARKETPLACE_URL, PUBLIC_SELF_APPLICATION_ORIGINS } from "./public-core-origin-allowlist.mjs";

test("the allowlist contains exactly the two reviewed Public-Core origins, byte-identical to the pre-merge constant", () => {
  assert.equal(PUBLIC_MARKETPLACE_URL, "https://github.com/agent-pipe-shared/agent-pipeline.git");
  assert.ok(PUBLIC_SELF_APPLICATION_ORIGINS instanceof Set);
  assert.equal(PUBLIC_SELF_APPLICATION_ORIGINS.size, 2);
  assert.deepEqual([...PUBLIC_SELF_APPLICATION_ORIGINS].sort(), [
    "git@github-public:agent-pipe-shared/agent-pipeline.git",
    "https://github.com/agent-pipe-shared/agent-pipeline.git",
  ]);
  assert.ok(PUBLIC_SELF_APPLICATION_ORIGINS.has(PUBLIC_MARKETPLACE_URL));
});

test("the module exports only the allowlist Set and its URL constant -- no shaping logic, no calling code", () => {
  return import("./public-core-origin-allowlist.mjs").then((module) => {
    assert.deepEqual(Object.keys(module).sort(), ["PUBLIC_MARKETPLACE_URL", "PUBLIC_SELF_APPLICATION_ORIGINS"]);
  });
});

test("an arbitrary fork or private origin is not admitted", () => {
  for (const rejected of [
    "https://github.com/some-fork/agent-pipeline.git",
    "git@github.com:agent-pipe-shared/agent-pipeline.git",
    "https://example.invalid/agent-pipeline.git",
    "",
  ]) {
    assert.equal(PUBLIC_SELF_APPLICATION_ORIGINS.has(rejected), false, rejected);
  }
});
