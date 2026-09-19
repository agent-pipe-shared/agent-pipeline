// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { recordCriticVerifyLifecycle, readCriticVerifyLifecycle } from "./critic-verify-lifecycle.mjs";
import { canonicalJson, sha256 } from "../scripts/critic-packet-preflight.mjs";

const oid = char => char.repeat(40);
const sha = char => char.repeat(64);
const candidate = { commit: oid("a"), tree: oid("b") };
const evidence = { schema: "pipeline.verify-evidence.v0", exitCode: 0, candidate: { ...candidate }, verifyRun: { terminalSha256: sha("c") } };
function critic(overrides = {}) {
  return {
    schema: "pipeline.session-critic-receipt.v1", packetId: "d".repeat(32), packetDigest: sha("e"),
    session: { id: "review-1", freshContext: true, historyInherited: false, mayDelegate: false },
    candidate: { base: oid("f"), ...candidate }, reviewRange: { base: oid("f"), commit: candidate.commit, diffSha256: sha("1") },
    rulesetSha: oid("2"), assurance: "functional-equivalent-read-only; OS isolation not asserted", verdictSha256: sha("3"), findingCount: 0, reviewPass: true,
    ...overrides,
  };
}
function consumed(receipt) {
  const packet = {
    packetId: receipt.packetId,
    candidate: { ...receipt.candidate },
    diff: { base: receipt.reviewRange.base, commit: receipt.reviewRange.commit, sha256: receipt.reviewRange.diffSha256 },
  };
  receipt.packetDigest = sha256(canonicalJson(packet));
  return { packet, receipt };
}
function fixture(t) {
  const common = mkdtempSync(join(tmpdir(), "critic-verify-lifecycle-"));
  t.after(() => rmSync(common, { recursive: true, force: true }));
  return common;
}
test("records a consumed passing Critic receipt and rebinds exact Verify bytes", t => {
  const common = fixture(t);
  const source = critic();
  const recorded = recordCriticVerifyLifecycle({ gitCommonDir: common, criticPacketId: source.packetId, candidate, evidencePath: "evidence/verify.json", evidence }, {
    readConsumedCandidateReceiptFn: () => consumed(source),
  });
  const read = readCriticVerifyLifecycle({ gitCommonDir: common, id: recorded.receipt.id, candidate, evidencePath: "evidence/verify.json", evidence });
  assert.equal(read.receiptSha256, recorded.receiptSha256);
  assert.equal(read.receipt.critic.packetId, source.packetId);
});
test("refuses failed, stale, or forged Critic/Verify bindings", t => {
  const common = fixture(t);
  const failed = critic({ reviewPass: false, findingCount: 1 });
  assert.throws(() => recordCriticVerifyLifecycle({ gitCommonDir: common, criticPacketId: failed.packetId, candidate, evidencePath: "evidence/verify.json", evidence }, {
    readConsumedCandidateReceiptFn: () => consumed(failed),
  }), error => error.code === "CVL-CRITIC-FAILED");
  const stale = critic({ candidate: { base: oid("f"), commit: oid("4"), tree: candidate.tree }, reviewRange: { base: oid("f"), commit: oid("4"), diffSha256: sha("1") } });
  assert.throws(() => recordCriticVerifyLifecycle({ gitCommonDir: common, criticPacketId: stale.packetId, candidate, evidencePath: "evidence/verify.json", evidence }, {
    readConsumedCandidateReceiptFn: () => consumed(stale),
  }), error => error.code === "CVL-CRITIC-STALE");
  const source = critic();
  const recorded = recordCriticVerifyLifecycle({ gitCommonDir: common, criticPacketId: source.packetId, candidate, evidencePath: "evidence/verify.json", evidence }, {
    readConsumedCandidateReceiptFn: () => consumed(source),
  });
  assert.throws(() => readCriticVerifyLifecycle({ gitCommonDir: common, id: recorded.receipt.id, candidate, evidencePath: "evidence/verify.json", evidence: { ...evidence, startedAt: "forged" } }), error => error.code === "CVL-VERIFY-DRIFT");
});
test("refuses a valid-looking receipt whose packet digest or diff is not the consumed packet", t => {
  const common = fixture(t);
  const source = critic();
  const forged = consumed(source);
  forged.packet.diff.sha256 = sha("9");
  assert.throws(() => recordCriticVerifyLifecycle({ gitCommonDir: common, criticPacketId: source.packetId, candidate, evidencePath: "evidence/verify.json", evidence }, {
    readConsumedCandidateReceiptFn: () => forged,
  }), error => error.code === "CVL-CRITIC-PACKET-MISMATCH");
});
