#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
//
// backlog/items/2026-08-08-the-harness-classifier-blocks-the-onboarding-action-the-pipeline-just-authorized.md
// Direction 1: "for each Pipeline CLI proposed for an allowlist, establish that the guard
// admits a closed, positional argv set and refuses everything else." This proves that claim
// for `project-onboarding-v3.mjs`, the onboarding CLI whose refusal by the Claude Code
// harness classifier is this item's own trigger. A settings-layer prefix match like
// `Bash(node plugins/pipeline-core/scripts/project-onboarding-v3.mjs *)` admits any trailing
// argv; these tests prove the CLI's own `parse()` -- not the settings glob -- is what
// actually refuses anything outside its closed command/flag grammar: an unrecognized
// subcommand, an unrecognized flag, and a flag used where the grammar forbids it.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { main as onboardingCli } from "./project-onboarding-v3.mjs";
import { PO_GATE_PRD_ACKNOWLEDGEMENT_MARKER } from "../lib/po-gate-authority.mjs";

function freshDir(prefix) {
  return mkdtempSync(join(tmpdir(), `project-onboarding-argv-${prefix}-`));
}

function invoke(args) {
  let output = "";
  const status = onboardingCli(args, {
    write: (chunk) => { output += chunk; },
    writeError: (chunk) => { output += chunk; },
    env: {},
  });
  return { status, output };
}

