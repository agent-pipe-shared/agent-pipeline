#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * G20-72 (candidate 20e, AC-108): merge the verdicts of the module Critics of one split review round into the one verdict the session finalizer takes.
 *
 * Usage: node critic-split-merge.mjs --root <repo> --split <split file> --child <entryId>=<verdict file> [--child ...] [--out <merged verdict file>]
 *
 * The split is the object `critic-dispatch-preflight.mjs` printed (the file may also be the whole printed result, which holds it under `split`); each child file is the JSON a
 * module Critic returned, verbatim. Pure JSON in, JSON out: stdout `{ schema, status: "merged", verdictSha256, verdict, verdictPath }`; a refusal prints one line
 * `{ schema, status: "rejected", code, message }` on stderr and exits 1 (codes CSM-*, each message ends in its repair). `--out` creates the file exclusively. The finalizer does not
 * trust this script: it re-derives the merge from the child Source returns, so a merged verdict that differs from the returned children is refused at finalize.
 * All files are repository-relative regular files (no symlink, at most 1 MiB).
 */
import { closeSync, lstatSync, openSync, readFileSync, realpathSync, writeSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import { createHash } from "node:crypto";
import { isDirectInvocation } from "../lib/entrypoint.mjs";
import { mergeSplitVerdicts } from "../lib/critic-split.mjs";

export const CRITIC_SPLIT_MERGE_RESULT_SCHEMA = "pipeline.critic-split-merge-result.v1";
const MAX_BYTES = 1024 * 1024;
const USAGE = "node critic-split-merge.mjs --root <repo> --split <split file> --child <entryId>=<verdict file> (one per entry) [--out <merged verdict file>]";

class MergeUsageError extends Error { constructor(message) { super(message); this.code = "CSM-USAGE"; } }

function repoFile(root, path, label) {
  if (typeof path !== "string" || path === "" || isAbsolute(path)) throw new MergeUsageError(`${label} must be a repository-relative path; repair: ${USAGE}`);
  const target = resolve(root, path);
  const inside = relative(root, target);
  if (inside === "" || inside.startsWith("..") || isAbsolute(inside)) throw new MergeUsageError(`${label} must stay inside the repository; repair: ${USAGE}`);
  return target;
}
function readJsonFile(root, path, label) {
  const target = repoFile(root, path, label);
  let info;
  try { info = lstatSync(target); } catch { throw new MergeUsageError(`${label} could not be read; repair: ${USAGE}`); }
  if (!info.isFile() || info.isSymbolicLink() || info.size > MAX_BYTES) throw new MergeUsageError(`${label} must be a regular file of at most 1 MiB; repair: ${USAGE}`);
  try { return JSON.parse(readFileSync(target, "utf8")); } catch { throw new MergeUsageError(`${label} is not JSON; repair: ${USAGE}`); }
}

/** Pure-ish entry for tests and the CLI: parse argv, read the files, merge, optionally write. Returns `{ exitCode, stdout, stderr }`. */
export function runCriticSplitMergeCli(argv) {
  try {
    const flags = { child: [] };
    for (let index = 0; index < argv.length; index += 2) {
      const flag = argv[index], value = argv[index + 1];
      if (!["--root", "--split", "--child", "--out"].includes(flag) || typeof value !== "string") throw new MergeUsageError(`unknown or valueless argument ${JSON.stringify(String(flag).slice(0, 40))}; repair: ${USAGE}`);
      if (flag === "--child") flags.child.push(value);
      else if (Object.hasOwn(flags, flag.slice(2))) throw new MergeUsageError(`${flag} was given twice; repair: ${USAGE}`);
      else flags[flag.slice(2)] = value;
    }
    if (flags.root === undefined || flags.split === undefined) throw new MergeUsageError(`--root and --split are required; repair: ${USAGE}`);
    const root = realpathSync(resolve(flags.root));
    const given = readJsonFile(root, flags.split, "--split");
    const split = given !== null && typeof given === "object" && !Array.isArray(given) && typeof given.split === "object" && given.split !== null ? given.split : given;
    const children = flags.child.map((spec) => {
      const at = spec.indexOf("=");
      if (at <= 0) throw new MergeUsageError(`--child takes <entryId>=<verdict file>; repair: ${USAGE}`);
      return { entryId: spec.slice(0, at), verdict: readJsonFile(root, spec.slice(at + 1), `--child ${spec.slice(0, at)}`) };
    });
    const merged = mergeSplitVerdicts(split, children);
    if (!merged.ok) return { exitCode: 1, stdout: "", stderr: `${JSON.stringify({ schema: CRITIC_SPLIT_MERGE_RESULT_SCHEMA, status: "rejected", code: merged.code, message: merged.message })}\n` };
    if (flags.out !== undefined) {
      const out = repoFile(root, flags.out, "--out");
      let fd;
      try { fd = openSync(out, "wx", 0o644); } catch { throw new MergeUsageError(`--out must name a new file in an existing directory of the repository; repair: ${USAGE}`); }
      try { writeSync(fd, `${JSON.stringify(merged.verdict)}\n`); } finally { closeSync(fd); }
    }
    return { exitCode: 0, stderr: "", stdout: `${JSON.stringify({ schema: CRITIC_SPLIT_MERGE_RESULT_SCHEMA, status: "merged", verdict: merged.verdict,
      verdictSha256: createHash("sha256").update(`${JSON.stringify(merged.verdict, null, 2)}\n`).digest("hex"), verdictPath: flags.out ?? null })}\n` };
  } catch (error) {
    const code = error instanceof MergeUsageError ? error.code : "CSM-INTERNAL";
    return { exitCode: 1, stdout: "", stderr: `${JSON.stringify({ schema: CRITIC_SPLIT_MERGE_RESULT_SCHEMA, status: "rejected", code, message: error instanceof MergeUsageError ? error.message : `the merge could not run; repair: ${USAGE}` })}\n` };
  }
}

if (isDirectInvocation(import.meta.url)) {
  const result = runCriticSplitMergeCli(process.argv.slice(2));
  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);
  process.exitCode = result.exitCode;
}
