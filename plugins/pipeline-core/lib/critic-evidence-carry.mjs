// SPDX-License-Identifier: SUL-1.0
/**
 * Does the Critic evidence of a reviewed commit R stay valid for a candidate commit C? (candidate 19, PO decision 2026-11-04 on open
 * question 2 of docs/adr/draft-authority-carry-forward-and-signed-reconcile-commit.md.)
 *
 * Yes exactly when R is an ancestor of C, the range R..C is not empty, and EVERY path changed between R and C lies in the closed set of
 * lib/administration-documentation-paths.mjs, as a regular, non-executable file (a symbolic link or an executable file named like a
 * document is content). One content path anywhere in the range answers no, also when later commits are administration only. Any fault
 * (unreadable repository, unknown commit, too large a range) answers no: this function fails closed and never throws.
 *
 * The decision is pure repository state: it consults no registration, no private store and no clock. The callers that bind a Critic
 * receipt to it are lib/critic-verify-lifecycle.mjs (record and read of the lifecycle receipt, which the close gate and the push gate
 * both read), lib/critic-course-admission.mjs (the registration delta course) and the readbacks of scripts/push-prepare.mjs.
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { GIT_NULL_DEVICE } from "./git-null-device.mjs";
import { CALIBRATION_PATHS } from "./project-authority-read.mjs";
import { administrationDocumentationClassOf } from "./administration-documentation-paths.mjs";
import { promoteRepositoryModeBytes } from "../scripts/repository-mode-promote.mjs";

const OID = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u;
const MAX_RANGE_COMMITS = 512;
const REGULAR = new Set(["000000", "100644"]);
export const CRITIC_EVIDENCE_CARRY_SCHEMA = "pipeline.critic-evidence-carry-decision.v1";

function git(root, args) {
  const result = spawnSync("git", ["-C", root, ...args], { shell: false, encoding: "utf8", timeout: 10000, maxBuffer: 8 * 1024 * 1024,
    env: { PATH: process.env.PATH ?? "", LANG: "C", LC_ALL: "C", GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_SYSTEM: GIT_NULL_DEVICE,
      GIT_CONFIG_GLOBAL: GIT_NULL_DEVICE, GIT_CONFIG_COUNT: "0", GIT_TERMINAL_PROMPT: "0" } });
  return { status: result.error || result.signal ? null : result.status, stdout: result.stdout ?? "" };
}

function answer(fields) {
  return Object.freeze({ schema: CRITIC_EVIDENCE_CARRY_SCHEMA, carried: false, code: "CEC-UNREADABLE", reviewedCommit: null, candidateCommit: null,
    candidateTree: null, passedOverCommits: Object.freeze([]), changedPaths: Object.freeze([]), offendingPaths: Object.freeze([]), ...fields });
}

/** The changed entries between two commits, or null when unreadable. Each entry: { status, oldMode, newMode, path }. */
function changedEntries(root, from, to) {
  const diff = git(root, ["diff", "--raw", "-z", "--no-renames", "--no-abbrev", from, to, "--"]);
  if (diff.status !== 0) return null;
  const fields = diff.stdout.split("\0").filter(Boolean);
  if (fields.length % 2 !== 0) return null;
  const entries = [];
  for (let index = 0; index < fields.length; index += 2) {
    const meta = /^:(\d{6}) (\d{6}) [0-9a-f]+ [0-9a-f]+ ([A-Z])$/u.exec(fields[index]);
    if (!meta) return null;
    entries.push({ oldMode: meta[1], newMode: meta[2], status: meta[3], path: fields[index + 1] });
  }
  return entries;
}

const CALIBRATION_TWINS = new Set(CALIBRATION_PATHS);
const GIT_ENV = { PATH: process.env.PATH ?? "", LANG: "C", LC_ALL: "C", GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_SYSTEM: GIT_NULL_DEVICE,
  GIT_CONFIG_GLOBAL: GIT_NULL_DEVICE, GIT_CONFIG_COUNT: "0", GIT_TERMINAL_PROMPT: "0" };

function blobBytes(root, commit, path) {
  const result = spawnSync("git", ["-C", root, "cat-file", "blob", `${commit}:${path}`], { shell: false, encoding: "buffer", timeout: 10000, maxBuffer: 2 * 1024 * 1024, env: GIT_ENV });
  return !result.error && !result.signal && result.status === 0 ? result.stdout : null;
}

/**
 * C28-ONBOARDING-QUESTIONS (AC-108, PO decision 2026-11-10). The calibration twins are content, so the one commit that moved `repositoryMode` from local-only
 * to remote-tracked ended the Critic carry and the first push could not continue in the same feature. This admits exactly that change and nothing else: the
 * twin is modified (regular file both sides) and the reviewed bytes run through repository-mode-promote.mjs's own rule equal the candidate bytes. Any other byte
 * of the calibration, the other direction, another path or a mode change is still content. Unreadable blobs answer no.
 */
