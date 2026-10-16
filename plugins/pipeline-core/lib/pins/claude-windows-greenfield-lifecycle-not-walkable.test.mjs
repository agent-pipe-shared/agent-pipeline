#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
//
// ALF-C-P19-05 / AC-127: pin for backlog item pipeline.claude-windows-greenfield-lifecycle-not-walkable.
//
//   V-9   covered: --answers-file route carries answers beyond the ~10 KB command-line limit.
//   V-12  covered: once consent holds a language, no later intake nextAction asks for one.
//   V-13  covered: the docs/state.md "## Next action" projection is re-rendered from live state.
//   V-10  NOT COVERED (interim): producer of the briefing-digest vs inline-briefing binding not located
//         within the dispatch tool budget; reported as unlocated, not faked.
//   two-approval happy path (reaches implementation and push) -- native: pending. It needs a live
//         interactive Claude/Windows session. A native run exercises
//         plugins/pipeline-core/lib/onboarding-continuity.mjs applyOnboardingIntakeGenerate and the
//         pipeline-state lifecycle commands end to end.
//
// Host limitation: no directory-mode or directory-symlink case is used here, so no case is skipped.
// (If one is ever added: skip with owner Coordinator, due 2026-10-19, Linux/WSL run, PO decision K7.)

import assert from "node:assert/strict";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test, before, after } from "node:test";
import { fileURLToPath } from "node:url";

import {
  applyProjectOnboardingLifecycleV4,
  applyProjectOnboardingV3,
  expectedPipelineScriptsRunnerAllowlistEntries,
  inspectProjectOnboardingV3,
  planProjectOnboardingLifecycleV4,
  planProjectOnboardingV3,
} from "../project-onboarding-v3.mjs";
import { nextActionSection, replaceNextActionSection, syncStateMdNextAction } from "../onboarding-continuity.mjs";
import { fakeDeps, fakeGit } from "../project-onboarding-v3.test.mjs";
import { main as onboardingCli } from "../../scripts/project-onboarding-v3.mjs";

const RUNNER = "claude";
const CONSENT_LANGUAGE = "de";
const REPO_SCRATCH = fileURLToPath(new URL("../../../../scratch/", import.meta.url));

function scratchDir(name) {
  const dir = join(REPO_SCRATCH, `${name}-${process.pid}`);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  return dir;
}

function checkV9(pendingAction, afterAnswersAction) {
  const file = pendingAction.fileApplyAction;
  assert.ok(Array.isArray(file?.argv) && file.argv.includes("--answers-file") && !file.argv.includes("--answers-json"));
  assert.match(file.argv[file.argv.indexOf("--answers-file") + 1], /^scratch\/[A-Za-z0-9._-]+$/u);
  assert.equal(afterAnswersAction?.argv?.[1], "intake-generate-plan");
}

function checkV12(action) {
  const text = JSON.stringify(action);
  assert.equal(/"name":"language"/u.test(text), false);
  const walk = (n) => {
    if (Array.isArray(n)) {
      const at = n.indexOf("--language");
      if (at !== -1) assert.equal(n[at + 1], CONSENT_LANGUAGE);
      n.forEach(walk);
    } else if (n && typeof n === "object") Object.values(n).forEach(walk);
  };
  walk(JSON.parse(text));
}

