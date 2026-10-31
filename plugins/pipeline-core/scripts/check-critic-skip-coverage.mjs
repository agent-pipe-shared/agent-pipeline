#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/** Per-dispatch Critic disposition enforcement for dispatch-record v3. */
import { historicalFreshReviewCaptureFacts, historicalFreshReviewPacketBinding } from "../lib/historical-fresh-review-admission.mjs";
import { sha256Canonical } from "../lib/review-economy.mjs";
import { execFileSync, spawnSync } from "node:child_process";
import { lstatSync, realpathSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { CRITIC_SKIP_SCHEMA, criticDisposition } from "../lib/critic-skip-decision.mjs";
import { DISPATCH_RECORD_SCHEMA, PREVIOUS_DISPATCH_RECORD_SCHEMA, validateDispatchRecord, validatePreviousDispatchRecord } from "../lib/dispatch-record.mjs";
import { parseIntegrationTrailerBlock } from "../lib/commit-message-policy.mjs";
import { verifyQualityPackageIntegrationPostCommit } from "../lib/signed-quality-package.mjs";
import { checkRunnerManifestParity } from "./check-runner-manifest-parity.mjs";
import { DEFAULT_ROOT, SHA256, OID, readGit, readAbandonedV3RecoveryIndex, terminalAuthoredDelivery, readLegacyDispatchReconcileIndex, walkDispatchRecordsForReview, readCommitChangedPaths, evaluateReviewAdmission, evaluateReviewAdmissionCore, historicalAdmission } from "../lib/review-admission-read.mjs";
import { evaluateRepositoryCriticSkipCoverage } from "../lib/review-admission-read.mjs";
export { walkDispatchRecords, evaluateRepositoryCriticSkipCoverage } from "../lib/review-admission-read.mjs";
export { DEFAULT_ROOT, LEGACY_RECONCILE_SCHEMA, DEFAULT_LEGACY_RECONCILE_INDEX_PATH, ABANDONED_V3_RECOVERY_INDEX_SCHEMA, DEFAULT_ABANDONED_V3_RECOVERY_INDEX_PATH, readAbandonedV3RecoveryIndex, readLegacyDispatchReconcileIndex, criticAddendumBindingFinding, verifyCriticDispositionAddendumForRecord, readCommitChangedPaths, evaluateReviewAdmission } from "../lib/review-admission-read.mjs";


const RUNNER_MANIFESTS = Object.freeze([
  { runner: "codex", path: "plugins/pipeline-core/.codex-plugin/plugin.json" },
  { runner: "claude", path: "plugins/pipeline-core/.claude-plugin/plugin.json" },
  { runner: "antigravity", path: "plugins/pipeline-core/plugin.json" },
]);

function gitBlobBytes(root, commit, path) {
  return execFileSync("git", ["-C", root, "show", `${commit}:${path}`], {
    encoding: "buffer", maxBuffer: 2 * 1024 * 1024,
    env: Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^GIT_/iu.test(key))),
  });
}

function signedImportFailure(code, details = null) {
  const error = new Error(code);
  error.code = code;
  error.details = details;
  throw error;
}

function manifestValue(bytes, label) {
  let value;
  try { value = JSON.parse(bytes.toString("utf8")); }
  catch { signedImportFailure("signed-import-manifest-json", { path: label }); }
  if (!value || typeof value !== "object" || Array.isArray(value) || typeof value.version !== "string") {
    signedImportFailure("signed-import-manifest-shape", { path: label });
  }
  return value;
}

