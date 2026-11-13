// SPDX-License-Identifier: SUL-1.0

/**
 * The lifecycle runbooks other than the close path (C19-G5 rest, AC-108): start, plan approval, implementation and push.
 * Pure data and pure functions; only scripts/generate-runbook.mjs imports it (the runtime link lives in runbook-link.mjs).
 *
 * Sources, in the order a step is built from them:
 *   - the push path takes its rows (layer, command, who runs it) from the quick-reference table of docs/push-release-flow.md, so a
 *     changed row changes the runbook; PUSH_ANNOTATIONS only adds what the table does not carry (needs, evidence, commit, next) and a
 *     row without an annotation, or an annotation without a row, is refused (RUNBOOK-SOURCE-ROW);
 *   - the plan, implementation and start paths list their steps here, each with the exact argv; the test pins every argv to the command
 *     catalogue (sanctionedPipelineStateArgs for the closed shapes, PIPELINE_STATE_COMMANDS for the verbs) and pins the plan path to the
 *     verbs buildInspectNextAction can hand out, so a step the catalogue no longer knows turns that test red.
 * Placeholders (<name>, <root>, ...) stay as they are; no timestamp, no absolute path, no host data.
 */

export const RUNBOOK_SCHEMA = "pipeline.runbook.v1";
export const PUSH_FLOW_DOC = "docs/push-release-flow.md";
const PLUGIN_COMMAND = (script, argv) => `node <plugin-root>/scripts/${script} ${argv.join(" ")}`;

/** A step that runs a plugin script; `catalogue` records the script, verb and argv the command is composed from. */
function scriptStep({ id, who = "agent", script, verb, argv, closed = false, needs = [], evidenceSchema = null, producer, commit = null, next = [] }) {
  return {
    id, who, command: PLUGIN_COMMAND(script, argv), needs, evidenceSchema, producer, humanGate: who === "po-only", next, commit,
    catalogue: { script, verb, argv, closed },
  };
}

/** A step with no plugin script behind it (git, gh, the project's own verify command, configuration). */
function otherStep({ id, who = "agent", command, needs = [], evidenceSchema = null, producer, commit = null, next = [] }) {
  return { id, who, command, needs, evidenceSchema, producer, humanGate: who === "po-only", next, commit, catalogue: null };
}

const STATE = "pipeline-state.mjs";
const inspectStep = (next) => scriptStep({
  id: "inspect", script: STATE, verb: "inspect", argv: ["inspect"], closed: true, needs: ["run from the repository root"],
  evidenceSchema: "pipeline.inspect.v1", producer: "read-only JSON: lifecycle status, the structural nextAction and the continuity drift", next,
});

function startSteps() {
  return [
    scriptStep({
      id: "preflight", script: "pipeline-start-preflight.mjs", verb: "--role", argv: ["--role", "<elephant|goldfish|critic>"],
      needs: ["a git work tree"], evidenceSchema: "pipeline.start-preflight.v1",
      producer: "one JSON envelope: ruleset, plugin identity, mandatory hooks, calibration, handover freshness; the bootstrap confirmation line follows it",
      next: ["inspect"],
    }),
    inspectStep([]),
  ];
}

