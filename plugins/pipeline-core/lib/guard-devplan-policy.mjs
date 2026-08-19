// SPDX-License-Identifier: SUL-1.0
/**
 * The dev-plan gate's exempt write prefixes, and its pure verdict function, in a
 * module a reader can import.
 *
 * `guard-devplan.mjs` is a hook SCRIPT: it runs its whole decision at import
 * time and calls `process.exit()`. Anything that merely wants to *know* its
 * policy therefore cannot import it — the importing process dies. Before this
 * module the only way to state the list elsewhere was to type it out again, and
 * a hand-copied second copy of a rule a guard owns is precisely the drift this
 * repository has been bitten by twice in one block.
 *
 * So the value lives here, with exactly one owner: the guard imports it to
 * enforce, and the obligations generator (a source-checkout tool, so its path is
 * deliberately not named here -- a shipped file must not point a consumer at
 * something only this repository has) imports it to tell agents about it. A
 * prefix added here reaches both at once, and the generator's contract test goes
 * red until the shipped document is regenerated.
 *
 * `devPlanGateVerdict()` below carries the SAME "one owner, two readers" shape
 * for the gate's full decision, not just its exempt-prefix list: `guard-
 * devplan.mjs`'s Edit|Write lane calls it and translates the verdict into its
 * own exit-code/stderr protocol; `guard-lifecycle-ready.mjs`'s `GUARD-DEVPLAN-
 * SHELL` check (the `Bash|PowerShell` lane, closing the same route-choice gap
 * `GUARD-TESTPATH-SHELL` closed for the test-path authority gate) calls the
 * IDENTICAL function against every write-target candidate a shell command's
 * syntax shows it touching (`lib/protected-test-paths.mjs`'s
 * `extractShellWriteTargets()`) — so the two lanes can never independently
 * decide a path's dev-plan-gate fate differently from each other.
 */
import { existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, isAbsolute, join, posix, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { gateConfig, loadManifest } from "./manifest.mjs";
import { derivePlanLifecycle } from "./plan-spec-state-v2.mjs";
import {
  LEGACY_STATE,
  NEUTRAL_STATE,
  resolveProjectAuthorityPaths,
  validatePortablePipelineState,
} from "./project-authority.mjs";

/**
 * Why `scratch/` is here, and why it is the safest of the five rather than the
 * riskiest (kept with the value it explains):
 *
 * The Pipeline's own shipped instructions send every agent to `scratch/` and
 * describe it as the one place needing no exception —
 * `skills/pipeline-start/SKILL.md` calls it "the only location the containment
 * guard permits without an exception", and the Goldfish briefing template says
 * the same. Both were speaking about the CONTAINMENT guard
 * (`guard-lifecycle-ready`), which does permit it, while this gate blocked it in
 * the `draft` phase — the phase every fresh project starts in. A consumer
 * following the shipped instruction was refused by a guard the instruction had
 * never cleared, and pointed at a plan approval that has nothing to do with
 * writing a throwaway probe script.
 *
 * `docs/`, `specs/`, `.claude/` and `backlog/` are tracked directories whose
 * contents ship; `scratch/` holds throwaways by definition. Implementation
 * smuggled there is not implementation until it moves into a real source path,
 * and that move is exactly what this gate still catches.
 *
 * backlog: 2026-08-08-shipped-guidance-sends-agents-to-a-directory-a-gate-refuses.md
 */
export const DEFAULT_EXEMPT_PREFIXES = Object.freeze(["docs/", "specs/", ".claude/", "backlog/", "scratch/"]);

// The plugin root this policy module is itself running from -- same self-location
// resolution guard-devplan.mjs's own PLUGIN_ROOT used before this function moved here
// (`resolve(dirname(fileURLToPath(import.meta.url)), "..")`). Both `hooks/guard-devplan.mjs`
// and `lib/guard-devplan-policy.mjs` sit exactly one directory below the plugin root, so
// the same relative walk resolves to the identical path from either location.
const PLUGIN_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Runnable reference to pipeline-state.mjs under the plugin actually enforcing this
 * guard. Degrades to a locate-it hint (never a broken path or an empty string) if the
 * script cannot be found under PLUGIN_ROOT.
 */
function pipelineStateScriptRef() {
  const script = join(PLUGIN_ROOT, "scripts", "pipeline-state.mjs");
  return existsSync(script)
    ? script
    : "pipeline-state.mjs (locate it under your installed pipeline-core plugin's scripts directory)";
}

function normalize(p) {
  return String(p ?? "").replace(/\\/g, "/").toLowerCase();
}

/**
 * The Dev-Plan-Gate's pure decision function, moved nearly verbatim out of
 * `guard-devplan.mjs` (see that file's own header for the full rationale behind
 * each step -- absolute/relative resolution, traversal hardening, the
 * unconditional `scratch/` allow, the manifest/state fail-open contract, plan/
 * spec authority immutability). This function never touches stdin, never calls
 * `process.exit()`, and never writes anything -- it is a READER of the manifest
 * and State exactly like the hook it now backs.
 *
 * @param {{filePath: string, projectDir: string}} args `filePath` as delivered by
 *   the calling tool's own contract (may be absolute or relative, forward- or
 *   backslash-separated); `projectDir` the resolved project root to evaluate against.
 * @returns {{verdict: "allow"|"block"|"warn", reason?: string, feature?: string,
 *   planPath?: string|null, lifecycleStatus?: string}} `reason` carries the exact
 *   multi-line message text `guard-devplan.mjs` has always emitted to stderr for a
 *   BLOCKED/WARN outcome; absent for a plain "allow".
 */
export function devPlanGateVerdict({ filePath, projectDir }) {
  if (typeof filePath !== "string" || filePath === "") return { verdict: "allow" };

  // ---- resolve absolute file_path against the project root (C1 fix) ----------------
  let relPath = filePath;
  if (isAbsolute(filePath)) {
    const rel = relative(projectDir, filePath);
    const relSlashes = rel.replace(/\\/g, "/");
    const outsideRoot = rel === ".." || relSlashes.startsWith("../") || isAbsolute(rel);
    if (outsideRoot) return { verdict: "allow" }; // not this project's file -- allow unconditionally
    relPath = rel;
  }
  // Collapse ".."/"." traversal segments BEFORE the prefix match (see guard-devplan.mjs
  // header "TRAVERSAL HARDENING"). Slashify backslashes FIRST, then collapse with POSIX
  // semantics explicitly -- platform-native `path.normalize` only treats "\" as a separator
  // on win32.
  relPath = posix.normalize(relPath.replace(/\\/g, "/"));
  const normalizedPath = normalize(relPath);

  // ---- scratch/: UNCONDITIONAL allow, before any gate evaluation ---------------------
  if (normalizedPath.startsWith("scratch/")) return { verdict: "allow" };

  // ---- manifest: gate config (fail-open on absent, WARN on genuine YAML failure) -----
  const manifestResult = loadManifest(projectDir);
  if (manifestResult.status === "absent") return { verdict: "allow" };
  if (manifestResult.status === "invalid" && manifestResult.manifest === undefined) {
    const reason = manifestResult.errors?.[0]?.reason ?? "YAML error";
    return {
      verdict: "warn",
      reason: [
        `[guard-devplan] WARN: .claude/pipeline.yaml is not readable (${reason}).`,
        `Dev-Plan gate is being skipped (fail-open) -- please repair the manifest file.`,
      ].join("\n"),
    };
  }
  const manifest = manifestResult.manifest;
  const gate = gateConfig(manifest, "dev-plan");
  if (!gate || gate.mode === "off") return { verdict: "allow" };

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
    return { verdict: "allow" }; // no state file at all -- fail-open
  }
  let state;
  try {
    state = JSON.parse(stateRaw);
  } catch (e) {
    return {
      verdict: "warn",
      reason: [
        `[guard-devplan] WARN: ${statePath} contains invalid JSON (${e.message}).`,
        `Dev-Plan gate is being skipped (fail-open) -- please repair the state file (rewrite only via ` +
          `${pipelineStateScriptRef()}, never by hand).`,
      ].join("\n"),
    };
  }

  const activeFeature = state && typeof state === "object" ? state.activeFeature : undefined;
  if (!activeFeature || typeof activeFeature !== "object" || typeof activeFeature.id !== "string" || activeFeature.id === "") {
    return { verdict: "allow" }; // no active feature -- nothing to enforce
  }

  if (statePath === join(projectDir, NEUTRAL_STATE)) {
    const portability = validatePortablePipelineState(state);
    if (!portability.ok) {
      const blockingMode = gate.mode !== "warn";
      return {
        verdict: blockingMode ? "block" : "warn",
        reason: [
          `[guard-devplan] ${blockingMode ? "BLOCKED" : "WARN"}: neutral State contains private cleanup identity (${portability.code}).`,
          "Repair through the sanctioned cleanup recovery transaction; direct State edits are not authority.",
        ].join("\n"),
        feature: activeFeature.id,
      };
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
  if (lifecycle.status === "implementing" && lifecycle.ok && lifecycle.nextAction === null) {
    return { verdict: "allow" };
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
      && exemptPrefixes.some((prefix) => normalizedPath.startsWith(normalize(prefix))));
  if (isExempt) return { verdict: "allow" };

  // ---- verdict --------------------------------------------------------------------------
  const lifecycleReason = lifecycle.nextAction === "reopen-design"
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
  ].join("\n");

  return {
    verdict: gate.mode === "warn" ? "warn" : "block",
    reason: message,
    feature: activeFeature.id,
    planPath: typeof activeFeature.planPath === "string" ? activeFeature.planPath : null,
    lifecycleStatus: lifecycle.status ?? "invalid",
  };
}
