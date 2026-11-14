#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * agy-native-integrate.mjs -- the Elephant's sanctioned take-over of an Antigravity native Goldfish's result (candidate 20, G20-8 B, M4b).
 * A code-writing native child commits on its own branch in its own worktree; the commit sits in the shared object database and nothing is
 * merged, copied or patched back (M4b item 3). This script lands the branch's NET change in the Elephant's working tree, uncommitted and
 * unstaged, which is exactly the state the existing host-commit recovery consumes next (scripts/goldfish-host-commit-recover.mjs plan|apply,
 * which makes the ordinary dispatch-trailer commit). No raw cherry-pick, merge or checkout is needed, so the guard admits only this closed argv.
 *
 *   plan  --root <root> --branch <subagent-...> --allowed-path <p>...                              read-only
 *   apply --root <root> --branch <subagent-...> --allowed-path <p>... --expect-sha256 <digest>     writes the working tree only
 *   apply ... --commit-dispatch-id <id>   (C28C) the same, then the recovery route's own plan and apply commit exactly those paths with the dispatch trailer
 *   apply ... --keep-authorship <id>      (C29 R5, ADR-0099) instead lands the child's own commits unchanged by fast-forward; only when plan's
 *                                         `fastForward.eligible` (branch cut from the current HEAD, every commit `Dispatch: <id> (goldfish)`)
 *
 * A refusal of the commit step never undoes the applied change: the result carries `commit: {status: "refused", ...}` and `next` names the manual route.
 *
 * --allowed-path (at least one, repeated) is the briefed write scope; a branch that changed any other path is refused. The digest binds HEAD,
 * the branch tip, the merge base, the paths and the patch bytes, so a moved HEAD or branch makes `apply` refuse before writing. `git apply`
 * is all-or-nothing: a refusal leaves nothing behind. Exit 0 ready/applied, 2 refused. Output is JSON `pipeline.agy-native-integrate-plan.v1`.
 */
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, writeFileSync } from "node:fs";
import { join, posix, resolve, isAbsolute, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveGitCommonDir } from "../lib/po-key-directory.mjs";

export const PLAN_SCHEMA = "pipeline.agy-native-integrate-plan.v1";
export const INTEGRATED_SCHEMA = "pipeline.agy-native-integrated.v1";
const integratedDirectory = (commonDir) => join(commonDir, "agent-pipeline", "run", "agy-native-integrated");
const SELF = fileURLToPath(import.meta.url);
const RECOVER = fileURLToPath(new URL("./goldfish-host-commit-recover.mjs", import.meta.url));
const BRANCH = /^subagent-[A-Za-z0-9][A-Za-z0-9._-]{0,120}$/u;
const SYNTAX = "plan|apply --root <root> --branch <subagent-...> --allowed-path <p>... [--expect-sha256 <digest>] [--commit-dispatch-id <briefed dispatch id> | --keep-authorship <briefed dispatch id>, apply only]";
const DISPATCH_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,95}$/u; // the same token the recovery route accepts
const MAX_COMMITS = 200;

const git = (cwd, args, input) => {
  const res = spawnSync("git", args, { cwd, encoding: "utf8", shell: false, timeout: 60_000, maxBuffer: 1 << 28, ...(input === undefined ? {} : { input }) });
  return { ok: res.status === 0, out: String(res.stdout ?? ""), err: String(res.stderr ?? "") };
};
const sha = (value) => createHash("sha256").update(value).digest("hex");
const refuse = (code, message, next) => ({ code, message, next });
const shellWord = (value) => (/^[A-Za-z0-9_@%+=:,./-]+$/u.test(value) ? value : JSON.stringify(value));

