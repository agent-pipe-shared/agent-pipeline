// SPDX-License-Identifier: SUL-1.0
/**
 * Fills the Critic template from a packet-ready preflight result (PO tile 2026-11-10: one command prepares the Critic dispatch
 * including its briefing). Two greenfield runs on 2026-11-10 hand-wrote their Critic prompts: one dropped the correction input
 * bindings and resumed the Critic with a message naming the earlier round's outcome, which made it withhold its verdict.
 *
 * Rules this module keeps:
 * - The template is read at run time (templates/prompts/critic-review.md); no template text lives here. A missing marker, or a
 *   placeholder this module does not know, refuses with a code instead of passing an unfilled template on.
 * - Only the reviewer projection is used: the reviewer input (or a split entry's reviewer input), the correction input bindings
 *   path, the review ordinal, the trigger and the generated MP-07 lines. Never the admit request, the packet id, coordinator-only
 *   material, a prior Critic path or the delta request path.
 * - Values only the dispatcher knows stay `<FILL NAME: hint>` and are listed, the same way the admit request lists its placeholders.
 * - Antigravity gets the template's paths-only envelope with absolute paths (PO tile 2026-11-10), never the body.
 */
import { posix } from "node:path";
import { criticToolBudget } from "./critic-split.mjs";
import { stampCriticBriefing, verifyCriticBriefing } from "./briefing-file-reference.mjs";

export const CRITIC_BRIEFING_SCHEMA = "pipeline.critic-briefing.v1";
const COPY_MARKER = "COPY EVERYTHING BELOW THIS LINE\n-->\n";
const COORDINATOR_HEADING = "\n## Generic exact-range batch registration (Coordinator only)";
const ENVELOPE_START = "<!-- AGY-CRITIC-PROMPT-ENVELOPE:START -->";
const ENVELOPE_END = "<!-- AGY-CRITIC-PROMPT-ENVELOPE:END -->";
const PLACEHOLDER = /\{\{([A-Z0-9_]+)(?:\|[^}]*)?(?:[ :][^}]*)?\}\}/gsu;

export class CriticBriefingError extends Error {
  constructor(code, message) { super(`${code}: ${message}`); this.code = code; }
}
const refuse = (code, message) => { throw new CriticBriefingError(code, message); };
const fill = (name, hint) => `<FILL ${name}: ${hint}>`;

/** The body a Critic receives: everything after the copy marker, without the Coordinator-only section at the end. */
export function criticTemplateBody(templateText) {
  const text = String(templateText ?? "").replace(/\r\n/gu, "\n");
  const start = text.indexOf(COPY_MARKER);
  if (start < 0) refuse("CBB-TEMPLATE-MARKER", "the Critic template has no copy marker; the template changed shape, repair the builder before dispatching");
  const end = text.indexOf(COORDINATOR_HEADING, start);
  if (end < 0) refuse("CBB-TEMPLATE-MARKER", "the Critic template has no Coordinator-only section heading; the cut would hand Coordinator material to the Critic");
  return text.slice(start + COPY_MARKER.length, end).replace(/^\n+/u, "");
}

/** The Antigravity envelope lines between its markers, without the code fence and indentation. */
export function criticTemplateEnvelope(templateText) {
  const text = String(templateText ?? "").replace(/\r\n/gu, "\n");
  const start = text.indexOf(ENVELOPE_START), end = text.indexOf(ENVELOPE_END);
  if (start < 0 || end < start) refuse("CBB-TEMPLATE-MARKER", "the Critic template has no Antigravity envelope markers");
  const lines = text.slice(start + ENVELOPE_START.length, end).split("\n").map((line) => line.trim()).filter((line) => line !== "" && !line.startsWith("```"));
  if (lines.length === 0) refuse("CBB-TEMPLATE-MARKER", "the Antigravity envelope is empty");
  return lines;
}

