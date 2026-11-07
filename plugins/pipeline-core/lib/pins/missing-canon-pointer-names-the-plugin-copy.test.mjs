// SPDX-License-Identifier: SUL-1.0
// C20 w252 (G20-9, Codex greenfield 2026-11-07): Goldfish children in a consumer project read `templates/prompts/agent-obligations.md`
// and `templates/prompts/goldfish-task.md` at the project path, were refused with GUARD-READ-TARGET-MISSING ("check the spelling or
// create it first") and then went looking for the plugin copy. Canon pointers mean the repository file when it exists, else the plugin's
// own copy. The refusal now names that copy. The read itself stays refused; only the text changes.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { missingProjectTargetDenialText, pluginCopyOfMissingProjectPath } from "../guard/read-scope.mjs";
import { readToolScopeVerdict } from "../guard/read-scope.mjs";

function fixture(fn) {
  const base = mkdtempSync(join(tmpdir(), "c20-w252-g20-9-"));
  const project = join(base, "project");
  const plugin = join(base, "plugin");
  mkdirSync(join(project, "templates"), { recursive: true });
  mkdirSync(join(plugin, "templates", "prompts"), { recursive: true });
  writeFileSync(join(plugin, "templates", "prompts", "agent-obligations.md"), "# obligations\n");
  try { return fn({ project, plugin }); } finally { rmSync(base, { recursive: true, force: true }); }
}

test("a missing project path the plugin ships is named with the plugin copy", () => fixture(({ project, plugin }) => {
  const expected = join(plugin, "templates", "prompts", "agent-obligations.md");
  assert.equal(pluginCopyOfMissingProjectPath("templates/prompts/agent-obligations.md", project, [plugin]), expected);
  assert.equal(pluginCopyOfMissingProjectPath(join(project, "templates", "prompts", "agent-obligations.md"), project, [plugin]), expected, "absolute spelling inside the project");
  const text = missingProjectTargetDenialText("templates/prompts/agent-obligations.md", project, [plugin]);
  assert.match(text, /^BLOCKED \(guard-lifecycle-ready, plugin pipeline-core\): GUARD-READ-TARGET-MISSING: /u, "same code and prefix as before");
  assert.ok(text.includes(expected), text);
  assert.doesNotMatch(text, /check the spelling/u);
}));

test("anything the plugin does not ship keeps the previous text", () => fixture(({ project, plugin }) => {
  mkdirSync(join(plugin, "templates", "prompts", "dir.md"));
  for (const raw of [
    "templates/prompts/goldfish-task.md", // not shipped in this fixture plugin
    "templates/prompts/dir.md", // a directory, not a file
    "templates/../templates/prompts/agent-obligations.md", // dot segment
    ".claude/agent-obligations.md", // hidden segment
    "", // empty
    join(project, "..", "plugin", "templates", "prompts", "agent-obligations.md"), // outside the project
  ]) {
    assert.equal(pluginCopyOfMissingProjectPath(raw, project, [plugin]), null, raw);
    assert.equal(missingProjectTargetDenialText(raw, project, [plugin]),
      "BLOCKED (guard-lifecycle-ready, plugin pipeline-core): GUARD-READ-TARGET-MISSING: the target does not exist inside the project (nothing to read at that path); check the spelling or create it first.\n", raw);
  }
}));

test("a linked plugin entry is not offered as the copy", (t) => fixture(({ project, plugin }) => {
  const target = join(plugin, "templates", "prompts", "agent-obligations.md");
  const linked = join(plugin, "templates", "prompts", "linked.md");
  try { symlinkSync(target, linked, "file"); } catch (error) { t.skip(`host cannot create a file link (${error?.code ?? "unknown"})`); return; }
  assert.equal(pluginCopyOfMissingProjectPath("templates/prompts/linked.md", project, [plugin]), null);
}));

test("the native Read refusal of a missing canon pointer names the running plugin's copy", () => fixture(({ project }) => {
  const pluginRoot = fileURLToPath(new URL("../..", import.meta.url));
  const verdict = readToolScopeVerdict({ tool_name: "Read", tool_input: { file_path: join(project, "templates", "prompts", "goldfish-task.md") } }, project, {});
  assert.equal(verdict.exitCode, 2, "the read stays refused");
  assert.match(verdict.stderr, /GUARD-READ-TARGET-MISSING/u);
  assert.ok(verdict.stderr.includes(join(pluginRoot, "templates", "prompts", "goldfish-task.md")), verdict.stderr);
}));
