#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

let symlinkCapable = true;
{
  const probeDir = mkdtempSync(join(tmpdir(), "document-hooks-symlink-probe-"));
  try { writeFileSync(join(probeDir, "target"), "x"); symlinkSync(join(probeDir, "target"), join(probeDir, "link")); }
  catch { symlinkCapable = false; }
  finally { rmSync(probeDir, { recursive: true, force: true }); }
  if (!symlinkCapable) process.stdout.write("[capability: symlink unavailable] skipping symlink-specific checks\n");
}

import {
  DOCUMENT_HOOKS_POLICY_SCHEMA,
  DOCUMENT_HOOKS_RUNTIME_SCHEMA,
  DocumentHooksError,
  buildDocumentHooksRuntime,
  compileDocumentHooksPolicy,
  evaluateDocumentImpact,
  loadDocumentHooksPolicy,
  normalizeDocumentHooksPolicy,
  validateDocumentHooksPolicy,
  validateDocumentHooksProjection,
  validateDocumentHooksRuntime,
  validateDocumentHooksRuntimeReadback,
  validateDocumentTriggerPattern,
} from "./document-hooks.mjs";

const ZERO = "dh_aaaaaaaaaaaaaaaaaaaaaaaaaa";
const ONES = "dh_77777777777777777777777774";
const SECOND = "dh_aaaaaaaaaaaaaaaaaaaaaaaaae";
const SHA = "a".repeat(64);

function record(overrides = {}) {
  return {
    classId: "operations",
    bindingId: ZERO,
    mode: "mandatory",
    events: ["verify"],
    ...overrides,
  };
}

function policy(classes = [record()]) {
  return { schema: DOCUMENT_HOOKS_POLICY_SCHEMA, classes };
}

function expectCode(fn, code) {
  assert.throws(fn, (error) => error instanceof DocumentHooksError && error.code === code);
}

function policyYaml(classes = `  - classId: operations\n    bindingId: ${ZERO}\n    mode: mandatory\n    events:\n      - verify\n`) {
  return `schema: ${DOCUMENT_HOOKS_POLICY_SCHEMA}\nclasses:\n${classes}`;
}

function impactContext(raw, overrides = {}) {
  return {
    baseCommit: "a".repeat(40),
    baseTree: "b".repeat(40),
    candidateCommit: "c".repeat(40),
    candidateTree: "d".repeat(40),
    diffSha256: createHash("sha256").update(raw).digest("hex"),
    ...overrides,
  };
}

function impactBindings() {
  return [
    { bindingId: ONES, triggerPatterns: ["docs/**/*.md", "README.md"] },
    { bindingId: ZERO, triggerPatterns: ["governance/?olicy.yaml"] },
  ];
}

test("public schemas close both roots and class records", () => {
  for (const [path, id, rootKeys] of [
    [new URL("../scripts/document-hooks-policy.schema.json", import.meta.url), DOCUMENT_HOOKS_POLICY_SCHEMA, ["schema", "classes"]],
    [new URL("../scripts/document-hooks-runtime.schema.json", import.meta.url), DOCUMENT_HOOKS_RUNTIME_SCHEMA, ["schema", "sourceSha256", "classes"]],
  ]) {
    const schema = JSON.parse(readFileSync(path, "utf8"));
    assert.equal(schema.$id, id);
    assert.equal(schema.additionalProperties, false);
    assert.deepEqual(schema.required, rootKeys);
    assert.equal(schema.properties.classes.minItems, 1);
    assert.equal(schema.properties.classes.maxItems, 32);
    assert.equal(schema.properties.classes.items.additionalProperties, false);
    assert.deepEqual(schema.properties.classes.items.required, ["classId", "bindingId", "mode", "events"]);
  }
});

test("Policy accepts canonical vectors, repeated class IDs, and arbitrary input order", () => {
  const value = policy([
    record({ bindingId: ONES, events: ["close", "design-impact"] }),
    record({ bindingId: ZERO, mode: "advisory", events: ["verify"] }),
  ]);
  assert.equal(validateDocumentHooksPolicy(value), value);
});

