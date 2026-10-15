// SPDX-License-Identifier: SUL-1.0
// Regression pin for original Alfred item pipeline.security-scanner-failure-provenance (AC-249).
//
// Original acceptance (backlog/items/2026-09-29-security-scanner-failures-lose-executable-and-timeout-provenance.md):
//   P1 completed, missing, refused and timed-out scanner cases remain distinguishable;
//   P2 diagnostic retention cannot convert a failed scan to PASS (ERROR classification, deadlines, exit preserved);
//   P3 a bounded, sanitized diagnostic identifies tool/version when observed, executable/rules/candidate digests,
//      child exit/error/signal/elapsed time and timeout diagnostics, with unknown fields stated explicitly;
//   P4 secrets and unrestricted child output are never persisted;
//   P5 deterministic public-CLI fixture coverage and genuine native scanner acceptance are reported separately
//      (everything here is synthetic: NO native Semgrep is executed and NO native PASS is claimed).
//
// Real modules only (semgrep adapter run(), runSecurityScan(), the public security-scan CLI, the diagnostics
// library). Only their documented injection seams are used (spawnFn, assessTrustedExecutablePath, config.binaryPath).
// The final test proves the pin can fail: the same assertions are run against scratch mutants of the production
// adapter and must report each mutant as broken.
import test, { after } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { run as productionRun } from "../../scripts/security-adapters/semgrep.mjs";
import { runSecurityScan } from "../../scripts/security-scan.mjs";
import {
  observeSemgrepChild, observeLocalRules, validateScannerDiagnostics, buildScannerDiagnostics, parseScannerDiagnostics,
} from "../security-scanner-diagnostics.mjs";
import { publishScannerDiagnostics } from "../security-scanner-diagnostics-publication.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../../..");
const scratchBase = join(repoRoot, "scratch");
mkdirSync(scratchBase, { recursive: true });
const work = mkdtempSync(join(scratchBase, "sfp-pin-"));
after(() => { rmSync(work, { recursive: true, force: true }); });

// Host limitation (PO decision K7): the sidecar publisher is Linux-only (/proc descriptor anchoring).
const publisherSkip = process.platform === "win32"
  && "host limitation: scanner-diagnostics publisher is Linux-only and reports unavailable on win32; owner Coordinator, due 2026-10-19 (Linux/WSL run, PO decision K7)";

const CLEAN = '{"version":"1.170.0","results":[],"errors":[]}';
const hash = "a".repeat(64);
const evidence = { payloadSha256: hash, candidate: { commit: "b".repeat(40), tree: "c".repeat(40), inputSha256: "d".repeat(64) } };
const tuple = (r) => `${r.status}/${r.classification}`;

// One adapter call through the (real or mutant) run(); spawnFn is the documented seam.
async function call(runFn, response, { timeoutMs = 4321, env = {} } = {}) {
  const seen = [];
  const value = await runFn({
    rootDir: work, config: { binaryPath: "/synthetic-semgrep" }, timeoutMs, env,
    spawnFn: (...args) => { seen.push(args); if (response instanceof Error) throw response; return response; },
  });
  return { value, seen };
}
const missingCall = (runFn) => runFn({
  rootDir: work, config: {}, timeoutMs: 1000,
  env: { PATH: "", Path: "", PIPELINE_SEMGREP_PATH: join(work, "absent-semgrep") },
  spawnFn: () => { throw new Error("spawn must not happen for a missing tool"); },
});

