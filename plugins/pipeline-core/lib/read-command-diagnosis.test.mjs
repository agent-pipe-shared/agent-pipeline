// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { readFileSync } from "node:fs";
import { firstUnadmittedFlag, firstUnadmittedGlobValue, flagSpellingHint, GLOB_FORM_HINT, clusterSpellingHint, lsListingHint } from "./read-command-diagnosis.mjs";
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

test("RCD12: the outside-root read refusal says it is intended and names the native Read alternative, and stays a refusal", async () => {
  const command = "grep -n needle /etc/hostname";
  assert.equal(isReadOnlyDiagnosticCommand(command, root), false, "fixture must be refused");
  const result = await refusal(command);
  assert.equal(result.exitCode, 2);
  assert.match(String(result.stderr), /GUARD-READ-SCOPE-OUTSIDE-ROOT/u);
  assert.match(String(result.stderr), /This refusal is intended, not a fault of the command/u);
  assert.match(String(result.stderr), /native Read tool/u);
});

test("RCD13: an attached flag value gets the separate-argument spelling, other flags get none", () => {
  assert.equal(flagSpellingHint("-A8"), "an attached value is not admitted; give it as a separate argument: -A 8");
  assert.equal(flagSpellingHint("-m25"), "an attached value is not admitted; give it as a separate argument: -m 25");
  assert.match(String(flagSpellingHint("--max-count=5")), /--max-count <value>/u);
  assert.equal(flagSpellingHint("--hidden"), null);
  assert.equal(flagSpellingHint("-n"), null);
  assert.equal(flagSpellingHint("-la"), null);
  assert.equal(flagSpellingHint(undefined), null);
});

test("RCD14: the refusal of an attached value prints the spelling to use, and both spellings stay judged by the grammar", async () => {
  const attached = "rg -n -A8 needle README.md";
  assert.equal(isReadOnlyDiagnosticCommand(attached, root), false, "fixture must be refused");
  assert.equal(isReadOnlyDiagnosticCommand("rg -n -A 8 needle README.md", root), true, "the suggested spelling is admitted");
  const result = await refusal(attached);
  assert.equal(result.exitCode, 2);
  assert.match(String(result.stderr), /Rejected element: the flag "-A8" \(an attached value is not admitted; give it as a separate argument: -A 8\)\./u);
});

test("RCD15: a refused ls flag gets the names-only listing spellings, a names-only flag and other commands get none", () => {
  const hint = String(lsListingHint("ls -la .git/agent-pipeline", "-la", root));
  assert.match(hint, /listed as names only/u);
  assert.match(hint, /`ls -1 <dir>`/u);
  assert.match(hint, /`find <dir> -maxdepth 1`/u);
  assert.match(hint, /intended read limit/u);
  assert.equal(lsListingHint("ls -l .git", "-l", root) === null, false);
  assert.equal(lsListingHint("ls -1 .git/agent-pipeline", "-1", root), null, "an admitted flag needs no hint");
  assert.equal(lsListingHint("ls -a .git/agent-pipeline", "-a", root), null);
  assert.equal(lsListingHint("rg --hidden needle README.md", "--hidden", root), null, "only ls gets the listing hint");
  assert.equal(lsListingHint("ls -la a | head -n 2", "-la", root), null, "pipelines are not diagnosed");
  assert.equal(lsListingHint(undefined, "-la", root), null);
  assert.equal(lsListingHint("ls -la docs", undefined, root), null);
});

test("RCD16: the unsupported-read refusal prints the ls listing hint after the flag it names (wiring pin; the control root itself is not protected in a bare checkout)", () => {
  const source = readFileSync(join(root, "plugins", "pipeline-core", "lib", "guard", "evaluate.mjs"), "utf8");
  assert.match(source, /lsListingHint\(readCommand, flag, root\)/u);
  assert.match(source, /clusterSpellingHint\(readCommand, flag, root\) \?\? lsListingHint\(readCommand, flag, root\)/u);
  assert.match(source, /flagSpellingHint\(flag\) \?\? listing/u);
  assert.match(source, /import \{[^}]*lsListingHint[^}]*\} from "\.\.\/read-command-diagnosis\.mjs"/u);
});

test("RCD17: a refused short-flag cluster gets the split spelling only when the grammar admits it, and the refusal prints it", async () => {
  assert.equal(isReadOnlyDiagnosticCommand("rg -ln needle README.md", root), false, "fixture must be refused");
  assert.equal(isReadOnlyDiagnosticCommand("rg -l -n needle README.md", root), true, "the split spelling is admitted");
  assert.equal(clusterSpellingHint("rg -ln needle README.md", "-ln", root), "a combined short-flag cluster is not admitted here; give each flag on its own: -l -n");
  assert.equal(clusterSpellingHint("rg -n needle README.md", "-n", root), null, "a single flag is no cluster");
  assert.equal(clusterSpellingHint("rg --hidden needle README.md", "--hidden", root), null, "a long flag is no cluster");
  assert.equal(clusterSpellingHint("rg -ln needle README.md | head -n 2", "-ln", root), null, "pipelines are not diagnosed");
  assert.equal(clusterSpellingHint("rg -zz needle README.md", "-zz", root), null, "no hint when the split spelling is refused too");
  assert.equal(clusterSpellingHint(undefined, "-ln", root), null);
  const result = await refusal("rg -ln needle README.md");
  assert.equal(result.exitCode, 2);
  assert.match(String(result.stderr), /Rejected element: the flag "-ln" \(a combined short-flag cluster is not admitted here; give each flag on its own: -l -n\)\./u);
  assert.equal(isReadOnlyDiagnosticCommand("rg -ln needle README.md", root), false, "the diagnosed command itself stays refused");
});

test("RCD7: the helper never grants: the diagnosed command itself stays refused", () => {
  const command = "rg --hidden needle README.md";
  assert.equal(firstUnadmittedFlag(command, root), "--hidden");
  assert.equal(isReadOnlyDiagnosticCommand(command, root), false);
});
