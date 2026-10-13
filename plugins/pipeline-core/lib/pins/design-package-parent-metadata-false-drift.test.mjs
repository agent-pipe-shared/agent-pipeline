// SPDX-License-Identifier: SUL-1.0
// Regression pin: pipeline.design-package-parent-metadata-false-drift (ALF-C-P2-06, AC-154).
// Unchanged parent-directory metadata (size, mtime, link count) of an approved design
// package must not be reported as drift, while parent replacement/alias/mode change and
// admitted-leaf tampering must still fail. Exercised through the real exported reader
// readApprovedDesignWorkflowPackage; only the module's documented readCandidate seam and
// a fs.readFileSync interposer (same technique as the adjacent design-workflow-package
// test) place a mutation exactly inside the final physical reopen.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync, linkSync, renameSync, chmodSync, lstatSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  designWorkflowAdvisorQuestionSha256,
  readApprovedDesignWorkflowPackage,
} from "../design-workflow-package.mjs";
import { designReadinessReportSha256 } from "../design-readiness-host-evidence.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const scratchBase = join(here, "..", "..", "..", "..", "scratch");
const sha = (value) => createHash("sha256").update(value).digest("hex");
const candidate = { commit: "a".repeat(40), tree: "b".repeat(40) };
const serialized = (value) => Buffer.from(`${JSON.stringify(value)}\n`, "utf8");

function makeFixture() {
  const sources = {};
  const sourceBytes = {};
  for (const [name, path] of Object.entries({
    input: "specs/feature/input.md", prd: "specs/feature/prd.md", spec: "specs/feature/spec.md",
    design: "specs/feature/design.md", traceability: "specs/feature/traceability.md",
  })) {
    const data = Buffer.from(`${name} source\n`, "utf8");
    sources[name] = { path, sha256: sha(data) };
    sourceBytes[name] = { path, bytes: data };
  }
  const advisorReceipt = {
    schema: "pipeline.advisory-receipt.v1", receiptId: "advisor-receipt-1",
    dispatch: { dispatchId: "advisor-dispatch", queueRevision: 0, candidateCommit: candidate.commit, candidateTree: candidate.tree },
    duty: "advisory", profile: "feature",
    configuredRoute: { runner: "codex", selector: { kind: "model-id", value: "gpt-6-sol" }, effort: "high" },
    adapter: "consult",
    observed: { status: "answered", identity: { provider: "openai", modelId: "gpt-6-sol", effort: "high" } },
    questionSha256: designWorkflowAdvisorQuestionSha256(sources), answerSha256: "c".repeat(64),
    fallback: { reason: "none", redactedErrorClass: null }, emittedAtMs: 1,
  };
  const advisorReceiptBytes = serialized(advisorReceipt);
  const readinessReport = {
    schema: "pipeline.design-readiness-receipt.v1", dispatchId: "readiness-dispatch", runner: "codex", candidate, sources,
    outcome: "ready-for-po-review",
    findings: [{ code: "TRACE-OK", severity: "non-blocking", summary: "Traceability is complete." }],
    unresolvedChoices: [{ id: "CHOICE-1", question: "Choose rollout order?", impact: "Changes sequencing only." }],
    summary: "All source requirements are mapped; one low-impact rollout choice remains for the PO.",
  };
  const readinessBytes = serialized({
    ...readinessReport,
    hostExecution: {
      schema: "pipeline.design-readiness-host-execution.v1", runner: "codex", repoFingerprint: "f".repeat(64),
      selectionId: `css_${"a".repeat(25)}e`, selectionSha256: "b".repeat(64), executionReceiptSha256: "c".repeat(64),
      dutyReceiptSha256: designReadinessReportSha256(readinessReport),
      route: { model: "gpt-6-luna", effort: "high", sourceSha256: "8".repeat(64), candidateCommit: candidate.commit },
    },
  });
  const workflowPackage = {
    schema: "pipeline.design-workflow-package.v1", featureId: "feature-1", authoringDispatchId: "authoring-dispatch",
    candidate, sources,
    advisor: {
      status: "answered", runner: "codex", nativeAvailable: false,
      receipt: { path: "specs/feature/evidence/advisor.json", sha256: sha(advisorReceiptBytes) },
      attemptTrail: null,
      disposition: { decision: "accept", rationale: "The advice is incorporated in the revised design." },
      exception: null,
    },
    readiness: { path: "specs/feature/evidence/readiness.json", sha256: sha(readinessBytes), dispatchId: "readiness-dispatch" },
    createdAt: "2026-09-26T10:11:12.000Z",
  };
  return { workflowPackage, packageBytes: serialized(workflowPackage), sourceBytes, advisorReceiptBytes, readinessBytes };
}

