#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

/**
 * Host-context integration control. Run outside an already active Codex
 * sandbox; failure inside that boundary is diagnostic evidence, not a unit
 * test environment for the nested Child/stdio path.
 */

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

function loopback() {
  const server = createServer((socket) => socket.end());
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen({ host: "127.0.0.1", port: 0 }, () => resolve(server));
  });
}

test("fixed host payload preserves stdin/EOF, Child exit and stdout/stderr", async (t) => {
  const root = mkdtempSync(join(tmpdir(), "codex-preflight-control-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const name of ["input", "external", "sensitive", "denied", "output"]) mkdirSync(join(root, name));
  const allowedReadPath = join(root, "input", "allowed.txt");
  const externalReadPath = join(root, "external", "external.txt");
  const sensitiveReadPath = join(root, "sensitive", "synthetic.txt");
  const codexHomePath = join(root, "output", "codex-home");
  mkdirSync(codexHomePath);
  const fakeCodexPath = join(root, "fake-codex");
  writeFileSync(fakeCodexPath, `#!/usr/bin/env node
let sent=false;
process.stdin.on("data",()=>{if(sent)return;sent=true;process.stdout.write(JSON.stringify({id:1,result:{userAgent:"fake/0",codexHome:process.env.CODEX_HOME,platformFamily:"unix",platformOs:"linux"}})+"\\n");});
setInterval(()=>{},1000);
`);
  chmodSync(fakeCodexPath, 0o700);
  writeFileSync(allowedReadPath, "ALLOWED\n"); writeFileSync(externalReadPath, "EXTERNAL\n"); writeFileSync(sensitiveReadPath, "SYNTHETIC\n");
  let server;
  try { server = await loopback(); }
  catch (error) {
    if (error?.code === "EPERM" || error?.code === "EACCES") { t.skip("host-context control requires execution outside an active outer sandbox"); return; }
    throw error;
  }
  t.after(() => server.close());
  const address = server.address();
  const request = Buffer.from(JSON.stringify({
    allowedReadPath,
    externalReadPath,
    sensitiveReadPath,
    deniedWritePath: join(root, "denied", "write.txt"),
    scratchWritePath: join(root, "output", "scratch.txt"),
    codexPath: realpathSync(fakeCodexPath),
    codexHomePath: realpathSync(codexHomePath),
    networkHost: "127.0.0.1",
    networkPort: address.port,
  })).toString("base64url");
  const payloadUrl = new URL("./fixtures/codex-sandbox-preflight-payload.mjs", import.meta.url);
  const control = spawnSync(process.execPath, [fileURLToPath(payloadUrl), request], { input: "INPUT", encoding: "utf8", shell: false });
  assert.equal(control.status, 0);
  const lines = control.stdout.trim().split("\n").map((line) => JSON.parse(line));
  assert.equal(lines[0].type, "started");
  assert.deepEqual({ stdin: lines[1].stdin, eof: lines[1].eof, child: lines[1].child }, { stdin: "SU5QVVQ=", eof: true, child: { status: 7, stdout: "OUT", stderr: "ERR", errorClass: null } });
  assert.deepEqual(lines[1].appServer, { initialized: true, boundedStopObserved: true, errorClass: null });
  assert.deepEqual(lines[1].probes, { allowedRead: "success", externalRead: "success", sensitiveRead: "success", deniedWrite: "success", scratchWrite: "success", network: "success" });
});
