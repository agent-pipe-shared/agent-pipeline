// SPDX-License-Identifier: SUL-1.0
// Derives the correction-input bindings of a Critic range: for every path a commit range changed it records either
// "source" (listed by exact path) or an exclusion (role + every touched version's blob identity, SHA-256 and mode).
// Metadata-only git observations; an excluded file's bytes are hashed in memory and never stored or printed.
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { posix } from "node:path";
import { sha256Canonical } from "./review-economy.mjs";

export const CRITIC_CORRECTION_INPUT_BINDINGS_SCHEMA = "pipeline.critic-correction-input-bindings.v1";
export const ROLE_RETAINED_PRIOR_RESULT = "retained prior result";
export const ROLE_PROJECT_STATE_RECORD = "project-state record";
export const ROLE_FINDING_DISPOSITION_RECORD = "finding-disposition record";
export const FINDING_RECORDS_FIELD = "criticFindingRecordPaths";
const ABSENT = "absent";
const EMPTY_TREE = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";
const ZERO_ID = /^0+$/u;
const CHANGE_NAMES = { A: "added", M: "modified", D: "deleted", T: "type-changed", R: "renamed", C: "copied" };
// The layout session-critic-finalizer.mjs writes: specs/<segment>/evidence/critic/<packetId>/..., and the root form evidence/critic/....
// Also the two immutable files the course registration (register-feature-package.mjs) writes beside that directory,
// `critic-lineage-<sha256>.json` and `critic-delta-request-<sha256>.json`: they carry the prior round's verdict metadata (PF-98).
const RETAINED_PATTERN = /^(?:specs\/[^/]+\/)?evidence\/(?:critic\/[^/]+(?:\/[^/]+)*|critic-(?:lineage|delta-request)-[0-9a-f]{64}\.json)$/u;

export class CriticCorrectionInputBindingsError extends Error {
  constructor(code, detail) {
    super(`${code}: ${detail}`);
    this.name = "CriticCorrectionInputBindingsError";
    this.code = code;
    this.detail = detail;
  }
}
const fail = (code, detail) => { throw new CriticCorrectionInputBindingsError(code, detail); };

function git(repoRoot, args, { buffer = false } = {}) {
  const result = spawnSync("git", ["-C", repoRoot, ...args], { encoding: buffer ? null : "utf8", maxBuffer: 256 * 1024 * 1024 });
  if (result.error || result.status !== 0) return { ok: false, stdout: null };
  return { ok: true, stdout: result.stdout };
}
function gitOrRange(repoRoot, args, what) {
  const result = git(repoRoot, args);
  if (!result.ok) fail("CCI-RANGE", `git observation failed: ${what}`);
  return result.stdout;
}

function readCalibration(repoRoot, head) {
  const shown = git(repoRoot, ["show", `${head}:project/pipeline.json`]);
  if (!shown.ok) fail("CCI-CALIBRATION", "project/pipeline.json is not readable at the head commit");
  try { return JSON.parse(shown.stdout); } catch { fail("CCI-CALIBRATION", "project/pipeline.json is not valid JSON"); }
}

function handoverOf(calibration) {
  const handover = calibration?.handover;
  if (typeof handover !== "string" || handover === "" || handover.startsWith("/") || handover.includes("\\")
    || handover.split("/").some((part) => part === "" || part === "." || part === "..")) {
    fail("CCI-CALIBRATION", "the calibration handover field is missing or not a repository-relative path");
  }
  return handover;
}

// D213: the calibration names, positively, the files that quote earlier Critic findings and carry no source or operative
// contract. An entry is one exact repository-relative file path, or a directory prefix ending in "/"; no globs. A file never
// declares itself: only this committed list does. An absent field means none; a malformed one is refused, never ignored.
const FINDING_RECORD_LIMIT = 64;
function findingRecordsOf(calibration) {
  const listed = calibration?.[FINDING_RECORDS_FIELD];
  if (listed === undefined) return [];
  const invalid = (entry) => typeof entry !== "string" || entry === "" || entry.startsWith("/") || entry.includes("\\") || entry.includes("*")
    || entry.replace(/\/$/u, "").split("/").some((part) => part === "" || part === "." || part === "..");
  if (!Array.isArray(listed) || listed.length > FINDING_RECORD_LIMIT || listed.some(invalid)) {
    fail("CCI-FINDING-RECORDS", `the calibration field ${FINDING_RECORDS_FIELD} must be an array of at most ${FINDING_RECORD_LIMIT} repository-relative file paths or directory prefixes ending in "/" (no globs)`);
  }
  return [...new Set(listed)].sort();
}

function classify(path, handover, findingRecords = []) {
  if (handover !== null && path === handover) return ROLE_PROJECT_STATE_RECORD;
  if (handover !== null && posix.dirname(path) === posix.dirname(handover) && /^pipeline-handover[^/]*\.md$/u.test(posix.basename(path))) return ROLE_PROJECT_STATE_RECORD;
  if (RETAINED_PATTERN.test(path)) return ROLE_RETAINED_PRIOR_RESULT;
  if (findingRecords.some((entry) => (entry.endsWith("/") ? path.startsWith(entry) : path === entry))) return ROLE_FINDING_DISPOSITION_RECORD;
  return "source";
}

function parseRaw(output) {
  const parts = output.split("\0");
  const entries = [];
  let i = 0;
  while (i < parts.length && parts[i] !== "") {
    const header = /^:(\d{6}) (\d{6}) ([0-9a-f]+) ([0-9a-f]+) ([A-Z])\d*$/u.exec(parts[i]);
    if (header === null) fail("CCI-UNEXPECTED", "unrecognized raw diff record");
    const [, modeBefore, modeAfter, blobBefore, blobAfter, status] = header;
    const paths = (status === "R" || status === "C") ? [parts[i + 1], parts[i + 2]] : [parts[i + 1]];
    i += 1 + paths.length;
    entries.push({ modeBefore, modeAfter, blobBefore, blobAfter, status, paths });
  }
  return entries;
}
const side = (value) => (ZERO_ID.test(value) ? ABSENT : value);

