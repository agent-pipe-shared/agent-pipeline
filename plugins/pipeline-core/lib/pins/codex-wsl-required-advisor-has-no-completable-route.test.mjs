// SPDX-License-Identifier: SUL-1.0
// Regression pin (ALF-C-P19-08, AC-135) for
// pipeline.codex-wsl-required-advisor-has-no-completable-route.
//
// The Advisor is on demand and never mandatory. A WSL-required Codex Advisor
// request must get a typed, honest unavailable route (no model call, no
// export, no alternate authority source) and must not block the lifecycle.
// No Codex CLI or WSL process is invoked; fixtures live under scratch/.
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import {
  advisoryEvidenceBundleSha256,
  buildAdvisoryEvidenceBundle,
  createAdvisoryDemand,
} from "../advisory-lifecycle-v2.mjs";
import { validateAdvisoryRouteSelection } from "../advisory-route-selection.mjs";
import { validateAdvisoryReceipt } from "../advisory-receipt.mjs";
import { runAdvisoryHostBridge, runCodexAdvisoryThroughSelectedSandbox } from "../../scripts/advisory-host-bridge.mjs";
import {
  isWslHostObservation,
  resolveHostAdvisorRoute,
  ROUTES,
  selectHostAdvisorRoute,
  selectHostAdvisorRouteForHost,
} from "../../scripts/codex-host-advisor-route.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..", "..", "..");
const routeScript = join(repoRoot, "plugins", "pipeline-core", "scripts", "codex-host-advisor-route.mjs");
const scratchBase = join(repoRoot, "scratch");
const WSL_RELEASE = { platform: "linux", release: "5.15.153.1-microsoft-standard-WSL2", wslDistroName: null };
const WSL_DISTRO = { platform: "linux", release: "6.8.0-generic", wslDistroName: "Ubuntu" };
const NON_WSL = Object.freeze({ platform: "linux", release: "6.8.0-generic", wslDistroName: null });
const git = (...args) => execFileSync("git", args, { cwd: repoRoot, encoding: "utf8" }).trim();
const candidateCommit = git("rev-parse", "HEAD");
const candidateTree = git("rev-parse", "HEAD^{tree}");
const dispatch = { dispatchId: "wsl-pin-01", queueRevision: 1, candidateCommit, candidateTree };

function scratchDir(label) {
  mkdirSync(scratchBase, { recursive: true });
  return mkdtempSync(join(scratchBase, `${label}-`));
}
function advisoryInput(consent = "approved") {
  const question = "Which boundary is safest?";
  const evidence = buildAdvisoryEvidenceBundle(repoRoot, ["LICENSE"]);
  const evidenceSha256 = advisoryEvidenceBundleSha256(evidence);
  const demand = createAdvisoryDemand({
    runner: "codex", profile: "epic", reason: "risk-review", question, evidenceSha256, dispatch,
  }).demand;
  return {
    profile: "epic", runner: "codex", question, dispatch, demand,
    references: evidence.references.map(({ path }) => path),
    evidenceBundle: evidence,
    advisorExport: { consent },
    sandboxContext: { repoFingerprint: "c".repeat(64), referenceSetSha256: evidenceSha256 },
  };
}
async function captureStdout(run) {
  const original = process.stdout.write.bind(process.stdout);
  const lines = [];
  process.stdout.write = (chunk, ...rest) => { lines.push(String(chunk)); return original(chunk, ...rest); };
  try {
    const code = await run();
    return { code, events: lines.filter((l) => l.trim().startsWith("{")).map((l) => JSON.parse(l)) };
  } finally { process.stdout.write = original; }
}
async function runCliBridge(dir, name, dependencies) {
  const inputPath = join(dir, `${name}.input.json`);
  const receiptPath = join(dir, `${name}.receipt.json`);
  writeFileSync(inputPath, JSON.stringify(advisoryInput()));
  const calls = { fallback: 0 };
  const { code, events } = await captureStdout(() => runAdvisoryHostBridge(
    ["--input", inputPath, "--receipt", receiptPath],
    {
      repoRoot,
      runCodexAdvisoryWithHostFallback: async () => { calls.fallback += 1; throw new Error("no alternate egress"); },
      ...dependencies,
    },
  ));
  return { code, completed: events.find((e) => e.type === "advisory.completed"), events, receiptPath, calls };
}

