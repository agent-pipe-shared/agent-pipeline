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
 *
 * --allowed-path (at least one, repeated) is the briefed write scope; a branch that changed any other path is refused. The digest binds HEAD,
 * the branch tip, the merge base, the paths and the patch bytes, so a moved HEAD or branch makes `apply` refuse before writing. `git apply`
 * is all-or-nothing: a refusal leaves nothing behind. Exit 0 ready/applied, 2 refused. Output is JSON `pipeline.agy-native-integrate-plan.v1`.
 */
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { posix, resolve, isAbsolute, relative } from "node:path";
import { fileURLToPath } from "node:url";

export const PLAN_SCHEMA = "pipeline.agy-native-integrate-plan.v1";
const SELF = fileURLToPath(import.meta.url);
const RECOVER = fileURLToPath(new URL("./goldfish-host-commit-recover.mjs", import.meta.url));
const BRANCH = /^subagent-[A-Za-z0-9][A-Za-z0-9._-]{0,120}$/u;
const SYNTAX = "plan|apply --root <root> --branch <subagent-...> --allowed-path <p>... [--expect-sha256 <digest>]";
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
  const out = { verb, root: null, branch: null, allowed: [], expect: null };
  for (let i = 0; i < rest.length; i += 2) {
    const flag = rest[i], value = rest[i + 1];
    if (typeof value !== "string" || value === "" || /[\u0000-\u001f\u007f]/u.test(value)) return { error: `flag ${flag} needs one value; usage: ${SYNTAX}` };
    if (flag === "--root" && out.root === null) out.root = value;
    else if (flag === "--branch" && out.branch === null) out.branch = value;
    else if (flag === "--allowed-path") out.allowed.push(value);
    else if (flag === "--expect-sha256" && out.expect === null) out.expect = value;
    else return { error: `unexpected or repeated flag ${flag}; usage: ${SYNTAX}` };
  }
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
  return { schema: PLAN_SCHEMA, status: "ready", code: "AGYI-READY", root, branch: options.branch, head: head.out.trim(), tip: tip.out.trim(),
    base: base.out.trim(), commits: Number(commits.out.trim()), paths, planSha256, refusals: [],
    next: ["node", SELF, "apply", "--root", root, "--branch", options.branch, ...allowed.flatMap((p) => ["--allowed-path", p]), "--expect-sha256", planSha256].map(shellWord).join(" ") };
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
  const patch = git(planned.root, ["diff", "--binary", "--full-index", "--no-renames", planned.base, planned.tip]);
  const applied = patch.ok ? git(planned.root, ["apply", "-"], patch.out) : { ok: false, err: patch.err };
  if (!applied.ok) {
    return { ...planned, status: "refused", code: "AGYI-APPLY-FAILED", paths: [],
      refusals: [refuse("AGYI-APPLY-FAILED", String(applied.err).trim().split("\n").slice(-2).join(" | "), "nothing was written (git apply is all-or-nothing); plan again")] };
  }
  return { ...planned, status: "applied", code: "AGYI-APPLIED",
    next: `the child's change is now in the working tree, uncommitted: commit it with the existing recovery route: node ${shellWord(RECOVER)} plan --root ${shellWord(planned.root)} --dispatch-id <the briefed dispatch id> ${planned.paths.map((p) => `--allowed-path ${shellWord(p)}`).join(" ")}, then the same command as apply with the --expect-sha256 digest it printed` };
}

if (process.argv[1] && resolve(process.argv[1]) === SELF) {
  const parsed = parseArgs(process.argv.slice(2));
  const result = parsed.error
    ? { schema: PLAN_SCHEMA, status: "refused", code: "AGYI-ARGUMENTS", paths: [], refusals: [refuse("AGYI-ARGUMENTS", parsed.error, SYNTAX)] }
    : parsed.verb === "plan" ? plan(parsed) : apply(parsed);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exitCode = result.status === "refused" ? 2 : 0;
}
