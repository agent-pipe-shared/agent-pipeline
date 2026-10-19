// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir, devNull } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { openSync } from "node:fs";
import { registerTestCaseCompletion } from "../lib/test-case-completion.mjs";
import { isDirectInvocation } from "../lib/entrypoint.mjs";
import { DESIGN_COURSE_RETIRED, RETIRED_DESIGN_ROUTE_HINT } from "../lib/retired-design-codes.mjs";
import { buildDesignCourseProducerAction, executeDesignCourseProducer, inspectDesignCourseSubmission, main, runDesignCourseV2 } from "./design-course-session.mjs";

export const completionCases = [];
function test(name, run) { completionCases.push({ id: `K3C${String(completionCases.length + 1).padStart(3, "0")}`, name, run }); }
const pluginRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const root = resolve("/physical/repository");
const candidate = { commit: "a".repeat(40), tree: "b".repeat(40) };
const sources = Object.fromEntries(["input", "prd", "spec", "design", "traceability"].map((name, index) => [name,
  { path: `docs/${name}.md`, sha256: String(index).repeat(64) }]));
const base = { root, pluginRoot, candidate, sources, featureId: "feature-x", authoringDispatchId: "author-x",
  profile: "feature", outputPrefix: "evidence/advisor" };

// QG-04 justification (bounded; backlog item pipeline.design-course-run-v2-refuses-its-own-documented-routes, AC-151,
// Elephant decision E12). ADR-0085 retired the design course entry points: runDesignCourseV2 and the CLI main now return
// the typed retirement DESIGN-COURSE-RETIRED before parsing, state access, dispatch or publication, and that result
// grants no implementation authority. Cases K3C004, K3C006, K3C008 and K3C009 and the CLI tails of K3C005 and K3C007
// exercised that retired route and were red on 2026-10-19 (3/9) because the producer refuses by design. They are
// RETARGETED, never deleted, and keep their ids, names, fixtures and dependency sets; only the asserted outcome moved to
// the retirement contract the AC-124 pin already uses: the exact retired object, no stage executed and nothing written.
// Everything that still exercised a live, retained export (K3C001-K3C003 and the direct inspectDesignCourseSubmission
// assertions of K3C005 and K3C007) is unchanged. Nothing here revives a retired route. The previous assertions are
// preserved in version control and the pre-change red run is retained as scratch evidence of the baseline sweep.
const RETIRED = { ok: false, code: DESIGN_COURSE_RETIRED, hint: RETIRED_DESIGN_ROUTE_HINT, implementationAuthority: false };

test("Advisor command selection stays on the canonical producer for all runners", () => {
  for (const runner of ["claude", "codex", "antigravity"]) {
    const action = buildDesignCourseProducerAction({ ...base, runner, stage: "advisor" });
    assert.match(action.producer.replaceAll("\\", "/"), /scripts\/design-advisory-coordinator\.mjs$/u);
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
  // Original intent: no producer executes unless the caller explicitly confirms execution. Retired (ADR-0085,
  // DESIGN-COURSE-RETIRED): the course now refuses with the typed retirement whether or not execution is confirmed, so
  // a confirmed call also executes nothing and grants no authority.
  let executed = false;
  const dependencies = { executeProducer() { executed = true; } };
  for (const confirmProducerExecution of [false, true]) {
    assert.deepEqual(await runDesignCourseV2({ confirmProducerExecution }, dependencies), RETIRED, `confirm=${confirmProducerExecution}`);
  }
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
    // CLI tail, retargeted (ADR-0085, DESIGN-COURSE-RETIRED). Original intent: the --inspect CLI emits the same
    // inspection as a command and a bad runner fails with exit 2. Now the CLI refuses both before parsing, reads no
    // state, emits no command, and still exits 2 with no implementation authority.
    const stdout = [];
    let stateReads = 0;
    const cliDeps = { readState: () => { stateReads += 1; return makeState(); } };
    const io = { stdout: { write: (value) => stdout.push(value) }, exitCode: 0 };
    const cliResult = await main(["--inspect", "--root", fixture, "--runner", "claude"], io, cliDeps);
    assert.deepEqual(cliResult, RETIRED);
    assert.deepEqual(JSON.parse(stdout.at(-1)), RETIRED);
    assert.equal(JSON.parse(stdout.at(-1)).nextAction, undefined, "no command is emitted for a retired route");
    assert.equal(io.exitCode, 2);
    const failedIo = { stdout: { write: (value) => stdout.push(value) }, exitCode: 0 };
    const failedCli = await main(["--inspect", "--root", fixture, "--runner", "invalid"], failedIo, cliDeps);
    assert.deepEqual(failedCli, RETIRED);
    assert.equal(failedCli.ok, false);
    assert.equal(failedIo.exitCode, 2);
    assert.equal(stateReads, 0, "the retired CLI reads no lifecycle state");
  } finally {
    if (previousGitDir === undefined) delete process.env.GIT_DIR; else process.env.GIT_DIR = previousGitDir;
    rmSync(fixture, { recursive: true, force: true });
  }
});

