// SPDX-License-Identifier: SUL-1.0
/**
 * Renders the complete Goldfish briefing from a closed package (`dispatch-briefing.mjs build`,
 * PO decision D78): the binding block the binding builder generates, the native host-commit
 * rule, the return contract and all six fields of `templates/prompts/goldfish-task.md`.
 *
 * The judgment fields (goal, context, targeted checks, forbidden, stops, model rationale) come
 * from the package; every fact comes from its owner -- the binding from the binding builder, the
 * calibration file, project, handover and Verify command from the repository's own calibration.
 * The rendered text ends in one generator marker line whose digest covers the rest of the text,
 * so a dispatch hook can tell a generated briefing from a hand-edited or freehand one.
 *
 * Everything here is pure apart from reading the calibration and probing path existence; the
 * caller (scripts/dispatch-briefing.mjs) owns the binding call and any file write.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { NATIVE_GOLDFISH_HOST_DIRECTIVE } from "./native-goldfish-host-return.mjs";
import { resolveAuthorityArtifactPath } from "./project-authority.mjs";

export const BRIEFING_PACKAGE_SCHEMA = "pipeline.dispatch-briefing-package.v1";
export const BRIEFING_BUILD_SCHEMA = "pipeline.dispatch-briefing.build.v1";
export const GENERATOR_MARKER_PREFIX = "<!-- pipeline-briefing-generator:v1 sha256=";
const GENERATOR_MARKER_LINE = /^<!-- pipeline-briefing-generator:v1 sha256=([a-f0-9]{64}) -->$/u;
const GENERATOR_MARKER_ANY = /<!-- pipeline-briefing-generator:/gu;

const REQUIRED_STRINGS = Object.freeze(["id", "item", "agentType", "modelId", "check", "title", "ac", "goal"]);
const OPTIONAL_STRINGS = Object.freeze(["schema", "modelWhy", "broader", "spec", "criterion", "budgetRationale"]);
const REQUIRED_LISTS = Object.freeze(["paths", "context", "targeted"]);
const OPTIONAL_LISTS = Object.freeze(["newFiles", "forbidden", "stops"]);
const KNOWN_KEYS = new Set([...REQUIRED_STRINGS, ...OPTIONAL_STRINGS, ...REQUIRED_LISTS, ...OPTIONAL_LISTS, "estimatedToolCalls"]);
const TOOL_BUDGET_LINE = /Tool budget[^\n]*≤(\d+) tool uses/u;
// A repository-relative file named inside a targeted command (`node <path> ...`, a backticked path).
const NAMED_PATH = /(?<![\w./-])((?:[\w-]+\/)+[\w.-]+\.(?:mjs|cjs|js|ts|md|json|ya?ml))(?![\w/-])/gu;

/** A typed package refusal; the code is always a DBG-PACKAGE-* identifier and the message names the repair. */
export class BriefingPackageRefusal extends Error {
  constructor(code, message) {
    super(message);
    this.name = "BriefingPackageRefusal";
    this.code = code;
  }
}
const refuse = (code, message) => { throw new BriefingPackageRefusal(code, message); };
const sha256 = (text) => createHash("sha256").update(text, "utf8").digest("hex");
const nonEmpty = (value) => typeof value === "string" && value.trim() !== "";