function materialize(root, fixture) {
  const packagePath = "specs/feature/evidence/design-workflow-package.json";
  const files = [
    ...Object.values(fixture.sourceBytes).map((entry) => [entry.path, entry.bytes]),
    [fixture.workflowPackage.advisor.receipt.path, fixture.advisorReceiptBytes],
    [fixture.workflowPackage.readiness.path, fixture.readinessBytes],
    [packagePath, fixture.packageBytes],
  ];
  for (const [path, data] of files) {
    const target = join(root, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, data);
  }
  return packagePath;
}

function approvedArgs(root, fixture, packagePath) {
  const sources = fixture.workflowPackage.sources;
  return {
    repoRoot: root, packagePath, packageSha256: sha(fixture.packageBytes), featureId: fixture.workflowPackage.featureId,
    planPath: sources.prd.path, planSha256: sources.prd.sha256, specPath: sources.spec.path, specSha256: sources.spec.sha256,
    readCandidate: () => candidate,
  };
}

function withFixtureRoot(run) {
  mkdirSync(scratchBase, { recursive: true });
  const root = mkdtempSync(join(scratchBase, "dwp-parent-pin-"));
  try { return run(root); }
  finally { rmSync(root, { recursive: true, force: true }); }
}

// Reads the approved package; `mutation` (optional) fires once, inside the first final
// physical reopen of the package file (after all 8 initial descriptor reads).
function readWithMutation(mutation, prepare = () => {}) {
  return withFixtureRoot((root) => {
    const fixture = makeFixture();
    const packagePath = materialize(root, fixture);
    const artifactPaths = [packagePath, ...Object.values(fixture.workflowPackage.sources).map((s) => s.path),
      fixture.workflowPackage.advisor.receipt.path, fixture.workflowPackage.readiness.path];
    const nativeRead = fs.readFileSync;
    const before = artifactPaths.map((path) => nativeRead(join(root, path)));
    prepare({ root, packagePath, artifactPaths, before, fixture });
    let descriptorReads = 0;
    let mutationCalls = 0;
    if (mutation) {
      fs.readFileSync = function (...args) {
        const bytes = nativeRead(...args);
        if (typeof args[0] === "number" && ++descriptorReads === artifactPaths.length + 1) {
          mutationCalls++;
          mutation({ root, packagePath, artifactPaths, before });
        }
        return bytes;
      };
      syncBuiltinESMExports();
    }
    try {
      const result = readApprovedDesignWorkflowPackage(approvedArgs(root, fixture, packagePath));
      if (mutation) assert.equal(mutationCalls, 1, "mutation fires exactly inside the first final physical reopen");
      return { result, root, artifactPaths, before, fixture };
    } finally {
      fs.readFileSync = nativeRead;
      syncBuiltinESMExports();
    }
  });
}

function assertAccepted(outcome) {
  assert.equal(outcome.result.ok, true, JSON.stringify(outcome.result));
  assert.equal(outcome.result.approvedBinding, true);
}
function assertRejected(outcome, code) {
  assert.equal(outcome.result.ok, false, "must be rejected");
  assert.equal(outcome.result.code, code);
}

