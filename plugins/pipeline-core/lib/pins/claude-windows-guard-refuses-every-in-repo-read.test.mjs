// SPDX-License-Identifier: SUL-1.0
// Regression pin for backlog item pipeline.claude-windows-guard-refuses-every-in-repo-read (ALF-C-P1-10, AC-128).
// Original acceptance (item Description/Proposal): ordinary passive reading of the repository must be possible in
// every lifecycle phase on Windows -- native Read (backslash, forward-slash and relative spellings), Bash head/cat/tail/rg,
// Glob listing and the missing-file diagnostic -- while out-of-root and credential reads stay refused, and a single
// unhealthy or case-differing auxiliary (session) root must never deny an in-root target.
// Every case runs through the real guard (evaluateLifecycleReadyGuard) or the real read policy; nothing is mocked.
// K3 (PO decision 2026-10-14, Critic finding F1 of batch C5): AP10-AP14 declare and pin the two further admission lanes this item's patch
// carries -- `git show <rev>:<path> | head -N` and `stat -c|--format` with the two fixed formats -- admitted shapes and fail-closed shapes.
// ALF-C-P1-10D (C5 correction round, findings C5D-F1 and C5D-C1): AP3 keeps a repeated rg -g/--glob REFUSED (SEC-11 examiner in
// hooks/guard-lifecycle-ready.test.mjs), and AP15 pins that every stat format-bearing spelling is routed into the closed stat lane.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { evaluateLifecycleReadyGuard } from "../../hooks/guard-lifecycle-ready.mjs";
import { isAllowedPassiveReadTarget } from "../passive-read-policy.mjs";
import { sessionReadScopeRoots } from "../guard/read-scope.mjs";
import { isBoundedReadOnlyPipeline, isBoundedSingleRg, parseGuardCommand } from "../../hooks/guard-command-grammar.mjs";
import { CLAUDE_BASH_SHELL_DIALECT_PLATFORM } from "../guard/constants.mjs";
import * as shellGrammar from "../guard/shell-grammar.mjs";

// Host fact: fixtures live under the repository scratch/, never the OS temp dir (protected by the read scope).
const SCRATCH_ROOT = fileURLToPath(new URL("../../../../scratch/", import.meta.url));
const WIN = process.platform === "win32";

function fixture() {
  mkdirSync(SCRATCH_ROOT, { recursive: true });
  const path = realpathSync(mkdtempSync(join(SCRATCH_ROOT, "alf-c-p1-10-")));
  mkdirSync(join(path, ".claude"), { recursive: true });
  mkdirSync(join(path, ".agent-pipeline"), { recursive: true });
  writeFileSync(join(path, ".agent-pipeline", "onboarding-consent.json"), JSON.stringify({
    schema: "pipeline.onboarding-consent-marker.v1",
    status: "consent-given-onboarding-incomplete",
    consentGivenAt: "2026-09-29T00:00:00.000Z",
  }));
  for (const dir of ["docs", "scratch/sub", "plugins/pipeline-core/lib", "vault"]) {
    mkdirSync(join(path, ...dir.split("/")), { recursive: true });
  }
  writeFileSync(join(path, "docs", "state.md"), "# state\napply\n");
  writeFileSync(join(path, "scratch", "notes.md"), "authorize-commit apply\n");
  writeFileSync(join(path, "scratch", "sub", "a.md"), "authorize-commit\n");
  writeFileSync(join(path, "plugins", "pipeline-core", "lib", "a.mjs"), "export const a = 1;\n");
  writeFileSync(join(path, "vault", "id_rsa"), "private\n");
  return path;
}

const fwd = (p) => p.replaceAll("\\", "/");
const verdict = (input, path) => {
  const r = evaluateLifecycleReadyGuard(input, { projectDir: path });
  return { exitCode: r.exitCode, text: String(r.stderr ?? "") };
};
const bash = (command) => ({ tool_name: "Bash", tool_input: { command } });
const withFixture = (fn) => {
  const path = fixture();
  try { return fn(path); } finally { rmSync(path, { recursive: true, force: true }); }
};

