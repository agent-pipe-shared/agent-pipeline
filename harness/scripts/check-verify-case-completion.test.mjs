#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  DEFAULT_REGISTRY,
  DEFAULT_SCHEMA,
  checkVerifyCaseCompletion,
  classifyVulnerableSuite,
} from "./check-verify-case-completion.mjs";

const REPO_ROOT = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const SCHEMA_SOURCE = readFileSync(join(REPO_ROOT, DEFAULT_SCHEMA), "utf8");
const REASON = "backlog/items/2026-09-04-an-uncaught-assertion-silently-truncates-a-test-file-so-later-cases-never-run.md";
const LEGACY = `import assert from "node:assert/strict";
function check(name, fn) { fn(); console.log(name); }
check("one", () => assert.equal(1, 1));
check("two", () => assert.equal(2, 2));
`;
const TOP_LEVEL = `import assert from "node:assert/strict";
assert.equal(1, 1);
assert.equal(2, 2);
`;
const REQUIRED = `import assert from "node:assert/strict";
import { registerTestCaseCompletion } from "./test-case-completion.mjs";
registerTestCaseCompletion({
  cases: [{ id: "case-one", name: "runs a real case", run: () => { assert.equal(1, 1); } }],
  fd: 3,
  maxBytes: 4096,
});
`;
const FALSE_REQUIRED = `import assert from "node:assert/strict";
import test from "node:test";
test("one", () => assert.equal(1, 1));
test("two", () => assert.equal(2, 2));
`;

function write(root, relPath, content) {
  const target = join(root, relPath);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content);
}

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "verify-case-completion-"));
  write(root, "harness/scripts/verify.mjs", `
const SCOPED_VERIFY_SUITES = Object.freeze([
  Object.freeze({ name: "scoped-legacy", file: "plugins/pipeline-core/lib/scoped.test.mjs" }),
]);
const WINDOWS_ASSURANCE_VERIFY_SUITES = Object.freeze([
  Object.freeze({ name: "windows-legacy", file: "plugins/pipeline-core/lib/windows.test.mjs" }),
]);
const TEST_SUITES = [
  { name: "legacy", file: join(libDir, "legacy.test.mjs") },
  { name: "required", file: join(libDir, "required.test.mjs") },
];
`);
  write(root, "plugins/pipeline-core/lib/legacy.test.mjs", LEGACY);
  write(root, "plugins/pipeline-core/lib/required.test.mjs", REQUIRED);
  write(root, "plugins/pipeline-core/lib/scoped.test.mjs", TOP_LEVEL);
  write(root, "plugins/pipeline-core/lib/windows.test.mjs", LEGACY);
  write(root, REASON, "# tracked migration reason\n");
  write(root, DEFAULT_SCHEMA, SCHEMA_SOURCE);
  const registry = {
    schema: "pipeline.verify-case-completion-registry.v1",
    entries: [
      { name: "legacy", path: "plugins/pipeline-core/lib/legacy.test.mjs", disposition: "legacy-process-only", reason: REASON },
      { name: "required", path: "plugins/pipeline-core/lib/required.test.mjs", disposition: "required" },
      { name: "scoped-legacy", path: "plugins/pipeline-core/lib/scoped.test.mjs", disposition: "legacy-process-only", reason: REASON },
      { name: "windows-legacy", path: "plugins/pipeline-core/lib/windows.test.mjs", disposition: "legacy-process-only", reason: REASON },
    ],
  };
  write(root, DEFAULT_REGISTRY, `${JSON.stringify(registry, null, 2)}\n`);
  return { root, registry };
}

function git(root, args) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8", shell: false });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

test("the repository registry covers all arrays and corrects the old static-only 166 count", () => {
  const result = checkVerifyCaseCompletion({ root: REPO_ROOT });
  assert.equal(result.ok, true, result.findings.join("\n"));
  assert.equal(result.vulnerableCount, 170);
  assert.equal(result.registryCount, 172);
});

