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
import { createHash, createPublicKey } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, lstatSync, readFileSync, realpathSync } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";

import { CRITICAL_ACTION_KINDS } from "./critical-action-approval-request.mjs";
import { verifyPoApprovalProof } from "./po-approval-proof.mjs";
import { PUSH_APPROVAL_MODES } from "./runner-profiles-v3.mjs";
import { parseYaml } from "./yaml-lite.mjs";

export const USER_SOURCE_PATH = "pipeline.user.yaml";
export const DEFAULT_PUSH_APPROVAL_MODE = "signature";
export const DEFAULT_HUMAN_APPROVAL_MODE = "signature";
export const HUMAN_APPROVAL_MODE_KEY = "human_approval";
// PHX-WP-PAC08-RECONCILE-APPROVAL (ADR-0056's 2026-08-11 Follow-up): a second
// action kind gets the identical signature/chat mode shape, under its OWN
// `gates.*` key (not an overload of `gates.push_approval` -- decision 5's "the
// source wins, a contradiction fails closed" logic is written in terms of one
// action kind owning one key). Mirrors DEFAULT_PUSH_APPROVAL_MODE exactly.
export const DEFAULT_RECONCILE_APPROVAL_MODE = "signature";

/**
 * Kind -> `pipeline.user.yaml` `gates.*` key, for every action kind that has a
 * source-of-truth approval mode (ADR-0056). Extending this table is how a future
 * action kind gets the identical fail-closed mode logic without a second
 * implementation -- see `readGateApprovalMode`/`criticalProofWaiverFor` below.
 */
const GATE_APPROVAL_MODE_KEYS = Object.freeze({
  push: "push_approval",
  "feature-package-reconcile": "reconcile_approval",
});
const GATE_APPROVAL_MODE_DEFAULTS = Object.freeze({
  push: DEFAULT_PUSH_APPROVAL_MODE,
  "feature-package-reconcile": DEFAULT_RECONCILE_APPROVAL_MODE,
});

/**
 * Does the working tree's copy of the setting match the one that is committed?
 *
 * WHY THIS EXISTS — the T2 Critic's C1 blocker on `62de980`. The guard family defends
 * this file through two lanes, and the write lane (GS-1) is sound. The shell lane is not:
 * it refuses a command whose *text* contains the literal filename, so any command that
 * assembles the name at runtime walks straight past it, and no amount of better string
 * matching fixes that — an interpreter given inline code, or a script the agent wrote a
 * moment earlier, is opaque to a guard that can only read the command line.
 *
 * That mattered far more than "one config file is writable". A single such write set
 * `gates.push_approval: chat`, which both admitted the in-session guard-testpath override
 * AND, through `criticalProofWaiverFor` below, stood down the detached Ed25519 proof for
 * `push`. The agent could clear its own push gate.
 *
 * So the decision no longer rests on the working tree alone. A copy that differs from
 * `HEAD` is treated as unverified and yields the strongest mode, never the weakest. The
 * asymmetry is the point: an in-session edit can only ever STRENGTHEN the gate, so the
 * attack produces the opposite of what it wants, whichever route wrote the file.
 *
 * Be precise about the residual, because overselling this is how the previous claim got
 * written: an agent that writes AND commits the file makes the two agree again. What that
 * costs it is invisibility — the change becomes a diffable commit inside the candidate the
 * push request binds to, in front of Verify, the Critic and the PO. This lowers an
 * unobservable in-session flip to a recorded one; it does not make the file unreachable.
 *
 * Fails closed on everything: no Git, no commit, an unreadable object, a non-zero exit or
 * a throw all mean "not verified".
 *
 * Consequence for the operator, stated because it changes a workflow: setting `chat` now
 * requires committing the change. An uncommitted edit reads as `signature`.
 */
/**
 * The bytes Git has for this file at HEAD, or null when it has none.
 *
 * Split out from the comparison because ABSENCE has to be checked against HEAD too. The
 * previous version returned `source: "default"` the moment the working-tree file was
 * missing, before consulting Git at all — so an agent could delete the file instead of
 * editing it and land in the one source value that lets a policy waiver govern. The T5
 * Critic found it (F2): every state the tightening refuses was reachable by `rm`.
 *
 * `null` therefore means "Git has nothing here either", which is the only case where the
 * source genuinely has no opinion. A missing working-tree file whose blob exists at HEAD is
 * a modification like any other, and is treated as one.
 */
