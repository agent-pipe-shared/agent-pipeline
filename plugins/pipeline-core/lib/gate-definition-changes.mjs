// SPDX-License-Identifier: SUL-1.0
/**
 * ADR-0096 (D248, Claude test run 3 finding L4): every change of a gate-definition file in a feature's range, with the proof that
 * admitted it, derived at the close from durable evidence first.
 *
 * The gate-definition set is a subset of the gate-strength table (hooks/guard-gate-strength.mjs): the files that decide how strong a
 * gate is. Plugin source (GS-8/GS-9) and onboarding staging (GS-15) have their own routes and are not part of it.
 *
 * The walk covers the first-parent history of the feature range (lib/close-commit-split.mjs `featureRangeBase`), each commit against
 * its first parent, so a merge counts with what it brings in. A change of `pipeline.user.yaml` (GS-1) that touches only fields the
 * write guard exempts (GATE_STRENGTH_FIELD_EXEMPTIONS) is not a gate change.
 *
 * Proofs, in this order, the first that holds wins:
 *   first-appearance        no ancestor of the commit names the path (the commit adds it); free by PO decision
 *   trust-anchor-bootstrap  GS-2 only: the exact no-anchor -> one-anchor upgrade the pre-commit hook admits
 *   materialization         GS-17 only: the committed architecture/design-materialization.json of that commit names the blob
 *   configure-verify        GS-10/GS-11 only: this device's ready configure-verify transition record for that parent and those bytes;
 *                           labelled "confirmed via runner prompt, not signed" (PO tile)
 *   human-guard-override    a consumed override capability of this device for the path, authenticated by its MAC, armed at the
 *                           parent or at an ancestor with no change of the path in between
 *   po-acknowledgement      the PO's acknowledgement of the range (kind acknowledge-gate-definition-changes), naming this exact
 *                           commit, path and blob; labelled "acknowledged after the fact"
 * A change with none of them is unproven: the close refuses it (CLOSE-GATE-CHANGE-UNPROVEN) and names the acknowledgement as the
 * repair. Device-local records (configure-verify, override) are not found on another machine; the acknowledgement covers that too.
 *
 * Read-only. Never writes, never consumes, never reads a private key.
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { resolveAuthorityArtifactPath } from "./project-authority-read.mjs";
import { join } from "node:path";
import { GATE_STRENGTH_FIELD_EXEMPTIONS, GATE_STRENGTH_PATHS, changedGateStrengthDottedPaths } from "../hooks/guard-gate-strength.mjs";
import { featureRangeBase } from "./close-commit-split.mjs";
import { GATE_CHANGE_ACKNOWLEDGEMENT_KIND } from "./critical-action-approval-request.mjs";
import { readPrivateApprovals } from "./critical-action-authorization.mjs";
import { readConsumedOverrideCapabilities } from "./human-guard-override.mjs";
import { parseYaml } from "./yaml-lite.mjs";

export const GATE_DEFINITION_CHANGES_SCHEMA = "pipeline.gate-definition-changes.v1";
export { GATE_CHANGE_ACKNOWLEDGEMENT_KIND };
export const GATE_DEFINITION_IDS = Object.freeze(["GS-1", "GS-2", "GS-3", "GS-4", "GS-5", "GS-7", "GS-10", "GS-11", "GS-12", "GS-13", "GS-14", "GS-16", "GS-17"]);
export const CONFIGURE_VERIFY_LABEL = "confirmed via runner prompt, not signed";
export const ACKNOWLEDGEMENT_LABEL = "acknowledged after the fact";
const MAX_CHANGES = 4096;
const OID = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u;
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
// Built on first use: hooks/guard-gate-strength.mjs reaches this module back through an import cycle, so its table may not be
// initialised while this module evaluates.
let rules = null;
const gateDefinitionRules = () => (rules ??= GATE_STRENGTH_PATHS.filter((rule) => GATE_DEFINITION_IDS.includes(rule.id) && !rule.path.endsWith("/*")));

/** The gate-definition rule of a repository-relative path, or null (same case-insensitive match as the write guard). */
export function gateDefinitionRuleFor(path) {
  if (typeof path !== "string" || path === "") return null;
  const normalized = path.toLowerCase();
  return gateDefinitionRules().find((rule) => rule.path.toLowerCase() === normalized) ?? null;
}

