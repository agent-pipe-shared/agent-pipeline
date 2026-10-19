import { nativeManagedDigest, nativeManagedFault, nativeManagedRepository, nativeManagedCurrentOwner, nativeManagedSourceRef, readNativeManagedSource, readNativeManagedInventory, nativeManagedRegistryPresent, nativeManagedAssociation } from './native-managed-authority-support.mjs';
import { createSessionAuthorityParticipantPorts } from './session-authority-observers.mjs';
import { initializeSessionAuthorityRegistry, migrateSourceUpdatedSessionAuthorityRegistry, withSessionAuthorityBoundary, reserveSessionAuthorityMember, advanceSessionAuthorityMember, refreshSourceOwnedDispatchAuthorityMember, releaseSessionAuthorityMember, recoverSessionAuthorityMember, inspectSourceOwnedSessionAuthorityProducerRecord, inspectSourceOwnedSessionAuthorityMemberRecord, inspectSourceOwnedNativeDispatchPendingRecord } from './session-authority-registry.mjs';
import { inspectSignedDescriptorCustodyRepository } from './worktree-lifecycle.mjs';
import { inspectNativeGoldfishAuthorityTerminal } from './native-goldfish-host-finalizer.mjs';
// SPDX-License-Identifier: SUL-1.0
/** Private runner-hook correlation state for native Goldfish host commits. */
import { createHash } from "node:crypto";
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { constants } from "node:fs";
import { closeSync, fstatSync, fsyncSync, linkSync, lstatSync, mkdirSync,
  openSync, readFileSync, readdirSync, realpathSync, renameSync, unlinkSync, writeSync } from "node:fs";
import { dirname, join, resolve, relative, isAbsolute } from "node:path";
import { createAgyFamilyDispatchAuthorityProducerPort, readAgyIntegratedItemDelivery } from "./agy-session-dispatch.mjs";
import { readAgyAuthorityInventory } from "./agy-host-observed-store.mjs";
import { observeGovernanceScope } from "./governance-scope.mjs";
import { resolveProjectAuthorityPaths } from "./project-authority.mjs";
import { parseStrictJson } from "./governance-event.mjs";
import { captureAgyHostCommitBaseline, captureSourceOwnedNativeHostCommitBaseline, NATIVE_CONCURRENT_HOST_COMMIT_BASELINE_SCHEMA, agyHostGitEnvironment } from "./agy-host-commit-admission.mjs";
import { resolveGitCommonDir } from "./po-key-directory.mjs";
import { observeCurrentPlanApprovalForCalibration } from "../scripts/pipeline-state.mjs";
import { resolveV3DutyRoute } from "./critic-route-v3.mjs";
import { createModelFamilyRuntimeHost } from "./model-family-runtime-host.mjs";
import { parseAcceptedCriticCriterion } from "./critic-accepted-contract.mjs";
import { parseNativeGoldfishBriefing, validateItemDeliveryBriefing } from "./native-goldfish-host-return.mjs";
import { parseDispatchSlice } from "./dispatch-policy.mjs";
import { ITEM_QUEUE_SCHEMA, SLICE_QUEUE_MAX_BYTES, validateSliceQueue, normalizeScope, scopesOverlap, DEFAULT_CRITICAL_PATH_PATTERNS } from "./slice-queue.mjs";
import { isSafeTaskId } from "./dispatch-record.mjs";
import { fileURLToPath } from "node:url";

// Repairs name the absolute script, so a plain terminal can run them as printed (Critic F9).
const SLICE_QUEUE_SCRIPT = fileURLToPath(new URL("../scripts/slice-queue.mjs", import.meta.url));

export const NATIVE_GOLDFISH_HOST_STATE_SCHEMA = "pipeline.native-goldfish-host-state.v1";
export const NATIVE_GOLDFISH_ITEM_HOST_STATE_SCHEMA = "pipeline.native-goldfish-host-state.v2";
export const NATIVE_GOLDFISH_CONFIGURED_HOST_STATE_SCHEMA="pipeline.native-goldfish-host-state.v3";
const nativeStateSchema = value => [NATIVE_GOLDFISH_HOST_STATE_SCHEMA, NATIVE_GOLDFISH_ITEM_HOST_STATE_SCHEMA,NATIVE_GOLDFISH_CONFIGURED_HOST_STATE_SCHEMA].includes(value);
export const NATIVE_GOLDFISH_CODEX_START_BINDING_TTL_MS = 120_000;
const RUNNERS = new Set(["claude", "codex"]);
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const SHA = /^[a-f0-9]{64}$/u;
const OID = /^[a-f0-9]{40}(?:[a-f0-9]{24})?$/u;
const MAX_BYTES = 128 * 1024;
const SUBDIRS = ["agent-pipeline", "run", "native-goldfish-host-commit"];

function fail(code) { return { ok: false, code }; }
// Names each held dependency with the cause that actually holds it (Critic F1): only a deliverable,
// non-cancelled slice can be released by a "Dispatch: <slice> (goldfish)" commit.
export function heldDependencyReason(held, slices) {
  const why = id => {
    const row = slices.find(entry => entry.id === id);
    if (!row) return `${id} (not in the queue)`;
    if (row.state === "cancelled") return `${id} (cancelled; a dependency on a cancelled slice keeps holding)`;
    if (row.tier === "critic") return `${id} (critic slice)`;
    if (!/^[0-9a-f]{40}$/u.test(row.delivery?.baseCommit ?? "")) return `${id} (no delivery base; not deliverable by commit evidence)`;
    if (row.state !== "ready") return `${id} (state ${row.state})`;
    return `${id} (no "Dispatch: ${id} (goldfish)" commit after its base touches its write scope)`;
  };
  return `held on ${held.slice(0, 3).map(why).join("; ")}${held.length > 3 ? `; and ${held.length - 3} more` : ""}`;
}
// PF-42: a refusal names the exact line shape the briefing needs, so the caller does not have to guess it.
function itemNotReadyReason(named, item) {
  if (named.sliceId === null) return "the briefing names no single slice: field 6 (dispatch metadata) needs exactly one line `- Slice: <slice id>` and one line `- Write scope: <path>, <path>` matching the queue row";
  if (!item) return `slice ${named.sliceId} is not in the governed queue; name an existing queue row in the \`- Slice: <slice id>\` line`;
  return `slice ${item.id} is in state ${item.state}, not ready`;
}
function digest(value) { return createHash("sha256").update(value).digest("hex"); }
function exact(value, keys) { return value !== null && typeof value === "object" && !Array.isArray(value)
  && Object.keys(value).sort().join(",") === [...keys].sort().join(","); }
function safeRunner(value) { return RUNNERS.has(value); }
function safeCorrelation(value) { return typeof value === "string" && value.length > 0 && value.length <= 512; }
function key(kind, runner, value) { return `${kind}-${runner}-${digest(value)}.json`; }

function privateDirectory(commonDir, create, subdirs = SUBDIRS) {
  if (typeof commonDir !== "string" || !isAbsolute(commonDir)) throw new Error("NGHS-ROOT");
  let path = resolve(commonDir);
  const root = lstatSync(path);
  if (!root.isDirectory() || root.isSymbolicLink() || realpathSync(path) !== path) throw new Error("NGHS-ROOT");
  for (const component of subdirs) {
    path = join(path, component);
    if (create) {
      try { mkdirSync(path, { mode: 0o700 }); }
      catch (error) { if (error?.code !== "EEXIST") throw error; }
    }
    const entry = lstatSync(path);
    if (!entry.isDirectory() || entry.isSymbolicLink() || realpathSync(path) !== path) throw new Error("NGHS-DIRECTORY");
  }
  return path;
}

