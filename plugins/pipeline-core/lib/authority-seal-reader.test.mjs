// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { test } from "node:test";
import { AUTHORITY_SEAL_EXITS, AUTHORITY_SEAL_SCHEMA, readAuthoritySeal, requireSealedAuthority } from "./authority-seal-reader.mjs";

const D1 = "a".repeat(64);
const D2 = "b".repeat(64);
const D3 = "c".repeat(64);
const bound = (extra = {}) => ({ prd: { path: "specs/f/prd.md", sha256: D1 }, spec: { path: "specs/f/spec.md", sha256: D2 }, result: null, ...extra });
const draft = (extra = {}) => ({ sealed: false, prd: { path: "specs/f/prd.md" }, spec: { path: "specs/f/spec.md" }, result: null, ...extra });

test("ASR1 a state without the marker reads as sealed, the identity for every bound project", () => {
  const read = readAuthoritySeal(bound({ result: { path: "specs/f/result.md", sha256: D3 } }));
  assert.equal(read.schema, AUTHORITY_SEAL_SCHEMA);
  assert.equal(read.status, "sealed");
  assert.equal(read.sealed, true);
  assert.deepEqual(read.digests, { prd: D1, spec: D2, result: D3, plan: null });
  assert.equal(readAuthoritySeal(bound({ sealed: true })).sealed, true);
});

test("ASR2 a draft carries paths only and no digest, and names both typed exits", () => {
  const read = readAuthoritySeal(draft());
  assert.equal(read.status, "draft");
  assert.equal(read.sealed, false);
  assert.equal(read.digests, null);
  assert.deepEqual(read.paths, { prd: "specs/f/prd.md", spec: "specs/f/spec.md", result: null, plan: null });
  assert.deepEqual([...read.exits], [AUTHORITY_SEAL_EXITS.prepareSeal, AUTHORITY_SEAL_EXITS.reopenDesign]);
});

test("ASR3 a draft that carries a digest, a missing path or a non-boolean marker is invalid and still names reopen-design", () => {
  const withDigest = readAuthoritySeal(draft({ prd: { path: "specs/f/prd.md", sha256: D1 } }));
  assert.equal(withDigest.code, "ASR-DRAFT-DIGEST");
  assert.equal(readAuthoritySeal({ sealed: false, spec: { path: "specs/f/spec.md" } }).code, "ASR-ARTIFACT");
  assert.equal(readAuthoritySeal(bound({ sealed: "no" })).code, "ASR-MARKER");
  for (const read of [withDigest, readAuthoritySeal(bound({ sealed: 1 })), readAuthoritySeal(null)]) {
    assert.equal(read.sealed, false, "an invalid read fails closed on a reader that only checks the flag");
    assert.deepEqual([...read.exits], [AUTHORITY_SEAL_EXITS.reopenDesign], "no state is a dead end");
  }
});

test("ASR4 a sealed binding needs a safe path and a sha256 digest, and the reader never throws", () => {
  assert.equal(readAuthoritySeal(bound({ prd: { path: "/abs/prd.md", sha256: D1 } })).code, "ASR-ARTIFACT");
  assert.equal(readAuthoritySeal(bound({ spec: { path: "specs/f/spec.md", sha256: "xyz" } })).code, "ASR-ARTIFACT");
  assert.equal(readAuthoritySeal(bound({ spec: { path: "../spec.md", sha256: D2 } })).code, "ASR-ARTIFACT");
  for (const value of [undefined, null, 7, "x", [], {}]) assert.doesNotThrow(() => readAuthoritySeal(value));
  assert.equal(readAuthoritySeal([]).code, "ASR-AUTHORITY");
});

test("ASR5 the gate form passes a sealed package and refuses a draft with a typed code and both exits", () => {
  const ok = requireSealedAuthority(bound());
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.digests, { prd: D1, spec: D2, result: null, plan: null });
  const refused = requireSealedAuthority(draft());
  assert.equal(refused.ok, false);
  assert.equal(refused.code, "ASR-NOT-SEALED");
  assert.match(refused.reason, /prepare the seal/u);
  assert.match(refused.reason, /reopen the design/u);
  assert.deepEqual([...refused.exits], [AUTHORITY_SEAL_EXITS.prepareSeal, AUTHORITY_SEAL_EXITS.reopenDesign]);
  assert.equal(requireSealedAuthority(null).code, "ASR-AUTHORITY");
});
