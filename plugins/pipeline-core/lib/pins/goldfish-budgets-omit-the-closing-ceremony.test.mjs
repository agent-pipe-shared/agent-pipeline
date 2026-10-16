// SPDX-License-Identifier: SUL-1.0
// Pin for backlog item pipeline.goldfish-budgets-omit-the-closing-ceremony (AC-185, slice ALF-C-P11-02).
// Proposal clauses: (A) the dispatch template adds a fixed closing allowance on top of the work budget;
// (B) long suites run in the foreground with a long timeout, never background plus poll;
// (C) the commit producer retries `index.lock` once internally.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createGoldfishCommitCommandFlow } from "../goldfish-commit-command-flow.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const template = readFileSync(join(root, "templates", "prompts", "goldfish-task.md"), "utf8");

// Predicates over template text, so each can be shown to fail on a mutated in-memory copy (no production edit).
const hasClosingAllowance = (text) =>
  /Closing allowance \(\+5 tool uses beyond the base cap\)/u.test(text)
  && /base \+ 5/u.test(text)
  && /message file \+ `git add` \+ `git commit` \+ the record write/u.test(text);
const hasForegroundRule = (text) =>
  /Long-running suites\/scans[^\n]*run in the FOREGROUND, in-turn/u.test(text)
  && /Never start a background job and end your own turn before holding its result/u.test(text);
const hasIndexLockRetryOnce = (text) =>
  /`\.git\/index\.lock` exists at commit time: retry once[^\n]*if it persists, stop and report/u.test(text);

test("A: template funds a fixed closing allowance on top of the work budget", () => {
  assert.equal(hasClosingAllowance(template), true);
  assert.match(template, /closing allowance[\s\S]{0,200}sits on top of it/iu);
});

test("A (RED mirror): predicate fails when the allowance is absent", () => {
  const mutated = template.replaceAll("Closing allowance (+5 tool uses beyond the base cap)", "Closing note");
  assert.equal(hasClosingAllowance(mutated), false);
});

test("B: template runs long suites in the foreground and forbids background-then-end-turn", () => {
  assert.equal(hasForegroundRule(template), true);
});

test("B (RED mirror): predicate fails when the foreground rule is removed", () => {
  const mutated = template.replaceAll("run in the FOREGROUND, in-turn", "may run in the background");
  assert.equal(hasForegroundRule(mutated), false);
});

test("C (template side): a locked index at commit time is retried once, then reported", () => {
  assert.equal(hasIndexLockRetryOnce(template), true);
  assert.equal(hasIndexLockRetryOnce(template.replaceAll("retry once", "retry forever")), false);
});

test("C (producer side, real module): the producer renders the exact commit step the retry applies to", () => {
  const flow = createGoldfishCommitCommandFlow({ taskId: "GF-42", type: "fix", scope: "core",
    summary: "pin the closing ceremony", bodyParagraphs: ["Explain why."], paths: ["a.txt"] });
  assert.equal(flow.ok, true);
  assert.deepEqual(flow.steps.map((step) => step.kind), ["stage-exact-paths", "commit-exact-paths"]);
  assert.deepEqual(flow.steps[1].argv, ["commit", "-F", flow.messagePath, "--", "a.txt"]);
});

// Literal clause C: "The commit producer retries index.lock once internally." The producer
// (lib/goldfish-commit-command-flow.mjs, createGoldfishCommitCommandFlow) is render-only by design, so it
// carries the single retry as part of its rendered contract: each step's machine-readable `onIndexLock`
// field plus a one-sentence disclaimer rule. (Originally RED/todo: the producer had no index.lock retry.)
test("C (producer side, literal): producer owns a single index.lock retry", () => {
  const flow = createGoldfishCommitCommandFlow({ taskId: "GF-42", type: "fix", scope: "core",
    summary: "pin the closing ceremony", bodyParagraphs: ["Explain why."], paths: ["a.txt"] });
  assert.equal(flow.ok, true);
  const serialized = JSON.stringify(flow);
  assert.match(serialized, /index\.lock/u);
  assert.match(serialized, /retry/iu);
  for (const step of flow.steps) {
    assert.deepEqual(step.onIndexLock, { retries: 1, then: "stop-and-report" }, step.kind);
  }
  assert.match(flow.disclaimer, /index\.lock exists gets exactly one retry with the identical step; if it persists, stop and report, and never delete the lock file yourself/u);
});
