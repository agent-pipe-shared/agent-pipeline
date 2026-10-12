import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { isAllowedPassiveReadTarget } from "../../../plugins/pipeline-core/lib/passive-read-policy.mjs";
import { isReadOnlyDiagnosticCommand, qp4OperandResolvesOutsideRoot, win32QuotedDrivePathCommand } from "../../../plugins/pipeline-core/lib/guard/shell-grammar.mjs";

const itemRoot = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = resolve(itemRoot, "../../..");
const selectedSourcePath = resolve(itemRoot, "../passive-read-consumer-delivery/postimages/plugins/pipeline-core/hooks/guard-command-grammar.mjs");
const selectedSource = (await import(`node:fs/promises`)).readFile;
const selectedText = await selectedSource(selectedSourcePath, "utf8");
const selectedModuleText = selectedText
  .replaceAll('"../lib/git-cmd.mjs"', JSON.stringify(pathToFileURL(resolve(repoRoot, "plugins/pipeline-core/lib/git-cmd.mjs")).href))
  .replaceAll('"../lib/passive-read-policy.mjs"', JSON.stringify(pathToFileURL(resolve(repoRoot, "plugins/pipeline-core/lib/passive-read-policy.mjs")).href));
const selectedGrammar = await import(`data:text/javascript;base64,${Buffer.from(selectedModuleText).toString("base64")}`);

const fixture = resolve(itemRoot, "fixtures");
const project = resolve(fixture, "project");
const outside = resolve(fixture, "outside");
mkdirSync(project, { recursive: true });
mkdirSync(outside, { recursive: true });
writeFileSync(resolve(project, "scan.txt"), "public project fixture\n", { mode: 0o600 });
writeFileSync(resolve(project, "options.txt"), "public project option fixture\n", { mode: 0o600 });
writeFileSync(resolve(outside, "options.txt"), "public outside option fixture\n", { mode: 0o600 });
writeFileSync(resolve(outside, ".env"), "synthetic private fixture\n", { mode: 0o600 });

function observe(id, command, targetRelative, expected) {
  const parsed = selectedGrammar.parseGuardCommand(command, project, { platform: "linux" });
  const target = targetRelative === null ? null : resolve(project, targetRelative);
  const observation = {
    id,
    command,
    selectedParse: parsed.parseStatus,
    optionValueExtractionAndOutsideLabel: qp4OperandResolvesOutsideRoot(parsed, project),
    targetReadDiagnosis: target === null ? "not-applicable" : isAllowedPassiveReadTarget(targetRelative, { rootDir: project, recursive: true }),
    commandAdmission: isReadOnlyDiagnosticCommand(command, project),
  };
  assert.equal(observation.selectedParse, expected.parse, `${id}: selected parse`);
  assert.equal(observation.optionValueExtractionAndOutsideLabel, expected.outside, `${id}: outside label`);
  assert.equal(observation.targetReadDiagnosis, expected.read, `${id}: target diagnosis`);
  assert.equal(observation.commandAdmission, expected.admission, `${id}: command admission`);
  return observation;
}

const cases = [];
for (const [executable, option] of [["rg", "--ignore-file"], ["grep", "--exclude-from"]]) {
  for (const [id, operand, read] of [
    ["inside-public", "options.txt", true],
    ["outside-public", "../outside/options.txt", true],
    ["outside-private", "../outside/.env", false],
    ["outside-missing", "../outside/missing.txt", false],
  ]) {
    for (const equal of [false, true]) {
      const spelling = option + (equal ? `=${operand}` : ` ${operand}`);
      const command = `${executable} ${spelling} needle scan.txt`;
      const isOutside = operand.startsWith("../");
      cases.push(observe(`${executable}-${id}-${equal ? "equal" : "split"}`, command, operand,
        { parse: "accepted", outside: isOutside, read, admission: false }));
    }
  }
}

cases.push(observe("rg-pattern-file-outside-control", "rg -f ../outside/options.txt scan.txt", "../outside/options.txt",
  { parse: "accepted", outside: true, read: true, admission: true }));
cases.push(observe("grep-pattern-file-outside-control", "grep -f ../outside/options.txt scan.txt", "../outside/options.txt",
  { parse: "accepted", outside: true, read: true, admission: false }));
cases.push(observe("rg-nonfile-option-value-control", "rg --glob ../outside/options.txt -e needle scan.txt", "../outside/options.txt",
  { parse: "accepted", outside: false, read: true, admission: false }));
cases.push(observe("rg-pattern-text-control", "rg ../outside/options.txt scan.txt", null,
  { parse: "accepted", outside: false, read: "not-applicable", admission: true }));
cases.push(observe("rg-missing-option-value-control", "rg --ignore-file", null,
  { parse: "accepted", outside: false, read: "not-applicable", admission: false }));
cases.push(observe("rg-unsupported-pre-option-control", "rg --pre cat needle scan.txt", null,
  { parse: "accepted", outside: false, read: "not-applicable", admission: false }));

const windowsRaw = 'rg --ignore-file "D:\\outside\\options.txt" needle scan.txt';
const windowsNormalized = win32QuotedDrivePathCommand(windowsRaw, "win32");
const windowsParsed = selectedGrammar.parseGuardCommand(windowsNormalized, project, { platform: "win32" });
assert.equal(windowsParsed.parseStatus, "accepted");
assert.ok(windowsParsed.segments[0].argv.includes("D:/outside/options.txt"));
cases.push({
  id: "windows-shaped-controlled-source-normalization",
  raw: windowsRaw,
  normalized: windowsNormalized,
  selectedParse: windowsParsed.parseStatus,
  optionValueRetainedInArgv: windowsParsed.segments[0].argv.includes("D:/outside/options.txt"),
  outsideDiagnosis: "held: host path semantics not exercised",
  commandAdmission: "held: no native-host result claimed",
});

const output = `${JSON.stringify({ schema: "option-file-target-original-cases.v1", selectedGeneration: "3525f685ac661cfbfd97a226649aecf71ec074ea92990501cab1584b98fab5a6", cases }, null, 2)}\n`;
writeFileSync(resolve(itemRoot, "cases-output.json"), output, { mode: 0o600 });
process.stdout.write(output);
