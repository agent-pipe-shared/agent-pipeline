#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
//
// R5 (AC-30 / R5-3), published-action and language half: committed pins for cases 12, 14 and 15 of
// the answers-file design note. The CLI half (cases 8-11 and 16) lives in the argv-closure test of
// the scripts directory; the reader half (cases 1-7) belongs to the reader's own test.
//
//   case 12  RED   the design-questions nextAction keeps applyAction / answersJson unchanged and ADDS a
//                  sibling fileApplyAction (--answers-file on a scratch path, no --answers-json), and
//                  the guidance names the file route.
//   case 14  NOT PINNED (first half): the nextAction already pairs "language" with de today, so no
//                  RED assertion of the briefed shape exists (see the note above the PRD pin).
//   case 14  green regression pin (second half): the generated PRD carries the po-language comment.
//   case 15  green regression pin: once consent holds a language, no emitted intake-path nextAction
//                  (collecting, design-questions-pending, ready-to-generate, generated) ASKS for one,
//                  neither as an input named "language" nor as a --language argv element whose value
//                  is anything but the confirmed one.
//
// Two scope refinements against the literal briefing, both forced by what the unchanged code emits
// and both reported for ratification: (1) the design-course nextAction (and, in the collecting
// state, an onboarding-init argv) already carries `--language <confirmed value>` as a concrete argv
// element, so a regex over the whole nextAction JSON is satisfied today and cannot be RED; case 14
// therefore reads the prose outside every argv array, as the design note words it ("states the
// confirmed language in its guidance"). (2) For the same reason a blanket "no --language in any
// argv" is red today in the collecting state; case 15 therefore treats only an unfilled or foreign
// value (a placeholder) as asking.
//
// This is a NEW file on purpose: the sharded onboarding registry asserts a fixed case count, so no
// test is added there. It only reuses that file's exported fixture helpers (importing it registers
// its cases without running them; it runs them only when invoked directly). Fixtures are temp dirs
// with the registry's fake dependency set: never the real repository State, home or git state.

import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test, { after, before } from "node:test";
import { fileURLToPath } from "node:url";

import {
  applyProjectOnboardingLifecycleV4,
  applyProjectOnboardingV3,
  expectedPipelineScriptsRunnerAllowlistEntries,
  inspectProjectOnboardingV3,
  planProjectOnboardingLifecycleV4,
  planProjectOnboardingV3,
} from "./project-onboarding-v3.mjs";
import { applyOnboardingIntakeGenerate, planOnboardingIntakeGenerate } from "./onboarding-continuity.mjs";
import { dispose, fakeDeps, fakeGit, root } from "./project-onboarding-v3.test.mjs";
import { main as onboardingCli } from "../scripts/project-onboarding-v3.mjs";

const ONBOARDING_SCRIPT = fileURLToPath(new URL("../scripts/project-onboarding-v3.mjs", import.meta.url));
const RUNNER = "claude";
const CONSENT_LANGUAGE = "de";
const ANSWERS_PLACEHOLDER = "<PO_INTAKE_DESIGN_ANSWERS_JSON>";

// One lifecycle walk shared by every pin below: portable seed -> runtime init -> consent with
// --language -> capture -> inspect (design-questions-pending) -> inline answers -> inspect
// (ready-to-generate) -> generate -> inspect (generated). Each inspection is stored as plain JSON.
let fixture = null;

function fixtureStep(condition, message) {
  assert.ok(condition, `FIXTURE SETUP (not a contract failure): ${message}`);
}

