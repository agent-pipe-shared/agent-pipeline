// SPDX-License-Identifier: SUL-1.0
/**
 * G20-39 (candidate 20, AC-108): the producer and the reader of the Critic Source return record (`pipeline.session-critic-source-return.v1`).
 *
 * The record is what lets a verdict finalize as `source-issued-origin` instead of `caller-authored-fallback`
 * (scripts/session-critic-finalizer.mjs `originGate`), and the close gate (scripts/close-coordinator.mjs
 * `assertCriticIndependenceForClose`) admits that label at any rigor. It is issued by the Critic subagent's STOP hook, never by the calling agent:
 * the hook sees the stop of an agent whose runner-reported `agent_type` is the Critic, reads the verdict that agent returned
 * (`last_assistant_message`, else the child's own last SubagentHandback), and binds it to the one admitted, claimed, not yet resulted session packet of that
 * runner. Every bound value comes from the private packet and its admission (packetId, packetDigest, claimant, sessionId) or from the returned verdict
 * (verdictSha256); nothing is taken from the launching prompt or from a value the calling agent supplies. Zero or several open packets issue nothing.
 *
 * Storage: `<common-dir>/agent-pipeline/critic-packets/<packetId>/source-return.json`, mode 0600, created exclusively (a second stop never overwrites).
 * Claude and Codex issue it from the subagent STOP hook. Antigravity (G20-41) issues it from its PreToolUse hook when the Critic child sends its final
 * `send_message` to its parent (hooks/antigravity-pretool-guard.mjs recognises the child; whether a stop event fires for an Antigravity child is not
 * measured and nothing is built on it). Imports only the packet read half and the schema checker.
 */
import { closeSync, existsSync, openSync, readFileSync, readdirSync, writeSync } from "node:fs";
import { join } from "node:path";
import { PACKET_ID, SESSION_REVIEW_TTL_SECONDS, SPLIT_FILE, canonicalJson, currentState, packetContext, readJson, sha256 } from "./critic-packet-preflight-read.mjs";
import { attributeVerdict, criticSplitDigest, criticSplitProblem, verdictPassContradiction } from "./critic-split.mjs";
import { validateAgainstSchema } from "./schema-lite.mjs";

export const CRITIC_SOURCE_RETURN_SCHEMA = "pipeline.session-critic-source-return.v1";
/** G20-72: the record of one child of a split round: the nine keys of the single record plus the split digest, the entry and the child's verdict itself. */
export const CRITIC_SPLIT_SOURCE_RETURN_SCHEMA = "pipeline.session-critic-source-return-split.v1";
export const CRITIC_SOURCE_RETURN_FILE = "source-return.json";
const VERDICT_SCHEMA = JSON.parse(readFileSync(new URL("../scripts/critic-verdict.schema.json", import.meta.url), "utf8"));
const MAX_PACKETS = 4096;
const RUNNERS = new Set(["claude", "codex"]); // the runners whose subagent STOP event issues the record
const MESSAGE_RUNNERS = new Set(["antigravity"]); // the runners whose Critic child's final message to its parent issues it (G20-41)

// C21H (CGF-03): the projected Codex roles `critic` and `critic-high-risk` are both the Critic; `default` with effort overrides is not.
const CRITIC_AGENT_TYPES = new Set(["critic", "critic-high-risk"]);

const normalizedAgentType = (value) => typeof value !== "string" ? null : value.startsWith("pipeline-core:") ? value.slice("pipeline-core:".length) : value;

/** The verdict a Critic returned: its whole message, else the content of the LAST fenced block, as a schema-shaped object; otherwise null. */
export function extractCriticVerdict(text) {
  if (typeof text !== "string" || text.length === 0 || text.length > 4 * 1024 * 1024) return null;
  const candidates = [text.trim()];
  const blocks = [...text.matchAll(/```(?:json)?[ \t]*\r?\n([\s\S]*?)\r?\n[ \t]*```/gu)];
  if (blocks.length > 0) candidates.push(blocks.at(-1)[1]);
  for (const candidate of candidates) {
    let value;
    try { value = JSON.parse(candidate); } catch { continue; }
    if (value !== null && typeof value === "object" && !Array.isArray(value) && validateAgainstSchema(value, VERDICT_SCHEMA).valid) return value;
  }
  return null;
}

