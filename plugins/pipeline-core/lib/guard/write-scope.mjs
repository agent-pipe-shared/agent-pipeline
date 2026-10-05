// SPDX-License-Identifier: SUL-1.0
// Guard module "write-scope" (layer 2), split out of guard-lifecycle-ready.mjs; declarations moved verbatim (s2-guard-split-plan.md).

import { isPhysicalScratchTarget } from "../physical-scratch-boundary.mjs";
import { existsSync, lstatSync, realpathSync, statSync, readFileSync as w04ReadFileSync, realpathSync as w04RealpathSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve, sep, dirname as w04Dirname } from "node:path";
import { machinePlaneFilePath } from "../machine-plane.mjs";
import { writeTargetPath } from "../tool-write-target.mjs";
import { ONBOARDING_CONSENT_MARK_SCRIPT, PARTIAL_LIFECYCLE_INCIDENT_REPORT_PATH, PARTIAL_LIFECYCLE_SCRATCH_DIR, RESTART_RESUME_HINT_INPUT_PATH, RESUME_HINT_SCRIPT, WRITE_TOOLS } from "./constants.mjs";
import { isPathWithinRealpathedRoot, isProjectWritePath } from "./path-containment.mjs";
import { simpleWords } from "./shell-grammar.mjs";
import { verdict } from "./verdict.mjs";

// ALFRED-QP3 (W0-4 F-2): the lane admits EXACTLY these three first path segments -- backlog, docs AND scratch -- and no
// other. The earlier prose named two; the tracked tests (QP3-4*) now pin all three, including that a traversal out of
// scratch/ ("scratch/../project/...") is refused.
const W04_RECORD_PREFIXES = Object.freeze(["backlog", "docs", "scratch"]);

function w04NormalizeRelative(value) {
  return value.replaceAll("\\", "/").replace(/^(?:\.\/)+/u, "").toLowerCase();
}

function w04BoundAuthorityPaths(root) {
  const paths = new Set();
  let read = 0;
  for (const state of [join(root, "project", "pipeline-state.json"), join(root, ".claude", "pipeline-state.json")]) {
    let text;
    try { text = w04ReadFileSync(state, "utf8"); } catch (error) {
      if (error?.code === "ENOENT") continue;
      return null;
    }
    let parsed;
    try { parsed = JSON.parse(text); } catch { return null; }
    read += 1;
    const stack = [parsed];
    while (stack.length > 0) {
      const value = stack.pop();
      if (typeof value === "string") paths.add(w04NormalizeRelative(value));
      else if (Array.isArray(value)) stack.push(...value);
      else if (value !== null && typeof value === "object") stack.push(...Object.values(value));
    }
  }
  return read === 0 ? null : paths;
}

function w04RecordSegments(rel) {
  if (rel === "" || rel === ".." || rel.startsWith("../") || isAbsolute(rel)) return null;
  const segments = rel.split("/");
  if (segments.length < 2 || !W04_RECORD_PREFIXES.includes(segments[0])) return null;
  if (segments.some((segment) => segment === "" || segment.startsWith(".") || segment === "node_modules")) return null;
  return segments;
}

export function w04IsNonAuthorityRecordWrite(input, toolName, root, dependencies = {}) {
  try {
    const target = writeTargetPath(input.tool_input, toolName);
    if (typeof target !== "string" || target === "" || target.includes("\0")) return false;
    if (!isProjectWritePath(target, root, dependencies)) return false;
    const absolute = resolve(root, target);
    const rel = relative(root, absolute).split(sep).join("/");
    if (w04RecordSegments(rel) === null) return false;
    const realpath = dependencies.w04RealpathSyncFn ?? w04RealpathSync;
    const realRoot = realpath(root);
    let current = absolute;
    const tail = [];
    for (;;) {
      try { current = realpath(current); break; } catch (error) {
        // ALFRED-QP3 (W0-4 hardening F-1): only "this component does not exist yet" may continue upward. Any other fault
        // (EACCES, EPERM, ELOOP, EIO ...) means the physical location cannot be established, and a record lane that cannot
        // prove where a write lands must refuse, never guess.
        if (error?.code !== "ENOENT" && error?.code !== "ENOTDIR") return false;
        const parent = w04Dirname(current);
        if (parent === current) return false;
        tail.unshift(basename(current));
        current = parent;
      }
    }
    const physicalRel = relative(realRoot, join(current, ...tail)).split(sep).join("/");
    if (w04RecordSegments(physicalRel) === null) return false;
    const bound = w04BoundAuthorityPaths(root);
    if (bound === null) return false;
    return !bound.has(w04NormalizeRelative(rel)) && !bound.has(w04NormalizeRelative(physicalRel));
  } catch { return false; }
}

