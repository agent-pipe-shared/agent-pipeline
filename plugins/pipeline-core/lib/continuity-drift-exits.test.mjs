// SPDX-License-Identifier: SUL-1.0
// AC-115: a bound-document drift is a state a typed command lifts. It must be worded as
// such -- cause named, "not terminal", both typed exits -- never as the cause-free dead end.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import {
  applyOnboardingKickoff,
  applyOnboardingKickoffPromotion,
  classifyOnboardingContinuity,
  explainContinuityUnavailable,
  planOnboardingKickoff,
  planOnboardingKickoffPromotion,
} from "./onboarding-continuity.mjs";
import { PO_GATE_PRD_ACKNOWLEDGEMENT_MARKER } from "./po-gate-authority.mjs";
import { inspectProjectOnboardingV3 } from "./project-onboarding-v3.mjs";
import { protectedAuthorityDocumentWriteOnly } from "./guard/denial-route.mjs";
import { AUTHORITY_RESTORE_SCRIPT } from "./guard/constants.mjs";
import { mkdtempTestScratch } from "./test-tmpdir.mjs";
import { clearRuntimeBarrier, dispose, fakeDeps, initializeRestartRequiredRoot, root } from "./project-onboarding-v3.test.mjs";

const digest = (value) => createHash("sha256").update(value).digest("hex");

function promotedProject(name) {
  const dir = mkdtempTestScratch(`continuity drift exits ${name} `);
  mkdirSync(join(dir, ".claude"), { recursive: true });
  assert.equal(spawnSync("git", ["init", "-q"], { cwd: dir, encoding: "utf8", shell: false }).status, 0);
  writeFileSync(join(dir, ".claude", "pipeline.json"), `${JSON.stringify({
    project: "fixture", verify: "node verify.mjs", autonomy: "bounded", branchModel: "local",
    worktree: "supported", stakes: "high", constraints: [],
  }, null, 2)}\n`);
  const kickoff = planOnboardingKickoff({ rootDir: dir, goal: `Promote ${name}` });
  applyOnboardingKickoff({ plan: kickoff, expectedPlanSha256: kickoff.planSha256, activate: true });
  const directory = join(dir, "specs", "promoted");
  mkdirSync(directory, { recursive: true });
  const specBytes = `# ${name} specification\n`;
  writeFileSync(join(directory, "spec.md"), specBytes);
  writeFileSync(join(directory, "prd_promoted.md"), [
    "<!-- po-language: en -->",
    `<!-- technical-spec-sha256: ${digest(specBytes)} -->`,
    PO_GATE_PRD_ACKNOWLEDGEMENT_MARKER,
    `# ${name} PRD`,
    "",
  ].join("\n"));
  writeFileSync(join(directory, "design-input.md"), `# ${name} design input\n`);
  // QG-04 restatement (C19 late binding, build step 5): a package in the EL-19 scope (every profile but `mini`) is promoted as the
  // unsealed draft, whose PRD and Spec stay editable by design, so there is no bound-document drift to explain. The drift cases of
  // this file pin the bound digest and therefore promote a package outside the scope (`mini`), which binds the digests as before.
  const plan = planOnboardingKickoffPromotion({
    rootDir: dir, profile: "mini", featureId: `feature-${name}`,
    planPath: "specs/promoted/prd_promoted.md", prdPath: "specs/promoted/prd_promoted.md",
    specPath: "specs/promoted/spec.md", designInputPath: "specs/promoted/design-input.md",
  });
  applyOnboardingKickoffPromotion({ plan, expectedPlanSha256: plan.planSha256, activate: true });
  return { dir, directory };
}

test("AC-115: a drifted Spec is explained as KICKOFF-PROMOTION-AUTHORITY-DRIFT while the continuity shape is unchanged", () => {
  const seed = promotedProject("spec-drift");
  try {
    assert.equal(classifyOnboardingContinuity({ rootDir: seed.dir }).status, "valid");
    assert.equal(explainContinuityUnavailable({ rootDir: seed.dir }), null);
    writeFileSync(join(seed.directory, "spec.md"), "# edited after promotion\n");
    const continuity = classifyOnboardingContinuity({ rootDir: seed.dir });
    assert.deepEqual(Object.keys(continuity).sort(), ["handoverSha256", "historySha256", "stateSha256", "status"]);
    assert.equal(continuity.status, "unavailable");
    assert.equal(explainContinuityUnavailable({ rootDir: seed.dir }), "KICKOFF-PROMOTION-AUTHORITY-DRIFT");
  } finally { rmSync(seed.dir, { recursive: true, force: true }); }
});

