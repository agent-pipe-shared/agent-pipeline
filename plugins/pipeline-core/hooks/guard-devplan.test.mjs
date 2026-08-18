#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * guard-devplan.test.mjs — test suite for the Dev-Plan-Gate PreToolUse guard.
 *
 * AP1-P3 "DURIN". Run: node plugins/pipeline-core/hooks/guard-devplan.test.mjs
 * Exit: 0 = all cases pass · 1 = at least one case failed (failure list on stdout).
 *
 * Hermetics: every spawn sets CLAUDE_PROJECT_DIR to a fresh temp dir so this machine's
 * real .claude/pipeline.yaml / pipeline-state.json can never leak into these cases.
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { sha256CanonicalJson } from "../lib/plan-spec-state-v2.mjs";
import { canonicalSha256, canonicalizeJson } from "../lib/governance-event.mjs";
import { appendHumanGovernanceDecision } from "../lib/human-governance-ledger.mjs";
import { derivePoGateRepositoryFingerprint } from "../lib/po-gate-authority.mjs";
import { discoverRepository } from "../lib/worktree-lifecycle.mjs";

const GUARD = fileURLToPath(new URL("./guard-devplan.mjs", import.meta.url));

const ALL_DIRS = [];
function freshDir(prefix) {
  const dir = mkdtempSync(join(tmpdir(), `guard-devplan-${prefix}-`));
  ALL_DIRS.push(dir);
  return dir;
}
function writeManifest(dir, yamlText) {
  mkdirSync(join(dir, ".claude"), { recursive: true });
  writeFileSync(join(dir, ".claude", "pipeline.yaml"), yamlText);
}
function writeState(dir, obj) {
  mkdirSync(join(dir, ".claude"), { recursive: true });
  writeFileSync(join(dir, ".claude", "pipeline-state.json"), typeof obj === "string" ? obj : JSON.stringify(obj));
}
function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}
function writeAuthorityDocs(dir) {
  mkdirSync(join(dir, "specs", "feature"), { recursive: true });
  writeFileSync(join(dir, AUTHORITY_PLAN_PATH), AUTHORITY_PLAN_BYTES);
  writeFileSync(join(dir, AUTHORITY_SPEC_PATH), AUTHORITY_SPEC_BYTES);
}

function runGuard(toolName, filePath, projectDir) {
  const res = spawnSync(process.execPath, [GUARD], {
    input: JSON.stringify({ tool_name: toolName, tool_input: { file_path: filePath, old_string: "a", new_string: "b" } }),
    encoding: "utf8",
    env: { ...process.env, CLAUDE_PROJECT_DIR: projectDir },
  });
  return { code: res.status, stderr: res.stderr ?? "" };
}

let pass = 0;
const failures = [];
function check(id, toolName, filePath, expectExit, { projectDir, stderrIncludes, stderrEmpty } = {}) {
  const { code, stderr } = runGuard(toolName, filePath, projectDir);
  const problems = [];
  if (code !== expectExit) problems.push(`exit ${code} (expected ${expectExit}) -- stderr: ${stderr.trim().slice(0, 200)}`);
  for (const needle of [].concat(stderrIncludes ?? [])) {
    if (!stderr.includes(needle)) problems.push(`stderr missing "${needle}"`);
  }
  if (stderrEmpty && stderr.trim() !== "") problems.push(`stderr not empty: ${stderr.trim().slice(0, 120)}`);
  if (problems.length === 0) {
    pass++;
    console.log(`PASS  ${id}`);
  } else {
    failures.push(`${id}: ${problems.join("; ")}`);
    console.log(`FAIL  ${id} -- ${problems.join("; ")}`);
  }
}
const BLOCK = 2,
  ALLOW = 0,
  WARN = 1;

const MANIFEST_BLOCKING = "schema: pipeline.manifest.v0\ngates:\n  dev-plan:\n    mode: blocking\n    type: human\n";
const MANIFEST_WARN = "schema: pipeline.manifest.v0\ngates:\n  dev-plan:\n    mode: warn\n    type: human\n";
const MANIFEST_OFF = "schema: pipeline.manifest.v0\ngates:\n  dev-plan:\n    mode: off\n    type: human\n";
const MANIFEST_NO_GATE = "schema: pipeline.manifest.v0\ngates:\n  push:\n    mode: blocking\n    type: human\n";
const MANIFEST_CUSTOM_EXEMPT =
  "schema: pipeline.manifest.v0\ngates:\n  dev-plan:\n    mode: blocking\n    type: human\n    exemptPaths:\n      - custom/\n";
