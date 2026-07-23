// SPDX-License-Identifier: SUL-1.0
import test from "node:test";
import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  AFK_LEDGER_RECORD_SCHEMA,
  AFK_LEDGER_ZERO_HASH,
  acquireAfkWriterLock,
  afkLedgerPaths,
  appendAfkLedgerRecord,
  createAfkWriterOwner,
  encodeAfkLedgerFrame,
  loadAfkLedger,
  parseAfkLedgerGeneration,
  releaseAfkWriterLock,
  validateAfkLedgerRecord,
} from "./afk-ledger.mjs";

const ACTIVATION = "a".repeat(32);
const NOW = "2026-07-18T20:00:00.000Z";

function root() {
  return mkdtempSync(join(tmpdir(), "afk-ledger-test-"));
}

function blocked(reasonCode = "AFK-TEST-BLOCKED") {
  return { reasonCode };
}

function owner(overrides = {}) {
  return createAfkWriterOwner({
    hostId: "host-a",
    bootId: "boot-a",
    pid: 123,
    processStart: "456",
    activationId: ACTIVATION,
    acquiredAt: NOW,
    nonce: Buffer.alloc(32, 1),
    ...overrides,
  }).owner;
}

test("framed records are canonical, hashed and closed", () => {
  const record = {
    schema: AFK_LEDGER_RECORD_SCHEMA,
    activationId: ACTIVATION,
    sequence: 1,
    type: "blocked",
    previousHash: AFK_LEDGER_ZERO_HASH,
    recordedAt: NOW,
    body: blocked(),
  };
  const framed = encodeAfkLedgerFrame(record);
  assert.equal(framed.ok, true);
  const parsed = parseAfkLedgerGeneration(framed.bytes, ACTIVATION);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.sequence, 1);
  assert.equal(parsed.headSha256, framed.recordHash);
  assert.equal(validateAfkLedgerRecord({ ...record, approval: true }).code, "AFK-LEDGER-RECORD-INVALID");
  const unknownBody = structuredClone(record);
  unknownBody.body.detail = "secret";
  assert.equal(validateAfkLedgerRecord(unknownBody).code, "AFK-LEDGER-RECORD-INVALID");
});

test("ledger schema is closed and enumerates the full A3/A4 record union", () => {
  const schema = JSON.parse(readFileSync(new URL("../scripts/afk-ledger.schema.json", import.meta.url), "utf8"));
  assert.equal(schema.additionalProperties, false);
  assert.deepEqual(schema.properties.type.enum, [
    "activation-intent", "activation-ready", "entry-intent", "entry-applied",
    "review-freeze", "review-intent", "promotion-applied", "entry-receipt",
    "review-complete", "lock-recovered", "blocked",
  ]);
  assert.equal(schema.$defs.entryIntent.additionalProperties, false);
  assert.equal(schema.$defs.lockRecovered.additionalProperties, false);
});

test("immutable generations contain the complete valid prefix and use mode 0600", () => {
  const gitCommonDir = root();
  const first = appendAfkLedgerRecord({ gitCommonDir, activationId: ACTIVATION, type: "blocked", body: blocked("AFK-FIRST"), recordedAt: NOW });
  const second = appendAfkLedgerRecord({ gitCommonDir, activationId: ACTIVATION, type: "blocked", body: blocked("AFK-SECOND"), recordedAt: NOW, expectedHeadSha256: first.headSha256 });
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  const loaded = loadAfkLedger(gitCommonDir, ACTIVATION);
  assert.equal(loaded.ok, true);
  assert.equal(loaded.sequence, 2);
  assert.deepEqual(loaded.frames.map((entry) => entry.record.body.reasonCode), ["AFK-FIRST", "AFK-SECOND"]);
  const names = readdirSync(loaded.paths.generations).sort();
  assert.equal(names.length, 2);
  assert.match(names[1], /^0000000000000002-[0-9a-f]{64}\.afklog$/u);
  assert.equal(statSync(join(loaded.paths.generations, names[1])).mode & 0o777, 0o600);
});

test("a torn adjacent temp is ignored while a corrupt published generation blocks", () => {
  const gitCommonDir = root();
  const paths = afkLedgerPaths(gitCommonDir, ACTIVATION);
  writeFileSync(join(paths.generations, ".candidate.afklog.tmp-dead"), "torn", { mode: 0o600 });
  assert.equal(loadAfkLedger(gitCommonDir, ACTIVATION).sequence, 0);
  const failed = appendAfkLedgerRecord({
    gitCommonDir, activationId: ACTIVATION, type: "blocked", body: blocked(), recordedAt: NOW,
    fault(stage) { if (stage === "after-file-fsync") throw new Error("crash"); },
  });
  assert.equal(failed.code, "AFK-LEDGER-PUBLISH-FAILED");
  assert.equal(loadAfkLedger(gitCommonDir, ACTIVATION).sequence, 0);
  writeFileSync(join(paths.generations, `0000000000000001-${"b".repeat(64)}.afklog`), "broken\n", { mode: 0o600 });
  assert.equal(loadAfkLedger(gitCommonDir, ACTIVATION).ok, false);
});