test("Policy rejects unknown fields and any private vocabulary", () => {
  expectCode(() => validateDocumentHooksPolicy({ ...policy(), command: "renderer" }), "DH-SCHEMA");
  for (const privateField of ["triggerPatterns", "privateRoot", "organisationLabel", "templatePath", "adapterId"]) {
    expectCode(() => validateDocumentHooksPolicy(policy([{ ...record(), [privateField]: "/private/canary" }])), "DH-SCHEMA");
  }
});

test("Policy rejects empty/oversized classes and duplicate binding IDs", () => {
  expectCode(() => validateDocumentHooksPolicy(policy([])), "DH-CLASSES");
  expectCode(() => validateDocumentHooksPolicy(policy(Array.from({ length: 33 }, (_, index) => record({
    bindingId: `dh_${"a".repeat(24)}${String.fromCharCode(97 + Math.floor(index / 8))}${["a", "e", "i", "m", "q", "u", "y", "4"][index % 8]}`,
  })))), "DH-CLASSES");
  expectCode(() => validateDocumentHooksPolicy(policy([record(), record({ classId: "privacy" })])), "DH-BINDING-DUPLICATE");
});

test("Policy rejects invalid class, mode, event cardinality, duplicates, and values", () => {
  expectCode(() => validateDocumentHooksPolicy(policy([record({ classId: "finance" })])), "DH-SCHEMA");
  expectCode(() => validateDocumentHooksPolicy(policy([record({ mode: "blocking" })])), "DH-SCHEMA");
  expectCode(() => validateDocumentHooksPolicy(policy([record({ events: [] })])), "DH-EVENTS");
  expectCode(() => validateDocumentHooksPolicy(policy([record({ events: ["verify", "verify"] })])), "DH-EVENTS-DUPLICATE");
  expectCode(() => validateDocumentHooksPolicy(policy([record({ events: ["render"] })])), "DH-SCHEMA");
});

test("Policy accepts only canonical 16-byte dh_ encodings", () => {
  for (const bindingId of [ZERO, ONES]) assert.equal(validateDocumentHooksPolicy(policy([record({ bindingId })])).classes[0].bindingId, bindingId);
  for (const bindingId of [
    "dh_AAAAAAAAAAAAAAAAAAAAAAAAAA",
    "dh_aaaaaaaaaaaaaaaaaaaaaaaaab",
    "dh_aaaaaaaaaaaaaaaaaaaaaaaaa",
    "da_aaaaaaaaaaaaaaaaaaaaaaaaaa",
    "dh_77777777777777777777777777",
  ]) expectCode(() => validateDocumentHooksPolicy(policy([record({ bindingId })])), "DH-BINDING-ID");
});

test("normalization uses unsigned UTF-8 class/binding order and fixed event order", () => {
  const normalized = normalizeDocumentHooksPolicy(policy([
    record({ classId: "privacy", bindingId: ONES, events: ["close", "design-impact", "verify"] }),
    record({ classId: "authorization", bindingId: SECOND, mode: "advisory", events: ["close"] }),
    record({ classId: "authorization", bindingId: ZERO, events: ["verify", "design-impact"] }),
  ]));
  assert.deepEqual(normalized.classes.map(({ classId, bindingId }) => [classId, bindingId]), [
    ["authorization", ZERO],
    ["authorization", SECOND],
    ["privacy", ONES],
  ]);
  assert.deepEqual(normalized.classes[0].events, ["design-impact", "verify"]);
  assert.deepEqual(normalized.classes[2].events, ["design-impact", "verify", "close"]);
});

test("runtime binds source digest and rejects non-normalized or widened projections", () => {
  const source = policyYaml();
  const compiled = compileDocumentHooksPolicy(source);
  assert.equal(compiled.sourceSha256, createHash("sha256").update(Buffer.from(source)).digest("hex"));
  assert.equal(compiled.runtime.sourceSha256, compiled.sourceSha256);
  assert.equal(validateDocumentHooksRuntime(compiled.runtime), compiled.runtime);

  expectCode(() => validateDocumentHooksRuntime({ ...compiled.runtime, sourceSha256: SHA.toUpperCase() }), "DH-SOURCE-DIGEST");
  expectCode(() => validateDocumentHooksRuntime({ ...compiled.runtime, privatePath: "/canary" }), "DH-SCHEMA");
  expectCode(() => validateDocumentHooksRuntime({ ...compiled.runtime, classes: [
    record({ classId: "privacy", bindingId: ONES }),
    record({ classId: "authorization", bindingId: ZERO }),
  ] }), "DH-RUNTIME-ORDER");
  expectCode(() => validateDocumentHooksRuntime({ ...compiled.runtime, classes: [record({ events: ["close", "verify"] })] }), "DH-RUNTIME-ORDER");
});

