// SPDX-License-Identifier: SUL-1.0
/**
 * The project's critical-human-proof policy (ADR-0055).
 *
 * Extracted so the State writer and the push guard read ONE implementation. They
 * previously could not: the reader lived inside `scripts/pipeline-state.mjs`, so the
 * guard had no way to see the policy at all and simply assumed it.
 *
 * `.v1` — `requiredKinds` only. Deleting a kind from that list does not relax the
 * gate; the writer action REJECTS instead, so nobody can quietly disarm the proof by
 * trimming a list. That stays true.
 *
 * `.v2` — adds the one thing `.v1` had no answer for: an operator who genuinely wants
 * the cryptographic proof off. A waiver must name its kind AND carry a reason, so
 * standing the gate down is a committed, diffable, attributable act. The waived kind
 * stays in `requiredKinds`: the action remains gated, only the private-key proof is
 * no longer demanded.
 */
import { lstatSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { CRITICAL_ACTION_KINDS } from "./critical-action-approval-request.mjs";

export const CRITICAL_HUMAN_PROOF_POLICY_PATH = "project/critical-human-proof.json";
export const CRITICAL_HUMAN_PROOF_POLICY_V1 = "pipeline.critical-human-proof-policy.v1";
export const CRITICAL_HUMAN_PROOF_POLICY_V2 = "pipeline.critical-human-proof-policy.v2";
const MAX_POLICY_BYTES = 32_768;
const MIN_REASON_CHARS = 8;
const MAX_REASON_CHARS = 500;

function exactKeys(value, keys) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).length === keys.length
    && keys.every((key) => Object.hasOwn(value, key));
}

/**
 * @returns {{ok: true, requiredKinds: Set<string>, waivers: Map<string, string>}
 *          | {ok: false, code: string}}
 */
export function readCriticalHumanProofPolicy(dir) {
  const path = resolve(dir, CRITICAL_HUMAN_PROOF_POLICY_PATH);
  try {
    const stat = lstatSync(path);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_POLICY_BYTES) {
      return { ok: false, code: "CRITICAL-PROOF-POLICY-UNSAFE" };
    }
    const value = JSON.parse(readFileSync(path, "utf8"));
    const v2 = value?.schema === CRITICAL_HUMAN_PROOF_POLICY_V2;
    const shapeOk = v2
      ? exactKeys(value, ["schema", "requiredKinds", "waivedKinds"])
      : exactKeys(value, ["schema", "requiredKinds"]) && value?.schema === CRITICAL_HUMAN_PROOF_POLICY_V1;
    if (!shapeOk
      || !Array.isArray(value.requiredKinds)
      || value.requiredKinds.length === 0
      || new Set(value.requiredKinds).size !== value.requiredKinds.length
      || value.requiredKinds.some((kind) => !CRITICAL_ACTION_KINDS.includes(kind))) {
      return { ok: false, code: "CRITICAL-PROOF-POLICY-INVALID" };
    }
    const waivers = new Map();
    if (v2) {
      if (!Array.isArray(value.waivedKinds)) return { ok: false, code: "CRITICAL-PROOF-POLICY-INVALID" };
      for (const entry of value.waivedKinds) {
        if (!exactKeys(entry, ["kind", "reason"])
          || !value.requiredKinds.includes(entry.kind)
          || typeof entry.reason !== "string"
          || entry.reason.trim().length < MIN_REASON_CHARS
          || entry.reason.length > MAX_REASON_CHARS
          || waivers.has(entry.kind)) {
          return { ok: false, code: "CRITICAL-PROOF-POLICY-WAIVER-INVALID" };
        }
        waivers.set(entry.kind, entry.reason.trim());
      }
    }
    return { ok: true, requiredKinds: new Set(value.requiredKinds), waivers };
  } catch (error) {
    // No policy file at all is the ordinary consumer case: nothing is required, and
    // nothing is waived either. Anything else is a policy we cannot read, which must
    // never read as "not required".
    return error?.code === "ENOENT"
      ? { ok: true, requiredKinds: new Set(), waivers: new Map() }
      : { ok: false, code: "CRITICAL-PROOF-POLICY-UNREADABLE" };
  }
}

/**
 * Has the project EXPLICITLY stood the private-key proof down for `kind`?
 *
 * Only an explicit `.v2` waiver answers yes. The absence of a policy file is not a
 * waiver, an unreadable policy is not a waiver, and a kind simply missing from
 * `requiredKinds` is not a waiver either — a caller that gates on
 * `gates.push.approval: required` keeps gating unless someone deliberately wrote the
 * waiver down. Anything else would turn "no policy configured" into "gate off".
 *
 * @returns {{waived: false, code: string|null} | {waived: true, code: null, waiver: {kind: string, reason: string}}}
 */
export function criticalProofWaiverFor(dir, kind) {
  const policy = readCriticalHumanProofPolicy(dir);
  if (!policy.ok) return { waived: false, code: policy.code };
  const reason = policy.waivers.get(kind);
  return reason === undefined
    ? { waived: false, code: null }
    : { waived: true, code: null, waiver: { kind, reason } };
}
