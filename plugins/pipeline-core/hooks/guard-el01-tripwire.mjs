#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * guard-el01-tripwire — PreToolUse guard giving EL-01 a write-time tripwire.
 *
 * Plugin: pipeline-core (Agent-Pipeline). Backlog:
 * backlog/items/2026-08-08-el-01-has-no-in-session-tripwire.md. Canon:
 * roles/elephant.md EL-01 (no production code, rigor-0/no-risk-flag stage-0
 * exception only) and EL-16 (delegate-first, execution phase).
 *
 * WHY THIS FILE EXISTS
 *   EL-01 was, until now, enforced only by review after the fact: commit
 *   trailers and dispatch records are inspected once the commits already
 *   exist (the mandatory authorship check at close). Commit `e7f6e96`
 *   (2026-08-08) showed the gap live -- an orchestrator-session commit to a
 *   test file, no `Dispatch:` trailer, no dispatch record, caught by a Critic
 *   two rounds later when the commit was already immutable. This hook makes
 *   the same rule a deterministic PreToolUse refusal instead of a disclosure.
 *
 * PO DECISION (2026-08-18, recorded in the backlog item above) settles the
 * two design questions the item explicitly deferred:
 *   1. Enforcement shape: REFUSE (hard block), matching the guard family's
 *      other hard-block guards (force-push/history-rewrite/protected-branch).
 *   2. Session-identity signal: trust the presence of an active, matching,
 *      currently-open dispatch record (a live `dispatch-record*.json` with
 *      `outcome: "in-progress"`, per the goldfish-task.md GF-09-D opening-act
 *      duty) rather than a self-asserted role string in a prompt. A dispatch
 *      record is existing, already machine-checked infrastructure -- not a
 *      new trust surface a prompt could forge.
 *
 * TRIGGER CONDITION -- risk class, not rigor
 *   EL-01's own stage-0 fast-path exception lists its criteria explicitly:
 *   "ALL criteria: <= 2 files, <= ~25 diff lines, no architecture/schema/
 *   public-API/test/guardrail-hook-CI/dependency/security-surface change,
 *   trivially git-revert-able, and no risk flag set". Rigor level is never
 *   named in that list at all -- only the risk flag is. File count and diff
 *   size are also properties of the whole task's eventual diff, not of one
 *   PreToolUse call in isolation: a hook firing BEFORE an edit lands cannot
 *   know how many files or lines the finished task will touch. This hook
 *   therefore enforces the one criterion that both (a) is actually named by
 *   EL-01's exception and (b) is a per-FEATURE, not per-diff, static fact
 *   determinable at any single call: whether the active feature's Risk class
 *   is "high". This is a disclosed, deliberate narrowing -- see NOT COVERED.
 *
 *   Risk class is read from the active feature's spec "ID card" table (the
 *   same `| Risk class | high |` / `| Rigor level | 2 |` row pattern used
 *   across this repo's specs, e.g. specs/sprint-phoenix-epic/spec.md:5-6).
 *   `project/pipeline-state.json`'s `activeFeature` object itself carries only
 *   `{ id, planPath, phase }` -- no rigor/risk fields -- so the spec file is
 *   the actual machine-readable source, reached via the state's own
 *   `continuity.authority.spec.path` (sha256-bound authority reference) when
 *   `continuity.featureId` matches the active feature, falling back to the
 *   conventional sibling `spec.md` next to `activeFeature.planPath` (the
 *   PRD/spec co-location convention every current spec directory in this repo
 *   follows). Rigor is NOT extracted or used as a gating input, per the
 *   paragraph above.
 *
 * SOURCE PATH -- EL-01's own permitted set, as prefixes
 *   The backlog item spells out EL-01's permitted output set in exactly these
 *   words: "specs, plans, briefings, gate decisions, register/ADR entries,
 *   handover updates, backlog/items/". Concretely, as path prefixes:
 *     - `specs/`        -- specs, plans, PRDs, acceptance/design docs.
 *     - `docs/`         -- register (docs/state.md), ADRs (docs/adr/),
 *                          handover updates, most gate-decision records.
 *     - `backlog/items/`-- the narrow EL-01 wording, not the broader
 *                          `backlog/` guard-devplan.mjs exempts for its own
 *                          (different) gate.
 *     - `.claude/`       -- the state file itself, where some gate decisions
 *                          are recorded (mirrors guard-devplan.mjs's own
 *                          default exemption for the same reason).
 *   A `dispatch-record*.json` write is ALSO exempt regardless of location:
 *   it is not production code (EL-01's own subject), it is a process/ledger
 *   artifact analogous to a handover update, and exempting it is what lets
 *   the trust mechanism bootstrap -- a dispatched Goldfish's OWN first act
 *   (GF-09-D) is writing this exact file, before any matching record yet
 *   exists on disk to admit that very write.
 *
 * DISPATCH-RECORD MATCH -- "genuine, independently-checkable artifact",
 * never a prompt self-assertion
 *   A candidate file is named `dispatch-record.json` or
 *   `dispatch-record-<anything>.json` (case-insensitive), found by a bounded
 *   recursive walk of the project root (dispatch records are written at a
 *   per-briefing-chosen path -- this repo alone has live examples at the
 *   root, e.g. `dispatch-record.json`, and nested, e.g.
 *   `plugins/pipeline-core/scripts/dispatch-record.json` -- so a fixed single
 *   location would miss real records). It counts as ADMITTING evidence only
 *   when it is valid JSON, an object, and carries every field the
 *   goldfish-task.md GF-09-D opening-act duty requires with the right shape
 *   (`taskId`/`dispatcher`/`outcome` non-empty strings, `rulesetSha` matching
 *   the 64-hex-digit SHA-256 shape, `log` an array) AND `outcome ===
 *   "in-progress"` -- the exact value GF-09-D specifies for the opening write,
 *   before any terminal outcome ("passed"/"failed"/"stopped"/...) closes it.
 *   A single ad hoc `{"outcome":"in-progress"}` does not pass this: the
 *   forger has to reconstruct the whole real shape, a materially higher bar
 *   than a prompt-level role claim, though (see NOT COVERED) not a
 *   cryptographic proof.
 *
 * NOT COVERED (gate honesty, QG-05) -- a tripwire, not a sandbox, same
 * accepted trade-off guard-testpath.mjs/guard-git.mjs already name for
 * themselves
 *   - File-count/diff-size/test-exclusion, the other stage-0 criteria: not
 *     checkable per single PreToolUse call (see TRIGGER CONDITION). A task
 *     that is properly risk-flagged is caught regardless; a task that should
 *     have been risk-flagged and was not is a triage error this hook cannot
 *     see (same class of gap the manifest/state read-only philosophy accepts
 *     everywhere else in this guard family).
 *   - The dispatch-record match does not bind to THIS session specifically
 *     (no session_id capture exists in the dispatch-record schema today, and
 *     adding one is a schema/template change outside this hook's scope) --
 *     it binds to "some dispatch is genuinely open right now", which is the
 *     PO-adopted signal. A determined orchestrator session could still write
 *     during a real Goldfish's open window without this hook telling the two
 *     apart. Guards bind agents, not humans engineering an elaborate forgery;
 *     the after-the-fact authorship check (EL-01's existing enforcement)
 *     remains the backstop this hook does not replace, only precedes.
 *   - Plain shell writes (redirects from Bash/PowerShell) are not seen here
 *     either -- same accepted gap guard-testpath.mjs already documents for
 *     itself, for the same reason (hooks.json routes Bash/PowerShell through
 *     guard-git.mjs only).
 *   - No audited human-guard-override escape hatch is offered by this guard.
 *     Unlike guard-testpath.mjs/guard-push.mjs, the sanctioned resolution to
 *     a block here is not "override the guard" -- it is "do the correct
 *     thing", which is always available and no harder than the blocked
 *     action: dispatch a Goldfish (`templates/prompts/goldfish-task.md`,
 *     EL-05). Offering a self-service override on a no-production-code rule
 *     would let the orchestrator clear its own gate, which is exactly the
 *     failure this hook exists to close.
 *
 * MECHANICS: stdin = `{ tool_name, tool_input: { file_path | notebook_path,
 * ... } }` (PreToolUse contract). Wired via
 * plugins/pipeline-core/hooks/hooks.json, matcher `Edit|Write|NotebookEdit`
 * (this file's own registration follows the file's documented WRITE-TOOL
 * COVERAGE invariant, not a narrower Edit|Write-only matcher -- a .ipynb cell
 * is as much a source path as a .mjs file, and this repo already paid once
 * for a matcher that silently missed NotebookEdit).
 *
 * EXIT SEMANTICS (shared with the guard family): 0 allow (fail-open on
 * anything unreadable/absent/undeterminable -- consistent with
 * guard-devplan.mjs/guard-testpath.mjs's own "no config/state -> nothing to
 * enforce yet" philosophy) · 2 block (stderr reason) · 1 allow + non-blocking
 * WARN (state file present but not valid JSON -- surfaced loudly rather than
 * silently either blocking or silently no-op'ing, QG-05).
 *
 * VERIFY: node plugins/pipeline-core/hooks/guard-el01-tripwire.test.mjs
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { isAbsolute, join, posix, relative, resolve } from "node:path";

import {
  LEGACY_STATE,
  NEUTRAL_STATE,
  resolveProjectAuthorityPaths,
} from "../lib/project-authority.mjs";
import { writeTargetPath } from "../lib/tool-write-target.mjs";

const EXEMPT_PREFIXES = ["docs/", "specs/", "backlog/items/", ".claude/"];
const DISPATCH_RECORD_BASENAME = /^dispatch-record(-[^/]*)?\.json$/i;
const SKIP_DIR = /^(?:\.|node_modules$|coverage$|dist$|build$)/;
const SHA256 = /^[a-f0-9]{64}$/i;
const MAX_WALK_ENTRIES = 200000; // defensive cap; see header NOT COVERED

function emit(code, lines) {
  process.stderr.write(lines.filter(Boolean).join("\n") + "\n");
  process.exit(code);
}

function normalize(p) {
  return String(p ?? "").replace(/\\/g, "/").toLowerCase();
}

/** Active feature's own Risk-class row from its spec "ID card" table, if resolvable. */
function resolveSpecPath(state) {
  const feature = state?.activeFeature;
  if (!feature || typeof feature !== "object" || typeof feature.id !== "string" || feature.id === "") return null;
  const continuity = state?.continuity;
  if (continuity && typeof continuity === "object" && continuity.featureId === feature.id) {
    const specAuthority = continuity?.authority?.spec;
    if (specAuthority && typeof specAuthority === "object"
      && typeof specAuthority.path === "string" && specAuthority.path !== "") {
      return specAuthority.path;
    }
  }
  if (typeof feature.planPath === "string" && feature.planPath !== "") {
    const parts = feature.planPath.split("/");
    parts.pop();
    if (parts.length > 0) return `${parts.join("/")}/spec.md`;
  }
  return null;
}

function extractRiskClass(specText) {
  const m = /^\|\s*risk class\s*\|\s*([^|]+?)\s*\|/im.exec(specText);
  if (!m) return null;
  const word = /^[a-z]+/i.exec(m[1].trim());
  return word ? word[0].toLowerCase() : null;
}

function isValidDispatchRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && typeof value.taskId === "string" && value.taskId !== ""
    && typeof value.rulesetSha === "string" && SHA256.test(value.rulesetSha)
    && typeof value.dispatcher === "string" && value.dispatcher !== ""
    && typeof value.outcome === "string" && value.outcome !== ""
    && Array.isArray(value.log);
}

/**
 * Bounded DFS for an active, matching, currently-open dispatch record
 * anywhere under the project root. Symlinked directories are naturally
 * skipped (Dirent.isDirectory() reflects the raw dirent type, not the
 * symlink target, so a symlink never recurses -- no cycle guard needed).
 */
function findOpenDispatchRecord(rootDir) {
  const stack = [rootDir];
  let visited = 0;
  while (stack.length > 0) {
    const dir = stack.pop();
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      continue; // unreadable dir -- skip, not a reason to crash the guard
    }
    for (const entry of entries) {
      if (++visited > MAX_WALK_ENTRIES) return null;
      if (entry.isDirectory()) {
        if (SKIP_DIR.test(entry.name)) continue;
        stack.push(join(dir, entry.name));
        continue;
      }
      if (!entry.isFile() || !DISPATCH_RECORD_BASENAME.test(entry.name)) continue;
      let parsed;
      try {
        parsed = JSON.parse(readFileSync(join(dir, entry.name), "utf8"));
      } catch {
        continue; // unreadable/invalid record -- not admitting evidence
      }
      if (isValidDispatchRecord(parsed) && parsed.outcome === "in-progress") {
        return { path: join(dir, entry.name), taskId: parsed.taskId };
      }
    }
  }
  return null;
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

// ---- resolve absolute file_path against the project root, traversal-hardened -------
// Same technique as guard-devplan.mjs (see that file's header for the full rationale):
// slashify -> posix.normalize() BEFORE the prefix match, so a `..`/`.` traversal segment
// cannot walk a candidate back under an exempt prefix as a raw string while resolving
// outside it once collapsed, identically on every host OS.
let relPath = filePath;
if (isAbsolute(filePath)) {
  const rel = relative(projectDir, filePath);
  const relSlashes = rel.replace(/\\/g, "/");
  const outsideRoot = rel === ".." || relSlashes.startsWith("../") || isAbsolute(rel);
  if (outsideRoot) process.exit(0); // not this project's file -- allow unconditionally
  relPath = rel;
}
relPath = posix.normalize(relPath.replace(/\\/g, "/"));
const normalizedPath = normalize(relPath);
const baseName = relPath.split("/").pop() ?? "";

// ---- exemptions: EL-01's own permitted set, plus the bootstrap exemption -----------
if (DISPATCH_RECORD_BASENAME.test(baseName)) process.exit(0);
if (EXEMPT_PREFIXES.some((prefix) => normalizedPath.startsWith(normalize(prefix)))) process.exit(0);

// ---- state: activeFeature (fail-open on absent, WARN on malformed) ----------------
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
  process.exit(0); // no state file at all -- fail-open, nothing to enforce yet
}
let state;
try {
  state = JSON.parse(stateRaw);
} catch (e) {
  emit(1, [
    `[guard-el01-tripwire] WARN: ${statePath} contains invalid JSON (${e.message}).`,
    "EL-01 write-time tripwire is being skipped (fail-open) -- please repair the state file " +
      "(rewrite only via harness/scripts/pipeline-state.mjs, never by hand).",
  ]);
}

const feature = state && typeof state === "object" ? state.activeFeature : undefined;
if (!feature || typeof feature !== "object" || typeof feature.id !== "string" || feature.id === "") {
  process.exit(0); // no active feature -- nothing to enforce
}

// ---- risk class: the one EL-01 stage-0 criterion resolvable per-call (see header) --
const specPath = resolveSpecPath(state);
if (!specPath) process.exit(0); // cannot determine risk class -- fail-open, not invented

let specText;
try {
  specText = readFileSync(resolve(projectDir, specPath), "utf8");
} catch {
  process.exit(0); // spec unreadable -- fail-open
}
const riskClass = extractRiskClass(specText);
if (riskClass !== "high") process.exit(0); // EL-01's "no risk flag set" criterion holds

// ---- dispatch-record match: the PO-adopted, independently-checkable signal ---------
const openRecord = findOpenDispatchRecord(projectDir);
if (openRecord) process.exit(0);

// ---- verdict ------------------------------------------------------------------------
emit(2, [
  `BLOCKED (guard-el01-tripwire, plugin pipeline-core): orchestrator-session write to a ` +
    `source path while a risk-flagged feature is active.`,
  `Feature: "${feature.id}" (risk class: ${riskClass}, spec: ${specPath})`,
  `File: ${filePath}`,
  `Why: EL-01 (roles/elephant.md) forbids the Elephant from writing production code outside ` +
    `the narrow rigor-0/no-risk-flag stage-0 fast path; this feature's risk flag is set, so ` +
    `that exception is categorically unavailable.`,
  `No active, matching, currently-open dispatch record (dispatch-record*.json, outcome ` +
    `"in-progress") was found anywhere under the project root -- this write cannot be tied to ` +
    `a dispatched Goldfish.`,
  `Sanctioned route: dispatch a Goldfish from templates/prompts/goldfish-task.md (EL-05); its ` +
    `opening act (GF-09-D) creates exactly the dispatch-record*.json this guard looks for.`,
]);
