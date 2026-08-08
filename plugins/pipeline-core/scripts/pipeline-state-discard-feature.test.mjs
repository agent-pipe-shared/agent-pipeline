#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
//
// discard-feature: AC-1..AC-4 of backlog/items/2026-08-08-there-is-no-sanctioned-way-to-
// start-over.md (R1). Admitted EXACTLY where close-feature is structurally unsatisfiable
// (continuity.authority.result === null); refused otherwise, naming close-feature as the
// route that IS open. Every refusal case asserts nothing was written (byte-identical State).

import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { run } from "./pipeline-state.mjs";

function stuckState(overrides = {}) {
  return {
    schema: "pipeline.state.v0",
    activeFeature: { id: "abandoned-feature", planPath: "specs/abandoned/prd.md", phase: "implementation" },
    planApproved: true,
    continuity: {
      schema: "pipeline.continuity.v0",
      revision: 3,
      featureId: "abandoned-feature",
      queueHead: { nextAction: "dispatch", dispatch: null },
      blocker: null,
      decisionTxn: null,
      authority: { result: null },
      ...overrides.continuity,
    },
    ...overrides.top,
  };
}

function fixture(state) {
  const root = mkdtempSync(join(tmpdir(), "pipeline-state-discard-"));
  mkdirSync(join(root, ".claude"));
  const statePath = join(root, ".claude", "pipeline-state.json");
  writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`);
  return { root, statePath };
}

function readState(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

test("AC-1: discard-feature refuses an unattributed discard (--by missing), zero write", () => {
  const { root, statePath } = fixture(stuckState());
  try {
    const before = readFileSync(statePath, "utf8");
    assert.equal(run(["discard-feature", "--reason", "abandoned before implementation"], { dir: root, now: () => "2026-08-08T10:00:00.000Z" }), 2);
    assert.equal(readFileSync(statePath, "utf8"), before);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("AC-1: discard-feature refuses an unexplained discard (--reason missing), zero write", () => {
  const { root, statePath } = fixture(stuckState());
  try {
    const before = readFileSync(statePath, "utf8");
    assert.equal(run(["discard-feature", "--by", "PO"], { dir: root, now: () => "2026-08-08T10:00:00.000Z" }), 2);
    assert.equal(readFileSync(statePath, "utf8"), before);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("AC-2: discard-feature refuses when no continuity gates the feature -- close-feature is open, zero write", () => {
  const state = { schema: "pipeline.state.v0", activeFeature: { id: "x", planPath: "specs/x/prd.md", phase: "design" }, planApproved: false };
  const { root, statePath } = fixture(state);
  try {
    const before = readFileSync(statePath, "utf8");
    assert.equal(run(["discard-feature", "--by", "PO", "--reason", "changed mind"], { dir: root, now: () => "2026-08-08T10:00:00.000Z" }), 2);
    assert.equal(readFileSync(statePath, "utf8"), before);
    // Prove the boundary: close-feature IS satisfiable in exactly this state.
    assert.equal(run(["close-feature", "--by", "PO"], { dir: root, now: () => "2026-08-08T10:01:00.000Z" }), 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("AC-2: discard-feature refuses when continuity.authority.result already exists -- close-feature is open, zero write", () => {
  const state = stuckState({ continuity: { authority: { result: { path: "specs/abandoned/result.md", sha256: "a".repeat(64) } } } });
  const { root, statePath } = fixture(state);
  try {
    const before = readFileSync(statePath, "utf8");
    const code = run(["discard-feature", "--by", "PO", "--reason", "changed mind"], { dir: root, now: () => "2026-08-08T10:00:00.000Z" });
    assert.equal(code, 2);
    assert.equal(readFileSync(statePath, "utf8"), before);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("AC-2: close-feature is structurally unsatisfiable in the stuck state (Result null, no request), proving the deadlock", () => {
  const { root, statePath } = fixture(stuckState());
  try {
    const before = readFileSync(statePath, "utf8");
    assert.equal(run(["close-feature", "--by", "PO"], { dir: root, now: () => "2026-08-08T10:00:00.000Z" }), 2);
    assert.equal(readFileSync(statePath, "utf8"), before);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("AC-3: discardedFeatures is a present-but-not-array guard -- aborts WITHOUT changes", () => {
  const state = stuckState({ top: { discardedFeatures: "not-an-array" } });
  const { root, statePath } = fixture(state);
  try {
    const before = readFileSync(statePath, "utf8");
    assert.equal(run(["discard-feature", "--by", "PO", "--reason", "abandoned before implementation"], { dir: root, now: () => "2026-08-08T10:00:00.000Z" }), 2);
    assert.equal(readFileSync(statePath, "utf8"), before);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("AC-3: a blank activeFeature.id/planPath refuses discard-feature, zero write", () => {
  const state = stuckState({ top: { activeFeature: { id: "", planPath: "specs/abandoned/prd.md", phase: "implementation" } } });
  const { root, statePath } = fixture(state);
  try {
    const before = readFileSync(statePath, "utf8");
    assert.equal(run(["discard-feature", "--by", "PO", "--reason", "abandoned before implementation"], { dir: root, now: () => "2026-08-08T10:00:00.000Z" }), 2);
    assert.equal(readFileSync(statePath, "utf8"), before);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("AC-3/AC-4: discard-feature appends an honest record to discardedFeatures (never closedFeatures), and unsticks set-feature", () => {
  const { root, statePath } = fixture(stuckState());
  try {
    // Reach the stuck state: close-feature is structurally unsatisfiable.
    assert.equal(run(["close-feature", "--by", "PO"], { dir: root, now: () => "2026-08-08T10:00:00.000Z" }), 2);

    // Discard it, honestly.
    assert.equal(
      run(["discard-feature", "--by", "PO", "--reason", "abandoned before implementation"], { dir: root, now: () => "2026-08-08T10:05:00.000Z" }),
      0,
    );
    const afterDiscard = readState(statePath);
    assert.equal(Object.hasOwn(afterDiscard, "activeFeature"), false);
    assert.equal(Object.hasOwn(afterDiscard, "continuity"), false);
    assert.equal(afterDiscard.planApproved, false);
    assert.equal(Object.hasOwn(afterDiscard, "closedFeatures"), false);
    assert.equal(Array.isArray(afterDiscard.discardedFeatures), true);
    assert.equal(afterDiscard.discardedFeatures.length, 1);
    const entry = afterDiscard.discardedFeatures[0];
    assert.equal(entry.id, "abandoned-feature");
    assert.equal(entry.planPath, "specs/abandoned/prd.md");
    assert.equal(entry.phaseAtDiscard, "implementation");
    assert.equal(entry.discardedAt, "2026-08-08T10:05:00.000Z");
    assert.equal(entry.discardedBy, "PO");
    assert.equal(entry.reason, "abandoned before implementation");
    assert.equal(Object.hasOwn(entry, "forCommit"), true);

    // AC-4: the state actually returns to usable -- set-feature succeeds for a new id.
    assert.equal(
      run(["set-feature", "--id", "next-feature", "--plan-path", "specs/next/prd.md"], { dir: root, now: () => "2026-08-08T10:06:00.000Z" }),
      0,
    );
    const afterSetFeature = readState(statePath);
    assert.equal(afterSetFeature.activeFeature.id, "next-feature");
    assert.equal(afterSetFeature.activeFeature.planPath, "specs/next/prd.md");
    assert.equal(afterSetFeature.planApproved, false);
    // The discard record survives -- append-only, never overwritten by the next feature.
    assert.equal(afterSetFeature.discardedFeatures.length, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("no active feature present -- discard-feature refused, zero write", () => {
  const state = { schema: "pipeline.state.v0", planApproved: false };
  const { root, statePath } = fixture(state);
  try {
    const before = readFileSync(statePath, "utf8");
    assert.equal(run(["discard-feature", "--by", "PO", "--reason", "nothing to discard"], { dir: root, now: () => "2026-08-08T10:00:00.000Z" }), 2);
    assert.equal(readFileSync(statePath, "utf8"), before);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

console.log("pipeline-state-discard-feature.test.mjs: all test() cases registered.");
