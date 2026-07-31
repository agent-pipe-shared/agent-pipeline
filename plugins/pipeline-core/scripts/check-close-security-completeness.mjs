#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * check-close-security-completeness.mjs -- Close call site for AC8's shared completeness
 * evaluator (`cyb-2-feature-spec.md` AC8: Push/PR/Close/Release must all consult the SAME
 * completeness evaluator, no parallel duplicate evaluator per call site; CYB-2I-0's shared
 * `checkSecurityCompleteness` extraction is the foundation this reuses unchanged).
 *
 * Registered as a `close.pre` extension (this repo's own `.claude/pipeline.json`'s
 * `ritualExtensions.close.pre`; `close-block/SKILL.md`'s own extension-point contract): runs
 * at close.pre step 1, seeing HEAD and the working tree exactly as the block/session left
 * them, before any of the close ritual's own writes.
 *
 * Mirrors `guard-push.mjs`'s own gate-activation pattern EXACTLY (~line 1090-1106): manifest
 * absent, OR the security gate absent, OR its `mode === "off"` -> exit 0 immediately (same
 * "opt-in feature, nothing configured" semantics as the push gate -- not a new independent
 * policy for Close).
 *
 * Unlike the push gate, there is no "pushed source" here: Close is about the commit HEAD is
 * about to be treated as this repo's current, closed state -- so `commit`/`tree` are resolved
 * via `git rev-parse HEAD` / `git rev-parse HEAD^{tree}` against the project root (`close.pre`
 * entries always run from there, per `close-block/SKILL.md`'s own contract), never a pushed
 * ref.
 *
 * SCOPE BOUNDARY (deliberate, not a bug): if HEAD's own `evidence/security-latest.v2.json`/
 * `.verdict.json` don't exist in the working tree at close time (e.g. no `security-scan.mjs`
 * run happened yet this session), this fails closed with a missing-evidence reason and blocks
 * Close -- Close must not succeed silently without completeness evidence when the security
 * gate is active.
 *
 * Exit code contract (a `close.pre` shell entry, no CLI args):
 *   0 = pass or skip (gate inactive/unconfigured)
 *   2 = fail (mirrors `check-spec-retention.mjs`'s own `exit(2)` convention)
 *
 * VERIFY: node plugins/pipeline-core/scripts/check-close-security-completeness.test.mjs
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { loadManifest, gateConfig } from "../lib/manifest.mjs";
import { checkSecurityCompleteness } from "../lib/security-completeness-gate.mjs";

/**
 * Runs the Close-site completeness check against `root`. Returns:
 *   - `{ skipped: true }` when the manifest is absent, OR the security gate is absent, OR its
 *     `mode === "off"` (opt-in feature, nothing configured -- same semantics as the push gate).
 *   - `{ skipped: false, commit, failures }` once the gate is active (`failures` is a
 *     `string[]`; empty = pass). A HEAD commit/tree resolution failure is itself reported as a
 *     failure reason rather than thrown.
 */
export function checkCloseSecurityCompleteness(root) {
  const manifestResult = loadManifest(root);
  const securityGate = gateConfig(manifestResult.manifest, "security");
  if (manifestResult.status === "absent" || !securityGate || securityGate.mode === "off") {
    return { skipped: true };
  }

  const headCommit = spawnSync("git", ["-C", root, "rev-parse", "HEAD"], { encoding: "utf8", timeout: 5000 });
  const commit = headCommit.status === 0 ? headCommit.stdout.trim() : null;
  if (!commit) {
    return { skipped: false, commit: null, failures: ["HEAD commit could not be resolved (git rev-parse HEAD failed)"] };
  }

  const headTree = spawnSync("git", ["-C", root, "rev-parse", "HEAD^{tree}"], { encoding: "utf8", timeout: 5000 });
  const tree = headTree.status === 0 ? headTree.stdout.trim() : null;

  const failures = checkSecurityCompleteness({ projectDir: root, commit, tree, subjectLabel: "the sealed HEAD commit" });
  return { skipped: false, commit, failures };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const result = checkCloseSecurityCompleteness(root);
  if (!result.skipped) {
    if (result.failures.length > 0) {
      for (const failure of result.failures) console.error(`CLOSE SECURITY COMPLETENESS FAILED: ${failure}`);
      process.exit(2);
    }
    console.log(`CLOSE SECURITY COMPLETENESS GREEN: HEAD ${result.commit} is bound and complete.`);
  }
  process.exit(0);
}
