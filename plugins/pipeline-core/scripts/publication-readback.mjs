#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * publication-readback.mjs -- the machine record of what a remote really holds after a push. Codex greenfield report (P2): after the push the tracked handover
 * still said "Push: not done", and the run built its own forensic readback by hand.
 *
 * Usage: node <plugin-root>/scripts/publication-readback.mjs record --root <project-root> --remote <name> --destination refs/heads/<branch>
 *        node <plugin-root>/scripts/publication-readback.mjs inspect --root <project-root>
 *
 * `record` asks the remote itself (`git ls-remote`, the same reader push-prepare uses), compares its answer with HEAD and appends one line to
 * <git common dir>/agent-pipeline/publication-readback/records.jsonl. The file is private and outside the working tree on purpose: a pushed project must not need
 * a commit to say that it was pushed, and a commit after the freeze is exactly what the close forbids. Every line carries the digest of the line before it, so a
 * changed or removed line is detected. The remote's URL is never written, it can carry a credential. An identical repeat of the last line appends nothing.
 *
 * Status: `confirmed` (the remote holds HEAD), `local-ahead` (the remote holds an ancestor of HEAD), `differs` (anything else).
 * Output: ONE JSON line. Exit 0 confirmed, local-ahead or a readable inspect; 1 refused or differs; 2 usage. It never pushes, fetches or changes a ref.
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { closeSync, existsSync, fsyncSync, openSync, readFileSync, realpathSync, statSync, writeSync } from "node:fs";
import { dirname, join } from "node:path";
import { isDirectInvocation } from "../lib/entrypoint.mjs";
import { ensurePrivateDirectory } from "../lib/private-boundary.mjs";
import { remoteCommit } from "./push-prepare.mjs";

export const PUBLICATION_READBACK_RECORD_SCHEMA = "pipeline.publication-readback.v1";
const RESULT_SCHEMA = "pipeline.publication-readback-result.v1";
const DESTINATION = /^refs\/heads\/[A-Za-z0-9._/-]{1,200}$/u;
const USAGE = "usage: publication-readback.mjs record --root <project-root> --remote <name> --destination refs/heads/<branch> | publication-readback.mjs inspect --root <project-root>";
const sha256 = (text) => createHash("sha256").update(text).digest("hex");

function git(root, args) {
  const run = spawnSync("git", ["-C", root, ...args], { encoding: "utf8", shell: false, timeout: 15_000, maxBuffer: 1024 * 1024 });
  return run.error || run.status !== 0 ? null : String(run.stdout).trim();
}

function recordsPath(root) {
  const common = git(root, ["rev-parse", "--path-format=absolute", "--git-common-dir"]);
  return common === null ? null : join(common, "agent-pipeline", "publication-readback", "records.jsonl");
}

/** Reads and checks the whole chain. `damaged` names the first line that does not follow from the one before it. */
function readRecords(path) {
  if (!existsSync(path)) return { status: "empty", records: [], lastDigest: null };
  const lines = readFileSync(path, "utf8").split("\n").filter((line) => line !== "");
  const records = [];
  let lastDigest = null;
  for (const [index, line] of lines.entries()) {
    let record;
    try { record = JSON.parse(line); } catch { return { status: "damaged", line: index + 1 }; }
    if (record?.schema !== PUBLICATION_READBACK_RECORD_SCHEMA || record.previousSha256 !== lastDigest) return { status: "damaged", line: index + 1 };
    records.push(record);
    lastDigest = sha256(line);
  }
  return { status: records.length === 0 ? "empty" : "read", records, lastDigest };
}

function appendLine(path, line) {
  ensurePrivateDirectory(dirname(path));
  const descriptor = openSync(path, "a", 0o600);
  try { writeSync(descriptor, `${line}\n`); fsyncSync(descriptor); } finally { closeSync(descriptor); }
}

const refused = (code, reason, repair) => ({ exitCode: 1, result: { schema: RESULT_SCHEMA, status: "refused", code, reason, repair } });
const lineFor = (record) => `**Publication:** ${record.destination} on remote ${record.remote} holds ${record.remoteCommit.slice(0, 12)}, read back ${record.recordedAt} (${record.status}).`;
const DAMAGED_REPAIR = "Do not edit the file. Compare it with the remote by hand and report it; the record is append-only, so there is no repair command.";

