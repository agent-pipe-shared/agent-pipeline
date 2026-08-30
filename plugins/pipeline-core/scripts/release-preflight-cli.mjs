#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * Produce a `pipeline.release-preflight.v1` record — the fifth and last gate the
 * publication executor demands, and the one that had a builder, a validator, and no
 * way to run either.
 *
 * WHY THIS IS A SEPARATE FILE. `release-preflight.mjs` is imported by the executor.
 * Giving it a CLI entry point would put process/argv/filesystem behaviour inside a
 * module the executor loads; keeping the producer beside it leaves that module the
 * pure builder+validator it already is.
 *
 * WHAT IT DERIVES AND WHAT IT REFUSES TO INVENT. Everything observable is read from
 * the repository: candidate and base commits and trees, working-tree cleanliness, the
 * five version surfaces, the durable documents and their digests. Everything external
 * is an explicit input this tool will not default:
 *
 *   --consent <path>   a PO consent record. `status` must be "approved"; the tool
 *                      never writes that word on the PO's behalf UNLESS the project
 *                      has recorded an explicit release-preflight waiver
 *                      (project/critical-human-proof.json `waivedKinds`,
 *                      ADR-0064 Decision 6) — `declined`/`expired` are always
 *                      accepted as-is.
 *   --proof-request/--proof <external-path>  ADR-0064 Decision 5: the alternative,
 *                      additive input path. A recorded `release-preflight`-kind
 *                      critical-action request and its detached PO proof, both read
 *                      from OUTSIDE the repository. This tool rebuilds the subject
 *                      digest from its OWN observations (never trusts the recorded
 *                      one) and verifies the proof against the project's committed
 *                      trust policy before deriving `consent` from it. Exactly one
 *                      of `--consent` or this pair is required, never both.
 *   --gg03 <path>      a real protected-main fast-forward binding, or omitted, in
 *                      which case GG-03 is recorded as not required.
 *
 * It cannot manufacture a ready verdict. `createReleasePreflight` derives `status`
 * from its own reasons, and this tool passes observations through unchanged: a dirty
 * tree, a version surface that disagrees, an unapproved consent, or a GG-03 binding
 * naming another candidate each yield `blocked`. That mirrors
 * `publication-gate-evidence.mjs`: derive, never attest.
 *
 * Usage:
 *   node release-preflight-cli.mjs --preflight-id <id> --base <commit> \
 *     (--consent <repo-path> | --proof-request <external-path> --proof <external-path>) \
 *     --lifecycle <path> --retention-policy <sha256> \
 *     --out <path> [--gg03 <path>] [--root <repo>]
 *
 * Exit 0: a record was written (its `status` may be `blocked` — that is a real
 * outcome, not a failure of this tool). Exit 2: the inputs could not be observed
 * honestly, and nothing was written.
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstatSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

import { canonicalJson, createReleasePreflight, validateReleasePreflight } from "./release-preflight.mjs";
import { resolveAuthorityArtifactPath } from "../lib/project-authority.mjs";
import { isDirectInvocation } from "../lib/entrypoint.mjs";
import { criticalActionSubjectSha256, verifyCriticalActionApprovalRequest } from "../lib/critical-action-approval-request.mjs";
import { criticalProofWaiverFor, isWellFormedEd25519PublicKey, readCriticalHumanProofPolicy } from "../lib/critical-human-proof-policy.mjs";
import { canonical as canonicalPoApprovalProof } from "../lib/po-approval-proof.mjs";

