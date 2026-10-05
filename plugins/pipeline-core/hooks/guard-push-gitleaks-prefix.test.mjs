// SPDX-License-Identifier: SUL-1.0
/**
 * guard-push-gitleaks-prefix.test.mjs -- regression suite for GPGL
 * (pipeline.guard-push-treats-gitleaks-as-a-git-command). Run:
 *   node plugins/pipeline-core/hooks/guard-push-gitleaks-prefix.test.mjs
 * Exit: 0 = all cases pass, 1 = at least one case failed (the failure list is printed).
 *
 * THE DEFECT. A direct `gitleaks ...` Bash call was refused by guard-push with "push command
 * prefix is ambiguous". The refusal text is produced by `parsePushBinding` only AFTER the
 * shared classifier `commandIsGitPush` (lib/git-cmd.mjs) has already called the command a
 * push. The classifier did that for a program that is not git at all because its fail-closed
 * check #2 looked for the WORD `git` followed by a `-` token ANYWHERE in the command, not at
 * command position: `gitleaks detect --no-git --redact` carried it inside `--no-git`, and the
 * gitleaks subcommand form `gitleaks git --redact` carries it as a literal argument.
 * `gitleaks detect --no-banner --redact` and `gitleaks protect --staged` carry no such word
 * and were never refused; they stay in the suite as the baseline the briefed examples named.
 *
 * THE RULE (GPGL-2 boundary rule, GPGL-3 escaped-quote rule). The classifier decides by
 * POSITION, never by program name -- there is no exemption by executable name:
 *   - The `git` word counts only where an executable can stand: at the start of the command,
 *     or directly after whitespace, a shell operator (`;` `&` `|` `(` backtick, `$(`), a quote,
 *     or a path separator (`/` `\`). A `git` inside `--no-git`, `.git`, `=git` or a longer word
 *     is not an executable, so a tool that merely carries such text is not a push.
 *   - A literal whitespace-separated `git` ARGUMENT (`gitleaks git --redact`) is
 *     indistinguishable from the executable and stays refused: fail-closed, accepted.
 *   - A backslash-escaped quote (`\'` or `\"`) outside a plain single-quoted span together
 *     with a `git` word at an executable boundary anywhere in the command classifies as a
 *     push (GPGL-3, fail closed): a shell executes the text between two escaped quotes while
 *     the classifier's quote stripper would read the pair as a quoted span and hide a real
 *     push there (GL-B13).
 *
 * WHAT IS PINNED.
 *   A. A gitleaks call without a literal `git` word at an executable boundary is not a push
 *      (`--no-git` included); the literal-`git`-word forms stay refused.
 *   B. Every real git push form stays refused, with the same reason as before, including the
 *      forms refused as an ambiguous executable prefix (`git.exe`, `env git`, `sudo git`),
 *      the escaped-quote shape (GL-B13) and every shell bundle that merely CONTAINS a
 *      gitleaks call next to a real push. A tool whose name merely starts or ends in
 *      gitleaks and carries `--no-git` (B15, B16) has no git executable and is not a push.
 *   C. Tokens that only resemble git (`gitx`, `git-foo`) are not classified as a push, before
 *      and after: this suite changes nothing for that token class.
 *
 * FIXTURES ARE REAL. Every spawn is a subprocess of the real guard in a fresh temp repository
 * carrying a blocking push gate, so a command that the guard DOES classify as a push is
 * actually evaluated and refused rather than waved through an inactive gate. The hook input
 * carries an absolute `cwd`, as a host adapter's does.
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createGovernanceScopeController } from "../lib/governance-scope.mjs";

const GUARD = fileURLToPath(new URL("./guard-push.mjs", import.meta.url));
const ALL_DIRS = [];
const BLOCK = 2;
const ALLOW = 0;

function gitAt(dir, ...args) {
  return spawnSync("git", args, { cwd: dir, encoding: "utf8" });
}

function put(dir, rel, text) {
  const full = join(dir, rel);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, text);
}

function enrollFixtureGovernance(root) {
  const controller = createGovernanceScopeController({ hostStateRoot: join(root, ".git", "fixture-hoststate") });
  const inactive = controller.observe({ rootDir: root });
  if (inactive.state !== "inactive" || inactive.requiresEnforcement) throw new Error("fixture governance was not initially inactive");
  const plan = controller.planDecision({ rootDir: root, decision: "enroll", by: "disposable-guard-fixture" });
  const active = controller.applyDecision(plan, { activate: true, planSha256: plan.planSha256 });
  if (active.state !== "active" || !active.requiresEnforcement) throw new Error("fixture enrollment did not activate enforcement");
}

/** A repository with an active push gate: a classified push is evaluated, never waved through. */
function gatedRepo(prefix) {
  const dir = mkdtempSync(join(tmpdir(), `guard-push-gpgl-${prefix}-`));
  ALL_DIRS.push(dir);
  const initialized = gitAt(dir, "init", "-q", "-b", "main");
  if (initialized.status !== 0) throw new Error(`fixture Git initialization failed: ${initialized.stderr}`);
  enrollFixtureGovernance(dir);
  gitAt(dir, "config", "user.email", "goldfish@example.invalid");
  gitAt(dir, "config", "user.name", "Goldfish");
  gitAt(dir, "config", "commit.gpgSign", "false");
  put(dir, "README.md", "fixture\n");
  put(dir, ".claude/pipeline.yaml", "schema: pipeline.manifest.v0\ngates:\n  push:\n    mode: blocking\n    type: human\n    approval: required\n");
  gitAt(dir, "add", "README.md");
  gitAt(dir, "commit", "-q", "-m", "init");
  return dir;
}

