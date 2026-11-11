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
//   C9  (PO decision 2026-11-07, "muss in die Meldung wie es geht") a critical project whose manifest configures no security gate (no
//       manifest, no gates.security, or mode off) is blocked at the close entry and at Verify with a typed refusal that names the exact
//       repair argv;
//   C10 running that argv configures gates.security (blocking, automated) in the tier the loader reads, every other byte unchanged
//       (comments, CRLF, other gates), a second run is a no-op, and the same Verify run then reaches the scanners;
//   C11 standard, absent and unrecognised stakes + no gate stay "not applicable" and admitted;
//   C12 a refused repair (invalid manifest, a shape it cannot edit byte-safely) leaves every byte and the directory unchanged; a twin
//       manifest pair stays byte-identical; the block is the one onboarding writes.
// The scanner observation is injected as evidence files (no scanner is spawned, nothing is downloaded).
import test, { after } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import * as statusLib from "../security-close-status.mjs"; // C28 cases read the new exports through the namespace, so a missing export fails only those cases
import { checkSecurityCompleteness } from "../security-completeness-gate.mjs";
import { gateConfig, loadManifest } from "../manifest.mjs";
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
  const { runSecurityCloseCheck } = await import("../../scripts/security-close-check.mjs"); // QG-04: same function, moved to its own dispatcher (GMWKC01)
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

// ---- C9-C12 (G20-25, gate repair): the critical project without a security gate, and the one command that configures it ----
const gateScript = resolve(here, "../../scripts/security-gate-configure.mjs");
// The argv is the END of the message line: nothing may follow the root, so a copied line is exactly the one argv the guard admits.
const REPAIR_RE = /node (\S+security-gate-configure\.mjs) --root (\S+)\s*$/mu;
const BLOCK = (eol = "\n") => ["  security:", "    mode: blocking", "    type: automated", ""].join(eol);
const HEADER = "schema: pipeline.manifest.v0\n";
const WITHOUT_SECURITY = `${HEADER}gates:\n  # human plan approval\n  dev-plan:\n    mode: blocking\n    type: human\n  push:\n    mode: blocking\n    type: human\n`;
const MODE_OFF = `${HEADER}gates:\n  dev-plan:\n    mode: blocking\n    type: human\n  security:\n    mode: off   # not yet\n    type: automated\n  push:\n    mode: blocking\n    type: human\n`;
function put(dir, rel, text) { mkdirSync(dirname(join(dir, rel)), { recursive: true }); writeFileSync(join(dir, rel), text); }
function verifyCheck(root) {
  return (async () => {
    const { runSecurityCloseCheck } = await import("../../scripts/security-close-check.mjs"); // QG-04: same function, moved to its own dispatcher (GMWKC01)
    const lines = [];
    const log = console.log; const error = console.error;
    console.log = (...a) => lines.push(a.join(" ")); console.error = (...a) => lines.push(a.join(" "));
    try { return { code: runSecurityCloseCheck(root, { PATH: "", Path: "", HOME: root }), text: lines.join("\n") }; } finally { console.log = log; console.error = error; }
  })();
}
function listing(dir) { return readdirSync(dir, { recursive: true }).sort().join("\n"); }
const runArgv = (text) => {
  const match = REPAIR_RE.exec(text);
  assert.ok(match, `the refusal names the repair argv:\n${text}`);
  assert.equal(match[1], gateScript, "the argv names the physical plugin script");
  return { root: match[2], run: () => spawnSync(process.execPath, [match[1], "--root", match[2]], { encoding: "utf8", timeout: 20_000 }) };
};

test("C9 critical + no security gate (no manifest, no gates.security, mode off) is a typed block at Verify and at the close entry, naming the repair argv", async () => {
  const variants = { "no manifest": null, "no gates.security": WITHOUT_SECURITY, "mode off": MODE_OFF };
  for (const [label, manifest] of Object.entries(variants)) {
    const dir = project("critical");
    if (manifest !== null) put(dir, ".claude/pipeline.yaml", manifest);
    const verify = await verifyCheck(dir);
    assert.equal(verify.code, 1, label);
    assert.match(verify.text, /SEC-CLOSE-GATE-NOT-CONFIGURED/u, label);
    assert.equal(runArgv(verify.text).root, dir, label);

    const fixture = closeFixture({ stakes: "critical" });
    if (manifest !== null) { put(fixture.dir, ".claude/pipeline.yaml", manifest); }
    const closed = runClose(fixture.dir);
    assert.equal(closed.status, 2, `${label}: ${closed.stdout}${closed.stderr}`);
    assert.match(closed.stderr, /SEC-CLOSE-GATE-NOT-CONFIGURED/u, label);
    assert.equal(runArgv(closed.stderr).root, fixture.dir, label);
  }
});