test("confirmed course reaches one unsigned final package through actual producer-result contracts", async () => {
  // Original intent: a confirmed course runs the advisor and readiness stages and reaches one unsigned final package,
  // through the function and through the CLI. Retired (ADR-0085, DESIGN-COURSE-RETIRED): the same fully confirmed
  // inputs now refuse on both routes with no stage executed, no package built and no authority granted.
  const fixture = mkdtempSync(join(tmpdir(), "design-course-full-contract-"));
  try {
    mkdirSync(join(fixture, "docs")); mkdirSync(join(fixture, "evidence"));
    // R7-3 (Spec 22.3): the preparation, readiness and package are digest-bound, so they live under the tracked
    // `specs/<feature-id>/evidence/` home, never the git-ignored root `evidence/`.
    const trackedHome = "specs/feature-x/evidence/design-course/claude";
    mkdirSync(join(fixture, ...trackedHome.split("/")), { recursive: true });
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
    let packageBuilds = 0;
    const fakeGit = (_executable, args) => {
      if (args[0] === "-C" && args[2] === "rev-parse" && args[3] === "--show-toplevel") return fixture;
      if (args[0] === "-C" && args[2] === "rev-parse" && args[3] === "HEAD") return current.commit;
      if (args[0] === "-C" && args[2] === "rev-parse" && args[3] === "HEAD^{tree}") return current.tree;
      if (args[0] === "show") return contents[args[1].slice(current.commit.length + 1)];
      // The tracked home is not git-ignored: `git check-ignore --quiet` exits 1 and execFileSync throws.
      if (args[0] === "check-ignore") throw Object.assign(new Error("path is not ignored"), { status: 1 });
      throw new Error(`unexpected Git request: ${args.join(" ")}`);
    };
    const input = { root: fixture, pluginRoot, runner: "claude", confirmProducerExecution: true,
      featureId: "feature-x", authoringDispatchId: "author-x", profile: "feature", sources: refs,
      outputPrefix: "evidence/advisor", preparationPath: `${trackedHome}/preparation.json`,
      readinessPath: `${trackedHome}/readiness.json`, packagePath: `${trackedHome}/package.json`, readinessDispatchId: "ready-x",
      proposedExceptionRationale: "The native Advisor route produced verified no-child evidence; request one final package review." };
    const dependencies = {
      execFileSync: fakeGit, canonicalJson: JSON.stringify,
      readPreparation: async () => ({ ok: true, advisorObservation: { candidate: current, sources: refs } }),
      executeProducer: async (action) => {
        stages.push(action.stage);
        return action.stage === "advisor" ? { status: "advisor-unavailable-no-child", producerResult: advisor }
          : { status: "readiness-published", producerResult: { ok: true, code: "DESIGN-READINESS-RECEIPT-PUBLISHED",
            runner: "claude", candidate: current, path: `${trackedHome}/readiness.json`, dispatchId: "ready-x" } };
      },
      buildPackageV2: async (input) => { packageBuilds += 1; return { ok: true, code: "DWP2-PACKAGE-BUILT", packagePath: input.packagePath,
        packageSha256: "e".repeat(64), candidate: current, packageRead: { implementationAuthority: false },
        advisorStatus: "unavailable", advisorExceptionRequired: true }; },
      approvalModule: { createDesignWorkflowPackageApprovalRequest: () => ({ ok: true,
        packageRead: { implementationAuthority: false, packageSha256: "e".repeat(64) }, request: { packageSha256: "e".repeat(64),
          approvalIntent: { sha256: "f".repeat(64), value: { decision: "approve" } } } }) },
    };
    const result = await runDesignCourseV2(input, dependencies);
    assert.deepEqual(result, RETIRED);
    assert.deepEqual(stages, []);
    assert.equal(packageBuilds, 0);
    assert.equal(result.approvalCountBeforeFinalPackage, undefined);
    assert.equal(result.nextAction, undefined, "no final-package hand-over is produced");
    const rationale = 'evidence/exception-rationale.txt';
    writeFileSync(join(fixture, rationale), input.proposedExceptionRationale);
    const argv = ['--run-v2', '--root', fixture, '--runner', 'claude', '--feature-id', input.featureId,
      '--authoring-dispatch-id', input.authoringDispatchId, '--profile', input.profile, '--output-prefix', 'evidence/cli-advisor'];
    for (const name of ['input', 'prd', 'spec', 'design', 'traceability']) argv.push('--source', name, refs[name].path, refs[name].sha256);
    argv.push('--readiness-dispatch-id', 'ready-cli', '--queue-revision', '0', '--receipt', `${trackedHome}/cli-readiness.json`,
      '--preparation', `${trackedHome}/cli-preparation.json`, '--package', `${trackedHome}/cli-package.json`,
      '--exception-rationale', rationale, digest(input.proposedExceptionRationale), '--execute');
    const cliStages = [];
    const cliDependencies = { ...dependencies, executeProducer: async action => {
      cliStages.push(action.stage);
      assert.equal(action.implementationAuthority, false);
      return action.stage === 'advisor' ? { status: 'advisor-unavailable-no-child', producerResult: advisor }
        : { status: 'readiness-published', producerResult: { ok: true, code: 'DESIGN-READINESS-RECEIPT-PUBLISHED',
          runner: 'claude', candidate: current, path: `${trackedHome}/cli-readiness.json`, dispatchId: 'ready-cli' } };
    } };
    const output = [];
    const io = { stdout: { write: value => output.push(value) }, exitCode: 0 };
    const cliResult = await main(argv, io, cliDependencies);
    assert.deepEqual(cliResult, RETIRED);
    assert.deepEqual(cliStages, []);
    assert.deepEqual(JSON.parse(output.at(-1)), RETIRED);
    assert.equal(JSON.parse(output.at(-1)).nextAction, undefined);
    assert.equal(packageBuilds, 0);
    for (const name of ["cli-readiness.json", "cli-preparation.json", "cli-package.json"]) {
      assert.equal(existsSync(join(fixture, ...`${trackedHome}/${name}`.split("/"))), false, `${name} is not published`);
    }
    assert.equal(io.exitCode, 2);
  } finally { rmSync(fixture, { recursive: true, force: true }); }
});

