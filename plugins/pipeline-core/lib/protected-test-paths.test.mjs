#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
//
// Direct unit tests for `extractShellWriteTargets()`, the shared write-target-extraction
// helper split out of `protectedTestPathShellHit()` (backlog:
// 2026-08-18-guard-devplan-and-guard-testpath-have-no-bash-write-lane.md, "Design,
// 2026-08-19", step 1). The behavioral proof that this split did not change
// `protectedTestPathShellHit()`'s own outward behavior is the TPSHELL-* suite in
// `guard-lifecycle-ready.test.mjs`, which imports and exercises `protectedTestPathShellHit()`
// end to end (it stays green, unmodified, across this refactor); this file instead exercises
// the NEW shared function directly, covering the same shapes that suite already tests.

import assert from "node:assert/strict";
import test from "node:test";

import { extractShellWriteTargets } from "./protected-test-paths.mjs";

const TARGET = "plugins/pipeline-core/hooks/guard-push.test.mjs";

/** All candidate strings, order-preserved, for readable assertions. */
function candidates(command, opts = {}) {
  return extractShellWriteTargets({ command, root: "/repo", ...opts }).map((t) => t.candidate);
}

function lanes(command, opts = {}) {
  return extractShellWriteTargets({ command, root: "/repo", ...opts }).map((t) => t.lane);
}

test("extractShellWriteTargets: a redirect target is a candidate on the 'redirect' lane", () => {
  const targets = extractShellWriteTargets({ command: `printf x > ${TARGET}`, root: "/repo" });
  assert.deepEqual(targets, [{ candidate: TARGET, lane: "redirect" }]);
});

test("extractShellWriteTargets: an append redirect (>>) is also a candidate", () => {
  assert.ok(candidates(`printf x >> ${TARGET}`).includes(TARGET));
});

test("extractShellWriteTargets: write-capable executables yield their non-flag operands", () => {
  for (const command of [
    `cp scratch/fake.mjs ${TARGET}`,
    `mv scratch/fake.mjs ${TARGET}`,
    `rm ${TARGET}`,
    `truncate -s 0 ${TARGET}`,
    `tee ${TARGET}`,
  ]) {
    assert.ok(candidates(command).includes(TARGET), `no candidate for: ${command}`);
    assert.ok(lanes(command).includes("write-command"), `no write-command lane for: ${command}`);
  }
});

test("extractShellWriteTargets: sed/perl/ruby only contribute a candidate when an in-place flag is present", () => {
  assert.ok(candidates(`sed -i s/a/b/ ${TARGET}`).includes(TARGET));
  assert.deepEqual(candidates(`sed s/a/b/ ${TARGET}`), [], "no in-place flag -> no candidate");
});

test("extractShellWriteTargets: git write verbs yield their operand on the 'git-working-tree-write' lane", () => {
  const targets = extractShellWriteTargets({ command: `git checkout HEAD -- ${TARGET}`, root: "/repo" });
  assert.ok(targets.some((t) => t.candidate === TARGET && t.lane === "git-working-tree-write"));
});

test("extractShellWriteTargets: read-only git subcommands and plain readers contribute nothing", () => {
  for (const command of [
    `cat ${TARGET}`,
    `rg -n describe ${TARGET}`,
    `git add ${TARGET}`,
    `git diff ${TARGET}`,
    `git log ${TARGET}`,
    `node --test ${TARGET}`,
    `node ${TARGET}`,
  ]) {
    assert.deepEqual(candidates(command), [], `unexpected candidate for a read/run command: ${command}`);
  }
});

test("extractShellWriteTargets: opaque interpreter payloads contribute every path-shaped token, on the 'opaque-interpreter-code' lane", () => {
  const command = `node -e "require('fs').writeFileSync('${TARGET}','x')"`;
  const targets = extractShellWriteTargets({ command, root: "/repo" });
  assert.ok(targets.some((t) => t.candidate === TARGET && t.lane === "opaque-interpreter-code"));
});

test("extractShellWriteTargets: an opaque payload naming only a bare basename yields the basename as a candidate (needle-matching happens one layer up)", () => {
  const command = `node -e "writeFileSync(join(dir,'guard-push.test.mjs'),'x')"`;
  const targets = extractShellWriteTargets({ command, root: "/repo" });
  assert.ok(targets.some((t) => t.candidate === "guard-push.test.mjs" && t.lane === "opaque-interpreter-code"));
});

test("extractShellWriteTargets: an unparseable command with a named write executable falls back to path tokens on the 'unparsed-command' lane", () => {
  // A `;`-composed command is refused by the closed shell grammar and therefore unparseable
  // by parseGuardCommand -- the same shape guard-lifecycle-ready.mjs's own grammar tests use.
  const command = `rm ${TARGET}; echo done`;
  const targets = extractShellWriteTargets({ command, root: "/repo" });
  assert.ok(targets.some((t) => t.candidate === TARGET && t.lane === "unparsed-command"));
});

test("extractShellWriteTargets: an unparseable command naming no writer yields nothing", () => {
  const command = `cat ${TARGET}; echo done`;
  assert.deepEqual(candidates(command), []);
});

test("extractShellWriteTargets: PowerShell write cmdlets yield the operand on the 'powershell-write-cmdlet' lane, Get-Content yields nothing", () => {
  const targets = extractShellWriteTargets({ command: `Set-Content ${TARGET} "x"`, toolName: "PowerShell" });
  assert.ok(targets.some((t) => t.candidate === TARGET && t.lane === "powershell-write-cmdlet"));
  assert.deepEqual(
    extractShellWriteTargets({ command: `Get-Content ${TARGET}`, toolName: "PowerShell" }),
    [],
  );
});

test("extractShellWriteTargets: empty/blank command and a caller passing no arguments both yield an empty array", () => {
  assert.deepEqual(extractShellWriteTargets({ command: "", root: "/repo" }), []);
  assert.deepEqual(extractShellWriteTargets({ command: "   ", root: "/repo" }), []);
  assert.deepEqual(extractShellWriteTargets(), []);
});
