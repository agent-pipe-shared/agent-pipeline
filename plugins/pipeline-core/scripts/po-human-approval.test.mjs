#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * po-human-approval.test.mjs — first test coverage for scripts/po-human-approval.mjs,
 * scoped to the new `sign-intent` subcommand only (NOVA-PO-SIGN-HELPER-1). The
 * pre-existing setup/prepare/approve/verify branches and their -critical/-all
 * variants are intentionally left uncovered here: `sign-intent` is request-shape-
 * agnostic (no --feature-id/--kind/request-file dependency at all), so this suite
 * proves only that it signs an already-computed 64-hex-char intent digest with the
 * same OpenSSL/proof-shape discipline the existing `approve` branch already uses.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { runHumanApproval } from "./po-human-approval.mjs";
import { PO_APPROVAL_PROOF_SCHEMA, verifyPoApprovalProof } from "../lib/po-approval-proof.mjs";

function openssl(args) {
  const result = spawnSync("openssl", args, { stdio: "pipe" });
  assert.equal(result.status, 0, `openssl ${args.join(" ")} failed: ${result.stderr?.toString() ?? ""}`);
}

/**
 * Throwaway, unencrypted, test-only Ed25519 keypair placed directly in the fixture's
 * external directory. This is fine for a test fixture only because a test cannot
 * supply an interactive passphrase; it does not change what the real `setup`
 * command (untouched by this task) generates or accepts.
 */
function keyFixture(directory) {
  const privateKey = join(directory, "po-private.pem");
  const publicKey = join(directory, "po-public.pem");
  openssl(["genpkey", "-algorithm", "ED25519", "-out", privateKey]);
  openssl(["pkey", "-in", privateKey, "-pubout", "-out", publicKey]);
  const publicKeyPem = readFileSync(publicKey, "utf8");
  const authority = { keyReference: "sign-intent-test-key", publicKeySha256: createHash("sha256").update(publicKeyPem).digest("hex") };
  writeFileSync(join(directory, "trust-policy.json"), `${JSON.stringify(authority, null, 2)}\n`);
  return { publicKeyPem, authority };
}

function fixtureDirs() {
  return {
    repoRoot: mkdtempSync(join(tmpdir(), "po-sign-intent-repo-")),
    directory: mkdtempSync(join(tmpdir(), "po-sign-intent-external-")),
  };
}

function cleanup({ repoRoot, directory }) {
  rmSync(repoRoot, { recursive: true, force: true });
  rmSync(directory, { recursive: true, force: true });
}

test("sign-intent fails closed before setup (no key material present)", () => {
  const dirs = fixtureDirs();
  try {
    assert.throws(
      () => runHumanApproval(["sign-intent", "--repo-root", dirs.repoRoot, "--directory", dirs.directory, "--intent-sha256", "a".repeat(64)], {}),
      /run setup before sign-intent/,
    );
  } finally {
    cleanup(dirs);
  }
});

test("sign-intent rejects an invalid --intent-sha256 (wrong length / non-hex)", () => {
  const dirs = fixtureDirs();
  try {
    assert.throws(
      () => runHumanApproval(["sign-intent", "--repo-root", dirs.repoRoot, "--directory", dirs.directory, "--intent-sha256", "z".repeat(64)], {}),
      /Usage:/,
      "non-hex characters must be rejected",
    );
    assert.throws(
      () => runHumanApproval(["sign-intent", "--repo-root", dirs.repoRoot, "--directory", dirs.directory, "--intent-sha256", "a".repeat(63)], {}),
      /Usage:/,
      "wrong length must be rejected",
    );
  } finally {
    cleanup(dirs);
  }
});

test("sign-intent signs a digest end-to-end with a real OpenSSL round trip and the proof verifies", () => {
  const dirs = fixtureDirs();
  try {
    const { publicKeyPem, authority } = keyFixture(dirs.directory);
    const intentSha256 = createHash("sha256").update("pipeline.guard-lift-intent-fixture").digest("hex");
    const result = runHumanApproval(["sign-intent", "--repo-root", dirs.repoRoot, "--directory", dirs.directory, "--intent-sha256", intentSha256], {});
    assert.deepEqual(result, { ok: true, code: "PO-HUMAN-SIGN-INTENT-READY", intentSha256 });

    const proofPath = join(dirs.directory, "proof-manual.json");
    assert.equal(existsSync(proofPath), true);
    const proof = JSON.parse(readFileSync(proofPath, "utf8"));
    assert.equal(proof.schema, PO_APPROVAL_PROOF_SCHEMA);
    assert.equal(proof.intentSha256, intentSha256);
    assert.equal(proof.keyReference, authority.keyReference);
    assert.equal(proof.publicKey, publicKeyPem);
    assert.equal(typeof proof.signatureBase64, "string");

    const verified = verifyPoApprovalProof({ intent: { sha256: intentSha256 }, trustPolicy: authority, proof });
    assert.equal(verified.verified, true);
    assert.equal(verified.code, "PO-APPROVAL-PROOF-VERIFIED");

    // Temp signing artifacts are cleaned up in a `finally`; only the durable proof remains.
    assert.equal(existsSync(join(dirs.directory, "intent-manual.txt")), false);
    assert.equal(existsSync(join(dirs.directory, "signature-manual.bin")), false);

    // A second, distinct digest re-signs cleanly into the same fixed artifact name and
    // does not disturb the shared key material this run already produced.
    const otherIntentSha256 = createHash("sha256").update("pipeline.guard-lift-intent-fixture-2").digest("hex");
    runHumanApproval(["sign-intent", "--repo-root", dirs.repoRoot, "--directory", dirs.directory, "--intent-sha256", otherIntentSha256], {});
    const secondProof = JSON.parse(readFileSync(proofPath, "utf8"));
    assert.equal(secondProof.intentSha256, otherIntentSha256);
    const secondVerified = verifyPoApprovalProof({ intent: { sha256: otherIntentSha256 }, trustPolicy: authority, proof: secondProof });
    assert.equal(secondVerified.verified, true);
  } finally {
    cleanup(dirs);
  }
});
