#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * pipeline-state.test.mjs — behavior tests for the sanctioned pipeline-state.mjs
 * writer CLI (AP1-P3 "DURIN").
 *
 * Run: node harness/scripts/pipeline-state.test.mjs
 * Exit: 0 = all cases pass · 1 = at least one case failed (failure list on stdout).
 *
 * Two layers: (a) in-process calls against `run()` with injected {dir, now, gitHead}
 * (fast, no real git/process spawn needed for most cases), (b) one real-git-repo case
 * for `approve-push` end to end (spawnSync the actual CLI as a subprocess, mirroring
 * how a Goldfish/Elephant would invoke it).
 */
import { chmodSync, fsyncSync, linkSync, lstatSync, mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync, readdirSync, renameSync, symlinkSync, writeSync } from "node:fs";
import { tmpdir } from "node:os";
import { createHash, createHmac, generateKeyPairSync, sign } from "node:crypto";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
  acquireContinuityLock,
  atomicWriteContinuityState,
  continuityLockPath,
  mergeAuthorityRevisionReceipt,
  reconstructPlanApprovalBriefing,
  releaseContinuityLock,
  run,
  readState,
  statePath,
  CONTINUITY_LOCK_SCHEMA_ID,
  SCHEMA_ID,
} from "./pipeline-state.mjs";
import { computeContinuityFinalDigest } from "../../plugins/pipeline-core/lib/continuity-host-adapter.mjs";
import { loadManifestSafe } from "../../plugins/pipeline-core/lib/manifest.mjs";
import { loadStateSafe, resolveSuggestion } from "../../plugins/pipeline-core/hooks/stop-suggest.mjs";
import { COURSE_KINDS, buildCourseDecisionBrief, sha256Canonical } from "../../plugins/pipeline-core/lib/review-economy.mjs";
import {
  PO_GATE_AUTHORITY_EVIDENCE_SCHEMA,
  PO_GATE_AUTHORITY_EVIDENCE_V2_SCHEMA,
  PO_GATE_PRD_ACKNOWLEDGEMENT_MARKER,
  PO_GATE_PRD_LANGUAGE_MARKER,
  PO_GATE_PROFILE_RECEIPT_RELATIVE_PATH,
  createPoGateProfileReceipt,
  derivePoGateRepositoryFingerprint,
  poGateProfileReceiptPath,
  serializePoGateProfileReceipt,
} from "../../plugins/pipeline-core/lib/po-gate-authority.mjs";
import { hardenWindowsPrivateDirectory } from "../../plugins/pipeline-core/lib/windows-private-state.mjs";
import {
  advanceCloseCoordinator,
  createCloseCoordinator,
  lifecycleDigest as closeCoordinatorDigest,
} from "../../plugins/pipeline-core/scripts/publication-close-journal.mjs";
import {
  planFeaturePackageBootstrap,
  planFeaturePackageReconcile,
  planFeaturePackageTransition,
  reconcileNoDriftOk,
  RESULT_RECONCILIATION_FENCE,
  validateFeaturePackage,
} from "../../plugins/pipeline-core/lib/feature-package-topology.mjs";
import { sha256CanonicalJson } from "../../plugins/pipeline-core/lib/plan-spec-state-v2.mjs";
import { createCriticalActionApprovalRequest, criticalActionSubjectSha256 } from "../../plugins/pipeline-core/lib/critical-action-approval-request.mjs";

const CLI = fileURLToPath(new URL("./pipeline-state.mjs", import.meta.url));
const ALL_DIRS = [];
const NOVA_APPROVED_BY = "agent-pipe-shared (PO, 2026-07-27 Nova re-Critic corrections)";
const PHOENIX_SPEC_BOUND_BY = "PO reauthorization for Phoenix R-14 digest binding";
function freshDir(prefix) {
  const dir = mkdtempSync(join(tmpdir(), `pipeline-state-${prefix}-`));
  ALL_DIRS.push(dir);
  return dir;
}

// ---- PS53: AC-047-28 PO authority rebind --------------------------------------------------
function seedPoAuthorityRebind(prefix = "po-rebind") {
  const dir = freshDir(prefix);
  const featureDir = join(dir, "specs", "nova-shaped");
  mkdirSync(featureDir, { recursive: true });
  mkdirSync(dirname(statePath(dir)), { recursive: true });
  const planPath = "specs/nova-shaped/prd_nova.md";
  const specPath = "specs/nova-shaped/spec.md";
  const oldSpecSha = createHash("sha256").update("# older Spec\n").digest("hex");
  writeFileSync(join(dir, specPath), "# later Spec\n");
  const newSpecSha = createHash("sha256").update(readFileSync(join(dir, specPath))).digest("hex");
  writeFileSync(join(dir, planPath), `<!-- po-language: en -->\n<!-- technical-spec-sha256: ${oldSpecSha} -->\n# Nova-shaped PRD\n`);
  const planSha = createHash("sha256").update(readFileSync(join(dir, planPath))).digest("hex");
  const profile = { schema: "pipeline.po-gate-authority-evidence.v1", humanFacing: "en", sourceSha256: A, runtimeSha256: B, receiptSha256: C, repositoryFingerprint: D };
  const continuity = {
    schema: "pipeline.continuity.v0", featureId: "nova-shaped", revision: 3,
    runtime: { humanFacingLanguage: "en", activeDuty: "Coordinator" },
    authority: { prd: { path: planPath, sha256: planSha }, spec: { path: specPath, sha256: oldSpecSha }, result: null },
    queueHead: { packageId: "nova", actionId: "rebind", nextAction: "review", productRetryCount: 0, environmentRerouteCount: 0, dispatch: null },
    blocker: null, acknowledgedFinal: null, resume: { mode: "immediate", sourceRevision: 0, reasonCode: "active-turn" }, recovery: null, decisionTxn: null,
    capacity: { concurrencyLimit: 4, reservedCriticSlots: 1, reservedRecoverySlots: 1, fallbackPolicy: "defer" },
  };
  const state = {
    schema: SCHEMA_ID, activeFeature: { id: "nova-shaped", planPath, phase: "implementation" }, planApproved: true,
    planApproval: { schema: "pipeline.plan-approval.v2", approvedBy: NOVA_APPROVED_BY, approvedAt: "2026-07-26T14:08:37.500Z", specBoundBy: PHOENIX_SPEC_BOUND_BY, specBoundAt: "2026-07-26T14:08:37.500Z", poGateAuthority: {
      ...profile, schema: "pipeline.po-gate-authority.v2", planPath, planSha256: planSha, specPath, specSha256: oldSpecSha,
    } }, continuity, updatedAt: "2026-07-26T14:08:37.500Z",
  };
  writeFileSync(statePath(dir), JSON.stringify(state, null, 2) + "\n");
  const deps = {
    dir, now: () => "2026-07-28T10:00:00.000Z", ownerNonce: () => `rebind-${String(++nonceSequence).padStart(8, "0")}`,
    poGateProfile: () => ({ ok: true, value: profile }),
    poGateAuthority: ({ expectedPlanSha256, expectedSpecSha256 }) => expectedSpecSha256 === newSpecSha && typeof expectedPlanSha256 === "string"
      ? { ok: true, value: { ...profile, schema: "pipeline.po-gate-authority.v2", planPath, planSha256: expectedPlanSha256, specPath, specSha256: newSpecSha } }
      : { ok: false, code: "PO-GATE-AUTHORITY-STALE" },
    v4Inspection: () => ({ status: "ready" }),
  };
  return { dir, deps, planPath, specPath, oldSpecSha, newSpecSha, profile };
}

function runPoAuthorityRebindTests() {
{
  const fixture = seedPoAuthorityRebind("po-rebind-retained-history");
  const state = readState(fixture.dir).state;
  state.closedFeatures = [{ id: "retained-history", evidence: "x".repeat(8_500) }];
  writeFileSync(statePath(fixture.dir), JSON.stringify(state, null, 2) + "\n");
  const planned = captureConsole(() => run(["po-authority-rebind-plan"], fixture.deps));
  const plan = JSON.parse(planned.text || "{}");
  ok("PS53a retained root history above the continuity budget remains rebindable", planned.value === 0
    && plan.schema === "pipeline.po-authority-rebind-plan.v1"
    && plan.preimage?.state?.sha256
    && Buffer.byteLength(readFileSync(statePath(fixture.dir))) > 8_192);
}

{
  const fixture = seedPoAuthorityRebind();
  const beforePrd = readFileSync(join(fixture.dir, fixture.planPath), "utf8");
  const beforeState = readFileSync(statePath(fixture.dir), "utf8");
  const planned = captureConsole(() => run(["po-authority-rebind-plan"], fixture.deps));
  const plan = JSON.parse(planned.text || "{}");
  ok("PS53a Nova-shaped stale marker yields a closed digest-bound plan", planned.value === 0 && plan.schema === "pipeline.po-authority-rebind-plan.v1" && plan.planSha256 && plan.applyAction?.requiresConfirmation === true && plan.applyAction?.argv?.includes("--updated-at"));
  ok("PS53b planning binds matching stale authority preimages without writes", plan.preimage?.planApproval?.poGateAuthority?.planSha256 === plan.preimage?.continuityAuthority?.prd?.sha256 && readFileSync(join(fixture.dir, fixture.planPath), "utf8") === beforePrd && readFileSync(statePath(fixture.dir), "utf8") === beforeState);
  const missingConfirmation = captureConsoleError(() => run(["po-authority-rebind-apply", "--plan-sha256", plan.planSha256, "--updated-at", plan.plannedAt], fixture.deps));
  ok("PS53c apply rejects a missing explicit confirmation byte-null", missingConfirmation.value === 2 && readFileSync(statePath(fixture.dir), "utf8") === beforeState);
  const applied = captureConsole(() => run(plan.applyAction.argv.slice(1), fixture.deps));
  const after = readState(fixture.dir).state;
  const afterPrd = readFileSync(join(fixture.dir, fixture.planPath), "utf8");
  ok("PS53d Nova-shaped confirmed apply preserves Human approvals and converges marker, PO gate and Continuity in design", applied.value === 0 && afterPrd.includes(fixture.newSpecSha) && after.activeFeature.phase === "design" && after.planApproval.approvedBy === NOVA_APPROVED_BY && after.planApproval.specBoundBy === PHOENIX_SPEC_BOUND_BY && after.planApproval.poGateAuthority.specSha256 === fixture.newSpecSha && after.continuity.authority.spec.sha256 === fixture.newSpecSha && after.continuity.authority.prd.sha256 === after.planApproval.poGateAuthority.planSha256 && after.continuity.revision === 4);
  const replayBytes = readFileSync(statePath(fixture.dir), "utf8");
  const replay = captureConsoleError(() => run(plan.applyAction.argv.slice(1), fixture.deps));
  ok("PS53e replay is a closed refusal after a verified non-no-op", replay.value === 2 && readFileSync(statePath(fixture.dir), "utf8") === replayBytes);
}

{
  const fixture = seedPoAuthorityRebind("po-decision-general-drift");
  const state = readState(fixture.dir).state;
  state.activeFeature.phase = "design";
  writeFileSync(statePath(fixture.dir), JSON.stringify(state, null, 2) + "\n");
  writeFileSync(
    join(fixture.dir, fixture.planPath),
    `${readFileSync(join(fixture.dir, fixture.planPath), "utf8")}\nHuman-reviewed scope expansion.\n`,
  );
  const beforePrd = readFileSync(join(fixture.dir, fixture.planPath), "utf8");
  const beforeState = readFileSync(statePath(fixture.dir), "utf8");
  const planned = captureConsole(() => run(["po-authority-decision-plan"], fixture.deps));
  const plan = JSON.parse(planned.text || "{}");
  ok("PS54a general PRD/Spec drift yields two neutral physical candidates", planned.value === 0
    && plan.schema === "pipeline.po-authority-decision-plan.v1"
    && plan.status === "planned"
    && JSON.stringify(plan.candidates?.map((candidate) => candidate.id)) === JSON.stringify(["prd", "spec"])
    && plan.selectionActions?.find((action) => action.selectedCandidate === "prd")?.status === "unavailable"
    && plan.selectionActions?.find((action) => action.selectedCandidate === "spec")?.requiresConfirmation === true
    && readFileSync(join(fixture.dir, fixture.planPath), "utf8") === beforePrd
    && readFileSync(statePath(fixture.dir), "utf8") === beforeState);
  const specSelection = plan.selectionActions.find((action) => action.selectedCandidate === "spec");
  const selected = captureConsole(() => run(specSelection.argv.slice(1), fixture.deps));
  const selection = JSON.parse(selected.text || "{}");
  ok("PS54b explicit Spec selection returns a separately digest-bound confirmed apply", selected.value === 0
    && selection.schema === "pipeline.po-authority-selection.v1"
    && selection.selectedCandidate === "spec"
    && /^[a-f0-9]{64}$/u.test(selection.selectionDigest)
    && selection.applyAction?.requiresConfirmation === true
    && selection.applyAction?.argv?.includes("--selection-digest")
    && readFileSync(join(fixture.dir, fixture.planPath), "utf8") === beforePrd
    && readFileSync(statePath(fixture.dir), "utf8") === beforeState);
  const applied = captureConsole(() => run(selection.applyAction.argv.slice(1), fixture.deps));
  const after = readState(fixture.dir).state;
  ok("PS54c confirmed decision apply converges marker and both authority surfaces in design", applied.value === 0
    && JSON.parse(applied.text).code === "PO-DECISION-APPLIED"
    && readFileSync(join(fixture.dir, fixture.planPath), "utf8").includes(fixture.newSpecSha)
    && after.activeFeature.phase === "design"
    && after.planApproval.poGateAuthority.specSha256 === fixture.newSpecSha
    && after.continuity.authority.spec.sha256 === fixture.newSpecSha
    && after.continuity.revision === 4);
}

{
  const fixture = seedPoAuthorityRebind("po-decision-coherent-docs-stale-state");
  const prdPath = join(fixture.dir, fixture.planPath);
  const coherentPrd = readFileSync(prdPath, "utf8").replace(fixture.oldSpecSha, fixture.newSpecSha);
  writeFileSync(prdPath, `${coherentPrd}\nReconciled product scope.\n`);
  const beforePrd = readFileSync(prdPath);
  const beforeState = readFileSync(statePath(fixture.dir), "utf8");
  const planned = captureConsole(() => run(["po-authority-decision-plan"], fixture.deps));
  const plan = JSON.parse(planned.text || "{}");
  const selectionAction = plan.selectionActions?.find((action) => action.selectedCandidate === "spec");
  const selected = captureConsole(() => run(selectionAction.argv.slice(1), fixture.deps));
  const selection = JSON.parse(selected.text || "{}");
  const observedV4Intents = [];
  const applied = captureConsole(() => run(selection.applyAction.argv.slice(1), {
    ...fixture.deps,
    replaceRebindPrdFdContents: () => { throw new Error("coherent PRD must not be rewritten"); },
    replaceRebindStateFdContents: (fd, bytes) => { writeSync(fd, bytes, 0, bytes.length, 0); },
    v4Inspection: ({ intent }) => {
      observedV4Intents.push(intent);
      return { status: "ready" };
    },
  }));
  const after = readState(fixture.dir).state;
  ok("PS54d coherent documents with stale State yield the same PO plan and design re-entry", planned.value === 0
    && plan.transition?.kind === "po-authority-design-review"
    && plan.transition?.documentMutationRequired === false
    && plan.transition?.bindingMutationRequired === true
    && applied.value === 0
    && after.activeFeature.phase === "design"
    && after.planApproval.poGateAuthority.planSha256 === createHash("sha256").update(beforePrd).digest("hex")
    && after.planApproval.poGateAuthority.specSha256 === fixture.newSpecSha
    && after.continuity.authority.prd.sha256 === after.planApproval.poGateAuthority.planSha256
    && after.continuity.authority.spec.sha256 === fixture.newSpecSha
    && after.continuity.revision === 4
    && JSON.stringify(observedV4Intents) === JSON.stringify(["bootstrap", "session", "dispatch"])
    && readFileSync(prdPath).equals(beforePrd)
    && readFileSync(statePath(fixture.dir), "utf8") !== beforeState);
}

{
  const fixture = seedPoAuthorityRebind("po-decision-phoenix-multigeneration");
  const prdPath = join(fixture.dir, fixture.planPath);
  const coherentPrd = `${readFileSync(prdPath, "utf8").replace(fixture.oldSpecSha, fixture.newSpecSha)}\nPhoenix current scope.\n`;
  writeFileSync(prdPath, coherentPrd);
  const currentPlanSha256 = createHash("sha256").update(readFileSync(prdPath)).digest("hex");
  const state = readState(fixture.dir).state;
  state.planApproval.poGateAuthority = {
    ...fixture.profile,
    schema: "pipeline.po-gate-authority.v2",
    planPath: fixture.planPath,
    planSha256: currentPlanSha256,
    specPath: fixture.specPath,
    specSha256: fixture.newSpecSha,
  };
  const preservedContinuity = structuredClone(state.continuity);
  writeFileSync(statePath(fixture.dir), JSON.stringify(state, null, 2) + "\n");
  const planned = captureConsole(() => run(["po-authority-decision-plan"], fixture.deps));
  const plan = JSON.parse(planned.text || "{}");
  const selectionAction = plan.selectionActions?.find((action) => action.selectedCandidate === "spec");
  const selected = selectionAction
    ? captureConsole(() => run(selectionAction.argv.slice(1), fixture.deps))
    : { value: 2, text: "" };
  const selection = JSON.parse(selected.text || "{}");
  const observedV4Intents = [];
  const applied = selection.applyAction
    ? captureConsole(() => run(selection.applyAction.argv.slice(1), {
      ...fixture.deps,
      replaceRebindPrdFdContents: () => { throw new Error("coherent Phoenix PRD must not be rewritten"); },
      replaceRebindStateFdContents: (fd, bytes) => { writeSync(fd, bytes, 0, bytes.length, 0); },
      v4Inspection: ({ intent }) => {
        observedV4Intents.push(intent);
        return { status: "ready" };
      },
    }))
    : { value: 2, text: "" };
  const after = readState(fixture.dir).state;
  const expectedContinuity = structuredClone(preservedContinuity);
  expectedContinuity.revision += 1;
  expectedContinuity.authority.prd.sha256 = currentPlanSha256;
  expectedContinuity.authority.spec.sha256 = fixture.newSpecSha;
  ok("PS55a Phoenix-shaped current documents with only older Continuity yield a neutral bound plan", planned.value === 0
    && plan.authoritySurfaces?.currentDocuments?.prd?.sha256 === currentPlanSha256
    && plan.authoritySurfaces?.persistedPoGateAuthority?.planSha256 === currentPlanSha256
    && plan.authoritySurfaces?.continuityAuthority?.prd?.sha256 === preservedContinuity.authority.prd.sha256
    && plan.transition?.documentMutationRequired === false
    && plan.transition?.bindingMutationRequired === true);
  ok("PS55b Phoenix-shaped confirmed apply preserves payload and converges all three intents", selected.value === 0
    && applied.value === 0
    && after.activeFeature.phase === "design"
    && after.planApproval.approvedBy === NOVA_APPROVED_BY
    && after.planApproval.specBoundBy === PHOENIX_SPEC_BOUND_BY
    && after.planApproval.poGateAuthority.planSha256 === currentPlanSha256
    && after.planApproval.poGateAuthority.specSha256 === fixture.newSpecSha
    && JSON.stringify(after.continuity) === JSON.stringify(expectedContinuity)
    && JSON.stringify(observedV4Intents) === JSON.stringify(["bootstrap", "session", "dispatch"])
    && readFileSync(prdPath, "utf8") === coherentPrd);
}

{
  const fixture = seedPoAuthorityRebind("po-decision-nova-multigeneration");
  const state = readState(fixture.dir).state;
  state.activeFeature.phase = "design";
  const historicalProfile = {
    humanFacing: "de",
    sourceSha256: "1".repeat(64),
    runtimeSha256: "2".repeat(64),
    receiptSha256: "3".repeat(64),
    repositoryFingerprint: "4".repeat(64),
  };
  state.planApproval.poGateAuthority = {
    schema: "pipeline.po-gate-authority.v2",
    ...historicalProfile,
    planPath: fixture.planPath,
    planSha256: "5".repeat(64),
    specPath: fixture.specPath,
    specSha256: "6".repeat(64),
  };
  state.continuity.authority.prd.sha256 = "7".repeat(64);
  state.continuity.authority.spec.sha256 = "8".repeat(64);
  const preservedContinuity = structuredClone(state.continuity);
  writeFileSync(statePath(fixture.dir), JSON.stringify(state, null, 2) + "\n");
  const currentPrdSha256 = createHash("sha256").update(readFileSync(join(fixture.dir, fixture.planPath))).digest("hex");
  const planned = captureConsole(() => run(["po-authority-decision-plan"], fixture.deps));
  const plan = JSON.parse(planned.text || "{}");
  const selectionAction = plan.selectionActions?.find((action) => action.selectedCandidate === "spec");
  const selected = selectionAction
    ? captureConsole(() => run(selectionAction.argv.slice(1), fixture.deps))
    : { value: 2, text: "" };
  const selection = JSON.parse(selected.text || "{}");
  const observedV4Intents = [];
  const applied = selection.applyAction
    ? captureConsole(() => run(selection.applyAction.argv.slice(1), {
      ...fixture.deps,
      v4Inspection: ({ intent }) => {
        observedV4Intents.push(intent);
        return { status: "ready" };
      },
    }))
    : { value: 2, text: "" };
  const after = readState(fixture.dir).state;
  const afterPrdSha256 = createHash("sha256").update(readFileSync(join(fixture.dir, fixture.planPath))).digest("hex");
  const expectedContinuity = structuredClone(preservedContinuity);
  expectedContinuity.revision += 1;
  expectedContinuity.authority.prd.sha256 = afterPrdSha256;
  expectedContinuity.authority.spec.sha256 = fixture.newSpecSha;
  ok("PS55c Nova-shaped four-generation drift discloses marker, documents, PO gate, Continuity and both profiles", planned.value === 0
    && plan.preimage?.currentPrdMarker?.technicalSpecSha256 === fixture.oldSpecSha
    && plan.authoritySurfaces?.currentDocuments?.prd?.sha256 === currentPrdSha256
    && plan.authoritySurfaces?.currentDocuments?.spec?.sha256 === fixture.newSpecSha
    && plan.authoritySurfaces?.persistedPoGateAuthority?.planSha256 === "5".repeat(64)
    && plan.authoritySurfaces?.continuityAuthority?.prd?.sha256 === "7".repeat(64)
    && plan.authoritySurfaces?.profileProvenance?.historical?.sourceSha256 === historicalProfile.sourceSha256
    && plan.authoritySurfaces?.profileProvenance?.current?.sourceSha256 === fixture.profile.sourceSha256
    && plan.transition?.documentMutationRequired === true
    && plan.transition?.bindingMutationRequired === true);
  ok("PS55d Nova-shaped confirmed apply converges to current documents/profile exactly once and preserves payload", selected.value === 0
    && applied.value === 0
    && after.activeFeature.phase === "design"
    && after.planApproval.poGateAuthority.humanFacing === fixture.profile.humanFacing
    && after.planApproval.poGateAuthority.sourceSha256 === fixture.profile.sourceSha256
    && after.planApproval.poGateAuthority.runtimeSha256 === fixture.profile.runtimeSha256
    && after.planApproval.poGateAuthority.receiptSha256 === fixture.profile.receiptSha256
    && after.planApproval.poGateAuthority.repositoryFingerprint === fixture.profile.repositoryFingerprint
    && after.planApproval.poGateAuthority.planSha256 === afterPrdSha256
    && after.planApproval.poGateAuthority.specSha256 === fixture.newSpecSha
    && JSON.stringify(after.continuity) === JSON.stringify(expectedContinuity)
    && JSON.stringify(observedV4Intents) === JSON.stringify(["bootstrap", "session", "dispatch"]));
  const replayBytes = readFileSync(statePath(fixture.dir), "utf8");
  const replay = selection.applyAction
    ? captureConsoleError(() => run(selection.applyAction.argv.slice(1), fixture.deps))
    : { value: 0 };
  ok("PS55e Nova-shaped completed selection replay fails closed without a second revision", replay.value === 2
    && readFileSync(statePath(fixture.dir), "utf8") === replayBytes
    && readState(fixture.dir).state.continuity.revision === preservedContinuity.revision + 1);
}

{
  const malformedHistoricalCases = [
    ["schema", (state) => { state.planApproval.poGateAuthority.schema = "pipeline.po-gate-authority.v1"; }],
    ["extra key", (state) => { state.planApproval.poGateAuthority.extra = true; }],
    ["noncanonical path", (state) => { state.planApproval.poGateAuthority.planPath = `./${state.activeFeature.planPath}`; }],
    ["uppercase digest", (state) => { state.planApproval.poGateAuthority.specSha256 = state.planApproval.poGateAuthority.specSha256.toUpperCase(); }],
    ["provenance type", (state) => { state.planApproval.poGateAuthority.humanFacing = 7; }],
    ["Continuity path", (state) => { state.continuity.authority.spec.path = `./${state.continuity.authority.spec.path}`; }],
    ["Continuity schema", (state) => { state.continuity.schema = "pipeline.continuity.v1"; }],
    ["Continuity extra key", (state) => { state.continuity.extra = true; }],
  ];
  for (const [name, mutate] of malformedHistoricalCases) {
    const fixture = seedPoAuthorityRebind(`po-decision-malformed-${name.replaceAll(" ", "-")}`);
    const state = readState(fixture.dir).state;
    mutate(state);
    writeFileSync(statePath(fixture.dir), JSON.stringify(state, null, 2) + "\n");
    const before = readFileSync(statePath(fixture.dir), "utf8");
    const rejected = captureConsoleError(() => run(["po-authority-decision-plan"], fixture.deps));
    ok(`PS55f malformed historical ${name} is a typed byte-null refusal`, rejected.value === 2
      && /PO-DECISION-(?:PRIOR-AUTHORITY|CONTINUITY)/u.test(rejected.text)
      && readFileSync(statePath(fixture.dir), "utf8") === before);
  }
}

{
  const malformedProfileCases = [
    ["schema", { schema: "pipeline.po-gate-authority-evidence.v0" }],
    ["extra key", { extra: true }],
    ["uppercase digest", { receiptSha256: C.toUpperCase() }],
  ];
  for (const [name, change] of malformedProfileCases) {
    const fixture = seedPoAuthorityRebind(`po-decision-current-profile-${name.replaceAll(" ", "-")}`);
    const before = readFileSync(statePath(fixture.dir), "utf8");
    const rejected = captureConsoleError(() => run(["po-authority-decision-plan"], {
      ...fixture.deps,
      poGateProfile: () => ({ ok: true, value: { ...fixture.profile, ...change } }),
    }));
    ok(`PS55g malformed current profile ${name} is a typed byte-null refusal`, rejected.value === 2
      && /PO-DECISION-CURRENT-AUTHORITY/u.test(rejected.text)
      && readFileSync(statePath(fixture.dir), "utf8") === before);
  }
}

{
  const fixture = seedPoAuthorityRebind("po-decision-current-marker-invalid");
  const prdPath = join(fixture.dir, fixture.planPath);
  writeFileSync(prdPath, readFileSync(prdPath, "utf8").replace(fixture.oldSpecSha, fixture.oldSpecSha.toUpperCase()));
  const before = readFileSync(statePath(fixture.dir), "utf8");
  const rejected = captureConsoleError(() => run(["po-authority-decision-plan"], fixture.deps));
  ok("PS55h malformed current PRD marker is a typed byte-null refusal", rejected.value === 2
    && /PO-DECISION-PRD-MARKER/u.test(rejected.text)
    && readFileSync(statePath(fixture.dir), "utf8") === before);
}

{
  const fixture = seedPoAuthorityRebind("po-decision-current-profile-drift");
  const planned = captureConsole(() => run(["po-authority-decision-plan"], fixture.deps));
  const plan = JSON.parse(planned.text || "{}");
  const selectionAction = plan.selectionActions?.find((action) => action.selectedCandidate === "spec");
  const selected = selectionAction
    ? captureConsole(() => run(selectionAction.argv.slice(1), fixture.deps))
    : { value: 2, text: "" };
  const selection = JSON.parse(selected.text || "{}");
  const before = readFileSync(statePath(fixture.dir), "utf8");
  const rejected = selection.applyAction
    ? captureConsoleError(() => run(selection.applyAction.argv.slice(1), {
      ...fixture.deps,
      poGateProfile: () => ({ ok: true, value: { ...fixture.profile, receiptSha256: "9".repeat(64) } }),
    }))
    : { value: 0 };
  ok("PS55i current-profile drift after selection fails closed before mutation", planned.value === 0
    && selected.value === 0
    && rejected.value === 2
    && readFileSync(statePath(fixture.dir), "utf8") === before);
}

{
  // Moved here from plugins/pipeline-core/scripts/pipeline-state.test.mjs (F7,
  // GF-075/GF-077): validCurrentDecisionDocuments falls back to
  // profile.humanFacing only when continuity.runtime.documentLanguage is
  // unset; when it IS set, the PO-language marker must match documentLanguage
  // instead. A profile of "en" with documentLanguage "fr" and a PRD marked
  // "fr" must still plan cleanly -- the old behavior (falling back to
  // profile.humanFacing alone) would have rejected it with
  // PO-DECISION-CURRENT-AUTHORITY.
  const dir = freshDir("po-decision-doclang");
  const featureDir = join(dir, "specs", "document-lang-decision");
  mkdirSync(featureDir, { recursive: true });
  mkdirSync(dirname(statePath(dir)), { recursive: true });
  const planPath = "specs/document-lang-decision/prd_feature.md";
  const specPath = "specs/document-lang-decision/spec.md";
  writeFileSync(join(dir, specPath), "# Spec content\n");
  const currentSpecSha256 = createHash("sha256").update(readFileSync(join(dir, specPath))).digest("hex");
  const oldSpecSha256 = createHash("sha256").update("# older Spec\n").digest("hex");
  writeFileSync(join(dir, planPath), `<!-- po-language: fr -->\n<!-- technical-spec-sha256: ${oldSpecSha256} -->\n# PRD\n`);
  const planSha256Value = createHash("sha256").update(readFileSync(join(dir, planPath))).digest("hex");
  const profile = {
    schema: "pipeline.po-gate-authority-evidence.v1", humanFacing: "en",
    sourceSha256: A, runtimeSha256: B, receiptSha256: C, repositoryFingerprint: D,
  };
  const continuity = {
    schema: "pipeline.continuity.v0", featureId: "document-lang-decision", revision: 3,
    runtime: { humanFacingLanguage: "en", activeDuty: "Coordinator", documentLanguage: "fr" },
    authority: { prd: { path: planPath, sha256: planSha256Value }, spec: { path: specPath, sha256: currentSpecSha256 }, result: null },
    queueHead: { packageId: "nova", actionId: "doclang", nextAction: "review", productRetryCount: 0, environmentRerouteCount: 0, dispatch: null },
    blocker: null, acknowledgedFinal: null, resume: { mode: "immediate", sourceRevision: 0, reasonCode: "active-turn" }, recovery: null, decisionTxn: null,
    capacity: { concurrencyLimit: 4, reservedCriticSlots: 1, reservedRecoverySlots: 1, fallbackPolicy: "defer" },
  };
  const state = {
    schema: SCHEMA_ID, activeFeature: { id: "document-lang-decision", planPath, phase: "implementation" }, planApproved: true,
    planApproval: {
      schema: "pipeline.plan-approval.v2", approvedBy: "PO", approvedAt: "2026-08-01T00:00:00.000Z",
      specBoundBy: "PO", specBoundAt: "2026-08-01T00:00:00.000Z",
      poGateAuthority: { ...profile, schema: "pipeline.po-gate-authority.v2", planPath, planSha256: planSha256Value, specPath, specSha256: currentSpecSha256 },
    },
    continuity, updatedAt: "2026-08-01T00:00:00.000Z",
  };
  writeFileSync(statePath(dir), JSON.stringify(state, null, 2) + "\n");
  const deps = { dir, now: () => "2026-08-09T10:00:00.000Z", poGateProfile: () => ({ ok: true, value: profile }) };
  const planned = captureConsole(() => run(["po-authority-decision-plan"], deps));
  const plan = JSON.parse(planned.text || "{}");
  ok("PS55j a non-de/en documentLanguage marker matching continuity.runtime.documentLanguage plans cleanly", planned.value === 0
    && plan.schema === "pipeline.po-authority-decision-plan.v1"
    && plan.status === "planned");
}

{
  const fixture = seedPoAuthorityRebind("po-decision-selection-drift");
  const state = readState(fixture.dir).state;
  state.activeFeature.phase = "design";
  writeFileSync(statePath(fixture.dir), JSON.stringify(state, null, 2) + "\n");
  writeFileSync(join(fixture.dir, fixture.planPath), `${readFileSync(join(fixture.dir, fixture.planPath), "utf8")}\nDrifted PRD.\n`);
  const plan = JSON.parse(captureConsole(() => run(["po-authority-decision-plan"], fixture.deps)).text || "{}");
  const specSelection = plan.selectionActions.find((action) => action.selectedCandidate === "spec");
  const selection = JSON.parse(captureConsole(() => run(specSelection.argv.slice(1), fixture.deps)).text || "{}");
  writeFileSync(join(fixture.dir, fixture.specPath), "# drift after selection\n");
  const beforeState = readFileSync(statePath(fixture.dir), "utf8");
  const rejected = captureConsoleError(() => run(selection.applyAction.argv.slice(1), fixture.deps));
  ok("PS54e document drift after selection is byte-null", rejected.value === 2
    && readFileSync(statePath(fixture.dir), "utf8") === beforeState);
}

{
  const fixture = seedPoAuthorityRebind("po-rebind-mismatched-authority");
  const state = readState(fixture.dir).state; state.continuity.authority.prd.sha256 = "d".repeat(64);
  writeFileSync(statePath(fixture.dir), JSON.stringify(state, null, 2) + "\n");
  const rejected = captureConsoleError(() => run(["po-authority-rebind-plan"], fixture.deps));
  ok("PS53f mismatched stale Continuity PRD authority is not a repair target", rejected.value === 2);
}
{
  const fixture = seedPoAuthorityRebind("po-rebind-drift");
  const planned = captureConsole(() => run(["po-authority-rebind-plan"], fixture.deps)); const plan = JSON.parse(planned.text || "{}");
  writeFileSync(join(fixture.dir, fixture.specPath), "# changed after plan\n");
  const before = readFileSync(statePath(fixture.dir), "utf8");
  const drift = captureConsoleError(() => run(plan.applyAction.argv.slice(1), fixture.deps));
  ok("PS53g Spec preimage drift blocks apply before mutation", drift.value === 2 && readFileSync(statePath(fixture.dir), "utf8") === before);
}

{
  const fixture = seedPoAuthorityRebind("po-rebind-human-postimage-drift");
  const planned = captureConsole(() => run(["po-authority-rebind-plan"], fixture.deps));
  const plan = JSON.parse(planned.text || "{}");
  const prdBefore = readFileSync(join(fixture.dir, fixture.planPath), "utf8");
  const stateBefore = readFileSync(statePath(fixture.dir), "utf8");
  let postimageEvidence = null;
  const rejected = captureConsoleError(() => run(plan.applyAction.argv.slice(1), {
    ...fixture.deps,
    afterRebindStateWritten: () => {
      const postimageState = readState(fixture.dir).state;
      postimageState.planApproval.approvedBy = PHOENIX_SPEC_BOUND_BY;
      writeFileSync(statePath(fixture.dir), JSON.stringify(postimageState, null, 2) + "\n");
    },
    observeRebindPostimageEvidence: (evidence) => { postimageEvidence = evidence; },
  }));
  ok("PS53u valid Human postimage drift fails state-value readback and restores exact preimages", rejected.value === 2
    && postimageEvidence?.predicates?.stateValue?.ok === false
    && /rollback verified/iu.test(rejected.text)
    && readFileSync(join(fixture.dir, fixture.planPath), "utf8") === prdBefore
    && readFileSync(statePath(fixture.dir), "utf8") === stateBefore);
}

{
  const fixture = seedPoAuthorityRebind("po-rebind-write-fault");
  const planned = captureConsole(() => run(["po-authority-rebind-plan"], fixture.deps)); const plan = JSON.parse(planned.text || "{}");
  const prdBefore = readFileSync(join(fixture.dir, fixture.planPath), "utf8"); const stateBefore = readFileSync(statePath(fixture.dir), "utf8");
  const prdPrepare = captureConsoleError(() => run(plan.applyAction.argv.slice(1), { ...fixture.deps, replaceRebindPrdFdContents: () => { throw new Error("injected PRD prepare failure"); } }));
  ok("PS53g PRD prepare failure is byte-null before the transaction begins", prdPrepare.value === 2 && /rollback verified/i.test(prdPrepare.text) && readFileSync(join(fixture.dir, fixture.planPath), "utf8") === prdBefore && readFileSync(statePath(fixture.dir), "utf8") === stateBefore);
  const statePrepare = captureConsoleError(() => run(plan.applyAction.argv.slice(1), { ...fixture.deps, replaceRebindStateFdContents: () => { throw new Error("injected State prepare failure"); } }));
  ok("PS53h State prepare failure rolls the already-written PRD back completely", statePrepare.value === 2 && /rollback verified/i.test(statePrepare.text) && readFileSync(join(fixture.dir, fixture.planPath), "utf8") === prdBefore && readFileSync(statePath(fixture.dir), "utf8") === stateBefore);
  let stateRenameFaulted = false;
  const renamedPlan = JSON.parse(captureConsole(() => run(["po-authority-rebind-plan"], fixture.deps)).text || "{}");
  const stateRenameEffect = captureConsoleError(() => run(renamedPlan.applyAction.argv.slice(1), { ...fixture.deps, renameRebindState: (from, to) => { renameSync(from, to); if (!stateRenameFaulted) { stateRenameFaulted = true; throw new Error("injected State rename-effect failure"); } } }));
  ok("PS53i State rename-effect failure rolls both postimages back completely", stateRenameEffect.value === 2 && /rollback verified/i.test(stateRenameEffect.text) && readFileSync(join(fixture.dir, fixture.planPath), "utf8") === prdBefore && readFileSync(statePath(fixture.dir), "utf8") === stateBefore);
  const replanned = captureConsole(() => run(["po-authority-rebind-plan"], fixture.deps)); const repairPlan = JSON.parse(replanned.text || "{}");
  const readbackFault = captureConsoleError(() => run(repairPlan.applyAction.argv.slice(1), {
    ...fixture.deps,
    v4Inspection: ({ intent }) => ({
      status: "partial",
      diagnostics: [{ code: `injected_${intent}_readback` }],
    }),
  }));
  ok("PS53j postimage V4 failure rolls both authority surfaces back without logging readback payload", readbackFault.value === 2
    && /postimage readback failed/iu.test(readbackFault.text)
    && !/pipeline\.po-authority-postimage-readback\.v1/u.test(readbackFault.text)
    && !/injected_(bootstrap|session|dispatch)_readback/u.test(readbackFault.text)
    && /rollback verified/iu.test(readbackFault.text)
    && readFileSync(join(fixture.dir, fixture.planPath), "utf8") === prdBefore
    && readFileSync(statePath(fixture.dir), "utf8") === stateBefore);
}

{
  const fixture = seedPoAuthorityRebind("po-rebind-crash-prepared");
  const planned = captureConsole(() => run(["po-authority-rebind-plan"], fixture.deps)); const plan = JSON.parse(planned.text || "{}");
  const prdBefore = readFileSync(join(fixture.dir, fixture.planPath), "utf8"); const stateBefore = readFileSync(statePath(fixture.dir), "utf8");
  const journal = `${statePath(fixture.dir)}.po-authority-rebind.v1`;
  const interrupted = captureConsoleError(() => run(plan.applyAction.argv.slice(1), {
    ...fixture.deps, afterRebindTransactionPrepared: () => { throw new Error("injected crash after journal prepare"); },
  }));
  ok("PS53k prepared-journal crash retains exact preimages and its recovery anchor", interrupted.value === 2 && existsSync(journal)
    && readFileSync(join(fixture.dir, fixture.planPath), "utf8") === prdBefore && readFileSync(statePath(fixture.dir), "utf8") === stateBefore);
  const resumed = captureConsole(() => run(plan.applyAction.argv.slice(1), fixture.deps));
  const after = readState(fixture.dir).state;
  ok("PS53l exact confirmed replay resumes a prepared transaction without a false no-op", resumed.value === 0 && JSON.parse(resumed.text).code === "PO-REBIND-APPLIED"
    && !existsSync(journal) && after.planApproval.poGateAuthority.specSha256 === fixture.newSpecSha && after.continuity.revision === 4);
}
{
  const fixture = seedPoAuthorityRebind("po-rebind-crash-mixed");
  const planned = captureConsole(() => run(["po-authority-rebind-plan"], fixture.deps)); const plan = JSON.parse(planned.text || "{}");
  const prdBefore = readFileSync(join(fixture.dir, fixture.planPath), "utf8"); const stateBefore = readFileSync(statePath(fixture.dir), "utf8");
  const journal = `${statePath(fixture.dir)}.po-authority-rebind.v1`;
  const interrupted = captureConsoleError(() => run(plan.applyAction.argv.slice(1), {
    ...fixture.deps, afterRebindPrdWritten: () => { throw new Error("injected crash after PRD commit"); },
  }));
  ok("PS53m mixed-journal crash preserves the journal and exposes no success", interrupted.value === 2 && existsSync(journal)
    && readFileSync(join(fixture.dir, fixture.planPath), "utf8") !== prdBefore && readFileSync(statePath(fixture.dir), "utf8") === stateBefore);
  const recovered = captureConsoleError(() => run(plan.applyAction.argv.slice(1), fixture.deps));
  const replanned = captureConsole(() => run(["po-authority-rebind-plan"], fixture.deps));
  ok("PS53n mixed replay rolls back completely and permits a fresh closed plan", recovered.value === 2 && /recovered its interrupted transaction/i.test(recovered.text)
    && !existsSync(journal) && readFileSync(join(fixture.dir, fixture.planPath), "utf8") === prdBefore
    && readFileSync(statePath(fixture.dir), "utf8") === stateBefore && replanned.value === 0);
}
{
  const fixture = seedPoAuthorityRebind("po-rebind-crash-committed");
  const planned = captureConsole(() => run(["po-authority-rebind-plan"], fixture.deps)); const plan = JSON.parse(planned.text || "{}");
  const journal = `${statePath(fixture.dir)}.po-authority-rebind.v1`;
  const prdPath = join(fixture.dir, fixture.planPath); const stateFilePath = statePath(fixture.dir);
  const prdBefore = readFileSync(prdPath, "utf8"); const stateBefore = readFileSync(stateFilePath, "utf8");
  const interrupted = captureConsoleError(() => run(plan.applyAction.argv.slice(1), {
    ...fixture.deps, afterRebindStateWritten: () => { throw new Error("injected crash after State commit"); },
  }));
  const postPrd = readFileSync(prdPath); const postState = readFileSync(stateFilePath);
  ok("PS53o committed-journal crash retains both postimages and its recovery anchor", interrupted.value === 2 && existsSync(journal)
    && postPrd.includes(fixture.newSpecSha) && readState(fixture.dir).state.continuity.revision === 4);
  const postPrdIdentity = lstatSync(prdPath); const postStateIdentity = lstatSync(stateFilePath);
  writeFileSync(`${prdPath}.replacement`, postPrd); renameSync(`${prdPath}.replacement`, prdPath);
  writeFileSync(`${stateFilePath}.replacement`, postState); renameSync(`${stateFilePath}.replacement`, stateFilePath);
  const replacedPrdIdentity = lstatSync(prdPath); const replacedStateIdentity = lstatSync(stateFilePath);
  const replay = captureConsoleError(() => run(plan.applyAction.argv.slice(1), fixture.deps));
  const replanned = captureConsole(() => run(["po-authority-rebind-plan"], fixture.deps));
  ok("PS53p same-byte postimage inode replacement is rolled back and requires a fresh plan",
    postPrdIdentity.ino !== replacedPrdIdentity.ino && postStateIdentity.ino !== replacedStateIdentity.ino
    && replay.value === 2 && /recovered its interrupted transaction/i.test(replay.text) && !existsSync(journal)
    && readFileSync(prdPath, "utf8") === prdBefore && readFileSync(stateFilePath, "utf8") === stateBefore
    && replanned.value === 0);
}

if (symlinkCapable) {
  const fixture = seedPoAuthorityRebind("po-rebind-link");
  const prd = join(fixture.dir, fixture.planPath); const real = `${prd}.real`;
  renameSync(prd, real); symlinkSync(real, prd);
  const rejected = captureConsoleError(() => run(["po-authority-rebind-plan"], fixture.deps));
  ok("PS53q linked PRD is refused before any plan or mutation", rejected.value === 2 && readFileSync(statePath(fixture.dir), "utf8").includes("nova-shaped"));
}
{
  const fixture = seedPoAuthorityRebind("po-rebind-hardlink");
  const prd = join(fixture.dir, fixture.planPath);
  linkSync(prd, `${prd}.hard`);
  const rejected = captureConsoleError(() => run(["po-authority-rebind-plan"], fixture.deps));
  ok("PS53r hard-linked PRD is refused before any plan or mutation", rejected.value === 2 && readFileSync(statePath(fixture.dir), "utf8").includes("nova-shaped"));
}
{
  const fixture = seedPoAuthorityRebind("po-rebind-permission-drift");
  const planned = captureConsole(() => run(["po-authority-rebind-plan"], fixture.deps)); const plan = JSON.parse(planned.text || "{}");
  const beforePrd = readFileSync(join(fixture.dir, fixture.planPath), "utf8"); const beforeState = readFileSync(statePath(fixture.dir), "utf8");
  chmodSync(join(fixture.dir, fixture.planPath), 0o600);
  const rejected = captureConsoleError(() => run(plan.applyAction.argv.slice(1), fixture.deps));
  ok("PS53s permission/identity drift blocks apply before mutation", rejected.value === 2 && readFileSync(join(fixture.dir, fixture.planPath), "utf8") === beforePrd && readFileSync(statePath(fixture.dir), "utf8") === beforeState);
}
{
  const fixture = seedPoAuthorityRebind("po-rebind-profile-security");
  const before = readFileSync(statePath(fixture.dir), "utf8");
  const rejected = captureConsoleError(() => run(["po-authority-rebind-plan"], { ...fixture.deps, poGateProfile: () => ({ ok: false, code: "PO-PROFILE-AUTHORITY-UNAVAILABLE" }) }));
  ok("PS53t failed existing PO-profile DACL assurance blocks planning byte-null", rejected.value === 2 && readFileSync(statePath(fixture.dir), "utf8") === before);
}
}

let pass = 0;
const failures = [];
function ok(id, cond, detail = "") {
  if (cond) {
    pass++;
    console.log(`PASS  ${id}`);
  } else {
    failures.push(`${id}${detail ? `: ${detail}` : ""}`);
    console.log(`FAIL  ${id}${detail ? ` -- ${detail}` : ""}`);
  }
}

let symlinkCapable = true;
{
  const probeDir = mkdtempSync(join(tmpdir(), "pipeline-state-symlink-probe-"));
  try { writeFileSync(join(probeDir, "target"), "x"); symlinkSync(join(probeDir, "target"), join(probeDir, "link")); }
  catch { symlinkCapable = false; }
  finally { rmSync(probeDir, { recursive: true, force: true }); }
  if (!symlinkCapable) console.log("[capability: symlink unavailable] skipping symlink-specific checks");
}

function captureConsoleError(action) {
  const original = console.error;
  const messages = [];
  console.error = (...args) => messages.push(args.join(" "));
  try {
    return { value: action(), text: messages.join("\n") };
  } finally {
    console.error = original;
  }
}
function captureConsole(action) {
  const original = console.log; const messages = []; console.log = (...args) => messages.push(args.join(" "));
  try { return { value: action(), text: messages.join("\n") }; } finally { console.log = original; }
}

const FIXED_NOW = () => "2026-07-07T21:00:00.000Z";
const FIXED_GIT_HEAD = () => ({ ok: true, commit: "abc123deadbeef" });
const FIXED_NOW_MS = () => 60_000;
let nonceSequence = 0;
const continuityDeps = (dir, overrides = {}) => ({
  dir,
  now: FIXED_NOW,
  nowMs: FIXED_NOW_MS,
  ownerNonce: () => `nonce-${String(++nonceSequence).padStart(8, "0")}`,
  lockStaleMs: 30_000,
  ...overrides,
});
const A = "a".repeat(64);
const B = "b".repeat(64);
const RESULT_FIXTURE = "```pipeline-result\n{\n  \"finalIntegrations\": []\n}\n```\n";
const COURSE_RESULT_FIXTURE = "```pipeline-result\n{\n  \"decisionBriefs\": [],\n  \"courseDecisionIntents\": [],\n  \"courseDecisionReceipts\": [],\n  \"finalIntegrations\": []\n}\n```\n";
const C = createHash("sha256").update(RESULT_FIXTURE).digest("hex");
const D = "d".repeat(64);
const CONTINUITY_FEATURE = "phase26-test";

if (process.env.PIPELINE_STATE_PS53_ONLY === "1") {
  runPoAuthorityRebindTests();
  for (const dir of ALL_DIRS) rmSync(dir, { recursive: true, force: true });
  const total = pass + failures.length;
  console.log(`\n${pass}/${total} cases passed.`);
  if (failures.length > 0) {
    console.log("Failures:");
    for (const failure of failures) console.log(`  - ${failure}`);
    process.exit(1);
  }
  process.exit(0);
}

function injectedPoGateAuthority(planPath) {
  const planSha256 = createHash("sha256").update(`fixture:${planPath}`).digest("hex");
  const specPath = `${planPath.slice(0, planPath.lastIndexOf("/") + 1)}spec.md`;
  const specSha256 = createHash("sha256").update(`fixture:${specPath}`).digest("hex");
  const value = {
    schema: PO_GATE_AUTHORITY_EVIDENCE_V2_SCHEMA,
    humanFacing: "de",
    sourceSha256: A,
    runtimeSha256: B,
    receiptSha256: C,
    repositoryFingerprint: D,
    planPath,
    planSha256,
    specPath,
    specSha256,
  };
  return ({ expectedPlanSha256, expectedSpecSha256 } = {}) =>
    (expectedPlanSha256 === undefined || expectedPlanSha256 === planSha256)
      && (expectedSpecSha256 === undefined || expectedSpecSha256 === specSha256)
      ? { ok: true, code: "PO-GATE-AUTHORITY-VALID", value }
      : { ok: false, code: "PO-GATE-AUTHORITY-STALE" };
}

function injectedPoGateProfile() {
  return () => ({
    ok: true,
    code: "PO-PROFILE-AUTHORITY-VALID",
    value: {
      schema: PO_GATE_AUTHORITY_EVIDENCE_SCHEMA,
      humanFacing: "de",
      sourceSha256: A,
      runtimeSha256: B,
      receiptSha256: C,
      repositoryFingerprint: D,
    },
  });
}

function lifecycleDeps(dir, planPath, overrides = {}) {
  return {
    dir,
    now: FIXED_NOW,
    poGateAuthority: injectedPoGateAuthority(planPath),
    poGateProfile: injectedPoGateProfile(),
    ...overrides,
  };
}

function lifecycleContinuity(featureId, authority) {
  return {
    schema: "pipeline.continuity.v0",
    featureId,
    revision: 0,
    runtime: {
      humanFacingLanguage: authority.humanFacing,
      activeDuty: "Coordinator",
      sessionCleanup: null,
    },
    authority: {
      prd: { path: authority.planPath, sha256: authority.planSha256 },
      spec: { path: authority.specPath, sha256: authority.specSha256 },
      result: null,
    },
    queueHead: {
      packageId: "initial-planning",
      actionId: "review-plan",
      nextAction: "review",
      productRetryCount: 0,
      environmentRerouteCount: 0,
      dispatch: null,
    },
    blocker: null,
    acknowledgedFinal: null,
    resume: { mode: "immediate", sourceRevision: 0, reasonCode: "active-turn" },
    recovery: null,
    decisionTxn: null,
    capacity: {
      concurrencyLimit: 4,
      reservedCriticSlots: 1,
      reservedRecoverySlots: 1,
      fallbackPolicy: "defer",
    },
  };
}

function initializeLifecycleContinuity(dir, featureId, planPath) {
  const observed = injectedPoGateAuthority(planPath)();
  if (!observed.ok) return 2;
  const requestFile = writeRequest(
    dir,
    `lifecycle-continuity-${featureId}`,
    lifecycleContinuity(featureId, observed.value),
  );
  return run(
    continuityArgs("continuity-init", "absent", requestFile),
    continuityDeps(dir),
  );
}

function submitAndApprove(dir, planPath) {
  const activeFeature = readState(dir).state.activeFeature;
  const initialized = initializeLifecycleContinuity(dir, activeFeature.id, planPath);
  const deps = lifecycleDeps(dir, planPath);
  const submitted = run(["submit-plan", "--by", "coordinator", "--profile", "feature"], deps);
  run(["present-plan", "--by", "coordinator"], deps);
  const approved = run(["approve-plan", "--by", "po-test"], deps);
  return { initialized, submitted, approved };
}

function seedSubprocessPoGateAuthority(dir, planPath) {
  const sourcePath = join(dir, "pipeline.user.yaml");
  const runtimePath = join(dir, ".claude", "pipeline.yaml");
  if (!existsSync(sourcePath)) {
    writeFileSync(sourcePath, "schema: pipeline.user.v1\nlanguage:\n  human_facing: de\n  agent_facing: en\n");
  }
  if (!existsSync(runtimePath)) {
    mkdirSync(join(dir, ".claude"), { recursive: true });
    writeFileSync(runtimePath, "schema: pipeline.manifest.v0\nlanguage:\n  human_facing: de\n");
  }
  mkdirSync(join(dir, ...planPath.split("/").slice(0, -1)), { recursive: true });
  const specPath = join(dir, ...planPath.split("/").slice(0, -1), "spec.md");
  const specBytes = Buffer.from("# Test Spec\n", "utf8");
  writeFileSync(specPath, specBytes);
  const specSha256 = createHash("sha256").update(specBytes).digest("hex");
  writeFileSync(join(dir, planPath), `${PO_GATE_PRD_LANGUAGE_MARKER("de")}\n${PO_GATE_PRD_ACKNOWLEDGEMENT_MARKER}\n<!-- technical-spec-sha256: ${specSha256} -->\n# Test PRD\n`);

  const gitCommonDir = join(dir, ".git");
  const receipt = createPoGateProfileReceipt({
    repositoryFingerprint: derivePoGateRepositoryFingerprint({ gitCommonDir, primaryRoot: dir }),
    primaryRoot: dir,
    sourceBytes: readFileSync(sourcePath),
    runtimeBytes: readFileSync(runtimePath),
    updatedAt: FIXED_NOW(),
  });
  const receiptPath = poGateProfileReceiptPath(gitCommonDir);
  mkdirSync(join(gitCommonDir, "agent-pipeline", "po-gate"), { recursive: true });
  if (process.platform === "win32") {
    let cursor = gitCommonDir;
    for (const component of dirname(PO_GATE_PROFILE_RECEIPT_RELATIVE_PATH).split(/[\\/]/u).filter(Boolean)) {
      cursor = join(cursor, component);
      hardenWindowsPrivateDirectory(cursor);
    }
  }
  writeFileSync(receiptPath, serializePoGateProfileReceipt(receipt));
  chmodSync(receiptPath, 0o600);
}

function initializeSubprocessLifecycleContinuity(dir, featureId, planPath, env) {
  const specPath = `${planPath.slice(0, planPath.lastIndexOf("/") + 1)}spec.md`;
  const authority = {
    humanFacing: "de",
    planPath,
    planSha256: createHash("sha256").update(readFileSync(join(dir, planPath))).digest("hex"),
    specPath,
    specSha256: createHash("sha256").update(readFileSync(join(dir, specPath))).digest("hex"),
  };
  const requestFile = writeRequest(
    dir,
    `subprocess-lifecycle-continuity-${featureId}`,
    lifecycleContinuity(featureId, authority),
  );
  return spawnSync(process.execPath, [
    CLI,
    ...continuityArgs("continuity-init", "absent", requestFile),
  ], { encoding: "utf8", env });
}

function continuityIdentity(overrides = {}) {
  return {
    featureId: CONTINUITY_FEATURE,
    queueRevision: 0,
    packageId: "P1",
    actionId: "continuity-writer",
    dispatchId: "dispatch-p1-01",
    attemptId: "attempt-01",
    authorityDigests: { prdSha256: A, specSha256: B, resultSha256: C },
    routeRequestSha256: D,
    mayDelegate: false,
    ...overrides,
  };
}

function continuityQueue(overrides = {}) {
  return {
    packageId: "P1",
    actionId: "continuity-writer",
    nextAction: "poll",
    productRetryCount: 0,
    environmentRerouteCount: 0,
    dispatch: continuityIdentity(),
    ...overrides,
  };
}

function continuityState(overrides = {}) {
  return {
    schema: "pipeline.continuity.v0",
    featureId: CONTINUITY_FEATURE,
    revision: 0,
    runtime: { humanFacingLanguage: "en", activeDuty: "Coordinator" },
    authority: {
      prd: { path: "specs/prd.md", sha256: A },
      spec: { path: "specs/spec.md", sha256: B },
      result: { path: "specs/result.md", sha256: C },
    },
    queueHead: continuityQueue(),
    blocker: null,
    acknowledgedFinal: null,
    resume: { mode: "immediate", sourceRevision: 0, reasonCode: "active-turn" },
    recovery: null,
    decisionTxn: null,
    capacity: { concurrencyLimit: 3, reservedCriticSlots: 1, reservedRecoverySlots: 1, fallbackPolicy: "defer" },
    ...overrides,
  };
}

function writeRequest(dir, name, value) {
  const rel = `${name}.json`;
  writeFileSync(join(dir, rel), JSON.stringify(value, null, 2) + "\n");
  return rel;
}

function seedContinuityRoot(dir) {
  run(["set-feature", "--id", CONTINUITY_FEATURE, "--plan-path", "specs/prd.md"], { dir, now: FIXED_NOW });
  mkdirSync(join(dir, "specs"), { recursive: true });
  writeFileSync(join(dir, "specs", "result.md"), RESULT_FIXTURE);
}

function seedCourseContinuityRoot(dir) {
  seedContinuityRoot(dir);
  writeFileSync(join(dir, "specs", "result.md"), COURSE_RESULT_FIXTURE);
  return createHash("sha256").update(COURSE_RESULT_FIXTURE).digest("hex");
}

function courseOption(kind, index, continuationTransitionSha256 = A) {
  return {
    optionId: `option-${index}`,
    kind,
    equivalenceKey: `course-${index}`,
    expectedOutcome: `outcome-${index}`,
    scopeDelta: { add: [], modify: [], remove: [] },
    requiredEvidence: [{ id: `evidence-${index}`, sha256: A }],
    timeCost: { minimumMinutes: 0, maximumMinutes: 30, confidence: "medium" },
    residualRisk: `risk-${index}`,
    securityAssuranceClaims: [],
    claimImpact: { addedClaims: [], removedClaims: [], retainedNonClaims: ["os-isolation"] },
    reversibility: "reversible",
    authority: kind === "stop" || kind === "defer" ? "po" : "coordinator",
    permittedOperations: [],
    trustBoundary: "unchanged",
    newTrustBoundaries: [],
    rollbackImpact: `rollback-${index}`,
    resumeImpact: `resume-${index}`,
    resumePredicate: kind === "defer" ? "external-predicate" : null,
    continuationTransitionSha256: kind === "defer" || kind === "stop" ? null : continuationTransitionSha256,
  };
}

function courseBrief(revision = 1, continuationTransitionSha256 = A) {
  return buildCourseDecisionBrief({
    briefId: "brief-01",
    featureId: CONTINUITY_FEATURE,
    revision,
    gateId: "gate-01",
    blockerId: "blocker-01",
    commit: "a".repeat(40),
    tree: "b".repeat(40),
    authorityDigests: { prd: A, spec: B },
    normalizedFailureSignature: D,
    similarityGroupId: "similar-product-failure",
    triggerEvidence: [
      { attemptId: "attempt-01", attemptSha256: A, resultId: "result-01", resultSha256: B, evidence: [{ id: "evidence-01", sha256: C }] },
      { attemptId: "attempt-02", attemptSha256: B, resultId: "result-02", resultSha256: C, evidence: [{ id: "evidence-02", sha256: D }] },
    ],
    observedCount: 2,
    configuredLimit: 1,
    gateTrigger: { kind: "repeated-signature", budget: null },
    consumedBudgets: { productRetries: 1, environmentReroutes: 0, reviewRounds: 1, correctionCommits: 1 },
    invariants: ["INV-01"],
    nonClaims: ["os-isolation"],
    forbiddenOperations: ["main-merge", "force-push"],
    exactPoDecisionQuestion: "Which evidence-bound course should be selected?",
    alternatives: COURSE_KINDS.map((kind, index) => courseOption(kind, index, continuationTransitionSha256)),
    eliminated: [],
    recommendation: { optionId: "option-0", evidence: [{ id: "recommendation-evidence", sha256: A }], nonBinding: true },
  });
}

function courseDispositionDigest(kind, intent, resumePredicate) {
  return sha256Canonical({
    schema: "pipeline.course-disposition.v1",
    kind,
    idempotencyKey: intent.idempotencyKey,
    briefSha256: intent.briefSha256,
    optionId: intent.optionId,
    blockerSignature: intent.blockerSignature,
    poEvidenceSha256: intent.poEvidenceSha256,
    preStateSha256: intent.preStateSha256,
    expectedRevision: intent.expectedRevision,
    selectedRevision: intent.selectedRevision,
    dispatchableRevision: intent.dispatchableRevision,
    resumePredicate,
  });
}

function continuityArgs(sub, revision, requestFile, token = "token-00000001") {
  return [sub, "--expected-revision", String(revision), "--request-file", requestFile, "--lock-token", token];
}

function finalTransactionFixture(dir, name = "txn") {
  seedContinuityRoot(dir);
  const initial = continuityState();
  const initFile = writeRequest(dir, `${name}-init`, initial);
  run(continuityArgs("continuity-init", "absent", initFile), continuityDeps(dir));
  const resultJson = JSON.stringify({ verdict: "pass" });
  const envelope = {
    schema: "pipeline.continuity-final.v0", identity: continuityIdentity(), outcome: "succeeded",
    resultJson, resultBytes: Buffer.byteLength(resultJson, "utf8"),
  };
  const delivered = { ...envelope, resultDigest: computeContinuityFinalDigest(envelope) };
  const observation = { status: "completed", identity: continuityIdentity(), final: delivered };
  const next = structuredClone(initial);
  next.revision = 1;
  next.acknowledgedFinal = {
    identity: continuityIdentity(), resultDigest: delivered.resultDigest,
    finalOutcome: "succeeded", integratedRevision: 1,
  };
  next.queueHead = continuityQueue({ actionId: `${name}-next`, nextAction: "dispatch", dispatch: null });
  next.resume = { mode: "immediate", sourceRevision: 1, reasonCode: "active-turn" };
  const nextTransition = Object.fromEntries(
    ["queueHead", "blocker", "resume", "recovery", "decisionTxn", "capacity"].map((key) => [key, next[key]]),
  );
  const request = { observation, nextTransition, result: { path: "specs/result.md", preResultSha256: C } };
  return { initial, request, requestFile: writeRequest(dir, `${name}-final`, request) };
}

function canonicalFixtureJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalFixtureJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalFixtureJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

// ---- PS01: approve-plan without --by is refused, nothing written ----------------------
{
  const dir = freshDir("refuse-approve-no-by");
  const code = run(["approve-plan"], { dir, now: FIXED_NOW });
  ok("PS01a approve-plan without --by refused (exit 2)", code === 2, `got ${code}`);
  ok("PS01b nothing written (state file absent)", readState(dir).status === "absent");
}

// ---- PS02: approve-plan with empty --by is refused -------------------------------------
{
  const dir = freshDir("refuse-approve-empty-by");
  const code = run(["approve-plan", "--by", ""], { dir, now: FIXED_NOW });
  ok("PS02 approve-plan with empty --by refused (exit 2)", code === 2, `got ${code}`);
}

// ---- PS03: revoke-plan without --by is refused -----------------------------------------
{
  const dir = freshDir("refuse-revoke-no-by");
  const code = run(["revoke-plan"], { dir, now: FIXED_NOW });
  ok("PS03 revoke-plan without --by refused (exit 2)", code === 2, `got ${code}`);
}

// ---- PS04: approve-push without --by is refused ----------------------------------------
{
  const dir = freshDir("refuse-push-no-by");
  const code = run(["approve-push"], { dir, now: FIXED_NOW, gitHead: FIXED_GIT_HEAD });
  ok("PS04 approve-push without --by refused (exit 2)", code === 2, `got ${code}`);
}

// ---- PS05: malformed pre-existing state file -> English error, exit 2, no overwrite -----
{
  const dir = freshDir("malformed-existing");
  mkdirSync(join(dir, ".claude"), { recursive: true });
  writeFileSync(join(dir, ".claude", "pipeline-state.json"), "{ this is not json");
  const before = readFileSync(statePath(dir), "utf8");
  const code = run(["set-feature", "--id", "x", "--plan-path", "p.md"], { dir, now: FIXED_NOW });
  ok("PS05a malformed existing file -> exit 2", code === 2, `got ${code}`);
  const after = readFileSync(statePath(dir), "utf8");
  ok("PS05b file left byte-identical (no silent overwrite)", after === before);
}

// ---- PS06: approve-plan shape correct ---------------------------------------------------
{
  const dir = freshDir("approve-shape");
  run(["set-feature", "--id", "ap1-pipeline-tuning", "--plan-path", ".claude/plans/x.md"], { dir, now: FIXED_NOW });
  const initialized = initializeLifecycleContinuity(
    dir,
    "ap1-pipeline-tuning",
    ".claude/plans/x.md",
  );
  const submitted = run(
    ["submit-plan", "--by", "coordinator", "--profile", "feature"],
    lifecycleDeps(dir, ".claude/plans/x.md"),
  );
  const code = run(["approve-plan", "--by", "po-test"], lifecycleDeps(dir, ".claude/plans/x.md"));
  ok("PS06a-1 continuity-init exit 0", initialized === 0, `got ${initialized}`);
  ok("PS06a0 submit-plan exit 0", submitted === 0, `got ${submitted}`);
  ok("PS06a approve-plan exit 0", code === 0, `got ${code}`);
  const state = readState(dir).state;
  ok("PS06b schema field correct", state.schema === SCHEMA_ID);
  ok("PS06c planApproved true", state.planApproved === true);
  ok(
    "PS06d planApproval is exact v4 and binds the submitted Plan, Spec, profile authority, and an empty audit seal",
    state.planSubmission?.schema === "pipeline.plan-submission.v1"
      && state.planApproval?.schema === "pipeline.plan-approval.v4"
      && state.planApproval?.approvedBy === "po-test"
      && state.planApproval?.approvedAt === FIXED_NOW()
      && state.planApproval?.submissionSha256
      && state.planApproval?.priorInvalidationSha256 === null
      && state.planApproval?.poGateAuthority?.schema === PO_GATE_AUTHORITY_EVIDENCE_V2_SCHEMA,
  );
  ok("PS06e activeFeature preserved from set-feature", state.activeFeature?.id === "ap1-pipeline-tuning");
}

// ---- PS07: set-feature resets planApproved to false + phase design ---------------------
{
  const dir = freshDir("set-feature-reset");
  run(["set-feature", "--id", "f1", "--plan-path", "p1.md"], { dir, now: FIXED_NOW });
  const approved = readState(dir).state;
  approved.planApproved = true;
  approved.planApproval = { approvedBy: "legacy-po", approvedAt: FIXED_NOW() };
  writeFileSync(statePath(dir), `${JSON.stringify(approved, null, 2)}\n`);
  run(["set-feature", "--id", "f2", "--plan-path", "p2.md"], { dir, now: FIXED_NOW });
  const state = readState(dir).state;
  ok("PS07a new feature resets planApproved=false", state.planApproved === false);
  ok("PS07b phase reset to design (inside activeFeature, F1 fix)", state.activeFeature?.phase === "design");
  ok("PS07c prior planApproval cleared", state.planApproval === undefined);
  ok("PS07d activeFeature reflects the NEW feature", state.activeFeature?.id === "f2");
}

// ---- PS08: reopen-design invalidates exact submission/approval authority --------------
{
  const dir = freshDir("revoke");
  run(["set-feature", "--id", "f1", "--plan-path", "p1.md"], { dir, now: FIXED_NOW });
  submitAndApprove(dir, "p1.md");
  const code = run(["reopen-design", "--by", "po-test"], { dir, now: FIXED_NOW });
  ok("PS08a reopen-design exit 0", code === 0, `got ${code}`);
  const state = readState(dir).state;
  ok("PS08b planApproved false after reopen", state.planApproved === false && state.activeFeature.phase === "design");
  ok("PS08c exact invalidation recorded", state.planInvalidation?.schema === "pipeline.plan-invalidation.v1" && state.planInvalidation?.invalidatedBy === "po-test");
  const beforeReplay = readFileSync(statePath(dir), "utf8");
  const replay = run(["reopen-design", "--by", "po-test"], { dir, now: () => "2026-07-07T22:00:00.000Z" });
  ok("PS08d reopen replay accepts the stored timestamp after an ambiguous response", replay === 0, `got ${replay}`);
  ok("PS08e reopen replay leaves state byte-identical", readFileSync(statePath(dir), "utf8") === beforeReplay);
}

// ---- PS08a: seal v3 approval retained across an invalidation into exact v4 -------------
{
  const dir = freshDir("approval-audit-seal");
  const planPath = "specs/seal/prd_seal.md";
  run(["set-feature", "--id", "approval-audit-seal", "--plan-path", planPath], { dir, now: FIXED_NOW });
  submitAndApprove(dir, planPath);
  const deps = lifecycleDeps(dir, planPath);
  const reopened = run(["reopen-design", "--by", "po-test"], deps);
  const successorDeps = lifecycleDeps(dir, planPath, { now: () => "2026-07-08T21:00:00.000Z" });
  const successorSubmitted = run(["submit-plan", "--by", "coordinator", "--profile", "feature"], successorDeps);
  const successorApproved = run(["approve-plan", "--by", "po-test"], successorDeps);
  const legacy = readState(dir).state;
  const { priorInvalidationSha256: _ignored, ...v3Approval } = legacy.planApproval;
  const historicalV3 = {
    ...legacy,
    planApproved: true,
    planApproval: { ...v3Approval, schema: "pipeline.plan-approval.v3" },
  };
  writeFileSync(statePath(dir), `${JSON.stringify(historicalV3, null, 2)}\n`);
  const beforeSeal = readState(dir).state;
  const sealed = captureConsole(() => run(["seal-plan-approval"], successorDeps));
  const afterSeal = readState(dir).state;
  ok("PS08a-1 fixture reopens a prior approval before retaining a successor v3 audit record", reopened === 0 && successorSubmitted === 0 && successorApproved === 0 && beforeSeal.planInvalidation?.schema === "pipeline.plan-invalidation.v1");
  ok("PS08a-2 seal-plan-approval upgrades only a retained v3 approval and emits its audit receipt", sealed.value === 0 && sealed.text.includes("Plan approval audit seal written"));
  ok(
    "PS08a-3 seal readback is exact v4 and binds the canonical retained invalidation",
    afterSeal.planApproved === true
      && afterSeal.planApproval?.schema === "pipeline.plan-approval.v4"
      && afterSeal.planApproval?.priorInvalidationSha256 === sha256Canonical(beforeSeal.planInvalidation)
      && afterSeal.planApproval?.approvedBy === beforeSeal.planApproval?.approvedBy
      && afterSeal.planApproval?.approvedAt === beforeSeal.planApproval?.approvedAt
      && afterSeal.planApproval?.submissionSha256 === beforeSeal.planApproval?.submissionSha256
      && JSON.stringify(afterSeal.planApproval?.poGateAuthority) === JSON.stringify(beforeSeal.planApproval?.poGateAuthority),
  );
  ok("PS08a-4 exact v4 readback permits the implementation lifecycle transition", run(["set-phase", "--phase", "implementation"], successorDeps) === 0);
  const beforeReplay = readFileSync(statePath(dir), "utf8");
  const replay = captureConsoleError(() => run(["seal-plan-approval"], successorDeps));
  ok("PS08a-5 seal replay rejects the already-v4 approval without a false success claim or mutation", replay.value === 2 && replay.text.includes("PLAN-APPROVAL-SEAL-V3-REQUIRED") && readFileSync(statePath(dir), "utf8") === beforeReplay);
  const malformed = captureConsoleError(() => run(["seal-plan-approval", "--by", "po-test"], successorDeps));
  ok("PS08a-6 seal CLI refuses caller arguments without mutating the exact v4 readback", malformed.value === 2 && readFileSync(statePath(dir), "utf8") === beforeReplay);
}

// ---- PS08f: bind-plan-spec replay keeps the stored bind time --------------------------
{
  const dir = freshDir("bind-plan-spec-replay");
  const planPath = "specs/bind/prd_bind.md";
  const planSha256 = createHash("sha256").update(`fixture:${planPath}`).digest("hex");
  const specPath = "specs/bind/spec.md";
  const specSha256 = createHash("sha256").update(`fixture:${specPath}`).digest("hex");
  const authority = injectedPoGateAuthority(planPath);
  run(["set-feature", "--id", "bind-replay", "--plan-path", planPath], { dir, now: FIXED_NOW });
  const legacy = readState(dir).state;
  writeFileSync(statePath(dir), JSON.stringify({
    ...legacy,
    planApproved: true,
    planApproval: { approvedBy: "original-po", approvedAt: FIXED_NOW() },
  }, null, 2) + "\n");
  const first = run([
    "bind-plan-spec", "--by", "po-test", "--expected-plan-sha256", planSha256, "--expected-spec-sha256", specSha256,
  ], { dir, now: FIXED_NOW, poGateAuthority: authority });
  const beforeReplay = readFileSync(statePath(dir), "utf8");
  const replay = run([
    "bind-plan-spec", "--by", "po-test", "--expected-plan-sha256", planSha256, "--expected-spec-sha256", specSha256,
  ], { dir, now: () => "2026-07-07T22:00:00.000Z", poGateAuthority: authority });
  ok("PS08f bind-plan-spec initial transition exits 0", first === 0, `got ${first}`);
  ok("PS08g bind-plan-spec replay exits 0 with a newer wall clock", replay === 0, `got ${replay}`);
  ok("PS08h bind-plan-spec replay leaves state byte-identical", readFileSync(statePath(dir), "utf8") === beforeReplay);
}

// ---- PS09: set-phase updates only phase ------------------------------------------------
{
  const dir = freshDir("set-phase");
  run(["set-feature", "--id", "f1", "--plan-path", "p1.md"], { dir, now: FIXED_NOW });
  submitAndApprove(dir, "p1.md");
  const code = run(["set-phase", "--phase", "implementation"], { dir, now: FIXED_NOW });
  ok("PS09a set-phase exit 0", code === 0, `got ${code}`);
  const state = readState(dir).state;
  ok("PS09b phase updated (inside activeFeature, F1 fix)", state.activeFeature?.phase === "implementation");
  ok("PS09c planApproved untouched", state.planApproved === true);
  ok("PS09d activeFeature id/planPath untouched by set-phase", state.activeFeature?.id === "f1" && state.activeFeature?.planPath === "p1.md");
}

// ---- PS10: approve-push rejects attribution-only approval ------------------------------
{
  const dir = freshDir("approve-push-shape");
  const code = run(["approve-push", "--by", "po-test"], { dir, now: FIXED_NOW, gitHead: FIXED_GIT_HEAD });
  ok("PS10a approve-push without a critical proof is refused", code === 2, `got ${code}`);
  ok("PS10b attribution-only approval leaves state absent", readState(dir).status === "absent");
}

// ---- PS11: approve-push fails cleanly when git rev-parse HEAD fails -------------------
{
  const dir = freshDir("approve-push-no-git");
  const code = run(["approve-push", "--by", "po-test"], {
    dir,
    now: FIXED_NOW,
    gitHead: () => ({ ok: false, error: "not a git repository" }),
  });
  ok("PS11 approve-push without a resolvable HEAD refused (exit 2)", code === 2, `got ${code}`);
}

// ---- PS12: real subprocess invocation end-to-end (real git repo) ----------------------
{
  const dir = freshDir("subprocess-e2e");
  const git = (...args) => spawnSync("git", args, { cwd: dir, encoding: "utf8" });
  git("init", "-q");
  git("config", "user.email", "goldfish@example.invalid");
  git("config", "user.name", "Goldfish");
  writeFileSync(join(dir, "README.md"), "fixture\n");
  git("add", "README.md");
  git("commit", "-q", "-m", "init");
  const head = git("rev-parse", "HEAD").stdout.trim();

  const planPath = "specs/e2e/prd_e2e.md";
  seedSubprocessPoGateAuthority(dir, planPath);
  const res1 = spawnSync(process.execPath, [CLI, "set-feature", "--id", "e2e", "--plan-path", planPath], {
    encoding: "utf8",
    env: { ...process.env, CLAUDE_PROJECT_DIR: dir },
  });
  ok("PS12a subprocess set-feature exit 0", res1.status === 0, `stderr: ${res1.stderr}`);
  const e2eEnv = { ...process.env, CLAUDE_PROJECT_DIR: dir };
  const continuity = initializeSubprocessLifecycleContinuity(dir, "e2e", planPath, e2eEnv);
  ok("PS12a1 subprocess continuity-init exit 0", continuity.status === 0, `stderr: ${continuity.stderr}`);

  const submitted = spawnSync(process.execPath, [
    CLI, "submit-plan", "--by", "coordinator", "--profile", "feature",
  ], {
    encoding: "utf8",
    env: e2eEnv,
  });
  ok("PS12b0 subprocess submit-plan exit 0", submitted.status === 0, `stderr: ${submitted.stderr}`);

  const res2 = spawnSync(process.execPath, [CLI, "approve-plan", "--by", "po-test"], {
    encoding: "utf8",
    env: { ...process.env, CLAUDE_PROJECT_DIR: dir },
  });
  ok("PS12b subprocess approve-plan exit 0", res2.status === 0, `stderr: ${res2.stderr}`);

  const res3 = spawnSync(process.execPath, [CLI, "approve-push", "--by", "po-test"], {
    encoding: "utf8",
    env: { ...process.env, CLAUDE_PROJECT_DIR: dir },
  });
  ok("PS12c subprocess approve-push without critical proof is refused", res3.status === 2, `stderr: ${res3.stderr}`);

  const finalState = JSON.parse(readFileSync(statePath(dir), "utf8"));
  ok("PS12d final state has planApproved true", finalState.planApproved === true);
  ok("PS12e final state has no attribution-only pushApproval", finalState.pushApproval === undefined);
  ok("PS12f state file is pretty-printed (contains newline+indent)", readFileSync(statePath(dir), "utf8").includes("\n  "));
}

// ---- PS13: unknown subcommand refused ---------------------------------------------------
{
  const dir = freshDir("unknown-cmd");
  const code = run(["frobnicate"], { dir, now: FIXED_NOW });
  ok("PS13 unknown subcommand refused (exit 2)", code === 2, `got ${code}`);
  ok("PS13b nothing written", !existsSync(statePath(dir)));
}

// ---- PS14: F1 REAL end-to-end integration -- the real CLI subprocess writes the state file,
// stop-suggest.mjs's own real resolver reads it -- this is the exact test class whose absence
// let Finding F1 (specs/2026-07-07-ap1-tuning/e2e-demo.md) ship: pipeline-state.mjs wrote
// `phase` top-level while stop-suggest.mjs reads `activeFeature.phase`, and neither suite
// noticed because both fixtured the SAME (mismatched) shape independently instead of one
// producing real output for the other to consume. Declared here (not in stop-suggest.test.mjs)
// because it exercises pipeline-state.mjs's real CLI as the state-producing half.
{
  const dir = freshDir("f1-integration");
  const git = (...args) => spawnSync("git", args, { cwd: dir, encoding: "utf8" });
  git("init", "-q");
  git("config", "user.email", "goldfish@example.invalid");
  git("config", "user.name", "Goldfish");
  writeFileSync(join(dir, "README.md"), "fixture\n");
  git("add", "README.md");
  git("commit", "-q", "-m", "init");
  mkdirSync(join(dir, ".claude"), { recursive: true });
  writeFileSync(
    join(dir, ".claude", "pipeline.yaml"),
    [
      "schema: pipeline.manifest.v0",
      "language:",
      "  human_facing: de",
      "phases:",
      "  - name: design",
      "    enabled: true",
      "  - name: implementation",
      "    enabled: true",
      "  - name: security-scan",
      "    enabled: true",
      "gates:",
      "  dev-plan:",
      "    mode: blocking",
      "    type: human",
      "  push:",
      "    mode: blocking",
      "    type: human",
      "  security:",
      "    mode: blocking",
      "    type: automated",
      "profiles:",
      "  active: full-sdlc",
      "  full-sdlc:",
      "    phases:",
      "      - design",
      "      - implementation",
      "      - security-scan",
      "flags:",
      "  has_ui: false",
      "",
    ].join("\n"),
  );

  const planPath = "specs/f1-integration/prd_f1-integration.md";
  seedSubprocessPoGateAuthority(dir, planPath);

  const env = { ...process.env, CLAUDE_PROJECT_DIR: dir };
  const r1 = spawnSync(process.execPath, [CLI, "set-feature", "--id", "f1-integration-test", "--plan-path", planPath], {
    encoding: "utf8",
    env,
  });
  ok("PS14a F1-integration: real set-feature subprocess exit 0", r1.status === 0, `stderr: ${r1.stderr}`);
  const continuity = initializeSubprocessLifecycleContinuity(
    dir,
    "f1-integration-test",
    planPath,
    env,
  );
  ok("PS14a-1 F1-integration: real continuity-init subprocess exit 0", continuity.status === 0, `stderr: ${continuity.stderr}`);
  const submitted = spawnSync(process.execPath, [
    CLI, "submit-plan", "--by", "coordinator", "--profile", "feature",
  ], { encoding: "utf8", env });
  ok("PS14a0 F1-integration: real submit-plan subprocess exit 0", submitted.status === 0, `stderr: ${submitted.stderr}`);
  const r2 = spawnSync(process.execPath, [CLI, "approve-plan", "--by", "po-test"], { encoding: "utf8", env });
  ok("PS14b F1-integration: real approve-plan subprocess exit 0", r2.status === 0, `stderr: ${r2.stderr}`);
  const r3 = spawnSync(process.execPath, [CLI, "set-phase", "--phase", "implementation"], { encoding: "utf8", env });
  ok("PS14c F1-integration: real set-phase subprocess exit 0", r3.status === 0, `stderr: ${r3.stderr}`);

  // Feed the REAL resulting file into stop-suggest.mjs's OWN real loader/resolver (not a
  // fixture reconstruction) -- this is the load-bearing cross-check.
  const manifest = loadManifestSafe(dir);
  ok("PS14d F1-integration: real manifest loads ok via stop-suggest's loadManifestSafe", manifest !== null);
  const state = loadStateSafe(statePath(dir));
  ok("PS14e F1-integration: real CLI-written state file loads via stop-suggest's loadStateSafe", state !== null);
  ok(
    "PS14f F1-integration: real state has activeFeature.phase populated (THE F1 bug: this used to be undefined)",
    state?.activeFeature?.phase === "implementation",
    JSON.stringify(state),
  );

  const suggestion = resolveSuggestion(manifest, state);
  ok(
    "PS14g F1-integration: resolveSuggestion produces a NON-EMPTY suggestion against the REAL CLI-written state",
    typeof suggestion === "string" && suggestion.length > 0,
    suggestion,
  );
  ok(
    "PS14h F1-integration: suggestion names the next phase (security-scan)",
    typeof suggestion === "string" && suggestion.includes("security-scan"),
    suggestion,
  );
}

// ---- PS15: close-feature without --by is refused, nothing written ---------------------
{
  const dir = freshDir("close-feature-no-by");
  const code = run(["close-feature"], { dir, now: FIXED_NOW, gitHead: FIXED_GIT_HEAD });
  ok("PS15a close-feature without --by refused (exit 2)", code === 2, `got ${code}`);
  ok("PS15b nothing written (state file absent)", readState(dir).status === "absent");
}

// ---- PS16: close-feature with empty --by is refused ------------------------------------
{
  const dir = freshDir("close-feature-empty-by");
  const code = run(["close-feature", "--by", ""], { dir, now: FIXED_NOW, gitHead: FIXED_GIT_HEAD });
  ok("PS16 close-feature with empty --by refused (exit 2)", code === 2, `got ${code}`);
}

// ---- PS17: close-feature without an activeFeature is refused, nothing written ----------
{
  const dir = freshDir("close-feature-no-active");
  const code = run(["close-feature", "--by", "po-test"], { dir, now: FIXED_NOW, gitHead: FIXED_GIT_HEAD });
  ok("PS17a close-feature without activeFeature refused (exit 2)", code === 2, `got ${code}`);
  ok("PS17b nothing written (state file absent)", readState(dir).status === "absent");
}

// ---- PS18: close-feature with an activeFeature -- full shape assertion -----------------
{
  const dir = freshDir("close-feature-shape");
  run(["set-feature", "--id", "f-close", "--plan-path", "p-close.md"], { dir, now: FIXED_NOW });
  run(["approve-plan", "--by", "po-test"], {
    dir,
    now: FIXED_NOW,
    poGateAuthority: injectedPoGateAuthority("p-close.md"),
  });
  const code = run(["close-feature", "--by", "po-test"], { dir, now: FIXED_NOW, gitHead: FIXED_GIT_HEAD });
  ok("PS18a close-feature exit 0", code === 0, `got ${code}`);
  const state = readState(dir).state;
  ok("PS18b activeFeature removed", state.activeFeature === undefined);
  ok("PS18c planApproved false", state.planApproved === false);
  ok("PS18d planApproval cleared", state.planApproval === undefined);
  ok("PS18e planRevocation cleared", state.planRevocation === undefined);
  ok(
    "PS18f closedFeatures[0] shape correct",
    state.closedFeatures?.length === 1 &&
      state.closedFeatures[0].id === "f-close" &&
      state.closedFeatures[0].planPath === "p-close.md" &&
      state.closedFeatures[0].phaseAtClose === "design" &&
      state.closedFeatures[0].closedAt === FIXED_NOW() &&
      state.closedFeatures[0].closedBy === "po-test" &&
      state.closedFeatures[0].forCommit === "abc123deadbeef",
    JSON.stringify(state.closedFeatures),
  );
  ok("PS18g close-feature does not synthesize a pushApproval", state.pushApproval === undefined);
}

// ---- PS19: close-feature best-effort on a git failure (DEVIATION vs. approve-push) -----
{
  const dir = freshDir("close-feature-coordinator");
  run(["set-feature", "--id", "f-coordinated", "--plan-path", "specs/f/plan.md"], { dir, now: FIXED_NOW });
  const activeFeature = readState(dir).state.activeFeature;
  const coordinatedStateSha256 = createHash("sha256")
    .update(readFileSync(statePath(dir)))
    .digest("hex");
  let coordinator = createCloseCoordinator({
    lifecycleId: "close-f-coordinated",
    featureId: activeFeature.id,
    activeFeature,
    authority: {
      implementationResultSha256: null,
      pipelineStateSha256: coordinatedStateSha256,
      planSha256: B,
      prdSha256: C,
      specSha256: D,
    },
  });
  for (const phase of ["checkpointed", "feature-close-prepared"]) {
    coordinator = advanceCloseCoordinator(coordinator, {
      expectedRevision: coordinator.revision,
      expectedStateSha256: closeCoordinatorDigest(coordinator),
      phase,
      inputDigest: A,
      observedDigest: B,
      operationSha256: D,
      ...(phase === "feature-close-prepared"
        ? { authority: { ...coordinator.authority, implementationResultSha256: D } }
        : {}),
    });
  }
  const digest = closeCoordinatorDigest(coordinator);
  const deps = {
    dir,
    now: FIXED_NOW,
    gitHead: FIXED_GIT_HEAD,
    gitCommonDir: () => ({ ok: true, path: dir }),
    readCloseCoordinator: () => ({ coordinator, rawDigest: C }),
  };
  const rejected = run([
    "close-feature", "--by", "po-test",
    "--coordinator-lifecycle", coordinator.lifecycleId,
    "--coordinator-sha256", D,
  ], deps);
  ok("PS18h close-feature rejects a stale coordinator digest", rejected === 2, `got ${rejected}`);
  const exactStateBytes = readFileSync(statePath(dir), "utf8");
  const driftedState = JSON.parse(exactStateBytes);
  driftedState.updatedAt = "2026-07-07T21:00:01.000Z";
  writeFileSync(statePath(dir), JSON.stringify(driftedState, null, 2) + "\n");
  const stateDriftRejected = run([
    "close-feature", "--by", "po-test",
    "--coordinator-lifecycle", coordinator.lifecycleId,
    "--coordinator-sha256", digest,
  ], deps);
  ok("PS18i coordinator-bound close rejects byte-level Pipeline State drift", stateDriftRejected === 2);
  writeFileSync(statePath(dir), exactStateBytes);
  const code = run([
    "close-feature", "--by", "po-test",
    "--coordinator-lifecycle", coordinator.lifecycleId,
    "--coordinator-sha256", digest,
  ], deps);
  const closed = readState(dir).state.closedFeatures?.[0]?.coordinatorClose;
  ok("PS18j exact feature-close-prepared coordinator permits the State sub-effect", code === 0, `got ${code}`);
  ok("PS18k close audit binds the exact coordinator lifecycle/revision/digest",
    closed?.lifecycleId === coordinator.lifecycleId
      && closed?.revision === coordinator.revision
      && closed?.stateSha256 === digest
      && closed?.phase === "feature-close-prepared",
    JSON.stringify(closed));
}

// ---- PS19: close-feature best-effort on a git failure (DEVIATION vs. approve-push) -----
{
  const dir = freshDir("close-feature-git-error");
  run(["set-feature", "--id", "f-git-err", "--plan-path", "p.md"], { dir, now: FIXED_NOW });
  const code = run(["close-feature", "--by", "po-test"], {
    dir,
    now: FIXED_NOW,
    gitHead: () => ({ ok: false, error: "not a git repository" }),
  });
  ok("PS19a close-feature with unresolvable git HEAD still exits 0", code === 0, `got ${code}`);
  const state = readState(dir).state;
  ok("PS19b forCommit null on git failure", state.closedFeatures?.[0]?.forCommit === null);
  ok("PS19c activeFeature still removed despite git failure", state.activeFeature === undefined);
}

// ---- PS20: close-feature appends -- prior closedFeatures entries are preserved ---------
{
  const dir = freshDir("close-feature-append");
  run(["set-feature", "--id", "f-first", "--plan-path", "p1.md"], { dir, now: FIXED_NOW });
  run(["close-feature", "--by", "po-test"], { dir, now: FIXED_NOW, gitHead: FIXED_GIT_HEAD });
  run(["set-feature", "--id", "f-second", "--plan-path", "p2.md"], { dir, now: FIXED_NOW });
  const code = run(["close-feature", "--by", "po-test"], { dir, now: FIXED_NOW, gitHead: FIXED_GIT_HEAD });
  ok("PS20a second close-feature exit 0", code === 0, `got ${code}`);
  const state = readState(dir).state;
  ok("PS20b closedFeatures length 2", state.closedFeatures?.length === 2, JSON.stringify(state.closedFeatures));
  ok("PS20c first closedFeatures entry unchanged", state.closedFeatures?.[0]?.id === "f-first");
  ok("PS20d second closedFeatures entry appended", state.closedFeatures?.[1]?.id === "f-second");
}

// ---- PS21: close-feature silences the stop-suggest nudge (no activeFeature -> null) ----
{
  const dir = freshDir("close-feature-nudge-silence");
  mkdirSync(join(dir, ".claude"), { recursive: true });
  writeFileSync(
    join(dir, ".claude", "pipeline.yaml"),
    [
      "schema: pipeline.manifest.v0",
      "phases:",
      "  - name: design",
      "    enabled: true",
      "  - name: implementation",
      "    enabled: true",
      "  - name: security-scan",
      "    enabled: true",
      "gates:",
      "  dev-plan:",
      "    mode: blocking",
      "    type: human",
      "  push:",
      "    mode: blocking",
      "    type: human",
      "  security:",
      "    mode: blocking",
      "    type: automated",
      "profiles:",
      "  active: full-sdlc",
      "  full-sdlc:",
      "    phases:",
      "      - design",
      "      - implementation",
      "      - security-scan",
      "flags:",
      "  has_ui: false",
      "",
    ].join("\n"),
  );
  run(["set-feature", "--id", "nudge-test", "--plan-path", ".claude/plans/nudge.md"], { dir, now: FIXED_NOW });
  run(["set-phase", "--phase", "implementation"], { dir, now: FIXED_NOW });

  const manifestBefore = loadManifestSafe(dir);
  const stateBefore = loadStateSafe(statePath(dir));
  const suggestionBefore = resolveSuggestion(manifestBefore, stateBefore);
  ok(
    "PS21a sanity: BEFORE close-feature the nudge is non-empty",
    typeof suggestionBefore === "string" && suggestionBefore.length > 0,
    suggestionBefore,
  );

  const code = run(["close-feature", "--by", "po-test"], { dir, now: FIXED_NOW, gitHead: FIXED_GIT_HEAD });
  ok("PS21b close-feature exit 0", code === 0, `got ${code}`);

  const manifestAfter = loadManifestSafe(dir);
  const stateAfter = loadStateSafe(statePath(dir));
  const suggestionAfter = resolveSuggestion(manifestAfter, stateAfter);
  ok("PS21c AFTER close-feature the nudge is silent (null)", suggestionAfter === null, JSON.stringify(suggestionAfter));
}

// ---- PS22: close-feature refuses when activeFeature.id is blank (F2 hardening) ---------
{
  const dir = freshDir("close-feature-blank-id");
  mkdirSync(join(dir, ".claude"), { recursive: true });
  writeFileSync(
    join(dir, ".claude", "pipeline-state.json"),
    JSON.stringify({ schema: SCHEMA_ID, activeFeature: { id: "", planPath: "p.md", phase: "design" } }, null, 2) + "\n",
  );
  const before = readFileSync(statePath(dir), "utf8");
  const code = run(["close-feature", "--by", "po-test"], { dir, now: FIXED_NOW, gitHead: FIXED_GIT_HEAD });
  ok("PS22a close-feature with blank activeFeature.id refused (exit 2)", code === 2, `got ${code}`);
  const after = readFileSync(statePath(dir), "utf8");
  ok("PS22b file left byte-identical (no silent write)", after === before);
}

// ---- PS23: close-feature refuses when activeFeature.planPath is blank (F2 hardening) ---
{
  const dir = freshDir("close-feature-blank-planpath");
  mkdirSync(join(dir, ".claude"), { recursive: true });
  writeFileSync(
    join(dir, ".claude", "pipeline-state.json"),
    JSON.stringify({ schema: SCHEMA_ID, activeFeature: { id: "f-blank-plan", planPath: "  ", phase: "design" } }, null, 2) + "\n",
  );
  const before = readFileSync(statePath(dir), "utf8");
  const code = run(["close-feature", "--by", "po-test"], { dir, now: FIXED_NOW, gitHead: FIXED_GIT_HEAD });
  ok("PS23a close-feature with blank activeFeature.planPath refused (exit 2)", code === 2, `got ${code}`);
  const after = readFileSync(statePath(dir), "utf8");
  ok("PS23b file left byte-identical (no silent write)", after === before);
}

// ---- PS24: close-feature refuses when existing closedFeatures is not an array (F2) -----
{
  const dir = freshDir("close-feature-nonarray-closed");
  mkdirSync(join(dir, ".claude"), { recursive: true });
  writeFileSync(
    join(dir, ".claude", "pipeline-state.json"),
    JSON.stringify(
      { schema: SCHEMA_ID, activeFeature: { id: "f-ok", planPath: "p.md", phase: "design" }, closedFeatures: "not-an-array" },
      null,
      2,
    ) + "\n",
  );
  const before = readFileSync(statePath(dir), "utf8");
  const code = run(["close-feature", "--by", "po-test"], { dir, now: FIXED_NOW, gitHead: FIXED_GIT_HEAD });
  ok("PS24a close-feature with non-array closedFeatures refused (exit 2)", code === 2, `got ${code}`);
  const after = readFileSync(statePath(dir), "utf8");
  ok("PS24b file left byte-identical (no silent overwrite with [])", after === before);
}

// ---- PS25: close-feature happy path still succeeds and appends the audit entry ---------
// (regression guard: the new F2 validations must not break the normal case already
// covered by PS18/PS20 -- kept as an explicit, minimal case named for the F2 fix.)
{
  const dir = freshDir("close-feature-f2-happy-path");
  run(["set-feature", "--id", "f2-happy", "--plan-path", "p2-happy.md"], { dir, now: FIXED_NOW });
  const code = run(["close-feature", "--by", "po-test"], { dir, now: FIXED_NOW, gitHead: FIXED_GIT_HEAD });
  ok("PS25a close-feature happy path exit 0", code === 0, `got ${code}`);
  const state = readState(dir).state;
  ok(
    "PS25b closedFeatures[0] appended with correct id/planPath",
    state.closedFeatures?.length === 1 && state.closedFeatures[0].id === "f2-happy" && state.closedFeatures[0].planPath === "p2-happy.md",
    JSON.stringify(state.closedFeatures),
  );
  ok("PS25c activeFeature removed", state.activeFeature === undefined);
}

// ---- PS26: approve-deploy binds {forArtifact, forEnvironment, approvedBy, approvedAt} -----
{
  const dir = freshDir("approve-deploy-shape");
  const code = run(["approve-deploy", "--env", "prod", "--artifact", "v1.0.0", "--by", "po-test"], { dir, now: FIXED_NOW });
  ok("PS26a approve-deploy exit 0", code === 0, `got ${code}`);
  const state = readState(dir).state;
  ok(
    "PS26b deployApprovals[0] shape correct",
    state.deployApprovals?.length === 1 &&
      state.deployApprovals[0].forArtifact === "v1.0.0" &&
      state.deployApprovals[0].forEnvironment === "prod" &&
      state.deployApprovals[0].approvedBy === "po-test" &&
      state.deployApprovals[0].approvedAt === FIXED_NOW() &&
      state.deployApprovals[0].usedAt === undefined,
    JSON.stringify(state.deployApprovals),
  );
}

// ---- PS27: approve-deploy refuses blank --env/--artifact/--by, nothing written ------------
{
  const dir = freshDir("approve-deploy-blank-env");
  const code = run(["approve-deploy", "--env", "", "--artifact", "v1.0.0", "--by", "po-test"], { dir, now: FIXED_NOW });
  ok("PS27a approve-deploy blank --env refused (exit 2)", code === 2, `got ${code}`);
  ok("PS27b nothing written", readState(dir).status === "absent");
}
{
  const dir = freshDir("approve-deploy-blank-artifact");
  const code = run(["approve-deploy", "--env", "prod", "--artifact", "", "--by", "po-test"], { dir, now: FIXED_NOW });
  ok("PS27c approve-deploy blank --artifact refused (exit 2)", code === 2, `got ${code}`);
  ok("PS27d nothing written", readState(dir).status === "absent");
}
{
  const dir = freshDir("approve-deploy-blank-by");
  const code = run(["approve-deploy", "--env", "prod", "--artifact", "v1.0.0", "--by", ""], { dir, now: FIXED_NOW });
  ok("PS27e approve-deploy blank --by refused (exit 2)", code === 2, `got ${code}`);
  ok("PS27f nothing written", readState(dir).status === "absent");
}
{
  const dir = freshDir("approve-deploy-missing-env");
  const code = run(["approve-deploy", "--artifact", "v1.0.0", "--by", "po-test"], { dir, now: FIXED_NOW });
  ok("PS27g approve-deploy missing --env refused (exit 2)", code === 2, `got ${code}`);
}

// ---- PS28: a `test` approval does NOT satisfy a `prod` check ------------------------------
{
  const dir = freshDir("deploy-env-does-not-cross");
  run(["approve-deploy", "--env", "test", "--artifact", "v1.0.0", "--by", "po-test"], { dir, now: FIXED_NOW });
  const codeWrongEnv = run(["consume-deploy", "--env", "prod", "--artifact", "v1.0.0", "--by", "po-test"], { dir, now: FIXED_NOW });
  ok("PS28a consume-deploy for prod fails when only a test approval exists (exit 2)", codeWrongEnv === 2, `got ${codeWrongEnv}`);
  const stateAfterFail = readState(dir).state;
  ok(
    "PS28b test approval left untouched (still unconsumed) after the failed prod check",
    stateAfterFail.deployApprovals?.[0]?.usedAt === undefined,
  );
  const codeRightEnv = run(["consume-deploy", "--env", "test", "--artifact", "v1.0.0", "--by", "po-test"], { dir, now: FIXED_NOW });
  ok("PS28c consume-deploy for the matching test env succeeds (exit 0)", codeRightEnv === 0, `got ${codeRightEnv}`);
}

// ---- PS29: consumed-on-use -- a consumed record fails a second consume-deploy check ------
{
  const dir = freshDir("deploy-consumed-on-use");
  run(["approve-deploy", "--env", "prod", "--artifact", "v1.0.0", "--by", "po-test"], { dir, now: FIXED_NOW });
  const code1 = run(["consume-deploy", "--env", "prod", "--artifact", "v1.0.0", "--by", "po-test"], { dir, now: FIXED_NOW });
  ok("PS29a first consume-deploy exit 0", code1 === 0, `got ${code1}`);
  const state1 = readState(dir).state;
  ok("PS29b usedAt set after first consume", state1.deployApprovals?.[0]?.usedAt === FIXED_NOW());
  const code2 = run(["consume-deploy", "--env", "prod", "--artifact", "v1.0.0", "--by", "po-test"], { dir, now: FIXED_NOW });
  ok("PS29c second consume-deploy on the same record fails (exit 2, never a silent no-op)", code2 === 2, `got ${code2}`);
}

// ---- PS30: consume-deploy refuses blank --env/--artifact/--by ----------------------------
{
  const dir = freshDir("consume-deploy-blank-env");
  run(["approve-deploy", "--env", "prod", "--artifact", "v1.0.0", "--by", "po-test"], { dir, now: FIXED_NOW });
  const code = run(["consume-deploy", "--env", "", "--artifact", "v1.0.0", "--by", "po-test"], { dir, now: FIXED_NOW });
  ok("PS30a consume-deploy blank --env refused (exit 2)", code === 2, `got ${code}`);
}
{
  const dir = freshDir("consume-deploy-blank-artifact");
  run(["approve-deploy", "--env", "prod", "--artifact", "v1.0.0", "--by", "po-test"], { dir, now: FIXED_NOW });
  const code = run(["consume-deploy", "--env", "prod", "--artifact", "", "--by", "po-test"], { dir, now: FIXED_NOW });
  ok("PS30b consume-deploy blank --artifact refused (exit 2)", code === 2, `got ${code}`);
}
{
  const dir = freshDir("consume-deploy-blank-by");
  run(["approve-deploy", "--env", "prod", "--artifact", "v1.0.0", "--by", "po-test"], { dir, now: FIXED_NOW });
  const code = run(["consume-deploy", "--env", "prod", "--artifact", "v1.0.0", "--by", ""], { dir, now: FIXED_NOW });
  ok("PS30c consume-deploy blank --by refused (exit 2)", code === 2, `got ${code}`);
}

// ---- PS31: consume-deploy fails loudly (exit 2, nothing written) on a non-existent record -
{
  const dir = freshDir("consume-deploy-no-record");
  const code = run(["consume-deploy", "--env", "prod", "--artifact", "v1.0.0", "--by", "po-test"], { dir, now: FIXED_NOW });
  ok("PS31a consume-deploy with no prior approval refused (exit 2)", code === 2, `got ${code}`);
  ok("PS31b nothing written (state file absent)", readState(dir).status === "absent");
}

// ---- PS32: clear-deploy removes pending approvals for the env (unconsumed only) ----------
{
  const dir = freshDir("clear-deploy-pending-only");
  run(["approve-deploy", "--env", "prod", "--artifact", "v1.0.0", "--by", "po-test"], { dir, now: FIXED_NOW });
  run(["approve-deploy", "--env", "prod", "--artifact", "v2.0.0", "--by", "po-test"], { dir, now: FIXED_NOW });
  run(["consume-deploy", "--env", "prod", "--artifact", "v1.0.0", "--by", "po-test"], { dir, now: FIXED_NOW });
  const code = run(["clear-deploy", "--env", "prod", "--by", "po-test"], { dir, now: FIXED_NOW });
  ok("PS32a clear-deploy exit 0", code === 0, `got ${code}`);
  const state = readState(dir).state;
  ok(
    "PS32b only the pending (unconsumed) v2.0.0 record was removed -- the consumed v1.0.0 record stays",
    state.deployApprovals?.length === 1 && state.deployApprovals[0].forArtifact === "v1.0.0" && state.deployApprovals[0].usedAt === FIXED_NOW(),
    JSON.stringify(state.deployApprovals),
  );
}

// ---- PS33: clear-deploy narrowed by --artifact only clears the named artifact -------------
{
  const dir = freshDir("clear-deploy-narrowed");
  run(["approve-deploy", "--env", "prod", "--artifact", "v1.0.0", "--by", "po-test"], { dir, now: FIXED_NOW });
  run(["approve-deploy", "--env", "prod", "--artifact", "v2.0.0", "--by", "po-test"], { dir, now: FIXED_NOW });
  const code = run(["clear-deploy", "--env", "prod", "--artifact", "v1.0.0", "--by", "po-test"], { dir, now: FIXED_NOW });
  ok("PS33a clear-deploy narrowed by --artifact exit 0", code === 0, `got ${code}`);
  const state = readState(dir).state;
  ok(
    "PS33b only v1.0.0 removed, v2.0.0 stays pending",
    state.deployApprovals?.length === 1 && state.deployApprovals[0].forArtifact === "v2.0.0",
    JSON.stringify(state.deployApprovals),
  );
}

// ---- PS34: clear-deploy refuses blank --env/--by; --artifact stays optional ---------------
{
  const dir = freshDir("clear-deploy-blank-env");
  run(["approve-deploy", "--env", "prod", "--artifact", "v1.0.0", "--by", "po-test"], { dir, now: FIXED_NOW });
  const code = run(["clear-deploy", "--env", "", "--by", "po-test"], { dir, now: FIXED_NOW });
  ok("PS34a clear-deploy blank --env refused (exit 2)", code === 2, `got ${code}`);
}
{
  const dir = freshDir("clear-deploy-blank-by");
  run(["approve-deploy", "--env", "prod", "--artifact", "v1.0.0", "--by", "po-test"], { dir, now: FIXED_NOW });
  const code = run(["clear-deploy", "--env", "prod", "--by", ""], { dir, now: FIXED_NOW });
  ok("PS34b clear-deploy blank --by refused (exit 2)", code === 2, `got ${code}`);
}
{
  const dir = freshDir("clear-deploy-no-artifact-ok");
  run(["approve-deploy", "--env", "prod", "--artifact", "v1.0.0", "--by", "po-test"], { dir, now: FIXED_NOW });
  const code = run(["clear-deploy", "--env", "prod", "--by", "po-test"], { dir, now: FIXED_NOW });
  ok("PS34c clear-deploy without --artifact (optional) still succeeds (exit 0)", code === 0, `got ${code}`);
}

// ---- PS35: clear-deploy fails loudly (exit 2, nothing written) when nothing matches -------
{
  const dir = freshDir("clear-deploy-no-match");
  const code = run(["clear-deploy", "--env", "prod", "--by", "po-test"], { dir, now: FIXED_NOW });
  ok("PS35a clear-deploy with no matching pending approval refused (exit 2)", code === 2, `got ${code}`);
  ok("PS35b nothing written (state file absent)", readState(dir).status === "absent");
}
{
  const dir = freshDir("clear-deploy-already-consumed-no-match");
  run(["approve-deploy", "--env", "prod", "--artifact", "v1.0.0", "--by", "po-test"], { dir, now: FIXED_NOW });
  run(["consume-deploy", "--env", "prod", "--artifact", "v1.0.0", "--by", "po-test"], { dir, now: FIXED_NOW });
  const before = readFileSync(statePath(dir), "utf8");
  const code = run(["clear-deploy", "--env", "prod", "--by", "po-test"], { dir, now: FIXED_NOW });
  ok("PS35c clear-deploy with only an already-consumed record refused (exit 2)", code === 2, `got ${code}`);
  const after = readFileSync(statePath(dir), "utf8");
  ok("PS35d file left byte-identical (no silent write)", after === before);
}

// ---- PS36: existing malformed-file refusal still holds with the new subcommands ----------
{
  const dir = freshDir("malformed-existing-deploy");
  mkdirSync(join(dir, ".claude"), { recursive: true });
  writeFileSync(join(dir, ".claude", "pipeline-state.json"), "{ this is not json");
  const before = readFileSync(statePath(dir), "utf8");

  const codeApprove = run(["approve-deploy", "--env", "prod", "--artifact", "v1.0.0", "--by", "po-test"], { dir, now: FIXED_NOW });
  ok("PS36a approve-deploy on malformed existing file -> exit 2", codeApprove === 2, `got ${codeApprove}`);
  ok("PS36b file left byte-identical after approve-deploy attempt", readFileSync(statePath(dir), "utf8") === before);

  const codeConsume = run(["consume-deploy", "--env", "prod", "--artifact", "v1.0.0", "--by", "po-test"], { dir, now: FIXED_NOW });
  ok("PS36c consume-deploy on malformed existing file -> exit 2", codeConsume === 2, `got ${codeConsume}`);
  ok("PS36d file left byte-identical after consume-deploy attempt", readFileSync(statePath(dir), "utf8") === before);

  const codeClear = run(["clear-deploy", "--env", "prod", "--by", "po-test"], { dir, now: FIXED_NOW });
  ok("PS36e clear-deploy on malformed existing file -> exit 2", codeClear === 2, `got ${codeClear}`);
  ok("PS36f file left byte-identical after clear-deploy attempt", readFileSync(statePath(dir), "utf8") === before);
}

// ---- PS37: approve-deploy refuses a non-array pre-existing deployApprovals field ---------
{
  const dir = freshDir("approve-deploy-nonarray");
  mkdirSync(join(dir, ".claude"), { recursive: true });
  writeFileSync(
    join(dir, ".claude", "pipeline-state.json"),
    JSON.stringify({ schema: SCHEMA_ID, deployApprovals: "not-an-array" }, null, 2) + "\n",
  );
  const before = readFileSync(statePath(dir), "utf8");
  const code = run(["approve-deploy", "--env", "prod", "--artifact", "v1.0.0", "--by", "po-test"], { dir, now: FIXED_NOW });
  ok("PS37a approve-deploy with non-array deployApprovals refused (exit 2)", code === 2, `got ${code}`);
  const after = readFileSync(statePath(dir), "utf8");
  ok("PS37b file left byte-identical (no silent overwrite)", after === before);
}

// ---- PS38: continuity init is revision-bound, atomic and leaves no transient files --------
{
  const dir = freshDir("continuity-init");
  seedContinuityRoot(dir);
  const requestFile = writeRequest(dir, "continuity-init", continuityState());
  const code = run(continuityArgs("continuity-init", "absent", requestFile), continuityDeps(dir));
  const state = readState(dir).state;
  ok("PS38a continuity-init exit 0", code === 0, `got ${code}`);
  ok("PS38b initialized continuity is persisted at revision 0", state.continuity?.revision === 0);
  ok("PS38c continuity feature is bound to activeFeature.id", state.continuity?.featureId === state.activeFeature?.id);
  ok("PS38d owned lock is released", !existsSync(continuityLockPath(dir)));
  ok("PS38e same-directory temp is absent after rename", !readdirSync(dirname(statePath(dir))).some((name) => name.includes(".tmp.")));
}

// ---- PS39: exact CAS advances once and stale replay is byte-null ---------------------------
{
  const dir = freshDir("continuity-cas");
  seedContinuityRoot(dir);
  const initFile = writeRequest(dir, "init", continuityState());
  run(continuityArgs("continuity-init", "absent", initFile), continuityDeps(dir));
  const next = structuredClone(readState(dir).state.continuity);
  next.revision = 1;
  next.queueHead = continuityQueue({ nextAction: "dispatch", dispatch: null });
  next.resume = { mode: "immediate", sourceRevision: 1, reasonCode: "active-turn" };
  const requestFile = writeRequest(dir, "next", next);
  const first = run(continuityArgs("continuity-cas", 0, requestFile), continuityDeps(dir));
  ok("PS39a exact continuity CAS exit 0", first === 0, `got ${first}`);
  ok("PS39b exact continuity CAS advances to revision 1", readState(dir).state.continuity?.revision === 1);
  const beforeReplay = readFileSync(statePath(dir), "utf8");
  const replay = run(continuityArgs("continuity-cas", 0, requestFile), continuityDeps(dir));
  ok("PS39c stale continuity CAS is refused", replay === 2, `got ${replay}`);
  ok("PS39d stale continuity CAS performs zero byte mutation", readFileSync(statePath(dir), "utf8") === beforeReplay);
}

// ---- PS40: invalid XOR transition fails before write ---------------------------------------
{
  const dir = freshDir("continuity-xor");
  seedContinuityRoot(dir);
  const initFile = writeRequest(dir, "init", continuityState());
  run(continuityArgs("continuity-init", "absent", initFile), continuityDeps(dir));
  const invalid = structuredClone(readState(dir).state.continuity);
  invalid.revision = 1;
  invalid.queueHead.dispatch.queueRevision = 1;
  invalid.blocker = {
    type: "product",
    signature: "invalid-both-v1",
    resumeCondition: { kind: "manual", evidenceSha256: A },
    decisionBrief: null,
  };
  const requestFile = writeRequest(dir, "invalid", invalid);
  const before = readFileSync(statePath(dir), "utf8");
  const code = run(continuityArgs("continuity-cas", 0, requestFile), continuityDeps(dir));
  ok("PS40a queueHead+blocker XOR violation is refused", code === 2, `got ${code}`);
  ok("PS40b invalid XOR transition performs zero byte mutation", readFileSync(statePath(dir), "utf8") === before);
}

// ---- PS41: a fresh foreign lock is preserved and blocks the writer -------------------------
{
  const dir = freshDir("continuity-foreign-lock");
  seedContinuityRoot(dir);
  const initFile = writeRequest(dir, "init", continuityState());
  mkdirSync(join(dir, ".claude"), { recursive: true });
  const foreign = {
    schema: CONTINUITY_LOCK_SCHEMA_ID,
    token: "foreign-token-01",
    ownerNonce: "foreign-nonce-01",
    acquiredAtMs: FIXED_NOW_MS(),
  };
  writeFileSync(continuityLockPath(dir), JSON.stringify(foreign) + "\n");
  const before = readFileSync(statePath(dir), "utf8");
  const code = run(continuityArgs("continuity-init", "absent", initFile), continuityDeps(dir));
  ok("PS41a fresh foreign continuity lock blocks", code === 2, `got ${code}`);
  ok("PS41b foreign lock remains byte-owned by the foreign token", readFileSync(continuityLockPath(dir), "utf8") === JSON.stringify(foreign) + "\n");
  ok("PS41c blocked writer performs zero state mutation", readFileSync(statePath(dir), "utf8") === before);
  foreign.acquiredAtMs = 0;
  writeFileSync(continuityLockPath(dir), JSON.stringify(foreign) + "\n");
  const staleForeign = run(continuityArgs("continuity-init", "absent", initFile), continuityDeps(dir));
  ok("PS41d even a stale foreign-token lock cannot be recovered", staleForeign === 2 && readFileSync(continuityLockPath(dir), "utf8") === JSON.stringify(foreign) + "\n");
}

// ---- PS42: stale recovery requires the same token and rotates the internal nonce ------------
{
  const dir = freshDir("continuity-stale-lock");
  seedContinuityRoot(dir);
  const initFile = writeRequest(dir, "init", continuityState());
  const stale = {
    schema: CONTINUITY_LOCK_SCHEMA_ID,
    token: "token-stale-001",
    ownerNonce: "nonce-stale-old",
    acquiredAtMs: 0,
  };
  writeFileSync(continuityLockPath(dir), JSON.stringify(stale) + "\n");
  writeFileSync(`${statePath(dir)}.tmp.${stale.ownerNonce}`, "interrupted partial state\n");
  const code = run(continuityArgs("continuity-init", "absent", initFile, stale.token), continuityDeps(dir));
  ok("PS42a same-token stale lock is recovered and transition succeeds", code === 0, `got ${code}`);
  ok("PS42b recovered owned lock is released", !existsSync(continuityLockPath(dir)));
  ok("PS42c exclusive recovery guard is released after complete takeover", !existsSync(`${continuityLockPath(dir)}.recover`));
  ok("PS42d only the stale owner's bound temp is cleaned", !existsSync(`${statePath(dir)}.tmp.${stale.ownerNonce}`));
  writeFileSync(`${continuityLockPath(dir)}.recover`, JSON.stringify(stale) + "\n");
  const guarded = acquireContinuityLock(dir, stale.token, continuityDeps(dir));
  ok("PS42e orphaned recovery guard fails closed instead of admitting another owner", guarded.ok === false && guarded.code === "PS-CONTINUITY-RECOVERY-IN-PROGRESS");
  ok("PS42f orphaned recovery guard remains for explicit disposition", existsSync(`${continuityLockPath(dir)}.recover`));
}

// ---- PS43: unsafe request paths and symlinks fail before lock acquisition -------------------
if (symlinkCapable) {
  const dir = freshDir("continuity-request-path");
  seedContinuityRoot(dir);
  const outside = writeRequest(dir, "real-request", continuityState());
  symlinkSync(join(dir, outside), join(dir, "linked-request.json"));
  const before = readFileSync(statePath(dir), "utf8");
  const traversal = run(continuityArgs("continuity-init", "absent", "../request.json"), continuityDeps(dir));
  const symlink = run(continuityArgs("continuity-init", "absent", "linked-request.json"), continuityDeps(dir));
  ok("PS43a traversing request path is refused", traversal === 2, `got ${traversal}`);
  ok("PS43b symlink request path is refused", symlink === 2, `got ${symlink}`);
  ok("PS43c unsafe request attempts perform zero mutation", readFileSync(statePath(dir), "utf8") === before);
  ok("PS43d unsafe request attempts never acquire a lock", !existsSync(continuityLockPath(dir)));
}

// ---- PS44: delivered final acknowledgement and next head persist in one atomic revision -----
{
  const dir = freshDir("continuity-final");
  seedContinuityRoot(dir);
  const initial = continuityState();
  const initFile = writeRequest(dir, "init", initial);
  run(continuityArgs("continuity-init", "absent", initFile), continuityDeps(dir));
  const resultJson = JSON.stringify({ verdict: "pass" });
  const envelope = {
    schema: "pipeline.continuity-final.v0",
    identity: continuityIdentity(),
    outcome: "succeeded",
    resultJson,
    resultBytes: Buffer.byteLength(resultJson, "utf8"),
  };
  const delivered = { ...envelope, resultDigest: computeContinuityFinalDigest(envelope) };
  const observation = { status: "completed", identity: continuityIdentity(), final: delivered };
  const next = structuredClone(initial);
  next.revision = 1;
  next.acknowledgedFinal = {
    identity: continuityIdentity(),
    resultDigest: delivered.resultDigest,
    finalOutcome: "succeeded",
    integratedRevision: 1,
  };
  next.queueHead = continuityQueue({ actionId: "writer-next", nextAction: "dispatch", dispatch: null });
  next.resume = { mode: "immediate", sourceRevision: 1, reasonCode: "active-turn" };
  const nextTransition = Object.fromEntries(
    ["queueHead", "blocker", "resume", "recovery", "decisionTxn", "capacity"].map((key) => [key, next[key]]),
  );
  const requestFile = writeRequest(dir, "final", {
    observation,
    nextTransition,
    result: { path: "specs/result.md", preResultSha256: C },
  });
  const code = run(continuityArgs("continuity-integrate-final", 0, requestFile), continuityDeps(dir));
  const persisted = readState(dir).state.continuity;
  ok("PS44a final integration writer exits 0", code === 0, `got ${code}`);
  ok("PS44b acknowledgement and next head share revision 1", persisted.revision === 1 && persisted.acknowledgedFinal?.integratedRevision === 1);
  ok("PS44c persisted acknowledgement binds canonical final digest", persisted.acknowledgedFinal?.resultDigest === delivered.resultDigest);
  ok("PS44d persisted next head is dispatchable and has no stale dispatch", persisted.queueHead?.actionId === "writer-next" && persisted.queueHead?.dispatch === null);
  const integratedResult = readFileSync(join(dir, "specs", "result.md"), "utf8");
  ok("PS44e Result contains exactly one canonical immutable final integration", (integratedResult.match(/\"integrationId\":\"fi-/g) ?? []).length === 1 && persisted.authority.result.sha256 === createHash("sha256").update(integratedResult).digest("hex"));
  const beforeReplay = readFileSync(statePath(dir), "utf8");
  const beforeResultReplay = readFileSync(join(dir, "specs", "result.md"), "utf8");
  const replay = run(continuityArgs("continuity-integrate-final", 0, requestFile), continuityDeps(dir));
  ok("PS44f matching final replay is accepted without either write", replay === 0 && readFileSync(statePath(dir), "utf8") === beforeReplay && readFileSync(join(dir, "specs", "result.md"), "utf8") === beforeResultReplay);
  const extraFile = writeRequest(dir, "final-extra", { observation, nextTransition, result: { path: "specs/result.md", preResultSha256: C }, rawHostError: "must-not-be-ignored" });
  const extra = run(continuityArgs("continuity-integrate-final", 0, extraFile), continuityDeps(dir));
  ok("PS44g non-closed final request envelope is refused byte-null", extra === 2 && readFileSync(statePath(dir), "utf8") === beforeReplay && readFileSync(join(dir, "specs", "result.md"), "utf8") === beforeResultReplay);
}

// ---- PS44R: Result-before-State crash window replays one entry to one commit -----------
{
  const dir = freshDir("continuity-final-result-first");
  const fixture = finalTransactionFixture(dir, "result-first");
  const failed = run(continuityArgs("continuity-integrate-final", 0, fixture.requestFile), continuityDeps(dir, {
    renameSync: () => { throw new Error("injected state rename failure"); },
  }));
  const preparedResult = readFileSync(join(dir, "specs", "result.md"), "utf8");
  ok("PS44Ra State fault reports failure after durable Result prepare", failed === 2 && readState(dir).state.continuity.revision === 0 && (preparedResult.match(/\"integrationId\":\"fi-/g) ?? []).length === 1);
  const replay = run(continuityArgs("continuity-integrate-final", 0, fixture.requestFile), continuityDeps(dir));
  const replayedResult = readFileSync(join(dir, "specs", "result.md"), "utf8");
  ok("PS44Rb exact Result-before-State replay commits State without duplicate append", replay === 0 && readState(dir).state.continuity.revision === 1 && replayedResult === preparedResult && (replayedResult.match(/\"integrationId\":\"fi-/g) ?? []).length === 1);
}

// ---- PS44S: reconstructive State-before-Result repair is hash-bound --------------------
{
  const dir = freshDir("continuity-final-state-first-repair");
  const fixture = finalTransactionFixture(dir, "state-first");
  const committed = run(continuityArgs("continuity-integrate-final", 0, fixture.requestFile), continuityDeps(dir));
  const committedState = readFileSync(statePath(dir), "utf8");
  const committedResult = readFileSync(join(dir, "specs", "result.md"), "utf8");
  writeFileSync(join(dir, "specs", "result.md"), RESULT_FIXTURE);
  const repair = run(continuityArgs("continuity-integrate-final", 0, fixture.requestFile), continuityDeps(dir));
  ok("PS44Sa committed transaction fixture is valid", committed === 0);
  ok("PS44Sb exact old Result is reconstructively repaired without State rewrite", repair === 0 && readFileSync(statePath(dir), "utf8") === committedState && readFileSync(join(dir, "specs", "result.md"), "utf8") === committedResult);
  writeFileSync(join(dir, "specs", "result.md"), RESULT_FIXTURE.replace("[]", "[ ]"));
  const beforeTamperState = readFileSync(statePath(dir), "utf8");
  const conflict = run(continuityArgs("continuity-integrate-final", 0, fixture.requestFile), continuityDeps(dir));
  ok("PS44Sc noncanonical/tampered old Result fails closed", conflict === 2 && readFileSync(statePath(dir), "utf8") === beforeTamperState);
}

// ---- PS44T: non-final transitions refuse State/Result authority drift ------------------
{
  const dir = freshDir("continuity-result-drift");
  seedContinuityRoot(dir);
  const initFile = writeRequest(dir, "drift-init", continuityState());
  run(continuityArgs("continuity-init", "absent", initFile), continuityDeps(dir));
  const next = structuredClone(readState(dir).state.continuity);
  next.revision = 1;
  next.queueHead.dispatch = null;
  next.queueHead.nextAction = "verify";
  next.resume = { mode: "immediate", sourceRevision: 1, reasonCode: "active-turn" };
  const casFile = writeRequest(dir, "drift-cas", next);
  writeFileSync(join(dir, "specs", "result.md"), RESULT_FIXTURE.replace("\"finalIntegrations\"", "\"tampered\""));
  const before = readFileSync(statePath(dir), "utf8");
  const drifted = run(continuityArgs("continuity-cas", 0, casFile), continuityDeps(dir));
  ok("PS44T Result digest drift blocks other continuity commands byte-null", drifted === 2 && readFileSync(statePath(dir), "utf8") === before);
}

// ---- PS44U: every Result/State fault has an exact observable disposition ---------------
{
  const resultRenameDir = freshDir("continuity-result-rename-fault");
  const resultRenameFixture = finalTransactionFixture(resultRenameDir, "result-rename-fault");
  const beforeResultRename = readFileSync(join(resultRenameDir, "specs", "result.md"), "utf8");
  const resultRenameObserved = captureConsoleError(() => run(
    continuityArgs("continuity-integrate-final", 0, resultRenameFixture.requestFile),
    continuityDeps(resultRenameDir, { renameResultSync: () => { throw new Error("injected Result rename fault"); } }),
  ));
  ok("PS44Ua Result pre-rename fault is explicitly zero-mutation", resultRenameObserved.value === 2
    && readFileSync(join(resultRenameDir, "specs", "result.md"), "utf8") === beforeResultRename
    && readState(resultRenameDir).state.continuity.revision === 0
    && resultRenameObserved.text.includes("PS-CONTINUITY-RESULT-WRITE-IO")
    && resultRenameObserved.text.includes("zero State and Result mutation"));

  const resultEffectDir = freshDir("continuity-result-rename-effect");
  const resultEffectFixture = finalTransactionFixture(resultEffectDir, "result-rename-effect");
  const resultEffectObserved = captureConsoleError(() => run(
    continuityArgs("continuity-integrate-final", 0, resultEffectFixture.requestFile),
    continuityDeps(resultEffectDir, {
      renameResultSync: (from, to) => { renameSync(from, to); throw new Error("rename took effect, then threw"); },
    }),
  ));
  ok("PS44Ub Result rename-effect-then-throw is explicitly committed/not-zero", resultEffectObserved.value === 2
    && readState(resultEffectDir).state.continuity.revision === 0
    && (readFileSync(join(resultEffectDir, "specs", "result.md"), "utf8").match(/\"integrationId\":\"fi-/g) ?? []).length === 1
    && resultEffectObserved.text.includes("PS-CONTINUITY-RESULT-DURABILITY-UNKNOWN")
    && resultEffectObserved.text.includes("mutation is NOT reported as zero"));

  const resultPreWriteDir = freshDir("continuity-result-pre-write-fault");
  const resultPreWriteFixture = finalTransactionFixture(resultPreWriteDir, "result-pre-write-fault");
  const beforeResultPreWrite = readFileSync(join(resultPreWriteDir, "specs", "result.md"), "utf8");
  const resultPreWriteObserved = captureConsoleError(() => run(
    continuityArgs("continuity-integrate-final", 0, resultPreWriteFixture.requestFile),
    continuityDeps(resultPreWriteDir, {
      replaceResultFdContents: () => { throw new Error("injected fault before temp write"); },
    }),
  ));
  ok("PS44U pre-write Result fault is distinctly zero-mutation", resultPreWriteObserved.value === 2
    && readFileSync(join(resultPreWriteDir, "specs", "result.md"), "utf8") === beforeResultPreWrite
    && resultPreWriteObserved.text.includes("PS-CONTINUITY-RESULT-WRITE-IO")
    && resultPreWriteObserved.text.includes("zero State and Result mutation"));

  const resultFsyncDir = freshDir("continuity-result-fsync-fault");
  const resultFsyncFixture = finalTransactionFixture(resultFsyncDir, "result-fsync-fault");
  const beforeResultFsync = readFileSync(join(resultFsyncDir, "specs", "result.md"), "utf8");
  let exactTempBytesWritten = false;
  const resultFsyncObserved = captureConsoleError(() => run(
    continuityArgs("continuity-integrate-final", 0, resultFsyncFixture.requestFile),
    continuityDeps(resultFsyncDir, {
      replaceResultFdContents: (fd, bytes) => {
        writeSync(fd, bytes);
        exactTempBytesWritten = true;
        throw new Error("injected Result sync fault after exact temp write");
      },
    }),
  ));
  ok("PS44Uc Result fd-sync fault after exact temp write remains explicitly pre-commit", resultFsyncObserved.value === 2
    && exactTempBytesWritten
    && readFileSync(join(resultFsyncDir, "specs", "result.md"), "utf8") === beforeResultFsync
    && !readdirSync(join(resultFsyncDir, "specs")).some((name) => name.includes(".tmp."))
    && resultFsyncObserved.text.includes("PS-CONTINUITY-RESULT-WRITE-IO")
    && resultFsyncObserved.text.includes("zero State and Result mutation"));

  const resultDirSyncDir = freshDir("continuity-result-dir-sync-fault");
  const resultDirSyncFixture = finalTransactionFixture(resultDirSyncDir, "result-dir-sync-fault");
  const resultDirSyncObserved = captureConsoleError(() => run(
    continuityArgs("continuity-integrate-final", 0, resultDirSyncFixture.requestFile),
    continuityDeps(resultDirSyncDir, { syncResultDirectory: () => ({ ok: false, supported: true }) }),
  ));
  ok("PS44Ud Result directory-sync fault is explicitly committed/durability-unknown", resultDirSyncObserved.value === 2
    && readState(resultDirSyncDir).state.continuity.revision === 0
    && (readFileSync(join(resultDirSyncDir, "specs", "result.md"), "utf8").match(/\"integrationId\":\"fi-/g) ?? []).length === 1
    && resultDirSyncObserved.text.includes("PS-CONTINUITY-RESULT-DURABILITY-UNKNOWN")
    && resultDirSyncObserved.text.includes("mutation is NOT reported as zero"));

  const stateEffectDir = freshDir("continuity-state-rename-effect");
  const stateEffectFixture = finalTransactionFixture(stateEffectDir, "state-rename-effect");
  const stateEffectObserved = captureConsoleError(() => run(
    continuityArgs("continuity-integrate-final", 0, stateEffectFixture.requestFile),
    continuityDeps(stateEffectDir, {
      renameSync: (from, to) => { renameSync(from, to); throw new Error("State rename took effect, then threw"); },
    }),
  ));
  ok("PS44Ue State rename-effect-then-throw is explicitly committed/durability-unknown", stateEffectObserved.value === 2
    && readState(stateEffectDir).state.continuity.revision === 1
    && stateEffectObserved.text.includes("PS-CONTINUITY-COMMITTED-DURABILITY-UNKNOWN")
    && stateEffectObserved.text.includes("mutation is NOT reported as zero"));
}

// ---- PS44V: the between-writes window rechecks ownership and exact Result bytes --------
{
  const lossDir = freshDir("continuity-lock-loss-between-writes");
  const lossFixture = finalTransactionFixture(lossDir, "lock-loss");
  const lockLossObserved = captureConsoleError(() => run(
    continuityArgs("continuity-integrate-final", 0, lossFixture.requestFile),
    continuityDeps(lossDir, {
      beforeStateWrite: () => writeFileSync(continuityLockPath(lossDir), JSON.stringify({
        schema: CONTINUITY_LOCK_SCHEMA_ID,
        token: "foreign-token-0001",
        ownerNonce: "foreign-nonce-0001",
        acquiredAtMs: FIXED_NOW_MS(),
      }) + "\n"),
    }),
  ));
  ok("PS44Va lock loss after durable Result explicitly blocks State without zero claim", lockLossObserved.value === 2
    && readState(lossDir).state.continuity.revision === 0
    && (readFileSync(join(lossDir, "specs", "result.md"), "utf8").match(/\"integrationId\":\"fi-/g) ?? []).length === 1
    && lockLossObserved.text.includes("PS-CONTINUITY-LOCK-OWNERSHIP")
    && lockLossObserved.text.includes("Result prepare or repair may be durable; mutation is NOT reported as zero"));

  const tamperDir = freshDir("continuity-tamper-between-writes");
  const tamperFixture = finalTransactionFixture(tamperDir, "tamper-between");
  const tamperedObserved = captureConsoleError(() => run(
    continuityArgs("continuity-integrate-final", 0, tamperFixture.requestFile),
    continuityDeps(tamperDir, {
      beforeStateWrite: () => writeFileSync(join(tamperDir, "specs", "result.md"), `${readFileSync(join(tamperDir, "specs", "result.md"), "utf8")}\n`),
    }),
  ));
  ok("PS44Vb exact Result tamper explicitly blocks State without zero claim", tamperedObserved.value === 2
    && readState(tamperDir).state.continuity.revision === 0
    && tamperedObserved.text.includes("PS-CONTINUITY-RESULT-CHANGED")
    && tamperedObserved.text.includes("Result prepare or repair may be durable; mutation is NOT reported as zero"));

  const contenderDir = freshDir("continuity-concurrent-contender");
  const contenderFixture = finalTransactionFixture(contenderDir, "contender");
  let contender;
  const serialized = run(continuityArgs("continuity-integrate-final", 0, contenderFixture.requestFile), continuityDeps(contenderDir, {
    beforeStateWrite: () => { contender = acquireContinuityLock(contenderDir, "contender-token-01", continuityDeps(contenderDir)); },
  }));
  ok("PS44Vc concurrent lock contender is refused while owner commits", serialized === 0
    && contender?.ok === false && contender?.code === "PS-CONTINUITY-LOCKED"
    && readState(contenderDir).state.continuity.revision === 1);
}

// ---- PS44W: Result codec rejects ambiguous bytes and symlink ancestors -----------------
{
  const mutations = [
    ["duplicate-key", (text) => text.replace('{\n  "finalIntegrations": []\n}', '{\n  "finalIntegrations": [],\n  "finalIntegrations": []\n}')],
    ["duplicate-fence", (text) => `${text}${text}`],
    ["crlf", (text) => text.replaceAll("\n", "\r\n")],
    ["bom", (text) => `\uFEFF${text}`],
  ];
  for (const [name, mutate] of mutations) {
    const dir = freshDir(`continuity-result-codec-${name}`);
    const fixture = finalTransactionFixture(dir, `codec-${name}`);
    writeFileSync(join(dir, "specs", "result.md"), mutate(RESULT_FIXTURE));
    const before = readFileSync(statePath(dir), "utf8");
    const refused = run(continuityArgs("continuity-integrate-final", 0, fixture.requestFile), continuityDeps(dir));
    ok(`PS44W ${name} Result bytes are refused byte-null`, refused === 2 && readFileSync(statePath(dir), "utf8") === before);
  }

  if (symlinkCapable) {
    const ancestorDir = freshDir("continuity-result-ancestor-symlink");
    const outsideDir = freshDir("continuity-result-ancestor-target");
    run(["set-feature", "--id", CONTINUITY_FEATURE, "--plan-path", "specs/prd.md"], { dir: ancestorDir, now: FIXED_NOW });
    writeFileSync(join(outsideDir, "result.md"), RESULT_FIXTURE);
    symlinkSync(outsideDir, join(ancestorDir, "specs"));
    const initFile = writeRequest(ancestorDir, "ancestor-init", continuityState());
    const before = readFileSync(statePath(ancestorDir), "utf8");
    const refused = run(continuityArgs("continuity-init", "absent", initFile), continuityDeps(ancestorDir));
    ok("PS44W ancestor symlink in Result path is refused before mutation", refused === 2
      && readFileSync(statePath(ancestorDir), "utf8") === before);
  }
}

// ---- PS44X: historical entries are recursively validated, not checksum-trusted ---------
{
  const rewriteHistoricalEntry = (dir, mutate) => {
    const path = join(dir, "specs", "result.md");
    const text = readFileSync(path, "utf8");
    const json = JSON.parse(/^```pipeline-result\n([\s\S]*?)\n```$/m.exec(text)[1]);
    const entry = json.finalIntegrations[0];
    mutate(entry);
    entry.nextTransitionSha256 = createHash("sha256").update(canonicalFixtureJson(entry.nextTransition)).digest("hex");
    const tuple = {
      identity: entry.identity,
      finalDigest: entry.finalDigest,
      finalOutcome: entry.finalOutcome,
      preResultSha256: entry.preResultSha256,
      nextTransitionSha256: entry.nextTransitionSha256,
    };
    entry.integrationId = `fi-${createHash("sha256").update(canonicalFixtureJson(tuple)).digest("hex")}`;
    writeFileSync(path, `\`\`\`pipeline-result\n{\n  "finalIntegrations": [\n    ${canonicalFixtureJson(entry)}\n  ]\n}\n\`\`\`\n`);
  };

  const identityDir = freshDir("continuity-history-identity-garbage");
  const identityFixture = finalTransactionFixture(identityDir, "history-identity");
  run(continuityArgs("continuity-integrate-final", 0, identityFixture.requestFile), continuityDeps(identityDir));
  rewriteHistoricalEntry(identityDir, (entry) => { entry.identity.mayDelegate = true; });
  const identityStateBefore = readFileSync(statePath(identityDir), "utf8");
  const identityReplay = run(continuityArgs("continuity-integrate-final", 0, identityFixture.requestFile), continuityDeps(identityDir));
  ok("PS44Xa self-consistent historical identity garbage is refused", identityReplay === 2
    && readFileSync(statePath(identityDir), "utf8") === identityStateBefore);

  const shapeDir = freshDir("continuity-history-shape-garbage");
  const shapeFixture = finalTransactionFixture(shapeDir, "history-shape");
  run(continuityArgs("continuity-integrate-final", 0, shapeFixture.requestFile), continuityDeps(shapeDir));
  rewriteHistoricalEntry(shapeDir, (entry) => { entry.nextTransition.capacity.reservedCriticSlots = 0; });
  const shapeStateBefore = readFileSync(statePath(shapeDir), "utf8");
  const shapeReplay = run(continuityArgs("continuity-integrate-final", 0, shapeFixture.requestFile), continuityDeps(shapeDir));
  ok("PS44Xb self-consistent malformed historical transition is refused", shapeReplay === 2
    && readFileSync(statePath(shapeDir), "utf8") === shapeStateBefore);

  const literalDigestDir = freshDir("continuity-history-literal-post-digest");
  const literalDigestFixture = finalTransactionFixture(literalDigestDir, "history-literal-digest");
  run(continuityArgs("continuity-integrate-final", 0, literalDigestFixture.requestFile), continuityDeps(literalDigestDir));
  rewriteHistoricalEntry(literalDigestDir, (entry) => {
    entry.nextTransition.queueHead = continuityQueue({
      actionId: "literal-next",
      nextAction: "poll",
      dispatch: continuityIdentity({
        queueRevision: 1,
        actionId: "literal-next",
        dispatchId: "dispatch-literal-01",
        attemptId: "attempt-literal-01",
        authorityDigests: { prdSha256: A, specSha256: B, resultSha256: "0".repeat(64) },
      }),
    });
  });
  const literalStateBefore = readFileSync(statePath(literalDigestDir), "utf8");
  const literalReplay = run(continuityArgs("continuity-integrate-final", 0, literalDigestFixture.requestFile), continuityDeps(literalDigestDir));
  ok("PS44Xc self-consistent literal post-Result digest is refused without sentinel", literalReplay === 2
    && readFileSync(statePath(literalDigestDir), "utf8") === literalStateBefore);

  const failedQueueDir = freshDir("continuity-history-failed-with-queue");
  const failedQueueFixture = finalTransactionFixture(failedQueueDir, "history-failed-queue");
  run(continuityArgs("continuity-integrate-final", 0, failedQueueFixture.requestFile), continuityDeps(failedQueueDir));
  rewriteHistoricalEntry(failedQueueDir, (entry) => { entry.finalOutcome = "failed"; });
  const failedQueueStateBefore = readFileSync(statePath(failedQueueDir), "utf8");
  const failedQueueReplay = run(continuityArgs("continuity-integrate-final", 0, failedQueueFixture.requestFile), continuityDeps(failedQueueDir));
  ok("PS44Xd self-consistent failed final with queue instead of blocker is refused", failedQueueReplay === 2
    && readFileSync(statePath(failedQueueDir), "utf8") === failedQueueStateBefore);
}

// ---- PS44Y: multi-entry Result-before-State replay removes only the exact tail ----------
{
  const dir = freshDir("continuity-multi-entry-replay");
  seedContinuityRoot(dir);
  const initial = continuityState();
  run(continuityArgs("continuity-init", "absent", writeRequest(dir, "multi-init", initial)), continuityDeps(dir));

  const firstResultJson = JSON.stringify({ verdict: "first" });
  const firstEnvelope = {
    schema: "pipeline.continuity-final.v0", identity: continuityIdentity(), outcome: "succeeded",
    resultJson: firstResultJson, resultBytes: Buffer.byteLength(firstResultJson),
  };
  const firstFinal = { ...firstEnvelope, resultDigest: computeContinuityFinalDigest(firstEnvelope) };
  const secondDispatch = continuityIdentity({
    queueRevision: 1,
    actionId: "second-action",
    dispatchId: "dispatch-p1-02",
    attemptId: "attempt-02",
    authorityDigests: { prdSha256: A, specSha256: B, resultSha256: "$POST_RESULT_SHA256" },
  });
  const firstNext = {
    queueHead: continuityQueue({ actionId: "second-action", nextAction: "poll", dispatch: secondDispatch }),
    blocker: null,
    resume: { mode: "immediate", sourceRevision: 1, reasonCode: "active-turn" },
    recovery: null,
    decisionTxn: null,
    capacity: initial.capacity,
  };
  const firstRequest = writeRequest(dir, "multi-first", {
    observation: { status: "completed", identity: continuityIdentity(), final: firstFinal },
    nextTransition: firstNext,
    result: { path: "specs/result.md", preResultSha256: C },
  });
  const first = run(continuityArgs("continuity-integrate-final", 0, firstRequest), continuityDeps(dir));
  const afterFirst = readState(dir).state.continuity;
  const exactSecondIdentity = afterFirst.queueHead.dispatch;
  const secondResultJson = JSON.stringify({ verdict: "second" });
  const secondEnvelope = {
    schema: "pipeline.continuity-final.v0", identity: exactSecondIdentity, outcome: "succeeded",
    resultJson: secondResultJson, resultBytes: Buffer.byteLength(secondResultJson),
  };
  const secondFinal = { ...secondEnvelope, resultDigest: computeContinuityFinalDigest(secondEnvelope) };
  const secondNext = {
    queueHead: continuityQueue({ actionId: "third-action", nextAction: "review", dispatch: null }),
    blocker: null,
    resume: { mode: "immediate", sourceRevision: 2, reasonCode: "active-turn" },
    recovery: null,
    decisionTxn: null,
    capacity: initial.capacity,
  };
  const secondRequest = writeRequest(dir, "multi-second", {
    observation: { status: "completed", identity: exactSecondIdentity, final: secondFinal },
    nextTransition: secondNext,
    result: { path: "specs/result.md", preResultSha256: afterFirst.authority.result.sha256 },
  });
  const interrupted = run(continuityArgs("continuity-integrate-final", 1, secondRequest), continuityDeps(dir, {
    renameSync: () => { throw new Error("second State rename interrupted"); },
  }));
  const preparedTwo = readFileSync(join(dir, "specs", "result.md"), "utf8");
  const replay = run(continuityArgs("continuity-integrate-final", 1, secondRequest), continuityDeps(dir));
  ok("PS44Ya first historical integration commits", first === 0);
  ok("PS44Yb second Result tail survives interrupted State write exactly once", interrupted === 2
    && (preparedTwo.match(/\"integrationId\":\"fi-/g) ?? []).length === 2);
  ok("PS44Yc multi-entry prior replay commits without splice/duplication", replay === 0
    && readState(dir).state.continuity.revision === 2
    && readFileSync(join(dir, "specs", "result.md"), "utf8") === preparedTwo);
}

// ---- PS44Z: duplicate replay comparison is canonical key-order independent --------------
{
  const dir = freshDir("continuity-replay-key-order");
  const fixture = finalTransactionFixture(dir, "key-order");
  run(continuityArgs("continuity-integrate-final", 0, fixture.requestFile), continuityDeps(dir));
  const reordered = structuredClone(fixture.request);
  reordered.observation.identity = Object.fromEntries(Object.entries(reordered.observation.identity).reverse());
  const finalWithoutDigest = { ...reordered.observation.final, identity: reordered.observation.identity };
  delete finalWithoutDigest.resultDigest;
  reordered.observation.final = { ...finalWithoutDigest, resultDigest: computeContinuityFinalDigest(finalWithoutDigest) };
  const replayFile = writeRequest(dir, "key-order-replay", reordered);
  const beforeState = readFileSync(statePath(dir), "utf8");
  const beforeResult = readFileSync(join(dir, "specs", "result.md"), "utf8");
  const replay = run(continuityArgs("continuity-integrate-final", 0, replayFile), continuityDeps(dir));
  ok("PS44Z canonical duplicate replay ignores object insertion order", replay === 0
    && readFileSync(statePath(dir), "utf8") === beforeState
    && readFileSync(join(dir, "specs", "result.md"), "utf8") === beforeResult);
}

// ---- PS45: decision state-applied marker blocks until its bound receipt clears it -----------
{
  const dir = freshDir("continuity-decision");
  seedContinuityRoot(dir);
  const blocker = {
    type: "course",
    signature: "repeat-product-v1",
    resumeCondition: { kind: "po-decision", evidenceSha256: A },
    decisionBrief: { decisionBriefId: "brief-01", decisionBriefSha256: B, resultPath: "specs/result.md" },
  };
  const initial = continuityState({ queueHead: null, blocker });
  const initFile = writeRequest(dir, "init", initial);
  run(continuityArgs("continuity-init", "absent", initFile), continuityDeps(dir));
  const txn = {
    idempotencyKey: "case-01",
    briefSha256: B,
    intentSha256: C,
    selectedOptionId: "continue-narrow",
    preSelectionRevision: 0,
    selectedRevision: 1,
    dispatchableRevision: 2,
    phase: "state-applied",
  };
  const applyFile = writeRequest(dir, "decision-apply", {
    decisionTxn: txn,
    queueHead: continuityQueue({ nextAction: "dispatch", dispatch: null }),
    blocker: null,
    resume: { mode: "resume-on-next-turn", sourceRevision: 1, reasonCode: "blocker" },
  });
  const applied = run(continuityArgs("continuity-apply-decision", 0, applyFile), continuityDeps(dir));
  ok("PS45a decision state-applied marker persists at selected revision", applied === 0 && readState(dir).state.continuity?.decisionTxn?.phase === "state-applied");
  const clearFile = writeRequest(dir, "decision-clear", {
    receipt: {
      idempotencyKey: txn.idempotencyKey,
      briefSha256: txn.briefSha256,
      intentSha256: txn.intentSha256,
      selectedOptionId: txn.selectedOptionId,
      receiptSha256: D,
      selectedRevision: 1,
      dispatchableRevision: 2,
    },
  });
  const cleared = run(continuityArgs("continuity-clear-decision", 1, clearFile), continuityDeps(dir));
  const final = readState(dir).state.continuity;
  ok("PS45b bound receipt clears decision marker at pre-bound revision", cleared === 0 && final.revision === 2 && final.decisionTxn === null);
}

// ---- PS45C: Result-first course brief is canonical, bound and exactly recoverable ----------
{
  const dir = freshDir("continuity-course-brief");
  const resultSha = seedCourseContinuityRoot(dir);
  const initial = continuityState({
    authority: { prd: { path: "specs/prd.md", sha256: A }, spec: { path: "specs/spec.md", sha256: B }, result: { path: "specs/result.md", sha256: resultSha } },
    queueHead: continuityQueue({ dispatch: null }),
  });
  const initFile = writeRequest(dir, "course-init", initial);
  run(continuityArgs("continuity-init", "absent", initFile), continuityDeps(dir));
  const built = courseBrief();
  const blocker = {
    type: "course", signature: D,
    resumeCondition: { kind: "po-decision", evidenceSha256: D },
    decisionBrief: { decisionBriefId: built.brief.briefId, decisionBriefSha256: built.sha256, resultPath: "specs/result.md" },
  };
  const request = {
    brief: built.brief,
    blocker,
    resume: { mode: "resume-on-next-turn", sourceRevision: 1, reasonCode: "blocker" },
    result: { path: "specs/result.md", preResultSha256: resultSha },
  };
  const requestFile = writeRequest(dir, "course-brief", request);
  const courseDeps = continuityDeps(dir, { gitBinding: () => ({ ok: true, commit: "a".repeat(40), tree: "b".repeat(40) }) });
  const first = run(continuityArgs("continuity-record-course-brief", 0, requestFile), courseDeps);
  const firstState = readState(dir).state.continuity;
  const firstResult = readFileSync(join(dir, "specs", "result.md"), "utf8");
  const replay = run(continuityArgs("continuity-record-course-brief", 0, requestFile), courseDeps);
  ok("PS45Ca Result-first course brief advances State with its exact Result pointer", first === 0
    && firstState.revision === 1 && firstState.queueHead === null
    && firstState.blocker?.decisionBrief?.decisionBriefSha256 === built.sha256
    && firstState.authority.result.sha256 === createHash("sha256").update(firstResult).digest("hex"));
  ok("PS45Cb course brief replay is exact and performs zero mutation", replay === 0
    && readFileSync(join(dir, "specs", "result.md"), "utf8") === firstResult
    && readState(dir).state.continuity.revision === 1);
}

{
  const dir = freshDir("continuity-course-brief-recovery");
  const resultSha = seedCourseContinuityRoot(dir);
  const initial = continuityState({
    authority: { prd: { path: "specs/prd.md", sha256: A }, spec: { path: "specs/spec.md", sha256: B }, result: { path: "specs/result.md", sha256: resultSha } },
    queueHead: continuityQueue({ dispatch: null }),
  });
  run(continuityArgs("continuity-init", "absent", writeRequest(dir, "recovery-init", initial)), continuityDeps(dir));
  const built = courseBrief();
  const requestFile = writeRequest(dir, "recovery-course-brief", {
    brief: built.brief,
    blocker: { type: "course", signature: D, resumeCondition: { kind: "po-decision", evidenceSha256: D }, decisionBrief: { decisionBriefId: built.brief.briefId, decisionBriefSha256: built.sha256, resultPath: "specs/result.md" } },
    resume: { mode: "resume-on-next-turn", sourceRevision: 1, reasonCode: "blocker" },
    result: { path: "specs/result.md", preResultSha256: resultSha },
  });
  const shared = { gitBinding: () => ({ ok: true, commit: "a".repeat(40), tree: "b".repeat(40) }) };
  const interrupted = run(continuityArgs("continuity-record-course-brief", 0, requestFile), continuityDeps(dir, {
    ...shared,
    renameSync: () => { throw new Error("State rename interrupted"); },
  }));
  const prepared = readFileSync(join(dir, "specs", "result.md"), "utf8");
  const replay = run(continuityArgs("continuity-record-course-brief", 0, requestFile), continuityDeps(dir, shared));
  ok("PS45Cc interrupted State write reports durable Result preparation", interrupted === 2
    && JSON.parse(prepared.match(/```pipeline-result\n([\s\S]*?)\n```/)[1]).decisionBriefs.length === 1);
  ok("PS45Cd exact Result-before-State course replay commits without duplicate", replay === 0
    && readFileSync(join(dir, "specs", "result.md"), "utf8") === prepared
    && readState(dir).state.continuity.revision === 1);
}

// ---- PS45D: one literal selection writes intent, marker, receipt and clear ---------------
{
  const dir = freshDir("continuity-course-selection");
  const resultSha = seedCourseContinuityRoot(dir);
  const initial = continuityState({
    authority: { prd: { path: "specs/prd.md", sha256: A }, spec: { path: "specs/spec.md", sha256: B }, result: { path: "specs/result.md", sha256: resultSha } },
    queueHead: continuityQueue({ dispatch: null }),
  });
  run(continuityArgs("continuity-init", "absent", writeRequest(dir, "select-init", initial)), continuityDeps(dir));
  const selectedTransition = {
    queueHead: continuityQueue({ actionId: "selected-action", nextAction: "dispatch", dispatch: null }),
    blocker: null,
    resume: { mode: "resume-on-next-turn", sourceRevision: 2, reasonCode: "blocker" },
  };
  const built = courseBrief(1, sha256Canonical(selectedTransition));
  const briefRequest = {
    brief: built.brief,
    blocker: { type: "course", signature: D, resumeCondition: { kind: "po-decision", evidenceSha256: D }, decisionBrief: { decisionBriefId: built.brief.briefId, decisionBriefSha256: built.sha256, resultPath: "specs/result.md" } },
    resume: { mode: "resume-on-next-turn", sourceRevision: 1, reasonCode: "blocker" },
    result: { path: "specs/result.md", preResultSha256: resultSha },
  };
  const binding = { gitBinding: () => ({ ok: true, commit: "a".repeat(40), tree: "b".repeat(40) }) };
  run(continuityArgs("continuity-record-course-brief", 0, writeRequest(dir, "select-brief", briefRequest)), continuityDeps(dir, binding));
  const blocked = readState(dir).state.continuity;
  const intent = {
    schema: "pipeline.course-decision-intent.v1",
    idempotencyKey: "case-01",
    briefId: built.brief.briefId,
    briefSha256: built.sha256,
    blockerSignature: D,
    optionId: "option-0",
    poEvidenceSha256: C,
    preStateSha256: createHash("sha256").update(readFileSync(statePath(dir))).digest("hex"),
    selectedTransitionSha256: sha256Canonical(selectedTransition),
    expectedRevision: 1,
    selectedRevision: 2,
    dispatchableRevision: 3,
  };
  const requestFile = writeRequest(dir, "select-course", {
    intent,
    selectedTransition,
    result: { path: "specs/result.md", preResultSha256: blocked.authority.result.sha256 },
  });
  const first = run(continuityArgs("continuity-select-course", 1, requestFile), continuityDeps(dir, binding));
  const final = readState(dir).state.continuity;
  const result = JSON.parse(readFileSync(join(dir, "specs", "result.md"), "utf8").match(/```pipeline-result\n([\s\S]*?)\n```/)[1]);
  const replay = run(continuityArgs("continuity-select-course", 1, requestFile), continuityDeps(dir, binding));
  ok("PS45Da selection commits intent receipt and dispatchable state in bound revisions", first === 0
    && final.revision === 3 && final.decisionTxn === null
    && final.authority.result.sha256 === createHash("sha256").update(readFileSync(join(dir, "specs", "result.md"))).digest("hex")
    && result.courseDecisionIntents.length === 1 && result.courseDecisionReceipts.length === 1
    && result.courseDecisionReceipts[0].intentSha256 === sha256Canonical(intent));
  ok("PS45Db selection replay admits only the same idempotency key with zero mutation", replay === 0
    && readState(dir).state.continuity.revision === 3);
}

{
  const dir = freshDir("continuity-course-selection-clear-recovery");
  const resultSha = seedCourseContinuityRoot(dir);
  const initial = continuityState({
    authority: { prd: { path: "specs/prd.md", sha256: A }, spec: { path: "specs/spec.md", sha256: B }, result: { path: "specs/result.md", sha256: resultSha } },
    queueHead: continuityQueue({ dispatch: null }),
  });
  run(continuityArgs("continuity-init", "absent", writeRequest(dir, "clear-init", initial)), continuityDeps(dir));
  const selectedTransition = { queueHead: continuityQueue({ actionId: "selected-recovery", nextAction: "dispatch", dispatch: null }), blocker: null, resume: { mode: "resume-on-next-turn", sourceRevision: 2, reasonCode: "blocker" } };
  const built = courseBrief(1, sha256Canonical(selectedTransition));
  const binding = { gitBinding: () => ({ ok: true, commit: "a".repeat(40), tree: "b".repeat(40) }) };
  run(continuityArgs("continuity-record-course-brief", 0, writeRequest(dir, "clear-brief", {
    brief: built.brief,
    blocker: { type: "course", signature: D, resumeCondition: { kind: "po-decision", evidenceSha256: D }, decisionBrief: { decisionBriefId: built.brief.briefId, decisionBriefSha256: built.sha256, resultPath: "specs/result.md" } },
    resume: { mode: "resume-on-next-turn", sourceRevision: 1, reasonCode: "blocker" }, result: { path: "specs/result.md", preResultSha256: resultSha },
  })), continuityDeps(dir, binding));
  const blocked = readState(dir).state.continuity;
  const intent = {
    schema: "pipeline.course-decision-intent.v1", idempotencyKey: "case-02", briefId: built.brief.briefId,
    briefSha256: built.sha256, blockerSignature: D, optionId: "option-0", poEvidenceSha256: C,
    preStateSha256: createHash("sha256").update(readFileSync(statePath(dir))).digest("hex"), selectedTransitionSha256: sha256Canonical(selectedTransition),
    expectedRevision: 1, selectedRevision: 2, dispatchableRevision: 3,
  };
  const requestFile = writeRequest(dir, "clear-course", { intent, selectedTransition, result: { path: "specs/result.md", preResultSha256: blocked.authority.result.sha256 } });
  let stateRenames = 0;
  const interrupted = run(continuityArgs("continuity-select-course", 1, requestFile), continuityDeps(dir, {
    ...binding,
    renameSync: (...args) => { stateRenames += 1; if (stateRenames === 2) throw new Error("clear interrupted"); return renameSync(...args); },
  }));
  const selected = readState(dir).state.continuity;
  const replay = run(continuityArgs("continuity-select-course", 1, requestFile), continuityDeps(dir, binding));
  ok("PS45Dc receipt-before-clear interruption leaves a dispatch-blocking marker", interrupted === 2
    && selected.revision === 2 && selected.decisionTxn?.idempotencyKey === intent.idempotencyKey);
  ok("PS45Dd receipt-backed replay clears without a second intent or receipt", replay === 0
    && readState(dir).state.continuity.revision === 3 && readState(dir).state.continuity.decisionTxn === null);
}

{
  const dir = freshDir("continuity-course-stop");
  const resultSha = seedCourseContinuityRoot(dir);
  const initial = continuityState({
    authority: { prd: { path: "specs/prd.md", sha256: A }, spec: { path: "specs/spec.md", sha256: B }, result: { path: "specs/result.md", sha256: resultSha } },
    queueHead: continuityQueue({ dispatch: null }),
  });
  run(continuityArgs("continuity-init", "absent", writeRequest(dir, "stop-init", initial)), continuityDeps(dir));
  const built = courseBrief();
  const binding = { gitBinding: () => ({ ok: true, commit: "a".repeat(40), tree: "b".repeat(40) }) };
  run(continuityArgs("continuity-record-course-brief", 0, writeRequest(dir, "stop-brief", {
    brief: built.brief,
    blocker: { type: "course", signature: D, resumeCondition: { kind: "po-decision", evidenceSha256: D }, decisionBrief: { decisionBriefId: built.brief.briefId, decisionBriefSha256: built.sha256, resultPath: "specs/result.md" } },
    resume: { mode: "resume-on-next-turn", sourceRevision: 1, reasonCode: "blocker" }, result: { path: "specs/result.md", preResultSha256: resultSha },
  })), continuityDeps(dir, binding));
  const blocked = readState(dir).state.continuity;
  const intent = {
    schema: "pipeline.course-decision-intent.v1", idempotencyKey: "decision-key-stop", briefId: built.brief.briefId,
    briefSha256: built.sha256, blockerSignature: D, optionId: "option-5", poEvidenceSha256: C,
    preStateSha256: createHash("sha256").update(readFileSync(statePath(dir))).digest("hex"), selectedTransitionSha256: A,
    expectedRevision: 1, selectedRevision: 2, dispatchableRevision: 3,
  };
  const digest = courseDispositionDigest("stop", intent, null);
  const selectedTransition = {
    queueHead: null,
    blocker: {
      type: "course", signature: `stop-${digest.slice(0, 32)}`,
      resumeCondition: { kind: "authority-update", evidenceSha256: digest },
      decisionBrief: { decisionBriefId: built.brief.briefId, decisionBriefSha256: built.sha256, resultPath: "specs/result.md" },
    },
    resume: { mode: "resume-on-next-turn", sourceRevision: 2, reasonCode: "blocker" },
  };
  intent.selectedTransitionSha256 = sha256Canonical(selectedTransition);
  const result = run(continuityArgs("continuity-select-course", 1, writeRequest(dir, "stop-select", {
    intent, selectedTransition, result: { path: "specs/result.md", preResultSha256: blocked.authority.result.sha256 },
  })), continuityDeps(dir, binding));
  const final = readState(dir).state.continuity;
  ok("PS45De stop selection has no SHA fixed point and remains terminally blocked", result === 0
    && final.revision === 3 && final.queueHead === null && final.decisionTxn === null
    && /^stop-[a-f0-9]{32}$/.test(final.blocker?.signature ?? "")
    && final.blocker?.resumeCondition.kind === "authority-update");
}

// ---- PS46: exchanged ownership nonce cannot release another writer's lock ------------------
{
  const dir = freshDir("continuity-lock-exchange");
  mkdirSync(join(dir, ".claude"), { recursive: true });
  const lock = acquireContinuityLock(dir, "token-owner-001", continuityDeps(dir));
  const exchanged = {
    schema: CONTINUITY_LOCK_SCHEMA_ID,
    token: lock.token,
    ownerNonce: "nonce-foreign-new",
    acquiredAtMs: FIXED_NOW_MS(),
  };
  writeFileSync(continuityLockPath(dir), JSON.stringify(exchanged) + "\n");
  const released = releaseContinuityLock(lock);
  ok("PS46a old owner cannot release exchanged nonce", released.ok === false && released.code === "PS-CONTINUITY-LOCK-OWNERSHIP");
  ok("PS46b exchanged lock remains present and byte-identical", readFileSync(continuityLockPath(dir), "utf8") === JSON.stringify(exchanged) + "\n");
}

// ---- PS47: legacy state transitions share the same lock and preserve continuity -------------
{
  const dir = freshDir("continuity-legacy-serialization");
  seedContinuityRoot(dir);
  const initFile = writeRequest(dir, "init", continuityState());
  run(continuityArgs("continuity-init", "absent", initFile), continuityDeps(dir));
  const before = readFileSync(statePath(dir), "utf8");
  const continuityBefore = structuredClone(readState(dir).state.continuity);
  const foreign = acquireContinuityLock(dir, "continuity-owner-01", continuityDeps(dir));
  const blocked = run([
    "approve-deploy", "--env", "test", "--artifact", "candidate", "--by", "po-test",
  ], { dir, now: FIXED_NOW });
  ok("PS47a legacy writer is blocked by the shared continuity lock", blocked === 2, `got ${blocked}`);
  ok("PS47b blocked legacy writer performs zero byte mutation", readFileSync(statePath(dir), "utf8") === before);
  releaseContinuityLock(foreign);
  const allowed = run([
    "approve-deploy", "--env", "test", "--artifact", "candidate", "--by", "po-test",
  ], { dir, now: FIXED_NOW });
  ok("PS47c serialized legacy writer succeeds after lock release", allowed === 0, `got ${allowed}`);
  ok("PS47d non-lifecycle legacy transition preserves continuity exactly", JSON.stringify(readState(dir).state.continuity) === JSON.stringify(continuityBefore));
}

// ---- PS48: feature lifecycle cannot retain continuity for the wrong active feature ----------
{
  const dir = freshDir("continuity-lifecycle-clear");
  seedContinuityRoot(dir);
  mkdirSync(join(dir, "specs"), { recursive: true });
  mkdirSync(join(dir, "evidence"), { recursive: true });
  const resultText = RESULT_FIXTURE;
  const closeEvidenceText = "bound close evidence\n";
  writeFileSync(join(dir, "specs", "result.md"), resultText);
  writeFileSync(join(dir, "evidence", "close.json"), closeEvidenceText);
  const resultSha256 = createHash("sha256").update(resultText).digest("hex");
  const closeEvidenceSha256 = createHash("sha256").update(closeEvidenceText).digest("hex");
  const closeReady = continuityState();
  closeReady.authority.result.sha256 = resultSha256;
  closeReady.queueHead = continuityQueue({ nextAction: "close", dispatch: null });
  const initFile = writeRequest(dir, "init", closeReady);
  run(continuityArgs("continuity-init", "absent", initFile), continuityDeps(dir));
  const beforeReset = readFileSync(statePath(dir), "utf8");
  const reset = run(["set-feature", "--id", "next-feature", "--plan-path", "specs/next.md"], { dir, now: FIXED_NOW });
  ok("PS48a set-feature cannot discard an open continuity feature", reset === 2, `got ${reset}`);
  ok("PS48b refused replacement leaves state byte-identical", readFileSync(statePath(dir), "utf8") === beforeReset);
  const closeRequest = {
    schema: "pipeline.continuity-close.v0",
    featureId: CONTINUITY_FEATURE,
    expectedRevision: 0,
    result: { path: "specs/result.md", sha256: resultSha256 },
    closeEvidence: { path: "evidence/close.json", sha256: closeEvidenceSha256 },
  };
  const closeRequestFile = writeRequest(dir, "close-request", closeRequest);
  const missingGate = run(["close-feature", "--by", "po-test"], { dir, now: FIXED_NOW, gitHead: FIXED_GIT_HEAD });
  ok("PS48c close-feature without revision/evidence request is refused", missingGate === 2, `got ${missingGate}`);
  const closed = run(["close-feature", "--by", "po-test", "--continuity-close-request", closeRequestFile], { dir, now: FIXED_NOW, gitHead: FIXED_GIT_HEAD });
  const final = readState(dir).state;
  ok("PS48d revision/evidence-bound close-feature succeeds", closed === 0, `got ${closed}`);
  ok("PS48e closing active feature removes continuity with activeFeature", final.activeFeature === undefined && final.continuity === undefined);
  ok("PS48f closed audit entry persists the exact close request", JSON.stringify(final.closedFeatures?.at(-1)?.continuityClose) === JSON.stringify(closeRequest));
}

// ---- PS48G: bound cleanup must close before continuity can be removed -------------------------
{
  const prepareBoundClose = (name) => {
    const dir = freshDir(name);
    seedContinuityRoot(dir);
    mkdirSync(join(dir, "specs"), { recursive: true });
    mkdirSync(join(dir, "evidence"), { recursive: true });
    writeFileSync(join(dir, "specs", "result.md"), RESULT_FIXTURE);
    writeFileSync(join(dir, "evidence", "close.json"), "bound cleanup close evidence\n");
    const resultSha256 = createHash("sha256").update(RESULT_FIXTURE).digest("hex");
    const closeEvidenceSha256 = createHash("sha256").update("bound cleanup close evidence\n").digest("hex");
    const closeReady = continuityState();
    closeReady.authority.result.sha256 = resultSha256;
    closeReady.queueHead = continuityQueue({ nextAction: "close", dispatch: null });
    closeReady.runtime.sessionCleanup = {
      sessionId: "session-bound-close",
      descriptorSha256: "e".repeat(64),
    };
    run(continuityArgs("continuity-init", "absent", writeRequest(dir, "bound-close-init", closeReady)), continuityDeps(dir));
    const closeRequest = {
      schema: "pipeline.continuity-close.v0",
      featureId: CONTINUITY_FEATURE,
      expectedRevision: 0,
      result: { path: "specs/result.md", sha256: resultSha256 },
      closeEvidence: { path: "evidence/close.json", sha256: closeEvidenceSha256 },
    };
    return { dir, closeRequestFile: writeRequest(dir, "bound-close-request", closeRequest) };
  };

  const active = prepareBoundClose("continuity-bound-cleanup-active");
  const activeBefore = readFileSync(statePath(active.dir), "utf8");
  const refused = run([
    "close-feature", "--by", "po-test", "--continuity-close-request", active.closeRequestFile,
  ], {
    dir: active.dir,
    now: FIXED_NOW,
    gitHead: FIXED_GIT_HEAD,
    inspectSessionClosureFn: () => ({ status: "active", closedAt: null }),
  });
  ok("PS48g close-feature refuses to discard an active cleanup binding", refused === 2);
  ok("PS48h refused bound close is byte-identical", readFileSync(statePath(active.dir), "utf8") === activeBefore);

  const closed = prepareBoundClose("continuity-bound-cleanup-closed");
  const closedBefore = readFileSync(statePath(closed.dir), "utf8");
  const accepted = run([
    "close-feature", "--by", "po-test", "--continuity-close-request", closed.closeRequestFile,
  ], {
    dir: closed.dir,
    now: FIXED_NOW,
    gitHead: FIXED_GIT_HEAD,
    inspectSessionClosureFn: (root, sessionId, options) => {
      ok("PS48i close binds the exact descriptor identity", root === closed.dir
        && sessionId === "session-bound-close"
        && options.expectedDescriptorSha256 === "e".repeat(64));
      return { status: "closed", closedAt: FIXED_NOW(), receiptSha256: "f".repeat(64) };
    },
  });
  ok("PS48j neutral close rejects even an already-closed portable cleanup binding", accepted === 2);
  ok("PS48k rejected hostile neutral close remains byte-identical", readFileSync(statePath(closed.dir), "utf8") === closedBefore);
}

// ---- PS49: post-rename durability failure is never mislabeled as zero mutation ---------------
{
  const dir = freshDir("continuity-post-rename");
  seedContinuityRoot(dir);
  const lock = acquireContinuityLock(dir, "token-write-fault-01", continuityDeps(dir));
  const next = structuredClone(readState(dir).state);
  next.activeFeature.phase = "verify";
  const postRename = atomicWriteContinuityState(dir, next, lock, {
    syncDirectory: () => ({ ok: false, supported: true }),
  });
  ok("PS49a directory-sync failure reports committed durability-unknown", postRename.ok === false && postRename.committed === true && postRename.code === "PS-CONTINUITY-COMMITTED-DURABILITY-UNKNOWN");
  ok("PS49b exact renamed target is observable despite red durability result", JSON.stringify(readState(dir).state) === JSON.stringify(next));
  releaseContinuityLock(lock);

  const second = acquireContinuityLock(dir, "token-write-fault-02", continuityDeps(dir));
  const before = readFileSync(statePath(dir), "utf8");
  const proposed = structuredClone(readState(dir).state);
  proposed.activeFeature.phase = "close";
  const preRename = atomicWriteContinuityState(dir, proposed, second, {
    renameSync: () => { throw Object.assign(new Error("injected rename fault"), { code: "EIO" }); },
  });
  ok("PS49c pre-rename failure reports committed=false", preRename.ok === false && preRename.committed === false);
  ok("PS49d pre-rename failure preserves target byte-identically", readFileSync(statePath(dir), "utf8") === before);
  ok("PS49e pre-rename failure cleans its owned temp", !readdirSync(dirname(statePath(dir))).some((name) => name.includes(`.tmp.${second.ownerNonce}`)));
  releaseContinuityLock(second);
}

// ---- PS50: lock publication is atomic despite an unrelated interrupted candidate ------------
{
  const dir = freshDir("continuity-lock-publication");
  mkdirSync(dirname(continuityLockPath(dir)), { recursive: true });
  writeFileSync(`${continuityLockPath(dir)}.candidate.orphan-nonce`, "partial-record");
  const lock = acquireContinuityLock(dir, "token-publish-001", continuityDeps(dir, { ownerNonce: () => "nonce-publish-001" }));
  const record = JSON.parse(readFileSync(continuityLockPath(dir), "utf8"));
  ok("PS50a unrelated partial candidate cannot become the published lock", lock.ok === true && record.schema === CONTINUITY_LOCK_SCHEMA_ID);
  ok("PS50b published lock atomically carries exact token and owner nonce", record.token === lock.token && record.ownerNonce === lock.ownerNonce);
  releaseContinuityLock(lock);
}

// ---- PS51: the gate-estimate producer is a closed, source/evidence-bound writer ------------
{
  const dir = freshDir("gate-estimate");
  const git = (...args) => spawnSync("git", args, { cwd: dir, encoding: "utf8" });
  git("init", "-q");
  git("config", "user.email", "goldfish@example.invalid");
  git("config", "user.name", "Goldfish");
  writeFileSync(join(dir, "README.md"), "fixture\n");
  git("add", "README.md");
  git("commit", "-q", "-m", "init");
  const oid = git("rev-parse", "HEAD").stdout.trim();
  mkdirSync(join(dir, "evidence"), { recursive: true });
  const estimateEvidence = {
    schema: "pipeline.gate-estimate-evidence.v1",
    featureId: "eta-feature",
    gate: "prd",
    observedAt: FIXED_NOW(),
    basis: [{ kind: "verify-run", reference: "evidence/verify.json", digest: A }],
    note: "One bounded check remains.",
  };
  const evidenceBytes = `${JSON.stringify(estimateEvidence)}\n`;
  writeFileSync(join(dir, "evidence", "eta.json"), evidenceBytes);
  const evidenceSha256 = createHash("sha256").update(evidenceBytes).digest("hex");
  run(["set-feature", "--id", "eta-feature", "--plan-path", "specs/eta/prd_eta.md"], { dir, now: FIXED_NOW });
  const args = [
    "set-gate-estimate", "--id", "eta-prd-1", "--expected-current-id", "absent",
    "--feature-id", "eta-feature", "--gate", "prd", "--object-format", "sha1", "--source-oid", oid,
    "--evidence-path", "evidence/eta.json", "--evidence-sha256", evidenceSha256,
    "--min-minutes", "20", "--max-minutes", "45", "--by", "coordinator",
  ];
  const recorded = run(args, { dir, now: FIXED_NOW });
  const stored = readState(dir).state;
  ok("PS51a set-gate-estimate writes only a source/evidence-bound coordinator record", recorded === 0
    && stored.gateEstimate?.id === "eta-prd-1"
    && stored.gateEstimate?.sourceOid === oid
    && stored.gateEstimate?.evidence?.sha256 === evidenceSha256
    && stored.gateEstimate?.recordedBy === "coordinator", JSON.stringify(stored.gateEstimate));
  const beforeReplay = readFileSync(statePath(dir), "utf8");
  const replay = run(args.map((value, index) => index === 4 ? "eta-prd-1" : value), { dir, now: () => "2026-07-08T00:00:00.000Z" });
  ok("PS51b identical estimate retry is a zero-write CAS replay", replay === 0 && readFileSync(statePath(dir), "utf8") === beforeReplay);
  const beforeRejected = readFileSync(statePath(dir), "utf8");
  const rejected = run([...args.slice(0, -1), "operator"], { dir, now: FIXED_NOW });
  ok("PS51c non-coordinator estimate attribution is refused without mutation", rejected === 2 && readFileSync(statePath(dir), "utf8") === beforeRejected);
  const advanced = run([
    "approve-deploy", "--env", "test", "--artifact", "candidate", "--by", "po-test",
  ], { dir, now: FIXED_NOW });
  ok("PS51d a later successful state mutation clears the persisted estimate", advanced === 0 && readState(dir).state.gateEstimate === undefined);
}

// ---- PS52: AC-047-27 legacy continuity adoption planner/apply ----------------------------
{
  const dir = freshDir("legacy-adoption-ac047");
  const legacyRoot = join(dir, "specs", "2026-07-25-codex-onboarding-0.4.5");
  mkdirSync(legacyRoot, { recursive: true });
  for (const name of ["prd_codex-onboarding-0.4.5.md", "spec.md", "result.md", "legacy-continuity-close-evidence.md"]) writeFileSync(join(legacyRoot, name), readFileSync(join(process.cwd(), "specs", "2026-07-25-codex-onboarding-0.4.5", name)));
  const continuity = { schema: "pipeline.continuity.v0", featureId: "codex-onboarding-0.4.5", revision: 3, runtime: { humanFacingLanguage: "en", activeDuty: "Coordinator" }, authority: { prd: { path: "specs/2026-07-25-codex-onboarding-0.4.5/prd_codex-onboarding-0.4.5.md", sha256: "9825ca78a3765dc71ee2793ef9f84f2eaf998bf297086d869be3562d792cdb94" }, spec: { path: "specs/2026-07-25-codex-onboarding-0.4.5/spec.md", sha256: "5a95aa55b393a88e0d7ab1a8006957fc04d80bcae24399b40f3ffa8e4eb3cf70" }, result: null }, queueHead: { packageId: "continuity-adoption", actionId: "review-active-feature", nextAction: "review", productRetryCount: 0, environmentRerouteCount: 0, dispatch: null }, blocker: null, acknowledgedFinal: null, resume: { mode: "immediate", sourceRevision: 0, reasonCode: "active-turn" }, recovery: null, decisionTxn: null, capacity: { concurrencyLimit: 4, reservedCriticSlots: 1, reservedRecoverySlots: 1, fallbackPolicy: "defer" } };
  const stateValue = { schema: SCHEMA_ID, activeFeature: { id: "codex-onboarding-0.4.5", planPath: continuity.authority.prd.path, phase: "implementation" }, planApproved: true, planApproval: { schema: "pipeline.plan-approval.v2", approvedBy: "PO", approvedAt: "2026-07-26T14:08:37.500Z", specBoundBy: "PO", specBoundAt: "2026-07-26T14:08:37.500Z", poGateAuthority: { schema: "pipeline.po-gate-authority.v2", humanFacing: "en", sourceSha256: "2a0f69551b46963d6d49ef0faaf9db5c28d27c4f681a9d4dd0be1a81b297da10", runtimeSha256: "071b0236f6054bbeea2140830320a88d1c6a9e733d7294ad0bb976fd2e28c897", receiptSha256: "c4fc5171dc507a81908b30137bbf537355626f957d1ccbb9bee3a8ae9db02aa2", repositoryFingerprint: "6af2655d04c85a0e2faff67dedc2116a845874502dbe31c20e4c28372ea7885f", planPath: continuity.authority.prd.path, planSha256: "217eff325fffa5d82d5d49f31883c426dca74c42879aaae0a70da87be8e492ae", specPath: "specs/2026-07-25-codex-onboarding-0.4.5/spec.md", specSha256: continuity.authority.spec.sha256 } }, continuity, updatedAt: "2026-07-26T14:08:37.500Z" };
  delete continuity.closeTransition;
  mkdirSync(dirname(statePath(dir)), { recursive: true }); writeFileSync(statePath(dir), JSON.stringify(stateValue) + "\n");
  const request = { expectedRevision: 3, currentPrd: { path: continuity.authority.prd.path, sha256: "217eff325fffa5d82d5d49f31883c426dca74c42879aaae0a70da87be8e492ae" }, spec: continuity.authority.spec, result: { path: "specs/2026-07-25-codex-onboarding-0.4.5/result.md", sha256: "ceed30ddce48d921f2afbbb44d02a3fe5301302ad07fab3f41dfbc149f657b73" }, closeEvidence: { path: "specs/2026-07-25-codex-onboarding-0.4.5/legacy-continuity-close-evidence.md", sha256: "8fe8c79f464e2a3f93f2e300fb6e74cccf6791f5920f4a857597f516d97917a1" }, history: { commit: "7a62a4ef9febba844cf5be8a659177b37c6a5da5", path: continuity.authority.prd.path, sha256: continuity.authority.prd.sha256 } };
  const reqPath = writeRequest(dir, "legacy-request", request); const observed = { head: "9d1b3dc108eb77629ace5b82002120f5539abd8d", tagObject: "78359ae1ba7e0194111e531c060db615e4994e40", commit: "9d1b3dc108eb77629ace5b82002120f5539abd8d", tree: "282a8b5c5b0581e042985bfb373a66be0eb2d08b", remoteCommit: "9d1b3dc108eb77629ace5b82002120f5539abd8d", remoteTagObject: "78359ae1ba7e0194111e531c060db615e4994e40", remoteTagCommit: "9d1b3dc108eb77629ace5b82002120f5539abd8d", historicalPrdSha256: continuity.authority.prd.sha256 };
  const planned = captureConsole(() => run(["continuity-adoption-plan", "--request-file", reqPath], { dir, legacyGitObservation: () => observed, now: FIXED_NOW })); const payload = JSON.parse(planned.text || "{}");
  ok("PS52a exact legacy request yields a digest-bound plan", planned.value === 0 && payload.applyAction?.requiresConfirmation === true && payload.applyAction?.mutation === true && payload.applyAction?.requiresHostBoundary === true && payload.planSha256);
  ok("PS52a1 apply action is absolute and digest/confirmation bound", typeof payload.applyAction?.executable === "string" && payload.applyAction.executable.startsWith("/") && payload.applyAction.argv?.includes("--activate") && payload.applyAction.argv?.includes(payload.planSha256));
  const before = readFileSync(statePath(dir), "utf8"); ok("PS52b planner is read-only", readFileSync(statePath(dir), "utf8") === before);
  const rootDrift = JSON.parse(before); rootDrift.updatedAt = "2026-07-26T14:08:37.501Z"; writeFileSync(statePath(dir), JSON.stringify(rootDrift) + "\n");
  const driftPlan = captureConsoleError(() => run(["continuity-adoption-plan", "--request-file", reqPath], { dir, legacyGitObservation: () => observed, now: FIXED_NOW }));
  ok("PS52b1 updatedAt/root drift is refused without mutation", driftPlan.value === 2 && readFileSync(statePath(dir), "utf8") === JSON.stringify(rootDrift) + "\n");
  writeFileSync(statePath(dir), before);
  const rootMutations = [
    ["root extra", (s) => { s.extra = true; }], ["activeFeature extra", (s) => { s.activeFeature.extra = true; }],
    ["activeFeature wrong id", (s) => { s.activeFeature.id = "wrong"; }], ["approval extra", (s) => { s.planApproval.extra = true; }],
    ["approval actor", (s) => { s.planApproval.approvedBy = "other"; }], ["approval timestamp", (s) => { s.planApproval.approvedAt = "2026-07-26T14:08:37.501Z"; }],
    ["authority extra", (s) => { s.planApproval.poGateAuthority.extra = true; }], ["authority digest", (s) => { s.planApproval.poGateAuthority.sourceSha256 = A; }],
  ];
  for (const [label, mutate] of rootMutations) {
    const altered = JSON.parse(before); mutate(altered); const bytes = JSON.stringify(altered) + "\n"; writeFileSync(statePath(dir), bytes);
    const rejectedRoot = captureConsoleError(() => run(["continuity-adoption-plan", "--request-file", reqPath], { dir, legacyGitObservation: () => observed, now: FIXED_NOW }));
    ok(`PS52-root-${label}`, rejectedRoot.value === 2 && readFileSync(statePath(dir), "utf8") === bytes);
    writeFileSync(statePath(dir), before);
  }
  const candidateHead = structuredClone(observed); candidateHead.head = A.slice(0, 40);
  const candidateHeadPlan = captureConsole(() => run(["continuity-adoption-plan", "--request-file", reqPath], { dir, legacyGitObservation: () => candidateHead, now: FIXED_NOW }));
  ok("PS52-release-candidate-head may differ from the release tag", candidateHeadPlan.value === 0 && readFileSync(statePath(dir), "utf8") === before);
  for (const [label, mutate] of [["tagObject", (o) => { o.tagObject = A.slice(0, 40); }], ["commit", (o) => { o.commit = A.slice(0, 40); }], ["tree", (o) => { o.tree = A.slice(0, 40); }], ["remoteCommit", (o) => { o.remoteCommit = A.slice(0, 40); }], ["remoteTagObject", (o) => { o.remoteTagObject = A.slice(0, 40); }], ["remoteTagCommit", (o) => { o.remoteTagCommit = A.slice(0, 40); }], ["historical bytes", (o) => { o.historicalPrdSha256 = A; }]]) {
    const altered = structuredClone(observed); mutate(altered); const rejectedRelease = captureConsoleError(() => run(["continuity-adoption-plan", "--request-file", reqPath], { dir, legacyGitObservation: () => altered, now: FIXED_NOW }));
    ok(`PS52-release-${label}`, rejectedRelease.value === 2 && readFileSync(statePath(dir), "utf8") === before);
  }
  for (const [label, mutate] of [["artifact missing", (r) => { r.result.path = "missing.md"; }], ["artifact hash", (r) => { r.spec.sha256 = A; }], ["history mismatch", (r) => { r.history.commit = A.slice(0, 40); }]]) {
    const altered = structuredClone(request); mutate(altered); const alteredPath = writeRequest(dir, `legacy-${label.replace(/ /g, "-")}`, altered);
    const rejectedArtifact = captureConsoleError(() => run(["continuity-adoption-plan", "--request-file", alteredPath], { dir, legacyGitObservation: () => observed, now: FIXED_NOW }));
    ok(`PS52-artifact-${label}`, rejectedArtifact.value === 2 && readFileSync(statePath(dir), "utf8") === before);
  }
  if (symlinkCapable) {
    const target = join(legacyRoot, "result.md"); const moved = join(legacyRoot, "result.real"); renameSync(target, moved); symlinkSync(moved, target);
    const symlinkRejected = captureConsoleError(() => run(["continuity-adoption-plan", "--request-file", reqPath], { dir, legacyGitObservation: () => observed, now: FIXED_NOW }));
    ok("PS52-artifact-symlink", symlinkRejected.value === 2 && readFileSync(statePath(dir), "utf8") === before);
    rmSync(target); renameSync(moved, target);
  }
  const oversized = "{" + "x".repeat(70_000) + "}"; writeFileSync(statePath(dir), oversized);
  const oversizedRejected = captureConsoleError(() => run(["continuity-adoption-plan", "--request-file", reqPath], { dir, legacyGitObservation: () => observed, now: FIXED_NOW }));
  ok("PS52-state-oversized", oversizedRejected.value === 2 && readFileSync(statePath(dir), "utf8") === oversized);
  writeFileSync(statePath(dir), before);
  const driftedState = JSON.parse(before); driftedState.updatedAt = "2026-07-26T14:08:37.501Z"; writeFileSync(statePath(dir), JSON.stringify(driftedState) + "\n");
  const staleApply = captureConsoleError(() => run(["continuity-adoption-apply", "--request-file", reqPath, "--plan-sha256", payload.planSha256, "--activate"], { dir, legacyGitObservation: () => observed, now: FIXED_NOW }));
  ok("PS52c1 State drift between plan/apply is refused byte-null", staleApply.value === 2 && readFileSync(statePath(dir), "utf8") === JSON.stringify(driftedState) + "\n");
  writeFileSync(statePath(dir), before);
  const preRename = captureConsoleError(() => run(["continuity-adoption-apply", "--request-file", reqPath, "--plan-sha256", payload.planSha256, "--activate"], { dir, legacyGitObservation: () => observed, now: FIXED_NOW, replaceStateFdContents: () => { throw new Error("injected pre-rename"); } }));
  ok("PS52c2 pre-rename write failure reports committed=false and zero mutation", preRename.value === 2 && /zero mutation/i.test(preRename.text) && readFileSync(statePath(dir), "utf8") === before);
  const postRename = captureConsoleError(() => run(["continuity-adoption-apply", "--request-file", reqPath, "--plan-sha256", payload.planSha256, "--activate"], { dir, legacyGitObservation: () => observed, now: FIXED_NOW, syncDirectory: () => ({ ok: false, supported: true }) }));
  const postState = readState(dir).state;
  ok("PS52c3 post-rename directory-sync failure reports committed durability and revision4", postRename.value === 2 && /durability|committed/i.test(postRename.text) && !/zero mutation/i.test(postRename.text) && postState.continuity?.revision === 4);
  writeFileSync(statePath(dir), before);
  for (const [label, readback] of [["malformed", () => ({ status: "malformed" })], ["drifted", (root) => ({ status: "ok", state: { ...root, updatedAt: "drifted" } })], ["planApproved drift", (root) => ({ status: "ok", state: { ...root, planApproved: false } })], ["planApproval drift", (root) => ({ status: "ok", state: { ...root, planApproval: { ...root.planApproval, approvedBy: "other" } } })]]) {
    writeFileSync(statePath(dir), before);
    const injectedReadback = captureConsoleError(() => run(["continuity-adoption-apply", "--request-file", reqPath, "--plan-sha256", payload.planSha256, "--activate"], {
      dir, legacyGitObservation: () => observed, now: FIXED_NOW,
      readLegacyAdoptionPostimage: () => readback(readState(dir).state),
    }));
    ok(`PS52c4 postimage-${label} readback fails closed without success claim`, injectedReadback.value === 2 && !/CS-LEGACY-ADOPTION-APPLIED.*written/i.test(injectedReadback.text));
  }
  writeFileSync(statePath(dir), before);
  const apply = captureConsoleError(() => run(["continuity-adoption-apply", "--request-file", reqPath, "--plan-sha256", payload.planSha256, "--activate"], { dir, legacyGitObservation: () => observed, now: FIXED_NOW }));
  ok("PS52c exact apply advances revision and close action", apply.value === 0 && readState(dir).state.continuity.revision === 4 && readState(dir).state.continuity.queueHead.nextAction === "close");
  const replayBefore = readFileSync(statePath(dir), "utf8"); const replay = captureConsoleError(() => run(["continuity-adoption-apply", "--request-file", reqPath, "--plan-sha256", payload.planSha256, "--activate"], { dir, legacyGitObservation: () => observed, now: FIXED_NOW }));
  ok("PS52d conflicting replay is refused without mutation", replay.value === 2 && readFileSync(statePath(dir), "utf8") === replayBefore);
  writeFileSync(statePath(dir), before);
  const lock = acquireContinuityLock(dir, "ps52-lock", continuityDeps(dir));
  const locked = captureConsoleError(() => run(["continuity-adoption-apply", "--request-file", reqPath, "--plan-sha256", payload.planSha256, "--activate"], { dir, legacyGitObservation: () => observed, now: FIXED_NOW }));
  ok("PS52d1 lock contention refuses apply with zero State mutation", locked.value === 2 && readFileSync(statePath(dir), "utf8") === before);
  releaseContinuityLock(lock);
  const driftPath = writeRequest(dir, "legacy-drift", { ...request, extra: true }); const rejected = captureConsoleError(() => run(["continuity-adoption-plan", "--request-file", driftPath], { dir, legacyGitObservation: () => observed, now: FIXED_NOW }));
  ok("PS52e extra request key is rejected", rejected.value === 2 && readFileSync(statePath(dir), "utf8") === before);
}

runPoAuthorityRebindTests();

// ---- PS54: PHX-0 slice A -- the read-only feature-package commands (P-AC-08) ---------------
// These pin three things the transactional half will inherit: the planner is the only
// source of a verdict (previews are compared byte-for-byte against a direct planner call,
// so a hand-rolled preview cannot pass), every refusal names the argument at fault, and
// the commands write nothing -- proven both on a fixture tree and on this repository's
// own porcelain status.
const REPO_ROOT = join(dirname(CLI), "..", "..");
const PHOENIX_MANIFEST = "specs/sprint-phoenix-epic/lifecycle.json";

function captureBoth(action) {
  const outer = captureConsoleError(() => captureConsole(action));
  return { value: outer.value.value, out: outer.value.text, err: outer.text };
}

function featurePackageManifestBytes(id, prdRel, sha256, state = "draft") {
  return `${JSON.stringify({
    schema: "pipeline.feature-package.v1",
    feature: { id, rigor: 1 },
    state,
    artifacts: [{ class: "prd", path: prdRel, sha256, authority: true, mutability: "mutable", retention: "active" }],
    candidate: null,
    supersedes: null,
  }, null, 2)}\n`;
}

function seedFeaturePackage(prefix, { id = "read-pkg", state = "draft", digest = null } = {}) {
  const dir = freshDir(prefix);
  mkdirSync(join(dir, "specs", id), { recursive: true });
  const prdRel = `specs/${id}/prd_${id}.md`;
  const prdBytes = `# ${id} PRD\n`;
  writeFileSync(join(dir, prdRel), prdBytes);
  const sha256 = createHash("sha256").update(prdBytes).digest("hex");
  const manifestRel = `specs/${id}/lifecycle.json`;
  writeFileSync(join(dir, manifestRel), featurePackageManifestBytes(id, prdRel, digest ?? sha256, state));
  return { dir, id, manifestRel, prdRel, sha256 };
}

/** Content+metadata fingerprint of a whole tree: any write at all changes it. */
function featurePackageTreeSnapshot(root) {
  const lines = [];
  const visit = (rel) => {
    const names = readdirSync(rel === "" ? root : join(root, rel), { withFileTypes: true })
      .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const entry of names) {
      const next = rel === "" ? entry.name : `${rel}/${entry.name}`;
      if (entry.isDirectory()) { lines.push(`d ${next}`); visit(next); continue; }
      const stat = lstatSync(join(root, next));
      lines.push(`f ${next} ${stat.size} ${stat.mtimeMs} ${createHash("sha256").update(readFileSync(join(root, next))).digest("hex")}`);
    }
  };
  visit("");
  return lines.join("\n");
}

function runFeaturePackageReadTests() {
{
  const fixture = seedFeaturePackage("fp-inspect-ok");
  const inspected = captureBoth(() => run(["feature-package-inspect", "--root", fixture.dir]));
  const report = JSON.parse(inspected.out || "{}");
  ok("PS54a inspect reports a valid package and exits 0", inspected.value === 0
    && report.schema === "pipeline.feature-package-inspect.v1"
    && report.ok === true && report.packageCount === 1 && report.invalidCount === 0
    && report.packages[0].manifest === fixture.manifestRel
    && report.packages[0].featureId === fixture.id
    && report.packages[0].state === "draft"
    && report.packages[0].artifactCount === 1
    && Array.isArray(report.legacy) && Array.isArray(report.unknown), inspected.out || inspected.err);
}

{
  const fixture = seedFeaturePackage("fp-inspect-bad", { digest: "0".repeat(64) });
  const inspected = captureBoth(() => run(["feature-package-inspect", "--root", fixture.dir]));
  const report = JSON.parse(inspected.out || "{}");
  ok("PS54b inspect exits non-zero on an invalid manifest yet still reports it", inspected.value !== 0
    && report.ok === false && report.invalidCount === 1
    && report.packages[0].ok === false
    && report.packages[0].featureId === fixture.id
    && report.packages[0].findings.some((finding) => /digest does not bind file bytes/.test(finding)), inspected.out);
}

{
  const legacyOnly = freshDir("fp-inspect-legacy");
  mkdirSync(join(legacyOnly, "specs", "old-thing"), { recursive: true });
  writeFileSync(join(legacyOnly, "specs", "loose.md"), "# loose\n");
  const inspected = captureBoth(() => run(["feature-package-inspect", "--root", legacyOnly]));
  const report = JSON.parse(inspected.out || "{}");
  ok("PS54c inspect never guesses a lifecycle state for legacy or unknown entries", inspected.value === 0
    && report.packageCount === 0 && report.ok === true
    && report.legacy.includes("specs/old-thing") && report.unknown.includes("specs/loose.md"), inspected.out);
}

{
  const missingRoot = captureBoth(() => run(["feature-package-inspect"]));
  ok("PS54d inspect without --root refuses fail-closed naming the argument", missingRoot.value === 2
    && /--root/.test(missingRoot.err) && missingRoot.out === "", missingRoot.err);
  const fixture = seedFeaturePackage("fp-inspect-rootfile");
  const notADirectory = captureBoth(() => run(["feature-package-inspect", "--root", join(fixture.dir, fixture.prdRel)]));
  ok("PS54e inspect refuses a --root that is not a readable directory, naming the path", notADirectory.value === 2
    && /--root/.test(notADirectory.err) && notADirectory.err.includes(fixture.prdRel) && notADirectory.out === "", notADirectory.err);
  const unknownFlag = captureBoth(() => run(["feature-package-inspect", "--root", fixture.dir, "--manifest", fixture.manifestRel]));
  ok("PS54f inspect refuses an unknown argument by name", unknownFlag.value === 2
    && /--manifest/.test(unknownFlag.err) && unknownFlag.out === "", unknownFlag.err);
  const valueless = captureBoth(() => run(["feature-package-inspect", "--root"]));
  ok("PS54g a value-less argument is refused by name", valueless.value === 2 && /--root/.test(valueless.err), valueless.err);
  const duplicated = captureBoth(() => run(["feature-package-inspect", "--root", fixture.dir, "--root", fixture.dir]));
  ok("PS54h a duplicated argument is refused by name", duplicated.value === 2 && /--root/.test(duplicated.err), duplicated.err);
  const positional = captureBoth(() => run(["feature-package-inspect", fixture.dir]));
  ok("PS54i a positional argument is refused rather than ignored", positional.value === 2 && positional.out === "", positional.err);
}

{
  const fixture = seedFeaturePackage("fp-status-ok");
  const status = captureBoth(() => run(["feature-package-status", "--root", fixture.dir, "--manifest", fixture.manifestRel]));
  const report = JSON.parse(status.out || "{}");
  ok("PS54j status reports state, artifact set and validity for one package", status.value === 0
    && report.schema === "pipeline.feature-package-status.v1"
    && report.ok === true && report.state === "draft" && report.featureId === fixture.id
    && report.candidate === null && report.artifactCount === 1
    && report.artifacts.length === 1 && report.artifacts[0].path === fixture.prdRel
    && report.artifacts[0].class === "prd" && report.artifacts[0].authority === true
    && report.artifacts[0].sha256 === fixture.sha256
    && report.receipt.schema === "pipeline.feature-package-receipt.v1"
    && report.receipt.manifestSha256 === createHash("sha256").update(readFileSync(join(fixture.dir, fixture.manifestRel))).digest("hex")
    && report.findings.length === 0, status.out || status.err);
}

{
  const fixture = seedFeaturePackage("fp-status-bad", { digest: "0".repeat(64) });
  const status = captureBoth(() => run(["feature-package-status", "--root", fixture.dir, "--manifest", fixture.manifestRel]));
  const report = JSON.parse(status.out || "{}");
  ok("PS54k status reports an invalid package and exits non-zero", status.value !== 0
    && report.ok === false && report.state === "draft"
    && report.findings.some((finding) => /digest does not bind file bytes/.test(finding)), status.out);
}

{
  const fixture = seedFeaturePackage("fp-status-refuse");
  const absent = captureBoth(() => run(["feature-package-status", "--root", fixture.dir, "--manifest", "specs/ghost/lifecycle.json"]));
  ok("PS54l status refuses an absent manifest naming the path", absent.value === 2
    && absent.err.includes("specs/ghost/lifecycle.json") && absent.out === "", absent.err);
  writeFileSync(join(fixture.dir, "specs", fixture.id, "broken.json"), "{ not json");
  const malformed = captureBoth(() => run(["feature-package-status", "--root", fixture.dir, "--manifest", `specs/${fixture.id}/broken.json`]));
  ok("PS54m status refuses a malformed manifest naming the path", malformed.value === 2
    && malformed.err.includes(`specs/${fixture.id}/broken.json`) && malformed.out === "", malformed.err);
  const missing = captureBoth(() => run(["feature-package-status", "--root", fixture.dir]));
  ok("PS54n status without --manifest refuses naming the argument", missing.value === 2
    && /--manifest/.test(missing.err) && missing.out === "", missing.err);
  for (const [label, bad] of [["traversal", "../outside/lifecycle.json"], ["absolute", join(fixture.dir, fixture.manifestRel)], ["dot segment", "specs/./x/lifecycle.json"]]) {
    const refused = captureBoth(() => run(["feature-package-status", "--root", fixture.dir, "--manifest", bad]));
    ok(`PS54o status refuses a non-canonical --manifest (${label})`, refused.value === 2
      && /--manifest/.test(refused.err) && refused.err.includes(bad) && refused.out === "", refused.err);
  }
}

{
  const fixture = seedFeaturePackage("fp-plan-ok");
  const planned = captureBoth(() => run(["feature-package-plan", "--root", fixture.dir, "--manifest", fixture.manifestRel, "--next-state", "awaiting-approval"]));
  const expected = planFeaturePackageTransition(fixture.dir, fixture.manifestRel, "awaiting-approval");
  ok("PS54p plan returns the planner's exact transition preview", planned.value === 0
    && planned.out === JSON.stringify(expected, null, 2)
    && JSON.parse(planned.out).status === "preview"
    && JSON.parse(planned.out).changes[0].operation === "submit", planned.out || planned.err);

  const noop = captureBoth(() => run(["feature-package-plan", "--root", fixture.dir, "--manifest", fixture.manifestRel, "--next-state", "draft"]));
  ok("PS54q plan passes an idempotent no-op through unchanged", noop.value === 0
    && noop.out === JSON.stringify(planFeaturePackageTransition(fixture.dir, fixture.manifestRel, "draft"), null, 2)
    && JSON.parse(noop.out).status === "noop", noop.out);

  for (const [label, target, reason] of [["unsupported state", "teleported", "invalid-target-state"], ["inadmissible edge", "completed", "invalid-transition"]]) {
    const rejected = captureBoth(() => run(["feature-package-plan", "--root", fixture.dir, "--manifest", fixture.manifestRel, "--next-state", target]));
    ok(`PS54r plan surfaces the planner's rejection unchanged (${label})`, rejected.value === 2
      && rejected.out === JSON.stringify(planFeaturePackageTransition(fixture.dir, fixture.manifestRel, target), null, 2)
      && JSON.parse(rejected.out).reason === reason, rejected.out);
  }

  const missingTarget = captureBoth(() => run(["feature-package-plan", "--root", fixture.dir, "--manifest", fixture.manifestRel]));
  ok("PS54s plan without --next-state on an existing manifest refuses naming the argument", missingTarget.value === 2
    && /--next-state/.test(missingTarget.err) && missingTarget.out === "", missingTarget.err);
}

{
  const invalid = seedFeaturePackage("fp-plan-invalid", { digest: "0".repeat(64) });
  const rejected = captureBoth(() => run(["feature-package-plan", "--root", invalid.dir, "--manifest", invalid.manifestRel, "--next-state", "awaiting-approval"]));
  ok("PS54t plan refuses to preview a transition out of an invalid package", rejected.value === 2
    && JSON.parse(rejected.out || "{}").reason === "invalid-current-package"
    && rejected.out === JSON.stringify(planFeaturePackageTransition(invalid.dir, invalid.manifestRel, "awaiting-approval"), null, 2), rejected.out);
}

{
  const dir = freshDir("fp-bootstrap");
  const id = "boot-pkg";
  mkdirSync(join(dir, "specs", id), { recursive: true });
  const prdRel = `specs/${id}/prd_${id}.md`;
  writeFileSync(join(dir, prdRel), `# ${id} PRD\n`);
  const sha256 = createHash("sha256").update(`# ${id} PRD\n`).digest("hex");
  const manifestRel = `specs/${id}/lifecycle.json`;
  const proposalRel = "proposed-lifecycle.json";
  const proposalBytes = featurePackageManifestBytes(id, prdRel, sha256);
  writeFileSync(join(dir, proposalRel), proposalBytes);

  const preview = captureBoth(() => run(["feature-package-plan", "--root", dir, "--manifest", manifestRel, "--proposal", proposalRel]));
  const expected = planFeaturePackageBootstrap(dir, manifestRel, { manifestBytes: proposalBytes, targetState: "draft" });
  ok("PS54u plan returns the planner's exact absent-manifest draft bootstrap preview", preview.value === 0
    && preview.out === JSON.stringify(expected, null, 2)
    && JSON.parse(preview.out).status === "bootstrap-preview"
    && JSON.parse(preview.out).from === "absent" && JSON.parse(preview.out).to === "draft"
    && JSON.parse(preview.out).changes[0].operation === "create-manifest"
    && JSON.parse(preview.out).receipt.manifestSha256 === createHash("sha256").update(proposalBytes).digest("hex"), preview.out || preview.err);
  ok("PS54v the bootstrap preview creates no manifest", !existsSync(join(dir, manifestRel)));

  const wrongTarget = captureBoth(() => run(["feature-package-plan", "--root", dir, "--manifest", manifestRel, "--proposal", proposalRel, "--next-state", "approved"]));
  ok("PS54w a non-draft bootstrap target is rejected by the planner, not by a local rule", wrongTarget.value === 2
    && wrongTarget.out === JSON.stringify(planFeaturePackageBootstrap(dir, manifestRel, { manifestBytes: proposalBytes, targetState: "approved" }), null, 2)
    && JSON.parse(wrongTarget.out).reason === "invalid-bootstrap-proposal"
    && !existsSync(join(dir, manifestRel)), wrongTarget.out);

  writeFileSync(join(dir, "stale-proposal.json"), featurePackageManifestBytes(id, prdRel, "0".repeat(64)));
  const staleDigest = captureBoth(() => run(["feature-package-plan", "--root", dir, "--manifest", manifestRel, "--proposal", "stale-proposal.json"]));
  ok("PS54x a bootstrap proposal whose digest does not bind the file is rejected", staleDigest.value === 2
    && JSON.parse(staleDigest.out || "{}").reason === "invalid-bootstrap-proposal"
    && !existsSync(join(dir, manifestRel)), staleDigest.out);

  const noProposal = captureBoth(() => run(["feature-package-plan", "--root", dir, "--manifest", manifestRel]));
  ok("PS54y an absent manifest without --proposal refuses naming the argument and the path", noProposal.value === 2
    && /--proposal/.test(noProposal.err) && noProposal.err.includes(manifestRel) && noProposal.out === "", noProposal.err);
  const ghostProposal = captureBoth(() => run(["feature-package-plan", "--root", dir, "--manifest", manifestRel, "--proposal", "no-such-proposal.json"]));
  ok("PS54z an unreadable --proposal refuses naming the argument and the path", ghostProposal.value === 2
    && /--proposal/.test(ghostProposal.err) && ghostProposal.err.includes("no-such-proposal.json") && ghostProposal.out === "", ghostProposal.err);
  const directoryProposal = captureBoth(() => run(["feature-package-plan", "--root", dir, "--manifest", manifestRel, "--proposal", `specs/${id}`]));
  ok("PS54aa a --proposal that is not a regular file is refused", directoryProposal.value === 2
    && /--proposal/.test(directoryProposal.err) && directoryProposal.out === "", directoryProposal.err);

  const existing = seedFeaturePackage("fp-bootstrap-conflict");
  const conflict = captureBoth(() => run(["feature-package-plan", "--root", existing.dir, "--manifest", existing.manifestRel, "--next-state", "awaiting-approval", "--proposal", existing.manifestRel]));
  ok("PS54ab --proposal is refused for a manifest that already exists", conflict.value === 2
    && /--proposal/.test(conflict.err) && conflict.out === "", conflict.err);
}

{
  // No-write proof, fixture layer: every subcommand, on its happy AND its refusing path,
  // leaves the tree byte-, size- and mtime-identical.
  const fixture = seedFeaturePackage("fp-no-write");
  const proposalRel = "proposed.json";
  writeFileSync(join(fixture.dir, proposalRel), featurePackageManifestBytes("ghost-pkg", "specs/ghost-pkg/prd_ghost-pkg.md", "1".repeat(64)));
  const before = featurePackageTreeSnapshot(fixture.dir);
  const invocations = [
    ["feature-package-inspect", "--root", fixture.dir],
    ["feature-package-inspect", "--root", "definitely-not-a-directory"],
    ["feature-package-status", "--root", fixture.dir, "--manifest", fixture.manifestRel],
    ["feature-package-status", "--root", fixture.dir, "--manifest", "specs/ghost/lifecycle.json"],
    ["feature-package-plan", "--root", fixture.dir, "--manifest", fixture.manifestRel, "--next-state", "awaiting-approval"],
    ["feature-package-plan", "--root", fixture.dir, "--manifest", fixture.manifestRel, "--next-state", "completed"],
    ["feature-package-plan", "--root", fixture.dir, "--manifest", "specs/ghost-pkg/lifecycle.json", "--proposal", proposalRel],
  ];
  for (const argv of invocations) captureBoth(() => run(argv));
  ok("PS54ac none of the three commands writes anything into the fixture tree", featurePackageTreeSnapshot(fixture.dir) === before);
  ok("PS54ad no command created a state file as a side effect", !existsSync(statePath(fixture.dir)));
}

{
  // No-write proof, repository layer, plus the live-repository run P-AC-08 cares about.
  const probe = spawnSync("git", ["status", "--porcelain"], { cwd: REPO_ROOT, encoding: "utf8" });
  if (probe.error || probe.status !== 0) {
    console.log("[capability: git status unavailable] skipping the repository-porcelain no-write proof");
  } else {
    const before = probe.stdout;
    const inspected = captureBoth(() => run(["feature-package-inspect", "--root", REPO_ROOT]));
    const inventory = JSON.parse(inspected.out || "{}");
    const phoenix = (inventory.packages ?? []).find((entry) => entry.manifest === PHOENIX_MANIFEST);
    ok("PS54ae inspect finds this repository's Phoenix package and its exit code encodes validity",
      phoenix !== undefined && inspected.value === (inventory.invalidCount === 0 ? 0 : 2), inspected.out.slice(0, 400) || inspected.err);

    const status = captureBoth(() => run(["feature-package-status", "--root", REPO_ROOT, "--manifest", PHOENIX_MANIFEST]));
    const report = JSON.parse(status.out || "{}");
    ok("PS54af status reports the live Phoenix package's real current state", status.value === 0
      && report.ok === true && report.featureId === "sprint-phoenix-epic" && report.state === "draft"
      && report.artifacts.some((artifact) => artifact.class === "prd" && artifact.authority === true), status.err);

    const planned = captureBoth(() => run(["feature-package-plan", "--root", REPO_ROOT, "--manifest", PHOENIX_MANIFEST, "--next-state", "awaiting-approval"]));
    const plan = JSON.parse(planned.out || "{}");
    ok("PS54ag plan previews the live Phoenix transition from its real current state", planned.value === 0
      && plan.status === "preview" && plan.from === "draft" && plan.to === "awaiting-approval"
      && plan.manifest === PHOENIX_MANIFEST, planned.err);

    const after = spawnSync("git", ["status", "--porcelain"], { cwd: REPO_ROOT, encoding: "utf8" });
    ok("PS54ah the repository's porcelain status is unchanged across all three commands",
      after.status === 0 && after.stdout === before, `before/after differ:\n${before}\n---\n${after.stdout}`);
  }
}
}

// ---- PHX-0A-WRITE: the transactional half -- feature-package-apply / -recover (P-AC-08) ---
function sha256Hex(bytes) { return createHash("sha256").update(bytes).digest("hex"); }

/** A FULL package (all five classes) -- required because every admitted transition
 * target except "draft" falls in ACTIVE_STATES, which requires prd/spec/acceptance/
 * result/candidate-evidence all present, so a real draft->awaiting-approval transition
 * only validates post-image if the fixture already carries the whole set. */
function seedFullFeaturePackage(prefix, { id = "wr-pkg", state = "draft" } = {}) {
  const dir = freshDir(prefix);
  mkdirSync(join(dir, "specs", id), { recursive: true });
  const files = {};
  for (const [key, name, content, authority, mutability] of [
    ["prd", `prd_${id}.md`, `# ${id} PRD\n`, true, "mutable"],
    ["spec", "spec.md", `# ${id} Spec\n`, true, "immutable"],
    ["acceptance", "acceptance.md", `# ${id} Acceptance\n`, false, "immutable"],
    ["result", "Result.md", `# ${id} Result\n`, false, "mutable"],
    ["evidence", "evidence.txt", `evidence for ${id}\n`, false, "immutable"],
  ]) {
    const rel = `specs/${id}/${name}`;
    writeFileSync(join(dir, rel), content);
    files[key] = { rel, sha256: sha256Hex(content), authority, mutability };
  }
  const value = {
    schema: "pipeline.feature-package.v1",
    feature: { id, rigor: 1 },
    state,
    artifacts: [
      { class: "prd", path: files.prd.rel, sha256: files.prd.sha256, authority: true, mutability: "mutable", retention: "active" },
      { class: "spec", path: files.spec.rel, sha256: files.spec.sha256, authority: true, mutability: "immutable", retention: "active" },
      { class: "acceptance", path: files.acceptance.rel, sha256: files.acceptance.sha256, authority: false, mutability: "immutable", retention: "active" },
      { class: "result", path: files.result.rel, sha256: files.result.sha256, authority: false, mutability: "mutable", retention: "active" },
      { class: "candidate-evidence", path: files.evidence.rel, sha256: files.evidence.sha256, authority: false, mutability: "immutable", retention: "active" },
    ],
    candidate: null,
    supersedes: null,
  };
  const manifestRel = `specs/${id}/lifecycle.json`;
  writeFileSync(join(dir, manifestRel), `${JSON.stringify(value, null, 2)}\n`);
  const fakeGitCommon = join(dir, ".fake-git-common");
  mkdirSync(fakeGitCommon, { recursive: true });
  const deps = { gitCommonDir: () => ({ ok: true, path: fakeGitCommon }), ownerNonce: () => `nonce-${id}` };
  return { dir, id, manifestRel, files, deps };
}

function planDigest(dir, extraArgs) {
  const res = captureBoth(() => run(["feature-package-plan", "--root", dir, ...extraArgs]));
  const plan = JSON.parse(res.out || "{}");
  return { plan, digest: sha256CanonicalJson(plan), raw: res };
}
function applyCmd(dir, extraArgs, deps) {
  return captureBoth(() => run(["feature-package-apply", "--root", dir, ...extraArgs], deps));
}
function recoverCmd(dir, deps) {
  return captureBoth(() => run(["feature-package-recover", "--root", dir], deps));
}

// Pins Finding 1 (PHX-F1F4): the "retained" branch of feature-package-recover must
// leak no absolute --root path, mirroring AR05b/AR05c's closed-property check for the
// continuity-authority-revision receipt/plan.
function assertRetainedReportIsClean(id, fx, recovered) {
  const text = recovered.out || "";
  const report = JSON.parse(text || "{}");
  const bannedNeedles = [fx.dir, "/home/", "/tmp/", process.cwd()];
  const clean = bannedNeedles.every((needle) => !text.includes(needle))
    && !/"root"\s*:/.test(text) && !Object.hasOwn(report, "root") && !Object.hasOwn(report, "dir");
  ok(`${id} the retained feature-package-recover report contains NO absolute path, repo root, /home/, /tmp/ or a root/dir key`, clean, text);
}

function runFeaturePackageWriteTests() {
{
  // WRa -- existing-manifest transition, the successful case.
  const fx = seedFullFeaturePackage("wr-transition-ok");
  const { plan, digest } = planDigest(fx.dir, ["--manifest", fx.manifestRel, "--next-state", "awaiting-approval"]);
  ok("WRa fixture preview is an actionable preview (sanity)", plan.status === "preview" && plan.from === "draft" && plan.to === "awaiting-approval", JSON.stringify(plan));
  const applied = applyCmd(fx.dir, ["--manifest", fx.manifestRel, "--next-state", "awaiting-approval", "--plan-sha256", digest], fx.deps);
  const receipt = JSON.parse(applied.out || "{}");
  ok("WRa transition apply succeeds and returns the pipeline.feature-package-apply.v1 receipt", applied.value === 0
    && receipt.schema === "pipeline.feature-package-apply.v1" && receipt.status === "applied" && receipt.kind === "transition"
    && receipt.from === "draft" && receipt.to === "awaiting-approval" && receipt.planSha256 === digest, applied.out || applied.err);
  const persisted = JSON.parse(readFileSync(join(fx.dir, fx.manifestRel), "utf8"));
  ok("WRa persisted manifest has ONLY state changed; artifacts/candidate/supersedes untouched", persisted.state === "awaiting-approval"
    && persisted.feature.id === fx.id && persisted.artifacts.length === 5
    && persisted.candidate === null && persisted.supersedes === null, JSON.stringify(persisted));
  const revalidated = validateFeaturePackage(fx.dir, fx.manifestRel);
  ok("WRa the persisted manifest re-validates ok through the accepted validator", revalidated.ok, revalidated.findings.join("; "));
}

{
  // WRb -- absent-manifest bootstrap, the successful case: exact proposal bytes persisted.
  const dir = freshDir("wr-bootstrap-ok");
  const id = "wr-boot";
  mkdirSync(join(dir, "specs", id), { recursive: true });
  const prdRel = `specs/${id}/prd_${id}.md`;
  const prdBytes = `# ${id} PRD\n`;
  writeFileSync(join(dir, prdRel), prdBytes);
  const sha256 = sha256Hex(prdBytes);
  const manifestRel = `specs/${id}/lifecycle.json`;
  const proposalRel = `specs/${id}/lifecycle.proposal.json`;
  const manifestBytes = featurePackageManifestBytes(id, prdRel, sha256, "draft");
  writeFileSync(join(dir, proposalRel), manifestBytes);
  const fakeGitCommon = join(dir, ".fake-git-common");
  mkdirSync(fakeGitCommon, { recursive: true });
  const deps = { gitCommonDir: () => ({ ok: true, path: fakeGitCommon }), ownerNonce: () => "nonce-boot" };
  const { plan, digest } = planDigest(dir, ["--manifest", manifestRel, "--proposal", proposalRel]);
  ok("WRb fixture preview is a bootstrap-preview (sanity)", plan.status === "bootstrap-preview", JSON.stringify(plan));
  const applied = applyCmd(dir, ["--manifest", manifestRel, "--proposal", proposalRel, "--plan-sha256", digest], deps);
  const receipt = JSON.parse(applied.out || "{}");
  ok("WRb bootstrap apply creates the manifest and returns the receipt", applied.value === 0
    && receipt.status === "applied" && receipt.kind === "bootstrap" && receipt.from === "absent" && receipt.to === "draft", applied.out || applied.err);
  const onDisk = readFileSync(join(dir, manifestRel), "utf8");
  ok("WRb persisted bytes are byte-identical to the exact proposal bytes", onDisk === manifestBytes, "bytes differ from the proposal");
}

{
  // WRc -- a drifted manifest between plan and apply is refused fail-closed.
  const fx = seedFullFeaturePackage("wr-digest-manifest-drift");
  const { digest } = planDigest(fx.dir, ["--manifest", fx.manifestRel, "--next-state", "awaiting-approval"]);
  writeFileSync(join(fx.dir, fx.files.prd.rel), "# drifted PRD content\n");
  const applied = applyCmd(fx.dir, ["--manifest", fx.manifestRel, "--next-state", "awaiting-approval", "--plan-sha256", digest], fx.deps);
  ok("WRc a drifted manifest since the preview is refused (stale --plan-sha256)", applied.value === 2
    && /does not match the freshly recomputed preview digest/.test(applied.err), applied.err);
  const untouched = JSON.parse(readFileSync(join(fx.dir, fx.manifestRel), "utf8"));
  ok("WRc the manifest state is untouched after the refusal", untouched.state === "draft", JSON.stringify(untouched));
}

{
  // WRc2 -- a changed --next-state between plan and apply is refused fail-closed.
  const fx = seedFullFeaturePackage("wr-digest-nextstate-drift");
  const { digest } = planDigest(fx.dir, ["--manifest", fx.manifestRel, "--next-state", "awaiting-approval"]);
  const applied = applyCmd(fx.dir, ["--manifest", fx.manifestRel, "--next-state", "draft", "--plan-sha256", digest], fx.deps);
  ok("WRc2 a changed --next-state since the preview is refused (stale --plan-sha256)", applied.value === 2
    && /does not match the freshly recomputed preview digest/.test(applied.err), applied.err);
}

{
  // WRc3 -- a drifted proposal (bootstrap shape) between plan and apply is refused.
  const dir = freshDir("wr-digest-proposal-drift");
  const id = "wr-boot-drift";
  mkdirSync(join(dir, "specs", id), { recursive: true });
  const prdRel = `specs/${id}/prd_${id}.md`;
  const prdBytes = `# ${id} PRD\n`;
  writeFileSync(join(dir, prdRel), prdBytes);
  const sha256 = sha256Hex(prdBytes);
  const manifestRel = `specs/${id}/lifecycle.json`;
  const proposalRel = `specs/${id}/lifecycle.proposal.json`;
  const manifestBytes = featurePackageManifestBytes(id, prdRel, sha256, "draft");
  writeFileSync(join(dir, proposalRel), manifestBytes);
  const fakeGitCommon = join(dir, ".fake-git-common");
  mkdirSync(fakeGitCommon, { recursive: true });
  const deps = { gitCommonDir: () => ({ ok: true, path: fakeGitCommon }), ownerNonce: () => "nonce-boot-drift" };
  const { digest } = planDigest(dir, ["--manifest", manifestRel, "--proposal", proposalRel]);
  writeFileSync(join(dir, proposalRel), manifestBytes.replace('"rigor": 1', '"rigor": 2'));
  const applied = applyCmd(dir, ["--manifest", manifestRel, "--proposal", proposalRel, "--plan-sha256", digest], deps);
  ok("WRc3 a drifted proposal since the preview is refused (stale --plan-sha256)", applied.value === 2
    && /does not match the freshly recomputed preview digest/.test(applied.err), applied.err);
  ok("WRc3 no manifest file was created by the refused bootstrap", !existsSync(join(dir, manifestRel)), "manifest should not exist");
}

{
  // WRd -- interrupted AFTER the journal is published, BEFORE the write: the journal
  // precedes the write and is retained, never deleted, on this failure path.
  const fx = seedFullFeaturePackage("wr-crash-after-journal");
  const { digest } = planDigest(fx.dir, ["--manifest", fx.manifestRel, "--next-state", "awaiting-approval"]);
  const crashed = applyCmd(fx.dir, ["--manifest", fx.manifestRel, "--next-state", "awaiting-approval", "--plan-sha256", digest],
    { ...fx.deps, afterFeaturePackageApplyJournal: () => false });
  ok("WRd interrupted after journal publication refuses, ending in 'recovery journal retained.'", crashed.value === 2
    && /interrupted after journal preparation; recovery journal retained\.$/.test(crashed.err.trim()), crashed.err);
  const stillPreimage = JSON.parse(readFileSync(join(fx.dir, fx.manifestRel), "utf8"));
  ok("WRd the manifest bytes are untouched (the journal precedes the write)", stillPreimage.state === "draft", JSON.stringify(stillPreimage));

  const retry = applyCmd(fx.dir, ["--manifest", fx.manifestRel, "--next-state", "awaiting-approval", "--plan-sha256", digest], fx.deps);
  ok("WRd a retry while the journal is pending is refused and names it", retry.value === 2
    && /a recovery journal is already pending/.test(retry.err), retry.err);

  const recovered = recoverCmd(fx.dir, fx.deps);
  const report = JSON.parse(recovered.out || "{}");
  ok("WRd feature-package-recover diagnoses the retained journal as not-yet-applied", recovered.value === 2
    && report.schema === "pipeline.feature-package-recover.v1" && report.status === "retained"
    && report.diagnosis === "not-yet-applied" && report.transaction.manifest === fx.manifestRel, recovered.out);
  assertRetainedReportIsClean("WRd2", fx, recovered);
}

{
  // WRe -- interrupted AFTER the write, BEFORE readback/retirement: the journal is
  // retained even though the write itself already committed.
  const fx = seedFullFeaturePackage("wr-crash-after-write");
  const { digest } = planDigest(fx.dir, ["--manifest", fx.manifestRel, "--next-state", "awaiting-approval"]);
  const crashed = applyCmd(fx.dir, ["--manifest", fx.manifestRel, "--next-state", "awaiting-approval", "--plan-sha256", digest],
    { ...fx.deps, afterFeaturePackageApplyWrite: () => false });
  ok("WRe interrupted after the manifest write refuses, ending in 'recovery journal retained.'", crashed.value === 2
    && /interrupted after manifest write; recovery journal retained\.$/.test(crashed.err.trim()), crashed.err);
  const nowState = JSON.parse(readFileSync(join(fx.dir, fx.manifestRel), "utf8"));
  ok("WRe the manifest bytes already reflect the postimage", nowState.state === "awaiting-approval", JSON.stringify(nowState));
  const recovered = recoverCmd(fx.dir, fx.deps);
  const report = JSON.parse(recovered.out || "{}");
  ok("WRe recover diagnoses applied-pending-retirement", recovered.value === 2 && report.diagnosis === "applied-pending-retirement", recovered.out);
  assertRetainedReportIsClean("WRe2", fx, recovered);
}

{
  // WRf -- feature-package-recover reports clean and exits 0 when nothing is retained.
  const fx = seedFullFeaturePackage("wr-recover-clean");
  const clean = recoverCmd(fx.dir, fx.deps);
  const report = JSON.parse(clean.out || "{}");
  ok("WRf recover reports clean and exits 0 when no journal is retained", clean.value === 0
    && report.schema === "pipeline.feature-package-recover.v1" && report.status === "clean" && report.retained === false, clean.out);
}

{
  // WRg -- P-AC-08's forbidden route: a hand edit that only swaps an artifact digest
  // (exactly the shape a hand edit has already bypassed once in this repository) MUST
  // NOT stand in for the transaction -- it is refused because it changes the recomputed
  // preview digest, never accepted as "close enough".
  const fx = seedFullFeaturePackage("wr-forbidden-digest-replace");
  const { digest } = planDigest(fx.dir, ["--manifest", fx.manifestRel, "--next-state", "awaiting-approval"]);
  const tampered = JSON.parse(readFileSync(join(fx.dir, fx.manifestRel), "utf8"));
  tampered.artifacts[0] = { ...tampered.artifacts[0], sha256: "0".repeat(64) };
  writeFileSync(join(fx.dir, fx.manifestRel), `${JSON.stringify(tampered, null, 2)}\n`);
  const applied = applyCmd(fx.dir, ["--manifest", fx.manifestRel, "--next-state", "awaiting-approval", "--plan-sha256", digest], fx.deps);
  ok("WRg a manual artifact-digest replacement cannot stand in for the transaction", applied.value === 2
    && /does not match the freshly recomputed preview digest/.test(applied.err), applied.err);
  const stillTampered = JSON.parse(readFileSync(join(fx.dir, fx.manifestRel), "utf8"));
  ok("WRg the tampered manifest was not further mutated by the refused apply", stillTampered.artifacts[0].sha256 === "0".repeat(64), JSON.stringify(stillTampered));
}

{
  // WRi -- DoD 4: even if the write itself succeeds, a postimage that does not match
  // the digest the preview predicted is refused, never treated as a success.
  const fx = seedFullFeaturePackage("wr-readback-mismatch");
  const { digest } = planDigest(fx.dir, ["--manifest", fx.manifestRel, "--next-state", "awaiting-approval"]);
  const corrupted = applyCmd(fx.dir, ["--manifest", fx.manifestRel, "--next-state", "awaiting-approval", "--plan-sha256", digest], {
    ...fx.deps,
    replaceFeaturePackageApplyFdContents: (fd) => {
      const garbage = Buffer.from("not the predicted postimage");
      writeSync(fd, garbage, 0, garbage.length, 0);
      fsyncSync(fd);
    },
  });
  ok("WRi a postimage mismatching the predicted digest is refused, ending in 'recovery journal retained.'", corrupted.value === 2
    && /postimage readback did not match the predicted digest; recovery journal retained\.$/.test(corrupted.err.trim()), corrupted.err);
  const recovered = recoverCmd(fx.dir, fx.deps);
  const report = JSON.parse(recovered.out || "{}");
  ok("WRi recover diagnoses the corrupted write as diverged", recovered.value === 2 && report.diagnosis === "diverged", recovered.out);
  assertRetainedReportIsClean("WRi2", fx, recovered);
}

{
  // WRh -- every refusal NAMES the argument or condition at fault.
  const fx = seedFullFeaturePackage("wr-args");
  const noRoot = captureBoth(() => run(["feature-package-apply"]));
  ok("WRh apply refuses a missing --root by name", noRoot.value === 2 && /"--root <dir>" is required/.test(noRoot.err), noRoot.err);

  const noPlanSha = captureBoth(() => run(["feature-package-apply", "--root", fx.dir, "--manifest", fx.manifestRel, "--next-state", "awaiting-approval"], fx.deps));
  ok("WRh apply refuses a missing --plan-sha256 by name", noPlanSha.value === 2 && /"--plan-sha256 <sha256>" is required/.test(noPlanSha.err), noPlanSha.err);

  const badPlanSha = captureBoth(() => run(["feature-package-apply", "--root", fx.dir, "--manifest", fx.manifestRel, "--next-state", "awaiting-approval", "--plan-sha256", "not-a-digest"], fx.deps));
  ok("WRh apply refuses a malformed --plan-sha256 by name", badPlanSha.value === 2 && /"--plan-sha256 <sha256>" is required/.test(badPlanSha.err), badPlanSha.err);

  const unknownFlag = captureBoth(() => run(["feature-package-apply", "--root", fx.dir, "--bogus", "x"], fx.deps));
  ok("WRh apply refuses an unknown argument by name", unknownFlag.value === 2 && /unknown argument "--bogus"/.test(unknownFlag.err), unknownFlag.err);

  const recoverNoRoot = captureBoth(() => run(["feature-package-recover"]));
  ok("WRh recover refuses a missing --root by name", recoverNoRoot.value === 2 && /"--root <dir>" is required/.test(recoverNoRoot.err), recoverNoRoot.err);
}
}

// ---- PHX-0B: continuity-authority-revision-plan / -apply / -recover (PX0-AC-02..07) --------
// Cases are ordered by criterion: PX0-AC-02 first through PX0-AC-07 last, so a partial
// run still covers the criteria in dependency order rather than at random.
function stateBytes(dir) { return readFileSync(statePath(dir)); }
function stateSha256(dir) { return sha256Hex(stateBytes(dir)); }

function authorityDeps(dir, overrides = {}) {
  return {
    dir,
    now: () => "2026-08-08T12:00:00.000Z",
    ownerNonce: () => `nonce-${String(++nonceSequence).padStart(8, "0")}`,
    lockStaleMs: 30_000,
    gitCommonDir: () => ({ ok: true, path: join(dir, ".fake-git-common") }),
    gitCandidate: () => ({ ok: true, commit: "a".repeat(40), tree: "b".repeat(40) }),
    authorityRevisionApproval: (approval) => ({ ok: true, value: approval }),
    ...overrides,
  };
}

/** Sets up an active design-phase feature with a real PRD (technical-spec-sha256-marked)
 * and Spec on disk, and a valid continuity record via the real continuity-init writer
 * (never a hand-rolled State file) so every nested continuity validator is exercised. */
function seedAuthorityRevisionRoot(prefix, id = "ar-feat") {
  const dir = freshDir(prefix);
  mkdirSync(join(dir, ".fake-git-common"), { recursive: true });
  const specDir = `specs/${id}`;
  mkdirSync(join(dir, specDir), { recursive: true });
  const specText = `# ${id} Spec\n`;
  writeFileSync(join(dir, specDir, "spec.md"), specText);
  const specSha = sha256Hex(specText);
  const prdText = `# ${id} PRD\n<!-- technical-spec-sha256: ${specSha} -->\n`;
  writeFileSync(join(dir, specDir, `prd_${id}.md`), prdText);
  const prdSha = sha256Hex(prdText);
  const prdRel = `${specDir}/prd_${id}.md`;
  const specRel = `${specDir}/spec.md`;
  const deps = authorityDeps(dir);
  run(["set-feature", "--id", id, "--plan-path", prdRel], deps);
  const initial = {
    schema: "pipeline.continuity.v0", featureId: id, revision: 0,
    runtime: { humanFacingLanguage: "en", activeDuty: "Coordinator" },
    authority: { prd: { path: prdRel, sha256: prdSha }, spec: { path: specRel, sha256: specSha }, result: null },
    queueHead: { packageId: "P1", actionId: "continuity-writer", nextAction: "poll", productRetryCount: 0, environmentRerouteCount: 0, dispatch: null },
    blocker: null, acknowledgedFinal: null,
    resume: { mode: "immediate", sourceRevision: 0, reasonCode: "active-turn" },
    recovery: null, decisionTxn: null,
    capacity: { concurrencyLimit: 3, reservedCriticSlots: 1, reservedRecoverySlots: 1, fallbackPolicy: "defer" },
  };
  writeFileSync(join(dir, "ar-init-request.json"), `${JSON.stringify(initial, null, 2)}\n`);
  const initCode = run(["continuity-init", "--expected-revision", "absent", "--request-file", "ar-init-request.json", "--lock-token", "token-00000001"], deps);
  return { dir, id, prdRel, specRel, prdSha, specSha, prdText, specText, deps, initCode };
}

/** Revises the PRD's on-disk bytes IN PLACE (same path, new content -> new digest) and
 * returns a well-formed proposal binding the CURRENT (pre-revision) authority to it. */
function reviseProposal(fx, overrides = {}) {
  const revisedText = `# ${fx.id} PRD (revised)\n<!-- technical-spec-sha256: ${fx.specSha} -->\n`;
  writeFileSync(join(fx.dir, fx.prdRel), revisedText);
  const revisedSha = sha256Hex(revisedText);
  return {
    proposal: {
      schema: "pipeline.continuity-authority-revision-request.v1",
      featureId: fx.id,
      expectedRevision: 0,
      preStateSha256: stateSha256(fx.dir),
      oldAuthority: { prd: { path: fx.prdRel, sha256: fx.prdSha }, spec: { path: fx.specRel, sha256: fx.specSha } },
      nextAuthority: { prd: { path: fx.prdRel, sha256: revisedSha }, spec: { path: fx.specRel, sha256: fx.specSha } },
      decision: { id: "decision-01", sha256: "c".repeat(64), scope: { featureId: fx.id, phase: "design" } },
      candidate: { commit: "a".repeat(40), tree: "b".repeat(40) },
      evidence: { sha256: "e".repeat(64) },
      idempotencyKey: "ar-revision-001",
      expiresAt: "2026-08-09T00:00:00.000Z",
      ...overrides,
    },
    revisedSha,
  };
}
function writeProposal(fx, proposal, name = "ar-proposal.json") {
  writeFileSync(join(fx.dir, name), `${JSON.stringify(proposal, null, 2)}\n`);
  return name;
}
function planCmd(fx, proposalFile) { return captureBoth(() => run(["continuity-authority-revision-plan", "--proposal-file", proposalFile], fx.deps)); }
function arApplyCmd(fx, requestFile, requestSha256, lockToken = "ar-lock-001", deps = fx.deps) {
  return captureBoth(() => run(["continuity-authority-revision-apply", "--request-file", requestFile, "--request-sha256", requestSha256, "--lock-token", lockToken], deps));
}
function arRecoverCmd(fx, lockToken = "ar-lock-001", deps = fx.deps) {
  return captureBoth(() => run(["continuity-authority-revision-recover", "--lock-token", lockToken], deps));
}
function writeRequestFile(fx, requestDoc, name = "ar-request.json") {
  const bytes = `${JSON.stringify(requestDoc, null, 2)}\n`;
  writeFileSync(join(fx.dir, name), bytes);
  return { name, sha256: sha256Hex(Buffer.from(bytes, "utf8")) };
}

/** Full happy-path setup: fixture, a valid plan, and its request file. Does NOT apply. */
function preparedRevision(prefix, id = "ar-feat") {
  const fx = seedAuthorityRevisionRoot(prefix, id);
  const { proposal } = reviseProposal(fx);
  const proposalFile = writeProposal(fx, proposal);
  const planned = planCmd(fx, proposalFile);
  const plan = JSON.parse(planned.out || "{}");
  const request = writeRequestFile(fx, plan);
  return { fx, proposal, planned, plan, request };
}

function runAuthorityRevisionTests() {

// ---- PX0-AC-01: a generic continuity CAS that rewrites prd/spec authority is refused; only the sanctioned revision path may move it ----
{
  const fx = seedAuthorityRevisionRoot("ar01-generic-cas-authority");
  const current = JSON.parse(stateBytes(fx.dir).toString("utf8")).continuity;
  const preBytes = stateBytes(fx.dir);
  const forgedPrd = structuredClone(current);
  forgedPrd.revision = 1;
  forgedPrd.authority = { ...forgedPrd.authority, prd: { ...forgedPrd.authority.prd, sha256: "d".repeat(64) } };
  const prdRejected = captureBoth(() => run(continuityArgs("continuity-cas", 0, writeRequest(fx.dir, "ar01-forged-prd", forgedPrd)), fx.deps));
  ok("AR01a a generic continuity-cas that rewrites authority.prd outside the sanctioned revision path is refused (CS-PROTECTED-AUTHORITY)",
    prdRejected.value === 2 && /CS-PROTECTED-AUTHORITY/.test(prdRejected.err), prdRejected.err);
  ok("AR01b State bytes are untouched after the refused generic PRD-authority CAS", stateBytes(fx.dir).equals(preBytes), "state mutated by generic CAS authority change");

  const forgedSpec = structuredClone(current);
  forgedSpec.revision = 1;
  forgedSpec.authority = { ...forgedSpec.authority, spec: { ...forgedSpec.authority.spec, sha256: "e".repeat(64) } };
  const specRejected = captureBoth(() => run(continuityArgs("continuity-cas", 0, writeRequest(fx.dir, "ar01-forged-spec", forgedSpec)), fx.deps));
  ok("AR01c a generic continuity-cas that rewrites authority.spec outside the sanctioned revision path is refused (CS-PROTECTED-AUTHORITY)",
    specRejected.value === 2 && /CS-PROTECTED-AUTHORITY/.test(specRejected.err), specRejected.err);
  ok("AR01d State bytes are untouched after the refused generic Spec-authority CAS", stateBytes(fx.dir).equals(preBytes), "state mutated by generic CAS authority change");
}

// ---- PX0-AC-02: plan emits one closed read-only request; writes no State ----
{
  const before = seedAuthorityRevisionRoot("ar02-plan");
  const preBytes = stateBytes(before.dir);
  const { proposal } = reviseProposal(before);
  const proposalFile = writeProposal(before, proposal);
  const planned = planCmd(before, proposalFile);
  const plan = JSON.parse(planned.out || "{}");
  ok("AR02a plan exit 0 and emits pipeline.continuity-authority-revision-plan.v1", planned.value === 0
    && plan.schema === "pipeline.continuity-authority-revision-plan.v1", planned.err);
  ok("AR02b plan intent binds featureId/revision/preStateSha256/oldAuthority/nextAuthority/decision/candidate/evidence/idempotencyKey/expiresAt",
    plan.intent?.featureId === before.id && plan.intent?.expectedRevision === 0 && plan.intent?.preStateSha256 === proposal.preStateSha256
    && JSON.stringify(plan.intent?.oldAuthority) === JSON.stringify(proposal.oldAuthority)
    && JSON.stringify(plan.intent?.nextAuthority) === JSON.stringify(proposal.nextAuthority)
    && JSON.stringify(plan.intent?.decision) === JSON.stringify(proposal.decision)
    && JSON.stringify(plan.intent?.candidate) === JSON.stringify(proposal.candidate)
    && JSON.stringify(plan.intent?.evidence) === JSON.stringify(proposal.evidence)
    && plan.intent?.idempotencyKey === proposal.idempotencyKey && plan.intent?.expiresAt === proposal.expiresAt,
    JSON.stringify(plan.intent));
  ok("AR02c plan writes NO State (byte-identical before/after)", stateBytes(before.dir).equals(preBytes), "state bytes changed");
}

// ---- PX0-AC-03: apply rechecks under the lifecycle writer lock, publishes atomically, reads back the new authority ----
{
  const { fx, plan, request } = preparedRevision("ar03-apply-ok");
  const applied = arApplyCmd(fx, request.name, request.sha256);
  const receipt = JSON.parse(applied.out || "{}");
  ok("AR03a apply succeeds and returns status applied with the new revision", applied.value === 0
    && receipt.schema === "pipeline.continuity-authority-revision-apply.v1" && receipt.status === "applied"
    && receipt.mutated === true && receipt.revision === 1, applied.out || applied.err);
  const persisted = JSON.parse(stateBytes(fx.dir).toString("utf8"));
  ok("AR03b the persisted State's continuity.authority reads back the exact new authority", persisted.continuity.revision === 1
    && JSON.stringify(persisted.continuity.authority.prd) === JSON.stringify(plan.postimage.authority.prd)
    && JSON.stringify(persisted.continuity.authority.spec) === JSON.stringify(plan.postimage.authority.spec), JSON.stringify(persisted.continuity.authority));
}
{
  // AR03c -- apply RECHECKS at apply time: a fresh drift after plan (not just at plan time) is caught.
  const { fx, request } = preparedRevision("ar03-toctou");
  const preBytes = stateBytes(fx.dir);
  writeFileSync(join(fx.dir, fx.prdRel), "# drifted again after plan\n");
  const applied = arApplyCmd(fx, request.name, request.sha256);
  ok("AR03c a next-authority artifact drift AFTER plan (TOCTOU) is refused at apply time, zero mutation", applied.value === 2
    && /AR-NEXT-AUTHORITY-STALE/.test(applied.err), applied.err);
  ok("AR03d State is untouched after the TOCTOU refusal", stateBytes(fx.dir).equals(preBytes), "state mutated despite refusal");
}
{
  // AR03e-g -- apply RECHECKS the State preimage itself at apply time (not just the next-authority
  // artifact AR03c already covers): a legitimate OTHER continuity mutation landing between plan and
  // apply (revision advances, authority untouched) is caught by apply's OWN fresh rebuild against
  // current reality, not trusted from the now-stale plan.
  const { fx, request } = preparedRevision("ar03-state-preimage-toctou");
  const current = JSON.parse(stateBytes(fx.dir).toString("utf8")).continuity;
  const advanced = structuredClone(current);
  advanced.revision = 1;
  advanced.resume = { ...advanced.resume, sourceRevision: 1 };
  const casCode = run(continuityArgs("continuity-cas", 0, writeRequest(fx.dir, "ar03-advanced-cas", advanced)), fx.deps);
  ok("AR03e-setup an unrelated continuity-cas advances State to revision 1 before apply", casCode === 0, `got ${casCode}`);
  const preBytes = stateBytes(fx.dir);
  const applied = arApplyCmd(fx, request.name, request.sha256);
  ok("AR03f apply's own fresh recheck (not the stale plan) catches the State preimage drift and refuses (AR-REVISION-STALE)",
    applied.value === 2 && /AR-REVISION-STALE/.test(applied.err), applied.err);
  ok("AR03g State is untouched after the preimage-drift refusal", stateBytes(fx.dir).equals(preBytes), "state mutated despite refusal");
}
{
  // AR03h -- the one remaining unpinned recheck axis: the active feature's phase moves
  // away from "design" (via the SANCTIONED plan-approval lifecycle, not a hand-rolled
  // edit -- AR01 already covers hand-rolled edits through a different path) between plan
  // and apply. Apply's own fresh rebuild must catch this via AR-DECISION-SCOPE, which
  // fires BEFORE the revision/preState staleness checks that the lifecycle transition's
  // own State writes would otherwise trip first.
  const { fx, request } = preparedRevision("ar03-decision-scope");
  const lifecycleDepsForFx = lifecycleDeps(fx.dir, fx.prdRel);
  const submitted = run(["submit-plan", "--by", "coordinator", "--profile", "feature"], lifecycleDepsForFx);
  const approved = run(["approve-plan", "--by", "po-test"], lifecycleDepsForFx);
  const phased = run(["set-phase", "--phase", "implementation"], lifecycleDepsForFx);
  ok("AR03h-setup a real plan-approval lifecycle moves the active feature to implementation phase after the AR plan was already built",
    submitted === 0 && approved === 0 && phased === 0, `submit=${submitted} approve=${approved} phase=${phased}`);
  const preBytes = stateBytes(fx.dir);
  const applied = arApplyCmd(fx, request.name, request.sha256);
  ok("AR03h PX0-AC-03: apply refuses (AR-DECISION-SCOPE) when the active feature's phase has moved away from design between plan and apply",
    applied.value === 2 && /AR-DECISION-SCOPE/.test(applied.err), applied.err);
  ok("AR03i State is untouched by the refused apply itself", stateBytes(fx.dir).equals(preBytes), "state mutated despite refusal");
}

// ---- PX0-AC-04: named fail-closed cases; State unchanged and no revised authority claimed ----
{
  const fx = seedAuthorityRevisionRoot("ar04-feature-mismatch");
  // Both the top-level featureId and decision.scope.featureId must agree (the closed
  // intent schema itself requires that self-consistency); the mismatch under test is
  // against the ACTUAL active feature in State, which stays "ar-feat".
  const { proposal } = reviseProposal(fx, {
    featureId: "some-other-feature",
    decision: { id: "decision-01", sha256: "c".repeat(64), scope: { featureId: "some-other-feature", phase: "design" } },
  });
  const preBytes = stateBytes(fx.dir);
  const planned = planCmd(fx, writeProposal(fx, proposal));
  ok("AR04a mismatched featureId is refused (AR-FEATURE-MISMATCH), zero mutation", planned.value === 2
    && /AR-FEATURE-MISMATCH/.test(planned.err) && stateBytes(fx.dir).equals(preBytes), planned.err);
}
{
  const fx = seedAuthorityRevisionRoot("ar04-revision-stale");
  const { proposal } = reviseProposal(fx, { expectedRevision: 7 });
  const planned = planCmd(fx, writeProposal(fx, proposal));
  ok("AR04b stale expectedRevision is refused (AR-REVISION-STALE)", planned.value === 2 && /AR-REVISION-STALE/.test(planned.err), planned.err);
}
{
  const fx = seedAuthorityRevisionRoot("ar04-prestate-stale");
  const { proposal } = reviseProposal(fx, { preStateSha256: "f".repeat(64) });
  const planned = planCmd(fx, writeProposal(fx, proposal));
  ok("AR04c stale preStateSha256 is refused (AR-PRESTATE-STALE)", planned.value === 2 && /AR-PRESTATE-STALE/.test(planned.err), planned.err);
}
{
  const fx = seedAuthorityRevisionRoot("ar04-old-authority-stale");
  const { proposal } = reviseProposal(fx, { oldAuthority: { prd: { path: fx.prdRel, sha256: "9".repeat(64) }, spec: { path: fx.specRel, sha256: fx.specSha } } });
  const planned = planCmd(fx, writeProposal(fx, proposal));
  ok("AR04d old-authority digest mismatch vs live State is refused (AR-OLD-AUTHORITY-STALE)", planned.value === 2 && /AR-OLD-AUTHORITY-STALE/.test(planned.err), planned.err);
}
{
  const fx = seedAuthorityRevisionRoot("ar04-next-authority-stale");
  const { proposal } = reviseProposal(fx, { nextAuthority: { prd: { path: fx.prdRel, sha256: "8".repeat(64) }, spec: { path: fx.specRel, sha256: fx.specSha } } });
  const planned = planCmd(fx, writeProposal(fx, proposal));
  ok("AR04e new-authority digest not matching the actual current file bytes is refused (AR-NEXT-AUTHORITY-STALE)", planned.value === 2
    && /AR-NEXT-AUTHORITY-STALE/.test(planned.err), planned.err);
}
{
  const fx = seedAuthorityRevisionRoot("ar04-expired");
  const { proposal } = reviseProposal(fx, { expiresAt: "2020-01-01T00:00:00.000Z" });
  const planned = planCmd(fx, writeProposal(fx, proposal));
  ok("AR04f an already-expired expiresAt is refused (AR-EXPIRED)", planned.value === 2 && /AR-EXPIRED/.test(planned.err), planned.err);
}
{
  const fx = seedAuthorityRevisionRoot("ar04-candidate-stale");
  const { proposal } = reviseProposal(fx, { candidate: { commit: "9".repeat(40), tree: "8".repeat(40) } });
  const planned = planCmd(fx, writeProposal(fx, proposal));
  ok("AR04g a candidate not matching the observed git candidate is refused (AR-CANDIDATE-STALE)", planned.value === 2
    && /AR-CANDIDATE-STALE/.test(planned.err), planned.err);
}
{
  const fx = seedAuthorityRevisionRoot("ar04-decision-scope");
  const { proposal } = reviseProposal(fx, { decision: { id: "decision-01", sha256: "c".repeat(64), scope: { featureId: fx.id, phase: "implementation" } } });
  const planned = planCmd(fx, writeProposal(fx, proposal));
  ok("AR04h an out-of-scope decision phase is refused closed (the closed intent shape itself fixes phase=design)", planned.value === 2
    && /AR-INTENT-INVALID/.test(planned.err), planned.err);
}
{
  // AR04i -- an idempotency key reused with a DIFFERENT intent after the first has already
  // moved State forward fails closed via the same revision/preState binding, not a second
  // registry: the reused key's stale expectedRevision/preStateSha256 no longer match reality.
  const { fx, request } = preparedRevision("ar04-idempotency-reuse");
  const first = arApplyCmd(fx, request.name, request.sha256);
  ok("AR04i-setup first apply succeeds", first.value === 0, first.err);
  const { proposal: second } = reviseProposal(fx, { idempotencyKey: "ar-revision-001", nextAuthority: { prd: { path: fx.prdRel, sha256: "7".repeat(64) }, spec: { path: fx.specRel, sha256: fx.specSha } } });
  const secondPlanned = planCmd(fx, writeProposal(fx, second, "ar-proposal-2.json"));
  ok("AR04i a different proposal reusing the same idempotencyKey against now-stale revision/preState fails closed",
    secondPlanned.value === 2 && /AR-REVISION-STALE/.test(secondPlanned.err), secondPlanned.err);
}

// ---- PX0-AC-05: a public-safe correlated receipt -- absence of private data, not just presence of good fields ----
{
  const { fx, plan, request } = preparedRevision("ar05-receipt-privacy");
  const applied = arApplyCmd(fx, request.name, request.sha256);
  const receipt = JSON.parse(applied.out || "{}").receipt;
  ok("AR05a receipt has the stable operation/reason classes, references and a typed outcome",
    receipt?.operation === "continuity-authority-revision" && receipt?.reasonClass === "design-authority-revision"
    && receipt?.featureId === fx.id && !!receipt?.decision && !!receipt?.candidate && !!receipt?.evidence
    && !!receipt?.oldAuthority && !!receipt?.nextAuthority, JSON.stringify(receipt));
  const receiptText = JSON.stringify(receipt);
  const planText = JSON.stringify(plan);
  const bannedNeedles = [fx.dir, "/home/", "/tmp/", process.cwd()];
  const receiptClean = bannedNeedles.every((needle) => !receiptText.includes(needle)) && !/"root"\s*:/.test(receiptText) && !Object.hasOwn(receipt ?? {}, "dir");
  const planClean = bannedNeedles.every((needle) => !planText.includes(needle)) && !/"root"\s*:/.test(planText);
  ok("AR05b the apply receipt contains NO absolute path, repo root, /home/, /tmp/ or a root/dir key", receiptClean, receiptText);
  ok("AR05c the plan payload (the pre-image of the receipt) is equally free of any absolute path or root/dir key", planClean, planText.slice(0, 400));
}

// AR05g -- PX0-AC-05 security fix (022718b0): a decision.id crafted as an absolute
// filesystem path is refused closed by the same slug-shape validation already applied
// to featureId/idempotencyKey, and State is left byte-for-byte unchanged.
{
  const fx = seedAuthorityRevisionRoot("ar05-decision-id-path-injection");
  const preBytes = stateBytes(fx.dir);
  const { proposal } = reviseProposal(fx, { decision: { id: "/home/attacker/secret-project/notes.txt", sha256: "c".repeat(64), scope: { featureId: fx.id, phase: "design" } } });
  const planned = planCmd(fx, writeProposal(fx, proposal));
  ok("AR05g a decision.id crafted as an absolute path is refused closed (AR-INTENT-INVALID)",
    planned.value === 2 && /AR-INTENT-INVALID/.test(planned.err), planned.err);
  ok("AR05g refusing the hostile decision.id leaves State byte-for-byte unchanged",
    stateBytes(fx.dir).equals(preBytes), "state mutated by a rejected plan");
}

// ---- PX0-AC-05 (durable retention): the receipt survives independently of the private
// journal (retired on success) and of stdout -- read back from State itself. ----
{
  const { fx, plan, request } = preparedRevision("ar05-durable-receipt");
  const applied = arApplyCmd(fx, request.name, request.sha256);
  ok("AR05d-setup apply succeeds", applied.value === 0, applied.err);
  const persisted = JSON.parse(stateBytes(fx.dir).toString("utf8"));
  const stored = (persisted.authorityRevisionReceipts ?? []).find((entry) => entry.intentSha256 === plan.intentSha256);
  ok("AR05d PX0-AC-05: the receipt is durably retained in State (not only journal/stdout), correlated via intentSha256",
    !!stored && stored.operation === "continuity-authority-revision" && stored.reasonClass === "design-authority-revision"
    && stored.featureId === fx.id && JSON.stringify(stored.nextAuthority) === JSON.stringify(plan.receipt.nextAuthority),
    JSON.stringify(persisted.authorityRevisionReceipts));
  const journalPath = join(fx.dir, ".fake-git-common", "agent-pipeline", "continuity-authority-revision", "journal");
  ok("AR05e the private recovery journal is retired after a clean apply -- AR05d's receipt above was read from State, not from it",
    !existsSync(journalPath), journalPath);
}
{
  // AR05f -- the SAME durable receipt is also retained when recovery completes forward to
  // the postimage (not only on a fresh, uninterrupted apply): the receipt was already
  // spliced into the journaled postimage bytes at apply-rebuild time, so recovery's replay
  // of those exact frozen bytes carries it through without a second write pass.
  const { fx, plan, request } = preparedRevision("ar05-durable-receipt-recovered");
  const interrupted = arApplyCmd(fx, request.name, request.sha256, "ar-lock-001", authorityDeps(fx.dir, { afterAuthorityRevisionJournal: () => false }));
  ok("AR05f-setup apply interrupted after journal publication", interrupted.value === 2, interrupted.err);
  const recovered = arRecoverCmd(fx);
  ok("AR05f-setup2 recover rolls forward to the postimage", recovered.value === 0
    && JSON.parse(recovered.out || "{}").status === "recovered-postimage", recovered.out || recovered.err);
  const persisted = JSON.parse(stateBytes(fx.dir).toString("utf8"));
  const stored = (persisted.authorityRevisionReceipts ?? []).find((entry) => entry.intentSha256 === plan.intentSha256);
  ok("AR05f PX0-AC-05: the receipt is durably retained in State even when the postimage is reached via recovery, not a fresh apply",
    !!stored && stored.featureId === fx.id, JSON.stringify(persisted.authorityRevisionReceipts));
}

// ---- PX0-AC-06: typed recovery-required state; recovers only to the exact preimage or postimage; no new candidate, no trusting a temp file ----
{
  const recoverClean = seedAuthorityRevisionRoot("ar06-clean");
  const recovered = arRecoverCmd(recoverClean);
  const report = JSON.parse(recovered.out || "{}");
  ok("AR06a recover with no retained journal reports status clean", recovered.value === 0 && report.status === "clean" && report.retained === false, recovered.out);
}
{
  // AR06b -- interrupted AFTER the journal is published but BEFORE the State write:
  // apply refuses, State is untouched (still the preimage). Recover then completes the
  // transaction using ONLY the frozen journal bytes: a stray same-shaped temp file next
  // to the State path, and a git candidate that would no longer validate, must not change
  // the outcome -- proving neither is consulted.
  const { fx, plan, request } = preparedRevision("ar06-rollforward");
  const preBytes = stateBytes(fx.dir);
  const interrupted = arApplyCmd(fx, request.name, request.sha256, "ar-lock-001", authorityDeps(fx.dir, { afterAuthorityRevisionJournal: () => false }));
  ok("AR06b-1 apply interrupted after journal publication refuses and names the journal as retained", interrupted.value === 2
    && /interrupted after journal preparation; recovery journal retained\.$/.test(interrupted.err.trim()), interrupted.err);
  ok("AR06b-2 State is still exactly the preimage after the interruption", stateBytes(fx.dir).equals(preBytes), "state mutated despite interruption");
  writeFileSync(`${statePath(fx.dir)}.tmp.decoy`, Buffer.from(JSON.stringify({ decoy: true }), "utf8"));
  const driftedCandidateDeps = authorityDeps(fx.dir, { gitCandidate: () => ({ ok: true, commit: "f".repeat(40), tree: "f".repeat(40) }) });
  const recovered = arRecoverCmd(fx, "ar-lock-001", driftedCandidateDeps);
  const report = JSON.parse(recovered.out || "{}");
  ok("AR06b-3 recover rolls forward to the exact intended postimage despite a decoy temp file AND a since-changed git candidate",
    recovered.value === 0 && report.status === "recovered-postimage" && report.mutated === true, recovered.out || recovered.err);
  const persisted = JSON.parse(stateBytes(fx.dir).toString("utf8"));
  ok("AR06b-4 the persisted State now carries exactly the planned postimage authority", persisted.continuity.revision === 1
    && JSON.stringify(persisted.continuity.authority.prd) === JSON.stringify(plan.postimage.authority.prd), JSON.stringify(persisted.continuity.authority));
  const again = arRecoverCmd(fx);
  ok("AR06b-5 a second recover afterwards reports clean (journal retired)", JSON.parse(again.out || "{}").status === "clean", again.out);
}
{
  // AR06c -- interrupted AFTER the State write but BEFORE the confirmed readback retires
  // the journal: State is already the postimage; recover only needs to retire.
  const { fx, request } = preparedRevision("ar06-retire");
  const interrupted = arApplyCmd(fx, request.name, request.sha256, "ar-lock-001", authorityDeps(fx.dir, { afterAuthorityRevisionWrite: () => false }));
  ok("AR06c-1 apply interrupted after the State write refuses and names the journal as retained", interrupted.value === 2
    && /interrupted after State write; recovery journal retained\.$/.test(interrupted.err.trim()), interrupted.err);
  const recovered = arRecoverCmd(fx);
  const report = JSON.parse(recovered.out || "{}");
  ok("AR06c-2 recover finds the durable stage already reached and only retires (mutated: false)", recovered.value === 0
    && report.status === "recovered-postimage" && report.mutated === false, recovered.out);
}
{
  // AR06d -- while a journal is pending, State is externally mutated to a THIRD value that
  // is neither the retained preimage nor the retained postimage: recover must diverge, not
  // guess, and must not write.
  const { fx, request } = preparedRevision("ar06-diverged");
  arApplyCmd(fx, request.name, request.sha256, "ar-lock-001", authorityDeps(fx.dir, { afterAuthorityRevisionJournal: () => false }));
  const outside = JSON.parse(stateBytes(fx.dir).toString("utf8"));
  outside.updatedAt = "2099-01-01T00:00:00.000Z";
  writeFileSync(statePath(fx.dir), `${JSON.stringify(outside, null, 2)}\n`);
  const before = stateBytes(fx.dir);
  const recovered = arRecoverCmd(fx);
  const report = JSON.parse(recovered.out || "{}");
  ok("AR06d recover reports diverged and retains the journal rather than guessing", recovered.value === 2
    && report.status === "diverged" && report.retained === true, recovered.out);
  ok("AR06d recover attempted zero writes on divergence", stateBytes(fx.dir).equals(before), "state changed during a diverged diagnosis");
}
{
  // AR06e -- PX0-AC-06's new genuine "recovered-preimage" outcome: the frozen intent's own
  // expiresAt has passed BY THE TIME RECOVERY RUNS (not at plan/apply time -- both of those
  // still succeeded against the injected clock they saw). Recovery must NOT complete
  // forward to the postimage in this case: it retires the journal and reports
  // recovered-preimage, mutated:false, leaving State exactly the preimage. This is the
  // ONE fresh binding check recovery performs -- no candidate re-derivation, no
  // AR-DECISION-SCOPE re-check.
  const fx = seedAuthorityRevisionRoot("ar06-expired-preimage");
  const { proposal } = reviseProposal(fx, { expiresAt: "2026-08-08T12:00:05.000Z" });
  const proposalFile = writeProposal(fx, proposal);
  const planned = planCmd(fx, proposalFile);
  const plan = JSON.parse(planned.out || "{}");
  const request = writeRequestFile(fx, plan);
  ok("AR06e-setup0 plan still valid against the fixed 12:00:00 clock (expires 12:00:05)", planned.value === 0, planned.err);
  const preBytes = stateBytes(fx.dir);
  const interrupted = arApplyCmd(fx, request.name, request.sha256, "ar-lock-001", authorityDeps(fx.dir, { afterAuthorityRevisionJournal: () => false }));
  ok("AR06e-setup1 apply interrupted after journal publication, State still exactly the preimage",
    interrupted.value === 2 && stateBytes(fx.dir).equals(preBytes), interrupted.err);
  const expiredDeps = authorityDeps(fx.dir, { now: () => "2026-08-08T12:00:10.000Z" });
  const recovered = arRecoverCmd(fx, "ar-lock-001", expiredDeps);
  const report = JSON.parse(recovered.out || "{}");
  ok("AR06e PX0-AC-06: recover reports recovered-preimage (not recovered-postimage) once the frozen decision's expiresAt has passed",
    recovered.value === 0 && report.status === "recovered-preimage" && report.retained === false && report.mutated === false
    && !!report.receipt && report.receipt.featureId === fx.id, recovered.out || recovered.err);
  ok("AR06e-2 State remains byte-identical to the preimage -- the postimage was NOT written",
    stateBytes(fx.dir).equals(preBytes), "state mutated despite an expired recovery window");
  const again = arRecoverCmd(fx, "ar-lock-001", expiredDeps);
  ok("AR06e-3 a second recover afterwards reports clean (journal retired)", JSON.parse(again.out || "{}").status === "clean", again.out);
}
{
  // AR06f -- confirms the EXISTING recovered-postimage path (AR06b) is genuinely
  // unchanged: the same interrupted-after-journal setup, but recovered BEFORE the frozen
  // expiresAt passes, still rolls forward to the postimage exactly as before PX0-AC-06.
  const { fx, plan, request } = preparedRevision("ar06-not-yet-expired-postimage");
  const interrupted = arApplyCmd(fx, request.name, request.sha256, "ar-lock-001", authorityDeps(fx.dir, { afterAuthorityRevisionJournal: () => false }));
  ok("AR06f-setup apply interrupted after journal publication", interrupted.value === 2, interrupted.err);
  const recovered = arRecoverCmd(fx);
  const report = JSON.parse(recovered.out || "{}");
  ok("AR06f PX0-AC-06: recover still rolls forward to recovered-postimage when the frozen expiresAt has NOT yet passed",
    recovered.value === 0 && report.status === "recovered-postimage" && report.mutated === true, recovered.out || recovered.err);
  const persisted = JSON.parse(stateBytes(fx.dir).toString("utf8"));
  ok("AR06f-2 the persisted State carries exactly the planned postimage authority", persisted.continuity.revision === 1
    && JSON.stringify(persisted.continuity.authority.prd) === JSON.stringify(plan.postimage.authority.prd), JSON.stringify(persisted.continuity.authority));
}
{
  // AR06g -- PX0-AC-06 casOutcome regression (PHX-WP-PX0-CASOUTCOME): on the SAME
  // recovered-preimage branch AR06e exercises, the CLI's echoed `receipt.casOutcome` must
  // read "stale", not the frozen journal's own "applied" (buildAuthorityRevisionPlan
  // always freezes casOutcome:"applied" at apply-build time, before it is known whether
  // the write will land -- see runAuthorityRevisionRecoverCommand's
  // "F4/courseDecisionReceipts convention" comment). Echoing the frozen receipt unmodified
  // here would contradict this same response's own status:"recovered-preimage"/
  // mutated:false: the postimage was never written. Same fixture construction as AR06e
  // (an expiresAt that has passed BY THE TIME RECOVERY RUNS), asserted alongside the
  // existing status/mutated invariant rather than replacing it.
  const fx = seedAuthorityRevisionRoot("ar06g-casoutcome-stale");
  const { proposal } = reviseProposal(fx, { expiresAt: "2026-08-08T12:00:05.000Z" });
  const proposalFile = writeProposal(fx, proposal);
  const planned = planCmd(fx, proposalFile);
  const plan = JSON.parse(planned.out || "{}");
  ok("AR06g-setup0 plan still valid against the fixed 12:00:00 clock (expires 12:00:05)", planned.value === 0, planned.err);
  ok("AR06g-setup1 the frozen plan's own receipt carries casOutcome \"applied\" (the value this branch must NOT echo)",
    plan.receipt?.casOutcome === "applied", JSON.stringify(plan.receipt));
  const request = writeRequestFile(fx, plan);
  const preBytes = stateBytes(fx.dir);
  const interrupted = arApplyCmd(fx, request.name, request.sha256, "ar-lock-001", authorityDeps(fx.dir, { afterAuthorityRevisionJournal: () => false }));
  ok("AR06g-setup2 apply interrupted after journal publication, State still exactly the preimage",
    interrupted.value === 2 && stateBytes(fx.dir).equals(preBytes), interrupted.err);
  const expiredDeps = authorityDeps(fx.dir, { now: () => "2026-08-08T12:00:10.000Z" });
  const recovered = arRecoverCmd(fx, "ar-lock-001", expiredDeps);
  const report = JSON.parse(recovered.out || "{}");
  ok("AR06g PX0-AC-06 casOutcome regression: recovered-preimage echoes receipt.casOutcome \"stale\", alongside the existing status/mutated invariant (not weakened, added to)",
    recovered.value === 0 && report.status === "recovered-preimage" && report.retained === false && report.mutated === false
    && !!report.receipt && report.receipt.casOutcome === "stale", recovered.out || recovered.err);
  ok("AR06g-2 State remains byte-identical to the preimage -- the postimage was NOT written",
    stateBytes(fx.dir).equals(preBytes), "state mutated despite an expired recovery window");
}
{
  // AR06h -- PX0-AC-06/F2 legacy `.v1` journal regression (PHX-WP-PX0-V1JOURNAL-TESTS): a
  // journal predating `expiresAt` (the 8-key shape: schema/intentSha256/planSha256/
  // preStateSha256/postStateSha256/postStateBase64/receipt/mac -- no expiresAt) must still
  // LOAD and complete recovery. loadAuthorityRevisionJournal maps it to the in-memory
  // `expiresAt: null` sentinel, which runAuthorityRevisionRecoverCommand treats as "always
  // still valid, never taking the expired-preimage branch" -- preserving the OLD
  // unconditional-roll-forward behavior for this one legacy shape only. Built by
  // interrupting apply after journal publication (the AR06b/AR06f pattern) to get a
  // genuine `.v2` journal + on-disk 32-byte HMAC key, then hand-rewriting the persisted
  // journal into the `.v1` shape using that SAME key, re-MACed correctly so the loader's
  // MAC check still verifies.
  const { fx, plan, request } = preparedRevision("ar06h-v1-journal-loads");
  const preBytes = stateBytes(fx.dir);
  const interrupted = arApplyCmd(fx, request.name, request.sha256, "ar-lock-001", authorityDeps(fx.dir, { afterAuthorityRevisionJournal: () => false }));
  ok("AR06h-setup1 apply interrupted after journal publication, State still exactly the preimage",
    interrupted.value === 2 && stateBytes(fx.dir).equals(preBytes), interrupted.err);
  const journalBase = join(fx.dir, ".fake-git-common", "agent-pipeline", "continuity-authority-revision");
  const journalPath = join(journalBase, "journal");
  const keyPath = join(journalBase, "key");
  const v2 = JSON.parse(readFileSync(journalPath, "utf8"));
  ok("AR06h-setup2 the genuine interrupted journal is v2-shaped with a frozen expiresAt (setup sanity)",
    v2.schema === "pipeline.continuity-authority-revision-journal.v2" && typeof v2.expiresAt === "string", JSON.stringify(v2));
  const key = readFileSync(keyPath);
  ok("AR06h-setup3 the on-disk HMAC key is the expected 32 bytes", key.byteLength === 32, String(key.byteLength));
  const v1Core = {
    schema: "pipeline.continuity-authority-revision-journal.v1",
    intentSha256: v2.intentSha256,
    planSha256: v2.planSha256,
    preStateSha256: v2.preStateSha256,
    postStateSha256: v2.postStateSha256,
    postStateBase64: v2.postStateBase64,
    receipt: v2.receipt,
  };
  const v1Mac = createHmac("sha256", key).update(JSON.stringify(v1Core)).digest("hex");
  writeFileSync(journalPath, `${JSON.stringify({ ...v1Core, mac: v1Mac })}\n`);
  chmodSync(journalPath, 0o600);
  const recovered = arRecoverCmd(fx);
  const report = JSON.parse(recovered.out || "{}");
  ok("AR06h PX0-AC-06/F2: a .v1-shaped legacy journal loads via the expiresAt:null sentinel and completes recovery to the postimage",
    recovered.value === 0 && report.status === "recovered-postimage" && report.retained === false && report.mutated === true, recovered.out || recovered.err);
  const persisted = JSON.parse(stateBytes(fx.dir).toString("utf8"));
  ok("AR06h-2 the persisted State carries exactly the planned postimage authority", persisted.continuity.revision === 1
    && JSON.stringify(persisted.continuity.authority.prd) === JSON.stringify(plan.postimage.authority.prd), JSON.stringify(persisted.continuity.authority));
  const again = arRecoverCmd(fx);
  ok("AR06h-3 a second recover afterwards reports clean (journal retired)", JSON.parse(again.out || "{}").status === "clean", again.out);
}
{
  // AR06i -- fails-closed contrast to AR06h (PHX-WP-PX0-V1JOURNAL-TESTS): a journal shaped
  // like NEITHER a valid `.v1` NOR a valid `.v2` record (missing `receipt` entirely -- 7
  // keys instead of either shape's 8/9) must still refuse with the existing AR-JOURNAL
  // error, proving the loader doesn't silently accept an under-shaped legacy-looking
  // document just because its `schema` string matches `.v1`. Same interrupted-apply setup
  // as AR06h, reusing the same genuine on-disk key.
  const { fx, request } = preparedRevision("ar06i-malshaped-journal-fails-closed");
  const preBytes = stateBytes(fx.dir);
  const interrupted = arApplyCmd(fx, request.name, request.sha256, "ar-lock-001", authorityDeps(fx.dir, { afterAuthorityRevisionJournal: () => false }));
  ok("AR06i-setup1 apply interrupted after journal publication, State still exactly the preimage",
    interrupted.value === 2 && stateBytes(fx.dir).equals(preBytes), interrupted.err);
  const journalBase = join(fx.dir, ".fake-git-common", "agent-pipeline", "continuity-authority-revision");
  const journalPath = join(journalBase, "journal");
  const keyPath = join(journalBase, "key");
  const v2 = JSON.parse(readFileSync(journalPath, "utf8"));
  const key = readFileSync(keyPath);
  const malformedCore = {
    schema: "pipeline.continuity-authority-revision-journal.v1",
    intentSha256: v2.intentSha256,
    planSha256: v2.planSha256,
    preStateSha256: v2.preStateSha256,
    postStateSha256: v2.postStateSha256,
    postStateBase64: v2.postStateBase64,
    // `receipt` deliberately omitted -- this is the point of the case: neither the .v1
    // nor the .v2 key set is satisfied, so exactObjectKeys must refuse before anything
    // downstream ever inspects a (missing) receipt.
  };
  const malformedMac = createHmac("sha256", key).update(JSON.stringify(malformedCore)).digest("hex");
  writeFileSync(journalPath, `${JSON.stringify({ ...malformedCore, mac: malformedMac })}\n`);
  chmodSync(journalPath, 0o600);
  const recovered = arRecoverCmd(fx);
  ok("AR06i a journal shaped like neither valid .v1 nor .v2 (missing receipt) fails closed with AR-JOURNAL, not silently accepted",
    recovered.value === 2 && /AR-JOURNAL/.test(recovered.err) && /manual repository inspection is required/.test(recovered.err), recovered.err);
  ok("AR06i-2 State remains byte-identical to the preimage -- zero mutation on the malformed-journal refusal",
    stateBytes(fx.dir).equals(preBytes), "state mutated despite a malformed journal");
}

// ---- PX0-AC-07: exact replay is a verified zero-write success; a conflicting replay / second writer fails closed ----
{
  const { fx, request } = preparedRevision("ar07-replay");
  const first = arApplyCmd(fx, request.name, request.sha256);
  ok("AR07a-setup first apply succeeds", first.value === 0, first.err);
  const postBytes = stateBytes(fx.dir);
  const replay = arApplyCmd(fx, request.name, request.sha256);
  const receipt = JSON.parse(replay.out || "{}");
  ok("AR07a the exact same completed request replayed is a verified zero-write success", replay.value === 0
    && receipt.status === "replayed" && receipt.mutated === false, replay.out || replay.err);
  ok("AR07a-2 State bytes are byte-identical after the replay (zero-write)", stateBytes(fx.dir).equals(postBytes), "state changed on replay");
}
{
  // AR07b -- a second writer (lock already held by someone else) fails closed and
  // preserves whatever authority was already read back, without ever reaching the
  // journal/write stage.
  const { fx, request } = preparedRevision("ar07-second-writer");
  const preBytes = stateBytes(fx.dir);
  const foreign = acquireContinuityLock(fx.dir, "foreign-writer-001", authorityDeps(fx.dir));
  ok("AR07b-setup foreign lock acquired", foreign.ok, JSON.stringify(foreign));
  const blocked = arApplyCmd(fx, request.name, request.sha256);
  ok("AR07b a concurrent second writer is refused closed (writer lock unavailable)", blocked.value === 2
    && /PS-CONTINUITY-LOCKED/.test(blocked.err), blocked.err);
  ok("AR07b-2 State is preserved exactly as the first read-back authority (untouched)", stateBytes(fx.dir).equals(preBytes), "state mutated under a foreign lock");
  releaseContinuityLock(foreign);
}

// ---- PX0-AC-05 F5 regression (PHX-WP-AUTHREV-RECEIPT-INTEGRITY): mergeAuthorityRevisionReceipt
// dedups on CONTENT, not just a shared intentSha256 string -- a genuine SHA-256 collision
// cannot be constructed against the real CLI's hash pipeline (preStateSha256, bound into
// intentSha256, covers the entire state file including authorityRevisionReceipts itself --
// a hash fixed-point/preimage problem), so this exercises the exported pure function
// directly with two hand-built receipts sharing an intentSha256 but different content.
{
  const priorReceipt = { operation: "continuity-authority-revision", intentSha256: "a".repeat(64), featureId: "f1", note: "first" };
  const collidingReceipt = { operation: "continuity-authority-revision", intentSha256: "a".repeat(64), featureId: "f1", note: "different-content" };
  const collision = mergeAuthorityRevisionReceipt([priorReceipt], collidingReceipt);
  ok("AR-F5a two receipts sharing intentSha256 but differing in content are refused as a collision (AR-RECEIPT-COLLISION), never merged or silently appended",
    collision.ok === false && collision.code === "AR-RECEIPT-COLLISION", JSON.stringify(collision));

  const duplicateReceipt = { ...priorReceipt };
  const duplicate = mergeAuthorityRevisionReceipt([priorReceipt], duplicateReceipt);
  ok("AR-F5b a genuine duplicate (same intentSha256 AND identical content) still dedups correctly -- no regression on the happy path",
    duplicate.ok === true && duplicate.receipts.length === 1 && JSON.stringify(duplicate.receipts[0]) === JSON.stringify(priorReceipt), JSON.stringify(duplicate));

  const newReceipt = { operation: "continuity-authority-revision", intentSha256: "b".repeat(64), featureId: "f2", note: "new" };
  const appended = mergeAuthorityRevisionReceipt([priorReceipt], newReceipt);
  ok("AR-F5c a receipt with a genuinely new intentSha256 is appended (not treated as a collision or a duplicate)",
    appended.ok === true && appended.receipts.length === 2 && JSON.stringify(appended.receipts[1]) === JSON.stringify(newReceipt), JSON.stringify(appended));
}

// ---- PX0-AC-06 F6 regression (PHX-WP-AUTHREV-RECEIPT-INTEGRITY): the journal's MAC seals
// postStateBase64's own bytes, but not the PRD/Spec artifact FILES that postState's
// continuity.authority merely references by frozen digest -- those files can be mutated
// out-of-band between the interrupted apply that froze the journal and a later recovery
// run completing it forward. Recovery re-validates the postimage's PRD/Spec bytes against
// their own frozen sha256 immediately before the roll-forward write, refusing closed
// (AR-RECOVER-ARTIFACT-STALE) rather than certifying a State authority binding that no
// longer matches what is actually on disk.
{
  const { fx, request } = preparedRevision("ar-f6-postimage-artifact-stale");
  const preBytes = stateBytes(fx.dir);
  const interrupted = arApplyCmd(fx, request.name, request.sha256, "ar-lock-001", authorityDeps(fx.dir, { afterAuthorityRevisionJournal: () => false }));
  ok("AR-F6-setup1 apply interrupted after journal publication, State still exactly the preimage",
    interrupted.value === 2 && stateBytes(fx.dir).equals(preBytes), interrupted.err);
  const journalPath = join(fx.dir, ".fake-git-common", "agent-pipeline", "continuity-authority-revision", "journal");
  ok("AR-F6-setup2 the journal is retained after the interruption", existsSync(journalPath), journalPath);
  // Mutate the postimage PRD bytes AFTER the journal was frozen -- the same file the frozen
  // postState.continuity.authority.prd.sha256 already points to.
  writeFileSync(join(fx.dir, fx.prdRel), "# mutated postimage PRD, never planned or approved\n");
  const recovered = arRecoverCmd(fx);
  ok("AR-F6a recover refuses (AR-RECOVER-ARTIFACT-STALE) when the postimage PRD bytes were mutated after the journal was frozen",
    recovered.value === 2 && /AR-RECOVER-ARTIFACT-STALE/.test(recovered.err), recovered.err);
  ok("AR-F6b State remains byte-identical to the preimage -- zero write on the stale-artifact refusal",
    stateBytes(fx.dir).equals(preBytes), "state mutated despite a stale postimage PRD");
  ok("AR-F6c the journal is still retained after the refusal (not silently retired)", existsSync(journalPath), journalPath);
}

}

/** A FULL package (all five classes), state "implementing" -- required because reconcile's
 * fixtures need artifacts from every class the criterion names (PRD/Spec/acceptance/
 * Result), and "implementing" sits in ACTIVE_STATES with candidate: null permitted. */
function seedReconcilePackage(prefix, { id = "rec-pkg", state = "implementing" } = {}) {
  const dir = freshDir(prefix);
  mkdirSync(join(dir, "specs", id), { recursive: true });
  const files = {};
  for (const [key, name, content] of [
    ["prd", `prd_${id}.md`, `# ${id} PRD\n`],
    ["spec", "spec.md", `# ${id} Spec\n`],
    ["acceptance", "acceptance.md", `# ${id} Acceptance\n`],
    ["result", "Result.md", `# ${id} Result\n`],
    ["evidence", "evidence.txt", `evidence for ${id}\n`],
  ]) {
    const rel = `specs/${id}/${name}`;
    writeFileSync(join(dir, rel), content);
    files[key] = { rel, sha256: sha256Hex(content), content };
  }
  const value = {
    schema: "pipeline.feature-package.v1",
    feature: { id, rigor: 1 },
    state,
    artifacts: [
      { class: "prd", path: files.prd.rel, sha256: files.prd.sha256, authority: true, mutability: "mutable", retention: "active" },
      { class: "spec", path: files.spec.rel, sha256: files.spec.sha256, authority: true, mutability: "immutable", retention: "active" },
      { class: "acceptance", path: files.acceptance.rel, sha256: files.acceptance.sha256, authority: false, mutability: "immutable", retention: "active" },
      { class: "result", path: files.result.rel, sha256: files.result.sha256, authority: false, mutability: "mutable", retention: "active" },
      { class: "candidate-evidence", path: files.evidence.rel, sha256: files.evidence.sha256, authority: false, mutability: "immutable", retention: "active" },
    ],
    candidate: null,
    supersedes: null,
  };
  const manifestRel = `specs/${id}/lifecycle.json`;
  writeFileSync(join(dir, manifestRel), `${JSON.stringify(value, null, 2)}\n`);
  const fakeGitCommon = join(dir, ".fake-git-common");
  mkdirSync(fakeGitCommon, { recursive: true });
  const deps = {
    gitCommonDir: () => ({ ok: true, path: fakeGitCommon }),
    ownerNonce: () => `nonce-${id}`,
    gitCandidate: () => ({ ok: true, commit: "a".repeat(40), tree: "b".repeat(40) }),
    featurePackageReconcileApproval: (approval) => ({ ok: true, value: approval }),
  };
  return { dir, id, manifestRel, files, deps, value };
}
function reconcilePlanDigest(fx, resultAuthority = null) {
  const plan = planFeaturePackageReconcile(fx.dir, fx.manifestRel, resultAuthority);
  return { plan, digest: sha256CanonicalJson(plan) };
}
function reconcileApplyCmd(dir, extraArgs, deps) {
  return captureBoth(() => run(["feature-package-reconcile", "--root", dir, ...extraArgs], deps));
}

// ---- PHX-WP-PAC08-RECONCILE-APPROVAL: defaultFeaturePackageReconcileApproval's real,
// non-test-injected wiring (ADR-0056's 2026-08-11 Follow-up, gates.reconcile_approval). ----
const PAC08_CANDIDATE = { commit: "a".repeat(40), tree: "b".repeat(40) };
const PAC08_NOW = "2026-08-11T12:00:00.000Z";
const PAC08_EXPIRES = "2026-08-11T13:00:00.000Z";
const PAC08_PLAN_BYTES = Buffer.from("pac08-plan");
const PAC08_SPEC_BYTES = Buffer.from("pac08-spec");
const PAC08_PLAN_SHA256 = sha256Hex(PAC08_PLAN_BYTES);
const PAC08_SPEC_SHA256 = sha256Hex(PAC08_SPEC_BYTES);
const PAC08_FEATURE_ID = "pac08-reconcile";

/** Writes AND commits `pipeline.user.yaml`. `readGateApprovalMode` ignores a working-tree
 * copy that differs from HEAD (ADR-0056 decision 2 / critical-human-proof-policy.mjs), so an
 * uncommitted fixture would silently exercise the fail-closed "signature" default instead of
 * the configured mode -- mirrors critical-human-proof-policy.test.mjs's own userYaml() helper. */
function pac08GatesYaml(base, mode) {
  writeFileSync(join(base, "pipeline.user.yaml"), `schema: "pipeline.user.v3"\ngates:\n  reconcile_approval: "${mode}"\n`);
  const git = (...args) => spawnSync("git", args, { cwd: base, encoding: "utf8" });
  git("init", "-q");
  git("config", "user.email", "goldfish@example.invalid");
  git("config", "user.name", "Goldfish");
  git("add", "-A");
  git("commit", "-q", "-m", "fixture");
}

/** A GOVERNING session for `defaultFeaturePackageReconcileApproval` -- deliberately separate
 * from `--root` (the repository being reconciled): the default approval reads
 * `gates.reconcile_approval` and Continuity State from THIS directory, never from `--root`
 * (ADR-0056: "read from the governing session, not from the pushed repository").
 * `mode: null` leaves no `pipeline.user.yaml` at all, so `readGateApprovalMode` falls back
 * to its strongest default ("signature", source "default"). */
function seedPac08GoverningSession(prefix, { mode = null } = {}) {
  const dir = freshDir(prefix);
  mkdirSync(join(dir, "project"), { recursive: true });
  writeFileSync(join(dir, "project", "pipeline-state.json"), `${JSON.stringify({
    schema: SCHEMA_ID, planApproved: true,
    activeFeature: { id: PAC08_FEATURE_ID, planPath: `specs/${PAC08_FEATURE_ID}/prd.md`, phase: "implementation" },
    planApproval: { poGateAuthority: { planSha256: PAC08_PLAN_SHA256, specSha256: PAC08_SPEC_SHA256 } },
  }, null, 2)}\n`);
  if (mode !== null) pac08GatesYaml(dir, mode);
  return dir;
}

/** A genuine Ed25519 keypair plus a well-formed request/authority/proof triple for
 * `feature-package-reconcile`, written to an EXTERNAL directory (outside every `dir`/`root`
 * this suite constructs -- `externalPublicJson` refuses a path inside `dir`). Mirrors the
 * `generateKeyPairSync`/`sign` pattern already established in
 * critical-action-approval-request.test.mjs and critical-human-proof-gate.test.mjs. */
function pac08Proof({ manifest, planSha256, candidate = PAC08_CANDIDATE, expiresAt = PAC08_EXPIRES }) {
  const subject = { manifest, planSha256, candidate };
  const subjectSha256 = criticalActionSubjectSha256({ kind: "feature-package-reconcile", candidate, subject });
  const action = { kind: "feature-package-reconcile", subjectSha256, expiresAt };
  const request = createCriticalActionApprovalRequest({
    candidate, featureId: PAC08_FEATURE_ID, planBytes: PAC08_PLAN_BYTES, specBytes: PAC08_SPEC_BYTES, action,
  });
  const keys = generateKeyPairSync("ed25519");
  const publicKey = keys.publicKey.export({ format: "pem", type: "spki" }).toString();
  const authority = { keyReference: "pac08-test-key", publicKeySha256: sha256Hex(publicKey) };
  const proof = {
    schema: "pipeline.po-approval-proof.v1", intentSha256: request.approvalIntent.sha256,
    keyReference: "pac08-test-key", publicKey,
    signatureBase64: sign(null, Buffer.from(request.approvalIntent.sha256), keys.privateKey).toString("base64"),
  };
  const external = freshDir("pac08-external");
  const requestPath = join(external, "request.json");
  const authorityPath = join(external, "authority.json");
  const proofPath = join(external, "proof.json");
  writeFileSync(requestPath, JSON.stringify(request));
  writeFileSync(authorityPath, JSON.stringify(authority));
  writeFileSync(proofPath, JSON.stringify(proof));
  return { requestPath, authorityPath, proofPath };
}

function runFeaturePackageReconcileTests() {

// ---- DoD 1: planFeaturePackageReconcile recomputes stale digests from disk and returns
// preimage, postimage, and per-artifact old/new digest pairs, in the existing plan shape ----
{
  const fx = seedReconcilePackage("rg-plan-basic");
  const newPrd = "# rec-pkg PRD (grown)\n";
  writeFileSync(join(fx.dir, fx.files.prd.rel), newPrd);
  const newSha = sha256Hex(newPrd);
  const { plan } = reconcilePlanDigest(fx);
  ok("RGa plan is an actionable reconcile-preview carrying the shared plan schema", plan.status === "reconcile-preview"
    && plan.schema === "pipeline.feature-package-transition-plan.v1" && plan.manifest === fx.manifestRel, JSON.stringify(plan));
  ok("RGa the plan reports exactly one change: the prd's old->new digest pair", plan.changes.length === 1
    && plan.changes[0].class === "prd" && plan.changes[0].from === fx.files.prd.sha256 && plan.changes[0].to === newSha, JSON.stringify(plan.changes));
  ok("RGa preimage/postimage keep state/candidate/supersedes/artifact-set&order identical except the one digest",
    plan.preimage.state === fx.value.state && plan.postimage.state === fx.value.state
    && plan.postimage.artifacts.length === plan.preimage.artifacts.length
    && plan.postimage.artifacts[0].sha256 === newSha && plan.preimage.artifacts[0].sha256 === fx.files.prd.sha256
    && plan.postimage.artifacts[1].sha256 === fx.files.spec.sha256, JSON.stringify(plan));
}
{
  const fx = seedReconcilePackage("rg-plan-noop");
  const { plan } = reconcilePlanDigest(fx);
  ok("RGa2 an already-fresh package (no stale digest) reconciles to noop", plan.status === "noop", JSON.stringify(plan));
}

// ---- DoD 2: the no-drift invariant is enforced on the PLAN OBJECT, not on intent -- a
// second field changing (never just a digest) is refused ----
{
  const fx = seedReconcilePackage("rg-nodrift");
  const preimage = fx.value;
  const digestOnlyPostimage = { ...preimage, artifacts: preimage.artifacts.map((a, i) => (i === 0 ? { ...a, sha256: "1".repeat(64) } : a)) };
  ok("RGb a digest-only postimage passes the no-drift invariant", reconcileNoDriftOk(preimage, digestOnlyPostimage), "expected true");
  const stateDrifted = { ...digestOnlyPostimage, state: "approved" };
  ok("RGb2 a postimage that ALSO changes a second field (state) is refused by the invariant", !reconcileNoDriftOk(preimage, stateDrifted), "expected false");
  const candidateDrifted = { ...digestOnlyPostimage, candidate: { commit: "c".repeat(40), tree: "d".repeat(40) } };
  ok("RGb3 a postimage that changes the candidate binding is refused by the invariant", !reconcileNoDriftOk(preimage, candidateDrifted), "expected false");
  const reorderedArtifacts = { ...digestOnlyPostimage, artifacts: [...digestOnlyPostimage.artifacts].reverse() };
  ok("RGb4 a postimage that reorders the artifact set is refused by the invariant", !reconcileNoDriftOk(preimage, reorderedArtifacts), "expected false");
}

// ---- DoD 3: feature-package-reconcile apply consumes the plan under --plan-sha256,
// recomputes the preview fresh, and refuses on drift, exactly as the existing kinds do ----
{
  // RGc -- the successful case, including DoD 7's readback.
  const fx = seedReconcilePackage("rg-apply-ok");
  const newPrd = "# rec-pkg PRD (grown)\n";
  writeFileSync(join(fx.dir, fx.files.prd.rel), newPrd);
  const { plan, digest } = reconcilePlanDigest(fx);
  ok("RGc fixture reconcile preview is actionable (sanity)", plan.status === "reconcile-preview", JSON.stringify(plan));
  const applied = reconcileApplyCmd(fx.dir, ["--manifest", fx.manifestRel, "--plan-sha256", digest], fx.deps);
  const receipt = JSON.parse(applied.out || "{}");
  ok("RGc reconcile apply succeeds and returns the pipeline.feature-package-reconcile.v1 receipt", applied.value === 0
    && receipt.schema === "pipeline.feature-package-reconcile.v1" && receipt.status === "applied" && receipt.kind === "reconcile"
    && receipt.planSha256 === digest, applied.out || applied.err);
  const persisted = JSON.parse(readFileSync(join(fx.dir, fx.manifestRel), "utf8"));
  ok("RGc persisted manifest has ONLY the prd digest changed; state/candidate/supersedes/other artifacts untouched", persisted.state === fx.value.state
    && persisted.artifacts.length === 5 && persisted.artifacts[0].sha256 === sha256Hex(newPrd)
    && persisted.artifacts[1].sha256 === fx.files.spec.sha256 && persisted.candidate === null && persisted.supersedes === null, JSON.stringify(persisted));
  const revalidated = validateFeaturePackage(fx.dir, fx.manifestRel);
  ok("RGc DoD 7: the persisted manifest is re-read and re-validates ok through the accepted validator before the journal retires", revalidated.ok, revalidated.findings.join("; "));
}
{
  // RGd -- a drifted artifact between plan and apply is refused fail-closed (TOCTOU close).
  const fx = seedReconcilePackage("rg-apply-drift");
  const newPrd = "# rec-pkg PRD (grown)\n";
  writeFileSync(join(fx.dir, fx.files.prd.rel), newPrd);
  const { digest } = reconcilePlanDigest(fx);
  writeFileSync(join(fx.dir, fx.files.spec.rel), "# drifted spec after the preview was taken\n");
  const applied = reconcileApplyCmd(fx.dir, ["--manifest", fx.manifestRel, "--plan-sha256", digest], fx.deps);
  ok("RGd a drifted artifact since the preview is refused (stale --plan-sha256), zero mutation", applied.value === 2
    && /does not match the freshly recomputed reconcile preview digest/.test(applied.err), applied.err);
  const untouched = JSON.parse(readFileSync(join(fx.dir, fx.manifestRel), "utf8"));
  ok("RGd the manifest is untouched after the refusal", untouched.artifacts[0].sha256 === fx.files.prd.sha256, JSON.stringify(untouched));
}

// ---- DoD 4: apply is PO-bound -- fails closed and writes nothing without a valid bound
// decision (proof of zero mutation via before/after manifest bytes) ----
{
  const fx = seedReconcilePackage("rg-po-bound");
  const newPrd = "# rec-pkg PRD (grown)\n";
  writeFileSync(join(fx.dir, fx.files.prd.rel), newPrd);
  const { digest } = reconcilePlanDigest(fx);
  const beforeManifest = readFileSync(join(fx.dir, fx.manifestRel));
  const noApprovalDeps = { ...fx.deps, featurePackageReconcileApproval: undefined };
  const refusedNoFn = reconcileApplyCmd(fx.dir, ["--manifest", fx.manifestRel, "--plan-sha256", digest], noApprovalDeps);
  ok("RGe apply with no injected approval function fails closed (FTP-RECONCILE-APPROVAL-UNAVAILABLE)", refusedNoFn.value === 2
    && /FTP-RECONCILE-APPROVAL-UNAVAILABLE/.test(refusedNoFn.err), refusedNoFn.err);
  const rejectingDeps = { ...fx.deps, featurePackageReconcileApproval: () => ({ ok: false }) };
  const refusedRejected = reconcileApplyCmd(fx.dir, ["--manifest", fx.manifestRel, "--plan-sha256", digest], rejectingDeps);
  ok("RGe apply with a rejected approval fails closed (FTP-RECONCILE-APPROVAL-REJECTED)", refusedRejected.value === 2
    && /FTP-RECONCILE-APPROVAL-REJECTED/.test(refusedRejected.err), refusedRejected.err);
  ok("RGe zero mutation: the manifest bytes are byte-identical before and after both refusals", readFileSync(join(fx.dir, fx.manifestRel)).equals(beforeManifest), "manifest mutated despite a refused/absent approval");
}

// ---- DoD 5: manual digest replacement is refused -- it cannot stand in for the transaction ----
{
  const fx = seedReconcilePackage("rg-manual-replace");
  const newPrd = "# rec-pkg PRD (grown)\n";
  writeFileSync(join(fx.dir, fx.files.prd.rel), newPrd);
  const { digest } = reconcilePlanDigest(fx);
  const tampered = JSON.parse(readFileSync(join(fx.dir, fx.manifestRel), "utf8"));
  tampered.artifacts[0] = { ...tampered.artifacts[0], sha256: sha256Hex(newPrd) };
  writeFileSync(join(fx.dir, fx.manifestRel), `${JSON.stringify(tampered, null, 2)}\n`);
  const applied = reconcileApplyCmd(fx.dir, ["--manifest", fx.manifestRel, "--plan-sha256", digest], fx.deps);
  ok("RGf a manual hand-edit of the manifest's digest cannot stand in for the reconcile transaction", applied.value === 2
    && /does not match the freshly recomputed reconcile preview digest/.test(applied.err), applied.err);
  const stillTampered = JSON.parse(readFileSync(join(fx.dir, fx.manifestRel), "utf8"));
  ok("RGf the hand-edited manifest was not further mutated by the refused apply", stillTampered.artifacts[0].sha256 === sha256Hex(newPrd), JSON.stringify(stillTampered));
}

// ---- DoD 6: the Result fence, each arm with its own typed code and its own case ----
{
  // RGg1 -- unbound: no Continuity State binding at all.
  const fx = seedReconcilePackage("rg-result-unbound");
  const newResult = `${fx.files.result.content}${RESULT_RECONCILIATION_FENCE}more content\n`;
  writeFileSync(join(fx.dir, fx.files.result.rel), newResult);
  const { plan } = reconcilePlanDigest(fx, null);
  ok("RGg1 a Result reconcile with no Continuity State binding is refused (reconcile-result-unbound)", plan.status === "rejected"
    && plan.reason === "reconcile-result-unbound", JSON.stringify(plan));
}
{
  // RGg2 -- metadata-only: bound, but the canonical fence marker is entirely absent.
  const fx = seedReconcilePackage("rg-result-metadata-only");
  const newResult = `${fx.files.result.content}just appended text with no fence marker\n`;
  writeFileSync(join(fx.dir, fx.files.result.rel), newResult);
  const resultAuthority = { path: fx.files.result.rel, sha256: sha256Hex(newResult) };
  const { plan } = reconcilePlanDigest(fx, resultAuthority);
  ok("RGg2 a Result digest refresh with no canonical fence marker is refused BY NAME (reconcile-result-metadata-only)", plan.status === "rejected"
    && plan.reason === "reconcile-result-metadata-only", JSON.stringify(plan));
}
{
  // RGg3 -- fence present, but the bytes preceding it do not hash to the stale digest.
  const fx = seedReconcilePackage("rg-result-fence-mismatch");
  const newResult = `some other prefix that does not hash to the stale digest${RESULT_RECONCILIATION_FENCE}more content\n`;
  writeFileSync(join(fx.dir, fx.files.result.rel), newResult);
  const resultAuthority = { path: fx.files.result.rel, sha256: sha256Hex(newResult) };
  const { plan } = reconcilePlanDigest(fx, resultAuthority);
  ok("RGg3 a Result whose preserved prefix does not hash to the stale digest is refused (reconcile-result-fence-mismatch), distinct from RGg2's code", plan.status === "rejected"
    && plan.reason === "reconcile-result-fence-mismatch" && plan.reason !== "reconcile-result-metadata-only", JSON.stringify(plan));
}
{
  // RGg4 -- admitted: bound, fence present, and the preserved prefix DOES hash to the stale digest.
  const fx = seedReconcilePackage("rg-result-fence-ok");
  const newResult = `${fx.files.result.content}${RESULT_RECONCILIATION_FENCE}the Result legitimately grew\n`;
  writeFileSync(join(fx.dir, fx.files.result.rel), newResult);
  const newSha = sha256Hex(newResult);
  const resultAuthority = { path: fx.files.result.rel, sha256: newSha };
  const { plan } = reconcilePlanDigest(fx, resultAuthority);
  ok("RGg4 a Result whose fenced prefix DOES hash to the stale digest and IS Continuity-bound is admitted", plan.status === "reconcile-preview"
    && plan.changes.some((c) => c.class === "result" && c.to === newSha), JSON.stringify(plan));
}

// ---- Bonus: reconcile shares the SAME recovery journal machinery feature-package-apply
// already uses -- an unmodified feature-package-recover diagnoses a retained reconcile
// journal exactly like the other two kinds. ----
{
  const fx = seedReconcilePackage("rg-crash-after-journal");
  const newPrd = "# rec-pkg PRD (grown)\n";
  writeFileSync(join(fx.dir, fx.files.prd.rel), newPrd);
  const { digest } = reconcilePlanDigest(fx);
  const crashed = reconcileApplyCmd(fx.dir, ["--manifest", fx.manifestRel, "--plan-sha256", digest],
    { ...fx.deps, afterFeaturePackageReconcileJournal: () => false });
  ok("RGh interrupted after journal publication refuses, ending in 'recovery journal retained.'", crashed.value === 2
    && /interrupted after journal preparation; recovery journal retained\.$/.test(crashed.err.trim()), crashed.err);
  const stillPreimage = JSON.parse(readFileSync(join(fx.dir, fx.manifestRel), "utf8"));
  ok("RGh the manifest bytes are untouched (the journal precedes the write)", stillPreimage.artifacts[0].sha256 === fx.files.prd.sha256, JSON.stringify(stillPreimage));
  const recovered = recoverCmd(fx.dir, fx.deps);
  const report = JSON.parse(recovered.out || "{}");
  ok("RGh the unmodified feature-package-recover diagnoses the retained reconcile journal as not-yet-applied", recovered.value === 2
    && report.schema === "pipeline.feature-package-recover.v1" && report.status === "retained"
    && report.diagnosis === "not-yet-applied" && report.transaction.kind === "reconcile", recovered.out);
}

// ---- PHX-WP-PAC08-RECONCILE-APPROVAL: defaultFeaturePackageReconcileApproval's real
// (non-test-injected) wiring, one level up from RGe's injected-function cases above. ----
{
  // RGi -- signature-mode success: a genuine Ed25519 proof over the real subject
  // (manifest/planSha256/candidate) verifies and the reconcile actually applies. deps
  // deliberately OMITS featurePackageReconcileApproval so runFeaturePackageWriteCommand
  // wires in defaultFeaturePackageReconcileApproval itself, not a test double.
  const fx = seedReconcilePackage("rgi-signature-success");
  const newPrd = "# rec-pkg PRD (grown)\n";
  writeFileSync(join(fx.dir, fx.files.prd.rel), newPrd);
  const { digest } = reconcilePlanDigest(fx);
  const governingDir = seedPac08GoverningSession("rgi-governing", { mode: "signature" });
  const proof = pac08Proof({ manifest: fx.manifestRel, planSha256: digest });
  const deps = {
    dir: governingDir, now: () => PAC08_NOW,
    gitCommonDir: fx.deps.gitCommonDir, ownerNonce: fx.deps.ownerNonce,
    gitCandidate: () => ({ ok: true, ...PAC08_CANDIDATE }),
  };
  const applied = reconcileApplyCmd(fx.dir, [
    "--manifest", fx.manifestRel, "--plan-sha256", digest,
    "--by", "PO", "--proof-request", proof.requestPath, "--proof-authority", proof.authorityPath, "--proof", proof.proofPath,
  ], deps);
  const receipt = JSON.parse(applied.out || "{}");
  ok("RGi signature-mode default approval: a genuine Ed25519 proof over the real subject verifies and the reconcile applies",
    applied.value === 0 && receipt.status === "applied", applied.out || applied.err);
  const persisted = JSON.parse(readFileSync(join(fx.dir, fx.manifestRel), "utf8"));
  ok("RGi-2 the manifest was actually rewritten -- the default approval genuinely gated a real write, not a no-op",
    persisted.artifacts[0].sha256 === sha256Hex(newPrd), JSON.stringify(persisted));
}
{
  // RGj -- chat-mode success: only --by is required, no proof flags, when the governing
  // session's own committed gates.reconcile_approval is "chat".
  const fx = seedReconcilePackage("rgj-chat-success");
  const newPrd = "# rec-pkg PRD (grown)\n";
  writeFileSync(join(fx.dir, fx.files.prd.rel), newPrd);
  const { digest } = reconcilePlanDigest(fx);
  const governingDir = seedPac08GoverningSession("rgj-governing", { mode: "chat" });
  const deps = {
    dir: governingDir, now: () => PAC08_NOW,
    gitCommonDir: fx.deps.gitCommonDir, ownerNonce: fx.deps.ownerNonce,
    gitCandidate: () => ({ ok: true, ...PAC08_CANDIDATE }),
  };
  const applied = reconcileApplyCmd(fx.dir, ["--manifest", fx.manifestRel, "--plan-sha256", digest, "--by", "PO"], deps);
  const receipt = JSON.parse(applied.out || "{}");
  ok("RGj chat-mode default approval: --by alone (no proof flags) succeeds when gates.reconcile_approval is chat",
    applied.value === 0 && receipt.status === "applied", applied.out || applied.err);
}
{
  // RGk -- missing/invalid proof refusal in signature mode: --by alone, with no
  // --proof-* flags at all, is refused (the identical refusal a malformed proof file
  // reaches too -- both fail the same verifyCriticalHumanProof pre-check and surface as
  // the one generic FTP-RECONCILE-APPROVAL-REJECTED message), zero mutation.
  const fx = seedReconcilePackage("rgk-missing-proof");
  const newPrd = "# rec-pkg PRD (grown)\n";
  writeFileSync(join(fx.dir, fx.files.prd.rel), newPrd);
  const { digest } = reconcilePlanDigest(fx);
  const beforeManifest = readFileSync(join(fx.dir, fx.manifestRel));
  const governingDir = seedPac08GoverningSession("rgk-governing", { mode: "signature" });
  const deps = {
    dir: governingDir, now: () => PAC08_NOW,
    gitCommonDir: fx.deps.gitCommonDir, ownerNonce: fx.deps.ownerNonce,
    gitCandidate: () => ({ ok: true, ...PAC08_CANDIDATE }),
  };
  const refused = reconcileApplyCmd(fx.dir, ["--manifest", fx.manifestRel, "--plan-sha256", digest, "--by", "PO"], deps);
  ok("RGk signature mode with --by but no --proof-* flags is refused (FTP-RECONCILE-APPROVAL-REJECTED), zero mutation",
    refused.value === 2 && /FTP-RECONCILE-APPROVAL-REJECTED/.test(refused.err)
    && readFileSync(join(fx.dir, fx.manifestRel)).equals(beforeManifest), refused.err);
}
{
  // RGl -- wrong-candidate-bound proof refusal: the proof is genuinely signed and
  // internally consistent, but bound to a DIFFERENT candidate than the one the reconcile
  // actually observes via deps.gitCandidate -- refused, zero mutation.
  const fx = seedReconcilePackage("rgl-wrong-candidate");
  const newPrd = "# rec-pkg PRD (grown)\n";
  writeFileSync(join(fx.dir, fx.files.prd.rel), newPrd);
  const { digest } = reconcilePlanDigest(fx);
  const beforeManifest = readFileSync(join(fx.dir, fx.manifestRel));
  const governingDir = seedPac08GoverningSession("rgl-governing", { mode: "signature" });
  const wrongCandidate = { commit: "c".repeat(40), tree: "d".repeat(40) };
  const proof = pac08Proof({ manifest: fx.manifestRel, planSha256: digest, candidate: wrongCandidate });
  const deps = {
    dir: governingDir, now: () => PAC08_NOW,
    gitCommonDir: fx.deps.gitCommonDir, ownerNonce: fx.deps.ownerNonce,
    gitCandidate: () => ({ ok: true, ...PAC08_CANDIDATE }), // the REAL candidate the reconcile actually observes
  };
  const refused = reconcileApplyCmd(fx.dir, [
    "--manifest", fx.manifestRel, "--plan-sha256", digest,
    "--by", "PO", "--proof-request", proof.requestPath, "--proof-authority", proof.authorityPath, "--proof", proof.proofPath,
  ], deps);
  ok("RGl a proof bound to a DIFFERENT candidate than the one the reconcile actually observes is refused, zero mutation",
    refused.value === 2 && /FTP-RECONCILE-APPROVAL-REJECTED/.test(refused.err)
    && readFileSync(join(fx.dir, fx.manifestRel)).equals(beforeManifest), refused.err);
}
{
  // RGm -- dir vs --root governing-session binding: `--root` (fx.dir, the repository being
  // reconciled) carries its OWN committed pipeline.user.yaml claiming "chat"; the GOVERNING
  // session (`dir`) has no yaml at all, so it falls back to the strongest "signature"
  // default. Only --by is supplied (no proof). If the wiring ever read --root instead of
  // `dir`, this would wrongly succeed; it must instead refuse, proving `dir` governs.
  const fx = seedReconcilePackage("rgm-dir-vs-root");
  const newPrd = "# rec-pkg PRD (grown)\n";
  writeFileSync(join(fx.dir, fx.files.prd.rel), newPrd);
  const { digest } = reconcilePlanDigest(fx);
  const beforeManifest = readFileSync(join(fx.dir, fx.manifestRel));
  pac08GatesYaml(fx.dir, "chat"); // committed at --root; must be ignored by the approval
  const governingDir = seedPac08GoverningSession("rgm-governing", { mode: null });
  const deps = {
    dir: governingDir, now: () => PAC08_NOW,
    gitCommonDir: fx.deps.gitCommonDir, ownerNonce: fx.deps.ownerNonce,
    gitCandidate: () => ({ ok: true, ...PAC08_CANDIDATE }),
  };
  const refused = reconcileApplyCmd(fx.dir, ["--manifest", fx.manifestRel, "--plan-sha256", digest, "--by", "PO"], deps);
  ok("RGm the approval reads gates.reconcile_approval and Continuity State from `dir`, never `--root` -- root's committed chat is ignored, dir's un-configured signature default still demands a proof",
    refused.value === 2 && /FTP-RECONCILE-APPROVAL-REJECTED/.test(refused.err)
    && readFileSync(join(fx.dir, fx.manifestRel)).equals(beforeManifest), refused.err);
}
{
  // RGn -- push regression: proves the ALWAYS_REQUIRED_KINDS bypass (verifyCriticalHumanProof,
  // scoped to "feature-package-reconcile" only) leaves push's own
  // CRITICAL-PROOF-POLICY-KIND-REQUIRED refusal byte-identical to before the bypass was
  // added -- reached via a REAL approve-push invocation whose policy file deliberately
  // omits "push" from requiredKinds while verifyCriticalHumanProof's required:true still
  // applies for push. Mirrors critical-human-proof-gate.test.mjs's own real-proof fixture
  // shape (threat model file, remote/destination, genuine Ed25519 proof) so the refusal is
  // reached at the SAME point a real operator invocation would reach it, not short-circuited
  // by an earlier flag-parse failure.
  const dir = freshDir("rgn-push-kind-required");
  mkdirSync(join(dir, "project"), { recursive: true });
  mkdirSync(join(dir, "specs", "sprint-nova-epic", "implementation"), { recursive: true });
  const threatModelText = "fixture threat model\n";
  writeFileSync(join(dir, "specs", "sprint-nova-epic", "implementation", "critical-action-authorization-threat-model.md"), threatModelText);
  // approve-push resolves the bound threat-model artifact at the single fixed
  // project/push-threat-model.md path (resolvePushThreatModelArtifact,
  // PUSH_THREAT_MODEL_DEFAULT_PATH) BEFORE verifyCriticalHumanProof's requiredKinds
  // check ever runs -- an absent artifact refuses byte-null with
  // CRITICAL-PROOF-BOUND-ARTIFACT-UNAVAILABLE, short-circuiting this test's own target
  // refusal. This fixture materializes that artifact so the invocation reaches the
  // SAME point a real operator invocation would reach it, matching
  // critical-human-proof-gate.test.mjs's own real-proof fixture shape.
  writeFileSync(join(dir, "project", "push-threat-model.md"), threatModelText);
  writeFileSync(join(dir, "project", "critical-human-proof.json"), JSON.stringify({ schema: "pipeline.critical-human-proof-policy.v1", requiredKinds: ["deploy"] }));
  // No project/pipeline-state.json is seeded: verifyCriticalHumanProof's requiredKinds
  // check is the FIRST thing it does, before state is ever consulted, so this refusal is
  // reached (and state stays genuinely absent, not merely untouched) with no state file
  // at all -- exactly like PS10/PS11's existing approve-push fixtures.
  const pushTarget = { remote: "origin", destination: "refs/heads/main" };
  const threatModel = { path: "project/push-threat-model.md", sha256: sha256Hex(threatModelText) };
  const candidate = PAC08_CANDIDATE;
  const subjectSha256 = criticalActionSubjectSha256({ kind: "push", candidate, subject: { sourceCommit: candidate.commit, ...pushTarget, threatModel } });
  const request = createCriticalActionApprovalRequest({
    candidate, featureId: PAC08_FEATURE_ID, planBytes: PAC08_PLAN_BYTES, specBytes: PAC08_SPEC_BYTES,
    action: { kind: "push", subjectSha256, expiresAt: PAC08_EXPIRES },
  });
  const keys = generateKeyPairSync("ed25519");
  const publicKey = keys.publicKey.export({ format: "pem", type: "spki" }).toString();
  const authority = { keyReference: "pac08-test-key", publicKeySha256: sha256Hex(publicKey) };
  const proof = {
    schema: "pipeline.po-approval-proof.v1", intentSha256: request.approvalIntent.sha256,
    keyReference: "pac08-test-key", publicKey,
    signatureBase64: sign(null, Buffer.from(request.approvalIntent.sha256), keys.privateKey).toString("base64"),
  };
  const external = freshDir("rgn-external");
  const requestPath = join(external, "request.json");
  const authorityPath = join(external, "authority.json");
  const proofPath = join(external, "proof.json");
  writeFileSync(requestPath, JSON.stringify(request));
  writeFileSync(authorityPath, JSON.stringify(authority));
  writeFileSync(proofPath, JSON.stringify(proof));
  const deps = { dir, now: () => PAC08_NOW, gitHead: () => ({ ok: true, commit: candidate.commit }), gitCandidate: () => ({ ok: true, ...candidate }) };
  const refused = captureBoth(() => run([
    "approve-push", "--by", "PO", "--remote", pushTarget.remote, "--destination", pushTarget.destination,
    "--proof-request", requestPath, "--proof-authority", authorityPath, "--proof", proofPath,
  ], deps));
  ok("RGn push's CRITICAL-PROOF-POLICY-KIND-REQUIRED refusal is byte-identical to before the ALWAYS_REQUIRED_KINDS bypass -- the bypass is scoped to feature-package-reconcile only",
    refused.value === 2 && /CRITICAL-PROOF-POLICY-KIND-REQUIRED/.test(refused.err), refused.err);
  ok("RGn-2 state is left absent -- zero mutation on the kind-required refusal", readState(dir).status === "absent", JSON.stringify(readState(dir)));
}

// ---- PHX-WP-PAC08-APPROVAL-LEDGER: a verified feature-package-reconcile approval is
// durably recorded and replay-protected (closing Critic finding F-B). RGo/RGq/RGr share one
// governing session's state to prove persist-on-success, replay-refusal (zero mutation), and
// that the refusal is scoped to the specific proof, not a blanket per-session lockout. ----
{
  const governingDir = seedPac08GoverningSession("rgo-governing", { mode: "signature" });
  const commonDeps = (fx) => ({
    dir: governingDir, now: () => PAC08_NOW,
    gitCommonDir: fx.deps.gitCommonDir, ownerNonce: fx.deps.ownerNonce,
    gitCandidate: () => ({ ok: true, ...PAC08_CANDIDATE }),
  });
  const growPrd = (fx) => writeFileSync(join(fx.dir, fx.files.prd.rel), "# rec-pkg PRD (grown)\n");

  // RGo -- a successful signature-mode reconcile persists featurePackageReconcileApproval
  // .lastApproved (approvedBy/approvedAt/forCommit/criticalProof) and a criticalProofConsumption
  // entry tagged kind: "feature-package-reconcile", read back directly from the governing
  // session's own state.json -- not accepted from the CLI's exit code alone.
  const fxA = seedReconcilePackage("rgo-first");
  growPrd(fxA);
  const { digest: digestA } = reconcilePlanDigest(fxA);
  const proofA = pac08Proof({ manifest: fxA.manifestRel, planSha256: digestA });
  const appliedA = reconcileApplyCmd(fxA.dir, [
    "--manifest", fxA.manifestRel, "--plan-sha256", digestA,
    "--by", "PO", "--proof-request", proofA.requestPath, "--proof-authority", proofA.authorityPath, "--proof", proofA.proofPath,
  ], commonDeps(fxA));
  ok("RGo first signature-mode reconcile applies", appliedA.value === 0, appliedA.out || appliedA.err);
  const stateAfterA = readState(governingDir);
  ok("RGo governing state records featurePackageReconcileApproval.lastApproved with approvedBy/approvedAt/forCommit and a real criticalProof",
    stateAfterA.status === "ok"
    && stateAfterA.state.featurePackageReconcileApproval?.lastApproved?.approvedBy === "PO"
    && stateAfterA.state.featurePackageReconcileApproval.lastApproved.approvedAt === PAC08_NOW
    && stateAfterA.state.featurePackageReconcileApproval.lastApproved.forCommit === PAC08_CANDIDATE.commit
    && typeof stateAfterA.state.featurePackageReconcileApproval.lastApproved.criticalProof?.proofSha256 === "string", JSON.stringify(stateAfterA));
  ok("RGo criticalProofConsumption carries exactly one entry tagged kind: feature-package-reconcile, matching the recorded criticalProof",
    Array.isArray(stateAfterA.state.criticalProofConsumption) && stateAfterA.state.criticalProofConsumption.length === 1
    && stateAfterA.state.criticalProofConsumption[0].kind === "feature-package-reconcile"
    && stateAfterA.state.criticalProofConsumption[0].proofSha256 === stateAfterA.state.featurePackageReconcileApproval.lastApproved.criticalProof.proofSha256,
    JSON.stringify(stateAfterA.state.criticalProofConsumption));

  // RGq -- the IDENTICAL proof (proofA) presented again, against a FRESH, independent package
  // that reproduces the byte-identical subject (manifestRel/planSha256 are content-derived,
  // not tied to the --root path, so an identical PRD growth on a fresh seed reproduces the
  // same digest), is refused as a replay BEFORE any journal is published or the manifest is
  // touched -- zero mutation, and the governing session's state is left byte-identical.
  const fxB = seedReconcilePackage("rgq-replay-fresh-package");
  growPrd(fxB);
  const { digest: digestB } = reconcilePlanDigest(fxB);
  ok("RGq-setup the fresh package's subject (manifestRel/planSha256) is byte-identical to RGo's, so proofA's subject binding still matches",
    fxB.manifestRel === fxA.manifestRel && digestB === digestA, `${fxB.manifestRel}/${digestB} vs ${fxA.manifestRel}/${digestA}`);
  const beforeManifestB = readFileSync(join(fxB.dir, fxB.manifestRel));
  const stateBeforeB = readState(governingDir);
  const refusedB = reconcileApplyCmd(fxB.dir, [
    "--manifest", fxB.manifestRel, "--plan-sha256", digestB,
    "--by", "PO", "--proof-request", proofA.requestPath, "--proof-authority", proofA.authorityPath, "--proof", proofA.proofPath,
  ], commonDeps(fxB));
  ok("RGq a proof already consumed by an earlier reconcile is refused with the accurate CRITICAL-PROOF-REPLAY message (F3: not the generic FTP-RECONCILE-APPROVAL-REJECTED text, which would falsely claim the candidate/plan digest binding failed when the proof actually verified and was already consumed), zero mutation on the new package's manifest",
    refusedB.value === 2 && /external proof was already consumed \(CRITICAL-PROOF-REPLAY\)/.test(refusedB.err)
    && !/FTP-RECONCILE-APPROVAL-REJECTED/.test(refusedB.err)
    && readFileSync(join(fxB.dir, fxB.manifestRel)).equals(beforeManifestB), refusedB.err);
  const stateAfterB = readState(governingDir);
  ok("RGq the governing session's state is byte-identical after the refused replay -- no second consumption entry, no lastApproved overwrite",
    JSON.stringify(stateAfterB) === JSON.stringify(stateBeforeB), JSON.stringify(stateAfterB));

  // RGr -- a DIFFERENT, never-before-used genuine proof against the SAME governing dir
  // succeeds -- proves the replay refusal is scoped to the specific proof, not a blanket
  // "already approved once" lockout on the session.
  const fxC = seedReconcilePackage("rgr-fresh-proof-succeeds");
  growPrd(fxC);
  const { digest: digestC } = reconcilePlanDigest(fxC);
  const proofC = pac08Proof({ manifest: fxC.manifestRel, planSha256: digestC });
  const appliedC = reconcileApplyCmd(fxC.dir, [
    "--manifest", fxC.manifestRel, "--plan-sha256", digestC,
    "--by", "PO", "--proof-request", proofC.requestPath, "--proof-authority", proofC.authorityPath, "--proof", proofC.proofPath,
  ], commonDeps(fxC));
  ok("RGr a different, never-before-used genuine proof against the SAME governing dir succeeds",
    appliedC.value === 0, appliedC.out || appliedC.err);
  const stateAfterC = readState(governingDir);
  ok("RGr the governing state now carries TWO consumption entries (RGo's + RGr's), both tagged feature-package-reconcile, and lastApproved now reflects RGr's own distinct proof",
    Array.isArray(stateAfterC.state.criticalProofConsumption) && stateAfterC.state.criticalProofConsumption.length === 2
    && stateAfterC.state.criticalProofConsumption.every((entry) => entry.kind === "feature-package-reconcile")
    && stateAfterC.state.featurePackageReconcileApproval.lastApproved.criticalProof.proofSha256
      !== stateAfterA.state.featurePackageReconcileApproval.lastApproved.criticalProof.proofSha256,
    JSON.stringify(stateAfterC.state.criticalProofConsumption));
}
{
  // RGp -- a successful CHAT-mode reconcile persists approvedBy/approvedAt/forCommit even
  // though criticalProof is null (closes F-B's "chat mode nothing is commit-bound" half), and
  // adds no criticalProofConsumption entry (there is no proof to consume).
  const fx = seedReconcilePackage("rgp-chat-persist");
  writeFileSync(join(fx.dir, fx.files.prd.rel), "# rec-pkg PRD (grown)\n");
  const { digest } = reconcilePlanDigest(fx);
  const governingDir = seedPac08GoverningSession("rgp-governing", { mode: "chat" });
  const deps = {
    dir: governingDir, now: () => PAC08_NOW,
    gitCommonDir: fx.deps.gitCommonDir, ownerNonce: fx.deps.ownerNonce,
    gitCandidate: () => ({ ok: true, ...PAC08_CANDIDATE }),
  };
  const applied = reconcileApplyCmd(fx.dir, ["--manifest", fx.manifestRel, "--plan-sha256", digest, "--by", "PO"], deps);
  ok("RGp chat-mode reconcile applies", applied.value === 0, applied.out || applied.err);
  const governingState = readState(governingDir);
  ok("RGp chat-mode approval is commit-bound and attributed even though criticalProof is null",
    governingState.status === "ok"
    && governingState.state.featurePackageReconcileApproval?.lastApproved?.approvedBy === "PO"
    && governingState.state.featurePackageReconcileApproval.lastApproved.approvedAt === PAC08_NOW
    && governingState.state.featurePackageReconcileApproval.lastApproved.forCommit === PAC08_CANDIDATE.commit
    && governingState.state.featurePackageReconcileApproval.lastApproved.criticalProof === null, JSON.stringify(governingState));
  ok("RGp no criticalProofConsumption entry is added in chat mode (nothing to consume)",
    governingState.state.criticalProofConsumption === undefined || governingState.state.criticalProofConsumption.length === 0,
    JSON.stringify(governingState.state.criticalProofConsumption));
}

{
  // RGs -- PHX-WP-PAC08-LOCK-REENTRANCY (closes Critic finding F1 in
  // pac08-fb-critic-review-5420c5e7.md; F2 in the same report is the gap this case closes:
  // every RGi-RGr case above injects `dir: governingDir`, a directory SEPARATE from
  // `--root`, so the mandated self-governing topology is never reached). Here `deps.dir` is
  // OMITTED entirely -- exactly what the real CLI does, see run():6058 `deps` passed
  // raw -- and `--root` names the SAME directory `projectDir()` resolves to, reproduced by
  // temporarily pointing CLAUDE_PROJECT_DIR at the fixture's own root for the duration of
  // this one call. This is the topology P-AC-08 mandates: this repository reconciling its
  // own manifest from within its own governing session. Before the F1 fix, the approval
  // closure's own writeState(dir, ...) tried to acquire a second exclusive continuity lock
  // on the identical resolved path runFeaturePackageReconcileCommand already held,
  // colliding with itself (PS-CONTINUITY-LOCKED) every time.
  const fx = seedReconcilePackage("rgs-self-governing");
  const grownPrd = "# rec-pkg PRD (grown)\n";
  writeFileSync(join(fx.dir, fx.files.prd.rel), grownPrd);
  const { digest } = reconcilePlanDigest(fx);
  // Seed this SAME directory as a valid governing session too -- seedPac08GoverningSession's
  // own state-seeding logic (project/pipeline-state.json with activeFeature/planApproval
  // .poGateAuthority matching the manifest under test, plus a committed
  // pipeline.user.yaml), applied directly to fx.dir rather than to a fresh directory.
  mkdirSync(join(fx.dir, "project"), { recursive: true });
  writeFileSync(join(fx.dir, "project", "pipeline-state.json"), `${JSON.stringify({
    schema: SCHEMA_ID, planApproved: true,
    activeFeature: { id: PAC08_FEATURE_ID, planPath: `specs/${PAC08_FEATURE_ID}/prd.md`, phase: "implementation" },
    planApproval: { poGateAuthority: { planSha256: PAC08_PLAN_SHA256, specSha256: PAC08_SPEC_SHA256 } },
  }, null, 2)}\n`);
  pac08GatesYaml(fx.dir, "signature");
  const proof = pac08Proof({ manifest: fx.manifestRel, planSha256: digest });
  const deps = {
    // deliberately NO `dir` key at all -- the real CLI never injects one either.
    now: () => PAC08_NOW,
    gitCommonDir: fx.deps.gitCommonDir, ownerNonce: fx.deps.ownerNonce,
    gitCandidate: () => ({ ok: true, ...PAC08_CANDIDATE }),
  };
  const priorProjectDirSet = Object.hasOwn(process.env, "CLAUDE_PROJECT_DIR");
  const priorProjectDir = process.env.CLAUDE_PROJECT_DIR;
  let applied;
  try {
    process.env.CLAUDE_PROJECT_DIR = fx.dir;
    applied = reconcileApplyCmd(fx.dir, [
      "--manifest", fx.manifestRel, "--plan-sha256", digest,
      "--by", "PO", "--proof-request", proof.requestPath, "--proof-authority", proof.authorityPath, "--proof", proof.proofPath,
    ], deps);
  } finally {
    if (priorProjectDirSet) process.env.CLAUDE_PROJECT_DIR = priorProjectDir;
    else delete process.env.CLAUDE_PROJECT_DIR;
  }
  const receipt = JSON.parse(applied.out || "{}");
  ok("RGs the mandated self-governing topology (deps.dir omitted, --root resolving to the same directory as projectDir()) succeeds end-to-end -- a genuine PO-bound proof gates a real manifest rewrite even though the approval's own state write shares the reconcile's held lock path",
    applied.value === 0 && receipt.status === "applied", applied.out || applied.err);
  const persisted = JSON.parse(readFileSync(join(fx.dir, fx.manifestRel), "utf8"));
  ok("RGs-2 the manifest was actually rewritten in the self-governing topology, not a no-op",
    persisted.artifacts[0].sha256 === sha256Hex(grownPrd), JSON.stringify(persisted));
  const governingState = readState(fx.dir);
  ok("RGs-3 the SAME directory's governing state now carries both the reconcile's usual approval side effects (lastApproved/criticalProofConsumption) proving the write genuinely happened despite sharing the lock path",
    governingState.status === "ok"
    && governingState.state.featurePackageReconcileApproval?.lastApproved?.approvedBy === "PO"
    && governingState.state.featurePackageReconcileApproval.lastApproved.forCommit === PAC08_CANDIDATE.commit
    && Array.isArray(governingState.state.criticalProofConsumption)
    && governingState.state.criticalProofConsumption.some((entry) => entry.kind === "feature-package-reconcile"),
    JSON.stringify(governingState));
}

{
  // RGt -- PHX-WP-RECONCILE-LOCK-SYMLINK-TEST (regression test for the reconcile lock-reuse
  // fix landed 2026-08-18: reuseLock in defaultFeaturePackageReconcileApproval now compares
  // realpathSync-resolved paths via holderLock.path instead of a lexical resolve() comparison
  // -- see plugins/pipeline-core/scripts/pipeline-state.mjs, the comment above `reuseLock`).
  // Modeled directly on RGs above, with one added wrinkle: CLAUDE_PROJECT_DIR (which
  // `dir = deps.dir ?? projectDir()` resolves through, since deps.dir is deliberately
  // omitted) points at a SYMLINK that resolves to the SAME real directory `--root` names,
  // rather than at that literal directory itself. `--root` itself stays the real, unsymlinked
  // path -- physicalRebindFile()'s own, unrelated ancestor-symlink safety check would refuse
  // an actually-symlinked `--root` before ever reaching `reuseLock` (FTP-RECONCILE-IDENTITY),
  // which is a different guarantee than the one under test here. Before the lock-reuse fix,
  // `continuityLockPath(dir)` was compared lexically against `holderLock.path` (acquired
  // under the real `--root` path), so a symlink-reached `dir` produced a DIFFERENT string
  // even though it names the identical file on disk, and the approval's own writeState() call
  // would then try to acquire a SECOND exclusive lock on that identical path -- colliding with
  // itself (PS-CONTINUITY-LOCKED / FTP-RECONCILE-APPROVAL-REJECTED) even though the caller
  // already legitimately holds that lock. realpathSync-based comparison resolves both sides
  // to the same real path and correctly reuses the lock.
  const fx = seedReconcilePackage("rgt-self-governing-symlink");
  const grownPrd = "# rec-pkg PRD (grown)\n";
  writeFileSync(join(fx.dir, fx.files.prd.rel), grownPrd);
  const { digest } = reconcilePlanDigest(fx);
  mkdirSync(join(fx.dir, "project"), { recursive: true });
  writeFileSync(join(fx.dir, "project", "pipeline-state.json"), `${JSON.stringify({
    schema: SCHEMA_ID, planApproved: true,
    activeFeature: { id: PAC08_FEATURE_ID, planPath: `specs/${PAC08_FEATURE_ID}/prd.md`, phase: "implementation" },
    planApproval: { poGateAuthority: { planSha256: PAC08_PLAN_SHA256, specSha256: PAC08_SPEC_SHA256 } },
  }, null, 2)}\n`);
  pac08GatesYaml(fx.dir, "signature");
  const proof = pac08Proof({ manifest: fx.manifestRel, planSha256: digest });
  // A symlink, reserved via freshDir() (so ALL_DIRS cleanup removes the symlink entry itself
  // -- rmSync on a symlink unlinks it without following into the target), that resolves to
  // fx.dir's real path. This is the "`--root` reached through a symlink" case the fix closes.
  const symlinkRoot = freshDir("rgt-self-governing-symlink-root");
  rmSync(symlinkRoot, { recursive: true, force: true });
  symlinkSync(fx.dir, symlinkRoot, "dir");
  const deps = {
    // deliberately NO `dir` key at all -- the real CLI never injects one either.
    now: () => PAC08_NOW,
    gitCommonDir: fx.deps.gitCommonDir, ownerNonce: fx.deps.ownerNonce,
    gitCandidate: () => ({ ok: true, ...PAC08_CANDIDATE }),
  };
  const priorProjectDirSet = Object.hasOwn(process.env, "CLAUDE_PROJECT_DIR");
  const priorProjectDir = process.env.CLAUDE_PROJECT_DIR;
  let applied;
  try {
    process.env.CLAUDE_PROJECT_DIR = symlinkRoot;
    applied = reconcileApplyCmd(fx.dir, [
      "--manifest", fx.manifestRel, "--plan-sha256", digest,
      "--by", "PO", "--proof-request", proof.requestPath, "--proof-authority", proof.authorityPath, "--proof", proof.proofPath,
    ], deps);
  } finally {
    if (priorProjectDirSet) process.env.CLAUDE_PROJECT_DIR = priorProjectDir;
    else delete process.env.CLAUDE_PROJECT_DIR;
  }
  const receipt = JSON.parse(applied.out || "{}");
  ok("RGt a symlinked --root resolving (via realpath) to the same directory as the caller's already-held lock reuses that lock instead of self-colliding -- no PS-CONTINUITY-LOCKED/FTP-RECONCILE-APPROVAL-REJECTED",
    applied.value === 0 && receipt.status === "applied", applied.out || applied.err);
  const persisted = JSON.parse(readFileSync(join(fx.dir, fx.manifestRel), "utf8"));
  ok("RGt-2 the manifest was actually rewritten through the symlinked topology, not a no-op",
    persisted.artifacts[0].sha256 === sha256Hex(grownPrd), JSON.stringify(persisted));
  const governingState = readState(fx.dir);
  ok("RGt-3 the SAME real directory's governing state now carries both the reconcile's usual approval side effects (lastApproved/criticalProofConsumption), proving the write genuinely happened despite the caller's lock having been acquired under a symlinked path",
    governingState.status === "ok"
    && governingState.state.featurePackageReconcileApproval?.lastApproved?.approvedBy === "PO"
    && governingState.state.featurePackageReconcileApproval.lastApproved.forCommit === PAC08_CANDIDATE.commit
    && Array.isArray(governingState.state.criticalProofConsumption)
    && governingState.state.criticalProofConsumption.some((entry) => entry.kind === "feature-package-reconcile"),
    JSON.stringify(governingState));
}

}

runFeaturePackageReadTests();
runFeaturePackageWriteTests();
runAuthorityRevisionTests();
runFeaturePackageReconcileTests();

// ---- PHX-WP-HUMANLEGIBLE-APPROVAL: H-AC-11 covering test -- the plan-approval gate's
// human-legible, closed-vocabulary briefing is derived from bound artifacts, presented
// at both submit-plan and approve-plan, persisted with the approval, and a reviewer
// reconstruction fails on a tampered/mismatched persisted briefing while exposing the
// briefing alongside the digests on a genuine one. ---------------------------------------
{
  const dir = freshDir("humanlegible-briefing");
  const planPath = "specs/humanlegible/prd_hl.md";
  run(["set-feature", "--id", "hl-feature", "--plan-path", planPath], { dir, now: FIXED_NOW });
  const initialized = initializeLifecycleContinuity(dir, "hl-feature", planPath);
  const deps = lifecycleDeps(dir, planPath);
  const submitted = captureConsole(() => run(["submit-plan", "--by", "coordinator", "--profile", "feature"], deps));
  ok("HL-1 continuity-init exit 0", initialized === 0, `got ${initialized}`);
  ok("HL-2 submit-plan exit 0", submitted.value === 0, `got ${submitted.value}`);
  ok("HL-3 submit-plan prints the human-legible briefing (not just digests)", submitted.text.includes("Briefing:") && submitted.text.includes("scope=") && submitted.text.includes("authorizes=") && submitted.text.includes("excludes="), submitted.text);

  const approved = captureConsole(() => run(["approve-plan", "--by", "po-test"], deps));
  ok("HL-4 approve-plan exit 0", approved.value === 0, `got ${approved.value}`);
  ok("HL-5 approve-plan's gate presentation shows the briefing too", approved.text.includes("Briefing:") && approved.text.includes("authorizes=") && approved.text.includes("excludes="), approved.text);

  const state = readState(dir).state;
  const briefing = state.planApprovalBriefing;
  ok("HL-6 briefing persisted alongside the approval", briefing !== undefined);
  ok(
    "HL-7 briefing is a closed, bounded record -- exactly {schema, scope, change, authorizes, excludes}, no free-form field",
    JSON.stringify(Object.keys(briefing).sort()) === JSON.stringify(["authorizes", "change", "excludes", "schema", "scope"].sort()),
    JSON.stringify(briefing),
  );
  ok(
    "HL-8 briefing scope is derived from the bound artifacts (plan/spec paths+digests, profile, featureId)",
    briefing.scope.featureId === "hl-feature"
      && briefing.scope.planPath === state.planApproval.poGateAuthority.planPath
      && briefing.scope.planSha256 === state.planApproval.poGateAuthority.planSha256
      && briefing.scope.specPath === state.planApproval.poGateAuthority.specPath
      && briefing.scope.specSha256 === state.planApproval.poGateAuthority.specSha256
      && briefing.scope.profile === "feature",
    JSON.stringify(briefing.scope),
  );
  ok("HL-9 first submission classified as initial-submission with no prior approval", briefing.change.kind === "initial-submission" && briefing.change.previousApprovalSha256 === null);
  ok(
    "HL-10 authorizes/excludes are drawn from the fixed closed vocabulary (never free text)",
    Array.isArray(briefing.authorizes) && briefing.authorizes.every((v) => typeof v === "string")
      && Array.isArray(briefing.excludes) && briefing.excludes.every((v) => typeof v === "string")
      && briefing.excludes.includes("push") && briefing.excludes.includes("deploy") && briefing.excludes.includes("publication"),
    JSON.stringify({ authorizes: briefing.authorizes, excludes: briefing.excludes }),
  );

  // Reviewer reconstruction on a genuine record: exposes the briefing alongside the digests.
  const goodReconstruction = reconstructPlanApprovalBriefing(state);
  ok(
    "HL-11 reviewer reconstruction succeeds and exposes the briefing alongside the digests",
    goodReconstruction.ok === true
      && JSON.stringify(goodReconstruction.briefing) === JSON.stringify(briefing)
      && goodReconstruction.approvalSha256 === sha256CanonicalJson(state.planApproval)
      && goodReconstruction.planSha256 === state.planApproval.poGateAuthority.planSha256
      && goodReconstruction.specSha256 === state.planApproval.poGateAuthority.specSha256,
    JSON.stringify(goodReconstruction),
  );

  // A resubmission with a materially different binding (same path, changed content) is
  // classified as a change against the prior approved binding, not silently as identical.
  const originalAuthorityValue = deps.poGateAuthority().value;
  function changedAuthority({ expectedPlanSha256, expectedSpecSha256 } = {}) {
    const value = {
      ...originalAuthorityValue,
      planSha256: createHash("sha256").update(`fixture:${planPath}:v2`).digest("hex"),
    };
    return (expectedPlanSha256 === undefined || expectedPlanSha256 === value.planSha256)
      && (expectedSpecSha256 === undefined || expectedSpecSha256 === value.specSha256)
      ? { ok: true, code: "PO-GATE-AUTHORITY-VALID", value }
      : { ok: false, code: "PO-GATE-AUTHORITY-STALE" };
  }
  const reopened = run(["reopen-design", "--by", "po-test"], deps);
  const changedDeps = { ...deps, poGateAuthority: changedAuthority };
  const resubmitted = captureConsole(() => run(["submit-plan", "--by", "coordinator", "--profile", "feature"], changedDeps));
  ok("HL-12 reopen-design + resubmit with changed content exit 0", reopened === 0 && resubmitted.value === 0, `reopened=${reopened} resubmitted=${resubmitted.value}`);
  const resubmittedState = readState(dir).state;
  ok(
    "HL-13 change classification reports plan-changed against the prior approved binding, with a non-null previousApprovalSha256",
    resubmittedState.planApprovalBriefing.change.kind === "plan-changed"
      && resubmittedState.planApprovalBriefing.change.previousApprovalSha256 === sha256CanonicalJson(state.planApproval),
    JSON.stringify(resubmittedState.planApprovalBriefing.change),
  );

  // Reviewer reconstruction on a TAMPERED persisted briefing (excludes narrowed after the
  // fact, still within the closed vocabulary shape) must fail, not silently trust the bytes.
  const reapproved = run(["approve-plan", "--by", "po-test"], changedDeps);
  ok("HL-14 fixture re-approves the changed submission", reapproved === 0, `got ${reapproved}`);
  const genuine = readState(dir).state;
  const tampered = {
    ...genuine,
    planApprovalBriefing: { ...genuine.planApprovalBriefing, excludes: ["push", "deploy"] },
  };
  const tamperedReconstruction = reconstructPlanApprovalBriefing(tampered);
  ok(
    "HL-15 an approval whose persisted briefing does not match the bound artifacts FAILS reconstruction",
    tamperedReconstruction.ok === false && tamperedReconstruction.code === "PLAN-APPROVAL-BRIEFING-MISMATCH",
    JSON.stringify(tamperedReconstruction),
  );

  // A missing briefing (pre-migration record) fails distinctly rather than crashing.
  const { planApprovalBriefing: _dropped, ...noBriefing } = genuine;
  const missingReconstruction = reconstructPlanApprovalBriefing(noBriefing);
  ok(
    "HL-16 a persisted approval with no briefing at all fails reconstruction with a distinct code",
    missingReconstruction.ok === false && missingReconstruction.code === "PLAN-APPROVAL-BRIEFING-INVALID",
    JSON.stringify(missingReconstruction),
  );

  // No approval at all: reconstruction refuses cleanly rather than exposing anything.
  const noApprovalReconstruction = reconstructPlanApprovalBriefing({});
  ok(
    "HL-17 reconstruction on a state with no approval refuses with a distinct code",
    noApprovalReconstruction.ok === false && noApprovalReconstruction.code === "PLAN-APPROVAL-BRIEFING-NO-APPROVAL",
    JSON.stringify(noApprovalReconstruction),
  );
}

// ---- Cleanup ------------------------------------------------------------------------------
for (const dir of ALL_DIRS) {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    /* best-effort */
  }
}

// ---- Summary ------------------------------------------------------------------------------
const total = pass + failures.length;
console.log(`\n${pass}/${total} cases passed.`);
if (failures.length > 0) {
  console.log("Failures:");
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
process.exit(0);
