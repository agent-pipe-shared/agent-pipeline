// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { firstUnadmittedFlag, firstUnadmittedGlobValue, flagSpellingHint, GLOB_FORM_HINT, clusterSpellingHint, lsListingHint, repeatedFlagHint } from "./read-command-diagnosis.mjs";
import * as diagnosis from "./read-command-diagnosis.mjs";
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
  // QG-04 restated (C22B admits the attached context flags -A/-B/-C): -m is the value flag that stays separate.
  const attached = "rg -n -m8 needle README.md";
  assert.equal(isReadOnlyDiagnosticCommand(attached, root), false, "fixture must be refused");
  assert.equal(isReadOnlyDiagnosticCommand("rg -n -m 8 needle README.md", root), true, "the suggested spelling is admitted");
  const result = await refusal(attached);
  assert.equal(result.exitCode, 2);
  assert.match(String(result.stderr), /Rejected element: the flag "-m8" \(an attached value is not admitted; give it as a separate argument: -m 8\)\./u);
});

test("RCD-R6: a repeated option is named, with or without a value, and only when the repeat is the whole fault", async () => {
  for (const [command, flag] of [["rg -n -A 3 -A 5 needle docs", "-A"], ["rg -n -m 3 -m 5 needle docs", "-m"], ["head -n 3 -n 5 README.md", "-n"], ["rg -n -n needle README.md", "-n"]]) {
    assert.equal(firstUnadmittedFlag(command, root), flag, command);
    assert.equal(repeatedFlagHint(command, flag, root), `this option is given more than once and is admitted once here; keep one ${flag}`, command);
  }
  assert.equal(firstUnadmittedFlag("rg -n -A 3 -A 5 --hidden needle docs", root), null, "two faults: no single token explains it");
  assert.equal(firstUnadmittedFlag("rg -n -n --hidden needle README.md", root), null, "a repeat beside a second fault: dropping the word after the repeat must not hide it");
  assert.equal(repeatedFlagHint("rg --hidden needle README.md", "--hidden", root), null, "a flag given once is no repeat");
  assert.equal(repeatedFlagHint(undefined, "-n", root), null);
  const result = await refusal("rg -n -A 3 -A 5 needle README.md");
  assert.match(String(result.stderr), /Rejected element: the flag "-A" \(this option is given more than once and is admitted once here; keep one -A\)\./u);
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
  // grep: members that are not admitted on their own (follow-recursion, perl regex, devices). QG-04, restated in place (PO decision of 2026-11-09, recursive
  // grep behind its own screen; RCD22-RCD24): -r, -l and -s are now admitted flags, so the rows that pinned them as refused say admitted, in the cluster and
  // spelled out alike; the rule this table pins (a cluster is never admitted where its spelled-out form is refused) is unchanged and still asserted below.
  ["grep -rn needle README.md", "grep -r -n needle README.md", true, true],
  ["grep -nR needle README.md", "grep -n -R needle README.md", false, false],
  ["grep -nl needle README.md", "grep -n -l needle README.md", true, true],
  ["grep -nP needle README.md", "grep -n -P needle README.md", false, false],
  ["grep -ns needle README.md", "grep -n -s needle README.md", true, true],
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
    // QG-04, restated in place (PO decision of 2026-11-09, recursive grep behind its own screen): this row pinned `grep -rn` as refused. It now uses -R,
    // which stays refused (it follows links), so the claim of this case - every runner reaches the one grammar and agrees on a refusal - is unchanged.
    for (const [command, exitCode] of [["rg -ln needle README.md", 0], ["grep -in needle README.md", 0], ["rg -nA 5 needle README.md", 2], ["grep -nR needle README.md", 2]]) {
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

// C22B (AC-108, PO decision 2026-11-09): recursive grep is admitted for the shapes agents type, behind its own screen (passive-read-policy.mjs, option allFiles).
function repoFixture(t, files, links = {}) {
  const base = realpathSync(mkdtempSync(join(tmpdir(), "grep-r-grammar-")));
  t.after(() => rmSync(base, { recursive: true, force: true }));
  const project = join(base, "repo");
  mkdirSync(project);
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(project, path)), { recursive: true });
    writeFileSync(join(project, path), content);
  }
  for (const [path, target] of Object.entries(links)) symlinkSync(target, join(project, path));
  return project;
}
const PLAIN_FILES = { "src/a.mjs": "needle\n", "src/b.md": "needle\n", "sub/dir/c.txt": "needle\n", "README.md": "needle\n" };
const rgAvailable = spawnSync("rg", ["--version"], { encoding: "utf8" }).status === 0;

