// SPDX-License-Identifier: SUL-1.0
// Candidate 31, lane M7 (AC-112 binding): structural check of the held patch w317. The patch is a delta on the base clone of candidate 31, so it is NOT applied
// to the real checkout here (apply the base clone first, see the notes file); this check only proves that it exists and touches nothing outside its seven files.
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";

const PATCH = fileURLToPath(new URL("./w317-browser-smoke-stage-1-runs-the-declared-command-behind-the-preflight.patch", import.meta.url));
const ALLOWED = [
  "plugins/pipeline-core/scripts/browser-smoke-check.mjs",
  "plugins/pipeline-core/scripts/browser-smoke-check.test.mjs",
  "plugins/pipeline-core/scripts/verify-evidence-producer.mjs",
  "plugins/pipeline-core/scripts/verify-evidence-producer.test.mjs",
  "plugins/pipeline-core/scripts/toolchain-preflight.test.mjs",
  "docs/usage.md",
  "plugins/pipeline-core/lib/guard-maintenance-window.mjs",
];

test("w317: the held patch exists and is not empty", () => {
  assert.ok(statSync(PATCH).size > 0);
});

test("w317: the patch touches only files of its write list", () => {
  const text = readFileSync(PATCH, "utf8");
  const touched = [...text.matchAll(/^diff --git a\/(\S+) b\/(\S+)$/gmu)].flatMap((match) => [match[1], match[2]]);
  assert.ok(touched.length > 0, "the patch names at least one file");
  assert.deepEqual([...new Set(touched)].filter((file) => !ALLOWED.includes(file)), [], "no file outside the write list");
});

test("w317: the patch carries the dispatcher, the producer routing and the reserved-id documentation", () => {
  const text = readFileSync(PATCH, "utf8");
  assert.match(text, /^\+export function runConsumerVerifyCheck\(/mu);
  assert.match(text, /^\+\s+err\("no browser test ran; this is not a product failure"\);/mu);
  assert.match(text, /entry\.id === BROWSER_SMOKE_ID \? \[BROWSER_SMOKE_DISPATCHER, BROWSER_SMOKE_ID\]/u);
  assert.match(text, /^\+The command id `browser-smoke` is reserved/mu);
});
