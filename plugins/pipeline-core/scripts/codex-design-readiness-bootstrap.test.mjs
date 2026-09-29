#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { designReadinessReportSha256 } from "../lib/design-readiness-host-evidence.mjs";
import { designWorkflowAdvisorQuestionSha256, readDesignWorkflowPackageFromRepository } from "../lib/design-workflow-package.mjs";
import { runCodexDesignReadinessBootstrap } from "./codex-design-readiness-bootstrap.mjs";

const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const NAMES = ["input", "prd", "spec", "design", "traceability"];
const CANDIDATE = { commit: "a".repeat(40), tree: "b".repeat(40) };

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "codex-design-readiness-bootstrap-"));
  const refs = {};
  mkdirSync(join(root, "specs", "feature"), { recursive: true });
  mkdirSync(join(root, "evidence", "design"), { recursive: true });
  writeFileSync(join(root, "pipeline.user.yaml"), readFileSync(new URL("../../../pipeline.user.yaml", import.meta.url)), { mode: 0o600 });
  for (const name of NAMES) {
    const path = `specs/feature/${name}.md`;
    const bytes = Buffer.from(`# ${name}\nCandidate-bound input.\n`, "utf8");
    writeFileSync(join(root, path), bytes, { mode: 0o600 });
    refs[name] = { path, bytes };
  }
  return { root, refs, receiptPath: "evidence/design/readiness.json" };
}

function args(fx) {
  return [
    "--repo-root", fx.root,
    "--dispatch-id", "design-readiness-cli-test-1",
    "--queue-revision", "7",
    "--session-id", "session-test",
    "--expected-descriptor-sha256", "c".repeat(64),
    "--receipt", fx.receiptPath,
    ...NAMES.flatMap((name) => ["--source", name, fx.refs[name].path]),
  ];
}

function dependencies(fx, { readCandidates, mutateWorkingCopy } = {}) {
  let calls = 0;
  const report = (input) => {
    const sourceEntries = Object.fromEntries(NAMES.map((name) => [name, {
      path: fx.refs[name].path,
      sha256: sha(fx.refs[name].bytes),
    }]));
    const body = {
      schema: "pipeline.design-readiness-receipt.v1",
      dispatchId: "design-readiness-cli-test-1",
      runner: "codex",
      candidate: input.dispatch.candidate,
      sources: sourceEntries,
      outcome: "ready-for-po-review",
      findings: [],
      unresolvedChoices: [],
      summary: "All five candidate-bound design sources are ready for PO review.",
    };
    return {
      ...body,
      hostExecution: {
        schema: "pipeline.design-readiness-host-execution.v1",
        runner: "codex",
        repoFingerprint: input.repoFingerprint,
        selectionId: "css_aaaaaaaaaaaaaaaaaaaaaaaaae",
        selectionSha256: "d".repeat(64),
        executionReceiptSha256: "e".repeat(64),
        dutyReceiptSha256: designReadinessReportSha256(body),
        route: { model: "gpt-6-luna", effort: "high", sourceSha256: "f".repeat(64), candidateCommit: CANDIDATE.commit },
      },
    };
  };
  return {
    get calls() { return calls; },
    requireProjectOnboardingReadyFn: (value) => assert.deepEqual(value, { rootDir: fx.root, intent: "dispatch", runner: "codex" }),
    resolveExecutableFn: () => process.execPath,
    resolveTopologyFn: () => ({ gitCommonDir: join(fx.root, ".git"), primaryRoot: fx.root }),
    readCandidateFn: () => {
      if (typeof readCandidates === "function") return readCandidates();
      return CANDIDATE;
    },
    execFileSyncFn: (_file, argv) => {
      const sourcePath = argv[1].slice("HEAD:".length);
      return Buffer.from(fx.refs[NAMES.find((name) => fx.refs[name].path === sourcePath)]?.bytes ?? "");
    },
    async runReadinessHostFn(input) {
      calls += 1;
      assert.equal(input.repoRoot, fx.root);
      assert.match(input.dispatch.referenceSetSha256, /^[a-f0-9]{64}$/u);
      assert.deepEqual(input.dispatch, {
        queueRevision: 7,
        candidateCommit: CANDIDATE.commit,
        candidateTree: CANDIDATE.tree,
        referenceSetSha256: input.dispatch.referenceSetSha256,
      });
      if (mutateWorkingCopy) mutateWorkingCopy();
      return { status: "reviewed", readinessReceipt: report({ ...input, dispatch: { candidate: CANDIDATE } }) };
    },
  };
}