test("project-onboarding-v3 refuses an unrecognized subcommand (closed command set, not open)", () => {
  const dir = freshDir("bad-command");
  try {
    const { status, output } = invoke(["definitely-not-a-real-command", "--root", dir]);
    assert.equal(status, 2, `expected refusal (exit 2) for an unknown subcommand, got ${status}`);
    assert.match(output, /unknown argument: definitely-not-a-real-command/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("project-onboarding-v3 refuses an unrecognized flag on a known, read-only subcommand", () => {
  const dir = freshDir("bad-flag-inspect");
  try {
    // `plan-runtime` is the read-only step the source incident also reported refused by the
    // harness classifier -- the settings entry has to stay safe for it too, not only for the
    // mutating `--activate` commands.
    const { status, output } = invoke(["plan-runtime", "--root", dir, "--smuggled-flag", "value"]);
    assert.equal(status, 2, `expected refusal (exit 2) for an unrecognized flag, got ${status}`);
    assert.match(output, /unknown argument: --smuggled-flag/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("project-onboarding-v3 refuses --activate on a subcommand outside the apply-shaped set", () => {
  const dir = freshDir("activate-on-inspect");
  try {
    // --activate is only valid for the enumerated APPLY_SHAPED_COMMANDS. `inspect` is
    // read-only; the parser must refuse the combination even though every individual flag
    // (`--root`, `--activate`) is independently recognized.
    const { status, output } = invoke(["inspect", "--root", dir, "--activate"]);
    assert.equal(status, 2, `expected refusal (exit 2) for --activate outside the apply-shaped set, got ${status}`);
    assert.match(output, /--activate is only valid for an apply command/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("project-onboarding-v3 refuses an unrecognized flag value for a closed enum flag", () => {
  const dir = freshDir("bad-runner-enum");
  try {
    const { status, output } = invoke(["inspect", "--root", dir, "--runner", "not-a-real-runner"]);
    assert.equal(status, 2, `expected refusal (exit 2) for an out-of-enum --runner value, got ${status}`);
    assert.match(output, /--runner must be claude or codex/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// Wave 4 onboarding coordinator, step 5 (NVA-W5-COORD-STEP5-2, design.md SSa.5 point 5). This
// file otherwise only proves the CLI's own closed argv grammar; this test proves the wiring
// itself, driving the FULL intake -> generate -> bootstrap-bind chain through the real CLI entry
// point (main()), never the library functions directly -- an unwired or mis-wired dispatch branch
// would surface here even though every library-level test (onboarding-continuity.test.mjs) already
// passes, because those tests call planOnboardingBootstrapBind/applyOnboardingBootstrapBind
// directly and would never notice a missing or malformed main() dispatch branch.
function neutralGitFixture(prefix) {
  const root = freshDir(prefix);
  mkdirSync(join(root, ".claude"), { recursive: true });
  mkdirSync(join(root, "project"), { recursive: true });
  writeFileSync(join(root, "project", "pipeline.yaml"), "schema: pipeline.project.v1\n");
  const git = spawnSync("git", ["init", "-q"], { cwd: root, encoding: "utf8", shell: false });
  assert.equal(git.status, 0, git.stderr);
  const calibration = {
    project: "fixture", verify: "node verify.mjs", autonomy: "bounded",
    branchModel: "local", worktree: "supported", stakes: "high", constraints: [],
  };
  writeFileSync(join(root, "project", "pipeline.json"), `${JSON.stringify(calibration, null, 2)}\n`);
  return root;
}

function sha256Hex(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

test("project-onboarding-v3 CLI: the intake -> generate -> bootstrap-bind chain works end to end through main()", () => {
  const dir = neutralGitFixture("bootstrap-bind-e2e");
  try {
    let result = invoke(["intake-consent-apply", "--root", dir, "--granted",
      "--git-author-name", "Test Author", "--git-author-email", "test@example.com",
      "--language", "en", "--profile", "feature", "--activate"]);
    assert.equal(result.status, 0, result.output);

    result = invoke(["intake-capture-apply", "--root", dir, "--text", "requirement material one", "--activate"]);
    assert.equal(result.status, 0, result.output);

    result = invoke(["intake-design-questions-apply", "--root", dir,
      "--answers-json", JSON.stringify([{ question: "What is the goal?", answer: "Ship the coordinator." }]),
      "--activate"]);
    assert.equal(result.status, 0, result.output);

    result = invoke(["intake-generate-plan", "--root", dir]);
    assert.equal(result.status, 0, result.output);
    const generatePlan = JSON.parse(result.output);

    result = invoke(["intake-generate-apply", "--root", dir, "--plan-sha256", generatePlan.planSha256, "--activate"]);
    assert.equal(result.status, 0, result.output);
    const generated = JSON.parse(result.output);

    // The staged PRD is an explicitly unreviewed draft (design SSa.4/SSc.3): it must carry the
    // three PO-gate markers before binding, mirroring onboarding-continuity.test.mjs's own
    // bootstrapBindReadyRoot() fixture -- this is fixture setup via direct file edit, not part of
    // the CLI surface under test.
    const prdAbsolute = join(dir, generated.targets.prd.path);
    const specAbsolute = join(dir, generated.targets.spec.path);
    const specSha256 = sha256Hex(readFileSync(specAbsolute));
    writeFileSync(prdAbsolute, [
      "<!-- po-language: en -->",
      `<!-- technical-spec-sha256: ${specSha256} -->`,
      PO_GATE_PRD_ACKNOWLEDGEMENT_MARKER,
      readFileSync(prdAbsolute, "utf8"),
    ].join("\n"));

    result = invoke(["bootstrap-bind-plan", "--root", dir]);
    assert.equal(result.status, 0, result.output);
    const bindPlan = JSON.parse(result.output);
    assert.equal(bindPlan.kickoff, null, "the coordinator-sourced branch, not a lookalike kickoff-sourced plan");

    result = invoke(["bootstrap-bind-apply", "--root", dir, "--plan-sha256", bindPlan.planSha256, "--activate"]);
    assert.equal(result.status, 0, result.output);
    const applied = JSON.parse(result.output);
    assert.equal(applied.status, "applied");
    assert.equal(applied.mutated, true);

    // A replay against the same plan digest, through the CLI, stays a byte-null success (exit 0) --
    // exercising the exit-status wiring this dispatch added (KICKOFF_PROMOTION_APPLY_SCHEMA), not
    // only the mutating first apply.
    result = invoke(["bootstrap-bind-apply", "--root", dir, "--plan-sha256", bindPlan.planSha256, "--activate"]);
    assert.equal(result.status, 0, result.output);
    const replayed = JSON.parse(result.output);
    assert.equal(replayed.status, "replayed");
    assert.equal(replayed.mutated, false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("project-onboarding-v3 CLI: bootstrap-bind-plan/apply are registered subcommands reaching their own precondition error, not 'unknown argument'", () => {
  const dir = neutralGitFixture("bootstrap-bind-no-checkpoint");
  try {
    const plan = invoke(["bootstrap-bind-plan", "--root", dir]);
    assert.equal(plan.status, 2);
    assert.match(plan.output, /BOOTSTRAP-BIND-PRECONDITION/);
    assert.doesNotMatch(plan.output, /unknown argument/);

    const sha = "a".repeat(64);
    const apply = invoke(["bootstrap-bind-apply", "--root", dir, "--plan-sha256", sha, "--activate"]);
    assert.equal(apply.status, 2);
    assert.match(apply.output, /BOOTSTRAP-BIND-PRECONDITION/);
    assert.doesNotMatch(apply.output, /unknown argument/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
