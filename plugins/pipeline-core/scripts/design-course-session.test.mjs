// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir, devNull } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { openSync } from "node:fs";
import { registerTestCaseCompletion } from "../lib/test-case-completion.mjs";
import { isDirectInvocation } from "../lib/entrypoint.mjs";
import { buildDesignCourseProducerAction, executeDesignCourseProducer, inspectDesignCourseSubmission, main, runDesignCourseV2 } from "./design-course-session.mjs";

export const completionCases = [];
function test(name, run) { completionCases.push({ id: `K3C${String(completionCases.length + 1).padStart(3, "0")}`, name, run }); }
const pluginRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const root = "/physical/repository";
const candidate = { commit: "a".repeat(40), tree: "b".repeat(40) };
const sources = Object.fromEntries(["input", "prd", "spec", "design", "traceability"].map((name, index) => [name,
  { path: `docs/${name}.md`, sha256: String(index).repeat(64) }]));
const base = { root, pluginRoot, candidate, sources, featureId: "feature-x", authoringDispatchId: "author-x",
  profile: "feature", outputPrefix: "evidence/advisor" };

test("Advisor command selection stays on the canonical producer for all runners", () => {
  for (const runner of ["claude", "codex", "antigravity"]) {
    const action = buildDesignCourseProducerAction({ ...base, runner, stage: "advisor" });
    assert.match(action.producer, /scripts\/design-advisory-coordinator\.mjs$/u);
    assert.equal(action.shell, false);
    assert.equal(action.requiresConfirmation, true);
    assert.equal(action.implementationAuthority, false);
    assert.ok(action.argv.includes(runner));
  }
});

test("readiness uses the existing runner producer and requires Codex's host descriptor", () => {
  const common = { ...base, stage: "readiness", readinessDispatchId: "ready-1", receiptPath: "evidence/readiness.json",
    preparationPath: "evidence/preparation.json", queueRevision: 0 };
  for (const runner of ["claude", "antigravity"]) {
    assert.match(buildDesignCourseProducerAction({ ...common, runner }).producer,
      /runner-design-readiness-bootstrap\.mjs$/u);
  }
  assert.throws(() => buildDesignCourseProducerAction({ ...common, runner: "codex" }),
    (error) => error.code === "DESIGN-COURSE-CODEX-HOST-DESCRIPTOR-REQUIRED");
  const codex = buildDesignCourseProducerAction({ ...common, runner: "codex", sessionId: "session-1", descriptorSha256: "c".repeat(64) });
  assert.match(codex.producer, /codex-design-readiness-bootstrap\.mjs$/u);
  assert.ok(codex.argv.includes("session-1"));
});

test("native Advisor exception requires hash-matched terminal no-child evidence", () => {
  const fixture = mkdtempSync(join(tmpdir(), "design-course-k3-"));
  try {
    mkdirSync(join(fixture, "evidence"));
    const failure = { schema: "pipeline.design-advisor-failure.v1", code: "native-initial-answer-provenance-unavailable",
      childStarted: false, inputSubmitted: false, attemptCount: 0 };
    const bytes = Buffer.from(JSON.stringify(failure));
    writeFileSync(join(fixture, "evidence/failure.json"), bytes);
    const digest = createHash("sha256").update(bytes).digest("hex");
    const action = buildDesignCourseProducerAction({ ...base, root: fixture, runner: "claude", stage: "advisor" });
    const result = executeDesignCourseProducer(action, {
      execFileSync: () => fixture,
      readCandidate: () => candidate,
      spawnSync: () => ({ status: 2, signal: null, stdout: JSON.stringify({ ok: false,
        status: "unavailable-pending-final-approval", code: failure.code, runner: "claude", profile: "feature",
        route: { model: null, effort: null, sourceSha256: "c".repeat(64), candidateCommit: candidate.commit },
        courseBinding: { courseId: "course-1" }, hostReceipt: null,
        artifacts: { failure: { path: "evidence/failure.json", sha256: digest } }, implementationAuthority: false }), stderr: "" }),
    });
    assert.equal(result.status, "advisor-unavailable-no-child");
    assert.equal(result.implementationAuthority, false);
    const changed = Buffer.from(JSON.stringify({ ...failure, childStarted: true }));
    writeFileSync(join(fixture, "evidence/failure.json"), changed);
    assert.throws(() => executeDesignCourseProducer(action, {
      execFileSync: () => fixture,
      readCandidate: () => candidate,
      spawnSync: () => ({ status: 2, signal: null, stdout: JSON.stringify({ ok: false,
        status: "unavailable-pending-final-approval", code: failure.code, runner: "claude", profile: "feature",
        route: { model: null, effort: null, sourceSha256: "c".repeat(64), candidateCommit: candidate.commit },
        courseBinding: { courseId: "course-1" }, hostReceipt: null,
        artifacts: { failure: { path: "evidence/failure.json", sha256: createHash("sha256").update(changed).digest("hex") } },
        implementationAuthority: false }), stderr: "" }),
    }), (error) => error.code === "DESIGN-COURSE-UNAVAILABLE-EVIDENCE-BINDING");
  } finally { rmSync(fixture, { recursive: true, force: true }); }
});

