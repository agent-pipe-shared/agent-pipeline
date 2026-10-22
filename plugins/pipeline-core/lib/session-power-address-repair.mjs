// SPDX-License-Identifier: SUL-1.0
// Typed, plan-bound repair for the per-user session-power address root (PO decisions D71 and D72,
// correction cluster K1, AC-203: no dead end in the session-authority domain).
//
// The address root is `<home>/.apsp`, one 16-hex slot directory per repository fingerprint, each
// holding `anchor.json`. `prepareAddressRoot` in session-power.mjs refuses a root past 4096 entries
// and test fixtures used to leave one slot per fixture repository behind. This module is the repair
// route that refusal names: it moves slots of repositories that no longer exist ASIDE, behind a plan
// whose digest the caller must present back, and it reads the result back. The only mutation it
// performs is that move. It never removes anything, and nothing here is redirectable: the library
// takes the home as a parameter for tests, the CLI binds it to the OS account (D72).
import { createHash, randomBytes } from "node:crypto";
import { constants, closeSync, fstatSync, lstatSync, mkdirSync, openSync, readFileSync, readdirSync, realpathSync, renameSync } from "node:fs";
import { isAbsolute, join, parse, relative, resolve, sep } from "node:path";

/** Same bound as `prepareAddressRoot` in session-power.mjs (pinned by the test file). */
export const ADDRESS_ROOT_BOUND = 4096;
/** Same value as ADDRESS_ROOT_SCHEMA in session-power.mjs (pinned by the test file). */
export const ADDRESS_ANCHOR_SCHEMA = "pipeline.session-power-address-root.v1";
export const ADDRESS_REPAIR_PLAN_SCHEMA = "pipeline.session-power-address-repair-plan.v1";
export const ADDRESS_REPAIR_RESULT_SCHEMA = "pipeline.session-power-address-repair-result.v1";
const PLAN_BINDING_SCHEMA = "pipeline.session-power-address-repair-plan-binding.v1";
const SLOT_NAME = /^[a-f0-9]{16}$/;
const SHA256_HEX = /^[a-f0-9]{64}$/;
const ANCHOR_KEYS = ["commonDir", "primaryRoot", "repositoryFingerprint", "schema"];
const MAX_ANCHOR_BYTES = 65536;

const sha256 = (value) => createHash("sha256").update(value).digest("hex");

export class AddressRepairError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "AddressRepairError";
    this.code = code;
    this.details = details;
  }
}
function refuse(code, message, details) { throw new AddressRepairError(code, message, details); }

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

// Mirrors strictAddressChain in session-power.mjs: every segment from `/` is a real directory
// (no symlink), none is group- or world-writable, the leaf belongs to this user. A private leaf
// additionally needs mode 0700. Ancestors fail with ARR-CHAIN-UNSAFE, the leaf with `leafCode`.
function walkChain(target, { leafCode, privateLeaf = false }) {
  if (typeof target !== "string" || !isAbsolute(target) || resolve(target) !== target || target.includes("\0")) {
    refuse("ARR-HOME-INVALID", "the home must be an absolute, normalised path");
  }
  if (typeof process.getuid !== "function") refuse("ARR-UNAVAILABLE", "physical address custody is unavailable on this platform");
  let cursor = parse(target).root;
  let leaf = null;
  for (const segment of relative(cursor, target).split(sep).filter(Boolean)) {
    cursor = join(cursor, segment);
    const isLeaf = cursor === target;
    const code = isLeaf ? leafCode : "ARR-CHAIN-UNSAFE";
    let stat;
    try { stat = lstatSync(cursor); } catch (error) { refuse(code, `address ancestry cannot be inspected (${error?.code ?? "error"})`); }
    if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o022) !== 0 || realpathSync(cursor) !== cursor) {
      refuse(code, "address ancestry is not a plain directory chain without group or world write");
    }
    if (isLeaf && (stat.uid !== process.getuid() || (privateLeaf && (stat.mode & 0o7777) !== 0o700))) {
      refuse(code, "address directory is foreign or not private");
    }
    leaf = stat;
  }
  return leaf === null ? null : { dev: String(leaf.dev), ino: String(leaf.ino) };
}