test("projection readback rejects valid-shaped source or class drift", () => {
  const source = policyYaml();
  const runtime = compileDocumentHooksPolicy(source).runtime;
  assert.equal(validateDocumentHooksProjection(source, runtime), runtime);
  expectCode(() => validateDocumentHooksProjection(`${source}# source-byte drift\n`, runtime), "DH-RUNTIME-DRIFT");
  expectCode(() => validateDocumentHooksProjection(source, {
    ...runtime,
    classes: runtime.classes.map((entry) => ({ ...entry, mode: "advisory" })),
  }), "DH-RUNTIME-DRIFT");
  expectCode(() => validateDocumentHooksRuntimeReadback({ ...runtime, sourceSha256: "b".repeat(64) }, runtime), "DH-RUNTIME-DRIFT");
});

test("build rejects caller-shaped source digests", () => {
  expectCode(() => buildDocumentHooksRuntime(policy(), "sha256:deadbeef"), "DH-SOURCE-DIGEST");
});

test("raw parser rejects duplicate YAML fields, unknown fields, and invalid UTF-8", () => {
  expectCode(() => compileDocumentHooksPolicy(`${policyYaml()}schema: ${DOCUMENT_HOOKS_POLICY_SCHEMA}\n`), "DH-SOURCE-YAML");
  expectCode(() => compileDocumentHooksPolicy(policyYaml(`  - classId: operations\n    bindingId: ${ZERO}\n    mode: mandatory\n    mode: advisory\n    events:\n      - verify\n`)), "DH-SOURCE-YAML");
  expectCode(() => compileDocumentHooksPolicy(`${policyYaml()}triggerPaths:\n  - secret/customer\n`), "DH-SCHEMA");
  expectCode(() => compileDocumentHooksPolicy(Buffer.from([0xc3, 0x28])), "DH-SOURCE-UTF8");
});

test("invalid-source diagnostics do not echo private canary values", () => {
  const canary = "ACME-SECRET-/srv/customer/template.pdf";
  let error;
  try {
    compileDocumentHooksPolicy(`${policyYaml()}${canary}\n`);
  } catch (caught) {
    error = caught;
  }
  assert(error instanceof DocumentHooksError);
  assert.equal(error.code, "DH-SOURCE-YAML");
  assert.equal(JSON.stringify(error).includes(canary), false);
  assert.equal(error.message.includes(canary), false);
});

test("frozen impact evaluates ordinary, add/delete, and both rename/copy path sides with restricted globs", () => {
  const raw = Buffer.from([
    "M", "docs/guide.md",
    "A", "README.md",
    "D", "governance/policy.yaml",
    "R100", "outside/old.txt", "docs/renamed.md",
    "C075", "docs/source.md", "outside/copy.txt",
  ].join("\0") + "\0", "utf8");
  const result = evaluateDocumentImpact({ context: impactContext(raw), bindings: impactBindings(), rawNameStatus: raw });
  assert.deepEqual(result, [
    { bindingId: ONES, affected: true },
    { bindingId: ZERO, affected: true },
  ]);
  assert.deepEqual(Object.keys(result[0]), ["bindingId", "affected"]);
  assert.equal(JSON.stringify(result).includes("docs/guide.md"), false);
  assert.equal(JSON.stringify(result).includes(impactContext(raw).diffSha256), false);
});

test("frozen impact keeps no-match bindings false and supports complete-segment **", () => {
  const raw = Buffer.from("M\0docs/guide.md\0", "utf8");
  const result = evaluateDocumentImpact({
    context: impactContext(raw),
    bindings: [
      { bindingId: ZERO, triggerPatterns: ["docs/**/guide.md"] },
      { bindingId: ONES, triggerPatterns: ["docs/*.pdf"] },
    ],
    rawNameStatus: raw,
  });
  assert.deepEqual(result, [
    { bindingId: ONES, affected: false },
    { bindingId: ZERO, affected: true },
  ]);
});

