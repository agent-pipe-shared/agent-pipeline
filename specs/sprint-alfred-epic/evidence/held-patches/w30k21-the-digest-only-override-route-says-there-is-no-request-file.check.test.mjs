// C30K-K21 check: the held patch exists, is non-empty and touches only the briefed files. It does not run git apply (the patch is a delta on the integrated 30j tree).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const PATCH = new URL("./w30k21-the-digest-only-override-route-says-there-is-no-request-file.patch", import.meta.url);
const ALLOWED = [
  "plugins/pipeline-core/lib/critical-action-approval-card.mjs",
  "plugins/pipeline-core/lib/critical-action-approval-card.test.mjs",
  "plugins/pipeline-core/scripts/po-human-approval.mjs",
  "plugins/pipeline-core/scripts/po-human-approval.test.mjs",
];

test("C30K-K21: the patch is non-empty and touches only the briefed files", () => {
  const text = readFileSync(PATCH, "utf8");
  assert.ok(text.length > 0);
  const files = [...text.matchAll(/^diff --git a\/(\S+) b\/(\S+)$/gmu)].flatMap((m) => [m[1], m[2]]);
  assert.ok(files.length > 0);
  for (const file of files) assert.ok(ALLOWED.includes(file), `unexpected file in patch: ${file}`);
  for (const file of ALLOWED) assert.ok(files.includes(file), `missing file in patch: ${file}`);
});
