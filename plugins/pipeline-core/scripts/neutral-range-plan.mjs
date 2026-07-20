#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  lstatSync, mkdtempSync, readFileSync, realpathSync, rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";

export const RANGE_SCHEMA = "pipeline.neutral-range-plan.v1";
export const EXCLUSION_SCHEMA = "pipeline.neutral-exclusion-review.v1";
export const LEAKAGE_SCHEMA = "pipeline.neutral-leakage-policy.v1";
export const NEUTRAL_IDENTITY = "Agent Pipeline Public <agent-pipeline-public@users.noreply.github.com>";
export const NEUTRAL_MESSAGE = "chore(public): synchronisiert freigegebene Artefakte\n";
export const PLUMBING_COMMANDS = Object.freeze([
  ["git", "read-tree"], ["git", "hash-object", "-w", "--stdin", "--no-filters"],
  ["git", "update-index", "-z", "--index-info"], ["git", "write-tree"], ["git", "commit-tree"],
]);
const EXPECTED_LEAKAGE_POLICY = Object.freeze({
  schema: LEAKAGE_SCHEMA,
  rules: [
    { id: "url-scheme", deny: ["ssh", "file"], allowance: false },
    { id: "url-host", deny: ["localhost", "loopback", "rfc1918", "link-local", "unc"], allowance: "exact-reviewed-hash" },
    { id: "credential", contract: "gitleaks-finding", allowance: false },
    { id: "absolute-path", deny: ["posix-home", "macos-users", "drive-root", "unc"], allowance: false },
    { id: "private-path", denyInput: "plan.machineDenySet", allowance: false },
    { id: "identity", denyInput: "plan.machineDenySet", allowance: false },
    { id: "correlation-trailer", deny: ["Provider", "Model", "Session", "Account", "Trace", "Dispatch"], allowance: false },
  ],
});

const HEX40_64 = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const HEX64 = /^[0-9a-f]{64}$/;
const MODES = new Set(["100644", "100755"]);
const MAX_GIT_OUTPUT = 64 * 1024 * 1024;
const GIT_TIMEOUT_MS = 20_000;
const PLAN_KEYS = [
  "schema", "sourceRepositoryFingerprint", "publicRepositoryFingerprint", "sourceBaseCommit", "sourceBaseTree",
  "sourceCandidateCommit", "sourceCandidateTree", "publicBaseCommit", "publicBaseTree", "publicBaseCommitterEpoch",
  "sourceDelta", "operations", "exclusions", "transformRecords", "publicBaseManifest", "resultManifest",
  "resultManifestDigest", "exclusionReview", "exclusionReviewDigest", "author", "committer", "authorTimestamp", "committerTimestamp",
  "message", "signed", "commitCount", "parentCommits", "plumbing", "leakagePolicyDigest", "machineDenySet",
  "machineDenySetDigest", "allowances", "gitleaksFindings", "generatedPatchSha256", "generatedPatch",
  "resultCommit", "resultTree", "planDigest",
];
const OP_KEYS = {
  add: ["operation", "path", "newMode", "sourceSha256", "publicSha256"],
  modify: ["operation", "path", "oldMode", "newMode", "oldPublicSha256", "sourceSha256", "publicSha256"],
  delete: ["operation", "path", "oldMode", "oldPublicSha256"],
  rename: ["operation", "oldPath", "newPath", "oldMode", "newMode", "oldPublicSha256", "sourceSha256", "publicSha256"],
};

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}
const hashBytes = (value) => createHash("sha256").update(value).digest("hex");
const hashCanonical = (value) => hashBytes(canonical(value));
export const neutralCanonicalDigest = hashCanonical;

