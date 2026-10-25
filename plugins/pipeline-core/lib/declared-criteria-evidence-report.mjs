// SPDX-License-Identifier: SUL-1.0
import { createHash } from "node:crypto";
import { evaluateRequirementTraceability, requirementEvidenceClass, requirementMapPath } from "./requirement-traceability.mjs";
import { validateVerifySuiteReceipt } from "./verify-resume.mjs";
import { readReportCandidateFile, readReportPublicArtifact, reportBytesSha256,
  reportCandidateIdentity, reportCandidateInventory } from "./report-source-readers.mjs";

export const DECLARED_CRITERIA_REPORT_SCHEMA = "pipeline.declared-criteria-evidence-report.v1";
const unavailable = code => ({ state: "unavailable", code });
const sameCandidate = (a, b) => a?.commit === b.commit && a?.tree === b.tree;

// ---- Behavioral-output evidence oracle (AC-146; second Greenfield run codex2.P1.3.*) -------------------------
// A criterion DECLARED behavioral (map predicate `behavioral-output`) is associated only with a candidate-bound
// artifact that binds the digests of what a run PRODUCED, each distinct from anything derivable from the inputs,
// with a changed-input control (different inputs must change the output) and a declared input domain; inputs
// that collapse to one output are reported as aliasing and rejected until the alias domain is declared. Source
// markers, syntax and bare presence are structural and are never behavioral. Nothing here executes anything:
// an accepted artifact is "produced-output-bound-not-acceptance", never a pass, and carries no completion effect.
export const BEHAVIORAL_EVIDENCE_SCHEMA = "pipeline.behavioral-output-evidence.v1";
const HEX64 = /^[a-f0-9]{64}$/u;
const BEHAVIORAL_MAX_ITEMS = 64;
const BEHAVIORAL_INPUT_MAX_BYTES = 4096;
const sha256Text = text => createHash("sha256").update(text, "utf8").digest("hex");
const isPlain = value => value !== null && typeof value === "object" && !Array.isArray(value);
const sortedKeys = value => Object.keys(value).sort().join();
function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (isPlain(value)) return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}
const boundedInput = value => { try { return Buffer.byteLength(canonicalJson(value), "utf8") <= BEHAVIORAL_INPUT_MAX_BYTES; } catch { return false; } };

/**
 * The bounded, NAMED derivations of an output digest from the declared input alone. This is a list of concrete
 * echoes, not a proof of non-derivability: an output digest equal to one of them is an input echo (a signature
 * of seed text and counts), one that is not is merely not a known echo. Derivations: (1) the digest of the
 * canonical and of the raw serialization of the whole input and of every sub-value; (2) the digest of every
 * leaf's text; (3) the digest of every array length and object key count; (4) the digest of all leaf texts joined
 * by a fixed separator set, in canonical key order, in declaration order, and each reversed.
 */
function derivableDigests(input) {
  const digests = new Set(), leafOrders = [[], []];
  const note = text => digests.add(sha256Text(text));
  const walk = (node, order) => {
    if (order === 0) { note(canonicalJson(node)); note(JSON.stringify(node)); }
    if (Array.isArray(node)) { if (order === 0) note(String(node.length)); node.forEach(child => walk(child, order)); }
    else if (isPlain(node)) {
      if (order === 0) note(String(Object.keys(node).length));
      (order === 0 ? Object.keys(node).sort() : Object.keys(node)).forEach(key => walk(node[key], order));
    } else { leafOrders[order].push(String(node)); if (order === 0) note(String(node)); }
  };
  walk(input, 0); walk(input, 1);
  for (const leaves of [...leafOrders, ...leafOrders.map(order => [...order].reverse())]) {
    for (const separator of ["", ":", ",", "|", "-", "_", "/", " ", ";", ".", "\n", "\t"]) note(leaves.join(separator));
  }
  return digests;
}

