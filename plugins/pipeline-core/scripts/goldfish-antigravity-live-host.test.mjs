// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import test from "node:test";

import { LIVE_REQUEST_SCHEMA, parseArgs, runGoldfishAntigravityLiveHost } from "./goldfish-antigravity-live-host.mjs";

const request = {
  schema: LIVE_REQUEST_SCHEMA,
  root: "/repo",
  resultRoot: "/repo",
  resultPath: "results/out.json",
  packet: { role: "pipeline-core:goldfish-implementor", transport: "antigravity" },
  sessionId: "session-1",
  descriptorSha256: "a".repeat(64),
  consent: null,
  requestedModel: "gemini-3.8-flash-high",
  effort: "high",
  scope: "implementation-scope",
  inputSha256: "a".repeat(64),
  timeoutMs: 1000,
};

test("live wrapper rejects a malformed request without launcher/model calls", async () => {
  const result = await runGoldfishAntigravityLiveHost({ schema: LIVE_REQUEST_SCHEMA }, { agyPath: "/unused" });
  assert.equal(result.code, "AGY-LIVE-REQUEST-SHAPE");
  assert.equal(result.modelCalls, 0);
  assert.equal(result.launcherCalls, 0);
});

test("live wrapper keeps no-consent at zero calls", async () => {
  const result = await runGoldfishAntigravityLiveHost(request, { agyPath: "/unused" });
  assert.equal(result.code, "AGY-SESSION-CONSENT-REQUIRED");
  assert.equal(result.modelCalls, 0);
  assert.equal(result.launcherCalls, 0);
});

test("argument parser is closed", () => {
  assert.deepEqual(parseArgs(["--request", "request.json"]), "request.json");
  assert.throws(() => parseArgs([]), /usage/u);
  assert.throws(() => parseArgs(["--request", "a", "extra"]), /usage/u);
});