function committedBytes(root, spawn) {
  try {
    // The path in a `<rev>:<path>` spec resolves against the REPOSITORY TOP LEVEL, not
    // against `-C`. The first version of this function ignored that and asked for
    // `HEAD:pipeline.user.yaml` while reading `<root>/pipeline.user.yaml`, which is only
    // the same file when root IS the top level. The T3 Critic found it (K1): in a checkout
    // holding more than one project root, an agent could make `<subdir>/pipeline.user.yaml`
    // byte-equal to the ROOT's committed copy and have it accepted as "unchanged" though it
    // was never committed at that path -- reopening exactly the C1 escalation. The mirror
    // case was just as wrong: a sub-project that DID commit its own copy could never reach
    // `chat`, because Git looked for the blob at the top level.
    const top = spawn("git", ["-C", root, "rev-parse", "--show-toplevel"], { encoding: "utf8" });
    if (top.error || top.status !== 0 || typeof top.stdout !== "string") return null;
    const repoRoot = top.stdout.trim();
    if (repoRoot === "") return null;
    // Ask for the blob at the path this file actually occupies, expressed from the top
    // level and with POSIX separators, which is the only form Git accepts in a rev spec.
    //
    // Both operands must live in the SAME namespace. `--show-toplevel` is physical: Git
    // reaches it through `getcwd()`, so symlinks are already resolved. `resolve()` is purely
    // lexical and resolves none. Relating them directly -- the first version of this line --
    // makes `relative()` emit a `..` path for any root reached through a symlink, so a
    // correctly committed file reads as uncommitted. The T4 Critic found it. The sibling
    // modules had this right already: project-authority.mjs (`realRoot`) and
    // guard-lifecycle-ready.mjs (`isProjectWritePath`) both realpath before comparing.
    //
    // Only the DIRECTORY is resolved. A symlinked `pipeline.user.yaml` must not be followed,
    // and is not: readPushApprovalMode rejects it by `lstatSync` long before this runs.
    const relPath = relative(repoRoot, join(realpathSync(resolve(root)), USER_SOURCE_PATH));
    if (relPath === "" || relPath.startsWith("..") || isAbsolute(relPath)) return null;
    const result = spawn("git", ["-C", root, "show", `HEAD:${relPath.split(sep).join("/")}`], {
      encoding: "buffer",
      maxBuffer: 1024 * 1024,
    });
    if (result.error || result.status !== 0 || !result.stdout) return null;
    return Buffer.from(result.stdout);
  } catch {
    return null;
  }
}

/**
 * Read `gates.push_approval` from the project's own source of truth (ADR-0056).
 *
 * This is read directly rather than through a compiled projection because `gates` is
 * not one of the V3 compiler's owned keys — the manifest's gate block is
 * hand-maintained, so projecting a single setting would mean extending the frozen
 * owned-keys contract for it. Absent file, absent key, or anything unparseable all
 * mean the fail-closed default: a gate whose configuration cannot be read is at its
 * strongest setting, never its weakest.
 */
function readApprovalModeKey(dir, key, fallback, { spawn = spawnSync } = {}) {
  const path = join(resolve(dir), USER_SOURCE_PATH);
  if (!existsSync(path)) {
    // Absence is a claim too, and it needs the same evidence. If HEAD carries this file, an
    // absent working-tree copy is a modification -- the deletion route the T5 Critic found
    // (F2), which reached `default` and let a policy waiver govern without touching a byte
    // of content. Only a file Git does not have either means the source has no opinion.
    return committedBytes(resolve(dir), spawn) === null
      ? { mode: fallback, source: "default" }
      : { mode: fallback, source: "uncommitted" };
  }
  try {
    const info = lstatSync(path);
    if (!info.isFile() || info.isSymbolicLink()) return { mode: fallback, source: "unsafe" };
    const raw = readFileSync(path, "utf8");
    const committed = committedBytes(resolve(dir), spawn);
    if (committed === null || Buffer.compare(committed, Buffer.from(raw, "utf8")) !== 0) {
      return { mode: fallback, source: "uncommitted" };
    }
    const value = parseYaml(raw);
    const configured = value?.gates?.[key];
    if (configured === undefined) return { mode: fallback, source: "default" };
    return PUSH_APPROVAL_MODES.includes(configured)
      ? { mode: configured, source: USER_SOURCE_PATH }
      : { mode: fallback, source: "invalid" };
  } catch {
    return { mode: fallback, source: "unreadable" };
  }
}

