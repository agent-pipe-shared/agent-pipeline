// SPDX-License-Identifier: SUL-1.0
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ADR_DRAFT_DISCARD_SCHEMA, adrDraftDiscardPath, adrDraftHintText, classifyDeclaredAdrReferences, compareEffectiveArchitectureDecisions, inspectAdrDraftBindings, inspectEffectiveArchitectureDecisions, inspectArchitectureDecisionAuthoringSources } from "./architecture-effective-decisions.mjs";
import { runArchitectureEffectiveCli } from "../scripts/architecture-effective-decisions.mjs";

const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), "architecture-effective-"));
  mkdirSync(join(root, "docs", "adr"), { recursive: true });
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}
function decision(root, stem, { status = "accepted", scope = "project", body = "# Governing decision\n", supersedes, exception, moduleIds } = {}) {
  const dir = join(root, "docs", "adr");
  writeFileSync(join(dir, `${stem}.md`), body);
  const record = { schema: moduleIds ? "pipeline.architecture-decision.v2" : "pipeline.architecture-decision.v1", id: stem, title: stem,
    status, digest: sha(body), scope, date: "2026-09-25",
    ...(moduleIds ? { moduleIds } : {}),
    ...(supersedes ? { supersedes } : {}), ...(exception ? { exception } : {}) };
  writeFileSync(join(dir, `${stem}.json`), `${JSON.stringify(record)}\n`);
  return record;
}
const NOW = "2026-09-25T12:00:00.000Z";
// Structural view only. Production adds the retained-aggregate adoption filter on top: a bare ADR plus sidecar
// is advisory `decision-adoption-unverified`, never effective (see the adoption test below).
const structural = (root, area = "pipeline-core") => {
  const { purpose, ...view } = inspectArchitectureDecisionAuthoringSources({ rootDir: root, area, now: NOW });
  assert.equal(purpose, "structural-authoring-only");
  return view;
};
const inspect = (root) => structural(root);
function map(root, ids = ["pipeline-core", "harness"]) {
  const dir = join(root, "architecture", "map");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "index.md"), `# Map\n\nOKF v0.1 concept bundle.\n\n${ids.map((id) => `- [${id}](${id}.md)`).join("\n")}\n`);
  for (const id of ids) writeFileSync(join(dir, `${id}.md`), `---
type: Governed Module
id: ${id}
responsibility: Own ${id}
nonResponsibilities: []
ownedPaths:
  - ${id}/**
publicContracts: []
allowedDependencies: []
authorityEffects: []
verificationEntryPoints: []
adrReferences: []
---
# ${id}\n`);
}

test("a structurally valid but unadopted decision is advisory decision-adoption-unverified, never effective", (t) => {
  const root = fixture(t);
  decision(root, "ADR-1");
  const result = inspectEffectiveArchitectureDecisions({ rootDir: root, area: "pipeline-core", now: NOW });
  assert.equal(result.status, "advisory");
  assert.equal(result.code, "ARCH-DECISION-EFFECTIVE-LEGACY-WARNING");
  assert.deepEqual(result.decisions, []);
  assert.deepEqual(result.findings, [{ code: "decision-adoption-unverified", path: "docs/adr/ADR-1.md" }]);
});

test("AC19 source precondition: two isolated reads of the same validated decision set agree", (t) => {
  const root = fixture(t);
  decision(root, "ADR-1");
  const first = inspect(root);
  const second = inspect(root);
  assert.equal(first.status, "ready");
  assert.deepEqual(first.decisions.map(({ id }) => id), ["ADR-1"]);
  assert.equal(compareEffectiveArchitectureDecisions(first, second).code, "ARCH-DECISION-PARITY-MATCH");
});

test("AC19 source precondition: a different valid decision body yields typed divergence", (t) => {
  const leftRoot = fixture(t);
  const rightRoot = fixture(t);
  decision(leftRoot, "ADR-1", { body: "# Decision\nRefuse the write.\n" });
  decision(rightRoot, "ADR-1", { body: "# Decision\nAllow the write.\n" });
  assert.equal(compareEffectiveArchitectureDecisions(inspect(leftRoot), inspect(rightRoot)).code,
    "ARCH-DECISION-PARITY-DIVERGENCE");
});

