#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * Regression pin: pipeline.plan-submission-must-not-require-separate-po-approval
 * (AC-227). Agent-authored plan submission needs no human acknowledgement or
 * signature; the single final PO decision is the only thing that grants
 * implementation authority.
 *
 * Every case drives the real `pipeline-state.mjs` `run()` entry point (the
 * sanctioned writer) with its documented injection seams (`poGateAuthority`,
 * `poGateProfile`, `now`, `readHumanApprovalMode`). No behaviour under test is
 * mocked. Fixtures live under the repository's scratch/ directory.
 */
import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { isolateFromStoredOperatorLabel } from "../test-tmpdir.mjs";
isolateFromStoredOperatorLabel();
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { run, statePath } from "../../scripts/pipeline-state.mjs";
import { applyOnboardingIntakeConsent } from "../onboarding-continuity.mjs";
import { recordOnboardingConsent } from "../../scripts/onboarding-consent-mark.mjs";
import { initialGreenfieldMapTargets } from "../architecture-map-scaffold.mjs";
import { designWorkflowAdvisorExceptionRationale, designWorkflowAdvisorQuestionSha256, validateDesignWorkflowPackage } from "../design-workflow-package.mjs";
import { createAdvisoryAttemptTrail } from "../advisory-attempt-trail.mjs";
import { designReadinessReportSha256 } from "../design-readiness-host-evidence.mjs";

const SCRATCH = fileURLToPath(new URL("../../../../scratch/", import.meta.url));
const SCRIPT = fileURLToPath(new URL("../../scripts/pipeline-state.mjs", import.meta.url));
const NOW = "2026-10-12T12:00:00.000Z";
const roots = [];
afterEach(() => { while (roots.length) rmSync(roots.pop(), { recursive: true, force: true }); });

const sha256Hex = (bytes) => createHash("sha256").update(bytes).digest("hex");

function capture(argv, deps) {
  const out = []; const err = [];
  const log = console.log; const error = console.error;
  console.log = (...v) => out.push(v.join(" "));
  console.error = (...v) => err.push(v.join(" "));
  try { return { status: run(argv, deps), out: out.join("\n"), err: err.join("\n") }; }
  finally { console.log = log; console.error = error; }
}