// ---------------------------------------------------------------------------
// R7-3b (Spec §22.3, "Classification (T5)"): the design-course producer writes
// the package and the course and readiness artifacts it digests under the
// tracked home `specs/<feature-id>/evidence/`, never the git-ignored root
// `evidence/` (`/evidence/` is anchored in .gitignore). The producer routes
// these cases measured were retired by ADR-0085 (DESIGN-COURSE-RETIRED); see the
// QG-04 justification above and the per-case notes below.
//
// Not covered here: the fresh-clone half of R7-3b ("after a fresh clone of the
// committed fixture the approval's digests verify"). This file has no reusable
// fixture-repository helper (K3C005 builds its repository inline) and the
// approval-digest path needs a real v2 package, so it is left to the suite that
// owns the approval verifier.
// ---------------------------------------------------------------------------
const R73_FEATURE = "feature-x";
const R73_TRACKED_HOME = `specs/${R73_FEATURE}/evidence/`;
const R73_SOURCE_NAMES = ["input", "prd", "spec", "design", "traceability"];
function r73Fixture() {
  const fixture = realpathSync(mkdtempSync(join(tmpdir(), "design-course-r73-")));
  const current = { commit: "7".repeat(40), tree: "6".repeat(40) };
  const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
  mkdirSync(join(fixture, "docs"));
  const contents = {}; const refs = {};
  for (const name of R73_SOURCE_NAMES) {
    const path = name === "input" ? "docs/design-input.md" : `docs/${name}.md`;
    const bytes = Buffer.from(`${name} source\n`);
    contents[path] = bytes; writeFileSync(join(fixture, path), bytes);
    refs[name] = { path, sha256: sha256(bytes) };
  }
  // A path that a tracked home would hold is, by definition, NOT git-ignored:
  // `git check-ignore --quiet` exits 1 and execFileSync throws.
  const fakeGit = (_executable, args) => {
    if (args[0] === "-C" && args[2] === "rev-parse" && args[3] === "--show-toplevel") return fixture;
    if (args[0] === "-C" && args[2] === "rev-parse" && args[3] === "HEAD") return current.commit;
    if (args[0] === "-C" && args[2] === "rev-parse" && args[3] === "HEAD^{tree}") return current.tree;
    if (args[0] === "show") return contents[args[1].slice(current.commit.length + 1)];
    if (args[0] === "check-ignore") throw Object.assign(new Error("path is not ignored"), { status: 1 });
    throw new Error(`unexpected Git request: ${args.join(" ")}`);
  };
  return { fixture, current, refs, fakeGit, sha256 };
}
function r73FlagValue(argv, flag) { return argv[argv.indexOf(flag) + 1]; }

