#!/usr/bin/env node
/**
 * guard-push — PreToolUse guard enforcing the Push-Gate for Bash|PowerShell.
 *
 * Plugin: pipeline-core (Agent-Pipeline). AP1-P3 "DURIN". Canon: `.claude/pipeline.yaml`
 * gate "push" (this repo: blocking/human/standing-approved, E15/ADR-0017), `.claude/
 * plans/2026-07-07-ap1-pipeline-tuning.md` Leitentscheidung 3 ("Gates prüfen EVIDENZ-
 * Frische, nie selbst rechnen").
 *
 * WHY THIS FILE EXISTS
 *   `verify` and (later) the security scan produce evidence artifacts, but nothing
 *   stopped a `git push` from running against STALE or RED evidence, or without the
 *   approval the manifest's push gate demands. This hook runs strictly AFTER
 *   guard-git.mjs in the hook chain (deny-rule territory is guard-git's alone — see
 *   NOT DUPLICATED below); it adds evidence-freshness + approval gating on top of
 *   whatever guard-git already allowed through.
 *
 * NOT DUPLICATED (dedup confirmation, AP1-P3 briefing mandatory step 1): this hook
 * does NOT re-implement any guard-git.mjs deny rule (GG-01..GG-16 force-push/branch-
 * delete/reset --hard/etc.) — those stay guard-git's exclusive territory. This hook
 * only reuses guard-git's SHARED normalization helpers (`stripQuotedSegments`,
 * `normalizeGlobalGitOptions` from `../lib/git-cmd.mjs`) so push-command detection
 * can never drift out of sync with guard-git's own understanding of what a "git push"
 * looks like (quoted prose, chained commands, global git options).
 *
 * PUSH DETECTION: `/\bgit\s+push\b/` tested against the quote-stripped, lowercased,
 * global-option-normalized command — no anchors, so it matches "in ANY command
 * segment" without needing an explicit split on `&&`/`;`/`|` (the same effect guard-
 * git.mjs achieves with its own segment-scoped `[^|&;]*` regexes, just for a single
 * "is there a push at all" question rather than per-segment flag matching).
 *
 * EXIT SEMANTICS (shared with the guard family): 0 allow · 2 block (stderr reason,
 * mode "blocking") · 1 allow + non-blocking WARN (mode "warn", OR a malformed
 * manifest/state — "never silent-block, never silent-pass").
 *
 * ORDER OF EVALUATION
 *   1. Unparseable stdin / no command -> fail-open exit 0.
 *   2. Not a push command (after quote-stripping + option-normalization) -> exit 0
 *      fast path.
 *   3. Manifest absent -> exit 0 (whole feature is opt-in). Manifest present but
 *      genuinely unparseable YAML -> WARN exit 1 (malformed, never silent).
 *   4. Gate "push" absent, or `mode === "off"` -> exit 0.
 *   5. Otherwise (mode "blocking" or "warn"): evaluate ALL of the checks below,
 *      collect ALL failures, and report them TOGETHER in one German stderr message —
 *      never fail on the first mismatch alone, so a single push attempt surfaces
 *      every reason at once instead of a frustrating fix-one-fail-next loop.
 *        (a) `evidence/verify-latest.json` exists, `exitCode === 0`, and `commit`
 *            equals the current `git rev-parse HEAD`.
 *        (b) `evidence/security-latest.json` — SAME freshness checks as (a) — but
 *            ONLY evaluated when `gates.security` exists in the manifest AND its
 *            `mode !== "off"` (skipped entirely otherwise).
 *        (c) approval: `gates.push.approval === "standing-approved"` auto-passes
 *            (no state needed at all); `"required"` (or the field simply absent —
 *            treated as the safer default) requires
 *            `state.pushApproval.lastApproved.forCommit === HEAD` — a malformed
 *            `.claude/pipeline-state.json` at THIS point (only reached when the
 *            state file is actually needed) is its own WARN exit 1, same as (3).
 *   6. All checks pass -> exit 0 (allow).
 *   7. Any check failed -> mode "blocking" -> exit 2; mode "warn" -> exit 1. Same
 *      collected message either way.
 *
 * MECHANICS: stdin = `{ tool_input: { command } }` (PreToolUse contract). Wired via
 * plugins/pipeline-core/hooks/hooks.json in a LATER bundled wave (W-WIRE, TP-4) — this
 * delivery does not touch hooks.json; tests invoke this script directly via stdin pipe.
 *
 * VERIFY: node plugins/pipeline-core/hooks/guard-push.test.mjs
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

import { loadManifest, gateConfig } from "../lib/manifest.mjs";
import { stripQuotedSegments, normalizeGlobalGitOptions } from "../lib/git-cmd.mjs";

function emit(code, lines) {
  process.stderr.write(lines.filter(Boolean).join("\n") + "\n");
  process.exit(code);
}

// ---- read tool input (fail-open) --------------------------------------------------
let cmd = "";
try {
  const input = JSON.parse(readFileSync(0, "utf8"));
  cmd = String(input?.tool_input?.command ?? "");
} catch {
  process.exit(0); // fail-open: guard is a safety net, not a prison
}
if (!cmd) process.exit(0);

// ---- push detection (shared normalization with guard-git.mjs) ----------------------
const stripped = stripQuotedSegments(cmd);
const normalized = normalizeGlobalGitOptions(stripped.toLowerCase());
const isPush = /\bgit\s+push\b/.test(normalized);
if (!isPush) process.exit(0); // fast path: not a push at all

const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();

// ---- manifest: gate config (fail-open on absent, WARN on genuinely unreadable) -----
const manifestResult = loadManifest(projectDir);
if (manifestResult.status === "absent") process.exit(0); // opt-in feature, nothing configured
if (manifestResult.status === "invalid") {
  const reason = manifestResult.errors?.[0]?.reason ?? manifestResult.errors?.[0]?.path ?? "ungültiges Manifest";
  emit(1, [
    `[guard-push] WARN: .claude/pipeline.yaml ist ungültig (${reason}).`,
    `Push-Gate wird übersprungen (fail-open, niemals still blockend/durchlassend markiert) -- bitte reparieren.`,
  ]);
}
const manifest = manifestResult.manifest;
const pushGate = gateConfig(manifest, "push");
if (!pushGate || pushGate.mode === "off") process.exit(0);

// ---- current HEAD (needed for both evidence-freshness and approval checks) --------
function currentHead() {
  const res = spawnSync("git", ["rev-parse", "HEAD"], { cwd: projectDir, encoding: "utf8" });
  if (res.status !== 0 || !res.stdout) return null;
  return res.stdout.trim();
}
const head = currentHead();

/** Reads + JSON-parses an evidence file; returns {ok:true, data} | {ok:false, reason}. */
function readEvidence(relPath) {
  const p = join(projectDir, relPath);
  let raw;
  try {
    raw = readFileSync(p, "utf8");
  } catch {
    return { ok: false, reason: `${relPath} fehlt` };
  }
  let data;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    return { ok: false, reason: `${relPath} ist beschädigt (ungültiges JSON: ${e.message})` };
  }
  return { ok: true, data, relPath };
}