function buildIntakeLifecycle() {
  const path = root();
  try {
    const configuredGit = (command, args, options) => {
      if (command === "git" && args[0] === "config" && args[1] === "--get") {
        return { status: 0, stdout: args[2] === "user.name" ? "Fixture PO\n" : "fixture-po@example.invalid\n", stderr: "" };
      }
      return fakeGit(command, args, options);
    };
    const deps = { ...fakeDeps, spawnSync: configuredGit, spawn: configuredGit };
    const cli = (args) => {
      let output = "";
      let stderr = "";
      const code = onboardingCli(args, {
        deps,
        write: (chunk) => { output += chunk; },
        writeError: (chunk) => { stderr += chunk; },
      });
      return { code, output, stderr };
    };
    const inspect = () => JSON.parse(JSON.stringify(inspectProjectOnboardingV3({ runner: RUNNER, rootDir: path, deps })));

    const portable = planProjectOnboardingV3({ rootDir: path, deps: fakeDeps, runner: RUNNER });
    fixtureStep(applyProjectOnboardingV3(portable, { rootDir: path, activate: true, deps: fakeDeps }).status === "applied",
      "the portable seed did not apply");
    const runtime = planProjectOnboardingLifecycleV4({ rootDir: path, deps: fakeDeps, operation: "runtime", runner: RUNNER });
    const runtimeSha = runtime.nextAction.argv[runtime.nextAction.argv.indexOf("--plan-sha256") + 1];
    const initialized = applyProjectOnboardingLifecycleV4({
      rootDir: path, deps: fakeDeps, operation: "runtime", planSha256: runtimeSha, activate: true, runner: RUNNER,
    });
    fixtureStep(initialized.status === "intake-required", `runtime init settled in ${initialized.status}, not intake-required`);
    writeFileSync(join(path, ".claude", "settings.local.json"), `${JSON.stringify({
      permissions: { allow: expectedPipelineScriptsRunnerAllowlistEntries() },
    }, null, 2)}\n`);

    const consent = cli(["intake-consent-apply", "--root", path, "--granted", "--language", CONSENT_LANGUAGE,
      "--profile", "feature", "--activate", "--runner", RUNNER]);
    fixtureStep(consent.code === 0, `consent with --language ${CONSENT_LANGUAGE} exited ${consent.code}: ${consent.stderr}${consent.output}`);
    const collecting = inspect();
    // The Claude runner collects its first material through a chat-turn reference input (not `text`).
    fixtureStep(collecting.status === "intake-required" && collecting.nextAction?.kind === "collect-input",
      `post-consent state is ${collecting.status}/${collecting.nextAction?.kind}, not intake-required/collect-input`);

    const capture = cli(["intake-capture-apply", "--root", path, "--text", "Build a local keyboard game.", "--activate", "--runner", RUNNER]);
    fixtureStep(capture.code === 0, `capture exited ${capture.code}: ${capture.stderr}${capture.output}`);
    const pending = inspect();
    fixtureStep(pending.status === "intake-design-questions-required" && pending.nextAction?.kind === "collect-input",
      `post-capture state is ${pending.status}/${pending.nextAction?.kind}, not intake-design-questions-required/collect-input`);

    const answers = JSON.stringify([{ question: "What is the primary goal?", answer: "Ship safely." }]);
    const answered = cli(["intake-design-questions-apply", "--root", path, "--answers-json", answers, "--activate", "--runner", RUNNER]);
    fixtureStep(answered.code === 0, `inline answers exited ${answered.code}: ${answered.stderr}${answered.output}`);
    const ready = inspect();
    fixtureStep(ready.nextAction?.kind === "command" && ready.nextAction.argv?.[1] === "intake-generate-plan",
      `post-answers nextAction is ${ready.nextAction?.kind}/${ready.nextAction?.argv?.[1]}, not command/intake-generate-plan`);

    const generatePlan = planOnboardingIntakeGenerate({ rootDir: path, repositoryCapability: "local", spawn: fakeGit });
    const generated = applyOnboardingIntakeGenerate({
      rootDir: path, repositoryCapability: "local", expectedPlanSha256: generatePlan.planSha256, activate: true,
      deps: { spawn: fakeGit, prepareBoundDesignLineEndings: () => ({ ok: true, code: "FIXTURE-LINE-ENDINGS-READY" }) },
    });
    fixtureStep(generated.checkpoint?.transactionState === "generated", "generate did not reach transactionState generated");
    const afterGenerate = inspect();
    fixtureStep(afterGenerate.status === "bootstrap-binding-required", `post-generate state is ${afterGenerate.status}`);

    const prdPath = generated.targets.prd.path;
    return {
      path,
      collecting,
      pending,
      ready,
      generated: afterGenerate,
      prdPath,
      prdText: readFileSync(join(path, prdPath), "utf8"),
    };
  } catch (error) {
    dispose(path);
    throw error;
  }
}

before(() => { fixture = buildIntakeLifecycle(); });
after(() => { if (fixture !== null) dispose(fixture.path); });

// Every string in a value that is not inside an `argv` array (prose: guidance, messages, labels).
function proseStrings(value, key = null, out = []) {
  if (key === "argv") return out;
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) for (const entry of value) proseStrings(entry, null, out);
  else if (value !== null && typeof value === "object") for (const [name, entry] of Object.entries(value)) proseStrings(entry, name, out);
  return out;
}

