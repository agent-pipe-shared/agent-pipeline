#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * pre-commit-hook-install — installs/removes a git-level `.git/hooks/pre-commit` backstop
 * enforcing the same protected-path rules `guard-testpath.mjs`/`guard-gate-strength.mjs`
 * already know about (NVA-W11-PRECOMMITGUARD, Layer 2 of backlog/items/
 * 2026-08-29-a-node-script-defeats-every-file-protection-guard.md).
 *
 * WHY THIS FILE EXISTS
 *   Every PreToolUse guard in this repository inspects a Bash/Edit/Write/NotebookEdit TOOL
 *   CALL. None of them can see a syscall issued by a process the guard already approved the
 *   launch of — a spawned `node <script>.mjs` calling `fs.writeFileSync` (or a shelled-out
 *   redirect, or a non-Node interpreter) directly against a protected path lands unobserved,
 *   regression-free, and unlogged (backlog item, above). Layer 1
 *   (`scripts/check-protected-path-integrity.mjs`) detects this after the fact; this file is
 *   Layer 2 — the git-level block at the one boundary a spawned process cannot walk around:
 *   the commit itself. The backlog item names the precedent directly: "the `pre-push` hook in
 *   this repository blocks a push whose verify evidence is red or mis-bound, and no agent has
 *   ever been able to reason its way past it."
 *
 * MODELED ON `plugins/pipeline-core/scripts/pre-push-hook-install.mjs` — same shim/impl/marker
 * installation pattern (a tiny POSIX `/bin/sh` shim `exec`-ing a real `.mjs` file, for the same
 * Node-module-type-detection reason that file's own header explains), same fail-closed-on-fault
 * doctrine, same onboarding-wiring convention (`lib/project-onboarding-v3.mjs`,
 * NVA-R9-PREPUSHHOOK precedent).
 *
 * PROTECTED-PATH SOURCE OF TRUTH (never a second hand-maintained list, per the backlog item's
 * own acceptance bar)
 *   - gate-strength: `gateStrengthRuleFor()`, imported directly from `../hooks/
 *     guard-gate-strength.mjs` — the SAME function the write-lane guard itself calls. GS-6
 *     (`LIVE_PLUGIN_RULE`, "the plugin root currently enforcing") is not in `GATE_STRENGTH_PATHS`
 *     and is therefore never matched here either — the identical disclosed scope narrowing
 *     Layer 1 (`check-protected-path-integrity.mjs`) already applied, for the identical reason:
 *     it names a live source tree under active development, not a discrete committed file.
 *   - test-path: `loadProtectedTestPathRules()` + `protectedTestPathRuleFor()`, imported from
 *     `../lib/protected-test-paths.mjs` — the SAME parser `guard-testpath.mjs` and the shell
 *     lane in `guard-lifecycle-ready.mjs` already share.
 *   - consumed-capability lookup: `defaultHasConsumedCapabilityForPath()`, imported from Layer
 *     1's own `check-protected-path-integrity.mjs` — the same storage read Layer 1 already
 *     implemented, reused rather than a third copy.
 *
 * DISCLOSED DEVIATIONS FROM THE WRITE-LANE GUARDS (never silent — QG-05)
 *   - No "governed repository" marker check (`guard-gate-strength.mjs`'s own convenience for a
 *     LIVE session in an unconfigured project): this hook is only ever installed by onboarding,
 *     and onboarding only runs on a project the Pipeline is actively governing, so the marker
 *     check would be a no-op in the cases that matter and a silent pass in the cases that do
 *     not.
 *   - No GS-15 (`project/.onboarding-staging/*`) staging-authoring carve-out: that is a
 *     session-time UX convenience for one specific live bootstrap-bind-apply write, not a
 *     committed-content concern — a git-level backstop stays simpler and fail-closed toward
 *     refusing rather than toward replicating every session-time nuance.
 *   - No durable per-commit log the way `pre-push-hook-install.mjs` keeps one (that log exists
 *     specifically so a `--no-verify` PUSH can later be reconciled against the remote's actual
 *     tip — a push is rare and its log is the seed for a not-yet-built detection step). A commit
 *     is frequent and already fully reconstructible from `git log`/`git show`; adding a second,
 *     redundant durable log here was judged out of this dispatch's scope.
 *
 * WHAT THIS INSTALLS
 *   Two files, both generated, both attributed to this script's own version:
 *     - `<git-common-dir>/hooks/pre-commit` (or wherever `core.hooksPath` points): the same
 *       tiny POSIX `/bin/sh` shim shape `pre-push-hook-install.mjs` already uses.
 *     - `<git-common-dir>/agent-pipeline/pre-commit-hook/impl.mjs`: the actual ESM evaluation
 *       logic, dynamically importing the pipeline's OWN already-exported guard helpers (never a
 *       copy) from absolute paths fixed at this exact install.
 *   Plus an install marker at `<git-common-dir>/agent-pipeline/pre-commit-hook/
 *   install-marker.json`, and a decline marker at `.../decline-marker.json` — the identical
 *   shape `pre-push-hook-install.mjs` already uses for both.
 *
 * SCOPE (backlog item's own "Scope constraint the fix must honour"): only gate-strength- and
 * testpath-protected paths are checked. A staged change to any other path is unaffected —
 * proven by a test, not by inspection (see this file's own test suite).
 *
 * FIRST-APPEARANCE EXEMPTION (PO decision, 2026-08-29, candidate (b) of the backlog item's
 * three candidates): a protected path's VERY FIRST appearance anywhere in this repository's
 * git history is exempt from the block below, even with no consumed capability — see
 * `pathAlreadyTrackedInHistory()` in the generated `renderImpl()` output for the exact
 * mechanism and its fail-closed default. This is what makes wiring this installer into
 * onboarding-by-default safe: onboarding's own scaffold-authoring step writes
 * gate-strength-protected files directly to disk via trusted, privileged code, and without
 * this exemption the first real commit capturing that scaffold would be indistinguishable
 * from an untrusted bypass. A LATER re-write of already-tracked content at that same path
 * stays exactly as blocked as before — this is the property the item's own reported repro
 * (an already-committed `project/pipeline.json` being bypass-written) depends on.
 *
 * TRUST-ANCHOR BOOTSTRAP EXEMPTION (PO decision, 2026-08-30, Option A, backlog/items/
 * 2026-08-29-trust-anchor-bootstrap-confirmed-still-circular-live.md): a second, much narrower
 * exemption, layered on top of the first-appearance one above, for the one circularity a
 * genuinely fresh signature-mode project still hits — see `isTrustAnchorBootstrapUpgrade()` in
 * the generated `renderImpl()` output for the exact narrow-shape contract and its fail-closed
 * default. It fires ONLY for `project/critical-human-proof.json`, ONLY for a trust-anchor-only
 * v1/v2/v3(no-anchor) → v3(exactly-one-anchor) transition with `requiredKinds`/`waivedKinds`
 * otherwise unchanged in substance. Every other already-tracked-path rewrite this hook blocks —
 * including a second/different/replaced trust anchor, or any other field bundled alongside the
 * anchor addition — stays exactly as blocked as before.
 *
 * FAIL-CLOSED, DELIBERATELY UNLIKE THE PLUGIN GUARD FAMILY'S FAIL-OPEN CONVENTION (mirrors
 * pre-push-hook-install.mjs's own doctrine exactly): an unresolved repository root, an
 * un-enumerable staged diff, or any other unexpected exception all BLOCK the commit — this hook
 * exists precisely for the moment PreToolUse supervision is gone, so "cannot tell" must not mean
 * "allow".
 *
 * THE HUMAN ESCAPE, AND ITS OWN LIMIT
 *   `git commit --no-verify` skips this hook — git's own documented behaviour, and the accepted
 *   operator escape so a human is never stuck. An agent MUST NOT use it (the printed refusal
 *   says so, matching `pre-push-hook-install.mjs`'s own wording exactly).
 *
 * HANDOVER-SIZE COMPANION CHECK (NVA-B-HANDOVERPATH, 2026-09-01, backlog/items/
 * 2026-09-01-the-handover-size-guard-only-sees-one-of-two-write-paths.md) — a SECOND,
 * independent check bolted onto this same commit-boundary hook, closing the identical
 * write-path gap this file's own header already explains above, but for the handover file's
 * SIZE CAP instead of protected-path identity: `guard-handover-size.mjs` (a PreToolUse hook)
 * only ever sees an Edit/Write/NotebookEdit tool call, never a Bash-spawned Node script
 * writing the handover file (`docs/state.md` by default, or whatever `handover.path`/
 * `handover.maxBytes` a project's calibration names — resolved via the SAME
 * `resolveHandoverConfig()` that guard already uses, never a second hand-maintained cap or
 * path). Mirrors that guard's own admission rule exactly, computed at the commit boundary
 * instead of the PreToolUse boundary: a commit whose staged handover-file content is a net
 * size DECREASE relative to the last-committed (HEAD) content is always admitted, regardless
 * of the absolute resulting size — an over-cap file must always stay repairable by shrinking
 * it, from either write lane. A commit that is NOT a decrease and would leave the file at or
 * over the cap is refused. Fails CLOSED (blocks the commit) whenever either the committed or
 * the staged size cannot be established with confidence — see `handoverSizeFinding()` and
 * `gitObjectBytes()` in the generated `renderImpl()` output; never a silent allow on "cannot
 * measure", matching this hook's own overriding fail-closed doctrine below.
 *
 * NOT installed into this repository's own `.git/hooks/pre-commit` by this dispatch — that is
 * a separate, machine-local deployment decision (onboarding's own `applyInstall` call, or an
 * operator running `--install` directly), out of scope for a change to the generator itself;
 * see this file's own test suite for the fixture-repo demonstrations of the new check.
 *
 * NOT installed anywhere as a side effect of running this script directly — callers decide when
 * to `applyInstall`.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync, chmodSync, rmdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { isDirectInvocation } from "../lib/entrypoint.mjs";

export const INSTALLER_VERSION = "1";
export const MARKER_SCHEMA = "pipeline.pre-commit-hook-install.v1";
// Mirrors pre-push-hook-install.mjs's own decline marker exactly: its own schema, never folded
// into MARKER_SCHEMA's install marker, so an install and a decline can never be confused for
// one another and a later install never has to first erase a decline record to proceed.
export const DECLINE_MARKER_SCHEMA = "pipeline.pre-commit-hook-decline.v1";

// This installer's own plugin root — same self-location idiom every sibling guard/installer in
// this plugin already uses (`resolve(dirname(fileURLToPath(import.meta.url)), "..")`).
const PLUGIN_ROOT = fileURLToPath(new URL("..", import.meta.url));
const DEFAULT_PLUGIN_LIB_DIR = join(PLUGIN_ROOT, "lib");
const DEFAULT_PLUGIN_HOOKS_DIR = join(PLUGIN_ROOT, "hooks");
const DEFAULT_PLUGIN_SCRIPTS_DIR = join(PLUGIN_ROOT, "scripts");

function sha256(text) {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/**
 * Resolves the repository's own git-common-dir and hook path FROM THE REPOSITORY, never from a
 * session environment variable or an assumed cwd — the same fail-closed contract
 * pre-push-hook-install.mjs's own `resolveGitPaths` follows. `git rev-parse` is asked for the
 * answer directly; if it cannot answer, installation/removal both refuse rather than guess.
 */
function resolveGitPaths(rootDir) {
  const run = (args) => execFileSync("git", args, { cwd: rootDir, encoding: "utf8", timeout: 10000, stdio: ["ignore", "pipe", "ignore"] }).trim();
  let commonDir;
  let hookPath;
  try {
    commonDir = run(["rev-parse", "--path-format=absolute", "--git-common-dir"]);
    hookPath = run(["rev-parse", "--path-format=absolute", "--git-path", "hooks/pre-commit"]);
  } catch {
    return null;
  }
  return { commonDir, hookPath };
}

function markerPath(commonDir) {
  return join(commonDir, "agent-pipeline", "pre-commit-hook", "install-marker.json");
}
function implPath(commonDir) {
  return join(commonDir, "agent-pipeline", "pre-commit-hook", "impl.mjs");
}
function declineMarkerPath(commonDir) {
  return join(commonDir, "agent-pipeline", "pre-commit-hook", "decline-marker.json");
}

function readMarker(commonDir) {
  try {
    const parsed = JSON.parse(readFileSync(markerPath(commonDir), "utf8"));
    if (parsed?.schema !== MARKER_SCHEMA) return null;
    return parsed;
  } catch {
    return null;
  }
}

function readDeclineMarker(commonDir) {
  try {
    const parsed = JSON.parse(readFileSync(declineMarkerPath(commonDir), "utf8"));
    if (parsed?.schema !== DECLINE_MARKER_SCHEMA) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** The `/bin/sh` shim installed at the actual hook path. Byte-identical shape to
 * pre-push-hook-install.mjs's own `renderShim`. `implAbsPath` is DATA baked in at install time
 * (this exact repository's resolved impl.mjs location), not a guess. */
export function renderShim(implAbsPath) {
  return [
    "#!/bin/sh",
    "# GENERATED by plugins/pipeline-core/scripts/pre-commit-hook-install.mjs -- do not hand-edit.",
    "# Re-run the installer to update; use its --remove verb to uninstall cleanly.",
    `exec node ${JSON.stringify(implAbsPath)} "$@"`,
    "",
  ].join("\n");
}

/** The real ESM evaluation logic. `pluginLibDir`/`pluginHooksDir`/`pluginScriptsDir` are baked
 * in as absolute paths fixed at install time — see this function's own generated header for the
 * full scope/fail-closed contract. Kept as one exported render function (never copied inline at
 * each call site) so the installed hook's content stays byte-identical to whatever
 * `pre-commit-hook-install.test.mjs` exercises. */
export function renderImpl({ pluginLibDir, pluginHooksDir, pluginScriptsDir }) {
  const lib = JSON.stringify(pluginLibDir);
  const hooksDir = JSON.stringify(pluginHooksDir);
  const scriptsDir = JSON.stringify(pluginScriptsDir);
  return `#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * pre-commit (agent-pipeline generated, installer v${INSTALLER_VERSION}) — git-level backstop
 * enforcing the same protected-path rules guard-testpath.mjs / guard-gate-strength.mjs already
 * know about, at the one boundary a spawned process cannot walk around: the commit itself.
 *
 * GENERATED FILE. Installed by plugins/pipeline-core/scripts/pre-commit-hook-install.mjs.
 * Do not hand-edit -- re-run the installer to update, or use its --remove verb.
 *
 * See that installer's own file header for the full WHY / SOURCE-OF-TRUTH / SCOPE / DISCLOSED
 * DEVIATIONS reasoning -- not repeated here to keep the installed file itself short.
 *
 * FAIL-CLOSED: an unresolved repository root, an un-enumerable staged diff, or any other
 * unexpected exception all BLOCK the commit -- this hook exists precisely for the moment
 * PreToolUse supervision is gone, so "cannot tell" must not mean "allow".
 *
 * INSTALL-TIME BINDING: PLUGIN_LIB_DIR / PLUGIN_HOOKS_DIR / PLUGIN_SCRIPTS_DIR below are fixed
 * by the installer at install time -- DATA, not a repo-relative guess. If that plugin copy later
 * moves or is removed, every commit blocks (fail-closed, per above) with a diagnostic naming the
 * failure, until the hook is reinstalled or removed.
 */
import { spawnSync } from "node:child_process";
import { pathToFileURL, fileURLToPath } from "node:url";
import { resolve } from "node:path";

const PLUGIN_LIB_DIR = ${lib};
const PLUGIN_HOOKS_DIR = ${hooksDir};
const PLUGIN_SCRIPTS_DIR = ${scriptsDir};
const EMPTY_TREE_SHA = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";

function git(args, cwd) {
  return spawnSync("git", args, { cwd, encoding: "utf8", timeout: 15000 });
}

function resolveProjectRoot() {
  const result = git(["rev-parse", "--show-toplevel"], process.cwd());
  return result.status === 0 && result.stdout?.trim() ? result.stdout.trim() : null;
}

function resolveGitCommonDir() {
  const result = git(["rev-parse", "--path-format=absolute", "--git-common-dir"], process.cwd());
  return result.status === 0 && result.stdout?.trim() ? result.stdout.trim() : null;
}

/** Every repo-relative path the staged index differs on from its comparison point --
 * \`HEAD\` normally, the well-known empty-tree sha for a repository's very first commit (the
 * same fallback git's own sample pre-commit hook uses). \`-z\` keeps this NUL-safe for any
 * filename. Returns \`null\` (never []) when the diff itself could not be enumerated, so the
 * caller can tell "nothing staged" apart from "cannot tell" and fail closed on the latter. */
export function stagedPaths(projectRoot) {
  const head = git(["rev-parse", "--verify", "-q", "HEAD"], projectRoot);
  const against = head.status === 0 ? "HEAD" : EMPTY_TREE_SHA;
  const result = git(["diff", "--cached", "--name-only", "-z", against], projectRoot);
  if (result.status !== 0) return null;
  const raw = result.stdout ?? "";
  return raw.length === 0 ? [] : raw.split("\\0").filter((entry) => entry.length > 0);
}

/** First-appearance exemption (PO decision, 2026-08-29, backlog/items/
 * 2026-08-29-a-node-script-defeats-every-file-protection-guard.md, candidate (b)): a
 * protected path's VERY FIRST appearance in this repository's git history is exempt from
 * this hook's block, because onboarding's own scaffold-authoring step writes
 * gate-strength-protected files directly to disk via trusted, privileged code, and the
 * first real commit that captures that scaffold is otherwise indistinguishable, from this
 * hook's point of view, from an untrusted bypass writing the same path. A LATER re-write of
 * content that some PRIOR commit already tracked at that exact path is NOT exempt -- that is
 * exactly the item's own reported repro shape (an already-committed \`project/pipeline.json\`
 * being bypass-written) and must stay blocked.
 *
 * Returns \`true\` (already tracked -- NOT exempt) whenever the answer cannot be established
 * with confidence, matching this hook's own fail-closed doctrine: an unborn HEAD (no commit
 * exists yet in this repository) is the one case that can be established as "never tracked"
 * with certainty, so it alone returns \`false\`. \`git log -- <path>\` (default, HEAD-reachable
 * history; never \`--all\`, which would also credit an unrelated branch's history) reports
 * every commit that ever added, modified, or removed content at \`relPath\` -- so a path that
 * was tracked and later deleted still counts as "already tracked", never re-exempted merely
 * because it is currently absent. */
export function pathAlreadyTrackedInHistory(projectRoot, relPath) {
  const head = git(["rev-parse", "--verify", "-q", "HEAD"], projectRoot);
  if (head.status !== 0) return false; // unborn HEAD: no commit exists yet -- nothing can be already tracked
  const result = git(["log", "--format=%H", "-1", "--", relPath], projectRoot);
  if (result.status !== 0) return true; // cannot tell -- fail closed toward "already tracked" (still blocked)
  return (result.stdout ?? "").trim().length > 0;
}

/**
 * TRUST-ANCHOR BOOTSTRAP EXEMPTION (PO decision, 2026-08-30, Option A, backlog/items/
 * 2026-08-29-trust-anchor-bootstrap-confirmed-still-circular-live.md): a second, narrower
 * exemption for the ONE circularity a genuinely fresh signature-mode project hits on its
 * very first trust-anchor bootstrap. Onboarding's own scaffold commit seeds
 * \`project/critical-human-proof.json\` with NO trust anchor (exempt above, first-appearance).
 * A signing key is only ever created AFTERWARD, by a human running \`po-human-approval.mjs
 * setup\` -- never by this hook's own first-appearance exemption, since the file is already
 * tracked by then. Adding that key's anchor is therefore an ordinary "already tracked"
 * rewrite this hook would otherwise block, with no route through except the
 * human-operator-only \`--no-verify\` escape this hook's own message names.
 *
 * Deliberately narrow: fires ONLY for \`project/critical-human-proof.json\`, ONLY for a
 * v1/v2/v3(no anchor) -> v3(exactly one anchor) transition, with \`requiredKinds\`/
 * \`waivedKinds\` unchanged in SEMANTIC content (order-insensitive; v1's absent \`waivedKinds\`
 * treated as equivalent to v2/v3's explicit empty array -- the only shape onboarding's own
 * \`freshCriticalHumanProofPolicyBytes\` ever seeds). Any parse failure, unexpected top-level
 * key, duplicate entry, or other ambiguity fails CLOSED (not exempt -- stays blocked),
 * matching \`pathAlreadyTrackedInHistory\`'s own doctrine above. Deliberately NOT a
 * re-implementation of critical-human-proof-policy.mjs's full schema validation -- this
 * hook's only job is to gate whether this one write may cross the commit boundary.
 */
const CRITICAL_HUMAN_PROOF_POLICY_PATH = "project/critical-human-proof.json";
const CRITICAL_HUMAN_PROOF_POLICY_V1 = "pipeline.critical-human-proof-policy.v1";
const CRITICAL_HUMAN_PROOF_POLICY_V2 = "pipeline.critical-human-proof-policy.v2";
const CRITICAL_HUMAN_PROOF_POLICY_V3 = "pipeline.critical-human-proof-policy.v3";

function trustAnchorEntryShapeOk(entry) {
  return entry !== null && typeof entry === "object" && !Array.isArray(entry)
    && typeof entry.keyReference === "string" && entry.keyReference.length > 0
    && typeof entry.publicKeySha256 === "string" && entry.publicKeySha256.length > 0;
}

/** Minimal, self-contained parse of the ONE shape this exemption cares about. Returns
 * \`null\` (cannot establish with confidence) on any unexpected field, duplicate entry, or
 * malformed shape -- the caller then treats the whole exemption as not applicable, never
 * as "assume the best". */
function readTrustAnchorBootstrapShape(parsed) {
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const schemaVersion = parsed.schema;
  if (schemaVersion !== CRITICAL_HUMAN_PROOF_POLICY_V1
    && schemaVersion !== CRITICAL_HUMAN_PROOF_POLICY_V2
    && schemaVersion !== CRITICAL_HUMAN_PROOF_POLICY_V3) return null;
  if (!Array.isArray(parsed.requiredKinds) || parsed.requiredKinds.some((kind) => typeof kind !== "string")) return null;
  const requiredKinds = new Set(parsed.requiredKinds);
  if (requiredKinds.size !== parsed.requiredKinds.length) return null; // duplicate -- ambiguous, fail closed

  const isV1 = schemaVersion === CRITICAL_HUMAN_PROOF_POLICY_V1;
  let waivedKindsRaw = [];
  if (Object.hasOwn(parsed, "waivedKinds")) {
    if (isV1 || !Array.isArray(parsed.waivedKinds)) return null; // v1 never carries waivedKinds
    waivedKindsRaw = parsed.waivedKinds;
  }
  const waiverKeys = [];
  for (const entry of waivedKindsRaw) {
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) return null;
    if (typeof entry.kind !== "string" || typeof entry.reason !== "string") return null;
    waiverKeys.push(JSON.stringify([entry.kind, entry.reason]));
  }
  const waivedKindsSet = new Set(waiverKeys);
  if (waivedKindsSet.size !== waiverKeys.length) return null; // duplicate waiver -- ambiguous, fail closed

  let anchorCount;
  if (schemaVersion === CRITICAL_HUMAN_PROOF_POLICY_V3) {
    if (Object.hasOwn(parsed, "trustAnchor")) return null; // v3 never carries the singular field
    if (Object.hasOwn(parsed, "trustAnchors")) {
      if (!Array.isArray(parsed.trustAnchors) || parsed.trustAnchors.some((entry) => !trustAnchorEntryShapeOk(entry))) return null;
      anchorCount = parsed.trustAnchors.length;
    } else {
      anchorCount = 0;
    }
  } else {
    if (Object.hasOwn(parsed, "trustAnchors")) return null; // v1/v2 never carry the plural field
    if (Object.hasOwn(parsed, "trustAnchor")) {
      const anchor = parsed.trustAnchor;
      if (anchor === null) anchorCount = 0;
      else if (trustAnchorEntryShapeOk(anchor)) anchorCount = 1;
      else return null;
    } else {
      anchorCount = 0;
    }
  }

  return { schemaVersion, requiredKinds, waivedKindsSet, anchorCount };
}

function sameKindSet(left, right) {
  if (left.size !== right.size) return false;
  for (const value of left) if (!right.has(value)) return false;
  return true;
}

/** \`true\` ONLY for the exact anchor-only v1/v2/v3(no-anchor) -> v3(exactly-one-anchor)
 * upgrade of \`project/critical-human-proof.json\` -- see this section's own header comment
 * for the full narrow-shape contract. Reads the last-committed content via \`git show
 * HEAD:<path>\` and the staged (index) content via \`git show :<path>\`, the same \`git()\`
 * helper every other check in this hook already uses. Any git or parse failure fails
 * CLOSED (returns \`false\` -- not exempt, stays blocked). */
function isTrustAnchorBootstrapUpgrade(projectRoot, relPath) {
  if (relPath !== CRITICAL_HUMAN_PROOF_POLICY_PATH) return false;
  const headShow = git(["show", "HEAD:" + relPath], projectRoot);
  if (headShow.status !== 0) return false; // no committed version at this exact path -- cannot establish, fail closed
  let headParsed;
  try { headParsed = JSON.parse(headShow.stdout); } catch { return false; }
  const headShape = readTrustAnchorBootstrapShape(headParsed);
  if (!headShape || headShape.anchorCount !== 0) return false; // HEAD must carry NO trust anchor

  const stagedShow = git(["show", ":" + relPath], projectRoot);
  if (stagedShow.status !== 0) return false;
  let stagedParsed;
  try { stagedParsed = JSON.parse(stagedShow.stdout); } catch { return false; }
  const stagedShape = readTrustAnchorBootstrapShape(stagedParsed);
  if (!stagedShape || stagedShape.schemaVersion !== CRITICAL_HUMAN_PROOF_POLICY_V3 || stagedShape.anchorCount !== 1) return false; // staged must be v3 with EXACTLY one anchor

  if (!sameKindSet(headShape.requiredKinds, stagedShape.requiredKinds)) return false;
  if (!sameKindSet(headShape.waivedKindsSet, stagedShape.waivedKindsSet)) return false;

  return true;
}

/**
 * HANDOVER-SIZE COMPANION CHECK (NVA-B-HANDOVERPATH, 2026-09-01, backlog/items/
 * 2026-09-01-the-handover-size-guard-only-sees-one-of-two-write-paths.md; buffer/encoding fix
 * NVA-B-HANDOVERPATH-FIX, 2026-09-01, scratch/findings-registry-round-G.md F-1). Establishes a
 * git object's exact byte count by REV-SPEC (\`HEAD:<path>\` for the last commit, \`:<path>\` for
 * the staged index) WITHOUT ever reading its content: \`git cat-file -s <revspec>\` asks git
 * for the object's own recorded size and prints only that decimal number, never the object's
 * bytes -- so there is no content to decode, no encoding transform, and (since the printed
 * number is always a handful of bytes regardless of how large the object itself is) no way for
 * spawnSync's default 1 MiB stdout buffer to ever come into play. This replaces an earlier
 * version of this function that ran \`git show <revspec>\` and measured the returned STRING with
 * \`Buffer.byteLength\`: that both re-encoded non-UTF-8 content (an invalid byte sequence decodes
 * to U+FFFD and re-encodes at 3 bytes, inflating the measured size) and, for any object whose
 * content exceeded spawnSync's 1 MiB default buffer, failed outright -- HEAD is checked first by
 * \`handoverSizeFinding()\` below, so a handover file that had ever grown past 1 MiB before this
 * hook was installed made EVERY subsequent commit unmeasurable, including a shrink to one byte,
 * because the decrease check was never reached (confirmed via a corrected test in
 * pre-commit-hook-install.test.mjs; the buffer ceiling was proven with a direct probe: a
 * corrupted-but-present blob still fails \`cat-file -s\`, so the fail-closed branch below stays
 * reachable through a genuine unreadability, never through this file's own former buffer limit).
 * The object is simply ABSENT at that revspec (never committed yet, or staged for deletion) is
 * reported distinctly and callers treat it as zero bytes, never as a measurement failure.
 * \`present: true, ok: false\` is the one case that must fail the caller CLOSED: the object is
 * known to exist yet its size could not be established (a corrupted object store, for example),
 * exercised directly by a test that flips bytes in a loose object file so \`cat-file -e\` still
 * reports the object present while \`cat-file -s\` fails to inflate it.
 */
export function gitObjectBytes(projectRoot, revSpec) {
  const exists = git(["cat-file", "-e", revSpec], projectRoot);
  if (exists.status !== 0) return { present: false, ok: true, bytes: 0 };
  const size = git(["cat-file", "-s", revSpec], projectRoot);
  const trimmed = (size.stdout ?? "").trim();
  if (size.status !== 0 || !/^[0-9]+$/.test(trimmed)) return { present: true, ok: false, bytes: null };
  return { present: true, ok: true, bytes: Number(trimmed) };
}

/**
 * Closes the write-path gap backlog/items/2026-09-01-the-handover-size-guard-only-sees-
 * one-of-two-write-paths.md reports for \`guard-handover-size.mjs\` (a PreToolUse hook, blind
 * to a Bash-spawned Node script's own \`fs.writeFileSync\` against the handover file): the
 * SAME size-cap rule, re-evaluated at the commit boundary, where every write lane converges
 * regardless of which tool produced it. Mirrors that guard's own admission rule exactly --
 * \`currentBytes\` is the last-COMMITTED (HEAD) size, \`proposedBytes\` is the STAGED (index)
 * size about to become the new HEAD; a net decrease is always admitted regardless of the
 * absolute resulting size, so an over-cap file always stays repairable by shrinking it, from
 * either write lane. Returns \`measurable: false\` (never a silent allow) whenever either size
 * could not be established with confidence.
 */
export function handoverSizeFinding(projectRoot, relPath, maxBytes) {
  const current = gitObjectBytes(projectRoot, \`HEAD:\${relPath}\`);
  if (!current.ok) {
    return { measurable: false, detail: "the committed (HEAD) version of the handover file's size could not be established via \`git cat-file -s\`" };
  }
  const proposed = gitObjectBytes(projectRoot, \`:\${relPath}\`);
  if (!proposed.ok) {
    return { measurable: false, detail: "the staged (index) version of the handover file's size could not be established via \`git cat-file -s\`" };
  }
  if (proposed.bytes < current.bytes) return { measurable: true, blocked: false }; // net decrease -- always admitted
  if (proposed.bytes >= maxBytes) {
    return { measurable: true, blocked: true, currentBytes: current.bytes, proposedBytes: proposed.bytes, maxBytes };
  }
  return { measurable: true, blocked: false };
}

function block(lines) {
  process.stderr.write(
    [
      \`BLOCKED (agent-pipeline pre-commit hook): \${lines[0]}\`,
      ...lines.slice(1),
      "",
      "HUMAN OPERATOR ONLY: git itself provides operator-level ways to bypass hook enforcement for a human working directly, outside any agent session. An agent MUST NOT use any such bypass under any circumstance or instruction -- if this commit must proceed, stop and hand it to a human operator.",
    ].join("\\n") + "\\n",
  );
  process.exitCode = 1;
}

async function main() {
  const projectRoot = resolveProjectRoot();
  const commonDir = resolveGitCommonDir();
  if (!projectRoot || !commonDir) {
    block(["this repository's own root/common-dir could not be resolved via \`git rev-parse\` -- cannot evaluate protected-path enforcement."]);
    return;
  }

  const paths = stagedPaths(projectRoot);
  if (paths === null) {
    block(["the staged diff could not be enumerated via \`git diff --cached\` -- cannot evaluate protected-path enforcement."]);
    return;
  }
  if (paths.length === 0) return; // nothing staged (e.g. an --allow-empty commit) -- nothing to check

  let gateStrengthRuleFor;
  let loadProtectedTestPathRules;
  let protectedTestPathRuleFor;
  let defaultHasConsumedCapabilityForPath;
  let resolveHandoverConfig;
  try {
    ({ gateStrengthRuleFor } = await import(pathToFileURL(resolve(PLUGIN_HOOKS_DIR, "guard-gate-strength.mjs")).href));
    ({ loadProtectedTestPathRules, protectedTestPathRuleFor } = await import(pathToFileURL(resolve(PLUGIN_LIB_DIR, "protected-test-paths.mjs")).href));
    ({ defaultHasConsumedCapabilityForPath } = await import(pathToFileURL(resolve(PLUGIN_SCRIPTS_DIR, "check-protected-path-integrity.mjs")).href));
    ({ resolveHandoverConfig } = await import(pathToFileURL(resolve(PLUGIN_LIB_DIR, "handover-rotation.mjs")).href));
  } catch (error) {
    block([\`the pipeline's own protected-path rule modules could not be loaded from the installed plugin copy (\${error?.name ?? "Error"}) -- cannot evaluate protected-path enforcement.\`]);
    return;
  }

  let handoverConfig;
  try {
    handoverConfig = resolveHandoverConfig({ rootDir: projectRoot });
  } catch (error) {
    block([\`the handover-file configuration could not be resolved (\${error?.name ?? "Error"}) -- cannot evaluate the handover size cap, failing closed.\`]);
    return;
  }
  // AC-6 (NVA-B-HANDOVERPATH-FIX, F-2): matched by RESOLVED absolute path, mirroring
  // guard-handover-size.mjs's own \`resolve(root, filePath) === resolve(root, config.path)\`
  // comparison exactly -- not by raw string equality against handoverConfig.path, which
  // resolveHandoverConfig() never normalizes. \`paths\` entries are already git's own canonical,
  // repo-relative spelling (from \`git diff --cached --name-only -z\`), so resolving each against
  // projectRoot and comparing against the resolved calibration path catches a non-canonical but
  // still-valid calibration spelling (\`./docs/state.md\`, \`docs//state.md\`) the guard already
  // tolerates via its own \`resolve()\` call.
  const handoverAbs = resolve(projectRoot, handoverConfig.path);
  const matchedHandoverPath = paths.find((relPath) => resolve(projectRoot, relPath) === handoverAbs);
  if (matchedHandoverPath) {
    const handoverFinding = handoverSizeFinding(projectRoot, matchedHandoverPath, handoverConfig.maxBytes);
    if (!handoverFinding.measurable) {
      block([\`the handover file at \${handoverConfig.path} could not have its size measured at the commit boundary (\${handoverFinding.detail}) -- cannot evaluate the handover size cap, failing closed.\`]);
      return;
    }
    if (handoverFinding.blocked) {
      block([
        \`the handover file at \${handoverConfig.path} would be committed at or over its hard size cap and this commit is not a net decrease.\`,
        \`Current (HEAD) size: \${handoverFinding.currentBytes} bytes. Cap: \${handoverFinding.maxBytes} bytes. Staged size: \${handoverFinding.proposedBytes} bytes.\`,
        "Rotate closed content out of the handover file first (see handover-rotate.mjs), or commit a version that is itself smaller than the current HEAD version -- a net decrease is always admitted regardless of the resulting size.",
      ]);
      return;
    }
  }

  let testPathRules = [];
  try {
    ({ rules: testPathRules } = loadProtectedTestPathRules({ rootDir: projectRoot }));
  } catch { testPathRules = []; }

  const findings = [];
  for (const relPath of paths) {
    let rule = null;
    try { rule = gateStrengthRuleFor(relPath, projectRoot); } catch { rule = null; }
    if (!rule) {
      try { rule = protectedTestPathRuleFor(testPathRules, relPath); } catch { rule = null; }
    }
    if (!rule) continue;
    let consumed = false;
    try { consumed = defaultHasConsumedCapabilityForPath(projectRoot, relPath); } catch { consumed = false; }
    if (consumed) continue;
    let alreadyTracked = true;
    try { alreadyTracked = pathAlreadyTrackedInHistory(projectRoot, relPath); } catch { alreadyTracked = true; }
    if (!alreadyTracked) continue; // first appearance in git history -- exempt (PO decision, candidate (b))
    let bootstrapExempt = false;
    try { bootstrapExempt = isTrustAnchorBootstrapUpgrade(projectRoot, relPath); } catch { bootstrapExempt = false; }
    if (bootstrapExempt) continue; // trust-anchor-only v1/v2/v3(no-anchor) -> v3(one-anchor) upgrade (PO decision, Option A)
    findings.push({ path: relPath, id: rule.id, reason: rule.reason });
  }

  if (findings.length === 0) return;

  block([
    \`\${findings.length} staged path(s) are protected and carry no matching consumed human-guard-override capability:\`,
    ...findings.map((finding) => \`  - \${finding.id} \${finding.path}: \${finding.reason}\`),
    "Why: this is the git-level backstop for guard-testpath.mjs / guard-gate-strength.mjs -- it exists because a spawned process (a different interpreter, a shelled-out redirect) can write these paths without ever crossing a PreToolUse hook boundary; this commit boundary is the one such a process cannot walk around.",
  ]);
}

// Guarded like plugins/pipeline-core/lib/entrypoint.mjs's isDirectInvocation() (not imported
// here so this generated file stays standalone/self-contained): only runs main() when this
// exact file is the process entry point, so a test harness can \`import()\` it to reach its pure
// exported helpers without a live side effect of import alone.
function isDirectlyInvoked() {
  const argv1 = process.argv[1];
  if (!argv1) return false;
  try {
    return fileURLToPath(import.meta.url) === resolve(argv1);
  } catch {
    return false;
  }
}
if (isDirectlyInvoked()) {
  main().catch((error) => {
    block([\`this hook's own evaluation faulted before producing a verdict (\${error?.name ?? "Error"}).\`]);
  });
}
`;
}

/** Read-only: what an install would do, without writing anything. A hook actually present on
 * disk always wins over a decline record (checked first, below) -- a stale decline marker left
 * over from before an install, or from before a foreign hook was placed, must never suppress
 * reporting what is really there now. Byte-for-byte the same shape as pre-push-hook-install.mjs's
 * own `planInstall`. */
export function planInstall({ rootDir, pluginLibDir = DEFAULT_PLUGIN_LIB_DIR, pluginHooksDir = DEFAULT_PLUGIN_HOOKS_DIR, pluginScriptsDir = DEFAULT_PLUGIN_SCRIPTS_DIR } = {}) {
  const paths = resolveGitPaths(rootDir);
  if (!paths) return { status: "repository-unresolved" };
  const { commonDir, hookPath } = paths;
  const marker = readMarker(commonDir);
  if (existsSync(hookPath) && !marker) {
    return { status: "foreign-hook-present", hookPath };
  }
  if (existsSync(hookPath) && marker) {
    let current;
    try {
      current = readFileSync(hookPath, "utf8");
    } catch {
      return { status: "foreign-hook-present", hookPath };
    }
    if (sha256(current) !== marker.hookSha256) {
      return { status: "foreign-hook-present", hookPath, detail: "existing hook was modified after this installer wrote it" };
    }
    return { status: "ready-to-upgrade", hookPath, commonDir, pluginLibDir, pluginHooksDir, pluginScriptsDir };
  }
  const decline = readDeclineMarker(commonDir);
  if (decline) {
    return { status: "declined", hookPath, commonDir, pluginLibDir, pluginHooksDir, pluginScriptsDir, declinedAt: decline.declinedAt };
  }
  return { status: "ready", hookPath, commonDir, pluginLibDir, pluginHooksDir, pluginScriptsDir };
}

/** Read-only: whether a decline can be recorded (mirrors `planInstall`'s fail-closed root
 * resolution; declining never inspects hook content). */
export function planDecline({ rootDir } = {}) {
  const paths = resolveGitPaths(rootDir);
  if (!paths) return { status: "repository-unresolved" };
  return { status: "ready", commonDir: paths.commonDir };
}

/** Writes the decline marker only -- never touches the hook, its impl file, or the install
 * marker. Declining is always reversible: a later `applyInstall` call is governed entirely by
 * `planInstall`'s hook-presence checks above, which run before the decline check and are
 * therefore never blocked by a decline record. */
export function applyDecline({ rootDir } = {}) {
  const plan = planDecline({ rootDir });
  if (plan.status !== "ready") return plan;
  const { commonDir } = plan;
  const marker = {
    schema: DECLINE_MARKER_SCHEMA,
    declinedAt: new Date().toISOString(),
  };
  mkdirSync(join(commonDir, "agent-pipeline", "pre-commit-hook"), { recursive: true, mode: 0o700 });
  writeFileSync(declineMarkerPath(commonDir), `${JSON.stringify(marker, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  return { status: "declined", declinedAt: marker.declinedAt };
}

/** Writes the hook, its impl file, and the install marker. Refuses (never overwrites) a hook
 * this installer did not write -- see `planInstall` above for the exact check. */
export function applyInstall({ rootDir, pluginLibDir = DEFAULT_PLUGIN_LIB_DIR, pluginHooksDir = DEFAULT_PLUGIN_HOOKS_DIR, pluginScriptsDir = DEFAULT_PLUGIN_SCRIPTS_DIR } = {}) {
  const plan = planInstall({ rootDir, pluginLibDir, pluginHooksDir, pluginScriptsDir });
  if (plan.status === "repository-unresolved") return { status: "repository-unresolved" };
  if (plan.status === "foreign-hook-present") return { status: "refused-foreign-hook", hookPath: plan.hookPath, detail: plan.detail };

  const { hookPath, commonDir } = plan;
  const impl = implPath(commonDir);
  const implContent = renderImpl({ pluginLibDir, pluginHooksDir, pluginScriptsDir });
  const shimContent = renderShim(impl);

  mkdirSync(join(commonDir, "agent-pipeline", "pre-commit-hook"), { recursive: true, mode: 0o700 });
  writeFileSync(impl, implContent, { encoding: "utf8", mode: 0o600 });
  writeFileSync(hookPath, shimContent, { encoding: "utf8", mode: 0o700 });
  chmodSync(hookPath, 0o755);

  const marker = {
    schema: MARKER_SCHEMA,
    installerVersion: INSTALLER_VERSION,
    installedAt: new Date().toISOString(),
    hookPath,
    implPath: impl,
    pluginLibDir,
    pluginHooksDir,
    pluginScriptsDir,
    hookSha256: sha256(shimContent),
    implSha256: sha256(implContent),
  };
  writeFileSync(markerPath(commonDir), `${JSON.stringify(marker, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });

  return { status: "installed", hookPath, implPath: impl, markerPath: markerPath(commonDir) };
}

/** Read-only: whether removal can safely proceed. */
export function planRemoval({ rootDir } = {}) {
  const paths = resolveGitPaths(rootDir);
  if (!paths) return { status: "repository-unresolved" };
  const { commonDir, hookPath } = paths;
  const marker = readMarker(commonDir);
  if (!marker) return { status: "nothing-to-remove", hookPath };
  if (!existsSync(hookPath)) return { status: "already-absent", hookPath };
  let current;
  try {
    current = readFileSync(hookPath, "utf8");
  } catch {
    return { status: "unreadable-hook", hookPath };
  }
  if (sha256(current) !== marker.hookSha256) {
    return { status: "refused-modified-hook", hookPath, detail: "the installed hook was modified since installation; removal refused" };
  }
  return { status: "ready", hookPath, commonDir, marker };
}

/** Deletes exactly what THIS installer wrote (hook, impl, marker) -- never a foreign or
 * human-modified hook. See `planRemoval` above for the exact refusal conditions. */
export function applyRemoval({ rootDir } = {}) {
  const plan = planRemoval({ rootDir });
  if (plan.status !== "ready") return plan;
  const { commonDir, hookPath } = plan;
  unlinkSync(hookPath);
  try { unlinkSync(implPath(commonDir)); } catch { /* already absent -- fine */ }
  try { unlinkSync(markerPath(commonDir)); } catch { /* already absent -- fine */ }
  try { rmdirSync(join(commonDir, "agent-pipeline", "pre-commit-hook")); } catch { /* not empty or absent -- fine, never forced */ }
  return { status: "removed", hookPath };
}

// ---- CLI -----------------------------------------------------------------------------
if (isDirectInvocation(import.meta.url)) {
  const [verb] = process.argv.slice(2);
  const rootDir = process.cwd();
  if (verb === "--install") {
    const result = applyInstall({ rootDir });
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.status === "installed" ? 0 : 1);
  } else if (verb === "--remove") {
    const result = applyRemoval({ rootDir });
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.status === "removed" ? 0 : 1);
  } else if (verb === "--plan-install") {
    console.log(JSON.stringify(planInstall({ rootDir }), null, 2));
  } else if (verb === "--plan-remove") {
    console.log(JSON.stringify(planRemoval({ rootDir }), null, 2));
  } else if (verb === "--decline") {
    const result = applyDecline({ rootDir });
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.status === "declined" ? 0 : 1);
  } else {
    console.error("usage: pre-commit-hook-install.mjs --plan-install|--install|--plan-remove|--remove|--decline");
    process.exit(2);
  }
}
