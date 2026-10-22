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
 *   rulesetSha                       the preflight's loaded content identity; when that is
 *                                    unavailable, the installed identity, then the content hash of
 *                                    the loaded plugin root (each fallback is a DBG-RULESET-FALLBACK
 *                                    warning; the host only format-checks the value)
 *   itemDelivery                     the acceptance criterion's own byte span, validated with the
 *                                    host's criterion parser. Two routes: this repository's own
 *                                    Alfred row (`--item` alone, id from the backlog item) or a
 *                                    consumer spec's criterion id (`--criterion`, `AC-<n>` or the
 *                                    compound `AC-E<epic>-<story>-<nn>`, found in the Markdown
 *                                    shapes below, item id `<feature>.<slug>`, no backlog item)
 *
 * The generator calls no model and runs no mutating git command. `binding` writes no file and
 * leaves the judgment fields (goal, context, DoD, forbidden, stop) as template placeholders;
 * `build` (PO decision D78) fills them from a closed package through
 * lib/dispatch-briefing-build.mjs and writes at most the one `--out` file under scratch/.
 */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";
import {
  NATIVE_GOLDFISH_HOST_DIRECTIVE,
  NATIVE_GOLDFISH_ITEM_BRIEFING_SCHEMA,
  parseNativeGoldfishBriefing,
  validateItemDeliveryBriefing,
} from "../lib/native-goldfish-host-return.mjs";
import { modelBelongsToFamily, parseAgentFrontmatter, resolveAgentModel } from "../lib/agent-model-registry.mjs";
import {
  BRIEFING_BUILD_SCHEMA,
  BriefingPackageRefusal,
  assertPackagePathsExist,
  budgetDecision,
  renderGoldfishBriefing,
  resolveBriefingCalibration,
  skeletonToolBudget,
  validateBriefingPackage,
} from "../lib/dispatch-briefing-build.mjs";
import { CRITERION_ID_SOURCE, isCriterionId, parseAcceptedCriticCriterion } from "../lib/critic-accepted-contract.mjs";
import { dispatchBudgetLineForRole, parseDispatchSlice } from "../lib/dispatch-policy.mjs";
import { snapshotPhysicalPluginRoot } from "../lib/public-core-observation.mjs";
import { protectedBaselineRuleFor, resolveProtectedBaseline } from "../lib/protected-baseline.mjs";
import { resolveProjectAuthorityPaths } from "../lib/project-authority.mjs";
import { resolveGovernedItemQueue } from "../lib/native-goldfish-host-state.mjs";
import { observePipelineStartPreflight } from "./pipeline-start-preflight.mjs";
import * as sessionAuthorityRegistry from "../lib/session-authority-registry.mjs";
import { inspectSignedDescriptorCustodyRepository } from "../lib/worktree-lifecycle.mjs";
import { loadMapBundle } from "./module-inventory.mjs";
import { owningModules } from "./architecture-boundary-check.mjs";

export const DISPATCH_BINDING_SCHEMA = "pipeline.dispatch-briefing.binding.v1";
export const DISPATCH_REFUSAL_SCHEMA = "pipeline.dispatch-briefing.refusal.v1";

const BLOCK_OPEN = "<!-- pipeline-native-goldfish-host-commit:v3";
const BLOCK_CLOSE = "-->";
const AGENT_TYPES = Object.freeze(["goldfish-implementor", "goldfish-mechanic", "goldfish-deep"]);
const ACCEPTED_CRITERION_STATUSES = Object.freeze(["explicit-actual-independent-pass", "no-explicit-criterion"]);
const SINGLE_FLAGS = Object.freeze({
  "--root": "root", "--dispatch-id": "dispatchId", "--item": "item", "--agent-type": "agentType",
  "--model-id": "modelId", "--check": "check", "--spec": "spec", "--criterion": "criterion",
});
const REPEATED_FLAGS = Object.freeze({ "--path": "paths" });
const REQUIRED_FLAGS = Object.freeze(["--dispatch-id", "--item", "--agent-type", "--model-id", "--check"]);
const READ_ONLY_GIT = new Set(["rev-parse", "status"]);
const OID = /^[a-f0-9]{40}(?:[a-f0-9]{24})?$/u;
const SHA = /^[a-f0-9]{64}$/u;
const ITEM_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const MAX_CRITERION_BYTES = 4096;
const CRITERION_ID_FORMS = "AC-<n> or AC-E<epic>-<story>-<nn>";
// The bold bullet item (`- **<id>:** text`, marker `-`, `+` or `*`, at column 0) and the indented lines that continue it;
// both mirror the host parser's `markdown-acceptance-bullet-item.v1` rendering exactly.
const BOLD_BULLET = new RegExp(`^[-+*] \\*\\*(${CRITERION_ID_SOURCE}):\\*\\* (\\S.*)$`, "u");
const BULLET_CONTINUATION = /^(?: {2,}|\t)\S/u;
const CRITERION_SHAPES = "a Markdown table row whose first cell is exactly the id (criterion = the second cell), "
  + "a bold bullet item `- **<id>:** text` with its indented sub-bullets or wrapped lines (criterion = the text after `:** ` through the last indented line), "
  + "a list item or paragraph beginning `AC-<n>:`, `**AC-<n>**` or `AC-<n> —` (criterion = the rest of that line or list item), "
  + "or a heading that is exactly the id (criterion = the following paragraph)";
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
    refuse("DBG-SUBCOMMAND", `the subcommands are "binding" and "build"; got ${JSON.stringify(argv?.[0] ?? null)}`);
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