const DOCUMENTS = Object.freeze(["prd", "spec", "acceptance", "result"]);
const FINAL_GATES = Object.freeze(["verify", "security", "critic", "remote", "human"]);
const VERSION_SURFACES = Object.freeze([
  "VERSION",
  "plugins/pipeline-core/.codex-plugin/plugin.json",
  "plugins/pipeline-core/.claude-plugin/plugin.json",
]);
// ADR-0064 Decision 2: the exact subject shape a release-preflight-kind critical
// action binds -- every field is one this tool already observes for the record
// itself, so building it costs no new observation, only reuse of the ones below.
const RELEASE_PREFLIGHT_CONSENT_SUBJECT_SCHEMA = "pipeline.release-preflight-consent-subject.v1";
// A generous but bounded cap on the two external proof artifacts (ADR-0064
// Decision 5), matching the discipline every other external-artifact reader in
// this plugin already applies (pipeline-state.mjs's EXTERNAL_PUBLIC_ARTIFACT_MAX_BYTES).
const EXTERNAL_PROOF_ARTIFACT_MAX_BYTES = 65_536;
const GLOBAL_CHAT_CONSENT_SCHEMA = "pipeline.release-preflight-chat-attribution.v1";

export class ReleasePreflightCliError extends Error {
  constructor(code, message) { super(message); this.name = "ReleasePreflightCliError"; this.code = code; }
}
const fail = (code, message) => { throw new ReleasePreflightCliError(code, message); };
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

function repoFile(root, relativePath, label) {
  if (typeof relativePath !== "string" || relativePath.length === 0 || isAbsolute(relativePath)) fail("RPC-PATH", `${label} must be repository-relative`);
  const absolute = resolve(root, relativePath);
  if (relative(root, absolute).startsWith(`..${sep}`) || absolute === root) fail("RPC-PATH", `${label} escapes the repository`);
  let info;
  try { info = lstatSync(absolute); } catch { fail("RPC-INPUT", `${label} is unavailable (${relativePath})`); }
  if (!info.isFile() || info.isSymbolicLink()) fail("RPC-INPUT", `${label} is not a regular file (${relativePath})`);
  return absolute;
}
const readJson = (root, relativePath, label) => {
  try { return JSON.parse(readFileSync(repoFile(root, relativePath, label), "utf8")); }
  catch (error) { if (error instanceof ReleasePreflightCliError) throw error; return fail("RPC-INPUT", `${label} is not valid JSON`); }
};

function git(root, args) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8", shell: false, timeout: 10_000 });
  if (result.status !== 0 || result.error) fail("RPC-GIT", `git ${args.join(" ")} failed`);
  return String(result.stdout).trim();
}

/** Observed, never asserted: HEAD, its tree, and whether anything is uncommitted. */
function observeRepository(root) {
  const headCommit = git(root, ["rev-parse", "HEAD"]);
  const headTree = git(root, ["rev-parse", "HEAD^{tree}"]);
  const status = spawnSync("git", ["status", "--porcelain=v1"], { cwd: root, encoding: "utf8", shell: false, timeout: 10_000 });
  if (status.status !== 0) fail("RPC-GIT", "git status failed");
  return { clean: String(status.stdout).length === 0, headCommit, headTree };
}

/**
 * The five version surfaces must already agree, exactly as the executor's own
 * consistency derivation demands. Disagreement is reported as a reason, not repaired.
 *
 * `candidateVersion` is a PARAMETER rather than re-read from `VERSION` here: it must
 * also feed the release-preflight consent subject (ADR-0064 Decision 2), which is
 * resolved BEFORE this function runs (consent construction needs it; this function's
 * own `decisionId`/`decisionSha256` fields need the resolved consent in turn) --
 * reading the file twice would risk the two reads disagreeing on a dirty tree, and
 * would just be a second definition of the same observation.
 */