test("AC-115: a drifted design input is explained as KICKOFF-PROMOTION-EVIDENCE-DRIFT", () => {
  const seed = promotedProject("evidence-drift");
  try {
    writeFileSync(join(seed.directory, "design-input.md"), "# altered after promotion\n");
    assert.equal(explainContinuityUnavailable({ rootDir: seed.dir }), "KICKOFF-PROMOTION-EVIDENCE-DRIFT");
  } finally { rmSync(seed.dir, { recursive: true, force: true }); }
});

test("AC-115: every other unavailable cause explains as null", () => {
  const seed = promotedProject("other-cause");
  try {
    writeFileSync(join(seed.dir, ".claude", "pipeline-state.json"), "{broken");
    assert.equal(classifyOnboardingContinuity({ rootDir: seed.dir }).status, "unavailable");
    assert.equal(explainContinuityUnavailable({ rootDir: seed.dir }), null);
  } finally { rmSync(seed.dir, { recursive: true, force: true }); }
});

function inspectWith(path, explain) {
  return inspectProjectOnboardingV3({
    runner: "codex", rootDir: path, intent: "onboarding",
    deps: {
      ...fakeDeps,
      classifyOnboardingContinuity: () => ({ status: "unavailable", stateSha256: null, handoverSha256: null, historySha256: null }),
      explainContinuityUnavailable: explain,
    },
  });
}

test("AC-115: the lifecycle diagnostic names the cause, says not terminal, and names both typed exits", () => {
  const path = root();
  try {
    clearRuntimeBarrier(path, initializeRestartRequiredRoot(path));
    for (const code of ["KICKOFF-PROMOTION-AUTHORITY-DRIFT", "KICKOFF-PROMOTION-EVIDENCE-DRIFT"]) {
      const result = inspectWith(path, () => code);
      assert.equal(result.status, "continuity-observation-unavailable");
      assert.equal(result.continuity.status, "unavailable");
      const text = JSON.stringify(result.diagnostics);
      assert.match(text, new RegExp(code, "u"));
      assert.match(text, /not terminal/u);
      assert.match(text, /submit-plan --by <name> --profile <epic\|feature\|mini>/u);
      assert.match(text, /authority-restore\.mjs restore/u);
      assert.doesNotMatch(text, /no cause is established/u);
    }
  } finally { dispose(path); }
});

test("AC-115: any other unavailable cause keeps today's wording exactly", () => {
  const path = root();
  try {
    clearRuntimeBarrier(path, initializeRestartRequiredRoot(path));
    for (const explain of [() => null, () => { throw new Error("unreadable"); }]) {
      const result = inspectWith(path, explain);
      assert.equal(result.status, "continuity-observation-unavailable");
      assert.equal(result.nextAction, null);
      assert.equal(result.diagnostics.length, 1);
      assert.equal(result.diagnostics[0].code, "continuity_observation_unavailable");
      assert.match(result.diagnostics[0].guidance, /no cause is established here/u);
      assert.doesNotMatch(JSON.stringify(result.diagnostics), /submit-plan|not terminal/u);
    }
  } finally { dispose(path); }
});

test("AC-115: GUARD-LIFECYCLE-AUTHORITY-BOUND names both typed exits and keeps its design-lock text", () => {
  const stderr = protectedAuthorityDocumentWriteOnly("specs/promoted/spec.md", "/project").stderr;
  assert.match(stderr, /design lock/u);
  assert.match(stderr, /not a dead end/u);
  assert.match(stderr, /submit-plan --by <name> --profile <epic\|feature\|mini>/u);
  assert.ok(stderr.includes(`${AUTHORITY_RESTORE_SCRIPT} restore --root /project`));
});
