// SPDX-License-Identifier: SUL-1.0
// Pure-function cases of the Full Verify wrapper: the --resume run choice, the resumed count and the summary line (AC-140).
import assert from "node:assert/strict";
import test from "node:test";
import { countResumed, newestRunId, summarize } from "./full-verify.mjs";

test("newestRunId picks the most recently modified safe run directory name", () => {
  assert.equal(newestRunId([{ name: "verify-a", mtimeMs: 1 }, { name: "verify-b", mtimeMs: 3 }, { name: "verify-c", mtimeMs: 2 }]), "verify-b");
  assert.equal(newestRunId([{ name: "../escape", mtimeMs: 9 }, { name: "verify-a", mtimeMs: 1 }]), "verify-a");
  assert.equal(newestRunId([]), null);
  assert.equal(newestRunId(undefined), null);
});

test("countResumed counts only resumed progress lines", () => {
  const line = (state) => JSON.stringify({ schema: "pipeline.verify-progress.v1", state, suite: "s" });
  assert.equal(countResumed([line("started"), line("resumed"), "not json", line("resumed"), line("completed")].join("\n")), 2);
  assert.equal(countResumed(""), 0);
});

test("summarize states the resumed count only when resuming, and keeps the old lines otherwise", () => {
  const record = { steps: [{ name: "a", exitCode: 0 }, { name: "b", exitCode: 1 }] };
  const plain = summarize({ exitCode: 1, seconds: 5, outputPath: "o.txt", record });
  assert.equal(plain.some((entry) => /resumed/u.test(entry)), false);
  assert.deepEqual(plain.slice(0, 2), ["verify exit 1 after 5 s; output in o.txt", "steps 2, red 1"]);
  const resumed = summarize({ exitCode: 1, seconds: 5, outputPath: "o.txt", record, resumed: 3 });
  assert.match(resumed[1], /resumed over 3 suite/u);
});