const MANIFEST_SYNTAX_BROKEN = "schema: pipeline.manifest.v0\ngates:\n  dev-plan: &anchor\n    mode: blocking\n";

const PLAN_PATH = ".claude/plans/2026-07-07-ap1-pipeline-tuning.md";
const AUTHORITY_PLAN_PATH = "specs/feature/prd.md";
const AUTHORITY_SPEC_PATH = "specs/feature/spec.md";
const AUTHORITY_PLAN_BYTES = "# PRD\n";
const AUTHORITY_SPEC_BYTES = "# Spec\n";
const PLAN_SUBMISSION = {
  schema: "pipeline.plan-submission.v1",
  featureId: "authority-feature",
  planPath: AUTHORITY_PLAN_PATH,
  planSha256: sha256(AUTHORITY_PLAN_BYTES),
  specPath: AUTHORITY_SPEC_PATH,
  specSha256: sha256(AUTHORITY_SPEC_BYTES),
  profile: "feature",
  profileSha256: "3".repeat(64),
  submittedBy: "Coordinator",
  submittedAt: "2026-07-31T14:00:00.000Z",
};
const AWAITING_AUTHORITY_STATE = {
  schema: "pipeline.state.v0",
  activeFeature: { id: "authority-feature", planPath: AUTHORITY_PLAN_PATH, phase: "design" },
  planApproved: false,
  planSubmission: PLAN_SUBMISSION,
};
const DRAFT_AUTHORITY_STATE = {
  ...AWAITING_AUTHORITY_STATE,
  planInvalidation: {
    schema: "pipeline.plan-invalidation.v1",
    featureId: "authority-feature",
    invalidatedSubmissionSha256: sha256CanonicalJson(PLAN_SUBMISSION),
    invalidatedApprovalSha256: null,
    invalidatedBy: "PO",
    invalidatedAt: "2026-07-31T14:05:00.000Z",
    reason: "reopen-design",
  },
};
// NOTE: no top-level `phase` field here -- `phase` lives
// EXCLUSIVELY inside `activeFeature.phase` (via pipeline-state.mjs `set-phase`); a
// top-level `phase` key was a legacy leftover this hook has never read and would have
// silently masked a schema drift.
const UNAPPROVED_STATE = {
  schema: "pipeline.state.v0",
  activeFeature: { id: "ap1-pipeline-tuning", planPath: PLAN_PATH, phase: "design" },
  planApproved: false,
};
const APPROVED_STATE = {
  ...UNAPPROVED_STATE,
  planApproved: true,
  planApproval: {
    approvedBy: "PO",
    approvedAt: "2026-07-30T20:00:00.000Z",
  },
};
const NO_FEATURE_STATE = { schema: "pipeline.state.v0" };

// ---- DP01 no manifest at all -> allow --------------------------------------------------
{
  const dir = freshDir("no-manifest");
  check("DP01 allow  no manifest at all", "Edit", "src/foo.ts", ALLOW, { projectDir: dir, stderrEmpty: true });
}

// ---- DP02 manifest present, gate "dev-plan" absent -> allow -----------------------------
{
  const dir = freshDir("no-gate");
  writeManifest(dir, MANIFEST_NO_GATE);
  check("DP02 allow  manifest present but gate dev-plan absent", "Edit", "src/foo.ts", ALLOW, { projectDir: dir, stderrEmpty: true });
}

// ---- DP03 gate mode off -> allow --------------------------------------------------------
{
  const dir = freshDir("mode-off");
  writeManifest(dir, MANIFEST_OFF);
  writeState(dir, UNAPPROVED_STATE);
  check("DP03 allow  gate mode off", "Edit", "src/foo.ts", ALLOW, { projectDir: dir, stderrEmpty: true });
}

// ---- DP04 gate blocking, no state file -> allow -----------------------------------------
{
  const dir = freshDir("no-state");
  writeManifest(dir, MANIFEST_BLOCKING);
  check("DP04 allow  no state file at all", "Edit", "src/foo.ts", ALLOW, { projectDir: dir, stderrEmpty: true });
}

// ---- DP05 gate blocking, state present but no activeFeature -> allow --------------------
{
  const dir = freshDir("no-feature");
  writeManifest(dir, MANIFEST_BLOCKING);
  writeState(dir, NO_FEATURE_STATE);
  check("DP05 allow  no activeFeature in state", "Edit", "src/foo.ts", ALLOW, { projectDir: dir, stderrEmpty: true });
}