export function parseArgs(argv) {
  const [verb, ...rest] = argv;
  if (verb !== "plan" && verb !== "apply") return { error: `unknown verb; usage: ${SYNTAX}` };
  const out = { verb, root: null, branch: null, allowed: [], expect: null, commitDispatchId: null, keepAuthorship: null };
  for (let i = 0; i < rest.length; i += 2) {
    const flag = rest[i], value = rest[i + 1];
    if (typeof value !== "string" || value === "" || /[\u0000-\u001f\u007f]/u.test(value)) return { error: `flag ${flag} needs one value; usage: ${SYNTAX}` };
    if (flag === "--root" && out.root === null) out.root = value;
    else if (flag === "--branch" && out.branch === null) out.branch = value;
    else if (flag === "--allowed-path") out.allowed.push(value);
    else if (flag === "--expect-sha256" && out.expect === null) out.expect = value;
    // C28C: apply may also land the ordinary dispatch-trailer commit through the recovery route in the same call (one path, no extra decision).
    else if (flag === "--commit-dispatch-id" && out.commitDispatchId === null && DISPATCH_ID.test(value)) out.commitDispatchId = value;
    // C29 R5 (ADR-0099): apply may instead land the child's own commits unchanged by fast-forward, keeping their authorship.
    else if (flag === "--keep-authorship" && out.keepAuthorship === null && DISPATCH_ID.test(value)) out.keepAuthorship = value;
    else return { error: `unexpected or repeated flag ${flag}; usage: ${SYNTAX}` };
  }
  if (out.commitDispatchId !== null && verb !== "apply") return { error: `--commit-dispatch-id belongs to apply; usage: ${SYNTAX}` };
  if (out.keepAuthorship !== null && verb !== "apply") return { error: `--keep-authorship belongs to apply; usage: ${SYNTAX}` };
  if (out.keepAuthorship !== null && out.commitDispatchId !== null) return { error: `--keep-authorship and --commit-dispatch-id exclude each other; usage: ${SYNTAX}` };
  return out;
}

/** A repository-relative, forward-slash path with no dot segment; null when it is anything else. */
function cleanPath(root, value) {
  if (typeof value !== "string" || value === "" || /[\u0000-\u001f\u007f\\]/u.test(value)) return null;
  const rel = isAbsolute(value) ? relative(root, value).split("\\").join("/") : value;
  if (rel === "" || rel.startsWith("-") || posix.isAbsolute(rel) || rel.split("/").some((part) => part === "" || part === "." || part === "..")) return null;
  return rel;
}