function git(root, ...args) {
  const r = spawnSync("git", ["-C", root, ...args], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
}

function readState(root) { return JSON.parse(readFileSync(statePath(root), "utf8")); }

/** A draft mini-profile feature: real plan/spec bytes, real State, injected authority seams. */
function fixture(featureId, { intake = false } = {}) {
  mkdirSync(SCRATCH, { recursive: true });
  const root = mkdtempSync(join(SCRATCH, "plan-submission-pin-"));
  roots.push(root);
  git(root, "init", "-q", "-b", "main");
  git(root, "config", "user.name", "Jordan Example");
  // A born HEAD is required: the State authority route fails on an unborn HEAD (WT-GIT-FAILED).
  git(root, "-c", "user.name=x", "-c", "user.email=x@example.invalid", "commit", "-q", "--allow-empty", "-m", "init");
  mkdirSync(join(root, ".claude"), { recursive: true });
  mkdirSync(join(root, "project"), { recursive: true });
  const planPath = `specs/${featureId}/prd.md`;
  const specPath = `specs/${featureId}/spec.md`;
  mkdirSync(join(root, "specs", featureId), { recursive: true });
  const specBytes = Buffer.from("# Technical Spec\nOrdinary fixture authority.\n", "utf8");
  const specSha256 = sha256Hex(specBytes);
  const planBytes = Buffer.from(`<!-- po-language: en -->\n<!-- technical-spec-sha256: ${specSha256} -->\n# PRD\n${featureId}\n`, "utf8");
  const planSha256 = sha256Hex(planBytes);
  writeFileSync(join(root, specPath), specBytes);
  writeFileSync(join(root, planPath), planBytes);
  if (intake) applyOnboardingIntakeConsent({ rootDir: root, granted: true, profile: "mini", activate: true });
  assert.equal(run(["set-feature", "--id", featureId, "--plan-path", planPath], { dir: root, now: () => NOW }), 0);
  const profile = {
    schema: "pipeline.po-gate-authority-evidence.v1", humanFacing: "en",
    sourceSha256: "1".repeat(64), runtimeSha256: "2".repeat(64),
    receiptSha256: "3".repeat(64), repositoryFingerprint: "4".repeat(64),
  };
  const authorityValue = { ...profile, schema: "pipeline.po-gate-authority.v2", planPath, planSha256, specPath, specSha256 };
  const deps = {
    dir: root, now: () => NOW,
    poGateProfile: () => ({ ok: true, value: profile }),
    poGateAuthority: () => ({ ok: true, value: authorityValue }),
    // D165-S4: submit-plan consults architecture readiness; this fixture has no architecture map, so it supplies a ready stub.
    architectureEntryReadiness: () => ({ status: "ready", code: null, nextAction: null }),
  };
  return { root, deps, planPath, specPath, planSha256, specSha256, profile, authorityValue };
}

const submitArgs = (profile = "mini") => ["submit-plan", "--by", "coordinator", "--profile", profile];

test("AC1: agent submission succeeds with no human acknowledgement input, prompt, or signature (real writer)", () => {
  const f = fixture("pin-submit");
  const before = readState(f.root);
  assert.equal(before.planSubmission, undefined);
  // No isattyFn/readLineFn/proof/receipt/ack flag of any kind is supplied.
  const result = capture(submitArgs(), f.deps);
  assert.equal(result.status, 0, result.err);
  assert.match(result.out, /lifecycle="awaiting-approval"/);
  const state = readState(f.root);
  assert.equal(state.planSubmission.submittedBy, "coordinator");
  assert.equal(state.planSubmission.planSha256, f.planSha256);
  assert.equal(state.planSubmission.specSha256, f.specSha256);
  // The submission writes no human-decision record of any kind.
  for (const key of ["poGateAcknowledgement", "planApproval", "planApprovalAttribution", "planApprovalProof"]) {
    assert.ok(state[key] === undefined || state[key] === null, `submit-plan must not create ${key}`);
  }
  assert.notEqual(result.out.includes("acknowledg"), true, "submit-plan output must not ask for an acknowledgement");
});

test("AC1: submit-plan never emits a content-acknowledgement stop on a clean plan, and the stop schema is absent from success", () => {
  const f = fixture("pin-no-stop");
  const result = capture(submitArgs(), f.deps);
  assert.equal(result.status, 0, result.err);
  // Restated 2026-11-02 (candidate 18, C18-2, QG-04, own hunk; intent kept: a clean submission emits no stop and no acknowledgement request):
  // a project without a verify command now gets one informational line naming configure-verify (a warning, the submission continues). The
  // fixture has no verify command, so exactly that line may appear; every other stderr byte is still refused.
  // G20-19: the line now names the admitted `set-phase ... --verify-command` route instead of configure-verify.
  const noVerifyCommand = /^Warning: submit-plan: the project verify command is missing\. [^\n]*set-phase --phase implementation --verify-command[^\n]*$/mu;
  assert.equal(result.err.replace(noVerifyCommand, "").trim(), "");
  assert.ok(!result.out.includes("pipeline.submit-plan-stop.v1"));
  assert.ok(!result.out.includes("PO-GATE-PRD-ACKNOWLEDGEMENT-MISSING"));
});

test("AC1: the returned draft next-action is a runnable submit-plan command that states no confirmation is required", () => {
  const f = fixture("pin-draft-action", { intake: true });
  const result = capture(["inspect"], f.deps);
  assert.equal(result.status, 0, result.err);
  const action = JSON.parse(result.out).nextAction;
  assert.equal(action.kind, "command");
  assert.deepEqual(action.argv, [SCRIPT, "submit-plan", "--by", "Jordan Example", "--profile", "mini"]);
  assert.equal(action.mutation, true);
  assert.equal(action.requiresConfirmation, false);
  assert.equal(action.inputs, undefined);
  assert.equal(action.input, undefined);
  // The returned action is itself executable against the real writer.
  const submitted = capture(action.argv.slice(1), f.deps);
  assert.equal(submitted.status, 0, submitted.err);
});

test("AC1/AC4: the post-submission next-action is the mechanical present-plan command with no confirmation", () => {
  const f = fixture("pin-present-action");
  assert.equal(capture(submitArgs(), f.deps).status, 0);
  const result = capture(["inspect"], f.deps);
  assert.equal(result.status, 0, result.err);
  const payload = JSON.parse(result.out);
  assert.equal(payload.status, "awaiting-approval");
  assert.equal(payload.nextAction.kind, "command");
  assert.deepEqual(payload.nextAction.argv.slice(1, 2), ["present-plan"]);
  assert.equal(payload.nextAction.requiresConfirmation, false);
});

// G20-45: the Pipeline states, in the action it hands over, that the user's recorded onboarding consent covers the step; the design approval stays gated.
test("G20-45: with a recorded onboarding consent the inspect next-action for submit-plan and present-plan is covered by it, with a verbatim escalation line", () => {
  const f = fixture("pin-covered", { intake: true });
  assert.equal(JSON.parse(capture(["inspect"], f.deps).out).nextAction.coveredBy, undefined, "no record, no claim");
  recordOnboardingConsent(f.root, "s1", "yes", "2026-11-08T10:00:00.000Z", "ja bitte installieren");
  const draft = JSON.parse(capture(["inspect"], f.deps).out).nextAction;
  assert.deepEqual(draft.argv.slice(1, 2), ["submit-plan"]);
  assert.equal(draft.requiresConfirmation, false);
  assert.equal(draft.coveredBy.record, ".claude/.pipeline-install-consent-s1.json");
  assert.equal(draft.coveredBy.step, "submit-plan");
  assert.match(draft.escalationJustification, /^covered by the user's recorded onboarding consent \(\.claude\/\.pipeline-install-consent-s1\.json\): .+; no further approval before the design approval$/u);
  assert.equal(capture(draft.argv.slice(1), f.deps).status, 0);
  const present = JSON.parse(capture(["inspect"], f.deps).out).nextAction;
  assert.deepEqual(present.argv.slice(1, 2), ["present-plan"]);
  assert.equal(present.requiresConfirmation, false);
  assert.equal(present.coveredBy.step, "present-plan");
});

test("G20-45: the design approval step is never marked covered by the onboarding consent, in either approval mode", () => {
  for (const mode of ["chat", "signature"]) {
    const f = fixture(`pin-covered-gate-${mode}`);
    recordOnboardingConsent(f.root, "s1", "yes", "2026-11-08T10:00:00.000Z");
    assert.equal(capture(submitArgs(), f.deps).status, 0);
    assert.equal(capture(["present-plan", "--by", "coordinator"], f.deps).status, 0);
    const deps = { ...f.deps, readHumanApprovalMode: () => ({ mode, source: "pipeline.user.yaml", key: "human_approval", scope: "global" }) };
    const payload = JSON.parse(capture(["inspect"], deps).out);
    assert.equal(payload.status, "awaiting-approval");
    assert.ok(!JSON.stringify(payload.nextAction).includes("coveredBy"), `mode ${mode}: ${JSON.stringify(payload.nextAction)}`);
    const approve = payload.nextAction.applyAction ?? payload.nextAction;
    if (approve.argv?.includes("approve-plan")) assert.equal(approve.requiresConfirmation, true);
  }
});

test("AC4: submission and presentation grant no implementation authority; approval is a separate final step", () => {
  const f = fixture("pin-no-authority");
  assert.equal(capture(submitArgs(), f.deps).status, 0);
  let state = readState(f.root);
  assert.equal(state.planApproved, false);
  assert.equal(state.activeFeature.phase, "design");
  assert.equal(capture(["present-plan", "--by", "coordinator"], f.deps).status, 0);
  state = readState(f.root);
  assert.equal(state.planApproved, false, "presenting the package must not approve it");
  assert.equal(state.activeFeature.phase, "design", "presenting must not enter implementation");
  assert.ok(state.planApproval === undefined || state.planApproval === null);
  const inspected = JSON.parse(capture(["inspect"], f.deps).out);
  assert.equal(inspected.planApproved, false);
  assert.equal(inspected.phase, "design");
});

test("AC4/AC6: both approval modes - the one final decision stays human-gated and no machine-runnable approve exists", () => {
  for (const mode of ["chat", "signature"]) {
    const f = fixture(`pin-mode-${mode}`);
    assert.equal(capture(submitArgs(), f.deps).status, 0);
    assert.equal(capture(["present-plan", "--by", "coordinator"], f.deps).status, 0);
    const deps = { ...f.deps, readHumanApprovalMode: () => ({ mode, source: "pipeline.user.yaml", key: "human_approval", scope: "global" }) };
    const payload = JSON.parse(capture(["inspect"], deps).out);
    assert.equal(payload.status, "awaiting-approval");
    const action = payload.nextAction;
    // Never a bare machine-executable approve-plan argv (that would let an agent approve for the PO).
    assert.ok(!(action.kind === "command" && action.requiresConfirmation === false
      && Array.isArray(action.argv) && action.argv.includes("approve-plan")),
    `mode ${mode}: no unconfirmed approve-plan command may be offered`);
    // Implementation stays refused until the final decision: submission + presentation alone
    // cannot start implementation.
    const attempt = capture(["set-phase", "--phase", "implementation"], deps);
    assert.notEqual(attempt.status, 0, `mode ${mode}: ${attempt.out} ${attempt.err}`);
    const state = readState(f.root);
    assert.equal(state.planApproved, false);
    assert.equal(state.activeFeature.phase, "design");
  }
});

test("AC4: approve-plan before present-plan is refused naming present-plan; submission alone leaves it unapproved", () => {
  const f = fixture("pin-approve-before-present");
  assert.equal(capture(submitArgs(), f.deps).status, 0);
  const attempt = capture(["approve-plan", "--by", "po-test"], f.deps);
  assert.equal(attempt.status, 2);
  assert.match(attempt.err, /present-plan/);
  assert.equal(readState(f.root).planApproved, false);
});

test("AC2: forged or stale profile authority - submit-plan refuses and records nothing", () => {
  const f = fixture("pin-stale-profile");
  const stale = { ...f.deps, poGateProfile: () => ({ ok: false, code: "PO-PROFILE-RECEIPT-INVALID" }) };
  const attempt = capture(submitArgs(), stale);
  assert.equal(attempt.status, 2);
  assert.match(attempt.err, /PO-PROFILE-RECEIPT-INVALID/);
  assert.equal(readState(f.root).planSubmission, undefined);
  const forged = { ...f.deps, poGateAuthority: () => ({ ok: false, code: "PO-GATE-AUTHORITY-INVALID" }) };
  const second = capture(submitArgs(), forged);
  assert.equal(second.status, 2);
  assert.match(second.err, /PO-GATE-AUTHORITY-INVALID/);
  assert.equal(readState(f.root).planSubmission, undefined);
});

test("AC2: authority bound to a different plan path than the active feature is refused", () => {
  const f = fixture("pin-wrong-plan-path");
  const wrong = { ...f.deps, poGateAuthority: () => ({ ok: true, value: { ...f.authorityValue, planPath: "specs/other/prd.md" } }) };
  const attempt = capture(submitArgs(), wrong);
  assert.equal(attempt.status, 2);
  assert.equal(readState(f.root).planSubmission, undefined);
});

test("AC2: source drift between observation and commit is refused and fabricates no submission", () => {
  const f = fixture("pin-drift");
  let calls = 0;
  const drifting = {
    ...f.deps,
    poGateAuthority: () => {
      calls += 1;
      return { ok: true, value: calls === 1 ? f.authorityValue : { ...f.authorityValue, planSha256: "9".repeat(64) } };
    },
  };
  const attempt = capture(submitArgs(), drifting);
  assert.equal(attempt.status, 2, attempt.out);
  assert.match(attempt.err, /failed before commit/);
  const state = readState(f.root);
  assert.equal(state.planSubmission, undefined);
  assert.equal(state.planApproved, false);
});

test("AC2: a profile change at submission time requires PO authority, not the submitter", () => {
  const f = fixture("pin-profile-change", { intake: true });
  const attempt = capture(submitArgs("epic"), f.deps);
  assert.equal(attempt.status, 2);
  assert.match(attempt.err, /PROFILE-CHANGE-REQUIRES-PO/);
  assert.equal(readState(f.root).planSubmission, undefined);
});

test("AC2: incomplete feature package - submit-plan under the feature profile refuses without a design package", () => {
  const f = fixture("pin-incomplete-package");
  // The draft-design precondition applies to a repository carrying the greenfield map scaffold.
  for (const target of initialGreenfieldMapTargets("fresh")) {
    mkdirSync(dirname(join(f.root, target.path)), { recursive: true });
    writeFileSync(join(f.root, target.path), target.bytes);
  }
  const attempt = capture(submitArgs("feature"), f.deps);
  assert.equal(attempt.status, 2);
  assert.match(attempt.err, /ARCHITECTURE-DESIGN|complete the exact draft architecture design/);
  assert.match(attempt.err, /No submission or signature request was recorded/);
  assert.equal(readState(f.root).planSubmission, undefined);
});

test("G20-15: an invalid ADR sidecar refuses submit-plan before the PO signs, names the sidecar, and records nothing", () => {
  const f = fixture("pin-adr-sidecar");
  const designDeps = { ...f.deps, architectureDesignDraft: () => ({ ok: true, required: true, status: "draft" }) };
  mkdirSync(join(f.root, "docs", "adr"), { recursive: true });
  const markdown = Buffer.from("# ADR 0001\nLocal storage.\n", "utf8");
  writeFileSync(join(f.root, "docs/adr/0001-storage.md"), markdown);
  // The AGY greenfield shape: no `date`, and `null` for the optional fields.
  writeFileSync(join(f.root, "docs/adr/0001-storage.json"), JSON.stringify({ schema: "pipeline.architecture-decision.v1", id: "0001",
    title: "Storage", status: "proposed", scope: "project", digest: sha256Hex(markdown), supersedes: null, exception: null }));
  const before = readFileSync(statePath(f.root), "utf8");
  const refused = capture(submitArgs("feature"), designDeps);
  assert.equal(refused.status, 2, refused.err);
  assert.match(refused.err, /submit-plan blocked by ARCH-DECISION-EFFECTIVE-UNRESOLVED \(decision-sidecar-invalid-or-drifted docs\/adr\/0001-storage\.json\)/u);
  assert.match(refused.err, /No submission or signature request was recorded\./u);
  assert.equal(readFileSync(statePath(f.root), "utf8"), before, "nothing is recorded");
});

test("G20-15 control: a feature submission with no ADR sidecar problem is not refused by the sidecar check", () => {
  const f = fixture("pin-adr-clean");
  let called = 0;
  const designDeps = { ...f.deps, architectureDesignDraft: () => ({ ok: true, required: true, status: "draft" }),
    architectureDecisionAuthoringSources: (input) => { called += 1; assert.equal(input.area, "project");
      return { status: "ready", code: "ARCH-DECISION-EFFECTIVE-READY", findings: [] }; } };
  const result = capture(submitArgs("feature"), designDeps);
  assert.equal(called, 1);
  assert.doesNotMatch(result.err, /ARCH-DECISION-EFFECTIVE-UNRESOLVED/u);
});

// --- C28-PLAN-GATES (AC-108; WSL Claude greenfield 2026-11): ADR drafts that were never bound into the design package ---
// create-adr wrote docs/adr/draft-*, bind-adr-proposals never ran, the PRD carried no binding block, and the design approval and the
// architecture check passed all the same, because only an accepted record is ever read. submit-plan is the last point before the PO signs.
function adrDraftFixture(featureId, slug = "storage-adapter") {
  const f = fixture(featureId);
  mkdirSync(join(f.root, "docs", "adr"), { recursive: true });
  const body = `# Use a storage adapter\n\n## Decision\n\nThe adapter owns persistence.\n`;
  writeFileSync(join(f.root, "docs", "adr", `draft-${slug}.md`), body);
  writeFileSync(join(f.root, "docs", "adr", `draft-${slug}.json`), `${JSON.stringify({ schema: "pipeline.architecture-decision.v1", id: `draft-${slug}`,
    title: "Use a storage adapter", status: "proposed", digest: sha256Hex(body), scope: "project", date: "2026-11-10" })}\n`);
  const designDeps = { ...f.deps, architectureDesignDraft: () => ({ ok: true, required: true, status: "draft" }) };
  return { ...f, slug, body, designDeps, digest: sha256Hex(body) };
}
const writeManifest = (f, rows) => {
  mkdirSync(join(f.root, "specs", f.featureId), { recursive: true });
  writeFileSync(join(f.root, "specs", f.featureId, "prospective-architecture.json"), `${JSON.stringify({ schema: "pipeline.architecture-prospective-materialization.v1",
    decisions: rows.map(({ id, slug, digest }) => ({ id, proposedMarkdown: { path: `docs/adr/draft-${slug}.md`, sha256: digest } })) })}\n`);
};

test("C28 ADR gate: an unbound draft refuses submit-plan before the PO signs, names the exact bind command and the discard command, and records nothing", () => {
  const f = adrDraftFixture("pin-adr-unbound");
  const before = readFileSync(statePath(f.root), "utf8");
  const refused = capture(submitArgs("feature"), f.designDeps);
  assert.equal(refused.status, 2, refused.err);
  assert.match(refused.err, /submit-plan blocked by ADR-DRAFT-UNBOUND \(docs\/adr\/draft-storage-adapter\.md\)/u);
  assert.ok(refused.err.includes(`bind-adr-proposals.mjs --root ${f.root} --feature pin-adr-unbound --carrier specs/pin-adr-unbound/design.md --selection specs/pin-adr-unbound/po-selection.json --draft storage-adapter`), refused.err);
  assert.ok(refused.err.includes(`create-adr.mjs --root ${f.root} --slug storage-adapter --discard --reason "<why it is not wanted>"`), refused.err);
  assert.match(refused.err, /No submission or signature request was recorded\./u);
  assert.equal(readFileSync(statePath(f.root), "utf8"), before, "nothing is recorded");
});

test("C28 ADR gate: every unbound draft is listed once, in one refusal, with one --draft each", () => {
  const f = adrDraftFixture("pin-adr-two");
  const body = "# Second\n";
  writeFileSync(join(f.root, "docs/adr/draft-second-choice.md"), body);
  writeFileSync(join(f.root, "docs/adr/draft-second-choice.json"), `${JSON.stringify({ schema: "pipeline.architecture-decision.v1", id: "draft-second-choice", title: "Second", status: "proposed", digest: sha256Hex(body), scope: "project", date: "2026-11-10" })}\n`);
  const refused = capture(submitArgs("feature"), f.designDeps);
  assert.equal(refused.status, 2, refused.err);
  assert.match(refused.err, /ADR-DRAFT-UNBOUND \(docs\/adr\/draft-second-choice\.md, docs\/adr\/draft-storage-adapter\.md\)/u);
  assert.match(refused.err, /--draft second-choice --draft storage-adapter/u);
});

test("C28 ADR gate: a bound draft, a discarded draft and an earlier-materialized draft do not refuse; a draft edited after binding does", () => {
  const bound = adrDraftFixture("pin-adr-bound");
  writeManifest({ ...bound, featureId: "pin-adr-bound" }, [{ id: "0001-storage-adapter", slug: "storage-adapter", digest: bound.digest }]);
  assert.doesNotMatch(capture(submitArgs("feature"), bound.designDeps).err, /ADR-DRAFT/u, "bound through the manifest of the feature folder");
  // The edit plus `create-adr.mjs --refresh` (the sidecar digest follows the Markdown): the sidecar check passes, the binding is what is stale.
  writeFileSync(join(bound.root, "docs/adr/draft-storage-adapter.md"), "# edited after binding\n");
  writeFileSync(join(bound.root, "docs/adr/draft-storage-adapter.json"), `${JSON.stringify({ schema: "pipeline.architecture-decision.v1", id: "draft-storage-adapter",
    title: "Use a storage adapter", status: "proposed", digest: sha256Hex("# edited after binding\n"), scope: "project", date: "2026-11-10" })}\n`);
  assert.match(capture(submitArgs("feature"), bound.designDeps).err, /ADR-DRAFT-UNBOUND/u, "a bound draft that changed must be bound again");

  const discarded = adrDraftFixture("pin-adr-discarded");
  mkdirSync(join(discarded.root, "docs/adr/discarded"), { recursive: true });
  writeFileSync(join(discarded.root, "docs/adr/discarded/draft-storage-adapter.json"), `${JSON.stringify({ schema: "pipeline.adr-draft-discard.v1", id: "draft-storage-adapter",
    markdownSha256: discarded.digest, sidecarSha256: "0".repeat(64), reason: "not wanted", discardedAt: NOW })}\n`);
  assert.doesNotMatch(capture(submitArgs("feature"), discarded.designDeps).err, /ADR-DRAFT/u);

  const earlier = adrDraftFixture("pin-adr-earlier");
  const accepted = "# Accepted\n";
  writeFileSync(join(earlier.root, "docs/adr/0004-storage-adapter.md"), accepted);
  writeFileSync(join(earlier.root, "docs/adr/0004-storage-adapter.json"), `${JSON.stringify({ schema: "pipeline.architecture-decision.v1", id: "0004-storage-adapter", title: "Storage", status: "accepted", digest: sha256Hex(accepted), scope: "project", date: "2026-11-10" })}\n`);
  assert.doesNotMatch(capture(submitArgs("feature"), earlier.designDeps).err, /ADR-DRAFT/u, "a consumer project's earlier, materialized proposal is never refused again");
});

test("C28 ADR gate: it applies where a design package applies; the mini profile and a repository without one are not refused", () => {
  const mini = adrDraftFixture("pin-adr-mini");
  assert.doesNotMatch(capture(submitArgs("mini"), mini.designDeps).err, /ADR-DRAFT/u);
  const none = adrDraftFixture("pin-adr-none");
  const noDesign = { ...none.deps, architectureDesignDraft: () => ({ ok: true, required: false }) };
  assert.doesNotMatch(capture(submitArgs("feature"), noDesign).err, /ADR-DRAFT/u);
});

test("C28 ADR gate: a module that cites the draft path instead of the accepted record is refused with the accepted path to cite", () => {
  const f = adrDraftFixture("pin-adr-cites-draft");
  writeManifest({ ...f, featureId: "pin-adr-cites-draft" }, [{ id: "0001-storage-adapter", slug: "storage-adapter", digest: f.digest }]);
  const design = { modules: [{ id: "persistence", adrReferences: ["docs/adr/draft-storage-adapter.md"] }, { id: "ui", adrReferences: [] }] };
  const citing = { ...f.deps, architectureDesignDraft: () => ({ ok: true, required: true, status: "draft", design }) };
  const refused = capture(submitArgs("feature"), citing);
  assert.equal(refused.status, 2, refused.err);
  assert.match(refused.err, /submit-plan blocked by ADR-DRAFT-CITED-AS-ACCEPTED \(module persistence: docs\/adr\/draft-storage-adapter\.md -> docs\/adr\/0001-storage-adapter\.md\)/u);
  assert.match(refused.err, /No submission or signature request was recorded\./u);
  const fixed = { ...f.deps, architectureDesignDraft: () => ({ ok: true, required: true, status: "draft",
    design: { modules: [{ id: "persistence", adrReferences: ["docs/adr/0001-storage-adapter.md"] }] } }) };
  assert.doesNotMatch(capture(submitArgs("feature"), fixed).err, /ADR-DRAFT/u);
});

test("AC2: a plan still carrying framing placeholder text cannot be submitted", () => {
  const f = fixture("pin-framing");
  writeFileSync(join(f.root, f.planPath), "# PRD\n\n## Why\n<Problem/benefit/trigger; how success is measured.>\n");
  const attempt = capture(submitArgs(), f.deps);
  assert.equal(attempt.status, 2);
  assert.match(attempt.err, /framing/i);
  assert.equal(readState(f.root).planSubmission, undefined);
});

test("AC6: replayed approval - a second approve-plan never changes the recorded approval", () => {
  const f = fixture("pin-replay");
  assert.equal(capture(submitArgs(), f.deps).status, 0);
  assert.equal(capture(["present-plan", "--by", "coordinator"], f.deps).status, 0);
  const first = capture(["approve-plan", "--by", "coordinator"], f.deps);
  assert.equal(first.status, 0, first.err);
  const approved = readState(f.root);
  assert.equal(approved.planApproved, true);
  const second = capture(["approve-plan", "--by", "someone-else"], f.deps);
  const after = readState(f.root);
  assert.equal(after.planApproved, true);
  assert.deepEqual(after.planApproval, approved.planApproval, `replay must not rewrite the approval (status ${second.status})`);
  assert.equal(after.activeFeature.phase, approved.activeFeature.phase, "replay must not advance the phase");
});

// ---- AC3 / AC5 (bullets 3 and 5): Advisor + independent readiness precede the final presentation;
// an unavailable-Advisor exception folds into the one final decision and cannot waive readiness.
// Driven through the real validateDesignWorkflowPackage (the Advisor/readiness gate) and the real
// present-plan writer; nothing under test is mocked.
const FEATURE_CANDIDATE = Object.freeze({ commit: "a".repeat(40), tree: "b".repeat(40) });
const fsha = (value) => sha256Hex(value);
const fserialized = (value) => Buffer.from(`${JSON.stringify(value)}\n`, "utf8");

function packageFixture({ unavailable = false, outcome = "ready-for-po-review", blocking = false, readinessDispatch = "readiness-dispatch", advisorDispatch = "advisor-dispatch", rationale } = {}) {
  const sourceBytes = {}; const sources = {};
  for (const [name, path] of Object.entries({ input: "specs/f/input.md", prd: "specs/f/prd.md", spec: "specs/f/spec.md", design: "specs/f/design.md", traceability: "specs/f/traceability.md" })) {
    const data = Buffer.from(`${name} source\n`, "utf8");
    sources[name] = { path, sha256: fsha(data) }; sourceBytes[name] = { path, bytes: data };
  }
  const advisorReceipt = {
    schema: "pipeline.advisory-receipt.v1", receiptId: "advisor-receipt-1",
    dispatch: { dispatchId: advisorDispatch, queueRevision: 0, candidateCommit: FEATURE_CANDIDATE.commit, candidateTree: FEATURE_CANDIDATE.tree },
    duty: "advisory", profile: "feature",
    configuredRoute: { runner: "codex", selector: { kind: "model-id", value: "gpt-6-sol" }, effort: "high" },
    adapter: "consult",
    observed: unavailable ? { status: "unavailable", identity: null } : { status: "answered", identity: { provider: "openai", modelId: "gpt-6-sol", effort: "high" } },
    questionSha256: designWorkflowAdvisorQuestionSha256(sources),
    answerSha256: unavailable ? null : "c".repeat(64),
    fallback: unavailable ? { reason: "consult-unavailable", redactedErrorClass: "unavailable" } : { reason: "none", redactedErrorClass: null },
    emittedAtMs: 1,
  };
  const advisorReceiptBytes = fserialized(advisorReceipt);
  const attemptTrail = unavailable ? createAdvisoryAttemptTrail({ receipt: advisorReceipt, receiptBytes: advisorReceiptBytes,
    attempts: [{ adapter: "consult", kind: "consult", runner: "codex", status: "unavailable" }] }) : null;
  const attemptTrailBytes = attemptTrail === null ? null : fserialized(attemptTrail);
  const readinessReport = {
    schema: "pipeline.design-readiness-receipt.v1", dispatchId: readinessDispatch, runner: "codex",
    candidate: FEATURE_CANDIDATE, sources, outcome,
    findings: [blocking ? { code: "TRACE-GAP", severity: "blocking", summary: "A requirement is untraced." }
      : { code: "TRACE-OK", severity: "non-blocking", summary: "Traceability is complete." }],
    unresolvedChoices: [], summary: "Readiness verdict for the exact sources.",
  };
  const readinessReceipt = { ...readinessReport, hostExecution: {
    schema: "pipeline.design-readiness-host-execution.v1", runner: "codex", repoFingerprint: "f".repeat(64),
    selectionId: `css_${"a".repeat(25)}e`, selectionSha256: "b".repeat(64), executionReceiptSha256: "c".repeat(64),
    dutyReceiptSha256: designReadinessReportSha256(readinessReport),
    route: { model: "gpt-6-luna", effort: "high", sourceSha256: "8".repeat(64), candidateCommit: FEATURE_CANDIDATE.commit } } };
  const readinessBytes = fserialized(readinessReceipt);
  const workflowPackage = {
    schema: "pipeline.design-workflow-package.v1", featureId: "feature-1", authoringDispatchId: "authoring-dispatch",
    candidate: FEATURE_CANDIDATE, sources,
    advisor: unavailable ? {
      status: "unavailable", runner: "codex", nativeAvailable: false,
      receipt: { path: "specs/f/evidence/advisor.json", sha256: fsha(advisorReceiptBytes) },
      attemptTrail: { path: "specs/f/evidence/advisor-attempts.json", sha256: fsha(attemptTrailBytes) },
      disposition: null,
      exception: { status: "proposed", failureCode: "capacity-unavailable",
        rationale: rationale ?? designWorkflowAdvisorExceptionRationale({ advisorReceipt, attemptTrail }) },
    } : {
      status: "answered", runner: "codex", nativeAvailable: false,
      receipt: { path: "specs/f/evidence/advisor.json", sha256: fsha(advisorReceiptBytes) },
      attemptTrail: null, disposition: { decision: "accept", rationale: "The advice is incorporated in the revised design." }, exception: null,
    },
    readiness: { path: "specs/f/evidence/readiness.json", sha256: fsha(readinessBytes), dispatchId: readinessReceipt.dispatchId },
    createdAt: "2026-10-12T10:11:12.000Z",
  };
  return { workflowPackage, packageBytes: fserialized(workflowPackage), readinessReceipt, readinessBytes,
    advisorReceipt, advisorReceiptBytes, attemptTrail, attemptTrailBytes, sourceBytes, candidate: FEATURE_CANDIDATE,
    repoRoot: SCRATCH, requireReadinessExecution: false };
}

test("AC3: a complete package with Advisor disposition and independent readiness is ready for the single final approval and grants no authority", () => {
  const result = validateDesignWorkflowPackage(packageFixture());
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.status, "ready-for-single-final-approval");
  assert.equal(result.implementationAuthority, false);
  assert.notEqual(result.readinessDispatchId, result.advisorDispatchId);
});

test("AC3: independent readiness is required - a not-ready, blocking, or self-authored readiness blocks the final presentation", () => {
  const notReady = validateDesignWorkflowPackage(packageFixture({ outcome: "not-ready", blocking: true }));
  assert.equal(notReady.ok, false);
  assert.equal(notReady.code, "DWP-READINESS-BINDING");
  const blocking = validateDesignWorkflowPackage(packageFixture({ blocking: true }));
  assert.equal(blocking.ok, false);
  assert.equal(blocking.code, "DWP-READINESS-BINDING");
  const selfReviewed = validateDesignWorkflowPackage(packageFixture({ readinessDispatch: "authoring-dispatch" }));
  assert.equal(selfReviewed.ok, false);
  assert.equal(selfReviewed.code, "DWP-READINESS-BINDING");
});

test("AC3: the Advisor step precedes presentation - an Advisor receipt authored by the authoring dispatch, or with no disposition, is refused", () => {
  const selfAdvised = validateDesignWorkflowPackage(packageFixture({ advisorDispatch: "authoring-dispatch" }));
  assert.equal(selfAdvised.ok, false);
  assert.equal(selfAdvised.code, "DWP-ADVISOR-RECEIPT-BINDING");
  const fixture = packageFixture();
  const noDisposition = { ...fixture, workflowPackage: { ...fixture.workflowPackage, advisor: { ...fixture.workflowPackage.advisor, disposition: null } } };
  noDisposition.packageBytes = fserialized(noDisposition.workflowPackage);
  const refused = validateDesignWorkflowPackage(noDisposition);
  assert.equal(refused.ok, false, "an answered Advisor without a disposition cannot reach the final presentation");
  assert.equal(refused.code, "DWP-ADVISOR-DISPOSITION");
});

test("AC5: an unavailable Advisor is a proposed exception inside the same package and still requires independent readiness", () => {
  const proposed = validateDesignWorkflowPackage(packageFixture({ unavailable: true }));
  assert.equal(proposed.ok, true, JSON.stringify(proposed));
  assert.equal(proposed.status, "ready-for-single-final-approval", "the exception travels with the one final approval package");
  assert.equal(proposed.implementationAuthority, false);
  assert.equal(proposed.workflowPackage.advisor.exception.status, "proposed", "the exception is only proposed, never self-granted");
  // The exception cannot waive readiness.
  const waived = validateDesignWorkflowPackage(packageFixture({ unavailable: true, outcome: "not-ready", blocking: true }));
  assert.equal(waived.ok, false);
  assert.equal(waived.code, "DWP-READINESS-BINDING");
  const selfReviewed = validateDesignWorkflowPackage(packageFixture({ unavailable: true, readinessDispatch: "authoring-dispatch" }));
  assert.equal(selfReviewed.ok, false);
  assert.equal(selfReviewed.code, "DWP-READINESS-BINDING");
});

test("AC5: an unavailable-Advisor exception may state only receipt-backed facts", () => {
  const forged = validateDesignWorkflowPackage(packageFixture({ unavailable: true, rationale: "The Advisor is not needed for this plan." }));
  assert.equal(forged.ok, false);
  assert.equal(forged.code, "DWP-ADVISOR-EXCEPTION-RATIONALE-UNBACKED");
});

test("AC3/AC5: the real present-plan writer refuses an epic/feature presentation without an independent review receipt and the retired package route", () => {
  const f = fixture("pin-feature-present");
  assert.equal(capture(submitArgs(), f.deps).status, 0);
  const statePathFile = statePath(f.root);
  const state = readState(f.root);
  state.planSubmission = { ...state.planSubmission, profile: "feature" };
  writeFileSync(statePathFile, `${JSON.stringify(state, null, 2)}\n`);
  const noReceipt = capture(["present-plan", "--by", "coordinator"], f.deps);
  assert.equal(noReceipt.status, 2, `${noReceipt.out} ${noReceipt.err}`);
  assert.match(noReceipt.err, /DCC-REVIEW-RECEIPT-MISSING/);
  assert.equal(readState(f.root).planPresentation, undefined, "no presentation without readiness evidence");
  const retired = capture(["present-plan", "--by", "coordinator", "--design-workflow-package", "specs/x/design-workflow-package.json"], f.deps);
  assert.equal(retired.status, 2);
  assert.match(retired.err, /DWP-PRESENT-RETIRED/);
  assert.equal(readState(f.root).planApproved, false);
});

test("pin hygiene: fixtures live under the repository scratch directory and are cleaned up", () => {
  const f = fixture("pin-hygiene");
  assert.ok(f.root.startsWith(SCRATCH.replace(/[\\/]$/, "")));
  assert.ok(existsSync(statePath(f.root)));
});
