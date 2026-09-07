#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * Attended operator tool for the Claude slicing-hook registration.
 *
 * This deliberately does not share an implementation with
 * apply-pending-protected-edits.mjs. hooks.json selects the guards that run,
 * is kernel-protected, and is only changed by the human who explicitly runs
 * this command after reviewing its preview. The companion worktree-isolation
 * and handover-size hooks are already registered; this tool has no companion
 * action for them.
 *
 * Run `node harness/scripts/wire-slicing-hook.mjs --preview` before the
 * attended apply. `--check` is the terse read-only preflight; `--preview`
 * additionally constructs and validates both changed documents in memory and
 * prints the exact registration. With no flag, the tool applies and validates
 * the two files, restoring their original bytes if a post-write check fails.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const MATCHER = "Task|Agent|Workflow|TodoWrite";
export const GUARD_COMMAND = 'node "${CLAUDE_PLUGIN_ROOT}/hooks/guard-slicing.mjs"';
export const TIMEOUT_SECONDS = 10;
export const HOOKS_RELATIVE_PATH = "plugins/pipeline-core/hooks/hooks.json";
export const INVENTORY_RELATIVE_PATH = "docs/product-capability-inventory.json";
const GUARD_RELATIVE_PATH = "plugins/pipeline-core/hooks/guard-slicing.mjs";
const GUARD_SUITE_RELATIVE_PATH = "plugins/pipeline-core/hooks/guard-slicing.test.mjs";
const INVENTORY_CHECKER_RELATIVE_PATH = "harness/scripts/check-product-capability-inventory.mjs";
const VERIFY_RELATIVE_PATH = "harness/scripts/verify.mjs";
const VERIFY_SUITE_NAME = "guard-slicing-tests";
const CAPABILITY_ID = "claude-hook-safety";

export const SURFACE_ID = `hook:${HOOKS_RELATIVE_PATH}:PreToolUse:${MATCHER}:${GUARD_COMMAND}`;

function pathAt(root, path) {
  return join(root, ...path.split("/"));
}

function registration() {
  return {
    $comment: "Dispatch slicing nudge (NVA-B-SLICING-WIRE-1). Claude-only attended wiring for the non-blocking orchestrator slicing advisory. Wired by harness/scripts/wire-slicing-hook.mjs.",
    matcher: MATCHER,
    hooks: [{ type: "command", command: GUARD_COMMAND, timeout: TIMEOUT_SECONDS }],
  };
}

export function slicingRegistrations(manifest) {
  const entries = manifest?.hooks?.PreToolUse;
  if (!Array.isArray(entries)) throw new Error("hooks.PreToolUse must be an array");
  return entries.filter((entry) => Array.isArray(entry?.hooks)
    && entry.hooks.some((hook) => hook?.command === GUARD_COMMAND));
}

function assertRegistration(entry) {
  if (entry.matcher !== MATCHER) throw new Error(`existing slicing registration has matcher ${JSON.stringify(entry.matcher)}, expected ${JSON.stringify(MATCHER)}`);
  if (!Array.isArray(entry.hooks) || entry.hooks.length !== 1) throw new Error("existing slicing registration must have exactly one hook command");
  const [hook] = entry.hooks;
  if (hook?.type !== "command" || hook.command !== GUARD_COMMAND || hook.timeout !== TIMEOUT_SECONDS) {
    throw new Error("existing slicing registration does not have the required command and timeout 10");
  }
}

function utf8Compare(left, right) {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}

function insertSorted(items, addition, keyOf) {
  const index = items.findIndex((item) => utf8Compare(keyOf(item), keyOf(addition)) > 0);
  if (index === -1) items.push(addition);
  else items.splice(index, 0, addition);
}