test("AC19 parity validates the projection digest and includes active-exception differences", (t) => {
  const root = fixture(t);
  decision(root, "ADR-1");
  const left = inspect(root);
  const stale = structuredClone(left);
  stale.decisions[0].digest = "f".repeat(64);
  assert.equal(compareEffectiveArchitectureDecisions(left, stale).code,
    "ARCH-DECISION-PARITY-UNRESOLVED");

  const changedSubject = {
    schema: left.schema,
    status: left.status,
    area: left.area,
    decisions: left.decisions,
    activeExceptions: [{ id: "EX-1", scope: "pipeline-core", expiry: "2026-12-31" }],
    findings: left.findings,
  };
  const right = {
    ...changedSubject,
    code: left.code,
    projectionSha256: sha(JSON.stringify(changedSubject)),
  };
  assert.equal(compareEffectiveArchitectureDecisions(left, right).code,
    "ARCH-DECISION-PARITY-DIVERGENCE");
});

test("legacy, forged, orphan and malformed decision sources never mint an effective projection", (t) => {
  const root = fixture(t);
  const dir = join(root, "docs", "adr");
  writeFileSync(join(dir, "legacy.md"), "# Legacy\nStatus: accepted\n");
  decision(root, "drifted");
  writeFileSync(join(dir, "drifted.md"), "# silently changed\n");
  writeFileSync(join(dir, "orphan.json"), "{}\n");
  writeFileSync(join(dir, "malformed.md"), "# Malformed\n");
  writeFileSync(join(dir, "malformed.json"), "{oops\n");
  const invalid = decision(root, "wrong-status");
  writeFileSync(join(dir, "wrong-status.json"), `${JSON.stringify({ ...invalid, status: "closed", extra: true })}\n`);
  const result = inspect(root);
  assert.equal(result.status, "blocked");
  assert.equal(result.projectionSha256, null);
  assert.deepEqual(result.findings.map(({ code }) => code).sort(), [
    "decision-sidecar-invalid-or-drifted", "decision-source-invalid",
    "legacy-decision-without-sidecar", "orphan-decision-sidecar", "decision-sidecar-invalid-or-drifted",
  ].sort());
  assert.equal(compareEffectiveArchitectureDecisions(result, result).code, "ARCH-DECISION-PARITY-UNRESOLVED");
});

test("accepted supersession requires a real superseded predecessor; proposed decisions are not effective", (t) => {
  const root = fixture(t);
  decision(root, "ADR-old", { status: "superseded" });
  decision(root, "ADR-new", { supersedes: "ADR-old" });
  decision(root, "ADR-draft", { status: "proposed" });
  assert.deepEqual(inspect(root).decisions.map(({ id }) => id), ["ADR-new"]);
  decision(root, "ADR-new", { supersedes: "missing" });
  assert.ok(inspect(root).findings.some(({ code }) => code === "supersession-unresolved"));
});

test("historical ADRs and unscoped v1 module decisions warn without blocking valid decisions", (t) => {
  const root = fixture(t);
  decision(root, "ADR-known");
  decision(root, "ADR-module", { scope: "module" });
  writeFileSync(join(root, "docs", "adr", "legacy.md"), "# Legacy\nStatus: accepted\n");
  const result = inspect(root);
  assert.equal(result.status, "advisory");
  assert.equal(result.code, "ARCH-DECISION-EFFECTIVE-LEGACY-WARNING");
  assert.deepEqual(result.decisions.map(({ id }) => id), ["ADR-known"]);
  assert.deepEqual(result.findings.map(({ code }) => code).sort(), [
    "legacy-decision-without-sidecar", "module-applicability-unresolved",
  ]);
  assert.match(result.projectionSha256, /^[a-f0-9]{64}$/u);
  assert.equal(compareEffectiveArchitectureDecisions(result, inspect(root)).code,
    "ARCH-DECISION-PARITY-ADVISORY-MATCH");
});