function inspectRoot(home) {
  walkChain(home, { leafCode: "ARR-CHAIN-UNSAFE" });
  const root = join(home, ".apsp");
  try { lstatSync(root); } catch (error) {
    if (error?.code === "ENOENT") return { root, identity: null };
    refuse("ARR-ROOT-UNSAFE", "the address root cannot be inspected");
  }
  return { root, identity: walkChain(root, { leafCode: "ARR-ROOT-UNSAFE", privateLeaf: true }) };
}

// O_NONBLOCK keeps a planted FIFO from hanging the open; fstat then rejects anything not a regular file.
function readAnchorBytes(slot) {
  let fd;
  try { fd = openSync(join(slot, "anchor.json"), constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK); }
  catch (error) { return { reason: error?.code === "ENOENT" ? "anchor-missing" : "anchor-unreadable" }; }
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.size > MAX_ANCHOR_BYTES) return { reason: "anchor-unreadable" };
    return { bytes: readFileSync(fd) };
  } catch { return { reason: "anchor-unreadable" }; } finally { closeSync(fd); }
}

function parseAnchor(bytes, name) {
  let value;
  try { value = JSON.parse(bytes.toString("utf8")); } catch { return null; }
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  const keys = Object.keys(value).sort();
  if (keys.length !== ANCHOR_KEYS.length || keys.some((key, index) => key !== ANCHOR_KEYS[index])) return null;
  if (value.schema !== ADDRESS_ANCHOR_SCHEMA
    || typeof value.repositoryFingerprint !== "string" || !SHA256_HEX.test(value.repositoryFingerprint)
    || value.repositoryFingerprint.slice(0, 16) !== name
    || typeof value.primaryRoot !== "string" || !isAbsolute(value.primaryRoot) || value.primaryRoot.includes("\0")
    || typeof value.commonDir !== "string" || !isAbsolute(value.commonDir)) return null;
  return value;
}

// Uncertainty keeps the slot: only a definite ENOENT/ENOTDIR counts as an absent repository.
function repositoryAbsent(primaryRoot) {
  try { lstatSync(primaryRoot); return false; } catch (error) { return error?.code === "ENOENT" || error?.code === "ENOTDIR"; }
}

function classifySlot(root, name) {
  if (!SLOT_NAME.test(name)) return { name, class: "foreign", reason: "name-not-16-hex" };
  const slot = join(root, name);
  let stat;
  try { stat = lstatSync(slot); } catch { return { name, class: "foreign", reason: "slot-unreadable" }; }
  if (!stat.isDirectory() || stat.isSymbolicLink()) return { name, class: "foreign", reason: "slot-not-a-directory" };
  const read = readAnchorBytes(slot);
  if (!read.bytes) return { name, class: "foreign", reason: read.reason };
  const anchor = parseAnchor(read.bytes, name);
  if (!anchor) return { name, class: "foreign", reason: "anchor-invalid" };
  if (!repositoryAbsent(anchor.primaryRoot)) return { name, class: "kept" };
  return { name, class: "absent-repository", anchorSha256: sha256(read.bytes), primaryRoot: anchor.primaryRoot };
}

/**
 * Read-only plan. `planSha256` binds only the root identity and the sorted candidate set (each
 * absent-repository slot's name and anchor digest): a slot another live session adds or a foreign
 * entry appearing between plan and apply does not change it.
 */
