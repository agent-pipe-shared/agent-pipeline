#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
//
// backlog/items/2026-08-08-the-harness-classifier-blocks-the-onboarding-action-the-pipeline-just-authorized.md
// Directions 2 (granularity) and 3 (entry ownership).
//
// GRANULARITY (Direction 2, "the narrowest entry the settings syntax supports, not the
// most convenient one"): each candidate's `pattern` is scoped to exactly the surface
// Direction 1's own regression suites proved is guard-verified closed, and no wider.
//   - `project-onboarding-v3.mjs`: EVERY subcommand's entire argv is refused outside a
//     closed grammar by the CLI's own parser (see
//     project-onboarding-v3-argv-closure.test.mjs), so the whole-script prefix is safe.
//   - `pipeline-state.mjs`: only its `approve-push` subcommand's entire argv surface is
//     validated by the closed `parseExactFlags` parser (see
//     pipeline-state-approve-push-argv-closure.test.mjs); the CLI's other subcommands are
//     NOT verified closed, so the entry is scoped to the subcommand, not the whole script.
// A settings-layer Bash prefix match always admits any trailing argv on its own; safety
// comes only from the fact that the named CLI's own parser refuses anything outside its
// closed grammar regardless of what the settings layer would let through. Widening either
// pattern beyond what is written here re-opens exactly the gap Direction 1 closed.
//
// OWNERSHIP (Direction 3, "shipped with the plugin, written by onboarding, or left to the
// operator"): this module and its candidate registry are SHIPPED WITH THE PLUGIN -- the
// data and the merge mechanism are plugin-owned and version-controlled here, not invented
// ad hoc per project. But applying them to any concrete `.claude/settings.json` is never
// automatic: nothing in the onboarding apply-* flow calls `applySettingsAllowlistMerge`,
// and this CLI itself never writes without an operator explicitly running `apply
// --activate` after reviewing the `plan` output's proposed diff. That split is deliberate
// and required by this item's own text: an earlier dispatch against this same item edited
// this repository's `.claude/settings.json` directly (and, when an `Edit` was refused,
// routed around the refusal with a `Write`) with no human review of that specific change;
// the item's own follow-up records that this "needs explicit human review before any
// settings-file edit is attempted again, and must not route around a classifier refusal by
// switching tools if one occurs." This mechanism is built so that property is structural,
// not a promise: `apply` without `--activate` never writes (status
// "activation-required"), and a stale or mismatched `--plan-sha256` never writes either
// (status "invalid-plan") -- there is no path from running this CLI to a written file that
// does not pass through an operator typing `--activate` themselves, after reading the
// `plan` diff.
//
// This dispatch (NVA-W1-6, 2026-08-18) implements and tests `plan` and `apply` against
// fixture directories only. It never invokes `apply --activate` against this repository's
// own real `.claude/settings.json`; see the backlog item's own dated implementation note
// for the read-only `plan` output this mechanism proposes for this repo, left for explicit
// PO review rather than committed.

import { createHash, randomBytes } from "node:crypto";
import { existsSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { isDirectInvocation } from "../lib/entrypoint.mjs";

export const SETTINGS_ALLOWLIST_MERGE_PLAN_SCHEMA = "pipeline.settings-allowlist-merge-plan.v1";
export const SETTINGS_ALLOWLIST_MERGE_APPLY_SCHEMA = "pipeline.settings-allowlist-merge-apply.v1";
const TARGET_RELATIVE = ".claude/settings.json";

// The ONE registered candidate table (mirrors the "one registered table" convention this
// plugin already uses for CLI subcommands -- GUARDDERIVE-1 in project-onboarding-v3.mjs --
// applied here to allowlist candidates instead of subcommands). Adding a candidate here is
// a single, reviewable edit; nothing else in this file hand-maintains a second copy.
export const PIPELINE_CLI_SETTINGS_ALLOWLIST_CANDIDATES = Object.freeze([
  Object.freeze({
    id: "project-onboarding-v3",
    pattern: "Bash(node plugins/pipeline-core/scripts/project-onboarding-v3.mjs *)",
    cliScript: "plugins/pipeline-core/scripts/project-onboarding-v3.mjs",
    scope: "whole-script",
    guardVerification: "plugins/pipeline-core/scripts/project-onboarding-v3-argv-closure.test.mjs",
    rationale: "Every subcommand's entire argv surface is refused outside a closed grammar by the CLI's own parser; the settings-layer prefix cannot admit anything the parser itself does not.",
  }),
  Object.freeze({
    id: "pipeline-state-approve-push",
    pattern: "Bash(node plugins/pipeline-core/scripts/pipeline-state.mjs approve-push *)",
    cliScript: "plugins/pipeline-core/scripts/pipeline-state.mjs",
    scope: "subcommand:approve-push",
    guardVerification: "plugins/pipeline-core/scripts/pipeline-state-approve-push-argv-closure.test.mjs",
    rationale: "Only the approve-push subcommand's entire argv surface is validated by the closed parseExactFlags parser; pipeline-state.mjs's other subcommands are not verified closed, so the entry is scoped to the subcommand, not the whole script.",
  }),
]);

function sha256(value) { return createHash("sha256").update(value).digest("hex"); }

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value;
}

