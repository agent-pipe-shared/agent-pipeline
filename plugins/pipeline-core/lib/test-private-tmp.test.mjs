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
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
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

// --- B-S1-T2: exit cleanup and refusal paths ---------------------------------
//
// The module offers exactly two seams to a caller: the arguments of
// `privateMkdtemp(prefix)`, and the environment `os.tmpdir()` reads
// (TMPDIR / TMP / TEMP). Cases that need a fresh process or a different temp
// directory therefore run the module in a child Node process whose temp
// directory is a fixture owned by this test. `PRIVATE_TMP_ROOT_NOT_SECURE` is
// pinned further down (TEMP-SEAM-T) through the `harden`/`assess` options.

const TMP_ENVIRONMENT_KEYS = ["TMPDIR", "TMP", "TEMP"];
const CHILD_TIMEOUT_MS = 120_000;

function childEnvironment(tmp) {
  const environment = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (!TMP_ENVIRONMENT_KEYS.includes(key.toUpperCase())) environment[key] = value;
  }
  for (const key of TMP_ENVIRONMENT_KEYS) environment[key] = tmp;
  return environment;
}

/** Run `source` (an ES module body; argv[1] is the module URL) in a child whose temp directory is `tmp`; parse the last stdout line as JSON. */
function runModuleChild(source, tmp) {
  const result = spawnSync(process.execPath, ["--input-type=module", "-e", source, MODULE_URL.href], {
    encoding: "utf8",
    env: childEnvironment(tmp),
    timeout: CHILD_TIMEOUT_MS,
    shell: false,
    windowsHide: true,
  });
  assert.equal(result.error, undefined, `the child process must start and finish: ${result.error?.message}`);
  assert.equal(result.status, 0, `the child process must exit 0 (status=${result.status}, signal=${result.signal}): ${result.stderr}`);
  const lines = result.stdout.trim().split(/\r?\n/);
  return JSON.parse(lines[lines.length - 1]);
}

function samePath(left, right) {
  return IS_WIN32 ? left.toLowerCase() === right.toLowerCase() : left === right;
}

/** Run `run`; return the thrown error, or null if it did not throw (a returned directory is queued for cleanup). */
function refusalOf(run) {
  try {
    const value = run();
    if (typeof value === "string") created.push(value);
    return null;
  } catch (error) {
    return error;
  }
}

function assertRefused(run, code, label) {
  const error = refusalOf(run);
  assert.notEqual(error, null, `${label}: expected ${code}, but the call succeeded`);
  assert.equal(error.code, code, `${label}: expected error code ${code}, got ${error.code}: ${error.message}`);
  assert.equal(String(error.message).includes(code), true, `${label}: the message must name ${code}: ${error.message}`);
}

test("B-S1-T2: the private temp root and its children are removed when a process that used them exits normally", async () => {
  const sandbox = await child("b-s1-t2-exit-");
  const source = [
    'import { existsSync, writeFileSync } from "node:fs";',
    'import { join } from "node:path";',
    "const { privateTempRoot, privateMkdtemp } = await import(process.argv[1]);",
    "const root = privateTempRoot();",
    'const dir = privateMkdtemp("x-");',
    'const file = join(dir, "payload.txt");',
    'writeFileSync(file, "payload");',
    'process.stdout.write(JSON.stringify({ root, dir, file, fileExistsBeforeExit: existsSync(file) }) + "\\n");',
  ].join("\n");
  const report = runModuleChild(source, sandbox);
  assert.equal(typeof report.root, "string", "the child must print the root path");
  assert.equal(isInside(sandbox, report.root), true, `the root ${report.root} must sit inside the temp directory the child was given (${sandbox})`);
  assert.equal(isInside(report.root, report.dir), true, `the child directory ${report.dir} must sit inside the root ${report.root}`);
  assert.equal(report.fileExistsBeforeExit, true, "the payload file must exist while the child is still running (otherwise this test proves nothing)");
  assert.equal(existsSync(report.file), false, `the payload file ${report.file} must be gone after the child exited`);
  assert.equal(existsSync(report.dir), false, `the child directory ${report.dir} must be gone after the child exited`);
  assert.equal(existsSync(report.root), false, `the private temp root ${report.root} must be gone after the child exited`);
  assert.deepEqual(readdirSync(sandbox), [], "nothing the child created may remain in the temp directory it was given");
});

