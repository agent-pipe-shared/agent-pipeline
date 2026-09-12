// SPDX-License-Identifier: SUL-1.0

import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  lstatSync,
  linkSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";

import { prepareRoleDispatchBatch } from "./role-dispatch-preflight.mjs";

export const AGY_NATIVE_BATCH_ARTIFACT_SCHEMA = "pipeline.antigravity-native-dispatch-batch.v1";
export const AGY_NATIVE_BATCH_PREPARATION_SCHEMA = "pipeline.antigravity-native-dispatch-preparation.v1";
export const AGY_NATIVE_BATCH_VERDICT_SCHEMA = "pipeline.antigravity-native-dispatch-verdict.v1";

const SHA256 = /^[a-f0-9]{64}$/u;
const OID = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u;
const MAX_ARTIFACT_BYTES = 1024 * 1024;
const DEFAULT_TTL_MS = 10 * 60 * 1000;
const ARTIFACT_KEYS = ["artifactSha256", "candidate", "expiresAtEpochMs", "nativeSubagents", "packets", "repositoryRootSha256", "schema"];
const ENTRY_KEYS = new Set(["Prompt", "Role", "TypeName"]);

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const exactKeys = (value, keys) => value !== null && typeof value === "object" && !Array.isArray(value)
  && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());

function rejected(code, field = null) {
  return { schema: AGY_NATIVE_BATCH_VERDICT_SCHEMA, status: "rejected", code, field, modelCalls: 0, launcherCalls: 0 };
}

function git(root, args) {
  try {
    return String(execFileSync("git", args, {
      cwd: root,
      encoding: "utf8",
      shell: false,
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 5_000,
      maxBuffer: 1024 * 1024,
    })).trim();
  } catch { return null; }
}

function repositoryState(root) {
  let physicalRoot;
  try { physicalRoot = realpathSync(resolve(root)); }
  catch { return null; }
  const commonRaw = git(physicalRoot, ["rev-parse", "--path-format=absolute", "--git-common-dir"]);
  const head = git(physicalRoot, ["rev-parse", "--verify", "HEAD"]);
  const tree = head === null ? null : git(physicalRoot, ["rev-parse", `${head}^{tree}`]);
  if (commonRaw === null || !OID.test(head ?? "") || !OID.test(tree ?? "")) return null;
  try {
    const commonDir = realpathSync(resolve(commonRaw));
    return { physicalRoot, commonDir, head, tree };
  } catch { return null; }
}

function validNativeSubagents(value) {
  return Array.isArray(value) && value.length > 0 && value.length <= 64
    && value.every((entry) => entry !== null && typeof entry === "object" && !Array.isArray(entry)
      && Object.keys(entry).every((key) => ENTRY_KEYS.has(key))
      && Object.keys(entry).includes("TypeName") && Object.keys(entry).includes("Prompt")
      && typeof entry.TypeName === "string" && entry.TypeName.trim() === entry.TypeName && entry.TypeName !== ""
      && typeof entry.Prompt === "string" && entry.Prompt.trim() !== ""
      && (!Object.hasOwn(entry, "Role") || (typeof entry.Role === "string" && entry.Role.trim() === entry.Role && entry.Role !== "")));
}

function bareRole(value) {
  return typeof value === "string" && value.startsWith("pipeline-core:")
    ? value.slice("pipeline-core:".length)
    : value;
}

function entriesMatchPackets(nativeSubagents, packets) {
  return nativeSubagents.length === packets.length && nativeSubagents.every((entry, index) => (
    bareRole(entry.TypeName) === bareRole(packets[index]?.role)
    && entry.Prompt === packets[index]?.prompt
  ));
}

function artifactBody({ state, nativeSubagents, packets, expiresAtEpochMs }) {
  return {
    schema: AGY_NATIVE_BATCH_ARTIFACT_SCHEMA,
    repositoryRootSha256: sha256(state.physicalRoot),
    candidate: { commit: state.head, tree: state.tree },
    expiresAtEpochMs,
    nativeSubagents: structuredClone(nativeSubagents),
    packets: structuredClone(packets),
  };
}

