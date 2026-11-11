// SPDX-License-Identifier: SUL-1.0
// All shell strings are data for the real parser/guard, never shell execution.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isBoundedReadOnlyPipeline, parseGuardCommand } from "../../hooks/guard-command-grammar.mjs";
import { evaluateLifecycleReadyGuard } from "./evaluate.mjs";
import { isMissingSingleReadTarget } from "./read-scope.mjs";
import { registerTestCaseCompletion } from "../test-case-completion.mjs";

const cases = [];
function test(name, run) { cases.push({ id: `G23Q${String(cases.length + 1).padStart(3, "0")}`, name, run }); }
function fixture(run) {
  mkdirSync(resolve("scratch"), { recursive: true });
  const base = mkdtempSync(resolve("scratch/g23-quoted-"));
  const root = join(base, "project"), outside = join(base, "outside");
  mkdirSync(join(root, "plugins/pipeline-core"), { recursive: true });
  mkdirSync(join(root, ".agent-pipeline"));
  mkdirSync(outside);
  writeFileSync(join(root, ".agent-pipeline/onboarding-consent.json"), JSON.stringify({ schema: "pipeline.onboarding-consent-marker.v1", status: "consent-given-onboarding-incomplete", consentGivenAt: "2026-09-29T00:00:00.000Z" }));
  writeFileSync(join(root, "plugins/pipeline-core/domain-owner.test.mjs"), "ordinary fixture\n");
  writeFileSync(join(outside, "ordinary.txt"), "ordinary outside fixture\n");
  // Synthetic filename-only credential control; contains no credential material.
  writeFileSync(join(outside, "id_rsa"), "inert fixture\n");
  symlinkSync(outside, join(root, "alias"), "dir");
  const parse = command => parseGuardCommand(command, root, { platform: "linux" });
  const guard = command => evaluateLifecycleReadyGuard({ tool_name: "Bash", tool_input: { command } }, {
    projectDir: root,
    requireProjectOnboardingReadyFn() { throw new Error("passive reads must not need lifecycle readiness"); },
  });
  try { run({ root, outside, parse, guard }); }
  finally { rmSync(base, { recursive: true, force: true }); }
}

test("a read of the plugin's own files is never reported as outside the project when a flag or value is the fault", () => fixture(({ guard }) => {
  const pluginRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
  const overLimit = guard(`rg -n "a" ${join(pluginRoot, "lib/guard/verdict.mjs")} --max-columns 620`);
  assert.equal(overLimit.exitCode, 2);
  assert.match(overLimit.stderr, /GUARD-READ-COMMAND-UNSUPPORTED/u);
  assert.match(overLimit.stderr, /--max-columns|flags or spelling/u);
  const filtered = guard(`rg -n "a" ${join(pluginRoot, "templates")} --glob "*.md"`);
  assert.equal(filtered.exitCode, 2);
  assert.match(filtered.stderr, /GUARD-READ-COMMAND-UNSUPPORTED/u);
  assert.match(filtered.stderr, /the filter "--glob"/u);
  assert.equal(guard(`rg -n "a" ${join(pluginRoot, "templates")}`).exitCode, 0);
}));

test("a target truly outside the project keeps the scope refusal, and a missing plugin file keeps its own text", () => fixture(({ outside, guard }) => {
  const outsideRead = guard(`rg -n "a" ${join(outside, "ordinary.txt")} --max-columns 620`);
  assert.equal(outsideRead.exitCode, 2);
  assert.match(outsideRead.stderr, /GUARD-READ-SCOPE-OUTSIDE-ROOT/u);
  const pluginRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
  const missing = guard(`rg -n "a" ${join(pluginRoot, "lib/guard/does-not-exist.mjs")} --max-columns 620`);
  assert.equal(missing.exitCode, 2);
  assert.match(missing.stderr, /GUARD-READ-TARGET-MISSING/u);
}));