/**
 * MEMPATH-1 (PO decision, 2026-08-08 -- backlog/items/2026-07-29-guard-lifecycle-ready-
 * blocks-claude-memory-writes.md, "PO decision, 2026-08-08 -- Option A"). Claude Code's own
 * PreToolUse hook payload carries `transcript_path`: this session's transcript file, as the
 * CLI itself reports it, never reconstructed or guessed from a sampled naming/hashing
 * scheme. `dirname(transcript_path)` is this session's project directory exactly as the CLI
 * lays it out; `<that>/memory/` is this project's memory directory -- the ONE narrow
 * carve-out this function exists to identify.
 *
 * Never a `~/.claude/**` prefix: that tree also holds `settings.json`, `agents/`, `plugins/`
 * and the local marketplace sits beside it, so admitting a prefix would admit all of those
 * too -- exactly the escape ADR-0059 Decision 5 and the cross-repository guard exist to
 * close. Never a path taken from tool input, an environment variable, or repository config
 * -- only from this CLI-supplied hook field, which is a fixed per-session value the agent's
 * own tool calls cannot set (unlike `tool_input`, which the calling tool call constructs).
 *
 * Fails closed whenever the derivation is unusable: `transcript_path` absent, empty,
 * relative, or naming a session directory whose own `memory/` does not yet exist on disk (an
 * empty session before Claude Code has created it, rather than guessing a lazy-create
 * contract this repository has not observed). realpathSync() on the full candidate resolves
 * every symlinked ancestor in one step, so a symlinked `~/.claude` or `projects/<hash>`
 * cannot misdirect the boundary this function hands back.
 */
export function claudeSessionMemoryDirectory(input, dependencies = {}) {
  const transcriptPath = input?.transcript_path;
  if (typeof transcriptPath !== "string" || transcriptPath.trim() === ""
    || transcriptPath.includes("\0") || !isAbsolute(transcriptPath)) return null;
  const realpath = dependencies.realpathSyncFn ?? realpathSync;
  const statFn = dependencies.statSyncFn ?? statSync;
  const candidate = join(dirname(transcriptPath), "memory");
  try {
    const real = realpath(candidate);
    return statFn(real).isDirectory() ? real : null;
  } catch {
    return null;
  }
}

/**
 * Admit a write only strictly inside the derived memory directory above, through the same
 * realpath walk isProjectWritePath() uses -- a symlink planted inside the memory directory
 * cannot redirect a write outside it, and a path that merely contains the segment `memory`
 * without landing inside the exact derived directory is refused by the same lexical
 * containment check.
 */
export function isClaudeSessionMemoryWritePath(filePath, input, dependencies = {}) {
  if (typeof filePath !== "string" || filePath.trim() === "" || filePath.includes("\0")
    || !isAbsolute(filePath)) return false;
  const memoryDir = claudeSessionMemoryDirectory(input, dependencies);
  if (memoryDir === null) return false;
  return isPathWithinRealpathedRoot(filePath, memoryDir, dependencies);
}

