// SPDX-License-Identifier: SUL-1.0
/** Private local evidence binding Claude/Codex native returns to host Git commits. */
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { lstatSync, realpathSync } from "node:fs";
import { resolve } from "node:path";
import { canonicalizeJson, parseStrictJson } from "./governance-event.mjs";
import { declaredPaths, reportSha256, validateDispatchRecord } from "./dispatch-record.mjs";
import { nativeGoldfishHostStateInternals } from "./native-goldfish-host-state.mjs";
import { NATIVE_GOLDFISH_RETURN_SCHEMA } from "./native-goldfish-host-return.mjs";

export const NATIVE_GOLDFISH_HOST_OBSERVATION_SCHEMA = "pipeline.native-goldfish-host-observation.v1";
export const NATIVE_GOLDFISH_CODEX_HOST_OBSERVATION_SCHEMA = "pipeline.native-goldfish-host-observation.v2";
const SHA = /^[a-f0-9]{64}$/u;
const OID = /^[a-f0-9]{40}(?:[a-f0-9]{24})?$/u;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const HOST_MARKER = (runner, version = 1) => `Native-Host-Observed: v${version} (${runner})`;
const KEYS = ["schema", "runner", "dispatchId", "sessionId", "toolUseId", "agentId", "candidateCommit",
  "candidateTree", "role", "model", "effort", "rulesetSha", "allowedPaths", "resultSha256",
  "reportSha256", "commit", "parent", "tree", "changedPaths", "hostMarker", "assurance",
  "recordSha256"];
const exact = (value, keys) => value !== null && typeof value === "object" && !Array.isArray(value)
  && Object.keys(value).sort().join(",") === [...keys].sort().join(",");
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
export const nativeAuthoredRecordBytes = (record) => Buffer.from(`${JSON.stringify(record, null, 2)}\n`, "utf8");
function normalizedPath(path) { return typeof path === "string" && path.length > 0 && path.length <= 240
  && !/[\\\0\r\n]/u.test(path) && !path.startsWith("/") && !/^[A-Za-z]:/u.test(path)
  && path.split("/").every((part) => part && part !== "." && part !== ".." && part !== ".git"); }
function fail(code) { return { ok: false, code }; }

function recordMatches(receipt, record, bytes) {
  try { validateDispatchRecord(record); } catch { return false; }
  return Buffer.isBuffer(bytes) && hash(bytes) === receipt.recordSha256
    && bytes.equals(nativeAuthoredRecordBytes(record))
    && record.schema === "pipeline.dispatch-record.v4" && record.runner === receipt.runner
    && record.taskId === receipt.dispatchId && record.agentType === receipt.role.slice("pipeline-core:".length)
    && record.model === receipt.model && record.effort === receipt.effort
    && record.rulesetSha === receipt.rulesetSha && record.candidateCommit === receipt.commit
    && record.resultSha256 === receipt.reportSha256 && reportSha256(record.report?.text) === receipt.reportSha256
    && record.outcomeClassification?.kind === "authored-commit"
    && record.commits.length === 1 && record.commits[0] === receipt.commit
    && receipt.resultSha256 === hash(Buffer.from(canonicalizeJson({
      schema: NATIVE_GOLDFISH_RETURN_SCHEMA, dispatchId: receipt.dispatchId,
      candidateCommit: receipt.candidateCommit, outcome: "succeeded",
      report: record.report.text, changedPaths: receipt.changedPaths,
    }), "utf8"))
    && [...(declaredPaths(record) ?? [])].sort().join("\0") === receipt.changedPaths.join("\0");
}

