// SPDX-License-Identifier: SUL-1.0
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { parseGuardCommand } from "../hooks/guard-command-grammar.mjs";
import { createGoldfishCommitCommandFlow } from "../lib/goldfish-commit-command-flow.mjs";
import { CLAUDE_BASH_SHELL_DIALECT_PLATFORM } from "../lib/guard/constants.mjs";
import { runGoldfishCommitCommandFlow } from "./goldfish-commit-command-flow.mjs";

const input = { taskId: "GF-42", type: "fix", scope: "core", summary: "handle a quoted value",
  bodyParagraphs: ["Keep the user's literal $VALUE and don't expand it.", "A second reason stays separate."],
  paths: ["src/odd value.txt", "src/regular.js"] };

test("legacy Goldfish command flow renders separate exact-path argv without shell composition", () => {
  const result = createGoldfishCommitCommandFlow(input);
  assert.equal(result.ok, true);
  assert.equal(result.steps.length, 2);
  assert.deepEqual(result.steps[0].argv, ["add", "--", ...input.paths]);
  assert.deepEqual(result.steps[1].argv.slice(-3), ["--", ...input.paths]);
  assert.ok(result.steps[0].command.includes("'src/odd value.txt'"));
  assert.ok(result.steps[1].command.includes("'Keep the user'"));
  assert.ok(result.steps.every((step) => !step.command.includes(" && ")));
  for (const step of result.steps) {
    assert.equal(typeof step.copyCommand.posix, "string");
    assert.equal(typeof step.copyCommand.powershell, "string");
    assert.match(step.copyCommand.powershell, /Invoke-Expression \$CMD/u);
    const parsed = parseGuardCommand(step.command, "/fixture/repository");
    assert.equal(parsed.parseStatus, "accepted", step.command);
    assert.deepEqual(parsed.segments[0].argv, step.argv);
    assert.deepEqual(parsed.operators, []);
  }
  assert.match(result.disclaimer, /does not attest dispatch identity/u);
});

test("legacy command flow refuses malformed paths, duplicate paths and unsafe message metadata", () => {
  assert.equal(createGoldfishCommitCommandFlow({ ...input, paths: ["src/regular.js", "src/regular.js"] }).code,
    "GF-COMMAND-PATH-ORDER");
  assert.equal(createGoldfishCommitCommandFlow({ ...input, paths: ["../outside"] }).code,
    "GF-COMMAND-PATH");
  assert.equal(createGoldfishCommitCommandFlow({ ...input, paths: ["src/regular.js", "src/odd value.txt"] }).code,
    "GF-COMMAND-PATH-ORDER");
  assert.equal(createGoldfishCommitCommandFlow({ ...input, bodyParagraphs: ["line one\nline two"] }).code,
    "GF-COMMAND-INPUT");
  assert.equal(createGoldfishCommitCommandFlow({ ...input, summary: "visit https://chatgpt.com/c/secret" }).code,
    "GF-COMMAND-MESSAGE");
});

test("CLI maps repeated body/path flags exactly and never executes Git", () => {
  const args = ["--task-id", input.taskId, "--type", input.type, "--scope", input.scope,
    "--summary", input.summary, ...input.bodyParagraphs.flatMap((body) => ["--body", body]),
    ...input.paths.flatMap((path) => ["--path", path])];
  assert.deepEqual(runGoldfishCommitCommandFlow(args), createGoldfishCommitCommandFlow(input));
  assert.equal(runGoldfishCommitCommandFlow([...args, "--path", "src/third.js", "--unexpected", "x"]).code,
    "GF-COMMAND-CLI-ARGUMENTS");
});

test("CLI normalizes unsorted --path input to the sorted output and still refuses duplicates", () => {
  // PRODSORT: unsorted input is normalized, not refused
  const base = ["--task-id", input.taskId, "--type", input.type, "--scope", input.scope,
    "--summary", input.summary, ...input.bodyParagraphs.flatMap((body) => ["--body", body])];
  const sorted = runGoldfishCommitCommandFlow([...base, "--path", "a.txt", "--path", "b.txt"]);
  const unsorted = runGoldfishCommitCommandFlow([...base, "--path", "b.txt", "--path", "a.txt"]);
  assert.equal(sorted.ok, true);
  assert.deepEqual(unsorted, sorted);
  assert.equal(JSON.stringify(unsorted), JSON.stringify(sorted));
  assert.equal(runGoldfishCommitCommandFlow([...base, "--path", "a.txt", "--path", "a.txt"]).code,
    "GF-COMMAND-PATH-ORDER");
  assert.equal(runGoldfishCommitCommandFlow([...base, "--path", "b.txt", "--path", "../x"]).code,
    "GF-COMMAND-PATH");
});

