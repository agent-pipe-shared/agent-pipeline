#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { BOOTSTRAP_PAYLOAD_MAX_BYTES, measureBootstrapBytes } from "../lib/bootstrap-payload-budget.mjs";
import { buildReceipt } from "./bootstrap-payload-measure.mjs";
import { observePipelineStartPreflight } from "./pipeline-start-preflight.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const coreBytes = readFileSync(join(here, "..", "skills", "pipeline-start", "SKILL.md")).byteLength;
const envelopeBytes = Buffer.byteLength(JSON.stringify({ schema: "pipeline.bootstrap-happy-path-envelope.v1" }), "utf8");
const measurement = measureBootstrapBytes(coreBytes + envelopeBytes, { mode: "normal" });
assert.equal(measurement.metric, "utf8-byte-upper-bound");
assert.equal(measurement.exactModelTokens, false);
assert.equal(measurement.withinBudget, true);
const overBudget = measureBootstrapBytes(BOOTSTRAP_PAYLOAD_MAX_BYTES + 1, { mode: "normal" });
assert.equal(overBudget.withinBudget, false);

const normalReceipt = buildReceipt({ root: join(here, "..") });
assert.equal(normalReceipt.schema, "pipeline.bootstrap-payload-receipt.v1");
assert.equal(normalReceipt.segments.length, 2);
assert.equal(normalReceipt.originalMeasurement.upperBoundUnits,
  normalReceipt.segments.reduce((sum, segment) => sum + segment.utf8Bytes, 0));

// Deterministic, hermetic default for the origin/content attestation
// dependency (design: bootstrap-origin-allowlist-and-codex-wsl-freshness.md
// §A.2/§A.3; fix per Critic finding F5, WP2-WP3-partA-rework-1) -- this
// sibling suite ran without any `observe` override, so it performed a real
// observation (subprocess + full recursive tree hash) against the real
// plugin tree on every Verify run instead of the fixture-only measurement it
// is meant to be. Mirrors the same shape `pipeline-start-preflight.test.mjs`
// already injects.
const readyObservation = () => ({
  schema: "pipeline.public-core-observation.v1",
  status: "ready",
  candidate: {
    repository: "https://github.com/agent-pipe-shared/agent-pipeline.git",
    branch: "main",
    commit: "a".repeat(40),
    tree: "b".repeat(40),
  },
  plugin: {
    name: "pipeline-core",
    version: "0.4.5+test",
    manifestSha256: "c".repeat(64),
    contentSha256: "d".repeat(64),
  },
});

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
  observe: readyObservation,
});
assert.equal(normalPreflight.bootstrapPayload.schema, "pipeline.bootstrap-payload-receipt.v1");
assert.equal(normalPreflight.bootstrapPayload.mode, "normal");
assert.equal(normalPreflight.bootstrapPayload.originalMeasurement.withinBudget, true);
assert.deepEqual(normalPreflight.bootstrapPayload.retainedChecks, [
  "lifecycle", "authority", "calibration", "handover", "verify", "continuation",
]);

const temp = mkdtempSync("/tmp/bootstrap-envelope-");
const envelopePath = join(temp, "envelope.json");
writeFileSync(envelopePath, JSON.stringify({ schema: "pipeline.test-envelope.v1", payload: "x".repeat(50_000) }));
const overReceipt = buildReceipt({ root: join(here, ".."), envelope: JSON.parse(readFileSync(envelopePath, "utf8")) });
assert.equal(overReceipt.overBudget, true);
assert.equal(overReceipt.originalMeasurement.withinBudget, false);
assert.equal(overReceipt.truncated, true);
assert.equal(overReceipt.segments[1].name, "machine-readback-envelope");
rmSync(temp, { recursive: true, force: true });

// ---------------------------------------------------------------------------------------------
// Single-owner property. This number existed as five copies -- the payload budget itself, this
// suite's over-budget probe, pipeline-start-preflight's probe, pipeline-start-v3's SKILL.md cap,
// and a sentence of SKILL.md prose -- and a PO-authorized raise reached exactly one of them. Two
// registered suites went red, and the two probes would have inverted silently. A second copy now
// fails here instead, immediately and by name.
//
// The scan pattern is BUILT FROM the constant at runtime and never typed, so this file cannot
// trip its own check and the check follows the owner if the value ever changes again. Whole-line
// and block comments are stripped first, deliberately: a comment is the RECORD of a decision
// (v3's authorization note names both the old and the new value on purpose, and must keep doing
// so), while a literal in executable code is a value that can silently disagree with the owner.
// A trailing comment is not stripped -- counting one is the safe direction to be wrong in.
const budgetLiteral = new RegExp(`\\b${String(BOOTSTRAP_PAYLOAD_MAX_BYTES).split("").join("[_,]?")}\\b`, "gu");
const executableSource = (relative) => readFileSync(join(here, relative), "utf8")
  .replace(/\/\*[\s\S]*?\*\//gu, "")
  .replace(/^[ \t]*\/\/[^\n]*$/gmu, "");
const budgetLiteralCount = (relative) => (executableSource(relative).match(budgetLiteral) ?? []).length;

const OWNER = join("..", "lib", "bootstrap-payload-budget.mjs");
assert.equal(budgetLiteralCount(OWNER), 1, `${OWNER} must state the budget exactly once -- it is the owner`);

for (const consumer of [
  join("..", "lib", "bootstrap-payload-budget.test.mjs"),
  join("..", "hooks", "post-compact-reground.mjs"),
  join("..", "skills", "pipeline-start", "pipeline-start-v3.test.mjs"),
  "bootstrap-payload-measure.mjs",
  "bootstrap-payload-measure.test.mjs",
  "pipeline-start-preflight.mjs",
  "pipeline-start-preflight.test.mjs",
]) {
  assert.equal(budgetLiteralCount(consumer), 0,
    `${consumer} carries a second literal of the budget; import BOOTSTRAP_PAYLOAD_MAX_BYTES instead`);
}

// SKILL.md is the one copy that cannot import: it is prose every agent reads at every bootstrap,
// and it kept naming the pre-raise threshold. Pinned to the owner rather than trusted to be
// updated by hand -- this sentence is a contract, so reword it and this assertion tells you.
const skillPath = join(here, "..", "skills", "pipeline-start", "SKILL.md");
const skillSource = readFileSync(skillPath, "utf8");
const skillBudgetPhrase = /an original payload over ([\d,]+) is rejected/u.exec(skillSource);
assert.ok(skillBudgetPhrase, "SKILL.md must state the rejection threshold in the pinned sentence");
assert.equal(Number(skillBudgetPhrase[1].replaceAll(",", "")), BOOTSTRAP_PAYLOAD_MAX_BYTES,
  `SKILL.md states ${skillBudgetPhrase[1]} as the rejection threshold, disagreeing with the owner`);

// The boundary the owner defines, exercised one byte either side of it.
assert.equal(measureBootstrapBytes(BOOTSTRAP_PAYLOAD_MAX_BYTES, { mode: "normal" }).withinBudget, true);
assert.equal(measureBootstrapBytes(BOOTSTRAP_PAYLOAD_MAX_BYTES + 1, { mode: "normal" }).withinBudget, false);

// SKILL.md is edited by hand and is itself the thing being budgeted, so re-measure the real file
// against the real owner rather than assuming an edit left headroom.
const skillBytes = Buffer.byteLength(skillSource, "utf8");
assert.ok(skillBytes <= BOOTSTRAP_PAYLOAD_MAX_BYTES,
  `SKILL.md is ${skillBytes} bytes, over the ${BOOTSTRAP_PAYLOAD_MAX_BYTES}-byte owner budget`);