// The acceptance facts, collected from any adapter implementation.
async function facts(runFn) {
  const completed = (await call(runFn, { status: 0, stdout: CLEAN, stderr: "" })).value;
  const timedOut = (await call(runFn, { status: null, error: { code: "ETIMEDOUT", message: "SECRET" }, signal: "SIGTERM", stdout: CLEAN, stderr: "SECRET" })).value;
  const refusedThrown = (await call(runFn, Object.assign(new Error("secret path"), { code: "EPERM" }))).value;
  const refusedResult = (await call(runFn, { status: null, error: { code: "EACCES", message: "SECRET" }, stdout: "", stderr: "" })).value;
  const nonzeroCleanBody = (await call(runFn, { status: 7, stdout: CLEAN, stderr: "boom" })).value;
  const missing = await missingCall(runFn);
  return { completed, timedOut, refusedThrown, refusedResult, nonzeroCleanBody, missing };
}
// Throws unless every acceptance point P1/P2 holds for the implementation.
function assertAcceptance(f) {
  assert.equal(tuple(f.completed), "PASS/success");
  assert.equal(tuple(f.timedOut), "ERROR/scanner_error");
  assert.match(f.timedOut.reason, /timed out after 4321ms/);
  assert.equal(f.timedOut.raw, null);
  assert.equal(tuple(f.refusedThrown), "ERROR/execution_environment");
  assert.equal(tuple(f.refusedResult), "ERROR/execution_environment");
  assert.equal(tuple(f.nonzeroCleanBody), "ERROR/scanner_error");
  assert.equal(tuple(f.missing), "SKIPPED/binary_missing");
  const distinct = new Set([tuple(f.completed), tuple(f.timedOut), tuple(f.refusedThrown), tuple(f.missing)]);
  assert.equal(distinct.size, 4, "completed, timed-out, refused and missing must be pairwise distinguishable");
  assert.notEqual(f.timedOut.reason, f.nonzeroCleanBody.reason);
  for (const r of [f.timedOut, f.refusedThrown, f.refusedResult, f.nonzeroCleanBody]) assert.notEqual(r.status, "PASS");
}

test("P1/P2 completed, missing, refused and timed-out adapter cases stay distinguishable and no failure becomes PASS", async () => {
  assertAcceptance(await facts(productionRun));
});

test("P2 deadline, argv, shell and fixed offline env are preserved while diagnostics are collected", async () => {
  const { value, seen } = await call(productionRun, { status: 0, stdout: CLEAN, stderr: "" }, { timeoutMs: 4321, env: { SEMGREP_ENABLE_VERSION_CHECK: "1" } });
  assert.equal(seen.length, 1, "exactly one child call; diagnostics must not re-probe the tool");
  assert.equal(seen[0][0], "/synthetic-semgrep");
  assert.equal(seen[0][2].timeout, 4321);
  assert.equal(seen[0][2].shell, false);
  assert.equal(seen[0][2].env.SEMGREP_ENABLE_VERSION_CHECK, "0");
  assert.equal(seen[0][2].env.SEMGREP_SEND_METRICS, "off");
  assert.equal(value.diagnostics.timeoutMs, 4321);
  // Cleanup preserved: the per-scan scratch (log/settings/version cache location) is removed before return.
  const logPath = seen[0][2].env.SEMGREP_LOG_FILE;
  assert.equal(typeof logPath, "string");
  assert.equal(existsSync(dirname(logPath)), false, "adapter scratch directory must be cleaned up");
});

test("P3 timeout keeps useful, bounded facts that the old result dropped: errorCode, signal, elapsed, deadline, completed-output facts, version", async () => {
  const { value } = await call(productionRun, { status: null, error: { code: "ETIMEDOUT", message: "SECRET" }, signal: "SIGTERM", stdout: CLEAN, stderr: "SECRET /private/root" });
  assert.equal(value.status, "ERROR");
  const d = value.diagnostics;
  assert.equal(d.observation, "child-result");
  assert.equal(d.errorCode, "ETIMEDOUT");
  assert.equal(d.signal, "SIGTERM");
  assert.equal(d.exitCode, null);
  assert.ok(Number.isInteger(d.elapsedMs) && d.elapsedMs >= 0);
  assert.equal(d.timeoutMs, 4321);
  assert.deepEqual(d.version, { value: "1.170.0", source: "existing-json-output" });
  assert.equal(d.output.interpretation, "complete-json");
  assert.equal(d.output.resultsCount, 0);
  assert.equal(d.output.stderrBytes, Buffer.byteLength("SECRET /private/root"));
});

