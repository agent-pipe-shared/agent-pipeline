// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { buildGovernanceActionEvent } from "../lib/governance-action-events.mjs";
import { main } from "./governance-replay-viewer.mjs";

const candidate = { commit: "a".repeat(40), tree: "b".repeat(40) };
const source = { schema: "pipeline.governance-replay-readback.v1", status: "observed", authority: "non-authoritative", reason: null, checkpoint: { sequence: 1 }, timelines: [{ schema: "pipeline.governance-replay.v1", authority: "non-authoritative", dispatchId: "dispatch-1", status: "observed", events: [{ sequence: 1, eventDigest: "1".repeat(64), occurredAtEpochMs: 1, kind: "dispatch", status: "active", reasonCode: "DISPATCHED", correlation: { packageId: "phoenix-17", dispatchId: "dispatch-1", attemptId: "attempt-1", workerId: "worker-1", correlationId: "correlation-1", queueRevision: 0 }, candidate, eventId: "event-1", invalidatesEventId: null, supersedesEventId: null }] }] };
const actionPayload = buildGovernanceActionEvent({ kind: "verification", status: "completed", reasonCode: "VERIFICATION_PASSED", requestId: "verify-viewer-1", featureId: { state: "not-applicable" }, sessionId: { state: "not-applicable" }, candidate });
const sourceV2 = { schema: "pipeline.governance-replay-readback.v2", status: "observed", authority: "non-authoritative", reason: null, checkpoint: { repositoryFingerprint: "f".repeat(64), streamId: "lifecycle", sequence: 2, eventDigest: "2".repeat(64), candidateCommit: candidate.commit, candidateTree: candidate.tree }, dispatchTimelines: source.timelines, actionTimelines: [{ schema: "pipeline.governance-action-replay.v1", authority: "non-authoritative", actionId: actionPayload.correlation.actionId, status: "observed", events: [{ sequence: 2, eventDigest: "2".repeat(64), occurredAtEpochMs: 2, ...actionPayload }] }] };

test("creates a new offline replay report and refuses an overwrite", async () => {
  const root = mkdtempSync(join(tmpdir(), "replay-viewer-"));
  writeFileSync(join(root, "replay.json"), JSON.stringify(source));
  const receipt = await main(["build", "--root", root, "--replay", "replay.json", "--output", "reports/replay.html"]);
  assert.equal(receipt.state, "observed");
  assert.equal(existsSync(join(root, "reports", "replay.html")), true);
  assert.match(readFileSync(join(root, "reports", "replay.html"), "utf8"), /Governance Replay/);
  await assert.rejects(main(["build", "--root", root, "--replay", "replay.json", "--output", "reports/replay.html"]), (error) => error.code === "GRVC-OUTPUT-EXISTS");
});

test("rejects a replay path that escapes the checkout", async () => {
  const root = mkdtempSync(join(tmpdir(), "replay-viewer-"));
  await assert.rejects(main(["build", "--root", root, "--replay", "../replay.json", "--output", "report.html"]), (error) => error.code === "GRVC-REPLAY");
});

test("renders v2 actions in a separate non-authoritative section", async () => {
  const root = mkdtempSync(join(tmpdir(), "replay-viewer-"));
  writeFileSync(join(root, "replay.json"), JSON.stringify(sourceV2));
  await main(["build", "--root", root, "--replay", "replay.json", "--output", "replay.html"]);
  const html = readFileSync(join(root, "replay.html"), "utf8");
  assert.match(html, /Governance actions/);
  assert.match(html, /non-authoritative observations/);
  assert.doesNotMatch(html, /verify-viewer-1/);
});
