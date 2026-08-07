#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { run } from "./pipeline-state.mjs";

const NOW = "2026-07-31T09:00:00.000Z";
const LATER = "2026-07-31T09:05:00.000Z";
const AUTHORITY = {
  schema: "pipeline.po-gate-authority.v2",
  humanFacing: "en",
  sourceSha256: "1".repeat(64),
  runtimeSha256: "2".repeat(64),
  receiptSha256: "3".repeat(64),
  repositoryFingerprint: "4".repeat(64),
  planPath: "specs/legacy/prd.md",
  planSha256: "5".repeat(64),
  specPath: "specs/legacy/spec.md",
  specSha256: "6".repeat(64),
};

function legacyState(id, planPath = AUTHORITY.planPath) {
  return {
    schema: "pipeline.state.v0",
    activeFeature: { id, planPath, phase: "implementation" },
    planApproved: true,
    planApproval: {
      schema: "pipeline.plan-approval.v2",
      approvedBy: "PO",
      approvedAt: NOW,
      specBoundBy: "PO",
      specBoundAt: LATER,
      poGateAuthority: AUTHORITY,
    },
  };
}

function fixture(state) {
  const root = mkdtempSync(join(tmpdir(), "pipeline-state-reopen-"));
  mkdirSync(join(root, ".claude"));
  const statePath = join(root, ".claude", "pipeline-state.json");
  writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`);
  return { root, statePath };
}

function readState(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

test("writer reopens pre-submission V2 approvals without inventing V3 state", () => {
  for (const profile of ["epic", "feature", "mini"]) {
    const { root, statePath } = fixture(legacyState(`${profile}-legacy`));
    try {
      assert.equal(run(["reopen-design", "--by", "PO"], { dir: root, now: () => "2026-07-31T09:10:00.000Z" }), 0);
      const reopened = readState(statePath);
      assert.equal(reopened.activeFeature.phase, "design");
      assert.equal(reopened.planApproved, false);
      assert.equal(Object.hasOwn(reopened, "planSubmission"), false);
      assert.equal(Object.hasOwn(reopened, "planApproval"), false);
      assert.equal(Object.hasOwn(reopened, "planInvalidation"), false);
      const bytes = readFileSync(statePath, "utf8");
      assert.equal(run(["reopen-design", "--by", "PO"], { dir: root, now: () => "2026-07-31T10:00:00.000Z" }), 0);
      assert.equal(readFileSync(statePath, "utf8"), bytes, `${profile}: replay must be zero-write`);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

test("writer preserves state when a legacy V2 approval drifts from its active feature", () => {
  const original = legacyState("drifted", "specs/other/prd.md");
  const { root, statePath } = fixture(original);
  try {
    const before = readFileSync(statePath, "utf8");
    assert.equal(run(["reopen-design", "--by", "PO"], { dir: root, now: () => "2026-07-31T09:10:00.000Z" }), 2);
    assert.equal(readFileSync(statePath, "utf8"), before);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
