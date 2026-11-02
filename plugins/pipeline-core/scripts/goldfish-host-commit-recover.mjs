#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * goldfish-host-commit-recover.mjs -- the sanctioned way to land a Goldfish result that sits uncommitted after its host
 * commit did not land (AC-164, slice C18-1B). Replaces a hand-built orchestrator commit with a command that writes the
 * task-to-commit link itself.
 *
 *   plan  --root <root> [--dispatch-id <id>] [--allowed-path <p>]... [--path <p>]...        read-only
 *   apply --root <root> [same flags] --expect-sha256 <planSha256 printed by plan>           one ordinary commit
 *
 * Sources: the pending host-commit state while it exists (binding.dispatchId, candidateCommit, allowedPaths); otherwise
 * the explicit flags (--dispatch-id plus at least one --allowed-path). --path names the changed paths claimed; without it
 * the changed allowed paths are read from the tree. The newest stop-failure record (if any) is named in the commit body.
 * The commit is `git commit -F scratch/commit-msg/<id>.txt -- <exact paths>`, hooks enabled, never `git add -A`.
 * Exit 0 ready/committed, 2 refused. Output is JSON `pipeline.goldfish-host-commit-recover-plan.v1`.
 */
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, realpathSync, writeFileSync } from "node:fs";
import { isAbsolute, join, posix, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveGitCommonDir } from "../lib/po-key-directory.mjs";
import { readNativeGoldfishStopFailure } from "../hooks/native-goldfish-host.mjs";

export const PLAN_SCHEMA = "pipeline.goldfish-host-commit-recover-plan.v1";
const DISPATCH_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,95}$/u;
const OID = /^[a-f0-9]{40}(?:[a-f0-9]{24})?$/u;
const SELF = fileURLToPath(import.meta.url);
const SYNTAX = "plan|apply --root <root> [--dispatch-id <id>] [--allowed-path <p>]... [--path <p>]... [--expect-sha256 <digest>]";

const git = (cwd, args) => {
  const r = spawnSync("git", args, { cwd, encoding: "utf8", shell: false, timeout: 30_000, maxBuffer: 1 << 24 });
  return { ok: r.status === 0, out: String(r.stdout ?? ""), err: String(r.stderr ?? "") };
};
const sha = (value) => createHash("sha256").update(value).digest("hex");
const refuse = (code, message, next) => ({ code, message, next });

/** Strict argv: verb, then flag/value pairs; --dispatch-id and --expect-sha256 once, --allowed-path and --path repeated. */
export function parseArgs(argv) {
  const [verb, ...rest] = argv;
  if (verb !== "plan" && verb !== "apply") return { error: `unknown verb; usage: ${SYNTAX}` };
  const out = { verb, root: null, dispatchId: null, allowed: [], paths: [], expect: null };
  for (let i = 0; i < rest.length; i += 2) {
    const flag = rest[i], value = rest[i + 1];
    if (typeof value !== "string" || value === "" || /[\u0000-\u001f\u007f]/u.test(value)) return { error: `flag ${flag} needs one value; usage: ${SYNTAX}` };
    if (flag === "--root" && out.root === null) out.root = value;
    else if (flag === "--dispatch-id" && out.dispatchId === null) out.dispatchId = value;
    else if (flag === "--expect-sha256" && out.expect === null) out.expect = value;
    else if (flag === "--allowed-path") out.allowed.push(value);
    else if (flag === "--path") out.paths.push(value);
    else return { error: `unknown or repeated flag ${flag}; usage: ${SYNTAX}` };
  }
  if (out.root === null) return { error: `--root is required; usage: ${SYNTAX}` };
  return out;
}

/** A repository-relative POSIX path from a relative or absolute spelling, or null when it leaves the root or is unusable. */
export function normalizePath(root, value) {
  const rel = isAbsolute(value) ? relative(root, value).split(sep).join("/") : value.replaceAll("\\", "/");
  const clean = posix.normalize(rel);
  if (clean === "." || clean === "" || clean.startsWith("../") || clean === ".." || isAbsolute(clean) || clean.startsWith("-") || clean.startsWith(".git/")) return null;
  return clean;
}