// ---- DP06 approval alone stays design-gated; implementation phase admits edits ----------
{
  const dir = freshDir("approved");
  writeManifest(dir, MANIFEST_BLOCKING);
  writeState(dir, APPROVED_STATE);
  check("DP06 block approved design before explicit implementation phase", "Edit", "src/foo.ts", BLOCK, {
    projectDir: dir,
    stderrIncludes: ["approved", "set-phase"],
  });
  writeState(dir, {
    ...APPROVED_STATE,
    activeFeature: { ...APPROVED_STATE.activeFeature, phase: "implementation" },
  });
  check("DP06b allow exact approved implementation", "Edit", "src/foo.ts", ALLOW, {
    projectDir: dir,
    stderrEmpty: true,
  });
}

// ---- DP07 gate blocking, unapproved, non-exempt path -> block, names feature id ---------
{
  const dir = freshDir("block");
  writeManifest(dir, MANIFEST_BLOCKING);
  writeState(dir, UNAPPROVED_STATE);
  check("DP07 block  unapproved + non-exempt path -> names feature id", "Edit", "src/foo.ts", BLOCK, {
    projectDir: dir,
    stderrIncludes: ["ap1-pipeline-tuning", "guard-devplan"],
  });
}

// ---- DP08 default exempt prefixes -> allow ----------------------------------------------
{
  const prefixes = ["docs/", "specs/", ".claude/", "backlog/"];
  for (const prefix of prefixes) {
    const dir = freshDir(`exempt-${prefix.replace(/\W/g, "")}`);
    writeManifest(dir, MANIFEST_BLOCKING);
    writeState(dir, UNAPPROVED_STATE);
    check(`DP08 allow  default exempt prefix "${prefix}"`, "Edit", `${prefix}something.md`, ALLOW, { projectDir: dir, stderrEmpty: true });
  }
}

// ---- DP09 planPath itself -> allow -------------------------------------------------------
{
  const dir = freshDir("planpath");
  writeManifest(dir, MANIFEST_BLOCKING);
  writeState(dir, UNAPPROVED_STATE);
  check("DP09 allow  the activeFeature.planPath itself", "Edit", PLAN_PATH, ALLOW, { projectDir: dir, stderrEmpty: true });
}

// ---- DP10 custom exemptPaths honored -> allow --------------------------------------------
{
  const dir = freshDir("custom-exempt");
  writeManifest(dir, MANIFEST_CUSTOM_EXEMPT);
  writeState(dir, UNAPPROVED_STATE);
  check("DP10 allow  custom exemptPaths from manifest honored", "Edit", "custom/thing.ts", ALLOW, { projectDir: dir, stderrEmpty: true });
  // sanity: a DIFFERENT non-exempt path in the same fixture still blocks.
  check("DP10b block  non-exempt path in same custom-exempt fixture still blocks", "Edit", "src/foo.ts", BLOCK, {
    projectDir: dir,
    stderrIncludes: ["ap1-pipeline-tuning"],
  });
}

// ---- DP11 mode warn, unapproved + non-exempt -> exit 1 -----------------------------------
{
  const dir = freshDir("warn-mode");
  writeManifest(dir, MANIFEST_WARN);
  writeState(dir, UNAPPROVED_STATE);
  check("DP11 warn  mode warn, unapproved + non-exempt -> exit 1", "Edit", "src/foo.ts", WARN, {
    projectDir: dir,
    stderrIncludes: ["ap1-pipeline-tuning"],
  });
}

// ---- DP12 malformed state JSON -> WARN, not block ----------------------------------------
{
  const dir = freshDir("malformed-state");
  writeManifest(dir, MANIFEST_BLOCKING);
  writeState(dir, "{ this is not json");
  check("DP12 warn  malformed state JSON surfaces as WARN, not block", "Edit", "src/foo.ts", WARN, {
    projectDir: dir,
    stderrIncludes: ["WARN"],
  });
}

// ---- DP13 Write tool covered (not just Edit) ---------------------------------------------
{
  const dir = freshDir("write-tool");
  writeManifest(dir, MANIFEST_BLOCKING);
  writeState(dir, UNAPPROVED_STATE);
  check("DP13 block  Write tool covered alongside Edit", "Write", "src/foo.ts", BLOCK, {
    projectDir: dir,
    stderrIncludes: ["ap1-pipeline-tuning"],
  });
}

// ---- DP14 backslash path normalization ----------------------------------------------------
{
  const dir = freshDir("backslash");
  writeManifest(dir, MANIFEST_BLOCKING);
  writeState(dir, UNAPPROVED_STATE);
  check("DP14 block  backslash path still matches non-exempt (blocked)", "Edit", "src\\foo.ts", BLOCK, {
    projectDir: dir,
    stderrIncludes: ["ap1-pipeline-tuning"],
  });
  check("DP14b allow  backslash path under an exempt prefix (Windows docs\\ variant)", "Edit", "docs\\bar.md", ALLOW, {
    projectDir: dir,
    stderrEmpty: true,
  });
}