function artifactDirectory(commonDir) {
  return join(commonDir, "agent-pipeline", "run", "antigravity-native-dispatch-batches");
}

function artifactPath(commonDir, nativeSubagents, physicalRoot) {
  return join(artifactDirectory(commonDir), `${sha256(physicalRoot)}-${sha256(JSON.stringify(nativeSubagents))}.json`);
}

/**
 * Prepare, but never launch, one native Antigravity invoke_subagent batch.
 * The caller passes the returned Subagents array unchanged to the runner's built-in tool.
 */
export function prepareAntigravityNativeDispatch({ root, packets, nativeSubagents, nowEpochMs = Date.now(), ttlMs = DEFAULT_TTL_MS } = {}) {
  const state = repositoryState(root);
  if (state === null) return rejected("AGY-NATIVE-ROOT", "root");
  if (!validNativeSubagents(nativeSubagents)) return rejected("AGY-NATIVE-SUBAGENTS", "nativeSubagents");
  if (!Number.isSafeInteger(nowEpochMs) || nowEpochMs < 0 || !Number.isSafeInteger(ttlMs) || ttlMs < 1_000 || ttlMs > DEFAULT_TTL_MS) {
    return rejected("AGY-NATIVE-TTL", "ttlMs");
  }
  const batch = prepareRoleDispatchBatch({ root: state.physicalRoot, packets });
  if (batch.status !== "prepared") return { ...rejected(batch.code, "packets"), preparation: batch };
  if (packets.some((packet) => packet.transport !== "antigravity" || packet.resultDestination?.kind !== "return")) {
    return rejected("AGY-NATIVE-PACKET-BOUNDARY", "packets");
  }
  if (packets.some((packet) => packet.candidate.commit !== state.head || packet.candidate.tree !== state.tree)) {
    return rejected("AGY-NATIVE-CANDIDATE", "packets.candidate");
  }
  if (!entriesMatchPackets(nativeSubagents, packets)) return rejected("AGY-NATIVE-ARRAY-MISMATCH", "nativeSubagents");

  const body = artifactBody({ state, nativeSubagents, packets, expiresAtEpochMs: nowEpochMs + ttlMs });
  const artifact = { ...body, artifactSha256: sha256(JSON.stringify(body)) };
  const directory = artifactDirectory(state.commonDir);
  const path = artifactPath(state.commonDir, nativeSubagents, state.physicalRoot);
  const temporary = join(directory, `.${randomUUID()}.tmp`);
  try {
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    writeFileSync(temporary, `${JSON.stringify(artifact)}\n`, { encoding: "utf8", flag: "wx", mode: 0o600 });
    try { linkSync(temporary, path); }
    catch (error) {
      return rejected(error?.code === "EEXIST" ? "AGY-NATIVE-ARTIFACT-EXISTS" : "AGY-NATIVE-ARTIFACT-WRITE", "artifact");
    }
  } catch {
    return rejected("AGY-NATIVE-ARTIFACT-WRITE", "artifact");
  } finally {
    try { unlinkSync(temporary); } catch { /* canonical link, if published, owns the bytes */ }
  }
  return {
    schema: AGY_NATIVE_BATCH_PREPARATION_SCHEMA,
    status: "prepared",
    code: "AGY-NATIVE-PREPARED",
    artifactSha256: artifact.artifactSha256,
    nativeSubagentsSha256: sha256(JSON.stringify(nativeSubagents)),
    invocation: { Subagents: structuredClone(nativeSubagents) },
    modelCalls: 0,
    launcherCalls: 0,
  };
}

