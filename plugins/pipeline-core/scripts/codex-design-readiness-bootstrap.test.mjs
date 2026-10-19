#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
//
// QG-04 justification (bounded; backlog item pipeline.design-course-run-v2-refuses-its-own-documented-routes, AC-151,
// Elephant decision E12). ADR-0085 retired the Codex design-readiness bootstrap as a mandatory readiness child route:
// runCodexDesignReadinessBootstrap now returns retiredDesignResult(DESIGN_COURSE_RETIRED) before parsing, state access,
// dispatch or publication, and that result grants no implementation authority. All six examiners below exercised that
// retired route (0/6 red on 2026-10-19 because the producer refuses by design) and therefore measured dead code, not a
// defect. They are RETARGETED, never deleted: each keeps its original name, its original fixture and its original
// dependency set, and its original intent is stated in the case comment. What changed is the asserted outcome, from the
// retired success/refusal behaviour to the retirement contract the AC-124 pin
// (claude-design-readiness-cannot-start-on-windows) already uses: the exact retired object, zero dependency touch and
// nothing published. The pre-change red run is retained as scratch evidence of the baseline sweep; the previous
// assertions are preserved in version control. Nothing here revives the retired route.

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { designReadinessReportSha256 } from "../lib/design-readiness-host-evidence.mjs";
import { designWorkflowAdvisorQuestionSha256, readDesignWorkflowPackageFromRepository } from "../lib/design-workflow-package.mjs";
import { DESIGN_COURSE_RETIRED, RETIRED_DESIGN_ROUTE_HINT } from "../lib/retired-design-codes.mjs";
import { runCodexDesignReadinessBootstrap } from "./codex-design-readiness-bootstrap.mjs";

const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const NAMES = ["input", "prd", "spec", "design", "traceability"];
const CANDIDATE = { commit: "a".repeat(40), tree: "b".repeat(40) };
const RETIRED = { ok: false, code: DESIGN_COURSE_RETIRED, hint: RETIRED_DESIGN_ROUTE_HINT, implementationAuthority: false };

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

// Records every dependency the producer reaches for. The retirement contract is that the list stays empty: the
// producer refuses before parsing, so no onboarding check, executable resolution, topology or candidate read, source
// read, provider call or publication ever happens.
function observed(deps) {
  const touched = [];
  const wrapped = {};
  for (const [name, value] of Object.entries(deps)) {
    if (typeof value === "function") wrapped[name] = (...forwarded) => { touched.push(name); return value(...forwarded); };
  }
  return { deps: wrapped, touched, host: deps };
}

test("Codex readiness bootstrap dispatches exact committed sources and publishes one exclusive receipt", async (context) => {
  // Original intent: valid inputs dispatch one provider call and publish one exclusive, never-overwritten receipt.
  // Retired (ADR-0085, DESIGN-COURSE-RETIRED): the same valid inputs now refuse, publish nothing and touch nothing.
  const fx = fixture();
  context.after(() => rmSync(fx.root, { recursive: true, force: true }));
  const { deps, touched, host } = observed(dependencies(fx));
  const first = await runCodexDesignReadinessBootstrap(args(fx), deps);
  assert.deepEqual(first, RETIRED);
  assert.equal(first.implementationAuthority, false);
  assert.equal(host.calls, 0, "no provider call");
  assert.throws(() => readFileSync(join(fx.root, fx.receiptPath)), { code: "ENOENT" }, "no receipt is published");

  // The former exclusive-publication guard: a pre-existing receipt is neither overwritten nor reported as an
  // overwrite refusal, because the producer never reaches publication.
  writeFileSync(join(fx.root, fx.receiptPath), "pre-existing receipt\n", { mode: 0o600 });
  const second = await runCodexDesignReadinessBootstrap(args(fx), deps);
  assert.deepEqual(second, RETIRED, "repeat call is identical and is not a refusing-to-overwrite error");
  assert.equal(readFileSync(join(fx.root, fx.receiptPath), "utf8"), "pre-existing receipt\n");
  assert.equal(host.calls, 0);
  assert.deepEqual(touched, []);
});

test("the bootstrap receipt is consumable by the physical final-package reader without changing its host binding", async (context) => {
  // Original intent: a receipt the bootstrap published is readable by the physical final-package reader with its
  // host binding unchanged. Retired (ADR-0085, DESIGN-COURSE-RETIRED): the bootstrap publishes no receipt, so a
  // workflow package that names the unpublished receipt path is not readable and never grants implementation authority.
  const fx = fixture();
  context.after(() => rmSync(fx.root, { recursive: true, force: true }));
  const { deps, touched } = observed(dependencies(fx));
  const published = await runCodexDesignReadinessBootstrap(args(fx), deps);
  assert.deepEqual(published, RETIRED);
  assert.deepEqual(touched, []);
  assert.throws(() => readFileSync(join(fx.root, fx.receiptPath)), { code: "ENOENT" }, "nothing for the reader to consume");
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
    readiness: { path: fx.receiptPath, sha256: "d".repeat(64), dispatchId: "design-readiness-cli-test-1" },
    createdAt: "2026-09-27T00:00:00.000Z",
  };
  mkdirSync(join(fx.root, "specs", "feature", "evidence"), { recursive: true });
  writeFileSync(join(fx.root, "specs/feature/evidence/advisor.json"), advisorBytes, { mode: 0o600 });
  const packagePath = "specs/feature/evidence/design-workflow-package.json";
  writeFileSync(join(fx.root, packagePath), `${JSON.stringify(workflowPackage)}\n`, { mode: 0o600 });
  let readback;
  try {
    readback = readDesignWorkflowPackageFromRepository({
      repoRoot: fx.root,
      packagePath,
      readCandidate: () => CANDIDATE,
      verifyReadinessExecution: () => ({ ok: false, code: "DWP-TEST-NO-PUBLISHED-READINESS" }),
    });
  } catch (error) {
    readback = { ok: false, thrown: error?.code ?? error?.message };
  }
  assert.equal(readback.ok, false, "a package naming an unpublished readiness receipt is not readable");
  assert.notEqual(readback.implementationAuthority, true, "and it grants no implementation authority");
});

