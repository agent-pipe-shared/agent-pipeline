// SPDX-License-Identifier: SUL-1.0
import { realpathSync, statSync } from "node:fs";
import { readCriticExportConsentState } from "../scripts/critic-export-consent.mjs";
import { checkCriticExportConsent } from "./critic-export-policy.mjs";

/** Admission for the host's already physically verified native references.
 * Reads only the selected physical project's saved decision. It never records a
 * grant, infers a recipient from a model, or grants external host permission.
 */
export function admitNativeCriticExport(input, root) {
  const context = input.exportContext;
  const recipient = context ? { provider: context.provider, runner: input.selection.route.runner, service: context.service } : null;
  const unavailable = (code) => ({
    schema: "pipeline.critic-export-consent-check.v1", ok: false, code,
    coverage: "not-covered",
    externalGates: { host: context?.hostGate ?? "not-observed", provider: context?.providerGate ?? "not-observed" },
    observedEndpoint: context?.observedEndpoint ?? null, declaredRecipient: recipient,
    disclosure: null, hostApprovalGranted: false,
  });
  if (!context) return unavailable("consent-context-required");
  let consent; let project;
  try {
    if (realpathSync(root) !== root) return unavailable("consent-root-alias");
    const stat = statSync(root, { bigint: true });
    project = { realPath: root, device: String(stat.dev), inode: String(stat.ino) };
    consent = readCriticExportConsentState(root);
  } catch { return unavailable("consent-state-unavailable"); }
  if (!consent) return unavailable("consent-missing");
  const invocation = {
    candidate: { commit: input.selection.dispatch.candidateCommit, tree: input.selection.dispatch.candidateTree },
    records: input.referenceRecords.map(({ path, sha256, blobOid }) => ({
      path, sha256, dataClass: blobOid === undefined ? "selected-review-evidence" : "repository-candidate",
    })),
  };
  return checkCriticExportConsent({
    scope: { project, recipient, purpose: "critic",
      sourceRoots: consent.plan?.scope?.sourceRoots,
      evidenceRoots: consent.plan?.scope?.evidenceRoots },
    consent, invocation, hostGate: context.hostGate, providerGate: context.providerGate,
    observedEndpoint: context.observedEndpoint,
  });
}
