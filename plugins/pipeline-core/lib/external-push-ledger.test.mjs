#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * external-push-ledger.test.mjs — PHX-2 additive external push-ledger module tests.
 *
 * Run: node plugins/pipeline-core/lib/external-push-ledger.test.mjs
 * Exit: 0 = all cases pass · 1 = at least one case failed.
 *
 * Hermetics: every case that touches the filesystem uses its own fresh `mkdtempSync`
 * directory passed explicitly as `rootDir`/the gate directory -- never the real `$HOME`
 * (Restore-before-yield, WP5-phx2-implementation field 4). All fixture roots are removed
 * at the end of the run.
 */
import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

import {
  EXTERNAL_PUSH_LEDGER_SCHEMA,
  appendExternalPushLedgerConsumption,
  checkExternalPushLedgerConsumption,
  externalPushLedgerGate,
} from "./external-push-ledger.mjs";

let passed = 0;
let failed = 0;
const fixtureRoots = [];

function check(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`PASS ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`FAIL ${name}: ${error.stack || error.message}`);
  }
}

function freshRoot(prefix) {
  const dir = mkdtempSync(join(tmpdir(), `external-push-ledger-${prefix}-`));
  fixtureRoots.push(dir);
  return dir;
}

const FP = "a".repeat(64);
const PROOF = "b".repeat(64);
const NOW = "2026-08-07T00:00:00.000Z";

function git(cwd, args) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (result.error || result.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
  return result;
}

/** A real git repo whose committed `pipeline.user.yaml` carries the given gates block. */
function userYamlRepo(prefix, gatesYaml) {
  const dir = freshRoot(prefix);
  git(dir, ["init", "-q", "-b", "main"]);
  git(dir, ["config", "user.email", "fixture@example.invalid"]);
  git(dir, ["config", "user.name", "Fixture"]);
  writeFileSync(join(dir, "pipeline.user.yaml"), `schema: "pipeline.user.v1"\n${gatesYaml}`);
  git(dir, ["add", "pipeline.user.yaml"]);
  git(dir, ["commit", "-q", "-m", "fixture"]);
  return dir;
}

// ---- appendExternalPushLedgerConsumption / checkExternalPushLedgerConsumption -----------

check("EPL01 first write succeeds without the directory pre-existing, and reads back ok:true", () => {
  const rootDir = freshRoot("first-write");
  const appended = appendExternalPushLedgerConsumption({ repositoryFingerprint: FP, proofSha256: PROOF, consumedAt: NOW, rootDir });
  assert.deepEqual(appended, { ok: true });
  const checked = checkExternalPushLedgerConsumption({ repositoryFingerprint: FP, proofSha256: PROOF, candidate: { commit: "x", tree: "y" }, rootDir });
  assert.deepEqual(checked, { ok: true });
});

check("EPL02 the written record has exactly the four schema keys and the right schema string", () => {
  const rootDir = freshRoot("shape");
  appendExternalPushLedgerConsumption({ repositoryFingerprint: FP, proofSha256: PROOF, consumedAt: NOW, rootDir });
  const path = join(rootDir, ".pipeline", "push-ledger", FP, `${PROOF}.json`);
  const record = JSON.parse(readFileSync(path, "utf8"));
  assert.deepEqual(Object.keys(record).sort(), ["consumedAt", "proofSha256", "repositoryFingerprint", "schema"].sort());
  assert.equal(record.schema, EXTERNAL_PUSH_LEDGER_SCHEMA);
});

check("EPL03 absent ledger -> MISSING", () => {
  const rootDir = freshRoot("absent");
  const checked = checkExternalPushLedgerConsumption({ repositoryFingerprint: FP, proofSha256: PROOF, candidate: null, rootDir });
  assert.deepEqual(checked, { ok: false, code: "PUSH-EXTERNAL-LEDGER-MISSING" });
});

check("EPL04 malformed JSON -> MISMATCH", () => {
  const rootDir = freshRoot("malformed-json");
  const dir = join(rootDir, ".pipeline", "push-ledger", FP);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  writeFileSync(join(dir, `${PROOF}.json`), "{not json", { mode: 0o600 });
  const checked = checkExternalPushLedgerConsumption({ repositoryFingerprint: FP, proofSha256: PROOF, candidate: null, rootDir });
  assert.deepEqual(checked, { ok: false, code: "PUSH-EXTERNAL-LEDGER-MISMATCH" });
});

check("EPL05 wrong/extra keys -> MISMATCH", () => {
  const rootDir = freshRoot("wrong-keys");
  const dir = join(rootDir, ".pipeline", "push-ledger", FP);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  writeFileSync(join(dir, `${PROOF}.json`), JSON.stringify({
    schema: EXTERNAL_PUSH_LEDGER_SCHEMA, repositoryFingerprint: FP, proofSha256: PROOF, consumedAt: NOW, extra: "nope",
  }), { mode: 0o600 });
  const checked = checkExternalPushLedgerConsumption({ repositoryFingerprint: FP, proofSha256: PROOF, candidate: null, rootDir });
  assert.deepEqual(checked, { ok: false, code: "PUSH-EXTERNAL-LEDGER-MISMATCH" });
});

check("EPL06 repositoryFingerprint mismatch -> MISMATCH", () => {
  const rootDir = freshRoot("fp-mismatch");
  appendExternalPushLedgerConsumption({ repositoryFingerprint: FP, proofSha256: PROOF, consumedAt: NOW, rootDir });
  const other = "c".repeat(64);
  const checked = checkExternalPushLedgerConsumption({ repositoryFingerprint: other, proofSha256: PROOF, candidate: null, rootDir });
  assert.deepEqual(checked, { ok: false, code: "PUSH-EXTERNAL-LEDGER-MISSING" }); // different path entirely -> file absent there
});

check("EPL06b stored repositoryFingerprint disagrees with the caller's, same path -> MISMATCH", () => {
  const rootDir = freshRoot("fp-mismatch-samepath");
  const dir = join(rootDir, ".pipeline", "push-ledger", FP);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  writeFileSync(join(dir, `${PROOF}.json`), JSON.stringify({
    schema: EXTERNAL_PUSH_LEDGER_SCHEMA, repositoryFingerprint: "c".repeat(64), proofSha256: PROOF, consumedAt: NOW,
  }), { mode: 0o600 });
  const checked = checkExternalPushLedgerConsumption({ repositoryFingerprint: FP, proofSha256: PROOF, candidate: null, rootDir });
  assert.deepEqual(checked, { ok: false, code: "PUSH-EXTERNAL-LEDGER-MISMATCH" });
});

check("EPL07 proofSha256 mismatch (stored value disagrees, same path) -> MISMATCH", () => {
  const rootDir = freshRoot("proof-mismatch");
  const dir = join(rootDir, ".pipeline", "push-ledger", FP);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  writeFileSync(join(dir, `${PROOF}.json`), JSON.stringify({
    schema: EXTERNAL_PUSH_LEDGER_SCHEMA, repositoryFingerprint: FP, proofSha256: "d".repeat(64), consumedAt: NOW,
  }), { mode: 0o600 });
  const checked = checkExternalPushLedgerConsumption({ repositoryFingerprint: FP, proofSha256: PROOF, candidate: null, rootDir });
  assert.deepEqual(checked, { ok: false, code: "PUSH-EXTERNAL-LEDGER-MISMATCH" });
});

check("EPL08 second write for the same proofSha256 -> EEXIST surfaced as ALREADY-CONSUMED", () => {
  const rootDir = freshRoot("dup");
  const first = appendExternalPushLedgerConsumption({ repositoryFingerprint: FP, proofSha256: PROOF, consumedAt: NOW, rootDir });
  assert.deepEqual(first, { ok: true });
  const second = appendExternalPushLedgerConsumption({ repositoryFingerprint: FP, proofSha256: PROOF, consumedAt: NOW, rootDir });
  assert.deepEqual(second, { ok: false, code: "PUSH-EXTERNAL-LEDGER-ALREADY-CONSUMED" });
  // The first write's record must be untouched by the refused second attempt.
  const checked = checkExternalPushLedgerConsumption({ repositoryFingerprint: FP, proofSha256: PROOF, candidate: null, rootDir });
  assert.deepEqual(checked, { ok: true });
});

check("EPL09 a write failure that is not EEXIST surfaces as WRITE-FAILED, not ALREADY-CONSUMED", () => {
  if (process.platform === "win32") return; // POSIX permission-bit semantics only
  if (typeof process.getuid === "function" && process.getuid() === 0) return; // root ignores mode bits
  const rootDir = freshRoot("write-failed");
  const ledgerRoot = join(rootDir, ".pipeline", "push-ledger");
  mkdirSync(ledgerRoot, { recursive: true, mode: 0o700 }); // create writable first, then lock it down
  chmodSync(ledgerRoot, 0o500); // read+execute, no write -- blocks the fingerprint subdir mkdir
  try {
    const appended = appendExternalPushLedgerConsumption({ repositoryFingerprint: FP, proofSha256: PROOF, consumedAt: NOW, rootDir });
    assert.deepEqual(appended, { ok: false, code: "PUSH-EXTERNAL-LEDGER-WRITE-FAILED" });
  } finally {
    chmodSync(ledgerRoot, 0o700);
  }
});

check("EPL10 malformed/programmer-error inputs throw rather than silently misdirect a write", () => {
  assert.throws(() => appendExternalPushLedgerConsumption({ repositoryFingerprint: "not-a-digest", proofSha256: PROOF, consumedAt: NOW, rootDir: freshRoot("bad-fp") }), TypeError);
  assert.throws(() => appendExternalPushLedgerConsumption({ repositoryFingerprint: FP, proofSha256: PROOF, consumedAt: "not-a-date", rootDir: freshRoot("bad-date") }), TypeError);
  assert.throws(() => checkExternalPushLedgerConsumption({ repositoryFingerprint: FP, proofSha256: "short", candidate: null, rootDir: freshRoot("bad-proof") }), TypeError);
});

// ---- externalPushLedgerGate resolution table --------------------------------------------

check("EPL11 object form: absent key -> off, exact off -> off, exact required -> required, malformed -> required", () => {
  assert.equal(externalPushLedgerGate({}), "off");
  assert.equal(externalPushLedgerGate({ gates: {} }), "off");
  assert.equal(externalPushLedgerGate({ gates: { push_external_ledger: "off" } }), "off");
  assert.equal(externalPushLedgerGate({ gates: { push_external_ledger: "required" } }), "required");
  assert.equal(externalPushLedgerGate({ gates: { push_external_ledger: "banana" } }), "required");
  assert.equal(externalPushLedgerGate({ gates: { push_external_ledger: true } }), "required");
});

check("EPL12 dir form: no git repo, no file at all -> off (day-one safety default)", () => {
  const dir = freshRoot("no-repo-no-file");
  assert.equal(externalPushLedgerGate(dir), "off");
});

check("EPL13 dir form: committed key absent -> off", () => {
  const dir = userYamlRepo("committed-absent", "gates:\n  push_approval: \"signature\"\n");
  assert.equal(externalPushLedgerGate(dir), "off");
});

check("EPL14 dir form: committed required, working tree matches -> required", () => {
  const dir = userYamlRepo("committed-required", "gates:\n  push_external_ledger: \"required\"\n");
  assert.equal(externalPushLedgerGate(dir), "required");
});

check("EPL15 dir form: committed off, working tree matches -> off", () => {
  const dir = userYamlRepo("committed-off", "gates:\n  push_external_ledger: \"off\"\n");
  assert.equal(externalPushLedgerGate(dir), "off");
});

check("EPL16 dir form: committed required, UNCOMMITTED edit to off -> still required (fails closed, cannot be weakened in-session)", () => {
  const dir = userYamlRepo("uncommitted-weaken", "gates:\n  push_external_ledger: \"required\"\n");
  writeFileSync(join(dir, "pipeline.user.yaml"), "schema: \"pipeline.user.v1\"\ngates:\n  push_external_ledger: \"off\"\n");
  assert.equal(externalPushLedgerGate(dir), "required");
});

check("EPL17 dir form: committed required, working tree file DELETED (uncommitted) -> still required", () => {
  const dir = userYamlRepo("uncommitted-deleted", "gates:\n  push_external_ledger: \"required\"\n");
  rmSync(join(dir, "pipeline.user.yaml"));
  assert.equal(externalPushLedgerGate(dir), "required");
});

check("EPL18 dir form: malformed value (committed, matches working tree) -> required", () => {
  const dir = userYamlRepo("malformed-value", "gates:\n  push_external_ledger: \"sometimes\"\n");
  assert.equal(externalPushLedgerGate(dir), "required");
});

check("EPL19 externalPushLedgerGate rejects a non-string, non-object argument", () => {
  assert.throws(() => externalPushLedgerGate(42), TypeError);
  assert.throws(() => externalPushLedgerGate(""), TypeError);
});

for (const root of fixtureRoots) rmSync(root, { recursive: true, force: true });
console.log(`\n${passed}/${passed + failed} checks passed.`);
process.exit(failed === 0 ? 0 : 1);
