#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/** Import-only regression: an installed Phoenix entry must link without checkout harness files. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { registerTestCaseCompletion } from "../lib/test-case-completion.mjs";

function snapshot(root, prefix = "") {
  const entries = [];
  for (const name of readdirSync(join(root, prefix)).sort()) {
    const relative = join(prefix, name);
    const path = join(root, relative);
    const stat = lstatSync(path);
    assert.equal(stat.isSymbolicLink(), false, `standalone fixture must not escape through a symlink: ${relative}`);
    if (stat.isDirectory()) {
      entries.push([relative, "directory"]);
      entries.push(...snapshot(root, relative));
    } else {
      assert.equal(stat.isFile(), true, `unsupported package entry: ${relative}`);
      entries.push([relative, createHash("sha256").update(readFileSync(path)).digest("hex")]);
    }
  }
  return entries;
}

function packageFixture(t, prefix, installedName = "installed") {
  const source = resolve(process.env.PIPELINE_PHOENIX_PACKAGE_ROOT ?? "plugins/pipeline-core");
  const scratch = resolve("scratch/alfred-phoenix-package-regression-fixtures-20261011");
  mkdirSync(scratch, { recursive: true });
  const fixture = mkdtempSync(join(scratch, prefix));
  const owned = lstatSync(fixture);
  t.after(() => {
    const current = lstatSync(fixture);
    assert.equal(current.dev, owned.dev);
    assert.equal(current.ino, owned.ino);
    rmSync(fixture, { recursive: true, force: true });
  });
  const installed = join(fixture, installedName, "pipeline-core");
  cpSync(source, installed, { recursive: true, dereference: false });
  const home = join(fixture, "empty-home");
  mkdirSync(home, { mode: 0o700 });
  // Bootstrap synthetic identity before importing the installed package, including in child Node processes.
  const identity = join(fixture, "synthetic-identity.mjs");
  writeFileSync(identity, `import os from 'node:os'; import {syncBuiltinESMExports} from 'node:module';
    os.userInfo=()=>({username:'synthetic',uid:1000,gid:1000,shell:'/bin/false',homedir:${JSON.stringify(home)}});
    os.homedir=()=>${JSON.stringify(home)}; os.tmpdir=()=>${JSON.stringify(home)};
    process.env.HOME=${JSON.stringify(home)}; process.env.TMPDIR=${JSON.stringify(home)}; syncBuiltinESMExports();`, { mode: 0o600 });
  return { fixture, installed, home, identity, entry: join(installed, "scripts", "phoenix-authority-revision.mjs") };
}

const cases = [{ id: "PHARI001", name: "Phoenix authority revision imports from a standalone real plugin package without writer execution", run: (t) => {
  const {fixture,installed,home,identity,entry}=packageFixture(t,"package-");
  const writer = join(installed, "scripts", "pipeline-state.mjs");
  assert.equal(existsSync(entry), true, "real Phoenix entry must be packaged");
  assert.equal(existsSync(writer), true, "real canonical state writer must be packaged");
  assert.equal(existsSync(join(fixture, "harness")), false, "no external checkout harness may mask the defect");
  const before = snapshot(fixture);
  // No argv are passed to either imported entry, and neither exported run is called.
  // Node permissions deny filesystem writes, reads outside the fixture and child execution.
  const program = `
    const revision = await import(${JSON.stringify(pathToFileURL(entry).href)});
    const writer = await import(${JSON.stringify(pathToFileURL(writer).href)});
    if (typeof revision.run !== "function" || typeof writer.run !== "function") {
      throw new Error("Phoenix and its genuine canonical writer must export run");
    }
    process.stdout.write(JSON.stringify({ revisionRun: typeof revision.run, writerRun: typeof writer.run }) + "\\n");
  `;
  const child = spawnSync(process.execPath, ["--permission", `--allow-fs-read=${fixture}`, "--import", identity, "--input-type=module", "--eval", program], {
    cwd: fixture,
    env: { ...process.env, NODE_OPTIONS: "", HOME: home, USERPROFILE: home },
    encoding: "utf8",
    timeout: 30000,
    maxBuffer: 1024 * 1024,
    shell: false,
  });
  assert.deepEqual(snapshot(fixture), before, "import must leave all fixture bytes and paths unchanged");
  assert.ifError(child.error);
  assert.equal(child.signal, null, `import child terminated: ${child.stderr}`);
  assert.equal(child.status, 0, `standalone Phoenix entry failed to import:\n${child.stderr}`);
  assert.deepEqual(JSON.parse(child.stdout), { revisionRun: "function", writerRun: "function" });
} }, { id: "PHARI002", name: "direct Phoenix CLI entry with URL-escaped installed path reaches usage", run: (t) => {
  const {fixture,home,identity,entry}=packageFixture(t,"space package-","installed #100%");
  const before=snapshot(fixture);
  const child=spawnSync(process.execPath,["--permission",`--allow-fs-read=${fixture}`,"--import",identity,entry],{
    cwd:fixture,env:{...process.env,NODE_OPTIONS:"",HOME:home,USERPROFILE:home},
    encoding:"utf8",timeout:30000,maxBuffer:1024*1024,shell:false});
  assert.ifError(child.error);
  assert.equal(child.signal,null);
  assert.notEqual(child.status,0,"direct CLI must run and reject missing arguments");
  assert.match(child.stderr,/Usage: phoenix-authority-revision\.mjs/);
  assert.deepEqual(snapshot(fixture),before,"invalid direct invocation must leave the package unchanged");
} }, { id: "PHARI003", name: "foreign suffix and absent argv never execute imported Phoenix writer", run: (t) => {
  const {fixture,home,identity,entry}=packageFixture(t,"foreign-");
  // A same-basename file keeps older imported entry guards from throwing on realpath,
  // while retaining a distinct physical identity from the installed Phoenix entry.
  writeFileSync(join(fixture,"phoenix-authority-revision.mjs"),"// foreign suffix fixture\n");
  const before=snapshot(fixture);
  for(const argv of ["phoenix-authority-revision.mjs",null,""]){
    const program=`process.argv[1]=${JSON.stringify(argv)}; const mod=await import(${JSON.stringify(pathToFileURL(entry).href)});
      if(typeof mod.run!=='function')throw new Error('missing run');`;
    const child=spawnSync(process.execPath,["--permission",`--allow-fs-read=${fixture}`,"--import",identity,"--input-type=module","--eval",program],{
      cwd:fixture,env:{...process.env,NODE_OPTIONS:"",HOME:home,USERPROFILE:home},
      encoding:"utf8",timeout:30000,maxBuffer:1024*1024,shell:false});
    assert.ifError(child.error);
    assert.equal(child.signal,null);
    assert.equal(child.status,0,`foreign import triggered CLI: ${child.stderr}`);
    assert.deepEqual(snapshot(fixture),before);
  }
} }];

registerTestCaseCompletion({
  cases,
  fd: Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD ?? 3),
  maxBytes: Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_MAX_BYTES ?? 4096),
});