export function transformDocuments(hooksText, inventoryText) {
  const hooks = JSON.parse(hooksText);
  const inventory = JSON.parse(inventoryText);
  const beforePreToolUse = JSON.stringify(hooks?.hooks?.PreToolUse);
  const existing = slicingRegistrations(hooks);
  if (existing.length > 1) throw new Error(`duplicate slicing registrations found (${existing.length}); resolve the manifest by hand`);
  const alreadyWired = existing.length === 1;
  if (alreadyWired) assertRegistration(existing[0]);

  const capability = (inventory?.capabilities ?? []).find((item) => item?.id === CAPABILITY_ID);
  if (!capability || !Array.isArray(capability.surfaceIds)) throw new Error(`inventory capability ${CAPABILITY_ID} has no surfaceIds array`);
  const existingSurfaceCount = capability.surfaceIds.filter((id) => id === SURFACE_ID).length;
  if (existingSurfaceCount > 1) throw new Error(`duplicate slicing inventory surface found (${existingSurfaceCount}); resolve the inventory by hand`);
  if (alreadyWired !== (existingSurfaceCount === 1)) {
    throw new Error("hook manifest and inventory disagree about slicing wiring; resolve both preimages by hand");
  }
  if (!alreadyWired) insertSorted(capability.surfaceIds, SURFACE_ID, (id) => id);

  let transformedHooks = hooksText;
  if (!alreadyWired) {
    // Preserve the protected manifest's original bytes everywhere except the
    // one new registration. JSON.stringify would normalize its escaped unicode
    // characters and make a small attended change look like a whole-file edit.
    const anchor = '\n    ],\n    "Stop":';
    const at = hooksText.indexOf(anchor);
    if (at < 0 || hooksText.indexOf(anchor, at + anchor.length) !== -1) throw new Error("cannot find one unambiguous end of hooks.PreToolUse");
    const addition = JSON.stringify(registration(), null, 2).split("\n").map((line) => `      ${line}`).join("\n");
    transformedHooks = `${hooksText.slice(0, at)},\n${addition}${hooksText.slice(at)}`;
  }
  const transformedHooksObject = JSON.parse(transformedHooks);
  const afterPreToolUse = JSON.stringify(transformedHooksObject.hooks.PreToolUse);
  const transformedInventory = `${JSON.stringify(inventory, null, 2)}\n`;
  validateTransformed(transformedHooksObject, inventory, beforePreToolUse, alreadyWired);
  return { alreadyWired, hooksText: transformedHooks, inventoryText: transformedInventory, beforePreToolUse, afterPreToolUse };
}

function validateTransformed(hooks, inventory, beforePreToolUse, alreadyWired) {
  const registrations = slicingRegistrations(hooks);
  if (registrations.length !== 1) throw new Error(`transformed hook manifest has ${registrations.length} slicing registrations, expected exactly one`);
  assertRegistration(registrations[0]);
  const capability = (inventory.capabilities ?? []).find((item) => item?.id === CAPABILITY_ID);
  if (capability.surfaceIds.filter((id) => id === SURFACE_ID).length !== 1) throw new Error("transformed inventory must contain exactly one slicing surface");
  const nonSlicing = hooks.hooks.PreToolUse.filter((entry) => !slicingRegistrations({ hooks: { PreToolUse: [entry] } }).length);
  const before = JSON.parse(beforePreToolUse);
  const beforeNonSlicing = before.filter((entry) => !slicingRegistrations({ hooks: { PreToolUse: [entry] } }).length);
  if (JSON.stringify(nonSlicing) !== JSON.stringify(beforeNonSlicing)) throw new Error("a pre-existing PreToolUse registration changed");
  if (alreadyWired && JSON.stringify(hooks.hooks.PreToolUse) !== beforePreToolUse) throw new Error("an already-wired manifest would be reformatted or changed");
}

