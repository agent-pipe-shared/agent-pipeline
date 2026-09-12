// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { openSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { validateControl, lintCatalogContent, lintStandardMappingsAndClaims } from "./control-catalog-schema.mjs";
import { registerTestCaseCompletion } from "./test-case-completion.mjs";

const cases = [];
const injectedFailure = process.env.PIPELINE_CCS_TEST_INJECT_FAILURE ?? "";
const selfProbeChild = process.env.PIPELINE_CCS_TEST_SELF_PROBE_CHILD === "1";
function check(name, run) {
  const id = `CCS${String(cases.length + 1).padStart(2, "0")}`;
  cases.push({ id, name, run() { if (injectedFailure === id) assert.fail("intentional control catalog schema case-completion failure"); initializeFixtures(); return run(); } });
}

function deepFreeze(v, seen = new Set()) {
  if (v && typeof v === "object" && !seen.has(v)) {
    seen.add(v);
    Object.values(v).forEach((x) => deepFreeze(x, seen));
    Object.freeze(v);
  }
  return v;
}

// --- fixtures -----------------------------------------------------------

let validControl;
let waivedControl;
let goodControl;
function initializeFixtures() {
  if (validControl !== undefined) return;
  validControl = {
  id: "ctl.base.secrets.no-committed-secrets",
  revision: 1,
  status: "active",
  title: "No committed secrets",
  objective: "Prevent secret material from entering version control.",
  threat: "Leaked credentials enable unauthorized access.",
  class: "base",
  applicability: { expression: "always", requiredInputs: ["repo.gitHistory"] },
  phase: "pre-commit",
  boundary: "repository",
  owner: "security-team",
  approvalAuthority: "security-lead",
  verifierType: "gitleaks",
  capabilityRequirements: ["cap.secrets"],
  evidenceContract: { schemaRef: "pipeline.control-evidence.v1", freshnessRule: "24h", bindingRule: "commit-sha" },
  severity: "critical",
  defaultFailureMode: "block",
  remediation: "Rotate the credential and purge it from history.",
  waiver: null,
  supersedes: null,
  supersededBy: null,
  standardMappings: [{ standard: "NIST SSDF", version: "1.1" }],
  };

  waivedControl = {
    ...validControl,
    id: "ctl.stack.container.nonroot-user",
    class: "stack",
    capabilityRequirements: ["cap.container", "cap.container.rootless"],
    waiver: { authority: "ciso", reason: "legacy image not yet migrated", expiry: "2026-12-31", revalidationTrigger: "image-rebuild" },
    supersedes: "ctl.stack.container.root-user-legacy",
  };
  goodControl = {
    ...validControl,
    standardMappings: [{ standard: "NIST SSDF", version: "1.1" }, { standard: "OWASP ASVS", version: "5.0" }],
  };
}

// --- AC1: validateControl ------------------------------------------------

check("accepts complete valid records with and without a waiver", () => {
  // full valid record accepted
  assert.deepEqual(validateControl(validControl), { valid: true });
  // full valid record with populated waiver/supersedes accepted
  assert.deepEqual(validateControl(waivedControl), { valid: true });
});

check("rejects a missing required field with a typed field error", () => {
  // missing required field -> typed, field-naming rejection
  const missing = { ...validControl };
  delete missing.objective;
  const result = validateControl(missing);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.field === "objective" && e.code === "SCHEMA-MISSING-FIELD"));
});

check("rejects a class outside the closed enum", () => {
  // class outside base|stack|risk
  const bad = { ...validControl, class: "exotic" };
  const result = validateControl(bad);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.field === "class" && e.code === "SCHEMA-INVALID-CLASS"));
});

check("rejects a capability requirement outside the ID grammar", () => {
  // capabilityRequirements entry not matching cap.<family>[.<technique>] grammar
  const bad = { ...validControl, capabilityRequirements: ["not-a-cap-id"] };
  const result = validateControl(bad);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.field === "capabilityRequirements[0]" && e.code === "SCHEMA-INVALID-CAPABILITY-REQUIREMENTS"));
});

