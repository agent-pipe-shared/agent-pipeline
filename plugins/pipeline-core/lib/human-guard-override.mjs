// SPDX-License-Identifier: SUL-1.0

import { createHash, createHmac, randomBytes } from "node:crypto";
import {
  chmodSync,
  closeSync,
  existsSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";

import {
  CHAT_GATE_CONFIRMATION_MISMATCH,
  CHAT_GATE_NOT_ATTENDED,
  chatAttributionRecord,
  requireAttendedChatGateConfirmation,
} from "./chat-gate-ceremony.mjs";
import { parseGuardCommand } from "../hooks/guard-command-grammar.mjs";
import {
  readCriticalHumanProofPolicy,
  readHumanApprovalMode,
  verifyAgainstTrustAnchors,
} from "./critical-human-proof-policy.mjs";
// Dependency-free string helpers ONLY (see git-cmd.mjs's own header). guard-push.mjs owns
// the normative `parsePushBinding()`, but that file is a HOOK with top-level side effects:
// importing it to reuse one function would run a guard as a side effect of loading this
// module. See pushRecoveryTarget() below for the bounded local equivalent.
import { stripQuotedSegments, tokenizeArgv } from "./git-cmd.mjs";
import {
  buildGuardHandoffOfferEvent,
  GUARD_HANDOFF_JOURNAL_REFUSAL,
  GUARD_HANDOFF_OFFER_OMISSIONS,
  GUARD_HANDOFF_REDACTION_POLICY,
  recordGuardHandoffOffer,
} from "./guard-handoff-offer.mjs";
import { createPoApprovalIntent, verifyPoApprovalProof } from "./po-approval-proof.mjs";
import { boundedOpaqueCopyCommand } from "./project-onboarding-v3.mjs";
import {
  LEGACY_STATE,
  NEUTRAL_STATE,
  resolveProjectAuthorityPaths,
} from "./project-authority.mjs";
import {
  assessWindowsPrivatePath,
  hardenWindowsPrivateDirectory,
} from "./windows-private-state.mjs";

const SHA256 = /^[a-f0-9]{64}$/u;
const SAFE_ID = /^[A-Za-z0-9._-]{1,120}$/u;
const REQUEST_SCHEMA = "pipeline.human-guard-override-request.v2";
const PLAN_SCHEMA = "pipeline.human-guard-override-plan.v2";
const CAPABILITY_SCHEMA = "pipeline.human-guard-override-capability.v2";
const AUDIT_SCHEMA = "pipeline.human-guard-override-audit.v1";
const AUDIT_HEAD_SCHEMA = "pipeline.human-guard-override-audit-head.v1";
const MAX_REASON_BYTES = 500;
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
    locks: secureDirectory(join(base, "locks")),
    key: join(base, "audit.key"),
    audit: join(base, "audit.jsonl"),
    auditHead: join(base, "audit.head.json"),
    auditLock: join(base, "audit.lock"),
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

function pluginIdentity(pluginRoot) {
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
  const activeManifestPath = existsSync(manifestPath) ? manifestPath : (existsSync(agyManifestPath) ? agyManifestPath : null);
  if (!activeManifestPath) fail("HGO-PLUGIN", "loaded plugin manifest is missing");
  try { manifest = JSON.parse(readFileSync(activeManifestPath, "utf8")); }
  catch { fail("HGO-PLUGIN", "loaded plugin manifest is malformed"); }
  if ((manifest?.name !== "pipeline-core" && manifest?.name !== "agent-pipeline-core") || (typeof manifest.version !== "string" && !existsSync(agyManifestPath))) {
    fail("HGO-PLUGIN", "loaded plugin identity is invalid");
  }
  return {
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
  const plugin = pluginIdentity(pluginRoot);
  if (canonical(plugin) !== canonical(planned.plugin)) {
    fail("HGO-PLUGIN-DRIFT", "override machinery plugin identity drifted before arming");
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
  for (const line of normalized.split("\n")) {
    const match = line.match(/^\*\*\* (?:(?:Add|Update|Delete) File|Move to): (.+)$/u);
    if (match) paths.push(match[1]);
  }
  return paths.length > 0 ? paths : null;
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

function denialRationale(denials) {
  return denials.map((denial) => ({
    guard: String(denial.guard),
    denialSha256: sha(String(denial.reason)),
    rationale: String(denial.reason).slice(0, 2_000),
  })).sort((left, right) => `${left.guard}:${left.denialSha256}`.localeCompare(`${right.guard}:${right.denialSha256}`));
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
const PUSH_COMMAND = /\bgit(?:\.exe)?\b[^\n]*\bpush\b/iu;
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
  const deniedPushCommand = PUSH_COMMAND.test(command);
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
    paths.push(path.relative);
    if (protectedPath(path.relative)) return {
      eligible: true,
      mode: "standard",
      sourceRoot: null,
      paths,
      commandClass: "writer-owned-project-policy-emergency",
    };
  } else if (toolName === "apply_patch") {
    const parsed = patchPaths(toolInput?.command);
    if (!parsed) {
      return { eligible: false, code: "HGO-NONOVERRIDABLE-GRAMMAR", paths };
    }
    for (const candidate of parsed) {
      const classified = classifyPath(root, candidate);
      if (classified.kind === "refused") return { eligible: false, code: "HGO-NONOVERRIDABLE-CROSS-BOUNDARY", paths: [...paths, candidate] };
      if (classified.kind === "cross-boundary") return crossBoundaryEligible(paths, classified.target);
      const path = classified.path;
      if (hardBoundaryPath(path.relative)) return { eligible: false, code: "HGO-NONOVERRIDABLE-PATH", paths: [...paths, path.relative] };
      paths.push(path.relative);
    }
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

function validatedPlan(path) {
  const value = readJson(path);
  const core = Object.fromEntries(Object.entries(value).filter(([name]) => name !== "planSha256"));
  if (!exactKeys(value, PLAN_KEYS) || value.schema !== PLAN_SCHEMA || value.status !== "planned"
    || !SHA256.test(value.requestSha256 ?? "") || !SHA256.test(value.planSha256 ?? "")
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
  if (request.root !== repo.root || new Date(request.expiresAt).getTime() <= nowMs) {
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
    writeExclusive(paths.key, randomBytes(32));
  }
  safePrivateFile(paths.key);
  const bytes = readFileSync(paths.key);
  if (bytes.length !== 32) fail("HGO-AUDIT", "audit key is invalid");
  return bytes;
}

function auditEntries(paths, secret) {
  if (!existsSync(paths.audit)) return [];
  safePrivateFile(paths.audit);
  const entries = [];
  let prior = "0".repeat(64);
  const lines = readFileSync(paths.audit, "utf8").split("\n").filter(Boolean);
  for (const line of lines) {
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
    prior = entry.mac;
  }
  return entries;
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

function verifiedAuditEntries(paths, secret) {
  const hasAudit = existsSync(paths.audit);
  const hasHead = existsSync(paths.auditHead);
  if (hasAudit !== hasHead) fail("HGO-AUDIT", "audit ledger/head presence is inconsistent");
  if (!hasAudit) fail("HGO-AUDIT", "audit ledger/head are missing");
  const entries = auditEntries(paths, secret);
  const ledgerBytes = readFileSync(paths.audit);
  const head = readJson(paths.auditHead);
  const expected = auditHead(secret, entries, ledgerBytes);
  if (!exactKeys(head, ["schema", "entries", "lastMac", "ledgerSha256", "mac"])
    || canonical(head) !== canonical(expected)) {
    fail("HGO-AUDIT", "audit ledger head authentication failed");
  }
  return entries;
}

function appendAudit(paths, event) {
  let fd;
  try {
    fd = openSync(paths.auditLock, "wx", 0o600);
    const initialize = !existsSync(paths.key)
      && !existsSync(paths.audit)
      && !existsSync(paths.auditHead);
    const secret = key(paths, { create: initialize });
    const entries = initialize
      ? []
      : verifiedAuditEntries(paths, secret);
    const core = {
      schema: AUDIT_SCHEMA,
      sequence: entries.length + 1,
      previousMac: entries.at(-1)?.mac ?? "0".repeat(64),
      event,
    };
    const entry = { ...core, mac: createHmac("sha256", secret).update(canonical(core)).digest("hex") };
    const content = `${entries.map((item) => JSON.stringify(item)).join("\n")}${entries.length ? "\n" : ""}${JSON.stringify(entry)}\n`;
    const ledgerBytes = Buffer.from(content, "utf8");
    writeAtomic(paths.audit, ledgerBytes);
    writeAtomic(
      paths.auditHead,
      Buffer.from(`${JSON.stringify(auditHead(secret, [...entries, entry], ledgerBytes))}\n`, "utf8"),
    );
    return entry;
  } catch (error) {
    if (error?.code === "EEXIST") fail("HGO-AUDIT-LOCKED", "audit ledger is busy");
    throw error;
  } finally {
    if (fd !== undefined) closeSync(fd);
    try { unlinkSync(paths.auditLock); } catch {}
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
    recordGuardHandoffOffer({ offer, append: (value) => appendCommandOffer(value, { paths }) });
    return route;
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
  if (!exactKeys(value, CAPABILITY_KEYS)
    || value.schema !== CAPABILITY_SCHEMA
    || !new Set(["armed", "consumed"]).has(value.status)
    || !SHA256.test(value.requestSha256 ?? "")
    || !SHA256.test(value.planSha256 ?? "")
    || !SHA256.test(value.selectionSha256 ?? "")
    || !SHA256.test(value.reasonSha256 ?? "")
    || !(object(value.humanApproval)
      && ((value.humanApproval.mode === "chat-attributed-unattested"
        && exactKeys(value.humanApproval, ["mode", "kind"])
        && value.humanApproval.kind === "human-guard-override")
        || (value.humanApproval.mode === "signature-verified"
          && exactKeys(value.humanApproval, ["mode"]))))
    || !SHA256.test(value.toolInputSha256 ?? "")
    || typeof value.commandClass !== "string" || value.commandClass.trim() === ""
    || !(value.signedCandidate === null
      || (object(value.signedCandidate) && exactKeys(value.signedCandidate, ["commit", "tree"])
        && typeof value.signedCandidate.commit === "string" && value.signedCandidate.commit !== ""
        && typeof value.signedCandidate.tree === "string" && value.signedCandidate.tree !== ""))
    || !object(value.policy) || !object(value.preview)
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

function validatedRequest(paths, requestSha256) {
  const request = readJson(requestPath(paths, requestSha256));
  if (!exactKeys(request, [
    "schema", "root", "plugin", "repository", "toolName", "toolInputSha256", "denials",
    "policy", "preview", "eligiblePaths", "commandClass", "mode", "authorSourceRoot", "createdAt", "expiresAt",
  ])
    || request.schema !== REQUEST_SCHEMA || request.root === undefined
    || !new Set(["standard", "pipeline-author-repair-candidate", "global-plugin-install"]).has(request.mode)
    || request.authorSourceRoot !== null
    || !SHA256.test(request.toolInputSha256) || !Array.isArray(request.denials)
    || sha(request) !== requestSha256) fail("HGO-REQUEST", "override request is invalid");
  return request;
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

/**
 * @param {string} subject short noun the denying guard uses for the refused thing ("command", "edit").
 * @param {{planned?: object}|{error?: unknown}} outcome exactly what route planning produced.
 * @returns {string} two lines: that no route is offered, and the typed reason why.
 */
export function humanGuardRouteUnavailableReason(subject, outcome = {}) {
  const noun = routeToken(subject, ROUTE_SUBJECT_TOKEN, "action");
  const headline = `No human override route is offered for this exact ${noun}; the guard attempted to plan one.`;
  if (object(outcome) && Object.hasOwn(outcome, "error")) {
    const code = routeToken(outcome.error?.code, ROUTE_CODE_TOKEN, ROUTE_UNTYPED_CODE);
    return `${headline}\nReason: planning the route failed with code=${code}.`;
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

export function recordHumanGuardDenial({
  rootDir,
  pluginRoot,
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
  if (!Array.isArray(denials) || denials.length === 0) fail("HGO-DENIAL", "denial set is empty");
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
  const request = {
    schema: REQUEST_SCHEMA,
    root: repo.root,
    plugin: pluginIdentity(pluginRoot),
    repository,
    toolName,
    toolInputSha256: sha(toolInput),
    commandClass,
    denials: denials.map((denial) => ({
      guard: String(denial.guard),
      sha256: sha(String(denial.reason)),
    })).sort((left, right) => `${left.guard}:${left.sha256}`.localeCompare(`${right.guard}:${right.sha256}`)),
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
}

function buildPlanResult(record, scriptPath) {
  return {
    ...record,
    prepareAuthorizationAction: {
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
    },
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
  const plugin = pluginIdentity(pluginRoot);
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
  const payload = {
    schema: PLAN_SCHEMA,
    status: "planned",
    root: repo.root,
    requestSha256,
    plugin,
    repository,
    toolName: request.toolName,
    toolInputSha256: request.toolInputSha256,
    commandClass: request.commandClass,
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
  writeExclusive(path, Buffer.from(`${JSON.stringify(record)}\n`, "utf8"));
  return buildPlanResult(record, scriptPath);
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
  assertRequestNotExpired(request, repo, nowMs);
  const repository = repositoryObservation(repo.root, spawn);
  const policy = policyIdentity(repo.root, pluginRoot, request.denials);
  assertNoRequestDrift(repository, policy, request);
  const plugin = pluginIdentity(pluginRoot);
  if (canonical(plugin) !== canonical(request.plugin)) {
    fail("HGO-DRIFT", "override plugin identity drifted before refreeze");
  }
  const refreshedPayload = { ...priorPlan, plugin, repository };
  delete refreshedPayload.planSha256;
  const planSha256 = sha(refreshedPayload);
  const record = { ...refreshedPayload, planSha256 };
  const path = planPath(paths, requestSha256, authorSourceRoot);
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
    expiresAt: priorPlan.expiresAt,
  };
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
      expected: { schema: CAPABILITY_SCHEMA, status: "armed" },
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
  const planned = planHumanGuardOverride({
    rootDir,
    pluginRoot,
    requestSha256,
    nowMs,
    spawn,
    scriptPath,
    authorSourceRoot,
  });
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
        "--directory",
        "<external-po-material-directory>",
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
  if (approvalMode !== "chat") {
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
  if (!globalChat) {
    const confirmationExpected = `HGO-${selectionSha256.slice(0, 8).toUpperCase()}`;
    const confirmation = requireAttendedChatGateConfirmation({
      summaryLines: [
        "HUMAN GUARD OVERRIDE ACTIVATION CONFIRMATION -- read before you type the value:",
        `  reason: ${reason}`,
        `  request-sha256: ${requestSha256}`,
        `  plan-sha256: ${planSha256}`,
        `  selection-sha256: ${selectionSha256}`,
        `  confirmation value: ${confirmationExpected}`,
      ],
      expected: confirmationExpected,
      dependencies,
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
    schema: CAPABILITY_SCHEMA,
    status: "armed",
    root: repo.root,
    requestSha256,
    planSha256,
    selectionSha256,
    reasonSha256,
    humanApproval: chatAttributionRecord({ kind: "human-guard-override" }),
    plugin: planned.plugin,
    repository: freshRepository,
    // Finding 1 (design doc §1.4 step 5) is scoped to the signature path only --
    // the chat path has no signed-intent concept to bind a candidate to.
    signedCandidate: null,
    toolName: planned.toolName,
    toolInputSha256: planned.toolInputSha256,
    commandClass: planned.commandClass,
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
      return { schema: CAPABILITY_SCHEMA, status: "armed", planSha256, requestSha256, mutated: false };
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
  return { schema: CAPABILITY_SCHEMA, status: "armed", planSha256, requestSha256, mutated: true };
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
  const resolvedTrustAnchors = trustPolicy !== null
    ? [trustPolicy]
    : (() => {
      const policy = readCriticalHumanProofPolicy(rootDir);
      if (policy.ok && Array.isArray(policy.trustAnchors) && policy.trustAnchors.length > 0) {
        return policy.trustAnchors;
      }
      if (policy.ok && policy.trustAnchor !== null) return [policy.trustAnchor];
      fail("HGO-TRUST-ANCHOR-MISSING", "project/critical-human-proof.json carries no trustAnchor");
    })();
  // Defense in depth (belt-and-suspenders with the resolution above): never let an empty
  // anchor set reach verification, regardless of how `resolvedTrustAnchors` was resolved --
  // a future code path that resolves it differently must still be unable to pass an empty
  // set through to verifyAgainstTrustAnchors().
  if (!Array.isArray(resolvedTrustAnchors) || resolvedTrustAnchors.length === 0) {
    fail("HGO-TRUST-ANCHOR-MISSING", "project/critical-human-proof.json carries no trustAnchor");
  }
  const verified = verifyAgainstTrustAnchors({ intent, anchors: resolvedTrustAnchors, proof });
  if (!verified.verified) fail("HGO-PROOF-INVALID", verified.code ?? "PO-APPROVAL-PROOF-INVALID");

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
    schema: CAPABILITY_SCHEMA,
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
      return { schema: CAPABILITY_SCHEMA, status: "armed", planSha256, requestSha256, mutated: false };
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
  return { schema: CAPABILITY_SCHEMA, status: "armed", planSha256, requestSha256, mutated: true };
}

export function consumeHumanGuardOverride({
  rootDir,
  pluginRoot,
  toolName,
  toolInput,
  denials,
  nowMs = Date.now(),
  spawn = spawnSync,
  codexSpawn = spawnSync,
} = {}) {
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
  const paths = storage(repo.common);
  const toolInputSha256 = sha(toolInput);
  const denialDigests = denials.map((denial) => ({
    guard: String(denial.guard),
    sha256: sha(String(denial.reason)),
  })).sort((left, right) => `${left.guard}:${left.sha256}`.localeCompare(`${right.guard}:${right.sha256}`));
  const files = [];
  let replanRequired = false;
  // NVA-SIGDISCLOSE-1 Finding 6: a capability file this process cannot read or validate
  // at all (unreadable, malformed JSON, a stale/wrong schema version, a bad MAC) is
  // SKIPPED and RECORDED here, never treated as a whole-store failure. Before this fix,
  // the very first unreadable/invalid record aborted the entire enumeration with
  // `return`, hiding every other, otherwise-valid armed capability that happened to sort
  // after it -- a single leftover v1 file could silence a perfectly good v2 one. A record
  // that IS read and validated successfully but simply does not match this call (wrong
  // tool, wrong input, expired, drifted, wrong denials) is untouched by this change and
  // stays exactly as strict as before: only a record this process cannot even validate
  // is now skipped rather than poisoning the whole store.
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
      || capability.toolInputSha256 !== toolInputSha256
      || canonical(capability.denials) !== canonical(denialDigests)) continue;
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
      const plugin = pluginIdentity(pluginRoot);
      const policy = policyIdentity(repo.root, pluginRoot, denials);
      const isLocalPluginInstall = capability.mode === "global-plugin-install";
      if (isLocalPluginInstall && !exactLocalPluginInstall(toolName, toolInput, repo.root)) {
        return { status: "replan", code: "HGO-PLUGIN-INSTALL-SHAPE" };
      }
      const repository = isLocalPluginInstall
        ? localPluginInstallSourceObservation(repo, { spawn: codexSpawn })
        : repositoryObservation(repo.root, spawn);
      const expired = new Date(capability.expiresAt).getTime() <= nowMs;
      const driftChecks = {
        status: capability.status !== "armed",
        root: capability.root !== repo.root,
        toolName: capability.toolName !== toolName,
        toolInputSha256: capability.toolInputSha256 !== toolInputSha256,
        denials: canonical(capability.denials) !== canonical(denialDigests),
        plugin: canonical(capability.plugin) !== canonical(plugin),
        policy: canonical(capability.policy) !== canonical(policy),
        repository: canonical(capability.repository) !== canonical(repository),
        authorEligiblePaths: capability.mode === "pipeline-author-repair"
          && authorEligiblePaths(repo.root, capability.eligiblePaths, capability.authorSourceRoot) === null,
      };
      const drifted = Object.values(driftChecks).some(Boolean);
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
        return { status: "replan", code: "HGO-DRIFT" };
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
    ...(replanRequired ? { status: "replan", code: "HGO-EXPIRED" } : { status: "absent" }),
    ...(skippedInvalidRecords.length ? { skippedInvalidRecords } : {}),
  };
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
// lie. Mirrors the enumerate-then-validate loop shape `consumeHumanGuardOverride()`
// already uses over `paths.capabilities` (readdirSync + filter + sort + a per-entry
// try/catch that skips what it cannot use), over `paths.requests` instead.
// ---------------------------------------------------------------------------------
const HGO_SUMMARY_MAX_LINES = 8;
const HGO_SUMMARY_MAX_LINE_CHARS = 240;
const HGO_SUMMARY_MAX_RATIONALE_CHARS = 160;
const HGO_SUMMARY_MAX_PATHS = 8;

function hgoDisplayText(value, limit) {
  const flat = (typeof value === "string" ? value : "").replace(/\p{C}/gu, " ").replace(/\s+/gu, " ").trim();
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
 * Enumerates every stored `requestSha256` under `paths.requests` (the same store
 * `recordHumanGuardDenial()` writes to) and, for each, recomputes its selection
 * (fixed `HGO_SIGNATURE_REASON`, exactly as the signed path always uses) and intent
 * digest via `buildHumanGuardOverrideSignatureIntent()` -- the SAME shared helper
 * `authorizeHumanGuardOverrideBySignature()` gates arming on. Only a request whose
 * recomputed digest equals `intentSha256` exactly is ever returned; a request this
 * repository cannot currently plan/prepare (expired, wrong root, author-repair without
 * a selected root, `global-plugin-install` mode) is skipped, never guessed at.
 */
export function describeHumanGuardOverrideSelection({ rootDir, pluginRoot, intentSha256, scriptPath, spawn = spawnSync } = {}) {
  try {
    if (!SHA256.test(intentSha256 ?? "")) return unresolvedHumanGuardOverrideSelection("HGO-RECORD-DIGEST-INVALID");
    let repo;
    try { repo = topology(rootDir, spawn); } catch { return unresolvedHumanGuardOverrideSelection("HGO-RECORD-REPOSITORY-UNAVAILABLE"); }
    const paths = storage(repo.common);
    let files;
    try { files = readdirSync(paths.requests).filter((name) => name.endsWith(".json")).sort(); }
    catch { return unresolvedHumanGuardOverrideSelection("HGO-RECORD-ABSENT"); }
    const nowMs = Date.now();
    for (const name of files) {
      const requestSha256 = name.slice(0, -5);
      if (!SHA256.test(requestSha256)) continue;
      try {
        const planned = planHumanGuardOverride({ rootDir, pluginRoot, requestSha256, nowMs, spawn, scriptPath, authorSourceRoot: null });
        const prepared = prepareHumanGuardOverrideAuthorization({
          rootDir, pluginRoot, requestSha256, planSha256: planned.planSha256, reason: HGO_SIGNATURE_REASON, nowMs, spawn, scriptPath, authorSourceRoot: null,
        });
        const intent = buildHumanGuardOverrideSignatureIntent({ prepared, planned });
        if (intent.sha256 !== intentSha256) continue;

        const pathsTotal = planned.eligiblePaths.length;
        const eligiblePaths = planned.eligiblePaths.slice(0, HGO_SUMMARY_MAX_PATHS).map((path) => hgoDisplayText(path, 200).text);
        const pathsNote = pathsTotal > eligiblePaths.length ? ` [showing ${eligiblePaths.length} of ${pathsTotal}]` : "";
        const rationale = (planned.preview?.guardRationale ?? []).map(({ guard, rationale: text }) => {
          const rendered = hgoDisplayText(text, HGO_SUMMARY_MAX_RATIONALE_CHARS);
          return `${hgoDisplayText(guard, 64).text}: "${rendered.text}"${rendered.truncated ? " [truncated]" : ""}`;
        }).join("; ");
        const expiresAt = hgoDisplayTimestamp(planned.expiresAt);

        return {
          resolved: true,
          code: "HGO-RECORD-RESOLVED",
          lines: hgoClipLines([
            `recorded request: ${REQUEST_SCHEMA} (tool ${hgoDisplayText(planned.toolName, 32).text}, class ${hgoDisplayText(planned.commandClass, 64).text})`,
            `eligible paths this override would admit: ${eligiblePaths.join(", ")}${pathsNote}`,
            `denying guard rationale: ${rationale || "(none recorded)"}`,
            `window expires at (signed, absolute): ${expiresAt}`,
          ]),
        };
      } catch { continue; }
    }
    return unresolvedHumanGuardOverrideSelection("HGO-RECORD-DIGEST-MISMATCH");
  } catch { return unresolvedHumanGuardOverrideSelection("HGO-RECORD-UNREADABLE"); }
}

export const humanGuardOverrideInternals = {
  canonical,
  sha,
  eligibility,
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
};