/** The governed queue row of a slice id, or null outside an approved item course (read-only). */
function defaultQueueRow(root, sliceId) {
  try {
    const governed = resolveGovernedItemQueue({ root });
    return governed.status === "required" ? governed.normalized.slices.find((row) => row.id === sliceId) ?? null : null;
  } catch { return null; }
}

/** K12: the session-authority registry lock as a reader sees it (never taken), or null when it cannot be observed. */
function defaultRegistryLock(root) {
  try { return sessionAuthorityRegistry.inspectSessionAuthorityLock({ repository: inspectSignedDescriptorCustodyRepository(root) }); } catch { return null; }
}
// The registry's own bound when it exports one (K12); a short fixed default otherwise, so this script never needs the
// registry module and the bound to be changed in the same commit.
const REGISTRY_LOCK_WAIT_MS = Number.isSafeInteger(sessionAuthorityRegistry.SESSION_AUTHORITY_LOCK_WAIT_MS) ? sessionAuthorityRegistry.SESSION_AUTHORITY_LOCK_WAIT_MS : 1500;
const sleepMs = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

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

/** Cells of one Markdown table row (leading bar required, escaped bars kept); `from`/`to` index the line. */
function tableCells(text) {
  const bars = [];
  for (let index = 0; index < text.length; index++) if (text[index] === "|" && text[index - 1] !== "\\") bars.push(index);
  if (bars.length === 0 || text.slice(0, bars[0]).trim() !== "") return [];
  const cells = [];
  for (let column = 0; column < bars.length; column++) {
    const start = bars[column] + 1;
    const end = column + 1 < bars.length ? bars[column + 1] : text.length;
    const segment = text.slice(start, end);
    const value = segment.trim();
    if (column + 1 === bars.length && value === "") break;
    const from = start + (segment.length - segment.trimStart().length);
    cells.push({ value, from, to: from + value.length });
  }
  return cells;
}

/**
 * Every place a consumer spec states criterion `id`, in the supported Markdown shapes, with the
 * exact byte span of the criterion text. Fenced code blocks are skipped. A consumer's ordinary
 * criterion id needs no Alfred wording and no backlog item. An id is only ever resolved by exact
 * equality (a longer id that merely starts with it, a heading that merely mentions it and a table
 * cell that merely references it are not occurrences); the host parser still has the last word.
 */