check("rejects an unknown capability family root", () => {
  // capabilityRequirements entry matches grammar but references a non-frozen family root
  const bad = { ...validControl, capabilityRequirements: ["cap.quantum"] };
  const result = validateControl(bad);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.field === "capabilityRequirements[0]" && e.code === "SCHEMA-UNKNOWN-CAPABILITY-ROOT"));
});

check("rejects an unrecognized top-level field", () => {
  // unrecognized top-level field is rejected (closed schema)
  const bad = { ...validControl, bogusField: "not part of §8" };
  const result = validateControl(bad);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.field === "bogusField" && e.code === "SCHEMA-UNKNOWN-FIELD"));
});

check("rejects a control ID grammar violation", () => {
  // id grammar violation
  const bad = { ...validControl, id: "not-an-id" };
  const result = validateControl(bad);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.field === "id" && e.code === "SCHEMA-INVALID-ID"));
});

check("rejects every non-integer or negative revision", () => {
  // revision must be a non-negative integer
  for (const revision of ["1", -1, 1.5, null]) {
    const bad = { ...validControl, revision };
    const result = validateControl(bad);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.field === "revision" && e.code === "SCHEMA-INVALID-REVISION"));
  }
});

check("rejects applicability without required inputs", () => {
  // applicability missing requiredInputs
  const bad = { ...validControl, applicability: { expression: "always" } };
  const result = validateControl(bad);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.field === "applicability" && e.code === "SCHEMA-INVALID-APPLICABILITY"));
});

check("rejects an evidence contract without a schema reference", () => {
  // evidenceContract missing schemaRef
  const bad = { ...validControl, evidenceContract: { freshnessRule: "24h" } };
  const result = validateControl(bad);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.field === "evidenceContract" && e.code === "SCHEMA-INVALID-EVIDENCE-CONTRACT"));
});

check("accepts permissive evidence contract freshness and binding keys", () => {
  // evidenceContract with extra/loosely-shaped freshness/binding keys still passes
  // (only schemaRef is a hard requirement; §8's 2-vs-3 key shape is ambiguous)
  const permissive = { ...validControl, evidenceContract: { schemaRef: "pipeline.control-evidence.v1", freshnessAndBinding: "24h, commit-sha" } };
  assert.equal(validateControl(permissive).valid, true);
});

check("rejects a waiver without a revalidation trigger", () => {
  // waiver missing revalidationTrigger
  const bad = { ...waivedControl, waiver: { authority: "ciso", reason: "legacy", expiry: "2026-12-31" } };
  const result = validateControl(bad);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.field === "waiver" && e.code === "SCHEMA-INVALID-WAIVER"));
});

check("rejects an invalid supersedes control ID", () => {
  // supersedes must be null or a valid control ID
  const bad = { ...waivedControl, supersedes: "not-an-id" };
  const result = validateControl(bad);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.field === "supersedes" && e.code === "SCHEMA-INVALID-SUPERSEDES"));
});

check("rejects an invalid superseded-by control ID", () => {
  // supersededBy must be null or a valid control ID
  const bad = { ...validControl, supersededBy: "not-an-id" };
  const result = validateControl(bad);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.field === "supersededBy" && e.code === "SCHEMA-INVALID-SUPERSEDED-BY"));
});

check("rejects a standard mapping without its standard name", () => {
  // standardMappings entry missing "standard"
  const bad = { ...validControl, standardMappings: [{ version: "1.1" }] };
  const result = validateControl(bad);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.field === "standardMappings[0]" && e.code === "SCHEMA-INVALID-STANDARD-MAPPINGS"));
});

check("rejects non-object control records", () => {
  // non-object control records
  for (const bad of [null, undefined, [], "a-string", 42]) {
    const result = validateControl(bad);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.code === "SCHEMA-NOT-OBJECT"));
  }
});