function planSteps() {
  const recovery = ["submit-plan"];
  return [
    inspectStep(["set-feature", "submit-plan", "prepare-seal", "present-plan", "approve-plan"]),
    scriptStep({
      id: "set-feature", script: STATE, verb: "set-feature", closed: true,
      argv: ["set-feature", "--id", "<feature-id>", "--plan-path", "<prd-path>", "--spec-path", "<spec-path>"],
      needs: ["the PRD and the Spec are authored in the work tree"], producer: "activeFeature in pipeline state, lifecycle draft",
      commit: "commit the authored PRD and Spec before submitting", next: ["record-decisions", "submit-plan"],
    }),
    otherStep({
      id: "record-decisions", command: "call the architecture-decision skill once for each decision the design lists under decisions to record, and write the ADR at the path the design names",
      needs: ["the design package names its decisions to record (title, trigger, ADR path) in the module adrReferences"],
      producer: "one ADR file per named path under docs/adr/; report-only: the readiness review asks about missing ones and the close readback lists which named paths exist, neither blocks",
      commit: "commit the ADRs with the design", next: ["create-adr", "design-review-receipt", "submit-plan"],
    }),
    scriptStep({
      id: "create-adr", script: "create-adr.mjs", verb: "--slug", argv: ["--root", "<root>", "--slug", "<slug>", "--title", "<title>"],
      needs: ["a decision that must be accepted with this design (a proposal, never an accepted record)"],
      producer: "docs/adr/draft-<slug>.md and .json with status proposed; --refresh recomputes the digest after an edit of the Markdown", next: ["bind-adr-proposals"],
    }),
    scriptStep({
      id: "bind-adr-proposals", script: "bind-adr-proposals.mjs", verb: "--carrier",
      argv: ["--root", "<root>", "--feature", "<feature-id>", "--carrier", "<design.md>", "--selection", "<po-selection.json>", "--draft", "<slug>"],
      needs: ["the proposals from create-adr", "the PO's selection file"],
      producer: "the prospective selection and manifest beside the carrier, the decision bindings block in the carrier, and every companion path the review receipt must carry", next: ["design-review-receipt"],
    }),
    scriptStep({
      id: "design-review-receipt", script: "design-review-receipt.mjs", verb: "create",
      argv: ["create", "--repo", "<root>", "--feature", "<feature-id>", "--report", "<review-report-path>", "--prd", "<prd-path>", "--spec", "<spec-path>", "--out", "<review-receipt-path>"],
      needs: ["the read-only readiness review of the design (pipeline-core:readiness-reviewer, not the Critic)",
        "on Claude, its report written by design-review-receipt.mjs export-report --repo <root> --out <review-report-path>, so the receipt records the host-observed reviewer model (present-plan refuses an unobserved Claude review)"],
      producer: "the tracked design review receipt present-plan and prepare-seal name; never written by hand", commit: "commit the receipt with the design", next: ["submit-plan"],
    }),
    scriptStep({
      id: "submit-plan", script: STATE, verb: "submit-plan", closed: true, argv: ["submit-plan", "--by", "<name>", "--profile", "<epic|feature|mini>"],
      needs: ["a complete PRD and Spec (no framing placeholder text; the architecture design for epic and feature profiles)"],
      producer: "plan submission and lifecycle awaiting-approval; a package outside the PRD release scope (mini) binds the PRD and Spec digests here, in the PRD release scope the package stays an unsealed draft",
      next: ["prepare-seal", "present-plan"],
    }),
    scriptStep({
      id: "prepare-seal", script: STATE, verb: "prepare-seal", argv: ["prepare-seal", "--review-receipt", "<review-receipt-path>"],
      needs: ["the PRD release scope: the design package is an unsealed draft (inspect: sealSituation.situation draft); review it first; run after submit-plan and again after any edit of the PRD, the Spec or the design input"],
      producer: "scratch/seal-plan.json: the digest-bound seal plan of the draft; State is not written; it also retires a damaged or stray plan file",
      next: ["present-plan"],
    }),
    scriptStep({
      id: "present-plan", script: STATE, verb: "present-plan", argv: ["present-plan", "--by", "<name>", "--review-receipt", "<review-receipt-path>"],
      needs: ["a submitted plan", "every tracked design review receipt of the chain, initial first (one --review-receipt each)", "the prepared seal plan, for a draft package in the PRD release scope"],
      producer: "plan presentation record bound to the exact submission (and the seal plan digest), and the design approval request file under scratch/",
      next: ["sign-intent", "approve-plan"],
    }),
    scriptStep({
      id: "sign-intent", who: "po-only", script: "po-human-approval.mjs", verb: "sign-intent",
      argv: ["sign-intent", "--repo-root", "<root>", "--request", "<design-approval-request-path>"],
      needs: ["signature mode (gates.push_approval); the presented plan and its approval request file"],
      producer: "the PO's detached proof for the exact approval request, run in the PO's own terminal", next: ["approve-plan"],
    }),
    scriptStep({
      id: "approve-plan", script: STATE, verb: "approve-plan", argv: ["approve-plan", "--design-workflow-approval-request", "<design-approval-request-path>"],
      needs: ["the plan is presented", "the PO's proof (signature mode) or the attended chat confirmation (chat mode: --by <po-name> instead)"],
      producer: "plan approval recorded in pipeline state, lifecycle approved; for a draft package the same approval seals the PRD and the Spec (the one signature is the seal)", next: ["register-feature-package"],
    }),
    scriptStep({
      id: "register-feature-package", script: "register-feature-package.mjs", verb: "--root", argv: ["--root", "<root>"],
      needs: ["the approved plan"], producer: "the feature package manifest; its commitPaths are committed before any item binding is generated",
      commit: "commit the printed commitPaths in one commit", next: ["materialize-architecture"],
    }),
    scriptStep({
      id: "materialize-architecture", script: STATE, verb: "materialize-architecture", argv: ["materialize-architecture"],
      needs: ["greenfield only: the approved PRD carries the architecture design block"],
      producer: "the architecture map, fitness model and baseline, and the accepted ADR records the signed package pre-bound; continue with the implement runbook", next: [],
    }),
    scriptStep({
      // ADR-0095 Decision 10: a po-only step, so not a closed (agent-sanctioned) catalogue shape; only its --dry-run preview is.
      id: "reopen-design", who: "po-only", script: STATE, verb: "reopen-design", closed: false, argv: ["reopen-design", "--by", "<name>"],
      needs: ["recovery or a change of the design: executable in every state (a draft voids a prepared seal plan, a package bound before its approval is unlocked, a sealed package is released as before); the agent may run the same command with --dry-run as a preview, and a Spec correction during implementation goes through a Spec addendum instead (ADR-0095)"],
      producer: "lifecycle returns to draft, run in the PO's own terminal", next: ["set-feature", ...recovery],
    }),
    scriptStep({
      id: "cancel-submitted-plan", script: STATE, verb: "cancel-submitted-plan", closed: true,
      argv: ["cancel-submitted-plan", "--by", "<name>", "--submission-sha256", "<sha256>"],
      needs: ["recovery: an unsigned submission that must be withdrawn"], producer: "cancellation receipt, lifecycle draft", next: recovery,
    }),
    scriptStep({
      id: "cancel-mixed-plan-state", script: STATE, verb: "cancel-mixed-plan-state", closed: true,
      argv: ["cancel-mixed-plan-state", "--by", "<name>", "--reason", "<reason>", "--submission-sha256", "<sha256>", "--approval-sha256", "<sha256>", "--invalidation-sha256", "<sha256>"],
      needs: ["recovery: a current submission next to an invalidated historical approval"], producer: "recovery record, lifecycle draft", next: recovery,
    }),
  ];
}