test("R7-3b: the inspection's advisor command names a tracked output prefix under specs/<feature-id>/evidence/", async () => {
  const { fixture, refs, fakeGit } = r73Fixture();
  try {
    let stateReads = 0;
    const readState = () => { stateReads += 1; return { status: "ok", state: { activeFeature: { id: R73_FEATURE },
      planSubmission: { featureId: R73_FEATURE, profile: "feature", planPath: refs.prd.path, planSha256: refs.prd.sha256,
        specPath: refs.spec.path, specSha256: refs.spec.sha256 },
      continuity: { queueHead: { dispatch: { dispatchId: "author-x" } } } } }; };
    const dependencies = { readState, execFileSync: fakeGit };
    const trackedPrefix = `specs/${R73_FEATURE}/evidence/design-course/claude`;
    const inspected = await inspectDesignCourseSubmission({ root: fixture, runner: "claude", pluginRoot }, dependencies);
    assert.equal(inspected.status, "advisor-ready", JSON.stringify(inspected));
    assert.equal(inspected.nextAction.stage, "advisor");
    assert.equal(r73FlagValue(inspected.nextAction.argv, "--output-prefix"), trackedPrefix);
    assert.equal(inspected.nextAction.argv.some((value) => value.startsWith("evidence/")), false,
      "no emitted argument may point into the git-ignored root evidence/");
    // CLI tail, retargeted (ADR-0085, DESIGN-COURSE-RETIRED). Original intent: the --inspect CLI emits the same tracked
    // output prefix. Now the CLI refuses before parsing and emits no command at all, so no argument of any kind (tracked
    // or git-ignored) can be advertised for a retired route.
    const readsBeforeCli = stateReads;
    const stdout = [];
    const io = { stdout: { write: (value) => stdout.push(value) }, exitCode: 0 };
    const cliResult = await main(["--inspect", "--root", fixture, "--runner", "claude"], io, dependencies);
    assert.deepEqual(cliResult, RETIRED);
    assert.deepEqual(JSON.parse(stdout.at(-1)), RETIRED);
    assert.equal(JSON.parse(stdout.at(-1)).nextAction, undefined, "no command is emitted for a retired route");
    assert.equal(io.exitCode, 2);
    assert.equal(stateReads, readsBeforeCli, "the retired CLI reads no lifecycle state");
  } finally { rmSync(fixture, { recursive: true, force: true }); }
});