function validateStampOnlyRange(root, integrationCommit, candidateCommit) {
  const objectFormat = readGit(root, ["rev-parse", "--show-object-format"]);
  const oidLength = objectFormat === "sha1" ? 40 : objectFormat === "sha256" ? 64 : 0;
  if (![integrationCommit, candidateCommit].every((oid) => oid.length === oidLength && OID.test(oid))) {
    signedImportFailure("signed-import-oid");
  }
  if (readGit(root, ["cat-file", "-t", integrationCommit]) !== "commit"
    || readGit(root, ["cat-file", "-t", candidateCommit]) !== "commit") signedImportFailure("signed-import-commit");
  const ancestor = spawnSync("git", ["-C", root, "merge-base", "--is-ancestor", integrationCommit, candidateCommit], {
    encoding: "utf8", env: Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^GIT_/iu.test(key))),
  });
  if (ancestor.status !== 0) signedImportFailure("signed-import-candidate-ancestry");

  const integrationParents = readGit(root, ["rev-list", "--parents", "-n", "1", integrationCommit]).split(/\s+/u);
  if (integrationParents.length !== 2) signedImportFailure("signed-import-parent");
  const baseCommit = integrationParents[1];
  const candidateParentLine = readGit(root, ["rev-list", "--parents", "-n", "1", candidateCommit]).split(/\s+/u);
  const rangeCommits = readGit(root, ["rev-list", "--reverse", `${integrationCommit}..${candidateCommit}`]).split("\n").filter(Boolean);
  if (rangeCommits.length > 32 || rangeCommits.some((oid) => !OID.test(oid))) signedImportFailure("signed-import-range-bound");
  const allowedPaths = new Set(RUNNER_MANIFESTS.map(({ path }) => path));
  const changedPaths = readGit(root, ["diff", "--name-only", "-z", integrationCommit, candidateCommit, "--"])
    .split("\0").filter(Boolean).sort();
  if (changedPaths.some((path) => !allowedPaths.has(path))) signedImportFailure("signed-import-nonversion-path", { changedPaths });

  let priorCommit = integrationCommit;
  for (const commit of rangeCommits) {
    const parents = readGit(root, ["rev-list", "--parents", "-n", "1", commit]).split(/\s+/u);
    if (parents.length !== 2 || parents[1] !== priorCommit) signedImportFailure("signed-import-linear-range");
    const changedAtCommit = readGit(root, ["diff-tree", "--no-commit-id", "--name-only", "-r", "-z", commit])
      .split("\0").filter(Boolean).sort();
    if (changedAtCommit.length === 0 || changedAtCommit.some((path) => !allowedPaths.has(path))) {
      signedImportFailure("signed-import-nonversion-commit", { commit, changedPaths: changedAtCommit });
    }
    for (const path of changedAtCommit) {
      const beforeRaw = gitBlobBytes(root, priorCommit, path);
      const afterRaw = gitBlobBytes(root, commit, path);
      const before = manifestValue(beforeRaw, path);
      const after = manifestValue(afterRaw, path);
      const token = JSON.stringify(before.version);
      const first = beforeRaw.indexOf(token);
      if (first < 0 || beforeRaw.indexOf(token, first + token.length) >= 0
        || !Buffer.from(beforeRaw.toString("utf8").replace(token, JSON.stringify(after.version))).equals(afterRaw)) {
        signedImportFailure("signed-import-nonversion-manifest-change", { commit, path });
      }
      const entry = RUNNER_MANIFESTS.find((item) => item.path === path);
      const version = new RegExp(`^0\\.7\\.0\\+${entry.runner}\\.([0-9]{14})\\.${integrationCommit.slice(0, 8)}$`, "u").exec(after.version);
      if (!version) signedImportFailure("signed-import-version-binding", { commit, path });
    }
    priorCommit = commit;
  }
  if (candidateParentLine.length !== 2 && candidateCommit !== integrationCommit) signedImportFailure("signed-import-candidate-parent");

  const candidateManifests = RUNNER_MANIFESTS.map(({ runner, path }) => {
    const bytes = gitBlobBytes(root, candidateCommit, path);
    const value = manifestValue(bytes, path);
    return { runner, path, bytes, value };
  });
  const tempRoot = mkdtempSync(join(tmpdir(), "pipeline-critic-runner-parity-"));
  try {
    if (realpathSync(tempRoot) !== tempRoot || lstatSync(tempRoot).isSymbolicLink()) signedImportFailure("signed-import-parity-temp");
    for (const { path, bytes } of candidateManifests) {
      const relativePath = path.slice("plugins/pipeline-core/".length);
      const target = join(tempRoot, relativePath);
      mkdirSync(dirname(target), { recursive: true, mode: 0o700 });
      writeFileSync(target, bytes, { mode: 0o600, flag: "wx" });
    }
    const parity = checkRunnerManifestParity(tempRoot);
    if (!parity.ok || parity.baseVersion !== "0.7.0") signedImportFailure("signed-import-manifest-parity", parity);
  } finally {
    const info = lstatSync(tempRoot);
    if (!info.isDirectory() || info.isSymbolicLink() || realpathSync(tempRoot) !== tempRoot) signedImportFailure("signed-import-parity-temp");
    rmSync(tempRoot, { recursive: true, force: true });
  }

  if (rangeCommits.length > 0) {
    const stampedVersions = candidateManifests.map(({ runner, value, path }) => {
      const match = new RegExp(`^0\\.7\\.0\\+${runner}\\.([0-9]{14})\\.${integrationCommit.slice(0, 8)}$`, "u").exec(value.version);
      if (!match) signedImportFailure("signed-import-version-binding", { path });
      return { timestamp: match[1], version: value.version };
    });
    if (new Set(stampedVersions.map(({ timestamp }) => timestamp)).size !== 1) signedImportFailure("signed-import-version-timestamp");
  }
  return { baseCommit, integrationCommit, candidateCommit, rangeCommits, changedPaths, candidateManifests };
}

