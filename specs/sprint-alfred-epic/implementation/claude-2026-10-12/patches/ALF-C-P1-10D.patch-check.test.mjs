// SPDX-License-Identifier: SUL-1.0
// ALF-C-P1-10D patch check. ALF-C-P1-10D.patch supersedes ALF-C-P1-10B.patch for backlog item
// pipeline.claude-windows-guard-refuses-every-in-repo-read: it carries the same admission lanes (the rg flags --no-heading and -m N,
// the contained `git show <rev>:<path> | head -N` lane, the formatted `stat -c|--format` lane) but narrows two things the C5 Critic
// round found. (1) rg -g/--glob stays NON-repeatable: REPEATABLE_SEARCH_VALUE keeps only the type filters and the globProvided
// refusal line is untouched, so the SEC-11 examiner of hooks/guard-lifecycle-ready.test.mjs keeps its "second glob is refused" ground.
// (2) Every stat format-bearing spelling (--printf, -f, clustered short options, long-option abbreviations) is routed into the closed
// stat lane through isStatFormatBearingArg instead of the old `/^--format(?:=|$)|^-c/u` test, and the lane declaration says so. The
// change lives in guard paths that the installed guard refuses to edit in place, so it ships as a patch for the PO to apply from a
// terminal. This test proves that artifact is well-formed, touches exactly the three target paths, declares both lanes directly above
// their predicates, carries the two narrowings above, and applies to the working tree (`git apply --check`: no side effects). Once the
// PO has applied the patch, the reverse check holds instead.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repository = fileURLToPath(new URL("../../../../../", import.meta.url));
const patchPath = fileURLToPath(new URL("./ALF-C-P1-10D.patch", import.meta.url));

const ITEM = "pipeline.claude-windows-guard-refuses-every-in-repo-read";
const GRAMMAR = "plugins/pipeline-core/hooks/guard-command-grammar.mjs";
const SHELL_GRAMMAR = "plugins/pipeline-core/lib/guard/shell-grammar.mjs";
const PIN = "plugins/pipeline-core/lib/pins/claude-windows-guard-refuses-every-in-repo-read.test.mjs";
const EXPECTED = [GRAMMAR, SHELL_GRAMMAR, PIN];
// The routing test ALF-C-P1-10B used for the stat lane; it missed --printf, -f and clustered short options (C5D-F1).
const OLD_STAT_ROUTING = "^--format(?:=|$)|^-c";

function parsePatch(text) {
  const lines = text.split("\n");
  if (lines.at(-1) === "") lines.pop();
  const files = [];
  let current = null;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const header = /^diff --git a\/(\S+) b\/(\S+)$/u.exec(line);
    if (header) {
      current = { a: header[1], b: header[2], isNew: false, minus: null, plus: null, hunks: [] };
      files.push(current);
      continue;
    }
    if (current === null) throw new Error(`content before the first file header at line ${index + 1}`);
    if (/^(?:index |old mode |new mode )/u.test(line)) continue;
    if (line.startsWith("new file mode ")) { current.isNew = true; continue; }
    if (current.hunks.length === 0 && line.startsWith("--- ")) { current.minus = line.slice(4); continue; }
    if (current.hunks.length === 0 && line.startsWith("+++ ")) { current.plus = line.slice(4); continue; }
    const hunk = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/u.exec(line);
    if (!hunk) throw new Error(`unexpected line ${index + 1} outside a hunk: ${line.slice(0, 60)}`);
    let oldLeft = hunk[2] === undefined ? 1 : Number(hunk[2]);
    let newLeft = hunk[4] === undefined ? 1 : Number(hunk[4]);
    // newSide is the post-patch text of the hunk's region (context plus added lines, in order).
    const body = { oldStart: Number(hunk[1]), oldCount: oldLeft, newStart: Number(hunk[3]), newCount: newLeft, added: [], removed: [], newSide: [] };
    index += 1;
    while (oldLeft > 0 || newLeft > 0) {
      const text = lines[index];
      if (text === undefined) throw new Error(`hunk at line ${index} ends before its declared counts`);
      const tag = text[0];
      if (tag === " ") { oldLeft -= 1; newLeft -= 1; body.newSide.push(text.slice(1)); }
      else if (tag === "-") { oldLeft -= 1; body.removed.push(text.slice(1)); }
      else if (tag === "+") { newLeft -= 1; body.added.push(text.slice(1)); body.newSide.push(text.slice(1)); }
      else throw new Error(`malformed hunk body at line ${index + 1}: ${text.slice(0, 60)}`);
      index += 1;
    }
    if (oldLeft !== 0 || newLeft !== 0) throw new Error(`hunk counts are inconsistent near line ${index}`);
    while (lines[index]?.startsWith("\\")) index += 1;
    index -= 1;
    current.hunks.push(body);
  }
  return files;
}

