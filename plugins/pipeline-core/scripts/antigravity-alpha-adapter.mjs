#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

/**
 * Nova's visible, documentation-bound Antigravity runner boundary.
 *
 * This is intentionally not an AGY executor.  It never discovers, installs,
 * authenticates, invokes, or otherwise probes `agy`.
 */
export const ANTIGRAVITY_ALPHA_ADAPTER_SCHEMA = "pipeline.antigravity-alpha-adapter.v1";
export const ANTIGRAVITY_ALPHA_ADAPTER_VERSION = "0.1.0-alpha";

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

const descriptor = deepFreeze({
  schema: ANTIGRAVITY_ALPHA_ADAPTER_SCHEMA,
  adapterVersion: ANTIGRAVITY_ALPHA_ADAPTER_VERSION,
  runner: {
    id: "antigravity",
    status: "alpha-documentation-only",
    modelFamily: "gemini",
    selection: "fail-closed-not-activated",
  },
  source: {
    decisionPath: "specs/sprint-nova-epic/evidence/nova-b/antigravity-contract-decision-amendment-v1.json",
    decisionSha256: "cbd12aedac2df6c9d3901338f1334a13501b4305a9d2f6a0b604db97765093c2",
  },
  runtime: {
    executable: "agy",
    discovery: "not-attempted",
    installation: "not-authorized",
    authentication: "not-authorized",
    network: "not-authorized",
    invocation: "unavailable",
  },
  capabilities: [
    { capabilityId: "adapter.describe", status: "available" },
    { capabilityId: "agy.discover", status: "unavailable" },
    { capabilityId: "agy.install", status: "unavailable" },
    { capabilityId: "agy.authenticate", status: "unavailable" },
    { capabilityId: "agy.invoke", status: "unavailable" },
    { capabilityId: "advisor", status: "unavailable" },
    { capabilityId: "review", status: "unavailable" },
    { capabilityId: "write", status: "unavailable" },
  ],
  followUp: {
    issue: 69,
    sprint: "none",
    requirement: "dedicated-agy-sprint",
  },
});

export function describeAntigravityAlpha() {
  return descriptor;
}

/** Return a typed non-success instead of pretending that the runner can run. */
export function selectAntigravityAlpha() {
  return deepFreeze({
    selected: false,
    code: "AGY-ALPHA-NOT-ACTIVATED",
    descriptor: describeAntigravityAlpha(),
  });
}

export function main(argv = process.argv.slice(2)) {
  if (argv.length !== 1 || argv[0] !== "describe") {
    throw new Error("AGY-ALPHA-ARGUMENT: expected exactly 'describe'");
  }
  process.stdout.write(`${JSON.stringify(describeAntigravityAlpha())}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 2;
  }
}