function observeVersion(root, consent, candidateVersion) {
  const manifests = VERSION_SURFACES.slice(1).map((path) => {
    const value = readJson(root, path, path)?.version;
    if (typeof value !== "string") fail("RPC-VERSION", `${path} carries no string version`);
    return value;
  });
  const agreed = manifests.every((value) => value === candidateVersion);
  return {
    candidateVersion,
    // A surface mismatch must surface as `version-decision-mismatch`, which
    // createReleasePreflight derives when candidateVersion !== targetVersion.
    targetVersion: agreed ? candidateVersion : `${candidateVersion.split(".")[0]}.${candidateVersion.split(".")[1]}.${Number(candidateVersion.split(".")[2]) + 1}`,
    decisionId: consent.decisionId,
    decisionSha256: consent.authoritySha256,
    surfaces: VERSION_SURFACES.map((path, index) => ({ path, version: index === 0 ? candidateVersion : manifests[index - 1] })),
    agreed,
  };
}

function observeDocumentation(root, lifecycle) {
  const documentation = {};
  for (const kind of DOCUMENTS) {
    const path = lifecycle.documents?.[kind];
    if (typeof path !== "string") fail("RPC-INPUT", `lifecycle.documents.${kind} is missing`);
    documentation[kind] = { path, sha256: sha256(readFileSync(repoFile(root, path, `documentation.${kind}`))) };
  }
  return documentation;
}

function retentionRecords(documentation, policySha256) {
  const records = DOCUMENTS.map((kind) => ({
    archiveDigest: null,
    archiveProvenanceSha256: null,
    classification: "public",
    path: documentation[kind].path,
    retentionClass: "active",
  })).sort((left, right) => (left.path < right.path ? -1 : 1));
  return { policySha256, records };
}

/** True when `path` resolves outside `root` -- the ADR-0064 Decision 5 requirement
 * that both proof artifacts live "outside the repository, as every PO artifact is". */
function outsideRepository(root, path) {
  if (typeof path !== "string" || !isAbsolute(path)) return false;
  const rel = relative(root, resolve(path));
  return rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel);
}

/** Reads an unlinked, non-symlinked regular JSON file from OUTSIDE the repository --
 * the transport ADR-0064 Decision 5 requires for the recorded critical-action request
 * and its detached proof, mirroring `artifactPath`/`externalPublicJson`'s existing
 * unsafe-file discipline elsewhere in this plugin (po-human-approval.mjs,
 * pipeline-state.mjs) rather than inventing a third one. */
function readExternalJson(root, path, label) {
  if (!outsideRepository(root, path)) fail("RPC-PATH", `${label} must be an absolute path outside the repository`);
  let info;
  try { info = lstatSync(path); } catch { fail("RPC-INPUT", `${label} is unavailable`); }
  if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1 || info.size > EXTERNAL_PROOF_ARTIFACT_MAX_BYTES) {
    fail("RPC-INPUT", `${label} must be an unlinked regular file within the size cap`);
  }
  try { return JSON.parse(readFileSync(path, "utf8")); }
  catch { fail("RPC-INPUT", `${label} is not valid JSON`); }
}

/**
 * ADR-0064 Decision 6: a hand-supplied `--consent` file claiming `status: "approved"`
 * is honoured only when the project has recorded an explicit, committed
 * `waivedKinds` entry for `release-preflight` -- `criticalProofWaiverFor` is the
 * existing, generic waiver route (reused unmodified, never re-derived). `declined`
 * and `expired` pass through exactly as before: the tightening only narrows what
 * counts as "approved", so the sealed evidence run's `declined` consent input is
 * unaffected.
 */
function resolveHandSuppliedConsent(root, consentPath) {
  const consent = readJson(root, consentPath, "consent");
  if (consent?.status === "approved") {
    const waiver = criticalProofWaiverFor(root, "release-preflight");
    if (!waiver.waived) {
      fail("RPC-CONSENT-UNWAIVED", "a hand-supplied --consent claiming status \"approved\" requires an explicit, committed release-preflight waiver in project/critical-human-proof.json (criticalProofWaiverFor); supply --proof-request/--proof instead, or record the waiver.");
    }
  }
  return consent;
}

