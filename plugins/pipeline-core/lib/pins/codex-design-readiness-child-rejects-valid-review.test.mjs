// SPDX-License-Identifier: SUL-1.0
// Regression pin: pipeline.codex-design-readiness-child-rejects-valid-review (AC-132).
//
// Two halves, deliberately separate:
//  * RETIRED mandatory-readiness route (selected-sandbox child + adapter, retired bootstrap): its retirement
//    is pinned; no mandatory readiness gate is revived. The legacy child is exercised for the clauses that
//    must still hold (explicit mutation / file change / server request still fail, finite deadlines).
//  * RETAINED host-security clauses (tool-free Codex host): typed-unavailable failures, Codex-compatible
//    fully typed output schema, finite deadlines, independent report validation, export denial before start.
// No Codex CLI is invoked. Fixtures live under the repository scratch/ directory.
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { advisoryEvidenceBundleSha256, buildAdvisoryEvidenceBundle } from "../advisory-lifecycle-v2.mjs";
import { validateAgainstSchema } from "../schema-lite.mjs";
import { hostDigest } from "../codex-host-process-journal.mjs";
import { validateDesignReadinessModelOutput } from "../design-readiness-host-evidence.mjs";
import { DESIGN_COURSE_RETIRED, retiredDesignResult } from "../retired-design-codes.mjs";
import { buildCodexToolFreeReadinessRequest, codexToolFreeReadinessOutputSchema, runCodexToolFreeDesignReadiness }
  from "../codex-tool-free-design-readiness.mjs";
import { invokeCodexReadinessAppServer } from "../../scripts/codex-readiness-app-server.mjs";
import { runCodexDesignReadinessBootstrap } from "../../scripts/codex-design-readiness-bootstrap.mjs";
import { runSpecReadinessHost } from "../../scripts/spec-readiness-host.mjs";
import { runCodexDesignReadinessHost } from "../../scripts/codex-design-readiness-host.mjs";

const REPO = realpathSync(fileURLToPath(new URL("../../../../", import.meta.url)));
const PLUGIN = join(REPO, "plugins", "pipeline-core");
const CHILD = join(PLUGIN, "scripts", "codex-readiness-app-server-child.mjs");
const NAMES = ["input", "prd", "spec", "design", "traceability"];
const sha = (value) => createHash("sha256").update(value).digest("hex");
const COMMIT = "b".repeat(40);
const TREE = "c".repeat(40);
const CANDIDATE = { commit: COMMIT, tree: TREE };
const ROUTE = Object.freeze({ model: "gpt-6-luna", effort: "high", sourceSha256: "a".repeat(64), candidateCommit: COMMIT });
// PO decision K7: directory mode bits / directory symlinks / POSIX process groups are unavailable on this host.
const HOST_LIMITATION = "host-limitation: native Windows lacks directory mode bits, directory symlinks and POSIX process groups; "
  + "owner Coordinator, due 2026-10-19 for the Linux/WSL run (PO decision K7)";

function scratchDir(context, label) {
  mkdirSync(join(REPO, "scratch"), { recursive: true });
  const dir = realpathSync(mkdtempSync(join(REPO, "scratch", `${label}-`)));
  context.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}
function makeSources(root, withFiles = true) {
  return Object.fromEntries(NAMES.map((name) => {
    const path = `specs/feature/${name}.md`;
    const content = Buffer.from(`# ${name}\nFixture evidence for readiness.\n`, "utf8");
    if (withFiles) { mkdirSync(join(root, "specs", "feature"), { recursive: true }); writeFileSync(join(root, path), content); }
    return [name, { path, sha256: sha(content) }];
  }));
}
function validReport(sources, dispatchId, extra = {}) {
  return { schema: "pipeline.design-readiness-receipt.v1", dispatchId, runner: "codex", candidate: CANDIDATE, sources,
    outcome: "ready-for-po-review", findings: [], unresolvedChoices: [], summary: "Fixture report bound to the exact five sources.", ...extra };
}

