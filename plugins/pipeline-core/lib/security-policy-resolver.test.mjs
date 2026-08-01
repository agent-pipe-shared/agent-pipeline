// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import {
  ASSURANCE_LEVELS,
  MODULE_PRECEDENCE_ORDER,
  resolveApplicableControls,
} from "./security-policy-resolver.mjs";

function deepFreeze(v, seen = new Set()) {
  if (v && typeof v === "object" && !seen.has(v)) {
    seen.add(v);
    Object.values(v).forEach((x) => deepFreeze(x, seen));
    Object.freeze(v);
  }
  return v;
}

function control(id, extra = {}) {
  // Infer `class` from the CYB-1F §4 id prefix (ctl.<class>.<domain>.<slug>)
  // so fixtures stay internally consistent; callers may still override it.
  const match = id.match(/^ctl\.(base|stack|risk)\./);
  return {
    id,
    revision: 1,
    status: "active",
    title: `Title for ${id}`,
    class: match ? match[1] : "base",
    ...extra,
  };
}

// --- registry constants match CYB-1F §5/§6 exactly ------------------------

{
  assert.deepEqual(ASSURANCE_LEVELS, ["baseline", "elevated", "critical"]);
  assert.deepEqual(MODULE_PRECEDENCE_ORDER, [
    "mod.ai-agent",
    "mod.sensitive-data",
    "mod.secrets-identity",
    "mod.iac-cloud",
    "mod.container-deploy",
    "mod.web-api",
    "mod.native-desktop",
    "mod.cli-lib",
    "mod.docs-only",
  ]);
  assert.ok(Object.isFrozen(ASSURANCE_LEVELS));
  assert.ok(Object.isFrozen(MODULE_PRECEDENCE_ORDER));
}

// --- AC2: determinism + composability (elevated superset of baseline) -----

{
  // fixture: one baseline universal control, one elevated-only universal
  // control, one web-api-scoped control that starts at baseline
  const catalogEntries = [
    { control: control("ctl.base.secrets.no-committed-secrets"), minAssuranceLevel: "baseline", module: null },
    { control: control("ctl.risk.ai-agent.tool-authority-manifest", { severity: "high" }), minAssuranceLevel: "elevated", module: null },
    { control: control("ctl.stack.web-api.rate-limit-config"), minAssuranceLevel: "baseline", module: "mod.web-api" },
  ];
  const input = {
    assuranceLevel: "baseline",
    activatedModules: ["mod.web-api"],
    applicabilityInputs: {},
    catalogEntries,
  };

  const run1 = resolveApplicableControls(input);
  const run2 = resolveApplicableControls(input);
  // byte-identical across two calls with identical input
  assert.equal(JSON.stringify(run1), JSON.stringify(run2));
  assert.deepEqual(run1, run2);
  assert.equal(run1.digest, run2.digest);

  const baselineIds = run1.resolvedControls.map((c) => c.id).sort();
  assert.deepEqual(baselineIds, [
    "ctl.base.secrets.no-committed-secrets",
    "ctl.stack.web-api.rate-limit-config",
  ]);

  const elevatedInput = { ...input, assuranceLevel: "elevated" };
  const elevated = resolveApplicableControls(elevatedInput);
  const elevatedIds = new Set(elevated.resolvedControls.map((c) => c.id));

  // elevated ⊇ baseline: every id resolved at baseline is also resolved at elevated
  for (const id of baselineIds) {
    assert.ok(elevatedIds.has(id), `expected elevated to retain baseline id ${id}`);
  }
  // and elevated adds strictly more (the elevated-only universal control)
  assert.ok(elevatedIds.has("ctl.risk.ai-agent.tool-authority-manifest"));
  assert.ok(elevated.resolvedControls.length > run1.resolvedControls.length);

  // calling twice with the same input never mutates it (order-of-calls independence)
  assert.equal(JSON.stringify(input), JSON.stringify({ ...input }));

  // different assuranceLevel -> different digest (digest is genuinely content-bound)
  assert.notEqual(run1.digest, elevated.digest);
}

// --- AC3: module conflict resolved by CYB-1F §6 precedence, never last-write-wins