export function plan(options) {
  const refusals = [];
  const refused = (code) => ({ schema: PLAN_SCHEMA, status: "refused", code: refusals[0]?.code ?? code, paths: [], refusals });
  let root;
  try { root = realpathSync(resolve(options.root)); } catch {
    refusals.push(refuse("AGYI-ROOT", "the root is not readable", "pass the project root with --root"));
    return refused("AGYI-ROOT");
  }
  const head = git(root, ["rev-parse", "--verify", "HEAD^{commit}"]);
  if (!head.ok) {
    refusals.push(refuse("AGYI-NOT-A-REPOSITORY", "the root is not a git repository with a HEAD", "run it with the project root"));
    return refused("AGYI-NOT-A-REPOSITORY");
  }
  if (typeof options.branch !== "string" || !BRANCH.test(options.branch)) {
    refusals.push(refuse("AGYI-BRANCH", "the branch is not a native child branch (subagent-<...>)", "pass the branch name the child's worktree is on (git worktree list names it)"));
    return refused("AGYI-BRANCH");
  }
  const tip = git(root, ["rev-parse", "--verify", `refs/heads/${options.branch}^{commit}`]);
  if (!tip.ok) {
    refusals.push(refuse("AGYI-BRANCH-UNKNOWN", `no local branch ${options.branch}`, "git worktree list shows the child's branch; the child must have committed on it before it is taken over"));
    return refused("AGYI-BRANCH-UNKNOWN");
  }
  const allowed = [...new Set(options.allowed.map((value) => cleanPath(root, value)))];
  if (allowed.length === 0 || allowed.includes(null)) {
    refusals.push(refuse("AGYI-ALLOWED-REQUIRED", "the briefed write scope is required as repository-relative --allowed-path values", "pass every briefed path with --allowed-path"));
    return refused("AGYI-ALLOWED-REQUIRED");
  }
  const base = git(root, ["merge-base", "HEAD", tip.out.trim()]);
  const commits = base.ok ? git(root, ["rev-list", "--count", `${base.out.trim()}..${tip.out.trim()}`]) : null;
  const merges = base.ok ? git(root, ["rev-list", "--merges", "--max-count=1", `${base.out.trim()}..${tip.out.trim()}`]) : null;
  if (!base.ok || !commits.ok || Number(commits.out.trim()) < 1 || Number(commits.out.trim()) > MAX_COMMITS || merges.out.trim() !== "") {
    refusals.push(refuse("AGYI-NO-COMMITS", "the branch has no commits beyond HEAD's history, too many, or contains a merge", "the child must commit its result on its own branch; a merge commit is not taken over"));
    return refused("AGYI-NO-COMMITS");
  }
  const names = git(root, ["diff", "--name-only", "-z", "--no-renames", base.out.trim(), tip.out.trim()]);
  const paths = names.ok ? names.out.split("\0").filter(Boolean).sort() : [];
  const outside = paths.filter((path) => !allowed.includes(path));
  if (paths.length === 0) refusals.push(refuse("AGYI-NO-CHANGES", "the branch changes no file", "nothing to take over; check what the child reported"));
  else if (outside.length > 0) {
    refusals.push(refuse("AGYI-PATH-OUTSIDE-ALLOWED", `the branch changed paths outside the briefed scope: ${outside.slice(0, 10).join(", ")}`,
      "do not take it over; ask the child to remove those changes on its branch (send_message) or stop it and dispatch again"));
  }
  if (refusals.length > 0) return refused("AGYI-NO-CHANGES");
  const dirty = git(root, ["status", "--porcelain", "-z", "--untracked-files=all", "--", ...paths]);
  if (!dirty.ok || dirty.out !== "") {
    refusals.push(refuse("AGYI-PATH-DIRTY", "a path the child changed has changes in this working tree, which would be mixed with the child's result",
      `commit or restore those paths (git status --short -- ${paths.slice(0, 5).map(shellWord).join(" ")}), then plan again`));
    return refused("AGYI-PATH-DIRTY");
  }
  const patch = git(root, ["diff", "--binary", "--full-index", "--no-renames", base.out.trim(), tip.out.trim()]);
  const check = patch.ok ? git(root, ["apply", "--check", "-"], patch.out) : { ok: false, err: patch.err };
  if (!check.ok) {
    refusals.push(refuse("AGYI-APPLY-CONFLICT", `the child's change does not apply to this working tree: ${String(check.err).trim().split("\n").slice(-2).join(" | ")}`,
      "HEAD moved on in a path the child changed; dispatch the work again from the current HEAD (Workspace: \"branch\") or integrate it by hand"));
    return refused("AGYI-APPLY-CONFLICT");
  }
  const planSha256 = sha(JSON.stringify({ head: head.out.trim(), tip: tip.out.trim(), base: base.out.trim(), paths, patchSha256: sha(patch.out) }));
  const applyArgv = ["node", SELF, "apply", "--root", root, "--branch", options.branch, ...allowed.flatMap((p) => ["--allowed-path", p]), "--expect-sha256", planSha256];
  const fastForward = fastForwardFacts(root, head.out.trim(), base.out.trim(), tip.out.trim());
  if (fastForward.eligible) fastForward.next = [...applyArgv, "--keep-authorship", fastForward.dispatchId].map(shellWord).join(" ");
  return { schema: PLAN_SCHEMA, status: "ready", code: "AGYI-READY", root, branch: options.branch, head: head.out.trim(), tip: tip.out.trim(),
    base: base.out.trim(), commits: Number(commits.out.trim()), paths, planSha256, refusals: [], fastForward,
    next: applyArgv.map(shellWord).join(" ") };
}

