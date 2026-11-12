// SPDX-License-Identifier: SUL-1.0
/**
 * G20-72 (candidate 20e, AC-108): a review range too large for ONE Critic is split per module, and the merged verdict still ends in one SOURCE-issued verdict.
 *
 * Measured (greenfield, 2026-11-08): a whole-feature Critic reached its budget checkpoint at call 40 of 50 while still reading, and no Critic can exceed
 * `maxTurns - CLOSING_ALLOWANCE - 1` working calls whatever is granted. So the range is cut per module of the approved architecture plan; each module gets its own fresh Critic
 * (an ordinary Critic dispatch from the same template), and this module holds the three pure pieces every runner shares:
 *
 *   1. `buildCriticSplit`   the additive `split` the Critic preflight prints and `admit` binds (null when the range fits one Critic);
 *   2. `mergeSplitVerdicts` the merge (pass is the AND, findings and briefing violations the union, the trajectory the worst) with typed refusals;
 *   3. `attributeVerdict`   which entry a returned verdict belongs to (the first words of its `trajectory_evidence`: `scope:<entryId>`).
 *
 * Read-only on purpose: the Critic preflight imports it, and its import closure names no write API (critic-dispatch-preflight.test.mjs, D216A). The origin evidence
 * for the children lives in lib/critic-source-return.mjs; the gate over it in scripts/session-critic-finalizer.mjs. The verdict schema gets no new field.
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { deriveCriticCorrectionInputBindings } from "./critic-correction-input-bindings.mjs";
import { dispatchCheckpointThreshold, dispatchWorkingCap } from "./dispatch-budget-core.mjs";
import { sha256Canonical } from "./review-economy.mjs";
import { validateAgainstSchema } from "./schema-lite.mjs";

export const CRITIC_SPLIT_SCHEMA = "pipeline.critic-review-split.v1";
/**
 * C28-CRITIC-TOIL (PO decision 2026-11-10): the part size follows the Critic budget. The agent definition (`agents/critic.md`) is preimage-pinned; by a second PO decision
 * the same day its maxTurns was raised once from 65 to 100 (one re-pin), so that a range of 17 to 25 files fits one Critic. CRITIC_MAX_TURNS mirrors that file (a test compares
 * them). A Critic has `dispatchWorkingCap(100) = 85` working calls (lib/dispatch-budget-core.mjs) and is told to hand back at the checkpoint, call 68. The review must be read AND
 * its verdict composed before that call, so the figures below fix the one bound (28 files).
 *
 * MEASURED: the greenfield Critic parts of 17 to 25 changed files reached the checkpoint at call 40 of 50 while still reading. With about 8 fixed calls (spec criterion,
 * guardrails, evidence, bindings, notes) that is (40 - 8) / 17 = 1.9 reads per file, so 2 (the file's diff and the source or test beside it). The verdict needs about 4 more.
 * Still a small sample, not a distribution of reviews: change the figures here and nowhere else.
 */
export const CRITIC_MAX_TURNS = 100;
export const CRITIC_FIXED_CALLS = 8;
export const CRITIC_READS_PER_FILE = 2;
export const CRITIC_VERDICT_RESERVE = 4;
const CRITIC_WORKING_CAP = dispatchWorkingCap(CRITIC_MAX_TURNS);
const criticReviewNeed = (files) => CRITIC_FIXED_CALLS + CRITIC_READS_PER_FILE * files + CRITIC_VERDICT_RESERVE;
/** The ONE size bound: the largest part whose estimated calls end before the checkpoint of the full working cap (28 for the figures above). */
export const SPLIT_MAX_CHANGED_FILES = Math.floor((dispatchCheckpointThreshold(CRITIC_WORKING_CAP) - CRITIC_FIXED_CALLS - CRITIC_VERDICT_RESERVE) / CRITIC_READS_PER_FILE);

