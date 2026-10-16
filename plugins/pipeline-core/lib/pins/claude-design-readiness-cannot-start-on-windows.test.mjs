// SPDX-License-Identifier: SUL-1.0
// Pin for backlog item pipeline.claude-design-readiness-cannot-start-on-windows (AC-124, ALF-C-P19-04).
// ADR-0085 retired the mandatory readiness child route, so the acceptance is pinned two ways:
//  (a) the retirement itself (the producer refuses before parsing, state access or any child launch), and
//  (b) the retained Windows-safe behaviors the three operator hotfixes left in source (K5-10 --runner argv,
//      K3-17 <home>\.local\bin trust without wrappers, K5-12 no $schema/$id handed to the Claude CLI).
// Typed sub-reasons per failure class (R4-9/R4-10) belong to the retired child route and are NOT revived.
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { dirname, resolve, win32 as winPath } from "node:path";
import test from "node:test";

import { buildDesignCourseProducerAction, runDesignCourseV2 } from "../../scripts/design-course-session.mjs";
import { buildRunnerReadinessArgs, invokeRunnerReadinessChild, runRunnerDesignReadinessBootstrap } from "../../scripts/runner-design-readiness-bootstrap.mjs";
import { assessTrustedExecutablePath, resolveTrustedSystemExecutable } from "../trusted-tool-resolution.mjs";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const HEX64 = "a".repeat(64);
const NAMES = ["input", "prd", "spec", "design", "traceability"];
const sources = Object.fromEntries(NAMES.map((name) => [name, { path: `specs/feature/${name}.md`, sha256: HEX64 }]));
const actionInput = (runner) => ({
  root: REPO, runner, stage: "readiness", featureId: "feature", authoringDispatchId: "author-1",
  candidate: { commit: "b".repeat(40), tree: "c".repeat(40) }, sources, outputPrefix: "specs/feature/evidence/design-course/x",
  readinessDispatchId: "readiness-1", queueRevision: 3, receiptPath: "specs/feature/evidence/readiness.json",
  preparationPath: "specs/feature/evidence/preparation.json", sessionId: "sess-1", descriptorSha256: HEX64,
});

// ---- (a) retirement of the mandatory readiness route ----
test("retired: the runner readiness producer refuses before parsing, route, executable or child launch", async () => {
  let touched = 0;
  const deps = new Proxy({}, { get: () => () => { touched += 1; throw new Error("dependency touched"); } });
  for (const argv of [[], ["--garbage"], ["--runner", "claude"]]) {
    const result = await runRunnerDesignReadinessBootstrap(argv, deps);
    assert.deepEqual(result, { ok: false, code: "DESIGN-COURSE-RETIRED",
      hint: "ask an Advisor on demand; run one review; present-plan --review-receipt", implementationAuthority: false });
  }
  assert.equal(touched, 0, "no usage failure (exit 64), no executable resolution, no child spawn");
});

test("retired: the ordinary design course entry grants no implementation authority and starts no readiness child", async () => {
  const result = await runDesignCourseV2({}, new Proxy({}, { get: () => () => { throw new Error("dependency touched"); } }));
  assert.equal(result.ok, false);
  assert.equal(result.code, "DESIGN-COURSE-RETIRED");
  assert.equal(result.implementationAuthority, false);
});

// ---- (b) retained Windows-safe behavior ----
test("K5-10: the non-Codex readiness argv carries --runner first; Codex does not", () => {
  for (const runner of ["claude", "antigravity"]) {
    const action = buildDesignCourseProducerAction(actionInput(runner));
    assert.match(action.producer, /runner-design-readiness-bootstrap\.mjs$/u);
    assert.deepEqual(action.argv.slice(0, 2), ["--runner", runner]);
    assert.equal(action.shell, false);
  }
  const codex = buildDesignCourseProducerAction(actionInput("codex"));
  assert.equal(codex.argv.includes("--runner"), false);
});

const win = (extra = {}) => ({ platform: "win32", homeDir: "C:\\Users\\probe", windowsRoots: [], ...extra });
const bin = "C:\\Users\\probe\\.local\\bin";
const file = { isFile: () => true, isSymbolicLink: () => false };
const fsFixture = (entries) => ({
  lstatSync(path) { if (!entries[path]) throw Object.assign(new Error("missing"), { code: "ENOENT" }); return entries[path]; },
  realpathSync: (path) => path,
});

