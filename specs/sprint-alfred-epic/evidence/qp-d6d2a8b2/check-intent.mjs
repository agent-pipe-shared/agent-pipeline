// Self-check of the built intent: validate shape/digest and run `git apply --check --whitespace=error` on HEAD.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { qualityPackageIntentSha256 } from "../../plugins/pipeline-core/lib/signed-quality-package.mjs";

const REPO = process.cwd();
const record = JSON.parse(readFileSync(join(REPO, "scratch", "QP1", "qp1-intent.json"), "utf8"));
const head = spawnSync("git", ["rev-parse", "HEAD"], { cwd: REPO, encoding: "utf8" }).stdout.trim();
const plusPaths = record.unifiedDiff.split("\n").filter((l) => l.startsWith("+++ ")).map((l) => l.slice(4));
const r = spawnSync("git", ["apply", "--check", "--whitespace=error", "-"], { cwd: REPO, encoding: "utf8", input: record.unifiedDiff });
console.log(JSON.stringify({
  headMatchesBase: head === record.baseCommit,
  digestRecomputes: qualityPackageIntentSha256(record) === record.intentSha256,
  plusPaths,
  expectedDigestKeys: Object.keys(record.expectedDigests).sort(),
  gitApplyCheckExit: r.status,
  gitApplyCheckStderr: r.stderr.trim().slice(0, 2000),
}, null, 2));