test("impact rejects stale identity, malformed NUL records, unsafe paths, and malformed bindings", () => {
  const raw = Buffer.from("M\0docs/guide.md\0", "utf8");
  const valid = { context: impactContext(raw), bindings: impactBindings(), rawNameStatus: raw };
  expectCode(() => evaluateDocumentImpact({ ...valid, context: impactContext(raw, { diffSha256: SHA }) }), "DH-IMPACT-DIFF");
  expectCode(() => evaluateDocumentImpact({ ...valid, rawNameStatus: Buffer.from("R100\0only-old\0", "utf8") }), "DH-IMPACT-DIFF");
  expectCode(() => evaluateDocumentImpact({ ...valid, rawNameStatus: Buffer.from("T\0docs/guide.md\0", "utf8") }), "DH-IMPACT-DIFF");
  const traversal = Buffer.from("M\0docs/../secret.md\0", "utf8");
  expectCode(() => evaluateDocumentImpact({ ...valid, context: impactContext(traversal), rawNameStatus: traversal }), "DH-IMPACT-PATH");
  expectCode(() => evaluateDocumentImpact({ ...valid, bindings: [{ bindingId: ZERO, triggerPatterns: ["docs/**part"] }] }), "DH-IMPACT-PATTERN");
  expectCode(() => evaluateDocumentImpact({ ...valid, bindings: [{ bindingId: ZERO, triggerPatterns: ["docs/*.md"] }, { bindingId: ZERO, triggerPatterns: ["README.md"] }] }), "DH-IMPACT-BINDING");
  expectCode(() => evaluateDocumentImpact({ ...valid, rawNameStatus: Buffer.from("M\0docs/guide.md", "utf8") }), "DH-IMPACT-DIFF");
});

test("trigger-pattern validator rejects non-NFC and forbidden glob syntax", () => {
  for (const pattern of ["docs/[a].md", "docs/{a,b}.md", "docs/!a.md", "docs/\\\\a.md", "docs/e\u0301.md", "docs//guide.md"]) {
    expectCode(() => validateDocumentTriggerPattern(pattern), "DH-IMPACT-PATTERN");
  }
});

test("fixed repo loader is absent/no-op or configured and performs no writes", () => {
  const root = mkdtempSync(join(tmpdir(), "document-hooks-"));
  try {
    const manifest = { governance: { policies_path: "governance/policies" } };
    assert.deepEqual(loadDocumentHooksPolicy(root, {}), { status: "absent" });
    assert.deepEqual(loadDocumentHooksPolicy(root, manifest), {
      status: "absent",
      policyPath: "governance/policies/document-hooks.yaml",
    });
    mkdirSync(join(root, "governance/policies"), { recursive: true });
    writeFileSync(join(root, "governance/policies/document-hooks.yaml"), policyYaml());
    const loaded = loadDocumentHooksPolicy(root, manifest);
    assert.equal(loaded.status, "ok");
    assert.equal(loaded.policyPath, "governance/policies/document-hooks.yaml");
    assert.equal(loaded.runtime.schema, DOCUMENT_HOOKS_RUNTIME_SCHEMA);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("fixed repo loader returns typed invalid for malformed or escaping Policy paths", { skip: !symlinkCapable && "symlink unavailable" }, () => {
  const root = mkdtempSync(join(tmpdir(), "document-hooks-root-"));
  const outside = mkdtempSync(join(tmpdir(), "document-hooks-outside-"));
  try {
    assert.equal(loadDocumentHooksPolicy(root, { governance: { policies_path: "../outside" } }).code, "DH-POLICY-PATH");
    mkdirSync(join(root, "governance"), { recursive: true });
    writeFileSync(join(outside, "document-hooks.yaml"), policyYaml());
    symlinkSync(outside, join(root, "governance/policies"), "dir");
    const escaped = loadDocumentHooksPolicy(root, { governance: { policies_path: "governance/policies" } });
    assert.equal(escaped.status, "invalid");
    assert.equal(escaped.code, "DH-POLICY-PATH");
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});
