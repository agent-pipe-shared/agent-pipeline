#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * repository-mode-promote.test.mjs -- AC-108 (closest accepted criterion), CGR-19 (C22B, PO decision): one narrow, agent-executable command moves
 * `repositoryMode` from `local-only` to `remote-tracked`, only with a configured remote, writing both calibration twins by a surgical single-token
 * replace. Every other direction and every other target stays on the signed guard-override route and is refused with a typed RMP-* code.
 * Written from that decision, not from the writer's code. The commit-boundary half is in pre-commit-hook-install.test.mjs.
 *
 * Run: node --test plugins/pipeline-core/scripts/repository-mode-promote.test.mjs
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { promoteRepositoryMode, promoteRepositoryModeBytes } from "./repository-mode-promote.mjs";

const SCRIPT = fileURLToPath(new URL("./repository-mode-promote.mjs", import.meta.url));
const TWINS = ["project/pipeline.json", ".claude/pipeline.json"];
const BOM = "﻿";
const roots = [];
process.on("exit", () => { for (const root of roots) rmSync(root, { recursive: true, force: true }); });

const ABSENT = Symbol("absent");
const twin = ({ mode = "local-only", extra = {}, eol = "\n", indent = 2, bom = false } = {}) => {
  const value = mode === ABSENT ?{ project: "p", verify: "node --test t.mjs" } : { project: "p", repositoryMode: mode, verify: "node --test t.mjs", ...extra };
  const text = JSON.stringify(value, null, indent);
  return `${bom ? BOM : ""}${eol === "\n" ? `${text}\n` : `${text.replace(/\n/gu, eol)}${eol}`}`;
};
const flip = (text) => text.replace('"repositoryMode": "local-only"', '"repositoryMode": "remote-tracked"');

function makeRoot({ remote = true, files = {} } = {}) {
  const root = mkdtempSync(join(tmpdir(), "rmp-"));
  roots.push(root);
  assert.equal(spawnSync("git", ["-C", root, "init", "-q", "-b", "main"], { encoding: "utf8" }).status, 0);
  if (remote) assert.equal(spawnSync("git", ["-C", root, "remote", "add", "origin", "https://example.invalid/project.git"], { encoding: "utf8" }).status, 0);
  for (const [path, content] of Object.entries(files)) { mkdirSync(join(root, path, ".."), { recursive: true }); writeFileSync(join(root, path), content); }
  return root;
}
const read = (root, path) => readFileSync(join(root, path));
const run = (...args) => {
  const result = spawnSync(process.execPath, [SCRIPT, ...args], { encoding: "utf8", timeout: 60000 });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr, json: (() => { try { return JSON.parse(result.stdout); } catch { return null; } })() };
};
const snapshot = (root) => Object.fromEntries(TWINS.map((path) => { try { return [path, read(root, path).toString("latin1")]; } catch { return [path, null]; } }));

test("RMP-1: both twins change by the one value token only; CRLF, BOM, indent and key order are kept byte for byte; one JSON result names the paths to commit", () => {
  const before = twin({ eol: "\r\n", indent: 4, bom: true });
  const root = makeRoot({ files: { [TWINS[0]]: before, [TWINS[1]]: before } });
  const result = run("--root", root, "--to", "remote-tracked");
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(result.stdout.trim().split(/\r?\n/u).length, 1, "exactly one JSON line");
  assert.equal(result.json.status, "promoted");
  assert.deepEqual([...result.json.paths].sort(), [...TWINS].sort());
  for (const path of TWINS) {
    assert.deepEqual(read(root, path), Buffer.from(flip(before), "utf8"), `${path}: byte-identical except the value token`);
    assert.deepEqual(JSON.parse(read(root, path).toString("utf8").slice(1)), { ...JSON.parse(before.slice(1)), repositoryMode: "remote-tracked" }, `${path}: the re-parsed result is the old value with only that field changed`);
  }
  assert.deepEqual(readdirSync(join(root, "project")), ["pipeline.json"], "no temporary file is left behind");
  assert.deepEqual(readdirSync(join(root, ".claude")), ["pipeline.json"]);
});

test("RMP-2: a rerun reports unchanged with exit 0 and writes nothing", () => {
  const before = twin();
  const root = makeRoot({ files: { [TWINS[0]]: before, [TWINS[1]]: before } });
  assert.equal(run("--root", root, "--to", "remote-tracked").status, 0);
  const once = snapshot(root);
  const again = run("--root", root, "--to", "remote-tracked");
  assert.equal(again.status, 0);
  assert.equal(again.json.status, "unchanged");
  assert.deepEqual(snapshot(root), once);
});