function diagnostic(path, code, message, repair) { return { path, code, message, repair }; }

function defaultDeps() {
  return { existsSync, readFileSync, writeFileSync, renameSync, unlinkSync };
}

function candidateSummaries() {
  return PIPELINE_CLI_SETTINGS_ALLOWLIST_CANDIDATES.map(({ id, pattern, cliScript, scope, guardVerification }) => ({ id, pattern, cliScript, scope, guardVerification }));
}

/**
 * Read-only. Never writes. Computes what `apply` WOULD change in
 * `<rootDir>/.claude/settings.json`: which of the plugin-owned candidate entries are
 * already present, which are missing, and the exact proposed after-bytes -- so a caller
 * (a human, or a report written by one) can review the full diff without ever calling
 * `applySettingsAllowlistMerge`.
 */
export function planSettingsAllowlistMerge({ rootDir = process.cwd(), deps: overrides = {} } = {}) {
  const fs = { ...defaultDeps(), ...overrides };
  const root = resolve(rootDir);
  const targetPath = join(root, TARGET_RELATIVE);
  const candidates = candidateSummaries();

  let before = { present: false, bytes: null, sha256: null, parsed: {} };
  if (fs.existsSync(targetPath)) {
    let raw;
    try {
      raw = fs.readFileSync(targetPath, "utf8");
    } catch (error) {
      return {
        schema: SETTINGS_ALLOWLIST_MERGE_PLAN_SCHEMA, status: "unrepairable", root, target: TARGET_RELATIVE,
        diagnostics: [diagnostic("$.target", "target_unreadable", error.message, "repair filesystem access to .claude/settings.json and re-plan")],
      };
    }
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      return {
        schema: SETTINGS_ALLOWLIST_MERGE_PLAN_SCHEMA, status: "unrepairable", root, target: TARGET_RELATIVE,
        diagnostics: [diagnostic("$.target", "target_invalid_json", `existing .claude/settings.json is not valid JSON: ${error.message}`, "repair the file by hand; this mechanism will not blind-overwrite invalid JSON")],
      };
    }
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {
        schema: SETTINGS_ALLOWLIST_MERGE_PLAN_SCHEMA, status: "unrepairable", root, target: TARGET_RELATIVE,
        diagnostics: [diagnostic("$.target", "target_invalid_shape", "existing .claude/settings.json is not a JSON object", "repair the file by hand")],
      };
    }
    before = { present: true, bytes: raw, sha256: sha256(raw), parsed };
  }

  const existingPermissions = before.parsed.permissions && typeof before.parsed.permissions === "object" && !Array.isArray(before.parsed.permissions)
    ? before.parsed.permissions
    : {};
  const existingAllow = Array.isArray(existingPermissions.allow) ? existingPermissions.allow : [];
  const existingAllowSet = new Set(existingAllow);

  const added = [];
  const skipped = [];
  for (const candidate of PIPELINE_CLI_SETTINGS_ALLOWLIST_CANDIDATES) {
    if (existingAllowSet.has(candidate.pattern)) skipped.push(candidate.id);
    else added.push(candidate.id);
  }

  const beforeSummary = { present: before.present, sha256: before.sha256 };

  if (added.length === 0) {
    return {
      schema: SETTINGS_ALLOWLIST_MERGE_PLAN_SCHEMA, status: "no-op", root, target: TARGET_RELATIVE,
      before: beforeSummary, candidates, added, skipped, after: null, planSha256: null, diagnostics: [],
    };
  }

  const addedPatterns = PIPELINE_CLI_SETTINGS_ALLOWLIST_CANDIDATES
    .filter((candidate) => added.includes(candidate.id))
    .map((candidate) => candidate.pattern);
  const mergedAllow = [...existingAllow, ...addedPatterns];
  const afterParsed = { ...before.parsed, permissions: { ...existingPermissions, allow: mergedAllow } };
  const afterBytes = `${JSON.stringify(afterParsed, null, 2)}\n`;
  const after = { bytes: afterBytes, sha256: sha256(afterBytes), byteLength: Buffer.byteLength(afterBytes, "utf8") };

  const planSha256 = sha256(JSON.stringify(stable({ root, target: TARGET_RELATIVE, before: beforeSummary, added, skipped, after: { sha256: after.sha256, byteLength: after.byteLength } })));

  return {
    schema: SETTINGS_ALLOWLIST_MERGE_PLAN_SCHEMA, status: "ready", root, target: TARGET_RELATIVE,
    before: beforeSummary, candidates, added, skipped, after, planSha256, diagnostics: [],
  };
}