// ---- DP15 malformed manifest YAML (genuine syntax failure) -> WARN ------------------------
{
  const dir = freshDir("malformed-manifest");
  writeManifest(dir, MANIFEST_SYNTAX_BROKEN);
  check("DP15 warn  malformed manifest YAML surfaces as WARN, not block", "Edit", "src/foo.ts", WARN, {
    projectDir: dir,
    stderrIncludes: ["WARN"],
  });
}

// ---- DP16 absolute path resolution (C1 fix, from a critic review) -----------------------
// `join(dir, ...)` produces an ABSOLUTE path in the platform-native form (backslashes +
// drive letter on Windows) -- exactly the shape Claude Code's real PreToolUse contract
// delivers, unlike the relative fixture paths ("src/foo.ts") used in DP01-DP15 above.
{
  const dir = freshDir("abs-exempt-default");
  writeManifest(dir, MANIFEST_BLOCKING);
  writeState(dir, UNAPPROVED_STATE);
  check("DP16 allow  absolute exempt path (backslash, drive letter) under docs/", "Edit", join(dir, "docs", "state.md"), ALLOW, {
    projectDir: dir,
    stderrEmpty: true,
  });
}

// ---- DP17 absolute NON-exempt path inside root -> block ---------------------------------
{
  const dir = freshDir("abs-nonexempt");
  writeManifest(dir, MANIFEST_BLOCKING);
  writeState(dir, UNAPPROVED_STATE);
  check("DP17 block  absolute non-exempt path inside root", "Edit", join(dir, "src", "foo.ts"), BLOCK, {
    projectDir: dir,
    stderrIncludes: ["ap1-pipeline-tuning"],
  });
}

// ---- DP18 absolute path OUTSIDE the project root -> allow (scope boundary) --------------
{
  const dir = freshDir("abs-outside-root");
  const outsideDir = freshDir("abs-outside-root-elsewhere"); // sibling temp dir, NOT projectDir
  writeManifest(dir, MANIFEST_BLOCKING);
  writeState(dir, UNAPPROVED_STATE);
  check("DP18 allow  absolute path outside the project root (sibling tree, same drive)", "Edit", join(outsideDir, "src", "foo.ts"), ALLOW, {
    projectDir: dir,
    stderrEmpty: true,
  });
}

// ---- DP19 absolute planPath -> allow -----------------------------------------------------
{
  const dir = freshDir("abs-planpath");
  writeManifest(dir, MANIFEST_BLOCKING);
  writeState(dir, UNAPPROVED_STATE);
  check("DP19 allow  absolute path resolving to the activeFeature.planPath itself", "Edit", join(dir, PLAN_PATH), ALLOW, {
    projectDir: dir,
    stderrEmpty: true,
  });
}

// ---- DP20 manifest exemptPaths honored with absolute input -> allow ----------------------
{
  const dir = freshDir("abs-custom-exempt");
  writeManifest(dir, MANIFEST_CUSTOM_EXEMPT);
  writeState(dir, UNAPPROVED_STATE);
  check("DP20 allow  absolute path resolving under manifest exemptPaths (custom/)", "Edit", join(dir, "custom", "thing.ts"), ALLOW, {
    projectDir: dir,
    stderrEmpty: true,
  });
  // sanity: a DIFFERENT absolute non-exempt path in the same fixture still blocks.
  check("DP20b block  different absolute non-exempt path in same custom-exempt fixture still blocks", "Edit", join(dir, "src", "foo.ts"), BLOCK, {
    projectDir: dir,
    stderrIncludes: ["ap1-pipeline-tuning"],
  });
}

// ---- DP21 mixed-separator absolute variant (forward slashes appended to a Windows root) --
{
  const dir = freshDir("abs-mixed-separators");
  writeManifest(dir, MANIFEST_BLOCKING);
  writeState(dir, UNAPPROVED_STATE);
  const mixed = `${dir.replace(/\\/g, "/")}/docs/state.md`; // e.g. "C:/Users/.../docs/state.md"
  check("DP21 allow  mixed-separator absolute exempt path", "Edit", mixed, ALLOW, { projectDir: dir, stderrEmpty: true });
  const mixedBlock = `${dir.replace(/\\/g, "/")}/src/foo.ts`;
  check("DP21b block  mixed-separator absolute non-exempt path still blocks", "Edit", mixedBlock, BLOCK, {
    projectDir: dir,
    stderrIncludes: ["ap1-pipeline-tuning"],
  });
}