function runGuard(command, dir) {
  const res = spawnSync(process.execPath, [GUARD], {
    input: JSON.stringify({ tool_name: "Bash", tool_input: { command }, cwd: dir }),
    encoding: "utf8",
    cwd: dir,
    env: { ...process.env, CLAUDE_PROJECT_DIR: dir },
    stdio: ["pipe", "pipe", "pipe"],
    timeout: 20000,
  });
  return { code: res.status, stderr: res.stderr ?? "" };
}

let pass = 0;
const failures = [];

function record(id, problems) {
  if (problems.length === 0) {
    pass++;
    console.log(`PASS  ${id}`);
  } else {
    failures.push(`${id}: ${problems.join("; ")}`);
    console.log(`FAIL  ${id} -- ${problems.join("; ")}`);
  }
}

function check(id, command, dir, expectExit, { stderrIncludes, stderrNotIncludes, stderrEmpty } = {}) {
  const { code, stderr } = runGuard(command, dir);
  const problems = [];
  if (code !== expectExit) problems.push(`exit ${code} (expected ${expectExit}) -- stderr: ${stderr.trim().slice(0, 300)}`);
  for (const needle of [].concat(stderrIncludes ?? [])) {
    if (!stderr.includes(needle)) problems.push(`stderr missing "${needle}" -- got: ${stderr.trim().slice(0, 300)}`);
  }
  for (const needle of [].concat(stderrNotIncludes ?? [])) {
    if (stderr.includes(needle)) problems.push(`stderr unexpectedly contains "${needle}"`);
  }
  if (stderrEmpty && stderr.trim() !== "") problems.push(`stderr not empty: ${stderr.trim().slice(0, 200)}`);
  record(id, problems);
}

const AMBIGUOUS_PREFIX = "push command prefix is ambiguous";
const dir = gatedRepo("main");

// ---- A. a standalone gitleaks call is not a push -----------------------------------------------
const gitleaksCases = [
  ["GL-A1 allow gitleaks detect with no git-looking word (briefed baseline)", "gitleaks detect --no-banner --redact", ALLOW],
  ["GL-A2 allow gitleaks protect --staged (briefed baseline)", "gitleaks protect --staged", ALLOW],
  ["GL-A3 allow gitleaks detect --no-git followed by another flag (the observed trigger)", "gitleaks detect --no-git --redact", ALLOW],
  // fail-closed: literal git word stays refused (GPGL-2)
  ["GL-A4 block the gitleaks `git` subcommand followed by a flag", "gitleaks git --redact", BLOCK],
  ["GL-A5 allow --no-git followed by a verbose flag and a source path", "gitleaks detect --no-git -v --source .", ALLOW],
  // fail-closed: literal git word stays refused (GPGL-2)
  ["GL-A6 block gitleaks.exe with an absolute path and a literal git word", "/usr/local/bin/gitleaks.exe git --no-banner --redact", BLOCK],
  // fail-closed: literal git word stays refused (GPGL-2)
  ["GL-A7 block a leading environment assignment before gitleaks with a literal git word", "GITLEAKS_LOG_LEVEL=debug gitleaks git --redact", BLOCK],
  // fail-closed: literal git word stays refused (GPGL-2)
  ["GL-A8 block a quoted argument that mentions a push next to a literal git word", 'gitleaks git --redact --log-opts "origin/main..HEAD --not push"', BLOCK],
];
for (const [id, command, expectExit] of gitleaksCases) {
  check(
    id,
    command,
    dir,
    expectExit,
    expectExit === ALLOW ? { stderrEmpty: true, stderrNotIncludes: [AMBIGUOUS_PREFIX] } : { stderrIncludes: ["BLOCKED (guard-push"] },
  );
}