// ---- schema-compatibility helper (proved able to fail below) -------------------------------------------
function codexSchemaProblems(node, path = "$") {
  const problems = [];
  if (Array.isArray(node)) { node.forEach((entry, index) => problems.push(...codexSchemaProblems(entry, `${path}[${index}]`))); return problems; }
  if (node === null || typeof node !== "object") return problems;
  if (Object.hasOwn(node, "const")) problems.push(`${path}: const is rejected by Codex`);
  if ((Object.hasOwn(node, "enum") || Object.hasOwn(node, "properties") || Object.hasOwn(node, "items")) && typeof node.type !== "string") problems.push(`${path}: untyped`);
  if (node.type === "object" && node.additionalProperties !== false) problems.push(`${path}: open object`);
  for (const [key, value] of Object.entries(node)) problems.push(...codexSchemaProblems(value, `${path}.${key}`));
  return problems;
}

// ===== Retained: Codex-compatible, fully typed, bound output schema ==========================================
test("retained: output schema is fully typed (no untyped const) and bound to dispatch, candidate and five source hashes", () => {
  const sources = makeSources(REPO, false);
  const schema = codexToolFreeReadinessOutputSchema({ dispatchId: "DR-1", candidate: CANDIDATE, sources });
  assert.deepEqual(codexSchemaProblems(schema), []);
  assert.equal(schema.properties.hostExecution, undefined, "the host, not the model, adds hostExecution");
  assert.equal(validateAgainstSchema(validReport(sources, "DR-1"), schema).valid, true);
  assert.equal(validateAgainstSchema(validReport(sources, "OTHER"), schema).valid, false, "dispatch binding");
  assert.equal(validateAgainstSchema(validReport(sources, "DR-1", { candidate: { commit: "9".repeat(40), tree: TREE } }), schema).valid, false, "candidate binding");
  for (const name of NAMES) {
    const forged = { ...sources, [name]: { ...sources[name], sha256: "0".repeat(64) } };
    assert.equal(validateAgainstSchema(validReport(forged, "DR-1"), schema).valid, false, `source hash binding: ${name}`);
  }
  assert.equal(validateAgainstSchema({ ...validReport(sources, "DR-1"), extra: true }, schema).valid, false, "closed object");
});

test("retained: the schema compatibility check can fail (RED mirror: a const without type is flagged)", () => {
  const mirror = { type: "object", additionalProperties: false, required: ["schema"], properties: { schema: { const: "pipeline.design-readiness-receipt.v1" } } };
  assert.ok(codexSchemaProblems(mirror).some((problem) => problem.includes("const")));
  const untyped = { type: "object", additionalProperties: false, properties: { outcome: { enum: ["a"] } } };
  assert.ok(codexSchemaProblems(untyped).some((problem) => problem.includes("untyped")));
});

// ===== Retained: runner fixtures ==============================================================================
function runnerFixture(context) {
  const root = scratchDir(context, "ctfr");
  const sources = makeSources(root);
  const codexPath = join(root, "codex-placeholder");
  writeFileSync(codexPath, "placeholder executable bytes\n");
  const store = { processRoot: join(root, "process"), write() { throw new Error("store must not be written on failure"); } };
  mkdirSync(store.processRoot);
  const calls = [];
  const base = { repoRoot: root, repoFingerprint: "d".repeat(64), dispatchId: "DR-1", candidate: CANDIDATE, sources, route: ROUTE,
    codexPath, inputDirectory: join(root, "input"), store, readCandidate: () => CANDIDATE,
    readCommittedSource: (_root, _commit, path) => readFileSync(join(root, path)) };
  const hostReturning = (build) => async (request) => { calls.push(request); return build(request); };
  return { root, sources, base, calls, hostReturning };
}
const closedObservation = (request, requestHash) => ({ receiptId: request.managedProcess.receiptId, requestSha256: requestHash, ownership: { status: "closed" } });
const requestHashOf = (request) => hostDigest(JSON.stringify({ model: request.model, effort: request.effort, prompt: request.prompt, outputSchema: request.outputSchema }));

