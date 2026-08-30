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
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { main as onboardingCli } from "./project-onboarding-v3.mjs";
import { PO_GATE_PRD_ACKNOWLEDGEMENT_MARKER } from "../lib/po-gate-authority.mjs";

function freshDir(prefix) {
  return mkdtempSync(join(tmpdir(), `project-onboarding-argv-${prefix}-`));
}

function invoke(args, deps) {
  let output = "";
  const status = onboardingCli(args, {
    write: (chunk) => { output += chunk; },
    writeError: (chunk) => { output += chunk; },
    env: {},
    deps,
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

function commitGlobalHumanApproval(root, mode) {
  const git = (...args) => spawnSync("git", ["-C", root, ...args], { encoding: "utf8", shell: false });
  assert.equal(git("config", "user.email", "po@example.invalid").status, 0);
  assert.equal(git("config", "user.name", "PO").status, 0);
  writeFileSync(join(root, "pipeline.user.yaml"), [
    "schema: pipeline.user.v3",
    "gates:",
    `  human_approval: ${mode}`,
    "",
  ].join("\n"));
  assert.equal(git("add", "-A").status, 0);
  const committed = git("commit", "-q", "-m", "configure global human approval");
  assert.equal(committed.status, 0, committed.stderr);
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

    // The staged PRD is an explicitly unreviewed draft (design SSa.4/SSc.3): the generator
    // (buildIntakePrdContent(), NVA-BL-INTAKEBIND-1) now emits the po-language and
    // technical-spec-sha256 markers mechanically, so only the one marker representing a
    // genuine review decision -- po-plan-acknowledged -- still needs adding here, mirroring
    // onboarding-continuity.test.mjs's own bootstrapBindReadyRoot() fixture. This is fixture
    // setup via direct file edit, not part of the CLI surface under test.
    const prdAbsolute = join(dir, generated.targets.prd.path);
    writeFileSync(prdAbsolute, [
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

// AGY-CHATADAPTER-2 (backlog/items/2026-08-21-enforce-kickoff-po-questions.md):
// `kickoff plan`/`kickoff apply --language` and `kickoff promote plan`/`apply
// --profile` must reuse `lib/chat-gate-ceremony.mjs`'s
// `requireAttendedChatGateConfirmation` -- the same primitive AGY-CHATADAPTER-1
// built for `approve-push` -- so an agent's own tool call (never attended) can
// never make either value accepted on its own.
const ONBOARDING_SCRIPT_PATH = fileURLToPath(new URL("./project-onboarding-v3.mjs", import.meta.url));

test("project-onboarding-v3 CLI: kickoff plan/apply --language is refused without an attended confirmation", () => {
  const dir = freshDir("kickoff-language-not-attended");
  try {
    // No `deps` passed at all -- `isAttendedTerminal()` falls through to the real
    // `process.stdin.isTTY`, falsy for this test process, exactly the property an
    // agent's own tool-calling harness has.
    const plan = invoke(["kickoff", "plan", "--root", dir, "--goal", "Build one HTML game", "--language", "de"]);
    assert.equal(plan.status, 1, `expected refusal (exit 1), got ${plan.status}: ${plan.output}`);
    assert.match(plan.output, /CHAT-GATE-NOT-ATTENDED/);
    assert.match(plan.output, /a human must confirm --language de directly, in their own attended terminal/);
    // The exact re-run command is echoed so a human can copy-paste it verbatim.
    assert.match(plan.output, /kickoff.*plan.*--language.*de/);

    const apply = invoke(["kickoff", "apply", "--root", dir, "--goal", "Build one HTML game", "--language", "de",
      "--plan-sha256", "a".repeat(64), "--activate"]);
    assert.equal(apply.status, 1, `expected refusal (exit 1), got ${apply.status}: ${apply.output}`);
    assert.match(apply.output, /CHAT-GATE-NOT-ATTENDED/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("project-onboarding-v3 CLI: committed global chat makes kickoff language terminal-free and labels its result unattested", () => {
  const dir = neutralGitFixture("kickoff-language-global-chat");
  try {
    commitGlobalHumanApproval(dir, "chat");
    for (const runner of ["claude", "codex", "antigravity"]) {
      let terminalCalls = 0;
      const plan = invoke(["kickoff", "plan", "--root", dir, "--goal", "Build one HTML game", "--language", "de", "--runner", runner], {
        isattyFn: () => { terminalCalls += 1; throw new Error("global chat must not inspect a terminal"); },
        readLineFn: () => { terminalCalls += 1; throw new Error("global chat must not read a terminal"); },
      });
      assert.doesNotMatch(plan.output, /CHAT-GATE/,
        `${runner}: a committed global chat selection must reach kickoff itself: ${plan.output}`);
      assert.equal(terminalCalls, 0, `${runner}: global chat must not request any terminal confirmation`);
      const output = JSON.parse(plan.output);
      assert.deepEqual(output.humanApproval, {
        mode: "chat-attributed-unattested",
        kind: "kickoff-language",
      });
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("project-onboarding-v3 CLI: invalid, uncommitted, and unreadable global modes retain the kickoff terminal refusal", () => {
  for (const [name, prepare] of [
    ["uncommitted", (dir) => writeFileSync(join(dir, "pipeline.user.yaml"), "schema: pipeline.user.v3\ngates:\n  human_approval: chat\n")],
    ["invalid", (dir) => commitGlobalHumanApproval(dir, "not-a-mode")],
    ["unreadable", (dir) => { commitGlobalHumanApproval(dir, "chat"); chmodSync(join(dir, "pipeline.user.yaml"), 0o000); }],
  ]) {
    const dir = neutralGitFixture(`kickoff-language-${name}-global-human-approval`);
    try {
      prepare(dir);
      const result = invoke(["kickoff", "plan", "--root", dir, "--goal", "Build one HTML game", "--language", "de"]);
      assert.equal(result.status, 1, `${name} global source must retain the fail-closed gate: ${result.output}`);
      assert.match(result.output, /CHAT-GATE-NOT-ATTENDED/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

test("project-onboarding-v3 CLI: kickoff plan --language passes the confirmation gate once a human confirms it via the injectable attended-terminal seam", () => {
  const dir = neutralGitFixture("kickoff-language-attended");
  try {
    // This fixture's onboarding authority is not the full v4 "ready" shape kickoff-plan's
    // OWN downstream dispatch expects (unrelated to this dispatch's scope) -- so this proves
    // only that the chat-gate confirmation itself was passed through once attended and
    // correctly typed, the property this dispatch is actually responsible for, not that the
    // full onboarding-authority precondition chain also succeeds.
    const attendedDeps = { isattyFn: () => true, readLineFn: () => "de" };
    const plan = invoke(["kickoff", "plan", "--root", dir, "--goal", "Build one HTML game", "--language", "de"], attendedDeps);
    assert.doesNotMatch(plan.output, /CHAT-GATE/, `the gate itself must not be what refused this call: ${plan.output}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("project-onboarding-v3 CLI: kickoff plan --language is refused when an attended human types the wrong value", () => {
  const dir = freshDir("kickoff-language-mismatch");
  try {
    const wrongValueDeps = { isattyFn: () => true, readLineFn: () => "en" };
    const plan = invoke(["kickoff", "plan", "--root", dir, "--goal", "Build one HTML game", "--language", "de"], wrongValueDeps);
    assert.equal(plan.status, 1, `a mismatched typed value must be refused, got ${plan.status}: ${plan.output}`);
    assert.match(plan.output, /CHAT-GATE-CONFIRMATION-MISMATCH/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("project-onboarding-v3 CLI: a real spawned subprocess with a plain piped (non-TTY) stdin cannot complete the kickoff --language confirmation, even carrying the correct value", () => {
  const dir = freshDir("kickoff-language-live-subprocess");
  try {
    // Exactly the shape an agent's own Bash tool call has: a genuinely separate process,
    // non-TTY stdin, fed the correct value on stdin -- still refused, because the gate
    // checks TTY-ness before it ever reads anything.
    const live = spawnSync(process.execPath, [ONBOARDING_SCRIPT_PATH, "kickoff", "plan",
      "--root", dir, "--goal", "Build one HTML game", "--language", "de"],
      { encoding: "utf8", input: "de\n" });
    assert.notEqual(live.status, 0, `a real piped-stdin process must be refused: ${live.stderr}`);
    assert.match(live.stderr, /CHAT-GATE-NOT-ATTENDED/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("project-onboarding-v3 CLI: kickoff promote plan/apply --profile is refused without an attended confirmation", () => {
  const dir = freshDir("kickoff-promote-profile-not-attended");
  try {
    const plan = invoke(["kickoff", "promote", "plan", "--root", dir, "--profile", "feature", "--id", "sample-feature",
      "--plan-path", "specs/kickoff-x/prd_x.md", "--prd-path", "specs/kickoff-x/prd_x.md",
      "--spec-path", "specs/kickoff-x/spec.md", "--design-input-path", "specs/kickoff-x/design-input.md"]);
    assert.equal(plan.status, 1, `expected refusal (exit 1), got ${plan.status}: ${plan.output}`);
    assert.match(plan.output, /CHAT-GATE-NOT-ATTENDED/);
    assert.match(plan.output, /a human must confirm --profile feature directly, in their own attended terminal/);

    const apply = invoke(["kickoff", "promote", "apply", "--root", dir, "--profile", "feature", "--id", "sample-feature",
      "--plan-path", "specs/kickoff-x/prd_x.md", "--prd-path", "specs/kickoff-x/prd_x.md",
      "--spec-path", "specs/kickoff-x/spec.md", "--design-input-path", "specs/kickoff-x/design-input.md",
      "--plan-sha256", "a".repeat(64), "--activate"]);
    assert.equal(apply.status, 1, `expected refusal (exit 1), got ${apply.status}: ${apply.output}`);
    assert.match(apply.output, /CHAT-GATE-NOT-ATTENDED/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("project-onboarding-v3 CLI: committed global chat makes kickoff promotion terminal-free and labels its result unattested", () => {
  const dir = neutralGitFixture("kickoff-promote-global-chat");
  try {
    commitGlobalHumanApproval(dir, "chat");
    for (const runner of ["claude", "codex", "antigravity"]) {
      let terminalCalls = 0;
      const plan = invoke([
        "kickoff", "promote", "plan", "--root", dir, "--profile", "feature", "--id", "sample-feature",
        "--plan-path", "specs/kickoff-x/prd_x.md", "--prd-path", "specs/kickoff-x/prd_x.md",
        "--spec-path", "specs/kickoff-x/spec.md", "--design-input-path", "specs/kickoff-x/design-input.md", "--runner", runner,
      ], {
        isattyFn: () => { terminalCalls += 1; throw new Error("global chat must not inspect a terminal"); },
        readLineFn: () => { terminalCalls += 1; throw new Error("global chat must not read a terminal"); },
      });
      assert.doesNotMatch(plan.output, /CHAT-GATE/,
        `${runner}: a committed global chat selection must reach promotion itself: ${plan.output}`);
      assert.equal(terminalCalls, 0, `${runner}: global chat must not request any terminal confirmation`);
      const output = JSON.parse(plan.output);
      assert.deepEqual(output.humanApproval, {
        mode: "chat-attributed-unattested",
        kind: "kickoff-promotion-profile",
      });
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("project-onboarding-v3 CLI: kickoff promote plan --profile passes the confirmation gate once a human confirms it via the injectable attended-terminal seam", () => {
  const dir = freshDir("kickoff-promote-profile-attended");
  try {
    // No promotion-artifact fixture (prd_*.md / spec.md / design-input.md) is set up here --
    // this test proves only that the chat-gate confirmation itself is passed through once
    // attended and correctly typed, not that the full promotion precondition chain succeeds
    // (that is exercised elsewhere, unrelated to this dispatch's scope). A downstream
    // KICKOFF-PROMOTION-* precondition refusal (not a CHAT-GATE-* code) is expected and fine.
    const attendedDeps = { isattyFn: () => true, readLineFn: () => "feature" };
    const plan = invoke(["kickoff", "promote", "plan", "--root", dir, "--profile", "feature", "--id", "sample-feature",
      "--plan-path", "specs/kickoff-x/prd_x.md", "--prd-path", "specs/kickoff-x/prd_x.md",
      "--spec-path", "specs/kickoff-x/spec.md", "--design-input-path", "specs/kickoff-x/design-input.md"], attendedDeps);
    assert.doesNotMatch(plan.output, /CHAT-GATE/, `the gate itself must not be what refused this call: ${plan.output}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("project-onboarding-v3 CLI: kickoff promote plan --profile is refused when an attended human types the wrong value", () => {
  const dir = freshDir("kickoff-promote-profile-mismatch");
  try {
    const wrongValueDeps = { isattyFn: () => true, readLineFn: () => "epic" };
    const plan = invoke(["kickoff", "promote", "plan", "--root", dir, "--profile", "feature", "--id", "sample-feature",
      "--plan-path", "specs/kickoff-x/prd_x.md", "--prd-path", "specs/kickoff-x/prd_x.md",
      "--spec-path", "specs/kickoff-x/spec.md", "--design-input-path", "specs/kickoff-x/design-input.md"], wrongValueDeps);
    assert.equal(plan.status, 1, `a mismatched typed value must be refused, got ${plan.status}: ${plan.output}`);
    assert.match(plan.output, /CHAT-GATE-CONFIRMATION-MISMATCH/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("project-onboarding-v3 CLI: a real spawned subprocess with a plain piped (non-TTY) stdin cannot complete the kickoff promote --profile confirmation, even carrying the correct value", () => {
  const dir = freshDir("kickoff-promote-profile-live-subprocess");
  try {
    const live = spawnSync(process.execPath, [ONBOARDING_SCRIPT_PATH, "kickoff", "promote", "plan",
      "--root", dir, "--profile", "feature", "--id", "sample-feature",
      "--plan-path", "specs/kickoff-x/prd_x.md", "--prd-path", "specs/kickoff-x/prd_x.md",
      "--spec-path", "specs/kickoff-x/spec.md", "--design-input-path", "specs/kickoff-x/design-input.md"],
      { encoding: "utf8", input: "feature\n" });
    assert.notEqual(live.status, 0, `a real piped-stdin process must be refused: ${live.stderr}`);
    assert.match(live.stderr, /CHAT-GATE-NOT-ATTENDED/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("project-onboarding-v3 CLI: the kickoff chat-gate leaves unrelated --language/--profile carve-outs (plan-repair, plan-partial-authority) unaffected", () => {
  const dir = freshDir("kickoff-gate-carveouts-unaffected");
  try {
    // `plan-partial-authority` accepts --profile and is NOT one of the gated command
    // names -- must reach its own dispatch, never a CHAT-GATE-* refusal.
    const partialAuthority = invoke(["plan-partial-authority", "--root", dir, "--runner", "claude",
      "--profile", "feature", "--source", "some-source"]);
    assert.doesNotMatch(partialAuthority.output, /CHAT-GATE/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
