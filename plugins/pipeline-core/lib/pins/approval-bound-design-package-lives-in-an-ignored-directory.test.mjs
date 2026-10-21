// SPDX-License-Identifier: SUL-1.0
//
// ALF-C-P2-02 -- regression pin for backlog item
// pipeline.approval-bound-design-package-lives-in-an-ignored-directory.
// Proposal points: (1) bound artifacts are tracked, (2) present-plan refuses an
// ignored bound path, (3) ADR-0063 sharpens "machine-regenerated", (4) a
// handover/close check lists digest-bound paths and fails on an untracked one.
// Fixtures are throwaway git repositories under the repository's scratch/.

import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..", "..", "..", "..");
const FEATURE = "pin-fixture";
const PLAN = `specs/${FEATURE}/prd.md`;
const SPEC = `specs/${FEATURE}/spec.md`;
const TRACKED = `specs/${FEATURE}/evidence/design-workflow/pkg.json`;
const IGNORED = `evidence/design-course/${FEATURE}/pkg.json`;
const STUB = '{"schema":"pipeline.design-workflow-package.v1"}\n';
const sha = (text) => createHash("sha256").update(text).digest("hex");

function git(cwd, ...args) {
  return execFileSync("git", ["-c", "core.autocrlf=false", "-c", "commit.gpgsign=false", ...args],
    { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}
function put(root, rel, text) {
  const target = join(root, ...rel.split("/"));
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, text);
}
function makeRepo(t) {
  mkdirSync(join(REPO, "scratch"), { recursive: true });
  const root = mkdtempSync(join(REPO, "scratch", "alf-c-p2-02-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  git(root, "init", "-q");
  git(root, "config", "user.name", "Pin Fixture");
  git(root, "config", "user.email", "pin@example.invalid");
  put(root, ".gitignore", "/evidence/\n/scratch/\n");
  put(root, PLAN, "# plan\n");
  put(root, SPEC, "# spec\n");
  put(root, TRACKED, STUB);
  git(root, "add", "--", ".gitignore", PLAN, SPEC, TRACKED);
  git(root, "commit", "-q", "-m", "fixture");
  return root;
}
async function request(root, packagePath) {
  const { createDesignWorkflowPackageApprovalRequest } = await import("../design-workflow-approval.mjs");
  return createDesignWorkflowPackageApprovalRequest({
    repoRoot: root, packagePath, featureId: FEATURE,
    planPath: PLAN, planSha256: sha("# plan\n"), specPath: SPEC, specSha256: sha("# spec\n"),
    readCandidate: () => ({ commit: git(root, "rev-parse", "HEAD"), tree: git(root, "rev-parse", "HEAD^{tree}") }),
  });
}
const state = (path) => ({
  planSubmission: { planPath: PLAN, specPath: SPEC },
  planPresentation: { designWorkflowPackagePath: path },
  planApproval: { designWorkflowPackagePath: path },
});

test("point 2: present-plan validation refuses a git-ignored package path before the PO signs", async (t) => {
  const root = makeRepo(t);
  put(root, IGNORED, STUB);
  const result = await request(root, IGNORED);
  assert.equal(result.ok, false);
  assert.equal(result.code, "DWP-BOUND-PATH-IGNORED");
  assert.match(result.repair, /specs\/.+\/evidence\//u);
});

test("point 2: a tracked clean package path is not a bound-path violation", async (t) => {
  const root = makeRepo(t);
  const result = await request(root, TRACKED);
  assert.doesNotMatch(String(result.code ?? ""), /^DWP-BOUND-PATH-/u);
});

test("point 1: both package-path State fields are classified tracked-required; private store is device-local", async () => {
  const { BOUND_PATH_FIELD_CLASSIFICATION: table, classifyBoundPathReference } = await import("../bound-path-classification.mjs");
  assert.equal(table["planPresentation.designWorkflowPackagePath"], "tracked-required");
  assert.equal(table["planApproval.designWorkflowPackagePath"], "tracked-required");
  assert.equal(classifyBoundPathReference(".git/agent-pipeline/design-readiness/fp0/drh_1.json"), "device-local");
  assert.equal(classifyBoundPathReference(TRACKED), "tracked-required");
});

test("point 4 (lister): bound-path status flags ignored and untracked paths and passes tracked ones", async (t) => {
  const { listBoundPathStatuses } = await import("../bound-path-status.mjs");
  const root = makeRepo(t);
  put(root, IGNORED, STUB);
  const bad = listBoundPathStatuses({ repoRoot: root, state: state(IGNORED) });
  assert.equal(bad.ok, false);
  assert.deepEqual(bad.failures, [{ code: "DWP-BOUND-PATH-IGNORED", path: IGNORED }]);
  const untracked = `specs/${FEATURE}/evidence/design-workflow/new.json`;
  put(root, untracked, STUB);
  assert.deepEqual(listBoundPathStatuses({ repoRoot: root, state: state(untracked) }).failures,
    [{ code: "DWP-BOUND-PATH-UNTRACKED", path: untracked }]);
  assert.equal(listBoundPathStatuses({ repoRoot: root, state: state(TRACKED) }).ok, true);
});

// Acceptance for proposal points 3 and 4: both hold on the current source.
test("point 3: ADR-0063 states machine-regenerated means regenerable from tracked inputs / digest-bound artifacts are not eligible for evidence/", () => {
  const adr = readFileSync(join(REPO, "docs", "adr", "0063-repository-directory-contract.md"), "utf8");
  assert.match(adr, /bit-for-bit|digest-bound|bound by digest/iu,
    "ADR-0063 never says that a digest-bound artifact is ineligible for the ignored root evidence/");
});

test("point 4: the bound-path lister is wired into a handover/close path, not only into its own test", () => {
  const callers = [
    "plugins/pipeline-core/scripts/pipeline-state.mjs",
    "plugins/pipeline-core/skills/close-block/SKILL.md",
    "harness/session-bootstrap.md",
  ].map((rel) => { try { return readFileSync(join(REPO, ...rel.split("/")), "utf8"); } catch { return ""; } });
  assert.ok(callers.some((text) => /listBoundPathStatuses|bound-path-status|renderHandoverBoundPaths/u.test(text)),
    "listBoundPathStatuses has no caller outside r7-3-bound-paths.test.mjs");
});

// ALF-C-P2-02C / AC-113 -- the points 2 cases above drive the retired package library
// (createDesignWorkflowPackageApprovalRequest). The cases below drive the REAL route:
// `present-plan --review-receipt` (ADR-0085) through the in-process pipeline-state `run`,
// on a throwaway repository with the same PO-gate authority fixture route that
// po-gate-authority.test.mjs uses. The fixture lives under the repository's scratch/.
const GATE_NOW = "2026-07-18T18:00:00.000Z";
const ROUTE_FEATURE = "feature";
const ROUTE_PLAN = "specs/feature/prd_feature.md";
const ROUTE_SPEC = "specs/feature/spec.md";
const ROUTE_DESIGN = "specs/feature/design.md";
const ROUTE_TRACE = "specs/feature/traceability.md";
const ROUTE_REPORT = "specs/feature/review/design-review-1.md";
const ROUTE_RECEIPT = "specs/feature/review/design-review-receipt-1.json";

async function routeFixture(t, { ignored = null } = {}) {
  const gate = await import("../po-gate-authority.mjs");
  const { createDesignReviewReceipt } = await import("../design-review-receipt.mjs");
  const { run } = await import("../../../../harness/scripts/pipeline-state.mjs");
  mkdirSync(join(REPO, "scratch"), { recursive: true });
  const base = mkdtempSync(join(REPO, "scratch", "alf-c-p2-02c-"));
  t.after(() => rmSync(base, { recursive: true, force: true }));
  const common = join(base, "common.git");
  const primary = join(base, "primary");
  mkdirSync(common, { recursive: true });
  mkdirSync(primary, { recursive: true });
  const env = { ...process.env, GIT_CEILING_DIRECTORIES: base, GIT_CONFIG_NOSYSTEM: "1", GIT_TERMINAL_PROMPT: "0" };
  const fgit = (...args) => execFileSync("git", ["-C", primary, "-c", "core.autocrlf=false", "-c", "commit.gpgsign=false",
    "-c", "user.name=Pin Fixture", "-c", "user.email=pin@example.invalid", ...args],
  { encoding: "utf8", windowsHide: true, timeout: 60000, env }).trim();
  fgit("init", "-q");
  if (process.platform === "win32") {
    // Native Windows: <root>/.git/agent-pipeline must be created through the owned-authority backend.
    const { createWindowsOwnedAuthorityDirectory } = await import("../windows-owned-authority-backend.mjs");
    createWindowsOwnedAuthorityDirectory({ path: join(primary, ".git", "agent-pipeline") });
  }
  const userYaml = "schema: pipeline.user.v1\nlanguage:\n  human_facing: de\n  agent_facing: en\n";
  const runtimeYaml = "schema: pipeline.manifest.v0\nlanguage:\n  human_facing: de\n";
  const specBytes = "# Technical Spec\n";
  const prdBytes = `${gate.PO_GATE_PRD_LANGUAGE_MARKER("de")}\n<!-- technical-spec-sha256: ${sha(specBytes)} -->\n${gate.PO_GATE_PRD_ACKNOWLEDGEMENT_MARKER}\n# PRD\n`;
  put(primary, "pipeline.user.yaml", userYaml);
  put(primary, ".claude/pipeline.yaml", runtimeYaml);
  put(primary, ".claude/pipeline-state.json", `${JSON.stringify({
    schema: "pipeline.state.v0",
    activeFeature: { id: ROUTE_FEATURE, planPath: ROUTE_PLAN, phase: "design" },
    planApproved: false,
    continuity: {
      schema: "pipeline.continuity.v0", featureId: ROUTE_FEATURE, revision: 0,
      runtime: { humanFacingLanguage: "de", activeDuty: "Coordinator", sessionCleanup: null },
      authority: { prd: { path: ROUTE_PLAN, sha256: "a".repeat(64) }, spec: { path: ROUTE_SPEC, sha256: "b".repeat(64) }, result: null },
      queueHead: { packageId: "continuity-adoption", actionId: "review-active-feature", nextAction: "review",
        productRetryCount: 0, environmentRerouteCount: 0, dispatch: null },
      blocker: null, acknowledgedFinal: null,
      resume: { mode: "immediate", sourceRevision: 0, reasonCode: "active-turn" }, recovery: null, decisionTxn: null, closeTransition: null,
      capacity: { concurrencyLimit: 4, reservedCriticSlots: 1, reservedRecoverySlots: 1, fallbackPolicy: "defer" },
    },
  }, null, 2)}\n`);
  put(primary, ROUTE_SPEC, specBytes);
  put(primary, ROUTE_PLAN, prdBytes);
  const receipt = gate.createPoGateProfileReceipt({
    repositoryFingerprint: gate.derivePoGateRepositoryFingerprint({ gitCommonDir: common, primaryRoot: primary }),
    primaryRoot: primary, sourceBytes: Buffer.from(userYaml), runtimeBytes: Buffer.from(runtimeYaml), updatedAt: GATE_NOW,
  });
  const receiptPath = gate.poGateProfileReceiptPath(common);
  mkdirSync(dirname(receiptPath), { recursive: true });
  if (process.platform === "win32") {
    const { hardenWindowsPrivateDirectory } = await import("../windows-private-state.mjs");
    let cursor = common;
    for (const part of dirname(gate.PO_GATE_PROFILE_RECEIPT_RELATIVE_PATH).split(/[\\/]/u).filter(Boolean)) {
      cursor = join(cursor, part);
      assert.equal(hardenWindowsPrivateDirectory(cursor).status, "secure");
    }
  }
  writeFileSync(receiptPath, gate.serializePoGateProfileReceipt(receipt));
  chmodSync(receiptPath, 0o600);
  const topology = { repoRoot: primary, gitCommonDir: common, primaryRoot: primary, registeredWorktreeRoots: [primary] };
  const authority = gate.validatePoGateAuthority(topology);
  assert.equal(authority.ok, true, JSON.stringify(authority));
  const profile = gate.validatePoGateProfileForRepository({ repoRoot: primary }, { topology });
  assert.equal(profile.ok, true, JSON.stringify(profile));

  put(primary, ROUTE_DESIGN, "# Design\n");
  put(primary, ROUTE_TRACE, "| ID | Evidence |\n| --- | --- |\n");
  put(primary, ROUTE_REPORT, "# Design review 1\nVerdict: pass.\n");
  const sourceFor = (path) => ({ path, sha256: sha(readFileSync(join(primary, ...path.split("/")))) });
  const created = createDesignReviewReceipt({
    featureId: ROUTE_FEATURE, previous: null,
    sources: { prd: sourceFor(ROUTE_PLAN), spec: sourceFor(ROUTE_SPEC), companions: [ROUTE_DESIGN, ROUTE_TRACE].map(sourceFor) },
    reviewer: { runner: "claude", model: "claude-opus-4" }, report: sourceFor(ROUTE_REPORT),
    openFindingIds: [], reviewedAt: "2026-10-09T09:00:00.000Z",
  });
  assert.equal(created.ok, true, JSON.stringify(created));
  put(primary, ROUTE_RECEIPT, Buffer.from(created.bytes));
  // The only difference between the two scenarios: one digest-bound path is git-ignored (and so never committed).
  if (ignored !== null) put(primary, ".gitignore", `/${ignored}\n`);
  const bound = [ROUTE_PLAN, ROUTE_SPEC, ROUTE_DESIGN, ROUTE_TRACE, ROUTE_REPORT, ROUTE_RECEIPT].filter((path) => path !== ignored);
  fgit("add", "--", ...bound, ...(ignored === null ? [] : [".gitignore"]));
  fgit("commit", "-q", "-m", "fixture: finished design sources");

  const drive = (argv, deps = {}) => {
    const saved = { log: console.log, error: console.error, warn: console.warn };
    const out = [], err = [];
    console.log = (...values) => out.push(values.map(String).join(" "));
    console.error = console.warn = (...values) => err.push(values.map(String).join(" "));
    try { return { status: run(argv, { dir: primary, now: () => GATE_NOW, ...deps }), stdout: out.join("\n"), stderr: err.join("\n") }; }
    finally { Object.assign(console, saved); }
  };
  const submitted = drive(["submit-plan", "--by", "coordinator", "--profile", "feature"],
    { poGateAuthority: () => authority, poGateProfile: () => profile });
  assert.equal(submitted.status, 0, `submit-plan must succeed on the fixture: ${submitted.stderr}`);
  const readState = () => JSON.parse(readFileSync(join(primary, ".claude", "pipeline-state.json"), "utf8"));
  const requests = () => {
    try { return readdirSync(join(primary, "scratch")).filter((name) => /^design-approval-request-/u.test(name)); } catch { return []; }
  };
  return { primary, drive, readState, requests };
}

const IGNORED_ROUTE_CASES = [
  ["the review report", ROUTE_REPORT],
  ["a design companion", ROUTE_DESIGN],
  ["the review receipt itself", ROUTE_RECEIPT],
];
for (const [label, ignoredPath] of IGNORED_ROUTE_CASES) {
  test(`[AC-113 present-plan ignored bound path] ${label} is git-ignored: present-plan refuses before the PO signs, writes no request`, async (t) => {
    const fx = await routeFixture(t, { ignored: ignoredPath });
    const presented = fx.drive(["present-plan", "--by", "coordinator", "--review-receipt", ROUTE_RECEIPT]);
    assert.notEqual(presented.status, 0, `present-plan must refuse; stdout: ${presented.stdout}`);
    assert.match(presented.stderr, /present-plan refused \(DCC-PATH-IGNORED\)/u, presented.stderr);
    assert.deepEqual(fx.requests(), [], "no PO request may exist for a refused presentation");
    assert.equal(fx.readState().planPresentation, undefined, "no presentation may be recorded");
    assert.doesNotMatch(presented.stdout, /sign-intent|Exact PO request/u, "no signing hand-over may be printed");
  });
}

test("[AC-113 present-plan ignored bound path] control: with every bound path tracked, the same fixture still presents", async (t) => {
  const fx = await routeFixture(t);
  const presented = fx.drive(["present-plan", "--by", "coordinator", "--review-receipt", ROUTE_RECEIPT]);
  assert.equal(presented.status, 0, `present-plan must succeed; stderr: ${presented.stderr}`);
  assert.equal(fx.requests().length, 1, "exactly one pending PO request is written");
  assert.equal(typeof fx.readState().planPresentation?.designApprovalRequestPath, "string");
  assert.match(presented.stdout, /Exact PO request: scratch\/design-approval-request-/u);
});

// ALF-C-AC113-P3 / AC-113 point 1 -- the tracked-home decision against REAL git. The design-course
// inspection derives the producer's --output-prefix; this case runs it on a throwaway repository that
// carries the repository's own .gitignore and asks git itself whether a package under that prefix is
// ignored. Containment: the fixture `git init`s its own root before any other git call, and every git
// call (the test's own and the wrapper handed to the production code, whose cleanGitEnv strips GIT_*)
// carries GIT_CEILING_DIRECTORIES set to the fixture's parent so discovery can never climb out of it.
test("[AC-113 point 1] the output prefix the inspection derives is a tracked home that git does not ignore; the root evidence/ control is ignored", async (t) => {
  const { inspectDesignCourseSubmission } = await import("../../scripts/design-course-session.mjs");
  mkdirSync(join(REPO, "scratch"), { recursive: true });
  const parent = realpathSync(join(REPO, "scratch"));
  const root = realpathSync(mkdtempSync(join(parent, "alf-c-ac113-p3-")));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const feature = "feature-x";
  const runner = "claude";
  const contained = { GIT_CEILING_DIRECTORIES: parent, GIT_CONFIG_NOSYSTEM: "1", GIT_TERMINAL_PROMPT: "0" };
  const rgit = (args) => execFileSync("git", ["-C", root, "-c", "core.autocrlf=false", "-c", "commit.gpgsign=false",
    "-c", "user.name=Pin Fixture", "-c", "user.email=pin@example.invalid", ...args],
  { encoding: "utf8", windowsHide: true, timeout: 60000, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, ...contained } }).trim();
  const containedGit = (executable, args, options = {}) => execFileSync(executable, args,
    { ...options, env: { ...(options.env ?? process.env), ...contained } });

  rgit(["init", "-q"]);
  assert.equal(realpathSync(rgit(["rev-parse", "--show-toplevel"])), root, "the fixture must be its own git root");
  const body = { input: "# design input\n", prd: "# prd\n", spec: "# spec\n", design: "# design\n", traceability: "| ID | Evidence |\n" };
  const paths = Object.fromEntries(Object.keys(body).map((name) => [name,
    `specs/${feature}/${name === "input" ? "design-input" : name}.md`]));
  put(root, ".gitignore", readFileSync(join(REPO, ".gitignore"), "utf8"));
  for (const name of Object.keys(body)) put(root, paths[name], body[name]);
  rgit(["add", "--", ".gitignore", ...Object.values(paths)]);
  rgit(["commit", "-q", "-m", "fixture: committed design sources"]);

  const readState = () => ({ status: "ok", state: { activeFeature: { id: feature },
    planSubmission: { featureId: feature, profile: "feature", planPath: paths.prd, planSha256: sha(body.prd),
      specPath: paths.spec, specSha256: sha(body.spec) },
    continuity: { queueHead: { dispatch: { dispatchId: "author-x" } } } } });
  const inspected = await inspectDesignCourseSubmission({ root, runner }, { readState, execFileSync: containedGit });
  assert.equal(inspected.status, "advisor-ready", JSON.stringify(inspected));
  const argv = inspected.nextAction.argv;
  const prefix = argv[argv.indexOf("--output-prefix") + 1];
  assert.equal(prefix, `specs/${feature}/evidence/design-course/${runner}`);

  const checkIgnore = (path) => { // 0 = ignored, 1 = not ignored (git check-ignore --quiet)
    try { rgit(["check-ignore", "--quiet", "--", path]); return 0; } catch (error) { return error.status; }
  };
  for (const artifact of ["package", "preparation"]) {
    assert.equal(checkIgnore(`${prefix}.${artifact}.json`), 1, `${prefix}.${artifact}.json must not be git-ignored`);
  }
  assert.equal(checkIgnore(`evidence/design-course/${feature}/${runner}.package.json`), 0,
    "control: the same package under the git-ignored root evidence/ is ignored, so the check can tell the two homes apart");
});