/** Runs the shared exitCode===0 + commit===HEAD freshness check; returns failure reasons (empty = pass). */
function checkEvidenceFreshness(relPath) {
  const failures = [];
  const read = readEvidence(relPath);
  if (!read.ok) {
    failures.push(read.reason);
    return failures;
  }
  const { data } = read;
  if (data?.exitCode !== 0) {
    failures.push(`${relPath}: exitCode=${JSON.stringify(data?.exitCode)} (erwartet 0)`);
  }
  if (head !== null && data?.commit !== head) {
    failures.push(`${relPath}: commit=${JSON.stringify(data?.commit)} ist veraltet (aktueller HEAD: ${head})`);
  }
  return failures;
}

const failures = [];

// (a) verify evidence -- always checked once the push gate is active.
failures.push(...checkEvidenceFreshness("evidence/verify-latest.json"));

// (b) security evidence -- only when a security gate is configured and not "off".
const securityGate = gateConfig(manifest, "security");
if (securityGate && securityGate.mode !== "off") {
  failures.push(...checkEvidenceFreshness("evidence/security-latest.json"));
}

// (c) approval.
if (pushGate.approval === "standing-approved") {
  // auto-pass, no state needed at all.
} else {
  // "required", or the field absent entirely -- treated as the safer default (a push
  // gate that is active at all, with no explicit standing-approval, should not
  // silently skip the approval check).
  const statePath = join(projectDir, ".claude", "pipeline-state.json");
  let stateRaw;
  let stateExists = true;
  try {
    stateRaw = readFileSync(statePath, "utf8");
  } catch {
    stateExists = false;
  }
  if (!stateExists) {
    failures.push(`Push-Freigabe fehlt: ${statePath} existiert nicht (noch nie via approve-push verbucht).`);
  } else {
    let state;
    try {
      state = JSON.parse(stateRaw);
    } catch (e) {
      emit(1, [
        `[guard-push] WARN: ${statePath} enthält ungültiges JSON (${e.message}).`,
        `Push-Gate wird übersprungen (fail-open, niemals still blockend/durchlassend markiert) -- bitte reparieren ` +
          `(nur via harness/scripts/pipeline-state.mjs neu schreiben, nie von Hand).`,
      ]);
    }
    const forCommit = state?.pushApproval?.lastApproved?.forCommit;
    if (!forCommit || forCommit !== head) {
      failures.push(
        `Push-Freigabe fehlt oder ist veraltet: state.pushApproval.lastApproved.forCommit=${JSON.stringify(
          forCommit ?? null,
        )}, erwartet HEAD=${JSON.stringify(head)}. Verbuchen: node harness/scripts/pipeline-state.mjs approve-push --by <name>.`,
      );
    }
  }
}

if (failures.length === 0) process.exit(0); // all-green -- allow

const message = [
  `BLOCKED (guard-push, plugin pipeline-core): Push-Gate-Prüfung fehlgeschlagen (${failures.length} Befund/e):`,
  ...failures.map((f, i) => `  ${i + 1}. ${f}`),
  `Kommando: ${cmd}`,
];

if (pushGate.mode === "warn") emit(1, message);
emit(2, message); // mode "blocking" (or any unrecognized non-"off" value -- errs safe)
