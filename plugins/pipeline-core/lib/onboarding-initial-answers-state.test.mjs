// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import {
  INITIAL_ANSWERS_LOCAL_RECEIPT,
  resolveInitialAnswersState,
} from "./onboarding-initial-answers-state.mjs";

function fixtureRoot(prefix) {
  for (const candidate of [...new Set([tmpdir(), process.env.TMPDIR, process.env.TMP, process.env.TEMP, "/var/tmp", "/dev/shm"].filter(Boolean))]) {
    let cursor;
    try { cursor = realpathSync(candidate); if (!lstatSync(cursor).isDirectory()) continue; }
    catch { continue; }
    let clean = true;
    while (true) {
      try { lstatSync(join(cursor, ".git")); clean = false; break; }
      catch (error) { if (error?.code !== "ENOENT") { clean = false; break; } }
      const parent = dirname(cursor);
      if (parent === cursor) break;
      cursor = parent;
    }
    if (clean) return mkdtempSync(join(realpathSync(candidate), prefix));
  }
  throw new Error("no writable temporary parent without an existing Git control is available for the resolver fixture");
}

test("local first-answer receipt retains its historical path and never creates state", () => {
  const root = fixtureRoot("initial-local-");
  try {
    const uninitialized = resolveInitialAnswersState(root, "local");
    assert.equal(uninitialized.receipt, join(root, INITIAL_ANSWERS_LOCAL_RECEIPT));
    assert.equal(uninitialized.pending, null);
    assert.throws(() => resolveInitialAnswersState(root, "local", { requireGit: true }));
    assert.equal(existsSync(join(root, ".git")), false,
      "read fallback never creates .git and the writer-specific resolver rejects the uninitialized root");
    execFileSync("git", ["init", "-q", "-b", "main"], { cwd: root, stdio: "ignore" });
    const state = resolveInitialAnswersState(root, "local");
    assert.equal(state.receipt, join(root, INITIAL_ANSWERS_LOCAL_RECEIPT));
    assert.equal(state.pending, null);
    assert.equal(existsSync(join(root, ".git")), true);
    assert.throws(() => resolveInitialAnswersState(root, "local", { create: true }), /existing local writer/u);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("the no-Git read fallback does not hide a malformed ancestor control", () => {
  const parent = fixtureRoot("initial-control-parent-");
  const root = join(parent, "project");
  try {
    mkdirSync(root);
    writeFileSync(join(parent, ".git"), "not a Git directory\n");
    assert.throws(() => resolveInitialAnswersState(root, "local"), /physical Git common directory is unavailable/u);
    assert.equal(existsSync(join(root, ".git")), false);
  } finally { rmSync(parent, { recursive: true, force: true }); }
});

test("linked worktrees resolve the local answer receipt under the canonical shared Git directory", () => {
  const parent = fixtureRoot("initial-linked-");
  const primary = join(parent, "primary"); const linked = join(parent, "linked");
  try {
    mkdirSync(primary);
    const git = (cwd, ...args) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: "ignore" });
    git(primary, "init", "-q", "-b", "main");
    git(primary, "config", "user.name", "Onboarding Fixture");
    git(primary, "config", "user.email", "onboarding@example.invalid");
    writeFileSync(join(primary, "README.md"), "worktree receipt\n");
    git(primary, "add", "README.md");
    git(primary, "commit", "-q", "-m", "base");
    git(primary, "worktree", "add", "-q", "-b", "linked-answer-state", linked);
    const common = execFileSync("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], {
      cwd: linked, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    const state = resolveInitialAnswersState(linked, "local");
    assert.equal(state.receipt, join(common, "agent-pipeline", "onboarding-initial-answers.json"));
    assert.notEqual(state.receipt, join(linked, INITIAL_ANSWERS_LOCAL_RECEIPT));
    assert.equal(state.pending, null);
    assert.equal(existsSync(state.receipt), false, "missing private answers stay absent");
    mkdirSync(join(common, "agent-pipeline"), { recursive: true });
    const receiptBytes = JSON.stringify({ schema: "pipeline.onboarding-initial-answers.v1", root: linked, language: "en" });
    writeFileSync(state.receipt, receiptBytes, { mode: 0o600 });
    const readerPath = resolveInitialAnswersState(linked, "local").receipt;
    const receiptStat = lstatSync(readerPath);
    assert.equal(receiptStat.isFile(), true);
    assert.equal(receiptStat.isSymbolicLink(), false);
    assert.equal(receiptStat.nlink, 1);
    const readback = JSON.parse(readFileSync(readerPath, "utf8"));
    assert.equal(readback.root, linked);
    assert.equal(readback.language, "en");
    const outsideReceipt = join(parent, "outside-answer.json");
    writeFileSync(outsideReceipt, receiptBytes, { mode: 0o600 });
    unlinkSync(readerPath);
    symlinkSync(outsideReceipt, readerPath);
    const linkedStat = lstatSync(readerPath);
    assert.equal(linkedStat.isSymbolicLink(), true,
      "the physical-file readers must refuse a symlink even at the canonical receipt pathname");
  } finally { rmSync(parent, { recursive: true, force: true }); }
});

test("host-managed first-answer paths stay in the private runtime, not reserved controls", () => {
  const root = fixtureRoot("initial-host-");
  try {
    const state = resolveInitialAnswersState(root, "host-managed");
    assert.equal(state.receipt, join(root, ".claude/.runtime/agent-pipeline/onboarding/initial-answers.json"));
    assert.equal(state.pending, join(root, ".claude/.runtime/agent-pipeline/onboarding/initial-answers-pending.json"));
    assert.equal(existsSync(join(root, ".claude")), false);
    assert.equal(existsSync(join(root, ".git")), false);
    assert.equal(existsSync(join(root, ".codex")), false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("unknown repository capabilities do not silently select local state", () => {
  const root = fixtureRoot("initial-unknown-");
  try { assert.throws(() => resolveInitialAnswersState(root, "unknown"), /cannot host/u); }
  finally { rmSync(root, { recursive: true, force: true }); }
});

test("host-managed creation owns only the private tree and rejects an alias", () => {
  const root = fixtureRoot("initial-host-create-");
  const outside = fixtureRoot("initial-host-outside-");
  try {
    const state = resolveInitialAnswersState(root, "host-managed", { create: true });
    assert.equal(existsSync(join(root, ".claude/.runtime/agent-pipeline/onboarding")), true);
    assert.equal(existsSync(state.receipt), false);
    assert.equal(existsSync(state.pending), false);
    assert.equal(existsSync(join(root, ".git")), false);
    assert.equal(existsSync(join(root, ".codex")), false);
    const aliasedRoot = fixtureRoot("initial-host-alias-");
    try {
      symlinkSync(outside, join(aliasedRoot, ".claude"), "dir");
      assert.throws(() => resolveInitialAnswersState(aliasedRoot, "host-managed"));
    } finally { rmSync(aliasedRoot, { recursive: true, force: true }); }
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});
