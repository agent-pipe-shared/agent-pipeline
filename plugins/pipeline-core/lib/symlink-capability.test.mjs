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

function fakeFs({ failWith = null, failAt = "symlink" } = {}) {
  const calls = [];
  return {
    calls,
    fs: {
      mkdtempSync(prefix) {
        calls.push(["mkdtempSync", prefix]);
        if (failWith && failAt === "mkdtemp") throw failWith;
        return `${prefix}fixture`;
      },
      writeFileSync(path) {
        calls.push(["writeFileSync", path]);
        if (failWith && failAt === "write") throw failWith;
      },
      mkdirSync(path) {
        calls.push(["mkdirSync", path]);
        if (failWith && failAt === "mkdir") throw failWith;
      },
      symlinkSync(target, path, type) {
        calls.push(["symlinkSync", target, path, type]);
        if (failWith && failAt === "symlink") throw failWith;
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

for (const failAt of ["mkdtemp", "write"]) {
  const eperm = Object.assign(new Error(`EPERM during ${failAt}`), { code: "EPERM" });
  const { fs } = fakeFs({ failWith: eperm, failAt });
  let threw = null;
  try { probeSymlinkCapability({ fs, tmpRoot: "/tmp" }); } catch (error) { threw = error; }
  check(`SC05-${failAt} preserves EPERM outside the actual symlink operation`, threw === eperm);
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

// NVA-BL-20: link TYPE is its own capability on Windows (module header, LINK TYPE).
// A caller that creates directory junctions must be able to probe junctions.
{
  const { fs, calls } = fakeFs();
  const result = probeSymlinkCapability({ fs, tmpRoot: "/tmp", type: "junction" });
  const links = calls.filter(([op]) => op === "symlinkSync");
  check(
    "SC11 a junction probe passes the link type through to symlinkSync",
    result.available === true && links.length === 1 && links[0][3] === "junction",
    JSON.stringify(links),
  );
  check(
    "SC12 a junction probe links a DIRECTORY target, never the untyped probe's file",
    calls.some(([op]) => op === "mkdirSync") && !calls.some(([op]) => op === "writeFileSync"),
    JSON.stringify(calls),
  );
}

{
  const { fs, calls } = fakeFs();
  const result = probeSymlinkCapability({ fs, tmpRoot: "/tmp" });
  const links = calls.filter(([op]) => op === "symlinkSync");
  check(
    "SC13 the untyped default is unchanged: no link type, file target, no mkdir",
    result.available === true
      && links[0][3] === undefined
      && calls.some(([op]) => op === "writeFileSync")
      && !calls.some(([op]) => op === "mkdirSync"),
    JSON.stringify(calls),
  );
}

{
  const eperm = Object.assign(new Error("operation not permitted"), { code: "EPERM" });
  const { fs } = fakeFs({ failWith: eperm });
  const result = probeSymlinkCapability({ fs, tmpRoot: "/tmp", type: "junction" });
  check(
    "SC14 an EPERM junction probe names the type it probed in its skip reason",
    result.available === false && result.reason.includes("EPERM") && result.reason.includes("junction"),
    String(result.reason),
  );
}

{
  const enospc = Object.assign(new Error("no space left on device"), { code: "ENOSPC" });
  const { fs } = fakeFs({ failWith: enospc });
  let threw = null;
  try { probeSymlinkCapability({ fs, tmpRoot: "/tmp", type: "junction" }); } catch (error) { threw = error; }
  check("SC15 a typed probe rethrows an unrelated error class exactly like the untyped one", threw === enospc);
}

{
  const eperm = Object.assign(new Error("EPERM during mkdir"), { code: "EPERM" });
  const { fs } = fakeFs({ failWith: eperm, failAt: "mkdir" });
  let threw = null;
  try { probeSymlinkCapability({ fs, tmpRoot: "/tmp", type: "junction" }); } catch (error) { threw = error; }
  check("SC16 EPERM from the junction probe's own directory setup surfaces, never a capability gap", threw === eperm);
}

{
  const result = symlinkCapability({ type: "junction" });
  check(
    "SC17 the real, unmocked host junction probe returns a well-typed result",
    typeof result.available === "boolean" && (result.reason === null || typeof result.reason === "string"),
    JSON.stringify(result),
  );
}

console.log(`\n${passed}/${passed + failed} checks passed.`);
process.exit(failed === 0 ? 0 : 1);