function writeExclusive(commonDir, name, value, subdirs = SUBDIRS) {
  const path = privateDirectory(commonDir, true, subdirs);
  const bytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
  if (bytes.length > MAX_BYTES) throw new Error("NGHS-SIZE");
  const temp = `.${name}.${randomBytes(16).toString("hex")}.tmp`;
  let tempFd; let targetFd;
  try {
    tempFd = openSync(join(path, temp), constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL
      | (constants.O_NOFOLLOW ?? 0), 0o600);
    let offset = 0;
    while (offset < bytes.length) {
      const written = writeSync(tempFd, bytes, offset, bytes.length - offset, offset);
      if (!Number.isSafeInteger(written) || written <= 0) throw new Error("NGHS-WRITE");
      offset += written;
    }
    fsyncSync(tempFd);
    const source = fstatSync(tempFd);
    linkSync(join(path, temp), join(path, name));
    targetFd = openSync(join(path, name), constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    const published = fstatSync(targetFd);
    if (source.dev !== published.dev || source.ino !== published.ino || published.size !== bytes.length) throw new Error("NGHS-PUBLISH");
    const readback = readFileSync(targetFd);
    const after = fstatSync(targetFd);
    const target = lstatSync(join(path, name));
    if (after.dev !== published.dev || after.ino !== published.ino || after.size !== published.size
      || after.mtimeMs !== published.mtimeMs || target.isSymbolicLink()
      || target.dev !== published.dev || target.ino !== published.ino || !readback.equals(bytes)) throw new Error("NGHS-READBACK");
    return { ok: true, code: "NGHS-STORED", sha256: digest(bytes), path: join(...subdirs, name) };
  } finally {
    if (tempFd !== undefined) closeSync(tempFd);
    if (targetFd !== undefined) closeSync(targetFd);
    try { unlinkSync(join(path, temp)); } catch {}
  }
}

function readPrivate(commonDir, name, subdirs = SUBDIRS) {
  const path = privateDirectory(commonDir, false, subdirs);
  const target = join(path, name);
  const before = lstatSync(target);
  if (!before.isFile() || before.isSymbolicLink() || before.size < 1 || before.size > MAX_BYTES) throw new Error("NGHS-TARGET");
  const fd = openSync(target, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const opened = fstatSync(fd);
    if (opened.dev !== before.dev || opened.ino !== before.ino || opened.size !== before.size) throw new Error("NGHS-RACE");
    const bytes = readFileSync(fd);
    const after = fstatSync(fd);
    if (after.dev !== opened.dev || after.ino !== opened.ino || after.size !== opened.size
      || after.mtimeMs !== opened.mtimeMs || after.ctimeMs !== opened.ctimeMs || bytes.length !== opened.size) throw new Error("NGHS-RACE");
    const value = parseStrictJson(bytes);
    return { value, bytes, sha256: digest(bytes) };
  } finally { closeSync(fd); }
}

function git(root, args) {
  const run = spawnSync("git", ["-C", root, ...args], {
    encoding: "utf8", shell: false, timeout: 10_000, maxBuffer: 1024 * 1024,
    env: agyHostGitEnvironment(),
  });
  return run.error || run.status !== 0 ? null : run.stdout.trim();
}

function toolFields(runner, input) {
  const tool = input?.tool_input ?? {};
  if (runner === "claude") {
    if (!["Agent", "Task"].includes(input?.tool_name)) return null;
    const role = tool.subagent_type ?? tool.subagentType ?? "";
    const prompt = tool.prompt;
    return { correlation: input.tool_use_id, sessionId: input.session_id, role, prompt,
      runInBackground: tool.run_in_background };
  }
  if (input?.tool_name !== "spawn_agent") return null;
  const role = tool.agent_type ?? tool.agentType ?? "default";
  const prompt = tool.message ?? tool.prompt;
  return { correlation: input.tool_use_id, sessionId: input.session_id, role, prompt };
}

/** Capture a closed pre-launch binding; unmarked dispatches are intentionally untouched. */
export const NATIVE_GOLDFISH_SUBAGENT_STOP_COMPLETION_ROUTE = "subagent-stop";
// `subagentStopCompletionRegistered` is the caller's explicit fact that the Claude `SubagentStop` completion route is
// registered in the running plugin's hooks. Only the strict boolean `true` is that fact: absent, `false` and every
// non-boolean value leave an explicit background launch refused exactly as before.
/** PF-55: a preparation that refuses after it wrote the queue row restores the queue as it was. */
export function prepareNativeGoldfishHostState(args = {}, dependencies = {}) {
  const written = [];
  const result = prepareNativeGoldfishHostStateOnce(args, dependencies, written);
  if (result?.ok !== true) for (const row of written.reverse()) rollbackGovernedItemQueue(row);
  return result;
}
function prepareNativeGoldfishHostStateOnce({ root, runner, input, subagentStopCompletionRegistered } = {}, dependencies = {}, written = []) {
  if (!safeRunner(runner)) return fail("NGHS-RUNNER");
  const fields = toolFields(runner, input);
  if (!fields || !safeCorrelation(fields.correlation) || !ID.test(fields.sessionId ?? "")) return { ok: true, code: "NGHS-NOT-APPLICABLE" };
  const hostMarkers = ["<!-- pipeline-native-goldfish-host-commit:v1", "<!-- pipeline-native-goldfish-host-commit:v2", "<!-- pipeline-native-goldfish-host-commit:v3"];
  if (typeof fields.prompt !== "string" || !hostMarkers.some((marker) => fields.prompt.includes(marker))) return { ok: true, code: "NGHS-NOT-APPLICABLE" };
  const parsed = parseNativeGoldfishBriefing(fields.prompt);
  if (!parsed.ok) return fail(parsed.code);
  // A background launch is admitted only when the caller states the SubagentStop completion route is registered, so a
  // pending state is never written for a dispatch nothing would complete. D19 (PF-26): the Claude host launches every
  // Agent-tool subagent asynchronously and its tool input may carry NO run_in_background key, so an ABSENT key takes the
  // same SubagentStop route as an explicit true. An explicit false keeps the foreground (PostToolUse) route; any other
  // value (null, a string, a number) and an unregistered or unreadable route keep the NGHS-CLAUDE-FOREGROUND-REQUIRED refusal.
  // SubagentStop also fires for a child that happened to run in the foreground, and a subagent-stop state answers a
  // non-async PostToolUse silently (NGHF-SUBAGENT-STOP-ROUTE-ONLY), so such a child is still committed exactly once.
  const backgroundCapable = fields.runInBackground === true || fields.runInBackground === undefined;
  const backgroundCompletion = runner === "claude" && backgroundCapable && subagentStopCompletionRegistered === true;
  if (runner === "claude" && fields.runInBackground !== false && !backgroundCompletion) return fail("NGHS-CLAUDE-FOREGROUND-REQUIRED");
  const binding = parsed.binding;
  const deliveryQueue = binding.itemDelivery
    ? prepareGovernedItemQueue({root:root??input.cwd??process.cwd(),itemDelivery:binding.itemDelivery,
      candidate:{commit:binding.candidateCommit,tree:binding.candidateTree},writeScope:binding.allowedPaths})
    : resolveGovernedItemQueue({ root: root ?? input.cwd ?? process.cwd() });
  if (deliveryQueue.written) written.push(deliveryQueue.written);
  if (deliveryQueue.status === "refused") return { ...fail(deliveryQueue.code), ...(deliveryQueue.reason ? { reason: deliveryQueue.reason } : {}), ...(deliveryQueue.repair ? { repair: deliveryQueue.repair } : {}) };
  let delivery;
  if (deliveryQueue.status === "required") {
    const named = parseDispatchSlice(fields.prompt);
    const item = deliveryQueue.normalized.slices.find(row => row.id === named.sliceId);
    if (!item || item.state !== "ready") return { ...fail("NGHS-ITEM-NOT-READY"), reason: itemNotReadyReason(named, item) };
    if(item.delivery.criterionLocator&&!binding.itemDelivery)return fail("NGHS-ITEM-ORIGINAL-BRIEFING-REQUIRED");
    if(item.dependsOn.length>0){const readiness=observeGovernedItemIntegrationReadiness({root:root??input.cwd??process.cwd()});
      if(readiness.status!=='observed')return {...fail('NGHS-ITEM-INTEGRATION-DEPENDENCY-HELD'),reason:`integration readiness ${readiness.status} (${readiness.code}): ${String(readiness.reason??'').slice(0,120)}`};
      const held=item.dependsOn.filter(id=>!readiness.integrated.includes(id));
      if(held.length>0)return {...fail('NGHS-ITEM-INTEGRATION-DEPENDENCY-HELD'),reason:heldDependencyReason(held,deliveryQueue.normalized.slices)};}
    if (item.delivery.baseCommit !== binding.candidateCommit) return fail("NGHS-ITEM-BASE-MISMATCH");
    // Native adapters currently carry literal file paths. A glob/prefix queue
    // requires a separately admitted concrete path amendment; do not guess it.
    if (!binding.allowedPaths.every(path => item.writeScope.includes(path))) return fail("NGHS-ITEM-SCOPE-UNBOUND");
    delivery = { itemId: item.delivery.itemId, sliceId: item.id,
      queuePath: deliveryQueue.path, queueSha256: deliveryQueue.sha256, writeScope:[...item.writeScope] };
  }
  if (binding.runner !== runner) return fail("NGHS-RUNNER-MISMATCH");
  const role = fields.role.startsWith("pipeline-core:") ? fields.role : `pipeline-core:${fields.role}`;
  const nativeTypeMatches = binding.adapterVersion === 2 && runner === "codex"
    ? fields.role === binding.nativeAgentType : role === binding.role;
  if (!nativeTypeMatches) return fail("NGHS-ROLE-MISMATCH");
  const physicalRoot = realpathSync(resolve(root ?? input.cwd ?? process.cwd()));
  const readGit = dependencies.git ?? git;
  const head = readGit(physicalRoot, ["rev-parse", "--verify", "HEAD^{commit}"]);
  const tree = readGit(physicalRoot, ["rev-parse", "--verify", "HEAD^{tree}"]);
  if (head !== binding.candidateCommit || tree !== binding.candidateTree) return fail("NGHS-CANDIDATE-MISMATCH");
  const resultPath = `scratch/.native-host-return-${binding.dispatchId}.json`;
  const captured = (dependencies.captureBaseline ?? captureAgyHostCommitBaseline)({ root: physicalRoot,
    candidateCommit: head, resultPath });
  if (!captured?.ok && !binding.itemDelivery) return fail(captured?.code ?? "NGHS-BASELINE");
  const commonDir = (dependencies.resolveCommonDir ?? resolveGitCommonDir)(physicalRoot);
  if (typeof commonDir !== "string") return fail("NGHS-COMMON-DIR");
  const state = {
    schema: delivery ? NATIVE_GOLDFISH_ITEM_HOST_STATE_SCHEMA : NATIVE_GOLDFISH_HOST_STATE_SCHEMA, runner, sessionId: fields.sessionId,
    toolUseId: fields.correlation, agentId: null, role: binding.role,
    binding, root: physicalRoot, commonDir, resultPath, baseline: captured?.baseline ?? null,
    createdAtMs: (dependencies.nowEpochMs ?? Date.now)(),
    ...(delivery ? { delivery } : {}),
    ...(backgroundCompletion ? { completionRoute: NATIVE_GOLDFISH_SUBAGENT_STOP_COMPLETION_ROUTE } : {}),
  };
  let stored;
  try { stored = publishNativeAuthorityState(commonDir, key("pending", runner, `${fields.sessionId}\0${fields.correlation}`), state); }
  catch(error) { return {ok:false,code:error.code??"NGHS-ADMISSION-UNAVAILABLE",reason:error.reason??null,...(typeof error.repair==='string'?{repair:error.repair}:{})}; }
  return stored.ok ? { ...stored, runner, dispatchId: binding.dispatchId } : stored;
}

// Preparation-failure sidecar (PF-26B). A marked dispatch whose preparation failed but which still continued leaves NO
// pending state, so its PostToolUse could only say "no pending state". The guard records the typed preparation code here,
// keyed by runner, session and tool_use_id, in a directory SIBLING to native-goldfish-host-commit (so the authority
// inventory of that directory never sees it); the PostToolUse hook names the code. Best effort and diagnostic only: it
// confers no authority, a failed write never changes the dispatch outcome, and the first record for a launch wins.
export const NATIVE_GOLDFISH_PREPARE_FAILURE_SCHEMA = "pipeline.native-goldfish-host-prepare-failure.v1";
const PREPARE_FAILURE_SUBDIRS = ["agent-pipeline", "run", "native-goldfish-host-prepare-failure"];
const PREPARE_FAILURE_CODE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/u;
export function recordNativeGoldfishPrepareFailure({ root, runner, input, code } = {}, dependencies = {}) {
  try {
    if (!safeRunner(runner) || typeof code !== "string" || !PREPARE_FAILURE_CODE.test(code)) return fail("NGHS-PREPARE-FAILURE-INPUT");
    const fields = toolFields(runner, input);
    if (!fields || !safeCorrelation(fields.correlation) || !ID.test(fields.sessionId ?? "")) return fail("NGHS-PREPARE-FAILURE-INPUT");
    const physicalRoot = realpathSync(resolve(root ?? input.cwd ?? process.cwd()));
    const commonDir = (dependencies.resolveCommonDir ?? resolveGitCommonDir)(physicalRoot);
    if (typeof commonDir !== "string") return fail("NGHS-COMMON-DIR");
    return writeExclusive(commonDir, key("prepare-failure", runner, `${fields.sessionId}\0${fields.correlation}`), {
      schema: NATIVE_GOLDFISH_PREPARE_FAILURE_SCHEMA, runner, sessionId: fields.sessionId, toolUseId: fields.correlation, code,
    }, PREPARE_FAILURE_SUBDIRS);
  } catch { return fail("NGHS-PREPARE-FAILURE-WRITE"); }
}
/** The recorded preparation code of one launch, or null when none was recorded or the record is not exactly this launch's. */
export function readNativeGoldfishPrepareFailure({ commonDir, runner, sessionId, correlationId } = {}) {
  try {
    if (!safeRunner(runner) || !ID.test(sessionId ?? "") || !safeCorrelation(correlationId)) return null;
    const { value } = readPrivate(commonDir, key("prepare-failure", runner, `${sessionId}\0${correlationId}`), PREPARE_FAILURE_SUBDIRS);
    return exact(value, ["schema", "runner", "sessionId", "toolUseId", "code"]) && value.schema === NATIVE_GOLDFISH_PREPARE_FAILURE_SCHEMA
      && value.runner === runner && value.sessionId === sessionId && value.toolUseId === correlationId
      && typeof value.code === "string" && PREPARE_FAILURE_CODE.test(value.code) ? value.code : null;
  } catch { return null; }
}

/** Codex's SubagentStart lacks tool_use_id: permit only one exact waiting native dispatch. */
export function bindNativeCodexStart({ commonDir, input, nowEpochMs = Date.now() } = {}) {
  if (!ID.test(input?.session_id ?? "") || !ID.test(input?.agent_id ?? "")
    || input?.hook_event_name !== "SubagentStart" || !Number.isSafeInteger(nowEpochMs) || nowEpochMs < 0) return fail("NGHS-CODEX-START-INPUT");
  const dir = privateDirectory(commonDir, false);
  const observedAgentType = typeof input.agent_type === "string" ? input.agent_type : "";
  const expectedRole = observedAgentType.replace(/^pipeline-core:/u, "");
  const expectedModel = typeof input.model === "string" ? input.model : "";
  const claimedPendingFiles = new Set();
  for (const filename of readdirSync(dir)) {
    if (!filename.startsWith("agent-codex-") || !filename.endsWith(".json")) continue;
    try {
      const { value } = readPrivate(commonDir, filename);
      if (exact(value, ["schema", "runner", "sessionId", "agentId", "pendingFile", "pendingSha256", "agentType", "createdAtMs"])
        && value.schema === "pipeline.native-goldfish-host-agent-binding.v1"
        && value.runner === "codex" && value.sessionId === input.session_id
        && ID.test(value.agentId ?? "") && SHA.test(value.pendingSha256 ?? "")
        && typeof value.pendingFile === "string" && value.pendingFile.startsWith("pending-codex-")
        && value.pendingFile.endsWith(".json")) claimedPendingFiles.add(value.pendingFile);
    } catch { /* unreadable private association cannot claim a pending dispatch */ }
  }
  const candidates = [];
  for (const filename of readdirSync(dir)) {
    if (!filename.startsWith("pending-codex-") || !filename.endsWith(".json")) continue;
    if (claimedPendingFiles.has(filename)) continue;
    try {
      const { value } = readPrivate(commonDir, filename);
      if (nativeStateSchema(value.schema) && value.runner === "codex"
        && value.sessionId === input.session_id
        && (value.binding.adapterVersion === 2 ? value.binding.nativeAgentType === observedAgentType : value.binding.agentType === expectedRole)
        && value.binding.model === expectedModel && value.agentId === null
        && Number.isSafeInteger(value.createdAtMs) && nowEpochMs >= value.createdAtMs
        && nowEpochMs - value.createdAtMs <= NATIVE_GOLDFISH_CODEX_START_BINDING_TTL_MS) {
        candidates.push({ filename, value });
      }
    } catch { /* corrupt private evidence is never a match */ }
  }
  if (candidates.length !== 1) return fail(candidates.length === 0 ? "NGHS-CODEX-START-UNBOUND" : "NGHS-CODEX-START-AMBIGUOUS");
  const pending = candidates[0];
  const association = { schema: "pipeline.native-goldfish-host-agent-binding.v1", runner: "codex",
    sessionId: input.session_id, agentId: input.agent_id,
    pendingFile: pending.filename, pendingSha256: digest(Buffer.from(`${JSON.stringify(pending.value, null, 2)}\n`, "utf8")),
    agentType: pending.value.binding?.adapterVersion === 2 ? observedAgentType : expectedRole, createdAtMs: nowEpochMs };
  try { return publishNativeCodexAuthorityAssociation(commonDir, key("agent", "codex", `${input.session_id}\0${input.agent_id}`), association); }
  catch { return fail("NGHS-CODEX-ASSOCIATION-WRITE"); }
}

/** Read the pending Claude or Codex dispatch selected by the exact stop event. */
export function readNativeGoldfishPending({ commonDir, runner, sessionId, correlationId } = {}) {
  if (!safeRunner(runner) || !ID.test(sessionId ?? "") || !safeCorrelation(correlationId)) return fail("NGHS-READ-INPUT");
  try {
    const stored = readPrivate(commonDir, key("pending", runner, `${sessionId}\0${correlationId}`));
    const state = stored.value;
    if (!nativeStateSchema(state.schema) || state.runner !== runner
      || state.sessionId !== sessionId || state.toolUseId !== correlationId
      || !state.binding || !OID.test(state.binding.candidateCommit ?? "")) return fail("NGHS-READ-BINDING");
    return { ok: true, code: "NGHS-PENDING-READ", state: authenticatedNativePendingState(stored), sha256: stored.sha256 };
  } catch(error) { return { ...fail("NGHS-PENDING-MISSING"), reason:error.reason??error.message }; }
}

/** Resolve Codex's SubagentStop only through its write-once agent-start binding. */
export function readNativeCodexPending({ commonDir, input } = {}) {
  if (input?.hook_event_name !== "SubagentStop" || !ID.test(input?.session_id ?? "")
    || !ID.test(input?.agent_id ?? "")) return fail("NGHS-CODEX-READ-INPUT");
  try {
    const association = readPrivate(commonDir, key("agent", "codex", `${input.session_id}\0${input.agent_id}`)).value;
    if (!exact(association, ["schema", "runner", "sessionId", "agentId", "pendingFile", "pendingSha256", "agentType", "createdAtMs"])
      || association.schema !== "pipeline.native-goldfish-host-agent-binding.v1"
      || association.runner !== "codex" || association.sessionId !== input.session_id
      || association.agentId !== input.agent_id || !SHA.test(association.pendingSha256 ?? "")) return fail("NGHS-CODEX-ASSOCIATION");
    const pending = readPrivate(commonDir, association.pendingFile);
    if (pending.sha256 !== association.pendingSha256 || !nativeStateSchema(pending.value.schema)
      || pending.value.runner !== "codex" || pending.value.sessionId !== input.session_id
      || (pending.value.binding?.adapterVersion === 2
        ? pending.value.binding?.nativeAgentType !== association.agentType
        : pending.value.binding?.agentType !== association.agentType.replace(/^pipeline-core:/u, ""))) return fail("NGHS-CODEX-PENDING-BINDING");
    return { ok: true, code: "NGHS-CODEX-PENDING-READ", state: { ...authenticatedNativePendingState(pending), agentId: input.agent_id }, sha256: pending.sha256 };
  } catch { return fail("NGHS-CODEX-PENDING-MISSING"); }
}

export const nativeGoldfishHostStateInternals = Object.freeze({ key, privateDirectory, readPrivate, writeExclusive, toolFields, git });

// AUTH-I06: tokens are local to this owning module; wire records cannot mint them.
const nativeAuthorityPorts = new WeakMap(), nativeAuthorityOperations = new WeakMap(), nativeItemTerminals=new WeakMap();
const nativeAuthorityOwners = new Map();
function nativeAuthorityOwner(repository) {
  const repo = nativeManagedRepository(repository), identity = nativeManagedDigest({primaryRoot:repo.primaryRoot,commonDir:repo.commonDir});
  let owner = nativeAuthorityOwners.get(identity);
  if (!owner) { owner = {repository:repo,operations:new Map(),assurance:'physical-readback'}; nativeAuthorityOwners.set(identity,owner); }
  owner.repository=repo;
  return owner;
}
function nativeAuthorityScan(owner) {
  const [read] = readNativeManagedInventory(owner.repository,'native-goldfish');
  const byName = new Map(read.entries.map(entry=>[entry.relativePath,entry]));
  const pending = read.entries.filter(entry=>entry.relativePath.startsWith('pending-'));
  for (const entry of pending) {
    const state=entry.value;
    if((state.schema===NATIVE_GOLDFISH_ITEM_HOST_STATE_SCHEMA||state.delivery)&&(!exact(state.delivery,['itemId','sliceId','queuePath','queueSha256','writeScope'])
      ||!ID.test(state.delivery.itemId??'')||!ID.test(state.delivery.sliceId??'')||!SHA.test(state.delivery.queueSha256??'')
      ||!Array.isArray(state.delivery.writeScope)||state.delivery.writeScope.some(scope=>!normalizeScope(scope).ok)))throw nativeManagedFault('native-item-delivery-shape');
    if (!safeRunner(state.runner)||!ID.test(state.sessionId??'')||!safeCorrelation(state.toolUseId)
      ||state.root!==owner.repository.primaryRoot||state.commonDir!==owner.repository.commonDir
      ||!state.binding||!OID.test(state.binding.candidateCommit??'')
      ||entry.relativePath!==key('pending',state.runner,`${state.sessionId}\0${state.toolUseId}`)) throw nativeManagedFault('native-authority-pending-binding');
    if(state.schema===NATIVE_GOLDFISH_CONFIGURED_HOST_STATE_SCHEMA)recheckConfiguredNativeRoute(state);
    let operation=owner.operations.get(entry.relativePath);
    const retainedOwner=byName.get(`authority-owner-${entry.sourceFact.sha256}.json`);
    if(retainedOwner&&(!exact(retainedOwner.value,['schema','pendingSha256','association','bindingSha256'])||retainedOwner.value.pendingSha256!==entry.sourceFact.sha256
      ||!SHA.test(retainedOwner.value.bindingSha256)))throw nativeManagedFault('native-authority-owner-binding');
    if (!operation) {
      const handle=Object.freeze({});
      operation={handle,name:entry.relativePath,association:retainedOwner?nativeManagedAssociation(retainedOwner.value.association):{state:'unbound',target:null},
        bindingSha256:retainedOwner?.value.bindingSha256??nativeManagedDigest({repository:{primaryRoot:owner.repository.primaryRoot,commonDir:owner.repository.commonDir},runner:state.runner,sessionId:state.sessionId,correlation:state.toolUseId,dispatchId:state.binding.dispatchId,candidate:state.binding.candidateCommit}),
        phase:'armed',pendingSha256:entry.sourceFact.sha256};
      nativeAuthorityOperations.set(handle,{owner,operation});owner.operations.set(entry.relativePath,operation);
    }
    if (operation.pendingSha256 && operation.pendingSha256!==entry.sourceFact.sha256) throw nativeManagedFault('native-authority-pending-drift');
    const scopes=nativeScopeAmendments(read,entry,operation);
    const terminal=byName.get(`authority-terminal-${entry.sourceFact.sha256}.json`);
    if(terminal){
      const value=terminal.value;
      if(!exact(value,['schema','pendingSha256','bindingSha256','terminalAssociationSha256','observationSha256','recordSha256'])
        ||value.pendingSha256!==entry.sourceFact.sha256||value.bindingSha256!==operation.bindingSha256
        ||![value.terminalAssociationSha256,value.observationSha256,value.recordSha256].every(v=>SHA.test(v)))throw nativeManagedFault('native-authority-terminal-binding');
      const receipt=read.entries.find(e=>e.relativePath.startsWith('observation-')&&e.sourceFact.sha256===value.observationSha256);
      if(!receipt||receipt.value.runner!==state.runner||receipt.value.dispatchId!==state.binding.dispatchId
        ||receipt.value.sessionId!==state.sessionId||receipt.value.toolUseId!==state.toolUseId
        ||receipt.value.candidateCommit!==state.binding.candidateCommit||receipt.value.recordSha256!==value.recordSha256)throw nativeManagedFault('native-authority-terminal-observation');
      if(receipt.value.schema==='pipeline.native-goldfish-host-observation.v3'){
        let parent=state.binding.candidateCommit;
        for(const proof of receipt.value.foreignCommits){
          const foreign=read.entries.find(row=>row.relativePath.startsWith('pending-')&&row.sourceFact.sha256===proof.pendingSha256),terminal=byName.get(`authority-terminal-${proof.pendingSha256}.json`),observed=read.entries.find(row=>row.sourceFact.sha256===proof.observationSha256);
          if(!foreign?.value.binding.itemDelivery||proof.pendingSha256===entry.sourceFact.sha256||!terminal||terminal.value.observationSha256!==proof.observationSha256||!observed||observed.value.commit!==proof.commit||observed.value.parent!==parent||git(owner.repository.primaryRoot,['rev-list','--parents','-n','1',proof.commit])!==`${proof.commit} ${parent}`||scopesOverlap(effectiveNativePendingState(read,foreign).binding.allowedPaths,state.binding.allowedPaths))throw nativeManagedFault('native-concurrent-receipt-lineage');
          parent=proof.commit;
        }
        if(parent!==receipt.value.parent)throw nativeManagedFault('native-concurrent-receipt-parent');
      }
      operation.phase='terminal-observed';
    }
    if(retainedOwner&&(JSON.stringify(retainedOwner.value.association)!==JSON.stringify(operation.association)||retainedOwner.value.bindingSha256!==operation.bindingSha256))throw nativeManagedFault('native-authority-owner-drift');
    const check=byName.get(`authority-check-${entry.sourceFact.sha256}.json`);
    if(check&&(!terminal||!exact(check.value,['schema','pendingSha256','bindingSha256','evidence'])||check.value.pendingSha256!==entry.sourceFact.sha256
      ||check.value.bindingSha256!==operation.bindingSha256||check.value.evidence?.schema!=='pipeline.item-targeted-checks.v1'))throw nativeManagedFault('native-item-check-binding');
    const rechecks=read.entries.filter(row=>row.relativePath.startsWith(`authority-recheck-${entry.sourceFact.sha256}-`)).sort((a,b)=>a.value.revision-b.value.revision);
    let qualified=check;
    for(const [index,row] of rechecks.entries()) {
      const value=row.value,briefing=state.binding.itemDelivery;
      if(!qualified||!briefing||!exact(value,['schema','pendingSha256','bindingSha256','revision','previousCheckSha256','changedPaths','impactedCheckIds','evidence'])
        ||value.pendingSha256!==entry.sourceFact.sha256||value.bindingSha256!==operation.bindingSha256||value.revision!==index+1||value.revision>64
        ||value.previousCheckSha256!==qualified.sourceFact.sha256||!exact(value.evidence,['schema','candidate','contractSha256','files','results','verdict'])
        ||value.evidence.schema!=='pipeline.item-targeted-checks.v1'||value.evidence.contractSha256!==check.value.evidence.contractSha256)throw nativeManagedFault('native-item-recheck-binding');
      const changed=changedItemDependencies(qualified.value.evidence,value.evidence);
      const impacted=briefing.checks.filter(check=>check.dependencies.some(path=>changed.includes(path))).map(check=>check.id);
      if(!impacted.length||briefing.checks.some(check=>changed.includes(check.path))||nativeManagedDigest(changed)!==nativeManagedDigest(value.changedPaths)
        ||nativeManagedDigest(impacted)!==nativeManagedDigest(value.impactedCheckIds)||value.evidence.results.length!==briefing.checks.length)throw nativeManagedFault('native-item-recheck-impact');
      for(const [i,result] of value.evidence.results.entries()) {
        const checkContract=briefing.checks[i],previous=qualified.value.evidence.results.find(result=>result.id===checkContract.id);
        if(!previous||result.id!==checkContract.id||result.path!==checkContract.path)throw nativeManagedFault('native-item-recheck-result-binding');
        if(impacted.includes(result.id)) {
          if(result.reusedFromSha256!==null||nativeManagedDigest(result.executionCandidate)!==nativeManagedDigest(value.evidence.candidate))throw nativeManagedFault('native-item-recheck-execution-binding');
        } else {
          const expected={...previous,executionCandidate:previous.executionCandidate??qualified.value.evidence.candidate,reusedFromSha256:qualified.sourceFact.sha256};
          if(nativeManagedDigest(result)!==nativeManagedDigest(expected))throw nativeManagedFault('native-item-recheck-reuse-binding');
        }
      }
      if(value.evidence.verdict!==(value.evidence.results.every(result=>result.status===0&&!result.signal&&!result.error)?'passed':'failed'))throw nativeManagedFault('native-item-recheck-verdict');
      qualified=row;
    }
    const integrated=byName.get(`authority-integration-${entry.sourceFact.sha256}.json`);
    if(integrated&&(!check||!exact(integrated.value,['schema','pendingSha256','bindingSha256','kind','itemId','sliceId','mainCandidate','checkSha256','recordSha256','files'])
      ||integrated.value.pendingSha256!==entry.sourceFact.sha256||integrated.value.bindingSha256!==operation.bindingSha256||integrated.value.kind!=='integrated'
      ||integrated.value.itemId!==state.delivery?.itemId||integrated.value.sliceId!==state.delivery?.sliceId||integrated.value.checkSha256!==qualified.sourceFact.sha256
      ||integrated.value.recordSha256!==terminal?.value.recordSha256))throw nativeManagedFault('native-item-integration-binding');
    const checkpoints=read.entries.filter(row=>row.relativePath.startsWith(`authority-checkpoint-${entry.sourceFact.sha256}-`)).sort((a,b)=>a.value.revision-b.value.revision);
    for(const [index,row] of checkpoints.entries())if(!exact(row.value,['schema','pendingSha256','bindingSha256','revision','checkpoint'])
      ||row.value.pendingSha256!==entry.sourceFact.sha256||row.value.bindingSha256!==operation.bindingSha256||row.value.revision!==index+1
      ||!validItemCheckpoint(row.value.checkpoint))throw nativeManagedFault('native-item-checkpoint-binding');
    operation.sourceFacts=[entry.sourceFact,...scopes.map(row=>row.sourceFact),...(retainedOwner?[retainedOwner.sourceFact]:[]),...(terminal?[terminal.sourceFact]:[]),...(check?[check.sourceFact]:[]),...rechecks.map(row=>row.sourceFact),...(integrated?[integrated.sourceFact]:[]),...checkpoints.map(row=>row.sourceFact)];
  }
  for(const entry of read.entries.filter(e=>e.relativePath.startsWith('agent-'))){
    const association=entry.value,selected=byName.get(association.pendingFile);
    if(!selected||association.pendingSha256!==selected.sourceFact.sha256||association.runner!=='codex'
      ||association.sessionId!==selected.value.sessionId||!ID.test(association.agentId??''))throw nativeManagedFault('native-authority-agent-unresolved');
    owner.operations.get(association.pendingFile).sourceFacts.push(entry.sourceFact);
    if(owner.operations.get(association.pendingFile).phase!=='terminal-observed')owner.operations.get(association.pendingFile).phase='running';
  }
  for(const operation of owner.operations.values())if(operation.pendingSha256&&!byName.has(operation.name))throw nativeManagedFault('native-authority-missing-pending');
  const pendingHashes=new Set(pending.map(entry=>entry.sourceFact.sha256));
  for(const entry of read.entries.filter(e=>e.relativePath.startsWith('authority-')))if(!pendingHashes.has(entry.value.pendingSha256))throw nativeManagedFault('native-authority-orphan-prefix');
  return read;
}
function nativeScopeAmendments(read,entry,operation) {
  const rows=read.entries.filter(row=>row.relativePath.startsWith(`authority-scope-${entry.sourceFact.sha256}-`)).sort((a,b)=>a.value.revision-b.value.revision);
  let paths=entry.value.binding.allowedPaths,scope=entry.value.delivery?.writeScope,previous=entry.sourceFact.sha256;
  for(const [index,row] of rows.entries()) {
    const value=row.value,checks=entry.value.binding.itemDelivery?.checks;
    if(!checks||!exact(value,['schema','pendingSha256','bindingSha256','revision','previousScopeSha256','allowedPaths','writeScope','queuePreimageSha256','queuePostimageSha256'])
      ||value.pendingSha256!==entry.sourceFact.sha256||value.bindingSha256!==operation.bindingSha256||value.revision!==index+1||value.revision>64
      ||value.previousScopeSha256!==previous||![value.queuePreimageSha256,value.queuePostimageSha256].every(hash=>SHA.test(hash))
      ||!Array.isArray(value.allowedPaths)||!Array.isArray(value.writeScope)||value.allowedPaths.length>64||value.writeScope.length>64
      ||paths.some(path=>!value.allowedPaths.includes(path))||scope.some(path=>!value.writeScope.includes(path))
      ||value.allowedPaths.length!==new Set(value.allowedPaths).size||value.writeScope.length!==new Set(value.writeScope).size
      ||value.allowedPaths.some(path=>!normalizeScope(path).ok||!checks.some(check=>check.dependencies.includes(path)))
      ||value.writeScope.some(path=>!value.allowedPaths.includes(path))||value.allowedPaths.some(path=>!value.writeScope.includes(path)))throw nativeManagedFault('native-item-scope-amendment-binding');
    paths=value.allowedPaths;scope=value.writeScope;previous=row.sourceFact.sha256;
  }
  return rows;
}
function effectiveNativePendingState(read,entry) {
  const operation=[...nativeAuthorityOwners.get(nativeManagedDigest({primaryRoot:entry.value.root,commonDir:entry.value.commonDir})).operations.values()].find(row=>row.pendingSha256===entry.sourceFact.sha256);
  if(!operation)throw nativeManagedFault('native-item-scope-operation-unowned');
  const latest=nativeScopeAmendments(read,entry,operation).at(-1);
  return latest?{...entry.value,binding:{...entry.value.binding,allowedPaths:latest.value.allowedPaths},delivery:{...entry.value.delivery,writeScope:latest.value.writeScope}}:entry.value;
}
function authenticatedNativePendingState(stored) {
  if(!stored.value.delivery)return stored.value;
  const repository=inspectSignedDescriptorCustodyRepository(stored.value.root);
  return withSessionAuthorityBoundary({repository},boundary=>{
    const owner=nativeAuthorityOwner(repository),port=createNativeGoldfishAuthorityProducerPort({repository});
    const read=nativeAuthorityScan(owner),entry=read.entries.find(row=>row.sourceFact.sha256===stored.sha256&&row.relativePath.startsWith('pending-'));
    if(!entry)throw nativeManagedFault('native-item-scope-pending-unowned');
    const selected=[...owner.operations.values()].find(row=>row.pendingSha256===entry.sourceFact.sha256);
    inspectSourceOwnedNativeDispatchPendingRecord({boundary,producerPort:port,operationHandle:selected.handle});
    const state=effectiveNativePendingState(read,entry),governed=resolveGovernedItemQueue({root:repository.primaryRoot});
    const item=governed.status==='required'?governed.normalized.slices.find(row=>row.id===state.delivery.sliceId):null;
    if(!item||nativeManagedDigest(item.writeScope)!==nativeManagedDigest(state.delivery.writeScope))throw nativeManagedFault('native-item-scope-queue-recovery-required');
    if(!state.binding.itemDelivery)return state; // retained basic legacy contract
    const original=state.binding.itemDelivery,approval=observeCurrentPlanApprovalForCalibration({rootDir:repository.primaryRoot});
    if(item.delivery.itemId!==original.itemId||item.delivery.baseCommit!==state.binding.candidateCommit||approval.status!=='eligible'
      ||item.delivery.approvalSha256!==approval.approvalSha256||nativeManagedDigest(item.delivery.criterionLocator)!==nativeManagedDigest(original.criterionLocator)
      ||nativeManagedDigest(item.delivery.checks)!==nativeManagedDigest(original.checks))throw nativeManagedFault('native-item-original-queue-binding-drift');
    // Governed runtime metadata may gain another independent item. This Source
    // member/original-approval join authorizes only its current queue bytes;
    // every other prelaunch untracked file remains immutable. The queue is
    // never thereby admitted as a product write or a completed dependency.
    return {...state,baseline:{...state.baseline,untracked:state.baseline.untracked.map(row=>row.path===state.delivery.queuePath?{...row,sha256:governed.sha256}:row)}};
  });
}
/** Current reservations are read from the real Source member, including additive
 * amendments. Historical terminal prose never frees the paths. */
export function readNativeReservedItemScopes({repository,boundary}={}) {
  const owner=nativeAuthorityOwner(repository),port=createNativeGoldfishAuthorityProducerPort({repository});
  const producer=inspectSourceOwnedSessionAuthorityProducerRecord({boundary,producerPort:port});
  const released=new Set(producer.record.members.map(row=>inspectSourceOwnedSessionAuthorityMemberRecord({boundary,producerPort:port,memberRef:row.memberRef}).record).filter(row=>row.phase==='released').map(row=>row.bindingSha256));
  const read=nativeAuthorityScan(owner),reservations=[],settled=readSettledItemSliceIds({repository,boundary});
  for(const entry of read.entries.filter(row=>row.relativePath.startsWith('pending-'))) {
    const operation=[...owner.operations.values()].find(row=>row.pendingSha256===entry.sourceFact.sha256);
    if(released.has(operation.bindingSha256))continue;
    const state=effectiveNativePendingState(read,entry);
    if(settled.has(state.delivery?.sliceId))continue;
    reservations.push({pendingSha256:entry.sourceFact.sha256,sliceId:state.delivery?.sliceId??null,itemId:state.delivery?.itemId??null,criterionSha256:state.binding.itemDelivery?nativeManagedDigest(state.binding.itemDelivery.criterionLocator):null,writeScope:state.delivery?.writeScope??state.binding.allowedPaths});
  }
  return {reservations};
}

const nativeConcurrentAuthorities=new WeakMap();
function nativeConcurrentPlan({repository,boundary,allowedPaths,baseCommit,ownPendingSha256,expectedRef}) {
  const owner=nativeAuthorityOwner(repository),port=createNativeGoldfishAuthorityProducerPort({repository}),current=nativeManagedCurrentOwner(repository);
  if(current.association.state!=='bound')throw nativeManagedFault('native-concurrent-owner-unbound');
  const producer=inspectSourceOwnedSessionAuthorityProducerRecord({boundary,producerPort:port});
  const members=new Map(producer.record.members.map(row=>{const record=inspectSourceOwnedSessionAuthorityMemberRecord({boundary,producerPort:port,memberRef:row.memberRef}).record;return [record.bindingSha256,record];}));
  const read=nativeAuthorityScan(owner),foreignPaths=new Set(),foreignCommits=[],settled=readSettledItemSliceIds({repository,boundary});
  for(const entry of read.entries.filter(row=>row.relativePath.startsWith('pending-')&&row.sourceFact.sha256!==ownPendingSha256)) {
    const pending=effectiveNativePendingState(read,entry),operation=[...owner.operations.values()].find(row=>row.pendingSha256===entry.sourceFact.sha256),member=members.get(operation.bindingSha256);
    if(!member||!pending.binding.itemDelivery||!pending.delivery||operation.association.state!=='bound')continue;
    // D51 (2): an integrated or cancelled foreign slice no longer collides. Its paths and its commit stay
    // known below, so a commit it already landed is still recognised as foreign (NGHS17).
    if(!settled.has(pending.delivery.sliceId)&&scopesOverlap(pending.delivery.writeScope,allowedPaths))throw reservationFault('native-concurrent-scope-collision',pending.delivery.sliceId);
    // Literal, retained original item scopes are the only foreign dirty paths.
    if(member.phase!=='released')for(const path of pending.binding.allowedPaths)foreignPaths.add(path);
    const terminal=read.entries.find(row=>row.relativePath===`authority-terminal-${entry.sourceFact.sha256}.json`);
    if(terminal){const observed=read.entries.find(row=>row.sourceFact.sha256===terminal.value.observationSha256);
      if(!observed||!observed.value.changedPaths.every(path=>pending.binding.allowedPaths.includes(path)))throw nativeManagedFault('native-concurrent-foreign-observation');
      const associationPath=`evidence/dispatch-attempt-terminal-${pending.binding.dispatchId}.json`,associationBytes=readFileSync(join(repository.primaryRoot,associationPath));
      if(nativeManagedDigest(associationBytes)!==terminal.value.terminalAssociationSha256)throw nativeManagedFault('native-concurrent-public-terminal');
      const association=parseStrictJson(associationBytes);
      const references=[{path:associationPath,sha256:terminal.value.terminalAssociationSha256},{path:association.terminalPath,sha256:terminal.value.recordSha256},{path:association.admissionPath,sha256:association.admissionSha256},{path:`evidence/dispatch-attempt-${pending.binding.dispatchId}.json`,sha256:association.openingSha256}];
      for(const ref of references){const absolute=resolve(repository.primaryRoot,ref.path),stat=lstatSync(absolute);if(!SHA.test(ref.sha256)||relative(repository.primaryRoot,absolute).startsWith('..')||realpathSync(absolute)!==absolute||!stat.isFile()||stat.isSymbolicLink()||nativeManagedDigest(readFileSync(absolute))!==ref.sha256)throw nativeManagedFault('native-concurrent-public-source');foreignPaths.add(ref.path);}
      foreignCommits.push({pendingSha256:entry.sourceFact.sha256,observationSha256:observed.sourceFact.sha256,commit:observed.value.commit});}
  }
  const governed=resolveGovernedItemQueue({root:repository.primaryRoot});
  if(governed.status!=='required')throw nativeManagedFault('native-concurrent-governed-queue');
  if(allowedPaths.includes(governed.path))throw nativeManagedFault('native-concurrent-runtime-queue-product-scope');
  foreignPaths.add(governed.path); // exact governed writer metadata, never a product stage
  const reference=git(repository.primaryRoot,['symbolic-ref','-q','HEAD']);
  if(expectedRef!==undefined&&reference!==expectedRef)throw nativeManagedFault('native-concurrent-reference-drift');
  const head=git(repository.primaryRoot,['rev-parse','HEAD']),ancestor=spawnSync('git',['-C',repository.primaryRoot,'merge-base','--is-ancestor',baseCommit,head],{env:agyHostGitEnvironment(),shell:false,timeout:10000});
  if(ancestor.error||ancestor.status!==0)throw nativeManagedFault('native-concurrent-unowned-head');
  const commits=git(repository.primaryRoot,['rev-list','--reverse','--first-parent',`${baseCommit}..${head}`]);
  if(commits===null)throw nativeManagedFault('native-concurrent-head-unavailable');
  if(commits.split('\n').filter(Boolean).length>64)throw nativeManagedFault('native-concurrent-lineage-record-bound');
  let parent=baseCommit;const lineage=[];
  for(const commit of commits.split('\n').filter(Boolean)){
    const parents=git(repository.primaryRoot,['rev-list','--parents','-n','1',commit])?.split(' '),proof=foreignCommits.find(row=>row.commit===commit);
    if(!proof||parents?.length!==2||parents[1]!==parent)throw nativeManagedFault('native-concurrent-unowned-head');
    const observed=read.entries.find(row=>row.sourceFact.sha256===proof.observationSha256);
    if(observed.value.parent!==parent)throw nativeManagedFault('native-concurrent-parent-proof');
    lineage.push(proof);parent=commit;
  }
  return {root:repository.primaryRoot,reference,baseCommit,parentCommit:head,foreignPaths:[...foreignPaths].sort(),foreignCommits:lineage};
}
function mintNativeConcurrentAuthority(input){const handle=Object.freeze({});nativeConcurrentAuthorities.set(handle,{input,plan:nativeConcurrentPlan(input)});return handle;}
/** Opaque, live Source-bound authority, consumed only during the existing mutex. */
export function inspectSourceOwnedNativeConcurrentAuthority(authority,{root}={}){
  const held=nativeConcurrentAuthorities.get(authority);
  if(!held||resolve(root)!==held.plan.root||realpathSync(resolve(root))!==held.plan.root)throw nativeManagedFault('native-concurrent-unowned-authority');
  const actual=nativeConcurrentPlan(held.input);
  if(nativeManagedDigest(actual)!==nativeManagedDigest(held.plan))throw nativeManagedFault('native-concurrent-authority-drift');
  return actual;
}
export function withSourceOwnedNativeConcurrentCommit({root,pendingSha256},callback){
  const repository=inspectSignedDescriptorCustodyRepository(root),owner=nativeAuthorityOwner(repository);
  return withSessionAuthorityBoundary({repository},boundary=>{
    const read=nativeAuthorityScan(owner),entry=read.entries.find(row=>row.sourceFact.sha256===pendingSha256&&row.relativePath.startsWith('pending-'));
    if(!entry?.value.binding.itemDelivery)throw nativeManagedFault('native-concurrent-original-item-required');
    if(entry.value.baseline?.schema!==NATIVE_CONCURRENT_HOST_COMMIT_BASELINE_SCHEMA)throw nativeManagedFault('native-concurrent-legacy-baseline-rebind-required');
    const operation=[...owner.operations.values()].find(row=>row.pendingSha256===pendingSha256),current=nativeManagedCurrentOwner(repository);
    if(nativeManagedDigest(current.association)!==nativeManagedDigest(operation.association))throw nativeManagedFault('native-concurrent-original-owner');
    const pending=effectiveNativePendingState(read,entry),authority=mintNativeConcurrentAuthority({repository,boundary,allowedPaths:pending.binding.allowedPaths,baseCommit:pending.binding.candidateCommit,ownPendingSha256:pendingSha256,expectedRef:pending.baseline.nativeRef});
    try{return callback(authority);}finally{nativeConcurrentAuthorities.delete(authority);}
  });
}

function nativeAuthorityObserve(owner,handle){
  const entry=nativeAuthorityOperations.get(handle);
  if(!entry||entry.owner!==owner)throw nativeManagedFault('native-authority-operation-unowned');
  nativeAuthorityScan(owner);const operation=entry.operation;
  return {association:operation.association,kinds:['dispatch'],phase:operation.phase,bindingSha256:operation.bindingSha256,sourceFacts:operation.sourceFacts??[]};
}
export function createNativeGoldfishAuthorityProducerPort({repository}={}){
  const owner=nativeAuthorityOwner(repository);
  if(owner.port)return owner.port;
  const port=Object.freeze({
    readBaseline(){const read=nativeAuthorityScan(owner);return {memberships:[read.membership],legacyOperations:[...owner.operations.values()].filter(o=>o.phase!=='terminal-observed').map(o=>o.handle)};},
    observeOperation:handle=>nativeAuthorityObserve(owner,handle),
    observeTerminal(handle){
      const item=nativeItemTerminals.get(handle);
      if(item){
        if(item.owner!==owner)throw nativeManagedFault('native-item-terminal-owner');
        const read=nativeAuthorityScan(owner),record=read.entries.find(row=>row.relativePath===`authority-integration-${item.pendingSha256}.json`);
        if(!record||record.sourceFact.sha256!==item.integrationSha256)throw nativeManagedFault('native-item-terminal-cas');
        const operation=[...owner.operations.values()].find(row=>row.pendingSha256===item.pendingSha256);
        return {terminal:'completed',sourceFacts:nativeAuthorityObserve(owner,operation.handle).sourceFacts};
      }
      const terminal=inspectNativeGoldfishAuthorityTerminal({repository:owner.repository,terminalHandle:handle});
      const operation=[...owner.operations.values()].find(o=>o.pendingSha256===terminal.pendingSha256);
      if(!operation||operation.phase!=='terminal-observed')throw nativeManagedFault('native-authority-terminal-unobserved');
      const observed=nativeAuthorityObserve(owner,operation.handle);return {terminal:'completed',sourceFacts:observed.sourceFacts};},
    reconcile({memberRecords}){const read=nativeAuthorityScan(owner);
      for(const operation of owner.operations.values()){
        const records=memberRecords.filter(m=>m.bindingSha256===operation.bindingSha256);
        if(records.length===0&&operation.phase==='reserved'&&!operation.pendingSha256)continue;
        if(records.length===0&&operation.phase==='terminal-observed')continue;
        if(records.length!==1)throw nativeManagedFault('native-authority-member-coverage');
        const member=records[0],observed=nativeAuthorityObserve(owner,operation.handle);
        if(nativeManagedDigest(member.association)!==nativeManagedDigest(observed.association)
          ||member.phase!=='released'&&member.phase!==observed.phase
          ||member.phase==='released'&&observed.phase!=='terminal-observed'
          ||nativeManagedDigest(member.sourceFacts)!==nativeManagedDigest(observed.sourceFacts))throw nativeManagedFault('native-authority-member-drift');
      }return [read.membership];},
    readAssurance:()=>owner.assurance,
  });nativeAuthorityPorts.set(port,owner);owner.port=port;return port;
}
export function isOwnedNativeGoldfishAuthorityProducerPort(port,{repository}={}){
  try{return nativeAuthorityPorts.get(port)===nativeAuthorityOwner(repository);}catch{return false;}
}
function configuredNativeCodexRoute(state) {
  const duties={"pipeline-core:goldfish-implementor":"implement","pipeline-core:goldfish-deep":"deep","pipeline-core:goldfish-mechanic":"mechanic"};
  const dutyId=duties[state.binding.role];
  if(state.runner!=="codex"||!dutyId)throw nativeManagedFault("native-configured-role-unavailable");
  const activation=createModelFamilyRuntimeHost({cwd:state.root,resolveCommonDir:()=>state.commonDir}).observeActivation();
  if(!activation.ok||activation.status!=="inactive")throw nativeManagedFault(activation.status==="active"?"native-configured-family-port-required":"native-configured-family-uncertain");
  const route=resolveV3DutyRoute({rootDir:state.root,dutyId,runner:"codex",candidateCommit:state.binding.candidateCommit});
  const current=resolveV3DutyRoute({rootDir:state.root,dutyId,runner:"codex"});
  const sourcePath=join(state.root,"pipeline.user.yaml"),before=lstatSync(sourcePath),bytes=readFileSync(sourcePath),after=lstatSync(sourcePath);
  if(!before.isFile()||before.isSymbolicLink()||before.nlink!==1||before.size>1024*1024||realpathSync(sourcePath)!==sourcePath||before.ino!==after.ino||before.dev!==after.dev||before.size!==after.size||before.mtimeMs!==after.mtimeMs||before.ctimeMs!==after.ctimeMs||digest(bytes)!==route.sourceSha256||current.sourceSha256!==route.sourceSha256)throw nativeManagedFault("native-configured-source-drift");
  const reference=git(state.root,["symbolic-ref","-q","HEAD"]);
  if(!reference||route.state!=="default"||route.model!==state.binding.model||route.effort!==state.binding.effort)throw nativeManagedFault("native-configured-route-mismatch");
  return {schema:"pipeline.native-goldfish-configured-route.v1",root:state.root,commonDir:state.commonDir,runner:"codex",role:state.binding.role,dutyId,candidateCommit:state.binding.candidateCommit,candidateTree:state.binding.candidateTree,reference,model:route.model,effort:route.effort,sourceSha256:route.sourceSha256};
}
function recheckConfiguredNativeRoute(state) {
  if(state.schema!==NATIVE_GOLDFISH_CONFIGURED_HOST_STATE_SCHEMA||!exact(state.configuredRoute,["schema","root","commonDir","runner","role","dutyId","candidateCommit","candidateTree","reference","model","effort","sourceSha256"]))throw nativeManagedFault("native-configured-route-required");
  const actual=configuredNativeCodexRoute(state);
  if(nativeManagedDigest(actual)!==nativeManagedDigest(state.configuredRoute))throw nativeManagedFault("native-configured-route-stale");
  return Object.freeze(actual);
}
/** Reads original retained Source member and its configured intent. Never host model proof. */
export function inspectSourceOwnedNativeConfiguredRoute(input={}) {
  if(!exact(input,["root","pendingSha256"]))throw nativeManagedFault("native-configured-input");
  const {root,pendingSha256}=input;
  const repository=inspectSignedDescriptorCustodyRepository(root),owner=nativeAuthorityOwner(repository);
  return withSessionAuthorityBoundary({repository},boundary=>{
    const read=nativeAuthorityScan(owner),entry=read.entries.find(row=>row.relativePath.startsWith("pending-")&&row.sourceFact.sha256===pendingSha256);
    if(!entry||entry.value.runner!=="codex")throw nativeManagedFault("native-configured-pending-unowned");
    const operation=[...owner.operations.values()].find(row=>row.pendingSha256===pendingSha256),current=nativeManagedCurrentOwner(repository);
    if(!operation||nativeManagedDigest(operation.association)!==nativeManagedDigest(current.association))throw nativeManagedFault("native-configured-original-owner");
    inspectSourceOwnedNativeDispatchPendingRecord({boundary,producerPort:createNativeGoldfishAuthorityProducerPort({repository}),operationHandle:operation.handle});
    return recheckConfiguredNativeRoute(entry.value);
  });
}

export function inspectSourceOwnedNativeConfiguredObservation({root,sessionId,toolUseId,model,effort,candidateCommit,candidateTree,role}={}) {
  const repository=inspectSignedDescriptorCustodyRepository(root),owner=nativeAuthorityOwner(repository);
  return withSessionAuthorityBoundary({repository},boundary=>{
    const read=nativeAuthorityScan(owner),entry=read.entries.find(row=>row.relativePath===key("pending","codex",`${sessionId}\0${toolUseId}`));
    if(!entry||entry.value.root!==repository.primaryRoot||entry.value.runner!=="codex"||entry.value.sessionId!==sessionId||entry.value.toolUseId!==toolUseId)throw nativeManagedFault("native-configured-observation-pending");
    const operation=[...owner.operations.values()].find(row=>row.pendingSha256===entry.sourceFact.sha256);
    if(!operation||operation.association.state!=="bound")throw nativeManagedFault("native-configured-observation-unowned");
    inspectSourceOwnedNativeDispatchPendingRecord({boundary,producerPort:createNativeGoldfishAuthorityProducerPort({repository}),operationHandle:operation.handle});
    const actual=recheckConfiguredNativeRoute(entry.value);
    if(actual.model!==model||actual.effort!==effort||actual.candidateCommit!==candidateCommit||actual.candidateTree!==candidateTree||actual.role!==role)throw nativeManagedFault("native-configured-observation-route");
    return {status:"observed",configuredRouteSha256:nativeManagedDigest(actual),pendingSha256:entry.sourceFact.sha256};
  });
}

function publishNativeAuthorityState(commonDir,name,state){
  const repository=inspectSignedDescriptorCustodyRepository(state.root);
  if(repository.commonDir!==commonDir)throw nativeManagedFault('native-authority-common-drift');
  // PF-52: a catalogue left by another plugin version is moved aside before presence is decided.
  if(nativeManagedRegistryPresent(repository))migrateSourceUpdatedSessionAuthorityRegistry({repository});
  if(!nativeManagedRegistryPresent(repository)) {
    if(!state.delivery)return writeExclusive(commonDir,name,state);
    // D44: no production route created the session-authority registry, so the first governed item
    // dispatch in a real repository creates it here (idempotent), then continues on the registry path.
    const initialized=initializeSessionAuthorityRegistry({repository},createSessionAuthorityParticipantPorts({repository}));
    if(!['initialized','already-initialized'].includes(initialized.status)||!nativeManagedRegistryPresent(repository))throw nativeManagedFault(`item-delivery-registry-initialization-failed (${initialized.reason??initialized.status})`);
  }
  const owner=nativeAuthorityOwner(repository),current=nativeManagedCurrentOwner(repository),port=createNativeGoldfishAuthorityProducerPort({repository});
  const handle=Object.freeze({}),operation={handle,name,association:current.association,
    bindingSha256:nativeManagedDigest({repository:{primaryRoot:repository.primaryRoot,commonDir:repository.commonDir},runner:state.runner,sessionId:state.sessionId,correlation:state.toolUseId,dispatchId:state.binding.dispatchId,candidate:state.binding.candidateCommit}),phase:'reserved',sourceFacts:[],pendingSha256:null};
  if(owner.operations.has(name))throw nativeManagedFault('native-authority-duplicate-operation');
  owner.assurance=current.assurance;
  return withSessionAuthorityBoundary({repository},boundary=>{
    if(state.runner==="codex"){state.configuredRoute=configuredNativeCodexRoute(state);state.schema=NATIVE_GOLDFISH_CONFIGURED_HOST_STATE_SCHEMA;}
    if(state.delivery){
      const governed=resolveGovernedItemQueue({root:state.root});
      if(governed.status!=='required'||governed.sha256!==state.delivery.queueSha256)throw nativeManagedFault('item-delivery-queue-drift');
      if(current.association.state!=='bound')throw nativeManagedFault('item-delivery-owner-unbound');
      const item=governed.normalized.slices.find(row=>row.id===state.delivery.sliceId);
      if(!item||item.state!=='ready')throw nativeManagedFault('item-delivery-not-ready');
      // PF-49: one integration source for every check of a dispatch — native records united with the D40 commit
      // evidence, exactly as observeGovernedItemIntegrationReadiness reads it for the admission before this.
      const integration=readNativeIntegratedSlices({governed,repository,boundary});
      const integratedIds=new Set([...integration.integrated,...readOrchestratorCommitIntegratedSlices({root:repository.primaryRoot,candidateCommit:repository.candidate.commit,slices:governed.normalized.slices})]);
      const heldIds=item.dependsOn.filter(id=>!integratedIds.has(id));
      if(heldIds.length)throw nativeManagedFault(`item-delivery-integration-dependency-held: ${heldDependencyReason(heldIds,governed.normalized.slices)}`);
      const agy=readAgyAuthorityInventory({repository,namespaceIds:['registered-opaque-context-lifetimes']});
      const agyPort=createAgyFamilyDispatchAuthorityProducerPort({repository});
      const agyProducer=inspectSourceOwnedSessionAuthorityProducerRecord({boundary,producerPort:agyPort});
      const agyReleased=new Set(agyProducer.record.members.map(row=>inspectSourceOwnedSessionAuthorityMemberRecord({boundary,producerPort:agyPort,memberRef:row.memberRef}).record).filter(row=>row.phase==='released').map(row=>row.bindingSha256));
      const rank={'reserved':0,'armed':1,'running':2,'terminal-observed':3},latest=new Map();
      for(const row of agy.entries.filter(value=>value.value?.basis?.itemDelivery)) {
        const prior=latest.get(row.value.operationId);
        if(!prior||(rank[row.value.phase]??0)>(rank[prior.value.phase]??0)||row.value.phase===prior.value.phase&&(row.value.revision??0)>(prior.value.revision??0))latest.set(row.value.operationId,row);
      }
      // D51 (2): a reservation whose slice is integrated (native record or D40/D40b commit evidence) or cancelled no longer collides.
      const settled=settledItemSlices(integratedIds,governed);
      for(const entry of [...latest.values()].filter(row=>!agyReleased.has(row.value.bindingSha256)&&!settled.has(row.value.basis.itemDelivery.sliceId))) {
        const pending=entry.value.basis.itemDelivery;
        if(pending.itemId===state.delivery.itemId)throw reservationFault('item-delivery-owner-collision',pending.sliceId);
        if(state.binding.itemDelivery&&entry.value.basis?.itemBriefing?.criterionLocator&&nativeManagedDigest(entry.value.basis.itemBriefing.criterionLocator)===nativeManagedDigest(state.binding.itemDelivery.criterionLocator))throw reservationFault('item-delivery-criterion-owner-collision',pending.sliceId);
        if(scopesOverlap(pending.writeScope,state.delivery.writeScope))throw reservationFault('item-delivery-scope-collision',pending.sliceId);
      }
      const inventory=nativeAuthorityScan(owner);
      for(const entry of inventory.entries.filter(row=>row.relativePath.startsWith('pending-'))){
        const pending=effectiveNativePendingState(inventory,entry);
        if(integration.releasedPendingHashes.includes(entry.sourceFact.sha256))continue;
        // A terminal report alone frees no item reservation; a native release, the slice's
        // integration by commit evidence, or its cancellation does (D51 (2)).
        if(settled.has(pending.delivery?.sliceId))continue;
        if(pending.delivery?.itemId===state.delivery.itemId)throw reservationFault('item-delivery-owner-collision',pending.delivery?.sliceId);
        if(state.binding.itemDelivery&&pending.binding?.itemDelivery&&nativeManagedDigest(pending.binding.itemDelivery.criterionLocator)===nativeManagedDigest(state.binding.itemDelivery.criterionLocator))throw reservationFault('item-delivery-criterion-owner-collision',pending.delivery?.sliceId);
        if(scopesOverlap(pending.delivery?.writeScope??pending.binding?.allowedPaths??[],state.delivery.writeScope))throw reservationFault('item-delivery-scope-collision',pending.delivery?.sliceId);
      }
    }
    // PF-55: every check that can still refuse runs before the registry member is reserved, so a
    // refused dispatch leaves no orphaned reserved member behind.
    if(state.binding.itemDelivery){
      const authority=mintNativeConcurrentAuthority({repository,boundary,allowedPaths:state.binding.allowedPaths,baseCommit:state.binding.candidateCommit,ownPendingSha256:null});
      try {const captured=captureSourceOwnedNativeHostCommitBaseline({root:state.root,candidateCommit:state.binding.candidateCommit,resultPath:state.resultPath,authority});if(!captured.ok)throw baselineFault(captured);state.baseline=captured.baseline;}
      finally{nativeConcurrentAuthorities.delete(authority);}
    }
    // Productive native delivery publishes its bounded Source-owned receipts here.
    // Prepare the empty directory before launch/authoring; no product bytes or baseline waiver.
    if(state.delivery){const evidencePath=join(repository.primaryRoot,"evidence");let present;try{present=lstatSync(evidencePath);}catch(error){if(error.code!=="ENOENT")throw error;mkdirSync(evidencePath,{mode:0o700});present=lstatSync(evidencePath);}if(!present.isDirectory()||present.isSymbolicLink()||realpathSync(evidencePath)!==evidencePath)throw nativeManagedFault("native-evidence-parent-unsafe");}
    nativeAuthorityOperations.set(handle,{owner,operation});owner.operations.set(name,operation);
    const reserved=reserveSessionAuthorityMember({boundary,producerPort:port,association:operation.association,operationHandle:handle});
    operation.memberHandle=reserved.memberHandle;operation.memberRef=reserved.memberRef;
    const stored=writeExclusive(commonDir,name,state);operation.pendingSha256=stored.sha256;operation.phase='armed';
    writeExclusive(commonDir,`authority-owner-${stored.sha256}.json`,{schema:'pipeline.native-goldfish-authority-owner.v1',pendingSha256:stored.sha256,association:operation.association,bindingSha256:operation.bindingSha256});
    const advanced=advanceSessionAuthorityMember({boundary,producerPort:port,memberHandle:operation.memberHandle,expectedMemberRef:operation.memberRef,operationHandle:handle});operation.memberRef=advanced.memberRef;
    return stored;
  });
}
function publishNativeCodexAuthorityAssociation(commonDir,name,association){
  const pending=readPrivate(commonDir,association.pendingFile),repository=inspectSignedDescriptorCustodyRepository(pending.value.root);
  if(!nativeManagedRegistryPresent(repository))return writeExclusive(commonDir,name,association);
  const owner=nativeAuthorityOwner(repository);nativeAuthorityScan(owner);const operation=owner.operations.get(association.pendingFile);
  if(!operation||operation.pendingSha256!==association.pendingSha256)throw nativeManagedFault('native-start-recovery-required');
  const port=createNativeGoldfishAuthorityProducerPort({repository});
  return withSessionAuthorityBoundary({repository},boundary=>{
    recoverNativeAuthorityOperation({repository,owner,operation,port,boundary});
    const stored=writeExclusive(commonDir,name,association);operation.phase='running';
    const advanced=advanceSessionAuthorityMember({boundary,producerPort:port,memberHandle:operation.memberHandle,expectedMemberRef:operation.memberRef,operationHandle:operation.handle});operation.memberRef=advanced.memberRef;return stored;
  });
}
function recoverNativeAuthorityOperation({repository,owner,operation,port,boundary}){
  if(operation.memberHandle)return;
  const producer=inspectSourceOwnedSessionAuthorityProducerRecord({boundary,producerPort:port});
  const matches=producer.record.members.map(row=>inspectSourceOwnedSessionAuthorityMemberRecord({boundary,producerPort:port,memberRef:row.memberRef}))
    .filter(row=>row.record.bindingSha256===operation.bindingSha256&&row.record.phase!=='released');
  if(matches.length!==1)throw nativeManagedFault('native-authority-recovery-member');
  const recovered=recoverSessionAuthorityMember({boundary,producerPort:port,operationHandle:operation.handle,expectedMemberRef:matches[0].memberRef});
  operation.memberHandle=recovered.memberHandle;operation.memberRef=recovered.memberRef;
}
export function prepareNativeGoldfishAuthorityTerminal({repository,pendingSha256}){
  if(!nativeManagedRegistryPresent(repository))return {status:'legacy-unregistered'};
  const owner=nativeAuthorityOwner(repository);nativeAuthorityScan(owner);
  const operation=[...owner.operations.values()].find(o=>o.pendingSha256===pendingSha256);
  if(!operation)throw nativeManagedFault('native-authority-terminal-pending-missing');
  const port=createNativeGoldfishAuthorityProducerPort({repository});
  return withSessionAuthorityBoundary({repository},boundary=>{recoverNativeAuthorityOperation({repository,owner,operation,port,boundary});return {status:'held'};});
}
export function completeNativeGoldfishAuthority({repository,terminalHandle}){
  const terminal=inspectNativeGoldfishAuthorityTerminal({repository,terminalHandle}),owner=nativeAuthorityOwner(repository);
  nativeAuthorityScan(owner);const operation=[...owner.operations.values()].find(o=>o.pendingSha256===terminal.pendingSha256);
  if(!nativeManagedRegistryPresent(repository))return {status:'legacy-unregistered'};
  if(!operation?.memberHandle)throw nativeManagedFault('native-authority-recovery-required');
  const port=createNativeGoldfishAuthorityProducerPort({repository});
  const completed=withSessionAuthorityBoundary({repository},boundary=>{
    writeExclusive(repository.commonDir,`authority-terminal-${terminal.pendingSha256}.json`,{schema:'pipeline.native-goldfish-authority-terminal.v1',pendingSha256:terminal.pendingSha256,bindingSha256:operation.bindingSha256,
      terminalAssociationSha256:terminal.terminalAssociationSha256,observationSha256:terminal.observationSha256,recordSha256:terminal.recordSha256});
    operation.phase='terminal-observed';const advanced=advanceSessionAuthorityMember({boundary,producerPort:port,memberHandle:operation.memberHandle,expectedMemberRef:operation.memberRef,operationHandle:operation.handle});operation.memberRef=advanced.memberRef;
    const [inventory]=readNativeManagedInventory(repository,'native-goldfish');
    if(inventory.entries.find(row=>row.sourceFact.sha256===terminal.pendingSha256)?.value.delivery)
      return {status:'integration-pending',code:'NGHS-ITEM-RESERVATION-HELD',memberRef:operation.memberRef};
    return releaseSessionAuthorityMember({boundary,producerPort:port,memberHandle:operation.memberHandle,expectedMemberRef:operation.memberRef,terminalHandle});
  });
  if(completed.status!=='integration-pending')return completed;
  const inventory=nativeAuthorityScan(owner),pending=inventory.entries.find(row=>row.sourceFact.sha256===terminal.pendingSha256)?.value;
  if(!pending?.binding.itemDelivery)return completed;
  const checks=executeGovernedItemDeliveryChecks({root:repository.primaryRoot,itemDelivery:pending.binding.itemDelivery,candidate:repository.candidate});
  if(checks.status!=='observed')return {...completed,checkStatus:checks};
  return withSessionAuthorityBoundary({repository},boundary=>{
    const current=nativeManagedCurrentOwner(repository);
    if(nativeManagedDigest(current.association)!==nativeManagedDigest(operation.association)||current.association.state!=='bound')throw nativeManagedFault('native-item-check-owner');
    const evidence=inspectGovernedItemDeliveryChecks({root:repository.primaryRoot,handle:checks.handle,candidate:repository.candidate,itemDelivery:pending.binding.itemDelivery});
    writeExclusive(repository.commonDir,`authority-check-${terminal.pendingSha256}.json`,{schema:'pipeline.native-goldfish-item-check.v1',pendingSha256:terminal.pendingSha256,bindingSha256:operation.bindingSha256,evidence});
    const refreshed=refreshSourceOwnedDispatchAuthorityMember({boundary,producerPort:port,memberHandle:operation.memberHandle,expectedMemberRef:operation.memberRef,operationHandle:operation.handle});
    operation.memberRef=refreshed.memberRef;
    return {...completed,memberRef:operation.memberRef,checkStatus:{status:'observed',code:checks.code,verdict:evidence.verdict}};
  });
}

/** Bounded readback; producer references come from the actual authority owner. */
export function inspectNativeGoldfishItemDelivery({root}={}) {
  try {
    const governed=resolveGovernedItemQueue({root});
    if(governed.status!=='required')return governed;
    const repository=inspectSignedDescriptorCustodyRepository(root);
    if(!nativeManagedRegistryPresent(repository))return {status:'refused',code:'SQ-ITEM-REGISTRY-UNAVAILABLE'};
    const port=createNativeGoldfishAuthorityProducerPort({repository});
    return withSessionAuthorityBoundary({repository},boundary=>{
      const producer=inspectSourceOwnedSessionAuthorityProducerRecord({boundary,producerPort:port});
      const [inventory]=readNativeManagedInventory(repository,'native-goldfish');
      const members=producer.record.members.map(row=>inspectSourceOwnedSessionAuthorityMemberRecord({boundary,producerPort:port,memberRef:row.memberRef}));
      const items=inventory.entries.filter(row=>row.relativePath.startsWith('pending-')&&row.value.delivery).map(row=>{
        const pendingSha256=row.sourceFact.sha256,operation=[...nativeAuthorityOwner(repository).operations.values()].find(value=>value.pendingSha256===pendingSha256);
        const member=members.find(value=>value.record.bindingSha256===operation?.bindingSha256);
        const terminal=inventory.entries.find(value=>value.relativePath===`authority-terminal-${pendingSha256}.json`);
        const check=nativeItemQualifications(inventory,pendingSha256).latest;
        const integration=inventory.entries.find(value=>value.relativePath===`authority-integration-${pendingSha256}.json`);
        const checkpoints=inventory.entries.filter(value=>value.relativePath.startsWith(`authority-checkpoint-${pendingSha256}-`)).sort((a,b)=>b.value.revision-a.value.revision);
        return {itemId:row.value.delivery.itemId,dispatchId:row.value.binding.dispatchId,pendingSha256,
          phase:integration&&member?.record.phase==='released'?'integrated':check?`integration-pending-${check.value.evidence.verdict}`:terminal?'integration-pending-unqualified':'active',
          memberRef:member?.memberRef??member?.record.memberRef??operation?.memberRef??null,
          checkRef:check?.sourceFact??null,integrationRef:integration?.sourceFact??null,
          writeScope:effectiveNativePendingState(inventory,row).delivery.writeScope,scopeRef:nativeScopeAmendments(inventory,row,operation).at(-1)?.sourceFact??null,
          checkpoint:checkpoints[0]?.value.checkpoint??null,checkpointRef:checkpoints[0]?.sourceFact??null};
      });
      return {status:'observed',producerRef:producer.producerRef??producer.ref??null,items};
    });
  } catch {return {status:'refused',code:'SQ-ITEM-OWNER-READBACK-UNAVAILABLE'};}
}

/** Shipped productive-course default. Environment config cannot disable it. */
export function resolveGovernedItemQueue({ root } = {}) {
  const refused = code => ({ status: "refused", code,
    repair: "Restore the approved feature's valid v2 slice-queue.json through the governed course writer; legacy delivery evidence requires explicit migration." });
  try {
    const physical = realpathSync(resolve(root));
    if (!observeGovernanceScope({ rootDir: physical }).requiresEnforcement) return { status: "not-applicable", code: "SQ-NO-GOVERNANCE" };
    const authority = resolveProjectAuthorityPaths({ rootDir: physical });
    if (authority.status !== "ready") return refused("SQ-AUTHORITY-UNAVAILABLE");
    const readBounded = path => {
      const info = lstatSync(path);
      if (info.isFile() && !info.isSymbolicLink() && info.size > SLICE_QUEUE_MAX_BYTES)
        throw Object.assign(new Error("too large"), { code: "SQ-DELIVERY-QUEUE-TOO-LARGE" });
      if (!info.isFile() || info.isSymbolicLink() || realpathSync(path) !== path) throw new Error("unsafe");
      const fd=openSync(path,constants.O_RDONLY|(constants.O_NOFOLLOW??0));
      try {
        const opened=fstatSync(fd),bytes=readFileSync(fd),after=fstatSync(fd),current=lstatSync(path);
        for(const key of ['dev','ino','mode','nlink','size','mtimeMs','ctimeMs'])
          if(opened[key]!==info[key]||after[key]!==opened[key]||current[key]!==opened[key])throw new Error("drift");
        if(bytes.length!==opened.size)throw new Error("size");
        return bytes.toString('utf8');
      }finally{closeSync(fd);}
    };
    const state = parseStrictJson(readBounded(join(physical, authority.state)));
    if (state.schema !== "pipeline.state.v0") return refused("SQ-STATE-INVALID");
    if (!state.activeFeature) return { status: "not-applicable", code: "SQ-NO-APPROVED-COURSE" };
    if(typeof state.planApproved!=='boolean')return refused('SQ-STATE-INVALID');
    if(state.planApproved!==true)return {status:'not-applicable',code:'SQ-NO-APPROVED-COURSE'};
    const plan = state.activeFeature.planPath;
    if (typeof plan !== "string" || !normalizeScope(plan).ok || plan.startsWith("/")) return refused("SQ-PLAN-PATH-INVALID");
    const path = resolve(physical, dirname(plan), "slice-queue.json");
    if (relative(physical, path).startsWith("..")) return refused("SQ-PLAN-PATH-INVALID");
    let bytes;
    try { bytes = readBounded(path); }
    catch (error) {
      // Only a missing file is an absent course. An unsafe, drifting or unreadable file keeps failing closed below.
      if (error?.code === "ENOENT") return { status: "refused", code: "SQ-DELIVERY-COURSE-ABSENT",
        repair: "The approved feature has no delivery course yet: write its slice-queue.json through the governed course writer prepareGovernedItemQueue with the item delivery briefing (criterion locator and check paths) of the first item." };
      throw error;
    }
    const queue = parseStrictJson(bytes);
    if (queue.schema !== ITEM_QUEUE_SCHEMA) return refused("SQ-DELIVERY-MIGRATION-REQUIRED");
    const validated = validateSliceQueue(queue);
    if (!validated.ok || queue.feature !== state.activeFeature.id) return refused("SQ-DELIVERY-QUEUE-INVALID");
    return { status: "required", code: "SQ-DELIVERY-REQUIRED", path: relative(physical, path).replaceAll("\\", "/"),
      sha256: createHash("sha256").update(bytes).digest("hex"), queue, normalized: validated.queue };
  } catch (error) {
    if (error?.code === "SQ-DELIVERY-QUEUE-TOO-LARGE") return { status: "refused", code: error.code,
      repair: "The delivery course or State file exceeds the slice-queue size bound; it is not truncated or edited by hand. Report it to the PO for a governed compaction." };
    return refused("SQ-DELIVERY-STATE-UNAVAILABLE");
  }
}


/** Bounded retry for a transiently held Session Authority lock (SDC-LOCK-HELD is thrown, not returned).
 * Only a refusal raised before the callback ran is retried; the same code is rethrown when the budget ends. */
export function retryWhileSessionAuthorityLockHeld(attempt,{budgetMs=10000,sleep=ms=>Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,ms),now=()=>Date.now()}={}) {
  const deadline=now()+budgetMs;let delay=25;
  for(;;){
    const entered={value:false};
    try{return attempt(entered);}
    catch(error){
      if(error?.code!=='SDC-LOCK-HELD'||entered.value||now()+delay>deadline)throw error;
      sleep(delay);delay=Math.min(delay*2,1000);
    }
  }
}