test("C10 the repair argv configures the gate, changes no other byte, is a no-op the second time, and the same Verify then reaches the scanners", async () => {
  const cases = [
    ["no manifest", null, `${HEADER}gates:\n${BLOCK()}`],
    ["gates without security", WITHOUT_SECURITY, `${WITHOUT_SECURITY}${BLOCK()}`],
    ["security mode off", MODE_OFF, MODE_OFF.replace("    mode: off   # not yet\n", "    mode: blocking   # not yet\n")],
    ["no gates block, trailing comment", `${HEADER}language:\n  human_facing: en\n# end\n`, `${HEADER}language:\n  human_facing: en\n# end\ngates:\n${BLOCK()}`],
    ["CRLF file", WITHOUT_SECURITY.replace(/\n/gu, "\r\n"), `${WITHOUT_SECURITY.replace(/\n/gu, "\r\n")}${BLOCK("\r\n")}`],
    ["no final newline", WITHOUT_SECURITY.trimEnd(), `${WITHOUT_SECURITY}${BLOCK()}`],
  ];
  for (const [label, before, after] of cases) {
    const dir = project("critical");
    if (before !== null) put(dir, ".claude/pipeline.yaml", before);
    const { run } = runArgv((await verifyCheck(dir)).text);
    const first = run();
    assert.equal(first.status, 0, `${label}: ${first.stdout}${first.stderr}`);
    assert.equal(readFileSync(join(dir, ".claude/pipeline.yaml"), "utf8"), after, label);
    const loaded = loadManifest(dir);
    assert.equal(loaded.status, "ok", `${label}: ${JSON.stringify(loaded.errors)}`);
    assert.deepEqual([gateConfig(loaded.manifest, "security").mode, gateConfig(loaded.manifest, "security").type], ["blocking", "automated"], label);
    const second = run();
    assert.equal(second.status, 0, label);
    assert.match(second.stdout, /already configured/u, label);
    assert.equal(readFileSync(join(dir, ".claude/pipeline.yaml"), "utf8"), after, `${label}: second run changed bytes`);
    const reverify = await verifyCheck(dir);
    assert.doesNotMatch(reverify.text, /SEC-CLOSE-GATE-NOT-CONFIGURED/u, label);
    assert.match(reverify.text, /SEC-CLOSE-SCANNER-NOT-EXECUTED/u, `${label}: the scanner chain now runs`);
  }
});

test("C11 standard, absent and unrecognised stakes with no gate stay not applicable and admitted (Verify and close entry)", async () => {
  for (const stakes of ["standard", undefined, "whatever"]) {
    const verify = await verifyCheck(project(stakes));
    assert.equal(verify.code, 0, String(stakes));
    assert.match(verify.text, /not applicable/u, String(stakes));
    assert.doesNotMatch(verify.text, /SEC-CLOSE-GATE-NOT-CONFIGURED/u, String(stakes));
    const fixture = closeFixture({ stakes });
    const closed = runClose(fixture.dir);
    assert.equal(closed.status, 0, `${stakes}: ${closed.stderr}`);
    assert.match(closed.stdout, /not applicable/u, String(stakes));
  }
});

test("C12 a refused repair leaves every byte and the directory unchanged; twin manifests stay identical; the block is the one onboarding writes", async () => {
  const refused = {
    "unparseable yaml": `${HEADER}gates: [\n`,
    "flow-style gates": `${HEADER}gates: {}\n`,
    "flow-style security": `${HEADER}gates:\n  security: {mode: off, type: automated}\n`,
    "schema violation": `${HEADER}gates:\n  security:\n    mode: off\n`,
  };
  for (const [label, text] of Object.entries(refused)) {
    const dir = project("critical");
    put(dir, ".claude/pipeline.yaml", text);
    const before = listing(dir);
    const result = spawnSync(process.execPath, [gateScript, "--root", dir], { encoding: "utf8", timeout: 20_000 });
    assert.equal(result.status, 1, `${label}: ${result.stdout}${result.stderr}`);
    assert.ok(result.stderr.length > 0, label);
    assert.equal(readFileSync(join(dir, ".claude/pipeline.yaml"), "utf8"), text, label);
    assert.equal(listing(dir), before, `${label}: a refused repair leaves no state`);
  }
  for (const argv of [[], ["--root"], ["--root", "relative/path"], ["--root", project("critical"), "--extra"]]) {
    const result = spawnSync(process.execPath, [gateScript, ...argv], { encoding: "utf8", timeout: 20_000 });
    assert.equal(result.status, 1, argv.join(" "));
  }
  const twin = project("critical");
  put(twin, ".claude/pipeline.yaml", WITHOUT_SECURITY);
  put(twin, "project/pipeline.yaml", WITHOUT_SECURITY);
  assert.equal(spawnSync(process.execPath, [gateScript, "--root", twin], { encoding: "utf8", timeout: 20_000 }).status, 0);
  const [neutral, legacy] = ["project/pipeline.yaml", ".claude/pipeline.yaml"].map((rel) => readFileSync(join(twin, rel), "utf8"));
  assert.equal(neutral, legacy, "the twin pair must not drift (PA-MANIFEST-DRIFT)");
  assert.equal(neutral, `${WITHOUT_SECURITY}${BLOCK()}`);
  const { freshGateChapter } = await import("../project-onboarding-v3.mjs");
  assert.ok(freshGateChapter().endsWith(BLOCK()), "the security block is the one onboarding writes for a new project");
  const { SECURITY_GATE_BLOCK } = await import("../../scripts/security-gate-configure.mjs");
  assert.equal(SECURITY_GATE_BLOCK, BLOCK());
});