test("R7-3b: the --run-v2 course accepts and writes every digest-bound artifact under the tracked prefix", async () => {
  // Original intent: the --run-v2 course writes every digest-bound artifact under the tracked home and nothing under the
  // git-ignored root evidence/. Retired (ADR-0085, DESIGN-COURSE-RETIRED): the course now writes nothing anywhere, so
  // no tracked-home artifact is published and the root evidence/ stays absent.
  const { fixture, current, refs, fakeGit, sha256 } = r73Fixture();
  try {
    const home = `specs/${R73_FEATURE}/evidence`;
    const course = `${home}/design-course`;
    mkdirSync(join(fixture, ...course.split("/")), { recursive: true });
    const write = (path, value) => { const bytes = Buffer.from(value); writeFileSync(join(fixture, ...path.split("/")), bytes); return bytes; };
    const initialBytes = write(`${course}/initial.json`, JSON.stringify({ featureId: R73_FEATURE, authoringDispatchId: "author-x",
      initialCandidate: current, sources: refs }));
    const failure = { schema: "pipeline.design-advisor-failure.v1", code: "native-initial-answer-provenance-unavailable",
      childStarted: false, inputSubmitted: false, attemptCount: 0 };
    const failureBytes = write(`${course}/failure.json`, JSON.stringify(failure));
    const rationale = "The native Advisor route produced verified no-child evidence; request one final package review.";
    write(`${course}/exception-rationale.txt`, rationale);
    const advisor = { ok: false, status: "unavailable-pending-final-approval", code: failure.code, runner: "claude",
      profile: "feature", route: { model: null, effort: null, sourceSha256: "c".repeat(64), candidateCommit: current.commit },
      courseBinding: { courseId: "course-x" }, hostReceipt: null,
      artifacts: { initial: { path: `${course}/initial.json`, sha256: sha256(initialBytes) },
        failure: { path: `${course}/failure.json`, sha256: sha256(failureBytes) } }, implementationAuthority: false };
    const paths = { outputPrefix: `${course}/claude`, preparation: `${course}/preparation.json`,
      readiness: `${course}/readiness.json`, package: `${home}/design-workflow-package.json` };
    const actions = [];
    let packageBuilds = 0;
    const dependencies = {
      execFileSync: fakeGit, canonicalJson: JSON.stringify,
      readPreparation: async () => ({ ok: true, advisorObservation: { candidate: current, sources: refs } }),
      executeProducer: async (action) => {
        actions.push(action);
        return action.stage === "advisor" ? { status: "advisor-unavailable-no-child", producerResult: advisor }
          : { status: "readiness-published", producerResult: { ok: true, code: "DESIGN-READINESS-RECEIPT-PUBLISHED",
            runner: "claude", candidate: current, path: paths.readiness, dispatchId: "ready-x" } };
      },
      buildPackageV2: async (input) => { packageBuilds += 1; return { ok: true, code: "DWP2-PACKAGE-BUILT", packagePath: input.packagePath,
        packageSha256: "e".repeat(64), candidate: current, packageRead: { implementationAuthority: false },
        advisorStatus: "unavailable", advisorExceptionRequired: true }; },
      approvalModule: { createDesignWorkflowPackageApprovalRequest: () => ({ ok: true,
        packageRead: { implementationAuthority: false, packageSha256: "e".repeat(64) }, request: { packageSha256: "e".repeat(64),
          approvalIntent: { sha256: "f".repeat(64), value: { decision: "approve" } } } }) },
    };
    const argv = ["--run-v2", "--root", fixture, "--runner", "claude", "--feature-id", R73_FEATURE,
      "--authoring-dispatch-id", "author-x", "--profile", "feature", "--output-prefix", paths.outputPrefix];
    for (const name of R73_SOURCE_NAMES) argv.push("--source", name, refs[name].path, refs[name].sha256);
    argv.push("--readiness-dispatch-id", "ready-x", "--queue-revision", "0", "--receipt", paths.readiness,
      "--preparation", paths.preparation, "--package", paths.package,
      "--exception-rationale", `${course}/exception-rationale.txt`, sha256(rationale), "--execute");
    const stdout = [];
    const io = { stdout: { write: (value) => stdout.push(value) }, exitCode: 0 };
    const result = await main(argv, io, dependencies);
    assert.deepEqual(result, RETIRED);
    assert.deepEqual(JSON.parse(stdout.at(-1)), RETIRED);
    assert.deepEqual(actions, [], "no producer stage is dispatched");
    assert.equal(packageBuilds, 0);
    assert.equal(io.exitCode, 2);
    for (const [label, path] of Object.entries({ preparation: paths.preparation, readiness: paths.readiness, package: paths.package })) {
      assert.equal(existsSync(join(fixture, ...path.split("/"))), false, `${label} is not published under ${R73_TRACKED_HOME}`);
    }
    assert.equal(existsSync(join(fixture, "evidence")), false, "nothing is written under the git-ignored root evidence/");
  } finally { rmSync(fixture, { recursive: true, force: true }); }
});