test("accepted v2 module applicability is effective only for its explicit, validated module IDs", (t) => {
  const root = fixture(t);
  map(root);
  decision(root, "ADR-project");
  decision(root, "ADR-module", { scope: "module", moduleIds: ["pipeline-core"] });
  decision(root, "ADR-other-module", { scope: "module", moduleIds: ["harness"] });
  decision(root, "ADR-proposed", { status: "proposed", scope: "module", moduleIds: ["pipeline-core"] });
  const core = inspect(root);
  const harness = structural(root, "harness");
  assert.equal(core.status, "ready");
  assert.deepEqual(core.decisions.map(({ id }) => id), ["ADR-module", "ADR-project"]);
  assert.deepEqual(core.decisions[0], { id: "ADR-module", digest: sha("# Governing decision\n"),
    scope: "module", moduleIds: ["pipeline-core"], path: "docs/adr/ADR-module.md" });
  assert.deepEqual(harness.decisions.map(({ id }) => id), ["ADR-other-module", "ADR-project"]);
  assert.equal(core.findings.some(({ code }) => code === "module-applicability-awaiting-approval"), false);
  assert.notEqual(core.projectionSha256, harness.projectionSha256);
  assert.equal(compareEffectiveArchitectureDecisions(core, inspect(root)).code, "ARCH-DECISION-PARITY-MATCH");
  const allAreas = structural(root, "project");
  assert.equal(allAreas.status, "ready");
  assert.deepEqual(allAreas.decisions.map(({ id }) => id), ["ADR-project"]);
  assert.equal(allAreas.findings.some(({ code }) => code === "module-area-unresolved"), false);
});

test("a v2 module decision cannot name absent, duplicate or unsorted modules", (t) => {
  const root = fixture(t);
  map(root);
  decision(root, "ADR-unknown", { scope: "module", moduleIds: ["unknown"] });
  assert.ok(inspect(root).findings.some(({ code }) => code === "module-id-unresolved"));
  decision(root, "ADR-unknown", { scope: "module", moduleIds: ["pipeline-core", "pipeline-core"] });
  assert.ok(inspect(root).findings.some(({ code }) => code === "decision-sidecar-invalid-or-drifted"));
  decision(root, "ADR-unknown", { scope: "module", moduleIds: ["pipeline-core"] });
  rmSync(join(root, "architecture", "map", "index.md"));
  assert.ok(inspect(root).findings.some(({ code }) => code === "module-inventory-unavailable"));
  writeFileSync(join(root, "outside-index.md"), "# Map\n\nOKF v0.1 concept bundle.\n");
  symlinkSync(join(root, "outside-index.md"), join(root, "architecture", "map", "index.md"));
  assert.ok(inspect(root).findings.some(({ code }) => code === "module-inventory-unavailable"));
});

test("the task-path CLI resolves one map owner before selecting module decisions", (t) => {
  const root = fixture(t);
  map(root);
  decision(root, "ADR-module", { scope: "module", moduleIds: ["pipeline-core"] });
  const selected = runArchitectureEffectiveCli(["--root", root, "--path", "pipeline-core/new-feature.mjs"]);
  assert.equal(selected.exitCode, 0);
  assert.equal(selected.output.area, "pipeline-core");
  // Production CLI: no retained approved aggregate lists ADR-module, so it is not effective; the structural view still selects it.
  assert.deepEqual(selected.output.decisions, []);
  assert.deepEqual(selected.output.findings, [{ code: "decision-adoption-unverified", path: "docs/adr/ADR-module.md" }]);
  assert.deepEqual(structural(root, selected.output.area).decisions.map(({ id }) => id), ["ADR-module"]);
  assert.equal(selected.output.findings.some(({ code }) => code === "module-applicability-awaiting-approval"), false);
  assert.equal(runArchitectureEffectiveCli(["--root", root, "--path", "unowned/file.mjs"]).output.code,
    "TASK-MODULE-UNRESOLVED");
  assert.equal(runArchitectureEffectiveCli(["--root", root, "--path", "../outside.mjs"]).output.code,
    "TASK-PATH-INVALID");
  assert.equal(runArchitectureEffectiveCli(["--root", root, "--path", "pipeline-core/a.mjs",
    "--area", "pipeline-core"]).output.code, "ARGUMENTS-INVALID");
});

