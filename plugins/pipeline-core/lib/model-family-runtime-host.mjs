// SPDX-License-Identifier: SUL-1.0
/** Physical, read-only activation observation and source-owned S4 wiring. */
import { execFileSync } from "node:child_process";
import { AsyncLocalStorage } from "node:async_hooks";
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { isAbsolute, join, parse, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { parseStrictJson } from "./governance-event.mjs";
import { createModelFamilyHostController } from "./model-family-host-store.mjs";

const SHA = /^[a-f0-9]{64}$/u;
const OID = /^[a-f0-9]{40}$/u;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const ROUTERS = new Set(["codex", "claude", "antigravity"]);
const markerPathFor = (commonDir) => join(commonDir, "agent-pipeline", "model-family-host", "activation.json");
const unavailable = (code = "MODEL-FAMILY-ACTIVATION-UNCERTAIN") =>
  ({ ok: false, code, retryable: false, status: "uncertain" });

function gitCommonDir(cwd = process.cwd()) {
  const raw = execFileSync("git", ["rev-parse", "--git-common-dir"],
    { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  if (!raw) throw new Error("GIT-COMMON-DIR-UNAVAILABLE");
  const commonDir = realpathSync(resolve(cwd, raw));
  const stat = lstatSync(commonDir);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("GIT-COMMON-DIR-INVALID");
  return commonDir;
}

function safeExistingPath(path, expectDirectory) {
  try {
    const stat = lstatSync(path);
    if (stat.isSymbolicLink() || (!expectDirectory && stat.nlink !== 1)
      || (expectDirectory ? !stat.isDirectory() : !stat.isFile())
      || realpathSync(path) !== path) return { kind: "unsafe" };
    return { kind: "present", stat };
  } catch (error) {
    if (error?.code === "ENOENT") return { kind: "absent" };
    return { kind: "unsafe" };
  }
}

function directoryPathChain(path) {
  if (typeof path !== "string" || !isAbsolute(path) || resolve(path) !== path) return null;
  const root = parse(path).root;
  const segments = path.slice(root.length).split(sep).filter(Boolean);
  const result = [root];
  let current = root;
  for (const segment of segments) { current = join(current, segment); result.push(current); }
  return result;
}

function readActivation(commonDir) {
  const privateRoot = join(commonDir, "agent-pipeline");
  const familyDir = join(privateRoot, "model-family-host");
  const chain = directoryPathChain(commonDir);
  if (!chain || chain.at(-1) !== commonDir) return unavailable("MODEL-FAMILY-GIT-COMMON-DIR-UNAVAILABLE");
  chain.push(privateRoot, familyDir);
  for (const path of chain) {
    const check = safeExistingPath(path, true);
    if (check.kind === "unsafe") return unavailable();
    if (check.kind === "absent") {
      if (path === familyDir || path === privateRoot) return { ok: true, code: "MODEL-FAMILY-INACTIVE", status: "inactive", commonDir, privateRoot };
      return unavailable("MODEL-FAMILY-GIT-COMMON-DIR-UNAVAILABLE");
    }
  }
  const markerPath = markerPathFor(commonDir);
  const markerCheck = safeExistingPath(markerPath, false);
  if (markerCheck.kind === "unsafe") return unavailable();
  if (markerCheck.kind === "absent") return unavailable("MODEL-FAMILY-ACTIVATION-LOST");
  try {
    if (markerCheck.stat.size > 16 * 1024) return unavailable();
    const marker = parseStrictJson(readFileSync(markerPath));
    const keys = ["schema", "activationId", "authoritySha256", "createdAt"];
    if (!marker || typeof marker !== "object" || Array.isArray(marker)
      || Object.keys(marker).sort().join("\0") !== keys.sort().join("\0")
      || marker.schema !== "pipeline.model-family-host-activation.v1"
      || !SHA.test(marker.activationId ?? "") || !SHA.test(marker.authoritySha256 ?? "")
      || typeof marker.createdAt !== "string") return unavailable();
    return { ok: true, code: "MODEL-FAMILY-ACTIVE", status: "active", commonDir, privateRoot,
      marker: Object.freeze(structuredClone(marker)) };
  } catch { return unavailable(); }
}

const unavailableSources = Object.freeze({
  readAuthorityInputs: () => ({ ok: false, code: "MODEL-FAMILY-NATIVE-PORT-UNQUALIFIED", retryable: false }),
  readPinInputs: () => ({ ok: false, code: "MODEL-FAMILY-NATIVE-PORT-UNQUALIFIED", retryable: false }),
  captureFreshDiscovery: async () => ({ ok: false, code: "ADAPTER_CONTRACT_UNQUALIFIED", retryable: false }),
  readCurrentCandidate: () => ({ ok: false, code: "MODEL-FAMILY-CANDIDATE-SOURCE-UNAVAILABLE", retryable: false }),
  launchDriver: () => ({ ok: false, code: "MODEL-FAMILY-NATIVE-PORT-UNQUALIFIED", retryable: false }),
});

/**
 * `trustedSources` is a source-code-only factory seam. It is never accepted by
 * prepare/bind wire calls. Production defaults expose no unqualified native
 * adapter as successful operation.
 */
export function createModelFamilyRuntimeHost({ cwd = process.cwd(), resolveCommonDir = gitCommonDir,
  trustedSources = unavailableSources, clock = () => Date.now() } = {}) {
  if (typeof cwd !== "string" || !isAbsolute(cwd) || typeof resolveCommonDir !== "function"
    || typeof clock !== "function" || !trustedSources || typeof trustedSources !== "object") {
    throw new TypeError("family runtime host source boundary is incomplete");
  }
  let commonDir = null;
  let privateRoot = null;
  let controller = null;
  const discoveryScope = new AsyncLocalStorage();
  const captureKey = ({ authoritySha256, assignment, key }) => JSON.stringify([authoritySha256,
    key?.runner, key?.installationBindingSha256, key?.accountBindingSha256, key?.sessionId,
    key?.invocationId, assignment?.taskRoute, assignment?.role, assignment?.effort, assignment?.familyId]);
  function resolvePhysicalRoot() {
    if (commonDir !== null) return { commonDir, privateRoot };
    try {
      const candidate = resolveCommonDir(cwd);
      if (typeof candidate !== "string" || !isAbsolute(candidate) || realpathSync(candidate) !== candidate) throw new Error();
      const rootStat = lstatSync(candidate);
      if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) throw new Error();
      commonDir = candidate;
      privateRoot = join(commonDir, "agent-pipeline");
      return { commonDir, privateRoot };
    } catch { return null; }
  }
  function observeActivation() {
    const root = resolvePhysicalRoot();
    if (!root) return unavailable("MODEL-FAMILY-GIT-COMMON-DIR-UNAVAILABLE");
    const observed = readActivation(root.commonDir);
    if (!observed.ok || observed.status === "inactive") return observed;
    let state;
    try { state = store().readState(); } catch { return unavailable("MODEL-FAMILY-STATE-UNCERTAIN"); }
    if (!state?.ok) return unavailable(state?.code ?? "MODEL-FAMILY-STATE-UNCERTAIN");
    return { ...observed, stateGeneration: state.state.generation, authoritySha256: state.state.authoritySha256 };
  }
  function store() {
    const root = resolvePhysicalRoot();
    if (!root) throw new Error("MODEL-FAMILY-GIT-COMMON-DIR-UNAVAILABLE");
    if (controller === null) {
      const sources = { ...trustedSources,
        ...(typeof trustedSources.admitNativeRequest === "function" ? {
          admitNativeRequest: (request) => trustedSources.admitNativeRequest({ ...request,
            repositoryRoot: cwd, gitCommonDir: root.commonDir }),
        } : {}),
        readFreshDiscovery: (request) => {
          const held = discoveryScope.getStore();
          return held && captureKey(held.request) === captureKey(request) ? held.prepared
            : { ok: false, code: "ADAPTER_CONTRACT_UNQUALIFIED", retryable: false };
        },
      };
      controller = createModelFamilyHostController({ rootDir: root.privateRoot, trustedSources: sources, clock });
    }
    return controller;
  }
  async function captureFreshDiscovery(request = {}) {
    if (typeof trustedSources.captureFreshDiscovery !== "function") {
      return { ok: false, code: "ADAPTER_CONTRACT_UNQUALIFIED", retryable: false };
    }
    let result;
    try { result = await trustedSources.captureFreshDiscovery(structuredClone(request)); }
    catch { return { ok: false, code: "ADAPTER_CONTRACT_UNQUALIFIED", retryable: false }; }
    if (!result?.ok) return result && typeof result.code === "string" ? result
      : { ok: false, code: "ADAPTER_CONTRACT_UNQUALIFIED", retryable: false };
    const prepared = result.value;
    if (!prepared || typeof prepared !== "object" || Array.isArray(prepared)
      || Object.keys(prepared).sort().join("\0") !== ["discoveryHost", "discoveryHandle", "context"].sort().join("\0")
      || typeof prepared.discoveryHost?.readDiscovery !== "function") {
      return { ok: false, code: "MODEL-FAMILY-DISCOVERY-HANDLE-REQUIRED", retryable: false };
    }
    return { ok: true, code: result.code ?? "MODEL-FAMILY-DISCOVERY-CAPTURED", value: prepared };
  }
  async function withFreshDiscovery(request = {}, operation) {
    if (typeof operation !== "function") return { ok: false, code: "MODEL-FAMILY-DISCOVERY-OPERATION-REQUIRED", retryable: false };
    const captured = await captureFreshDiscovery(request);
    if (!captured.ok) return captured;
    try {
      return await discoveryScope.run({ request: structuredClone(request), prepared: captured.value }, operation);
    } catch { return { ok: false, code: "MODEL-FAMILY-DISCOVERY-OPERATION-FAILED", retryable: false }; }
  }
  function resolveInvocationContext(request = {}) {
    if (typeof trustedSources.resolveInvocationContext !== "function") {
      return { ok: false, code: "MODEL-FAMILY-NATIVE-PORT-UNQUALIFIED", retryable: false };
    }
    try {
      const result = trustedSources.resolveInvocationContext(structuredClone(request));
      return result && typeof result === "object" ? result
        : { ok: false, code: "MODEL-FAMILY-IDENTITY-UNAVAILABLE", retryable: false };
    } catch { return { ok: false, code: "MODEL-FAMILY-IDENTITY-UNAVAILABLE", retryable: false }; }
  }
  function resolveCurrentInvocationIdentity(request = {}) {
    if (!request || typeof request !== "object" || !ROUTERS.has(request.runner)
      || typeof request.taskRoute !== "string" || !/^(?:profile|duty)\.[A-Za-z0-9_.-]{1,120}$/u.test(request.taskRoute)
      || !ID.test(request.invocationId ?? "")) return unavailable("MODEL-FAMILY-IDENTITY-UNAVAILABLE");
    if (typeof trustedSources.resolveCurrentInvocationIdentity !== "function") {
      return unavailable("MODEL-FAMILY-NATIVE-PORT-UNQUALIFIED");
    }
    let result;
    try { result = trustedSources.resolveCurrentInvocationIdentity(structuredClone(request)); }
    catch { return unavailable("MODEL-FAMILY-IDENTITY-UNAVAILABLE"); }
    const key = result?.key;
    const assignment = result?.assignment;
    const closed = (value, keys) => value && typeof value === "object" && !Array.isArray(value)
      && Object.keys(value).sort().join("\0") === [...keys].sort().join("\0");
    if (!result?.ok || !closed(result, ["ok", "key", "assignment", "candidateCommit", "candidateTree"])
      || !closed(key, ["runner", "installationBindingSha256", "accountBindingSha256", "sessionId", "invocationId"])
      || !closed(assignment, ["runner", "taskRoute", "role", "effort", "familyId"])
      || key.runner !== request.runner || key.invocationId !== request.invocationId
      || key.sessionId === request.invocationId || !ID.test(key.sessionId ?? "")
      || !SHA.test(key.installationBindingSha256 ?? "") || !SHA.test(key.accountBindingSha256 ?? "")
      || assignment.runner !== request.runner || assignment.taskRoute !== request.taskRoute
      || !["frontier", "worker", "efficient"].includes(assignment.role)
      || !["low", "medium", "high", "xhigh", "max", "not-applicable"].includes(assignment.effort)
      || !/^[a-z][a-z0-9-]{0,31}$/u.test(assignment.familyId ?? "")
      || !OID.test(result.candidateCommit ?? "") || !OID.test(result.candidateTree ?? "")
      || result.candidateCommit === result.candidateTree) return unavailable("MODEL-FAMILY-IDENTITY-UNAVAILABLE");
    return { ok: true, code: "MODEL-FAMILY-CURRENT-IDENTITY", key: Object.freeze({ ...key }),
      assignment: Object.freeze({ ...assignment }), candidateCommit: result.candidateCommit,
      candidateTree: result.candidateTree };
  }
  return Object.freeze({ observeActivation, store, root: resolvePhysicalRoot, resolveInvocationContext,
    resolveCurrentInvocationIdentity, withFreshDiscovery });
}

/** Default reader has no mutation path; activation never creates a marker. */
export function observeModelFamilyActivation(options = {}) {
  try { return createModelFamilyRuntimeHost(options).observeActivation(); }
  catch { return unavailable(); }
}

export const MODEL_FAMILY_ACTIVATION_MARKER = "model-family-host/activation.json";
export const modelFamilyRuntimeHostModulePath = fileURLToPath(import.meta.url);
