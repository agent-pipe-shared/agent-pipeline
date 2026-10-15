#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

/**
 * Regression pin for backlog item
 * `pipeline.private-temp-root-not-secure-branch-has-no-test-seam` (AC-231).
 *
 * Acceptance points of the item (Description/Proposal):
 *   P1. `privateTempRoot` accepts an injectable harden/assess option
 *       (`options.harden` / `options.assess`), default unchanged.
 *   P2. The `PRIVATE_TMP_ROOT_NOT_SECURE` refusal is pinned: removing it turns
 *       a test red (proved here against a scratch mirror, never production).
 *
 * The root is memoized per process, so every scenario runs in a fresh child
 * Node process against the real module (or a scratch mirror of it). Fixtures
 * live under the repository's scratch/ directory.
 *
 * Host limitation (PO decision K7): the seams are consulted on win32 only, so
 * the POSIX non-consultation case cannot run on a native Windows host.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const IS_WIN32 = process.platform === "win32";
const HERE = dirname(fileURLToPath(import.meta.url));
const LIB = resolve(HERE, "..");
const REPO_ROOT = resolve(LIB, "..", "..", "..");
const MODULE_PATH = join(LIB, "test-private-tmp.mjs");
const MODULE_URL = pathToFileURL(MODULE_PATH).href;
const ADAPTER_URL = pathToFileURL(join(LIB, "windows-private-state.mjs")).href;
const SCRATCH = join(REPO_ROOT, "scratch", `pin-private-tmp-not-secure-${randomUUID().slice(0, 8)}`);
const WIN_ONLY = IS_WIN32 ? false : "host-limitation: the harden/assess seams are consulted on win32 only; owner Coordinator, due 2026-10-19 (PO decision K7) for the Linux/WSL run";
const POSIX_ONLY = IS_WIN32
  ? "host-limitation: POSIX chmod branch needs directory mode bits unavailable on native Windows; owner Coordinator, due 2026-10-19 (PO decision K7) for the Linux/WSL run"
  : false;

after(() => rmSync(SCRATCH, { recursive: true, force: true }));

const SCENARIO = [
  'import { existsSync } from "node:fs";',
  "const { privateTempRoot } = await import(process.argv[1]);",
  "const seen = [];",
  'const harden = (root) => { seen.push(root); };',
  'const insecure = () => ({ status: "insecure", reason: "injected-by-test" });',
  'const noStatus = () => undefined;',
  'const secure = () => ({ status: "secure" });',
  "function attempt(run) {",
  "  try { return { value: run(), code: null, message: null }; } catch (error) { return { value: null, code: error?.code ?? null, message: String(error?.message) }; }",
  "}",
  "const first = attempt(() => privateTempRoot({ harden, assess: insecure }));",
  "const firstRootGone = seen.length > 0 && !existsSync(seen[0]);",
  "const second = attempt(() => privateTempRoot({ harden, assess: noStatus }));",
  "const secondRootGone = seen.length > 1 && !existsSync(seen[1]);",
  "const third = attempt(() => privateTempRoot({ harden, assess: secure }));",
  "const fourth = attempt(() => privateTempRoot({ harden, assess: insecure }));",
  'process.stdout.write(JSON.stringify({ first, firstRootGone, second, secondRootGone, third, fourth, seen }) + "\\n");',
].join("\n");

function run(moduleUrl, source) {
  const result = spawnSync(process.execPath, ["--input-type=module", "-e", source, moduleUrl], {
    encoding: "utf8",
    timeout: 120_000,
    shell: false,
    windowsHide: true,
  });
  assert.equal(result.error, undefined, `child must start: ${result.error?.message}`);
  assert.equal(result.status, 0, `child must exit 0 (status=${result.status}): ${result.stderr}`);
  const lines = result.stdout.trim().split(/\r?\n/);
  return JSON.parse(lines[lines.length - 1]);
}

/** Scratch mirror of the production module; `mutate` optionally edits its text. Fails loudly if the mutation did not apply. */
function mirror(name, mutate) {
  mkdirSync(SCRATCH, { recursive: true });
  let text = readFileSync(MODULE_PATH, "utf8");
  text = text.replace('from "./windows-private-state.mjs"', `from ${JSON.stringify(ADAPTER_URL)}`);
  assert.ok(text.includes(ADAPTER_URL), "mirror must rewrite the adapter import");
  if (mutate) {
    const mutated = mutate(text);
    assert.notEqual(mutated, text, "the mutation must change the mirror (otherwise the RED proves nothing)");
    text = mutated;
  }
  const path = join(SCRATCH, `${name}.mjs`);
  writeFileSync(path, text);
  return pathToFileURL(path).href;
}