test("retained: finite coordinated deadlines and a read-only tool-free request go to the host", async (context) => {
  const fx = runnerFixture(context);
  const result = await runCodexToolFreeDesignReadiness({ ...fx.base, invokeHost: fx.hostReturning(() => ({ ok: false, code: "host-turn-timeout" })) });
  assert.equal(result.status, "unavailable");
  assert.equal(fx.calls.length, 1);
  const [request] = fx.calls;
  assert.equal(request.inputContract, "readiness");
  assert.equal(request.startupTimeoutMs, 45_000);
  assert.equal(request.turnTimeoutMs, 600_000);
  assert.ok(request.turnTimeoutMs > 180_000, "five-source review budget exceeds the retired 180 s child limit");
  assert.deepEqual(request.outputSchema, codexToolFreeReadinessOutputSchema({ dispatchId: "DR-1", candidate: CANDIDATE, sources: fx.sources }));
  assert.equal(request.managedProcess.binding.candidateCommit, COMMIT, "process ownership is bound before a productive spawn");
  assert.equal(request.managedProcess.journalParent, fx.base.store.processRoot);
  assert.equal(request.requestSha256, undefined);
  assert.equal(requestHashOf(request), buildCodexToolFreeReadinessRequest({ dispatchId: "DR-1", candidate: CANDIDATE, sources: fx.sources, route: ROUTE,
    sourceContent: Object.fromEntries(NAMES.map((name) => [name, { ...fx.sources[name], content: readFileSync(join(fx.root, fx.sources[name].path), "utf8") }])) }).requestSha256);
});

test("retained: failed turn, invalid schema, timeout and lost stdio stay distinguishable and never fabricate a review", async (context) => {
  const fx = runnerFixture(context);
  const seen = {};
  for (const code of ["host-turn-failed", "host-schema-invalid", "host-turn-timeout", "host-stdio-closed"]) {
    const result = await runCodexToolFreeDesignReadiness({ ...fx.base, invokeHost: fx.hostReturning(() => ({ ok: false, code })) });
    assert.equal(result.status, "unavailable");
    assert.equal(result.code, "CTFR-HOST-UNAVAILABLE");
    assert.equal(result.report, null);
    seen[code] = result.transportCode;
  }
  assert.deepEqual(seen, { "host-turn-failed": "host-turn-failed", "host-schema-invalid": "host-schema-invalid",
    "host-turn-timeout": "host-turn-timeout", "host-stdio-closed": "host-stdio-closed" });
  const hostile = await runCodexToolFreeDesignReadiness({ ...fx.base, invokeHost: fx.hostReturning(() => ({ ok: false, code: "RAW PROMPT TEXT: secret" })) });
  assert.equal(hostile.transportCode, "host-execution-unavailable");
  assert.equal(JSON.stringify(hostile).includes("secret"), false, "no raw prompt or report text in the public failure result");
  assert.equal(JSON.stringify(hostile).includes("Fixture evidence"), false);
});

test("retained: the host independently validates every returned field; a child that exits cleanly with an invalid report is a typed failure", async (context) => {
  const fx = runnerFixture(context);
  const cases = {
    "missing fields": () => ({ schema: "pipeline.design-readiness-receipt.v1" }),
    "other dispatch": (s) => validReport(s, "OTHER"),
    "other candidate": (s) => validReport(s, "DR-1", { candidate: { commit: "9".repeat(40), tree: TREE } }),
    "forged source digest": (s) => validReport({ ...s, spec: { ...s.spec, sha256: "0".repeat(64) } }, "DR-1"),
    "ready with blocking finding": (s) => validReport(s, "DR-1", { findings: [{ code: "X", severity: "blocking", summary: "gap" }] }),
    "ready with unresolved choice": (s) => validReport(s, "DR-1", { unresolvedChoices: [{ id: "q", question: "?", impact: "i" }] }),
    "model-supplied hostExecution": (s) => validReport(s, "DR-1", { hostExecution: { schema: "x" } }),
  };
  for (const [label, build] of Object.entries(cases)) {
    const result = await runCodexToolFreeDesignReadiness({ ...fx.base, invokeHost: fx.hostReturning((request) => ({
      ok: true, report: build(fx.sources), observed: closedObservation(request, requestHashOf(request)) })) });
    assert.equal(result.status, "unavailable", label);
    assert.equal(result.code, "CTFR-MODEL-REPORT", label);
    assert.equal(result.report, null, label);
  }
});