test("the task-path CLI rejects redirected map authority before resolving an owner", (t) => {
  const root = fixture(t);
  map(root);
  const index = join(root, "architecture", "map", "index.md");
  const outside = join(root, "redirected-index.md");
  writeFileSync(outside, "# Redirected map\n\nOKF v0.1 concept bundle.\n");
  rmSync(index);
  symlinkSync(outside, index);
  const result = runArchitectureEffectiveCli(["--root", root, "--path", "pipeline-core/new-feature.mjs"]);
  assert.equal(result.exitCode, 2);
  assert.equal(result.output.code, "MODULE-INVENTORY-UNAVAILABLE");
});

test("a module-scoped v1 decision and a self-declared waiver remain unresolved", (t) => {
  const root = fixture(t);
  decision(root, "ADR-module", { scope: "module" });
  decision(root, "ADR-waiver", { status: "waived", exception: {
    authority: "human-po", rationale: "Fixture", scope: "project", expiry: "2026-12-31",
  } });
  const result = inspect(root);
  assert.equal(result.status, "blocked");
  assert.deepEqual(result.activeExceptions, []);
  assert.ok(result.findings.some(({ code }) => code === "module-applicability-unresolved"));
  assert.ok(result.findings.some(({ code }) => code === "waiver-human-authority-unverified"));
});

test("the read-only CLI reports unresolved legacy input as a nonblocking warning", (t) => {
  const root = fixture(t);
  assert.equal(runArchitectureEffectiveCli(["--root", root, "--area", "pipeline-core", "--now", "2026-09-25T12:00:00.000Z"]).exitCode, 0);
  writeFileSync(join(root, "docs", "adr", "legacy.md"), "# Legacy\n");
  const advisory = runArchitectureEffectiveCli(["--root", root, "--area", "pipeline-core", "--now", "2026-09-25T12:00:00.000Z"]);
  assert.equal(advisory.exitCode, 0);
  assert.equal(advisory.output.code, "ARCH-DECISION-EFFECTIVE-LEGACY-WARNING");
  writeFileSync(join(root, "docs", "adr", "orphan.json"), "{}\n");
  const blocked = runArchitectureEffectiveCli(["--root", root, "--area", "pipeline-core", "--now", "2026-09-25T12:00:00.000Z"]);
  assert.equal(blocked.exitCode, 2);
  assert.equal(blocked.output.code, "ARCH-DECISION-EFFECTIVE-UNRESOLVED");
  assert.equal(runArchitectureEffectiveCli(["--root", ".", "--area", "pipeline-core"]).exitCode, 2);
});

test("D179 a project without docs/adr has the same inspection result as one with an empty docs/adr", (t) => {
  const emptyRoot = fixture(t);
  const absentRoot = fixture(t);
  rmSync(join(absentRoot, "docs", "adr"), { recursive: true });
  const empty = inspect(emptyRoot);
  const absent = inspect(absentRoot);
  assert.equal(absent.status, empty.status);
  assert.equal(absent.code, empty.code);
  assert.deepEqual(absent.decisions, empty.decisions);
  assert.deepEqual(absent.activeExceptions, empty.activeExceptions);
  assert.deepEqual(absent.findings, empty.findings);
  assert.equal(absent.projectionSha256, empty.projectionSha256);
  assert.notEqual(absent.code, "ARCH-DECISION-SOURCE-UNAVAILABLE");
});

