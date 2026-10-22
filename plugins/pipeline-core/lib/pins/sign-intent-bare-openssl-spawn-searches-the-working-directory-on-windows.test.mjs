// SPDX-License-Identifier: SUL-1.0
// Pin: pipeline.sign-intent-bare-openssl-spawn-searches-the-working-directory-on-windows.
// The signing spawn must never start an executable placed in its working directory, and must carry an
// explicit cwd and a child environment that disables the current-directory lookup on win32.
//
// What this pin does NOT prove: the Windows libuv lookup itself (a bare name resolved against the child
// cwd before PATH) can only be observed on a native Windows host. Here the POSIX equivalent is driven: a
// PATH that names the working directory ("." and an empty entry) makes a bare-name spawn start the decoy,
// the real spawn must not. The win32 dialect is driven through the documented `spawn` seam, which shows the
// environment and cwd the child would receive, not what Windows then does with them. Native run: pending.
import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import { resolveOpensslExecutable, spawnOpenssl } from "../../scripts/po-human-approval.mjs";

const WIN = process.platform === "win32";
const fresh = (label) => realpathSync(mkdtempSync(join(tmpdir(), `pin-sign-cwd-${label}-`)));
const executable = (path, body) => { writeFileSync(path, body); chmodSync(path, 0o755); };
const POSIX_ONLY = WIN ? "host-limitation: the decoy is a POSIX script with mode bits; owner Coordinator, due 2026-11-04 (native Windows run, see header)" : false;
const withPath = (value, run) => {
  const saved = process.env.PATH;
  process.env.PATH = value;
  try { return run(); } finally { process.env.PATH = saved; }
};

test("decoy script in the working directory: a bare-name spawn starts it, the real signing spawn does not (positive control + subject)", { skip: POSIX_ONLY }, (t) => {
  const tool = fresh("tool"), decoyDir = fresh("decoy"), aux = fresh("aux");
  t.after(() => { for (const dir of [tool, decoyDir, aux]) rmSync(dir, { recursive: true, force: true }); });
  const marker = join(aux, "marker.txt");
  // The "real" openssl outside every repository answers `version`; the decoy sits in the cwd and writes a marker.
  executable(join(tool, "openssl"), "#!/bin/sh\necho OpenSSL-pin-stand-in\nexit 0\n");
  executable(join(decoyDir, "openssl"), `#!/bin/sh\nprintf 'decoy-started\\n' >> "${marker}"\nexit 0\n`);
  const lookup = ["", ".", tool].join(delimiter);
  // The tool directory must qualify as 'outside every repository'; if this host's tmpdir lies inside one, the resolver
  // (correctly) declines it and the case cannot be driven here.
  const resolved = resolveOpensslExecutable({ env: { PATH: tool }, platform: process.platform });
  if (resolved !== join(tool, "openssl")) { t.skip("host-limitation: tmpdir lies inside a Git repository; owner Coordinator, due 2026-11-04"); return; }

  withPath(lookup, () => { spawnSync("openssl", ["version"], { cwd: decoyDir, stdio: "pipe" }); });
  assert.equal(existsSync(marker), true, "harness defect: a bare-name lookup with the working directory on PATH must reach the decoy");
  rmSync(marker, { force: true });

  const result = withPath(lookup, () => spawnOpenssl(["version"], { cwd: decoyDir, stdio: "pipe", encoding: "utf8" }, {}));
  assert.equal(existsSync(marker), false, "the decoy in the working directory was started by the signing spawn");
  assert.equal(result.status, 0, `the resolved stand-in must have run: ${result.error?.code ?? result.stderr}`);
  assert.match(String(result.stdout), /OpenSSL-pin-stand-in/u);
});

test("RED mirror: a spawn that names the bare executable the way the old code did is caught by the same decoy", { skip: POSIX_ONLY }, (t) => {
  const decoyDir = fresh("mirror"), aux = fresh("mirror-aux");
  t.after(() => { for (const dir of [decoyDir, aux]) rmSync(dir, { recursive: true, force: true }); });
  const marker = join(aux, "marker.txt");
  executable(join(decoyDir, "openssl"), `#!/bin/sh\nprintf 'decoy-started\\n' >> "${marker}"\nexit 0\n`);
  const oldSpawn = () => spawnSync("openssl", ["version"], { cwd: decoyDir, stdio: "pipe", shell: false });
  withPath(["", ".", process.env.PATH].join(delimiter), oldSpawn);
  assert.equal(existsSync(marker), true, "the detector must fire for the pre-fix spelling");
});

test("signing spawn cwd and environment through the documented seam: explicit cwd is passed unchanged, shell is off, win32 sets NoDefaultCurrentDirectoryInExePath", () => {
  const calls = [];
  const spawn = (executableName, args, options) => { calls.push({ executableName, args, options }); return { status: 0 }; };
  const keyDirectory = fresh("keys");
  try {
    for (const platform of ["win32", "linux"]) {
      spawnOpenssl(["pkeyutl", "-sign"], { cwd: keyDirectory, stdio: "inherit" }, { platform, spawn });
    }
    assert.equal(calls.length, 2);
    for (const call of calls) {
      assert.equal(call.executableName, "openssl", "the injected seam keeps the constant name; the real spawn resolves an absolute path");
      assert.equal(call.options.cwd, keyDirectory, "the signing spawn keeps its explicit working directory");
      assert.equal(call.options.shell, false);
      assert.equal(call.options.stdio, "inherit");
    }
    assert.equal(calls[0].options.env.NoDefaultCurrentDirectoryInExePath, "1", "win32 child environment disables the current-directory lookup");
    assert.equal(calls[1].options.env.NoDefaultCurrentDirectoryInExePath, process.env.NoDefaultCurrentDirectoryInExePath, "other platforms pass the inherited value through unchanged");
  } finally { rmSync(keyDirectory, { recursive: true, force: true }); }
});

test("resolver contract behind the spawn: relative, empty and dot PATH entries never select a working-directory copy", { skip: POSIX_ONLY }, (t) => {
  const decoyDir = fresh("resolver");
  t.after(() => rmSync(decoyDir, { recursive: true, force: true }));
  executable(join(decoyDir, "openssl"), "#!/bin/sh\nexit 0\n");
  const previous = process.cwd();
  process.chdir(decoyDir);
  try {
    const found = resolveOpensslExecutable({ env: { PATH: ["", ".", "relative"].join(delimiter) }, platform: process.platform });
    assert.notEqual(found, join(decoyDir, "openssl"));
  } finally { process.chdir(previous); }
});
