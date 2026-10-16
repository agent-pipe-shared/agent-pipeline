// SPDX-License-Identifier: SUL-1.0
/**
 * Pin for pipeline.commit-grammar-hint-still-requires-scratch-message-file (AC-136).
 * Acceptance: (A1) a normal subject/body/trailers commit is expressible without a user-made message
 * file; (A2) a literal newline inside one argument stays refused with a file-free remediation;
 * (A3) the guidance never changes the allow/deny decision. Exercises the real modules.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { parseGuardCommand } from "../../hooks/guard-command-grammar.mjs";
import { commitMessageFindings } from "../commit-message-policy.mjs";
import { grammarRemediation } from "../guard/shell-grammar.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const pluginRoot = resolve(here, "..", "..");
const root = process.cwd();
const FILE_FREE = "git commit -m 'docs: update guidance' -m 'Explain the change' --trailer 'AI-Assisted: true' --trailer 'Dispatch: T-1 (goldfish)' -- a/b.md";
const WIN = 'git.exe commit -m "docs: update guidance" -m "Explain" --trailer "AI-Assisted: true" --trailer "Dispatch: T-1 (goldfish)" -- a/b.md';
const NEWLINE = "git commit -m 'docs: x\n\nbody\n\nAI-Assisted: true' -- a/b.md";
const FILE_F = "git commit -F scratch/commit-msg/T.txt -- a/b.md";
const noFile = () => { throw new Error("ENOENT: no message file may be needed"); };
const status = (command, platform) => parseGuardCommand(command, root, { platform }).parseStatus;

test("A1 file-free commit is accepted by the grammar and provenance check on POSIX and Windows", () => {
  for (const platform of ["linux", "win32"]) {
    assert.equal(status(FILE_FREE, platform), "accepted");
    assert.equal(status(WIN, platform), "accepted");
  }
  for (const command of [FILE_FREE, WIN]) {
    const result = commitMessageFindings(command, { readFile: noFile, requireMarker: true, requireDispatch: true });
    assert.equal(result.inspected, true);
    assert.deepEqual(result.findings, []);
  }
});

test("A1 no remediation is printed for an accepted file-free commit", () => {
  assert.equal(grammarRemediation(FILE_FREE) ?? null, null);
});

test("A2 a literal newline in one argument stays refused on both platforms", () => {
  for (const platform of ["linux", "win32"]) assert.equal(status(NEWLINE, platform), "denied");
});

test("A2 the denial remediation leads with the file-free command and keeps -F as the exception", () => {
  const text = grammarRemediation(NEWLINE);
  assert.equal(typeof text, "string");
  const free = text.indexOf("git commit -m 'docs: update guidance' -m 'Explain the change' --trailer 'AI-Assisted: true' -- <paths>");
  const file = text.indexOf("git commit -F <msgfile> -- <paths>");
  assert.ok(free >= 0, "file-free example with exact pathspec present");
  assert.ok(file > free, "-F only after the file-free form");
  assert.match(text, /git add -- <paths>/u);
  assert.match(text, /one line/u);
});

test("A3 guidance does not change decisions: -F stays accepted, newline stays denied, prefixed git is not newly hinted", () => {
  assert.equal(status(FILE_F, "linux"), "accepted");
  assert.equal(status(NEWLINE, "linux"), "denied");
  const before = status(NEWLINE, "win32");
  grammarRemediation(NEWLINE);
  assert.equal(status(NEWLINE, "win32"), before);
  assert.equal(grammarRemediation("git -C . commit -m 'x\ny'") ?? null, null);
});

test("A1 the conventional-commit skill proposes the file-free form and keeps -F for unsuitable content", () => {
  const skill = readFileSync(resolve(pluginRoot, "skills", "conventional-commit", "SKILL.md"), "utf8");
  assert.match(skill, /scratch-free form `git commit -m '<subject>' -m '<body paragraph>'\s+--trailer 'AI-Assisted: true' -- <paths>`/u);
  assert.match(skill, /Use `-F` only when the content cannot safely be represented as\s+single-line arguments/u);
});

test("RED mirror: a remediation that leads with -F would fail the A2 ordering assertion", () => {
  const mirror = "Run git commit -F <msgfile> -- <paths>; or git commit -m 'docs: update guidance' -m 'Explain the change' --trailer 'AI-Assisted: true' -- <paths>";
  const free = mirror.indexOf("git commit -m 'docs: update guidance'");
  const file = mirror.indexOf("git commit -F <msgfile> -- <paths>");
  assert.ok(!(file > free), "mirror violates the ordering, proving the assertion can fail");
});

test("Linux/WSL-only directory-mode and symlink variants are not applicable to this pin", { skip: "host-limitation: not needed here; owner Coordinator, due 2026-10-19" }, () => {});