/**
 * The only function in this module that writes. Requires an explicit `activate: true`
 * (never inferred, never defaulted) AND a `planSha256` that matches a freshly recomputed
 * plan (so a stale review can never authorize a different write). Writes atomically
 * (temp file + rename within the same `.claude` directory) and verifies the readback
 * matches the planned bytes before reporting success.
 */
export function applySettingsAllowlistMerge({ rootDir = process.cwd(), planSha256, activate = false, deps: overrides = {} } = {}) {
  if (!activate) {
    return {
      schema: SETTINGS_ALLOWLIST_MERGE_APPLY_SCHEMA, status: "activation-required", root: resolve(rootDir), target: TARGET_RELATIVE,
      diagnostics: [diagnostic("$.activate", "activation_required", "apply requires explicit activation", "review the plan's proposed diff, then pass --activate only after explicit human review")],
    };
  }
  const fs = { ...defaultDeps(), ...overrides };
  const plan = planSettingsAllowlistMerge({ rootDir, deps: overrides });
  if (plan.status === "no-op") {
    return { schema: SETTINGS_ALLOWLIST_MERGE_APPLY_SCHEMA, status: "no-op", root: plan.root, target: plan.target, diagnostics: [] };
  }
  if (plan.status !== "ready") {
    return { schema: SETTINGS_ALLOWLIST_MERGE_APPLY_SCHEMA, status: plan.status, root: plan.root, target: plan.target, diagnostics: plan.diagnostics };
  }
  if (plan.planSha256 !== planSha256) {
    return {
      schema: SETTINGS_ALLOWLIST_MERGE_APPLY_SCHEMA, status: "invalid-plan", root: plan.root, target: plan.target,
      diagnostics: [diagnostic("$.planSha256", "plan_digest_mismatch", "the supplied plan digest is not current", "run plan again and review the new diff before applying")],
    };
  }

  const root = plan.root;
  const targetPath = join(root, TARGET_RELATIVE);
  const nowPresent = fs.existsSync(targetPath);
  const nowSha256 = nowPresent ? sha256(fs.readFileSync(targetPath, "utf8")) : null;
  if (nowSha256 !== plan.before.sha256) {
    return {
      schema: SETTINGS_ALLOWLIST_MERGE_APPLY_SCHEMA, status: "invalid-plan", root, target: plan.target,
      diagnostics: [diagnostic("$.before", "target_changed_since_plan", "the target file changed since the plan was computed", "run plan again and review the new diff before applying")],
    };
  }

  const tempPath = join(root, ".claude", `.settings-allowlist-merge-${randomBytes(8).toString("hex")}.tmp`);
  try {
    fs.writeFileSync(tempPath, plan.after.bytes, { encoding: "utf8", mode: 0o600 });
    fs.renameSync(tempPath, targetPath);
  } catch (error) {
    try { if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath); } catch { /* best-effort cleanup */ }
    return {
      schema: SETTINGS_ALLOWLIST_MERGE_APPLY_SCHEMA, status: "write-failed", root, target: plan.target,
      diagnostics: [diagnostic("$.target", "write_failed", error.message, "repair filesystem access and retry")],
    };
  }

  const readback = fs.readFileSync(targetPath, "utf8");
  if (sha256(readback) !== plan.after.sha256) {
    return {
      schema: SETTINGS_ALLOWLIST_MERGE_APPLY_SCHEMA, status: "write-verify-failed", root, target: plan.target,
      diagnostics: [diagnostic("$.target", "readback_mismatch", "post-write readback does not match the planned bytes", "inspect the file by hand before trusting it")],
    };
  }

  return {
    schema: SETTINGS_ALLOWLIST_MERGE_APPLY_SCHEMA, status: "ready", root, target: plan.target,
    planSha256, added: plan.added, sha256: plan.after.sha256, diagnostics: [],
  };
}