test("D179 docs/adr as a regular file still blocks and names docs/adr", (t) => {
  const root = fixture(t);
  rmSync(join(root, "docs", "adr"), { recursive: true });
  writeFileSync(join(root, "docs", "adr"), "not a directory\n");
  const result = inspect(root);
  assert.equal(result.status, "blocked");
  assert.equal(result.code, "ARCH-DECISION-SOURCE-UNAVAILABLE");
  assert.ok(result.findings.some(({ path }) => path === "docs/adr"));
});

test("D179 docs/adr as a symlink to a directory still blocks and names docs/adr", (t) => {
  const root = fixture(t);
  const real = join(root, "elsewhere");
  mkdirSync(real);
  rmSync(join(root, "docs", "adr"), { recursive: true });
  try { symlinkSync(real, join(root, "docs", "adr"), "dir"); }
  catch (error) { t.skip(`symlink-unsupported-on-platform: ${error.code}`); return; }
  const result = inspect(root);
  assert.equal(result.status, "blocked");
  assert.equal(result.code, "ARCH-DECISION-SOURCE-UNAVAILABLE");
  assert.ok(result.findings.some(({ path }) => path === "docs/adr"));
});

// --- C28-PLAN-GATES (AC-108): which ADR drafts of a feature were never bound into the design package ---
// WSL Claude greenfield 2026-11: the drafts were written, bind-adr-proposals never ran, and the design approval still passed because only an
// `accepted` record is ever read as a decision. The reader below is what submit-plan asks before the PO is asked to sign.
function draftPair(root, slug, { status = "proposed", body = `# ${slug}\n\nThe real decision text.\n` } = {}) {
  const dir = join(root, "docs", "adr");
  writeFileSync(join(dir, `draft-${slug}.md`), body);
  writeFileSync(join(dir, `draft-${slug}.json`), `${JSON.stringify({ schema: "pipeline.architecture-decision.v1", id: `draft-${slug}`, title: slug, status, digest: sha(body), scope: "project", date: "2026-11-10" })}\n`);
  return sha(body);
}
function boundManifest(root, dir, rows) {
  mkdirSync(join(root, dir), { recursive: true });
  writeFileSync(join(root, dir, "prospective-architecture.json"), `${JSON.stringify({ schema: "pipeline.architecture-prospective-materialization.v1",
    decisions: rows.map(({ id, slug, digest }) => ({ id, proposedMarkdown: { path: `docs/adr/draft-${slug}.md`, sha256: digest } })) })}\n`);
}
const bindingStates = (root, featureDirs = ["specs/f"]) => Object.fromEntries(inspectAdrDraftBindings({ rootDir: root, featureDirs }).map((entry) => [entry.slug, entry.state]));

test("C28 ADR drafts: a proposal that no manifest, accepted record or discard names is unbound; no drafts means nothing to bind", (t) => {
  const root = fixture(t);
  assert.deepEqual(inspectAdrDraftBindings({ rootDir: root, featureDirs: ["specs/f"] }), []);
  draftPair(root, "storage-adapter");
  const [only] = inspectAdrDraftBindings({ rootDir: root, featureDirs: ["specs/f"] });
  assert.deepEqual({ slug: only.slug, path: only.path, state: only.state }, { slug: "storage-adapter", path: "docs/adr/draft-storage-adapter.md", state: "unbound" });
});

test("C28 ADR drafts: only a real proposal counts (Markdown plus a proposed sidecar), never an accepted draft or a bare Markdown", (t) => {
  const root = fixture(t);
  draftPair(root, "wanted");
  draftPair(root, "already-accepted", { status: "accepted" });
  writeFileSync(join(root, "docs", "adr", "draft-notes-only.md"), "# notes\n");
  assert.deepEqual(bindingStates(root), { wanted: "unbound" });
});