/** Packets of this runner that are claimed, admitted, within the review window and carry no result: the only ones a Critic stop can answer. */
function openAdmittedPackets(controlRoot, runner, nowMs) {
  const open = [];
  const names = readdirSync(controlRoot);
  if (names.length > MAX_PACKETS) return null;
  for (const packetId of names.filter((name) => PACKET_ID.test(name))) {
    try {
      const { packetDir, packet } = packetContext(controlRoot, packetId, { allowLegacyPreAssurance: true });
      const state = currentState(packetDir, packet);
      const binding = packet.request?.sessionBinding;
      if (state.phase !== "claimed" || state.revision !== 2 || binding === undefined || packet.route?.runner !== runner) continue;
      const packetDigest = sha256(canonicalJson(packet));
      const admission = readJson(join(packetDir, "session-admission.json"), "CPP-SESSION-ADMISSION");
      const claim = readJson(join(packetDir, "claim.json"), "CPP-CLAIM-READ");
      const claimedAtMs = Date.parse(claim?.timestamp);
      if (admission?.packetId !== packetId || admission.packetDigest !== packetDigest || admission.sessionId !== binding.sessionId
        || claim?.packetDigest !== packetDigest || !Number.isFinite(claimedAtMs)
        || nowMs < claimedAtMs || nowMs > claimedAtMs + SESSION_REVIEW_TTL_SECONDS * 1000) continue;
      // G20-72: a split packet stays open for every child; only a packet WITHOUT a split is closed by its one record.
      const split = admission.splitSha256 === undefined ? null : readAdmittedSplit(packetDir, admission.splitSha256);
      if (split === undefined) continue;
      if (split === null && existsSync(join(packetDir, CRITIC_SOURCE_RETURN_FILE))) { open.push({ packetId, issued: true }); continue; }
      open.push({ packetId, packetDir, packetDigest, sessionId: binding.sessionId, claimant: { runner: packet.route.runner, adapter: packet.route.adapter },
        issuedAtMs: nowMs, expiresAtMs: claimedAtMs + SESSION_REVIEW_TTL_SECONDS * 1000, split });
    } catch { /* an unreadable or foreign entry is never a match */ }
  }
  return open;
}

/**
 * Issue the Source return record for a Critic subagent stop, or answer why none was issued. Never throws, never blocks the stop.
 * @param {{ commonDir: string, runner: "claude"|"codex", input: object, nowMs?: number, readHandbackFn?: (input: object) => ({ok: boolean, message?: string}) }} request
 */
export function issueCriticSourceReturn({ commonDir, runner, input, nowMs = Date.now(), readHandbackFn = null } = {}) {
  try {
    if (!RUNNERS.has(runner) || input?.hook_event_name !== "SubagentStop" || !CRITIC_AGENT_TYPES.has(normalizedAgentType(input.agent_type))) return { status: "not-applicable" };
    if (typeof commonDir !== "string" || commonDir === "") return { status: "unavailable" };
    let verdict = extractCriticVerdict(input.last_assistant_message);
    if (verdict === null && typeof readHandbackFn === "function") {
      const handback = readHandbackFn(input);
      if (handback?.ok === true) verdict = extractCriticVerdict(handback.message);
    }
    return issueForVerdict({ commonDir, runner, verdict, nowMs, child: childDigest(input.agent_id) });
  } catch { return { status: "unavailable" }; }
}

/** CGR-09: the identity of the returning child as a digest (never the raw id), or null when the runner reports none. */
const childDigest = (id) => (typeof id === "string" && id !== "" && id.length <= 200 ? sha256(id) : null);

/**
 * CGR-09: the split records that count for the round. A child that was RESUMED (same recorded child identity) and returned again is a resumption, not a second run: its
 * later return stands for its entry (the later issuedAtMs). Two different children, a child whose identity is not recorded, or equal timestamps stay duplicates, so the
 * caller still refuses verdict shopping (SCF-SPLIT-DUPLICATE-ENTRY, CSM-CHILD-DUPLICATE). Pure.
 */
