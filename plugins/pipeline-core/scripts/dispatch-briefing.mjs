#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * Read-only generator for the native Goldfish dispatch binding and the six-field briefing
 * skeleton (`binding` subcommand).
 *
 * WHY THIS EXISTS. A first Goldfish dispatch needed four attempts because the ruleset identity
 * and the model id could not be queried and every required field only surfaced as a refusal; a
 * hand-kept dispatcher script then made real mistakes (a hard-coded effort, the binding's
 * opening marker quoted in briefing prose, a stale hard-coded ruleset SHA). Every fact below is
 * therefore READ from the component that owns it and never typed:
 *
 *   candidateCommit / candidateTree  HEAD of --root (read-only git)
 *   effort + model alias             agents/<type>.md through lib/agent-model-registry.mjs
 *   model                            --model-id, checked against the alias's family
 *   tool budget                      min(tier cap, maxTurns - 15), the cap read from dispatch-policy
 *   rulesetSha                       the preflight's loaded content identity (no fallback)
 *   itemDelivery                     the acceptance row's own byte span, validated with the host's
 *                                    criterion parser, and the backlog item's own `id:`
 *
 * The generator calls no model, writes no file and runs no mutating git command. Judgment
 * fields (goal, context, DoD, forbidden, stop) stay hand-authored from the template.
 */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { dirname, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";
import {
  NATIVE_GOLDFISH_HOST_DIRECTIVE,
  NATIVE_GOLDFISH_ITEM_BRIEFING_SCHEMA,
  parseNativeGoldfishBriefing,
  validateItemDeliveryBriefing,
} from "../lib/native-goldfish-host-return.mjs";
import { modelBelongsToFamily, parseAgentFrontmatter, resolveAgentModel } from "../lib/agent-model-registry.mjs";
import { parseAcceptedCriticCriterion } from "../lib/critic-accepted-contract.mjs";
import { dispatchBudgetLineForRole } from "../lib/dispatch-policy.mjs";
import { protectedBaselineRuleFor, resolveProtectedBaseline } from "../lib/protected-baseline.mjs";
import { resolveProjectAuthorityPaths } from "../lib/project-authority.mjs";
import { observePipelineStartPreflight } from "./pipeline-start-preflight.mjs";

export const DISPATCH_BINDING_SCHEMA = "pipeline.dispatch-briefing.binding.v1";
export const DISPATCH_REFUSAL_SCHEMA = "pipeline.dispatch-briefing.refusal.v1";

const BLOCK_OPEN = "<!-- pipeline-native-goldfish-host-commit:v3";
const BLOCK_CLOSE = "-->";
const AGENT_TYPES = Object.freeze(["goldfish-implementor", "goldfish-mechanic", "goldfish-deep"]);
const ACCEPTED_CRITERION_STATUSES = Object.freeze(["explicit-actual-independent-pass", "no-explicit-criterion"]);
const SINGLE_FLAGS = Object.freeze({
  "--root": "root", "--dispatch-id": "dispatchId", "--item": "item", "--agent-type": "agentType",
  "--model-id": "modelId", "--check": "check", "--spec": "spec",
});
const REPEATED_FLAGS = Object.freeze({ "--path": "paths" });
const REQUIRED_FLAGS = Object.freeze(["--dispatch-id", "--item", "--agent-type", "--model-id", "--check"]);
const READ_ONLY_GIT = new Set(["rev-parse", "status"]);
const OID = /^[a-f0-9]{40}(?:[a-f0-9]{24})?$/u;
const SHA = /^[a-f0-9]{64}$/u;
const ITEM_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const DEFAULT_AGENTS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..", "agents");

/** A typed, caller-visible refusal; the code is always a DBG-* identifier. */
export class BriefingRefusal extends Error {
  constructor(code, message) {
    super(message);
    this.name = "BriefingRefusal";
    this.code = code;
  }
}
const refuse = (code, message) => { throw new BriefingRefusal(code, message); };
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

/** Mirrors the host parser's path rule (that function is module-private there). */
function validRepoPath(value) {
  return typeof value === "string" && value.length > 0 && value.length <= 240
    && !/[\\\0\r\n]/u.test(value) && !value.startsWith("/") && !/^[A-Za-z]:/u.test(value)
    && value.split("/").every((part) => part !== "" && part !== "." && part !== ".." && part !== ".git");
}

/** Strict flag parse: unknown, repeated and valueless flags are refusals, never ignored. */
export function parseBindingArgv(argv) {
  if (!Array.isArray(argv) || argv[0] !== "binding") {
    refuse("DBG-SUBCOMMAND", `the only subcommand is "binding"; got ${JSON.stringify(argv?.[0] ?? null)}`);
  }
  const values = { paths: [] };
  for (let index = 1; index < argv.length; index++) {
    const token = argv[index];
    if (typeof token !== "string" || !token.startsWith("--")) refuse("DBG-ARGUMENT-UNEXPECTED", `unexpected argument ${JSON.stringify(token)}; every input is a --flag`);
    const equals = token.indexOf("=");
    const flag = equals === -1 ? token : token.slice(0, equals);
    const single = Object.hasOwn(SINGLE_FLAGS, flag);
    if (!single && !Object.hasOwn(REPEATED_FLAGS, flag)) refuse("DBG-FLAG-UNKNOWN", `unknown flag ${flag}`);
    let value;
    if (equals !== -1) value = token.slice(equals + 1);
    else {
      value = argv[index + 1];
      if (typeof value !== "string" || value.startsWith("--")) refuse("DBG-FLAG-VALUE", `flag ${flag} needs a value`);
      index++;
    }
    if (value === "") refuse("DBG-FLAG-VALUE", `flag ${flag} needs a non-empty value`);
    if (single) {
      const key = SINGLE_FLAGS[flag];
      if (Object.hasOwn(values, key)) refuse("DBG-FLAG-REPEATED", `flag ${flag} may be given once`);
      values[key] = value;
    } else values.paths.push(value);
  }
  for (const flag of REQUIRED_FLAGS) {
    if (!Object.hasOwn(values, SINGLE_FLAGS[flag])) refuse("DBG-FLAG-MISSING", `required flag ${flag} is missing`);
  }
  return values;
}

function defaultGit(root, args) {
  if (!READ_ONLY_GIT.has(args[0])) throw new Error(`refusing non-read-only git subcommand ${args[0]}`);
  return execFileSync("git", ["--no-optional-locks", "-C", root, ...args], {
    encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 30000,
  });
}

function defaultSpecPathFromState(root) {
  try {
    const paths = resolveProjectAuthorityPaths({ rootDir: root });
    if (paths.status !== "ready" || typeof paths.state !== "string") return null;
    const specPath = JSON.parse(readFileSync(resolve(root, paths.state), "utf8"))?.planSubmission?.specPath;
    return typeof specPath === "string" ? specPath : null;
  } catch { return null; }
}

/** A regular, non-symlinked file strictly inside the (already real) root, or null. */
function readRepoFile(root, rel) {
  try {
    const absolute = resolve(root, rel);
    const inside = relative(root, absolute);
    if (inside === "" || inside.startsWith("..") || realpathSync(absolute) !== absolute) return null;
    const info = lstatSync(absolute);
    return info.isSymbolicLink() || !info.isFile() ? null : readFileSync(absolute);
  } catch { return null; }
}

/** Find the 3-column acceptance-table rows whose Criterion cell names the item; byte spans are exact. */
function findCriterionRows(sourceBytes, needle) {
  const source = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(sourceBytes);
  const rows = [];
  let byteOffset = 0;
  for (const raw of source.split(/(?<=\n)/u)) {
    const text = raw.replace(/\r?\n$/u, "");
    const lineOffset = byteOffset;
    byteOffset += Buffer.byteLength(raw);
    if (!text.includes(needle)) continue;
    const bars = [];
    for (let index = 0; index < text.length; index++) if (text[index] === "|") bars.push(index);
    if (bars.length !== 4 || text.slice(0, bars[0]).trim() !== "" || text.slice(bars[3] + 1).trim() !== "") continue;
    const cells = [0, 1, 2].map((column) => {
      const cell = text.slice(bars[column] + 1, bars[column + 1]);
      const start = bars[column] + 1 + (cell.length - cell.trimStart().length);
      const value = cell.trim();
      return {
        value,
        startByte: lineOffset + Buffer.byteLength(text.slice(0, start)),
        endByte: lineOffset + Buffer.byteLength(text.slice(0, start + value.length)),
      };
    });
    if (cells[1].value.includes(needle)) rows.push(cells);
  }
  return rows;
}

function toolBudgetFor(agentType, maxTurns) {
  const cap = /≤(\d+) tool uses/u.exec(dispatchBudgetLineForRole(agentType) ?? "");
  if (!cap) refuse("DBG-BUDGET-TIER", `no tool-budget tier cap is defined for ${agentType}`);
  const tierCap = Number(cap[1]);
  const budget = Math.min(tierCap, maxTurns - 15);
  if (!Number.isSafeInteger(budget) || budget < 1) refuse("DBG-BUDGET-TIER", `${agentType} maxTurns ${maxTurns} leaves no tool budget after the 15-call reserve`);
  return { tierCap, budget, checkpoint: Math.floor(budget * 0.8) };
}

/** Invariants the host relies on that no flag combination should be able to break. */
export function assertBindingInvariants(binding) {
  const checks = binding?.itemDelivery?.checks;
  if (!Array.isArray(checks) || checks.length !== 1 || !Array.isArray(binding.allowedPaths)) refuse("DBG-BINDING-INVALID", "the binding must carry exactly one item-delivery check");
  const [check] = checks;
  if (!binding.allowedPaths.includes(check.path) || !check.dependencies.includes(check.path)) {
    refuse("DBG-CHECK-NOT-IN-PATHS", `check ${check.path} is not among the allowed paths`);
  }
  if (!binding.allowedPaths.every((path) => check.dependencies.includes(path))) refuse("DBG-BINDING-INVALID", "every allowed path must be a dependency of the check");
  const delivery = validateItemDeliveryBriefing(binding.itemDelivery);
  if (!delivery.ok) refuse("DBG-BINDING-INVALID", `item delivery is invalid: ${delivery.code}`);
}

/** Build the binding, its block and the skeleton from parsed options. Throws BriefingRefusal. */
export function generateDispatchBinding(options, deps = {}) {
  const git = deps.git ?? defaultGit;
  const observePreflight = deps.observePreflight ?? observePipelineStartPreflight;
  const resolveBaseline = deps.resolveBaseline ?? resolveProtectedBaseline;
  const defaultSpecPath = deps.defaultSpecPath ?? defaultSpecPathFromState;
  const agentsDir = deps.agentsDir ?? DEFAULT_AGENTS_DIR;
  const warnings = [];

  const { dispatchId, item, agentType, modelId, check } = options;
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/u.test(dispatchId)) refuse("DBG-DISPATCH-ID", `dispatch id ${JSON.stringify(dispatchId)} must match [A-Za-z0-9][A-Za-z0-9._:-]{0,119}`);
  if (!/^[a-z0-9][a-z0-9-]{0,127}$/u.test(item)) refuse("DBG-ITEM-SLUG", `item slug ${JSON.stringify(item)} must be lowercase letters, digits and hyphens`);
  if (!AGENT_TYPES.includes(agentType)) refuse("DBG-AGENT-TYPE-UNKNOWN", `unknown agent type ${JSON.stringify(agentType)}; expected one of ${AGENT_TYPES.join(", ")}`);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(modelId)) refuse("DBG-MODEL-ID", `model id ${JSON.stringify(modelId)} is not a model identifier`);
  for (const path of [check, ...options.paths]) {
    if (!validRepoPath(path)) refuse("DBG-PATH-INVALID", `path ${JSON.stringify(path)} must be repository-relative without .., ., .git or backslash segments`);
  }
  if (!/\.test\.(?:mjs|cjs|js)$/u.test(check)) refuse("DBG-CHECK-NOT-TEST", `check ${check} must be a .test.mjs, .test.cjs or .test.js file`);
  const allowedPaths = [...new Set([check, ...options.paths])].sort();

  let root;
  try { root = realpathSync(resolve(options.root ?? process.cwd())); } catch { refuse("DBG-ROOT-UNREADABLE", "--root cannot be resolved to a directory"); }

  // Original acceptance: the row, its byte span, and the backlog item it names.
  const specPath = options.spec ?? defaultSpecPath(root);
  if (typeof specPath !== "string" || specPath === "") refuse("DBG-SPEC-UNRESOLVED", "no --spec was given and the project authority state names no plan spec; pass --spec");
  if (!/^specs\/[A-Za-z0-9][A-Za-z0-9_-]{0,127}\/[A-Za-z0-9_./-]+$/u.test(specPath) || specPath.split("/").some((part) => part === "." || part === ".." || part === "")) {
    refuse("DBG-SPEC-PATH", `spec path ${JSON.stringify(specPath)} must be specs/<feature>/<file>`);
  }
  const specBytes = readRepoFile(root, specPath);
  if (!specBytes || specBytes.byteLength < 1) refuse("DBG-SPEC-UNREADABLE", `spec ${specPath} is not a readable regular file under --root`);
  const needle = `Original Alfred item ${item} is delivered`;
  let rows;
  try { rows = findCriterionRows(specBytes, needle); } catch { refuse("DBG-SPEC-UNREADABLE", `spec ${specPath} is not valid UTF-8`); }
  if (rows.length === 0) refuse("DBG-AC-ROW-MISSING", `no 3-column acceptance row in ${specPath} names "${needle}" (item ${item})`);
  if (rows.length > 1) refuse("DBG-AC-ROW-AMBIGUOUS", `${rows.length} acceptance rows in ${specPath} name "${needle}" (item ${item})`);
  const [idCell, criterionCell, evidenceCell] = rows[0];
  if (!/^AC-[1-9][0-9]*$/u.test(idCell.value)) refuse("DBG-AC-ROW-ID", `the row naming item ${item} has id cell ${JSON.stringify(idCell.value)}, not AC-<n>`);
  const locator = {
    schema: "pipeline.critic-criterion-locator.v1",
    sourcePath: specPath,
    sourceSha256: sha256(specBytes),
    criterionId: idCell.value,
    startByte: criterionCell.startByte,
    endByte: criterionCell.endByte,
    excerptSha256: sha256(specBytes.subarray(criterionCell.startByte, criterionCell.endByte)),
  };
  const criterion = parseAcceptedCriticCriterion({
    sourceBytes: new Uint8Array(specBytes),
    locator,
    packageContext: { featureId: specPath.split("/")[1], sourceBindings: [{ path: specPath, sha256: locator.sourceSha256, role: "spec" }] },
  });
  if (!ACCEPTED_CRITERION_STATUSES.includes(criterion.status)) {
    refuse("DBG-CRITERION-REFUSED", `the host criterion parser reports ${criterion.status} (${criterion.code}) for ${idCell.value} of item ${item}`);
  }
  const itemPath = /backlog\/items\/[A-Za-z0-9][A-Za-z0-9._-]*\.md/u.exec(evidenceCell.value)?.[0];
  if (!itemPath) refuse("DBG-ITEM-EVIDENCE-MISSING", `the Evidence cell of ${idCell.value} names no backlog/items/*.md file (item ${item})`);
  const itemBytes = readRepoFile(root, itemPath);
  if (!itemBytes) refuse("DBG-ITEM-UNREADABLE", `backlog item ${itemPath} named by ${idCell.value} is not a readable regular file`);
  const declaredId = parseAgentFrontmatter(itemBytes.toString("utf8")).id;
  let itemId = declaredId;
  if (typeof declaredId !== "string" || !ITEM_ID.test(declaredId)) {
    itemId = `pipeline.${item}`;
    warnings.push({ code: "DBG-ITEM-ID-FALLBACK", path: itemPath, message: `${itemPath} has no usable id: frontmatter; fell back to ${itemId}` });
  }

  // Agent definition: effort, model alias and the maxTurns cliff.
  const resolved = resolveAgentModel(agentType, { agentsDir });
  if (!resolved) refuse("DBG-AGENT-UNRESOLVED", `no agent definition with a model for ${agentType} under the plugin agents directory`);
  if (typeof resolved.effort !== "string" || resolved.effort === "") refuse("DBG-AGENT-UNRESOLVED", `agent definition ${agentType} declares no effort`);
  if (!modelBelongsToFamily(modelId, resolved.model)) {
    refuse("DBG-MODEL-FAMILY", `model id ${modelId} does not belong to the ${resolved.model} family that agent definition ${agentType} declares`);
  }
  let maxTurns;
  try { maxTurns = Number.parseInt(parseAgentFrontmatter(readFileSync(resolve(agentsDir, `${agentType}.md`), "utf8")).maxTurns, 10); } catch { maxTurns = NaN; }
  if (!Number.isSafeInteger(maxTurns)) refuse("DBG-AGENT-UNRESOLVED", `agent definition ${agentType} declares no integer maxTurns`);
  const budget = toolBudgetFor(agentType, maxTurns);

  // The loaded ruleset identity. No fallback value exists on purpose.
  let observation;
  let observationFault = null;
  try { observation = observePreflight({ cwd: root }); } catch (error) { observationFault = error?.code ?? "observer-threw"; }
  const identity = observation?.rulesetSource?.loadedIdentity;
  const identityStatus = observationFault ?? (identity ? String(identity.status) : "absent");
  if (identityStatus !== "available" || typeof identity?.value !== "string" || !SHA.test(identity.value)) {
    refuse("DBG-RULESET-UNAVAILABLE", `the loaded ruleset identity is not available (status: ${identityStatus}); the generator never substitutes a value`);
  }
  const rulesetVersion = observation.rulesetSource.selectedPlugin?.version;

  // Candidate: HEAD of --root, read-only.
  let candidateCommit;
  let candidateTree;
  try {
    candidateCommit = String(git(root, ["rev-parse", "HEAD"])).trim();
    candidateTree = String(git(root, ["rev-parse", "HEAD^{tree}"])).trim();
  } catch { refuse("DBG-GIT-HEAD", "git rev-parse HEAD failed under --root"); }
  if (!OID.test(candidateCommit) || !OID.test(candidateTree)) refuse("DBG-GIT-HEAD", "git returned a malformed commit or tree id");
  try {
    if (String(git(root, ["status", "--porcelain", "--", specPath])).trim() !== "") {
      warnings.push({ code: "DBG-SPEC-UNCOMMITTED", path: specPath, message: `${specPath} differs from HEAD; the locator hashes the working-tree bytes, not the candidate's` });
    }
  } catch { warnings.push({ code: "DBG-SPEC-STATE-UNKNOWN", path: specPath, message: `git status failed for ${specPath}` }); }

  // Protected surface: a warning per matching path, naming the rule.
  const baseline = resolveBaseline({ rootDir: root });
  if (baseline?.status !== "ready") {
    warnings.push({ code: "DBG-BASELINE-UNAVAILABLE", message: "the protected baseline could not be resolved; no path was checked against it" });
  } else {
    for (const path of allowedPaths) {
      const rule = protectedBaselineRuleFor(baseline.entries, path);
      if (rule) warnings.push({ code: "DBG-PROTECTED-PATH", path, ruleId: rule.id, message: `${path} matches protected-baseline rule ${rule.id}` });
    }
  }

  const binding = {
    schema: NATIVE_GOLDFISH_ITEM_BRIEFING_SCHEMA,
    dispatchId,
    candidateCommit,
    candidateTree,
    runner: "claude",
    role: `pipeline-core:${agentType}`,
    agentType,
    model: modelId,
    effort: resolved.effort,
    rulesetSha: identity.value,
    allowedPaths,
    criticDecision: {
      schema: "pipeline.critic-required-decision.v1",
      trigger: {
        schema: "pipeline.critic-trigger-input.v1", rigorLevel: 1, riskClass: "medium", riskFlag: false,
        diff: { mechanical: false, architecture: true, guardrails: false, security: false },
      },
      appliedRow: "T1",
    },
    itemDelivery: {
      schema: "pipeline.item-delivery-briefing.v1",
      sliceId: dispatchId,
      itemId,
      criterionLocator: locator,
      checks: [{ id: `${dispatchId.toLowerCase()}-check`, path: check, dependencies: [...allowedPaths] }],
    },
  };
  assertBindingInvariants(binding);

  const block = `${BLOCK_OPEN}\n${JSON.stringify(binding)}\n${BLOCK_CLOSE}`;
  const field6 = [
    `- Ruleset: ${rulesetVersion ? `\`${rulesetVersion}\` · ` : ""}content identity \`${identity.value}\`.`,
    `- Model/effort: \`${modelId}\` / ${resolved.effort} (${agentType}; agent definition alias \`${resolved.model}\`).`,
    `- Tier: ${agentType}. Worktree: {{WORKTREE}}.`,
    `- **Tool budget (TB-09, hard cap):** ≤${budget.budget} tool uses (min(tier cap ${budget.tierCap}, maxTurns ${maxTurns} - 15)). 80 % checkpoint at about call ${budget.checkpoint}: stop editing and end the turn with an interim report naming what remains.`,
  ];
  const skeleton = [
    block, "", NATIVE_GOLDFISH_HOST_DIRECTIVE, "",
    `## Briefing ${dispatchId}: {{TITLE}}`, "",
    "### 1. Goal", "", "{{GOAL}}", "",
    "### 2. Context files", "", "{{CONTEXT_FILES}}", "",
    "### 3. DoD checks", "", "{{DOD_CHECKS}}", "",
    "### 4. Forbidden", "", "{{FORBIDDEN}}", "",
    "### 5. Stop conditions", "", "{{STOP_CONDITIONS}}", "",
    "### 6. Dispatch metadata", "", ...field6, "",
  ].join("\n");

  // Self-check: the host's own parser must accept exactly what is about to be handed out.
  if (skeleton.split(BLOCK_OPEN.slice(0, BLOCK_OPEN.lastIndexOf(":v") + 2)).length !== 2) refuse("DBG-SELFCHECK-MARKER", "the skeleton must contain the binding opening marker exactly once");
  const parsed = parseNativeGoldfishBriefing(skeleton);
  if (!parsed.ok) refuse("DBG-SELFCHECK-PARSE", `the host parser rejects the generated skeleton: ${parsed.code}`);
  const { criticDecision: _decision, ...parsedRest } = parsed.binding;
  const { criticDecision: _own, ...ownRest } = binding;
  if (JSON.stringify(parsedRest) !== JSON.stringify(ownRest)) refuse("DBG-SELFCHECK-PARSE", "the host parser read back a different binding than was generated");

  return { schema: DISPATCH_BINDING_SCHEMA, ok: true, block, binding, skeleton, warnings };
}

/** Argv in, result object out; never throws for a refusal. */
export function runDispatchBriefing(argv, deps = {}) {
  try {
    return generateDispatchBinding(parseBindingArgv(argv), deps);
  } catch (error) {
    const code = error instanceof BriefingRefusal ? error.code : "DBG-INTERNAL";
    return { schema: DISPATCH_REFUSAL_SCHEMA, ok: false, code, message: String(error?.message ?? error) };
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = runDispatchBriefing(process.argv.slice(2));
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.ok) process.exitCode = 2;
}
