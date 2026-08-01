#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { canonicalizeJson } from "../lib/governance-event.mjs";
import { main } from "./governance-event.mjs";

const fingerprint = "a".repeat(64);
const candidate = { commit: "b".repeat(40), tree: "c".repeat(40) };
const absent = { state: "not-applicable" };
const registry = { schema: "pipeline.governance-stream-registry.v1", repositoryFingerprint: fingerprint, canonicalization: "RFC8785", digestAlgorithm: "sha-256", eventDigestDomain: "pipeline.governance-event.v1\0", storageRoot: "governance/events", streams: [
  { streamId: "human", origin: "human", authorityClass: "human-authority", relativeRoot: "human", storageProfile: "repository-public-safe", genesis: { sequence: 0, eventDigest: null } },
  { streamId: "agent", origin: "agent", authorityClass: "non-authoritative", relativeRoot: "agent", storageProfile: "repository-public-safe", genesis: { sequence: 0, eventDigest: null } },
  { streamId: "lifecycle", origin: "lifecycle", authorityClass: "non-authoritative", relativeRoot: "lifecycle", storageProfile: "repository-public-safe", genesis: { sequence: 0, eventDigest: null } },
] };
function intent() { return { schema: "pipeline.governance-event-envelope.v1", payloadSchema: "pipeline.lifecycle-governance-event.v1", canonicalization: "RFC8785", digestAlgorithm: "sha-256", eventId: "cli-event", idempotencyKey: "cli-idem", origin: "lifecycle", authorityClass: "non-authoritative", eventType: "lifecycle.tested", occurredAtEpochMs: 1, observedAtEpochMs: 1, timeAssurance: "locally-observed", repositoryFingerprint: fingerprint, sourceUri: `urn:pipeline:repository:${fingerprint}`, streamId: "lifecycle", correlation: { featureId: absent, packageId: absent, requestId: absent, sessionId: absent, dispatchId: absent, traceId: absent }, candidate, artifacts: [absent], policy: { policyDigest: absent, configurationDigest: absent, capturePolicyDigest: absent, redactionPolicyDigest: absent }, classification: "repository-public-safe", storageProfile: "repository-public-safe", retentionCompatibility: "repository-retained", disclosureClass: "repository-visible", payload: {} }; }
async function fixture() { const root = await mkdtemp(path.join(os.tmpdir(), "governance-event-cli-")); await mkdir(path.join(root, "governance/events"), { recursive: true }); await writeFile(path.join(root, "governance/events/registry.json"), `${canonicalizeJson(registry)}\n`); return root; }
async function request(root, name, value) { const file = path.join(root, name); await writeFile(file, `${canonicalizeJson(value)}\n`); return file; }

test("CLI previews without allocating, appends, verifies and queries only closed requests", async (t) => {
  const root = await fixture(); t.after(() => rm(root, { recursive: true, force: true }));
  const appendFile = await request(root, "append.json", { schema: "pipeline.governance-event-append-request.v1", repositoryFingerprint: fingerprint, intent: intent() });
  const preview = await main(["preview", "--request-file", appendFile]);
  assert.equal(preview.mutation, false);
  const appended = await main(["append", "--repo", root, "--request-file", appendFile]);
  assert.equal(appended.outcome, "appended");
  const streamFile = await request(root, "stream.json", { schema: "pipeline.governance-event-stream-request.v1", repositoryFingerprint: fingerprint, streamId: "lifecycle", checkpoint: appended.checkpoint });
  assert.equal((await main(["verify", "--repo", root, "--request-file", streamFile])).completeness, "verified");
  assert.equal((await main(["query", "--repo", root, "--request-file", streamFile])).events.length, 1);
  await assert.rejects(() => main(["append", "--repo", root, "--request-file", streamFile]), (error) => error.code === "GEC-REQUEST");
});
