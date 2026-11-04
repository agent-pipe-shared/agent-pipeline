// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { firstUnadmittedFlag, firstUnadmittedGlobValue, GLOB_FORM_HINT } from "./read-command-diagnosis.mjs";
import { isReadOnlyDiagnosticCommand } from "./guard/shell-grammar.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

test("RCD1: an rg flag the grammar does not know is named", () => {
  assert.equal(isReadOnlyDiagnosticCommand("rg --hidden needle README.md", root), false, "fixture must be refused");
  assert.equal(firstUnadmittedFlag("rg --hidden needle README.md", root), "--hidden");
  assert.equal(firstUnadmittedFlag("rg -n --hidden needle README.md", root), "--hidden");
});

test("RCD2: the flag is found even when the bad flag sits between admitted ones", () => {
  assert.equal(firstUnadmittedFlag("rg -n --hidden -i needle README.md", root), "--hidden");
  assert.equal(firstUnadmittedFlag("rg -i --hidden -n needle README.md", root), "--hidden");
});

test("RCD3: a git diff output flag is named", () => {
  assert.equal(firstUnadmittedFlag("git diff --output=scratch/x.txt", root), "--output=scratch/x.txt");
});

test("RCD4: nothing is named for an admitted command, a bad operand, two bad flags, a pipeline or a redirect", () => {
  assert.equal(firstUnadmittedFlag("rg -n needle README.md", root), null, "admitted command");
  assert.equal(firstUnadmittedFlag("rg -n needle ../outside.txt", root), null, "the operand is the problem, not a flag");
  assert.equal(firstUnadmittedFlag("rg --hidden --pre cat needle README.md", root), null, "no single removal is enough");
  assert.equal(firstUnadmittedFlag("rg --hidden needle README.md | head -n 3", root), null, "pipelines are not diagnosed");
  assert.equal(firstUnadmittedFlag("rg --hidden needle README.md > out.txt", root), null, "redirects are not diagnosed");
  assert.equal(firstUnadmittedFlag("", root), null);
  assert.equal(firstUnadmittedFlag(undefined, root), null);
});

test("RCD5: a bad flag that takes a value is not diagnosed (removing the value too could hide an operand fault)", () => {
  assert.equal(isReadOnlyDiagnosticCommand("rg --max-filesize 1M needle README.md", root), false);
  assert.equal(firstUnadmittedFlag("rg --max-filesize 1M needle README.md", root), null);
  assert.equal(firstUnadmittedFlag("rg -n needle ../outside.txt", root), null, "an operand fault must not blame the admitted -n");
});

test("RCD6: a pattern with an apostrophe survives the re-ask", () => {
  assert.equal(firstUnadmittedFlag("rg --hidden \"it's\" README.md", root), "--hidden");
});

async function refusal(command) {
  const guard = await import("../hooks/guard-lifecycle-ready.mjs");
  return guard.evaluateLifecycleReadyGuard({ tool_name: "Bash", tool_input: { command } }, {
    projectDir: root, runner: "claude",
    inspectProjectOnboardingV3Fn() { throw new Error("fixture: no onboarding observation"); },
  });
}

test("RCD8: the unsupported-read refusal is the typed code today", async () => {
  const result = await refusal("rg --hidden needle README.md");
  assert.equal(result.exitCode, 2);
  assert.match(String(result.stderr), /GUARD-READ-COMMAND-UNSUPPORTED/u);
});

test("RCD9: the refusal names the flag it objects to",
  { todo: false },
  async () => {
    const result = await refusal("rg --hidden needle README.md");
    assert.match(String(result.stderr), /Rejected element: the flag "--hidden"\./u);
  });

test("RCD10: a glob value outside the admitted forms is named, the admitted ones are not", () => {
  assert.equal(isReadOnlyDiagnosticCommand("rg --files plugins -g 'w130*'", root), false, "fixture must be refused");
  assert.equal(firstUnadmittedGlobValue("rg --files plugins -g 'w130*'", root), "w130*");
  assert.equal(firstUnadmittedGlobValue("rg -n needle README.md --glob 'scratch/*.md'", root), "scratch/*.md");
  assert.equal(firstUnadmittedGlobValue("rg --files plugins -g '*.mjs'", root), null, "admitted command");
  assert.equal(firstUnadmittedGlobValue("rg --hidden -n needle README.md", root), null, "a flag fault is not a glob fault");
  assert.equal(firstUnadmittedGlobValue("rg -n needle ../outside.txt -g '*.md'", root), null, "the operand is the problem");
  assert.equal(firstUnadmittedGlobValue("rg --files plugins -g 'w130*' | head -n 3", root), null, "pipelines are not diagnosed");
  assert.equal(firstUnadmittedGlobValue("cat README.md", root), null);
  assert.equal(firstUnadmittedGlobValue(undefined, root), null);
});

test("RCD11: the refusal names the glob value and the admitted forms, and still grants nothing", async () => {
  const command = "rg --files plugins -g 'w130*'";
  const result = await refusal(command);
  assert.equal(result.exitCode, 2);
  assert.match(String(result.stderr), /GUARD-READ-COMMAND-UNSUPPORTED/u);
  assert.match(String(result.stderr), /Rejected element: the glob value "w130\*"/u);
  assert.ok(String(result.stderr).includes(GLOB_FORM_HINT), "the hint sentence is printed");
  assert.equal(isReadOnlyDiagnosticCommand(command, root), false);
});

test("RCD7: the helper never grants: the diagnosed command itself stays refused", () => {
  const command = "rg --hidden needle README.md";
  assert.equal(firstUnadmittedFlag(command, root), "--hidden");
  assert.equal(isReadOnlyDiagnosticCommand(command, root), false);
});
