// SPDX-License-Identifier: SUL-1.0
// The existing observation-governance policy/inventory validator, shared by Verify and the staged commit boundary.
const AUDIENCES = Object.freeze(["public-user", "maintainer", "machine"]);
const DOCUMENT_LIFECYCLES = Object.freeze([
  "maintained",
  "normative-record",
  "compatibility-redirect",
  "review-candidate",
]);

function exactKeys(value, expected) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return actual.length === wanted.length && actual.every((key, index) => key === wanted[index]);
}

function exactArray(actual, expected) {
  return Array.isArray(actual)
    && actual.length === expected.length
    && actual.every((entry, index) => entry === expected[index]);
}

function requireExactPolicy(policy, findings) {
  if (!exactKeys(policy, ["schema", "canonicalIssue", "lifecycle", "backlog", "privateOverlay", "documentation"])) {
    findings.push("OG-POLICY-SCHEMA root keys are not exact");
    return;
  }
  if (policy.schema !== "pipeline.observation-doc-governance.v1") findings.push("OG-POLICY-SCHEMA unsupported schema");

  const issue = policy.canonicalIssue;
  if (!exactKeys(issue, ["scope", "branchIndependent", "initialFormLabels", "controlledAreaLabelAllowed", "securityRoute"])
      || issue.scope !== "repository-global"
      || issue.branchIndependent !== true
      || !exactArray(issue.initialFormLabels, ["kind:observation", "triage:needs-review"])
      || issue.controlledAreaLabelAllowed !== true
      || issue.securityRoute !== "private-vulnerability-reporting") {
    findings.push("OG-ISSUE-AUTHORITY canonical Issue contract drifted");
  }

  const lifecycle = policy.lifecycle;
  const expectedTransitions = {
    observation: ["triage"],
    triage: ["confirmed"],
    confirmed: ["known-error", "backlog-link"],
    "known-error": ["backlog-link"],
    "backlog-link": [],
  };
  if (!exactKeys(lifecycle, ["states", "transitions"])
      || !exactArray(lifecycle?.states, Object.keys(expectedTransitions))
      || !exactKeys(lifecycle?.transitions, Object.keys(expectedTransitions))
      || Object.entries(expectedTransitions).some(([state, targets]) => !exactArray(lifecycle?.transitions?.[state], targets))) {
    findings.push("OG-LIFECYCLE observation lifecycle drifted");
  }

  const backlog = policy.backlog;
  if (!exactKeys(backlog, ["promotion", "requiresStablePublicBranch", "reciprocalLinksRequired", "automaticPromotion"])
      || backlog.promotion !== "explicit-after-triage"
      || backlog.requiresStablePublicBranch !== true
      || backlog.reciprocalLinksRequired !== true
      || backlog.automaticPromotion !== false) {
    findings.push("OG-BACKLOG backlog promotion contract drifted");
  }

  const overlay = policy.privateOverlay;
  if (!exactKeys(overlay, ["allowedContent", "mayReplacePublicIssue", "mayDuplicatePublicObservation"])
      || !exactArray(overlay.allowedContent, ["private-deltas", "public-issue-links", "public-backlog-links"])
      || overlay.mayReplacePublicIssue !== false
      || overlay.mayDuplicatePublicObservation !== false) {
    findings.push("OG-OVERLAY private overlay contract drifted");
  }
}

function checkInventory(policy, docsPaths, findings) {
  const documentation = policy?.documentation;
  if (!exactKeys(documentation, ["audiences", "lifecycles", "inventory"])
      || !exactArray(documentation?.audiences, AUDIENCES)
      || !exactArray(documentation?.lifecycles, DOCUMENT_LIFECYCLES)) {
    findings.push("OG-DOC-AXES documentation audience/lifecycle axes drifted");
    return;
  }
  if (!Array.isArray(documentation.inventory)) {
    findings.push("OG-DOC-INVENTORY inventory must be an array");
    return;
  }
  const paths = [];
  for (const [index, entry] of documentation.inventory.entries()) {
    if (!exactKeys(entry, ["audience", "lifecycle", "paths"])
        || !AUDIENCES.includes(entry.audience)
        || !DOCUMENT_LIFECYCLES.includes(entry.lifecycle)
        || !Array.isArray(entry.paths)
        || entry.paths.some((path) => typeof path !== "string" || !path.startsWith("docs/"))) {
      findings.push(`OG-DOC-INVENTORY invalid entry ${index}`);
      continue;
    }
    if (!exactArray(entry.paths, [...entry.paths].sort())) findings.push(`OG-DOC-ORDER inventory group ${index} paths must be sorted`);
    paths.push(...entry.paths);
  }
  if (new Set(paths).size !== paths.length) findings.push("OG-DOC-DUPLICATE inventory paths must be unique");
  const inventory = new Set(paths);
  const discovered = new Set(docsPaths);
  for (const path of docsPaths) if (!inventory.has(path)) findings.push(`OG-DOC-UNCLASSIFIED ${path}`);
  for (const path of paths) if (!discovered.has(path)) findings.push(`OG-DOC-INVENTORY-STALE ${path}`);
}

export function checkObservationDocumentation(policy, docsPaths) {
  const findings = [];
  requireExactPolicy(policy, findings);
  checkInventory(policy, docsPaths, findings);
  findings.sort();
  return { ok: findings.length === 0, findings };
}