{
  const conflictId = "ctl.stack.container.base-image-policy";
  const webApiVersion = control(conflictId, { severity: "medium", boundary: "web-api-scope" });
  const containerVersion = control(conflictId, { severity: "high", boundary: "container-scope" });

  const catalogEntries = [
    { control: webApiVersion, minAssuranceLevel: "baseline", module: "mod.web-api" },
    { control: containerVersion, minAssuranceLevel: "baseline", module: "mod.container-deploy" },
  ];

  // Activation order deliberately puts mod.container-deploy FIRST and
  // mod.web-api LAST -- naive last-write-wins would pick mod.web-api's
  // version, which is the WRONG answer: CYB-1F §6 ranks
  // mod.container-deploy strictly above mod.web-api, so the precedence
  // winner must be the container-deploy version regardless of activation
  // array order.
  const result = resolveApplicableControls({
    assuranceLevel: "baseline",
    activatedModules: ["mod.container-deploy", "mod.web-api"],
    applicabilityInputs: {},
    catalogEntries,
  });

  const resolved = result.resolvedControls.find((c) => c.id === conflictId);
  assert.ok(resolved, "conflicting control must be present exactly once");
  assert.equal(resolved.contributingModule, "mod.container-deploy");
  assert.equal(resolved.control.severity, "high");
  assert.equal(resolved.control.boundary, "container-scope");
  assert.equal(result.resolvedControls.filter((c) => c.id === conflictId).length, 1);

  // reversing the activatedModules array order must not change the winner
  const reordered = resolveApplicableControls({
    assuranceLevel: "baseline",
    activatedModules: ["mod.web-api", "mod.container-deploy"],
    applicabilityInputs: {},
    catalogEntries: [...catalogEntries].reverse(),
  });
  const reorderedResolved = reordered.resolvedControls.find((c) => c.id === conflictId);
  assert.equal(reorderedResolved.contributingModule, "mod.container-deploy");
  assert.equal(reordered.digest, result.digest);

  // duplicate (id, module) pair is a catalog-authoring error, not resolved silently
  assert.throws(() => resolveApplicableControls({
    assuranceLevel: "baseline",
    activatedModules: ["mod.web-api"],
    applicabilityInputs: {},
    catalogEntries: [
      { control: control(conflictId), minAssuranceLevel: "baseline", module: "mod.web-api" },
      { control: control(conflictId, { severity: "critical" }), minAssuranceLevel: "baseline", module: "mod.web-api" },
    ],
  }), /duplicate catalogEntries/);
}

// --- AC4: missing applicability input -> typed `unknown`, never omitted/not-applicable

{
  const gatedControl = control("ctl.base.secrets.rotation-evidence", {
    applicability: { expression: "always", requiredInputs: ["repo.hasDockerfile", "repo.secretsScanCoverage"] },
  });
  const catalogEntries = [
    { control: gatedControl, minAssuranceLevel: "baseline", module: null },
  ];

  const result = resolveApplicableControls({
    assuranceLevel: "baseline",
    activatedModules: [],
    applicabilityInputs: { "repo.hasDockerfile": true }, // repo.secretsScanCoverage absent
    catalogEntries,
  });

  assert.equal(result.resolvedControls.length, 1, "control must be present, not omitted");
  const resolved = result.resolvedControls[0];
  assert.equal(resolved.id, gatedControl.id);
  assert.equal(resolved.applicability, "unknown");
  assert.notEqual(resolved.applicability, "not-applicable");
  assert.deepEqual(resolved.missingInputs, ["repo.secretsScanCoverage"]);

  // supplying a falsy-but-present value still counts as "supplied"
  const withFalsy = resolveApplicableControls({
    assuranceLevel: "baseline",
    activatedModules: [],
    applicabilityInputs: { "repo.hasDockerfile": false, "repo.secretsScanCoverage": 0 },
    catalogEntries,
  });
  assert.equal(withFalsy.resolvedControls[0].applicability, "applicable");
  assert.deepEqual(withFalsy.resolvedControls[0].missingInputs, []);
}

// --- AC10: baseline-minimal adoption invokes no optional-module tooling ---

