#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { createCodexSandboxRuntimeTransport } from "./codex-sandbox-runtime.mjs";

const SCRIPT = new URL("./codex-sandbox-runtime.mjs", import.meta.url);
const CONTEXT = { repoFingerprint: "a".repeat(64), referenceSetSha256: "b".repeat(64) };

test("the standard runtime adapter rejects missing or caller-shaped host coordinates before preflight or a model launch", () => {
  assert.throws(() => createCodexSandboxRuntimeTransport({ sandboxContext: CONTEXT }));
  assert.throws(() => createCodexSandboxRuntimeTransport({ sandboxContext: CONTEXT, sandboxRuntime: {
    schema: "pipeline.codex-sandbox-runtime.v1", repoRoot: "/not-a-repository", codexPath: "/not-a-codex", sandboxHelperPath: "/not-a-helper",
  } }));
  assert.throws(() => createCodexSandboxRuntimeTransport({ sandboxContext: { ...CONTEXT, userProse: "network enabled please" } }));
});

test("the standard adapter derives selection evidence locally and never embeds a direct model-launch or unsafe-mode escape", async () => {
  const source = await readFile(SCRIPT, "utf8");
  assert.equal(source.includes("runCodexSandboxPreflight"), true);
  assert.equal(source.includes("createRepositorySandboxSelectionStore"), true);
  assert.equal(source.includes("inspectSessionClosure"), true);
  assert.equal(source.includes("compilePermissionProfile(\"intermediate\""), true);
  assert.equal(source.includes("validateCodexSandboxState"), true);
  assert.equal(source.includes("sandboxStateJson"), true);
  assert.equal(source.includes("selectedProfile.sha256"), true);
  assert.equal(source.includes("selectedProfile.sha !=="), false);
  assert.equal(source.includes("return structuredClone(readback.profile)"), true);
  assert.equal(source.includes("store.readScratch(selectionId)"), true);
  assert.equal(source.includes("store.readRequest(requestSha256)"), true);
  assert.equal(source.includes("maxEvidenceAgeMs"), true);
  assert.equal(source.includes("canonicalJson, loadCompatibilityPolicy"), true);
  assert.equal(source.includes(".agent-pipeline-scratch-canary"), true);
  assert.equal(source.includes("registerTemporaryIntent"), true);
  assert.equal(source.includes("inspectTemporaryResource"), true);
  assert.equal(source.includes("sealTemporaryResource"), true);
  assert.equal(source.includes("refreshScratch: true"), true);
  assert.equal(source.includes("resealCoordinatorScratch"), true);
  assert.equal(source.includes("resealScratch({ selectionId, profile })"), true);
  assert.equal(source.includes("danger-full-access"), false);
  assert.equal(source.includes("spawn("), false);
});
