import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync, appendFileSync } from "node:fs";
import { spawn } from "node:child_process";

const EV = "evidence/CRITIC-RULE-2b-20261009";
mkdirSync(EV, { recursive: true });
const phases = process.argv.slice(2);
const MARKER = "DE-REFERENCE-BELOW";

// ------------------------------------------------------------- canonical wording
const OLD_Q = "Every architecture/guardrail/security diff runs with the Critic on the higher-capability tier in ONE fresh independently briefed, contractually read-only session subagent with a JSON-schema-shaped verdict and the literal assurance `functional-equivalent-read-only; OS isolation not asserted`. This session lane is the autonomous default. Selected-runner native isolation is an optional explicitly configured or requested escalation, not a prerequisite for the ordinary Critic and not a Pipeline PO gate. Rigor level 2 makes the Critic mandatory (default: the review-tier model); escalation to the higher-capability tier applies there only when, in addition, the risk class is high OR an architecture/guardrail/security diff is present.";
const NEW_Q = "Every architecture/guardrail/security diff gets the Critic in ONE fresh independently briefed, contractually read-only session subagent with a JSON-schema-shaped verdict and the literal assurance `functional-equivalent-read-only; OS isolation not asserted`, on the review-tier model (the Critic agent's own Sonnet route); the higher-capability tier is used only for a genuinely critical architecture or security change, as ONE batched Critic over a larger batch of slices (never one per slice or per diff), and every later review of that batch is a re-critic restricted to the delta diff since the reviewed candidate. This session lane is the autonomous default. Selected-runner native isolation is an optional explicitly configured or requested escalation, not a prerequisite for the ordinary Critic and not a Pipeline PO gate. Rigor level 2 makes the Critic mandatory (default: the review-tier model); escalation to the higher-capability tier applies there only for a genuinely critical architecture or security change, reviewed once per batch.";
const QUOTE = { o: "> \"" + OLD_Q + "\"", n: "> \"" + NEW_Q + "\"" };

const CRITIC_REVIEW = [
  { o: "Class-mittel\n   diffs dispatch the review-tier model FIRST, escalating to a higher-capability\n   model only on a finding ≥ major, a discovered A/G/S touch, or a contested\n   verdict (never a higher-capability first pass for a non-A/G/S class-mittel\n   diff); class-niedrig",
    n: "Class-mittel\n   diffs dispatch the review-tier model (a finding ≥ major, a discovered A/G/S\n   touch or a contested verdict gets a fresh review-tier re-review, never a\n   per-diff higher-capability escalation); class-niedrig" },
  { o: "ARCHITECTURE, GUARDRAIL, or SECURITY diffs = the\n   higher-capability review model at max MANDATORY in the default\n   functional-equivalent session lane: ONE fresh independently\n   briefed,",
    n: "ARCHITECTURE, GUARDRAIL, or SECURITY diffs = a Critic\n   MANDATORY on the Critic agent's own review-tier route (Sonnet) in the default\n   functional-equivalent session lane; the higher-capability tier (Opus) ONLY\n   for genuinely critical architecture or security, as ONE batched Critic per\n   larger batch with later reviews as delta-diff re-critics (MP-07): ONE fresh independently\n   briefed," },
  { o: "T1 uses\n   the same fresh session lane on the higher-capability tier.",
    n: "T1 uses\n   the same fresh session lane (route per MP-07: review tier; the higher-capability\n   tier only for the one batched critical architecture/security Critic)." },
  { o: "\"guardrail diff → higher-capability review model at max in the standing fresh session functional-equivalent lane\" or \"standard → review-tier model at max\" or \"class-mittel cascade → review-tier model at max first, escalate to the higher-capability review model only on major finding / A-G-S touch / contested verdict\"",
    n: "\"genuinely critical architecture or security change, ONE batched Critic → higher-capability review model at max in the standing fresh session functional-equivalent lane\" or \"standard (including a guardrail diff that is not security-critical) → review-tier model at max\" or \"class-mittel → review-tier model at max (no per-diff escalation)\"" },
  { o: "declares an ARCHITECTURE,\nGUARDRAIL or SECURITY subject — the three classes for which MP-07 makes the\nhigher-capability route",
    n: "declares a genuinely critical ARCHITECTURE\nor SECURITY batch — the case for which MP-07 makes the\nhigher-capability route" },
];
const GOLDFISH_TASK = [
  { o: "escalating guardrail/architecture/security work to the design tier with a stated rationale.",
    n: "escalating work to the design tier with a stated MP-05 rationale (a Critic escalates only as the one batched critical architecture/security review of MP-07)." },
];

