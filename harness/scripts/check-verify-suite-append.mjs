#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/** Check every post-TP-13 registration edit; allow only the exact signed b7
 * ordering repair after canonical import proof and byte-derived restoration. */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseStrictJson } from "../../plugins/pipeline-core/lib/governance-event.mjs";
import { canonical } from "../../plugins/pipeline-core/lib/po-approval-proof.mjs";
import { evaluateVerifySuiteAppend } from "../../plugins/pipeline-core/lib/verify-suite-append-policy.mjs";
import { verifyQualityPackageIntegrationPostCommit } from "../../plugins/pipeline-core/lib/signed-quality-package.mjs";

const CONFIG = "project/guard-config.json";
const REGISTRY = "harness/verify-suites.json";
const RECOVERY = "harness/verify-suite-history-recovery.json";
const OID = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u;
const SHA256 = /^[a-f0-9]{64}$/u;
const RECOVERY_SCHEMA = "pipeline.verify-suite-history-recovery.v1";
const ENTRY_SCHEMA = "pipeline.verify-suite-history-recovery-entry.v1";
const fail = (code, detail = null) => ({ ok: false, code, detail });

function hasTp13(bytes) {
  try {
    const value = parseStrictJson(bytes);
    return Array.isArray(value?.protectedTestPaths)
      && value.protectedTestPaths.some((entry) => entry?.id === "TP-13"
        && entry.pattern === "harness/verify-suites\\.json$");
  } catch { return false; }
}

function parseRegistry(bytes) {
  try {
    const value = parseStrictJson(bytes);
    return value !== null && typeof value === "object" && !Array.isArray(value)
      && Object.keys(value).sort().join("\0") === "schema\0suites"
      && value.schema === "pipeline.verify-suites.v1" && Array.isArray(value.suites)
      ? value : null;
  } catch { return null; }
}

function registryBytes(suites) {
  return JSON.stringify({ schema: "pipeline.verify-suites.v1", suites }, null, 2) + "\n";
}

function exactEntryShape(entry) {
  const keys = [
    "appendedSuiteCount", "defectRegistryBlobOid", "integrationCommit",
    "integrationIntentSha256", "integrationParent", "parentRegistryBlobOid",
    "priorSuiteCount", "schema",
  ].sort().join("\0");
  return entry !== null && typeof entry === "object" && !Array.isArray(entry)
    && Object.keys(entry).sort().join("\0") === keys
    && entry.schema === ENTRY_SCHEMA
    && OID.test(entry.integrationCommit ?? "")
    && OID.test(entry.integrationParent ?? "")
    && SHA256.test(entry.integrationIntentSha256 ?? "")
    && OID.test(entry.parentRegistryBlobOid ?? "")
    && OID.test(entry.defectRegistryBlobOid ?? "")
    && Number.isSafeInteger(entry.priorSuiteCount) && entry.priorSuiteCount > 0
    && Number.isSafeInteger(entry.appendedSuiteCount) && entry.appendedSuiteCount > 0;
}

function exactRecoveryShape(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).sort().join("\0") === "entries\0schema"
    && value.schema === RECOVERY_SCHEMA && Array.isArray(value.entries)
    && value.entries.length === 1 && exactEntryShape(value.entries[0]);
}

function validIdentity(row) {
  return row !== null && typeof row === "object" && !Array.isArray(row)
    && typeof row.name === "string" && row.name.length > 0
    && typeof row.file === "string" && row.file.length > 0;
}

/**
 * Pure witness check. Production passes integrationVerified only after the
 * canonical verifier validates committed policy and the public signed receipt.
 */