/**
 * MACHPATH-1 (PO decision, 2026-08-08 -- specs/sprint-nova-epic/plans/nova-setup-bootstrap.md
 * SS6a, "Where the machine plane lives"). The second, and so far last, write surface this
 * guard admits outside the project root: exactly one file, `<homedir>/.agent-pipeline/
 * machine.json`, the machine-scoped configuration plane a bootstrap writes once per machine
 * (push-approval default, key directory, model routing, language -- never a project's own
 * committed `gates.push_approval`, which stays inside the repository, SS2/SS7 of that plan).
 *
 * SETUP-2b/AC-9: `machinePlaneFilePath()` itself now lives in `../lib/machine-plane.mjs`,
 * imported above and re-exported unchanged so no existing test import breaks -- that module
 * is the SOLE derivation of this path anywhere in the plugin, and this guard's admission
 * decision reads it from there rather than keeping a second copy that could drift. Its own
 * doctrine (never `tool_input`/`process.env`/repository config, `os.homedir()` realpathed
 * once, fails closed on an absent/empty/relative/unresolvable home) is documented in full at
 * its new home; nothing about that doctrine changed by moving it.
 */

/**
 * Admit a write only when it is EXACTLY the single derived file above -- never a prefix, never
 * a directory. `isPathWithinRealpathedRoot()` alone has no notion of "exactly one file": rooted
 * at a directory it legitimately admits anything nested inside it, which is precisely what the
 * memory carve-out above wants for its directory and precisely what THIS carve-out must refuse
 * (a sibling `other.json`, a nested `sub/machine.json`, the bare `.agent-pipeline` directory).
 * Reusing it unmodified with root = the target FILE itself is not possible either: the file
 * need not already exist (the whole point is the first write that creates it), and that walk's
 * base case realpaths its own root, which would throw on a not-yet-created file.
 *
 * So identity is checked first, against the resolved (lexically normalized) candidate -- this
 * alone closes the single-file, no-prefix, and lexical-escape (`../..`) requirements. An
 * explicit leaf check runs next: if `machine.json` itself already exists and is not its own
 * realpath, the candidate is refused outright, before the shared walk below ever runs -- that
 * walk only starts climbing when the candidate does not yet exist, so an existing `machine.json`
 * planted as a symlink would otherwise realpath straight through to whatever it points at and
 * be admitted merely for staying inside the home directory, which would let this carve-out
 * resolve onto an arbitrary EXISTING in-home file of another name, `~/.claude/settings.json`
 * among them -- exactly the file `claudeSessionMemoryDirectory()` above refuses ever to admit
 * as a prefix. That is refused unconditionally: the final path segment resolving to anywhere
 * other than itself is never accepted, whatever it points at.
 *
 * The shared containment walk is then reused exactly as every other caller uses it, rooted at
 * the already-realpathed home directory (which does exist) rather than at the file itself, for
 * the ancestor protection that root actually gives -- stated exactly, not overclaimed: a
 * `.agent-pipeline` planted as a symlink before this write runs cannot redirect the write
 * OUTSIDE the realpathed home directory, but it CAN redirect it to any other location INSIDE
 * that same home directory. That remains an accepted, pinned limit, not a defended one, and it
 * stays narrower than the leaf case above: the file created there is always a NEW `machine.json`
 * in the redirected directory, never an existing file of another name -- the leaf check just
 * above is exactly what keeps that true. That home directory, on this machine class, also holds
 * the CLI's own `~/.claude/` configuration tree and the local plugin marketplace beside it -- the
 * same trees `claudeSessionMemoryDirectory()` above refuses ever to admit as a prefix. A party
 * able to plant such a symlink before this write ever runs already has write access inside the
 * real home directory, exactly the access section 5a of the same plan excludes from this guard's
 * threat model. The realpath semantics themselves are identical to every other caller of that
 * walk; only the root differs.
 */
