// SPDX-License-Identifier: SUL-1.0
/**
 * One entry gate in front of the implementation phase.
 *
 * Every greenfield run on every runner lost its happy path the same way: the checks in front of the PO's signature were a subset of the
 * checks behind it, each refusal named only the first fault, and the fault surfaced after the signature, so the design was reopened and
 * signed again. This module is the collector: a caller hands it the real readers as named checks, it runs ALL of them, a reader that
 * throws becomes a finding instead of hiding the rest, and the result lists every open point at once with its repair.
 *
 * It decides nothing itself and grants nothing: `ready` only means no check reported a finding. The readers stay where they are, so the
 * same code answers before the signature and at `set-phase implementation`.
 */

export const IMPLEMENTATION_ENTRY_GATE_SCHEMA = "pipeline.implementation-entry-gate.v1";

const STAGES = new Set(["before-signature", "before-implementation"]);

/** One finding in its closed shape. `text` is a complete refusal sentence a reader already renders, kept verbatim. */
function finding(check, item) {
  return Object.freeze({
    check,
    code: typeof item.code === "string" && item.code !== "" ? item.code : "ENTRY-GATE-UNSPECIFIED",
    path: typeof item.path === "string" && item.path !== "" ? item.path : null,
    message: typeof item.message === "string" && item.message !== "" ? item.message : null,
    repair: typeof item.repair === "string" && item.repair !== "" ? item.repair : null,
    text: typeof item.text === "string" && item.text !== "" ? item.text : null,
  });
}

/**
 * Run every check. A check returns null/undefined (nothing open), one finding, or an array of findings.
 * @param {{stage: string, checks: {id: string, run: Function}[]}} input
 */
export function runImplementationEntryGate({ stage, checks } = {}) {
  if (!STAGES.has(stage) || !Array.isArray(checks)) throw new TypeError("runImplementationEntryGate needs a known stage and a list of checks");
  const findings = [];
  for (const { id, run } of checks) {
    let produced;
    try {
      produced = run();
    } catch {
      findings.push(finding(id, { code: "ENTRY-GATE-CHECK-UNAVAILABLE", message: `the ${id} check could not run`, repair: "Run the same command again; if this stays, treat the check as failed and do not ask for a signature." }));
      continue;
    }
    for (const item of Array.isArray(produced) ? produced : [produced]) {
      if (item !== null && item !== undefined) findings.push(finding(id, item));
    }
  }
  return Object.freeze({ schema: IMPLEMENTATION_ENTRY_GATE_SCHEMA, stage, status: findings.length === 0 ? "ready" : "blocked", findings: Object.freeze(findings) });
}

const COMMIT_THEN_REPEAT = "Commit it, then run this command again. A reviewed file that changed needs a new review receipt for the committed bytes.";
const REPEAT_REVIEW = "Run the design review for the current committed bytes (a delta round passes --previous <receipt>), then pass the new receipt with --review-receipt. Never re-stamp an old report over changed files.";

