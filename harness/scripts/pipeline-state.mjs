#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

/** Stable repository entrypoint for the canonical plugin-owned state writer. */
export * from "../../plugins/pipeline-core/scripts/pipeline-state.mjs";

import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { run } from "../../plugins/pipeline-core/scripts/pipeline-state.mjs";

const invokedDirectly = (() => {
  try {
    return Boolean(process.argv[1]) && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
})();

if (invokedDirectly) process.exit(run());
