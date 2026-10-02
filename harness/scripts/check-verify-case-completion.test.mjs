#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, openSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { registerTestCaseCompletion } from "../../plugins/pipeline-core/lib/test-case-completion.mjs";
import { parseVerifyCaseCompletion, verifyCaseCompletionPolicySha256 } from "../../plugins/pipeline-core/lib/verify-case-completion-receipt.mjs";

import {
  DEFAULT_REGISTRY,
  DEFAULT_SCHEMA,
  checkVerifyCaseCompletion,
  classifyVulnerableSuite,
} from "./check-verify-case-completion.mjs";

const REPO_ROOT = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const schemaSource = () => readFileSync(join(REPO_ROOT, DEFAULT_SCHEMA), "utf8");
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
const IMPORT_KEYWORD = "import";
const REQUIRED = `${IMPORT_KEYWORD} assert from "node:assert/strict";
${IMPORT_KEYWORD} { registerTestCaseCompletion } from "./test-case-completion.mjs";
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

const cases = [];
function check(id, name, run) {
  cases.push({ id, name, run });
}

function write(root, relPath, content) {
  const target = join(root, relPath);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content);
}

function requireLegacyVerifyPolicy(root) {
  const verifyPath = "harness/scripts/verify.mjs";
  const source = readFileSync(join(root, verifyPath), "utf8");
  const from = '  { name: "legacy", file: join(libDir, "legacy.test.mjs") },';
  const to = '  { name: "legacy", file: join(libDir, "legacy.test.mjs"), caseCompletion: { schema: "pipeline.verify-case-completion-policy.v1", caseIds: ["case-one"], maxBytes: 4096 } },';
  assert.equal(source.split(from).length, 2);
  write(root, verifyPath, source.replace(from, to));
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
  { name: "required", file: join(libDir, "required.test.mjs"), caseCompletion: { schema: "pipeline.verify-case-completion-policy.v1", caseIds: ["case-one"], maxBytes: 4096 } },
];
`);
  write(root, "plugins/pipeline-core/lib/legacy.test.mjs", LEGACY);
  write(root, "plugins/pipeline-core/lib/required.test.mjs", REQUIRED);
  write(root, "plugins/pipeline-core/lib/scoped.test.mjs", TOP_LEVEL);
  write(root, "plugins/pipeline-core/lib/windows.test.mjs", LEGACY);
  write(root, REASON, "# tracked migration reason\n");
  write(root, DEFAULT_SCHEMA, schemaSource());
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

check("VCR01", "the repository registry covers all arrays and pins the observed required-descriptor counts", () => {
  const result = checkVerifyCaseCompletion({ root: REPO_ROOT });
  assert.equal(result.ok, true, result.findings.join("\n"));
  assert.equal(result.vulnerableCount, 266);
  assert.equal(result.registryCount, 273);
});

