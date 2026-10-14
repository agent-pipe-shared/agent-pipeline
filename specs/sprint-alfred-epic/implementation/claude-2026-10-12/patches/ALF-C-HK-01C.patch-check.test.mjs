// SPDX-License-Identifier: SUL-1.0
// ALF-C-HK-01C patch check. The change itself (a cheap precondition ahead of the
// onboarding inspection in observedOnboardingCommandMatch, plus its regression
// test) lives in guard paths that the installed guard refuses to edit in place,
// so it ships as ALF-C-HK-01C.patch for the PO to apply from a terminal. This
// test proves that artifact is well-formed, touches only the paths the dispatch
// may touch, and applies to the working tree (`git apply --check`: no side
// effects). Once the PO has applied the patch, the reverse check holds instead.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repository = fileURLToPath(new URL("../../../../../", import.meta.url));
const patchPath = fileURLToPath(new URL("./ALF-C-HK-01C.patch", import.meta.url));

// The paths the briefing allows a patch to touch, and the two this slice touches.
const ALLOWED = [
  "plugins/pipeline-core/lib/guard/command-catalogue.mjs",
  "plugins/pipeline-core/lib/guard/devplan-shell-lane.mjs",
  "plugins/pipeline-core/lib/guard/denial-telemetry.mjs",
  "plugins/pipeline-core/lib/claude-intake-prompt-capture.mjs",
  "plugins/pipeline-core/lib/guard/onboarding-inspect-prefilter.test.mjs",
];
const EXPECTED = [
  "plugins/pipeline-core/lib/guard/command-catalogue.mjs",
  "plugins/pipeline-core/lib/guard/onboarding-inspect-prefilter.test.mjs",
];
const NEW_FILE = "plugins/pipeline-core/lib/guard/onboarding-inspect-prefilter.test.mjs";

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
    const body = { oldStart: Number(hunk[1]), oldCount: oldLeft, newStart: Number(hunk[3]), newCount: newLeft, added: [], removed: [] };
    index += 1;
    while (oldLeft > 0 || newLeft > 0) {
      const text = lines[index];
      if (text === undefined) throw new Error(`hunk at line ${index} ends before its declared counts`);
      const tag = text[0];
      if (tag === " ") { oldLeft -= 1; newLeft -= 1; }
      else if (tag === "-") { oldLeft -= 1; body.removed.push(text.slice(1)); }
      else if (tag === "+") { newLeft -= 1; body.added.push(text.slice(1)); }
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

test("the patch is a well-formed LF-only unified diff", () => {
  assert.ok(patchText.length > 0, "the patch must not be empty");
  assert.ok(patchText.endsWith("\n"), "the patch must end with a newline");
  assert.equal(patchText.includes("\r"), false, "the patch must carry LF endings only");
  assert.ok(parsed.length > 0, "the patch must contain at least one file diff");
  for (const file of parsed) {
    assert.ok(file.hunks.length > 0, `${file.b} has no hunk`);
    assert.equal(file.a, file.b, "a rename/copy is not a permitted shape");
    assert.equal(file.plus, `b/${file.b}`);
    assert.equal(file.minus, file.isNew ? "/dev/null" : `a/${file.a}`);
    assert.equal(/^(?:\/|[A-Za-z]:|.*\.\.)/u.test(file.b) || file.b.includes("\\"), false, "repository-relative POSIX path required");
  }
});

test("the patch touches only the allowed target paths, and exactly the two of this slice", () => {
  const touched = parsed.map((file) => file.b);
  assert.equal(new Set(touched).size, touched.length, "no path may appear twice");
  for (const path of touched) assert.ok(ALLOWED.includes(path), `${path} is outside the allowed target paths`);
  assert.deepEqual([...touched].sort(), [...EXPECTED].sort());
});

test("the regression test is a new file and the source change only adds the precondition", () => {
  const created = parsed.find((file) => file.b === NEW_FILE);
  assert.ok(created?.isNew, "the prefilter test must be created, not modified");
  assert.equal(created.hunks.length, 1);
  assert.equal(created.hunks[0].oldCount, 0);
  assert.equal(created.hunks[0].removed.length, 0);
  const source = parsed.find((file) => file.b === EXPECTED[0]);
  assert.equal(source.isNew, false);
  const added = source.hunks.flatMap((hunk) => hunk.added).join("\n");
  assert.match(added, /words\.length < 2/u, "the precondition must be added");
  assert.match(added, /words\[0\] === "node"/u);
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