/** A briefing candidate older than the current checkout still admits when the checkout only advanced
 * through commits that touch none of the item's scope, check or dependency paths. */
export function candidateAdvancedDisjointly(physical,candidate,repository,paths) {
  try{
    const from=candidate?.commit,head=repository.candidate?.commit;
    if(typeof from!=='string'||!/^[0-9a-f]{40,64}$/u.test(from)||typeof head!=='string')return false;
    const git=args=>spawnSync('git',['-C',physical,...args],{env:agyHostGitEnvironment(),shell:false,timeout:10000,maxBuffer:4*1024*1024});
    const ancestor=git(['merge-base','--is-ancestor',from,head]);
    if(ancestor.error||ancestor.status!==0)return false;
    const diff=git(['diff','--name-only','-z',from,head]);
    if(diff.error||diff.status!==0)return false;
    const changed=Buffer.from(diff.stdout).toString('utf8').split('\0').filter(Boolean);
    return changed.every(file=>paths.every(path=>!scopesOverlap(path,file)));
  }catch{return false;}
}

const SHARED_CRITIC_ID='BATCH-CRITIC';
const CRITIC_DELIVERY_KEYS='baseCommit,criteria,itemId';
/** An item-owned queue (lib/slice-queue.mjs) gives every slice a v2 delivery binding, the shared critic included.
 * The critic is not an item, so it carries the basic shape {itemId,baseCommit,criteria}: the de-duplicated
 * criteria of the slices it covers (the validator allows 1..64 unique safe ids). */
