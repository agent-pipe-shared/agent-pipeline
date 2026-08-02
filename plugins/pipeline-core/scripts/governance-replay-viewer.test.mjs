// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { main } from "./governance-replay-viewer.mjs";

const candidate = { commit: "a".repeat(40), tree: "b".repeat(40) };
const source = { schema: "pipeline.governance-replay-readback.v1", status: "observed", authority: "non-authoritative", reason: null, checkpoint: { sequence: 1 }, timelines: [{ schema: "pipeline.governance-replay.v1", authority: "non-authoritative", dispatchId: "dispatch-1", status: "observed", events: [{ sequence: 1, eventDigest: "1".repeat(64), occurredAtEpochMs: 1, kind: "dispatch", status: "active", reasonCode: "DISPATCHED", correlation: { packageId: "phoenix-17", dispatchId: "dispatch-1", attemptId: "attempt-1", workerId: "worker-1" }, candidate, eventId: "event-1", invalidatesEventId: null, supersedesEventId: null }] }] };

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