test("AC-135: WSL-required Codex request resolves to the typed unavailable route with no policy", () => {
  for (const observation of [WSL_RELEASE, WSL_DISTRO]) {
    assert.equal(isWslHostObservation(observation), true);
    for (const profile of ["epic", "feature"]) for (const consent of ["default", "approved"]) {
      assert.equal(selectHostAdvisorRouteForHost({ runner: "codex", profile, consent }, observation), ROUTES.WSL_UNAVAILABLE);
    }
    // Disabled outcomes keep their own, more specific route even on WSL.
    assert.equal(selectHostAdvisorRouteForHost({ runner: "codex", profile: "feature", consent: "declined" }, observation), ROUTES.NO_CONSENT);
    assert.equal(selectHostAdvisorRouteForHost({ runner: "codex", profile: "mini", consent: "approved" }, observation), ROUTES.PROFILE);
  }
  assert.equal(selectHostAdvisorRouteForHost({ runner: "codex", profile: "feature", consent: "approved" }, NON_WSL), ROUTES.HOST);
  assert.equal(isWslHostObservation({ platform: "win32", release: "10.0.26100", wslDistroName: "Ubuntu" }), false);
  assert.equal(ROUTES.WSL_UNAVAILABLE, "advisory-unavailable-wsl-native-deferred");
});

test("AC-135: the productive route CLI agrees with the module on this host and rejects malformed tuples", () => {
  const args = ["--runner", "codex", "--profile", "feature", "--consent", "approved"];
  const ok = spawnSync(process.execPath, [routeScript, ...args], { encoding: "utf8" });
  assert.equal(ok.status, 0);
  const printed = JSON.parse(ok.stdout);
  assert.deepEqual(printed, JSON.parse(JSON.stringify(resolveHostAdvisorRoute({ runner: "codex", profile: "feature", consent: "approved" }))));
  assert.equal(printed.route, selectHostAdvisorRoute({ runner: "codex", profile: "feature", consent: "approved" }));
  if (printed.route !== ROUTES.HOST) assert.equal(printed.policy, null);
  const bad = spawnSync(process.execPath, [routeScript, "--runner", "codex", "--profile", "feature"], { encoding: "utf8" });
  assert.equal(bad.status, 2);
});

test("AC-135: bridge returns a typed honest unavailable result on WSL and never launches, observes or blocks", async () => {
  for (const observation of [WSL_RELEASE, WSL_DISTRO]) for (const consent of ["default", "approved"]) {
    let adapterCalls = 0;
    const input = advisoryInput(consent);
    // Evidence deliberately unusable: WSL unavailability must precede evidence/child work.
    input.evidenceBundle = { ...input.evidenceBundle, references: [{ path: "missing/private.txt", sha256: "0".repeat(64) }] };
    const result = await runCodexAdvisoryThroughSelectedSandbox(input, async () => { adapterCalls += 1; return { status: "answered", answer: "must not run" }; }, {
      hostObservation: observation,
      repoRoot,
      observeWorkspace: () => { throw new Error("must not observe"); },
    });
    assert.equal(result.advisoryResult.ok, false);
    assert.equal(result.advisoryResult.code, "advisory_unavailable_wsl_native_deferred");
    assert.equal(result.advisoryResult.answer, null);
    assert.equal(result.advisoryResult.receipt, null, "no receipt claims an attempt that did not occur");
    assert.deepEqual(result.advisoryResult.attempts, []);
    assert.equal(result.execution, null);
    assert.equal(adapterCalls, 0);
  }
});