test("retained: unexpected observation (ownership not closed, request drift) is refused before any report is accepted", async (context) => {
  const fx = runnerFixture(context);
  const open = await runCodexToolFreeDesignReadiness({ ...fx.base, invokeHost: fx.hostReturning((request) => ({ ok: true, report: validReport(fx.sources, "DR-1"),
    observed: { ...closedObservation(request, requestHashOf(request)), ownership: { status: "open" } } })) });
  assert.equal(open.code, "CTFR-HOST-UNAVAILABLE");
  const drift = await runCodexToolFreeDesignReadiness({ ...fx.base, invokeHost: fx.hostReturning((request) => ({ ok: true, report: validReport(fx.sources, "DR-1"),
    observed: closedObservation(request, "0".repeat(64)) })) });
  assert.equal(drift.code, "CTFR-HOST-UNAVAILABLE");
  assert.equal(open.report, null);
  assert.equal(drift.report, null);
});

test("retained: candidate drift and source-digest drift refuse before the provider host is called", async (context) => {
  const fx = runnerFixture(context);
  const noHost = fx.hostReturning(() => { throw new Error("host must not be called"); });
  const candidateDrift = await runCodexToolFreeDesignReadiness({ ...fx.base, invokeHost: noHost, readCandidate: () => ({ commit: "9".repeat(40), tree: TREE }) });
  assert.equal(candidateDrift.code, "CTFR-BINDING");
  const forged = { ...fx.sources, prd: { ...fx.sources.prd, sha256: "0".repeat(64) } };
  const hashDrift = await runCodexToolFreeDesignReadiness({ ...fx.base, sources: forged, invokeHost: noHost });
  assert.equal(hashDrift.code, "CTFR-SOURCE-HASH");
  const uncommitted = await runCodexToolFreeDesignReadiness({ ...fx.base, invokeHost: noHost, readCommittedSource: () => Buffer.from("different") });
  assert.equal(uncommitted.code, "CTFR-SOURCE-NOT-COMMITTED");
  assert.deepEqual(fx.calls, []);
});

// ===== Retained: regular host =================================================================================
test("retained: export denial refuses before store creation, provider startup or any dependency", async (context) => {
  const root = scratchDir(context, "ctfr-host");
  const original = readFileSync(join(REPO, "pipeline.user.yaml"), "utf8");
  const declined = original.replace('consent: "approved"', 'consent: "declined"');
  assert.notEqual(declined, original, "fixture must actually flip the consent");
  writeFileSync(join(root, "pipeline.user.yaml"), declined);
  const touched = [];
  const trap = (name) => () => { touched.push(name); throw new Error(`${name} must not run`); };
  const args = { repoRoot: root, repoFingerprint: "d".repeat(64), dispatchId: "DR-1",
    dispatch: { queueRevision: 1, candidateCommit: COMMIT, candidateTree: TREE, referenceSetSha256: "e".repeat(64) },
    sources: makeSources(root, false), sandboxRuntime: null };
  const result = await runCodexDesignReadinessHost(args, { resolveTopology: trap("topology"), createFamilyEntry: trap("family"),
    createHostStore: trap("store"), runToolFreeReadiness: trap("run"), readCandidate: trap("candidate") });
  assert.equal(result.status, "unavailable");
  assert.equal(result.code, "CODEX-READINESS-EXPORT-DENIED");
  assert.equal(result.readinessReceipt, null);
  assert.deepEqual(touched, []);
  const malformed = await runCodexDesignReadinessHost({ ...args, dispatchId: "bad id!" }, { resolveTopology: trap("topology") });
  assert.equal(malformed.code, "CODEX-READINESS-INPUT");
  assert.deepEqual(touched, []);
});

// ===== Retired route: retirement pinned, no mandatory gate revived ===========================================
test("retired: the mandatory readiness bootstrap and spec host refuse before parsing, state access or dispatch", async () => {
  const expected = retiredDesignResult(DESIGN_COURSE_RETIRED);
  assert.deepEqual(expected, { ok: false, code: "DESIGN-COURSE-RETIRED", hint: expected.hint, implementationAuthority: false });
  const trapDeps = new Proxy({}, { get() { throw new Error("retired route touched a dependency"); } });
  assert.deepEqual(await runCodexDesignReadinessBootstrap(["--root", "/nonexistent", "--garbage"], trapDeps), expected);
  assert.deepEqual(await runCodexDesignReadinessBootstrap([], trapDeps), expected);
  assert.deepEqual(await runSpecReadinessHost({}, trapDeps), expected);
  assert.equal(expected.ok, false, "retirement result never reads as a passed gate");
  assert.equal(expected.implementationAuthority, false);
});

