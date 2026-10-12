// SPDX-License-Identifier: SUL-1.0
/** Report-only observations owned by the sanctioned State transaction. */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { closeSync, fstatSync, lstatSync, openSync, readFileSync, realpathSync, readdirSync, constants } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { deriveMinimumRigor, deriveLifecycleRigorObservation, inferInputsFromRepo, normalizeInputs } from "../scripts/rigor-floor.mjs";
import { resolveProtectedBaseline } from "./protected-baseline.mjs";
import { deriveArchitecturePlanningSurface } from "./architecture-entry-readiness.mjs";
import { evaluateArchitectureFitness } from "../scripts/architecture-fitness.mjs";
import { generateInterruptionReport } from "../scripts/report-interruptions.mjs";
import { resolveAuthorityArtifactPath } from "./project-authority.mjs";
import { parseStrictJson } from "./governance-event.mjs";

export const RIGOR_JOURNAL_SCHEMA = "pipeline.rigor-journal-entry.v1";
const SHA = /^[a-f0-9]{64}$/u;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:+-]{0,127}$/u;
const OID = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u;
const RANK = { mini: 0, feature: 1, epic: 2 };
const MAX_HISTORY = 256;
const PROFILE_PROPERTIES = ["context-locality", "contract-sufficiency", "change-locality", "dependency-legibility", "authority-effect-locality", "verification-locality", "session-reentry-stability", "parallel-work-safety", "refactorability-without-churn"];
const PLUGIN = dirname(dirname(fileURLToPath(import.meta.url)));
const PROFILE_PATH = "plugins/pipeline-core/architecture/agent-first-profile.v1.json";
const canonical = value => JSON.stringify(sort(value));
function sort(value) {
  if (Array.isArray(value)) return value.map(sort);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map(key => [key, sort(value[key])]));
  return value;
}
const hash = value => createHash("sha256").update(typeof value === "string" || Buffer.isBuffer(value) ? value : canonical(value)).digest("hex");
const envelope = (value, status, sourceContract) => ({ value, status, sourceContract });
const absent = source => envelope(null, "unavailable", source);
function exact(value, keys) { return value !== null && typeof value === "object" && !Array.isArray(value)
  && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key)); }
function candidate(value) { return exact(value, ["commit", "tree"]) && OID.test(value.commit) && OID.test(value.tree)
  && value.commit.length === value.tree.length; }
function physicalBytes(root, relativePath, max = 1048576) {
  const parent = realpathSync(resolve(root));
  if (parent !== resolve(root)) throw new Error("RIGOR-PHYSICAL-ROOT");
  let path = parent;
  for (const part of relativePath.split("/")) {
    if (!part || part === "." || part === ".." || /[\\:\x00-\x1f]/u.test(part)) throw new Error("RIGOR-PATH");
    path = join(path, part);
    if (lstatSync(path).isSymbolicLink()) throw new Error("RIGOR-PHYSICAL-PATH");
  }
  const fd = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const before = fstatSync(fd);
    if (!before.isFile() || before.nlink !== 1 || before.size > max) throw new Error("RIGOR-PHYSICAL-FILE");
    const bytes = readFileSync(fd);
    const after = fstatSync(fd), named = lstatSync(path);
    if (before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size
      || before.mtimeMs !== after.mtimeMs || named.dev !== after.dev || named.ino !== after.ino
      || bytes.length !== before.size) throw new Error("RIGOR-PHYSICAL-DRIFT");
    return bytes;
  } finally { closeSync(fd); }
}
function git(root, args, run = execFileSync) {
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_")));
  return run("git", ["--no-optional-locks", "-C", root, ...args], { encoding: null, shell: false,
    timeout: 10000, maxBuffer: 4194304, env });
}
function currentCandidate(root, run) {
  const bytes = git(root, ["rev-parse", "HEAD", "HEAD^{tree}"], run);
  if (!Buffer.isBuffer(bytes)) throw new Error("RIGOR-CANDIDATE");
  const lines = new TextDecoder("utf-8", { fatal: true }).decode(bytes).trim().split("\n");
  const result = { commit: lines[0], tree: lines[1] };
  if (lines.length !== 2 || !candidate(result)) throw new Error("RIGOR-CANDIDATE");
  return result;
}