test("AP1 native Read of an in-repo file is admitted in backslash, forward-slash, relative and bounded-limit spellings", () => withFixture((path) => {
  const target = join(path, "docs", "state.md");
  const spellings = [target, fwd(target), "docs/state.md", `docs${WIN ? "\\" : "/"}state.md`];
  for (const file_path of spellings) {
    const r = verdict({ tool_name: "Read", tool_input: { file_path } }, path);
    assert.equal(r.exitCode, 0, `${file_path}\n${r.text}`);
  }
  const limited = verdict({ tool_name: "Read", tool_input: { file_path: target, limit: 40, offset: 1 } }, path);
  assert.equal(limited.exitCode, 0, limited.text);
}));

test("AP2 Bash head/cat/tail/wc/rg with a relative or absolute in-repo path are admitted, never labelled outside-root", () => withFixture((path) => {
  for (const command of [
    "head -n 40 docs/state.md",
    `head -n 40 ${fwd(path)}/docs/state.md`,
    "cat docs/state.md",
    "tail -n 20 docs/state.md",
    "wc -l docs/state.md",
    "rg -n apply docs/state.md",
    `rg -n apply ${fwd(path)}/docs/state.md`,
  ]) {
    const r = verdict(bash(command), path);
    assert.equal(r.exitCode, 0, `${command}\n${r.text}`);
    assert.doesNotMatch(r.text, /GUARD-READ-SCOPE-OUTSIDE-ROOT/u, command);
  }
  if (WIN) {
    const r = verdict(bash(`wc -l "${path}\\docs\\state.md"`), path);
    assert.equal(r.exitCode, 0, r.text);
  }
}));

test("AP3 the rg flags the item names (--no-heading, -m N) on an in-repo target are admitted; a repeated -g/--glob stays refused (SEC-11, C5D-C1)", () => withFixture((path) => {
  const file = "plugins/pipeline-core/lib/a.mjs";
  for (const command of [
    `rg -n --no-heading apply docs/state.md`,
    `rg -n -m 2 apply docs/state.md`,
    `rg -n --no-heading -m 20 "export" ${file}`,
    `rg -n --no-heading "authorize-commit" ${fwd(path)}/scratch`,
    // Unchanged by this item: one bounded basename filter and repeated type filters keep their pre-existing verdict.
    `rg -n --no-heading "authorize-commit" scratch -g "*.md"`,
    `rg -n apply docs/state.md --glob "*.md"`,
    `rg -n apply docs/state.md -t md -t txt`,
  ]) {
    const r = verdict(bash(command), path);
    assert.equal(r.exitCode, 0, `${command}\n${r.text}`);
  }
  // SEC-11 (examiner: hooks/guard-lifecycle-ready.test.mjs "recursive rg keeps default hidden/ignore semantics; globs may expose private
  // paths"): a recursive rg carries at most ONE bounded basename glob. A second glob is refused whichever spelling carries it, and the
  // refusal holds at the guard entry, at the single-command predicate and in the bounded `| head` pipeline.
  for (const command of [
    `rg -n --no-heading "authorize-commit" scratch -g "*.md" -g "*.txt" -g "*.ps1"`,
    `rg -l -S lifecycle plugins -g "*.mjs" -g "*.md"`,
    `rg -n apply docs/state.md --glob "*.md" --glob "*.txt"`,
    `rg -n apply docs/state.md -g "*.md" --glob "*.txt"`,
    `rg -l -S lifecycle plugins -g "*.mjs" -g "*.md" | head -n 180`,
    `rg -l -S lifecycle plugins -g '*.mjs' -g '*.md' | head -n 180`,
  ]) {
    const r = verdict(bash(command), path);
    assert.equal(r.exitCode, 2, `${command}\n${r.text}`);
    if (command.includes(" | ")) {
      const parsed = parseGuardCommand(command, path, { platform: CLAUDE_BASH_SHELL_DIALECT_PLATFORM });
      assert.equal(isBoundedReadOnlyPipeline(parsed, path), false, `pipeline lane: ${command}`);
    }
  }
  for (const argv of [
    ["-n", "--no-heading", "authorize-commit", "scratch", "-g", "*.md", "-g", "*.txt", "-g", "*.ps1"],
    ["-l", "-S", "lifecycle", "plugins", "-g", "*.mjs", "-g", "*.md"],
    ["-n", "apply", "docs/state.md", "--glob", "*.md", "--glob", "*.txt"],
    ["-n", "apply", "docs/state.md", "-g", "*.md", "--glob", "*.txt"],
  ]) {
    assert.equal(isBoundedSingleRg(argv, path), false, `single-command predicate: rg ${argv.join(" ")}`);
  }
  // Control: the same search with ONE glob is admitted, so the refusal above is the repetition and nothing broader.
  assert.equal(isBoundedSingleRg(["-l", "-S", "lifecycle", "plugins", "-g", "*.mjs"], path), true);
  const oneGlob = `rg -l -S lifecycle plugins -g "*.mjs" | head -n 180`;
  assert.equal(isBoundedReadOnlyPipeline(parseGuardCommand(oneGlob, path, { platform: CLAUDE_BASH_SHELL_DIALECT_PLATFORM }), path), true);
  assert.equal(verdict(bash(oneGlob), path).exitCode, 0);
}));

