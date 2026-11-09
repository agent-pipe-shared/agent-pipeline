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

// QG-04 restatement (C22B, PO decision 2026-11-09, AC-108): this case used to pin `rg -ln` as REFUSED. A cluster of boolean flags is now admitted
// (see RCD19), so the fixture moved in place to the refusal that must stay: a cluster holding a flag that takes a value (`-nA 5`), which is refused
// although `-n -A 5` is admitted. The assertions about the hint (printed only when the grammar admits the split spelling, never for a single or long
// flag, a pipeline, an unadmitted split or a missing command) are unchanged in kind; only the fixture flags changed.
test("RCD17: a refused short-flag cluster gets the split spelling only when the grammar admits it, and the refusal prints it", async () => {
  assert.equal(isReadOnlyDiagnosticCommand("rg -nA 5 needle README.md", root), false, "fixture must be refused");
  assert.equal(isReadOnlyDiagnosticCommand("rg -n -A 5 needle README.md", root), true, "the split spelling is admitted");
  assert.equal(clusterSpellingHint("rg -nA 5 needle README.md", "-nA", root), "a combined short-flag cluster is not admitted here; give each flag on its own: -n -A");
  assert.equal(clusterSpellingHint("rg -n needle README.md", "-n", root), null, "a single flag is no cluster");
  assert.equal(clusterSpellingHint("rg --hidden needle README.md", "--hidden", root), null, "a long flag is no cluster");
  assert.equal(clusterSpellingHint("rg -nA 5 needle README.md | head -n 2", "-nA", root), null, "pipelines are not diagnosed");
  assert.equal(clusterSpellingHint("rg -zz needle README.md", "-zz", root), null, "no hint when the split spelling is refused too");
  assert.equal(clusterSpellingHint(undefined, "-nA", root), null);
  const result = await refusal("rg -nA 5 needle README.md");
  assert.equal(result.exitCode, 2);
  assert.match(String(result.stderr), /Rejected element: the flag "-nA" \(a combined short-flag cluster is not admitted here; give each flag on its own: -n -A\)\./u);
  assert.equal(isReadOnlyDiagnosticCommand("rg -nA 5 needle README.md", root), false, "the diagnosed command itself stays refused");
});