test("full-course execution requires explicit confirmation", async () => {
  let executed = false;
  const result = await runDesignCourseV2({ confirmProducerExecution: false }, { executeProducer() { executed = true; } });
  assert.equal(result.code, "DESIGN-COURSE-EXECUTION-EXPLICIT-CONFIRMATION-REQUIRED");
  assert.equal(result.implementationAuthority, false);
  assert.equal(executed, false);
});

test("submission inspection derives committed five-source refs and agent-owned authoring without inheriting Git context", async () => {
  const fixture = mkdtempSync(join(tmpdir(), "design-course-inspect-"));
  const previousGitDir = process.env.GIT_DIR;
  try {
    execFileSync("git", ["init", "-q", fixture]);
    execFileSync("git", ["-C", fixture, "config", "user.name", "Fixture"]);
    execFileSync("git", ["-C", fixture, "config", "user.email", "fixture@example.invalid"]);
    mkdirSync(join(fixture, "docs"), { recursive: true });
    const initialFiles = { "docs/design-input.md": "bound user design input\n", "docs/prd.md": "current PRD\n", "docs/spec.md": "current Spec\n" };
    for (const [path, contents] of Object.entries(initialFiles)) writeFileSync(join(fixture, path), contents);
    execFileSync("git", ["-C", fixture, "add", "docs"]);
    execFileSync("git", ["-C", fixture, "commit", "-qm", "initial design inputs"]);
    const makeState = () => ({ status: "ok", state: { activeFeature: { id: "feature-test" },
      planSubmission: { featureId: "feature-test", profile: "feature", planPath: "docs/prd.md",
        planSha256: createHash("sha256").update(initialFiles["docs/prd.md"]).digest("hex"),
        specPath: "docs/spec.md", specSha256: createHash("sha256").update(initialFiles["docs/spec.md"]).digest("hex") },
      continuity: { queueHead: { dispatch: { dispatchId: "authoring-1" } } } } });
    const args = { root: fixture, runner: "claude", pluginRoot };
    const deps = { readState: makeState };
    process.env.GIT_DIR = join(fixture, "foreign-git-directory");
    const missing = await inspectDesignCourseSubmission(args, deps);
    if (previousGitDir === undefined) delete process.env.GIT_DIR; else process.env.GIT_DIR = previousGitDir;
    assert.equal(missing.status, "authoring-required");
    assert.deepEqual(missing.nextAction.files, [
      { name: "design", path: "docs/design.md" }, { name: "traceability", path: "docs/traceability.md" },
    ]);
    assert.equal(missing.implementationAuthority, false);
    assert.equal(missing.nextAction.instruction.includes("receipt"), true);
    writeFileSync(join(fixture, "docs/design.md"), "authored architecture design\n");
    writeFileSync(join(fixture, "docs/traceability.md"), "authored requirements traceability\n");
    execFileSync("git", ["-C", fixture, "add", "docs/design.md", "docs/traceability.md"]);
    execFileSync("git", ["-C", fixture, "commit", "-qm", "complete design sources"]);
    process.env.GIT_DIR = join(fixture, "foreign-git-directory");
    const ready = await inspectDesignCourseSubmission(args, deps);
    if (previousGitDir === undefined) delete process.env.GIT_DIR; else process.env.GIT_DIR = previousGitDir;
    assert.equal(ready.status, "advisor-ready");
    assert.equal(Object.keys(ready.sources).length, 5);
    assert.equal(ready.nextAction.stage, "advisor");
    assert.equal(ready.nextAction.expectedCandidate.commit, ready.candidate.commit);
    assert.equal(ready.nextAction.implementationAuthority, false);
    const wrongPlugin = await inspectDesignCourseSubmission({ ...args, pluginRoot: fixture }, deps);
    assert.equal(wrongPlugin.code, "DESIGN-COURSE-PLUGIN-ROOT-MISMATCH");
    const stdout = [];
    const io = { stdout: { write: (value) => stdout.push(value) }, exitCode: 0 };
    const cliResult = await main(["--inspect", "--root", fixture, "--runner", "claude"], io, deps);
    assert.equal(cliResult.status, "advisor-ready");
    assert.equal(JSON.parse(stdout.at(-1)).nextAction.kind, "command");
    assert.equal(JSON.parse(stdout.at(-1)).nextAction.executable, process.execPath);
    assert.equal(JSON.parse(stdout.at(-1)).nextAction.argv[0], fileURLToPath(new URL("./design-course-session.mjs", import.meta.url)));
    assert.equal(JSON.parse(stdout.at(-1)).nextAction.argv.at(-1), "--execute");
    assert.equal(io.exitCode, 0);
    const failedIo = { stdout: { write: (value) => stdout.push(value) }, exitCode: 0 };
    const failedCli = await main(["--inspect", "--root", fixture, "--runner", "invalid"], failedIo, deps);
    assert.equal(failedCli.ok, false);
    assert.equal(failedIo.exitCode, 2);
  } finally {
    if (previousGitDir === undefined) delete process.env.GIT_DIR; else process.env.GIT_DIR = previousGitDir;
    rmSync(fixture, { recursive: true, force: true });
  }
});

