#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { buildAuditRecord, parseArgs, readExactPassingEvidence, validateRequest } from "./po-guarded-push.mjs";

let passed = 0;
let failed = 0;
function check(name, condition, detail = "") {
  if (condition) {
    passed += 1;
    console.log(`PASS ${name}`);
  } else {
    failed += 1;
    console.error(`FAIL ${name}${detail ? `: ${detail}` : ""}`);
  }
}

const REASON = "8 pre-existing suites red on the branch base, verified identical on origin/main";

{
  const args = parseArgs(["--branch", "feat/x", "--remote", "upstream", "--reason", REASON]);
  check("PP01 parses branch/remote/reason", args.branch === "feat/x" && args.remote === "upstream" && args.reason === REASON, JSON.stringify(args));
}

{
  const args = parseArgs(["--branch", "feat/x"]);
  check("PP02 remote defaults to origin when omitted", args.remote === "origin", JSON.stringify(args));
}

{
  const check1 = validateRequest({ branch: "feat/x", remote: "origin", reason: REASON, currentBranch: "feat/x" });
  check("PP03 accepts a fully valid, matching-branch request", check1.ok, JSON.stringify(check1));
}

{
  const check2 = validateRequest({ branch: null, remote: "origin", reason: REASON, currentBranch: "feat/x" });
  check("PP04 rejects a missing branch", !check2.ok && check2.errors.some((e) => e.includes("--branch")), JSON.stringify(check2));
}

{
  const check3 = validateRequest({ branch: "main", remote: "origin", reason: REASON, currentBranch: "main" });
  check("PP05 refuses main outright", !check3.ok && check3.errors.some((e) => e.includes("main/master")), JSON.stringify(check3));
}

{
  const check4 = validateRequest({ branch: "master", remote: "origin", reason: REASON, currentBranch: "master" });
  check("PP06 refuses master outright", !check4.ok && check4.errors.some((e) => e.includes("main/master")), JSON.stringify(check4));
}

{
  const check5 = validateRequest({ branch: "feat/x", remote: "origin", reason: "too short", currentBranch: "feat/x" });
  check("PP07 rejects a too-short reason", !check5.ok && check5.errors.some((e) => e.includes("reason")), JSON.stringify(check5));
}

{
  const check6 = validateRequest({ branch: "feat/x", remote: "origin", reason: null, currentBranch: "feat/x" });
  check("PP08 rejects a missing reason", !check6.ok && check6.errors.some((e) => e.includes("reason")), JSON.stringify(check6));
}

{
  const check7 = validateRequest({ branch: "feat/x", remote: "origin", reason: REASON, currentBranch: "feat/other" });
  check("PP09 refuses when the checked-out branch does not match --branch", !check7.ok && check7.errors.some((e) => e.includes("does not match")), JSON.stringify(check7));
}

{
  const check8 = validateRequest({ branch: "feat/x", remote: null, reason: REASON, currentBranch: "feat/x" });
  check("PP10 rejects a missing remote", !check8.ok && check8.errors.some((e) => e.includes("--remote")), JSON.stringify(check8));
}

{
  const record = buildAuditRecord({
    branch: "feat/x",
    remote: "origin",
    reason: REASON,
    commit: "abc123",
    tree: "def456",
    verifyEvidence: { valid: true, exitCode: 0, commit: "abc123", tree: "def456" },
    securityEvidence: { valid: true, exitCode: 0, commit: "abc123", tree: "def456" },
    timestamp: "2026-07-24T00:00:00.000Z",
  });
  check(
    "PP11 audit record captures branch/remote/commit/tree/reason/exact evidence/schema/timestamp verbatim",
    record.schema === "pipeline.po-guarded-push-audit.v2" &&
      record.branch === "feat/x" &&
      record.remote === "origin" &&
      record.commit === "abc123" &&
      record.tree === "def456" &&
      record.reason === REASON &&
      record.evidence.verify.valid === true &&
      record.evidence.verify.exitCode === 0 &&
      record.evidence.security.valid === true &&
      record.evidence.security.exitCode === 0 &&
      record.timestamp === "2026-07-24T00:00:00.000Z",
    JSON.stringify(record),
  );
}

{
  const root = mkdtempSync(join(tmpdir(), "po-guarded-push-"));
  try {
    mkdirSync(join(root, "evidence"));
    writeFileSync(join(root, "evidence", "verify.json"), JSON.stringify({
      commit: "commit-a", tree: "tree-a", exitCode: 0, candidate: { status: "clean" },
    }));
    const exact = readExactPassingEvidence(root, "evidence/verify.json", "commit-a", "tree-a");
    const stale = readExactPassingEvidence(root, "evidence/verify.json", "commit-b", "tree-a");
    check("PP12 accepts only exact clean passing evidence and rejects a stale binding", exact.valid && !stale.valid, JSON.stringify({ exact, stale }));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

console.log(`\n${passed}/${passed + failed} checks passed.`);
process.exit(failed === 0 ? 0 : 1);