/** The base tool budget a Critic part of `files` paths is briefed with: the smallest base cap whose checkpoint comes after the estimated review, never above the working cap. */
export function criticToolBudget(files) {
  const need = criticReviewNeed(Math.max(0, Number.isSafeInteger(files) ? files : 0));
  for (let budget = 1; budget < CRITIC_WORKING_CAP; budget += 1) if (dispatchCheckpointThreshold(budget) >= need) return budget;
  return CRITIC_WORKING_CAP;
}

/**
 * What the preflight prints for one part (or for a whole range one Critic reads): its path count, the budget it is briefed with and whether it is above the bound. A part above
 * the bound (a current-artifact review scope is never split) says so here, with the figures, instead of leaving it to a budget checkpoint in the middle of the review.
 */
export function criticSizing(files) {
  const sizing = { files, toolBudget: criticToolBudget(files), workingCap: CRITIC_WORKING_CAP, aboveBound: files > SPLIT_MAX_CHANGED_FILES };
  if (!sizing.aboveBound) return sizing;
  return { ...sizing, notice: `${files} files are above the ${SPLIT_MAX_CHANGED_FILES} one Critic reads within its budget (estimated ${criticReviewNeed(files)} calls against the budget checkpoint at call ${dispatchCheckpointThreshold(CRITIC_WORKING_CAP)} of ${CRITIC_WORKING_CAP}): expect a budget checkpoint and a grant, or review a smaller range. The Critic's turn limit is fixed by the pinned agent file (agents/critic.md, maxTurns ${CRITIC_MAX_TURNS}), so the part size is the lever.` };
}
export const SPLIT_SHARED_ENTRY_ID = "shared";
export const SPLIT_SCOPE_PREFIX = "scope:";
export const splitScopeMarker = (id) => `${SPLIT_SCOPE_PREFIX}${id}`;

const ENTRY_ID = /^[a-z][a-z0-9-]*$/u;
const OID = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u;
/** A sanity bound on one split round (PO 2026-11-08: 256), not a read budget. A range that needs more entries is refused by the preflight before anything is reserved. */
export const SPLIT_MAX_ENTRIES = 256;
const MAX_PRD_BYTES = 4 * 1024 * 1024;
const SPLIT_KEYS = ["schema", "base", "candidate", "maxChangedFiles", "changedFileCount", "plan", "entries"];
const ENTRY_KEYS = ["id", "moduleId", "paths", "scopeMarker", "reviewerInput", "batchScopeLine"];
const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const closed = (value, keys) => isObject(value) && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
const VERDICT_SCHEMA = JSON.parse(readFileSync(new URL("../scripts/critic-verdict.schema.json", import.meta.url), "utf8"));

/** The digest `admit` binds and every reader recomputes: key-order independent. */
export const criticSplitDigest = (split) => sha256Canonical(split);

function gitLines(root, args) {
  const run = spawnSync("git", ["-C", root, "-c", "core.quotepath=false", ...args], { encoding: "utf8", shell: false, timeout: 15_000, maxBuffer: 64 * 1024 * 1024 });
  return run.status === 0 && typeof run.stdout === "string" ? run.stdout.split("\0").filter((line) => line !== "") : null;
}

