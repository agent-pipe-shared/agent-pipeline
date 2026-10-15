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
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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

// RED evidence: the two acceptance gaps below hold on the current source.
test("point 3 (RED): ADR-0063 states machine-regenerated means regenerable from tracked inputs / digest-bound artifacts are not eligible for evidence/", () => {
  const adr = readFileSync(join(REPO, "docs", "adr", "0063-repository-directory-contract.md"), "utf8");
  assert.match(adr, /bit-for-bit|digest-bound|bound by digest/iu,
    "ADR-0063 never says that a digest-bound artifact is ineligible for the ignored root evidence/");
});

test("point 4 (RED): the bound-path lister is wired into a handover/close path, not only into its own test", () => {
  const callers = [
    "plugins/pipeline-core/scripts/pipeline-state.mjs",
    "plugins/pipeline-core/skills/close-block/SKILL.md",
    "harness/session-bootstrap.md",
  ].map((rel) => { try { return readFileSync(join(REPO, ...rel.split("/")), "utf8"); } catch { return ""; } });
  assert.ok(callers.some((text) => /listBoundPathStatuses|bound-path-status|renderHandoverBoundPaths/u.test(text)),
    "listBoundPathStatuses has no caller outside r7-3-bound-paths.test.mjs");
});
