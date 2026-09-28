import {designReadinessReportSha256,designReadinessRunnerSelectionSha256} from './design-readiness-hashes.mjs';
import {createCodexDesignReadinessHostStore} from './codex-design-readiness-host-store.mjs';
import {verifyCodexToolFreeBindingFromSources} from './codex-tool-free-design-readiness.mjs';
// SPDX-License-Identifier: SUL-1.0

/** Host-observed execution binding for design-readiness reports. */
import { createHash } from "node:crypto";
import { readFileSync, realpathSync, lstatSync } from "node:fs";
import { isAbsolute } from "node:path";
import { resolveSystemExecutable } from "./trusted-tool-resolution.mjs";
import { TextDecoder } from "node:util";

import { ADVISORY_EVIDENCE_BUNDLE_SCHEMA, validateAdvisoryEvidenceBundle } from "./advisory-lifecycle-v2.mjs";
import { bindSandboxedReadonlyDuty } from "./sandboxed-readonly-duty.mjs";
import { canonicalJson } from "./codex-sandbox-compatibility.mjs";
import { resolveV3DutyRoute } from "./critic-route-v3.mjs";
import { validateAgainstSchema } from "./schema-lite.mjs";
import { createDesignReadinessRunnerHostStore, designReadinessRunnerHostReceiptSha256 } from "./design-readiness-runner-host-store.mjs";
import { derivePoGateRepositoryFingerprint, resolvePoGateRepositoryTopology } from "./po-gate-authority.mjs";
import { createRepositorySandboxSelectionStore, sandboxSelectionDigest } from "../scripts/codex-sandbox-select.mjs";

const SHA256 = /^[a-f0-9]{64}$/u;
const SELECTION_ID = /^css_[a-z2-7]{25}[aeimquy4]$/u;
const RUNNER_RECEIPT_ID = /^drh_[a-f0-9]{32}$/u;
const UTF8 = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
const RECEIPT_SCHEMA = JSON.parse(readFileSync(new URL("../schemas/pipeline.design-readiness-receipt.v1.json", import.meta.url), "utf8"));

function fail(code) { return { ok: false, code }; }
function sha(bytes) { return createHash("sha256").update(bytes).digest("hex"); }
function exact(value, keys) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

/**
 * Digest the actual bounded readiness report, excluding its non-recursive
 * host binding. This is the duty digest the selected host must persist.
 */
export { designReadinessReportSha256, designReadinessRunnerSelectionSha256 };

/** Digest the stable, nonrecursive selection fields in a local runner receipt. */


/**
 * Validate the model-authored portion of a readiness receipt. The final
 * persisted schema requires hostExecution, but that field is host authority
 * and must not be accepted from the model. Derive this closed projection from
 * the canonical persisted schema so every other field retains identical
 * constraints.
 */
export function validateDesignReadinessModelOutput(report) {
  const schema = designReadinessModelOutputSchema();
  return validateAgainstSchema(report, schema);
}

/**
 * Return the closed model-output schema before the host adds its execution
 * binding. Runner CLIs use this exact projection for structured-output
 * enforcement; the host still validates the returned object independently.
 */
export function designReadinessModelOutputSchema({ runner, dispatchId, candidate, sources } = {}) {
  const schema = structuredClone(RECEIPT_SCHEMA);
  schema.$id = "pipeline.design-readiness-model-output.v1";
  schema.title = "Model-authored design readiness report before host binding";
  schema.required = schema.required.filter((key) => key !== "hostExecution");
  delete schema.properties.hostExecution;
  if (runner !== undefined) schema.properties.runner = { const: runner };
  if (dispatchId !== undefined) schema.properties.dispatchId = { const: dispatchId };
  if (candidate !== undefined) schema.properties.candidate = { const: structuredClone(candidate) };
  if (sources !== undefined) schema.properties.sources = { const: structuredClone(sources) };
  return schema;
}

