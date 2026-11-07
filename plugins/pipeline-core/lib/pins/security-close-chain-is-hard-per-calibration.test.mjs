// SPDX-License-Identifier: SUL-1.0
// Regression pin for Candidate 20 finding G20-25 (PO decision 2026-11-07, "hart je Kalibrierung"; Codex greenfield report P0
// "fehlende Abschlusskette"), criterion AC-108.
//
// Acceptance, written from the criterion and the PO decision, not from the code:
//   C1 a project calibrated critical whose scanner did not execute is blocked at the close/push completeness check with a typed
//      refusal that names the scanner and the one command that installs or runs it;
//   C2 a project calibrated standard stays admitted, but the status reads "not executed", never "passed";
//   C3 a clean run reads "passed" (standard and critical alike, no refusal);
//   C4 a finding reads "failed";
//   C5 every human-facing status line uses the four-state vocabulary only: passed, failed, not executed, not applicable; a scanner
//      the calibration does not configure is "not applicable", a configured one without a run is "not executed" (also with no
//      evidence at all);
//   C6 security-scan.mjs accepts --out-dir under scratch/ for an analysis run and refuses any other target without writing.
// The scanner observation is injected as evidence files (no scanner is spawned, nothing is downloaded).
import test, { after } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { checkSecurityCompleteness } from "../security-completeness-gate.mjs";
import {
  SECURITY_STATES, isCriticalStakes, readCalibrationStakes, securityCloseElements, formatSecurityCloseStatus,
} from "../security-close-status.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const scanScript = resolve(here, "../../scripts/security-scan.mjs");
const HEAD = "a".repeat(40);
const TREE = "b".repeat(40);
const dirs = [];
after(() => { for (const dir of dirs) rmSync(dir, { recursive: true, force: true }); });

const project = (stakes) => {
  const dir = mkdtempSync(join(tmpdir(), "sec-close-pin-"));
  dirs.push(dir);
  if (stakes !== undefined) writeJson(dir, "project/pipeline.json", { project: "pin", stakes });
  return dir;
};
function writeJson(dir, rel, value) {
  mkdirSync(dirname(join(dir, rel)), { recursive: true });
  writeFileSync(join(dir, rel), JSON.stringify(value));
}
const capability = ({ capabilityId, tool, status, classification, findings = [] }) => ({
  capabilityId, tool: { name: tool, version: null }, rulePack: { ref: `${tool}-default`, digest: null }, status, classification, findings,
  coverage: { subject: "candidate-tree", exclusions: [], ignored: [], unsupportedScope: [], truncation: { truncated: false, scannedFileCount: null, totalEligibleFileCount: null }, dataAge: { ageSeconds: 0, snapshotAt: null } },
  reason: status === "SKIPPED" ? "gitleaks was not found" : null,
});
// One required-or-optional capability, as the real scan writes it. `optional` keeps the existing verdict non-blocking, so only the
// calibration decides the outcome of a scanner that did not run.
function evidence(dir, { status, classification, outcome, blocking = false, optional = true, findings = [] }) {
  writeJson(dir, "evidence/security-latest.v2.json", {
    schema: "pipeline.security-evidence.v2",
    policy: { configurationSha256: "e".repeat(64) },
    input: { commit: HEAD, tree: TREE, inputSha256: "f".repeat(64) },
    environment: { platform: process.platform, nodeVersion: process.version },
    capabilities: [capability({ capabilityId: "cap.secrets", tool: "gitleaks", status, classification, findings })],
  });
  writeJson(dir, "evidence/security-latest.v2.verdict.json", {
    schema: "pipeline.security-verdict.v2", producedFrom: "pipeline.security-evidence.v2", exitAuthority: "v1-blocking-logic", note: "fixture", v1ExitCode: 0,
    plan: { required: optional ? [] : ["cap.secrets"], optional: optional ? ["cap.secrets"] : [], planDigest: "g".repeat(64), source: "fixture", resolvedPolicyDigest: "h".repeat(64) },
    capabilityOutcomes: { "cap.secrets": outcome },
    verdict: { blocking, offendingCapabilities: blocking ? [{ capabilityId: "cap.secrets", outcome }] : [] },
    controls: [],
  });
}
const skipped = (dir) => evidence(dir, { status: "SKIPPED", classification: "binary_missing", outcome: "not-applicable" });
const scanners = (...entries) => entries.map(([tool, status, classification = "success"]) => ({ tool, status, classification }));

test("C1 critical calibration + a scanner that did not execute is a typed block naming the scanner and the one command", () => {
  const dir = project("critical");
  skipped(dir);
  const failures = checkSecurityCompleteness({ projectDir: dir, commit: HEAD, tree: TREE });
  assert.equal(failures.length, 1, failures.join("\n"));
  assert.match(failures[0], /SEC-CLOSE-SCANNER-NOT-EXECUTED/u);
  assert.match(failures[0], /gitleaks/u);
  assert.match(failures[0], /node <plugin-root>\/scripts\/security-scan\.mjs/u);
});

