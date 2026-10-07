#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

/**
 * Pins the API of `test-private-tmp.mjs`: ONE owner-only, non-inheriting
 * private temp root that test fixtures are placed under, so the private-state
 * assurance itself never has to be loosened for tests.
 *
 * The module is loaded dynamically on purpose. While it is absent every API
 * test fails individually with a clear message (the suite is RED by design),
 * and the source-text test skips with a stated reason instead of the whole
 * file failing to load.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync, rmSync, statSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";

import { assessWindowsPrivatePath, observeWindowsPrivatePath } from "./windows-private-state.mjs";

const MODULE_URL = new URL("./test-private-tmp.mjs", import.meta.url);
const MODULE_PATH = fileURLToPath(MODULE_URL);
const MODULE_PRESENT = existsSync(MODULE_PATH);
const IS_WIN32 = process.platform === "win32";
const PREFIX = "b-s1-t-";

let loaded = null;
async function api() {
  if (loaded === null) {
    try {
      loaded = { module: await import(MODULE_URL.href) };
    } catch (error) {
      loaded = { error };
    }
  }
  if (loaded.error) {
    assert.fail(`test-private-tmp.mjs is missing or failed to load: ${loaded.error?.code ?? "no-code"}: ${loaded.error?.message ?? loaded.error}`);
  }
  const { privateTempRoot, privateMkdtemp } = loaded.module;
  assert.equal(typeof privateTempRoot, "function", "test-private-tmp.mjs must export privateTempRoot()");
  assert.equal(typeof privateMkdtemp, "function", "test-private-tmp.mjs must export privateMkdtemp(prefix)");
  return loaded.module;
}

const created = [];
async function child(prefix = PREFIX) {
  const { privateMkdtemp } = await api();
  const path = privateMkdtemp(prefix);
  created.push(path);
  return path;
}

// Only children made by these tests are removed; the root's own lifetime
// (exit cleanup) belongs to the module under test.
after(() => {
  for (const path of created) rmSync(path, { recursive: true, force: true });
});

function isInside(root, path) {
  const rel = relative(root, path);
  return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
}

function principalKey(value) {
  return typeof value === "string" ? value.trim().toLocaleLowerCase("en-US") : "";
}

test("privateTempRoot returns an absolute directory that exists", async () => {
  const { privateTempRoot } = await api();
  const root = privateTempRoot();
  assert.equal(typeof root, "string", "privateTempRoot() must return a string path");
  assert.equal(isAbsolute(root), true, `root must be absolute: ${root}`);
  assert.equal(statSync(root).isDirectory(), true, `root must be an existing directory: ${root}`);
});

test("privateTempRoot is memoized: two calls in one process return the same path", async () => {
  const { privateTempRoot } = await api();
  assert.equal(privateTempRoot(), privateTempRoot());
});

test("privateTempRoot has no ancestor .git directory", async () => {
  const { privateTempRoot } = await api();
  let cursor = privateTempRoot();
  for (;;) {
    assert.equal(existsSync(join(cursor, ".git")), false, `${cursor} must not contain .git (the root or one of its ancestors is inside a repository)`);
    const parent = dirname(cursor);
    if (parent === cursor) break;
    cursor = parent;
  }
});

test("privateMkdtemp returns a fresh directory inside the root whose basename starts with the prefix", async () => {
  const { privateTempRoot } = await api();
  const path = await child();
  assert.equal(isAbsolute(path), true, `child must be absolute: ${path}`);
  assert.equal(statSync(path).isDirectory(), true, `child must be an existing directory: ${path}`);
  assert.equal(isInside(privateTempRoot(), path), true, `child ${path} must be inside root ${privateTempRoot()}`);
  assert.equal(basename(path).startsWith(PREFIX), true, `basename must start with ${PREFIX}: ${basename(path)}`);
});

test("privateMkdtemp honours a different prefix", async () => {
  const path = await child("b-s1-t-other-");
  assert.equal(basename(path).startsWith("b-s1-t-other-"), true, `basename must start with the given prefix: ${basename(path)}`);
});

test("privateMkdtemp returns a different directory on every call", async () => {
  const first = await child();
  const second = await child();
  assert.notEqual(first, second);
  assert.equal(existsSync(first) && existsSync(second), true);
});

test("win32: a privateMkdtemp child passes the existing private-state assurance", { skip: IS_WIN32 ? false : "win32 DACL semantics" }, async () => {
  const path = await child();
  const state = assessWindowsPrivatePath(path);
  assert.equal(state.status, "secure", `child must pass assessWindowsPrivatePath: ${JSON.stringify(state)}`);
});

// The assurance module exports no per-ACE inheritance flag. What it does
// expose is `observeWindowsPrivatePath`: every ACE principal of the path
// (inherited and explicit alike) plus the current principal. "No inheritable
// entry for another principal" is therefore pinned through its stricter
// proxy: the root carries no ACE at all for a principal other than the
// current user, and the unchanged assurance rates the root itself secure.
test("win32: the root carries no access entry for a principal other than the current user", { skip: IS_WIN32 ? false : "win32 DACL semantics" }, async () => {
  const { privateTempRoot } = await api();
  const root = privateTempRoot();
  const observed = observeWindowsPrivatePath(root);
  assert.equal(observed.status, null, `native DACL observation of the root must succeed: ${JSON.stringify({ status: observed.status, reason: observed.reason })}`);
  const { observation } = observed;
  const current = principalKey(observation.currentOwner);
  assert.notEqual(current, "", "the observation must name the current principal");
  assert.equal(observation.reparsePoint, false, "the root must not be a reparse point");
  assert.equal(principalKey(observation.owner), current, `the root must be owned by the current principal: ${observation.owner}`);
  assert.ok(observation.principals.length > 0, "the root DACL must not be empty");
  const foreign = observation.principals.filter((principal) => principalKey(principal) !== current);
  assert.deepEqual(foreign, [], `the root DACL must grant no principal other than the current user: ${JSON.stringify(observation.principals)}`);
  const state = assessWindowsPrivatePath(root);
  assert.equal(state.status, "secure", `the root must pass assessWindowsPrivatePath: ${JSON.stringify(state)}`);
});

test("POSIX: the root's mode is 0o700", { skip: IS_WIN32 ? "POSIX mode bits only; win32 is covered by the DACL tests" : false }, async () => {
  const { privateTempRoot } = await api();
  const mode = statSync(privateTempRoot()).mode & 0o777;
  assert.equal(mode, 0o700, `root mode must be 0700, got 0${mode.toString(8)}`);
});

test(
  "the module does not import or change the assurance's evaluation function",
  { skip: MODULE_PRESENT ? false : "test-private-tmp.mjs does not exist yet; the production module is authored by a later dispatch" },
  () => {
    const text = readFileSync(MODULE_PATH, "utf8");
    assert.equal(text.includes("evaluateWindowsPrivateState"), false, "test-private-tmp.mjs must not reference evaluateWindowsPrivateState");
  },
);
