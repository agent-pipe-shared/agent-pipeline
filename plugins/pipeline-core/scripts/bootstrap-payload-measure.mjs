#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { measureBootstrapBytes, BOOTSTRAP_PAYLOAD_MAX_BYTES } from "../lib/bootstrap-payload-budget.mjs";

export const DEFAULT_ENVELOPE = {
  schema: "pipeline.bootstrap-happy-path-envelope.v1",
  role: "runner-neutral",
  checks: ["lifecycle", "authority", "calibration", "handover", "verify", "continuation"],
};
export function buildReceipt({ root, envelope = DEFAULT_ENVELOPE } = {}) {
  const skillPath = join(resolve(root ?? new URL("..", import.meta.url).pathname), "skills", "pipeline-start", "SKILL.md");
  const coreSkillUtf8Bytes = readFileSync(skillPath).byteLength;
  const envelopeUtf8Bytes = Buffer.byteLength(JSON.stringify(envelope), "utf8");
  const segments = [
  { name: "core-skill", utf8Bytes: coreSkillUtf8Bytes },
  { name: "machine-readback-envelope", utf8Bytes: envelopeUtf8Bytes },
];
  const injectedUpperBoundUnits = segments.reduce((sum, segment) => sum + segment.utf8Bytes, 0);
  const originalMeasurement = measureBootstrapBytes(injectedUpperBoundUnits, { mode: "normal" });
  const emittedMeasurement = measureBootstrapBytes(Math.min(injectedUpperBoundUnits, BOOTSTRAP_PAYLOAD_MAX_BYTES), { mode: "normal" });
  return {
  schema: "pipeline.bootstrap-payload-receipt.v1",
  metric: "utf8-byte-upper-bound",
  maxUpperBoundUnits: BOOTSTRAP_PAYLOAD_MAX_BYTES,
  originalMeasurement,
  emittedMeasurement,
  truncated: !originalMeasurement.withinBudget,
  overBudget: !originalMeasurement.withinBudget,
  parity: { codex: "runner-neutral", claude: "runner-neutral" },
    segments,
  };
}

export function main(argv = process.argv) {
  const root = resolve(argv[2] ?? new URL("..", import.meta.url).pathname);
  const envelopePath = argv[3] ?? null;
  const envelope = envelopePath ? JSON.parse(readFileSync(resolve(envelopePath), "utf8")) : DEFAULT_ENVELOPE;
  const output = buildReceipt({ root, envelope });
  process.stdout.write(`${JSON.stringify(output)}\n`);
  process.exitCode = output.overBudget ? 2 : 0;
  return output;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname)) main();