function reviewFacts(preflight, entry) {
  const input = entry?.reviewerInput ?? preflight?.dispatch?.reviewerInput;
  if (input === null || typeof input !== "object") refuse("CBB-PREFLIGHT-SHAPE", "the preflight result carries no reviewer input");
  for (const key of ["baseCommit", "candidateCommit", "rulesetSha", "specPath"]) {
    if (typeof input[key] !== "string" || input[key] === "") refuse("CBB-PREFLIGHT-SHAPE", `the reviewer input has no ${key}`);
  }
  return {
    base: input.baseCommit, candidate: input.candidateCommit, rulesetSha: input.rulesetSha, spec: input.specPath,
    guardrails: [...(input.governanceConstraintPaths ?? []), ...(input.guardrailPaths ?? [])],
    evidence: [...(input.evidencePaths ?? [])],
  };
}

const ordinalOf = (preflight) => {
  const round = preflight?.coordinatorOnly?.courseAdmission?.round;
  return Number.isInteger(round) && round >= 2 ? round : null;
};

/**
 * Renders the Critic briefing(s). Input:
 * - preflight: the packet-ready preflight result (printed form, with split / criticDispatchPromptLines when present)
 * - templateText: the text of templates/prompts/critic-review.md
 * - commits: the enumerated commit ids of the reviewed range, oldest first
 * - bindingsPath: repository-relative path of the written correction input bindings file, or null
 * - runner: "claude" | "codex" | "antigravity" | "unknown"; root: absolute repository root (used for Antigravity only)
 * - projectName: the project name for the confirmation line
 * Returns { schema, briefings: [{ entryId, text, placeholders }] }.
 */
export function renderCriticBriefings({ preflight, templateText, commits, bindingsPath = null, runner = "claude", root = null, projectName, reviewPaths = null }) {
  if (preflight?.status !== "packet-ready") refuse("CBB-PREFLIGHT-SHAPE", "a briefing is built only from a packet-ready preflight result");
  if (!Array.isArray(commits) || commits.length === 0 || commits.some((sha) => !/^[a-f0-9]{40,64}$/u.test(sha))) refuse("CBB-COMMITS", "the enumerated commit list is empty or malformed");
  const entries = Array.isArray(preflight.split?.entries) && preflight.split.entries.length > 0 ? preflight.split.entries : [null];
  const ordinal = ordinalOf(preflight);
  const trigger = typeof preflight.admitRequest?.trigger === "string" ? preflight.admitRequest.trigger : "T1";
  const promptLines = Array.isArray(preflight.criticDispatchPromptLines) ? preflight.criticDispatchPromptLines : null;
  const briefings = entries.map((entry) => {
    const facts = reviewFacts(preflight, entry);
    if (facts.candidate !== commits[commits.length - 1]) refuse("CBB-COMMITS", "the enumerated commits do not end at the reviewed candidate");
    const rendered = runner === "antigravity"
      ? renderEnvelope({ templateText, facts, commits, bindingsPath, trigger, root, entry })
      : renderBody({ templateText, facts, commits, bindingsPath, ordinal, promptLines, projectName, entry, runner, reviewPaths });
    // C28-CRITIC-TOIL: a range whose preflight bound correction input bindings (retained results, state or history files are in it) never gets a briefing that says "not applicable":
    // that Critic stops on missing bindings and a fresh one is spent. The caller derives them (prepare-dispatch.mjs does) or the briefing is refused here, after the template checks.
    if (bindingsPath === null && preflight.correctionInputBindings !== undefined && preflight.correctionInputBindings !== null) {
      refuse("CBB-BINDINGS-MISSING", "the preflight bound correction input bindings for this range (excluded paths are in it), but no bindings path was given; derive them (prepare-dispatch.mjs critic does) and pass the path");
    }
    return rendered;
  });
  return { schema: CRITIC_BRIEFING_SCHEMA, briefings };
}