test("C1b the calibration vocabulary: critical, high and their German spellings are critical; standard, absent and unknown are not", () => {
  for (const value of ["critical", "Critical", "kritisch", "high", "hoch", "hoch (Guardrail-Quelle aller Projekte)"]) assert.equal(isCriticalStakes(value), true, value);
  for (const value of ["standard", "low", "", undefined, null, 7, "whatever"]) assert.equal(isCriticalStakes(value), false, String(value));
  assert.equal(readCalibrationStakes(project("critical")), "critical");
  assert.equal(readCalibrationStakes(project()), null);
});

test("C2 standard calibration stays admitted, and the status reads not executed (never passed)", () => {
  const dir = project("standard");
  skipped(dir);
  assert.deepEqual(checkSecurityCompleteness({ projectDir: dir, commit: HEAD, tree: TREE }), []);
  const text = formatSecurityCloseStatus(securityCloseElements({ scanners: scanners(["gitleaks", "SKIPPED", "binary_missing"]) })).join("\n");
  assert.match(text, /gitleaks: not executed/u);
  assert.doesNotMatch(text, /gitleaks: (passed|ok)/iu);
});

test("C3 a clean run reads passed and is admitted under both calibrations", () => {
  for (const stakes of ["standard", "critical"]) {
    const dir = project(stakes);
    evidence(dir, { status: "PASS", classification: "success", outcome: "pass" });
    assert.deepEqual(checkSecurityCompleteness({ projectDir: dir, commit: HEAD, tree: TREE }), [], stakes);
  }
  const elements = securityCloseElements({ scanners: scanners(["gitleaks", "PASS"]) });
  assert.equal(elements.find((e) => e.element === "gitleaks").state, "passed");
});

test("C4 a finding reads failed", () => {
  const elements = securityCloseElements({ scanners: scanners(["gitleaks", "FINDINGS", "findings"]) });
  assert.equal(elements.find((e) => e.element === "gitleaks").state, "failed");
  const dir = project("standard");
  evidence(dir, { status: "FINDINGS", classification: "findings", outcome: "findings", blocking: true, optional: false });
  assert.equal(checkSecurityCompleteness({ projectDir: dir, commit: HEAD, tree: TREE }).length, 1);
});

test("C5 four states only; unconfigured is not applicable, configured without a run is not executed, no evidence at all is not executed", () => {
  assert.deepEqual([...SECURITY_STATES], ["passed", "failed", "not executed", "not applicable"]);
  const elements = securityCloseElements({
    scanners: scanners(["gitleaks", "PASS"], ["osv-scanner", "SKIPPED", "success"], ["semgrep", "ERROR", "scanner_error"], ["license-check", "SKIPPED", "success"]),
  });
  const state = Object.fromEntries(elements.map((e) => [e.element, e.state]));
  assert.deepEqual(state, { gitleaks: "passed", "osv-scanner": "not applicable", semgrep: "not executed", "license-check": "not applicable" });
  const none = securityCloseElements({ scanners: null, enabled: { semgrep: false } });
  assert.deepEqual(Object.fromEntries(none.map((e) => [e.element, e.state])), { gitleaks: "not executed", "osv-scanner": "not executed", semgrep: "not applicable", "license-check": "not executed" });
  for (const line of formatSecurityCloseStatus(none)) assert.match(line, /: (passed|failed|not executed|not applicable)\b/u);
});

// C7 (added with the close-script edit; extends C1/C2/C5 to the real close.pre entry point, no case above was changed).
const closeScript = resolve(here, "../../scripts/check-close-security-completeness.mjs");
function closeFixture({ gate, stakes }) {
  const dir = project();
  const git = (...args) => spawnSync("git", ["-C", dir, ...args], { encoding: "utf8" });
  git("init", "-q");
  git("config", "user.name", "Fixture Author");
  git("config", "user.email", "fixture@example.invalid");
  writeJson(dir, "change.json", { base: true });
  if (gate) { mkdirSync(join(dir, ".claude"), { recursive: true }); writeFileSync(join(dir, ".claude/pipeline.yaml"), `schema: pipeline.manifest.v0\ngates:\n  security:\n    mode: ${gate}\n    type: automated\n`); }
  if (stakes) writeJson(dir, ".claude/pipeline.json", { project: "pin", stakes });
  git("add", ".");
  git("commit", "-q", "-m", "base");
  const commit = git("rev-parse", "HEAD").stdout.trim();
  const tree = git("rev-parse", "HEAD^{tree}").stdout.trim();
  return { dir, commit, tree };
}
function closeEvidence(dir, commit, tree) {
  evidence(dir, { status: "SKIPPED", classification: "binary_missing", outcome: "not-applicable" });
  const envelopePath = join(dir, "evidence/security-latest.v2.json");
  const envelope = JSON.parse(readFileSync(envelopePath, "utf8"));
  envelope.input.commit = commit;
  envelope.input.tree = tree;
  writeFileSync(envelopePath, JSON.stringify(envelope));
  writeJson(dir, "evidence/security-latest.json", { scanners: [{ tool: "gitleaks", status: "SKIPPED", classification: "binary_missing", reason: "gitleaks was not found" }] });
}
const runClose = (dir) => spawnSync(process.execPath, [closeScript], { cwd: dir, encoding: "utf8", env: { ...process.env, CLAUDE_PROJECT_DIR: dir } });