function isRepositoryModePromotion(entry, ctx) {
  if (ctx === null || entry.status !== "M" || entry.oldMode !== "100644" || entry.newMode !== "100644" || !CALIBRATION_TWINS.has(entry.path)) return false;
  const before = blobBytes(ctx.root, ctx.from, entry.path);
  const after = blobBytes(ctx.root, ctx.to, entry.path);
  if (before === null || after === null) return false;
  const promoted = promoteRepositoryModeBytes(before);
  return promoted.ok === true && Buffer.compare(promoted.bytes, after) === 0;
}

/**
 * Candidate 29 (AGY run 3 R1 and the Codex run of 2026-11-13, PO tile "admit the push-preparation paths"). Two more push-preparation changes land
 * after the feature close and ended the carry although the Critic has nothing to review in them:
 *   - the push threat model `project/push-threat-model.md` (push-threat-model-gate.mjs), created or answered when push-init asks for it: a
 *     project document about the signing ceremony, never product behaviour. Admitted when added or modified as a regular file that still
 *     reads as a model (a Markdown heading, at most 1 MiB); a deletion stays content.
 *   - an APPEND to the root `.gitleaksignore` of content-v1 entries that each name a path of the feature evidence or the audit bundle of the
 *     feature in this carry (the close's own security scan flags a public identifier the generated evidence copies; the sanctioned
 *     gitleaks-repair-ignore.mjs --approve-new appends exactly such a line). Every earlier byte stays as it was; an entry for any other path
 *     (source, configuration, a document), a legacy or malformed line, a comment, a removed or rewritten entry is content.
 */
export const PUSH_THREAT_MODEL_PATH = "project/push-threat-model.md";
export const GITLEAKS_IGNORE_PATH = ".gitleaksignore";
const MAX_PUSH_THREAT_MODEL_BYTES = 1024 * 1024;
const CONTENT_V1 = /^content-v1:[a-f0-9]{64}:(.+):[a-zA-Z0-9][a-zA-Z0-9._-]*:[1-9][0-9]*:[1-9][0-9]*$/u;
// The feature evidence and the audit bundle, as paths; the class check below still applies the vetoes and the feature list (a record-only
// evidence path is named by the record-only class first, so the class id alone cannot select these two).
const EVIDENCE_IGNORE_PATH = /^(?:specs\/[^/]+\/evidence|audit-bundles\/[^/]+)\/.+$/u;

function isPushThreatModelChange(entry, ctx) {
  if (ctx === null || entry.path !== PUSH_THREAT_MODEL_PATH || !["A", "M"].includes(entry.status) || entry.newMode !== "100644"
    || !REGULAR.has(entry.oldMode)) return false;
  const after = blobBytes(ctx.root, ctx.to, entry.path);
  if (after === null || after.length === 0 || after.length > MAX_PUSH_THREAT_MODEL_BYTES) return false;
  const text = after.toString("utf8");
  return Buffer.from(text, "utf8").equals(after) && /^#{1,6}[ \t]+\S/mu.test(text);
}

function isEvidenceIgnoreAppend(entry, ctx, featureIds) {
  if (ctx === null || entry.path !== GITLEAKS_IGNORE_PATH || !["A", "M"].includes(entry.status) || entry.newMode !== "100644"
    || !REGULAR.has(entry.oldMode)) return false;
  const before = entry.status === "A" ? Buffer.alloc(0) : blobBytes(ctx.root, ctx.from, entry.path);
  const after = blobBytes(ctx.root, ctx.to, entry.path);
  if (before === null || after === null || after.length <= before.length) return false;
  const prior = before.toString("utf8");
  const next = after.toString("utf8");
  if (!Buffer.from(prior, "utf8").equals(before) || !Buffer.from(next, "utf8").equals(after)) return false;
  const prefix = prior === "" || prior.endsWith("\n") ? prior : `${prior}\n`;
  if (!next.startsWith(prefix) || !next.endsWith("\n")) return false;
  const added = next.slice(prefix.length, -1).split("\n");
  return added.length > 0 && added.every((line) => {
    const path = CONTENT_V1.exec(line)?.[1];
    return path !== undefined && EVIDENCE_IGNORE_PATH.test(path) && administrationDocumentationClassOf(path, { featureIds }) !== null;
  });
}

function offending(entries, featureIds, ctx = null) {
  return entries.filter((entry) => !["A", "M", "D"].includes(entry.status) || !REGULAR.has(entry.oldMode) || !REGULAR.has(entry.newMode)
    || (administrationDocumentationClassOf(entry.path, { featureIds }) === null && !isRepositoryModePromotion(entry, ctx)
      && !isPushThreatModelChange(entry, ctx) && !isEvidenceIgnoreAppend(entry, ctx, featureIds))).map((entry) => entry.path);
}

/**
 * @param {{repoRoot: string, reviewedCommit: string, candidateCommit: string, featureIds?: string[]|null}} input
 * `featureIds` restricts the feature-bound classes to those features (null: any feature).
 */
