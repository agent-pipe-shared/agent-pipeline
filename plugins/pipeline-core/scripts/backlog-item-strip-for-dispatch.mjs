#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

/**
 * CLI: strip a backlog item's Triage/verdict/closure prose before citing it
 * as a spec/reference in a Goldfish or Critic dispatch (dispatch-construction
 * side of PO decision 2026-08-18 #19; see
 * plugins/pipeline-core/lib/backlog-dispatch-reference.mjs for the rationale
 * and backlog/items/2026-08-18-triage-verdict-text-can-contaminate-a-backlog-
 * item-as-a-later-spec-reference.md for the incident this closes).
 *
 * Usage: node backlog-item-strip-for-dispatch.mjs --item <path> [--out <path>]
 * Writes the stripped text to --out when given, otherwise to stdout. Prints
 * a one-line notice to stderr when a verdict-shaped heading was actually
 * removed, so the Elephant constructing the dispatch can confirm the item
 * needed stripping at all.
 */
import { readFileSync, writeFileSync } from "node:fs";

import { stripBacklogItemForDispatch } from "../lib/backlog-dispatch-reference.mjs";
import { isDirectInvocation } from "../lib/entrypoint.mjs";

function parseArgs(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (flag !== "--item" && flag !== "--out") throw new Error(`Unknown argument: ${flag}`);
    if (value === undefined) throw new Error(`${flag} requires a value.`);
    values[flag === "--item" ? "item" : "out"] = value;
    index += 1;
  }
  if (!values.item) throw new Error("--item <path> is required");
  return values;
}

export function run(argv) {
  const { item, out } = parseArgs(argv);
  const rawText = readFileSync(item, "utf8");
  const result = stripBacklogItemForDispatch(rawText);
  if (out) writeFileSync(out, result.text);
  else process.stdout.write(result.text);
  return result;
}

if (isDirectInvocation(import.meta.url)) {
  try {
    const result = run(process.argv.slice(2));
    if (result.wasStripped) process.stderr.write(`Stripped verdict-shaped heading: ${result.removedHeading}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