// ---- C13-C19 (Candidate 21h, CGF-05, AC-108; PO decision 2026-11-09): in a critical calibration a SKIPPED scanner blocks the close unless a
// named, expiring exception was recorded beforehand. Written from the decision text, not from the code: `not applicable` keeps its reason,
// every other calibration reads exactly as before, the exception only answers "did not run" (never findings), every applied exception is
// shown and reads differently from `passed`, and the refusal names both ways out (install/configure, or the exact exception file and shape).
const EXCEPTIONS_PATH = "project/security-scanner-exceptions.json";
const EXCEPTIONS_SCHEMA = "pipeline.security-scanner-exceptions.v1";
const FUTURE = "2999-01-01T00:00:00Z";
const PAST = "2000-01-01T00:00:00Z";
const exception = (over = {}) => ({ scanner: "license-check", reason: "no licence policy is declared for this internal tool", expires: FUTURE, confirmedBy: "chat-2026-11-09", ...over });
// "Recorded beforehand" is enforced: only a file HEAD holds admits anything, so a fixture commits it.
const commitExceptions = (dir) => {
  const git = (...args) => spawnSync("git", ["-C", dir, ...args], { encoding: "utf8" });
  git("init", "-q");
  git("config", "user.name", "Fixture Author");
  git("config", "user.email", "fixture@example.invalid");
  git("add", "--", EXCEPTIONS_PATH);
  git("commit", "-q", "-m", "record the exceptions");
};
const writeExceptions = (dir, entries, schema = EXCEPTIONS_SCHEMA) => { writeJson(dir, EXCEPTIONS_PATH, { schema, exceptions: entries }); commitExceptions(dir); };
// A clean capability scan (gitleaks passed) whose license-check control was skipped: license-check is a control, so the real scan records it
// in the verdict document's `controls`, never in the envelope's `capabilities`.
function licenseSkipped(dir) {
  evidence(dir, { status: "PASS", classification: "success", outcome: "pass" });
  const verdictPath = join(dir, "evidence/security-latest.v2.verdict.json");
  const doc = JSON.parse(readFileSync(verdictPath, "utf8"));
  doc.controls = [{ control: "license-check", tool: "license-check", capabilityId: null, controlRef: null, required: false, status: "SKIPPED", classification: "success", runOutcome: "not-applicable", controlResult: "not-applicable", reason: "no license policy configured" }];
  writeFileSync(verdictPath, JSON.stringify(doc));
}
const gateFailures = (dir) => checkSecurityCompleteness({ projectDir: dir, commit: HEAD, tree: TREE });

test("C13 critical + a skipped license-check is a typed block that names both ways out; standard stays admitted", () => {
  const dir = project("critical");
  licenseSkipped(dir);
  const failures = gateFailures(dir);
  assert.equal(failures.length, 1, failures.join("\n"));
  assert.match(failures[0], /SEC-CLOSE-SCANNER-NOT-EXECUTED/u);
  assert.match(failures[0], /license-check/u);
  assert.match(failures[0], /Install license-check|configure license-check/u, "way 1: install or configure the scanner");
  assert.match(failures[0], /node <plugin-root>\/scripts\/security-scan\.mjs/u);
  assert.match(failures[0], /project\/security-scanner-exceptions\.json/u, "way 2: the exact exception file");
  for (const word of ["pipeline.security-scanner-exceptions.v1", "scanner", "reason", "expires", "confirmedBy", "before the candidate"]) assert.ok(failures[0].includes(word), word);
  const standard = project("standard");
  licenseSkipped(standard);
  assert.deepEqual(gateFailures(standard), []);
});

test("C13b the state reading: critical turns a skipped license-check into not executed; no package sources stays not applicable with its reason", () => {
  const list = scanners(["license-check", "SKIPPED", "success"], ["osv-scanner", "SKIPPED", "success"]).map((s) => ({ ...s, reason: `${s.tool} reason` }));
  const critical = Object.fromEntries(securityCloseElements({ scanners: list, critical: true }).map((e) => [e.element, e]));
  assert.equal(critical["license-check"].state, "not executed");
  assert.equal(critical["osv-scanner"].state, "not applicable");
  assert.equal(critical["osv-scanner"].reason, "osv-scanner reason");
  const standard = Object.fromEntries(securityCloseElements({ scanners: list }).map((e) => [e.element, e.state]));
  assert.equal(standard["license-check"], "not applicable", "non-critical reads exactly as before");
});

test("C14 a valid named exception lets that one scanner pass the critical gate and is shown, never as passed", async () => {
  const { readScannerExceptions } = await import("../security-close-status.mjs");
  const dir = project("critical");
  licenseSkipped(dir);
  writeExceptions(dir, [exception()]);
  assert.deepEqual(gateFailures(dir), []);
  const read = readScannerExceptions(dir);
  assert.equal(read.valid.length, 1);
  const lines = formatSecurityCloseStatus(securityCloseElements({ scanners: scanners(["license-check", "SKIPPED", "success"]), critical: true, exceptions: read })).filter((l) => l.startsWith("license-check"));
  assert.equal(lines.length, 1);
  assert.match(lines[0], /license-check: not executed/u);
  for (const text of ["named exception", "no licence policy is declared for this internal tool", FUTURE, "chat-2026-11-09"]) assert.ok(lines[0].includes(text), text);
  assert.doesNotMatch(lines[0], /: (passed|ok)\b/iu);
  // The exception covers only the scanner it names: a second skipped scanner is still refused.
  const second = project("critical");
  evidence(second, { status: "SKIPPED", classification: "binary_missing", outcome: "not-applicable" });
  writeExceptions(second, [exception()]);
  const refused = gateFailures(second);
  assert.equal(refused.length, 1, refused.join("\n"));
  assert.match(refused[0], /gitleaks/u);
  writeExceptions(second, [exception({ scanner: "gitleaks" })]);
  assert.deepEqual(gateFailures(second), [], "a capability scanner is covered by its own entry");
});

test("C14b a scanner the capability plan marks required is covered by its own exception too, and still blocks without one", () => {
  const dir = project("critical");
  evidence(dir, { status: "SKIPPED", classification: "binary_missing", outcome: "required-capability-missing", blocking: true, optional: false });
  const blocked = gateFailures(dir);
  assert.ok(blocked.some((f) => /SEC-CLOSE-SCANNER-NOT-EXECUTED/u.test(f)), blocked.join("\n"));
  writeExceptions(dir, [exception({ scanner: "gitleaks" })]);
  assert.deepEqual(gateFailures(dir), []);
  const standard = project("standard");
  evidence(standard, { status: "SKIPPED", classification: "binary_missing", outcome: "required-capability-missing", blocking: true, optional: false });
  writeExceptions(standard, [exception({ scanner: "gitleaks" })]);
  assert.equal(gateFailures(standard).length, 1, "outside the critical profile the exception file changes nothing");
});