function readGateApprovalMode(dir, kind, opts = {}) {
  return readApprovalModeKey(dir, GATE_APPROVAL_MODE_KEYS[kind], GATE_APPROVAL_MODE_DEFAULTS[kind], opts);
}

export function readPushApprovalMode(dir, opts = {}) {
  return readGateApprovalMode(dir, "push", opts);
}

/** Mirrors `readPushApprovalMode` exactly, for `gates.reconcile_approval` (ADR-0056 Follow-up). */
export function readReconcileApprovalMode(dir, opts = {}) {
  return readGateApprovalMode(dir, "feature-package-reconcile", opts);
}

/**
 * The one mode selector for a human gate.
 *
 * `gates.human_approval` is a deliberate, repository-wide product choice.  Once a
 * committed value is present it wins over the older action-local settings: an
 * operator choosing global `chat` has explicitly chosen the weaker, non-attested
 * attribution route for every participating human gate.  We do not turn an old
 * `push_approval: signature` default into a configuration conflict, because that
 * would make a migrated repository unable to choose the newly-authorized global
 * posture without an atomic edit to every historical key.
 *
 * Before the shared key exists, the old action-local contract remains intact.  A
 * caller that historically followed push mode (HGO) passes `legacyKind: "push"`;
 * GMW deliberately passes no legacy kind and therefore remains signature-only in
 * an unmigrated repository.
 */
export function readHumanApprovalMode(dir, { legacyKind = null, spawn = spawnSync } = {}) {
  const global = readApprovalModeKey(dir, HUMAN_APPROVAL_MODE_KEY, DEFAULT_HUMAN_APPROVAL_MODE, { spawn });
  if (global.source !== "default") {
    return {
      mode: global.mode,
      source: global.source,
      key: HUMAN_APPROVAL_MODE_KEY,
      scope: "global",
    };
  }
  if (legacyKind !== null && GATE_APPROVAL_MODE_KEYS[legacyKind] !== undefined) {
    const legacy = readGateApprovalMode(dir, legacyKind, { spawn });
    return {
      mode: legacy.mode,
      source: legacy.source,
      key: GATE_APPROVAL_MODE_KEYS[legacyKind],
      scope: "legacy",
    };
  }
  return {
    mode: DEFAULT_HUMAN_APPROVAL_MODE,
    source: "default",
    key: HUMAN_APPROVAL_MODE_KEY,
    scope: "default",
  };
}

export const CRITICAL_HUMAN_PROOF_POLICY_PATH = "project/critical-human-proof.json";
export const CRITICAL_HUMAN_PROOF_POLICY_V1 = "pipeline.critical-human-proof-policy.v1";
export const CRITICAL_HUMAN_PROOF_POLICY_V2 = "pipeline.critical-human-proof-policy.v2";
/**
 * v3 (SETUP-1, `nova-setup-bootstrap.md` §5a): the one change v1/v2 could not make
 * in place without silently reinterpreting an existing document -- `trustAnchor`
 * (singular) becomes `trustAnchors` (a SET). Absent or empty is the default posture,
 * "any well-formed key may sign"; populated enforces membership. v1 and v2 keep their
 * old single-anchor field and its old meaning untouched; a v3 document uses the plural
 * field only, so the two spellings never coexist on one schema version.
 */
export const CRITICAL_HUMAN_PROOF_POLICY_V3 = "pipeline.critical-human-proof-policy.v3";
const MAX_POLICY_BYTES = 32_768;
const MIN_REASON_CHARS = 8;
const MAX_REASON_CHARS = 500;

function exactKeys(value, keys) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).length === keys.length
    && keys.every((key) => Object.hasOwn(value, key));
}

const SHA256 = /^[a-f0-9]{64}$/u;
const KEY_REFERENCE = /^[A-Za-z0-9._:@/-]{1,200}$/u;

