// SPDX-License-Identifier: SUL-1.0
// C22 (AC-108, PO decision 2026-11-09): the Codex Critic launch route is decided at launch from this machine's sandbox preflight receipt,
// because `.codex/agents/*.toml` is byte-identical across machines. Every case exits 0: a sandbox condition never stops the lifecycle.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { decideCodexCriticLaunchRoute } from "./codex-critic-launch-route.mjs";

const SCRIPT = fileURLToPath(new URL("../scripts/codex-critic-launch-route.mjs", import.meta.url));
const SCHEMA = "pipeline.codex-sandbox-preflight.v1";

function receipt(overrides = {}) {
  return JSON.stringify({ schema: SCHEMA, eligibility: "intermediate", terminalCode: "ok", ...overrides });
}
function withRoot(run) {
  const root = mkdtempSync(join(tmpdir(), "codex-critic-launch-route-"));
  try { return run(root); } finally { rmSync(root, { recursive: true, force: true }); }
}
function receiptFile(root, text, name = "receipt.json") {
  const path = join(root, name);
  writeFileSync(path, text);
  return path;
}
function fallback(reason) {
  return { agentType: "default", sandboxed: false, protection: "instruction-only", reason };
}
function runCli(args) {
  const result = spawnSync(process.execPath, [SCRIPT, ...args], { encoding: "utf8" });
  assert.equal(result.status, 0, `the route never exits non-zero: ${result.stderr}`);
  const lines = result.stdout.split("\n").filter(Boolean);
  assert.equal(lines.length, 1, "exactly one JSON object");
  return JSON.parse(lines[0]);
}

test("C22 an intermediate or strong receipt with terminal code ok routes the sandboxed role itself", () => withRoot((root) => {
  for (const role of ["critic", "critic-high-risk"]) {
    for (const eligibility of ["intermediate", "strong"]) {
      const path = receiptFile(root, receipt({ eligibility }));
      assert.deepEqual(decideCodexCriticLaunchRoute({ role, receiptPath: path }), { agentType: role, sandboxed: true }, `${role} ${eligibility}`);
      assert.deepEqual(runCli(["--role", role, "--receipt", path]), { agentType: role, sandboxed: true }, `cli ${role} ${eligibility}`);
    }
  }
}));

test("C22 no receipt routes default, instruction-only, exit 0", () => {
  assert.deepEqual(decideCodexCriticLaunchRoute({ role: "critic" }), fallback("no-receipt"));
  assert.deepEqual(runCli(["--role", "critic"]), fallback("no-receipt"));
  assert.deepEqual(runCli(["--role", "critic-high-risk"]), fallback("no-receipt"));
});

test("C22 an unreadable receipt (missing file, directory, relative path) routes default", () => withRoot((root) => {
  mkdirSync(join(root, "a-directory"));
  for (const path of [join(root, "missing.json"), join(root, "a-directory"), "relative/receipt.json"]) {
    assert.deepEqual(decideCodexCriticLaunchRoute({ role: "critic", receiptPath: path }), fallback("receipt-unreadable"), path);
    assert.deepEqual(runCli(["--role", "critic", "--receipt", path]), fallback("receipt-unreadable"), `cli ${path}`);
  }
}));

test("C22 a receipt that is not JSON or has another schema routes default", () => withRoot((root) => {
  for (const text of ["not json", "[]", "null", receipt({ schema: "pipeline.codex-sandbox-preflight.v0" }), JSON.stringify({ eligibility: "strong", terminalCode: "ok" })]) {
    const path = receiptFile(root, text);
    assert.deepEqual(decideCodexCriticLaunchRoute({ role: "critic", receiptPath: path }), fallback("receipt-schema-mismatch"), text);
    assert.deepEqual(runCli(["--role", "critic", "--receipt", path]), fallback("receipt-schema-mismatch"), `cli ${text}`);
  }
}));

test("C22 any other eligibility routes default", () => withRoot((root) => {
  for (const eligibility of ["diagnostic", "none", "", undefined, 7]) {
    const path = receiptFile(root, receipt({ eligibility }));
    assert.deepEqual(decideCodexCriticLaunchRoute({ role: "critic-high-risk", receiptPath: path }), fallback("eligibility-insufficient"), String(eligibility));
    assert.deepEqual(runCli(["--role", "critic-high-risk", "--receipt", path]), fallback("eligibility-insufficient"));
  }
}));

test("C22 any other terminal code routes default even with a sufficient eligibility", () => withRoot((root) => {
  for (const terminalCode of ["permission-mismatch", "child-stdio-error", "total-timeout", "internal-error", "", undefined]) {
    const path = receiptFile(root, receipt({ terminalCode }));
    assert.deepEqual(decideCodexCriticLaunchRoute({ role: "critic", receiptPath: path }), fallback("terminal-code-not-ok"), String(terminalCode));
    assert.deepEqual(runCli(["--role", "critic", "--receipt", path]), fallback("terminal-code-not-ok"));
  }
}));

test("C22 a thrown error or an invalid role routes default and never throws", () => withRoot((root) => {
  const path = receiptFile(root, receipt());
  assert.deepEqual(decideCodexCriticLaunchRoute({ role: "critic", receiptPath: path, readText: () => { throw new Error("boom"); } }), fallback("receipt-unreadable"));
  assert.deepEqual(decideCodexCriticLaunchRoute({ role: "critic", receiptPath: path, readText: () => ({ not: "a string" }) }), fallback("receipt-schema-mismatch"));
  assert.deepEqual(decideCodexCriticLaunchRoute(null), fallback("route-error"));
  assert.deepEqual(decideCodexCriticLaunchRoute({ role: "default", receiptPath: path }), fallback("role-invalid"));
  assert.deepEqual(decideCodexCriticLaunchRoute({ receiptPath: path }), fallback("role-invalid"));
  assert.deepEqual(runCli(["--role", "elephant", "--receipt", path]), fallback("role-invalid"));
  assert.deepEqual(runCli([]), fallback("role-invalid"));
  assert.deepEqual(runCli(["--role", "critic", "--receipt"]), fallback("route-error"));
  assert.deepEqual(runCli(["--role", "critic", "--bogus", path]), fallback("route-error"));
}));

test("C22 the route is read-only: it never creates or changes the receipt", () => withRoot((root) => {
  const path = receiptFile(root, receipt());
  const before = readFileSync(path, "utf8");
  runCli(["--role", "critic", "--receipt", path]);
  assert.equal(readFileSync(path, "utf8"), before);
}));
