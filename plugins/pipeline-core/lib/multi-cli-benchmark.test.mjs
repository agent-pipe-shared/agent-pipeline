// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { evaluateMultiCliBenchmark, BENCHMARK_CLASSES, BENCHMARK_FIXTURES } from "./multi-cli-benchmark.mjs";
const H = "a".repeat(64); const candidate = { commit: "1".repeat(40), tree: "2".repeat(40) };
const resourceEnvelope = { hostClass: "linux-arm64-ci", bounds: [{ resource: "cpu-ms", unit: "ms", hardLimit: 200 }, { resource: "memory-mb", unit: "mb", hardLimit: 512 }] };
const observation = (route, repetition, wallMs, monotonicMs, usage = "token") => ({ route, repetition, clock: { source: "monotonic", monotonicMs, wallTime: null, rawSha256: "f".repeat(64) }, outcome: "succeeded", measures: { wallMs, cpuMs: wallMs, concurrency: 1, stages: { orchestrationMs: 1, workspaceMs: 1, verificationMs: 1, reviewMs: 1, retryMs: 0, cleanupMs: 1 }, usage: { input: usage === "unknown" ? null : 1, output: usage === "unknown" ? null : 1, unit: usage }, interventions: 0 }, resourceUse: [{ resource: "cpu-ms", unit: "ms", value: wallMs }, { resource: "memory-mb", unit: "mb", value: 256 }], correctnessSha256: H, evidenceSha256: "b".repeat(64), cleanupOk: true, authorityOk: true });
const route = (routeId, wall, usage = "token") => ({ routeId, hostClass: resourceEnvelope.hostClass, classes: BENCHMARK_CLASSES.map((taskClass, classIndex) => ({ taskClass, warmup: observation(routeId, 0, wall, classIndex * 10 + 1, usage), samples: [1, 2, 3, 4, 5].map((repetition) => observation(routeId, repetition, wall, classIndex * 10 + repetition + 1, usage)) })) });
const input = (candidateWall = 80, usage = "token") => ({ benchmarkId: "nova-a6", candidate, fixtures: BENCHMARK_FIXTURES.map((fixture) => ({ ...fixture, seed: `${fixture.class}-seed` })), adapterReportSha256: "c".repeat(64), subjects: [{ route: "native", subjectSha256: "d".repeat(64), hostClass: resourceEnvelope.hostClass }, { route: "serial", subjectSha256: "e".repeat(64), hostClass: resourceEnvelope.hostClass }], resourceEnvelope, baseline: route("serial", 100, usage), candidateRoute: route("native", candidateWall, usage) });
let n = 0; const check = (name, fn) => { fn(); console.log(`PASS MCB${String(++n).padStart(2, "0")} ${name}`); };
check("ships a fully closed benchmark schema and exact versioned fixture corpus", () => {
  const schema = JSON.parse(readFileSync(new URL("../scripts/multi-cli-benchmark.schema.json", import.meta.url), "utf8"));
  assert.equal(schema.additionalProperties, false);
  for (const definition of ["candidate", "fixture", "subject", "bound", "resourceEnvelope", "clock", "stages", "usage", "measures", "resourceUse", "observation", "warmup", "samples", "score"]) assert.equal(schema.$defs[definition].additionalProperties, false, definition);
  assert.equal(schema.properties.fixture.prefixItems.length, BENCHMARK_CLASSES.length);
  assert.deepEqual(schema.properties.fixture.prefixItems.map((rule) => rule.allOf[1].properties.class.const), BENCHMARK_CLASSES);
  assert.deepEqual(schema.properties.fixture.prefixItems.map((rule) => rule.allOf[1].properties.path.const), BENCHMARK_FIXTURES.map((fixture) => fixture.path));
  assert.deepEqual(schema.properties.fixture.prefixItems.map((rule) => rule.allOf[1].properties.fileSha256.const), BENCHMARK_FIXTURES.map((fixture) => fixture.fileSha256));
  assert.equal(schema.properties.fixture.items, false);
  for (const fixture of BENCHMARK_FIXTURES) {
    const bytes = readFileSync(new URL(`../scripts/fixtures/nova-benchmark/${fixture.class}.json`, import.meta.url));
    assert.equal(createHash("sha256").update(bytes).digest("hex"), fixture.fileSha256);
    assert.deepEqual(JSON.parse(bytes), { class: fixture.class, fixture: "synthetic", version: 1 });
  }
  const record = evaluateMultiCliBenchmark(input());
  assert.deepEqual(Object.keys(record), ["schema", "benchmarkId", "scoringVersion", "candidate", "fixture", "adapterReportSha256", "subjects", "resourceEnvelope", "warmups", "repetitions", "observations", "score", "recommendation", "recordSha256"]);
  assert.equal(record.fixture.length, 5); assert.equal(record.warmups.length, 10); assert.equal(record.observations.length, 10);
});
check("recommends only paired same-host monotonic observations within every resource bound", () => assert.equal(evaluateMultiCliBenchmark(input()).recommendation, "candidate-route-for-observed-envelope"));
check("does not recommend unknown usage and rejects host, resource, clock, fixture, route, or class drift", () => {
  assert.equal(evaluateMultiCliBenchmark(input(80, "unknown")).recommendation, "no-recommendation");
  const mixedUnknown = input(80, "unknown"); mixedUnknown.candidateRoute.classes[0].samples[0].measures.usage.input = 0;
  assert.throws(() => evaluateMultiCliBenchmark(mixedUnknown), /MCB-SAMPLES/u);
  const host = input(); host.candidateRoute.hostClass = "other"; assert.throws(() => evaluateMultiCliBenchmark(host), /MCB-ROUTE/u);
  const resource = input(); resource.candidateRoute.classes[0].samples[0].resourceUse[0].value = 201; assert.throws(() => evaluateMultiCliBenchmark(resource), /MCB-SAMPLES/u);
  const clock = input(); clock.candidateRoute.classes[0].samples[1].clock.monotonicMs = 2; assert.throws(() => evaluateMultiCliBenchmark(clock), /MCB-CLOCK/u);
  const fixtures = input(); fixtures.fixtures[0].fileSha256 = H; assert.throws(() => evaluateMultiCliBenchmark(fixtures), /MCB-BINDING/u);
  const fixturePath = input(); fixturePath.fixtures[0].path = "plugins/pipeline-core/scripts/fixtures/nova-benchmark/other.json"; assert.throws(() => evaluateMultiCliBenchmark(fixturePath), /MCB-BINDING/u);
  const subject = input(); subject.subjects.push({ route: "external", subjectSha256: H, hostClass: resourceEnvelope.hostClass }); assert.throws(() => evaluateMultiCliBenchmark(subject), /MCB-BINDING/u);
  const classes = input(); [classes.candidateRoute.classes[0], classes.candidateRoute.classes[1]] = [classes.candidateRoute.classes[1], classes.candidateRoute.classes[0]]; assert.throws(() => evaluateMultiCliBenchmark(classes), /MCB-SAMPLES/u);
});
check("rejects false success in warmups or measured repetitions and incomplete repetitions", () => { const bad = input(); bad.candidateRoute.classes[0].samples[0].cleanupOk = false; assert.throws(() => evaluateMultiCliBenchmark(bad)); const warmup = input(); warmup.candidateRoute.classes[0].warmup.authorityOk = false; assert.throws(() => evaluateMultiCliBenchmark(warmup), /MCB-FALSE-SUCCESS/u); const short = input(); short.baseline.classes[0].samples.pop(); assert.throws(() => evaluateMultiCliBenchmark(short)); });
check("rejects zero concurrency, impossible stage totals, and a zero baseline before percent division", () => {
  const concurrency = input(); concurrency.candidateRoute.classes[0].samples[0].measures.concurrency = 0; assert.throws(() => evaluateMultiCliBenchmark(concurrency), /MCB-SAMPLES/u);
  const stages = input(); stages.candidateRoute.classes[0].samples[0].measures.stages.retryMs = 100; assert.throws(() => evaluateMultiCliBenchmark(stages), /MCB-SAMPLES/u);
  const zero = input();
  for (const row of zero.baseline.classes) for (const sample of [row.warmup, ...row.samples]) {
    sample.measures.wallMs = 0; sample.measures.cpuMs = 0; sample.resourceUse[0].value = 0;
    for (const stage of Object.keys(sample.measures.stages)) sample.measures.stages[stage] = 0;
  }
  assert.throws(() => evaluateMultiCliBenchmark(zero), /MCB-SCORE/u);
});
check("canonically hashes finite non-integral percent scores", () => {
  const value = input(89); value.baseline = route("serial", 101);
  const record = evaluateMultiCliBenchmark(value);
  assert.equal(Number.isFinite(record.score[0].classImprovementPct), true);
  assert.equal(Number.isInteger(record.score[0].classImprovementPct), false);
  assert.match(record.recordSha256, /^[a-f0-9]{64}$/u);
});
console.log(`${n}/6 checks passed.`);