// ---- B. every real git push form stays refused, with the same reason ---------------------------
check("GL-B1 block git push origin HEAD (bare implicit destination)", "git push origin HEAD", dir, BLOCK, {
  stderrIncludes: ["BLOCKED (guard-push"],
});
check("GL-B2 block git push --tags (not bindable to one source commit)", "git push origin --tags", dir, BLOCK, {
  stderrIncludes: ["cannot be bound to exactly one source commit"],
});
check("GL-B3 block a chain of two real pushes (standalone-command grammar)", "git push origin v1.0.0 && git push origin v2.0.0", dir, BLOCK, {
  stderrIncludes: ["standalone command"],
});
check("GL-B4 block git.exe as an ambiguous executable prefix", "git.exe push origin HEAD:refs/heads/feat/x", dir, BLOCK, {
  stderrIncludes: [AMBIGUOUS_PREFIX],
});
check("GL-B5 block env git as an ambiguous executable prefix", "env git push origin HEAD:refs/heads/feat/x", dir, BLOCK, {
  stderrIncludes: [AMBIGUOUS_PREFIX],
});
check("GL-B6 block a wrapper around git with an unrecognised global option", "sudo git --unknown-opt push origin HEAD:refs/heads/feat/x", dir, BLOCK, {
  stderrIncludes: [AMBIGUOUS_PREFIX],
});
check("GL-B7 block git with an unrecognised global option", "git --unknown-opt push origin HEAD:refs/heads/feat/x", dir, BLOCK, {
  stderrIncludes: ["only git [-C <path>] push is accepted"],
});
check("GL-B8 block a gitleaks call chained to a real push with &&", "gitleaks detect --no-git --redact && git push origin HEAD:refs/heads/feat/x", dir, BLOCK, {
  stderrIncludes: ["standalone command"],
});
check("GL-B9 block a gitleaks call chained to a real push with ;", "gitleaks detect --no-git --redact; git push origin HEAD:refs/heads/feat/x", dir, BLOCK, {
  stderrIncludes: ["standalone command"],
});
check("GL-B10 block a gitleaks call piped into a real push", "gitleaks git --redact | git push origin HEAD:refs/heads/feat/x", dir, BLOCK, {
  stderrIncludes: ["standalone command"],
});
check("GL-B11 block a real push hidden in a command substitution of a gitleaks argument", "gitleaks git --redact $(git push origin HEAD:refs/heads/feat/x)", dir, BLOCK, {
  stderrIncludes: ["BLOCKED (guard-push"],
});
check("GL-B12 block a real push hidden in a quoted command substitution", 'gitleaks git --redact "$(git push origin HEAD:refs/heads/feat/x)"', dir, BLOCK, {
  stderrIncludes: ["BLOCKED (guard-push"],
});
check("GL-B13 block a real push after an escaped quote that fakes a quoted span", "gitleaks detect --no-git --x \\'; git push origin HEAD:refs/heads/feat/x; echo \\'", dir, BLOCK, {
  stderrIncludes: ["BLOCKED (guard-push"],
});
check("GL-B14 block a real push on a second line", "gitleaks detect --no-git --redact\ngit push origin HEAD:refs/heads/feat/x", dir, BLOCK, {
  stderrIncludes: ["BLOCKED (guard-push"],
});
// no git executable: refusal was an artifact of the --no-git false positive (GPGL-3)
check("GL-B15 allow an executable that only starts with gitleaks and carries --no-git", "gitleaks-wrapper detect --no-git --redact", dir, ALLOW, {
  stderrEmpty: true,
  stderrNotIncludes: [AMBIGUOUS_PREFIX],
});
// no git executable: refusal was an artifact of the --no-git false positive (GPGL-3)
check("GL-B16 allow an executable that only ends with gitleaks and carries --no-git", "mygitleaks detect --no-git --redact", dir, ALLOW, {
  stderrEmpty: true,
  stderrNotIncludes: [AMBIGUOUS_PREFIX],
});

// GPGL-5 (Critic finding F1): GPGL-4 looked for a contiguous `push` in the raw text, so a push word split by
// interior quotes behind an escaped-quote span was not classified while the shell still pushed.
check(
  "GL-B17 block a push whose word is split by interior quotes behind an escaped-quote span",
  String.raw`gitleaks detect --no-git --x \'; git pu"sh" origin HEAD:refs/heads/feat/x; echo \'`,
  dir,
  BLOCK,
  { stderrIncludes: ["BLOCKED (guard-push"] },
);
check("GL-B18 block a push whose word is split by interior quotes", 'git pu"sh" origin HEAD:refs/heads/feat/x', dir, BLOCK, {
  stderrIncludes: ["BLOCKED (guard-push"],
});

// ---- C. tokens that only resemble git are untouched --------------------------------------------
check("GL-C1 unchanged: gitx push is not a git push", "gitx push origin main", dir, ALLOW, { stderrEmpty: true });
check("GL-C2 unchanged: git-foo with a flag is not a git push", "git-foo --bar origin main", dir, ALLOW, { stderrEmpty: true });

// ---- cleanup and summary -----------------------------------------------------------------------
for (const created of ALL_DIRS) {
  try {
    rmSync(created, { recursive: true, force: true, maxRetries: 3 });
  } catch {
    /* temp cleanup is best-effort */
  }
}
console.log(`\n${pass} passed, ${failures.length} failed`);
if (failures.length > 0) {
  for (const failure of failures) console.log(`  - ${failure}`);
  process.exit(1);
}
