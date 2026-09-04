// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { existsSync } from "node:fs";
import { captureEvidence, findResidualHostPath, formatArtifact, HOME_PLACEHOLDER, redactText, REPO_ROOT_PLACEHOLDER } from "./capture-evidence.mjs";

// Synthetic, never-real absolute-looking paths, constructed at runtime -- never a hard-coded
// machine path (this is the easiest place in the repository to leak the exact string a redactor
// is meant to remove).
function syntheticRoot(name) {
  return `/synthetic-${name}-${process.pid}-${Date.now()}`;
}

// The `/home/`, `/Users/`, and `C:\`/`C:/` PREFIXES below are literal on purpose -- they are the
// exact shapes findResidualHostPath is contracted to catch, so the prefix itself cannot be
// synthesized away. Only the user-segment after the prefix is built at runtime, the same
// discipline syntheticRoot() applies to the repo-root/home-dir fixtures above.
function syntheticHostPath(prefix) {
  return `${prefix}synthetic-user-${process.pid}-${Date.now()}/project/file.mjs`;
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

// --- NVA-B-REDRESIDUAL-1: fail-closed residual-host-path refusal (AC-1 .. AC-4). ---

test("findResidualHostPath: returns null when no covered shape is present", () => {
  assert.equal(findResidualHostPath("clean text with only <repo-root>/lib/x.mjs and <home>/y"), null);
});

test("findResidualHostPath: catches a POSIX user-home path", () => {
  const path = syntheticHostPath("/home/");
  const hit = findResidualHostPath(`stack trace mentions ${path} here`);
  assert.ok(hit, "must detect a surviving /home/ path");
  assert.equal(hit.name, "posix-home");
});

test("findResidualHostPath: catches a macOS user-home path", () => {
  const path = syntheticHostPath("/Users/");
  const hit = findResidualHostPath(`stack trace mentions ${path} here`);
  assert.ok(hit, "must detect a surviving /Users/ path");
  assert.equal(hit.name, "macos-home");
});

test("findResidualHostPath: catches a Windows drive-letter path, backslash spelling", () => {
  const path = `C:\\Users\\synthetic-user-${process.pid}-${Date.now()}\\project\\file.mjs`;
  const hit = findResidualHostPath(`stack trace mentions ${path} here`);
  assert.ok(hit, "must detect a surviving C:\\ path");
  assert.equal(hit.name, "windows-drive-letter");
});

test("findResidualHostPath: catches a Windows drive-letter path, forward-slash spelling", () => {
  const path = `C:/Users/synthetic-user-${process.pid}-${Date.now()}/project/file.mjs`;
  const hit = findResidualHostPath(`stack trace mentions ${path} here`);
  assert.ok(hit, "must detect a surviving C:/ path");
  assert.equal(hit.name, "windows-drive-letter");
});

test("findResidualHostPath: does NOT false-positive on an ordinary URL scheme like file:// or https://", () => {
  const repoRoot = syntheticRoot("repo");
  const text = `at file://${repoRoot}/lib/x.mjs:12:3 (see https://example.invalid/docs)`;
  assert.equal(findResidualHostPath(text), null);
});

test("findResidualHostPath: catches a percent-encoded POSIX user-home path (AC-3, the mandatory half) when the literal /home/ separator never appears", () => {
  const user = `synthetic-user-${process.pid}-${Date.now()}`;
  // Built with encoded separators throughout -- no literal "/home/" substring anywhere in this
  // text, so only the percent-encoded pattern can fire, not the literal posix-home pattern.
  const encoded = `file://%2Fhome%2F${user}%2Fproject%2Ffile.mjs`;
  assert.ok(!encoded.includes("/home/"), "fixture must contain no literal /home/ substring");
  const hit = findResidualHostPath(`boom at ${encoded}`);
  assert.ok(hit, "must detect the percent-encoded /home/ path");
  assert.equal(hit.name, "posix-home-percent-encoded");
});

test("captureEvidence: refuses to write when a surviving /home/ path is present -- no partial file, no empty file, no directory created (AC-1)", () => {
  const workDir = mkdtempSync(join(tmpdir(), "capture-evidence-test-"));
  try {
    const nestedDir = join(workDir, "nested");
    const outPath = join(nestedDir, "evidence.txt");
    const stray = syntheticHostPath("/home/");
    const script = `console.log("leaked path: ${stray}");process.exit(0);`;
    assert.throws(
      () =>
        captureEvidence({
          command: ["node", "-e", script],
          label: "residual",
          out: outPath,
          repoRoot: syntheticRoot("repo"),
          homeDir: syntheticRoot("home"),
        }),
      /refused to write/,
    );
    assert.equal(existsSync(nestedDir), false, "no directory may be created for a refused write");
    assert.equal(existsSync(outPath), false, "no file, partial or empty, may be written for a refused write");
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
});

test("captureEvidence: refuses to write when a surviving Windows drive-letter path is present (AC-1, AC-2)", () => {
  const workDir = mkdtempSync(join(tmpdir(), "capture-evidence-test-"));
  try {
    const outPath = join(workDir, "evidence.txt");
    const stray = `C:\\Users\\synthetic-user-${process.pid}-${Date.now()}\\project\\file.mjs`;
    const script = `console.error("leaked path: ${stray}");process.exit(1);`;
    assert.throws(
      () =>
        captureEvidence({
          command: ["node", "-e", script],
          label: "residual-windows",
          out: outPath,
          repoRoot: syntheticRoot("repo"),
          homeDir: syntheticRoot("home"),
        }),
      /refused to write/,
    );
    assert.equal(existsSync(outPath), false);
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
});

test("captureEvidence: the refusal error names the pattern and offset but never the offending path itself (AC-4)", () => {
  const workDir = mkdtempSync(join(tmpdir(), "capture-evidence-test-"));
  try {
    const outPath = join(workDir, "evidence.txt");
    const stray = syntheticHostPath("/Users/");
    const script = `console.log("leaked path: ${stray}");process.exit(0);`;
    let caught;
    try {
      captureEvidence({
        command: ["node", "-e", script],
        label: "residual-message",
        out: outPath,
        repoRoot: syntheticRoot("repo"),
        homeDir: syntheticRoot("home"),
      });
    } catch (error) {
      caught = error;
    }
    assert.ok(caught, "captureEvidence must have thrown");
    assert.match(caught.message, /macos-home/, "message must name the matched pattern");
    assert.match(caught.message, /offset \d+/, "message must name the character offset");
    assert.ok(!caught.message.includes(stray), "message must never contain the offending path itself");
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
});