test("C15 an expired, malformed or unknown entry is ignored for admission and named in the refusal", () => {
  const cases = [
    ["expired", exception({ expires: PAST }), /expired/u],
    ["unknown scanner", exception({ scanner: "trivy" }), /unknown scanner/u],
    ["reason too long", exception({ reason: "x".repeat(501) }), /500/u],
    ["blank reason", exception({ reason: "   " }), /reason/u],
    ["missing confirmedBy", exception({ confirmedBy: undefined }), /confirmedBy/u],
    ["bad expires", exception({ expires: "tomorrow" }), /expires/u],
  ];
  for (const [label, entry, word] of cases) {
    const dir = project("critical");
    licenseSkipped(dir);
    writeExceptions(dir, [entry]);
    const failures = gateFailures(dir);
    assert.equal(failures.length, 1, `${label}: ${failures.join("\n")}`);
    assert.match(failures[0], /SEC-CLOSE-SCANNER-NOT-EXECUTED/u, label);
    assert.match(failures[0], word, `${label}: the refusal names why the entry was ignored`);
  }
  const wrongSchema = project("critical");
  licenseSkipped(wrongSchema);
  writeExceptions(wrongSchema, [exception()], "pipeline.security-scanner-exceptions.v0");
  assert.match(gateFailures(wrongSchema)[0], /schema/u);
  const notJson = project("critical");
  licenseSkipped(notJson);
  put(notJson, EXCEPTIONS_PATH, "{ not json");
  commitExceptions(notJson);
  assert.match(gateFailures(notJson)[0], /JSON/u);
  // One bad entry does not poison a good one.
  const mixed = project("critical");
  licenseSkipped(mixed);
  writeExceptions(mixed, [exception({ expires: PAST }), exception()]);
  assert.deepEqual(gateFailures(mixed), []);
});

test("C16 a scanner that ran and reported findings is never covered by an exception", () => {
  const dir = project("critical");
  evidence(dir, { status: "FINDINGS", classification: "findings", outcome: "findings", blocking: true, optional: false });
  const without = gateFailures(dir);
  assert.equal(without.length, 1, without.join("\n"));
  writeExceptions(dir, [exception({ scanner: "gitleaks" })]);
  assert.deepEqual(gateFailures(dir), without, "the exception changes nothing for a scanner that ran");
  const elements = securityCloseElements({ scanners: scanners(["gitleaks", "FINDINGS", "findings"]), critical: true, exceptions: { valid: [exception({ scanner: "gitleaks" })], rejected: [] } });
  const gitleaks = elements.find((e) => e.element === "gitleaks");
  assert.equal(gitleaks.state, "failed");
  assert.ok(!formatSecurityCloseStatus([gitleaks]).join("").includes("named exception"));
});

test("C17 the close.pre entry point: critical + skipped license-check exits 2; with a valid exception it exits 0, prints the exception and never GREEN", () => {
  const closeLicense = (stakes, exceptionEntries) => {
    const fixture = closeFixture({ gate: "blocking", stakes });
    // The exception is committed before the scan evidence is bound to HEAD, as a real close orders them.
    if (exceptionEntries) writeExceptions(fixture.dir, exceptionEntries);
    const rev = (ref) => spawnSync("git", ["-C", fixture.dir, "rev-parse", ref], { encoding: "utf8" }).stdout.trim();
    licenseSkipped(fixture.dir);
    const envelopePath = join(fixture.dir, "evidence/security-latest.v2.json");
    const envelope = JSON.parse(readFileSync(envelopePath, "utf8"));
    envelope.input.commit = rev("HEAD");
    envelope.input.tree = rev("HEAD^{tree}");
    writeFileSync(envelopePath, JSON.stringify(envelope));
    // The scan lists every scanner the project enables; only license-check was skipped (osv-scanner found no package sources).
    writeJson(fixture.dir, "evidence/security-latest.json", { scanners: [
      { tool: "gitleaks", status: "PASS", classification: "success" }, { tool: "osv-scanner", status: "SKIPPED", classification: "success", reason: "no package sources in project" },
      { tool: "semgrep", status: "PASS", classification: "success" }, { tool: "license-check", status: "SKIPPED", classification: "success", reason: "no license policy configured" },
    ] });
    return runClose(fixture.dir);
  };
  const refused = closeLicense("critical", null);
  assert.equal(refused.status, 2, refused.stdout + refused.stderr);
  assert.match(refused.stderr, /SEC-CLOSE-SCANNER-NOT-EXECUTED/u);
  assert.match(refused.stderr, /license-check/u);
  const admitted = closeLicense("critical", [exception()]);
  assert.equal(admitted.status, 0, admitted.stdout + admitted.stderr);
  assert.match(admitted.stdout, /license-check: not executed/u);
  for (const text of ["named exception", "no licence policy is declared for this internal tool", FUTURE, "chat-2026-11-09"]) assert.ok(admitted.stdout.includes(text), text);
  assert.match(admitted.stdout, /NAMED EXCEPTION/u);
  assert.doesNotMatch(admitted.stdout, /GREEN/u);
  assert.doesNotMatch(admitted.stdout, /license-check: (passed|ok)\b/iu);
  const standard = closeLicense("standard", null);
  assert.equal(standard.status, 0, standard.stdout + standard.stderr);
  assert.match(standard.stdout, /license-check: not applicable/u);
});