export function isMachinePlaneWritePath(filePath, dependencies = {}) {
  if (typeof filePath !== "string" || filePath.trim() === "" || filePath.includes("\0")
    || !isAbsolute(filePath)) return false;
  const target = machinePlaneFilePath(dependencies);
  if (target === null || resolve(filePath) !== target) return false;
  const exists = dependencies.existsSyncFn ?? existsSync;
  const realpath = dependencies.realpathSyncFn ?? realpathSync;
  try {
    // The one case isPathWithinRealpathedRoot()'s own ancestor walk cannot catch: it only
    // starts climbing when the candidate itself does not yet exist. When `machine.json`
    // already exists as a symlink, that walk realpaths the leaf and admits any target still
    // inside the home directory -- which would let this carve-out resolve onto an arbitrary
    // existing in-home file, `~/.claude/settings.json` among them. Refused here, before the
    // shared walk ever runs; the not-yet-existing case (the ordinary first write) is
    // untouched, since `exists(target)` is false for it.
    if (exists(target) && realpath(target) !== target) return false;
  } catch {
    return false;
  }
  return isPathWithinRealpathedRoot(filePath, dirname(dirname(target)), dependencies);
}

/**
 * GF-078 bug 1. `writeTargetPath()` (lib/tool-write-target.mjs, out of this dispatch's
 * scope) only ever reads the Claude Code `file_path`/`notebook_path` keys -- Codex's own
 * write-capable tool is `apply_patch`, whose `tool_input.command` carries the ENTIRE patch
 * envelope text (`*** Begin Patch\n*** Add File: <path>\n...\n*** End Patch`), never a
 * `file_path` field. Simply adding `"apply_patch"` to `WRITE_TOOLS` would therefore not
 * admit this write -- it would make `writeTargetPath()` see an always-empty target for
 * EVERY apply_patch call (both of its fallback reads return ""), turning this into a
 * blanket refusal of every apply_patch write during restart-required rather than the one
 * narrow admission this function exists to grant. `WRITE_TOOLS` itself, and every other
 * caller of `writeTargetPath()`, are deliberately left untouched; only this one call site
 * gains a second, apply_patch-shaped extraction, narrow enough to name only the two patch
 * headers that create or fully replace a file's content ("Add File" / "Update File"),
 * mirroring guard-apply-patch.mjs's own header regex. "Delete File" and a bare "Move to"
 * destination are deliberately not matched: neither writes the resume-hint JSON body this
 * admission exists for.
 *
 * Exported for the same reason `isRestartResumeHintCapture()` already is: direct,
 * regression-testable coverage of this function's own decision, independent of whatever a
 * given caller's own tool-name gate happens to admit further up the call chain.
 */
function applyPatchTargetsResumeHintInput(command, root) {
  if (typeof command !== "string") return false;
  const lines = command.replace(/\r\n/gu, "\n").split("\n");
  for (const line of lines) {
    const header = line.match(/^\*\*\* (?:Add File|Update File): (.*)$/u);
    if (!header) continue;
    const filePath = header[1];
    if (typeof filePath === "string" && filePath !== ""
      && resolve(root, filePath) === join(root, RESTART_RESUME_HINT_INPUT_PATH)) return true;
  }
  return false;
}

export function isRestartResumeHintInputWrite(input, root) {
  const toolName = String(input?.tool_name ?? "");
  if (WRITE_TOOLS.includes(toolName)) {
    const filePath = writeTargetPath(input?.tool_input, toolName);
    return filePath !== ""
      && resolve(root, filePath) === join(root, RESTART_RESUME_HINT_INPUT_PATH);
  }
  if (toolName === "apply_patch") {
    return applyPatchTargetsResumeHintInput((input?.tool_input?.command ?? input?.tool_input?.CommandLine), root);
  }
  return false;
}