/** Create a private, content-bound reference from the trusted local dispatch reader. */
export function createLocalDispatchEvidenceBinding({ root, taskId, reviewCandidateCommit, baseCommit } = {}) {
  if (typeof root !== "string" || typeof taskId !== "string" || typeof reviewCandidateCommit !== "string"
    || !/^[a-f0-9]{40}$/u.test(reviewCandidateCommit)) throw Object.assign(new TypeError("local dispatch evidence input is invalid"), { code: "LDE-INPUT" });
  const historical = historicalAdmission(root,{kind:"admitted-dispatch",taskId,baseCommit,candidateCommit:reviewCandidateCommit});
  const scan = walkDispatchRecordsForReview(root,historical?.entries ?? []);
  if (scan.findings.length > 0) throw Object.assign(new Error("local dispatch evidence source is unreadable"), { code: "LDE-SOURCE-UNREADABLE" });
  const matches = scan.records.filter(({ record }) => record?.taskId === taskId);
  if (matches.length !== 1) throw Object.assign(new Error("local dispatch evidence requires one exact source record"), { code: "LDE-SOURCE-RECORD-MISSING" });
  const entry = matches[0];
  const record = entry.record;
  const v3 = record?.schema === PREVIOUS_DISPATCH_RECORD_SCHEMA;
  const v4 = record?.schema === DISPATCH_RECORD_SCHEMA;
  if (!v3 && !v4) throw Object.assign(new Error("local dispatch evidence source is not a required authored delivery"), { code: "LDE-SCHEMA" });
  try { (v3 ? validatePreviousDispatchRecord : validateDispatchRecord)(record); }
  catch { throw Object.assign(new Error("local dispatch evidence source is not a required authored delivery"), { code: "LDE-RECORD-INVALID" }); }
  if (criticDisposition(record) !== "required"
    || !/^[a-f0-9]{40}$/u.test(record.candidateCommit ?? "")) {
    throw Object.assign(new Error("local dispatch evidence source is not a required authored delivery"), { code: "LDE-CRITIC-NOT-REQUIRED" });
  }
  const admission = evaluateReviewAdmission({ root, taskId, baseCommit, candidateCommit: reviewCandidateCommit });
  if (!admission.ok || admission.targetRecordCandidateCommit !== record.candidateCommit) {
    throw Object.assign(new Error("local dispatch evidence candidate is not admitted for this task"), { code: "LDE-CANDIDATE-BINDING" });
  }
  const binding = {
    schema: "pipeline.local-dispatch-evidence.v1",
    taskId,
    recordPath: entry.path,
    recordSha256: entry.sha256,
    sourceCandidateCommit: record.candidateCommit,
    reviewCandidateCommit,
    assurance: admission.assurance === "orchestrator-attested" ? "orchestrator-attested" : null,
  };
  return Object.freeze({ ...binding, snapshotId: sha256Canonical(binding) });
}