check("validates without mutating mutable or frozen input", () => {
  // purity: no mutation of the input argument
  const before = JSON.stringify(validControl);
  validateControl(validControl);
  assert.equal(JSON.stringify(validControl), before);
  // purity: works against a deeply frozen input without throwing
  const frozen = deepFreeze(structuredClone(validControl));
  assert.doesNotThrow(() => validateControl(frozen));
  assert.equal(validateControl(frozen).valid, true);
});

// --- AC5: lintCatalogContent ---------------------------------------------

check("accepts a catalog whose controls name all required lint fields", () => {
  // catalog where every control names all four fields
  const result = lintCatalogContent([validControl, waivedControl]);
  assert.deepEqual(result, { valid: true });
});

check("reports a missing catalog lint field only on the affected control", () => {
  // exactly one control missing exactly one of the four required fields
  for (const field of ["verifierType", "evidenceContract", "boundary", "defaultFailureMode"]) {
    const bad = { ...waivedControl };
    delete bad[field];
    const result = lintCatalogContent([validControl, bad]);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.controlId === waivedControl.id && e.field === field && e.code === "CATALOG-LINT-MISSING-FIELD"));
    // the other, unaffected control must not be flagged
    assert.ok(!result.errors.some((e) => e.controlId === validControl.id));
  }
});

check("flags non-object catalog entries", () => {
  // non-object entries in the controls array are flagged, not silently skipped
  const result = lintCatalogContent([validControl, null]);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.code === "CATALOG-LINT-NOT-OBJECT"));
});

check("rejects a non-array catalog input", () => {
  assert.throws(() => lintCatalogContent("not-an-array"), TypeError);
  assert.throws(() => lintCatalogContent({ length: 0 }), TypeError);
});

check("lints catalog content without mutating mutable or frozen input", () => {
  // purity: no mutation, works against deeply frozen input
  const controls = [validControl, waivedControl];
  const before = JSON.stringify(controls);
  lintCatalogContent(controls);
  assert.equal(JSON.stringify(controls), before);
  const frozen = deepFreeze(structuredClone(controls));
  assert.doesNotThrow(() => lintCatalogContent(frozen));
  assert.equal(lintCatalogContent(frozen).valid, true);
});

// --- AC8: lintStandardMappingsAndClaims -----------------------------------

check("accepts fully versioned mappings without bare claims", () => {
  // every mapping versioned, no bare claims -> accepted
  assert.deepEqual(lintStandardMappingsAndClaims([goodControl]), { valid: true });
});

check("rejects a version-less standard mapping", () => {
  // version-less mapping entry rejected
  const bad = { ...goodControl, standardMappings: [{ standard: "OWASP ASVS" }] };
  const result = lintStandardMappingsAndClaims([bad]);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.controlId === bad.id && e.code === "CATALOG-LINT-MISSING-VERSION"));
});

check("rejects an unqualified certified claim", () => {
  // bare unqualified "certified" in control prose
  const bad = { ...goodControl, objective: "This control is certified for production use." };
  const result = lintStandardMappingsAndClaims([bad]);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.controlId === bad.id && e.field === "objective" && e.code === "CATALOG-LINT-BARE-CLAIM"));
});

check("rejects an unqualified compliant claim", () => {
  // bare unqualified "compliant" in control prose
  const bad = { ...goodControl, remediation: "Once patched the system is compliant." };
  const result = lintStandardMappingsAndClaims([bad]);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.controlId === bad.id && e.field === "remediation" && e.code === "CATALOG-LINT-BARE-CLAIM"));
});