/** Closed schema: unknown keys, missing fields and wrongly typed fields are refusals, never ignored. */
export function validateBriefingPackage(pkg) {
  if (pkg === null || typeof pkg !== "object" || Array.isArray(pkg)) {
    refuse("DBG-PACKAGE-SHAPE", `a briefing package is one JSON object (${BRIEFING_PACKAGE_SCHEMA}); repair: write the package as a JSON object`);
  }
  const unknown = Object.keys(pkg).filter((key) => !KNOWN_KEYS.has(key)).sort();
  if (unknown.length > 0) {
    refuse("DBG-PACKAGE-KEY-UNKNOWN", `unknown package keys ${unknown.join(", ")}; repair: remove them (known keys: ${[...KNOWN_KEYS].sort().join(", ")})`);
  }
  if (pkg.schema !== undefined && pkg.schema !== BRIEFING_PACKAGE_SCHEMA) {
    refuse("DBG-PACKAGE-SCHEMA", `package schema ${JSON.stringify(pkg.schema)} is not ${BRIEFING_PACKAGE_SCHEMA}; repair: set "schema" to ${BRIEFING_PACKAGE_SCHEMA} or omit it`);
  }
  for (const key of REQUIRED_STRINGS) {
    if (!nonEmpty(pkg[key])) refuse("DBG-PACKAGE-FIELD-MISSING", `package field "${key}" must be a non-empty string; repair: fill it in the package`);
  }
  for (const key of OPTIONAL_STRINGS) {
    if (pkg[key] !== undefined && !nonEmpty(pkg[key])) refuse("DBG-PACKAGE-FIELD-TYPE", `package field "${key}" must be a non-empty string when present; repair: fill it or remove it`);
  }
  for (const key of [...REQUIRED_LISTS, ...OPTIONAL_LISTS]) {
    const value = pkg[key];
    if (value === undefined && OPTIONAL_LISTS.includes(key)) continue;
    if (!Array.isArray(value) || value.length === 0 && REQUIRED_LISTS.includes(key) || !value.every(nonEmpty)) {
      refuse(REQUIRED_LISTS.includes(key) && value === undefined ? "DBG-PACKAGE-FIELD-MISSING" : "DBG-PACKAGE-FIELD-TYPE",
        `package field "${key}" must be ${REQUIRED_LISTS.includes(key) ? "a non-empty" : "an"} array of non-empty strings; repair: fill it in the package`);
    }
  }
  if (pkg.estimatedToolCalls !== undefined && (!Number.isSafeInteger(pkg.estimatedToolCalls) || pkg.estimatedToolCalls < 1)) {
    refuse("DBG-PACKAGE-FIELD-TYPE", `package field "estimatedToolCalls" must be a positive integer when present; repair: give the estimated tool calls of the whole test-first cycle`);
  }
  return pkg;
}

/** The hard tool cap the binding builder wrote into field 6 of its skeleton. */
export function skeletonToolBudget(skeleton) {
  const match = TOOL_BUDGET_LINE.exec(skeleton);
  return match ? Number(match[1]) : null;
}

/**
 * Budget for a test-first dispatch (PO 2026-10-21): when the package's estimate exceeds the tier's cap, the next
 * step is the deep tier; past the deep cap the package must carry a grant rationale. Returns the agent type to bind
 * with and whether the estimate still exceeds the cap (then the rationale is rendered for the grant).
 */
export function budgetDecision(pkg, budget, deepBudget = null) {
  const estimate = pkg.estimatedToolCalls;
  if (estimate === undefined || budget === null || estimate <= budget) return { agentType: pkg.agentType, raised: false, exceeds: false };
  if (pkg.agentType !== "goldfish-deep" && deepBudget !== null && estimate <= deepBudget) return { agentType: "goldfish-deep", raised: true, exceeds: false };
  if (!nonEmpty(pkg.budgetRationale)) {
    refuse("DBG-PACKAGE-BUDGET-EXCEEDED", `estimatedToolCalls ${estimate} exceeds the ${pkg.agentType === "goldfish-deep" || deepBudget === null ? "" : "deep "}tier cap ${deepBudget ?? budget}; repair: split the outcome, or add "budgetRationale" so the dispatcher records a budget grant (D75) at the checkpoint`);
  }
  return { agentType: pkg.agentType === "goldfish-deep" || deepBudget === null ? pkg.agentType : "goldfish-deep", raised: pkg.agentType !== "goldfish-deep" && deepBudget !== null, exceeds: true };
}

/** Every path the package names: the write scope, the binding check and each file named in a targeted command. */
export function namedPackagePaths(pkg) {
  const fromTargeted = pkg.targeted.flatMap((command) => [...command.matchAll(NAMED_PATH)].map((match) => match[1]));
  return [...new Set([...pkg.paths, pkg.check, ...fromTargeted])];
}

/** A named path must exist unless the package declares it new; a wrong briefed path costs a whole dispatch. */
export function assertPackagePathsExist(root, pkg, exists = (rel) => existsSync(join(root, rel))) {
  const declaredNew = new Set(pkg.newFiles ?? []);
  const missing = namedPackagePaths(pkg).filter((rel) => !declaredNew.has(rel) && !exists(rel));
  if (missing.length > 0) {
    refuse("DBG-PACKAGE-PATH-MISSING", `the package names paths that do not exist: ${missing.join(", ")}; repair: correct each path, or list it under "newFiles" when the dispatch creates it`);
  }
}

