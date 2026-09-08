// SPDX-License-Identifier: SUL-1.0

import { discoverAgyPath, invokeAgy, AGY_ERROR_TAXONOMY, parseAgyOutput } from "./antigravity-execution-host.mjs";
import { writeFileSync, chmodSync, existsSync, rmSync, mkdtempSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

let passed = 0;
let failed = 0;
function check(name, condition) {
  if (condition) {
    console.log(`PASS ${name}`);
    passed++;
  } else {
    console.error(`FAIL ${name}`);
    failed++;
  }
}

// 2. Test output parsing (streaming NDJSON or extra text)
const mockStdout = `
Some log line
{"status": "running"}
{"result": "success", "usage": {"input_tokens": 10}}
`;
const parsed = parseAgyOutput(mockStdout);
check("EPH02 Parses last valid JSON line", parsed.result === "success" && parsed.usage.input_tokens === 10);

try {
  parseAgyOutput("just some text\nno json here");
  check("EPH03 Rejects malformed output", false);
} catch(e) {
  check("EPH03 Rejects malformed output", e.code === AGY_ERROR_TAXONOMY.OUTPUT_MALFORMED);
}

const mockProgram = `#!/usr/bin/env node
const args = process.argv.slice(2);
if (args.includes("--timeout-test")) {
  setTimeout(() => {}, 5000);
} else if (args.includes("--slow-test")) {
  setTimeout(() => console.log(JSON.stringify({ result: "done", model: "gemini-observed", usage: { input_tokens: 5, output_tokens: 10, cached_tokens: 0 }})), 1200);
} else if (args.includes("--auth-test")) {
  console.error("Please login to Vertex");
  process.exit(1);
} else if (args.includes("--fail-test")) {
  process.exit(2);
} else if (args.includes("--malformed-test")) {
  console.log("no json for you");
} else {
  console.log(JSON.stringify({ result: "done", model: "gemini-observed", usage: { input_tokens: 5, output_tokens: 10, cached_tokens: 0 }}));
}
`;

function createMockFixture(prefix = "test-agy-exec-") {
  const root = mkdtempSync(join(tmpdir(), prefix));
  const mockAgy = join(root, "agy-mock");
  writeFileSync(mockAgy, mockProgram);
  chmodSync(mockAgy, 0o755);
  return { root, mockAgy };
}

async function exerciseFixture(work) {
  const fixture = createMockFixture("test-agy-exec-cleanup-");
  try {
    await work(fixture);
    return { outcome: "success", root: fixture.root };
  } catch {
    return { outcome: "failure", root: fixture.root };
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
}

// 3. Test execution simulation
const { root, mockAgy } = createMockFixture();
try {
  // EPH04: Success
  const res1 = await invokeAgy({ agyPath: mockAgy, prompt: "test", cwd: root, timeoutMs: 1000 });
  check("EPH04 Invokes successfully", res1.ok && res1.payload.result === "done" && res1.payload.usage.input_tokens === 5);

  // EPH05: Auth required
  const res2 = await invokeAgy({ agyPath: mockAgy, prompt: "--auth-test", cwd: root, timeoutMs: 1000 });
  check("EPH05 Detects auth requirement", !res2.ok && res2.code === AGY_ERROR_TAXONOMY.AUTH_REQUIRED);

  // EPH06: Non-zero exit
  const res3 = await invokeAgy({ agyPath: mockAgy, prompt: "--fail-test", cwd: root, timeoutMs: 1000 });
  check("EPH06 Detects non-zero exit", !res3.ok && res3.code === AGY_ERROR_TAXONOMY.NONZERO_EXIT);

  // EPH07: Malformed output
  const res4 = await invokeAgy({ agyPath: mockAgy, prompt: "--malformed-test", cwd: root, timeoutMs: 1000 });
  check("EPH07 Detects malformed output", !res4.ok && res4.code === AGY_ERROR_TAXONOMY.OUTPUT_MALFORMED);

  // EPH08: Timeout
  const res5 = await invokeAgy({ agyPath: mockAgy, prompt: "--timeout-test", cwd: root, timeoutMs: 200 });
  check("EPH08 Detects timeout", !res5.ok && res5.code === AGY_ERROR_TAXONOMY.TIMEOUT);

  // EPH09: Not installed
  const res6 = await invokeAgy({ agyPath: "/does/not/exist/agy", prompt: "test", cwd: root, timeoutMs: 1000 });
  check("EPH09 Detects missing binary", !res6.ok && res6.code === AGY_ERROR_TAXONOMY.NOT_INSTALLED);
  // EPH10: Model mismatch
  const res7 = await invokeAgy({ agyPath: mockAgy, prompt: "test", model: "gemini-requested", cwd: root, timeoutMs: 1000 });
  check("EPH10 Detects model mismatch", !res7.ok && res7.code === AGY_ERROR_TAXONOMY.MODEL_MISMATCH);

  // EPH11: Model match
  const res8 = await invokeAgy({ agyPath: mockAgy, prompt: "test", model: "gemini-observed", cwd: root, timeoutMs: 1000 });
  check("EPH11 Accepts matching model", res8.ok && res8.payload.model === "gemini-observed");

  // EPH12/EPH13: Slow cases cross the old 1 second teardown boundary.
  const res9 = await invokeAgy({ agyPath: mockAgy, prompt: "--slow-test", model: "gemini-requested", cwd: root, timeoutMs: 2500 });
  check("EPH12 Slow model mismatch survives fixture lifetime", !res9.ok && res9.code === AGY_ERROR_TAXONOMY.MODEL_MISMATCH);
  const res10 = await invokeAgy({ agyPath: mockAgy, prompt: "--slow-test", model: "gemini-observed", cwd: root, timeoutMs: 2500 });
  check("EPH13 Slow model match survives fixture lifetime", res10.ok && res10.payload.model === "gemini-observed");

  const cleanupAfterSuccess = await exerciseFixture(async ({ mockAgy: fixtureAgy, root: fixtureRoot }) => {
    const result = await invokeAgy({ agyPath: fixtureAgy, prompt: "test", cwd: fixtureRoot, timeoutMs: 1000 });
    if (!result.ok) throw new Error("fixture success case failed");
  });
  check("EPH14 Cleans fixture after success", cleanupAfterSuccess.outcome === "success" && !existsSync(cleanupAfterSuccess.root));

  const cleanupAfterFailure = await exerciseFixture(async () => {
    throw new Error("expected fixture failure");
  });
  check("EPH15 Cleans fixture after failure", cleanupAfterFailure.outcome === "failure" && !existsSync(cleanupAfterFailure.root));

  const firstFixture = createMockFixture("test-agy-exec-concurrent-");
  const secondFixture = createMockFixture("test-agy-exec-concurrent-");
  try {
    const [firstResult, secondResult] = await Promise.all([
      invokeAgy({ agyPath: firstFixture.mockAgy, prompt: "test", model: "gemini-requested", cwd: firstFixture.root, timeoutMs: 1000 }),
      invokeAgy({ agyPath: secondFixture.mockAgy, prompt: "test", model: "gemini-observed", cwd: secondFixture.root, timeoutMs: 1000 }),
    ]);
    rmSync(firstFixture.root, { recursive: true, force: true });
    const secondAfterFirstCleanup = await invokeAgy({ agyPath: secondFixture.mockAgy, prompt: "test", model: "gemini-observed", cwd: secondFixture.root, timeoutMs: 1000 });
    check("EPH16 Concurrent fixture cleanup is isolated", !existsSync(firstFixture.root) && existsSync(secondFixture.root) && firstResult.code === AGY_ERROR_TAXONOMY.MODEL_MISMATCH && secondResult.ok && secondAfterFirstCleanup.ok);
  } finally {
    rmSync(firstFixture.root, { recursive: true, force: true });
    rmSync(secondFixture.root, { recursive: true, force: true });
  }
} catch(e) {
  console.error(e);
  failed++;
} finally {
  rmSync(root, { recursive: true, force: true });
}

console.log(`\n${passed}/${passed + failed} checks passed.`);
process.exitCode = failed === 0 ? 0 : 1;