// Host-limitation probes (typed skip reasons; Windows cannot express these controls).
function probeDirectoryModeBits() {
  mkdirSync(scratchBase, { recursive: true });
  const dir = mkdtempSync(join(scratchBase, "dwp-parent-probe-"));
  try {
    const initial = lstatSync(dir).mode;
    chmodSync(dir, 0o500);
    return lstatSync(dir).mode !== initial;
  } catch { return false; } finally { try { chmodSync(dir, 0o700); } catch { /* none */ } rmSync(dir, { recursive: true, force: true }); }
}
function probeSymlink(kind) {
  mkdirSync(scratchBase, { recursive: true });
  const dir = mkdtempSync(join(scratchBase, "dwp-parent-probe-"));
  try {
    writeFileSync(join(dir, "f"), "x");
    mkdirSync(join(dir, "d"));
    if (kind === "dir") symlinkSync(join(dir, "d"), join(dir, "ld"), "dir");
    else symlinkSync(join(dir, "f"), join(dir, "lf"), "file");
    return true;
  } catch { return false; } finally { rmSync(dir, { recursive: true, force: true }); }
}
const modeBits = probeDirectoryModeBits();
const dirSymlinks = probeSymlink("dir");
const fileSymlinks = probeSymlink("file");
const skipReason = (ok, what) => (ok ? false : `host-limitation: ${what} unavailable on this host`);

test("baseline: untouched approved package is accepted", () => {
  assertAccepted(readWithMutation(null));
});

test("AC1 unrelated sibling directory created inside the final read is not drift", () => {
  const outcome = readWithMutation(({ root }) => mkdirSync(join(root, "unrelated-sibling-directory")));
  assertAccepted(outcome);
  assert.deepEqual(outcome.artifactPaths.length, 8);
});

test("AC1 unrelated sibling file created at the repo root inside the final read is not drift", () => {
  assertAccepted(readWithMutation(({ root }) => writeFileSync(join(root, "unrelated-sibling-file"), "unrelated content\n")));
});

test("AC1 unrelated entries created in the artifact's own parent directories are not drift", () => {
  // The artifact parents (specs, specs/feature, specs/feature/evidence) change size/mtime/nlink.
  assertAccepted(readWithMutation(({ root }) => {
    writeFileSync(join(root, "specs", "feature", "evidence", "unrelated-file.txt"), "x\n");
    mkdirSync(join(root, "specs", "feature", "unrelated-dir"));
    writeFileSync(join(root, "specs", "unrelated-top-file.txt"), "y\n");
    mkdirSync(join(root, "specs", "unrelated-top-dir"));
  }));
});

test("AC1 removing an unrelated sibling entry inside the final read is not drift", () => {
  assertAccepted(readWithMutation(
    ({ root }) => rmSync(join(root, "specs", "feature", "to-remove.txt")),
    ({ root }) => writeFileSync(join(root, "specs", "feature", "to-remove.txt"), "gone soon\n"),
  ));
});

test("AC1 admitted artifact bytes stay byte-identical after sibling creation", () => {
  const outcome = readWithMutation(({ root }) => writeFileSync(join(root, "sibling.txt"), "s\n"));
  assertAccepted(outcome);
  assert.equal(outcome.result.packageSha256, sha(outcome.fixture.packageBytes));
});

test("AC2 parent replacement (same bytes, new directory identity) still fails", () => {
  assertRejected(readWithMutation(({ root, artifactPaths, before }) => {
    renameSync(join(root, "specs"), join(root, "displaced-specs"));
    for (const [index, path] of artifactPaths.entries()) {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      writeFileSync(join(root, path), before[index]);
    }
  }), "DWP-PHYSICAL-DRIFT");
});

test("AC2 parent directory mode change still fails",
  { skip: skipReason(modeBits, "directory mode bits") }, () => {
    assertRejected(readWithMutation(({ root }) => chmodSync(join(root, "specs", "feature"), 0o500)), "DWP-PHYSICAL-DRIFT");
  });

test("AC2 parent replaced by a directory alias (symlink) still fails",
  { skip: skipReason(dirSymlinks, "directory symlinks") }, () => {
    assertRejected(readWithMutation(({ root }) => {
      renameSync(join(root, "specs"), join(root, "displaced-specs"));
      symlinkSync(join(root, "displaced-specs"), join(root, "specs"), "dir");
    }), "DWP-PHYSICAL-DRIFT");
  });

test("AC2 admitted leaf bytes changed inside the final read still fail", () => {
  assertRejected(readWithMutation(({ root, packagePath }) =>
    writeFileSync(join(root, packagePath), "changed admitted package bytes\n")), "DWP-PHYSICAL-DRIFT");
});

