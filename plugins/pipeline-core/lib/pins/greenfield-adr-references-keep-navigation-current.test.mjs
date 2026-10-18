// SPDX-License-Identifier: SUL-1.0
// Pin for pipeline.claude-windows-greenfield-lifecycle-not-walkable (AC-127), slice
// ALF-H5-PF20-ADR-REFERENCES-NAVIGATION.
//
// A real greenfield project could not enter implementation: set-phase --phase implementation was refused with
// GUARD-ARCHITECTURE-FITNESS-NON-GREEN, remedy navigation-currency:restore-navigation-bundle. The guard and the
// readiness library derive the touched contracts with architectureTouchedContracts (every plan path under
// architecture/, docs/adr/ or schemas/). evaluateNavigationCurrency resolved each of them to its owning module, and
// a module owning docs/adr/** whose publicContracts hold only its own contract file made every ADR path a "touched
// contract not in publicContracts" - although the same map already names those ADRs in its modules' adrReferences.
// A design whose modules cite ADRs could therefore never pass class 7.
//
// The rule pinned here: a touched path that ANY loaded module lists in adrReferences is current (the map declares
// it), and a docs/adr/ prefix (a trailing "/" or a "*") is current once at least one module lists a reference under
// it. Nothing else moves: an unreferenced ADR, an architecture/ or schemas/ path its owner omits from
// publicContracts, and an explicit mapStale all still make the map stale.
//
// Every tree below is a real temporary directory holding architecture/map/index.md and real concept files; the
// inventory is loaded by the real loadMapBundle and judged by the real evaluateArchitectureFitness and
// evaluateNavigationCurrency. The derived-path case routes a plan text through the real
// deriveArchitecturePlanningSurface and architectureTouchedContracts, the definition the guard and the library share.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { architectureTouchedContracts, deriveArchitecturePlanningSurface } from "../architecture-entry-readiness.mjs";
import { evaluateArchitectureFitness, evaluateNavigationCurrency } from "../../scripts/architecture-fitness.mjs";
import { loadMapBundle } from "../../scripts/module-inventory.mjs";

const DOC_CONTRACT = "docs/contracts/documentation.md";
const ADR_TENANCY = "docs/adr/0004-tenancy-model.md";
const ADR_LEDGER = "docs/adr/0007-billing-ledger.md";
const UNREFERENCED_ADR = "docs/adr/0099-x.md";
const MAP_CONTRACT = "architecture/map/x-contract.md";
const SCHEMA_CONTRACT = "schemas/y.json";
const STALE = "architecture-map-stale";

const roots = [];
process.on("exit", () => { for (const root of roots) { try { rmSync(root, { recursive: true, force: true }); } catch { /* best effort */ } } });

/** The observed shape: `documentation` owns docs/adr/** and holds only its own contract; two other modules cite ADRs. */
const modules = ({ cite = true } = {}) => [
  { id: "documentation", responsibility: "Owns the decision records and the documentation contract", ownedPaths: ["docs/adr/**", DOC_CONTRACT],
    publicContracts: [DOC_CONTRACT], allowedDependencies: [], adrReferences: [] },
  { id: "tenancy", responsibility: "Owns tenant isolation", ownedPaths: ["src/tenancy/**"], publicContracts: ["src/tenancy/index.mjs"],
    allowedDependencies: [], adrReferences: cite ? [ADR_TENANCY] : [] },
  { id: "billing", responsibility: "Owns the billing ledger", ownedPaths: ["src/billing/**"], publicContracts: ["src/billing/index.mjs"],
    allowedDependencies: ["tenancy"], adrReferences: cite ? [ADR_LEDGER] : [] },
  { id: "platform", responsibility: "Owns the map contract and the schemas", ownedPaths: [MAP_CONTRACT, "schemas/**"],
    publicContracts: ["schemas/z.json"], allowedDependencies: [], adrReferences: [] },
];