test("AP4 an unsupported in-root read command is refused with GUARD-READ-COMMAND-UNSUPPORTED, never the outside-root code", () => withFixture((path) => {
  for (const command of ["rg --hidden --no-ignore apply .", "grep -R apply ."]) {
    const r = verdict(bash(command), path);
    assert.equal(r.exitCode, 2, command);
    assert.match(r.text, /GUARD-READ-COMMAND-UNSUPPORTED/u, command);
    assert.doesNotMatch(r.text, /GUARD-READ-SCOPE-OUTSIDE-ROOT/u, command);
  }
}));

test("AP5 a case-differing session root (transcript directory spelled differently from disk) does not deny in-repo reads", {
  skip: !WIN && "typed host limitation: case-insensitive directory aliasing exists only on a case-insensitive (win32) host",
}, () => withFixture((path) => {
  const sessionDir = join(dirname(path), `${basename(path)}-Sess-AbC`);
  mkdirSync(join(sessionDir, "memory"), { recursive: true });
  try {
    const onDisk = join(sessionDir, "9f86d081-884c-4d30-8c19-ffcaa4c07bd1.jsonl");
    writeFileSync(onDisk, "{}\n");
    const aliased = join(dirname(sessionDir), basename(sessionDir).toLowerCase(), basename(onDisk));
    const roots = sessionReadScopeRoots({ transcript_path: aliased });
    assert.ok(roots.length >= 1, "the aliased transcript yields session roots");
    // The spelling really differs from the physical one (the trigger of the item), then each in-repo read is judged on its own.
    assert.ok(roots.some((r) => r !== realpathSync.native(r)), "a derived root keeps the non-physical casing");
    for (const target of [join(path, "docs", "state.md"), "docs/state.md"]) {
      assert.equal(isAllowedPassiveReadTarget(target, { rootDir: path, additionalRecursiveRoots: roots, recursive: true }), true, target);
      const r = verdict({ tool_name: "Read", tool_input: { file_path: target }, transcript_path: aliased }, path);
      assert.equal(r.exitCode, 0, `${target}\n${r.text}`);
    }
    const head = verdict({ ...bash("head -n 40 docs/state.md"), transcript_path: aliased }, path);
    assert.equal(head.exitCode, 0, head.text);
    // Per-target fail-closed: an out-of-project target under the unhealthy root is refused, the in-repo one beside it is not.
    assert.equal(isAllowedPassiveReadTarget(join(path, "docs", "state.md"), { rootDir: path, additionalRecursiveRoots: roots }), true);
  } finally { rmSync(sessionDir, { recursive: true, force: true }); }
}));

test("AP6 an unusable auxiliary root (relative, non-normalised, wildcard, wrong type, missing) is skipped for in-repo targets", () => withFixture((path) => {
  const target = join(path, "docs", "state.md");
  for (const bad of ["relative/dir", `${path}${WIN ? "\\" : "/"}..${WIN ? "\\" : "/"}x`, join(path, "a*b"), 42, null, join(path, "does-not-exist")]) {
    assert.equal(isAllowedPassiveReadTarget(target, { rootDir: path, additionalRecursiveRoots: [bad], recursive: true }), true, String(bad));
    assert.equal(isAllowedPassiveReadTarget("docs/state.md", { rootDir: path, additionalRecursiveRoots: [bad], recursive: true }), true, String(bad));
  }
}));

