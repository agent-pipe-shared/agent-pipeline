#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import test from "node:test";

import { runSpecReadinessHost } from "./spec-readiness-host.mjs";

const DISPATCH = Object.freeze({
  queueRevision: 9,
  candidateCommit: "a".repeat(40),
  candidateTree: "b".repeat(40),
  referenceSetSha256: "c".repeat(64),
});
const REQUEST = Object.freeze({ repoFingerprint: "f".repeat(64), requested: { runner: "codex", model: "gpt-5.6-sol" } });

test("readiness uses the generic selected duty with only fresh refs and binds the resulting review", async () => {
  const calls = [];
  const result = await runSpecReadinessHost({ dispatch: DISPATCH, references: ["spec.md", "prd.md"], ...REQUEST }, {
    executeSandboxedReadonlyDuty: async (request) => {
      calls.push(request);
      return {
        status: "reviewed",
        selectionId: "css_aaaaaaaaaaaaaaaaaaaaaaaaae",
        executionReceiptSha256: "d".repeat(64),
        dutyReceiptSha256: "e".repeat(64),
      };
    },
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].duty, "readiness");
  assert.equal(calls[0].repoFingerprint, REQUEST.repoFingerprint);
  assert.deepEqual(calls[0].requested, REQUEST.requested);
  assert.deepEqual(calls[0].dispatch, DISPATCH);
  assert.deepEqual(calls[0].references, ["prd.md", "spec.md"]);
  assert.equal(result.status, "reviewed");
  assert.equal(result.executionReceiptSha256, "d".repeat(64));
});

test("readiness returns the selector's typed unavailable result without a child or a prose workaround", async () => {
  let calls = 0;
  const result = await runSpecReadinessHost({ dispatch: DISPATCH, references: ["spec.md"], ...REQUEST }, {
    executeSandboxedReadonlyDuty: async () => {
      calls += 1;
      return { status: "unavailable", failureClass: "host-mode-unavailable", childStarted: false, assurance: { class: "no-usable-review", literal: null } };
    },
  });
  assert.equal(calls, 1);
  assert.deepEqual(result, { status: "unavailable", failureClass: "host-mode-unavailable", childStarted: false, assurance: { class: "no-usable-review", literal: null } });
});

test("readiness refuses to invent a direct Codex route when the host has no physical sandbox runtime", async () => {
  const result = await runSpecReadinessHost({ dispatch: DISPATCH, references: ["spec.md"], ...REQUEST });
  assert.deepEqual(result, {
    status: "unavailable",
    failureClass: "host-mode-unavailable",
    childStarted: false,
    assurance: { class: "no-usable-review", literal: null },
  });
});