function implementSteps() {
  return [
    inspectStep(["set-phase", "materialize-push-threat-model"]),
    scriptStep({
      id: "set-phase", script: STATE, verb: "set-phase", closed: true, argv: ["set-phase", "--phase", "implementation"],
      needs: ["the plan is approved (inspect status approved)"], producer: "feature phase implementation; implementation writes are admitted",
      next: ["dispatch-briefing"],
    }),
    scriptStep({
      id: "dispatch-briefing", script: "dispatch-briefing.mjs", verb: "build", argv: ["build", "--package", "<package.json>", "--out", "scratch/<briefing>.md"],
      needs: ["a closed pipeline.dispatch-briefing-package.v1 file naming the model, scope and checks"], evidenceSchema: "pipeline.dispatch-briefing-package.v1",
      producer: "the briefing text under scratch/, built from the goldfish-task template", next: ["dispatch"],
    }),
    otherStep({
      id: "dispatch", command: "dispatch the Goldfish from the built briefing with its pipeline-core agent type (tool-layer model parameter set)",
      needs: ["the built briefing"], producer: "the Goldfish report and its changes in the work tree", next: ["dispatch-record-write"],
    }),
    scriptStep({
      id: "dispatch-record-write", script: "dispatch-record-write.mjs", verb: "--request", argv: ["--repo-root", "<root>", "--request", "<request.json>"],
      needs: ["the Goldfish report"], producer: "evidence/dispatch-record-<TASK_ID>.json with a terminal outcome",
      commit: "commit the work with the AI-Assisted and Dispatch trailers; the record must cover the committed paths", next: ["architecture-fitness"],
    }),
    scriptStep({
      id: "architecture-fitness", script: "architecture-fitness.mjs", verb: "--check", argv: ["--root", "<root>", "--check"],
      needs: ["the work is committed", "a project with an architecture fitness model"], producer: "the fitness verdict of the changed modules; a violation is fixed before the Critic reads the candidate", next: ["architecture-boundary-check"],
    }),
    scriptStep({
      id: "architecture-boundary-check", script: "architecture-boundary-check.mjs", verb: "--json", argv: ["--root", "<root>", "--json"],
      needs: ["a project with declared module boundaries"], producer: "read-only boundary findings as JSON", next: ["verify"],
    }),
    otherStep({
      id: "verify", command: "<the project's verify command from its calibration>",
      needs: ["the work is committed"], producer: "the Verify evidence file for the candidate commit; continue with the critic runbook", next: [],
    }),
    scriptStep({
      id: "materialize-push-threat-model", script: STATE, verb: "materialize-push-threat-model", closed: true, argv: ["materialize-push-threat-model"],
      needs: ["the push gate needs a push threat model and project/push-threat-model.md is absent (inspect offers this step then)"],
      producer: "the governed template file project/push-threat-model.md", commit: "commit project/push-threat-model.md with the Close commit", next: [],
    }),
  ];
}

