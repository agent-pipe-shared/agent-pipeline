// SPDX-License-Identifier: SUL-1.0
//
// R7-3-T-20261008 -- committed RED pins for the Alfred epic's section 22.3
// acceptance cases R7-3a, R7-3c and R7-3d (digest-bound artifacts are tracked
// and travel). R7-3b is covered elsewhere (design-course-session.test.mjs,
// design-workflow-package-builder.test.mjs) and is deliberately NOT pinned again.
//
// Test-only dispatch: no production code exists for these cases yet, so most
// cases are RED on purpose. A fix dispatch makes them green; it must not edit
// this file (QG-04).
//
// SUBSTITUTION (briefing stop condition 1): `present-plan` is not driven end to
// end, because that needs a submitted plan, a State write and the PO signature
// machinery. R7-3a instead pins `createDesignWorkflowPackageApprovalRequest`
// (lib/design-workflow-approval.mjs), the first validation function that
// `present-plan` calls on the package (the CLI call site is pipeline-state.mjs
// `case "present-plan"`). No lower pure bound-path validator exists today.
//
// ASSUMPTIONS the dispatcher must ratify before the fix dispatch is briefed:
//  A1  The package path is itself a bound path, and the bound-path gate runs
//      BEFORE any package content validation. A stub package therefore reaches
//      the gate; a gate placed after content validation would hide the typed
//      repair behind unrelated failures and could never satisfy R7-3a.
//  A2  A refusal is `{ ok: false, code, repair }`, `repair` a non-empty string,
//      following the precedent of `DESIGN-COURSE-BOUND-PATH-IGNORED` in
//      scripts/design-course-session.mjs (that code is the R7-3b producer layer,
//      a different layer than the `DWP-BOUND-PATH-*` codes of the approval layer,
//      and is not treated as a conflict).
//  A3  New module lib/bound-path-status.mjs exports
//        listBoundPathStatuses({ repoRoot, state, privateReferences? })
//          -> { ok, entries: [{ field, path, status }],
//               failures: [{ code, path }],
//               deviceLocal: [{ path, kind: "device-local" }] }
//        renderHandoverBoundPaths(result) -> string
//      `status` is one of tracked | ignored | untracked | modified. A bound
//      path in State is a field the classification table (A4) marks
//      "tracked-required". `privateReferences` are the private-store paths the
//      caller found in the package and receipts.
//  A4  New module lib/bound-path-classification.mjs exports
//        BOUND_PATH_FIELD_CLASSIFICATION: object keyed by dotted State field
//          path with array indices elided (e.g. "planPresentation.designWorkflowPackagePath"),
//          value "tracked-required" | "device-local" | "not-bound"
//        classifyBoundPathReference(value) -> same domain, by VALUE; every
//          private-store reference (the .git/agent-pipeline prefix) is "device-local".
//  A5  The ratchet enumerates State fields by walking a fixture State and, when
//      present, the repository's live State file (read only). A field is a
//      path-naming field when its key ends in Path or Paths, or when its string
//      value points into the private store. No State JSON schema exists to walk.
//
// Not pinned (gap, reported to the dispatcher): dispatch records and Verify
// snapshots as device-local artifacts, because no State field names them.
//
// Fixtures live in throwaway git repositories under the OS temp directory.
// Registration of this file in the verify suite manifest is a separate step
// (protected path TP-13) and is not done here.

import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const FEATURE = "r7-3-fixture";
const PLAN = `specs/${FEATURE}/prd.md`;
const SPEC = `specs/${FEATURE}/spec.md`;
const PKG_TRACKED = `specs/${FEATURE}/evidence/design-workflow/pkg.json`;
const PKG_IGNORED = `evidence/design-course/${FEATURE}/pkg.json`;
const PKG_UNTRACKED = `specs/${FEATURE}/evidence/design-workflow/new.json`;
const PRIVATE_READINESS = ".git/agent-pipeline/design-readiness/fp0/drh_0001.json";
const PRIVATE_COURSE = ".git/agent-pipeline/design-advisor-courses/fp0/course.json";
const STUB_PACKAGE = '{"schema":"pipeline.design-workflow-package.v1"}\n';