function criticDeliveryCriteria(covered,known,fallback) {
  const ids=[];
  for(const list of [...known,...covered.map(row=>row.delivery?.criteria)])
    for(const id of Array.isArray(list)?list:[])if(typeof id==='string'&&isSafeTaskId(id)&&!ids.includes(id))ids.push(id);
  return (ids.length?ids:fallback).slice(0,64);
}

/** Orders a slice after every other live slice it overlaps (only the slice being admitted is edited)
 * and keeps one shared critic slice covering every critical-path slice. The shared critic gets a valid
 * basic delivery bound to the admitting candidate; an existing critic keeps its own shape and base
 * commit, gains the basic binding only when it has none, and has its criteria extended. */
export function orderAndCoverAdmittedSlice(raw,sliceId,baseCommit) {
  const slices=raw.slices,mine=slices.find(row=>row.id===sliceId);
  const reaches=(from,to,seen=new Set())=>{if(from===to)return true;if(seen.has(from))return false;seen.add(from);return (slices.find(row=>row.id===from)?.dependsOn??[]).some(dep=>reaches(dep,to,seen));};
  for(const other of slices){
    if(other===mine||other.state==='cancelled'||other.tier==='critic'||(mine.dependsOn??[]).includes(other.id))continue;
    if(!scopesOverlap(mine.writeScope,other.writeScope)||reaches(other.id,mine.id))continue;
    mine.dependsOn=[...(mine.dependsOn??[]),other.id];
  }
  const critical=slices.filter(row=>row.state!=='cancelled'&&row.tier!=='critic'&&(row.writeScope??[]).some(path=>typeof path==='string'
    &&DEFAULT_CRITICAL_PATH_PATTERNS.some(source=>new RegExp(source,'iu').test(path.trim().replaceAll('\\','/')))));
  if(!critical.length)return;
  const critic=slices.find(row=>row.tier==='critic'&&row.state!=='cancelled'&&row.id===SHARED_CRITIC_ID)??slices.find(row=>row.tier==='critic'&&row.state!=='cancelled');
  const fallback=Array.isArray(mine.delivery?.criteria)&&mine.delivery.criteria.length?mine.delivery.criteria:[sliceId];
  if(critic){
    critic.dependsOn=[...new Set([...(critic.dependsOn??[]),...critical.filter(row=>!reaches(row.id,critic.id)).map(row=>row.id)])];
    const held=critic.delivery;
    if(held===undefined)critic.delivery={itemId:SHARED_CRITIC_ID,baseCommit,criteria:criticDeliveryCriteria(critical,[],fallback)};
    else if(held!==null&&typeof held==='object'&&!Array.isArray(held)&&Object.keys(held).sort().join(',')===CRITIC_DELIVERY_KEYS)
      critic.delivery={...held,criteria:criticDeliveryCriteria(critical,[held.criteria],fallback)};
    return;
  }
  slices.push({id:SHARED_CRITIC_ID,title:'Shared batch Critic review',state:'ready',dependsOn:critical.map(row=>row.id),writeScope:[],tier:'critic',
    tierReason:'Critical-path write scope in this batch needs one shared independent Critic review.',commitMode:'diff-only',loadClass:'light',
    delivery:{itemId:SHARED_CRITIC_ID,baseCommit,criteria:criticDeliveryCriteria(critical,[],fallback)}});
}