test("C28 ADR drafts: a draft listed in a manifest of the feature folder with its current digest is bound and names its accepted id", (t) => {
  const root = fixture(t);
  const digest = draftPair(root, "storage-adapter");
  boundManifest(root, "specs/f", [{ id: "0001-storage-adapter", slug: "storage-adapter", digest }]);
  assert.deepEqual(bindingStates(root), { "storage-adapter": "bound" });
  assert.equal(inspectAdrDraftBindings({ rootDir: root, featureDirs: ["specs/f"] })[0].acceptedId, "0001-storage-adapter");
  assert.deepEqual(bindingStates(root, ["specs/other"]), { "storage-adapter": "unbound" }, "a manifest outside the feature folders is not this feature's binding");
  writeFileSync(join(root, "docs", "adr", "draft-storage-adapter.md"), "# changed after binding\n");
  assert.deepEqual(bindingStates(root), { "storage-adapter": "unbound" }, "a draft edited after it was bound must be bound again");
});

test("C28 ADR drafts: a manifest in a nested folder of the feature is found; one that is not a binding manifest is ignored", (t) => {
  const root = fixture(t);
  const digest = draftPair(root, "nested");
  boundManifest(root, "specs/f/design", [{ id: "0002-nested", slug: "nested", digest }]);
  assert.deepEqual(bindingStates(root), { nested: "bound" });
  writeFileSync(join(root, "specs", "f", "design", "prospective-architecture.json"), `${JSON.stringify({ schema: "something-else", decisions: [] })}\n`);
  assert.deepEqual(bindingStates(root), { nested: "unbound" });
});

test("C28 ADR drafts: a draft that was materialized earlier (accepted NNNN record exists) is never unbound again, so later features are not refused", (t) => {
  const root = fixture(t);
  draftPair(root, "storage-adapter");
  decision(root, "0004-storage-adapter", { status: "accepted" });
  assert.deepEqual(bindingStates(root, ["specs/another-feature"]), { "storage-adapter": "materialized" });
  assert.equal(inspectAdrDraftBindings({ rootDir: root, featureDirs: [] })[0].acceptedId, "0004-storage-adapter");
});

test("C28 ADR drafts: a discard record for the exact draft bytes resolves it; an edited draft is not silently exempt", (t) => {
  const root = fixture(t);
  const digest = draftPair(root, "unwanted");
  mkdirSync(join(root, "docs", "adr", "discarded"), { recursive: true });
  const record = { schema: ADR_DRAFT_DISCARD_SCHEMA, id: "draft-unwanted", markdownSha256: digest, reason: "superseded by the storage decision", discardedAt: NOW };
  writeFileSync(join(root, adrDraftDiscardPath("unwanted")), `${JSON.stringify(record)}\n`);
  assert.deepEqual(bindingStates(root), { unwanted: "discarded" });
  writeFileSync(join(root, "docs", "adr", "draft-unwanted.md"), "# the slug was reused for a new proposal\n");
  assert.deepEqual(bindingStates(root), { unwanted: "unbound" });
  assert.equal(adrDraftDiscardPath("unwanted"), "docs/adr/discarded/draft-unwanted.json");
});

test("C28 ADR drafts: the discard record directory raises no decision finding (an orphan sidecar would block submit-plan)", (t) => {
  const root = fixture(t);
  const digest = draftPair(root, "unwanted");
  mkdirSync(join(root, "docs", "adr", "discarded"), { recursive: true });
  writeFileSync(join(root, adrDraftDiscardPath("unwanted")), `${JSON.stringify({ schema: ADR_DRAFT_DISCARD_SCHEMA, id: "draft-unwanted", markdownSha256: digest, reason: "no longer needed", discardedAt: NOW })}\n`);
  assert.deepEqual(inspect(root).findings, []);
});

// --- AC-112 (candidate 31, L4 stages 2 and 3): the module adrReferences a design declares that have neither a draft nor an accepted record ---
// Derived from the files and the declared paths alone: no stored status. submit-plan prints the notice, create-adr --from-design creates the drafts.
const declared = (...references) => [{ id: "persistence", adrReferences: references }, { id: "ui", adrReferences: [] }];