test("Codex readiness bootstrap refuses a physical source change before model execution", async (context) => {
  // Original intent: a working-copy source edit is refused before any model execution. Retired (ADR-0085,
  // DESIGN-COURSE-RETIRED): the same edited sources reach the retirement refusal, which precedes every source read
  // and every model call, so the old source-differs error is no longer produced.
  const fx = fixture();
  context.after(() => rmSync(fx.root, { recursive: true, force: true }));
  writeFileSync(join(fx.root, fx.refs.spec.path), "# changed after commit\n", { mode: 0o600 });
  const { deps, touched, host } = observed(dependencies(fx));
  const result = await runCodexDesignReadinessBootstrap(args(fx), deps);
  assert.deepEqual(result, RETIRED);
  assert.equal(host.calls, 0);
  assert.deepEqual(touched, []);
});

test("Codex readiness bootstrap discards output when the candidate changes during review", async (context) => {
  // Original intent: a candidate that moves during the review discards the output and publishes nothing. Retired
  // (ADR-0085, DESIGN-COURSE-RETIRED): the candidate is never read and no review starts, so there is no output to
  // discard; the receipt stays absent and the candidate reader is never consulted.
  const fx = fixture();
  context.after(() => rmSync(fx.root, { recursive: true, force: true }));
  let reads = 0;
  const { deps, touched, host } = observed(dependencies(fx, { readCandidates: () => (++reads < 2 ? CANDIDATE : { commit: "9".repeat(40), tree: CANDIDATE.tree }) }));
  const result = await runCodexDesignReadinessBootstrap(args(fx), deps);
  assert.deepEqual(result, RETIRED);
  assert.equal(reads, 0, "the candidate is never read");
  assert.equal(host.calls, 0);
  assert.deepEqual(touched, []);
  assert.throws(() => readFileSync(join(fx.root, fx.receiptPath)), { code: "ENOENT" });
});

test("Codex readiness bootstrap rejects duplicate source roles and flags before resolving a model", async (context) => {
  // Original intent: duplicate flags and inconsistent advisor flags are rejected with a usage error before any model
  // is resolved. Retired (ADR-0085, DESIGN-COURSE-RETIRED): the retirement precedes argument parsing, so even
  // malformed argv resolves to the typed retired result rather than a usage rejection, and still resolves no model.
  const fx = fixture();
  context.after(() => rmSync(fx.root, { recursive: true, force: true }));
  const { deps, touched, host } = observed(dependencies(fx));
  const duplicate = [...args(fx), "--dispatch-id", "second-id"];
  assert.deepEqual(await runCodexDesignReadinessBootstrap(duplicate, deps), RETIRED);
  assert.deepEqual(await runCodexDesignReadinessBootstrap([...args(fx), "--advisor-preparation", "evidence/design/preparation.json", "--advisor-receipt", "evidence/design/advisor.json", "--advisor-route", "evidence/design/route.json"], deps), RETIRED);
  assert.deepEqual(await runCodexDesignReadinessBootstrap([...args(fx), "--advisor-preparation", fx.receiptPath], deps), RETIRED);
  assert.deepEqual(await runCodexDesignReadinessBootstrap(["--garbage"], deps), RETIRED);
  assert.equal(host.calls, 0);
  assert.deepEqual(touched, []);
});

test("Codex readiness bootstrap honors an explicitly declined advisor export before resolving or invoking a provider", async (context) => {
  // Original intent: a declined advisor export stops the producer before any provider executable is resolved or
  // invoked. Retired (ADR-0085, DESIGN-COURSE-RETIRED): the retirement refuses first, so the declined configuration
  // is never even read, and the executable resolver stays untouched exactly as the original examiner required.
  const fx = fixture();
  context.after(() => rmSync(fx.root, { recursive: true, force: true }));
  const config = readFileSync(join(fx.root, "pipeline.user.yaml"), "utf8");
  assert.match(config, /consent: "approved"/u);
  writeFileSync(join(fx.root, "pipeline.user.yaml"), config.replace('consent: "approved"', 'consent: "declined"'), { mode: 0o600 });
  const raw = dependencies(fx);
  raw.resolveExecutableFn = () => assert.fail("provider executable must not be resolved after export denial");
  const { deps, touched, host } = observed(raw);
  const result = await runCodexDesignReadinessBootstrap(args(fx), deps);
  assert.deepEqual(result, RETIRED);
  assert.equal(host.calls, 0);
  assert.deepEqual(touched, []);
  assert.throws(() => readFileSync(join(fx.root, fx.receiptPath)), { code: "ENOENT" });
});