/** Automatic approved-course continuation. Selection metadata cannot approve a
 * plan or mint a requester; the Source observers and original bytes do both
 * checks before any lifecycle write under the existing authority lock. */
export function prepareGovernedItemQueue({root,itemDelivery,candidate,writeScope}={}) {
  try {
    // Critic F1 (PF-47): every refusal names its cause and the repair, so the guard never falls back to a transport text.
    const regenerate='regenerate the binding at the current HEAD with dispatch-briefing.mjs binding and paste its block unchanged';
    if(!validateItemDeliveryBriefing(itemDelivery).ok)return {status:'refused',code:'SQ-ITEM-BINDING-INVALID',reason:'the binding block carries no valid item delivery briefing',repair:regenerate};
    const physical=realpathSync(resolve(root));
    if(!observeGovernanceScope({rootDir:physical}).requiresEnforcement)return {status:'not-applicable',code:'SQ-NO-GOVERNANCE'};
    const repository=inspectSignedDescriptorCustodyRepository(physical);
    if(nativeManagedDigest(candidate)!==nativeManagedDigest(repository.candidate)
      &&!candidateAdvancedDisjointly(physical,candidate,repository,[...(Array.isArray(writeScope)?writeScope:[]),...itemDelivery.checks.flatMap(check=>[check.path,...check.dependencies])]))
      return {status:'refused',code:'SQ-ITEM-CANDIDATE-DRIFT',reason:`the binding names candidate ${String(candidate?.commit).slice(0,12)}, HEAD is ${String(repository.candidate?.commit).slice(0,12)}, and the commits between touch its paths`,repair:regenerate};
    if(!Array.isArray(writeScope)||!writeScope.length||writeScope.some(path=>!normalizeScope(path).ok||!itemDelivery.checks.some(check=>check.dependencies.includes(path))))
      return {status:'refused',code:'SQ-ITEM-SCOPE-INVALID',reason:'an allowed path is missing, not repository-relative, or not a dependency of the item check',repair:regenerate};
    return retryWhileSessionAuthorityLockHeld(entered=>withSessionAuthorityBoundary({repository},()=>{
      entered.value=true;
      const current=nativeManagedCurrentOwner(repository);
      if(current.association.state!=='bound')throw nativeManagedFault('item-course-requester-unavailable');
      const approval=observeCurrentPlanApprovalForCalibration({rootDir:physical});
      if(approval.status!=='eligible')return {status:'refused',code:approval.code,reason:`the current plan approval is ${approval.status} (${approval.code})`,
        repair:approval.repair??'the item course needs an eligible PO plan approval of the current PRD and spec; read pipeline-state.mjs inspect'};
      const paths=resolveProjectAuthorityPaths({rootDir:physical});
      if(paths.status!=='ready')throw nativeManagedFault('item-course-authority-unavailable');
      const stateBytes=readFileSync(join(physical,paths.state)),state=parseStrictJson(stateBytes);
      if(digest(stateBytes)!==approval.stateSha256||!state.activeFeature?.id||!state.planSubmission?.specPath)throw nativeManagedFault('item-course-state-drift');
      const locator=itemDelivery.criterionLocator;
      const source=approval.sourceRefs.find(ref=>ref.path===locator.sourcePath&&ref.sha256===locator.sourceSha256);
      if(!source||locator.sourcePath!==state.planSubmission.specPath)throw nativeManagedFault('item-course-original-unbound');
      const sourcePath=join(physical,source.path),sourceInfo=lstatSync(sourcePath);
      if(sourceInfo.isSymbolicLink()||!sourceInfo.isFile()||realpathSync(sourcePath)!==sourcePath)throw nativeManagedFault('item-course-original-unsafe');
      const sourceBytes=readFileSync(sourcePath);
      const criterion=parseAcceptedCriticCriterion({sourceBytes,locator,packageContext:{featureId:state.activeFeature.id,sourceBindings:[{path:source.path,sha256:source.sha256,role:'spec'}]}});
      if(!['explicit-actual-independent-pass','no-explicit-criterion'].includes(criterion.status))throw nativeManagedFault('item-course-criterion-unbound');
      const path=resolve(physical,dirname(state.activeFeature.planPath),'slice-queue.json');
      if(relative(physical,path).startsWith('..')||realpathSync(dirname(path))!==dirname(path))throw nativeManagedFault('item-course-queue-path');
      let preimage=null,raw;
      try{const info=lstatSync(path);if(info.isSymbolicLink()||!info.isFile()||info.size>SLICE_QUEUE_MAX_BYTES)throw nativeManagedFault('item-course-queue-unsafe');preimage=readFileSync(path);raw=parseStrictJson(preimage);}catch(error){if(error.code!=='ENOENT')throw error;raw={schema:ITEM_QUEUE_SCHEMA,feature:state.activeFeature.id,slices:[]};}
      if(!validateSliceQueue(raw).ok||raw.feature!==state.activeFeature.id)throw nativeManagedFault('item-course-queue-invalid');
      const legacy=raw.schema==='pipeline.slice-queue.v1';
      if(legacy){
        const legacyHash=digest(preimage),backup=join(dirname(path),`.slice-queue-legacy-${legacyHash}.json`);
        let backupFd;
        try{backupFd=openSync(backup,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|(constants.O_NOFOLLOW??0),0o600);let offset=0;while(offset<preimage.length){const written=writeSync(backupFd,preimage,offset,preimage.length-offset);if(written<=0)throw nativeManagedFault('item-course-legacy-backup-write');offset+=written;}fsyncSync(backupFd);}
        catch(error){if(error.code!=='EEXIST'||lstatSync(backup).isSymbolicLink()||digest(readFileSync(backup))!==legacyHash)throw error;}
        finally{if(backupFd!==undefined)closeSync(backupFd);}
        raw.schema=ITEM_QUEUE_SCHEMA;
        raw.slices=raw.slices.map(row=>({...row,state:'deferred',holdReason:'Original item binding is required; legacy completion is retained evidence only.',delivery:{status:'unbound-legacy',itemId:row.id,legacyQueueSha256:legacyHash}}));
      }
      const existing=raw.slices.find(row=>row.id===itemDelivery.sliceId);
      const delivery={itemId:itemDelivery.itemId,criteria:[locator.criterionId],baseCommit:candidate.commit,
        criterionLocator:locator,checks:itemDelivery.checks,approvalSha256:approval.approvalSha256};
      const canRebindLegacy=existing&&existing.delivery?.status!=='unbound-legacy'&&!existing.delivery?.criterionLocator
        &&existing.delivery.itemId===itemDelivery.itemId&&nativeManagedDigest(existing.delivery.criteria)===nativeManagedDigest([locator.criterionId])
        &&nativeManagedDigest(existing.writeScope)===nativeManagedDigest(writeScope);
      // A never-dispatched `ready` slice with the identical item, criterion and write scope rebinds to the current candidate.
      const canRebindReady=existing&&existing.state==='ready'&&existing.delivery?.status!=='unbound-legacy'&&existing.delivery?.itemId===itemDelivery.itemId
        &&nativeManagedDigest(existing.delivery?.criteria)===nativeManagedDigest([locator.criterionId])&&nativeManagedDigest(existing.writeScope)===nativeManagedDigest(writeScope);
      if(existing?.delivery?.status!=='unbound-legacy'&&existing&&!canRebindLegacy&&!canRebindReady){
        if(nativeManagedDigest(existing.delivery)!==nativeManagedDigest(delivery)||nativeManagedDigest(existing.writeScope)!==nativeManagedDigest(writeScope)){
          // PF-47: nothing was written; name the queue row the binding must match instead of a generic authority fault.
          const differs=[existing.state!=='ready'?`state ${existing.state}`:null,nativeManagedDigest(existing.writeScope)!==nativeManagedDigest(writeScope)?'write scope':null,
            existing.delivery?.itemId!==itemDelivery.itemId?'item':null,nativeManagedDigest(existing.delivery?.criteria)!==nativeManagedDigest([locator.criterionId])?'criterion':null].filter(Boolean);
          return {status:'refused',code:'SQ-ITEM-BINDING-DRIFT',reason:`the binding for ${existing.id} differs from its queue row in ${differs.join(', ')||'its delivery binding'}`,
            repair:existing.state!=='ready'?`slice ${existing.id} is ${existing.state}; it cannot be rebound: choose a new slice id`
              :differs.includes('item')||differs.includes('criterion')?`slice ${existing.id} belongs to another item or criterion; choose a new slice id (--dispatch-id)`
              :`rebind with exactly the queue row's write scope (one --path each): ${(existing.writeScope??[]).join(', ')}`};
        }
        return resolveGovernedItemQueue({root:physical});
      }
      if(existing){existing.delivery=delivery;existing.state='ready';delete existing.holdReason;existing.writeScope=[...writeScope];}
      else raw.slices.push({id:itemDelivery.sliceId,title:locator.criterionId,state:'ready',dependsOn:[],writeScope:[...writeScope],readScope:[source.path],tier:'implementor',commitMode:'host-commit',loadClass:'light',delivery});
      orderAndCoverAdmittedSlice(raw,itemDelivery.sliceId,candidate.commit);
      if(!validateSliceQueue(raw).ok)throw nativeManagedFault('item-course-prepared-queue-invalid');
      // A held dependency refuses before the queue is written, so a refused dispatch leaves the tree as it was.
      // Readiness is read only when there is a dependency (as the admission does); when it is not observable,
      // the later admission check decides exactly as before.
      const dependsOn=raw.slices.find(row=>row.id===itemDelivery.sliceId).dependsOn??[];
      const readiness=dependsOn.length?observeGovernedItemIntegrationReadiness({root:physical}):null;
      const held=readiness?.status==='observed'?dependsOn.filter(id=>!readiness.integrated.includes(id)):[];
      if(held.length>0)return {status:'refused',code:'NGHS-ITEM-INTEGRATION-DEPENDENCY-HELD',reason:`${heldDependencyReason(held,raw.slices)}; the queue was not written`,
        repair:`a never-started dependency is released with: node ${SLICE_QUEUE_SCRIPT} cancel <slice id> --reason "<why>"; a started one needs its "Dispatch: <slice id> (goldfish)" commit`};
      // Approval, requester, candidate and preimage are checked again immediately
      // before publishing a fresh inode. Existing linked bytes remain unchanged.
      const after=observeCurrentPlanApprovalForCalibration({rootDir:physical});
      if(after.status!=='eligible'||after.approvalSha256!==approval.approvalSha256||after.stateSha256!==approval.stateSha256
        ||nativeManagedDigest(nativeManagedCurrentOwner(repository).association)!==nativeManagedDigest(current.association))throw nativeManagedFault('item-course-approval-cas');
      writeGovernedQueue(path,preimage,raw);
      // PF-55: what a later refusal of the same dispatch needs to restore the queue exactly (rollbackGovernedItemQueue).
      return {...resolveGovernedItemQueue({root:physical}),written:{root:physical,path,preimage:preimage?preimage.toString('base64'):null,postimageSha256:digest(readFileSync(path))}};
    }));
  }catch(error){return {status:'refused',code:error.code??'SQ-ITEM-COURSE-UNAVAILABLE',reason:error.reason??error.message};}
}