function usage() {
  return [
    "Usage: settings-allowlist-merge.mjs plan --root <dir>",
    "       settings-allowlist-merge.mjs apply --root <dir> --plan-sha256 <sha256> --activate",
    "",
    "Read-only `plan` proposes the plugin-owned Pipeline-CLI allowlist entries",
    "(backlog/items/2026-08-08-the-harness-classifier-blocks-the-onboarding-action-the-pipeline-just-authorized.md)",
    "for <dir>/.claude/settings.json without writing anything. `apply` writes only when",
    "given the exact --plan-sha256 a fresh plan produces AND --activate; both are required.",
  ].join("\n");
}

function parse(args) {
  const output = { command: null, root: undefined, planSha256: undefined, activate: false, help: false };
  if (args.length === 0) return { error: "one command is required" };
  if (args[0] === "--help" || args[0] === "-h") return { help: true };
  if (!["plan", "apply"].includes(args[0])) return { error: `unknown argument: ${args[0]}` };
  output.command = args[0];
  for (let index = 1; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--root") {
      const root = args[index + 1];
      if (!root || root.startsWith("--")) return { error: "--root requires a project directory" };
      output.root = root; index += 1;
    } else if (arg === "--plan-sha256") {
      const digest = args[index + 1];
      if (!/^[a-f0-9]{64}$/u.test(digest ?? "")) return { error: "--plan-sha256 requires a lowercase SHA-256 digest" };
      output.planSha256 = digest; index += 1;
    } else if (arg === "--activate") {
      output.activate = true;
    } else if (arg === "--help" || arg === "-h") {
      output.help = true;
    } else {
      return { error: `unknown argument: ${arg}` };
    }
  }
  if (!output.help && !output.root) return { error: "--root is required" };
  if (output.command === "apply" && !output.help && !output.planSha256) return { error: "apply requires --plan-sha256" };
  return output;
}

export function main(args = process.argv.slice(2), {
  write = process.stdout.write.bind(process.stdout),
  writeError = process.stderr.write.bind(process.stderr),
  deps = {},
} = {}) {
  const options = parse(args);
  if (options.help) { write(`${usage()}\n`); return 0; }
  if (options.error) { write(`${usage()}\n${options.error}\n`); return 2; }

  let output;
  try {
    if (options.command === "plan") output = planSettingsAllowlistMerge({ rootDir: options.root, deps });
    else output = applySettingsAllowlistMerge({ rootDir: options.root, planSha256: options.planSha256, activate: options.activate, deps });
  } catch (error) {
    writeError(`SETTINGS-ALLOWLIST-MERGE-ERROR: ${String(error?.message ?? "command failed")}\n`);
    return 2;
  }

  write(`${JSON.stringify(output, null, 2)}\n`);
  return ["ready", "no-op"].includes(output.status) ? 0 : (output.status === "activation-required" ? 0 : 1);
}

if (isDirectInvocation(import.meta.url)) process.exit(main());
