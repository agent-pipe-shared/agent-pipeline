// SPDX-License-Identifier: SUL-1.0
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseGuardCommand } from "../hooks/guard-command-grammar.mjs";
import { createGoldfishCommitCommandFlow } from "../lib/goldfish-commit-command-flow.mjs";
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