// ---- DP22 relative traversal must NOT count as exempt (path.normalize hardening) ---------
// Plan `2026-07-07-retro-speed.md` G-B / re-critic nit: a relative `file_path` like
// `docs/../src/foo.ts` starts with the exempt prefix "docs/" as a raw string, but
// resolves to `src/foo.ts` once `..` is collapsed -- it must BLOCK, not exempt.
{
  const dir = freshDir("traversal-relative");
  writeManifest(dir, MANIFEST_BLOCKING);
  writeState(dir, UNAPPROVED_STATE);
  check("DP22 block  relative traversal out of docs/ (docs/../src/foo.ts) is NOT exempt", "Edit", "docs/../src/foo.ts", BLOCK, {
    projectDir: dir,
    stderrIncludes: ["ap1-pipeline-tuning"],
  });
  // sanity: a traversal that resolves BACK under an exempt prefix stays exempt.
  check("DP22b allow  traversal that resolves back under docs/ (docs/../docs/state.md) stays exempt", "Edit", "docs/../docs/state.md", ALLOW, {
    projectDir: dir,
    stderrEmpty: true,
  });
}

// ---- DP23 backslash relative traversal (Windows form) ------------------------------------
{
  const dir = freshDir("traversal-relative-backslash");
  writeManifest(dir, MANIFEST_BLOCKING);
  writeState(dir, UNAPPROVED_STATE);
  check("DP23 block  backslash relative traversal out of docs\\ is NOT exempt", "Edit", "docs\\..\\src\\foo.ts", BLOCK, {
    projectDir: dir,
    stderrIncludes: ["ap1-pipeline-tuning"],
  });
}

// ---- DP24 absolute path containing a traversal segment inside the project root ----------
// `join()` itself would already collapse this in the fixture builder, so this case builds
// the absolute path by STRING CONCATENATION to actually exercise a `..` segment reaching
// guard-devplan.mjs's own `path.relative()` + `path.normalize()` handling end to end.
{
  const dir = freshDir("traversal-absolute");
  writeManifest(dir, MANIFEST_BLOCKING);
  writeState(dir, UNAPPROVED_STATE);
  const traversalAbs = `${join(dir, "docs")}${sep}..${sep}src${sep}foo.ts`;
  check("DP24 block  absolute path with a traversal segment resolving outside docs/ is NOT exempt", "Edit", traversalAbs, BLOCK, {
    projectDir: dir,
    stderrIncludes: ["ap1-pipeline-tuning"],
  });
}

// ---- DP25 exact PRD/Spec authority is editable only in draft ----------------------------
{
  const dir = freshDir("draft-authority");
  writeManifest(dir, MANIFEST_BLOCKING);
  writeAuthorityDocs(dir);
  writeState(dir, DRAFT_AUTHORITY_STATE);
  check("DP25 allow  draft exact PRD authority", "Edit", AUTHORITY_PLAN_PATH, ALLOW, {
    projectDir: dir,
    stderrEmpty: true,
  });
  check("DP25b allow  draft exact Spec authority", "Edit", AUTHORITY_SPEC_PATH, ALLOW, {
    projectDir: dir,
    stderrEmpty: true,
  });
  check("DP25c block  draft implementation path remains gated", "Edit", "src/implementation.mjs", BLOCK, {
    projectDir: dir,
    stderrIncludes: ["authority-feature", "draft"],
  });
}

// ---- DP26 submitted PRD/Spec authority remains immutable while awaiting approval --------
{
  const dir = freshDir("awaiting-authority");
  writeManifest(dir, MANIFEST_BLOCKING);
  writeAuthorityDocs(dir);
  writeState(dir, AWAITING_AUTHORITY_STATE);
  check("DP26 block  awaiting-approval exact PRD authority", "Edit", AUTHORITY_PLAN_PATH, BLOCK, {
    projectDir: dir,
    stderrIncludes: ["awaiting-approval", "immutable"],
  });
  check("DP26b block  awaiting-approval exact Spec authority", "Edit", AUTHORITY_SPEC_PATH, BLOCK, {
    projectDir: dir,
    stderrIncludes: ["awaiting-approval", "immutable"],
  });
}