/** Pending host-commit states carrying a binding, read tolerantly (diagnostic read; nothing is trusted beyond the binding). */
function readPendingBindings(commonDir) {
  const directory = join(commonDir, "agent-pipeline", "run", "native-goldfish-host-commit");
  const found = [];
  let names = [];
  try { names = readdirSync(directory); } catch { return found; }
  for (const name of names.sort()) {
    if (!/^pending-.+\.json$/u.test(name)) continue;
    try {
      const state = JSON.parse(readFileSync(join(directory, name), "utf8"));
      const b = state?.binding;
      if (typeof b?.dispatchId === "string" && DISPATCH_ID.test(b.dispatchId) && OID.test(b.candidateCommit ?? "")
        && Array.isArray(b.allowedPaths) && b.allowedPaths.every((p) => typeof p === "string")) {
        found.push({ file: name, dispatchId: b.dispatchId, candidateCommit: b.candidateCommit, allowedPaths: b.allowedPaths, createdAtMs: Number(state.createdAtMs) || 0 });
      }
    } catch { /* unreadable pending state is not a source */ }
  }
  return found;
}

/** The newest stop-failure record with its file name (the exported reader gives the content, not the file). */
function newestStopFailure(commonDir) {
  const record = readNativeGoldfishStopFailure({ commonDir });
  if (!record) return null;
  const directory = join(commonDir, "agent-pipeline", "run", "native-goldfish-host-diagnostics");
  for (const name of readdirSync(directory).sort()) {
    if (!/^stop-failure-.+\.json$/u.test(name)) continue;
    try {
      const entry = JSON.parse(readFileSync(join(directory, name), "utf8"));
      if (entry?.code === record.code && entry?.observedAt === record.observedAt) return { file: name, code: record.code, dispatchId: record.dispatchId };
    } catch { /* skip */ }
  }
  return null;
}

function changedPaths(root) {
  const r = git(root, ["status", "--porcelain=v1", "-z", "--untracked-files=all"]);
  if (!r.ok) return null;
  const changed = new Set();
  const parts = r.out.split("\0");
  for (let i = 0; i < parts.length; i += 1) {
    const entry = parts[i];
    if (entry.length < 4) continue;
    changed.add(entry.slice(3));
    if (entry[0] === "R" || entry[0] === "C") i += 1; // the original path follows; the new path is the claim
  }
  return changed;
}

function untrackedPaths(root) {
  const r = git(root, ["ls-files", "--others", "--exclude-standard", "-z"]);
  return r.ok ? r.out.split("\0").filter(Boolean) : [];
}

export function buildMessage({ dispatchId, stopFailure }) {
  const pointer = stopFailure
    ? `Stop failure record: ${stopFailure.file} (code ${stopFailure.code}).`
    : "Stop failure record: none; the stop left no diagnostic.";
  return `chore(dispatch): land ${dispatchId} result as an orchestrator commit\n\n`
    + `The host commit of this dispatch did not land; its result was committed from the working tree by the orchestrator.\n\n`
    + `${pointer}\n\nAI-Assisted: true\nDispatch: ${dispatchId} (goldfish)\nCommit-Act: orchestrator\n`;
}

