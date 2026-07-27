#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  BACKLOG_DELIVERY_INTENT_SCHEMA,
  BACKLOG_SPEC_BINDING_SCHEMA,
  canonicalJson,
} from "../lib/backlog-delivery-reconciliation.mjs";
import { applyBacklogDelivery, materializeBacklogDelivery, previewBacklogDelivery, recoverBacklogDelivery } from "./reconcile-backlog-delivery.mjs";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const semanticDigest = (schema, value) => sha256(`${schema}\0${canonicalJson(value)}`);
const OID = "a".repeat(40);
const SHA = Object.freeze({ ledger: "b".repeat(64), index: "c".repeat(64), status: "d".repeat(64), subtree: "e".repeat(64), item: "f".repeat(64) });

function write(root, path, text) {
  const target = join(root, path);
  writeFileSync(target, text);
  return sha256(text);
}

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "reconcile-backlog-delivery-"));
  const authoritySha256 = write(root, "authority.json", "{\"decision\":\"intake\"}\n");
  const specificationSha256 = write(root, "spec.md", "# accepted spec\n");
  const evidenceSha256 = write(root, "evidence.md", "reviewed intake\n");
  const authority = { kind: "backlog-intake", decisionId: "nova-a1-intake", receiptPath: "authority.json", receiptSha256: authoritySha256 };
  const intent = {
    schema: BACKLOG_DELIVERY_INTENT_SCHEMA,
    intentId: "nova-a1-initialize",
    idempotencyKey: "",
    operation: "initialize",
    item: {
      id: "pipeline.example",
      path: "backlog/items/2026-07-25-example.md",
      expectedStatus: null,
      expectedFileSha256: SHA.item,
      draft: {
        metadata: { schema: "pipeline.backlog-item.v1", id: "pipeline.example", type: "defect", owner: "pipeline", status: "open", created: "2026-07-25", source: "fixture", tracking: "#57" },
        bodyBase64: Buffer.from("\n# Example\n", "utf8").toString("base64"),
        bodySha256: sha256("\n# Example\n"),
      },
    },
    sprint: { name: "Nova", increment: "A" },
    specification: { path: "spec.md", fileSha256: specificationSha256, approvalReceiptSha256: null },
    candidate: null,
    gates: [],
    authority,
    expected: { ledgerHead: SHA.ledger, indexFileSha256: SHA.index, statusFileSha256: SHA.status, backlogSubtree: SHA.subtree },
    evidence: [{ kind: "review", path: "evidence.md", fileSha256: evidenceSha256, recordSha256: null }],
    createdAt: "2026-07-25T12:00:00.000Z",
  };
  intent.idempotencyKey = semanticDigest(BACKLOG_DELIVERY_INTENT_SCHEMA, { operation: intent.operation, authority: intent.authority, expected: intent.expected });
  const binding = {
    schema: BACKLOG_SPEC_BINDING_SCHEMA,
    featureId: "sprint-nova-epic",
    specification: { path: "spec.md", sha256: specificationSha256 },
    backlogSnapshot: { commit: OID, tree: OID, backlogSubtree: SHA.subtree, ledgerHead: SHA.ledger, indexFileSha256: SHA.index, statusFileSha256: SHA.status, itemFileSha256: [] },
    bindings: [{ id: "pipeline.example", issue: 57, increment: "A", acceptanceIds: ["NVA-A57-1"], closureMode: "candidate-evidence", expiryDisposition: "not-applicable" }],
    recordSha256: "",
  };
  binding.recordSha256 = semanticDigest(BACKLOG_SPEC_BINDING_SCHEMA, Object.fromEntries(Object.entries(binding).filter(([key]) => key !== "recordSha256")));
  write(root, "intent.json", `${JSON.stringify(intent)}\n`);
  write(root, "binding.json", `${JSON.stringify(binding)}\n`);
  return { root, authority, intent, binding };
}

function stateFor(intent) {
  return {
    repository: "self", writerAuthority: "canonical-backlog-single-writer",
    commit: OID, tree: OID, ledgerHead: intent.expected.ledgerHead,
    indexFileSha256: intent.expected.indexFileSha256, statusFileSha256: intent.expected.statusFileSha256,
    backlogSubtree: intent.expected.backlogSubtree, itemFileSha256: [], nextSequence: 1,
    occupiedIds: [], occupiedPaths: [], receipts: [], item: null,
  };
}

function postimages(preview) {
  return preview.targets.map((target) => ({ path: target.path, bytes: `next bytes for ${target.path}\n` }));
}

