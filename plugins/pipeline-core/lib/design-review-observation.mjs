// SPDX-License-Identifier: SUL-1.0
/**
 * Host observation of a design review dispatch (L3 part 3, PO tiles 2026-11-13, D247).
 *
 * The design review is a dispatch of the read-only `readiness-reviewer` role. On Claude the plugin's own hooks see that
 * dispatch end and record, in the device-local private control area, which model the host ran and the digest of the text
 * it returned:
 *  - foreground: the Task/Agent PostToolUse result (`tool_response.status: "completed"`, `resolvedModel`, `modelsUsed`,
 *    the returned text blocks) -> assurance `host-observed-tool-use`;
 *  - background: the SubagentStop carries no model, so the models come from the child's own host-written transcript
 *    (`<transcript without .jsonl>/subagents/agent-<agent_id>.jsonl`, `message.model` of its assistant records), the same
 *    file the Goldfish stop already trusts for a SubagentHandback; the returned text is the child's last SubagentHandback
 *    message (what the parent receives), else `last_assistant_message` -> assurance `host-observed-child-transcript`.
 * The hook reads the transcript itself, bounded, and keeps only the model ids and the returned text: nothing of it reaches
 * the agent's context (PO 2026-11-13: without flooding the context).
 *
 * `design-review-receipt.mjs export-report` writes the observed text as the report file, so the report bytes are the
 * host's and their digest finds the observation again; `create` reads the observation by that digest and stamps it into
 * the receipt. What this does not prove: that the reviewer read the sources the receipt names (the receipt binds them at
 * create time, as before), or which model a provider actually served beyond what the host reports. The store is refused to an
 * agent's own Write/Edit and shell writes (guard-gate-strength, GUARD-CONTROLPLANE-WRITE); a writer outside the hooked tool
 * calls (another process, a runner whose child tool calls are not hooked) is not covered -- host sandboxing is that boundary.
 * One observation stamps one review: `create` binds it to the PRD and Spec of its first receipt (`<digest>.consumed`).
 * Codex and Antigravity have no built route here; their receipts say `unobserved` (D247).
 */