function assertKeys(value, expected, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} invalid`);
  const actual = Object.keys(value).sort(), wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) throw new Error(`${label} keys invalid`);
}
function assertHex(value, label, exact64 = false) { if (!(exact64 ? HEX64 : HEX40_64).test(value ?? "")) throw new Error(`${label} invalid`); }
function safePath(path) {
  return typeof path === "string" && path.length > 0 && !path.startsWith("/") && !path.startsWith("\\") && !/^[A-Za-z]:/.test(path) && !/[\u0000-\u001f\u007f]/u.test(path) && !path.split(/[\\/]/).some((part) => part === "" || part === "." || part === "..");
}
function sortedUnique(values, label) {
  if (!Array.isArray(values) || values.some((value) => typeof value !== "string") || new Set(values).size !== values.length || canonical(values) !== canonical([...values].sort())) throw new Error(`${label} must be sorted and unique`);
}
function normalizedValue(value) { return String(value).trim().toLowerCase(); }

function detectLeakFinding(value, deny = []) {
  const text = String(value);
  const forbiddenScheme = text.match(/\b(?:(?:ssh|file):\/\/[^\s"']+|git@[^\s:]+:[^\s"']+)/i);
  if (forbiddenScheme) return { ruleId: "url-scheme", normalizedValue: normalizedValue(forbiddenScheme[0]), allowable: false };
  const unc = text.match(/\\\\[^\\\s]+\\[^\s"']*/);
  if (unc) return { ruleId: "url-host", normalizedValue: normalizedValue(unc[0]), allowable: false };
  const privateUrl = text.match(/https?:\/\/(?:localhost|127(?:\.\d{1,3}){3}|\[?::1\]?|10(?:\.\d{1,3}){3}|192\.168(?:\.\d{1,3}){2}|172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2}|169\.254(?:\.\d{1,3}){2})(?::\d+)?(?:\/[^\s"']*)?/i);
  if (privateUrl) return { ruleId: "url-host", normalizedValue: normalizedValue(privateUrl[0]), allowable: false };
  const publicUrl = text.match(/https?:\/\/[^\s"']+/i);
  if (publicUrl) return { ruleId: "url-host", normalizedValue: normalizedValue(publicUrl[0]), allowable: true };
  const credential = text.match(/(?:password|passwd|token|secret|api[_-]?key)\s*[:=]\s*\S+/i);
  if (credential) return { ruleId: "credential", normalizedValue: normalizedValue(credential[0]), allowable: false };
  const absolutePath = text.match(/(?:\/home\/[^\s"']+|\/Users\/[^\s"']+|[A-Za-z]:\\[^\s"']+|\\\\[^\s"']+)/);
  if (absolutePath) return { ruleId: "absolute-path", normalizedValue: normalizedValue(absolutePath[0]), allowable: false };
  const trailer = text.match(/^(?:Provider|Model|Session|Account|Trace|Dispatch):/im);
  if (trailer) return { ruleId: "correlation-trailer", normalizedValue: normalizedValue(trailer[0]), allowable: false };
  const lower = normalizedValue(text);
  const match = deny.find((needle) => typeof needle === "string" && needle !== "" && lower.includes(normalizedValue(needle)));
  if (match) return { ruleId: String(match).includes("@") ? "identity" : "private-path", normalizedValue: normalizedValue(match), allowable: false };
  return null;
}
export function detectNeutralLeakage(value, deny = []) { return detectLeakFinding(value, deny)?.ruleId ?? null; }

function policyBytes() { return readFileSync(new URL("../../../policies/neutral-leakage-policy.v1.json", import.meta.url)); }
export function neutralLeakagePolicyDigest() {
  const bytes = policyBytes();
  let policy;
  try { policy = JSON.parse(bytes); } catch { throw new Error("neutral leakage policy invalid JSON"); }
  if (canonical(policy) !== canonical(EXPECTED_LEAKAGE_POLICY)) throw new Error("neutral leakage policy contract drift");
  return hashBytes(bytes);
}

function normalizeForPlanDigest(plan) {
  return { ...plan, planDigest: null, exclusionReview: plan.exclusionReview ? { ...plan.exclusionReview, planDigest: null } : null };
}
export function computeNeutralPlanDigest(plan) { return hashCanonical(normalizeForPlanDigest(plan)); }

function validateManifest(entries, label) {
  if (!Array.isArray(entries)) throw new Error(`${label} invalid`);
  const paths = [];
  for (const entry of entries) {
    assertKeys(entry, ["path", "mode", "rawSha256"], `${label} entry`);
    if (!safePath(entry.path) || !MODES.has(entry.mode)) throw new Error(`${label} path/mode invalid`);
    assertHex(entry.rawSha256, `${label}.rawSha256`, true);
    paths.push(entry.path);
  }
  sortedUnique(paths, `${label} paths`);
  return new Map(entries.map((entry) => [entry.path, { mode: entry.mode, rawSha256: entry.rawSha256 }]));
}

function applyOperations(base, operations) {
  const result = new Map(base);
  for (const op of operations) {
    if (!Object.hasOwn(OP_KEYS, op?.operation)) throw new Error("operation invalid");
    assertKeys(op, OP_KEYS[op.operation], `${op.operation} operation`);
    for (const path of [op.path, op.oldPath, op.newPath].filter((value) => value !== undefined)) if (!safePath(path)) throw new Error("operation path invalid");
    for (const mode of [op.oldMode, op.newMode].filter((value) => value !== undefined)) if (!MODES.has(mode)) throw new Error("unsupported mode");
    for (const key of ["oldPublicSha256", "sourceSha256", "publicSha256"].filter((key) => Object.hasOwn(op, key))) assertHex(op[key], `operation.${key}`, true);
    if (Object.hasOwn(op, "sourceSha256") && op.sourceSha256 !== op.publicSha256) throw new Error("included content mismatch");
    if (op.operation === "add") {
      if (result.has(op.path)) throw new Error("add target already exists");
      result.set(op.path, { mode: op.newMode, rawSha256: op.publicSha256 });
    } else if (op.operation === "modify") {
      const old = result.get(op.path);
      if (!old || old.mode !== op.oldMode || old.rawSha256 !== op.oldPublicSha256) throw new Error("modify preimage mismatch");
      result.set(op.path, { mode: op.newMode, rawSha256: op.publicSha256 });
    } else if (op.operation === "delete") {
      const old = result.get(op.path);
      if (!old || old.mode !== op.oldMode || old.rawSha256 !== op.oldPublicSha256) throw new Error("delete preimage mismatch");
      result.delete(op.path);
    } else {
      const old = result.get(op.oldPath);
      if (!old || result.has(op.newPath) || old.mode !== op.oldMode || old.rawSha256 !== op.oldPublicSha256) throw new Error("rename pairing mismatch");
      result.delete(op.oldPath);
      result.set(op.newPath, { mode: op.newMode, rawSha256: op.publicSha256 });
    }
  }
  return result;
}

function mapManifest(map) { return [...map.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([path, value]) => ({ path, ...value })); }

function validateExclusionReview(plan) {
  if (plan.exclusions.length === 0) {
    if (plan.exclusionReview !== null || plan.exclusionReviewDigest !== null) throw new Error("unexpected exclusion review");
    return;
  }
  const review = plan.exclusionReview;
  assertKeys(review, ["schema", "planDigest", "sourceEndpoint", "publicEndpoint", "excluded", "reviewerRoute", "assurance", "candidateTree", "verdict", "findings"], "exclusion review");
  if (review.schema !== EXCLUSION_SCHEMA || review.verdict !== "PASS" || review.planDigest !== plan.planDigest || review.candidateTree !== plan.resultTree || review.sourceEndpoint !== plan.sourceCandidateCommit || review.publicEndpoint !== plan.publicBaseCommit) throw new Error("exclusion review invalid");
  if (!Array.isArray(review.findings) || !Array.isArray(review.excluded) || canonical(review.excluded) !== canonical(plan.exclusions)) throw new Error("exclusion review drift");
  if (plan.exclusionReviewDigest !== hashCanonical({ ...review, planDigest: null })) throw new Error("exclusion review digest mismatch");
  if (typeof review.reviewerRoute !== "string" || review.reviewerRoute === "" || !new Set(["technical-isolation", "contractual-read-only", "prompt-confined"]).has(review.assurance)) throw new Error("exclusion reviewer invalid");
}

function scanLeakage(plan) {
  if (plan.gitleaksFindings.length > 0) throw new Error("leakage:credential");
  const values = [
    plan.message, plan.author, plan.committer, plan.generatedPatch,
    ...plan.operations.flatMap((op) => Object.entries(op).filter(([key]) => ["path", "oldPath", "newPath", "content"].includes(key)).map(([, value]) => value)),
    ...plan.resultManifest.map((entry) => entry.path),
  ];
  for (const surface of values) {
    const fragments = [...new Set([String(surface), ...String(surface).split(/[\s"'()<>{}\[\]]+/).filter(Boolean)])];
    for (const value of fragments) {
      const finding = detectLeakFinding(value, plan.machineDenySet);
      if (!finding) continue;
      const normalizedValueSha256 = hashBytes(finding.normalizedValue);
      const allowed = finding.allowable === true && finding.ruleId === "url-host" && plan.allowances.some((entry) => entry.ruleId === finding.ruleId && entry.normalizedValueSha256 === normalizedValueSha256);
      if (!allowed) throw new Error(`leakage:${finding.ruleId}`);
    }
  }
}

export function validateNeutralRangePlan(plan) {
  assertKeys(plan, PLAN_KEYS, "range plan");
  if (plan.schema !== RANGE_SCHEMA) throw new Error("range schema invalid");
  for (const key of ["sourceRepositoryFingerprint", "publicRepositoryFingerprint", "resultManifestDigest", "leakagePolicyDigest", "machineDenySetDigest", "generatedPatchSha256", "planDigest"]) assertHex(plan[key], key, true);
  for (const key of ["sourceBaseCommit", "sourceBaseTree", "sourceCandidateCommit", "sourceCandidateTree", "publicBaseCommit", "publicBaseTree", "resultCommit", "resultTree"]) assertHex(plan[key], key);
  if (new Set([plan.sourceBaseCommit, plan.sourceBaseTree, plan.sourceCandidateCommit, plan.sourceCandidateTree].map((value) => value.length)).size !== 1
    || new Set([plan.publicBaseCommit, plan.publicBaseTree, plan.resultCommit, plan.resultTree].map((value) => value.length)).size !== 1) throw new Error("repository object format mismatch");
  sortedUnique(plan.sourceDelta, "sourceDelta");
  if (!Array.isArray(plan.operations) || !Array.isArray(plan.exclusions) || !Array.isArray(plan.transformRecords) || plan.transformRecords.length !== 0) throw new Error("Batman v1 transforms forbidden");
  if (!Array.isArray(plan.machineDenySet) || plan.machineDenySet.some((value) => typeof value !== "string" || value === "") || new Set(plan.machineDenySet.map(normalizedValue)).size !== plan.machineDenySet.length) throw new Error("machine deny set invalid");
  if (plan.machineDenySetDigest !== hashCanonical(plan.machineDenySet) || plan.leakagePolicyDigest !== neutralLeakagePolicyDigest()) throw new Error("leakage authority digest mismatch");
  if (!Array.isArray(plan.allowances) || !Array.isArray(plan.gitleaksFindings)) throw new Error("leakage evidence invalid");
  for (const allowance of plan.allowances) { assertKeys(allowance, ["ruleId", "normalizedValueSha256"], "allowance"); if (allowance.ruleId !== "url-host") throw new Error("allowance rule forbidden"); assertHex(allowance.normalizedValueSha256, "allowance digest", true); }
  for (const exclusion of plan.exclusions) { assertKeys(exclusion, ["path", "reason"], "exclusion"); if (!safePath(exclusion.path) || typeof exclusion.reason !== "string" || exclusion.reason.length < 3 || exclusion.reason.length > 240) throw new Error("exclusion invalid"); }
  if (canonical(plan.exclusions) !== canonical([...plan.exclusions].sort((a, b) => a.path.localeCompare(b.path)))) throw new Error("exclusions must be sorted");
  const operationOrder = plan.operations.map((op) => op.operation === "rename" ? `${op.oldPath}\0${op.newPath}` : op.path);
  if (canonical(operationOrder) !== canonical([...operationOrder].sort())) throw new Error("operations must be sorted");
  const included = plan.operations.flatMap((op) => op.operation === "rename" ? [op.oldPath, op.newPath] : [op.path]);
  const excluded = plan.exclusions.map((entry) => entry.path);
  const partition = [...included, ...excluded].sort();
  if (new Set(partition).size !== partition.length || canonical(partition) !== canonical(plan.sourceDelta)) throw new Error("source delta partition incomplete");
  const base = validateManifest(plan.publicBaseManifest, "publicBaseManifest");
  const declaredResult = validateManifest(plan.resultManifest, "resultManifest");
  const derivedResult = applyOperations(base, plan.operations);
  if (canonical(mapManifest(derivedResult)) !== canonical(mapManifest(declaredResult))) throw new Error("complete public tree manifest mismatch");
  if (plan.resultManifestDigest !== hashCanonical(plan.resultManifest)) throw new Error("result manifest digest mismatch");
  if (plan.exclusionReviewDigest !== null) assertHex(plan.exclusionReviewDigest, "exclusionReviewDigest", true);
  validateExclusionReview(plan);
  const expectedEpoch = plan.publicBaseCommitterEpoch + 1;
  if (!Number.isSafeInteger(plan.publicBaseCommitterEpoch) || plan.author !== NEUTRAL_IDENTITY || plan.committer !== NEUTRAL_IDENTITY || plan.authorTimestamp !== expectedEpoch || plan.committerTimestamp !== expectedEpoch || plan.message !== NEUTRAL_MESSAGE || plan.signed !== false || plan.commitCount !== 1 || canonical(plan.parentCommits) !== canonical([plan.publicBaseCommit])) throw new Error("neutral commit metadata invalid");
  assertKeys(plan.plumbing, ["commands", "shell", "privateIndex", "clearedEnvironment", "nullSystemConfig", "nullGlobalConfig", "hooksDisabled", "filtersDisabled", "signingDisabled", "editorDisabled", "pagerDisabled", "credentialHelpersDisabled", "remoteHelpersDisabled", "networkDisabled"], "plumbing");
  if (canonical(plan.plumbing.commands) !== canonical(PLUMBING_COMMANDS) || plan.plumbing.shell !== false || Object.entries(plan.plumbing).filter(([key]) => !["commands", "shell"].includes(key)).some(([, value]) => value !== true)) throw new Error("trusted plumbing contract invalid");
  if (typeof plan.generatedPatch !== "string" || plan.generatedPatchSha256 !== hashBytes(plan.generatedPatch)) throw new Error("generated patch digest mismatch");
  scanLeakage(plan);
  if (plan.planDigest !== computeNeutralPlanDigest(plan)) throw new Error("plan digest mismatch");
  return { ok: true, planDigest: plan.planDigest, resultCommit: plan.resultCommit, resultTree: plan.resultTree, resultManifestDigest: plan.resultManifestDigest };
}

function nullDevice() { return process.platform === "win32" ? "NUL" : "/dev/null"; }

function neutralGitEnvironment(extra = {}) {
  const env = {
    PATH: process.env.PATH,
    SystemRoot: process.env.SystemRoot,
    SYSTEMROOT: process.env.SYSTEMROOT,
    WINDIR: process.env.WINDIR,
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: nullDevice(),
    GIT_CONFIG_COUNT: "0",
    GIT_TERMINAL_PROMPT: "0",
    GIT_ASKPASS: nullDevice(),
    SSH_ASKPASS: nullDevice(),
    GIT_SSH_COMMAND: "false",
    GIT_ALLOW_PROTOCOL: "",
    GIT_NO_REPLACE_OBJECTS: "1",
    GIT_OPTIONAL_LOCKS: "0",
    GIT_PAGER: "cat",
    PAGER: "cat",
    GIT_EDITOR: ":",
    GIT_SEQUENCE_EDITOR: ":",
    LC_ALL: "C",
    LANG: "C",
    ...extra,
  };
  return Object.fromEntries(Object.entries(env).filter(([, value]) => typeof value === "string"));
}

const FIXED_GIT_CONFIG = Object.freeze([
  "-c", `core.hooksPath=${nullDevice()}`,
  "-c", "core.fsmonitor=false",
  "-c", `core.attributesFile=${nullDevice()}`,
  "-c", `core.excludesFile=${nullDevice()}`,
  "-c", "filter.lfs.required=false",
  "-c", "filter.lfs.clean=",
  "-c", "filter.lfs.smudge=cat",
  "-c", "filter.lfs.process=",
  "-c", "commit.gpgSign=false",
  "-c", "tag.gpgSign=false",
  "-c", "user.signingKey=",
  "-c", "credential.helper=",
  "-c", `core.askPass=${nullDevice()}`,
  "-c", "core.editor=:",
  "-c", "sequence.editor=:",
  "-c", "core.pager=cat",
  "-c", "protocol.allow=never",
  "-c", "protocol.file.allow=never",
]);

function neutralFailure(code, phase, mutation = "none") {
  return { ok: false, code, phase, mutation };
}

function physicalRepositoryRoot(root) {
  if (typeof root !== "string" || !isAbsolute(root)) throw new Error("repository root invalid");
  const physical = realpathSync(root);
  if (physical !== resolve(root) || !lstatSync(physical).isDirectory() || lstatSync(physical).isSymbolicLink()) throw new Error("repository root invalid");
  return physical;
}

function executeGit(spawn, root, args, { input = null, env = {}, accepted = [0] } = {}) {
  const result = spawn("git", [...FIXED_GIT_CONFIG, ...args], {
    cwd: root,
    encoding: null,
    env: neutralGitEnvironment(env),
    input,
    maxBuffer: MAX_GIT_OUTPUT,
    shell: false,
    timeout: GIT_TIMEOUT_MS,
    windowsHide: true,
  });
  if (result?.error || !accepted.includes(result?.status)) throw new Error("trusted Git plumbing failed");
  return Buffer.isBuffer(result.stdout) ? result.stdout : Buffer.from(result.stdout ?? "");
}

function oneLine(bytes) {
  const value = bytes.toString("ascii").trim();
  if (!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u.test(value)) throw new Error("Git object id invalid");
  return value;
}

function objectFormat(plan) { return plan.publicBaseCommit.length === 40 ? "sha1" : "sha256"; }

function hashGitObject(type, bytes, format) {
  return createHash(format).update(Buffer.from(`${type} ${bytes.length}\0`, "ascii")).update(bytes).digest("hex");
}

function readGitObject(spawn, root, type, oid, format) {
  const bytes = executeGit(spawn, root, ["cat-file", type, oid]);
  if (hashGitObject(type, bytes, format) !== oid) throw new Error("Git object readback mismatch");
  return bytes;
}

function parseTreeObject(bytes, format) {
  const oidBytes = format === "sha1" ? 20 : 32;
  const entries = [];
  let offset = 0;
  while (offset < bytes.length) {
    const space = bytes.indexOf(0x20, offset);
    const nul = bytes.indexOf(0x00, space + 1);
    if (space <= offset || nul <= space + 1 || nul + oidBytes > bytes.length) throw new Error("tree object invalid");
    const mode = bytes.subarray(offset, space).toString("ascii");
    const name = new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(space + 1, nul));
    if (!safePath(name) || name.includes("/")) throw new Error("tree entry invalid");
    entries.push({ mode, name, oid: bytes.subarray(nul + 1, nul + 1 + oidBytes).toString("hex") });
    offset = nul + 1 + oidBytes;
  }
  if (new Set(entries.map((entry) => entry.name)).size !== entries.length) throw new Error("tree entries duplicate");
  return entries;
}

function observeTreeManifest(spawn, root, treeOid, format, prefix = "", seen = new Set()) {
  if (seen.has(treeOid)) throw new Error("tree cycle invalid");
  seen.add(treeOid);
  const manifest = [];
  const treeBytes = readGitObject(spawn, root, "tree", treeOid, format);
  for (const entry of parseTreeObject(treeBytes, format)) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (!safePath(path)) throw new Error("tree path invalid");
    if (entry.mode === "40000") manifest.push(...observeTreeManifest(spawn, root, entry.oid, format, path, seen));
    else {
      if (!MODES.has(entry.mode)) throw new Error("tree mode unsupported");
      manifest.push({ path, mode: entry.mode, rawSha256: hashBytes(readGitObject(spawn, root, "blob", entry.oid, format)) });
    }
  }
  seen.delete(treeOid);
  return manifest.sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0);
}

function assertBaseCommit(plan, bytes) {
  const separator = bytes.indexOf(Buffer.from("\n\n", "ascii"));
  if (separator < 0) throw new Error("base commit invalid");
  const headers = bytes.subarray(0, separator).toString("utf8").split("\n");
  const trees = headers.filter((line) => line.startsWith("tree "));
  const committers = headers.filter((line) => line.startsWith("committer "));
  const epoch = committers[0]?.match(/ ([0-9]+) [+-][0-9]{4}$/u)?.[1];
  if (trees.length !== 1 || committers.length !== 1 || trees[0] !== `tree ${plan.publicBaseTree}`
    || Number(epoch) !== plan.publicBaseCommitterEpoch) throw new Error("public base authority mismatch");
}

function changedContentPaths(plan) {
  return plan.operations.filter((operation) => operation.operation !== "delete")
    .map((operation) => operation.operation === "rename" ? operation.newPath : operation.path)
    .sort();
}

function scanContent(plan, bytes) {
  const surface = bytes.toString("utf8");
  const fragments = [...new Set([surface, ...surface.split(/[\s"'()<>{}\[\]]+/u).filter(Boolean)])];
  for (const value of fragments) {
    const finding = detectLeakFinding(value, plan.machineDenySet);
    if (!finding) continue;
    const digest = hashBytes(finding.normalizedValue);
    const allowed = finding.allowable === true && finding.ruleId === "url-host"
      && plan.allowances.some((entry) => entry.ruleId === finding.ruleId && entry.normalizedValueSha256 === digest);
    if (!allowed) throw new Error(`leakage:${finding.ruleId}`);
  }
}

function prepareChangedContents(plan, contentByPath) {
  if (!(contentByPath instanceof Map)) throw new Error("content map invalid");
  const required = changedContentPaths(plan);
  const actual = [...contentByPath.keys()];
  if (actual.some((path) => !safePath(path)) || canonical([...actual].sort()) !== canonical(required)) throw new Error("content map partition invalid");
  const prepared = new Map();
  for (const operation of plan.operations) {
    if (operation.operation === "delete") continue;
    const path = operation.operation === "rename" ? operation.newPath : operation.path;
    const supplied = contentByPath.get(path);
    if (!(Buffer.isBuffer(supplied) || supplied instanceof Uint8Array)) throw new Error("content bytes invalid");
    const bytes = Buffer.from(supplied);
    if (hashBytes(bytes) !== operation.publicSha256) throw new Error("content digest mismatch");
    scanContent(plan, bytes);
    prepared.set(path, bytes);
  }
  return prepared;
}

function indexInformation(plan, blobOids, format) {
  const zero = "0".repeat(format === "sha1" ? 40 : 64);
  const records = [];
  for (const operation of plan.operations) {
    if (operation.operation === "delete") records.push(`0 ${zero}\t${operation.path}\0`);
    else if (operation.operation === "rename") {
      records.push(`0 ${zero}\t${operation.oldPath}\0`);
      records.push(`${operation.newMode} ${blobOids.get(operation.newPath)}\t${operation.newPath}\0`);
    } else records.push(`${operation.newMode} ${blobOids.get(operation.path)}\t${operation.path}\0`);
  }
  return Buffer.from(records.join(""), "utf8");
}

function expectedCommitBytes(plan) {
  const [name, email] = NEUTRAL_IDENTITY.match(/^(.+) <([^<>]+)>$/u)?.slice(1) ?? [];
  if (!name || !email) throw new Error("neutral identity invalid");
  const identity = `${name} <${email}> ${plan.committerTimestamp} +0000`;
  return Buffer.from([
    `tree ${plan.resultTree}`,
    `parent ${plan.publicBaseCommit}`,
    `author ${identity}`,
    `committer ${identity}`,
    "",
    plan.message,
  ].join("\n"), "utf8");
}

function commitEnvironment(plan) {
  const match = NEUTRAL_IDENTITY.match(/^(.+) <([^<>]+)>$/u);
  if (!match) throw new Error("neutral identity invalid");
  return {
    GIT_AUTHOR_NAME: match[1],
    GIT_AUTHOR_EMAIL: match[2],
    GIT_AUTHOR_DATE: `@${plan.authorTimestamp} +0000`,
    GIT_COMMITTER_NAME: match[1],
    GIT_COMMITTER_EMAIL: match[2],
    GIT_COMMITTER_DATE: `@${plan.committerTimestamp} +0000`,
  };
}

/**
 * Materializes exactly the already closed neutral range plan. This writes only
 * unreachable Git objects. It never updates refs, invokes porcelain, checks
 * out files, resolves a remote, or accepts caller-controlled Git argv.
 */
export function buildNeutralRangeCommit({ root, plan, contentByPath, spawn = spawnSync }) {
  try { validateNeutralRangePlan(plan); } catch { return neutralFailure("BTM-E2-PLAN-INVALID", "preflight"); }
  let contents;
  try { contents = prepareChangedContents(plan, contentByPath); } catch { return neutralFailure("BTM-E2-CONTENT-INVALID", "preflight"); }
  let repositoryRoot;
  try { repositoryRoot = physicalRepositoryRoot(root); } catch { return neutralFailure("BTM-E2-REPOSITORY-INVALID", "preflight"); }
  if (typeof spawn !== "function") return neutralFailure("BTM-E2-RUNNER-INVALID", "preflight");
  const format = objectFormat(plan);
  let mutation = "none";
  let indexDirectory;
  try {
    const baseCommitBytes = readGitObject(spawn, repositoryRoot, "commit", plan.publicBaseCommit, format);
    assertBaseCommit(plan, baseCommitBytes);
    if (canonical(observeTreeManifest(spawn, repositoryRoot, plan.publicBaseTree, format)) !== canonical(plan.publicBaseManifest)) throw new Error("public base manifest mismatch");

    indexDirectory = mkdtempSync(join(tmpdir(), "agent-pipeline-neutral-index-"));
    const indexPath = join(indexDirectory, "index");
    const indexEnv = { GIT_INDEX_FILE: indexPath };
    executeGit(spawn, repositoryRoot, ["read-tree", plan.publicBaseTree], { env: indexEnv });
    const blobOids = new Map();
    for (const path of changedContentPaths(plan)) {
      const blobOid = oneLine(executeGit(spawn, repositoryRoot, ["hash-object", "-w", "--stdin", "--no-filters"], { input: contents.get(path) }));
      mutation = "objects";
      if (blobOid.length !== plan.publicBaseCommit.length) throw new Error("blob object format mismatch");
      blobOids.set(path, blobOid);
    }
    executeGit(spawn, repositoryRoot, ["update-index", "-z", "--index-info"], { env: indexEnv, input: indexInformation(plan, blobOids, format) });
    const tree = oneLine(executeGit(spawn, repositoryRoot, ["write-tree"], { env: indexEnv }));
    mutation = "objects";
    if (tree !== plan.resultTree) return neutralFailure("BTM-E2-TREE-MISMATCH", "write-tree", mutation);
    if (canonical(observeTreeManifest(spawn, repositoryRoot, tree, format)) !== canonical(plan.resultManifest)) return neutralFailure("BTM-E2-MANIFEST-MISMATCH", "tree-readback", mutation);
    const commit = oneLine(executeGit(spawn, repositoryRoot, ["commit-tree", tree, "-p", plan.publicBaseCommit], {
      env: commitEnvironment(plan), input: Buffer.from(plan.message, "utf8"),
    }));
    mutation = "objects";
    if (commit !== plan.resultCommit) return neutralFailure("BTM-E2-COMMIT-MISMATCH", "commit-tree", mutation);
    const commitBytes = readGitObject(spawn, repositoryRoot, "commit", commit, format);
    if (!commitBytes.equals(expectedCommitBytes(plan))) return neutralFailure("BTM-E2-COMMIT-READBACK-MISMATCH", "commit-readback", mutation);
    if (hashGitObject("tree", readGitObject(spawn, repositoryRoot, "tree", tree, format), format) !== tree) return neutralFailure("BTM-E2-TREE-READBACK-MISMATCH", "tree-readback", mutation);
    return { ok: true, code: "BTM-E2-BUILT", mutation, planDigest: plan.planDigest, resultCommit: commit, resultTree: tree };
  } catch {
    return neutralFailure("BTM-E2-GIT-FAILED", "plumbing", mutation);
  } finally {
    if (indexDirectory) rmSync(indexDirectory, { recursive: true, force: true });
  }
}
