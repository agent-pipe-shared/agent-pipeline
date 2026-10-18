import { withSourceOwnedNativeConcurrentCommit } from "./native-goldfish-host-state.mjs";
import { nativeManagedDigest, nativeManagedFault, nativeManagedRepository, nativeManagedCurrentOwner, nativeManagedSourceRef, readNativeManagedSource, readNativeManagedInventory, nativeManagedRegistryPresent, nativeManagedAssociation } from './native-managed-authority-support.mjs';
import { inspectSignedDescriptorCustodyRepository } from './worktree-lifecycle.mjs';
import { completeNativeGoldfishAuthority, prepareNativeGoldfishAuthorityTerminal } from './native-goldfish-host-state.mjs';
import { readNativeGoldfishHostObservation } from './native-goldfish-host-observation.mjs';
import { constants, lstatSync, openSync, fstatSync, readFileSync, closeSync } from 'node:fs';
import { parseStrictJson } from './governance-event.mjs';
// SPDX-License-Identifier: SUL-1.0
/** Host-owned Claude/Codex Goldfish completion: validate, commit, receipt, then v4 record. */
import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import { assessAgyHostCommit, assessSourceOwnedNativeHostCommit, NATIVE_CONCURRENT_HOST_COMMIT_BASELINE_SCHEMA } from "./agy-host-commit-admission.mjs";
import { commitAdmittedNativeGoldfishReturn } from "./agy-host-commit-execution.mjs";
import { CRITIC_REQUIRED_SCHEMA, criticDecisionPathFinding, validateCriticDecision } from "./critic-skip-decision.mjs";
import { OUTCOME_CLASSIFICATION_SCHEMA, validateDispatchRecord } from "./dispatch-record.mjs";
import { bindNativeCodexStart, readNativeCodexPending, readNativeGoldfishPending } from "./native-goldfish-host-state.mjs";
import { draftNativeGoldfishHostObservation, nativeAuthoredRecordBytes,
  persistNativeGoldfishHostObservation } from "./native-goldfish-host-observation.mjs";
import { observeClaudeGoldfishReturn, observeCodexGoldfishReturn } from "./native-goldfish-host-return.mjs";
import { resolveGitCommonDir } from "./po-key-directory.mjs";
import { inspectNativeGoldfishDispatchAttempt, bindNativeGoldfishDispatchAttempt, writeNativeGoldfishAttemptTerminalAssociation, writeHostObservedNativeGoldfishDispatchRecord } from "../scripts/dispatch-record-write.mjs";

function fail(code, status = "recovery-required") { return { status, code, commit: null, record: null }; }
function physicalRoot(value) {
  try { return realpathSync(resolve(value)); } catch { return null; }
}

import { NATIVE_GOLDFISH_SUBAGENT_STOP_COMPLETION_ROUTE, nativeGoldfishHostStateInternals } from "./native-goldfish-host-state.mjs";
import { validateNativeGoldfishFinal } from "./native-goldfish-host-return.mjs";
import { isAbsolute, join } from "node:path";
import { readdirSync } from "node:fs";

// The observation receipt is keyed by dispatchId + the NEW host commit, which a replayed stop cannot know, so "already
// committed" is a scan of the private receipts for this dispatch, candidate and launching call. An unreadable private
// directory fails closed (treated as consumed); a corrupt single entry is never a match (the HEAD == candidate admission
// remains the backstop behind this scan).
function subagentStopAlreadyObserved({ commonDir, state }) {
  let names;
  try { names = readdirSync(nativeGoldfishHostStateInternals.privateDirectory(commonDir, false)); } catch { return true; }
  for (const name of names) {
    if (!name.startsWith("observation-claude-") || !name.endsWith(".json")) continue;
    try {
      const { value } = nativeGoldfishHostStateInternals.readPrivate(commonDir, name);
      if (value?.runner === "claude" && value.dispatchId === state.binding.dispatchId
        && value.candidateCommit === state.binding.candidateCommit && value.toolUseId === state.toolUseId) return true;
    } catch { /* corrupt private evidence is never a match */ }
  }
  return false;
}