/**
 * The committed identity of the key whose signature authorizes a critical action.
 *
 * WHY IT LIVES HERE and nowhere else: `project/critical-human-proof.json` is gate-strength
 * protected (GS-2), and every other candidate location was plainly writable by the thing
 * being gated.
 *
 * What GS-2 buys is NOT "unreachable", and this comment used to say it was — that an agent
 * "can reach neither the Edit/Write lane nor the shell lane to install a key of its own".
 * That has been false for the write lane since 503fe0d, which gave GS-1..GS-5/GS-7 the same
 * human-override lift every sibling guard already had (ADR-0059): a chat- or signature-armed
 * capability, bound to one exact edit, now admits one audited write to this file. The shell
 * lane keeps its blanket refusal with deliberately no in-session override at all
 * (GUARD-GATE-STRENGTH-SHELL), and even that is literal-filename matching, so a name
 * assembled at runtime is not caught — the same limitation guard-testpath.mjs already
 * records for GS-1.
 *
 * So the property to rely on is narrower and still sufficient: an agent cannot install a
 * key of its own UNILATERALLY. Every write lane into this file now passes through a human
 * authorization bound to that exact edit and recorded in the override audit ledger, and a
 * chat-mode capability additionally requires the repository's committed gates.push_approval
 * to already be "chat" — itself a GS-1-protected file. Anyone reasoning about this anchor
 * should treat it as human-gated and audited, not as unwritable.
 *
 * The anchor is public data — a key reference and the digest of a public key — so
 * committing it costs nothing and is what lets a verifier that holds no external directory
 * (the push guard) decide whether a recorded proof is the operator's or a forgery.
 *
 * Optional on purpose. A project that never authorizes a raw push does not need one, and
 * its absence is not an error — it simply means that route is unavailable.
 */
function anchorShapeOk(anchor) {
  return exactKeys(anchor, ["keyReference", "publicKeySha256"])
    && typeof anchor.keyReference === "string" && KEY_REFERENCE.test(anchor.keyReference)
    && typeof anchor.publicKeySha256 === "string" && SHA256.test(anchor.publicKeySha256);
}

function readTrustAnchor(value) {
  if (!Object.hasOwn(value, "trustAnchor")) return { ok: true, trustAnchor: null };
  const anchor = value.trustAnchor;
  if (!anchorShapeOk(anchor)) return { ok: false, code: "CRITICAL-PROOF-POLICY-TRUST-ANCHOR-INVALID" };
  return { ok: true, trustAnchor: Object.freeze({ ...anchor }) };
}

/**
 * v3's anchor SET. Absent or empty `trustAnchors` means "any well-formed key may sign" --
 * the PO's stated intent ("a human audited, deliberately not which one") and the default
 * posture. A populated array enforces membership, for a project that wants the narrower
 * claim. Each entry has the exact shape a v1/v2 `trustAnchor` always had -- only the
 * cardinality is new. Two entries naming the same key are refused: a policy that says the
 * same thing twice is not obviously wrong to a reader, so it is caught here rather than
 * left for a downstream consumer to trip over.
 */
function readTrustAnchorSet(value) {
  if (!Object.hasOwn(value, "trustAnchors")) return { ok: true, trustAnchors: [] };
  const anchors = value.trustAnchors;
  if (!Array.isArray(anchors) || anchors.some((anchor) => !anchorShapeOk(anchor))) {
    return { ok: false, code: "CRITICAL-PROOF-POLICY-TRUST-ANCHORS-INVALID" };
  }
  const seen = new Set();
  for (const anchor of anchors) {
    if (seen.has(anchor.publicKeySha256)) return { ok: false, code: "CRITICAL-PROOF-POLICY-TRUST-ANCHORS-INVALID" };
    seen.add(anchor.publicKeySha256);
  }
  return { ok: true, trustAnchors: Object.freeze(anchors.map((anchor) => Object.freeze({ ...anchor }))) };
}