/**
 * C29 R5 (ADR-0099): whether the child's own commits can land unchanged. Only when the branch was cut from the current HEAD (a fast-forward, no
 * rewrite) and every commit carries exactly one `Dispatch: <id> (goldfish)` trailer, the same id throughout, and `AI-Assisted: true`. A
 * fast-forward runs no commit-msg hook, so the trailers are checked here, per commit. Anything else keeps the patch route.
 */
function fastForwardFacts(root, head, base, tip) {
  const no = (reason) => ({ eligible: false, reason });
  if (base !== head) return no("HEAD moved on since the child's branch was cut, so its commits cannot land unchanged; the patch route below applies");
  const listed = git(root, ["rev-list", "--reverse", `${base}..${tip}`]);
  if (!listed.ok) return no("the branch's commits are not readable");
  const chain = listed.out.split("\n").filter(Boolean);
  let dispatchId = null;
  for (const commit of chain) {
    const message = git(root, ["log", "-1", "--format=%B", commit]);
    const trailers = message.ok ? git(root, ["interpret-trailers", "--parse"], message.out) : null;
    if (!trailers?.ok) return no(`the trailers of ${commit.slice(0, 12)} are not readable`);
    const lines = trailers.out.split("\n").filter(Boolean);
    const dispatch = lines.filter((line) => /^Dispatch:/iu.test(line)).map((line) => /^Dispatch: ([A-Za-z0-9][A-Za-z0-9._-]{0,95}) \(goldfish\)$/u.exec(line)?.[1] ?? null);
    if (dispatch.length !== 1 || dispatch[0] === null) return no(`commit ${commit.slice(0, 12)} does not carry exactly one "Dispatch: <id> (goldfish)" trailer`);
    if (!lines.includes("AI-Assisted: true")) return no(`commit ${commit.slice(0, 12)} does not carry "AI-Assisted: true"`);
    if (dispatchId !== null && dispatch[0] !== dispatchId) return no("the branch's commits name more than one dispatch id");
    dispatchId = dispatch[0];
  }
  return { eligible: true, dispatchId, commits: chain };
}

/**
 * What the child's branch delivered, per path: the blob at its tip, null for a deletion. Written before the working tree changes, so a failed
 * write leaves nothing applied; an apply that fails afterwards leaves a record no working tree matches. The commit route requires a match.
 */
function recordIntegration(planned) {
  const commonDir = resolveGitCommonDir(planned.root);
  if (!commonDir) throw new Error("the git common directory is not resolvable");
  const blobs = {};
  for (const path of planned.paths) {
    const blob = git(planned.root, ["rev-parse", "--verify", "--quiet", `${planned.tip}:${path}`]);
    blobs[path] = blob.ok ? blob.out.trim() : null;
  }
  const directory = integratedDirectory(commonDir);
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, `${planned.tip}.json`), `${JSON.stringify({ schema: INTEGRATED_SCHEMA, branch: planned.branch, tip: planned.tip, base: planned.base, blobs }, null, 2)}\n`, "utf8");
}

/** True when one taken-over child branch delivered exactly the working-tree content of every path. Unreadable records never match. */
export function integratedResultCovers({ root, commonDir, paths }) {
  let names;
  try { names = readdirSync(integratedDirectory(commonDir)); } catch { return false; }
  return names.filter((name) => /^[a-f0-9]{40,64}\.json$/u.test(name)).some((name) => {
    let blobs;
    try {
      const record = JSON.parse(readFileSync(join(integratedDirectory(commonDir), name), "utf8"));
      if (record?.schema !== INTEGRATED_SCHEMA || record.blobs === null || typeof record.blobs !== "object") return false;
      blobs = record.blobs;
    } catch { return false; }
    return paths.every((path) => {
      if (!Object.hasOwn(blobs, path)) return false;
      if (blobs[path] === null) return !existsSync(join(root, path));
      const current = git(root, ["hash-object", "--", path]);
      return current.ok && current.out.trim() === blobs[path];
    });
  });
}