test("generated commands create one exact-path Git commit with the required trailer block", (t) => {
  const root = mkdtempSync(join(tmpdir(), "goldfish-command-flow-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const run = (program, argv) => {
    const result = spawnSync(program, argv, { cwd: root, encoding: "utf8", shell: false,
      env: { ...process.env, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null" } });
    assert.equal(result.status, 0, `${program} ${argv[0]}: ${result.stderr ?? result.error?.message}`);
    return result.stdout;
  };
  run("git", ["init", "-q"]);
  run("git", ["config", "user.name", "Fixture"]);
  run("git", ["config", "user.email", "fixture@example.invalid"]);
  mkdirSync(join(root, "src"));
  writeFileSync(join(root, "src", "odd value.txt"), "exact content\n");
  const plan = createGoldfishCommitCommandFlow({ ...input, paths: ["src/odd value.txt"] });
  assert.equal(plan.ok, true);
  for (const step of plan.steps) run("bash", ["-c", step.command]);
  assert.equal(run("git", ["show", "--format=", "--name-only", "HEAD"]).trim(), "src/odd value.txt");
  const message = run("git", ["show", "-s", "--format=%B", "HEAD"]);
  assert.match(message, /^fix\(core\): handle a quoted value/mu);
  assert.match(message, /don't expand it\.\n\nA second reason stays separate\./u);
  assert.match(message.trimEnd(), /Dispatch: GF-42 \(goldfish\)\nAI-Assisted: true$/u);
  assert.equal(readFileSync(join(root, "src", "odd value.txt"), "utf8"), "exact content\n");
});

// COMMITFLOW-T2 — Spec 21.1 R1: every Pipeline-emitted command is admitted in the state that emits it.
// Toil T29: the producer's `copyCommand.posix` is a multi-line `CMD='...'` / `eval "$CMD"` script, and the closed
// guard grammar denies any newline (`parseGuardCommand` returns `denied` for /[\0\r\n]/, surfaced to the agent as
// GUARD-PARSE-UNSUPPORTED), so the command the Goldfish is told to copy is refused. The plain `command` field is fine.
//
// Admission classifier: `parseGuardCommand` at the dialect the Claude Bash tool runs under
// (`CLAUDE_BASH_SHELL_DIALECT_PLATFORM`, linux) and, for the plain command, additionally at win32.
// No column bound (`maxColumns`) is pinned on purpose: a single admitted line may legitimately be long.
//
// (a) and (b) are GREEN controls. Every (c)/(d)/(e) case is RED BY DESIGN: it pins the corrected behaviour and
// stays red until the producer is fixed (COMMITFLOW-F). Do not weaken or skip them to make the suite green.
const COMMITFLOW_ROOT = "/fixture/repository"; // the producer is preview-only and never reads the working tree
const COMMITFLOW_DIALECTS = [CLAUDE_BASH_SHELL_DIALECT_PLATFORM, "win32"];
const COMMITFLOW_SCENARIOS = [
  { id: "S1", title: "one existing path",
    input: { taskId: "GF-42", type: "test", scope: "core", summary: "pin one existing path",
      bodyParagraphs: ["A plain reason."], paths: ["src/regular.js"] } },
  // "docs/new file.md" stands for a new (untracked) file: the producer never inspects Git state, so only the
  // path text varies. It sorts before the tracked paths and needs quoting because of its space.
  { id: "S2", title: "several paths including a new untracked file",
    input: { taskId: "GF-42", type: "test", scope: "core", summary: "pin several paths",
      bodyParagraphs: ["A plain reason."], paths: ["docs/new file.md", "src/regular.js", "src/zeta.js"] } },
  // The `$` sits only in summary/body text, which the producer single-quotes. A `$` inside a double-quoted
  // word is a shell expansion and is correctly denied by the guard, so it must never be part of this fixture.
  { id: "S3", title: "apostrophe, double quote and dollar in summary and body",
    input: { taskId: "GF-42", type: "test", scope: "core", summary: "keep the user's \"quoted\" $VALUE literal",
      bodyParagraphs: ["Keep the user's \"literal\" $VALUE and don't expand it.", "A second reason stays separate."],
      paths: ["src/regular.js"] } },
];
const commitflowStepLabel = (step) => `git ${step.argv[0]}`;
const hasNewline = (text) => /[\r\n]/u.test(text);

/** Admission problems of one command line: empty means a single, plain git command the guard admits. */
function commitflowAdmissionProblems(text, step, platform) {
  const label = `${commitflowStepLabel(step)}@${platform}`;
  const parsed = parseGuardCommand(text, COMMITFLOW_ROOT, { platform });
  if (parsed.parseStatus !== "accepted") {
    return [`${label}: parseStatus=${parsed.parseStatus} (${parsed.code ?? parsed.reason ?? "no code"}) for ${JSON.stringify(text)}`];
  }
  const problems = [];
  if (parsed.operators?.length !== 0) problems.push(`${label}: operators=${JSON.stringify(parsed.operators)}`);
  if (parsed.redirects?.length !== 0) problems.push(`${label}: redirects=${JSON.stringify(parsed.redirects)}`);
  const first = parsed.segments?.[0];
  if (first?.executable !== "git") problems.push(`${label}: executable=${JSON.stringify(first?.executable)}`);
  if (!isDeepStrictEqual(first?.argv, step.argv)) {
    problems.push(`${label}: argv ${JSON.stringify(first?.argv)} differs from step.argv ${JSON.stringify(step.argv)}`);
  }
  return problems;
}

for (const { id, title, input: scenario } of COMMITFLOW_SCENARIOS) {
  const prefix = `COMMITFLOW-T2 ${id} (${title})`;

  test(`${prefix} (a) fixture sanity: the producer returns the stage and commit steps`, () => {
    const result = createGoldfishCommitCommandFlow(scenario);
    assert.equal(result.ok, true);
    assert.deepEqual(result.steps.map(commitflowStepLabel), ["git add", "git commit"]);
    assert.deepEqual(result.steps[0].argv, ["add", "--", ...scenario.paths]);
    assert.deepEqual(result.steps[1].argv.slice(-(scenario.paths.length + 1)), ["--", ...scenario.paths]);
    for (const step of result.steps) {
      assert.equal(step.executable, "git");
      assert.equal(typeof step.command, "string");
      assert.equal(typeof step.copyCommand.posix, "string");
      assert.equal(typeof step.copyCommand.powershell, "string");
    }
  });

  test(`${prefix} (b) control: each plain command is one guard-admitted git command at linux and win32`, () => {
    const { steps } = createGoldfishCommitCommandFlow(scenario);
    const problems = steps.flatMap((step) => COMMITFLOW_DIALECTS.flatMap((platform) =>
      commitflowAdmissionProblems(step.command, step, platform)));
    assert.deepEqual(problems, []);
  });

  test(`${prefix} (c) RED by design: copyCommand.posix of each step contains no newline`, () => {
    const { steps } = createGoldfishCommitCommandFlow(scenario);
    const multiLine = steps.filter((step) => hasNewline(step.copyCommand.posix))
      .map((step) => `${commitflowStepLabel(step)}: ${JSON.stringify(step.copyCommand.posix)}`);
    assert.deepEqual(multiLine, [], "T29: the closed grammar denies any newline, so a multi-line copy command is refused");
  });

  test(`${prefix} (d) RED by design: copyCommand.posix of each step is one guard-admitted git command at ${CLAUDE_BASH_SHELL_DIALECT_PLATFORM}`, () => {
    // The executable/argv check is what stops a `CMD='...'` first line from parsing as a false green.
    const { steps } = createGoldfishCommitCommandFlow(scenario);
    const problems = steps.flatMap((step) =>
      commitflowAdmissionProblems(step.copyCommand.posix, step, CLAUDE_BASH_SHELL_DIALECT_PLATFORM));
    assert.deepEqual(problems, []);
  });

  // PowerShell admission itself is NOT pinnable in-process: `parseGuardCommand` classifies the Bash tool's POSIX
  // command line (plus the native Windows direct form) and has no PowerShell classifier. Only the structural
  // precondition shared by every lane is pinned here: a single physical line, since the grammar denies any newline.
  test(`${prefix} (e) RED by design: copyCommand.powershell of each step contains no newline`, () => {
    const { steps } = createGoldfishCommitCommandFlow(scenario);
    const multiLine = steps.filter((step) => hasNewline(step.copyCommand.powershell))
      .map((step) => `${commitflowStepLabel(step)}: ${JSON.stringify(step.copyCommand.powershell)}`);
    assert.deepEqual(multiLine, [], "T29: the closed grammar denies any newline, so a multi-line copy command is refused");
  });
}