/** PF-55: a dispatch refused after its queue was prepared leaves the queue as it was. The prepared
 * bytes are restored only while nothing else has changed the queue since (compare and swap on them). */
export function rollbackGovernedItemQueue(written) {
  try {
    if(!written||typeof written.root!=='string'||typeof written.path!=='string'||!SHA.test(written.postimageSha256??'')||!(written.preimage===null||typeof written.preimage==='string'))
      return {status:'refused',code:'SQ-ROLLBACK-INPUT'};
    const repository=inspectSignedDescriptorCustodyRepository(realpathSync(written.root));
    return retryWhileSessionAuthorityLockHeld(entered=>withSessionAuthorityBoundary({repository},()=>{
      entered.value=true;
      let current;
      try{current=readFileSync(written.path);}catch(error){if(error.code==='ENOENT')return {status:'unchanged',code:'SQ-ROLLBACK-ABSENT'};throw error;}
      if(digest(current)!==written.postimageSha256)return {status:'unchanged',code:'SQ-ROLLBACK-CHANGED'};
      if(written.preimage===null){unlinkSync(written.path);return {status:'restored',code:'SQ-ROLLBACK-REMOVED'};}
      const bytes=Buffer.from(written.preimage,'base64'),temp=join(dirname(written.path),`.slice-queue.${randomBytes(16).toString('hex')}.tmp`);
      let fd;
      try{fd=openSync(temp,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|(constants.O_NOFOLLOW??0),0o600);let offset=0;while(offset<bytes.length){const count=writeSync(fd,bytes,offset,bytes.length-offset);if(count<=0)throw nativeManagedFault('item-course-queue-rollback-write');offset+=count;}fsyncSync(fd);closeSync(fd);fd=undefined;renameSync(temp,written.path);}
      finally{if(fd!==undefined)closeSync(fd);try{unlinkSync(temp);}catch{}}
      return {status:'restored',code:'SQ-ROLLBACK-RESTORED'};
    }));
  }catch(error){return {status:'refused',code:error.code??'SQ-ROLLBACK-UNAVAILABLE',reason:error.reason??error.message};}
}

/** Publishes a governed item queue as a fresh inode by rename, after the preimage compare-and-swap. */
function writeGovernedQueue(path,preimage,raw) {
  if(preimage?digest(readFileSync(path))!==digest(preimage):(()=>{try{lstatSync(path);return true;}catch(error){if(error.code==='ENOENT')return false;throw error;}})())throw nativeManagedFault('item-course-queue-cas');
  const bytes=Buffer.from(JSON.stringify(raw,null,2)+'\n'),temp=join(dirname(path),`.slice-queue.${randomBytes(16).toString('hex')}.tmp`);
  // Never publish a course that its own readers would refuse.
  if(bytes.length>SLICE_QUEUE_MAX_BYTES)throw Object.assign(new Error('prepared delivery course exceeds the slice-queue size bound'),{code:'SQ-DELIVERY-QUEUE-TOO-LARGE'});
  let fd;
  try{fd=openSync(temp,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|(constants.O_NOFOLLOW??0),0o600);let offset=0;while(offset<bytes.length){const written=writeSync(fd,bytes,offset,bytes.length-offset);if(written<=0)throw nativeManagedFault('item-course-queue-write');offset+=written;}fsyncSync(fd);closeSync(fd);fd=undefined;renameSync(temp,path);}
  finally{if(fd!==undefined)closeSync(fd);try{unlinkSync(temp);}catch{}}
}

/** Critic F2: an AGY reservation that names the slice and is not released marks it started, as a native
 * pending state does. A never-created registry has released nothing, so every such reservation counts. */
function agyReservationNamesSlice({repository,boundary,sliceId}) {
  const rank={reserved:0,armed:1,running:2,'terminal-observed':3},latest=new Map();
  for(const row of readAgyAuthorityInventory({repository,namespaceIds:['registered-opaque-context-lifetimes']}).entries.filter(row=>row.value?.basis?.itemDelivery?.sliceId===sliceId)){
    const prior=latest.get(row.value.operationId);
    if(!prior||(rank[row.value.phase]??0)>(rank[prior.value.phase]??0)||row.value.phase===prior.value.phase&&(row.value.revision??0)>(prior.value.revision??0))latest.set(row.value.operationId,row);
  }
  if(!latest.size)return false;
  let released=new Set();
  try{
    const port=createAgyFamilyDispatchAuthorityProducerPort({repository}),producer=inspectSourceOwnedSessionAuthorityProducerRecord({boundary,producerPort:port});
    released=new Set(producer.record.members.map(row=>inspectSourceOwnedSessionAuthorityMemberRecord({boundary,producerPort:port,memberRef:row.memberRef}).record).filter(row=>row.phase==='released').map(row=>row.bindingSha256));
  }catch(error){if(!sessionAuthorityRegistryAbsent(error))throw error;}
  return [...latest.values()].some(row=>!released.has(row.value.bindingSha256));
}

/** PF-45: cancels a never-started slice of the governed item queue and releases the slices that wait on it.
 * Never started means no native dispatch state and no unreleased AGY reservation names the slice, and no
 * "Dispatch: <slice> (goldfish)" commit after its base touches its write scope. Its id is removed from every
 * dependsOn: nothing of it will be delivered, so nothing may wait on it. The shared critic and an already
 * cancelled slice are refused. */
export function cancelUnstartedGovernedItemSlice({root,sliceId,reason,started=false}={}) {
  try {
    if(typeof sliceId!=='string'||!ID.test(sliceId))return {status:'refused',code:'SQ-ITEM-CANCEL-INPUT',reason:'the slice id is not a queue slice id'};
    if(typeof reason!=='string'||!reason.trim()||reason.length>500||/[\u0000-\u001f\u007f]/u.test(reason))return {status:'refused',code:'SQ-ITEM-CANCEL-INPUT',reason:'--reason needs one line of at most 500 characters'};
    const physical=realpathSync(resolve(root));
    const governed=resolveGovernedItemQueue({root:physical});
    if(governed.status!=='required')return governed.status==='refused'?governed:{status:'refused',code:'SQ-ITEM-CANCEL-NO-COURSE',reason:'no governed item queue exists for the approved feature'};
    const repository=inspectSignedDescriptorCustodyRepository(physical),path=resolve(physical,governed.path);
    return retryWhileSessionAuthorityLockHeld(entered=>withSessionAuthorityBoundary({repository},boundary=>{
      entered.value=true;
      // D51 (3): no bound session is required. Cancelling only releases (nothing of the slice is
      // delivered), and neither the agent's shell nor the PO's terminal ever carries a session binding.
      const preimage=readFileSync(path),raw=parseStrictJson(preimage);
      if(!validateSliceQueue(raw).ok)throw nativeManagedFault('item-course-queue-invalid');
      const row=raw.slices.find(entry=>entry.id===sliceId);
      if(!row)return {status:'refused',code:'SQ-NOT-FOUND',reason:`no slice ${sliceId} in ${governed.path}`};
      if(row.state==='cancelled')return {status:'refused',code:'SQ-ITEM-CANCEL-ALREADY',reason:`slice ${sliceId} is already cancelled`};
      if(row.tier==='critic')return {status:'refused',code:'SQ-ITEM-CANCEL-CRITIC',reason:`slice ${sliceId} is the shared critic slice; it is not cancelled with this verb`};
      let native=[];
      try{native=readNativeManagedInventory(repository,'native-goldfish')[0].entries;}catch(error){if(error?.code!=='ENOENT'&&!sessionAuthorityRegistryAbsent(error))throw error;}
      if(readOrchestratorCommitIntegratedSlices({root:repository.primaryRoot,candidateCommit:repository.candidate.commit,slices:[row]}).includes(sliceId))
        return {status:'refused',code:'SQ-ITEM-CANCEL-INTEGRATED',reason:`slice ${sliceId} already has a "Dispatch: ${sliceId} (goldfish)" commit; it counts as integrated, its reservation no longer blocks, and it needs no cancel`};
      const hasNativeState=native.some(entry=>entry.relativePath.startsWith('pending-')&&entry.value?.delivery?.sliceId===sliceId);
      const hasAgyState=!hasNativeState&&agyReservationNamesSlice({repository,boundary,sliceId});
      if((hasNativeState||hasAgyState)&&started!==true)
        return {status:'refused',code:'SQ-ITEM-CANCEL-STARTED',reason:`slice ${sliceId} has ${hasNativeState?'a native dispatch state':'an unreleased AGY reservation'}, so it was started`,
          repair:`if its Goldfish still runs, let it finish through its own delivery. If it no longer runs: node ${SLICE_QUEUE_SCRIPT} cancel ${sliceId} --started --reason "<why>". With --started you assert that no Goldfish runs for it; its reservation then stops blocking and its write scope is no longer protected`};
      row.state='cancelled';row.holdReason=reason.trim();
      const released=[];
      for(const other of raw.slices)if((other.dependsOn??[]).includes(sliceId)){other.dependsOn=other.dependsOn.filter(id=>id!==sliceId);released.push(other.id);}
      if(!validateSliceQueue(raw).ok)throw nativeManagedFault('item-course-cancelled-queue-invalid');
      writeGovernedQueue(path,preimage,raw);
      return {status:'cancelled',code:'SQ-ITEM-CANCELLED',sliceId,released,queuePath:governed.path,
        ...(hasNativeState||hasAgyState?{started:true,note:'a started slice was cancelled on the caller\'s word that no Goldfish runs for it; its reservation no longer blocks and its write scope is no longer protected'}:{})};
    }));
  }catch(error){return {status:'refused',code:error.code??'SQ-ITEM-CANCEL-UNAVAILABLE',reason:error.reason??error.message,...(typeof error.repair==='string'?{repair:error.repair}:{})};}
}

const governedCheckHandles=new WeakMap();
function itemCheckSnapshot(root,itemDelivery,candidate) {
  const physical=realpathSync(resolve(root)),repository=inspectSignedDescriptorCustodyRepository(physical);
  if(nativeManagedDigest(repository.candidate)!==nativeManagedDigest(candidate)||!validateItemDeliveryBriefing(itemDelivery).ok)throw nativeManagedFault('item-check-candidate-or-contract');
  const paths=[...new Set(itemDelivery.checks.flatMap(check=>[check.path,...check.dependencies]))].sort();
  const files=paths.map(path=>{
    const absolute=resolve(physical,path);
    if(relative(physical,absolute).startsWith('..')||realpathSync(absolute)!==absolute)throw nativeManagedFault('item-check-path');
    const before=lstatSync(absolute);
    if(!before.isFile()||before.isSymbolicLink()||before.size>4*1024*1024)throw nativeManagedFault('item-check-source');
    const fd=openSync(absolute,constants.O_RDONLY|(constants.O_NOFOLLOW??0));
    try {
      const opened=fstatSync(fd),bytes=readFileSync(fd),after=fstatSync(fd),now=lstatSync(absolute);
      for(const key of ['dev','ino','mode','size','mtimeMs','ctimeMs'])if(opened[key]!==before[key]||after[key]!==opened[key]||now[key]!==opened[key])throw nativeManagedFault('item-check-source-cas');
      const committed=spawnSync('git',['-C',physical,'show',`${candidate.commit}:${path}`],{env:agyHostGitEnvironment(),shell:false,timeout:10000,maxBuffer:4*1024*1024});
      if(committed.error||committed.status!==0||!Buffer.from(committed.stdout).equals(bytes))throw nativeManagedFault('item-check-source-not-candidate');
      return {path,sha256:digest(bytes),size:bytes.length};
    }finally{closeSync(fd);}
  });
  return {repository,files,contractSha256:nativeManagedDigest(itemDelivery)};
}
/** Actual bounded targeted execution. Raw caller results cannot construct the
 * opaque observation handle consumed by either real delivery adapter. */
export function executeGovernedItemDeliveryChecks({root,itemDelivery,candidate}={}) {
  try {
    const before=itemCheckSnapshot(root,itemDelivery,candidate),results=[];
    const checkEnv=agyHostGitEnvironment();
    // The outer Verify recorder fd belongs to its direct suite, not a nested
    // child. No inherited descriptor is advertised when it is not passed.
    delete checkEnv.PIPELINE_VERIFY_CASE_COMPLETION_FD;
    delete checkEnv.PIPELINE_VERIFY_CASE_COMPLETION_MAX_BYTES;
    for(const check of itemDelivery.checks) {
      const run=spawnSync(process.execPath,['--test',resolve(root,check.path)],{cwd:before.repository.primaryRoot,env:checkEnv,shell:false,timeout:60000,maxBuffer:1024*1024});
      results.push({id:check.id,path:check.path,executable:process.execPath,args:['--test',check.path],status:run.status,signal:run.signal,error:run.error?.code??null,
        stdoutSha256:digest(run.stdout??Buffer.alloc(0)),stderrSha256:digest(run.stderr??Buffer.alloc(0))});
    }
    const after=itemCheckSnapshot(root,itemDelivery,candidate);
    if(nativeManagedDigest(before)!==nativeManagedDigest(after))throw nativeManagedFault('item-check-post-execution-drift');
    const evidence={schema:'pipeline.item-targeted-checks.v1',candidate,contractSha256:before.contractSha256,files:before.files,results,
      verdict:results.every(row=>row.status===0&&!row.signal&&!row.error)?'passed':'failed'};
    const handle=Object.freeze({});governedCheckHandles.set(handle,{root:before.repository.primaryRoot,evidence});
    return {status:'observed',code:evidence.verdict==='passed'?'SQ-TARGETED-CHECKS-PASSED':'SQ-TARGETED-CHECKS-FAILED',handle,evidence:structuredClone(evidence)};
  }catch(error){return {status:'refused',code:error.code??'SQ-TARGETED-CHECKS-UNAVAILABLE',reason:error.reason??error.message};}
}
export function inspectGovernedItemDeliveryChecks({root,handle,candidate,itemDelivery}={}) {
  const held=governedCheckHandles.get(handle);
  if(!held||held.root!==realpathSync(resolve(root)))throw nativeManagedFault('item-check-handle-unowned');
  const current=itemCheckSnapshot(root,itemDelivery,candidate);
  if(nativeManagedDigest(held.evidence.candidate)!==nativeManagedDigest(candidate)||held.evidence.contractSha256!==current.contractSha256
    ||nativeManagedDigest(held.evidence.files)!==nativeManagedDigest(current.files))throw nativeManagedFault('item-check-evidence-stale');
  return structuredClone(held.evidence);
}