/** The modules (id and owned paths only) of the one PRD under the spec's directory that holds an approved architecture design block, read from the candidate commit. */
function readPlan(root, candidate, specPath) {
  const slash = specPath.lastIndexOf("/");
  const dir = slash < 0 ? "" : specPath.slice(0, slash + 1);
  const files = gitLines(root, ["ls-tree", "-r", "--name-only", "-z", candidate, "--", dir === "" ? "." : dir]);
  const plans = [];
  for (const file of files ?? []) {
    const rest = file.slice(dir.length);
    if (rest.split("/").length > 3 || !/^prd[^/]*\.md$/iu.test(rest.slice(rest.lastIndexOf("/") + 1))) continue;
    const shown = spawnSync("git", ["-C", root, "show", `${candidate}:${file}`], { encoding: "utf8", shell: false, timeout: 15_000, maxBuffer: MAX_PRD_BYTES });
    if (shown.status !== 0 || typeof shown.stdout !== "string") continue;
    const blocks = [...shown.stdout.matchAll(/^```pipeline-architecture-design\r?\n([\s\S]*?)^```\s*$/gmu)];
    if (blocks.length !== 1) continue;
    let design;
    try { design = JSON.parse(blocks[0][1]); } catch { continue; }
    const modules = design?.modules;
    if (!Array.isArray(modules) || modules.length === 0 || new Set(modules.map((module) => module?.id)).size !== modules.length
      || !modules.every((module) => isObject(module) && ENTRY_ID.test(module.id ?? "") && module.id !== SPLIT_SHARED_ENTRY_ID && Array.isArray(module.ownedPaths) && module.ownedPaths.length > 0
        && module.ownedPaths.every((path) => typeof path === "string" && path !== "" && !path.startsWith("/") && !path.includes("..")))) continue;
    plans.push({ path: file, modules: modules.map(({ id, ownedPaths }) => ({ id, ownedPaths })) });
  }
  if (plans.length === 1) return { status: "approved", path: plans[0].path, modules: plans[0].modules };
  return { status: plans.length === 0 ? "none" : "ambiguous", path: null, modules: [] };
}

/** How specifically an owned-path pattern matches a changed file: the pattern length, or -1 for no match. `dir/**`, `dir/*` and `dir/` are prefixes; anything else is exact. */
function matchLength(pattern, file) {
  const prefix = /^(.*\/)\*{1,2}$/u.exec(pattern)?.[1] ?? (pattern.endsWith("/") ? pattern : null);
  if (prefix !== null) return file.startsWith(prefix) ? prefix.length : -1;
  return file === pattern ? pattern.length + 1 : -1;
}

/**
 * The changed paths a Critic must never read: exactly the exclusions of the range's correction-input bindings (project-state record, finding-disposition record, retained prior
 * result; review protocol §2.2). A path is here only because the derivation bound it.
 * The preflight has already judged this derivation, so a failure here excludes nothing and the path stays visible to its Critic.
 */
function boundExclusions(root, base, candidate) {
  const derive = (options) => deriveCriticCorrectionInputBindings({ repoRoot: root, base, head: candidate, ...options });
  try {
    try { return new Set(derive({}).exclusions.map((exclusion) => exclusion.path)); }
    catch (error) {
      if (error?.code !== "CCI-CALIBRATION") throw error;
      return new Set(derive({ projectStateOptional: true }).exclusions.map((exclusion) => exclusion.path));
    }
  } catch { return new Set(); }
}

/**
 * The one directory exception of the review protocol §2.2, for split rounds only: delivery records (run evidence of a feature, backlog notes) are left out of the parts,
 * a file with a script extension in those folders stays review source. Keep this list and that section identical.
 */
const DELIVERY_RECORD_PATH = /^(?:specs\/[^/]+\/evidence\/|backlog\/(?:items|evidence|dispatch-specs)\/)/u;
const SCRIPT_EXTENSION = /\.(?:mjs|cjs|js|ts|sh|ps1|py)$/u;
const isDeliveryRecord = (file) => DELIVERY_RECORD_PATH.test(file) && !SCRIPT_EXTENSION.test(file);

/**
 * Cuts paths into parts of at most `max` files. A directory that fits stays whole; a larger one is cut along its subdirectories, and only files lying directly in one directory
 * are chunked. Neighbouring pieces are then packed together while they fit, so a range does not turn into many tiny Critics. Disjoint, covers every path, deterministic.
 */
function cutByDirectory(paths, max) {
  const pieces = (items, depth) => {
    if (items.length <= max) return [items];
    const byDirectory = new Map();
    for (const path of items) {
      const segments = path.split("/");
      const directory = segments.length > depth + 1 ? segments[depth] : "";
      byDirectory.set(directory, [...(byDirectory.get(directory) ?? []), path]);
    }
    return [...byDirectory].flatMap(([directory, group]) => {
      if (directory !== "") return pieces(group, depth + 1);
      return Array.from({ length: Math.ceil(group.length / max) }, (_, index) => group.slice(index * max, (index + 1) * max));
    });
  };
  const parts = [];
  for (const piece of pieces([...paths].sort(), 0)) {
    const last = parts.at(-1);
    if (last !== undefined && last.length + piece.length <= max) last.push(...piece);
    else parts.push([...piece]);
  }
  return parts;
}