for (const marker of ["directory", "file"]) {
  test(`B-S1-T2: PRIVATE_TMP_ROOT_INSIDE_REPOSITORY is refused and leaves no root behind (.git ${marker} in an ancestor of the temp directory)`, async () => {
    const repository = await child(`b-s1-t2-repo-${marker}-`);
    if (marker === "directory") mkdirSync(join(repository, ".git"));
    else writeFileSync(join(repository, ".git"), "gitdir: elsewhere\n");
    const nested = join(repository, "nested", "tmp");
    mkdirSync(nested, { recursive: true });
    const source = [
      'import { readdirSync } from "node:fs";',
      'import { tmpdir } from "node:os";',
      "const { privateTempRoot, privateMkdtemp } = await import(process.argv[1]);",
      "function attempt(run) {",
      "  try { run(); return { code: null, message: null }; } catch (error) { return { code: error?.code ?? null, message: String(error?.message) }; }",
      "}",
      "const first = attempt(() => privateTempRoot());",
      'const second = attempt(() => privateMkdtemp("x-"));',
      'process.stdout.write(JSON.stringify({ tmp: tmpdir(), first, second, entries: readdirSync(tmpdir()).sort() }) + "\\n");',
    ].join("\n");
    const report = runModuleChild(source, nested);
    assert.equal(samePath(report.tmp, nested), true, `the child must have used the fixture as its temp directory: ${report.tmp} vs ${nested}`);
    for (const [label, outcome] of [["privateTempRoot()", report.first], ["privateMkdtemp() after a refusal", report.second]]) {
      assert.equal(outcome.code, "PRIVATE_TMP_ROOT_INSIDE_REPOSITORY", `${label} must be refused with PRIVATE_TMP_ROOT_INSIDE_REPOSITORY, got ${outcome.code}: ${outcome.message}`);
      assert.equal(String(outcome.message).includes("PRIVATE_TMP_ROOT_INSIDE_REPOSITORY"), true, `${label}: the message must name the code: ${outcome.message}`);
    }
    assert.deepEqual(report.entries, [], "the rejected root must already be removed when the refusal surfaces, not merely at process exit");
    assert.deepEqual(readdirSync(nested), [], "no directory may remain in the temp directory after the child exited");
  });
}

