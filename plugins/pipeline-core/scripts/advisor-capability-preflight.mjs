#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

/** Model-free Advisor capability preflight for pipeline-start. */

import { preflightAdvisoryCapability } from "../lib/advisory-lifecycle-v2.mjs";
import { isDirectInvocation } from "../lib/entrypoint.mjs";

const USAGE = "Usage: advisor-capability-preflight.mjs --runner <claude|codex> --profile <epic|feature|mini> --consent <default|approved|declined>";

function parse(argv) {
  if (!Array.isArray(argv) || argv.length !== 6) throw new Error(USAGE);
  const value = {};
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const next = argv[index + 1];
    if (!["--runner", "--profile", "--consent"].includes(flag)
      || Object.hasOwn(value, flag.slice(2)) || typeof next !== "string" || next.length === 0) throw new Error(USAGE);
    value[flag.slice(2)] = next;
  }
  return value;
}

export function runAdvisorCapabilityPreflight(argv = process.argv.slice(2), write = process.stdout.write.bind(process.stdout)) {
  const result = preflightAdvisoryCapability(parse(argv));
  if (!result.ok) throw new Error(result.code);
  write(`${JSON.stringify(result.evidence)}\n`);
  return 0;
}

if (isDirectInvocation(import.meta.url)) {
  try {
    process.exitCode = runAdvisorCapabilityPreflight();
  } catch (error) {
    process.stderr.write(`${error.message === USAGE ? USAGE : "Advisor capability preflight unavailable"}\n`);
    process.exitCode = error.message === USAGE ? 64 : 2;
  }
}
