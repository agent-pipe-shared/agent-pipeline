#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const VARIABLE = "CLAUDE_CODE_SUBAGENT_MODEL";

export function inspectBootstrapEnvironment(env = process.env) {
  const isSet = Object.hasOwn(env, VARIABLE);
  return {
    schema: "pipeline.bootstrap-env-check.v1",
    status: isSet ? "blocked" : "clear",
    variable: VARIABLE,
    set: isSet,
  };
}

const isCli = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  const receipt = inspectBootstrapEnvironment();
  process.stdout.write(`${JSON.stringify(receipt)}\n`);
  process.exitCode = receipt.set ? 2 : 0;
}
