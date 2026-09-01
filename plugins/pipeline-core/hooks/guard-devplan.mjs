#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * guard-devplan — PreToolUse guard enforcing the Dev-Plan-Gate for Edit|Write.
 *
 * Plugin: pipeline-core (Agent-Pipeline). AP1-P3 "DURIN". Canon: docs/operating-
 * model.md §3.2 Step 3b (PO gate: PRD approval — this hook is the deterministic
 * enforcement of that gate's "recorded" step).
 *
 * WHY THIS FILE EXISTS
 *   Until now, "did the PO approve the plan before implementation edits start" was an
 *   instruction (briefing prohibitions / process discipline), never a technical gate.
 *   This hook makes it deterministic: an Edit/Write against a non-exempt path, while a
 *   feature is active AND its plan is not yet approved, is blocked (or warned, per
 *   manifest gate mode) — mirroring guard-testpath.mjs's structure (exit protocol,
 *   path normalization, fail-open defaults) and reading gate config the same way
 *   guard-push.mjs does (plugins/pipeline-core/lib/manifest.mjs).
 *
 * SOURCES OF TRUTH (both OPTIONAL — this hook is opt-in end to end)
 *   - Manifest gate: `.claude/pipeline.yaml`, `gates.dev-plan` (`mode`: blocking|warn|
 *     off, `type`: human) — read via `plugins/pipeline-core/lib/manifest.mjs`.
 *   - State: `.claude/pipeline-state.json` (schema `pipeline.state.v0`), written ONLY
 *     by `harness/scripts/pipeline-state.mjs` — this hook is a READER, never a writer.
 *
 * EXIT SEMANTICS (shared with the rest of the guard family): 0 allow · 2 block
 * (stderr reason) · 1 allow + non-blocking WARN.
 *
 * FAIL-OPEN (exit 0, silent): no manifest at all · gate "dev-plan" absent · gate mode
 * "off" · no state file · state has no `activeFeature`. Every one of these means
 * "nothing to enforce yet" — never a paralysis-by-default trap (mirrors guard-
 * testpath.mjs's "NO CONFIG → NO-OP" philosophy).
 *
 * WARN (exit 1, non-blocking): the manifest YAML itself cannot even be parsed (genuine
 * syntax failure — `loadManifest()`'s "invalid" status with NO parsed `manifest`
 * object at all), or the state file exists but is not valid JSON. Both surface loudly
 * instead of silently either blocking or silently no-op'ing (QG-05 gate honesty).
 *
 * BLOCK/WARN (activeFeature exists AND planApproved !== true, path not exempt):
 * mode "blocking" → exit 2 naming the feature id + plan path; mode "warn" → exit 1
 * with the same message (never silently blocks in warn mode).
 *
 * EXEMPT PATHS (normalized: backslashes → forward slashes, matched case-insensitively,
 * PREFIX match — same normalization style as guard-testpath.mjs):
 *   - Defaults: `docs/`, `specs/`, `.claude/`, `backlog/`. The exact PRD/Spec
 *     authority is editable only while the lifecycle is `draft`; after submission
 *     (`awaiting-approval`) and after approval it remains immutable even though it is
 *     under an otherwise exempt prefix.
 *   - The active feature's own `activeFeature.planPath` while the lifecycle is
 *     `draft` (so the gate cannot block the design bytes it requires the author to
 *     prepare).
 *   - `gates.dev-plan.exemptPaths` (array of path-prefix strings) from the manifest,
 *     if present — project-specific additional exemptions.
 *   - The sanctioned close-artifact writer: exactly `HISTORY.md` (exact match, root
 *     file) and `telemetry/` (directory prefix) — the mandatory root-level close
 *     records, unconditionally exempt regardless of lifecycle phase, never a general
 *     product-file exemption (see CLOSE_ARTIFACT_EXACT_PATHS/CLOSE_ARTIFACT_PREFIXES
 *     below; backlog/items/2026-07-26-readonly-command-guard-classification.md).
 *
 * ABSOLUTE PATHS AND THE PROJECT ROOT (C1 fix, from a critic review):
 * Claude Code's write PreToolUse contract typically delivers the target path (read via
 * `lib/tool-write-target.mjs`: `file_path` for Edit/Write, `notebook_path` for NotebookEdit)
 * ABSOLUTE (e.g. `{{REPO_ROOT}}\docs\state.md`), which never starts with a relative
 * prefix like `docs/` — matching from character 0 against the exempt list above would
 * therefore never exempt anything, blocking even the plan file and docs/specs/backlog
 * themselves (contradicting this file's own contract). Before any prefix match, an
 * absolute `file_path` is resolved against the project root (`CLAUDE_PROJECT_DIR`, same
 * env var/cwd-fallback already used to locate the state file below — the hook's own
 * runtime contract guarantees this is set for real hook invocations) via
 * `path.relative()`, using the platform-native `node:path` (`path.isAbsolute`/
 * `path.relative` natively understand whichever absolute-path convention the HOST OS
 * uses — drive letters/backslashes/UNC on Windows dev machines, `/`-rooted paths on POSIX
 * CI runners — each correct for its own platform; this absolute-vs-relative + root
 * resolution step stays platform-native and unchanged). Relative inputs are matched
 * exactly as before (unchanged behavior).
 *   - **Absolute path OUTSIDE the project root** (the relative form still starts with
 *     `..` — an ancestor/sibling on the same drive — or is itself still absolute — a
 *     different drive letter, or a UNC path Windows cannot express relatively): this is
 *     not one of this project's implementation files. The gate ALLOWS it unconditionally
 *     (exit 0), before even touching the manifest/state — a deliberate scope boundary
 *     (the gate governs project files only; scratchpad/demo work outside the root must
 *     never be gated).
 *   - **Absolute path INSIDE the project root:** resolved to its project-relative form,
 *     then matched against the defaults/`planPath`/`exemptPaths` exactly like a native
 *     relative input — all three exemption sources therefore work for absolute inputs.
 *   - **Case sensitivity:** matched case-INsensitively throughout (`normalize()` lower-
 *     cases) — Windows filesystems are case-insensitive; same choice guard-testpath.mjs
 *     makes for the same reason.
 *
 * DEVIATION NOTE HISTORY (AP1-P3 "DURIN" briefing, superseded by AP1-P2-Fast-Follow
 * "NORI" — kept as a record, not because the gap still exists):
 * At DURIN dispatch time, `plugins/pipeline-core/scripts/pipeline-manifest.schema.json`
 * (sibling P2/GLOIN territory — NOT edited by DURIN, per that task's explicit
 * Prohibitions) did not yet declare `exemptPaths` as a recognized field on a gate
 * object (its per-gate schema had `additionalProperties: false` with only
 * `mode`/`type`/`approval`), so a manifest declaring `gates.dev-plan.exemptPaths` was
 * schema-INVALID. This hook read the parsed-but-invalid `manifest` object for its own
 * narrow gate slice anyway (safe because `exemptPaths` is purely ADDITIVE, never more
 * restrictive) rather than treating any schema violation as a hard WARN, and the gap
 * was reported as an open item for a small, additive schema follow-up.
 *
 * RESOLVED (NORI, follow-up to DURIN): `exemptPaths` (array of path-prefix strings) is
 * now a schema-valid OPTIONAL field on every gate object in
 * `pipeline-manifest.schema.json`. A manifest declaring `gates.dev-plan.exemptPaths`
 * is schema-VALID and reaches `loadManifest()` with `status: "ok"` like any other
 * well-formed manifest — the fail-open reading below (using the parsed `manifest`
 * object for this hook's own gate slice even on a schema-invalid manifest caused by
 * unrelated fields) is UNCHANGED and still applies for every other reason a manifest
 * can be schema-invalid; it is simply no longer needed to make `exemptPaths` itself
 * usable.
 *
 * TRAVERSAL HARDENING: a
 * RELATIVE `file_path` carrying a `..`/`.` traversal segment (e.g. `docs/../src/foo.ts`)
 * starts with the exempt prefix `docs/` as a raw string even though it resolves OUTSIDE
 * `docs/` once collapsed — matching the raw string against `DEFAULT_EXEMPT_PREFIXES`
 * would wrongly exempt it. The candidate path is therefore slashified (`\` -> `/`) and then
 * collapsed with `posix.normalize()` — deliberately POSIX semantics regardless of host OS,
 * NOT the platform-native `path.normalize()` — for every relative candidate path (both the
 * as-received relative form and the already-`path.relative()`-resolved absolute-input
 * form, where it is a defensive no-op since `relative()` normalizes internally) BEFORE the
 * case-insensitive slash normalization / prefix match below. Using platform-native
 * `normalize()` here was a real cross-platform bug: on win32 it treats `\` as a separator
 * and collapses a backslash-form traversal correctly, but on POSIX (e.g. Linux CI) `\` is
 * just an ordinary filename character to it, so `docs\..\src\foo.ts` passed through
 * un-collapsed and then wrongly matched the `docs/` prefix once slash-normalized — a
 * traversal-exemption bypass on POSIX hosts. Slashifying BEFORE a forced-POSIX collapse
 * fixes this identically on every host OS: `docs/../src/foo.ts` (and its backslash form)
 * are correctly treated as `src/foo.ts` (non-exempt, blocked), while a traversal that still
 * resolves back under an exempt prefix (e.g. `docs/../docs/state.md` -> `docs/state.md`)
 * is correctly still exempt.
 *
 * MECHANICS: stdin = `{ tool_input: { file_path } }` (PreToolUse contract). Wired via
 * plugins/pipeline-core/hooks/hooks.json in a LATER bundled wave (W-WIRE, TP-4) — this
 * delivery does not touch hooks.json; tests invoke this script directly via stdin pipe.
 *
 * VERIFY: node plugins/pipeline-core/hooks/guard-devplan.test.mjs
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, relative, isAbsolute, posix, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { loadManifest, gateConfig } from "../lib/manifest.mjs";
import {
  LEGACY_STATE,
  NEUTRAL_STATE,
  resolveProjectAuthorityPaths,
  validatePortablePipelineState,
} from "../lib/project-authority.mjs";
import { derivePlanLifecycle } from "../lib/plan-spec-state-v2.mjs";
// NVA-B-REBWIRE-1 (backlog: 2026-09-01-an-authorized-rebase-demands-a-fresh-po-signature-
// after-every-conflict.md): the dev-plan gate's ONE relief and its denial disclosure, owned by
// the policy module both of this gate's lanes already share, never re-decided here. See that
// module's "rebase authority" section for why it lives there and what it deliberately does not
// widen.
import {
  rebaseAuthorityAdmissionNotice,
  rebaseAuthorityDisclosure,
  resolveActiveRebaseAuthority,
} from "../lib/guard-devplan-policy.mjs";
import { rebaseAuthorityPermitsPath } from "../lib/rebase-authority.mjs";
import { writeTargetPath } from "../lib/tool-write-target.mjs";
import { dualEvaluateDecisionReference } from "../lib/decision-reference-dual-evaluation.mjs";

// ---- PHX-LEDGERAUTH: restored read-time ledger resolution -----------------------------
// Restored from 998a609:plugins/pipeline-core/hooks/guard-devplan.mjs (lines 138-145 and
// 147-212), verbatim. The 0.5.2 integration merge (75b8361) took the second parent's side
// for this file wholesale and the symbol was lost with it. Nothing on the merged base
// replaced it: `derivePlanLifecycle` is a pure function of the state object plus caller-
// supplied file digests (it takes no projectDir and its module performs no I/O), and its
// v3 compatibility branch accepts a `pipeline.plan-approval.v3` approval on SHAPE ALONE.
// The `priorInvalidationSha256` seal is a digest over data already in the same mutable
// file, so it closes replay-after-revocation, not forgery. Anyone able to write the state
// file could therefore mint plan-approval authority. Re-bound additively at the permit
// below; no existing binding is renamed, shadowed or weakened.
const GOVERNANCE_AUTHORITY_CLI = fileURLToPath(new URL("../scripts/governance-authority.mjs", import.meta.url));
const SHA256 = /^[a-f0-9]{64}$/u;
const OID = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u;

function exact(value, keys) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

/**
 * The Cyborg governance-authority CLI request/readback exchange, shared by
 * every ledger-backed resolution path below (v3's own `humanDecision` AND the
 * generalized H-AC-12 dual-evaluation path for legacy/v2/v4 approvals). Kept
 * as ONE spawnSync + readback-validation body rather than duplicated per
 * caller. `authority`/`packageId` bind the readback to the exact plan/spec
 * bytes and feature the reference is being asked to cover.
 */
function resolveHumanDecisionReadback(reference, projectDir, { packageId, planPath, planSha256, specPath, specSha256 }) {
  const request = {
    schema: "pipeline.governance-authority-request.v1",
    repositoryFingerprint: reference.checkpoint.repositoryFingerprint,
    decisionId: reference.decisionId,
    candidate: reference.candidate,
    checkpoint: reference.checkpoint,
    nowEpochMs: Date.now(),
  };
  const invoked = spawnSync(process.execPath, [
    GOVERNANCE_AUTHORITY_CLI,
    "--repo", projectDir,
    "--request-json", JSON.stringify(request),
  ], { encoding: "utf8", timeout: 5000, shell: false });
  if (invoked.status !== 0) return false;
  let readback;
  try { readback = JSON.parse(invoked.stdout); } catch { return false; }
  if (!exact(readback, ["schema", "granted", "decisionId", "decisionDigest", "scope", "singleUse"])
    || readback.schema !== "pipeline.governance-authority-readback.v1"
    || readback.granted !== true
    || readback.decisionId !== reference.decisionId
    || readback.decisionDigest !== reference.decisionDigest
    || readback.singleUse !== true
    || !exact(readback.scope, ["repositoryFingerprint", "candidate", "packageId", "action", "environment", "artifacts"])
    || readback.scope.repositoryFingerprint !== reference.checkpoint.repositoryFingerprint
    || JSON.stringify(readback.scope.candidate) !== JSON.stringify(reference.candidate)
    || readback.scope.packageId !== packageId
    || readback.scope.action !== "APPROVE_PLAN"
    || readback.scope.environment !== "local"
    || !Array.isArray(readback.scope.artifacts)) return false;
  const expected = [
    { path: planPath, sha256: planSha256 },
    { path: specPath, sha256: specSha256 },
  ];
  return expected.every((artifact) => readback.scope.artifacts.some((entry) => exact(entry, ["path", "sha256"])
    && entry.path === artifact.path && entry.sha256 === artifact.sha256));
}

/**
 * H-AC-12 migration boundary. A mutable `planApproved` projection is never
 * authority by itself: the exact v3 reference must still resolve from the
 * canonical human ledger at the current read. Cyborg's PO-proof verification
 * is deliberately owned by that authority CLI rather than this hook.
 */
function hasLedgerBackedPlanApproval(state, projectDir) {
  const approval = state?.planApproval;
  const feature = state?.activeFeature;
  if (state?.planApproved !== true
    || !exact(approval, ["schema", "approvedBy", "approvedAt", "specBoundBy", "specBoundAt", "poGateAuthority", "humanDecision"])
    || approval.schema !== "pipeline.plan-approval.v3"
    || !exact(feature, ["id", "planPath", "phase"])
    || !exact(approval.poGateAuthority, ["schema", "humanFacing", "sourceSha256", "runtimeSha256", "receiptSha256", "repositoryFingerprint", "planPath", "planSha256", "specPath", "specSha256"])
    || approval.poGateAuthority.planPath !== feature.planPath
    || !SHA256.test(approval.poGateAuthority.planSha256 ?? "")
    || !SHA256.test(approval.poGateAuthority.specSha256 ?? "")) return false;
  const reference = approval.humanDecision;
  if (!exact(reference, ["schema", "decisionId", "decisionDigest", "candidate", "checkpoint"])
    || reference.schema !== "pipeline.human-decision-reference.v1"
    || typeof reference.decisionId !== "string"
    || !SHA256.test(reference.decisionDigest ?? "")
    || !exact(reference.candidate, ["commit", "tree"])
    || !OID.test(reference.candidate.commit ?? "")
    || !OID.test(reference.candidate.tree ?? "")
    || !exact(reference.checkpoint, ["repositoryFingerprint", "streamId", "sequence", "eventDigest", "candidateCommit", "candidateTree"])
    || !SHA256.test(reference.checkpoint.repositoryFingerprint ?? "")
    || reference.checkpoint.candidateCommit !== reference.candidate.commit
    || reference.checkpoint.candidateTree !== reference.candidate.tree
    || reference.checkpoint.repositoryFingerprint !== approval.poGateAuthority.repositoryFingerprint) return false;
  return resolveHumanDecisionReadback(reference, projectDir, {
    packageId: feature.id,
    planPath: approval.poGateAuthority.planPath,
    planSha256: approval.poGateAuthority.planSha256,
    specPath: approval.poGateAuthority.specPath,
    specSha256: approval.poGateAuthority.specSha256,
  });
}

/**
 * H-AC-12, generalized to every legacy/v2/v4 plan approval that is NOT
 * `pipeline.plan-approval.v3` (the schema `hasLedgerBackedPlanApproval` above
 * already covers). Before this dispatch, this branch was a bare skip: any
 * schema other than v3 exited allow with NO second evaluation at all. Now it
 * dual-evaluates: the "old mechanism" verdict is the already-true
 * `lifecycle.ok` structural verdict this function is only called under, and
 * the "new" reader is an OPTIONAL, top-level `state.planApprovalDecisionReference`
 * (schema `pipeline.human-decision-reference.v1`, reused verbatim -- same
 * shape v3's own `humanDecision` field already carries) -- independent of
 * `planApproval` itself, so it does not require touching the exact-key
 * schema validators in `lib/plan-spec-state-v2.mjs` (out of this dispatch's
 * scope) to let a non-v3 approval carry one. No writer populates this field
 * yet (`harness/scripts/pipeline-state.mjs` is out of scope for this
 * dispatch); it is deliberately additive and forward-compatible: a reader
 * ready to dual-evaluate the moment a reference appears, ahead of any writer
 * change. A BARE legacy approval (`approvedBy`/`approvedAt` only, no
 * `poGateAuthority` at all -- the sole pre-v2 compatibility shape) carries no
 * planPath/specSha256 pair to bind a reference to; there is nothing to
 * dual-evaluate against, so it keeps exactly its current single-evaluation
 * standing, unchanged.
 */
function hasGeneralizedLedgerBackedPlanApproval(state, projectDir) {
  const approval = state?.planApproval;
  const feature = state?.activeFeature;
  const authority = approval?.poGateAuthority;
  const hasAuthority = authority !== null && typeof authority === "object" && !Array.isArray(authority)
    && typeof authority.planPath === "string" && SHA256.test(authority.planSha256 ?? "")
    && typeof authority.specPath === "string" && SHA256.test(authority.specSha256 ?? "")
    && SHA256.test(authority.repositoryFingerprint ?? "");
  const reference = state?.planApprovalDecisionReference;
  const evaluation = dualEvaluateDecisionReference({
    legacyOk: true, // this function is only reached once lifecycle.ok/status==="implementing" already hold
    reference: hasAuthority ? reference : undefined,
    resolveReference: (ref) => ref.checkpoint.repositoryFingerprint === authority.repositoryFingerprint
      && resolveHumanDecisionReadback(ref, projectDir, {
        packageId: feature.id,
        planPath: authority.planPath,
        planSha256: authority.planSha256,
        specPath: authority.specPath,
        specSha256: authority.specSha256,
      }),
  });
  return evaluation.ok;
}

/** The one schema whose approval carries a ledger reference that must still resolve. */
const LEDGER_FIRST_APPROVAL_SCHEMA = "pipeline.plan-approval.v3";

const DEFAULT_EXEMPT_PREFIXES = ["docs/", "specs/", ".claude/", "backlog/"];

// ---- sanctioned close-artifact writer (root-level History/telemetry close records) -----
// The mandatory root-level History (`HISTORY.md`) and telemetry (`telemetry/`) close
// records must be writable before plan approval without exempting any actual product
// file (backlog/items/2026-07-26-readonly-command-guard-classification.md;
// specs/sprint-phoenix-epic/RECOVERY.md R-02: this gate previously classified these
// mandatory closeout writes as "implementation" while the plan correctly stayed
// unapproved -- a false-positive deadlock, not a security gap). This is a closed,
// non-implementation classification -- exactly these two artifacts, kept deliberately
// separate from DEFAULT_EXEMPT_PREFIXES's directory-prefix semantics because HISTORY.md
// is a single root FILE: an exact match only, never a prefix match, so an unrelated file
// merely sharing the "history.md" string prefix (e.g. a hypothetical "HISTORY.md.bak")
// is NOT exempted. `telemetry/` is a directory prefix, matched the same way the
// DEFAULT_EXEMPT_PREFIXES entries are.
const CLOSE_ARTIFACT_EXACT_PATHS = ["history.md"];
const CLOSE_ARTIFACT_PREFIXES = ["telemetry/"];

function isSanctionedCloseArtifact(normalizedCandidatePath) {
  return CLOSE_ARTIFACT_EXACT_PATHS.includes(normalizedCandidatePath)
    || CLOSE_ARTIFACT_PREFIXES.some((prefix) => normalizedCandidatePath.startsWith(prefix));
}

/**
 * NVA-B-REBWIRE-1 / Requirement 5: every refusal this hook emits while an authorized rebase is
 * in progress names the route forward — the current conflict surface, the exact continuation in
 * prose, and a NON-EMPTY `pipeline.guard-retry-actions.v1` envelope of read-only diagnostics.
 * Attached here, at the one place every exit-2 path funnels through, rather than at each verdict
 * site: a denial this hook grows later inherits the disclosure instead of silently reintroducing
 * the stranding this item was filed for. Deliberately NOT a relief — attaching text cannot turn
 * a refusal into an admission, so the stricter neutral-State portability refusal below keeps
 * refusing and merely explains itself.
 */
function emit(code, lines) {
  let disclosure = "";
  try {
    if (code === 2) {
      const active = resolveActiveRebaseAuthority(projectDir);
      if (active !== null) disclosure = rebaseAuthorityDisclosure(active);
    }
  } catch {
    disclosure = ""; // an advisory block must never change the verdict it annotates
  }
  process.stderr.write(lines.filter(Boolean).join("\n") + "\n" + disclosure);
  process.exit(code);
}

function normalize(p) {
  return String(p ?? "").replace(/\\/g, "/").toLowerCase();
}

// ---- read tool input (fail-open) --------------------------------------------------
let filePath = "";
try {
  const input = JSON.parse(readFileSync(0, "utf8"));
  filePath = writeTargetPath(input?.tool_input, String(input?.tool_name ?? ""));
} catch {
  process.exit(0); // fail-open: guard is a safety net, not a prison
}
if (!filePath) process.exit(0);

const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();

// ---- resolve absolute file_path against the project root (C1 fix) ----------------
// See header "ABSOLUTE PATHS AND THE PROJECT ROOT" for the full rationale.
let relPath = filePath;
if (isAbsolute(filePath)) {
  const rel = relative(projectDir, filePath);
  const relSlashes = rel.replace(/\\/g, "/");
  const outsideRoot = rel === ".." || relSlashes.startsWith("../") || isAbsolute(rel);
  if (outsideRoot) process.exit(0); // not this project's file -- allow unconditionally
  relPath = rel;
}
// Collapse ".."/"." traversal segments BEFORE the prefix match (see header "TRAVERSAL
// HARDENING"). No-op for a path already free of traversal segments. Slashify backslashes
// FIRST, then collapse with POSIX semantics explicitly -- platform-native `path.normalize`
// only treats "\" as a separator on win32; on POSIX hosts (e.g. Linux CI) a literal "\"
// in the input is just an ordinary filename character to it, so a backslash-form traversal
// like "docs\\..\\src\\foo.ts" would pass through UNCOLLAPSED and then wrongly match the
// "docs/" exempt prefix once the later case-insensitive slash normalization runs. Using
// `posix.normalize()` on an already-slashified string collapses "docs/../src/foo.ts" the
// same way on every host OS.
relPath = posix.normalize(relPath.replace(/\\/g, "/"));
const normalizedPath = normalize(relPath);

// ---- scratch/: UNCONDITIONAL allow, before any gate evaluation ---------------------
// Mirrors lib/guard-devplan-policy.mjs's devPlanGateVerdict() (the source of truth the
// shell lane -- GUARD-DEVPLAN-SHELL -- calls directly): scratch/ is the Pipeline's own
// shipped scratch location and must never be gated, not even by the neutral-State
// private-cleanup-identity refusal or ledger-authority resolution below (VFX-GUARDS
// reconciliation -- this hook's PHX-restored ledger-authority/close-artifact logic ran
// its checks before scratch/ was ever considered, diverging from the lib the shell lane
// still uses).
if (normalizedPath.startsWith("scratch/")) process.exit(0);

// ---- manifest: gate config (fail-open on absent, WARN on genuine YAML failure) -----
const manifestResult = loadManifest(projectDir);
if (manifestResult.status === "absent") process.exit(0);
if (manifestResult.status === "invalid" && manifestResult.manifest === undefined) {
  // Genuine YAML syntax failure -- the manifest could not even be parsed into a
  // structure, so there is nothing to read a gate config off. See file header WARN.
  const reason = manifestResult.errors?.[0]?.reason ?? "YAML error";
  emit(1, [
    `[guard-devplan] WARN: .claude/pipeline.yaml is not readable (${reason}).`,
    `Dev-Plan gate is being skipped (fail-open) -- please repair the manifest file.`,
  ]);
}
// status "ok", OR "invalid" with a structurally parsed manifest (schema/semantic
// errors elsewhere -- e.g. an as-yet-unschematized exemptPaths field, see DEVIATION
// NOTE above): still usable for this hook's own gate slice.
const manifest = manifestResult.manifest;
const gate = gateConfig(manifest, "dev-plan");
if (!gate || gate.mode === "off") process.exit(0);

// ---- state: activeFeature / planApproved (fail-open on absent, WARN on malformed) --
const projectAuthority = resolveProjectAuthorityPaths({ rootDir: projectDir });
const statePath = join(
  projectDir,
  projectAuthority.status === "ready"
    ? projectAuthority.state
    : (existsSync(join(projectDir, NEUTRAL_STATE)) ? NEUTRAL_STATE : LEGACY_STATE),
);
let stateRaw;
try {
  stateRaw = readFileSync(statePath, "utf8");
} catch {
  process.exit(0); // no state file at all -- fail-open
}
let state;
try {
  state = JSON.parse(stateRaw);
} catch (e) {
  emit(1, [
    `[guard-devplan] WARN: ${statePath} contains invalid JSON (${e.message}).`,
    `Dev-Plan gate is being skipped (fail-open) -- please repair the state file (rewrite only via ` +
      `harness/scripts/pipeline-state.mjs, never by hand).`,
  ]);
}

const activeFeature = state && typeof state === "object" ? state.activeFeature : undefined;
if (!activeFeature || typeof activeFeature !== "object" || typeof activeFeature.id !== "string" || activeFeature.id === "") {
  process.exit(0); // no active feature -- nothing to enforce
}

if (statePath === join(projectDir, NEUTRAL_STATE)) {
  const portability = validatePortablePipelineState(state);
  if (!portability.ok) {
    emit(gate.mode === "warn" ? 1 : 2, [
      `[guard-devplan] ${gate.mode === "warn" ? "WARN" : "BLOCKED"}: neutral State contains private cleanup identity (${portability.code}).`,
      "Repair through the sanctioned cleanup recovery transaction; direct State edits are not authority.",
    ]);
  }
}

function fileSha256(path) {
  try { return createHash("sha256").update(readFileSync(resolve(projectDir, path))).digest("hex"); }
  catch { return null; }
}

const submitted = state.planSubmission;
const approvalAuthority = state.planApproval?.poGateAuthority;
const planPath = typeof submitted?.planPath === "string"
  ? submitted.planPath
  : approvalAuthority?.planPath;
const specPath = typeof submitted?.specPath === "string"
  ? submitted.specPath
  : approvalAuthority?.specPath;
const lifecycle = derivePlanLifecycle(state, {
  ...(typeof planPath === "string" ? { planSha256: fileSha256(planPath) } : {}),
  ...(typeof specPath === "string" ? { specSha256: fileSha256(specPath) } : {}),
});
// PHX-LEDGERAUTH: AND-ed onto the existing permit, never a second permit path. A v3
// approval is ledger-first by construction, so the stored human-decision reference must
// still resolve from the canonical ledger at THIS read before the lifecycle verdict is
// honoured. H-AC-12 (narrowed scope, see hasGeneralizedLedgerBackedPlanApproval's own
// docstring above): every other schema now ALSO runs through the shared dual-evaluation
// primitive -- trusting the old structural verdict when no ledger reference is present
// (unchanged standing), but failing closed on disagreement the moment one is.
let ledgerAuthorityUnresolved = false;
if (lifecycle.status === "implementing" && lifecycle.ok && lifecycle.nextAction === null) {
  const resolved = state.planApproval?.schema === LEDGER_FIRST_APPROVAL_SCHEMA
    ? hasLedgerBackedPlanApproval(state, projectDir)
    : hasGeneralizedLedgerBackedPlanApproval(state, projectDir);
  if (resolved) {
    process.exit(0);
  }
  ledgerAuthorityUnresolved = true;
}

// ---- exempt paths -------------------------------------------------------------------
const exemptPrefixes = [...DEFAULT_EXEMPT_PREFIXES];
if (lifecycle.status === "draft"
  && typeof activeFeature.planPath === "string"
  && activeFeature.planPath !== "") {
  exemptPrefixes.push(activeFeature.planPath);
}
if (Array.isArray(gate.exemptPaths)) {
  for (const p of gate.exemptPaths) if (typeof p === "string" && p !== "") exemptPrefixes.push(p);
}

const authoritativePaths = [planPath, specPath]
  .filter((path) => typeof path === "string")
  .map(normalize);
const touchesAuthority = authoritativePaths.some((path) => normalizedPath === path);
const isDraftAuthority = lifecycle.status === "draft" && touchesAuthority;
const isExempt = isDraftAuthority
  || (!touchesAuthority
    && (exemptPrefixes.some((prefix) => normalizedPath.startsWith(normalize(prefix)))
      || isSanctionedCloseArtifact(normalizedPath)));
if (isExempt) process.exit(0);

// ---- rebase authority: the ONE relief, and it is narrower than the gate it relieves -----
// NVA-B-REBWIRE-1. Consulted here and nowhere earlier, deliberately: this is the last line
// before a refusal, so the authority can only ever turn a BLOCK into an ALLOW and can never
// turn an allow into anything. It admits exactly the paths the resolver reports as currently
// conflicted in a genuine rebase whose `orig-head` is validly approved and in implementation
// (`rebaseAuthorityPermitsPath`, deny-by-default, no options bag) -- so an implementation file
// untouched by a conflict stays blocked while a rebase is active somewhere, which is the
// narrowness Requirement 2 demands and negative case 1 pins. The refusal path needs no code
// here: emit() already attaches the surface, the exact continuation and the retry actions to
// every exit-2 this hook produces.
const activeRebase = resolveActiveRebaseAuthority(projectDir);
if (activeRebase !== null && rebaseAuthorityPermitsPath(activeRebase, filePath)) {
  emit(0, [rebaseAuthorityAdmissionNotice(activeRebase, "write")]);
}

// ---- verdict --------------------------------------------------------------------------
const lifecycleReason = ledgerAuthorityUnresolved
  ? "The recorded plan approval has an associated human-decision reference (H-AC-12 "
    + "migration boundary -- either the v3 approval's own ledger-first binding, or a "
    + "top-level planApprovalDecisionReference dual-evaluated alongside a legacy/v2/v4 "
    + "approval) that must still resolve from the canonical human ledger at THIS read, and "
    + "it did not. A mutable planApproved projection is never authority by itself. "
    + "Re-record it: node harness/scripts/pipeline-state.mjs approve-plan --by <name> "
    + "--human-decision-file <repo-relative-reference>."
  : lifecycle.nextAction === "reopen-design"
  ? "Current Plan/Spec authority is stale or closed; run `reopen-design --by <name>` before editing."
  : lifecycle.status === "awaiting-approval"
    ? "The submitted Plan/Spec is immutable until approval or a sanctioned `reopen-design --by <name>`."
    : lifecycle.status === "approved"
      ? "The approved design must enter implementation through `set-phase --phase implementation`, or be reopened before design edits."
      : "The feature is still in draft design and has no implementation authority.";
const message = [
  `BLOCKED (guard-devplan, plugin pipeline-core): Feature "${activeFeature.id}" lifecycle is "${lifecycle.status ?? "invalid"}".`,
  `Plan: ${typeof activeFeature.planPath === "string" ? activeFeature.planPath : "(no planPath recorded in state)"}`,
  `File: ${filePath}`,
  `Why: ${lifecycleReason}`,
];

if (gate.mode === "warn") emit(1, message);
emit(2, message); // mode "blocking" (or any unrecognized non-"off" value -- errs safe)
