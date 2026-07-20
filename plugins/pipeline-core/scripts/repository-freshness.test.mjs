#!/usr/bin/env node
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

import { inspectRepositoryFreshness } from "./repository-freshness.mjs";

const SCRIPT = fileURLToPath(new URL("./repository-freshness.mjs", import.meta.url));
const roots = [];
let passed = 0;
const failures = [];

function git(cwd, ...args) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (result.status !== 0) throw new Error(`git ${args.join(" ")} failed`);
  return result.stdout.trim();
}

function configure(repo) {
  git(repo, "config", "user.email", "freshness@example.invalid");
  git(repo, "config", "user.name", "Freshness Test");
}

function commit(repo, label) {
  writeFileSync(join(repo, `${label}.txt`), `${label}\n`);
  git(repo, "add", `${label}.txt`);
  git(repo, "commit", "-q", "-m", label);
}

function fixture(name) {
  const root = mkdtempSync(join(tmpdir(), `repository-freshness-${name}-`));
  roots.push(root);
  const remote = join(root, "remote.git");
  const seed = join(root, "seed");
  const checkout = join(root, "checkout");
  git(root, "init", "--bare", "-q", remote);
  git(root, "init", "-q", "-b", "main", seed);
  configure(seed);
  commit(seed, "base");
  git(seed, "remote", "add", "origin", remote);
  git(seed, "push", "-q", "-u", "origin", "main");
  git(root, "clone", "-q", "-b", "main", remote, checkout);
  configure(checkout);
  return { root, remote, seed, checkout };
}

function snapshot(repo) {
  const fetchHead = join(repo, ".git", "FETCH_HEAD");
  return {
    head: git(repo, "rev-parse", "HEAD"),
    refs: git(repo, "show-ref"),
    config: git(repo, "config", "--local", "--list"),
    status: git(repo, "status", "--porcelain=v1"),
    index: readFileSync(join(repo, ".git", "index")).toString("base64"),
    objects: git(repo, "count-objects", "-v"),
    fetchHead: existsSync(fetchHead) ? readFileSync(fetchHead, "utf8") : null,
  };
}

function freshnessTemps() {
  return readdirSync(tmpdir()).filter((name) => name.startsWith("pipeline-freshness-")).sort();
}

function check(name, fn) {
  try {
    fn();
    passed++;
    console.log(`PASS  ${name}`);
  } catch (error) {
    failures.push(`${name}: ${error.message}`);
    console.log(`FAIL  ${name}: ${error.message}`);
  }
}

function expect(condition, message) {
  if (!condition) throw new Error(message);
}

check("equal and source checkout remains byte-logically unchanged", () => {
  const { checkout } = fixture("equal");
  const before = snapshot(checkout);
  const tempsBefore = freshnessTemps();
  const inspected = inspectRepositoryFreshness(checkout);
  expect(inspected.exitCode === 0, "exit must be 0");
  expect(inspected.result.status === "equal", `status=${inspected.result.status}`);
  expect(inspected.result.ahead === 0 && inspected.result.behind === 0, "counts must be 0/0");
  expect(JSON.stringify(snapshot(checkout)) === JSON.stringify(before), "source checkout changed");
  expect(JSON.stringify(freshnessTemps()) === JSON.stringify(tempsBefore), "temporary repository leaked");
});

check("configured non-origin upstream is honored", () => {
  const { checkout } = fixture("non-origin");
  git(checkout, "remote", "rename", "origin", "mirror");
  const result = inspectRepositoryFreshness(checkout).result;
  expect(result.status === "equal" && result.upstream === "mirror/main", `status/upstream=${result.status}/${result.upstream}`);
});

check("ahead is writable and counted", () => {
  const { checkout } = fixture("ahead");
  commit(checkout, "local");
  const result = inspectRepositoryFreshness(checkout).result;
  expect(result.status === "ahead", `status=${result.status}`);
  expect(result.ahead === 1 && result.behind === 0, "counts must be 1/0");
});

check("behind observes remote without updating source tracking refs", () => {
  const { root, remote, checkout } = fixture("behind");
  const pusher = join(root, "pusher");
  git(root, "clone", "-q", "-b", "main", remote, pusher);
  configure(pusher);
  commit(pusher, "remote");
  git(pusher, "push", "-q", "origin", "main");
  const trackingBefore = git(checkout, "rev-parse", "refs/remotes/origin/main");
  const result = inspectRepositoryFreshness(checkout).result;
  expect(result.status === "behind", `status=${result.status}`);
  expect(result.ahead === 0 && result.behind === 1, "counts must be 0/1");
  expect(git(checkout, "rev-parse", "refs/remotes/origin/main") === trackingBefore, "tracking ref changed");
});