// Every `{name: "language"}` object, and every array carrying "--language" with a value other than
// the confirmed one (an unfilled placeholder is how an action asks), anywhere in a value.
function languageSurface(value) {
  const surface = { inputs: [], argvs: [] };
  const visit = (node) => {
    if (Array.isArray(node)) {
      const at = node.indexOf("--language");
      if (at !== -1 && node[at + 1] !== CONSENT_LANGUAGE) surface.argvs.push(node);
      for (const entry of node) visit(entry);
    } else if (node !== null && typeof node === "object") {
      if (node.name === "language") surface.inputs.push(node);
      for (const entry of Object.values(node)) visit(entry);
    }
  };
  visit(value);
  return surface;
}

// A whole-token de/en (not part of a word, not hyphen-joined) within 80 characters of "language".
const LANGUAGE_CODE_TOKEN = "(?<![\\w-])(de|en)(?![\\w-])";
const STATED_LANGUAGE = new RegExp(
  `\\b[Ll]anguage\\b[\\s\\S]{0,80}?${LANGUAGE_CODE_TOKEN}|${LANGUAGE_CODE_TOKEN}[\\s\\S]{0,80}?\\b[Ll]anguage\\b`, "gu");

test("R5-12 the design-questions nextAction keeps applyAction and answersJson unchanged and adds a sibling fileApplyAction on a scratch path", () => {
  const action = fixture.pending.nextAction;
  // Stable pins first: these pass today and must stay unchanged (published consumers depend on them).
  assert.equal(action.kind, "collect-input");
  assert.equal(action.input.name, "answersJson");
  assert.equal(action.input.maxBytes, 65_536);
  assert.deepEqual(action.applyAction.argv, [
    ONBOARDING_SCRIPT, "intake-design-questions-apply", "--root", fixture.path,
    "--answers-json", ANSWERS_PLACEHOLDER, "--activate", "--runner", RUNNER,
  ]);
  // The contract: a sibling file route, added without touching the inline route.
  const file = action.fileApplyAction;
  assert.ok(file !== null && typeof file === "object" && Array.isArray(file.argv),
    "R5-12 contract: the design-questions nextAction must carry a sibling fileApplyAction with an argv");
  assert.equal(file.argv.includes("--answers-json"), false, "R5-12 contract: fileApplyAction must not carry --answers-json");
  const at = file.argv.indexOf("--answers-file");
  assert.ok(at > 0, "R5-12 contract: fileApplyAction must carry --answers-file");
  assert.match(file.argv[at + 1], /^scratch\/[A-Za-z0-9._-]+$/u,
    "R5-12 contract: --answers-file names a repository-relative scratch/ path");
  assert.deepEqual(file.argv, [
    ONBOARDING_SCRIPT, "intake-design-questions-apply", "--root", fixture.path,
    "--answers-file", file.argv[at + 1], "--activate", "--runner", RUNNER,
  ]);
});

test("R5-12 the design-questions guidance names the file route", () => {
  const prose = proseStrings([fixture.pending.nextAction, fixture.pending.diagnostics]);
  assert.ok(prose.some((text) => /--answers-file|answers[- ]file/iu.test(text)),
    "R5-12 contract: guidance (outside argv) must tell the agent to use the --answers-file route for answers with a newline or beyond a few KB");
});

// R5-14 first half (the design-course nextAction STATES the confirmed language) is deliberately NOT
// pinned here: against the unchanged code a whole-token de/en near "language" is already present in
// the nextAction, over its JSON and over its prose outside argv alike, so no assertion of that
// shape can be RED. It needs a probe of the actual nextAction, then a sharper contract (see the
// R5-T0c report). The case-15 refinement above and the PRD pin below are unaffected.

test("R5-14 the generated PRD under specs/ carries the po-language comment of the consented language (regression pin)", () => {
  assert.match(fixture.prdPath, /^specs\//u, `the generated PRD is expected under specs/, got ${fixture.prdPath}`);
  assert.ok(fixture.prdText.includes(`<!-- po-language: ${CONSENT_LANGUAGE} -->`),
    `the generated PRD must carry <!-- po-language: ${CONSENT_LANGUAGE} -->`);
});

test("R5-15 once consent holds a language, no intake-path nextAction asks for one (collecting, pending, ready, generated; regression pin)", () => {
  for (const state of ["collecting", "pending", "ready", "generated"]) {
    const action = fixture[state].nextAction;
    assert.ok(action !== null && typeof action === "object" && JSON.stringify(action).length > 2, `${state}: expected a populated nextAction`);
    const surface = languageSurface(action);
    assert.deepEqual(surface.inputs, [], `${state}: no input named "language" may be asked after consent`);
    assert.deepEqual(surface.argvs, [], `${state}: no returned argv may ask for a language (a --language value other than the confirmed one) after consent`);
  }
});
