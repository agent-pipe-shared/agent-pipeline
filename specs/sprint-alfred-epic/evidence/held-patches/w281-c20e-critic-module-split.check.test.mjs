// SPDX-License-Identifier: SUL-1.0
// Held-patch check for w281 (C20E-G2072-CRITIC-MODULE-SPLIT): the patch exists, is non-empty, touches only plugin, harness or (notes-named) docs files, and changes
// no file the Critic preimage pin covers. It stays RED while the held patch does not exist: Step 1 of the slice ended in a design stop (see the notes file).
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const patchPath = join(here, "w281-c20e-critic-module-split.patch");
const notes = readFileSync(join(here, "w281-c20e-critic-module-split.notes.md"), "utf8");
const PINNED = ["harness/review-protocol.md", "plugins/pipeline-core/agents/critic.md", "plugins/pipeline-core/skills/critic-review/SKILL.md", "roles/critic.md", "templates/prompts/critic-review.md",
  "plugins/pipeline-core/scripts/critic-verdict.schema.json", "plugins/pipeline-core/scripts/codex-critic-host.mjs", "plugins/pipeline-core/scripts/codex-isolated-critic-protected-preimage.v1.json"];
const touched = () => [...readFileSync(patchPath, "utf8").matchAll(/^diff --git a\/(\S+) b\//gm)].map((m) => m[1]);

test("w281 patch exists, is non-empty and every touched file is under plugins/pipeline-core/, harness/ or a docs/ file the notes name", () => {
  assert.ok(existsSync(patchPath), "the held patch does not exist (Step 1 ended in a design stop; see the notes)");
  assert.ok(readFileSync(patchPath, "utf8").length > 0);
  const files = touched();
  assert.ok(files.length > 0);
  for (const file of files) {
    const allowed = file.startsWith("plugins/pipeline-core/") || file.startsWith("harness/") || (file.startsWith("docs/") && notes.includes(file));
    assert.ok(allowed, `outside plugins/pipeline-core/, harness/ and the docs files the notes name: ${file}`);
  }
});

test("w281 patch changes no file the Critic preimage pin covers", () => {
  assert.ok(existsSync(patchPath), "the held patch does not exist");
  for (const file of touched()) assert.equal(PINNED.includes(file), false, `a pinned Critic file is changed: ${file}`);
});
