// SPDX-License-Identifier: SUL-1.0
/**
 * Sanctioned release of a prepared or claimed Critic packet (Toolbox D60).
 *
 * A failed admit leaves a packet in the private control root that reserves its
 * review unit and has no expiry. This module moves such a packet aside with an
 * append-only audit record, frees the generic-batch reservation it holds, and
 * is idempotent. It never deletes anything: the packet directory is renamed
 * into `released/` inside the same private control root, which also takes it
 * out of the held-packet scan (that scan only reads 32-hex directory names).
 */
import { appendFileSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, renameSync } from "node:fs";
import { join, resolve } from "node:path";

export const CRITIC_PACKET_RELEASE_AUDIT_SCHEMA = "pipeline.critic-packet-release-audit.v1";
export const CRITIC_PACKET_RELEASE_RESULT_SCHEMA = "pipeline.critic-packet-release.v1";
const PACKET_ID = /^[a-f0-9]{32}$/u;
const REASON = /^[^\\/\u0000-\u001f]{3,200}$/u;
const RELEASABLE = new Set(["prepared", "claimed"]);

export class CriticPacketReleaseError extends Error {
  constructor(code) { super(code); this.name = "CriticPacketReleaseError"; this.code = code; }
}
function fail(code) { throw new CriticPacketReleaseError(code); }

function physicalDir(path, code) {
  let stat;
  try { stat = lstatSync(path); } catch { fail(code); }
  if (stat.isSymbolicLink() || !stat.isDirectory()) fail(code);
}
function readJson(path, code) {
  try { return JSON.parse(readFileSync(path, "utf8")); } catch { fail(code); }
}

/** Release one prepared or claimed packet. Consumed (and any other) phases are refused typed. */
export function releaseCriticPacket({ controlRoot, packetId, reason, now = new Date() } = {}) {
  if (typeof controlRoot !== "string" || controlRoot.length === 0) fail("CPR-CONTROL-ROOT");
  if (!PACKET_ID.test(packetId ?? "")) fail("CPR-PACKET-ID");
  if (typeof reason !== "string" || !REASON.test(reason) || reason.includes("..") || /^[a-z]:/iu.test(reason.trim())) fail("CPR-REASON");
  const root = resolve(controlRoot);
  physicalDir(root, "CPR-CONTROL-ROOT");
  if (realpathSync(root) !== root) fail("CPR-CONTROL-ROOT");
  const releasedDir = join(root, "released");
  const packetDir = join(root, packetId);
  const parked = join(releasedDir, packetId);
  if (!existsSync(packetDir)) {
    if (existsSync(parked)) return Object.freeze({ schema: CRITIC_PACKET_RELEASE_RESULT_SCHEMA, status: "already-released", packetId });
    fail("CPR-ABSENT");
  }
  physicalDir(packetDir, "CPR-PACKET-DIR");
  const state = readJson(join(packetDir, "state.json"), "CPR-STATE");
  if (typeof state?.phase !== "string") fail("CPR-STATE");
  if (!RELEASABLE.has(state.phase)) fail("CPR-PHASE");
  if (existsSync(releasedDir)) physicalDir(releasedDir, "CPR-RELEASED-DIR"); else mkdirSync(releasedDir, { mode: 0o700 });
  if (existsSync(parked)) fail("CPR-ALREADY-PARKED");
  // The audit record is durable before the packet moves; a crash in between leaves a retryable, never a silent, state.
  const record = {
    schema: CRITIC_PACKET_RELEASE_AUDIT_SCHEMA,
    packetId,
    phaseBefore: state.phase,
    reason,
    releasedAt: new Date(now).toISOString(),
    actor: "session-critic-finalizer release",
  };
  appendFileSync(join(releasedDir, "audit.jsonl"), `${JSON.stringify(record)}\n`, { flag: "a", mode: 0o600 });
  // Free the review-unit reservation held by this packet in the same step.
  const batches = join(root, "generic-batches");
  let freed = 0;
  if (existsSync(batches)) {
    physicalDir(batches, "CPR-BATCH-DIR");
    for (const batch of readdirSync(batches)) {
      const dir = join(batches, batch);
      if (lstatSync(dir).isSymbolicLink() || !lstatSync(dir).isDirectory()) continue;
      for (const name of readdirSync(dir).filter((n) => /-admission\.json$/u.test(n))) {
        const file = join(dir, name);
        let value; try { value = JSON.parse(readFileSync(file, "utf8")); } catch { continue; }
        if (value?.packetId !== packetId) continue;
        renameSync(file, join(dir, `released-${packetId}-${name}`));
        freed += 1;
      }
    }
  }
  renameSync(packetDir, parked);
  return Object.freeze({ schema: CRITIC_PACKET_RELEASE_RESULT_SCHEMA, status: "released", packetId, phaseBefore: state.phase, reservationsFreed: freed });
}
