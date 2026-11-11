#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { run } from "./pipeline-state.mjs";
import { nativeContractFixtureParent, prepareApprovedItemCourseFixture } from "../lib/test-item-approved-course-fixture.mjs";
import { inspectSignedDescriptorCustodyRepository } from "../lib/worktree-lifecycle.mjs";
import { createSessionAuthorityParticipantPorts } from "../lib/session-authority-observers.mjs";
import { initializeSessionAuthorityRegistry } from "../lib/session-authority-registry.mjs";

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
  execFileSync("git", ["init", "-q"], { cwd: root });
  execFileSync("git", ["-C", root, "config", "user.name", "Fixture"]);
  execFileSync("git", ["-C", root, "config", "user.email", "fixture@example.invalid"]);
  mkdirSync(join(root, ".claude"));
  const statePath = join(root, ".claude", "pipeline-state.json");
  writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`);
  return { root, statePath };
}

function readState(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

// Live on native Windows, 2026-11-10: the first native Goldfish creates the session-authority catalogue, and from then on a reopened design could not be submitted again.
test("with the catalogue the first Goldfish created, a reopened design walks submit, present and approve, and a State operation in flight holds it", () => {
  const parent = nativeContractFixtureParent();
  mkdirSync(parent, { recursive: true, mode: 0o700 });
  const root = realpathSync(mkdtempSync(join(parent, "reopen-after-goldfish-")));
  try {
    prepareApprovedItemCourseFixture({ root });
    const statePath = join(root, ".claude", "pipeline-state.json");
    const deps = { dir: root, architectureEntryReadiness: () => ({ status: "ready" }) };
    // This fixture keeps its State outside the neutral folder, where the registry route refuses reopen-design. The order does not change what is pinned: the catalogue is present for every verb below.
    assert.equal(run(["reopen-design", "--by", "Synthetic fixture PO"], { dir: root }), 0);
    const repository = inspectSignedDescriptorCustodyRepository(root);
    const registry = initializeSessionAuthorityRegistry({ repository }, createSessionAuthorityParticipantPorts({ repository }));
    assert.equal(registry.status, "initialized", JSON.stringify(registry));

    const producerPath = join(repository.commonDir, "agent-pipeline/session-authority/producers/onboarding-continuity.json");
    const producerBytes = readFileSync(producerPath);
    const memberDir = join(repository.commonDir, "agent-pipeline/session-authority/members/onboarding-continuity");
    mkdirSync(memberDir, { recursive: true });
    const memberPath = join(memberDir, "fixture-in-flight.json");
    writeFileSync(memberPath, JSON.stringify({ association: { state: "bound" }, phase: "armed" }));
    const producer = JSON.parse(producerBytes);
    writeFileSync(producerPath, JSON.stringify({ ...producer, members: [...producer.members, { memberRef: { path: ".git/agent-pipeline/session-authority/members/onboarding-continuity/fixture-in-flight.json" } }] }));
    assert.equal(run(["submit-plan", "--by", "Synthetic fixture", "--profile", "mini"], deps), 2, "a State operation in flight holds the submission");
    writeFileSync(producerPath, producerBytes);
    rmSync(memberPath);

    for (const args of [["submit-plan", "--by", "Synthetic fixture", "--profile", "mini"], ["present-plan", "--by", "Synthetic fixture"], ["approve-plan", "--by", "Synthetic fixture PO"]]) {
      assert.equal(run(args, deps), 0, args[0]);
    }
    assert.equal(JSON.parse(readFileSync(statePath, "utf8")).planApproved, true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

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
