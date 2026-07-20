#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  DocumentIdentifierError,
  encodeDocumentId,
  issueDocumentId,
  readDocumentIdReservation,
} from "./document-identifiers.mjs";

function git(root, args) { execFileSync("git", args, { cwd: root, stdio: "pipe" }); }
function repository() {
  const root = mkdtempSync(join(tmpdir(), "document-identifier-"));
  git(root, ["init"]);
  git(root, ["config", "user.email", "test@example.invalid"]);
  git(root, ["config", "user.name", "Document Identifier Test"]);
  writeFileSync(join(root, "README.md"), "fixture\n");
  git(root, ["add", "README.md"]);
  git(root, ["commit", "-m", "fixture"]);
  return root;
}

test("opaque IDs use canonical 16-byte lowercase Base32 vectors", () => {
  assert.equal(encodeDocumentId("dh", Buffer.alloc(16)), `dh_${"a".repeat(26)}`);
  assert.equal(encodeDocumentId("da", Buffer.alloc(16, 0xff)), `da_${"7".repeat(25)}4`);
  assert.throws(() => encodeDocumentId("dh", Buffer.alloc(15)), (error) => error instanceof DocumentIdentifierError && error.code === "DI-ENTROPY");
});

test("issued IDs are immutable repository-private purpose reservations", () => {
  const root = repository();
  try {
    const issued = issueDocumentId(root, {
      prefix: "dh",
      purpose: "binding",
      now: () => new Date("2026-07-19T12:00:00.000Z"),
      randomBytes: () => Buffer.alloc(16),
    });
    assert.equal(issued.id, `dh_${"a".repeat(26)}`);
    assert.equal(issued.reservation.purpose, "binding");
    assert.equal(readDocumentIdReservation(root, issued.id, { purpose: "binding" }).reservation.issuedAt, "2026-07-19T12:00:00.000Z");
    assert.throws(() => readDocumentIdReservation(root, issued.id, { purpose: "adapter" }), (error) => error instanceof DocumentIdentifierError && error.code === "DI-PURPOSE");
    assert.throws(() => issueDocumentId(root, {
      prefix: "dh", purpose: "binding", randomBytes: () => Buffer.alloc(16),
    }), (error) => error instanceof DocumentIdentifierError && error.code === "DI-COLLISION");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