function behavioralShapeOk(doc) {
  if (!isPlain(doc)) return false;
  const keys = sortedKeys(doc);
  if (keys !== "candidate,criterionId,samples,schema" && keys !== "candidate,criterionId,inputDomain,samples,schema") return false;
  if (doc.schema !== BEHAVIORAL_EVIDENCE_SCHEMA || !isPlain(doc.candidate) || sortedKeys(doc.candidate) !== "commit,tree"
    || typeof doc.candidate.commit !== "string" || typeof doc.candidate.tree !== "string"
    || typeof doc.criterionId !== "string" || doc.criterionId.length === 0 || doc.criterionId.length > 80) return false;
  if (!Array.isArray(doc.samples) || doc.samples.length < 1 || doc.samples.length > BEHAVIORAL_MAX_ITEMS
    || !doc.samples.every(sample => isPlain(sample) && sortedKeys(sample) === "input,outputSha256"
      && typeof sample.outputSha256 === "string" && HEX64.test(sample.outputSha256) && boundedInput(sample.input))) return false;
  if (doc.inputDomain === undefined) return true;
  const domain = doc.inputDomain;
  if (!isPlain(domain) || (sortedKeys(domain) !== "inputs" && sortedKeys(domain) !== "declaredAliasing,inputs")) return false;
  if (!Array.isArray(domain.inputs) || domain.inputs.length < 1 || domain.inputs.length > BEHAVIORAL_MAX_ITEMS || !domain.inputs.every(boundedInput)) return false;
  return domain.declaredAliasing === undefined || (Array.isArray(domain.declaredAliasing) && domain.declaredAliasing.length <= BEHAVIORAL_MAX_ITEMS
    && domain.declaredAliasing.every(group => Array.isArray(group) && group.length >= 2 && group.length <= BEHAVIORAL_MAX_ITEMS && group.every(boundedInput)));
}

/** Evaluates one parsed artifact; every rejection is a typed code and a rejected artifact is still reported in full. */
function evaluateBehavioralArtifact(doc, candidate) {
  if (!behavioralShapeOk(doc)) return { state: "invalid", codes: ["BEH-ARTIFACT-SHAPE"] };
  const base = { criterionId: doc.criterionId };
  if (!sameCandidate(doc.candidate, candidate)) return { ...base, state: "stale", codes: ["BEH-CANDIDATE-STALE"] };
  const codes = new Set(), digestOfInput = input => sha256Text(canonicalJson(input));
  const distinctInputs = new Map(); // input digest -> set of output digests observed for it
  for (const sample of doc.samples) {
    const inputDigest = digestOfInput(sample.input), derivable = derivableDigests(sample.input);
    if (derivable.has(sample.outputSha256)) codes.add("BEH-INPUT-ECHO");
    distinctInputs.set(inputDigest, (distinctInputs.get(inputDigest) ?? new Set()).add(sample.outputSha256));
  }
  if ([...distinctInputs.values()].some(outputs => outputs.size > 1)) codes.add("BEH-SAMPLE-CONFLICT");
  const distinctOutputs = new Set(doc.samples.map(sample => sample.outputSha256));
  let changedInputControl = "held";
  if (distinctInputs.size < 2) { codes.add("BEH-CHANGED-INPUT-CONTROL-MISSING"); changedInputControl = "insufficient"; }
  else if (distinctOutputs.size === 1) { codes.add("BEH-CHANGED-INPUT-CONTROL-FAILED"); changedInputControl = "failed"; }
  const inputsByOutput = new Map();
  for (const [inputDigest, outputs] of distinctInputs) for (const output of outputs) inputsByOutput.set(output, [...(inputsByOutput.get(output) ?? []), inputDigest]);
  const declaredGroups = new Set((doc.inputDomain?.declaredAliasing ?? []).map(group => [...new Set(group.map(digestOfInput))].sort().join("|")));
  const aliasing = [...inputsByOutput].filter(([, inputs]) => inputs.length > 1)
    .map(([outputSha256, inputs]) => { const inputSha256s = [...inputs].sort(); return { outputSha256, inputSha256s, declared: declaredGroups.has(inputSha256s.join("|")) }; })
    .sort((a, b) => (a.outputSha256 < b.outputSha256 ? -1 : 1));
  const undeclaredAliasing = aliasing.filter(group => !group.declared);
  if (undeclaredAliasing.length > 0) codes.add("BEH-ALIAS-UNDECLARED");
  if ([...declaredGroups].some(key => !aliasing.some(group => group.inputSha256s.join("|") === key))) codes.add("BEH-ALIAS-DECLARATION-UNOBSERVED");
  if (doc.inputDomain === undefined) codes.add("BEH-DOMAIN-UNDECLARED");
  else {
    const domain = new Set(doc.inputDomain.inputs.map(digestOfInput));
    if ([...distinctInputs.keys()].some(digest => !domain.has(digest))) codes.add("BEH-INPUT-OUTSIDE-DOMAIN");
    if ([...domain].some(digest => !distinctInputs.has(digest))) codes.add("BEH-DOMAIN-NOT-COVERED");
  }
  return { ...base, state: codes.size === 0 ? "accepted-not-acceptance" : "rejected", codes: [...codes].sort(),
    sampleCount: doc.samples.length, distinctInputs: distinctInputs.size, distinctOutputs: distinctOutputs.size, changedInputControl, aliasing };
}