export function validateNativeGoldfishHostObservation(receipt, { record = null, recordBytes = null } = {}) {
  const version = receipt?.schema === NATIVE_GOLDFISH_CODEX_HOST_OBSERVATION_SCHEMA ? 2 : 1;
  const keys = version === 2 ? [...KEYS.slice(0, 8), "nativeAgentType", ...KEYS.slice(8)] : KEYS;
  if (!exact(receipt, [...keys, "receiptSha256"])) return false;
  const { receiptSha256, ...subject } = receipt;
  if (subject.schema !== (version === 2 ? NATIVE_GOLDFISH_CODEX_HOST_OBSERVATION_SCHEMA : NATIVE_GOLDFISH_HOST_OBSERVATION_SCHEMA)
    || !["claude", "codex"].includes(subject.runner)
    || (version === 2 && (subject.runner !== "codex" || subject.nativeAgentType !== "worker"))
    || !ID.test(subject.dispatchId ?? "") || !ID.test(subject.sessionId ?? "")
    || !ID.test(subject.toolUseId ?? "")
    || (subject.runner === "codex" ? !ID.test(subject.agentId ?? "") : subject.agentId !== null)
    || !OID.test(subject.candidateCommit ?? "") || !OID.test(subject.candidateTree ?? "")
    || !OID.test(subject.commit ?? "") || subject.commit === subject.candidateCommit
    || subject.parent !== subject.candidateCommit || !OID.test(subject.tree ?? "")
    || typeof subject.role !== "string" || !["pipeline-core:goldfish-implementor", "pipeline-core:goldfish-mechanic"].includes(subject.role)
    || typeof subject.model !== "string" || subject.model.length === 0
    || typeof subject.effort !== "string" || subject.effort.length === 0
    || !SHA.test(subject.rulesetSha ?? "") || !Array.isArray(subject.allowedPaths)
    || subject.allowedPaths.length === 0 || subject.allowedPaths.length > 64
    || !subject.allowedPaths.every(normalizedPath) || new Set(subject.allowedPaths).size !== subject.allowedPaths.length
    || !SHA.test(subject.resultSha256 ?? "") || !SHA.test(subject.reportSha256 ?? "")
    || subject.resultSha256 === subject.reportSha256
    || !Array.isArray(subject.changedPaths) || subject.changedPaths.length === 0 || subject.changedPaths.length > 64
    || !subject.changedPaths.every(normalizedPath) || new Set(subject.changedPaths).size !== subject.changedPaths.length
    || [...subject.changedPaths].sort().join("\0") !== subject.changedPaths.join("\0")
    || !subject.changedPaths.every((path) => subject.allowedPaths.includes(path))
    || subject.hostMarker !== HOST_MARKER(subject.runner, version)
    || subject.assurance !== (subject.runner === "claude"
      ? "host-observed-tool-use-and-resolved-model-not-provider-attested"
      : version === 2 ? "host-observed-subagent-start-stop-native-worker-and-session-route-not-provider-attested"
        : "host-observed-subagent-start-stop-and-configured-route-not-provider-attested")
    || !SHA.test(subject.recordSha256 ?? "") || !SHA.test(receiptSha256 ?? "")) return false;
  try { if (receiptSha256 !== hash(canonicalizeJson(subject))) return false; } catch { return false; }
  return record === null && recordBytes === null || !!record && recordMatches(subject, record, recordBytes);
}

export function draftNativeGoldfishHostObservation({ state, observation, commitReadback, record } = {}) {
  if (!state || !["claude", "codex"].includes(state.runner)
    || observation?.ok !== true || observation.runner !== state.runner
    || observation.code !== "NGHR-FINAL-VALIDATED"
    || !exact(commitReadback, ["ok", "code", "commit", "parent", "tree", "paths"])
    || commitReadback.ok !== true || commitReadback.code !== "NATIVE-HOST-COMMIT-READBACK-VERIFIED") {
    return fail("NGHO-DRAFT-INPUT");
  }
  const version = state.binding.adapterVersion === 2 ? 2 : 1;
  const subject = { schema: version === 2 ? NATIVE_GOLDFISH_CODEX_HOST_OBSERVATION_SCHEMA : NATIVE_GOLDFISH_HOST_OBSERVATION_SCHEMA,
    runner: state.runner, dispatchId: state.binding.dispatchId, sessionId: state.sessionId,
    toolUseId: state.toolUseId, agentId: state.agentId,
    ...(version === 2 ? { nativeAgentType: state.binding.nativeAgentType } : {}),
    candidateCommit: state.binding.candidateCommit, candidateTree: state.binding.candidateTree,
    role: state.binding.role, model: state.binding.model, effort: state.binding.effort,
    rulesetSha: state.binding.rulesetSha, allowedPaths: [...state.binding.allowedPaths].sort(),
    resultSha256: observation.final.resultSha256,
    reportSha256: observation.final.reportSha256,
    commit: commitReadback.commit, parent: commitReadback.parent, tree: commitReadback.tree,
    changedPaths: [...commitReadback.paths].sort(), hostMarker: HOST_MARKER(state.runner, version),
    assurance: state.runner === "claude"
      ? "host-observed-tool-use-and-resolved-model-not-provider-attested"
      : version === 2 ? "host-observed-subagent-start-stop-native-worker-and-session-route-not-provider-attested"
        : "host-observed-subagent-start-stop-and-configured-route-not-provider-attested",
    recordSha256: hash(nativeAuthoredRecordBytes(record)) };
  const receipt = { ...subject, receiptSha256: hash(canonicalizeJson(subject)) };
  return validateNativeGoldfishHostObservation(receipt, { record, recordBytes: nativeAuthoredRecordBytes(record) })
    ? { ok: true, code: "NGHO-DRAFT-READY", receipt, authority: "unverified-until-private-readback" }
    : fail("NGHO-DRAFT-BINDING");
}