export function planAddressRootRepair({ home } = {}) {
  const { root, identity } = inspectRoot(home);
  let names = [];
  if (identity !== null) {
    try { names = readdirSync(root).sort(); } catch { refuse("ARR-ROOT-UNSAFE", "the address root cannot be listed"); }
  }
  const classified = names.map((name) => classifySlot(root, name));
  const candidates = classified.filter((entry) => entry.class === "absent-repository")
    .map(({ name, anchorSha256, primaryRoot }) => ({ name, anchorSha256, primaryRoot }));
  const count = (cls) => classified.filter((entry) => entry.class === cls).length;
  const counts = {
    total: classified.length,
    kept: count("kept"),
    absentRepository: candidates.length,
    foreign: count("foreign"),
    afterRepair: classified.length - candidates.length,
  };
  const binding = {
    schema: PLAN_BINDING_SCHEMA,
    root: identity,
    candidates: candidates.map(({ name, anchorSha256 }) => ({ name, anchorSha256 })),
  };
  return {
    schema: ADDRESS_REPAIR_PLAN_SCHEMA,
    rootPath: root,
    root: identity,
    bound: ADDRESS_ROOT_BOUND,
    counts,
    overBound: counts.total > ADDRESS_ROOT_BOUND,
    withinBoundAfterRepair: counts.afterRepair <= ADDRESS_ROOT_BOUND,
    entries: classified.map(({ name, class: cls, reason }) => (reason ? { name, class: cls, reason } : { name, class: cls })),
    candidates,
    planSha256: sha256(canonical(binding)),
  };
}

function recheckCandidate(root, candidate) {
  const slot = join(root, candidate.name);
  let stat;
  try { stat = lstatSync(slot); } catch (error) { return error?.code === "ENOENT" ? "slot-gone" : "slot-unreadable"; }
  if (!stat.isDirectory() || stat.isSymbolicLink()) return "slot-not-a-directory";
  const read = readAnchorBytes(slot);
  if (!read.bytes) return read.reason;
  if (sha256(read.bytes) !== candidate.anchorSha256) return "anchor-changed";
  const anchor = parseAnchor(read.bytes, candidate.name);
  if (!anchor) return "anchor-invalid";
  return repositoryAbsent(anchor.primaryRoot) ? null : "repository-reappeared";
}

function utcStamp(now) {
  return `${now.toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z")}-${randomBytes(4).toString("hex")}`;
}

/**
 * Apply a plan. The plan is recomputed here and must hash to `expectedPlanSha256` or nothing is
 * touched. Candidates then move one whole slot at a time with renameSync into a fresh 0700
 * directory `<home>/.apsp-aside/<UTC stamp>-<8 hex>/` (never inside the root), each only after its
 * anchor bytes and the repository's absence are re-checked. A candidate that fails the re-check is
 * skipped and reported. A crash leaves whole slots on either side; plan then apply converges.
 *
 * `hooks` is a test seam that observes (and may fault) the loop: `beforeMove(name, index)` and
 * `afterMove(name, index)`. It selects no path and grants no authority; the CLI never passes one.
 */