// ---- DP27/DP28 H-AC-12 generalized dual-evaluation (legacy/v2/v4 approval path) ---------
// Before this dispatch, a non-v3-schema approval reaching lifecycle "implementing" exited
// allow unconditionally -- no second evaluation, no fail-on-disagreement. These fixtures
// build a real "pipeline.plan-approval.v2" approval (submission-free compatibility branch)
// carrying an OPTIONAL top-level `state.planApprovalDecisionReference`
// (`pipeline.human-decision-reference.v1`) and prove the dual-evaluation primitive now
// governs it: unresolved/mismatched -> BLOCK (fail closed), genuinely ledger-granted -> ALLOW.
const V2_CANDIDATE = { commit: "b".repeat(40), tree: "c".repeat(40) };
const UNAVAILABLE = { state: "not-applicable" };

function governanceRegistry(fingerprint) {
  return {
    schema: "pipeline.governance-stream-registry.v1",
    repositoryFingerprint: fingerprint,
    canonicalization: "RFC8785",
    digestAlgorithm: "sha-256",
    eventDigestDomain: "pipeline.governance-event.v1\0",
    storageRoot: "governance/events",
    streams: [
      { streamId: "human", origin: "human", authorityClass: "human-authority", relativeRoot: "human", storageProfile: "repository-public-safe", genesis: { sequence: 0, eventDigest: null } },
      { streamId: "agent", origin: "agent", authorityClass: "non-authoritative", relativeRoot: "agent", storageProfile: "repository-public-safe", genesis: { sequence: 0, eventDigest: null } },
      { streamId: "lifecycle", origin: "lifecycle", authorityClass: "non-authoritative", relativeRoot: "lifecycle", storageProfile: "repository-public-safe", genesis: { sequence: 0, eventDigest: null } },
    ],
  };
}
function governanceCapturePolicy() {
  return {
    schema: "pipeline.governance-capture-policy.v1",
    policyId: "fixture",
    revision: "d".repeat(64),
    defaultAction: "deny",
    streams: [
      { origin: "human", purpose: "authority-history", materiality: "required", personalIdentifiability: "prohibited", contextualIdentifiability: "prohibited", storageProfile: "repository-public-safe", retention: "repository-retained", disclosure: "repository-visible", encryptionGeneration: null },
      { origin: "agent", purpose: "declared-assumption", materiality: "policy-selected", personalIdentifiability: "prohibited", contextualIdentifiability: "prohibited", storageProfile: "repository-public-safe", retention: "repository-retained", disclosure: "repository-visible", encryptionGeneration: null },
      { origin: "lifecycle", purpose: "deterministic-lifecycle", materiality: "required", personalIdentifiability: "prohibited", contextualIdentifiability: "prohibited", storageProfile: "repository-public-safe", retention: "repository-retained", disclosure: "repository-visible", encryptionGeneration: null },
    ],
    sanitizedReceipt: { allowEventId: true, allowEventDigest: true, allowCheckpoint: true, allowReasonText: false },
    mandatoryEventClasses: [],
  };
}
function governanceGrantDecision({ fingerprint, decisionId, packageId, artifacts }) {
  return {
    decisionId,
    event: "granted",
    outcome: "granted",
    authorityClass: "product-owner",
    identityAssurance: "locally-attributed",
    timeAssurance: "locally-observed",
    scope: { repositoryFingerprint: fingerprint, candidate: V2_CANDIDATE, packageId, action: "APPROVE_PLAN", environment: "local", artifacts },
    reasonCode: "APPROVED",
    policyDigest: "a".repeat(64),
    ruleDigest: "f".repeat(64),
    validity: { notBeforeEpochMs: 1, expiresAtEpochMs: 4_102_444_800_000, singleUse: true },
    links: { requestDecisionId: "request-1", consumesDecisionId: null, revokesDecisionId: null, expiresDecisionId: null, supersedesDecisionId: null, correctsDecisionId: null },
  };
}
function governanceGrantIntent({ fingerprint, capturePolicyDigest, decision }) {
  return {
    schema: "pipeline.governance-event-envelope.v1",
    payloadSchema: "pipeline.human-governance-decision.v1",
    canonicalization: "RFC8785",
    digestAlgorithm: "sha-256",
    eventId: "human-event-1",
    idempotencyKey: "human-idempotency-1",
    origin: "human",
    authorityClass: "human-authority",
    eventType: "human.granted",
    occurredAtEpochMs: 2,
    observedAtEpochMs: 2,
    timeAssurance: "locally-observed",
    repositoryFingerprint: fingerprint,
    sourceUri: `urn:pipeline:repository:${fingerprint}`,
    streamId: "human",
    correlation: { featureId: UNAVAILABLE, packageId: UNAVAILABLE, requestId: UNAVAILABLE, sessionId: UNAVAILABLE, dispatchId: UNAVAILABLE, traceId: UNAVAILABLE },
    candidate: V2_CANDIDATE,
    artifacts: [UNAVAILABLE],
    policy: { policyDigest: UNAVAILABLE, configurationDigest: UNAVAILABLE, capturePolicyDigest, redactionPolicyDigest: UNAVAILABLE },
    classification: "repository-public-safe",
    storageProfile: "repository-public-safe",
    retentionCompatibility: "repository-retained",
    disclosureClass: "repository-visible",
    payload: decision,
  };
}
/** Real git-init + governance-ledger fixture backing a genuinely resolvable grant. */
async function writeGovernanceLedgerGrant(dir, { decisionId, packageId, artifacts }) {
  spawnSync("git", ["init", "-q", dir]);
  const repository = discoverRepository(dir);
  const fingerprint = derivePoGateRepositoryFingerprint({ gitCommonDir: repository.commonDir, primaryRoot: repository.primaryRoot });
  const policy = governanceCapturePolicy();
  await mkdir(join(dir, "governance", "events"), { recursive: true });
  await writeFile(join(dir, "governance", "events", "registry.json"), `${canonicalizeJson(governanceRegistry(fingerprint))}\n`);
  await writeFile(join(dir, "governance", "events", "capture-policy.json"), `${canonicalizeJson(policy)}\n`);
  const decision = governanceGrantDecision({ fingerprint, decisionId, packageId, artifacts });
  const receipt = await appendHumanGovernanceDecision({
    repositoryRoot: dir,
    repositoryFingerprint: fingerprint,
    intent: governanceGrantIntent({ fingerprint, capturePolicyDigest: canonicalSha256(policy), decision }),
  });
  return { fingerprint, checkpoint: receipt.checkpoint, decisionDigest: canonicalSha256(decision) };
}
function v2AuthorityState({ repositoryFingerprint }) {
  return {
    schema: "pipeline.state.v0",
    activeFeature: { id: "authority-feature", planPath: AUTHORITY_PLAN_PATH, phase: "implementation" },
    planApproved: true,
    planApproval: {
      schema: "pipeline.plan-approval.v2",
      approvedBy: "PO",
      approvedAt: "2026-07-30T20:00:00.000Z",
      specBoundBy: "PO",
      specBoundAt: "2026-07-30T20:05:00.000Z",
      poGateAuthority: {
        schema: "pipeline.po-gate-authority.v2",
        humanFacing: "en",
        sourceSha256: "1".repeat(64),
        runtimeSha256: "2".repeat(64),
        receiptSha256: "3".repeat(64),
        repositoryFingerprint,
        planPath: AUTHORITY_PLAN_PATH,
        planSha256: sha256(AUTHORITY_PLAN_BYTES),
        specPath: AUTHORITY_SPEC_PATH,
        specSha256: sha256(AUTHORITY_SPEC_BYTES),
      },
    },
  };
}
function decisionReference({ fingerprint, decisionId, decisionDigest, checkpoint }) {
  return {
    schema: "pipeline.human-decision-reference.v1",
    decisionId,
    decisionDigest,
    candidate: V2_CANDIDATE,
    checkpoint: checkpoint ?? {
      repositoryFingerprint: fingerprint,
      streamId: "human",
      sequence: 1,
      eventDigest: "9".repeat(64),
      candidateCommit: V2_CANDIDATE.commit,
      candidateTree: V2_CANDIDATE.tree,
    },
  };
}