function assertGuardedScenario(report, label) {
  for (const [name, outcome, gone] of [["insecure assessment", report.first, report.firstRootGone], ["assessment without a status", report.second, report.secondRootGone]]) {
    assert.equal(outcome.value, null, `${label}: ${name} must not return a root`);
    assert.equal(outcome.code, "PRIVATE_TMP_ROOT_NOT_SECURE", `${label}: ${name} must be refused with PRIVATE_TMP_ROOT_NOT_SECURE, got ${outcome.code}: ${outcome.message}`);
    assert.equal(outcome.message.includes("PRIVATE_TMP_ROOT_NOT_SECURE"), true, `${label}: message must name the code`);
    assert.equal(gone, true, `${label}: ${name}: the rejected root must be removed when the refusal surfaces`);
  }
  assert.equal(report.first.message.includes("injected-by-test"), true, `${label}: message must carry the assessed reason`);
  assert.equal(report.first.message.includes("status=insecure"), true, `${label}: message must carry the assessed status`);
  assert.equal(report.second.message.includes("status=unknown"), true, `${label}: a missing status is reported as unknown`);
}

// P1 + P2: the seam reaches the refusal.
test("AC-231 P1/P2: the injected assess seam drives PRIVATE_TMP_ROOT_NOT_SECURE and the harden seam is consulted on the fresh root", { skip: WIN_ONLY }, () => {
  const report = run(MODULE_URL, SCENARIO);
  assertGuardedScenario(report, "production");
  assert.equal(report.seen.length >= 3, true, `the injected harden seam must be consulted on every attempt (calls=${report.seen.length})`);
});

test("AC-231 P2: a refused call memoizes nothing; a later secure call succeeds and is then memoized", { skip: WIN_ONLY }, () => {
  const report = run(MODULE_URL, SCENARIO);
  assert.equal(report.third.code, null, `secure assessment after refusals must succeed: ${report.third.message}`);
  assert.equal(typeof report.third.value, "string");
  assert.equal(report.fourth.code, null, "after a success the root is memoized, so even an insecure seam is not consulted again");
  assert.equal(report.fourth.value, report.third.value);
});

// P1: default unchanged and malformed seams ignored.
test("AC-231 P1: with no options, or with non-function seams, the real adapter is used and a genuinely secure root results", { skip: WIN_ONLY }, () => {
  const source = [
    'import { existsSync } from "node:fs";',
    `const { assessWindowsPrivatePath } = await import(${JSON.stringify(ADAPTER_URL)});`,
    "const { privateTempRoot } = await import(process.argv[1]);",
    'const root = privateTempRoot({ harden: "nope", assess: 42 });',
    "const state = assessWindowsPrivatePath(root);",
    'process.stdout.write(JSON.stringify({ root, exists: existsSync(root), status: state.status, same: privateTempRoot() === root, sameNull: privateTempRoot(null) === root }) + "\\n");',
  ].join("\n");
  const report = run(MODULE_URL, source);
  assert.equal(report.exists, true);
  assert.equal(report.status, "secure", "malformed seams fall back to the real adapter, which rates the root secure");
  assert.equal(report.same && report.sameNull, true);
});

test("AC-231 P1: the optional seam parameter does not change the exported signature shape (privateTempRoot callable with zero arguments)", () => {
  const text = readFileSync(MODULE_PATH, "utf8");
  assert.match(text, /export function privateTempRoot\(options\)/);
  assert.match(text, /typeof seams\.harden === "function" \? seams\.harden : hardenWindowsPrivateDirectory/);
  assert.match(text, /typeof seams\.assess === "function" \? seams\.assess : assessWindowsPrivatePath/);
});

// P2: meaningfulness (RED) against a scratch mirror; production is never edited.
test("AC-231 P2: the scenario passes against an unmutated scratch mirror", { skip: WIN_ONLY }, () => {
  assertGuardedScenario(run(mirror("control", null), SCENARIO), "control mirror");
});

test("AC-231 P2 RED: removing the NOT_SECURE refusal in a scratch mirror makes the scenario fail", { skip: WIN_ONLY }, () => {
  const url = mirror("mutant-no-refusal", (text) => text.replace('if (state?.status !== "secure") {', "if (false) {"));
  const report = run(url, SCENARIO);
  assert.throws(() => assertGuardedScenario(report, "mutant"), assert.AssertionError, "the pin must go red when the refusal is removed");
  assert.equal(report.first.code, null, "the mutant accepts an insecure root");
});

test("AC-231 P2 RED: dropping the root cleanup before the throw is also caught", { skip: WIN_ONLY }, () => {
  const url = mirror("mutant-no-discard", (text) => text.replace("    discard(root);\n    throw error;", "    throw error;"));
  const report = run(url, SCENARIO);
  assert.throws(() => assertGuardedScenario(report, "mutant"), assert.AssertionError);
});

test("AC-231 host-limitation: POSIX branch does not consult the seams (chmod 0700 path)", { skip: POSIX_ONLY }, () => {
  const report = run(MODULE_URL, SCENARIO);
  assert.equal(report.seen.length, 0, "seams are not consulted off win32");
  assert.equal(report.first.code, null);
});