const FINALIZER = "session-critic-finalizer.mjs";
const REGISTER = "register-feature-package.mjs";
const finalizerStep = (id, verb, request, rest) => scriptStep({ id, script: FINALIZER, verb, argv: [verb, "--root", "<root>", "--request", request], ...rest });

/** C21C: the Critic path, in the order real runs walked it; collecting the evidence comes first, the recovery branches last. */
function criticSteps() {
  const finalization = "scratch/session-critic-finalization-request.json";
  return [
    scriptStep({
      id: "diagnostic-evidence", script: "critic-diagnostic-evidence.mjs", verb: "--log",
      argv: ["--root", "<root>", "--spec", "<spec-path>", "--log", "specs/<feature>/evidence/<name>.log", "--out", "specs/<feature>/evidence/<name>.json", "--candidate", "<ref>", "--", "<command>", "<args>"],
      needs: ["the candidate is committed", "one diagnostic per check the Critic should read as evidence"],
      producer: "the captured log and its evidence record under specs/<feature>/evidence/", next: ["register-diagnostic"],
    }),
    scriptStep({
      id: "register-diagnostic", script: REGISTER, verb: "--add-diagnostic-evidence", argv: ["--root", "<root>", "--add-diagnostic-evidence", "<path>"],
      needs: ["the diagnostic evidence, not committed yet (registration reads the working tree)"], producer: "the diagnostic entry in the feature manifest",
      commit: "commit artifact, log and manifest in one evidence-only commit", next: ["dispatch-preflight"],
    }),
    scriptStep({
      id: "dispatch-preflight", script: "critic-dispatch-preflight.mjs", verb: "--candidate",
      argv: ["--root", "<root>", "--base", "<ref>", "--candidate", "<ref>", "--spec", "<spec-path>", "--guardrail", "<path>", "--evidence", "<path>"],
      needs: ["a fixed base and candidate", "immediately before every Critic spawn"], evidenceSchema: "pipeline.critic-dispatch-preflight.v1",
      producer: "status packet-ready and the packet, or the next missing input; after an evidence-only commit add --registration-commit <that commit>, a later round adds --task-id, a delta round --delta-request and --correction-input-bindings", next: ["admit"],
    }),
    finalizerStep("admit", "admit", finalization, { needs: ["a packet-ready preflight"], producer: "the admission record for this packet", next: ["dispatch-critic"] }),
    otherStep({
      id: "dispatch-critic", command: "dispatch one fresh read-only Critic with its pipeline-core agent type, built from the critic-review template (Codex: run codex-sandbox-preflight.mjs --run --kind intermediate once on this machine, then codex-critic-launch-route.mjs --role critic, or critic-high-risk for a higher effort, with that receipt, and spawn exactly the agentType it prints; default means model and effort on the call, the round recorded as caller-authored-fallback with its one human acknowledgement at the close, and a final message that names it as protected by instruction only; a sandboxed Critic that still fails on EPERM is launched once more through default with the same labelling)",
      needs: ["the admission record"], producer: "the Critic's return; a split review returns one per child", next: ["finalize", "split-merge"],
    }),
    scriptStep({
      id: "split-merge", script: "critic-split-merge.mjs", verb: "--packet", argv: ["--root", "<root>", "--packet", "<packetId>"],
      needs: ["a split review: every child returned"], producer: "the merged verdict of the parent packet", next: ["finalize"],
    }),
    finalizerStep("finalize", "finalize", finalization, { needs: ["the Critic's return or the merged verdict"], producer: "the consumed receipt of this packet", next: ["export"] }),
    finalizerStep("export", "export", "scratch/session-critic-export-request.json", { needs: ["the consumed receipt"], producer: "the exported review record", next: ["add-review-lineage"] }),
    scriptStep({
      id: "add-review-lineage", script: REGISTER, verb: "--add-review-lineage", argv: ["--root", "<root>", "--add-review-lineage", "--packet", "<packetId>"],
      needs: ["the finalized packet"], producer: "the review lineage entry; on PASS continue with the close runbook, on findings fix them and take the delta round", commit: "commit the manifest change", next: ["correction-input-bindings"],
    }),
    scriptStep({
      id: "correction-input-bindings", script: "critic-correction-input-bindings.mjs", verb: "derive",
      argv: ["derive", "--root", "<root>", "--base", "<commit>", "--head", "<commit>", "--out", "scratch/<file>"],
      needs: ["findings were fixed and committed"], producer: "the binding file --correction-input-bindings names in the delta preflight", next: ["add-delta-request"],
    }),
    scriptStep({
      id: "add-delta-request", script: REGISTER, verb: "--add-delta-request", argv: ["--root", "<root>", "--add-delta-request", "<input.json>"],
      needs: ["the correction commits and the first round's taskId"], producer: "the delta request of the next round", next: ["dispatch-preflight"],
    }),
    finalizerStep("register-batch", "register-batch", "scratch/<request.json>", { needs: ["recovery or batch work: several units reviewed in one round"], producer: "the batch registration", next: ["dispatch-preflight"] }),
    finalizerStep("inspect-course-takeover", "inspect-course-takeover", "scratch/<request.json>", { needs: ["recovery: a stale or conflicting round blocks the next one (read-only)"], producer: "what would be superseded, with its digests", next: ["supersede-course-takeover"] }),
    finalizerStep("supersede-course-takeover", "supersede-course-takeover", "scratch/<request.json>", { needs: ["the inspected takeover"], producer: "the old round marked superseded; nothing is deleted", next: ["dispatch-preflight"] }),
  ];
}