// NVA-MICRO-1 (backlog: 2026-08-09-restart-resume-hint-write-misses-the-project-prefix.md):
// a write that ALREADY missed isRestartResumeHintInputWrite() above (so this is only ever
// called after that returned false) but names the exact same file BASENAME the admitted path
// requires -- e.g. `.resume-hint-input.json` written at the repository root instead of under
// `project/`. That is a narrow, diagnosable margin: a self-correctable agent path error, not a
// case requiring a human. Deliberately narrow -- a write to a same-named file under a
// completely unrelated tree still counts (same basename is the only signal this checks,
// mirroring how little information the guard actually has about "how close" a miss is), but a
// write whose basename differs entirely (e.g. `project/resume-hint.json`, already covered by
// this file's own restart-required fixture) is NOT a near miss and falls through unchanged to
// the generic denial.
const RESTART_RESUME_HINT_INPUT_BASENAME = basename(RESTART_RESUME_HINT_INPUT_PATH);

export function restartResumeHintNearMissWrite(input, root) {
  const toolName = String(input?.tool_name ?? "");
  if (!WRITE_TOOLS.includes(toolName)) return false;
  const filePath = writeTargetPath(input?.tool_input, toolName);
  if (filePath === "") return false;
  const resolved = resolve(root, filePath);
  if (resolved === join(root, RESTART_RESUME_HINT_INPUT_PATH)) return false;
  return basename(resolved) === RESTART_RESUME_HINT_INPUT_BASENAME;
}

// Exported so the artifact that PRINTS this command can be tested against the rule
// that admits it. It was not, and the two disagreed: the bootstrap skill described a
// free `--card-file <json>` while this admits one fixed path, so the §6 duty was
// unsatisfiable in the pre-restart state that imposes it (measured 2026-08-09).
export function isRestartResumeHintCapture(command, root, options = {}) {
  const words = simpleWords(command, root, options);
  const platform = options.platform ?? process.platform;
  const directNode = platform === "win32" ? ["node", "node.exe"] : ["node"];
  const trustedNode = options.processExecPath ?? process.execPath;
  if (!words || ![...directNode, trustedNode].includes(words[0])) return false;
  const [script, ...args] = words.slice(1);
  return script === RESUME_HINT_SCRIPT
    && args[0] === "capture"
    && args[1] === "--root" && args[2] === root
    && args[3] === "--card-file" && args[4] === join(root, RESTART_RESUME_HINT_INPUT_PATH)
    && args[5] === "--consume-card" && args.length === 6;
}

// Reading the captured handover is the required step immediately after
// capture. This exact root-bound shape is passive and cannot change state.
export function isRestartResumeHintInspect(command, root, options = {}) {
  const words = simpleWords(command, root, options);
  const platform = options.platform ?? process.platform;
  const directNode = platform === "win32" ? ["node", "node.exe"] : ["node"];
  const trustedNode = options.processExecPath ?? process.execPath;
  if (!words || ![...directNode, trustedNode].includes(words[0])) return false;
  const [script, ...args] = words.slice(1);
  return script === RESUME_HINT_SCRIPT
    && args[0] === "inspect"
    && args[1] === "--root" && args[2] === root
    && args.length === 3;
}

/**
 * NVA-LCREADONLY-1 (backlog: 2026-08-17-partial-lifecycle-blocks-read-only-diagnosis-and-
 * tmp-fallback.md): the write-side twin of isReadOnlyDiagnosticCommand() above, scoped to
 * the ONE directory a session stuck at `partial` needs in order to leave a trace of its own
 * incident -- `mkdir scratch` or `mkdir -p scratch`, nothing else. Exact by construction,
 * like every sibling admission in this file: the target argument must resolve to exactly
 * `<root>/scratch`, so `mkdir scratch/nested`, `mkdir somethingelse` and any extra or
 * reordered flag all still fall through to the ordinary GUARD-LIFECYCLE-NOT-READY refusal.
 * This function only recognizes the shape; the caller (evaluateAfterGrammarAdmission()
 * below) is the one that gates it on `lifecycleStatus === "partial"`.
 */