test("RMP-3: a half-applied state (one twin already remote-tracked) resumes: only the other twin is written, then both agree", () => {
  const before = twin({ eol: "\r\n" });
  const root = makeRoot({ files: { [TWINS[0]]: before, [TWINS[1]]: flip(before) } });
  const result = run("--root", root, "--to", "remote-tracked");
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(result.json.status, "promoted");
  assert.deepEqual(result.json.written, [TWINS[0]], "only the twin that still said local-only was written");
  assert.deepEqual(read(root, TWINS[0]), read(root, TWINS[1]));
});

test("RMP-4: a project with only one existing twin is promoted (the other is simply absent)", () => {
  for (const only of TWINS) {
    const before = twin();
    const root = makeRoot({ files: { [only]: before } });
    const result = run("--root", root, "--to", "remote-tracked");
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.deepEqual(result.json.paths, [only]);
    assert.equal(read(root, only).toString("utf8"), flip(before));
  }
});

const REFUSALS = [
  { name: "host-managed current value", code: "RMP-HOST-MANAGED", route: /guard-human-override/u, build: () => ({ files: { [TWINS[0]]: twin({ mode: "host-managed" }), [TWINS[1]]: twin({ mode: "host-managed" }) } }) },
  { name: "one twin host-managed", code: "RMP-HOST-MANAGED", route: /guard-human-override/u, build: () => ({ files: { [TWINS[0]]: twin(), [TWINS[1]]: twin({ mode: "host-managed" }) } }) },
  { name: "absent current value", code: "RMP-MODE-INVALID", route: /guard-human-override/u, build: () => ({ files: { [TWINS[0]]: twin({ mode: ABSENT }) } }) },
  { name: "invalid current value", code: "RMP-MODE-INVALID", route: /guard-human-override/u, build: () => ({ files: { [TWINS[0]]: twin({ mode: "somewhere" }) } }) },
  { name: "current value of another type", code: "RMP-MODE-INVALID", route: /guard-human-override/u, build: () => ({ files: { [TWINS[0]]: twin({ mode: 7 }) } }) },
  { name: "calibration that does not parse", code: "RMP-CALIBRATION-INVALID", route: /guard-human-override/u, build: () => ({ files: { [TWINS[0]]: "{ not json" } }) },
  { name: "no calibration at all", code: "RMP-NO-CALIBRATION", route: /pipeline\.json/u, build: () => ({ files: {} }) },
  { name: "no configured remote", code: "RMP-NO-REMOTE", route: /git remote add/u, build: () => ({ remote: false, files: { [TWINS[0]]: twin(), [TWINS[1]]: twin() } }) },
  { name: "twins that differ in more than the mode", code: "RMP-TWIN-DRIFT", route: /guard-human-override/u, build: () => ({ files: { [TWINS[0]]: twin(), [TWINS[1]]: twin({ extra: { verify: "node --test other.mjs" } }) } }) },
  { name: "twins that differ only in line endings", code: "RMP-TWIN-DRIFT", route: /guard-human-override/u, build: () => ({ files: { [TWINS[0]]: twin(), [TWINS[1]]: twin({ eol: "\r\n" }) } }) },
  { name: "the token twice (duplicate key)", code: "RMP-TOKEN-NOT-ONE", route: /guard-human-override/u, build: () => ({ files: { [TWINS[0]]: `{ "repositoryMode": "local-only", "repositoryMode": "local-only" }\n` } }) },
  { name: "the key spelled with an escape (no literal token to replace)", code: "RMP-TOKEN-NOT-ONE", route: /guard-human-override/u, build: () => ({ files: { [TWINS[0]]: `{ "repository\\u004dode": "local-only" }\n` } }) },
];
for (const { name, code, route, build } of REFUSALS) {
  test(`RMP-5: refused with ${code}, exit 1, names the remaining route, nothing written: ${name}`, () => {
    const spec = build();
    const root = makeRoot(spec);
    const before = snapshot(root);
    const result = run("--root", root, "--to", "remote-tracked");
    assert.equal(result.status, 1, result.stderr || result.stdout);
    assert.equal(result.json.status, "refused");
    assert.equal(result.json.code, code);
    assert.match(result.json.route, route);
    assert.deepEqual(snapshot(root), before, "the calibration is untouched");
  });
}