/** Check every existing row before selecting a same-feature previous floor. */
export function validateRigorHistory(history) {
  if (history === undefined) return [];
  if (!Array.isArray(history) || history.length > MAX_HISTORY) throw new Error("RIGOR-HISTORY-SHAPE");
  let preceding = null;
  const floors = new Map();
  for (const row of history) {
    if (!exact(row, ["schema", "previousEntrySha256", "entrySha256", "body"])
      || row.schema !== RIGOR_JOURNAL_SCHEMA || row.previousEntrySha256 !== preceding || !SHA.test(row.entrySha256)) throw new Error("RIGOR-HISTORY-BINDING");
    const body = row.body;
    if (!exact(body, ["featureId", "planPath", "boundary", "observedAt", "candidate", "baselineCandidate", "inputs", "observation", "bindings", "fitnessProjection"])
      || !ID.test(body.featureId) || !["plan-submission", "pre-close"].includes(body.boundary)
      || !Number.isFinite(Date.parse(body.observedAt)) || typeof body.planPath !== "string"
      || body.candidate !== null && !candidate(body.candidate)
      || body.baselineCandidate !== null && !candidate(body.baselineCandidate)
      || hash({ previousEntrySha256: preceding, body }) !== row.entrySha256) throw new Error("RIGOR-HISTORY-BINDING");
    const previous = floors.get(body.featureId) ?? null;
    const checked = observation(body, previous);
    if (canonical(checked) !== canonical(body.observation)) throw new Error("RIGOR-HISTORY-DERIVATION");
    const normalized = normalizeInputs(body.inputs);
    if (normalized.fitnessOutcomes.status === "available"
      && (!body.fitnessProjection || hash(body.fitnessProjection) !== normalized.fitnessOutcomes.value.sourceSha256
        || canonical(body.fitnessProjection.outcomes) !== canonical(normalized.fitnessOutcomes.value.outcomes))) throw new Error("RIGOR-HISTORY-FITNESS");
    floors.set(body.featureId, { featureId: body.featureId, minProfile: checked.retainedProfile, inputDigest: checked.derivation.inputDigest });
    preceding = row.entrySha256;
  }
  return history;
}
function observation(body, previous) {
  if (body.candidate !== null) return deriveLifecycleRigorObservation({ boundary: body.boundary,
    featureId: body.featureId, candidate: body.candidate, inputs: body.inputs, previous });
  const derivation = deriveMinimumRigor(body.inputs);
  const retainedProfile = previous && RANK[previous.minProfile] > RANK[derivation.minProfile] ? previous.minProfile : derivation.minProfile;
  const selected = normalizeInputs(body.inputs).selectedProfile;
  const profile = selected.status === "available" ? selected.value : null;
  return { schema: "pipeline.rigor-lifecycle-unavailable.v1", mode: "report-only", boundary: body.boundary,
    featureId: body.featureId, candidate: null, derivation, retainedProfile, previousInputDigest: previous?.inputDigest ?? null,
    disagreement: profile === null ? null : { selected: profile, derived: retainedProfile, agrees: RANK[profile] >= RANK[retainedProfile] },
    reauthorization: "candidate-binding-unavailable", promotionAuthority: "unavailable-no-threshold-promotion-granted" };
}