test("AP7 out-of-repo and credential reads stay refused (path traversal, in-repo secret name, outside secret, home credential)", () => withFixture((path) => {
  const outside = fixture();
  try {
    for (const input of [
      { tool_name: "Read", tool_input: { file_path: join(path, "vault", "id_rsa") } },
      { tool_name: "Read", tool_input: { file_path: join(outside, "vault", "id_rsa") } },
      { tool_name: "Read", tool_input: { file_path: "~/.ssh/id_rsa" } },
      { tool_name: "Read", tool_input: { file_path: "../../../../etc/shadow" } },
      bash("cat vault/id_rsa"),
      bash(`cat ${fwd(join(outside, "vault", "id_rsa"))}`),
      bash("cat ~/.ssh/id_rsa"),
    ]) {
      const r = verdict(input, path);
      assert.equal(r.exitCode, 2, JSON.stringify(input));
    }
    const scope = verdict(bash(`cat ${fwd(join(outside, "vault", "id_rsa"))}`), path);
    assert.match(scope.text, /GUARD-READ-SCOPE-OUTSIDE-ROOT/u);
    // Unhealthy aux root must not widen anything either.
    assert.equal(isAllowedPassiveReadTarget(join(outside, "vault", "id_rsa"), { rootDir: path, additionalRecursiveRoots: [outside], recursive: true }), false);
  } finally { rmSync(outside, { recursive: true, force: true }); }
}));

test("AP8 a Read of a missing in-repo file gets the distinct GUARD-READ-TARGET-MISSING code; secret and outside paths keep GUARD-READ-TARGET", () => withFixture((path) => {
  const missing = verdict({ tool_name: "Read", tool_input: { file_path: join(path, "scratch", "missing.log") } }, path);
  assert.equal(missing.exitCode, 2);
  assert.match(missing.text, /GUARD-READ-TARGET-MISSING/u);
  for (const file_path of [join(path, "scratch", "id_rsa"), join(path, "..", "missing.log")]) {
    const r = verdict({ tool_name: "Read", tool_input: { file_path } }, path);
    assert.equal(r.exitCode, 2, file_path);
    assert.doesNotMatch(r.text, /GUARD-READ-TARGET-MISSING/u, file_path);
  }
}));

test("AP9 Glob wildcard listing of an in-repo directory is admitted; hidden/escaping listings and directory Grep (SEC-11) stay refused", () => withFixture((path) => {
  assert.equal(verdict({ tool_name: "Glob", tool_input: { pattern: "scratch/*", path } }, path).exitCode, 0);
  assert.equal(verdict({ tool_name: "Glob", tool_input: { pattern: "scratch/sub/*" } }, path).exitCode, 0);
  assert.equal(verdict({ tool_name: "Glob", tool_input: { pattern: "*", path: join(path, ".git") } }, path).exitCode, 2);
  assert.equal(verdict({ tool_name: "Glob", tool_input: { pattern: "../*", path } }, path).exitCode, 2);
  assert.equal(verdict({ tool_name: "Grep", tool_input: { pattern: "apply", path: join(path, "docs", "state.md") } }, path).exitCode, 0);
  const dirGrep = verdict({ tool_name: "Grep", tool_input: { pattern: "apply", path: join(path, "scratch"), glob: "*.md" } }, path);
  assert.equal(dirGrep.exitCode, 2);
  assert.match(dirGrep.text, /GUARD-READ-TARGET/u);
}));