function globalChatAttribution(root) {
  const waiver = criticalProofWaiverFor(root, "release-preflight");
  return waiver.waived === true
    && waiver.waiver?.mode === "chat-attributed-unattested"
    && waiver.waiver?.kind === "release-preflight"
    ? { mode: "chat-attributed-unattested", kind: "release-preflight" }
    : null;
}

/**
 * The weak global route still records a candidate- and subject-bound durable
 * decision; it simply makes no claim that a key, terminal, host, or human
 * presence technically attested it.  The explicit record marker is the
 * authority basis, while the two digests bind that marker to this preflight's
 * exact observed candidate and subject.
 */
function resolveConsentFromGlobalChat({ candidate, subject, now }) {
  const attribution = { mode: "chat-attributed-unattested", kind: "release-preflight" };
  const binding = {
    schema: GLOBAL_CHAT_CONSENT_SCHEMA,
    attribution,
    candidate,
    subject,
  };
  const digest = sha256(canonicalJson(binding));
  return {
    authoritySha256: digest,
    decisionId: digest,
    evaluatedAt: now,
    expiresAt: now,
    status: "approved",
  };
}

/**
 * ADR-0064 Decision 5: resolves the trust-anchor SET from the project's OWN
 * committed policy (never the external directory), then tries `verifyCriticalActionApprovalRequest`
 * against each candidate trustPolicy in turn. An empty set (v3 default posture, or no
 * policy at all) means "any well-formed key may sign": the trustPolicy is then derived
 * from the proof's own claimed key, exactly as `verifyAgainstTrustAnchors`
 * (critical-human-proof-policy.mjs) already does for the same posture -- duplicated
 * here in miniature because that function verifies an `{intent, proof}` pair, not a
 * full `{request, expectedCandidate, expectedAction}` critical-action request.
 *
 * Every check besides the final signature match (shape, candidate, kind, expiry) is
 * trustPolicy-independent, so the first non-"EXTERNAL-AUTHORITY-REQUIRED" result is
 * decisive and short-circuits the loop; only a real per-anchor signature mismatch
 * continues to the next candidate.
 */
function verifyReleasePreflightProof({ root, request, proof, expectedCandidate, expectedAction, now }) {
  const policy = readCriticalHumanProofPolicy(root);
  if (!policy.ok) return { verified: false, code: policy.code };
  const anchors = policy.trustAnchors !== null ? policy.trustAnchors : (policy.trustAnchor === null ? [] : [policy.trustAnchor]);
  const candidates = anchors.length > 0
    ? anchors
    : (isWellFormedEd25519PublicKey(proof?.publicKey)
      ? [{ keyReference: proof.keyReference, publicKeySha256: createHash("sha256").update(proof.publicKey).digest("hex") }]
      : []);
  if (candidates.length === 0) return { verified: false, code: "CRITICAL-ACTION-REQUEST-INVALID" };
  let result;
  for (const trustPolicy of candidates) {
    result = verifyCriticalActionApprovalRequest({ request, trustPolicy, proof, expectedCandidate, expectedAction, now });
    if (result.verified || result.code !== "CRITICAL-ACTION-EXTERNAL-AUTHORITY-REQUIRED") return result;
  }
  return result;
}