export function apply(options) {
  if (!options.expect || !/^[a-f0-9]{64}$/u.test(options.expect)) {
    return { schema: PLAN_SCHEMA, status: "refused", code: "AGYI-EXPECT-SHA256-REQUIRED", paths: [],
      refusals: [refuse("AGYI-EXPECT-SHA256-REQUIRED", "apply writes only what plan showed", "run plan and pass its planSha256 as --expect-sha256")] };
  }
  const planned = plan(options);
  if (planned.status !== "ready") return planned;
  if (planned.planSha256 !== options.expect) {
    return { ...planned, status: "refused", code: "AGYI-PLAN-DIGEST-MISMATCH", paths: [],
      refusals: [refuse("AGYI-PLAN-DIGEST-MISMATCH", "HEAD, the branch or the change moved since plan", `run plan again and use its new planSha256: ${["node", SELF, "plan", "--root", planned.root, "--branch", planned.branch, ...options.allowed.flatMap((p) => ["--allowed-path", p])].map(shellWord).join(" ")}`)] };
  }
  if (options.keepAuthorship != null) return landWithAuthorship(planned, options.keepAuthorship);
  try { recordIntegration(planned); } catch (error) {
    return { ...planned, status: "refused", code: "AGYI-RECORD-FAILED", paths: [],
      refusals: [refuse("AGYI-RECORD-FAILED", `the take-over record could not be written (${error?.code ?? error?.name ?? "Error"})`, "nothing was written to the working tree; repair the git directory's permissions and plan again")] };
  }
  const patch = git(planned.root, ["diff", "--binary", "--full-index", "--no-renames", planned.base, planned.tip]);
  const applied = patch.ok ? git(planned.root, ["apply", "-"], patch.out) : { ok: false, err: patch.err };
  if (!applied.ok) {
    return { ...planned, status: "refused", code: "AGYI-APPLY-FAILED", paths: [],
      refusals: [refuse("AGYI-APPLY-FAILED", String(applied.err).trim().split("\n").slice(-2).join(" | "), "nothing was written (git apply is all-or-nothing); plan again")] };
  }
  const next = `the child's change is now in the working tree, uncommitted: commit it with the existing recovery route: node ${shellWord(RECOVER)} plan --root ${shellWord(planned.root)} --dispatch-id <the briefed dispatch id> ${planned.paths.map((p) => `--allowed-path ${shellWord(p)}`).join(" ")}, then the same command as apply with the --expect-sha256 digest it printed`;
  if (options.commitDispatchId == null) return { ...planned, status: "applied", code: "AGYI-APPLIED", next };
  const commit = commitThroughRecovery(planned, options.commitDispatchId);
  return { ...planned, status: "applied", code: "AGYI-APPLIED", commit,
    next: commit.status === "committed" ? "nothing left to do for this child: its change is committed with the dispatch trailer" : next };
}

/**
 * C29 R5 (ADR-0099): land the child's own commits unchanged (`git merge --ff-only`, atomic: it refuses before touching anything). Authorship,
 * trailers and tree stay the child's, so the D40b scan finds the Goldfish's own `Dispatch:` commit. The take-over record is written first, as
 * on the patch route. No dispatch record is written here: `next` names the attested writer over exactly these commits, which labels the record
 * orchestrator-attested (no host observation), as every take-over of a runner without a host return is.
 */