/** Admit a signed source import as its own review target without fabricating a dispatch row. */
export function evaluateSignedQualityImportReviewAdmission({ root, anchor } = {}) {
  const historical = historicalAdmission(root, {kind:"signed-quality-import",taskId:anchor?.taskId,baseCommit:anchor?.baseCommit,candidateCommit:anchor?.candidateCommit});
  return evaluateSignedQualityImportReviewAdmissionCore({root,anchor}, historical?.entries ?? [], historical);
}
function evaluateSignedQualityImportReviewAdmissionCore({ root, anchor } = {}, historicalEntries = [], historical = null) {
  try {
    const anchorKeys = ["schema", "intentSha256", "integrationCommit", "baseCommit", "candidateCommit", "taskId"];
    if (typeof root !== "string" || !anchor || typeof anchor !== "object" || Array.isArray(anchor)
      || Object.keys(anchor).length !== anchorKeys.length || anchorKeys.some((key) => !Object.hasOwn(anchor, key))
      || anchor.schema !== "pipeline.signed-quality-import-review-anchor.v1"
      || !SHA256.test(anchor.intentSha256 ?? "") || !OID.test(anchor.integrationCommit ?? "")
      || !OID.test(anchor.baseCommit ?? "") || !OID.test(anchor.candidateCommit ?? "")
      || anchor.taskId !== `signed-import-${anchor.intentSha256}`) {
      signedImportFailure("signed-import-anchor-shape");
    }
    const range = validateStampOnlyRange(root, anchor.integrationCommit, anchor.candidateCommit);
    if (range.baseCommit !== anchor.baseCommit) signedImportFailure("signed-import-base-mismatch");
    const signed = verifyQualityPackageIntegrationPostCommit({ repoRoot: root,
      commitSha: anchor.integrationCommit, intentSha256: anchor.intentSha256 });
    if (!signed?.ok || signed.code !== "QUALITY-PACKAGE-INTEGRATION-POSTCOMMIT-VERIFIED"
      || signed.intentSha256 !== anchor.intentSha256) signedImportFailure("signed-import-not-authorized");
    const coverage = historical !== null || historicalEntries.length > 0
      ? evaluateReviewAdmissionCore({root,taskId:anchor.taskId,candidateCommit:anchor.candidateCommit},historicalEntries,anchor)
      : evaluateRepositoryCriticSkipCoverage({ root });
    if (!coverage.ok) return { ok: false, code: "signed-import-ordinary-coverage-pending",
      authorityKind: "signed-quality-import", anchor, ordinaryCoverage: coverage,
      findings: coverage.readFindings };
    const tree = readGit(root, ["rev-parse", `${anchor.candidateCommit}^{tree}`]);
    return {
      ok: true,
      code: "signed-quality-import-review-admitted",
      authorityKind: "signed-quality-import",
      anchor,
      reviewCandidate: { commit: anchor.candidateCommit, tree },
      candidateRange: { baseCommit: range.baseCommit, integrationCommit: range.integrationCommit,
        candidateCommit: range.candidateCommit, commits: range.rangeCommits, changedPaths: range.changedPaths },
      ordinaryCoverage: { ok: coverage.ok, applicableRecordCount: coverage.applicableRecordCount,
        requiredRecordCount: coverage.requiredRecordCount, criticEvidenceRecordCount: coverage.criticEvidenceRecordCount,
        skipRecordCount: coverage.skipRecordCount, legacyRecordCount: coverage.legacyRecordCount,
        administrativelyRetiredRecordCount: coverage.administrativelyRetiredRecordCount },
      targetRecordCount: 0,
      historicalQualification: historical ? "unknown" : null,
      historicalDebtCount: historical?.entries.length ?? 0,
      ...(historical ? { historicalFreshReview: historicalFreshReviewPacketBinding({repository:root,currentTarget:{kind:"signed-quality-import",taskId:anchor.taskId,baseCommit:anchor.baseCommit,candidateCommit:anchor.candidateCommit}}) } : {}),
    };
  } catch (error) {
    return { ok: false, code: error?.code ?? "signed-import-invalid", details: error?.details ?? null,
      authorityKind: "signed-quality-import", findings: [error?.code ?? "signed-import-invalid"] };
  }
}

