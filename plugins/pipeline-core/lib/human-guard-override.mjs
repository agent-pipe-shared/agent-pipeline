// SPDX-License-Identifier: SUL-1.0

import { createHash, createHmac, randomBytes } from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";
import {
  chmodSync,
  closeSync,
  constants,
  existsSync,
  fsyncSync,
  fstatSync,
  linkSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmdirSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { hostname, uptime } from "node:os";
import { observeWindowsProcessIdentity } from "./windows-process-identity.mjs";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";

import {
  CHAT_GATE_CONFIRMATION_MISMATCH,
  CHAT_GATE_NOT_ATTENDED,
  chatAttributionRecord,
  runRegisteredAttendedChatGateConfirmation,
} from "./chat-gate-ceremony.mjs";
import { parseGuardCommand } from "../hooks/guard-command-grammar.mjs";
import {
  confirmTrustAnchorKey,
  isRecognizedTrustAnchorKey,
  isWellFormedEd25519PublicKey,
  readCriticalHumanProofPolicy,
  readHumanApprovalMode,
  verifyAgainstTrustAnchors,
} from "./critical-human-proof-policy.mjs";
import { isNeverLiftableKernelPath } from "./guard-maintenance-window.mjs";
// Dependency-free string helpers ONLY (see git-cmd.mjs's own header). guard-push.mjs owns
// the normative `parsePushBinding()`, but that file is a HOOK with top-level side effects:
// importing it to reuse one function would run a guard as a side effect of loading this
// module. See pushRecoveryTarget() below for the bounded local equivalent.
import { commandIsGitPush, stripQuotedSegments, tokenizeArgv } from "./git-cmd.mjs";
import {
  buildGuardHandoffOfferEvent,
  GUARD_HANDOFF_JOURNAL_REFUSAL,
  GUARD_HANDOFF_OFFER_OMISSIONS,
  GUARD_HANDOFF_REDACTION_POLICY,
  recordGuardHandoffOffer,
} from "./guard-handoff-offer.mjs";
import { createPoApprovalIntent, verifyPoApprovalProof } from "./po-approval-proof.mjs";
// NVA-B-HGOCOPYSAFE-1: sourced from the shared renderer module rather than
// project-onboarding-v3.mjs directly -- boundedOpaqueCopyCommand is the same
// function (re-exported there, unchanged), so this file's bounded-rendering
// output stays byte-identical. Mirrors the identical adoption already landed
// in antigravity-pretool-guard.mjs (NVA-CF-BL19-COPYSAFEADOPT), and closes
// this file's status as the last direct project-onboarding-v3.mjs importer of
// this function named by backlog/items/2026-08-28-po-facing-commands-are-not-
// uniformly-rendered-break-safe.md's 2026-09-01 re-verification note.
import { boundedOpaqueCopyCommand } from "./copy-safe-command.mjs";
import {
  LEGACY_STATE,
  NEUTRAL_STATE,
  resolveProjectAuthorityPaths,
} from "./project-authority.mjs";
import {
  assessWindowsPrivatePath,
  hardenWindowsPrivateDirectory,
} from "./windows-private-state.mjs";
import { buildGovernanceHgoConsumptionSource } from "./governance-hgo-consumption-source.mjs";
import { PrivateBoundaryError, ensureAgentPipelineSegmentOf } from "./private-boundary.mjs";
import { inspectSignedDescriptorCustodyRepository } from "./worktree-lifecycle.mjs";
import { readSourceOwnedAuthorityContext, createSignedCleanupRequesterObserver } from "./session-requester-bridge.mjs";
import * as sessionAuthorityRegistry from "./session-authority-registry.mjs";

const SHA256 = /^[a-f0-9]{64}$/u;
const SAFE_ID = /^[A-Za-z0-9._-]{1,120}$/u;
const REQUEST_SCHEMA = "pipeline.human-guard-override-request.v3";
const PLAN_SCHEMA = "pipeline.human-guard-override-plan.v3";
const CAPABILITY_SCHEMA = "pipeline.human-guard-override-capability.v3";
// v5 adds `patchInput` (AC-264 point 1): the exact private tool input of an apply_patch denial,
// bound by toolInputSha256, so the patch can be dry-run before a signature is requested.
const NATIVE_REQUEST_SCHEMA = "pipeline.human-guard-override-request.v5";
const LEGACY_NATIVE_REQUEST_SCHEMA = "pipeline.human-guard-override-request.v4";
const isNativeRequestSchema = (schema) => schema === NATIVE_REQUEST_SCHEMA || schema === LEGACY_NATIVE_REQUEST_SCHEMA;
const NATIVE_PLAN_SCHEMA = "pipeline.human-guard-override-plan.v4";
const NATIVE_CAPABILITY_SCHEMA = "pipeline.human-guard-override-capability.v4";
export const HGO_NATIVE_TARGET_PREIMAGES_SCHEMA = "pipeline.hgo-native-target-preimages.v1";
const HGO_DISCLOSURE_INDEX_SCHEMA = "pipeline.hgo-disclosure-index.v1";
const AUDIT_SCHEMA = "pipeline.human-guard-override-audit.v1";
const AUDIT_HEAD_SCHEMA = "pipeline.human-guard-override-audit-head.v1";
const AUDIT_STATE_SCHEMA = "pipeline.human-guard-override-audit-state.v1";
const AUDIT_REPAIR_SCHEMA = "pipeline.human-guard-override-audit-repair.v1";
const AUDIT_REPAIR_PREIMAGE_SCHEMA = "pipeline.human-guard-override-audit-repair-preimage.v1";
const AUDIT_LOCK_SCHEMA = "pipeline.human-guard-override-audit-lock.v1";
const MAX_REASON_BYTES = 500;
const LIFECYCLE_NOT_READY_CODE = "GUARD-LIFECYCLE-NOT-READY";
// 30 minutes, not 5 (PO, 2026-08-08). The window is sized for a HUMAN, and the
// human step in the middle of it is: read the plan, recompute or read back the
// intent digest, switch to a second terminal, unlock a key, type a passphrase.
// At 5 minutes that flow only fits if nobody stops to check anything -- which
// defeats the confirmation the ceremony exists to obtain, and was measured twice
// on 2026-08-08 (two expired requests, one of them expiring while the PO was
// signing it). Lengthening this does not widen WHAT is authorized by one byte:
// the request stays bound to `toolInputSha256`, the plugin identity, the policy
// preimage and the repository observation -- head, tree AND `statusSha256` -- so
// any edit to the working tree, including the agent's own, still invalidates it
// immediately. The only thing that grows is how long a human may take to answer.
const DEFAULT_TTL_MS = 30 * 60_000;

// ---------------------------------------------------------------------------------
// Signed admission path (ADR-0059). A genuine, verified Ed25519 proof arms the
// identical v2 capability the chat-mode `activate: true` path already produces --
// there is no in-session "activate" step here, by the same principle ADR-0058
// (Guard Maintenance Window) already established: presence of a valid, correctly
// bound signature IS the authorization. The "reason" ceremony
// (`prepareHumanGuardOverrideAuthorization`) is reused byte-for-byte unchanged, with
// a FIXED, documented reason text standing in for a human-typed one -- the proof is
// what authorizes, the reason is only an audit label, and keeping it fixed makes the
// resulting `selectionSha256` (what actually gets bound into the signed intent)
// derivable by the PO from `requestSha256`/`planSha256` alone, without guessing this
// module's internals.
// ---------------------------------------------------------------------------------
export const HGO_SIGNATURE_REASON = "authorized via a detached PO Ed25519 signature (ADR-0059)";
const HGO_SIGNATURE_INTENT_KIND = "guard-override";
const HGO_SIGNATURE_INTENT_FEATURE_ID = "human-guard-override";
const HGO_SIGNATURE_INTENT_POLICY_REVISION = "human-guard-override-signature-v1";
const HGO_SIGNATURE_INTENT_DECISION = "authorize";

export class HumanGuardOverrideError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "HumanGuardOverrideError";
    this.code = code;
  }
}

function fail(code, message) {
  throw new HumanGuardOverrideError(code, message);
}

function object(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (object(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha(value) {
  return createHash("sha256").update(typeof value === "string" || Buffer.isBuffer(value)
    ? value
    : canonical(value)).digest("hex");
}

// Bash description is runner presentation only. Every other own input remains bound.
// Non-Bash tools retain their complete original input identity. Stored proofs are not migrated.
function toolInputIdentitySha256(toolName, toolInput) {
  const effective = toolName === "Bash" && object(toolInput) && Object.getPrototypeOf(toolInput) === Object.prototype
    ? Object.fromEntries(Object.entries(toolInput).filter(([name]) => name !== "description"))
    : toolInput;
  return sha(effective);
}

// `createPoApprovalIntent` requires a `planSha256`/`specSha256` pair (feature-plan
// authority, per lib/critical-action-approval-request.mjs and GMW's own CLI defaults).
// HGO's signed path is a general, project-wide mechanism, not scoped to one sprint's
// plan/spec documents the way GMW deliberately is -- so these are fixed, public,
// content-independent sentinel digests (of their own descriptive labels) rather than
// a hash of a specific file. They add no security value of their own: the real,
// unique binding is `subjectSha256` (== the request/plan/reason `selectionSha256`
// already computed by the byte-for-byte-unchanged `prepareHumanGuardOverrideAuthorization`)
// together with the live repository `candidate` below. Fixed values keep the intent
// fully reproducible offline by an external signer, with no repository file I/O.
const HGO_SIGNATURE_INTENT_PLAN_SHA256 = sha("pipeline.human-guard-override-signature-plan.v1");
const HGO_SIGNATURE_INTENT_SPEC_SHA256 = sha("pipeline.human-guard-override-signature-spec.v1");

function exactKeys(value, keys) {
  if (!object(value)) return false;
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function git(root, args, spawn = spawnSync) {
  const result = spawn("git", args, { cwd: root, encoding: "utf8", shell: false, timeout: 5000 });
  if (result?.status !== 0 || result?.error) {
    // The operation label is deliberately argv-only: it is enough to repair a
    // broken adapter/spawn boundary without disclosing repository data.
    const operation = args.map((value) => String(value).replace(/[^A-Za-z0-9._=-]/gu, "_")).join("-").slice(0, 120);
    const outcome = result?.error?.code ?? result?.error?.name
      ?? result?.signal ?? `exit-${String(result?.status)}`;
    fail("HGO-GIT", `repository identity is unavailable (operation=${operation}, outcome=${outcome})`);
  }
  return String(result.stdout ?? "").trim();
}

function physicalRoot(root) {
  const physical = realpathSync(resolve(root));
  const info = lstatSync(physical);
  if (!info.isDirectory() || info.isSymbolicLink()) fail("HGO-ROOT", "repository root is not physical");
  return physical;
}

function topology(root, spawn = spawnSync) {
  const physical = physicalRoot(root);
  const top = realpathSync(git(physical, ["rev-parse", "--show-toplevel"], spawn));
  if (top !== physical) fail("HGO-ROOT", "override root must be the physical repository top");
  const rawCommon = git(physical, ["rev-parse", "--path-format=absolute", "--git-common-dir"], spawn);
  const common = realpathSync(isAbsolute(rawCommon) ? rawCommon : resolve(physical, rawCommon));
  const info = lstatSync(common);
  if (!info.isDirectory() || info.isSymbolicLink()) fail("HGO-COMMON-DIR", "Git common directory is unsafe");
  return { root: physical, common };
}

/**
 * Read Git's already-created control layout without spawning Git.  This is
 * deliberately narrower than topology(): it exists only so a Codex PreTool
 * adapter which cannot spawn host Git can consume a capability for the one
 * global action that does not mutate the repository.  Normal HGO requests
 * continue to require Git's live HEAD/tree/status observation.
 */
function controlPathTopology(root) {
  const physical = physicalRoot(root);
  const control = join(physical, ".git");
  if (!existsSync(control)) fail("HGO-CONTROL", "Git control path is missing");
  const info = lstatSync(control);
  let gitDir;
  if (info.isDirectory() && !info.isSymbolicLink()) {
    gitDir = realpathSync(control);
  } else if (info.isFile() && !info.isSymbolicLink() && info.nlink === 1) {
    const match = readFileSync(control, "utf8").match(/^gitdir:\s*(.+?)\s*$/mu);
    if (!match || match[1].includes("\0")) fail("HGO-CONTROL", "Git control file is malformed");
    const candidate = resolve(physical, match[1]);
    const candidateInfo = lstatSync(candidate);
    if (!candidateInfo.isDirectory() || candidateInfo.isSymbolicLink()) {
      fail("HGO-CONTROL", "Git worktree control directory is unsafe");
    }
    gitDir = realpathSync(candidate);
  } else {
    fail("HGO-CONTROL", "Git control path is unsafe");
  }
  const commonFile = join(gitDir, "commondir");
  let common = gitDir;
  if (existsSync(commonFile)) {
    const commonInfo = lstatSync(commonFile);
    if (!commonInfo.isFile() || commonInfo.isSymbolicLink() || commonInfo.nlink !== 1) {
      fail("HGO-CONTROL", "Git common-dir declaration is unsafe");
    }
    const raw = readFileSync(commonFile, "utf8").trim();
    if (raw === "" || raw.includes("\0")) fail("HGO-CONTROL", "Git common-dir declaration is malformed");
    const candidate = resolve(gitDir, raw);
    const candidateInfo = lstatSync(candidate);
    if (!candidateInfo.isDirectory() || candidateInfo.isSymbolicLink()) {
      fail("HGO-CONTROL", "Git common directory is unsafe");
    }
    common = realpathSync(candidate);
  }
  return { root: physical, common };
}

// Reachability note (Critic finding F1, dispatch CRITIC-REMEDY-09; corrected
// by dispatch NVA-MKTHASH-2 -- see below, the claim this comment originally
// made is no longer true for one case and is restated accurately here): the
// separate local marketplace root ADR-0052 prescribes for local development
// carries, at ITS OWN `plugins/pipeline-core` entry, EITHER a symlink/junction
// pointing back at a checkout's real source directory (the original ADR-0052
// shape), OR, since dispatch NVA-MKTHASH-1, a real, non-symlinked directory
// COPY of that same source tree. Neither of those is `sourceRoot` below:
// `sourceRoot` is always `<repo.root>/plugins/pipeline-core` where
// `repo.root` is the checkout's own physical top-level (`physicalRoot()`
// above always resolves and rejects a symlinked result), and
// `localPluginInstallSourceObservation()` already requires that exact
// directory itself to be a real, non-symlinked entry before calling THIS
// function for the INTERNAL checkout's own attestation. The external
// local-marketplace root can never become `repo.root` either:
// `isPipelineSourceRoot()` also requires `harness/scripts/verify.mjs` to
// exist alongside it, which the local-marketplace root (containing only
// `.claude-plugin/marketplace.json` and its one `pipeline-core` entry) never
// has. So THIS function itself never walks the external root directly; the
// hard-fail on an internal symlink stays exactly as strict as before for the
// internal checkout's own tree -- it still fail-closes if a checkout's own
// source tree is tampered with to contain one. The external root is observed
// SEPARATELY, by `externalLocalMarketplaceObservation()` below (NVA-BL-20 /
// NVA-MKTHASH-1 / NVA-MKTHASH-2), and its reachability now differs by shape:
// for a symlink/junction entry it follows exactly that one link to verify
// where it points and never walks the tree behind it (unchanged since
// CRITIC-REMEDY-09); for a real, non-symlinked directory-copy entry it DOES
// walk that external tree -- exactly once, through the bounded
// `externalPluginSourceTreeSha256()` variant of this same walker defined
// below -- to compute its content hash for comparison against this
// checkout's own. So the external tree is walked in exactly one of the two
// accepted shapes, and this function's own unbounded call is still reached
// only from the internal checkout's own attestation.
// NVA-MKTHASH-2 (F3): `maxEntries`/`maxBytes` default to Infinity, which never
// trips -- so the ONE pre-existing caller (the internal checkout's own
// attestation above) is byte-for-byte unaffected: same visit order, same
// checks, same messages, same unbounded walk it always ran. Only a caller
// that supplies a finite bound (the external call site below,
// `externalPluginSourceTreeSha256()`) can ever observe the new
// "exceeds the bounded walk" failure.
function pluginSourceTreeSha256(sourceRoot, { maxEntries = Infinity, maxBytes = Infinity } = {}) {
  const entries = [];
  let entryCount = 0;
  let byteTotal = 0;
  const visit = (directory, prefix = "") => {
    const children = readdirSync(directory, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name));
    for (const child of children) {
      entryCount += 1;
      if (entryCount > maxEntries) fail("HGO-PLUGIN-SOURCE", "local plugin source exceeds the bounded walk");
      const relativePath = prefix === "" ? child.name : `${prefix}/${child.name}`;
      const absolutePath = join(directory, child.name);
      const info = lstatSync(absolutePath);
      if (info.isSymbolicLink()) fail("HGO-PLUGIN-SOURCE", "local plugin source contains a symbolic link");
      if (info.isDirectory()) {
        visit(absolutePath, relativePath);
        continue;
      }
      if (!info.isFile() || info.nlink !== 1 || realpathSync(absolutePath) !== absolutePath) {
        fail("HGO-PLUGIN-SOURCE", "local plugin source contains an unsafe entry");
      }
      byteTotal += info.size;
      if (byteTotal > maxBytes) fail("HGO-PLUGIN-SOURCE", "local plugin source exceeds the bounded walk");
      entries.push({ path: relativePath, sha256: sha(readFileSync(absolutePath)) });
    }
  };
  visit(sourceRoot);
  return sha(entries);
}

// NVA-MKTHASH-2 (F3/F4): the ONLY caller of `pluginSourceTreeSha256()` that
// walks a tree outside this checkout (`externalLocalMarketplaceObservation()`'s
// real-directory-copy branch, NVA-MKTHASH-1). The registry read that can lead
// here is already bounded (`EXTERNAL_REGISTRY_TIMEOUT_MS`/
// `EXTERNAL_REGISTRY_MAX_BYTES` below); this applies the same bounded-external-
// input posture to the recursive walk that answer can trigger, and re-fails any
// `HGO-PLUGIN-SOURCE` this walker raises (bound exceeded, a planted symlink, or
// an unsafe entry) as a distinct `HGO-EXTERNAL-MARKETPLACE` failure that names
// the external tree instead of reusing the internal-checkout wording -- an
// operator reading a fail-closed refusal on the override path should not have
// to guess whether it was their own checkout or the external marketplace root
// that failed. `pluginSourceTreeSha256()` itself, and its one internal caller,
// are otherwise unchanged (see the comment on the function above).
function externalPluginSourceTreeSha256(entryTarget) {
  try {
    return pluginSourceTreeSha256(entryTarget, {
      maxEntries: EXTERNAL_MARKETPLACE_WALK_MAX_ENTRIES,
      maxBytes: EXTERNAL_MARKETPLACE_WALK_MAX_BYTES,
    });
  } catch (error) {
    if (!(error instanceof HumanGuardOverrideError) || error.code !== "HGO-PLUGIN-SOURCE") throw error;
    if (error.message === "local plugin source exceeds the bounded walk") {
      fail("HGO-EXTERNAL-MARKETPLACE", "external local marketplace plugin entry exceeds the bounded walk");
    }
    if (error.message === "local plugin source contains a symbolic link") {
      fail("HGO-EXTERNAL-MARKETPLACE", "external local marketplace plugin entry contains a symbolic link");
    }
    fail("HGO-EXTERNAL-MARKETPLACE", "external local marketplace plugin entry contains an unsafe entry");
  }
}

// ---------------------------------------------------------------------------------
// NVA-BL-20: the one admitted command of this class, `codex plugin add
// pipeline-core@agent-pipeline-local`, does not install from this checkout
// directly. Per ADR-0052 it resolves through a SEPARATE marketplace root that
// lives outside every checkout and carries a symlink (native Windows: a
// directory junction) at its own `plugins/pipeline-core` pointing back at a
// checkout's real source tree. Hashing only this checkout (above) therefore
// attested the wrong thing for this command class: an external root that is
// repointed or mutated between attestation and use was entirely outside what
// was observed.
//
// The locator is Codex's own marketplace registry, read through the host CLI in
// the same shape `lib/codex-host-plugin-list.mjs` reads the plugin registry:
// `codex plugin marketplace list --json` answers `{ "marketplaces": [ { "name":
// ..., "root": ..., "marketplaceSource": { "sourceType": ..., "source": ... } }
// ] }`. Registry entries carry no fixed key set -- a curated built-in entry
// records no `marketplaceSource` at all -- so only the fields relied on here are
// validated and unknown fields are ignored.
//
// `marketplaceSource.source`, NOT `root`, is the located directory: for a
// git-sourced marketplace `root` is a Codex-managed cache copy, whereas the
// in-place local topology is the one this repository's own preflight already
// asserts, `resolve(marketplaceSource.source, "plugins", "pipeline-core")` ===
// the installed plugin source path (scripts/pipeline-start-preflight.mjs).
//
// The registry answer is a LOCATOR ONLY and is never itself evidence: the proof
// is the filesystem verification below. A wrong or hostile answer can therefore
// only fail this observation closed, or hide a root -- and a hidden root is
// recorded as the typed `unobserved` state, which is folded into `statusSha256`
// like any other, so a later transition to `verified` (or to a different root)
// invalidates the request, the plan and any armed capability through the
// existing HGO-DRIFT comparison rather than passing unnoticed.
// ---------------------------------------------------------------------------------
const EXTERNAL_LOCAL_MARKETPLACE_NAME = "agent-pipeline-local";
const EXTERNAL_REGISTRY_TIMEOUT_MS = 5_000;
const EXTERNAL_REGISTRY_MAX_BYTES = 64 * 1024;
// NVA-MKTHASH-2 (F3): the registry read above is bounded (timeout + max
// bytes); the recursive walk a registry answer naming a real directory-copy
// entry can trigger (`externalPluginSourceTreeSha256()`, over `entryTarget`)
// was not, unlike the registry read itself. Sized against this checkout's own
// plugin-source tree (856 files / ~12.3 MiB, measured 2026-08-17) with
// roughly 5x/10x headroom for ordinary growth, so an honest deployment never
// trips them while a hostile or runaway external root still fails closed
// instead of reading indefinitely.
const EXTERNAL_MARKETPLACE_WALK_MAX_ENTRIES = 5_000;
const EXTERNAL_MARKETPLACE_WALK_MAX_BYTES = 128 * 1024 * 1024;

function codexMarketplaceRegistry(spawn) {
  let result;
  try {
    result = spawn("codex", ["plugin", "marketplace", "list", "--json"], {
      encoding: "utf8",
      // A closed environment, exactly like codex-host-plugin-list.mjs. PATH is
      // the one inherited value: the executable is looked up by name, the same
      // way this module already spawns `git`.
      env: {
        GIT_TERMINAL_PROMPT: "0",
        LANG: "C",
        LC_ALL: "C",
        NO_COLOR: "1",
        PATH: typeof process.env.PATH === "string" ? process.env.PATH : "",
      },
      maxBuffer: 2 * EXTERNAL_REGISTRY_MAX_BYTES,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      timeout: EXTERNAL_REGISTRY_TIMEOUT_MS,
    });
  } catch { return null; }
  if (!object(result)
    || result.status !== 0
    || (result.error !== undefined && result.error !== null)
    || (result.signal !== undefined && result.signal !== null)
    || typeof result.stdout !== "string") return null;
  const bytes = Buffer.byteLength(result.stdout, "utf8");
  if (bytes === 0 || bytes > EXTERNAL_REGISTRY_MAX_BYTES) return null;
  try { return JSON.parse(result.stdout); } catch { return null; }
}

function localAbsolutePath(value) {
  return typeof value === "string"
    && value.length > 0
    && !value.includes("\0")
    && isAbsolute(value)
    && resolve(value) === value;
}

function externalStat(path, message) {
  try { return lstatSync(path); }
  catch { return fail("HGO-EXTERNAL-MARKETPLACE", message); }
}

function externalRealpath(path, message) {
  try { return realpathSync(path); }
  catch { return fail("HGO-EXTERNAL-MARKETPLACE", message); }
}

/** Locate the registered external root, or null when the registry names none. */
function externalLocalMarketplaceLocation(registry) {
  if (!object(registry) || !Array.isArray(registry.marketplaces)) return null;
  const named = registry.marketplaces.filter((entry) =>
    object(entry) && entry.name === EXTERNAL_LOCAL_MARKETPLACE_NAME);
  if (named.length === 0) return null;
  // Two registrations under the reserved name are an ambiguous authority, never
  // a preference for either -- the same posture codex-host-plugin-list.mjs takes
  // for a doubly enabled plugin identity.
  if (named.length > 1) {
    fail("HGO-EXTERNAL-MARKETPLACE", "external local marketplace registration is ambiguous");
  }
  const source = named[0].marketplaceSource;
  // An entry that records no source locates nothing. That is an ABSENT
  // observation, not a mismatch: nothing has been contradicted yet.
  if (!object(source)) return null;
  // ADR-0052 reserves this name for the local development root. Serving it from
  // anywhere else means the admitted install does not resolve into any local
  // checkout, which is a contradiction, not an absence.
  if (source.sourceType !== "local") {
    fail("HGO-EXTERNAL-MARKETPLACE", "external local marketplace is not registered from a local source");
  }
  if (!localAbsolutePath(source.source)) {
    fail("HGO-EXTERNAL-MARKETPLACE", "external local marketplace source path is unsafe");
  }
  return source.source;
}

function externalLocalMarketplaceObservation(repo, {
  registryReader = codexMarketplaceRegistry,
  spawn = spawnSync,
  // NVA-MKTHASH-1: this checkout's OWN pluginSourceTreeSha256(sourceRoot),
  // threaded in by the one caller (localPluginInstallSourceObservation, which
  // already computes it for statusSha256's own preimage) rather than
  // recomputed here from a second code path. A direct caller that omits it
  // (e.g. every existing link-shaped test in this suite) gets `null`, which
  // can never equal a real hash -- so the new real-directory acceptance path
  // below fails closed by default instead of silently trusting an unverified
  // comparison value.
  checkoutTreeSha256 = null,
} = {}) {
  const registry = registryReader(spawn);
  // A registry that is unreadable, or that does not answer in the documented
  // shape, observes nothing. It is never treated as "no local marketplace".
  if (!object(registry) || !Array.isArray(registry.marketplaces)) {
    return { state: "unobserved", reason: "registry-unavailable" };
  }
  const located = externalLocalMarketplaceLocation(registry);
  if (located === null) return { state: "unobserved", reason: "not-registered" };
  const rootInfo = externalStat(located, "external local marketplace root is unavailable");
  if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink()
    || externalRealpath(located, "external local marketplace root is unavailable") !== located) {
    fail("HGO-EXTERNAL-MARKETPLACE", "external local marketplace root is unsafe");
  }
  const manifestPath = join(located, ".claude-plugin", "marketplace.json");
  const manifestInfo = externalStat(manifestPath, "external local marketplace declaration is unavailable");
  if (!manifestInfo.isFile() || manifestInfo.isSymbolicLink() || manifestInfo.nlink !== 1
    || externalRealpath(manifestPath, "external local marketplace declaration is unavailable") !== manifestPath) {
    fail("HGO-EXTERNAL-MARKETPLACE", "external local marketplace declaration is unsafe");
  }
  let manifest;
  try { manifest = JSON.parse(readFileSync(manifestPath, "utf8")); }
  catch { fail("HGO-EXTERNAL-MARKETPLACE", "external local marketplace declaration is malformed"); }
  const binds = manifest?.name === EXTERNAL_LOCAL_MARKETPLACE_NAME
    && Array.isArray(manifest?.plugins)
    && manifest.plugins.some((entry) => entry?.name === "pipeline-core" && entry?.source === "./plugins/pipeline-core");
  if (!binds) fail("HGO-EXTERNAL-MARKETPLACE", "external local marketplace does not bind pipeline-core");
  const pluginsDirectory = join(located, "plugins");
  const pluginsInfo = externalStat(pluginsDirectory, "external local marketplace plugins directory is unavailable");
  if (!pluginsInfo.isDirectory() || pluginsInfo.isSymbolicLink()
    || externalRealpath(pluginsDirectory, "external local marketplace plugins directory is unavailable") !== pluginsDirectory) {
    fail("HGO-EXTERNAL-MARKETPLACE", "external local marketplace plugins directory is unsafe");
  }
  // This entry is legitimately EITHER a symlink/directory junction (followed
  // instead of refused; pluginSourceTreeSha256 above still hard-fails on any
  // symlink inside the tree it walks) OR, since NVA-MKTHASH-1, a real,
  // non-symlinked directory copy. For the symlink/junction case, where this
  // entry points IS the question, so it is resolved and required to be
  // exactly this checkout's own plugin source root -- already content-hashed
  // above by `pluginTreeSha256`, so THAT case never walks the external tree at
  // all (corrected per Critic finding F1, dispatch NVA-MKTHASH-2 -- this
  // comment previously claimed that of both cases, which stopped being true
  // once the real-directory-copy branch below started walking the external
  // tree via the bounded `externalPluginSourceTreeSha256()`).
  const entryPath = join(pluginsDirectory, "pipeline-core");
  const entryInfo = externalStat(entryPath, "external local marketplace plugin entry is unavailable");
  const entryTarget = externalRealpath(entryPath, "external local marketplace plugin entry does not resolve");
  if (entryTarget === join(repo.root, "plugins", "pipeline-core")) {
    const targetInfo = externalStat(entryTarget, "external local marketplace plugin entry is unavailable");
    if (!targetInfo.isDirectory()) {
      fail("HGO-EXTERNAL-MARKETPLACE", "external local marketplace plugin entry is not a directory");
    }
    return {
      state: "verified",
      rootSha256: sha(located),
      manifestSha256: sha(readFileSync(manifestPath)),
      entryKind: entryInfo.isSymbolicLink() ? "link" : "directory",
    };
  }
  // NVA-MKTHASH-1: a real, non-symlinked directory here can never resolve to
  // this checkout's own path above (a different filesystem location) -- that
  // is exactly the deliberate, PO-confirmed rsync-copy deployment shape the
  // symlink-only check above fails closed on today. Accept it ONLY when its
  // full content hash, computed by the SAME walker used for this checkout's
  // own attestation (pluginSourceTreeSha256, applied here through the bounded
  // `externalPluginSourceTreeSha256()` variant added by NVA-MKTHASH-2 -- so
  // an internal symlink planted inside the copy still hard-fails exactly as
  // it would for the internal checkout, now surfaced as a distinct
  // HGO-EXTERNAL-MARKETPLACE failure naming the external tree, and a
  // pathologically large or hostile copy fails closed on the walk bound
  // instead of reading indefinitely), is EXACTLY equal to the checkout's own
  // hash. Any divergence -- stale, tampered, unrelated, or partially synced --
  // falls through to the same fail-closed posture as a non-resolving symlink,
  // just with a message that names the actual failure mode (content mismatch,
  // not resolution failure) instead of reusing the symlink-resolution message
  // for an unrelated cause.
  if (!entryInfo.isSymbolicLink() && entryInfo.isDirectory()) {
    const copyTreeSha256 = externalPluginSourceTreeSha256(entryTarget);
    if (checkoutTreeSha256 !== null && copyTreeSha256 === checkoutTreeSha256) {
      return {
        state: "verified",
        rootSha256: sha(located),
        manifestSha256: sha(readFileSync(manifestPath)),
        entryKind: "directory-copy",
      };
    }
    fail("HGO-EXTERNAL-MARKETPLACE", "external local marketplace plugin entry content does not match this checkout");
  }
  fail("HGO-EXTERNAL-MARKETPLACE", "external local marketplace does not resolve to this checkout");
}

// NVA-BL-20 F5: `options` is forwarded verbatim to
// `externalLocalMarketplaceObservation()`, whose `spawn` option runs the `codex` CLI --
// NOT the `git` binary. The three exported entry points therefore carry a second,
// separately named `codexSpawn` parameter for it and pass it as `{ spawn: codexSpawn }`
// here. Their existing `spawn` parameter is the host-Git topology adapter and stays
// bound to `topology()`/`repositoryObservation()`: the suite's global-plugin-install
// fixtures deliberately stub git-unavailable at some stages while relying on the real
// `spawnSync` at others, so one parameter serving both roles cannot express them.
function localPluginInstallSourceObservation(repo, options = {}) {
  if (!isPipelineSourceRoot(repo.root)) fail("HGO-PLUGIN-SOURCE", "repository is not a Pipeline plugin source checkout");
  const marketplace = join(repo.root, ".claude-plugin", "marketplace.json");
  const sourceRoot = join(repo.root, "plugins", "pipeline-core");
  const manifest = join(sourceRoot, ".codex-plugin", "plugin.json");
  const sourceInfo = lstatSync(sourceRoot);
  if (!sourceInfo.isDirectory() || sourceInfo.isSymbolicLink() || realpathSync(sourceRoot) !== sourceRoot) {
    fail("HGO-PLUGIN-SOURCE", "local plugin source directory is unsafe");
  }
  for (const path of [marketplace, manifest]) {
    const info = lstatSync(path);
    if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1 || realpathSync(path) !== path) {
      fail("HGO-PLUGIN-SOURCE", "local plugin source file is unsafe");
    }
  }
  let marketplaceValue;
  try { marketplaceValue = JSON.parse(readFileSync(marketplace, "utf8")); }
  catch { fail("HGO-PLUGIN-SOURCE", "local marketplace declaration is malformed"); }
  // ADR-0052: this checkout's OWN `.claude-plugin/marketplace.json` self-names
  // the published identity `agent-pipeline`, never `agent-pipeline-local` --
  // that name is reserved for the separate, external local-marketplace root
  // the ADR mandates, which is deliberately not a committed path this
  // function can discover or inspect. This check therefore attests that the
  // checkout's own manifest is intact and still declares the exact
  // `pipeline-core` -> `./plugins/pipeline-core` binding, not that it IS the
  // local marketplace consulted by `codex plugin add
  // pipeline-core@agent-pipeline-local` (the tree hash below is the actual
  // content attestation; this is the checkout-identity attestation).
  const registered = marketplaceValue?.name === "agent-pipeline"
    && Array.isArray(marketplaceValue?.plugins)
    && marketplaceValue.plugins.some((entry) => entry?.name === "pipeline-core" && entry?.source === "./plugins/pipeline-core");
  if (!registered) fail("HGO-PLUGIN-SOURCE", "local marketplace does not bind pipeline-core");
  // NVA-MKTHASH-1: computed HERE, once, so it can be threaded into
  // externalLocalMarketplaceObservation() below as the exact comparison value
  // for a real, non-symlinked directory-copy entry -- the SAME hash
  // statusSha256's own preimage folds in a few lines down, never a second,
  // independently recomputed value from a different code path.
  const pluginTreeSha256 = pluginSourceTreeSha256(sourceRoot);
  // NVA-BL-20: the external root the admitted command actually resolves
  // through, folded into the SAME attestation hash -- so a repointed or mutated
  // external root, and equally a transition into or out of the typed
  // `unobserved` state, invalidates the request/plan/capability chain that
  // `statusSha256` binds.
  const externalMarketplace = externalLocalMarketplaceObservation(repo, { ...options, checkoutTreeSha256: pluginTreeSha256 });
  return {
    fingerprintSha256: sha({ physicalRoot: repo.root, physicalCommon: repo.common }),
    head: null,
    tree: null,
    // The observation itself, not only its hash. `statusSha256` below folds this
    // exact object in, but a caller or operator reading the attestation could
    // not tell WHICH branch applied -- verified, or which typed `unobserved`
    // reason -- without recomputing the hash against every candidate. Exposing
    // it costs nothing (it is the same value, hashes and typed tokens only, no
    // filesystem path) and is what makes a `not-registered` observation legible
    // in a request/plan/capability record instead of an opaque digest change.
    // Adding this key changes `canonical(repository)`, so any capability armed
    // before this change now fails the existing HGO-DRIFT comparison and is
    // replanned -- fail-closed, and the intended one-time transition.
    externalMarketplace,
    statusSha256: sha({
      kind: "local-plugin-install-source.v2",
      marketplaceSha256: sha(readFileSync(marketplace)),
      manifestSha256: sha(readFileSync(manifest)),
      pluginTreeSha256,
      externalMarketplace,
    }),
  };
}

function isPipelineSourceRoot(root) {
  return existsSync(join(root, "plugins", "pipeline-core", ".codex-plugin", "plugin.json"))
    && existsSync(join(root, "harness", "scripts", "verify.mjs"));
}

function secureDirectory(path, {
  platform = process.platform,
  assessWindowsPrivatePathFn = assessWindowsPrivatePath,
  hardenWindowsPrivateDirectoryFn = hardenWindowsPrivateDirectory,
} = {}) {
  // WIN-AP-S6 (Ruling 162): the repository-private `agent-pipeline` segment of `path` is created, repaired in
  // place or refused by the one hardened entry point BEFORE anything below it is touched, so the walk below
  // only ever sees a segment that already ended private. The injected platform and Windows probes are passed
  // through; the entry point's typed refusals are mapped onto this function's own closed error vocabulary.
  try {
    ensureAgentPipelineSegmentOf(path, {
      platform,
      assess: assessWindowsPrivatePathFn,
      harden: hardenWindowsPrivateDirectoryFn,
    });
  } catch (error) {
    if (!(error instanceof PrivateBoundaryError)) throw error;
    if (error.code === "PB-WINDOWS-ASSURANCE") fail("HGO-DACL", "override directory DACL is not owner-private");
    if (error.code === "PB-ROOT-INSECURE") fail("HGO-PERMISSIONS", "override directory is not owner-private");
    fail("HGO-STORAGE", "override directory is unsafe");
  }
  // `mkdirSync(path, { recursive: true })` can silently create several missing
  // intermediate components in one call (e.g. a shared `.../agent-pipeline/`
  // parent AND its child in one shot). Walking and hardening only the final
  // `path` therefore left a newly-created SHARED intermediate with the
  // default inherited Windows ACL -- live-reproduced, NVA-PAWINACL-2. Record
  // BEFORE creating anything which components are missing, from `path`
  // upward to the nearest existing ancestor, so every one of them gets the
  // same harden/assess treatment the original code only gave the leaf --
  // mirroring the walk `ensurePhysicalPrivateDirectory()`
  // (po-gate-profile-publisher.mjs) already does for the identical problem,
  // adapted to this function's own dependency-injection signature.
  const missing = [];
  let cursor = path;
  while (!existsSync(cursor)) {
    missing.unshift(cursor);
    const parent = dirname(cursor);
    if (parent === cursor) break; // filesystem root guard, defensive only
    cursor = parent;
  }

  mkdirSync(path, { recursive: true, mode: 0o700 });

  // Every component in `missing` was, by construction, absent before the
  // mkdirSync above and is therefore newly created by it. If nothing was
  // missing, `path` itself already existed -- the original single-path
  // behavior for that case.
  const walk = missing.length > 0
    ? missing.map((component) => ({ component, created: true }))
    : [{ component: path, created: false }];

  for (const { component, created } of walk) {
    const info = lstatSync(component);
    if (!info.isDirectory() || info.isSymbolicLink()) {
      fail("HGO-STORAGE", "override directory is unsafe");
    }
    if (platform === "win32") {
      const assurance = created
        ? hardenWindowsPrivateDirectoryFn(component)
        : assessWindowsPrivatePathFn(component);
      if (assurance.status !== "secure") fail("HGO-DACL", "override directory DACL is not owner-private");
    } else if ((info.mode & 0o077) !== 0) {
      try { chmodSync(component, 0o700); } catch {}
      if ((lstatSync(component).mode & 0o077) !== 0) fail("HGO-PERMISSIONS", "override directory is not owner-private");
    }
  }
  return path;
}

function storage(common) {
  const base = secureDirectory(join(common, "agent-pipeline", "human-guard-overrides"));
  return {
    base,
    requests: secureDirectory(join(base, "requests")),
    // Part A (design doc §1.4 step 1): the persisted plan snapshot, one file per
    // (requestSha256, authorSourceRoot) pair, written with the identical
    // writeExclusive/writeAtomic discipline `requests`/`capabilities` already use.
    plans: secureDirectory(join(base, "plans")),
    capabilities: secureDirectory(join(base, "capabilities")),
    briefedAuthorizations: secureDirectory(join(base, "briefed-authorizations")),
    locks: secureDirectory(join(base, "locks")),
    key: join(base, "audit.key"),
    audit: join(base, "audit.jsonl"),
    auditHead: join(base, "audit.head.json"),
    auditLock: join(base, "audit.lock"),
    auditLockRecovery: join(base, "audit.lock.recover"),
    // R-AC-08: the command-offer journal is a SEPARATE file in the same private
    // directory, never a member of the HMAC-chained override ledger above.
    commandOffers: join(base, "command-offers.jsonl"),
  };
}

function safePrivateFile(path, {
  absent = false,
  platform = process.platform,
  assessWindowsPrivatePathFn = assessWindowsPrivatePath,
} = {}) {
  if (!existsSync(path)) {
    if (absent) return null;
    fail("HGO-STORAGE", "required override file is missing");
  }
  const info = lstatSync(path);
  if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1) fail("HGO-STORAGE", "override file is unsafe");
  if (platform === "win32") {
    if (assessWindowsPrivatePathFn(path).status !== "secure") {
      fail("HGO-DACL", "override file DACL is not owner-private");
    }
  } else if ((info.mode & 0o077) !== 0) fail("HGO-PERMISSIONS", "override file is not owner-private");
  return info;
}

function writeExclusive(path, bytes) {
  const fd = openSync(path, "wx", 0o600);
  try { writeFileSync(fd, bytes); }
  finally { closeSync(fd); }
  safePrivateFile(path);
}

function writeAtomic(path, bytes) {
  const tmp = `${path}.${process.pid}.${randomBytes(8).toString("hex")}.tmp`;
  try {
    writeExclusive(tmp, bytes);
    renameSync(tmp, path);
    safePrivateFile(path);
  } finally {
    try { unlinkSync(tmp); } catch {}
  }
}

function readJson(path) {
  safePrivateFile(path);
  let value;
  try { value = JSON.parse(readFileSync(path, "utf8")); }
  catch { fail("HGO-STORAGE", "override file is malformed"); }
  return value;
}

function pluginIdentity(pluginRoot, provider = "codex") {
  if (provider !== "codex" && provider !== "antigravity") {
    fail("HGO-PLUGIN", "loaded plugin provider is invalid");
  }
  const root = physicalRoot(pluginRoot);
  const manifestPath = join(root, ".codex-plugin", "plugin.json");
  const agyManifestPath = join(root, "plugin.json");
  const adapterPath = join(root, "hooks", "codex-pretool-guard.mjs");
  const grammarPath = join(root, "hooks", "guard-command-grammar.mjs");
  const policyPath = join(root, "lib", "human-guard-override.mjs");
  const windowsPrivatePath = join(root, "lib", "windows-private-state.mjs");
  const cliPath = join(root, "scripts", "guard-human-override.mjs");
  for (const path of [
    manifestPath,
    agyManifestPath,
    adapterPath,
    grammarPath,
    policyPath,
    windowsPrivatePath,
    cliPath,
  ]) {
    if (!existsSync(path)) continue;
    const info = lstatSync(path);
    if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1 || realpathSync(path) !== path) {
      fail("HGO-PLUGIN", "loaded plugin file identity is unsafe");
    }
  }
  let manifest;
  const activeManifestPath = provider === "antigravity"
    ? (existsSync(agyManifestPath) ? agyManifestPath : null)
    : (existsSync(manifestPath) ? manifestPath : (existsSync(agyManifestPath) ? agyManifestPath : null));
  if (!activeManifestPath) fail("HGO-PLUGIN", "loaded plugin manifest is missing");
  try { manifest = JSON.parse(readFileSync(activeManifestPath, "utf8")); }
  catch { fail("HGO-PLUGIN", "loaded plugin manifest is malformed"); }
  if ((provider === "antigravity" && manifest?.name !== "agent-pipeline-core")
    || (provider === "codex" && manifest?.name !== "pipeline-core" && manifest?.name !== "agent-pipeline-core")
    || (provider === "antigravity" && (typeof manifest.version !== "string" || manifest.version.trim() === ""))
    || (provider === "codex" && typeof manifest.version !== "string" && !existsSync(agyManifestPath))) {
    fail("HGO-PLUGIN", "loaded plugin identity is invalid");
  }
  return {
    ...(provider === "antigravity" ? { provider } : {}),
    root,
    name: manifest.name,
    version: manifest.version || "0.0.0",
    manifestSha256: sha(readFileSync(activeManifestPath)),
    adapterSha256: sha(readFileSync(adapterPath)),
    grammarSha256: sha(readFileSync(grammarPath)),
    policySha256: sha(readFileSync(policyPath)),
    windowsPrivateSha256: sha(readFileSync(windowsPrivatePath)),
    cliSha256: sha(readFileSync(cliPath)),
  };
}

function boundPluginProvider(plugin) {
  if (plugin?.provider === undefined) return "codex";
  if (plugin.provider === "antigravity") return "antigravity";
  fail("HGO-PLUGIN", "bound plugin provider is invalid");
}

function policyIdentity(root, pluginRoot, denials) {
  const hooksRoot = join(pluginRoot, "hooks");
  const guards = [...new Set(denials.map(({ guard }) => String(guard)))].sort().map((guard) => {
    const path = SAFE_ID.test(guard) ? join(hooksRoot, guard) : null;
    if (path === null || !existsSync(path)) return { guard, implementationSha256: null };
    const info = lstatSync(path);
    if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1 || realpathSync(path) !== path) {
      fail("HGO-PLUGIN", "guard implementation identity is unsafe");
    }
    return { guard, implementationSha256: sha(readFileSync(path)) };
  });
  const project = [
    ".claude/settings.json",
    ".claude/guard-config.json",
    ".claude/pipeline.json",
    "project/guard-config.json",
    "project/pipeline.json",
    ".agents/hooks.json",
    ".claude/pipeline.yaml",
    "project/pipeline.yaml",
  ].map((path) => {
    const absolute = join(root, path);
    if (!existsSync(absolute)) return { path, status: "absent", sha256: null };
    const info = lstatSync(absolute);
    if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1 || realpathSync(absolute) !== absolute) {
      fail("HGO-POLICY", "project guard policy identity is unsafe");
    }
    return { path, status: "present", sha256: sha(readFileSync(absolute)) };
  });
  return { guards, project };
}

function stateObservation(root) {
  let authority = null;
  try { authority = resolveProjectAuthorityPaths({ rootDir: root }); } catch {}
  const stateRelPath = authority?.status === "ready"
    ? authority.state
    : (existsSync(join(root, NEUTRAL_STATE)) ? NEUTRAL_STATE : LEGACY_STATE);
  const path = join(root, stateRelPath);
  if (!existsSync(path)) {
    return { status: "absent", path: stateRelPath, sha256: null, continuityRevision: null };
  }
  const info = lstatSync(path);
  if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1 || realpathSync(path) !== path) {
    fail("HGO-STATE", "Pipeline State identity is unsafe");
  }
  const bytes = readFileSync(path);
  let value;
  try { value = JSON.parse(bytes); } catch {
    return { status: "malformed", path: stateRelPath, sha256: sha(bytes), continuityRevision: null };
  }
  const revision = value?.continuity?.revision ?? null;
  if (revision !== null && (!Number.isSafeInteger(revision) || revision < 0)) {
    return { status: "invalid", path: stateRelPath, sha256: sha(bytes), continuityRevision: null };
  }
  return { status: "present", path: stateRelPath, sha256: sha(bytes), continuityRevision: revision };
}

// NVA-HGOHEAD-1: git's own well-known empty-tree object id. A freshly `git init`-ed
// repository with zero commits ("unborn HEAD") is a normal, expected git state, not
// a broken adapter -- but `git rev-parse HEAD` fails on it (exit 128) the exact same
// generic way it fails on a genuinely broken repository, so git()'s uniform HGO-GIT
// handling cannot tell the two apart by itself. This constant, together with a
// defined `head: null` sentinel below, gives the unborn state a fixed, reproducible
// observation instead of an uncaught crash.
const UNBORN_TREE_OID = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";

// `git symbolic-ref -q HEAD` succeeding (HEAD is attached to a branch ref) together
// with `git rev-parse --verify -q HEAD` failing (that branch resolves to no object
// yet) is git's own, locale-independent, exit-code-only signal for "unborn branch" --
// deliberately not a match against `git rev-parse HEAD`'s human-readable stderr text,
// which is fragile across git versions/locales and has no precedent anywhere else in
// this file (every other branch here reads `result.status`/`result.error`, never
// stderr content). A detached HEAD, or a genuinely missing/corrupt HEAD, both fail
// `symbolic-ref -q HEAD` too and so still fall through to the original crash path
// below, unchanged.
function isUnbornBranch(root, spawn) {
  const symbolic = spawn("git", ["symbolic-ref", "-q", "HEAD"], { cwd: root, encoding: "utf8", shell: false, timeout: 5000 });
  if (symbolic?.status !== 0 || symbolic?.error) return false;
  const verify = spawn("git", ["rev-parse", "--verify", "-q", "HEAD"], { cwd: root, encoding: "utf8", shell: false, timeout: 5000 });
  return verify?.status !== 0 || Boolean(verify?.error);
}

// PHX merge: governance/events/** writes must not count as working-tree drift for the
// override's statusSha256 binding (see repositoryObservation() below) -- kept alongside
// isUnbornBranch() above, an orthogonal Nova-side fix; both apply to the same observation.
function filterGovernanceEventsStatus(statusOutput) {
  if (typeof statusOutput !== "string") return "";
  return statusOutput
    .split("\n")
    .filter((line) => {
      if (line.length < 4) return false;
      const rawPath = line.slice(3).trim();
      const normalizedPath = rawPath.split("\\").join("/");
      return !normalizedPath.startsWith("governance/events/") && normalizedPath !== "governance/events";
    })
    .join("\n");
}

function repositoryObservation(root, spawn = spawnSync) {
  const common = git(root, ["rev-parse", "--path-format=absolute", "--git-common-dir"], spawn);
  const physicalCommon = realpathSync(isAbsolute(common) ? common : resolve(root, common));
  const unborn = isUnbornBranch(root, spawn);
  const rawStatus = git(root, ["status", "--porcelain=v1", "--untracked-files=all"], spawn);
  return {
    fingerprintSha256: sha({ physicalRoot: realpathSync(root), physicalCommon }),
    head: unborn ? null : git(root, ["rev-parse", "HEAD"], spawn),
    tree: unborn ? UNBORN_TREE_OID : git(root, ["rev-parse", "HEAD^{tree}"], spawn),
    statusSha256: sha(filterGovernanceEventsStatus(rawStatus)),
    state: stateObservation(root),
  };
}

// NVA-HGOFIX-1 (sibling fix ba562481 for po-human-approval.mjs's outside()): rewriting
// backslashes to forward slashes is a WIN32-ONLY concern -- there, node:path returns
// backslash-separated output. On POSIX a backslash is an ORDINARY filename character,
// never a path separator, so applying the rewrite unconditionally turned a legal
// single-component name like `..\keys` into `../keys` and made an in-root path read as an
// escape from root -- in both directions that matter: safePath() then REFUSED a legitimate
// in-root path (fail-closed), and crossBoundaryTarget(), whose escape test is the only gate
// into the cross-repository-target class, ACCEPTED the same in-root path as an out-of-root
// target (fail-open), skipping the in-root symlink-safety walk and the relative-path
// hardBoundaryPath() refusal that class deliberately never runs.
// NVA-HGOFIX-2: platform is injected (default process.platform), mirroring the file's own
// secureDirectory()/safePrivateFile() idiom, so the win32 branch of this security-relevant
// normalization is provable from a POSIX host instead of only reachable on a real win32 one.
const separatorNormalized = (value, { platform = process.platform } = {}) => (platform === "win32" ? value.split("\\").join("/") : value);

/**
 * Part A step 3 (design doc §1.4): the ONLY repository-adjacent re-check left at
 * arm time, deliberately narrowed to what genuinely cannot wait for the persisted
 * plan to be trusted as-is -- the calling repository's physical fingerprint (3a),
 * the project's guard/policy configuration (3b), and, restored per Critic round 1
 * Finding 2 / ADR-0058's "recursive-verifier hole" concern, the override
 * machinery's OWN code identity (3c, HGO-PLUGIN-DRIFT -- deliberately not the
 * reused HGO-DRIFT, so an audit reader can tell a machinery-tamper refusal apart
 * from a repository-freshness refusal). Returns the one fresh repository
 * observation taken for 3a so the caller can bind `capabilityCore.repository` to
 * what was actually live at arm time, not the plan-frozen snapshot -- exactly
 * GMW's own precedent for `openingTreeSha256` (guard-maintenance-window.mjs
 * :530-532).
 */
function armTimeFreshnessCheck({ repo, pluginRoot, planned, spawn }) {
  const isLocalPluginInstall = planned.mode === "global-plugin-install";
  const repository = isLocalPluginInstall
    ? localPluginInstallSourceObservation(repo)
    : repositoryObservation(repo.root, spawn);
  if (repository.fingerprintSha256 !== planned.repository.fingerprintSha256) {
    fail("HGO-DRIFT", "override repository fingerprint drifted before arming");
  }
  const policy = policyIdentity(repo.root, pluginRoot, planned.denials);
  if (canonical(policy) !== canonical(planned.policy)) {
    fail("HGO-DRIFT", "override policy identity drifted before arming");
  }
  const plugin = pluginIdentity(pluginRoot, boundPluginProvider(planned.plugin));
  if (canonical(plugin) !== canonical(planned.plugin)) {
    fail("HGO-PLUGIN-DRIFT", "override machinery plugin identity drifted before arming");
  }
  if (planned.schema === NATIVE_PLAN_SCHEMA) {
    assertNativeTargets(repo.root, planned);
    if (repository.head !== planned.repository.head || repository.tree !== planned.repository.tree
      || canonical(repository.state) !== canonical(planned.repository.state)) {
      fail("HGO-CANDIDATE-DRIFT", "native signed candidate or lifecycle state changed before arming");
    }
  }
  return repository;
}

/**
 * NVA-CF-HGOCANDIDATEDRIFT: a best-effort, ADVISORY-ONLY signal for the `plan` CLI step
 * (scripts/guard-human-override.mjs), surfaced on stderr only -- it is never folded into
 * the plan/request/capability JSON shape or hash preimage (PLAN_KEYS/CAPABILITY_KEYS/
 * REQUEST_SCHEMA are untouched by this function) and never gates or refuses anything.
 * `git worktree list` is one cheap, read-only subprocess call and catches ONE class of
 * concurrent-commit risk for the HGO-CANDIDATE-DRIFT refusal above: another dispatch or
 * session working in an isolated worktree that could land a commit and move HEAD before
 * this ceremony's signature is consumed. It deliberately does NOT attempt to detect the
 * other, arguably more common class in this repository's own history -- a concurrent
 * commit landing directly into THIS shared checkout, with no separate worktree at all --
 * because there is no cheap, reliable signal for that case (see
 * docs/push-release-flow.md). Never throws: a `plan` call must never fail because this
 * advisory could not be computed (unusual git version, detached-common-dir edge case,
 * etc.) -- `checked: false` is the honest "could not determine" answer, not an error.
 */
export function concurrentWorktreeAdvisory(root, spawn = spawnSync) {
  try {
    const result = spawn("git", ["worktree", "list", "--porcelain"], { cwd: root, encoding: "utf8", shell: false, timeout: 5000 });
    if (result?.status !== 0 || result?.error || typeof result.stdout !== "string") return { checked: false, otherWorktrees: 0 };
    const count = result.stdout.split("\n").filter((line) => line.startsWith("worktree ")).length;
    return { checked: true, otherWorktrees: Math.max(0, count - 1) };
  } catch {
    return { checked: false, otherWorktrees: 0 };
  }
}

function safePath(root, candidate, { platform = process.platform } = {}) {
  if (typeof candidate !== "string" || candidate.trim() === "" || candidate.includes("\0")) return null;
  const absolute = resolve(root, candidate);
  const rel = separatorNormalized(relative(root, absolute), { platform });
  if (rel === "" || rel === "." || rel === ".." || rel.startsWith("../") || isAbsolute(rel)) return null;
  let cursor = root;
  const components = rel.split("/");
  for (let index = 0; index < components.length; index += 1) {
    cursor = join(cursor, components[index]);
    if (!existsSync(cursor)) break;
    const info = lstatSync(cursor);
    if (info.isSymbolicLink()
      || realpathSync(cursor) !== cursor
      || (index < components.length - 1 && !info.isDirectory())
      || (index === components.length - 1 && info.isFile() && info.nlink !== 1)) {
      return null;
    }
  }
  return { absolute, relative: rel };
}

function protectedPath(path) {
  const normalized = path.toLowerCase();
  return normalized === ".claude/pipeline-state.json"
    || normalized.startsWith(".claude/pipeline-state.json.")
    || normalized === ".claude/pipeline.yaml"
    || normalized === ".claude/pipeline.json"
    || normalized === ".claude/settings.json"
    || normalized === ".claude/settings.local.json"
    || normalized === ".claude/guard-config.json"
    || normalized === ".claude/guard-override.log.jsonl"
    || normalized === "project/pipeline-state.json"
    || normalized.startsWith("project/pipeline-state.json.")
    || normalized === "project/pipeline.yaml"
    || normalized === "project/pipeline.json"
    || normalized === "project/guard-config.json"
    || normalized === "project/guard-override.log.jsonl"
    || normalized === "pipeline.user.yaml"
    || normalized === ".agent-pipeline" || normalized.startsWith(".agent-pipeline/")
    || normalized === ".git" || normalized.startsWith(".git/")
    || normalized === ".codex" || normalized.startsWith(".codex/")
    || normalized === ".agents" || normalized.startsWith(".agents/")
    || /(^|\/)(?:secrets?|credentials?|tokens?|id_rsa|id_ed25519)(?:[./_-]|$)/u.test(normalized);
}

function hardBoundaryPath(path) {
  const normalized = path.toLowerCase();
  return normalized === ".git" || normalized.startsWith(".git/")
    || normalized === ".codex" || normalized.startsWith(".codex/")
    || normalized === ".agents" || normalized.startsWith(".agents/")
    || normalized === ".agent-pipeline" || normalized.startsWith(".agent-pipeline/")
    || /(^|\/)(?:secrets?|credentials?|tokens?|id_rsa|id_ed25519)(?:[./_-]|$)/u.test(normalized);
}

/**
 * PO decision 2026-10-17 (item pipeline.signature-ceremony-requires-operator-work-and-breaks,
 * AC-258): a PO-signed override of pipeline.user.yaml is refused up front. The edited routing
 * is not a durable layer -- the lifecycle later classes it as a stale projection and the
 * prescribed migration rewrites it back, which spends the human's signature for nothing.
 */
function userConfigOverridePath(path) {
  return path.toLowerCase() === "pipeline.user.yaml";
}

function pipelineSourcePath(path) {
  const normalized = path.toLowerCase();
  return normalized === "plugins/pipeline-core" || normalized.startsWith("plugins/pipeline-core/");
}

// ---------------------------------------------------------------------------------
// ADR-0059 Decision 6: a target outside `root` is a distinct, honestly-scoped eligible
// class ("cross-repository-target"), never a broadening of the in-root symlink-safety
// contract safePath() enforces. safePath() returns null for FOUR different reasons -- a
// malformed candidate, a candidate that resolves to root itself, a candidate that
// genuinely ESCAPES root, or an IN-ROOT candidate that fails its own symlink-safety walk
// (an attack, not a cross-repository target: this repository's own "pipeline author
// repair binds..." test depends on exactly that fourth case staying refused, via a
// symlink planted INSIDE the repo). crossBoundaryTarget() therefore re-derives ONLY the
// "genuinely escapes root" test safePath() itself uses -- never the symlink walk, which
// has no meaning for a location outside root -- so a null from this function can only
// mean "not an escape" or "a sensitive target", never "treat the existing refusal as
// avoidable".
//
// What this function says yes to, and what it deliberately never checks, is the class's
// own honesty (carried into decisionPreview()'s scopeAttestation below rather than left
// implicit): a well-formed, non-empty, non-null-byte path that genuinely escapes `root`
// and does not match the SAME sensitive-pattern refusal every in-root path is already
// held to (hardBoundaryPath()'s secrets/credentials/tokens/private-key regex -- its exact
// `.git`/`.codex`/`.agent-pipeline` match is inert here by construction, since those
// anchor on the ENTIRE normalized string, which an absolute out-of-root path is never
// equal to or prefixed by). It is never asked whether the target exists, is a git
// repository, or is safe from a symlink swap between authorization and consumption --
// HGO's physical-identity model (topology(), physicalRoot()) never extends there.
function crossBoundaryTarget(root, candidate, { platform = process.platform } = {}) {
  if (typeof candidate !== "string" || candidate.trim() === "" || candidate.includes("\0")) return null;
  const absolute = resolve(root, candidate);
  const rel = separatorNormalized(relative(root, absolute), { platform });
  const escapes = rel === ".." || rel.startsWith("../") || isAbsolute(rel);
  if (!escapes) return null;
  // NVA-HGOFIX-2: this check stays deliberately unnormalized on POSIX (the default platform
  // here) -- a final component merely SHAPED like `..\secrets` is not refused there, because
  // no capability is gained: any other non-matching name reaches the same admission, and the
  // cross-repository-target class this feeds never runs a symlink walk regardless of the name
  // that got it there.
  if (hardBoundaryPath(separatorNormalized(absolute, { platform }))) return null;
  return absolute;
}

/**
 * Try the existing in-root, symlink-safety-checked safePath() first; only when that
 * fails AND the candidate is a genuine, non-sensitive escape from `root` does this
 * classify into the new eligible class. Every other safePath() failure (malformed
 * candidate, root itself, or an in-root symlink/hardlink attack) is reported back as
 * "refused" unchanged -- callers keep denying it exactly as before this ADR.
 */
function classifyPath(root, candidate) {
  const path = safePath(root, candidate);
  if (path) return { kind: "in-root", path };
  const target = crossBoundaryTarget(root, candidate);
  return target === null ? { kind: "refused" } : { kind: "cross-boundary", target };
}

/** Builds the eligible() result for a genuine out-of-root escape, one target added to
 * whatever in-root paths were already accumulated by the same command's earlier tokens.
 * NVA-CROSSREPOLEDGER-1: `crossBoundaryTarget` carries the exact, single, absolute
 * escape candidate separately from `paths` (which mixes it with any earlier in-root,
 * root-RELATIVE entries from the same command) -- record/consume-time ledger binding
 * needs the raw target on its own, not re-derived by picking "the one absolute entry"
 * back out of `paths`. This is an ADDITIVE field on the in-memory eligibility() result
 * only; it is never itself persisted (the request/plan/capability schemas still carry
 * only `eligiblePaths`, i.e. `paths`, unchanged) and so needs no schema/version bump. */
function crossBoundaryEligible(paths, target) {
  return {
    eligible: true,
    mode: "standard",
    sourceRoot: null,
    paths: [...new Set([...paths, target])].sort(),
    commandClass: "cross-repository-target",
    crossBoundaryTarget: target,
  };
}

// ---------------------------------------------------------------------------------
// NVA-CROSSREPOLEDGER-1 (backlog/items/2026-07-20-cross-repository-override-ledger-
// binding.md): recordHumanGuardDenial()/consumeHumanGuardOverride() are the two entry
// points codex-pretool-guard.mjs calls AUTOMATICALLY, always with `rootDir: projectRoot`
// -- the coordinating session's own root, never the guarded command's actual
// cross-repository target (guard-hook call sites, read-only context for this dispatch).
// Both must independently rebind topology()/storage() to the SAME physical repository a
// "cross-repository-target" command actually operates on, instead of silently keeping
// the coordinator's own ledger, which is the exact defect this backlog item names.
//
// This is a DELIBERATELY NARROWER question than "is this an escape from root" --
// crossBoundaryTarget() itself never requires the escaping candidate to be, or even be
// inside, a git repository at all (its own header: "It is never asked whether the
// target exists, is a git repository..."), and the existing NOVA-HGOELIG-1..4 tests
// exercise exactly that: an ordinary scratch-file Write outside any repository, which
// has no "other repository" to bind to and must keep binding to the coordinator's own
// root exactly as before. So this function answers "does the target resolve to a
// physical git repository, and if so which one" using git's OWN repository-discovery
// algorithm (`git -C <dir-or-its-parent> rev-parse --show-toplevel`) -- the identical
// discovery a `git -C <target>` invocation, or git locating the repository above a
// plain file, already performs -- rather than a second, invented notion of "root".
// `target` may be a directory (a `-C`/`--work-tree`/`--git-dir` argument) or a file/
// nonexistent path (an Edit/Write file_path, an apply_patch path, or a Bash redirect
// target); for the latter its containing directory is exactly where git itself would
// discover from too.
//
// Returns the resolved physical top-level, or null when no git repository is found
// (an ordinary out-of-root, non-repository target: the two call sites below then fall
// through to their EXISTING, unchanged coordinator-rooted topology() attempt -- never a
// fail-closed refusal, since nothing was ever bound to the coordinator incorrectly for
// this case in the first place). When a repository IS found, the caller's own
// topology()/storage() calls on the returned root still enforce every existing physical-
// safety check as a SECOND layer on top of the discovery probe below, and a target
// repository whose ledger storage directory cannot be created or written
// (HGO-STORAGE/HGO-PERMISSIONS/HGO-DACL) still fails the whole call closed -- there is
// no catch-and-fall-back-to-the-coordinator's-ledger anywhere in this path. Never throws.
//
// NVA-CROSSREPOLEDGER-2 (Critic F1, this backlog item): `target` itself may be a
// symlink -- a real `git -C <target>` drives an OS-level chdir, which follows the
// symlink to its REAL destination, never to the symlink's own containing directory.
// The probe below therefore resolves the FULL symlink chain first (realpathSync, same
// idiom physicalRoot() already uses elsewhere in this file) before deciding whether to
// probe the resolved directory itself or its parent -- exactly mirroring the existing
// directory-vs-file rule two paragraphs up, just applied to the REAL location instead
// of the symlink's own. Any resolution failure (a dangling link, a symlink cycle, an
// unreadable path component) fails closed: this function returns null immediately for
// that target rather than falling back to the symlink's own containing directory, which
// is exactly the wrong-but-valid-looking repository a `dirname(target)` substitution
// could silently return -- the misbinding class this whole fix exists to close.
function crossRepositoryTargetRoot(target, spawn = spawnSync) {
  let probe = target;
  try {
    const info = lstatSync(target);
    if (info.isSymbolicLink()) {
      let resolved;
      try { resolved = realpathSync(target); } catch { return null; }
      let resolvedInfo;
      try { resolvedInfo = lstatSync(resolved); } catch { return null; }
      probe = resolvedInfo.isDirectory() ? resolved : dirname(resolved);
    } else if (!info.isDirectory()) {
      probe = dirname(target);
    }
  } catch { probe = dirname(target); }
  try { return git(probe, ["rev-parse", "--path-format=absolute", "--show-toplevel"], spawn) || null; }
  catch { return null; }
}

function authorSourceRoot(repoRoot, candidate) {
  if (typeof candidate !== "string" || !isAbsolute(candidate)) return null;
  let physical;
  try { physical = physicalRoot(candidate); } catch { return null; }
  const expected = join(repoRoot, "plugins", "pipeline-core");
  if (physical !== expected || !existsSync(join(physical, ".codex-plugin", "plugin.json"))) return null;
  return physical;
}

function authorEligiblePaths(root, paths, selectedSourceRoot) {
  const sourceRoot = authorSourceRoot(root, selectedSourceRoot);
  if (sourceRoot === null || paths.length === 0) return null;
  for (const path of paths) {
    if (!pipelineSourcePath(path)) return null;
    const safe = safePath(root, path);
    if (safe === null || safe.relative !== path) return null;
    const rel = relative(sourceRoot, safe.absolute);
    if (rel === "" || rel === ".." || rel.startsWith("../") || isAbsolute(rel)) return null;
  }
  return sourceRoot;
}

function patchPaths(command) {
  if (typeof command !== "string") return null;
  const normalized = command.replace(/\r\n/gu, "\n").replace(/\n+$/u, "");
  if (!normalized.startsWith("*** Begin Patch\n") || !normalized.endsWith("*** End Patch")) return null;
  const paths = [];
  const moveSources = new Set();
  let lastUpdateFile = null;
  for (const line of normalized.split("\n")) {
    const updateMatch = line.match(/^\*\*\* Update File: (.+)$/u);
    if (updateMatch) {
      lastUpdateFile = updateMatch[1];
      paths.push(lastUpdateFile);
      continue;
    }
    const moveMatch = line.match(/^\*\*\* Move to: (.+)$/u);
    if (moveMatch) {
      if (lastUpdateFile) moveSources.add(lastUpdateFile);
      paths.push(moveMatch[1]);
      lastUpdateFile = null;
      continue;
    }
    const match = line.match(/^\*\*\* (?:Add|Delete) File: (.+)$/u);
    if (match) {
      paths.push(match[1]);
      lastUpdateFile = null;
    }
  }
  return paths.length > 0 ? { paths, moveSources } : null;
}

function exactGitSubcommand(parsed) {
  if (parsed.parseStatus !== "accepted" || parsed.segments.length !== 1) return null;
  const segment = parsed.segments[0];
  if (segment.executable.toLowerCase().replace(/\.exe$/u, "") !== "git") return null;
  let index = 0;
  while (index < segment.argv.length) {
    const value = segment.argv[index];
    if (value === "-C" || value === "-c" || value === "--git-dir" || value === "--work-tree") {
      index += 2;
      continue;
    }
    if (value.startsWith("--git-dir=") || value.startsWith("--work-tree=") || value.startsWith("--config-env=")) {
      index += 1;
      continue;
    }
    break;
  }
  return segment.argv[index] ?? null;
}

function exactLocalPluginInstall(toolName, toolInput, root) {
  if (toolName !== "Bash" || !isPipelineSourceRoot(root)) return false;
  const parsed = parseGuardCommand(String(toolInput?.command ?? ""), root);
  if (parsed.parseStatus !== "accepted" || parsed.segments.length !== 1
    || parsed.operators.length !== 0 || parsed.redirects.length !== 0) return false;
  const segment = parsed.segments[0];
  if (!/codex(?:\.exe)?$/iu.test(basename(segment.executable))) return false;
  return canonical(segment.argv) === canonical([
    "plugin",
    "add",
    "pipeline-core@agent-pipeline-local",
  ]);
}

function actionPreview(toolName, toolInput, paths, commandClass) {
  if (toolName === "Bash") {
    return {
      toolName,
      command: String(toolInput?.command ?? ""),
      commandClass,
      eligiblePaths: paths,
    };
  }
  return {
    toolName,
    command: null,
    commandClass,
    eligiblePaths: paths,
  };
}

const HUMAN_GUARD_HANDOFF_HEADLINES = Object.freeze([
  "Human override available for this exact ",
  "Pipeline Author Repair is available for this exact ",
  "No human override route is offered for this exact ",
]);

function bindingDenialReason(reason) {
  const value = String(reason);
  const starts = HUMAN_GUARD_HANDOFF_HEADLINES
    .map((headline) => value.indexOf(`\n${headline}`))
    .filter((index) => index >= 0);
  return (starts.length === 0 ? value : value.slice(0, Math.min(...starts))).trimEnd();
}

function assertRawDenials(denials) {
  if (!Array.isArray(denials) || denials.length === 0
    || denials.some((denial) => !object(denial)
      || typeof denial.guard !== "string" || denial.guard.trim() === ""
      || typeof denial.reason !== "string" || denial.reason.trim() === "")) {
    fail("HGO-DENIAL", "denial set requires nonempty guard and reason strings");
  }
}

function persistedDenialsValid(value) {
  if (!Array.isArray(value.denials) || value.denials.length === 0
    || value.denials.some((denial) => !exactKeys(denial, ["guard", "sha256"])
      || typeof denial.guard !== "string" || denial.guard.trim() === ""
      || typeof denial.sha256 !== "string" || !SHA256.test(denial.sha256))
    || !object(value.preview) || !Array.isArray(value.preview.guardRationale)
    || value.preview.guardRationale.length !== value.denials.length) return false;
  return value.preview.guardRationale.every((row, index) =>
    exactKeys(row, ["guard", "denialSha256", "rationale"])
    && row.guard === value.denials[index].guard
    && row.denialSha256 === value.denials[index].sha256
    && typeof row.rationale === "string" && row.rationale.length <= 2_000);
}

function denialRationale(denials) {
  return denials.map((denial) => ({
    guard: String(denial.guard),
    denialSha256: sha(bindingDenialReason(denial.reason)),
    rationale: bindingDenialReason(denial.reason).slice(0, 2_000),
  })).sort((left, right) => `${left.guard}:${left.denialSha256}`.localeCompare(`${right.guard}:${right.denialSha256}`));
}

function denialDigests(denials) {
  return denialRationale(denials).map(({ guard, denialSha256 }) => ({ guard, sha256: denialSha256 }));
}

function denialRetryActions(denials) {
  const actions = [];
  for (const { reason } of denials) {
    for (const line of String(reason).split("\n")) {
      let value;
      try { value = JSON.parse(line); } catch { continue; }
      if (value?.schema !== "pipeline.guard-retry-actions.v1" || !Array.isArray(value.retryActions)) continue;
      for (const action of value.retryActions) {
        if (!object(action) || typeof action.executable !== "string" || !Array.isArray(action.argv)
          || action.mutation !== false || action.requiresConfirmation !== false) continue;
        actions.push(structuredClone(action));
      }
    }
  }
  return actions;
}

// This is a code-level boundary, rather than a guard-filename boundary: the
// lifecycle guard has other denial classes with legitimate recovery routes.
// A matching code in any aggregated denial set makes the whole exact action
// non-liftable, so an unrelated co-denial cannot smuggle it into HGO.
function lifecycleCoDenialSummary(denials, lifecycleDenial) {
  const summaries = [];
  for (const denial of denials) {
    if (denial === lifecycleDenial || denial?.guard === "guard-lifecycle-ready.mjs") continue;
    const guard = String(denial?.guard ?? "unknown-guard").match(/^[A-Za-z0-9_.-]{1,120}$/u)?.[0] ?? "unknown-guard";
    const code = String(denial?.reason ?? "").match(/\b(?:GUARD|HGO)-[A-Z0-9-]+\b/u)?.[0]?.slice(0, 120) ?? null;
    summaries.push(code === null ? guard : `${guard} (${code})`);
    if (summaries.length === 3) break;
  }
  if (summaries.length === 0) return null;
  const additional = Array.isArray(denials) && denials.filter((denial) => denial !== lifecycleDenial
    && denial?.guard !== "guard-lifecycle-ready.mjs").length - summaries.length;
  return `Additional active guard denials: ${summaries.join(", ")}${additional > 0 ? `; ${additional} more` : ""}.`;
}

// Transport only existing fixed guidance. Unknown text, dynamic paths and
// command/action payloads never become recovery telemetry or new admission.
function lifecycleRecoveryGuidance(denial) {
  if (denial.guard !== "guard-lifecycle-ready.mjs") return [];
  const lines = String(denial.reason).split(/\r?\n/u);
  const header = lines.shift();
  const prefix = "BLOCKED (guard-lifecycle-ready, plugin pipeline-core): GUARD-LIFECYCLE-NOT-READY: ";
  if (!header.startsWith(prefix)) return [];
  const status = header.slice(prefix.length).match(/^Pipeline session readiness is ([a-z-]+)\.$/u)?.[1] ?? null;
  const allowed = new Set(["Re-run the typed project-onboarding-v3 session inspection and use only its returned nextAction.","Re-run the typed project-onboarding-v3 inspection and use only its returned nextAction.","Re-run the typed project-onboarding-v3 inspection with intent session and use only its returned nextAction."]);
  if (status === "intake-required" || status === "intake-design-questions-required") allowed.add("A scratch write stays admitted during intake: creating the repository's own scratch directory (mkdir or mkdir -p, including a nested path inside it) and any Edit/Write/NotebookEdit write whose resolved path is inside it.");
  const guidance = [];
  let bytes = 0;
  for (const line of lines) {
    if (!allowed.has(line) || guidance.includes(line)) continue;
    const size = Buffer.byteLength(line, "utf8");
    if (guidance.length === 4 || bytes + size > 2048) break;
    guidance.push(line); bytes += size;
  }
  return guidance;
}

function lifecycleNotReadyRecovery(denials) {
  const lifecycleDenial = Array.isArray(denials)
    ? denials.find(({ reason }) => new RegExp(`\\b${LIFECYCLE_NOT_READY_CODE}\\b`, "u").test(String(reason)))
    : null;
  if (lifecycleDenial === null || lifecycleDenial === undefined) return null;
  return {
    status: "non-liftable-recovery-required",
    code: "HGO-NONOVERRIDABLE-LIFECYCLE-NOT-READY",
    cause: String(lifecycleDenial.reason).split(/\r?\n/u, 1)[0].slice(0, 500),
    recoveryGuidance: lifecycleRecoveryGuidance(lifecycleDenial),
    coDenialSummary: lifecycleCoDenialSummary(denials, lifecycleDenial),
    nextAction: {
      kind: "repair-required",
      reason: "Lifecycle readiness cannot be overridden. Technical repair is required before retrying; repeating the same inspection alone cannot change readiness.",
    },
  };
}

function commandDisclosureFields(root, tool, toolInput, rawCommand) {
  let secretBearing = true;
  try {
    const probe = eligibility(root, tool, toolInput ?? {});
    secretBearing = probe.eligible === false && probe.code === "HGO-NONOVERRIDABLE-SECRET";
  } catch {}
  const safe = tool === "Bash" && !secretBearing;
  return { command: safe ? rawCommand : null, copyCommand: safe ? boundedOpaqueCopyCommand(rawCommand) : null };
}

function decisionPreview({ toolName, toolInput, paths, commandClass, denials }) {
  const effect = commandClass === "local-plugin-install"
    ? {
      repository: "does not change the bound repository working tree, index, refs, or configuration",
      external: "adds exactly pipeline-core@agent-pipeline-local to the host Codex plugin registry; attested are this checkout's manifest identity and plugin-source tree digest AND, whenever the host marketplace registry names a local agent-pipeline-local root, that root's own marketplace.json plus EITHER that its plugins/pipeline-core entry is a symlink/junction that resolves back into exactly this checkout, OR that it is a real, non-symlinked directory copy whose own full content hash (bounded walk; a planted internal symlink or an oversized/hostile copy still refuses closed) exactly equals this checkout's plugin-source tree digest, so a repointed, mutated, or content-diverged external root refuses or invalidates this authorization; where the registry names no such root the external root stays unobserved and is NOT attested, and only this checkout's own manifest identity and plugin-source tree digest are",
      rollbackRecovery: "read back the native plugin registry; removal/restart remains a separately attended operator action",
      residualRisk: "the host-wide Codex plugin selection changes and existing sessions keep their already-loaded plugin until the attended refresh boundary",
    }
    : commandClass === "git-commit"
    ? {
      repository: "creates one local commit from the already staged index if Git and hooks succeed",
      external: "no external effect is expected from git commit",
      rollbackRecovery: "read back HEAD/tree/status; correct by a new commit or an explicitly reviewed revert, never infer commit success",
      residualRisk: "the commit may capture unintended staged bytes or invalidate candidate-bound evidence",
    }
    : new Set(["exact-in-root-patch", "exact-in-root-write", "pipeline-author-repair"]).has(commandClass)
      ? {
        repository: "changes only the listed in-root working-tree paths if the original tool succeeds",
        external: "no external effect is expected from the classified in-root file action",
        rollbackRecovery: "read back every listed path and repository status; repair with a reviewed inverse patch when needed",
        residualRisk: "the exact edit may violate project invariants or invalidate evidence that covered the prior bytes",
      }
      // ADR-0059 Decision 6: an out-of-root cross-repository target. Stated explicitly
      // rather than folded into the generic fallback below, because this class's honesty
      // requirement (Decision 6: "the identity model bounds what the override can prove,
      // not what a human may decide") is exactly that it must NOT read like an in-root
      // action -- HGO's physical-identity model (topology(), physicalRoot()) proves this
      // repository's own root/HEAD/tree/status, never the out-of-root target's.
      : commandClass === "cross-repository-target"
        ? {
          repository: "this repository's own working tree, index, refs and configuration are unaffected by the ATTESTATION itself; HGO's physical-identity model never inspects, and cannot attest, the identity, existence, or git status of a location outside this repository's own root",
          external: "the exact command or write reaches a target outside this repository's physical root; what it changes there is bounded only by the reviewed command/target below, never independently verified by this override",
          rollbackRecovery: "read back the out-of-root target directly, in its own context; this repository's own HEAD/tree/status readback proves nothing about it",
          residualRisk: "no symlink-safety walk runs on an out-of-root target the way safePath() runs for an in-root one, and no time-of-check/time-of-use guarantee holds between authorization and consumption for it; the capability still only ever admits the byte-identical command/write it was signed for, never a different one",
        }
        : {
          repository: "the exact command may change the bound repository preimage",
          external: "external effects are unknown for this exact command and must be treated as possible",
          rollbackRecovery: "use command-specific readback or reconciliation; never repeat an ambiguous effect",
          residualRisk: "the exact command may have effects not inferable by the guard adapter",
        };
  const preview = {
    action: actionPreview(toolName, toolInput, paths, commandClass),
    guardRationale: denialRationale(denials),
    alternatives: [
      {
        route: "normal-retry",
        status: "denied",
        evidenceSha256: sha(denialRationale(denials).map(({ guard, denialSha256 }) => ({ guard, denialSha256 }))),
      },
      {
        route: "narrower-typed-recovery",
        status: "not-returned-by-denying-guard",
        evidenceSha256: null,
      },
    ],
    expectedEffects: {
      repository: effect.repository,
      external: effect.external,
    },
    evidenceInvalidation: "all candidate-bound Verify, Security, Critic, preflight, or release evidence affected by the changed preimage must be rerun",
    rollbackRecovery: effect.rollbackRecovery,
    residualRisk: effect.residualRisk,
    postcondition: "retry the byte-identical original tool action, then run its ordinary effect readback; override admission is not operation success",
    poAuthority: "final-for-this-exact-project-policy-decision",
  };
  // ADR-0059 Decision 6, DoD item 3: state explicitly, in the persisted record a human
  // inspects before signing (this object is embedded verbatim in the request, plan, and
  // capability, and printed by `guard-human-override.mjs plan`/`prepare-authorization`),
  // what this exact class of override can and cannot bind -- never left as an implied
  // equivalence with an in-root capability.
  if (commandClass === "cross-repository-target") {
    preview.scopeAttestation = {
      schema: "pipeline.human-guard-override-scope-attestation.v1",
      proves: [
        "this repository's own physical root, HEAD, tree and working-tree status at authorization time -- identical to every other HGO class",
        "a human (chat mode: in-session attribution; signature mode: a genuine detached Ed25519 proof) reviewed and authorized this exact command or write, once",
        "the capability is bound to this exact command/tool-input digest and cannot be replayed for a different one, nor consumed twice",
      ],
      doesNotProve: [
        "the identity, existence, or git status of the out-of-root target",
        "that the out-of-root target is unchanged between authorization and consumption -- no symlink-safety walk runs there, unlike safePath()'s in-root walk",
        "that the out-of-root target is itself a git repository, or remains the one the human inspected",
      ],
    };
  }
  return preview;
}

function localAction(executable, argv, expected, { mutation = false } = {}) {
  return {
    executable,
    argv,
    mutation,
    requiresConfirmation: false,
    executionBoundary: "local-process",
    expected,
  };
}

// ---------------------------------------------------------------------------------
// Push recovery classification.
//
// The publication-executor route below is MAIN-ONLY by construction: its
// `--remote-name`/`--destination-ref` are the literal constants `origin` and
// `refs/heads/main`, and the denied command's own remote/destination were never read.
// Offering it as the recovery for EVERY denied push handed a session holding a valid,
// branch-bound push approval for `refs/heads/<feature>` the one route that contradicts
// its own signature -- and it was the only route ever shown, so the branch could not be
// pushed at all (observed 2026-08-10 on a feature branch whose approval verified).
//
// This classifier is deliberately PURE and LOCAL. guard-push.mjs owns the normative
// `parsePushBinding()`, but it is a hook with top-level side effects and must never be
// imported (see the import block). Nothing here decides admission -- it decides which
// sentence a denied session reads -- so it errs toward "I cannot tell" and never toward
// a guessed destination: a wrong hint costs a wasted human ceremony against a ref
// nobody meant to write.
// ---------------------------------------------------------------------------------
const PUSH_MAIN_REF = "refs/heads/main";
// `main`/`refs/heads/main` -- the same union guard-push.mjs's own attestedMainPublication()
// call site treats as main (an explicit destination, or a shorthand push whose source is
// main). Kept deliberately WIDE: anything main-ish keeps today's publication route.
const PUSH_MAIN_NAMES = new Set(["main", PUSH_MAIN_REF]);
// `pipeline-state.mjs approve-push --destination`'s own accepted grammar. A destination
// outside it (a bare branch name, a tag, a remote-tracking ref) cannot be handed to that
// ceremony, so it is reported as undetermined rather than qualified on the agent's behalf.
const PUSH_APPROVABLE_REF = /^refs\/heads\/[A-Za-z0-9._/-]{1,200}$/u;
const PUSH_SAFE_FLAGS = new Set([
  "--dry-run", "--porcelain", "--verbose", "-v", "--quiet", "-q",
  "--atomic", "--no-atomic", "--set-upstream", "-u",
]);
const PUSH_SHELL_WRAPPERS = new Set(["sh", "bash", "zsh", "dash", "sh.exe", "bash.exe"]);

function executableName(token) {
  return String(token).split(/[\\/]/u).pop().toLowerCase();
}

/**
 * pushRecoveryTarget(command) -- which recovery a DENIED push should be pointed at.
 * Returns `{ kind: "main" }`, `{ kind: "branch", remote, destination }`, or
 * `{ kind: "undetermined" }`. Never throws, never spawns, never touches the filesystem.
 */
function pushRecoveryTarget(command, depth = 0) {
  const shape = stripQuotedSegments(command);
  // A bundle, substitution, expansion or glob means the effective argv is not the text
  // in front of us; guard-push.mjs refuses the same shapes outright.
  if (/&&|\|\||[;|\n\r`<>]|\$\(/u.test(shape) || /[$`*?[\]{}~]/u.test(shape)) {
    return { kind: "undetermined" };
  }
  const tokens = tokenizeArgv(command);
  if (tokens.length === 0) return { kind: "undetermined" };
  const head = executableName(tokens[0]);
  if (PUSH_SHELL_WRAPPERS.has(head)) {
    // `sh -c '<one push>'` carries its destination in exactly one argument; unwrap it once
    // so a wrapped main publication keeps the publication route it has today.
    return depth === 0 && tokens[1] === "-c" && tokens.length === 3
      ? pushRecoveryTarget(tokens[2], depth + 1)
      : { kind: "undetermined" };
  }
  if (head !== "git" && head !== "git.exe") return { kind: "undetermined" };
  let index = 1;
  if (tokens[index] === "-C") index += 2;
  if (tokens[index]?.toLowerCase() !== "push") return { kind: "undetermined" };
  index += 1;
  const positionals = [];
  for (; index < tokens.length; index++) {
    const token = tokens[index];
    if (PUSH_SAFE_FLAGS.has(token)) continue;
    // Any other option (`--force`, `--delete`, `--mirror`, ...) changes what the refspec
    // means; such a push is not approvable by the ordinary ceremony anyway.
    if (token.startsWith("-")) return { kind: "undetermined" };
    positionals.push(token);
  }
  if (positionals.length !== 2) return { kind: "undetermined" };
  const [remote, refspec] = positionals;
  const colon = refspec.indexOf(":");
  const source = colon === -1 ? refspec : refspec.slice(0, colon);
  const destination = colon === -1 ? null : refspec.slice(colon + 1);
  if (!remote || !source || source.startsWith("+")) return { kind: "undetermined" };
  if (destination === null) {
    return PUSH_MAIN_NAMES.has(source) ? { kind: "main" } : { kind: "undetermined" };
  }
  if (PUSH_MAIN_NAMES.has(destination)) return { kind: "main" };
  if (!PUSH_APPROVABLE_REF.test(destination) || destination.includes("..")) {
    return { kind: "undetermined" };
  }
  return { kind: "branch", remote, destination };
}

function recoveryRoute(code, toolName, toolInput, paths = [], context = {}) {
  const { root = null, pluginRoot = null, repository = null } = context;
  const command = String(toolInput?.command ?? "");
  if (code === "HGO-NONOVERRIDABLE-SECRET") {
    return {
      status: "external-operator-required",
      code: "HGO-EXTERNAL-SENSITIVE-INPUT",
      nextAction: {
        kind: "external-operator",
        executionBoundary: "attended-external-terminal",
        invocation: "user-copy-only",
        action: {
          toolName,
          toolInputSha256: sha(toolInput),
          repositoryRoot: root,
        },
        reason: "the guarded input may contain sensitive bytes that cannot enter the override preview or durable request",
      },
    };
  }
  if (code === "HGO-NONOVERRIDABLE-PATH" || code === "HGO-NONOVERRIDABLE-CROSS-BOUNDARY") {
    const protectedTarget = paths.some(protectedPath)
      || /(?:pipeline-state\.json|pipeline\.ya?ml|guard-config\.json|settings(?:\.local)?\.json)/iu.test(command);
    return protectedTarget
      ? {
        status: "narrower-recovery-required",
        code: "HGO-NARROWER-WRITER-REQUIRED",
        nextAction: {
          kind: "typed-recovery",
          action: localAction(
            process.execPath,
            [join(pluginRoot, "scripts", "guard-human-override.mjs"), "verify-audit", "--repo", root],
            { schema: "pipeline.human-guard-override-audit-verification.v1", status: "valid" },
          ),
          after: "retry the exact original denial to obtain a fresh emergency plan or use its sanctioned writer",
        },
      }
      : {
        status: "external-operator-required",
        code: "HGO-EXTERNAL-PROJECT-BOUNDARY",
        nextAction: {
          kind: "external-operator",
          executionBoundary: "separate-session-rooted-at-exact-target",
          invocation: "user-copy-only",
          // NVA-W4-01B: by the time `code` reaches this branch, eligibility() has already
          // run its secret screen (it returns HGO-NONOVERRIDABLE-SECRET first, before ever
          // reaching HGO-NONOVERRIDABLE-PATH/CROSS-BOUNDARY) -- so a Bash command's literal
          // text is safe to disclose here exactly like commandDisclosureFields() in
          // codex-pretool-guard.mjs already does for its own class of denial. Non-Bash tools
          // (Edit/Write) have no `command` field at all; `toolInputSha256` above stays the
          // only disclosure for those, unchanged.
          action: {
            toolName,
            toolInputSha256: sha(toolInput),
            sourceRepositoryRoot: root,
            targetPaths: paths,
            ...(toolName === "Bash" && command.length > 0
              ? (() => {
                let copyCommand = null;
                try { copyCommand = boundedOpaqueCopyCommand(command); } catch { copyCommand = null; }
                return { command, copyCommand };
              })()
              : { command: null, copyCommand: null }),
          },
          reason: "the target is outside this project's physical authority boundary",
        },
      };
  }
  if (code === "HGO-NONOVERRIDABLE-USER-CONFIG") {
    // PO decision 2026-10-17 (AC-258): refused up front, with the real alternative named.
    return {
      status: "narrower-recovery-required",
      code: "HGO-NARROWER-USER-CONFIG-REFUSED",
      nextAction: {
        kind: "typed-recovery",
        action: {
          toolName,
          toolInputSha256: sha(toolInput),
          requiredChange: "make the pipeline.user.yaml change as a human edit committed to the repository; no signed override is offered for it",
          repositoryRoot: root,
        },
        limitation: "an agent write authorized by a signed override is not a durable layer: the lifecycle classes the edited routing as a stale projection and the prescribed migration rewrites it back, spending the signature for nothing",
      },
    };
  }
  const deniedPushCommand = commandIsGitPush(command);
  if (code === "HGO-PUBLICATION-REQUIRED" || deniedPushCommand) {
    // Classify ONLY when the denied command is itself a push. A publication-authority
    // denial whose command is not a push at all (a release alias) never named a
    // destination, so there is nothing to read and the fixed publication route -- which
    // revalidates everything from scratch anyway -- stays exactly right for it.
    const target = deniedPushCommand ? pushRecoveryTarget(command) : { kind: "not-a-push" };
    if (target.kind === "branch") {
      return {
        status: "narrower-recovery-required",
        code: "HGO-NARROWER-BRANCH-PUSH-APPROVAL-REQUIRED",
        nextAction: {
          kind: "typed-recovery",
          action: localAction(
            process.execPath,
            [
              join(pluginRoot, "scripts", "pipeline-state.mjs"),
              "approve-push",
              "--by", "<name>",
              "--remote", target.remote,
              "--destination", target.destination,
              "--proof-request", "<path>",
              "--proof-authority", "<path>",
              "--proof", "<path>",
            ],
            { effect: "records pushApproval.lastApproved for exactly this candidate commit, remote and destination ref" },
            { mutation: true },
          ),
          // Verbatim from guard-git.mjs's own GG-03 guidance: one ceremony, one wording,
          // whichever layer a session happens to meet it at.
          limitation: "A push approval that verifies for THIS commit, THIS remote and THIS destination ref lifts GG-03 with no token and no typed phrase. The push must write its destination out (`HEAD:refs/heads/<branch>`): an approval names a ref, and a command that names none cannot be matched against it.",
          after: "retry the byte-identical original push once the approval is recorded",
        },
      };
    }
    if (target.kind === "undetermined") {
      return {
        status: "narrower-recovery-required",
        code: "HGO-NARROWER-PUSH-DESTINATION-REQUIRED",
        nextAction: {
          kind: "typed-recovery",
          action: {
            toolName,
            toolInputSha256: sha(toolInput),
            requiredChange: "restate the push as one plain `git [-C <path>] push <remote> <source>:refs/heads/<branch>` so its destination ref is written out",
            repositoryRoot: root,
          },
          limitation: "the denied command's destination ref could not be determined from its own text, and no destination is assumed on its behalf: an approval names a ref, and a command that names none cannot be matched against it",
        },
      };
    }
    const preflightId = `guard-${sha(toolInput).slice(0, 24)}`;
    return {
      status: "narrower-recovery-required",
      code: "HGO-NARROWER-PUBLICATION-REQUIRED",
      nextAction: {
        kind: "typed-recovery",
        action: localAction(
          process.execPath,
          [
            join(pluginRoot, "scripts", "publication-executor.mjs"),
            "preflight",
            "--root", root,
            "--preflight-id", preflightId,
            "--candidate", repository?.head ?? "unavailable",
            "--remote-name", "origin",
            "--destination-ref", "refs/heads/main",
          ],
          { schema: "pipeline.publication-capability-preflight.v1", statuses: ["ready", "blocked"] },
        ),
        limitation: "the fixed productive publication route revalidates candidate, remote, destination, credentials, policy, and preimage; it never inherits raw push argv",
      },
    };
  }
  if (code === "HGO-NONOVERRIDABLE-WILDCARD") {
    return {
      status: "narrower-recovery-required",
      code: "HGO-NARROWER-EXACT-TARGET-REQUIRED",
      nextAction: {
        kind: "typed-recovery",
        action: {
          toolName,
          toolInputSha256: sha(toolInput),
          requiredChange: "replace every wildcard with one exact target",
          repositoryRoot: root,
        },
      },
    };
  }
  return {
    status: "external-operator-required",
    code: "HGO-EXTERNAL-ADAPTER-BOUNDARY",
    nextAction: {
      kind: "external-operator",
      executionBoundary: "attended-external-tool",
      invocation: "user-copy-only",
      action: {
        toolName,
        toolInputSha256: sha(toolInput),
        repositoryRoot: root,
      },
      reason: "the exact action class or target cannot be safely attested inside this guard adapter",
    },
  };
}

function eligibility(root, toolName, toolInput, { selectedAuthorSourceRoot = null, platform = process.platform } = {}) {
  const paths = [];
  const serialized = canonical(toolInput);
  if (/(?:gh[pousr]_[A-Za-z0-9]{16,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY-----|(?:token|password|secret)\s*[:=]\s*["']?[A-Za-z0-9+/_=-]{12,})/u.test(serialized)) {
    return { eligible: false, code: "HGO-NONOVERRIDABLE-SECRET", paths };
  }
  if (exactLocalPluginInstall(toolName, toolInput, root)) {
    return {
      eligible: true,
      mode: "global-plugin-install",
      sourceRoot: join(root, "plugins", "pipeline-core"),
      paths,
      commandClass: "local-plugin-install",
    };
  }
  if (new Set(["Edit", "Write"]).has(toolName)) {
    const classified = classifyPath(root, toolInput?.file_path);
    if (classified.kind === "refused") return { eligible: false, code: "HGO-NONOVERRIDABLE-CROSS-BOUNDARY", paths };
    if (classified.kind === "cross-boundary") return crossBoundaryEligible(paths, classified.target);
    const path = classified.path;
    if (hardBoundaryPath(path.relative)) return { eligible: false, code: "HGO-NONOVERRIDABLE-PATH", paths: [path.relative] };
    if (userConfigOverridePath(path.relative)) return { eligible: false, code: "HGO-NONOVERRIDABLE-USER-CONFIG", paths: [path.relative] };
    paths.push(path.relative);
    if (protectedPath(path.relative)) return {
      eligible: true,
      mode: "standard",
      sourceRoot: null,
      paths,
      commandClass: "writer-owned-project-policy-emergency",
    };
  } else if (toolName === "apply_patch") {
    const parsedResult = patchPaths(toolInput?.command);
    if (!parsedResult) {
      return { eligible: false, code: "HGO-NONOVERRIDABLE-GRAMMAR", paths };
    }
    const { paths: parsed, moveSources } = parsedResult;
    const crossBoundaryPaths = [];
    const refusedPaths = [];
    const hardBoundaryPaths = [];
    for (const candidate of parsed) {
      const classified = classifyPath(root, candidate);
      if (classified.kind === "refused") {
        refusedPaths.push(candidate);
        continue;
      }
      if (classified.kind === "cross-boundary") {
        crossBoundaryPaths.push(classified.target);
        continue;
      }
      const path = classified.path;
      if (hardBoundaryPath(path.relative)) {
        hardBoundaryPaths.push(path.relative);
        continue;
      }
      paths.push(path.relative);
    }
    const classifiedPaths = [...new Set([...paths, ...crossBoundaryPaths, ...refusedPaths, ...hardBoundaryPaths])].sort();
    if (refusedPaths.length > 0) {
      return { eligible: false, code: "HGO-NONOVERRIDABLE-CROSS-BOUNDARY", paths: classifiedPaths };
    }
    if (hardBoundaryPaths.length > 0) {
      return { eligible: false, code: "HGO-NONOVERRIDABLE-PATH", paths: classifiedPaths };
    }
    if (crossBoundaryPaths.length > 0) {
      // One capability belongs to one physical authority plane. A patch may span
      // several files in one external Git repository, but never mix in-root and
      // out-of-root targets or bind ledgers from multiple external repositories.
      const inRootTargets = paths.filter((p) => !moveSources.has(p));
      if (inRootTargets.length > 0) {
        return { eligible: false, code: "HGO-NONOVERRIDABLE-CROSS-BOUNDARY", paths: classifiedPaths };
      }
      const targetRoots = crossBoundaryPaths.map((target) => crossRepositoryTargetRoot(target));
      if (crossBoundaryPaths.length > 1
        && (targetRoots.some((targetRoot) => targetRoot === null) || new Set(targetRoots).size !== 1)) {
        return { eligible: false, code: "HGO-NONOVERRIDABLE-CROSS-BOUNDARY", paths: classifiedPaths };
      }
      return crossBoundaryEligible(crossBoundaryPaths.slice(1), crossBoundaryPaths[0]);
    }
    if (paths.some(userConfigOverridePath)) return { eligible: false, code: "HGO-NONOVERRIDABLE-USER-CONFIG", paths: [...new Set(paths)].sort() };
    if (paths.some(protectedPath)) return {
      eligible: true,
      mode: "standard",
      sourceRoot: null,
      paths: [...new Set(paths)].sort(),
      commandClass: "writer-owned-project-policy-emergency",
    };
  } else if (toolName === "Bash") {
    const command = String(toolInput?.command ?? "");
    const parsed = parseGuardCommand(command, root);
    let writerOwnedProjectPolicy = false;
    if (/\bgit(?:\.exe)?\b[^\n]*\bpush\b/iu.test(command)) {
      return { eligible: false, code: "HGO-NONOVERRIDABLE-COMMAND", paths, commandClass: "raw-git-push" };
    }
    if (/(^|[\s=])(?:\*|\?)(?=$|\s)/u.test(command)) {
      return { eligible: false, code: "HGO-NONOVERRIDABLE-WILDCARD", paths, commandClass: "wildcard-command" };
    }
    if (parsed.parseStatus !== "accepted") {
      if (/(?:^|\s)\.\.(?:\s|$)|[\\/$`<>]/u.test(command)) {
        return { eligible: false, code: "HGO-NONOVERRIDABLE-GRAMMAR", paths };
      }
      return {
        eligible: true,
        mode: "standard",
        sourceRoot: null,
        paths,
        commandClass: "closed-shell-exact",
      };
    }
    for (const redirect of parsed.redirects) {
      if (redirect.target === "/dev/null" || redirect.target?.toLowerCase() === "nul") continue;
      const classified = classifyPath(root, redirect.target);
      // PO decision 2026-08-18 #7 (backlog/items/2026-08-12-cross-repository-redirect-
      // eligibility-does-not-consult-the-sensitive-path-boundary.md): a TOOL-BASED check
      // (an allowlist of permitted target types), not a broader path-content heuristic.
      // A Bash redirect target is never a "permitted target type" for the
      // cross-repository-target liftable class at all -- unlike an Edit/Write file_path,
      // an apply_patch path, or a `git -C`/`--work-tree`/`--git-dir` pointer argument
      // (each of which names a single, deliberate write/repository target the tool call
      // itself structurally identifies), a shell redirect's target is incidental output
      // plumbing that can point at ANY absolute path with no enumerable "sensitive"
      // pattern to check it against -- hardBoundaryPath()'s own pattern
      // (secrets/credentials/tokens/.git/.codex/.agent-pipeline) is deliberately scoped
      // to THIS project's internal sensitive paths and was never meant to, and cannot be
      // broadened to, enumerate every sensitive path on every OS (`/etc/passwd`,
      // `/etc/shadow`, ...). So an out-of-root redirect target is refused outright here,
      // exactly like a "refused" classifyPath() result -- never routed through
      // crossBoundaryEligible() -- regardless of whether the specific target matches
      // hardBoundaryPath()'s pattern. This narrows only the redirect-target loop; the
      // git pointer-argument and Edit/Write/apply_patch call sites below are unaffected,
      // since those ARE permitted target types for this eligible class.
      if (classified.kind === "refused" || classified.kind === "cross-boundary") {
        return { eligible: false, code: "HGO-NONOVERRIDABLE-CROSS-BOUNDARY", paths: [redirect.target] };
      }
      const path = classified.path;
      if (hardBoundaryPath(path.relative)) return { eligible: false, code: "HGO-NONOVERRIDABLE-PATH", paths: [path.relative] };
      paths.push(path.relative);
      if (protectedPath(path.relative)) writerOwnedProjectPolicy = true;
    }
    for (const segment of parsed.segments) {
      for (let index = 0; index < segment.argv.length; index += 1) {
        const token = segment.argv[index];
        if (token === "-C" || token === "--git-dir" || token === "--work-tree") {
          const candidate = segment.argv[index + 1];
          if (typeof candidate === "string") {
            const classified = classifyPath(root, candidate);
            if (classified.kind === "refused") return { eligible: false, code: "HGO-NONOVERRIDABLE-CROSS-BOUNDARY", paths: [candidate] };
            if (classified.kind === "cross-boundary") return crossBoundaryEligible(paths, classified.target);
            paths.push(classified.path.relative);
          }
          index += 1;
          continue;
        }
        const assignedPath = token.match(/^--(?:git-dir|work-tree)=(.+)$/u)?.[1];
        if (assignedPath !== undefined) {
          const classified = classifyPath(root, assignedPath);
          if (classified.kind === "refused") return { eligible: false, code: "HGO-NONOVERRIDABLE-CROSS-BOUNDARY", paths: [assignedPath] };
          if (classified.kind === "cross-boundary") return crossBoundaryEligible(paths, classified.target);
          paths.push(classified.path.relative);
          continue;
        }
        // NVA-HGOFIX-2: this rewrite is a WIN32-ONLY concern (see separatorNormalized()
        // above) -- unconditionally applying it on POSIX could misclassify a legitimate
        // in-root token whose name merely contains a backslash as a hard-boundary/protected
        // path (fail-closed), never a security hole, but still an undisclosed behavior change.
        const normalizedToken = platform === "win32" ? token.replace(/\\/gu, "/") : token;
        if (!token.startsWith("-") && hardBoundaryPath(normalizedToken)) {
          return { eligible: false, code: "HGO-NONOVERRIDABLE-PATH", paths: [normalizedToken] };
        }
        if (!token.startsWith("-") && protectedPath(normalizedToken)) {
          writerOwnedProjectPolicy = true;
          paths.push(normalizedToken);
          continue;
        }
        if (isAbsolute(token) || token === ".." || token.startsWith("../") || token.includes("/../")) {
          const classified = classifyPath(root, token);
          if (classified.kind === "refused") return { eligible: false, code: "HGO-NONOVERRIDABLE-CROSS-BOUNDARY", paths: [token] };
          if (classified.kind === "cross-boundary") return crossBoundaryEligible(paths, classified.target);
          const path = classified.path;
          if (hardBoundaryPath(path.relative)) return { eligible: false, code: "HGO-NONOVERRIDABLE-PATH", paths: [path.relative] };
          paths.push(path.relative);
          if (protectedPath(path.relative)) writerOwnedProjectPolicy = true;
        }
      }
    }
    if (parsed.segments.length !== 1 || parsed.operators.length !== 0 || parsed.redirects.length !== 0) {
      return {
        eligible: true,
        mode: "standard",
        sourceRoot: null,
        paths: [...new Set(paths)].sort(),
        commandClass: writerOwnedProjectPolicy
          ? "writer-owned-project-policy-emergency"
          : "closed-shell-exact",
      };
    }
    const segment = parsed.segments[0];
    const normalizedExecutable = segment.executable.toLowerCase().replace(/\.exe$/u, "");
    if (normalizedExecutable === "node" && segment.argv.length === 2 && segment.argv[0] === "--check") {
      const classified = classifyPath(root, segment.argv[1]);
      if (classified.kind === "refused") return { eligible: false, code: "HGO-NONOVERRIDABLE-CROSS-BOUNDARY", paths: [segment.argv[1]] };
      if (classified.kind === "cross-boundary") return crossBoundaryEligible(paths, classified.target);
      const path = classified.path;
      if (hardBoundaryPath(path.relative)) return { eligible: false, code: "HGO-NONOVERRIDABLE-PATH", paths: [path.relative] };
      paths.push(path.relative);
      if (protectedPath(path.relative)) writerOwnedProjectPolicy = true;
    }
    const subcommand = exactGitSubcommand(parsed);
    return {
      eligible: true,
      mode: "standard",
      sourceRoot: null,
      paths: [...new Set(paths)].sort(),
      commandClass: writerOwnedProjectPolicy
        ? "writer-owned-project-policy-emergency"
        : subcommand === null ? "exact-command" : `git-${subcommand}`,
    };
  } else {
    return { eligible: false, code: "HGO-NONOVERRIDABLE-TOOL", paths };
  }
  const uniquePaths = [...new Set(paths)].sort();
  const pipelinePaths = uniquePaths.filter(pipelineSourcePath);
  if (pipelinePaths.length > 0) {
    if (pipelinePaths.length !== uniquePaths.length) {
      return { eligible: false, code: "HGO-NONOVERRIDABLE-CROSS-BOUNDARY", paths: uniquePaths };
    }
    if (selectedAuthorSourceRoot === null) {
      return {
        eligible: false,
        code: "HGO-AUTHOR-ROOT-REQUIRED",
        authorCandidate: true,
        paths: uniquePaths,
        candidateSourceRoot: join(root, "plugins", "pipeline-core"),
      };
    }
    const sourceRoot = authorEligiblePaths(root, uniquePaths, selectedAuthorSourceRoot);
    if (sourceRoot === null) return { eligible: false, code: "HGO-AUTHOR-ROOT-MISMATCH" };
    return { eligible: true, mode: "pipeline-author-repair", sourceRoot, paths: uniquePaths };
  }
  if (selectedAuthorSourceRoot !== null) return { eligible: false, code: "HGO-AUTHOR-SCOPE-MISMATCH" };
  return {
    eligible: true,
    mode: "standard",
    sourceRoot: null,
    paths: uniquePaths,
    commandClass: toolName === "apply_patch" ? "exact-in-root-patch" : "exact-in-root-write",
  };
}


// v4 is a separate native Edit/Write contract. No legacy proof is upgraded.
const NATIVE_TARGET_MAX_FILES = 64;
const NATIVE_TARGET_MAX_BYTES = 16 * 1024 * 1024;
function readHgoBoundedRegularBytes(fd, maxBytes, code) {
  const size = fstatSync(fd).size;
  if (!Number.isSafeInteger(size) || size < 0 || size > maxBytes) fail(code, "record bytes exceed the closed read bound");
  const buffer = Buffer.alloc(size + 1); let used = 0;
  while (used < buffer.length) {
    const count = readSync(fd, buffer, used, buffer.length - used, null);
    if (count === 0) break;
    used += count;
  }
  if (used > size) fail(code, "record grew beyond its frozen read bound");
  return buffer.subarray(0, used);
}

function nativeTargetStat(info) {
  return { dev: String(info.dev), ino: String(info.ino), mode: info.mode & 0o777,
    uid: typeof info.uid === "number" ? info.uid : null };
}
function nativeTargetsValid(value, paths) {
  if (!Array.isArray(paths) || !exactKeys(value, ["schema", "targets"]) || value.schema !== HGO_NATIVE_TARGET_PREIMAGES_SCHEMA
    || !Array.isArray(value.targets) || value.targets.length < 1 || value.targets.length > NATIVE_TARGET_MAX_FILES
    || canonical(value.targets.map(row => row?.path)) !== canonical(paths)
    || paths.some((path,index) => typeof path !== "string" || path === "" || (index > 0 && paths[index-1] >= path))) return false;
  const stat = row => exactKeys(row,["dev","ino","mode","uid"])
    && typeof row.dev === "string" && /^\d+$/u.test(row.dev) && typeof row.ino === "string" && /^\d+$/u.test(row.ino)
    && Number.isSafeInteger(row.mode) && row.mode >= 0 && row.mode <= 0o777
    && (row.uid === null || Number.isSafeInteger(row.uid));
  return value.targets.every(row => exactKeys(row,["path","ancestors","preimage"])
    && Array.isArray(row.ancestors) && row.ancestors.length > 0
    && row.ancestors.every(parent => exactKeys(parent,["path","status"])
      ? typeof parent.path === "string" && parent.status === "absent"
      : exactKeys(parent,["path","status","identity"]) && typeof parent.path === "string" && parent.status === "directory" && stat(parent.identity))
    && (exactKeys(row.preimage,["status"]) && row.preimage.status === "absent"
      || exactKeys(row.preimage,["status","identity","bytes","mtimeMs","ctimeMs","sha256"])
        && row.preimage.status === "file" && stat(row.preimage.identity)
        && Number.isSafeInteger(row.preimage.bytes) && row.preimage.bytes >= 0
        && Number.isFinite(row.preimage.mtimeMs) && Number.isFinite(row.preimage.ctimeMs) && SHA256.test(row.preimage.sha256)));
}
function captureNativeTargetPreimages(root, paths) {
  if (!Array.isArray(paths) || paths.length < 1 || paths.length > NATIVE_TARGET_MAX_FILES) fail("HGO-NATIVE-TARGET-BOUND", "native target set exceeds its closed bound");
  const physical = physicalRoot(root); let total = 0;
  const targets = paths.map((path,index) => {
    if (typeof path !== "string" || path === "" || (process.platform === "win32" && path.includes("\\")) || isAbsolute(path)
      || path.split("/").some(part => part === "" || part === "." || part === "..")
      || (index > 0 && paths[index-1] >= path)) fail("HGO-NATIVE-TARGET-PATH", "native target set is not canonical");
    const parts = path.split("/"), ancestors = []; let absent = false;
    for (let depth=0; depth<parts.length; depth+=1) {
      const rel = parts.slice(0,depth).join("/"), absolute = rel === "" ? physical : join(physical,rel);
      if (absent) { ancestors.push({path:rel,status:"absent"}); continue; }
      let info; try { info = lstatSync(absolute); } catch (error) {
        if (error.code !== "ENOENT") fail("HGO-NATIVE-TARGET-UNAVAILABLE", "native target ancestry cannot be observed");
        absent = true; ancestors.push({path:rel,status:"absent"}); continue;
      }
      if (!info.isDirectory() || info.isSymbolicLink() || realpathSync(absolute) !== absolute) fail("HGO-NATIVE-TARGET-UNSAFE", "native target ancestry is unsafe");
      ancestors.push({path:rel,status:"directory",identity:nativeTargetStat(info)});
    }
    const absolute = join(physical,path);
    if (absent) return {path,ancestors,preimage:{status:"absent"}};
    let info; try { info = lstatSync(absolute); } catch (error) {
      if (error.code === "ENOENT") return {path,ancestors,preimage:{status:"absent"}};
      fail("HGO-NATIVE-TARGET-UNAVAILABLE", "native target cannot be observed");
    }
    if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1 || realpathSync(absolute) !== absolute) fail("HGO-NATIVE-TARGET-UNSAFE", "native target must be an exclusive regular file");
    if (!Number.isSafeInteger(info.size) || info.size < 0 || (total += info.size) > NATIVE_TARGET_MAX_BYTES) fail("HGO-NATIVE-TARGET-BOUND", "native target bytes exceed their closed bound");
    let fd;
    try {
      fd = openSync(absolute, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
      const before = fstatSync(fd); if (before.dev !== info.dev || before.ino !== info.ino || before.size !== info.size || before.nlink !== 1 || !before.isFile()) fail("HGO-NATIVE-TARGET-DRIFT", "native target changed during observation");
      const bytes = readHgoBoundedRegularBytes(fd, NATIVE_TARGET_MAX_BYTES, "HGO-NATIVE-TARGET-BOUND"); const after = fstatSync(fd), named = lstatSync(absolute);
      for (const key of ["dev","ino","mode","uid","size","mtimeMs","ctimeMs","nlink"]) if (before[key] !== after[key] || before[key] !== named[key]) fail("HGO-NATIVE-TARGET-DRIFT", "native target changed during full observation");
      if (bytes.length !== before.size || bytes.length > NATIVE_TARGET_MAX_BYTES) fail("HGO-NATIVE-TARGET-BOUND", "native target full read exceeds its closed bound");
      return {path,ancestors,preimage:{status:"file",identity:nativeTargetStat(before),bytes:bytes.length,mtimeMs:before.mtimeMs,ctimeMs:before.ctimeMs,sha256:sha(bytes)}};
    } finally { if (fd !== undefined) closeSync(fd); }
  });
  // A later target read must not conceal an ancestor replacement or an absent path appearing.
  for (const target of targets) {
    for (const ancestor of target.ancestors) {
      const absolute = ancestor.path === "" ? physical : join(physical,ancestor.path);
      let info; try { info = lstatSync(absolute); } catch (error) {
        if (error.code === "ENOENT" && ancestor.status === "absent") continue;
        fail("HGO-NATIVE-TARGET-DRIFT", "native target ancestry changed during observation");
      }
      if (ancestor.status !== "directory" || !info.isDirectory() || info.isSymbolicLink()
        || realpathSync(absolute) !== absolute || canonical(nativeTargetStat(info)) !== canonical(ancestor.identity)) fail("HGO-NATIVE-TARGET-DRIFT", "native target ancestry changed during observation");
    }
    if (target.preimage.status === "absent") {
      try { lstatSync(join(physical,target.path)); } catch (error) { if (error.code === "ENOENT") continue; fail("HGO-NATIVE-TARGET-DRIFT", "native absence changed during observation"); }
      fail("HGO-NATIVE-TARGET-DRIFT", "native absent target appeared during observation");
    }
  }
  const result = {schema:HGO_NATIVE_TARGET_PREIMAGES_SCHEMA,targets};
  if (!nativeTargetsValid(result,paths)) fail("HGO-NATIVE-TARGET-SHAPE", "native target observation is not closed");
  return result;
}
const NATIVE_FILE_TOOLS = new Set(["Edit", "Write", "apply_patch"]);
function assertNativeTargets(root, record) {
  if (!nativeTargetsValid(record.nativeTargets,record.eligiblePaths)
    || !NATIVE_FILE_TOOLS.has(record.toolName)
    || canonical(captureNativeTargetPreimages(root,record.eligiblePaths)) !== canonical(record.nativeTargets)) {
    fail("HGO-NATIVE-TARGET-DRIFT", "signed native target preimages changed");
  }
}
function nativeRepositoryMatches(bound, observed) {
  const withoutStatus = value => Object.fromEntries(Object.entries(value).filter(([key]) => key !== "statusSha256"));
  return canonical(withoutStatus(bound)) === canonical(withoutStatus(observed));
}

function requestPath(paths, digest) {
  if (!SHA256.test(digest)) fail("HGO-DIGEST", "request digest is invalid");
  return join(paths.requests, `${digest}.json`);
}

function capabilityPath(paths, digest) {
  if (!SHA256.test(digest)) fail("HGO-DIGEST", "plan digest is invalid");
  return join(paths.capabilities, `${digest}.json`);
}

// ---------------------------------------------------------------------------------
// Part A (design doc §1.4): the persisted plan store. Keyed by (requestSha256,
// authorSourceRoot) -- design doc §1.7's own flagged keying requirement, since
// authorSourceRoot changes mode/sourceRoot in the payload. The file name is a
// digest of the KEY, not of the plan's content (unlike requests, whose file name
// IS the content digest) -- self-consistency is instead checked via the embedded
// `planSha256` field, exactly the same trust tier `requestSha256` already gives
// requests: owner-private-directory protection, not an audit-key HMAC (a tampered
// plan cannot widen authority beyond what the arm-time freshness re-check in
// armTimeFreshnessCheck() below still allows against LIVE state).
// ---------------------------------------------------------------------------------
const PLAN_KEYS = [
  "schema",
  "status",
  "root",
  "requestSha256",
  "plugin",
  "repository",
  "toolName",
  "toolInputSha256",
  "commandClass",
  "externalReadOnly",
  "denials",
  "policy",
  "preview",
  "eligiblePaths",
  "mode",
  "authorSourceRoot",
  "expiresAt",
  "planSha256",
];

function planPath(paths, requestSha256, authorSourceRoot) {
  if (!SHA256.test(requestSha256)) fail("HGO-DIGEST", "request digest is invalid");
  return join(paths.plans, `${sha({ requestSha256, authorSourceRoot })}.json`);
}

function validatedPlan(path, value = readJson(path)) {
  const core = Object.fromEntries(Object.entries(value).filter(([name]) => name !== "planSha256"));
  const native = value.schema === NATIVE_PLAN_SCHEMA;
  if (!exactKeys(value, native ? [...PLAN_KEYS, "nativeTargets"] : PLAN_KEYS)
    || !(value.schema === PLAN_SCHEMA || native) || value.status !== "planned"
    || (native && !nativeTargetsValid(value.nativeTargets, value.eligiblePaths))
    || !SHA256.test(value.requestSha256 ?? "") || !SHA256.test(value.planSha256 ?? "")
    || typeof value.externalReadOnly !== "boolean"
    || !persistedDenialsValid(value)
    || sha(core) !== value.planSha256) {
    fail("HGO-PLAN", "persisted override plan is invalid");
  }
  return value;
}

/** Returns the persisted plan for (requestSha256, authorSourceRoot), or null if none exists yet. */
function readPersistedPlan(paths, requestSha256, authorSourceRoot) {
  const path = planPath(paths, requestSha256, authorSourceRoot);
  if (!existsSync(path)) return null;
  const persisted = validatedPlan(path);
  if (persisted.requestSha256 !== requestSha256) fail("HGO-PLAN", "persisted override plan does not match its request");
  return persisted;
}

/** The identical check `request` expiry gets at plan first-creation (design doc §1.4 step 1, :1520) and at refreeze (step 6). */
function assertRequestNotExpired(request, repo, nowMs) {
  if (request.root !== repo.root) {
    fail("HGO-REQUEST-ROOT-MISMATCH", "override request belongs to a different repository");
  }
  if (new Date(request.expiresAt).getTime() <= nowMs) {
    fail("HGO-EXPIRED", "override request expired");
  }
}

/**
 * `planned.expiresAt` freezes at plan first-creation (`payload.expiresAt =
 * request.expiresAt` in planHumanGuardOverride()) and is never re-checked between
 * then and an arm call -- but an arm call can happen much later, after an external
 * signature ceremony that itself takes real wall-clock time. Both arming routes
 * (authorizeHumanGuardOverride()'s chat-mode activation and
 * authorizeHumanGuardOverrideBySignature()'s signed path) must refuse here, before
 * ever building `capabilityCore`, or a capability is armed already past its own
 * expiry -- observed live 2026-08-28 (`authorizedAt` sixteen minutes after
 * `expiresAt`; backlog/items/2026-08-28-an-expired-override-is-armed-instead-of-
 * refused.md). consumeHumanGuardOverride() already refuses an expired capability at
 * consumption (its own `expired` check below); this closes the window one step
 * earlier, where the human is still in the loop, without weakening that later
 * check -- both stay armed. Mirrors assertRequestNotExpired()'s shape and error
 * code; only which frozen timestamp is being compared differs.
 */
function assertPlanNotExpired(planned, nowMs) {
  if (new Date(planned.expiresAt).getTime() <= nowMs) {
    fail(
      "HGO-EXPIRED",
      "override plan window has closed; refreeze the plan (or start over with a fresh "
        + "denial) and obtain a new signature before retrying authorize-by-signature",
    );
  }
}

/**
 * The identical, unconditional narrow drift gate design doc §1.4 steps 1 and 6 both
 * enforce against the frozen `request`: `fingerprintSha256` and `policyIdentity`
 * only -- never `statusSha256`/`head`/`tree`/`state`, and never `pluginIdentity`
 * (which is not compared here at all; see armTimeFreshnessCheck() for why the
 * override machinery's own code identity is instead re-verified only at arm time).
 *
 * Two narrow amendments (VFX3-HGO merge reconciliation, NVA-HGOHEAD-1 /
 * NVA-BL-20 F5): the narrowing above exists to let ORDINARY, benign repository
 * churn (an unrelated commit landing, a ledger append) pass without spurious
 * drift -- it was never meant to erase the two cases below, which are not
 * ordinary churn but a change in the very thing this gate exists to bind:
 * (1) `head === null` (unborn HEAD) is a sentinel for "no history to compare
 * against yet", not an ordinary value among others -- a repository gaining its
 * first commit between record and plan/refreeze is a genuine identity
 * transition, always compared regardless of mode (for `global-plugin-install`
 * requests `head` is always `null` on both sides, so this stays a no-op there).
 * (2) for `global-plugin-install` requests, `repository.statusSha256` IS the
 * Codex-marketplace-registration observation this mode exists to attest --
 * unlike ordinary `statusSha256` (git status, deliberately ignored above), it
 * carries no benign-churn case, so it is compared in full, never narrowed.
 */
function assertNoRequestDrift(repository, policy, request, { isLocalPluginInstall = false } = {}) {
  const unbornTransitioned = (repository.head === null) !== (request.repository.head === null);
  const marketplaceDrifted = isLocalPluginInstall
    && repository.statusSha256 !== request.repository.statusSha256;
  if (repository.fingerprintSha256 !== request.repository.fingerprintSha256
    || canonical(policy) !== canonical(request.policy)
    || unbornTransitioned
    || marketplaceDrifted) {
    fail("HGO-DRIFT", "override request preimage drifted");
  }
}

function key(paths, { create = false } = {}) {
  if (!existsSync(paths.key)) {
    if (!create) fail("HGO-AUDIT-KEY", "audit key is missing");
    try { writeExclusive(paths.key, randomBytes(32)); }
    catch (error) {
      // Two first appends may race before an audit lock exists. The exclusive
      // key publication has one winner; every loser authenticates the winner's
      // exact private key below rather than replacing it.
      if (error?.code !== "EEXIST") throw error;
    }
  }
  safePrivateFile(paths.key);
  const bytes = readFileSync(paths.key);
  if (bytes.length !== 32) fail("HGO-AUDIT", "audit key is invalid");
  return bytes;
}

function procStart(pid) {
  const text = readFileSync(`/proc/${pid}/stat`, "utf8");
  const close = text.lastIndexOf(")");
  if (close < 0) throw new Error("invalid proc stat");
  const fields = text.slice(close + 2).trim().split(/\s+/u);
  if (fields.length < 20 || !/^[0-9]+$/u.test(fields[19])) throw new Error("invalid proc start");
  return fields[19];
}

// The audit-lock host seam (T90-F, Ruling 111). An audit-lock owner is judged against "the
// host": its platform, hostname, boot identity and a pid probe. Everything the verdict reads
// from the machine goes through this one object, so a caller can stand in for another
// machine by passing `dependencies.auditLockHost` to acquireAuditLock. With nothing injected
// every member is the real host. All members are optional:
//   platform       string               default process.platform
//   hostname       string               default os.hostname()
//   bootId         string               a ready boot identity; wins over uptime and /proc
//   uptimeSeconds  number               win32 only; with nowMs it derives the boot minute
//   nowMs          number               default Date.now()
//   pidAlive       (pid) => boolean     default process.kill(pid, 0); false only for ESRCH
//   processIdentity (pid) => observation default fixed native Windows process start query
// The Linux branch still reads /proc/<pid>/stat for the process start time, so injecting
// platform "linux" on a host without /proc is unsupported.
const WIN32_BOOT_MINUTE = /^[0-9]{1,15}$/u;
// A win32 boot time is `now - uptime` floored to the minute, and that estimate wobbles by up
// to about a second between two reads, so a boot time near a minute edge can floor to
// adjacent minutes in the owner's write and the reader's check. Judging such a live owner
// dead would steal a live lock, so adjacent minutes count as the same boot. A reboot moves
// the boot time by at least the previous uptime, far beyond this.
const WIN32_BOOT_MINUTE_TOLERANCE = 1;

function defaultPidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error?.code === "ESRCH") return false;
    if (error?.code === "EPERM") return true;
    throw error;
  }
}

function win32BootMinute(nowMs, uptimeSeconds) {
  if (!Number.isFinite(nowMs) || !Number.isFinite(uptimeSeconds) || uptimeSeconds < 0) return "unavailable";
  const minute = Math.floor((nowMs - uptimeSeconds * 1000) / 60000);
  return Number.isSafeInteger(minute) && minute > 0 ? String(minute) : "unavailable";
}

function resolveAuditLockHost(injected) {
  if (injected !== undefined && !object(injected)) {
    fail("HGO-AUDIT-LOCK-MALFORMED", "audit lock host seam is invalid");
  }
  const seam = injected ?? {};
  if ((seam.platform !== undefined && typeof seam.platform !== "string")
    || (seam.hostname !== undefined && typeof seam.hostname !== "string")
    || (seam.bootId !== undefined && typeof seam.bootId !== "string")
    || (seam.uptimeSeconds !== undefined && typeof seam.uptimeSeconds !== "number")
    || (seam.nowMs !== undefined && typeof seam.nowMs !== "number")
    || (seam.pidAlive !== undefined && typeof seam.pidAlive !== "function")
    || (seam.processIdentity !== undefined && typeof seam.processIdentity !== "function")) {
    fail("HGO-AUDIT-LOCK-MALFORMED", "audit lock host seam is invalid");
  }
  const platform = seam.platform ?? process.platform;
  return {
    platform,
    hostId: () => (seam.hostname ?? hostname()).toLowerCase(),
    bootId: () => {
      if (seam.bootId !== undefined) return seam.bootId.trim().toLowerCase();
      if (platform === "linux") return readFileSync("/proc/sys/kernel/random/boot_id", "utf8").trim().toLowerCase();
      if (platform === "win32") return win32BootMinute(seam.nowMs ?? Date.now(), seam.uptimeSeconds ?? uptime());
      return "unavailable";
    },
    pidAlive: seam.pidAlive ?? defaultPidAlive,
    processIdentity: seam.processIdentity ?? ((pid) => observeWindowsProcessIdentity({ pid })),
  };
}

function localAuditLockOwner(host = resolveAuditLockHost()) {
  const hostId = host.hostId();
  const linux = host.platform === "linux";
  const bootId = host.bootId();
  if (!SAFE_ID.test(hostId) || !SAFE_ID.test(bootId)) {
    fail("HGO-AUDIT-LOCK-AMBIGUOUS", "audit lock host identity is unavailable");
  }
  return {
    platform: host.platform,
    hostId,
    bootId,
    pid: process.pid,
    processStart: linux ? procStart(process.pid) : host.platform === "win32"
      ? windowsAuditProcessIdentity(process.pid, host)?.processStart ?? "unavailable" : "unavailable",
    nonce: randomBytes(16).toString("hex"),
  };
}

function auditLockRecord(secret, owner, purpose) {
  const core = { schema: AUDIT_LOCK_SCHEMA, purpose, owner };
  return { ...core, mac: createHmac("sha256", secret).update(canonical(core)).digest("hex") };
}

function auditLockBytes(record) {
  return Buffer.from(`${JSON.stringify(record)}\n`, "utf8");
}

function lockIdentity(path, bytes = null) {
  const info = lstatSync(path);
  if (!info.isFile() || info.isSymbolicLink() || ![1, 2].includes(info.nlink)) {
    fail("HGO-AUDIT-LOCK-MALFORMED", "audit lock inode is unsafe");
  }
  if (process.platform !== "win32" && (info.mode & 0o077) !== 0) {
    fail("HGO-AUDIT-LOCK-MALFORMED", "audit lock permissions are unsafe");
  }
  if (process.platform === "win32" && assessWindowsPrivatePath(path).status !== "secure") {
    fail("HGO-DACL", "audit lock DACL is not owner-private");
  }
  let publicationTwin = null;
  if (info.nlink === 2) {
    const prefix = `${basename(path)}.publish.`;
    const siblings = readdirSync(dirname(path), { withFileTypes: true });
    if (siblings.length > 256) fail("HGO-AUDIT-LOCK-MALFORMED", "audit lock directory exceeds the recovery bound");
    const matches = siblings.filter((entry) => entry.isFile() && !entry.isSymbolicLink()
      && entry.name.startsWith(prefix) && entry.name.endsWith(".tmp"))
      .map((entry) => join(dirname(path), entry.name))
      .filter((candidate) => {
        try {
          const twin = lstatSync(candidate);
          return twin.isFile() && !twin.isSymbolicLink() && twin.nlink === 2
            && String(twin.dev) === String(info.dev) && String(twin.ino) === String(info.ino);
        } catch { return false; }
      });
    if (matches.length !== 1) fail("HGO-AUDIT-LOCK-MALFORMED", "audit lock publication twin is ambiguous");
    publicationTwin = matches[0];
  }
  const actual = readFileSync(path);
  if (actual.length > 4096) fail("HGO-AUDIT-LOCK-MALFORMED", "audit lock metadata exceeds its bound");
  if (bytes !== null && !actual.equals(bytes)) return null;
  return { dev: String(info.dev), ino: String(info.ino), bytes: actual, publicationTwin };
}

function finalizeInterruptedAuditLockPublication(path, identity) {
  if (identity.publicationTwin === null) return identity;
  let canonicalInfo;
  let twinInfo;
  try {
    canonicalInfo = lstatSync(path);
    twinInfo = lstatSync(identity.publicationTwin);
  } catch {
    fail("HGO-AUDIT-LOCK-CHANGED", "audit lock publication twin changed before recovery");
  }
  if (!canonicalInfo.isFile() || canonicalInfo.isSymbolicLink() || canonicalInfo.nlink !== 2
    || !twinInfo.isFile() || twinInfo.isSymbolicLink() || twinInfo.nlink !== 2
    || String(canonicalInfo.dev) !== identity.dev || String(canonicalInfo.ino) !== identity.ino
    || String(twinInfo.dev) !== identity.dev || String(twinInfo.ino) !== identity.ino
    || !readFileSync(path).equals(identity.bytes) || !readFileSync(identity.publicationTwin).equals(identity.bytes)) {
    fail("HGO-AUDIT-LOCK-CHANGED", "audit lock publication twin changed before recovery");
  }
  try { unlinkSync(identity.publicationTwin); }
  catch (error) { if (error?.code !== "ENOENT") fail("HGO-AUDIT-LOCK-CHANGED", "audit lock publication twin could not be removed"); }
  const finalized = lockIdentity(path, identity.bytes);
  if (finalized === null || finalized.dev !== identity.dev || finalized.ino !== identity.ino
    || finalized.publicationTwin !== null) {
    fail("HGO-AUDIT-LOCK-CHANGED", "audit lock changed while finalizing publication");
  }
  return finalized;
}

function sameLockIdentity(path, identity) {
  try {
    const current = lockIdentity(path, identity.bytes);
    return current !== null && current.dev === identity.dev && current.ino === identity.ino;
  } catch { return false; }
}

function readAuditLock(path, secret) {
  let identity;
  try { identity = lockIdentity(path); }
  catch (error) {
    if (error instanceof HumanGuardOverrideError) throw error;
    fail("HGO-AUDIT-LOCK-MALFORMED", "audit lock metadata is unreadable");
  }
  if (identity.bytes.length === 0) fail("HGO-AUDIT-LOCK-LEGACY", "legacy empty audit lock requires manual disposition");
  let value;
  try { value = JSON.parse(identity.bytes.toString("utf8")); }
  catch { fail("HGO-AUDIT-LOCK-MALFORMED", "audit lock metadata is malformed"); }
  if (!identity.bytes.equals(Buffer.from(`${JSON.stringify(value)}\n`, "utf8"))
    || !exactKeys(value, ["schema", "purpose", "owner", "mac"])
    || value.schema !== AUDIT_LOCK_SCHEMA || !SHA256.test(value.mac ?? "")
    || !["genesis", "existing", "recovery"].includes(value.purpose)
    || !object(value.owner)
    || !exactKeys(value.owner, ["platform", "hostId", "bootId", "pid", "processStart", "nonce"])
    || !SAFE_ID.test(value.owner.platform ?? "")
    || !SAFE_ID.test(value.owner.hostId ?? "") || !SAFE_ID.test(value.owner.bootId ?? "")
    || !Number.isSafeInteger(value.owner.pid) || value.owner.pid < 1
    || !SAFE_ID.test(value.owner.processStart ?? "")
    || !/^[a-f0-9]{32}$/u.test(value.owner.nonce ?? "")) {
    fail("HGO-AUDIT-LOCK-MALFORMED", "audit lock metadata is malformed");
  }
  const core = { schema: value.schema, purpose: value.purpose, owner: value.owner };
  const expected = createHmac("sha256", secret).update(canonical(core)).digest("hex");
  if (value.mac !== expected) fail("HGO-AUDIT-LOCK-UNVERIFIED", "audit lock ownership authentication failed");
  return { record: value, identity: finalizeInterruptedAuditLockPublication(path, identity) };
}

function linuxAuditLockOwnerState(owner, host) {
  let localHost;
  let localBoot;
  try {
    localHost = host.hostId();
    localBoot = host.bootId();
  } catch { return "ambiguous"; }
  if (owner.hostId !== localHost) return "ambiguous";
  if (owner.bootId !== localBoot) return "dead";
  try { return procStart(owner.pid) === owner.processStart ? "live" : "dead"; }
  catch (error) { return error?.code === "ENOENT" ? "dead" : "ambiguous"; }
}

// Only a closed actual process observation contributes a Windows start identity.
// The dependency seam is methodological; it does not itself certify native evidence.
function windowsAuditProcessIdentity(pid, host) {
  let observed;
  try { observed = host.processIdentity(pid); } catch { return null; }
  if (!object(observed) || observed.pid !== pid) return null;
  if (observed.status === "absent" && exactKeys(observed, ["status", "pid"])) return observed;
  if (observed.status !== "present" || !exactKeys(observed, ["status", "pid", "processStart"])
    || typeof observed.processStart !== "string") return null;
  const match = /^win32-([1-9][0-9]{0,18})$/u.exec(observed.processStart ?? "");
  if (match === null || BigInt(match[1]) > 3155378975999999999n) return null;
  return observed;
}

// Original Windows acceptance: a live/reused/unverifiable present PID is ambiguous,
// including across boots. Boot-minute estimates alone cannot reclaim that PID's lock.
function win32AuditLockOwnerState(owner, host) {
  let localHost;
  try { localHost = host.hostId(); } catch { return "ambiguous"; }
  if (owner.hostId !== localHost) return "ambiguous";
  let present;
  try { present = host.pidAlive(owner.pid); } catch { return "ambiguous"; }
  if (present === false) return "dead";
  if (present !== true) return "ambiguous";
  const observed = windowsAuditProcessIdentity(owner.pid, host);
  if (observed?.status === "absent") return "dead";
  // Equal identity is still live; different identity is PID reuse. Neither is recoverable.
  return "ambiguous";
}

function auditLockOwnerState(record, host = resolveAuditLockHost()) {
  if (record.owner.platform !== host.platform) return "ambiguous";
  if (host.platform === "linux") return linuxAuditLockOwnerState(record.owner, host);
  if (host.platform === "win32") return win32AuditLockOwnerState(record.owner, host);
  return "ambiguous";
}

// T90-F3 (Ruling 136): the recovery names the lock file relative to the directory that holds the
// store's `.git`, the main checkout root (also from a linked worktree, whose store is the main
// checkout's). The form is derived from the lock path alone, <common>/agent-pipeline/
// human-guard-overrides/<name>, never from the process cwd. When the common dir's basename is not
// `.git` (a separate git dir, a bare or submodule git dir) there is nothing the path can be
// relative to, so null. The result must also satisfy the renderer's closed file shape, so a
// recovery this module emits is one humanGuardAuditLockRecoveryLine can render.
function auditLockRecoveryFile(lockPath) {
  if (typeof lockPath !== "string" || lockPath === "") return null;
  const store = dirname(lockPath);
  const agentPipeline = dirname(store);
  if (basename(store) !== "human-guard-overrides" || basename(agentPipeline) !== "agent-pipeline") return null;
  if (basename(dirname(agentPipeline)) !== ".git") return null;
  const relativeFile = `.git/agent-pipeline/human-guard-overrides/${basename(lockPath)}`;
  return AUDIT_LOCK_RECOVERY_FILE.test(relativeFile) ? relativeFile : null;
}

// An ambiguous owner is a refusal only an attended human can resolve, so the refusal types
// the way out: the lock file (main-checkout-relative, see auditLockRecoveryFile) and the command
// that removes it. The message is kept as before; the recovery is a separate own property, and it
// is absent (no property at all) when the store's common dir is not named `.git`.
function ambiguousAuditLockRefusal(message, lockPath) {
  const error = new HumanGuardOverrideError("HGO-AUDIT-LOCK-AMBIGUOUS", message);
  const relativeFile = auditLockRecoveryFile(lockPath);
  if (relativeFile === null) return error;
  const win32 = process.platform === "win32";
  const quoted = win32
    ? `'${relativeFile.replaceAll("'", "''")}'`
    : `'${relativeFile.replaceAll("'", "'\\''")}'`;
  error.recovery = {
    files: [relativeFile],
    command: win32 ? `Remove-Item -LiteralPath ${quoted}` : `rm -- ${quoted}`,
  };
  return error;
}

function publishAuditLock(path, secret, purpose, dependencies = {}) {
  const record = auditLockRecord(secret, localAuditLockOwner(resolveAuditLockHost(dependencies.auditLockHost)), purpose);
  const bytes = auditLockBytes(record);
  const temporary = `${path}.publish.${process.pid}.${randomBytes(8).toString("hex")}.tmp`;
  let fd;
  try {
    // Build the complete authenticated record under a unique private name.
    // Publishing with link(2) is create-only and atomic: a competing canonical
    // lock wins with EEXIST, while a killed publisher can leave only an
    // unreferenced temporary file, never an empty/partial canonical lock.
    fd = openSync(temporary, "wx", 0o600);
    writeFileSync(fd, bytes);
    fsyncSync(fd);
    closeSync(fd);
    fd = undefined;
    safePrivateFile(temporary);
    dependencies.afterTemporarySyncFn?.({ path, purpose, temporary });
    linkSync(temporary, path);
    dependencies.afterCanonicalLinkFn?.({ path, purpose, temporary });
    unlinkSync(temporary);
    safePrivateFile(path);
    const published = { path, record, identity: lockIdentity(path, bytes) };
    return published;
  } catch (error) {
    if (fd !== undefined) {
      try { closeSync(fd); } catch {}
    }
    try { unlinkSync(temporary); } catch {}
    throw error;
  }
}

function releaseOwnedAuditLock(lock) {
  if (!lock || !existsSync(lock.path) || !sameLockIdentity(lock.path, lock.identity)) return false;
  const quarantine = `${lock.path}.release.${process.pid}.${randomBytes(8).toString("hex")}`;
  renameSync(lock.path, quarantine);
  if (!sameLockIdentity(quarantine, lock.identity)) {
    // Never unlink a pathname that may be a replacement. Restore this inode
    // only if the canonical lock name is still free; otherwise quarantine is
    // retained as evidence and all later acquisition remains fail-closed.
    try { linkSync(quarantine, lock.path); unlinkSync(quarantine); } catch {}
    return false;
  }
  unlinkSync(quarantine);
  return true;
}

function clearAbandonedAuditRecovery(paths, secret, host) {
  if (!existsSync(paths.auditLockRecovery)) return;
  const observed = readAuditLock(paths.auditLockRecovery, secret);
  const state = auditLockOwnerState(observed.record, host);
  if (state === "live") fail("HGO-AUDIT-LOCK-RECOVERY-BUSY", "audit lock recovery is already active");
  if (state !== "dead") {
    throw ambiguousAuditLockRefusal("audit lock recovery owner state is ambiguous", paths.auditLockRecovery);
  }
  const quarantine = `${paths.auditLockRecovery}.dead.${process.pid}.${randomBytes(8).toString("hex")}`;
  try { renameSync(paths.auditLockRecovery, quarantine); }
  catch { fail("HGO-AUDIT-LOCK-CHANGED", "audit lock recovery guard changed during reclamation"); }
  if (!sameLockIdentity(quarantine, observed.identity)) {
    try { linkSync(quarantine, paths.auditLockRecovery); unlinkSync(quarantine); } catch {}
    fail("HGO-AUDIT-LOCK-CHANGED", "audit lock recovery guard replacement was quarantined");
  }
  unlinkSync(quarantine);
}

function acquireAuditLock(paths, secret, dependencies = {}) {
  const purpose = dependencies.purpose ?? "existing";
  if (!["genesis", "existing"].includes(purpose)) {
    fail("HGO-AUDIT-LOCK-MALFORMED", "audit lock purpose is invalid");
  }
  const host = resolveAuditLockHost(dependencies.auditLockHost);
  clearAbandonedAuditRecovery(paths, secret, host);
  try {
    const lock = publishAuditLock(paths.auditLock, secret, purpose, dependencies);
    if (existsSync(paths.auditLockRecovery)) {
      releaseOwnedAuditLock(lock);
      fail("HGO-AUDIT-LOCK-RECOVERY-BUSY", "audit lock recovery raced acquisition");
    }
    return lock;
  } catch (error) {
    if (error?.code !== "EEXIST") throw error;
  }

  const observed = readAuditLock(paths.auditLock, secret);
  const ownerState = auditLockOwnerState(observed.record, host);
  if (ownerState === "live") fail("HGO-AUDIT-LOCKED", "audit ledger is busy");
  if (ownerState !== "dead") throw ambiguousAuditLockRefusal("audit lock owner state is ambiguous", paths.auditLock);
  if (observed.record.purpose !== purpose) {
    fail("HGO-AUDIT-LOCK-STATE", "audit lock purpose does not match the requested ledger state");
  }

  let recovery;
  try { recovery = publishAuditLock(paths.auditLockRecovery, secret, "recovery", dependencies); }
  catch (error) {
    if (error?.code === "EEXIST") fail("HGO-AUDIT-LOCK-RECOVERY-BUSY", "audit lock recovery is already active");
    throw error;
  }
  let acquired;
  const quarantine = `${paths.auditLock}.dead.${process.pid}.${randomBytes(8).toString("hex")}`;
  try {
    dependencies.afterRecoveryGuardFn?.();
    const current = readAuditLock(paths.auditLock, secret);
    if (!sameLockIdentity(paths.auditLock, observed.identity)
      || canonical(current.record) !== canonical(observed.record)
      || auditLockOwnerState(current.record, host) !== "dead") {
      fail("HGO-AUDIT-LOCK-CHANGED", "audit lock changed during recovery");
    }
    renameSync(paths.auditLock, quarantine);
    dependencies.afterQuarantineFn?.();
    if (!sameLockIdentity(quarantine, observed.identity)) {
      try { linkSync(quarantine, paths.auditLock); unlinkSync(quarantine); } catch {}
      fail("HGO-AUDIT-LOCK-CHANGED", "audit lock replacement was quarantined during recovery");
    }
    acquired = publishAuditLock(paths.auditLock, secret, purpose, dependencies);
    unlinkSync(quarantine);
    return { ...acquired, recovered: true };
  } finally {
    if (recovery) releaseOwnedAuditLock(recovery);
  }
}

function authenticatedAuditLedger(paths, secret) {
  safePrivateFile(paths.audit);
  const ledgerBytes = readFileSync(paths.audit);
  const text = ledgerBytes.toString("utf8");
  if (!Buffer.from(text, "utf8").equals(ledgerBytes)
    || (text.length > 0 && !text.endsWith("\n"))) {
    fail("HGO-AUDIT", "audit ledger structure is invalid");
  }
  const entries = [];
  const endOffsets = [];
  let prior = "0".repeat(64);
  let byteOffset = 0;
  const lines = text.split("\n");
  lines.pop();
  for (const line of lines) {
    if (line === "") fail("HGO-AUDIT", "audit ledger structure is invalid");
    let entry;
    try { entry = JSON.parse(line); } catch { fail("HGO-AUDIT", "audit ledger is malformed"); }
    if (!exactKeys(entry, ["schema", "sequence", "previousMac", "event", "mac"])
      || entry.schema !== AUDIT_SCHEMA || entry.sequence !== entries.length + 1
      || entry.previousMac !== prior || !object(entry.event) || !SHA256.test(entry.mac)) {
      fail("HGO-AUDIT", "audit ledger structure is invalid");
    }
    const expected = createHmac("sha256", secret).update(canonical({
      schema: entry.schema,
      sequence: entry.sequence,
      previousMac: entry.previousMac,
      event: entry.event,
    })).digest("hex");
    if (entry.mac !== expected) fail("HGO-AUDIT", "audit ledger authentication failed");
    entries.push(entry);
    byteOffset += Buffer.byteLength(line, "utf8") + 1;
    endOffsets.push(byteOffset);
    prior = entry.mac;
  }
  return { entries, ledgerBytes, endOffsets };
}

function auditHead(secret, entries, ledgerBytes) {
  const core = {
    schema: AUDIT_HEAD_SCHEMA,
    entries: entries.length,
    lastMac: entries.at(-1)?.mac ?? null,
    ledgerSha256: sha(ledgerBytes),
  };
  return {
    ...core,
    mac: createHmac("sha256", secret).update(canonical(core)).digest("hex"),
  };
}

function auditRepairPreimage(head, ledgerBytes, entries) {
  return {
    schema: AUDIT_REPAIR_PREIMAGE_SCHEMA,
    head,
    ledgerSha256: sha(ledgerBytes),
    ledgerEntries: entries.length,
  };
}

function completedAuditRepair(ledger, secret, expectedPreimageSha256) {
  for (let index = ledger.entries.length - 1; index >= 0; index -= 1) {
    const event = ledger.entries[index].event;
    if (!exactKeys(event, [
      "type", "at", "repairPreimageSha256", "priorHeadEntries", "recoveredTailEntries",
    ]) || event.type !== "audit-repaired"
      || event.repairPreimageSha256 !== expectedPreimageSha256
      || !Number.isSafeInteger(event.priorHeadEntries) || event.priorHeadEntries < 0
      || !Number.isSafeInteger(event.recoveredTailEntries) || event.recoveredTailEntries <= 0
      || event.priorHeadEntries + event.recoveredTailEntries !== index) {
      continue;
    }
    const priorHeadEnd = event.priorHeadEntries === 0
      ? 0
      : ledger.endOffsets[event.priorHeadEntries - 1];
    const beforeRepairEnd = index === 0 ? 0 : ledger.endOffsets[index - 1];
    const priorHeadEntries = ledger.entries.slice(0, event.priorHeadEntries);
    const beforeRepairEntries = ledger.entries.slice(0, index);
    const priorHead = auditHead(
      secret,
      priorHeadEntries,
      ledger.ledgerBytes.subarray(0, priorHeadEnd),
    );
    const reconstructed = sha(auditRepairPreimage(
      priorHead,
      ledger.ledgerBytes.subarray(0, beforeRepairEnd),
      beforeRepairEntries,
    ));
    if (reconstructed === expectedPreimageSha256) return ledger.entries[index];
  }
  return null;
}

function validAuditHeadShape(head) {
  return exactKeys(head, ["schema", "entries", "lastMac", "ledgerSha256", "mac"])
    && head.schema === AUDIT_HEAD_SCHEMA
    && Number.isSafeInteger(head.entries) && head.entries >= 0
    && (head.lastMac === null || SHA256.test(head.lastMac))
    && SHA256.test(head.ledgerSha256)
    && SHA256.test(head.mac);
}

function auditState(paths, secret) {
  const hasAudit = existsSync(paths.audit);
  const hasHead = existsSync(paths.auditHead);
  const terminal = (reason) => ({ schema: AUDIT_STATE_SCHEMA, status: "terminal-invalid", reason });
  if (hasAudit !== hasHead) return terminal("audit ledger/head presence is inconsistent");
  if (!hasAudit) return terminal("audit ledger/head are missing");

  let ledger;
  let head;
  try {
    ledger = authenticatedAuditLedger(paths, secret);
    head = readJson(paths.auditHead);
  } catch (error) {
    if (error instanceof HumanGuardOverrideError) return terminal(error.message);
    throw error;
  }
  if (!validAuditHeadShape(head)) return terminal("audit ledger head structure is invalid");
  const headCore = {
    schema: head.schema,
    entries: head.entries,
    lastMac: head.lastMac,
    ledgerSha256: head.ledgerSha256,
  };
  const authenticatedHeadMac = createHmac("sha256", secret).update(canonical(headCore)).digest("hex");
  if (head.mac !== authenticatedHeadMac) return terminal("audit ledger head authentication failed");

  const expectedCurrent = auditHead(secret, ledger.entries, ledger.ledgerBytes);
  if (canonical(head) === canonical(expectedCurrent)) {
    return {
      schema: AUDIT_STATE_SCHEMA,
      status: "valid",
      entries: ledger.entries.length,
      lastMac: ledger.entries.at(-1)?.mac ?? null,
      head,
      ledger,
    };
  }
  if (head.entries >= ledger.entries.length) return terminal("audit ledger head does not bind a strict ledger prefix");
  const prefixEnd = head.entries === 0 ? 0 : ledger.endOffsets[head.entries - 1];
  const prefixBytes = ledger.ledgerBytes.subarray(0, prefixEnd);
  const expectedPrefixHead = auditHead(secret, ledger.entries.slice(0, head.entries), prefixBytes);
  if (canonical(head) !== canonical(expectedPrefixHead)) {
    return terminal("audit ledger head does not authenticate the ledger prefix");
  }

  const currentPreimageSha256 = sha(auditRepairPreimage(head, ledger.ledgerBytes, ledger.entries));
  const last = ledger.entries.at(-1);
  let repairPreimageSha256 = currentPreimageSha256;
  let completionPending = false;
  if (last && exactKeys(last.event, [
    "type", "at", "repairPreimageSha256", "priorHeadEntries", "recoveredTailEntries",
  ]) && last.event.type === "audit-repaired"
    && SHA256.test(last.event.repairPreimageSha256)
    && last.event.priorHeadEntries === head.entries
    && last.event.recoveredTailEntries === ledger.entries.length - head.entries - 1
    && last.event.recoveredTailEntries > 0) {
    const beforeRepairBytes = ledger.ledgerBytes.subarray(0, ledger.endOffsets.at(-2) ?? 0);
    const beforeRepairEntries = ledger.entries.slice(0, -1);
    const reconstructed = sha(auditRepairPreimage(head, beforeRepairBytes, beforeRepairEntries));
    if (reconstructed === last.event.repairPreimageSha256) {
      repairPreimageSha256 = reconstructed;
      completionPending = true;
    }
  }
  return {
    schema: AUDIT_STATE_SCHEMA,
    status: "recoverable-torn-append",
    entries: ledger.entries.length,
    headEntries: head.entries,
    tailEntries: ledger.entries.length - head.entries,
    repairPreimageSha256,
    completionPending,
    head,
    ledger,
  };
}

function publicAuditState(state) {
  const { head: _head, ledger: _ledger, ...result } = state;
  return result;
}

function requireValidAuditState(paths, secret) {
  const state = auditState(paths, secret);
  if (state.status === "valid") return state;
  if (state.status === "recoverable-torn-append") {
    fail(
      "HGO-AUDIT",
      `audit ledger has a recoverable torn append (repairPreimageSha256=${state.repairPreimageSha256}); `
        + "run guard-human-override.mjs repair-audit --repo <absolute-root> "
        + `--preimage-sha256 ${state.repairPreimageSha256} --activate in an attended terminal`,
    );
  }
  fail("HGO-AUDIT", state.reason);
}

function verifiedAuditEntries(paths, secret) {
  return requireValidAuditState(paths, secret).ledger.entries;
}

function appendAudit(paths, event) {
  const hasAudit = existsSync(paths.audit);
  const hasHead = existsSync(paths.auditHead);
  const initialize = !hasAudit && !hasHead;
  if (hasAudit !== hasHead) fail("HGO-AUDIT", "audit ledger/head presence is inconsistent");
  const unauthenticatedLock = existsSync(paths.auditLock)
    ? paths.auditLock
    : (existsSync(paths.auditLockRecovery) ? paths.auditLockRecovery : null);
  if (initialize && !existsSync(paths.key) && unauthenticatedLock !== null) {
    const size = lstatSync(unauthenticatedLock).size;
    fail(size === 0 ? "HGO-AUDIT-LOCK-LEGACY" : "HGO-AUDIT-LOCK-UNVERIFIED",
      "an audit lock exists before authenticated genesis material");
  }
  const hadKey = existsSync(paths.key);
  const secret = key(paths, { create: initialize });
  if (initialize && hadKey) {
    if (!existsSync(paths.auditLock)) fail("HGO-AUDIT", "audit ledger/head are missing");
    const interrupted = readAuditLock(paths.auditLock, secret);
    if (interrupted.record.purpose !== "genesis" || auditLockOwnerState(interrupted.record) !== "dead") {
      fail("HGO-AUDIT", "audit genesis cannot be authenticated as an interrupted first append");
    }
  }
  let lock;
  try {
    lock = acquireAuditLock(paths, secret, { purpose: initialize ? "genesis" : "existing" });
    const prior = initialize ? null : requireValidAuditState(paths, secret).ledger;
    const entries = prior?.entries ?? [];
    const core = {
      schema: AUDIT_SCHEMA,
      sequence: entries.length + 1,
      previousMac: entries.at(-1)?.mac ?? "0".repeat(64),
      event,
    };
    const entry = { ...core, mac: createHmac("sha256", secret).update(canonical(core)).digest("hex") };
    // Preserve the old head's exact byte prefix so interruption after this
    // append remains recoverable even for authenticated noncanonical JSON.
    const ledgerBytes = Buffer.concat([
      prior?.ledgerBytes ?? Buffer.alloc(0),
      Buffer.from(`${JSON.stringify(entry)}\n`, "utf8"),
    ]);
    writeAtomic(paths.audit, ledgerBytes);
    writeAtomic(
      paths.auditHead,
      Buffer.from(`${JSON.stringify(auditHead(secret, [...entries, entry], ledgerBytes))}\n`, "utf8"),
    );
    return entry;
  } finally {
    releaseOwnedAuditLock(lock);
  }
}

// ---------------------------------------------------------------------------------
// R-AC-08 / R-AC-10: the command-offer journal for the external-operator hand-off.
//
// A second consumer of this module's existing fsync'd write discipline, never a
// second write discipline: `writeAtomic` above, the same owner-private directory
// `storage()` already returns, one JSON object per line.
//
// Deliberately NOT the HMAC-chained override ledger. That ledger records the
// override authority trail (denied/authorized/consumed) under a key whose custody
// is the thing being protected; this file records observational journal events for
// routes that never produce an override request at all. Chaining an observational
// record into an authority ledger would let a journal write failure corrupt the
// authority chain -- and would make the journal's own key custody a new problem.
//
// No lock file: unlike `appendAudit`, an entry here neither reads nor re-macs the
// prior entries, one guard hand-off is written per synchronous tool-call decision,
// and `writeAtomic`'s rename is atomic. The readback below then verifies OUR OWN
// line, so a concurrent writer can never be mistaken for a successful append.
// ---------------------------------------------------------------------------------
function appendCommandOfferJournal(event, { paths } = {}) {
  const path = paths.commandOffers;
  let prior = Buffer.alloc(0);
  if (existsSync(path)) {
    safePrivateFile(path);
    prior = readFileSync(path);
  }
  const line = Buffer.from(`${JSON.stringify(event)}\n`, "utf8");
  writeAtomic(path, Buffer.concat([prior, line]));
  const lines = readFileSync(path, "utf8").split("\n").filter(Boolean);
  let readback;
  try { readback = JSON.parse(lines.at(-1) ?? ""); }
  catch { fail("HGO-COMMAND-OFFER-JOURNAL", "command offer journal readback is malformed"); }
  if (canonical(readback) !== canonical(event)) {
    fail("HGO-COMMAND-OFFER-JOURNAL", "command offer journal readback does not match the appended event");
  }
  return { eventId: readback.eventId, candidateDigest: readback.candidateDigest, integrity: "verified" };
}

/**
 * The five SHA-256 context digests `buildGuardHandoffOfferEvent` requires, every
 * one derived with this module's own `sha()` over values the denial already holds
 * -- never over raw command text, argv, or tool input.
 */
function commandOfferDigests({ repo, repository, policy, toolName, eligiblePaths }) {
  return {
    candidateDigest: sha({
      kind: "pipeline.guard-handoff-offer-candidate.v1",
      fingerprint: repository?.fingerprintSha256 ?? null,
      head: repository?.head ?? null,
      tree: repository?.tree ?? null,
      statusSha256: repository?.statusSha256 ?? null,
    }),
    repositoryFingerprint: SHA256.test(String(repository?.fingerprintSha256))
      ? repository.fingerprintSha256
      : sha({ physicalRoot: repo.root, physicalCommon: repo.common }),
    scopeDigest: sha({
      kind: "pipeline.guard-handoff-offer-scope.v1",
      root: repo.root,
      toolName: String(toolName ?? ""),
      eligiblePaths: [...(eligiblePaths ?? [])].map(String).sort(),
    }),
    policyDigest: sha(policy),
    redactionPolicyDigest: sha({
      policy: GUARD_HANDOFF_REDACTION_POLICY,
      omissions: GUARD_HANDOFF_OFFER_OMISSIONS,
    }),
  };
}

/**
 * R-AC-08/R-AC-10 seam: no external-operator route leaves this module until its
 * hand-off has been journaled as a validated `command-offer` in state `offered`.
 *
 * Fail-closed shape on ANY journaling failure: the same `status`/`code` -- the
 * denial itself must still reach the caller -- with `nextAction` ABSENT and a
 * typed `journalRefusal`. Deliberately not a throw: this runs inside a PreToolUse
 * hook, where a throw would replace a typed refusal with an unroutable crash
 * (the exact defect ADR-0059 Decision 4 already had to close once).
 */
function journaledExternalOperatorRoute(route, {
  repo, repository, pluginRoot, toolName, denials, eligiblePaths, nowMs, appendCommandOffer,
}) {
  try {
    const paths = storage(repo.common);
    const offer = buildGuardHandoffOfferEvent({
      route,
      toolName,
      ...commandOfferDigests({
        repo,
        repository,
        policy: policyIdentity(repo.root, pluginRoot, denials),
        toolName,
        eligiblePaths,
      }),
      occurredAtEpochMs: nowMs,
    });
    return hgoPlanningPublication({repo, paths, entry: "record-denial", intendedPath: paths.commandOffers, inputSha256: sha(offer)}, () => {
      recordGuardHandoffOffer({ offer, append: (value) => appendCommandOffer(value, { paths }) });
      return route;
    });
  } catch {
    const refused = Object.fromEntries(
      Object.entries(route).filter(([name]) => name !== "nextAction"),
    );
    return { ...refused, journalRefusal: GUARD_HANDOFF_JOURNAL_REFUSAL };
  }
}

const CAPABILITY_KEYS = [
  "schema",
  "status",
  "root",
  "requestSha256",
  "planSha256",
  "selectionSha256",
  "reasonSha256",
  "humanApproval",
  "plugin",
  "repository",
  // Part A step 5 (design doc §1.4): the exact candidate the PO's signature
  // covers ({commit, tree} | null) -- signature path only, null on the chat
  // path (Finding 1's scope). Additive on v2 (design doc §1.7 leaves the v2-vs-v3
  // choice to this dispatch; this is the only in-tree exact-key-set reader of
  // this schema outside this file's own tests, per grep, so keeping v2 does not
  // silently break another reader).
  "signedCandidate",
  "toolName",
  "toolInputSha256",
  "commandClass",
  "externalReadOnly",
  "denials",
  "policy",
  "preview",
  "eligiblePaths",
  "mode",
  "authorSourceRoot",
  "authorizedAt",
  "expiresAt",
  "consumedAt",
  "mac",
];

function capabilityMac(secret, value) {
  const core = Object.fromEntries(
    Object.entries(value).filter(([name]) => name !== "mac"),
  );
  return createHmac("sha256", secret).update(canonical(core)).digest("hex");
}

function validatedCapability(paths, path) {
  const value = readJson(path);
  const native = value.schema === NATIVE_CAPABILITY_SCHEMA;
  if (!exactKeys(value, native ? [...CAPABILITY_KEYS, "nativeTargets"] : CAPABILITY_KEYS)
    || !(value.schema === CAPABILITY_SCHEMA || native)
    || (native && (!NATIVE_FILE_TOOLS.has(value.toolName) || !nativeTargetsValid(value.nativeTargets, value.eligiblePaths)))
    || !new Set(["armed", "consumed"]).has(value.status)
    || !SHA256.test(value.requestSha256 ?? "")
    || !SHA256.test(value.planSha256 ?? "")
    || !SHA256.test(value.selectionSha256 ?? "")
    || !SHA256.test(value.reasonSha256 ?? "")
    || !(object(value.humanApproval)
      && ((value.humanApproval.mode === "chat-attributed-unattested"
        && exactKeys(value.humanApproval, ["mode", "kind"])
        && new Set(["human-guard-override", "external-read-only-po-chat"]).has(value.humanApproval.kind))
        || (value.humanApproval.mode === "signature-verified"
          && exactKeys(value.humanApproval, ["mode"]))))
    || !SHA256.test(value.toolInputSha256 ?? "")
    || typeof value.commandClass !== "string" || value.commandClass.trim() === ""
    || typeof value.externalReadOnly !== "boolean"
    || !(value.signedCandidate === null
      || (object(value.signedCandidate) && exactKeys(value.signedCandidate, ["commit", "tree"])
        && typeof value.signedCandidate.commit === "string" && value.signedCandidate.commit !== ""
        && typeof value.signedCandidate.tree === "string" && value.signedCandidate.tree !== ""))
    || !object(value.policy) || !object(value.preview)
    || !persistedDenialsValid(value)
    || !new Set(["standard", "pipeline-author-repair", "global-plugin-install"]).has(value.mode)
    || !(value.authorSourceRoot === null || typeof value.authorSourceRoot === "string")
    || !SHA256.test(value.mac ?? "")
    || !(value.consumedAt === null || typeof value.consumedAt === "string")
    || value.mac !== capabilityMac(key(paths), value)) {
    fail("HGO-CAPABILITY", "override capability authentication failed");
  }
  return value;
}

function hasAuthorizedAuditEntry(paths, capability) {
  const entries = verifiedAuditEntries(paths, key(paths));
  return entries.some(({ event }) => event?.type === "authorized"
    && event.requestSha256 === capability.requestSha256
    && event.planSha256 === capability.planSha256
    && event.reasonSha256 === capability.reasonSha256
    && event.selectionSha256 === capability.selectionSha256
    && canonical(event.humanApproval) === canonical(capability.humanApproval)
    && event.mode === capability.mode
    && event.authorSourceRoot === capability.authorSourceRoot
    && event.at === capability.authorizedAt);
}

function validatedRequest(paths, requestSha256, request = readJson(requestPath(paths, requestSha256))) {
  const native = isNativeRequestSchema(request.schema);
  const patchBearing = request.schema === NATIVE_REQUEST_SCHEMA;
  if (!exactKeys(request, [
    "schema", "root", "plugin", "repository", "toolName", "toolInputSha256", "denials",
    "policy", "preview", "eligiblePaths", "commandClass", "externalReadOnly", "mode", "authorSourceRoot", "createdAt", "expiresAt",
    ...(native ? ["nativeTargets"] : []),
    ...(patchBearing ? ["patchInput"] : []),
  ])
    || (patchBearing && !(request.toolName === "apply_patch"
      ? object(request.patchInput) && typeof request.patchInput.command === "string"
        && toolInputIdentitySha256(request.toolName, request.patchInput) === request.toolInputSha256
      : request.patchInput === null))
    || !(request.schema === REQUEST_SCHEMA || native) || request.root === undefined
    || (native && (!NATIVE_FILE_TOOLS.has(request.toolName) || !nativeTargetsValid(request.nativeTargets, request.eligiblePaths)))
    || !new Set(["standard", "pipeline-author-repair-candidate", "global-plugin-install"]).has(request.mode)
    || request.authorSourceRoot !== null
    || typeof request.externalReadOnly !== "boolean"
    || !SHA256.test(request.toolInputSha256) || !persistedDenialsValid(request)
    || sha(request) !== requestSha256) fail("HGO-REQUEST", "override request is invalid");
  return request;
}

// ---------------------------------------------------------------------------------
// AC-264 point 1 (item pipeline.hgo-patch-preflight-before-signature): dry-run the stored
// apply_patch text against the frozen preimage BEFORE a human signature is requested. A small
// closed converter turns the `*** Begin Patch` envelope (Add File / Update File with @@ hunks /
// Delete File) into a unified diff; `git apply --check` is the independent second opinion.
// Move, an unparsed line, a duplicate path, CR-bearing or non-UTF-8 text are refused with
// HGO-PATCH-UNSUPPORTED, never guessed. Every message is a constant: no path and no patch
// content ever reaches an error, a log or a report.
// ---------------------------------------------------------------------------------
const PATCH_PREFLIGHT_MESSAGE = "patch does not apply to the frozen preimage";
const PATCH_UNSUPPORTED_MESSAGE = "patch form is outside the closed preflight grammar";
const PATCH_NO_NEWLINE_MARKER = "\\ No newline at end of file";
const PATCH_PATH = /^[A-Za-z0-9._@+=,~-]+(?:\/[A-Za-z0-9._@+=,~-]+)*$/u;

function patchPreflightFail() { fail("HGO-PATCH-PREFLIGHT", PATCH_PREFLIGHT_MESSAGE); }
function patchUnsupportedFail() { fail("HGO-PATCH-UNSUPPORTED", PATCH_UNSUPPORTED_MESSAGE); }

function parsePatchEnvelope(command) {
  if (typeof command !== "string") patchUnsupportedFail();
  const normalized = command.replace(/\r\n/gu, "\n").replace(/\n+$/u, "");
  if (/[\r\0]/u.test(normalized)) patchUnsupportedFail();
  const all = normalized.split("\n");
  if (all.length < 3 || all[0] !== "*** Begin Patch" || all[all.length - 1] !== "*** End Patch") patchUnsupportedFail();
  const body = all.slice(1, -1);
  const marker = (line) => line.startsWith("*** ");
  const sections = [];
  let index = 0;
  while (index < body.length) {
    const line = body[index];
    const add = /^\*\*\* Add File: (.+)$/u.exec(line);
    const del = /^\*\*\* Delete File: (.+)$/u.exec(line);
    const update = /^\*\*\* Update File: (.+)$/u.exec(line);
    index += 1;
    if (add) {
      const lines = [];
      while (index < body.length && !marker(body[index])) {
        if (!body[index].startsWith("+")) patchUnsupportedFail();
        lines.push(body[index].slice(1));
        index += 1;
      }
      sections.push({ kind: "add", path: add[1], lines });
    } else if (del) {
      sections.push({ kind: "delete", path: del[1] });
    } else if (update) {
      // `*** Move to:` is itself a marker line: it ends the hunk scan and a rename is refused below.
      const hunks = [];
      let current = null;
      while (index < body.length) {
        const row = body[index];
        if (row === "*** End of File") {
          if (current === null) patchUnsupportedFail();
          current.eof = true;
          index += 1;
          continue;
        }
        if (marker(row)) break;
        index += 1;
        if (row === "@@" || row.startsWith("@@ ")) {
          current = { header: row === "@@" ? null : row.slice(3), changes: [], eof: false };
          hunks.push(current);
          continue;
        }
        if (current === null) {
          current = { header: null, changes: [], eof: false };
          hunks.push(current);
        }
        if (current.eof) patchUnsupportedFail();
        const op = row === "" ? " " : row[0];
        if (op !== " " && op !== "-" && op !== "+") patchUnsupportedFail();
        current.changes.push({ op, text: row === "" ? "" : row.slice(1) });
      }
      if (hunks.length === 0 || hunks.some((hunk) => !hunk.changes.some((change) => change.op !== " "))) patchUnsupportedFail();
      sections.push({ kind: "update", path: update[1], hunks });
    } else {
      patchUnsupportedFail();
    }
  }
  if (sections.length === 0 || sections.length > NATIVE_TARGET_MAX_FILES
    || new Set(sections.map((section) => section.path)).size !== sections.length) patchUnsupportedFail();
  return sections;
}

function splitPatchPreimage(text) {
  const newline = text === "" || text.endsWith("\n");
  const lines = text === "" ? [] : text.split("\n");
  if (text !== "" && newline) lines.pop();
  return { lines, newline };
}

// Exact match first, then trailing-whitespace-insensitive, then fully trimmed: the same
// tolerance ladder the applying tool uses. The emitted diff carries the PREIMAGE text for every
// context and removed line, so `git apply --check` stays byte-exact whatever level matched.
function seekPatchLines(lines, pattern, from, endOfFile) {
  for (const norm of [(value) => value, (value) => value.trimEnd(), (value) => value.trim()]) {
    const want = pattern.map(norm);
    const last = lines.length - pattern.length;
    const fits = (at) => want.every((value, offset) => norm(lines[at + offset]) === value);
    if (endOfFile && last >= from && fits(last)) return last;
    for (let at = from; at <= last; at += 1) if (fits(at)) return at;
  }
  return -1;
}

function patchUpdateHunks(hunks, { lines, newline }) {
  const out = [];
  let cursor = 0;
  let delta = 0;
  for (const hunk of hunks) {
    if (hunk.header !== null) {
      const at = seekPatchLines(lines, [hunk.header], cursor, false);
      if (at < 0) patchPreflightFail();
      cursor = at + 1;
    }
    let changes = hunk.changes;
    let start;
    if (!changes.some((change) => change.op !== "+")) {
      // A pure insertion appends at the end of the file, as the applying tool does. When the file
      // lacks a final newline the last line joins the hunk so the diff can express that.
      if (lines.length > 0 && !newline) {
        changes = [{ op: " ", text: lines[lines.length - 1] }, ...changes];
        start = lines.length - 1;
      } else {
        start = lines.length;
      }
    } else {
      start = seekPatchLines(lines, changes.filter((change) => change.op !== "+").map((change) => change.text), cursor, hunk.eof);
    }
    if (start < cursor) patchPreflightFail();
    const body = [];
    let oldCount = 0;
    let newCount = 0;
    let position = start;
    for (const change of changes) {
      if (change.op === "+") {
        body.push(`+${change.text}`);
        newCount += 1;
        continue;
      }
      const actual = lines[position];
      const unterminated = position === lines.length - 1 && !newline;
      position += 1;
      oldCount += 1;
      if (change.op === "-") {
        body.push(`-${actual}`);
        if (unterminated) body.push(PATCH_NO_NEWLINE_MARKER);
        continue;
      }
      newCount += 1;
      if (unterminated) body.push(`-${actual}`, PATCH_NO_NEWLINE_MARKER, `+${actual}`);
      else body.push(` ${actual}`);
    }
    out.push(`@@ -${oldCount > 0 ? start + 1 : start},${oldCount} +${newCount > 0 ? start + delta + 1 : start + delta},${newCount} @@`, ...body);
    delta += newCount - oldCount;
    cursor = start + oldCount;
  }
  return out;
}

/**
 * Pure converter (exported for unit tests): `resolveTarget(rawPath)` returns
 * `{ path: <repo-relative path>, text: <frozen preimage text> | null when absent }`.
 * Returns a unified diff string; throws HGO-PATCH-PREFLIGHT when a hunk cannot be located in
 * the preimage, HGO-PATCH-UNSUPPORTED for anything outside the closed grammar.
 */
export function convertPatchEnvelopeToUnifiedDiff(command, resolveTarget) {
  const sections = parsePatchEnvelope(command);
  const seen = new Set();
  const out = [];
  for (const section of sections) {
    const target = resolveTarget(section.path);
    const relative = target?.path;
    if (typeof relative !== "string" || !PATCH_PATH.test(relative)
      || relative.split("/").some((part) => part === "." || part === "..") || seen.has(relative)
      || !(target.text === null || (typeof target.text === "string" && !/[\r\0]/u.test(target.text)))) patchUnsupportedFail();
    seen.add(relative);
    out.push(`diff --git a/${relative} b/${relative}`);
    if (section.kind === "add") {
      if (target.text !== null) patchPreflightFail();
      out.push("new file mode 100644", "--- /dev/null", `+++ b/${relative}`);
      if (section.lines.length > 0) out.push(`@@ -0,0 +1,${section.lines.length} @@`, ...section.lines.map((line) => `+${line}`));
      continue;
    }
    if (target.text === null) patchPreflightFail();
    const preimage = splitPatchPreimage(target.text);
    if (section.kind === "delete") {
      out.push("deleted file mode 100644", `--- a/${relative}`, "+++ /dev/null");
      if (preimage.lines.length > 0) {
        out.push(`@@ -1,${preimage.lines.length} +0,0 @@`, ...preimage.lines.map((line) => `-${line}`));
        if (!preimage.newline) out.push(PATCH_NO_NEWLINE_MARKER);
      }
      continue;
    }
    out.push(`--- a/${relative}`, `+++ b/${relative}`, ...patchUpdateHunks(section.hunks, preimage));
  }
  return `${out.join("\n")}\n`;
}

// Runs inside prepareHumanGuardOverrideForSignature after planning and before any
// authorization, intent or signature material exists. Consume-time behaviour is unchanged.
function preflightPatchBeforeSignature(repo, paths, requestSha256, spawn) {
  const request = validatedRequest(paths, requestSha256);
  if (request.toolName !== "apply_patch") return;
  if (request.schema !== NATIVE_REQUEST_SCHEMA) {
    fail("HGO-PATCH-LEGACY", "request predates the stored patch text; record a fresh denial");
  }
  const frozen = new Map(request.nativeTargets.targets.map((row) => [row.path, row.preimage]));
  const diff = convertPatchEnvelopeToUnifiedDiff(request.patchInput.command, (rawPath) => {
    const safe = safePath(repo.root, rawPath);
    const preimage = safe === null ? undefined : frozen.get(safe.relative);
    if (preimage === undefined) patchUnsupportedFail();
    if (preimage.status === "absent") return { path: safe.relative, text: null };
    const bytes = readFileSync(safe.absolute);
    if (sha(bytes) !== preimage.sha256) fail("HGO-NATIVE-TARGET-DRIFT", "signed native target preimages changed");
    const text = bytes.toString("utf8");
    if (!Buffer.from(text, "utf8").equals(bytes)) patchUnsupportedFail();
    return { path: safe.relative, text };
  });
  const scratch = `${requestPath(paths, requestSha256)}.${process.pid}.${randomBytes(8).toString("hex")}.tmp`;
  let applied;
  try {
    writeExclusive(scratch, Buffer.from(diff, "utf8"));
    applied = spawn("git", ["apply", "--check", "--unidiff-zero", "--whitespace=nowarn", "--", scratch], {
      cwd: repo.root,
      encoding: "utf8",
      shell: false,
      timeout: 30000,
      env: { ...process.env, GIT_CEILING_DIRECTORIES: dirname(repo.root) },
    });
  } finally {
    try { unlinkSync(scratch); } catch {}
  }
  if (applied?.status !== 0 || applied?.error) patchPreflightFail();
}

// ---------------------------------------------------------------------------------
// ADR-0059 Decision 4: every denial reports its next step. recordHumanGuardDenial() below
// has THREE outcomes, not one -- it returns `planned` (there is a next step to print), it
// returns one of the other typed statuses (the route machinery worked and answered "not
// this way"), or it throws (the route machinery could not answer at all). Consuming guards
// rendered only the first and swallowed the other two, so a denial that could not be
// routed printed exactly like a denial that was never eligible for one: silence, the one
// outcome Decision 4 does not admit. Observed twice in the field -- a grammar denial
// against a path outside the repository root, and a TP-7 denial against a
// `plugins/pipeline-core/**` path (every write there is author repair and needs an explicit
// author source root, so it never reaches `planned`).
//
// This renders the line a guard prints INSTEAD of a route. The defect being closed is the
// swallowed reason, not the missing route, so this deliberately offers no command: it says
// that a route was attempted, and what the attempt observed.
//
// The digest omission below is a UX/attention nudge, not a security boundary: it is meant to
// make a human notice and personally drive a non-planned (e.g. author-repair) ceremony, not to
// keep an agent from learning requestSha256. It does not, because it cannot -- the underlying
// request record is written unconditionally to
// `<paths.requests>/<requestSha256>.json` before this function ever runs (`:1471`), and any
// session with ordinary filesystem read access can recover the digest from there. The real
// security boundary is downstream and unrelated to this rendering: authorizeHumanGuardOverride()
// and authorizeHumanGuardOverrideBySignature() cannot arm a capability without, respectively, an
// in-session activation gated to `chat` mode, or a genuine Ed25519 signature verified against the
// committed trust anchor (ADR-0059) -- neither of which knowing this digest grants. What this
// function still bounds, for its own sake (defense in depth, not the actual access control): only
// two tokens ever reach the output, each rendered only if it matches a typed-token shape and is
// short -- so no `/`, `\`, `:`, whitespace or newline can pass -- plus a fixed clause selected by
// the observed status. No error message, no stack, no digest, no path. `candidateSourceRoot`
// (the one field of a non-planned outcome carrying an absolute host path) is never read.
// ---------------------------------------------------------------------------------
const ROUTE_STATUS_TOKEN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u;
const ROUTE_CODE_TOKEN = /^[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*$/u;
const ROUTE_SUBJECT_TOKEN = /^[a-z]+(?: [a-z]+)*$/u;
const ROUTE_TOKEN_MAX_LENGTH = 64;
const ROUTE_UNTYPED_CODE = "HGO-UNTYPED";
const ROUTE_UNTYPED_STATUS = "unrecognized";

/**
 * Why THIS status carries no route. Keyed on the value actually observed; a status with no
 * entry here is still reported, just without a clause -- the guard never invents one.
 */
const ROUTE_STATUS_EXPLANATION = Object.freeze({
  "author-repair-required":
    "the target is Pipeline plugin source, so an override is author repair and needs an "
    + "explicit author source root, which a guard cannot select on the human's behalf",
  "narrower-recovery-required":
    "a narrower typed recovery is required instead of a general override",
  "external-operator-required":
    "the exact action must be carried out by an attended operator outside this session",
});

function routeToken(value, pattern, fallback) {
  return typeof value === "string"
    && value.length > 0
    && value.length <= ROUTE_TOKEN_MAX_LENGTH
    && pattern.test(value)
    ? value
    : fallback;
}

// T90-F2 (Ruling 125, Critic T90 F1/F2): the typed recovery of an ambiguous audit lock reaches a
// human. The recovery is produced by ambiguousAuditLockRefusal, but its `command` is never read
// here: every entry of `recovery.files` is re-validated against the closed shape below (one bad
// entry rejects the whole recovery, which fails closed to the unchanged two-line text) and the
// command is re-rendered from the validated files only.
const AUDIT_LOCK_AMBIGUOUS_CODE = "HGO-AUDIT-LOCK-AMBIGUOUS";
const AUDIT_LOCK_RECOVERY_FILE = /^\.git\/agent-pipeline\/human-guard-overrides\/(?!\.{1,2}$)[A-Za-z0-9._-]{1,64}$/u;
const AUDIT_LOCK_RECOVERY_MAX_FILES = 8;
const AUDIT_LOCK_RECOVERY_PRECONDITION = "only after confirming that no other Pipeline session is running an override ceremony";

/**
 * The ONE fixed attended-recovery line for an ambiguous audit lock, shared by the route renderer
 * below and the guard-human-override CLI.
 * @param {unknown} error a refusal carrying `code` and `recovery`.
 * @param {{platform?: string}} [options] delete-verb selector; the host platform when absent.
 * @returns {string|null} the line, or null when the code is not the ambiguous-lock code or the
 *   recovery is not well-formed (callers then print exactly what they printed before).
 */
export function humanGuardAuditLockRecoveryLine(error, options = {}) {
  try {
    if (error === null || typeof error !== "object" || error.code !== AUDIT_LOCK_AMBIGUOUS_CODE) return null;
    const recovery = error.recovery;
    if (recovery === null || typeof recovery !== "object" || Array.isArray(recovery)) return null;
    if (!Array.isArray(recovery.files)) return null;
    const files = Array.from(recovery.files);
    if (files.length === 0 || files.length > AUDIT_LOCK_RECOVERY_MAX_FILES) return null;
    for (const file of files) {
      if (typeof file !== "string" || !AUDIT_LOCK_RECOVERY_FILE.test(file)) return null;
    }
    const quoted = [...new Set(files)].map((file) => `'${file}'`);
    const requested = options !== null && typeof options === "object" ? options.platform : undefined;
    const win32 = (typeof requested === "string" ? requested : process.platform) === "win32";
    const caution = win32
      ? "; on win32 the lock owner may still be live, because a busy owner is reported as ambiguous too"
      : "";
    const command = win32
      ? `Remove-Item -LiteralPath ${quoted.join(", ")}`
      : `rm -- ${quoted.join(" ")}`;
    return `Recovery (attended, run from the main checkout root (the directory that holds .git), ${AUDIT_LOCK_RECOVERY_PRECONDITION}${caution}): ${command}`;
  } catch {
    return null;
  }
}

/**
 * @param {string} subject short noun the denying guard uses for the refused thing ("command", "edit").
 * @param {{planned?: object}|{error?: unknown}} outcome exactly what route planning produced.
 * @param {{platform?: string}} [options] selects the delete verb of the audit-lock recovery line; the host platform when absent.
 * @returns {string} two lines: that no route is offered, and the typed reason why; for code
 *   HGO-AUDIT-LOCK-AMBIGUOUS with a well-formed `error.recovery`, a third line carrying the
 *   attended recovery (humanGuardAuditLockRecoveryLine).
 */
export function humanGuardRouteUnavailableReason(subject, outcome = {}, options = {}) {
  const noun = routeToken(subject, ROUTE_SUBJECT_TOKEN, "action");
  const headline = `No human override route is offered for this exact ${noun}; the guard attempted to plan one.`;
  if (object(outcome) && Object.hasOwn(outcome, "error")) {
    const code = routeToken(outcome.error?.code, ROUTE_CODE_TOKEN, ROUTE_UNTYPED_CODE);
    const reason = `${headline}\nReason: planning the route failed with code=${code}.`;
    const recoveryLine = code === AUDIT_LOCK_AMBIGUOUS_CODE
      ? humanGuardAuditLockRecoveryLine(outcome.error, options)
      : null;
    return recoveryLine === null ? reason : `${reason}\n${recoveryLine}`;
  }
  const planned = object(outcome) && object(outcome.planned) ? outcome.planned : {};
  const status = routeToken(planned.status, ROUTE_STATUS_TOKEN, ROUTE_UNTYPED_STATUS);
  const code = Object.hasOwn(planned, "code")
    ? routeToken(planned.code, ROUTE_CODE_TOKEN, ROUTE_UNTYPED_CODE)
    : null;
  const explanation = ROUTE_STATUS_EXPLANATION[status] ?? null;
  return `${headline}\nReason: the override planner returned status=${status}`
    + (code === null ? "" : `, code=${code}`)
    + (explanation === null ? "" : ` (${explanation})`)
    + ".";
}

/**
 * Read-only companion for diagnostics. Unlike recordHumanGuardDenial(), this
 * deliberately does not construct repository topology or append a request.
 */
export function previewHumanGuardRecovery({ rootDir, pluginRoot, toolName, toolInput, eligibilityOptions = {} } = {}) {
  const root = physicalRoot(rootDir);
  const eligible = eligibility(root, toolName, toolInput, eligibilityOptions);
  if (eligible.eligible || eligible.authorCandidate) return null;
  return recoveryRoute(eligible.code, toolName, toolInput, eligible.paths, { root, pluginRoot, repository: null });
}

export function recordHumanGuardDenial({
  rootDir,
  pluginRoot,
  provider = "codex",
  toolName,
  toolInput,
  denials,
  nowMs = Date.now(),
  ttlMs = DEFAULT_TTL_MS,
  spawn = spawnSync,
  codexSpawn = spawnSync,
  // R-AC-08: injectable only so a test can substitute the append; production
  // always journals through this module's own fsync'd writer.
  appendCommandOffer = appendCommandOfferJournal,
} = {}) {
  assertRawDenials(denials);
  const lifecycleRecovery = lifecycleNotReadyRecovery(denials);
  if (lifecycleRecovery !== null) return lifecycleRecovery;
  const physicalRootDir = physicalRoot(rootDir);
  const eligible = eligibility(physicalRootDir, toolName, toolInput);
  const isLocalPluginInstall = eligible.eligible && eligible.mode === "global-plugin-install";
  // NVA-CROSSREPOLEDGER-1: bind command evaluation and ledger append to the guarded
  // command's actual cross-repository target repository, not this coordinating
  // session's own root -- see crossRepositoryTargetRoot()'s header. `null` covers both
  // an ordinary command AND an out-of-root target with no repository of its own; both
  // fall through unchanged to physicalRootDir exactly as before this fix.
  const crossRepositoryRoot = eligible.eligible && eligible.commandClass === "cross-repository-target"
    ? crossRepositoryTargetRoot(eligible.crossBoundaryTarget, spawn)
    : null;
  const repo = isLocalPluginInstall
    ? controlPathTopology(physicalRootDir)
    : topology(crossRepositoryRoot ?? physicalRootDir, spawn);
  const repository = isLocalPluginInstall
    ? localPluginInstallSourceObservation(repo, { spawn: codexSpawn })
    : repositoryObservation(repo.root, spawn);
  if (denials.some(({ guard }) => String(guard) === "guard-push.mjs")) {
    return recoveryRoute("HGO-PUBLICATION-REQUIRED", toolName, toolInput, [], {
      root: repo.root,
      pluginRoot,
      repository,
    });
  }
  const retryActions = denialRetryActions(denials);
  if (retryActions.length > 0) {
    return {
      status: "narrower-recovery-required",
      code: "HGO-NORMAL-RETRY-ACTIONS",
      nextAction: {
        kind: "typed-recovery",
        actions: retryActions,
      },
    };
  }
  if (!eligible.eligible && !eligible.authorCandidate) {
    const route = recoveryRoute(eligible.code, toolName, toolInput, eligible.paths, {
      root: repo.root,
      pluginRoot,
      repository,
    });
    // Only the external-operator routes hand a human a copy-only command, so only
    // they need a journaled offer first; every other route is returned unchanged.
    return route.status === "external-operator-required"
      ? journaledExternalOperatorRoute(route, {
        repo,
        repository,
        pluginRoot,
        toolName,
        denials,
        eligiblePaths: eligible.paths,
        nowMs,
        appendCommandOffer,
      })
      : route;
  }
  const paths = storage(repo.common);
  const policy = policyIdentity(repo.root, pluginRoot, denials);
  const commandClass = eligible.commandClass
    ?? (eligible.authorCandidate ? "pipeline-author-repair" : "exact-project-action");
  const preview = decisionPreview({
    toolName,
    toolInput,
    paths: eligible.paths,
    commandClass,
    denials,
  });
  const nativeTargets = NATIVE_FILE_TOOLS.has(toolName)
    && (eligible.mode === "standard" || eligible.authorCandidate === true)
    && eligible.paths.length > 0
    ? captureNativeTargetPreimages(repo.root, eligible.paths) : null;
  if (nativeTargets !== null && toolName === "apply_patch"
    && (!object(toolInput) || typeof toolInput.command !== "string" || toolInput.command.length > NATIVE_TARGET_MAX_BYTES)) {
    fail("HGO-PATCH-BOUND", "patch input is outside its closed bound");
  }
  const request = {
    schema: nativeTargets === null ? REQUEST_SCHEMA : NATIVE_REQUEST_SCHEMA,
    ...(nativeTargets === null ? {} : { nativeTargets, patchInput: toolName === "apply_patch" ? toolInput : null }),
    root: repo.root,
    plugin: pluginIdentity(pluginRoot, provider),
    repository,
    toolName,
    toolInputSha256: toolInputIdentitySha256(toolName, toolInput),
    commandClass,
    // This fact never admits a command by itself. It is bound to the exact
    // command and denial digests; at consumption the lifecycle guard reruns
    // its strict read-only classifier before presenting the same denial.
    externalReadOnly: toolName === "Bash"
      && denials.length === 1
      && denials[0]?.guard === "guard-lifecycle-ready.mjs"
      && String(denials[0]?.reason ?? "").startsWith("GUARD-READ-SCOPE-OUTSIDE-ROOT:"),
    denials: denialDigests(denials),
    policy,
    preview,
    eligiblePaths: eligible.paths,
    mode: eligible.authorCandidate ? "pipeline-author-repair-candidate" : eligible.mode,
    authorSourceRoot: null,
    createdAt: new Date(nowMs).toISOString(),
    expiresAt: new Date(nowMs + ttlMs).toISOString(),
  };
  const requestSha256 = sha(request);
  const path = requestPath(paths, requestSha256);
  return hgoPlanningPublication({repo, paths, entry: "record-denial", intendedPath: path, inputSha256: requestSha256}, () => {
  if (!existsSync(path)) writeExclusive(path, Buffer.from(`${JSON.stringify(request)}\n`, "utf8"));
  else if (sha(readJson(path)) !== requestSha256) fail("HGO-REQUEST", "request replay conflicts");
  appendAudit(paths, {
    type: "denied",
    at: new Date(nowMs).toISOString(),
    requestSha256,
    toolName,
    commandClass,
    denialDigests: request.denials,
    policySha256: sha(policy),
    previewSha256: sha(preview),
  });
  // NVA-CROSSREPOGUIDANCE-1 (backlog/items/2026-08-18-codex-pretool-guard-cross-
  // repository-recovery-guidance-points-at-the-wrong-repo.md): carry back the root this
  // denial's ledger was ACTUALLY bound to just above -- `crossRepositoryRoot ?? repo.root`
  // is already resolved and is the only root under which `requestSha256` can be found
  // again. Without it a caller printing override-ceremony guidance has nothing but its own
  // `projectRoot` to name, which for a "cross-repository-target" denial is the wrong
  // repository: planHumanGuardOverride() reads the request from `storage(topology(--repo))`
  // and additionally refuses any `request.root !== repo.root` with HGO-EXPIRED, so guidance
  // naming the coordinator cannot resolve the request at all. Additive return field only --
  // no persisted schema carries it, so no schema/version bump is involved.
  return eligible.authorCandidate
    ? {
      status: "author-repair-required",
      requestSha256,
      root: repo.root,
      candidateSourceRoot: eligible.candidateSourceRoot,
    }
    : { status: "planned", requestSha256, root: repo.root };
  });
}

function buildPlanResult(record, scriptPath) {
  const prepareAuthorizationAction = {
      executable: process.execPath,
      argv: [
        scriptPath,
        "prepare-authorization",
        "--repo",
        record.root,
        "--request-sha256",
        record.requestSha256,
        "--plan-sha256",
        record.planSha256,
        "--reason",
        "<human-reason>",
        ...(record.authorSourceRoot === null ? [] : ["--author-source-root", record.authorSourceRoot]),
      ],
      mutation: false,
      requiresConfirmation: false,
      executionBoundary: "local-process",
      expected: {
        schema: "pipeline.human-guard-override-authorization-selection.v1",
        status: "prepared",
      },
    };
  let approvalMode = "signature";
  try {
    if (readHumanApprovalMode(record.root, { legacyKind: "push" }).mode === "chat") approvalMode = "chat";
  } catch { /* A missing or unreadable policy keeps the signature route. */ }
  const prepareForSignatureAction = {
    executable: process.execPath,
    argv: [scriptPath, "prepare-for-signature", "--repo", record.root,
      "--request-sha256", record.requestSha256,
      ...(record.authorSourceRoot === null ? [] : ["--author-source-root", record.authorSourceRoot])],
    mutation: false,
    requiresConfirmation: false,
    executionBoundary: "local-process",
    expected: { schema: "pipeline.human-guard-override-prepare-for-signature.v1", status: "prepared" },
  };
  return {
    ...record,
    prepareAuthorizationAction,
    approvalMode,
    nextAction: approvalMode === "chat" ? prepareAuthorizationAction : prepareForSignatureAction,
  };
}

/**
 * Part A step 1 (design doc §1.4, Revision 3): get-or-create, not pure. The FIRST
 * successful call for a given (requestSha256, authorSourceRoot) pair takes one
 * repositoryObservation(), checks it narrowly against the frozen `request`
 * (assertNoRequestDrift -- fingerprintSha256 + policyIdentity only), and ALSO
 * checks a freshly-computed `pluginIdentity(pluginRoot)` in FULL against
 * `request.plugin` (frozen at denial, unnarrowed) -- fail closed with the
 * existing `HGO-DRIFT` code on any mismatch. This is not a new check: it
 * restores, at the first call, the exact full-equality comparison the
 * pre-redesign `planHumanGuardOverride` already made unconditionally on every
 * call; dropping it here would let a plugin-code tamper landing between denial
 * and this first call be captured, unverified, as the new persisted-plan
 * baseline (armTimeFreshnessCheck()'s later HGO-PLUGIN-DRIFT check at step 3c
 * only ever compares fresh state against *that same* baseline, so it cannot
 * catch a baseline that was already tampered when captured). On success,
 * persists the full plan payload (including that same freshly-verified
 * `plugin: pluginIdentity()` value) as the new trusted baseline, re-verified
 * only at arm time from here on, exactly mirroring GMW's own architecture
 * where `prepare` is the sole freeze point with nothing earlier to re-check
 * against. Every LATER call for the same pair reads the persisted plan back
 * unchanged -- no new observation, no new comparison -- which is what
 * actually closes design doc §1.1's problem.
 */
export function planHumanGuardOverride({
  rootDir,
  pluginRoot,
  requestSha256,
  nowMs = Date.now(),
  spawn = spawnSync,
  codexSpawn = spawnSync,
  scriptPath,
  authorSourceRoot: selectedAuthorSourceRoot = null,
} = {}) {
  let repo;
  let paths;
  let topologyError = null;
  try {
    repo = topology(rootDir, spawn);
    paths = storage(repo.common);
  } catch (error) {
    topologyError = error;
    repo = controlPathTopology(rootDir);
    paths = storage(repo.common);
  }
  const persisted = readPersistedPlan(paths, requestSha256, selectedAuthorSourceRoot);
  if (persisted !== null) {
    if (topologyError !== null && persisted.mode !== "global-plugin-install") throw topologyError;
    return buildPlanResult(persisted, scriptPath);
  }
  let request;
  try { request = validatedRequest(paths, requestSha256); }
  catch (error) {
    if (topologyError !== null) throw topologyError;
    throw error;
  }
  const isLocalPluginInstall = request.mode === "global-plugin-install";
  if (topologyError !== null && !isLocalPluginInstall) throw topologyError;
  assertRequestNotExpired(request, repo, nowMs);
  const plugin = pluginIdentity(pluginRoot, boundPluginProvider(request.plugin));
  const repository = isLocalPluginInstall
    ? localPluginInstallSourceObservation(repo, { spawn: codexSpawn })
    : repositoryObservation(repo.root, spawn);
  const policy = policyIdentity(repo.root, pluginRoot, request.denials);
  assertNoRequestDrift(repository, policy, request, { isLocalPluginInstall });
  if (canonical(plugin) !== canonical(request.plugin)) {
    fail("HGO-DRIFT", "override plugin identity drifted before first plan");
  }
  let mode = isLocalPluginInstall ? "global-plugin-install" : "standard";
  let authorSourceRootValue = null;
  if (request.mode === "pipeline-author-repair-candidate") {
    authorSourceRootValue = authorEligiblePaths(repo.root, request.eligiblePaths, selectedAuthorSourceRoot);
    if (authorSourceRootValue === null) {
      fail("HGO-AUTHOR-ROOT", "author repair requires the exact Pipeline source root");
    }
    mode = "pipeline-author-repair";
  } else if (selectedAuthorSourceRoot !== null) {
    fail("HGO-AUTHOR-SCOPE", "author repair root does not match this request");
  }
  if (isNativeRequestSchema(request.schema)) assertNativeTargets(repo.root, request);
  const payload = {
    schema: isNativeRequestSchema(request.schema) ? NATIVE_PLAN_SCHEMA : PLAN_SCHEMA,
    ...(isNativeRequestSchema(request.schema) ? { nativeTargets: request.nativeTargets } : {}),
    status: "planned",
    root: repo.root,
    requestSha256,
    plugin,
    repository,
    toolName: request.toolName,
    toolInputSha256: request.toolInputSha256,
    commandClass: request.commandClass,
    externalReadOnly: request.externalReadOnly,
    denials: request.denials,
    policy: request.policy,
    preview: request.preview,
    eligiblePaths: request.eligiblePaths,
    mode,
    authorSourceRoot: authorSourceRootValue,
    expiresAt: request.expiresAt,
  };
  const planSha256 = sha(payload);
  const record = { ...payload, planSha256 };
  const path = planPath(paths, requestSha256, selectedAuthorSourceRoot);
  return hgoPlanningPublication({repo, paths, entry: "plan-override", intendedPath: path, inputSha256: sha(record)}, () => {
  writeExclusive(path, Buffer.from(`${JSON.stringify(record)}\n`, "utf8"));
  return buildPlanResult(record, scriptPath);
  });
}

/**
 * Part A step 6, Revision 2 (design doc §1.4): the sole non-restart recovery path
 * from an HGO-CANDIDATE-DRIFT refusal. Deliberately a SECOND, explicitly-invoked
 * entry point, never folded into planHumanGuardOverride()'s own get-or-create
 * path above -- `plan` must stay a pure cache read once a plan exists, or the
 * whole point of freezing (design doc §1.1) comes back. This is the only place,
 * other than first-creation above, allowed to WRITE to the `plans` store; it
 * never touches `capabilities` and never arms anything.
 *
 * Revision 4 (design doc §1.4 step 6 / §1.11): re-deriving `plugin` here means
 * the FULL step-1 treatment -- verify-then-persist, not just recompute-then-
 * persist. The freshly-observed `pluginIdentity(pluginRoot)` is checked in
 * full against `request.plugin` (frozen at denial, unnarrowed), failing
 * `HGO-DRIFT` on any mismatch, BEFORE it is accepted into the refreshed
 * baseline -- the identical check Revision 3 added to planHumanGuardOverride's
 * first call, applied here so a plugin-code tamper occurring while an
 * HGO-CANDIDATE-DRIFT recovery is pending cannot be laundered, unverified,
 * into the new trusted baseline.
 */
export function refreezeHumanGuardOverridePlan({
  rootDir,
  pluginRoot,
  requestSha256,
  authorSourceRoot = null,
  nowMs = Date.now(),
  spawn = spawnSync,
} = {}) {
  const repo = topology(rootDir, spawn);
  const paths = storage(repo.common);
  const priorPlan = readPersistedPlan(paths, requestSha256, authorSourceRoot);
  if (priorPlan === null) {
    fail("HGO-PLAN-ABSENT", "no persisted override plan exists for this request; run plan or prepare-for-signature first");
  }
  const request = validatedRequest(paths, requestSha256);
  // An expired request is not an authorization and cannot arm anything. It is,
  // however, still the immutable evidence that binds this explicit recovery to
  // the exact denied tool input, repository fingerprint, policy, plugin identity,
  // paths and denial set. Refreeze therefore permits expiry recovery only after
  // re-validating every one of those bindings below, and grants a new fixed
  // DEFAULT_TTL_MS plan window. The plan digest changes, so every old selection,
  // intent and signature stays unusable and a fresh PO signature is mandatory.
  if (request.root !== repo.root) fail("HGO-EXPIRED", "override request belongs to a different repository");
  const requestExpired = new Date(request.expiresAt).getTime() <= nowMs;
  const repository = repositoryObservation(repo.root, spawn);
  const policy = policyIdentity(repo.root, pluginRoot, request.denials);
  assertNoRequestDrift(repository, policy, request);
  const plugin = pluginIdentity(pluginRoot, boundPluginProvider(request.plugin));
  if (canonical(plugin) !== canonical(request.plugin)) {
    fail("HGO-DRIFT", "override plugin identity drifted before refreeze");
  }
  if (priorPlan.schema === NATIVE_PLAN_SCHEMA) assertNativeTargets(repo.root, priorPlan);
  const refreshedPayload = {
    ...priorPlan,
    plugin,
    repository,
    expiresAt: requestExpired
      ? new Date(nowMs + DEFAULT_TTL_MS).toISOString()
      : priorPlan.expiresAt,
  };
  delete refreshedPayload.planSha256;
  const planSha256 = sha(refreshedPayload);
  const record = { ...refreshedPayload, planSha256 };
  const path = planPath(paths, requestSha256, authorSourceRoot);
  return hgoPlanningPublication({repo, paths, entry: "refreeze-plan", intendedPath: path, inputSha256: sha(record)}, () => {
  writeAtomic(path, Buffer.from(`${JSON.stringify(record)}\n`, "utf8"));
  appendAudit(paths, {
    type: "replanned",
    at: new Date(nowMs).toISOString(),
    requestSha256,
    priorPlanSha256: priorPlan.planSha256,
    planSha256,
    authorSourceRoot,
  });
  return {
    schema: "pipeline.human-guard-override-refreeze-plan.v1",
    status: "refrozen",
    root: repo.root,
    requestSha256,
    priorPlanSha256: priorPlan.planSha256,
    planSha256,
    expiresAt: record.expiresAt,
  };
  });
}

export function prepareHumanGuardOverrideAuthorization({
  rootDir,
  pluginRoot,
  requestSha256,
  planSha256,
  reason,
  nowMs = Date.now(),
  spawn = spawnSync,
  scriptPath,
  authorSourceRoot = null,
} = {}) {
  const reasonBytes = Buffer.from(String(reason ?? ""), "utf8");
  if (reasonBytes.length < 1 || reasonBytes.length > MAX_REASON_BYTES) {
    fail("HGO-REASON", "override reason is invalid");
  }
  const planned = planHumanGuardOverride({
    rootDir,
    pluginRoot,
    requestSha256,
    nowMs,
    spawn,
    scriptPath,
    authorSourceRoot,
  });
  if (planned.planSha256 !== planSha256) {
    fail("HGO-PLAN", "override plan digest does not match");
  }
  const reasonSha256 = sha(reasonBytes);
  const selection = {
    schema: "pipeline.human-guard-override-authorization-selection.v1",
    requestSha256,
    planSha256,
    reasonSha256,
  };
  const selectionSha256 = sha(selection);
  return {
    ...selection,
    status: "prepared",
    selectionSha256,
    expiresAt: planned.expiresAt,
    decisionPreview: planned.preview,
    authorizeAction: {
      executable: process.execPath,
      argv: [
        scriptPath,
        "authorize",
        "--repo",
        planned.root,
        "--request-sha256",
        requestSha256,
        "--plan-sha256",
        planSha256,
        "--selection-sha256",
        selectionSha256,
        "--reason",
        String(reason),
        "--reason-sha256",
        reasonSha256,
        ...(planned.authorSourceRoot === null
          ? []
          : ["--author-source-root", planned.authorSourceRoot]),
        "--activate",
      ],
      mutation: true,
      requiresConfirmation: true,
      executionBoundary: "local-process",
      expected: { schema: planned.schema === NATIVE_PLAN_SCHEMA ? NATIVE_CAPABILITY_SCHEMA : CAPABILITY_SCHEMA, status: "armed" },
    },
  };
}

/**
 * Part C (design doc §3.2/§3.3): collapses `plan` (or reads the already-persisted
 * plan -- design doc §1.4 step 1's own get-or-create semantics; no new
 * persistence implementation, design doc §3.4) -> `prepareHumanGuardOverrideAuthorization()`
 * with the fixed `HGO_SIGNATURE_REASON` -> digest-emission into one call,
 * replicating exactly the recipe `authorizeHumanGuardOverrideBySignature()` itself
 * already proves (its own `createPoApprovalIntent(...)` call below, unchanged).
 * Performs no signature verification and touches no private key -- "pure digest
 * computation against data already in the repository" (ADR-0059 Decision 1),
 * exactly as true of `plan` and `prepare-authorization` today.
 *
 * The `global-plugin-install` mode is not special-cased here the way
 * `authorizeHumanGuardOverrideBySignature()` special-cases it (its own
 * `HGO-SIGNATURE-UNSUPPORTED-MODE` refusal): that mode's `repository` observation
 * carries no `head`/`tree` at all, so `createPoApprovalIntent()`'s own candidate
 * validation already throws for it, caught below as `HGO-SIGNATURE-INTENT-INVALID`
 * -- an extra early check would only rename an already-fail-closed outcome.
 */
export function prepareHumanGuardOverrideForSignature({
  rootDir,
  pluginRoot,
  requestSha256,
  nowMs = Date.now(),
  spawn = spawnSync,
  scriptPath,
  humanApprovalScriptPath,
  authorSourceRoot = null,
} = {}) {
  // A signature is a scarce human credential. Authenticate the audit sink before
  // producing any signable material, so a standing ledger fault cannot consume a
  // signature for a ceremony that authorization is guaranteed to reject later.
  const auditRepo = topology(rootDir, spawn);
  const auditPaths = storage(auditRepo.common);
  const signatureAuditState = auditState(auditPaths, key(auditPaths));
  if (signatureAuditState.status === "recoverable-torn-append") {
    fail(
      "HGO-AUDIT",
      `audit ledger has a recoverable torn append (repairPreimageSha256=${signatureAuditState.repairPreimageSha256}); `
        + `run ${process.execPath} ${scriptPath} repair-audit --repo ${auditRepo.root} `
        + `--preimage-sha256 ${signatureAuditState.repairPreimageSha256} --activate in an attended terminal`,
    );
  }
  if (signatureAuditState.status === "terminal-invalid") fail("HGO-AUDIT", signatureAuditState.reason);
  const planned = planHumanGuardOverride({
    rootDir,
    pluginRoot,
    requestSha256,
    nowMs,
    spawn,
    scriptPath,
    authorSourceRoot,
  });
  // AC-264 point 1: dry-run the stored patch against the frozen preimage BEFORE any
  // authorization, intent or signature material exists.
  preflightPatchBeforeSignature(auditRepo, auditPaths, requestSha256, spawn);
  const prepared = prepareHumanGuardOverrideAuthorization({
    rootDir,
    pluginRoot,
    requestSha256,
    planSha256: planned.planSha256,
    reason: HGO_SIGNATURE_REASON,
    nowMs,
    spawn,
    scriptPath,
    authorSourceRoot,
  });
  let intent;
  try {
    intent = createPoApprovalIntent({
      kind: HGO_SIGNATURE_INTENT_KIND,
      featureId: HGO_SIGNATURE_INTENT_FEATURE_ID,
      planSha256: HGO_SIGNATURE_INTENT_PLAN_SHA256,
      specSha256: HGO_SIGNATURE_INTENT_SPEC_SHA256,
      candidate: { commit: planned.repository.head, tree: planned.repository.tree },
      policyRevision: HGO_SIGNATURE_INTENT_POLICY_REVISION,
      subjectSha256: prepared.selectionSha256,
      decision: HGO_SIGNATURE_INTENT_DECISION,
    });
  } catch {
    fail("HGO-SIGNATURE-INTENT-INVALID", "signed authorization intent could not be built from the current repository observation");
  }
  const indexed = indexHumanGuardOverrideSelection({rootDir,pluginRoot,requestSha256,planSha256:planned.planSha256,authorSourceRoot,nowMs,spawn,scriptPath});
  if (indexed.intentSha256 !== intent.sha256) fail("HGO-DISCLOSURE-INDEX", "prepared disclosure intent conflicts");
  return {
    schema: "pipeline.human-guard-override-prepare-for-signature.v1",
    status: "prepared",
    root: planned.root,
    requestSha256,
    planSha256: planned.planSha256,
    selectionSha256: prepared.selectionSha256,
    reasonSha256: prepared.reasonSha256,
    intentSha256: intent.sha256,
    expiresAt: planned.expiresAt,
    signIntentCommand: {
      executable: process.execPath,
      argv: [
        humanApprovalScriptPath,
        "sign-intent",
        "--repo-root",
        planned.root,
        "--intent-sha256",
        intent.sha256,
      ],
      mutation: false,
      requiresConfirmation: true,
      executionBoundary: "attended-external-terminal",
    },
    authorizeBySignatureCommand: {
      executable: process.execPath,
      argv: [
        scriptPath,
        "authorize-by-signature",
        "--repo",
        planned.root,
        "--request-sha256",
        requestSha256,
        "--plan-sha256",
        planned.planSha256,
        "--proof",
        "<external-proof.json>",
        ...(planned.authorSourceRoot === null
          ? [] : ["--author-source-root", planned.authorSourceRoot]),
      ],
      mutation: true,
      requiresConfirmation: true,
      executionBoundary: "local-process",
    },
  };
}

export function authorizeHumanGuardOverride({
  rootDir,
  pluginRoot,
  requestSha256,
  planSha256,
  selectionSha256,
  reason,
  reasonSha256,
  activate = false,
  nowMs = Date.now(),
  spawn = spawnSync,
  scriptPath,
  authorSourceRoot = null,
  dependencies = {},
} = {}) {
  if (activate !== true) fail("HGO-ACTIVATION", "override authorization requires explicit activation");
  // ADR-0059 Decision 1, defense in depth: this in-session `activate` path is an
  // ordinary command a ready agent session can run itself -- permitted only when
  // the shared, committed global `gates.human_approval` selection is the expressly
  // weak chat posture.  Legacy push-local chat keeps its historical attended-TTY
  // ceremony below.  The calling
  // guards already stop offering this route in that mode (Decision 3), but this
  // function must refuse it outright too, never relying on the caller alone to keep
  // it out of reach.  The shared resolver fails closed to `signature` for anything
  // absent, unreadable, unrecognised or uncommitted.
  let approval = { mode: "signature", scope: "default", source: "default" };
  try { approval = readHumanApprovalMode(rootDir, { legacyKind: "push", spawn }); }
  catch { /* fail-closed default above */ }
  const approvalMode = approval.mode;
  let persistedExternalReadOnlyPlan = null;
  if (approvalMode !== "chat"
    && SHA256.test(requestSha256 ?? "")
    && SHA256.test(planSha256 ?? "")
    && authorSourceRoot === null) {
    try {
      const repo = topology(rootDir, spawn);
      const persisted = readPersistedPlan(storage(repo.common), requestSha256, null);
      if (persisted?.planSha256 === planSha256 && persisted.externalReadOnly === true) {
        persistedExternalReadOnlyPlan = buildPlanResult(persisted, scriptPath);
      }
    } catch {
      // A missing, unsafe, stale, or differently-scoped plan is ordinary
      // signature mode, never an external-read authorization.
    }
  }
  if (approvalMode !== "chat" && persistedExternalReadOnlyPlan === null) {
    fail(
      "HGO-SIGNATURE-MODE-REQUIRED",
      `the in-session activation path is refused while human approval is "${approvalMode}"; use authorizeHumanGuardOverrideBySignature() (CLI: authorize-by-signature) instead`,
    );
  }
  const reasonBytes = Buffer.from(String(reason ?? ""), "utf8");
  if (reasonBytes.length < 1 || reasonBytes.length > MAX_REASON_BYTES || sha(reasonBytes) !== reasonSha256) {
    fail("HGO-REASON", "override reason digest is invalid");
  }
  const prepared = prepareHumanGuardOverrideAuthorization({
    rootDir,
    pluginRoot,
    requestSha256,
    planSha256,
    reason,
    nowMs,
    spawn,
    scriptPath,
    authorSourceRoot,
  });
  if (prepared.selectionSha256 !== selectionSha256
    || prepared.reasonSha256 !== reasonSha256) {
    fail("HGO-SELECTION", "override authorization selection digest does not match");
  }
  const planned = persistedExternalReadOnlyPlan ?? planHumanGuardOverride({
    rootDir,
    pluginRoot,
    requestSha256,
    nowMs,
    spawn,
    scriptPath,
    authorSourceRoot,
  });
  assertPlanNotExpired(planned, nowMs);
  const externalReadOnlyPoChat = planned.externalReadOnly === true;
  // AGY-HGOFIX-2: this in-session `activate` path had ZERO attended-terminal check --
  // an agent could run plan -> prepare-authorization -> authorize --activate entirely by
  // itself, computing every required digest itself, with no human step at all. The
  // expected confirmation value is deterministic (derived from `selectionSha256`, itself
  // already bound to requestSha256/planSha256/reasonSha256 by the HGO-SELECTION check
  // above) rather than a random persisted challenge (contrast pipeline-state.mjs's
  // `pendingPushChallenge`): the security property `requireAttendedChatGateConfirmation`
  // provides is TTY-ness of fd 0, not secrecy of the expected string -- same
  // property po-authority-acknowledge-apply's `PO_ACK_APPLY_CONFIRMATION_TOKEN`
  // (pipeline-state.mjs, AGY-CF-BL15) relies on, also fully agent-known.
  // Placed AFTER the mode/reason/selection/plan checks above but BEFORE any capability
  // file is written or audit entry appended, so a failed attempt leaves the pending
  // request/plan/selection fully available for a genuine attended retry.
  const globalChat = approval.scope === "global" && approval.source === "pipeline.user.yaml";
  if (!globalChat && !externalReadOnlyPoChat) {
    const confirmationExpected = `HGO-${selectionSha256.slice(0, 8).toUpperCase()}`;
    const confirmation = runRegisteredAttendedChatGateConfirmation({
      repository: inspectSignedDescriptorCustodyRepository(rootDir),
      summaryLines: [
        "HUMAN GUARD OVERRIDE ACTIVATION CONFIRMATION -- read before you type the value:",
        `  reason: ${reason}`,
        `  request-sha256: ${requestSha256}`,
        `  plan-sha256: ${planSha256}`,
        `  selection-sha256: ${selectionSha256}`,
        `  confirmation value: ${confirmationExpected}`,
      ],
      expected: confirmationExpected,
    });
    if (!confirmation.ok) {
      fail(
        confirmation.code,
        confirmation.code === CHAT_GATE_NOT_ATTENDED
          ? "override activation refused (CHAT-GATE-NOT-ATTENDED); a human must confirm this activation directly, in their own attended terminal -- an agent's own tool call cannot complete this step."
          : confirmation.code === CHAT_GATE_CONFIRMATION_MISMATCH
            ? "override activation refused (CHAT-GATE-CONFIRMATION-MISMATCH); the typed value did not match the confirmation value shown."
            : "override activation refused; the attended confirmation ceremony did not succeed.",
      );
    }
  }
  const repo = planned.mode === "global-plugin-install"
    ? controlPathTopology(rootDir)
    : topology(rootDir, spawn);
  const paths = storage(repo.common);
  // Part A step 3 (design doc §1.4): the one remaining arm-time freshness
  // re-check. `freshRepository` -- not `planned.repository` -- becomes
  // capabilityCore.repository below (design doc §1.4 step 3's own instruction).
  const freshRepository = armTimeFreshnessCheck({ repo, pluginRoot, planned, spawn });
  const capabilityCore = {
    schema: planned.schema === NATIVE_PLAN_SCHEMA ? NATIVE_CAPABILITY_SCHEMA : CAPABILITY_SCHEMA,
    ...(planned.schema === NATIVE_PLAN_SCHEMA ? { nativeTargets: planned.nativeTargets } : {}),
    status: "armed",
    root: repo.root,
    requestSha256,
    planSha256,
    selectionSha256,
    reasonSha256,
    humanApproval: chatAttributionRecord({
      kind: externalReadOnlyPoChat ? "external-read-only-po-chat" : "human-guard-override",
    }),
    plugin: planned.plugin,
    repository: freshRepository,
    // Finding 1 (design doc §1.4 step 5) is scoped to the signature path only --
    // the chat path has no signed-intent concept to bind a candidate to.
    signedCandidate: null,
    toolName: planned.toolName,
    toolInputSha256: planned.toolInputSha256,
    commandClass: planned.commandClass,
    externalReadOnly: planned.externalReadOnly,
    denials: planned.denials,
    policy: planned.policy,
    preview: planned.preview,
    eligiblePaths: planned.eligiblePaths,
    mode: planned.mode,
    authorSourceRoot: planned.authorSourceRoot,
    authorizedAt: new Date(nowMs).toISOString(),
    expiresAt: planned.expiresAt,
    consumedAt: null,
  };
  return hgoPublishAuthorizedAuthority({repo, paths, capabilityCore, pluginRoot}, () => {
  const capability = {
    ...capabilityCore,
    mac: capabilityMac(key(paths), capabilityCore),
  };
  const path = capabilityPath(paths, planSha256);
  if (existsSync(path)) {
    const prior = validatedCapability(paths, path);
    if (canonical(prior) === canonical(capability)) {
      if (!hasAuthorizedAuditEntry(paths, prior)) {
        appendAudit(paths, {
          type: "authorized",
          at: capability.authorizedAt,
          requestSha256,
          planSha256,
          reasonSha256,
          selectionSha256,
          humanApproval: capability.humanApproval,
          mode: capability.mode,
          authorSourceRoot: capability.authorSourceRoot,
        });
      }
      return { schema: capabilityCore.schema, status: "armed", planSha256, requestSha256, mutated: false };
    }
    fail("HGO-REPLAY", "override plan is already used or conflicts");
  }
  writeExclusive(path, Buffer.from(`${JSON.stringify(capability)}\n`, "utf8"));
  const owned = safePrivateFile(path);
  try {
    appendAudit(paths, {
      type: "authorized",
      at: capability.authorizedAt,
      requestSha256,
      planSha256,
      reasonSha256,
      selectionSha256,
      humanApproval: capability.humanApproval,
      mode: capability.mode,
      authorSourceRoot: capability.authorSourceRoot,
    });
  } catch (error) {
    try {
      const observed = safePrivateFile(path);
      if (observed.dev === owned.dev && observed.ino === owned.ino) unlinkSync(path);
    } catch {}
    throw error;
  }
  return { schema: capabilityCore.schema, status: "armed", planSha256, requestSha256, mutated: true };
  });
}

/**
 * NVA-SIGENTRY-1: the exact intent-building recipe `authorizeHumanGuardOverrideBySignature()`
 * gates arming on, extracted so any other caller that needs the SAME signable digest --
 * the `emit-signature-digest` CLI command, and this module's own
 * `describeHumanGuardOverrideSelection()` -- computes it through this one function
 * rather than a second hand-copy. `prepared`/`planned` are exactly the return values of
 * `prepareHumanGuardOverrideAuthorization()`/`planHumanGuardOverride()` for the same
 * `(requestSha256, planSha256)` pair; this function performs no I/O of its own and calls
 * neither, so a caller that reuses this correctly cannot observe a different digest than
 * the verifier gates on -- there is only the one recipe, never two to drift apart.
 *
 * The `global-plugin-install` exclusion lives HERE, not only in the caller below: that
 * mode's repository observation carries no commit/tree to bind a candidate to (see
 * `localPluginInstallSourceObservation`), so a digest-emission caller that reaches this
 * far without separately checking `planned.mode` still gets the same
 * `HGO-SIGNATURE-UNSUPPORTED-MODE` refusal `authorizeHumanGuardOverrideBySignature()`
 * gives, rather than a confusing `HGO-SIGNATURE-INTENT-INVALID` from a missing candidate
 * field.
 */
export function buildHumanGuardOverrideSignatureIntent({ prepared, planned }) {
  if (planned.mode === "global-plugin-install") {
    fail("HGO-SIGNATURE-UNSUPPORTED-MODE", "signed authorization does not cover the local-plugin-install class; use the chat-mode path");
  }
  try {
    return createPoApprovalIntent({
      kind: HGO_SIGNATURE_INTENT_KIND,
      featureId: HGO_SIGNATURE_INTENT_FEATURE_ID,
      planSha256: HGO_SIGNATURE_INTENT_PLAN_SHA256,
      specSha256: HGO_SIGNATURE_INTENT_SPEC_SHA256,
      candidate: { commit: planned.repository.head, tree: planned.repository.tree },
      policyRevision: HGO_SIGNATURE_INTENT_POLICY_REVISION,
      subjectSha256: prepared.selectionSha256,
      decision: HGO_SIGNATURE_INTENT_DECISION,
    });
  } catch { fail("HGO-SIGNATURE-INTENT-INVALID", "signed authorization intent could not be built from the current repository observation"); }
}

/**
 * ADR-0059 Decision 1: the signed admission path, alongside the existing chat-mode
 * one. Mirrors `authorizeHumanGuardOverride()`'s exact capability-building/audit/
 * persistence shape (prepare -> plan -> build capabilityCore -> mac -> persist), but
 * gates arming on a verified Ed25519 proof instead of `activate === true`. There is
 * no `activate` parameter here at all: a genuine verified proof IS the authorization.
 *
 * `prepareHumanGuardOverrideAuthorization()` and `planHumanGuardOverride()` are
 * reused completely unchanged (Decision 2) -- the only difference from the chat path
 * is what gates the write: a rebuilt `po-approval-proof.mjs` intent bound to the
 * exact `(requestSha256, planSha256)` pair via `prepared.selectionSha256`, verified
 * against a trust anchor that defaults to this repository's own committed
 * `project/critical-human-proof.json` (the same one push approval and GMW already
 * use) when `trustPolicy` is not supplied -- exactly like GMW's CLI defaults
 * `--authority`.
 *
 * External signing recipe (no repository file I/O needed by the signer): run `plan`
 * to obtain `planSha256` and `repository.{head,tree}`, run `prepare-authorization`
 * with the fixed `HGO_SIGNATURE_REASON` text to obtain `selectionSha256`, then sign
 * `createPoApprovalIntent({ kind: "guard-override", featureId: "human-guard-override",
 * planSha256: HGO_SIGNATURE_INTENT_PLAN_SHA256, specSha256: HGO_SIGNATURE_INTENT_SPEC_SHA256,
 * candidate: { commit: repository.head, tree: repository.tree }, policyRevision:
 * "human-guard-override-signature-v1", subjectSha256: selectionSha256, decision:
 * "authorize" }).sha256` with the PO's own Ed25519 key -- or, more directly, run the
 * `emit-signature-digest` CLI command, which computes the identical value through
 * `buildHumanGuardOverrideSignatureIntent()` above.
 *
 * Deliberate scope narrowing (reported deviation, not required by ADR-0059's own
 * scope): the `global-plugin-install` denial class carries no commit/tree in its
 * repository observation (see `localPluginInstallSourceObservation`), so it has no
 * `candidate` to bind a po-approval-proof intent to. It keeps its existing
 * chat-mode-only route; extending signed admission to it is a separate, narrower
 * follow-up.
 */
export function authorizeHumanGuardOverrideBySignature({
  rootDir,
  pluginRoot,
  requestSha256,
  planSha256,
  proof,
  trustPolicy = null,
  nowMs = Date.now(),
  spawn = spawnSync,
  scriptPath,
  authorSourceRoot = null,
} = {}) {
  const prepared = prepareHumanGuardOverrideAuthorization({
    rootDir,
    pluginRoot,
    requestSha256,
    planSha256,
    reason: HGO_SIGNATURE_REASON,
    nowMs,
    spawn,
    scriptPath,
    authorSourceRoot,
  });
  const planned = planHumanGuardOverride({
    rootDir,
    pluginRoot,
    requestSha256,
    nowMs,
    spawn,
    scriptPath,
    authorSourceRoot,
  });
  assertPlanNotExpired(planned, nowMs);
  const intent = buildHumanGuardOverrideSignatureIntent({ prepared, planned });
  // NVA-HGOFIX-1: this used to read the legacy SINGULAR `policy.trustAnchor` field only,
  // which is permanently `null` once `critical-human-proof.json` carries the v3
  // `trustAnchors` SET -- every signed admission failed with HGO-TRUST-ANCHOR-MISSING,
  // regardless of how correctly it was signed. Same defect class, same fix shape as
  // guard-maintenance-window.mjs's currentGuardMaintenanceWindow() (NVA-GMWFIX-1/
  // NVA-GMWFIX-2): a NON-EMPTY v3 set wins whenever the document carries one; an absent OR
  // EMPTY v3 set falls through to the legacy singular field; and truly nothing configured
  // is a hard fail here -- unlike verifyAgainstTrustAnchors()'s OWN posture for an
  // empty/absent anchor set (accept any well-formed key, deliberate for the four
  // CRITICAL_ACTION_KINDS ceremonies), this call site is the SAME risk class as GMW: a
  // general override of an arbitrary guard denial (ADR-0059), broader than GMW's
  // GS-6/TP-*-only scope, not narrower -- so an empty/absent anchor set here must never be
  // treated as "any key", or the whole override ceremony would become self-serviceable by
  // an agent.
  //
  // PHX merge note (dispatch PHX-HGO): the Phoenix line resolves this differently, treating
  // an explicit empty v3 `trustAnchors` set as "any well-formed key may sign", citing
  // ADR-0056's 2026-08-16 correction. That correction is real and dated, but it names
  // feature-package-reconcile, the Guard Maintenance Window and push approval as its three
  // beneficiaries -- not this broader, arbitrary-guard-denial override -- and this
  // call site's own long-standing comment argues directly against extending the "any key"
  // posture here. Kept on the stricter (fail-closed) side per this merge's security-conflict
  // rule (stricter wins absent a demonstrable, scoped-to-this-call-site later fix); flagged
  // for Elephant/PO review rather than silently resolved either way.
  // Per-Key TOFU Trust Anchors (WP-B2-4):
  // When in signature mode and an unrecognized well-formed Ed25519 key signs an override or critical proof,
  // emit code HGO-TRUST-ANCHOR-NEW-KEY-CONFIRMATION-REQUIRED requiring human confirmation before first use,
  // rather than blindly failing with HGO-TRUST-ANCHOR-MISSING or unconditionally accepting.
  if (!proof || typeof proof !== "object") {
    fail("HGO-PROOF-INVALID", "proof is required");
  }
  if (!isWellFormedEd25519PublicKey(proof?.publicKey)) {
    fail("HGO-PROOF-INVALID", "PO-APPROVAL-PROOF-INVALID");
  }

  const derivedSigner = {
    keyReference: proof.keyReference,
    publicKeySha256: createHash("sha256").update(proof.publicKey).digest("hex"),
  };

  const keySigCheck = verifyPoApprovalProof({ intent, trustPolicy: derivedSigner, proof });
  if (!keySigCheck.verified) {
    fail("HGO-PROOF-INVALID", keySigCheck.code ?? "PO-APPROVAL-PROOF-INVALID");
  }

  let resolvedTrustAnchors;
  if (trustPolicy !== null) {
    resolvedTrustAnchors = [trustPolicy];
    const verified = verifyAgainstTrustAnchors({ intent, anchors: resolvedTrustAnchors, proof });
    if (!verified.verified) fail("HGO-PROOF-INVALID", verified.code ?? "PO-APPROVAL-PROOF-INVALID");
  } else {
    const policy = readCriticalHumanProofPolicy(rootDir);
    if (!policy.ok || (policy.trustAnchor === null && !Array.isArray(policy.trustAnchors))) {
      fail("HGO-TRUST-ANCHOR-MISSING", "project/critical-human-proof.json carries no trustAnchor");
    }
    if (policy.trustAnchor !== null) {
      resolvedTrustAnchors = [policy.trustAnchor];
      const verified = verifyAgainstTrustAnchors({ intent, anchors: resolvedTrustAnchors, proof });
      if (!verified.verified) fail("HGO-PROOF-INVALID", verified.code ?? "PO-APPROVAL-PROOF-INVALID");
    } else {
      resolvedTrustAnchors = policy.trustAnchors;
      const isRecognized = Array.isArray(resolvedTrustAnchors) && resolvedTrustAnchors.some(
        (anchor) => anchor?.publicKeySha256 === derivedSigner.publicKeySha256
      );
      if (!isRecognized) {
        fail(
          "HGO-TRUST-ANCHOR-NEW-KEY-CONFIRMATION-REQUIRED",
          `unrecognized well-formed key ${derivedSigner.publicKeySha256} (${derivedSigner.keyReference}); human confirmation required before first use`,
          { keyReference: derivedSigner.keyReference, publicKeySha256: derivedSigner.publicKeySha256 }
        );
      }
      const verified = verifyAgainstTrustAnchors({ intent, anchors: resolvedTrustAnchors, proof });
      if (!verified.verified) fail("HGO-PROOF-INVALID", verified.code ?? "PO-APPROVAL-PROOF-INVALID");
    }
  }

  // global-plugin-install is already excluded above, so this is always the ordinary
  // physical-repository topology -- exactly what authorizeHumanGuardOverride() also
  // uses for every mode other than global-plugin-install.
  const repo = topology(rootDir, spawn);
  const paths = storage(repo.common);
  // Part A step 3 (design doc §1.4): the same arm-time freshness re-check the chat
  // path runs, placed here AFTER signature verification succeeds, exactly as
  // design doc §1.4 step 3 requires ("after signature verification succeeds for
  // the signed path").
  const freshRepository = armTimeFreshnessCheck({ repo, pluginRoot, planned, spawn });
  // Part A step 5 (design doc §1.4, Finding 1): the exact candidate the PO's
  // signature covers -- plan-persisted, byte-identical to what was signed, never
  // re-derived. Step 5's check: the fresh 3a observation's head/tree must still
  // match it, or a commit landed on HEAD after signing but before this arm call.
  const signedCandidate = { commit: planned.repository.head, tree: planned.repository.tree };
  // NVA-CF-HGOCANDIDATEDRIFT (backlog/items/2026-08-30-hgo-candidate-drift-invalidates-
  // ceremony-on-any-concurrent-commit.md): this compares the WHOLE-repository root tree
  // (`git rev-parse HEAD^{tree}`, see repositoryObservation()), not just the target
  // path's own blob -- so ANY commit anywhere in the repository, including one that
  // touches completely unrelated files, drifts `tree` and refuses here, even though the
  // target edit itself is byte-identical to what was signed. This was considered and kept
  // deliberately strict rather than narrowed to the target path alone, for two reasons:
  // (1) `signedCandidate` is not only an internal freshness check -- it is baked into the
  // PO's own Ed25519-signed intent (`candidate: {commit, tree}` in
  // prepareHumanGuardOverrideForSignature()/authorizeHumanGuardOverrideBySignature()'s
  // po-approval-proof.mjs call), so narrowing what it binds to would change what the PO is
  // cryptographically attesting to, not just an internal bookkeeping detail; (2) the frozen
  // `planned` object also freezes a safety analysis of the override being granted
  // (`eligiblePaths`/`preview`/`denials`, see PLAN_KEYS above) that is never recomputed at
  // arm time -- proving that ONLY the target path's bytes can affect that analysis (no
  // interaction via shared directory components, symlink placement, or path
  // classification elsewhere in the tree) is a security claim nobody has verified here, so
  // the cheap, provably-safe whole-tree invariant is kept rather than a narrower one whose
  // safety this file cannot currently demonstrate. See docs/push-release-flow.md ("The
  // identical binding applies to guard-human-override.mjs's general override ceremony")
  // for the operator-facing mitigation and the `plan` command's own advisory output
  // (concurrentWorktreeAdvisory() below) for the partial, best-effort in-flight signal.
  if (freshRepository.head !== signedCandidate.commit || freshRepository.tree !== signedCandidate.tree) {
    fail(
      "HGO-CANDIDATE-DRIFT",
      "a commit landed on HEAD after the PO's signature was computed but before this arm call; "
        + "run refreeze-plan to obtain a new signable candidate bound to the current HEAD, then "
        + "re-run prepare-for-signature, get a fresh PO signature, and retry authorize-by-signature",
    );
  }
  const capabilityCore = {
    schema: planned.schema === NATIVE_PLAN_SCHEMA ? NATIVE_CAPABILITY_SCHEMA : CAPABILITY_SCHEMA,
    ...(planned.schema === NATIVE_PLAN_SCHEMA ? { nativeTargets: planned.nativeTargets } : {}),
    status: "armed",
    root: repo.root,
    requestSha256,
    planSha256,
    selectionSha256: prepared.selectionSha256,
    reasonSha256: prepared.reasonSha256,
    humanApproval: { mode: "signature-verified" },
    plugin: planned.plugin,
    repository: freshRepository,
    signedCandidate,
    toolName: planned.toolName,
    toolInputSha256: planned.toolInputSha256,
    commandClass: planned.commandClass,
    externalReadOnly: planned.externalReadOnly,
    denials: planned.denials,
    policy: planned.policy,
    preview: planned.preview,
    eligiblePaths: planned.eligiblePaths,
    mode: planned.mode,
    authorSourceRoot: planned.authorSourceRoot,
    authorizedAt: new Date(nowMs).toISOString(),
    expiresAt: planned.expiresAt,
    consumedAt: null,
  };
  return hgoPublishAuthorizedAuthority({repo, paths, capabilityCore, pluginRoot}, () => {
  const capability = {
    ...capabilityCore,
    mac: capabilityMac(key(paths), capabilityCore),
  };
  const path = capabilityPath(paths, planSha256);
  if (existsSync(path)) {
    const prior = validatedCapability(paths, path);
    if (canonical(prior) === canonical(capability)) {
      if (!hasAuthorizedAuditEntry(paths, prior)) {
        appendAudit(paths, {
          type: "authorized",
          at: capability.authorizedAt,
          requestSha256,
          planSha256,
          reasonSha256: capability.reasonSha256,
          selectionSha256: capability.selectionSha256,
          humanApproval: capability.humanApproval,
          mode: capability.mode,
          authorSourceRoot: capability.authorSourceRoot,
        });
      }
      return { schema: capabilityCore.schema, status: "armed", planSha256, requestSha256, mutated: false };
    }
    fail("HGO-REPLAY", "override plan is already used or conflicts");
  }
  writeExclusive(path, Buffer.from(`${JSON.stringify(capability)}\n`, "utf8"));
  const owned = safePrivateFile(path);
  try {
    appendAudit(paths, {
      type: "authorized",
      at: capability.authorizedAt,
      requestSha256,
      planSha256,
      reasonSha256: capability.reasonSha256,
      selectionSha256: capability.selectionSha256,
      humanApproval: capability.humanApproval,
      mode: capability.mode,
      authorSourceRoot: capability.authorSourceRoot,
    });
  } catch (error) {
    try {
      const observed = safePrivateFile(path);
      if (observed.dev === owned.dev && observed.ino === owned.ino) unlinkSync(path);
    } catch {}
    throw error;
  }
  return { schema: capabilityCore.schema, status: "armed", planSha256, requestSha256, mutated: true };
  });
}

function consumeHumanGuardOverrideCore({
  rootDir,
  pluginRoot,
  provider = "codex",
  toolName,
  toolInput,
  denials,
  nowMs = Date.now(),
  spawn = spawnSync,
  codexSpawn = spawnSync,
} = {}) {
  assertRawDenials(denials);
  const lifecycleRecovery = lifecycleNotReadyRecovery(denials);
  if (lifecycleRecovery !== null) return lifecycleRecovery;
  // NVA-CROSSREPOLEDGER-1: this is the OTHER entry point codex-pretool-guard.mjs calls
  // automatically with `rootDir: projectRoot`, when the agent retries the exact same
  // guarded command after obtaining a capability -- see recordHumanGuardDenial()'s
  // identical rebinding above and crossRepositoryTargetRoot()'s header. Re-derive the
  // same classification here from `toolName`/`toolInput` (both already parameters of
  // this function) so a "cross-repository-target" command's TOKEN consumption binds to
  // the same target repository its denial/plan/authorization were bound to, rather than
  // to the coordinator's own root. Every failure along the way (an invalid rootDir, a
  // classification this module cannot complete) resolves to `null` here, never a throw
  // -- the EXISTING topology(rootDir, spawn) attempt below, and its own existing
  // fallback chain, is what actually decides whether the operation proceeds, exactly as
  // before this fix for every other command class.
  let crossRepositoryRoot = null;
  try {
    const physicalRootDir = physicalRoot(rootDir);
    const eligible = eligibility(physicalRootDir, toolName, toolInput);
    if (eligible.eligible && eligible.commandClass === "cross-repository-target") {
      crossRepositoryRoot = crossRepositoryTargetRoot(eligible.crossBoundaryTarget, spawn);
    }
  } catch { crossRepositoryRoot = null; }
  let repo;
  try { repo = topology(crossRepositoryRoot ?? rootDir, spawn); }
  catch {
    try { repo = controlPathTopology(rootDir); }
    catch { return { status: "absent" }; }
  }
  return hgoConsumptionBoundary(repo, () => {
  const paths = storage(repo.common);
  const toolInputSha256 = toolInputIdentitySha256(toolName, toolInput);
  const currentDenialDigests = denialDigests(denials);
  const files = [];
  let replanRequired = false;
  let driftReplanRequired = false;
  let inputMismatch = null;
  // NVA-SIGDISCLOSE-1 Finding 6: a capability file this process cannot read or validate
  // at all (unreadable, malformed JSON, a stale/wrong schema version, a bad MAC) is
  // SKIPPED and RECORDED here, never treated as a whole-store failure. Before this fix,
  // the very first unreadable/invalid record aborted the entire enumeration with
  // `return`, hiding every other, otherwise-valid armed capability that happened to sort
  // after it -- a single leftover v1 file could silence a perfectly good v2 one. A record
  // that IS read and validated successfully but simply does not match this call (wrong
  // tool, wrong input, expired, drifted, wrong denials) never becomes usable merely
  // because enumeration continues. Expired/drifted matching records are separately
  // authenticated, refused and audited before later candidates are considered.
  const skippedInvalidRecords = [];
  try {
    files.push(...readdirSync(paths.capabilities).filter((name) => name.endsWith(".json")).sort());
  } catch { return { status: "absent" }; }
  for (const name of files) {
    const planSha256 = name.slice(0, -5);
    if (!SHA256.test(planSha256)) continue;
    const path = capabilityPath(paths, planSha256);
    let capability;
    try { capability = validatedCapability(paths, path); }
    catch (error) {
      skippedInvalidRecords.push({ planSha256, code: error?.code ?? "HGO-CAPABILITY" });
      continue;
    }
    if (capability.status !== "armed" || capability.toolName !== toolName
      || canonical(capability.denials) !== canonical(currentDenialDigests)) continue;
    const lock = join(paths.locks, `${planSha256}.lock`);
    let lockFd;
    try { lockFd = openSync(lock, "wx", 0o600); }
    catch { return { status: "invalid", code: "HGO-CONCURRENT-CONSUME" }; }
    try {
      capability = validatedCapability(paths, path);
      let authorized = false;
      try { authorized = hasAuthorizedAuditEntry(paths, capability); }
      catch { return { status: "invalid", code: "HGO-AUDIT" }; }
      if (!authorized) {
        return { status: "invalid", code: "HGO-AUDIT" };
      }
      const plugin = pluginIdentity(pluginRoot, provider);
      const policy = policyIdentity(repo.root, pluginRoot, denials);
      const isLocalPluginInstall = capability.mode === "global-plugin-install";
      if (isLocalPluginInstall && !exactLocalPluginInstall(toolName, toolInput, repo.root)) {
        return { status: "replan", code: "HGO-PLUGIN-INSTALL-SHAPE" };
      }
      const repository = isLocalPluginInstall
        ? localPluginInstallSourceObservation(repo, { spawn: codexSpawn })
        : repositoryObservation(repo.root, spawn);
      const expired = new Date(capability.expiresAt).getTime() <= nowMs;
      let nativeTargetDrift = false;
      if (capability.schema === NATIVE_CAPABILITY_SCHEMA) {
        try {
          const reclassified = eligibility(repo.root, toolName, toolInput, { selectedAuthorSourceRoot: capability.authorSourceRoot });
          if (!reclassified.eligible || canonical(reclassified.paths) !== canonical(capability.eligiblePaths)
            || !(reclassified.mode === "standard" || reclassified.authorCandidate === true)) nativeTargetDrift = true;
          assertNativeTargets(repo.root, capability);
        } catch { nativeTargetDrift = true; }
      }
      const driftChecks = {
        status: capability.status !== "armed",
        root: capability.root !== repo.root,
        toolName: capability.toolName !== toolName,
        toolInputSha256: capability.toolInputSha256 !== toolInputSha256,
        denials: canonical(capability.denials) !== canonical(currentDenialDigests),
        plugin: canonical(capability.plugin) !== canonical(plugin),
        policy: canonical(capability.policy) !== canonical(policy),
        repository: capability.schema === NATIVE_CAPABILITY_SCHEMA
          ? !nativeRepositoryMatches(capability.repository, repository)
          : canonical(capability.repository) !== canonical(repository),
        ...(capability.schema === NATIVE_CAPABILITY_SCHEMA ? { nativeTargets: nativeTargetDrift } : {}),
        authorEligiblePaths: capability.mode === "pipeline-author-repair"
          && authorEligiblePaths(repo.root, capability.eligiblePaths, capability.authorSourceRoot) === null,
      };
      const drifted = Object.entries(driftChecks).some(([check, changed]) => check !== "toolInputSha256" && changed);
      if (expired || drifted) {
        appendAudit(paths, {
          type: expired ? "expired" : "rejected",
          at: new Date(nowMs).toISOString(),
          requestSha256: capability.requestSha256,
          planSha256,
          reasonSha256: capability.reasonSha256,
          code: expired ? "HGO-EXPIRED" : "HGO-DRIFT",
          ...(drifted && !expired
            ? { driftedChecks: Object.keys(driftChecks).filter((key) => driftChecks[key]) }
            : {}),
        });
        if (expired) {
          replanRequired = true;
          continue;
        }
        // An authenticated stale match is refused and audited, but cannot hide
        // a separately authorized matching capability later in the store.
        driftReplanRequired = true;
        continue;
      }
      // Only authenticated, current-context authority may disclose bound hashes.
      // Keep searching so a later exact capability retains consumption precedence.
      if (driftChecks.toolInputSha256) {
        inputMismatch ??= {
          schema: "pipeline.human-guard-override-input-mismatch.v1",
          code: "HGO-INPUT-MISMATCH",
          requestSha256: capability.requestSha256,
          planSha256: capability.planSha256,
          expectedToolInputSha256: capability.toolInputSha256,
          observedToolInputSha256: toolInputSha256,
          differingInputs: ["toolInputSha256"],
        };
        continue;
      }
      const consumedCore = {
        ...capability,
        status: "consumed",
        consumedAt: new Date(nowMs).toISOString(),
      };
      delete consumedCore.mac;
      const consumed = {
        ...consumedCore,
        mac: capabilityMac(key(paths), consumedCore),
      };
      writeAtomic(path, Buffer.from(`${JSON.stringify(consumed)}\n`, "utf8"));
      appendAudit(paths, {
        type: "consumed",
        at: consumed.consumedAt,
        requestSha256: capability.requestSha256,
        planSha256,
        reasonSha256: capability.reasonSha256,
        mode: capability.mode,
        authorSourceRoot: capability.authorSourceRoot,
      });
      return {
        status: "consumed", planSha256, requestSha256: capability.requestSha256,
        ...(skippedInvalidRecords.length ? { skippedInvalidRecords } : {}),
      };
    } finally {
      if (lockFd !== undefined) closeSync(lockFd);
      try { unlinkSync(lock); } catch {}
    }
  }
  return {
    ...(driftReplanRequired ? { status: "replan", code: "HGO-DRIFT" }
      : replanRequired ? { status: "replan", code: "HGO-EXPIRED" }
      : inputMismatch ? { status: "replan", code: "HGO-INPUT-MISMATCH", inputMismatch } : { status: "absent" }),
    ...(skippedInvalidRecords.length ? { skippedInvalidRecords } : {}),
  };
  });
}

/**
 * Read back one already-durable, exact-candidate HGO consumption as the only
 * public-safe source shape admitted by ADR-0083 D5. The private capability and
 * authenticated audit ledger remain authoritative; this returns neither of
 * them and hashes their two opaque identifiers behind a domain-separated
 * digest. Candidate-less global-plugin-install capabilities are deliberately
 * ineligible.
 */
export function observeHumanGuardOverrideGovernanceConsumption({
  rootDir,
  planSha256,
  spawn = spawnSync,
} = {}) {
  if (!SHA256.test(planSha256 ?? "")) {
    fail("HGO-GOVERNANCE-CONSUMPTION-PLAN", "a lowercase SHA-256 plan digest is required");
  }
  const repo = topology(rootDir, spawn);
  const paths = storage(repo.common);
  let capability;
  try { capability = validatedCapability(paths, capabilityPath(paths, planSha256)); }
  catch (error) {
    if (error instanceof HumanGuardOverrideError) throw error;
    fail("HGO-GOVERNANCE-CONSUMPTION-ABSENT", "the requested override capability is unavailable");
  }
  if (capability.status !== "consumed" || capability.consumedAt === null) {
    fail("HGO-GOVERNANCE-CONSUMPTION-NOT-CONSUMED", "the requested override capability has not been consumed");
  }
  if (capability.root !== repo.root) {
    fail("HGO-GOVERNANCE-CONSUMPTION-ROOT", "the consumed override belongs to a different physical checkout");
  }
  const oid = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u;
  const candidate = { commit: capability.repository?.head, tree: capability.repository?.tree };
  if (capability.mode === "global-plugin-install" || !oid.test(candidate.commit ?? "") || !oid.test(candidate.tree ?? "")) {
    fail("HGO-GOVERNANCE-CONSUMPTION-CANDIDATE", "the consumed override has no exact repository candidate");
  }
  const consumedAuditEntry = verifiedAuditEntries(paths, key(paths)).some(({ event }) =>
    event?.type === "consumed"
      && event.requestSha256 === capability.requestSha256
      && event.planSha256 === capability.planSha256
      && event.reasonSha256 === capability.reasonSha256
      && event.mode === capability.mode
      && event.authorSourceRoot === capability.authorSourceRoot
      && event.at === capability.consumedAt);
  if (!consumedAuditEntry) {
    fail("HGO-GOVERNANCE-CONSUMPTION-AUDIT", "no matching authenticated consumption audit entry exists");
  }
  try {
    return buildGovernanceHgoConsumptionSource({
      planSha256: capability.planSha256,
      requestSha256: capability.requestSha256,
      candidate,
    });
  } catch {
    fail("HGO-GOVERNANCE-CONSUMPTION-SOURCE", "the public-safe consumption source could not be derived");
  }
}

export function verifyHumanGuardOverrideAudit({ rootDir, spawn = spawnSync } = {}) {
  const repo = topology(rootDir, spawn);
  const paths = storage(repo.common);
  const secret = key(paths);
  const entries = verifiedAuditEntries(paths, secret);
  return {
    schema: "pipeline.human-guard-override-audit-verification.v1",
    status: "valid",
    entries: entries.length,
    lastMac: entries.at(-1)?.mac ?? null,
  };
}

export function inspectHumanGuardOverrideAudit({ rootDir, spawn = spawnSync } = {}) {
  try {
    const repo = topology(rootDir, spawn);
    const paths = storage(repo.common);
    return publicAuditState(auditState(paths, key(paths)));
  } catch (error) {
    if (error instanceof HumanGuardOverrideError) {
      return {
        schema: AUDIT_STATE_SCHEMA,
        status: "terminal-invalid",
        reason: error.message,
        code: error.code,
      };
    }
    throw error;
  }
}

export function repairHumanGuardOverrideAudit({
  rootDir,
  expectedPreimageSha256,
  activate = false,
  nowMs = Date.now(),
  spawn = spawnSync,
  dependencies = {},
} = {}) {
  if (!activate || !SHA256.test(expectedPreimageSha256 ?? "")) {
    fail("HGO-AUDIT-REPAIR-CONFIRMATION", "audit repair requires its inspected preimage and explicit activation");
  }
  const repo = topology(rootDir, spawn);
  const paths = storage(repo.common);
  const initialSecret = key(paths);
  const initial = auditState(paths, initialSecret);
  if (initial.status === "terminal-invalid") fail("HGO-AUDIT", initial.reason);
  const idempotentRetry = initial.status === "valid"
    && completedAuditRepair(initial.ledger, initialSecret, expectedPreimageSha256) !== null;
  if (initial.status === "valid" && !idempotentRetry) {
    fail("HGO-AUDIT-REPAIR-NOT-REQUIRED", "audit ledger is already valid");
  }
  if (initial.status !== "valid" && initial.repairPreimageSha256 !== expectedPreimageSha256) {
    fail("HGO-AUDIT-REPAIR-DRIFT", "audit repair preimage no longer matches");
  }
  const challenge = `HGO-AUDIT-${expectedPreimageSha256.slice(0, 12).toUpperCase()}`;
  const confirmation = runRegisteredAttendedChatGateConfirmation({
    repository: inspectSignedDescriptorCustodyRepository(rootDir),
    summaryLines: [
      "Human Guard Override audit repair",
      `Repository: ${repo.root}`,
      `Authenticated head entries: ${initial.status === "valid" ? initial.entries : initial.headEntries}`,
      `Authenticated contiguous tail entries: ${initial.status === "valid" ? 0 : initial.tailEntries}`,
      `Repair preimage: ${expectedPreimageSha256}`,
      `Confirmation: ${challenge}`,
    ],
    expected: challenge,
  });
  if (!confirmation.ok) {
    const code = confirmation.code === CHAT_GATE_NOT_ATTENDED
      ? "HGO-AUDIT-REPAIR-NOT-ATTENDED"
      : "HGO-AUDIT-REPAIR-CONFIRMATION-MISMATCH";
    fail(code, "audit repair requires an attended terminal and exact typed readback");
  }

  let lock;
  try {
    const secret = key(paths);
    lock = acquireAuditLock(paths, secret, { ...dependencies, purpose: "existing" });
    const state = auditState(paths, secret);
    if (state.status === "terminal-invalid") fail("HGO-AUDIT", state.reason);
    if (state.status === "valid") {
      if (completedAuditRepair(state.ledger, secret, expectedPreimageSha256) !== null) {
        return {
          schema: AUDIT_REPAIR_SCHEMA,
          status: "already-repaired",
          entries: state.entries,
          repairPreimageSha256: expectedPreimageSha256,
        };
      }
      fail("HGO-AUDIT-REPAIR-DRIFT", "audit ledger changed before repair");
    }
    if (state.repairPreimageSha256 !== expectedPreimageSha256) {
      fail("HGO-AUDIT-REPAIR-DRIFT", "audit repair preimage no longer matches");
    }

    let entries = state.ledger.entries;
    let ledgerBytes = state.ledger.ledgerBytes;
    if (!state.completionPending) {
      const event = {
        type: "audit-repaired",
        at: new Date(nowMs).toISOString(),
        repairPreimageSha256: expectedPreimageSha256,
        priorHeadEntries: state.headEntries,
        recoveredTailEntries: state.tailEntries,
      };
      const core = {
        schema: AUDIT_SCHEMA,
        sequence: entries.length + 1,
        previousMac: entries.at(-1)?.mac ?? "0".repeat(64),
        event,
      };
      const entry = { ...core, mac: createHmac("sha256", secret).update(canonical(core)).digest("hex") };
      entries = [...entries, entry];
      ledgerBytes = Buffer.concat([ledgerBytes, Buffer.from(`${JSON.stringify(entry)}\n`, "utf8")]);
      // Ledger first is deliberate. If interrupted here, the authenticated old
      // head still binds its exact prefix and the authenticated repair event lets
      // a retry finish the head without appending a second repair event.
      writeAtomic(paths.audit, ledgerBytes);
      dependencies.afterLedgerWriteFn?.();
    }
    writeAtomic(paths.auditHead, Buffer.from(`${JSON.stringify(auditHead(secret, entries, ledgerBytes))}\n`, "utf8"));
    const verified = requireValidAuditState(paths, secret);
    if (completedAuditRepair(verified.ledger, secret, expectedPreimageSha256) === null) {
      fail("HGO-AUDIT", "audit repair readback is invalid");
    }
    return {
      schema: AUDIT_REPAIR_SCHEMA,
      status: state.completionPending ? "completed" : "repaired",
      entries: verified.entries,
      repairPreimageSha256: expectedPreimageSha256,
    };
  } finally {
    releaseOwnedAuditLock(lock);
  }
}

// ---------------------------------------------------------------------------------
// NVA-SIGENTRY-1: resolves an HGO signature-mode intent digest back to the recorded
// request behind it, so `po-human-approval.mjs sign-intent` can show what it is about
// to authorize instead of falling into "no recorded request resolves for this digest"
// for every HGO selection (backlog/items/2026-08-08-the-signing-ceremony-is-designed-
// for-the-verifier-not-the-signer.md finding 7; ADR-0061 Decision 4). Mirrors
// `describeGuardMaintenanceWindowRequest()`'s (lib/guard-maintenance-window.mjs) return
// shape closely enough that `sign-intent`'s existing `record.resolved ? record.lines :
// [...]` branch needs no restructuring -- only a second resolver attempt when the GMW
// describer itself does not resolve. Never fabricates: every displayed value is read
// from a stored request that RE-DERIVES, through the exact same
// `buildHumanGuardOverrideSignatureIntent()` recipe the verifier uses, to the digest
// about to be signed. A request whose stored bytes no longer re-derive to any digest --
// edited, or simply superseded since -- stops matching; it never starts describing a
// lie. A digest-keyed private index selects exactly one strict request/plan pair.
// The resolver never scans requests or creates a plan while displaying a signature.
// ---------------------------------------------------------------------------------

const HGO_DISCLOSURE_MAX_RECORD_BYTES = 1024 * 1024;
function disclosureIndexPath(paths, intentSha256) {
  if (!SHA256.test(intentSha256)) fail("HGO-DIGEST", "disclosure intent digest is invalid");
  return join(paths.plans, intentSha256 + ".disclosure.json");
}
function boundedDisclosureRecord(path) {
  const before = safePrivateFile(path);
  if (before.size > HGO_DISCLOSURE_MAX_RECORD_BYTES) fail("HGO-DISCLOSURE-BOUND", "disclosure record exceeds its closed bound");
  let fd;
  try {
    fd = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    const opened = fstatSync(fd); if (!opened.isFile() || opened.nlink !== 1 || opened.dev !== before.dev || opened.ino !== before.ino) fail("HGO-DISCLOSURE-DRIFT", "disclosure record changed");
    const bytes = readHgoBoundedRegularBytes(fd, HGO_DISCLOSURE_MAX_RECORD_BYTES, "HGO-DISCLOSURE-BOUND"), after = fstatSync(fd), named = safePrivateFile(path);
    if (bytes.length > HGO_DISCLOSURE_MAX_RECORD_BYTES || bytes.length !== opened.size) fail("HGO-DISCLOSURE-BOUND", "disclosure full read exceeds its closed bound");
    for (const key of ["dev","ino","mode","size","nlink","mtimeMs","ctimeMs"]) if (opened[key] !== after[key] || opened[key] !== named[key]) fail("HGO-DISCLOSURE-DRIFT", "disclosure record changed during read");
    let value; try { value = JSON.parse(bytes.toString("utf8")); } catch { fail("HGO-DISCLOSURE-INDEX", "disclosure record is malformed"); }
    return {value, sha256: sha(bytes), bytes: bytes.length};
  } finally { if (fd !== undefined) closeSync(fd); }
}
function boundedDisclosureJson(path) { return boundedDisclosureRecord(path).value; }
function validatedDisclosureIndex(path) {
  const value = boundedDisclosureJson(path);
  if (!exactKeys(value,["schema","root","intentSha256","requestSha256","planSha256","selectionSha256","reasonSha256","authorSourceRoot","expiresAt"])
    || value.schema !== HGO_DISCLOSURE_INDEX_SCHEMA || typeof value.root !== "string"
    || [value.intentSha256,value.requestSha256,value.planSha256,value.selectionSha256,value.reasonSha256].some(digest => !SHA256.test(digest))
    || !(value.authorSourceRoot === null || typeof value.authorSourceRoot === "string")
    || typeof value.expiresAt !== "string" || !Number.isFinite(Date.parse(value.expiresAt))
    || basename(path) !== value.intentSha256 + ".disclosure.json") fail("HGO-DISCLOSURE-INDEX", "disclosure index is not closed");
  return value;
}
export function indexHumanGuardOverrideSelection({rootDir,pluginRoot,requestSha256,planSha256,authorSourceRoot=null,nowMs=Date.now(),spawn=spawnSync,scriptPath}={}) {
  const repo = topology(rootDir,spawn), paths = storage(repo.common);
  const persisted = readPersistedPlan(paths,requestSha256,authorSourceRoot);
  if (persisted === null || persisted.planSha256 !== planSha256) fail("HGO-PLAN", "disclosure requires the exact persisted plan");
  const request = validatedRequest(paths,requestSha256); assertRequestNotExpired(request,repo,nowMs); assertPlanNotExpired(persisted,nowMs);
  const planned = buildPlanResult(persisted,scriptPath);
  const prepared = prepareHumanGuardOverrideAuthorization({rootDir,pluginRoot,requestSha256,planSha256,reason:HGO_SIGNATURE_REASON,nowMs,spawn,scriptPath,authorSourceRoot});
  const intent = buildHumanGuardOverrideSignatureIntent({prepared,planned});
  const record = {schema:HGO_DISCLOSURE_INDEX_SCHEMA,root:repo.root,intentSha256:intent.sha256,requestSha256,planSha256,
    selectionSha256:prepared.selectionSha256,reasonSha256:prepared.reasonSha256,authorSourceRoot,expiresAt:planned.expiresAt};
  const path = disclosureIndexPath(paths,intent.sha256);
  return hgoPlanningPublication({repo,paths,entry:"plan-override",intendedPath:path,inputSha256:sha(record)},()=>{
    if (existsSync(path)) { if (canonical(validatedDisclosureIndex(path)) !== canonical(record)) fail("HGO-DISCLOSURE-INDEX", "disclosure index conflicts"); }
    else writeExclusive(path,Buffer.from(JSON.stringify(record)+"\n","utf8"));
    return {schema:"pipeline.hgo-disclosure-index-result.v1",status:"indexed",intentSha256:intent.sha256,requestSha256,planSha256};
  });
}
function readIndexedDisclosurePlan({repo,intentSha256,nowMs}) {
  const base = join(repo.common,"agent-pipeline","human-guard-overrides"), paths = {base,requests:join(base,"requests"),plans:join(base,"plans")};
  for (const path of [base,paths.requests,paths.plans]) hgoAuthorityDirectory(path);
  const index = validatedDisclosureIndex(disclosureIndexPath(paths,intentSha256));
  if (index.root !== repo.root || index.intentSha256 !== intentSha256 || Date.parse(index.expiresAt) <= nowMs) fail("HGO-DISCLOSURE-INDEX", "disclosure index context is stale");
  // Validate the bounded parsed bytes directly; never reopen an unbounded second copy.
  const request = validatedRequest(paths,index.requestSha256,boundedDisclosureJson(requestPath(paths,index.requestSha256)));
  const path = planPath(paths,index.requestSha256,index.authorSourceRoot);
  const physicalPlan = boundedDisclosureRecord(path);
  const planned = validatedPlan(path,physicalPlan.value);
  if (request.root !== repo.root || planned.root !== repo.root || planned.requestSha256 !== index.requestSha256
    || planned.planSha256 !== index.planSha256 || planned.authorSourceRoot !== index.authorSourceRoot || planned.expiresAt !== index.expiresAt
    || planned.toolName !== request.toolName || planned.toolInputSha256 !== request.toolInputSha256
    || canonical(planned.denials) !== canonical(request.denials) || canonical(planned.policy) !== canonical(request.policy)
    || canonical(planned.preview) !== canonical(request.preview) || canonical(planned.eligiblePaths) !== canonical(request.eligiblePaths)
    || canonical(planned.plugin) !== canonical(request.plugin)
    || (planned.schema === NATIVE_PLAN_SCHEMA && canonical(planned.nativeTargets) !== canonical(request.nativeTargets))) fail("HGO-DISCLOSURE-INDEX", "disclosure index does not bind its original request and plan");
  const reasonSha256=sha(Buffer.from(HGO_SIGNATURE_REASON,"utf8"));
  const selection={schema:"pipeline.human-guard-override-authorization-selection.v1",requestSha256:index.requestSha256,planSha256:index.planSha256,reasonSha256};
  const prepared={...selection,selectionSha256:sha(selection)};
  const intent=buildHumanGuardOverrideSignatureIntent({prepared,planned});
  if (intent.sha256 !== intentSha256 || prepared.selectionSha256 !== index.selectionSha256 || reasonSha256 !== index.reasonSha256) fail("HGO-DISCLOSURE-INDEX", "disclosure intent does not rederive");
  return {planned, materialArtifact: {path, sha256: physicalPlan.sha256, bytes: physicalPlan.bytes},
    requestBinding: {requestSha256: index.requestSha256, planSha256: index.planSha256, selectionSha256: index.selectionSha256}};
}
function hgoRedactDisclosure(value) {
  return (typeof value === "string" ? value : "")
    .replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*/gu,"[redacted private key]")
    .replace(/(?:gh[pousr]_[A-Za-z0-9]{16,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16})/gu,"[redacted credential]")
    .replace(/\bBearer\s+[A-Za-z0-9._~+\/-]+=*/giu,"Bearer [redacted]")
    .replace(/((?:token|password|secret|authorization)\s*[:=]\s*)["']?[^\s,;"']+/giu,"$1[redacted]")
    .replace(/(^|[\s"'(])(?:[A-Za-z]:[\\/]|\/)[^\s"')]+/gu,"$1[redacted absolute path]");
}

const HGO_SUMMARY_MAX_LINES = 8;
const HGO_SUMMARY_MAX_LINE_CHARS = 240;
const HGO_SUMMARY_MAX_RATIONALE_CHARS = 160;
const HGO_SUMMARY_MAX_PATHS = 8;

function hgoDisplayText(value, limit) {
  const flat = hgoRedactDisclosure(value).replace(/\p{C}/gu, " ").replace(/\s+/gu, " ").trim();
  return flat.length <= limit
    ? { text: flat, truncated: false, length: flat.length }
    : { text: `${flat.slice(0, limit)}...`, truncated: true, length: flat.length };
}

function hgoDisplayTimestamp(value) {
  try {
    const iso = new Date(value).toISOString();
    return typeof iso === "string" ? iso : String(value);
  } catch { return String(value); }
}

function hgoClipLines(lines) {
  return lines.slice(0, HGO_SUMMARY_MAX_LINES).map((line) => {
    const flat = String(line).replace(/\p{C}/gu, " ");
    return flat.length <= HGO_SUMMARY_MAX_LINE_CHARS ? flat : `${flat.slice(0, HGO_SUMMARY_MAX_LINE_CHARS - 3)}...`;
  });
}

function unresolvedHumanGuardOverrideSelection(code) {
  return { resolved: false, code, lines: [] };
}

/**
 * Resolves the HGO signature-mode request recorded in this repository for
 * `intentSha256` and renders a bounded, purely-read summary of it -- the eligible
 * paths, the denying guard's rationale, and the expiry, exactly the three things
 * `prepared.decisionPreview`/`planned.preview` already carry (ADR-0059's own
 * "the eligible paths, the denying guard's rationale, and the expiry are all already
 * in the prepared selection's decisionPreview").
 *
 * Looks up one digest-keyed index and bounded original request/persisted plan,
 * recomputes the fixed selection and genuine pure intent, then displays only an
 * exact match. Unknown, stale or unindexed historical digests remain unresolved.
 * This path performs no planning publication, capability activation or store scan.
 */
function describeHumanGuardOverrideSelectionCore({ rootDir, pluginRoot, intentSha256, scriptPath, spawn = spawnSync } = {}, includeFullMaterial = false, signatureRequest = null) {
  try {
    if (!SHA256.test(intentSha256 ?? "")) return unresolvedHumanGuardOverrideSelection("HGO-RECORD-DIGEST-INVALID");
    let repo; try { repo = topology(rootDir,spawn); } catch { return unresolvedHumanGuardOverrideSelection("HGO-RECORD-REPOSITORY-UNAVAILABLE"); }
    let planned, materialArtifact, requestBinding;
    try { ({planned, materialArtifact, requestBinding} = readIndexedDisclosurePlan({repo,intentSha256,nowMs:Date.now()})); }
    catch { return unresolvedHumanGuardOverrideSelection("HGO-RECORD-INDEX-UNAVAILABLE"); }
    if (includeFullMaterial && (signatureRequest === null
      || signatureRequest.requestSha256 !== requestBinding.requestSha256
      || signatureRequest.planSha256 !== requestBinding.planSha256
      || signatureRequest.selectionSha256 !== requestBinding.selectionSha256
      || signatureRequest.intentSha256 !== intentSha256)) return null;
    const pathsTotal = planned.eligiblePaths.length;
    const eligiblePaths = planned.eligiblePaths.slice(0,HGO_SUMMARY_MAX_PATHS).map(path=>hgoDisplayText(path,200).text);
    const pathsNote = pathsTotal > eligiblePaths.length ? " [showing " + eligiblePaths.length + " of " + pathsTotal + "]" : "";
    const rationale = (planned.preview?.guardRationale ?? []).map(({guard,rationale:text})=>{
      const rendered=hgoDisplayText(text,HGO_SUMMARY_MAX_RATIONALE_CHARS);
      return hgoDisplayText(guard,64).text+": \""+rendered.text+"\""+(rendered.truncated?" [truncated]":"");
    }).join("; ");
    return {resolved:true,code:"HGO-RECORD-RESOLVED",materialArtifact,requestBinding,
      ...(includeFullMaterial ? {fullReviewMaterial: planned} : {}),lines:hgoClipLines([
      "recorded request: "+(planned.schema===NATIVE_PLAN_SCHEMA?NATIVE_REQUEST_SCHEMA:REQUEST_SCHEMA)+" (tool "+hgoDisplayText(planned.toolName,32).text+", class "+hgoDisplayText(planned.commandClass,64).text+")",
      "eligible paths this override would admit: "+eligiblePaths.join(", ")+pathsNote,
      "denying guard rationale: "+(rationale||"(none recorded)"),
      "window expires at (signed, absolute): "+hgoDisplayTimestamp(planned.expiresAt),
      ...(planned.schema===NATIVE_PLAN_SCHEMA?[]:["legacy whole-worktree binding: sign and deliver serially; unrelated worktree edits invalidate this authorization"]),
    ])};
  } catch { return unresolvedHumanGuardOverrideSelection("HGO-RECORD-UNREADABLE"); }
}

export function describeHumanGuardOverrideSelection({ rootDir, pluginRoot, intentSha256, scriptPath, spawn = spawnSync } = {}) {
  return describeHumanGuardOverrideSelectionCore({rootDir, pluginRoot, intentSha256, scriptPath, spawn}, false);
}

// This pure descriptor accepts only the genuine emitter transport and the
// same original indexed request/plan/selection/intent, never a new grant.
export function describeHumanGuardOverrideSignatureRequest(record, {rootDir, pluginRoot, scriptPath, spawn = spawnSync} = {}) {
  try {
    if (!exactKeys(record, ["schema", "requestSha256", "planSha256", "selectionSha256", "intentSha256"])
      || record.schema !== "pipeline.human-guard-override-signature-digest.v1"
      || ![record.requestSha256, record.planSha256, record.selectionSha256, record.intentSha256].every(value => typeof value === "string" && SHA256.test(value))) return null;
    const description = describeHumanGuardOverrideSelectionCore({rootDir, pluginRoot, scriptPath, spawn, intentSha256: record.intentSha256}, true, record);
    return description?.resolved === true ? description : null;
  } catch { return null; }
}

export const humanGuardOverrideInternals = {
  canonical,
  sha,
  eligibility,
  commandDisclosureFields,
  lifecycleNotReadyRecovery,
  secureDirectory,
  safePrivateFile,
  // NVA-HGOFIX-2: exposed so the suite can drive the win32 platform seam directly, without
  // going through eligibility()'s full argv-parsing path.
  safePath,
  crossBoundaryTarget,
  separatorNormalized,
  filterGovernanceEventsStatus,
  repositoryObservation,
  // Exposed only so Full Verify can directly exercise the local-plugin-install
  // attestation against THIS repository's own, real .claude-plugin/marketplace.json
  // and plugins/pipeline-core tree (Critic finding F1, dispatch CRITIC-REMEDY-09) --
  // without this, the suite's synthetic fixtures could never observe a regression
  // in the real repository manifest.
  isPipelineSourceRoot,
  localPluginInstallSourceObservation,
  // NVA-BL-20: exposed so the suite can drive both external-root outcomes from
  // synthetic fixtures with an injected registry reader, instead of depending on
  // the machine's own Codex registry state, which a test cannot control.
  externalLocalMarketplaceObservation,
  // NVA-MKTHASH-1: exposed so the suite can compute the checkout's own
  // plugin-source tree hash directly, the same value
  // localPluginInstallSourceObservation() threads into
  // externalLocalMarketplaceObservation() as checkoutTreeSha256 -- needed to
  // drive the new directory-copy acceptance path from a direct call to
  // externalLocalMarketplaceObservation(), the way the existing NVA-BL-20
  // link-shaped tests already drive that function directly.
  pluginSourceTreeSha256,
  acquireAuditLock,
  releaseOwnedAuditLock,
  resolveAuditLockHost,
  localAuditLockOwner,
  auditLockOwnerState,
  captureNativeTargetPreimages,
  nativeTargetsValid,
  nativeRepositoryMatches,
  hgoRedactDisclosure,
};

// ---------------------------------------------------------------------------------
// Briefed Test-Change Authorization (WP-B2-1, Spec §5.2 item 1, AC-11)
// ---------------------------------------------------------------------------------
export const BRIEFED_TEST_AUTHORIZATION_SCHEMA = "pipeline.briefed-test-authorization.v1";
export const BRIEFED_TEST_CHANGE_KIND = "briefed-test-change";
export const HGO_TRUST_ANCHOR_NEW_KEY_CONFIRMATION_REQUIRED = "HGO-TRUST-ANCHOR-NEW-KEY-CONFIRMATION-REQUIRED";
export { confirmTrustAnchorKey, isRecognizedTrustAnchorKey };

export function briefedAuthorizationId(targetPath, briefingDigest) {
  const norm = typeof targetPath === "string" ? targetPath.replace(/\\/g, "/") : "";
  return sha(`${norm}:${briefingDigest}`);
}

function canonicalBriefedTarget(rootDir, targetPath, spawn = spawnSync) {
  if (typeof targetPath !== "string" || targetPath.trim() === "" || targetPath.includes("\0")) return null;
  let repo;
  try { repo = topology(rootDir, spawn); }
  catch {
    try { repo = controlPathTopology(rootDir); }
    catch { return null; }
  }
  const raw = targetPath.replace(/\\/g, "/");
  const absolute = resolve(repo.root, raw);
  const rel = relative(repo.root, absolute).replace(/\\/g, "/");
  if (rel === "" || rel === "." || rel === ".." || rel.startsWith("../") || isAbsolute(rel)) return null;
  // Resolve the target when it exists, or the nearest existing ancestor when the
  // leaf is not yet created. This preserves legitimate missing leaves while still
  // validating every existing parent (including symlinks) against the repository.
  let cursor = absolute;
  while (true) {
    try {
      lstatSync(cursor);
    } catch (error) {
      if (error?.code !== "ENOENT" && error?.code !== "ENOTDIR") return null;
      const parent = dirname(cursor);
      if (parent === cursor) return null;
      cursor = parent;
      continue;
    }
    let physical;
    try { physical = realpathSync(cursor); } catch { return null; }
    const physicalRel = relative(repo.root, physical).replace(/\\/g, "/");
    if (physicalRel === ".." || physicalRel.startsWith("../") || isAbsolute(physicalRel)) return null;
    break;
  }
  return rel;
}

function briefedTestIntent(targetPath, briefingDigest, expiresAtMs) {
  const subjectSha256 = sha({ targetPath, briefingDigest, expiry: new Date(expiresAtMs).toISOString() });
  return createPoApprovalIntent({
    kind: BRIEFED_TEST_CHANGE_KIND,
    featureId: "briefed-test-change",
    planSha256: subjectSha256,
    specSha256: sha(BRIEFED_TEST_AUTHORIZATION_SCHEMA),
    candidate: { commit: "0".repeat(40), tree: "1".repeat(40) },
    policyRevision: "briefed-test-authorization-v1",
    subjectSha256,
    decision: "authorize",
  });
}

function recognizedBriefedSigner(rootDir, proof) {
  if (!proof || typeof proof !== "object" || !isWellFormedEd25519PublicKey(proof.publicKey)) return null;
  const publicKeySha256 = createHash("sha256").update(proof.publicKey).digest("hex");
  const policy = readCriticalHumanProofPolicy(rootDir);
  const anchors = policy.ok && Array.isArray(policy.trustAnchors) && policy.trustAnchors.length > 0
    ? policy.trustAnchors : policy.ok && policy.trustAnchor !== null ? [policy.trustAnchor] : [];
  const anchor = anchors.find(value => value?.publicKeySha256 === publicKeySha256
    && value?.keyReference === proof.keyReference);
  return anchor ? { keyReference: anchor.keyReference, publicKeySha256 } : null;
}

export function createBriefedTestChangeAuthorization({
  rootDir,
  targetPath,
  briefingDigest,
  expiry,
  mode = "chat",
  reason = "briefed test-change authorization",
  proof = null,
  nowMs = Date.now(),
  spawn = spawnSync,
} = {}) {
  if (typeof targetPath !== "string" || targetPath.trim() === "") {
    fail("HGO-BRIEFED-TARGET-INVALID", "targetPath must be a non-empty string");
  }
  if (typeof briefingDigest !== "string" || !SHA256.test(briefingDigest)) {
    fail("HGO-BRIEFED-DIGEST-INVALID", "briefingDigest must be a 64-char sha256 hex string");
  }
  const expiresAtMs = typeof expiry === "number" ? expiry : Date.parse(expiry);
  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= nowMs) {
    fail("HGO-BRIEFED-EXPIRY-INVALID", "expiry must be a future timestamp or ISO date string");
  }

  const normTarget = canonicalBriefedTarget(rootDir, targetPath, spawn);
  if (normTarget === null) {
    fail("HGO-BRIEFED-TARGET-INVALID", "targetPath must resolve to an in-repository path");
  }
  let repo;
  try { repo = topology(rootDir, spawn); }
  catch {
    try { repo = controlPathTopology(rootDir); }
    catch { fail("HGO-ROOT", "repository root could not be established"); }
  }
  let approval;
  try { approval = readHumanApprovalMode(rootDir, { legacyKind: "push", spawn }); }
  catch { fail("HGO-BRIEFED-MODE", "human approval mode could not be read"); }
  if (!["chat", "signature"].includes(mode) || approval.mode !== mode) {
    fail("HGO-BRIEFED-MODE", "briefed test authorization must use the repository's current human approval mode");
  }
  if (mode === "chat" && proof !== null) {
    fail("HGO-BRIEFED-MODE", "chat authorization cannot carry a signature proof");
  }
  const paths = storage(repo.common);

  let signer = null;
  if (mode === "signature") {
    if (!proof || typeof proof !== "object" || !isWellFormedEd25519PublicKey(proof.publicKey)) {
      fail("HGO-PROOF-INVALID", "PO-APPROVAL-PROOF-INVALID");
    }
    const intent = briefedTestIntent(normTarget, briefingDigest, expiresAtMs);
    const derived = recognizedBriefedSigner(rootDir, proof);
    if (!derived) fail("HGO-TRUST-ANCHOR-NEW-KEY-CONFIRMATION-REQUIRED", "signing key is not recognized by the committed policy");
    const sigCheck = verifyPoApprovalProof({ intent, trustPolicy: derived, proof });
    if (!sigCheck.verified) {
      fail("HGO-PROOF-INVALID", sigCheck.code ?? "PO-APPROVAL-PROOF-INVALID");
    }
    signer = derived;
  }

  const id = briefedAuthorizationId(normTarget, briefingDigest);
  const record = {
    schema: BRIEFED_TEST_AUTHORIZATION_SCHEMA,
    kind: BRIEFED_TEST_CHANGE_KIND,
    id,
    targetPath: normTarget,
    briefingDigest,
    expiry: new Date(expiresAtMs).toISOString(),
    expiresAtMs,
    grantedAt: new Date(nowMs).toISOString(),
    mode,
    reason,
    signer,
    proof: proof || null,
  };

  return hgoPublishBriefedAuthority({repo, paths, record}, () => {
  const recordPath = join(paths.briefedAuthorizations, `${id}.json`);
  writeAtomic(recordPath, Buffer.from(JSON.stringify(record, null, 2) + "\n", "utf8"));

  return {
    schema: BRIEFED_TEST_AUTHORIZATION_SCHEMA,
    status: "granted",
    id,
    targetPath: normTarget,
    briefingDigest,
    expiry: record.expiry,
    expiresAtMs,
    mode,
  };
  });
}

export function readActiveBriefedTestAuthorizations({
  rootDir,
  targetPath = null,
  briefingDigest = null,
  nowMs = Date.now(),
  spawn = spawnSync,
} = {}) {
  let repo;
  try { repo = topology(rootDir, spawn); }
  catch {
    try { repo = controlPathTopology(rootDir); }
    catch { return []; }
  }
  const paths = storage(repo.common);
  const normTarget = typeof targetPath === "string"
    ? canonicalBriefedTarget(rootDir, targetPath, spawn)
    : null;
  if (typeof targetPath === "string" && normTarget === null) return [];
  let approval;
  try { approval = readHumanApprovalMode(rootDir, { legacyKind: "push", spawn }); }
  catch { return []; }
  if (!["chat", "signature"].includes(approval.mode)) return [];
  const results = [];
  try {
    const entries = readdirSync(paths.briefedAuthorizations).filter((n) => n.endsWith(".json"));
    for (const name of entries) {
      try {
        const recordPath = join(paths.briefedAuthorizations, name);
        if (!lstatSync(recordPath).isFile()) continue;
        const content = readFileSync(recordPath, "utf8");
        const rec = JSON.parse(content);
        if (rec?.schema !== BRIEFED_TEST_AUTHORIZATION_SCHEMA || rec?.kind !== BRIEFED_TEST_CHANGE_KIND) continue;
        if (rec.mode !== approval.mode || typeof rec.targetPath !== "string" ||
            typeof rec.briefingDigest !== "string" || !SHA256.test(rec.briefingDigest)) continue;
        if (typeof rec.expiresAtMs !== "number" || !Number.isFinite(rec.expiresAtMs)) continue;
        if (typeof rec.expiry !== "string" || !Number.isFinite(Date.parse(rec.expiry))) continue;
        if (rec.expiresAtMs <= nowMs || new Date(rec.expiresAtMs).toISOString() !== rec.expiry) continue;
        if (canonicalBriefedTarget(rootDir, rec.targetPath, spawn) !== rec.targetPath) continue;
        if (rec.id !== briefedAuthorizationId(rec.targetPath, rec.briefingDigest) || name !== `${rec.id}.json`) continue;
        if (rec.mode === "signature") {
          const signer = recognizedBriefedSigner(rootDir, rec.proof);
          if (!signer || rec.signer?.keyReference !== signer.keyReference ||
              rec.signer?.publicKeySha256 !== signer.publicKeySha256 ||
              !verifyPoApprovalProof({
                intent: briefedTestIntent(rec.targetPath, rec.briefingDigest, rec.expiresAtMs),
                trustPolicy: signer,
                proof: rec.proof,
              }).verified) continue;
        } else if (rec.proof !== null || rec.signer !== null) continue;
        if (normTarget !== null) {
          const recNorm = canonicalBriefedTarget(rootDir, rec.targetPath, spawn);
          if (recNorm === null || recNorm !== normTarget) continue;
        }
        if (briefingDigest !== null && rec.briefingDigest !== briefingDigest) continue;
        results.push(rec);
      } catch {}
    }
  } catch {}
  return results;
}

export function checkBriefedTestChangeAdmitted({
  rootDir,
  targetPath,
  briefingDigest = null,
  nowMs = Date.now(),
  spawn = spawnSync,
} = {}) {
  if (!targetPath) return { admitted: false, code: "NO-TARGET" };
  if (typeof briefingDigest !== "string" || briefingDigest.length === 0) {
    return { admitted: false, code: "BRIEFING-DIGEST-REQUIRED" };
  }
  if (!SHA256.test(briefingDigest)) {
    return { admitted: false, code: "BRIEFING-DIGEST-INVALID" };
  }
  const norm = canonicalBriefedTarget(rootDir, targetPath, spawn);
  if (norm === null) return { admitted: false, code: "TARGET-INVALID" };
  const active = readActiveBriefedTestAuthorizations({ rootDir, targetPath: norm, nowMs, spawn });
  if (active.length === 0) {
    return { admitted: false, code: "NO-AUTHORIZATION" };
  }
  const match = active.find((a) => a.briefingDigest === briefingDigest);
  if (match) return { admitted: true, authorization: match };
  return { admitted: false, code: "BRIEFING-DIGEST-MISMATCH" };
}

export function isBriefedTestChangeEligible(filePath, { rootDir = null, livePluginRoot = null } = {}) {
  if (typeof filePath !== "string" || filePath.trim() === "") return false;
  const normalized = filePath.replace(/\\/g, "/");
  if (rootDir) {
    try {
      if (isNeverLiftableKernelPath(filePath, { rootDir, livePluginRoot })) {
        return false;
      }
    } catch {}
  }
  return /\.(?:test|spec)\.[cm]?[jt]sx?$/iu.test(normalized);
}

// AUTH-I04: read-only physical inventory. These paths deliberately do not use
// storage(), whose directory creation is a writer effect.
const hgoAuthorityPorts = new WeakMap();
const hgoAuthorityOperations = new WeakMap();
const hgoAuthorityPlanning = new WeakMap();
const hgoAuthorityPortByCommon = new Map();
const hgoAuthorityExecutions = new WeakMap();
const hgoAuthorityTerminals = new WeakMap();
const hgoAuthorityExecuting = new AsyncLocalStorage();
// Only the original synchronous direct writer can issue this temporary join.
// A retained operation WeakMap row alone never grants a missing-index waiver.
const hgoAuthorityDirectReservation = new AsyncLocalStorage();
const HGO_AUTHORITY_NAMESPACES = Object.freeze([
  "requests", "plans", "capabilities", "briefed-authorizations", "locks", "audit", "command-offers",
]);
function hgoAuthorityFailure(reason) {
  const error = new HumanGuardOverrideError("SDC-AUTHORITY-UNAVAILABLE", reason);
  error.reason = reason;
  throw error;
}
function hgoAuthorityRepository(input) {
  if (!exactKeys(input, ["primaryRoot", "commonDir", "candidate"])) hgoAuthorityFailure("hgo:repository-shape");
  const actual = inspectSignedDescriptorCustodyRepository(input.primaryRoot);
  if (canonical(actual) !== canonical(input)) hgoAuthorityFailure("hgo:repository-changed");
  return actual;
}
function hgoAuthorityPaths(repository) {
  const base = join(repository.commonDir, "agent-pipeline", "human-guard-overrides");
  return {
    base, requests: join(base, "requests"), plans: join(base, "plans"),
    capabilities: join(base, "capabilities"), briefedAuthorizations: join(base, "briefed-authorizations"),
    locks: join(base, "locks"), key: join(base, "audit.key"), audit: join(base, "audit.jsonl"),
    auditHead: join(base, "audit.head.json"), auditLock: join(base, "audit.lock"),
    auditLockRecovery: join(base, "audit.lock.recover"), commandOffers: join(base, "command-offers.jsonl"),
    authorityHolds: join(base, "authority-holds"),
  };
}
function hgoAuthorityFacts(inventory) {
  return Object.freeze(inventory.memberships.flatMap(row => row.sourceFacts));
}
function hgoAuthorityPathDigest(repository, path) {
  const local = relative(repository.commonDir, path);
  if (local.startsWith("..") || isAbsolute(local)) hgoAuthorityFailure("hgo:planning-outside-common");
  return sha(local.replace(/\\/gu, "/"));
}
const hgoLegacyAuthorityOperations = new WeakMap();
export function isOwnedHumanGuardLegacyAuthorityOperation(handle, {primaryRoot, commonDir} = {}) {
  const data = handle && hgoLegacyAuthorityOperations.get(handle);
  if (!data || data.primaryRoot !== primaryRoot || data.commonDir !== commonDir) return false;
  try {
    const actual = controlPathTopology(data.primaryRoot);
    return actual.root === data.primaryRoot && actual.common === data.commonDir;
  } catch { return false; }
}
export function executeOwnedHumanGuardLegacyAuthorityOperation(handle) {
  const data = handle && hgoLegacyAuthorityOperations.get(handle);
  if (!data || data.executed || !isOwnedHumanGuardLegacyAuthorityOperation(handle, data)) hgoAuthorityFailure("hgo:legacy-operation-unowned");
  data.executed = true;
  return data.operation();
}
function hgoLegacyControlOperation(repo, operation) {
  // This is reached only from existing validated private source closures.
  // An absent catalogue is legacy custody, never a fabricated candidate/member.
  const actual = controlPathTopology(repo.root);
  if (actual.root !== repo.root || actual.common !== repo.common) hgoAuthorityFailure("hgo:legacy-control-changed");
  if (typeof sessionAuthorityRegistry.executeSourceOwnedLegacySessionAuthorityOperation !== "function") {
    hgoAuthorityFailure("hgo:legacy-registry-interface-unavailable");
  }
  const handle = Object.freeze({});
  const data = {primaryRoot: actual.root, commonDir: actual.common, operation, executed: false};
  hgoLegacyAuthorityOperations.set(handle, data);
  try {
    const observed = sessionAuthorityRegistry.executeSourceOwnedLegacySessionAuthorityOperation({
      primaryRoot: actual.root, commonDir: actual.common,
    }, handle);
    if (exactKeys(observed, ["status", "result"]) && observed.status === "legacy-completed" && data.executed) return observed;
    if (exactKeys(observed, ["status"]) && observed.status === "catalogue-present" && !data.executed) return observed;
    hgoAuthorityFailure("hgo:legacy-registry-result-shape");
  } finally { hgoLegacyAuthorityOperations.delete(handle); }
}
function hgoPlanningPublication({repo, paths, entry, intendedPath, additionalPaths = [], inputSha256}, publish) {
  const legacy = hgoLegacyControlOperation(repo, publish);
  if (legacy.status === "legacy-completed") return legacy.result;
  // This closure is created only at the existing, fully validated source writer.
  // No public callback constructor or supplied writer result can create a brand.
  const repository = hgoAuthorityRepository(inspectSignedDescriptorCustodyRepository(repo.root));
  return sessionAuthorityRegistry.withSessionAuthorityBoundary({repository}, boundary => {
    let cataloguePresent;
    try { lstatSync(join(repository.commonDir, "agent-pipeline", "session-authority", "catalogue.json")); cataloguePresent = true; }
    catch (error) { if (error.code !== "ENOENT") throw error; cataloguePresent = false; }
    if (!cataloguePresent) return publish(); // real legacy evidence remains unbound
    const port = hgoAuthorityPortByCommon.get(repository.commonDir)
      ?? createHumanGuardOverrideAuthorityProducerPort({repository});
    const before = hgoAuthorityInventory(repository), handle = Object.freeze({});
    const auditPaths = entry === "plan-override" ? [] : [paths.key, paths.audit, paths.auditHead];
    const allowedPaths = [intendedPath, ...additionalPaths, ...auditPaths];
    hgoAuthorityPlanning.set(handle, {port, repository, entry, inputSha256, publish, before,
      allowedPaths, executed: false, result: null, after: null});
    if (typeof sessionAuthorityRegistry.executeSourceOwnedSessionAuthorityPlanning !== "function") {
      hgoAuthorityFailure("hgo:planning-registry-interface-unavailable");
    }
    return sessionAuthorityRegistry.executeSourceOwnedSessionAuthorityPlanning({boundary, producerPort: port, planningHandle: handle});
  });
}
function hgoSweepSelection(repository, nowMs) {
  const before = hgoAuthorityInventory(repository), paths = before.paths;
  if (before.groups.get("locks").length) fail("HGO-SWEEP-HELD", "override locks require their original owning settlement");
  if (!before.groups.get("requests").length) return {before, eligible: []};
  const port = hgoAuthorityPortByCommon.get(repository.commonDir)
    ?? createHumanGuardOverrideAuthorityProducerPort({repository});
  hgoAuthorityValidatedInventory(port, before);
  const audit = requireValidAuditState(paths, key(paths));
  const referenced = new Set();
  for (const row of before.groups.get("audit")) {
    if (dirname(row.path) !== paths.authorityHolds) continue;
    const {record} = hgoAuthorityReadHold(repository, row.path);
    if (!Array.isArray(record.preimageRefs) || record.preimageRefs.length > 4096) fail("HGO-SWEEP-HELD", "retained authority preimage inventory is unavailable");
    for (const ref of record.preimageRefs) {
      if (!exactKeys(ref, ["path", "sha256", "size"]) || !SHA256.test(ref.sha256 ?? "")
        || !Number.isSafeInteger(ref.size) || ref.size < 0 || typeof ref.path !== "string"
        || !ref.path.startsWith(".git/agent-pipeline/human-guard-overrides/")
        || ref.path.includes("\\") || ref.path.split("/").some(part => !part || part === "." || part === "..")) {
        fail("HGO-SWEEP-HELD", "retained authority preimage is outside its original scope");
      }
      referenced.add(ref.path);
    }
  }
  const capabilities = before.groups.get("capabilities").map(row => {
    const value = validatedCapability(paths, row.path);
    if (!hasAuthorizedAuditEntry(paths, value)) fail("HGO-SWEEP-HELD", "capability has no authenticated original authorization");
    return value;
  });
  const eligible = [];
  for (const row of before.groups.get("requests")) {
    const digest = basename(row.path).slice(0, -5);
    const request = validatedRequest(paths, digest, JSON.parse(row.bytes.toString("utf8")));
    const expiry = Date.parse(request.expiresAt);
    if (request.root !== repository.primaryRoot || !Number.isFinite(expiry)
        || new Date(expiry).toISOString() !== request.expiresAt) fail("HGO-SWEEP-REQUEST", "request root or canonical expiry is invalid");
    const matching = capabilities.filter(value => value.requestSha256 === digest);
    if (referenced.has(row.ref.path) || matching.some(value => value.status === "armed")) continue;
    const consumed = matching.length > 0 && matching.every(value => value.status === "consumed"
      && audit.ledger.entries.some(({event}) => event.type === "consumed"
        && event.requestSha256 === digest && event.planSha256 === value.planSha256 && event.at === value.consumedAt));
    if (expiry <= nowMs || consumed) eligible.push(row);
  }
  return {before, eligible};
}
function hgoSweepPhysicalUnlink(repository, row) {
  const observed = hgoAuthorityPhysical(repository, row.path, "requests"), original = safePrivateFile(row.path);
  if (canonical(observed.ref) !== canonical(row.ref) || canonical(observed.fact) !== canonical(row.fact)) fail("HGO-SWEEP-CAS", "request physical preimage changed");
  const parent = dirname(row.path), parentInfo = lstatSync(parent);
  hgoAuthorityDirectory(parent);
  const quarantineDirectory = mkdtempSync(join(parent, ".sweep-"));
  const createdDirectory = lstatSync(quarantineDirectory);
  let ownedDirectory = createdDirectory;
  let quarantine = join(quarantineDirectory, "request.json"), moved = false, removed = false;
  try {
    secureDirectory(quarantineDirectory);
    const securedDirectory = lstatSync(quarantineDirectory);
    for (const field of ["dev", "ino", "uid", "gid"]) if (securedDirectory[field] !== createdDirectory[field]) fail("HGO-SWEEP-CAS", "created quarantine directory changed");
    ownedDirectory = securedDirectory;
    if (!ownedDirectory.isDirectory() || ownedDirectory.isSymbolicLink() || realpathSync(quarantineDirectory) !== quarantineDirectory
        || ownedDirectory.uid !== original.uid || ownedDirectory.gid !== parentInfo.gid) fail("HGO-SWEEP-CAS", "quarantine custody is not the original owner");
    hgoAuthorityDirectory(parent);
    const currentParent = lstatSync(parent);
    for (const field of ["dev", "ino", "mode", "uid", "gid"]) if (currentParent[field] !== parentInfo[field]) fail("HGO-SWEEP-CAS", "original request namespace changed");
    const current = hgoAuthorityPhysical(repository, row.path, "requests"), named = safePrivateFile(row.path);
    for (const field of ["dev", "ino", "mode", "uid", "gid", "nlink", "size"]) if (named[field] !== original[field]) fail("HGO-SWEEP-CAS", "request changed before quarantine");
    if (canonical(current.ref) !== canonical(row.ref) || canonical(current.fact) !== canonical(row.fact)) fail("HGO-SWEEP-CAS", "request changed before quarantine");
    renameSync(row.path, quarantine); moved = true;
    const movedRow = hgoAuthorityPhysical(repository, quarantine, "requests"), movedInfo = safePrivateFile(quarantine);
    for (const field of ["dev", "ino", "mode", "uid", "gid", "nlink", "size"]) if (movedInfo[field] !== original[field]) fail("HGO-SWEEP-CAS", "quarantined request is not the original inode");
    if (movedRow.ref.sha256 !== row.ref.sha256 || movedRow.ref.size !== row.ref.size) fail("HGO-SWEEP-CAS", "quarantined request bytes changed");
    const finalDirectory = lstatSync(quarantineDirectory), finalInfo = safePrivateFile(quarantine);
    hgoAuthorityDirectory(parent);
    const finalParent = lstatSync(parent);
    for (const field of ["dev", "ino", "mode", "uid", "gid"]) if (finalParent[field] !== parentInfo[field]) fail("HGO-SWEEP-CAS", "original request namespace changed before removal");
    for (const field of ["dev", "ino", "mode", "uid", "gid"]) if (finalDirectory[field] !== ownedDirectory[field]) fail("HGO-SWEEP-CAS", "quarantine directory changed");
    for (const field of ["dev", "ino", "mode", "uid", "gid", "nlink", "size"]) if (finalInfo[field] !== original[field]) fail("HGO-SWEEP-CAS", "quarantined request changed before removal");
    if (hgoAuthorityPhysical(repository, quarantine, "requests").ref.sha256 !== row.ref.sha256) fail("HGO-SWEEP-CAS", "quarantined request content changed before removal");
    unlinkSync(quarantine); removed = true;
  } finally {
    const retainedDirectory = lstatSync(quarantineDirectory);
    if (!retainedDirectory.isDirectory() || retainedDirectory.isSymbolicLink() || realpathSync(quarantineDirectory) !== quarantineDirectory) fail("HGO-SWEEP-CAS", "quarantine cleanup path changed");
    for (const field of ["dev", "ino", "mode", "uid", "gid"]) if (retainedDirectory[field] !== ownedDirectory[field]) fail("HGO-SWEEP-CAS", "quarantine cleanup ownership changed");
    if (moved && !removed) {
      // Best-effort same-inode restoration only; never overwrite a replacement
      // or report a rollback when an interrupted prefix remains held.
      try {
        const held = safePrivateFile(quarantine);
        if (!existsSync(row.path) && held.dev === original.dev && held.ino === original.ino
            && held.mode === original.mode && held.uid === original.uid && held.gid === original.gid
            && held.nlink === original.nlink && held.size === original.size
            && hgoAuthorityPhysical(repository, quarantine, "requests").ref.sha256 === row.ref.sha256) {
          linkSync(quarantine, row.path); unlinkSync(quarantine);
        }
      } catch {}
    }
    rmdirSync(quarantineDirectory); // Empty own directory only; unexpected content is retained.
  }
}
function hgoSweepRequestsCore(rootDir) {
  const repo = topology(rootDir), repository = hgoAuthorityRepository(inspectSignedDescriptorCustodyRepository(repo.root));
  const nowMs = Date.now(), {before, eligible} = hgoSweepSelection(repository, nowMs);
  const originalCount = before.groups.get("requests").length;
  if (!eligible.length) return Object.freeze({status: "absent", removed: 0, retained: originalCount, remainingEligible: 0});
  const selected = eligible.slice(0, 61), removedPaths = new Set(), paths = before.paths;
  const inputSha256 = sha({entry: "sweep-requests", nowMs, refs: selected.map(row => row.ref), before: before.memberships});
  return hgoPlanningPublication({repo, paths, entry: "sweep-requests", intendedPath: selected[0].path,
    additionalPaths: selected.slice(1).map(row => row.path), inputSha256}, () => {
    for (const row of selected) {
      const current = hgoAuthorityInventory(repository);
      for (const [namespace, rows] of before.groups) {
        const expected = rows.filter(item => !removedPaths.has(item.path)).map(item => item.fact);
        if (canonical(current.groups.get(namespace).map(item => item.fact)) !== canonical(expected)) fail("HGO-SWEEP-CAS", "source inventory changed before request removal");
      }
      hgoSweepPhysicalUnlink(repository, row); removedPaths.add(row.path);
    }
    const current = hgoAuthorityInventory(repository);
    for (const [namespace, rows] of before.groups) {
      if (canonical(current.groups.get(namespace).map(item => item.fact)) !== canonical(rows.filter(item => !removedPaths.has(item.path)).map(item => item.fact))) fail("HGO-SWEEP-CAS", "request cleanup changed unowned source inventory");
    }
    appendAudit(paths, {type: "requests-swept", at: new Date(nowMs).toISOString(),
      requests: selected.map(row => ({requestSha256: basename(row.path).slice(0, -5), sourceSha256: row.ref.sha256, size: row.ref.size}))});
    requireValidAuditState(paths, key(paths));
    return Object.freeze({status: "swept", removed: selected.length, retained: originalCount - selected.length, remainingEligible: eligible.length - selected.length});
  });
}
export function sweepHumanGuardOverrideRequests({rootDir} = {}) {
  try { return hgoSweepRequestsCore(rootDir); }
  catch (error) {
    if (error instanceof HumanGuardOverrideError) throw error;
    fail("HGO-SWEEP-CAS", "request cleanup did not complete; retain original ownership evidence");
  }
}

function hgoAuthorityDirectory(path) {
  const info = lstatSync(path);
  if (!info.isDirectory() || info.isSymbolicLink() || realpathSync(path) !== path
      || (typeof process.getuid === "function" && info.uid !== process.getuid())) {
    hgoAuthorityFailure("hgo:unsafe-namespace");
  }
  if (process.platform === "win32") {
    if (assessWindowsPrivatePath(path).status !== "secure") hgoAuthorityFailure("hgo:namespace-dacl");
  } else if ((info.mode & 0o077) !== 0) hgoAuthorityFailure("hgo:namespace-permissions");
}
function hgoAuthorityScopePresent(repository, path) {
  const local = relative(repository.commonDir, path);
  if (local.startsWith("..") || isAbsolute(local)) hgoAuthorityFailure("hgo:scope-outside-common");
  let current = repository.commonDir;
  for (const part of local.split(/[\\/]/u)) {
    current = join(current, part);
    try { lstatSync(current); }
    catch (error) { if (error.code === "ENOENT") return false; throw error; }
    hgoAuthorityDirectory(current);
  }
  return true;
}
function hgoAuthorityPhysical(repository, path, namespaceId) {
  const local = relative(repository.commonDir, path);
  if (local.startsWith("..") || isAbsolute(local)) hgoAuthorityFailure("hgo:outside-common-directory");
  let cursor = repository.commonDir;
  for (const part of local.split(/[\\/]/u)) {
    cursor = join(cursor, part);
    if (lstatSync(cursor).isSymbolicLink()) hgoAuthorityFailure("hgo:symlink-component");
  }
  const before = safePrivateFile(path);
  if (before.size > 1048576 || (typeof process.getuid === "function" && before.uid !== process.getuid())) {
    hgoAuthorityFailure("hgo:source-bound-or-owner");
  }
  let bytes, after;
  const fd = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const opened = fstatSync(fd);
    if (opened.dev !== before.dev || opened.ino !== before.ino || opened.mode !== before.mode
        || opened.nlink !== 1 || opened.size !== before.size) hgoAuthorityFailure("hgo:opened-source-identity");
    const first = Buffer.alloc(before.size + 1), second = Buffer.alloc(before.size + 1);
    const firstCount = readSync(fd, first, 0, first.length, 0), secondCount = readSync(fd, second, 0, second.length, 0);
    bytes = first.subarray(0, firstCount); after = safePrivateFile(path);
    const final = fstatSync(fd);
    if (firstCount !== before.size || secondCount !== before.size || sha(bytes) !== sha(second.subarray(0, secondCount))
        || before.dev !== after.dev || before.ino !== after.ino || before.mode !== after.mode || before.size !== after.size
        || final.dev !== before.dev || final.ino !== before.ino || final.mode !== before.mode || final.nlink !== 1 || final.size !== before.size) {
      hgoAuthorityFailure("hgo:physical-source-drift");
    }
  } finally { closeSync(fd); }
  const fact = Object.freeze({
    namespaceId, pathSha256: sha(local.replace(/\\/gu, "/")), sha256: sha(bytes), size: bytes.length,
    identity: Object.freeze({dev: String(after.dev), ino: String(after.ino), mode: after.mode, nlink: after.nlink}),
    semanticSha256: sha(bytes),
  });
  return {path, bytes, fact, ref: Object.freeze({path: `.git/${local.replace(/\\/gu, "/")}`, sha256: sha(bytes), size: bytes.length})};
}
function hgoAuthorityInventory(repository) {
  const paths = hgoAuthorityPaths(repository), groups = new Map(HGO_AUTHORITY_NAMESPACES.map(id => [id, []]));
  let count = 0, total = 0;
  function file(path, namespaceId) {
    const observed = hgoAuthorityPhysical(repository, path, namespaceId);
    if (++count > 4096 || (total += observed.bytes.length) > 16777216) hgoAuthorityFailure("hgo:inventory-bound");
    groups.get(namespaceId).push(observed);
  }
  function directory(path, namespaceId, depth = 0) {
    if (depth > 6) hgoAuthorityFailure("hgo:namespace-depth");
    hgoAuthorityDirectory(path);
    for (const name of readdirSync(path).sort()) {
      const entry = join(path, name), info = lstatSync(entry);
      if (info.isDirectory()) hgoAuthorityFailure("hgo:unknown-nested-namespace");
      else file(entry, namespaceId);
    }
  }
  if (hgoAuthorityScopePresent(repository, paths.base)) {
    hgoAuthorityDirectory(paths.base);
    for (const name of readdirSync(paths.base).sort()) {
      if (["requests", "plans", "capabilities", "briefed-authorizations", "locks"].includes(name)) {
        directory(join(paths.base, name), name);
      } else if (name === "authority-holds") {
        directory(join(paths.base, name), "audit");
      } else if (["audit.key", "audit.jsonl", "audit.head.json"].includes(name)) {
        file(join(paths.base, name), "audit");
      } else if (name === "command-offers.jsonl") {
        file(join(paths.base, name), "command-offers");
      } else if (name.startsWith("audit.lock") || name.endsWith(".tmp")) {
        file(join(paths.base, name), "locks");
      } else hgoAuthorityFailure("hgo:unknown-private-entry");
    }
  }
  const memberships = HGO_AUTHORITY_NAMESPACES.map(namespaceId => {
    const entries = groups.get(namespaceId), sourceFacts = entries.map(entry => entry.fact);
    const physical = namespaceId === "briefed-authorizations" ? paths.briefedAuthorizations
      : namespaceId === "audit" || namespaceId === "command-offers" ? paths.base : paths[namespaceId];
    return Object.freeze({namespaceId, rootSha256: sha({commonDir: repository.commonDir, path: physical}),
      entrySetSha256: sha(sourceFacts), entryCount: entries.length, sourceFacts: Object.freeze(sourceFacts)});
  });
  if (groups.get("audit").length > 0) {
    const state = auditState(paths, key(paths));
    if (state.status !== "valid") hgoAuthorityFailure("hgo:authenticated-audit-unavailable");
  }
  return {paths, groups, memberships: Object.freeze(memberships)};
}
function hgoAuthorityLegacyOperation(port, observed, capability) {
  const handle = Object.freeze({}), data = hgoAuthorityPorts.get(port);
  const association = Object.freeze({state: "unbound", target: null});
  hgoAuthorityOperations.set(handle, {port, repository: data.repository, association,
    entry: "legacy-authenticated-capability", path: observed.path, planSha256: capability.planSha256,
    bindingSha256: sha({repository: data.repository, association, capabilitySha256: observed.ref.sha256}),
    phase: "armed", sourceFacts: Object.freeze([observed.fact])});
  return handle;
}
function hgoAuthorityReference(repository, reference, namespaceId = "audit") {
  if (!exactKeys(reference, ["path", "sha256", "size"]) || !SHA256.test(reference.sha256)
      || !Number.isSafeInteger(reference.size) || reference.size < 0
      || typeof reference.path !== "string" || !reference.path.startsWith(".git/")
      || reference.path.includes("\\") || reference.path.split("/").some(part => part === ".." || part === "." || !part)) {
    hgoAuthorityFailure("hgo:source-reference-shape");
  }
  const actual = hgoAuthorityPhysical(repository, join(repository.commonDir, reference.path.slice(5)), namespaceId);
  if (canonical(actual.ref) !== canonical(reference)) hgoAuthorityFailure("hgo:source-reference-cas");
  return actual;
}
function hgoAuthorityAssociation(repository, requesterHandle) {
  const context = readSourceOwnedAuthorityContext({repository});
  if (context.status !== "bound" || context.requesterHandle !== requesterHandle) hgoAuthorityFailure("hgo:originating-source-context");
  const actual = createSignedCleanupRequesterObserver({repository, requesterHandle})({repository});
  if (actual.status !== "bound") hgoAuthorityFailure("hgo:requester-observation-unavailable");
  const {sessionId, descriptorSha256, ownerNonceSha256} = actual.requester;
  return Object.freeze({state: "bound", target: Object.freeze({sessionId, descriptorSha256, ownerNonceSha256})});
}
function hgoAuthorityOperation(port, handle) {
  const data = hgoAuthorityOperations.get(handle);
  if (!data || data.port !== port) hgoAuthorityFailure("hgo:unowned-operation");
  hgoAuthorityRepository(data.repository);
  return data;
}
function hgoAuthorityNoLocks(repository, planSha256 = null) {
  const inventory = hgoAuthorityInventory(repository);
  if (inventory.groups.get("locks").length) hgoAuthorityFailure("hgo:retained-producer-lock");
  // Inventory includes every lock, not just a PID or the current plan's file.
  return inventory;
}
function hgoAuthorityHoldCore(data) {
  return {schema: "pipeline.hgo-session-authority-hold.v1", repository: data.repository,
    association: data.association, entry: data.entry, input: data.input, inputSha256: data.inputSha256,
    bindingSha256: data.bindingSha256, memberRef: data.memberRef, preimageRefs: data.preimageRefs,
    authorizationPath: relative(data.repository.commonDir, data.authorizationPath).replace(/\\/gu, "/")};
}
function hgoAuthorityWriteHold(data) {
  const paths = hgoAuthorityPaths(data.repository), core = hgoAuthorityHoldCore(data);
  const record = {...core, mac: capabilityMac(key(paths), core)};
  secureDirectory(paths.authorityHolds);
  const path = join(paths.authorityHolds, `${data.bindingSha256}.json`);
  writeExclusive(path, Buffer.from(`${JSON.stringify(record)}\n`, "utf8"));
  data.holdPath = path;
}
function hgoAuthorityReadHold(repository, path) {
  const observed = hgoAuthorityPhysical(repository, path, "audit"), record = JSON.parse(observed.bytes.toString("utf8"));
  if (!exactKeys(record, ["schema", "repository", "association", "entry", "input", "inputSha256", "bindingSha256",
    "memberRef", "preimageRefs", "authorizationPath", "mac"]) || record.schema !== "pipeline.hgo-session-authority-hold.v1") {
    hgoAuthorityFailure("hgo:hold-schema");
  }
  const {mac: actualMac, ...core} = record;
  if (actualMac !== capabilityMac(key(hgoAuthorityPaths(repository)), core) || canonical(record.repository) !== canonical(repository)
      || !SHA256.test(record.bindingSha256) || basename(path) !== `${record.bindingSha256}.json`
      || typeof record.authorizationPath !== "string" || record.authorizationPath.includes("\\")
      || record.authorizationPath.split("/").some(part => !part || part === ".." || part === ".")) {
    hgoAuthorityFailure("hgo:hold-authentication");
  }
  const allowed = ["authorize-signature", "authorize-chat"].includes(record.entry) ? "agent-pipeline/human-guard-overrides/capabilities/"
    : record.entry === "authorize-briefed" ? "agent-pipeline/human-guard-overrides/briefed-authorizations/" : null;
  if (!allowed || !record.authorizationPath.startsWith(allowed)) hgoAuthorityFailure("hgo:hold-authorization-scope");
  return {record, observed};
}
function hgoAuthorityBriefed(repository, path) {
  const record = JSON.parse(hgoAuthorityPhysical(repository, path, "briefed-authorizations").bytes.toString("utf8"));
  if (!exactKeys(record, ["schema", "kind", "id", "targetPath", "briefingDigest", "expiry", "expiresAtMs", "grantedAt", "mode", "reason", "signer", "proof"])
      || record.schema !== BRIEFED_TEST_AUTHORIZATION_SCHEMA || record.kind !== BRIEFED_TEST_CHANGE_KIND
      || record.id !== briefedAuthorizationId(record.targetPath, record.briefingDigest)
      || canonicalBriefedTarget(repository.primaryRoot, record.targetPath) !== record.targetPath
      || !SHA256.test(record.briefingDigest) || !Number.isFinite(record.expiresAtMs)
      || record.expiry !== new Date(record.expiresAtMs).toISOString()) hgoAuthorityFailure("hgo:briefed-schema");
  if (record.mode === "signature") {
    const signer = recognizedBriefedSigner(repository.primaryRoot, record.proof);
    if (!signer || canonical(signer) !== canonical(record.signer)
        || !verifyPoApprovalProof({intent: briefedTestIntent(record.targetPath, record.briefingDigest, record.expiresAtMs),
          trustPolicy: signer, proof: record.proof}).verified) hgoAuthorityFailure("hgo:briefed-proof");
  } else if (record.mode !== "chat" || record.proof !== null || record.signer !== null) hgoAuthorityFailure("hgo:briefed-mode");
  // Expiry never discharges retained authority in this owner inventory.
  return record;
}
function hgoAuthorityPrepare(port, requesterHandle, entry, input) {
  const {repository} = hgoAuthorityPorts.get(port), paths = hgoAuthorityPaths(repository);
  const association = hgoAuthorityAssociation(repository, requesterHandle);
  const fields = entry === "authorize-signature"
    ? ["pluginRoot", "requestSha256", "planSha256", "proofRef", "scriptPath", "authorSourceRoot"]
    : entry === "authorize-briefed" ? ["targetPath", "briefingDigest", "expiry", "mode", "reason", "proofRef"] : null;
  if (!fields || !exactKeys(input, fields)) hgoAuthorityFailure("hgo:operation-entry-input");
  const ownedInput = JSON.parse(canonical(input));
  const proofObservation = hgoAuthorityReference(repository, ownedInput.proofRef);
  const proof = JSON.parse(proofObservation.bytes.toString("utf8")), preimages = [proofObservation];
  let authorizationPath;
  if (entry === "authorize-signature") {
    if (!SHA256.test(ownedInput.requestSha256) || !SHA256.test(ownedInput.planSha256)
        || !isAbsolute(ownedInput.pluginRoot) || !isAbsolute(ownedInput.scriptPath)
        || !(ownedInput.authorSourceRoot === null || isAbsolute(ownedInput.authorSourceRoot))) hgoAuthorityFailure("hgo:signature-intent-input");
    const planFile = planPath(paths, ownedInput.requestSha256, ownedInput.authorSourceRoot);
    const planned = validatedPlan(planFile), request = validatedRequest(paths, ownedInput.requestSha256);
    if (planned.planSha256 !== ownedInput.planSha256 || request.root !== repository.primaryRoot) hgoAuthorityFailure("hgo:planned-source-binding");
    preimages.push(hgoAuthorityPhysical(repository, requestPath(paths, ownedInput.requestSha256), "requests"),
      hgoAuthorityPhysical(repository, planFile, "plans"));
    const prepared = prepareHumanGuardOverrideAuthorization({rootDir: repository.primaryRoot, ...ownedInput,
      reason: HGO_SIGNATURE_REASON});
    const intent = buildHumanGuardOverrideSignatureIntent({prepared, planned});
    const policy = readCriticalHumanProofPolicy(repository.primaryRoot);
    const anchors = policy.trustAnchor !== null ? [policy.trustAnchor] : policy.trustAnchors;
    if (!policy.ok || !Array.isArray(anchors) || !anchors.some(anchor => anchor?.publicKeySha256 === sha(proof.publicKey ?? ""))
        || !verifyAgainstTrustAnchors({intent, anchors, proof}).verified) hgoAuthorityFailure("hgo:actual-signature-policy");
    authorizationPath = join(paths.capabilities, `${ownedInput.planSha256}.json`);
  } else {
    if (ownedInput.mode !== "signature" || typeof ownedInput.reason !== "string") hgoAuthorityFailure("hgo:briefed-operation-mode");
    const intent = buildBriefedTestChangeAuthorizationIntent({rootDir: repository.primaryRoot, ...ownedInput});
    const signer = recognizedBriefedSigner(repository.primaryRoot, proof);
    if (!signer || !verifyPoApprovalProof({intent, trustPolicy: signer, proof}).verified) hgoAuthorityFailure("hgo:actual-briefed-proof");
    const target = canonicalBriefedTarget(repository.primaryRoot, ownedInput.targetPath);
    authorizationPath = join(paths.briefedAuthorizations, `${briefedAuthorizationId(target, ownedInput.briefingDigest)}.json`);
  }
  if (existsSync(authorizationPath)) hgoAuthorityFailure("hgo:authorization-already-retained");
  const preimageRefs = Object.freeze(preimages.map(row => row.ref)), inputSha256 = sha(ownedInput);
  const bindingSha256 = sha({repository, association, entry, inputSha256, preimageRefs});
  const handle = Object.freeze({});
  hgoAuthorityOperations.set(handle, {port, repository, association, entry, input: ownedInput, proof,
    inputSha256, bindingSha256, preimageRefs, preimageFacts: Object.freeze(preimages.map(row => row.fact)), authorizationPath,
    phase: "reserved", memberHandle: null, memberRef: null, holdPath: null});
  return {status: "prepared", operationHandle: handle, inputSha256, preimageRefs};
}
function hgoAuthorityObserved(data) {
  const kinds = ["override", "armed-capability"];
  let sourceFacts;
  if (data.phase === "reserved") {
    sourceFacts = data.preimageRefs.map((reference, index) => hgoAuthorityReference(data.repository, reference, data.preimageFacts[index].namespaceId).fact);
    if (existsSync(data.authorizationPath)) hgoAuthorityFailure("hgo:unindexed-arming-effect");
  } else {
    const hold = hgoAuthorityReadHold(data.repository, data.holdPath);
    if (hold.record.bindingSha256 !== data.bindingSha256 || canonical(hold.record.association) !== canonical(data.association)) hgoAuthorityFailure("hgo:operation-hold-binding");
    let path = data.authorizationPath;
    if (data.entry === "authorize-briefed") {
      if (!existsSync(path)) path = path.replace(/\.json$/u, ".revoked.json");
      const record = hgoAuthorityBriefed(data.repository, path), paths = hgoAuthorityPaths(data.repository);
      const audit = auditState(paths, key(paths));
      const revoked = path.endsWith(".revoked.json");
      const type = revoked ? "briefed-revoked" : "briefed-authorized";
      if (audit.status !== "valid" || !audit.ledger.entries.some(row => row.event.type === type
          && row.event.authorizationId === record.id && row.event.bindingSha256 === data.bindingSha256)) hgoAuthorityFailure("hgo:briefed-owning-audit");
      data.phase = revoked ? "terminal-observed" : "armed";
    } else {
      const paths = hgoAuthorityPaths(data.repository), capability = validatedCapability(paths, path);
      if (!hasAuthorizedAuditEntry(paths, capability) || capability.planSha256 !== data.input.planSha256) hgoAuthorityFailure("hgo:capability-owning-binding");
      if (capability.status === "consumed") {
        const audit = auditState(paths, key(paths));
        if (audit.status !== "valid" || !audit.ledger.entries.some(row => row.event.type === "consumed" && row.event.planSha256 === capability.planSha256)) hgoAuthorityFailure("hgo:consume-owning-audit");
        data.phase = "terminal-observed";
      } else if (capability.status === "armed") data.phase = "armed";
      else hgoAuthorityFailure("hgo:unknown-owning-terminal");
    }
    sourceFacts = [hgoAuthorityPhysical(data.repository, path, data.entry === "authorize-briefed" ? "briefed-authorizations" : "capabilities").fact, hold.observed.fact];
    if (data.phase === "terminal-observed") hgoAuthorityNoLocks(data.repository);
  }
  return {association: data.association, kinds, phase: data.phase, bindingSha256: data.bindingSha256, sourceFacts};
}
function hgoAuthorityIndexedData(port, holdPath) {
  const {repository} = hgoAuthorityPorts.get(port), {record} = hgoAuthorityReadHold(repository, holdPath);
  if (record.inputSha256 !== sha(record.input)
      || record.bindingSha256 !== sha({repository, association: record.association, entry: record.entry,
        inputSha256: record.inputSha256, preimageRefs: record.preimageRefs})) hgoAuthorityFailure("hgo:hold-binding-digest");
  if (!exactKeys(record.memberRef, ["path", "sha256", "size"]) || typeof record.memberRef.path !== "string"
      || !record.memberRef.path.startsWith(".git/agent-pipeline/session-authority/")
      || record.memberRef.path.includes("\\") || record.memberRef.path.split("/").some(part => !part || part === ".." || part === ".")) {
    hgoAuthorityFailure("hgo:indexed-member-reference");
  }
  const originalMember = hgoAuthorityPhysical(repository, join(repository.commonDir, record.memberRef.path.slice(5)), "audit");
  const member = JSON.parse(originalMember.bytes.toString("utf8"));
  if (member.producerId !== "human-guard-override" || member.bindingSha256 !== record.bindingSha256
      || canonical(member.association) !== canonical(record.association)) hgoAuthorityFailure("hgo:indexed-member-binding");
  return {port, repository, association: record.association, entry: record.entry, input: record.input,
    inputSha256: record.inputSha256, bindingSha256: record.bindingSha256, preimageRefs: record.preimageRefs,
    authorizationPath: join(repository.commonDir, record.authorizationPath), phase: "armed", holdPath,
    memberRef: originalMember.ref, memberHandle: null};
}
function hgoAuthorityValidatedInventory(port, inventory) {
  const {repository} = hgoAuthorityPorts.get(port), indexed = new Map();
  for (const observed of inventory.groups.get("audit")) {
    if (dirname(observed.path) !== inventory.paths.authorityHolds) continue;
    if (!/^[a-f0-9]{64}\.json$/u.test(basename(observed.path))) hgoAuthorityFailure("hgo:unknown-hold-index");
    const data = hgoAuthorityIndexedData(port, observed.path);
    if (indexed.has(data.authorizationPath)) hgoAuthorityFailure("hgo:duplicate-authorization-owner");
    hgoAuthorityObserved(data); indexed.set(data.authorizationPath, data);
  }
  for (const row of inventory.groups.get("requests")) {
    if (!/^[a-f0-9]{64}\.json$/u.test(basename(row.path))) hgoAuthorityFailure("hgo:unknown-request");
    validatedRequest(inventory.paths, basename(row.path).slice(0, -5));
  }
  for (const row of inventory.groups.get("plans")) {
    if (basename(row.path).endsWith(".disclosure.json")) {
      const index = validatedDisclosureIndex(row.path);
      if (index.root !== hgoAuthorityPorts.get(port).repository.primaryRoot) hgoAuthorityFailure("hgo:disclosure-index-root");
      continue;
    }
    const planned = validatedPlan(row.path);
    if (row.path !== planPath(inventory.paths, planned.requestSha256, planned.authorSourceRoot)) hgoAuthorityFailure("hgo:unknown-plan-path");
  }
  const legacyOperations = [];
  for (const observed of inventory.groups.get("capabilities")) {
    if (!/^[a-f0-9]{64}\.json$/u.test(basename(observed.path))) hgoAuthorityFailure("hgo:unknown-capability");
    const capability = validatedCapability(inventory.paths, observed.path);
    if (!hasAuthorizedAuditEntry(inventory.paths, capability)) hgoAuthorityFailure("hgo:capability-audit-unavailable");
    const data = indexed.get(observed.path);
    if (capability.status === "armed") {
      if (data) { const handle = Object.freeze({}); hgoAuthorityOperations.set(handle, data); legacyOperations.push(handle); }
      else legacyOperations.push(hgoAuthorityLegacyOperation(port, observed, capability));
    }
  }
  for (const observed of inventory.groups.get("briefed-authorizations")) {
    const record = hgoAuthorityBriefed(repository, observed.path), data = indexed.get(observed.path.replace(/\.revoked\.json$/u, ".json"));
    if (!data) hgoAuthorityFailure("hgo:unbound-briefed-authority-held");
    if (basename(observed.path) !== `${record.id}.json` && basename(observed.path) !== `${record.id}.revoked.json`) hgoAuthorityFailure("hgo:unknown-briefed-path");
    if (data.phase === "armed") { const handle = Object.freeze({}); hgoAuthorityOperations.set(handle, data); legacyOperations.push(handle); }
  }
  if (inventory.groups.get("locks").length) hgoAuthorityFailure("hgo:producer-lock-held");
  return {indexed, legacyOperations};
}
function hgoAuthorityCurrentReservedPublication(port, member) {
  const cursor = hgoAuthorityDirectReservation.getStore();
  if (!cursor || cursor.lifetime.active !== true) return null;
  const data = cursor.data;
  if (cursor.port !== port || data.port !== port
      || hgoAuthorityOperations.get(cursor.operationHandle) !== data
      || data.phase !== "reserved" || data.memberHandle !== null
      || data.memberRef !== null || data.holdPath !== null
      || member.phase !== "reserved" || member.releaseRef !== null
      || member.bindingSha256 !== data.bindingSha256
      || canonical(member.association) !== canonical(data.association)
      || canonical(member.kinds) !== canonical(["override", "armed-capability"])) return null;
  const repository = hgoAuthorityRepository(data.repository);
  if (canonical(cursor.repository) !== canonical(repository)
      || canonical(hgoAuthorityPorts.get(port)?.repository) !== canonical(repository)) return null;
  const sameBoundary = sessionAuthorityRegistry.withSessionAuthorityBoundary({repository},
    actualBoundary => actualBoundary === cursor.boundary);
  if (!sameBoundary) return null;
  const context = readSourceOwnedAuthorityContext({repository});
  if (context.status !== "bound") hgoAuthorityFailure("hgo:originating-source-context");
  const association = hgoAuthorityAssociation(repository, context.requesterHandle);
  if (canonical(association) !== canonical(data.association)
      || data.inputSha256 !== sha(data.input)
      || data.bindingSha256 !== sha({repository, association: data.association,
        entry: data.entry, inputSha256: data.inputSha256, preimageRefs: data.preimageRefs})) {
    hgoAuthorityFailure("hgo:reserved-publication-binding");
  }
  // Existing observation reopens each exact preimage and rejects arming effects.
  const observed = hgoAuthorityObserved(data);
  if (canonical(observed) !== canonical({association: member.association,
      kinds: member.kinds, phase: member.phase, bindingSha256: member.bindingSha256,
      sourceFacts: member.sourceFacts})) hgoAuthorityFailure("hgo:reserved-publication-source-drift");
  return data;
}
function hgoAuthorityDirectPublication({repository, entry, input, authorizationPath, preimages}, publish, boundary) {
  const context = readSourceOwnedAuthorityContext({repository});
  if (context.status !== "bound") return publish();
  const port = hgoAuthorityPortByCommon.get(repository.commonDir) ?? createHumanGuardOverrideAuthorityProducerPort({repository});
  const association = hgoAuthorityAssociation(repository, context.requesterHandle), inputSha256 = sha(input);
  const preimageRefs = Object.freeze(preimages.map(row => row.ref)), operationHandle = Object.freeze({});
  const data = {port, repository, association, entry, input, inputSha256, preimageRefs,
    preimageFacts: preimages.map(row => row.fact), authorizationPath,
    bindingSha256: sha({repository, association, entry, inputSha256, preimageRefs}),
    phase: "reserved", memberHandle: null, memberRef: null, holdPath: null};
  hgoAuthorityOperations.set(operationHandle, data);
  const lifetime = {active: true};
  const cursor = Object.freeze({port, repository, boundary, operationHandle, data, lifetime});
  try {
    return hgoAuthorityDirectReservation.run(cursor, () => {
      const reserved = sessionAuthorityRegistry.reserveSessionAuthorityMember({boundary, producerPort: port,
        association, operationHandle});
      data.memberHandle = reserved.memberHandle; data.memberRef = reserved.memberRef;
      const result = publish();
      if (entry === "authorize-briefed") {
        const record = hgoAuthorityBriefed(repository, authorizationPath), paths = hgoAuthorityPaths(repository);
        appendAudit(paths, {type: "briefed-authorized", at: new Date().toISOString(), authorizationId: record.id,
          bindingSha256: data.bindingSha256, authorizationSha256: sha(readFileSync(authorizationPath))});
      }
      hgoAuthorityWriteHold(data); data.phase = "armed";
      hgoAuthorityObserved(data);
      const advanced = sessionAuthorityRegistry.advanceSessionAuthorityMember({boundary, producerPort: port,
        memberHandle: data.memberHandle, expectedMemberRef: data.memberRef, operationHandle});
      data.memberRef = advanced.memberRef;
      return result;
    });
  } finally {
    // Also revokes any captured asynchronous ALS continuation after return/throw.
    lifetime.active = false;
  }
}
function hgoPublishAuthorizedAuthority({repo, paths, capabilityCore, pluginRoot}, publish) {
  const legacy = hgoLegacyControlOperation(repo, publish);
  if (legacy.status === "legacy-completed") return legacy.result;
  const active = hgoAuthorityExecuting.getStore();
  const repository = inspectSignedDescriptorCustodyRepository(repo.root);
  return sessionAuthorityRegistry.withSessionAuthorityBoundary({repository}, boundary => {
    if (active) {
      if (active.entry !== "authorize-signature" || canonical(active.repository) !== canonical(repository)
          || active.input.planSha256 !== capabilityCore.planSha256 || !active.memberHandle) hgoAuthorityFailure("hgo:publication-reservation-binding");
      const result = publish();
      hgoAuthorityWriteHold(active); active.phase = "armed";
      return result;
    }
    const entry = capabilityCore.humanApproval.mode === "signature-verified" ? "authorize-signature" : "authorize-chat";
    const input = {pluginRoot, requestSha256: capabilityCore.requestSha256, planSha256: capabilityCore.planSha256,
      authorSourceRoot: capabilityCore.authorSourceRoot, mode: capabilityCore.humanApproval.mode};
    const preimages = [hgoAuthorityPhysical(repository, requestPath(paths, input.requestSha256), "requests"),
      hgoAuthorityPhysical(repository, planPath(paths, input.requestSha256, input.authorSourceRoot), "plans")];
    return hgoAuthorityDirectPublication({repository, entry, input,
      authorizationPath: join(paths.capabilities, `${input.planSha256}.json`), preimages}, publish, boundary);
  });
}
function hgoPublishBriefedAuthority({repo, paths, record}, publish) {
  const legacy = hgoLegacyControlOperation(repo, publish);
  if (legacy.status === "legacy-completed") return legacy.result;
  const active = hgoAuthorityExecuting.getStore(), repository = inspectSignedDescriptorCustodyRepository(repo.root);
  return sessionAuthorityRegistry.withSessionAuthorityBoundary({repository}, boundary => {
    if (active) {
      if (active.entry !== "authorize-briefed" || canonical(active.repository) !== canonical(repository)
          || active.authorizationPath !== join(paths.briefedAuthorizations, `${record.id}.json`) || !active.memberHandle) hgoAuthorityFailure("hgo:briefed-publication-reservation-binding");
      const result = publish();
      appendAudit(paths, {type: "briefed-authorized", at: new Date().toISOString(), authorizationId: record.id,
        bindingSha256: active.bindingSha256, authorizationSha256: sha(readFileSync(active.authorizationPath))});
      hgoAuthorityWriteHold(active); active.phase = "armed";
      return result;
    }
    const input = {targetPath: record.targetPath, briefingDigest: record.briefingDigest, expiry: record.expiry,
      mode: record.mode, reason: record.reason};
    return hgoAuthorityDirectPublication({repository, entry: "authorize-briefed", input,
      authorizationPath: join(paths.briefedAuthorizations, `${record.id}.json`), preimages: []}, publish, boundary);
  });
}
export function consumeHumanGuardOverride(input = {}) {
  return consumeHumanGuardOverrideCore(input);
}
function hgoConsumptionBoundary(repo, consume) {
  const legacy = hgoLegacyControlOperation(repo, consume);
  if (legacy.status === "legacy-completed") return legacy.result;
  const repository = inspectSignedDescriptorCustodyRepository(repo.root);
  return sessionAuthorityRegistry.withSessionAuthorityBoundary({repository}, boundary => {
    const active = hgoAuthorityExecuting.getStore();
    if (active && canonical(active.repository) === canonical(repository) && active.memberHandle) return consume();
    const paths = hgoAuthorityPaths(repository), recovered = [];
    if (hgoAuthorityScopePresent(repository, paths.authorityHolds)) {
      const port = hgoAuthorityPortByCommon.get(repository.commonDir) ?? createHumanGuardOverrideAuthorityProducerPort({repository});
      const inventory = hgoAuthorityInventory(repository), {indexed} = hgoAuthorityValidatedInventory(port, inventory);
      for (const data of indexed.values()) {
        if (data.entry === "authorize-briefed" || data.phase !== "armed") continue;
        const actual = port.recoverOperation({memberRef: data.memberRef});
        const operation = hgoAuthorityOperation(port, actual.operationHandle);
        sessionAuthorityRegistry.inspectSourceOwnedSessionAuthorityMember({boundary, producerPort: port,
          memberHandle: operation.memberHandle, operationHandle: actual.operationHandle, expectedMemberRef: operation.memberRef});
        recovered.push({port, operationHandle: actual.operationHandle, operation});
      }
    }
    const result = consume();
    if (result?.status === "consumed") {
      const matches = recovered.filter(row => row.operation.input.planSha256 === result.planSha256);
      if (matches.length > 1) hgoAuthorityFailure("hgo:ambiguous-owning-consumption");
      if (matches.length === 1) {
        const {port, operationHandle, operation} = matches[0], observed = hgoAuthorityObserved(operation);
        if (observed.phase !== "terminal-observed") hgoAuthorityFailure("hgo:consumption-terminal-readback");
        const advanced = sessionAuthorityRegistry.advanceSessionAuthorityMember({boundary, producerPort: port,
          memberHandle: operation.memberHandle, expectedMemberRef: operation.memberRef, operationHandle});
        operation.memberRef = advanced.memberRef;
        const terminalHandle = Object.freeze({});
        hgoAuthorityTerminals.set(terminalHandle, {port, operationHandle, terminal: "consumed"});
        const released = sessionAuthorityRegistry.releaseSessionAuthorityMember({boundary, producerPort: port,
          memberHandle: operation.memberHandle, expectedMemberRef: operation.memberRef, terminalHandle});
        operation.memberRef = released.memberRef;
      }
    }
    return result;
  });
}
export function isOwnedHumanGuardOverrideAuthorityProducerPort(port, {repository} = {}) {
  const data = hgoAuthorityPorts.get(port);
  if (!data) return false;
  try { return canonical(hgoAuthorityRepository(repository)) === canonical(data.repository); }
  catch { return false; }
}
export function createHumanGuardOverrideAuthorityProducerPort({repository: input} = {}) {
  const repository = hgoAuthorityRepository(input);
  const context = readSourceOwnedAuthorityContext({repository});
  let assurance = "physical-readback";
  if (context.status === "bound") {
    const observation = createSignedCleanupRequesterObserver({repository, requesterHandle: context.requesterHandle})({repository});
    if (observation.status !== "bound") hgoAuthorityFailure("hgo:source-context-unavailable");
    assurance = observation.requester.assurance === "controlled-unit-method" ? "controlled-unit-method" : "physical-readback";
  }
  const port = Object.freeze({
    prepareOperation({requesterHandle, entry, input}) {
      return hgoAuthorityPrepare(port, requesterHandle, entry, input);
    },
    async executeOperation({operationHandle, memberHandle, expectedMemberRef}) {
      const operation = hgoAuthorityOperation(port, operationHandle);
      if (operation.phase !== "reserved" || operation.memberHandle) hgoAuthorityFailure("hgo:execution-already-entered");
      sessionAuthorityRegistry.withSessionAuthorityBoundary({repository}, boundary => {
        if (typeof sessionAuthorityRegistry.inspectSourceOwnedSessionAuthorityMember !== "function") hgoAuthorityFailure("hgo:member-inspector-unavailable");
        sessionAuthorityRegistry.inspectSourceOwnedSessionAuthorityMember({boundary, producerPort: port,
          memberHandle, operationHandle, expectedMemberRef});
        hgoAuthorityObserved(operation); // physically reopen every preimage before the writer
        operation.memberHandle = memberHandle; operation.memberRef = {...expectedMemberRef};
      });
      // Exit common custody before the original owner body; its publication
      // helpers reacquire common before any producer-local mutation locks.
      const ownerResult = hgoAuthorityExecuting.run(operation, () => {
          if (operation.entry === "authorize-signature") {
            const {proofRef: ignored, ...input} = operation.input;
            return authorizeHumanGuardOverrideBySignature({rootDir: repository.primaryRoot, ...input, proof: operation.proof});
          }
          const {proofRef: ignored, ...input} = operation.input;
          return createBriefedTestChangeAuthorization({rootDir: repository.primaryRoot, ...input, proof: operation.proof});
        });
      return sessionAuthorityRegistry.withSessionAuthorityBoundary({repository}, boundary => {
        if (!["armed", "granted"].includes(ownerResult?.status) || !operation.holdPath) hgoAuthorityFailure("hgo:actual-publication-unavailable");
        const observed = hgoAuthorityObserved(operation);
        if (observed.phase !== "armed") hgoAuthorityFailure("hgo:actual-armed-readback");
        const advanced = sessionAuthorityRegistry.advanceSessionAuthorityMember({boundary, producerPort: port,
          memberHandle, expectedMemberRef, operationHandle});
        operation.memberRef = advanced.memberRef;
        const executionHandle = Object.freeze({});
        hgoAuthorityExecutions.set(executionHandle, {port, operationHandle, ownerResult});
        return {status: "executed", code: null, executionHandle, memberRef: {...operation.memberRef}, ownerResult,
          sourceRefs: [hgoAuthorityPhysical(repository, operation.authorizationPath,
            operation.entry === "authorize-briefed" ? "briefed-authorizations" : "capabilities").ref,
            hgoAuthorityPhysical(repository, operation.holdPath, "audit").ref]};
      });
    },
    async finishOperation({operationHandle, executionHandle, entry, input, expectedMemberRef}) {
      const operation = hgoAuthorityOperation(port, operationHandle), execution = hgoAuthorityExecutions.get(executionHandle);
      if (!execution || execution.port !== port || execution.operationHandle !== operationHandle || !operation.memberHandle) hgoAuthorityFailure("hgo:unowned-execution-terminal");
      return sessionAuthorityRegistry.withSessionAuthorityBoundary({repository}, boundary => {
        sessionAuthorityRegistry.inspectSourceOwnedSessionAuthorityMember({boundary, producerPort: port,
          memberHandle: operation.memberHandle, operationHandle, expectedMemberRef});
        const observed = hgoAuthorityObserved(operation);
        if (observed.phase !== "armed") hgoAuthorityFailure("hgo:terminal-replay-or-phase");
        if (operation.entry !== "authorize-briefed") {
          if (entry !== "consume" || !exactKeys(input, ["provider", "toolName", "toolInput", "denials"])) hgoAuthorityFailure("hgo:consume-terminal-input");
          const result = hgoAuthorityExecuting.run(operation, () => consumeHumanGuardOverride({rootDir: repository.primaryRoot,
            pluginRoot: operation.input.pluginRoot, ...input}));
          if (result?.status !== "consumed" || result.planSha256 !== operation.input.planSha256) hgoAuthorityFailure("hgo:actual-consumption-refused");
        } else {
          if (entry !== "revoke-briefed" || !exactKeys(input, ["expectedAuthorizationRef"])) hgoAuthorityFailure("hgo:revoke-terminal-input");
          const source = hgoAuthorityReference(repository, input.expectedAuthorizationRef, "briefed-authorizations");
          if (source.path !== operation.authorizationPath) hgoAuthorityFailure("hgo:revoke-foreign-authorization");
          const record = hgoAuthorityBriefed(repository, source.path), paths = hgoAuthorityPaths(repository);
          appendAudit(paths, {type: "briefed-revoked", at: new Date().toISOString(), authorizationId: record.id,
            bindingSha256: operation.bindingSha256, authorizationSha256: source.ref.sha256});
          const retainedPath = source.path.replace(/\.json$/u, ".revoked.json");
          if (existsSync(retainedPath)) hgoAuthorityFailure("hgo:revocation-replay");
          renameSync(source.path, retainedPath);
        }
        const terminalObservation = hgoAuthorityObserved(operation);
        if (terminalObservation.phase !== "terminal-observed") hgoAuthorityFailure("hgo:owning-terminal-unavailable");
        const advanced = sessionAuthorityRegistry.advanceSessionAuthorityMember({boundary, producerPort: port,
          memberHandle: operation.memberHandle, expectedMemberRef, operationHandle});
        operation.memberRef = advanced.memberRef;
        const terminalHandle = Object.freeze({});
        hgoAuthorityTerminals.set(terminalHandle, {port, operationHandle,
          terminal: operation.entry === "authorize-briefed" ? "revoked" : "consumed"});
        const sourcePath = operation.entry === "authorize-briefed" ? operation.authorizationPath.replace(/\.json$/u, ".revoked.json") : operation.authorizationPath;
        return {status: "observed", terminalHandle, sourceRefs: [hgoAuthorityPhysical(repository, sourcePath,
          operation.entry === "authorize-briefed" ? "briefed-authorizations" : "capabilities").ref,
          hgoAuthorityPhysical(repository, operation.holdPath, "audit").ref]};
      });
    },
    recoverOperation({memberRef}) {
      if (typeof memberRef?.path !== "string" || !/^\.git\/agent-pipeline\/session-authority\/members\/human-guard-override\/member-[a-f0-9]{32}\.[1-9][0-9]*\.json$/u.test(memberRef.path)) {
        hgoAuthorityFailure("hgo:recovery-member-path");
      }
      const memberSource = hgoAuthorityReference(repository, memberRef), member = JSON.parse(memberSource.bytes.toString("utf8"));
      if (member.producerId !== "human-guard-override" || !SHA256.test(member.bindingSha256 ?? "") || member.phase === "released") hgoAuthorityFailure("hgo:recovery-member-domain");
      const holdPath = join(hgoAuthorityPaths(repository).authorityHolds, `${member.bindingSha256}.json`);
      const {record} = hgoAuthorityReadHold(repository, holdPath);
      if (record.memberRef.path !== memberRef.path || record.bindingSha256 !== member.bindingSha256
          || canonical(record.association) !== canonical(member.association)) hgoAuthorityFailure("hgo:recovery-owning-association");
      const handle = Object.freeze({}), data = {port, repository, association: record.association,
        entry: record.entry, input: record.input, inputSha256: record.inputSha256, bindingSha256: record.bindingSha256,
        preimageRefs: record.preimageRefs, authorizationPath: join(repository.commonDir, record.authorizationPath),
        phase: "armed", memberHandle: null, memberRef, holdPath};
      hgoAuthorityOperations.set(handle, data);
      const observed = hgoAuthorityObserved(data);
      if (observed.phase !== member.phase || canonical(observed.kinds) !== canonical(member.kinds)
          || canonical(observed.sourceFacts) !== canonical(member.sourceFacts)) hgoAuthorityFailure("hgo:recovery-source-member-cas");
      const recovered = sessionAuthorityRegistry.withSessionAuthorityBoundary({repository}, boundary =>
        sessionAuthorityRegistry.recoverSessionAuthorityMember({boundary, producerPort: port,
          operationHandle: handle, expectedMemberRef: memberRef}));
      data.memberHandle = recovered.memberHandle; data.memberRef = recovered.memberRef;
      const executionHandle = Object.freeze({});
      hgoAuthorityExecutions.set(executionHandle, {port, operationHandle: handle, sourceRecovery: true});
      return {status: "recovered", operationHandle: handle, executionHandle};
    },
    observePlanningOperation(handle) {
      const plan = hgoAuthorityPlanning.get(handle);
      if (!plan || plan.port !== port || plan.executed) hgoAuthorityFailure("hgo:unowned-planning-operation");
      const current = hgoAuthorityInventory(repository);
      if (canonical(current.memberships) !== canonical(plan.before.memberships)) hgoAuthorityFailure("hgo:planning-preimage-drift");
      return Object.freeze({entry: plan.entry, inputSha256: plan.inputSha256,
        allowedNamespaces: Object.freeze(plan.entry === "record-denial" ? ["requests", "audit", "command-offers"]
          : plan.entry === "plan-override" ? ["plans"] : plan.entry === "sweep-requests" ? ["requests", "audit"] : ["plans", "audit"]),
        allowedPathSha256s: Object.freeze(plan.allowedPaths.map(path => hgoAuthorityPathDigest(repository, path))),
        sourceFacts: hgoAuthorityFacts(current)});
    },
    executePlanningOperation(handle) {
      const plan = hgoAuthorityPlanning.get(handle);
      port.observePlanningOperation(handle);
      plan.executed = true; // a failing actual writer cannot be replayed through this handle
      plan.result = plan.publish();
      plan.after = hgoAuthorityInventory(repository);
      return plan.result;
    },
    observePlanningTerminal(handle) {
      const plan = hgoAuthorityPlanning.get(handle);
      if (!plan || plan.port !== port || !plan.executed || !plan.after) hgoAuthorityFailure("hgo:planning-terminal-unavailable");
      const current = hgoAuthorityInventory(repository);
      if (canonical(current.memberships) !== canonical(plan.after.memberships)) hgoAuthorityFailure("hgo:planning-terminal-drift");
      for (const id of ["capabilities", "briefed-authorizations", "locks"]) {
        if (canonical(current.groups.get(id).map(row => row.fact)) !== canonical(plan.before.groups.get(id).map(row => row.fact))) {
          hgoAuthorityFailure("hgo:planning-armed-or-lock-effect");
        }
      }
      const journalRefs = plan.allowedPaths.filter(path => existsSync(path)).map(path => {
        const local = relative(repository.commonDir, path), namespace = local.includes("/requests/") ? "requests"
          : local.includes("/plans/") ? "plans" : path === current.paths.commandOffers ? "command-offers" : "audit";
        const row = hgoAuthorityPhysical(repository, path, namespace);
        if (namespace === "requests") validatedRequest(current.paths, basename(path).slice(0, -5));
        if (namespace === "plans") {
          if (basename(path).endsWith(".disclosure.json")) validatedDisclosureIndex(path);
          else validatedPlan(path);
        }
        return row.ref;
      });
      if (!journalRefs.length) hgoAuthorityFailure("hgo:planning-no-source-readback");
      return Object.freeze({entry: plan.entry, inputSha256: plan.inputSha256, sourceFacts: hgoAuthorityFacts(current),
        journalRefs: Object.freeze(journalRefs), result: plan.result});
    },
    readAssurance() { hgoAuthorityRepository(repository); return assurance; },
    readBaseline() {
      const inventory = hgoAuthorityInventory(repository);
      const {legacyOperations} = hgoAuthorityValidatedInventory(port, inventory);
      return {memberships: inventory.memberships, legacyOperations};
    },
    observeOperation(handle) {
      const operation = hgoAuthorityOperations.get(handle);
      if (!operation || operation.port !== port) hgoAuthorityFailure("hgo:unowned-operation");
      if (operation.entry !== "legacy-authenticated-capability") return hgoAuthorityObserved(operation);
      const paths = hgoAuthorityPaths(repository), observed = hgoAuthorityPhysical(repository, operation.path, "capabilities");
      const capability = validatedCapability(paths, operation.path);
      if (!hasAuthorizedAuditEntry(paths, capability)) hgoAuthorityFailure("hgo:operation-audit-unavailable");
      if (capability.status !== "armed") hgoAuthorityFailure("hgo:legacy-terminal-owner-unavailable");
      return {association: operation.association, kinds: ["override", "armed-capability"], phase: "armed",
        bindingSha256: operation.bindingSha256, sourceFacts: [observed.fact]};
    },
    reconcile({producerRecord, memberRecords, releaseRecords}) {
      if (!producerRecord || !Array.isArray(memberRecords) || !Array.isArray(releaseRecords)) hgoAuthorityFailure("hgo:reconcile-shape");
      const inventory = hgoAuthorityInventory(repository), {indexed} = hgoAuthorityValidatedInventory(port, inventory);
      for (const member of memberRecords) {
        const data = [...indexed.values()].find(row => row.bindingSha256 === member.bindingSha256);
        if (!data) {
          if (hgoAuthorityCurrentReservedPublication(port, member)) continue;
          // Genuine legacy unbound arms remain held; they cannot be attributed or
          // silently discharged by an observer, expiry, or process liveness.
          if (member.association?.state !== "unbound" || member.phase === "released") hgoAuthorityFailure("hgo:member-without-source-index");
          const match = inventory.groups.get("capabilities").find(row => {
            const cap = validatedCapability(inventory.paths, row.path);
            return cap.status === "armed" && sha({repository, association: member.association, capabilitySha256: row.ref.sha256}) === member.bindingSha256;
          });
          if (!match) hgoAuthorityFailure("hgo:legacy-member-source-drift");
          continue;
        }
        const observed = hgoAuthorityObserved(data);
        if (canonical(observed.association) !== canonical(member.association) || canonical(observed.kinds) !== canonical(member.kinds)
            || canonical(observed.sourceFacts) !== canonical(member.sourceFacts)
            || (member.phase !== observed.phase && !(member.phase === "released" && observed.phase === "terminal-observed"))) {
          hgoAuthorityFailure("hgo:member-owning-source-drift");
        }
      }
      for (const release of releaseRecords) {
        const data = [...indexed.values()].find(row => row.bindingSha256 === release.bindingSha256);
        if (!data || hgoAuthorityObserved(data).phase !== "terminal-observed"
            || release.terminal !== (data.entry === "authorize-briefed" ? "revoked" : "consumed")) hgoAuthorityFailure("hgo:release-owning-terminal-drift");
      }
      return inventory.memberships;
    },
    observeTerminal(handle) {
      const terminal = hgoAuthorityTerminals.get(handle);
      if (!terminal || terminal.port !== port) hgoAuthorityFailure("hgo:unowned-terminal");
      const actual = hgoAuthorityObserved(hgoAuthorityOperation(port, terminal.operationHandle));
      if (actual.phase !== "terminal-observed") hgoAuthorityFailure("hgo:retained-owning-authority");
      return {terminal: terminal.terminal, sourceFacts: actual.sourceFacts};
    },
  });
  hgoAuthorityPorts.set(port, {repository, context, assurance});
  hgoAuthorityPortByCommon.set(repository.commonDir, port);
  return port;
}

export function buildBriefedTestChangeAuthorizationIntent({rootDir, targetPath, briefingDigest, expiry} = {}) {
  const normTarget = canonicalBriefedTarget(rootDir, targetPath);
  const expiresAtMs = typeof expiry === "number" ? expiry : Date.parse(expiry);
  if (normTarget === null || !SHA256.test(briefingDigest ?? "") || !Number.isFinite(expiresAtMs)) {
    fail("HGO-BRIEFED-TARGET-INVALID", "briefed intent input is invalid");
  }
  return briefedTestIntent(normTarget, briefingDigest, expiresAtMs);
}
