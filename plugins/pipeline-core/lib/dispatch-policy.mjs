// SPDX-License-Identifier: SUL-1.0
/**
 * Is this subagent dispatch built from its template, or freehand?
 *
 * WHY THIS EXISTS. On 2026-08-06 a Critic dispatch was written by hand. It carried a
 * "WHAT THE CHANGE CLAIMS" section listing five claims to verify, an "ADVERSARIAL FOCUS"
 * section listing eight places to look, and a list of test commands to re-run.
 * `templates/prompts/critic-review.md` §2 forbids all of it, and not vaguely — it rules out
 * "even a phrase like 'claims to verify independently'" in those exact words, its
 * EVIDENCE_PATHS field asks for paths rather than commands, and its skip rules already tell
 * the Critic to drop anything CI or verify enforces.
 *
 * So the instruction was not missing. It had no reader at the moment it mattered:
 * `roles/critic.md` is read by the Critic, and the template is read by whoever chooses to
 * open it. Nothing required opening it.
 *
 * What it cost: the hunt list did not add to the Critic's contractual search surface
 * (`roles/critic.md` §103), it replaced it. The report came back organised along the
 * dispatcher's claim list, and its one major finding was one of the dispatcher's own eight
 * bullets verbatim. A review that only looks where it was told to look is not a second pair
 * of eyes, and its silence about everything else carries no information.
 *
 * WHAT THIS CAN AND CANNOT DO, stated up front so nobody reads a structural check as a
 * semantic one. It matches phrases and required fields. It would have refused that briefing,
 * because the contamination was literal — the section was called "WHAT THE CHANGE CLAIMS".
 * A dispatcher who frames the same steer in fresh prose walks straight past it. This raises
 * the cost of the accident, which is the failure mode that actually happened; it does not
 * detect a determined one, and it is not a substitute for reading the template.
 */

import { bindDispatchBudget, readAgentMaxTurns } from "./dispatch-budget-binding.mjs";

const CRITIC_ROLES = /critic|readiness-reviewer|plan-verifier/i;
const GOLDFISH_ROLES = /goldfish/i;
const PIPELINE_AGENT_TYPES = new Set([
  "afk-claude-worker",
  "consult-advisor",
  "critic",
  "goldfish-deep",
  "goldfish-implementor",
  "goldfish-mechanic",
  "plan-verifier",
  "readiness-reviewer",
]);
// Roles that carry a first-class budget contract. Names only: a role's maxTurns is never
// restated here -- it is read from the agent definition (readAgentMaxTurns), the one source.
const BUDGETED_ROLES = Object.freeze([
  "critic",
  "goldfish-deep",
  "goldfish-implementor",
  "goldfish-mechanic",
]);
const DEFAULT_DISPATCH_BASE_CALL_CAP = Object.freeze({
  critic: 30,
  "goldfish-deep": 45,
  "goldfish-implementor": 40,
  "goldfish-mechanic": 40,
});

/** True only for an agent type shipped by this plugin, with or without its namespace. */
export function isShippedPipelineAgentType(subagentType) {
  if (typeof subagentType !== "string") return false;
  const bareType = subagentType.startsWith("pipeline-core:")
    ? subagentType.slice("pipeline-core:".length)
    : subagentType;
  return PIPELINE_AGENT_TYPES.has(bareType);
}

/**
 * The budget contract of a role. `maxTurns` is derived from the agent definition through
 * `readAgentMaxTurns`; `options` carries the same `{ pluginRoot, existsSyncFn, readFileSyncFn }`
 * the caller resolves agent definitions with, so two call sites in one process cannot read two
 * sources. `options.readMaxTurnsFn(bareRole)` lets a caller that already owns a resolver
 * (the budget guard's injectable seam) hand it in instead. An unreadable definition yields
 * `maxTurns: null`, which every consumer already refuses (DBB-TIER-INCOMPATIBLE at binding,
 * a blocked call at the guard) -- the contract never invents a fallback number.
 */
export function dispatchBudgetContractForRole(subagentType, options = {}) {
  const type = typeof subagentType === "string" ? subagentType : "";
  const bareType = type.startsWith("pipeline-core:") ? type.slice("pipeline-core:".length) : type;
  if (!BUDGETED_ROLES.includes(bareType)) {
    return Object.freeze({ applicable: false, role: bareType });
  }
  const { pluginRoot, existsSyncFn, readFileSyncFn, readMaxTurnsFn } = options ?? {};
  const maxTurns = typeof readMaxTurnsFn === "function"
    ? readMaxTurnsFn(bareType)
    : readAgentMaxTurns(bareType, pluginRoot, { existsSyncFn, readFileSyncFn });
  return Object.freeze({ applicable: true, role: bareType, maxTurns: Number.isSafeInteger(maxTurns) ? maxTurns : null });
}