// ---------------------------------------------------------------------------------------------------------------------
// K3 (PO decision 2026-10-14, Critic finding F1 of batch C5): the patch for this item carries two admission lanes beyond the
// three rg flags. Both are declared in the grammar sources and pinned here.
//   Lane (a) guard-command-grammar.mjs isContainedGitShowObject:  git [--no-pager] show <HEAD|7..40-hex>:<path> | head -N
//   Lane (b) lib/guard/shell-grammar.mjs isFormattedStatReadArgs:  stat -c|--format "%a %s %n"|"%a %s %h %n" <path...>
// Each case runs through the real guard entry, and the lane predicate is asserted beside it: a refusal by an unrelated lane
// must not hide a lane that was widened, and an admission by an unrelated (pre-existing) lane must not hide one that was closed.
// ---------------------------------------------------------------------------------------------------------------------
const laneParse = (command, path) => parseGuardCommand(command, path, { platform: CLAUDE_BASH_SHELL_DIALECT_PLATFORM });
const gitShowLane = (command, path) => isBoundedReadOnlyPipeline(laneParse(command, path), path);
const quoteWord = (word) => (/[ %]/u.test(word) ? `"${word}"` : word);
const statCommand = (...words) => ["stat", ...words].map(quoteWord).join(" ");
const statLane = (path, ...words) => shellGrammar.isReadOnlySimpleWords(["stat", ...words], path);
const STAT_FORMAT = "%a %s %n";
const STAT_FORMAT_LINKS = "%a %s %h %n";

function withLaneFixture(fn) {
  return withFixture((path) => {
    writeFileSync(join(path, ".claude", "settings.json"), "{}\n");
    writeFileSync(join(path, "docs", ".hidden.md"), "hidden\n");
    const outside = fixture();
    let aliased = false;
    try {
      // Directory links: one aliases docs/ inside the root, one leaves the root. Without link privilege this is a typed
      // host limitation and the alias cases are not run.
      symlinkSync(join(path, "docs"), join(path, "scratch", "docs-alias"), "junction");
      symlinkSync(outside, join(path, "scratch", "out-alias"), "junction");
      aliased = true;
    } catch { aliased = false; }
    try { return fn(path, { aliased }); } finally {
      for (const name of ["docs-alias", "out-alias"]) {
        try { unlinkSync(join(path, "scratch", name)); } catch { /* absent */ }
      }
      rmSync(outside, { recursive: true, force: true });
    }
  });
}

test("AP10 git show <HEAD|hex>:<path> | head -N of a contained in-repo path is admitted (lane isContainedGitShowObject, K3)", () => withLaneFixture((path) => {
  for (const command of [
    "git show HEAD:docs/state.md | head -5",
    "git show abc1234:docs/state.md | head -n 20",
    "git --no-pager show HEAD:docs/state.md | head -5",
    "git show 0123456789abcdef0123456789abcdef01234567:docs/state.md | head -500",
    "git show HEAD:plugins/pipeline-core/lib/a.mjs | head -5",
  ]) {
    const r = verdict(bash(command), path);
    assert.equal(r.exitCode, 0, `${command}\n${r.text}`);
    assert.equal(gitShowLane(command, path), true, `lane: ${command}`);
  }
}));