check("diverged is counted in both directions", () => {
  const { root, remote, checkout } = fixture("diverged");
  const pusher = join(root, "pusher");
  git(root, "clone", "-q", "-b", "main", remote, pusher);
  configure(pusher);
  commit(pusher, "remote");
  git(pusher, "push", "-q", "origin", "main");
  commit(checkout, "local");
  const result = inspectRepositoryFreshness(checkout).result;
  expect(result.status === "diverged", `status=${result.status}`);
  expect(result.ahead === 1 && result.behind === 1, "counts must be 1/1");
});

check("detached and no-upstream do not fetch", () => {
  const detached = fixture("detached").checkout;
  git(detached, "checkout", "-q", "--detach");
  git(detached, "remote", "set-url", "origin", "/definitely/missing/private-url");
  const detachedResult = inspectRepositoryFreshness(detached).result;
  expect(detachedResult.status === "detached" && detachedResult.fetchAttempted === false, "detached classification wrong");

  const noUpstream = fixture("no-upstream").checkout;
  git(noUpstream, "config", "--unset", "branch.main.remote");
  git(noUpstream, "config", "--unset", "branch.main.merge");
  const noUpstreamResult = inspectRepositoryFreshness(noUpstream).result;
  expect(noUpstreamResult.status === "no-upstream" && noUpstreamResult.fetchAttempted === false, "no-upstream classification wrong");
});

check("configured core.sshCommand is passed to temporary fetch without changing source", () => {
  const { checkout } = fixture("ssh-config");
  const transport = `ssh -o \"ProxyCommand=echo safe; exit 0\" -i \"/tmp/key with spaces\"`;
  git(checkout, "config", "core.sshCommand", transport);
  const before = snapshot(checkout);
  const calls = [];
  const inspected = inspectRepositoryFreshness(checkout, {
    runFetch: (args, options) => {
      calls.push(args);
      return spawnSync("git", args, options);
    },
  });
  expect(inspected.result.status === "equal", `status=${inspected.result.status}`);
  expect(calls.length === 1, `fetch calls=${calls.length}`);
  const index = calls[0].indexOf(`core.sshCommand=${transport}`);
  expect(index > 0 && calls[0][index - 1] === "-c", "transport must be one Git config argv value");
  expect(calls[0].filter((arg) => arg === transport).length === 0, "transport was split into argv fragments");
  expect(JSON.stringify(snapshot(checkout)) === JSON.stringify(before), "source checkout changed");
});

check("no configured core.sshCommand preserves the inherited transport environment", () => {
  const { checkout } = fixture("no-ssh-config");
  let args = null;
  const result = inspectRepositoryFreshness(checkout, {
    runFetch: (fetchArgs, options) => {
      args = fetchArgs;
      return spawnSync("git", fetchArgs, options);
    },
  }).result;
  expect(result.status === "equal", `status=${result.status}`);
  expect(!args.some((arg) => arg.startsWith("core.sshCommand=")), "unexpected transport override");
});

check("fetch failure with configured transport is sanitized unknown, never fresh", () => {
  const { checkout } = fixture("offline");
  git(checkout, "remote", "set-url", "origin", "/definitely/missing/private-url");
  git(checkout, "config", "core.sshCommand", `ssh -o \"IdentityFile=/tmp/key with spaces\"`);
  const inspected = inspectRepositoryFreshness(checkout);
  expect(inspected.exitCode === 0 && inspected.result.status === "unknown", "unknown classification wrong");
  expect(inspected.result.reason === "fetch-failed", `reason=${inspected.result.reason}`);
  expect(!JSON.stringify(inspected.result).includes("/definitely"), "remote URL leaked");
  expect(inspected.result.fetchAttempted === true, "fetchAttempted must be true");
});

check("direct OID fallback uses the configured transport and only exact equality is fresh", () => {
  const { checkout } = fixture("direct-oid");
  const transport = `ssh -o \"ProxyCommand=echo safe; exit 0\" -i \"/tmp/key with spaces\"`;
  git(checkout, "config", "core.sshCommand", transport);
  git(checkout, "remote", "set-url", "origin", "/definitely/missing/private-url");
  const head = git(checkout, "rev-parse", "HEAD");
  let directArgs = null;
  const equal = inspectRepositoryFreshness(checkout, {
    runDirect: (args) => {
      directArgs = args;
      return { status: 0, stdout: `${head}\trefs/heads/main\n` };
    },
  }).result;
  expect(equal.status === "equal" && equal.reason === "direct-oid-equality-fallback", `status/reason=${equal.status}/${equal.reason}`);
  expect(directArgs.includes(`core.sshCommand=${transport}`), "direct fallback omitted configured transport");
  expect(directArgs.filter((arg) => arg === `core.sshCommand=${transport}`).length === 1, "direct fallback split transport");

  const mismatch = inspectRepositoryFreshness(checkout, {
    runDirect: () => ({ status: 0, stdout: `${"b".repeat(40)}\trefs/heads/main\n` }),
  }).result;
  expect(mismatch.status === "unknown" && mismatch.reason === "fetch-failed", `mismatch=${mismatch.status}/${mismatch.reason}`);
});

