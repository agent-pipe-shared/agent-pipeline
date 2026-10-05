#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * PreToolUse gate on subagent dispatch: is the briefing built from its template?
 *
 * WHY. Every other role contract in this repository is prose that depends on the
 * dispatching agent choosing to open the template. On 2026-08-06 one did not, and the
 * resulting Critic review was steered by the dispatcher's own hypotheses — see
 * ../lib/dispatch-policy.mjs for the full account. The templates were correct; nothing
 * required using them. This is the reader they were missing.
 *
 * SCOPE. Statically identified dispatch packets are checked before launch: shipped roles
 * need a role name and prompt, Workflow uses the plugin-qualified shipped role name, and
 * Critic/Goldfish families additionally satisfy their briefing contracts. Unrelated host
 * roles pass untouched because this plugin has no contract for them.
 *
 * EXIT SEMANTICS, matching the sibling guards: 0 allow, 2 block, 1 allow with a warning.
 * Blocking rather than warning is deliberate. A warning on a dispatch is read after the
 * subagent has already spent its budget on a contaminated briefing, which is exactly too
 * late to be useful.
 *
 * FAIL-OPEN on unreadable hook input and dynamically constructed Workflow scripts. Once a
 * native dispatch packet is statically identified, missing required packet fields fail
 * closed before a runner or model starts.
 *
 * HONEST LIMIT, repeated here because it belongs where an operator will read it: this is a
 * structural check. It matches phrases and required fields, so it catches the accident —
 * which is the failure that actually happened — and not a dispatcher who rewords the same
 * steer. It is not a substitute for reading the template.
 *
 * WORKFLOW-TOOL AWARENESS. A direct Agent-tool dispatch arrives as a discrete `tool_input`
 * with `subagent_type`/`prompt`. A Workflow-tool `agent()`/`parallel()`/`pipeline()` call
 * carries the same 6-field briefing shape, but embedded inside a `script` string parameter
 * rather than a discrete field — this is the gap backlog item
 * 2026-08-18-guard-dispatch-has-no-workflow-tool-awareness.md disclosed after NVA-WFDISP-1.
 * `extractWorkflowDispatches` recovers the common case: a static `agentType`/`prompt` pair
 * written as adjacent object-literal fields, prompt as a template/single/double-quoted string
 * literal with no `${...}` interpolation. Anything built programmatically (concatenation, a
 * helper function, interpolation) is NOT statically resolvable here and is deliberately left
 * alone (fail-open, same posture as the rest of this file) rather than guessed at — a false
 * positive on a script that never dispatches a Goldfish/Critic role is worse than a miss.
 *
 * ANTIGRAVITY RUNNER AWARENESS. The Antigravity runner's native `invoke_subagent` tool call
 * uses neither of the two shapes above: its payload is `{ Subagents: [{ TypeName: "...",
 * Prompt: "..." }, ...] }` — capitalized keys, array-wrapped, one entry per dispatched
 * subagent. Before this was recognized, that shape fell through every branch below to the
 * unconditional `process.exit(0)`, admitting an Antigravity dispatch with zero checks
 * regardless of contamination — backlog
 * 2026-08-25-guard-dispatch-fails-open-on-the-antigravity-subagents-payload-shape.md.
 * `extractAntigravityDispatches` reads `TypeName`/`Prompt` per array entry and checks each one
 * exactly like a direct Agent-tool dispatch. The pure extractor keeps ignoring malformed
 * entries for its other consumers; this hook rejects an empty or malformed native envelope
 * before invoking the extractor.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";

import {
  persistPendingAdvisorProhibitionBindings,
  prepareAdvisorProhibitionBindings,
} from "../lib/advisor-prohibition-binding.mjs";
import { persistPendingDispatchBudgetBindings } from "../lib/dispatch-budget-binding.mjs";
import { dispatchBudgetBinding, dispatchFindings, fanoutDispatchFindings } from "../lib/dispatch-policy.mjs";
import { isDirectInvocation } from "../lib/entrypoint.mjs";
import { appendEvent, liveSlices } from "../lib/fanout-ledger.mjs";
import { loadSliceQueue, scopesOverlap } from "../lib/slice-queue.mjs";
import { prepareNativeGoldfishHostState } from "../lib/native-goldfish-host-state.mjs";
import { parseNativeGoldfishBriefing } from "../lib/native-goldfish-host-return.mjs";
import { resolveGitCommonDir } from "./guard-dispatch-budget.mjs";
import { observeGovernanceScope } from "../lib/governance-scope.mjs";
import { isDirectInvocation as isGovernanceHookEntry } from "../lib/entrypoint.mjs";
// Repository admission precedes hook input hardening and all governed effects.
if (isGovernanceHookEntry(import.meta.url) && !observeGovernanceScope({ rootDir: process.env.CLAUDE_PROJECT_DIR ?? process.cwd() }).requiresEnforcement) process.exit(0);