// Claude SubagentStop completion of an explicit background dispatch (completionRoute "subagent-stop"). The stop input
// carries no tool_use_id, so the launching call is resolved from the child's own meta file, exactly as
// resolveParentDispatchToolUseId does in hooks/guard-dispatch-budget.mjs (re-stated here: lib never imports hooks).
const SUBAGENT_STOP_ASSURANCE = "host-observed-subagent-stop-correlation-model-not-observed";
const GOLDFISH_AGENT_TYPES = new Set(["goldfish-implementor", "goldfish-mechanic", "goldfish-deep"]);
const normalizedAgentType = (value) => typeof value !== "string" ? null
  : value.startsWith("pipeline-core:") ? value.slice("pipeline-core:".length) : value;

function resolveSubagentStopToolUseId(input) {
  const transcriptPath = input.transcript_path;
  if (typeof transcriptPath !== "string" || !isAbsolute(transcriptPath) || !transcriptPath.endsWith(".jsonl")) return null;
  const agentId = input.agent_id;
  if (typeof agentId !== "string" || agentId.trim() === "" || agentId.includes("/") || agentId.includes("\\")) return null;
  let meta;
  try { meta = JSON.parse(readFileSync(join(transcriptPath.slice(0, -".jsonl".length), "subagents", `agent-${agentId}.meta.json`), "utf8")); }
  catch { return null; }
  if (!Number.isFinite(meta?.spawnDepth) || meta.spawnDepth < 1
    || normalizedAgentType(meta.agentType) !== normalizedAgentType(input.agent_type)
    || typeof meta.toolUseId !== "string" || meta.toolUseId.trim() === "") return null;
  return meta.toolUseId;
}

// Any child that is not a known Goldfish role, has no usable meta file, names no pending dispatch, or belongs to a
// foreground (PostToolUse-completed) state is simply not this route's: the caller reports a silent not-applicable.
function readSubagentStopPending({ commonDir, input }) {
  const agentType = normalizedAgentType(input.agent_type);
  if (!GOLDFISH_AGENT_TYPES.has(agentType)) return { ok: false, code: "NGHF-NOT-APPLICABLE" };
  const toolUseId = resolveSubagentStopToolUseId(input);
  if (toolUseId === null) return { ok: false, code: "NGHF-STOP-UNRESOLVED" };
  const pending = readNativeGoldfishPending({ commonDir, runner: "claude", sessionId: input.session_id, correlationId: toolUseId });
  if (!pending.ok) return { ok: false, code: "NGHF-PENDING-UNAVAILABLE" };
  if (pending.state.completionRoute !== NATIVE_GOLDFISH_SUBAGENT_STOP_COMPLETION_ROUTE
    || pending.state.binding?.agentType !== agentType) return { ok: false, code: "NGHF-NOT-SUBAGENT-STOP-ROUTE" };
  return { ok: true, pending };
}

// The stop carries no resolved model and no tool_response: only the final message is validated, against the binding.
// A model identity is never inferred; the receipt names its assurance as correlation-only.
function observeClaudeSubagentStop(input, pending) {
  const state = pending.state;
  if (typeof input.session_id !== "string" || input.session_id !== state.sessionId
    || state.runner !== "claude" || state.binding?.runner !== "claude"
    || typeof input.last_assistant_message !== "string") return { ok: false, code: "NGHR-CLAUDE-STOP-CORRELATION" };
  const final = validateNativeGoldfishFinal(input.last_assistant_message, { binding: state.binding });
  return final.ok ? { ...final, runner: "claude", assurance: SUBAGENT_STOP_ASSURANCE } : final;
}