const EDITS = {
  "harness/review-protocol.md": [
    { o: "| MANDATORY | the higher-capability model | fresh functional-equivalent read-only session Critic; runner-native isolation is an optional explicit escalation |",
      n: "| MANDATORY | the review-tier model (Sonnet route); the higher-capability model ONLY for a genuinely critical architecture or security change — ONE batched Critic per larger batch, later reviews as delta-diff re-critics (MP-07) | fresh functional-equivalent read-only session Critic; runner-native isolation is an optional explicit escalation |" },
    { o: "| MANDATORY | the higher-capability model | read-only subagent (Elephant may still choose runner-native isolation) |",
      n: "| MANDATORY | the review-tier model; the higher-capability model only under MP-07's batched critical architecture/security rule, never for risk class alone | read-only subagent (Elephant may still choose runner-native isolation) |" },
    { o: "the review-tier model FIRST — escalate to the higher-capability model ONLY on (a) a finding ≥ major, (b) an A/G/S touch discovered during review, or (c) a contested/contradictory verdict (T6). The higher-capability model is never the first pass for a non-A/G/S rigor-2 diff.",
      n: "the review-tier model; no per-diff escalation — the higher-capability model only for a genuinely critical architecture or security change, ONE batched Critic per larger batch with delta-diff re-critics (MP-07). A finding ≥ major, a discovered A/G/S touch or a contested verdict (T6) is handled by a fresh review-tier re-review, never a per-diff higher-capability first pass." },
    { o: "the review-tier model FIRST — same cascade as T3 (escalate to the higher-capability model only on finding ≥ major / discovered A/G/S touch / contested verdict)",
      n: "the review-tier model — same rule as T3 (no per-diff higher-capability escalation; MP-07's batched rule only)" },
    { o: "| a higher-capability-model second opinion |",
      n: "| a fresh review-tier second opinion (a higher-capability model only if the subject is genuinely critical architecture or security, batched per MP-07) |" },
    { o: "high + A/G/S additionally keeps T1's higher-capability-model and runner-native-isolation-or-functional-equivalent requirement unchanged.",
      n: "high + A/G/S additionally keeps T1's runner-native-isolation-or-functional-equivalent requirement unchanged (the higher-capability tier only under MP-07's batched critical architecture/security rule)." },
    QUOTE,
    { o: "applied trigger row + \"criticality → model\" (MP-07), ruleset SHA.",
      n: "applied trigger row + \"criticality → model\" (MP-07) + batch scope (the slice ids and the single candidate range; a re-critic names its delta range as its only search surface), ruleset SHA." },
    { o: "all mandatory triggers; T1 uses the higher-capability tier and the assurance below",
      n: "all mandatory triggers; T1 uses the assurance below (higher-capability tier only under MP-07's batched critical architecture/security rule)" },
    { o: "higher-capability route for T1;",
      n: "route per MP-07 (review tier; higher-capability only for the one batched critical architecture/security Critic);" },
  ],
  "roles/critic.md": [
    { o: "fixed candidate commit and diff; higher-capability route;",
      n: "fixed candidate commit and diff; the route MP-07 selects (review tier; higher-capability only for the one batched critical architecture/security Critic);" },
    QUOTE,
    { o: "- **The review-tier model standard; escalation to a higher-capability model MANDATORY** for architecture, guardrail and security reviews (and high risk class) — details",
      n: "- **The review-tier model (the Critic agent's own Sonnet route) is the standard; the higher-capability model ONLY for genuinely critical architecture or security changes — ONE batched Critic per larger batch, later reviews as delta-diff re-critics (PO rule 2026-10-09, Ruling 156)** — details" },
    { o: "Class-mittel diffs dispatch the review-tier model FIRST, escalating to the higher-capability model ONLY on a finding ≥ major, an A/G/S touch discovered during review, or a contested verdict — the higher-capability model is never the first pass for a non-A/G/S class-mittel diff.",
      n: "Class-mittel diffs dispatch the review-tier model; a finding ≥ major, a discovered A/G/S touch or a contested verdict gets a fresh review-tier re-review, and the higher-capability model is reserved for genuinely critical architecture or security (MP-07)." },
    { o: "T1 remains mandatory: use the higher-capability model in the standing fresh session functional-equivalent lane by default.",
      n: "T1 remains mandatory: dispatch the Critic in the standing fresh session functional-equivalent lane by default — on the review tier, or, for genuinely critical architecture or security only, as ONE batched higher-capability Critic per larger batch with later reviews as re-critics on the delta diff (MP-07)." },
    { o: "The dispatch metadata must state \"criticality → model\" (MP-07). Disputed or contradictory review-tier findings → the Elephant MAY dispatch a higher-capability-model second opinion in a fresh context (never a discussion in the same context).",
      n: "The dispatch metadata must state \"criticality → model\" (MP-07) and its batch scope (the slice ids and single candidate range; a re-critic names its delta range only). Disputed or contradictory review-tier findings → the Elephant MAY dispatch a fresh-context second opinion (review tier; the higher-capability model only for genuinely critical architecture or security under MP-07; never a discussion in the same context)." },
  ],
  "plugins/pipeline-core/skills/critic-review/SKILL.md": [
    { o: "Dispatch the default fresh functional-equivalent session Critic on the higher-capability tier.",
      n: "Dispatch the default fresh functional-equivalent session Critic on its own review-tier route (the higher-capability tier only for the one batched Critic over genuinely critical architecture or security changes, MP-07)." },
    { o: "fixed candidate commit/diff, and a higher-capability route; otherwise report a",
      n: "fixed candidate commit/diff, and the route MP-07 selects; otherwise report a" },
    QUOTE,
  ],
  "docs/adr/0003-role-implementation-subagents.md": [
    QUOTE,
    { o: "commit and diff, higher-capability route, and a JSON-schema-shaped verdict.",
      n: "commit and diff, the route the amended trigger selects (review tier; higher-capability only for the one batched critical architecture/security Critic), and a JSON-schema-shaped verdict." },
    { o: "remain optional explicit escalations.\n\n## Consequences",
      n: "remain optional explicit escalations.\n\n### Amendment — Critic tier trigger (PO decision 2026-10-09, Sprint Alfred Ruling 156)\n\nThe trigger quoted above carries the amended wording, word-identical to ADR-0014: the\nhigher-capability tier is reserved for ONE batched Critic over genuinely critical\narchitecture or security changes, later reviews are delta-diff re-critics, and every other\nCritic runs on the Critic agent's own review-tier (Sonnet) route. The decision record is the\ndated amendment in ADR-0014; the operative detail is `policies/model-policy.md` MP-07.\n\n## Consequences" },
  ],
  "docs/adr/0014-critic-contract.md": [
    { o: "revised on 2026-07-04 to require injected-context disclosure and independent freshness checks.",
      n: "revised on 2026-07-04 to require injected-context disclosure and independent freshness checks; amended on 2026-10-09 (PO decision, Sprint Alfred Ruling 156) to reserve the higher-capability Critic tier for one batched review of genuinely critical architecture or security changes." },
    { o: "Risk policy selects staffing and isolation. High-risk architecture, guardrail,\nand security changes require the configured highest review capability. The\nnormal route is the fresh, contractually read-only session Critic:",
      n: "Risk policy selects staffing and isolation. Every architecture, guardrail and\nsecurity change requires an independent Critic; the configured highest review\ncapability is reserved for genuinely critical architecture or security changes,\nreviewed once per batch (amendment of 2026-10-09 below). The normal route is the\nfresh, contractually read-only session Critic:" },
    QUOTE,
    { o: "must preserve the required capability and independence.\n\n## Consequences",
      n: "must preserve the required capability and independence.\n\n### Amendment — one batched higher-capability Critic (PO decision 2026-10-09, Sprint Alfred Ruling 156)\n\nThe Critic tier trigger above is amended. The independence, read-only, assurance, evidence and\nfinding-disposition requirements of this ADR are unchanged. Cause: one night of per-diff\nhigher-capability Critic rounds cost about 20 % of a weekly budget.\n\n1. A Critic runs on the higher-capability (Opus) tier only for genuinely critical architecture\n   changes (ADR-required decisions, core contracts, operating-model changes) or security changes\n   (secrets/credentials, auth, network exposure, history rewrites, anything that can control real\n   devices or production systems).\n2. Even then there is ONE higher-capability Critic over a larger batch of slices, never one per\n   slice or per diff; the dispatch states the batch scope and the rationale.\n3. Any later review of that batch is a re-critic restricted to the delta diff since the reviewed\n   candidate; it names the delta range as its only search surface.\n4. Every other Critic, including an architecture, guardrail or security diff that is not critical\n   in this sense, runs on the review-tier model (the Critic agent's own Sonnet route).\n   Guardrail-only changes no longer escalate on their own unless they are security-critical.\n\nThe earlier canonical wording (escalation of every architecture, guardrail or security diff, and of\nevery rigor-2 diff with a high risk class, to the higher-capability tier) is superseded; the\ncanonical wording quoted above replaces it word-identically in `harness/review-protocol.md` §2.1,\n`roles/critic.md`, `plugins/pipeline-core/skills/critic-review/SKILL.md`, ADR-0003 and this ADR.\nOperative detail: `policies/model-policy.md` MP-07 and `harness/review-protocol.md` §2.1. Backlog\nitem: `backlog/items/2026-10-09-opus-critic-only-batched-for-architecture-and-security.md`. Not part\nof this amendment: the plugin Critic route and budget checks and their test pin, which that item\ntracks.\n\n## Consequences" },
  ],
  "roles/elephant.md": [
    { o: "escalate to a higher-capability model at high risk class. EVERY architecture/guardrail/security diff, regardless of size, runs one fresh independently briefed, contractually read-only session Critic on the higher-capability tier with a JSON-schema-shaped verdict",
      n: "the higher-capability model only for genuinely critical architecture or security (ONE batched Critic per larger batch, later reviews as delta-diff re-critics, MP-07). EVERY architecture/guardrail/security diff, regardless of size, gets one fresh independently briefed, contractually read-only session Critic (review tier unless MP-07's batched critical rule applies) with a JSON-schema-shaped verdict" },
    { o: "the higher-capability-tier escalation applies there only when, additionally, the risk class is high OR an architecture/guardrail/security diff is present.",
      n: "the higher-capability-tier escalation applies there only for a genuinely critical architecture or security change, reviewed once per batch." },
  ],
  "templates/prompts/critic-review.md": CRITIC_REVIEW,
  "plugins/pipeline-core/templates/prompts/critic-review.md": CRITIC_REVIEW,
  "templates/prompts/goldfish-task.md": GOLDFISH_TASK,
  "plugins/pipeline-core/templates/prompts/goldfish-task.md": GOLDFISH_TASK,
  "policies/model-policy.md": [
    { o: "it does NOT exempt a `speed`-profile task from the MP-07 criticality triggers (architecture/guardrails/security still force Design-tier/`max` review regardless of profile).",
      n: "it does NOT exempt a `speed`-profile task from the MP-07 criticality rules (an architecture/guardrail/security diff still gets its Critic regardless of profile; the Design-tier model is used only for the one batched Critic over genuinely critical architecture or security changes)." },
    { lp: "- **Open alignment (needs an ADR amendment, not a policy edit):**",
      n: "- **Alignment (closed 2026-10-09, dispatch CRITIC-RULE-2b-20261009):** the canonical trigger wording quoted word-identically in `harness/review-protocol.md` §2.1, `roles/critic.md`, `plugins/pipeline-core/skills/critic-review/SKILL.md`, ADR-0003 and ADR-0014 now states this rule; the dated decision record is the amendment section in ADR-0014. The plugin Critic route and budget check and their test pin remain a separate open slice (`backlog/items/2026-10-09-opus-critic-only-batched-for-architecture-and-security.md`)." },
  ],
  "docs/state.md": [
    { o: "**Current 2026-10-08 eve:** START HERE",
      n: "**Decision register, 2026-10-09 (Ruling 156; ADR-0014 amendment, dispatch CRITIC-RULE-2b-20261009):** a Critic runs on the Opus tier only for genuinely critical architecture or security changes, as ONE batched Critic per larger batch; later reviews are delta-diff re-critics; every other Critic runs on the Critic agent's own Sonnet route. This supersedes the per-diff A/G/S escalation in the canonical trigger wording (ADR-0014 amendment; MP-07). Nothing PO-accepted.\n\n**Current 2026-10-08 eve:** START HERE" },
  ],
  "backlog/items/2026-10-09-opus-critic-only-batched-for-architecture-and-security.md": [
    { ap: "Canon part done (2026-10-09, dispatch CRITIC-RULE-20261009)",
      t: " UPDATE 2026-10-09 (dispatch CRITIC-RULE-2b-20261009, continuing `b90402938`): (a) and (b) are done - ADR-0014 carries the dated amendment (Ruling 156) and the canonical trigger wording is word-identical again in `harness/review-protocol.md` §2.1 (T1-T4 rows), `roles/critic.md`, `plugins/pipeline-core/skills/critic-review/SKILL.md`, ADR-0003 and ADR-0014; `roles/elephant.md`, `templates/prompts/critic-review.md`, `templates/prompts/goldfish-task.md`, their plugin template copies and `policies/model-policy.md` are aligned; commit SHA: SHA_PLACEHOLDER. STILL OPEN: (c) and (d)." },
  ],
};