function landWithAuthorship(planned, dispatchId) {
  const refused = (code, message, next) => ({ ...planned, status: "refused", code, paths: [], refusals: [refuse(code, message, next)] });
  if (!planned.fastForward?.eligible) return refused("AGYI-FAST-FORWARD-UNAVAILABLE", planned.fastForward?.reason ?? "the branch cannot land unchanged", `use the patch route instead: ${planned.next}`);
  if (planned.fastForward.dispatchId !== dispatchId) {
    return refused("AGYI-FAST-FORWARD-DISPATCH-MISMATCH", `the branch's commits carry Dispatch: ${planned.fastForward.dispatchId}, not the briefed ${dispatchId}`,
      "pass the briefed dispatch id; a branch that carries another id is not this dispatch's result");
  }
  try { recordIntegration(planned); } catch (error) {
    return refused("AGYI-RECORD-FAILED", `the take-over record could not be written (${error?.code ?? error?.name ?? "Error"})`, "nothing was landed; repair the git directory's permissions and plan again");
  }
  const landed = git(planned.root, ["merge", "--ff-only", "--quiet", planned.tip]);
  if (!landed.ok) return refused("AGYI-FAST-FORWARD-FAILED", String(landed.err).trim().split("\n").slice(-2).join(" | "), "nothing was landed (a fast-forward is all-or-nothing); plan again");
  const recordWriter = fileURLToPath(new URL("./dispatch-record-write.mjs", import.meta.url));
  return { ...planned, status: "landed", code: "AGYI-LANDED-WITH-AUTHORSHIP", landed: { commits: planned.fastForward.commits, dispatchId },
    next: `the child's commits are on HEAD unchanged. Write the dispatch record over exactly these commits: put {"schema":"pipeline.dispatch-attested-request.v1","briefingPath":"<generated briefing>","handbackPath":"<the child's hand-back text>","commits":${JSON.stringify(planned.fastForward.commits)}} into a file under scratch/, then node ${shellWord(recordWriter)} --repo-root ${shellWord(planned.root)} --attested-request <that file>` };
}

/**
 * C28C: the recovery route's own plan, then its apply with the digest that plan printed, run back to back for exactly the paths this take-over wrote. The
 * paths are the integrate plan's own, so there is nothing new to review between the two pairs; every refusal of the recovery route is returned as it is and the
 * working tree keeps the applied change (the manual route in `next` still works).
 */
function commitThroughRecovery(planned, dispatchId) {
  const run = (args) => {
    const res = spawnSync(process.execPath, [RECOVER, ...args], { encoding: "utf8", shell: false, timeout: 120_000, maxBuffer: 1 << 26 });
    let json = null;
    try { json = JSON.parse(String(res.stdout ?? "")); } catch { /* typed below */ }
    return { json };
  };
  const planArgs = ["plan", "--root", planned.root, "--dispatch-id", dispatchId, ...planned.paths.flatMap((p) => ["--allowed-path", p])];
  const recoveryPlan = run(planArgs).json;
  if (recoveryPlan?.status !== "ready" || !Array.isArray(recoveryPlan.next) || recoveryPlan.next[2] !== "apply" || !recoveryPlan.next.every((word) => typeof word === "string")) {
    return { status: "refused", code: recoveryPlan?.code ?? "AGYI-COMMIT-PLAN-UNREADABLE", refusals: recoveryPlan?.refusals ?? [] };
  }
  const committed = run(recoveryPlan.next.slice(2)).json;
  if (committed?.status !== "committed") return { status: "refused", code: committed?.code ?? "AGYI-COMMIT-APPLY-UNREADABLE", refusals: committed?.refusals ?? [] };
  return { status: "committed", commit: committed.commit, dispatchId };
}

if (process.argv[1] && resolve(process.argv[1]) === SELF) {
  const parsed = parseArgs(process.argv.slice(2));
  const result = parsed.error
    ? { schema: PLAN_SCHEMA, status: "refused", code: "AGYI-ARGUMENTS", paths: [], refusals: [refuse("AGYI-ARGUMENTS", parsed.error, SYNTAX)] }
    : parsed.verb === "plan" ? plan(parsed) : apply(parsed);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exitCode = result.status === "refused" ? 2 : 0;
}