/** The repair for a known code. Agent work, repository-relative, and never a reopen-design for something a draft can still fix. */
const REPAIRS = new Map([
  ["DCC-REVIEW-RECEIPT-MISSING", "Pass one or two receipts: present-plan --by <name> --review-receipt <repo-relative-json-path>. A receipt comes from design-review-receipt.mjs create, never by hand."],
  ["DCC-REVIEW-RECEIPT-BINDING", REPEAT_REVIEW],
  ["DCC-REVIEW-DELTA-CHAIN", "Create the later receipt with --previous <the earlier receipt>, then pass both in order."],
  ["DCC-REVIEW-ROUND-EXCEEDED", "At most two review rounds bind one approval: keep the initial receipt and the last delta receipt."],
  ["DCC-PATH-UNSAFE", "The bound path must be a regular repository file; restore it or remove it from the receipt's companions."],
  ["DCC-PATH-IGNORED", "A bound file must be committed, so it cannot live under a git-ignored directory: move it into the feature folder specs/<feature>/, update the reference, commit, and create the receipt again."],
  ["DCC-PATH-UNTRACKED", `Stage this file. ${COMMIT_THEN_REPEAT}`],
  ["DCC-PATH-MODIFIED", COMMIT_THEN_REPEAT],
  ["DCC-PRD-DIGEST-DRIFT", "The PRD changed after submit-plan. Commit it and run submit-plan again."],
  ["DCC-SPEC-DIGEST-DRIFT", "The Spec changed after submit-plan. Update the marker line in the PRD, commit both, and run submit-plan again."],
  ["DCC-PRD-MARKER-MISSING", "Add one line <!-- technical-spec-sha256: <sha256 of spec.md> --> to the PRD, commit, and run submit-plan again."],
  ["DCC-PRD-MARKER-DUPLICATE", "Keep exactly one <!-- technical-spec-sha256: ... --> line in the PRD, commit, and run submit-plan again."],
  ["DCC-PRD-MARKER-STALE", "Set the <!-- technical-spec-sha256: ... --> line in the PRD to the expected digest, commit, and run submit-plan again."],
  ["DCC-COMPANION-UNBOUND", "Create the review receipt again with --companion <this path>."],
  ["DCC-REGISTER-INVALID", "Repair the requirement map or traceability file named here, commit it, and review the result."],
  ["DCC-ID-DUPLICATE", "Give each requirement id one row, commit, and review the result."],
  ["DCC-COUNT-MISMATCH", "Bring the requirement count and the rows into agreement, commit, and review the result."],
  ["DDB-PROSPECTIVE-COMPANION-REQUIRED", "The prospective architecture manifest must be a companion of the review receipt: create the receipt again with --companion <this path>."],
  ["DDB-PROSPECTIVE-INPUT-COMPANION-REQUIRED", "Every file the prospective architecture manifest reads must be a companion of the review receipt: create the receipt again with --companion <this path>."],
  ["DDB-PROSPECTIVE-PLACEHOLDER-REMAINS", "An ADR draft still has REPLACE: lines: write its Markdown, run create-adr.mjs --root <root> --slug <slug> --refresh, run bind-adr-proposals.mjs again, then commit and redo the design review."],
  ["DDB-TRUST-UNAVAILABLE", "No signing key is registered for this repository, so a signature could not be verified after it is given. The PO registers one once with po-human-approval.mjs setup."],
  ["DDB-CANDIDATE-SOURCE-MODE", "A bound file is not in the current commit. Commit it, then run this command again."],
  ["DDB-CANDIDATE-SOURCE-DRIFT", "A bound file differs from the current commit. Commit it, then run this command again."],
  ["DDB-WHOLE-DESIGN-SIGNATURE-REQUIRED", "This package carries decision bindings, and those are approved only by signature: set gates.human_approval to signature, or remove the bindings block."],
]);

export function entryGateRepair(code) {
  if (typeof code !== "string") return null;
  return REPAIRS.get(code) ?? null;
}

function renderFinding(verb, item) {
  if (item.text !== null) return item.text;
  const where = item.path === null ? "" : ` ${item.path}`;
  const said = item.message === null ? "" : `: ${item.message.replace(/\.$/u, "")}`;
  const repair = item.repair === null ? "" : ` Repair: ${item.repair}`;
  return `${verb} refused (${item.code})${where}${said}.${repair}`;
}

/** The refusal an agent reads: every open point, numbered, in one output. A single point reads as one ordinary refusal. */
export function renderImplementationEntryGate({ verb, result, recorded = "Nothing was recorded and no signature was requested." }) {
  const count = result.findings.length;
  if (count === 1) return `Error: ${renderFinding(verb, result.findings[0])} ${recorded}`;
  const lines = [`Error: ${verb} refused: ${count} open points. ${recorded} All of them are listed here, so fix them together and run the command once more:`];
  result.findings.forEach((item, index) => lines.push(`${index + 1}. ${renderFinding(verb, item)}`));
  return lines.join("\n");
}