/**
 * @returns {{ok: true, requiredKinds: Set<string>, waivers: Map<string, string>,
 *            trustAnchor: object|null, trustAnchors: object[]|null}
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
    const v3 = value?.schema === CRITICAL_HUMAN_PROOF_POLICY_V3;
    // `trustAnchor` (singular) is admitted as an optional key on v1 AND v2 rather than
    // minting a version for it: it adds no rule and changes no existing field's meaning,
    // so a version bump would force every consumer project to migrate a policy file for a
    // capability it may never use. v3 is different on purpose — an anchor SET changes what
    // absence means (§5a: absence now means "any well-formed key", not "no anchor
    // configured"), which is exactly the kind of change v1/v2 must NOT absorb silently. So
    // v3 carries `trustAnchors` (plural) only; a document that wants v3 with the old
    // single-key restriction writes a one-entry set, never the singular field.
    const shapeOk = (v2 || v3)
      ? exactKeys(value, ["schema", "requiredKinds", "waivedKinds"])
        || exactKeys(value, ["schema", "requiredKinds", "waivedKinds", v3 ? "trustAnchors" : "trustAnchor"])
      : (exactKeys(value, ["schema", "requiredKinds"])
        || exactKeys(value, ["schema", "requiredKinds", "trustAnchor"]))
        && value?.schema === CRITICAL_HUMAN_PROOF_POLICY_V1;
    if (!shapeOk
      || !Array.isArray(value.requiredKinds)
      || value.requiredKinds.length === 0
      || new Set(value.requiredKinds).size !== value.requiredKinds.length
      || value.requiredKinds.some((kind) => !CRITICAL_ACTION_KINDS.includes(kind))) {
      return { ok: false, code: "CRITICAL-PROOF-POLICY-INVALID" };
    }
    const waivers = new Map();
    if (v2 || v3) {
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
    // `trustAnchor` (v1/v2, one key or none) and `trustAnchors` (v3, a set) are kept as
    // TWO fields on the returned policy rather than folded into one, so a caller can tell
    // "this document has no set concept at all" (v1/v2, `trustAnchors: null`) apart from
    // "this document explicitly has an empty set" (v3, `trustAnchors: []`, meaning any
    // well-formed key) — the two must not collapse into the same value, because they
    // authorize differently downstream.
    if (v3) {
      const anchors = readTrustAnchorSet(value);
      if (!anchors.ok) return { ok: false, code: anchors.code };
      return {
        ok: true, requiredKinds: new Set(value.requiredKinds), waivers,
        trustAnchor: null, trustAnchors: anchors.trustAnchors,
      };
    }
    const anchor = readTrustAnchor(value);
    if (!anchor.ok) return { ok: false, code: anchor.code };
    return {
      ok: true, requiredKinds: new Set(value.requiredKinds), waivers,
      trustAnchor: anchor.trustAnchor, trustAnchors: null,
    };
  } catch (error) {
    // No policy file at all is the ordinary consumer case: nothing is required, and
    // nothing is waived either. Anything else is a policy we cannot read, which must
    // never read as "not required".
    return error?.code === "ENOENT"
      ? { ok: true, requiredKinds: new Set(), waivers: new Map(), trustAnchor: null, trustAnchors: null }
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
  const globalMode = readHumanApprovalMode(dir);
  // The explicitly committed global chat selection is intentionally the weak,
  // operator-chosen posture for *every* critical human gate.  It therefore has to
  // resolve before the proof-policy document: requiring that document to parse, or
  // consulting its anchors, would turn a key-free chat selection back into a key
  // ceremony.  An uncommitted/invalid/unsafe source never reaches this branch.
  if (globalMode.scope === "global" && globalMode.source === USER_SOURCE_PATH) {
    if (globalMode.mode === "chat") {
      return {
        waived: true,
        code: null,
        waiver: {
          kind,
          reason: `gates.${HUMAN_APPROVAL_MODE_KEY}: chat (${globalMode.source})`,
          mode: "chat-attributed-unattested",
          source: globalMode.source,
        },
      };
    }
    // `signature` is a strict transport selection, not a retroactive deletion of
    // a project's already-recorded policy waivers.  Fall through to the policy's
    // historic per-kind decision, while deliberately skipping old action-local
    // chat keys: the committed shared setting now owns the mode.
    const policy = readCriticalHumanProofPolicy(dir);
    if (!policy.ok) return { waived: false, code: policy.code };
    const reason = policy.waivers.get(kind);
    return reason === undefined
      ? { waived: false, code: null }
      : { waived: true, code: null, waiver: { kind, reason } };
  }
  const policy = readCriticalHumanProofPolicy(dir);
  if (!policy.ok) return { waived: false, code: policy.code };
  const reason = policy.waivers.get(kind);
  // For every kind with a source-of-truth approval mode (GATE_APPROVAL_MODE_KEYS --
  // today `push` and `feature-package-reconcile`), pipeline.user.yaml is the
  // operator-facing control and wins (ADR-0056; extended by the 2026-08-11
  // Follow-up). The two must not disagree: a policy-file waiver alongside
  // `signature` in the source is an ambiguous configuration, and an ambiguous gate
  // configuration fails closed. Every other kind (`deploy`, `publication`,
  // `release-preflight`, `governance-fork-disposition`) has no source key and skips
  // this branch entirely, exactly as before.
  const approvalModeKey = GATE_APPROVAL_MODE_KEYS[kind];
  if (approvalModeKey !== undefined) {
    const configured = readHumanApprovalMode(dir, { legacyKind: kind });
    if (configured.mode === "chat") {
      const hasTrustAnchor = policy.trustAnchor !== null || (Array.isArray(policy.trustAnchors) && policy.trustAnchors.length > 0);
      if (hasTrustAnchor && reason === undefined) {
        return { waived: false, code: "CRITICAL-PROOF-MODE-CONFLICT" };
      }
      return {
        waived: true,
        code: null,
        waiver: { kind, reason: reason ?? `gates.${approvalModeKey}: chat (${configured.source})`, mode: "chat", source: configured.source },
      };
    }
    // Fail closed unless the source genuinely has NO opinion. `default` is the only such
    // value -- no file at all, or a file without the key. Every other source (`unsafe`,
    // `invalid`, `unreadable`, `uncommitted`) means "could not be established", which is
    // the ambiguous configuration the paragraph above promises to refuse.
    //
    // This branch used to test `=== USER_SOURCE_PATH`, i.e. it enumerated the ONE source
    // that triggers a conflict. Adding `uncommitted` for C1 therefore opened a hole nobody
    // wrote on purpose: any state where the mode could not be read let a `.v2` push waiver
    // through, and `pipeline-state.mjs approve-push` then stopped demanding the detached
    // Ed25519 proof. Found by the T4 Critic. Enumerating the safe value instead of the
    // unsafe ones is what makes a future source value fail closed by default.
    if (reason !== undefined && configured.source !== "default") {
      return { waived: false, code: "CRITICAL-PROOF-MODE-CONFLICT" };
    }
  }
  return reason === undefined
    ? { waived: false, code: null }
    : { waived: true, code: null, waiver: { kind, reason } };
}

/**
 * Is `publicKeyPem` a WELL-FORMED key for a PO-approval proof? (SETUP-1.) "Well-formed"
 * is not "anything that parses" — it is specifically a structurally valid Ed25519 public
 * key: unparseable PEM, an RSA/EC/Ed448 key, or an empty value are all refused here. This
 * is the floor every signer must clear in BOTH postures below; in the absent-set posture
 * it is the ONLY floor, since there is no committed anchor to fall back on.
 */
