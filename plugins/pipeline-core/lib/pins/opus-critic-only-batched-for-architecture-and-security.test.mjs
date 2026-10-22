// SPDX-License-Identifier: SUL-1.0
// Pin for pipeline.opus-critic-only-batched-for-architecture-and-security (AC-222).
// Reads the real canon/route files and calls the real dispatch-policy module; no mocks.
//
// Known limit (F4, MP-29): the Opus-rationale check reads briefing prose only, because the tool-layer
// model selector is not visible to the guard on this runtime; a tool-layer Opus override without a matching
// label line is therefore not caught by this check. Owner: Coordinator, due 2026-10-31.
// The re-critic beyond-delta check reads a search-surface FIELD (label line plus its more-indented continuation
// lines, up to the next field or a blank line) and the `<sha>..<sha>`, `<sha>...<sha>` and `<sha>^..<sha>`
// spellings. Known limits that remain (each: owner Coordinator, due 2026-10-31): (1) a flush-left wrapped
// continuation or a range after a blank line is not scanned; (2) ref-name ranges (`main..topic`, `HEAD~2..HEAD`) are
// not read, only hex SHAs; (3) SHAs compare as text (an abbreviated and a full spelling of one commit differ), and a
// caret range `X^..Y` is judged only by its tip and by a start AT the previous candidate, because X's parent cannot
// be resolved without git, so a caret range starting further back than the previous candidate passes.
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

// AC-222 correction (Critic C6g5 D2): the beyond-delta check must read the Diff field the REAL critic template
// PRODUCES. That field spreads over ~12 lines (label, enumerated SHAs, an example `git diff {{FIRST_SHA}}^..{{LAST_SHA}}`
// on a continuation line), so the cases below take the template's own field block (label line through its last
// continuation line), FILL its placeholders with real 7-hex values, and judge it against a declared delta.
// QG-04 reason for replacing the two earlier F3 cases: they appended a bare range to the template's LABEL line,
// a shape the template never produces, and so could not see a range on a continuation line or the caret spelling.
// Their coverage is kept inside the cases below (label line, upper-case label, bold label, exact-delta label line).
const templateDiffBlock = () => {
  const lines = read("templates/prompts/critic-review.md").split(/\r?\n/);
  const start = lines.findIndex((l) => l.startsWith("- Diff (the object under review):"));
  assert.ok(start >= 0, "templates/prompts/critic-review.md carries the `- Diff (the object under review):` field line");
  let end = start + 1;
  while (end < lines.length && lines[end].trim() !== "" && /^\s/.test(lines[end])) end += 1;
  return lines.slice(start, end).join("\n");
};
const PLACEHOLDER = /\{\{([A-Z_]+)[^}]*\}\}/g;
const fillDiffBlock = ({ shas, first, last }) => {
  const block = templateDiffBlock();
  const names = [...block.matchAll(PLACEHOLDER)].map((m) => m[1]);
  for (const need of ["COMMIT_SHAS", "FIRST_SHA", "LAST_SHA"]) {
    assert.ok(names.includes(need), `the template's Diff field names the ${need} placeholder (found: ${names.join(", ")})`);
  }
  const values = { COMMIT_SHAS: shas, FIRST_SHA: first, LAST_SHA: last };
  // any other placeholder the template carries (read from it, not assumed) gets a neutral, hex-free value
  const filled = block.replace(PLACEHOLDER, (_all, name) => values[name] ?? "not-applicable");
  assert.ok(!filled.includes("{{"), "every placeholder of the Diff field is filled");
  assert.ok(filled.split("\n").length > 3, "the filled field spans continuation lines, as the real template does");
  return filled;
};
const RECRITIC_HEAD = "- Re-critic (MP-07): aaaaaaa..bbbbbbb\n- Batch scope (MP-07): S1";
const rcFindings = (extra) => dispatchFindings({ subagentType: "pipeline-core:critic", prompt: `${RC_BASE}\n${RECRITIC_HEAD}\n${extra}` }).findings;
const recriticCodes = (extra) => rcFindings(extra).map((f) => f.code).filter((c) => c.startsWith("DISPATCH-RECRITIC"));
// delta aaaaaaa..bbbbbbb = (aaaaaaa, bbbbbbb]; ccccccc is its first commit, so `ccccccc^..bbbbbbb` covers exactly it.
const EQUAL_FILL = { shas: "ccccccc, bbbbbbb", first: "ccccccc", last: "bbbbbbb" };

