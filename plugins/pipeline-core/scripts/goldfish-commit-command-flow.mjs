#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/** Read-only CLI for the legacy Goldfish exact-path Git command preview. */
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { createGoldfishCommitCommandFlow } from "../lib/goldfish-commit-command-flow.mjs";

export function runGoldfishCommitCommandFlow(argv = process.argv.slice(2)) {
  const single = new Set(["--task-id", "--type", "--scope", "--summary"]);
  const repeated = new Set(["--body", "--path"]);
  const values = { bodyParagraphs: [], paths: [] };
  const seen = new Set();
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (typeof value !== "string" || (!single.has(flag) && !repeated.has(flag))
      || (single.has(flag) && seen.has(flag))) return { ok: false, code: "GF-COMMAND-CLI-ARGUMENTS", steps: [] };
    seen.add(flag);
    if (flag === "--body") values.bodyParagraphs.push(value);
    else if (flag === "--path") values.paths.push(value);
    else if (flag === "--task-id") values.taskId = value;
    else if (flag === "--type") values.type = value;
    else if (flag === "--scope") values.scope = value;
    else values.summary = value;
  }
  return createGoldfishCommitCommandFlow(values);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = runGoldfishCommitCommandFlow();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.ok) process.exitCode = 2;
}