function gitRunner(rootDir) {
  return (args, { buffer = false } = {}) => spawnSync("git", ["-C", rootDir, "-c", "core.quotepath=off", ...args],
    { encoding: buffer ? "buffer" : "utf8", timeout: 30000, maxBuffer: 64 * 1024 * 1024 });
}
const ok = (result) => result?.status === 0;
const blobAt = (git, commit, path) => { const shown = git(["cat-file", "blob", `${commit}:${path}`], { buffer: true }); return ok(shown) && Buffer.isBuffer(shown.stdout) ? shown.stdout : null; };

function onlyExemptFields(git, rule, parent, commit, path) {
  const exempt = GATE_STRENGTH_FIELD_EXEMPTIONS[rule.path] ?? [];
  if (exempt.length === 0 || parent === null) return false;
  const before = blobAt(git, parent, path); const after = blobAt(git, commit, path);
  if (before === null || after === null) return false;
  let left; let right;
  try { left = parseYaml(before.toString("utf8")); right = parseYaml(after.toString("utf8")); } catch { return false; }
  if (!object(left) || !object(right)) return false;
  const changed = changedGateStrengthDottedPaths(left, right);
  return changed.length > 0 && changed.every((field) => exempt.includes(field));
}

/**
 * Every gate-definition change of the feature range. `{ status: "listed", base, head, changes: [{ commit, parent, path, change, blobSha256,
 * ruleId }] }` or `{ status: "unavailable", reason }`. `change` is A, M or D; a deleted file has `blobSha256: null`.
 */