function expectedReferenceSetSha256(sources, sourceBytes) {
  if (!sources || typeof sources !== "object" || Array.isArray(sources)
    || !sourceBytes || typeof sourceBytes !== "object" || Array.isArray(sourceBytes)) {
    throw new Error("readiness sources are invalid");
  }
  const references = Object.values(sources).map((source) => {
    // The advisory evidence-bundle path grammar is intentionally narrower
    // than the design-package path grammar (notably, it excludes `:`).
    // Refuse the incompatible source rather than hashing a bundle that the
    // selected-duties producer could never have admitted.
    if (typeof source?.path !== "string" || source.path.includes(":")) {
      throw new Error("readiness source path is not admissible to the selected duty");
    }
    const entry = Object.values(sourceBytes).find((candidate) => candidate.path === source.path);
    if (!entry || !Buffer.isBuffer(entry.bytes) || entry.bytes.length > 262_144) {
      throw new Error("readiness source bytes are unavailable");
    }
    const content = UTF8.decode(entry.bytes);
    return { path: source.path, sha256: source.sha256, bytes: entry.bytes.length, content };
  }).sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0);
  const checked = validateAdvisoryEvidenceBundle({ schema: ADVISORY_EVIDENCE_BUNDLE_SCHEMA, references });
  if (!checked.ok) throw new Error("readiness references exceed selected-duty bounds");
  return checked.bundleSha256;
}

/**
 * Verify a readiness binding against the runner's private, durable host store.
 * Codex uses its selected-sandbox journal. Claude and Antigravity use a local
 * host observation receipt, explicitly not a provider attestation.
 */