// Only the host launch call and its correlated successful return are observed.
// This is diagnostic history; it cannot attest worker phases or tool counts.
function observedNativeHostProgress({ state, observation }) {
  if (!state || !["claude", "codex"].includes(state.runner)
    || typeof state.toolUseId !== "string" || state.toolUseId.length === 0
    || observation?.ok !== true || observation.runner !== state.runner
    || observation.code !== "NGHR-FINAL-VALIDATED"
    || observation.final?.outcome !== "succeeded") return [];
  // One source-bound Agent/Task/spawn_agent launch call was captured in pending
  // state. Its return is the same call, so the cumulative host-call count stays
  // one. No worker tool event was collected by these host ports.
  return [
    { phase: "host-dispatch-prepared", toolUseCount: 1,
      note: "Host launch call observed; count covers that host call only. Worker phases and worker tool count are unavailable." },
    { phase: "host-return-observed", toolUseCount: 1,
      note: "Correlated successful host return observed for the same launch call. Worker phases and worker tool count are unavailable." },
  ];
}

function draftRecord({ state, observation, commitReadback }) {
  const binding = state.binding;
  const decision = validateCriticDecision(binding.criticDecision,
    { required: binding.criticDecision.schema === CRITIC_REQUIRED_SCHEMA });
  const pathFinding = criticDecisionPathFinding(decision, observation.final.changedPaths);
  if (pathFinding) return { ok: false, code: "NGHF-CRITIC-PATH-DISPOSITION" };
  const report = { text: observation.final.report, changedFiles: [...observation.final.changedPaths].sort() };
  const record = {
    schema: "pipeline.dispatch-record.v4", runner: state.runner,
    taskId: binding.dispatchId, agentType: binding.agentType,
    model: binding.model, effort: binding.effort, rulesetSha: binding.rulesetSha,
    dispatcher: "Elephant", candidateCommit: commitReadback.commit,
    resultSha256: observation.final.reportSha256, outcome: "completed", commits: [commitReadback.commit],
    log: observedNativeHostProgress({ state, observation }), report,
    outcomeClassification: { schema: OUTCOME_CLASSIFICATION_SCHEMA, kind: "authored-commit" },
    ...(decision.schema === CRITIC_REQUIRED_SCHEMA ? { criticRequired: decision } : { criticSkip: decision }),
  };
  try { validateDispatchRecord(record); }
  catch { return { ok: false, code: "NGHF-RECORD-INVALID" }; }
  return { ok: true, record };
}

/**
 * Complete an opt-in marked native return. Every error after a possible Git
 * write is recovery-required; this route never manufactures a no-commit fact.
 */
