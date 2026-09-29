#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, openSync, closeSync, ftruncateSync, writeSync, appendFileSync, symlinkSync, linkSync } from "node:fs";
import * as readBoundsFs from "node:fs";
import { compileFunction, createContext } from "node:vm";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  advisorySessionRoleSelectionSha256,
  advisoryEvidenceBundleSha256,
  advisoryConsultationDisposition,
  buildAdvisoryEvidenceBundle,
  createAdvisoryConsultationRecord,
  createAdvisoryDemand,
  loadAdvisoryLifecycleV2Policy,
  preflightAdvisoryCapability,
  renderAdvisoryEvidencePrompt,
  validateAdvisoryDemand,
  validateAdvisoryEvidenceBundle,
  validateAdvisoryEvidenceBundleForRepository,
  validateAdvisoryLifecycleV2Policy,
} from "./advisory-lifecycle-v2.mjs";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const dispatch = {
  dispatchId: "issue-80",
  queueRevision: 4,
  candidateCommit: "a".repeat(40),
  candidateTree: "b".repeat(40),
};

test("published lifecycle policy is closed and versioned without changing V3 route authority", () => {
  const policy = loadAdvisoryLifecycleV2Policy();
  assert.equal(validateAdvisoryLifecycleV2Policy(policy).ok, true);
  assert.equal(policy.routeAuthority, "pipeline.runner-profiles.v3");
  assert.equal(policy.bootstrap.mode, "capability-preflight-only");
  assert.equal(policy.consultation.mode, "on-demand");
});

test("bootstrap capability observation is immediate model-free evidence for both runners", () => {
  for (const runner of ["claude", "codex"]) {
    const result = preflightAdvisoryCapability({ runner, profile: "epic", consent: "approved" });
    assert.equal(result.ok, true);
    assert.equal(result.evidence.state, "unknown");
    assert.equal(result.evidence.assurance, "model-free-configured-route; model availability and identity not probed");
    assert.deepEqual(result.evidence.effects, {
      childLaunches: 0,
      modelRequests: 0,
      questionExports: 0,
      receipts: 0,
      consultationBudgetMs: 0,
    });
    assert.notEqual(result.evidence.disposition.primary, null);
  }
});

test("disabled states precede route use and observed capability maps to bounded states", () => {
  for (const input of [
    { runner: "codex", profile: "mini", consent: "approved" },
    { runner: "claude", profile: "feature", consent: "declined" },
  ]) {
    const result = preflightAdvisoryCapability(input);
    assert.equal(result.evidence.state, "disabled");
    assert.deepEqual(result.evidence.disposition, { primary: null, fallbacks: [] });
  }
  assert.equal(preflightAdvisoryCapability({
    runner: "codex", profile: "epic", consent: "approved",
    observed: { primary: "unavailable", fallbacks: [] },
  }).evidence.state, "unavailable");
  assert.equal(preflightAdvisoryCapability({
    runner: "codex", profile: "epic", consent: "approved",
    observed: { primary: "unavailable", fallbacks: ["available"] },
  }).code, "invalid_capability_observation");
});

test("only a concrete trigger, one question and exact candidate/evidence bindings create demand", () => {
  const good = createAdvisoryDemand({
    runner: "codex",
    profile: "feature",
    reason: "risk-review",
    question: "Which boundary reduces this concrete risk?",
    evidenceSha256: sha256("bounded evidence"),
    dispatch,
  });
  assert.equal(good.ok, true);
  assert.equal(Object.hasOwn(good.demand, "question"), false);
  assert.equal(validateAdvisoryDemand(good.demand, {
    runner: "codex",
    profile: "feature",
    question: "Which boundary reduces this concrete risk?",
    dispatch,
  }).ok, true);
  for (const reason of ["session-start", "resume", "compact", "consent-present", "configured-route"]) {
    assert.equal(createAdvisoryDemand({
      runner: "codex", profile: "feature", reason, question: "Should bootstrap consult?",
      evidenceSha256: sha256("same"), dispatch,
    }).ok, false);
  }
});