/**
 * PO decision 2026-11-09 (greenfield runs: one small module per Critic meant many Critics that each read a handful of files): groups are packed together up to the bound, largest
 * first and into the first one with room, so the round needs as few Critics as the bound allows. A group that stays alone keeps its id and module; a packed one becomes `group-<n>`,
 * names its members in its scope line and has no single module. A leftover smaller than the bound stays alone: nothing is left to pack it with. Deterministic.
 */
function packSmallGroups(parts, max, taken) {
  const bins = [];
  const position = new Map(parts.map((part, index) => [part.id, index]));
  for (const part of [...parts].sort((left, right) => right.paths.length - left.paths.length || position.get(left.id) - position.get(right.id))) {
    const bin = bins.find((candidate) => candidate.size + part.paths.length <= max);
    if (bin === undefined) bins.push({ size: part.paths.length, first: position.get(part.id), members: [part] });
    else { bin.size += part.paths.length; bin.first = Math.min(bin.first, position.get(part.id)); bin.members.push(part); }
  }
  let suffix = 0;
  return bins.sort((left, right) => left.first - right.first).map(({ members }) => {
    if (members.length === 1) return members[0];
    do suffix += 1; while (taken.has(`group-${suffix}`));
    return { id: `group-${suffix}`, moduleId: null, paths: members.flatMap((member) => member.paths).sort(), label: `path group group-${suffix} (${members.map((member) => member.label).join(", ")})` };
  });
}

/**
 * The changed paths of a packet-ready exact-range result and the ones left once the bound exclusions are removed, or null (a review scope, no range, git unreadable).
 * `remaining` is what a Critic is given as its path list and its diff command: no history path, prior review, verdict or receipt the bindings exclude (C28-CRITIC-TOIL).
 */
function rangePaths(root, result) {
  if (result?.status !== "packet-ready" || result.reviewScope !== undefined || typeof result.candidate?.commit !== "string") return null;
  const base = result.base?.commit ?? result.base?.tree;
  const candidate = result.candidate.commit;
  const changed = typeof base === "string" ? gitLines(root, ["diff", "--name-only", "--no-renames", "-z", base, candidate]) : null;
  if (changed === null) return null;
  const excluded = boundExclusions(root, base, candidate);
  return { base, candidate, changed, remaining: changed.filter((file) => !excluded.has(file)) };
}

/** The reviewable paths of a packet-ready exact-range result (the bound exclusions left out), or null. Printed beside the result; the library result is unchanged. */
export function criticReviewPaths({ root, result }) {
  const range = rangePaths(root, result);
  return range === null ? null : [...range.remaining].sort();
}

/**
 * The split of a packet-ready exact-range result, or null when the range fits one Critic (at most SPLIT_MAX_CHANGED_FILES changed files after the bound exclusions) or holds nothing but
 * delivery records. Delivery records count towards that bound, because an unsplit Critic would have them in its range, and are then left out of the parts.
 * One entry per module of the approved architecture plan that owns a changed path (disjoint scopes: a path goes to the module whose owned-path pattern matches it most
 * specifically, ties by module id), plus ONE shared entry for every changed path no module owns, which is never dropped. Without exactly one approved plan every path is in
 * the shared group and `plan.status` says why. A group above the bound (the shared group without a plan, or one very large module) is cut along directories into entries
 * `<group>-part-<n>`, so no entry is larger than one Critic can read. Deterministic from the repository and the result alone, so `admit` rebuilds the identical object.
 * @param {{ root: string, result: object }} input `result` is the library preflight result (status packet-ready, exact range).
 */