export function listGateDefinitionChanges({ rootDir, featureId, head = "HEAD", runGit = null, specDirectory = null } = {}) {
  const git = runGit ?? gitRunner(rootDir);
  let range = featureRangeBase({ rootDir, featureId, head, runGit: (args) => git(args) });
  // K-25/K-30 consumers keep an approved Spec in a dated folder (specs/<date>-<slug>/): the range then starts at the first commit of
  // that folder, the same first-parent rule applied to the directory the approved Spec lives in.
  if (range.status !== "found" && typeof specDirectory === "string" && /^specs\/[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(specDirectory)) {
    const first = git(["log", "--first-parent", "--reverse", "--format=%H", head, "--", specDirectory]);
    const oid = ok(first) ? String(first.stdout).split("\n").map((line) => line.trim()).find((line) => OID.test(line)) : undefined;
    if (oid !== undefined) {
      const parent = git(["rev-parse", "--verify", "--quiet", `${oid}^`]);
      range = { status: "found", first: oid, base: ok(parent) && OID.test(String(parent.stdout).trim()) ? String(parent.stdout).trim() : null };
    }
  }
  if (range.status !== "found") return Object.freeze({ status: "unavailable", reason: range.reason });
  const headCommit = git(["rev-parse", "--verify", "--quiet", `${head}^{commit}`]);
  if (!ok(headCommit) || !OID.test(String(headCommit.stdout).trim())) return Object.freeze({ status: "unavailable", reason: "HEAD could not be read" });
  const listing = git(["log", "--first-parent", "-m", "--no-renames", "--name-status", "--format=%x00%H %P", range.base === null ? head : `${range.base}..${head}`]);
  if (!ok(listing)) return Object.freeze({ status: "unavailable", reason: "git log could not read the range" });
  const changes = [];
  for (const chunk of String(listing.stdout).split("\0")) {
    const [header, ...lines] = chunk.split("\n");
    const [commit, firstParent] = (header ?? "").trim().split(" ");
    if (!OID.test(commit ?? "")) continue;
    const parent = OID.test(firstParent ?? "") ? firstParent : null;
    for (const line of lines) {
      const match = /^([AMD])\t(.+)$/u.exec(line);
      if (!match) continue;
      const rule = gateDefinitionRuleFor(match[2]);
      if (rule === null) continue;
      const [, change, path] = match;
      if (change === "M" && onlyExemptFields(git, rule, parent, commit, path)) continue;
      const blob = change === "D" ? null : blobAt(git, commit, path);
      if (change !== "D" && blob === null) return Object.freeze({ status: "unavailable", reason: `the bytes of ${path} at ${commit.slice(0, 12)} could not be read` });
      changes.push(Object.freeze({ commit, parent, path, change, blobSha256: blob === null ? null : sha256(blob), ruleId: rule.id }));
      if (changes.length > MAX_CHANGES) return Object.freeze({ status: "unavailable", reason: `more than ${MAX_CHANGES} gate-definition changes in the range` });
    }
  }
  changes.reverse(); // oldest first
  return Object.freeze({ status: "listed", base: range.base, head: String(headCommit.stdout).trim(), changes });
}

/** The `specs/<folder>` directory of an approved Spec path (the range fallback for a dated Spec folder), or null. */
export function specDirectoryOf(specPath) {
  const match = typeof specPath === "string" ? /^(specs\/[A-Za-z0-9][A-Za-z0-9._-]{0,127})\/[^/]+$/u.exec(specPath) : null;
  return match ? match[1] : null;
}

/**
 * The Spec directory of the active feature from the project's pipeline state (approved Spec path first, then the continuity
 * authority's), or null. The close, the recording step and the signing terminal all fall back to it, so they read the same range.
 */
export function specDirectoryFromState(root) {
  try {
    const state = JSON.parse(readFileSync(resolveAuthorityArtifactPath("state", { rootDir: root }).path, "utf8"));
    return specDirectoryOf(state?.planApproval?.poGateAuthority?.specPath ?? state?.continuity?.authority?.spec?.path);
  } catch { return null; }
}

/** The acknowledgement's sorted change list and its digest; the one canonical form the subject, the record and the walk compare. */
export function gateChangeListDigest(changes) {
  const list = changes.map(({ commit, path, change, blobSha256 }) => ({ commit, path, change, blobSha256 }))
    .sort((a, b) => (a.commit + a.path).localeCompare(b.commit + b.path));
  return { list, sha256: sha256(Buffer.from(JSON.stringify(list), "utf8")) };
}

function readConfigureVerifyReady(commonDir) {
  const directory = join(commonDir, "agent-pipeline", "calibration-verify-commit");
  let names = [];
  try { names = readdirSync(directory).filter((name) => /^[a-f0-9]{64}\.ready\.json$/u.test(name)).sort().slice(0, 1024); } catch { return []; }
  const records = [];
  for (const name of names) {
    let value; try { value = JSON.parse(readFileSync(join(directory, name), "utf8")); } catch { continue; }
    if (value?.schema !== "pipeline.calibration-verify-commit-transition.v1" || value.phase !== "ready" || !object(value.facts) || !Array.isArray(value.facts.entries)) continue;
    records.push({ id: name.slice(0, 64), head: value.facts.head, entries: value.facts.entries });
  }
  return records;
}

function trustAnchorShape(bytes) {
  let parsed; try { parsed = JSON.parse(bytes.toString("utf8")); } catch { return null; }
  if (!object(parsed) || !["pipeline.critical-human-proof-policy.v1", "pipeline.critical-human-proof-policy.v2", "pipeline.critical-human-proof-policy.v3"].includes(parsed.schema)) return null;
  if (!Array.isArray(parsed.requiredKinds)) return null;
  const anchors = parsed.schema.endsWith(".v3") ? (Array.isArray(parsed.trustAnchors) ? parsed.trustAnchors.length : 0) : (object(parsed.trustAnchor) ? 1 : 0);
  const waived = Array.isArray(parsed.waivedKinds) ? parsed.waivedKinds.map((entry) => JSON.stringify([entry?.kind, entry?.reason])).sort() : [];
  return { v3: parsed.schema.endsWith(".v3"), anchors, required: [...parsed.requiredKinds].sort().join("\0"), waived: waived.join("\0") };
}

function isTrustAnchorBootstrap(git, change) {
  if (change.ruleId !== "GS-2" || change.change !== "M" || change.parent === null) return false;
  const before = blobAt(git, change.parent, change.path); const after = blobAt(git, change.commit, change.path);
  if (before === null || after === null) return false;
  const left = trustAnchorShape(before); const right = trustAnchorShape(after);
  return left !== null && right !== null && left.anchors === 0 && right.v3 && right.anchors === 1 && left.required === right.required && left.waived === right.waived;
}

const isAncestor = (git, older, newer) => older === newer || ok(git(["merge-base", "--is-ancestor", older, newer]));

/**
 * The proof of one change, or null. `context`: { git, overrides, configureVerify, acknowledgements } (see `gateDefinitionChangeReadback`).
 */
export function deriveGateChangeProof(change, context) {
  const { git } = context;
  if (change.change === "A") {
    const earlier = change.parent === null ? { status: 0, stdout: "" } : git(["log", "-1", "--format=%H", change.parent, "--", change.path]);
    if (ok(earlier) && String(earlier.stdout).trim() === "") return { kind: "first-appearance", ref: null, label: null };
  }
  if (isTrustAnchorBootstrap(git, change)) return { kind: "trust-anchor-bootstrap", ref: null, label: null };
  if (change.ruleId === "GS-17" && change.blobSha256 !== null) {
    const receipt = blobAt(git, change.commit, "architecture/design-materialization.json");
    let value = null; try { value = receipt === null ? null : JSON.parse(receipt.toString("utf8")); } catch { value = null; }
    if (object(value) && Array.isArray(value.targets) && value.targets.some((target) => target?.path === change.path && target?.sha256 === change.blobSha256)) {
      return { kind: "materialization", ref: typeof value.designSha256 === "string" ? value.designSha256 : null, label: null };
    }
  }
  if ((change.ruleId === "GS-10" || change.ruleId === "GS-11") && change.blobSha256 !== null) {
    const record = context.configureVerify.find((entry) => entry.head === change.parent && entry.entries.some((item) => item?.path === change.path && item?.afterSha256 === change.blobSha256));
    if (record) return { kind: "configure-verify", ref: record.id, label: CONFIGURE_VERIFY_LABEL };
  }
  const lower = change.path.toLowerCase();
  for (const capability of context.overrides) {
    if (!capability.eligiblePaths.some((path) => String(path).replace(/\\/gu, "/").toLowerCase() === lower) || !OID.test(capability.head ?? "") || change.parent === null) continue;
    if (!isAncestor(git, capability.head, change.parent)) continue;
    // One override admits one change: no change of the path between the override's HEAD and this commit's parent.
    const between = capability.head === change.parent ? { status: 0, stdout: "" } : git(["log", "-1", "--format=%H", `${capability.head}..${change.parent}`, "--", change.path]);
    if (!ok(between) || String(between.stdout).trim() !== "") continue;
    return { kind: "human-guard-override", ref: capability.planSha256, label: capability.mode === "signature-verified" ? null : "chat-attributed, not signed" };
  }
  for (const approval of context.acknowledgements) {
    if (approval.changes.some((entry) => entry.commit === change.commit && entry.path === change.path && entry.blobSha256 === change.blobSha256 && entry.change === change.change)) {
      return { kind: "po-acknowledgement", ref: approval.ref, label: ACKNOWLEDGEMENT_LABEL };
    }
  }
  return null;
}

function readAcknowledgements(commonDir, featureId) {
  if (typeof commonDir !== "string" || commonDir === "") return [];
  let envelopes = [];
  try { envelopes = readPrivateApprovals(commonDir, GATE_CHANGE_ACKNOWLEDGEMENT_KIND); } catch { envelopes = []; }
  const found = [];
  for (const envelope of envelopes) {
    const approval = envelope?.approval;
    if (!object(approval) || approval.featureId !== featureId || !Array.isArray(approval.changes)) continue;
    if (gateChangeListDigest(approval.changes).sha256 !== approval.changesSha256) continue;
    found.push({ changes: approval.changes, ref: approval.criticalProof?.proofSha256 ?? `${approval.approvedBy}@${approval.approvedAt}`, mode: object(approval.criticalProof) ? "signature" : "chat-attributed-unattested" });
  }
  return found;
}

/**
 * The readback the close, inspect, the bundle and the Critic input share. `{ schema, status: "proven"|"unproven"|"unavailable", base,
 * head, changes: [{ ...change, proof }], unproven: [change] }`. `excludeAcknowledgements` builds the list an acknowledgement must name.
 */
export function gateDefinitionChangeReadback({ rootDir, featureId, commonDir, head = "HEAD", runGit = null, excludeAcknowledgements = false, specDirectory = null,
  readOverrides = readConsumedOverrideCapabilities, readConfigureVerify = readConfigureVerifyReady, readAcks = readAcknowledgements } = {}) {
  const git = runGit ?? gitRunner(rootDir);
  const listed = listGateDefinitionChanges({ rootDir, featureId, head, runGit: git, specDirectory });
  if (listed.status !== "listed") return Object.freeze({ schema: GATE_DEFINITION_CHANGES_SCHEMA, status: "unavailable", reason: listed.reason, changes: [], unproven: [] });
  const context = { git, overrides: listed.changes.length === 0 ? [] : readOverrides({ commonDir }),
    configureVerify: listed.changes.length === 0 ? [] : readConfigureVerify(commonDir),
    acknowledgements: excludeAcknowledgements || listed.changes.length === 0 ? [] : readAcks(commonDir, featureId) };
  const changes = listed.changes.map((change) => Object.freeze({ ...change, proof: deriveGateChangeProof(change, context) }));
  const unproven = changes.filter((change) => change.proof === null);
  return Object.freeze({ schema: GATE_DEFINITION_CHANGES_SCHEMA, status: unproven.length === 0 ? "proven" : "unproven", base: listed.base, head: listed.head, changes, unproven });
}

/**
 * The one subject builder of the PO's acknowledgement: the recording step (`pipeline-state.mjs approve-gate-change-acknowledgement`)
 * and the signing terminal (`po-human-approval.mjs authorize-critical --kind acknowledge-gate-definition-changes`) both call it, so
 * they cannot disagree about the list. The list is every change of the range without another proof (an earlier acknowledgement is
 * ignored, so a new one names everything still needing one); the candidate is HEAD. `{ ok: true, subject, candidate }` or
 * `{ ok: false, code, detail }`.
 */
export function buildGateChangeAcknowledgementSubject({ root, featureId, commonDir, runGit = null, readOverrides, readConfigureVerify, specDirectory = null } = {}) {
  const git = runGit ?? gitRunner(root);
  const readback = gateDefinitionChangeReadback({ rootDir: root, featureId, commonDir, runGit: git, excludeAcknowledgements: true,
    specDirectory: specDirectory ?? specDirectoryFromState(root),
    ...(readOverrides ? { readOverrides } : {}), ...(readConfigureVerify ? { readConfigureVerify } : {}) });
  if (readback.status === "unavailable") return { ok: false, code: "GCA-RANGE-UNAVAILABLE", detail: `the feature range could not be read (${readback.reason})` };
  if (readback.unproven.length === 0) return { ok: false, code: "GCA-NOTHING-TO-ACKNOWLEDGE", detail: "every gate-definition change of the range already has a proof" };
  const tree = git(["rev-parse", "--verify", "--quiet", `${readback.head}^{tree}`]);
  if (!ok(tree) || !OID.test(String(tree.stdout).trim())) return { ok: false, code: "GCA-RANGE-UNAVAILABLE", detail: "the tree of HEAD could not be read" };
  const { list, sha256: changesSha256 } = gateChangeListDigest(readback.unproven);
  return { ok: true, candidate: { commit: readback.head, tree: String(tree.stdout).trim() },
    subject: { schema: "pipeline.gate-change-acknowledgement-subject.v1", featureId, rangeBase: readback.base, changesSha256, changes: list } };
}

/** The lines the signing terminal shows the PO before the signature. */
export function gateChangeAcknowledgementConfirmationLines(subject) {
  if (!object(subject) || !Array.isArray(subject.changes)) return [];
  return [
    `feature: ${subject.featureId}, range from ${subject.rangeBase === null ? "the start of history" : String(subject.rangeBase).slice(0, 12)}`,
    ...subject.changes.slice(0, 40).map((change) => `gate-definition change without a proof: ${change.path} ${change.change === "D" ? "deleted" : change.change === "A" ? "added" : "changed"} in ${change.commit.slice(0, 12)}`),
    ...(subject.changes.length > 40 ? [`and ${subject.changes.length - 40} more (changes digest ${subject.changesSha256})`] : []),
    "this acknowledgement states that you have seen exactly these changes of how strong a gate is; it is recorded as acknowledged after the fact, it does not judge whether each change is sound, and a later change needs a new acknowledgement.",
  ];
}

/** One line per change for a refusal, the inspect readback and the Critic input. */
export function describeGateDefinitionChange(change) {
  const what = `${change.ruleId} ${change.path} ${change.change === "D" ? "deleted" : change.change === "A" ? "added" : "changed"} in ${change.commit.slice(0, 12)}`;
  if (change.proof === null || change.proof === undefined) return `${what}: no proof`;
  return `${what}: ${change.proof.kind}${change.proof.ref ? ` ${String(change.proof.ref).slice(0, 16)}` : ""}${change.proof.label ? ` (${change.proof.label})` : ""}`;
}

/** The repair the close and inspect name for an unproven list: the PO's one acknowledgement of exactly that list. */
export function gateChangeAcknowledgementRepair({ stateWriter = "pipeline-state.mjs" } = {}) {
  return `the PO acknowledges the unproven gate-definition changes once for this range: run node ${stateWriter} approve-gate-change-acknowledgement --by <the label the PO gives for this command>, `
    + "which prints the PO's signing command for exactly this list (or records it at once in chat mode); history is never rewritten and a revert does not remove a change";
}
