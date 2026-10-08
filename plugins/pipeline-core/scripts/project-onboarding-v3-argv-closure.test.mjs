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
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { main as onboardingCli } from "./project-onboarding-v3.mjs";
import { captureClaudeIntakePrompt } from "../lib/claude-intake-prompt-capture.mjs";
import { captureClaudeInitialPromptPointer } from "../lib/claude-initial-prompt-pointer.mjs";
import { applyOnboardingIntakeConsent, readOnboardingIntakeCheckpoint } from "../lib/onboarding-continuity.mjs";

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

// ---------------------------------------------------------------------------------------------
// R5 (AC-30 / R5-3): the `--answers-file` route of the two design-question commands. These are
// the committed RED pins of the answers-file design note's cases 8-11 and 16 (case 17 is a plain
// run of the consumer-safe-paths check); fix slices F2-F7 turn them green. Cases that are marked
// "regression pin" pass today on purpose and must stay green. Fixtures are temp repos only.
import { relative } from "node:path";
import { MUTATING_ONBOARDING_ARGV_SHAPES, automatedMutatingApplyArgv, mutatingApplyCommandHint } from "../lib/onboarding-argv-shapes.mjs";

const DESIGN_COMMANDS = ["intake-design-questions-apply", "intake-design-questions-replace"];

function designQuestionsPendingFixture(prefix) {
  const dir = neutralGitFixture(prefix);
  const consent = invoke(["intake-consent-apply", "--root", dir, "--granted",
    "--git-author-name", "Answers Fixture", "--git-author-email", "answers@example.invalid",
    "--language", "en", "--profile", "feature", "--activate", "--runner", "claude"]);
  assert.equal(consent.status, 0, consent.output);
  const capture = invoke(["intake-capture-apply", "--root", dir, "--text", "Build a local keyboard game.",
    "--activate", "--runner", "claude"]);
  assert.equal(capture.status, 0, capture.output);
  mkdirSync(join(dir, "scratch"), { recursive: true });
  return dir;
}

function checkpointBytes(dir) {
  return readFileSync(readOnboardingIntakeCheckpoint({ rootDir: dir }).paths.checkpoint);
}

function answerPairs(result) {
  return result.checkpoint.designQuestions.map(({ question, answer }) => ({ question, answer }));
}

function smallAnswers(answer) {
  return Buffer.from(JSON.stringify([{ question: "What is the goal?", answer }]), "utf8");
}

// A pretty-printed, multi-line, non-ASCII answers file of EXACTLY `targetBytes` raw bytes (sized by
// Buffer.byteLength, never string length), in the requested line-ending flavour.
function buildAnswersFile(eol, targetBytes) {
  const entries = [
    { question: "Welches Ziel hat das Projekt?", answer: "Eine kleine Tastatur-Spielwelt für Größe, Übung und 日本語 — mit Umlauten." },
    { question: "How is it verified?", answer: "Run the repository verify script.\nSecond line of the same answer." },
    { question: "Padding", answer: "p" },
  ];
  const render = (padLength) => {
    entries[2].answer = "p".repeat(padLength);
    return Buffer.from(`${JSON.stringify(entries, null, 2).replace(/\n/gu, eol)}${eol}`, "utf8");
  };
  const base = render(1);
  const bytes = render(1 + targetBytes - base.length);
  assert.equal(bytes.length, targetBytes);
  return { bytes, entries: structuredClone(entries) };
}

