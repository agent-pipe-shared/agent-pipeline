#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * Fill templates/prompts/goldfish-task.md into a dispatchable briefing file, verbatim.
 *
 * PURPOSE. CLAUDE.md ("Dispatch from the template, never freehand") forbids a hand-written briefing. The
 * template body is long and a hand copy drifts, so this script copies the body after the template's
 * `COPY EVERYTHING BELOW THIS LINE` sentinel plus its `## Final report` section byte for byte and only
 * replaces the `{{...}}` placeholders from a closed JSON spec. It is the route for a fix-wave task that has no
 * Alfred acceptance row: `dispatch-briefing.mjs binding` refuses such a task with DBG-AC-ROW-MISSING, and
 * the host-commit binding it would produce commits in the dispatcher's checkout, not in a clone.
 *
 * USAGE. node scripts/fill-goldfish-briefing.mjs --spec <spec.json> --out <briefing.md>
 *   Both paths are repository-relative; --out must be under scratch/. The spec is a flat JSON object:
 *   required strings: taskId, title, date, rulesetSha, project, calibration, goal, specPath, specSections,
 *     file2, file3, ac, resource, targeted, quick, broader, finalVerify, fileListRef, noGo, prohibitions,
 *     stops, modelEffort, justification, worktree, profile, toolBudget
 *   optional (null or absent deletes the line): additional, advisor, sanitization, accounting
 * Refuses (exit 2) on a missing key, an unknown placeholder or a leftover `{{`. Writes exactly one file.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, relative } from "node:path";

const TEMPLATE = "templates/prompts/goldfish-task.md";
const SENTINEL = "COPY EVERYTHING BELOW THIS LINE\n-->\n";

function fail(message) {
  console.error(JSON.stringify({ schema: "pipeline.fill-goldfish-briefing.refusal.v1", ok: false, message }));
  process.exit(2);
}

const args = process.argv.slice(2);
const flags = {};
for (let i = 0; i < args.length; i += 2) {
  if (!["--spec", "--out"].includes(args[i]) || typeof args[i + 1] !== "string") fail("usage: --spec <spec.json> --out <scratch/briefing.md>");
  flags[args[i]] = args[i + 1];
}
if (!flags["--spec"] || !flags["--out"]) fail("usage: --spec <spec.json> --out <scratch/briefing.md>");
const outRel = relative(process.cwd(), resolve(flags["--out"]));
if (!outRel.startsWith("scratch/")) fail("--out must be under scratch/");

const spec = JSON.parse(readFileSync(flags["--spec"], "utf8"));
const required = ["taskId", "title", "date", "rulesetSha", "project", "calibration", "goal", "specPath", "specSections",
  "file2", "file3", "ac", "resource", "targeted", "quick", "broader", "finalVerify", "fileListRef", "noGo",
  "prohibitions", "stops", "modelEffort", "justification", "worktree", "profile", "toolBudget"];
for (const key of required) if (typeof spec[key] !== "string" || spec[key].trim() === "") fail(`spec key ${key} is missing or empty`);

const KEY = {
  TASK_ID: "taskId", SHORT_TITLE: "title", DATE: "date", RULESET_SHA: "rulesetSha", PROJECT_NAME: "project",
  CALIBRATION_FILE: "calibration", OUTCOME: "goal", SPEC_PATH: "specPath", RELEVANT_SECTIONS: "specSections",
  FILE_2: "file2", FILE_3: "file3", AC_IDS: "ac", PROJECT_RESOURCE_OBSERVATIONS_AND_MEASUREMENT_ROUTE: "resource",
  TARGETED_CHECK_COMMANDS_AND_AC_IMPACT_SCOPE: "targeted", QUICK_CHECK_ROUTE: "quick", BROADER_CHECKS_AND_OWNER: "broader",
  FINAL_INTEGRATED_VERIFY_COMMAND_AND_SCOPE: "finalVerify", ADDITIONAL_CHECKS: "additional", FILE_LIST_REF: "fileListRef",
  NO_GO_PATHS: "noGo", ADVISOR_DEMAND_LINE: "advisor", SANITIZATION_DOD: "sanitization", ACCOUNTING_ATTRIBUTION: "accounting",
  TASK_SPECIFIC_PROHIBITIONS: "prohibitions", TASK_SPECIFIC_STOPS: "stops", MODEL_EFFORT: "modelEffort",
  MODEL_JUSTIFICATION: "justification", WORKTREE: "worktree", standard: "profile", TOOL_BUDGET: "toolBudget",
};
const OPTIONAL = new Set(["additional", "advisor", "sanitization", "accounting"]);

const template = readFileSync(TEMPLATE, "utf8");
const start = template.indexOf(SENTINEL);
if (start < 0) fail("template sentinel not found");
const bodyFrom = template.slice(start + SENTINEL.length);
const modules = bodyFrom.indexOf("\n---\n\n## Optional module: BUGFIX");
const finalReport = bodyFrom.indexOf("\n---\n\n## Final report");
if (modules < 0 || finalReport < 0) fail("template section markers not found");
// The one host directive belongs to the native host-commit binding, which this route does not insert (the work is
// committed in a clone); left in, it would contradict the briefing's own commit instructions.
const text = (bodyFrom.slice(0, modules) + bodyFrom.slice(finalReport))
  .replace(/^NATIVE HOST-COMMIT RULE:[^\n]*\n\n?/m, "");

// An optional placeholder with no value deletes its whole (single-line) bullet; placeholders may span lines.
const TOKEN_OF = (inner) => inner.trim().split(/[\s:,]/)[0];
const dropped = text.replace(/^[^\n]*\{\{([^}\n]*)\}\}[^\n]*\n/gm, (line, inner) => {
  const key = KEY[TOKEN_OF(inner)];
  return key && OPTIONAL.has(key) && (spec[key] === null || spec[key] === undefined) ? "" : line;
});
// Placeholders inside the template's own worked example of the `modelOverride` record field stay literal.
const PASSTHROUGH = new Set(["CONCRETE_MODEL", "EFFORT", "MP-05/MP-07"]);
const out = dropped.replace(/\{\{([^}]*)\}\}/g, (whole, inner) => {
  if (PASSTHROUGH.has(TOKEN_OF(inner))) return whole;
  const key = KEY[TOKEN_OF(inner)];
  if (!key) fail(`unknown placeholder ${whole.slice(0, 60)}`);
  if (typeof spec[key] !== "string") fail(`spec key ${key} must be a string`);
  return spec[key];
});
const leftover = out.replace(/\{\{(CONCRETE_MODEL|EFFORT|MP-05\/MP-07)[^}]*\}\}/g, "");
if (leftover.includes("{{")) fail("an unfilled placeholder remains");
writeFileSync(flags["--out"], out);
console.log(JSON.stringify({ ok: true, out: outRel, bytes: Buffer.byteLength(out) }));