/** Diagnostic source capture only: not a public review-admission grant. */
export function observeHistoricalFreshReviewTargetAuthority({repository,inventoryHandle} = {}) {
  try {
    const facts=historicalFreshReviewCaptureFacts({repository,inventoryHandle});
    const historical=facts.entries.filter(entry=>entry.historical);
    let result;
    if(facts.target.kind === "signed-quality-import") {
      const intent=facts.target.taskId.replace(/^signed-import-/u, "");
      const commits=readGit(repository,["rev-list","--reverse",`${facts.target.baseCommit}..${facts.target.candidateCommit}`]).split("\n").filter(Boolean);
      const matches=commits.filter(commit=>{const trailer=parseIntegrationTrailerBlock(readGit(repository,["show","-s","--format=%B",commit]));return trailer.ok&&trailer.intentSha256===intent;});
      if(matches.length!==1) return {targetValid:false,code:"HFR-IMPORT-ANCHOR-UNAVAILABLE"};
      const anchor={schema:"pipeline.signed-quality-import-review-anchor.v1",intentSha256:intent,integrationCommit:matches[0],baseCommit:facts.target.baseCommit,candidateCommit:facts.target.candidateCommit,taskId:facts.target.taskId};
      // The private helper verifies real signed integration/range before the view.
      result=evaluateSignedQualityImportReviewAdmissionCore({root:repository,anchor},historical,{entries:historical});
    } else {
      const scan=walkDispatchRecordsForReview(repository,historical);
      const targets=scan.records.filter(entry=>entry.record?.taskId===facts.target.taskId);
      if(targets.length!==1 || !terminalAuthoredDelivery(targets[0].record))return {targetValid:false,code:"HFR-TARGET-NOT-AUTHORED-DELIVERY"};
      result=evaluateReviewAdmissionCore({root:repository,taskId:facts.target.taskId,candidateCommit:facts.target.candidateCommit},historical);
    }
    return {targetValid:result.ok===true,code:result.ok?"HFR-TARGET-OBSERVED":"HFR-TARGET-BLOCKED",findings:result.readFindings??result.findings??[]};
  } catch {return {targetValid:false,code:"HFR-TARGET-UNAVAILABLE"};}
}

function runCli() {
  const args = process.argv.slice(2);
  const rootIndex = args.indexOf("--root");
  if (args.length && (rootIndex !== 0 || args.length !== 2)) {
    process.stderr.write("usage: check-critic-skip-coverage.mjs [--root <repository>]\n");
    process.exitCode = 2; return;
  }
  const result = evaluateRepositoryCriticSkipCoverage({ root: rootIndex === 0 ? args[1] : DEFAULT_ROOT });
  for (const finding of result.readFindings) process.stderr.write(`CRITIC-SKIP-COVERAGE ${finding}\n`);
  process.stdout.write(`Critic-skip coverage: ${result.applicableRecordCount} applicable v3/v4, ${result.skipRecordCount} skipped, ${result.requiredRecordCount} required-pending, ${result.criticEvidenceRecordCount} evidenced, ${result.legacyRecordCount} legacy (schema ${CRITIC_SKIP_SCHEMA}) -- ${result.reason}\n`);
  if (!result.ok) process.exitCode = result.readFindings.some((finding) => /unreadable|invalid JSON/u.test(finding)) ? 2 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) runCli();

// Dedicated source-private METHOD binding; ordinary Critic/M2/M3 admission is unchanged.
export { createLocalControlledMethodDispatchEvidenceBinding, inspectLocalControlledMethodDispatchEvidenceBinding } from "../lib/controlled-method-dispatch-observation.mjs";