function gitStatus(root, relativePath) {
  try {
    return execFileSync("git", ["status", "--porcelain=v1", "--untracked-files=all", "--", relativePath], { cwd: root, encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

function runNode(root, relativePath, args = []) {
  try {
    execFileSync(process.execPath, [pathAt(root, relativePath), ...args], { cwd: root, encoding: "utf8", stdio: "pipe" });
    return { ok: true, detail: "exit 0" };
  } catch (error) {
    return { ok: false, detail: `exit ${error.status ?? "unavailable"}: ${String(error.stderr ?? error.message).trim()}` };
  }
}

function runNodeTest(root, relativePath) {
  try {
    execFileSync(process.execPath, ["--test", pathAt(root, relativePath)], { cwd: root, encoding: "utf8", stdio: "pipe" });
    return { ok: true, detail: "exit 0" };
  } catch (error) {
    return { ok: false, detail: `exit ${error.status ?? "unavailable"}: ${String(error.stderr ?? error.message).trim()}` };
  }
}

function check(label, fn, failures) {
  try {
    const result = fn();
    console.log(`  [${result.ok ? "PASS" : "FAIL"}] ${label}${result.detail ? ` -- ${result.detail}` : ""}`);
    if (!result.ok) failures.push(label);
    return result.ok;
  } catch (error) {
    console.log(`  [FAIL] ${label} -- ${String(error.message ?? error)}`);
    failures.push(label);
    return false;
  }
}

export function preflight(root = REPO_ROOT, { runSuite = true, requireClean = true, gitStatusFn = gitStatus } = {}) {
  const failures = [];
  const hooksPath = pathAt(root, HOOKS_RELATIVE_PATH);
  const inventoryPath = pathAt(root, INVENTORY_RELATIVE_PATH);
  console.log("wire-slicing-hook -- preconditions");
  check("hook manifest and inventory exist", () => ({ ok: existsSync(hooksPath) && existsSync(inventoryPath), detail: "two target files" }), failures);
  let originalHooks = "";
  let originalInventory = "";
  check("target documents parse and agree", () => {
    originalHooks = readFileSync(hooksPath, "utf8");
    originalInventory = readFileSync(inventoryPath, "utf8");
    if (`${JSON.stringify(JSON.parse(originalInventory), null, 2)}\n` !== originalInventory) throw new Error("inventory does not round-trip byte-for-byte; refusing to reformat it");
    transformDocuments(originalHooks, originalInventory);
    return { ok: true, detail: "JSON parsed; registration and inventory state agree" };
  }, failures);
  if (requireClean) check("both target files are unmodified in git", () => {
    const dirty = [HOOKS_RELATIVE_PATH, INVENTORY_RELATIVE_PATH].filter((path) => gitStatusFn(root, path) !== "");
    return { ok: dirty.length === 0, detail: dirty.length === 0 ? "clean" : `refusing to overwrite: ${dirty.join(", ")}` };
  }, failures);
  check("slicing guard and its suite exist", () => ({ ok: existsSync(pathAt(root, GUARD_RELATIVE_PATH)) && existsSync(pathAt(root, GUARD_SUITE_RELATIVE_PATH)), detail: GUARD_RELATIVE_PATH }), failures);
  check("slicing suite is registered in Verify", () => ({ ok: readFileSync(pathAt(root, VERIFY_RELATIVE_PATH), "utf8").includes(VERIFY_SUITE_NAME), detail: VERIFY_SUITE_NAME }), failures);
  if (runSuite) check("existing slicing suite passes", () => runNodeTest(root, GUARD_SUITE_RELATIVE_PATH), failures);
  return { ok: failures.length === 0, failures, originalHooks, originalInventory };
}

function writeAtomically(path, content) {
  const temporary = `${path}.wire-slicing-${process.pid}.tmp`;
  try {
    writeFileSync(temporary, content, "utf8");
    renameSync(temporary, path);
  } finally {
    if (existsSync(temporary)) rmSync(temporary, { force: true });
  }
}

export function applyWiring(root = REPO_ROOT, dependencies = {}) {
  const read = dependencies.readFileSyncFn ?? readFileSync;
  const write = dependencies.writeAtomicallyFn ?? writeAtomically;
  const postCheck = dependencies.postCheckFn ?? (() => runNode(root, INVENTORY_CHECKER_RELATIVE_PATH));
  const hooksPath = pathAt(root, HOOKS_RELATIVE_PATH);
  const inventoryPath = pathAt(root, INVENTORY_RELATIVE_PATH);
  const originalHooks = read(hooksPath, "utf8");
  const originalInventory = read(inventoryPath, "utf8");
  const transformed = transformDocuments(originalHooks, originalInventory);
  if (transformed.alreadyWired) return { alreadyWired: true, restored: false };
  try {
    write(hooksPath, transformed.hooksText);
    write(inventoryPath, transformed.inventoryText);
    const post = postCheck();
    if (!post.ok) throw new Error(`post-write inventory validation failed: ${post.detail}`);
    const written = transformDocuments(read(hooksPath, "utf8"), read(inventoryPath, "utf8"));
    if (!written.alreadyWired) throw new Error("post-write documents do not report the slicing wiring");
    return { alreadyWired: false, restored: false };
  } catch (error) {
    write(hooksPath, originalHooks);
    write(inventoryPath, originalInventory);
    throw new Error(`${String(error.message ?? error)}; original hooks.json and product-capability inventory bytes were restored`);
  }
}

function main() {
  const args = process.argv.slice(2);
  const preview = args.includes("--preview");
  const checkOnly = args.includes("--check");
  if (args.some((arg) => arg !== "--preview" && arg !== "--check") || (preview && checkOnly)) {
    console.error("Expected exactly one of --preview or --check, or no argument to apply.");
    return 2;
  }
  const preflightResult = preflight();
  if (!preflightResult.ok) {
    console.error(`\n${preflightResult.failures.length} precondition(s) failed. Nothing was written.`);
    return 1;
  }
  const transformed = transformDocuments(preflightResult.originalHooks, preflightResult.originalInventory);
  if (preview) {
    console.log("\nPreview validated in memory. Nothing was written.");
    console.log(`  matcher: ${MATCHER}`);
    console.log(`  command: ${GUARD_COMMAND}`);
    console.log(`  timeout: ${TIMEOUT_SECONDS}`);
    console.log(transformed.alreadyWired ? "  state: already wired" : "  state: ready for attended apply");
    return 0;
  }
  if (checkOnly) {
    console.log(`\nCheck passed. ${transformed.alreadyWired ? "Already wired." : "Run again with no argument for the attended apply."}`);
    return 0;
  }
  try {
    const applied = applyWiring();
    console.log(applied.alreadyWired ? "\nAlready wired. Nothing was written." : "\nWired and inventory-validated.");
    return 0;
  } catch (error) {
    console.error(`\n${String(error.message ?? error)}`);
    return 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) process.exit(main());