// ------------------------------------------------------------------- edit engine
function applyOps(file, ops) {
  let text = readFileSync(file, "utf8");
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const adj = (s) => s.replace(/\n/g, eol);
  const results = [];
  for (const op of ops) {
    const mIdx = text.indexOf(MARKER);
    const region = mIdx >= 0 ? text.slice(0, mIdx) : text;
    if (op.o !== undefined) {
      const o = adj(op.o), n = adj(op.n);
      const parts = region.split(o).length - 1;
      if (parts === 1) { text = text.slice(0, region.indexOf(o)) + n + text.slice(region.indexOf(o) + o.length); results.push("ok"); }
      else if (parts === 0 && text.includes(n)) results.push("already-applied");
      else results.push(`FAIL(old occurs ${parts}x): ${op.o.slice(0, 70)}`);
    } else if (op.lp !== undefined) {
      const lines = text.split(eol);
      const idxs = lines.map((l, i) => [l, i]).filter(([l, i]) => l.startsWith(op.lp) && (mIdx < 0 || text.split(eol).slice(0, i).join(eol).length < mIdx)).map(([, i]) => i);
      if (idxs.length === 1) { lines[idxs[0]] = op.n; text = lines.join(eol); results.push("ok"); }
      else if (idxs.length === 0 && text.includes(op.n)) results.push("already-applied");
      else results.push(`FAIL(line prefix matches ${idxs.length}): ${op.lp.slice(0, 60)}`);
    } else if (op.ap !== undefined) {
      const lines = text.split(eol);
      const idxs = lines.map((l, i) => [l, i]).filter(([l]) => l.startsWith(op.ap)).map(([, i]) => i);
      if (idxs.length === 1 && lines[idxs[0]].includes("SHA_PLACEHOLDER")) results.push("already-applied");
      else if (idxs.length === 1) { lines[idxs[0]] = lines[idxs[0]] + op.t; text = lines.join(eol); results.push("ok"); }
      else results.push(`FAIL(append prefix matches ${idxs.length}): ${op.ap.slice(0, 60)}`);
    }
  }
  const failed = results.some((r) => r.startsWith("FAIL"));
  if (!failed && results.some((r) => r === "ok")) writeFileSync(file, text);
  return { file, written: !failed && results.some((r) => r === "ok"), results };
}

