// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import test from "node:test";
import { devPlanGateVerdict, isCriticScratchNotesPath } from "./guard-devplan-policy.mjs";

test("isCriticScratchNotesPath identifies critic notes and dispatch scratch paths", () => {
  assert.equal(isCriticScratchNotesPath("scratch/dispatch/TASK-1/critic-notes.md"), true);
  assert.equal(isCriticScratchNotesPath("scratch/dispatch/TASK-1/repro.js"), true);
  assert.equal(isCriticScratchNotesPath("scratch/sub/critic-notes.md"), true);
  assert.equal(isCriticScratchNotesPath("src/index.js"), false);
});

test("devPlanGateVerdict unconditionally admits scratch/dispatch/TASK-1/critic-notes.md during all phases", () => {
  const result = devPlanGateVerdict({
    filePath: "scratch/dispatch/TASK-1/critic-notes.md",
    projectDir: process.cwd(),
  });
  assert.equal(result.verdict, "allow");
});