// What docs/push-release-flow.md's quick-reference table does not carry. `args` completes a command whose table cell names only a verb.
const PUSH_ANNOTATIONS = Object.freeze({
  driver: { script: "push-init.mjs", verb: "--remote", needs: ["a clean tree", "the candidate commit exists"], evidenceSchema: "pipeline.push-init.v1",
    producer: "readiness report that stops at the signature and prints the authorize-critical command filled in", commit: "the reconciliation record sits on top of the candidate (--record-ref)", next: ["layer-2-3"] },
  "layer-1": { producer: "gates.push_approval resolved from pipeline.user.yaml (signature or chat)", next: ["layer-1b"] },
  "layer-1b": { needs: ["--base and --candidate named by the caller"], producer: "doc-reconciliation check result for the range", commit: "commit the reconciliation record before signing", next: ["layer-2-3"] },
  "layer-2-3": { script: "po-human-approval.mjs", verb: "authorize-critical", args: ["--repo-root", "<repo>", "--directory", "<external-dir>", "--feature-id", "<id>", "--plan", "<repo-path>", "--spec", "<repo-path>", "--kind", "push", "--subject-sha256", "<sha256>", "--expires-at", "<ISO-8601>"],
    needs: ["signature mode", "readiness green (push-init)"], producer: "the PO's detached proof for the exact push subject", next: ["layer-4"] },
  "layer-4": { script: "pipeline-state.mjs", verb: "approve-push", args: ["--by", "<name>", "--remote", "<remote>", "--destination", "refs/heads/<branch>"],
    needs: ["the proof for the exact candidate (signature mode) or the attended chat decision"], producer: "push approval bound to the candidate commit, in the private store", next: ["layer-5a", "layer-5b"] },
  "layer-5a": { needs: ["a valid approval for HEAD"], producer: "the pushed ref; the attempted-delivery record", next: ["layer-5c"] },
  "layer-5b": { needs: ["a valid approval for HEAD"], producer: "the pushed main or protected ref", next: ["layer-5c", "layer-6"] },
  "layer-5c": { script: "push-prepare.mjs", verb: "--close", evidenceSchema: "pipeline.push-close-report.v1", needs: ["the remote holds the signed commit"],
    producer: "folds a legacy tracked push-approval record into one local commit (nothing to fold for a current record)", commit: "the fold is one local commit made by the script", next: ["layer-7"] },
  "layer-6": { needs: ["a ruleset on the target ref"], producer: "the repository admin's ruleset decision (the agent can read it)", next: ["layer-7"] },
  "layer-7": { needs: ["the pushed release commit"], producer: "tag and GitHub release", next: [] },
});