export function plan(options) {
  const refusals = [];
  let root;
  try { root = realpathSync(resolve(options.root)); } catch { return { status: "refused", code: "GHCR-ROOT", refusals: [refuse("GHCR-ROOT", "the root is not readable", `pass an existing repository with --root`)], paths: [] }; }
  const commonDir = resolveGitCommonDir(root);
  const head = git(root, ["rev-parse", "--verify", "HEAD^{commit}"]);
  if (!commonDir || !head.ok) return { status: "refused", code: "GHCR-NOT-A-REPOSITORY", paths: [], refusals: [refuse("GHCR-NOT-A-REPOSITORY", "the root is not a git repository with a HEAD", "run from the project root")] };
  const headSha = head.out.trim();

  // Source: the pending binding while it exists, else the explicit flags.
  const pendings = readPendingBindings(commonDir);
  let candidates = options.dispatchId ? pendings.filter((p) => p.dispatchId === options.dispatchId) : pendings;
  let stop = null;
  try { stop = newestStopFailure(commonDir); } catch { stop = null; }
  if (!options.dispatchId && candidates.length > 1 && stop) candidates = candidates.filter((p) => p.dispatchId === stop.dispatchId);
  let dispatchId = null, candidateCommit = null, allowedRaw = null, source = null;
  if (candidates.length === 1) {
    ({ dispatchId, candidateCommit } = candidates[0]);
    allowedRaw = candidates[0].allowedPaths;
    source = "pending-state";
  } else if (candidates.length > 1) {
    refusals.push(refuse("GHCR-PENDING-AMBIGUOUS", `${candidates.length} pending states match`, "pass --dispatch-id <id> to name one"));
  } else if (options.dispatchId && options.allowed.length > 0) {
    dispatchId = options.dispatchId; allowedRaw = options.allowed; source = "explicit-flags";
  } else {
    refusals.push(refuse("GHCR-NO-SOURCE", "no pending host-commit state and no explicit dispatch binding",
      "pass --dispatch-id <id> and at least one --allowed-path <briefed path> (and --path <changed path>)"));
  }
  if (dispatchId && !DISPATCH_ID.test(dispatchId)) { refusals.push(refuse("GHCR-DISPATCH-ID", "the dispatch id is not a safe token", "pass the dispatch id exactly as briefed")); dispatchId = null; }

  const allowed = [];
  for (const raw of allowedRaw ?? []) {
    const clean = normalizePath(root, raw);
    if (clean) allowed.push(clean);
  }
  const allowedSet = new Set(allowed);
  let paths = [];
  if (source) {
    const changed = changedPaths(root);
    if (changed === null) refusals.push(refuse("GHCR-STATUS-UNREADABLE", "git status failed", "re-run in the repository root"));
    else if (options.paths.length > 0) {
      const claimed = options.paths.map((p) => normalizePath(root, p));
      const unique = [...new Set(claimed)];
      if (claimed.includes(null) || !unique.every((p) => allowedSet.has(p))) {
        refusals.push(refuse("GHCR-PATH-OUTSIDE-ALLOWED", "a claimed path is not inside the briefed allowed paths", "claim only paths from the briefed write scope"));
      } else if (!unique.every((p) => changed.has(p))) {
        refusals.push(refuse("GHCR-PATH-UNCHANGED", "a claimed path has no change in the tree", "drop the unchanged path from --path"));
      } else paths = unique.sort();
    } else {
      paths = allowed.filter((p) => changed.has(p));
      paths = [...new Set(paths)].sort();
      if (paths.length === 0) refusals.push(refuse("GHCR-NO-CHANGES", "none of the briefed allowed paths has a change in the tree", "nothing to land; check whether the result was already committed"));
    }
  }
  if (candidateCommit && candidateCommit !== headSha) refusals.push(refuse("GHCR-HEAD-MOVED", "HEAD differs from the pending binding's candidateCommit", `restore HEAD to ${candidateCommit} or land the result by the ordinary commit route`));
  const staged = git(root, ["diff", "--cached", "--name-only"]);
  if (!staged.ok || staged.out.trim() !== "") refusals.push(refuse("GHCR-STAGED", "something is staged", "unstage it (git restore --staged -- <path>) and plan again"));

  const stopFailure = stop && (!dispatchId || stop.dispatchId === dispatchId) ? { file: stop.file, code: stop.code } : null;
  const result = { schema: PLAN_SCHEMA, status: refusals.length === 0 ? "ready" : "refused", code: refusals[0]?.code ?? "GHCR-READY",
    dispatchId, source, candidateCommit, head: headSha, stopFailure, paths: refusals.length === 0 ? paths : [], refusals,
    ...(stopFailure ? {} : { stopFailureNote: "no stop-failure record for this dispatch; the stop left no diagnostic" }) };
  if (result.status === "ready") {
    result.messagePath = `scratch/commit-msg/${dispatchId}.txt`;
    result.planSha256 = sha(JSON.stringify({ dispatchId, head: headSha, paths, stopFailure, message: buildMessage({ dispatchId, stopFailure }) }));
    result.next = ["node", SELF, "apply", "--root", root, "--dispatch-id", dispatchId,
      ...paths.flatMap((p) => ["--path", p]), ...(source === "explicit-flags" ? allowed.flatMap((p) => ["--allowed-path", p]) : []),
      "--expect-sha256", result.planSha256];
  }
  result.root = root;
  return result;
}

