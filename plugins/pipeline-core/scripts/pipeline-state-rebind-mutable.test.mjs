#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
//
// PHX-WP-MUTABLE-REBIND-EXPLICIT-CLI: `feature-package-rebind-mutable` is a deliberate,
// standalone, operator/Elephant-INITIATED CLI verb -- the only place in pipeline-state.mjs
// that ever passes `autoRebindMutable: true` to `validateFeaturePackage`. It must never be
// reachable as a silent side effect of feature-package-apply/-reconcile/-plan/-inspect/
// -status, which stay exactly as unwired as PHX-WP-AUTOREBIND-WRITEPATH-INVESTIGATE-FINISH
// left them. RMb is the single most important test: a mutable-class digest drift rebinds; an
// immutable-class digest drift never does, mirroring the library-level boundary test in
// feature-package-topology.test.mjs.

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { run } from "./pipeline-state.mjs";

function sha256Hex(bytes) { return createHash("sha256").update(bytes).digest("hex"); }

function seedPackage(prefix, id = "rm-pkg") {
  const root = mkdtempSync(join(tmpdir(), `${prefix}-`));
  mkdirSync(join(root, "specs", id), { recursive: true });
  const files = {};
  for (const [key, name, content, authority, mutability] of [
    ["prd", `prd_${id}.md`, `# ${id} PRD\n`, true, "mutable"],
    ["spec", "spec.md", `# ${id} Spec\n`, true, "immutable"],
    ["acceptance", "acceptance.md", `# ${id} Acceptance\n`, false, "mutable"],
    ["result", "Result.md", `# ${id} Result\n`, false, "mutable"],
    ["evidence", "evidence.txt", `evidence for ${id}\n`, false, "immutable"],
  ]) {
    const rel = `specs/${id}/${name}`;
    writeFileSync(join(root, rel), content);
    files[key] = { rel, sha256: sha256Hex(content), authority, mutability };
  }
  const value = {
    schema: "pipeline.feature-package.v1",
    feature: { id, rigor: 1 },
    state: "draft",
    artifacts: [
      { class: "prd", path: files.prd.rel, sha256: files.prd.sha256, authority: true, mutability: "mutable", retention: "active" },
      { class: "spec", path: files.spec.rel, sha256: files.spec.sha256, authority: true, mutability: "immutable", retention: "active" },
      { class: "acceptance", path: files.acceptance.rel, sha256: files.acceptance.sha256, authority: false, mutability: "mutable", retention: "active" },
      { class: "result", path: files.result.rel, sha256: files.result.sha256, authority: false, mutability: "mutable", retention: "active" },
      { class: "candidate-evidence", path: files.evidence.rel, sha256: files.evidence.sha256, authority: false, mutability: "immutable", retention: "active" },
    ],
    candidate: null,
    supersedes: null,
  };
  const manifestRel = `specs/${id}/lifecycle.json`;
  writeFileSync(join(root, manifestRel), `${JSON.stringify(value, null, 2)}\n`);
  return { root, id, manifestRel, files };
}

function captureLog(action) {
  const logs = [];
  const originalLog = console.log;
  console.log = (line) => logs.push(line);
  try {
    const value = action();
    return { value, out: logs.join("\n"), logs };
  } finally {
    console.log = originalLog;
  }
}

