// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { validateCriticDiagnostic, inspectCriticVerifyDiagnostic } from "./critic-diagnostic-evidence.mjs";
import { produceCriticDiagnostic } from "./critic-diagnostic-producer.mjs";
import { planVerifySelection, verifyEvidenceSatisfiesBoundary } from "./verify-selection.mjs";

function git(root, args) {
  const result = spawnSync("git", ["-C", root, ...args], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "critic-diagnostic-"));
  git(root, ["init", "-q"]);
  writeFileSync(join(root, "spec.md"), "Frozen specification\n");
  writeFileSync(join(root, "guard.md"), "Frozen guardrail\n");
  writeFileSync(join(root, ".gitignore"), "evidence/\n");
  git(root, ["add", "."]);
  git(root, ["-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-qm", "fixture"]);
  return { root, candidate: { commit: git(root, ["rev-parse", "HEAD"]), tree: git(root, ["rev-parse", "HEAD^{tree}"]) } };
}
const options = f => ({ root: f.root, specPath: "spec.md", guardrailPaths: ["guard.md"], command: [process.execPath, "-e", "console.log('actual targeted diagnostic'); process.exit(1)"], logPath: "evidence/targeted.log" });
test("producer captures real failed targeted result while full Verify remains explicitly not-run", () => {
  const f = fixture();
  try {
    const value = produceCriticDiagnostic(options(f));
    assert.equal(value.targeted.exitCode, 1);
    assert.equal(value.targeted.status, "failed");
    assert.equal(value.fullVerify.status, "not-run");
    assert.deepEqual(value.pending, ["full-verify"]);
    assert.match(readFileSync(join(f.root, value.targeted.log.path), "utf8"), /actual targeted diagnostic/u);
    assert.equal(validateCriticDiagnostic(value, f).targeted.status, "failed");
    for (const boundary of ["candidate", "push", "release"]) assert.equal(verifyEvidenceSatisfiesBoundary(value, boundary), false);
    for (const mutate of [v => { v.extra = true; }, v => { v.candidate.tree = "f".repeat(40); }, v => { v.spec.sha256 = "f".repeat(64); }, v => { v.guardrails[0].sha256 = "f".repeat(64); }, v => { v.targeted.exitCode = 0; }, v => { v.targeted.log.sha256 = "f".repeat(64); }, v => { v.pending = []; }, v => { v.targeted.log.path = "../escape"; }]) {
      const changed = structuredClone(value); mutate(changed);
      assert.throws(() => validateCriticDiagnostic(changed, f));
    }
    writeFileSync(join(f.root, value.targeted.log.path), "tampered");
    assert.throws(() => validateCriticDiagnostic(value, f), /CDI-DIGEST/);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});
test("failed canonical Verify diagnostics preserve selection validation and cannot qualify final boundaries", () => {
  const f = fixture();
  try {
    const value = { schema: "pipeline.verify-evidence.v0", ...f.candidate, exitCode: 1, steps: [{ name: "check", exitCode: 1 }], selection: planVerifySelection({ mode: "critic", candidateCommit: f.candidate.commit, registeredSuiteIds: ["check"], policy: { schema: "pipeline.verify-selection.v1", baseline: ["check"], areas: [{ id: "all", paths: ["**"], suites: ["check"] }] } }) };
    assert.equal(inspectCriticVerifyDiagnostic(value, f.candidate).status, "failed");
    for (const boundary of ["critic", "candidate", "push", "release"]) assert.equal(verifyEvidenceSatisfiesBoundary(value, boundary), false);
    assert.throws(() => inspectCriticVerifyDiagnostic({ ...value, steps: [] }, f.candidate));
    assert.throws(() => inspectCriticVerifyDiagnostic({ ...value, selection: { ...value.selection, selectionSha256: "f".repeat(64) } }, f.candidate));
    mkdirSync(join(f.root, "evidence")); writeFileSync(join(f.root, "evidence/full.json"), JSON.stringify(value));
    const diagnostic = produceCriticDiagnostic({ ...options(f), fullVerifyPath: "evidence/full.json" });
    assert.equal(diagnostic.fullVerify.status, "failed");
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});
test("CLI emits honest evidence and refuses missing execution, stale/dirty input and output overwrite", () => {
  const f = fixture();
  try {
    const script = resolve("plugins/pipeline-core/scripts/critic-diagnostic-evidence.mjs");
    const args = [script, "--root", f.root, "--spec", "spec.md", "--guardrail", "guard.md", "--log", "evidence/cli.log", "--out", "evidence/cli.json", "--", process.execPath, "-e", "process.exit(2)"];
    const result = spawnSync(process.execPath, args, { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).releaseQualified, false);
    assert.equal(JSON.parse(readFileSync(join(f.root, "evidence/cli.json"))).targeted.exitCode, 2);
    assert.notEqual(spawnSync(process.execPath, args).status, 0);
    assert.throws(() => produceCriticDiagnostic({ ...options(f), command: ["pipeline-test-nonexistent-executable"] }));
    writeFileSync(join(f.root, "spec.md"), "dirty");
    assert.throws(() => produceCriticDiagnostic(options(f)), /CDI-DIRTY-CANDIDATE/);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});
// D167-PF78: the producer and the registrar share one location rule.
import * as shared from "./critic-diagnostic-evidence.mjs";
import { addCriticDiagnosticEvidence } from "./feature-package-registration.mjs";
const LOCATION_TABLE = [
  ["evidence/x.json", true], ["specs/my-feature/evidence/x.json", true], ["specs/a1/evidence/sub/x.json", true],
  ["specs/Bad_Id/evidence/x.json", false], ["specs/my-feature/other/x.json", false], ["../evidence/x.json", false],
  ["specs/-bad/evidence/x.json", false], ["specs/a--b/evidence/x.json", false], ["x.json", false], ["specs/my-feature/evidence", false],
];
test("D167-PF78 (1) the producer accepts evidence/ and specs/<id>/evidence/ and refuses the rest and existing files", () => {
  const f = fixture();
  try {
    for (const ok of ["evidence/x.json", "specs/my-feature/evidence/x.json"]) assert.equal(typeof shared.newDiagnosticPath(f.root, ok), "string", ok);
    for (const bad of ["specs/Bad_Id/evidence/x.json", "specs/my-feature/other/x.json", "../evidence/x.json"]) assert.throws(() => shared.newDiagnosticPath(f.root, bad), /CDI-(OUTPUT-PATH|PATH)/u, bad);
    mkdirSync(join(f.root, "specs/my-feature/evidence"), { recursive: true });
    writeFileSync(join(f.root, "specs/my-feature/evidence/old.json"), "x");
    assert.throws(() => shared.newDiagnosticPath(f.root, "specs/my-feature/evidence/old.json"), /CDI-OUTPUT-EXISTS/u);
    assert.throws(() => shared.newDiagnosticPath(f.root, "specs/Bad_Id/evidence/x.json"), /CDI-OUTPUT-PATH/u);
    const value = produceCriticDiagnostic({ ...options(f), logPath: "specs/my-feature/evidence/t.log" });
    assert.equal(value.targeted.log.path, "specs/my-feature/evidence/t.log");
    assert.throws(() => produceCriticDiagnostic({ ...options(f), logPath: "specs/Bad_Id/evidence/t.log" }), /CDI-OUTPUT-PATH/u);
    assert.throws(() => produceCriticDiagnostic({ ...options(f), logPath: "evidence/t2.log", fullVerifyPath: "spec.md" }), /CDI-PATH|CDI-OUTPUT-PATH/u);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});
test("D167-PF78 (4) the shared predicate agrees with the producer for a table of paths and the registrar uses it", () => {
  const f = fixture();
  try {
    assert.equal(typeof shared.diagnosticEvidenceLocation, "function");
    for (const [path, accepted] of LOCATION_TABLE) {
      assert.equal(Boolean(shared.diagnosticEvidenceLocation(path)), accepted, path);
      let producerAccepts = true;
      try { shared.newDiagnosticPath(f.root, path); } catch { producerAccepts = false; }
      assert.equal(producerAccepts, accepted, `producer ${path}`);
    }
    assert.equal(shared.diagnosticEvidenceLocation("specs/my-feature/evidence/x.json").featureId, "my-feature");
    assert.equal(shared.diagnosticEvidenceLocation("evidence/x.json").featureId, null);
    // The registrar refuses the producer-only location and names the shared one.
    const refused = addCriticDiagnosticEvidence({ root: f.root, state: { activeFeature: { id: "my-feature" } }, path: "evidence/x.json" });
    assert.ok(refused.code === "FPR-DIAG-PATH" || refused.code === "FPR-MANIFEST-MISSING", JSON.stringify(refused));
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});
// D41: the evidence route is printed by the help of the producer and the registrar, not only by the refusal text.
// D204 (QG-04 restatement): the route is produce, register before committing, ONE evidence-only commit, rerun the
// preflight. The older two-commit wording named a commit form the admission refuses.
const ROUTE_STEPS = [
  /critic-diagnostic-evidence\.mjs/u,
  /register-feature-package\.mjs --root <root> --add-diagnostic-evidence <path>/u,
  /ONE evidence-only commit/u,
  /critic-dispatch-preflight\.mjs[^\n]*--registration-commit <that commit>/u,
];
function assertRouteInOrder(text) {
  let from = 0;
  for (const step of ROUTE_STEPS) {
    const rest = text.slice(from);
    const m = step.exec(rest);
    assert.ok(m, `route step ${step} missing or out of order in:\n${text}`);
    from += m.index + m[0].length;
  }
}
for (const script of ["critic-diagnostic-evidence.mjs", "register-feature-package.mjs"]) {
  test(`D41 ${script} --help prints the four-step evidence route and exits 0`, () => {
    const result = spawnSync(process.execPath, [resolve("plugins/pipeline-core/scripts", script), "--help"], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    assertRouteInOrder(result.stdout);
  });
}
test("PF97-F1 diagnosticPath accepts a colon and still refuses backslash, controls, absolute and bad segments", () => {
  for (const ok of ["evidence/a:b.log", "src/app/(app)/[slug]/page.tsx", "evidence/x y.json"]) assert.equal(shared.diagnosticPath(ok), ok, ok);
  for (const bad of ["evidence\\x.log", "evidence/a\nb.log", "evidence/a\u0000b.log", "/evidence/x.log", "evidence//x.log", "evidence/../x.log"]) assert.throws(() => shared.diagnosticPath(bad), /CDI-PATH/u, JSON.stringify(bad));
});
test("D41 malformed argv keeps its refusal codes and exit status", () => {
  const producer = spawnSync(process.execPath, [resolve("plugins/pipeline-core/scripts/critic-diagnostic-evidence.mjs"), "--help", "--root", "x"], { encoding: "utf8" });
  assert.equal(producer.status, 1);
  assert.match(producer.stderr, /Usage: critic-diagnostic-evidence/u);
  const missing = spawnSync(process.execPath, [resolve("plugins/pipeline-core/scripts/critic-diagnostic-evidence.mjs"), "--root"], { encoding: "utf8" });
  assert.equal(missing.status, 1);
  const registrar = spawnSync(process.execPath, [resolve("plugins/pipeline-core/scripts/register-feature-package.mjs"), "--help", "extra"], { encoding: "utf8" });
  assert.equal(registrar.status, 2);
  assert.equal(JSON.parse(registrar.stdout).code, "FPR-ARGS");
  const bare = spawnSync(process.execPath, [resolve("plugins/pipeline-core/scripts/register-feature-package.mjs")], { encoding: "utf8" });
  assert.equal(bare.status, 2);
  assert.equal(JSON.parse(bare.stdout).code, "FPR-ARGS");
});
// PF-88 slice 2: --base derives the required guardrails instead of the operator naming them.
import { createHash } from "node:crypto";
const MANIFEST_JSON = ".claude/pipeline.json";
function commitAll(root, message) {
  git(root, ["add", "-f", "."]);
  git(root, ["-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-qm", message]);
  return git(root, ["rev-parse", "HEAD"]);
}
function derivedFixture() {
  const f = fixture();
  mkdirSync(join(f.root, ".claude"), { recursive: true });
  mkdirSync(join(f.root, "governance", "guidelines"), { recursive: true });
  mkdirSync(join(f.root, "governance", "policies"), { recursive: true });
  writeFileSync(join(f.root, ".claude", "pipeline.yaml"), "governance:\n  guidelines_path: governance/guidelines\n  policies_path: governance/policies\n");
  writeFileSync(join(f.root, "governance", "guidelines", "review.md"), "Review changed code.\n");
  writeFileSync(join(f.root, "governance", "policies", "checklist.md"), "- verify\n");
  const base = commitAll(f.root, "base");
  writeFileSync(join(f.root, MANIFEST_JSON), "{}\n");
  const candidate = commitAll(f.root, "change the JSON manifest");
  return { ...f, base, candidate: { commit: candidate, tree: git(f.root, ["rev-parse", "HEAD^{tree}"]) } };
}
const baseOptions = (f, extra = {}) => ({ root: f.root, specPath: "spec.md", guardrailPaths: [], baseRef: f.base, command: [process.execPath, "-e", "process.exit(0)"], logPath: "evidence/derived.log", ...extra });
test("PF88-S2 (i) the CLI with --base and no --guardrail hashes the changed JSON manifest and the output validates", () => {
  const f = derivedFixture();
  try {
    const script = resolve("plugins/pipeline-core/scripts/critic-diagnostic-evidence.mjs");
    const args = [script, "--root", f.root, "--spec", "spec.md", "--base", f.base, "--log", "evidence/d.log", "--out", "evidence/d.json", "--", process.execPath, "-e", "process.exit(0)"];
    const result = spawnSync(process.execPath, args, { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    const value = JSON.parse(readFileSync(join(f.root, "evidence/d.json"), "utf8"));
    const manifest = value.guardrails.find(g => g.path === MANIFEST_JSON);
    assert.ok(manifest, JSON.stringify(value.guardrails));
    assert.equal(manifest.sha256, createHash("sha256").update("{}\n").digest("hex"));
    assert.ok(value.guardrails.some(g => g.path === ".claude/pipeline.yaml"));
    assert.doesNotThrow(() => validateCriticDiagnostic(value, { root: f.root, candidate: f.candidate, spec: value.spec, guardrails: value.guardrails }));
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});
test("PF88-S2 (ii) explicit --guardrail plus derived is a deduplicated sorted union", () => {
  const f = derivedFixture();
  try {
    const value = produceCriticDiagnostic(baseOptions(f, { guardrailPaths: ["guard.md", MANIFEST_JSON] }));
    const paths = value.guardrails.map(g => g.path);
    assert.deepEqual(paths, [...new Set(paths)].sort());
    assert.ok(paths.includes("guard.md"));
    assert.equal(paths.filter(p => p === MANIFEST_JSON).length, 1);
    assert.ok(paths.includes("governance/policies/checklist.md"));
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});
test("PF88-S2 (iii) without a base the guardrail set is exactly the explicit one", () => {
  const f = derivedFixture();
  try {
    const value = produceCriticDiagnostic(baseOptions(f, { baseRef: undefined, guardrailPaths: ["guard.md"] }));
    assert.deepEqual(value.guardrails.map(g => g.path), ["guard.md"]);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});
test("PF88-S2 (iv) a base that is not a commit fails closed with a typed error", () => {
  const f = derivedFixture();
  try {
    assert.throws(() => produceCriticDiagnostic(baseOptions(f, { baseRef: "no-such-ref" })), /CDI-BASE/u);
    assert.throws(() => produceCriticDiagnostic(baseOptions(f, { baseRef: `${f.candidate.tree}` })), /CDI-BASE/u);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

import { REGISTER_FEATURE_PACKAGE_HELP } from "../scripts/register-feature-package.mjs";
import { CRITIC_DIAGNOSTIC_EVIDENCE_HELP } from "../scripts/critic-diagnostic-evidence.mjs";
const D2_PLUGIN = resolve(new URL("..", import.meta.url).pathname);
function d2RequireBindingsText(text) {
  assert.match(text, /critic-correction-input-bindings\.mjs derive/u);
  assert.match(text, /correctionInputBindings/u);
}
test("D2 text (1) the diagnostic evidence route names the derive step and the request field and keeps the old step", () => {
  const text = CRITIC_DIAGNOSTIC_EVIDENCE_HELP;
  assert.match(text, /Rerun critic-dispatch-preflight\.mjs with --registration-commit <that commit>\./u); // D204: one evidence-only commit
  d2RequireBindingsText(text);
});
test("D2 text (2) the registration route names the derive step and the request field and keeps both old steps", () => {
  const text = REGISTER_FEATURE_PACKAGE_HELP;
  assert.match(text, /4\. Rerun critic-dispatch-preflight\.mjs with --registration-commit <that commit>\./u); // D204: one evidence-only commit
  assert.match(text, /7\. Rerun critic-dispatch-preflight\.mjs with the arguments the verb prints\./u);
  d2RequireBindingsText(text);
  assert.ok((text.match(/critic-correction-input-bindings\.mjs derive/gu) ?? []).length >= 2);
});
import { criticCourseRepair } from "./critic-course-admission.mjs";
test("D204 every diagnostic-evidence route text names one evidence-only commit and none teaches a commit before registration", () => {
  const registration = readFileSync(join(D2_PLUGIN, "lib/feature-package-registration.mjs"), "utf8").split("\n").find((l) => l.includes('"FPR-DELTA-NO-DIAGNOSTIC"'));
  assert.ok(registration, "FPR-DELTA-NO-DIAGNOSTIC text present");
  const texts = { registration, unavailable: criticCourseRepair("CCA-DETERMINISTIC-UNAVAILABLE"), failed: criticCourseRepair("CCA-DETERMINISTIC-FAILED"), producer: CRITIC_DIAGNOSTIC_EVIDENCE_HELP, registrar: REGISTER_FEATURE_PACKAGE_HELP };
  for (const [name, text] of Object.entries(texts)) {
    assert.match(text, /one evidence-only commit/iu, name);
    assert.doesNotMatch(text, /commit it, register it|register it, commit the manifest/u, name);
  }
});
test("D2 text (3) the push hint names the derive step and the request field and keeps the old hint", () => {
  const src = readFileSync(join(D2_PLUGIN, "scripts/push-prepare.mjs"), "utf8");
  // The hint interpolates the merge base (${first}) since the late-review-unit change; the anchor follows that spelling.
  const line = src.split("\n").find((l) => l.includes("scripts/critic-dispatch-preflight.mjs --base ${first} --candidate HEAD"));
  assert.ok(line, "hint line present");
  assert.ok(line.includes("then Verify that exact candidate"));
  d2RequireBindingsText(line);
});
test("D2 text (4) the skill operator note names the flag, the request key, the same-value rule and the re-derive rule", () => {
  const src = readFileSync(join(D2_PLUGIN, "skills/critic-review/SKILL.md"), "utf8");
  const note = src.split("\n").find((l) => l.startsWith("**Operator note (ranges with state or retained results):**"));
  assert.ok(note, "operator note present");
  assert.ok(note.includes("critic-correction-input-bindings.mjs derive"));
  assert.ok(note.includes("--correction-input-bindings"));
  assert.ok(note.includes("review.correctionInputBindings"));
  assert.match(note, /same value/u);
  assert.match(note, /never null/u);
  assert.match(note, /derive again/u);
});
// N40 (Toolbox finding): CDI-FULL-VERIFY named no cause. Every raise site now says what was observed and how to repair it.
function n40Impacted(f) {
  const selection = planVerifySelection({ mode: "critic", baseCommit: "a".repeat(40), candidateCommit: f.candidate.commit, changedPaths: ["spec.md"], registeredSuiteIds: ["check", "other"], policy: { schema: "pipeline.verify-selection.v1", baseline: ["check"], areas: [{ id: "all", paths: ["spec.md"], suites: ["check"] }, { id: "rest", paths: ["other/**"], suites: ["other"] }] } });
  return { schema: "pipeline.verify-evidence.v0", ...f.candidate, exitCode: 0, steps: [{ name: "check", exitCode: 0 }], selection };
}
function n40Full(f) {
  const selection = planVerifySelection({ mode: "critic", baseCommit: f.candidate.commit, candidateCommit: f.candidate.commit, changedPaths: [], registeredSuiteIds: ["check"], policy: { schema: "pipeline.verify-selection.v1", baseline: ["check"], areas: [{ id: "all", paths: ["**"], suites: ["check"] }] } });
  return { schema: "pipeline.verify-evidence.v0", ...f.candidate, exitCode: 0, steps: [{ name: "check", exitCode: 0 }], selection };
}
const n40Write = (f, path, value) => { mkdirSync(join(f.root, "evidence"), { recursive: true }); writeFileSync(join(f.root, path), JSON.stringify(value)); };
test("N40 (a) the producer refuses impacted --full-verify evidence and names the observed run, the cause and the repair", () => {
  const f = fixture();
  try {
    assert.equal(n40Impacted(f).selection.execution, "impacted");
    n40Write(f, "evidence/impacted.json", n40Impacted(f));
    assert.throws(() => produceCriticDiagnostic({ ...options(f), fullVerifyPath: "evidence/impacted.json" }), (error) => {
      assert.equal(error.code, "CDI-FULL-VERIFY");
      assert.match(error.message, /^CDI-FULL-VERIFY: /u);
      assert.match(error.message, /"impacted"/u);
      assert.match(error.message, /not a full run/u);
      assert.match(error.message, /verify-evidence-producer\.mjs/u);
      assert.match(error.message, /--base/u);
      return true;
    });
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});
test("N40 (b) full evidence is still accepted by the producer", () => {
  const f = fixture();
  try {
    assert.equal(n40Full(f).selection.execution, "full");
    n40Write(f, "evidence/full.json", n40Full(f));
    assert.equal(produceCriticDiagnostic({ ...options(f), fullVerifyPath: "evidence/full.json" }).fullVerify.status, "passed");
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});
test("N40 (c) the validator names the cause for an execution mismatch, a status mismatch, a bad shape and a not-run record that carries evidence", () => {
  const f = fixture();
  try {
    n40Write(f, "evidence/full.json", n40Full(f));
    const good = produceCriticDiagnostic({ ...options(f), fullVerifyPath: "evidence/full.json" });
    const context = { root: f.root, candidate: f.candidate };
    const refuse = (mutate, patterns) => {
      const changed = structuredClone(good); mutate(changed);
      assert.throws(() => validateCriticDiagnostic(changed, context), (error) => {
        assert.equal(error.code, "CDI-FULL-VERIFY");
        for (const pattern of patterns) assert.match(error.message, pattern);
        return true;
      });
    };
    // Execution mismatch: the recorded evidence file is replaced by an impacted run with a matching digest.
    const impacted = JSON.stringify(n40Impacted(f));
    writeFileSync(join(f.root, "evidence/full.json"), impacted);
    refuse((v) => { v.fullVerify.evidence.sha256 = diagnosticDigestOf(impacted); }, [/"impacted"/u, /not a full run/u, /verify-evidence-producer\.mjs/u]);
    writeFileSync(join(f.root, "evidence/full.json"), JSON.stringify(n40Full(f)));
    refuse((v) => { v.fullVerify.status = "failed"; }, [/records "failed"/u, /evidence file says "passed"/u]);
    refuse((v) => { v.fullVerify.status = "bogus"; }, [/status/u, /not-run, passed or failed/u]);
    refuse((v) => { v.fullVerify = { status: "not-run", evidence: v.fullVerify.evidence }; }, [/not-run/u, /evidence null/u]);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});
test("N40 (d) the CLI prints the cause and the repair on stderr, not only the code, and keeps the bare code for a refusal without text", () => {
  const f = fixture();
  try {
    n40Write(f, "evidence/impacted.json", n40Impacted(f));
    const script = resolve("plugins/pipeline-core/scripts/critic-diagnostic-evidence.mjs");
    const run = (extra) => spawnSync(process.execPath, [script, "--root", f.root, "--spec", "spec.md", "--guardrail", "guard.md", "--log", "evidence/n40.log", "--out", "evidence/n40.json", ...extra, "--", process.execPath, "-e", "process.exit(0)"], { encoding: "utf8" });
    const refused = run(["--full-verify", "evidence/impacted.json"]);
    assert.equal(refused.status, 1);
    assert.match(refused.stderr, /^CDI-FULL-VERIFY: /u);
    assert.match(refused.stderr, /"impacted"/u);
    assert.match(refused.stderr, /verify-evidence-producer\.mjs/u);
    const bare = run(["--candidate", "no-such-ref"]);
    assert.equal(bare.status, 1);
    assert.doesNotMatch(bare.stderr, /: /u);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});
import { createHash as n40CreateHash } from "node:crypto";
const diagnosticDigestOf = (text) => n40CreateHash("sha256").update(text).digest("hex");