export function evaluateSignedHistoryRestoration({
  entry, integrationCommit, integrationParent, parentRegistryBlobOid,
  defectRegistryBlobOid, parentBytes, defectBytes, candidateBytes,
  integrationVerified = false,
} = {}) {
  if (!exactEntryShape(entry) || integrationVerified !== true
    || integrationCommit !== entry.integrationCommit
    || integrationParent !== entry.integrationParent
    || parentRegistryBlobOid !== entry.parentRegistryBlobOid
    || defectRegistryBlobOid !== entry.defectRegistryBlobOid) {
    return fail("VSA-RECOVERY-AUTHORIZATION");
  }
  const parent = parseRegistry(parentBytes);
  const defect = parseRegistry(defectBytes);
  const candidate = parseRegistry(candidateBytes);
  const priorCount = entry.priorSuiteCount;
  const addedCount = entry.appendedSuiteCount;
  if (!parent || !defect || !candidate || parent.suites.length !== priorCount
    || defect.suites.length !== priorCount + addedCount
    || candidate.suites.length < priorCount + addedCount) return fail("VSA-RECOVERY-SHAPE");

  const priorKeys = parent.suites.map(canonical);
  const defectKeys = defect.suites.map(canonical);
  const priorSet = new Set(priorKeys);
  if (priorSet.size !== priorKeys.length || new Set(defectKeys).size !== defectKeys.length) {
    return fail("VSA-RECOVERY-DUPLICATE-ROW");
  }
  const retained = defect.suites.filter((row) => priorSet.has(canonical(row)));
  const additions = defect.suites.filter((row) => !priorSet.has(canonical(row)));
  if (retained.length !== priorCount || additions.length !== addedCount
    || new Set(retained.map(canonical)).size !== priorSet.size
    || priorKeys.every((key, index) => defectKeys[index] === key)) {
    return fail("VSA-RECOVERY-NOT-ORDERING-ONLY");
  }
  if ([...defect.suites, ...candidate.suites].some((row) => !validIdentity(row))) {
    return fail("VSA-RECOVERY-ENTRY");
  }
  const candidateNames = new Set();
  const candidateFiles = new Set();
  for (const row of candidate.suites) {
    if (candidateNames.has(row.name) || candidateFiles.has(row.file)) {
      return fail("VSA-RECOVERY-DUPLICATE-IDENTITY");
    }
    candidateNames.add(row.name);
    candidateFiles.add(row.file);
  }

  const restoredBytes = registryBytes([...parent.suites, ...additions]);
  const restored = parseRegistry(restoredBytes);
  if (!restored || candidate.suites.slice(0, restored.suites.length)
    .some((row, index) => canonical(row) !== canonical(restored.suites[index]))) {
    return fail("VSA-RECOVERY-CANDIDATE-MISMATCH");
  }
  if (candidate.suites.length > restored.suites.length) {
    const suffix = evaluateVerifySuiteAppend({ beforeBytes: restoredBytes, afterBytes: candidateBytes });
    if (!suffix.ok) return fail("VSA-RECOVERY-SUFFIX-NOT-APPEND");
  }
  return {
    ok: true,
    code: "VSA-RECOVERY-VERIFIED",
    restoredBytes,
    priorSuiteCount: priorCount,
    appendedSuiteCount: addedCount,
    futureAppendCount: candidate.suites.length - restored.suites.length,
  };
}

function readRecovery(root, read) {
  try {
    const value = parseStrictJson(read(resolve(root, RECOVERY), "utf8"));
    return exactRecoveryShape(value) ? value.entries[0] : null;
  } catch { return null; }
}

function bindRecovery({ root, run, candidateBytes, entry }) {
  if (!entry) return null;
  try {
    const ancestry = run(["rev-list", "--parents", "-n", "1", entry.integrationCommit])
      .trim().split(/\s+/u);
    if (ancestry.length !== 2 || ancestry[0] !== entry.integrationCommit
      || ancestry[1] !== entry.integrationParent) return null;
    const parentBlob = run(["rev-parse", entry.integrationParent + ":" + REGISTRY]).trim();
    const defectBlob = run(["rev-parse", entry.integrationCommit + ":" + REGISTRY]).trim();
    if (parentBlob !== entry.parentRegistryBlobOid || defectBlob !== entry.defectRegistryBlobOid) return null;
    const parentBytes = run(["show", entry.integrationParent + ":" + REGISTRY]);
    const defectBytes = run(["show", entry.integrationCommit + ":" + REGISTRY]);
    const proof = verifyQualityPackageIntegrationPostCommit({
      repoRoot: root,
      commitSha: entry.integrationCommit,
      intentSha256: entry.integrationIntentSha256,
    });
    const result = evaluateSignedHistoryRestoration({
      entry, integrationCommit: entry.integrationCommit, integrationParent: ancestry[1],
      parentRegistryBlobOid: parentBlob, defectRegistryBlobOid: defectBlob,
      parentBytes, defectBytes, candidateBytes, integrationVerified: proof.ok === true,
    });
    return result.ok ? { entry, parentBytes, defectBytes, ...result } : null;
  } catch { return null; }
}