export function finalizeNativeGoldfishHostReturn({ runner, root, input } = {}, dependencies = {}) {
  if (!["claude", "codex"].includes(runner) || !input || typeof input !== "object") return fail("NGHF-INPUT", "not-applicable");
  const physical = physicalRoot(root ?? input.cwd ?? process.env.CLAUDE_PROJECT_DIR ?? process.cwd());
  if (!physical) return fail("NGHF-ROOT");
  const commonDir = (dependencies.resolveCommonDir ?? resolveGitCommonDir)(physical);
  if (typeof commonDir !== "string") return fail("NGHF-COMMON-DIR");

  if (runner === "codex" && input.hook_event_name === "SubagentStart") {
    const bound = bindNativeCodexStart({ commonDir, input });
    return bound.ok ? { status: "agent-bound", code: bound.code, commit: null, record: null }
      : fail(bound.code, "not-finalized");
  }

  let pending;
  let observation;
  if (runner === "claude" && input.hook_event_name === "PostToolUse" && ["Agent", "Task"].includes(input.tool_name)) {
    pending = readNativeGoldfishPending({ commonDir, runner, sessionId: input.session_id,
      correlationId: input.tool_use_id });
    if (!pending.ok) {
      const marked = typeof input.tool_input?.prompt === "string"
        && /<!-- pipeline-native-goldfish-host-commit:v[123](?:\s|$)/u.test(input.tool_input.prompt);
      // The exact reason, so the hook message can name it: a background launch (async_launched or an explicit
      // run_in_background true) never reaches a final PostToolUse return, whereas every other missing-state case
      // means the pre-launch preparation did not write pending state (its PreToolUse WARNING names the code).
      const asyncLaunch = input.tool_response?.status === "async_launched" || input.tool_input?.run_in_background === true;
      return marked ? { ...fail("NGHF-PENDING-UNAVAILABLE"), reason: asyncLaunch ? "async-launch" : "no-pending" }
        : fail("NGHF-NOT-APPLICABLE", "not-applicable");
    }
    if (pending.state.completionRoute === NATIVE_GOLDFISH_SUBAGENT_STOP_COMPLETION_ROUTE) {
      // This state is completed only at SubagentStop. No PostToolUse reads a return, validates, or consumes it; the
      // async launch is acknowledged, anything else is silent.
      return input.tool_response?.status === "async_launched"
        ? { status: "awaiting-subagent-stop", code: "NGHF-AWAITING-SUBAGENT-STOP", dispatchId: pending.state.binding.dispatchId, commit: null, record: null }
        : fail("NGHF-SUBAGENT-STOP-ROUTE-ONLY", "not-applicable");
    }
    observation = observeClaudeGoldfishReturn(input, pending.state);
  } else if (runner === "claude" && input.hook_event_name === "SubagentStop") {
    const stop = readSubagentStopPending({ commonDir, input });
    if (!stop.ok) return fail(stop.code, "not-applicable");
    pending = stop.pending;
    if (pending.state.root !== physical || pending.state.commonDir !== commonDir) return fail("NGHF-STATE-ROOT-MISMATCH");
    // Consume once: any observation receipt for this dispatch and candidate means the host already committed (a
    // replayed stop must not commit again); the HEAD == candidate admission is only the backstop behind this check.
    if (subagentStopAlreadyObserved({ commonDir, state: pending.state })) return fail("NGHF-RECEIPT-EXISTS", "not-applicable");
    observation = observeClaudeSubagentStop(input, pending);
  } else if (runner === "codex" && input.hook_event_name === "SubagentStop") {
    pending = readNativeCodexPending({ commonDir, input });
    if (!pending.ok) return fail("NGHF-PENDING-UNAVAILABLE", "not-applicable");
    observation = observeCodexGoldfishReturn(input, pending.state);
  } else return fail("NGHF-NOT-APPLICABLE", "not-applicable");

  const state = pending.state;
  if (state.root !== physical || state.commonDir !== commonDir || state.binding.runner !== runner) return fail("NGHF-STATE-ROOT-MISMATCH");
  if (!observation?.ok) return fail(observation?.code ?? "NGHF-RETURN-INVALID", "not-finalized");
  if (observation.final.outcome !== "succeeded") return fail("NGHF-RETURN-NOT-SUCCESS", "not-finalized");

  const concurrent=state.binding.itemDelivery&&state.baseline?.schema===NATIVE_CONCURRENT_HOST_COMMIT_BASELINE_SCHEMA;
  let admission = concurrent ? null : (dependencies.assess ?? assessAgyHostCommit)({ baseline: state.baseline,
    final: observation.final, allowedPaths: state.binding.allowedPaths });
  if (!concurrent && !admission?.ok) return fail(admission?.code ?? "NGHF-COMMIT-ADMISSION");

  // Read before committing; new public evidence is published afterwards so it
  // cannot alter the exact diff admitted for this host commit.
  let observedAttempt;
  // A SubagentStop completion has no PostToolUse of its own: the attempt/record writer reopens the pending state from a
  // PostToolUse-shaped selector, so it is handed exactly the identifiers of the launching call and nothing else.
  const attemptInput = state.completionRoute === NATIVE_GOLDFISH_SUBAGENT_STOP_COMPLETION_ROUTE && input.hook_event_name === "SubagentStop"
    ? { hook_event_name: "PostToolUse", tool_name: "Agent", session_id: state.sessionId, tool_use_id: state.toolUseId } : input;
  try { observedAttempt = inspectNativeGoldfishDispatchAttempt({ repoRoot: physical, runner, input: attemptInput }); }
  catch (error) { return fail(error.code ?? "NGHF-ATTEMPT-ADMISSION"); }

  try { prepareNativeGoldfishAuthorityTerminal({repository:inspectSignedDescriptorCustodyRepository(physical),pendingSha256:pending.sha256}); }
  catch(error) { return fail(error.code??"NGHF-AUTHORITY-RECOVERY"); }

  let committed;
  try {
    const commit = nativeAuthority => {
      if(nativeAuthority)admission=assessSourceOwnedNativeHostCommit({baseline:state.baseline,final:observation.final,allowedPaths:state.binding.allowedPaths,authority:nativeAuthority});
      if(!admission?.ok)return admission;
      return (dependencies.commit ?? commitAdmittedNativeGoldfishReturn)({ runner,
        adapterVersion: state.binding.adapterVersion ?? 1, baseline: state.baseline,
        final: observation.final, allowedPaths: state.binding.allowedPaths,
        taskId: state.binding.dispatchId, priorAdmission: admission,...(nativeAuthority?{nativeAuthority}:{}) });
    };
    committed=concurrent?withSourceOwnedNativeConcurrentCommit({root:physical,pendingSha256:pending.sha256},commit):commit(null);
  } catch { return { ...fail("NGHF-COMMIT-EXCEPTION"), commit: "unknown" }; }
  if (!committed?.ok) return { ...fail(committed?.code ?? "NGHF-COMMIT-FAILED"), commit: committed?.commit ?? null };

  let postCommitStage = "attempt-admission";
  let attempt;
  try {
    attempt = bindNativeGoldfishDispatchAttempt({ repoRoot: physical, runner, input: attemptInput,
      expectedPendingSha256: observedAttempt.pendingSha256 });
    postCommitStage = "record-draft";
    const drafted = draftRecord({ state, observation, commitReadback: committed });
    if (!drafted.ok) return { ...fail(drafted.code), commit: committed.commit };
    const recordBytes = nativeAuthoredRecordBytes(drafted.record);
    postCommitStage = "observation-draft";
    const receipt = draftNativeGoldfishHostObservation({ state, observation,
      commitReadback: committed, record: drafted.record, nativeAdmission:concurrent?admission:null });
    if (!receipt.ok) return { ...fail(receipt.code), commit: committed.commit };
    postCommitStage = "private-observation";
    const stored = persistNativeGoldfishHostObservation({ commonDir, receipt: receipt.receipt,
      record: drafted.record, recordBytes });
    if (!stored.ok) return { ...fail(stored.code), commit: committed.commit };
    postCommitStage = "v4-publication";
    const published = (dependencies.writeRecord ?? writeHostObservedNativeGoldfishDispatchRecord)({
      repoRoot: physical, target: `evidence/dispatch-record-${state.binding.dispatchId}.json`, record: drafted.record,
    });
    postCommitStage = "attempt-terminal-association";
    const terminalAssociation = writeNativeGoldfishAttemptTerminalAssociation({ repoRoot: physical, record: drafted.record, attempt });
    postCommitStage = "authority-terminal-release";
    const delivery=publishNativeAuthorityTerminal({physical,commonDir,pending,state,stored,published,terminalAssociation,record:drafted.record});
    return { attempt, terminalAssociation, ...(state.delivery?{delivery:{...delivery,pendingSha256:pending.sha256}}:{}), status: "authored-commit-recorded", code: "NGHF-AUTHORED-RECORD-VERIFIED",
      commit: committed.commit, record: { target: published.target, sha256: published.sha256,
        authorship: "host-observed-local" } };
  } catch(error) { return { ...fail(`NGHF-${postCommitStage.toUpperCase()}-EXCEPTION`), causeCode:error?.code??null, causeMessage:error?.message??null, commit: committed.commit }; }
}