function renderBody({ templateText, facts, commits, bindingsPath, ordinal, promptLines, projectName, entry, runner, reviewPaths }) {
  const placeholders = [];
  const open = (name, hint) => { placeholders.push(name); return fill(name, hint); };
  const scope = entry?.batchScopeLine ?? promptLines?.[0] ?? `Batch scope (MP-07): the reviewed range ${facts.base.slice(0, 12)}..${facts.candidate.slice(0, 12)}, one batch.`;
  // C28-CRITIC-TOIL: the paths this Critic reads are the part's own, or the range's reviewable ones the preflight printed; both come without any path the bindings exclude, and the diff
  // command names them as literal pathspecs (critic-review.md: exact literal source pathspecs, external diff and text conversion off), so the range diff never carries an excluded file.
  const paths = entry ? (entry.reviewerInput?.changedPaths ?? entry.paths ?? []) : (Array.isArray(reviewPaths) && reviewPaths.length > 0 ? reviewPaths : null);
  const diffCommand = paths === null || paths.length === 0 ? "" : `\n- Diff command: \`git diff --no-textconv --no-ext-diff ${facts.base} ${facts.candidate} -- ${paths.join(" ")}\``;
  const scopeValue = scope.replace(/^Batch scope \(MP-07\):\s*/u, "")
    + (entry ? ` Paths of this part: ${paths.map((path) => `\`${path}\``).join(", ")}. Begin trajectory_evidence with "${entry.scopeMarker} ".` : (paths === null ? "" : ` Paths of this range: ${paths.map((path) => `\`${path}\``).join(", ")}.`))
    + diffCommand;
  const rationale = promptLines?.[1] ?? null;
  const list = (paths, none) => (paths.length === 0 ? none : paths.map((path) => `\`${path}\``).join(", "));
  const values = {
    SPEC_PATH: facts.spec,
    COMMIT_SHAS: commits.join(", "),
    FIRST_SHA: commits[0],
    LAST_SHA: commits[commits.length - 1],
    REVIEWED_DIFF_SNAPSHOT_PATH: "not applicable (committed range)",
    CORRECTION_INPUT_BINDINGS_PATH_OR_NOT_APPLICABLE: bindingsPath ?? "not applicable",
    DISPATCH_LIST_PATH: "none (no stripped dispatch record is among the evidence paths)",
    GUARDRAILS_PATHS: list(facts.guardrails, "none named for this review"),
    EVIDENCE_PATHS: list(facts.evidence, "none"),
    CLAIMS_EVIDENCE_PATH: "none beyond the evidence artifacts above",
    RULESET_SHA: facts.rulesetSha,
    CRITICALITY_MODEL: rationale === null ? "standard → review-tier model" : "genuinely critical architecture or security change, ONE batched Critic → higher-capability review model",
    BATCH_SCOPE: scopeValue,
    MODEL_ID: open("MODEL_ID", "the concrete model id the dispatch call passes as model"),
    EFFORT: open("EFFORT", "the effort the dispatch call requests"),
    T1_ASSURANCE: runner === "codex" ? open("T1_ASSURANCE", "the Codex Critic lane and its assurance") : "functional-equivalent-read-only; OS isolation not asserted",
    // The base cap follows the path count (PO decision 2026-11-10), never above the working cap of the shipped Critic definition; without a count the template default stays.
    TOOL_BUDGET: paths === null ? "≤30 tool uses" : `≤${criticToolBudget(paths.length)} tool uses`,
    PROJECT_NAME: projectName,
    CALIBRATION_FILE: "n/a",
    AC_IDS: "all in the spec",
    RISK_ZONES: "per calibration",
    VERDICT_REQUESTED: "yes — pass/fail required",
  };
  let text = criticTemplateBody(templateText);
  // Whole-line placeholders: the re-critic pair for a correction round, nothing for a full review; the Advisor line only on demand.
  const lineOf = (name) => new RegExp(`^- \\{\\{${name}:[^}]*\\}\\}\\n`, "mu");
  for (const name of ["RECRITIC_LINE", "REVIEW_ORDINAL_LINE", "ADVISOR_DEMAND_LINE"]) {
    if (!lineOf(name).test(text)) refuse("CBB-TEMPLATE-MARKER", `the template has no ${name} line`);
  }
  text = text.replace(lineOf("RECRITIC_LINE"), ordinal === null ? "" : `- Re-critic (MP-07): ${facts.base}..${facts.candidate}\n`);
  text = text.replace(lineOf("REVIEW_ORDINAL_LINE"), ordinal === null ? "" : `- Review ordinal: ${ordinal}\n`);
  text = text.replace(lineOf("ADVISOR_DEMAND_LINE"), "");
  text = text.replace(PLACEHOLDER, (whole, name) => {
    if (!Object.hasOwn(values, name)) refuse("CBB-TEMPLATE-PLACEHOLDER", `the template holds a placeholder this builder does not know: ${name}`);
    return values[name];
  });
  if (rationale !== null) text = text.replace(/^(- Batch scope \(MP-07\): .*)$/mu, `$1\n- ${rationale}`);
  if (/\{\{/u.test(text)) refuse("CBB-TEMPLATE-PLACEHOLDER", "an unfilled placeholder is left in the briefing");
  return { entryId: entry?.id ?? null, text, placeholders };
}

// C30D-G3: the fill step. A generated Claude Critic briefing holds `<FILL NAME: hint>` slots; this turns it into the FINAL file a pointer prompt names.
// Only a closed table of slots takes a value, and every value is a fixed-vocabulary token (never prose); the bytes outside the slots are copied unchanged.
// A slot of another carrier (Codex T1_ASSURANCE, the Antigravity MODEL row) is refused: those carriers hand over the full text.
const FILL_SLOT = /<FILL ([A-Z0-9_]+): [^>\n]*>/gu;
const FILL_EFFORTS = Object.freeze(["low", "medium", "high", "xhigh", "max"]);
export const CRITIC_FILL_VOCABULARY = Object.freeze({
  MODEL_ID: (value) => /^[A-Za-z0-9][A-Za-z0-9._-]{1,79}$/u.test(value) && !/^inherit$/iu.test(value),
  EFFORT: (value) => FILL_EFFORTS.includes(value),
});
// The same template markers guard-dispatch's shape check reads (promptTemplateShapeWarning): a text without them is not a generated Critic briefing.
const FILL_BODY_MARKERS = Object.freeze(["Fail-closed reference boundary", "## Phase A", "## Phase B"]);

/**
 * `values` is a Map of slot name to value. Returns `{ text, body, slots }` (`text` = the body plus the Critic marker line) or throws a
 * CriticBriefingError: CBB-FILL-SHAPE, CBB-FILL-UNSUPPORTED-SLOT, CBB-FILL-UNKNOWN-SLOT, CBB-FILL-OPEN-SLOT, CBB-FILL-VALUE.
 */
export function fillCriticBriefing({ text, values }) {
  if (typeof text !== "string" || /pipeline-(?:critic-)?briefing-generator:/u.test(text) || /\{\{/u.test(text)) {
    refuse("CBB-FILL-SHAPE", "the draft is not an unfilled generated Critic briefing (it is empty, already carries a generator marker, or holds a template placeholder)");
  }
  const slots = [...new Set([...text.matchAll(FILL_SLOT)].map((match) => match[1]))];
  const unsupported = slots.filter((name) => !Object.hasOwn(CRITIC_FILL_VOCABULARY, name));
  if (unsupported.length > 0) refuse("CBB-FILL-UNSUPPORTED-SLOT", `the draft has slot(s) ${unsupported.join(", ")} that the pointer route does not fill: the Antigravity and Codex carriers still carry the full briefing text`);
  if (/<FILL\b/u.test(text.replace(FILL_SLOT, ""))) refuse("CBB-FILL-SHAPE", "the draft holds a <FILL ...> slot of an unknown shape");
  const missingMarkers = FILL_BODY_MARKERS.filter((marker) => !text.includes(marker));
  if (missingMarkers.length > 0) refuse("CBB-FILL-SHAPE", `the draft is not template-shaped (missing: ${missingMarkers.join("; ")}); it must be the file prepare-dispatch.mjs critic wrote`);
  for (const name of values.keys()) if (!slots.includes(name)) refuse("CBB-FILL-UNKNOWN-SLOT", `${name} is not a slot of this draft (its slots: ${slots.join(", ") || "none"}); a value that belongs to no slot is never placed anywhere`);
  for (const name of slots) {
    if (!values.has(name)) refuse("CBB-FILL-OPEN-SLOT", `slot ${name} has no value; pass --fill ${name}=<value> for every slot (${slots.join(", ")})`);
    if (!CRITIC_FILL_VOCABULARY[name](values.get(name))) refuse("CBB-FILL-VALUE", `the value for ${name} is outside its fixed vocabulary (${name === "EFFORT" ? FILL_EFFORTS.join(", ") : "one token of letters, digits, dot, underscore and hyphen, never the word inherit"})`);
  }
  const body = text.replace(FILL_SLOT, (whole, name) => values.get(name));
  const final = stampCriticBriefing(body);
  return { text: final, body: verifyCriticBriefing(final).body, slots };
}

function renderEnvelope({ templateText, facts, commits, bindingsPath, trigger, root, entry }) {
  if (typeof root !== "string" || !posix.isAbsolute(root.replace(/\\/gu, "/")) && !/^[A-Za-z]:[\\/]/u.test(root)) refuse("CBB-ROOT", "an Antigravity envelope needs the absolute repository root");
  const abs = (path) => `${root.replace(/[\\/]+$/u, "")}/${path}`;
  const placeholders = [];
  const lines = [];
  for (const line of criticTemplateEnvelope(templateText)) {
    const name = /\{\{([A-Z0-9_]+)\}\}/u.exec(line)?.[1] ?? null;
    if (name === null) { lines.push(line); continue; }
    if (name === "SPEC_PATH") lines.push(line.replace(`{{${name}}}`, abs(facts.spec)));
    else if (name === "COMMIT_SHA") for (const sha of commits) lines.push(line.replace(`{{${name}}}`, sha));
    else if (name === "GUARDRAIL_PATH") for (const path of facts.guardrails) lines.push(line.replace(`{{${name}}}`, abs(path)));
    // The correction input bindings travel as an evidence row: the envelope has no row of its own for them.
    else if (name === "EVIDENCE_PATH") for (const path of [...facts.evidence, ...(bindingsPath === null ? [] : [bindingsPath])]) lines.push(line.replace(`{{${name}}}`, abs(path)));
    else if (name === "TRIGGER_ROW") lines.push(line.replace(`{{${name}}}`, trigger));
    else if (name === "RULESET_SHA") lines.push(line.replace(`{{${name}}}`, facts.rulesetSha));
    else if (name === "MODEL") { placeholders.push("MODEL"); lines.push(line.replace(`{{${name}}}`, fill("MODEL", "the concrete model id this session runs on (the Critic inherits it); never the word inherit, and the call itself passes no Model"))); }
    // C29e T5: one part of a split review names its scope marker; the template tells the Critic to begin trajectory_evidence with it. A whole-range review has no row.
    else if (name === "SCOPE_MARKER") { if (entry) lines.push(line.replace(`{{${name}}}`, entry.scopeMarker)); }
    else refuse("CBB-TEMPLATE-PLACEHOLDER", `the Antigravity envelope holds a placeholder this builder does not know: ${name}`);
  }
  return { entryId: entry?.id ?? null, text: `${lines.join("\n")}\n`, placeholders };
}
