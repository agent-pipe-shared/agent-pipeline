#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

/**
 * CLI: strip a dispatch record's implementor prose (report.text, log,
 * dispatcher, criticSkip, modelOverride.rationale, and every other field not
 * on the declared safe set) before citing it as authorship evidence in a
 * Critic dispatch (dispatch-record sibling of
 * `backlog-item-strip-for-dispatch.mjs`; see
 * plugins/pipeline-core/lib/dispatch-record-strip-for-critic.mjs for the
 * rationale and
 * backlog/items/2026-09-04-a-dispatch-record-carries-implementor-prose-into-a-critic-that-must-not-read-it.md
 * for the incident this closes).
 *
 * Usage: node dispatch-record-strip-for-critic.mjs --record <path> [--out <path>]
 * Writes the stripped JSON to --out when given, otherwise to stdout.
 */
import { readFileSync, writeFileSync } from "node:fs";

import { stripDispatchRecordForCritic } from "../lib/dispatch-record-strip-for-critic.mjs";
import { isDirectInvocation } from "../lib/entrypoint.mjs";

function parseArgs(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (flag !== "--record" && flag !== "--out") throw new Error(`Unknown argument: ${flag}`);
    if (value === undefined) throw new Error(`${flag} requires a value.`);
    values[flag === "--record" ? "record" : "out"] = value;
    index += 1;
  }
  if (!values.record) throw new Error("--record <path> is required");
  return values;
}

export function run(argv) {
  const { record, out } = parseArgs(argv);
  const rawText = readFileSync(record, "utf8");
  const parsed = JSON.parse(rawText);
  const stripped = stripDispatchRecordForCritic(parsed);
  const text = `${JSON.stringify(stripped, null, 2)}\n`;
  if (out) writeFileSync(out, text);
  else process.stdout.write(text);
  return stripped;
}

if (isDirectInvocation(import.meta.url)) {
  try {
    run(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