export function settleSplitReturns(records) {
  const byEntry = new Map();
  for (const record of records) {
    const key = typeof record?.entryId === "string" ? record.entryId : null;
    byEntry.set(key, [...(byEntry.get(key) ?? []), record]);
  }
  const settled = [];
  for (const [key, list] of byEntry) {
    const child = list[0]?.childSha256;
    const resumed = key !== null && list.length > 1 && typeof child === "string" && list.every((record) => record.childSha256 === child)
      && list.every((record) => Number.isSafeInteger(record.issuedAtMs)) && new Set(list.map((record) => record.issuedAtMs)).size === list.length;
    settled.push(...(resumed ? [list.reduce((latest, record) => (record.issuedAtMs > latest.issuedAtMs ? record : latest))] : list));
  }
  return settled;
}

/**
 * G20-41: the Antigravity producer. The caller (hooks/antigravity-pretool-guard.mjs) has already recognised the Critic child's final `send_message`
 * to its parent from runner-written facts; this takes only the message text and issues the record exactly like the stop path. Never throws.
 * @param {{ commonDir: string, runner: "antigravity", text: string, nowMs?: number, child?: string, stepIdx?: number }} request
 */
export function issueCriticSourceReturnFromMessage({ commonDir, runner, text, nowMs = Date.now(), child = null, stepIdx = null } = {}) {
  try {
    if (!MESSAGE_RUNNERS.has(runner)) return { status: "not-applicable" };
    if (typeof commonDir !== "string" || commonDir === "") return { status: "unavailable" };
    const verdict = extractCriticVerdict(text);
    return verdict === null || verdictPassContradiction(verdict) !== null ? noVerdictFromMessage({ commonDir, runner, nowMs, child, stepIdx }) : issueForVerdict({ commonDir, runner, verdict, nowMs, child: childDigest(child) });
  } catch { return { status: "unavailable" }; }
}

/**
 * C21B: a Critic child's message without a verdict, while exactly one admitted packet waits for that verdict, is sent back ONCE per child (`refuse: true`), because the
 * calling agent would otherwise transcribe the verdict, it would finalize as caller-authored and the close would need a PO signature. The marker sits in the private packet
 * directory, created exclusively; the hook fires twice per call, so the same step is refused again and any LATER step passes, which leaves a Critic that cannot state a verdict a way out.
 */
function noVerdictFromMessage({ commonDir, runner, nowMs, child, stepIdx }) {
  const controlRoot = join(commonDir, "agent-pipeline", "critic-packets");
  if (typeof child !== "string" || child === "" || !existsSync(controlRoot)) return { status: "no-verdict" };
  const open = openAdmittedPackets(controlRoot, runner, nowMs);
  if (open === null || open.length !== 1 || open[0].issued === true) return { status: "no-verdict" };
  const [target] = open;
  const marker = join(target.packetDir, `verdict-requested-${sha256(child)}.json`);
  let fd;
  try { fd = openSync(marker, "wx", 0o600); }
  catch (error) {
    if (error?.code !== "EEXIST") return { status: "no-verdict", packetId: target.packetId };
    let prior = null;
    try { prior = JSON.parse(readFileSync(marker, "utf8")); } catch { prior = null; }
    return Number.isSafeInteger(stepIdx) && prior?.stepIdx === stepIdx ? { status: "no-verdict", packetId: target.packetId, refuse: true } : { status: "no-verdict", packetId: target.packetId };
  }
  try { writeSync(fd, canonicalJson({ stepIdx: Number.isSafeInteger(stepIdx) ? stepIdx : null })); } finally { closeSync(fd); }
  return { status: "no-verdict", packetId: target.packetId, refuse: true };
}

