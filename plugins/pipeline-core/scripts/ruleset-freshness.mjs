#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

/**
 * Compare the loaded Pipeline ruleset with the committed public marketplace.
 *
 * Consumer installations require equality. In the Agent-Pipeline source
 * checkout, a local commit that descends from public marketplace HEAD is an
 * intentional self-application `ahead` state and is therefore current. Remote
 * objects are fetched only into a disposable bare repository; the source
 * checkout's refs, index, config and worktree are never changed.
 */
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { resolveMarketplaceUrl } from "../hooks/staleness-check.mjs";

export const RULESET_FRESHNESS_SCHEMA = "pipeline.ruleset-freshness.v1";
const SHA = /^[0-9a-f]{40,64}$/i;
const DEFAULT_TIMEOUT_MS = 30_000;

function run(command, args, options = {}) {
  return (options.spawn ?? spawnSync)(command, args, {
    cwd: options.cwd,
    encoding: "utf8",
    timeout: options.timeout ?? 5_000,
    shell: false,
    env: options.env ?? process.env,
  });
}

function git(repo, args, options = {}) {
  return run("git", ["-C", repo, ...args], { ...options, cwd: undefined });
}

function result(status, fields = {}) {
  return {
    schema: RULESET_FRESHNESS_SCHEMA,
    status,
    source: fields.source ?? null,
    loadedSha: fields.loadedSha ?? null,
    remoteSha: fields.remoteSha ?? null,
    ahead: fields.ahead ?? null,
    behind: fields.behind ?? null,
    writePermitted: status === "equal" || status === "ahead",
    reason: fields.reason ?? null,
  };
}

function relation(counts, fields) {
  const match = String(counts.stdout ?? "").trim().match(/^(\d+)\s+(\d+)$/u);
  if (counts.status !== 0 || !match) return result("unknown", { ...fields, reason: "comparison-failed" });
  const ahead = Number(match[1]);
  const behind = Number(match[2]);
  const status = ahead === 0 ? (behind === 0 ? "equal" : "behind") : behind === 0 ? "ahead" : "diverged";
  return result(status, { ...fields, ahead, behind });
}

function compareSelfApplication(repo, loadedSha, remoteSha, options = {}) {
  const fields = { source: "self-application", loadedSha, remoteSha };
  const localObject = git(repo, ["cat-file", "-e", `${remoteSha}^{commit}`], options);
  if (localObject.status === 0) {
    return relation(git(repo, ["rev-list", "--left-right", "--count", `${loadedSha}...${remoteSha}`], options), fields);
  }

  const objectResult = git(repo, ["rev-parse", "--git-path", "objects"], options);
  const objectRaw = String(objectResult.stdout ?? "").trim();
  if (objectResult.status !== 0 || !objectRaw) return result("unknown", { ...fields, reason: "object-store-unavailable" });
  const objectPath = isAbsolute(objectRaw) ? objectRaw : resolve(repo, objectRaw);
  const temporary = mkdtempSync(join(tmpdir(), "pipeline-ruleset-freshness-"));
  try {
    const init = run("git", ["init", "--bare", "--quiet", temporary], options);
    if (init.status !== 0) return result("unknown", { ...fields, reason: "comparison-init-failed" });
    const env = {
      ...process.env,
      GIT_ALTERNATE_OBJECT_DIRECTORIES: objectPath,
      GIT_TERMINAL_PROMPT: "0",
      GIT_CONFIG_NOSYSTEM: "1",
    };
    const localRef = run("git", ["--git-dir", temporary, "update-ref", "refs/ruleset/local", loadedSha], { ...options, env });
    if (localRef.status !== 0) return result("unknown", { ...fields, reason: "local-ref-unavailable" });
    const fetch = run("git", ["--git-dir", temporary, "-c", "maintenance.auto=false", "fetch", "--quiet", "--no-tags", "--no-recurse-submodules", "--no-write-fetch-head", options.remoteUrl, `${remoteSha}:refs/ruleset/remote`], {
      ...options,
      timeout: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      env,
    });
    if (fetch.status !== 0) return result("unknown", { ...fields, reason: fetch.error?.code === "ETIMEDOUT" || fetch.signal ? "timeout" : "remote-object-unavailable" });
    const counts = run("git", ["--git-dir", temporary, "rev-list", "--left-right", "--count", "refs/ruleset/local...refs/ruleset/remote"], { ...options, env });
    return relation(counts, fields);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}

export function inspectRulesetFreshness(repoPath, options = {}) {
  const repo = resolve(repoPath);
  const settingsPath = options.settingsPath ?? join(repo, ".claude", "settings.json");
  const remoteUrl = options.remoteUrl ?? resolveMarketplaceUrl({ settingsPath });
  if (!remoteUrl) return result("unknown", { reason: "marketplace-unavailable" });

  const loadedResult = options.loadedSha
    ? { status: 0, stdout: options.loadedSha }
    : git(repo, ["rev-parse", "--verify", "HEAD"], options);
  const loadedSha = String(loadedResult.stdout ?? "").trim().toLowerCase();
  if (loadedResult.status !== 0 || !SHA.test(loadedSha)) return result("unknown", { reason: "loaded-sha-unavailable" });

  const remote = run("git", ["ls-remote", remoteUrl, "HEAD"], {
    ...options,
    timeout: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
  });
  const remoteSha = String(remote.stdout ?? "").trim().split(/\s+/u)[0]?.toLowerCase();
  if (remote.status !== 0 || !SHA.test(remoteSha)) {
    return result("unknown", {
      loadedSha,
      reason: remote.error?.code === "ETIMEDOUT" || remote.signal ? "timeout" : "remote-unavailable",
    });
  }

  const selfApplication = options.selfApplication ?? (
    existsSync(join(repo, "setup.mjs"))
    && existsSync(join(repo, "plugins", "pipeline-core", ".codex-plugin", "plugin.json"))
  );
  if (!selfApplication) {
    return result(loadedSha === remoteSha ? "equal" : "stale", {
      source: "installed-plugin",
      loadedSha,
      remoteSha,
      ahead: loadedSha === remoteSha ? 0 : null,
      behind: loadedSha === remoteSha ? 0 : null,
    });
  }
  return compareSelfApplication(repo, loadedSha, remoteSha, { ...options, remoteUrl });
}

function parseArgs(argv) {
  const parsed = { repo: process.env.CLAUDE_PROJECT_DIR || process.cwd() };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--repo" && argv[index + 1]) parsed.repo = argv[++index];
    else if (argv[index] === "--loaded-sha" && argv[index + 1]) parsed.loadedSha = argv[++index];
    else return null;
  }
  return parsed;
}

const isCli = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  const parsed = parseArgs(process.argv.slice(2));
  if (!parsed) {
    process.stderr.write("ruleset-freshness: usage: ruleset-freshness.mjs [--repo <path>] [--loaded-sha <sha>]\n");
    process.exit(64);
  }
  const inspected = inspectRulesetFreshness(parsed.repo, { loadedSha: parsed.loadedSha });
  process.stdout.write(`${JSON.stringify(inspected)}\n`);
  process.exit(inspected.status === "equal" || inspected.status === "ahead" || inspected.status === "unknown" ? 0 : 2);
}
