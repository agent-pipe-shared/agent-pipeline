// SPDX-License-Identifier: SUL-1.0
// Native Antigravity Goldfish dispatch (candidate 20, G20-8 B): an Antigravity-hosted Elephant dispatches goldfish-implementor,
// goldfish-mechanic and goldfish-deep through the host's own `invoke_subagent`, admitted like a Claude Agent call (generated briefing,
// selected model, write-capable carrier -- all judged by hooks/guard-dispatch.mjs) with NO per-dispatch PO consent. What the Claude route
// gets from the runner, this module gets from what the host WRITES (specs/sprint-alfred-epic/evidence/held-patches/
// w252-agy-native-subagent-measurement.md; every fact below is measured there):
//
//   * the hook payload has exactly eight keys, a child has its own conversationId and NO parent field;
//   * the host writes <brain root>/<parentId>/.system_generated/subagents/<childId>.json = { conversationId, subagentDescriptor {typeName,
//     role}, state, spawnStepIndex, workspaceUris }; the brain root is the parent directory of the payload's artifactDirectoryPath. A child
//     is BOUND when exactly one parent directory holds a descriptor named after its id;
//   * the alias (Model) is only in the parent's call; every child call carries the RESOLVED modelName. MEASURED (M4c/M10, 2026-11-07): the
//     alias does NOT select a model -- `flash` AND `pro` both resolved to `gemini-3.8-flash-tiered`, and a child launched WITHOUT a Model
//     inherits the main session's model (`gemini-4-argon-medium`). The child's modelName is therefore only COMPARED with the registry's
//     Antigravity cell for its duty and RECORDED (G20-43, PO 2026-11-07: record instead of refuse); a mismatch is never a denial. The routing
//     is: goldfish-implementor flash medium, goldfish-deep flash high, goldfish-mechanic flash low (all Model `flash`), the Critic inherits
//     (no Model);
//   * invoke_subagent args are FLAT (TypeName, Role, Prompt, Model, Workspace) and may be JSON-string-encoded ("\"flash\"").
//
// Measured by the M4b run (scratch/agy-m4b-findings.md, specs/sprint-alfred-epic/evidence/held-patches/w258-c20-agy-native-isolation.notes.md):
//
//   * `Workspace: "branch"` in a git workspace creates a REAL git worktree of the parent repository below
//     <home>/.gemini/antigravity-cli/worktrees/<parentId>/subagent-<...> on a new branch, cut from the parent's COMMITTED HEAD (uncommitted
//     parent changes are not in it); two code writers run in parallel with no conflict; the child's commit lands in the shared object database
//     and nothing is merged back (scripts/agy-native-integrate.mjs is the Elephant's take-over);
//   * the child's hook payload names its worktree FIRST in workspacePaths and the parent repository second; the worktree is outside the project
//     and carries no governance marker, so it is resolved to its repository here (resolveNativeChildGovernance) and governed like the parent;
//   * a finished child's descriptor STAYS SUBAGENT_STATE_ALIVE, so no rule may count ALIVE children.
//
// NOT measured, so not assumed: the exact spelling of modelName beyond the two values above, the descriptor state of a killed or
// failed child, descriptor timing, a hook at a child's end.

