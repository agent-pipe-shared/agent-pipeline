// Builds the signed-quality-package intent for S2 package 1 + verify-registration package 1 on the current HEAD.
// Run from the repository root: node scratch/QP1/build.mjs
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createHash } from "node:crypto";
import { SIGNED_QUALITY_PACKAGE_SCHEMA, qualityPackageIntentSha256 } from "../../plugins/pipeline-core/lib/signed-quality-package.mjs";

const REPO = process.cwd();
const WORK = join(REPO, "scratch", "QP1");
const S2 = "specs/sprint-alfred-epic/design/s2-package-1";
const RP = "specs/sprint-alfred-epic/design/verify-registration-package-1";
const FACADE_DST = "plugins/pipeline-core/hooks/guard-lifecycle-ready.mjs";
const TARGETS = [
  "docs/product-capability-inventory.json",
  "harness/config/verify-case-completion.v1.json",
  "harness/scripts/verify.mjs",
  FACADE_DST,
  "plugins/pipeline-core/protected-baseline.json",
];
const PATCHES = [
  `${S2}/protected-baseline.patch`,
  `${S2}/verify-registration.patch`,
  `${S2}/inventory-surfaces.patch`,
  `${RP}/test-registrations.patch`,
  `${RP}/case-completion-dispositions.patch`,
  `${RP}/inventory-surfaces.patch`,
];

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { encoding: null, shell: false, windowsHide: true, maxBuffer: 256 * 1024 * 1024, input: "", ...opts });
  if (r.error) throw r.error;
  return r;
}
const sha = (buf) => createHash("sha256").update(buf).digest("hex");

const status = run("git", ["status", "--porcelain"], { cwd: REPO }).stdout.toString("utf8");
if (status !== "") { console.error("QP1: working tree not clean"); process.exit(1); }
const head = run("git", ["rev-parse", "HEAD"], { cwd: REPO }).stdout.toString("utf8").trim();

for (const side of ["a", "b"]) rmSync(join(WORK, side), { recursive: true, force: true });
for (const path of TARGETS) {
  const blob = run("git", ["show", `HEAD:${path}`], { cwd: REPO });
  if (blob.status !== 0) { console.error(`QP1: cannot read HEAD:${path}`); process.exit(1); }
  for (const side of ["a", "b"]) {
    const dst = join(WORK, side, ...path.split("/"));
    mkdirSync(dirname(dst), { recursive: true });
    writeFileSync(dst, blob.stdout);
  }
}
copyFileSync(join(REPO, ...`${S2}/guard-lifecycle-ready.facade.mjs`.split("/")), join(WORK, "b", ...FACADE_DST.split("/")));
const patchLog = [];
for (const rel of PATCHES) {
  const r = run("patch", ["-p1", "--no-backup-if-mismatch", "-d", join(WORK, "b"), "-i", join(REPO, ...rel.split("/"))]);
  patchLog.push({ patch: rel, exitCode: r.status, stdout: r.stdout.toString("utf8").trim() });
  if (r.status !== 0) { console.error(JSON.stringify(patchLog, null, 2)); process.exit(1); }
}

let unifiedDiff = "";
const expectedDigests = {};
for (const path of TARGETS) {
  const r = run("git", ["diff", "--no-index", "--no-color", "--no-ext-diff", "--src-prefix=", "--dst-prefix=", `a/${path}`, `b/${path}`], { cwd: WORK });
  if (r.status !== 1) { console.error(`QP1: git diff for ${path} exited ${r.status}`); process.exit(1); }
  unifiedDiff += r.stdout.toString("utf8");
  expectedDigests[path] = sha(readFileSync(join(WORK, "b", ...path.split("/"))));
}
const record = { schema: SIGNED_QUALITY_PACKAGE_SCHEMA, baseCommit: head, unifiedDiff, expectedDigests };
record.intentSha256 = qualityPackageIntentSha256(record);
writeFileSync(join(WORK, "qp1-intent.json"), `${JSON.stringify(record, null, 2)}\n`);
writeFileSync(join(WORK, "qp1-request.json"), `${JSON.stringify({ intentSha256: record.intentSha256 }, null, 2)}\n`);
console.log(JSON.stringify({ baseCommit: head, intentSha256: record.intentSha256, targets: TARGETS.length, diffBytes: Buffer.byteLength(unifiedDiff), patchLog: patchLog.map((p) => ({ patch: p.patch, exitCode: p.exitCode })) }, null, 2));