/**
 * ADR-0064 Decision 5: the new, additive input path. Reads the recorded
 * `release-preflight`-kind critical-action request and its detached proof from
 * OUTSIDE the repository, rebuilds the subject digest from this tool's OWN
 * observations (never trusts the recorded one), and verifies with
 * `verifyCriticalActionApprovalRequest`. On `CRITICAL-ACTION-PROOF-VERIFIED`, builds
 * the five-field consent object per the ADR's field-mapping table. On
 * `CRITICAL-ACTION-PROOF-EXPIRED`, status is `"expired"` regardless of what follows --
 * that outcome, and the `consent-not-approved` blocker it reaches, never changes.
 *
 * Record-fidelity fix (Critic finding F3, this dispatch): `authoritySha256` must never
 * imply a verification guarantee this path did not actually check.
 * `verifyCriticalActionApprovalRequest` short-circuits on expiry (its own
 * `expiresAt < now` check) *before* ever calling `verifyPoApprovalProof`, so naively
 * hashing the raw, external `proof` object here would carry the exact same field shape
 * as the verified branch's `authoritySha256` while never having checked the signature
 * at all -- a stale PASS-shaped record would be indistinguishable from a real one. The
 * fix re-runs the *exact same*, unmodified `verifyReleasePreflightProof` path a second
 * time, evaluated `now: request.action.expiresAt` -- the latest instant this proof
 * could truthfully claim to still be valid (the same "as-of" instant `evaluatedAt`
 * below already uses, for the identical invariant reason). This calls
 * `verifyCriticalActionApprovalRequest` again rather than rebuilding its rebuild/verify
 * logic a second time in this file (the exact duplication class this file's neighbours
 * already warn against) and does not alter that shared function's control flow or
 * short-circuit order at all -- push/deploy/publication observe zero behaviour change.
 * If that second, honest check verifies, `authoritySha256` is the real
 * `proofSha256` -- by construction the same value `sha256(canonical(proof))` always
 * produced here, now because it was actually checked rather than merely assumed to
 * agree. If it does not verify (bad signature, wrong key), `authoritySha256` is instead
 * the digest of an explicitly-labelled unverified-claim wrapper around the proof --
 * mathematically distinct from a real `proofSha256`, so the two cases are no longer
 * silently identical in shape. Any other code from the FIRST verification exits by
 * throwing: this function never writes a consent object for a proof that failed for a
 * reason other than expiry.
 */
function resolveConsentFromVerifiedProof({ root, candidate, proofRequestPath, proofPath, subject, now }) {
  const request = readExternalJson(root, proofRequestPath, "--proof-request");
  const proof = readExternalJson(root, proofPath, "--proof");
  let subjectSha256;
  try { subjectSha256 = criticalActionSubjectSha256({ kind: "release-preflight", candidate, subject }); }
  catch { fail("RPC-CONSENT-SUBJECT", "the release-preflight consent subject could not be hashed"); }
  const expectedAction = { kind: "release-preflight", subjectSha256, expiresAt: request?.action?.expiresAt };
  const verified = verifyReleasePreflightProof({ root, request, proof, expectedCandidate: candidate, expectedAction, now });
  if (verified.code === "CRITICAL-ACTION-PROOF-VERIFIED") {
    return {
      authoritySha256: verified.proofSha256,
      decisionId: request.approvalIntent.sha256,
      evaluatedAt: now,
      expiresAt: request.action.expiresAt,
      status: "approved",
    };
  }
  if (verified.code === "CRITICAL-ACTION-PROOF-EXPIRED") {
    const asOfExpiry = verifyReleasePreflightProof({ root, request, proof, expectedCandidate: candidate, expectedAction, now: request.action.expiresAt });
    const authoritySha256 = asOfExpiry.code === "CRITICAL-ACTION-PROOF-VERIFIED"
      ? asOfExpiry.proofSha256
      : sha256(canonicalPoApprovalProof({ schema: "pipeline.release-preflight-consent-authority-unverified.v1", proof }));
    return {
      authoritySha256,
      decisionId: request.approvalIntent.sha256,
      // NOT `now`: this branch is only reached when `expiresAt < now` (the check
      // inside `verifyCriticalActionApprovalRequest`), so `evaluatedAt: now` would
      // ALWAYS violate validateConsent's `expiry >= evaluatedAt` invariant
      // (release-preflight.mjs:111) here specifically -- turning every genuinely
      // expired proof into an uncaught RPF-CONSENT throw instead of the clean
      // "expired" record that reaches the ordinary consent-not-approved blocker
      // (ADR-0064 Decision 5). The recorded expiry is the latest instant this
      // consent could truthfully claim to have still been evaluated as valid, so
      // it is used here -- satisfying the invariant by equality, never by
      // claiming an evaluation later than the proof's own limit allows.
      evaluatedAt: request.action.expiresAt,
      expiresAt: request.action.expiresAt,
      status: "expired",
    };
  }
  fail("RPC-CONSENT-UNVERIFIED", `the release-preflight consent proof was not verified (${verified.code})`);
}