test("rule 3 (mechanical, D2): the real template's Diff field filled with exactly the delta does NOT raise a re-critic finding", () => {
  const filled = fillDiffBlock(EQUAL_FILL);
  assert.ok(filled.includes("ccccccc^..bbbbbbb"), "the template's own caret example is filled into the continuation line");
  assert.deepEqual(recriticCodes(filled), []);
  // the label is matched case-insensitively like every other search-surface label
  assert.deepEqual(recriticCodes(filled.toUpperCase()), []);
  // the bold-label form a filled template may carry
  assert.deepEqual(recriticCodes(filled.replace("- Diff (the object under review):", "- **Diff (the object under review):**")), []);
  // the label line itself naming exactly the delta (the shape the earlier F3 case used)
  assert.deepEqual(recriticCodes(`${filled.split("\n")[0]} aaaaaaa..bbbbbbb`), []);
});

test("rule 3 (mechanical, D2): the real template's Diff field filled WIDER than the delta is flagged", () => {
  // tip beyond the delta: the range sits only on a continuation line, in the caret spelling
  const beyondTip = fillDiffBlock({ shas: "ccccccc, ddddddd", first: "ccccccc", last: "ddddddd" });
  const f = rcFindings(beyondTip).find((x) => x.code === "DISPATCH-RECRITIC-BEYOND-DELTA");
  assert.ok(f, "a caret range on a continuation line whose tip is beyond the delta is flagged");
  assert.ok(f.why.includes("ccccccc^..ddddddd"), f.why);
  // start AT the previous reviewed candidate: `aaaaaaa^..bbbbbbb` re-includes an already reviewed commit
  assert.ok(recriticCodes(fillDiffBlock({ shas: "aaaaaaa, bbbbbbb", first: "aaaaaaa", last: "bbbbbbb" })).includes("DISPATCH-RECRITIC-BEYOND-DELTA"));
  // a bare `..` / `...` range on a continuation line of the filled field
  assert.ok(recriticCodes(`${fillDiffBlock(EQUAL_FILL)}\n  also 1234567..bbbbbbb`).includes("DISPATCH-RECRITIC-BEYOND-DELTA"));
  assert.ok(recriticCodes(`${fillDiffBlock(EQUAL_FILL)}\n  also 1234567...bbbbbbb`).includes("DISPATCH-RECRITIC-BEYOND-DELTA"));
  // the label-line shapes the earlier F3 case covered: plain, upper-case and bold label with a wider range
  const label = fillDiffBlock(EQUAL_FILL).split("\n")[0];
  assert.ok(recriticCodes(`${label} 1234567..bbbbbbb`).includes("DISPATCH-RECRITIC-BEYOND-DELTA"));
  assert.ok(recriticCodes(`${label.toUpperCase()} 1234567..bbbbbbb`).includes("DISPATCH-RECRITIC-BEYOND-DELTA"));
  assert.ok(recriticCodes("- **Diff (the object under review):** 1234567..bbbbbbb").includes("DISPATCH-RECRITIC-BEYOND-DELTA"));
});

test("rule 3 (mechanical, D2): the search-surface field ends at the next field or a blank line", () => {
  const filled = fillDiffBlock(EQUAL_FILL);
  // the next top-level field of the real template follows the Diff field: a range there is not a search surface
  assert.deepEqual(recriticCodes(`${filled}\n- Correction input bindings: 1234567..eeeeeee`), []);
  // a blank line closes the field, even before an indented line
  assert.deepEqual(recriticCodes(`${filled}\n\n  1234567..eeeeeee`), []);
  // a flush-left line closes it too (known limit 1: a flush-left wrapped continuation is not scanned)
  assert.deepEqual(recriticCodes(`${filled}\n1234567..eeeeeee`), []);
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