export function isWellFormedEd25519PublicKey(publicKeyPem) {
  if (typeof publicKeyPem !== "string" || publicKeyPem.trim() === "") return false;
  try { return createPublicKey(publicKeyPem).asymmetricKeyType === "ed25519"; }
  catch { return false; }
}

/**
 * Verifies a recorded PO-approval proof against a trust-anchor SET — one parameterised
 * path for both postures (SETUP-1), rather than an "any key" branch and a "restricted"
 * branch that could drift apart:
 *
 *   - `anchors` empty (v3 with an absent/empty `trustAnchors`, the default posture) — "any
 *     well-formed key may sign". There is no committed identity to check the proof
 *     against, so the identity is read FROM the proof itself (which already carries the
 *     full public key and its own claimed `keyReference`) and the claim is verified
 *     cryptographically. Nothing here is unchecked: `isWellFormedEd25519PublicKey` gates
 *     the key, and the detached signature must still verify over `intent`.
 *   - `anchors` non-empty (v3 populated, or a v1/v2 single anchor wrapped as a set of one)
 *     — membership is enforced: the proof must match one of them, by BOTH `keyReference`
 *     and `publicKeySha256`, the same pair a lone anchor always compared. A key that is
 *     individually well-formed but not in the set is still refused.
 *
 * Returns the same shape `verifyPoApprovalProof` does, plus `signer` on success — the
 * `keyReference`/`publicKeySha256` pair SETUP-1 requires present in every accepting case,
 * independent of which posture accepted it. The human-supplied name travels separately
 * (`po-human-approval.mjs`'s signer record); this function only ever sees the key.
 */
export function verifyAgainstTrustAnchors({ intent, anchors, proof }) {
  if (!isWellFormedEd25519PublicKey(proof?.publicKey)) return { verified: false, code: "PO-APPROVAL-PROOF-INVALID" };
  const set = Array.isArray(anchors) ? anchors : [];
  if (set.length === 0) {
    const derived = {
      keyReference: proof.keyReference,
      publicKeySha256: createHash("sha256").update(proof.publicKey).digest("hex"),
    };
    const result = verifyPoApprovalProof({ intent, trustPolicy: derived, proof });
    return result.verified ? { ...result, signer: derived } : result;
  }
  let lastCode = "PO-APPROVAL-TRUST-MISMATCH";
  for (const anchor of set) {
    const result = verifyPoApprovalProof({ intent, trustPolicy: anchor, proof });
    if (result.verified) {
      return { ...result, signer: { keyReference: anchor.keyReference, publicKeySha256: anchor.publicKeySha256 } };
    }
    lastCode = result.code;
  }
  return { verified: false, code: lastCode };
}