test("Codex readiness bootstrap dispatches exact committed sources and publishes one exclusive receipt", async (context) => {
  const fx = fixture();
  context.after(() => rmSync(fx.root, { recursive: true, force: true }));
  const deps = dependencies(fx);
  const result = await runCodexDesignReadinessBootstrap(args(fx), deps);
  assert.equal(result.ok, true);
  assert.equal(result.code, "CODEX-READINESS-RECEIPT-PUBLISHED");
  assert.equal(result.path, fx.receiptPath);
  assert.equal(result.sha256, sha(readFileSync(join(fx.root, fx.receiptPath))));
  assert.equal(deps.calls, 1);

  await assert.rejects(() => runCodexDesignReadinessBootstrap(args(fx), deps), /refusing to overwrite/u);
  assert.equal(deps.calls, 1, "an existing immutable receipt is rejected before a second provider call");
});

test("the bootstrap receipt is consumable by the physical final-package reader without changing its host binding", async (context) => {
  const fx = fixture();
  context.after(() => rmSync(fx.root, { recursive: true, force: true }));
  const deps = dependencies(fx);
  const published = await runCodexDesignReadinessBootstrap(args(fx), deps);
  const readinessBytes = readFileSync(join(fx.root, fx.receiptPath));
  const readinessReceipt = JSON.parse(readinessBytes.toString("utf8"));
  const sources = Object.fromEntries(NAMES.map((name) => [name, {
    path: fx.refs[name].path,
    sha256: sha(fx.refs[name].bytes),
  }]));
  const advisorReceipt = {
    schema: "pipeline.advisory-receipt.v1",
    receiptId: "advisor-receipt-1",
    dispatch: { dispatchId: "advisor-dispatch-1", queueRevision: 6, candidateCommit: CANDIDATE.commit, candidateTree: CANDIDATE.tree },
    duty: "advisory",
    profile: "feature",
    configuredRoute: { runner: "codex", selector: { kind: "model-id", value: "gpt-6-sol" }, effort: "high" },
    adapter: "consult",
    observed: { status: "answered", identity: { provider: "openai", modelId: "gpt-6-sol", effort: "high" } },
    questionSha256: designWorkflowAdvisorQuestionSha256(sources),
    answerSha256: "c".repeat(64),
    fallback: { reason: "none", redactedErrorClass: null },
    emittedAtMs: 1,
  };
  const advisorBytes = Buffer.from(`${JSON.stringify(advisorReceipt)}\n`, "utf8");
  const workflowPackage = {
    schema: "pipeline.design-workflow-package.v1",
    featureId: "feature-readiness-test",
    authoringDispatchId: "authoring-dispatch-1",
    candidate: CANDIDATE,
    sources,
    advisor: {
      status: "answered", runner: "codex", nativeAvailable: false,
      receipt: { path: "specs/feature/evidence/advisor.json", sha256: sha(advisorBytes) },
      attemptTrail: null,
      disposition: { decision: "accept", rationale: "The advice is reflected in the candidate design." },
      exception: null,
    },
    readiness: { path: fx.receiptPath, sha256: published.sha256, dispatchId: readinessReceipt.dispatchId },
    createdAt: "2026-09-27T00:00:00.000Z",
  };
  mkdirSync(join(fx.root, "specs", "feature", "evidence"), { recursive: true });
  writeFileSync(join(fx.root, "specs/feature/evidence/advisor.json"), advisorBytes, { mode: 0o600 });
  const packagePath = "specs/feature/evidence/design-workflow-package.json";
  writeFileSync(join(fx.root, packagePath), `${JSON.stringify(workflowPackage)}\n`, { mode: 0o600 });
  const readback = readDesignWorkflowPackageFromRepository({
    repoRoot: fx.root,
    packagePath,
    readCandidate: () => CANDIDATE,
    verifyReadinessExecution: ({ hostExecution, readinessReceipt: report }) =>
      hostExecution?.runner === "codex" && hostExecution.dutyReceiptSha256 === designReadinessReportSha256(report)
        ? { ok: true } : { ok: false, code: "DWP-TEST-READINESS-BINDING" },
  });
  assert.equal(readback.ok, true, JSON.stringify(readback));
  assert.equal(readback.readinessDispatchId, readinessReceipt.dispatchId);
  assert.equal(readback.workflowPackage.readiness.sha256, published.sha256);
  assert.equal(readback.implementationAuthority, false);
});

