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

import { execFileSync } from "node:child_process";
import { CORE_BASELINE_PACK_ID, resolveNamedOrganizationPolicyPack } from "../lib/organization-policy.mjs";
import { planFeatureCloseAudit } from "../lib/feature-close-audit-preflight.mjs";
import { planFeaturePackageTransition } from "../lib/feature-package-topology.mjs";
import { sha256CanonicalJson } from "../lib/plan-spec-state-v2.mjs";
import { planVerifySelection } from "../lib/verify-selection.mjs";
import { addVerifyEvidence } from "../lib/feature-package-registration.mjs";
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

// ---- Feature-close audit route, package side: register the Verify evidence, bind the candidate, complete --------------------
//
// No shipped verb set `manifest.candidate` or registered the Verify evidence, so a package could not reach `completed` and the
// audit route (`planFeatureCloseAudit`) could not be planned for a consumer (Toolbox, 2026-11-01). These cases walk the new
// route with real git, real registration and the real plan/apply verbs, and end in the audit preflight accepting the package.

const AUDIT_ID = "audit-pkg";
const gitIn = (root, args) => execFileSync("git", ["-C", root, ...args], { encoding: "utf8", env: { ...process.env, GIT_AUTHOR_NAME: "Fixture", GIT_AUTHOR_EMAIL: "fixture@example.invalid", GIT_COMMITTER_NAME: "Fixture", GIT_COMMITTER_EMAIL: "fixture@example.invalid" } }).trim();

function auditFixture() {
  const root = mkdtempSync(join(tmpdir(), "vc-pkg-"));
  gitIn(root, ["init", "-q"]);
  const base = `specs/${AUDIT_ID}`;
  mkdirSync(join(root, base), { recursive: true });
  const entries = [["prd", "prd.md", true, "mutable"], ["spec", "spec.md", true, "mutable"], ["acceptance", "acceptance.md", false, "mutable"], ["result", "result.md", false, "mutable"], ["candidate-evidence", "envelope.json", false, "immutable"]].map(([klass, name, authority, mutability]) => {
    const bytes = `${klass} of ${AUDIT_ID}\n`;
    writeFileSync(join(root, base, name), bytes);
    return { class: klass, path: `${base}/${name}`, sha256: sha256Hex(bytes), authority, mutability, retention: "active" };
  });
  const manifestRel = `${base}/lifecycle.json`;
  const manifest = { schema: "pipeline.feature-package.v1", feature: { id: AUDIT_ID, rigor: 1 }, state: "implementing", artifacts: entries, candidate: null, supersedes: null };
  const save = () => writeFileSync(join(root, manifestRel), `${JSON.stringify(manifest, null, 2)}\n`);
  save();
  gitIn(root, ["add", "-A"]);
  gitIn(root, ["commit", "-qm", "work"]);
  const head = () => ({ commit: gitIn(root, ["rev-parse", "HEAD"]), tree: gitIn(root, ["rev-parse", "HEAD^{tree}"]) });
  const evidence = (name, overrides = {}) => {
    const candidate = head();
    const value = { schema: "pipeline.verify-evidence.v0", ...candidate, candidate, exitCode: 0, selection: planVerifySelection({ mode: "candidate", candidateCommit: candidate.commit, registeredSuiteIds: ["test"], policy: { schema: "pipeline.verify-selection.v1", baseline: ["test"], areas: [{ id: "all", paths: ["**"], suites: ["test"] }] } }), ...overrides };
    writeFileSync(join(root, base, name), JSON.stringify(value));
    return `${base}/${name}`;
  };
  const readManifest = () => readFileSync(join(root, manifestRel), "utf8");
  return { root, base, manifestRel, manifest, head, evidence, readManifest, state: { activeFeature: { id: AUDIT_ID } } };
}

