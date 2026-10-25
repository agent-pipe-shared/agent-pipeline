#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * Package a scratch work tree into one held patch against a candidate commit, and check that it applies.
 *
 * PURPOSE. A held-kernel-patch dispatch edits copies of NEVER_LIFTABLE files in an owned scratch work tree and
 * hands back a patch for the PO's bundled ceremony. The packaging tail is mechanical and was rebuilt by hand in
 * every dispatch: preimage from the candidate commit, postimage from the work tree, one diff with repository
 * paths, `git apply --check` against the checkout and the preimage SHA-256 values for the notes. This script
 * does exactly that and nothing else. It reads the candidate's blobs with `git show`, never the working tree,
 * so a dirty checkout cannot leak into the preimage.
 *
 * USAGE. node scripts/pack-held-patch.mjs <candidate-commit> <work-dir> <out-patch> <repo-path> [<repo-path> ...]
 *   <work-dir> holds each <repo-path> at the same relative location (for example
 *   scratch/agent-out/<slug>/work). <out-patch> is overwritten. Prints one JSON object: the patch path, its
 *   SHA-256 and byte count, the preimage SHA-256 per path and the `git apply --check` exit status and output.
 *   Exit 0 when the patch was written (inspect applyCheck.status), 1 on a git failure, 2 on bad usage.
 *
 * WRITES. <out-patch> and a temporary stage directory scratch/pack-held-patch-stage (removed at the end).
 * Stages, commits and applies nothing.
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const [candidate, workDir, outPatch, ...paths] = process.argv.slice(2);
if (!candidate || !workDir || !outPatch || paths.length === 0) {
  console.error("usage: node scripts/pack-held-patch.mjs <candidate-commit> <work-dir> <out-patch> <repo-path> [<repo-path> ...]");
  process.exit(2);
}
const stage = resolve("scratch/pack-held-patch-stage");
const sha = (buffer) => createHash("sha256").update(buffer).digest("hex");
rmSync(stage, { recursive: true, force: true });
try {
  const preimages = {};
  for (const path of paths) {
    const show = spawnSync("git", ["show", `${candidate}:${path}`], { maxBuffer: 1 << 28 });
    if (show.status !== 0) { console.error(`git show ${candidate}:${path} failed: ${show.stderr}`); process.exit(1); }
    preimages[path] = sha(show.stdout);
    mkdirSync(dirname(join(stage, "a", path)), { recursive: true });
    mkdirSync(dirname(join(stage, "b", path)), { recursive: true });
    writeFileSync(join(stage, "a", path), show.stdout);
    copyFileSync(join(workDir, path), join(stage, "b", path));
  }
  let patch = "";
  for (const path of paths) {
    const diff = spawnSync("git", ["diff", "--no-index", "--no-prefix", `a/${path}`, `b/${path}`], { cwd: stage, maxBuffer: 1 << 28, encoding: "utf8" });
    if (diff.status > 1) { console.error(`git diff ${path} failed: ${diff.stderr}`); process.exit(1); }
    patch += diff.stdout;
  }
  writeFileSync(outPatch, patch);
  const check = spawnSync("git", ["apply", "--check", "--verbose", outPatch], { encoding: "utf8" });
  console.log(JSON.stringify({ outPatch, patchSha256: sha(readFileSync(outPatch)), bytes: Buffer.byteLength(patch), preimages, applyCheck: { status: check.status, output: check.stderr.trim() } }, null, 2));
} finally {
  rmSync(stage, { recursive: true, force: true });
}
