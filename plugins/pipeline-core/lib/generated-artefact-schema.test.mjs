// SPDX-License-Identifier: SUL-1.0
// C22 (CGF-06, AC-108): criterion-bound cases for classifying the Pipeline's OWN generated metadata by a verifiable schema, with digest fields kept apart from credential fields.
// Source: Codex greenfield report CGF-06 ("generated metadata repeatedly blocks scanners and classifiers; classify own generated artefacts by verifiable schema, separate digest from
// credential fields; no blanket ignore, no history rewrite"). Measured on the repository: the secret scanner reads bare digests under key-shaped field names (idempotencyKey,
// scopeKey, reuseKeySha256, courseKey) of generated JSON as credentials. Written before the module existed.
import assert from "node:assert/strict";
import test from "node:test";
import { classifyGeneratedArtefact } from "./generated-artefact-schema.mjs";

const HEX32 = "3f7fdf423cbf3011f758aeb70977dffc";
const HEX64 = "a".repeat(64);
const event = (extra = {}) => JSON.stringify({ schema: "pipeline.human-guard-event.v1", id: "evt-1", idempotencyKey: HEX32, scopeKey: HEX64, intentSha256: HEX64, ...extra });

test("a generated artefact with a Pipeline schema is classified, and its key-shaped digest fields are named apart from credential fields", () => {
  const result = classifyGeneratedArtefact(event());
  assert.equal(result.class, "pipeline-generated");
  assert.equal(result.schema, "pipeline.human-guard-event.v1");
  assert.deepEqual(result.digestFields.map((field) => field.path).sort(), ["idempotencyKey", "intentSha256", "scopeKey"]);
  assert.deepEqual(result.keyShapedDigestFields.sort(), ["idempotencyKey", "scopeKey"], "digest values whose NAME the scanner reads as a credential keyword");
  assert.deepEqual(result.credentialFields, []);
  assert.equal(result.scannerSafe, true, "every credential-shaped name holds a bare digest, so a field-scoped exception would be provable");
});

test("a credential-shaped field that does not hold a bare digest keeps the artefact out of the digest class: nothing is excused", () => {
  const result = classifyGeneratedArtefact(event({ token: "not-a-digest-but-a-long-looking-value", nested: { password: HEX64.toUpperCase() } }));
  assert.equal(result.class, "pipeline-generated");
  assert.deepEqual(result.credentialFields.sort(), ["nested.password", "token"], "upper-case hex is not a Pipeline digest");
  assert.equal(result.scannerSafe, false);
});

test("without a verifiable Pipeline schema the file is unclassified, never guessed from its name or its digests", () => {
  for (const text of [JSON.stringify({ idempotencyKey: HEX32 }), JSON.stringify({ schema: "vendor.thing.v1", idempotencyKey: HEX32 }), JSON.stringify({ schema: "pipeline.x", idempotencyKey: HEX32 }),
    "not json at all", "[1,2]", "null", JSON.stringify({ schema: 7 })]) {
    const result = classifyGeneratedArtefact(text);
    assert.equal(result.class, "unclassified", text);
    assert.equal(result.scannerSafe, false);
    assert.equal(typeof result.reason, "string");
  }
});

test("a byte-order mark, CRLF line ends and indented text classify the same as compact text (Windows files)", () => {
  const pretty = JSON.stringify(JSON.parse(event()), null, 2).replace(/\n/gu, "\r\n");
  const compact = classifyGeneratedArtefact(event());
  assert.deepEqual(classifyGeneratedArtefact(`﻿${pretty}`), compact);
  assert.deepEqual(classifyGeneratedArtefact(Buffer.from(pretty, "utf8")), compact);
});

test("arrays and nested objects are walked with their path; the result never carries a value", () => {
  const text = JSON.stringify({ schema: "pipeline.critic-lineage.v1", rounds: [{ packetId: HEX32, courseKey: HEX64 }] });
  const result = classifyGeneratedArtefact(text);
  assert.deepEqual(result.keyShapedDigestFields, ["rounds[0].courseKey"]);
  assert.equal(JSON.stringify(result).includes(HEX64), false, "a classifier output is safe to print");
  assert.equal(JSON.stringify(result).includes(HEX32), false);
});

test("an oversized or hostile input is refused as unclassified instead of throwing", () => {
  assert.equal(classifyGeneratedArtefact("x".repeat(5 * 1024 * 1024)).class, "unclassified");
  assert.equal(classifyGeneratedArtefact(undefined).class, "unclassified");
  let deep = { schema: "pipeline.deep.v1" }; for (let index = 0; index < 200; index += 1) deep = { schema: "pipeline.deep.v1", inner: deep };
  assert.equal(classifyGeneratedArtefact(JSON.stringify(deep)).class, "unclassified", "depth is bounded");
});