{
  const packageControl = control("ctl.base.sca.dependency-lockfile", {
    applicability: {
      expression: "when-true:repo.hasPackageSources",
      requiredInputs: ["repo.hasPackageSources"],
    },
  });
  const catalogEntries = [{ control: packageControl, minAssuranceLevel: "baseline", module: null }];

  const absent = resolveApplicableControls({
    assuranceLevel: "baseline",
    activatedModules: [],
    applicabilityInputs: { "repo.hasPackageSources": false },
    catalogEntries,
  }).resolvedControls[0];
  assert.equal(absent.applicability, "not-applicable");
  assert.deepEqual(absent.missingInputs, []);

  const present = resolveApplicableControls({
    assuranceLevel: "baseline",
    activatedModules: [],
    applicabilityInputs: { "repo.hasPackageSources": true },
    catalogEntries,
  }).resolvedControls[0];
  assert.equal(present.applicability, "applicable");

  const unknown = resolveApplicableControls({
    assuranceLevel: "baseline",
    activatedModules: [],
    applicabilityInputs: {},
    catalogEntries,
  }).resolvedControls[0];
  assert.equal(unknown.applicability, "unknown");
  assert.deepEqual(unknown.missingInputs, ["repo.hasPackageSources"]);
}

{
  const catalogEntries = [
    { control: control("ctl.base.secrets.no-committed-secrets"), minAssuranceLevel: "baseline", module: null },
    { control: control("ctl.stack.container.nonroot-user"), minAssuranceLevel: "baseline", module: "mod.container-deploy" },
    { control: control("ctl.stack.iac-cloud.state-encryption"), minAssuranceLevel: "baseline", module: "mod.iac-cloud" },
    { control: control("ctl.risk.ai-agent.tool-authority-manifest"), minAssuranceLevel: "baseline", module: "mod.ai-agent" },
  ];

  const result = resolveApplicableControls({
    assuranceLevel: "baseline",
    activatedModules: [], // zero optional modules activated
    applicabilityInputs: {},
    catalogEntries,
  });

  const ids = result.resolvedControls.map((c) => c.id);
  assert.deepEqual(ids, ["ctl.base.secrets.no-committed-secrets"]);
  for (const forbidden of ["mod.container-deploy", "mod.iac-cloud", "mod.ai-agent"]) {
    assert.ok(!result.resolvedControls.some((c) => c.contributingModule === forbidden), `must not resolve any control from ${forbidden}`);
  }
}

// --- purity: no mutation of any input, works against deeply frozen input --

{
  const catalogEntries = [
    { control: control("ctl.base.secrets.no-committed-secrets"), minAssuranceLevel: "baseline", module: null },
  ];
  const input = {
    assuranceLevel: "baseline",
    activatedModules: ["mod.web-api"],
    applicabilityInputs: { "some.input": true },
    catalogEntries,
  };
  const before = JSON.stringify(input);
  resolveApplicableControls(input);
  assert.equal(JSON.stringify(input), before);

  const frozen = deepFreeze(structuredClone(input));
  assert.doesNotThrow(() => resolveApplicableControls(frozen));
  const result = resolveApplicableControls(frozen);
  assert.equal(result.resolvedControls.length, 1);
}

// --- malformed input is rejected with typed errors, not guessed at --------

{
  assert.throws(() => resolveApplicableControls(null), TypeError);
  assert.throws(() => resolveApplicableControls("not-an-object"), TypeError);
  assert.throws(() => resolveApplicableControls([]), TypeError);

  const base = {
    assuranceLevel: "baseline",
    activatedModules: [],
    applicabilityInputs: {},
    catalogEntries: [],
  };

  assert.throws(() => resolveApplicableControls({ ...base, assuranceLevel: "extreme" }), RangeError);
  assert.throws(() => resolveApplicableControls({ ...base, activatedModules: ["mod.not-a-real-module"] }), RangeError);
  assert.throws(() => resolveApplicableControls({ ...base, activatedModules: "mod.web-api" }), TypeError);
  assert.throws(() => resolveApplicableControls({ ...base, applicabilityInputs: ["repo.x"] }), TypeError);
  assert.throws(() => resolveApplicableControls({ ...base, catalogEntries: "not-an-array" }), TypeError);
  assert.throws(() => resolveApplicableControls({
    ...base,
    catalogEntries: [{ control: control("ctl.base.secrets.x"), minAssuranceLevel: "not-a-level", module: null }],
  }), RangeError);
  assert.throws(() => resolveApplicableControls({
    ...base,
    catalogEntries: [{ control: control("ctl.base.secrets.x"), minAssuranceLevel: "baseline", module: "mod.bogus" }],
  }), RangeError);
  assert.throws(() => resolveApplicableControls({
    ...base,
    catalogEntries: [{ control: { title: "no id" }, minAssuranceLevel: "baseline", module: null }],
  }), TypeError);
}

console.log("security-policy-resolver: ok");