test("AP11 the git-show lane fails closed: other sinks, no sink, hidden/dash/traversal/backslash/aliased/credential paths, extra operands, other revisions", () => withLaneFixture((path, { aliased }) => {
  // The sink and the line bound do not depend on how a host reads `<rev>:<path>`: refused at the guard entry on every host.
  // QG-04 (PO tile decision 2026-10-22, D114 as written: `tail` admitted in the bounded git read pipeline): the entry
  // "git show HEAD:docs/state.md | tail -5" is no longer refused at the guard entry; it moved to `tailAdmitted` below. The dedicated
  // git-show LANE stays head-only (its predicate assertion is kept: `tail` is not this lane), so the admission comes from the
  // generic git-pipeline lane. Every other sink and bound in this list is unchanged.
  const sinkOrBound = [
    "git show HEAD:docs/state.md | sort",
    "git show HEAD:docs/state.md | rg apply",
    "git show HEAD:docs/state.md | head -501",
    "git show HEAD:docs/state.md | head -0",
  ];
  // Path and operand shape: the lane predicate refuses all of them everywhere. The guard-entry refusal is asserted on win32,
  // where it was measured; how another host's pre-existing git-pipeline lane reads a `<rev>:<path>` operand is not asserted here.
  const pathOrOperand = [
    "git show HEAD:.claude/settings.json | head -5",
    "git show HEAD:docs/.hidden.md | head -5",
    "git show HEAD:-x/state.md | head -5",
    "git show HEAD:../state.md | head -5",
    "git show 'HEAD:docs\\state.md' | head -5",
    "git show HEAD:vault/id_rsa | head -5",
    "git show HEAD:docs/state.md extra | head -5",
    "git show --stat HEAD:docs/state.md | head -5",
    "git show HEAD~1:docs/state.md | head -5",
    "git show main:docs/state.md | head -5",
    "git show abc123:docs/state.md | head -5",
    "git log HEAD:docs/state.md | head -5",
    "git show HEAD: | head -5",
    "git show HEAD:docs/ | head -5",
    ...(aliased ? ["git show HEAD:scratch/out-alias/docs/state.md | head -5"] : []),
  ];
  // Lane-only: the pre-existing generic git-pipeline lane judges the `..` spelling itself, so only the lane predicate is pinned.
  const laneOnly = ["git show HEAD:docs/../docs/state.md | head -5", "git show HEAD:docs/state.md"];
  const tailAdmitted = ["git show HEAD:docs/state.md | tail -5"];
  for (const command of [...sinkOrBound, ...pathOrOperand, ...laneOnly, ...tailAdmitted]) {
    assert.equal(gitShowLane(command, path), false, `lane: ${command}`);
  }
  for (const command of tailAdmitted) {
    const r = verdict(bash(command), path);
    assert.equal(r.exitCode, 0, `${command}\n${r.text}`);
  }
  for (const command of sinkOrBound) {
    const r = verdict(bash(command), path);
    assert.equal(r.exitCode, 2, `${command}\n${r.text}`);
  }
  if (WIN) {
    for (const command of pathOrOperand) {
      const r = verdict(bash(command), path);
      assert.equal(r.exitCode, 2, `${command}\n${r.text}`);
    }
  }
  // Without a sink the lane does not apply; the bare form stays with the pre-existing read-only git rule, unchanged by this lane.
  assert.equal(verdict(bash("git show HEAD:docs/state.md"), path).exitCode, 0);
}));

test("AP12 stat -c|--format with one of the two fixed formats on contained, unaliased files and directories is admitted (lane isFormattedStatReadArgs, K3)", () => withLaneFixture((path) => {
  for (const words of [
    ["-c", STAT_FORMAT, "docs/state.md"],
    ["--format", STAT_FORMAT_LINKS, "docs/state.md", "docs"],
    ["-c", STAT_FORMAT_LINKS, "docs/state.md"],
    ["--format", STAT_FORMAT, "docs/state.md"],
    ["-c", STAT_FORMAT, "docs"],
  ]) {
    const command = statCommand(...words);
    const r = verdict(bash(command), path);
    assert.equal(r.exitCode, 0, `${command}\n${r.text}`);
    assert.equal(statLane(path, ...words), true, `routing: ${command}`);
    assert.equal(shellGrammar.isFormattedStatReadArgs(words, path), true, `lane: ${command}`);
  }
  // The lane defers to the passive-read policy for every operand: a dot-directory file that plain `stat` and `cat` already read
  // is judged identically, so the lane neither widens nor narrows which contained operands may be named (measured parity).
  for (const operand of [".claude/settings.json", "docs/.hidden.md"]) {
    const plain = verdict(bash(`stat ${operand}`), path).exitCode;
    const formatted = verdict(bash(statCommand("-c", STAT_FORMAT, operand)), path).exitCode;
    assert.equal(formatted, plain, `policy parity for ${operand}`);
  }
}));

