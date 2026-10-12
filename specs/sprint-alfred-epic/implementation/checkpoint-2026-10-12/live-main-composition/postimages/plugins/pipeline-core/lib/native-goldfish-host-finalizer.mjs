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
      return marked ? fail("NGHF-PENDING-UNAVAILABLE") : fail("NGHF-NOT-APPLICABLE", "not-applicable");
    }
    observation = observeClaudeGoldfishReturn(input, pending.state);
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
  try { observedAttempt = inspectNativeGoldfishDispatchAttempt({ repoRoot: physical, runner, input }); }
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
    attempt = bindNativeGoldfishDispatchAttempt({ repoRoot: physical, runner, input,
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