export function verifyDesignReadinessHostExecution({
  repoRoot,
  hostExecution,
  readinessReceipt,
  candidate,
  sources,
  sourceBytes,
  storeFactory = createRepositorySandboxSelectionStore,
  runnerStoreFactory = ({ gitCommonDir, repoFingerprint }) => createDesignReadinessRunnerHostStore({ gitCommonDir, repoFingerprint }),
  codexHostStoreFactory = createCodexDesignReadinessHostStore,
  resolveCodexExecutable = resolveSystemExecutable,
  resolveTopology = resolvePoGateRepositoryTopology,
  deriveRepositoryFingerprint = derivePoGateRepositoryFingerprint,
  resolveRoute = resolveV3DutyRoute,
} = {}) {
  if (!exact(hostExecution, ["schema", "runner", "repoFingerprint", "selectionId", "selectionSha256", "executionReceiptSha256", "dutyReceiptSha256", "route"])
    || hostExecution.schema !== "pipeline.design-readiness-host-execution.v1"
    || !["claude", "codex", "antigravity"].includes(hostExecution.runner)
    || !SHA256.test(hostExecution.repoFingerprint ?? "")
    || !(hostExecution.runner === "codex" ? (SELECTION_ID.test(hostExecution.selectionId ?? "") || RUNNER_RECEIPT_ID.test(hostExecution.selectionId ?? "")) : RUNNER_RECEIPT_ID.test(hostExecution.selectionId ?? ""))
    || !SHA256.test(hostExecution.selectionSha256 ?? "")
    || !SHA256.test(hostExecution.executionReceiptSha256 ?? "")
    || !SHA256.test(hostExecution.dutyReceiptSha256 ?? "")
    || !exact(hostExecution.route, ["model", "effort", "sourceSha256", "candidateCommit"])
    || typeof hostExecution.route.model !== "string" || hostExecution.route.model.length === 0
    || typeof hostExecution.route.effort !== "string" || hostExecution.route.effort.length === 0
    || !SHA256.test(hostExecution.route.sourceSha256 ?? "")
    || hostExecution.route.candidateCommit !== candidate?.commit) return fail("DWP-READINESS-HOST-BINDING");
  if (hostExecution.runner === "codex" && RUNNER_RECEIPT_ID.test(hostExecution.selectionId)) {
    try {
      const topology = resolveTopology(repoRoot);
      if (!topology || deriveRepositoryFingerprint({gitCommonDir:topology.gitCommonDir,primaryRoot:topology.primaryRoot}) !== hostExecution.repoFingerprint) return fail('DWP-READINESS-HOST-REPOSITORY-MISMATCH');
      const resolved = resolveRoute({rootDir:repoRoot,dutyId:'readiness',runner:'codex',candidateCommit:candidate.commit});
      if (resolved?.state !== 'default' || resolved.runner !== 'codex') return fail('DWP-READINESS-HOST-ROUTE-MISMATCH');
      const route = Object.fromEntries(['model','effort','sourceSha256','candidateCommit'].map(key=>[key,resolved[key]]));
      const executable = resolveCodexExecutable('codex');
      if (typeof executable !== 'string' || !isAbsolute(executable)) return fail('DWP-READINESS-HOST-EXECUTABLE-UNAVAILABLE');
      const trustedExecutablePath = realpathSync(executable);
      if (!lstatSync(trustedExecutablePath).isFile()) return fail('DWP-READINESS-HOST-EXECUTABLE-UNAVAILABLE');
      const store = codexHostStoreFactory({gitCommonDir:topology.gitCommonDir,repoFingerprint:hostExecution.repoFingerprint,trustedExecutablePath});
      const checked = verifyCodexToolFreeBindingFromSources({hostExecution,report:readinessReceipt,candidate,sources,sourceBytes,
        route,store,repoFingerprint:hostExecution.repoFingerprint});
      return checked.ok ? checked : fail('DWP-READINESS-HOST-RECEIPT-MISMATCH');
    } catch {return fail('DWP-READINESS-HOST-RECEIPT-UNAVAILABLE');}
  }
  if (hostExecution.runner !== "codex") {
    let topology;
    let store;
    let saved;
    try {
      topology = resolveTopology(repoRoot);
      if (!topology || deriveRepositoryFingerprint({ gitCommonDir: topology.gitCommonDir, primaryRoot: topology.primaryRoot })
        !== hostExecution.repoFingerprint) return fail("DWP-READINESS-HOST-REPOSITORY-MISMATCH");
      store = runnerStoreFactory({ gitCommonDir: topology.gitCommonDir, repoFingerprint: hostExecution.repoFingerprint });
      saved = store.read(hostExecution.selectionId);
    } catch { return fail("DWP-READINESS-HOST-RECEIPT-UNAVAILABLE"); }
    try {
      const receipt = saved?.value;
      const route = resolveRoute({ rootDir: repoRoot, dutyId: "readiness", runner: hostExecution.runner, candidateCommit: candidate.commit });
      const reportSha256 = designReadinessReportSha256(readinessReceipt);
      expectedReferenceSetSha256(sources, sourceBytes);
      if (!route || route.state !== "default"
        || route.model !== hostExecution.route.model || route.effort !== hostExecution.route.effort
        || route.sourceSha256 !== hostExecution.route.sourceSha256 || route.candidateCommit !== hostExecution.route.candidateCommit) {
        return fail("DWP-READINESS-HOST-ROUTE-MISMATCH");
      }
      if (!receipt || receipt.runner !== hostExecution.runner || receipt.repoFingerprint !== hostExecution.repoFingerprint
        || receipt.dispatchId !== readinessReceipt?.dispatchId
        || receipt.dutyReceiptSha256 !== hostExecution.dutyReceiptSha256
        || canonicalJson(receipt.candidate) !== canonicalJson(candidate)
        || canonicalJson(receipt.sources) !== canonicalJson(sources)
        || canonicalJson(receipt.route) !== canonicalJson(hostExecution.route)
        || readinessReceipt?.runner !== hostExecution.runner
        || canonicalJson(readinessReceipt?.candidate) !== canonicalJson(candidate)
        || canonicalJson(readinessReceipt?.sources) !== canonicalJson(sources)
        || receipt.receiptId !== hostExecution.selectionId
        || designReadinessRunnerHostReceiptSha256(receipt) !== hostExecution.executionReceiptSha256
        || designReadinessRunnerSelectionSha256(receipt) !== hostExecution.selectionSha256
        || reportSha256 !== hostExecution.dutyReceiptSha256) return fail("DWP-READINESS-HOST-RECEIPT-MISMATCH");
      const reread = store.read(hostExecution.selectionId);
      if (!reread || reread.sha256 !== saved.sha256 || canonicalJson(reread.value) !== canonicalJson(receipt)) {
        return fail("DWP-READINESS-HOST-RECEIPT-DRIFT");
      }
      return { ok: true, selectionId: hostExecution.selectionId, reportSha256, assurance: "host-observed-local" };
    } catch { return fail("DWP-READINESS-HOST-RECEIPT-INVALID"); }
  }
  let store;
  let selection;
  let execution;
  let journal;
  try {
    store = storeFactory({ repoRoot, repoFingerprint: hostExecution.repoFingerprint });
    selection = store.readSelection(hostExecution.selectionId);
    execution = store.readExecution(hostExecution.selectionId);
    journal = store.readJournal(hostExecution.selectionId);
  } catch {
    return fail("DWP-READINESS-HOST-RECEIPT-UNAVAILABLE");
  }
  try {
    const route = resolveRoute({ rootDir: repoRoot, dutyId: "readiness", runner: "codex", candidateCommit: candidate.commit });
    if (route?.state !== "default" || route?.runner !== "codex" || route?.model !== hostExecution.route.model
      || route?.effort !== hostExecution.route.effort || route?.sourceSha256 !== hostExecution.route.sourceSha256
      || route?.candidateCommit !== hostExecution.route.candidateCommit) return fail("DWP-READINESS-HOST-ROUTE-MISMATCH");
    const selectionSha256 = sandboxSelectionDigest(selection);
    const executionReceiptSha256 = sha(Buffer.from(canonicalJson(execution), "utf8"));
    const reportSha256 = designReadinessReportSha256(readinessReceipt);
    const referenceSetSha256 = expectedReferenceSetSha256(sources, sourceBytes);
    const bound = bindSandboxedReadonlyDuty({ selection, execution });
    if (selection.status !== "selected" || selection.duty !== "readiness"
      || selection.repoFingerprint !== hostExecution.repoFingerprint
      || selection.dispatch.candidateCommit !== candidate.commit
      || selection.dispatch.candidateTree !== candidate.tree
      || selection.dispatch.referenceSetSha256 !== referenceSetSha256
      || execution.requested.runner !== "codex"
      || execution.requested.model !== route.model
      || journal.phase !== "duty-bound"
      || journal.selectionSha256 !== selectionSha256
      || journal.dutyReceiptSchema !== execution.dutyReceipt.schema
      || journal.dutyReceiptSha256 !== execution.dutyReceipt.sha256
      || execution.dutyReceipt.schema !== "pipeline.readiness-receipt.v1"
      || execution.dutyReceipt.sha256 !== reportSha256
      || bound.selectionId !== hostExecution.selectionId
      || bound.selectionSha256 !== hostExecution.selectionSha256
      || bound.dutyReceipt.sha256 !== hostExecution.dutyReceiptSha256
      || selectionSha256 !== hostExecution.selectionSha256
      || executionReceiptSha256 !== hostExecution.executionReceiptSha256
      || reportSha256 !== hostExecution.dutyReceiptSha256) return fail("DWP-READINESS-HOST-RECEIPT-MISMATCH");
    // Detect concurrent replacement between the three independent private
    // reads. The store itself validates each record and journal digest.
    if (canonicalJson(store.readSelection(hostExecution.selectionId)) !== canonicalJson(selection)
      || canonicalJson(store.readExecution(hostExecution.selectionId)) !== canonicalJson(execution)
      || canonicalJson(store.readJournal(hostExecution.selectionId)) !== canonicalJson(journal)) {
      return fail("DWP-READINESS-HOST-RECEIPT-DRIFT");
    }
    return { ok: true, selectionId: hostExecution.selectionId, reportSha256 };
  } catch {
    return fail("DWP-READINESS-HOST-RECEIPT-INVALID");
  }
}
