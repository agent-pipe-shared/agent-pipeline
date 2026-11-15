// SPDX-License-Identifier: SUL-1.0
// C28e (PO tiles 2026-11-12): the one tool registry, its agreement with the toolchain preflight, and the machine-local deferral of a required tool.
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { renderToolchainDoc } from "./toolchain-doc.mjs";
import { TOOLCHAIN_REGISTRY, TOOL_CLASSES, TOOL_PLATFORMS, meetsVersionFloor, toolchainDocPointer, toolchainEntry } from "./toolchain-registry.mjs";
import { readToolDeferral, readToolchainDeferrals, recordToolDeferral, clearToolDeferral, toolchainDeferralsPath } from "./toolchain-deferrals.mjs";
import { FIXED_TOOLS, ENVIRONMENT_FINDING_IDS, runEnvironmentReadinessReport, runToolchainPreflight } from "../scripts/toolchain-preflight.mjs";
import { buildHandle } from "../scripts/tool-identity.mjs";
import { scannerEntryReadiness } from "./security-close-status.mjs";
import { runToolchainDefer } from "../scripts/toolchain-defer.mjs";
import { ONBOARDING_CONSENT_COVERED_STEPS, coveringStepForArgv, onboardingConsentQuestion } from "./onboarding-consent-scope.mjs";

const home = () => mkdtempSync(join(tmpdir(), "toolchain-registry-"));
const deps = (dir) => ({ homedirFn: () => dir, realpathSyncFn: (path) => path, now: () => new Date("2026-11-12T20:00:00.000Z") });

test("the registry: unique ids, known classes, an install route for every platform, and every preflight tool except the license control", () => {
  const ids = TOOLCHAIN_REGISTRY.map((entry) => entry.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const entry of TOOLCHAIN_REGISTRY) {
    assert.ok(TOOL_CLASSES.includes(entry.class), entry.id);
    for (const platform of TOOL_PLATFORMS) assert.equal(typeof entry.install[platform], "string", `${entry.id} ${platform}`);
    assert.ok(entry.purpose.length > 0 && entry.floor.text.length > 0 && entry.usedBy.length > 0, entry.id);
    assert.ok(Object.isFrozen(entry) && Object.isFrozen(entry.install), entry.id);
  }
  for (const toolId of FIXED_TOOLS.filter((id) => !["license-check", "trivy"].includes(id))) assert.equal(toolchainEntry(toolId)?.class, "required", `${toolId} is a required tool of the registry`);
  assert.equal(toolchainEntry("trivy").class, "required-with-infrastructure", "C29e: Trivy is needed only where infrastructure or container files exist");
  assert.equal(toolchainEntry("openssl").class, "required-to-sign");
});