test("the closed classifier distinguishes vulnerable and separately registered cases", () => {
  assert.equal(classifyVulnerableSuite(LEGACY)?.classification, "throwing-check-wrapper");
  assert.equal(classifyVulnerableSuite(TOP_LEVEL)?.classification, "top-level-assertions");
  assert.equal(classifyVulnerableSuite(REQUIRED), null);
  const mixed = `import { test as roundLTest } from "node:test";
import assert from "node:assert/strict";
roundLTest("native one", () => assert.equal(1, 1));
roundLTest("native two", () => assert.equal(2, 2));
function check(name, fn) { fn(); }
check("legacy one", () => assert.equal(1, 1));
check("legacy two", () => assert.equal(2, 2));
`;
  assert.equal(classifyVulnerableSuite(mixed)?.classification, "throwing-check-wrapper");
  const runWrapper = mixed.replace(/function check/g, "function run").replace(/^check\(/gmu, "run(");
  assert.equal(classifyVulnerableSuite(runWrapper)?.classification, "throwing-check-wrapper");
  const methods = `import { test as roundLTest } from "node:test";
import assert from "node:assert/strict";
roundLTest("native one", () => assert.equal(1, 1));
roundLTest("native two", () => assert.equal(2, 2));
registry.test("method one");
registry.test("method two");
`;
  assert.equal(classifyVulnerableSuite(methods), null, "method .test calls are not node:test registrations");
  assert.equal(
    classifyVulnerableSuite(readFileSync(join(REPO_ROOT, "harness/scripts/print-verify-failures.test.mjs"), "utf8"))?.classification,
    "throwing-check-wrapper",
    "the mixed reporter suite that exposed this gap remains in the inventory",
  );
  const context = fixture();
  const result = checkVerifyCaseCompletion({ root: context.root });
  assert.equal(result.ok, true, result.findings.join("\n"));
  assert.equal(result.registeredCount, 4);
  assert.equal(result.vulnerableCount, 3, "scoped and Windows arrays must be scanned too");
});

test("missing, new, duplicate, and stale registry entries fail closed", () => {
  const context = fixture();
  context.registry.entries = context.registry.entries.filter((entry) => entry.name !== "scoped-legacy");
  context.registry.entries.push({ name: "legacy", path: "plugins/pipeline-core/lib/legacy.test.mjs", disposition: "legacy-process-only", reason: REASON });
  context.registry.entries.push({ name: "gone", path: "plugins/pipeline-core/lib/gone.test.mjs", disposition: "required" });
  write(context.root, DEFAULT_REGISTRY, `${JSON.stringify(context.registry)}\n`);
  const result = checkVerifyCaseCompletion({ root: context.root });
  assert.equal(result.ok, false);
  assert.ok(result.findings.some((finding) => finding.startsWith("VULNERABLE-UNREGISTERED scoped-legacy")));
  assert.ok(result.findings.some((finding) => finding.startsWith("REGISTRY-DUPLICATE legacy")));
  assert.ok(result.findings.some((finding) => finding.startsWith("REGISTRY-STALE gone")));
});

test("unknown fields and missing backlog reasons cannot widen the registry", () => {
  const context = fixture();
  context.registry.entries[0].extra = true;
  context.registry.entries[0].reason = "docs/not-a-backlog-item.md";
  write(context.root, DEFAULT_REGISTRY, `${JSON.stringify(context.registry)}\n`);
  const result = checkVerifyCaseCompletion({ root: context.root });
  assert.equal(result.ok, false);
  assert.ok(result.findings.some((finding) => finding.startsWith("REGISTRY-SHAPE registry entry 0")));
  assert.ok(result.findings.some((finding) => finding.startsWith("REGISTRY-REASON registry entry 0")));
});

test("a touched legacy suite must migrate in the same candidate", () => {
  const context = fixture();
  const red = checkVerifyCaseCompletion({ root: context.root, changedPaths: ["plugins/pipeline-core/lib/legacy.test.mjs"] });
  assert.equal(red.ok, false);
  assert.ok(red.findings.includes("LEGACY-TOUCHED legacy must migrate to required in the same candidate"));
  context.registry.entries[0] = { name: "legacy", path: "plugins/pipeline-core/lib/legacy.test.mjs", disposition: "required" };
  write(context.root, "plugins/pipeline-core/lib/legacy.test.mjs", REQUIRED);
  write(context.root, DEFAULT_REGISTRY, `${JSON.stringify(context.registry)}\n`);
  const green = checkVerifyCaseCompletion({ root: context.root, changedPaths: ["plugins/pipeline-core/lib/legacy.test.mjs"] });
  assert.equal(green.ok, true, green.findings.join("\n"));
});

test("base/candidate mode reads the candidate registry and enforces same-candidate migration", () => {
  const context = fixture();
  git(context.root, ["init", "-q"]);
  git(context.root, ["config", "user.email", "fixture@example.invalid"]);
  git(context.root, ["config", "user.name", "Fixture"]);
  git(context.root, ["add", "."]);
  git(context.root, ["commit", "-qm", "base"]);
  const base = git(context.root, ["rev-parse", "HEAD"]);
  write(context.root, "plugins/pipeline-core/lib/legacy.test.mjs", `${LEGACY}\n// touched\n`);
  git(context.root, ["add", "."]);
  git(context.root, ["commit", "-qm", "touch legacy"]);
  const legacyCandidate = git(context.root, ["rev-parse", "HEAD"]);
  const red = checkVerifyCaseCompletion({ root: context.root, base, candidate: legacyCandidate });
  assert.equal(red.ok, false);
  assert.ok(red.findings.some((finding) => finding.startsWith("LEGACY-TOUCHED legacy")));

  context.registry.entries[0] = { name: "legacy", path: "plugins/pipeline-core/lib/legacy.test.mjs", disposition: "required" };
  write(context.root, "plugins/pipeline-core/lib/legacy.test.mjs", REQUIRED);
  write(context.root, DEFAULT_REGISTRY, `${JSON.stringify(context.registry)}\n`);
  git(context.root, ["add", "."]);
  git(context.root, ["commit", "-qm", "migrate registry"]);
  const requiredCandidate = git(context.root, ["rev-parse", "HEAD"]);
  const green = checkVerifyCaseCompletion({ root: context.root, base, candidate: requiredCandidate });
  assert.equal(green.ok, true, green.findings.join("\n"));
});

test("required cannot claim protocol coverage from separate node:test cases alone", () => {
  const context = fixture();
  write(context.root, "plugins/pipeline-core/lib/required.test.mjs", FALSE_REQUIRED);
  const result = checkVerifyCaseCompletion({ root: context.root });
  assert.equal(result.ok, false);
  assert.ok(result.findings.includes("REQUIRED-PROTOCOL required does not import and invoke registerTestCaseCompletion"));
});

test("required cannot claim an unreachable helper call as normal suite setup", () => {
  for (const unreachable of [
    `import { registerTestCaseCompletion } from "./test-case-completion.mjs";
function dormant() { registerTestCaseCompletion({ cases: [], fd: 3, maxBytes: 4096 }); }
`,
    `import { registerTestCaseCompletion } from "./test-case-completion.mjs";
if (false) { registerTestCaseCompletion({ cases: [], fd: 3, maxBytes: 4096 }); }
`,
    `import { registerTestCaseCompletion } from "./test-case-completion.mjs";
if (false)
registerTestCaseCompletion({ cases: [], fd: 3, maxBytes: 4096 });
`,
    `import { registerTestCaseCompletion } from "./test-case-completion.mjs";
process.exit(0);
registerTestCaseCompletion({ cases: [], fd: 3, maxBytes: 4096 });
`,
  ]) {
    const context = fixture();
    write(context.root, "plugins/pipeline-core/lib/required.test.mjs", unreachable);
    const result = checkVerifyCaseCompletion({ root: context.root });
    assert.equal(result.ok, false);
    assert.ok(result.findings.includes("REQUIRED-PROTOCOL required does not import and invoke registerTestCaseCompletion"));
  }
});

test("required cannot alias a recorder or use an open registration configuration", () => {
  for (const impostor of [
    `import { createTestCaseCompletionRecorder as registerTestCaseCompletion } from "./test-case-completion.mjs";
registerTestCaseCompletion({ cases: [], fd: 3, maxBytes: 4096 });
`,
    `import { registerTestCaseCompletion } from "./test-case-completion.mjs";
registerTestCaseCompletion({ cases: [], fd: 3, maxBytes: 4096, extra: true });
`,
    `import { registerTestCaseCompletion } from "./test-case-completion.mjs";
const configuration = { cases: [], fd: 3, maxBytes: 4096 };
registerTestCaseCompletion(configuration);
`,
  ]) {
    const context = fixture();
    write(context.root, "plugins/pipeline-core/lib/required.test.mjs", impostor);
    const result = checkVerifyCaseCompletion({ root: context.root });
    assert.equal(result.ok, false);
    assert.ok(result.findings.includes("REQUIRED-PROTOCOL required does not import and invoke registerTestCaseCompletion"));
  }
});

test("required must resolve the import to the shipped completion helper", () => {
  const context = fixture();
  write(context.root, "plugins/pipeline-core/lib/required.test.mjs", REQUIRED.replace(
    'from "./test-case-completion.mjs"',
    'from "./fixtures/test-case-completion.mjs"',
  ));
  write(context.root, "plugins/pipeline-core/lib/fixtures/test-case-completion.mjs", "export function registerTestCaseCompletion() {}\n");
  const result = checkVerifyCaseCompletion({ root: context.root });
  assert.equal(result.ok, false);
  assert.ok(result.findings.includes("REQUIRED-PROTOCOL required does not import and invoke registerTestCaseCompletion"));
});

test("every Verify array entry must use the closed literal registration grammar", () => {
  for (const mutation of [
    (source) => source.replace(
      "const TEST_SUITES = [",
      'const HIDDEN = "hidden";\nconst TEST_SUITES = [\n  { name: HIDDEN, file: join(libDir, "hidden.test.mjs") },',
    ),
    (source) => source.replace(
      "const SCOPED_VERIFY_SUITES = Object.freeze([",
      "const SCOPED_VERIFY_SUITES = Object.freeze([\n  ...hiddenSuites,",
    ),
    (source) => source.replace(
      "const WINDOWS_ASSURANCE_VERIFY_SUITES = Object.freeze([",
      'const WINDOWS_ASSURANCE_VERIFY_SUITES = Object.freeze([\n  Object.freeze({ name: WINDOWS_NAME, file: "plugins/pipeline-core/lib/hidden.test.mjs" }),',
    ),
  ]) {
    const context = fixture();
    const verifyPath = join(context.root, "harness/scripts/verify.mjs");
    writeFileSync(verifyPath, mutation(readFileSync(verifyPath, "utf8")));
    const result = checkVerifyCaseCompletion({ root: context.root });
    assert.equal(result.ok, false);
    assert.ok(result.findings.some((finding) => finding.includes("outside the closed literal registration grammar")), result.findings.join("\n"));
  }
});

test("the candidate schema is loaded and enforced in worktree and Git blob modes", () => {
  const context = fixture();
  git(context.root, ["init", "-q"]);
  git(context.root, ["config", "user.email", "fixture@example.invalid"]);
  git(context.root, ["config", "user.name", "Fixture"]);
  git(context.root, ["add", "."]);
  git(context.root, ["commit", "-qm", "base"]);
  const base = git(context.root, ["rev-parse", "HEAD"]);

  const schema = JSON.parse(SCHEMA_SOURCE);
  schema.required.push("candidateMarker");
  schema.properties.candidateMarker = { type: "string" };
  write(context.root, DEFAULT_SCHEMA, `${JSON.stringify(schema, null, 2)}\n`);
  const worktree = checkVerifyCaseCompletion({ root: context.root });
  assert.equal(worktree.ok, false);
  assert.ok(worktree.findings.some((finding) => finding.includes('missing required property "candidateMarker"')));

  git(context.root, ["add", "."]);
  git(context.root, ["commit", "-qm", "change candidate schema"]);
  const candidate = git(context.root, ["rev-parse", "HEAD"]);
  const blob = checkVerifyCaseCompletion({ root: context.root, base, candidate });
  assert.equal(blob.ok, false);
  assert.ok(blob.findings.some((finding) => finding.includes('missing required property "candidateMarker"')));
});

test("a newly registered existing suite cannot enter as legacy", () => {
  const context = fixture();
  write(context.root, "plugins/pipeline-core/lib/dormant.test.mjs", LEGACY);
  git(context.root, ["init", "-q"]);
  git(context.root, ["config", "user.email", "fixture@example.invalid"]);
  git(context.root, ["config", "user.name", "Fixture"]);
  git(context.root, ["add", "."]);
  git(context.root, ["commit", "-qm", "base"]);
  const base = git(context.root, ["rev-parse", "HEAD"]);
  const verifyPath = join(context.root, "harness/scripts/verify.mjs");
  writeFileSync(verifyPath, readFileSync(verifyPath, "utf8").replace(
    "const TEST_SUITES = [",
    "const TEST_SUITES = [\n  { name: \"dormant\", file: join(libDir, \"dormant.test.mjs\") },",
  ));
  context.registry.entries.push({
    name: "dormant",
    path: "plugins/pipeline-core/lib/dormant.test.mjs",
    disposition: "legacy-process-only",
    reason: REASON,
  });
  context.registry.entries.sort((left, right) => left.name.localeCompare(right.name));
  write(context.root, DEFAULT_REGISTRY, `${JSON.stringify(context.registry)}\n`);
  git(context.root, ["add", "."]);
  git(context.root, ["commit", "-qm", "register dormant"]);
  const candidate = git(context.root, ["rev-parse", "HEAD"]);
  const result = checkVerifyCaseCompletion({ root: context.root, base, candidate });
  assert.equal(result.ok, false);
  assert.ok(result.findings.includes("LEGACY-NEW dormant is a new Verify registration and must start as required"));
});

test("the CLI rejects unpaired refs and unknown arguments", () => {
  const script = fileURLToPath(new URL("./check-verify-case-completion.mjs", import.meta.url));
  for (const args of [["--base", "HEAD"], ["--wat"]]) {
    const result = spawnSync(process.execPath, [script, ...args], { cwd: REPO_ROOT, encoding: "utf8", shell: false });
    assert.equal(result.status, 2);
  }
});