/** Add only original check-covered paths to the same retained item. Scope
 * publication precedes queue repair: any interrupted update holds the wider
 * reservation and requires this authenticated same-owner replay. */
export function amendNativeGoldfishItemWriteScope(input={}) {
  try {
    if(!exact(input,['root','pendingSha256','additionalPaths'])||!SHA.test(input.pendingSha256??'')||!Array.isArray(input.additionalPaths)
      ||!input.additionalPaths.length||input.additionalPaths.length>64||input.additionalPaths.some(path=>typeof path!=='string'||!normalizeScope(path).ok||/[?*{}]/u.test(path)))throw nativeManagedFault('native-item-scope-input');
    const {root,pendingSha256}=input,repository=inspectSignedDescriptorCustodyRepository(root),owner=nativeAuthorityOwner(repository),port=createNativeGoldfishAuthorityProducerPort({repository});
    return withSessionAuthorityBoundary({repository},boundary=>{
      const producer=inspectSourceOwnedSessionAuthorityProducerRecord({boundary,producerPort:port}),read=nativeAuthorityScan(owner);
      const entry=read.entries.find(row=>row.relativePath.startsWith('pending-')&&row.sourceFact.sha256===pendingSha256),operation=[...owner.operations.values()].find(row=>row.pendingSha256===pendingSha256);
      const current=nativeManagedCurrentOwner(repository);
      if(!entry?.value.binding.itemDelivery||!operation||!['armed','running'].includes(operation.phase)||current.association.state!=='bound'
        ||nativeManagedDigest(current.association)!==nativeManagedDigest(operation.association))throw nativeManagedFault('native-item-scope-owner');
      const members=producer.record.members.map(row=>inspectSourceOwnedSessionAuthorityMemberRecord({boundary,producerPort:port,memberRef:row.memberRef})).filter(row=>row.record.bindingSha256===operation.bindingSha256);
      if(members.length!==1||!['armed','running'].includes(members[0].record.phase))throw nativeManagedFault('native-item-scope-released-or-foreign');
      const original=entry.value.binding.itemDelivery,checks=original.checks;
      if(input.additionalPaths.some(path=>!checks.some(check=>check.dependencies.includes(path))))throw nativeManagedFault('native-item-scope-check-contract-amendment-required');
      const governed=resolveGovernedItemQueue({root:repository.primaryRoot}),approval=observeCurrentPlanApprovalForCalibration({rootDir:repository.primaryRoot});
      const item=governed.status==='required'?governed.normalized.slices.find(row=>row.id===original.sliceId):null;
      if(!item||item.delivery.itemId!==original.itemId||approval.status!=='eligible'||item.delivery.approvalSha256!==approval.approvalSha256
        ||nativeManagedDigest(item.delivery.criterionLocator)!==nativeManagedDigest(original.criterionLocator)||nativeManagedDigest(item.delivery.checks)!==nativeManagedDigest(checks))throw nativeManagedFault('native-item-scope-approved-course-unavailable');
      const amendments=nativeScopeAmendments(read,entry,operation),latest=amendments.at(-1),effective=effectiveNativePendingState(read,entry);
      const allowedPaths=[...new Set([...effective.binding.allowedPaths,...effective.delivery.writeScope,...input.additionalPaths])].sort(),writeScope=[...new Set([...effective.delivery.writeScope,...input.additionalPaths])].sort();
      if(allowedPaths.length>64||writeScope.length>64)throw nativeManagedFault('native-item-scope-record-bound');
      const unchanged=nativeManagedDigest(allowedPaths)===nativeManagedDigest([...effective.binding.allowedPaths].sort());
      const raw=structuredClone(governed.queue),rawItem=raw.slices.find(row=>row.id===original.sliceId);
      if(!unchanged&&nativeManagedDigest(item.writeScope)!==nativeManagedDigest(effective.delivery.writeScope))throw nativeManagedFault('native-item-scope-queue-recovery-required');
      const {reservations}=readNativeReservedItemScopes({repository,boundary});
      const blocking=reservations.find(row=>row.pendingSha256!==pendingSha256&&scopesOverlap(row.writeScope,writeScope));
      if(blocking)throw reservationFault('item-delivery-scope-collision',blocking.sliceId);
      const agyPort=createAgyFamilyDispatchAuthorityProducerPort({repository}),agyProducer=inspectSourceOwnedSessionAuthorityProducerRecord({boundary,producerPort:agyPort});
      const released=new Set(agyProducer.record.members.map(row=>inspectSourceOwnedSessionAuthorityMemberRecord({boundary,producerPort:agyPort,memberRef:row.memberRef}).record).filter(row=>row.phase==='released').map(row=>row.bindingSha256));
      const agy=readAgyAuthorityInventory({repository,namespaceIds:['registered-opaque-context-lifetimes']}),rank={reserved:0,armed:1,running:2,'terminal-observed':3},latestAgy=new Map();
      for(const row of agy.entries.filter(row=>row.value?.basis?.itemDelivery)){const prior=latestAgy.get(row.value.operationId);if(!prior||(rank[row.value.phase]??0)>(rank[prior.value.phase]??0)||row.value.phase===prior.value.phase&&(row.value.revision??0)>(prior.value.revision??0))latestAgy.set(row.value.operationId,row);}
      const settled=readSettledItemSliceIds({repository,boundary,governed});
      const agyBlocking=[...latestAgy.values()].find(row=>!released.has(row.value.bindingSha256)&&!settled.has(row.value.basis.itemDelivery.sliceId)&&scopesOverlap(row.value.basis.itemDelivery.writeScope,writeScope));
      if(agyBlocking)throw reservationFault('item-delivery-scope-collision',agyBlocking.value.basis.itemDelivery.sliceId);
      const queuePath=resolve(repository.primaryRoot,governed.path),queueBytes=readFileSync(queuePath);
      if(digest(queueBytes)!==governed.sha256)throw nativeManagedFault('native-item-scope-queue-cas');
      rawItem.writeScope=writeScope;
      if(!validateSliceQueue(raw).ok)throw nativeManagedFault('native-item-scope-queue-invalid');
      const postBytes=Buffer.from(JSON.stringify(raw,null,2)+'\n');
      if(unchanged&&nativeManagedDigest(item.writeScope)===nativeManagedDigest(effective.delivery.writeScope))return {status:'unchanged',code:'NGHS-ITEM-SCOPE-UNCHANGED',pendingSha256,memberRef:members[0].memberRef};
      // A replay may complete only the exact queued postimage already registered
      // by this original Source owner. Other queue edits require recovery.
      if(unchanged&&(!latest||digest(queueBytes)!==latest.value.queuePreimageSha256||digest(postBytes)!==latest.value.queuePostimageSha256))throw nativeManagedFault('native-item-scope-recovery-cas');
      const after=observeCurrentPlanApprovalForCalibration({rootDir:repository.primaryRoot});
      if(after.status!=='eligible'||after.stateSha256!==approval.stateSha256||after.approvalSha256!==approval.approvalSha256)throw nativeManagedFault('native-item-scope-approval-cas');
      recoverNativeAuthorityOperation({repository,owner,operation,port,boundary});
      let scopeRef=latest?.sourceFact,revision=amendments.length;
      if(!unchanged){
        revision++;
        if(revision>64)throw nativeManagedFault('native-item-scope-record-bound');
        const value={schema:'pipeline.native-goldfish-item-scope.v1',pendingSha256,bindingSha256:operation.bindingSha256,revision,previousScopeSha256:latest?.sourceFact.sha256??pendingSha256,
          allowedPaths,writeScope,queuePreimageSha256:digest(queueBytes),queuePostimageSha256:digest(postBytes)};
        scopeRef=writeExclusive(repository.commonDir,`authority-scope-${pendingSha256}-${revision}.json`,value);
        const refreshed=refreshSourceOwnedDispatchAuthorityMember({boundary,producerPort:port,memberHandle:operation.memberHandle,expectedMemberRef:operation.memberRef,operationHandle:operation.handle});operation.memberRef=refreshed.memberRef;
      }
      const info=lstatSync(queuePath);
      if(info.isSymbolicLink()||!info.isFile()||digest(readFileSync(queuePath))!==digest(queueBytes))throw nativeManagedFault('native-item-scope-queue-cas');
      const temp=join(dirname(queuePath),`.slice-queue.${randomBytes(16).toString('hex')}.tmp`);let fd;
      try{fd=openSync(temp,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|(constants.O_NOFOLLOW??0),0o600);let offset=0;while(offset<postBytes.length){const written=writeSync(fd,postBytes,offset,postBytes.length-offset);if(written<=0)throw nativeManagedFault('native-item-scope-queue-write');offset+=written;}fsyncSync(fd);closeSync(fd);fd=undefined;renameSync(temp,queuePath);}
      finally{if(fd!==undefined)closeSync(fd);try{unlinkSync(temp);}catch{}}
      return {status:'amended',code:'NGHS-ITEM-SCOPE-AMENDED',pendingSha256,revision,scopeRef,memberRef:operation.memberRef,allowedPaths,writeScope};
    });
  }catch(error){return {status:'refused',code:error.code??'NGHS-ITEM-SCOPE-UNAVAILABLE',reason:error.reason??error.message,reservation:'retained'};}
}

function nativeItemQualifications(read,pendingSha256) {
  const original=read.entries.find(row=>row.relativePath===`authority-check-${pendingSha256}.json`);
  const amendments=read.entries.filter(row=>row.relativePath.startsWith(`authority-recheck-${pendingSha256}-`)).sort((a,b)=>a.value.revision-b.value.revision);
  return {original,amendments,latest:amendments.at(-1)??original};
}
function changedItemDependencies(before,after) {
  const previous=new Map(before.files.map(row=>[row.path,row]));
  if(previous.size!==after.files.length||after.files.some(row=>!previous.has(row.path)))throw nativeManagedFault('native-item-check-manifest-amendment-required');
  return after.files.filter(row=>nativeManagedDigest(row)!==nativeManagedDigest(previous.get(row.path))).map(row=>row.path).sort();
}
function nativeItemRecheckPlan({repository,boundary,pendingSha256}) {
  const owner=nativeAuthorityOwner(repository),port=createNativeGoldfishAuthorityProducerPort({repository}),read=nativeAuthorityScan(owner);
  const pending=read.entries.find(row=>row.relativePath.startsWith('pending-')&&row.sourceFact.sha256===pendingSha256);
  const operation=[...owner.operations.values()].find(row=>row.pendingSha256===pendingSha256);
  if(!pending?.value.binding.itemDelivery||!operation||operation.phase!=='terminal-observed')throw nativeManagedFault('native-item-not-delivered');
  const current=nativeManagedCurrentOwner(repository);
  if(current.association.state!=='bound'||nativeManagedDigest(current.association)!==nativeManagedDigest(operation.association))throw nativeManagedFault('native-item-recheck-owner');
  const producer=inspectSourceOwnedSessionAuthorityProducerRecord({boundary,producerPort:port});
  const members=producer.record.members.map(row=>inspectSourceOwnedSessionAuthorityMemberRecord({boundary,producerPort:port,memberRef:row.memberRef})).filter(row=>row.record.bindingSha256===operation.bindingSha256);
  if(members.length!==1||members[0].record.phase!=='terminal-observed')throw nativeManagedFault('native-item-recheck-released-or-foreign');
  const governed=resolveGovernedItemQueue({root:repository.primaryRoot});
  const item=governed.status==='required'?governed.normalized.slices.find(row=>row.id===pending.value.delivery.sliceId):null;
  const approval=observeCurrentPlanApprovalForCalibration({rootDir:repository.primaryRoot});
  if(!item||item.delivery.itemId!==pending.value.delivery.itemId||approval.status!=='eligible'||item.delivery.approvalSha256!==approval.approvalSha256
    ||nativeManagedDigest(item.delivery.criterionLocator)!==nativeManagedDigest(pending.value.binding.itemDelivery.criterionLocator)
    ||nativeManagedDigest(item.delivery.checks)!==nativeManagedDigest(pending.value.binding.itemDelivery.checks))throw nativeManagedFault('native-item-recheck-approved-course-unavailable');
  const {original,amendments,latest}=nativeItemQualifications(read,pendingSha256);
  if(!original||!latest)throw nativeManagedFault('native-item-targeted-evidence-required');
  const itemDelivery=pending.value.binding.itemDelivery,snapshot=itemCheckSnapshot(repository.primaryRoot,itemDelivery,repository.candidate);
  if(snapshot.contractSha256!==original.value.evidence.contractSha256)throw nativeManagedFault('native-item-check-contract-amendment-required');
  const changedPaths=changedItemDependencies(latest.value.evidence,snapshot);
  if(itemDelivery.checks.some(check=>changedPaths.includes(check.path)))throw nativeManagedFault('native-item-check-source-amendment-required');
  const impacted=itemDelivery.checks.filter(check=>check.dependencies.some(path=>changedPaths.includes(path)));
  const terminal=read.entries.find(row=>row.relativePath===`authority-terminal-${pendingSha256}.json`),receipt=read.entries.find(row=>row.sourceFact.sha256===terminal?.value.observationSha256);
  if(!receipt)throw nativeManagedFault('native-item-return-receipt-required');
  const ancestor=spawnSync('git',['-C',repository.primaryRoot,'merge-base','--is-ancestor',receipt.value.commit,repository.candidate.commit],{env:agyHostGitEnvironment(),shell:false,timeout:10000,maxBuffer:1024*1024});
  if(ancestor.error||ancestor.status!==0)throw nativeManagedFault('native-item-not-integrated-into-main');
  recoverNativeAuthorityOperation({repository,owner,operation,port,boundary});
  return {owner,port,operation,pending,itemDelivery,snapshot,changedPaths,impacted,latest,revision:amendments.length+1};
}
/** Requalify changed dependencies for the original retained item. Selection is
 * computed from real committed files; caller PASS, a new dispatch identity, or
 * unchanged inputs cannot request an ordinary test replay. */
export function requalifyNativeGoldfishItemDelivery(input={}) {
  try {
    if(!exact(input,['root','pendingSha256'])||!SHA.test(input.pendingSha256??''))throw nativeManagedFault('native-item-recheck-input');
    const {root,pendingSha256}=input,repository=inspectSignedDescriptorCustodyRepository(root);
    const before=withSessionAuthorityBoundary({repository},boundary=>nativeItemRecheckPlan({repository,boundary,pendingSha256}));
    if(!before.impacted.length)return {status:'unchanged',code:'NGHS-ITEM-NO-IMPACTED-CHECKS',executedCheckIds:[],reservation:'retained'};
    if(before.revision>64)throw nativeManagedFault('native-item-recheck-record-bound');
    const selected={...before.itemDelivery,checks:before.impacted};
    const observed=executeGovernedItemDeliveryChecks({root:repository.primaryRoot,itemDelivery:selected,candidate:repository.candidate});
    if(observed.status!=='observed')return {...observed,reservation:'retained'};
    const actual=inspectGovernedItemDeliveryChecks({root:repository.primaryRoot,handle:observed.handle,candidate:repository.candidate,itemDelivery:selected});
    return withSessionAuthorityBoundary({repository},boundary=>{
      const after=nativeItemRecheckPlan({repository,boundary,pendingSha256});
      if(after.latest.sourceFact.sha256!==before.latest.sourceFact.sha256||nativeManagedDigest(after.snapshot)!==nativeManagedDigest(before.snapshot))throw nativeManagedFault('native-item-recheck-cas');
      const results=after.itemDelivery.checks.map(check=>{
        const executed=actual.results.find(row=>row.id===check.id);
        if(executed)return {...executed,executionCandidate:repository.candidate,reusedFromSha256:null};
        const retained=after.latest.value.evidence.results.find(row=>row.id===check.id);
        if(!retained)throw nativeManagedFault('native-item-check-result-missing');
        return {...retained,executionCandidate:retained.executionCandidate??after.latest.value.evidence.candidate,reusedFromSha256:after.latest.sourceFact.sha256};
      });
      const evidence={schema:'pipeline.item-targeted-checks.v1',candidate:repository.candidate,contractSha256:after.snapshot.contractSha256,files:after.snapshot.files,results,
        verdict:results.every(row=>row.status===0&&!row.signal&&!row.error)?'passed':'failed'};
      const value={schema:'pipeline.native-goldfish-item-recheck.v1',pendingSha256,bindingSha256:after.operation.bindingSha256,revision:after.revision,
        previousCheckSha256:after.latest.sourceFact.sha256,changedPaths:after.changedPaths,impactedCheckIds:after.impacted.map(check=>check.id),evidence};
      const stored=writeExclusive(repository.commonDir,`authority-recheck-${pendingSha256}-${after.revision}.json`,value);
      const refreshed=refreshSourceOwnedDispatchAuthorityMember({boundary,producerPort:after.port,memberHandle:after.operation.memberHandle,expectedMemberRef:after.operation.memberRef,operationHandle:after.operation.handle});after.operation.memberRef=refreshed.memberRef;
      return {status:evidence.verdict==='passed'?'requalified':'targeted-failed',code:evidence.verdict==='passed'?'NGHS-ITEM-REQUALIFIED':'NGHS-ITEM-REQUALIFICATION-FAILED',revision:after.revision,
        executedCheckIds:value.impactedCheckIds,reusedCheckIds:after.itemDelivery.checks.filter(check=>!value.impactedCheckIds.includes(check.id)).map(check=>check.id),checkRef:stored,memberRef:refreshed.memberRef,reservation:'retained'};
    });
  }catch(error){return {status:'refused',code:error.code??'NGHS-ITEM-REQUALIFICATION-UNAVAILABLE',reason:error.reason??error.message,reservation:'retained'};}
}

/** Elephant integration acknowledgement only after Source-bound targeted
 * delivery and Main ancestry/content readback. It never executes ordinary tests. */