test("C18 the Verify security check and the scan summary apply the same reading and show each applied exception", async () => {
  const { runSecurityCloseCheck } = await import("../../scripts/security-close-check.mjs");
  const { deriveSummaryVerdict } = await import("../../scripts/security-scan.mjs");
  const gateFile = "schema: pipeline.manifest.v0\ngates:\n  security:\n    mode: blocking\n    type: automated\n";
  const make = (stakes) => { const root = project(stakes); put(root, ".claude/pipeline.yaml", gateFile); return root; };
  const run = (root) => {
    const lines = [];
    const log = console.log; const error = console.error;
    console.log = (...a) => lines.push(a.join(" ")); console.error = (...a) => lines.push(a.join(" "));
    try { return { code: runSecurityCloseCheck(root, { PATH: "", Path: "", HOME: root }), text: lines.join("\n") }; } finally { console.log = log; console.error = error; }
  };
  // No scanner binary on this PATH: gitleaks, osv-scanner and semgrep did not execute, and license-check has no policy (skipped).
  const bare = run(make("critical"));
  assert.equal(bare.code, 1);
  assert.match(bare.text, /license-check/u, "the skipped license-check is refused in the Verify path too");
  assert.match(bare.text, /project\/security-scanner-exceptions\.json/u);
  const all = make("critical");
  writeExceptions(all, ["gitleaks", "osv-scanner", "semgrep", "license-check"].map((scanner) => exception({ scanner })));
  const admitted = run(all);
  assert.equal(admitted.code, 0, admitted.text);
  const partial = make("critical");
  writeExceptions(partial, ["gitleaks", "osv-scanner", "semgrep"].map((scanner) => exception({ scanner })));
  const stillRefused = run(partial);
  assert.equal(stillRefused.code, 1);
  assert.match(stillRefused.text, /license-check/u);
  // The scan's own summary reads a skipped license-check as an incomplete scan in a critical project only.
  const skippedEvidence = { exitCode: 0, scanners: [{ tool: "license-check", status: "SKIPPED", classification: "success", reportStatus: "not-configured" }] };
  assert.equal(deriveSummaryVerdict(skippedEvidence), "NOT CONFIGURED");
  assert.equal(deriveSummaryVerdict(skippedEvidence, { critical: true }), "INCOMPLETE");
  // The real CLI prints the status lines with the exception applied.
  const cli = make("critical");
  writeExceptions(cli, [exception()]);
  // Git's own exec directory: the exception check needs git, and no scanner lives there.
  const gitOnly = spawnSync("git", ["--exec-path"], { encoding: "utf8" }).stdout.trim();
  const res = spawnSync(process.execPath, [scanScript, "--root", cli, "--timeout-ms", "5000"], { encoding: "utf8", shell: false, env: { HOME: cli, USERPROFILE: cli, SystemRoot: process.env.SystemRoot ?? "", PATH: gitOnly, Path: gitOnly } });
  assert.match(res.stdout, /^ {2}license-check: not executed.*named exception.*chat-2026-11-09/mu, res.stdout + res.stderr);
  const plain = make("standard");
  const plainRes = spawnSync(process.execPath, [scanScript, "--root", plain, "--timeout-ms", "5000"], { encoding: "utf8", shell: false, env: { HOME: plain, USERPROFILE: plain, SystemRoot: process.env.SystemRoot ?? "", PATH: "", Path: "" } });
  assert.match(plainRes.stdout, /^ {2}license-check: not applicable/mu, plainRes.stdout + plainRes.stderr);
});

test("C20 recorded beforehand is enforced: an exception HEAD does not hold admits nothing and the refusal says why; line endings are not a change", () => {
  const dir = project("critical");
  licenseSkipped(dir);
  const path = join(dir, EXCEPTIONS_PATH);
  writeJson(dir, EXCEPTIONS_PATH, { schema: EXCEPTIONS_SCHEMA, exceptions: [exception()] });
  writeFileSync(path, JSON.stringify(JSON.parse(readFileSync(path, "utf8")), null, 2));
  const uncommitted = gateFailures(dir);
  assert.equal(uncommitted.length, 1, uncommitted.join("\n"));
  assert.match(uncommitted[0], /SEC-CLOSE-SCANNER-NOT-EXECUTED/u);
  assert.match(uncommitted[0], /not committed at HEAD/u);
  commitExceptions(dir);
  assert.deepEqual(gateFailures(dir), []);
  const bytes = readFileSync(path, "utf8");
  writeFileSync(path, bytes.replace(/\n/gu, "\r\n"));
  assert.deepEqual(gateFailures(dir), [], "a CRLF checkout of the committed file is the committed file");
  writeFileSync(path, bytes.replace("no licence policy", "a different reason, no licence policy"));
  const changed = gateFailures(dir);
  assert.equal(changed.length, 1, changed.join("\n"));
  assert.match(changed[0], /changed since the last commit/u);
});

