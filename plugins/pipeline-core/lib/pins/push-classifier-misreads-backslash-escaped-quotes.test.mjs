// SPDX-License-Identifier: SUL-1.0
// Pin: pipeline.push-classifier-misreads-backslash-escaped-quotes (AC-237, ALF-C-P4-03).
// Acceptance points (backlog item Proposal): fail closed on a backslash-escaped quote beside a git word, with
// GL-B13, the plain echo-wrapped shape and the quoted-executable shape pinned as classified pushes; harmless
// echo / quoted-executable controls stay plain. Exercises the real commandIsGitPush; no mocks.
// The "naive mirror" below is a scratch copy of the ORIGINAL defect (an escaped quote read as a delimiter); it
// proves the push shapes are meaningful, i.e. that a misreading classifier would let them through (RED mirror).
import test from "node:test";
import assert from "node:assert/strict";
import { commandIsGitPush, stripQuotedSegments } from "../git-cmd.mjs";

// Mirror of the defect: treat \' as a quote delimiter and drop the span between two of them.
function naiveClassifier(cmd) {
  const stripped = cmd.replace(/\\?'[^']*\\?'/g, "''").replace(/\\?"[^"]*\\?"/g, '""');
  return /\bgit\s+push\b/.test(stripped);
}

const SQ = "\\'";
const DQ = '\\"';
const PUSH_SHAPES = {
  "GL-B13 (gitleaks --no-git, escaped single quotes)": `gitleaks detect --no-git --x ${SQ}; git push origin HEAD:refs/heads/feat/x; echo ${SQ}`,
  "echo-wrapped, escaped single quotes": `echo ${SQ}; git push origin main; echo ${SQ}`,
  "echo-wrapped, escaped double quotes": `echo ${DQ}; git push origin main; echo ${DQ}`,
  "escaped quote then bare push": `echo ${SQ} && git push origin main`,
};
const QUOTED_EXEC_SHAPES = {
  "double-quoted executable, unknown option": '"git" --totally-unknown-flag push origin main',
  "single-quoted executable, unknown option": "'git' --totally-unknown-flag push origin main",
  "quoted executable, plain push": '"git" push origin main',
  "quoted git.exe path, push later": '"C:/Program Files/Git/bin/git.exe" push origin main',
};
const CONTROLS = {
  "plain echo": "echo hello",
  "echo with escaped quotes and no git word": `echo ${SQ}hello${SQ}`,
  "harmless quoted echo mentioning nothing": 'echo "hello world"',
  "plain git status": "git status",
  "quoted git executable, no push word": '"git" status',
};

test("naive mirror misses the escaped-quote push shapes (RED mirror proves the cases can fail)", () => {
  for (const [name, cmd] of Object.entries(PUSH_SHAPES)) {
    if (name.startsWith("escaped quote then bare push")) continue; // bare push is visible even to the mirror
    assert.equal(naiveClassifier(cmd), false, `mirror should misread: ${name}`);
  }
});

test("real classifier: GL-B13 and echo-wrapped escaped-quote shapes are classified as pushes", () => {
  for (const [name, cmd] of Object.entries(PUSH_SHAPES)) {
    assert.equal(commandIsGitPush(cmd), true, name);
  }
});

test("real classifier: quoted-executable shapes before push are classified as pushes", () => {
  for (const [name, cmd] of Object.entries(QUOTED_EXEC_SHAPES)) {
    assert.equal(commandIsGitPush(cmd), true, name);
  }
});

test("real classifier: harmless echo / quoted-executable controls stay plain", () => {
  for (const [name, cmd] of Object.entries(CONTROLS)) {
    assert.equal(commandIsGitPush(cmd), false, name);
  }
});

test("stripQuotedSegments does not treat an escaped quote outside quotes as a delimiter", () => {
  const out = stripQuotedSegments(`echo ${SQ}; git push origin main; echo ${SQ}`);
  assert.match(out, /git push origin main/, "the executed text between escaped quotes must survive stripping");
});