test("RCD22: C22B - recursive grep: the admitted shapes, and the spellings that stay refused", (t) => {
  const plain = repoFixture(t, PLAIN_FILES);
  const withGit = repoFixture(t, { ...PLAIN_FILES, ".git/config": "x\n" });
  const worktree = repoFixture(t, { ...PLAIN_FILES, ".git": "gitdir: ../w/.git/worktrees/w\n" });
  const withDotenv = repoFixture(t, { ...PLAIN_FILES, ".env": "NEEDLE=fake\n", ".git/config": "x\n" });
  const withKey = repoFixture(t, { ...PLAIN_FILES, "build/deploy.key": "fake\n", ".ignore": "build/\n" });
  const admitted = [
    "grep -rn needle src", "grep -rl needle src", "grep -rE needle src", "grep -ril needle src", "grep -rln needle src", "grep -rnw needle src",
    "grep --recursive needle src", "grep -r needle sub/dir", "grep -rn needle src sub", "grep -rn needle README.md", "grep -r -n needle src",
    "grep -rn --include='*.mjs' needle src", "grep -rn --include '*.mjs' needle src", "grep -rn --exclude='*.md' needle src",
    "grep -rn --exclude-dir=sub needle src", "grep -rn needle src --exclude-dir=sub", "grep -rn needle src --include='*.mjs' --exclude='*.md'",
    "grep -rn needle src | head -n 20", "grep -rn needle src | head -20", "grep -rn needle src | grep -v mjs",
    "grep -rn needle src | head -n 5 && git status", "grep -rl needle src 2>/dev/null",
    "grep -l needle README.md", "grep -ws needle README.md", "grep --files-with-matches needle README.md", "grep --word-regexp --no-messages needle README.md",
  ];
  for (const command of admitted) assert.equal(isReadOnlyDiagnosticCommand(command, plain), true, command);
  // the root of a repository: .git must be excluded by name, repeated at most 8 times, and --include/--exclude relax nothing
  assert.equal(isReadOnlyDiagnosticCommand("grep -rn needle .", plain), true, "no .git, nothing sensitive");
  assert.equal(isReadOnlyDiagnosticCommand("grep -rn needle .", withGit), false, ".git directory");
  assert.equal(isReadOnlyDiagnosticCommand("grep -rn needle .", worktree), false, ".git file");
  for (const command of [
    "grep -rn needle . --exclude-dir=.git", "grep -rn needle . --exclude-dir=.git --exclude-dir=node_modules", "grep -rn --exclude-dir=.git needle .",
    "grep -rn --exclude-dir=.git --include='*.mjs' needle .", "grep -rn needle . --exclude-dir=.git | head -n 20",
  ]) {
    assert.equal(isReadOnlyDiagnosticCommand(command, withGit), true, command);
    assert.equal(isReadOnlyDiagnosticCommand(command, worktree), true, `worktree: ${command}`);
    assert.equal(isReadOnlyDiagnosticCommand(command, withDotenv), false, `a secret name is never relaxed: ${command}`);
  }
  assert.equal(isReadOnlyDiagnosticCommand("grep -rn --include='*.md' needle .", withKey), false, "--include does not relax the screen");
  assert.equal(isReadOnlyDiagnosticCommand("grep -rn --exclude='*.key' needle .", withKey), false, "--exclude does not relax the screen");
  assert.equal(isReadOnlyDiagnosticCommand("grep -rn --exclude-dir=.git needle .", withKey), false, "an unrelated exclusion does not relax it");
  assert.equal(isReadOnlyDiagnosticCommand("grep -rn --exclude-dir=build needle .", withKey), true, "the named directory is pruned");
  const eight = Array.from({ length: 8 }, (_, index) => `--exclude-dir=d${index}`).join(" ");
  assert.equal(isReadOnlyDiagnosticCommand(`grep -rn needle src ${eight}`, plain), true, "8 exclusions");
  assert.equal(isReadOnlyDiagnosticCommand(`grep -rn needle src ${eight} --exclude-dir=d8`, plain), false, "9 exclusions");
  const refused = [
    "grep -Rn needle src", "grep -R needle src", "grep --dereference-recursive needle src", "grep -rf README.md src", "grep -r -f README.md needle src",
    "grep -rP needle src", "grep -rz needle src", "grep -r needle", "grep -rn", "grep -r --include='*.mjs' needle",
    "grep -n needle src", "grep -l needle src", "grep -s needle src", "grep needle src",
    "grep -rn --include=src/*.mjs needle src", "grep -rn --include='../*.mjs' needle src", "grep -rn --include='*.mjs/..' needle src", "grep -rn --include= needle src",
    "grep -rn --exclude-dir=src/lib needle src", "grep -rn --exclude-dir='*' needle src", "grep -rn --exclude-dir=.. needle src", "grep -rn --exclude-dir= needle src",
    "grep -rn --exclude-dir=. needle src", "grep -rn --exclude-dir .git needle src", "grep -rn --exclude-dir='sub/dir' needle src", "grep -rn --exclude-dir=-x needle src",
    "grep -rn --include-dir=src needle src", "grep -rn --exclude-from=README.md needle src", "grep -rn needle src -P", "grep -rn needle src --include",
    "grep -rn needle ~/.ssh", "grep -rn needle /etc", "grep -rn needle ../outside",
    "grep -n needle README.md | grep -r x", "grep -n needle README.md | grep -l x", "grep -n needle README.md | grep -s x", "grep -n needle README.md | grep --include='*.md' x",
    "grep -rn needle src | head -n 20 extra", "grep -rn needle src | cat", "grep -rn needle src > out.txt",
  ];
  for (const command of refused) assert.equal(isReadOnlyDiagnosticCommand(command, plain), false, command);
  // D96 (an ordinary directory outside the project is readable): the same rule gives an outside tree to grep -r that rg already has, and the all-files
  // screen refuses it on the same grounds as inside (a .git, a secret name). A link out of the tree is refused (see passive-read-policy.test.mjs).
  const outsideClean = repoFixture(t, PLAIN_FILES);
  const outsideGit = repoFixture(t, { ...PLAIN_FILES, ".git/config": "x\n" });
  const outsideKey = repoFixture(t, { ...PLAIN_FILES, ".cache/deploy.key": "fake\n" });
  assert.equal(isReadOnlyDiagnosticCommand(`rg -n needle ${outsideClean}`, plain), true, "baseline: rg reads an ordinary outside directory");
  assert.equal(isReadOnlyDiagnosticCommand(`grep -rn needle ${outsideClean}`, plain), true, "a clean outside tree");
  assert.equal(isReadOnlyDiagnosticCommand(`grep -rn needle ${outsideGit}`, plain), false, "an outside tree holding .git");
  assert.equal(isReadOnlyDiagnosticCommand(`grep -rn needle ${outsideGit} --exclude-dir=.git`, plain), true, "excluded by name");
  assert.equal(isReadOnlyDiagnosticCommand(`rg -n needle ${outsideKey}`, plain), true, "baseline: the rg screen skips hidden entries and passes this tree");
  assert.equal(isReadOnlyDiagnosticCommand(`grep -rn needle ${outsideKey}`, plain), false, "the hidden key is what grep -r reads and rg does not");
});