export function integrateNativeGoldfishItemDelivery({root,pendingSha256}={}) {
  try {
    if(!SHA.test(pendingSha256??''))throw nativeManagedFault('native-item-pending-selector');
    const repository=inspectSignedDescriptorCustodyRepository(root),owner=nativeAuthorityOwner(repository),port=createNativeGoldfishAuthorityProducerPort({repository});
    return withSessionAuthorityBoundary({repository},boundary=>{
      const read=nativeAuthorityScan(owner),entry=read.entries.find(row=>row.relativePath.startsWith('pending-')&&row.sourceFact.sha256===pendingSha256);
      const operation=[...owner.operations.values()].find(row=>row.pendingSha256===pendingSha256);
      if(!entry?.value.delivery||!entry.value.binding.itemDelivery||!operation||operation.phase!=='terminal-observed')throw nativeManagedFault('native-item-not-delivered');
      const current=nativeManagedCurrentOwner(repository);
      if(current.association.state!=='bound'||nativeManagedDigest(current.association)!==nativeManagedDigest(operation.association))throw nativeManagedFault('native-item-integration-owner');
      const producer=inspectSourceOwnedSessionAuthorityProducerRecord({boundary,producerPort:port});
      const members=producer.record.members.map(row=>inspectSourceOwnedSessionAuthorityMemberRecord({boundary,producerPort:port,memberRef:row.memberRef})).filter(row=>row.record.bindingSha256===operation.bindingSha256);
      if(members.length!==1)throw nativeManagedFault('native-item-integration-member');
      const terminal=read.entries.find(row=>row.relativePath===`authority-terminal-${pendingSha256}.json`);
      const qualifications=nativeItemQualifications(read,pendingSha256),check=qualifications.latest,originalCheck=qualifications.original;
      const receipt=read.entries.find(row=>row.sourceFact.sha256===terminal?.value.observationSha256);
      const evidence=check?.value.evidence;
      if(!terminal||!check||!receipt||evidence?.verdict!=='passed'||evidence.results.some(row=>row.status!==0||row.signal||row.error)
        ||originalCheck?.value.evidence.candidate.commit!==receipt.value.commit||originalCheck?.value.evidence.candidate.tree!==receipt.value.tree)throw nativeManagedFault('native-item-targeted-evidence-required');
      const ancestor=spawnSync('git',['-C',repository.primaryRoot,'merge-base','--is-ancestor',receipt.value.commit,repository.candidate.commit],{env:agyHostGitEnvironment(),shell:false,timeout:10000,maxBuffer:1024*1024});
      if(ancestor.error||ancestor.status!==0)throw nativeManagedFault('native-item-not-integrated-into-main');
      const snapshot=itemCheckSnapshot(repository.primaryRoot,entry.value.binding.itemDelivery,repository.candidate);
      if(snapshot.contractSha256!==evidence.contractSha256||nativeManagedDigest(snapshot.files)!==nativeManagedDigest(evidence.files))throw nativeManagedFault('native-item-impacted-dependency-check-required');
      const prior=read.entries.find(row=>row.relativePath===`authority-integration-${pendingSha256}.json`);
      if(members[0].record.phase==='released'){
        if(!prior)throw nativeManagedFault('native-item-release-without-integration');
        return {status:'integrated',code:'NGHS-ITEM-INTEGRATED',memberRef:members[0].memberRef,replayed:true};
      }
      recoverNativeAuthorityOperation({repository,owner,operation,port,boundary});
      const value={schema:'pipeline.native-goldfish-item-integration.v1',pendingSha256,bindingSha256:operation.bindingSha256,kind:'integrated',
        itemId:entry.value.delivery.itemId,sliceId:entry.value.delivery.sliceId,mainCandidate:repository.candidate,checkSha256:check.sourceFact.sha256,
        recordSha256:terminal.value.recordSha256,files:snapshot.files};
      const stored=prior?{sha256:prior.sourceFact.sha256}:writeExclusive(repository.commonDir,`authority-integration-${pendingSha256}.json`,value);
      if(prior&&nativeManagedDigest(prior.value)!==nativeManagedDigest(value))throw nativeManagedFault('native-item-integration-replay-drift');
      const refreshed=refreshSourceOwnedDispatchAuthorityMember({boundary,producerPort:port,memberHandle:operation.memberHandle,expectedMemberRef:operation.memberRef,operationHandle:operation.handle});operation.memberRef=refreshed.memberRef;
      const terminalHandle=Object.freeze({});nativeItemTerminals.set(terminalHandle,{owner,pendingSha256,integrationSha256:stored.sha256});
      const released=releaseSessionAuthorityMember({boundary,producerPort:port,memberHandle:operation.memberHandle,expectedMemberRef:operation.memberRef,terminalHandle});
      return {status:'integrated',code:'NGHS-ITEM-INTEGRATED',releaseRef:released.releaseRef,memberRef:released.memberRef};
    });
  }catch(error){return {status:'refused',code:error.code??'NGHS-ITEM-INTEGRATION-UNAVAILABLE',reason:error.reason??error.message};}
}

const itemReadinessHandles=new WeakMap();
/** Opaque readiness observation consumed by the pure queue projection. A
 * serialized integratedIds/PASS object cannot promote v2 dependencies. */
export function observeGovernedItemIntegrationReadiness({root}={}) {
  try {
    const governed=resolveGovernedItemQueue({root});if(governed.status!=='required')return governed;
    const repository=inspectSignedDescriptorCustodyRepository(root);
    // PF-41: a repository whose session-authority registry was never created holds no native
    // integration record, so commit evidence alone decides; every other registry fault still refuses.
    let native,nativeRegistry='read';
    try{native=withSessionAuthorityBoundary({repository},boundary=>readNativeIntegratedSlices({governed,repository,boundary}).integrated);}
    catch(error){if(!sessionAuthorityRegistryAbsent(error))throw error;native=[];nativeRegistry='absent';}
    const integrated=[...new Set([...native,...readOrchestratorCommitIntegratedSlices({root:repository.primaryRoot,candidateCommit:repository.candidate.commit,slices:governed.normalized.slices})])];
    const handle=Object.freeze({});itemReadinessHandles.set(handle,{queueSha256:nativeManagedDigest(governed.queue),integrated,observedAt:Date.now()});
    return {status:'observed',code:'SQ-ITEM-INTEGRATION-READBACK',handle,integrated:[...integrated],nativeRegistry};
  }catch(error){return {status:'refused',code:error.code??'SQ-ITEM-INTEGRATION-READBACK-UNAVAILABLE',reason:error.reason??error.message};}
}
/** D40: an orchestrator-committed slice is integrated for dependency admission only on commit
 * evidence — a non-merge commit reachable from the candidate, strictly after the slice's base,
 * whose trailers carry exactly `Dispatch: <slice> (goldfish)`, and which touches the slice's write
 * scope. D40b: the commit may be the orchestrator's (`Commit-Act: orchestrator`) or the Goldfish's
 * own. D40a: a stopped attempt is superseded when a same-item
 * slice that depends on it is integrated by that evidence. A git fault releases nothing. */
// PF-55: the result is a pure function of the candidate's immutable history and the slice rows, so a process
// reads it once per (root, candidate, rows) instead of once per collision check.
const commitIntegrationMemo=new Map();
export function readOrchestratorCommitIntegratedSlices({root,candidateCommit,slices}) {
  const run=args=>spawnSync('git',['-C',root,...args],{env:agyHostGitEnvironment(),shell:false,timeout:30000,maxBuffer:64*1024*1024,encoding:'utf8'});
  const live=(slices??[]).filter(row=>row&&row.state!=='cancelled'&&row.tier!=='critic'&&Array.isArray(row.writeScope)&&row.writeScope.length>0
    &&row.writeScope.every(path=>typeof path==='string')&&typeof row.delivery?.baseCommit==='string'&&/^[0-9a-f]{40}$/u.test(row.delivery.baseCommit));
  if(!live.length||typeof candidateCommit!=='string'||!/^[0-9a-f]{40}$/u.test(candidateCommit))return [];
  const memoKey=`${root}\0${candidateCommit}\0${nativeManagedDigest(live)}`;
  if(commitIntegrationMemo.has(memoKey))return [...commitIntegrationMemo.get(memoKey)];
  const log=run(['log','--no-merges','--fixed-strings','--grep=(goldfish)','--name-only',
    '--format=%x1e%H%x00%(trailers:key=Dispatch,valueonly,separator=%x1f)%x00',candidateCommit,'--']);
  if(log.status!==0)return [];
  const byId=new Map(live.map(row=>[row.id,row])),direct=new Set();
  for(const record of log.stdout.split('\x1e')){
    const [sha,dispatch='',names='']=record.split('\x00');
    if(!/^[0-9a-f]{40}$/u.test(sha?.trim()??''))continue;
    const touched=names.split('\n').map(path=>path.trim()).filter(Boolean);
    for(const value of dispatch.split('\x1f').map(entry=>entry.trim())){
      const match=/^(\S+) \(goldfish\)$/u.exec(value),slice=match&&byId.get(match[1]);
      if(!slice||direct.has(slice.id)||sha.trim()===slice.delivery.baseCommit||!touched.some(path=>scopesOverlap([path],slice.writeScope)))continue;
      if(run(['merge-base','--is-ancestor',slice.delivery.baseCommit,sha.trim()]).status===0)direct.add(slice.id);
    }
  }
  // Only a `ready` predecessor can be a stopped attempt; held, deferred or blocked slices keep their hold.
  const superseded=live.filter(row=>!direct.has(row.id)&&row.state==='ready'&&live.some(next=>next.id!==row.id&&direct.has(next.id)&&(next.dependsOn??[]).includes(row.id)
    &&typeof row.delivery.itemId==='string'&&next.delivery.itemId===row.delivery.itemId)).map(row=>row.id);
  const result=[...direct,...superseded];
  if(commitIntegrationMemo.size>=64)commitIntegrationMemo.delete(commitIntegrationMemo.keys().next().value);
  commitIntegrationMemo.set(memoKey,result);
  return [...result];
}
/** Only the never-created registry catalogue counts as absent; a missing member or any other fault does not. */
export function sessionAuthorityRegistryAbsent(error) {
  return error?.code==='ENOENT'&&typeof error.path==='string'&&/[\\/]session-authority[\\/]catalogue\.json$/u.test(error.path);
}
export function readGovernedItemIntegrationReadiness(handle,queue) {
  const held=itemReadinessHandles.get(handle);
  return held&&Date.now()-held.observedAt<10000&&held.queueSha256===nativeManagedDigest(queue)?[...held.integrated]:[];
}

/** A released reservation is distinct from delivery readiness. Only actual
 * Source member release permits collision reuse; old generic records cannot. */
export function readNativeReleasedItemReservations({repository,boundary}) {
  const port=createNativeGoldfishAuthorityProducerPort({repository});
  const producer=inspectSourceOwnedSessionAuthorityProducerRecord({boundary,producerPort:port});
  const released=new Set(producer.record.members.map(row=>inspectSourceOwnedSessionAuthorityMemberRecord({boundary,producerPort:port,memberRef:row.memberRef}).record).filter(row=>row.phase==='released').map(row=>row.bindingSha256));
  const owner=nativeAuthorityOwner(repository);nativeAuthorityScan(owner);
  return {releasedPendingHashes:[...owner.operations.values()].filter(row=>released.has(row.bindingSha256)).map(row=>row.pendingSha256)};
}

function readNativeIntegratedSlices({governed,repository,boundary}) {
  const port=createNativeGoldfishAuthorityProducerPort({repository});
      const producer=inspectSourceOwnedSessionAuthorityProducerRecord({boundary,producerPort:port}),read=readNativeManagedInventory(repository,'native-goldfish')[0];
      const members=producer.record.members.map(row=>inspectSourceOwnedSessionAuthorityMemberRecord({boundary,producerPort:port,memberRef:row.memberRef}));
      const integrated=[],{releasedPendingHashes}=readNativeReleasedItemReservations({repository,boundary});
      for(const row of read.entries.filter(entry=>entry.relativePath.startsWith('authority-integration-'))) {
        if(!members.some(member=>member.record.phase==='released'&&member.record.bindingSha256===row.value.bindingSha256))continue;
        releasedPendingHashes.push(row.value.pendingSha256);
        const pending=read.entries.find(entry=>entry.relativePath.startsWith('pending-')&&entry.sourceFact.sha256===row.value.pendingSha256);
        const item=governed.normalized.slices.find(item=>item.id===row.value.sliceId&&item.delivery.itemId===row.value.itemId);
        if(!pending?.value.binding.itemDelivery||!item)continue;
        const briefing=pending.value.binding.itemDelivery;
        if(item.delivery.baseCommit!==pending.value.binding.candidateCommit||nativeManagedDigest(item.writeScope)!==nativeManagedDigest(effectiveNativePendingState(read,pending).delivery.writeScope)
          ||nativeManagedDigest(item.delivery.criterionLocator)!==nativeManagedDigest(briefing.criterionLocator)||nativeManagedDigest(item.delivery.checks)!==nativeManagedDigest(briefing.checks))continue;
        const current=itemCheckSnapshot(repository.primaryRoot,pending.value.binding.itemDelivery,repository.candidate);
        if(nativeManagedDigest(current.files)!==nativeManagedDigest(row.value.files))continue;
        integrated.push(item.id);
      }
  const agy=readAgyIntegratedItemDelivery({repository,boundary,governed});
  return {integrated:[...new Set([...integrated,...agy.integratedSliceIds])],releasedPendingHashes};
}

/** D51 (2): the slices whose item reservations no longer block an owner, criterion or write-scope check:
 * integrated by a native record or by D40/D40b commit evidence, or cancelled in the governed queue.
 * Every native and AGY collision check reads this one definition. */
function settledItemSlices(integratedIds,governed){
  return new Set([...integratedIds,...(governed?.status==='required'?governed.normalized.slices.filter(row=>row.state==='cancelled').map(row=>row.id):[])]);
}
export function readSettledItemSliceIds({repository,boundary,governed=resolveGovernedItemQueue({root:repository.primaryRoot})}={}) {
  if(governed?.status!=='required')return new Set();
  const {integrated}=readNativeIntegratedSlices({governed,repository,boundary});
  return settledItemSlices([...integrated,...readOrchestratorCommitIntegratedSlices({root:repository.primaryRoot,candidateCommit:repository.candidate.commit,slices:governed.normalized.slices})],governed);
}
/** The repair a reservation collision names: the slice that still holds it and the commands that release it. */
export function itemReservationRepair(sliceId) {
  return typeof sliceId==='string'
    ?`slice ${sliceId} still holds this reservation. If it delivered, its "Dispatch: ${sliceId} (goldfish)" commit releases it. If its Goldfish no longer runs: node ${SLICE_QUEUE_SCRIPT} cancel ${sliceId} --started --reason "<why>"`
    :'a reservation that names no slice holds this item; report it to the PO with the refusal';
}
function reservationFault(reason,sliceId){return Object.assign(nativeManagedFault(reason),{repair:itemReservationRepair(sliceId)});}
/** D52 (2): a dirty host baseline names its paths and the repair, not only its code. */
function baselineFault(captured) {
  const fault=nativeManagedFault(captured.code);
  if(captured.code!=='AGY-HOST-BASELINE-DIRTY')return fault;
  if(captured.headMatches===false)return Object.assign(fault,{repair:'HEAD is no longer the binding\'s candidate: regenerate the binding at the current HEAD (dispatch-briefing.mjs binding) and dispatch again'});
  const paths=captured.dirtyPaths??[],state=paths.filter(path=>/(^|\/)pipeline-state\.json$/u.test(path));
  return Object.assign(fault,{repair:`commit or restore these tracked paths before dispatching: ${paths.join(', ')||'(none named)'}${state.length?`; the push-approval record approve-push leaves in ${state.join(', ')} is committed once its approved push has landed: write the subject "chore(pipeline-state): fold pending push-approval record" to a message file, then git commit -F <message file> -- ${state.join(' ')}`:''}`});
}

function validItemCheckpoint(value) {
  return exact(value,['schema','declaredPhase','contextPaths','remainingClauses','summary'])&&value.schema==='pipeline.item-owned-checkpoint.v1'
    &&['analysis','design','implementation','targeted-checks','integration-pending','blocked'].includes(value.declaredPhase)
    &&Array.isArray(value.contextPaths)&&value.contextPaths.length<=64&&value.contextPaths.every(path=>normalizeScope(path).ok)
    &&Array.isArray(value.remainingClauses)&&value.remainingClauses.length<=64&&value.remainingClauses.every(id=>ID.test(id))
    &&typeof value.summary==='string'&&Buffer.byteLength(value.summary)<=4096&&!value.summary.includes('\0');
}
/** Durable owner-declared context, explicitly distinct from host-observed tools
 * or tests. Forged phase/prose cannot produce delivery or acceptance. */
export function checkpointNativeGoldfishItemDelivery({root,pendingSha256,checkpoint}={}) {
  try {
    if(!SHA.test(pendingSha256??'')||!validItemCheckpoint(checkpoint))throw nativeManagedFault('native-item-checkpoint-input');
    const repository=inspectSignedDescriptorCustodyRepository(root),owner=nativeAuthorityOwner(repository),port=createNativeGoldfishAuthorityProducerPort({repository});
    return withSessionAuthorityBoundary({repository},boundary=>{
      const read=nativeAuthorityScan(owner),pending=read.entries.find(row=>row.relativePath.startsWith('pending-')&&row.sourceFact.sha256===pendingSha256);
      const operation=[...owner.operations.values()].find(row=>row.pendingSha256===pendingSha256),current=nativeManagedCurrentOwner(repository);
      if(!pending?.value.delivery||!operation||current.association.state!=='bound'||nativeManagedDigest(current.association)!==nativeManagedDigest(operation.association))throw nativeManagedFault('native-item-checkpoint-owner');
      recoverNativeAuthorityOperation({repository,owner,operation,port,boundary});
      const revision=read.entries.filter(row=>row.relativePath.startsWith(`authority-checkpoint-${pendingSha256}-`)).length+1;
      if(revision>64)throw nativeManagedFault('native-item-checkpoint-limit');
      const stored=writeExclusive(repository.commonDir,`authority-checkpoint-${pendingSha256}-${revision}.json`,{schema:'pipeline.native-goldfish-item-checkpoint.v1',pendingSha256,bindingSha256:operation.bindingSha256,revision,checkpoint});
      const refreshed=refreshSourceOwnedDispatchAuthorityMember({boundary,producerPort:port,memberHandle:operation.memberHandle,expectedMemberRef:operation.memberRef,operationHandle:operation.handle});operation.memberRef=refreshed.memberRef;
      return {status:'checkpointed',code:'NGHS-ITEM-CHECKPOINTED',revision,checkpointRef:stored,memberRef:operation.memberRef};
    });
  }catch(error){return {status:'refused',code:error.code??'NGHS-ITEM-CHECKPOINT-UNAVAILABLE',reason:error.reason??error.message};}
}
export function cancelNativeGoldfishItemDelivery({root,pendingSha256}={}) {
  try {
    const repository=inspectSignedDescriptorCustodyRepository(root),owner=nativeAuthorityOwner(repository);
    const read=nativeAuthorityScan(owner),pending=read.entries.find(row=>row.relativePath.startsWith('pending-')&&row.sourceFact.sha256===pendingSha256);
    const current=nativeManagedCurrentOwner(repository),operation=[...owner.operations.values()].find(row=>row.pendingSha256===pendingSha256);
    if(!pending?.value.delivery||current.association.state!=='bound'||!operation||nativeManagedDigest(current.association)!==nativeManagedDigest(operation.association))throw nativeManagedFault('native-item-cancel-owner');
    return {status:'refused',code:'NGHS-ITEM-CANCELLATION-WITNESS-UNAVAILABLE',reservation:'retained',
      repair:'The native host must provide an authenticated opaque child-disposal witness resolving this pending hash and logical agent identity; parent-process exit or caller hook prose is insufficient.'};
  }catch(error){return {status:'refused',code:error.code??'NGHS-ITEM-CANCELLATION-UNAVAILABLE',reason:error.reason??error.message,reservation:'retained'};}
}
