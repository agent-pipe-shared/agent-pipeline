// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { chmodSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createDesignReadinessRunnerHostStore, designReadinessRunnerHostReceiptSha256 } from "./design-readiness-runner-host-store.mjs";

const F = "a".repeat(64);
const NAMES = ["input", "prd", "spec", "design", "traceability"];
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), "design-readiness-host-store-"));
  const gitCommonDir = join(root, ".git");
  mkdirSync(gitCommonDir, { mode: 0o700 });
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return { root, gitCommonDir, store: createDesignReadinessRunnerHostStore({ gitCommonDir, repoFingerprint: F }) };
}
function record(overrides = {}) {
  return {
    schema: "pipeline.design-readiness-runner-host-receipt.v1",
    receiptId: "drh_0123456789abcdef0123456789abcdef",
    runner: "antigravity",
    repoFingerprint: F,
    dispatchId: "readiness-1",
    candidate: { commit: "b".repeat(40), tree: "c".repeat(40) },
    sources: Object.fromEntries(NAMES.map((name, index) => [name, { path: `spec/${name}.md`, sha256: String(index).repeat(64) }])),
    route: { model: "gemini-3.8-flash", effort: "high", sourceSha256: "d".repeat(64), candidateCommit: "b".repeat(40) },
    executableSha256: "e".repeat(64),
    requestSha256: "f".repeat(64),
    responseSha256: "1".repeat(64),
    dutyReceiptSha256: "2".repeat(64),
    child: { started: true, exitCode: 0, signal: null, stdoutStatus: "complete", writeToolsObserved: false },
    createdAt: "2026-09-27T12:00:00.000Z",
    ...overrides,
  };
}

test("DRHS01 stores one canonical, repository-private immutable host receipt and independently reads it back", (t) => {
  const fx = fixture(t);
  const value = record();
  const stored = fx.store.write(value);
  assert.equal(stored.sha256, designReadinessRunnerHostReceiptSha256(value));
  const readback = fx.store.read(value.receiptId);
  assert.equal(readback.sha256, stored.sha256);
  assert.deepEqual(JSON.parse(JSON.stringify(readback.value)), value);
  assert.equal(lstatSync(stored.path).nlink, 1);
  if (process.platform !== "win32") assert.equal(lstatSync(stored.path).mode & 0o077, 0);
  assert.throws(() => fx.store.write(value), { code: "DRHS-ALREADY-EXISTS" });
});

test("DRHS02 rejects record drift, malformed receipts and wrong repository bindings", (t) => {
  const fx = fixture(t);
  const value = record();
  const stored = fx.store.write(value);
  writeFileSync(stored.path, "{\"tampered\":true}\n", { mode: 0o600 });
  assert.equal(fx.store.read(value.receiptId), null);
  assert.throws(() => designReadinessRunnerHostReceiptSha256({ ...value, runner: "codex" }), { code: "DRHS-RECORD-INVALID" });
  assert.throws(() => fx.store.write(record({ repoFingerprint: "9".repeat(64), receiptId: "drh_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" })), { code: "DRHS-RECORD-INVALID" });
});

test("DRHS03 refuses a symlinked private receipt directory and never follows it", (t) => {
  if (process.platform === "win32") return t.skip("symlink creation requires platform privileges");
  const root = mkdtempSync(join(tmpdir(), "design-readiness-host-store-link-"));
  const gitCommonDir = join(root, ".git");
  const elsewhere = join(root, "elsewhere");
  mkdirSync(gitCommonDir, { mode: 0o700 });
  mkdirSync(elsewhere, { mode: 0o700 });
  writeFileSync(join(elsewhere, "sentinel"), "preserve\n", { mode: 0o600 });
  mkdirSync(join(gitCommonDir, "agent-pipeline"), { mode: 0o755 });
  symlinkSync(elsewhere, join(gitCommonDir, "agent-pipeline", "design-readiness"), "dir");
  t.after(() => rmSync(root, { recursive: true, force: true }));
  assert.throws(() => createDesignReadinessRunnerHostStore({ gitCommonDir, repoFingerprint: F }), { code: "DRHS-UNSAFE-DIRECTORY" });
  assert.equal(readFileSync(join(elsewhere, "sentinel"), "utf8"), "preserve\n");
});

test("DRHS04 refuses a shared-access evidence directory rather than weakening its boundary", (t) => {
  if (process.platform === "win32") return t.skip("POSIX directory modes are not authoritative on Windows");
  const fx = fixture(t);
  const readiness = join(fx.gitCommonDir, "agent-pipeline", "design-readiness");
  chmodSync(readiness, 0o755);
  assert.throws(() => createDesignReadinessRunnerHostStore({ gitCommonDir: fx.gitCommonDir, repoFingerprint: F }), { code: "DRHS-UNSAFE-DIRECTORY" });
});
