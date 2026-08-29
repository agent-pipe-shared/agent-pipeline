#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * NVA-CF-KEYBOOTSTRAP: LIVE reproduction (not a code-reading exercise) of the
 * trust-anchor bootstrap circularity, pinned as a permanent regression/
 * characterization test per the backlog item's own acceptance criteria
 * (backlog: pipeline.trust-anchor-bootstrap-confirmed-still-circular-live.md).
 *
 * `2026-08-28-onboarding-must-bootstrap-the-trust-anchor-once.md` was closed
 * 2026-08-29 as "found already satisfied" via code-reading only. TWO
 * independent live greenfield runs (Codex/WSL, Claude/Windows), against a
 * candidate that already contained that closure's cited fix commit, both hit
 * the identical circularity anyway. This test drives the ACTUAL mechanism --
 * a real git repository, the REAL installed pre-commit backstop
 * (pre-commit-hook-install.mjs's applyInstall), and a real signing key
 * created through po-human-approval.mjs's own `setup` command -- rather than
 * reading detectExistingLocalTrustAnchor()/freshCriticalHumanProofPolicyBytes()
 * and reasoning about what they should do.
 *
 * SCENARIO: a genuinely fresh signature-mode project (no pre-existing
 * machine-plane key pointer) onboards -- project/critical-human-proof.json is
 * seeded WITHOUT a trust anchor (freshCriticalHumanProofPolicyBytes(null),
 * exactly what onboarding writes when no local key exists yet) -- and that
 * scaffold is committed for the first time. ONLY AFTER that first commit does
 * a signing key get created (the realistic order for an agent-driven
 * greenfield session: an agent can scaffold and commit a project, but only a
 * PO -- a human, outside the session -- ever runs `po-human-approval.mjs
 * setup`, per this file's own module comment above
 * freshCriticalHumanProofPolicyBytes). Adding the resulting trust anchor to
 * the now-ALREADY-TRACKED project/critical-human-proof.json is the first
 * human-override use this test drives.
 *
 * FINDING (confirmed live by this test, NVA-CF-KEYBOOTSTRAP): the second
 * commit -- adding trustAnchors to an already-tracked GS-2 path -- is BLOCKED
 * by the real git-level pre-commit backstop
 * (plugins/pipeline-core/scripts/pre-commit-hook-install.mjs). That backstop's
 * "first-appearance exemption" (`pathAlreadyTrackedInHistory`) exempts a
 * protected path's VERY FIRST appearance in git history only -- exactly what
 * lets the initial (anchor-less) scaffold commit through -- but a LATER
 * rewrite of already-tracked content is deliberately NOT exempt (its own
 * comment: "exactly the item's own reported repro shape... must stay
 * blocked"). The sanctioned override for that later write
 * (guard-gate-strength.mjs GS-2's HGO ceremony,
 * authorizeHumanGuardOverrideBySignature() in human-guard-override.mjs) itself
 * requires project/critical-human-proof.json to ALREADY carry a non-empty
 * trustAnchors set, or it fails closed with HGO-TRUST-ANCHOR-MISSING
 * (human-guard-override.mjs:3182-3197, NVA-HGOFIX-1's own comment: "an
 * empty/absent anchor set here must never be treated as 'any key'").
 * The two mechanisms compose into a genuine circularity for this ordering,
 * with `git commit --no-verify` (a human-operator-only escape the pre-commit
 * hook's own block message explicitly names) as the only route today.
 *
 * SCOPE NOTE: closing this circularity requires changing either
 * pre-commit-hook-install.mjs's first-appearance exemption (to also cover a
 * trust-anchor-only v1-to-v3 upgrade of an already-tracked
 * critical-human-proof.json when no anchor existed before) or
 * human-guard-override.mjs's HGO-TRUST-ANCHOR-MISSING posture (a bootstrap
 * TOFU proof route) -- both are OUTSIDE NVA-CF-KEYBOOTSTRAP's file scope
 * (plugins/pipeline-core/lib/project-onboarding-v3.mjs and
 * plugins/pipeline-core/scripts/po-human-approval.mjs only), and
 * human-guard-override.mjs's fail-closed posture for an empty/absent trust
 * anchor set is explicitly NOT to be weakened. This test therefore pins the
 * CURRENT (still-blocked) behavior rather than asserting the desired GREEN
 * state -- do not "fix" this test by loosening its assertions; when the
 * actual out-of-scope fix lands, this test's second-commit assertion must
 * flip from BLOCKED to SUCCEEDS in the SAME change that lands the fix.
 *
 * The ordering where the key is created BEFORE the first commit is a
 * DIFFERENT, already-closed case: freshCriticalHumanProofPolicyBytes(fs)
 * seeds the anchor directly into that first (and therefore exempt) commit --
 * see NVA-R24-TRUSTANCHOR in project-onboarding-v3.test.mjs. This test is
 * about the ordering both live runners actually hit.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { generateKeyPairSync } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { freshCriticalHumanProofPolicyBytes } from "./project-onboarding-v3.mjs";
import { applyInstall as applyPreCommitHookInstall } from "../scripts/pre-commit-hook-install.mjs";
import { runHumanApproval } from "../scripts/po-human-approval.mjs";

const CRITICAL_HUMAN_PROOF_POLICY_PATH = "project/critical-human-proof.json";

function git(args, cwd) {
  return spawnSync("git", args, { cwd, encoding: "utf8" });
}

// Mirrors po-human-approval.test.mjs's own fakeSetupSpawn exactly (same
// interception shapes): `setup`'s real fresh-key branch shells out to an
// interactive `openssl genpkey -aes-256-cbc` this non-TTY test cannot answer,
// so this fakes ONLY those two openssl subcommands with real, equivalent key
// material -- everything else `setup` does (the writes, the authority record,
// the directory bookkeeping) runs completely unfaked.
function fakeOpensslSpawn(executable, args) {
  if (executable === "openssl" && args[0] === "genpkey") {
    const outIndex = args.indexOf("-out");
    const { privateKey } = generateKeyPairSync("ed25519", {
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
      publicKeyEncoding: { type: "spki", format: "pem" },
    });
    writeFileSync(args[outIndex + 1], privateKey);
    return { status: 0 };
  }
  const result = spawnSync(executable, args, { stdio: "pipe" });
  return { status: result.status };
}

test("NVA-CF-KEYBOOTSTRAP: a fresh signature-mode project's first commit succeeds (first-appearance exemption), but adding the trust anchor to that ALREADY-TRACKED file after a later key creation is still blocked without --no-verify", () => {
  const root = mkdtempSync(join(tmpdir(), "nva-cf-keybootstrap-repro-"));
  const keyDir = mkdtempSync(join(tmpdir(), "nva-cf-keybootstrap-repro-extkey-"));
  try {
    let r = git(["init", "--initial-branch=main"], root);
    assert.equal(r.status, 0, `git init failed: ${r.stderr}`);
    git(["config", "user.name", "Test PO"], root);
    git(["config", "user.email", "po@example.test"], root);

    // The genuinely fresh case: no `fs` supplied, mirroring onboarding running
    // with no existing local key at all.
    mkdirSync(join(root, "project"), { recursive: true });
    const freshBytes = freshCriticalHumanProofPolicyBytes(null);
    writeFileSync(join(root, CRITICAL_HUMAN_PROOF_POLICY_PATH), freshBytes);
    assert.equal(JSON.parse(freshBytes).schema, "pipeline.critical-human-proof-policy.v1");

    // The REAL pre-commit backstop, installed exactly as onboarding's own
    // applyProjectOnboardingV3 installs it, BEFORE the first commit.
    const installResult = applyPreCommitHookInstall({ rootDir: root });
    assert.equal(installResult.status, "installed");

    r = git(["add", "-A"], root);
    assert.equal(r.status, 0, `git add (first commit) failed: ${r.stderr}`);
    r = git(["commit", "-m", "initial onboarding scaffold"], root);
    assert.equal(r.status, 0, `first commit of the fresh (no-anchor) scaffold was unexpectedly blocked: ${r.stderr}`);

    // ONLY NOW -- after the scaffold is already tracked -- does a key get
    // created, via the real po-human-approval.mjs setup command.
    const setupResult = runHumanApproval([
      "setup", "--repo-root", root, "--directory", keyDir, "--human-name", "Test PO",
    ], { spawn: fakeOpensslSpawn });
    assert.equal(setupResult.ok, true);
    const trustPolicy = JSON.parse(readFileSync(join(keyDir, "trust-policy.json"), "utf8"));

    const anchoredBytes = `${JSON.stringify({
      schema: "pipeline.critical-human-proof-policy.v3",
      requiredKinds: ["push"],
      waivedKinds: [],
      trustAnchors: [{ keyReference: trustPolicy.keyReference, publicKeySha256: trustPolicy.publicKeySha256 }],
    }, null, 2)}\n`;
    writeFileSync(join(root, CRITICAL_HUMAN_PROOF_POLICY_PATH), anchoredBytes);

    r = git(["add", CRITICAL_HUMAN_PROOF_POLICY_PATH], root);
    assert.equal(r.status, 0, `git add (anchor commit) failed: ${r.stderr}`);
    r = git(["commit", "-m", "add trust anchor"], root);

    // THE FINDING: still blocked. When this flips to 0 elsewhere (a fix in
    // pre-commit-hook-install.mjs or human-guard-override.mjs, both outside
    // NVA-CF-KEYBOOTSTRAP's scope), update this assertion in that same change.
    assert.notEqual(r.status, 0, "REGRESSION-OR-FIX: the trust-anchor addition committed cleanly -- if a real fix landed elsewhere, update this test's assertions (do not just relax them) to assert the new GREEN behavior.");
    assert.match(r.stderr, /BLOCKED \(agent-pipeline pre-commit hook\)/u);
    assert.match(r.stderr, /GS-2 project\/critical-human-proof\.json/u);
    assert.match(r.stderr, /HUMAN OPERATOR ONLY/u);

    // Confirms the only escape today is the human-operator-only --no-verify
    // bypass the hook's own message names -- evidence, never a route this
    // test recommends taking.
    const bypass = git(["commit", "--no-verify", "-m", "add trust anchor (bypass, evidence only)"], root);
    assert.equal(bypass.status, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(keyDir, { recursive: true, force: true });
  }
});