function findCriterionOccurrences(sourceBytes, id) {
  const source = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(sourceBytes);
  const lines = [];
  let byteOffset = 0;
  for (const raw of source.split(/(?<=\n)/u)) {
    const text = raw.replace(/\r?\n$/u, "");
    lines.push({ text, offset: byteOffset });
    byteOffset += Buffer.byteLength(raw);
  }
  const span = (startLine, from, endLine, to) => ({
    startByte: startLine.offset + Buffer.byteLength(startLine.text.slice(0, from)),
    endByte: endLine.offset + Buffer.byteLength(endLine.text.slice(0, to)),
  });
  const leading = new RegExp(`^(?<lead>[ \\t]*(?:>[ \\t]*)*(?<marker>(?:[-*+]|[0-9]{1,3}[.)])[ \\t]+)?)(?<open>\\*\\*|__)?${id}(?![0-9A-Za-z_])`, "u");
  const listMarker = /^\s*(?:[-*+]|[0-9]{1,3}[.)])[ \t]/u;
  const found = [];
  let fence = null;
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    const fenced = /^\s*(`{3,}|~{3,})/u.exec(line.text);
    if (fenced) { fence = fence === null ? fenced[1][0] : fence === fenced[1][0] ? null : fence; continue; }
    if (fence !== null) continue;
    if (line.text.trimStart().startsWith("|")) {
      const cells = tableCells(line.text);
      // A two-column acceptance table (`Nr. | Kriterium`) numbers its rows `n` or `R-n`; the host parser maps both to `AC-n`
      // (scanAcceptedCriterionRows, lib/critic-accepted-contract.mjs), so the generator must find the same row.
      const twoColumnNumber = cells.length === 2 ? /^(?:R-)?([1-9][0-9]*)$/u.exec(cells[0].value)?.[1] : undefined;
      const rowIsId = cells.length >= 2 && (cells[0].value === id || (twoColumnNumber !== undefined && `AC-${twoColumnNumber}` === id));
      if (rowIsId && cells[1].value !== "") {
        found.push({ shape: "table-row", ...span(line, cells[1].from, line, cells[1].to) });
      }
      continue;
    }
    const heading = /^ {0,3}#{1,6}[ \t]+(.*)$/u.exec(line.text);
    if (heading) {
      // The host parser admits a heading only when it IS the id; a heading that merely mentions it is a reference.
      if (heading[1].replace(/(?:\s+#+)?\s*$/u, "") !== id) continue;
      let first = index + 1;
      while (first < lines.length && lines[first].text.trim() === "") first++;
      if (first >= lines.length || /^\s*(?:#{1,6}[ \t]|`{3}|~{3}|\|)/u.test(lines[first].text)) continue;
      let last = first;
      while (last + 1 < lines.length && lines[last + 1].text.trim() !== "" && !/^\s*(?:#{1,6}[ \t]|`{3}|~{3})/u.test(lines[last + 1].text)) last++;
      const from = lines[first].text.length - lines[first].text.trimStart().length;
      found.push({ shape: "heading", ...span(lines[first], from, lines[last], lines[last].text.trimEnd().length) });
      continue;
    }
    const bold = BOLD_BULLET.exec(line.text);
    if (bold) {
      // A bold bullet item owns the indented lines after it (sub-bullets, wrapped text): they are its scope, never separate statements.
      let last = index;
      while (last + 1 < lines.length && BULLET_CONTINUATION.test(lines[last + 1].text)) last++;
      if (bold[1] === id) found.push({ shape: "bold bullet item", ...span(line, line.text.length - bold[2].length, lines[last], lines[last].text.trimEnd().length) });
      index = last;
      continue;
    }
    const lead = leading.exec(line.text);
    if (!lead) continue;
    let consumed = lead[0].length;
    const take = (pattern) => {
      const matched = pattern.exec(line.text.slice(consumed));
      if (matched) consumed += matched[0].length;
      return matched !== null;
    };
    let delimited = take(/^:/u);
    if (lead.groups.open && take(lead.groups.open === "**" ? /^\*\*/u : /^__/u)) delimited = true;
    if (take(/^[ \t]*(?:[:—–]|-(?=[ \t]))/u)) delimited = true;
    if (!delimited) continue;
    const rest = line.text.slice(consumed);
    const from = consumed + (rest.length - rest.trimStart().length);
    const to = line.text.trimEnd().length;
    if (to <= from) continue;
    let last = index;
    if (lead.groups.marker) {
      while (last + 1 < lines.length && /^(?: {2,}|\t)\S/u.test(lines[last + 1].text) && !listMarker.test(lines[last + 1].text)) last++;
    }
    found.push({ shape: "line", ...span(line, from, lines[last], lines[last].text.trimEnd().length) });
  }
  return found;
}