export function buildReleasePreflight({
  rootDir = process.cwd(), preflightId, baseCommit, consentPath = null,
  proofRequestPath = null, proofPath = null, lifecyclePath, retentionPolicySha256,
  gg03Path = null, now = new Date().toISOString(),
}) {
  const root = resolve(rootDir);
  if ((proofRequestPath === null) !== (proofPath === null)) fail("RPC-USAGE", "--proof-request and --proof must be supplied together");
  if (consentPath !== null && proofRequestPath !== null) fail("RPC-USAGE", "--consent and --proof-request/--proof are mutually exclusive");
  // Preserve the public usage contract before inspecting any other repository
  // input.  The sole exception is the committed global selector; its resolver
  // compares the source to HEAD and therefore cannot be activated by a working
  // tree edit.
  const humanApproval = globalChatAttribution(root);
  if (consentPath === null && proofRequestPath === null && humanApproval === null) {
    fail("RPC-USAGE", "either --consent or --proof-request/--proof is required unless committed gates.human_approval is chat");
  }

  const lifecycleInput = readJson(root, lifecyclePath, "lifecycle");
  const repository = observeRepository(root);
  const candidate = { commit: repository.headCommit, tree: repository.headTree };
  const baseTree = git(root, ["rev-parse", `${baseCommit}^{tree}`]);
  const base = { commit: git(root, ["rev-parse", `${baseCommit}^{commit}`]), tree: baseTree };
  const manifestAbsolute = repoFile(root, lifecyclePath, "lifecycle manifest");
  const manifestSha256 = sha256(readFileSync(manifestAbsolute));
  const candidateVersion = readFileSync(repoFile(root, "VERSION", "VERSION"), "utf8").trim();
  const subject = {
    schema: RELEASE_PREFLIGHT_CONSENT_SUBJECT_SCHEMA,
    version: candidateVersion,
    base,
    lifecycle: { featureId: lifecycleInput.featureId, manifestPath: lifecyclePath, manifestSha256 },
    retentionPolicySha256,
  };
  const consent = consentPath !== null
    ? resolveHandSuppliedConsent(root, consentPath)
    : proofRequestPath !== null
      ? resolveConsentFromVerifiedProof({
      root, candidate, proofRequestPath, proofPath, now,
      subject,
    })
      : resolveConsentFromGlobalChat({ candidate, subject, now });

  const version = observeVersion(root, consent, candidateVersion);
  const documentation = observeDocumentation(root, lifecycleInput);

  const input = {
    preflightId,
    base,
    candidate,
    repository,
    version: { candidateVersion: version.candidateVersion, targetVersion: version.targetVersion, decisionId: version.decisionId, decisionSha256: version.decisionSha256 },
    documentation,
    lifecycle: {
      featureId: lifecycleInput.featureId,
      manifestPath: lifecyclePath,
      manifestSha256,
      status: "prepared",
    },
    retention: retentionRecords(documentation, retentionPolicySha256),
    consent: {
      authoritySha256: consent.authoritySha256,
      decisionId: consent.decisionId,
      evaluatedAt: consent.evaluatedAt,
      expiresAt: consent.expiresAt,
      // Passed through verbatim (hand-supplied) or built from one verified branch of
      // one returned code (derived, ADR-0064 Decision 5). This tool never writes
      // "approved" of its own accord either way.
      status: consent.status,
    },
    humanApproval: humanApproval !== null && proofRequestPath === null ? humanApproval : null,
    gates: {
      gg03: gg03Path === null ? { required: false, binding: null } : { required: true, binding: readJson(root, gg03Path, "gates.gg03.binding") },
      inventory: FINAL_GATES.map((id) => ({ id, kind: ["remote", "human"].includes(id) ? "external" : "local-final", status: "pending" })),
    },
    extensions: { schema: "pipeline.release-preflight-extension-input.v1", status: "none", registrySha256: null, requirements: [] },
  };

  const record = createReleasePreflight(input);
  validateReleasePreflight(record);
  return { record, versionSurfaces: version.surfaces, versionAgreed: version.agreed };
}

