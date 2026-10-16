// SPDX-License-Identifier: SUL-1.0
// Pin for Alfred item pipeline.merge-commit-message-skips-conventional-type-check (AC-211).
// Original item body is legacy-origin only (not in this repository); acceptance is reconstructed
// from the item title and the retained "Merge20" policy-seam proof: an explicit `git merge`
// message must reach the same message inspection as `git commit`, so GIT-03 and the GIT-01
// Conventional Commit type check (guard-git composes commitTypeFindings over the first line of
// inspection.message) are not skipped for merges.
import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { commitMessageFindings, commitTypeFindings } from "../commit-message-policy.mjs";

const LIB = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const POLICY = join(LIB, "commit-message-policy.mjs");
const GUARD = join(LIB, "..", "hooks", "guard-git.mjs");
const noFile = () => { throw new Error("no file"); };
const GOOD_TRAILERS = "\n\nAI-Assisted: true\nDispatch: X-1 (goldfish)";

// Mirrors guard-git's GIT-01 wiring: subject = first line of the inspected message.
function gitOne(cmd, opts = {}) {
  const r = commitMessageFindings(cmd, { readFile: noFile, ...opts });
  const type = r.message === null ? null : commitTypeFindings(r.message.split("\n")[0]).findings.map((f) => f.code);
  return { r, type };
}

test("merge -m with an unadmitted type is inspected and GIT-01 flags it", () => {
  for (const cmd of [
    'git merge feature -m "wip: something"',
    'git merge feature --message "wip: something"',
    'git merge feature --message="wip: something"',
    'git merge feature -m"wip: something"',
    'git -C . merge feature -m "wip: something"',
  ]) {
    const { r, type } = gitOne(cmd);
    assert.equal(r.inspected, true, cmd);
    assert.deepEqual(type, ["GIT-01-UNKNOWN-TYPE"], cmd);
  }
});

test("merge -m with an admitted type is clean for GIT-01", () => {
  const { r, type } = gitOne('git merge feature -m "feat: integrate feature"');
  assert.equal(r.inspected, true);
  assert.deepEqual(type, []);
});

test("merge -F reads the message file and GIT-01 flags a bad subject", () => {
  const { r, type } = gitOne("git merge feature -F msg.txt", { readFile: () => "wip: bad\n\nbody" });
  assert.equal(r.inspected, true);
  assert.deepEqual(type, ["GIT-01-UNKNOWN-TYPE"]);
  const ok = gitOne("git merge feature --file=msg.txt", { readFile: () => "fix: good\n\nbody" });
  assert.deepEqual(ok.type, []);
});

test("merge message goes through GIT-03 inspection too (marker/dispatch/correlation)", () => {
  const missing = commitMessageFindings('git merge feature -m "feat: x"', { readFile: noFile, requireMarker: true, requireDispatch: true });
  assert.ok(missing.findings.some((f) => f.code === "GIT-03-MARKER-MISSING"));
  assert.ok(missing.findings.some((f) => f.code === "GIT-03-DISPATCH-MISSING"));
  const ok = commitMessageFindings('git merge feature -m "feat: x" -m "AI-Assisted: true\nDispatch: X-1 (goldfish)"', { readFile: noFile, requireMarker: true, requireDispatch: true });
  assert.deepEqual(ok.findings.map((f) => f.code), []);
  const leak = commitMessageFindings('git merge feature -m "feat: x" -m "Co-Authored-By: Claude <noreply@anthropic.com>"', { readFile: noFile });
  assert.ok(leak.findings.some((f) => f.code === "GIT-03-PROVIDER-COAUTHOR"));
});

test("merge without an explicit message, or in a non-committing mode, is not inspected (never a false block)", () => {
  for (const cmd of [
    "git merge feature",
    'git merge --squash feature -m "wip: x"',
    'git merge --no-commit feature -m "wip: x"',
    'git merge --ff-only feature -m "wip: x"',
    "git merge --abort",
    'git merge feature -s ours -m "wip: x" --no-commit',
  ]) {
    const { r } = gitOne(cmd);
    assert.equal(r.inspected, false, cmd);
    assert.equal(r.message, null, cmd);
  }
  // later --commit re-enables, value options do not swallow the message
  assert.equal(gitOne('git merge --no-commit --commit feature -m "wip: x"').r.inspected, true);
  assert.deepEqual(gitOne('git merge -s ours -X theirs feature -m "wip: x"').type, ["GIT-01-UNKNOWN-TYPE"]);
});

test("a merge heredoc is a message source only through -F -", () => {
  const plain = gitOne("git merge feature <<EOF\nwip: x\nEOF");
  assert.equal(plain.r.inspected, false);
  const viaStdin = gitOne("git merge feature -F - <<EOF\nwip: x\nEOF");
  assert.equal(viaStdin.r.inspected, true);
  assert.match(viaStdin.r.message, /wip: x/);
});

test("plain git commit behavior is unchanged by the merge branch", () => {
  assert.deepEqual(gitOne('git commit -m "wip: x"').type, ["GIT-01-UNKNOWN-TYPE"]);
  assert.equal(gitOne("git commit").r.inspected, false);
  assert.equal(gitOne("git status").r.inspected, false);
});

test("guard-git wires the GIT-01 check onto every inspected message (merge included)", () => {
  const src = readFileSync(GUARD, "utf8");
  assert.match(src, /commitMessageFindings\(cmd,/);
  assert.match(src, /if \(inspection\.message !== null\) \{\s*const subjectLine = inspection\.message\.split\("\\n"\)\[0\];\s*const typeCheck = commitTypeFindings\(subjectLine\);/);
  assert.doesNotMatch(src.split("GIT-01: the commit subject")[1]?.slice(0, 400) ?? "", /verb\s*===?\s*"commit"/);
});

test("RED proof: a commit-only mirror of the policy skips merge messages (the pin can fail)", async () => {
  const src = readFileSync(POLICY, "utf8");
  const needle = 'tokens[i] === "commit" || tokens[i] === "merge" ?';
  assert.ok(src.includes(needle), "mirror anchor present in production source");
  const mirrorSrc = src.replace(needle, 'tokens[i] === "commit" ?').replace(/from "\.\//g, `from "${pathToFileURL(LIB).href}/`);
  const dir = join(LIB, "..", "..", "..", "scratch", "alf-c-p7-07");
  mkdirSync(dir, { recursive: true });
  const file = join(dir, "commit-message-policy.mirror.mjs");
  writeFileSync(file, mirrorSrc);
  try {
    const mirror = await import(pathToFileURL(file).href);
    const red = mirror.commitMessageFindings('git merge feature -m "wip: something"', { readFile: noFile });
    assert.equal(red.inspected, false, "mirror skips the merge message (the original defect)");
    const real = commitMessageFindings('git merge feature -m "wip: something"', { readFile: noFile });
    assert.equal(real.inspected, true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("host limitation: directory-mode/symlink cases not applicable to this item", { skip: "typed host-limitation none-required; Linux/WSL run owner Coordinator due 2026-10-19 (PO decision K7) not needed: no mode/symlink fixture used" }, () => {});
