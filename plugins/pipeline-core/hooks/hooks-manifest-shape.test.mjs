#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * Pins the handler shape of all three runner hook manifests (Claude, Codex,
 * Antigravity) and confirms every declared `command` names a hook script that
 * exists on disk. Companion to codex-pretool-guard.test.mjs's own manifest-shape
 * checks (which pin ONLY the Codex descriptor); this is the first suite to cover
 * plugins/pipeline-core/hooks.json (the Antigravity manifest) at all.
 *
 * WHY. Confirmed 2026-08-27 (NVA-AGYHOOKS-1; field evidence
 * scratch/ANALYSIS-agy-retro-2026-08-27.md sections D-1/D-2): a repo-wide search
 * for references to plugins/pipeline-core/hooks.json found only the file itself
 * -- no test, no validator, no inventory entry. That let a mixed handler shape
 * ship inside it undetected: `Stop` was a `{"hooks":[...]}` wrapper object
 * sitting next to `PreInvocation`'s flat `{type,command,timeout}` objects in the
 * SAME file. Antigravity's manifest loader reads `Stop[0]` as a handler,
 * finds no `command` key on it, and discards the WHOLE manifest -- so the
 * file's declared PreToolUse guard (antigravity-pretool-guard.mjs) was
 * correctly defined and never loaded. D-1 was only possible because of D-2:
 * nothing pinned this manifest's shape the way codex-pretool-guard.test.mjs
 * already pins the Codex descriptor's shape.
 *
 * SHAPE REFERENCE, derived from the three manifests as committed, cross-checked
 * against codex-pretool-guard.test.mjs's own descriptor-shape check:
 *   - Claude (hooks/hooks.json): top-level `{ hooks: { <Event>: [...] } }`.
 *     PreToolUse/SessionStart entries: `{ matcher, hooks: [{type,command,timeout?}] }`.
 *     Stop entries: the SAME `{ hooks: [...] }` wrapper, but WITHOUT a matcher
 *     (Stop is not tool-scoped).
 *   - Codex (hooks/codex-hooks.json): top-level `{ hooks: { <Event>: [...] } }`.
 *     Every event: `{ matcher, hooks: [{type,command,commandWindows,timeout,statusMessage}] }`.
 *   - Antigravity (hooks.json, plugin root): top-level keyed by PLUGIN ID, not by
 *     a "hooks" object: `{ "pipeline-core": { enabled, PreToolUse, Stop,
 *     PreInvocation } }`. PreToolUse uses the same `{matcher, hooks:[...]}`
 *     wrapper Claude/Codex use. Stop and PreInvocation both use the FLAT
 *     `{type,command,timeout}` handler shape directly -- no wrapper, no matcher.
 */

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const hookDir = dirname(fileURLToPath(import.meta.url));
const pluginRoot = join(hookDir, "..");
let passed = 0;

function check(name, fn) {
  try {
    fn();
    passed++;
    process.stdout.write(`ok ${passed} - ${name}\n`);
  } catch (error) {
    process.stderr.write(`not ok - ${name}\n${error.stack}\n`);
    process.exitCode = 1;
  }
}

function loadJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

/** A "handler" is the innermost object actually carrying type/command/timeout. */
function assertHandlerShape(handler, label) {
  assert.equal(typeof handler, "object", `${label}: handler must be an object`);
  assert.ok(handler !== null && !Array.isArray(handler), `${label}: handler must be a plain object`);
  assert.equal(handler.type, "command", `${label}: type must be "command"`);
  assert.equal(typeof handler.command, "string", `${label}: command must be a string`);
  assert.ok(handler.command.length > 0, `${label}: command must not be empty`);
}

/**
 * Resolve the `.mjs` script path a `command` string names, relative to the
 * plugin root. Every command in all three manifests is exactly one of:
 * `node hooks/foo.mjs`, `node "hooks/foo.mjs" --flag`, or
 * `node "${CLAUDE_PLUGIN_ROOT}/hooks/foo.mjs"` / `node "${PLUGIN_ROOT}/hooks/foo.mjs"`.
 */
