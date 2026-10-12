import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseGuardCommand } from "../../../plugins/pipeline-core/hooks/guard-command-grammar.mjs";
import {
  isReadOnlyDiagnosticCommand,
  qp4OperandResolvesOutsideRoot,
} from "../../../plugins/pipeline-core/lib/guard/shell-grammar.mjs";

const itemRoot = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = resolve(itemRoot, "../../..");
const mainParserPath = resolve(repoRoot, "plugins/pipeline-core/hooks/guard-command-grammar.mjs");
const consumerPath = resolve(repoRoot, "plugins/pipeline-core/lib/guard/shell-grammar.mjs");
const digest = (path) => createHash("sha256").update(readFileSync(path)).digest("hex");
const sourceBindings = {
  mainParser: { path: "plugins/pipeline-core/hooks/guard-command-grammar.mjs", sha256: digest(mainParserPath) },
  consumer: { path: "plugins/pipeline-core/lib/guard/shell-grammar.mjs", sha256: digest(consumerPath) },
};
assert.equal(sourceBindings.mainParser.sha256, "cf7c94467a85b9f82b95c2a592858628c0e4d52c30bebcc427da82d95de4c141");
assert.equal(sourceBindings.consumer.sha256, "6a711bdb8a5db034007920808d36ef260873603b4a54364552f4e9f6d408ddcd");

const fixture = resolve(itemRoot, "main-fixtures");
const project = resolve(fixture, "project");
const outside = resolve(fixture, "outside");
mkdirSync(project, { recursive: true });
mkdirSync(outside, { recursive: true });
writeFileSync(resolve(project, "scan.txt"), "project fixture\n", { mode: 0o600 });
writeFileSync(resolve(project, "options.txt"), "inside option fixture\n", { mode: 0o600 });
writeFileSync(resolve(outside, "options.txt"), "outside option fixture\n", { mode: 0o600 });

const cases = [];
for (const [executable, option] of [["rg", "--ignore-file"], ["grep", "--exclude-from"]]) {
  for (const [target, optionValue, expectedOutside] of [
    ["inside", "options.txt", false],
    ["outside", "../outside/options.txt", true],
  ]) {
    const command = `${executable} ${option} ${optionValue} needle scan.txt`;
    const parsed = parseGuardCommand(command, project, { platform: "linux" });
    const outsideRootLabel = qp4OperandResolvesOutsideRoot(parsed, project);
    const admitted = isReadOnlyDiagnosticCommand(command, project);
    assert.equal(parsed.parseStatus, "accepted", `${executable} ${target}: Main parser`);
    assert.ok(parsed.segments[0].argv.includes(optionValue), `${executable} ${target}: argv retains option value`);
    assert.equal(outsideRootLabel, expectedOutside, `${executable} ${target}: outside-root label`);
    assert.equal(admitted, false, `${executable} ${target}: unsupported option remains refused`);
    cases.push({ executable, option, target, command, parsedBy: sourceBindings.mainParser.path,
      parseStatus: parsed.parseStatus, argvRetainsOptionValue: parsed.segments[0].argv.includes(optionValue),
      outsideRootLabel, commandAdmission: admitted });
  }
}

const output = `${JSON.stringify({ schema: "option-file-target-current-main-cases.v1", sourceBindings, cases }, null, 2)}\n`;
writeFileSync(resolve(itemRoot, "main-cases-output.json"), output, { mode: 0o600 });
process.stdout.write(output);