test("original quoted test-file narrowing is admitted through parser and actual guard", () => fixture(({ root, parse, guard }) => {
  for (const path of ["plugins/pipeline-core", `'${join(root, "plugins/pipeline-core")}'`]) {
    const command = `rg --files ${path} -g '*.test.mjs' | rg '(domain-owner|authority-registry|managed|journal)'`;
    const parsed = parse(command);
    assert.equal(parsed.parseStatus, "accepted");
    assert.deepEqual(parsed.operators.map(value => value.operator), ["|"]);
    assert.deepEqual(parsed.segments[1].argv, ["(domain-owner|authority-registry|managed|journal)"]);
    const result = guard(command);
    assert.equal(result.exitCode, 0, result.stderr);
    assert.equal(isBoundedReadOnlyPipeline(parsed, root), true, command);
  }
}));

test("quoted operators remain inert regex data in the stdin sink", () => fixture(({ root, parse, guard }) => {
  for (const pattern of ["(owner|journal)", "owner;managed", "owner>journal", "owner&&journal"]) {
    const command = `rg --files plugins/pipeline-core -g '*.mjs' | rg '${pattern}'`;
    assert.deepEqual(parse(command).segments[1].argv, [pattern]);
    assert.equal(isBoundedReadOnlyPipeline(parse(command), root), true);
    assert.equal(guard(command).exitCode, 0);
  }
  for (const glob of ["*.tar.gz", "*.test.tar.gz", "**/*.mjs"]) {
    assert.equal(guard(`rg --files plugins/pipeline-core -g '${glob}' | rg owner`).exitCode, 0, glob);
  }
}));

test("unsupported filters, executable flags and shell effects stay refused", () => fixture(({ guard }) => {
  for (const command of [
    // PO tile answer 2026-11-01 (restated): `*.tar.gz`, `*.test.tar.gz` and `**/*.mjs` moved to the admitted list of the test above; SEC-11 intent unchanged.
    "rg --files plugins/pipeline-core -g '*.test..mjs' | rg owner",
    "rg --files plugins/pipeline-core -g '.*' | rg owner",
    "rg --files plugins/pipeline-core -g '../*.mjs' | rg owner",
    "rg --files plugins/pipeline-core -g '**/sub/*.mjs' | rg owner",
    "rg --pre inert owner plugins/pipeline-core | rg owner",
    "rg --files plugins/pipeline-core | rg --pre inert owner",
    "rg --files plugins/pipeline-core | rg --output out owner",
    "rg --files plugins/pipeline-core | rg owner > out",
    "rg --files plugins/pipeline-core | rg owner | rg journal",
    "rg --files plugins/pipeline-core | rg $(inert)",
    "rg --files plugins/pipeline-core | rg owner; inert",
  ]) assert.equal(guard(command).exitCode, 2, command);
}));

test("external directories, symlink escape and credential operands stay refused", () => fixture(({ root, outside, parse, guard }) => {
  for (const path of [outside, "alias", "vault/id_rsa", join(root, "vault/id_rsa")]) {
    const command = `rg --files '${path}' | rg '(owner|journal)'`;
    assert.equal(isBoundedReadOnlyPipeline(parse(command), root), false, command);
    assert.equal(guard(command).exitCode, 2, command);
  }
  for (const command of ["cat vault/id_rsa", `cat '${join(root, "vault/id_rsa")}'`]) {
    assert.match(guard(command).stderr, /GUARD-READ-CREDENTIAL-TARGET/u);
  }
}));

test("missing target diagnosis stays distinct from grammar and credential refusals", () => fixture(({ root, parse, guard }) => {
  assert.equal(isMissingSingleReadTarget(parse("rg needle plugins/pipeline-core/absent.mjs"), root), true);
  // QG-04 restated (G20-67, 2026-11-08): an existence probe whose only fault is the missing in-root file is admitted (the shell reports
  // the missing file); the grammar and credential distinctions below are unchanged.
  const probe = guard("rg needle plugins/pipeline-core/absent.mjs");
  assert.equal(probe.exitCode, 0, probe.stderr);
  assert.doesNotMatch(probe.stderr ?? "", /GUARD-READ-TARGET-MISSING/u);
  assert.equal(isMissingSingleReadTarget(parse("rg --pre inert needle plugins/pipeline-core/absent.mjs"), root), false);
  assert.equal(isMissingSingleReadTarget(parse("cat vault/id_rsa"), root), false);
  assert.match(guard("rg --column needle plugins/pipeline-core/absent.mjs").stderr, /GUARD-READ-COMMAND-UNSUPPORTED/u);
}));

registerTestCaseCompletion({ cases, fd: Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD ?? "3"), maxBytes: 65536 });
