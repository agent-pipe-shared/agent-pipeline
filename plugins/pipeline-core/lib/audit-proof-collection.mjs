// SPDX-License-Identifier: SUL-1.0
/**
 * P3 (C20D-P3-ONE-SHOT-CLOSE, AC-108): reads the PUBLIC signed approval proof objects that authorized a feature candidate, for the audit
 * bundle's proofs/ directory. Read-only: it never signs, consumes or writes anything, and it never reads a private key (a proof object holds the
 * signer's public key and signature only).
 *
 * Sources, in the order the human-approval trace enumerates them:
 *   - the plan approval's signed design approval, kept in the State;
 *   - the private critical approval store (push and feature-package-reconcile envelopes) for exactly this candidate commit.
 * A human guard override capability keeps no proof (the trace reports it as PROOF-NOT-RETAINED-IN-CAPABILITY); it is named as a typed gap, as is an
 * envelope whose proof is not a verifiable public proof object. A gap never blocks the close.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { isCarriableProof } from "./audit-bundle.mjs";
import { CRITICAL_APPROVAL_STORE_SCHEMA, criticalApprovalStoreRoot } from "./critical-action-authorization.mjs";

const STORE_KINDS = Object.freeze(["push", "feature-package-reconcile"]);
const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const readJson = (path) => { try { return JSON.parse(readFileSync(path, "utf8")); } catch { return null; } };

/** @returns {{ proofs: Array<{kind: string, proof: object}>, gaps: Array<{kind: string, code: string}> }} */
export function collectAuditProofs({ common, candidate, state } = {}) {
  const proofs = []; const gaps = []; const seen = new Set();
  const take = (kind, proof, source) => {
    if (!isCarriableProof(proof)) { gaps.push({ kind, code: `PROOF-NOT-CARRIABLE:${source}` }); return; }
    const key = `${kind}:${proof.intentSha256}`;
    if (!seen.has(key)) { seen.add(key); proofs.push({ kind, proof: { ...proof } }); }
  };
  const design = state?.planApproval?.designApproval;
  if (object(design) && design.mode === "signature") take("plan-approval", design.proof, "state:planApproval");
  if (typeof common === "string" && common !== "" && object(candidate)) {
    for (const kind of STORE_KINDS) {
      const directory = join(criticalApprovalStoreRoot(common), "approvals", kind); let names = [];
      try { names = readdirSync(directory).filter((name) => name.endsWith(".json") && !name.startsWith(".")).sort().slice(0, 256); } catch { names = []; }
      for (const name of names) {
        const envelope = readJson(join(directory, name));
        if (!object(envelope) || envelope.schema !== CRITICAL_APPROVAL_STORE_SCHEMA || envelope.kind !== kind || !object(envelope.approval) || envelope.approval.forCommit !== candidate.commit) continue;
        if (object(envelope.approval.criticalProof?.proof)) take(kind, envelope.approval.criticalProof.proof, `store:${kind}/${name}`);
      }
    }
  }
  proofs.sort((a, b) => (a.kind + a.proof.intentSha256).localeCompare(b.kind + b.proof.intentSha256));
  return { proofs: proofs.slice(0, 16), gaps };
}
