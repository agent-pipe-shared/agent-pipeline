#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
//
// backlog: 2026-08-08-agents-are-judged-by-rules-no-artifact-ever-tells-them.md
// (Direction 3: "Refusals should teach.") For every refusal class the guard
// union can produce: is it liftable, by whom, and the exact command -- asked
// of the real override planner and the real guard predicates at runtime,
// never a hand-maintained table (REPAIRMAP-1).
//
// Read-only (AC-5): never writes, never needs session readiness. The only
// human-guard-override.mjs entry points this file calls are:
//   - `humanGuardOverrideInternals.eligibility()` -- exported, pure, no I/O
//     beyond reading the classified path shape.
//   - `recordHumanGuardDenial()`, but ONLY for inputs where `eligibility()`
//     already reports `eligible: false` and `authorCandidate` falsy (the
//     `HGO-NONOVERRIDABLE-*` family). Read `recordHumanGuardDenial`'s own
//     source: for exactly that condition it returns
//     `recoveryRoute(eligible.code, ...)` BEFORE the line that calls
//     `storage()` (which is the first thing in that function that touches
//     the filesystem -- `secureDirectory()` -> `mkdirSync`). Every other
//     branch (eligible, or authorCandidate) reaches `storage()` and writes a
//     request file plus an audit entry, so this file never takes that
//     branch, even against the real repository root.
//   For the `authorCandidate: true` row (`HGO-AUTHOR-ROOT-REQUIRED`) this
//   file does NOT call `recordHumanGuardDenial` -- the boolean it would key
//   off (`eligible.authorCandidate`) is already the live answer, and
//   `recordHumanGuardDenial`'s own final line
//   (`eligible.authorCandidate ? "author-repair-required" : "planned"`,
//   `lib/human-guard-override.mjs:1466`) is a total, two-branch function of
//   that same boolean -- not a duplicated business rule. See the dispatch
//   report for why this is treated as "asked" rather than "stored", and what
//   it would take to ask it directly without a write.
//
// Enumeration source (AC-4): the `HGO-NONOVERRIDABLE-*` and
// `HGO-AUTHOR-ROOT-REQUIRED` codes are extracted live, at run time, from the
// source text of `eligibility()` in human-guard-override.mjs -- never typed
// here. A code added to that function and not handled by a fixture in this
// file fails `repair-map.test.mjs`. Two further rows
// (`GUARD-LIFECYCLE-NOT-READY`, the GS-6 `NEVER_LIFTABLE_KERNEL_PATHS` case)
// bypass `eligibility()` entirely by construction -- their own guard's
// source never routes them through human-guard-override.mjs -- so no single
// source enumerates them; they are named from this task's own briefing and
// verified live against their real predicates
// (`isNeverLiftableKernelPath`, and a direct drive of
// `evaluateLifecycleReadyGuard` in the contract test). The dispatch report
// states exactly what this enumeration does and does not cover.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { recordHumanGuardDenial, humanGuardOverrideInternals } from "../lib/human-guard-override.mjs";
import { USER_SOURCE_PATH, readHumanApprovalMode } from "../lib/critical-human-proof-policy.mjs";
import { isNeverLiftableKernelPath } from "../lib/guard-maintenance-window.mjs";

const { eligibility } = humanGuardOverrideInternals;

const HERE = dirname(fileURLToPath(import.meta.url));
export const PLUGIN_ROOT = dirname(HERE);
export const SCHEMA = "pipeline.repair-map.v1";

/**
 * Live-extract every `code: "HGO-..."` string literal `eligibility()` in
 * human-guard-override.mjs can return, by reading that function's own
 * source text at run time -- AC-4, never a list typed here.
 */
export function extractEligibilityCodes(pluginRoot = PLUGIN_ROOT) {
  const source = readFileSync(join(pluginRoot, "lib", "human-guard-override.mjs"), "utf8");
  const marker = "function eligibility(";
  const start = source.indexOf(marker);
  if (start === -1) {
    throw new Error("REPAIRMAP-SOURCE: eligibility() not found in human-guard-override.mjs; enumeration is stale.");
  }
  const rest = source.slice(start + marker.length);
  const nextTopLevelFn = rest.search(/\n(?:function |export function )/u);
  const body = nextTopLevelFn === -1 ? rest : rest.slice(0, nextTopLevelFn);
  const codes = new Set();
  for (const match of body.matchAll(/code:\s*"([A-Z][A-Z0-9-]+)"/gu)) codes.add(match[1]);
  if (codes.size === 0) {
    throw new Error("REPAIRMAP-SOURCE: no HGO-* codes extracted; eligibility() shape has drifted.");
  }
  return [...codes].sort();
}

/**
 * One representative `{toolName, toolInput}` per code this file has
 * confirmed (empirically, in the contract test) reaches that code through
 * the REAL `eligibility()` classifier. Exported so the contract test drives
 * the exact same inputs the map itself uses -- one fixture set, not two.
 */