function resolveScriptPath(command) {
  const match = command.match(/^node\s+"?([^"\s][^"]*?\.mjs)"?(?:\s|$)/u);
  assert.ok(match, `command does not match the expected "node <script>.mjs" shape: ${command}`);
  const named = match[1]
    .replace("${CLAUDE_PLUGIN_ROOT}", pluginRoot)
    .replace("${PLUGIN_ROOT}", pluginRoot);
  return named.startsWith(pluginRoot) ? named : join(pluginRoot, named);
}

function assertScriptExists(command, label) {
  const resolved = resolveScriptPath(command);
  assert.ok(existsSync(resolved), `${label}: script does not exist on disk: ${resolved}`);
}

/* ---------------------------------------------------------------- Claude manifest */

const CLAUDE_PATH = join(hookDir, "hooks.json");

check("Claude manifest (hooks/hooks.json) parses as JSON", () => {
  loadJson(CLAUDE_PATH);
});

check("Claude manifest: PreToolUse and SessionStart use the {matcher, hooks:[{type,command,timeout?}]} wrapper shape", () => {
  const manifest = loadJson(CLAUDE_PATH);
  for (const event of ["PreToolUse", "SessionStart"]) {
    const entries = manifest.hooks[event];
    assert.ok(Array.isArray(entries), `hooks.${event} must be an array`);
    assert.ok(entries.length > 0, `hooks.${event} must not be empty`);
    for (const [i, entry] of entries.entries()) {
      const label = `hooks.${event}[${i}]`;
      assert.equal(typeof entry.matcher, "string", `${label}: matcher must be a string`);
      assert.ok(Array.isArray(entry.hooks), `${label}: hooks must be an array`);
      assert.ok(entry.hooks.length > 0, `${label}: hooks must not be empty`);
      for (const [j, handler] of entry.hooks.entries()) assertHandlerShape(handler, `${label}.hooks[${j}]`);
    }
  }
});

check("Claude manifest: Stop uses the {hooks:[{type,command,timeout}]} wrapper shape WITHOUT a matcher", () => {
  const manifest = loadJson(CLAUDE_PATH);
  const entries = manifest.hooks.Stop;
  assert.ok(Array.isArray(entries), "hooks.Stop must be an array");
  assert.ok(entries.length > 0, "hooks.Stop must not be empty");
  for (const [i, entry] of entries.entries()) {
    const label = `hooks.Stop[${i}]`;
    assert.equal(entry.matcher, undefined, `${label}: Stop entries carry no matcher`);
    assert.ok(Array.isArray(entry.hooks), `${label}: hooks must be an array`);
    assert.ok(entry.hooks.length > 0, `${label}: hooks must not be empty`);
    for (const [j, handler] of entry.hooks.entries()) assertHandlerShape(handler, `${label}.hooks[${j}]`);
  }
});

check("Claude manifest: every command references a hook script that exists on disk", () => {
  const manifest = loadJson(CLAUDE_PATH);
  for (const [event, entries] of Object.entries(manifest.hooks)) {
    for (const [i, entry] of entries.entries()) {
      for (const [j, handler] of entry.hooks.entries()) {
        assertScriptExists(handler.command, `hooks.${event}[${i}].hooks[${j}]`);
      }
    }
  }
});

/* ----------------------------------------------------------------- Codex manifest */

const CODEX_PATH = join(hookDir, "codex-hooks.json");

check("Codex manifest (hooks/codex-hooks.json) parses as JSON", () => {
  loadJson(CODEX_PATH);
});

check("Codex manifest: every declared event uses the {matcher, hooks:[{type,command,...}]} wrapper shape", () => {
  const manifest = loadJson(CODEX_PATH);
  for (const [event, entries] of Object.entries(manifest.hooks)) {
    assert.ok(Array.isArray(entries), `hooks.${event} must be an array`);
    assert.ok(entries.length > 0, `hooks.${event} must not be empty`);
    for (const [i, entry] of entries.entries()) {
      const label = `hooks.${event}[${i}]`;
      assert.equal(typeof entry.matcher, "string", `${label}: matcher must be a string`);
      assert.ok(Array.isArray(entry.hooks), `${label}: hooks must be an array`);
      assert.ok(entry.hooks.length > 0, `${label}: hooks must not be empty`);
      for (const [j, handler] of entry.hooks.entries()) assertHandlerShape(handler, `${label}.hooks[${j}]`);
    }
  }
});