test("confirmed course reaches one unsigned final package through actual producer-result contracts", async () => {
  const fixture = mkdtempSync(join(tmpdir(), "design-course-full-contract-"));
  try {
    mkdirSync(join(fixture, "docs")); mkdirSync(join(fixture, "evidence"));
    const current = { commit: "9".repeat(40), tree: "8".repeat(40) };
    const contents = {};
    const refs = {};
    for (const name of ["input", "prd", "spec", "design", "traceability"]) {
      const path = `docs/${name}.md`; const bytes = Buffer.from(`${name} source\n`);
      contents[path] = bytes; writeFileSync(join(fixture, path), bytes);
      refs[name] = { path, sha256: createHash("sha256").update(bytes).digest("hex") };
    }
    const initial = { featureId: "feature-x", authoringDispatchId: "author-x", initialCandidate: current, sources: refs };
    const initialBytes = Buffer.from(JSON.stringify(initial)); writeFileSync(join(fixture, "evidence/initial.json"), initialBytes);
    const failure = { schema: "pipeline.design-advisor-failure.v1", code: "native-initial-answer-provenance-unavailable",
      childStarted: false, inputSubmitted: false, attemptCount: 0 };
    const failureBytes = Buffer.from(JSON.stringify(failure)); writeFileSync(join(fixture, "evidence/failure.json"), failureBytes);
    const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
    const advisor = { ok: false, status: "unavailable-pending-final-approval", code: failure.code, runner: "claude",
      profile: "feature", route: { model: null, effort: null, sourceSha256: "c".repeat(64), candidateCommit: current.commit },
      courseBinding: { courseId: "course-x" }, hostReceipt: null,
      artifacts: { initial: { path: "evidence/initial.json", sha256: digest(initialBytes) },
        failure: { path: "evidence/failure.json", sha256: digest(failureBytes) } }, implementationAuthority: false };
    const stages = [];
    const fakeGit = (_executable, args) => {
      if (args[0] === "-C" && args[2] === "rev-parse" && args[3] === "--show-toplevel") return fixture;
      if (args[0] === "-C" && args[2] === "rev-parse" && args[3] === "HEAD") return current.commit;
      if (args[0] === "-C" && args[2] === "rev-parse" && args[3] === "HEAD^{tree}") return current.tree;
      if (args[0] === "show") return contents[args[1].slice(current.commit.length + 1)];
      if (args[0] === "check-ignore") return "";
      throw new Error(`unexpected Git request: ${args.join(" ")}`);
    };
    const input = { root: fixture, pluginRoot, runner: "claude", confirmProducerExecution: true,
      featureId: "feature-x", authoringDispatchId: "author-x", profile: "feature", sources: refs,
      outputPrefix: "evidence/advisor", preparationPath: "evidence/preparation.json",
      readinessPath: "evidence/readiness.json", packagePath: "evidence/package.json", readinessDispatchId: "ready-x",
      proposedExceptionRationale: "The native Advisor route produced verified no-child evidence; request one final package review." };
    const dependencies = {
      execFileSync: fakeGit, canonicalJson: JSON.stringify,
      readPreparation: async () => ({ ok: true, advisorObservation: { candidate: current, sources: refs } }),
      executeProducer: async (action) => {
        stages.push(action.stage);
        return action.stage === "advisor" ? { status: "advisor-unavailable-no-child", producerResult: advisor }
          : { status: "readiness-published", producerResult: { ok: true, code: "DESIGN-READINESS-RECEIPT-PUBLISHED",
            runner: "claude", candidate: current, path: "evidence/readiness.json", dispatchId: "ready-x" } };
      },
      buildPackageV2: async (input) => ({ ok: true, code: "DWP2-PACKAGE-BUILT", packagePath: input.packagePath,
        packageSha256: "e".repeat(64), candidate: current, packageRead: { implementationAuthority: false },
        advisorStatus: "unavailable", advisorExceptionRequired: true }),
      approvalModule: { createDesignWorkflowPackageApprovalRequest: () => ({ ok: true,
        packageRead: { implementationAuthority: false, packageSha256: "e".repeat(64) }, request: { packageSha256: "e".repeat(64),
          approvalIntent: { sha256: "f".repeat(64), value: { decision: "approve" } } } }) },
    };
    const result = await runDesignCourseV2(input, dependencies);
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(result.status, "final-po-review-ready");
    assert.deepEqual(stages, ["advisor", "readiness"]);
    assert.equal(result.advisorExceptionRequired, true);
    assert.equal(result.approvalCountBeforeFinalPackage, 0);
    assert.equal(result.implementationAuthority, false);
    assert.equal(result.nextAction.kind, "present-final-design-workflow-package-to-po");
    const rationale = 'evidence/exception-rationale.txt';
    writeFileSync(join(fixture, rationale), input.proposedExceptionRationale);
    const argv = ['--run-v2', '--root', fixture, '--runner', 'claude', '--feature-id', input.featureId,
      '--authoring-dispatch-id', input.authoringDispatchId, '--profile', input.profile, '--output-prefix', 'evidence/cli-advisor'];
    for (const name of ['input', 'prd', 'spec', 'design', 'traceability']) argv.push('--source', name, refs[name].path, refs[name].sha256);
    argv.push('--readiness-dispatch-id', 'ready-cli', '--queue-revision', '0', '--receipt', 'evidence/cli-readiness.json',
      '--preparation', 'evidence/cli-preparation.json', '--package', 'evidence/cli-package.json',
      '--exception-rationale', rationale, digest(input.proposedExceptionRationale), '--execute');
    const cliStages = [];
    const cliDependencies = { ...dependencies, executeProducer: async action => {
      cliStages.push(action.stage);
      assert.equal(action.implementationAuthority, false);
      return action.stage === 'advisor' ? { status: 'advisor-unavailable-no-child', producerResult: advisor }
        : { status: 'readiness-published', producerResult: { ok: true, code: 'DESIGN-READINESS-RECEIPT-PUBLISHED',
          runner: 'claude', candidate: current, path: 'evidence/cli-readiness.json', dispatchId: 'ready-cli' } };
    } };
    const output = [];
    const io = { stdout: { write: value => output.push(value) }, exitCode: 0 };
    const cliResult = await main(argv, io, cliDependencies);
    assert.equal(cliResult.ok, true, JSON.stringify(cliResult));
    assert.deepEqual(cliStages, ['advisor', 'readiness']);
    assert.equal(cliResult.status, 'final-po-review-ready');
    assert.equal(cliResult.packagePath, 'evidence/cli-package.json');
    assert.equal(cliResult.approvalCountBeforeFinalPackage, 0);
    assert.equal(cliResult.implementationAuthority, false);
    assert.equal(JSON.parse(output.at(-1)).nextAction.kind, 'present-final-design-workflow-package-to-po');
    assert.equal(io.exitCode, 0);
  } finally { rmSync(fixture, { recursive: true, force: true }); }
});

const completionFd = process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD === undefined
  ? openSync(devNull, "w")
  : Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD);
if (isDirectInvocation(import.meta.url)) {
  registerTestCaseCompletion({ cases: completionCases, fd: completionFd,
    maxBytes: Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_MAX_BYTES ?? "65536") });
}
