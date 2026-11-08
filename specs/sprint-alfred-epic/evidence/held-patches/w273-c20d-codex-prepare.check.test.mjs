// SPDX-License-Identifier: SUL-1.0
// Held-patch check for w273 (C20D-G2063-CODEX-PREPARE): the patch exists, is non-empty, touches only plugin, harness or (notes-named) docs
// files, and carries the G20-63 outcome (an agent-run Codex prepare command that performs the guard's admission before spawn_agent, the
// SubagentStart binding and notice, and the dispatch texts that name the prepare command).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const patch = readFileSync(join(here, "w273-c20d-codex-prepare.patch"), "utf8");
const notes = readFileSync(join(here, "w273-c20d-codex-prepare.notes.md"), "utf8");
const touched = () => [...patch.matchAll(/^diff --git a\/(\S+) b\//gm)].map((m) => m[1]);

test("w273 patch exists, is non-empty and every touched file is under plugins/pipeline-core/, harness/ or a docs/ path the notes name", () => {
  assert.ok(patch.length > 0);
  const files = touched();
  assert.ok(files.length > 0);
  for (const file of files) {
    const allowed = file.startsWith("plugins/pipeline-core/") || file.startsWith("harness/") || (file.startsWith("docs/") && notes.includes(file));
    assert.ok(allowed, `outside plugins/pipeline-core/, harness/ and the docs the notes name: ${file}`);
  }
  for (const required of [
    "plugins/pipeline-core/scripts/codex-native-dispatch-prepare.mjs",
    "plugins/pipeline-core/lib/native-goldfish-host-state.mjs",
    "plugins/pipeline-core/hooks/native-goldfish-host.mjs",
    "plugins/pipeline-core/lib/guard/command-catalogue.mjs",
    "plugins/pipeline-core/skills/pipeline-start/references/happy-path.md",
    "plugins/pipeline-core/hooks/guard-dispatch-native-worker.test.mjs",
  ]) assert.ok(files.includes(required), `the patch must touch ${required}`);
});

test("w273 patch adds the prepare command that runs the guard's admission, the idempotent reuse, the SubagentStart notice and the wording that names the prepare route", () => {
  assert.match(patch, /^\+.*prepareCodexNativeDispatch/mu, "the prepare function");
  assert.match(patch, /^\+.*hooks\/guard-dispatch\.mjs/mu, "the admission is the guard's own (spawned), not a copy");
  assert.match(patch, /^\+.*NGHS-ALREADY-PREPARED/mu, "a second admission of the same briefing reuses the prepared state");
  assert.match(patch, /^\+.*codexUnpreparedStartNotice/mu, "the model-visible SubagentStart notice");
  assert.match(patch, /^\+.*enterCodexHookSessionOwner/mu, "the Codex start and stop bind the hook-observed owner");
  assert.match(patch, /^\+.*CODEX_NATIVE_DISPATCH_PREPARE_SCRIPT/mu, "the script is registered for the shell guard");
  assert.match(patch, /^\+.*Codex prepare then spawn_agent/mu, "the course-absent repair names the prepare route");
  assert.match(patch, /^-.*cannot be written there yet/mu, "the 20c wording that Codex cannot write the course is removed (the restated pin only asserts its absence)");
});