/**
 * NVA-GF-SCRATCH: the write-side twin of the `partial` diagnosis lane above, but scoped to the
 * two onboarding-readiness statuses named in INTAKE_LIFECYCLE_STATUSES rather than to one fixed
 * filename -- matching guard-devplan.mjs's own scratch/ prefix exemption
 * (lib/guard-devplan-policy.mjs DEFAULT_EXEMPT_PREFIXES), which already admits any path under
 * scratch/ in every dev-plan phase. The lexical path must be strictly inside <root>/scratch,
 * then its nearest existing ancestor must realpath inside that physical scratch boundary. This
 * rejects a scratch root or descendant alias into product or authority paths without widening
 * the pre-plan lane. The caller (evaluateAfterGrammarAdmission() below) gates this on lifecycle
 * status; it does not make scratch a general project-write exemption.
 */
export function isPhysicalIntakeScratchPath(filePath, root, dependencies = {}, { allowScratchRoot = false } = {}) {
  return isPhysicalScratchTarget(filePath, { rootDir: root, allowScratchRoot,
    lstat: dependencies.lstatSyncFn ?? lstatSync, realpath: dependencies.realpathSyncFn ?? realpathSync });
}

/**
 * NVA-LCREADONLY-1 (backlog: 2026-08-17-partial-lifecycle-blocks-read-only-diagnosis-and-
 * tmp-fallback.md): the write-side twin of isReadOnlyDiagnosticCommand() above, scoped to
 * the ONE directory a session stuck at `partial` needs in order to leave a trace of its own
 * incident -- `mkdir scratch` or `mkdir -p scratch`, nothing else. Exact by construction,
 * like every sibling admission in this file: the target argument must resolve to exactly
 * `<root>/scratch`, so `mkdir scratch/nested`, `mkdir somethingelse` and any extra or
 * reordered flag all still fall through to the ordinary GUARD-LIFECYCLE-NOT-READY refusal.
 * This function only recognizes the shape; the caller (evaluateAfterGrammarAdmission()
 * below) is the one that gates it on `lifecycleStatus === "partial"`.
 */
export function isPartialLifecycleScratchDirCreate(command, root) {
  const words = simpleWords(command, root);
  if (!words || words.length === 0) return false;
  if (basename(words[0]).toLowerCase() !== "mkdir") return false;
  const args = words.slice(1);
  const target = args.length === 1 ? args[0]
    : args.length === 2 && args[0] === "-p" ? args[1]
      : null;
  return target !== null && resolve(root, target) === join(root, PARTIAL_LIFECYCLE_SCRATCH_DIR);
}

/**
 * NVA-LCREADONLY-1: the Write/Edit-side twin -- the ONE fixed incident-report file a session
 * stuck at `partial` may create to persist a report of its own stuck state. Deliberately
 * scoped to Edit/Write only (never NotebookEdit, which this fixed `.md` path can never
 * legitimately name) and to this one exact resolved path -- no other filename, no directory
 * write, no glob. Shaped like isRestartResumeHintInputWrite() above; the caller is again the
 * one that gates this on `lifecycleStatus === "partial"`.
 */
export function isPartialLifecycleIncidentReportWrite(input, root) {
  const toolName = String(input?.tool_name ?? "");
  if (toolName !== "Edit" && toolName !== "Write") return false;
  const filePath = writeTargetPath(input?.tool_input, toolName);
  return filePath !== "" && resolve(root, filePath) === join(root, PARTIAL_LIFECYCLE_INCIDENT_REPORT_PATH);
}

export function isIntakeLifecycleScratchWrite(input, root, dependencies = {}) {
  const toolName = String(input?.tool_name ?? "");
  if (!WRITE_TOOLS.includes(toolName)) return false;
  const filePath = writeTargetPath(input?.tool_input, toolName);
  if (filePath === "") return false;
  return isPhysicalIntakeScratchPath(filePath, root, dependencies);
}