test("K3-17: a direct claude.exe in <home>\\.local\\bin is trusted on win32; wrappers, extensionless and other dirs are not", () => {
  const exe = winPath.join(bin, "claude.exe");
  assert.deepEqual(resolveTrustedSystemExecutable("claude", win({ fsOps: fsFixture({ [exe]: file }) })), { ok: true, path: exe });
  for (const extension of [".cmd", ".bat", ".ps1"]) {
    const wrapper = winPath.join(bin, `claude${extension}`);
    assert.deepEqual(resolveTrustedSystemExecutable("claude", win({ fsOps: fsFixture({ [wrapper]: file }) })), { ok: false, status: "untrusted_path" }, extension);
  }
  const bare = winPath.join(bin, "claude");
  assert.deepEqual(assessTrustedExecutablePath(bare, win({ fsOps: fsFixture({ [bare]: file }) })), { ok: false, status: "untrusted_path" });
  const nested = winPath.join(bin, "nested", "claude.exe");
  assert.deepEqual(assessTrustedExecutablePath(nested, win({ fsOps: fsFixture({ [nested]: file }) })), { ok: false, status: "untrusted_path" });
});

test("K3-17: the POSIX branch trusts ~/.local/bin; PATH is never consulted", () => {
  const path = "/home/dev/.local/bin/claude";
  for (const platform of ["linux", "darwin"]) {
    assert.deepEqual(resolveTrustedSystemExecutable("claude", { platform, homeDir: "/home/dev", fsOps: fsFixture({ [path]: file }) }), { ok: true, path }, platform);
  }
  const decoy = "Z:\\decoy\\claude.exe";
  const result = resolveTrustedSystemExecutable("claude", win({ env: { PATH: "Z:\\decoy" }, fsOps: fsFixture({ [decoy]: file }) }));
  assert.deepEqual(result, { ok: false, status: "binary_missing" });
});

const SCHEMA = { $schema: "https://json-schema.org/draft/2020-12/schema", $id: "urn:probe", type: "object", properties: { a: { type: "string" } } };
const jsonSchemaOf = (argv) => JSON.parse(argv[argv.indexOf("--json-schema") + 1]);
const claudeCliAcceptsSchema = (argv) => { const s = jsonSchemaOf(argv); return !("$schema" in s) && !("$id" in s); };
const args = (runner, schema = SCHEMA) => buildRunnerReadinessArgs({ runner, model: "m", effort: "e", prompt: "p", schema });

test("K5-12: Claude receives the schema without $schema/$id; Antigravity keeps the full schema; input is not mutated", () => {
  const before = JSON.stringify(SCHEMA);
  const claude = jsonSchemaOf(args("claude"));
  assert.deepEqual(claude, { type: "object", properties: { a: { type: "string" } } });
  assert.deepEqual(jsonSchemaOf(args("antigravity")), SCHEMA);
  assert.equal(JSON.stringify(SCHEMA), before);
});

test("RED proof: a scratch mirror of the pre-hotfix argv builder fails the Claude acceptance predicate, the real one passes", () => {
  const preHotfixMirror = (schema) => ["--print", "--json-schema", JSON.stringify(schema)];
  assert.equal(claudeCliAcceptsSchema(preHotfixMirror(SCHEMA)), false);
  assert.equal(claudeCliAcceptsSchema(args("claude")), true);
  const preHotfixDesignArgv = (runner) => (runner === "codex" ? [] : []);
  assert.equal(preHotfixDesignArgv("claude").includes("--runner"), false, "mirror lacks --runner (K5-10 failure)");
});

test("retired child route: a failing child still yields only a bare collapsed result (R4-9/R4-10 sub-reasons are not revived)", () => {
  const spawnFn = () => ({ status: 1, stdout: "", stderr: "no schema with key or ref", signal: null });
  const result = invokeRunnerReadinessChild({ runner: "claude", executable: process.execPath, model: "m", effort: "e", prompt: "p", schema: SCHEMA, cwd: REPO, expected: {}, spawnFn });
  assert.deepEqual(result, { ok: false, childStarted: true, childClosed: true, writeToolsObserved: false });
  assert.equal(JSON.stringify(result).includes("no schema"), false, "stderr is not surfaced");
});