export function buildCriticSplit({ root, result }) {
  const paths = rangePaths(root, result);
  if (paths === null) return null;
  const { base, candidate, changed, remaining } = paths;
  if (remaining.length <= SPLIT_MAX_CHANGED_FILES) return null;
  const reviewable = remaining.filter((file) => !isDeliveryRecord(file));
  if (reviewable.length === 0) return null;
  const plan = readPlan(root, candidate, result.spec?.path ?? "");
  const owned = new Map(plan.modules.map((module) => [module.id, []]));
  const shared = [];
  for (const file of [...reviewable].sort()) {
    let best = null;
    for (const module of plan.modules) {
      const length = Math.max(...module.ownedPaths.map((pattern) => matchLength(pattern, file)));
      if (length >= 0 && (best === null || length > best.length || (length === best.length && module.id < best.id))) best = { id: module.id, length };
    }
    (best === null ? shared : owned.get(best.id)).push(file);
  }
  const groups = [...plan.modules.map((module) => module.id).sort().map((id) => ({ id, moduleId: id, paths: owned.get(id), label: `module ${id}` })),
    { id: SPLIT_SHARED_ENTRY_ID, moduleId: null, paths: shared, label: "the shared entry (every changed path no module owns)" }].filter((group) => group.paths.length > 0);
  const moduleIds = new Set(plan.modules.map((module) => module.id));
  const cut = groups.flatMap((group) => {
    if (group.paths.length <= SPLIT_MAX_CHANGED_FILES) return [group];
    let suffix = 0;
    return cutByDirectory(group.paths, SPLIT_MAX_CHANGED_FILES).map((paths) => {
      do suffix += 1; while (moduleIds.has(`${group.id}-part-${suffix}`));
      const id = `${group.id}-part-${suffix}`;
      return { id, moduleId: null, paths, label: `path group ${id} of ${group.label}` };
    });
  });
  const parts = packSmallGroups(cut, SPLIT_MAX_CHANGED_FILES, moduleIds);
  const range = `${base.slice(0, 12)}..${candidate.slice(0, 12)}`;
  return {
    schema: CRITIC_SPLIT_SCHEMA, base, candidate, maxChangedFiles: SPLIT_MAX_CHANGED_FILES, changedFileCount: changed.length,
    plan: { status: plan.status, path: plan.path },
    entries: parts.map((group, index) => ({
      id: group.id, moduleId: group.moduleId, paths: group.paths, scopeMarker: splitScopeMarker(group.id),
      reviewerInput: { ...result.dispatch.reviewerInput, changedPaths: group.paths },
      batchScopeLine: `Batch scope (MP-07): ${group.label} of the reviewed range ${range} (${group.paths.length} of ${changed.length} changed files), part ${index + 1} of ${parts.length} of one split review round.`,
    })),
  };
}

/** Why a value is not a split this module produced (null when it is one). Closed shapes; the entry scopes are disjoint. */
export function criticSplitProblem(split) {
  if (!closed(split, SPLIT_KEYS) || split.schema !== CRITIC_SPLIT_SCHEMA || !OID.test(split.base ?? "") || !OID.test(split.candidate ?? "")
    || !Number.isSafeInteger(split.maxChangedFiles) || !Number.isSafeInteger(split.changedFileCount)
    || !closed(split.plan, ["status", "path"]) || !["approved", "none", "ambiguous"].includes(split.plan.status)
    || !(split.plan.path === null || typeof split.plan.path === "string")
    || !Array.isArray(split.entries) || split.entries.length === 0 || split.entries.length > SPLIT_MAX_ENTRIES) return "the split does not have the closed shape of a Critic review split";
  const ids = new Set(), paths = new Set();
  for (const entry of split.entries) {
    if (!closed(entry, ENTRY_KEYS) || !ENTRY_ID.test(entry.id ?? "") || ids.has(entry.id) || entry.scopeMarker !== splitScopeMarker(entry.id)
      || !(entry.moduleId === null || entry.moduleId === entry.id) || !isObject(entry.reviewerInput) || typeof entry.batchScopeLine !== "string"
      || !Array.isArray(entry.paths) || entry.paths.length === 0 || !entry.paths.every((path) => typeof path === "string" && path !== "")) return `split entry ${JSON.stringify(String(entry?.id).slice(0, 40))} is not well formed or repeats an id`;
    ids.add(entry.id);
    for (const path of entry.paths) { if (paths.has(path)) return `path ${JSON.stringify(path.slice(0, 120))} is in two split entries`; paths.add(path); }
  }
  return null;
}