test("competing valid non-prefix generations fail closed", () => {
  const gitCommonDir = root();
  const first = appendAfkLedgerRecord({ gitCommonDir, activationId: ACTIVATION, type: "blocked", body: blocked("AFK-FIRST"), recordedAt: NOW });
  assert.equal(first.ok, true);
  const alternateRecord = {
    schema: AFK_LEDGER_RECORD_SCHEMA,
    activationId: ACTIVATION,
    sequence: 1,
    type: "blocked",
    previousHash: AFK_LEDGER_ZERO_HASH,
    recordedAt: NOW,
    body: blocked("AFK-ALTERNATE"),
  };
  const alternate = encodeAfkLedgerFrame(alternateRecord);
  const paths = afkLedgerPaths(gitCommonDir, ACTIVATION);
  const path = join(paths.generations, `0000000000000001-${alternate.recordHash}.afklog`);
  writeFileSync(path, alternate.bytes, { mode: 0o600 });
  chmodSync(path, 0o600);
  assert.equal(loadAfkLedger(gitCommonDir, ACTIVATION).code, "AFK-LEDGER-COMPETING-GENERATIONS");
});

test("head CAS rejects stale append without mutation", () => {
  const gitCommonDir = root();
  const first = appendAfkLedgerRecord({ gitCommonDir, activationId: ACTIVATION, type: "blocked", body: blocked(), recordedAt: NOW });
  const before = readdirSync(afkLedgerPaths(gitCommonDir, ACTIVATION).generations);
  const stale = appendAfkLedgerRecord({
    gitCommonDir, activationId: ACTIVATION, type: "blocked", body: blocked("AFK-STALE"),
    recordedAt: NOW, expectedHeadSha256: "f".repeat(64),
  });
  assert.equal(first.ok, true);
  assert.equal(stale.code, "AFK-LEDGER-HEAD-CONFLICT");
  assert.deepEqual(readdirSync(afkLedgerPaths(gitCommonDir, ACTIVATION).generations), before);
});

test("live or unverifiable writer is never stolen", () => {
  const gitCommonDir = root();
  const acquired = acquireAfkWriterLock({ gitCommonDir, activationId: ACTIVATION, owner: owner() });
  assert.equal(acquired.ok, true);
  const contender = owner({ pid: 999, nonce: Buffer.alloc(32, 2) });
  assert.equal(acquireAfkWriterLock({ gitCommonDir, activationId: ACTIVATION, owner: contender }).code,
    "AFK-WRITER-LOCK-AMBIGUOUS");
  assert.equal(acquireAfkWriterLock({
    gitCommonDir, activationId: ACTIVATION, owner: contender,
    inspectOwner: () => ({ sameHost: true, sameBoot: true, dead: false }),
    appendRecoveryRecord: () => ({ ok: true }), observedAt: NOW,
  }).code, "AFK-WRITER-LOCK-LIVE-OR-FOREIGN");
  assert.equal(readFileSync(acquired.path, "utf8").includes(owner().ownerNonce), true);
  assert.equal(releaseAfkWriterLock(acquired).ok, true);
});

test("same-host same-boot proven-dead recovery records tombstone before replacement", () => {
  const gitCommonDir = root();
  const stale = acquireAfkWriterLock({ gitCommonDir, activationId: ACTIVATION, owner: owner() });
  const nextOwner = owner({ pid: 999, nonce: Buffer.alloc(32, 2) });
  let tombstoneSawStale = false;
  const recovered = acquireAfkWriterLock({
    gitCommonDir,
    activationId: ACTIVATION,
    owner: nextOwner,
    inspectOwner: () => ({ sameHost: true, sameBoot: true, dead: true }),
    appendRecoveryRecord: (body) => {
      tombstoneSawStale = readFileSync(stale.path, "utf8").includes(body.oldOwner.ownerNonce);
      assert.equal(body.newOwner.ownerNonce, nextOwner.ownerNonce);
      return { ok: true };
    },
    observedAt: NOW,
  });
  assert.equal(recovered.ok, true);
  assert.equal(tombstoneSawStale, true);
  assert.equal(readFileSync(recovered.path, "utf8").includes(nextOwner.ownerNonce), true);
  const wrongRelease = { ...recovered, owner: owner({ pid: 7, nonce: Buffer.alloc(32, 3) }) };
  assert.equal(releaseAfkWriterLock(wrongRelease).code, "AFK-WRITER-LOCK-OWNER-MISMATCH");
  assert.equal(releaseAfkWriterLock(recovered).ok, true);
});