// Recover `{ agentType: '...', prompt: `...` }`-shaped dispatches embedded in a Workflow
// script body. Regex-based, not a JS parser: it only claims the statically-obvious case.
// Exported so another module (a Workflow-dispatch preflight, a test) can recover the same
// embedded dispatches without importing this file for its side effects -- see the
// `isDirectInvocation` gate below, which is what makes that safe.
export function extractWorkflowDispatches(script) {
  const found = [];
  const agentTypeRe = /agentType\s*:\s*(['"])((?:(?!\1)[\s\S])*?)\1/g;
  let m;
  while ((m = agentTypeRe.exec(script)) !== null) {
    const agentType = m[2];
    const windowEnd = Math.min(script.length, agentTypeRe.lastIndex + 4000);
    const window = script.slice(agentTypeRe.lastIndex, windowEnd);
    const promptOpen = /prompt\s*:\s*([`'"])/.exec(window);
    if (!promptOpen) continue; // no prompt field nearby -> not a dispatch call, skip
    const quote = promptOpen[1];
    let i = promptOpen.index + promptOpen[0].length;
    let body = null;
    while (i < window.length) {
      if (window[i] === "\\") { i += 2; continue; }
      if (window[i] === quote) { body = window.slice(promptOpen.index + promptOpen[0].length, i); break; }
      i += 1;
    }
    if (body === null) continue; // unterminated within window -> cannot resolve, fail open
    if (body.includes("${")) continue; // built dynamically -> not statically verifiable, fail open
    found.push({ subagentType: agentType, prompt: body });
  }
  return found;
}

// Recover `{ TypeName: '...', Prompt: '...' }`-shaped entries from the Antigravity runner's
// native `invoke_subagent` payload: `toolInput.Subagents` is an array, one entry per dispatched
// subagent. An entry with no string `TypeName` carries nothing to check against a role template
// and is skipped, not guessed at -- same fail-open posture as the rest of this file.
//
// Exported (NVA-B-SLICINGRUNNER-1) so a second consumer -- guard-slicing.mjs's Antigravity
// fan-out recognizer -- can recover the same entries without a second, locally written copy of
// this parsing logic. Same one-word enabling change, same shape, as `extractWorkflowDispatches`
// above (adc165bb): the top-level hook body stays gated behind `isDirectInvocation` below, so
// importing this module for the export alone still does not execute it.
export function extractAntigravityDispatches(subagents) {
  const found = [];
  for (const entry of subagents) {
    if (!entry || typeof entry !== "object") continue;
    const subagentType = typeof entry.TypeName === "string" ? entry.TypeName : "";
    const prompt = typeof entry.Prompt === "string" ? entry.Prompt : "";
    if (subagentType === "") continue;
    found.push({ subagentType, prompt });
  }
  return found;
}

// ---------------------------------------------------------------------------------------------
// FANOUT slice S7: the dispatch-time slice-scope check (design:
// specs/sprint-alfred-epic/design/fanout-enforcement-design.md 3.4), SHADOW by default.
//
// Strictly additive. It runs only after every existing check admitted the packet, it is inactive
// unless `PIPELINE_FANOUT_CONFIG` carries a `queuePath` and a mode other than `off`, and it blocks
// ONLY in mode `enforce`, ONLY on FANOUT-SCOPE-OVERLAP. Every fault inside it (config, queue,
// ledger, git) fails open to an inactive plan: a broken fan-out check must not stop a dispatch.
//
// Config, cwd and common-dir resolution mirror stop-fanout.mjs (which does not export its
// resolvers), so the Stop adapter and this hook read the same queue and the same session ledger.
//
// RECORDING CHANNEL. A dispatch-time finding is appended as a `stop-eval` event whose `reason` is
// the FANOUT-* code, never as a `block` event: the governor's anti-loop counters read `launch` and
// `block` events only (lib/fanout-governor.mjs), and a dispatch refusal must not feed the Stop
// hook's own block budget. `ready` is 0 (nothing is evaluated for readiness here) and `target` is
// the configured target when it is a valid count, else 0 (not evaluated at dispatch time).
//
// LAUNCH. A `launch` event is appended for every dispatch that names a queue slice, but only at
// process exit with code 0 (see the call site), so a dispatch that any later existing check
// refused never occupies a slot.
const FANOUT_MODES = ["off", "shadow", "advisory", "enforce"];
const FANOUT_SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;
const FANOUT_TOKEN = /^[A-Za-z0-9][A-Za-z0-9._:+@-]{0,127}$/u;
const FANOUT_MODEL = /\b(?:claude|gpt|o[0-9]|gemini|sonnet|opus|haiku|fable|codex)[-a-z0-9.]*/i;
const FANOUT_OVERLAP = "FANOUT-SCOPE-OVERLAP";

const isPlainObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const fanoutToken = (value) => (typeof value === "string" && FANOUT_TOKEN.test(value) && !/^[A-Za-z]:/u.test(value) && !value.includes("..") ? value : "unknown");
const inactiveFanoutPlan = () => ({ active: false, mode: "off", findings: [], block: false, findingEvents: [], launchEvents: [] });

function fanoutModelOf(prompt) {
  const text = typeof prompt === "string" ? prompt : "";
  const line = /^.*\bModel\/effort\b.*$/imu.exec(text)?.[0] ?? "";
  return fanoutToken(FANOUT_MODEL.exec(line)?.[0] ?? FANOUT_MODEL.exec(text)?.[0]);
}

/**
 * Plans the fan-out recording and the (enforce-only) block for ONE hook call. Never throws.
 * `entries` is `[{ dispatch: { subagentType, prompt, transport }, role }]` (role from
 * `dispatchFindings`). A call carrying several dispatches is evaluated pairwise: entry N sees the
 * ledger's live slices plus the slices named by entries 0..N-1 of the same call.
 * @returns {{active: boolean, mode: string, findings: object[], block: boolean,
 *   findingEvents: object[], launchEvents: object[], commonDir?: string, runner?: string, sessionId?: string}}
 */
export function observeFanoutDispatches({ input, entries, env = process.env, now } = {}) {
  try {
    const raw = env?.PIPELINE_FANOUT_CONFIG;
    if (typeof raw !== "string" || raw === "") return inactiveFanoutPlan();
    const config = JSON.parse(raw);
    if (!isPlainObject(config) || typeof config.queuePath !== "string" || config.queuePath === "") return inactiveFanoutPlan();
    const mode = FANOUT_MODES.includes(config.mode) ? config.mode : "shadow";
    if (mode === "off") return inactiveFanoutPlan();
    const sessionId = input?.session_id;
    if (typeof sessionId !== "string" || sessionId === "" || !Array.isArray(entries) || entries.length === 0) return inactiveFanoutPlan();

    const cwd = typeof input.cwd === "string" && isAbsolute(input.cwd) ? input.cwd : (env.CLAUDE_PROJECT_DIR || process.cwd());
    let commonDir;
    if (config.commonDir !== undefined) {
      if (typeof config.commonDir !== "string" || !isAbsolute(config.commonDir)) throw new Error("commonDir");
      commonDir = config.commonDir;
    } else {
      commonDir = resolveGitCommonDir(cwd);
      if (typeof commonDir !== "string" || !isAbsolute(commonDir)) throw new Error("commonDir");
    }
    const transport = entries[0]?.dispatch?.transport;
    const runner = transport === "codex" ? "codex" : transport === "antigravity" ? "antigravity" : "claude";

    const loaded = loadSliceQueue(resolve(cwd, config.queuePath), isPlainObject(config.queueOptions) ? config.queueOptions : {});
    if (loaded.status !== "valid" || !Array.isArray(loaded.queue?.slices)) return inactiveFanoutPlan();
    const sliceIds = loaded.queue.slices.map((slice) => slice?.id).filter((id) => typeof id === "string" && FANOUT_SAFE_ID.test(id));
    const ledgerLive = liveSlices({ commonDir, runner, sessionId, evidenceDir: join(cwd, "evidence"), sliceIds, now }).map((entry) => entry.sliceId);
    const target = Number.isSafeInteger(config.target) && config.target >= 0 && config.target <= 1_000_000 ? config.target : 0;

    const findings = [];
    const findingEvents = [];
    const launchEvents = [];
    const inCall = [];
    entries.forEach((entry, index) => {
      const dispatch = entry?.dispatch;
      if (!isPlainObject(dispatch)) return;
      const liveSliceIds = [...new Set([...ledgerLive, ...inCall])];
      const result = fanoutDispatchFindings({ role: entry.role, prompt: dispatch.prompt, queue: loaded.queue, liveSliceIds, overlaps: scopesOverlap });
      for (const finding of result.findings) {
        findings.push({ ...finding, index });
        findingEvents.push({
          type: "stop-eval",
          live: liveSliceIds.length,
          target,
          ready: 0,
          decision: mode === "enforce" && finding.code === FANOUT_OVERLAP ? "block" : "allow",
          reason: finding.code,
          mode,
        });
      }
      if (result.sliceId === null) return;
      inCall.push(result.sliceId);
      const slice = loaded.queue.slices.find((candidate) => candidate?.id === result.sliceId);
      launchEvents.push({
        type: "launch",
        sliceId: result.sliceId,
        agentType: fanoutToken(dispatch.subagentType),
        model: fanoutModelOf(dispatch.prompt),
        writeScopeHash: createHash("sha256").update(JSON.stringify([...result.writeScope].sort())).digest("hex"),
        commitMode: slice?.commitMode,
      });
    });
    return {
      active: true,
      mode,
      findings,
      block: mode === "enforce" && findings.some((finding) => finding.code === FANOUT_OVERLAP),
      findingEvents,
      launchEvents,
      commonDir,
      runner,
      sessionId,
    };
  } catch {
    return inactiveFanoutPlan();
  }
}

/** Appends each event on its own; one that cannot be written never stops a dispatch. Returns the count written. */
export function recordFanoutEvents(plan, events, now) {
  let recorded = 0;
  for (const event of Array.isArray(events) ? events : []) {
    try {
      appendEvent(plan.commonDir, plan.runner, plan.sessionId, event, { now });
      recorded += 1;
    } catch { /* a ledger that cannot be written never blocks a dispatch */ }
  }
  return recorded;
}

// Gate the entire hook body on being the process entrypoint (matching
// guard-dispatch-budget.mjs's shape). Importing this module for `extractWorkflowDispatches`
// must never itself read stdin, parse it, or call `process.exit` -- see `../lib/entrypoint.mjs`'s
// header for the 2026-08-06 incident (a naive entrypoint check left six hooks dead through a
// symlinked marketplace root) this gate must not reproduce.
if (isDirectInvocation(import.meta.url)) {
  let input;
  try {
    input = JSON.parse(readFileSync(0, "utf8"));
  } catch {
    process.exit(0); // unreadable input -> no opinion; a broken hook must not stop work
  }

  const toolInput = input?.tool_input;
  if (!toolInput || typeof toolInput !== "object") process.exit(0);

  // The subagent tool is `Task` in Claude Code and `Agent` in some runners; both are accepted
  // rather than guessing one, because a matcher that names the wrong tool is a silent no-op —
  // the failure class this repository already paid for with NotebookEdit.
  const codexDispatch = input?.tool_name === "spawn_agent";
  const subagentType = toolInput.subagent_type ?? toolInput.subagentType ?? toolInput.agent_type ?? (codexDispatch ? "default" : "");
  const prompt = toolInput.prompt ?? toolInput.message ?? "";

  let dispatches;
  if (Array.isArray(toolInput.Subagents)) {
    // Antigravity runner's native invoke_subagent shape: capitalized, array-wrapped.
    const malformed = toolInput.Subagents.length === 0 || toolInput.Subagents.some((entry) => !entry || typeof entry !== "object"
      || typeof entry.TypeName !== "string" || entry.TypeName.trim() === ""
      || typeof entry.Prompt !== "string" || entry.Prompt.trim() === "");
    dispatches = malformed
      ? [{ subagentType: "", prompt: "", transport: "antigravity" }]
      : extractAntigravityDispatches(toolInput.Subagents).map((dispatch) => ({ ...dispatch, transport: "antigravity" }));
    if (dispatches.length === 0) process.exit(0);
  } else if (typeof subagentType === "string" && subagentType !== "" && typeof prompt === "string") {
    dispatches = [{ subagentType, prompt, transport: codexDispatch ? "codex" : "direct" }];
  } else if (["Task", "Agent"].includes(input?.tool_name)) {
    dispatches = [{ subagentType, prompt, transport: "direct" }];
  } else if (typeof toolInput.script === "string" && toolInput.script !== "") {
    // Workflow-tool call: no discrete subagent_type/prompt field, but the script may carry
    // one or more embedded agent()/parallel()/pipeline() dispatches worth checking the same way.
    dispatches = extractWorkflowDispatches(toolInput.script).map((dispatch) => ({ ...dispatch, transport: "workflow" }));
    if (dispatches.length === 0) process.exit(0);
  } else {
    process.exit(0);
  }

  const codexV2Marker = "<!-- pipeline-native-goldfish-host-commit:v2";
  const markedV2 = dispatches.filter((dispatch) => dispatch.prompt.includes(codexV2Marker));
  let policyDispatches = dispatches;
  if (markedV2.length > 0) {
    const parsed = markedV2.length === 1 && dispatches.length === 1 && input?.tool_name === "spawn_agent"
      ? parseNativeGoldfishBriefing(markedV2[0].prompt) : { ok: false, code: "NGHR-BRIEFING-TRANSPORT" };
    if (!parsed.ok || toolInput.agent_type !== parsed.binding?.nativeAgentType || Object.hasOwn(toolInput, "agentType")
      || typeof toolInput.message !== "string" || Object.hasOwn(toolInput, "prompt")) {
      const code = !parsed.ok ? parsed.code : "NGHR-NATIVE-AGENT-TYPE";
      process.stderr.write(`BLOCKED (guard-dispatch): ${code}: the version 2 native Goldfish binding requires one Codex worker packet and a valid functional Pipeline role.\n`);
      process.exit(2);
    }
    policyDispatches = [{ ...markedV2[0], subagentType: parsed.binding.role }];
  }

  const evaluated = policyDispatches.map((dispatch) => ({
    dispatch,
    policy: dispatchFindings(dispatch),
    budget: dispatchBudgetBinding(dispatch),
  }));
  const blocked = evaluated.map(({ policy }) => policy).filter((result) => result.findings.length > 0);
  if (blocked.length === 0) {
    // FANOUT slice S7: shadow by default; inactive without PIPELINE_FANOUT_CONFIG. Findings are
    // recorded now; the `launch` events only if every later existing check also admits the dispatch.
    const fanout = observeFanoutDispatches({
      input,
      entries: evaluated.map(({ dispatch, policy }) => ({ dispatch, role: policy.role })),
      env: process.env,
    });
    if (fanout.active) {
      recordFanoutEvents(fanout, fanout.findingEvents);
      if (fanout.block) {
        process.stderr.write([
          "BLOCKED (guard-dispatch, plugin pipeline-core): this dispatch failed the fan-out slice check before launch (mode enforce).",
          "",
          ...fanout.findings.map((f, i) => `  ${i + 1}. ${f.code}\n     ${f.why}`),
          "",
          "Wait for the live slice(s) to finish, order the slices with dependsOn, or correct the `Slice:` and `Write scope:` lines of the dispatch metadata, then dispatch again.",
          "",
        ].join("\n"));
        process.exit(2);
      }
      process.once("exit", (code) => {
        if (code === 0) recordFanoutEvents(fanout, fanout.launchEvents);
      });
    }
    const toolUseId = input?.tool_use_id ?? input?.toolUseId;
    const bindingCapableTool = ["Task", "Agent", "Workflow"].includes(input?.tool_name)
      && !dispatches.some((dispatch) => dispatch.transport === "antigravity");
    const advisorBinding = bindingCapableTool
      ? prepareAdvisorProhibitionBindings(dispatches)
      : { status: "not-applicable" };
    if (advisorBinding.status === "rejected") {
      process.stderr.write(`BLOCKED (guard-dispatch, plugin pipeline-core): ${advisorBinding.code}: ${advisorBinding.message ?? "the Advisor prohibition cannot be assigned to one exact child before launch."}\n`);
      process.exit(2);
    }
    if (advisorBinding.status === "prepared") {
      if (typeof toolUseId !== "string" || toolUseId.trim() === "") {
        process.stderr.write("BLOCKED (guard-dispatch, plugin pipeline-core): APB-PARENT-TOOL-USE-ID-MISSING: a prohibition-bearing dispatch requires the host tool-use id before launch.\n");
        process.exit(2);
      }
      const rootDir = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
      const commonDir = resolveGitCommonDir(rootDir);
      const persisted = commonDir === null
        ? { status: "rejected", code: "APB-PENDING-WRITE" }
        : persistPendingAdvisorProhibitionBindings({ commonDir, toolUseId, bindings: advisorBinding.bindings });
      if (persisted.status !== "prepared") {
        process.stderr.write(`BLOCKED (guard-dispatch, plugin pipeline-core): ${persisted.code}: the Advisor prohibition could not be bound to this dispatch before launch.\n`);
        process.exit(2);
      }
    }
    const budgetBindings = evaluated
      .filter(({ budget }) => budget.status === "prepared")
      .map(({ dispatch, budget }) => ({
        agentType: dispatch.subagentType,
        baseCalls: budget.baseCalls,
        maxTurns: budget.maxTurns,
        effectiveCap: budget.effectiveCap,
      }));
    if (bindingCapableTool && budgetBindings.length > 0) {
      if (typeof toolUseId !== "string" || toolUseId.trim() === "") {
        process.stderr.write("BLOCKED (guard-dispatch, plugin pipeline-core): DBB-PARENT-TOOL-USE-ID-MISSING: a budget-bearing dispatch requires the host tool-use id before launch.\n");
        process.exit(2);
      }
      const rootDir = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
      const commonDir = resolveGitCommonDir(rootDir);
      const persisted = commonDir === null
        ? { status: "rejected", code: "DBB-PENDING-BINDING-WRITE" }
        : persistPendingDispatchBudgetBindings({ commonDir, toolUseId, bindings: budgetBindings });
      if (persisted.status !== "prepared") {
        process.stderr.write(`BLOCKED (guard-dispatch, plugin pipeline-core): ${persisted.code}: the validated tool budget could not be bound to this dispatch before launch.\n`);
        process.exit(2);
      }
    }
    const nativeMarker = "<!-- pipeline-native-goldfish-host-commit:v1";
    const markedNative = dispatches.filter((dispatch) => dispatch.prompt.includes(nativeMarker) || dispatch.prompt.includes(codexV2Marker));
    if (markedNative.length > 0) {
      const nativeRunner = ["Task", "Agent"].includes(input?.tool_name) ? "claude"
        : input?.tool_name === "spawn_agent" ? "codex" : null;
      if (!nativeRunner || dispatches.length !== 1) {
        process.stderr.write("WARNING (guard-dispatch): marked native host-commit route is not a single direct Claude Task or Codex spawn_agent; child changes will not be host-committed.\n");
      } else {
        const rootDir = process.env.CLAUDE_PROJECT_DIR ?? input.cwd ?? process.cwd();
        const prepared = prepareNativeGoldfishHostState({ root: rootDir, runner: nativeRunner, input });
        if (!prepared.ok) {
          if (markedV2.length > 0) {
            process.stderr.write(`BLOCKED (guard-dispatch): ${prepared.code}: version 2 native host binding failed before launch.\n`);
            process.exit(2);
          }
          process.stderr.write(`WARNING (guard-dispatch): native host-commit preparation failed (${prepared.code}); dispatch continues, the child must leave changes uncommitted, and no authorship record will be claimed.\n`);
        }
      }
    }
    process.exit(0);
  }

  const { role, findings } = blocked[0];
  const template = role === "critic" ? "templates/prompts/critic-review.md"
    : role === "goldfish" ? "templates/prompts/goldfish-task.md"
      : "the shipped role registry";
  const guidance = role === "critic" || role === "goldfish"
    ? [
        `Correct the packet using ${template} and dispatch that. The template already forbids`,
        "every pattern listed above, in those words. A review steered by the dispatcher's own",
        "hypotheses is not an independent review, and an incomplete briefing is not dispatchable.",
        "",
        "This check is structural. It cannot see a steer written in fresh prose — read the template.",
      ]
    : [
        "Correct the role and prompt fields using the shipped role registry, then dispatch again.",
      ];
  const receipt = {
    schema: "pipeline.role-dispatch-preflight.v1",
    status: "rejected",
    phase: "packet",
    findings: findings.map(({ code }) => code),
    modelCalls: 0,
  };
  process.stderr.write([
    `BLOCKED (guard-dispatch, plugin pipeline-core): this ${role} dispatch failed before launch against ${template}.`,
    JSON.stringify(receipt),
    "",
    ...findings.map((f, i) => `  ${i + 1}. ${f.code}\n     ${f.why}`),
    "",
    ...guidance,
    "",
  ].join("\n"));
  process.exit(2);
}
