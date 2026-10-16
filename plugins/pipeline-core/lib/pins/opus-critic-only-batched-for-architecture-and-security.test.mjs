// Pin for pipeline.opus-critic-only-batched-for-architecture-and-security (AC-222).
// Reads the real canon/route files and calls the real dispatch-policy module; no mocks.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { dispatchFindings } from "../dispatch-policy.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const read = (p) => readFileSync(resolve(root, p), "utf8");

function mp07() {
  const text = read("policies/model-policy.md");
  const start = text.indexOf("### MP-07");
  const end = text.indexOf("### MP-29");
  assert.ok(start >= 0 && end > start, "MP-07 section present");
  return text.slice(start, end);
}

test("rule 4: the plugin Critic route is the Review tier (sonnet, effort max)", () => {
  const front = read("plugins/pipeline-core/agents/critic.md").split(/\r?\n---/)[0];
  assert.match(front, /^model:\s*sonnet\s*$/m);
  assert.match(front, /^effort:\s*max\s*$/m);
});

test("rule 1: MP-07 limits the Design-tier (Opus) Critic to critical architecture or security", () => {
  const s = mp07();
  assert.match(s, /only\*\* for genuinely critical \*\*architecture\*\*/);
  assert.match(s, /\*\*security\*\*/);
  assert.match(s, /Guardrail-only changes[^.]*no longer escalate on their own/);
});

test("rules 2 and 3: MP-07 demands ONE Critic per batch and delta-only follow-ups for EVERY Critic", () => {
  const s = mp07();
  assert.match(s, /ONE overall Critic per batch of slices, never one per slice or per diff/);
  assert.match(s, /re-critic restricted to the delta diff/);
  assert.match(s, /only search surface/);
});

test("work item 2: the Critic dispatch template carries the batch scope and delta-only search surface", () => {
  const t = read("templates/prompts/critic-review.md");
  assert.match(t, /Batch scope \(MP-07\)/);
  assert.match(t, /never one Critic per slice or mini-item/);
  assert.match(t, /names only the delta from the immediately previous reviewed candidate as its search surface/);
});

test("work item 3: a plugin dispatch check admits an Opus Critic only with the batch rationale", () => {
  const base = [
    "Ruleset SHA: abc123def456",
    "Model/effort for this run: claude-opus at max",
    "Dispatch metadata: tool budget 30",
  ].join("\n");
  const withoutRationale = dispatchFindings({ subagentType: "pipeline-core:critic", prompt: base });
  const batchCodes = (r) => r.findings.filter((f) => /BATCH|OPUS|RATIONALE/i.test(f.code));
  assert.ok(batchCodes(withoutRationale).length > 0,
    "an Opus Critic dispatch without batch scope/rationale must produce a batch-rationale finding");
  const withRationale = dispatchFindings({
    subagentType: "pipeline-core:critic",
    prompt: `${base}\nBatch scope (MP-07): slices S1,S2 range a..b; rationale: critical security change`,
  });
  assert.equal(batchCodes(withRationale).length, 0);
});

test("work item 3: the template's own Opus placeholder prose with a Sonnet model does NOT fire", () => {
  const prompt = [
    "Ruleset SHA: abc123def456",
    "Model/effort for this run: claude-sonnet-5-5 at max",
    "Requested route: claude-sonnet-5-5 at max",
    "Dispatch metadata: tool budget 30",
    "- Batch scope (MP-07): S1,S2. A Design-tier (Opus) Critic is used only for genuinely critical architecture or security; every other review uses the review-tier model (Sonnet).",
  ].join("\n");
  const r = dispatchFindings({ subagentType: "pipeline-core:critic", prompt });
  assert.equal(r.findings.filter((f) => f.code === "DISPATCH-OPUS-NO-BATCH-RATIONALE").length, 0);
});

test("work item 3: an Opus choice on the Requested route line also fires without rationale", () => {
  const prompt = "Ruleset SHA: abc123def456\n- Requested route: claude-opus-5 at max\nDispatch metadata: tool budget 30";
  const r = dispatchFindings({ subagentType: "pipeline-core:critic", prompt });
  assert.ok(r.findings.some((f) => f.code === "DISPATCH-OPUS-NO-BATCH-RATIONALE"));
});