import { existsSync, lstatSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { basename, dirname, isAbsolute, join, posix, relative, resolve, sep } from "node:path";

import { registeredFunctionalTaskRoutes } from "./model-role-route-source.mjs";

const DUTY_OF = Object.freeze({ "goldfish-implementor": "implement", "goldfish-mechanic": "mechanic", "goldfish-deep": "deep" });
const SAFE_ID = /^[A-Za-z0-9._-]{1,128}$/u;

export const bareNativeType = (value) => (typeof value === "string" && value.startsWith("pipeline-core:") ? value.slice("pipeline-core:".length) : value);
export const isNativeCodeWriterType = (value) => Object.hasOwn(DUTY_OF, bareNativeType(value) ?? "");
const normalizeModel = (value) => String(value ?? "").trim().toLowerCase().replace(/[^a-z0-9.]+/gu, "-").replace(/^-+|-+$/gu, "");

/** One level of JSON string encoding, as the greenfield transcript shows it (Model as the string `"flash"` with its quotes). */
export function decodeNativeInvokeArgs(args) {
  if (args === null || typeof args !== "object" || Array.isArray(args)) return args;
  const decoded = {};
  for (const [key, value] of Object.entries(args)) {
    let next = value;
    if (typeof value === "string" && value.length >= 2 && value.startsWith("\"")) {
      try { const parsed = JSON.parse(value); if (typeof parsed === "string") next = parsed; } catch { /* keep the raw string */ }
    }
    decoded[key] = next;
  }
  return decoded;
}

function brainContext(input) {
  const conversationId = input?.conversationId;
  const artifact = input?.artifactDirectoryPath;
  if (typeof conversationId !== "string" || !SAFE_ID.test(conversationId) || typeof artifact !== "string" || artifact.trim() === "") return null;
  return { conversationId, brainRoot: dirname(artifact) };
}

const subagentDirectory = (brainRoot, parentId) => join(brainRoot, parentId, ".system_generated", "subagents");

function readDescriptor(path, childId) {
  try {
    const record = JSON.parse(readFileSync(path, "utf8"));
    const typeName = record?.subagentDescriptor?.typeName;
    if (record?.conversationId !== childId || typeof typeName !== "string" || typeName === "") return null;
    return { typeName: bareNativeType(typeName), role: record.subagentDescriptor.role, state: record.state, spawnStepIndex: record.spawnStepIndex };
  } catch { return null; }
}

/** Resolve a hook payload to "a child of session P of type T" from the descriptor the host wrote, or say it is not a child. */
export function bindNativeChild(input) {
  const context = brainContext(input);
  if (context === null) return { status: "not-a-child" };
  let parents;
  try { parents = readdirSync(context.brainRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory() && SAFE_ID.test(entry.name)); }
  catch { return { status: "not-a-child" }; }
  const matches = [];
  for (const parent of parents) {
    const path = join(subagentDirectory(context.brainRoot, parent.name), `${context.conversationId}.json`);
    if (existsSync(path)) matches.push({ parentConversationId: parent.name, path });
  }
  if (matches.length === 0) return { status: "not-a-child" };
  if (matches.length > 1) return { status: "ambiguous", parents: matches.map((match) => match.parentConversationId) };
  const descriptor = readDescriptor(matches[0].path, context.conversationId);
  if (descriptor === null) return { status: "invalid", parentConversationId: matches[0].parentConversationId };
  return { status: "child", childConversationId: context.conversationId, parentConversationId: matches[0].parentConversationId, ...descriptor };
}

/** The model the dispatch selection resolved for a role: the registry's Antigravity cell for its duty. Null = no opinion (route source unreadable). */
export function expectedNativeModel(type, routeSource = registeredFunctionalTaskRoutes()) {
  const duty = DUTY_OF[bareNativeType(type)];
  if (!duty || !routeSource?.ok || !Array.isArray(routeSource.taskRoutes)) return null;
  const route = routeSource.taskRoutes.find((entry) => entry.runner === "antigravity" && entry.taskRoute === `duty.${duty}`);
  const value = route?.selector?.value ?? route?.cell?.selector?.value;
  return typeof value === "string" && value !== "" ? { duty, value } : null;
}

const deny = (code, reason) => ({ ok: false, code, reason: `${code}: ${reason}` });

/**
 * A hook call from a native child: attribute it to its parent and RECORD the model it actually resolved to next to the registry cell
 * (goldfish roles only; G20-43: a model mismatch is reported in `modelCheck` and one `notice` line, never a denial).
 */
export function evaluateNativeChildCall(input, { routeSource } = {}) {
  const bound = bindNativeChild(input);
  if (bound.status === "not-a-child") return { ok: true, attributed: null };
  if (bound.status === "ambiguous") {
    return deny("AGY-NATIVE-CHILD-BINDING-AMBIGUOUS", `more than one session directory (${bound.parents.join(", ")}) holds a descriptor for this conversation, so it cannot be bound to one parent. Repair: stop this child with manage_subagents (kill) and dispatch it again from the parent.`);
  }
  if (bound.status === "invalid") {
    return deny("AGY-NATIVE-CHILD-DESCRIPTOR-INVALID", `the host descriptor for this conversation under parent ${bound.parentConversationId} is unreadable or names another conversation. Repair: stop this child with manage_subagents (kill) and dispatch it again from the parent.`);
  }
  const attributed = {
    parentConversationId: bound.parentConversationId, childConversationId: bound.childConversationId,
    typeName: bound.typeName, role: bound.role, spawnStepIndex: bound.spawnStepIndex,
  };
  if (!isNativeCodeWriterType(bound.typeName)) return { ok: true, attributed };
  const expected = expectedNativeModel(bound.typeName, routeSource);
  if (expected === null) return { ok: true, attributed, modelCheck: "no-opinion" };
  // G20-43: the resolved model is RECORDED next to the expected registry cell and never refused. The host's Model alias does not select a
  // model (measured), so a refusal here only blocked every happy-path child with a repair nobody could run.
  const resolved = input?.modelName ?? null;
  // C23 (Antigravity greenfield report): the host names the configured model family with its own alias (gemini-3-flash-agent for gemini-3.8-flash-medium), so a notice on every child call
  // said nothing the reader could act on. The same family is recorded as tier-match, and only another family earns the notice.
  const tierOf = (value) => { const name = normalizeModel(value); return /flash.?lite/u.test(name) ? "flash-lite" : /flash/u.test(name) ? "flash" : /(?:^|-)pro(?:-|$)/u.test(name) ? "pro" : null; };
  const status = normalizeModel(resolved) === normalizeModel(expected.value) ? "match" : tierOf(resolved) !== null && tierOf(resolved) === tierOf(expected.value) ? "tier-match" : "mismatch";
  const modelCheck = { status, resolved, expected };
  if (status !== "mismatch") return { ok: true, attributed, modelCheck };
  return {
    ok: true, attributed, modelCheck,
    notice: `AGY-NATIVE-CHILD-MODEL-NOTICE: child ${bound.typeName} (parent ${bound.parentConversationId}) resolved to model ${JSON.stringify(resolved)}, the expected cell for duty.${expected.duty} is ${JSON.stringify(expected.value)}; admitted and recorded (the host's Model alias does not select a model).`,
  };
}

/** Tracked files with uncommitted changes (staged or not) in a git working tree; [] when git cannot say, since this is a hygiene check. */
function uncommittedTrackedPaths(root) {
  const res = spawnSync("git", ["status", "--porcelain", "--untracked-files=no"], { cwd: root, encoding: "utf8", shell: false, timeout: 15_000 });
  if (res.error || res.status !== 0) return [];
  return String(res.stdout).split("\n").filter((line) => line.length > 3).map((line) => line.slice(3));
}

/**
 * The parent's invoke_subagent call that names a code-writing Goldfish (M4b): every code writer runs in its own branch worktree, in parallel.
 * `Workspace: "branch"` is required (absent, "inherit" and "share" would give the child the shared tree), and the worktree starts at the
 * committed HEAD, so uncommitted tracked changes of the parent are refused before dispatch. Finished children stay ALIVE (M4b item 6), so
 * nothing here counts children.
 */
export function evaluateNativeGoldfishParentCall(input, nativeSubagents) {
  const writers = (Array.isArray(nativeSubagents) ? nativeSubagents : []).filter((entry) => isNativeCodeWriterType(entry?.TypeName));
  if (writers.length === 0) return { ok: true, codeWriter: false };
  for (const writer of writers) {
    if (writer.Workspace !== "branch") {
      return deny("AGY-NATIVE-WORKSPACE-NOT-ISOLATED", `${bareNativeType(writer.TypeName)} is dispatched with Workspace ${JSON.stringify(writer.Workspace ?? null)}, which gives it the shared working tree. A code-writing child runs in its own git worktree on its own branch (measured, M4b). Repair: pass Workspace: "branch" for every code-writing child; several may run in parallel.`);
    }
  }
  const root = Array.isArray(input?.workspacePaths) && typeof input.workspacePaths[0] === "string" ? input.workspacePaths[0] : null;
  const dirty = root === null ? [] : uncommittedTrackedPaths(root);
  if (dirty.length > 0) {
    return deny("AGY-NATIVE-WORKTREE-UNCOMMITTED", `a branch worktree starts at the committed HEAD, so the uncommitted changes of this working tree (${dirty.slice(0, 5).join(", ")}${dirty.length > 5 ? `, and ${dirty.length - 5} more` : ""}) would not be visible to the child. Repair: commit first (the ordinary commit route), then dispatch again; files that are only untracked are not part of this check, but a child sees none of them either.`);
  }
  return { ok: true, codeWriter: true, parentConversationId: brainContext(input)?.conversationId ?? null };
}

const inside = (root, path) => {
  const rel = relative(root, path);
  return rel === "" || (rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
};
const realOrNull = (path) => { try { return realpathSync(resolve(path)); } catch { return null; } };
/** The physical spelling of a path that may not exist yet: the real path of its deepest existing ancestor plus the remainder. */
function physicalPath(path) {
  let head = resolve(path);
  const tail = [];
  for (;;) {
    try { return join(realpathSync(head), ...tail.reverse()); } catch {
      const parent = dirname(head);
      if (parent === head) return resolve(path);
      tail.push(basename(head));
      head = parent;
    }
  }
}
const samePath = (left, right) => (process.platform === "win32" ? left.toLowerCase() === right.toLowerCase() : left === right);

/**
 * M4b item 5: a native child's payload names its worktree FIRST and the parent repository second. The worktree is outside the project and
 * carries no governance marker, so without this the child would be ungoverned. Resolved to `governed` only when the first workspace is a
 * REGISTERED worktree of exactly one repository: its `.git` file points into <repo>/.git/worktrees/<name>, that admin directory points back
 * at this very worktree (what `git worktree list` reads), and a second workspacePaths entry, when present, is that same repository.
 * `unregistered` = worktree-shaped but not registered there (never borrows the repository's authority); `not-worktree` = anything else.
 */
export function resolveNativeChildGovernance(input) {
  const paths = (Array.isArray(input?.workspacePaths) ? input.workspacePaths : []).filter((value) => typeof value === "string" && value.trim() !== "");
  const worktreeRoot = paths.length > 0 ? realOrNull(paths[0]) : null;
  if (worktreeRoot === null) return { status: "not-worktree" };
  let pointer;
  try {
    if (!lstatSync(join(worktreeRoot, ".git")).isFile()) return { status: "not-worktree" };
    pointer = /^gitdir:\s*(.+?)\s*$/mu.exec(readFileSync(join(worktreeRoot, ".git"), "utf8"));
  } catch { return { status: "not-worktree" }; }
  if (pointer === null) return { status: "not-worktree" };
  const claimedAdmin = resolve(worktreeRoot, pointer[1]);
  if (basename(dirname(claimedAdmin)) !== "worktrees") return { status: "not-worktree" }; // a submodule or another .git file
  const unregistered = (reason) => ({ status: "unregistered", worktreeRoot, reason });
  const adminDir = realOrNull(claimedAdmin);
  if (adminDir === null) return unregistered("its .git file points at an administrative directory that does not exist");
  const commonDir = dirname(dirname(adminDir));
  if (basename(commonDir) !== ".git") return unregistered("its repository has no standard .git directory");
  const repoRoot = realOrNull(dirname(commonDir));
  let backLink = null;
  try { backLink = realOrNull(dirname(resolve(adminDir, readFileSync(join(adminDir, "gitdir"), "utf8").trim()))); } catch { backLink = null; }
  if (repoRoot === null || backLink === null || !samePath(backLink, worktreeRoot)) return unregistered("the repository's worktree registry does not list it");
  if (paths.length > 1) {
    const second = realOrNull(paths[1]);
    if (second === null || !samePath(second, repoRoot)) return unregistered("the second workspace is not the repository it is registered with");
  }
  return { status: "governed", repoRoot, worktreeRoot, adminDir };
}

const OUTSIDE_WORKTREE = (worktreeRoot, what) => `AGY-NATIVE-CHILD-WRITE-OUTSIDE-WORKTREE: ${what} is outside this child's own worktree ${worktreeRoot}. A code-writing child changes only its own branch worktree; the project tree is changed only by the Elephant, who takes the child's branch over after it reported. Repair: write below ${worktreeRoot} (a relative path resolves there), and run commands with it as the working directory.`;

/** M4b item 5: a governed child's file writes and shell working directory stay inside its own worktree. */
export function nativeChildWriteRefusal(governed, { filePath, cwd } = {}) {
  const outside = (value) => !inside(governed.worktreeRoot, physicalPath(isAbsolute(value) ? value : resolve(governed.worktreeRoot, value)));
  if (typeof filePath === "string" && filePath !== "" && outside(filePath)) return OUTSIDE_WORKTREE(governed.worktreeRoot, `the write target ${filePath}`);
  if (typeof cwd === "string" && cwd !== "" && outside(cwd)) return OUTSIDE_WORKTREE(governed.worktreeRoot, `the command working directory ${cwd}`);
  return null;
}

const PROJECTED_PATH_KEYS = ["Cwd", "cwd", "TargetFile", "file_path", "Path"];
/**
 * The input as the PARENT repository sees it: every absolute path below the child's worktree is mapped to the same relative path in the
 * repository and the repository comes first in workspacePaths, so one governance judges both alike (protected paths, plan phase, push gate).
 * Returns a copy; the original payload is not touched. (Reads are projected too: measured, a read of a file that exists only in the worktree
 * is still admitted at the mapped path, so no read special case is needed.)
 */
export function projectNativeChildInput(input, governed) {
  const map = (value) => {
    if (typeof value !== "string" || !isAbsolute(value)) return value;
    const physical = physicalPath(value);
    return inside(governed.worktreeRoot, physical) ? join(governed.repoRoot, relative(governed.worktreeRoot, physical)) : value;
  };
  const mapped = (container) => (container !== null && typeof container === "object" && !Array.isArray(container)
    ? Object.fromEntries(Object.entries(container).map(([key, value]) => [key, PROJECTED_PATH_KEYS.includes(key) ? map(value) : value]))
    : container);
  // C23 (Antigravity greenfield A): the mapping above is for judging policy. A guard that reads a file the command names (git commit -F) needs
  // the directory the command really runs in, so that one stays physical and travels beside the projected input.
  const requested = [input?.toolCall?.args?.Cwd, input?.toolCall?.args?.cwd, input?.tool_input?.cwd].find((value) => typeof value === "string" && value !== "");
  const physicalCwd = requested === undefined ? governed.worktreeRoot : physicalPath(isAbsolute(requested) ? requested : resolve(governed.worktreeRoot, requested));
  const projected = { ...input, workspacePaths: [governed.repoRoot, governed.worktreeRoot], nativeChildCwd: inside(governed.worktreeRoot, physicalCwd) ? physicalCwd : governed.worktreeRoot };
  if (input?.toolCall && typeof input.toolCall === "object") projected.toolCall = { ...input.toolCall, args: mapped(input.toolCall.args) };
  if (input?.tool_input && typeof input.tool_input === "object") projected.tool_input = mapped(input.tool_input);
  return projected;
}

const BRAIN_REFUSAL = `AGY-NATIVE-BRAIN-WRITE: the Antigravity brain and config directories are written by the host only (subagent descriptors, messages, credentials); a file written there would forge a child's identity or a completion message. Repair: write inside the project workspace (scratch/ for temporary files) or, for a branch child, inside its own worktree; to stop a child use manage_subagents.`;
const ANTIGRAVITY_CLI = /\/\.gemini\/antigravity-cli(?=\/|$)(\/worktrees(?=\/|$))?/giu;
/** Host-owned: brain/, config/, .system_generated/, credentials. NOT <home>/.gemini/antigravity-cli/worktrees/, where a branch child lives (M4b item 2). */
function touchesHostOwnedPath(text, { isPath }) {
  let normalized = text.replace(/\\/gu, "/");
  if (isPath) normalized = posix.normalize(normalized); // a path that climbs out of worktrees/ is judged where it lands
  if (/\/\.gemini\/config(?:\/|$)/iu.test(normalized) || /\/\.system_generated(?:\/|$)/u.test(normalized)) return true;
  const climbs = !isPath && /(?:^|\/)\.\.(?:\/|$)/u.test(normalized); // free text cannot be normalized: any climb near the host directory is refused
  for (const match of normalized.matchAll(ANTIGRAVITY_CLI)) if (match[1] === undefined || climbs) return true;
  return false;
}

/** The host owns its brain and config directories; an agent write there would forge a child's identity or message. */
export function nativeBrainWriteRefusal({ filePath, command } = {}) {
  if (typeof filePath === "string" && touchesHostOwnedPath(filePath, { isPath: true })) return BRAIN_REFUSAL;
  if (typeof command === "string" && touchesHostOwnedPath(command, { isPath: false })) {
    const readOnly = /^\s*(?:cat|ls|rg|grep|head|tail|wc|stat|file|find|pwd)\b/u.test(command) && !/>|\btee\b|-delete\b|-exec\b/u.test(command);
    // Candidate 29 (AGY run 3, R4): the Pipeline's own read-only run timeline over the brain transcript names that path but writes
    // nothing (it prints to stdout). Exactly `node <...>/scripts/usage-ledger.mjs --timeline <file> [--json]`, no shell operator.
    const timelineRead = !/[<>|;&`$()]/u.test(command)
      && /^\s*node(?:\.exe)?\s+\S*[\\/]scripts[\\/]usage-ledger\.mjs\s+--timeline\s+\S+(?:\s+--json)?\s*$/u.test(command);
    if (!readOnly && !timelineRead) return BRAIN_REFUSAL;
  }
  return null;
}
