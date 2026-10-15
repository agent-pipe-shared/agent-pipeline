#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
//
// Regression pin for backlog item pipeline.shell-classifier-faults-on-heredoc-body-text (AC-254).
//
// Original defect: `cat >> scratch/... <<'EOF'` whose body only mentions "git apply --check"
// raised GUARD-TESTPATH-SHELL-FAULT ("mutating git apply has unbound patch targets").
// Heredoc body text is data, not argv. Acceptance:
//   A1 (Description) a quoted-delimiter cat heredoc whose body names `git apply` is not classified
//      as a command: no fault, no write target taken from the body.
//   A2 (Proposal)   a regression test exists for exactly that shape (this file), through the real
//      module, in every admitted delimiter spelling.
//   Guard-rails retained: the exclusion stays narrow. A genuinely executed `git apply`
//   (plain, after the terminator, unquoted/unsupported receivers, unterminated) still faults.
//
// Cases are exercised through the real `extractShellWriteTargets` / `protectedTestPathShellHit`.
// The RED case builds a scratch mirror of the production module with the body exclusion removed;
// production is never edited. No host-limited (mode-bit / directory-symlink) case is needed.

import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  extractShellWriteTargets,
  loadProtectedTestPathRules,
  protectedTestPathShellHit,
} from "../protected-test-paths.mjs";

const LIB = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ROOT = resolve(LIB, "..", "..", "..");
const FAULT = /mutating git apply has unbound patch targets/u;
const PROTECTED = "plugins/pipeline-core/hooks/guard-git.test.mjs";

const { rules } = loadProtectedTestPathRules({ rootDir: ROOT });

test("control: the loaded rules are real and a plain redirect to a protected suite hits", () => {
  assert.ok(Array.isArray(rules) && rules.length > 0);
  const hit = protectedTestPathShellHit({ command: `printf x > ${PROTECTED}`, rules, root: ROOT, platform: "linux" });
  assert.ok(hit, "rule set must be live, otherwise the null assertions below prove nothing");
});

const heredoc = (opener, body, terminator = "EOF") => `${opener}\n${body}\n${terminator}`;

/** Bodies that name git apply in every form, including the mutating one. */
const BODIES = [
  "git apply --check scratch/change.patch",
  "git apply scratch/change.patch",
  "run git apply -R x.patch first\nthen git apply --cached y.patch",
  `edit ${PROTECTED} later`,
];

const QUOTED_OPENERS = [
  "cat >> scratch/note.txt <<'EOF'",
  "cat > scratch/note.txt <<'EOF'",
  "cat <<'EOF'",
  `cat >> scratch/note.txt <<"EOF"`,
  "cat >> scratch/note.txt <<-'EOF'",
];

test("A1: quoted-delimiter cat heredoc whose body names git apply raises no fault and yields no body-derived target", () => {
  for (const opener of QUOTED_OPENERS) {
    for (const body of BODIES) {
      const command = heredoc(opener, body);
      let targets;
      assert.doesNotThrow(() => { targets = extractShellWriteTargets({ command, root: ROOT, platform: "linux" }); }, command);
      for (const t of targets) {
        assert.doesNotMatch(t.candidate, /change\.patch|x\.patch|y\.patch|guard-git\.test/u, `body leaked: ${command}`);
      }
    }
  }
});

test("A1: the exact reported shape yields no protected-path hit and no fault through protectedTestPathShellHit", () => {
  const command = heredoc("cat >> scratch/notes.md <<'EOF'", "to validate, run git apply --check scratch/x.patch");
  assert.equal(protectedTestPathShellHit({ command, rules, root: ROOT, platform: "linux" }), null);
  assert.equal(protectedTestPathShellHit({ command, rules, root: ROOT, platform: "win32" }), null);
});

test("A1: a protected path named only in the body is data, not a write target", () => {
  const command = heredoc("cat >> scratch/notes.md <<'EOF'", `the suite ${PROTECTED} is protected`);
  assert.equal(protectedTestPathShellHit({ command, rules, root: ROOT, platform: "linux" }), null);
});

test("retained: the opener's own redirect target still classifies (stripping the body hides nothing real)", () => {
  const command = heredoc(`cat > ${PROTECTED} <<'EOF'`, "git apply --check scratch/change.patch");
  const hit = protectedTestPathShellHit({ command, rules, root: ROOT, platform: "linux" });
  assert.ok(hit, "protected redirect target behind a heredoc opener must still hit");
  assert.equal(hit.candidate, PROTECTED);
});

test("retained: genuinely executed git apply still faults (plain, after terminator, unsupported receivers, unterminated)", () => {
  const executed = [
    "git apply scratch/change.patch",
    `${heredoc("cat >> scratch/n.txt <<'EOF'", "data")}\ngit apply scratch/change.patch`,
    heredoc("cat >> scratch/n.txt <<EOF", "git apply scratch/change.patch"),
    heredoc("bash <<'EOF'", "git apply scratch/change.patch"),
    heredoc("sh -s <<'EOF'", "git apply scratch/change.patch"),
    "cat >> scratch/n.txt <<'EOF'\ngit apply scratch/change.patch",
    heredoc("cat >> scratch/n.txt <<'EOF'", "data", "NOT-EOF") + "\ngit apply scratch/change.patch",
  ];
  for (const command of executed) {
    assert.throws(() => extractShellWriteTargets({ command, root: ROOT, platform: "linux" }), FAULT, command);
  }
});

test("RED: with the body exclusion removed (scratch mirror of production), the reported shape faults", async () => {
  const sourcePath = join(LIB, "protected-test-paths.mjs");
  const source = readFileSync(sourcePath, "utf8");
  const needle = "command = withoutInertCatHeredocBodies(command);";
  assert.ok(source.includes(needle), "production no longer contains the exclusion call; update the mirror");
  const mirrored = source
    .replace(needle, "/* exclusion removed in mirror */")
    .replace(/(from\s+)"(\.{1,2}\/[^"]+)"/gu, (_m, from, spec) => `${from}"${pathToFileURL(resolve(LIB, spec)).href}"`);
  const dir = join(ROOT, "scratch", "pin-heredoc-mirror");
  mkdirSync(dir, { recursive: true });
  const mirrorPath = join(dir, `mirror-${process.pid}.mjs`);
  writeFileSync(mirrorPath, mirrored);
  const mirror = await import(pathToFileURL(mirrorPath).href);

  const command = heredoc("cat >> scratch/notes.md <<'EOF'", "run git apply --check scratch/x.patch");
  assert.throws(() => mirror.extractShellWriteTargets({ command, root: ROOT, platform: "linux" }), FAULT,
    "mirror must fault, proving the pin can fail");
  assert.doesNotThrow(() => extractShellWriteTargets({ command, root: ROOT, platform: "linux" }),
    "production must not");
});