check("VCR02", "the closed classifier distinguishes vulnerable and separately registered cases", () => {
  assert.equal(classifyVulnerableSuite(LEGACY)?.classification, "throwing-check-wrapper");
  assert.equal(classifyVulnerableSuite(TOP_LEVEL)?.classification, "top-level-assertions");
  assert.equal(classifyVulnerableSuite(REQUIRED), null);
  const regexFixture = fixture();
  try {
    const requiredWithRegexBrace = REQUIRED.replace(
      "registerTestCaseCompletion({",
      'assert.match("POST_COMPACT_REGROUND {", /^POST_COMPACT_REGROUND \\{/);\nregisterTestCaseCompletion({',
    );
    write(regexFixture.root, "plugins/pipeline-core/lib/required.test.mjs", requiredWithRegexBrace);
    const result = checkVerifyCaseCompletion({ root: regexFixture.root });
    assert.equal(result.ok, true, result.findings.join("\n"));
    assert.equal(
      result.findings.some((finding) => finding.includes("REQUIRED-PROTOCOL required")),
      false,
      "a regex brace before a genuine top-level registration must not hide its protocol",
    );
  } finally {
    rmSync(regexFixture.root, { recursive: true, force: true });
  }
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

check("VCR03", "missing, new, duplicate, and stale registry entries fail closed", () => {
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

check("VCR04", "unknown fields and missing backlog reasons cannot widen the registry", () => {
  const context = fixture();
  context.registry.entries[0].extra = true;
  context.registry.entries[0].reason = "docs/not-a-backlog-item.md";
  write(context.root, DEFAULT_REGISTRY, `${JSON.stringify(context.registry)}\n`);
  const result = checkVerifyCaseCompletion({ root: context.root });
  assert.equal(result.ok, false);
  assert.ok(result.findings.some((finding) => finding.startsWith("REGISTRY-SHAPE registry entry 0")));
  assert.ok(result.findings.some((finding) => finding.startsWith("REGISTRY-REASON registry entry 0")));
});

check("VCR05", "a touched legacy suite must migrate in the same candidate", () => {
  const context = fixture();
  const red = checkVerifyCaseCompletion({ root: context.root, changedPaths: ["plugins/pipeline-core/lib/legacy.test.mjs"] });
  assert.equal(red.ok, false);
  assert.ok(red.findings.includes("LEGACY-TOUCHED legacy must migrate to required in the same candidate"));
  context.registry.entries[0] = { name: "legacy", path: "plugins/pipeline-core/lib/legacy.test.mjs", disposition: "required" };
  write(context.root, "plugins/pipeline-core/lib/legacy.test.mjs", REQUIRED);
  requireLegacyVerifyPolicy(context.root);
  write(context.root, DEFAULT_REGISTRY, `${JSON.stringify(context.registry)}\n`);
  const green = checkVerifyCaseCompletion({ root: context.root, changedPaths: ["plugins/pipeline-core/lib/legacy.test.mjs"] });
  assert.equal(green.ok, true, green.findings.join("\n"));
});

check("VCR06", "base/candidate mode reads the candidate registry and enforces same-candidate migration", () => {
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
  requireLegacyVerifyPolicy(context.root);
  write(context.root, DEFAULT_REGISTRY, `${JSON.stringify(context.registry)}\n`);
  git(context.root, ["add", "."]);
  git(context.root, ["commit", "-qm", "migrate registry"]);
  const requiredCandidate = git(context.root, ["rev-parse", "HEAD"]);
  const green = checkVerifyCaseCompletion({ root: context.root, base, candidate: requiredCandidate });
  assert.equal(green.ok, true, green.findings.join("\n"));
});

check("VCR07", "required needs both the suite protocol and the Verify-side completion policy", () => {
  const context = fixture();
  write(context.root, "plugins/pipeline-core/lib/required.test.mjs", FALSE_REQUIRED);
  const result = checkVerifyCaseCompletion({ root: context.root });
  assert.equal(result.ok, false);
  assert.ok(result.findings.includes("REQUIRED-PROTOCOL required does not import and invoke registerTestCaseCompletion"));

  write(context.root, "plugins/pipeline-core/lib/required.test.mjs", REQUIRED);
  const verifyPath = "harness/scripts/verify.mjs";
  const verify = readFileSync(join(context.root, verifyPath), "utf8");
  const withoutPolicy = verify.replace(', caseCompletion: { schema: "pipeline.verify-case-completion-policy.v1", caseIds: ["case-one"], maxBytes: 4096 }', "");
  assert.notEqual(withoutPolicy, verify);
  write(context.root, verifyPath, withoutPolicy);
  const missingPolicy = checkVerifyCaseCompletion({ root: context.root });
  assert.equal(missingPolicy.ok, false);
  assert.ok(missingPolicy.findings.includes("REQUIRED-VERIFY-POLICY required has no Verify caseCompletion policy"));

  for (const nullish of ["null", "undefined", "(null)", "(undefined)", "null ?? {}", "{ ...runtimePolicy }", "{ ...undefined }"]){
    write(context.root, verifyPath, verify.replace(/caseCompletion:\s*\{[^}]+\}/u, `caseCompletion: ${nullish}`));
    const nullishPolicy = checkVerifyCaseCompletion({ root: context.root });
    assert.equal(nullishPolicy.ok, false, nullish);
    assert.ok(nullishPolicy.findings.includes("REQUIRED-VERIFY-POLICY required has no Verify caseCompletion policy"), nullish);
  }
});

check("VCR08", "required cannot claim an unreachable helper call as normal suite setup", () => {
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

check("VCR09", "required cannot alias a recorder or use an open registration configuration", () => {
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
  const onboardingPath = "plugins/pipeline-core/lib/project-onboarding-v3.test.mjs";
  const actualSource = readFileSync(join(REPO_ROOT, onboardingPath), "utf8");
  function onboardingFixture(source, path = onboardingPath) {
    const context = fixture();
    const verifyPath = "harness/scripts/verify.mjs";
    write(context.root, verifyPath, readFileSync(join(context.root, verifyPath), "utf8").replace(
      'join(libDir, "required.test.mjs")', `join(libDir, "${path.split("/").at(-1)}")`,
    ));
    context.registry.entries.find((entry) => entry.name === "required").path = path;
    write(context.root, DEFAULT_REGISTRY, JSON.stringify(context.registry));
    write(context.root, path, source);
    return context;
  }
  const actual = onboardingFixture(actualSource);
  const positive = checkVerifyCaseCompletion({ root: actual.root });
  assert.equal(positive.ok, true, positive.findings.join("\n"));
  const mutations = [
    ["wrong suite path", (source) => source, "plugins/pipeline-core/lib/required.test.mjs"],
    ["helper alias", (source) => source.replace("{ createTestCaseCompletionRecorder }", "{ registerTestCaseCompletion as createTestCaseCompletionRecorder }")],
    ["foreign helper path", (source) => source.replace('from "./test-case-completion.mjs"', 'from "./fixtures/test-case-completion.mjs"')],
    ["disabled orchestration", (source) => source.replace("const ORCHESTRATING_SHARDS = DIRECT_INVOCATION && shard === null;", "const ORCHESTRATING_SHARDS = false;")],
    ["disabled direct invocation", (source) => source.replace("const DIRECT_INVOCATION = isDirectInvocation(import.meta.url);", "const DIRECT_INVOCATION = false;")],
    ["false branch", (source) => source.replace("if (ORCHESTRATING_SHARDS) {", "if (false) {")],
    ["unconditional exit before orchestration", (source) => source.replace("if (ORCHESTRATING_SHARDS) {", "process.exit(0);\nif (ORCHESTRATING_SHARDS) {")],
    ["unbraced false before orchestration", (source) => source.replace("if (ORCHESTRATING_SHARDS) {", "if (false)\nif (ORCHESTRATING_SHARDS) {")],
    ["dormant recorder", (source) => source.replace("const recorder = createTestCaseCompletionRecorder({", "function dormant() { const recorder = createTestCaseCompletionRecorder({").replace("  assertShardControllerContract();", "  }\n  assertShardControllerContract();")],
    ["exit before recorder", (source) => source.replace("  const recorder = createTestCaseCompletionRecorder({", "  process.exit(0);\n  const recorder = createTestCaseCompletionRecorder({")],
    ["open recorder object", (source) => source.replace("caseIds: ONBOARDING_CASE_IDS, fd: completionFd,", "caseIds: ONBOARDING_CASE_IDS, fd: completionFd, extra: true,")],
    ["spread recorder object", (source) => source.replace("caseIds: ONBOARDING_CASE_IDS, fd: completionFd,", "...configuration, caseIds: ONBOARDING_CASE_IDS, fd: completionFd,")],
    ["duplicate recorder key", (source) => source.replace("caseIds: ONBOARDING_CASE_IDS, fd: completionFd,", "caseIds: ONBOARDING_CASE_IDS, fd: completionFd, fd: completionFd,")],
    ["foreign case set", (source) => source.replace("caseIds: ONBOARDING_CASE_IDS, fd: completionFd,", "caseIds: unrelatedIds, fd: completionFd,")],
    ["discarded completion fd", (source) => source.replace("caseIds: ONBOARDING_CASE_IDS, fd: completionFd,", "caseIds: ONBOARDING_CASE_IDS, fd: 3,")],
    ["unawaited shards", (source) => source.replace("const results = await runShards(recorder);", "const results = runShards(recorder);")],
    ["exit before shards", (source) => source.replace("const results = await runShards(recorder);", "process.exit(0);\n  const results = await runShards(recorder);")],
    ["foreign recorder argument", (source) => source.replace("const results = await runShards(recorder);", "const results = await runShards(other);")],
    ["absent close validation", (source) => source.replace("const receipt = receiver.close(code, signal);", "const receipt = receiver.receipt;")],
    ["fabricated pass disposition", (source) => source.replace("recorder.dispose(result.id, result.disposition)", 'recorder.dispose(result.id, "pass")')],
    ["noncanonical declaration", (source) => source.replace("ONBOARDING_TEST_CASES.map((entry) => entry.id).sort()", "unrelatedIds")],
  ];
  for (const [name, mutate, path] of mutations) {
    const impostor = mutate(actualSource);
    if (path === undefined) assert.notEqual(impostor, actualSource, name);
    const context = onboardingFixture(impostor, path);
    const result = checkVerifyCaseCompletion({ root: context.root });
    assert.equal(result.ok, false, name);
    assert.ok(result.findings.includes("REQUIRED-PROTOCOL required does not import and invoke registerTestCaseCompletion"), name);
  }
});

check("VCR10", "required must resolve the import to the shipped completion helper", () => {
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

check("VCR11", "every Verify array entry must use the closed literal registration grammar", () => {
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

check("VCR12", "the candidate schema is loaded and enforced in worktree and Git blob modes", () => {
  const context = fixture();
  git(context.root, ["init", "-q"]);
  git(context.root, ["config", "user.email", "fixture@example.invalid"]);
  git(context.root, ["config", "user.name", "Fixture"]);
  git(context.root, ["add", "."]);
  git(context.root, ["commit", "-qm", "base"]);
  const base = git(context.root, ["rev-parse", "HEAD"]);

  const schema = JSON.parse(schemaSource());
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

check("VCR13", "a newly registered existing suite cannot enter as legacy", () => {
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

check("VCR14", "the CLI rejects unpaired refs and unknown arguments", () => {
  const script = fileURLToPath(new URL("./check-verify-case-completion.mjs", import.meta.url));
  for (const args of [["--base", "HEAD"], ["--wat"]]) {
    const result = spawnSync(process.execPath, [script, ...args], { cwd: REPO_ROOT, encoding: "utf8", shell: false });
    assert.equal(result.status, 2);
  }
});


const DECLARATIVE = "harness/verify-suites.json";
const declarativePolicy = () => ({ schema: "pipeline.verify-case-completion-policy.v1", caseIds: ["case-one"], maxBytes: 4096 });
function declarativeFixture() {
  const context = fixture();
  const suite = { name: "declarative-required", file: "plugins/pipeline-core/lib/declarative.test.mjs",
    caseCompletion: declarativePolicy(), invariantPinned: "actual completion contract", nonOverlapNote: "declarative reader admission" };
  write(context.root, suite.file, REQUIRED);
  context.registry.entries.push({ name: suite.name, path: suite.file, disposition: "required" });
  context.registry.entries.sort((a,b) => a.name.localeCompare(b.name));
  write(context.root, DEFAULT_REGISTRY, JSON.stringify(context.registry));
  const document = { schema: "pipeline.verify-suites.v1", suites: [suite] };
  write(context.root, DECLARATIVE, JSON.stringify(document));
  return { ...context, suite, document };
}
function saveDeclarative(f) { write(f.root, DECLARATIVE, JSON.stringify(f.document)); }
function initializeCandidate(f) {
  git(f.root, ["init", "-q"]); git(f.root, ["config", "user.email", "fixture@example.invalid"]);
  git(f.root, ["config", "user.name", "Fixture"]); git(f.root, ["add", "."]);
  git(f.root, ["commit", "-qm", "candidate fixture"]); return git(f.root, ["rev-parse", "HEAD"]);
}
function hasFinding(f, prefix, options = {}) {
  const result = checkVerifyCaseCompletion({ root: f.root, ...options });
  assert.equal(result.ok, false, JSON.stringify(result));
  assert.ok(result.findings.some(x => x.startsWith(prefix)), result.findings.join("\n"));
  return result;
}

check("VCR15", "required declarative suite is admitted from canonical closed JSON with real protocol", () => {
  const f = declarativeFixture(), result = checkVerifyCaseCompletion({ root: f.root });
  assert.equal(result.ok, true, result.findings.join("\n"));
  assert.equal(result.registeredCount, 5); assert.equal(result.registryCount, 5);
});

check("VCR16", "required declarative registration still needs an explicit completion policy", () => {
  const f = declarativeFixture(); delete f.suite.caseCompletion; saveDeclarative(f);
  hasFinding(f, "REQUIRED-VERIFY-POLICY declarative-required");
});

check("VCR17", "required declarative registration still needs actual reachable shipped protocol", () => {
  const f = declarativeFixture(); write(f.root, f.suite.file, FALSE_REQUIRED);
  hasFinding(f, "REQUIRED-PROTOCOL declarative-required");
});

check("VCR18", "canonical declarative schema and unknown fields fail closed", () => {
  for (const mutate of [d => { d.schema = "other"; }, d => { d.extra = true; },
    d => { d.suites[0].extra = true; }, d => { d.suites = {}; }]) {
    const f = declarativeFixture(); mutate(f.document); saveDeclarative(f); hasFinding(f, "DECLARATIVE-SCHEMA");
  }
  const f = declarativeFixture(); write(f.root, DECLARATIVE, "{broken"); hasFinding(f, "DECLARATIVE-READ");
});

check("VCR19", "declarative path and full runtime completion policy constraints are enforced", () => {
  for (const file of ["../escape.test.mjs", "/tmp/escape.test.mjs", "plugins//bad.test.mjs", "plugins/../bad.test.mjs", "plugins\\bad.test.mjs"]) {
    const f = declarativeFixture(); f.suite.file = file; saveDeclarative(f); hasFinding(f, "DECLARATIVE-PATH");
  }
  for (const ids of [[], ["duplicate", "duplicate"], ["z", "a"], ["1invalid"], ["a".repeat(65)]]) {
    const f = declarativeFixture(); f.suite.caseCompletion.caseIds = ids; saveDeclarative(f); hasFinding(f, "DECLARATIVE-POLICY");
  }
  const f = declarativeFixture(); f.suite.caseCompletion.maxBytes = 1048577; saveDeclarative(f); hasFinding(f, "DECLARATIVE-POLICY");
});

check("VCR20", "duplicate suite IDs and missing files fail while distinct IDs may share a canonical file", () => {
  const f = declarativeFixture(); f.document.suites.push({ ...f.suite }); saveDeclarative(f);
  hasFinding(f, "VERIFY-DUPLICATE declarative-required");
  const g = declarativeFixture(); g.document.suites.push({ ...g.suite, name: "other-name" }); saveDeclarative(g);
  g.registry.entries.push({ name: "other-name", path: g.suite.file, disposition: "required" });
  g.registry.entries.sort((a,b) => a.name.localeCompare(b.name)); write(g.root, DEFAULT_REGISTRY, JSON.stringify(g.registry));
  const sharedPath = checkVerifyCaseCompletion({ root: g.root });
  assert.equal(sharedPath.ok, true, sharedPath.findings.join("\n"));
  assert.equal(sharedPath.registeredCount, 6, "canonical Verify journals distinct suite IDs even when files match");
  const h = declarativeFixture(); rmSync(join(h.root, h.suite.file)); hasFinding(h, "VERIFY-MISSING declarative-required");
  const i = declarativeFixture(); i.document.suites.push({ ...i.suite, name: "required", file: "plugins/pipeline-core/lib/other.test.mjs" });
  saveDeclarative(i); hasFinding(i, "VERIFY-DUPLICATE required");
});

check("VCR21", "physical declarative directory and outside-repository alias cannot become absence", () => {
  const f = declarativeFixture(); rmSync(join(f.root, DECLARATIVE)); mkdirSync(join(f.root, DECLARATIVE)); hasFinding(f, "DECLARATIVE-READ");
  const g = declarativeFixture(), outside = mkdtempSync(join(tmpdir(), "declarative-outside-")), file = join(outside, "manifest.json");
  writeFileSync(file, JSON.stringify(g.document)); rmSync(join(g.root, DECLARATIVE)); symlinkSync(file, join(g.root, DECLARATIVE));
  hasFinding(g, "DECLARATIVE-READ");
});

check("VCR22", "candidate JSON, policy and suite bytes cannot borrow matching working-tree bytes", () => {
  const f = declarativeFixture(), base = initializeCandidate(f);
  assert.equal(checkVerifyCaseCompletion({ root: f.root, base, candidate: base }).ok, true);
  delete f.suite.caseCompletion; saveDeclarative(f); git(f.root, ["add", "."]); git(f.root, ["commit", "-qm", "missing candidate policy"]);
  const candidate = git(f.root, ["rev-parse", "HEAD"]); f.suite.caseCompletion = declarativePolicy(); saveDeclarative(f);
  assert.equal(checkVerifyCaseCompletion({ root: f.root }).ok, true);
  hasFinding(f, "REQUIRED-VERIFY-POLICY declarative-required", { base, candidate });
  saveDeclarative(f); write(f.root, f.suite.file, FALSE_REQUIRED); git(f.root, ["add", "."]); git(f.root, ["commit", "-qm", "invalid candidate protocol"]);
  const invalid = git(f.root, ["rev-parse", "HEAD"]); write(f.root, f.suite.file, REQUIRED);
  hasFinding(f, "REQUIRED-PROTOCOL declarative-required", { base, candidate: invalid });
});

check("VCR23", "candidate declarative symlink and wildcard suite paths cannot borrow regular blobs", () => {
  const f = declarativeFixture(), base = initializeCandidate(f);
  write(f.root, "valid-manifest.json", JSON.stringify(f.document)); rmSync(join(f.root, DECLARATIVE));
  symlinkSync("../../valid-manifest.json", join(f.root, DECLARATIVE));
  git(f.root, ["add", "."]); git(f.root, ["commit", "-qm", "candidate symlink"]);
  const candidate = git(f.root, ["rev-parse", "HEAD"]); rmSync(join(f.root, DECLARATIVE)); saveDeclarative(f);
  hasFinding(f, "DECLARATIVE-READ", { base, candidate });
  const g = declarativeFixture(); g.suite.file = "plugins/pipeline-core/lib/*.test.mjs";
  g.registry.entries.find(x => x.name === g.suite.name).path = g.suite.file;
  saveDeclarative(g); write(g.root, DEFAULT_REGISTRY, JSON.stringify(g.registry));
  const globCandidate = initializeCandidate(g);
  hasFinding(g, "VERIFY-MISSING declarative-required", { base: globCandidate, candidate: globCandidate });
});

check("VCR24", "new declarative registration cannot give an existing suite a legacy exemption", () => {
  const f = fixture(); write(f.root, "plugins/pipeline-core/lib/dormant.test.mjs", LEGACY);
  const base = initializeCandidate(f);
  write(f.root, DECLARATIVE, JSON.stringify({ schema: "pipeline.verify-suites.v1", suites: [
    { name: "dormant", file: "plugins/pipeline-core/lib/dormant.test.mjs" }] }));
  f.registry.entries.push({ name: "dormant", path: "plugins/pipeline-core/lib/dormant.test.mjs", disposition: "legacy-process-only", reason: REASON });
  f.registry.entries.sort((a,b) => a.name.localeCompare(b.name)); write(f.root, DEFAULT_REGISTRY, JSON.stringify(f.registry));
  git(f.root, ["add", "."]); git(f.root, ["commit", "-qm", "new declarative legacy"]); const candidate = git(f.root, ["rev-parse", "HEAD"]);
  hasFinding(f, "LEGACY-NEW dormant", { base, candidate });
});

check("VCR25", "base declarative registrations remain present in same-candidate migration inventory", () => {
  const f = declarativeFixture(); delete f.suite.caseCompletion; saveDeclarative(f); write(f.root, f.suite.file, LEGACY);
  const entry = f.registry.entries.find(x => x.name === f.suite.name); entry.disposition = "legacy-process-only"; entry.reason = REASON;
  write(f.root, DEFAULT_REGISTRY, JSON.stringify(f.registry)); const base = initializeCandidate(f);
  write(f.root, "README", "unrelated candidate"); git(f.root, ["add", "."]); git(f.root, ["commit", "-qm", "unrelated"]);
  const candidate = git(f.root, ["rev-parse", "HEAD"]), result = checkVerifyCaseCompletion({ root: f.root, base, candidate });
  assert.equal(result.ok, true, result.findings.join("\n"));
});

check("VCR26", "closed shorthand registration is admitted and produces an actual inherited-FD terminal receipt", () => {
  const f = declarativeFixture();
  const shorthand = `${IMPORT_KEYWORD} assert from "node:assert/strict";
${IMPORT_KEYWORD} { registerTestCaseCompletion } from "./test-case-completion.mjs";
const cases = [{ id: "case-one", name: "actual shorthand case", run: () => assert.equal(1, 1) }];
const fd = Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD);
const maxBytes = 4096;
registerTestCaseCompletion({ cases, fd, maxBytes });
`;
  write(f.root, f.suite.file, shorthand);
  const admitted = checkVerifyCaseCompletion({ root: f.root });
  assert.equal(admitted.ok, true, admitted.findings.join("\n"));
  write(f.root, "plugins/pipeline-core/lib/test-case-completion.mjs", readFileSync(join(REPO_ROOT, "plugins/pipeline-core/lib/test-case-completion.mjs"), "utf8"));
  const actual = spawnSync(process.execPath, [join(f.root, f.suite.file)], {
    cwd: f.root, stdio: ["ignore", "pipe", "pipe", "pipe"], timeout: 10000,
    env: { ...process.env, PIPELINE_VERIFY_CASE_COMPLETION_FD: "3", PIPELINE_VERIFY_CASE_COMPLETION_MAX_BYTES: "4096" },
  });
  assert.equal(actual.status, 0, actual.stderr?.toString());
  const receipt = parseVerifyCaseCompletion(actual.output[3], declarativePolicy());
  assert.equal(receipt.declaredCount, 1); assert.equal(receipt.disposedCount, 1);
  assert.deepEqual(receipt.counts, { pass: 1, fail: 0, skip: 0, todo: 0 });
  for (const properties of ["cases, fd, maxBytes, extra: true", "cases, cases, fd, maxBytes", "...configuration", "cases() {}, fd, maxBytes"]) {
    write(f.root, f.suite.file, shorthand.replace("{ cases, fd, maxBytes }", `{ ${properties} }`));
    hasFinding(f, "REQUIRED-PROTOCOL declarative-required");
  }
});

const AUGMENTATION_FILE = "harness/config/verify-case-completion-augmentations.v1.json";
function supplementary(f) { return { schema: "pipeline.verify-case-completion-augmentations.v1", augmentations: [
  { name: f.suite.name, file: f.suite.file, caseCompletion: declarativePolicy() }] }; }
check("VCR27", "supplementary policy admits required completion without mutating an existing declarative row", () => {
  const f = declarativeFixture(); delete f.suite.caseCompletion; saveDeclarative(f);
  const before = readFileSync(join(f.root, DECLARATIVE));
  write(f.root, AUGMENTATION_FILE, JSON.stringify(supplementary(f)));
  const actual = checkVerifyCaseCompletion({ root: f.root }); assert.equal(actual.ok, true, actual.findings.join("\n"));
  assert.equal(actual.registeredCount, 5); assert.equal(actual.registryCount, 5);
  assert.deepEqual(readFileSync(join(f.root, DECLARATIVE)), before, "augmentation consumes policy without rewriting the append-only row");
});
check("VCR28", "unknown, duplicate, malformed and conflicting supplementary policies fail the canonical gate", () => {
  for (const mutate of [d=>d.augmentations[0].name="unknown",d=>d.augmentations[0].file="../outside.test.mjs",d=>d.augmentations.push(structuredClone(d.augmentations[0])),d=>d.extra=true]) {
    const f = declarativeFixture(); delete f.suite.caseCompletion; saveDeclarative(f); const data = supplementary(f); mutate(data);
    write(f.root, AUGMENTATION_FILE, JSON.stringify(data)); hasFinding(f, "VERIFY-AUGMENTATION");
  }
  const f = declarativeFixture(); write(f.root, AUGMENTATION_FILE, JSON.stringify(supplementary(f))); hasFinding(f, "VERIFY-AUGMENTATION AUG-CONFLICT");
});
check("VCR29", "candidate-bound supplementary JSON cannot borrow worktree policy or hide required historical absence", () => {
  const f = declarativeFixture(); delete f.suite.caseCompletion; saveDeclarative(f); const base = initializeCandidate(f);
  write(f.root, AUGMENTATION_FILE, JSON.stringify(supplementary(f)));
  assert.equal(checkVerifyCaseCompletion({ root: f.root }).ok, true);
  hasFinding(f, "REQUIRED-VERIFY-POLICY declarative-required", { base, candidate: base });
  git(f.root, ["add", "."]); git(f.root, ["commit", "-qm", "supplementary required policy"]); const candidate = git(f.root, ["rev-parse", "HEAD"]);
  write(f.root, AUGMENTATION_FILE, "{broken"); const bound = checkVerifyCaseCompletion({ root: f.root, base, candidate });
  assert.equal(bound.ok, true, bound.findings.join("\n")); hasFinding(f, "VERIFY-AUGMENTATION AUG-READ");
});
check("VCR30", "published supplementary policy cannot be ignored when no matching declarative rows exist", () => {
  const f = fixture(); write(f.root, AUGMENTATION_FILE, JSON.stringify({ schema: "pipeline.verify-case-completion-augmentations.v1", augmentations: [
    { name: "unconsumed", file: "plugins/pipeline-core/lib/required.test.mjs", caseCompletion: declarativePolicy() }] }));
  hasFinding(f, "VERIFY-AUGMENTATION AUG-TARGET");
});

check("VCR31", "strict declarative monotone extension passes the full exact prior policy object to the augmentation loader", () => {
  const f = declarativeFixture();
  const previous = declarativePolicy();
  const next = { ...previous, caseIds: ["case-one", "case-two"] };
  write(f.root, AUGMENTATION_FILE, JSON.stringify({ schema: "pipeline.verify-case-completion-augmentations.v1", augmentations: [
    { name: f.suite.name, file: f.suite.file, previousPolicySha256: verifyCaseCompletionPolicySha256(previous), caseCompletion: next },
  ] }));
  const result = checkVerifyCaseCompletion({ root: f.root });
  assert.equal(result.ok, true, result.findings.join("\n"));
  assert.equal(result.registeredCount, 5); assert.equal(result.registryCount, 5);
  assert.deepEqual(JSON.parse(readFileSync(join(f.root, DECLARATIVE), "utf8")).suites[0].caseCompletion, previous,
    "augmentation uses candidate reader data without rewriting the declarative preimage");
});

check("VCR32", "static boolean case-presence markers cannot authorize a monotone policy extension", () => {
  const f = fixture();
  const previous = declarativePolicy();
  const next = { ...previous, caseIds: ["case-one", "case-two"] };
  write(f.root, AUGMENTATION_FILE, JSON.stringify({ schema: "pipeline.verify-case-completion-augmentations.v1", augmentations: [
    { name: "required", file: "plugins/pipeline-core/lib/required.test.mjs", previousPolicySha256: verifyCaseCompletionPolicySha256(previous), caseCompletion: next },
  ] }));
  hasFinding(f, "VERIFY-AUGMENTATION AUG-PREIMAGE");
});

assert.equal(cases.length, 32, "the complete Verify case-completion registry corpus must be registered before execution begins");
const completionFd = process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD === undefined
  ? openSync(process.platform === "win32" ? "NUL" : "/dev/null", "w")
  : Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD);
registerTestCaseCompletion({
  cases: cases,
  fd: completionFd,
  maxBytes: Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_MAX_BYTES ?? "65536"),
});