const patchText = readFileSync(patchPath, "utf8");
const parsed = parsePatch(patchText);
const targetHashes = () => EXPECTED.map((path) => {
  const full = join(repository, path);
  return existsSync(full) ? createHash("sha256").update(readFileSync(full)).digest("hex") : "absent";
});
const applyCheck = (extra = []) => spawnSync("git", ["apply", "--check", ...extra, patchPath], { cwd: repository, encoding: "utf8" });

// The contiguous `//` lines directly above lines[index] (nothing between them and the line, so no blank line and no code).
function commentBlockAbove(lines, index) {
  const block = [];
  for (let cursor = index - 1; cursor >= 0 && /^\/\//u.test(lines[cursor]); cursor -= 1) block.unshift(lines[cursor]);
  return block;
}

// Locate the single post-patch line matching `signature` in the file's hunks; returns that hunk's region and the line's index.
function locate(path, signature) {
  const hits = [];
  for (const hunk of parsed.find((file) => file.b === path).hunks) {
    hunk.newSide.forEach((line, index) => { if (line.startsWith(signature)) hits.push({ lines: hunk.newSide, index }); });
  }
  assert.equal(hits.length, 1, `${path}: expected exactly one post-patch line starting with "${signature}", found ${hits.length}`);
  return hits[0];
}

test("the patch is a well-formed LF-only unified diff of modifications", () => {
  assert.ok(patchText.length > 0, "the patch must not be empty");
  assert.ok(patchText.endsWith("\n"), "the patch must end with a newline");
  assert.equal(patchText.includes("\r"), false, "the patch must carry LF endings only");
  assert.ok(parsed.length > 0, "the patch must contain at least one file diff");
  for (const file of parsed) {
    assert.ok(file.hunks.length > 0, `${file.b} has no hunk`);
    assert.equal(file.a, file.b, "a rename/copy is not a permitted shape");
    assert.equal(file.isNew, false, `${file.b} must be modified, not created`);
    assert.equal(file.plus, `b/${file.b}`);
    assert.equal(file.minus, `a/${file.a}`);
    assert.equal(/^(?:\/|[A-Za-z]:|.*\.\.)/u.test(file.b) || file.b.includes("\\"), false, "repository-relative POSIX path required");
  }
});

test("the patch touches exactly the three target paths", () => {
  const touched = parsed.map((file) => file.b);
  assert.equal(new Set(touched).size, touched.length, "no path may appear twice");
  assert.deepEqual([...touched].sort(), [...EXPECTED].sort());
});

test("both non-rg lanes are declared directly above their predicates, naming the backlog item", () => {
  const gitShow = locate(GRAMMAR, "function isContainedGitShowObject(");
  const gitShowBlock = commentBlockAbove(gitShow.lines, gitShow.index);
  assert.ok(gitShowBlock.length >= 2, "isContainedGitShowObject needs a // comment block directly above it");
  assert.ok(gitShowBlock.some((line) => line.includes(ITEM)), "the git-show lane declaration must name the backlog item");
  assert.ok(gitShowBlock[0].startsWith(`// LANE (declared under backlog item ${ITEM}`), "the declaration block opens with the LANE line");

  const stat = locate(SHELL_GRAMMAR, "export function isFormattedStatReadArgs(");
  const statBlock = commentBlockAbove(stat.lines, stat.index);
  assert.ok(statBlock.length >= 1, "isFormattedStatReadArgs needs a // comment line directly above it");
  assert.ok(statBlock.some((line) => line.includes(ITEM)), "the stat lane predicate comment must name the backlog item");
  // The stat lane's full bounds declaration sits above its format table, earlier in the same region.
  const declaration = stat.lines.findIndex((line) => line.startsWith(`// LANE (declared under backlog item ${ITEM}`));
  assert.ok(declaration >= 0 && declaration < stat.index, "the stat lane declaration must precede isFormattedStatReadArgs");
  assert.ok(stat.lines.slice(declaration, stat.index).some((line) => line.startsWith("const STAT_METADATA_FORMATS")), "the declaration covers the fixed format table");
});

test("the git-show lane sits above, not between, the JSDoc and its function; every stat format-bearing spelling is routed through isStatFormatBearingArg, not the old regex", () => {
  const gitShow = locate(GRAMMAR, "function isContainedGitShowObject(");
  const doc = gitShow.lines.findIndex((line) => line.includes("Validate the small, bounded search-pipeline family."));
  assert.ok(doc > gitShow.index, "the JSDoc of the search-pipeline function must stay below the new lane function (not detached from its function)");
  assert.equal(gitShow.lines[doc - 1].trim(), "/**", "the JSDoc must open directly above its text");

  const shell = parsed.find((file) => file.b === SHELL_GRAMMAR);
  const shellAdded = shell.hunks.flatMap((hunk) => hunk.added);
  const routing = shellAdded.findIndex((line) => /^\s*if \(executable === "stat" && args\.some\(\(arg\) => isStatFormatBearingArg\(arg\)\)\) \{$/u.test(line));
  assert.ok(routing >= 0, "the post-patch stat routing line must call isStatFormatBearingArg for every argument");
  assert.match(shellAdded[routing + 1] ?? "", /^\s*return isFormattedStatReadArgs\(args, root, extraRoots\);$/u, "the routing hands the whole call to the closed lane");
  // The predicate is defined exactly once in the post-image (locate throws otherwise).
  locate(SHELL_GRAMMAR, "function isStatFormatBearingArg(");
  // The old regex routing is gone from the post-image of every hunk, as added lines and as retained context alike.
  for (const file of parsed) {
    for (const hunk of file.hunks) {
      assert.equal(hunk.newSide.some((line) => line.includes(OLD_STAT_ROUTING)), false, `${file.b}: the old /${OLD_STAT_ROUTING}/ stat routing must not survive in the post-image`);
    }
  }
});

test("the patch carries no secret or machine-specific absolute path", () => {
  const addedLines = parsed.flatMap((file) => file.hunks.flatMap((hunk) => hunk.added));
  for (const line of addedLines) {
    assert.equal(/[A-Za-z]:[\\/]{1,2}(?:Users|Dev|Windows)\b|\/(?:home|Users)\/[^\s/]+/u.test(line), false, `machine-specific path in: ${line.slice(0, 80)}`);
    assert.equal(/(?:BEGIN [A-Z ]*PRIVATE KEY|ghp_[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16})/u.test(line), false, "secret-shaped content");
  }
});

test("git apply --check accepts the patch against the working tree, with no side effect", () => {
  const before = targetHashes();
  const forward = applyCheck();
  let applied = false;
  if (forward.status !== 0) {
    // Not applicable forward: acceptable only when the PO already applied it,
    // i.e. the reverse application checks out exactly.
    const reverse = applyCheck(["--reverse"]);
    applied = reverse.status === 0;
    assert.ok(applied, `git apply --check failed (exit ${forward.status}): ${String(forward.stderr).slice(0, 400)}`);
  }
  assert.deepEqual(targetHashes(), before, "git apply --check must not modify any target path");
  assert.ok(forward.status === 0 || applied);
});

test("rg -g/--glob stays non-repeatable: the REPEATABLE_SEARCH_VALUE post-image names neither -g nor --glob", () => {
  const repeatable = locate(GRAMMAR, "const REPEATABLE_SEARCH_VALUE");
  const line = repeatable.lines[repeatable.index];
  const members = [...line.matchAll(/"([^"]*)"/gu)].map((match) => match[1]);
  assert.equal(members.includes("-g"), false, `REPEATABLE_SEARCH_VALUE must not contain -g: ${line}`);
  assert.equal(members.includes("--glob"), false, `REPEATABLE_SEARCH_VALUE must not contain --glob: ${line}`);
  assert.equal(/(?:^|[^\w-])-g\b|--glob\b/u.test(line), false, "neither glob spelling may appear anywhere on the REPEATABLE_SEARCH_VALUE line");
  // Positive anchor so an emptied or rewritten set cannot pass vacuously: the type filters stay the only repeatable values.
  assert.deepEqual(members, ["-t", "--type", "-T", "--type-not"]);
});

test("no hunk removes the globProvided refusal line (a second rg glob stays refused)", () => {
  // The refusal is `if (globProvided || !isBoundedFilenameFilter(value)) return false;` in validateRg. ALF-C-P1-10B removed it; this patch must
  // leave it alone, so no hunk of any file may carry a removed line that mentions globProvided (a rewritten line shows up as a removal too).
  const removed = parsed.flatMap((file) => file.hunks.flatMap((hunk) => hunk.removed));
  assert.deepEqual(removed.filter((line) => line.includes("globProvided")), [], "no removed line may mention globProvided");
  assert.ok(removed.length > 0, "the patch removes other lines, so the scan above is not vacuous");
});

test("the stat lane declaration comment names --printf and clustered options", () => {
  const table = locate(SHELL_GRAMMAR, "const STAT_METADATA_FORMATS");
  const block = commentBlockAbove(table.lines, table.index);
  assert.ok(block.length >= 1 && block[0].startsWith(`// LANE (declared under backlog item ${ITEM}`), "the comment block directly above the format table is the lane declaration");
  const text = block.join("\n");
  assert.ok(text.includes("--printf"), "the lane declaration must name --printf");
  assert.match(text, /clustered/u, "the lane declaration must name clustered short options");
});