/** The entry a returned verdict belongs to: its `trajectory_evidence` starts with `scope:<entryId>` (the marker the dispatch prompt asks for); null when it names none of the split. */
export function attributeVerdict(split, verdict) {
  const text = verdict?.trajectory_evidence;
  const id = typeof text === "string" ? /^scope:([a-z][a-z0-9-]*)(?=[\s.,:;]|$)/u.exec(text)?.[1] : undefined;
  return id !== undefined && split.entries.some((entry) => entry.id === id) ? id : null;
}

/** C21B: what in a schema-valid verdict contradicts its `pass: true`, in words, or null when nothing does. */
export function verdictPassContradiction(verdict) {
  if (verdict?.pass !== true) return null;
  const reasons = [];
  if (verdict.findings.some(({ severity }) => severity === "blocker" || severity === "major")) reasons.push("blocker or major finding");
  if (verdict.briefing_violations.length > 0) reasons.push("briefing violation");
  if (verdict.trajectory_verdict !== "consistent") reasons.push(`trajectory_verdict ${JSON.stringify(verdict.trajectory_verdict)}`);
  return reasons.length === 0 ? null : reasons.join(" and ");
}

const SEVERITY_RANK = { blocker: 0, major: 1, minor: 2 };
const TRAJECTORY_RANK = { consistent: 0, "not verifiable": 1, inconsistent: 2 };
const NEXT_ROUND = "release this packet (session-critic-finalizer.mjs release) and open the next round of the batch with a new packet id";
const fail = (code, what, repair) => ({ ok: false, code, message: `${what}; repair: ${repair}` });
/** The id of a finding: the schema has none, so it is the digest of what makes a finding the same finding. */
export const splitFindingId = (finding) => sha256Canonical({ spec_ref: finding.spec_ref, evidence: finding.evidence });
const unique = (items) => [...new Set(items)];
const cites = (text, path) => {
  for (let at = text.indexOf(path); at >= 0; at = text.indexOf(path, at + 1)) {
    if (!/[\w./-]/u.test(text[at - 1] ?? "") && !/^(?:[\w-]|\.\w)/u.test(text.slice(at + path.length, at + path.length + 2))) return true;
  }
  return false;
};

/**
 * The merge. Pure: `children` are `{ entryId, verdict }`. Refuses (typed code, repair in the message) a child for an entry the split does not have, two children for one entry
 * (a caller must never run a child twice and keep the better verdict), a missing child, a child that is not a valid verdict, whose scope marker is not its own entry, or whose
 * findings cite only paths of another entry, and a finding id that appears twice. Never throws.
 * @returns `{ ok: true, verdict, findingIds }` or `{ ok: false, code, message }`
 */
