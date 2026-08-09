#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * Generate `templates/prompts/agent-obligations.md` from the guards themselves.
 *
 * WHY THIS EXISTS. Measured on 2026-08-08:
 *
 *   rg -c 'one simple command|closed shell grammar|GUARD-PARSE-UNSUPPORTED' \
 *      plugins/pipeline-core/agents templates/prompts roles
 *   → zero hits
 *
 * The rules every dispatch is judged by appeared in no artifact any dispatch
 * reads. Agents learned them by being refused, and a refusal written for a
 * different reader costs a retry, and every retry spends a tool use from the
 * budget that is also the stop condition. Three dispatches in one block burned
 * 50+ tool uses that way; one delivered nothing at all.
 *
 * WHY GENERATED RATHER THAN WRITTEN. The obvious fix — write the rules into the
 * dispatch template — is the defect this repository has already been bitten by
 * twice: a hand-written second copy of a rule a component owns drifts from it,
 * and nothing catches the drift. So the document is produced from the sources at
 * generation time, committed (agents read a file, not a program), and
 * `generate-agent-obligations.test.mjs` regenerates in memory and asserts byte
 * equality. Add a protected path to `guard-config.json` and that suite goes red
 * until this generator runs again.
 *
 * WHAT IS DERIVED, AND WHAT IS NOT. Derived: the protected-path table (from
 * `project/guard-config.json`), the draft-phase write prefixes (from
 * `guard-devplan.mjs`'s exported constant), the gate-strength shell exemption
 * (from `guard-lifecycle-ready.mjs`'s exported table), and the admitted/refused
 * command shapes (MEASURED by asking the guard's own exported predicates, not by
 * restating its documentation). Hand-maintained lines are marked as such in the
 * output itself, with the reason — an honestly marked one is acceptable, a
 * silent one is the defect.
 *
 * Usage:
 *   node harness/scripts/generate-agent-obligations.mjs            # write the document
 *   node harness/scripts/generate-agent-obligations.mjs --stdout   # print, write nothing
 *   node harness/scripts/generate-agent-obligations.mjs --root <dir>  # derive from another checkout (used by the drift test)
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { isDirectInvocation } from "../../plugins/pipeline-core/lib/entrypoint.mjs";
import { DEFAULT_EXEMPT_PREFIXES } from "../../plugins/pipeline-core/lib/guard-devplan-policy.mjs";
import {
  GATE_STRENGTH_SHELL_READ_ONLY_SCRIPTS,
  isReadOnlyDiagnosticCommand,
  retryActionsForDeniedCommand,
} from "../../plugins/pipeline-core/hooks/guard-lifecycle-ready.mjs";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const OBLIGATIONS_PATH = join(REPO_ROOT, "templates", "prompts", "agent-obligations.md");

/**
 * The command shapes the document reports on. Nothing here asserts an outcome:
 * the outcome is asked of the guard below, so a grammar change rewrites the
 * document instead of contradicting it. Chosen to cover what actually cost this
 * repository time — the bounded read pipelines, the redirect forms, and the
 * multi-line commit message that lost a finished dispatch.
 */
const PROBE_COMMANDS = Object.freeze([
  "git status --short",
  "git rev-parse HEAD",
  "rg -n 'needle' file.txt",
  "rg -n 'needle' file.txt | head -20",
  "rg -n 'a' x | rg -n 'b'",
  "git commit -F msg.txt -- a.md",
  "git commit -m 'one line'",
  "git commit -m 'line one\n\nline two'",
  "git status && git log",
  "git status ; git log",
  "echo hi > out.txt",
  "cat a.txt 2>&1",
  "ls | tee out.txt",
]);

function display(command) {
  return command.replace(/\n/gu, "\\n");
}

/** Ask the guard's own exported predicates, never its prose. */
function measureGrammar(root) {
  return PROBE_COMMANDS.map((command) => ({
    command,
    admitted: isReadOnlyDiagnosticCommand(command, root) === true,
    retryActions: (retryActionsForDeniedCommand(command, root) ?? []).length,
  }));
}

function protectedPaths(root) {
  const raw = JSON.parse(readFileSync(join(root, "project", "guard-config.json"), "utf8"));
  return Array.isArray(raw?.protectedTestPaths) ? raw.protectedTestPaths : [];
}

export function renderAgentObligations({ rootDir = REPO_ROOT } = {}) {
  const paths = protectedPaths(rootDir);
  const grammar = measureGrammar(rootDir);
  const admitted = grammar.filter((row) => row.admitted);
  const refused = grammar.filter((row) => !row.admitted);
  const withRetry = refused.filter((row) => row.retryActions > 0);

  const lines = [];
  const put = (line = "") => lines.push(line);

  put("<!--");
  put("GENERATED FILE — do not edit by hand.");
  put("Produced by: harness/scripts/generate-agent-obligations.mjs");
  put("Pinned by:   harness/scripts/generate-agent-obligations.test.mjs (byte equality)");
  put("");
  put("Every rule below is read from the component that enforces it. Editing this");
  put("file instead of its source makes the suite red, which is the point: a");
  put("hand-written second copy of a rule a guard owns is what drifts.");
  put("-->");
  put();
  put("# Obligations every dispatched agent is measured against");
  put();
  put("Include this file's contents in every Goldfish and Critic briefing, or point");
  put("the agent at this path. These rules are enforced at runtime by the guard");
  put("union. Until this file existed they were stated nowhere an agent reads, and");
  put("agents learned them by being refused — which costs a retry, and every retry");
  put("spends a tool use from the budget that is also the stop condition.");
  put();

  put("## 1. One simple command per Bash call (the closed shell grammar)");
  put();
  put("<!-- hand-maintained: no component exports the grammar as data, so this rule");
  put("     is stated rather than derived. Source of truth:");
  put("     plugins/pipeline-core/hooks/guard-lifecycle-ready.mjs. The two tables");
  put("     below ARE measured. -->");
  put();
  put("`guard-lifecycle-ready` admits exactly **one simple command per tool call**.");
  put("No `&&`, no `;`, no redirects (`>`, `2>&1`, `| tee`), no line continuations.");
  put("Bounded `rg`-to-`rg` and `rg`-to-`head` diagnostic pipelines are the only");
  put("admitted composition.");
  put();
  put("The two workarounds that cost the most time before they were written down:");
  put();
  put("- **A multi-line commit message.** A `-m` value containing a newline is");
  put("  refused. Write the message to a file and use");
  put("  `git commit -F <msgfile> -- <paths>`. A finished dispatch once lost its own");
  put("  commit to this, with its files staged and its suites green.");
  put("- **Capturing output to a file.** `>`, `2>&1` and `| tee` are all refused.");
  put("  Write the file from Node instead.");
  put();
  put("One more, not enforced by a guard and therefore easy to miss: `rg -r` is");
  put("*replace*, so `rg -rn 'x'` silently means `rg -r n 'x'` and prints nonsense.");
  put("Use `rg -n`.");
  put();
  put("### 1a. What a NON-READY session may still run");
  put();
  put("Measured at generation time via `isReadOnlyDiagnosticCommand()`. This is the");
  put("narrow read-only lane that survives when readiness is lost — the state you are");
  put("in precisely when you most need to look around. It is **not** the full set a");
  put("ready session may run, which is wider.");
  put();
  for (const row of admitted) put(`- \`${display(row.command)}\``);
  put();
  put("### 1b. Which refusals carry a typed retry action");
  put();
  put("Measured via `retryActionsForDeniedCommand()`. A refusal with actions names a");
  put("narrower command you may run instead; one with none does not, and hunting for");
  put("a route it never offered is wasted budget.");
  put();
  put("| Command | Typed retry actions |");
  put("|---|---|");
  for (const row of refused) put(`| \`${display(row.command)}\` | ${row.retryActions} |`);
  put();
  put("## 2. Protected test paths — and there is no in-session override");
  put();
  put(`Derived from \`project/guard-config.json\` (${paths.length} entries). \`guard-testpath\``);
  put("refuses every Edit/Write against these. For Pipeline plugin source in a source");
  put("checkout the override does not help either, and the reason is specific rather");
  put("than general: `recordHumanGuardDenial()` takes the `eligible.authorCandidate`");
  put("branch (`plugins/pipeline-core/lib/human-guard-override.mjs`) and returns");
  put("`status: \"author-repair-required\"` instead of `\"planned\"`. Author repair needs");
  put("an explicit author source root, which a guard will not select on a human's");
  put("behalf. **Needing one of these is a stop condition — report it, do not hunt for");
  put("a route.**");
  put();
  put("| Id | Pattern (verbatim) |");
  put("|---|---|");
  for (const entry of paths) put(`| \`${entry.id}\` | \`${entry.pattern}\` |`);
  put();
  put("This is not a blanket rule about `plugins/pipeline-core/**`: files under that");
  put("tree that match no pattern above are ordinarily editable.");
  put();

  put("## 3. Where a draft-phase write is allowed");
  put();
  put("`guard-devplan` blocks implementation writes before plan approval, and exempts");
  put("these prefixes (derived from its exported `DEFAULT_EXEMPT_PREFIXES`):");
  put();
  for (const prefix of DEFAULT_EXEMPT_PREFIXES) put(`- \`${prefix}\``);
  put();
  put("`scratch/` is the right place for a probe or a throwaway fixture. Note what it");
  put("is **not**: onboarding does not add it to a project's `.gitignore`, and in the");
  put("Pipeline's own repository it *is* ignored — so anything durable left there is");
  put("lost. Move it to a tracked path before you finish.");
  put();

  put("## 4. Read-only scripts exempt from the gate-strength shell lane");
  put();
  put("Derived from `guard-lifecycle-ready`'s exported table. A command naming one of");
  put("these is not treated as a write to a gate-strength path:");
  put();
  for (const entry of GATE_STRENGTH_SHELL_READ_ONLY_SCRIPTS) put(`- \`${entry.path}\``);
  put();

  put("## 5. Which refusals can be lifted, and by whom");
  put();
  put("Do not guess, and do not read a table — **ask**:");
  put();
  put("```");
  put("node <plugin-root>/scripts/repair-map.mjs");
  put("```");
  put();
  // OBLIGROUTE-2. This printed the repository-relative form until 2026-08-09, and the
  // lifecycle guard refuses it: its admission compares against the absolute path of the
  // INSTALLED plugin's own copy, resolved from that module's import.meta.url, and its
  // test pins that a same-named script under any other root stays refused. So the one
  // command this section exists to hand an agent was itself blocked in the non-ready
  // state that most needs it -- the guard was fixed and the signpost was not.
  put("`<plugin-root>` is the absolute path the bootstrap printed as `plugin root`;");
  put("substitute it yourself. The guard admits that exact path and nothing else — a");
  put("copy of the same script inside the project tree is a different program and stays");
  put("refused — which is why no repository-relative form of this command works.");
  put();
  put("It queries the real override planner at runtime and separates three answers");
  put("that all look like \"refused\" from the outside: never liftable by construction,");
  put("never liftable by policy, and author-repair-required — which is not \"no route\"");
  put("but \"a route this session cannot select on a human's behalf\". This file");
  put("deliberately carries no static copy of that; a second copy is the drift.");
  put();

  put("## 6. Commit discipline");
  put();
  put("<!-- hand-maintained: these are role/policy rules (GIT-03, the shared-index");
  put("     race), not values any guard exports, so no generator can derive them. -->");
  put();
  put("- `git add -- <exact paths>` then `git commit -F <msgfile> -- <same paths>`, as");
  put("  two consecutive calls. Never `git add -A`, never `git add .`, never a bare");
  put("  `git commit` — in a shared working tree a wildcard add lets another agent's");
  put("  files ride along on your commit.");
  put("- Commit messages carry **no** provider or model co-author trailers, **no**");
  put("  session URLs, **no** correlation identifiers (GIT-03; there is no override).");
  put("  Only `Dispatch: <TASK_ID> (goldfish)` and `AI-Assisted: true`.");
  put("- Commit as soon as a piece is green, not at the very end. A commit that exists");
  put("  survives a truncated run; a commit that is only planned does not.");
  put();
  return `${lines.join("\n")}\n`;
}

if (isDirectInvocation(import.meta.url)) {
  const argv = process.argv.slice(2);
  const rootDir = argv.includes("--root") ? argv[argv.indexOf("--root") + 1] : REPO_ROOT;
  const rendered = renderAgentObligations({ rootDir });
  if (argv.includes("--stdout")) process.stdout.write(rendered);
  else {
    writeFileSync(OBLIGATIONS_PATH, rendered, "utf8");
    process.stdout.write(`wrote templates/prompts/agent-obligations.md (${Buffer.byteLength(rendered, "utf8")} bytes)\n`);
  }
}