test("C21 a missing scanner is named before the signature: critical refuses, others get a notice, host-boundary states and valid exceptions stop nothing", async () => {
  const { scannerEntryReadiness } = await import("../security-close-status.mjs");
  const report = (...rows) => ({ results: [{ tool: "node", status: "binary_missing" }, ...rows.map(([tool, status]) => ({ tool, status, guidance: `install ${tool}` }))] });
  const critical = scannerEntryReadiness(report(["gitleaks", "binary_missing"], ["license-check", "input_missing"], ["semgrep", "ready"], ["osv-scanner", "not_required"]), { critical: true });
  assert.deepEqual(critical.notices, []);
  assert.equal(critical.refusals.length, 2, "node is the toolchain's own concern; ready and not_required are nothing to say");
  assert.equal(critical.refusals[0].code, "SEC-CLOSE-SCANNER-NOT-EXECUTED");
  assert.match(critical.refusals[0].text, /gitleaks/u);
  assert.match(critical.refusals[0].text, /install gitleaks/u, "the installation guidance is in the refusal");
  assert.match(critical.refusals[0].text, /project\/security-scanner-exceptions\.json/u, "and so is the exception route");
  for (const status of ["execution_environment", "probe_timeout", "probe_error"]) {
    const { refusals, notices } = scannerEntryReadiness(report(["gitleaks", status]), { critical: true });
    assert.deepEqual([refusals, notices], [[], []], `${status}: a check that could not look stops nothing`);
  }
  const excepted = scannerEntryReadiness(report(["gitleaks", "binary_missing"]), { critical: true, exceptions: { valid: [exception({ scanner: "gitleaks" })], rejected: [] } });
  assert.deepEqual(excepted.refusals, []);
  const standard = scannerEntryReadiness(report(["gitleaks", "binary_missing"]), { critical: false });
  assert.deepEqual(standard.refusals, []);
  assert.equal(standard.notices.length, 1);
  assert.match(standard.notices[0], /gitleaks.*binary_missing/u);
  assert.deepEqual(scannerEntryReadiness(null, { critical: true }), { refusals: [], notices: [] });
});

test("C19 the close quality readback names an applied exception in its security evidence", async () => {
  const { closeQualityReadback } = await import("../close-quality-readback.mjs");
  const files = {
    "evidence/security-latest.json": JSON.stringify({ scanners: [{ tool: "gitleaks", status: "PASS", classification: "success" }, { tool: "license-check", status: "SKIPPED", classification: "success" }] }),
    "project/pipeline.json": JSON.stringify({ stakes: "critical" }),
    [EXCEPTIONS_PATH]: JSON.stringify({ schema: EXCEPTIONS_SCHEMA, exceptions: [exception()] }),
  };
  const readers = { exists: (p) => p.startsWith("evidence/security-latest.v2"), readBytes: (p) => { if (!(p in files)) throw new Error("absent"); return Buffer.from(files[p]); }, listDir: () => [] };
  const row = closeQualityReadback({ root: "<root>", featureId: "feature", readers }).find((r) => r.id === "security-scan");
  assert.equal(row.status, "present");
  assert.match(row.evidence, /license-check: not executed/u);
  assert.ok(row.evidence.includes("named exception") && row.evidence.includes("chat-2026-11-09"), row.evidence);
  const noException = closeQualityReadback({ root: "<root>", featureId: "feature", readers: { ...readers, readBytes: (p) => { if (p === EXCEPTIONS_PATH || !(p in files)) throw new Error("absent"); return Buffer.from(files[p]); } } }).find((r) => r.id === "security-scan");
  assert.match(noException.evidence, /license-check: not executed/u);
  assert.ok(!noException.evidence.includes("named exception"));
});

// C28 (AC-108, PO decisions 2026-11-10 on the greenfield reports): honest not-run states, warnings with a next step, and the declared
// requirement. Acceptance, written from the criterion and the PO decision, not from the code:
//   C22 a scan that ran on a dirty worktree or with zero loaded rules is never counted as a result: it reads "not executed" with its reason,
//       in the elements, in the scan verdict, and in the scope the close prints; a finding is never hidden by it;
//   C23 a skipped (also a not-configured license check) or partial capability is a WARNING that names what would run it; a passed one,
//       "no package sources" and an excepted one raise none; the close entry prints it and never prints GREEN;
//   C24 a capability the project declared in security.required_capabilities that has no scanner, loaded zero rules or did not run is
//       refused with a typed code naming the capability, the scanner and the install or run step; the same state without a declaration
//       stays a warning; a gate that is off or absent does not hide the declaration;
//   C25 the Verify security check applies the same declared reading.
const gateManifest = (required = null, mode = "blocking") => `schema: pipeline.manifest.v0\ngates:\n  security:\n    mode: ${mode}\n    type: automated\n${required ? `security:\n  required_capabilities:\n${required.map((c) => `    - ${c}\n`).join("")}` : ""}`;
function declaredClose({ required = null, mode = "blocking", scannerList, stakes = "standard" }) {
  const fixture = closeFixture({ gate: "blocking", stakes });
  writeFileSync(join(fixture.dir, ".claude/pipeline.yaml"), gateManifest(required, mode));
  evidence(fixture.dir, { status: "PASS", classification: "success", outcome: "pass" });
  const envelopePath = join(fixture.dir, "evidence/security-latest.v2.json");
  const envelope = JSON.parse(readFileSync(envelopePath, "utf8"));
  envelope.input.commit = fixture.commit;
  envelope.input.tree = fixture.tree;
  writeFileSync(envelopePath, JSON.stringify(envelope));
  writeJson(fixture.dir, "evidence/security-latest.json", { scanners: scannerList });
  return fixture.dir;
}
const pass = (tool) => ({ tool, status: "PASS", classification: "success" });
const skippedLicenseEntry = { tool: "license-check", status: "SKIPPED", classification: "success", reason: "no license policy or declaration is configured" };
// A real scan lists every scanner the project enables, so the close fixtures do too (a missing entry then reads "not executed").
const fullScan = (over = {}) => ["gitleaks", "osv-scanner", "semgrep", "license-check"].map((tool) => over[tool] ?? pass(tool));
const noSourcesEntry = { tool: "osv-scanner", status: "SKIPPED", classification: "success", reason: "no package sources in project" };
const notRunSemgrep = { tool: "semgrep", status: "PASS", classification: "success", reportStatus: "not-run", notRun: "zero-rules", reason: "semgrep loaded zero rules from the configured rule set; a scan without rules is not a result" };