// ---- DP27 no ledger backing the reference at all -> BLOCK (fail closed, disagreement) ----
{
  const dir = freshDir("v2-reference-unresolved");
  writeManifest(dir, MANIFEST_BLOCKING);
  writeAuthorityDocs(dir);
  const fingerprint = "7".repeat(64);
  const state = {
    ...v2AuthorityState({ repositoryFingerprint: fingerprint }),
    planApprovalDecisionReference: decisionReference({ fingerprint, decisionId: "grant-1", decisionDigest: "8".repeat(64) }),
  };
  writeState(dir, state);
  check("DP27 block  legacy/v2 approval + present-but-unresolvable decision reference fails closed", "Edit", "src/foo.ts", BLOCK, {
    projectDir: dir,
    stderrIncludes: ["authority-feature", "human ledger"],
  });
}

// ---- DP28 a genuinely resolvable, ledger-granted reference -> ALLOW (agreement) ----------
{
  const dir = freshDir("v2-reference-resolved");
  writeManifest(dir, MANIFEST_BLOCKING);
  writeAuthorityDocs(dir);
  const grant = await writeGovernanceLedgerGrant(dir, {
    decisionId: "grant-1",
    packageId: "authority-feature",
    artifacts: [
      { path: AUTHORITY_PLAN_PATH, sha256: sha256(AUTHORITY_PLAN_BYTES) },
      { path: AUTHORITY_SPEC_PATH, sha256: sha256(AUTHORITY_SPEC_BYTES) },
    ],
  });
  const state = {
    ...v2AuthorityState({ repositoryFingerprint: grant.fingerprint }),
    planApprovalDecisionReference: decisionReference({
      fingerprint: grant.fingerprint,
      decisionId: "grant-1",
      decisionDigest: grant.decisionDigest,
      checkpoint: grant.checkpoint,
    }),
  };
  writeState(dir, state);
  check("DP28 allow  legacy/v2 approval + genuinely ledger-granted decision reference agrees", "Edit", "src/foo.ts", ALLOW, {
    projectDir: dir,
    stderrEmpty: true,
  });
}