/** Collect actual owner ports. Injection is only a focused qualification seam. */
export function collectRigorJournalEntry({ rootDir, state, boundary, selectedProfile, observedAt }, deps = {}) {
  const root = resolve(rootDir), featureId = state.activeFeature?.id, planPath = state.activeFeature?.planPath;
  if (!ID.test(featureId ?? "") || typeof planPath !== "string" || !planPath
    || !["plan-submission", "pre-close"].includes(boundary) || !Number.isFinite(Date.parse(observedAt))) throw new Error("RIGOR-OWNER-BINDING");
  const history = validateRigorHistory(state.rigorHistory);
  if (history.length === MAX_HISTORY) throw new Error("RIGOR-HISTORY-LIMIT");
  const sameFeature = history.filter(row => row.body.featureId === featureId);
  const prior = sameFeature.at(-1)?.body.observation;
  const previous = prior ? { featureId, minProfile: prior.retainedProfile, inputDigest: prior.derivation.inputDigest } : null;
  const first = sameFeature.find(row => row.body.boundary === "plan-submission" && row.body.candidate !== null);
  let observedCandidate = null;
  try { observedCandidate = (deps.currentCandidate ?? currentCandidate)(root, deps.execFileSyncFn); } catch { /* missing candidate is report-only unavailable */ }
  const baselineCandidate = first?.body.candidate ?? observedCandidate;
  const run = deps.execFileSyncFn ?? execFileSync;
  const againstBaseline = (file, argv, options) => {
    const args = [...argv];
    if (baselineCandidate && args.includes("diff")) {
      const index = args.lastIndexOf("HEAD");
      if (index >= 0) args[index] = baselineCandidate.commit;
    }
    return run(file, args, options);
  };
  const inputs = (deps.inferInputs ?? inferInputsFromRepo)(root, { execFileSyncFn: againstBaseline });
  inputs.selectedProfile = Object.hasOwn(RANK, selectedProfile) ? envelope(selectedProfile, "available", "pipeline.state.v0:selectedProfile") : absent("pipeline.state.v0:selectedProfile");
  const bindings = { protected: null, architectureProfile: null, fitnessModel: null, architectureBaseline: null, architectureMap: null,
    interruptionSnapshot: null, candidateStable: false, baselineAncestry: "unavailable" };
  try {
    const surface = (deps.planningSurface ?? deriveArchitecturePlanningSurface)(root);
    if (surface?.planPath === planPath && Array.isArray(surface.paths)) inputs.plannedPaths = envelope(surface.paths, "available", "pipeline.architecture-planning-surface.v1");
  } catch { /* do not invent planned surface */ }
  try {
    const protectedSurface = (deps.protectedBaseline ?? resolveProtectedBaseline)({ rootDir: root });
    if (protectedSurface.status === "ready" && protectedSurface.dynamic?.status === "available") {
      inputs.protectedIdentity = envelope(protectedSurface.identity, "available", "pipeline.protected-baseline.v1");
      bindings.protected = protectedSurface.identity;
      if (inputs.actualPaths.status === "available") inputs.protectedTouches = envelope(inputs.actualPaths.value.some(path =>
        protectedSurface.entries.some(entry => new RegExp(entry.pathPattern, "u").test(path))), "available", "pipeline.protected-baseline.v1");
    }
  } catch { inputs.protectedIdentity = absent("pipeline.protected-baseline.v1"); }
  let fitnessModel = null, baseline = null;
  const read = deps.physicalBytes ?? physicalBytes;
  for (const [path, key] of [["architecture/fitness-model.json", "fitnessModel"], ["architecture/baseline.json", "architectureBaseline"]]) {
    try {
      const bytes = read(root, path), document = JSON.parse(bytes);
      bindings[key] = { path, sha256: hash(bytes) };
      if (key === "fitnessModel" && document.schema === "pipeline.fitness-model.v1") fitnessModel = document;
      if (key === "architectureBaseline" && document.schema === "pipeline.architecture-baseline.v1") baseline = document;
    } catch { /* physical unknown remains explicit */ }
  }
  try {
    const directory = join(root, "architecture/map");
    if (!lstatSync(directory).isDirectory() || lstatSync(directory).isSymbolicLink()) throw new Error("RIGOR-MAP");
    const names = (deps.mapEntries ?? readdirSync)(directory).filter(name => name.endsWith(".md")).sort();
    if (!names.includes("index.md") || names.length > 256) throw new Error("RIGOR-MAP");
    bindings.architectureMap = names.map(name => ({ path: `architecture/map/${name}`, sha256: hash(read(root, `architecture/map/${name}`)) }));
  } catch { bindings.architectureMap = null; }
  // The actual inherited profile has its own physical bytes. A custom model id
  // is never turned into an accepted profile without its genuine resolver.
  try {
    const bytes = read(PLUGIN, "architecture/agent-first-profile.v1.json");
    const profile = JSON.parse(bytes);
    if (fitnessModel?.profileId === "inherited-agent-first" && profile.schema === "pipeline.architecture-profile.v1"
      && profile.source === "inherited-agent-first" && profile.profileId === fitnessModel.profileId
      && Number.isSafeInteger(profile.revision) && profile.revision >= 1 && SHA.test(profile.specDigest ?? "")
      && profile.mapBundlePath === "architecture/map" && Array.isArray(profile.properties) && profile.properties.length === 9
      && PROFILE_PROPERTIES.every(id => profile.properties.filter(row => row.propertyId === id).length === 1)
      && profile.properties.every(row => ["measured", "estimated", "unavailable", "unknown"].includes(row.measurementStatus)
        && ["advisory-first", "blocking", "report-only"].includes(row.blocking))) {
      bindings.architectureProfile = { path: PROFILE_PATH, sha256: hash(bytes) };
      inputs.architectureProfile = envelope({ id: profile.profileId, source: PROFILE_PATH, sha256: hash(bytes) }, "available", "pipeline.architecture-profile.v1");
    }
  } catch { inputs.architectureProfile = absent("pipeline.architecture-profile.v1"); }
  let fitnessProjection = null;
  if (fitnessModel && baseline && bindings.architectureMap !== null) {
    try {
      const value = (deps.evaluateFitness ?? evaluateArchitectureFitness)({ rootDir: root,
        mode: boundary === "plan-submission" ? "planning" : "pre-close", now: new Date(observedAt),
        fitnessModel, baseline, candidatePaths: inputs.actualPaths.value ?? [] });
      const outcomes = value.outcomes?.map(({ classId, propertyId, outcome }) => ({ classId, propertyId, outcome })).sort((a, b) => a.classId - b.classId);
      // Existing ratchet exceptions alone do not establish owner-valid approval.
      if (value.schema === "pipeline.fitness-evidence.v1" && Array.isArray(outcomes) && outcomes.length === 10
        && !outcomes.some(row => row.outcome === "excepted") && inputs.actualPaths.status === "available") {
        fitnessProjection = { schema: "pipeline.rigor-fitness-projection.v1", candidate: observedCandidate,
          model: bindings.fitnessModel, baseline: bindings.architectureBaseline, map: bindings.architectureMap, boundary, outcomes };
        inputs.fitnessOutcomes = envelope({ sourceSha256: hash(fitnessProjection), outcomes }, "available", "pipeline.rigor-fitness-projection.v1");
      }
    } catch { inputs.fitnessOutcomes = absent("pipeline.fitness-evidence.v1"); }
  }
  try {
    const report = (deps.interruptionReport ?? generateInterruptionReport)({ root, from: null, through: null,
      feature: featureId, packageId: null, dispatchId: null, format: "json" });
    const snapshot = report.ok ? report.report?.snapshot : null;
    if (snapshot && SHA.test(snapshot.snapshotSha256 ?? "")) bindings.interruptionSnapshot = {
      sha256: snapshot.snapshotSha256, qualification: snapshot.collection?.qualification ?? "unavailable" };
    if (snapshot?.scope?.featureId === featureId && snapshot.collection?.qualification === "established"
      && snapshot.coverage?.receipts === "measured" && Array.isArray(snapshot.receipts)
      && snapshot.receipts.every(row => row.scope?.featureId === featureId && ID.test(row.lineageId ?? ""))) {
      inputs.interruptionLineage = envelope({ featureId, snapshotSha256: snapshot.snapshotSha256,
        lineageCount: new Set(snapshot.receipts.map(row => row.lineageId)).size, receiptCount: snapshot.receipts.length },
      "available", "pipeline.interruption-store-snapshot.v1");
    }
  } catch { inputs.interruptionLineage = absent("pipeline.interruption-store-snapshot.v1"); }
  if (observedCandidate && baselineCandidate) {
    try { git(root, ["merge-base", "--is-ancestor", baselineCandidate.commit, observedCandidate.commit], run); bindings.baselineAncestry = "established"; }
    catch { inputs.actualPaths = absent("git.feature-baseline-diff"); inputs.diffStats = absent("git.feature-baseline-diff-stat"); }
    try { bindings.candidateStable = canonical(observedCandidate) === canonical((deps.currentCandidate ?? currentCandidate)(root, deps.execFileSyncFn)); }
    catch { bindings.candidateStable = false; }
    if (!bindings.candidateStable || bindings.baselineAncestry !== "established") {
      if (!bindings.candidateStable) observedCandidate = null;
      inputs.actualPaths = absent("git.feature-baseline-diff");
      inputs.diffStats = absent("git.feature-baseline-diff-stat");
      inputs.protectedTouches = absent("pipeline.protected-baseline.v1");
      inputs.contractDeltas = absent("pipeline.contract-freeze.v1");
      inputs.fitnessOutcomes = absent("pipeline.fitness-evidence.v1");
      fitnessProjection = null;
    }
  }
  // The evaluator and later observers can read the same physical architecture
  // files independently. A reusable projection requires those original bytes
  // and the complete map membership to survive the whole observation unchanged.
  // This remains report-only: drift is unavailable, never a new approval gate.
  if (fitnessProjection !== null) {
    try {
      for (const binding of [bindings.fitnessModel, bindings.architectureBaseline]) {
        if (!binding || hash(read(root, binding.path)) !== binding.sha256) throw new Error("RIGOR-FITNESS-SOURCE-DRIFT");
      }
      const directory = join(root, "architecture/map");
      const info = lstatSync(directory);
      if (!info.isDirectory() || info.isSymbolicLink()) throw new Error("RIGOR-FITNESS-SOURCE-DRIFT");
      const names = (deps.mapEntries ?? readdirSync)(directory).filter(name => name.endsWith(".md")).sort();
      if (!names.includes("index.md") || names.length > 256) throw new Error("RIGOR-FITNESS-SOURCE-DRIFT");
      const currentMap = names.map(name => ({ path: `architecture/map/${name}`, sha256: hash(read(root, `architecture/map/${name}`)) }));
      if (canonical(currentMap) !== canonical(bindings.architectureMap)) throw new Error("RIGOR-FITNESS-SOURCE-DRIFT");
      if (bindings.architectureProfile !== null
        && hash(read(PLUGIN, "architecture/agent-first-profile.v1.json")) !== bindings.architectureProfile.sha256) throw new Error("RIGOR-FITNESS-SOURCE-DRIFT");
    } catch {
      inputs.fitnessOutcomes = absent("pipeline.fitness-evidence.v1");
      fitnessProjection = null;
    }
  }
  const body = { featureId, planPath, boundary, observedAt, candidate: observedCandidate, baselineCandidate,
    inputs: normalizeInputs(inputs), observation: null, bindings, fitnessProjection };
  body.observation = observation(body, previous);
  const previousEntrySha256 = history.at(-1)?.entrySha256 ?? null;
  return { schema: RIGOR_JOURNAL_SCHEMA, previousEntrySha256, entrySha256: hash({ previousEntrySha256, body }), body };
}