test("AP13 the stat lane fails closed: other formats, -c/--format not first, missing/outside/aliased/credential operands, mixed operand lists", () => withLaneFixture((path, { aliased }) => {
  for (const words of [
    ["-c", "%U %n", "docs/state.md"],
    ["-c", `${STAT_FORMAT} %x`, "docs/state.md"],
    ["docs/state.md", "-c", STAT_FORMAT],
    ["-L", "-c", STAT_FORMAT, "docs/state.md"],
    ["-c", STAT_FORMAT],
    ["-c", STAT_FORMAT, "../x"],
    ["-c", STAT_FORMAT, "/etc/hostname"],
    ["-c", STAT_FORMAT, "docs/missing.md"],
    ["-c", STAT_FORMAT, "vault/id_rsa"],
    ["-c", STAT_FORMAT, "docs/state.md", "vault/id_rsa"],
    ["-c", STAT_FORMAT, "-"],
    // Other format options are not this lane; the routing sends them into the closed lane, which refuses them (AP15 pins the further spellings).
    ["-f", STAT_FORMAT, "docs/state.md"],
    ["--printf", STAT_FORMAT, "docs/state.md"],
    ...(aliased ? [
      ["-c", STAT_FORMAT, "scratch/docs-alias"],
      ["-c", STAT_FORMAT, "scratch/out-alias"],
      ["-c", STAT_FORMAT, "docs/state.md", "scratch/docs-alias"],
    ] : []),
  ]) {
    const command = statCommand(...words);
    assert.equal(statLane(path, ...words), false, `lane: ${command}`);
    const r = verdict(bash(command), path);
    assert.equal(r.exitCode, 2, `${command}\n${r.text}`);
  }
  // The predicate itself, called directly, never answers true for a mixed list (tolerant of a tree that does not export it yet).
  assert.notEqual(shellGrammar.isFormattedStatReadArgs?.(["-c", STAT_FORMAT, "docs/state.md", "vault/id_rsa"], path), true);
}));

test("AP14 attached-value stat format spellings, which the generic flag treatment used to admit, are routed into the closed lane and refused", () => withLaneFixture((path) => {
  for (const words of [
    [`--format=${STAT_FORMAT}`, "docs/state.md"],
    ["--format=%U %n", "docs/state.md"],
    ["-c%a", "docs/state.md"],
    ["-c%U", "docs/state.md"],
  ]) {
    const command = statCommand(...words);
    const r = verdict(bash(command), path);
    assert.equal(r.exitCode, 2, `${command}\n${r.text}`);
    assert.equal(statLane(path, ...words), false, `lane: ${command}`);
  }
}));

test("AP15 every other stat format-bearing spelling (--printf, -f, clustered short options, long-option abbreviations) is routed into the closed lane and refused (C5D-F1)", () => withLaneFixture((path) => {
  for (const words of [
    // The five spellings the correction round named: separate and attached --printf, clustered -Lc with an attached and a separate format, -f.
    ["--printf=%a", "docs/state.md"],
    ["--printf", "%a", "docs/state.md"],
    ["-Lc%a", "docs/state.md"],
    ["-Lc", STAT_FORMAT, "docs/state.md"],
    ["-f", "docs/state.md"],
    // The same family: --printf with a full format, clusters in either order and with -f, the long spelling of -f, getopt long-option
    // abbreviations of --format/--printf/--file-system, and a format-bearing argument that is not first or follows another option.
    ["--printf=%a %s %n", "docs/state.md"],
    ["-cL", STAT_FORMAT, "docs/state.md"],
    ["-Lf", "docs/state.md"],
    ["-fL", "docs/state.md"],
    ["-L", "-f", "docs/state.md"],
    ["--file-system", "docs/state.md"],
    ["--form=%a", "docs/state.md"],
    ["--print=%a", "docs/state.md"],
    ["--for", STAT_FORMAT, "docs/state.md"],
    ["--f", "docs/state.md"],
    ["docs/state.md", "--printf=%a"],
    ["docs/state.md", "-Lc%a"],
    // A fixed admitted format does not carry a cluster, or a further format option among the operands, into the lane.
    ["-Lc", STAT_FORMAT_LINKS, "docs/state.md"],
    ["-c", STAT_FORMAT, "--printf=%a", "docs/state.md"],
    ["--format", STAT_FORMAT, "-f", "docs/state.md"],
  ]) {
    const command = statCommand(...words);
    const r = verdict(bash(command), path);
    assert.equal(r.exitCode, 2, `${command}\n${r.text}`);
    assert.equal(statLane(path, ...words), false, `lane: ${command}`);
  }
  // Controls: the routing narrows format-bearing arguments only. A plain stat of a contained file and the two fixed shapes keep their verdict.
  for (const words of [["docs/state.md"], ["-c", STAT_FORMAT, "docs/state.md"], ["--format", STAT_FORMAT_LINKS, "docs/state.md"]]) {
    const command = statCommand(...words);
    const r = verdict(bash(command), path);
    assert.equal(r.exitCode, 0, `${command}\n${r.text}`);
    assert.equal(statLane(path, ...words), true, `routing: ${command}`);
  }
}));