test("AC2 admitted source leaf changed to same-length different bytes still fails", () => {
  assertRejected(readWithMutation(({ root }) =>
    writeFileSync(join(root, "specs", "feature", "input.md"), "INPUT source\n")), "DWP-PHYSICAL-DRIFT");
});

test("AC2 admitted leaf grown (oversized versus the first read) inside the final read still fails", () => {
  assertRejected(readWithMutation(({ root }) =>
    writeFileSync(join(root, "specs", "feature", "design.md"), Buffer.alloc(4096, 0x61))), "DWP-PHYSICAL-DRIFT");
});

test("AC2 admitted leaf turned into invalid UTF-8 inside the final read still fails", () => {
  assertRejected(readWithMutation(({ root }) =>
    writeFileSync(join(root, "specs", "feature", "spec.md"), Buffer.from([0xff, 0xfe, 0xfd, 0x0a]))), "DWP-PHYSICAL-DRIFT");
});

test("AC2 admitted leaf hardlinked inside the final read still fails", () => {
  assertRejected(readWithMutation(({ root }) =>
    linkSync(join(root, "specs", "feature", "prd.md"), join(root, "prd-alias.md"))), "DWP-PHYSICAL-DRIFT");
});

test("AC2 admitted source that is already hardlinked before the read is refused", () => {
  assertRejected(readWithMutation(null, ({ root }) =>
    linkSync(join(root, "specs", "feature", "input.md"), join(root, "input-alias.md"))), "DWP-SOURCE-PHYSICAL");
});

test("AC2 admitted source already larger than the reader bound is refused", () => {
  assertRejected(readWithMutation(null, ({ root }) =>
    writeFileSync(join(root, "specs", "feature", "input.md"), Buffer.alloc(1024 * 1024 + 1, 0x61))), "DWP-SOURCE-PHYSICAL");
});

test("AC2 admitted source with invalid UTF-8 before the read is refused", () => {
  assertRejected(readWithMutation(null, ({ root }) =>
    writeFileSync(join(root, "specs", "feature", "input.md"), Buffer.from([0xc3, 0x28, 0x0a]))), "DWP-SOURCE-PHYSICAL");
});

test("AC2 admitted package with invalid UTF-8 before the read is refused", () => {
  assertRejected(readWithMutation(null, ({ root, packagePath }) =>
    writeFileSync(join(root, packagePath), Buffer.from([0x7b, 0xff, 0x7d]))), "DWP-PACKAGE-PHYSICAL");
});

test("AC2 admitted source replaced by a file alias (symlink) before the read is refused",
  { skip: skipReason(fileSymlinks, "file symlinks") }, () => {
    assertRejected(readWithMutation(null, ({ root }) => {
      const target = join(root, "linked-input.md");
      writeFileSync(target, "input source\n");
      const source = join(root, "specs", "feature", "input.md");
      rmSync(source);
      symlinkSync(target, source, "file");
    }), "DWP-SOURCE-PHYSICAL");
  });

test("AC2 path traversal and absolute package paths are refused", () => {
  withFixtureRoot((root) => {
    const fixture = makeFixture();
    const packagePath = materialize(root, fixture);
    const args = approvedArgs(root, fixture, packagePath);
    assert.equal(readApprovedDesignWorkflowPackage({ ...args, packagePath: "../outside/design-workflow-package.json" }).code, "DWP-READER-INPUT");
    assert.equal(readApprovedDesignWorkflowPackage({ ...args, packagePath: "specs/../../escape.json" }).code, "DWP-READER-INPUT");
    assert.equal(readApprovedDesignWorkflowPackage({ ...args, packagePath: join(root, packagePath) }).code, "DWP-READER-INPUT");
    assert.equal(readApprovedDesignWorkflowPackage({ ...args, planPath: "../prd.md" }).code, "DWP-APPROVAL-BINDING");
  });
});

test("AC3 the original registered adjacent corpus still carries the parent-metadata controls", () => {
  const adjacent = readFileSync(join(here, "..", "design-workflow-package.test.mjs"), "utf8");
  for (const needle of ["unrelated-sibling-directory", "unrelated-sibling-file", "changed admitted package bytes", "physicalReadbackMutationControl"]) {
    assert.ok(adjacent.includes(needle), `adjacent corpus must keep ${needle}`);
  }
});
