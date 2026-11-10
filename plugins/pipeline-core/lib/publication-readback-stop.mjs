// SPDX-License-Identifier: SUL-1.0
/**
 * publication-readback-stop.mjs -- records a push at the end of the turn, so the readback no longer depends on an agent remembering it.
 *
 * All three runners have a Stop event; Antigravity and Codex have no event after a tool call. So the push is recognised afterwards, from Git's own reflog of the
 * remote-tracking ref: Git writes "update by push" there when a push moves it. Anything new is handed to `recordPublicationReadback`, which asks the remote itself.
 *
 * What this cannot see: a remote without a fetch refspec (no tracking ref exists), `core.logAllRefUpdates=false`, and a push whose reflog line a later fetch has
 * already covered. `publication-readback.mjs record` stays the manual route for those.
 *
 * Cost on an ordinary Stop is one git call and a few small reads. The heavy module is imported only when a push is really there to record. An attempt that did not
 * produce a matching record is remembered for 15 minutes, so an unreachable remote does not cost a network timeout on every Stop.
 */
import { spawnSync } from "node:child_process";
import { existsSync, lstatSync, readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { ensurePrivateDirectory } from "./private-boundary.mjs";

const PUSH_LINE = /^[0-9a-f]{40,64} ([0-9a-f]{40,64}) .*\tupdate by push$/u;
const ZERO_OID = /^0+$/u;
const BRANCH = /^[A-Za-z0-9._/-]{1,200}$/u;
const MAX_REFS = 200;
const MAX_LOG_BYTES = 1024 * 1024;
const MAX_RECORDS_PER_STOP = 3;
const RETRY_AFTER_MS = 15 * 60 * 1000;

function git(cwd, args) {
  const run = spawnSync("git", ["-C", cwd, ...args], { encoding: "utf8", shell: false, timeout: 5_000, maxBuffer: 1024 * 1024 });
  return run.error || run.status !== 0 ? null : String(run.stdout);
}

function trackingLogs(directory, prefix = "", found = []) {
  let entries;
  try { entries = readdirSync(directory, { withFileTypes: true }); } catch { return found; }
  for (const entry of entries) {
    if (found.length >= MAX_REFS) break;
    const ref = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
    if (entry.isDirectory()) trackingLogs(join(directory, entry.name), ref, found);
    else if (entry.isFile()) found.push({ ref, path: join(directory, entry.name) });
  }
  return found;
}

function pushedCommit(path) {
  try {
    if (lstatSync(path).size > MAX_LOG_BYTES) return null;
    const last = readFileSync(path, "utf8").split("\n").filter((line) => line !== "").at(-1);
    const commit = last === undefined ? null : PUSH_LINE.exec(last)?.[1] ?? null;
    return commit === null || ZERO_OID.test(commit) ? null : commit;
  } catch { return null; }
}

function target(ref, remotes) {
  const remote = remotes.filter((name) => ref.startsWith(`${name}/`)).sort((a, b) => b.length - a.length)[0];
  if (remote === undefined) return null;
  const branch = ref.slice(remote.length + 1);
  return branch === "HEAD" || !BRANCH.test(branch) ? null : { remote, destination: `refs/heads/${branch}` };
}

const keyOf = (remote, destination, commit) => `${remote}\0${destination}\0${commit}`;

function recordedKeys(path) {
  const keys = new Set();
  if (!existsSync(path)) return keys;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    if (line === "") continue;
    try { const record = JSON.parse(line); keys.add(keyOf(record.remote, record.destination, record.remoteCommit)); } catch { /* the recorder reports a damaged file */ }
  }
  return keys;
}

function readAttempts(path, nowMs) {
  try {
    return Object.fromEntries(Object.entries(JSON.parse(readFileSync(path, "utf8"))).filter(([, at]) => typeof at === "number" && nowMs - at < RETRY_AFTER_MS));
  } catch { return {}; }
}

function writeAttempts(path, attempts) {
  ensurePrivateDirectory(dirname(path));
  const pending = `${path}.tmp`;
  writeFileSync(pending, `${JSON.stringify(attempts)}\n`, { mode: 0o600 });
  renameSync(pending, path);
}

/**
 * Records every push not yet on file, at most three per Stop. Returns what it did, for tests; the hook ignores it.
 * `deps` ({ now, recordReadback }) is for tests.
 */
export async function recordPushesAtStop({ cwd }, deps = {}) {
  const located = git(cwd, ["rev-parse", "--path-format=absolute", "--git-common-dir", "--show-toplevel"]);
  if (located === null) return { recorded: [], skipped: "no-repository" };
  const [common, root] = located.split(/\r?\n/u).filter(Boolean);
  if (common === undefined || root === undefined) return { recorded: [], skipped: "no-repository" };
  const logs = trackingLogs(join(common, "logs", "refs", "remotes"));
  const pushes = logs.flatMap(({ ref, path }) => { const commit = pushedCommit(path); return commit === null ? [] : [{ ref, commit }]; });
  if (pushes.length === 0) return { recorded: [], skipped: "no-push" };
  const remotes = String(git(root, ["remote"]) ?? "").split(/\r?\n/u).map((name) => name.trim()).filter(Boolean);
  const directory = join(common, "agent-pipeline", "publication-readback");
  const attemptsPath = join(directory, "stop-attempts.json");
  const nowMs = (deps.now ?? (() => new Date()))().getTime();
  const attempts = readAttempts(attemptsPath, nowMs);
  const known = recordedKeys(join(directory, "records.jsonl"));
  const open = pushes.flatMap(({ ref, commit }) => {
    const found = target(ref, remotes);
    if (found === null) return [];
    const key = keyOf(found.remote, found.destination, commit);
    return known.has(key) || Object.hasOwn(attempts, key) ? [] : [{ ...found, commit, key }];
  }).slice(0, MAX_RECORDS_PER_STOP);
  if (open.length === 0) return { recorded: [], skipped: "nothing-new" };
  const recordReadback = deps.recordReadback ?? (await import("../scripts/publication-readback.mjs")).recordPublicationReadback;
  const recorded = [];
  let attemptsChanged = false;
  for (const { remote, destination, commit, key } of open) {
    const { result } = recordReadback({ root, remote, destination }, deps);
    if (result.record?.remoteCommit === commit) recorded.push({ remote, destination, commit, status: result.status });
    else { attempts[key] = nowMs; attemptsChanged = true; }
  }
  if (attemptsChanged) writeAttempts(attemptsPath, attempts);
  return { recorded };
}
