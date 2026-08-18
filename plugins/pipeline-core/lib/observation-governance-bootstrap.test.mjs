#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { join } from "node:path";

import { inspectObservationGovernanceBootstrap, OBSERVATION_GOVERNANCE_BOOTSTRAP_SCHEMA } from "./observation-governance-bootstrap.mjs";

let passed = 0;
let failed = 0;
function check(name, condition, detail = "") {
  if (condition) {
    passed += 1;
    console.log(`PASS ${name}`);
  } else {
    failed += 1;
    console.error(`FAIL ${name}${detail ? `: ${detail}` : ""}`);
  }
}

const ROOT = "/project";
const SOURCE_MANIFEST = join(ROOT, "plugins/pipeline-core/.claude-plugin/plugin.json");
const HARNESS_DIR = join(ROOT, "harness");
const CHECKER = join(ROOT, "harness/scripts/check-observation-governance.mjs");

function fakeFs({ files = [], dirs = [] } = {}) {
  const fileSet = new Set(files);
  const dirSet = new Set(dirs);
  return {
    existsSync(path) { return fileSet.has(path) || dirSet.has(path); },
    lstatSync(path) {
      if (fileSet.has(path)) return { isFile: () => true, isDirectory: () => false };
      if (dirSet.has(path)) return { isFile: () => false, isDirectory: () => true };
      const error = new Error(`ENOENT: ${path}`);
      error.code = "ENOENT";
      throw error;
    },
  };
}

// This repo's own real source-checkout shape: manifest present, harness/
// present, checker present -- must return "required" and run the real
// checker.
{
  const fs = fakeFs({ files: [SOURCE_MANIFEST, CHECKER], dirs: [HARNESS_DIR] });
  const result = inspectObservationGovernanceBootstrap({ rootDir: ROOT, fs });
  check("OGB01 real source checkout returns required", result.status === "required" && result.sourceCheckout === true && result.checker === "harness/scripts/check-observation-governance.mjs", JSON.stringify(result));
  check("OGB01b schema is stamped", result.schema === OBSERVATION_GOVERNANCE_BOOTSTRAP_SCHEMA);
}

// Vendor-synced consumer project shape: manifest present (byte-identical
// vendored copy) but no source-only harness/ directory at all -- must NOT
// false-positive as a source checkout that is missing its checker.
{
  const fs = fakeFs({ files: [SOURCE_MANIFEST], dirs: [] });
  const result = inspectObservationGovernanceBootstrap({ rootDir: ROOT, fs });
  check("OGB02 vendor-synced consumer project returns not-applicable, not OGB-CHECKER-MISSING", result.status === "not-applicable" && result.sourceCheckout === false && result.checker === null, JSON.stringify(result));
  check("OGB02b never surfaces the false-positive code", result.code !== "OGB-CHECKER-MISSING");
}

// Neither a source checkout nor a vendor-synced copy: no plugin.json at all.
{
  const fs = fakeFs({ files: [], dirs: [] });
  const result = inspectObservationGovernanceBootstrap({ rootDir: ROOT, fs });
  check("OGB03 no manifest at all returns not-applicable", result.status === "not-applicable" && result.sourceCheckout === false && result.checker === null, JSON.stringify(result));
}

// A source checkout whose checker has genuinely gone missing (harness/
// present but the checker script itself is absent) is still a real defect
// and must still be reported.
{
  const fs = fakeFs({ files: [SOURCE_MANIFEST], dirs: [HARNESS_DIR] });
  const result = inspectObservationGovernanceBootstrap({ rootDir: ROOT, fs });
  check("OGB04 source checkout with a genuinely missing checker still fails", result.status === "failed" && result.sourceCheckout === true && result.code === "OGB-CHECKER-MISSING", JSON.stringify(result));
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