check("Codex manifest: every command references a hook script that exists on disk", () => {
  const manifest = loadJson(CODEX_PATH);
  for (const [event, entries] of Object.entries(manifest.hooks)) {
    for (const [i, entry] of entries.entries()) {
      for (const [j, handler] of entry.hooks.entries()) {
        assertScriptExists(handler.command, `hooks.${event}[${i}].hooks[${j}]`);
      }
    }
  }
});

/* ------------------------------------------------------------ Antigravity manifest */

const ANTIGRAVITY_PATH = join(pluginRoot, "hooks.json");

check("Antigravity manifest (hooks.json, plugin root) parses as JSON", () => {
  loadJson(ANTIGRAVITY_PATH);
});

check('Antigravity manifest: keyed by plugin id, not by a top-level "hooks" object', () => {
  const manifest = loadJson(ANTIGRAVITY_PATH);
  assert.equal(manifest.hooks, undefined,
    'the Antigravity manifest has no top-level "hooks" key -- unlike Claude/Codex, it is keyed by plugin id');
  assert.equal(typeof manifest["pipeline-core"], "object", 'expected a top-level "pipeline-core" plugin entry');
});

check("Antigravity manifest: PreToolUse uses the {matcher, hooks:[{type,command,timeout}]} wrapper shape", () => {
  const manifest = loadJson(ANTIGRAVITY_PATH);
  const entries = manifest["pipeline-core"].PreToolUse;
  assert.ok(Array.isArray(entries), "PreToolUse must be an array");
  assert.ok(entries.length > 0, "PreToolUse must not be empty");
  for (const [i, entry] of entries.entries()) {
    const label = `PreToolUse[${i}]`;
    assert.equal(typeof entry.matcher, "string", `${label}: matcher must be a string`);
    assert.ok(Array.isArray(entry.hooks), `${label}: hooks must be an array`);
    assert.ok(entry.hooks.length > 0, `${label}: hooks must not be empty`);
    for (const [j, handler] of entry.hooks.entries()) assertHandlerShape(handler, `${label}.hooks[${j}]`);
  }
});

check("Antigravity manifest: Stop and PreInvocation both use the FLAT {type,command,timeout} handler shape directly (no wrapper, no matcher) -- the D-1 regression pin", () => {
  const manifest = loadJson(ANTIGRAVITY_PATH);
  for (const event of ["Stop", "PreInvocation"]) {
    const entries = manifest["pipeline-core"][event];
    assert.ok(Array.isArray(entries), `${event} must be an array`);
    assert.ok(entries.length > 0, `${event} must not be empty`);
    for (const [i, handler] of entries.entries()) {
      const label = `${event}[${i}]`;
      assert.equal(handler.matcher, undefined, `${label}: flat handlers carry no matcher`);
      assert.equal(handler.hooks, undefined, `${label}: flat handlers carry no "hooks" wrapper array -- this is exactly the shape D-1 violated`);
      assertHandlerShape(handler, label);
    }
  }
});

check("Antigravity manifest: every command references a hook script that exists on disk", () => {
  const manifest = loadJson(ANTIGRAVITY_PATH);
  const plugin = manifest["pipeline-core"];
  for (const entry of plugin.PreToolUse) {
    for (const handler of entry.hooks) assertScriptExists(handler.command, "PreToolUse");
  }
  for (const event of ["Stop", "PreInvocation"]) {
    for (const handler of plugin[event]) assertScriptExists(handler.command, event);
  }
});

if (process.exitCode) process.exit(process.exitCode);
process.stdout.write(`1..${passed}\n`);