test("P3 unknown or unobserved fields are explicit, never invented", () => {
  const unknownVersion = observeSemgrepChild({ status: 0, stdout: "not json", stderr: "" }, 5, 1000);
  assert.deepEqual(unknownVersion.version, { value: null, source: "unknown-or-withheld" });
  assert.equal(unknownVersion.output.interpretation, "not-complete-json");
  assert.equal(unknownVersion.output.resultsCount, null);
  assert.deepEqual(observeSemgrepChild({}, 1, 0), { observation: "not-observed" });
  assert.deepEqual(observeLocalRules("/r", "/r/rules"), { mode: "local", sha256: null, reason: "observation-unavailable", unchanged: null });
  assert.deepEqual(observeLocalRules("/r", null), { mode: "auto", sha256: null, reason: "remote-config-not-observed", unchanged: null });
  const empty = buildScannerDiagnostics(evidence, []);
  assert.deepEqual(empty.scanners, []);
  const absent = buildScannerDiagnostics(evidence, [{ tool: "semgrep", executableSha256: null, rules: observeLocalRules("/r", null), child: { observation: "not-observed" } }]);
  assert.equal(validateScannerDiagnostics(absent), true);
});

test("P3 the diagnostic record binds executable, rules and candidate digests and the exact evidence payload", async () => {
  const { value } = await call(productionRun, { status: null, error: { code: "ETIMEDOUT" }, signal: "SIGTERM", stdout: "", stderr: "" });
  const record = buildScannerDiagnostics(evidence, [{ tool: "semgrep", executableSha256: "e".repeat(64), rules: observeLocalRules("/r", "/r/rules"), child: value.diagnostics }]);
  assert.equal(record.evidencePayloadSha256, hash);
  assert.deepEqual(record.candidate, evidence.candidate);
  assert.equal(record.scanners[0].executableSha256, "e".repeat(64));
  assert.equal(record.scanners[0].rules.mode, "local");
  const bytes = Buffer.from(JSON.stringify(record) + "\n");
  assert.ok(bytes.length <= 16384, "record stays inside the bounded budget");
  assert.equal(parseScannerDiagnostics(bytes, evidence).ok, true);
  assert.equal(parseScannerDiagnostics(bytes, { ...evidence, payloadSha256: "f".repeat(64) }).code, "diagnostic-binding-stale");
  for (const key of ["commit", "tree", "inputSha256"]) {
    const other = structuredClone(evidence);
    other.candidate[key] = key === "inputSha256" ? "0".repeat(64) : "0".repeat(40);
    assert.equal(parseScannerDiagnostics(bytes, other).code, "diagnostic-candidate-mismatch");
  }
});

test("P4 secrets and unrestricted child output are not persisted; unknown codes collapse; oversize is refused", async () => {
  const secretRuns = [
    { status: null, error: { code: "ETIMEDOUT", message: "G13_SECRET" }, signal: "SIGTERM", stdout: CLEAN, stderr: "G13_SECRET" },
    { status: 7, stdout: '{"leak":"G13_SECRET"}', stderr: "G13_SECRET" },
    { status: 0, stdout: "broken G13_SECRET", stderr: "G13_SECRET" },
  ];
  for (const response of secretRuns) {
    const { value } = await call(productionRun, response);
    const record = buildScannerDiagnostics(evidence, [{ tool: "semgrep", executableSha256: hash, rules: observeLocalRules("/r", null), child: value.diagnostics }]);
    assert.equal(JSON.stringify(record).includes("G13_SECRET"), false);
  }
  const odd = observeSemgrepChild({ error: { code: "TOKEN", message: "X" }, signal: "SECRET", stdout: "", stderr: "" }, 1, 1000);
  assert.equal(odd.errorCode, "OTHER");
  assert.equal(odd.signal, "OTHER");
  const base = buildScannerDiagnostics(evidence, []);
  const injected = structuredClone(base);
  injected.raw = "G13_SECRET";
  assert.equal(validateScannerDiagnostics(injected), false);
  const huge = observeSemgrepChild({ status: 0, stdout: JSON.stringify({ version: "9.9.9", pad: "x".repeat(1048576), results: [] }), stderr: "" }, 1, 1000);
  assert.equal(huge.output.interpretation, "over-diagnostic-budget");
  assert.equal(huge.version.value, null);
  assert.equal(huge.output.resultsCount, null);
  assert.equal(parseScannerDiagnostics(" ".repeat(16385), evidence).ok, false);
});