const sha256 = (text) => createHash("sha256").update(text).digest("hex");

function git(cwd, ...args) {
  return execFileSync("git", ["-c", "core.autocrlf=false", "-c", "commit.gpgsign=false", ...args],
    { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function put(root, rel, text) {
  const target = join(root, ...rel.split("/"));
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, text);
}

function makeRepo() {
  const root = mkdtempSync(join(tmpdir(), "r7-3-bound-"));
  git(root, "init", "-q");
  git(root, "config", "user.name", "R7-3 Fixture");
  git(root, "config", "user.email", "r7-3@example.invalid");
  put(root, ".gitignore", "/evidence/\n/scratch/\n");
  put(root, PLAN, "# plan\n");
  put(root, SPEC, "# spec\n");
  put(root, PKG_TRACKED, STUB_PACKAGE);
  git(root, "add", "--", ".gitignore", PLAN, SPEC, PKG_TRACKED);
  git(root, "commit", "-q", "-m", "fixture");
  return root;
}

function callBuilder(root, packagePath) {
  return import("../lib/design-workflow-approval.mjs").then(({ createDesignWorkflowPackageApprovalRequest }) => {
    try {
      return createDesignWorkflowPackageApprovalRequest({
        repoRoot: root, packagePath, featureId: FEATURE,
        planPath: PLAN, planSha256: sha256("# plan\n"),
        specPath: SPEC, specSha256: sha256("# spec\n"),
        readCandidate: () => ({ commit: git(root, "rev-parse", "HEAD"), tree: git(root, "rev-parse", "HEAD^{tree}") }),
      });
    } catch (error) { return { ok: false, code: `THROWN:${error?.message}` }; }
  });
}

async function loadAssumed(moduleName, exportName, assumption) {
  let mod;
  try { mod = await import(new URL(`../lib/${moduleName}`, import.meta.url).href); }
  catch (error) {
    if (error?.code === "ERR_MODULE_NOT_FOUND") assert.fail(`R7-3 assumption ${assumption} not met: lib/${moduleName} does not exist yet`);
    throw error;
  }
  assert.ok(mod[exportName] !== undefined, `R7-3 assumption ${assumption} not met: lib/${moduleName} lacks export ${exportName}`);
  return mod[exportName];
}

function stateFor(packagePath) {
  return {
    planSubmission: { planPath: PLAN, specPath: SPEC },
    planPresentation: { designWorkflowPackagePath: packagePath },
    planApproval: { designWorkflowPackagePath: packagePath },
  };
}

// ---------------------------------------------------------------- R7-3a

function assertRefusal(result, code, repairPattern) {
  assert.equal(result.ok, false, JSON.stringify(result));
  assert.equal(result.code, code, JSON.stringify(result));
  assert.equal(typeof result.repair, "string", `typed repair missing: ${JSON.stringify(result)}`);
  assert.match(result.repair, repairPattern, result.repair);
}

test("R7-3a present-plan validation refuses a git-ignored bound path with DWP-BOUND-PATH-IGNORED and the tracked-prefix repair", async () => {
  const root = makeRepo();
  put(root, PKG_IGNORED, STUB_PACKAGE);
  assertRefusal(await callBuilder(root, PKG_IGNORED), "DWP-BOUND-PATH-IGNORED", /specs\/.+\/evidence\//u);
});

test("R7-3a present-plan validation refuses an untracked bound path with DWP-BOUND-PATH-UNTRACKED and the stage-and-commit repair", async () => {
  const root = makeRepo();
  put(root, PKG_UNTRACKED, STUB_PACKAGE);
  assertRefusal(await callBuilder(root, PKG_UNTRACKED), "DWP-BOUND-PATH-UNTRACKED", /stage|commit/iu);
});

test("R7-3a present-plan validation refuses a bound path modified against HEAD with DWP-BOUND-PATH-MODIFIED and the stage-and-commit repair", async () => {
  const root = makeRepo();
  put(root, PKG_TRACKED, '{"schema":"pipeline.design-workflow-package.v1","edited":true}\n');
  assertRefusal(await callBuilder(root, PKG_TRACKED), "DWP-BOUND-PATH-MODIFIED", /stage|commit/iu);
});

test("R7-3a present-plan validation does not refuse a tracked, clean bound path as a bound-path violation", async () => {
  const root = makeRepo();
  const result = await callBuilder(root, PKG_TRACKED);
  // The stub is not a complete package, so a later, unrelated refusal is
  // expected; only the bound-path codes are ruled out. Green today by design.
  assert.doesNotMatch(String(result.code ?? ""), /^DWP-BOUND-PATH-/u, JSON.stringify(result));
});

// ---------------------------------------------------------------- R7-3c

async function listStatuses(root, state, extra = {}) {
  const list = await loadAssumed("bound-path-status.mjs", "listBoundPathStatuses", "A3");
  return list({ repoRoot: root, state, ...extra });
}

const statusByPath = (result) => Object.fromEntries((result.entries ?? []).map((entry) => [entry.path, entry.status]));

test("R7-3c close check lists every State bound path with its status and fails on an ignored one", async () => {
  const root = makeRepo();
  put(root, PKG_IGNORED, STUB_PACKAGE);
  const result = await listStatuses(root, stateFor(PKG_IGNORED));
  assert.deepEqual(statusByPath(result), { [PLAN]: "tracked", [SPEC]: "tracked", [PKG_IGNORED]: "ignored" });
  assert.equal(result.ok, false);
  assert.deepEqual(result.failures, [{ code: "DWP-BOUND-PATH-IGNORED", path: PKG_IGNORED }]);
});

test("R7-3c close check fails on one untracked bound path and lists the others as tracked", async () => {
  const root = makeRepo();
  put(root, PKG_UNTRACKED, STUB_PACKAGE);
  const result = await listStatuses(root, stateFor(PKG_UNTRACKED));
  assert.deepEqual(statusByPath(result), { [PLAN]: "tracked", [SPEC]: "tracked", [PKG_UNTRACKED]: "untracked" });
  assert.equal(result.ok, false);
  assert.deepEqual(result.failures, [{ code: "DWP-BOUND-PATH-UNTRACKED", path: PKG_UNTRACKED }]);
});

test("R7-3c close check reports a bound path modified against HEAD with its own status and code", async () => {
  const root = makeRepo();
  put(root, SPEC, "# spec, edited\n");
  const result = await listStatuses(root, stateFor(PKG_TRACKED));
  assert.equal(statusByPath(result)[SPEC], "modified");
  assert.equal(result.ok, false);
  assert.deepEqual(result.failures, [{ code: "DWP-BOUND-PATH-MODIFIED", path: SPEC }]);
});

test("R7-3c close check passes when every bound path is tracked and clean", async () => {
  const root = makeRepo();
  const result = await listStatuses(root, stateFor(PKG_TRACKED));
  assert.deepEqual(statusByPath(result), { [PLAN]: "tracked", [SPEC]: "tracked", [PKG_TRACKED]: "tracked" });
  assert.equal(result.ok, true);
  assert.deepEqual(result.failures, []);
});

test("R7-3c handover output names the device-local artifacts as device-local", async () => {
  const root = makeRepo();
  const result = await listStatuses(root, stateFor(PKG_TRACKED), { privateReferences: [PRIVATE_READINESS, PRIVATE_COURSE] });
  assert.deepEqual((result.deviceLocal ?? []).map((entry) => entry.path).sort(), [PRIVATE_COURSE, PRIVATE_READINESS].sort());
  assert.ok((result.deviceLocal ?? []).every((entry) => entry.kind === "device-local"));
  assert.ok(!Object.keys(statusByPath(result)).some((path) => path.startsWith(".git/")), "a private-store path is never a bound path");
  const render = await loadAssumed("bound-path-status.mjs", "renderHandoverBoundPaths", "A3");
  const text = render(result);
  for (const path of [PRIVATE_READINESS, PRIVATE_COURSE]) {
    const line = text.split("\n").find((candidate) => candidate.includes(path));
    assert.ok(line, `handover text does not name ${path}`);
    assert.match(line, /device-local/u, line);
  }
});

// ---------------------------------------------------------------- R7-3d

const CLASSES = new Set(["tracked-required", "device-local", "not-bound"]);
const PRIVATE_STORE = /^\.git\/agent-pipeline\//u;

function collectPathFields(value, prefix = "", found = new Map()) {
  if (Array.isArray(value)) {
    for (const item of value) collectPathFields(item, prefix, found);
  } else if (value !== null && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) collectPathFields(child, prefix === "" ? key : `${prefix}.${key}`, found);
  } else if (typeof value === "string") {
    const leaf = prefix.split(".").at(-1) ?? "";
    if (/Paths?$/u.test(leaf) || PRIVATE_STORE.test(value)) found.set(prefix, [...(found.get(prefix) ?? []), value]);
  }
  return found;
}

// Shaped after the real plan-approval State records (field names only).
const FIXTURE_STATE = {
  planSubmission: { planPath: PLAN, specPath: SPEC },
  planApprovalBriefing: { scope: { planPath: PLAN, specPath: SPEC } },
  planPresentation: {
    designWorkflowPackagePath: PKG_TRACKED,
    designWorkflowApprovalRequestPath: "scratch/design-workflow-approval-request-0.json",
  },
  planApproval: {
    poGateAuthority: { planPath: PLAN, specPath: SPEC },
    designWorkflowPackagePath: PKG_TRACKED,
  },
};

const EXPECTED_FIXTURE_FIELDS = [
  "planApproval.designWorkflowPackagePath",
  "planApproval.poGateAuthority.planPath",
  "planApproval.poGateAuthority.specPath",
  "planApprovalBriefing.scope.planPath",
  "planApprovalBriefing.scope.specPath",
  "planPresentation.designWorkflowApprovalRequestPath",
  "planPresentation.designWorkflowPackagePath",
  "planSubmission.planPath",
  "planSubmission.specPath",
];

test("R7-3d ratchet walker finds every path-naming field of the fixture State (non-vacuity guard)", () => {
  assert.deepEqual([...collectPathFields(FIXTURE_STATE).keys()].sort(), EXPECTED_FIXTURE_FIELDS);
});

test("R7-3d every State field that names a bound path has a classification", async () => {
  const table = await loadAssumed("bound-path-classification.mjs", "BOUND_PATH_FIELD_CLASSIFICATION", "A4");
  const unclassified = [...collectPathFields(FIXTURE_STATE).keys()].filter((field) => !Object.hasOwn(table, field));
  assert.deepEqual(unclassified, [], `unclassified State fields: ${unclassified.join(", ")}`);
  for (const [field, kind] of Object.entries(table)) assert.ok(CLASSES.has(kind), `${field}: ${kind} is not a known class`);
});

test("R7-3d every path-naming field of the repository's live State has a classification", async (t) => {
  const statePath = resolve(HERE, "..", "..", "..", "project", "pipeline-state.json");
  if (!existsSync(statePath)) { t.skip("no live State file at the expected repository location"); return; }
  const table = await loadAssumed("bound-path-classification.mjs", "BOUND_PATH_FIELD_CLASSIFICATION", "A4");
  const live = collectPathFields(JSON.parse(readFileSync(statePath, "utf8")));
  const unclassified = [...live.keys()].filter((field) => !Object.hasOwn(table, field));
  assert.deepEqual(unclassified, [], `unclassified live State fields: ${unclassified.join(", ")}`);
});

test("R7-3d private-store references classify as device-local by value", async () => {
  const classify = await loadAssumed("bound-path-classification.mjs", "classifyBoundPathReference", "A4");
  assert.equal(classify(PRIVATE_READINESS), "device-local");
  assert.equal(classify(PRIVATE_COURSE), "device-local");
  assert.equal(classify(PKG_TRACKED), "tracked-required");
});
