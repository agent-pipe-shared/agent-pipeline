// Pin for pipeline.opus-critic-only-batched-for-architecture-and-security (AC-222).
// Reads the real canon/route files and calls the real dispatch-policy module; no mocks.
//
// Known limit (F4, MP-29): the Opus-rationale check reads briefing prose only, because the tool-layer
// model selector is not visible to the guard on this runtime; a tool-layer Opus override without a matching
// label line is therefore not caught by this check. Owner: Coordinator, due 2026-10-31.
// Known limits of the re-critic beyond-delta check (F3): it is line-oriented (a range on a continuation line
// of a search-surface field is not scanned), and it matches only `<sha>..<sha>` / `<sha>...<sha>` ranges, so a
// `sha^..sha` form is not matched.
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

const RC_BASE = ["Ruleset SHA: abc123def456", "Model/effort for this run: claude-sonnet-5-5 at max", "Dispatch metadata: tool budget 30"].join("\n");
const rc = (extra) => dispatchFindings({ subagentType: "pipeline-core:critic", prompt: `${RC_BASE}\n${extra}` }).findings.map((f) => f.code);

test("rule 3 (mechanical): a declared re-critic needs Batch scope and exactly one delta range", () => {
  const ok = "- Re-critic (MP-07): delta aaaaaaa..bbbbbbb\n- Batch scope (MP-07): S1,S2 range 1234567..bbbbbbb\n- Search surface: aaaaaaa..bbbbbbb";
  assert.deepEqual(rc(ok).filter((c) => c.startsWith("DISPATCH-RECRITIC")), []);
  assert.ok(rc("- Re-critic (MP-07): delta aaaaaaa..bbbbbbb").includes("DISPATCH-RECRITIC-NO-BATCH-SCOPE"));
  assert.ok(rc("- Re-critic (MP-07): since the last review\n- Batch scope (MP-07): S1").includes("DISPATCH-RECRITIC-NO-DELTA-RANGE"));
});

test("rule 3 (mechanical): a re-critic naming more than the delta is flagged; ordinal above four is refused", () => {
  const wide = "- Re-critic (MP-07): delta aaaaaaa..bbbbbbb\n- Batch scope (MP-07): S1\nDIFF RANGE: 1234567..bbbbbbb";
  assert.ok(rc(wide).includes("DISPATCH-RECRITIC-BEYOND-DELTA"));
  const fifth = "- Re-critic (MP-07): delta aaaaaaa..bbbbbbb\n- Batch scope (MP-07): S1\n- Review ordinal: 5";
  assert.ok(rc(fifth).includes("DISPATCH-RECRITIC-ORDINAL"));
  assert.ok(!rc(fifth.replace("5", "4")).includes("DISPATCH-RECRITIC-ORDINAL"));
});

// F3: bind the beyond-delta check to the label the REAL critic template uses for the search-surface field.
const TEMPLATE_DIFF_LINE = () => {
  const line = read("templates/prompts/critic-review.md").split(/\r?\n/).find((l) => l.startsWith("- Diff (the object under review):"));
  assert.ok(line, "templates/prompts/critic-review.md carries the `- Diff (the object under review):` field line");
  return line;
};
const RECRITIC_HEAD = "- Re-critic (MP-07): aaaaaaa..bbbbbbb\n- Batch scope (MP-07): S1";

test("rule 3 (mechanical, F3): a wider range on the real template's `Diff (the object under review)` line is flagged", () => {
  const line = TEMPLATE_DIFF_LINE();
  assert.ok(rc(`${RECRITIC_HEAD}\n${line} 1234567..bbbbbbb`).includes("DISPATCH-RECRITIC-BEYOND-DELTA"));
  // the label is matched case-insensitively like every other search-surface label
  assert.ok(rc(`${RECRITIC_HEAD}\n${line.toUpperCase()} 1234567..bbbbbbb`).includes("DISPATCH-RECRITIC-BEYOND-DELTA"));
  // the bold-label form a filled template may carry
  assert.ok(rc(`${RECRITIC_HEAD}\n- **Diff (the object under review):** 1234567..bbbbbbb`).includes("DISPATCH-RECRITIC-BEYOND-DELTA"));
});

test("rule 3 (mechanical, F3): the same template line naming exactly the delta does NOT raise the beyond-delta finding", () => {
  const line = TEMPLATE_DIFF_LINE();
  assert.ok(!rc(`${RECRITIC_HEAD}\n${line} aaaaaaa..bbbbbbb`).includes("DISPATCH-RECRITIC-BEYOND-DELTA"));
  assert.deepEqual(rc(`${RECRITIC_HEAD}\n${line} aaaaaaa..bbbbbbb`).filter((c) => c.startsWith("DISPATCH-RECRITIC")), []);
});

test("rule 3 (mechanical): a non-declared full Critic prompt is not judged as a re-critic", () => {
  assert.deepEqual(rc("DIFF RANGE: 1234567..bbbbbbb").filter((c) => c.startsWith("DISPATCH-RECRITIC")), []);
});

test("MP-07 German reference half states one full review plus at most three delta reviews", () => {
  const text = read("policies/model-policy.md");
  const de = text.slice(text.indexOf("DE-REFERENCE-BELOW"));
  const start = de.indexOf("### MP-07");
  const sec = de.slice(start, de.indexOf("### MP-29", start));
  assert.ok(start >= 0);
  assert.match(sec, /höchstens drei Delta-Reviews/);
  assert.doesNotMatch(sec, /höchstens ein Delta-Review/);
  assert.match(mp07(), /at most three correction-diff re-critics/);
});

test("item (e): the Mechanic tier is installed as Haiku at effort medium in agent, authority and runner mapping", () => {
  const front = read("plugins/pipeline-core/agents/goldfish-mechanic.md").split(/\r?\n---/)[0];
  assert.match(front, /^model:\s*haiku\s*$/m);
  assert.match(front, /^effort:\s*medium\s*$/m);
  const authority = JSON.parse(read("plugins/pipeline-core/config/routing-authority.json"));
  assert.deepEqual(authority.agentAssignments["plugins/pipeline-core/agents/goldfish-mechanic.md"], { capability: "mechanic", effort: "medium" });
  assert.deepEqual(authority.directDefaults.claude.duties.mechanic, { capability: "mechanic", effort: "medium" });
  const claude = JSON.parse(read("plugins/pipeline-core/config/runner-mappings.json")).runners.claude;
  assert.equal(claude.capabilities.mechanic, "haiku");
  assert.equal(claude.directSelectors.mechanic.value, "haiku");
  assert.match(read("policies/model-policy.md"), /^\| `models\.mechanic`\s*\| Goldfish \(Mechanic\)\s*\| haiku\s*\| medium\s*\|$/m);
});

test("work item 3: an Opus choice on the Requested route line also fires without rationale", () => {
  const prompt = "Ruleset SHA: abc123def456\n- Requested route: claude-opus-5 at max\nDispatch metadata: tool budget 30";
  const r = dispatchFindings({ subagentType: "pipeline-core:critic", prompt });
  assert.ok(r.findings.some((f) => f.code === "DISPATCH-OPUS-NO-BATCH-RATIONALE"));
});
