#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";

import {
  probeSymlinkCapability,
  resetSymlinkCapabilityCache,
  symlinkCapability,
  symlinkSkip,
} from "./symlink-capability.mjs";

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

function fakeFs({ failWith = null } = {}) {
  const calls = [];
  return {
    calls,
    fs: {
      mkdtempSync(prefix) {
        calls.push(["mkdtempSync", prefix]);
        return `${prefix}fixture`;
      },
      writeFileSync(path) {
        calls.push(["writeFileSync", path]);
      },
      symlinkSync(target, path) {
        calls.push(["symlinkSync", target, path]);
        if (failWith) throw failWith;
      },
      rmSync(path) {
        calls.push(["rmSync", path]);
      },
    },
  };
}

{
  const { fs, calls } = fakeFs();
  const result = probeSymlinkCapability({ fs, tmpRoot: "/tmp" });
  check("SC01 a successful symlink creation reports available with no reason", result.available === true && result.reason === null);
  check("SC02 the probe cleans up its own temp directory", calls.some(([op]) => op === "rmSync"));
}

{
  const eperm = new Error("operation not permitted");
  eperm.code = "EPERM";
  const { fs } = fakeFs({ failWith: eperm });
  const result = probeSymlinkCapability({ fs, tmpRoot: "/tmp" });
  check("SC03 EPERM is classified as capability-unavailable, not rethrown", result.available === false && result.reason.includes("EPERM"));
}

{
  const eacces = new Error("permission denied");
  eacces.code = "EACCES";
  const { fs } = fakeFs({ failWith: eacces });
  const result = probeSymlinkCapability({ fs, tmpRoot: "/tmp" });
  check("SC04 EACCES is also classified as capability-unavailable", result.available === false && result.reason.includes("EACCES"));
}

{
  const enospc = new Error("no space left on device");
  enospc.code = "ENOSPC";
  const { fs } = fakeFs({ failWith: enospc });
  let threw = null;
  try {
    probeSymlinkCapability({ fs, tmpRoot: "/tmp" });
  } catch (error) {
    threw = error;
  }
  check("SC05 an unrelated error class is rethrown, never swallowed as a capability gap", threw === enospc);
}

{
  resetSymlinkCapabilityCache();
  const { fs, calls } = fakeFs();
  const first = symlinkCapability.length; // no-op read to keep lints happy about unused import ordering
  void first;
  const explicitFirst = probeSymlinkCapability({ fs, tmpRoot: "/tmp" });
  check("SC06 an explicit-options call always probes fresh (sanity baseline)", explicitFirst.available === true);
  const callCountBefore = calls.length;
  probeSymlinkCapability({ fs, tmpRoot: "/tmp" });
  check("SC07 two explicit-options calls each probe independently (no implicit caching of explicit calls)", calls.length > callCountBefore);
}

{
  resetSymlinkCapabilityCache();
  const capable = { available: true, reason: null };
  const incapable = { available: false, reason: "symlink unavailable (EPERM): enable Windows Developer Mode or run elevated" };
  check("SC08 symlinkSkip returns false (no skip) when capable", symlinkSkip(capable) === false);
  check("SC09 symlinkSkip returns the reason string when incapable", symlinkSkip(incapable) === incapable.reason);
}

{
  resetSymlinkCapabilityCache();
  const result = symlinkCapability();
  check("SC10 the real, unmocked host probe returns a well-typed result", typeof result.available === "boolean" && (result.reason === null || typeof result.reason === "string"));
}

console.log(`\n${passed}/${passed + failed} checks passed.`);
process.exit(failed === 0 ? 0 : 1);