const USAGE = "Usage: release-preflight-cli.mjs --preflight-id <id> --base <commit> (--consent <repo-path> | --proof-request <external-path> --proof <external-path>) --lifecycle <path> --retention-policy <sha256> --out <path> [--gg03 <path>] [--root <repo>]";

function parseArgs(argv) {
  const value = {};
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const next = argv[index + 1];
    if (!flag?.startsWith("--") || next === undefined || next.startsWith("--")) {
      fail("RPC-USAGE", USAGE);
    }
    value[flag] = next;
  }
  for (const required of ["--preflight-id", "--base", "--lifecycle", "--retention-policy", "--out"]) {
    if (!value[required]) fail("RPC-USAGE", `${required} is required`);
  }
  // ADR-0064 Decision 5: --consent (hand-supplied) and --proof-request/--proof
  // (derived from a verified critical-action proof) are two DIFFERENT input paths
  // into the same `consent` field -- exactly one of them, never both, never neither.
  // buildReleasePreflight() re-checks this identically for its own direct callers
  // (tests), so this is the CLI-argv-specific half of that same rule.
  if (Boolean(value["--proof-request"]) !== Boolean(value["--proof"])) fail("RPC-USAGE", "--proof-request and --proof must be supplied together");
  if (value["--consent"] && value["--proof-request"]) fail("RPC-USAGE", "--consent and --proof-request/--proof are mutually exclusive");
  const rootDir = value["--root"] ?? process.cwd();
  if (!value["--consent"] && !value["--proof-request"] && globalChatAttribution(resolve(rootDir)) === null) {
    fail("RPC-USAGE", "either --consent or --proof-request/--proof is required unless committed gates.human_approval is chat");
  }
  return {
    rootDir,
    preflightId: value["--preflight-id"],
    baseCommit: value["--base"],
    consentPath: value["--consent"] ?? null,
    proofRequestPath: value["--proof-request"] ?? null,
    proofPath: value["--proof"] ?? null,
    lifecyclePath: value["--lifecycle"],
    retentionPolicySha256: value["--retention-policy"],
    gg03Path: value["--gg03"] ?? null,
    outPath: value["--out"],
  };
}

if (isDirectInvocation(import.meta.url)) {
  try {
    const options = parseArgs(process.argv.slice(2));
    const built = buildReleasePreflight(options);
    const root = resolve(options.rootDir);
    if (isAbsolute(options.outPath)) fail("RPC-PATH", "out path must be repository-relative");
    const target = resolve(root, options.outPath);
    if (relative(root, target).startsWith(`..${sep}`)) fail("RPC-PATH", "out path escapes the repository");
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, `${JSON.stringify(built.record, null, 2)}\n`);
    process.stdout.write(`${JSON.stringify({
      status: built.record.status,
      reasons: built.record.reasons,
      recordSha256: built.record.recordSha256,
      versionSurfacesAgree: built.versionAgreed,
      writtenTo: options.outPath,
    }, null, 2)}\n`);
  } catch (error) {
    const code = error instanceof ReleasePreflightCliError ? error.code : (error?.code ?? "RPC-ERROR");
    process.stderr.write(`release-preflight-cli: ${code}: ${error.message}\n`);
    process.exitCode = 2;
  }
}