// ------------------------------------------------------------------------ sweep
const sweepRoots = ["roles", "templates", "policies", "docs/operating-model.md", "plugins/pipeline-core/skills", "harness/review-protocol.md", "docs/adr/0003-role-implementation-subagents.md", "docs/adr/0014-critic-contract.md"];
const AGS = "(architecture|guardrail|security|A\\/G\\/S|A-G-S)";
const HC = "(higher-capability|Design-tier|design tier|Opus)";
const SWEEP_RE = new RegExp(`${AGS}[^.|]{0,120}${HC}|${HC}[^.|]{0,120}${AGS}`, "i");
function walk(p, out) {
  const s = statSync(p);
  if (s.isDirectory()) { for (const e of readdirSync(p)) walk(p + "/" + e, out); } else if (p.endsWith(".md")) out.push(p);
}
function sweep(label) {
  const files = [];
  sweepRoots.forEach((r) => walk(r, files));
  const lines = [];
  let oldQuote = 0;
  for (const f of files.sort()) {
    const text = readFileSync(f, "utf8").split(/\r?\n/);
    const mk = text.findIndex((l) => l.includes(MARKER));
    text.forEach((l, i) => {
      if (mk >= 0 && i > mk) return;
      if (l.includes("Every architecture/guardrail/security diff runs with the Critic on the higher-capability tier")) oldQuote++;
      if (SWEEP_RE.test(l)) lines.push(`${f}:${i + 1}: ${l.trim().slice(0, 170)}`);
    });
  }
  const out = `${EV}/sweep.txt`;
  if (label === "before") writeFileSync(out, "");
  appendFileSync(out, `=== ${label} (A/G/S x higher-capability-tier co-occurrence lines in roles, templates, policies, docs/operating-model.md, plugins/pipeline-core/skills, harness/review-protocol.md, ADR-0003, ADR-0014; text below the DE-REFERENCE marker excluded; count ${lines.length}; lines carrying the OLD per-diff canonical quote: ${oldQuote}) ===\n${lines.join("\n")}\n\n`);
  return { label, lines: lines.length, oldQuote };
}

