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
 */
import { readFileSync } from "node:fs";

import { dispatchFindings } from "../lib/dispatch-policy.mjs";

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
if (typeof subagentType !== "string" || subagentType === "" || typeof prompt !== "string") process.exit(0);

const { role, findings } = dispatchFindings({ subagentType, prompt });
if (findings.length === 0) process.exit(0);

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