test("Claude session-selected Advisor fallback is bound in v3 demand and material reuse", () => {
  const selectionBase = {
    runner: "claude", taskRoute: "duty.advisory.fallback", role: "frontier",
    effort: "max", modelId: "claude-frontier-reviewed", sessionId: "claude-session-01",
    readbackSha256: "1".repeat(64), receiptSha256: "2".repeat(64),
  };
  const selection = { ...selectionBase,
    selectionSha256: advisorySessionRoleSelectionSha256(selectionBase) };
  const input = {
    runner: "claude", profile: "feature", reason: "risk-review",
    question: "Which session-admitted fallback is valid?",
    evidenceSha256: sha256("bounded advisor evidence"), dispatch,
    sessionRoleSelection: selection,
  };
  const created = createAdvisoryDemand(input);
  assert.equal(created.ok, true);
  assert.equal(created.demand.schema, "pipeline.advisory-demand.v3");
  assert.equal(Object.hasOwn(created.demand.sessionRoleBinding, "sessionId"), false);
  assert.equal(created.demand.sessionRoleBinding.modelId, selection.modelId);
  assert.equal(created.demand.sessionRoleBinding.selectionSha256, selection.selectionSha256);
  assert.equal(validateAdvisoryDemand(created.demand, input).ok, true);

  const record = createAdvisoryConsultationRecord({ demand: created.demand,
    outcome: "answered", receipt: { sanitized: true }, completedAtMs: 10 }).record;
  assert.equal(advisoryConsultationDisposition(created.demand, record).disposition, "reuse-no-repeat");
  const nextSelectionBase = { ...selectionBase, modelId: "claude-frontier-next",
    sessionId: "claude-session-02", receiptSha256: "3".repeat(64) };
  const nextSelection = { ...nextSelectionBase,
    selectionSha256: advisorySessionRoleSelectionSha256(nextSelectionBase) };
  const changed = createAdvisoryDemand({ ...input, sessionRoleSelection: nextSelection }).demand;
  assert.equal(advisoryConsultationDisposition(changed, record).disposition, "consult-material-drift");

  const tampered = structuredClone(created.demand);
  tampered.sessionRoleBinding.modelId = "attacker-selected-model";
  assert.equal(validateAdvisoryDemand(tampered, input).code, "advisory_demand_binding_mismatch");
  assert.equal(createAdvisoryDemand({ ...input, sessionRoleSelection: {
    ...selection, effort: "medium",
  } }).ok, false);
});

test("allowlisted evidence is content-bound, bounded and rendered into the model input", () => {
  const content = "closed evidence\n";
  const bundle = {
    schema: "pipeline.advisory-evidence-bundle.v1",
    references: [{
      path: "evidence/review.md",
      sha256: sha256(content),
      bytes: Buffer.byteLength(content),
      content,
    }],
  };
  const bundleSha256 = advisoryEvidenceBundleSha256(bundle);
  assert.equal(validateAdvisoryEvidenceBundle(bundle, bundleSha256).ok, true);
  const prompt = renderAdvisoryEvidencePrompt("Which boundary is safe?", bundle, bundleSha256);
  assert.match(prompt, /Which boundary is safe\?/u);
  assert.match(prompt, /closed evidence/u);
  assert.match(prompt, new RegExp(bundleSha256, "u"));
  const tampered = structuredClone(bundle);
  tampered.references[0].content = "different evidence\n";
  assert.equal(validateAdvisoryEvidenceBundle(tampered, bundleSha256).ok, false);
  assert.throws(
    () => buildAdvisoryEvidenceBundle(process.cwd(), [
      "plugins/pipeline-core/scripts/advisory-host-bridge.mjs",
      "plugins/pipeline-core/scripts/advisory-host-bridge.mjs",
    ]),
    /references are invalid/u,
  );
});