test("feature-package-rebind-mutable rebinds a stale MUTABLE-class digest and rewrites the manifest", () => {
  const fx = seedPackage("rm-mutable-drift");
  try {
    const newBytes = `# ${fx.id} PRD (edited)\n`;
    writeFileSync(join(fx.root, fx.files.prd.rel), newBytes);
    const newSha256 = sha256Hex(newBytes);
    const res = captureLog(() => run(["feature-package-rebind-mutable", "--root", fx.root, "--manifest", fx.manifestRel]));
    assert.equal(res.value, 0);
    const report = JSON.parse(res.logs.at(-1));
    assert.equal(report.schema, "pipeline.feature-package-rebind-mutable.v1");
    assert.equal(report.ok, true);
    assert.equal(report.rebindCount, 1);
    assert.equal(report.rebinds[0].path, fx.files.prd.rel);
    assert.equal(report.rebinds[0].from, fx.files.prd.sha256);
    assert.equal(report.rebinds[0].to, newSha256);
    assert.match(res.out, new RegExp(fx.files.prd.rel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    const manifestAfter = JSON.parse(readFileSync(join(fx.root, fx.manifestRel), "utf8"));
    const prdEntry = manifestAfter.artifacts.find((a) => a.path === fx.files.prd.rel);
    assert.equal(prdEntry.sha256, newSha256);
    assert.equal(prdEntry.amendment.previousSha256, fx.files.prd.sha256);
  } finally {
    rmSync(fx.root, { recursive: true, force: true });
  }
});

test("feature-package-rebind-mutable NEVER rebinds an IMMUTABLE-class digest -- boundary test", () => {
  const fx = seedPackage("rm-immutable-drift");
  try {
    writeFileSync(join(fx.root, fx.files.spec.rel), `# ${fx.id} Spec (edited)\n`);
    const res = captureLog(() => run(["feature-package-rebind-mutable", "--root", fx.root, "--manifest", fx.manifestRel]));
    assert.equal(res.value, 2);
    const report = JSON.parse(res.logs.at(-1));
    assert.equal(report.ok, false);
    assert.equal(report.rebindCount, 0);
    assert.equal(report.rebinds.length, 0);
    assert.ok(report.findings.some((f) => f.includes("digest does not bind file bytes")));
    const manifestAfter = JSON.parse(readFileSync(join(fx.root, fx.manifestRel), "utf8"));
    const specEntry = manifestAfter.artifacts.find((a) => a.path === fx.files.spec.rel);
    assert.equal(specEntry.sha256, fx.files.spec.sha256);
    assert.equal(Object.prototype.hasOwnProperty.call(specEntry, "amendment"), false);
  } finally {
    rmSync(fx.root, { recursive: true, force: true });
  }
});

test("feature-package-rebind-mutable is a clean no-op when nothing has drifted", () => {
  const fx = seedPackage("rm-clean");
  try {
    const res = captureLog(() => run(["feature-package-rebind-mutable", "--root", fx.root, "--manifest", fx.manifestRel]));
    assert.equal(res.value, 0);
    const report = JSON.parse(res.logs.at(-1));
    assert.equal(report.ok, true);
    assert.equal(report.rebindCount, 0);
    assert.match(res.out, /No mutable-class artifact needed rebinding/);
  } finally {
    rmSync(fx.root, { recursive: true, force: true });
  }
});

test("feature-package-rebind-mutable refuses fail-closed naming a missing --manifest argument", () => {
  const fx = seedPackage("rm-missing-manifest");
  try {
    let err = "";
    const originalError = console.error;
    console.error = (line) => { err += `${line}\n`; };
    let value;
    try { value = run(["feature-package-rebind-mutable", "--root", fx.root]); }
    finally { console.error = originalError; }
    assert.equal(value, 2);
    assert.match(err, /--manifest/);
  } finally {
    rmSync(fx.root, { recursive: true, force: true });
  }
});

test("feature-package-apply stays unwired for autoRebindMutable -- a mutable-class drift is still refused", () => {
  const fx = seedPackage("rm-apply-unwired");
  try {
    writeFileSync(join(fx.root, fx.files.prd.rel), `# ${fx.id} PRD (edited)\n`);
    const planRes = captureLog(() => run(["feature-package-plan", "--root", fx.root, "--manifest", fx.manifestRel, "--next-state", "approved"]));
    const plan = JSON.parse(planRes.logs.at(-1));
    assert.equal(plan.status, "rejected");
    assert.ok(plan.findings.some((f) => f.includes("digest does not bind file bytes")));
  } finally {
    rmSync(fx.root, { recursive: true, force: true });
  }
});