/** The shared half: bind the returned verdict to the one open admitted packet of this runner and write the record exclusively. */
function issueForVerdict({ commonDir, runner, verdict, nowMs, child = null }) {
  if (verdict === null) return { status: "no-verdict" };
  // C21B: records are exclusive and a split entry may hold only one, so a return that contradicts itself must leave none or its corrected return could never be recorded.
  const contradiction = verdictPassContradiction(verdict);
  if (contradiction !== null) return { status: "contradictory-verdict", reason: contradiction };
  const controlRoot = join(commonDir, "agent-pipeline", "critic-packets");
  if (!existsSync(controlRoot)) return { status: "no-open-packet" };
  const open = openAdmittedPackets(controlRoot, runner, nowMs);
  if (open === null) return { status: "unavailable" };
  if (open.length === 0) return { status: "no-open-packet" };
  if (open.length > 1) return { status: "ambiguous", count: open.length };
  const [target] = open;
  if (target.issued === true) return { status: "already-issued", packetId: target.packetId };
  if (target.split !== null) {
    // G20-72: one record per returning child, bound to the split the admission carries and to the entry the verdict names. A verdict that names no entry issues nothing.
    const entryId = attributeVerdict(target.split, verdict);
    if (entryId === null) return { status: "unattributed", packetId: target.packetId, entries: target.split.entries.map((entry) => entry.scopeMarker) };
    const verdictSha256 = sha256(canonicalJson(verdict));
    const splitRecord = { schema: CRITIC_SPLIT_SOURCE_RETURN_SCHEMA, issuer: "source", packetId: target.packetId, packetDigest: target.packetDigest, claimant: target.claimant,
      sessionId: target.sessionId, verdictSha256, issuedAtMs: target.issuedAtMs, expiresAtMs: target.expiresAtMs, splitSha256: criticSplitDigest(target.split), entryId, verdict,
      ...(child === null ? {} : { childSha256: child }) };
    let splitFd;
    try { splitFd = openSync(join(target.packetDir, `source-return-${verdictSha256}.json`), "wx", 0o600); }
    catch (error) { if (error?.code === "EEXIST") return { status: "already-issued", packetId: target.packetId, entryId }; throw error; }
    try { writeSync(splitFd, canonicalJson(splitRecord)); } finally { closeSync(splitFd); }
    return { status: "issued", packetId: target.packetId, entryId };
  }
  const record = { schema: CRITIC_SOURCE_RETURN_SCHEMA, issuer: "source", packetId: target.packetId, packetDigest: target.packetDigest, claimant: target.claimant,
    sessionId: target.sessionId, verdictSha256: sha256(canonicalJson(verdict)), issuedAtMs: target.issuedAtMs, expiresAtMs: target.expiresAtMs };
  const fd = openSync(join(target.packetDir, CRITIC_SOURCE_RETURN_FILE), "wx", 0o600);
  try { writeSync(fd, canonicalJson(record)); } finally { closeSync(fd); }
  return { status: "issued", packetId: target.packetId };
}

/**
 * G20-72: the split object an admission bound, read from the packet (`split.json`), or null/undefined: `undefined` when the file is absent, its digest differs from the
 * admission's `splitSha256`, or it is not a split (such a packet is never a match for a stop and the finalizer refuses it).
 */
export function readAdmittedSplit(packetDir, splitSha256) {
  try {
    const split = readJson(join(packetDir, SPLIT_FILE), "SCF-SPLIT-READ");
    return criticSplitProblem(split) === null && criticSplitDigest(split) === splitSha256 ? split : undefined;
  } catch { return undefined; }
}

/** G20-72: every per-child record of a split packet exactly as stored (so a present-but-wrong record reaches the finalizer's checks), in file-name order. */
export function readCriticSplitSourceReturns({ controlRoot, packetId } = {}) {
  if (typeof controlRoot !== "string" || !PACKET_ID.test(packetId ?? "")) return [];
  const dir = join(controlRoot, packetId);
  return readdirSync(dir).filter((name) => /^source-return-[a-f0-9]{64}\.json$/u.test(name)).sort().map((name) => readJson(join(dir, name), "SCF-ORIGINAL-SOURCE-RECORD"));
}

/** The issued record of a packet exactly as stored (so a present-but-wrong record reaches the finalizer's binding check), or null when none exists. */
export function readCriticSourceReturn({ controlRoot, packetId } = {}) {
  if (typeof controlRoot !== "string" || !PACKET_ID.test(packetId ?? "")) return null;
  const path = join(controlRoot, packetId, CRITIC_SOURCE_RETURN_FILE);
  return existsSync(path) ? readJson(path, "SCF-ORIGINAL-SOURCE-RECORD") : null;
}