test("RCD23: C22B - the refusal of a recursive grep over a tree the screen rejects prints one command the grammar really admits, or nothing", (t) => {
  assert.equal(typeof diagnosis.recursiveGrepHint, "function", "the hint function exists");
  const withGit = repoFixture(t, { ...PLAIN_FILES, ".git/config": "x\n" });
  const withDotenv = repoFixture(t, { ...PLAIN_FILES, ".env": "NEEDLE=fake\n", ".git/config": "x\n" });
  const hint = (command, project) => diagnosis.recursiveGrepHint(command, project);
  assert.equal(hint("grep -rn needle .", withGit), "grep -rn needle . --exclude-dir=.git");
  assert.equal(hint("grep -rln needle .", withGit), "grep -rln needle . --exclude-dir=.git");
  assert.equal(hint("grep -ri --include='*.mjs' needle .", withGit), "grep -ri '--include=*.mjs' needle . --exclude-dir=.git");
  assert.equal(hint("grep -rn 'two words' .", withGit), "grep -rn 'two words' . --exclude-dir=.git");
  // a secret-named file under a hidden directory cannot be excluded by name: the rg form (rg skips hidden entries by its own rule, and the rg screen
  // admits that tree) is the other admitted spelling. A secret name at the top is refused by BOTH screens, so there is no spelling to print.
  const withHiddenKey = repoFixture(t, { ...PLAIN_FILES, ".cache/deploy.key": "fake\n" });
  assert.equal(hint("grep -rn needle .", withHiddenKey), rgAvailable ? "rg -n needle ." : null);
  assert.equal(hint("grep -ril needle .", withHiddenKey), rgAvailable ? "rg -il needle ." : null);
  assert.equal(hint("grep -rn needle .", withDotenv), null, "a .env at the top is refused by the rg screen too");
  for (const [command, project] of [["grep -rn needle .", withGit], ["grep -rln needle .", withGit], ["grep -rn needle .", withHiddenKey]]) {
    const printed = hint(command, project);
    if (printed !== null) assert.equal(isReadOnlyDiagnosticCommand(printed, project), true, `a printed hint is admitted: ${printed}`);
    assert.equal(isReadOnlyDiagnosticCommand(command, project), false, "the diagnosed command stays refused");
  }
  assert.equal(firstUnadmittedFlag("grep -rn needle .", withGit), null, "no single flag is the fault; the hint above carries the diagnosis");
  for (const [command, project, why] of [
    ["grep -rn needle src", withGit, "an admitted command"],
    ["grep -n needle .", withGit, "not a recursive grep"],
    ["grep -Rn needle .", withGit, "-R is refused for its own reason, no suggestion built on it"],
    ["grep -rn needle . | head -n 3", withGit, "pipelines are not diagnosed"],
    ["grep -rn needle . > out.txt", withGit, "redirects are not diagnosed"],
    ["grep -rn needle ~/.ssh", withGit, "a credential operand has no admitted spelling"],
    ["grep -rn needle . --exclude-dir=.git", withDotenv, "already excluded, and the rg form is not built from a filter"],
    ["grep -rn -- needle .", withGit, "no suggestion after --"],
    ["rg -n needle .", withGit, "not grep"],
    ["", withGit, "empty"],
    [undefined, withGit, "missing"],
  ]) assert.equal(hint(command, project), null, `${why}: ${command}`);
});