// ---- DP29 sanctioned close-artifact writer: HISTORY.md and telemetry/ -> allow ----------
// backlog/items/2026-07-26-readonly-command-guard-classification.md;
// specs/sprint-phoenix-epic/RECOVERY.md R-02: mandatory root-level History/telemetry close
// records must be writable before plan approval without exempting any actual product file.
{
  const dir = freshDir("close-artifact-history");
  writeManifest(dir, MANIFEST_BLOCKING);
  writeState(dir, UNAPPROVED_STATE);
  check("DP29 allow  root-level HISTORY.md is a sanctioned close artifact", "Edit", "HISTORY.md", ALLOW, {
    projectDir: dir,
    stderrEmpty: true,
  });
  check("DP29b allow  telemetry/costs.md is a sanctioned close artifact", "Edit", "telemetry/costs.md", ALLOW, {
    projectDir: dir,
    stderrEmpty: true,
  });
  check("DP29c allow  root-level HISTORY.md matched case-insensitively", "Edit", "history.md", ALLOW, {
    projectDir: dir,
    stderrEmpty: true,
  });
}

// ---- DP30 close-artifact classification stays exact, not a loose prefix ----------------
// A file merely sharing the "history.md" string prefix, or living outside telemetry/, is
// NOT a close record and must still be gated like any other product file.
{
  const dir = freshDir("close-artifact-not-loose");
  writeManifest(dir, MANIFEST_BLOCKING);
  writeState(dir, UNAPPROVED_STATE);
  check("DP30 block  HISTORY.md.bak is NOT exempted by the close-artifact exact match", "Edit", "HISTORY.md.bak", BLOCK, {
    projectDir: dir,
    stderrIncludes: ["ap1-pipeline-tuning"],
  });
  check("DP30b block  nested docs/HISTORY.md (not root) is NOT the sanctioned close artifact", "Edit", "src/HISTORY.md", BLOCK, {
    projectDir: dir,
    stderrIncludes: ["ap1-pipeline-tuning"],
  });
  check("DP30c block  telemetry-extra/costs.md is NOT the telemetry/ close-record prefix", "Edit", "telemetry-extra/costs.md", BLOCK, {
    projectDir: dir,
    stderrIncludes: ["ap1-pipeline-tuning"],
  });
  check("DP30d block  ordinary product file src/foo.ts remains gated as before", "Edit", "src/foo.ts", BLOCK, {
    projectDir: dir,
    stderrIncludes: ["ap1-pipeline-tuning"],
  });
}

// ---- DP31 sanctioned close artifacts are exempt regardless of lifecycle phase ----------
{
  const dir = freshDir("close-artifact-approved");
  writeManifest(dir, MANIFEST_BLOCKING);
  writeState(dir, APPROVED_STATE); // approved design, not yet "implementation" -- still gated normally
  check("DP31 allow  HISTORY.md stays exempt even under an approved-but-not-implementation state", "Edit", "HISTORY.md", ALLOW, {
    projectDir: dir,
    stderrEmpty: true,
  });
  check("DP31b block  sanity: src/foo.ts is still gated in the same fixture", "Edit", "src/foo.ts", BLOCK, {
    projectDir: dir,
    stderrIncludes: ["approved", "set-phase"],
  });
}

// ---- Cleanup --------------------------------------------------------------------------
for (const dir of ALL_DIRS) {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    /* temp cleanup is best-effort */
  }
}

// ---- Summary --------------------------------------------------------------------------
const total = pass + failures.length;
console.log(`\n${pass}/${total} cases passed.`);
if (failures.length > 0) {
  console.log("Failures:");
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
process.exit(0);