const list = (key, values) => (values.length === 0 ? `${key}: []\n` : `${key}:\n${values.map((value) => `  - ${value}`).join("\n")}\n`);
const concept = (mod) => `---\ntype: Governed Module\nid: ${mod.id}\nresponsibility: ${mod.responsibility}\n${list("nonResponsibilities", ["Everything outside the owned paths"])}${
  list("ownedPaths", mod.ownedPaths)}${list("publicContracts", mod.publicContracts)}${list("allowedDependencies", mod.allowedDependencies)}authorityEffects: []\n${
  list("verificationEntryPoints", [])}${list("adrReferences", mod.adrReferences)}---\n\n# ${mod.id}\n`;

/** A real tree: map index, one concept file per module, and (optionally) the active plan the guard would read. */
function tree({ cite = true, plan = null } = {}) {
  const root = mkdtempSync(join(tmpdir(), "alf-h5-pf20-"));
  roots.push(root);
  const put = (rel, text) => { const path = join(root, ...rel.split("/")); mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, text); };
  put("architecture/map/index.md", "# Architecture map\n\nStart here; each concept file below is one governed module.\n");
  for (const mod of modules({ cite })) put(`architecture/map/${mod.id}.md`, concept(mod));
  put("project/pipeline.json", JSON.stringify({ schema: "pipeline.project.v1", project: "alf-h5-pf20", verify: null, autonomy: "gated", handover: "docs/state.md" }));
  if (plan !== null) {
    put("specs/f/prd.md", plan);
    put("project/pipeline-state.json", JSON.stringify({ activeFeature: { id: "feat-1", planPath: "specs/f/prd.md" } }));
  }
  const bundle = loadMapBundle(root);
  assert.equal(bundle.ok, true, `the fixture map must load cleanly: ${JSON.stringify(bundle.errors)}`);
  assert.deepEqual(bundle.modules.map((mod) => mod.id).sort(), ["billing", "documentation", "platform", "tenancy"]);
  return { root, inventory: bundle.modules };
}

/** Class 7 through the aggregate evaluator AND through the class evaluator directly; they must agree. */
function navigation(fixture, touchedContracts, extra = {}) {
  const aggregate = evaluateArchitectureFitness({ rootDir: fixture.root, mode: "planning", touchedContracts, ...extra })
    .outcomes.find((outcome) => outcome.classId === 7);
  const direct = evaluateNavigationCurrency({ rootDir: fixture.root, inventory: fixture.inventory, mode: "planning", touchedContracts, ...extra });
  assert.equal(aggregate.outcome, direct.outcome, "the aggregate evaluator and the class evaluator agree");
  assert.deepEqual(aggregate.violations.map((violation) => violation.ruleId), direct.violations.map((violation) => violation.ruleId));
  return direct;
}
const rules = (outcome) => outcome.violations.map((violation) => violation.ruleId);

test("positive, the observed shape: ADR files cited by two modules plus the docs/adr/ prefix keep class 7 passing", () => {
  const fixture = tree();
  const outcome = navigation(fixture, [ADR_TENANCY, ADR_LEDGER, "docs/adr/"]);
  assert.equal(outcome.outcome, "pass", JSON.stringify(outcome));
  assert.deepEqual(outcome.violations, []);
  assert.deepEqual(fixture.inventory.find((mod) => mod.id === "documentation").publicContracts, [DOC_CONTRACT],
    "the owner of docs/adr/** really omits the ADRs from its publicContracts");
});

test("positive: the glob spelling of the prefix and the owner's own contract are current as well", () => {
  const fixture = tree();
  for (const touched of [["docs/adr/**"], ["docs/adr/*"], ["docs/adr/00*"], [DOC_CONTRACT], [`./${ADR_TENANCY}`]]) {
    const outcome = navigation(fixture, touched);
    assert.equal(outcome.outcome, "pass", `${JSON.stringify(touched)}: ${JSON.stringify(outcome)}`);
  }
});