import { createHash } from "node:crypto";
import { closeSync, constants, existsSync, fstatSync, lstatSync, mkdirSync, openSync, readFileSync, readdirSync, realpathSync, writeFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";

export const DESIGN_REVIEW_OBSERVATION_SCHEMA = "pipeline.design-review-observation.v1";
export const DESIGN_REVIEW_OBSERVATION_DIR = ["agent-pipeline", "design-review-observations"];
const REVIEWER_AGENT_TYPES = new Set(["readiness-reviewer"]);
const MAX_TEXT_BYTES = 262144;
const MAX_TRANSCRIPT_BYTES = 8 * 1024 * 1024;
const MAX_MODELS = 8;
const MODEL = /^[A-Za-z0-9][A-Za-z0-9._:\[\]-]{0,127}$/u;
const SHA256 = /^[a-f0-9]{64}$/u;
const sha256 = (text) => createHash("sha256").update(text, "utf8").digest("hex");
const normalizedAgentType = (value) => typeof value !== "string" ? null : value.startsWith("pipeline-core:") ? value.slice("pipeline-core:".length) : value;

/** The private control directory of design review observations. */
export function designReviewObservationDir(commonDir) { return join(commonDir, ...DESIGN_REVIEW_OBSERVATION_DIR); }

/** Distinct model ids in first-use order; the host's placeholder for a synthetic record (`<synthetic>`) is not a model. */
function distinctModels(list) {
  const out = [];
  for (const model of list) if (typeof model === "string" && MODEL.test(model) && model !== "unknown" && !out.includes(model)) out.push(model);
  return out;
}

/**
 * The model ids of a background child's own transcript, read bounded beside the parent transcript. Refuses a symlink, a
 * file whose real location is not that exact place, an oversized file and a corrupt line.
 * @returns {{ ok: true, models: string[] } | { ok: false, code: string }}
 */
export function readChildTranscriptModels(input) {
  const unsafe = { ok: false, code: "DRO-TRANSCRIPT-UNSAFE" };
  const transcriptPath = input?.transcript_path;
  const agentId = input?.agent_id;
  if (typeof transcriptPath !== "string" || !isAbsolute(transcriptPath) || !transcriptPath.endsWith(".jsonl")
    || typeof agentId !== "string" || agentId.trim() === "" || agentId.includes("/") || agentId.includes("\\")) return unsafe;
  const sessionDir = transcriptPath.slice(0, -".jsonl".length);
  const file = join(sessionDir, "subagents", `agent-${agentId}.jsonl`);
  let text;
  try {
    if (lstatSync(file).isSymbolicLink()) return unsafe;
    if (realpathSync(file) !== join(realpathSync(sessionDir), "subagents", `agent-${agentId}.jsonl`)) return unsafe;
    const fd = openSync(file, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    try {
      const stat = fstatSync(fd);
      if (!stat.isFile() || stat.size > MAX_TRANSCRIPT_BYTES) return unsafe;
      text = readFileSync(fd).toString("utf8");
    } finally { closeSync(fd); }
  } catch (error) { return error?.code === "ENOENT" ? { ok: false, code: "DRO-TRANSCRIPT-MISSING" } : unsafe; }
  const seen = [];
  for (const line of text.split("\n")) {
    if (line.trim() === "") continue;
    let record;
    try { record = JSON.parse(line); } catch { return unsafe; }
    if (record?.type !== "assistant" && record?.message?.role !== "assistant") continue;
    if (typeof record?.message?.model === "string") seen.push(record.message.model);
  }
  return { ok: true, models: distinctModels(seen) };
}

function textBlocks(response) {
  const content = response?.content;
  if (!Array.isArray(content) || content.length === 0 || !content.every((block) => block?.type === "text" && typeof block.text === "string")) return null;
  return content.map((block) => block.text).join("\n");
}

/**
 * What the hook saw of one Claude review dispatch: not-applicable (not a reviewer, or a background launch), an
 * observation, or a typed reason why none could be made.
 * @returns {{ status: "not-applicable" } | { status: "unobserved", code: string } | { status: "observed", assurance: string, modelsUsed: string[], text: string }}
 */
export function observeClaudeDesignReview(input, { readHandbackFn = null, readModelsFn = readChildTranscriptModels } = {}) {
  if (input?.hook_event_name === "PostToolUse") {
    if (!["Agent", "Task"].includes(input.tool_name) || !REVIEWER_AGENT_TYPES.has(normalizedAgentType(input.tool_input?.subagent_type))) return { status: "not-applicable" };
    const response = input.tool_response;
    if (response?.status !== "completed") return { status: "not-applicable" };
    const models = distinctModels([...(Array.isArray(response.modelsUsed) ? response.modelsUsed : []), response.resolvedModel]);
    if (typeof response.resolvedModel !== "string" || models.length === 0) return { status: "unobserved", code: "DRO-NO-RESOLVED-MODEL" };
    const text = textBlocks(response);
    if (text === null || text.trim() === "") return { status: "unobserved", code: "DRO-NO-TEXT" };
    // The resolved model is the one the call ended on; it is the last entry.
    return { status: "observed", assurance: "host-observed-tool-use", modelsUsed: [...models.filter((model) => model !== response.resolvedModel), response.resolvedModel], text };
  }
  if (input?.hook_event_name === "SubagentStop") {
    if (!REVIEWER_AGENT_TYPES.has(normalizedAgentType(input.agent_type))) return { status: "not-applicable" };
    const read = readModelsFn(input);
    if (!read.ok) return { status: "unobserved", code: read.code };
    if (read.models.length === 0) return { status: "unobserved", code: "DRO-NO-TRANSCRIPT-MODEL" };
    // PF-61/PF-70: a background child ends with a SubagentHandback tool call, and that message is what the parent
    // receives; last_assistant_message is then absent or later trailing prose. The handback wins whenever there is one.
    let text = null;
    if (typeof readHandbackFn === "function") {
      const handback = readHandbackFn(input);
      if (handback?.ok === true && typeof handback.message === "string" && handback.message.trim() !== "") text = handback.message;
    }
    if (text === null && typeof input.last_assistant_message === "string" && input.last_assistant_message.trim() !== "") text = input.last_assistant_message;
    if (text === null) return { status: "unobserved", code: "DRO-NO-TEXT" };
    return { status: "observed", assurance: "host-observed-child-transcript", modelsUsed: read.models, text };
  }
  return { status: "not-applicable" };
}

/**
 * Record one observation in the private control area, named by the returned text's digest, exclusive create (a second
 * stop of the same text keeps the first record).
 * @returns {{ status: "not-applicable" } | { status: "unobserved", code: string } | { status: "recorded" | "already-recorded", resultSha256: string, model: string, assurance: string } | { status: "unavailable" }}
 */
export function recordDesignReviewObservation({ commonDir, runner, input, nowMs = Date.now(), readHandbackFn = null, readModelsFn = readChildTranscriptModels } = {}) {
  try {
    if (runner !== "claude") return { status: "not-applicable" };
    const seen = observeClaudeDesignReview(input, { readHandbackFn, readModelsFn });
    if (seen.status === "unobserved") { noteUnobserved(commonDir, seen.code, nowMs); return seen; }
    if (seen.status !== "observed") return seen;
    if (typeof commonDir !== "string" || commonDir === "") return { status: "unavailable" };
    if (Buffer.byteLength(seen.text, "utf8") > MAX_TEXT_BYTES) { noteUnobserved(commonDir, "DRO-TEXT-TOO-LARGE", nowMs); return { status: "unobserved", code: "DRO-TEXT-TOO-LARGE" }; }
    const modelsUsed = seen.modelsUsed.slice(-MAX_MODELS);
    const resultSha256 = sha256(seen.text);
    const record = { schema: DESIGN_REVIEW_OBSERVATION_SCHEMA, runner, assurance: seen.assurance, modelsUsed, resultSha256, observedAtMs: nowMs, text: seen.text };
    const dir = designReviewObservationDir(commonDir);
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    const model = modelsUsed[modelsUsed.length - 1];
    try { writeFileSync(join(dir, `${resultSha256}.json`), `${JSON.stringify(record)}\n`, { flag: "wx", mode: 0o600 }); }
    catch (error) { if (error?.code === "EEXIST") return { status: "already-recorded", resultSha256, model, assurance: seen.assurance }; throw error; }
    return { status: "recorded", resultSha256, model, assurance: seen.assurance };
  } catch { return { status: "unavailable" }; }
}

// A background stop's notice goes to the stderr of a hook that exits 0 and is easily lost; the latest reason a reviewer stop was
// not observed is kept beside the records (code and time only, overwritten each time) so export-report can say why it found none.
const LAST_UNOBSERVED = "last-unobserved.json";
const DRO_CODE = /^DRO-[A-Z0-9-]{1,48}$/u;
function noteUnobserved(commonDir, code, nowMs) {
  try {
    if (typeof commonDir !== "string" || commonDir === "" || !DRO_CODE.test(code)) return;
    const dir = designReviewObservationDir(commonDir);
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    const file = join(dir, LAST_UNOBSERVED);
    if (existsSync(file) && lstatSync(file).isSymbolicLink()) return;
    writeFileSync(file, `${JSON.stringify({ code, observedAtMs: nowMs })}\n`, { mode: 0o600 });
  } catch { /* diagnostic only */ }
}

/** The latest reason a Claude reviewer stop was not observed on this device, or null. */
export function readLastUnobservedDesignReview({ commonDir }) {
  try {
    const file = join(designReviewObservationDir(commonDir), LAST_UNOBSERVED);
    if (!existsSync(file) || lstatSync(file).isSymbolicLink()) return null;
    const value = JSON.parse(readFileSync(file, "utf8"));
    return DRO_CODE.test(value?.code) && Number.isSafeInteger(value?.observedAtMs) ? { code: value.code, observedAtMs: value.observedAtMs } : null;
  } catch { return null; }
}

function validRecord(record, sha) {
  return record?.schema === DESIGN_REVIEW_OBSERVATION_SCHEMA && record.runner === "claude" && record.resultSha256 === sha
    && ["host-observed-tool-use", "host-observed-child-transcript"].includes(record.assurance)
    && Array.isArray(record.modelsUsed) && record.modelsUsed.length >= 1 && record.modelsUsed.length <= MAX_MODELS
    && distinctModels(record.modelsUsed).length === record.modelsUsed.length
    && typeof record.text === "string" && sha256(record.text) === sha && Number.isSafeInteger(record.observedAtMs);
}

/** One observation by the digest of its returned text; null when none (or a damaged one) is recorded. */
export function readDesignReviewObservation({ commonDir, resultSha256 }) {
  if (typeof commonDir !== "string" || commonDir === "" || typeof resultSha256 !== "string" || !SHA256.test(resultSha256)) return null;
  const file = join(designReviewObservationDir(commonDir), `${resultSha256}.json`);
  try {
    if (!existsSync(file) || lstatSync(file).isSymbolicLink()) return null;
    const record = JSON.parse(readFileSync(file, "utf8"));
    return validRecord(record, resultSha256) ? record : null;
  } catch { return null; }
}

/** Every valid observation not yet exported, newest first (export marks one with `<digest>.exported`). */
export function listUnexportedDesignReviewObservations({ commonDir }) {
  const dir = designReviewObservationDir(commonDir);
  let names;
  try { names = readdirSync(dir); } catch { return []; }
  const out = [];
  for (const name of names) {
    const match = /^([a-f0-9]{64})\.json$/u.exec(name);
    if (match === null || names.includes(`${match[1]}.exported`)) continue;
    const record = readDesignReviewObservation({ commonDir, resultSha256: match[1] });
    if (record !== null) out.push(record);
  }
  return out.sort((left, right) => right.observedAtMs - left.observedAtMs || (left.resultSha256 < right.resultSha256 ? -1 : 1));
}

/**
 * One observed review stamps the receipts of ONE review: the first `create` that stamps an observation binds it to the PRD and
 * Spec digests it was made for (`<digest>.consumed`, exclusive create). A later stamp over the same digests (a receipt made
 * again after a mistaken flag) is admitted; over other bytes it is a replay, wherever its receipt would be written.
 * @returns {{ ok: true } | { ok: false, code: "DRO-CONSUMED-ELSEWHERE" | "DRO-CONSUME-UNAVAILABLE" }}
 */
export function consumeDesignReviewObservation({ commonDir, resultSha256, prdSha256, specSha256 }) {
  try {
    if (![resultSha256, prdSha256, specSha256].every((value) => typeof value === "string" && SHA256.test(value))) return { ok: false, code: "DRO-CONSUME-UNAVAILABLE" };
    const file = join(designReviewObservationDir(commonDir), `${resultSha256}.consumed`);
    const body = `${JSON.stringify({ prdSha256, specSha256 })}\n`;
    try { writeFileSync(file, body, { flag: "wx", mode: 0o600 }); return { ok: true }; }
    catch (error) { if (error?.code !== "EEXIST") return { ok: false, code: "DRO-CONSUME-UNAVAILABLE" }; }
    if (lstatSync(file).isSymbolicLink()) return { ok: false, code: "DRO-CONSUME-UNAVAILABLE" };
    const bound = JSON.parse(readFileSync(file, "utf8"));
    return bound?.prdSha256 === prdSha256 && bound?.specSha256 === specSha256 ? { ok: true } : { ok: false, code: "DRO-CONSUMED-ELSEWHERE" };
  } catch { return { ok: false, code: "DRO-CONSUME-UNAVAILABLE" }; }
}

/** Mark one observation exported; a second export of the same observation is refused by the caller. */
export function markDesignReviewObservationExported({ commonDir, resultSha256 }) {
  writeFileSync(join(designReviewObservationDir(commonDir), `${resultSha256}.exported`), "", { flag: "wx", mode: 0o600 });
}

/** One line for the hook's channel: where the observation is and the one command that turns it into the report file. */
export function designReviewObservationNotice(result) {
  if (result?.status === "recorded" || result?.status === "already-recorded") {
    return `Design review observed: reviewer model ${result.model} (${result.assurance}). Write the report with node <plugin-root>/scripts/design-review-receipt.mjs export-report --repo <root> --out <repo-relative report path>, then create the receipt with that --report; the receipt records the observed model itself.`;
  }
  if (result?.status === "unobserved") {
    return `Design review not observed (${result.code}): the receipt of this review would say unobserved, and present-plan refuses an unobserved Claude review. Dispatch pipeline-core:readiness-reviewer again in a session whose plugin hooks are loaded.`;
  }
  return null;
}
