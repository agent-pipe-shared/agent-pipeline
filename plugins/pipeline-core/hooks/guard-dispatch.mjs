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
 * SCOPE. Roles that have a template contract are checked against it: Critic-family
 * dispatches for contamination and task frame, Goldfish-family for the six mandatory
 * briefing fields. Everything else passes untouched — inventing a requirement for roles
 * that have no template would refuse ordinary work in the name of a rule nobody wrote.
 *
 * EXIT SEMANTICS, matching the sibling guards: 0 allow, 2 block, 1 allow with a warning.
 * Blocking rather than warning is deliberate. A warning on a dispatch is read after the
 * subagent has already spent its budget on a contaminated briefing, which is exactly too
 * late to be useful.
 *
 * FAIL-OPEN on anything it cannot parse. A guard that cannot read its input has no opinion,
 * and a broken hook must not become a work stoppage.
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
 * exactly like a direct Agent-tool dispatch; a malformed entry (missing `TypeName`, non-string
 * `Prompt`) is skipped rather than guessed at, same fail-open posture as the rest of this file.
 */
import { readFileSync } from "node:fs";

import { dispatchFindings } from "../lib/dispatch-policy.mjs";
import { isDirectInvocation } from "../lib/entrypoint.mjs";

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
function extractAntigravityDispatches(subagents) {
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
  const subagentType = toolInput.subagent_type ?? toolInput.subagentType ?? "";
  const prompt = toolInput.prompt ?? "";

  let dispatches;
  if (typeof subagentType === "string" && subagentType !== "" && typeof prompt === "string") {
    dispatches = [{ subagentType, prompt }];
  } else if (typeof toolInput.script === "string" && toolInput.script !== "") {
    // Workflow-tool call: no discrete subagent_type/prompt field, but the script may carry
    // one or more embedded agent()/parallel()/pipeline() dispatches worth checking the same way.
    dispatches = extractWorkflowDispatches(toolInput.script);
    if (dispatches.length === 0) process.exit(0);
  } else if (Array.isArray(toolInput.Subagents)) {
    // Antigravity runner's native invoke_subagent shape: capitalized, array-wrapped.
    dispatches = extractAntigravityDispatches(toolInput.Subagents);
    if (dispatches.length === 0) process.exit(0);
  } else {
    process.exit(0);
  }

  const blocked = dispatches
    .map((d) => dispatchFindings(d))
    .filter((r) => r.findings.length > 0);
  if (blocked.length === 0) process.exit(0);

  const { role, findings } = blocked[0];
  const template = role === "critic" ? "templates/prompts/critic-review.md" : "templates/prompts/goldfish-task.md";
  process.stderr.write([
    `BLOCKED (guard-dispatch, plugin pipeline-core): this ${role} dispatch was not built from ${template}.`,
    "",
    ...findings.map((f, i) => `  ${i + 1}. ${f.code}\n     ${f.why}`),
    "",
    `Fill ${template} and dispatch that. The template is not a suggestion: it already forbids`,
    "every pattern listed above, in those words. A review steered by the dispatcher's own",
    "hypotheses is not an independent review, and an incomplete briefing is not dispatchable.",
    "",
    "This check is structural. It cannot see a steer written in fresh prose — read the template.",
    "",
  ].join("\n"));
  process.exit(2);
}
