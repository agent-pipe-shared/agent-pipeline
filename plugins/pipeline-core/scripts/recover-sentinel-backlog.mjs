#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0

/**
 * Import the public Sentinel baseline catalog into the canonical backlog.
 * Preview is the default. Only --write performs the recoverable transaction.
 */
import { fileURLToPath } from "node:url";

import { applySentinelBacklogRecovery, planSentinelBacklogRecovery } from "./check-backlog-state.mjs";

function printFindings(result) {
  for (const finding of result.findings) console.error(`FAIL Sentinel backlog recovery: ${finding}`);
}

function cli() {
  const args = process.argv.slice(2);
  const write = args.includes("--write");
  const unsupported = args.filter((arg) => arg !== "--write");
  if (unsupported.length > 0) {
    console.error("Usage: node plugins/pipeline-core/scripts/recover-sentinel-backlog.mjs [--write]");
    process.exit(2);
  }
  const result = write ? applySentinelBacklogRecovery() : planSentinelBacklogRecovery();
  if (!result.ok) {
    printFindings(result);
    process.exit(2);
  }
  if (write) {
    console.log(`Recovered ${result.catalog.items.length} Sentinel baseline items in one transaction; no completion or closure was claimed.`);
  } else {
    console.log(`Dry run: ${result.catalog.items.length} Sentinel baseline items would be recovered in one transaction. Re-run with --write to apply.`);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) cli();