/** Render the canonical first-class budget metadata consumed by PREPARE. */
export function dispatchBudgetLineForRole(subagentType) {
  const type = typeof subagentType === "string" ? subagentType : "";
  const bareType = type.startsWith("pipeline-core:") ? type.slice("pipeline-core:".length) : type;
  const cap = DEFAULT_DISPATCH_BASE_CALL_CAP[bareType];
  return Number.isSafeInteger(cap)
    ? `- **Tool budget (hard cap, first-class field):** ≤${cap} tool uses.`
    : null;
}

export function dispatchBudgetBinding({ subagentType, prompt, pluginRoot, existsSyncFn, readFileSyncFn, readMaxTurnsFn } = {}) {
  const contract = dispatchBudgetContractForRole(subagentType, { pluginRoot, existsSyncFn, readFileSyncFn, readMaxTurnsFn });
  return bindDispatchBudget({ prompt, maxTurns: contract.maxTurns, applicable: contract.applicable });
}

/**
 * Phrases the Critic template names as contamination. Each carries the reason, because a
 * refusal that only says "contaminated" teaches nobody what to write instead.
 */
const CONTAMINATION = Object.freeze([
  Object.freeze({
    id: "CLAIMS-LIST",
    test: /\b(?:what the (?:change|diff|implementation) claims|claims? to verify|verify (?:each|these) claims?)\b/i,
    why: "a claims-to-verify list replaces the Critic's own search surface with yours (critic-review.md §2)",
  }),
  Object.freeze({
    id: "HUNT-LIST",
    test: /\b(?:adversarial focus|focus (?:areas?|on these)|hunt (?:for|list)|pay (?:special )?attention to)\b/i,
    why: "a hunt list steers the review to where you already suspect a problem, and its silence elsewhere then means nothing",
  }),
  Object.freeze({
    id: "EXPECTATION",
    test: /\b(?:none expected|no (?:findings|issues) expected|expected (?:conclusion|outcome|verdict)|judge on the merits|should pass)\b/i,
    why: "an expectation-conclusion tells the reviewer what answer you want (critic-review.md §2)",
  }),
  Object.freeze({
    id: "IMPLEMENTOR-CHARACTERIZATION",
    test: /\b(?:flagged by the implement(?:or|er)|the implement(?:or|er) (?:believes|thinks|notes|disclosed)|already (?:reviewed|checked) by)\b/i,
    why: "an implementor characterization smuggles in a source-credibility frame the Critic did not build itself",
  }),
  Object.freeze({
    id: "RERUN-COMMANDS",
    test: /^\s*(?:EVIDENCE|VERIFY)[^\n]*\(\s*(?:reproduce|re-?run|execute)/im,
    why: "evidence reaches a Critic as artifact PATHS; re-running suites you already ran spends its budget on being a second CI (critic-review.md EVIDENCE_PATHS)",
  }),
]);

/** The six fields a Goldfish briefing is not dispatchable without. */
const GOLDFISH_FIELDS = Object.freeze([
  Object.freeze({ id: "GOAL", test: /^\s*#{0,4}\s*(?:1[.)]\s*)?goal\b/im }),
  Object.freeze({ id: "CONTEXT-FILES", test: /^\s*#{0,4}\s*(?:2[.)]\s*)?context files\b/im }),
  Object.freeze({ id: "DOD-CHECKS", test: /^\s*#{0,4}\s*(?:3[.)]\s*)?dod checks\b/im }),
  Object.freeze({ id: "FORBIDDEN", test: /^\s*#{0,4}\s*(?:4[.)]\s*)?(?:forbidden|prohibitions)\b/im }),
  Object.freeze({ id: "STOP-CONDITIONS", test: /^\s*#{0,4}\s*(?:5[.)]\s*)?stop conditions\b/im }),
  Object.freeze({ id: "DISPATCH-METADATA", test: /^\s*#{0,4}\s*(?:6[.)]\s*)?dispatch[- ]metadat/im }),
]);

/**
 * Every dispatch names its model explicitly; silent inheritance is the MP-05 failure.
 *
 * Keyed on an actual model-family token appearing anywhere in the text, not on it sitting
 * immediately after the word "model". A second version required that adjacency and refused
 * every dispatch built from either canonical template: `critic-review.md`'s field reads
 * "Criticality → model (MP-07): guardrail diff → higher-capability review model at max ..."
 * and `goldfish-task.md`'s reads "Model/effort for this run: {{MODEL_EFFORT}}" — in both, the
 * real token sits sentences away from the label, never glued to it. A Critic dispatch built
 * from the template this way was itself refused by this rule (F1, 2026-08-06 Critic round on
 * the block that introduced it). A gate that cries wolf on a compliant field is worse than
 * none: it trains the dispatcher to ignore it.
 */
const NAMES_MODEL = /\b(?:claude|gpt|o[0-9]|gemini|sonnet|opus|haiku|fable|codex)[-a-z0-9.[\]]*/i;
const NAMES_RULESET = /\bruleset[- ]?sha\s*[:=]\s*\S/i;

/**
 * @param {{subagentType: string, prompt: string, transport?: "direct"|"workflow"|"antigravity"|"codex"}} dispatch
 * @returns {{role: "critic"|"goldfish"|"other", findings: {code: string, why: string}[]}}
 */
export function dispatchFindings({ subagentType, prompt, transport = "direct" } = {}) {
  const text = typeof prompt === "string" ? prompt : "";
  const type = typeof subagentType === "string" ? subagentType : "";
  const findings = [];
  const namespaced = type.startsWith("pipeline-core:");
  const bareType = namespaced ? type.slice("pipeline-core:".length) : type;
  const supported = PIPELINE_AGENT_TYPES.has(bareType);

  if (["direct", "antigravity"].includes(transport) && type.trim() === "") {
    findings.push({ code: "DISPATCH-ROLE-REQUIRED", why: "a dispatch packet needs a non-empty role before any runner or model starts" });
    return { role: "other", findings };
  }
  if (namespaced && !supported) {
    findings.push({ code: "DISPATCH-ROLE-UNKNOWN", why: `the pipeline role \`${type}\` has no shipped agent definition` });
    return { role: "other", findings };
  }
  if (transport === "workflow" && supported && !namespaced) {
    findings.push({ code: "DISPATCH-AGENT-TYPE-PREFIX", why: `Workflow resolves shipped roles through the plugin registry; use \`pipeline-core:${bareType}\`` });
  }
  if ((supported || namespaced || transport === "codex") && text.trim() === "") {
    findings.push({ code: "DISPATCH-PROMPT-REQUIRED", why: "a shipped role needs a non-empty prompt before any runner or model starts" });
  }

  const budget = dispatchBudgetBinding({ subagentType: bareType, prompt: text });
  if (text.trim() !== "" && budget.status === "rejected") {
    findings.push({
      code: budget.code,
      why: "the dispatch metadata must carry exactly one positive numeric base tool cap that can be bound to the selected role before launch",
    });
  }

  if (CRITIC_ROLES.test(bareType)) {
    for (const rule of CONTAMINATION) {
      if (rule.test.test(text)) findings.push({ code: `DISPATCH-CONTAMINATION-${rule.id}`, why: rule.why });
    }
    if (!NAMES_RULESET.test(text)) {
      findings.push({
        code: "DISPATCH-NO-RULESET-SHA",
        why: "the task frame requires a ruleset SHA; without one the Critic cannot state which ruleset it measured against and will emit NOT-PROVIDED-BY-DISPATCH",
      });
    }
    if (!NAMES_MODEL.test(text)) {
      findings.push({ code: "DISPATCH-NO-MODEL", why: "every dispatch names its model explicitly (MP-05); subagents otherwise inherit the session's silently" });
    }
    return { role: "critic", findings };
  }

  if (GOLDFISH_ROLES.test(bareType)) {
    const missing = GOLDFISH_FIELDS.filter((field) => !field.test.test(text)).map((field) => field.id);
    if (missing.length > 0) {
      findings.push({
        code: "DISPATCH-INCOMPLETE-BRIEFING",
        why: `an incomplete briefing is not dispatchable (goldfish-task.md §1); missing: ${missing.join(", ")}`,
      });
    }
    if (!NAMES_MODEL.test(text)) {
      findings.push({ code: "DISPATCH-NO-MODEL", why: "every dispatch names its model explicitly (MP-05); subagents otherwise inherit the session's silently" });
    }
    return { role: "goldfish", findings };
  }

  // Roles with no template contract carry no requirement. Inventing one here would refuse
  // ordinary work in the name of a rule nobody wrote.
  return { role: "other", findings };
}

// ---------------------------------------------------------------------------------------------
// FANOUT slice S7 (design: specs/sprint-alfred-epic/design/fanout-enforcement-design.md 3.4).
//
// Pure helpers for the dispatch-time slice check. `dispatchFindings()` above is deliberately NOT
// extended: its codes, messages and verdicts stay byte-identical, and these findings travel in
// their own channel so that "shadow mode never blocks" is a property of the caller's mode switch,
// not of a filter someone has to remember. No I/O here: the queue, the live set and the overlap
// predicate are injected (guard-dispatch.mjs owns the I/O and passes `scopesOverlap`).
//
// MARKER. Design 3.4 puts two lines into briefing field 6: `Slice: <id>` and
// `Write scope: <repo-relative paths, or "none" for read-only>`. The template edit is not part of
// this slice, so the markers are parsed wherever they stand on a line of their own (an optional
// list bullet and optional bold markers are tolerated).
const SLICE_MARKER_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;
const SLICE_LINE = /^[ \t]*(?:[-*][ \t]+)?(?:\*\*)?Slice:(?:\*\*)?[ \t]*`?([^\s`*]+)`?[ \t]*\r?$/gmu;
const WRITE_SCOPE_LINE = /^[ \t]*(?:[-*][ \t]+)?(?:\*\*)?Write scope:(?:\*\*)?[ \t]*(.+?)[ \t]*\r?$/mu;
const stripQuotes = (text) => text.trim().replace(/^[`"']+|[`"']+$/gu, "").trim();

/**
 * @returns {{sliceId: string|null, writeScope: "none"|string[]|null}} `sliceId` is null when no
 * safe id is named, or when two different ids are named (ambiguous names no slice).
 */
export function parseDispatchSlice(prompt) {
  const text = typeof prompt === "string" ? prompt : "";
  const ids = new Set();
  for (const match of text.matchAll(SLICE_LINE)) {
    if (SLICE_MARKER_ID.test(match[1])) ids.add(match[1]);
  }
  let writeScope = null;
  const scopeMatch = WRITE_SCOPE_LINE.exec(text);
  if (scopeMatch !== null) {
    if (/^none$/iu.test(stripQuotes(scopeMatch[1]))) writeScope = "none";
    else {
      const list = scopeMatch[1].split(",").map(stripQuotes).filter((part) => part !== "");
      if (list.length > 0) writeScope = list;
    }
  }
  return { sliceId: ids.size === 1 ? [...ids][0] : null, writeScope };
}

// Derived slice statuses (`readyAndLive`) under which a dispatch for the slice is refused outright.
const NOT_READY_CAUSES = {
  done: "it is already done",
  cancelled: "it is cancelled",
  held: "it is held (deferred, hold-po, blocked-external or out of attempts)",
  live: "it is already live",
};

/**
 * The fan-out findings of ONE dispatch against a validated slice queue, emitted in this order
 * (design 3.4 bullet 2, 3.10 bullet 3):
 *   FANOUT-NO-SLICE             an implementation (goldfish) dispatch names no queue slice
 *   FANOUT-SLICE-NOT-READY      the slice is live, done, cancelled, held, or blocked by the
 *                               protected-slice / single-committer rule
 *   FANOUT-DEP-BLOCKED          the slice waits on a dependency that is not done
 *   FANOUT-SCOPE-NOT-CONTAINED  a declared `Write scope:` leaves the queue entry's writeScope
 *   FANOUT-SCOPE-UNDECLARED     `enforce` only: no `Write scope:` while another slice is live
 *   FANOUT-SCOPE-OVERLAP        the write scope overlaps a live slice's write scope
 * `queue` is the normalized queue (`loadSliceQueue(...).queue`), `liveSliceIds` the slices that
 * hold a slot, `overlaps(a, b)` the scope-intersection predicate, `contains(declared, queued)` the
 * containment predicate (absent: no opinion), `sliceStatus` the derived `{ [id]: { status, reasons } }`
 * taken from `readyAndLive` (absent: only the declared state and the live set are consulted), `mode`
 * the fan-out mode (default `shadow`). The state and dependency checks apply to read-only
 * dispatches too; ONLY the overlap check is exempt for `Write scope: none`. Returns `{ findings,
 * sliceId, readOnly, writeScope }`; messages are built only from queue-validated ids.
 */
export function fanoutDispatchFindings({ role, prompt, queue, liveSliceIds = [], overlaps, contains, sliceStatus, mode = "shadow" } = {}) {
  const none = { findings: [], sliceId: null, readOnly: false, writeScope: [] };
  const slices = Array.isArray(queue?.slices) ? queue.slices : null;
  if (slices === null || typeof overlaps !== "function") return none;
  const named = parseDispatchSlice(prompt);
  const entry = named.sliceId === null ? null : slices.find((candidate) => candidate?.id === named.sliceId) ?? null;
  if (entry === null) {
    return role === "goldfish"
      ? {
          ...none,
          findings: [{
            code: "FANOUT-NO-SLICE",
            why: "an implementation dispatch names no slice of the slice queue; add a `Slice: <id>` line to the dispatch metadata so work cannot bypass the queue",
          }],
        }
      : none;
  }
  const readOnly = named.writeScope === "none";
  const declared = Array.isArray(named.writeScope) ? named.writeScope : null;
  const queued = Array.isArray(entry.writeScope) ? entry.writeScope : [];
  const writeScope = readOnly ? [] : declared ?? queued;
  const result = { findings: [], sliceId: entry.id, readOnly, writeScope };

  // 1. FANOUT-SLICE-NOT-READY: one finding, naming every cause that applies.
  const derived = sliceStatus !== null && typeof sliceStatus === "object" && Object.hasOwn(sliceStatus, entry.id) ? sliceStatus[entry.id] : null;
  const status = typeof derived?.status === "string" ? derived.status : null;
  const reasons = Array.isArray(derived?.reasons) ? derived.reasons.filter((reason) => reason !== null && typeof reason === "object") : [];
  const notReady = [];
  if (liveSliceIds.includes(entry.id)) notReady.push(NOT_READY_CAUSES.live);
  if ((entry.state ?? "ready") !== "ready") notReady.push("its queue state is not `ready`");
  if (status !== null && Object.hasOwn(NOT_READY_CAUSES, status) && !notReady.includes(NOT_READY_CAUSES[status])) notReady.push(NOT_READY_CAUSES[status]);
  if (status === "blocked" && reasons.some((reason) => reason.code === "protected-live" || reason.code === "commit-live")) {
    notReady.push("the protected-slice / single-committer rule blocks it while a conflicting slice is live");
  }
  if (notReady.length > 0) {
    result.findings.push({
      code: "FANOUT-SLICE-NOT-READY",
      why: `slice ${entry.id} is not ready: ${notReady.join("; ")}; dispatch only a ready slice of the slice queue`,
    });
  }

  // 2. FANOUT-DEP-BLOCKED: waiting on a dependency (or on a cancelled one) that is not done.
  if (status === "blocked" && reasons.some((reason) => reason.code === "dependency" || reason.code === "dependency-cancelled")) {
    const waitsOn = [];
    for (const reason of reasons) {
      if (reason.code !== "dependency" && reason.code !== "dependency-cancelled") continue;
      for (const id of Array.isArray(reason.waitsOn) ? reason.waitsOn : []) {
        if (typeof id === "string" && !waitsOn.includes(id) && slices.some((candidate) => candidate?.id === id)) waitsOn.push(id);
      }
    }
    result.findings.push({
      code: "FANOUT-DEP-BLOCKED",
      why: `slice ${entry.id} waits on dependency slice(s) ${waitsOn.join(", ")} that are not done; wait for them to finish`,
      waitsOn,
    });
  }

  // 3. FANOUT-SCOPE-NOT-CONTAINED: only a declared path list is judged; no predicate, no opinion.
  if (declared !== null && typeof contains === "function" && !contains(declared, queued)) {
    result.findings.push({
      code: "FANOUT-SCOPE-NOT-CONTAINED",
      why: `slice ${entry.id} declares a \`Write scope:\` that is not contained in the writeScope of its queue entry; declare only paths inside the slice's own scope`,
    });
  }

  // 4. FANOUT-SCOPE-UNDECLARED: enforce only; shadow and advisory keep the queue-scope fallback.
  if (mode === "enforce" && !readOnly && declared === null && liveSliceIds.some((id) => id !== entry.id)) {
    result.findings.push({
      code: "FANOUT-SCOPE-UNDECLARED",
      why: `slice ${entry.id} declares no \`Write scope:\` while another slice is live; add a \`Write scope: <paths>\` line (or \`none\` for read-only) so the overlap check has a declared scope to judge`,
    });
  }

  // 5. FANOUT-SCOPE-OVERLAP: the only check a read-only dispatch is exempt from.
  if (readOnly) return result;
  const clashing = [];
  for (const id of liveSliceIds) {
    if (id === entry.id || clashing.includes(id)) continue;
    const live = slices.find((candidate) => candidate?.id === id);
    if (live === undefined) continue;
    if (overlaps(writeScope, Array.isArray(live.writeScope) ? live.writeScope : [])) clashing.push(id);
  }
  if (clashing.length > 0) {
    result.findings.push({
      code: "FANOUT-SCOPE-OVERLAP",
      why: `slice ${entry.id} declares a write scope that overlaps live slice(s) ${clashing.join(", ")}; wait for them to finish or order the slices with dependsOn`,
      overlapsWith: clashing,
    });
  }
  return result;
}