/** The host's own parser must accept the criterion text exactly as the existing Alfred route requires. */
function requireAcceptedCriterion(specBytes, specPath, locator, describe) {
  const criterion = parseAcceptedCriticCriterion({
    sourceBytes: new Uint8Array(specBytes),
    locator,
    packageContext: { featureId: specPath.split("/")[1], sourceBindings: [{ path: specPath, sha256: locator.sourceSha256, role: "spec" }] },
  });
  if (!ACCEPTED_CRITERION_STATUSES.includes(criterion.status)) {
    refuse("DBG-CRITERION-REFUSED", `the host criterion parser reports ${criterion.status} (${criterion.code}) for ${describe}`);
  }
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

/**
 * FB3-PF-54 (D56 (1)): the architecture map's facts for the touched paths, one line per owning
 * module, so a briefing names the boundary instead of leaving it to whoever writes the context.
 * Prose only: no parser reads these lines, and no map is never a refusal.
 */
export function architectureContextLines(root, paths, loadMap = loadMapBundle) {
  if (!existsSync(resolve(root, "architecture/map"))) return ["- Architecture: this project has no architecture map (`architecture/map`)."];
  const bundle = loadMap(root);
  if (!bundle.ok) return [`- Architecture: the map does not load (${bundle.errors.length} error(s)); \`architecture-boundary-check.mjs --root <root>\` names them.`];
  const byModule = new Map();
  const unowned = [];
  for (const path of paths) {
    const owners = owningModules(path, bundle.modules);
    if (owners.length !== 1) { unowned.push(path); continue; }
    if (!byModule.has(owners[0].id)) byModule.set(owners[0].id, { module: owners[0], paths: [] });
    byModule.get(owners[0].id).paths.push(path);
  }
  const lines = [...byModule.values()].sort((a, b) => a.module.id.localeCompare(b.module.id)).map(({ module, paths: owned }) => {
    const deps = module.allowedDependencies.length ? module.allowedDependencies.map((id) => `\`${id}\``).join(", ") : "none";
    const contracts = module.publicContracts.length ? `; public contracts ${module.publicContracts.slice(0, 8).map((p) => `\`${p}\``).join(", ")}${module.publicContracts.length > 8 ? ` and ${module.publicContracts.length - 8} more` : ""}` : "";
    return `- Architecture, module \`${module.id}\` (${owned.map((p) => `\`${p}\``).join(", ")}): ${module.responsibility.trim().replace(/\.?$/u, ".")} Imports only within the module or from: ${deps}${contracts}.`;
  });
  if (unowned.length) lines.push(`- Architecture: no single module owns ${unowned.map((p) => `\`${p}\``).join(", ")}; the boundary check reports such a source file until the map assigns it.`);
  return lines;
}

/** Build the binding, its block and the skeleton from parsed options. Throws BriefingRefusal. */
export function generateDispatchBinding(options, deps = {}) {
  const git = deps.git ?? defaultGit;
  const observePreflight = deps.observePreflight ?? observePipelineStartPreflight;
  const resolveBaseline = deps.resolveBaseline ?? resolveProtectedBaseline;
  const defaultSpecPath = deps.defaultSpecPath ?? defaultSpecPathFromState;
  const snapshotPluginRoot = deps.snapshotPluginRoot ?? snapshotPhysicalPluginRoot;
  const agentsDir = deps.agentsDir ?? DEFAULT_AGENTS_DIR;
  const warnings = [];

  const { dispatchId, item, agentType, modelId, check } = options;
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/u.test(dispatchId)) refuse("DBG-DISPATCH-ID", `dispatch id ${JSON.stringify(dispatchId)} must match [A-Za-z0-9][A-Za-z0-9._:-]{0,119}`);
  if (!/^[a-z0-9][a-z0-9-]{0,127}$/u.test(item)) refuse("DBG-ITEM-SLUG", `item slug ${JSON.stringify(item)} must be lowercase letters, digits and hyphens`);
  if (options.criterion !== undefined && !isCriterionId(options.criterion)) refuse("DBG-CRITERION-ID", `criterion ${JSON.stringify(options.criterion)} must be ${CRITERION_ID_FORMS}`);
  if (!AGENT_TYPES.includes(agentType)) refuse("DBG-AGENT-TYPE-UNKNOWN", `unknown agent type ${JSON.stringify(agentType)}; expected one of ${AGENT_TYPES.join(", ")}`);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(modelId)) refuse("DBG-MODEL-ID", `model id ${JSON.stringify(modelId)} is not a model identifier`);
  for (const path of [check, ...options.paths]) {
    if (!validRepoPath(path)) refuse("DBG-PATH-INVALID", `path ${JSON.stringify(path)} must be repository-relative without .., ., .git or backslash segments`);
  }
  if (!/\.test\.(?:mjs|cjs|js)$/u.test(check)) refuse("DBG-CHECK-NOT-TEST", `check ${check} must be a .test.mjs, .test.cjs or .test.js file`);
  const allowedPaths = [...new Set([check, ...options.paths])].sort();

  let root;
  try { root = realpathSync(resolve(options.root ?? process.cwd())); } catch { refuse("DBG-ROOT-UNREADABLE", "--root cannot be resolved to a directory"); }

  // Original acceptance: the criterion, its byte span, and (Alfred route only) the backlog item it names.
  const specPath = options.spec ?? defaultSpecPath(root);
  if (typeof specPath !== "string" || specPath === "") refuse("DBG-SPEC-UNRESOLVED", "no --spec was given and the project authority state names no plan spec; pass --spec");
  if (!/^specs\/[A-Za-z0-9][A-Za-z0-9_-]{0,127}\/[A-Za-z0-9_./-]+$/u.test(specPath) || specPath.split("/").some((part) => part === "." || part === ".." || part === "")) {
    refuse("DBG-SPEC-PATH", `spec path ${JSON.stringify(specPath)} must be specs/<feature>/<file>`);
  }
  const specBytes = readRepoFile(root, specPath);
  if (!specBytes || specBytes.byteLength < 1) refuse("DBG-SPEC-UNREADABLE", `spec ${specPath} is not a readable regular file under --root`);
  let locator;
  let itemId;
  if (options.criterion !== undefined) {
    // Generic route: a consumer's own `AC-<n>`; the item id is derived, no backlog item is involved.
    let occurrences;
    try { occurrences = findCriterionOccurrences(specBytes, options.criterion); } catch { refuse("DBG-SPEC-UNREADABLE", `spec ${specPath} is not valid UTF-8`); }
    if (occurrences.length === 0) refuse("DBG-CRITERION-MISSING", `${options.criterion} is not stated in ${specPath} in a supported shape: ${CRITERION_SHAPES}`);
    if (occurrences.length > 1) refuse("DBG-CRITERION-AMBIGUOUS", `${occurrences.length} places in ${specPath} state ${options.criterion} (${occurrences.map((entry) => entry.shape).join(", ")}); exactly one is required`);
    const [only] = occurrences;
    if (only.endByte - only.startByte > MAX_CRITERION_BYTES) refuse("DBG-CRITERION-TOO-LONG", `${options.criterion} is ${only.endByte - only.startByte} bytes in ${specPath}; the locator span is limited to ${MAX_CRITERION_BYTES}`);
    locator = {
      schema: "pipeline.critic-criterion-locator.v1",
      sourcePath: specPath,
      sourceSha256: sha256(specBytes),
      criterionId: options.criterion,
      startByte: only.startByte,
      endByte: only.endByte,
      excerptSha256: sha256(specBytes.subarray(only.startByte, only.endByte)),
    };
    requireAcceptedCriterion(specBytes, specPath, locator, `${options.criterion} of item ${item}`);
    itemId = `${specPath.split("/")[1]}.${item}`;
    if (!ITEM_ID.test(itemId)) refuse("DBG-ITEM-ID", `derived item id ${JSON.stringify(itemId)} does not match ${ITEM_ID}`);
  } else {
    const needle = `Original Alfred item ${item} is delivered`;
    let rows;
    try { rows = findCriterionRows(specBytes, needle); } catch { refuse("DBG-SPEC-UNREADABLE", `spec ${specPath} is not valid UTF-8`); }
    if (rows.length === 0) refuse("DBG-AC-ROW-MISSING", `no 3-column acceptance row in ${specPath} names "${needle}" (item ${item})`);
    if (rows.length > 1) refuse("DBG-AC-ROW-AMBIGUOUS", `${rows.length} acceptance rows in ${specPath} name "${needle}" (item ${item})`);
    const [idCell, criterionCell, evidenceCell] = rows[0];
    if (!isCriterionId(idCell.value)) refuse("DBG-AC-ROW-ID", `the row naming item ${item} has id cell ${JSON.stringify(idCell.value)}, not ${CRITERION_ID_FORMS}`);
    locator = {
      schema: "pipeline.critic-criterion-locator.v1",
      sourcePath: specPath,
      sourceSha256: sha256(specBytes),
      criterionId: idCell.value,
      startByte: criterionCell.startByte,
      endByte: criterionCell.endByte,
      excerptSha256: sha256(specBytes.subarray(criterionCell.startByte, criterionCell.endByte)),
    };
    requireAcceptedCriterion(specBytes, specPath, locator, `${idCell.value} of item ${item}`);
    const itemPath = /backlog\/items\/[A-Za-z0-9][A-Za-z0-9._-]*\.md/u.exec(evidenceCell.value)?.[0];
    if (!itemPath) refuse("DBG-ITEM-EVIDENCE-MISSING", `the Evidence cell of ${idCell.value} names no backlog/items/*.md file (item ${item}); repair: put the item's backlog/items/<file>.md path in that row's Evidence cell, or file the item first (backlog/README.md) and name it there`);
    const itemBytes = readRepoFile(root, itemPath);
    if (!itemBytes) refuse("DBG-ITEM-UNREADABLE", `backlog item ${itemPath} named by ${idCell.value} is not a readable regular file`);
    const declaredId = parseAgentFrontmatter(itemBytes.toString("utf8")).id;
    itemId = declaredId;
    if (typeof declaredId !== "string" || !ITEM_ID.test(declaredId)) {
      itemId = `pipeline.${item}`;
      warnings.push({ code: "DBG-ITEM-ID-FALLBACK", path: itemPath, message: `${itemPath} has no usable id: frontmatter; fell back to ${itemId}` });
    }
  }

  // PF-47: a dispatch id that already names a governed queue row must match it; the admission would refuse
  // the drift later under another name, so the binding refuses now and names the row's exact scope.
  const row = (deps.queueRow ?? defaultQueueRow)(root, dispatchId);
  if (row && row.delivery?.status !== "unbound-legacy") {
    if (row.state !== "ready") refuse("DBG-QUEUE-ROW-NOT-READY", `slice ${dispatchId} is ${row.state} in the governed queue and cannot be rebound; choose a new --dispatch-id`);
    if (row.delivery?.itemId !== itemId) refuse("DBG-QUEUE-ROW-DRIFT", `slice ${dispatchId} belongs to item ${row.delivery?.itemId} in the governed queue, not ${itemId}; choose a new --dispatch-id`);
    const scope = [...(row.writeScope ?? [])].sort();
    if (JSON.stringify(scope) !== JSON.stringify(allowedPaths)) {
      const checks = scope.filter((path) => /\.test\.(?:mjs|cjs|js)$/u.test(path));
      refuse("DBG-QUEUE-ROW-DRIFT", `slice ${dispatchId} has the write scope ${scope.join(", ")} in the governed queue; this call gives ${allowedPaths.join(", ")}. Rebind with exactly that scope: --check ${checks.includes(check) ? check : checks[0] ?? "<one .test file of it>"} and one --path for each other path, or choose a new --dispatch-id (slice-queue.mjs cancel ${dispatchId} --reason "<why>" first when it still holds a successor)`);
    }
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

  // The ruleset identity. The host only format-checks `rulesetSha` (64 hex) and copies it into its
  // receipt and the dispatch record, so a lesser-but-real identity of the same kind is admissible when
  // the loaded one is unavailable (it is, for a Claude local-development install: the preflight derives
  // a loaded identity only from a self-application checkout, a verified receipt or a Codex registry
  // binding). Order: loaded, installed, content hash of the loaded plugin root. Each fallback warns.
  let observation;
  let observationFault = null;
  const observeOnce = () => {
    observationFault = null;
    try { observation = observePreflight({ cwd: root }); } catch (error) { observation = undefined; observationFault = error?.code ?? "observer-threw"; }
  };
  observeOnce();
  let identity = observation?.rulesetSource?.loadedIdentity;
  let identityStatus = observationFault ?? (identity ? String(identity.status) : "absent");
  let rulesetSha = null;
  let rulesetFallback = null;
  // K12: a lock-held registry is a transient state, never a reason to settle for a lesser identity. Before any
  // fallback the lock is observed; a live or unjudgeable holder is waited for (bounded), the preflight is
  // observed again once it clears, and a lock that stays held is refused typed, naming the holder and the retry.
  if (!(identityStatus === "available" && typeof identity?.value === "string" && SHA.test(identity.value))) {
    const lockOf = deps.registryLock ?? defaultRegistryLock;
    const pause = deps.pause ?? sleepMs;
    const now = deps.now ?? Date.now;
    const deadline = now() + REGISTRY_LOCK_WAIT_MS;
    let lock = lockOf(root);
    let waited = false;
    while ((lock?.status === "held" && lock.owner !== "dead") && now() < deadline) { pause(50); waited = true; lock = lockOf(root); }
    if (lock?.status === "held") {
      const holder = lock.pid === null || lock.pid === undefined ? "an owner it does not record" : `pid ${lock.pid}`;
      refuse("DBG-RULESET-LOCK-HELD", `the session-authority registry lock is held by ${holder} (${lock.owner}, for ${lock.ageSeconds}s) and no fallback ruleset identity is taken while it is (preflight status: ${identityStatus}); repair: retry this command; to wait longer run \`node <plugin-root>/scripts/session-authority-repair.mjs wait --root <repo> --timeout 120\`; if the owner is gone or cannot be judged run \`... release-lock --root <repo> --no-pipeline-running --reason "<why>"\``);
    }
    if (waited || observationFault === "SDC-LOCK-HELD") {
      observeOnce();
      identity = observation?.rulesetSource?.loadedIdentity;
      identityStatus = observationFault ?? (identity ? String(identity.status) : "absent");
      if (observationFault === "SDC-LOCK-HELD") refuse("DBG-RULESET-LOCK-HELD", `the session-authority registry lock was still contended when the ruleset identity was read again, so no fallback identity is taken; repair: retry this command`);
    }
  }
  if (identityStatus === "available" && typeof identity?.value === "string" && SHA.test(identity.value)) rulesetSha = identity.value;
  else {
    const installed = observation?.rulesetSource?.installedIdentity;
    if (installed?.status === "available" && typeof installed.value === "string" && SHA.test(installed.value)) {
      rulesetSha = installed.value;
      rulesetFallback = "installedIdentity.value of the preflight ruleset source";
    } else if (typeof observation?.pluginRoot === "string" && observation.pluginRoot !== "") {
      try {
        const snapshot = snapshotPluginRoot(observation.pluginRoot);
        if (typeof snapshot?.contentSha256 === "string" && SHA.test(snapshot.contentSha256)) {
          rulesetSha = snapshot.contentSha256;
          rulesetFallback = "content hash of the loaded plugin root (snapshotPhysicalPluginRoot, lib/public-core-observation.mjs)";
        }
      } catch { /* no source exists: refused below */ }
    }
    if (rulesetFallback) warnings.push({ code: "DBG-RULESET-FALLBACK", source: rulesetFallback, message: `the loaded ruleset identity is ${identityStatus}; used the ${rulesetFallback}` });
  }
  if (rulesetSha === null) {
    refuse("DBG-RULESET-UNAVAILABLE", `the loaded ruleset identity is not available (status: ${identityStatus}) and no installed identity or plugin-root content hash exists to fall back to`);
  }
  const rulesetVersion = observation.rulesetSource?.selectedPlugin?.version;

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
    rulesetSha,
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
    `- Ruleset: ${rulesetVersion ? `\`${rulesetVersion}\` · ` : ""}content identity \`${rulesetSha}\`${rulesetFallback ? ` (fallback: ${rulesetFallback})` : ""}.`,
    `- Model/effort: \`${modelId}\` / ${resolved.effort} (${agentType}; agent definition alias \`${resolved.model}\`).`,
    `- Tier: ${agentType}. Worktree: {{WORKTREE}}.`,
    // PF-42: governed item admission reads these two lines (parseDispatchSlice); the skeleton carries them.
    `- Slice: ${dispatchId}`,
    `- Write scope: ${allowedPaths.join(", ")}`,
    `- **Tool budget (TB-09, hard cap):** ≤${budget.budget} tool uses (min(tier cap ${budget.tierCap}, maxTurns ${maxTurns} - 15)). 80 % checkpoint at about call ${budget.checkpoint}: stop editing and end the turn with an interim report naming what remains.`,
  ];
  const skeleton = [
    block, "", NATIVE_GOLDFISH_HOST_DIRECTIVE, "",
    `## Briefing ${dispatchId}: {{TITLE}}`, "",
    "### 1. Goal", "", "{{GOAL}}", "",
    "### 2. Context files", "", ...architectureContextLines(root, allowedPaths, deps.loadMapBundle), "", "{{CONTEXT_FILES}}", "",
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
  const named = parseDispatchSlice(skeleton);
  if (named.sliceId !== dispatchId || JSON.stringify(named.writeScope) !== JSON.stringify([...allowedPaths])) refuse("DBG-SELFCHECK-SLICE", "the admission parser reads a different slice or write scope from the generated skeleton");

  return { schema: DISPATCH_BINDING_SCHEMA, ok: true, block, binding, skeleton, warnings };
}