test("retired: no production module reaches the legacy selected-sandbox child or adapter (ordinary route does not require it)", () => {
  const self = join("lib", "pins", "codex-design-readiness-child-rejects-valid-review.test.mjs");
  const owners = new Set(["scripts/codex-readiness-app-server.mjs", "scripts/codex-readiness-app-server-child.mjs"]);
  const offenders = [];
  for (const dir of ["scripts", "lib", "hooks"]) {
    for (const entry of readdirSync(join(PLUGIN, dir), { recursive: true })) {
      const rel = String(entry).split(sep).join("/");
      if (!rel.endsWith(".mjs") || rel.endsWith(".test.mjs") || owners.has(`${dir}/${rel}`) || join(dir, rel) === self) continue;
      if (readFileSync(join(PLUGIN, dir, entry), "utf8").includes("codex-readiness-app-server")) offenders.push(`${dir}/${rel}`);
    }
  }
  assert.deepEqual(offenders, []);
});

// ===== Retired child, exercised for real through a fake App Server peer =====================================
function childHarness(context) {
  const dir = scratchDir(context, "ctfr-child");
  const sources = makeSources(dir, false);
  const delays = join(dir, "delays.json");
  const preload = join(dir, "preload.mjs");
  const fake = join(dir, "fake-codex.mjs");
  // Test-harness seam only: redirect the child's spawn target to the fake App Server peer and record timer delays.
  writeFileSync(preload, [
    'import cp from "node:child_process";',
    'import { syncBuiltinESMExports } from "node:module";',
    'import { appendFileSync } from "node:fs";',
    "const spawnReal = cp.spawn;",
    "cp.spawn = (_cmd, _args, options) => spawnReal(process.execPath, [process.env.FAKE_CODEX], { ...options, cwd: undefined, detached: false });",
    "syncBuiltinESMExports();",
    "const timerReal = globalThis.setTimeout;",
    "globalThis.setTimeout = (fn, ms, ...rest) => { appendFileSync(process.env.DELAYS_FILE, `${ms}\\n`); return timerReal(fn, ms, ...rest); };",
  ].join("\n"));
  writeFileSync(fake, [
    'import { createInterface } from "node:readline";',
    "const report = JSON.parse(process.env.FAKE_REPORT);",
    "const extra = process.env.FAKE_EXTRA ? JSON.parse(process.env.FAKE_EXTRA) : null;",
    "const model = process.env.FAKE_MODEL;",
    "const send = (value) => process.stdout.write(`${JSON.stringify(value)}\\n`);",
    'createInterface({ input: process.stdin }).on("line", (line) => {',
    "  const message = JSON.parse(line);",
    '  if (message.id === 1) send({ id: 1, result: { protocolVersion: "2026-01-01" } });',
    '  else if (message.id === 2) send({ id: 2, result: { model, modelProvider: "openai", approvalPolicy: "never", thread: { id: "thread-test" } } });',
    "  else if (message.id === 3) {",
    '    send({ id: 3, result: { turn: { id: "turn-test" } } });',
    "    setImmediate(() => {",
    '      if (extra?.serverRequest) send({ id: 99, method: "item/commandExecution/requestApproval", params: {} });',
    '      if (extra?.item) send({ method: "item/completed", params: { threadId: "thread-test", turnId: "turn-test", item: extra.item } });',
    '      send({ method: "item/completed", params: { threadId: "thread-test", turnId: "turn-test", item: { type: "agentMessage", phase: "final_answer", text: JSON.stringify(report) } } });',
    '      send({ method: "turn/completed", params: { threadId: "thread-test", turn: { id: "turn-test", status: "completed" } } });',
    "    });",
    "  }",
    "});",
  ].join("\n"));
  const request = { codexPath: "/fake/codex", cwd: "/fake/repo", scratchPath: "/fake/scratch", dispatchId: "DR-1", candidate: CANDIDATE, sources,
    evidenceBundle: { schema: "pipeline.advisory-evidence-bundle.v1", references: NAMES.map((name) => sources[name]).sort((a, b) => a.path < b.path ? -1 : 1) },
    evidenceSha256: "e".repeat(64), route: ROUTE };
  function run(extra = null) {
    writeFileSync(delays, "");
    const completed = spawnSync(process.execPath, ["--import", pathToFileURL(preload).href, CHILD], {
      input: JSON.stringify(request), encoding: "utf8", timeout: 60_000,
      env: { ...process.env, FAKE_CODEX: fake, DELAYS_FILE: delays, FAKE_MODEL: ROUTE.model,
        FAKE_REPORT: JSON.stringify(validReport(sources, "DR-1")), FAKE_EXTRA: extra === null ? "" : JSON.stringify(extra) } });
    const lines = completed.stdout.trim().split("\n").filter(Boolean);
    return { status: completed.status, result: JSON.parse(lines.at(-1)), delays: readFileSync(delays, "utf8").trim().split("\n").filter(Boolean).map(Number), stderr: completed.stderr };
  }
  return { sources, run };
}

