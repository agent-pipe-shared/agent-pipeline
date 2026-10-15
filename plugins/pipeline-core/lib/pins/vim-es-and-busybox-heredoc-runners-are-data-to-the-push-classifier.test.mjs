// Regression pin (ALF-C-P4-05, AC-268): vim/vi/ex ex-mode and busybox shell applets fed a here-document are NOT data to the
// push classifier. Backlog item:
// backlog/items/2026-10-07-vim-es-and-busybox-heredoc-runners-are-data-to-the-push-classifier.md
// Every command text below is DATA handed to `commandIsGitPush`; it is never executed.
// Acceptance points: (P1) vi/vim/ex with an ex-mode option (-e, -es, -E, -E -s) + heredoc `!git push` is a candidate;
// (P2) `busybox <shell-applet>` (sh, ash) + heredoc holding git push is a candidate; (P3) controls stay plain: ex-mode with no
// git word, a non-shell busybox applet, and vim without an ex-mode option; (P4) each of P1/P2 can fail: a scratch mirror of the
// production module with the relevant rule removed flips the verdict (never an in-place production edit).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { commandIsGitPush } from "../git-cmd.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PRODUCTION = path.join(HERE, "..", "git-cmd.mjs");
const REPO_ROOT = path.resolve(HERE, "..", "..", "..", "..");
const SCRATCH = path.join(REPO_ROOT, "scratch", "alf-c-p4-05-mirror");

const P1_VI_EX_CANDIDATES = [
  "vim -es <<EOF\n!git push origin main\nEOF",
  "vi -e <<EOF\n!git push origin main\nEOF",
  "ex -s <<EOF\n!git push origin main\nEOF",
  "vim -E -s <<EOF\n!git push origin main\nEOF",
  "vim -Es <<EOF\n!git push origin main\nEOF",
  "vim -es <<'EOF'\n!git push origin main\nEOF",
  "/usr/bin/vim -es <<EOF\n!git push origin main\nEOF",
];
const P2_BUSYBOX_CANDIDATES = [
  "busybox sh <<EOF\ngit push origin main\nEOF",
  "busybox ash <<'EOF'\ngit push origin main\nEOF",
  "busybox sh <<-EOF\n\tgit push origin main\nEOF",
];
const P3_CONTROLS = [
  "vim -es <<EOF\n:wq\nEOF",
  "busybox ls <<EOF\ngit push origin main\nEOF",
  "vim <<EOF\ngit push origin main\nEOF",
  "busybox sh <<EOF\necho hello\nEOF",
];

for (const cmd of P1_VI_EX_CANDIDATES) {
  test(`P1 candidate: ${JSON.stringify(cmd)}`, () => assert.equal(commandIsGitPush(cmd), true));
}
for (const cmd of P2_BUSYBOX_CANDIDATES) {
  test(`P2 candidate: ${JSON.stringify(cmd)}`, () => assert.equal(commandIsGitPush(cmd), true));
}
for (const cmd of P3_CONTROLS) {
  test(`P3 control stays plain: ${JSON.stringify(cmd)}`, () => assert.equal(commandIsGitPush(cmd), false));
}

// P4: RED against scratch mirrors of the production module with exactly one rule removed.
async function loadMirror(name, edit) {
  const source = fs.readFileSync(PRODUCTION, "utf8");
  const edited = edit(source);
  assert.notEqual(edited, source, `mirror edit ${name} must change the source`);
  fs.mkdirSync(SCRATCH, { recursive: true });
  const file = path.join(SCRATCH, `${name}.mjs`);
  fs.writeFileSync(file, edited);
  try {
    return await import(`${pathToFileURL(file).href}?v=${Date.now()}`);
  } finally {
    fs.rmSync(file, { force: true });
    fs.rmSync(SCRATCH, { recursive: true, force: true });
  }
}

test("P4 RED: without the vi/vim ex-mode rule the vi/vim candidates are data (the ex rule is what the pin guards)", async () => {
  const mirror = await loadMirror("no-vi-ex-rule", (s) => s.replace("if (unitHasViExModeReceiver(words)) return true;", ""));
  for (const cmd of ["vim -es <<EOF\n!git push origin main\nEOF", "vi -e <<EOF\n!git push origin main\nEOF", "vim -E -s <<EOF\n!git push origin main\nEOF"]) {
    assert.equal(mirror.commandIsGitPush(cmd), false, `mirror must miss ${JSON.stringify(cmd)}`);
  }
  // ex stays a candidate through the separate runner-name rule, so the mirror is narrow.
  assert.equal(mirror.commandIsGitPush("ex -s <<EOF\n!git push origin main\nEOF"), true);
});

test("P4 RED: without sh/ash in the receiver list the busybox candidates are data", async () => {
  const mirror = await loadMirror("no-shell-applets", (s) =>
    s.replace('"sh", "bash", "zsh", "ksh", "dash", "ash",', '"bash", "zsh", "ksh", "dash",'),
  );
  for (const cmd of P2_BUSYBOX_CANDIDATES) {
    assert.equal(mirror.commandIsGitPush(cmd), false, `mirror must miss ${JSON.stringify(cmd)}`);
  }
});
