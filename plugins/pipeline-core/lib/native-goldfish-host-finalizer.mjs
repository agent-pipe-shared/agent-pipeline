// SPDX-License-Identifier: SUL-1.0
/** Host-owned Claude/Codex Goldfish completion: validate, commit, receipt, then v4 record. */
import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import { assessAgyHostCommit } from "./agy-host-commit-admission.mjs";
import { commitAdmittedNativeGoldfishReturn } from "./agy-host-commit-execution.mjs";
import { CRITIC_REQUIRED_SCHEMA, criticDecisionPathFinding, validateCriticDecision } from "./critic-skip-decision.mjs";
import { OUTCOME_CLASSIFICATION_SCHEMA, validateDispatchRecord } from "./dispatch-record.mjs";
import { bindNativeCodexStart, readNativeCodexPending, readNativeGoldfishPending } from "./native-goldfish-host-state.mjs";
import { draftNativeGoldfishHostObservation, nativeAuthoredRecordBytes,
  persistNativeGoldfishHostObservation } from "./native-goldfish-host-observation.mjs";
import { observeClaudeGoldfishReturn, observeCodexGoldfishReturn } from "./native-goldfish-host-return.mjs";
import { resolveGitCommonDir } from "./po-key-directory.mjs";
import { writeHostObservedNativeGoldfishDispatchRecord } from "../scripts/dispatch-record-write.mjs";

function fail(code, status = "recovery-required") { return { status, code, commit: null, record: null }; }
function physicalRoot(value) {
  try { return realpathSync(resolve(value)); } catch { return null; }
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
    log: [], report,
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
        && input.tool_input.prompt.includes("<!-- pipeline-native-goldfish-host-commit:v1");
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

  const admission = (dependencies.assess ?? assessAgyHostCommit)({ baseline: state.baseline,
    final: observation.final, allowedPaths: state.binding.allowedPaths });
  if (!admission?.ok) return fail(admission?.code ?? "NGHF-COMMIT-ADMISSION");

  let committed;
  try {
    committed = (dependencies.commit ?? commitAdmittedNativeGoldfishReturn)({ runner,
      adapterVersion: state.binding.adapterVersion ?? 1, baseline: state.baseline,
      final: observation.final, allowedPaths: state.binding.allowedPaths,
      taskId: state.binding.dispatchId, priorAdmission: admission });
  } catch { return { ...fail("NGHF-COMMIT-EXCEPTION"), commit: "unknown" }; }
  if (!committed?.ok) return { ...fail(committed?.code ?? "NGHF-COMMIT-FAILED"), commit: committed?.commit ?? null };

  let postCommitStage = "record-draft";
  try {
    const drafted = draftRecord({ state, observation, commitReadback: committed });
    if (!drafted.ok) return { ...fail(drafted.code), commit: committed.commit };
    const recordBytes = nativeAuthoredRecordBytes(drafted.record);
    postCommitStage = "observation-draft";
    const receipt = draftNativeGoldfishHostObservation({ state, observation,
      commitReadback: committed, record: drafted.record });
    if (!receipt.ok) return { ...fail(receipt.code), commit: committed.commit };
    postCommitStage = "private-observation";
    const stored = persistNativeGoldfishHostObservation({ commonDir, receipt: receipt.receipt,
      record: drafted.record, recordBytes });
    if (!stored.ok) return { ...fail(stored.code), commit: committed.commit };
    postCommitStage = "v4-publication";
    const published = (dependencies.writeRecord ?? writeHostObservedNativeGoldfishDispatchRecord)({
      repoRoot: physical, target: `evidence/dispatch-record-${state.binding.dispatchId}.json`, record: drafted.record,
    });
    return { status: "authored-commit-recorded", code: "NGHF-AUTHORED-RECORD-VERIFIED",
      commit: committed.commit, record: { target: published.target, sha256: published.sha256,
        authorship: "host-observed-local" } };
  } catch { return { ...fail(`NGHF-${postCommitStage.toUpperCase()}-EXCEPTION`), commit: committed.commit }; }
}
