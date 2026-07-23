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
 *   - Defaults: `docs/`, `specs/`, `.claude/`, `backlog/` (drafting/reviewing the plan
 *     itself, or touching guardrail/state config, is never blocked by this gate).
 *   - The active feature's own `activeFeature.planPath` (so writing the plan draft
 *     that is AWAITING approval is never blocked by the very gate that reads it).
 *   - `gates.dev-plan.exemptPaths` (array of path-prefix strings) from the manifest,
 *     if present — project-specific additional exemptions.
 *
 * ABSOLUTE PATHS AND THE PROJECT ROOT (C1 fix, from a critic review):
 * Claude Code's Edit/Write PreToolUse contract typically delivers `tool_input.file_path`
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
import { readFileSync } from "node:fs";
import { join, relative, isAbsolute, posix } from "node:path";

import { loadManifest, gateConfig } from "../lib/manifest.mjs";

const DEFAULT_EXEMPT_PREFIXES = ["docs/", "specs/", ".claude/", "backlog/"];

function emit(code, lines) {
  process.stderr.write(lines.filter(Boolean).join("\n") + "\n");
  process.exit(code);
}

function normalize(p) {
  return String(p ?? "").replace(/\\/g, "/").toLowerCase();
}

// ---- read tool input (fail-open) --------------------------------------------------
let filePath = "";
try {
  const input = JSON.parse(readFileSync(0, "utf8"));
  filePath = String(input?.tool_input?.file_path ?? "");
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
const statePath = join(projectDir, ".claude", "pipeline-state.json");
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

if (state.planApproved === true) process.exit(0); // approved -- allow

// ---- exempt paths -------------------------------------------------------------------
const exemptPrefixes = [...DEFAULT_EXEMPT_PREFIXES];
if (typeof activeFeature.planPath === "string" && activeFeature.planPath !== "") {
  exemptPrefixes.push(activeFeature.planPath);
}
if (Array.isArray(gate.exemptPaths)) {
  for (const p of gate.exemptPaths) if (typeof p === "string" && p !== "") exemptPrefixes.push(p);
}

const isExempt = exemptPrefixes.some((prefix) => normalizedPath.startsWith(normalize(prefix)));
if (isExempt) process.exit(0);

// ---- verdict --------------------------------------------------------------------------
const message = [
  `BLOCKED (guard-devplan, plugin pipeline-core): Feature "${activeFeature.id}" has no approved plan yet.`,
  `Plan: ${typeof activeFeature.planPath === "string" ? activeFeature.planPath : "(no planPath recorded in state)"}`,
  `File: ${filePath}`,
  `Why: The Dev-Plan gate (.claude/pipeline.yaml, gate "dev-plan") requires a recorded approval BEFORE ` +
    `implementation edits (docs/operating-model.md §3.2 step 3b). Record approval: ` +
    `node harness/scripts/pipeline-state.mjs approve-plan --by <name>.`,
];

if (gate.mode === "warn") emit(1, message);
emit(2, message); // mode "blocking" (or any unrecognized non-"off" value -- errs safe)