export const PROBES = Object.freeze([
  { label: "secret-bearing command", toolName: "Bash", toolInput: { command: "printf token=aaaaaaaaaaaaaaaaaaaa" } },
  { label: "raw git push", toolName: "Bash", toolInput: { command: "git push origin main" } },
  { label: "wildcard command", toolName: "Bash", toolInput: { command: "rm *" } },
  { label: "unsupported tool", toolName: "WebFetch", toolInput: { url: "https://example.invalid" } },
  { label: "hard-boundary path", toolName: "Bash", toolInput: { command: "cat .git/config" } },
  { label: "cross-boundary target", toolName: "Bash", toolInput: { command: "cat /etc/shadow" } },
  { label: "ungrammatical command", toolName: "Bash", toolInput: { command: "cat 'unterminated/quote" } },
  { label: "pipeline plugin source edit", toolName: "Edit", toolInput: { file_path: "plugins/pipeline-core/scripts/repair-map.mjs" } },
  { label: "ordinary in-root command", toolName: "Bash", toolInput: { command: "printf hello" } },
]);

function renderNextAction(nextAction) {
  if (!nextAction || typeof nextAction !== "object") return null;
  const action = nextAction.action;
  if (action && typeof action.executable === "string" && Array.isArray(action.argv)) {
    return [{ executable: action.executable, argv: action.argv.map(String) }];
  }
  return null; // guidance without an executable step (e.g. "replace every wildcard"), never fabricated
}

function overridePlanCommands(rootDir, requestSha256, approvalMode) {
  const script = join(PLUGIN_ROOT, "scripts", "guard-human-override.mjs");
  const plan = { executable: process.execPath, argv: [script, "plan", "--repo", rootDir, "--request-sha256", requestSha256] };
  const prepare = {
    executable: process.execPath,
    argv: approvalMode === "chat"
      ? [script, "prepare-authorization", "--repo", rootDir, "--request-sha256", requestSha256,
        "--plan-sha256", "<plan-sha256-from-plan>", "--reason", "<human-reason>"]
      : [script, "prepare-authorization", "--repo", rootDir, "--request-sha256", requestSha256,
        "--plan-sha256", "<plan-sha256-from-plan>", "--reason", "<fixed HGO_SIGNATURE_REASON text>"],
  };
  const authorize = {
    executable: process.execPath,
    argv: approvalMode === "chat"
      ? [script, "authorize", "--repo", rootDir, "--request-sha256", requestSha256,
        "--plan-sha256", "<plan-sha256>", "--selection-sha256", "<selection-sha256>",
        "--reason", "<human-reason>", "--reason-sha256", "<reason-sha256>", "--activate"]
      : [script, "authorize-by-signature", "--repo", rootDir, "--request-sha256", requestSha256,
        "--plan-sha256", "<plan-sha256>", "--proof", "<external-proof.json>"],
  };
  // NVA-SIGENTRY-2 F2: `signature` mode's only path from "prepared" to "signable" is
  // `emit-signature-digest`, run before the human is expected to sign anything
  // out-of-band -- omitting it here left this map's own signature-mode row incomplete in
  // exactly the way the original backlog item was filed to close. Chat mode has no
  // signing step at all (an in-session `--activate` IS the authorization), so it stays a
  // 3-command sequence; only the signature-mode sequence grows to 4.
  if (approvalMode === "chat") return [plan, prepare, authorize];
  const emitDigest = {
    executable: process.execPath,
    argv: [script, "emit-signature-digest", "--repo", rootDir, "--request-sha256", requestSha256,
      "--plan-sha256", "<plan-sha256>"],
  };
  return [plan, prepare, emitDigest, authorize];
}

/**
 * Ask the real planner for one probe. Never writes: see the module header
 * for the exact proof, keyed on which branch `eligibility()` reports.
 */
export function classifyProbe({ rootDir, pluginRoot, toolName, toolInput }) {
  const eligible = eligibility(rootDir, toolName, toolInput);
  if (eligible.eligible === true) {
    let approval = { mode: "signature", scope: "default", source: "default" };
    try { approval = readHumanApprovalMode(rootDir, { legacyKind: "push" }) ?? approval; } catch { /* fail closed */ }
    const approvalMode = approval.mode;
    const globalChat = approvalMode === "chat" && approval.scope === "global" && approval.source === USER_SOURCE_PATH;
    return {
      code: "HGO-ELIGIBLE",
      liftable: "in-session-or-signed",
      by: approvalMode === "chat" ? "this-session-human" : "attended-operator-outside-session",
      command: overridePlanCommands("<repo-root>", "<request-sha256-from-your-denial>", approvalMode),
      reason: approvalMode === "chat"
        ? (globalChat
          ? "eligible for the general override; committed global chat is chat-attributed-unattested and needs no terminal ceremony, key, or proof."
          : "eligible for the general override; the human confirms in this session (attribution, not proof).")
        : "eligible for the general override; presence of a valid, correctly-bound Ed25519 signature IS the "
          + "authorization -- there is no in-session activate step for this mode.",
      approvalMode,
    };
  }
  if (eligible.authorCandidate === true) {
    return {
      code: eligible.code,
      liftable: "author-repair-required",
      by: "attended-author-outside-session",
      command: null,
      reason: "the target is Pipeline plugin source, so an override is author repair and needs an explicit "
        + "author source root, which a guard will not select on a human's behalf.",
      candidateSourceRoot: "<pipeline-source-root>",
    };
  }
  // Not eligible and not an author candidate: the real, non-writing branch of
  // recordHumanGuardDenial() (module header) returns recoveryRoute()'s answer directly.
  const denials = [{ guard: "repair-map-probe", reason: "repair-map probe (never a real denial)" }];
  const routed = recordHumanGuardDenial({ rootDir, pluginRoot, toolName, toolInput, denials });
  const command = renderNextAction(routed.nextAction);
  return {
    code: eligible.code,
    liftable: routed.status === "narrower-recovery-required" && command !== null ? "narrower-recovery" : "never",
    by: command !== null ? "this-session-human" : "nobody",
    command,
    reason: routed.status === "narrower-recovery-required"
      ? (command !== null
        ? "a narrower typed recovery exists and can be run directly -- not a general override."
        : "a narrower typed recovery is required; it names the required change, not a runnable command.")
      : `the exact action must be carried out by an attended operator outside this session (${routed.code}).`,
  };
}