/** @param {{root: string, remote: string, destination: string}} input `deps` ({ now, lsRemoteSpawn }) is for tests. */
export function recordPublicationReadback({ root, remote, destination }, deps = {}) {
  const remotes = String(git(root, ["remote"]) ?? "").split(/\r?\n/u).map((line) => line.trim()).filter(Boolean);
  if (!remotes.includes(remote)) return refused("PRB-REMOTE-UNKNOWN", `this repository has no remote named "${remote}"`, "use a name from git remote");
  const head = git(root, ["rev-parse", "--verify", "HEAD^{commit}"]);
  const path = recordsPath(root);
  if (head === null || path === null) return refused("PRB-REPOSITORY-UNREADABLE", "HEAD or the Git directory could not be read", "repair the repository, then run this again");
  const held = remoteCommit(root, remote, destination, deps);
  if (held === null) return refused("PRB-REMOTE-UNREADABLE", `the remote gave no single answer for ${destination}; nothing was written`, "check that the push really happened and that the remote is reachable, then run this again");
  const existing = readRecords(path);
  if (existing.status === "damaged") return refused("PRB-RECORDS-DAMAGED", `line ${existing.line} of the readback record does not follow from the line before it; nothing was written`, DAMAGED_REPAIR);
  const ancestor = held !== head && spawnSync("git", ["-C", root, "merge-base", "--is-ancestor", held, head], { shell: false, timeout: 15_000 }).status === 0;
  const status = held === head ? "confirmed" : ancestor ? "local-ahead" : "differs";
  const last = existing.records.at(-1);
  const same = last !== undefined && last.remote === remote && last.destination === destination && last.head === head && last.remoteCommit === held && last.status === status;
  const record = same ? last : { schema: PUBLICATION_READBACK_RECORD_SCHEMA, recordedAt: (deps.now ?? (() => new Date()))().toISOString(), remote, destination, head, remoteCommit: held, status, previousSha256: existing.lastDigest };
  if (!same) appendLine(path, JSON.stringify(record));
  const meaning = status === "confirmed" ? "The remote holds HEAD." : status === "local-ahead" ? "The remote holds an ancestor of HEAD; the local commits after it are not published." : "The remote holds a commit that is not HEAD and not one of its ancestors: check what was pushed.";
  return { exitCode: status === "differs" ? 1 : 0, result: { schema: RESULT_SCHEMA, status, record, unchanged: same, handoverLine: lineFor(record),
    message: `${meaning} Recorded privately outside the working tree, so no commit is needed. Take handoverLine into the next handover you write anyway; never make a commit only for it, least of all after the freeze.` } };
}

export function inspectPublicationReadback({ root }) {
  const path = recordsPath(root);
  if (path === null) return refused("PRB-REPOSITORY-UNREADABLE", "the Git directory could not be read", "repair the repository, then run this again");
  const existing = readRecords(path);
  if (existing.status === "damaged") return refused("PRB-RECORDS-DAMAGED", `line ${existing.line} of the readback record does not follow from the line before it`, DAMAGED_REPAIR);
  const latest = existing.records.at(-1) ?? null;
  return { exitCode: 0, result: { schema: RESULT_SCHEMA, status: latest === null ? "no-record" : "read", count: existing.records.length, latest, ...(latest === null ? {} : { handoverLine: lineFor(latest) }) } };
}

function parse(argv) {
  const [verb, ...rest] = argv;
  if (verb !== "record" && verb !== "inspect") return null;
  const value = {};
  for (let index = 0; index < rest.length; index += 2) {
    const flag = rest[index], next = rest[index + 1];
    if (!["--root", ...(verb === "record" ? ["--remote", "--destination"] : [])].includes(flag) || next === undefined || next === "" || Object.hasOwn(value, flag)) return null;
    value[flag] = next;
  }
  if (value["--root"] === undefined || (verb === "record" && (value["--remote"] === undefined || !DESTINATION.test(value["--destination"] ?? "")))) return null;
  let root;
  try { root = realpathSync(value["--root"]); if (!statSync(root).isDirectory()) return null; } catch { return null; }
  return { verb, root, remote: value["--remote"], destination: value["--destination"] };
}

if (isDirectInvocation(import.meta.url)) {
  const argv = process.argv.slice(2);
  if (argv.length === 1 && (argv[0] === "--help" || argv[0] === "-h")) { process.stdout.write(`${USAGE}\n`); process.exit(0); }
  const input = parse(argv);
  if (input === null) { process.stdout.write(`${JSON.stringify({ schema: RESULT_SCHEMA, status: "usage", code: "PRB-USAGE", message: USAGE })}\n`); process.exit(2); }
  const { exitCode, result } = input.verb === "record" ? recordPublicationReadback(input) : inspectPublicationReadback(input);
  process.stdout.write(`${JSON.stringify(result)}\n`);
  process.exit(exitCode);
}
