#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { validateGitLabCiBroker } from "../lib/gitlab-ci-execution-broker.mjs";
import { validateAgainstSchema } from "../lib/schema-lite.mjs";

const BROKER_SCHEMA = JSON.parse(readFileSync(new URL("./gitlab-ci-execution-broker.schema.json", import.meta.url), "utf8"));

export function runGitLabCiExecutionBroker(argv, { stdout, stderr, readFile = readFileSync } = {}) {
  const [path] = argv;
  if (!path || argv.length !== 1) { stderr.write("usage: gitlab-ci-execution-broker.mjs <record.json>\n"); return 2; }
  try { const record = JSON.parse(readFile(path, "utf8")); const structural = validateAgainstSchema(record, BROKER_SCHEMA); const result = structural.valid ? validateGitLabCiBroker(record) : { ok: false, code: "SCHEMA:broker" }; stdout.write(`${JSON.stringify(result)}\n`); return result.ok ? 0 : 2; } catch { stderr.write("invalid broker record\n"); return 2; }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exitCode = runGitLabCiExecutionBroker(process.argv.slice(2), process);
