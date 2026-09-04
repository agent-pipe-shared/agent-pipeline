// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { captureEvidence, formatArtifact, HOME_PLACEHOLDER, redactText, REPO_ROOT_PLACEHOLDER } from "./capture-evidence.mjs";

// Synthetic, never-real absolute-looking paths, constructed at runtime -- never a hard-coded
// machine path (this is the easiest place in the repository to leak the exact string a redactor
// is meant to remove).
function syntheticRoot(name) {
  return `/synthetic-${name}-${process.pid}-${Date.now()}`;
}

test("redactText strips a plain-path occurrence and a file:// occurrence of the repo root, and a separate home-dir occurrence", () => {
  const repoRoot = syntheticRoot("repo");
  const homeDir = syntheticRoot("home");
  const text = `at file://${repoRoot}/lib/x.mjs:12:3\nplain path ${repoRoot}/lib/x.mjs also appears\nunder home ${homeDir}/tmp/probe.mjs\n`;
  const redacted = redactText(text, repoRoot, homeDir);
  assert.ok(!redacted.includes(repoRoot), "repo root must not survive redaction");
  assert.ok(!redacted.includes(homeDir), "home dir must not survive redaction");
  assert.ok(redacted.includes(`file://${REPO_ROOT_PLACEHOLDER}/lib/x.mjs:12:3`));
  assert.ok(redacted.includes(`${REPO_ROOT_PLACEHOLDER}/lib/x.mjs`));
  assert.ok(redacted.includes(`${HOME_PLACEHOLDER}/tmp/probe.mjs`));
});

test("formatArtifact matches the de facto backlog/evidence/ shape", () => {
  const text = formatArtifact({ command: "node x.mjs", label: "before", exitCode: 1, stdout: "out\n", stderr: "err\n" });
  assert.match(text, /^command: node x\.mjs\nlabel: before\nexitCode: 1\n--- stdout ---\nout\n\n--- stderr ---\nerr\n$/);
});

test("captureEvidence: a failing command with the repo root in both plain and file:// form is fully redacted, and the exit code is recorded and preserved", () => {
  const workDir = mkdtempSync(join(tmpdir(), "capture-evidence-test-"));
  try {
    const repoRoot = syntheticRoot("repo");
    const homeDir = syntheticRoot("home");
    const outPath = join(workDir, "evidence.txt");
    const script =
      `console.error("boom at file://${repoRoot}/lib/x.mjs:12:3");` +
      `console.log("plain ${repoRoot}/lib/x.mjs also appears");` +
      `process.exit(3);`;
    const { exitCode, out } = captureEvidence({
      command: ["node", "-e", script],
      label: "red",
      out: outPath,
      repoRoot,
      homeDir,
    });
    assert.equal(exitCode, 3, "wrapped command's exit code must be recorded and preserved, never masked");
    assert.equal(out, outPath);
    const written = readFileSync(outPath, "utf8");
    assert.ok(!written.includes(repoRoot), "no absolute repo-root path may survive in the artifact");
    assert.ok(written.includes(`file://${REPO_ROOT_PLACEHOLDER}`), "file:// form must be redacted");
    assert.ok(written.includes(`plain ${REPO_ROOT_PLACEHOLDER}/lib/x.mjs`), "plain-path form must be redacted");
    assert.match(written, /^command: node -e/m);
    assert.match(written, /^label: red$/m);
    assert.match(written, /^exitCode: 3$/m);
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
});

test("captureEvidence: a passing command is captured with exit code 0", () => {
  const workDir = mkdtempSync(join(tmpdir(), "capture-evidence-test-"));
  try {
    const repoRoot = syntheticRoot("repo");
    const outPath = join(workDir, "evidence.txt");
    const { exitCode } = captureEvidence({
      command: ["node", "-e", "console.log('all good'); process.exit(0);"],
      label: "green",
      out: outPath,
      repoRoot,
      homeDir: syntheticRoot("home"),
    });
    assert.equal(exitCode, 0);
    const written = readFileSync(outPath, "utf8");
    assert.match(written, /^exitCode: 0$/m);
    assert.ok(written.includes("all good"));
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
});

test("captureEvidence: a command that writes nothing still produces a well-formed artifact with the recorded exit code", () => {
  const workDir = mkdtempSync(join(tmpdir(), "capture-evidence-test-"));
  try {
    const repoRoot = syntheticRoot("repo");
    const outPath = join(workDir, "evidence.txt");
    const { exitCode } = captureEvidence({
      command: ["node", "-e", "process.exit(0);"],
      label: "silent",
      out: outPath,
      repoRoot,
      homeDir: syntheticRoot("home"),
    });
    assert.equal(exitCode, 0);
    const written = readFileSync(outPath, "utf8");
    assert.equal(written, "command: node -e process.exit(0);\nlabel: silent\nexitCode: 0\n--- stdout ---\n\n--- stderr ---\n");
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
});

test("captureEvidence: a spawn failure (command not found) throws and writes no artifact -- never collapsed into a fabricated exit code", () => {
  const workDir = mkdtempSync(join(tmpdir(), "capture-evidence-test-"));
  try {
    const outPath = join(workDir, "evidence.txt");
    const nonExistentCommand = `capture-evidence-test-nonexistent-command-${process.pid}-${Date.now()}`;
    assert.throws(
      () =>
        captureEvidence({
          command: [nonExistentCommand],
          label: "spawn-failure",
          out: outPath,
          repoRoot: syntheticRoot("repo"),
          homeDir: syntheticRoot("home"),
        }),
      /did not run to completion/,
    );
    assert.throws(() => readFileSync(outPath, "utf8"), "a spawn failure must not write any artifact");
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
});

test("captureEvidence: a maxBuffer overflow throws (fails loudly) instead of writing a silently truncated artifact", () => {
  const workDir = mkdtempSync(join(tmpdir(), "capture-evidence-test-"));
  try {
    const outPath = join(workDir, "evidence.txt");
    // Print far more than a deliberately tiny maxBuffer can hold.
    const script = "process.stdout.write('x'.repeat(4096));";
    assert.throws(
      () =>
        captureEvidence({
          command: ["node", "-e", script],
          label: "overflow",
          out: outPath,
          repoRoot: syntheticRoot("repo"),
          homeDir: syntheticRoot("home"),
          maxBuffer: 16,
        }),
      /did not run to completion/,
    );
    assert.throws(() => readFileSync(outPath, "utf8"), "a maxBuffer overflow must not write a silently truncated artifact");
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
});