test("emits a preview only after the exact authority, specification, and evidence bytes are observed", () => {
  const { root, intent } = fixture();
  try {
    const before = canonicalJson({ intent: JSON.parse(readFileSync(join(root, "intent.json"))), authority: readFileSync(join(root, "authority.json"), "utf8") });
    const result = previewBacklogDelivery(root, { intentPath: "intent.json", bindingPath: "binding.json" }, {
      readState: () => ({ ok: true, findings: [], state: stateFor(intent) }),
    });
    assert.equal(result.ok, true);
    assert.equal(result.preview.status, "preview");
    assert.equal(canonicalJson({ intent: JSON.parse(readFileSync(join(root, "intent.json"))), authority: readFileSync(join(root, "authority.json"), "utf8") }), before);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("materializes only the checked initialize target set and never accepts caller postimages", () => {
  const { root, intent } = fixture();
  try {
    const readState = () => ({ ok: true, findings: [], state: stateFor(intent) });
    const preview = previewBacklogDelivery(root, { intentPath: "intent.json", bindingPath: "binding.json" }, { readState }).preview;
    const materialized = materializeBacklogDelivery(root, { intentPath: "intent.json", bindingPath: "binding.json", preview }, {
      readState,
      currentState: { ok: true, items: [], events: [] },
    });
    assert.equal(materialized.ok, true, materialized.findings?.join("\n"));
    assert.deepEqual(materialized.postimages.map((entry) => entry.path).sort(), preview.targets.map((entry) => entry.path).sort());
    const item = materialized.postimages.find((entry) => entry.path === intent.item.path);
    assert.match(item.bytes, /status: "open"/);
    assert.match(materialized.postimages.find((entry) => entry.path === "backlog/transitions.ndjson").bytes, /pipeline.backlog-transition.v2/);

    const unsupported = { ...intent, operation: "amend-evidence" };
    write(root, "intent.json", `${JSON.stringify(unsupported)}\n`);
    const rejected = materializeBacklogDelivery(root, { intentPath: "intent.json", bindingPath: "binding.json", preview }, {
      readState,
      currentState: { ok: true, items: [], events: [] },
    });
    assert.equal(rejected.ok, false);
    assert.match(rejected.findings.join("\n"), /amend-evidence requires an exact amendment-intent evidence record/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("fails closed when authority is absent, stale, or does not authorize the operation", () => {
  const { root, intent, authority } = fixture();
  try {
    const readState = () => ({ ok: true, findings: [], state: stateFor(intent) });
    const absent = previewBacklogDelivery(root, { intentPath: "intent.json", bindingPath: "binding.json" }, { readState, readFile: (path, encoding) => {
      if (path.endsWith("authority.json")) throw new Error("not found");
      return readFileSync(path, encoding);
    } });
    writeFileSync(join(root, "authority.json"), "{\"decision\":\"changed\"}\n");
    const stale = previewBacklogDelivery(root, { intentPath: "intent.json", bindingPath: "binding.json" }, { readState });
    writeFileSync(join(root, "authority.json"), "{\"decision\":\"intake\"}\n");
    const wrongAuthority = { ...intent, authority: { ...authority, kind: "closure" } };
    wrongAuthority.idempotencyKey = semanticDigest(BACKLOG_DELIVERY_INTENT_SCHEMA, { operation: wrongAuthority.operation, authority: wrongAuthority.authority, expected: wrongAuthority.expected });
    write(root, "intent.json", `${JSON.stringify(wrongAuthority)}\n`);
    const mismatch = previewBacklogDelivery(root, { intentPath: "intent.json", bindingPath: "binding.json" }, { readState });
    for (const result of [absent, stale, mismatch]) assert.equal(result.ok, false);
    assert.match(absent.findings.join("\n"), /^UNAVAILABLE:/m);
    assert.match(stale.findings.join("\n"), /^STALE:/m);
    assert.match(mismatch.findings.join("\n"), /^AUTHORITY:/m);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("apply rejects stale previews, replay collisions, and an occupied transaction lock without writing targets", () => {
  const { root, intent } = fixture();
  try {
    let state = stateFor(intent);
    const readState = () => ({ ok: true, findings: [], state });
    const preview = previewBacklogDelivery(root, { intentPath: "intent.json", bindingPath: "binding.json" }, { readState }).preview;
    state = { ...state, ledgerHead: "1".repeat(64) };
    const stale = applyBacklogDelivery(root, { intentPath: "intent.json", bindingPath: "binding.json", preview, postimages: postimages(preview) }, { readState });
    assert.equal(stale.ok, false);
    assert.match(stale.findings.join("\n"), /^CAS:/m);
    assert.equal(existsSync(join(root, "backlog/.state-transaction.lock")), false);

    state = stateFor(intent);
    const current = previewBacklogDelivery(root, { intentPath: "intent.json", bindingPath: "binding.json" }, { readState }).preview;
    writeFileSync(join(root, "backlog/.state-transaction.lock"), `${JSON.stringify({ schema: "pipeline.backlog-transaction-lock.v1" })}\n`);
    const busy = applyBacklogDelivery(root, { intentPath: "intent.json", bindingPath: "binding.json", preview: current, postimages: postimages(current) }, { readState });
    assert.equal(busy.ok, false);
    assert.match(busy.findings.join("\n"), /^CONFLICT:/m);
    assert.equal(existsSync(join(root, "backlog/STATUS.md")), false);
    rmSync(join(root, "backlog/.state-transaction.lock"));

    const collision = { schema: "pipeline.backlog-reconciliation-receipt.v1", idempotencyKey: intent.idempotencyKey, intentSha256: "0".repeat(64), status: "applied" };
    writeFileSync(join(root, "backlog/receipts-collision.json"), JSON.stringify(collision));
    // The canonical receipt filename is the idempotency key: a malformed or
    // different intent there is a collision, never a successful replay.
    const receiptDir = join(root, "backlog/receipts");
    mkdirSync(receiptDir, { recursive: true });
    writeFileSync(join(receiptDir, `${intent.idempotencyKey}.json`), JSON.stringify(collision));
    const replayCollision = applyBacklogDelivery(root, { intentPath: "intent.json", bindingPath: "binding.json", preview: current, postimages: postimages(current) }, { readState });
    assert.equal(replayCollision.ok, false);
    assert.match(replayCollision.findings.join("\n"), /^CONFLICT:/m);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("interruption retains a recoverable journal and never reports an applied receipt", () => {
  const { root, intent } = fixture();
  try {
    const readState = () => ({ ok: true, findings: [], state: stateFor(intent) });
    const preview = previewBacklogDelivery(root, { intentPath: "intent.json", bindingPath: "binding.json" }, { readState }).preview;
    const failedPath = join(root, "backlog/STATUS.md");
    const result = applyBacklogDelivery(root, { intentPath: "intent.json", bindingPath: "binding.json", preview, postimages: postimages(preview) }, {
      readState,
      fs: { renameSync(from, to) { if (to === failedPath) throw new Error("injected interruption"); return renameSync(from, to); } },
    });
    assert.equal(result.ok, false);
    assert.equal(result.applied, false);
    assert.equal(result.receipt, null);
    assert.equal(existsSync(join(root, "backlog/.state-transaction.json")), true);
    assert.equal(existsSync(join(root, `backlog/receipts/${intent.idempotencyKey}.json`)), false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("recovery restores an interrupted preimage once, and a committed receipt replays idempotently", () => {
  const { root, intent } = fixture();
  try {
    const readState = () => ({ ok: true, findings: [], state: stateFor(intent) });
    const preview = previewBacklogDelivery(root, { intentPath: "intent.json", bindingPath: "binding.json" }, { readState }).preview;
    const failedPath = join(root, "backlog/STATUS.md");
    applyBacklogDelivery(root, { intentPath: "intent.json", bindingPath: "binding.json", preview, postimages: postimages(preview) }, {
      readState,
      fs: { renameSync(from, to) { if (to === failedPath) throw new Error("injected interruption"); return renameSync(from, to); } },
    });
    const recovered = recoverBacklogDelivery(root, { proveOwnerGone: true });
    const repeatedRecovery = recoverBacklogDelivery(root, { proveOwnerGone: true });
    assert.equal(recovered.ok, true, recovered.findings.join("\n"));
    assert.equal(recovered.recovered, true);
    assert.equal(repeatedRecovery.ok, true);
    assert.equal(repeatedRecovery.recovered, false);
    assert.equal(existsSync(join(root, "backlog/STATUS.md")), false);

    const applied = applyBacklogDelivery(root, { intentPath: "intent.json", bindingPath: "binding.json", preview, postimages: postimages(preview) }, { readState, readback: () => true });
    const replay = applyBacklogDelivery(root, { intentPath: "intent.json", bindingPath: "binding.json", preview, postimages: postimages(preview) }, { readState, readback: () => true });
    assert.equal(applied.ok, true);
    assert.equal(applied.replayed, false);
    assert.equal(replay.ok, true);
    assert.equal(replay.replayed, true);
    assert.deepEqual(replay.receipt, applied.receipt);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
