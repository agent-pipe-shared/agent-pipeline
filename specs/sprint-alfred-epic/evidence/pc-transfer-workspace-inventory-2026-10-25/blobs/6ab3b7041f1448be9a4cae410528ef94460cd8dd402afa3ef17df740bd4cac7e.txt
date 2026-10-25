// SPDX-License-Identifier: SUL-1.0
// Pin for pipeline.sign-intent-disclosure-scan-blocks-for-minutes (AC-257).
// Proposal points: (1) signed quality package disclosed directly, before the GMW/HGO resolvers;
// (2) HGO lookup digest-keyed, never a store scan; (3) readiness before any resolver work;
// (4) a sanctioned sweep for consumed/expired HGO requests.
// Host limitation: the full CLI ceremony and the HGO store sweep need a real git common dir with
// secure private-directory modes; they are NOT exercised on this native Windows host
// (owner Coordinator, due 2026-10-19, Linux/WSL run, PO decision K7).
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { SIGNED_QUALITY_PACKAGE_SCHEMA, describeSignedQualityPackageIntent, qualityPackageIntentSha256 } from "../signed-quality-package.mjs";
import { describeHumanGuardOverrideSelection, sweepHumanGuardOverrideRequests } from "../human-guard-override.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const approvalSource = readFileSync(join(HERE, "..", "..", "scripts", "po-human-approval.mjs"), "utf8");
const hgoSource = readFileSync(join(HERE, "..", "human-guard-override.mjs"), "utf8");
const sha = (text) => createHash("sha256").update(text).digest("hex");

function qualityPackage() {
  const body = { schema: SIGNED_QUALITY_PACKAGE_SCHEMA, baseCommit: "a".repeat(40),
    unifiedDiff: "diff --git a/x/b.txt b/x/b.txt\n--- a/x/b.txt\n+++ b/x/b.txt\n@@ -1 +1 @@\n-a\n+b\n",
    expectedDigests: { "x/b.txt": sha("b\n") } };
  return { ...body, intentSha256: qualityPackageIntentSha256(body) };
}

test("point 1: a signed quality package is disclosed directly (base commit, paths, digests) with no store", () => {
  const pkg = qualityPackage();
  const described = describeSignedQualityPackageIntent(pkg, pkg.intentSha256);
  assert.equal(described.resolved, true);
  const text = described.lines.join("\n");
  assert.ok(text.includes(pkg.baseCommit));
  assert.ok(text.includes(`x/b.txt: ${pkg.expectedDigests["x/b.txt"]}`));
  assert.equal(describeSignedQualityPackageIntent(pkg, sha("other")), null, "a digest that does not bind the package never discloses");
});

test("point 1: sign-intent handles the quality-package schema before, and instead of, the GMW/HGO resolvers", () => {
  const qp = approvalSource.indexOf("case SIGNED_QUALITY_PACKAGE_SCHEMA:");
  const gmw = approvalSource.indexOf("record = describeGmw(");
  assert.ok(qp > 0 && gmw > qp, "quality-package case precedes the generic resolver chain");
  const caseBody = approvalSource.slice(qp, approvalSource.indexOf("break;", qp));
  assert.ok(!/describeGmw|describeHgo/u.test(caseBody));
  const defaultBranch = approvalSource.slice(approvalSource.indexOf("default:", qp), gmw);
  assert.match(defaultBranch, /scratchRequestRecord !== null/u, "a recognised --request never reaches the resolver scan");
});

test("point 3: readiness runs before any resolver work in sign-intent", () => {
  const ready = approvalSource.indexOf("assertSigningReadyBeforePrompt({ repository");
  const gmw = approvalSource.indexOf("record = describeGmw(");
  assert.ok(ready > 0 && ready < gmw);
});

test("point 2: the HGO lookup is digest-keyed and unknown digests resolve without scanning", () => {
  const start = hgoSource.indexOf("function describeHumanGuardOverrideSelectionCore");
  const body = hgoSource.slice(start, hgoSource.indexOf("export function describeHumanGuardOverrideSelection(", start));
  assert.match(body, /readIndexedDisclosurePlan/u);
  assert.ok(!/readdirSync|hgoAuthorityInventory|for \(const .* of .*requests/u.test(body), "no store scan inside the describe path");
  const unresolved = describeHumanGuardOverrideSelection({ rootDir: HERE, intentSha256: "not-a-digest" });
  assert.equal(unresolved.resolved, false);
  assert.equal(unresolved.code, "HGO-RECORD-DIGEST-INVALID");
});

test("point 4: a sanctioned sweep for consumed/expired HGO requests exists", () => {
  assert.equal(typeof sweepHumanGuardOverrideRequests, "function");
  assert.match(hgoSource, /if \(expiry <= nowMs \|\| consumed\) eligible\.push\(row\)/u);
});

test("host limitation: live store sweep and full CLI ceremony", { skip: "host-limitation: needs POSIX private-directory modes; owner Coordinator, due 2026-10-19 (Linux/WSL run, PO decision K7)" }, () => {});