for (const command of DESIGN_COMMANDS) {
  test(`R5-8 ${command} accepts --answers-file (a valid in-root file applies, exit 0)`, () => {
    const dir = designQuestionsPendingFixture(`r5-8-accept-${command}`);
    try {
      writeFileSync(join(dir, "scratch", "a.json"), smallAnswers("Ship it."));
      const result = invoke([command, "--root", dir, "--answers-file", "scratch/a.json", "--activate", "--runner", "claude"]);
      assert.doesNotMatch(result.output, /unknown argument/u, result.output);
      assert.equal(result.status, 0, result.output);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  test(`R5-8 ${command} refuses --answers-json together with --answers-file as INTAKE-DESIGN-ANSWERS-AMBIGUOUS`, () => {
    const dir = neutralGitFixture(`r5-8-ambiguous-${command}`);
    try {
      const result = invoke([command, "--root", dir, "--answers-json", JSON.stringify([{ question: "Q?", answer: "A" }]),
        "--answers-file", "scratch/does-not-exist.json", "--activate", "--runner", "claude"]);
      assert.equal(result.status, 2, result.output);
      assert.match(result.output, /INTAKE-DESIGN-ANSWERS-AMBIGUOUS/u, result.output);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  test(`R5-8 ${command} refuses --answers-file-sha256 without --answers-file as INTAKE-ANSWERS-FILE-DIGEST-WITHOUT-FILE`, () => {
    const dir = neutralGitFixture(`r5-8-digest-alone-${command}`);
    try {
      const result = invoke([command, "--root", dir, "--answers-json", JSON.stringify([{ question: "Q?", answer: "A" }]),
        "--answers-file-sha256", "a".repeat(64), "--activate", "--runner", "claude"]);
      assert.equal(result.status, 2, result.output);
      assert.match(result.output, /INTAKE-ANSWERS-FILE-DIGEST-WITHOUT-FILE/u, result.output);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  test(`R5-8 ${command} rejects an empty or flag-shaped --answers-file value and a non-hex digest at parse time`, () => {
    const dir = neutralGitFixture(`r5-8-bad-values-${command}`);
    try {
      // Message prefixes mirror the sibling `--text-file requires one file path` parse refusals.
      for (const argv of [
        [command, "--root", dir, "--answers-file", "", "--activate"],
        [command, "--root", dir, "--answers-file", "--activate"],
      ]) {
        const result = invoke(argv);
        assert.equal(result.status, 2, result.output);
        assert.match(result.output, /--answers-file requires/u, result.output);
      }
      const digest = invoke([command, "--root", dir, "--answers-file", "scratch/a.json", "--answers-file-sha256", "NOT-HEX", "--activate"]);
      assert.equal(digest.status, 2, digest.output);
      assert.match(digest.output, /--answers-file-sha256 requires/u, digest.output);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  test(`R5-8 ${command} with neither --answers-json nor --answers-file is a usage error naming both options`, () => {
    const dir = neutralGitFixture(`r5-8-neither-${command}`);
    try {
      const result = invoke([command, "--root", dir, "--activate", "--runner", "claude"]);
      assert.equal(result.status, 2, result.output);
      assert.match(result.output, /--answers-json/u, result.output);
      assert.match(result.output, /--answers-file/u, result.output);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
}

test("R5-8 the usage text lists --answers-file and --answers-file-sha256 for the design-question commands", () => {
  const help = invoke(["--help"]);
  assert.match(help.output, /--answers-file\b/u, help.output);
  assert.match(help.output, /--answers-file-sha256/u, help.output);
});

test("R5-9 both design-question shapes carry the exactly-one-of answers pair and the optional digest", () => {
  for (const name of DESIGN_COMMANDS) {
    const shape = MUTATING_ONBOARDING_ARGV_SHAPES[name];
    assert.deepEqual([...shape.required], ["--activate"], name);
    assert.deepEqual([...shape.requiredValue], ["--root"], name);
    assert.deepEqual([...shape.requiredValueOneOf], ["--answers-json", "--answers-file"], name);
    assert.deepEqual([...shape.optionalValue], ["--answers-file-sha256"], name);
  }
});

test("R5-9 the shared emission and hint helpers carry the file route, and refuse both or neither of the pair", () => {
  const digest = "a".repeat(64);
  for (const name of DESIGN_COMMANDS) {
    assert.deepEqual(
      automatedMutatingApplyArgv(name, "ROOT", { "--answers-file": "scratch/a.json", "--answers-file-sha256": digest }),
      [name, "--root", "ROOT", "--answers-file", "scratch/a.json", "--answers-file-sha256", digest, "--activate"], name);
    assert.throws(() => automatedMutatingApplyArgv(name, "ROOT", {
      "--answers-json": "[]", "--answers-file": "scratch/a.json",
    }), TypeError, `${name}: both of the pair`);
    assert.throws(() => automatedMutatingApplyArgv(name, "ROOT", {}), TypeError, `${name}: neither of the pair`);
    const hint = mutatingApplyCommandHint(name);
    assert.match(hint, /--answers-json <answers-json> \| --answers-file <answers-file>/u, hint);
    assert.match(hint, /\[--answers-file-sha256 <answers-file-sha256>\]/u, hint);
  }
});

// Regression pin (green today, on purpose): the guard builds its flag SET from the shape table but
// keeps the per-flag VALUE validators in a separate literal map, so a flag added to the table
// without a validator entry would be admitted or refused by accident. The map is a function-local
// constant (not exported), so this reads the guard source: every flag any shape names must have a
// `"--flag":` entry. It forces the order validators first (F3), shape table second (F2).
test("R5-9 every flag named by any mutating onboarding shape has an entry in the guard's validator map", () => {
  const source = readFileSync(fileURLToPath(new URL("../lib/guard/sanctioned-args-onboarding.mjs", import.meta.url)), "utf8");
  const start = source.indexOf("const MUTATING_ONBOARDING_FLAG_VALIDATORS = {");
  assert.notEqual(start, -1, "the validator map declaration moved; update this consistency pin");
  const block = source.slice(start, source.indexOf("\n  };", start));
  for (const [name, shape] of Object.entries(MUTATING_ONBOARDING_ARGV_SHAPES)) {
    for (const flag of [...shape.requiredValue, ...(shape.requiredValueOneOf ?? []), ...shape.optionalValue]) {
      assert.ok(block.includes(`"${flag}":`), `${name}: ${flag} has no validator entry in the guard map`);
    }
  }
});

for (const [label, eol] of [["LF", "\n"], ["CRLF", "\r\n"]]) {
  test(`R5-10 a 30,720-byte multi-line non-ASCII ${label} answers file applies via --answers-file and matches the inline route`, () => {
    const dir = designQuestionsPendingFixture(`r5-10-${label}`);
    const inlineDir = designQuestionsPendingFixture(`r5-10-inline-${label}`);
    try {
      const { bytes, entries } = buildAnswersFile(eol, 30_720);
      writeFileSync(join(dir, "scratch", "answers.json"), bytes);
      const digest = createHash("sha256").update(bytes).digest("hex");
      const applied = invoke(["intake-design-questions-apply", "--root", dir, "--answers-file", "scratch/answers.json",
        "--answers-file-sha256", digest, "--activate", "--runner", "claude"]);
      assert.equal(applied.status, 0, applied.output);
      const result = JSON.parse(applied.output);
      assert.deepEqual(result.answersFile, { sha256: digest, byteLength: 30_720 });
      assert.equal(result.checkpoint.transactionState, "ready-to-generate");
      assert.deepEqual(answerPairs(result), entries);
      const inline = invoke(["intake-design-questions-apply", "--root", inlineDir, "--answers-json", JSON.stringify(entries),
        "--activate", "--runner", "claude"]);
      assert.equal(inline.status, 0, inline.output);
      assert.deepEqual(answerPairs(JSON.parse(inline.output)), answerPairs(result),
        "the file route records exactly what the inline route records");
    } finally {
      rmSync(dir, { recursive: true, force: true });
      rmSync(inlineDir, { recursive: true, force: true });
    }
  });
}

test("R5-10 -replace over --answers-file follows the inline rules: a different second round needs replace, replace is applied", () => {
  const dir = designQuestionsPendingFixture("r5-10-replace");
  try {
    writeFileSync(join(dir, "scratch", "a.json"), smallAnswers("First round."));
    writeFileSync(join(dir, "scratch", "b.json"), smallAnswers("Corrected round."));
    const first = invoke(["intake-design-questions-apply", "--root", dir, "--answers-file", "scratch/a.json", "--activate", "--runner", "claude"]);
    assert.equal(first.status, 0, first.output);
    const different = invoke(["intake-design-questions-apply", "--root", dir, "--answers-file", "scratch/b.json", "--activate", "--runner", "claude"]);
    assert.equal(different.status, 2, different.output);
    assert.match(different.output, /INTAKE-DESIGN-QUESTIONS-ALREADY-ANSWERED/u, different.output);
    const replaced = invoke(["intake-design-questions-replace", "--root", dir, "--answers-file", "scratch/b.json", "--activate", "--runner", "claude"]);
    assert.equal(replaced.status, 0, replaced.output);
    assert.deepEqual(answerPairs(JSON.parse(replaced.output)), [{ question: "What is the goal?", answer: "Corrected round." }]);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("R5-11 every answers-file refusal through the real CLI exits non-zero with its typed code and leaves the checkpoint bytes unchanged", () => {
  const dir = designQuestionsPendingFixture("r5-11");
  const outsideDir = mkdtempSync(join(tmpdir(), "project-onboarding-argv-r5-11-outside-"));
  try {
    mkdirSync(join(dir, "scratch", "a-directory"));
    writeFileSync(join(dir, "scratch", "nul-content.json"), Buffer.concat([
      Buffer.from('[{"question":"q","answer":"a'), Buffer.from([0]), Buffer.from('b"}]')]));
    writeFileSync(join(dir, "scratch", "bad-utf8.json"), Buffer.from([0x5b, 0xff, 0x5d]));
    writeFileSync(join(dir, "scratch", "too-large.json"), Buffer.alloc(65_537, 0x20));
    writeFileSync(join(dir, "scratch", "valid.json"), smallAnswers("Ship it."));
    const outsideFile = join(outsideDir, "outside.json");
    writeFileSync(outsideFile, smallAnswers("Outside the root."));
    const cases = [
      ["INTAKE-ANSWERS-FILE-MISSING", ["--answers-file", "scratch/does-not-exist.json"]],
      ["INTAKE-ANSWERS-FILE-UNREADABLE", ["--answers-file", "scratch/a-directory"]],
      ["INTAKE-ANSWERS-FILE-OUTSIDE-ROOT", ["--answers-file", outsideFile]],
      ["INTAKE-ANSWERS-FILE-OUTSIDE-ROOT", ["--answers-file", relative(dir, outsideFile)]],
      ["INTAKE-ANSWERS-FILE-TOO-LARGE", ["--answers-file", "scratch/too-large.json"]],
      ["INTAKE-ANSWERS-FILE-INVALID-UTF8", ["--answers-file", "scratch/bad-utf8.json"]],
      ["INTAKE-ANSWERS-FILE-INVALID", ["--answers-file", "scratch/nul-content.json"]],
      ["INTAKE-ANSWERS-FILE-DIGEST-MISMATCH", ["--answers-file", "scratch/valid.json", "--answers-file-sha256", "0".repeat(64)]],
    ];
    const before = checkpointBytes(dir);
    for (const [code, flags] of cases) {
      const result = invoke(["intake-design-questions-apply", "--root", dir, ...flags, "--activate", "--runner", "claude"]);
      assert.equal(result.status, 2, `${code}: ${result.output}`);
      assert.match(result.output, new RegExp(code, "u"), result.output);
      assert.deepEqual(checkpointBytes(dir), before, `${code}: the checkpoint must stay byte-identical`);
    }
  } finally {
    rmSync(outsideDir, { recursive: true, force: true });
    rmSync(dir, { recursive: true, force: true });
  }
});

test("R5-11 malformed JSON in the file is the apply function's own refusal, identical to the inline route", () => {
  const dir = designQuestionsPendingFixture("r5-11-malformed");
  try {
    writeFileSync(join(dir, "scratch", "malformed.json"), "{not json");
    const before = checkpointBytes(dir);
    const inline = invoke(["intake-design-questions-apply", "--root", dir, "--answers-json", "{not json", "--activate", "--runner", "claude"]);
    const viaFile = invoke(["intake-design-questions-apply", "--root", dir, "--answers-file", "scratch/malformed.json", "--activate", "--runner", "claude"]);
    assert.equal(inline.status, 2, inline.output);
    assert.equal(viaFile.status, 2, viaFile.output);
    const codeOf = (output) => output.match(/INTAKE-[A-Z-]+/u)?.[0];
    assert.equal(codeOf(viaFile.output), codeOf(inline.output), "no second parser verdict for the file route");
    assert.doesNotMatch(viaFile.output, /ANSWERS-FILE/u, viaFile.output);
    assert.deepEqual(checkpointBytes(dir), before);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// Case 16 (doc/emitter consistency). The expected flag literals are pinned here as the ratified
// names rather than derived from the shape table, so the check cannot pass vacuously before the
// table changes. The "language is not re-asked" rule is matched at paragraph level with a tolerant
// wording so the doc slice may phrase it freely.
const REFERENCES = new URL("../skills/pipeline-start/references/", import.meta.url);
const readReference = (name) => readFileSync(new URL(name, REFERENCES), "utf8");

test("R5-16 the intake-generate-design reference documents the file route with the exact flag names the shape table emits", () => {
  const doc = readReference("intake-generate-design.md");
  assert.match(doc, /--answers-file(?![-\w])/u, "the --answers-file route is documented");
  assert.match(doc, /--answers-file-sha256/u, "the optional digest flag is documented");
  const allowed = new Set(["--answers-json", "--answers-file", "--answers-file-sha256"]);
  for (const name of DESIGN_COMMANDS) {
    const shape = MUTATING_ONBOARDING_ARGV_SHAPES[name];
    for (const flag of [...(shape.requiredValueOneOf ?? []), ...shape.optionalValue].filter((entry) => entry.startsWith("--answers-"))) {
      assert.ok(allowed.has(flag), `${name} emits ${flag}, which this pin does not know`);
      assert.ok(doc.includes(flag), `${flag} is emitted by ${name} but absent from the reference`);
    }
  }
  for (const mention of doc.match(/--answers-[a-z0-9-]+/gu) ?? []) {
    assert.ok(allowed.has(mention), `the reference names an --answers-* flag the CLI does not emit: ${mention}`);
  }
});

test("R5-16 the kickoff-design reference says a recorded consent language is not asked again", () => {
  const doc = readReference("kickoff-design.md");
  const notReAsked = /(?:do(?:es)? not|don't|never|must not|should not|not)\s+(?:re-?)?ask|not\s+(?:be\s+)?(?:re-?asked|asked again)|asked once/iu;
  const rule = doc.split(/\r?\n\s*\r?\n/u).filter((paragraph) =>
    /consent/iu.test(paragraph) && /language/iu.test(paragraph) && notReAsked.test(paragraph));
  assert.ok(rule.length > 0, "no paragraph says that a language already recorded at consent is not asked again");
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

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function prepareUnconsentedInitialPromptCheckpoint(root) {
  applyOnboardingIntakeConsent({ rootDir: root, granted: true, activate: true });
  const observed = readOnboardingIntakeCheckpoint({ rootDir: root });
  const value = { ...observed.value, consent: null, updatedAt: observed.value.createdAt, revision: 0 };
  delete value.contentSha256;
  value.contentSha256 = createHash("sha256").update(Buffer.from(canonicalJson(value), "utf8")).digest("hex");
  writeFileSync(observed.paths.checkpoint, `${JSON.stringify(value)}\n`, { mode: 0o600 });
  return observed;
}

function prepareGeneratePlanFixture(root) {
  const consent = invoke(["intake-consent-apply", "--root", root, "--granted",
    "--git-author-name", "Plan Fixture", "--git-author-email", "plan@example.invalid",
    "--language", "en", "--profile", "feature", "--activate", "--runner", "claude"]);
  assert.equal(consent.status, 0, consent.output);
  const capture = invoke(["intake-capture-apply", "--root", root, "--text", "Build a local keyboard game.",
    "--activate", "--runner", "claude"]);
  assert.equal(capture.status, 0, capture.output);
  const answers = JSON.stringify([
    { question: "What is the primary goal?", answer: "Ship a keyboard-playable local game." },
    { question: "How is it verified?", answer: "Run the repository verify script." },
  ]);
  const answered = invoke(["intake-design-questions-apply", "--root", root, "--answers-json", answers,
    "--activate", "--runner", "claude"]);
  assert.equal(answered.status, 0, answered.output);
}

test("project-onboarding-v3 accepts a digest-bound existing project file without a scratch copy", () => {
  const dir = neutralGitFixture("intake-reference");
  try {
    const material = "Projektziel: Amon Sûl.\r\nSicher und schnell starten.\n";
    writeFileSync(join(dir, "requirements.md"), material);
    const digest = createHash("sha256").update(Buffer.from(material, "utf8")).digest("hex");
    const argv = ["intake-consent-apply", "--root", dir, "--granted", "--git-author-name", "PO",
      "--git-author-email", "po@example.invalid", "--language", "de", "--profile", "feature",
      "--text-file", "requirements.md", "--text-file-sha256", digest, "--activate", "--runner", "claude"];
    const mismatch = invoke(argv.map((value) => value === digest ? "0".repeat(64) : value));
    assert.equal(mismatch.status, 2, mismatch.output);
    assert.match(mismatch.output, /INTAKE-CAPTURE-TEXT-FILE-DIGEST-MISMATCH/u);
    const captured = invoke(argv);
    assert.equal(captured.status, 0, captured.output);
    const checkpoint = JSON.parse(captured.output).checkpoint;
    assert.equal(checkpoint.materialInput[0].sha256, digest);
    const malformed = invoke(["intake-consent-apply", "--root", dir, "--granted", "--activate",
      "--text-turn-ref", "{not-json", "--runner", "claude"]);
    assert.equal(malformed.status, 2, malformed.output);
    assert.match(malformed.output, /INTAKE-CHAT-TURN-REFERENCE-INVALID/u);
    assert.equal(readOnboardingIntakeCheckpoint({ rootDir: dir }).value.consent.granted, true,
      "the canonical consent transition occurs before parsing or consuming a turn reference");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("project-onboarding-v3 resolves only canonical Claude prompt references after consent", () => {
  const dir = neutralGitFixture("claude-turn-reference");
  let captureDir;
  try {
    const initial = prepareUnconsentedInitialPromptCheckpoint(dir);
    const initialPrompt = "## First prompt\nKeep this private until consent.\n";
    const transcriptPath = join(dir, "host-session", "first.jsonl");
    const initialEvent = {
      hook_event_name: "UserPromptSubmit", session_id: "cli-session-initial",
      prompt_id: "550e8400-e29b-41d4-a716-446655440010", transcript_path: transcriptPath,
      cwd: dir, prompt: initialPrompt,
    };
    const pointer = captureClaudeInitialPromptPointer(initialEvent);
    assert.equal(pointer.status, "available");
    mkdirSync(join(dir, "host-session"), { recursive: true });
    writeFileSync(transcriptPath, `${JSON.stringify({
      type: "user", uuid: "650e8400-e29b-41d4-a716-446655440010", sessionId: initialEvent.session_id,
      timestamp: "2026-10-02T12:00:00.000Z", version: "2.1.196",
      message: { role: "user", content: [{ type: "text", text: initialPrompt }] },
    })}\n`);

    const consented = invoke(["intake-consent-apply", "--root", dir, "--granted",
      "--git-author-name", "Turn Fixture", "--git-author-email", "turn@example.invalid",
      "--language", "en", "--profile", "feature", "--text-turn-ref", JSON.stringify(pointer.reference),
      "--activate", "--runner", "claude"]);
    assert.equal(consented.status, 0, consented.output);
    assert.equal(JSON.parse(consented.output).capture.evidence.sha256,
      createHash("sha256").update(initialPrompt).digest("hex"));

    captureDir = neutralGitFixture("claude-turn-capture");
    const captureConsent = invoke(["intake-consent-apply", "--root", captureDir, "--granted",
      "--git-author-name", "Capture Fixture", "--git-author-email", "capture@example.invalid",
      "--language", "en", "--profile", "feature", "--activate", "--runner", "claude"]);
    assert.equal(captureConsent.status, 0, captureConsent.output);
    const capturePrompt = "## Follow-up input\nUse the native prompt capture reference.\n";
    const captureEvent = {
      hook_event_name: "UserPromptSubmit", session_id: "cli-session-capture",
      transcript_path: join(captureDir, "host-session", "capture.jsonl"), cwd: captureDir, prompt: capturePrompt,
    };
    const capturedReference = captureClaudeIntakePrompt(captureEvent);
    assert.equal(capturedReference.status, "available");
    const wrongRootReference = invoke(["intake-capture-apply", "--root", captureDir, "--text-turn-ref",
      JSON.stringify({ ...capturedReference.reference, transcriptPath: "/outside/claimed.jsonl" }),
      "--activate", "--runner", "claude"]);
    assert.equal(wrongRootReference.status, 2, wrongRootReference.output);
    assert.match(wrongRootReference.output, /CLAUDE-INTAKE-REFERENCE-SHAPE/u);
    assert.equal(readOnboardingIntakeCheckpoint({ rootDir: captureDir }).value.materialInput.length, 0,
      "a rejected extra path field adds no capture bytes");

    const captured = invoke(["intake-capture-apply", "--root", captureDir, "--text-turn-ref",
      JSON.stringify(capturedReference.reference), "--activate", "--runner", "claude"]);
    assert.equal(captured.status, 0, captured.output);
    const checkpoint = readOnboardingIntakeCheckpoint({ rootDir: captureDir }).value;
    assert.equal(checkpoint.materialInput.length, 1);
    assert.equal(checkpoint.materialInput[0].sha256, createHash("sha256").update(capturePrompt).digest("hex"));
    assert.equal(initial.paths.root, dir);
  } finally {
    if (captureDir) rmSync(captureDir, { recursive: true, force: true });
    rmSync(dir, { recursive: true, force: true });
  }
});

test("intake-generate-plan defaults to a digest-stable summary and requires --verbose for the full payload", () => {
  const dir = neutralGitFixture("generate-plan-summary");
  try {
    prepareGeneratePlanFixture(dir);
    const defaultResult = invoke(["intake-generate-plan", "--root", dir, "--runner", "claude"]);
    const summaryResult = invoke(["intake-generate-plan", "--root", dir, "--runner", "claude", "--summary"]);
    const verboseResult = invoke(["intake-generate-plan", "--root", dir, "--runner", "claude", "--verbose"]);
    assert.equal(defaultResult.status, 0, defaultResult.output);
    assert.equal(summaryResult.status, 0, summaryResult.output);
    assert.equal(verboseResult.status, 0, verboseResult.output);
    const summary = JSON.parse(defaultResult.output);
    assert.deepEqual(JSON.parse(summaryResult.output), summary, "legacy --summary remains an alias for the default");
    const full = JSON.parse(verboseResult.output);
    assert.equal(summary.schema, "pipeline.onboarding-intake-generate-plan-summary.v1");
    assert.equal(full.schema, "pipeline.onboarding-intake-generate-plan.v1");
    assert.equal(summary.planSha256, full.planSha256);
    assert.deepEqual(summary.nextAction, full.nextAction);
    assert.deepEqual(Object.fromEntries(Object.entries(summary.targets).map(([key, target]) => [key, target.afterSha256])),
      Object.fromEntries(Object.entries(full.targets).map(([key, target]) => [key, target.afterSha256])));
    assert.equal(summary.fullPlanAction.argv.includes("--verbose"), true);
    const fullAction = invoke(summary.fullPlanAction.argv.slice(1));
    assert.equal(fullAction.status, 0, fullAction.output);
    assert.deepEqual(JSON.parse(fullAction.output), full);
    const conflict = invoke(["intake-generate-plan", "--root", dir, "--summary", "--verbose"]);
    assert.equal(conflict.status, 2, conflict.output);
    assert.match(conflict.output, /--summary and --verbose cannot be used together/u);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("project-onboarding-v3 CLI: mini retains early acknowledgement while feature and epic wait for the final package", () => {
  for (const profile of ["mini", "feature", "epic"]) {
  const dir = neutralGitFixture("bootstrap-bind-e2e-" + profile);
  try {
    let result = invoke(["intake-consent-apply", "--root", dir, "--granted",
      "--git-author-name", "Test Author", "--git-author-email", "test@example.com",
      "--language", "en", "--profile", profile, "--activate"]);
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

    result = invoke(["bootstrap-bind-plan", "--root", dir]);
    if (profile === "mini") {
      assert.equal(result.status, 2, result.output);
      assert.match(result.output, /KICKOFF-PROMOTION-PRD-ACKNOWLEDGEMENT-MARKER-MISSING/u);
    } else {
      assert.equal(result.status, 0, result.output);
      const bindPlan = JSON.parse(result.output);
      assert.equal(bindPlan.targets.state.value.planApproved, false, "binding the unsigned design must not approve implementation");
      assert.equal(bindPlan.nextAction.argv.includes("bootstrap-bind-apply"), true);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  }
});

test("project-onboarding-v3 CLI: bootstrap bind and acknowledgement subcommands reach their own precondition errors, not 'unknown argument'", () => {
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

    const acknowledgementPlan = invoke(["bootstrap-acknowledge-plan", "--root", dir, "--activate"]);
    assert.equal(acknowledgementPlan.status, 2);
    assert.match(acknowledgementPlan.output, /BOOTSTRAP-ACK-PRECONDITION/);
    assert.doesNotMatch(acknowledgementPlan.output, /unknown argument/);

    const acknowledgementApply = invoke([
      "bootstrap-acknowledge-apply", "--root", dir, "--plan-sha256", sha,
      "--proof", "scratch/bootstrap-plan-acknowledgement-proof-test.json", "--activate",
    ]);
    assert.equal(acknowledgementApply.status, 2);
    assert.match(acknowledgementApply.output, /BOOTSTRAP-ACK-PRECONDITION/);
    assert.doesNotMatch(acknowledgementApply.output, /unknown argument/);

    const chatAcknowledgementApply = invoke([
      "bootstrap-acknowledge-chat-apply", "--root", dir, "--plan-sha256", sha, "--activate",
    ]);
    assert.equal(chatAcknowledgementApply.status, 2);
    assert.match(chatAcknowledgementApply.output, /BOOTSTRAP-ACK-PRECONDITION/);
    assert.doesNotMatch(chatAcknowledgementApply.output, /unknown argument/);
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