/** The two rows that bypass human-guard-override.mjs entirely by construction. */
export function structuralRows({ rootDir, pluginRoot }) {
  const kernelProbe = "plugins/pipeline-core/hooks/guard-gate-strength.mjs";
  let kernelHit = null;
  try {
    kernelHit = isNeverLiftableKernelPath(kernelProbe, { rootDir, livePluginRoot: pluginRoot });
  } catch (error) {
    kernelHit = { error: String(error?.message ?? error) };
  }
  return [
    {
      code: "GUARD-LIFECYCLE-NOT-READY",
      liftable: "never",
      by: "nobody",
      command: null,
      reason: "never liftable by construction: no armed capability and no signature route exist for this code; "
        + "guard-lifecycle-ready.mjs never calls into human-guard-override.mjs for it.",
    },
    {
      code: "GS-6-NEVER-LIFTABLE-KERNEL-PATH",
      liftable: "never",
      by: "nobody",
      command: null,
      reason: "never liftable by policy: a hardcoded kernel path (verified live via isNeverLiftableKernelPath() "
        + `against a representative kernel path -- observed ${JSON.stringify(kernelHit)}); no Guard Maintenance `
        + "Window, however scoped or freshly signed, can ever cover it.",
    },
  ];
}

export function buildRepairMap({ rootDir, pluginRoot = PLUGIN_ROOT } = {}) {
  const byCode = new Map();
  for (const probe of PROBES) {
    const row = classifyProbe({ rootDir, pluginRoot, toolName: probe.toolName, toolInput: probe.toolInput });
    if (!byCode.has(row.code)) byCode.set(row.code, { ...row, probes: [probe.label] });
    else byCode.get(row.code).probes.push(probe.label);
  }
  const codes = extractEligibilityCodes(pluginRoot);
  const uncovered = codes.filter((code) => !byCode.has(code));
  const unknownRows = uncovered.map((code) => ({
    code,
    liftable: "unknown",
    by: "unknown",
    command: null,
    reason: "no fixture in this file's PROBES pool has been confirmed (by running it) to reach this exact code; "
      + "printed as unknown rather than guessed. See PROBES and the dispatch report for what was tried.",
    probes: [],
  }));
  const rows = [...byCode.values(), ...unknownRows, ...structuralRows({ rootDir, pluginRoot })]
    .sort((left, right) => left.code.localeCompare(right.code));
  return {
    schema: SCHEMA,
    generatedAt: new Date().toISOString(),
    enumerationSource: "plugins/pipeline-core/lib/human-guard-override.mjs:eligibility() (live-extracted) "
      + "+ two named structural rows (GUARD-LIFECYCLE-NOT-READY, GS-6 kernel-path) that bypass it by construction",
    knownEligibilityCodes: codes,
    uncoveredEligibilityCodes: uncovered,
    rows,
  };
}

function render(map) {
  const lines = [];
  lines.push(`repair-map (${map.schema}) generated ${map.generatedAt}`);
  lines.push(`enumeration: ${map.enumerationSource}`);
  if (map.uncoveredEligibilityCodes.length > 0) {
    lines.push(`WARNING -- codes extracted from source but not covered by a fixture: ${map.uncoveredEligibilityCodes.join(", ")}`);
  }
  lines.push("");
  for (const row of map.rows) {
    lines.push(`${row.code}`);
    lines.push(`  liftable:  ${row.liftable}`);
    lines.push(`  by:        ${row.by}`);
    lines.push(`  reason:    ${row.reason}`);
    if (row.command === null) {
      lines.push("  command:   (none)");
    } else {
      lines.push("  command:");
      for (const step of row.command) lines.push(`    ${step.executable} ${step.argv.join(" ")}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const rootDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const map = buildRepairMap({ rootDir, pluginRoot: PLUGIN_ROOT });
  process.stdout.write(`${render(map)}\n`);
}