test("C22 a PASS on a dirty worktree or with zero loaded rules is marked not-run with its reason; findings, skips and real scans are untouched", () => {
  assert.equal(typeof statusLib.markNotRunScans, "function");
  const rules = (ruleCount) => ({ ruleCount, ruleIds: [] });
  const list = [
    { tool: "gitleaks", status: "PASS", classification: "success" },
    { tool: "osv-scanner", status: "FINDINGS", classification: "findings" },
    { tool: "license-check", status: "SKIPPED", classification: "success" },
    { tool: "semgrep", status: "PASS", classification: "success", ruleSet: rules(0) },
  ];
  const dirty = statusLib.markNotRunScans(structuredClone(list), { candidateUncertain: true });
  assert.deepEqual(dirty.map((e) => e.reportStatus), ["not-run", undefined, undefined, "not-run"]);
  assert.match(dirty[0].reason, /dirty|unbound/u);
  assert.equal(dirty[0].notRun, "dirty-worktree");
  assert.equal(dirty[3].notRun, "dirty-worktree"); // the worktree reason is named first; both are honest
  const clean = statusLib.markNotRunScans(structuredClone(list), { candidateUncertain: false });
  assert.deepEqual(clean.map((e) => e.reportStatus), [undefined, undefined, undefined, "not-run"]);
  assert.equal(clean[3].notRun, "zero-rules");
  assert.match(clean[3].reason, /zero rules/u);
  const real = statusLib.markNotRunScans([{ tool: "semgrep", status: "PASS", classification: "success", ruleSet: rules(9) }], { candidateUncertain: false });
  assert.equal(real[0].reportStatus, undefined);
  const elements = securityCloseElements({ scanners: clean });
  const state = Object.fromEntries(elements.map((e) => [e.element, e.state]));
  assert.equal(state.semgrep, "not executed");
  assert.match(elements.find((e) => e.element === "semgrep").reason, /zero rules/u);
  assert.equal(state["osv-scanner"], "failed");
});

test("C22b the scan verdict and the close scope never read a not-run scan as clean or as having run", async () => {
  const { deriveSummaryVerdict } = await import("../../scripts/security-scan.mjs");
  const evidenceOf = (scannerList) => ({ exitCode: 0, scanners: scannerList });
  assert.equal(deriveSummaryVerdict(evidenceOf([pass("gitleaks"), { ...pass("semgrep"), reportStatus: "not-run" }])), "PARTIAL");
  assert.equal(deriveSummaryVerdict(evidenceOf([{ ...pass("semgrep"), reportStatus: "not-run" }])), "INCOMPLETE");
  assert.equal(deriveSummaryVerdict(evidenceOf([pass("gitleaks"), pass("semgrep")])), "CLEAN");
});

test("C23 warnings: a skipped, not-configured or partial capability is a WARNING naming what would run it; passed, no-package-sources and excepted raise none", () => {
  assert.equal(typeof statusLib.securityCloseWarnings, "function");
  const elements = securityCloseElements({
    scanners: [
      pass("gitleaks"),
      { tool: "osv-scanner", status: "SKIPPED", classification: "binary_missing", reason: "osv-scanner not found on PATH" },
      { tool: "semgrep", status: "PASS", classification: "success", coverage: { status: "degraded", reason: "partial-parsing", files: ["a.js", "b.js"] } },
      skippedLicenseEntry,
    ],
  });
  const warnings = statusLib.securityCloseWarnings(elements);
  assert.equal(warnings.length, 3, warnings.join("\n"));
  for (const line of warnings) assert.match(line, /^WARNING: /u);
  assert.ok(warnings.some((l) => /osv-scanner/u.test(l) && /toolchain-preflight\.mjs/u.test(l) && /security-scan\.mjs/u.test(l)), warnings.join("\n"));
  assert.ok(warnings.some((l) => /semgrep/u.test(l) && /partial/u.test(l) && /2 file/u.test(l)), warnings.join("\n"));
  assert.ok(warnings.some((l) => /license-check/u.test(l) && /third-party-licenses\.json/u.test(l)), warnings.join("\n"));
  assert.ok(!warnings.some((l) => /gitleaks/u.test(l)));
  const noSources = statusLib.elementsOfCompletedScan([pass("gitleaks"), { tool: "osv-scanner", status: "SKIPPED", classification: "success", reason: "no package sources in project" }]);
  assert.deepEqual(statusLib.securityCloseWarnings(noSources), []);
  const excepted = securityCloseElements({ scanners: [skippedLicenseEntry], critical: true, exceptions: { valid: [{ scanner: "license-check", reason: "r", expires: "2999-01-01", confirmedBy: "c" }], rejected: [] } });
  assert.ok(!statusLib.securityCloseWarnings(excepted).some((l) => /license-check/u.test(l)));
  const dirty = securityCloseElements({ scanners: [{ tool: "gitleaks", status: "PASS", classification: "success", reportStatus: "not-run", notRun: "dirty-worktree", reason: "the scan ran on a dirty or unbound worktree" }] });
  assert.ok(statusLib.securityCloseWarnings(dirty).some((l) => /gitleaks/u.test(l) && /commit or stash/u.test(l)));
});

test("C22c the scan summary itself prints a WARNING with the next step for every scanner that did not run (no scanner on PATH)", () => {
  const root = project("standard");
  mkdirSync(join(root, "scratch"), { recursive: true });
  const run = spawnSync(process.execPath, [scanScript, "--root", root, "--out-dir", "scratch/analysis"], { encoding: "utf8", timeout: 50_000, env: { PATH: "", Path: "", HOME: root } });
  // The fixture's license-check is the one scanner without a binary: it is skipped on every machine, whatever scanners are installed there.
  assert.match(run.stdout, /WARNING: license-check was skipped/u, `${run.stdout}\n${run.stderr}`);
  assert.match(run.stdout, /Next step: .*third-party-licenses\.json.*security-scan\.mjs/u);
  assert.doesNotMatch(run.stdout, /Verdict: CLEAN/u);
});

