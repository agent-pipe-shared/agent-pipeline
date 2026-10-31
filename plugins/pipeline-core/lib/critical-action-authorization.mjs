// SPDX-License-Identifier: SUL-1.0
/**
 * May an externally-effective action proceed on the strength of a recorded human
 * approval? Covers the two routes a session can actually reach: a raw `git push`, and
 * the deploy-triggering push the release branch of guard-push gates.
 *
 * WHY THIS MODULE EXISTS
 *
 * Until now the push answer was "never". `gates.push.approval: required` with
 * `gates.push_approval: signature` reached a branch in guard-push.mjs that refused every
 * agent-issued push outright and pointed at the fixed publication executor. That was
 * safe and, for this repository's actual workflow, unusable: publication is a release
 * path, and an ordinary feature branch — or `main` — needs to be pushable without one.
 * The PO's requirement was explicit: every session, every branch, `main` included, when
 * the human has cleared it.
 *
 * The naive way to grant that is to believe `pushApproval.lastApproved` — it already
 * names the commit, the remote and the destination. That would have been wrong, and the
 * reason is worth stating plainly rather than discovering later: `project/pipeline-state.json`
 * is a mutable working-tree file. It is protected against an agent's Edit/Write by
 * guard-lifecycle-ready, but protection is a guard, and a guard is not a signature.
 * Believing that record would have turned `signature` into `chat` without anybody
 * changing a setting — the precise class of silent self-weakening the T2..T5 Critic
 * rounds spent this sprint closing in the neighbouring module.
 *
 * So this module verifies rather than believes. It rebuilds, from what the guard can
 * OBSERVE about the action that is actually happening, the exact subject digest the key
 * holder signed, rebuilds the approval intent around it, and checks the detached Ed25519
 * signature against a key identity committed in `project/critical-human-proof.json`.
 * That file is gate-strength protected (GS-2): the agent can reach it through neither
 * the write lane nor the shell lane. An agent that rewrote the whole state record would
 * therefore have to produce a signature under the operator's key to gain anything, which
 * is the property `signature` mode was always supposed to have and, on these routes, now
 * does.
 *
 * THE DEPLOY ROUTE IS PART OF THIS, NOT A SEQUEL. Hardening only the push would have
 * been the more visible half of one door. `checkDeployApprovals` matched a recorded
 * approval on `forArtifact`/`forEnvironment`/`!usedAt` alone and never looked at
 * `criticalProof` at all — so on the release path a state record was not merely believed,
 * its proof was not even read. The same rebuild-and-verify applies there, over that
 * route's own signed subject (`{artifact, environment}`).
 *
 * CONSEQUENCE THAT CHANGES A WORKFLOW, stated rather than buried: the signed intent
 * covers the candidate commit AND tree. Verifying it therefore binds a deploy approval to
 * the commit it was approved for. Previously an approval for artifact X survived
 * arbitrary later commits. It no longer does, and that is deliberate — an approval for
 * one set of bytes was never meant to authorize a different set.
 *
 * WHAT IT DOES NOT CLAIM. The private key is what protects the action; nothing here
 * defends against an operator who signs the wrong thing, and nothing here applies where
 * the project has deliberately stood the proof down — `chat` mode for push (ADR-0056) or
 * an explicit `.v2` waiver for deploy (ADR-0055) — where a recorded approval is an
 * attribution rather than a proof. Publication keeps its own external-verification route
 * through the fixed executor and is untouched here.
 */
import { spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { closeSync, fsyncSync, ftruncateSync, lstatSync, mkdirSync, openSync, readdirSync, readFileSync, renameSync, unlinkSync, writeFileSync, writeSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { CRITICAL_HUMAN_PROOF_POLICY_PATH, CRITICAL_HUMAN_PROOF_POLICY_V3, criticalProofWaiverFor, readCriticalHumanProofPolicy } from "./critical-human-proof-policy.mjs";
import { fsyncDirectoryDurable } from "./fs-durability.mjs";
import { SHA256, canonical, object, trustAnchorsFor, localOperatorAnchorFor, verifySignedAction, validCandidate, validNow } from "./critical-action-authorization-read.mjs";
export { authorizeRecordedChatResidualAcceptance } from "./critical-action-authorization-read.mjs";
import { authorizeRecordedResidualAcceptance as authorizeRecordedResidualAcceptanceRead, authorizeRecordedResidualAcceptanceByMode as authorizeRecordedResidualAcceptanceByModeRead } from "./critical-action-authorization-read.mjs";


const MAX_BOUND_ARTIFACT_BYTES = 1_048_576;

/**
 * The digest of a repository-relative artifact the approval bound.
 *
 * The path arrives inside the state record, so it is treated as untrusted input: it must
 * be repository-relative, must land inside the project, and must be an ordinary file of
 * bounded size. A path that leaves the repository is refused rather than resolved — the
 * same containment rule `boundRepositoryArtifact` applies on the writing side, restated
 * here because a verifier that trusted the writer's containment would be trusting the
 * record again.
 *
 * Be exact about the symlink half, because the first version of this comment was not
 * (T6 Critic, F5). Containment is LEXICAL — `resolve`/`relative`/`startsWith` — and only
 * the FINAL component is `lstat`ed. A path whose intermediate directory is a symlink out
 * of the repository therefore passes containment and is read through that symlink.
 *
 * That is left as-is rather than hardened, and the reason is worth stating so nobody
 * "fixes" it into a false sense of strength later: both the path and its digest live
 * inside the signed subject, so neither is choosable without the private key. Hardening
 * here would defend against an attacker who, by construction, has already won. What was
 * actually wrong was the comment claiming a protection the code does not implement.
 */
function boundArtifactDigest(projectDir, relativePath) {
  if (typeof relativePath !== "string" || relativePath === "" || isAbsolute(relativePath)) return null;
  const root = resolve(projectDir);
  const path = resolve(root, relativePath);
  const inside = relative(root, path);
  if (inside === "" || inside.startsWith(`..${sep}`) || inside === ".." || !path.startsWith(`${root}${sep}`)) return null;
  try {
    const stat = lstatSync(path);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_BOUND_ARTIFACT_BYTES) return null;
    return createHash("sha256").update(readFileSync(path)).digest("hex");
  } catch {
    return null;
  }
}

/**
 * Trust-on-first-use write-back. Reached ONLY when `trustAnchorsFor` set `pinOnSuccess` and
 * the action this call authorizes has now fully verified — never on a proof that merely
 * checked cryptographically but was then refused for an unrelated reason (unconsumed ledger
 * entry, single-use replay, etc.): only a call that is actually going to return
 * `authorized: true` gets to pin a key.
 *
 * Re-reads the policy immediately before writing and refuses to touch it unless it STILL has
 * no anchor at all: a concurrent write — a human editing one in, or a racing call pinning a
 * different key first — must win over this one, never be silently clobbered by it.
 *
 * Same-directory temp file, fsync, atomic rename, directory fsync — the identical durable-write
 * shape `atomicWriteContinuityState` (scripts/pipeline-state.mjs) already established for this
 * codebase's other state writers, copied rather than reinvented. Best-effort and silent on
 * failure BY DESIGN: the proof that reached this point already verified cryptographically
 * against the open posture, so a write error here must not retroactively unauthorize an action
 * that has already been decided — it only means the pin did not take, and the NEXT call gets
 * the identical chance to record it.
 */
function pinTrustAnchorOnFirstUse(anchorDir, policy, kind, signer) {
  try {
    const path = resolve(anchorDir, CRITICAL_HUMAN_PROOF_POLICY_PATH);
    const fresh = readCriticalHumanProofPolicy(anchorDir);
    if (!fresh.ok || fresh.trustAnchors !== null || fresh.trustAnchor !== null) return;
    const document = {
      schema: CRITICAL_HUMAN_PROOF_POLICY_V3,
      requiredKinds: Array.from(new Set([...policy.requiredKinds, kind])),
      waivedKinds: Array.from(policy.waivers, ([waivedKind, reason]) => ({ kind: waivedKind, reason })),
      trustAnchors: [{ keyReference: signer.keyReference, publicKeySha256: signer.publicKeySha256 }],
    };
    const text = `${JSON.stringify(document, null, 2)}\n`;
    const bytes = Buffer.from(text, "utf8");
    const parent = dirname(path);
    mkdirSync(parent, { recursive: true, mode: 0o700 });
    const tmp = join(parent, `.critical-human-proof-policy-${randomBytes(12).toString("hex")}.tmp`);
    const fd = openSync(tmp, "wx", 0o600);
    try {
      ftruncateSync(fd, 0);
      let offset = 0;
      while (offset < bytes.length) offset += writeSync(fd, bytes, offset, bytes.length - offset, offset);
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    try {
      renameSync(tmp, path);
    } catch (error) {
      try { unlinkSync(tmp); } catch { /* best effort cleanup */ }
      throw error;
    }
    try {
      fsyncDirectoryDurable(parent);
    } catch { /* directory fsync is best-effort durability, not correctness */ }
  } catch {
    // Best-effort by design — see doc comment above.
  }
}

/*
 * THE PRIVATE APPROVAL STORE (D206, backlog 2026-10-30-signature-approvals-dirty-the-tracked-state-file).
 *
 * `approve-push` and the feature-package reconcile approval used to write their approval record and the
 * proof-consumption entry into the TRACKED state file. That left the working tree dirty after every
 * signature, the next steps refuse a dirty checkout, and resetting the file dropped the replay entry:
 * a clean tree and kept replay protection were impossible with that storage location.
 *
 * Both now write here instead: `<git common dir>/agent-pipeline/critical-approvals/`, created mode 0700,
 * files 0600 and exclusive (`wx`), the same private-directory rules as the residual acceptance store and
 * the external push ledger. Layout:
 *   approvals/<kind>/<approvedAtMs>-<recordDigest16>.json   one immutable record per approval; the
 *                                                          NEWEST valid record of a kind is that kind's
 *                                                          `lastApproved` (the old tracked slot's meaning)
 *   consumed/<proofSha256>.json                             the single-use marker; its mere existence
 *                                                          is the replay refusal
 * A record is bound to its kind, the approved commit and, for push, the remote and destination; a file
 * whose envelope disagrees with the record inside it, or whose directory names another kind, is ignored.
 *
 * This module is the ONE owner of the record format and of every read and write of the store. Readers
 * never open the files themselves: they call `withPrivateCriticalApprovals(state, projectDir)`, which
 * returns a state-shaped object whose `pushApproval` / `featurePackageReconcileApproval` /
 * `criticalProofConsumption` are overlaid from the store (the private record WINS when both exist; a
 * legacy record still present in the tracked state is the fallback and is never written by anything now).
 * With nothing private to overlay it returns the very same object it was given.
 *
 * Host note: the briefing asked for a new lib module; the write scope names no new path, so the owner
 * lives in this file, which already is the single verifier of these records. Moving it out later is a
 * pure relocation of this block.
 */
export const CRITICAL_APPROVAL_STORE_SCHEMA = "pipeline.critical-approval-record.v1";
export const CRITICAL_APPROVAL_CONSUMPTION_SCHEMA = "pipeline.critical-approval-consumption.v1";
/** kind -> the tracked-state slot the legacy record lived in (readers still see it under that name). */
const CRITICAL_APPROVAL_SLOTS = Object.freeze({ push: "pushApproval", "feature-package-reconcile": "featurePackageReconcileApproval" });

export function criticalApprovalStoreRoot(gitCommonDir) {
  return join(resolve(gitCommonDir), "agent-pipeline", "critical-approvals");
}

/** The git common directory of `projectDir` (worktree-invariant), or null when it cannot be resolved. */
export function resolveCriticalApprovalCommonDir(projectDir) {
  try {
    if (typeof projectDir !== "string" || projectDir === "") return null;
    const result = spawnSync("git", ["-C", projectDir, "rev-parse", "--git-common-dir"], { encoding: "utf8", timeout: 5000 });
    if (result.status !== 0 || typeof result.stdout !== "string" || result.stdout.trim() === "") return null;
    return resolve(projectDir, result.stdout.trim());
  } catch {
    return null;
  }
}

function approvalEnvelope(kind, approval) {
  const envelope = { schema: CRITICAL_APPROVAL_STORE_SCHEMA, kind, forCommit: approval.forCommit, approvedAt: approval.approvedAt };
  if (kind === "push") { envelope.remote = approval.remote; envelope.destination = approval.destination; }
  envelope.approval = approval;
  return envelope;
}

function approvalEnvelopeValid(kind, envelope) {
  if (!object(envelope) || envelope.schema !== CRITICAL_APPROVAL_STORE_SCHEMA || envelope.kind !== kind) return false;
  const approval = envelope.approval;
  if (!object(approval) || typeof approval.forCommit !== "string" || approval.forCommit !== envelope.forCommit
    || approval.approvedAt !== envelope.approvedAt) return false;
  return kind !== "push" || (approval.remote === envelope.remote && approval.destination === envelope.destination);
}

/**
 * Writes one approval and its proof consumption. The consumption marker is claimed FIRST with `wx`
 * (the replay mechanism), then the approval lands via an exclusive temp file and a rename, so a reader
 * never sees a half-written record. A proof burned by a failed second step stays burned (fail closed;
 * a fresh signing ceremony is the recovery, as for the external ledger).
 *
 * @param {{gitCommonDir: string, kind: "push"|"feature-package-reconcile", approval: object, consumedAt?: string}} input
 * @returns {{ok: true} | {ok: false, code: "CRITICAL-PROOF-REPLAY"|"CRITICAL-APPROVAL-STORE-INPUT-INVALID"|"CRITICAL-APPROVAL-STORE-WRITE-FAILED"}}
 */
export function writeCriticalApproval({ gitCommonDir, kind, approval, consumedAt } = {}) {
  const invalid = { ok: false, code: "CRITICAL-APPROVAL-STORE-INPUT-INVALID" };
  if (typeof gitCommonDir !== "string" || gitCommonDir === "" || !Object.hasOwn(CRITICAL_APPROVAL_SLOTS, kind)
    || !object(approval) || typeof approval.forCommit !== "string" || approval.forCommit === ""
    || typeof approval.approvedAt !== "string" || !Number.isFinite(Date.parse(approval.approvedAt))) return invalid;
  if (kind === "push" && (typeof approval.remote !== "string" || typeof approval.destination !== "string")) return invalid;
  const proofSha256 = object(approval.criticalProof) ? approval.criticalProof.proofSha256 : null;
  if (approval.criticalProof !== null && approval.criticalProof !== undefined && !SHA256.test(proofSha256 ?? "")) return invalid;
  const envelope = approvalEnvelope(kind, approval);
  const root = criticalApprovalStoreRoot(gitCommonDir);
  try {
    mkdirSync(join(root, "consumed"), { recursive: true, mode: 0o700 });
    mkdirSync(join(root, "approvals", kind), { recursive: true, mode: 0o700 });
    if (proofSha256 !== null) {
      const marker = { schema: CRITICAL_APPROVAL_CONSUMPTION_SCHEMA, proofSha256, kind, consumedAt: consumedAt ?? approval.approvedAt };
      try {
        writeFileSync(join(root, "consumed", `${proofSha256}.json`), `${JSON.stringify(marker, null, 2)}\n`, { flag: "wx", mode: 0o600 });
      } catch (error) {
        if (error?.code === "EEXIST") return { ok: false, code: "CRITICAL-PROOF-REPLAY" };
        throw error;
      }
    }
    const digest = createHash("sha256").update(canonical(envelope)).digest("hex").slice(0, 16);
    const name = `${String(Date.parse(approval.approvedAt)).padStart(16, "0")}-${digest}.json`;
    const dir = join(root, "approvals", kind);
    const temp = join(dir, `.${randomBytes(6).toString("hex")}.tmp`);
    writeFileSync(temp, `${JSON.stringify(envelope, null, 2)}\n`, { flag: "wx", mode: 0o600 });
    renameSync(temp, join(dir, name));
  } catch {
    return { ok: false, code: "CRITICAL-APPROVAL-STORE-WRITE-FAILED" };
  }
  return { ok: true };
}

/** Has this proof digest been consumed in the private store? An existing marker (even a damaged one) counts. */
export function isCriticalProofConsumedPrivately(gitCommonDir, proofSha256) {
  try {
    if (typeof gitCommonDir !== "string" || !SHA256.test(proofSha256 ?? "")) return false;
    lstatSync(join(criticalApprovalStoreRoot(gitCommonDir), "consumed", `${proofSha256}.json`));
    return true;
  } catch {
    return false;
  }
}

function readJsonFile(path) {
  try { return JSON.parse(readFileSync(path, "utf8")); } catch { return null; }
}

/** The newest valid private approval record of `kind` (its `.approval` is the old `lastApproved`), or null. */
export function readLastPrivateApproval(gitCommonDir, kind) {
  try {
    if (typeof gitCommonDir !== "string" || !Object.hasOwn(CRITICAL_APPROVAL_SLOTS, kind)) return null;
    const dir = join(criticalApprovalStoreRoot(gitCommonDir), "approvals", kind);
    const names = readdirSync(dir).filter((name) => name.endsWith(".json") && !name.startsWith(".")).sort().reverse();
    for (const name of names) {
      const envelope = readJsonFile(join(dir, name));
      if (approvalEnvelopeValid(kind, envelope)) return envelope;
    }
  } catch {
    // an absent or unreadable store is "nothing private"; the legacy fallback still applies
  }
  return null;
}

/** Every private consumption entry, in the legacy ledger's `{ proofSha256, kind, consumedAt }` shape. */
export function readPrivateCriticalConsumption(gitCommonDir) {
  const entries = [];
  try {
    const dir = join(criticalApprovalStoreRoot(gitCommonDir), "consumed");
    for (const name of readdirSync(dir).sort()) {
      const match = /^([a-f0-9]{64})\.json$/u.exec(name);
      if (match === null) continue;
      const marker = readJsonFile(join(dir, name));
      if (object(marker) && marker.schema === CRITICAL_APPROVAL_CONSUMPTION_SCHEMA && marker.proofSha256 === match[1]
        && typeof marker.kind === "string" && typeof marker.consumedAt === "string") {
        entries.push({ proofSha256: marker.proofSha256, kind: marker.kind, consumedAt: marker.consumedAt });
      }
    }
  } catch {
    // none readable
  }
  return entries;
}

/**
 * The state every approval reader should consult: `state` with the private store overlaid (see the block
 * comment above). Idempotent; never throws; returns `state` itself when there is nothing private.
 */
export function withPrivateCriticalApprovals(state, projectDir) {
  try {
    if (!object(state)) return state;
    const common = resolveCriticalApprovalCommonDir(projectDir);
    if (common === null) return state;
    let next = null;
    for (const [kind, slot] of Object.entries(CRITICAL_APPROVAL_SLOTS)) {
      const envelope = readLastPrivateApproval(common, kind);
      if (envelope === null) continue;
      next ??= { ...state };
      next[slot] = { ...(object(state[slot]) ? state[slot] : {}), lastApproved: envelope.approval };
    }
    const consumed = readPrivateCriticalConsumption(common);
    if (consumed.length > 0) {
      next ??= { ...state };
      const legacy = Array.isArray(state.criticalProofConsumption) ? state.criticalProofConsumption : [];
      const known = new Set(legacy.filter(object).map((entry) => `${entry.kind}:${entry.proofSha256}`));
      next.criticalProofConsumption = [...legacy, ...consumed.filter((entry) => !known.has(`${entry.kind}:${entry.proofSha256}`))];
    }
    return next ?? state;
  } catch {
    return state;
  }
}

/**
 * @param {{projectDir: string, state: object, candidate: {commit: string, tree: string},
 *          remote: string, destination: string, now: string, machinePlaneDeps?: object}} input
 *   `machinePlaneDeps` — dependency injection for the trust-on-first-use provenance gate
 *   (`localOperatorKeyAuthorizes`/`resolveLocalOperatorKeyAnchor`); production callers omit
 *   it and resolve the real machine, tests substitute `{ homedirFn }`.
 * @returns {{authorized: true, code: "PUSH-PROOF-VERIFIED", keyReference: string, publicKeySha256: string}
 *          | {authorized: false, code: string}}
 */
export function authorizeRecordedPush({
  projectDir, anchorDir = projectDir, state, candidate, remote, destination, now, machinePlaneDeps = {},
} = {}) {
  const prefix = "PUSH-PROOF";
  // D206: the approval and its consumption entry live in the private store; the tracked record is only the legacy fallback.
  state = withPrivateCriticalApprovals(state, projectDir);
  if (typeof projectDir !== "string" || typeof anchorDir !== "string" || !object(state) || !validCandidate(candidate)
    || typeof remote !== "string" || remote === ""
    || typeof destination !== "string" || destination === "" || !validNow(now)) {
    return { authorized: false, code: `${prefix}-INPUT-INVALID` };
  }

  // The key identity is read first: every later check is meaningless without an anchor set
  // to verify against, and "no anchor set at all" (v1/v2, or no policy) must never read as
  // "no check needed". It comes from the governed session root, never from the pushed
  // repository -- see `trustAnchorsFor`.
  const trust = trustAnchorsFor(anchorDir, prefix);
  if (!trust.ok) return { authorized: false, code: trust.code };

  // NARROWED (see `trustAnchorsFor`'s doc comment): resolved before any record is even
  // inspected — a genuinely anchor-less policy whose machine has no registered operator key
  // at all means the route is simply unavailable, independent of whatever record happens to
  // be present. Deliberately mirrors the ORIGINAL pre-trust-on-first-use gate shape, which
  // also refused here before ever reading the approval record.
  const localAnchor = localOperatorAnchorFor(trust, machinePlaneDeps);
  if (trust.pinOnSuccess && localAnchor === null) {
    return { authorized: false, code: `${prefix}-TRUST-ANCHOR-MISSING` };
  }

  const approval = state?.pushApproval?.lastApproved;
  const recorded = approval?.criticalProof;
  if (!object(approval) || !object(recorded) || !object(approval.threatModel)) {
    return { authorized: false, code: `${prefix}-RECORD-INCOMPLETE` };
  }

  // The guard-visible binding. These fields are what a human reads in the record, so a
  // mismatch is reported as a binding failure rather than as a digest failure the
  // operator would have to decode. The signature check below re-derives the same facts,
  // which is what catches a record whose fields were rewritten to agree.
  if (approval.forCommit !== candidate.commit) return { authorized: false, code: `${prefix}-COMMIT-MISMATCH` };
  if (approval.remote !== remote || approval.destination !== destination) {
    return { authorized: false, code: `${prefix}-BINDING-MISMATCH` };
  }

  // The threat model is inside the signed subject, so its CURRENT bytes must still be the
  // ones that were signed. Editing it after approval revokes the authorization.
  const threatModelDigest = boundArtifactDigest(projectDir, approval.threatModel.path);
  if (threatModelDigest === null || threatModelDigest !== approval.threatModel.sha256) {
    return { authorized: false, code: `${prefix}-THREAT-MODEL` };
  }

  const verified = verifySignedAction({
    state, kind: "push", prefix, candidate, recorded, anchors: trust.anchors, now,
    subject: {
      sourceCommit: candidate.commit,
      remote,
      destination,
      threatModel: { path: approval.threatModel.path, sha256: approval.threatModel.sha256 },
    },
  });
  if (!verified.ok) return { authorized: false, code: verified.code };

  // approve-push writes the approval and its consumption entry in one transaction, so a
  // record whose proof was never consumed did not come from that writer.
  const ledger = state?.criticalProofConsumption;
  if (!Array.isArray(ledger)
    || !ledger.some((entry) => object(entry) && entry.proofSha256 === recorded.proofSha256 && entry.kind === "push")) {
    return { authorized: false, code: `${prefix}-NOT-CONSUMED` };
  }

  // Trust-on-first-use: only pin once every other check has already passed and this call
  // is actually going to authorize the push — see `pinTrustAnchorOnFirstUse`. NARROWED: the
  // open-verification posture itself is now also conditioned on independent, machine-local
  // provenance (see `trustAnchorsFor`'s doc comment) — a verifying key that is not this
  // machine's own registered operator key (`localAnchor`, resolved above) is refused
  // outright, not merely left unpinned.
  if (trust.pinOnSuccess) {
    if (localAnchor.publicKeySha256 !== verified.signer.publicKeySha256) {
      return { authorized: false, code: `${prefix}-TRUST-ANCHOR-MISSING` };
    }
    pinTrustAnchorOnFirstUse(anchorDir, trust.policy, "push", verified.signer);
  }

  return {
    authorized: true, code: `${prefix}-VERIFIED`,
    keyReference: verified.signer.keyReference, publicKeySha256: verified.signer.publicKeySha256,
  };
}

/** Verify explicitly selected, proof-free chat attribution for a raw push. */
export function authorizeRecordedChatPush({
  projectDir, anchorDir = projectDir, state, candidate, remote, destination,
} = {}) {
  const prefix = "PUSH-PROOF";
  state = withPrivateCriticalApprovals(state, projectDir);
  if (typeof projectDir !== "string" || typeof anchorDir !== "string" || !object(state) || !validCandidate(candidate)
    || typeof remote !== "string" || remote === ""
    || typeof destination !== "string" || destination === "") {
    return { authorized: false, code: `${prefix}-INPUT-INVALID` };
  }
  let waiver;
  try { waiver = criticalProofWaiverFor(anchorDir, "push"); }
  catch { return { authorized: false, code: `${prefix}-CHAT-POLICY-UNREADABLE` }; }
  if (waiver?.waived !== true || !waiver.waiver) {
    return { authorized: false, code: waiver?.code ?? `${prefix}-CHAT-NOT-WAIVED` };
  }
  const approval = state?.pushApproval?.lastApproved;
  if (!object(approval) || approval.forCommit !== candidate.commit
    || approval.remote !== remote || approval.destination !== destination) {
    return { authorized: false, code: `${prefix}-BINDING-MISMATCH` };
  }
  if (approval.criticalProof !== null) return { authorized: false, code: `${prefix}-CHAT-RECORD-MISMATCH` };
  const recordedWaiver = approval.criticalProofWaiver;
  if (!object(recordedWaiver) || recordedWaiver.kind !== "push"
    || recordedWaiver.mode !== waiver.waiver.mode || recordedWaiver.source !== waiver.waiver.source) {
    return { authorized: false, code: `${prefix}-CHAT-ATTRIBUTION-MISSING` };
  }
  if (waiver.waiver.mode === "chat-attributed-unattested"
    && (!object(approval.humanApproval) || approval.humanApproval.kind !== "push"
      || approval.humanApproval.mode !== "chat-attributed-unattested")) {
    return { authorized: false, code: `${prefix}-CHAT-ATTRIBUTION-MISSING` };
  }
  if (waiver.waiver.mode !== "chat-attributed-unattested" && approval.humanApproval !== undefined) {
    return { authorized: false, code: `${prefix}-CHAT-RECORD-MISMATCH` };
  }
  if (!object(approval.threatModel) || typeof approval.threatModel.path !== "string"
    || !SHA256.test(approval.threatModel.sha256 ?? "")) {
    return { authorized: false, code: `${prefix}-THREAT-MODEL` };
  }
  const threatModelDigest = boundArtifactDigest(projectDir, approval.threatModel.path);
  if (threatModelDigest === null || threatModelDigest !== approval.threatModel.sha256) {
    return { authorized: false, code: `${prefix}-THREAT-MODEL` };
  }
  return { authorized: true, code: "PUSH-PROOF-WAIVED", mode: waiver.waiver.mode };
}

/**
 * The release route's equivalent: is there a recorded, unused deploy approval for this
 * artifact and environment whose detached proof verifies against the committed anchor?
 *
 * Deliberately NOT modelled on the push ledger: `approve-deploy` writes no
 * `criticalProofConsumption` entry — `consume-deploy`'s `usedAt` mark is that route's
 * single-use control, so requiring a ledger entry here would refuse every approval the
 * writer has ever produced.
 *
 * @param {{projectDir: string, state: object, candidate: {commit: string, tree: string},
 *          artifact: string, environment: string, now: string, machinePlaneDeps?: object}} input
 *   `machinePlaneDeps` — see `authorizeRecordedPush`'s identical parameter.
 * @returns {{authorized: true, code: "DEPLOY-PROOF-VERIFIED", keyReference: string, publicKeySha256: string}
 *          | {authorized: false, code: string}}
 */
export function authorizeRecordedDeploy({
  projectDir, anchorDir = projectDir, state, candidate, artifact, environment, now, machinePlaneDeps = {},
} = {}) {
  const prefix = "DEPLOY-PROOF";
  if (typeof projectDir !== "string" || typeof anchorDir !== "string" || !object(state) || !validCandidate(candidate)
    || typeof artifact !== "string" || artifact === ""
    || typeof environment !== "string" || environment === "" || !validNow(now)) {
    return { authorized: false, code: `${prefix}-INPUT-INVALID` };
  }

  const trust = trustAnchorsFor(anchorDir, prefix);
  if (!trust.ok) return { authorized: false, code: trust.code };

  // NARROWED (see `authorizeRecordedPush`): resolved before any deploy-approval entry is
  // even inspected — a genuinely anchor-less policy whose machine has no registered
  // operator key at all means the route is simply unavailable, independent of whatever
  // entries happen to be present.
  const localAnchor = localOperatorAnchorFor(trust, machinePlaneDeps);
  if (trust.pinOnSuccess && localAnchor === null) {
    return { authorized: false, code: `${prefix}-TRUST-ANCHOR-MISSING` };
  }

  const approvals = Array.isArray(state?.deployApprovals) ? state.deployApprovals : [];
  const matching = approvals.filter((entry) => object(entry)
    && entry.forArtifact === artifact && entry.forEnvironment === environment && !entry.usedAt);
  if (matching.length === 0) return { authorized: false, code: `${prefix}-RECORD-INCOMPLETE` };

  // Several unused approvals for the same tuple are legitimate — the writer appends. Take
  // the first whose proof actually verifies rather than the first that merely exists, so
  // one stale entry cannot mask a valid one. The last refusal is reported, because a
  // caller with no matching proof needs the reason, not a generic miss.
  let lastCode = `${prefix}-RECORD-INCOMPLETE`;
  for (const entry of matching) {
    const verified = verifySignedAction({
      state, kind: "deploy", prefix, candidate, recorded: entry.criticalProof,
      anchors: trust.anchors, now, subject: { artifact, environment },
    });
    if (verified.ok) {
      // NARROWED (see `authorizeRecordedPush`): the open-verification posture is now also
      // conditioned on independent, machine-local provenance. A verifying key that is not
      // this machine's own registered operator key is treated as a failed candidate for
      // THIS entry (falls through to `lastCode`/the next entry), not an authorized deploy.
      if (trust.pinOnSuccess) {
        if (localAnchor.publicKeySha256 !== verified.signer.publicKeySha256) {
          lastCode = `${prefix}-TRUST-ANCHOR-MISSING`;
          continue;
        }
        pinTrustAnchorOnFirstUse(anchorDir, trust.policy, "deploy", verified.signer);
      }
      return {
        authorized: true, code: `${prefix}-VERIFIED`,
        keyReference: verified.signer.keyReference, publicKeySha256: verified.signer.publicKeySha256,
      };
    }
    lastCode = verified.code;
  }
  return { authorized: false, code: lastCode };
}

/** Signature route of the residual acceptance with the first-use trust-anchor pin (the read half carries no write). */
export function authorizeRecordedResidualAcceptance(input = {}) {
  return authorizeRecordedResidualAcceptanceRead({ ...input, pinTrustAnchor: pinTrustAnchorOnFirstUse });
}

/** Picks the chat route when the configured mode waives the proof, otherwise the signature route (with the first-use pin). */
export function authorizeRecordedResidualAcceptanceByMode(input = {}) {
  return authorizeRecordedResidualAcceptanceByModeRead({ ...input, pinTrustAnchor: pinTrustAnchorOnFirstUse });
}
