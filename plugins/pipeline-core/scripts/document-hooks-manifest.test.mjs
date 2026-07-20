#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { compileDocumentHooksPolicy } from "../lib/document-hooks.mjs";
import { loadManifest, validateManifest } from "../lib/manifest.mjs";
import { run as validateManifestCli } from "../../../harness/scripts/validate-manifest.mjs";
import { validateV3ManifestReadback } from "../../../setup.mjs";

const BINDING_ID = "dh_aaaaaaaaaaaaaaaaaaaaaaaaaa";
const POLICY_SOURCE = `schema: pipeline.document-hooks-policy.v1
classes:
  - classId: operations
    bindingId: ${BINDING_ID}
    mode: mandatory
    events:
      - close
      - design-impact
      - verify
`;

function createRoot() {
  const root = mkdtempSync(join(tmpdir(), "document-hooks-manifest-"));
  mkdirSync(join(root, ".claude"), { recursive: true });
  return root;
}

function writePolicy(root, source = POLICY_SOURCE, filename = "document-hooks.yaml") {
  mkdirSync(join(root, "governance/policies"), { recursive: true });
  writeFileSync(join(root, "governance/policies", filename), source);
}

function manifest(documentHooks) {
  const value = {
    schema: "pipeline.manifest.v0",
    governance: { policies_path: "governance/policies" },
  };
  if (documentHooks !== undefined) value.documentHooks = documentHooks;
  return value;
}

function runtimeYaml(runtime) {
  const lines = [
    "documentHooks:",
    `  schema: ${runtime.schema}`,
    `  sourceSha256: ${runtime.sourceSha256}`,
    "  classes:",
  ];
  for (const entry of runtime.classes) {
    lines.push(
      `    - classId: ${entry.classId}`,
      `      bindingId: ${entry.bindingId}`,
      `      mode: ${entry.mode}`,
      "      events:",
      ...entry.events.map((event) => `        - ${event}`),
    );
  }
  return lines.join("\n");
}

test("manifest embeds the exact closed document runtime schema shape", () => {
  const manifestSchema = JSON.parse(readFileSync(new URL("./pipeline-manifest.schema.json", import.meta.url), "utf8"));
  const runtimeSchema = JSON.parse(readFileSync(new URL("./document-hooks-runtime.schema.json", import.meta.url), "utf8"));
  const { description: ignoredManifestDescription, ...manifestShape } = manifestSchema.properties.documentHooks;
  const {
    $schema: ignoredDialect,
    $id: ignoredId,
    title: ignoredTitle,
    description: ignoredRuntimeDescription,
    ...runtimeShape
  } = runtimeSchema;
  assert.deepEqual(manifestShape, runtimeShape);
});

