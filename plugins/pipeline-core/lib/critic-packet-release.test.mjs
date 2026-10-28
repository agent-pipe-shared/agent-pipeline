// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { releaseCriticPacket } from "./critic-packet-release.mjs";

const ID = "a".repeat(32);
function fixture(phase = "claimed") {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "critic-release-")));
  mkdirSync(join(root, ID));
  writeFileSync(join(root, ID, "packet.json"), "{}");
  writeFileSync(join(root, ID, "state.json"), JSON.stringify({ phase }));
  mkdirSync(join(root, "generic-batches", "b".repeat(32)), { recursive: true });
  writeFileSync(join(root, "generic-batches", "b".repeat(32), "full-admission.json"), JSON.stringify({ packetId: ID }));
  return root;
}

test("D60 (c) release of a claimed packet frees the reservation and writes one audit record", () => {
  const root = fixture();
  try {
    const out = releaseCriticPacket({ controlRoot: root, packetId: ID, reason: "failed earlier admit" });
    assert.equal(out.status, "released");
    assert.equal(out.phaseBefore, "claimed");
    assert.equal(existsSync(join(root, ID)), false);
    assert.equal(existsSync(join(root, "generic-batches", "b".repeat(32), "full-admission.json")), false);
    const lines = readFileSync(join(root, "released", "audit.jsonl"), "utf8").trim().split("\n");
    assert.equal(lines.length, 1);
    const record = JSON.parse(lines[0]);
    assert.equal(record.packetId, ID);
    assert.equal(record.phaseBefore, "claimed");
    assert.equal(record.reason, "failed earlier admit");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("D60 (d) a second release is idempotent and writes no second record", () => {
  const root = fixture();
  try {
    releaseCriticPacket({ controlRoot: root, packetId: ID, reason: "failed earlier admit" });
    const again = releaseCriticPacket({ controlRoot: root, packetId: ID, reason: "failed earlier admit" });
    assert.equal(again.status, "already-released");
    assert.equal(readFileSync(join(root, "released", "audit.jsonl"), "utf8").trim().split("\n").length, 1);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("D60 (e) a consumed packet is refused typed and stays in place", () => {
  const root = fixture("consumed");
  try {
    assert.throws(() => releaseCriticPacket({ controlRoot: root, packetId: ID, reason: "cleanup attempt" }), (e) => e.code === "CPR-PHASE");
    assert.equal(existsSync(join(root, ID)), true);
    assert.equal(existsSync(join(root, "released", "audit.jsonl")), false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("D60 (f) a missing, empty or path-bearing reason is refused", () => {
  const root = fixture();
  try {
    for (const reason of [undefined, "", "  ", "see /home/user/x"]) {
      assert.throws(() => releaseCriticPacket({ controlRoot: root, packetId: ID, reason }), (e) => e.code === "CPR-REASON");
    }
    assert.equal(existsSync(join(root, ID)), true);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("D60 (g) the audit record carries no absolute path", () => {
  const root = fixture();
  try {
    releaseCriticPacket({ controlRoot: root, packetId: ID, reason: "failed earlier admit" });
    const text = readFileSync(join(root, "released", "audit.jsonl"), "utf8");
    assert.equal(text.includes(root), false);
    assert.doesNotMatch(text, /["':]\/[a-z]|[A-Za-z]:\\/u);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