// NVA-B-GREENFIELD-SCRATCH-1: bootstrap document binding already admits the
// exact generated PRD/spec authoring targets below, but the same lifecycle
// status previously denied temporary in-repository scratch authoring. Reuse
// the intake predicate's resolved physical-containment test while narrowing
// this sibling admission to the two text authoring tools named by the
// bootstrap flow; NotebookEdit and every Bash command remain governed by the
// ordinary not-ready lane.
export function isBootstrapBindingScratchWrite(input, root, dependencies = {}) {
  const toolName = String(input?.tool_name ?? "");
  return (toolName === "Edit" || toolName === "Write")
    && isIntakeLifecycleScratchWrite(input, root, dependencies);
}

/**
 * NVA-GF-SCRATCH: the Bash-side twin -- `mkdir scratch`, `mkdir -p scratch`, and (unlike the
 * `partial` lane's isPartialLifecycleScratchDirCreate(), which admits only the bare directory
 * itself) `mkdir -p scratch/<nested>`, since a genuine scratch write may need a nested holding
 * directory first. Exact by construction via the identical resolve()+pathInside() comparison as
 * the write-side twin above; any other target, or any extra/reordered flag simpleWords() cannot
 * parse into this shape, still falls through to the ordinary GUARD-LIFECYCLE-NOT-READY refusal.
 */
export function isIntakeLifecycleScratchMkdir(command, root, dependencies = {}) {
  const words = simpleWords(command, root);
  if (!words || words.length === 0) return false;
  if (basename(words[0]).toLowerCase() !== "mkdir") return false;
  const args = words.slice(1);
  const target = args.length === 1 ? args[0]
    : args.length === 2 && args[0] === "-p" ? args[1]
      : null;
  if (target === null) return false;
  return isPhysicalIntakeScratchPath(target, root, dependencies, { allowScratchRoot: true });
}

/**
 * NVA-BL-INTAKEBIND-1 (backlog: 2026-08-19-material-intake-bootstrap-bind-has-
 * no-sanctioned-path-to-a-passing-plan-gate.md; design.md SSa.4/SSc.3): the
 * design's own intended review step for a session observed at
 * `bootstrap-binding-required` (checkpoint transactionState "generated") --
 * without this admission no tool could ever perform that edit, since this
 * guard refuses every Edit/Write while onboarding isn't `ready`, with no
 * override route (ADR-0059 Decision 5 below).
 *
 * NVA-GS15-1: `isBootstrapBindingStagingAuthoringWrite` (imported above) moved
 * to `../lib/onboarding-staging-authoring.mjs` so a second guard
 * (guard-gate-strength.mjs, GS-15) can share the identical predicate instead
 * of defining a second copy that drifts from it -- see that module for the
 * full shape/rationale. The caller (evaluateAfterGrammarAdmission() below) is
 * the one that gates this on `lifecycleStatus === "bootstrap-binding-required"`.
 */

function onboardingConsentMarkerPath(root, sessionId) {
  return join(root, ".claude", `.pipeline-install-consent-${sessionId}.json`);
}

function onboardingConsentBlocked(input, root) {
  const toolName = String(input?.tool_name ?? "");
  if (!WRITE_TOOLS.includes(toolName)) return null;
  const sessionId = typeof input?.session_id === "string" && input.session_id !== ""
    ? input.session_id
    : null;
  if (!sessionId) return null;
  const markerPath = onboardingConsentMarkerPath(root, sessionId);
  const exists = existsSync(markerPath);
  if (exists) return null;
  const command = `node "${ONBOARDING_CONSENT_MARK_SCRIPT}" record --root "${root}" --session-id "${sessionId}" --answer yes`;
  const commandNo = `node "${ONBOARDING_CONSENT_MARK_SCRIPT}" record --root "${root}" --session-id "${sessionId}" --answer no`;
  return verdict(
    2,
    "BLOCKED (guard-lifecycle-ready, plugin pipeline-core): GUARD-ONBOARDING-CONSENT-REQUIRED: "
      + `Ask the user, then run this consent-record action with the observed answer:\n${command}\n`
      + `(or to record refusal: ${commandNo})\n`
      + "After recording yes or no, retry the identical write action.\n",
  );
}