test("Verify evidence registration: a passing candidate-bound file becomes immutable non-authority candidate evidence, once", () => {
  const f = auditFixture();
  try {
    const path = f.evidence("verify.json");
    const added = addVerifyEvidence({ root: f.root, state: f.state, path });
    assert.equal(added.status, "verify-evidence-added", JSON.stringify(added));
    const entry = JSON.parse(f.readManifest()).artifacts.find((a) => a.path === path);
    assert.deepEqual({ class: entry.class, authority: entry.authority, mutability: entry.mutability, retention: entry.retention }, { class: "candidate-evidence", authority: false, mutability: "immutable", retention: "retain" });
    assert.equal(entry.sha256, sha256Hex(readFileSync(join(f.root, path))));
    assert.match(added.next, /do NOT commit/u);
    const before = f.readManifest();
    assert.equal(addVerifyEvidence({ root: f.root, state: f.state, path }).status, "already-registered");
    assert.equal(f.readManifest(), before, "registering the same bytes twice rewrites nothing");
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("Verify evidence registration refuses what cannot qualify a candidate and never touches the manifest", () => {
  const f = auditFixture();
  try {
    const before = f.readManifest();
    const bad = { commit: "f".repeat(40), tree: "e".repeat(40) };
    const cases = [
      ["outside the package directory", () => { writeFileSync(join(f.root, "loose.json"), "{}"); return "loose.json"; }, "FPR-VERIFY-PATH"],
      ["missing file", () => `${f.base}/absent.json`, "FPR-VERIFY-PATH"],
      ["not JSON", () => { writeFileSync(join(f.root, f.base, "text.json"), "no"); return `${f.base}/text.json`; }, "FPR-VERIFY-SCHEMA"],
      ["another schema", () => f.evidence("schema.json", { schema: "pipeline.verify-evidence.v9" }), "FPR-VERIFY-SCHEMA"],
      ["a failed run", () => f.evidence("failed.json", { exitCode: 1 }), "FPR-VERIFY-NOT-PASSING"],
      ["a candidate no commit of this repository has", () => f.evidence("ghost.json", { ...bad, candidate: bad }), "FPR-VERIFY-CANDIDATE"],
      ["a commit field that differs from the candidate", () => f.evidence("split.json", { commit: bad.commit }), "FPR-VERIFY-CANDIDATE"],
    ];
    for (const [label, make, code] of cases) {
      const refused = addVerifyEvidence({ root: f.root, state: f.state, path: make() });
      assert.equal(refused.status, "refused", label);
      assert.equal(refused.code, code, `${label}: ${JSON.stringify(refused)}`);
      assert.equal(f.readManifest(), before, `${label}: the manifest is untouched`);
    }
    const path = f.evidence("again.json");
    assert.equal(addVerifyEvidence({ root: f.root, state: f.state, path }).status, "verify-evidence-added");
    writeFileSync(join(f.root, path), JSON.stringify({ schema: "pipeline.verify-evidence.v0", changed: true }));
    assert.equal(addVerifyEvidence({ root: f.root, state: f.state, path }).code, "FPR-VERIFY-IMMUTABLE", "registered evidence is never replaced");
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("entering verifying binds the candidate only to the HEAD a registered passing Verify evidence names", () => {
  const f = auditFixture();
  const plan = (head) => planFeaturePackageTransition(f.root, f.manifestRel, "verifying", head === undefined ? {} : { head });
  try {
    assert.equal(plan().reason, "head-unresolved", "no HEAD, no candidate");
    const missing = plan(f.head());
    assert.equal(missing.status, "rejected");
    assert.equal(missing.reason, "verify-evidence-required");
    assert.match(missing.findings.join(" "), /--add-verify-evidence/u, "the refusal names the route");
    assert.equal(addVerifyEvidence({ root: f.root, state: f.state, path: f.evidence("verify.json") }).status, "verify-evidence-added");
    const preview = plan(f.head());
    assert.equal(preview.status, "preview", JSON.stringify(preview));
    assert.deepEqual(preview.candidate, f.head());
    assert.equal(preview.changes[0].operation, "set-candidate-and-state");
    gitIn(f.root, ["commit", "--allow-empty", "-qm", "later"]);
    assert.equal(plan(f.head()).reason, "verify-evidence-required", "evidence for an older commit does not qualify the new HEAD");
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("a package with no candidate walks implementing -> verifying -> completed and the audit preflight plans it (the Toolbox chain)", async () => {
  const f = auditFixture();
  const apply = (nextState) => {
    const planned = captureLog(() => run(["feature-package-plan", "--root", f.root, "--manifest", f.manifestRel, "--next-state", nextState]));
    assert.equal(planned.value, 0, planned.out);
    const { planSha256, ...plan } = JSON.parse(planned.logs.at(-1));
    assert.equal(planSha256, sha256CanonicalJson(plan), "the plan prints the digest apply expects");
    const applied = captureLog(() => run(["feature-package-apply", "--root", f.root, "--manifest", f.manifestRel, "--next-state", nextState, "--plan-sha256", planSha256]));
    assert.equal(applied.value, 0, applied.out);
    return JSON.parse(applied.logs.at(-1));
  };
  try {
    const path = f.evidence("verify.json");
    const head = f.head();
    assert.equal(addVerifyEvidence({ root: f.root, state: f.state, path }).status, "verify-evidence-added");
    assert.equal(apply("verifying").status, "applied");
    const verifying = JSON.parse(f.readManifest());
    assert.equal(verifying.state, "verifying");
    assert.deepEqual(verifying.candidate, head, "the candidate is the HEAD the evidence names");
    assert.equal(apply("completed").status, "applied");
    assert.equal(JSON.parse(f.readManifest()).state, "completed");
    assert.deepEqual(f.head(), head, "nothing was committed on the way");
    const audit = await planFeatureCloseAudit({ repositoryRoot: f.root, featureId: AUDIT_ID, candidate: head, manifestPath: f.manifestRel, coreVersion: "0.7.0", packs: [resolveNamedOrganizationPolicyPack(CORE_BASELINE_PACK_ID)] });
    assert.equal(audit.status, "build-required", JSON.stringify(audit));
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});