test("physical evidence requires caller order and is re-read against the exact repository bytes", () => {
  const root = mkdtempSync(join(tmpdir(), "advisory-evidence-"));
  try {
    mkdirSync(join(root, "evidence"));
    writeFileSync(join(root, "evidence", "a.md"), "alpha\n");
    writeFileSync(join(root, "evidence", "b.md"), "bravo\n");
    assert.throws(
      () => buildAdvisoryEvidenceBundle(root, ["evidence/b.md", "evidence/a.md"]),
      /references are invalid/u,
    );
    const bundle = buildAdvisoryEvidenceBundle(root, ["evidence/a.md", "evidence/b.md"]);
    const bundleSha256 = advisoryEvidenceBundleSha256(bundle);
    assert.equal(validateAdvisoryEvidenceBundleForRepository(root, bundle, bundleSha256).ok, true);
    writeFileSync(join(root, "evidence", "a.md"), "changed\n");
    assert.equal(
      validateAdvisoryEvidenceBundleForRepository(root, bundle, bundleSha256).code,
      "advisory_evidence_physical_drift",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("same material demand is not repeated and any bound material drift permits a new consult", () => {
  const first = createAdvisoryDemand({
    runner: "claude", profile: "epic", reason: "architecture-tradeoff",
    question: "A or B?", evidenceSha256: sha256("evidence-v1"), dispatch,
  }).demand;
  const record = createAdvisoryConsultationRecord({
    demand: first, outcome: "answered", receipt: { sanitized: true }, completedAtMs: 1,
  }).record;
  assert.equal(advisoryConsultationDisposition(first, record).disposition, "reuse-no-repeat");
  const changed = createAdvisoryDemand({
    runner: "claude", profile: "epic", reason: "architecture-tradeoff",
    question: "A or B?", evidenceSha256: sha256("evidence-v2"), dispatch,
  }).demand;
  assert.equal(advisoryConsultationDisposition(changed, record).disposition, "consult-material-drift");
  const forgedDemand = structuredClone(first);
  forgedDemand.reuseKeySha256 = "f".repeat(64);
  assert.equal(advisoryConsultationDisposition(forgedDemand, record).code, "invalid_advisory_demand");
  assert.equal(createAdvisoryConsultationRecord({
    demand: forgedDemand, outcome: "answered", receipt: null, completedAtMs: 2,
  }).code, "invalid_consultation_record_input");
  const forgedRecord = { ...record, demandSha256: "f".repeat(64) };
  assert.equal(advisoryConsultationDisposition(first, forgedRecord).code, "prior_consultation_binding_mismatch");
});

test("policy drift and question drift invalidate a demand before any route can run", () => {
  const question = "What is the smallest safe recovery?";
  const created = createAdvisoryDemand({
    runner: "claude", profile: "feature", reason: "recovery-choice",
    question, evidenceSha256: sha256("recovery evidence"), dispatch,
  }).demand;
  assert.equal(validateAdvisoryDemand(created, {
    runner: "claude", profile: "feature", question: `${question} changed`, dispatch,
  }).code, "advisory_demand_binding_mismatch");
  const changedPolicy = loadAdvisoryLifecycleV2Policy();
  changedPolicy.consultation.triggerReasons = [...changedPolicy.consultation.triggerReasons].reverse();
  assert.equal(validateAdvisoryDemand(created, {
    runner: "claude", profile: "feature", question, dispatch, policy: changedPolicy,
  }).code, "advisory_demand_binding_mismatch");
});

// Dependency observation stays inside a separate VM context. Production code
// receives no observer, and no global filesystem or Buffer provider is changed.
async function loadObservedAdvisoryEvidence({ observe = () => {} } = {}) {
  const url = new URL("./advisory-lifecycle-v2.mjs", import.meta.url);
  const descriptors = new Map();
  const namedFs = { ...readBoundsFs,
    openSync(path, ...rest) { const fd = readBoundsFs.openSync(path, ...rest); descriptors.set(fd, path); observe({ operation: "open", path }); return fd; },
    closeSync(fd) { descriptors.delete(fd); return readBoundsFs.closeSync(fd); },
    readSync(fd, storage, offset, length, position) { observe({ operation: "read", path: descriptors.get(fd), maxBytes: length }); return readBoundsFs.readSync(fd, storage, offset, length, position); },
    readFileSync(path, ...rest) { observe({ operation: "readFile", path: typeof path === "number" ? descriptors.get(path) : path }); return readBoundsFs.readFileSync(path, ...rest); },
  };
  const InstrumentedBuffer = new Proxy(Buffer, { get(target, key) {
    if (key === "alloc") return size => { observe({ operation: "allocate", maxBytes: size }); return Buffer.alloc(size); };
    return Reflect.get(target, key);
  } });
  // compileFunction requires no experimental Node flags. Translate only the
  // module's named import/export bindings; the implementation body stays exact.
  const dependencies = [], parameterNames = [];
  let source = readBoundsFs.readFileSync(url, "utf8");
  const imports = [...source.matchAll(/^import\s+\{([\s\S]*?)\}\s+from\s+"([^"]+)";/gm)];
  for (const [statement, bindings, specifier] of imports) {
    assert.match(bindings, /^[\w\s,]+$/u, "VM fixture supports plain named imports only");
    const name = `__dependency${dependencies.length}`;
    parameterNames.push(name);
    dependencies.push(specifier === "node:fs" ? namedFs : await import(specifier.startsWith(".") ? new URL(specifier, url).href : specifier));
    source = source.replace(statement, `const {${bindings}} = ${name};`);
  }
  assert.equal(/^import\s/m.test(source), false, "unsupported module import in VM fixture");
  const exported = [...source.matchAll(/^export (?:const|function) (\w+)/gm)].map(match => match[1]);
  source = source.replace(/^export (?=const|function)/gm, "").replaceAll("import.meta.url", "__moduleUrl");
  assert.equal(/^export\s/m.test(source), false, "unsupported module export in VM fixture");
  const execute = compileFunction(`"use strict";\n${source}\nreturn { ${exported.join(", ")} };`, [...parameterNames, "__moduleUrl"], {
    parsingContext: createContext({ Buffer: InstrumentedBuffer, process }), filename: url.href,
  });
  return execute(...dependencies, url.href);
}

const LIMIT = 262144, TOTAL = 1048576;
function readBoundsFixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'advisory-canonical-read-bounds-fixture-'));
  t.after(() => rmSync(root, { recursive: true, force: true })); mkdirSync(join(root, 'evidence'));
  return { root, put(path, data) { writeFileSync(join(root, path), data); } };
}
const readBoundsPlain = value => JSON.parse(JSON.stringify(value));
function readBoundsAsciiFile(path, length) {
  const fd = openSync(path, 'w'), chunk = Buffer.alloc(4096, 0x78);
  try { for (let offset = 0; offset < length; offset += chunk.length) writeSync(fd, chunk, 0, Math.min(chunk.length, length - offset)); }
  finally { closeSync(fd); }
}
test('advisory read bounds: declared sparse oversize rejects before open, content read or allocation', async t => {
  const f = readBoundsFixture(t), path = join(f.root, 'evidence/oversize.md'), fd = openSync(path, 'w'); ftruncateSync(fd, LIMIT + 1); closeSync(fd);
  const events = [], bounded = await loadObservedAdvisoryEvidence({ observe: event => events.push(event) });
  assert.throws(() => bounded.buildAdvisoryEvidenceBundle(f.root, ['evidence/oversize.md']), /reference exceeds its byte limit/);
  assert.deepEqual(events, []);
});
test('advisory read bounds: generic valid Unicode BOM CRLF and hidden paths preserve canonical envelope, digest and admission policy', async t => {
  const f = readBoundsFixture(t); f.put('evidence/a.md', Buffer.from('\uFEFFExact 🧪 original\r\n')); f.put('.hidden.md', 'Generic canonical policy still permits this synthetic path.');
  const proposed = await loadObservedAdvisoryEvidence();
  const paths = ['.hidden.md', 'evidence/a.md'], original = buildAdvisoryEvidenceBundle(f.root, paths), bounded = proposed.buildAdvisoryEvidenceBundle(f.root, paths);
  assert.deepEqual(readBoundsPlain(bounded), readBoundsPlain(original)); assert.equal(bounded.references[1].content, "\uFEFFExact 🧪 original\r\n"); assert.equal(bounded.references[1].bytes, Buffer.byteLength(bounded.references[1].content)); assert.equal(bounded.references[1].sha256, sha256(bounded.references[1].content)); assert.equal(proposed.advisoryEvidenceBundleSha256(bounded), advisoryEvidenceBundleSha256(original));
  assert.equal(proposed.validateAdvisoryEvidenceBundleForRepository(f.root, bounded, proposed.advisoryEvidenceBundleSha256(bounded)).ok, true);
});
test('advisory read bounds: aggregate budget rejects a next file before open, allocation or content read', async t => {
  const f = readBoundsFixture(t), paths = ['evidence/a.md', 'evidence/b.md', 'evidence/c.md', 'evidence/d.md'];
  for (const path of paths) readBoundsAsciiFile(join(f.root, path), LIMIT); f.put('evidence/e.md', 'x');
  const events = [], proposed = await loadObservedAdvisoryEvidence({ observe: event => events.push(event) });
  assert.throws(() => proposed.buildAdvisoryEvidenceBundle(f.root, [...paths, 'evidence/e.md']), /bundle exceeds its byte limit/);
  assert.equal(events.some(event => event.path === join(f.root, 'evidence/e.md')), false);
  assert.equal(events.filter(event => event.operation === 'allocate').length, 4); assert.equal(events.filter(event => event.operation === 'allocate').every(event => event.maxBytes === LIMIT + 1), true);
});
test('advisory read bounds: actual growth uses a bounded max+1 read then rejects, independent of unchanged prior stat', async t => {
  const f = readBoundsFixture(t), path = join(f.root, 'evidence/growth.md'); readBoundsAsciiFile(path, LIMIT);
  const events = []; let grew = false;
  const proposed = await loadObservedAdvisoryEvidence({ observe(event) {
    events.push(event); if (event.operation === 'allocate' && !grew) { grew = true; appendFileSync(path, 'x'); }
  } });
  assert.throws(() => proposed.buildAdvisoryEvidenceBundle(f.root, ['evidence/growth.md']), /reference exceeds its byte limit/);
  const reads = events.filter(event => event.operation === 'read'); assert.equal(reads.length, 1); assert.equal(reads[0].maxBytes, LIMIT + 1); assert.deepEqual(events.filter(event => event.operation === 'allocate').map(event => event.maxBytes), [LIMIT + 1]);
  assert.equal(events.some(event => event.operation === 'readFile'), false);
});
test('advisory read bounds: remaining aggregate budget also bounds racing growth on an initially empty final file', async t => {
  const f = readBoundsFixture(t), paths = ['evidence/a.md', 'evidence/b.md', 'evidence/c.md', 'evidence/d.md'];
  for (const path of paths) readBoundsAsciiFile(join(f.root, path), LIMIT); f.put('evidence/e.md', '');
  let allocations = 0; const events = [], proposed = await loadObservedAdvisoryEvidence({ observe(event) {
    events.push(event); if (event.operation === 'allocate' && ++allocations === 5) appendFileSync(join(f.root, 'evidence/e.md'), 'x');
  } });
  assert.equal(paths.length * LIMIT, TOTAL);
  assert.throws(() => proposed.buildAdvisoryEvidenceBundle(f.root, [...paths, 'evidence/e.md']), /bundle exceeds its byte limit/);
  const reads = events.filter(event => event.operation === 'read' && event.path.endsWith('/e.md'));
  assert.equal(reads.length, 1); assert.equal(reads[0].maxBytes, 1); assert.equal(events.filter(event => event.operation === 'allocate').at(-1).maxBytes, 1);
});
test('advisory read bounds: under-cap growth preserves the existing descriptor identity drift rejection', async t => {
  const f = readBoundsFixture(t), path = join(f.root, 'evidence/growth.md'); f.put('evidence/growth.md', 'original');
  const proposed = await loadObservedAdvisoryEvidence({ observe(event) { if (event.operation === 'allocate') appendFileSync(path, 'extra'); } });
  assert.throws(() => proposed.buildAdvisoryEvidenceBundle(f.root, ['evidence/growth.md']), /identity drifted during read/);
});
test('advisory read bounds: physical aliases and invalid UTF8 remain rejected', async t => {
  const f = readBoundsFixture(t); f.put('evidence/source.md', 'source'); const proposed = await loadObservedAdvisoryEvidence();
  symlinkSync(join(f.root, 'evidence/source.md'), join(f.root, 'evidence/symlink.md'));
  assert.throws(() => proposed.buildAdvisoryEvidenceBundle(f.root, ['evidence/symlink.md']), /physical repository file/);
  linkSync(join(f.root, 'evidence/source.md'), join(f.root, 'evidence/hardlink.md'));
  assert.throws(() => proposed.buildAdvisoryEvidenceBundle(f.root, ['evidence/source.md']), /physical repository file/);
  f.put('evidence/invalid.md', Buffer.from([0xc3, 0x28]));
  assert.throws(() => proposed.buildAdvisoryEvidenceBundle(f.root, ['evidence/invalid.md']), /valid UTF-8/);
});