// TEMP-SEAM-T: `privateTempRoot({ harden, assess })` seams, consulted on win32 only.
// A fresh child process is needed because the root is memoized per process.
test(
  "TEMP-SEAM-T: PRIVATE_TMP_ROOT_NOT_SECURE is refused through the assess seam and a failed call memoizes no root",
  { skip: IS_WIN32 ? false : "the harden/assess seams are consulted on win32 only" },
  async () => {
    const sandbox = await child("temp-seam-t-");
    const source = [
      'import { readdirSync } from "node:fs";',
      'import { tmpdir } from "node:os";',
      "const { privateTempRoot } = await import(process.argv[1]);",
      "let hardened = 0;",
      "const harden = () => { hardened += 1; };",
      'const insecure = () => ({ status: "insecure", reason: "injected-by-test" });',
      'const secure = () => ({ status: "secure" });',
      "function attempt(run) {",
      "  try { return { value: run(), code: null, message: null }; } catch (error) { return { value: null, code: error?.code ?? null, message: String(error?.message) }; }",
      "}",
      "const first = attempt(() => privateTempRoot({ harden, assess: insecure }));",
      "const entriesAfterFirst = readdirSync(tmpdir()).sort();",
      "const second = attempt(() => privateTempRoot({ harden, assess: insecure }));",
      "const third = attempt(() => privateTempRoot({ harden, assess: secure }));",
      "const fourth = attempt(() => privateTempRoot());",
      'process.stdout.write(JSON.stringify({ first, entriesAfterFirst, second, third, fourth, hardened }) + "\\n");',
    ].join("\n");
    const report = runModuleChild(source, sandbox);
    for (const [label, outcome] of [["first call", report.first], ["second call after a refusal", report.second]]) {
      assert.equal(outcome.value, null, `${label} must not return a root`);
      assert.equal(outcome.code, "PRIVATE_TMP_ROOT_NOT_SECURE", `${label} must be refused with PRIVATE_TMP_ROOT_NOT_SECURE, got ${outcome.code}: ${outcome.message}`);
      assert.equal(String(outcome.message).includes("PRIVATE_TMP_ROOT_NOT_SECURE"), true, `${label}: the message must name the code: ${outcome.message}`);
      assert.equal(String(outcome.message).includes("injected-by-test"), true, `${label}: the message must carry the assessed reason: ${outcome.message}`);
    }
    assert.deepEqual(report.entriesAfterFirst, [], "the rejected root must already be removed when the refusal surfaces");
    assert.equal(report.hardened >= 2, true, `the injected harden seam must have been consulted on every attempt (calls=${report.hardened})`);
    assert.equal(report.third.code, null, `a later call with a secure assessment must succeed (a failed call memoizes nothing): ${report.third.message}`);
    assert.equal(typeof report.third.value, "string", "the later call must return a root path");
    assert.equal(isInside(sandbox, report.third.value), true, `the later root ${report.third.value} must sit inside the child's temp directory ${sandbox}`);
    assert.equal(report.fourth.value, report.third.value, "after a success the root is memoized and later calls (without seams) return the same path");
  },
);

test("B-S1-T2: PRIVATE_TMP_PREFIX_INVALID refuses an empty or non-string prefix and creates nothing", async () => {
  const { privateTempRoot, privateMkdtemp } = await api();
  const root = privateTempRoot();
  const before = readdirSync(root).sort();
  const invalid = [
    ["empty string", ""],
    ["undefined", undefined],
    ["null", null],
    ["number", 42],
    ["object", {}],
    ["array", ["x-"]],
  ];
  for (const [label, prefix] of invalid) {
    assertRefused(() => privateMkdtemp(prefix), "PRIVATE_TMP_PREFIX_INVALID", `prefix ${label}`);
  }
  assert.deepEqual(readdirSync(root).sort(), before, "a refused prefix must not create any directory in the root");
});

test("B-S1-T2: PRIVATE_TMP_PREFIX_ESCAPES_ROOT refuses a prefix that resolves outside the root and creates nothing", async () => {
  const { privateTempRoot, privateMkdtemp } = await api();
  const root = privateTempRoot();
  const parent = dirname(root);
  const grandparent = dirname(parent);
  const nonce = `b-s1-t2-escape-${randomUUID().slice(0, 8)}-`;
  const before = readdirSync(root).sort();
  const leaked = () => [parent, grandparent]
    .filter((directory, index, all) => all.indexOf(directory) === index)
    .flatMap((directory) => readdirSync(directory).filter((name) => name.startsWith(nonce)).map((name) => join(directory, name)));
  try {
    assertRefused(() => privateMkdtemp(`../${nonce}`), "PRIVATE_TMP_PREFIX_ESCAPES_ROOT", "prefix ../<name>");
    assertRefused(() => privateMkdtemp(`../../${nonce}`), "PRIVATE_TMP_PREFIX_ESCAPES_ROOT", "prefix ../../<name>");
    assert.deepEqual(readdirSync(root).sort(), before, "a refused prefix must not create any directory in the root");
    assert.deepEqual(leaked(), [], "a refused prefix must not create a directory outside the root either");
  } finally {
    for (const path of leaked()) rmSync(path, { recursive: true, force: true });
  }
});
