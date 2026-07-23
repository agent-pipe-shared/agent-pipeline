#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * Report whether one checkout is equal to, ahead of, behind, or diverged from its
 * configured upstream. The source checkout is never fetched or otherwise mutated:
 * remote objects land in a disposable bare repository whose object lookup reads the
 * source object directory through GIT_ALTERNATE_OBJECT_DIRECTORIES.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const SCHEMA = "pipeline.repository-freshness.v0";
const FETCH_TIMEOUT_MS = 8000;

function git(repo, args, options = {}) {
  return spawnSync("git", ["-C", repo, ...args], {
    encoding: "utf8",
    timeout: options.timeout ?? 5000,
    env: options.env ?? process.env,
  });
}

function defaultFetch(args, options) {
  return spawnSync("git", args, options);
}

function defaultDirect(args, options) {
  return spawnSync("git", args, options);
}

function sourceTransport(repo) {
  // Ask Git for the effective checkout config rather than parsing .git/config.
  // Passing the value back through Git's -c argv form preserves Git's own
  // command parsing for quoted/multi-argument ssh commands and avoids shell
  // concatenation. An absent key deliberately leaves GIT_SSH_COMMAND and the
  // rest of the inherited environment untouched.
  const configured = git(repo, ["config", "--get", "core.sshCommand"]);
  if (configured.status === 1 && !configured.stderr) return { ok: true, configArgs: [] };
  if (configured.status !== 0 || typeof configured.stdout !== "string") return { ok: false };
  const value = configured.stdout.replace(/\r?\n$/u, "");
  if (!value || /[\r\n]/u.test(value)) return { ok: false };
  return { ok: true, configArgs: ["-c", `core.sshCommand=${value}`] };
}

function outputBase(status, fields = {}) {
  return {
    schema: SCHEMA,
    status,
    head: fields.head ?? null,
    branch: fields.branch ?? null,
    upstream: fields.upstream ?? null,
    remoteHead: fields.remoteHead ?? null,
    ahead: fields.ahead ?? null,
    behind: fields.behind ?? null,
    fetchAttempted: fields.fetchAttempted ?? false,
    otherUnmergedRemoteBranches: fields.otherUnmergedRemoteBranches ?? [],
    otherUnmergedRemoteBranchesTruncated: fields.otherUnmergedRemoteBranchesTruncated ?? 0,
    reason: fields.reason ?? null,
  };
}

function fullOid(value) {
  return /^[0-9a-f]{40,64}$/i.test(value ?? "");
}

function freshUnmergedRemoteBranches(temp, env, upstreamBranch) {
  const refs = spawnSync(
    "git",
    [
      "--git-dir",
      temp,
      "for-each-ref",
      "--no-merged=refs/freshness/local",
      "--format=%(refname)",
      "refs/freshness/remotes/",
    ],
    { encoding: "utf8", timeout: 5000, env },
  );
  if (refs.status !== 0) return { names: [], truncated: 0 };
  const names = refs.stdout
    .split(/\r?\n/)
    .filter(Boolean)
    .filter((ref) => ref !== `refs/freshness/remotes/${upstreamBranch}`)
    .map((ref) => ref.slice("refs/freshness/remotes/".length))
    .sort();
  return { names: names.slice(0, 20), truncated: Math.max(0, names.length - 20) };
}