const BUILD_FLAGS = Object.freeze({ "--root": "root", "--package": "package", "--out": "out" });

/** `build --package <repo-relative json> [--out scratch/<file>.md] [--root <dir>]`; the same strict flag rules as `binding`. */
export function parseBuildArgv(argv) {
  const values = {};
  for (let index = 1; index < argv.length; index++) {
    const token = argv[index];
    if (typeof token !== "string" || !Object.hasOwn(BUILD_FLAGS, token)) refuse("DBG-FLAG-UNKNOWN", `unknown build argument ${JSON.stringify(token)}; build takes --package, --out and --root`);
    const value = argv[index + 1];
    if (typeof value !== "string" || value === "" || value.startsWith("--")) refuse("DBG-FLAG-VALUE", `flag ${token} needs a value`);
    index++;
    const key = BUILD_FLAGS[token];
    if (Object.hasOwn(values, key)) refuse("DBG-FLAG-REPEATED", `flag ${token} may be given once`);
    values[key] = value;
  }
  if (values.package === undefined) refuse("DBG-FLAG-MISSING", "required flag --package is missing; repair: name the package JSON file, repository-relative");
  if (!validRepoPath(values.package)) refuse("DBG-PATH-INVALID", `package path ${JSON.stringify(values.package)} must be repository-relative without .., ., .git or backslash segments`);
  if (values.out !== undefined && (!validRepoPath(values.out) || !values.out.startsWith("scratch/") || !values.out.endsWith(".md"))) {
    refuse("DBG-PATH-INVALID", `--out ${JSON.stringify(values.out)} must be a repository-relative scratch/<name>.md path; repair: write the briefing under scratch/`);
  }
  return values;
}

