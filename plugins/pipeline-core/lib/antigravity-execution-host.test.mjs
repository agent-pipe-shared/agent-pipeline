import { discoverAgyPath, invokeAgy, AGY_ERROR_TAXONOMY, parseAgyOutput } from "./antigravity-execution-host.mjs";
import { writeFileSync, chmodSync, rmSync, mkdirSync } from "fs";
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

// 3. Test execution simulation
const root = join(tmpdir(), "test-agy-exec-");
try {
  mkdirSync(root, { recursive: true });
  const mockAgy = join(root, "agy-mock");
  writeFileSync(mockAgy, `#!/usr/bin/env node
const args = process.argv.slice(2);
if (args.includes("--timeout-test")) {
  setTimeout(() => {}, 5000);
} else if (args.includes("--auth-test")) {
  console.error("Please login to Vertex");
  process.exit(1);
} else if (args.includes("--fail-test")) {
  process.exit(2);
} else if (args.includes("--malformed-test")) {
  console.log("no json for you");
} else {
  console.log(JSON.stringify({ result: "done", usage: { input_tokens: 5, output_tokens: 10, cached_tokens: 0 }}));
}
`);
  chmodSync(mockAgy, 0o755);

  (async () => {
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
    
    console.log(`\n${passed}/${passed + failed} checks passed.`);
    process.exit(failed === 0 ? 0 : 1);
  })();

} catch(e) {
  console.error(e);
  process.exit(1);
} finally {
  setTimeout(() => rmSync(root, { recursive: true, force: true }), 1000);
}
