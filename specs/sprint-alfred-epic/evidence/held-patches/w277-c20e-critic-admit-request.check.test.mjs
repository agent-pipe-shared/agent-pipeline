// SPDX-License-Identifier: SUL-1.0
// Held-patch check for w277 (C20E-G2069-CRITIC-ADMIT-REQUEST): the patch exists, is non-empty, touches only plugin files, and carries the G20-69 / G20-71
// outcome (the printed packet-ready result carries the complete admit request, a placeholder is refused by name, an Opus route carries the MP-07 lines).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const patch = readFileSync(join(here, "w277-c20e-critic-admit-request.patch"), "utf8");
const PINNED = ["harness/review-protocol.md", "plugins/pipeline-core/agents/critic.md", "plugins/pipeline-core/skills/critic-review/SKILL.md", "roles/critic.md", "templates/prompts/critic-review.md",
  "plugins/pipeline-core/scripts/critic-verdict.schema.json", "plugins/pipeline-core/scripts/codex-critic-host.mjs", "plugins/pipeline-core/scripts/codex-isolated-critic-protected-preimage.v1.json"];

test("w277 patch exists, is non-empty and every touched file is under plugins/pipeline-core/, harness/ or docs/", () => {
  assert.ok(patch.length > 0);
  const files = [...patch.matchAll(/^diff --git a\/(\S+) b\//gm)].map((m) => m[1]);
  assert.ok(files.length > 0);
  for (const file of files) assert.ok(file.startsWith("plugins/pipeline-core/") || file.startsWith("harness/") || file.startsWith("docs/"), `outside plugins/pipeline-core/, harness/ and docs/: ${file}`);
  for (const file of [
    "plugins/pipeline-core/scripts/critic-dispatch-preflight.mjs",
    "plugins/pipeline-core/scripts/session-critic-finalizer.mjs",
    "plugins/pipeline-core/lib/session-critic-finalizer-read.mjs",
  ]) assert.ok(files.includes(file), `the patch must change ${file}`);
});

test("w277 patch changes no file the Critic preimage pin covers", () => {
  const files = [...patch.matchAll(/^diff --git a\/(\S+) b\//gm)].map((m) => m[1]);
  for (const file of files) assert.equal(PINNED.includes(file), false, `a pinned Critic file is changed: ${file}`);
});

test("w277 patch carries the admit request, its command, the next-step text, the named placeholder refusal and the MP-07 lines", () => {
  assert.match(patch, /^\+export function preflightCriticDispatchWithAdmitRequest/mu, "the printed result entry point");
  assert.match(patch, /^\+.*admitRequest: request, admitCommand:/mu, "admitRequest and admitCommand are added to the printed result");
  assert.match(patch, /^\+.*taskIdResolution/mu, "an unresolved task id names --task-id and the candidates");
  assert.match(patch, /^\+.*SCF-REQUEST-PLACEHOLDER/mu, "an unfilled placeholder is refused by name");
  assert.match(patch, /^\+.*Batch scope \(MP-07\):/mu, "the MP-07 batch scope line");
  assert.match(patch, /^\+.*Rationale \(MP-07\):/mu, "the MP-07 rationale line");
  assert.match(patch, /^\+.*G20-69 restatement/mu, "the restated deep-equal case carries its comment");
});

test("w277 patch restates no existing assertion silently: every removed assertion line sits in the one commented restatement hunk", () => {
  const removed = [...patch.matchAll(/^-\s*assert\.[^\n]*/gmu)].map((m) => m[0]);
  assert.ok(removed.length <= 1, `more than the one restated assertion was removed: ${removed.join(" | ")}`);
  if (removed.length === 1) assert.match(patch, /^\+\s*\/\/ G20-69 restatement, criterion kept/mu);
});