test("Codex readiness bootstrap refuses a physical source change before model execution", async (context) => {
  const fx = fixture();
  context.after(() => rmSync(fx.root, { recursive: true, force: true }));
  writeFileSync(join(fx.root, fx.refs.spec.path), "# changed after commit\n", { mode: 0o600 });
  const deps = dependencies(fx);
  await assert.rejects(() => runCodexDesignReadinessBootstrap(args(fx), deps), /differs from the selected Git candidate/u);
  assert.equal(deps.calls, 0);
});

test("Codex readiness bootstrap discards output when the candidate changes during review", async (context) => {
  const fx = fixture();
  context.after(() => rmSync(fx.root, { recursive: true, force: true }));
  let reads = 0;
  const deps = dependencies(fx, { readCandidates: () => (++reads < 2 ? CANDIDATE : { commit: "9".repeat(40), tree: CANDIDATE.tree }) });
  await assert.rejects(() => runCodexDesignReadinessBootstrap(args(fx), deps), /candidate or readiness source changed/u);
  assert.equal(deps.calls, 1);
  assert.throws(() => readFileSync(join(fx.root, fx.receiptPath)), { code: "ENOENT" });
});

test("Codex readiness bootstrap rejects duplicate source roles and flags before resolving a model", async (context) => {
  const fx = fixture();
  context.after(() => rmSync(fx.root, { recursive: true, force: true }));
  const deps = dependencies(fx);
  const duplicate = [...args(fx), "--dispatch-id", "second-id"];
  await assert.rejects(() => runCodexDesignReadinessBootstrap(duplicate, deps), /usage: codex-design-readiness-bootstrap/u);
  await assert.rejects(() => runCodexDesignReadinessBootstrap([...args(fx),'--advisor-preparation','evidence/design/preparation.json','--advisor-receipt','evidence/design/advisor.json','--advisor-route','evidence/design/route.json'],deps),/usage: codex-design-readiness-bootstrap/u);
  await assert.rejects(() => runCodexDesignReadinessBootstrap([...args(fx),'--advisor-preparation',fx.receiptPath],deps),/usage: codex-design-readiness-bootstrap/u);
  assert.equal(deps.calls, 0);
});

test("Codex readiness bootstrap honors an explicitly declined advisor export before resolving or invoking a provider", async (context) => {
  const fx = fixture();
  context.after(() => rmSync(fx.root, { recursive: true, force: true }));
  const config = readFileSync(join(fx.root, "pipeline.user.yaml"), "utf8");
  assert.match(config, /consent: "approved"/u);
  writeFileSync(join(fx.root, "pipeline.user.yaml"), config.replace('consent: "approved"', 'consent: "declined"'), { mode: 0o600 });
  const deps = dependencies(fx);
  deps.resolveExecutableFn = () => assert.fail("provider executable must not be resolved after export denial");
  await assert.rejects(() => runCodexDesignReadinessBootstrap(args(fx), deps), /not enabled by pipeline.user.yaml/u);
  assert.equal(deps.calls, 0);
  assert.throws(() => readFileSync(join(fx.root, fx.receiptPath)), { code: "ENOENT" });
});