const stepId = (layer) => (layer === "—" ? "driver" : `layer-${layer.replace("+", "-")}`);
const whoOf = (cell) => {
  const text = cell.trim();
  if (text.startsWith("**PO only**") || text.startsWith("Repo admin")) return "po-only";
  if (text.startsWith("Agent")) return "agent";
  if (text.startsWith("n/a")) return "n/a";
  throw Object.assign(new Error(`RUNBOOK-SOURCE-WHO: cannot classify "${text.slice(0, 40)}"`), { code: "RUNBOOK-SOURCE-WHO" });
};

/** The push steps, one per row of the quick-reference table in `flowText` (docs/push-release-flow.md). */
function pushSteps(flowText) {
  const from = flowText.indexOf("## Quick reference");
  if (from < 0) throw Object.assign(new Error("RUNBOOK-SOURCE-TABLE: the quick-reference table is missing"), { code: "RUNBOOK-SOURCE-TABLE" });
  const rows = flowText.slice(from).split("\n").filter((l) => /^\| (—|[0-9])/u.test(l)).map((l) => l.split("|").map((c) => c.trim()));
  const seen = new Set();
  const steps = rows.map((cells) => {
    const id = stepId(cells[1]);
    const note = PUSH_ANNOTATIONS[id];
    if (note === undefined) throw Object.assign(new Error(`RUNBOOK-SOURCE-ROW: no annotation for table row ${id}`), { code: "RUNBOOK-SOURCE-ROW" });
    seen.add(id);
    const who = whoOf(cells[3]);
    const span = /`([^`]+)`/u.exec(cells[2]);
    const base = { id, who, needs: note.needs ?? [], evidenceSchema: note.evidenceSchema ?? null, producer: note.producer, commit: note.commit ?? null, next: note.next };
    if (note.script !== undefined) {
      const tokens = span === null ? [] : span[1].split(" ");
      // The table names either "<script> <args>" or only the verb (authorize-critical, approve-push); the command keeps what the table says.
      const argv = [...(tokens[0] === note.script ? tokens.slice(1) : tokens), ...(note.args ?? [])];
      return scriptStep({ ...base, script: note.script, verb: note.verb, argv });
    }
    // A backticked span is the command when it is one (git, gh, the project's reconciliation script); otherwise the whole cell is the instruction.
    if (span !== null && span[1].startsWith("check-doc-reconciliation.mjs")) return otherStep({ ...base, command: `the project's doc-reconciliation script: ${span[1]}` });
    return otherStep({ ...base, command: span !== null && /^(git|gh) /u.test(span[1]) ? span[1] : cells[2].replace(/`/gu, "") });
  });
  for (const id of Object.keys(PUSH_ANNOTATIONS)) {
    if (!seen.has(id)) throw Object.assign(new Error(`RUNBOOK-SOURCE-ROW: annotation ${id} has no table row`), { code: "RUNBOOK-SOURCE-ROW" });
  }
  return steps;
}

/** The runbook documents (objects) of the paths this module owns, keyed by pathId. */
export function lifecycleRunbooks({ pushFlowText }) {
  const doc = (pathId, generatedFrom, steps, notGenerated) => ({ schema: RUNBOOK_SCHEMA, pathId, generatedFrom, notGenerated, steps });
  return {
    start: doc("start", ["plugins/pipeline-core/scripts/pipeline-start-preflight.mjs", "plugins/pipeline-core/scripts/pipeline-state.mjs"], startSteps(),
      ["the confirmation line text and the role-specific preflight readback fields (the preflight result names them)"]),
    plan: doc("plan", ["plugins/pipeline-core/scripts/pipeline-state.mjs (buildInspectNextAction verbs)", "plugins/pipeline-core/lib/guard/sanctioned-args-scripts.mjs"], planSteps(),
      ["which branch applies now (inspect prints the structural nextAction for the current state)"]),
    implement: doc("implement", ["plugins/pipeline-core/scripts/pipeline-state.mjs", "plugins/pipeline-core/scripts/dispatch-briefing.mjs", "plugins/pipeline-core/scripts/dispatch-record-write.mjs"], implementSteps(),
      ["the briefing package content and the project's verify command (project calibration)"]),
    critic: doc("critic", ["plugins/pipeline-core/scripts/critic-dispatch-preflight.mjs", "plugins/pipeline-core/scripts/session-critic-finalizer.mjs", "plugins/pipeline-core/scripts/register-feature-package.mjs"], criticSteps(),
      ["the request files of the finalizer (finalize --help prints their closed keys)"]),
    push: doc("push", [PUSH_FLOW_DOC], pushSteps(pushFlowText),
      ["the filled-in authorize-critical command (push-init prints it with the computed subject digest)"]),
  };
}

const STEP_KEYS = ["id", "who", "command", "needs", "evidenceSchema", "producer", "humanGate", "next"];

/** Problems of a runbook document against the runbook schema; an empty array means valid. Pure. */
export function validateRunbook(doc) {
  const problems = [];
  if (doc === null || typeof doc !== "object" || Array.isArray(doc)) return ["document is not an object"];
  if (doc.schema !== RUNBOOK_SCHEMA) problems.push(`schema must be ${RUNBOOK_SCHEMA}`);
  if (typeof doc.pathId !== "string" || doc.pathId === "") problems.push("pathId must be a non-empty string");
  if (!Array.isArray(doc.generatedFrom) || doc.generatedFrom.length === 0) problems.push("generatedFrom must list the sources");
  if (!Array.isArray(doc.notGenerated)) problems.push("notGenerated must be an array");
  if (!Array.isArray(doc.steps) || doc.steps.length === 0) return [...problems, "steps must be a non-empty array"];
  const ids = doc.steps.map((s) => s?.id);
  if (new Set(ids).size !== ids.length) problems.push("step ids must be unique");
  for (const s of doc.steps) {
    for (const key of STEP_KEYS) if (!(key in (s ?? {}))) problems.push(`step ${s?.id ?? "?"} lacks ${key}`);
    if (typeof s?.command !== "string" || s.command === "") problems.push(`step ${s?.id ?? "?"}: command must be a non-empty string`);
    if (!Array.isArray(s?.needs) || !Array.isArray(s?.next)) problems.push(`step ${s?.id ?? "?"}: needs and next must be arrays`);
    for (const n of s?.next ?? []) if (!ids.includes(n)) problems.push(`step ${s.id}: next ${n} is not a step of this path`);
  }
  return problems;
}
