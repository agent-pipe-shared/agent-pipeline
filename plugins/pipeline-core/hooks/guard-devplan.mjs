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
import { readFileSync } from "node:fs";

import { devPlanGateVerdict } from "../lib/guard-devplan-policy.mjs";
import { writeTargetPath } from "../lib/tool-write-target.mjs";

// The exempt prefixes, the full decision logic and the full reasoning for each step now
// live in `lib/guard-devplan-policy.mjs` (`devPlanGateVerdict()`) so both this hook and the
// shipped obligations reference can be GENERATED from / call the same one owner. It has to
// be a separate module rather than logic inlined here: this file is a hook SCRIPT that
// calls process.exit(), so a reader that merely wants to know or reuse the policy (e.g.
// guard-lifecycle-ready.mjs's GUARD-DEVPLAN-SHELL, the Bash|PowerShell lane of this same
// gate) cannot import a script that dies on import -- it imports the pure function instead.
// One owner, two readers (three counting the obligations generator), no hand-copied second
// copy of the decision.

function emit(code, lines) {
  process.stderr.write(lines.filter(Boolean).join("\n") + "\n");
  process.exit(code);
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

// ---- decide (pure), then translate the verdict into this hook's exit protocol -----
const result = devPlanGateVerdict({ filePath, projectDir });
if (result.verdict === "allow") process.exit(0);
if (result.verdict === "warn") emit(1, [result.reason]);
emit(2, [result.reason]); // verdict "block"