describe("V-9 / V-12 intake lifecycle on the claude runner", () => {
  let path = null;
  let collecting = null;
  let pending = null;
  let afterAnswers = null;

  before(() => {
    path = scratchDir("alf-c-p19-05-intake with spaces");
    const git = (command, args, options) => {
      if (command === "git" && args[0] === "config" && args[1] === "--get") {
        return { status: 0, stdout: args[2] === "user.name" ? "Fixture PO\n" : "fixture-po@example.invalid\n", stderr: "" };
      }
      return fakeGit(command, args, options);
    };
    const deps = { ...fakeDeps, spawnSync: git, spawn: git };
    const cli = (args) => {
      let output = ""; let stderr = "";
      const code = onboardingCli(args, { deps, write: (c) => { output += c; }, writeError: (c) => { stderr += c; } });
      return { code, output, stderr };
    };
    const inspect = () => JSON.parse(JSON.stringify(inspectProjectOnboardingV3({ runner: RUNNER, rootDir: path, deps })));
    const portable = planProjectOnboardingV3({ rootDir: path, deps: fakeDeps, runner: RUNNER });
    assert.equal(applyProjectOnboardingV3(portable, { rootDir: path, activate: true, deps: fakeDeps }).status, "applied");
    const runtime = planProjectOnboardingLifecycleV4({ rootDir: path, deps: fakeDeps, operation: "runtime", runner: RUNNER });
    const sha = runtime.nextAction.argv[runtime.nextAction.argv.indexOf("--plan-sha256") + 1];
    applyProjectOnboardingLifecycleV4({ rootDir: path, deps: fakeDeps, operation: "runtime", planSha256: sha, activate: true, runner: RUNNER });
    writeFileSync(join(path, ".claude", "settings.local.json"),
      `${JSON.stringify({ permissions: { allow: expectedPipelineScriptsRunnerAllowlistEntries() } }, null, 2)}\n`);
    assert.equal(cli(["intake-consent-apply", "--root", path, "--granted", "--language", CONSENT_LANGUAGE,
      "--profile", "feature", "--activate", "--runner", RUNNER]).code, 0);
    collecting = inspect();
    assert.equal(cli(["intake-capture-apply", "--root", path, "--text", "Build a local keyboard game.", "--activate", "--runner", RUNNER]).code, 0);
    pending = inspect();
    // V-9: answers far beyond the ~10 KB inline limit travel through --answers-file.
    mkdirSync(join(path, "scratch"), { recursive: true });
    const big = JSON.stringify([{ question: "What is the primary goal?", answer: "Ship safely. ".repeat(2000) }]);
    assert.ok(big.length > 20_000);
    writeFileSync(join(path, "scratch", "answers.json"), big);
    const applied = cli(["intake-design-questions-apply", "--root", path, "--answers-file", "scratch/answers.json", "--activate", "--runner", RUNNER]);
    assert.equal(applied.code, 0, `answers-file apply exited ${applied.code}: ${applied.stderr}${applied.output}`);
    afterAnswers = inspect();
  });
  after(() => { if (path !== null) rmSync(path, { recursive: true, force: true }); });

  test("V-9 the pending nextAction offers a fileApplyAction on a scratch/ path and the large file is accepted", () => {
    checkV9(pending.nextAction, afterAnswers.nextAction);
  });

  test("V-12 no nextAction asks for a language after consent supplied one", () => {
    for (const action of [collecting.nextAction, pending.nextAction, afterAnswers.nextAction]) checkV12(action);
  });

  test("V-9 RED proof: a mirror that offers only inline --answers-json fails the same check", () => {
    const mirrorPending = { argv: ["x", "intake-design-questions-apply", "--answers-json", "[]"] };
    assert.throws(() => checkV9(mirrorPending, afterAnswers.nextAction));
  });

  test("V-12 RED proof: a mirror that re-asks the language or carries another one fails the same check", () => {
    assert.throws(() => checkV12({ fields: [{ name: "language" }] }));
    assert.throws(() => checkV12({ argv: ["x", "--language", "en"] }));
  });
});

describe("V-13 docs/state.md next-action projection tracks live state", () => {
  const STALE = ["# Project state", "", "## Goal", "", "Keep me.", "", "## Next action", "", "stale design text", "", "## Tail", "", "Keep tail.", ""].join("\n");

  test("replaceNextActionSection swaps only that section and fails closed without the heading", () => {
    const section = nextActionSection({});
    const out = replaceNextActionSection(STALE, section);
    assert.ok(out.includes("Keep me.") && out.includes("Keep tail.") && !out.includes("stale design text"));
    assert.equal(replaceNextActionSection("# no heading\n", section), null);
  });

  test("V-13 RED proof: a mirror that replaces the whole file instead of only the section fails the same check", () => {
    const mirror = (_markdown, section) => section; // guarded behavior removed: no preservation of other sections
    const out = mirror(STALE, nextActionSection({}));
    assert.throws(() => assert.ok(out.includes("Keep me.") && out.includes("Keep tail.")));
    const staleKept = (markdown) => markdown; // guarded behavior removed: no re-render at all
    assert.throws(() => assert.ok(!staleKept(STALE).includes("stale design text")));
  });

  test("syncStateMdNextAction rewrites a stale docs/state.md in place", () => {
    const dir = scratchDir("alf-c-p19-05-v13");
    try {
      mkdirSync(join(dir, "docs"), { recursive: true });
      writeFileSync(join(dir, "docs", "state.md"), STALE);
      syncStateMdNextAction(dir, {});
      const after = readFileSync(join(dir, "docs", "state.md"), "utf8");
      assert.ok(!after.includes("stale design text"));
      assert.ok(after.includes("Keep me.") && after.includes("Keep tail."));
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});

// V-10 stays an explicit RED todo: single-file searches of guard-dispatch.mjs, onboarding-continuity.mjs and
// pipeline-state.mjs found no producer that derives a continuity route digest from a briefing. The binding
// belongs where the intake/dispatch nextAction is built (onboarding-continuity.mjs, the dispatch nextAction
// builder) and must hash the inline briefing the guard (hooks/guard-dispatch.mjs) receives, not a briefing file.
test("V-10 continuity route digest equals the digest of the inline briefing actually sent", {
  todo: "RED: producer not located (no briefing-digest code in guard-dispatch.mjs, onboarding-continuity.mjs, pipeline-state.mjs); needs a decision on where the binding lives",
}, () => {
  assert.fail("V-10: no function derives the route digest from the inline briefing");
});
test("two-approval happy path to implementation and push", { skip: "native: pending (live interactive Claude/Windows session)" }, () => {});