export function apply(options) {
  if (!options.expect || !/^[a-f0-9]{64}$/u.test(options.expect)) {
    return { schema: PLAN_SCHEMA, status: "refused", code: "GHCR-EXPECT-SHA256-REQUIRED", paths: [],
      refusals: [refuse("GHCR-EXPECT-SHA256-REQUIRED", "apply commits only what plan showed", "run plan and pass its planSha256 as --expect-sha256")] };
  }
  const planned = plan(options);
  if (planned.status !== "ready") return planned;
  if (planned.planSha256 !== options.expect) {
    return { ...planned, status: "refused", code: "GHCR-PLAN-DIGEST-MISMATCH", paths: [],
      refusals: [refuse("GHCR-PLAN-DIGEST-MISMATCH", "the tree or records changed since plan", "run plan again and use its new planSha256")] };
  }
  const messageFile = join(planned.root, planned.messagePath);
  mkdirSync(join(planned.root, "scratch", "commit-msg"), { recursive: true });
  writeFileSync(messageFile, buildMessage({ dispatchId: planned.dispatchId, stopFailure: planned.stopFailure }), "utf8");
  // `git commit -- <path>` knows only tracked paths: new files get an intent-to-add entry by exact pathspec first (never `add -A`).
  const fresh = untrackedPaths(planned.root).filter((p) => planned.paths.includes(p));
  if (fresh.length > 0) git(planned.root, ["add", "--intent-to-add", "--", ...fresh]);
  const committed = git(planned.root, ["commit", "-F", planned.messagePath, "--", ...planned.paths]);
  if (!committed.ok) {
    if (fresh.length > 0) git(planned.root, ["reset", "-q", "--", ...fresh]); // refused leaves no staged state behind
    return { ...planned, status: "refused", code: "GHCR-COMMIT-FAILED", refusals: [refuse("GHCR-COMMIT-FAILED", committed.err.trim().split("\n").slice(-3).join(" | "),
      "fix what the hook reported and run plan again; the message file is left in place")] };
  }
  return { schema: PLAN_SCHEMA, status: "committed", code: "GHCR-COMMITTED", dispatchId: planned.dispatchId, commit: git(planned.root, ["rev-parse", "HEAD"]).out.trim(),
    paths: planned.paths, stopFailure: planned.stopFailure, messagePath: planned.messagePath, refusals: [] };
}

if (process.argv[1] && resolve(process.argv[1]) === SELF) {
  const parsed = parseArgs(process.argv.slice(2));
  const result = parsed.error
    ? { schema: PLAN_SCHEMA, status: "refused", code: "GHCR-ARGUMENTS", paths: [], refusals: [refuse("GHCR-ARGUMENTS", parsed.error, SYNTAX)] }
    : parsed.verb === "plan" ? plan(parsed) : apply(parsed);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exitCode = result.status === "refused" ? 2 : 0;
}