test("P2 diagnostics are verdict-independent: the record is diagnostic-only and any verdict field is refused", () => {
  const record = buildScannerDiagnostics(evidence, []);
  assert.equal(record.authority, "diagnostic-only");
  for (const field of ["status", "verdict", "exitCode", "reportStatus"]) {
    const forged = structuredClone(record);
    forged[field] = "PASS";
    assert.equal(validateScannerDiagnostics(forged), false, `${field} must not be admissible in a diagnostic record`);
  }
  const wrongAuthority = structuredClone(record);
  wrongAuthority.authority = "gate";
  assert.equal(validateScannerDiagnostics(wrongAuthority), false);
});

// ---- Public producer (runSecurityScan) and public CLI, synthetic child responses only ----
function producerFixture(tag) {
  const base = mkdtempSync(join(work, `${tag}-`));
  const root = join(base, "project");
  mkdirSync(join(root, ".claude"), { recursive: true });
  writeFileSync(join(root, ".gitignore"), "evidence/\n");
  writeFileSync(join(root, ".claude/pipeline.yaml"), "schema: pipeline.manifest.v0\ngates:\n  security:\n    mode: blocking\n    type: automated\nsecurity:\n  scanners:\n    gitleaks:\n      enabled: false\n    osv-scanner:\n      enabled: false\n    semgrep:\n      enabled: true\n    license-check:\n      enabled: false\n");
  const git = (args) => { const r = spawnSync("git", args, { cwd: root, encoding: "utf8", shell: false }); assert.equal(r.status, 0, r.stderr); };
  git(["init", "-q"]); git(["config", "user.name", "SFP Pin Fixture"]); git(["config", "user.email", "sfp@example.invalid"]);
  git(["add", "-A"]); git(["commit", "-qm", "fixture"]);
  const binary = join(base, "synthetic-semgrep");
  writeFileSync(binary, "synthetic selected child, never executed\n");
  return { base, root, binary };
}
async function produce(f, response, { trusted = true } = {}) {
  let selected = 0;
  const env = { ...process.env, PIPELINE_SEMGREP_PATH: f.binary };
  // An untrusted override must not fall back to a real host-installed scanner via HOME.
  if (!trusted) delete env.HOME;
  const result = await runSecurityScan({
    rootDir: f.root, env, timeoutMs: 4321,
    assessTrustedExecutablePath: (path) => (trusted && path === f.binary ? { ok: true, path } : { ok: false, status: "untrusted_path" }),
    spawnFn: (command, args, options) => {
      if (command === process.execPath && args.length === 2 && args[0] === "-e" && args[1] === "process.exit(0)") return spawnSync(command, args, options);
      assert.equal(command, f.binary);
      selected++;
      assert.equal(options.timeout, 4321);
      assert.equal(options.shell, false);
      if (response instanceof Error) throw response;
      return response;
    },
  });
  return { result, selected };
}
const sha = (path) => createHash("sha256").update(readFileSync(path)).digest("hex");

