#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * security-scan.mjs -- security-scan phase runner, AP1-P4 "FUNDIN".
 *
 * NEW FILE, NOT WIRED into harness/scripts/verify.mjs (TP-3 -- explicit scope boundary of
 * this delivery; a later work package, "W-WIRE", adds the call site + the accompanying gate
 * hook). This script is a standalone, independently invocable phase runner exactly like
 * verify.mjs is for the guard-family test set, following the same evidence-artifact family
 * pattern (`pipeline.verify-evidence.v0` is the sibling schema this one,
 * `pipeline.security-evidence.v0`, was modeled on).
 *
 * MANDATORY DEDUP STEP (briefing step 1): grepped the whole repo for
 * security-scan/security-adapters/gitleaks/osv-scanner/semgrep/license-check precursors --
 * found none (only this manifest's own `security:` config block, the real
 * `.claude/pipeline.yaml`, and forward-looking research/planning prose reference these tool
 * names). `guardrails/security.md` SEC-01's Verification line already marks "whether a
 * deterministic secret scanner joins the verify chain" as OPEN (Phase 4) -- this delivery is
 * exactly that scanner, built but deliberately not yet wired (P7 forbids editing that file;
 * the wiring itself is W-WIRE's job, not this one's).
 *
 * CONFIG SOURCES (manifest read via plugins/pipeline-core/lib/manifest.mjs's
 * loadManifestSafe()/gateConfig() -- never throws, `null` on any absent/invalid manifest,
 * all defaults below then apply):
 *   - `security.scanners.<tool>.enabled` (tool keys: "gitleaks", "osv-scanner", "semgrep",
 *     "license-check") -- default true for ALL FOUR when the manifest is absent or a given
 *     tool's `enabled` field is unset (briefing: "absent manifest -> defaults:
 *     gitleaks+osv-scanner+license-check enabled, semgrep enabled").
 *   - `security.scanners.semgrep.rules_dir` -- resolved to `<rootDir>/<rules_dir>`; absent
 *     -> semgrep adapter falls back to "auto" itself.
 *   - license-check's declared `third-party-licenses.json` is ALWAYS `<rootDir>/
 *     third-party-licenses.json` (repo root, per the briefing's "repo root or path from
 *     config" clause) -- a manifest-driven override was considered (mirroring
 *     `semgrep.rules_dir`'s pattern) and DELIBERATELY DROPPED: the manifest schema's
 *     `security.scanners.<key>` value schema is `additionalProperties: false` with only
 *     `enabled`/`rules_dir` declared (plugins/pipeline-core/scripts/pipeline-manifest.schema.json)
 *     -- adding an undeclared `declared_path` key there would make schema-lite reject the
 *     WHOLE manifest as invalid, and `loadManifestSafe` silently collapses ANY invalid
 *     manifest to `null` (same as absent), which would silently revert every OTHER
 *     manifest-driven setting (gate mode, thresholds, rules_dir, ...) to its default too --
 *     a landmine, not a feature. Flagged as an open item (schema is sibling territory, not
 *     editable by this delivery) rather than implemented; repo-root is sufficient for every
 *     DoD case class.
 *   - `security.thresholds.block_on` -- default `["critical", "high"]`.
 *   - `governance.policies_path` -- default `"governance/examples/policies"`; used to build
 *     the license-check allowlist path `<rootDir>/<policies_path>/license-allowlist.json`.
 *   - gate mode via `gateConfig(manifest, "security")?.mode` -- default `"blocking"`.
 *
 * EXIT-CODE POLICY (briefing, verbatim): any adapter status ERROR -> blocking-class
 * (fail-closed: an adapter that crashed is worse than one with findings, never silently
 * treated as clean). A finding whose severity is in `thresholds.block_on` -> blocking-class.
 * SKIPPED contributes no findings but IS recorded in evidence (QG-05: skipped != pass).
 * blocking-class: mode "blocking" -> exit 2, mode "warn" -> exit 1, mode "off" -> exit 0
 * (the "off" branch is this script's own defensive completion of the 3-value gates.mode
 * enum -- gates.security in THIS repo's manifest is "blocking" and the briefing's DoD only
 * exercises "blocking"/"warn" explicitly; "off" is handled the safe, documented way rather
 * than left to throw or silently fall through to the blocking branch). No blocking-class at
 * all -> exit 0 regardless of mode.
 *
 * EVIDENCE: `<rootDir>/evidence/security-latest.json`, schema
 * `pipeline.security-evidence.v0`, written unconditionally before this script exits (even on
 * a blocking/error verdict -- "gate honesty", the same QG-05/QG-03 spirit verify.mjs's
 * evidence file follows). `project` field: read from `<rootDir>/.claude/pipeline.json`'s
 * own `project` field if that file exists and parses (mirrors the calibration file's
 * existing convention, e.g. this repo's own `"project": "agent-pipeline"`); falls back to
 * `path.basename(rootDir)` if that file is absent/malformed -- this script is meant to run
 * unmodified across every pipeline-bound project, not just this repo.
 *
 * CLI: `node harness/scripts/security-scan.mjs [--root <dir>] [--timeout-ms N]`.
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { basename, join, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { loadManifestSafe, gateConfig } from "../../plugins/pipeline-core/lib/manifest.mjs";
import { resolveProjectAuthorityPaths } from "../../plugins/pipeline-core/lib/project-authority.mjs";
import { assessTrustedExecutablePath, resolveTrustedSystemExecutable } from "./security-readiness/tool-identity.mjs";

import * as gitleaksAdapter from "./security-adapters/gitleaks.mjs";
import * as osvScannerAdapter from "./security-adapters/osv-scanner.mjs";
import * as semgrepAdapter from "./security-adapters/semgrep.mjs";
import * as licenseCheckAdapter from "./security-adapters/license-check.mjs";

// CYB-2E -- additive `pipeline.security-evidence.v2` policy-complete emission. Import-only:
// none of these modules is edited by this task; every one is a pure, side-effect-free library.
import {
  evaluateAllCapabilities,
  aggregateVerdict,
  projectRunOutcomeToControlResult,
  validateSecurityEvidenceV2,
  SECURITY_EVIDENCE_V2_SCHEMA,
  FINDING_SEVERITIES,
} from "../../plugins/pipeline-core/lib/security-evidence-evaluator.mjs";
import { buildCapabilityPlan } from "../../plugins/pipeline-core/lib/security-capability-plan-builder.mjs";
import { resolveApplicableControls } from "../../plugins/pipeline-core/lib/security-policy-resolver.mjs";

const DEFAULT_TIMEOUT_MS = 60000;
const PREFLIGHT_TIMEOUT_MS = 5000;
const DEFAULT_BLOCK_ON = ["critical", "high"];
const DEFAULT_GOVERNANCE_POLICIES_PATH = "governance/examples/policies";
const DEFAULT_GATE_MODE = "blocking";

// Fixed run order; every key here must match the manifest's security.scanners.<key> key.
const SCANNER_DEFS = [
  { key: "gitleaks", adapter: gitleaksAdapter },
  { key: "osv-scanner", adapter: osvScannerAdapter },
  { key: "semgrep", adapter: semgrepAdapter },
  { key: "license-check", adapter: licenseCheckAdapter },
];

const DEFAULT_ENABLED = Object.freeze({
  gitleaks: true,
  "osv-scanner": true,
  semgrep: true,
  "license-check": true,
});

// ---------------------------------------------------------------------------------------------
// Config derivation from the (possibly null) manifest object.
// ---------------------------------------------------------------------------------------------

function isScannerEnabled(manifest, key) {
  const configured = manifest?.security?.scanners?.[key]?.enabled;
  return configured ?? DEFAULT_ENABLED[key];
}

function resolveBlockOn(manifest) {
  const configured = manifest?.security?.thresholds?.block_on;
  return Array.isArray(configured) ? configured : DEFAULT_BLOCK_ON;
}

function resolveGateMode(manifest) {
  return gateConfig(manifest, "security")?.mode ?? DEFAULT_GATE_MODE;
}

function resolveGovernancePoliciesPath(manifest) {
  const configured = manifest?.governance?.policies_path;
  return typeof configured === "string" ? configured : DEFAULT_GOVERNANCE_POLICIES_PATH;
}

/**
 * Resolves `relPath` against `baseDir` and confirms the result stays within `baseDir` itself or a
 * descendant of it (N3, Critic follow-up finding, CYB-2I-1R3): a manifest-supplied relative path
 * (e.g. `security.scanners.semgrep.rules_dir`, sourced from the CANDIDATE's own, potentially
 * untrusted manifest -- the same untrusted-manifest config surface N1/CYB-2I-1R2 already
 * established for this codebase) must never be allowed to escape the scan root via a
 * `../../etc`-style traversal value. Pure string/path resolution only -- no filesystem access, no
 * `realpath`/symlink following needed: `baseDir` is already a fixed absolute root this process
 * controls at this point in the call chain, and `relPath` is a pre-execution manifest string, not
 * something a symlink swap could retarget after the fact. Comparison is case-folded on win32
 * (NTFS/exFAT path comparison is case-insensitive there; POSIX stays case-sensitive) and anchored
 * on `path.sep` so a sibling directory sharing a name prefix (e.g. a real `<rootDir>-evil`
 * directory) is never mistaken for a descendant of `rootDir`. Returns the resolved absolute path
 * when contained, or `null` on an escape.
 */
function resolveContainedPath(baseDir, relPath) {
  const baseResolved = resolve(baseDir);
  const candidateResolved = resolve(baseDir, relPath);
  const baseKey = process.platform === "win32" ? baseResolved.toLowerCase() : baseResolved;
  const candidateKey = process.platform === "win32" ? candidateResolved.toLowerCase() : candidateResolved;
  const withinBase = candidateKey === baseKey || candidateKey.startsWith(baseKey + sep);
  return withinBase ? candidateResolved : null;
}

/**
 * Builds the per-adapter `config` object for one scanner key (paths already absolute). A
 * `configViolation` field (N3) marks a manifest-derived value that failed a containment check --
 * the caller must treat this as a fail-closed adapter-level ERROR (see the runner loop below)
 * rather than passing the rejected value through, or silently falling back to the adapter's own
 * default: an out-of-root path supplied by the (potentially untrusted) candidate manifest is
 * itself suspicious and this codebase's existing convention is to surface a config/environment
 * problem loudly (mirrors the `candidate_snapshot`/`execution_environment` pre-adapter ERROR
 * entries already produced earlier in this same runner loop for other config/environment-shape
 * problems -- see `runSecurityScan`'s own header/EXIT-CODE POLICY note: "never silently treated
 * as clean") rather than quietly substituting "auto" and continuing as if nothing happened.
 */
function buildAdapterConfig(key, { rootDir, manifest, policiesPathAbs }) {
  if (key === "semgrep") {
    const rulesDirRel = manifest?.security?.scanners?.semgrep?.rules_dir;
    if (typeof rulesDirRel !== "string") return { rulesDir: undefined };
    const contained = resolveContainedPath(rootDir, rulesDirRel);
    if (contained === null) {
      return {
        rulesDir: undefined,
        configViolation: `security.scanners.semgrep.rules_dir ("${rulesDirRel}") resolves outside rootDir; refusing to pass an out-of-root path to the semgrep adapter`,
      };
    }
    return { rulesDir: contained };
  }
  if (key === "license-check") {
    // No manifest-driven override for declaredPath -- see header comment for why (schema
    // has no slot for it without risking the whole manifest collapsing to invalid/null).
    return {
      allowlistPath: join(policiesPathAbs, "license-allowlist.json"),
      declaredPath: join(rootDir, "third-party-licenses.json"),
    };
  }
  return {};
}

/** Best-effort `project` name from the coherent authority layer, else dir basename. */
function resolveProjectName(rootDir, authority) {
  try {
    if (authority.status !== "ready") return basename(rootDir);
    const raw = readFileSync(join(rootDir, authority.calibration), "utf8");
    const parsed = JSON.parse(raw);
    if (typeof parsed?.project === "string" && parsed.project.trim() !== "") return parsed.project;
  } catch {
    // absent/malformed calibration file -- fall through to the basename default
  }
  return basename(rootDir);
}

function resolveCommit(rootDir) {
  try {
    const res = spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf8", cwd: rootDir });
    if (res.status === 0) return res.stdout.trim();
  } catch {
    // git missing from PATH: evidence still written, commit stays "unknown"
  }
  return "unknown";
}

function gitText(rootDir, args) {
  try {
    const result = spawnSync("git", args, { encoding: "buffer", cwd: rootDir });
    return result.status === 0 ? result.stdout : null;
  } catch { return null; }
}

function gitResult(rootDir, args) {
  try {
    return spawnSync("git", args, { encoding: "utf8", cwd: rootDir, timeout: 15000, shell: false });
  } catch (error) {
    return { status: null, stdout: "", stderr: "", error };
  }
}

function candidateUnavailable(reason) {
  return {
    status: "unavailable", commit: null, tree: null, inputSha256: null,
    repositorySha256: null, inventory: null, reason,
  };
}

function normalizedPathKey(path) {
  return path.normalize("NFKC").toLocaleLowerCase("en-US");
}

function inspectInventory(bytes) {
  const entries = bytes.toString("utf8").split("\0").filter(Boolean);
  const seen = new Set();
  for (const entry of entries) {
    const match = /^(\d+) (?:blob|commit) [0-9a-f]{40,64}\t(.+)$/u.exec(entry);
    if (!match) return { ok: false, reason: "inventory-malformed" };
    const [, mode, path] = match;
    if (mode === "120000") return { ok: false, reason: "symlink-input-unsupported" };
    if (mode === "160000") return { ok: false, reason: "submodule-input-unsupported" };
    const key = normalizedPathKey(path);
    if (seen.has(key)) return { ok: false, reason: "path-alias-ambiguous" };
    seen.add(key);
  }
  return { ok: true, entries: entries.length };
}

/**
 * Bind a scan to the exact Git tree and tracked-input inventory visible before
 * and after scanner execution. A missing or dirty Git materialization is typed
 * uncertainty, never a clean security subject.
 */
function observeCandidate(rootDir) {
  const commit = gitText(rootDir, ["rev-parse", "HEAD"]);
  const tree = gitText(rootDir, ["rev-parse", "HEAD^{tree}"]);
  const status = gitText(rootDir, ["status", "--porcelain=v1", "--untracked-files=all"]);
  const inventory = gitText(rootDir, ["ls-tree", "-r", "-z", "--full-tree", "HEAD"]);
  if (!commit || !tree || !status || !inventory) return candidateUnavailable("git-identity-unavailable");
  const inspected = inspectInventory(inventory);
  if (!inspected.ok) return {
    status: "unsupported", commit: commit.toString("utf8").trim(), tree: tree.toString("utf8").trim(),
    inputSha256: createHash("sha256").update(inventory).digest("hex"), repositorySha256: null,
    inventory: null, reason: inspected.reason,
  };
  const clean = status.length === 0;
  const remote = gitText(rootDir, ["config", "--get", "remote.origin.url"]);
  const repositorySha256 = remote && remote.length > 0
    ? createHash("sha256").update(remote.toString("utf8").trim()).digest("hex") : null;
  return {
    status: clean ? "clean" : "dirty",
    commit: commit.toString("utf8").trim(),
    tree: tree.toString("utf8").trim(),
    inputSha256: createHash("sha256").update(inventory).digest("hex"),
    repositorySha256,
    inventory: { entries: inspected.entries, symlinkPolicy: "reject", submodulePolicy: "reject" },
    reason: clean ? null : "working-tree-not-clean",
  };
}

function sameCandidate(left, right) {
  return left.status === "clean" && right.status === "clean"
    && left.commit === right.commit && left.tree === right.tree && left.inputSha256 === right.inputSha256
    && left.repositorySha256 === right.repositorySha256;
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function fileSha256(path) {
  try { return sha256(readFileSync(path)); } catch { return null; }
}

function securityPolicyBinding(scanRoot, authority, manifest, blockOn, mode) {
  const policiesPath = resolveGovernancePoliciesPath(manifest);
  const semgrepRules = manifest?.security?.scanners?.semgrep?.rules_dir;
  const manifestPath = authority.status === "ready" ? authority.manifest : null;
  const licenseAllowlistPath = `${policiesPath}/license-allowlist.json`;
  const inputs = {
    authoritySource: authority.status === "ready" ? authority.source : null,
    manifestPath,
    manifestSha256: manifestPath === null ? null : fileSha256(join(scanRoot, manifestPath)),
    gitleaksIgnorePath: ".gitleaksignore",
    gitleaksIgnoreSha256: fileSha256(join(scanRoot, ".gitleaksignore")),
    declaredLicensesPath: "third-party-licenses.json",
    declaredLicensesSha256: fileSha256(join(scanRoot, "third-party-licenses.json")),
    licenseAllowlistPath,
    licenseAllowlistSha256: fileSha256(join(scanRoot, licenseAllowlistPath)),
    semgrepRulesPath: typeof semgrepRules === "string" ? semgrepRules : null,
  };
  return {
    schema: "pipeline.security-policy-binding.v1",
    configurationSha256: sha256(canonicalJson({ mode, blockOn, scanners: manifest?.security?.scanners ?? null, policiesPath })),
    inputs,
    sha256: sha256(canonicalJson(inputs)),
  };
}

/**
 * Git object identity alone is not enough: adapters must receive a filesystem
 * root whose bytes cannot be shadowed by this process's mutable worktree. The
 * detached worktree is disposable and is never used for the evidence output.
 */
function materializeCandidate(rootDir, candidate) {
  if (candidate.status !== "clean") return { ok: false, reason: candidate.reason ?? `candidate-${candidate.status}` };
  let parent;
  try { parent = mkdtempSync(join(tmpdir(), "pipeline-security-candidate-")); } catch { return { ok: false, reason: "snapshot-temp-unavailable" }; }
  const snapshotRoot = join(parent, "tree");
  const added = gitResult(rootDir, ["worktree", "add", "--detach", snapshotRoot, candidate.commit]);
  if (added.status !== 0) {
    try { rmdirSync(parent); } catch { /* bounded scratch cleanup */ }
    return { ok: false, reason: "snapshot-materialization-failed" };
  }
  const observed = observeCandidate(snapshotRoot);
  if (!sameCandidate(candidate, observed)) {
    gitResult(rootDir, ["worktree", "remove", "--force", snapshotRoot]);
    try { rmdirSync(parent); } catch { /* bounded scratch cleanup */ }
    return { ok: false, reason: "snapshot-identity-mismatch" };
  }
  return { ok: true, rootDir: snapshotRoot, parent, method: "git-detached-worktree.v1" };
}

function cleanupCandidateSnapshot(rootDir, snapshot) {
  if (!snapshot?.ok) return { status: "not-created" };
  const removed = gitResult(rootDir, ["worktree", "remove", "--force", snapshot.rootDir]);
  try { rmdirSync(snapshot.parent); } catch { /* retained bounded scratch is diagnostic only */ }
  return { status: removed.status === 0 ? "removed" : "retained" };
}

function childProcessError({ tool, error, timeoutMs }) {
  if (error?.code === "EPERM" || error?.code === "EACCES") {
    return {
      status: "ERROR",
      classification: "execution_environment",
      reason: `${tool} could not start a Node child process (${error.code}). Run Codex CLI/headless verification in the approved host context; do not report this as a missing scanner or finding.`,
    };
  }
  if (error?.code === "ETIMEDOUT") {
    return {
      status: "ERROR",
      classification: "execution_environment",
      reason: `${tool} child-process preflight timed out after ${timeoutMs}ms`,
    };
  }
  return {
    status: "ERROR",
    classification: "execution_environment",
    reason: `${tool} could not start a Node child process: ${error?.message ?? "unknown error"}`,
  };
}

/**
 * Proves that this Node process can launch one fixed, non-project child process.
 * The scan never invokes project scripts: scanner binaries and arguments are fixed
 * by adapters, and this preflight always uses the absolute Node executable with
 * `shell: false`.
 */
export function runChildProcessPreflight({ rootDir, timeoutMs = DEFAULT_TIMEOUT_MS, spawnFn = spawnSync } = {}) {
  const boundedTimeoutMs = Math.min(timeoutMs, PREFLIGHT_TIMEOUT_MS);
  let result;
  try {
    result = spawnFn(process.execPath, ["-e", "process.exit(0)"], {
      cwd: rootDir,
      encoding: "utf8",
      timeout: boundedTimeoutMs,
      shell: false,
    });
  } catch (error) {
    return childProcessError({ tool: "security scan", error, timeoutMs: boundedTimeoutMs });
  }
  if (result?.error) return childProcessError({ tool: "security scan", error: result.error, timeoutMs: boundedTimeoutMs });
  if (result?.status !== 0) {
    return {
      status: "ERROR",
      classification: "execution_environment",
      reason: `security scan child-process preflight exited ${result?.status ?? "unknown"}`,
    };
  }
  return { status: "PASS", classification: "success" };
}

function scannerEntry(adapter, result, executableSha256 = null) {
  const entry = {
    tool: adapter.name,
    adapter: "pipeline.security-adapter.v1",
    executableSha256,
    status: result.status,
    classification: result.classification ?? (result.status === "PASS" ? "success" : result.status === "FINDINGS" ? "findings" : "scanner_error"),
    findingCount: result.findings.length,
    coverage: { subject: "candidate-tree", exclusions: [] },
  };
  if (result.reason) entry.reason = result.reason;
  if (result.ignored) entry.ignored = result.ignored;
  return entry;
}

// =============================================================================================
// CYB-2E -- additive `pipeline.security-evidence.v2` emission (EXIT-NEUTRAL; Option B / D9).
//
// Everything in this section reads ALREADY-COMPUTED v1 scan results and NEVER influences the
// process exit code (finalized by the unchanged v1 blocking logic before any of this runs).
// The v2 policy-complete `aggregateVerdict` is recorded for REPORTING ONLY this wave; the
// exit-authority switch to it is CYB-2F. The whole build is additionally guarded at the call
// site so a v2-construction fault degrades to a diagnostic and can never move the exit code.
//
// Envelope shape is dictated entirely by the imported (never edited) validators in
// security-evidence-evaluator.mjs -- the closed v2 schema has no slot for the aggregate
// verdict or a control-lane record, so those reporting-only artifacts are written to a
// companion `security-latest.v2.verdict.json` and the envelope file itself stays a directly
// `validateSecurityEvidenceV2`-passing document.
// =============================================================================================

function isNonEmptyStr(value) {
  return typeof value === "string" && value.trim().length > 0;
}

// CYB-1F §3 grammar: cap.<family> or cap.<family>.<technique>; the plan operates on roots.
function familyRoot(capabilityId) {
  const dot = capabilityId.indexOf(".", "cap.".length);
  return dot === -1 ? capabilityId : capabilityId.slice(0, dot);
}

const V2_RULE_PACK_REF = Object.freeze({
  gitleaks: "gitleaks:builtin-default",
  "osv-scanner": "osv-scanner:auto-detect",
});

/** Non-empty rule-pack/config ref per scanner (AC4 identity); semgrep's tracks its rules_dir. */
function rulePackRefFor(key, manifest) {
  if (key === "semgrep") {
    const rel = manifest?.security?.scanners?.semgrep?.rules_dir;
    return `semgrep:${isNonEmptyStr(rel) ? rel : "auto"}`;
  }
  return V2_RULE_PACK_REF[key] ?? `${key}:default`;
}

/**
 * DESIGN LATITUDE (CYB-2E field-1 note): sources the L2 capability plan from the repo control
 * catalog (governance/security-controls/catalog.json) at a baseline assurance default,
 * activating exactly the modules whose controls require a capability THIS four-scanner suite
 * can assess -- so the required set aligns with what the suite measures rather than surfacing
 * capabilities (cap.dast/cap.container/...) no scanner here provides. Evidence-only under
 * Option B: the plan never affects the exit code, so a non-empty required set showing
 * `required-capability-missing` on a binary-less machine is the honest record, not a failure.
 * Degrades to an empty plan (never throws) when the catalog is absent/malformed/unresolvable.
 */
function sourceCapabilityPlan(rootDir, suiteCapabilityIds, applicabilityInputs = { "repo.gitHistory": true }) {
  const emptyPlan = (source) => ({ plan: { required: [], optional: [], planDigest: null }, source, resolvedPolicyDigest: null });
  let catalog;
  try {
    catalog = JSON.parse(readFileSync(join(rootDir, "governance", "security-controls", "catalog.json"), "utf8"));
  } catch {
    return emptyPlan("catalog-unavailable");
  }
  if (!catalog || !Array.isArray(catalog.controls) || !Array.isArray(catalog.moduleAttribution)) {
    return emptyPlan("catalog-malformed");
  }
  const attrById = new Map(catalog.moduleAttribution.map((a) => [a?.controlId, a]));
  const catalogEntries = [];
  for (const control of catalog.controls) {
    const attr = attrById.get(control?.id);
    if (!attr) continue; // a control lacking module attribution cannot form a CatalogEntry
    catalogEntries.push({ control, minAssuranceLevel: attr.minAssuranceLevel, module: attr.module });
  }
  const suite = new Set(suiteCapabilityIds);
  const activated = new Set();
  for (const { control, module } of catalogEntries) {
    if (module === null) continue; // universal controls resolve at baseline regardless
    const reqs = Array.isArray(control?.capabilityRequirements) ? control.capabilityRequirements : [];
    if (reqs.some((id) => suite.has(familyRoot(id)))) activated.add(module);
  }
  try {
    const resolved = resolveApplicableControls({
      assuranceLevel: "baseline",
      activatedModules: [...activated],
      applicabilityInputs,
      catalogEntries,
    });
    return { plan: buildCapabilityPlan(resolved), source: "repo-catalog", resolvedPolicyDigest: resolved.digest };
  } catch (err) {
    return emptyPlan(`catalog-resolve-error: ${err?.message ?? err}`);
  }
}

function observedApplicabilityInputs(capabilityDefs) {
  const inputs = { "repo.gitHistory": true };
  const sca = capabilityDefs.find(({ contract }) => contract.capabilityId === "cap.sca")?.entry;
  if (!sca) return inputs;

  // Only the adapter's completed, exact no-source signal may exempt SCA.
  // A missing binary, a crash, malformed output, or any unfamiliar result
  // leaves the input absent so the resolver remains fail-closed (`unknown`).
  if (sca.status === "SKIPPED" && sca.classification === "success"
    && typeof sca.reason === "string" && sca.reason.startsWith("no package sources in project")) {
    inputs["repo.hasPackageSources"] = false;
  } else if (sca.status === "PASS" || sca.status === "FINDINGS") {
    inputs["repo.hasPackageSources"] = true;
  }
  return inputs;
}

/** Coerces a v1 finding to a CLOSED, `validateFindingEnvelope`-passing v2 finding record. */
function toV2Finding(f) {
  return {
    tool: isNonEmptyStr(f?.tool) ? f.tool : "unknown-tool",
    severity: FINDING_SEVERITIES.includes(f?.severity) ? f.severity : "info",
    rule: isNonEmptyStr(f?.rule) ? f.rule : "unknown-rule",
    path: isNonEmptyStr(f?.path) ? f.path : "unknown-path",
    line: Number.isInteger(f?.line) && f.line >= 1 ? f.line : null,
    msg: isNonEmptyStr(f?.msg) ? f.msg : "finding",
  };
}

/** Builds a CLOSED, `validateCoverageRecord`-passing coverage record (every AC6 key present). */
function v2Coverage(entry, snapshotAt) {
  const exclusions = Array.isArray(entry?.coverage?.exclusions)
    ? entry.coverage.exclusions.filter((x) => typeof x === "string")
    : [];
  return {
    subject: isNonEmptyStr(entry?.coverage?.subject) ? entry.coverage.subject : "candidate-tree",
    exclusions,
    ignored: [],
    unsupportedScope: [],
    truncation: { truncated: false, scannedFileCount: null, totalEligibleFileCount: null },
    dataAge: { ageSeconds: 0, snapshotAt: isNonEmptyStr(snapshotAt) ? snapshotAt : null },
  };
}

/** Builds one CLOSED, `validateCapabilityRecord`-passing per-capability record. */
function v2CapabilityRecord(entry, capabilityId, rulePackRef, allFindings, snapshotAt) {
  return {
    capabilityId,
    tool: { name: entry.tool, version: null },
    rulePack: { ref: rulePackRef, digest: null },
    status: entry.status,
    classification: isNonEmptyStr(entry.classification) ? entry.classification : "unspecified",
    findings: allFindings.filter((f) => f?.tool === entry.tool).map(toV2Finding),
    coverage: v2Coverage(entry, snapshotAt),
    reason: entry.reason ?? null,
  };
}

/**
 * Control-lane status -> RUN_OUTCOMES translation for a kind:"control" adapter (license-check:
 * capabilityId null, not a cap.* the capability evaluator processes). DELIBERATELY mirrors the
 * sanctioned evaluateCapability() status switch verbatim (a fidelity test in the new suite
 * asserts equivalence to catch drift); kept separate rather than shoehorning a control through
 * the capability evaluator with a synthetic id. Always returns a RUN_OUTCOMES member.
 */
function controlRunOutcome(entry, { required, candidateUncertain, raw }) {
  if (candidateUncertain) return "invalid";
  if (entry.classification === "unsupported_ecosystem") return "unsupported";
  if (entry.classification === "execution_environment") return "execution-unavailable";
  switch (entry.status) {
    case "SKIPPED": return required ? "required-capability-missing" : "not-applicable";
    case "ERROR": return raw != null ? "invalid" : "execution-unavailable";
    case "FINDINGS": return "findings";
    case "PASS": return "pass";
    default: return "invalid";
  }
}

/**
 * Assembles the additive v2 artifacts from already-computed v1 results. Returns
 * `{ emitted, envelope?, verdict?, valid?, validationErrors?, reason? }`. Pure w.r.t. the
 * process (no exit/exitCode access); the only IO is reading the repo catalog (via
 * sourceCapabilityPlan). Emits nothing when there is no Git candidate identity (the v2 `input`
 * identity fields would be absent) or no capability-kind scanner ran (a valid envelope needs
 * >= 1 capability record).
 */
function buildSecurityEvidenceV2({ rootDir, evidence, exitCode, scanners, findings, manifest, candidateUncertain, platform, rawByTool }) {
  const candidate = evidence.candidate ?? {};
  if (!isNonEmptyStr(candidate.commit) || !isNonEmptyStr(candidate.tree) || !isNonEmptyStr(candidate.inputSha256)) {
    return { emitted: false, reason: "no Git candidate identity (commit/tree/inputSha256); v2 input identity is unavailable" };
  }

  // Partition the ATTEMPTED scanners into capability vs control lanes via each adapter's
  // CAPABILITY_CONTRACT_V2 (gitleaks->cap.secrets, osv-scanner->cap.sca, semgrep->cap.sast,
  // license-check-> kind:"control"/capabilityId:null).
  const capabilityDefs = [];
  const controlDefs = [];
  for (const { key, adapter } of SCANNER_DEFS) {
    const contract = adapter.CAPABILITY_CONTRACT_V2;
    const entry = scanners.find((s) => s.tool === adapter.name);
    if (!entry || !contract) continue; // disabled / not attempted
    if (contract.kind === "capability") capabilityDefs.push({ key, entry, contract });
    else if (contract.kind === "control") controlDefs.push({ key, entry, contract });
  }
  if (capabilityDefs.length === 0) {
    return { emitted: false, reason: "no capability-kind scanner attempted; a valid v2 envelope requires >= 1 capability record" };
  }

  const snapshotAt = evidence.finishedAt;
  const { plan, source: planSource, resolvedPolicyDigest } = sourceCapabilityPlan(
    rootDir,
    capabilityDefs.map((d) => d.contract.capabilityId),
    observedApplicabilityInputs(capabilityDefs),
  );

  // v1-shaped evaluator candidate -> per-capability L3 outcomes -> aggregate verdict.
  // A candidate the plan can no longer be trusted against (dirty / mutated / uncertain) poisons
  // every capability to "invalid" via candidateBinding (matches the evaluator's own AC1 rule).
  const evalCandidate = {
    capabilities: capabilityDefs.map(({ entry, contract }) => ({
      id: contract.capabilityId,
      tool: entry.tool,
      status: entry.status,
      classification: entry.classification,
      findings: findings.filter((f) => f?.tool === entry.tool),
      raw: rawByTool[entry.tool] ?? null,
      reason: entry.reason ?? null,
    })),
  };
  if (candidateUncertain) {
    evalCandidate.candidateBinding = { matches: false, plannedTree: candidate.tree ?? null, observedTree: null };
  }
  const capabilityOutcomes = evaluateAllCapabilities(evalCandidate, plan);
  const verdict = aggregateVerdict(capabilityOutcomes, plan);

  // The closed, validated v2 envelope (per-capability records only).
  const envelope = {
    schema: SECURITY_EVIDENCE_V2_SCHEMA,
    policy: { configurationSha256: evidence.policy?.configurationSha256 },
    input: { commit: candidate.commit, tree: candidate.tree, inputSha256: candidate.inputSha256 },
    environment: { platform, nodeVersion: process.version },
    capabilities: capabilityDefs.map(({ key, entry, contract }) =>
      v2CapabilityRecord(entry, contract.capabilityId, rulePackRefFor(key, manifest), findings, snapshotAt)),
  };
  const validation = validateSecurityEvidenceV2(envelope);

  // Control lane (license-check): run-outcome -> control-result projection. `required` is
  // derived from whether the adapter's contract binds a catalog control (controlRef); today
  // license-check has no catalog control (its own contract's controlRef is null).
  const controls = controlDefs.map(({ entry, contract }) => {
    const required = contract.controlRef != null;
    const runOutcome = controlRunOutcome(entry, { required, candidateUncertain, raw: rawByTool[entry.tool] ?? null });
    return {
      control: entry.tool,
      tool: entry.tool,
      capabilityId: contract.capabilityId,
      controlRef: contract.controlRef ?? null,
      required,
      status: entry.status,
      classification: entry.classification,
      runOutcome,
      controlResult: projectRunOutcomeToControlResult(runOutcome, { required }),
      reason: entry.reason ?? null,
    };
  });

  const verdictDoc = {
    schema: "pipeline.security-verdict.v2",
    producedFrom: SECURITY_EVIDENCE_V2_SCHEMA,
    exitAuthority: "v1-blocking-logic",
    note: "CYB-2E Option B (D9): this policy-complete v2 verdict is evidence/reporting only and does NOT govern the process exit code this wave; the exit-authority switch to the v2 verdict is CYB-2F.",
    v1ExitCode: exitCode,
    plan: { required: plan.required, optional: plan.optional, planDigest: plan.planDigest, source: planSource, resolvedPolicyDigest },
    capabilityOutcomes,
    verdict,
    controls,
  };

  return { emitted: true, envelope, verdict: verdictDoc, valid: validation.valid, validationErrors: validation.errors ?? null };
}

// ---------------------------------------------------------------------------------------------
// Orchestration core (exported: the CLI's own main() is a thin wrapper around this).
// ---------------------------------------------------------------------------------------------

/**
 * Runs every enabled scanner sequentially, aggregates evidence, writes it to
 * `<rootDir>/evidence/security-latest.json`, and returns `{ evidence, exitCode }`.
 * `env`/`spawnFn` are injectable seams for tests (default `process.env` / each adapter's own
 * real spawnSync) -- threaded through unchanged to every adapter's `isInstalled()`/`run()`.
 * Never throws: a single adapter's internal exception is caught here and downgraded to that
 * scanner's own ERROR status rather than aborting the whole run (defensive on top of each
 * adapter's own internal try/catch -- belt and suspenders, matches the "evidence file written
 * even on failure paths" DoD requirement, which requires this function to always reach the
 * write call).
 */
export async function runSecurityScan({
  rootDir,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  env = process.env,
  spawnFn,
  platform = process.platform,
  // Test-only injection seams (never set by the CLI/production caller): let a test
  // substitute the trust assessment without touching the reserved trust module itself.
  // Defaulting to the real imported functions keeps every production code path identical.
  assessTrustedExecutablePath: assessTrustedExecutablePathOverride,
  resolveTrustedSystemExecutable: resolveTrustedSystemExecutableOverride,
} = {}) {
  const assessPath = assessTrustedExecutablePathOverride ?? assessTrustedExecutablePath;
  const resolveSystemExec = resolveTrustedSystemExecutableOverride ?? resolveTrustedSystemExecutable;
  const candidateBefore = observeCandidate(rootDir);
  const snapshot = materializeCandidate(rootDir, candidateBefore);
  // Non-Git callers retain a diagnostic-only compatibility report. Such
  // evidence can never satisfy an exact-candidate consumer. A Git candidate
  // that is dirty, unsupported, or cannot be materialized is stricter: do not
  // fall back to its mutable worktree.
  const refuseMutableSource = candidateBefore.status !== "unavailable" && !snapshot.ok;
  const scanRoot = snapshot.ok ? snapshot.rootDir : refuseMutableSource ? null : rootDir;
  const authorityRoot = scanRoot ?? rootDir;
  const authority = resolveProjectAuthorityPaths({ rootDir: authorityRoot });
  const authorityBlocked = new Set(["mixed", "invalid"]).has(authority.status);
  const manifest = authorityBlocked
    ? null
    : loadManifestSafe(
      authorityRoot,
      authority.status === "ready" ? { manifestRelPath: authority.manifest } : undefined,
    );
  const blockOn = resolveBlockOn(manifest);
  const mode = resolveGateMode(manifest);
  const policiesPathAbs = scanRoot ? join(scanRoot, resolveGovernancePoliciesPath(manifest)) : null;

  const scanners = [];
  const findings = [];
  // CYB-2E: captured per-tool raw scanner output, used ONLY by the downstream (exit-neutral)
  // v2 evaluator to distinguish an ERROR that produced malformed output (`raw != null` ->
  // "invalid") from one that never produced output (`raw == null` -> "execution-unavailable").
  // Never read by the v1 evidence or the exit-code logic.
  const rawByTool = {};
  const childProcessPreflight = scanRoot
    ? runChildProcessPreflight({ rootDir: scanRoot, timeoutMs, spawnFn })
    : { status: "ERROR", classification: "candidate_snapshot", reason: snapshot.reason };

  for (const { key, adapter } of SCANNER_DEFS) {
    if (!isScannerEnabled(manifest, key)) continue;

    let entry;
    try {
      if (authorityBlocked) {
        entry = {
          tool: adapter.name,
          status: "ERROR",
          classification: "project_authority",
          findingCount: 0,
          reason: `project authority is ${authority.status}`,
        };
      } else if (!scanRoot) {
        entry = { tool: adapter.name, status: "ERROR", classification: "candidate_snapshot", findingCount: 0, reason: snapshot.reason };
      } else {
      // The license check does not spawn a process and remains usable when the
      // environment cannot start children. Every binary-backed scanner is
      // classified as an execution-environment failure before PATH discovery,
      // so a sandbox EPERM can never masquerade as a missing binary.
      if (key !== "license-check" && childProcessPreflight.status !== "PASS") {
        entry = {
          tool: adapter.name,
          status: "ERROR",
          classification: "execution_environment",
          findingCount: 0,
          reason: childProcessPreflight.reason,
        };
      } else {
      let inst = adapter.isInstalled(env);
      if (inst.installed && key !== "license-check") {
        const assessed = assessPath(inst.path, { platform });
        inst = assessed.ok ? { installed: true, path: assessed.path } : { installed: false, status: assessed.status, reason: `resolved ${key} path was rejected: ${assessed.status}` };
      }
      if (!inst.installed && key !== "license-check" && typeof env?.HOME === "string" && env.HOME.length > 0) {
        const trusted = resolveSystemExec(key, { platform, homeDir: env.HOME });
        if (trusted.ok) inst = { installed: true, path: trusted.path };
        else if (inst.status === undefined) inst = { ...inst, status: trusted.status };
      }
      if (!inst.installed) {
        entry = { tool: adapter.name, status: "SKIPPED", classification: inst.status ?? "binary_missing", findingCount: 0, reason: inst.reason };
      } else {
        const builtConfig = buildAdapterConfig(key, { rootDir: scanRoot, manifest, policiesPathAbs });
        if (builtConfig.configViolation) {
          // N3: fail closed -- never invoke the adapter with (or silently drop) a manifest-derived
          // config value that failed containment; see buildAdapterConfig's own doc comment.
          entry = { tool: adapter.name, status: "ERROR", classification: "manifest_config_invalid", findingCount: 0, reason: builtConfig.configViolation };
        } else {
          const adapterConfig = { ...builtConfig, binaryPath: inst.path };
          const runArgs = { rootDir: scanRoot, config: adapterConfig, timeoutMs, env };
          if (spawnFn) runArgs.spawnFn = spawnFn;
          const result = await adapter.run(runArgs);
          rawByTool[adapter.name] = result.raw ?? null; // CYB-2E: additive capture (see decl above)
          entry = scannerEntry(adapter, result, fileSha256(inst.path));
          findings.push(...result.findings);
        }
      }
      }
      }
    } catch (err) {
      entry = { tool: adapter.name, status: "ERROR", classification: "scanner_error", findingCount: 0, reason: `adapter threw: ${err.message}` };
    }
    scanners.push(entry);
  }

  const blockOnSet = new Set(blockOn);
  const hasErrorClass = scanners.some((s) => s.status === "ERROR");
  const hasBlockingFinding = findings.some((f) => blockOnSet.has(f.severity));
  const snapshotAfter = scanRoot ? observeCandidate(scanRoot) : null;
  const candidateAfter = observeCandidate(rootDir);
  const candidateBound = snapshot.ok && sameCandidate(candidateBefore, candidateAfter)
    && sameCandidate(candidateBefore, snapshotAfter);
  const candidateUncertain = candidateBefore.status !== "unavailable" && !candidateBound;
  const blockingClass = hasErrorClass || hasBlockingFinding || candidateUncertain;

  let exitCode;
  if (!blockingClass) {
    exitCode = 0;
  } else if (mode === "warn") {
    exitCode = 1;
  } else if (mode === "off") {
    exitCode = 0;
  } else {
    exitCode = 2; // "blocking" (default / fail-closed for any unrecognized mode string)
  }

  const candidate = candidateBound ? {
    ...candidateAfter,
    snapshot: { method: snapshot.method, verifiedBeforeAfter: true },
  } : {
    ...candidateBefore,
    snapshot: { method: snapshot.ok ? snapshot.method : null, verifiedBeforeAfter: false },
  };
  // Bind policy bytes while the verified detached snapshot still exists.
  // Cleanup deliberately precedes evidence publication, so hashing afterward
  // would silently turn every snapshot-backed digest into null.
  const policy = securityPolicyBinding(authorityRoot, authority, manifest, blockOn, mode);
  const project = resolveProjectName(authorityRoot, authority);
  const cleanup = cleanupCandidateSnapshot(rootDir, snapshot);
  const evidenceCore = {
    schema: "pipeline.security-evidence.v1",
    project,
    command: "node harness/scripts/security-scan.mjs",
    commit: resolveCommit(rootDir),
    candidate,
    finishedAt: new Date().toISOString(),
    thresholds: { block_on: blockOn },
    policy,
    execution: {
      childProcessPreflight,
      projectAuthority: {
        status: authority.status,
        source: authority.status === "ready" ? authority.source : null,
      },
      snapshotCleanup: cleanup,
    },
    scanners,
    findings,
    exitCode,
  };
  const evidence = { ...evidenceCore, payloadSha256: sha256(canonicalJson(evidenceCore)) };

  const evidenceDir = join(rootDir, "evidence");
  mkdirSync(evidenceDir, { recursive: true });
  writeFileSync(join(evidenceDir, "security-latest.json"), JSON.stringify(evidence, null, 2) + "\n");

  // -------------------------------------------------------------------------------------------
  // CYB-2E -- additive, EXIT-NEUTRAL v2 emission. `exitCode` above is already final and is NOT
  // reassigned anywhere below. The v2 policy-complete verdict is recorded for REPORTING ONLY
  // (Option B / D9). Guarded so any v2 fault degrades to a diagnostic without moving the exit
  // code or crashing the run (runSecurityScan's "never throws" contract, on which verify.mjs
  // and guard-push.mjs depend).
  // -------------------------------------------------------------------------------------------
  let evidenceV2 = null;
  let verdictV2 = null;
  try {
    const v2 = buildSecurityEvidenceV2({ rootDir, evidence, exitCode, scanners, findings, manifest, candidateUncertain, platform, rawByTool });
    if (v2.emitted && v2.valid) {
      evidenceV2 = v2.envelope;
      verdictV2 = v2.verdict;
      writeFileSync(join(evidenceDir, "security-latest.v2.json"), JSON.stringify(v2.envelope, null, 2) + "\n");
      writeFileSync(join(evidenceDir, "security-latest.v2.verdict.json"), JSON.stringify(v2.verdict, null, 2) + "\n");
    } else if (v2.emitted && !v2.valid) {
      process.stderr.write(`security-scan: v2 envelope failed self-validation, not written: ${JSON.stringify(v2.validationErrors)}\n`);
    }
  } catch (err) {
    process.stderr.write(`security-scan: v2 evidence emission skipped (non-fatal, exit code unchanged): ${err?.message ?? err}\n`);
  }

  return { evidence, exitCode, evidenceV2, verdictV2 };
}

function statusLabel(status) {
  switch (status) {
    case "PASS":
      return "OK";
    case "FINDINGS":
      return "FINDINGS";
    case "SKIPPED":
      return "SKIPPED";
    case "ERROR":
      return "ERROR";
    default:
      return status;
  }
}

function printSummary(evidence) {
  for (const s of evidence.scanners) {
    const reasonSuffix = s.reason ? ` -- ${s.reason}` : "";
    console.log(`${s.tool}: ${statusLabel(s.status)} [${s.classification}] (${s.findingCount} findings)${reasonSuffix}`);
  }
  const verdict = evidence.exitCode === 0 ? "CLEAN" : evidence.exitCode === 1 ? "WARNING" : "BLOCKING";
  console.log(`\nVerdict: ${verdict} (thresholds: ${evidence.thresholds.block_on.join(", ")}) -> exit ${evidence.exitCode}`);
}

// ---------------------------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------------------------

function parseArgs(argv) {
  const opts = { root: process.cwd(), timeoutMs: DEFAULT_TIMEOUT_MS };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--root") {
      opts.root = argv[++i];
    } else if (a === "--timeout-ms") {
      opts.timeoutMs = Number(argv[++i]);
    } else {
      throw new Error(`unknown argument: ${a}`);
    }
  }
  if (!Number.isFinite(opts.timeoutMs) || opts.timeoutMs <= 0) {
    throw new Error(`--timeout-ms must be a positive number, got: ${opts.timeoutMs}`);
  }
  return opts;
}

export async function main(argv = process.argv.slice(2)) {
  let opts;
  try {
    opts = parseArgs(argv);
  } catch (err) {
    process.stderr.write(`error: ${err.message}\n`);
    process.exitCode = 1;
    return;
  }

  const rootDir = resolve(opts.root);
  if (!existsSync(rootDir)) {
    process.stderr.write(`error: --root path does not exist: ${rootDir}\n`);
    process.exitCode = 1;
    return;
  }

  const { evidence, exitCode, evidenceV2, verdictV2 } = await runSecurityScan({ rootDir, timeoutMs: opts.timeoutMs });
  printSummary(evidence);
  console.log(`Evidence written: ${join(rootDir, "evidence", "security-latest.json")}`);
  if (evidenceV2) {
    console.log(`v2 evidence written: ${join(rootDir, "evidence", "security-latest.v2.json")}`);
    const b = verdictV2?.verdict;
    console.log(
      `v2 policy-complete verdict (reporting-only, does NOT affect exit ${exitCode}): ` +
        `${b?.blocking ? "BLOCKING" : "clean"} (${b?.offendingCapabilities?.length ?? 0} offending required capabilities)`,
    );
  }
  process.exitCode = exitCode;
}

const isDirectRun = (() => {
  try {
    return Boolean(process.argv[1]) && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
})();
if (isDirectRun) {
  main();
}
