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
  // Ruling 150: the body travels in the message file, not in the commit command (no -m, no --trailer).
  assert.deepEqual(result.steps[1].argv, ["commit", "-F", result.messagePath, "--", ...input.paths]);
  assert.ok(result.steps[1].command.includes(result.messagePath));
  assert.ok(!result.steps[1].command.includes("Keep the user"));
  assert.ok(result.message.includes("Keep the user's literal $VALUE and don't expand it."));
  assert.ok(result.steps.every((step) => !step.command.includes(" && ")));
  for (const step of result.steps) {
    assert.equal(typeof step.copyCommand.posix, "string");
    assert.equal(typeof step.copyCommand.powershell, "string");
    // T29: the PowerShell copy command is ONE physical line `& git '<argv>'...` -- no `$CMD=...; Invoke-Expression $CMD`
    // assembly. A `$` or `;` that is part of an argv word stays inert inside its single quotes (the fixture body
    // carries a literal `$VALUE`), so the no-`$`/no-`;` rule applies to the structure around the quoted words.
    const powershell = step.copyCommand.powershell;
    const quotedArgv = step.argv.map((word) => `'${word.replaceAll("'", "''")}'`).join(" ");
    assert.equal(/[\r\n]/u.test(powershell), false, `powershell copyCommand is single-line: ${JSON.stringify(powershell)}`);
    assert.ok(powershell.startsWith(`& git ${quotedArgv}`), `powershell copyCommand starts with & git + single-quoted argv: ${JSON.stringify(powershell)}`);
    assert.equal(/[$;]/u.test(powershell.replace(/'(?:[^']|'')*'/gu, "")), false,
      `powershell copyCommand has no $ or ; outside quoted argv words: ${JSON.stringify(powershell)}`);
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
  // Ruling 150: the agent writes `plan.message` to `plan.messagePath` before the commit step.
  mkdirSync(join(root, "scratch", "commit-msg"), { recursive: true });
  writeFileSync(join(root, plan.messagePath), plan.message);
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

// PRODUCER-T -- Ruling 150 (specs/sprint-alfred-epic/plans/0.7-execution-order.md): the producer emits the
// message-file route. Today its commit step is `git commit -m <subject> -m <body>... --trailer "Dispatch: <ID> (goldfish)"
// --trailer "AI-Assisted: true" -- <paths>`, which guard-push refuses (the parenthesised trailer value), so the route
// the template mandates has never been executable. Every case below is RED BY DESIGN until PRODUCER-F
// (lib/goldfish-commit-command-flow.mjs) changes the route. Do not weaken or skip them to make the suite green.
//
// Assumptions, named so the fix may revisit a FIELD NAME but not the route:
//   - the result carries the top-level string fields `message` and `messagePath`;
//   - `messagePath` is the repo-relative, forward-slash path `scratch/commit-msg/<taskId>.txt`;
//   - `message` is the subject, a blank line, the body paragraphs joined by blank lines, a blank line, the two trailers
//     (`Dispatch: <taskId> (goldfish)`, `AI-Assisted: true`) and one trailing newline (the text the legacy flow
//     already assembles internally);
//   - the commit step argv is exactly ["commit", "-F", messagePath, "--", ...paths], with no -m and no --trailer;
//   - the stage step (["add", "--", ...paths]) and both step `kind` labels are unchanged;
//   - the producer stays read-only: it names the message file and never writes it (the agent writes it).
// The input-refusal codes (GF-COMMAND-INPUT, -PATH, -PATH-ORDER, -MESSAGE) are already pinned by the second test of
// this file and are unchanged by Ruling 150, so no duplicate (green-today) refusal case is added here.
//
// After PRODUCER-F these older cases pin the retired -m/--trailer form and need a TEST-ONLY update (not edited here):
//   - "legacy Goldfish command flow renders separate exact-path argv without shell composition" (it expects the body
//     text inside the commit command, via `'Keep the user'`);
//   - "generated commands create one exact-path Git commit with the required trailer block" (it runs the commit step
//     without writing a message file first).
const PRODUCER_T_PATH = "scratch/commit-msg/GF-42.txt";
const PRODUCER_T_MESSAGE = "fix(core): handle a quoted value\n\nKeep the user's literal $VALUE and don't expand it.\n\n"
  + "A second reason stays separate.\n\nDispatch: GF-42 (goldfish)\nAI-Assisted: true\n";
const PRODUCER_T_COMMIT_ARGV = ["commit", "-F", PRODUCER_T_PATH, "--", ...input.paths];
const PRODUCER_T_CLI_ARGS = ["--task-id", input.taskId, "--type", input.type, "--scope", input.scope,
  "--summary", input.summary, ...input.bodyParagraphs.flatMap((body) => ["--body", body]),
  ...input.paths.flatMap((path) => ["--path", path])];
const PRODUCER_T_REASON = "Ruling 150 / PRODUCER-F: the commit step must be `git commit -F <messagePath> -- <paths>` "
  + "(guard-push refuses -m with a parenthesised --trailer)";

function assertMessageFileRoute(result) {
  assert.equal(result.ok, true);
  const commit = result.steps[1];
  assert.deepEqual(commit.argv.filter((word) => word === "-m" || word === "--trailer"), [], PRODUCER_T_REASON);
  assert.deepEqual(commit.argv, PRODUCER_T_COMMIT_ARGV, PRODUCER_T_REASON);
  assert.deepEqual(result.steps.map((step) => step.kind), ["stage-exact-paths", "commit-exact-paths"]);
  assert.deepEqual(result.steps[0].argv, ["add", "--", ...input.paths]);
  assert.equal(result.messagePath, PRODUCER_T_PATH, PRODUCER_T_REASON);
  assert.equal(result.message, PRODUCER_T_MESSAGE, PRODUCER_T_REASON);
}

test("PRODUCER-T (a) RED by design: the library commit step is the message-file route and carries message and path", () => {
  assertMessageFileRoute(createGoldfishCommitCommandFlow(input));
});

test("PRODUCER-T (b) RED by design: the in-process CLI returns the same message-file route as the library", () => {
  const viaCli = runGoldfishCommitCommandFlow(PRODUCER_T_CLI_ARGS);
  assertMessageFileRoute(viaCli);
  assert.deepEqual(viaCli, createGoldfishCommitCommandFlow(input));
});

test("PRODUCER-T (c) RED by design: messagePath and message follow the task id and the input text", () => {
  const second = createGoldfishCommitCommandFlow({ taskId: "GF-PRODUCER-T-9", type: "test", scope: "core",
    summary: "pin one existing path", bodyParagraphs: ["A plain reason."], paths: ["src/regular.js"] });
  assert.equal(second.ok, true);
  assert.deepEqual(second.steps[1].argv, ["commit", "-F", "scratch/commit-msg/GF-PRODUCER-T-9.txt", "--", "src/regular.js"],
    PRODUCER_T_REASON);
  assert.equal(second.messagePath, "scratch/commit-msg/GF-PRODUCER-T-9.txt", PRODUCER_T_REASON);
  assert.equal(second.message,
    "test(core): pin one existing path\n\nA plain reason.\n\nDispatch: GF-PRODUCER-T-9 (goldfish)\nAI-Assisted: true\n",
    PRODUCER_T_REASON);
});

test("PRODUCER-T (d) RED by design: the producer names the message file but writes nothing", () => {
  const runs = [["library", () => createGoldfishCommitCommandFlow(input)],
    ["CLI", () => runGoldfishCommitCommandFlow(PRODUCER_T_CLI_ARGS)]];
  for (const [label, produce] of runs) {
    assert.throws(() => readFileSync(PRODUCER_T_PATH), { code: "ENOENT" }, `${label}: no file at the message path before the call`);
    const result = produce();
    assert.equal(result.messagePath, PRODUCER_T_PATH, `${label}: ${PRODUCER_T_REASON}`);
    assert.throws(() => readFileSync(PRODUCER_T_PATH), { code: "ENOENT" },
      `${label}: the producer is read-only; the agent writes the message file`);
  }
});

test("PRODUCER-T (e) RED by design: every commit command rendering parses to exactly the message-file argv", () => {
  const commit = createGoldfishCommitCommandFlow(input).steps[1];
  assert.deepEqual(commit.argv, PRODUCER_T_COMMIT_ARGV, PRODUCER_T_REASON);
  for (const platform of [CLAUDE_BASH_SHELL_DIALECT_PLATFORM, "win32"]) {
    for (const [field, text] of [["command", commit.command], ["copyCommand.posix", commit.copyCommand.posix]]) {
      const label = `${field}@${platform}: ${JSON.stringify(text)}`;
      const parsed = parseGuardCommand(text, "/fixture/repository", { platform });
      assert.equal(parsed.parseStatus, "accepted", label);
      assert.deepEqual(parsed.segments[0].argv, PRODUCER_T_COMMIT_ARGV, label);
      assert.deepEqual(parsed.operators, [], label);
      assert.deepEqual(parsed.redirects, [], label);
    }
  }
  assert.ok(commit.copyCommand.powershell.startsWith(
    "& git 'commit' '-F' 'scratch/commit-msg/GF-42.txt' '--' 'src/odd value.txt' 'src/regular.js'"),
  commit.copyCommand.powershell);
});

test("PRODUCER-T (f) RED by design: with the returned message written to messagePath, the two steps create the exact-path commit", (t) => {
  const root = mkdtempSync(join(tmpdir(), "goldfish-command-flow-f-"));
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
  assert.equal(typeof plan.messagePath, "string", PRODUCER_T_REASON);
  assert.equal(typeof plan.message, "string", PRODUCER_T_REASON);
  mkdirSync(join(root, "scratch", "commit-msg"), { recursive: true });
  writeFileSync(join(root, plan.messagePath), plan.message);
  for (const step of plan.steps) run("bash", ["-c", step.command]);
  assert.equal(run("git", ["show", "--format=", "--name-only", "HEAD"]).trim(), "src/odd value.txt");
  assert.equal(run("git", ["show", "-s", "--format=%B", "HEAD"]).trimEnd(), PRODUCER_T_MESSAGE.trimEnd());
  assert.equal(readFileSync(join(root, "src", "odd value.txt"), "utf8"), "exact content\n");
});