export function inspectRepositoryFreshness(
  repoPath,
  {
    fetchTimeoutMs = FETCH_TIMEOUT_MS,
    runFetch = defaultFetch,
    runDirect = defaultDirect,
  } = {},
) {
  const repo = resolve(repoPath);
  const headResult = git(repo, ["rev-parse", "--verify", "HEAD"]);
  const head = headResult.stdout?.trim();
  if (headResult.status !== 0 || !fullOid(head)) {
    return { exitCode: 2, error: "repository HEAD is unavailable" };
  }

  const branchResult = git(repo, ["symbolic-ref", "-q", "--short", "HEAD"]);
  const branch = branchResult.stdout?.trim() || null;
  if (!branch) return { exitCode: 0, result: outputBase("detached", { head }) };

  const remoteResult = git(repo, ["config", "--get", `branch.${branch}.remote`]);
  const mergeResult = git(repo, ["config", "--get", `branch.${branch}.merge`]);
  const remote = remoteResult.stdout?.trim();
  const mergeRef = mergeResult.stdout?.trim();
  if (remoteResult.status !== 0 || mergeResult.status !== 0 || !remote || !mergeRef?.startsWith("refs/heads/")) {
    return { exitCode: 0, result: outputBase("no-upstream", { head, branch }) };
  }

  const upstreamBranch = mergeRef.slice("refs/heads/".length);
  const upstream = remote === "." ? upstreamBranch : `${remote}/${upstreamBranch}`;
  let remoteUrl;
  if (remote === ".") {
    remoteUrl = repo;
  } else {
    const urlResult = git(repo, ["remote", "get-url", remote]);
    remoteUrl = urlResult.stdout?.trim();
    if (urlResult.status !== 0 || !remoteUrl) {
      return { exitCode: 0, result: outputBase("unknown", { head, branch, upstream, reason: "upstream-unavailable" }) };
    }
  }

  const objectResult = git(repo, ["rev-parse", "--git-path", "objects"]);
  const objectPathRaw = objectResult.stdout?.trim();
  if (objectResult.status !== 0 || !objectPathRaw) return { exitCode: 2, error: "repository object store is unavailable" };
  const objectPath = isAbsolute(objectPathRaw) ? objectPathRaw : resolve(repo, objectPathRaw);

  const temp = mkdtempSync(join(tmpdir(), "pipeline-freshness-"));
  try {
    const init = spawnSync("git", ["init", "--bare", "--quiet", temp], { encoding: "utf8", timeout: 5000 });
    if (init.status !== 0) return { exitCode: 2, error: "temporary comparison repository could not be initialized" };
    const env = {
      ...process.env,
      GIT_ALTERNATE_OBJECT_DIRECTORIES: objectPath,
      GIT_TERMINAL_PROMPT: "0",
    };
    const transport = sourceTransport(repo);
    if (!transport.ok) {
      return { exitCode: 0, result: outputBase("unknown", { head, branch, upstream, reason: "transport-unavailable" }) };
    }
    const localRef = spawnSync("git", ["--git-dir", temp, "update-ref", "refs/freshness/local", head], {
      encoding: "utf8",
      timeout: 5000,
      env,
    });
    if (localRef.status !== 0) return { exitCode: 2, error: "local comparison ref could not be prepared" };

    const fetch = runFetch(
      [
        "--git-dir",
        temp,
        ...transport.configArgs,
        "-c",
        "maintenance.auto=false",
        "fetch",
        "--quiet",
        "--no-tags",
        "--no-recurse-submodules",
        "--no-write-fetch-head",
        remoteUrl,
        "+refs/heads/*:refs/freshness/remotes/*",
      ],
      { encoding: "utf8", timeout: fetchTimeoutMs, env },
    );
    if (fetch.status !== 0) {
      // Some WSL/SSH setups authenticate direct remote reads but reject the
      // temporary bare-repository fetch used for ancestry comparison. An exact
      // OID equality is still safe evidence of freshness; any mismatch or
      // failed probe remains unknown and therefore write-blocking.
      if (runFetch === defaultFetch) {
        const direct = runDirect([...transport.configArgs, "ls-remote", remoteUrl, `refs/heads/${upstreamBranch}`], {
          encoding: "utf8",
          timeout: fetchTimeoutMs,
          env,
        });
        const directHead = direct.stdout?.trim().split(/\s+/u)[0];
        if (direct.status === 0 && fullOid(directHead) && directHead === head) {
          return {
            exitCode: 0,
            result: outputBase("equal", {
              head,
              branch,
              upstream,
              remoteHead: directHead,
              ahead: 0,
              behind: 0,
              fetchAttempted: true,
              reason: "direct-oid-equality-fallback",
            }),
          };
        }
      }
      const reason = fetch.error?.code === "ETIMEDOUT" || fetch.signal ? "timeout" : "fetch-failed";
      return { exitCode: 0, result: outputBase("unknown", { head, branch, upstream, fetchAttempted: true, reason }) };
    }

    const remoteRef = `refs/freshness/remotes/${upstreamBranch}`;
    const remoteHeadResult = spawnSync("git", ["--git-dir", temp, "rev-parse", remoteRef], {
      encoding: "utf8",
      timeout: 5000,
      env,
    });
    const remoteHead = remoteHeadResult.stdout?.trim();
    const counts = spawnSync(
      "git",
      ["--git-dir", temp, "rev-list", "--left-right", "--count", `refs/freshness/local...${remoteRef}`],
      { encoding: "utf8", timeout: 5000, env },
    );
    const match = counts.stdout?.trim().match(/^(\d+)\s+(\d+)$/);
    if (remoteHeadResult.status !== 0 || !fullOid(remoteHead)) {
      return { exitCode: 0, result: outputBase("unknown", { head, branch, upstream, fetchAttempted: true, reason: "upstream-unavailable" }) };
    }
    const shallowResult = git(repo, ["rev-parse", "--is-shallow-repository"]);
    const shallow = shallowResult.status === 0 && shallowResult.stdout.trim() === "true";
    if (shallow && remoteHead !== head) {
      return { exitCode: 0, result: outputBase("unknown", { head, branch, upstream, fetchAttempted: true, reason: "shallow-history" }) };
    }
    if (counts.status !== 0 || !match) {
      return { exitCode: 2, error: "freshness comparison was internally inconsistent" };
    }
    const ahead = Number(match[1]);
    const behind = Number(match[2]);
    const status = ahead === 0 ? (behind === 0 ? "equal" : "behind") : behind === 0 ? "ahead" : "diverged";
    const otherBranches = freshUnmergedRemoteBranches(temp, env, upstreamBranch);
    return {
      exitCode: 0,
      result: outputBase(status, {
        head,
        branch,
        upstream,
        remoteHead,
        ahead,
        behind,
        fetchAttempted: true,
        otherUnmergedRemoteBranches: otherBranches.names,
        otherUnmergedRemoteBranchesTruncated: otherBranches.truncated,
      }),
    };
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}

function parseArgs(argv) {
  if (argv.length === 0) return process.env.CLAUDE_PROJECT_DIR || process.cwd();
  if (argv.length === 2 && argv[0] === "--repo" && argv[1]) return argv[1];
  return null;
}

const isCli = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  const repo = parseArgs(process.argv.slice(2));
  if (!repo) {
    process.stderr.write("repository-freshness: usage: repository-freshness.mjs [--repo <path>]\n");
    process.exit(2);
  }
  const inspected = inspectRepositoryFreshness(repo);
  if (inspected.result) process.stdout.write(`${JSON.stringify(inspected.result)}\n`);
  else process.stderr.write(`repository-freshness: ${inspected.error}\n`);
  process.exit(inspected.exitCode);
}