test("P1/P2/P3 public producer: five cases map to distinct entries and exit codes; failures keep exit 2; executable digest retained", async () => {
  const cases = {};
  const f1 = producerFixture("completed");
  cases.completed = (await produce(f1, { status: 0, stdout: CLEAN, stderr: "" })).result;
  const f2 = producerFixture("timeout");
  cases.timedOut = (await produce(f2, { status: null, error: { code: "ETIMEDOUT", message: "G13_SECRET" }, signal: "SIGTERM", stdout: CLEAN, stderr: "G13_SECRET" })).result;
  const f3 = producerFixture("refused");
  cases.refused = (await produce(f3, { status: null, error: { code: "EPERM", message: "G13_SECRET" }, stdout: "", stderr: "G13_SECRET" })).result;
  const f4 = producerFixture("untrusted");
  const untrusted = await produce(f4, { status: 0, stdout: CLEAN, stderr: "" }, { trusted: false });
  assert.equal(untrusted.selected, 0, "an untrusted executable is never spawned");
  cases.untrusted = untrusted.result;

  const entry = (r) => r.evidence.scanners[0];
  assert.equal(`${entry(cases.completed).status}/${entry(cases.completed).classification}`, "PASS/success");
  assert.equal(cases.completed.exitCode, 0);
  assert.equal(`${entry(cases.timedOut).status}/${entry(cases.timedOut).classification}`, "ERROR/scanner_error");
  assert.equal(cases.timedOut.exitCode, 2);
  assert.match(entry(cases.timedOut).reason, /timed out/);
  assert.equal(`${entry(cases.refused).status}/${entry(cases.refused).classification}`, "ERROR/execution_environment");
  assert.equal(cases.refused.exitCode, 2);
  assert.equal(entry(cases.untrusted).status, "SKIPPED", JSON.stringify(entry(cases.untrusted)));
  assert.equal(entry(cases.untrusted).classification, "untrusted_path");
  assert.notEqual(entry(cases.untrusted).status, "PASS");
  // Executable digest is retained in v1 evidence for completed and failed scans alike.
  assert.equal(entry(cases.timedOut).executableSha256, sha(f2.binary));
  assert.equal(entry(cases.completed).executableSha256, sha(f1.binary));
  // The persisted evidence never carries child text (secret) even on failure.
  for (const f of [f2, f3]) assert.equal(readFileSync(join(f.root, "evidence/security-latest.json"), "utf8").includes("G13_SECRET"), false);
  const tuples = new Set(["completed", "timedOut", "refused", "untrusted"].map((k) => `${entry(cases[k]).status}/${entry(cases[k]).classification}`));
  assert.equal(tuples.size, 4);
});

test("P1 public CLI genuine missing-tool is SKIPPED binary_missing (not PASS) and exits 0 without native execution", () => {
  const f = producerFixture("cli-missing");
  const env = { ...process.env, PIPELINE_SEMGREP_PATH: join(f.base, "missing-semgrep") };
  delete env.HOME; // an explicit absent binary still permits the HOME trusted-tool fallback; omit it
  const cli = fileURLToPath(new URL("../../scripts/security-scan.mjs", import.meta.url));
  const r = spawnSync(process.execPath, [cli, "--root", f.root, "--timeout-ms", "4321"], { env, encoding: "utf8", shell: false, timeout: 30000 });
  assert.equal(r.status, 0, JSON.stringify({ stderr: r.stderr, stdout: r.stdout, error: r.error?.code }));
  const e = JSON.parse(readFileSync(join(f.root, "evidence/security-latest.json"), "utf8"));
  assert.equal(e.scanners.length, 1);
  assert.equal(e.scanners[0].status, "SKIPPED");
  assert.equal(e.scanners[0].classification, "binary_missing");
});