test("negative: a touched docs/adr file that no module references is still stale", () => {
  const fixture = tree();
  const outcome = navigation(fixture, [UNREFERENCED_ADR]);
  assert.equal(outcome.outcome, "finding", JSON.stringify(outcome));
  assert.deepEqual(rules(outcome), [STALE]);
  const mixed = navigation(fixture, [ADR_TENANCY, ADR_LEDGER, UNREFERENCED_ADR]);
  assert.equal(mixed.outcome, "finding", "one unreferenced ADR among referenced ones is enough");
  assert.deepEqual(rules(mixed), [STALE]);
});

test("negative: a docs/adr prefix is current only while some module cites a reference under that exact prefix", () => {
  const uncited = tree({ cite: false });
  for (const prefix of ["docs/adr/", "docs/adr/**", "docs/adr/*"]) {
    assert.deepEqual(rules(navigation(uncited, [prefix])), [STALE], `no module cites an ADR: ${prefix}`);
  }
  const cited = tree();
  assert.deepEqual(rules(navigation(cited, ["docs/adr/archive/"])), [STALE], "a cited ADR elsewhere does not cover a different sub-prefix");
  assert.deepEqual(rules(navigation(cited, ["docs/adr/archive/**"])), [STALE]);
});

test("negative: an architecture/ or schemas/ path its owner omits from publicContracts is still stale, even beside cited ADRs", () => {
  const fixture = tree();
  for (const contract of [MAP_CONTRACT, SCHEMA_CONTRACT]) {
    const alone = navigation(fixture, [contract]);
    assert.equal(alone.outcome, "finding", `${contract}: ${JSON.stringify(alone)}`);
    assert.deepEqual(rules(alone), [STALE]);
    const beside = navigation(fixture, [ADR_TENANCY, "docs/adr/", contract]);
    assert.equal(beside.outcome, "finding", `${contract} beside cited ADRs: ${JSON.stringify(beside)}`);
    assert.deepEqual(rules(beside), [STALE]);
  }
  assert.equal(navigation(fixture, ["schemas/z.json"]).outcome, "pass", "the same owner's declared contract stays current");
});

test("negative: mapStale true is stale even when every touched path is a cited ADR", () => {
  const fixture = tree();
  const outcome = navigation(fixture, [ADR_TENANCY, ADR_LEDGER, "docs/adr/"], { mapStale: true });
  assert.equal(outcome.outcome, "finding", JSON.stringify(outcome));
  assert.deepEqual(rules(outcome), [STALE]);
  const checkpoint = navigation(fixture, [ADR_TENANCY], { mapStale: true, mode: "push", checkpoint: true });
  assert.equal(checkpoint.outcome, "finding");
  assert.equal(checkpoint.stalenessDebt.length, 1, "the checkpoint-debt branch is unchanged");
  assert.equal(checkpoint.stalenessDebt[0].type, STALE);
});

test("derived path: the plan's own paths run through architectureTouchedContracts pass class 7, and fail without the references", () => {
  const plan = `# Design\n\nDecision records: \`${ADR_TENANCY}\` and ${ADR_LEDGER}, kept under docs/adr/ (module documentation owns docs/adr/**).\n`
    + `The documentation contract is ${DOC_CONTRACT}.\n`;
  const fixture = tree({ plan });
  const surface = deriveArchitecturePlanningSurface(fixture.root);
  assert.ok(surface !== null, "the active plan declares a planning surface");
  const touched = architectureTouchedContracts(surface.paths);
  assert.ok(touched.includes(ADR_TENANCY) && touched.includes(ADR_LEDGER), `both ADR files are touched contracts: ${JSON.stringify(touched)}`);
  assert.ok(touched.every((candidate) => candidate.startsWith("docs/adr/")), JSON.stringify(touched));
  const outcome = navigation(fixture, touched);
  assert.equal(outcome.outcome, "pass", JSON.stringify({ touched, outcome }));

  const control = tree({ cite: false, plan });
  const staleOutcome = navigation(control, architectureTouchedContracts(deriveArchitecturePlanningSurface(control.root).paths));
  assert.equal(staleOutcome.outcome, "finding", "without the references the same derived paths are stale, so the pass above is the references' doing");
  assert.deepEqual(rules(staleOutcome), [STALE]);
});
