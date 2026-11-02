// Held-patch check for w106 (C18-22, AC-262): signing-preparation parity texts on every runner.
// It does not run git apply: the patch is a delta on top of the held patches w83, w100 and the chain before it.
import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const PATCH = join(HERE, "w106-c18-22-every-runner-is-told-to-prepare-the-signing-itself-and-hand-over-only-the-sign-off.patch");
const ALLOWED = [
  "harness/scripts/generate-agent-obligations.mjs",
  "plugins/pipeline-core/config/runner-capabilities.json",
  "plugins/pipeline-core/hooks/antigravity-pretool-guard.mjs",
  "plugins/pipeline-core/hooks/antigravity-pretool-guard.test.mjs",
  "plugins/pipeline-core/hooks/codex-pretool-guard.mjs",
  "plugins/pipeline-core/hooks/codex-pretool-guard.test.mjs",
  "plugins/pipeline-core/lib/guard/po-commands.mjs",
  "plugins/pipeline-core/skills/pipeline-start/references/happy-path.md",
  "plugins/pipeline-core/skills/pipeline-start/references/push-approval.md",
  "plugins/pipeline-core/templates/prompts/agent-obligations.md",
  "templates/prompts/agent-obligations.md",
];

test("w106: the patch exists and is non-empty", () => {
  assert.ok(existsSync(PATCH), "patch file is missing");
  assert.ok(statSync(PATCH).size > 0, "patch file is empty");
});

test("w106: the patch touches only the allowed files", () => {
  const text = readFileSync(PATCH, "utf8");
  const files = [...text.matchAll(/^diff --git a\/(\S+) b\/(\S+)$/gmu)].flatMap((m) => [m[1], m[2]]);
  assert.ok(files.length > 0, "patch has no diff header");
  for (const file of files) assert.ok(ALLOWED.includes(file), `patch touches an unexpected file: ${file}`);
});

test("w106: the patch carries the obligations section and the runner-capabilities row", () => {
  const text = readFileSync(PATCH, "utf8");
  assert.match(text, /Human-signed gates: prepare yourself, hand over only the sign-off/u);
  assert.match(text, /Signing preparation/u);
});