function sha256OfBlob(repoRoot, blob) {
  if (blob === ABSENT) return ABSENT;
  const object = git(repoRoot, ["cat-file", "blob", blob], { buffer: true });
  if (!object.ok) fail("CCI-RANGE", "an excluded blob could not be read");
  return createHash("sha256").update(object.stdout).digest("hex");
}

// projectStateOptional: an unreadable calibration then means "no project-state paths" (the default stays refusing).
export function deriveCriticCorrectionInputBindings({ repoRoot, base, head, projectStateOptional = false } = {}) {
  try {
    if (typeof repoRoot !== "string" || typeof base !== "string" || typeof head !== "string" || base === "" || head === "") fail("CCI-RANGE", "repoRoot, base and head are required");
    const resolve = (ref) => gitOrRange(repoRoot, ["rev-parse", "--verify", "--end-of-options", `${ref}^{commit}`], "resolve commit").trim();
    const baseCommit = resolve(base), headCommit = resolve(head);
    if (!git(repoRoot, ["merge-base", "--is-ancestor", baseCommit, headCommit]).ok) fail("CCI-RANGE", "base is not an ancestor of head");
    const treeOf = (commit) => gitOrRange(repoRoot, ["rev-parse", `${commit}^{tree}`], "resolve tree").trim();
    let handover;
    let findingRecords = [];
    if (projectStateOptional === true) {
      // An unreadable calibration then means "no project-state paths and no finding records"; a malformed finding-record list is still refused.
      let calibration = null;
      try { calibration = readCalibration(repoRoot, headCommit); } catch (error) {
        if (!(error instanceof CriticCorrectionInputBindingsError && error.code === "CCI-CALIBRATION")) throw error;
      }
      try { handover = calibration === null ? null : handoverOf(calibration); } catch (error) {
        if (error instanceof CriticCorrectionInputBindingsError && error.code === "CCI-CALIBRATION") handover = null; else throw error;
      }
      findingRecords = calibration === null ? [] : findingRecordsOf(calibration);
    } else {
      const calibration = readCalibration(repoRoot, headCommit);
      handover = handoverOf(calibration);
      findingRecords = findingRecordsOf(calibration);
    }
    const listed = gitOrRange(repoRoot, ["rev-list", "--reverse", "--parents", `${baseCommit}..${headCommit}`], "list range").split("\n").filter(Boolean);
    const commits = listed.map((line) => { const [commit, ...parents] = line.split(" "); return { commit, parents, tree: treeOf(commit) }; });
    const excluded = new Map();
    const sources = new Set();
    for (const { commit, parents } of commits) {
      const from = parents[0] ?? EMPTY_TREE;
      const raw = gitOrRange(repoRoot, ["diff-tree", "-r", "-z", "-M", "--raw", "--no-textconv", "--no-ext-diff", from, commit], "diff-tree");
      for (const entry of parseRaw(raw)) {
        const roles = entry.paths.map((p) => classify(p, handover, findingRecords));
        if (new Set(roles).size > 1) fail("CCI-MIXED", `a ${CHANGE_NAMES[entry.status] ?? "change"} crosses classes (${roles.join(" / ")})`);
        entry.paths.forEach((path, index) => {
          if (roles[index] === "source") { sources.add(path); return; }
          const pair = entry.paths.length === 2;
          const isFrom = pair && index === 0;
          const version = {
            commit,
            change: pair ? (isFrom ? `${CHANGE_NAMES[entry.status]}-from` : `${CHANGE_NAMES[entry.status]}-to`) : (CHANGE_NAMES[entry.status] ?? entry.status),
            blobBefore: pair && !isFrom ? ABSENT : side(entry.blobBefore),
            blobAfter: isFrom && entry.status === "R" ? ABSENT : side(entry.blobAfter),
            modeBefore: pair && !isFrom ? ABSENT : (ZERO_ID.test(entry.modeBefore) ? ABSENT : entry.modeBefore),
            modeAfter: isFrom && entry.status === "R" ? ABSENT : (ZERO_ID.test(entry.modeAfter) ? ABSENT : entry.modeAfter),
          };
          version.sha256After = sha256OfBlob(repoRoot, version.blobAfter);
          const known = excluded.get(path) ?? { path, role: roles[index], versions: [] };
          known.versions.push(version);
          excluded.set(path, known);
        });
      }
    }
    const document = {
      schema: CRITIC_CORRECTION_INPUT_BINDINGS_SCHEMA,
      base: { commit: baseCommit, tree: treeOf(baseCommit) },
      head: { commit: headCommit, tree: treeOf(headCommit) },
      commits,
      exclusions: [...excluded.values()].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0)),
      sourcePaths: [...sources].sort(),
    };
    return { ...document, digestSha256: sha256Canonical(document) };
  } catch (error) {
    if (error instanceof CriticCorrectionInputBindingsError) throw error;
    throw new CriticCorrectionInputBindingsError("CCI-UNEXPECTED", "unexpected failure while deriving the bindings");
  }
}

export function bindingsRoleCounts(document) {
  const counts = { [ROLE_RETAINED_PRIOR_RESULT]: 0, [ROLE_PROJECT_STATE_RECORD]: 0, [ROLE_FINDING_DISPOSITION_RECORD]: 0, source: document.sourcePaths.length };
  for (const entry of document.exclusions) counts[entry.role] += 1;
  return counts;
}