function git(root, args) {
  const run = spawnSync("git", ["-C", root, ...args], { encoding: "utf8", shell: false,
    timeout: 10_000, maxBuffer: 1024 * 1024,
    env: Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^GIT_/iu.test(key))) });
  return run.error || run.status !== 0 ? null : run.stdout;
}
function sortedPaths(output) { return output === null ? null : output.split("\0").filter(Boolean).sort(); }

/** Local-only verification. A clean clone without the private receipt cannot PASS. */
export function inspectNativeGoldfishHostObservation({ root, taskId, record, recordBytes } = {}) {
  if (typeof root !== "string" || !ID.test(taskId ?? "") || !record || !Buffer.isBuffer(recordBytes)) return fail("NGHO-INPUT");
  let physical;
  try { physical = realpathSync(resolve(root)); const stat = lstatSync(physical); if (!stat.isDirectory() || stat.isSymbolicLink()) return fail("NGHO-ROOT"); }
  catch { return fail("NGHO-ROOT"); }
  let commonDir;
  try { commonDir = nativeGoldfishHostStateInternals.git(physical, ["rev-parse", "--path-format=absolute", "--git-common-dir"]); }
  catch { commonDir = null; }
  if (!commonDir) return fail("NGHO-COMMON-DIR");
  let parsed;
  try { parsed = realpathSync(commonDir.trim()); } catch { return fail("NGHO-COMMON-DIR"); }
  let stored;
  try { stored = nativeGoldfishHostStateInternals.readPrivate(parsed,
    nativeGoldfishHostStateInternals.key("observation", record.runner, `${record.taskId}\0${record.candidateCommit}`)); }
  catch { return fail("NGHO-OBSERVATION-MISSING"); }
  const receipt = stored.value;
  if (receipt.dispatchId !== taskId || !validateNativeGoldfishHostObservation(receipt, { record, recordBytes })) return fail("NGHO-OBSERVATION-BINDING");
  const commit = git(physical, ["rev-parse", "--verify", `${receipt.commit}^{commit}`])?.trim();
  const candidateTree = git(physical, ["rev-parse", "--verify", `${receipt.candidateCommit}^{tree}`])?.trim();
  const parent = git(physical, ["rev-parse", "--verify", `${receipt.commit}^`])?.trim();
  const tree = git(physical, ["rev-parse", "--verify", `${receipt.commit}^{tree}`])?.trim();
  const paths = sortedPaths(git(physical, ["diff-tree", "--no-commit-id", "--name-only", "-r", "-z", receipt.commit]));
  const object = git(physical, ["cat-file", "commit", receipt.commit]);
  const boundary = object?.indexOf("\n\n") ?? -1;
  const message = boundary < 0 ? null : object.slice(boundary + 2);
  if (commit !== receipt.commit || candidateTree !== receipt.candidateTree
    || parent !== receipt.parent || tree !== receipt.tree
    || !paths || paths.join("\0") !== receipt.changedPaths.join("\0")
    || !message?.split("\n").includes(receipt.hostMarker)
    || !message.split("\n").includes(`Dispatch: ${receipt.dispatchId} (goldfish)`)) return fail("NGHO-GIT-READBACK");
  return { ok: true, code: "NGHO-LOCAL-READBACK-VERIFIED", authority: "host-observed-local",
    runner: receipt.runner, assurance: receipt.assurance, receiptSha256: stored.sha256 };
}

export function persistNativeGoldfishHostObservation({ commonDir, receipt, record, recordBytes } = {}) {
  if (!validateNativeGoldfishHostObservation(receipt, { record, recordBytes })) return fail("NGHO-STORE-BINDING");
  try {
    return nativeGoldfishHostStateInternals.writeExclusive(commonDir,
      nativeGoldfishHostStateInternals.key("observation", receipt.runner, `${receipt.dispatchId}\0${record.candidateCommit}`), receipt);
  } catch { return fail("NGHO-STORE-UNAVAILABLE"); }
}

export function readNativeGoldfishHostObservation({ commonDir, taskId, candidateCommit, record, recordBytes } = {}) {
  if (!ID.test(taskId ?? "") || !OID.test(candidateCommit ?? "")) return fail("NGHO-READ-INPUT");
  for (const runner of ["claude", "codex"]) {
    try {
      const stored = nativeGoldfishHostStateInternals.readPrivate(commonDir,
        nativeGoldfishHostStateInternals.key("observation", runner, `${taskId}\0${candidateCommit}`));
      if (!validateNativeGoldfishHostObservation(stored.value, { record, recordBytes })) return fail("NGHO-READ-BINDING");
      return { ok: true, code: "NGHO-PRIVATE-RECEIPT-READ", receipt: stored.value, sha256: stored.sha256 };
    } catch { /* try the other fixed runner path */ }
  }
  return fail("NGHO-READ-MISSING");
}