test("retired child: a read-only review with a valid bound report is accepted and its deadline is finite (180 s)", (context) => {
  const { sources, run } = childHarness(context);
  const outcome = run();
  assert.equal(outcome.result.ok, true, outcome.stderr);
  assert.equal(outcome.result.code, "reviewed");
  assert.deepEqual(outcome.result.report, validReport(sources, "DR-1"));
  assert.equal(validateDesignReadinessModelOutput(outcome.result.report).valid, true);
  assert.ok(outcome.delays.includes(180_000), `child deadline observed: ${outcome.delays}`);
});

test("retired child: explicit mutation, file change and unexpected server request still fail without returning a report", (context) => {
  const { run } = childHarness(context);
  const failures = {
    "file change": { item: { type: "fileChange", changes: [] } },
    "explicit write command action": { item: { type: "commandExecution", commandActions: [{ type: "write" }] } },
    "explicit mutating action among reads": { item: { type: "commandExecution", commandActions: [{ type: "read" }, { type: "delete" }] } },
    "unexpected server request": { serverRequest: true },
  };
  for (const [label, extra] of Object.entries(failures)) {
    const outcome = run(extra);
    assert.equal(outcome.result.ok, false, label);
    assert.equal(outcome.result.code, "write-attempt", label);
    assert.equal(outcome.result.report, null, label);
    assert.equal(outcome.status, 2, label);
  }
  const reads = run({ item: { type: "commandExecution", commandActions: [{ type: "read" }, { type: "listFiles" }, { type: "search" }] } });
  assert.equal(reads.result.ok, true, "genuine read-only inspection stays admitted");
});

// The original acceptance (an `unknown` command action alone must not abort a read-only review) belongs to the
// RETIRED selected-sandbox route. The legacy child still classifies it as a write attempt. It is unreachable from the
// ordinary route (pinned above) and the retained tool-free host forbids every tool item outright, so it is recorded
// is now closed in the legacy child: unknown is inconclusive, while write/delete/malformed stay write attempts.
test("retired child: an unknown command action alone does not abort a read-only review", (context) => {
  const { run } = childHarness(context);
  for (const actions of [["unknown"], [{ type: "unknown" }], [{ type: "read" }, "unknown"]]) {
    const outcome = run({ item: { type: "commandExecution", commandActions: actions } });
    assert.equal(outcome.result.code, "reviewed", JSON.stringify(actions));
    assert.equal(outcome.result.ok, true, JSON.stringify(actions));
  }
  for (const actions of [[{ type: "unknown" }, { type: "write" }], ["unknown", { type: "delete" }], ["write"], [null]]) {
    const outcome = run({ item: { type: "commandExecution", commandActions: actions } });
    assert.equal(outcome.result.code, "write-attempt", JSON.stringify(actions));
  }
});

