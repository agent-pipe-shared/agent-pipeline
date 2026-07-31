#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  LIVE_CERTIFICATION_SCHEMA,
  certifyLiveRunner,
  parseLiveCertificationArgs,
} from "./live-runner-certification.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const candidate = "a".repeat(40);
let checks = 0;

async function check(name, fn) {
  await fn();
  checks += 1;
  process.stdout.write(`PASS ${name}\n`);
}

await check("live certification is authority-selected and missing authority is typed unavailable", async () => {
  let resolutions = 0;
  const result = await certifyLiveRunner({
    repoRoot: root,
    candidateCommit: candidate,
    authority: null,
    resolveBinary: async () => { resolutions += 1; return "/private/runner"; },
  });
  assert.equal(result.schema, LIVE_CERTIFICATION_SCHEMA);
  assert.equal(result.status, "unavailable");
  assert.equal(result.code, "LRC-AUTHORITY-UNAVAILABLE");
  assert.equal(resolutions, 0);
});

await check("selected lane reports missing pinned runner as unavailable without leaking host data", async () => {
  const result = await certifyLiveRunner({
    repoRoot: root,
    candidateCommit: candidate,
    authority: "approved",
    pathEnv: "/private/runner/bin",
    resolveBinary: async () => { throw new Error("private host coordinate"); },
  });
  assert.equal(result.status, "unavailable");
  assert.equal(result.code, "LRC-RUNNER-UNAVAILABLE");
  assert.equal(JSON.stringify(result).includes("/private"), false);
});

await check("selected live lane binds pinned inspection and sanitized result evidence", async () => {
  const calls = [];
  const inspection = {
    binarySha256: "1".repeat(64),
    versionSha256: "2".repeat(64),
    runtimeRoot: "/private/runtime",
    runtimeRootSha256: "3".repeat(64),
    runtimeManifestSha256: "4".repeat(64),
    runtimeEntries: 2,
  };
  const result = await certifyLiveRunner({
    repoRoot: root,
    candidateCommit: candidate,
    authority: "approved",
    pathEnv: "/authority/bin",
    resolveBinary: async (input) => { calls.push(["resolve", input]); return "/authority/bin/codex"; },
    inspectBinary: async (input) => { calls.push(["inspect", input]); return inspection; },
    runIsolation: async (input) => {
      calls.push(["run", input]);
      return {
        ok: true,
        envelope: { schema: "public-fixture", pass: true },
        localDiagnostics: { stderrTail: "/private/runtime credential=private" },
      };
    },
  });
  assert.equal(result.status, "passed");
  assert.equal(result.code, "LRC-PASSED");
  assert.match(result.commandSha256, /^[0-9a-f]{64}$/u);
  assert.equal(result.resultSha256, createHash("sha256").update(JSON.stringify({
    ok: true,
    envelope: { schema: "public-fixture", pass: true },
  })).digest("hex"));
  assert.equal(calls[0][1].pathEnv, "/authority/bin");
  assert.equal(calls[1][1].codexBinary, "/authority/bin/codex");
  assert.equal(calls[2][1].resolvedBinary, "/authority/bin/codex");
  assert.equal(calls[2][1].candidateCommit, candidate);
  assert.equal(JSON.stringify(result).includes("/authority"), false);
  assert.equal(JSON.stringify(result).includes("/private"), false);
});

await check("live rejection stays a typed failed result and input parsing is closed", async () => {
  const result = await certifyLiveRunner({
    repoRoot: root,
    candidateCommit: candidate,
    authority: "approved",
    resolveBinary: async () => "/runner/codex",
    inspectBinary: async () => ({ runtimeRoot: "/runner" }),
    runIsolation: async () => ({ ok: false, reason: "bounded rejection" }),
  });
  assert.equal(result.status, "failed");
  assert.equal(result.code, "LRC-REJECTED");
  assert.deepEqual(parseLiveCertificationArgs(["--candidate", candidate, "--policy", "advisory"]), {
    candidateCommit: candidate,
    policy: "advisory",
  });
  assert.throws(() => parseLiveCertificationArgs(["--candidate", candidate, "--policy", "optional"]));
});

process.stdout.write(`live-runner-certification: ${checks} checks passed\n`);