/** Verify owns consumption; this public projection never changes its verdict. */
export function rigorVerifyRows(state) {
  return validateRigorHistory(state.rigorHistory).map(row => ({ schema: "pipeline.rigor-verify-row.v1", mode: "report-only",
    featureId: row.body.featureId, boundary: row.body.boundary, candidate: row.body.candidate,
    entrySha256: row.entrySha256, inputDigest: row.body.observation.derivation.inputDigest,
    retainedProfile: row.body.observation.retainedProfile, disagreement: row.body.observation.disagreement,
    reauthorization: row.body.observation.reauthorization, promotionAuthority: row.body.observation.promotionAuthority }));
}

/** Read the existing physical journal; never manufactures a missing row. */
export function readRigorVerifyObservation(rootDir) {
  const result = { schema: "pipeline.rigor-verify-observation.v1", mode: "report-only",
    status: "unavailable", stateSource: null, rows: [] };
  let source;
  try {
    source = resolveAuthorityArtifactPath("state", { rootDir });
    if (!source.exists || source.authorityStatus !== "ready") return result;
    const bytes = physicalBytes(rootDir, source.relPath, 4194304);
    result.stateSource = { path: source.relPath, sha256: hash(bytes) };
    const state = parseStrictJson(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    if (state.schema !== "pipeline.state.v0") throw new Error("RIGOR-STATE");
    if (state.rigorHistory === undefined) return result;
    result.rows = rigorVerifyRows(state);
    result.status = "available";
    return result;
  } catch {
    if (result.stateSource !== null) result.status = "invalid-history";
    return result;
  }
}
