import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { registerTestCaseCompletion } from "../lib/test-case-completion.mjs";
import { openSync as openCompletionDescriptor } from "node:fs";

const completionCases = [];
function test(name, run) {
  if (arguments.length !== 2 || typeof run !== "function") throw new TypeError("Required completion expects the preserved two-argument test registration");
  completionCases.push({ id: "RC20C" + String(completionCases.length + 1).padStart(3, "0"), name, run });
}
import { preflightBrowserEvidence } from "./browser-evidence-preflight.mjs";

function fixture(launchBody) {
  const root = mkdtempSync(join(tmpdir(), "browser-host-probe-"));
  const dir = join(root, "node_modules", "playwright");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "chromium"), "fixture executable");
  writeFileSync(join(dir, "index.js"), `const { join } = require("node:path"); module.exports = {
    chromium: { executablePath: () => join(__dirname, "chromium"), launch: async () => { ${launchBody} } }
  };`);
  return root;
}

test("launchable browser is ready after real local probe", () => {
  const root = fixture("return { close: async () => {} };");
  try {
    const result = preflightBrowserEvidence({ rootDir: root });
    assert.equal(result.code, "BEP-BROWSER-E2E-READY");
    assert.equal(result.testExecuted, false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("missing shared library fails before product test", () => {
  const root = fixture('throw new Error("error while loading shared libraries: libnspr4.so");');
  try {
    const result = preflightBrowserEvidence({ rootDir: root });
    assert.equal(result.code, "BEP-BROWSER-HOST-DEPENDENCY-UNAVAILABLE");
    assert.equal(result.status, "unavailable");
    assert.equal(result.exitCode, 1);
    assert.equal(result.testExecuted, false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("generic launch failure cannot claim browser readiness", () => {
  const root = fixture('throw new Error("browser process exited");');
  try {
    const result = preflightBrowserEvidence({ rootDir: root });
    assert.equal(result.code, "BEP-CHROMIUM-LAUNCH-UNAVAILABLE");
    assert.equal(result.selectedEvidence, null);
    assert.equal(result.testExecuted, false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("failed browser close cannot claim completed capability probe", () => {
  const root = fixture('return { close: async () => { throw new Error("close failed"); } };');
  try {
    assert.equal(preflightBrowserEvidence({ rootDir: root }).status, "unavailable");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("explicit weaker fallback remains degraded and nonzero", () => {
  const root = fixture('throw new Error("Host system is missing dependencies");');
  try {
    const result = preflightBrowserEvidence({ rootDir: root, fallbackEvidence: "static" });
    assert.equal(result.status, "degraded");
    assert.equal(result.selectedEvidence, "static");
    assert.equal(result.observedEvidence, null);
    assert.notEqual(result.exitCode, 0);
    assert.equal(result.testExecuted, false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("outer probe timeout is bounded and fails closed", () => {
  let options;
  const result = preflightBrowserEvidence({ rootDir: process.cwd() }, {
    spawnFn: (_file, _args, received) => {
      options = received;
      return {status: null, error: {code: "ETIMEDOUT"}, stdout: ""};
    },
  });
  assert.equal(options.timeout, 20000);
  assert.equal(options.shell, false);
  assert.equal(result.code, "BEP-BROWSER-PROBE-FAILED");
  assert.equal(result.status, "unavailable");
});

test("static evidence does not launch the browser", () => {
  const result = preflightBrowserEvidence({ requiredEvidence: "static" }, {
    spawnFn: () => { throw new Error("must not run"); },
  });
  assert.equal(result.code, "BEP-DECLARED-NON-BROWSER");
  assert.equal(result.observedEvidence, null);
  assert.equal(result.testExecuted, false);
});

// Each original sibling callback is registered individually; no envelope case.
if (completionCases.length !== 7) throw new Error("Required completion declared case count drift");
const completionFd = process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD === undefined
  ? openCompletionDescriptor(process.platform === "win32" ? "NUL" : "/dev/null", "w")
  : Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD);
registerTestCaseCompletion({ cases: completionCases, fd: completionFd,
  maxBytes: Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_MAX_BYTES ?? "65536") });
