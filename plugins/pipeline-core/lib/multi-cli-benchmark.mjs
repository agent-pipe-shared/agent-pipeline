// SPDX-License-Identifier: SUL-1.0
import { createHash } from "node:crypto";

export const MULTI_CLI_BENCHMARK_SCHEMA = "pipeline.multi-cli-benchmark.v1";
export const BENCHMARK_CLASSES = Object.freeze(["mini", "feature", "review", "migration", "failure-recovery"]);
export const BENCHMARK_FIXTURES = Object.freeze([
  Object.freeze({ class: "mini", path: "plugins/pipeline-core/scripts/fixtures/nova-benchmark/mini.json", fileSha256: "27acdfda8347616ffa0497a1c07c91f4f71ba6802c62e5263af9ac15f17425e7" }),
  Object.freeze({ class: "feature", path: "plugins/pipeline-core/scripts/fixtures/nova-benchmark/feature.json", fileSha256: "d00670aa6ec9128e156f3972b38f2c25710fb481a09da825101ac80bceea1e53" }),
  Object.freeze({ class: "review", path: "plugins/pipeline-core/scripts/fixtures/nova-benchmark/review.json", fileSha256: "82060c2e61ad1a97b1dc2a6f21f2feea180280ea8da8e4e19e3a0e72c55116ba" }),
  Object.freeze({ class: "migration", path: "plugins/pipeline-core/scripts/fixtures/nova-benchmark/migration.json", fileSha256: "609ea0e957134d14be84562025d808a7f3e386df916a9fe01ca28814f8da4cd3" }),
  Object.freeze({ class: "failure-recovery", path: "plugins/pipeline-core/scripts/fixtures/nova-benchmark/failure-recovery.json", fileSha256: "a34d7f2c91888c47052af37271039d548462fce53e47cbb2327ad94cb644c6fe" }),
]);
const SHA = /^[a-f0-9]{64}$/u;
const OID = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const exact = (v, keys) => v !== null && typeof v === "object" && !Array.isArray(v) && Object.keys(v).length === keys.length && keys.every((k) => Object.hasOwn(v, k));
const canonical = (v) => v === null || typeof v === "boolean" || typeof v === "string" ? JSON.stringify(v) : typeof v === "number" && Number.isFinite(v) ? JSON.stringify(Object.is(v, -0) ? 0 : v) : Array.isArray(v) ? `[${v.map(canonical).join(",")}]` : v && typeof v === "object" ? `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`).join(",")}}` : (() => { throw new TypeError("invalid canonical value"); })();
const hash = (v) => createHash("sha256").update(canonical(v)).digest("hex");
const median = (values) => values.slice().sort((a, b) => a - b)[Math.floor(values.length / 2)];
const p95 = (values) => { const sorted = values.slice().sort((a, b) => a - b); return sorted[Math.ceil(sorted.length * 0.95) - 1]; };
const safe = (v) => Number.isSafeInteger(v) && v >= 0;
const positive = (v) => Number.isSafeInteger(v) && v >= 1;
const sortedUnique = (rows, key) => Array.isArray(rows) && rows.length > 0 && rows.every((row, index) => index === 0 || key(rows[index - 1]) < key(row));
const finitePercent = (numerator, denominator, minimum, maximum) => {
  if (!Number.isSafeInteger(numerator) || !positive(denominator)) throw new TypeError("MCB-SCORE");
  const value = (numerator / denominator) * 100;
  if (!Number.isFinite(value) || value < minimum || value > maximum) throw new TypeError("MCB-SCORE");
  return Object.is(value, -0) ? 0 : value;
};

function validCandidate(value) { return exact(value, ["commit", "tree"]) && OID.test(value.commit) && OID.test(value.tree); }
function validFixture(value, expected) { return exact(value, ["class", "path", "fileSha256", "seed"]) && value.class === expected.class && value.path === expected.path && value.fileSha256 === expected.fileSha256 && ID.test(value.seed); }
function validFixtures(value) { return Array.isArray(value) && value.length === BENCHMARK_FIXTURES.length && value.every((fixture, index) => validFixture(fixture, BENCHMARK_FIXTURES[index])); }
function validEnvelope(value) { return exact(value, ["hostClass", "bounds"]) && ID.test(value.hostClass) && Array.isArray(value.bounds) && value.bounds.length <= 256 && sortedUnique(value.bounds, (row) => row.resource) && value.bounds.every((row) => exact(row, ["resource", "unit", "hardLimit"]) && ID.test(row.resource) && ID.test(row.unit) && safe(row.hardLimit)); }
function validSubjects(value, envelope) { return Array.isArray(value) && value.length === 2 && sortedUnique(value, (row) => row.route) && value.every((row) => exact(row, ["route", "subjectSha256", "hostClass"]) && ID.test(row.route) && SHA.test(row.subjectSha256) && row.hostClass === envelope.hostClass); }
function validMeasures(value) {
  if (!exact(value, ["wallMs", "cpuMs", "concurrency", "stages", "usage", "interventions"]) || ![value.wallMs, value.cpuMs, value.interventions].every(safe) || !positive(value.concurrency) || !exact(value.stages, ["orchestrationMs", "workspaceMs", "verificationMs", "reviewMs", "retryMs", "cleanupMs"]) || !Object.values(value.stages).every(safe) || Object.values(value.stages).reduce((sum, entry) => sum + entry, 0) > value.wallMs || !exact(value.usage, ["input", "output", "unit"])) return false;
  if (value.usage.unit === "unknown") return value.usage.input === null && value.usage.output === null;
  return ID.test(value.usage.unit) && safe(value.usage.input) && safe(value.usage.output);
}
function validResourceUse(value, envelope) { return Array.isArray(value) && value.length === envelope.bounds.length && value.every((row, index) => exact(row, ["resource", "unit", "value"]) && row.resource === envelope.bounds[index].resource && row.unit === envelope.bounds[index].unit && safe(row.value) && row.value <= envelope.bounds[index].hardLimit); }
function validClock(value) { return exact(value, ["source", "monotonicMs", "wallTime", "rawSha256"]) && ID.test(value.source) && safe(value.monotonicMs) && value.wallTime === null && SHA.test(value.rawSha256); }
function validObservation(value, envelope, route, repetition) { return exact(value, ["route", "repetition", "clock", "outcome", "measures", "resourceUse", "correctnessSha256", "evidenceSha256", "cleanupOk", "authorityOk"]) && value.route === route && value.repetition === repetition && validClock(value.clock) && ["succeeded", "failed", "cancelled", "unknown"].includes(value.outcome) && validMeasures(value.measures) && validResourceUse(value.resourceUse, envelope) && SHA.test(value.correctnessSha256) && SHA.test(value.evidenceSha256) && typeof value.cleanupOk === "boolean" && typeof value.authorityOk === "boolean"; }

/** Evaluates paired benchmark observations while retaining every measured bound. */
export function evaluateMultiCliBenchmark(input) {
  if (!exact(input, ["benchmarkId", "candidate", "fixtures", "adapterReportSha256", "subjects", "resourceEnvelope", "baseline", "candidateRoute"])) throw new TypeError("MCB-SHAPE");
  if (!ID.test(input.benchmarkId) || !validCandidate(input.candidate) || !validFixtures(input.fixtures) || !SHA.test(input.adapterReportSha256) || !validEnvelope(input.resourceEnvelope) || !validSubjects(input.subjects, input.resourceEnvelope)) throw new TypeError("MCB-BINDING");
  const routes = [input.baseline, input.candidateRoute];
  if (!routes.every((route) => exact(route, ["routeId", "hostClass", "classes"]) && ID.test(route.routeId) && route.hostClass === input.resourceEnvelope.hostClass && Array.isArray(route.classes) && route.classes.length === BENCHMARK_CLASSES.length) || input.baseline.routeId === input.candidateRoute.routeId || new Set(input.subjects.map((subject) => subject.route)).size !== 2 || !input.subjects.every((subject) => [input.baseline.routeId, input.candidateRoute.routeId].includes(subject.route))) throw new TypeError("MCB-ROUTE");
  const summaries = new Map(); const warmups = []; const observations = []; const lastClock = new Map();
  for (const route of routes) for (const [classIndex, row] of route.classes.entries()) {
    if (!exact(row, ["taskClass", "warmup", "samples"]) || row.taskClass !== BENCHMARK_CLASSES[classIndex] || !validObservation(row.warmup, input.resourceEnvelope, route.routeId, 0) || !Array.isArray(row.samples) || row.samples.length !== 5 || !row.samples.every((sample, index) => validObservation(sample, input.resourceEnvelope, route.routeId, index + 1))) throw new TypeError("MCB-SAMPLES");
    if (summaries.has(`${route.routeId}:${row.taskClass}`)) throw new TypeError("MCB-DUPLICATE");
    const samples = row.samples; const clocks = [row.warmup, ...samples].map((sample) => sample.clock.monotonicMs); const previous = lastClock.get(route.routeId) ?? -1;
    if (clocks.some((clock, index) => clock <= (index === 0 ? previous : clocks[index - 1]))) throw new TypeError("MCB-CLOCK");
    lastClock.set(route.routeId, clocks.at(-1));
    if (![row.warmup, ...samples].every((sample) => sample.cleanupOk && sample.authorityOk && sample.outcome === "succeeded") || new Set(samples.map((sample) => sample.correctnessSha256)).size !== 1 || new Set(samples.map((sample) => sample.evidenceSha256)).size !== 1) throw new TypeError("MCB-FALSE-SUCCESS");
    summaries.set(`${route.routeId}:${row.taskClass}`, { medianWallMs: median(samples.map((sample) => sample.measures.wallMs)), p95WallMs: p95(samples.map((sample) => sample.measures.wallMs)), interventions: samples.reduce((total, sample) => total + sample.measures.interventions, 0), usageKnown: samples.every((sample) => sample.measures.usage.unit !== "unknown" && sample.measures.usage.input !== null && sample.measures.usage.output !== null), correctnessSha256: samples[0].correctnessSha256, evidenceSha256: samples[0].evidenceSha256 });
    warmups.push({ taskClass: row.taskClass, observation: row.warmup }); observations.push({ taskClass: row.taskClass, samples });
  }
  if (!BENCHMARK_CLASSES.every((taskClass) => summaries.has(`${input.baseline.routeId}:${taskClass}`) && summaries.has(`${input.candidateRoute.routeId}:${taskClass}`))) throw new TypeError("MCB-COVERAGE");
  if (BENCHMARK_CLASSES.some((taskClass) => summaries.get(`${input.baseline.routeId}:${taskClass}`).medianWallMs === 0)) throw new TypeError("MCB-SCORE");
  const score = BENCHMARK_CLASSES.map((taskClass) => { const baseline = summaries.get(`${input.baseline.routeId}:${taskClass}`); const candidate = summaries.get(`${input.candidateRoute.routeId}:${taskClass}`); return { taskClass, medianWallMs: candidate.medianWallMs, p95WallMs: candidate.p95WallMs, classImprovementPct: finitePercent(baseline.medianWallMs - candidate.medianWallMs, baseline.medianWallMs, Number.NEGATIVE_INFINITY, 100), classRegressionPct: finitePercent(candidate.medianWallMs - baseline.medianWallMs, baseline.medianWallMs, -100, Number.POSITIVE_INFINITY), correctnessEqual: baseline.correctnessSha256 === candidate.correctnessSha256 && baseline.evidenceSha256 === candidate.evidenceSha256, resourceWithinEnvelope: true, interventionsDelta: candidate.interventions - baseline.interventions, usageKnown: baseline.usageKnown && candidate.usageKnown }; });
  const recommend = score.filter((entry) => entry.classImprovementPct >= 10).length >= 3 && score.every((entry) => entry.classRegressionPct <= 5 && entry.p95WallMs <= summaries.get(`${input.baseline.routeId}:${entry.taskClass}`).p95WallMs * 1.1 && entry.interventionsDelta <= 0 && entry.usageKnown && entry.correctnessEqual && entry.resourceWithinEnvelope);
  const record = { schema: MULTI_CLI_BENCHMARK_SCHEMA, benchmarkId: input.benchmarkId, scoringVersion: "nova-efficiency-v1", candidate: input.candidate, fixture: input.fixtures, adapterReportSha256: input.adapterReportSha256, subjects: input.subjects, resourceEnvelope: input.resourceEnvelope, warmups, repetitions: { warmupExcluded: 1, measured: 5 }, observations, score, recommendation: recommend ? "candidate-route-for-observed-envelope" : "no-recommendation", recordSha256: null };
  const { recordSha256, ...core } = record; record.recordSha256 = hash(core);
  return Object.freeze(record);
}