// C22B (AC-108, PO decision 2026-11-09): a combined short-flag cluster is admitted exactly when every member flag is a boolean flag the same
// command already admits on its own. Each row: [cluster, the same flags spelled out, cluster admitted?, spelled-out admitted?]. The spelled-out
// column is the baseline the grammar already had; no cluster may be admitted where its spelled-out form is not (nothing new becomes reachable).
const CLUSTER_ROWS = [
  // rg: boolean members only
  ["rg -ln needle README.md", "rg -l -n needle README.md", true, true],
  ["rg -il needle README.md", "rg -i -l needle README.md", true, true],
  ["rg -nwi needle README.md", "rg -n -w -i needle README.md", true, true],
  ["rg -cH needle README.md", "rg -c -H needle README.md", true, true],
  ["rg -noI needle README.md", "rg -n -o -I needle README.md", true, true],
  ["rg -nSs needle README.md", "rg -n -S -s needle README.md", true, true],
  ["rg -ln needle README.md plugins", "rg -l -n needle README.md plugins", true, true],
  // rg: a repeated flag is refused spelled out, so it is refused in a cluster
  ["rg -nn needle README.md", "rg -n -n needle README.md", false, false],
  // rg: a member that takes a value stays refused in a cluster, although it is admitted on its own
  ["rg -nA 5 needle README.md", "rg -n -A 5 needle README.md", false, true],
  ["rg -nC 5 needle README.md", "rg -n -C 5 needle README.md", false, true],
  ["rg -nB 5 needle README.md", "rg -n -B 5 needle README.md", false, true],
  ["rg -ne needle README.md", "rg -n -e needle README.md", false, true],
  ["rg -nm 5 needle README.md", "rg -n -m 5 needle README.md", false, true],
  ["rg -nt md needle README.md", "rg -n -t md needle README.md", false, true],
  ["rg -ng *.md needle README.md", "rg -n -g *.md needle README.md", false, true],
  ["rg -nf README.md README.md", "rg -n -f README.md README.md", false, true],
  // rg: members that are not admitted on their own (follow, unrestricted, search-zip, help, replace, pcre2, mutating or hidden-reaching)
  ["rg -nu needle README.md", "rg -n -u needle README.md", false, false],
  ["rg -nL needle README.md", "rg -n -L needle README.md", false, false],
  ["rg -nz needle README.md", "rg -n -z needle README.md", false, false],
  ["rg -nh needle README.md", "rg -n -h needle README.md", false, false],
  ["rg -nr x needle README.md", "rg -n -r x needle README.md", false, false],
  ["rg -nP needle README.md", "rg -n -P needle README.md", false, false],
  // rg: a cluster never widens the target
  ["rg -ln needle ../outside.txt", "rg -l -n needle ../outside.txt", false, false],
  ["rg -il needle ~/.ssh/id_rsa", "rg -i -l needle ~/.ssh/id_rsa", false, false],
  // rg: after `--` a dash-led word is the pattern, not a cluster
  ["rg -n -- -ln README.md", "rg -n -- -ln README.md", true, true],
  // rg pipelines
  ["rg -ln needle README.md | head -n 2", "rg -l -n needle README.md | head -n 2", true, true],
  ["rg -n needle README.md | rg -il x", "rg -n needle README.md | rg -i -l x", true, true],
  ["rg -nA 5 needle README.md | head -n 2", "rg -n -A 5 needle README.md | head -n 2", false, true],
  // grep: boolean members only
  ["grep -in needle README.md", "grep -i -n needle README.md", true, true],
  ["grep -cn needle README.md", "grep -c -n needle README.md", true, true],
  ["grep -nFv needle README.md", "grep -n -F -v needle README.md", true, true],
  ["grep -nEi needle README.md", "grep -n -E -i needle README.md", true, true],
  ["grep -Hno needle README.md", "grep -H -n -o needle README.md", true, true],
  ["grep -hn needle README.md", "grep -h -n needle README.md", true, true],
  ["grep -nn needle README.md", "grep -n -n needle README.md", true, true],
  ["grep -in needle README.md CLAUDE.md", "grep -i -n needle README.md CLAUDE.md", true, true],
  // grep: a member that takes a value stays refused in a cluster
  ["grep -nm 5 needle README.md", "grep -n -m 5 needle README.md", false, true],
  ["grep -nC5 needle README.md", "grep -n -C5 needle README.md", false, true],
  ["grep -nA 2 needle README.md", "grep -n -A 2 needle README.md", false, true],
  ["grep -ne needle README.md", "grep -n -e needle README.md", false, false],
  ["grep -nf README.md README.md", "grep -n -f README.md README.md", false, false],
  // grep: members that are not admitted on their own (recursion, files-with-matches, perl regex, no-messages, devices)
  ["grep -rn needle README.md", "grep -r -n needle README.md", false, false],
  ["grep -nR needle README.md", "grep -n -R needle README.md", false, false],
  ["grep -nl needle README.md", "grep -n -l needle README.md", false, false],
  ["grep -nP needle README.md", "grep -n -P needle README.md", false, false],
  ["grep -ns needle README.md", "grep -n -s needle README.md", false, false],
  ["grep -nz needle README.md", "grep -n -z needle README.md", false, false],
  // grep: a cluster never widens the target
  ["grep -in needle ../outside.txt", "grep -i -n needle ../outside.txt", false, false],
  ["grep -in needle ~/.ssh/id_rsa", "grep -i -n needle ~/.ssh/id_rsa", false, false],
  ["grep -n -- -in README.md", "grep -n -- -in README.md", true, true],
  // grep pipelines: the sink keeps its own, narrower flag set (no -o, -H, -h)
  ["grep -in needle README.md | head -n 2", "grep -i -n needle README.md | head -n 2", true, true],
  ["grep -n needle README.md | grep -ic x", "grep -n needle README.md | grep -i -c x", true, true],
  ["grep -n needle README.md | grep -io x", "grep -n needle README.md | grep -i -o x", false, false],
  ["cat README.md | grep -in x", "cat README.md | grep -i -n x", true, true],
  ["cat README.md | grep -ol x", "cat README.md | grep -o -l x", false, false],
];