check("unavailable configured remote is unknown without a false fetch claim", () => {
  const { checkout } = fixture("missing-remote");
  git(checkout, "config", "branch.main.remote", "missing-remote");
  const result = inspectRepositoryFreshness(checkout).result;
  expect(result.status === "unknown" && result.reason === "upstream-unavailable", `status/reason=${result.status}/${result.reason}`);
  expect(result.fetchAttempted === false, "fetchAttempted must stay false before a fetch starts");
});

check("bounded fetch timeout is unknown", () => {
  const { checkout } = fixture("timeout");
  let observedTimeout = null;
  const result = inspectRepositoryFreshness(checkout, {
    fetchTimeoutMs: 20,
    runFetch: (_args, options) => {
      observedTimeout = options.timeout;
      return { status: null, signal: "SIGTERM", error: { code: "ETIMEDOUT" } };
    },
  }).result;
  expect(observedTimeout === 20, `fetch timeout option=${observedTimeout}`);
  expect(result.status === "unknown" && result.reason === "timeout", `status/reason=${result.status}/${result.reason}`);
});

check("fresh remote branch visibility follows the remote, not tracking refs", () => {
  const { root, remote, checkout } = fixture("branches");
  const pusher = join(root, "pusher");
  git(root, "clone", "-q", "-b", "main", remote, pusher);
  configure(pusher);
  git(pusher, "checkout", "-q", "-b", "feature-visible");
  commit(pusher, "feature");
  git(pusher, "push", "-q", "origin", "feature-visible");
  let result = inspectRepositoryFreshness(checkout).result;
  expect(result.otherUnmergedRemoteBranches.includes("feature-visible"), "new remote branch was not visible");
  git(pusher, "push", "-q", "origin", "--delete", "feature-visible");
  result = inspectRepositoryFreshness(checkout).result;
  expect(!result.otherUnmergedRemoteBranches.includes("feature-visible"), "deleted remote branch remained visible");
});

check("remote branch information is bounded with a truncation count", () => {
  const { remote, seed, checkout } = fixture("branch-cap");
  const base = git(seed, "rev-parse", "HEAD");
  for (let i = 0; i < 23; i++) {
    git(seed, "checkout", "-q", "-B", `topic-${String(i).padStart(2, "0")}`, base);
    commit(seed, `topic-${i}`);
    git(seed, "push", "-q", remote, `HEAD:refs/heads/topic-${String(i).padStart(2, "0")}`);
  }
  const result = inspectRepositoryFreshness(checkout).result;
  expect(result.otherUnmergedRemoteBranches.length === 20, `reported=${result.otherUnmergedRemoteBranches.length}`);
  expect(result.otherUnmergedRemoteBranchesTruncated === 3, `truncated=${result.otherUnmergedRemoteBranchesTruncated}`);
});

check("unequal shallow checkout is unknown, not false-diverged", () => {
  const { root, remote } = fixture("shallow");
  const shallow = join(root, "shallow-checkout");
  git(root, "clone", "-q", "--depth", "1", "-b", "main", pathToFileURL(remote).href, shallow);
  configure(shallow);
  const pusher = join(root, "pusher");
  git(root, "clone", "-q", "-b", "main", remote, pusher);
  configure(pusher);
  commit(pusher, "new-remote");
  git(pusher, "push", "-q", "origin", "main");
  const result = inspectRepositoryFreshness(shallow).result;
  expect(result.status === "unknown" && result.reason === "shallow-history", `status/reason=${result.status}/${result.reason}`);
});

check("CLI emits one schema-valid JSON object", () => {
  const { checkout } = fixture("cli");
  const cli = spawnSync(process.execPath, [SCRIPT, "--repo", checkout], { encoding: "utf8" });
  expect(cli.status === 0, `CLI exit=${cli.status}`);
  expect(cli.stdout.trim(), `CLI stdout empty; stderr=${cli.stderr.trim()}`);
  const parsed = JSON.parse(cli.stdout);
  expect(parsed.schema === "pipeline.repository-freshness.v0" && parsed.status === "equal", "CLI payload wrong");
  const bad = spawnSync(process.execPath, [SCRIPT, "--repo", join(checkout, "missing")], { encoding: "utf8" });
  expect(bad.status === 2 && !bad.stderr.includes(checkout), "invalid repo error must be sanitized");
});

for (const root of roots) rmSync(root, { recursive: true, force: true });

const total = passed + failures.length;
console.log(`\n${passed}/${total} cases passed.`);
if (failures.length) {
  for (const failure of failures) console.log(`  - ${failure}`);
  process.exit(1);
}
