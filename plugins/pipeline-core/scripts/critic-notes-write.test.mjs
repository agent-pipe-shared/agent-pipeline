// SPDX-License-Identifier: SUL-1.0
import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { appendNotes, createNotesDir, drawSuffix, NotesWriterError } from "./critic-notes-write.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const scratchBase = resolve(here, "..", "..", "..", "scratch");
const SCRIPT = resolve(here, "critic-notes-write.mjs");

function fixtureRoot() {
  mkdirSync(scratchBase, { recursive: true });
  return mkdtempSync(resolve(scratchBase, "cnw-test-"));
}

function withRoot(fn) {
  const root = fixtureRoot();
  try {
    return fn(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("suffix is drawn from node:crypto: 8 hex chars, differs between draws", () => {
  const a = drawSuffix();
  const b = drawSuffix();
  assert.match(a, /^[0-9a-f]{8}$/);
  assert.notEqual(a, b);
});

test("create makes a fresh private directory and an empty notes file atomically", () => {
  withRoot((root) => {
    const r = createNotesDir({ root, codename: "alf-c2" });
    assert.match(r.dir, /^scratch\/dispatch\/critic-alf-c2-[0-9a-f]{8}$/);
    assert.equal(r.notes, `${r.dir}/critic-notes.md`);
    assert.equal(readFileSync(resolve(root, r.notes), "utf8"), "");
    assert.ok(statSync(resolve(root, r.dir)).isDirectory());
  });
});

test("two creates never share a directory", () => {
  withRoot((root) => {
    const a = createNotesDir({ root });
    const b = createNotesDir({ root });
    assert.notEqual(a.dir, b.dir);
  });
});

test("collision on the drawn name is retried, never adopted", () => {
  withRoot((root) => {
    const first = createNotesDir({ root, draw: () => Buffer.from("aabbccdd", "hex") });
    writeFileSync(resolve(root, first.notes), "precious\n");
    const draws = [Buffer.from("aabbccdd", "hex"), Buffer.from("11223344", "hex")];
    const second = createNotesDir({ root, draw: () => draws.shift() });
    assert.equal(second.dir, "scratch/dispatch/critic-11223344");
    assert.equal(readFileSync(resolve(root, first.notes), "utf8"), "precious\n");
  });
});

test("persistent collision fails closed instead of adopting an existing directory", () => {
  withRoot((root) => {
    createNotesDir({ root, draw: () => Buffer.from("aabbccdd", "hex") });
    assert.throws(
      () => createNotesDir({ root, draw: () => Buffer.from("aabbccdd", "hex") }),
      (e) => e instanceof NotesWriterError && e.code === "CNW-COLLISION",
    );
  });
});

test("create refuses a bad codename and a relative root", () => {
  withRoot((root) => {
    assert.throws(() => createNotesDir({ root, codename: "../x" }), /CNW-CODENAME/);
    assert.throws(() => createNotesDir({ root: "rel" }), /CNW-ROOT/);
  });
});

test("create refuses a symlinked scratch/dispatch parent", () => {
  withRoot((root) => {
    const elsewhere = resolve(root, "elsewhere");
    mkdirSync(elsewhere);
    mkdirSync(resolve(root, "scratch"));
    try {
      symlinkSync(elsewhere, resolve(root, "scratch", "dispatch"), "junction");
    } catch {
      return; // symlink creation unavailable on this host: nothing to assert
    }
    assert.throws(() => createNotesDir({ root }), /CNW-UNSAFE-PARENT/);
    assert.deepEqual(readdirSync(elsewhere), []);
  });
});

test("append adds notes inside the created directory and keeps prior content", () => {
  withRoot((root) => {
    const { dir, notes } = createNotesDir({ root });
    appendNotes({ root, dir, text: "one" });
    appendNotes({ root, dir, text: "two\n" });
    assert.equal(readFileSync(resolve(root, notes), "utf8"), "one\ntwo\n");
  });
});

test("append refuses traversal, foreign names, absolute dirs, missing dirs and empty text", () => {
  withRoot((root) => {
    const { dir } = createNotesDir({ root });
    for (const bad of ["scratch/dispatch/../x", "scratch/dispatch/other-aabbccdd", "/etc", "scratch/dispatch/critic-deadbeef", "scratch/dispatch/critic-aabbccdd/sub"]) {
      assert.throws(() => appendNotes({ root, dir: bad, text: "x" }), /CNW-DIR/, bad);
    }
    assert.throws(() => appendNotes({ root, dir, text: "" }), /CNW-TEXT/);
    assert.throws(() => appendNotes({ root, dir, text: "x".repeat(70000) }), /CNW-TEXT/);
  });
});

test("append refuses a directory not created by create (notes file missing)", () => {
  withRoot((root) => {
    mkdirSync(resolve(root, "scratch", "dispatch", "critic-aabbccdd"), { recursive: true });
    assert.throws(() => appendNotes({ root, dir: "scratch/dispatch/critic-aabbccdd", text: "x" }), /CNW-NOTES-MISSING/);
  });
});

test("CLI: create then append, JSON on stdout, exit 0; bad usage exits 2", () => {
  withRoot((root) => {
    const c = spawnSync(process.execPath, [SCRIPT, "create", "--root", root, "--codename", "cli"], { encoding: "utf8" });
    assert.equal(c.status, 0, c.stderr);
    const { dir, notes } = JSON.parse(c.stdout);
    const a = spawnSync(process.execPath, [SCRIPT, "append", "--root", root, "--dir", dir, "--text", "hello"], { encoding: "utf8" });
    assert.equal(a.status, 0, a.stderr);
    assert.equal(readFileSync(resolve(root, notes), "utf8"), "hello\n");
    const bad = spawnSync(process.execPath, [SCRIPT, "frobnicate"], { encoding: "utf8" });
    assert.equal(bad.status, 2);
  });
});