// Host limitation (PO decision K7): the receipt-persistence assurance needs
// POSIX directory mode bits (or a Windows DACL observation the default io does
// not supply), so on this native Windows host persistence refuses as
// "insecure/pre-persist" before any receipt exists. Typed skip; owner
// Coordinator, due 2026-10-19, for the Linux/WSL run.
const HOST_LIMITATION = process.platform === "win32"
  ? "host-limitation: directory-mode-bits-unavailable (receipt persistence assurance); owner Coordinator; due 2026-10-19 (Linux/WSL run, K7)"
  : false;

test("AC-135: CLI bridge outcomes are typed no-child receipts with matching route selections", { skip: HOST_LIMITATION }, async () => {
  const dir = scratchDir("wsl-pin-cli");
  try {
    const cases = [
      { name: "callback", deps: { readRepositoryConsent: () => "approved" }, code: "ordinary-consult-host-callback-unavailable", status: "unavailable" },
      { name: "route", deps: { readRepositoryConsent: () => "approved", admitOrdinaryConsult: async () => ({ status: "unavailable" }) }, code: "ordinary-consult-host-route-unavailable", status: "unavailable" },
      { name: "denied", deps: { readRepositoryConsent: () => "approved", admitOrdinaryConsult: async () => ({ status: "denied" }) }, code: "advisor-host-export-denied", status: "permission-denied" },
      { name: "declined", deps: { readRepositoryConsent: () => "declined" }, code: "advisor-repository-export-declined", status: "permission-denied" },
    ];
    for (const entry of cases) {
      let admissions = 0;
      const deps = { ...entry.deps };
      if (deps.admitOrdinaryConsult) {
        const inner = deps.admitOrdinaryConsult;
        deps.admitOrdinaryConsult = async (value) => { admissions += 1; return inner(value); };
      }
      const run = await runCliBridge(dir, entry.name, deps);
      assert.equal(run.code, 2, `${entry.name}: non-zero exit, not a throw`);
      assert.equal(run.calls.fallback, 0, `${entry.name}: no alternate route`);
      assert.equal(run.completed.ok, false);
      assert.equal(run.completed.code, entry.code);
      assert.equal(run.completed.answer, null);
      assert.equal(run.completed.modelCalls, 0);
      assert.equal(run.completed.launcherCalls, 0);
      assert.equal(admissions <= 1, true, `${entry.name}: host admission asked at most once`);
      assert.equal(run.events.some((e) => e.type === "dispatch.prepare"), false, `${entry.name}: no prompt-bearing dispatch prepared`);
      assert.equal(JSON.stringify(run.events).includes("Which boundary is safest?"), false);
      const receiptBytes = readFileSync(run.receiptPath);
      const receipt = JSON.parse(receiptBytes.toString("utf8"));
      assert.equal(validateAdvisoryReceipt(receipt).ok, true);
      assert.equal(receipt.observed.status, entry.status);
      assert.equal(receipt.observed.identity, null, "no model identity claimed");
      assert.equal(receipt.answerSha256, null);
      const selection = JSON.parse(readFileSync(`${run.receiptPath}.route-v1.json`, "utf8"));
      assert.equal(selection.childStarted, false);
      assert.equal(selection.attemptCount, 0);
      assert.equal(selection.code, entry.code);
      assert.equal(validateAdvisoryRouteSelection({ selection, receipt, receiptBytes }).ok, true);
      // Tampering that would claim an attempt or an answer is refused.
      for (const mutate of [
        (s) => ({ ...s, childStarted: true }),
        (s) => ({ ...s, attemptCount: 1 }),
        (s) => ({ ...s, status: "answered" }),
        (s) => ({ ...s, code: "answered" }),
        (s) => ({ ...s, status: entry.status === "unavailable" ? "permission-denied" : "unavailable" }),
      ]) assert.equal(validateAdvisoryRouteSelection({ selection: mutate(selection), receipt, receiptBytes }).ok, false);
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("AC-135: a denied host export is not silently retried through another command or route", { skip: HOST_LIMITATION }, async () => {
  const dir = scratchDir("wsl-pin-retry");
  try {
    let admissions = 0;
    const deps = { readRepositoryConsent: () => "approved", admitOrdinaryConsult: async () => { admissions += 1; return { status: "denied" }; } };
    const first = await runCliBridge(dir, "same", deps);
    assert.equal(first.completed.code, "advisor-host-export-denied");
    assert.equal(admissions, 1);
    const second = await runCliBridge(dir, "same", deps);
    assert.equal(second.calls.fallback, 0);
    assert.equal(second.completed.answer, null);
    assert.equal(second.completed.modelCalls ?? 0, 0);
    assert.equal(second.completed.launcherCalls ?? 0, 0);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("AC-135: skill, route module and bridge agree that WSL is a deferred, typed-unavailable runner/platform", () => {
  const skill = readFileSync(join(repoRoot, "plugins", "pipeline-core", "skills", "advisor-consult", "SKILL.md"), "utf8");
  assert.match(skill, /wsl/iu);
});

test("RED mirror: dropping the WSL branch from a scratch copy of the route module makes the pin's assertion fail", async () => {
  const dir = scratchDir("wsl-pin-mirror");
  try {
    const source = readFileSync(routeScript, "utf8");
    const needle = "if (route === ROUTES.HOST && isWslHostObservation(hostObservation)) return ROUTES.WSL_UNAVAILABLE;";
    assert.equal(source.includes(needle), true, "production WSL branch text drifted; update the mirror");
    const mirrored = source
      .replace(needle, "")
      .replace('"../lib/entrypoint.mjs"', JSON.stringify(pathToFileURL(join(repoRoot, "plugins", "pipeline-core", "lib", "entrypoint.mjs")).href));
    const mirrorPath = join(dir, "route-mirror.mjs");
    writeFileSync(mirrorPath, mirrored);
    const mirror = await import(pathToFileURL(mirrorPath).href);
    const route = mirror.selectHostAdvisorRouteForHost({ runner: "codex", profile: "feature", consent: "approved" }, WSL_RELEASE);
    assert.notEqual(route, ROUTES.WSL_UNAVAILABLE, "the mirror must fail the pin predicate");
    assert.equal(route, ROUTES.HOST);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// --- AC-135: the productive answered route binds the observed host execution ---
// Fixture host result only: no Codex CLI, WSL process, model call or export runs.
import { createHash } from "node:crypto";
import { runSelectedAdvisoryHost } from "../../scripts/advisory-host-bridge.mjs";
import { sandboxSelectionDigest } from "../../scripts/codex-sandbox-select.mjs";
import { ANSWERED_RECEIPT_REFUSALS, verifyAnsweredAdvisoryReceipt } from "../advisory-answered-receipt.mjs";

const ANSWER_MODEL = "gpt-6-sol";
const ANSWER_TEXT = "Keep the boundary closed.";
const sha256Hex = (value) => createHash("sha256").update(value).digest("hex");
const RUNNER_WORDS = /codex|claude|antigravity|wsl/iu;
function fixtureSelection(input, dispatchOverrides = {}) {
  return {
    schema: "pipeline.codex-sandbox-selection.v1", selectionId: "css_aaaaaaaaaaaaaaaaaaaaaaaaae", repoFingerprint: "c".repeat(64), duty: "advisory",
    dispatch: {
      queueRevision: input.dispatch.queueRevision, candidateCommit: input.dispatch.candidateCommit, candidateTree: input.dispatch.candidateTree,
      referenceSetSha256: input.sandboxContext.referenceSetSha256, requestSha256: "e".repeat(64), ...dispatchOverrides,
    },
    toolchain: { cliVersion: "0.144.6", cliSha256: "0".repeat(64), observedHelperSha256: "1".repeat(64), selectionSchemaSha256: "2".repeat(64) },
    host: { platformClass: "linux-wsl2", kernel: { sysname: "Linux", release: "6", machine: "x86_64" }, filesystemClass: "wsl2-native", bootIdSha256: "3".repeat(64) },
    profile: { id: "codex-critic-intermediate.v1", sha256: "4".repeat(64), base: ":read-only", network: { enabled: true }, writableRootClass: "coordinator-scratch-only", scratchRootSha256: "5".repeat(64) },
    preflight: { receiptSha256: "6".repeat(64), eligibility: "intermediate", terminalCode: "eligible", observedAt: "2026-07-19T00:00:00.000Z" },
    compatibilityReceiptSha256: "7".repeat(64),
    assurance: { class: "sandbox-read-only-except-coordinator-scratch-network-open", literal: "sandbox-read-only-except-coordinator-scratch; input/network isolation not asserted" },
    status: "selected", failureClass: null, observedAt: "2026-07-19T00:00:00.000Z",
  };
}
function fixtureHostResult(t) {
  return {
    status: "answered", answer: ANSWER_TEXT, identity: { provider: "openai", modelId: ANSWER_MODEL, effort: "max" },
    sandboxExecution: {
      schema: "pipeline.codex-sandbox-host-execution.v1", selectionId: t.selectionId, selectionSha256: t.selectionSha256,
      repoFingerprint: t.repoFingerprint, duty: "advisory", dispatch: t.dispatch,
      observed: { cliSha256: t.toolchain.cliSha256, profileSha256: t.profile.sha256, networkEnabled: true, scratchRootSha256: t.profile.scratchRootSha256 },
      terminal: { childStarted: true, exitCode: 0, stdioStatus: "complete", cleanupStatus: "complete" },
    },
  };
}
function answeredTransport(input, { dispatchOverrides, requested, invoke } = {}) {
  return {
    repoRoot,
    resolveAdvisoryRoute: ({ candidateCommit: commit }) => ({
      dutyId: "advisory", runner: "codex", model: ANSWER_MODEL, effort: "max", state: "default", sourceSha256: "a".repeat(64), candidateCommit: commit,
    }),
    selectModelRoleForTaskFn: () => { throw new Error("optional store unavailable"); },
    dependencies: {
      async executeSandboxedReadonlyDuty(request, dependencies) {
        const chosen = fixtureSelection(input, dispatchOverrides);
        const asked = requested ?? request.requested;
        const launched = await dependencies.bridge.launch({
          selectionId: chosen.selectionId, duty: "advisory", selection: chosen, requested: asked, references: request.references, profile: chosen.profile,
          scratch: { path: "scratch/advisory-scratch", sha256: chosen.profile.scratchRootSha256, sandboxStateJson: "{}", sandboxStateSha256: "8".repeat(64), repoRoot, codexPath: "fixture" },
        });
        const execution = await dependencies.bridge.finalize({ selection: chosen, launched, requested: asked, profile: chosen.profile });
        return {
          status: "answered", childStarted: true, selectionId: chosen.selectionId, selectionSha256: sandboxSelectionDigest(chosen),
          executionReceiptSha256: sha256Hex(JSON.stringify(execution)), dutyReceiptSha256: execution.dutyReceipt.sha256, assurance: chosen.assurance,
        };
      },
    },
    async invokeCodexAdvisoryAppServer({ sandboxTransport }) {
      return invoke ? invoke(sandboxTransport) : fixtureHostResult(sandboxTransport);
    },
  };
}
function boundParts(input, outcome, override = {}) {
  return {
    receipt: outcome.advisoryResult.receipt, execution: outcome.execution, answer: outcome.advisoryResult.answer, demand: input.demand,
    route: { runner: "codex", model: ANSWER_MODEL, effort: "max" }, dispatch: input.dispatch,
    evidenceSha256: input.demand.evidenceSha256, selection: outcome.sandboxBinding, ...override,
  };
}
async function answeredFixture() {
  const input = advisoryInput();
  const outcome = await runSelectedAdvisoryHost(input, answeredTransport(input));
  assert.equal(outcome.advisoryResult.ok, true, JSON.stringify(outcome.advisoryResult));
  return { input, outcome };
}

test("AC-135: the answered route completes on a fixture host result and binds every digest it names", async () => {
  const { input, outcome } = await answeredFixture();
  assert.equal(outcome.advisoryResult.code, "answered");
  assert.equal(outcome.advisoryResult.answer, ANSWER_TEXT);
  assert.equal(outcome.advisoryResult.receipt.schema, "pipeline.advisory-receipt.v1", "the existing receipt format, no second one");
  assert.equal(outcome.advisoryResult.receipt.observed.status, "answered");
  const bound = verifyAnsweredAdvisoryReceipt(boundParts(input, outcome));
  assert.equal(bound.ok, true, JSON.stringify(bound));
  assert.deepEqual(bound.binding.candidate, { commit: candidateCommit, tree: candidateTree });
  assert.deepEqual(bound.binding.route, { runner: "codex", model: ANSWER_MODEL, effort: "max" });
  assert.equal(bound.binding.questionSha256, sha256Hex(input.question));
  assert.equal(bound.binding.evidenceSha256, input.demand.evidenceSha256);
  assert.equal(bound.binding.hostResult.selectionId, outcome.execution.selectionId);
  assert.equal(bound.binding.hostResult.dutyReceiptSha256, outcome.execution.dutyReceipt.sha256);
  assert.equal(bound.binding.answerSha256, sha256Hex(ANSWER_TEXT));
  assert.equal(outcome.execution.dutyReceipt.sha256, sha256Hex(JSON.stringify(outcome.advisoryResult.receipt)));
});

test("AC-135: each binding mismatch is refused with its typed code and a runner-neutral repair", async () => {
  const { input, outcome } = await answeredFixture();
  const zero = "0".repeat(64);
  const withExecution = (p, patch) => ({ execution: { ...p.execution, ...patch } });
  const cases = [
    ["candidate commit", "advisory_answered_candidate_mismatch", (p) => ({ dispatch: { ...p.dispatch, candidateCommit: "d".repeat(40) } })],
    ["candidate tree", "advisory_answered_candidate_mismatch", (p) => ({ dispatch: { ...p.dispatch, candidateTree: "e".repeat(40) } })],
    ["execution queue revision", "advisory_answered_candidate_mismatch", (p) => withExecution(p, { dispatch: { ...p.execution.dispatch, queueRevision: 9 } })],
    ["execution candidate commit", "advisory_answered_candidate_mismatch", (p) => withExecution(p, { dispatch: { ...p.execution.dispatch, candidateCommit: "d".repeat(40) } })],
    ["execution candidate tree", "advisory_answered_candidate_mismatch", (p) => withExecution(p, { dispatch: { ...p.execution.dispatch, candidateTree: "e".repeat(40) } })],
    ["execution candidate tree absent", "advisory_answered_candidate_mismatch", (p) => {
      const { candidateTree: _omitted, ...rest } = p.execution.dispatch;
      return withExecution(p, { dispatch: rest });
    }],
    ["route model", "advisory_answered_route_mismatch", (p) => ({ route: { ...p.route, model: "other-model" } })],
    ["route effort", "advisory_answered_route_mismatch", (p) => ({ route: { ...p.route, effort: "high" } })],
    ["requested route", "advisory_answered_route_mismatch", (p) => withExecution(p, { requested: { runner: "codex", model: "other-model" } })],
    ["question digest", "advisory_answered_question_mismatch", (p) => ({ demand: { ...p.demand, questionSha256: zero } })],
    ["evidence digest", "advisory_answered_evidence_mismatch", () => ({ evidenceSha256: zero })],
    ["execution evidence digest", "advisory_answered_evidence_mismatch", (p) => withExecution(p, { dispatch: { ...p.execution.dispatch, referenceSetSha256: zero } })],
    ["host result duty receipt digest", "advisory_answered_host_result_mismatch", (p) => withExecution(p, { dutyReceipt: { ...p.execution.dutyReceipt, sha256: zero } })],
    ["host result selection", "advisory_answered_host_result_mismatch", (p) => ({ selection: { ...p.selection, selectionId: "css_bbbbbbbbbbbbbbbbbbbbbbbbbi" } })],
    ["host result terminal", "advisory_answered_host_result_mismatch", (p) => withExecution(p, { terminal: { ...p.execution.terminal, exitCode: 1 } })],
    ["answer digest", "advisory_answered_answer_mismatch", () => ({ answer: "A different answer than the one receipted." })],
  ];
  const parts = boundParts(input, outcome);
  for (const [name, code, mutate] of cases) {
    const refused = verifyAnsweredAdvisoryReceipt({ ...parts, ...mutate(parts) });
    assert.equal(refused.ok, false, `${name}: must be refused`);
    assert.equal(refused.code, code, `${name}: typed code`);
    assert.equal(refused.repair, ANSWERED_RECEIPT_REFUSALS[code], `${name}: the repair is named`);
    assert.equal(RUNNER_WORDS.test(refused.repair), false, `${name}: runner-neutral message`);
  }
  for (const [code, repair] of Object.entries(ANSWERED_RECEIPT_REFUSALS)) {
    assert.match(code, /^advisory_answered_[a-z_]+$/u);
    assert.equal(repair.length > 40 && !RUNNER_WORDS.test(repair), true, `${code}: neutral, actionable repair`);
  }
});

test("AC-135: a receipt for an execution that did not happen cannot be answered", async () => {
  const { input, outcome } = await answeredFixture();
  const parts = boundParts(input, outcome);
  const missing = "advisory_answered_execution_missing";
  const executions = [
    null,
    undefined,
    { ...parts.execution, schema: "pipeline.not-an-execution.v1" },
    { ...parts.execution, terminal: { ...parts.execution.terminal, childStarted: false } },
    { ...parts.execution, dutyReceipt: { ...parts.execution.dutyReceipt, status: "unavailable" } },
  ];
  for (const execution of executions) {
    const refused = verifyAnsweredAdvisoryReceipt({ ...parts, execution, selection: undefined });
    assert.equal(refused.ok, false);
    assert.equal(refused.code, missing);
    assert.match(refused.repair, /execution record/u);
  }
  const noChild = { ...parts.receipt, observed: { status: "unavailable", identity: null }, answerSha256: null,
    fallback: { reason: "consult-unavailable", redactedErrorClass: "unavailable" } };
  assert.equal(verifyAnsweredAdvisoryReceipt({ ...parts, receipt: noChild }).code, "advisory_answered_receipt_invalid");
  assert.equal(verifyAnsweredAdvisoryReceipt({ ...parts, receipt: { ...parts.receipt, answerSha256: null } }).code, "advisory_answered_receipt_invalid");
});

test("AC-135: the bridge returns no answer when the observed host result does not bind the candidate or the route", async () => {
  const cases = [
    ["candidate", "advisory_answered_candidate_mismatch", { dispatchOverrides: { candidateCommit: "d".repeat(40) } }],
    ["route", "advisory_answered_route_mismatch", { requested: { runner: "codex", model: "other-model" } }],
  ];
  for (const [name, code, options] of cases) {
    const input = advisoryInput();
    const outcome = await runSelectedAdvisoryHost(input, answeredTransport(input, options));
    assert.equal(outcome.advisoryResult.ok, false, `${name}: no answer`);
    assert.equal(outcome.advisoryResult.code, code);
    assert.equal(outcome.advisoryResult.answer, null);
    assert.equal(outcome.advisoryResult.repair, ANSWERED_RECEIPT_REFUSALS[code]);
    assert.equal(outcome.advisoryResult.receipt.observed.status, "unavailable", "the receipt claims no answered execution");
    assert.equal(outcome.advisoryResult.receipt.answerSha256, null);
    assert.equal(outcome.execution, null);
  }
  // A host result without any execution record never reaches an answer at all.
  const input = advisoryInput();
  const absent = await runSelectedAdvisoryHost(input, answeredTransport(input, {
    invoke: () => ({ status: "answered", answer: "must be discarded", identity: { provider: "openai", modelId: ANSWER_MODEL, effort: "max" } }),
  }));
  assert.equal(absent.advisoryResult.ok, false);
  assert.equal(absent.advisoryResult.answer, null);
  assert.equal(absent.execution, null);
});