test("P2 sidecar publication outcome never moves the verdict or exit code (publisher unavailable on win32, published on Linux)", async () => {
  const f = producerFixture("verdict-independence");
  const { result } = await produce(f, { status: null, error: { code: "ETIMEDOUT" }, signal: "SIGTERM", stdout: CLEAN, stderr: "" });
  assert.equal(result.exitCode, 2);
  assert.equal(result.evidence.scanners[0].status, "ERROR");
  // Deliberately unpublishable root: the publisher must refuse, the verdict must not change.
  const refused = publishScannerDiagnostics(join(f.base, "no-such-root"), buildScannerDiagnostics(result.evidence, []));
  assert.equal(refused.status, "unavailable");
  if (process.platform === "win32") {
    assert.equal(publishScannerDiagnostics(f.root, buildScannerDiagnostics(result.evidence, [])).code, "diagnostic-publication-capability-unavailable");
  }
});

test("P3/P4 Linux: timed-out producer run publishes a bound, bounded, secret-free sidecar next to ERROR evidence", { skip: publisherSkip }, async () => {
  const f = producerFixture("sidecar");
  mkdirSync(join(f.root, "evidence"), { recursive: true, mode: 0o700 });
  const { result } = await produce(f, { status: null, error: { code: "ETIMEDOUT", message: "G13_SECRET" }, signal: "SIGTERM", stdout: CLEAN, stderr: "G13_SECRET" });
  assert.equal(result.exitCode, 2);
  const bytes = readFileSync(join(f.root, "evidence/security-latest.diagnostics.json"));
  assert.ok(bytes.length <= 16384);
  const parsed = parseScannerDiagnostics(bytes, result.evidence);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.record.scanners[0].child.errorCode, "ETIMEDOUT");
  assert.equal(parsed.record.scanners[0].child.signal, "SIGTERM");
  assert.equal(parsed.record.scanners[0].executableSha256, sha(f.binary));
  assert.equal(bytes.toString("utf8").includes("G13_SECRET"), false);
});

// ---- RED proof: the same acceptance assertions must fail on scratch mutants of the production adapter ----
const adapterSource = readFileSync(new URL("../../scripts/security-adapters/semgrep.mjs", import.meta.url), "utf8");
const libUrl = pathToFileURL(resolve(here, "../security-scanner-diagnostics.mjs")).href;
const mutations = {
  "timeout becomes PASS": [
    "return { status: \"ERROR\", classification: \"scanner_error\", findings: [], raw: null, reason: `semgrep timed out after ${timeoutMs}ms` };",
    "return { status: \"PASS\", classification: \"success\", findings: [], raw: null, reason: `semgrep timed out after ${timeoutMs}ms` };",
  ],
  "refusal is relabelled missing": [`classification: "execution_environment",`, `classification: "binary_missing",`],
  "nonzero exit with clean body is trusted": ["if (res.status !== 0) {", "if (false) {"],
  "diagnostics convert ERROR to PASS": [
    "return { ...result, diagnostics };",
    "return { ...result, status: diagnostics?.output?.interpretation === \"complete-json\" && result.status === \"ERROR\" ? \"PASS\" : result.status, diagnostics };",
  ],
};
async function loadMutant(label, [from, to], index) {
  assert.ok(adapterSource.includes(from), `mutation anchor missing for "${label}" (production source drifted)`);
  const dir = mkdtempSync(join(work, `mutant${index}-`));
  const file = join(dir, "semgrep-mutant.mjs");
  writeFileSync(file, adapterSource.replace("../../lib/security-scanner-diagnostics.mjs", libUrl).replace(from, to));
  return (await import(pathToFileURL(file).href)).run;
}

test("RED: every mutant of the production adapter is rejected by the same acceptance assertions; production source is untouched", async () => {
  // Control: the unmutated mirror passes exactly as production does.
  const control = await loadMutant("control", ["export const name", "export const name"], 0);
  assertAcceptance(await facts(control));
  let index = 1;
  for (const [label, mutation] of Object.entries(mutations)) {
    const mutant = await loadMutant(label, mutation, index++);
    let rejected = false;
    try { assertAcceptance(await facts(mutant)); } catch { rejected = true; }
    assert.equal(rejected, true, `mutant "${label}" was not detected: the pin would not fail on this regression`);
  }
});