/** Check all first-parent registry edits, then the committed-to-worktree delta. */
export function checkVerifySuiteAppend({ rootDir, git = null, read = readFileSync } = {}) {
  if (typeof rootDir !== "string") return fail("VSA-ROOT");
  const root = resolve(rootDir);
  const run = git ?? ((args) => execFileSync("git", ["-C", root, ...args],
    { encoding: "utf8", timeout: 10000, stdio: ["ignore", "pipe", "ignore"] }));
  const show = (revision, path) => run(["show", revision + ":" + path]);
  try {
    const currentConfig = read(resolve(root, CONFIG), "utf8");
    if (!hasTp13(currentConfig)) return fail("VSA-TP13-ABSENT");
    const head = run(["rev-parse", "--verify", "HEAD^{commit}"]).trim();
    if (!OID.test(head)) return fail("VSA-HEAD");
    const worktree = read(resolve(root, REGISTRY), "utf8");
    const entry = readRecovery(root, read);
    const recovery = bindRecovery({ root, run, candidateBytes: worktree, entry });
    const configCommits = run(["log", "--first-parent", "--reverse", "--format=%H", "--", CONFIG])
      .trim().split("\n").filter(Boolean);
    let introduction = null;
    for (const commit of configCommits) {
      if (!OID.test(commit)) return fail("VSA-HISTORY-SHAPE");
      if (hasTp13(show(commit, CONFIG))) { introduction = commit; break; }
    }
    if (introduction === null) {
      const before = show(head, REGISTRY);
      if (before === worktree) return { ok: true, code: "VSA-UNCOMMITTED-INTRODUCTION", checked: 0, appended: 0 };
      const result = evaluateVerifySuiteAppend({ beforeBytes: before, afterBytes: worktree });
      if (result.ok) return { ok: true, code: "VSA-UNCOMMITTED-INTRODUCTION", checked: 1, appended: result.appended };
      if (recovery?.ok && before === recovery.defectBytes && worktree === recovery.restoredBytes) {
        return { ok: true, code: "VSA-UNCOMMITTED-SIGNED-RESTORATION", checked: 1, appended: recovery.appendedSuiteCount };
      }
      return fail(result.code, "uncommitted TP-13 registration postimage");
    }
    const commits = run(["rev-list", "--first-parent", "--reverse",
      introduction + "^.." + head, "--", REGISTRY]).trim().split("\n").filter(Boolean);
    let checked = 0;
    let integrationWitnessSeen = false;
    for (const commit of commits) {
      if (!OID.test(commit)) return fail("VSA-HISTORY-SHAPE");
      const before = show(commit + "^", REGISTRY);
      const after = show(commit, REGISTRY);
      const result = evaluateVerifySuiteAppend({ beforeBytes: before, afterBytes: after });
      if (!result.ok) {
        if (recovery?.ok && commit === recovery.entry.integrationCommit
          && before === recovery.parentBytes && after === recovery.defectBytes) {
          integrationWitnessSeen = true;
        } else if (recovery?.ok && integrationWitnessSeen
          && before === recovery.defectBytes && after === recovery.restoredBytes) {
          // This is the one exact defect-to-restoration transition. Any other
          // historical failure remains subject to the original prefix policy.
        } else {
          return fail(result.code, commit);
        }
      }
      checked += 1;
    }
    const committed = show(head, REGISTRY);
    if (committed !== worktree) {
      const result = evaluateVerifySuiteAppend({ beforeBytes: committed, afterBytes: worktree });
      if (!result.ok && !(recovery?.ok && integrationWitnessSeen
        && committed === recovery.defectBytes)) return fail(result.code, "worktree");
      checked += 1;
    }
    return {
      ok: true,
      code: recovery?.ok ? "VSA-HISTORY-APPEND-ONLY-SIGNED-RESTORATION" : "VSA-HISTORY-APPEND-ONLY",
      checked,
    };
  } catch (error) {
    return fail("VSA-UNAVAILABLE", error?.code ?? error?.message ?? "unknown");
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = checkVerifySuiteAppend({ rootDir: resolve(fileURLToPath(new URL("../..", import.meta.url))) });
  process.stdout.write(JSON.stringify(result) + "\n");
  if (!result.ok) process.exitCode = 1;
}
