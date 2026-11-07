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
 * Antigravity has no producer in this slice: its subagent stop event is still being measured. Imports only the packet read half and the schema checker.
 */
import { closeSync, existsSync, openSync, readFileSync, readdirSync, writeSync } from "node:fs";
import { join } from "node:path";
import { PACKET_ID, SESSION_REVIEW_TTL_SECONDS, canonicalJson, currentState, packetContext, readJson, sha256 } from "./critic-packet-preflight-read.mjs";
import { validateAgainstSchema } from "./schema-lite.mjs";

export const CRITIC_SOURCE_RETURN_SCHEMA = "pipeline.session-critic-source-return.v1";
export const CRITIC_SOURCE_RETURN_FILE = "source-return.json";
const VERDICT_SCHEMA = JSON.parse(readFileSync(new URL("../scripts/critic-verdict.schema.json", import.meta.url), "utf8"));
const MAX_PACKETS = 4096;
const RUNNERS = new Set(["claude", "codex"]);

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
      if (existsSync(join(packetDir, CRITIC_SOURCE_RETURN_FILE))) { open.push({ packetId, issued: true }); continue; }
      open.push({ packetId, packetDir, packetDigest, sessionId: binding.sessionId, claimant: { runner: packet.route.runner, adapter: packet.route.adapter },
        issuedAtMs: nowMs, expiresAtMs: claimedAtMs + SESSION_REVIEW_TTL_SECONDS * 1000 });
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
    if (!RUNNERS.has(runner) || input?.hook_event_name !== "SubagentStop" || normalizedAgentType(input.agent_type) !== "critic") return { status: "not-applicable" };
    if (typeof commonDir !== "string" || commonDir === "") return { status: "unavailable" };
    let verdict = extractCriticVerdict(input.last_assistant_message);
    if (verdict === null && typeof readHandbackFn === "function") {
      const handback = readHandbackFn(input);
      if (handback?.ok === true) verdict = extractCriticVerdict(handback.message);
    }
    if (verdict === null) return { status: "no-verdict" };
    const controlRoot = join(commonDir, "agent-pipeline", "critic-packets");
    if (!existsSync(controlRoot)) return { status: "no-open-packet" };
    const open = openAdmittedPackets(controlRoot, runner, nowMs);
    if (open === null) return { status: "unavailable" };
    if (open.length === 0) return { status: "no-open-packet" };
    if (open.length > 1) return { status: "ambiguous", count: open.length };
    const [target] = open;
    if (target.issued === true) return { status: "already-issued", packetId: target.packetId };
    const record = { schema: CRITIC_SOURCE_RETURN_SCHEMA, issuer: "source", packetId: target.packetId, packetDigest: target.packetDigest, claimant: target.claimant,
      sessionId: target.sessionId, verdictSha256: sha256(canonicalJson(verdict)), issuedAtMs: target.issuedAtMs, expiresAtMs: target.expiresAtMs };
    const fd = openSync(join(target.packetDir, CRITIC_SOURCE_RETURN_FILE), "wx", 0o600);
    try { writeSync(fd, canonicalJson(record)); } finally { closeSync(fd); }
    return { status: "issued", packetId: target.packetId };
  } catch { return { status: "unavailable" }; }
}

/** The issued record of a packet exactly as stored (so a present-but-wrong record reaches the finalizer's binding check), or null when none exists. */
export function readCriticSourceReturn({ controlRoot, packetId } = {}) {
  if (typeof controlRoot !== "string" || !PACKET_ID.test(packetId ?? "")) return null;
  const path = join(controlRoot, packetId, CRITIC_SOURCE_RETURN_FILE);
  return existsSync(path) ? readJson(path, "SCF-ORIGINAL-SOURCE-RECORD") : null;
}
