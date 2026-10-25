// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import test from "node:test";
import { appendFileSync, chmodSync, existsSync, linkSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { gitleaksContentAuthorityLine } from "./security-adapters/gitleaks.mjs";
import { run } from "./security-adapters/gitleaks.mjs";
import { repairStaleIgnoreEntry } from "./gitleaks-repair-ignore.mjs";

const CLI = fileURLToPath(new URL("./gitleaks-repair-ignore.mjs", import.meta.url));
const VALUE = "playgame.example-studio.example";
test("public CLI requires current exact-value reproduction before mutating a stale ignore", async () => {
  const root = mkdtempSync(join(tmpdir(), "r3-public-cli-"));
  const env = { ...process.env };
  try {
    mkdirSync(join(root, "scratch"));
    mkdirSync(join(root, "src"));
    const input = join(root, "src", "game.js");
    writeFileSync(input, `\n\n\ndomain=${VALUE}\n`);
    const review = join(root, "scratch", "reviewed-domain.txt");
    const gateFile = join(root, "scratch", "gate.json");
    writeFileSync(review, VALUE);
    const stale = gitleaksContentAuthorityLine({ File: "src/game.js", RuleID: "generic-api-key",
      StartLine: 2, StartColumn: 8, Secret: VALUE });
    const ignore = join(root, ".gitleaksignore");
    writeFileSync(ignore, `${stale}\n`);
    const direct = await repairStaleIgnoreEntry({ rootDir: root, path: "src/game.js",
      rule: "generic-api-key", column: 8, oldLine: 2 });
    assert.equal(direct.ok, false);
    assert.match(direct.reason, /reproduction gate required/u);
    const fake = join(root, "scratch", "fixture-scanner");
    writeFileSync(fake, `#!/usr/bin/env node\nconst fs=require('fs');const path=require('path');const a=process.argv.slice(2);const out=a[a.indexOf('--report-path')+1];const source=a[a.indexOf('--source')+1];fs.writeFileSync(out,JSON.stringify([{File:path.join(source,'src/game.js'),RuleID:'generic-api-key',StartLine:4,StartColumn:8,Secret:'${VALUE}',Description:'Generic API Key'}]));\n`);
    chmodSync(fake, 0o755);
    env.PIPELINE_GITLEAKS_PATH = fake;
    const shared = ["--root", root, "--path", "src/game.js", "--rule", "generic-api-key", "--column", "8",
      "--reviewed-value-file", review, "--gate-file", gateFile];
    const call = flags => spawnSync(process.execPath, [CLI, ...flags, ...shared], { env, cwd: root, encoding: "utf8" });
    const missing = call(["--old-line", "2"]);
    assert.equal(missing.status, 1);
    assert.equal(readFileSync(ignore, "utf8"), `${stale}\n`);
    const prepared = call(["--prepare-gate", "--line", "4"]);
    assert.equal(prepared.status, 0, prepared.stderr);
    assert.equal(existsSync(gateFile), true);
    assert.doesNotMatch(readFileSync(gateFile, "utf8"), /playgame\.example-studio/u);
    const gate = readFileSync(gateFile, "utf8");
    writeFileSync(gateFile, "{}\n");
    assert.equal(call(["--old-line", "2"]).status, 1);
    assert.equal(readFileSync(ignore, "utf8"), `${stale}\n`);
    writeFileSync(gateFile, gate.replace(/"inputSha256": "[a-f0-9]{64}"/u, `"inputSha256": "${"0".repeat(64)}"`));
    assert.equal(call(["--old-line", "2"]).status, 1);
    assert.equal(readFileSync(ignore, "utf8"), `${stale}\n`);
    writeFileSync(gateFile, gate);
    writeFileSync(input, `\n\n\nchanged=${VALUE}\n`);
    assert.equal(call(["--old-line", "2"]).status, 1);
    assert.equal(readFileSync(ignore, "utf8"), `${stale}\n`);
    writeFileSync(input, `\n\n\ndomain=${VALUE}\n`);
    const repaired = call(["--old-line", "2"]);
    assert.equal(repaired.status, 0, repaired.stderr);
    assert.notEqual(readFileSync(ignore, "utf8"), `${stale}\n`);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("explicit new suppression admits only the reproduced domain and retains credential finding", async () => {
  const root = mkdtempSync(join(tmpdir(), "r3-new-cli-"));
  try {
    mkdirSync(join(root, "scratch")); mkdirSync(join(root, "src"));
    writeFileSync(join(root, "src", "game.js"), `domain=${VALUE}\n`);
    const review = join(root, "scratch", "review.txt");
    const gateFile = join(root, "scratch", "gate.json");
    writeFileSync(review, VALUE);
    const fake = join(root, "scratch", "fixture-scanner");
    writeFileSync(fake, `#!/usr/bin/env node\nconst fs=require('fs');const path=require('path');const a=process.argv.slice(2);const source=a[a.indexOf('--source')+1];fs.writeFileSync(a[a.indexOf('--report-path')+1],JSON.stringify([{File:path.join(source,'src/game.js'),RuleID:'generic-api-key',StartLine:1,StartColumn:8,Secret:'${VALUE}'},{File:path.join(source,'src/game.js'),RuleID:'aws-access-token',StartLine:1,StartColumn:8,Secret:'AKIAIOSFODNN7EXAMPLE'}]));\n`);
    chmodSync(fake, 0o755);
    const env = { ...process.env, PIPELINE_GITLEAKS_PATH: fake };
    const shared = ["--root", root, "--path", "src/game.js", "--rule", "generic-api-key",
      "--line", "1", "--column", "8", "--reviewed-value-file", review, "--gate-file", gateFile];
    const call = action => spawnSync(process.execPath, [CLI, action, ...shared], { env, cwd: root, encoding: "utf8" });
    assert.equal(call("--approve-new").status, 1);
    assert.equal(existsSync(join(root, ".gitleaksignore")), false);
    assert.equal(call("--prepare-gate").status, 0);
    assert.equal(call("--approve-new").status, 0);
    const result = await run({ rootDir: root, config: { binaryPath: fake } });
    assert.equal(result.status, "FINDINGS");
    assert.equal(result.ignored.findingCount, 1);
    assert.deepEqual(result.findings.map(f => f.rule), ["aws-access-token"]);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("public approval refuses a hardlinked ignore without touching its other name", () => {
  const root = mkdtempSync(join(tmpdir(), "r3-hardlink-cli-"));
  try {
    mkdirSync(join(root, "scratch")); mkdirSync(join(root, "src"));
    writeFileSync(join(root, "src", "game.js"), `domain=${VALUE}\n`);
    const review = join(root, "scratch", "review.txt");
    const gateFile = join(root, "scratch", "gate.json");
    const alias = join(root, "scratch", "foreign.txt");
    writeFileSync(review, VALUE); writeFileSync(alias, "# foreign\n");
    linkSync(alias, join(root, ".gitleaksignore"));
    const fake = join(root, "scratch", "fixture-scanner");
    writeFileSync(fake, `#!/usr/bin/env node\nconst fs=require('fs');const path=require('path');const a=process.argv.slice(2);const source=a[a.indexOf('--source')+1];fs.writeFileSync(a[a.indexOf('--report-path')+1],JSON.stringify([{File:path.join(source,'src/game.js'),RuleID:'generic-api-key',StartLine:1,StartColumn:8,Secret:'${VALUE}'}]));\n`);
    chmodSync(fake, 0o755);
    const env = { ...process.env, PIPELINE_GITLEAKS_PATH: fake };
    const shared = ["--root", root, "--path", "src/game.js", "--rule", "generic-api-key",
      "--line", "1", "--column", "8", "--reviewed-value-file", review, "--gate-file", gateFile];
    const call = action => spawnSync(process.execPath, [CLI, action, ...shared], { env, cwd: root, encoding: "utf8" });
    assert.equal(call("--prepare-gate").status, 0);
    assert.equal(call("--approve-new").status, 1);
    assert.equal(readFileSync(alias, "utf8"), "# foreign\n");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("public stale repair refuses linked destination and stale ignore, input or scanner facts", () => {
  for (const kind of ["hardlink", "symlink", "ignore-drift", "input-drift", "binary-drift"]) {
    const root = mkdtempSync(join(tmpdir(), `r3-repair-${kind}-`));
    try {
      mkdirSync(join(root, "scratch")); mkdirSync(join(root, "src"));
      const source = join(root, "src", "game.js");
      writeFileSync(source, `\n\n\ndomain=${VALUE}\n`);
      const review = join(root, "scratch", "review.txt");
      const gateFile = join(root, "scratch", "gate.json");
      writeFileSync(review, VALUE);
      const stale = `${gitleaksContentAuthorityLine({ File: "src/game.js", RuleID: "generic-api-key", StartLine: 2, StartColumn: 8, Secret: VALUE })}\n`;
      const ignore = join(root, ".gitleaksignore");
      const alias = join(root, "scratch", "foreign.txt");
      if (kind === "hardlink") { writeFileSync(alias, stale); linkSync(alias, ignore); }
      else writeFileSync(ignore, stale);
      const fake = join(root, "scratch", "fixture-scanner");
      writeFileSync(fake, `#!/usr/bin/env node\nconst fs=require('fs');const path=require('path');const a=process.argv.slice(2);const source=a[a.indexOf('--source')+1];fs.writeFileSync(a[a.indexOf('--report-path')+1],JSON.stringify([{File:path.join(source,'src/game.js'),RuleID:'generic-api-key',StartLine:4,StartColumn:8,Secret:'${VALUE}'}]));\n`);
      chmodSync(fake, 0o755);
      const env = { ...process.env, PIPELINE_GITLEAKS_PATH: fake };
      const shared = ["--root", root, "--path", "src/game.js", "--rule", "generic-api-key",
        "--column", "8", "--reviewed-value-file", review, "--gate-file", gateFile];
      const call = flags => spawnSync(process.execPath, [CLI, ...flags, ...shared], { env, cwd: root, encoding: "utf8" });
      assert.equal(call(["--prepare-gate", "--line", "4"]).status, 0, kind);
      if (kind === "symlink") { writeFileSync(alias, stale); unlinkSync(ignore); symlinkSync(alias, ignore); }
      if (kind === "ignore-drift") appendFileSync(ignore, "# changed\n");
      if (kind === "input-drift") appendFileSync(source, "# changed\n");
      if (kind === "binary-drift") appendFileSync(fake, "// changed\n");
      const before = readFileSync(ignore);
      assert.equal(call(["--old-line", "2"]).status, 1, kind);
      assert.deepEqual(readFileSync(ignore), before, kind);
      if (kind === "hardlink" || kind === "symlink") assert.equal(readFileSync(alias, "utf8"), stale, kind);
    } finally { rmSync(root, { recursive: true, force: true }); }
  }
});

test("public repair rechecks physical facts after its own scanner returns", () => {
  for (const kind of ["ignore", "input", "binary"]) {
    const root = mkdtempSync(join(tmpdir(), `r3-after-scan-${kind}-`));
    try {
      mkdirSync(join(root, "scratch")); mkdirSync(join(root, "src"));
      writeFileSync(join(root, "src", "game.js"), `\n\n\ndomain=${VALUE}\n`);
      const review = join(root, "scratch", "review.txt");
      const gateFile = join(root, "scratch", "gate.json");
      writeFileSync(review, VALUE);
      const stale = `${gitleaksContentAuthorityLine({ File: "src/game.js", RuleID: "generic-api-key", StartLine: 2, StartColumn: 8, Secret: VALUE })}\n`;
      const ignore = join(root, ".gitleaksignore");
      writeFileSync(ignore, stale);
      const fake = join(root, "scratch", "fixture-scanner");
      writeFileSync(fake, `#!/usr/bin/env node\nconst fs=require('fs');const path=require('path');const a=process.argv.slice(2);const source=a[a.indexOf('--source')+1];const countFile=path.join(source,'scratch/count');let n=0;try{n=Number(fs.readFileSync(countFile,'utf8'))}catch{}n++;fs.writeFileSync(countFile,String(n));fs.writeFileSync(a[a.indexOf('--report-path')+1],JSON.stringify([{File:path.join(source,'src/game.js'),RuleID:'generic-api-key',StartLine:4,StartColumn:8,Secret:'${VALUE}'}]));if(n===3){const target=${JSON.stringify(kind)}==='ignore'?path.join(source,'.gitleaksignore'):${JSON.stringify(kind)}==='input'?path.join(source,'src/game.js'):process.argv[1];fs.appendFileSync(target,'# drift\\n');}\n`);
      chmodSync(fake, 0o755);
      const env = { ...process.env, PIPELINE_GITLEAKS_PATH: fake };
      const shared = ["--root", root, "--path", "src/game.js", "--rule", "generic-api-key",
        "--column", "8", "--reviewed-value-file", review, "--gate-file", gateFile];
      const call = flags => spawnSync(process.execPath, [CLI, ...flags, ...shared], { env, cwd: root, encoding: "utf8" });
      assert.equal(call(["--prepare-gate", "--line", "4"]).status, 0, kind);
      assert.equal(call(["--old-line", "2"]).status, 1, kind);
      assert.equal(readFileSync(ignore, "utf8"), kind === "ignore" ? `${stale}# drift\n` : stale, kind);
    } finally { rmSync(root, { recursive: true, force: true }); }
  }
});