test("RCD24: C22B - Claude, Codex and Antigravity run the same recursive-grep rule, the refusal prints the admitted spelling, and the PowerShell tool is not widened", async (t) => {
  const guard = await import("../hooks/guard-lifecycle-ready.mjs");
  // A governed, READY fixture: the guard enforces the closed grammar there (an ungoverned directory is not enforced at all).
  const project = repoFixture(t, {
    ...PLAIN_FILES, ".git/config": "x\n", "pipeline.user.yaml": "schema: pipeline.user.v3\n",
    ".agent-pipeline/onboarding-consent.json": JSON.stringify({ schema: "pipeline.onboarding-consent-marker.v1", status: "consent-given-onboarding-incomplete", consentGivenAt: "2026-09-29T00:00:00.000Z" }),
  });
  const ready = { schema: "pipeline.project-onboarding-ready-gate.v1", status: "ready", intent: "session" };
  const run = (tool, command, runner = "claude") => guard.evaluateLifecycleReadyGuard({ tool_name: tool, tool_input: { command } }, {
    projectDir: project, runner, requireProjectOnboardingReadyFn() { return ready; },
  });
  for (const runner of ["claude", "codex", "antigravity"]) {
    for (const [command, exitCode] of [
      ["grep -rn needle src", 0], ["grep -rln needle src | head -n 5", 0], ["grep -rn needle . --exclude-dir=.git", 0],
      ["grep -rn needle .", 2], ["grep -Rn needle src", 2], ["grep -rn needle src --include=src/x", 2],
    ]) assert.equal((await run("Bash", command, runner)).exitCode, exitCode, `${runner}: ${command}`);
  }
  const refused = await run("Bash", "grep -rn needle .");
  assert.match(String(refused.stderr), /GUARD-READ-COMMAND-UNSUPPORTED/u);
  assert.match(String(refused.stderr), /Rejected element: .*grep -rn needle \. --exclude-dir=\.git/u);
  assert.equal((await run("PowerShell", "grep -rn needle src")).exitCode, 2, "the PowerShell tool has no grep route; the rule widens nothing there");
  assert.equal((await run("PowerShell", "rg -n needle src")).exitCode, 0);
  const grammar = (await import("./guard/grammar-denials.mjs")).ADMITTED_GRAMMAR_SHAPES.map((shape) => shape.spelling).join("\n");
  assert.match(grammar, /grep -r/u, "the printed grammar list names recursive grep");
  assert.match(grammar, /--exclude-dir/u);
});

test("RCD7: the helper never grants: the diagnosed command itself stays refused", () => {
  const command = "rg --hidden needle README.md";
  assert.equal(firstUnadmittedFlag(command, root), "--hidden");
  assert.equal(isReadOnlyDiagnosticCommand(command, root), false);
});