export function mergeSplitVerdicts(split, children) {
  try {
    const problem = criticSplitProblem(split);
    if (problem !== null) return fail("CSM-SPLIT-INVALID", problem, "pass the split object exactly as the Critic preflight printed it");
    if (!Array.isArray(children)) return fail("CSM-CHILD-MISSING", "no child verdicts were given", "pass one --child <entryId>=<verdict file> per split entry");
    const byEntry = new Map();
    for (const { entryId, verdict } of children) {
      if (!split.entries.some((entry) => entry.id === entryId)) return fail("CSM-CHILD-UNKNOWN", `entry ${JSON.stringify(String(entryId).slice(0, 40))} is not an entry of the split (${split.entries.map((entry) => entry.id).join(", ")})`, "use only the entry ids of the printed split");
      if (byEntry.has(entryId)) return fail("CSM-CHILD-DUPLICATE", `two child verdicts were given for entry ${entryId}`, `one Critic per entry decides; ${NEXT_ROUND}`);
      byEntry.set(entryId, verdict);
    }
    const missing = split.entries.filter((entry) => !byEntry.has(entry.id)).map((entry) => entry.id);
    if (missing.length > 0) return fail("CSM-CHILD-MISSING", `no child verdict for entry ${missing.join(", ")}`, `dispatch one Critic per split entry and pass every verdict (${missing.join(", ")} still missing)`);
    const seen = new Map();
    for (const entry of split.entries) {
      const verdict = byEntry.get(entry.id);
      if (!validateAgainstSchema(verdict, VERDICT_SCHEMA).valid) return fail("CSM-CHILD-INVALID", `the child verdict of entry ${entry.id} is not a Critic verdict`, "pass the Critic's returned JSON verbatim");
      const contradiction = verdictPassContradiction(verdict);
      if (contradiction !== null) {
        return fail("CSM-CHILD-INVALID", `the child verdict of entry ${entry.id} says pass true against its own ${contradiction}`, "resume that Critic and have it return its verdict again with pass false or without that entry, then pass the new return verbatim; a hand-edited file matches no Source return");
      }
      if (attributeVerdict(split, verdict) !== entry.id) return fail("CSM-CHILD-UNATTRIBUTED", `the child verdict given for entry ${entry.id} does not start its trajectory_evidence with ${entry.scopeMarker}`, `dispatch the entry's Critic with the instruction to begin trajectory_evidence with "${entry.scopeMarker} " and run that entry again`);
      const others = split.entries.filter((other) => other.id !== entry.id);
      for (const finding of verdict.findings) {
        if (!entry.paths.some((path) => cites(finding.evidence, path)) && others.some((other) => other.paths.some((path) => cites(finding.evidence, path)))) {
          return fail("CSM-CHILD-OUT-OF-SCOPE", `a finding of entry ${entry.id} cites only paths of another entry (${JSON.stringify(finding.evidence.slice(0, 80))})`, `a child reviews only its own entry's paths; give the finding to the Critic of the entry that owns the path`);
        }
        const id = splitFindingId(finding);
        if (seen.has(id)) return fail("CSM-FINDING-DUPLICATE", `the same finding (spec_ref and evidence) is in entry ${seen.get(id)} and entry ${entry.id}`, "report a finding in exactly one entry");
        seen.set(id, entry.id);
      }
    }
    const ordered = split.entries.map((entry) => byEntry.get(entry.id));
    const findings = ordered.flatMap((verdict) => verdict.findings).map((finding, index) => ({ finding, index }))
      .sort((left, right) => SEVERITY_RANK[left.finding.severity] - SEVERITY_RANK[right.finding.severity] || left.index - right.index).map(({ finding }) => finding);
    return { ok: true, findingIds: [...seen.keys()], verdict: {
      findings,
      deliberately_not_flagged: unique(ordered.flatMap((verdict) => verdict.deliberately_not_flagged)),
      trajectory_verdict: ordered.map((verdict) => verdict.trajectory_verdict).sort((left, right) => TRAJECTORY_RANK[right] - TRAJECTORY_RANK[left])[0],
      trajectory_evidence: ordered.map((verdict) => verdict.trajectory_evidence).join("\n"),
      briefing_violations: unique(ordered.flatMap((verdict) => verdict.briefing_violations)),
      pass: ordered.every((verdict) => verdict.pass),
    } };
  } catch { return fail("CSM-SPLIT-INVALID", "the split or a child verdict could not be read", "pass the split and the verdicts exactly as printed and returned"); }
}

/** The repair every origin refusal of a split round names: the children of a split packet cannot be re-run inside it. */
export const SPLIT_NEXT_ROUND_REPAIR = NEXT_ROUND;