// R7-3 (Spec §22.3): a digest-bound path that IS git-ignored is refused. K3C009 is K3C006's setup (tracked-home
// paths) with one change: `git check-ignore --quiet` exits 0 (ignored) for the preparation path. Retargeted (ADR-0085,
// DESIGN-COURSE-RETIRED). Original intent: the bound-path-must-not-be-ignored refusal DESIGN-COURSE-BOUND-PATH-IGNORED.
// Now the course refuses with the typed retirement before any Git probe, so no bound-path check is made and none is
// needed: nothing is bound, published or authorised.
test("R7-3: a git-ignored preparation path is refused as a bound path", async () => {
  const fixture = mkdtempSync(join(tmpdir(), "design-course-ignored-bound-"));
  try {
    mkdirSync(join(fixture, "docs")); mkdirSync(join(fixture, "evidence"));
    const trackedHome = "specs/feature-x/evidence/design-course/claude";
    mkdirSync(join(fixture, ...trackedHome.split("/")), { recursive: true });
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
    const preparationPath = `${trackedHome}/preparation.json`;
    const gitRequests = [];
    let producerRuns = 0;
    const fakeGit = (_executable, args) => {
      gitRequests.push(args.join(" "));
      if (args[0] === "-C" && args[2] === "rev-parse" && args[3] === "--show-toplevel") return fixture;
      if (args[0] === "-C" && args[2] === "rev-parse" && args[3] === "HEAD") return current.commit;
      if (args[0] === "-C" && args[2] === "rev-parse" && args[3] === "HEAD^{tree}") return current.tree;
      if (args[0] === "show") return contents[args[1].slice(current.commit.length + 1)];
      if (args[0] === "check-ignore") {
        // The preparation path is git-ignored: `git check-ignore --quiet` exits 0 and execFileSync returns normally.
        if (args.at(-1) === preparationPath) return "";
        throw Object.assign(new Error("path is not ignored"), { status: 1 });
      }
      throw new Error(`unexpected Git request: ${args.join(" ")}`);
    };
    const input = { root: fixture, pluginRoot, runner: "claude", confirmProducerExecution: true,
      featureId: "feature-x", authoringDispatchId: "author-x", profile: "feature", sources: refs,
      outputPrefix: "evidence/advisor", preparationPath,
      readinessPath: `${trackedHome}/readiness.json`, packagePath: `${trackedHome}/package.json`, readinessDispatchId: "ready-x",
      proposedExceptionRationale: "The native Advisor route produced verified no-child evidence; request one final package review." };
    const dependencies = {
      execFileSync: fakeGit, canonicalJson: JSON.stringify,
      readPreparation: async () => ({ ok: true, advisorObservation: { candidate: current, sources: refs } }),
      executeProducer: async (action) => { producerRuns += 1; return action.stage === "advisor"
        ? { status: "advisor-unavailable-no-child", producerResult: advisor }
        : { status: "readiness-published", producerResult: { ok: true, code: "DESIGN-READINESS-RECEIPT-PUBLISHED",
          runner: "claude", candidate: current, path: `${trackedHome}/readiness.json`, dispatchId: "ready-x" } }; },
      buildPackageV2: async (input) => ({ ok: true, code: "DWP2-PACKAGE-BUILT", packagePath: input.packagePath,
        packageSha256: "e".repeat(64), candidate: current, packageRead: { implementationAuthority: false },
        advisorStatus: "unavailable", advisorExceptionRequired: true }),
      approvalModule: { createDesignWorkflowPackageApprovalRequest: () => ({ ok: true,
        packageRead: { implementationAuthority: false, packageSha256: "e".repeat(64) }, request: { packageSha256: "e".repeat(64),
          approvalIntent: { sha256: "f".repeat(64), value: { decision: "approve" } } } }) },
    };
    const result = await runDesignCourseV2(input, dependencies);
    assert.deepEqual(result, RETIRED, JSON.stringify(result));
    assert.notEqual(result.code, "DESIGN-COURSE-BOUND-PATH-IGNORED");
    assert.deepEqual(gitRequests, [], "the retirement precedes every Git probe, including the bound-path ignore check");
    assert.equal(producerRuns, 0);
    assert.equal(existsSync(join(fixture, ...preparationPath.split("/"))), false);
  } finally { rmSync(fixture, { recursive: true, force: true }); }
});

const completionFd = process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD === undefined
  ? openSync(devNull, "w")
  : Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD);
if (isDirectInvocation(import.meta.url)) {
  registerTestCaseCompletion({ cases: completionCases, fd: completionFd,
    maxBytes: Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_MAX_BYTES ?? "65536") });
}