test("C7 the close.pre entry point: standard prints not executed and never GREEN, critical exits 2, an unconfigured gate says not applicable", () => {
  const standard = closeFixture({ gate: "blocking", stakes: "standard" });
  closeEvidence(standard.dir, standard.commit, standard.tree);
  const admitted = runClose(standard.dir);
  assert.equal(admitted.status, 0, admitted.stderr);
  assert.match(admitted.stdout, /gitleaks: not executed/u);
  assert.match(admitted.stdout, /NOT COMPLETE/u);
  assert.doesNotMatch(admitted.stdout, /GREEN/u);

  const critical = closeFixture({ gate: "blocking", stakes: "critical" });
  closeEvidence(critical.dir, critical.commit, critical.tree);
  const refused = runClose(critical.dir);
  assert.equal(refused.status, 2);
  assert.match(refused.stderr, /SEC-CLOSE-SCANNER-NOT-EXECUTED/u);

  const unconfigured = closeFixture({});
  const skippedRun = runClose(unconfigured.dir);
  assert.equal(skippedRun.status, 0);
  assert.match(skippedRun.stdout, /not applicable/u);
});

// C8 (the normal delivery path): the Verify "security" check runs the configured scan. The scanner observation is injected as an
// environment without any scanner (empty PATH, HOME in the fixture): no scanner binary is found, nothing is downloaded.
test("C8 the Verify security check runs the scan: standard admits and reports, critical refuses the scanner that did not execute, no gate is not applicable", async () => {
  const { runSecurityCloseCheck } = await import("../../scripts/consumer-verify-check.mjs");
  const run = (root) => {
    const lines = [];
    const log = console.log; const error = console.error;
    console.log = (...a) => lines.push(a.join(" ")); console.error = (...a) => lines.push(a.join(" "));
    try { return { code: runSecurityCloseCheck(root, { PATH: "", Path: "", HOME: root }), text: lines.join("\n") }; } finally { console.log = log; console.error = error; }
  };
  const gateFile = "schema: pipeline.manifest.v0\ngates:\n  security:\n    mode: blocking\n    type: automated\n";
  const make = (stakes, gate = true) => {
    const root = project(stakes);
    if (gate) { mkdirSync(join(root, ".claude"), { recursive: true }); writeFileSync(join(root, ".claude/pipeline.yaml"), gateFile); }
    return root;
  };
  assert.deepEqual([run(make("standard", false)).code, /not applicable/u.test(run(make("standard", false)).text)], [0, true]);
  const standard = make("standard");
  assert.equal(run(standard).code, 0);
  assert.ok(existsSync(join(standard, "evidence", "security-latest.json")), "the Verify path actually ran the scan and wrote its evidence");
  const critical = run(make("critical"));
  assert.equal(critical.code, 1);
  assert.match(critical.text, /SEC-CLOSE-SCANNER-NOT-EXECUTED/u);
});

test("C6 security-scan.mjs --out-dir under scratch/ writes there; any other target is refused and writes nothing", () => {
  const root = project();
  mkdirSync(join(root, "scratch"), { recursive: true });
  const ok = spawnSync(process.execPath, [scanScript, "--root", root, "--out-dir", "scratch/analysis"], { encoding: "utf8", timeout: 50_000 });
  assert.ok(existsSync(join(root, "scratch", "analysis", "evidence", "security-latest.json")), `${ok.stdout}\n${ok.stderr}`);
  assert.equal(existsSync(join(root, "evidence", "security-latest.json")), false, "an analysis run must not write the root evidence/");
  const refused = spawnSync(process.execPath, [scanScript, "--root", root, "--out-dir", "evidence"], { encoding: "utf8", timeout: 50_000 });
  assert.equal(refused.status, 1);
  assert.match(refused.stderr, /scratch/u);
  assert.equal(existsSync(join(root, "evidence")), false);
  assert.deepEqual(readdirSync(root).sort(), ["project", "scratch"].filter((name) => existsSync(join(root, name))).sort());
});