test("C29e: the preflight asks for Trivy only where the tracked files hold infrastructure or container files", () => {
  const dir = home();
  try {
    let probed = 0;
    const base = {
      probeNodeFn: () => observed("node", "24.15.0", ["spawn-shell-false"]), probeGitFn: () => observed("git", "2.50.1", ["object-format", "diff-paths"]),
      resolveExecutableFn: (name) => (name === "trivy" ? null : `/tools/${name}`), resolveInstallerFn: () => null,
      scannerProbes: { trivy: () => { probed += 1; return observed("trivy", "0.76.2", []); } },
    };
    const manifestResult = { status: "ok", manifest: { security: { scanners: { trivy: { enabled: true } } } } };
    const none = runToolchainPreflight({ rootDir: dir, manifestResult, platform: "linux", tempDir: dir }, { ...base, trivyTriggerFilesFn: () => ({ container: [], terraform: [], kubernetes: [] }) });
    assert.equal(none.results.find((entry) => entry.tool === "trivy").status, "not_required");
    assert.equal(none.status, "ready", "an explicit trivy entry is a known scanner, never TCP-UNSUPPORTED-SCANNER");
    const some = runToolchainPreflight({ rootDir: dir, manifestResult, platform: "linux", tempDir: dir }, { ...base, trivyTriggerFilesFn: () => ({ container: ["Dockerfile"], terraform: [], kubernetes: [] }) });
    const entry = some.results.find((candidate) => candidate.tool === "trivy");
    assert.equal(entry.status, "binary_missing");
    assert.match(entry.guidance, /docs\/toolchain\.md#trivy/u);
    assert.equal(probed, 0, "a missing binary is never probed");
    const undecided = runToolchainPreflight({ rootDir: dir, manifestResult, platform: "linux", tempDir: dir }, { ...base, trivyTriggerFilesFn: () => ({ error: "x" }) });
    assert.equal(undecided.results.find((candidate) => candidate.tool === "trivy").status, "probe_error");
    const ready = runToolchainPreflight({ rootDir: dir, manifestResult, platform: "linux", tempDir: dir }, {
      ...base, resolveExecutableFn: (name) => `/tools/${name}`, trivyTriggerFilesFn: () => ({ container: [], terraform: ["main.tf"], kubernetes: [] }),
      scannerProbes: { trivy: () => observed("trivy", "0.76.2", ["--format", "--skip-check-update", "--cache-dir", "--ignorefile", "--disable-telemetry", "--skip-version-check"]) },
    });
    assert.equal(ready.results.find((candidate) => candidate.tool === "trivy").status, "ready");
    const old = runToolchainPreflight({ rootDir: dir, manifestResult, platform: "linux", tempDir: dir }, {
      ...base, resolveExecutableFn: (name) => `/tools/${name}`, trivyTriggerFilesFn: () => ({ container: ["Dockerfile"], terraform: [], kubernetes: [] }),
      scannerProbes: { trivy: () => observed("trivy", "0.40.0", ["--format", "--skip-check-update", "--cache-dir", "--ignorefile"]) },
    });
    assert.equal(old.results.find((candidate) => candidate.tool === "trivy").status, "incompatible_capability", "a release without the offline switches cannot run the close scan");
    assert.deepEqual(recordToolDeferral("trivy", "later", deps(dir)).status, "recorded", "Trivy may be deferred like a required tool");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("docs/toolchain.md is the registry's rendering, in the repository and in the plugin's vendored copy", () => {
  const text = renderToolchainDoc();
  for (const entry of TOOLCHAIN_REGISTRY) assert.ok(text.includes(`### ${entry.id}\n`), entry.id);
  assert.ok(text.includes("`gitleaks_<version>_linux_x64.tar.gz`") && text.includes("`%USERPROFILE%\\.local\\bin`"), "code spans keep their text");
  const outsideCode = text.split(/`[^`\n]*`/u).join("").replace(/<!--[^\n]*-->/u, "");
  assert.doesNotMatch(outsideCode, /(?<!\\)[<>]/u, "outside a code span an angle bracket is escaped for Markdown");
  const pluginRoot = fileURLToPath(new URL("../", import.meta.url));
  for (const path of [join(pluginRoot, "..", "..", "docs", "toolchain.md"), join(pluginRoot, "docs", "toolchain.md")]) {
    if (!existsSync(path)) continue; // a consumer's plugin copy carries only the vendored file; the repository carries both
    assert.equal(readFileSync(path, "utf8"), text, `${path} differs from the registry: run harness/scripts/generate-toolchain-doc.mjs, then the vendored canon generator`);
  }
});

test("the version floors the preflight checks come from the registry", () => {
  assert.equal(meetsVersionFloor("node", [24, 0, 0]), true);
  assert.equal(meetsVersionFloor("node", [22, 9, 0]), false);
  assert.equal(meetsVersionFloor("osv-scanner", [2, 7, 0]), true);
  assert.equal(meetsVersionFloor("osv-scanner", [3, 0, 0]), false);
  assert.equal(meetsVersionFloor("osv-scanner", [1, 9, 0]), false);
  assert.equal(meetsVersionFloor("semgrep", [1, 170, 0]), true, "no major floor: any parsed version");
  assert.equal(meetsVersionFloor("node", null), false);
});

test("the pointer a preflight result carries names the document and holds no command and no version number (W7-2)", () => {
  for (const entry of TOOLCHAIN_REGISTRY) {
    const pointer = toolchainDocPointer(entry.id);
    assert.ok(pointer.includes(`docs/toolchain.md#${entry.id}`), entry.id);
    assert.doesNotMatch(pointer, /\d+\.\d+|\d+\.x|apt-get|go install|brew install|winget install|pipx install|sudo/u);
  }
  assert.equal(toolchainDocPointer("no-such-tool"), null);
});

test("a deferral is recorded on this machine with the answer word for word, read back, and cleared", () => {
  const dir = home();
  try {
    assert.equal(toolchainDeferralsPath(deps(dir)), join(dir, ".agent-pipeline", "toolchain-deferrals.json"));
    assert.equal(readToolDeferral("semgrep", deps(dir)), null);
    assert.deepEqual(recordToolDeferral("semgrep", "  später,\n nach der Freigabe  ", deps(dir)), { status: "recorded", tool: "semgrep", deferredAt: "2026-11-12T20:00:00.000Z" });
    assert.deepEqual(readToolDeferral("semgrep", deps(dir)), { deferredAt: "2026-11-12T20:00:00.000Z", answer: "später, nach der Freigabe" });
    assert.throws(() => recordToolDeferral("gh", "later", deps(dir)), /not a required tool/u, "an optional tool needs no deferral");
    assert.throws(() => recordToolDeferral("semgrep", "   ", deps(dir)), /answer is required/u);
    assert.deepEqual(runToolchainDefer(["--list"], deps(dir)).tools.semgrep.answer, "später, nach der Freigabe");
    assert.deepEqual(clearToolDeferral("semgrep", deps(dir)), { status: "cleared", tool: "semgrep" });
    assert.equal(readToolDeferral("semgrep", deps(dir)), null);
    assert.throws(() => runToolchainDefer(["--tool", "semgrep"], deps(dir)), /Usage/u);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("an invalid deferral file defers nothing and is never overwritten", () => {
  const dir = home();
  try {
    mkdirSync(join(dir, ".agent-pipeline"));
    const path = join(dir, ".agent-pipeline", "toolchain-deferrals.json");
    writeFileSync(path, JSON.stringify({ schema: "pipeline.toolchain-deferrals.v1", tools: { semgrep: { deferredAt: "x", answer: "later" } } }));
    assert.equal(readToolchainDeferrals(deps(dir)).status, "invalid");
    assert.equal(readToolDeferral("semgrep", deps(dir)), null);
    assert.throws(() => recordToolDeferral("gitleaks", "later", deps(dir)), /invalid/u);
    assert.match(readFileSync(path, "utf8"), /"deferredAt":"x"/u);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

const observed = (tool, version, capabilities) => ({ ok: true, status: "ready", handle: buildHandle(tool, { realPath: `/tools/${tool}`, device: "1", inode: "2", size: 3, mtimeNs: "4", sha256: "a".repeat(64) }, version, capabilities, "2026-11-12T12:00:00.000Z") });
const stubOk = Object.fromEntries(ENVIRONMENT_FINDING_IDS.filter((id) => !id.startsWith("scanner-")).map((id) => [id, () => ({ status: "ok", cause: "stub", repair: null })]));
function reportDeps({ semgrep, deferral = null }) {
  return {
    probeNodeFn: () => observed("node", "24.15.0", ["spawn-shell-false"]), probeGitFn: () => observed("git", "2.50.1", ["object-format", "diff-paths"]),
    resolveExecutableFn: (name) => `/tools/${name}`, resolveInstallerFn: () => null,
    scannerProbes: {
      gitleaks: () => observed("gitleaks", "8.18.0", ["--source", "--report-format", "--report-path", "--no-banner", "--exit-code"]),
      "osv-scanner": () => observed("osv-scanner", "2.0.0", ["--format", "recursive-source"]),
      semgrep,
    },
    findingProbes: stubOk,
    readToolDeferral: (tool) => (tool === "semgrep" ? deferral : null),
  };
}

test("a deferred scanner stays attended: the finding names its class, its document section and the deferral, and is never ok", async () => {
  const dir = home();
  try {
    const missing = () => ({ ok: false, status: "binary_missing" });
    const report = await runEnvironmentReadinessReport({ rootDir: dir, platform: "linux", tempDir: dir }, reportDeps({ semgrep: missing, deferral: { deferredAt: "2026-11-12T20:00:00.000Z", answer: "later" } }));
    const finding = report.findings.find((entry) => entry.findingId === "scanner-semgrep");
    assert.equal(finding.status, "attended");
    assert.match(finding.cause, /deferred on this machine \(2026-11-12T20:00:00\.000Z\)/u);
    assert.equal(finding.repair.toolClass, "required");
    assert.equal(finding.repair.installDoc, "docs/toolchain.md#semgrep");
    assert.equal(finding.repair.deferred, true);
    assert.doesNotMatch(JSON.stringify(finding), /sudo|apt-get|go install|brew install|winget|pipx install/u);
    assert.equal(report.ok, false, "a deferral never makes the report clean");
    // The plan and close check reads the preflight result, not this report: a critical calibration still refuses the scanner.
    const refusal = scannerEntryReadiness({ results: [{ tool: "semgrep", status: "binary_missing", guidance: "" }] }, { critical: true });
    assert.equal(refusal.refusals.length, 1);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("the onboarding consent names every required tool, and only the deferral record is a covered action", () => {
  const step = ONBOARDING_CONSENT_COVERED_STEPS.find((entry) => entry.id === "toolchain");
  assert.ok(step, "the consent lists the tool check");
  const names = { node: "Node.js", git: "Git", openssl: "OpenSSL" };
  const consentNames = { ...names, trivy: "Trivy" };
  for (const entry of TOOLCHAIN_REGISTRY.filter((candidate) => ["required", "required-with-infrastructure", "required-to-sign"].includes(candidate.class))) {
    for (const language of ["en", "de"]) assert.ok(step[language].includes(consentNames[entry.id] ?? entry.id), `${language}: ${entry.id}`);
  }
  assert.equal(coveringStepForArgv(["toolchain-defer.mjs", "--tool", "semgrep"])?.id, "toolchain");
  assert.equal(coveringStepForArgv(["toolchain-preflight.mjs", "--repair", "git-hooks"]), null, "no installer or other script is covered by it");
  for (const language of ["en", "de"]) assert.ok(onboardingConsentQuestion({ language }).text.length <= 2600, language);
});

test("a scanner the check could not observe (a sandbox) asks for no install", async () => {
  const dir = home();
  try {
    for (const status of ["probe_error", "execution_environment", "probe_timeout"]) {
      const report = await runEnvironmentReadinessReport({ rootDir: dir, platform: "linux", tempDir: dir }, reportDeps({ semgrep: () => ({ ok: false, status }) }));
      const finding = report.findings.find((entry) => entry.findingId === "scanner-semgrep");
      assert.equal(finding.status, "unknown", status);
      assert.equal(finding.repair.prerequisite, "semgrep-observable", status);
      assert.match(finding.repair.summary, /do not reinstall/u, status);
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