test("retained: the tool-free host rejects any tool, file or server event outright (no unknown-action ambiguity exists there)", () => {
  const text = readFileSync(join(PLUGIN, "lib", "codex-isolated-structured-host.mjs"), "utf8");
  assert.match(text, /events\.serverRequest\+\+; effectAttempt = true/);
  assert.match(text, /else \{ events\.other\+\+; effectAttempt = true; \}/);
  assert.match(text, /approvalPolicy: 'never'/);
  assert.match(text, /runtimeStatus === 'disabled'/);
  assert.match(text, /mcpServerStatus\/list', \{ limit: 100, cursor, threadId \}/, "inventory query is thread-bound");
});

// ===== Retired adapter: host deadline exceeds child deadline ===============================================
test("retired adapter: host deadline (240 s) exceeds the child deadline (180 s); child failure is typed unavailable, never a review", async (context) => {
  const harness = childHarness(context);
  const outcome = harness.run();
  const childDeadline = Math.max(...outcome.delays.filter((delay) => delay >= 100_000));
  const root = scratchDir(context, "ctfr-adapter");
  const repoRoot = join(root, "repo");
  mkdirSync(repoRoot);
  const sources = makeSources(repoRoot);
  const references = NAMES.map((name) => sources[name].path).sort();
  const evidenceBundle = buildAdvisoryEvidenceBundle(repoRoot, references);
  const dispatch = { queueRevision: 4, candidateCommit: COMMIT, candidateTree: TREE, referenceSetSha256: advisoryEvidenceBundleSha256(evidenceBundle) };
  const transport = { selectionId: "css_abcdefghijklmnopqrstuvwxy2", selectionSha256: "d".repeat(64), repoFingerprint: "e".repeat(64), duty: "readiness", dispatch,
    requested: { runner: "codex", model: ROUTE.model }, toolchain: { cliSha256: "f".repeat(64) },
    profile: { sha256: "1".repeat(64), base: ":read-only", network: { enabled: true }, scratchRootSha256: "2".repeat(64) },
    scratch: { repoRoot, path: root, sha256: "2".repeat(64), codexPath: "/fake/codex", sandboxStateJson: "{}", sandboxStateSha256: "3".repeat(64) } };
  const childOutput = (override) => {
    const script = join(root, `child-${Math.random().toString(16).slice(2)}.mjs`);
    const body = { schema: "pipeline.codex-readiness-app-server-child.v1", ok: true, code: "reviewed", report: validReport(sources, "DR-1"),
      observed: { provider: "openai", model: ROUTE.model, effort: ROUTE.effort, initialized: true, threadStarted: true, turnStarted: true,
        turnCompleted: true, stdinEnded: true, exitCode: 0, signal: null, cleanup: "complete" }, ...override };
    writeFileSync(script, `process.stdin.resume(); process.stdin.on("end", () => process.stdout.write(${JSON.stringify(JSON.stringify(body))} + "\\n"));`);
    return script;
  };
  const payload = { sandboxTransport: transport, dispatchId: "DR-1", candidate: CANDIDATE, sources, evidenceBundle, route: ROUTE };
  const run = async (override) => {
    const script = childOutput(override);
    const recorded = [];
    const result = await invokeCodexReadinessAppServer(payload, { buildSandboxInvocationFn: () => ({ command: process.execPath, argv: [script] }),
      setTimeoutFn: (fn, ms) => { recorded.push(ms); return setTimeout(fn, ms); } });
    return { result, recorded };
  };
  const ok = await run({});
  assert.equal(ok.result.status, "reviewed");
  assert.ok(ok.recorded.includes(240_000));
  assert.ok(Math.max(...ok.recorded) > childDeadline, `host ${Math.max(...ok.recorded)} > child ${childDeadline}`);
  for (const override of [{ ok: false, code: "write-attempt", report: null }, { ok: false, code: "protocol-error", report: null }, { code: "invalid-output", ok: false, report: null },
    { report: validReport(sources, "OTHER") }]) {
    const failed = await run(override);
    assert.deepEqual(failed.result, { status: "unavailable", childStarted: true }, JSON.stringify(override).slice(0, 60));
    assert.equal(Object.hasOwn(failed.result, "report"), false);
  }
});

// ===== Host-limited cases (Linux/WSL run owns them) ========================================================
for (const name of [
  "authenticated turn completes while the review cannot read a credential reference, including after SIGKILL; registered scratch stays recoverable",
  "process ownership, finite shutdown and restart recovery are registered before a productive spawn (POSIX process group + directory modes)",
  "global MCP inventory query must not start a configured server (live Codex App Server; directory symlink/mode fixtures)",
]) {
  test(`host-limited: ${name}`, { skip: HOST_LIMITATION }, () => {});
}
void relative;
