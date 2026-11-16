// SPDX-License-Identifier: SUL-1.0
// C30D-G3 (AC-108): structural check of the held patch "a Critic briefing can be handed over as a pointer".
// The patch is a delta on top of the 30d chain, so it is NOT applied to the repository here: the notes state the required order.
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";

const PATCH = fileURLToPath(new URL("./w30d3-a-critic-briefing-can-be-handed-over-as-a-pointer.patch", import.meta.url));
const ALLOWED = [
  "plugins/pipeline-core/lib/briefing-file-reference.mjs",
  "plugins/pipeline-core/lib/critic-briefing-build.mjs",
  "plugins/pipeline-core/hooks/guard-dispatch.mjs",
  "plugins/pipeline-core/scripts/prepare-dispatch.mjs",
  "plugins/pipeline-core/scripts/prepare-dispatch.test.mjs",
  "plugins/pipeline-core/skills/critic-review/SKILL.md",
  "plugins/pipeline-core/templates/prompts/critic-review.md",
  "plugins/pipeline-core/hooks/guard-dispatch.test.mjs",
  "plugins/pipeline-core/scripts/dispatch-briefing.test.mjs",
];

test("the held patch exists and is not empty", () => {
  assert.ok(existsSync(PATCH), "the patch file is missing");
  assert.ok(statSync(PATCH).size > 0, "the patch file is empty");
});

test("the held patch touches only the briefed files, and every one of the code and test files", () => {
  const touched = [...readFileSync(PATCH, "utf8").matchAll(/^diff --git a\/(\S+) b\/(\S+)$/gmu)].map((match) => {
    assert.equal(match[1], match[2], `a rename or copy is not briefed: ${match[0]}`);
    return match[1];
  });
  assert.ok(touched.length > 0, "no file diff found in the patch");
  const outside = touched.filter((path) => !ALLOWED.includes(path));
  assert.deepEqual(outside, [], `files outside the briefed set: ${outside.join(", ")}`);
  for (const required of ALLOWED.filter((path) => /\.mjs$/u.test(path))) assert.ok(touched.includes(required), `the patch does not touch ${required}`);
});

test("the patch carries no absolute host path and no private name", () => {
  const text = readFileSync(PATCH, "utf8");
  assert.doesNotMatch(text, /\/home\/[a-z0-9_.-]+\//u);
  assert.doesNotMatch(text, /[A-Za-z]:\\Users\\/u);
});