test("RMP-6: every other target is refused with RMP-TARGET-UNSUPPORTED and the signed route, whatever the current value", () => {
  for (const to of ["local-only", "host-managed", "Remote-Tracked", "", "x"]) {
    const root = makeRoot({ files: { [TWINS[0]]: twin(), [TWINS[1]]: twin() } });
    const before = snapshot(root);
    const result = run("--root", root, "--to", to);
    assert.equal(result.status, to === "" ? 2 : 1, `--to ${JSON.stringify(to)}: ${result.stderr || result.stdout}`);
    if (to !== "") { assert.equal(result.json.code, "RMP-TARGET-UNSUPPORTED"); assert.match(result.json.route, /guard-human-override/u); }
    assert.deepEqual(snapshot(root), before);
  }
  const reverse = makeRoot({ files: { [TWINS[0]]: twin({ mode: "remote-tracked" }), [TWINS[1]]: twin({ mode: "remote-tracked" }) } });
  assert.equal(run("--root", reverse, "--to", "local-only").json.code, "RMP-TARGET-UNSUPPORTED", "the reverse direction is not offered");
});

test("RMP-7: usage errors exit 2 with a JSON result and write nothing", () => {
  const root = makeRoot({ files: { [TWINS[0]]: twin(), [TWINS[1]]: twin() } });
  const before = snapshot(root);
  for (const args of [[], ["--root", root], ["--to", "remote-tracked"], ["--root", root, "--to", "remote-tracked", "--force"], ["--root", root, "--to", "remote-tracked", "extra"], ["--root", root, "--root", root, "--to", "remote-tracked"], ["--root", join(root, "missing"), "--to", "remote-tracked"]]) {
    const result = run(...args);
    assert.equal(result.status, 2, `${JSON.stringify(args)}: ${result.stderr || result.stdout}`);
    assert.equal(result.json.code, "RMP-USAGE");
  }
  assert.deepEqual(snapshot(root), before);
});

test("RMP-8: a twin that changes between the first read and the write is refused with RMP-PREIMAGE-CHANGED and no twin is written", () => {
  const before = twin();
  const root = makeRoot({ files: { [TWINS[0]]: before, [TWINS[1]]: before } });
  const changed = `${before}\n`;
  const result = promoteRepositoryMode({ root, to: "remote-tracked" }, { beforeWrite: () => writeFileSync(join(root, TWINS[1]), changed) });
  assert.equal(result.status, "refused");
  assert.equal(result.code, "RMP-PREIMAGE-CHANGED");
  assert.equal(read(root, TWINS[0]).toString("utf8"), before, "the first twin was not written");
  assert.equal(read(root, TWINS[1]).toString("utf8"), changed, "the concurrent edit is left as it is");
});

test("RMP-9: promoteRepositoryModeBytes is the one rule: exactly one top-level token, parse-checked, byte-surgical", () => {
  const good = Buffer.from(twin({ eol: "\r\n", bom: true }), "utf8");
  const promoted = promoteRepositoryModeBytes(good);
  assert.equal(promoted.ok, true);
  assert.deepEqual(promoted.bytes, Buffer.from(flip(good.toString("utf8")), "utf8"));
  const nestedOnly = Buffer.from(`{ "project": "p", "nested": { "repositoryMode": "local-only" } }\n`);
  assert.equal(promoteRepositoryModeBytes(nestedOnly).ok, false, "a nested key is not the calibrated mode");
  const nestedToo = Buffer.from(`{ "repositoryMode": "local-only", "nested": { "repositoryMode": "local-only" } }\n`);
  assert.equal(promoteRepositoryModeBytes(nestedToo).code, "RMP-TOKEN-NOT-ONE");
  assert.equal(promoteRepositoryModeBytes(Buffer.from(twin({ mode: "remote-tracked" }))).ok, false, "only local-only is a source value");
  const invalidUtf8 = Buffer.concat([Buffer.from('{ "repositoryMode": "local-only", "note": "'), Buffer.from([0xff, 0xfe]), Buffer.from('" }\n')]);
  assert.equal(promoteRepositoryModeBytes(invalidUtf8).ok, false, "bytes that are not valid UTF-8 JSON are never rewritten");
});