export function decideCriticEvidenceCarry({ repoRoot, reviewedCommit, candidateCommit, featureIds = null } = {}) {
  try {
    if (typeof repoRoot !== "string" || repoRoot === "" || !OID.test(reviewedCommit ?? "") || !OID.test(candidateCommit ?? "")
      || !(featureIds === null || (Array.isArray(featureIds) && featureIds.every((id) => typeof id === "string")))) return answer({ code: "CEC-INPUT" });
    const base = { reviewedCommit, candidateCommit };
    for (const commit of [reviewedCommit, candidateCommit]) {
      if (git(repoRoot, ["rev-parse", "--verify", "--quiet", `${commit}^{commit}`]).status !== 0) return answer({ ...base, code: "CEC-UNREADABLE" });
    }
    if (reviewedCommit === candidateCommit) return answer({ ...base, code: "CEC-EMPTY-RANGE" });
    const ancestry = git(repoRoot, ["merge-base", "--is-ancestor", reviewedCommit, candidateCommit]).status;
    if (ancestry === 1) return answer({ ...base, code: "CEC-NOT-ANCESTOR" });
    if (ancestry !== 0) return answer({ ...base, code: "CEC-UNREADABLE" });
    const listed = git(repoRoot, ["rev-list", "--reverse", `${reviewedCommit}..${candidateCommit}`]);
    const commits = listed.stdout.split("\n").filter(Boolean);
    if (listed.status !== 0 || commits.some((commit) => !OID.test(commit))) return answer({ ...base, code: "CEC-UNREADABLE" });
    if (commits.length === 0) return answer({ ...base, code: "CEC-EMPTY-RANGE" });
    if (commits.length > MAX_RANGE_COMMITS) return answer({ ...base, code: "CEC-RANGE-TOO-LARGE" });
    const entries = changedEntries(repoRoot, reviewedCommit, candidateCommit);
    const tree = git(repoRoot, ["rev-parse", `${candidateCommit}^{tree}`]);
    if (entries === null || tree.status !== 0 || !OID.test(tree.stdout.trim())) return answer({ ...base, code: "CEC-UNREADABLE" });
    const changedPaths = entries.map((entry) => entry.path);
    const bad = offending(entries, featureIds, { root: repoRoot, from: reviewedCommit, to: candidateCommit });
    if (bad.length > 0) return answer({ ...base, code: "CEC-CONTENT-CHANGED", changedPaths: Object.freeze(changedPaths), offendingPaths: Object.freeze(bad) });
    return answer({ ...base, carried: true, code: "CEC-CARRIED", candidateTree: tree.stdout.trim(),
      passedOverCommits: Object.freeze(commits), changedPaths: Object.freeze(changedPaths) });
  } catch { return answer({ code: "CEC-UNREADABLE" }); }
}

/**
 * The per-commit test of the registration delta course: `commit` has exactly one parent, changes at least one path, every change is an
 * administration or documentation path (regular files only), and the commit does not touch a feature package manifest
 * (lifecycle.json): a manifest change is classified by the registration tests of the course, never as plain administration here.
 */
export function administrationDocumentationOnlyCommit(repoRoot, commit, { featureIds = null } = {}) {
  try {
    if (typeof repoRoot !== "string" || repoRoot === "" || !OID.test(commit ?? "")) return false;
    const parents = git(repoRoot, ["rev-list", "--parents", "-n", "1", commit]);
    const ids = parents.stdout.trim().split(/\s+/u);
    if (parents.status !== 0 || ids.length !== 2 || ids[0] !== commit) return false;
    const entries = changedEntries(repoRoot, ids[1], commit);
    if (entries === null || entries.length === 0) return false;
    return entries.every((entry) => !entry.path.endsWith("/lifecycle.json")) && offending(entries, featureIds, { root: repoRoot, from: ids[1], to: commit }).length === 0;
  } catch { return false; }
}

/**
 * The carry readback of a private lifecycle receipt, or null (no receipt, not a carry receipt, unreadable). Read-only; the receipt itself
 * was verified by readCriticVerifyLifecycle before the caller got here.
 */
export function readCarriedForwardReadback(gitCommonDir, receiptId) {
  try {
    if (typeof gitCommonDir !== "string" || !/^[a-f0-9]{64}$/u.test(receiptId ?? "")) return null;
    const receipt = JSON.parse(readFileSync(join(gitCommonDir, "agent-pipeline", "critic-verify-lifecycle", `${receiptId}.json`), "utf8"));
    const proof = receipt?.carryForward?.proof;
    if (!proof || !OID.test(proof.reviewedCandidate?.commit ?? "") || !Array.isArray(proof.evidenceOnlyCommits)) return null;
    return { reviewedCommit: proof.reviewedCandidate.commit, passedOverCommits: [...proof.evidenceOnlyCommits], route: proof.route ?? "registered-evidence-only" };
  } catch { return null; }
}

const short = (commit) => String(commit).slice(0, 8);

/** One line for a readback: the original reviewed commit and the passed-over commits. Accepts a decision or a carry proof. */
export function describeCriticCarry(carry) {
  const reviewed = carry?.reviewedCommit ?? carry?.reviewedCandidate?.commit;
  const passed = carry?.passedOverCommits ?? carry?.evidenceOnlyCommits ?? [];
  return `Critic evidence of ${short(reviewed)} carried across administration and documentation only commits; passed over ${passed.map(short).join(", ")}`;
}