export function applyAddressRootRepair({ home, expectedPlanSha256, hooks = {} } = {}) {
  if (typeof expectedPlanSha256 !== "string" || !SHA256_HEX.test(expectedPlanSha256)) {
    refuse("ARR-PLAN-DIGEST-REQUIRED", "apply needs the planSha256 printed by plan, as 64 lowercase hex characters");
  }
  const plan = planAddressRootRepair({ home });
  if (plan.planSha256 !== expectedPlanSha256) {
    refuse("ARR-PLAN-MISMATCH", "the address root changed since that plan; run plan again and apply its new digest", { actualPlanSha256: plan.planSha256 });
  }
  const before = plan.counts.total;
  if (plan.candidates.length === 0) {
    return {
      schema: ADDRESS_REPAIR_RESULT_SCHEMA, status: "nothing-to-do", planSha256: plan.planSha256, asidePath: null,
      moved: [], skipped: [], counts: { before, after: before, moved: 0 },
      readback: { movedPresentInAside: true, movedAbsentFromRoot: true, anchorsIntact: true },
    };
  }
  const root = plan.rootPath;
  const asideRoot = join(home, ".apsp-aside");
  try { mkdirSync(asideRoot, { mode: 0o700 }); } catch (error) {
    if (error?.code !== "EEXIST") refuse("ARR-ASIDE-UNSAFE", `the aside directory cannot be created (${error?.code ?? "error"})`);
  }
  walkChain(asideRoot, { leafCode: "ARR-ASIDE-UNSAFE", privateLeaf: true });
  const asidePath = join(asideRoot, utcStamp(new Date()));
  try { mkdirSync(asidePath, { mode: 0o700 }); } catch (error) {
    refuse("ARR-ASIDE-UNSAFE", `the dated aside directory cannot be created (${error?.code ?? "error"})`);
  }
  walkChain(asidePath, { leafCode: "ARR-ASIDE-UNSAFE", privateLeaf: true });

  const moved = [];
  const skipped = [];
  for (const [index, candidate] of plan.candidates.entries()) {
    hooks.beforeMove?.(candidate.name, index);
    const verdict = recheckCandidate(root, candidate);
    if (verdict !== null) { skipped.push({ name: candidate.name, reason: verdict }); continue; }
    try { renameSync(join(root, candidate.name), join(asidePath, candidate.name)); } catch (error) {
      if (error?.code === "ENOENT") { skipped.push({ name: candidate.name, reason: "slot-gone" }); continue; }
      refuse("ARR-MOVE-FAILED", `a slot could not be moved aside (${error?.code ?? "error"}); nothing was removed`, { moved: [...moved], failedSlot: candidate.name });
    }
    moved.push(candidate.name);
    hooks.afterMove?.(candidate.name, index);
  }

  const rootNames = new Set(readdirSync(root));
  const asideNames = new Set(readdirSync(asidePath));
  const planned = new Map(plan.candidates.map((candidate) => [candidate.name, candidate.anchorSha256]));
  const readback = {
    movedPresentInAside: moved.every((name) => asideNames.has(name)),
    movedAbsentFromRoot: moved.every((name) => !rootNames.has(name)),
    anchorsIntact: moved.every((name) => {
      const read = readAnchorBytes(join(asidePath, name));
      return read.bytes !== undefined && sha256(read.bytes) === planned.get(name);
    }),
  };
  if (!readback.movedPresentInAside || !readback.movedAbsentFromRoot || !readback.anchorsIntact) {
    refuse("ARR-READBACK-FAILED", "the readback after the move did not confirm it; nothing was removed, inspect the aside directory", { moved, readback });
  }
  return {
    schema: ADDRESS_REPAIR_RESULT_SCHEMA,
    status: skipped.length === 0 ? "applied" : "partial",
    planSha256: plan.planSha256,
    asidePath,
    moved,
    skipped,
    counts: { before, after: rootNames.size, moved: moved.length },
    readback,
  };
}

/**
 * Plan, then apply that plan's digest only when it has at least one absent-repository slot. Never
 * throws. Off linux nothing reads or changes (the address root is prepared only on linux).
 */
export function repairAddressRootQuietly({ home, platform = process.platform } = {}) {
  if (platform !== "linux") return { status: "nothing-to-do", code: "ARR-NOT-LINUX", moved: 0 };
  try {
    const plan = planAddressRootRepair({ home });
    if (plan.candidates.length === 0) return { status: "nothing-to-do", code: "ARR-NOTHING-TO-DO", moved: 0 };
    const result = applyAddressRootRepair({ home, expectedPlanSha256: plan.planSha256 });
    return { status: result.moved.length > 0 ? "repaired" : "failed", code: result.skipped.length === 0 ? "ARR-OK" : "ARR-PARTIAL", moved: result.moved.length };
  } catch (error) {
    const code = typeof error?.code === "string" && error.code.startsWith("ARR-") ? error.code : "ARR-UNEXPECTED";
    return { status: "failed", code, moved: Array.isArray(error?.details?.moved) ? error.details.moved.length : 0 };
  }
}