/** Validate the exact native call against its candidate-bound prepared artifact. */
export function verifyAntigravityNativeDispatch({ root, nativeSubagents, nowEpochMs = Date.now() } = {}) {
  const state = repositoryState(root);
  if (state === null) return rejected("AGY-NATIVE-ROOT", "root");
  if (!validNativeSubagents(nativeSubagents)) return rejected("AGY-NATIVE-SUBAGENTS", "Subagents");
  const path = artifactPath(state.commonDir, nativeSubagents, state.physicalRoot);
  const claimedPath = join(dirname(path), `.${randomUUID()}.consume`);
  let raw;
  try {
    // Claim-before-read makes the authorization one-shot. Only one concurrent hook can move
    // the canonical name; every replay observes a missing artifact and reaches no launcher.
    renameSync(path, claimedPath);
    const stat = lstatSync(claimedPath);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size < 2 || stat.size > MAX_ARTIFACT_BYTES || realpathSync(claimedPath) !== resolve(claimedPath)) {
      return rejected("AGY-NATIVE-ARTIFACT-FILE", "artifact");
    }
    raw = readFileSync(claimedPath, "utf8");
  } catch { return rejected("AGY-NATIVE-ARTIFACT-MISSING", "artifact"); }
  finally {
    try { unlinkSync(claimedPath); } catch { /* absent before claim or already removed */ }
  }

  let artifact;
  try { artifact = JSON.parse(raw); }
  catch { return rejected("AGY-NATIVE-ARTIFACT-MALFORMED", "artifact"); }
  if (!exactKeys(artifact, ARTIFACT_KEYS) || artifact.schema !== AGY_NATIVE_BATCH_ARTIFACT_SCHEMA
    || !SHA256.test(artifact.artifactSha256 ?? "") || !SHA256.test(artifact.repositoryRootSha256 ?? "")
    || !Number.isSafeInteger(artifact.expiresAtEpochMs) || !exactKeys(artifact.candidate, ["commit", "tree"])) {
    return rejected("AGY-NATIVE-ARTIFACT-SHAPE", "artifact");
  }
  const { artifactSha256, ...body } = artifact;
  if (sha256(JSON.stringify(body)) !== artifactSha256) return rejected("AGY-NATIVE-ARTIFACT-DIGEST", "artifactSha256");
  if (artifact.repositoryRootSha256 !== sha256(state.physicalRoot)) return rejected("AGY-NATIVE-ARTIFACT-ROOT", "repositoryRootSha256");
  if (artifact.expiresAtEpochMs < nowEpochMs) return rejected("AGY-NATIVE-ARTIFACT-EXPIRED", "expiresAtEpochMs");
  if (artifact.candidate.commit !== state.head || artifact.candidate.tree !== state.tree) return rejected("AGY-NATIVE-ARTIFACT-STALE", "candidate");
  if (JSON.stringify(artifact.nativeSubagents) !== JSON.stringify(nativeSubagents)) return rejected("AGY-NATIVE-ARRAY-MUTATED", "Subagents");
  if (!entriesMatchPackets(nativeSubagents, artifact.packets)) return rejected("AGY-NATIVE-ARRAY-MISMATCH", "Subagents");

  const batch = prepareRoleDispatchBatch({ root: state.physicalRoot, packets: artifact.packets });
  if (batch.status !== "prepared") return { ...rejected("AGY-NATIVE-BATCH-STALE", "packets"), preparation: batch };
  if (artifact.packets.some((packet) => packet.transport !== "antigravity" || packet.resultDestination?.kind !== "return"
    || packet.candidate.commit !== state.head || packet.candidate.tree !== state.tree)) {
    return rejected("AGY-NATIVE-PACKET-BOUNDARY", "packets");
  }
  return {
    schema: AGY_NATIVE_BATCH_VERDICT_SCHEMA,
    status: "prepared",
    code: "AGY-NATIVE-PREPARED",
    artifactSha256,
    packets: structuredClone(artifact.packets),
    nativeSubagents: structuredClone(nativeSubagents),
    workspace: state.physicalRoot,
    modelCalls: 0,
    launcherCalls: 0,
  };
}

export const antigravityNativeDispatchInternals = Object.freeze({
  artifactPath,
  artifactDirectory,
  sha256,
});