test("C23b the close entry prints each warning and never GREEN: a skipped license check reads ADMITTED WITH WARNINGS, not complete", () => {
  const dir = declaredClose({ scannerList: fullScan({ "license-check": skippedLicenseEntry, "osv-scanner": noSourcesEntry }) });
  const run = runClose(dir);
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /WARNING: license-check/u);
  assert.match(run.stdout, /third-party-licenses\.json/u);
  assert.doesNotMatch(run.stdout, /GREEN/u);
  assert.match(run.stdout, /ADMITTED WITH WARNINGS/u);
  const clean = runClose(declaredClose({ scannerList: fullScan() }));
  assert.equal(clean.status, 0, clean.stderr);
  assert.match(clean.stdout, /GREEN/u);
  assert.doesNotMatch(clean.stdout, /WARNING/u);
});

test("C24 a declared capability that has no scanner, loaded zero rules or did not run is refused with a typed code; undeclared stays a warning", () => {
  assert.equal(typeof statusLib.declaredSecurityCapabilities, "function");
  assert.deepEqual(statusLib.declaredSecurityCapabilities({ security: { required_capabilities: ["secrets", "sast", "sast", "bogus"] } }), ["secrets", "sast"]);
  assert.deepEqual(statusLib.declaredSecurityCapabilities(null), []);
  const declared = ["secrets", "license"];
  const refused = runClose(declaredClose({ required: declared, scannerList: fullScan({ "license-check": skippedLicenseEntry }) }));
  assert.equal(refused.status, 2);
  assert.match(refused.stderr, /SEC-CLOSE-REQUIRED-CAPABILITY-NOT-RUN/u);
  assert.match(refused.stderr, /license/u);
  assert.match(refused.stderr, /license-check/u);
  assert.match(refused.stderr, /security-scan\.mjs/u);
  assert.doesNotMatch(refused.stderr, /secrets/u);
  const missing = runClose(declaredClose({ required: ["sast"], scannerList: fullScan().filter((entry) => entry.tool !== "semgrep") })); // no semgrep entry at all
  assert.equal(missing.status, 2);
  assert.match(missing.stderr, /SEC-CLOSE-REQUIRED-CAPABILITY-NOT-RUN.*sast|sast.*semgrep/su);
  const zero = runClose(declaredClose({ required: ["sast"], scannerList: fullScan({ semgrep: notRunSemgrep }) }));
  assert.equal(zero.status, 2);
  assert.match(zero.stderr, /zero rules/u);
  const sca = runClose(declaredClose({ required: ["sca"], scannerList: fullScan({ "osv-scanner": noSourcesEntry }) }));
  assert.equal(sca.status, 0, sca.stderr); // nothing to scan is the honest reading of "no package sources"
  const met = runClose(declaredClose({ required: ["secrets", "sast"], scannerList: fullScan() }));
  assert.equal(met.status, 0, met.stderr);
  assert.match(met.stdout, /GREEN/u);
  const undeclared = runClose(declaredClose({ scannerList: fullScan({ semgrep: notRunSemgrep }) }));
  assert.equal(undeclared.status, 0, undeclared.stderr);
  assert.match(undeclared.stdout, /WARNING: semgrep/u);
  assert.doesNotMatch(undeclared.stdout, /GREEN/u);
});

test("C24b a declared capability is not hidden by a gate that is off or absent from the manifest", () => {
  for (const mode of ["off"]) {
    const run = runClose(declaredClose({ required: ["secrets"], mode, scannerList: [pass("gitleaks")] }));
    assert.equal(run.status, 2, `${mode}: ${run.stdout}${run.stderr}`);
    assert.match(run.stderr, /SEC-CLOSE-REQUIRED-CAPABILITY-NOT-RUN/u);
    assert.match(run.stderr, /gates\.security/u);
  }
  const noGate = closeFixture({ gate: "blocking", stakes: "standard" });
  writeFileSync(join(noGate.dir, ".claude/pipeline.yaml"), "schema: pipeline.manifest.v0\nsecurity:\n  required_capabilities:\n    - sast\n");
  const run = runClose(noGate.dir);
  assert.equal(run.status, 2, `${run.stdout}${run.stderr}`);
  assert.match(run.stderr, /SEC-CLOSE-REQUIRED-CAPABILITY-NOT-RUN/u);
});

test("C25 the Verify security check applies the declared reading: a declared capability without a scanner refuses with the typed code; undeclared stays admitted", async () => {
  const { runSecurityCloseCheck } = await import("../../scripts/security-close-check.mjs");
  const run = (root) => {
    const lines = [];
    const log = console.log; const error = console.error;
    console.log = (...a) => lines.push(a.join(" ")); console.error = (...a) => lines.push(a.join(" "));
    try { return { code: runSecurityCloseCheck(root, { PATH: "", Path: "", HOME: root }), text: lines.join("\n") }; } finally { console.log = log; console.error = error; }
  };
  const make = (required) => {
    const root = project("standard");
    mkdirSync(join(root, ".claude"), { recursive: true });
    writeFileSync(join(root, ".claude/pipeline.yaml"), gateManifest(required));
    return root;
  };
  const declared = run(make(["license"])); // license-check has no binary, so it is skipped on every machine
  assert.equal(declared.code, 1, declared.text);
  assert.match(declared.text, /SEC-CLOSE-REQUIRED-CAPABILITY-NOT-RUN/u);
  assert.match(declared.text, /license-check/u);
  const undeclared = run(make(null));
  assert.equal(undeclared.code, 0, undeclared.text); // its warnings are printed by the scan child process itself (security-scan.mjs, C22c)
});