test("RCD19: C22B table - a short-flag cluster is admitted exactly when every member is admitted on its own, for rg and grep, never wider than its spelled-out form", () => {
  for (const [cluster, spelled, clusterAdmitted, spelledAdmitted] of CLUSTER_ROWS) {
    assert.equal(isReadOnlyDiagnosticCommand(spelled, root), spelledAdmitted, `baseline, spelled out: ${spelled}`);
    assert.equal(isReadOnlyDiagnosticCommand(cluster, root), clusterAdmitted, `cluster: ${cluster}`);
    if (clusterAdmitted) assert.equal(spelledAdmitted, true, `a cluster is never admitted where its spelled-out form is refused: ${cluster}`);
  }
});

test("RCD20: C22B - a refused cluster that holds a value-taking flag still prints the spelled-out form, and an admitted cluster prints nothing", async () => {
  assert.equal(firstUnadmittedFlag("rg -nA 5 needle README.md", root), "-nA");
  assert.equal(clusterSpellingHint("rg -nA 5 needle README.md", "-nA", root), "a combined short-flag cluster is not admitted here; give each flag on its own: -n -A");
  const refused = await refusal("rg -nA 5 needle README.md");
  assert.equal(refused.exitCode, 2);
  assert.match(String(refused.stderr), /Rejected element: the flag "-nA" \(a combined short-flag cluster is not admitted here; give each flag on its own: -n -A\)\./u);
  assert.equal(firstUnadmittedFlag("rg -ln needle README.md", root), null, "an admitted cluster is not a refusal");
  assert.equal(clusterSpellingHint("rg -ln needle README.md", "-ln", root), null, "no hint for an admitted cluster");
});

test("RCD21: C22B - every runner route reaches the same cluster grammar: Claude, Codex and Antigravity guard runs and the PowerShell tool agree with the Bash verdict", async () => {
  const guard = await import("../hooks/guard-lifecycle-ready.mjs");
  for (const runner of ["claude", "codex", "antigravity"]) {
    for (const [command, exitCode] of [["rg -ln needle README.md", 0], ["grep -in needle README.md", 0], ["rg -nA 5 needle README.md", 2], ["grep -rn needle README.md", 2]]) {
      const result = await guard.evaluateLifecycleReadyGuard({ tool_name: "Bash", tool_input: { command } }, {
        projectDir: root, runner,
        inspectProjectOnboardingV3Fn() { throw new Error("fixture: no onboarding observation"); },
      });
      assert.equal(result.exitCode, exitCode, `${runner}: ${command}`);
    }
  }
  assert.equal((await powershellVerdict("rg -ln needle README.md")).exitCode, 0);
  assert.equal((await powershellVerdict("rg -nA 5 needle README.md")).exitCode, 2);
  for (const file of ["codex-pretool-guard.mjs", "antigravity-pretool-guard.mjs"]) {
    const source = readFileSync(join(root, "plugins", "pipeline-core", "hooks", file), "utf8");
    assert.match(source, /guard-lifecycle-ready\.mjs/u, `${file} runs the one lifecycle guard`);
  }
});

async function powershellVerdict(command) {
  const guard = await import("../hooks/guard-lifecycle-ready.mjs");
  return guard.evaluateLifecycleReadyGuard({ tool_name: "PowerShell", tool_input: { command } }, {
    projectDir: root, runner: "claude",
    inspectProjectOnboardingV3Fn() { throw new Error("fixture: no onboarding observation"); },
  });
}

test("RCD18: the PowerShell tool admits the node and git version probes and a read-only rg exactly like the Bash grammar, and nothing wider", async () => {
  for (const command of ["node --version", "node -v", "git --version", "git status --short", "git log --oneline -n 3", "rg -n needle README.md"]) {
    assert.equal((await powershellVerdict(command)).exitCode, 0, command);
  }
  for (const command of [
    "node --eval 1", "node --version --help", "git --version --help", "git push origin main", "git checkout main",
    "rg --hidden needle README.md", "rg -n needle ../outside.txt", "rg -n a,b README.md",
    "cat README.md", "ls docs", "find docs -maxdepth 1",
    "C:/tools/git.exe --version", "C:/tools/node.exe --version",
  ]) {
    const result = await powershellVerdict(command);
    assert.equal(result.exitCode, 2, command);
    assert.match(String(result.stderr), /GUARD-/u, command);
  }
});

test("RCD7: the helper never grants: the diagnosed command itself stays refused", () => {
  const command = "rg --hidden needle README.md";
  assert.equal(firstUnadmittedFlag(command, root), "--hidden");
  assert.equal(isReadOnlyDiagnosticCommand(command, root), false);
});