// ----------------------------------------------------------------------- checks
function findScript(name) {
  for (const d of ["harness/scripts", "harness", "plugins/pipeline-core/scripts", "plugins/pipeline-core/lib", "scripts"]) {
    if (existsSync(`${d}/${name}`)) return `${d}/${name}`;
  }
  return null;
}
const tail = (s) => s.split("\n").slice(-12).join("\n");
function runOne(label, rel) {
  return new Promise((res) => {
    if (!rel) return res({ label, command: null, exit: "not-found", tail: "" });
    const p = spawn(process.execPath, [rel], { cwd: process.cwd(), windowsHide: true });
    let out = "";
    const add = (d) => { out += d; if (out.length > 200000) out = out.slice(-100000); };
    p.stdout.on("data", add); p.stderr.on("data", add);
    const t = setTimeout(() => { p.kill(); res({ label, command: `node ${rel}`, exit: "timeout", tail: tail(out) }); }, 200000);
    p.on("close", (code) => { clearTimeout(t); res({ label, command: `node ${rel}`, exit: code, tail: tail(out) }); });
    p.on("error", (e) => { clearTimeout(t); res({ label, command: `node ${rel}`, exit: "spawn-error", tail: String(e) }); });
  });
}
async function checks(label) {
  const list = [
    "check-adr-consistency.mjs", "check-critic-contract-citations.mjs", "check-critic-contract-citations.test.mjs",
    "check-critic-fail-closed.mjs", "check-language-canon.mjs", "check-section-citations.mjs", "check-reference-paths.mjs",
    "check-doc-contracts.mjs", "generate-elephant-role-prohibitions.test.mjs", "generate-vendored-canon.test.mjs",
    "check-vendored-template-sync.mjs", "check-vendored-template-sync.test.mjs",
  ];
  const queue = list.map((n) => [n, findScript(n)]);
  const results = [];
  const worker = async () => { while (queue.length) { const [n, rel] = queue.shift(); results.push(await runOne(n, rel)); } };
  await Promise.all([worker(), worker(), worker(), worker()]);
  results.sort((a, b) => a.label.localeCompare(b.label));
  writeFileSync(`${EV}/checks-${label}.json`, JSON.stringify({ schema: "crit-rule-2b.checks.v1", phase: label, results }, null, 2));
  return results.map((r) => `${r.label}: exit ${r.exit}`);
}

// ------------------------------------------------------------------------- main
const summary = {};
if (phases.includes("before")) { summary.sweepBefore = sweep("before"); summary.checksBefore = await checks("before"); }
if (phases.includes("edit")) {
  summary.edits = Object.entries(EDITS).map(([f, ops]) => applyOps(f, ops));
  writeFileSync(`${EV}/edits.json`, JSON.stringify(summary.edits, null, 2));
}
if (phases.includes("after")) { summary.sweepAfter = sweep("after"); summary.checksAfter = await checks("after"); }
console.log(JSON.stringify(summary, null, 1));
