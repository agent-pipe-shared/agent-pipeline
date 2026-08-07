#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { measureBootstrapBytes } from "../lib/bootstrap-payload-budget.mjs";
import { buildReceipt } from "./bootstrap-payload-measure.mjs";
import { observePipelineStartPreflight } from "./pipeline-start-preflight.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const coreBytes = readFileSync(join(here, "..", "skills", "pipeline-start", "SKILL.md")).byteLength;
const envelopeBytes = Buffer.byteLength(JSON.stringify({ schema: "pipeline.bootstrap-happy-path-envelope.v1" }), "utf8");
const measurement = measureBootstrapBytes(coreBytes + envelopeBytes, { mode: "normal" });
assert.equal(measurement.metric, "utf8-byte-upper-bound");
assert.equal(measurement.exactModelTokens, false);
assert.equal(measurement.withinBudget, true);
const overBudget = measureBootstrapBytes(15_001, { mode: "normal" });
assert.equal(overBudget.withinBudget, false);

const normalReceipt = buildReceipt({ root: join(here, "..") });
assert.equal(normalReceipt.schema, "pipeline.bootstrap-payload-receipt.v1");
assert.equal(normalReceipt.segments.length, 2);
assert.equal(normalReceipt.originalMeasurement.upperBoundUnits,
  normalReceipt.segments.reduce((sum, segment) => sum + segment.utf8Bytes, 0));

const normalPreflight = observePipelineStartPreflight({
  env: {},
  cwd: "/tmp/normal-bootstrap-fixture",
  read: () => JSON.stringify({ version: "0.4.5+test" }),
  pluginList: () => JSON.stringify({
    installed: [{
      pluginId: "pipeline-core@agent-pipeline",
      name: "pipeline-core",
      marketplaceName: "agent-pipeline",
      version: "0.4.5+test",
      installed: true,
      enabled: true,
      source: { source: "local", path: "/cache/agent-pipeline/plugins/pipeline-core" },
      marketplaceSource: { sourceType: "git", source: "https://example.invalid/agent-pipeline.git" },
    }],
  }),
});
assert.equal(normalPreflight.bootstrapPayload.schema, "pipeline.bootstrap-payload-receipt.v1");
assert.equal(normalPreflight.bootstrapPayload.mode, "normal");
assert.equal(normalPreflight.bootstrapPayload.originalMeasurement.withinBudget, true);
assert.deepEqual(normalPreflight.bootstrapPayload.retainedChecks, [
  "lifecycle", "authority", "calibration", "handover", "verify", "continuation",
]);

const temp = mkdtempSync("/tmp/bootstrap-envelope-");
const envelopePath = join(temp, "envelope.json");
writeFileSync(envelopePath, JSON.stringify({ schema: "pipeline.test-envelope.v1", payload: "x".repeat(20_000) }));
const overReceipt = buildReceipt({ root: join(here, ".."), envelope: JSON.parse(readFileSync(envelopePath, "utf8")) });
assert.equal(overReceipt.overBudget, true);
assert.equal(overReceipt.originalMeasurement.withinBudget, false);
assert.equal(overReceipt.truncated, true);
assert.equal(overReceipt.segments[1].name, "machine-readback-envelope");
rmSync(temp, { recursive: true, force: true });
