#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

/**
 * Pin for Toolbox D50 / AC-127 slice W7-WIN-PRIVATE-DACL-ROOT-ONLY: the native private-authority check split into
 * distinct DACL detail codes, and a root-only rule below a proven-hardened `<gitCommonDir>/agent-pipeline` root.
 *
 * Native PowerShell is not runnable on Linux/WSL, so these points pin the SOURCE SHAPE of the helper and the backend
 * mapping by reading their text. No real Windows ACL is measured here; native qualification stays a PO step.
 *
 *   P1. The bare WIN-AUTH-DACL refusal is gone from the helper; four distinct detail codes replace it.
 *   P2. The detail codes keep WIN-AUTH-DACL as their family: the backend reports reason WIN-AUTH-DACL plus a detail.
 *   P3. Root-only decision table: below a proven-hardened root the protected-flag and inherited-ACE checks are relaxed;
 *       the root itself is verified with the strict rule; owner and non-inherited foreign ACEs still fail.
 *   P4. HELPER_SHA256 equals the digest of the helper bytes.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const LIB = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ps1Bytes = readFileSync(resolve(LIB, "windows-owned-authority-native.ps1"));
const ps1 = ps1Bytes.toString("utf8");
const backend = readFileSync(resolve(LIB, "windows-owned-authority-backend.mjs"), "utf8");
const verifyLine = ps1.split("\n").find((line) => line.includes("new RawSecurityDescriptor"));

test("P1 the bare WIN-AUTH-DACL refusal is replaced by four distinct detail codes", () => {
  assert.ok(verifyLine, "the Verify security-descriptor line exists");
  assert.equal(/Refuse\("WIN-AUTH-DACL"\)/u.test(ps1), false, "no bare WIN-AUTH-DACL refusal remains");
  for (const code of ["EMPTY", "UNPROTECTED", "ACE", "FOREIGN"])
    assert.ok(ps1.includes(`Refuse("WIN-AUTH-DACL-${code}")`), `detail code ${code} is thrown`);
});

test("P1 each detail code sits on its own condition (empty, unprotected, non-common or callback ACE, foreign SID)", () => {
  assert.match(verifyLine, /DiscretionaryAcl\.Count==0\)throw Refuse\("WIN-AUTH-DACL-EMPTY"\)/u);
  assert.match(verifyLine, /DiscretionaryAclProtected\)==0\)throw Refuse\("WIN-AUTH-DACL-UNPROTECTED"\)/u);
  assert.match(verifyLine, /known==null\|\|known\.IsCallback\)throw Refuse\("WIN-AUTH-DACL-ACE"\)/u);
  assert.match(verifyLine, /throw Refuse\("WIN-AUTH-DACL-FOREIGN"\)/u);
});

test("P2 the backend keeps WIN-AUTH-DACL as the reason family and carries the detail separately", () => {
  assert.match(backend, /error\.reason=detail\?'WIN-AUTH-DACL':reason/u);
  assert.match(backend, /error\.detail=detail/u);
  assert.match(backend, /\^WIN-AUTH-DACL-\(\?:EMPTY\|UNPROTECTED\|ACE\|FOREIGN\)\$/u);
});

test("P3 root-only: a hardened-root helper exists, is verified strictly, and only relaxes the inherited-ACE checks below it", () => {
  assert.match(ps1, /static string HardenedRoot\(string p\)/u);
  assert.ok(ps1.includes('".git"') && ps1.includes('"agent-pipeline"'), "the root is the <gitCommonDir>\\agent-pipeline directory");
  assert.match(verifyLine, /HardenedRoot\(/u);
  assert.match(verifyLine, /using\(var rootHandle=Open\(hardenedRoot,true,false,true\)\)\{\}/u, "the root is opened through the strict private rule");
  assert.match(verifyLine, /if\(!below&&\(security\.ControlFlags&ControlFlags\.DiscretionaryAclProtected\)==0\)/u, "the protected flag is only required outside the root");
  assert.match(verifyLine, /known\.SecurityIdentifier\.Value!=CurrentSid&&!\(below&&known\.IsInherited\)/u, "only inherited foreign ACEs are tolerated, and only below the root");
  assert.match(verifyLine, /security\.Owner\.Value!=CurrentSid\)throw Refuse\("WIN-AUTH-OWNER"\)/u, "owner stays strict everywhere");
});

test("P3 decision table: the root itself is never treated as 'below'", () => {
  const fn = ps1.slice(ps1.indexOf("static string HardenedRoot(string p)"));
  const body = fn.slice(0, fn.indexOf("\n"));
  assert.match(body, /i\+1<parts\.Length/u, "a path must have at least one segment after agent-pipeline to count as below it");
});

test("P4 HELPER_SHA256 equals the digest of the helper bytes", () => {
  const pinned = /const HELPER_SHA256='([a-f0-9]{64})'/u.exec(backend)?.[1];
  assert.equal(pinned, createHash("sha256").update(ps1Bytes).digest("hex"));
});