/** Existing evidence is observed and bounded; no criterion is satisfied by name. */
export function reportDeclaredCriteriaEvidence(handle, { specPath, verifyPath, receiptPaths = [], evidencePaths = [] } = {}) {
  const candidate = reportCandidateIdentity(handle);
  const report = { schema: DECLARED_CRITERIA_REPORT_SCHEMA, reportOnly: true, completionEffect: "none", candidate,
    sources: [], criteria: [], receipts: [], behavioralEvidence: [], verify: unavailable("REPORT-VERIFY-NOT-SUPPLIED"),
    conservation: unavailable("REPORT-AUTHORIZED-ORIGINAL-CUSTODY-READER-UNAVAILABLE"),
    readinessSources: ["original-input", "prd", "spec", "revised-design", "traceability"],
    browserPolicy: "required-only-if-declared; core-or-structural-evidence-is-not-browser-proof" };
  if (typeof specPath !== "string" || !/^specs\/.+\.md$/u.test(specPath)) return { ...report, state: "unknown", source: unavailable("REPORT-SPEC-PATH") };
  let spec, trace;
  try {
    spec = readReportCandidateFile(handle, specPath);
    trace = evaluateRequirementTraceability({ specPath, candidate, candidateFiles: reportCandidateInventory(handle),
      readCandidateFile: path => readReportCandidateFile(handle, path) });
  } catch (error) { return { ...report, state: "unknown", source: unavailable(error.code ?? "REPORT-SPEC-UNAVAILABLE") }; }
  report.sources.push({ kind: "spec", path: specPath, sha256: reportBytesSha256(spec) });
  report.traceability = { mode: trace.mode, mapPath: requirementMapPath(specPath), map: trace.map ?? null };
  // Mention inventory is not a normative parser: absence of the opt-in map
  // cannot erase criteria, and prose identity alone cannot establish disposition.
  const mentions = [...new Set(spec.toString("utf8").match(/\bAC-[A-Z0-9]+(?:-[A-Z0-9]+)*\b/gu) ?? [])].sort();
  if (mentions.length > 256 || mentions.some(id => id.length > 80)) return { ...report, state: "unknown", source: unavailable("REPORT-CRITERION-BOUND") };
  const mapped = new Map(trace.criteria.map(row => [row.id, row]));
  report.criteria = [...new Set([...mentions, ...mapped.keys()])].sort().map(id => ({ id,
    identitySource: mapped.has(id) ? "candidate-adjacent-traceability-map" : "spec-text-mention-not-normative-classification",
    structural: mapped.has(id) ? mapped.get(id) : { status: "unmapped" },
    executedProductEvidence: unavailable("REPORT-CRITERION-EXECUTION-BINDING-UNAVAILABLE"),
    acceptedDisposition: unavailable("REPORT-CRITERION-DISPOSITION-OWNER-UNAVAILABLE") }));
  if (verifyPath !== undefined) {
    try {
      const artifact = readReportPublicArtifact(handle, verifyPath), value = JSON.parse(artifact.bytes.toString("utf8"));
      const identity = value.candidate?.start ?? value.candidate;
      const candidateBound = sameCandidate(identity, candidate) && (value.candidate?.start === undefined
        || (sameCandidate(value.candidate.finish, candidate) && value.candidate.binding === "exact"));
      if (value.schema !== "pipeline.verify-evidence.v0" || !Array.isArray(value.steps) || value.steps.length > 2048
        || !Number.isInteger(value.exitCode) || value.exitCode < 0 || !value.steps.every(step => typeof step.name === "string" && /^[A-Za-z0-9._:-]{1,128}$/u.test(step.name) && Number.isInteger(step.exitCode))) throw Error("shape");
      report.verify = { state: !candidateBound ? "stale" : value.exitCode === 0 ? "published-success-not-product-acceptance" : "published-failed",
        reference: artifact.reference, candidateBound, exitCode: value.exitCode,
        steps: value.steps.map(step => ({ name: step.name, exitCode: step.exitCode, reused: step.reused === true })),
        executionAuthenticity: unavailable("REPORT-VERIFY-JOURNAL-READER-NOT-SUPPLIED") };
    } catch (error) { report.verify = unavailable(error.code ?? "REPORT-VERIFY-INVALID"); }
  }
  if (!Array.isArray(receiptPaths) || receiptPaths.length > 64 || new Set(receiptPaths).size !== receiptPaths.length) return { ...report, state: "unknown", source: unavailable("REPORT-RECEIPT-BOUND") };
  for (const path of receiptPaths) {
    try {
      const artifact = readReportPublicArtifact(handle, path), receipt = JSON.parse(artifact.bytes.toString("utf8"));
      const checked = validateVerifySuiteReceipt(receipt);
      if (!checked.ok) { report.receipts.push({ reference: artifact.reference, state: "invalid", code: checked.code }); continue; }
      const drift = receipt.inputs.files.filter(ref => {
        try { return reportBytesSha256(readReportCandidateFile(handle, ref.path)) !== ref.fileSha256; }
        catch { return true; }
      }).map(ref => ref.path);
      report.receipts.push({ reference: artifact.reference, suite: receipt.suite,
        state: !sameCandidate(receipt.candidate, candidate) ? "stale" : drift.length ? "input-drift" : receipt.exitCode === 0 ? "recorded-completed-success" : "recorded-completed-failed",
        candidateBound: sameCandidate(receipt.candidate, candidate), inputDrift: drift, exitCode: receipt.exitCode,
        inputPaths: receipt.inputs.files.map(ref => ref.path),
        completionCounts: receipt.caseCompletion?.counts ?? null,
        executionAuthenticity: unavailable("REPORT-EXECUTION-PRODUCER-READER-UNAVAILABLE"),
        productClass: unavailable("REPORT-PRODUCT-CLASS-OWNER-UNAVAILABLE") });
    } catch (error) { report.receipts.push(unavailable(error.code ?? "REPORT-RECEIPT-INVALID")); }
  }
  if (!Array.isArray(evidencePaths) || evidencePaths.length > 64 || new Set(evidencePaths).size !== evidencePaths.length) return { ...report, state: "unknown", source: unavailable("REPORT-EVIDENCE-BOUND") };
  const behavioralDeclared = new Set(report.criteria.filter(row => requirementEvidenceClass(row.structural.predicate) === "behavioral-declared").map(row => row.id));
  for (const path of evidencePaths) {
    try {
      const artifact = readReportPublicArtifact(handle, path);
      let doc = null;
      try { doc = JSON.parse(artifact.bytes.toString("utf8")); } catch { doc = null; }
      const result = evaluateBehavioralArtifact(doc, candidate);
      report.behavioralEvidence.push(result.state !== "invalid" && result.state !== "stale" && !behavioralDeclared.has(result.criterionId)
        ? { reference: artifact.reference, criterionId: result.criterionId, state: "rejected", codes: ["BEH-CRITERION-NOT-DECLARED-BEHAVIORAL"] }
        : { reference: artifact.reference, ...result });
    } catch (error) { report.behavioralEvidence.push(unavailable(error.code ?? "REPORT-EVIDENCE-INVALID")); }
  }
  for (const criterion of report.criteria) {
    const path = criterion.structural.path;
    const associated = report.receipts.filter(receipt => path && receipt.inputPaths?.includes(path));
    criterion.receiptAssociations = associated.map(receipt => ({ reference: receipt.reference, suite: receipt.suite,
      state: receipt.state, candidateBound: receipt.candidateBound, exitCode: receipt.exitCode,
      relation: "actual-declared-input-association-not-criterion-satisfaction" }));
  }
  // Evidence class per criterion. Structural kinds (presence, source marker) can never be behavioral, whatever
  // receipt or verify result sits beside them; only a criterion declared behavioral can be bound, and only by
  // an accepted artifact (never by a receipt association alone).
  for (const criterion of report.criteria) {
    const { structural } = criterion;
    const declaredClass = requirementEvidenceClass(structural.predicate);
    if (declaredClass !== "behavioral-declared") {
      criterion.evidenceClass = declaredClass;
      criterion.behavioralBinding = unavailable(declaredClass === "unclassified" ? "REPORT-CRITERION-NOT-DECLARED-BEHAVIORAL" : "REPORT-STRUCTURAL-SOURCE-MARKER-NOT-BEHAVIORAL");
      continue;
    }
    const artifacts = report.behavioralEvidence.filter(entry => entry.criterionId === criterion.id && (entry.state === "accepted-not-acceptance" || entry.state === "rejected"));
    const bound = artifacts.some(entry => entry.state === "accepted-not-acceptance");
    criterion.evidenceClass = bound ? "behavioral-output-bound" : artifacts.some(entry => entry.codes.includes("BEH-INPUT-ECHO")) ? "input-echo" : "behavioral-unbound";
    criterion.behavioralBinding = artifacts.length === 0 ? unavailable("REPORT-BEHAVIORAL-EVIDENCE-NOT-SUPPLIED")
      : { state: bound ? "produced-output-bound-not-acceptance" : "rejected", artifacts,
        executionAuthenticity: unavailable("REPORT-EXECUTION-PRODUCER-READER-UNAVAILABLE") };
  }
  report.state = report.criteria.some(row => row.structural.status === "absent" || row.structural.status === "unmapped") ? "gaps" : "unknown";
  if (report.criteria.some(row => row.evidenceClass === "input-echo" || row.evidenceClass === "behavioral-unbound")) report.state = "gaps";
  return report;
}