test("absent fixed Policy and absent runtime are a complete read-only no-op", () => {
  const root = createRoot();
  try {
    writePolicy(root, POLICY_SOURCE, "document-hooks.example.yaml");
    writeFileSync(
      join(root, ".claude/pipeline.yaml"),
      "schema: pipeline.manifest.v0\ngovernance:\n  policies_path: governance/policies\n",
    );
    const before = readdirSync(join(root, "governance/policies"));
    const result = validateManifest(manifest(undefined), { rootDir: root });
    assert.equal(result.status, "ok");
    assert.deepEqual(result.errors, []);
    assert.deepEqual(validateV3ManifestReadback(root), { ok: true, diagnostics: [] });
    assert.deepEqual(readdirSync(join(root, "governance/policies")), before);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("valid Policy and its exact normalized projection pass manifest readback", () => {
  const root = createRoot();
  try {
    writePolicy(root);
    const compiled = compileDocumentHooksPolicy(POLICY_SOURCE);
    const result = validateManifest(manifest(compiled.runtime), { rootDir: root });
    assert.equal(result.status, "ok", JSON.stringify(result.errors));
    assert.deepEqual(result.manifest.documentHooks.classes[0].events, ["design-impact", "verify", "close"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("Policy/runtime presence must agree in both directions", () => {
  const withPolicy = createRoot();
  const withoutPolicy = createRoot();
  try {
    writePolicy(withPolicy);
    const runtime = compileDocumentHooksPolicy(POLICY_SOURCE).runtime;
    const missing = validateManifest(manifest(undefined), { rootDir: withPolicy });
    const stale = validateManifest(manifest(runtime), { rootDir: withoutPolicy });
    assert.equal(missing.status, "invalid");
    assert(missing.errors.some(({ rule }) => rule === "document-hooks-runtime"));
    assert.equal(stale.status, "invalid");
    assert(stale.errors.some(({ rule }) => rule === "document-hooks-runtime"));
  } finally {
    rmSync(withPolicy, { recursive: true, force: true });
    rmSync(withoutPolicy, { recursive: true, force: true });
  }
});

test("valid-shaped digest, class, and ordering drift fail closed", () => {
  const root = createRoot();
  try {
    writePolicy(root);
    const runtime = compileDocumentHooksPolicy(POLICY_SOURCE).runtime;
    const cases = [
      { ...runtime, sourceSha256: "b".repeat(64) },
      { ...runtime, classes: runtime.classes.map((entry) => ({ ...entry, mode: "advisory" })) },
      { ...runtime, classes: runtime.classes.map((entry) => ({ ...entry, events: ["close", "verify", "design-impact"] })) },
    ];
    for (const drifted of cases) {
      const result = validateManifest(manifest(drifted), { rootDir: root });
      assert.equal(result.status, "invalid");
      assert(result.errors.some(({ rule }) => rule === "document-hooks-runtime"));
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("private or unknown runtime fields are rejected by the manifest schema", () => {
  const root = createRoot();
  try {
    writePolicy(root);
    const runtime = compileDocumentHooksPolicy(POLICY_SOURCE).runtime;
    const widened = {
      ...runtime,
      classes: runtime.classes.map((entry) => ({ ...entry, triggerPatterns: ["private/customer/**"] })),
    };
    const result = validateManifest(manifest(widened), { rootDir: root });
    assert.equal(result.status, "invalid");
    assert(result.errors.some(({ path }) => path === "documentHooks.classes[0].triggerPatterns"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("malformed Policy is surfaced generically by loadManifest and the CLI", () => {
  const root = createRoot();
  const canary = "ACME-PRIVATE-/srv/customer/template.pdf";
  try {
    writePolicy(root, `${POLICY_SOURCE}${canary}\n`);
    const manifestPath = join(root, ".claude/pipeline.yaml");
    writeFileSync(manifestPath, "schema: pipeline.manifest.v0\ngovernance:\n  policies_path: governance/policies\n");

    const loaded = loadManifest(root);
    assert.equal(loaded.status, "invalid");
    assert(loaded.errors.some(({ rule }) => rule === "document-hooks-policy"));
    assert.equal(JSON.stringify(loaded.errors).includes(canary), false);

    const stdout = [];
    const stderr = [];
    const originalLog = console.log;
    const originalError = console.error;
    console.log = (...values) => stdout.push(values.join(" "));
    console.error = (...values) => stderr.push(values.join(" "));
    let code;
    try {
      code = validateManifestCli([manifestPath]);
    } finally {
      console.log = originalLog;
      console.error = originalError;
    }
    assert.equal(code, 2);
    assert(stderr.some((line) => line.includes("Document-hooks Policy is invalid")));
    assert.equal(`${stdout.join("\n")}\n${stderr.join("\n")}`.includes(canary), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("file-loaded matching projection passes through the canonical manifest path", () => {
  const root = createRoot();
  try {
    writePolicy(root);
    const runtime = compileDocumentHooksPolicy(POLICY_SOURCE).runtime;
    writeFileSync(
      join(root, ".claude/pipeline.yaml"),
      `schema: pipeline.manifest.v0\ngovernance:\n  policies_path: governance/policies\n${runtimeYaml(runtime)}\n`,
    );
    const loaded = loadManifest(root);
    assert.equal(loaded.status, "ok", JSON.stringify(loaded.errors));
    assert.deepEqual(validateV3ManifestReadback(root), { ok: true, diagnostics: [] });

    const drifted = { ...runtime, sourceSha256: "b".repeat(64) };
    writeFileSync(
      join(root, ".claude/pipeline.yaml"),
      `schema: pipeline.manifest.v0\ngovernance:\n  policies_path: governance/policies\n${runtimeYaml(drifted)}\n`,
    );
    const setupReadback = validateV3ManifestReadback(root);
    assert.equal(setupReadback.ok, false);
    assert.equal(setupReadback.reason, "invalid-v3-manifest");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