test("AC-112 declared ADR paths: a path with no draft and no accepted record is pending, with a title derived from the slug", (t) => {
  const root = fixture(t);
  const { pending, skipped } = classifyDeclaredAdrReferences({ rootDir: root, modules: declared("docs/adr/0002-storage.md", "./docs/adr/0003-local-cache-layer.md") });
  assert.deepEqual(pending, [
    { slug: "local-cache-layer", reference: "docs/adr/0003-local-cache-layer.md", title: "Local cache layer" },
    { slug: "storage", reference: "docs/adr/0002-storage.md", title: "Storage" }]);
  assert.deepEqual(skipped, []);
});

test("AC-112 declared ADR paths: a draft of the slug (any state) or an accepted record with another number is skipped and named, never pending", (t) => {
  const root = fixture(t);
  draftPair(root, "has-draft");
  decision(root, "0001-already", { status: "accepted" });
  decision(root, "0004-old-one", { status: "superseded" });
  decision(root, "0005-only-proposed", { status: "proposed" });
  const { pending, skipped } = classifyDeclaredAdrReferences({ rootDir: root, modules: declared("docs/adr/0002-has-draft.md", "docs/adr/0007-already.md", "docs/adr/0009-old-one.md", "docs/adr/0006-only-proposed.md") });
  assert.deepEqual(pending.map((entry) => entry.slug), ["only-proposed"], "a proposed NNNN record is not an accepted record");
  assert.deepEqual(skipped.map((entry) => [entry.slug, entry.reason]), [["already", "accepted"], ["has-draft", "draft"], ["old-one", "accepted"]]);
});

test("AC-112 declared ADR paths: other shapes, duplicates across modules and a malformed module list are ignored; nothing throws", (t) => {
  const root = fixture(t);
  const modules = [{ id: "a", adrReferences: ["docs/adr/0002-storage.md", "docs/adr/draft-x.md", "docs/adr/0002-Storage.md", "docs/other/0002-y.md", "docs/adr/0002-z.json", 7, null] },
    { id: "b", adrReferences: ["docs/adr/0003-storage.md"] }, null, { id: "c" }, { id: "d", adrReferences: "docs/adr/0002-q.md" }];
  assert.deepEqual(classifyDeclaredAdrReferences({ rootDir: root, modules }).pending.map((entry) => entry.slug), ["storage"]);
  for (const bad of [undefined, null, "x", {}]) assert.deepEqual(classifyDeclaredAdrReferences({ rootDir: root, modules: bad }), { pending: [], skipped: [] });
  assert.deepEqual(classifyDeclaredAdrReferences({ rootDir: join(root, "missing"), modules: declared("docs/adr/0002-storage.md") }).pending.map((entry) => entry.slug), ["storage"], "no docs/adr at all means everything is pending");
});

test("AC-112 declared ADR paths: the notice names the exact create-adr commands, the one-entry form, and is null when nothing is pending", (t) => {
  const root = fixture(t);
  const script = join(root, "scripts", "create-adr.mjs");
  assert.equal(adrDraftHintText({ rootDir: root, modules: declared(), createAdrScript: script }), null);
  const text = adrDraftHintText({ rootDir: root, modules: declared("docs/adr/0002-storage.md"), createAdrScript: script });
  assert.ok(text.includes(`node ${script} --root ${root} --from-design`), text);
  assert.ok(text.includes(`node ${script} --root ${root} --slug storage --title "Storage"`), text);
  assert.ok(text.includes("docs/adr/0002-storage.md"), text);
  assert.doesNotMatch(text, /ADR-DRAFT/u, "a notice, not one of the refusal codes the submit-plan pins match");
  assert.ok(text.indexOf("cancel-submitted-plan") !== -1 && text.indexOf("cancel-submitted-plan") < text.indexOf("--from-design"), "the withdraw step comes first: a draft written while the submission stands could not be bound");
  const two = adrDraftHintText({ rootDir: root, modules: declared("docs/adr/0002-storage.md", "docs/adr/0003-cache.md"), createAdrScript: script });
  assert.ok(two.includes("--from-design") && two.includes(`--slug cache --title "Cache"`) && two.includes(`--slug storage --title "Storage"`), two);
});
