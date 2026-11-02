#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * Prints the sourced per-runner capability table (config/runner-capabilities.json) as one JSON line, or one runner's column.
 *
 *   node runner-capabilities.mjs [--runner <claude|codex|antigravity>]
 *
 * Read-only. The file states only facts another shipped document or script states; a cell without a source says so. It is
 * deliberately not part of the start preflight envelope: that readback is pinned and size-budgeted for all three runners, and
 * the cells have not been measured on a real Codex or Antigravity run.
 */
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const RUNNER_CAPABILITIES_SCHEMA = "pipeline.runner-capabilities.v1";
const RUNNERS = ["claude", "codex", "antigravity"];
const SOURCE = join(dirname(fileURLToPath(import.meta.url)), "..", "config", "runner-capabilities.json");

export function readRunnerCapabilities(path = SOURCE) {
  const table = JSON.parse(readFileSync(path, "utf8"));
  if (table?.schema !== RUNNER_CAPABILITIES_SCHEMA || !Array.isArray(table.rows)) throw new Error("RC-SCHEMA: the capability table is malformed");
  return table;
}

export function selectRunner(table, runner) {
  if (!RUNNERS.includes(runner)) throw new Error(`RC-RUNNER: runner must be one of ${RUNNERS.join(", ")}`);
  return { schema: table.schema, runner, rows: table.rows.map((row) => ({ topic: row.topic, value: row[runner], owner: row.owner })) };
}

export function main(argv = process.argv.slice(2), out = process.stdout) {
  let runner = null;
  if (argv.length === 2 && argv[0] === "--runner") runner = argv[1];
  else if (argv.length !== 0) { out.write(`${JSON.stringify({ ok: false, code: "RC-USAGE", message: "usage: runner-capabilities.mjs [--runner <claude|codex|antigravity>]" })}\n`); return 2; }
  try {
    const table = readRunnerCapabilities();
    out.write(`${JSON.stringify(runner === null ? table : selectRunner(table, runner))}\n`);
    return 0;
  } catch (error) {
    out.write(`${JSON.stringify({ ok: false, code: String(error.message).slice(0, 8).replace(/:.*$/u, ""), message: String(error.message).slice(0, 200) })}\n`);
    return 2;
  }
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main();
