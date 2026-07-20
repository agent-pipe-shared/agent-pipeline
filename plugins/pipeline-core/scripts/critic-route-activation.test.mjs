#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import { lstatSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { approveActivation, bindActivationEvidence, canonicalJson, createActivationJournal, decideRouteApplication, evaluateStrongUnblock, loadPersistedActivation, persistNewActivation, recordApplied, recordVerified, replacePersistedActivation, sha256, suspendActivation, validateActivationJournal } from "./critic-route-activation.mjs";

const H = (digit) => digit.repeat(64);
test("activation schema parses and closes journal, route and evidence vocabulary", () => {
  const schema = JSON.parse(readFileSync(new URL("./critic-route-activation.schema.json", import.meta.url), "utf8"));
  assert.equal(schema.additionalProperties, false);
  assert.equal(schema.properties.route.additionalProperties, false);
  assert.equal(schema.properties.evidence.additionalProperties, false);
});
function prepared() {
  const inventory = [{ path: "plugins/pipeline-core/config/critic-route.json", preimageSha256: H("1"), postimageSha256: H("2") }];
  return createActivationJournal({ activationId: "activation-1", mode: "intermediate", runnerId: "codex", primaryLaneId: "codex-sandbox-intermediate", fallbackLaneId: "codex-host-functional-read-only", route: { projectionPath: inventory[0].path, preimageSha256: H("1"), postimageSha256: H("2"), inventory, inventorySha256: sha256(Buffer.from(canonicalJson(inventory))) }, createdAtMs: 100 });
}
function evidence() { return { preflightSha256: H("4"), runnerSha256: H("5"), compatibilitySha256: H("6"), shadowSha256: H("7"), verifySha256: H("8"), t1Sha256: H("9"), compatibilityEntryId: "codex-0.144.6-wsl2-native-intermediate" }; }

test("activation requires evidence then exact PO approval before route CAS", () => {
  let journal = prepared();
  assert.equal(decideRouteApplication(journal, H("1")).action, "suspend");
  journal = bindActivationEvidence(journal, evidence(), 101);
  journal = approveActivation(journal, { approvalId: "po-1", approvedAtMs: 102, attributedTo: "PO" }, 102);
  assert.equal(decideRouteApplication(journal, H("1")).action, "compare-and-replace");
  journal = recordApplied(journal, H("2"), 103);
  const appliedSha = sha256(Buffer.from(JSON.stringify(journal)));
  journal = recordVerified(journal, { state: "intermediate-production-eligible", activationReceiptSha256: appliedSha, routePostimageSha256: H("2") }, appliedSha, 104);
  assert.equal(journal.status, "verified");
  assert.equal(validateActivationJournal(journal), journal);
});

test("postimage replay is zero-write and unrelated route drift suspends", () => {
  let journal = bindActivationEvidence(prepared(), evidence(), 101);
  journal = approveActivation(journal, { approvalId: "po-1", approvedAtMs: 102, attributedTo: "PO" }, 102);
  assert.equal(decideRouteApplication(journal, H("2")).action, "record-applied");
  assert.equal(decideRouteApplication(journal, H("0")).action, "suspend");
  journal = suspendActivation(journal, 103);
  assert.equal(journal.status, "suspended");
});

test("approval cannot precede evidence and must be PO-attributed", () => {
  assert.throws(() => approveActivation(prepared(), { approvalId: "po-1", approvedAtMs: 101, attributedTo: "PO" }, 101), { code: "F5-TRANSITION" });
  const journal = bindActivationEvidence(prepared(), evidence(), 101);
  assert.throws(() => approveActivation(journal, { approvalId: "po-1", approvedAtMs: 102, attributedTo: "coordinator" }, 102), { code: "F5-APPROVAL" });
});

test("strong unblock requires all exact fresh network-denied target classes", () => {
  const base = { cliVersion: "0.200.0", releasedArtifactSha256: H("1"), officialReleaseReceiptSha256: H("2"), compatibilityPolicySha256: H("3"), profileSha256: H("4"), schemaSha256: H("5"), upstreamIssueReproduces: false, nowMs: 1_000_000 };
  const receipt = (filesystemClass) => ({ ...base, filesystemClass, eligibility: "strong", networkEnabled: false, bootId: `boot-${filesystemClass}`, runBootId: `boot-${filesystemClass}`, observedAtMs: base.nowMs - 1 });
  const receipts = [receipt("native-linux"), receipt("drvfs"), receipt("wsl-native")];
  assert.deepEqual(evaluateStrongUnblock({ ...base, receipts }), { eligible: true, reason: "exact-three-target-matrix" });
  receipts[1].networkEnabled = true;
  assert.equal(evaluateStrongUnblock({ ...base, receipts }).eligible, false);
  assert.equal(evaluateStrongUnblock({ ...base, upstreamIssueReproduces: true, receipts }).reason, "upstream-still-reproduces");
});

test("activation journal persistence is mode-0600, CAS-bound and torn-write aware", (t) => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "critic-activation-")));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const initial = prepared(); const stored = persistNewActivation(root, initial);
  assert.equal(lstatSync(stored.paths.journal).mode & 0o777, 0o600);
  const next = bindActivationEvidence(initial, evidence(), 101);
  replacePersistedActivation(root, stored.rawSha256, next);
  assert.equal(loadPersistedActivation(root, initial.activationId).journal.status, "evidence-bound");
  assert.throws(() => replacePersistedActivation(root, stored.rawSha256, approveActivation(next, { approvalId: "po-1", approvedAtMs: 102, attributedTo: "PO" }, 102)), { code: "F5-CAS" });
  writeFileSync(join(stored.paths.directory, ".journal.fixture.tmp"), "partial\n", { mode: 0o600 });
  assert.throws(() => loadPersistedActivation(root, initial.activationId), { code: "F5-TORN-POSTIMAGE" });
});