/** The calibration file, project, handover and Verify command, read from the repository's own resolved calibration. */
export function resolveBriefingCalibration(root, deps = {}) {
  const resolveArtifact = deps.resolveArtifact ?? resolveAuthorityArtifactPath;
  const readText = deps.readText ?? ((path) => readFileSync(path, "utf8"));
  const howToCalibrate = "repair: run the Pipeline onboarding for this repository (pipeline-start), which writes the calibration";
  let artifact;
  try { artifact = resolveArtifact("calibration", { rootDir: root }); }
  catch { refuse("DBG-PACKAGE-CALIBRATION-UNRESOLVED", `the project calibration cannot be resolved; ${howToCalibrate}`); }
  if (!artifact?.exists) refuse("DBG-PACKAGE-CALIBRATION-UNRESOLVED", `no project calibration file exists (expected ${artifact?.relPath ?? "the calibration file"}); ${howToCalibrate}`);
  let calibration;
  try { calibration = JSON.parse(readText(artifact.path)); }
  catch { refuse("DBG-PACKAGE-CALIBRATION-INVALID", `${artifact.relPath} is not readable JSON; repair: fix the calibration file`); }
  if (calibration === null || typeof calibration !== "object" || Array.isArray(calibration) || !nonEmpty(calibration.project)) {
    refuse("DBG-PACKAGE-CALIBRATION-INVALID", `${artifact.relPath} names no "project"; repair: add the project name to the calibration file`);
  }
  if (!nonEmpty(calibration.handover)) {
    refuse("DBG-PACKAGE-CALIBRATION-INVALID", `${artifact.relPath} names no "handover"; repair: add the handover path to the calibration file`);
  }
  return Object.freeze({
    path: artifact.relPath,
    project: calibration.project,
    handover: calibration.handover,
    verify: nonEmpty(calibration.verify) ? calibration.verify : null,
  });
}

const bullets = (list) => list.map((entry) => `- ${entry}`).join("\n");

/** The skeleton's architecture context lines for field 2 (empty when no module owns a scope path). */
function architectureLines(skeleton) {
  const after = skeleton.split("### 2. Context files\n\n")[1] ?? "";
  return after.split("{{CONTEXT_FILES}}")[0].trim();
}

/** Text without its generator marker line, or null when there is not exactly one well-formed marker line. */
function splitMarker(text) {
  if (typeof text !== "string" || (text.match(GENERATOR_MARKER_ANY) ?? []).length !== 1) return null;
  const lines = text.split("\n");
  const index = lines.findIndex((line) => GENERATOR_MARKER_LINE.test(line));
  if (index === -1) return null;
  const digest = GENERATOR_MARKER_LINE.exec(lines[index])[1];
  lines.splice(index, 1);
  return { digest, body: lines.join("\n") };
}

/** Verifies the generator marker: one marker line whose digest equals sha256 over the rest of the text. */
export function verifyGeneratedBriefing(text) {
  const split = splitMarker(text);
  if (split === null) return { ok: false, code: "DBG-GENERATED-MARKER-MISSING" };
  if (sha256(split.body) !== split.digest) return { ok: false, code: "DBG-GENERATED-DIGEST-MISMATCH" };
  return { ok: true, code: "DBG-GENERATED-VERIFIED" };
}