check("accepts certified and compliant language with a same-sentence qualifier", () => {
  // "certified"/"compliant" WITH a qualifying disclaimer in the same sentence is not flagged
  const qualified = { ...goodControl, objective: "This control is certified only insofar as it is informatively mapped to NIST SSDF." };
  assert.deepEqual(lintStandardMappingsAndClaims([qualified]), { valid: true });
  const qualified2 = { ...goodControl, threat: "Absence of this control is not a certification claim of any kind." };
  assert.deepEqual(lintStandardMappingsAndClaims([qualified2]), { valid: true });
});

check("rejects a bare claim in catalog text", () => {
  // bare claim in the optional catalogText parameter
  const result = lintStandardMappingsAndClaims([goodControl], "This catalog is fully compliant with all standards.");
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.controlId === null && e.field === "catalogText" && e.code === "CATALOG-LINT-BARE-CLAIM"));
});

check("accepts qualified catalog text", () => {
  // catalogText with a disclaimer in the same sentence is not flagged
  const result = lintStandardMappingsAndClaims([goodControl], "This catalog is compliant in the sense that content is informatively mapped to NIST SSDF.");
  assert.deepEqual(result, { valid: true });
});

check("rejects invalid standard mapping lint argument shapes", () => {
  assert.throws(() => lintStandardMappingsAndClaims("not-an-array"), TypeError);
  assert.throws(() => lintStandardMappingsAndClaims([goodControl], 42), TypeError);
});

check("flags a non-object entry during standard mapping lint", () => {
  // non-object entries flagged, not silently skipped
  const result = lintStandardMappingsAndClaims([goodControl, "not-a-control"]);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.code === "CATALOG-LINT-NOT-OBJECT"));
});

check("lints standard mappings without mutating mutable or frozen input", () => {
  // purity: no mutation, works against deeply frozen input
  const controls = [goodControl];
  const before = JSON.stringify(controls);
  lintStandardMappingsAndClaims(controls, "informative text, no bare claims here.");
  assert.equal(JSON.stringify(controls), before);
  const frozen = deepFreeze(structuredClone(controls));
  assert.doesNotThrow(() => lintStandardMappingsAndClaims(frozen));
  assert.equal(lintStandardMappingsAndClaims(frozen).valid, true);
});

check("an early failed case still emits dispositions for the complete declared corpus", () => {
  if (selfProbeChild) return;
  const probe = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], {
    encoding: "utf8",
    env: {
      ...process.env,
      PIPELINE_CCS_TEST_INJECT_FAILURE: "CCS02",
      PIPELINE_CCS_TEST_SELF_PROBE_CHILD: "1",
      PIPELINE_VERIFY_CASE_COMPLETION_FD: "3",
      PIPELINE_VERIFY_CASE_COMPLETION_MAX_BYTES: "65536",
    },
    shell: false,
    stdio: ["ignore", "pipe", "pipe", "pipe"],
    timeout: 30_000,
  });
  assert.notEqual(probe.status, 0, "the injected early case must fail");
  const records = String(probe.output[3]).trim().split("\n").map((line) => JSON.parse(line));
  const disposed = records.filter((record) => record.event === "DISPOSED");
  assert.equal(records[0].event, "DECLARED");
  assert.equal(records[0].caseCount, 33);
  assert.equal(disposed.length, 33);
  assert.equal(disposed.find((record) => record.id === "CCS02")?.disposition, "fail");
  assert.equal(disposed.find((record) => record.id === "CCS33")?.disposition, "pass");
  assert.deepEqual(records.at(-1).counts, { pass: 32, fail: 1, skip: 0, todo: 0 });
  assert.equal(records.at(-1).declaredCount, 33);
  assert.equal(records.at(-1).disposedCount, 33);
});

assert.equal(cases.length, 33, "the complete control catalog schema corpus must be registered before execution begins");
const completionFd = process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD === undefined
  ? openSync(process.platform === "win32" ? "NUL" : "/dev/null", "w")
  : Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD);
registerTestCaseCompletion({
  cases: cases,
  fd: completionFd,
  maxBytes: Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_MAX_BYTES ?? "65536"),
});
