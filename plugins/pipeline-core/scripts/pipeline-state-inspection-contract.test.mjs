// SPDX-License-Identifier: SUL-1.0
/**
 * Contract test: writer against reader.
 *
 * Drives the REAL `run()` from pipeline-state.mjs against a REAL temp project
 * root, then feeds the resulting on-disk state to the REAL
 * `classifyOnboardingContinuity` from onboarding-continuity.mjs. Neither side
 * is a hand-written stand-in for the other's assumptions: this is what makes
 * the contract worth pinning.
 *
 * Enumerated here (deliberately NOT the full subcommand set): `set-feature`,
 * `close-feature`, `discard-feature` -- the feature-lifecycle boundary
 * subcommands that leave a project with no active continuity. A future
 * subcommand added to that family is not automatically covered by this file;
 * it needs its own case here.
 */
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

import { run, statePath as resolveStatePath } from "./pipeline-state.mjs";
import { classifyOnboardingContinuity } from "../lib/onboarding-continuity.mjs";

let passed = 0;
function check(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

function tempRoot(name) {
  const root = mkdtempSync(join(tmpdir(), `pipeline-state-inspection-contract ${name} `));
  mkdirSync(join(root, ".claude"), { recursive: true });
  const git = spawnSync("git", ["init", "-q"], { cwd: root, encoding: "utf8", shell: false });
  assert.equal(git.status, 0, git.stderr);
  const calibration = {
    project: "fixture",
    verify: "node verify.mjs",
    autonomy: "bounded",
    branchModel: "local",
    worktree: "supported",
    stakes: "high",
    constraints: [],
  };
  writeFileSync(join(root, ".claude", "pipeline.json"), `${JSON.stringify(calibration, null, 2)}\n`);
  return root;
}

function assertValid(root, command) {
  const result = classifyOnboardingContinuity({ rootDir: root });
  assert.equal(result.status, "valid", `${command}: expected classification "valid", got "${result.status}"`);
}

check("set-feature leaves a state the inspection classifies valid", () => {
  const root = tempRoot("set-feature");
  const exit = run(["set-feature", "--id", "feature-one", "--plan-path", "specs/feature-one/prd.md"], { dir: root });
  assert.equal(exit, 0);
  assertValid(root, "set-feature");
});

check("close-feature leaves a state the inspection classifies valid", () => {
  const root = tempRoot("close-feature");
  assert.equal(
    run(["set-feature", "--id", "feature-two", "--plan-path", "specs/feature-two/prd.md"], { dir: root }),
    0,
  );
  const exit = run(["close-feature", "--by", "PO"], { dir: root });
  assert.equal(exit, 0);
  assertValid(root, "close-feature");
});

check("discard-feature leaves a state the inspection classifies valid", () => {
  const root = tempRoot("discard-feature");
  assert.equal(
    run(["set-feature", "--id", "feature-three", "--plan-path", "specs/feature-three/prd.md"], { dir: root }),
    0,
  );
  // discard-feature refuses (by design, see pipeline-state.mjs:5546) unless
  // continuity is already active -- the same boundary close-feature gates on
  // when a continuity-close-request is supplied. Establish a minimal but
  // realistic continuity object (matching the shape applyOnboardingKickoff
  // produces) so the writer's own precondition is satisfiable here.
  //
  // The on-disk path is resolved through the writer's own `statePath()`
  // rather than hardcoded: with only a legacy `.claude/pipeline.json`
  // calibration and no `project/pipeline.yaml` manifest, authority is not
  // "ready" and `statePath()`'s tie-break picks the neutral location
  // (`project/pipeline-state.json`) the first time nothing exists yet.
  // Hardcoding `.claude/pipeline-state.json` here previously produced an
  // ENOENT that masked the actual classification defect this file exists
  // to pin.
  const statePath = resolveStatePath(root);
  const withActiveFeature = JSON.parse(readFileSync(statePath, "utf8"));
  const withContinuity = {
    ...withActiveFeature,
    continuity: {
      schema: "pipeline.continuity.v0",
      featureId: withActiveFeature.activeFeature.id,
      revision: 0,
      authority: {
        prd: { path: withActiveFeature.activeFeature.planPath, sha256: "a".repeat(64) },
        spec: { path: "specs/feature-three/spec.md", sha256: "b".repeat(64) },
        result: null,
      },
    },
  };
  writeFileSync(statePath, `${JSON.stringify(withContinuity, null, 2)}\n`);
  const exit = run(["discard-feature", "--by", "PO", "--reason", "superseded by a later feature"], { dir: root });
  assert.equal(exit, 0);
  assertValid(root, "discard-feature");
});

console.log(`${passed} pipeline-state inspection contract checks passed.`);