/** Renders the complete briefing of one closed package (PO decision D78); writes only the --out file. */
export function buildDispatchBriefing(options, deps = {}) {
  let root;
  try { root = realpathSync(resolve(options.root ?? process.cwd())); } catch { refuse("DBG-ROOT-UNREADABLE", "--root cannot be resolved to a directory"); }
  const bytes = readRepoFile(root, options.package);
  if (!bytes) refuse("DBG-PACKAGE-UNREADABLE", `package ${options.package} is not a readable regular file under --root; repair: write the package there`);
  let pkg;
  try { pkg = JSON.parse(bytes.toString("utf8")); } catch { refuse("DBG-PACKAGE-UNREADABLE", `package ${options.package} is not valid JSON; repair: fix its JSON`); }
  validateBriefingPackage(pkg);
  assertPackagePathsExist(root, pkg, deps.pathExists);
  const calibration = resolveBriefingCalibration(root, deps.calibration);
  const bind = (agentType) => generateDispatchBinding({
    root, dispatchId: pkg.id, item: pkg.item, agentType, modelId: pkg.modelId,
    check: pkg.check, paths: [...pkg.paths], spec: pkg.spec, criterion: pkg.criterion,
  }, deps);
  // Test-first budget (PO 2026-10-21): an estimate above the tier cap moves the dispatch to the deep tier.
  let generated = bind(pkg.agentType);
  const budget = skeletonToolBudget(generated.skeleton);
  let deep = null;
  if (pkg.estimatedToolCalls !== undefined && budget !== null && pkg.estimatedToolCalls > budget && pkg.agentType !== "goldfish-deep") deep = bind("goldfish-deep");
  const decision = budgetDecision(pkg, budget, deep === null ? null : skeletonToolBudget(deep.skeleton));
  if (decision.raised) {
    generated = { ...deep, warnings: [...deep.warnings, { code: "DBG-PACKAGE-TIER-RAISED", message: `estimatedToolCalls ${pkg.estimatedToolCalls} exceeds the ${pkg.agentType} cap ${budget}; bound to goldfish-deep` }] };
  }
  const rendered = renderGoldfishBriefing(pkg, generated, calibration, decision);
  if (options.out !== undefined) {
    const target = resolve(root, options.out);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, rendered.text, "utf8");
  }
  return {
    schema: BRIEFING_BUILD_SCHEMA, ok: true, dispatchId: pkg.id, path: options.out ?? null,
    sha256: rendered.sha256, warnings: generated.warnings, ...(options.out === undefined ? { text: rendered.text } : {}),
  };
}

/** Argv in, result object out; never throws for a refusal. */
export function runDispatchBriefing(argv, deps = {}) {
  try {
    if (Array.isArray(argv) && argv[0] === "build") return buildDispatchBriefing(parseBuildArgv(argv), deps);
    return generateDispatchBinding(parseBindingArgv(argv), deps);
  } catch (error) {
    const code = error instanceof BriefingRefusal || error instanceof BriefingPackageRefusal ? error.code : "DBG-INTERNAL";
    return { schema: DISPATCH_REFUSAL_SCHEMA, ok: false, code, message: String(error?.message ?? error) };
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = runDispatchBriefing(process.argv.slice(2));
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.ok) process.exitCode = 2;
}