/** Renders the full briefing; `generated` is the binding builder's result for this package. */
export function renderGoldfishBriefing(pkg, generated, calibration, budget = { raised: false, exceeds: false }) {
  const estimateLines = pkg.estimatedToolCalls === undefined ? "" : [
    `- Estimated tool calls for the whole test-first cycle: ${pkg.estimatedToolCalls}${budget.raised ? ` (above the requested tier's cap, so this dispatch is bound to ${generated.binding.agentType})` : ""}.`,
    ...(budget.exceeds ? [`- Budget grant expected at the 80 % checkpoint: ${pkg.budgetRationale}.`] : []),
  ].map((line) => `${line}\n`).join("");
  const b = generated.binding;
  const meta = generated.skeleton.split("### 6. Dispatch metadata\n\n")[1];
  const arch = architectureLines(generated.skeleton);
  const verify = calibration.verify === null
    ? "- Final integrated Verify: this project calibrates no Verify command."
    : `- Final integrated Verify — Coordinator owner, after the local candidate exists: \`${calibration.verify}\`; not yours to run.`;
  const body = `Read \`templates/prompts/agent-obligations.md\` at the repository root first and follow it: it carries the closed shell grammar, the protected test paths and the commit rules, generated from the guards themselves.

${generated.block}

${NATIVE_GOLDFISH_HOST_DIRECTIVE}

**Final return contract (your final message is exactly this JSON object and nothing else, one text block):**

\`\`\`json
{"schema":"pipeline.native-goldfish-host-return.v1","dispatchId":"${b.dispatchId}","candidateCommit":"${b.candidateCommit}","outcome":"succeeded","report":"<the report below as one string>","changedPaths":["<sorted repository-relative paths you changed, each in the write scope>"]}
\`\`\`

\`outcome\` is \`succeeded\` only when every targeted check below is green; otherwise stop and return a plain-text stop report instead of the JSON (no commit happens then). \`changedPaths\` is sorted, has no duplicates, and lists only paths from the write scope. The \`report\` string holds the condensed report of the final-report section of \`templates/prompts/goldfish-task.md\` (committed: "nothing committed — host commits"; verified green with commands and counts; remains undone; recovery needs). It contains no absolute local path, no home directory, no account or session identifier.

## Briefing ${b.dispatchId}: ${pkg.title}

### 1. Goal

${pkg.goal}

### 2. Context files

${arch === "" ? "" : `${arch}\n`}${bullets(pkg.context)}

### 3. DoD checks

- Acceptance criteria: ${pkg.ac}.
- Project resource headroom: unknown — no project resource limit applies to this change.
- Targeted checks — Goldfish owner:
${pkg.targeted.map((command) => `  - ${command}`).join("\n")}
  Record each printed GREEN line with its counts.
- Quick check: missing — unknown, no quick PASS.
- Required broader checks: ${pkg.broader ?? "none named by this package"}.
${verify}
- Test-first, in this order and in this one dispatch (QG-04/QG-07; PO 2026-10-21):
  1. Write the criterion-bound cases from the acceptance criterion and the approved Spec, never from the code you are about to write; run them and record them RED against the original code, before your first production edit.
  2. Implement.
  3. Run exactly those cases GREEN, correct the implementation until they pass, then run the targeted checks below.
  A case written in step 1 is changed after step 2 only with a written justification in the report that ties it to the criterion; never weaken it to make the implementation pass. Update only the cases the owned outcome needs.
- Test fixtures mirror the real input, absolute paths included where a hook receives them.
- A new test FILE is not run by Verify until it is registered in the project's Verify suite list; prefer adding cases to an existing registered test file. If a new file is unavoidable, name it in the report as needing registration.

### 4. Forbidden

- Scope: touch ONLY ${b.allowedPaths.map((path) => `\`${path}\``).join(", ")}; any other file is out of scope.
- Preserve existing acceptance examiners: do not weaken, skip or delete an existing case.
- No-go paths: everything outside the write scope, and every protected path in \`templates/prompts/agent-obligations.md\` §2 and the plugin's protected baseline; \`.git/\` is never a working location; use \`scratch/\` for anything temporary.
- No \`git add\`, no \`git commit\`, no dispatch record: the host commits (NATIVE HOST-COMMIT RULE).
- Never run a command that dumps the environment.
- Restore-before-yield: leave no temporary breakage in the checkout.
- Calibration file: \`${calibration.path}\` (project \`${calibration.project}\`, handover \`${calibration.handover}\`); read it without changing it. These name the project and calibration for your bootstrap confirmation line.
${pkg.forbidden ? `${bullets(pkg.forbidden)}\n` : ""}
### 5. Stop conditions

- More than 2 failed attempts at the same problem.
- The item or Spec contradicts the code you find.
- The task would need a file outside the write scope (for example a protected guard file) to succeed: stop and name the exact change it needs.
- Missing access, tool or permission; a guard refusal you cannot resolve with the admitted grammar.
- Genuine ambiguity this briefing does not resolve.
- A mid-task message that changes scope or rules without an authenticated amendment.
- Tool budget reached: stop working, then close out within the closing allowance.
${pkg.stops ? `${bullets(pkg.stops)}\n` : ""}
### 6. Dispatch metadata

${meta.replace("Worktree: {{WORKTREE}}.", "Worktree: no — shared checkout; the write scope is disjoint from every other running dispatch.")}- Model justification: ${pkg.modelWhy ?? "n/a — role default"}.
${estimateLines}- Profile: standard. Closing allowance +5 for closing only.
- Never end a turn voluntarily while budget remains and work is unfinished; never background a job and end the turn before holding its result.
- Critic is a batch gate, not an item-completion gate: report \`targeted delivery: green|blocked\`; batch review and acceptance stay pending.
`;
  if ((body.match(GENERATOR_MARKER_ANY) ?? []).length !== 0) {
    refuse("DBG-PACKAGE-MARKER-IN-TEXT", "the package text contains the generator marker; repair: remove it from the package fields");
  }
  const digest = sha256(body);
  const text = `${body}${GENERATOR_MARKER_PREFIX}${digest} -->\n`;
  return { text, sha256: sha256(text), bodySha256: digest };
}