const nativeAuthorityTerminals=new WeakMap();
function nativeTerminalPublicRead(root,ref){
  if(!ref||typeof ref.target!=='string'||!/^evidence\/[A-Za-z0-9._:-]+\.json$/.test(ref.target))throw nativeManagedFault('native-terminal-public-reference');
  const path=resolve(root,ref.target),before=lstatSync(path);
  if(!before.isFile()||before.isSymbolicLink()||before.nlink!==1||before.size>1024*1024||realpathSync(path)!==path)throw nativeManagedFault('native-terminal-public-file');
  const fd=openSync(path,constants.O_RDONLY|constants.O_NOFOLLOW);
  try{const opened=fstatSync(fd),bytes=readFileSync(fd),after=lstatSync(path);
    if(before.dev!==opened.dev||before.ino!==opened.ino||after.dev!==opened.dev||after.ino!==opened.ino||before.mode!==after.mode
      ||before.mtimeMs!==after.mtimeMs||before.ctimeMs!==after.ctimeMs||bytes.length!==before.size||nativeManagedDigest(bytes)!==ref.sha256)throw nativeManagedFault('native-terminal-public-cas');
    return parseStrictJson(bytes);
  }finally{closeSync(fd);}
}
function publishNativeAuthorityTerminal({physical,commonDir,pending,state,stored,published,terminalAssociation,record}){
  const repository=inspectSignedDescriptorCustodyRepository(physical);
  if(repository.commonDir!==commonDir)throw nativeManagedFault('native-terminal-repository');
  const terminalHandle=Object.freeze({});nativeAuthorityTerminals.set(terminalHandle,{repository,pendingSha256:pending.sha256,state,stored,published,terminalAssociation,record});
  inspectNativeGoldfishAuthorityTerminal({repository,terminalHandle});
  return completeNativeGoldfishAuthority({repository,terminalHandle});
}
export function inspectNativeGoldfishAuthorityTerminal({repository,terminalHandle}){
  const entry=nativeAuthorityTerminals.get(terminalHandle);
  if(!entry||entry.repository.primaryRoot!==repository.primaryRoot||entry.repository.commonDir!==repository.commonDir)throw nativeManagedFault('native-terminal-unowned');
  nativeManagedRepository(repository);
  const record=nativeTerminalPublicRead(repository.primaryRoot,entry.published),association=nativeTerminalPublicRead(repository.primaryRoot,entry.terminalAssociation);
  validateDispatchRecord(record);
  if(nativeManagedDigest(nativeAuthoredRecordBytes(record))!==entry.published.sha256||record.taskId!==entry.state.binding.dispatchId
    ||record.outcome!=='completed'||record.outcomeClassification?.kind!=='authored-commit'
    ||association.schema!=='pipeline.dispatch-attempt-terminal.v1'||association.taskId!==record.taskId
    ||association.terminalSha256!==entry.published.sha256||association.terminalPath!==entry.published.target)throw nativeManagedFault('native-terminal-linkage');
  const observed=readNativeGoldfishHostObservation({commonDir:repository.commonDir,taskId:record.taskId,candidateCommit:record.candidateCommit,record,recordBytes:nativeAuthoredRecordBytes(record)});
  if(!observed.ok||observed.sha256!==entry.stored.sha256)throw nativeManagedFault('native-terminal-observation-cas');
  const pending=readNativeGoldfishPending({commonDir:repository.commonDir,runner:entry.state.runner,sessionId:entry.state.sessionId,correlationId:entry.state.toolUseId});
  if(!pending.ok||pending.sha256!==entry.pendingSha256)throw nativeManagedFault('native-terminal-pending-cas');
  return Object.freeze({pendingSha256:entry.pendingSha256,terminalAssociationSha256:entry.terminalAssociation.sha256,observationSha256:observed.sha256,recordSha256:entry.published.sha256});
}
