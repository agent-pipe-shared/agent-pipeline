#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * Consumer-safe-path gate.
 *
 * Fails when a documentation artifact this repository ships to a consumer
 * project under `plugins/pipeline-core/` (skill instructions, their
 * references, agent definitions, plugin docs) names a path that resolves
 * only inside THIS repository's own source checkout and never inside an
 * installed plugin. Closes the class recorded in
 * `backlog/items/2026-08-08-shipped-artifacts-assume-the-pipelines-own-repository.md`
 * (CB-1b, direction 4): "Add a check that fails the build when a shipped
 * artifact names a source-only path... this is the piece that matters most."
 *
 * Scope: every tracked file under `plugins/pipeline-core/` (AC-8's literal
 * scope) -- not just the shipped skill Markdown. A first pass scoped this
 * check to Markdown only; a coordinator-directed widening (CB-1b) found the
 * larger set matters too, because `harness/`-prefixed paths also appear in
 * RUNTIME MESSAGES an operator reads when a guard denies a command (e.g.
 * `guard-push.mjs`, `guard-devplan.mjs`, `guard-git.mjs`,
 * `stop-suggest.mjs`) -- exactly the defect class this item is about, not
 * merely a documentation nicety.
 *
 * Not every match is a defect. Three classes were found in the full sweep:
 *
 *   A. Runtime messages a consumer will read that name a source-only path --
 *      genuine instances of this item's defect class. NOT fixed by this
 *      dispatch (scope was narrowed by the coordinator mid-task); allowlisted
 *      here with the class stated, as the classified handoff inventory for
 *      the follow-up dispatch that fixes them.
 *   B. Legitimate references to this repository's own harness/ layout,
 *      correct as written: a bare citation to canon documentation not read
 *      as a command, or a step explicitly gated to run only inside the
 *      Pipeline's own source checkout (self-application, ADR-0015).
 *   C. Test fixtures, imports, and comments inside `*.test.mjs` files and
 *      analogous non-shipped internal tooling -- never read by a consumer as
 *      an instruction. The bulk of the raw hit count.
 *
 * The ALLOWLIST below carries a stated reason -- naming the class -- for
 * every entry, matched either by exact (file, substring) or by a
 * `filePattern` regex applied file-wide (used for the class-C bulk, to avoid
 * hundreds of near-duplicate per-line entries for files whose entire content
 * is non-shipped). An allowlist entry that stops matching anything is itself
 * reported as a finding -- a stale entry is exactly the kind of place a real
 * regression could hide.
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const decoder = new TextDecoder("utf-8", { fatal: true });

const SCAN_PREFIX = "plugins/pipeline-core/";

// Minimum set from the backlog item's direction 4. Prefix matching, not
// exact-path matching: `harness/` also catches `harness/checklists/...` and
// `harness/definition-of-done.md`, both real citation classes found in the
// initial sweep.
export const SOURCE_ONLY_PREFIXES = Object.freeze(["harness/", "specs/sprint-nova-epic/", "setup.mjs"]);

// --- F2 fix (Critic review, 2026-08-10, over commits 4d0f8038..e2a3072f): a
// per-line allowlist for the 19 byte-identical vendored guardrails/roles/
// templates-prompts/ADRs (GF-107/GF-108), replacing whole-file `filePattern`
// exemptions. Each entry is one exact offending line, derived from a scan of
// these 19 files against SOURCE_ONLY_PREFIXES with no allowlist applied at
// all (ground truth), so every `match` string is guaranteed both to suppress
// a real finding and to be unique within its file (a stale or duplicate
// entry would otherwise be reported by the "never matched anything" check
// below). See backlog/items/2026-08-10-plugin-package-should-vendor-canon-
// references-via-build-step.md (F2) and harness/scripts/generate-vendored-
// canon.mjs (the generator that produces these files).
function vendoredCanonAllowlistReason(origin) {
  return (
    `GF-108 (known-accepted vendoring gap): plugins/pipeline-core/${origin} is a byte-identical vendored copy of ` +
    `${origin} (harness/scripts/generate-vendored-canon.mjs). This exact line is inherited unchanged from that ` +
    `source, where it documents this repository's own harness/ tooling or setup.mjs in its self-application ` +
    `voice -- not a new instruction telling a consumer to run it. Tracked by ` +
    `backlog/items/2026-08-10-plugin-package-should-vendor-canon-references-via-build-step.md.`
  );
}

export const VENDORED_CANON_ALLOWLIST = Object.freeze([
  // guardrails/deploy.md (lines 25, 28, 36, 67, 75)
  { file: "plugins/pipeline-core/guardrails/deploy.md", match: "ent}` (`harness/scripts/", reason: vendoredCanonAllowlistReason("guardrails/deploy.md") }, // L25
  { file: "plugins/pipeline-core/guardrails/deploy.md", match: "ved`); `harness/scripts/", reason: vendoredCanonAllowlistReason("guardrails/deploy.md") }, // L28
  { file: "plugins/pipeline-core/guardrails/deploy.md", match: "suite; `harness/scripts/", reason: vendoredCanonAllowlistReason("guardrails/deploy.md") }, // L36
  { file: "plugins/pipeline-core/guardrails/deploy.md", match: ".v0`); `harness/scripts/", reason: vendoredCanonAllowlistReason("guardrails/deploy.md") }, // L67
  { file: "plugins/pipeline-core/guardrails/deploy.md", match: "; `node harness/scripts/", reason: vendoredCanonAllowlistReason("guardrails/deploy.md") }, // L75
  // guardrails/git.md (lines 77, 101, 106, 109)
  { file: "plugins/pipeline-core/guardrails/git.md", match: "harness/session-", reason: vendoredCanonAllowlistReason("guardrails/git.md") }, // L77
  { file: "plugins/pipeline-core/guardrails/git.md", match: "`GG-20`); `node harness/scripts/verify.m", reason: vendoredCanonAllowlistReason("guardrails/git.md") }, // L101
  { file: "plugins/pipeline-core/guardrails/git.md", match: "ent}` (`harness/scripts/", reason: vendoredCanonAllowlistReason("guardrails/git.md") }, // L106
  { file: "plugins/pipeline-core/guardrails/git.md", match: "proved\"`; `node harness/scripts/verify.m", reason: vendoredCanonAllowlistReason("guardrails/git.md") }, // L109
  // guardrails/global.md (line 35)
  { file: "plugins/pipeline-core/guardrails/global.md", match: "harness/", reason: vendoredCanonAllowlistReason("guardrails/global.md") }, // L35
  // guardrails/quality-gates.md (lines 29, 59)
  { file: "plugins/pipeline-core/guardrails/quality-gates.md", match: "harness/session-", reason: vendoredCanonAllowlistReason("guardrails/quality-gates.md") }, // L29
  { file: "plugins/pipeline-core/guardrails/quality-gates.md", match: "harness/scripts/", reason: vendoredCanonAllowlistReason("guardrails/quality-gates.md") }, // L59
  // guardrails/security.md (lines 24, 39)
  { file: "plugins/pipeline-core/guardrails/security.md", match: "harness/session-", reason: vendoredCanonAllowlistReason("guardrails/security.md") }, // L24
  { file: "plugins/pipeline-core/guardrails/security.md", match: "harness/checklis", reason: vendoredCanonAllowlistReason("guardrails/security.md") }, // L39
  // roles/critic.md (lines 207, 224)
  { file: "plugins/pipeline-core/roles/critic.md", match: "Per `harness/session-", reason: vendoredCanonAllowlistReason("roles/critic.md") }, // L207
  { file: "plugins/pipeline-core/roles/critic.md", match: "- `harness/session-", reason: vendoredCanonAllowlistReason("roles/critic.md") }, // L224
  // roles/elephant.md (lines 87, 117, 290, 295, 310)
  { file: "plugins/pipeline-core/roles/elephant.md", match: "harness/checklis", reason: vendoredCanonAllowlistReason("roles/elephant.md") }, // L87
  { file: "plugins/pipeline-core/roles/elephant.md", match: "harness/scripts/", reason: vendoredCanonAllowlistReason("roles/elephant.md") }, // L117
  { file: "plugins/pipeline-core/roles/elephant.md", match: "tocol (`harness/session-", reason: vendoredCanonAllowlistReason("roles/elephant.md") }, // L290
  { file: "plugins/pipeline-core/roles/elephant.md", match: "ep 1b (`harness/session-", reason: vendoredCanonAllowlistReason("roles/elephant.md") }, // L295
  { file: "plugins/pipeline-core/roles/elephant.md", match: "- `harness/session-", reason: vendoredCanonAllowlistReason("roles/elephant.md") }, // L310
  // roles/goldfish.md (lines 23, 123, 133)
  { file: "plugins/pipeline-core/roles/goldfish.md", match: "nants (`harness/session-", reason: vendoredCanonAllowlistReason("roles/goldfish.md") }, // L23
  { file: "plugins/pipeline-core/roles/goldfish.md", match: "Per `harness/session-", reason: vendoredCanonAllowlistReason("roles/goldfish.md") }, // L123
  { file: "plugins/pipeline-core/roles/goldfish.md", match: "- `harness/session-", reason: vendoredCanonAllowlistReason("roles/goldfish.md") }, // L133
  // templates/prompts/agent-obligations.md (lines 3, 4, 90, 92)
  { file: "plugins/pipeline-core/templates/prompts/agent-obligations.md", match: "ced by: harness/scripts/", reason: vendoredCanonAllowlistReason("templates/prompts/agent-obligations.md") }, // L3
  { file: "plugins/pipeline-core/templates/prompts/agent-obligations.md", match: "d by:   harness/scripts/", reason: vendoredCanonAllowlistReason("templates/prompts/agent-obligations.md") }, // L4
  { file: "plugins/pipeline-core/templates/prompts/agent-obligations.md", match: "P-3` | `harness/scripts/", reason: vendoredCanonAllowlistReason("templates/prompts/agent-obligations.md") }, // L90
  { file: "plugins/pipeline-core/templates/prompts/agent-obligations.md", match: "?:-v2)?|harness/scripts/", reason: vendoredCanonAllowlistReason("templates/prompts/agent-obligations.md") }, // L92
  // templates/prompts/critic-review.md (line 7)
  { file: "plugins/pipeline-core/templates/prompts/critic-review.md", match: "harness/", reason: vendoredCanonAllowlistReason("templates/prompts/critic-review.md") }, // L7
  // templates/prompts/elephant-kickoff.md (lines 5, 87)
  { file: "plugins/pipeline-core/templates/prompts/elephant-kickoff.md", match: "harness/session-", reason: vendoredCanonAllowlistReason("templates/prompts/elephant-kickoff.md") }, // L5
  { file: "plugins/pipeline-core/templates/prompts/elephant-kickoff.md", match: "harness/scripts/", reason: vendoredCanonAllowlistReason("templates/prompts/elephant-kickoff.md") }, // L87

  // --- Phoenix/Nova merge reconciliation (VFX-MISC, 2026-08-26): Phoenix
  // split `docs/operating-model.md`'s trigger-matrix content out into a new
  // `harness/review-protocol.md`; the vendored citing files above (and one
  // newly-vendored doc) picked up new citations to it in the merge. Each
  // entry below is Class B for the same reason as the surrounding
  // VENDORED_CANON_ALLOWLIST entries: a byte-identical vendored copy citing
  // this repository's own canon in its self-application voice, not a new
  // consumer-facing instruction.
  { file: "plugins/pipeline-core/guardrails/git.md", match: "harness/review-protocol.md` §2.1, *Trigger decision table*)", reason: vendoredCanonAllowlistReason("guardrails/git.md") },
  { file: "plugins/pipeline-core/guardrails/security.md", match: "harness/review-protocol.md` §2.1, *Trigger decision table*", reason: vendoredCanonAllowlistReason("guardrails/security.md") },
  { file: "plugins/pipeline-core/roles/critic.md", match: "harness/review-protocol.md` §2.1", reason: vendoredCanonAllowlistReason("roles/critic.md") },
  { file: "plugins/pipeline-core/roles/elephant.md", match: "harness/review-protocol.md` §2.1", reason: vendoredCanonAllowlistReason("roles/elephant.md") },
  { file: "plugins/pipeline-core/roles/elephant.md", match: "`+`harness/`", reason: vendoredCanonAllowlistReason("roles/elephant.md") },
  { file: "plugins/pipeline-core/templates/prompts/elephant-kickoff.md", match: "harness/review-protocol.md` §2.1 trigger decision table", reason: vendoredCanonAllowlistReason("templates/prompts/elephant-kickoff.md") },
  { file: "plugins/pipeline-core/docs/push-release-flow.md", match: "node harness/scripts/check-doc-reconciliation.mjs", reason: vendoredCanonAllowlistReason("docs/push-release-flow.md") },
  // templates/prompts/goldfish-task.md (line 8)
  { file: "plugins/pipeline-core/templates/prompts/goldfish-task.md", match: "harness/", reason: vendoredCanonAllowlistReason("templates/prompts/goldfish-task.md") }, // L8
  // templates/prompts/kickoff-new-project.md (lines 4, 57, 115, 122, 227)
  { file: "plugins/pipeline-core/templates/prompts/kickoff-new-project.md", match: "truth: harness/session-", reason: vendoredCanonAllowlistReason("templates/prompts/kickoff-new-project.md") }, // L4
  { file: "plugins/pipeline-core/templates/prompts/kickoff-new-project.md", match: "a root `setup.mjs`,", reason: vendoredCanonAllowlistReason("templates/prompts/kickoff-new-project.md") }, // L57
  { file: "plugins/pipeline-core/templates/prompts/kickoff-new-project.md", match: "setup.mjs`, owns", reason: vendoredCanonAllowlistReason("templates/prompts/kickoff-new-project.md") }, // L115
  { file: "plugins/pipeline-core/templates/prompts/kickoff-new-project.md", match: "uence, `harness/session-", reason: vendoredCanonAllowlistReason("templates/prompts/kickoff-new-project.md") }, // L122
  { file: "plugins/pipeline-core/templates/prompts/kickoff-new-project.md", match: "harness/scripts/", reason: vendoredCanonAllowlistReason("templates/prompts/kickoff-new-project.md") }, // L227
  // templates/prompts/session-bootstrap-check.md (line 5)
  { file: "plugins/pipeline-core/templates/prompts/session-bootstrap-check.md", match: "harness/", reason: vendoredCanonAllowlistReason("templates/prompts/session-bootstrap-check.md") }, // L5
  // docs/adr/0010-session-bootstrap.md (lines 21, 25, 69, 73)
  { file: "plugins/pipeline-core/docs/adr/0010-session-bootstrap.md", match: "led out in [session-bootstrap.md](../../harness/session-bootstrap.md)):", reason: vendoredCanonAllowlistReason("docs/adr/0010-session-bootstrap.md") }, // L21
  { file: "plugins/pipeline-core/docs/adr/0010-session-bootstrap.md", match: "strap.md](../../harness/session-bootstrap.md) st", reason: vendoredCanonAllowlistReason("docs/adr/0010-session-bootstrap.md") }, // L25
  { file: "plugins/pipeline-core/docs/adr/0010-session-bootstrap.md", match: "muliert in [session-bootstrap.md](../../harness/session-bootstrap.md)):", reason: vendoredCanonAllowlistReason("docs/adr/0010-session-bootstrap.md") }, // L69
  { file: "plugins/pipeline-core/docs/adr/0010-session-bootstrap.md", match: "strap.md](../../harness/session-bootstrap.md) Sc", reason: vendoredCanonAllowlistReason("docs/adr/0010-session-bootstrap.md") }, // L73
  // docs/adr/0017-push-policy-standing-approval.md (lines 39, 74)
  { file: "plugins/pipeline-core/docs/adr/0017-push-policy-standing-approval.md", match: "setup.mjs` genera", reason: vendoredCanonAllowlistReason("docs/adr/0017-push-policy-standing-approval.md") }, // L39
  { file: "plugins/pipeline-core/docs/adr/0017-push-policy-standing-approval.md", match: "setup.mjs`-Genera", reason: vendoredCanonAllowlistReason("docs/adr/0017-push-policy-standing-approval.md") }, // L74
  // docs/adr/0027-gate-philosophy.md (lines 9, 45)
  { file: "plugins/pipeline-core/docs/adr/0027-gate-philosophy.md", match: "cally via `node harness/scripts/pipeline", reason: vendoredCanonAllowlistReason("docs/adr/0027-gate-philosophy.md") }, // L9
  { file: "plugins/pipeline-core/docs/adr/0027-gate-philosophy.md", match: "bucht via `node harness/scripts/pipeline", reason: vendoredCanonAllowlistReason("docs/adr/0027-gate-philosophy.md") }, // L45
  // docs/adr/0028-manifest-approach.md (lines 41, 49)
  { file: "plugins/pipeline-core/docs/adr/0028-manifest-approach.md", match: "setup.mjs` produc", reason: vendoredCanonAllowlistReason("docs/adr/0028-manifest-approach.md") }, // L41
  { file: "plugins/pipeline-core/docs/adr/0028-manifest-approach.md", match: "setup.mjs` valida", reason: vendoredCanonAllowlistReason("docs/adr/0028-manifest-approach.md") }, // L49
  // docs/adr/0029-file-handoffs-status.md (lines 11, 50)
  { file: "plugins/pipeline-core/docs/adr/0029-file-handoffs-status.md", match: "he CLI `harness/scripts/", reason: vendoredCanonAllowlistReason("docs/adr/0029-file-handoffs-status.md") }, // L11
  { file: "plugins/pipeline-core/docs/adr/0029-file-handoffs-status.md", match: "ie CLI `harness/scripts/", reason: vendoredCanonAllowlistReason("docs/adr/0029-file-handoffs-status.md") }, // L50
  // docs/adr/0064-release-preflight-consent-reuses-the-uniform-approval-ceremony.md (lines 11, 12, 31, 36):
  // this repository's own Nova-sprint historical evidence trail (the one real
  // release-preflight run this ADR is grounded in), not a consumer-facing path.
  { file: "plugins/pipeline-core/docs/adr/0064-release-preflight-consent-reuses-the-uniform-approval-ceremony.md", match: "`specs/sprint-nova-epic/implementation/issue-acceptance-matrix.md`", reason: vendoredCanonAllowlistReason("docs/adr/0064-release-preflight-consent-reuses-the-uniform-approval-ceremony.md") }, // L11
  { file: "plugins/pipeline-core/docs/adr/0064-release-preflight-consent-reuses-the-uniform-approval-ceremony.md", match: "`specs/sprint-nova-epic/plans/nova-a.md`", reason: vendoredCanonAllowlistReason("docs/adr/0064-release-preflight-consent-reuses-the-uniform-approval-ceremony.md") }, // L12
  { file: "plugins/pipeline-core/docs/adr/0064-release-preflight-consent-reuses-the-uniform-approval-ceremony.md", match: "`specs/sprint-nova-epic/evidence/nova-a/a6/release-preflight-report-57ee7e9.json`", reason: vendoredCanonAllowlistReason("docs/adr/0064-release-preflight-consent-reuses-the-uniform-approval-ceremony.md") }, // L31
  { file: "plugins/pipeline-core/docs/adr/0064-release-preflight-consent-reuses-the-uniform-approval-ceremony.md", match: "`specs/sprint-nova-epic/evidence/nova-a/a6/consent-input-57ee7e9.json`", reason: vendoredCanonAllowlistReason("docs/adr/0064-release-preflight-consent-reuses-the-uniform-approval-ceremony.md") }, // L36
]);

export const ALLOWLIST = Object.freeze([
  {
    file: "plugins/pipeline-core/skills/pipeline-start/SKILL.md",
    match: "harness/scripts/check-observation-governance.mjs",
    reason:
      "Self-application only (ADR-0015): this exact command runs exclusively inside the " +
      "Pipeline's own source checkout, gated by \"Only a checkout carrying the Pipeline " +
      "source manifest is required\". The Consumer-project branch of the same step resolves " +
      "to not-applicable and explicitly instructs the agent never to look for, copy, or " +
      "repair this path there.",
  },
  {
    file: "plugins/pipeline-core/skills/pipeline-start/references/failure-cases.md",
    match: "harness/scripts/check-observation-governance.mjs",
    reason:
      "Same self-application-only scoping as pipeline-start/SKILL.md's Observation " +
      "governance step: F6 is explicitly \"mandatory only in the Public source checkout\".",
  },
  {
    file: "plugins/pipeline-core/skills/close-block/SKILL.md",
    match: "harness/checklists/session-close.md",
    reason:
      "Bare citation to this repository's own canon documentation, explicitly labelled " +
      "\"(agent-pipeline repo -- canon pointers, not runtime reads)\" in the same sentence -- " +
      "never a command a consumer executes.",
  },
  {
    file: "plugins/pipeline-core/skills/close-block/SKILL.md",
    match: "harness/definition-of-done.md",
    reason: "Bare parenthetical citation to the DoD source, not a runtime command.",
  },
  {
    file: "plugins/pipeline-core/skills/close-block/SKILL.md",
    match: "harness/checklists/small-session.md",
    reason: "Bare parenthetical citation to the close-light companion checklist, not a runtime command.",
  },
  {
    file: "plugins/pipeline-core/skills/critic-review/SKILL.md",
    match: "harness/review-protocol.md",
    reason:
      "Bare citation in a list explicitly labelled \"Canon pointers (agent-pipeline repo, not " +
      "runtime reads)\" -- never a command a consumer executes.",
  },
  {
    file: "plugins/pipeline-core/skills/close-block/SKILL.md",
    match: "harness/scripts/check-observation-governance.mjs",
    reason:
      "Explicitly scoped \"(Agent-Pipeline checkout only)\" in the same sentence -- the same " +
      "self-application-only pattern as pipeline-start/SKILL.md's Observation governance step.",
  },

  // --- Widened sweep (CB-1b, coordinator-directed): every tracked file under
  // plugins/pipeline-core/, not just Markdown. See the module doc comment for
  // the A/B/C taxonomy. Class A entries are real defects, NOT fixed by this
  // dispatch -- the reason says so explicitly and this is the handoff
  // inventory for the follow-up remediation dispatch.

  {
    filePattern: /\.test\.mjs$/u,
    reason:
      "Class C: test file (fixtures, imports of source-repo-only test helpers, or comments) -- " +
      "the bulk of the raw hit count. Never shipped as, or read by a consumer as, an instruction.",
  },
  {
    file: "plugins/pipeline-core/hooks/guard-devplan.mjs",
    match: "this hook is a READER, never a writer.",
    reason: "Class B: source comment (`* ...`), not an operator-facing message.",
  },
  {
    file: "plugins/pipeline-core/hooks/guard-git.mjs",
    match: "R2 of specs/sprint-nova-epic/implementation/one-approval-all-layers-design.md",
    reason: "Class B: source comment (`// ...`), not an operator-facing message.",
  },
  {
    filePattern: /^plugins\/pipeline-core\/hooks\/guard-lifecycle-ready\.mjs$/u,
    reason: "Class B: both occurrences are source comments (`// ...` / `* ...`) citing this repository's own Nova-sprint planning documents, not operator-facing messages.",
  },
  {
    filePattern: /^plugins\/pipeline-core\/hooks\/guard-testpath\.mjs$/u,
    reason: "Class B: source comment citing roles/goldfish.md and harness/definition-of-done.md, not an operator-facing message.",
  },
  {
    filePattern: /^plugins\/pipeline-core\/scripts\/check-suite-registration\.mjs$/u,
    reason: "Class B: source comments (module docstring / inline) citing this repository's own harness/scripts/verify.mjs layout -- the script's entire purpose is checking that file's TEST_SUITES registration, not an operator-facing message a consumer would read.",
  },
  {
    filePattern: /^plugins\/pipeline-core\/hooks\/hooks\.json$/u,
    reason: "Class B: the `$comment` metadata field documents hook wiring for a maintainer, citing `node setup.mjs`. Not an operator-facing message; setup.mjs's own consumer-reachability is tracked by a separate backlog item (2026-08-08-an-installing-consumer-is-never-asked-any-setup-decision.md), not this check.",
  },
  {
    file: "plugins/pipeline-core/hooks/setup-check.mjs",
    match: "`node setup.mjs` (see SETUP.md)",
    reason: "Class A: the two constructed message branches this hook actually returns to the operator, naming setup.mjs. Whether a given consumer has setup.mjs is the separate backlog item named above; flagged here as this check's defect class regardless. Not fixed by this dispatch -- deferred.",
  },
  {
    file: "plugins/pipeline-core/hooks/setup-check.mjs",
    match: "setup.mjs",
    reason: "Class B: every other setup.mjs mention in this file is a doc comment explaining what the hook detects, not a constructed operator-facing message (those are the separate, more specific entry above).",
  },
  {
    filePattern: /^plugins\/pipeline-core\/lib\/critic-packet-governance\.mjs$/u,
    reason: "Class B: `path.startsWith(\"harness/\")` is internal path-classification logic for this repository's own Critic-packet governance (used only when Critic reviews run inside this repo), not a path assumption about a consumer's tree.",
  },
  {
    filePattern: /^plugins\/pipeline-core\/lib\/guard-maintenance-window\.mjs$/u,
    reason: "Class B: source comment citing this repository's own Nova-sprint design doc, not an operator-facing message.",
  },
  {
    file: "plugins/pipeline-core/lib/human-guard-override.mjs",
    match: "harness/scripts/verify.mjs",
    reason: "Class B (coordinator-confirmed): deliberately requires harness/scripts/verify.mjs as a source-root marker -- correct self-application logic, not a consumer-facing path assumption.",
  },
  {
    file: "plugins/pipeline-core/lib/ai-assisted-hardening.mjs",
    match: "harness/scripts/verify.mjs",
    reason: "Class B (same reasoning as human-guard-override.mjs above): SENSITIVE_EXACT_PATHS names this repository's own verify gate as a control that must route to independent review when touched -- internal path-classification data for THIS repo's own AI-hardening gate (self-application-only, ADR-0015), not a consumer-facing path assumption.",
  },
  {
    filePattern: /^plugins\/pipeline-core\/lib\/machine-plane\.mjs$/u,
    reason: "Class B: source comment citing this repository's own Nova-sprint planning document, not an operator-facing message.",
  },
  {
    filePattern: /^plugins\/pipeline-core\/lib\/nova-candidate-freeze\.mjs$/u,
    reason: "Class B: compares against a literal specs/sprint-nova-epic/... constant used only by this repository's own Nova-sprint candidate-freeze release tooling -- self-application-only, never invoked as a generic consumer command.",
  },
  {
    filePattern: /^plugins\/pipeline-core\/lib\/nova-increment-receipt\.mjs$/u,
    reason: "Class B: an array of literal specs/sprint-nova-epic/... evidence paths used only by this repository's own Nova-sprint increment-receipt release tooling -- self-application-only.",
  },
  {
    filePattern: /^plugins\/pipeline-core\/lib\/observation-governance-bootstrap\.mjs$/u,
    reason: "Class B (coordinator-confirmed): names the checker (harness/scripts/check-observation-governance.mjs) that by design only exists in a source checkout; the bootstrap skill's own Observation-governance step already explains this to the agent.",
  },
  {
    file: "plugins/pipeline-core/lib/po-gate-authority.mjs",
    match: "project has the plugin but no setup.mjs",
    reason: "Class B: source comment, not an operator-facing message.",
  },
  {
    file: "plugins/pipeline-core/lib/po-gate-authority.mjs",
    match: "Run node setup.mjs --publish-po-profile",
    reason: "Class unclear: a constructed repair message that names \"the canonical primary checkout\" rather than the current repo, which may or may not make it consumer-reachable in practice. Not confidently classified within this dispatch's budget -- left for the follow-up dispatch's judgment rather than guessed.",
  },
  {
    filePattern: /^plugins\/pipeline-core\/scripts\/ai-assisted-hardening-gate\.mjs$/u,
    reason: "Class B: scope/policy/dependency constants for this repository's own internal AI-assisted-hardening gate (evaluates security deltas in THIS repo's own CI) -- self-application-only tooling, not a consumer-facing path.",
  },
  {
    filePattern: /^plugins\/pipeline-core\/scripts\/antigravity-alpha-adapter\.mjs$/u,
    reason: "Class B: a literal Nova-sprint-specific evidence path, this repository's own release data.",
  },
  {
    filePattern: /^plugins\/pipeline-core\/scripts\/check-state-budgets\.mjs$/u,
    reason: "Class B: a protected-paths list for this repository's own internal state-budget validation, self-application-only.",
  },
  {
    filePattern: /^plugins\/pipeline-core\/scripts\/codex-critic-isolation\.mjs$/u,
    reason: "Class B: a protected-artifact-paths list used by this repository's own internal Critic-isolation testing, self-application-only.",
  },
  {
    filePattern: /^plugins\/pipeline-core\/scripts\/codex-isolated-critic-protected-preimage\.v1\.json$/u,
    reason: "Class B: fixture data naming which paths an isolated Critic session may read, used only when Critic reviews run inside this repository -- self-application-only.",
  },
  {
    filePattern: /^plugins\/pipeline-core\/scripts\/critic-bare\.mjs$/u,
    reason: "Class B: source comment citing harness/review-protocol.md, not an operator-facing message.",
  },
  {
    filePattern: /^plugins\/pipeline-core\/scripts\/critic-verdict\.schema\.json$/u,
    reason: "Class B: a JSON-Schema \"description\" field citing harness/review-protocol.md as documentation, not an operator-facing message.",
  },
  {
    filePattern: /^plugins\/pipeline-core\/scripts\/guard-maintenance-window\.mjs$/u,
    reason: "Class unclear: DEFAULT_PLAN/DEFAULT_SPEC constants defaulting to specs/sprint-nova-epic/... paths. Whether a consumer using this feature without overriding the defaults would hit a real gap was not confidently determined within this dispatch's budget -- left for the follow-up dispatch rather than guessed.",
  },
  {
    filePattern: /^plugins\/pipeline-core\/scripts\/pipeline-state\.mjs$/u,
    reason: "Class B: three doc comments -- one citing this file's own test path (possibly itself slightly stale; not independently verified), two explaining the now-superseded specs/sprint-nova-epic/... threat-model path CB-1a already fixed at runtime. pipeline-state.mjs is out of this dispatch's edit scope by explicit prohibition regardless of finer classification.",
  },
  {
    filePattern: /^plugins\/pipeline-core\/scripts\/po-human-approval\.mjs$/u,
    reason: "Class B: source comment citing this repository's own Nova-sprint planning document, not an operator-facing message.",
  },
  {
    filePattern: /^plugins\/pipeline-core\/scripts\/public-baseline-diagnose\.mjs$/u,
    reason: "Class B: FULL_VERIFY_COMMAND is a constant used by this repository's own internal baseline-diagnose tooling, self-application-only.",
  },
  {
    filePattern: /^plugins\/pipeline-core\/scripts\/release-version-plan\.mjs$/u,
    reason: "Class B: source comment citing harness/scripts/check-pr-contributor-gates.mjs, not an operator-facing message.",
  },
  {
    filePattern: /^plugins\/pipeline-core\/scripts\/run-codex-critic-probe-split\.mjs$/u,
    reason: "Class B: a protected-artifact-paths list used by this repository's own internal Codex-Critic-probe tooling, self-application-only.",
  },
  {
    filePattern: /^plugins\/pipeline-core\/scripts\/run-codex-isolation-control-decomposition\.mjs$/u,
    reason: "Class B: same self-application-only protected-artifact-paths pattern as run-codex-critic-probe-split.mjs.",
  },
  {
    filePattern: /^plugins\/pipeline-core\/scripts\/v3-bootstrap-authority\.mjs$/u,
    reason: "Class B: source comment explicitly discussing that consumer roots are not required to ship setup.mjs -- already self-aware of the consumer/source distinction.",
  },
  {
    filePattern: /^plugins\/pipeline-core\/scripts\/nova-b5-candidate-freeze-v2\.schema\.json$/u,
    reason: "Class B: a `const` binding path embedded in a JSON Schema used only by this repository's own Nova-sprint candidate-freeze release tooling, self-application-only.",
  },

  // --- F2 fix (Critic review, 2026-08-10, over commits 4d0f8038..e2a3072f):
  // the vendored guardrails/roles/templates-prompts/ADRs (GF-107/GF-108) are
  // byte-identical copies of repo-root files that legitimately document THIS
  // repository's own harness/ tooling or setup.mjs in their self-application
  // voice -- but they are files a consumer DOES read as instructions (that is
  // the whole point of vendoring them), so a whole-file `filePattern` exemption
  // was the wrong granularity: it registers as "used" before any line is
  // inspected, and a repaired line's entry would never go stale. Replaced with
  // one per-line `{file, match}` entry per exact offending line -- the same
  // tighter, stale-checked shape check-doc-contracts.mjs's
  // VENDORED_LINK_EXCLUSIONS already uses for these same files' dead links.
  // See VENDORED_CANON_ALLOWLIST below (generated ground truth verified by
  // scratch derivation against SOURCE_ONLY_PREFIXES with no allowlist).
  ...VENDORED_CANON_ALLOWLIST,
  {
    file: "plugins/pipeline-core/scripts/dispatch-authorship-verify.mjs",
    match: "wired into `harness/scripts/verify.mjs`",
    reason:
      "Class B: header doc comment describing this standalone diagnostic's own relationship to the calibrated Verify gate (deliberately not registered in it), not a consumer-facing path assumption.",
  },
  {
    file: "plugins/pipeline-core/hooks/guard-dispatch-budget.mjs",
    match: "`harness/scripts/wire-dispatch-budget-hook.mjs`, run outside the session",
    reason:
      "Class B: a doc comment correcting this guard's own wiring route. The header previously named a signed maintenance-window ceremony, which cannot exist -- hooks.json is on NEVER_LIFTABLE_KERNEL_PATHS -- and the correction names the attended operator tool that IS the route. That tool wires the Pipeline's own hook manifest and is self-application-only (ADR-0015): a consumer project never runs it, and never needs to, because the wiring ships already applied in the plugin. Deleting the citation would leave the correction naming no route at all, which is the state that made the header wrong in the first place.",
  },
  {
    file: "plugins/pipeline-core/scripts/dispatch-authorship-verify.mjs",
    match: "harness/scripts/generate-agent-obligations.mjs (elephant-generated)",
    reason:
      "Class B: doc comment example of the elephant-generated trailer form naming this repository's own generator script, self-application-only (the closed ELEPHANT_GENERATOR_ALLOWLIST below only ever names scripts that exist in THIS repo's harness/, never a consumer path assumption).",
  },
  {
    file: "plugins/pipeline-core/scripts/dispatch-authorship-verify.mjs",
    match: "\"harness/scripts/generate-agent-obligations.mjs\",",
    reason:
      "Class B: ELEPHANT_GENERATOR_ALLOWLIST's Map key and scriptPath field both end in this exact substring, this repository's own generator script -- same self-application-only reasoning as the doc comment entry above.",
  },
  {
    file: "plugins/pipeline-core/scripts/tmp-leak-guard.mjs",
    match: "wired into `harness/scripts/verify.mjs`",
    reason:
      "Class B: header doc comment describing this standalone diagnostic's own relationship to the calibrated Verify gate (deliberately not registered in it), not a consumer-facing path assumption.",
  },

  // --- Phoenix/Nova merge reconciliation (VFX-MISC, 2026-08-26): new
  // content that entered the plugin tree during the merge, each classified
  // per the module doc comment's A/B/C taxonomy.
  {
    file: "plugins/pipeline-core/skills/close-block/SKILL.md",
    match: "harness/review-protocol.md` §2.1, *Trigger decision table*",
    reason: "Class B: bare parenthetical citation to the trigger-matrix source, not a runtime command a consumer executes.",
  },
  {
    file: "plugins/pipeline-core/hooks/guard-devplan.mjs",
    match: "harness/scripts/pipeline-state.mjs` is out of scope for this",
    reason: "Class B: source comment (doc block), not an operator-facing message.",
  },
  {
    file: "plugins/pipeline-core/hooks/guard-devplan.mjs",
    match: "harness/scripts/pipeline-state.mjs, never by hand)",
    reason:
      "Class A: constructed WARN message returned to the operator naming harness/scripts/pipeline-state.mjs (source-only). Same defect class as setup-check.mjs's existing Class A entry above; not fixed by this dispatch -- deferred to the follow-up remediation.",
  },
  {
    file: "plugins/pipeline-core/hooks/guard-devplan.mjs",
    match: "node harness/scripts/pipeline-state.mjs approve-plan --by <name> ",
    reason:
      "Class A: constructed verdict message returned to the operator naming harness/scripts/pipeline-state.mjs (source-only). Same defect class as the WARN-message entry above; not fixed by this dispatch -- deferred.",
  },
  {
    file: "plugins/pipeline-core/hooks/guard-el01-tripwire.mjs",
    match: "rewrite only via harness/scripts/pipeline-state.mjs, never by hand",
    reason:
      "Class A: constructed WARN message returned to the operator naming harness/scripts/pipeline-state.mjs (source-only). Same defect class as guard-devplan.mjs's analogous WARN message above; not fixed by this dispatch -- deferred.",
  },
  {
    file: "plugins/pipeline-core/lib/decision-reference-dual-evaluation.mjs",
    match: "harness/scripts/pipeline-state.mjs` and any",
    reason: "Class B: source comment (doc block), not an operator-facing message.",
  },
  {
    file: "plugins/pipeline-core/lib/external-push-ledger.mjs",
    match: "harness/scripts/pipeline-state-external-push-ledger.test.mjs",
    reason: "Class B: source comment citing this repository's own test file path, not an operator-facing message.",
  },
  {
    file: "plugins/pipeline-core/scripts/clean-candidate-run.mjs",
    match: "harness/scripts/verify.mjs`'s candidate preflight",
    reason: "Class B: source comment, not an operator-facing message.",
  },
  {
    file: "plugins/pipeline-core/scripts/security-adapters/gitleaks.mjs",
    match: "harness/scripts/security-adapters/gitleaks.mjs`, also three directories deep",
    reason: "Class B: source comment (VFX-SECURITY, 2026-08-26) citing this file's pre-merge Phoenix-branch location for the arithmetic-correction explanation, not an operator-facing message.",
  },
  {
    filePattern: /^plugins\/pipeline-core\/scripts\/phoenix-authority-revision\.mjs$/u,
    reason:
      "Class unclear: imports pipelineState from harness/scripts/pipeline-state.mjs by relative path. Whether this proof-gated continuity-authority-revision wrapper is ever consumer-invoked (vs. self-application-only maintenance tooling run from this repository's own checkout, matching the same-shaped scripts already marked Class B self-application-only above) was not confidently determined within this dispatch's budget -- left for the follow-up dispatch's judgment rather than guessed.",
  },
]);

function posixPath(value) {
  return value.split(sep).join("/");
}

function gitListPlugin(root) {
  const result = spawnSync("git", ["ls-files", "-z", "--", SCAN_PREFIX], { cwd: root, encoding: "buffer" });
  if (result.status !== 0) throw new Error(`git ls-files failed with exit ${result.status ?? "unknown"}`);
  return decoder
    .decode(result.stdout)
    .split("\0")
    .filter(Boolean)
    .map(posixPath)
    .sort();
}

function defaultReadText(file) {
  return decoder.decode(readFileSync(file));
}

function fileAllowed(filePath, allowlist, usedAllowlistIndices) {
  const index = allowlist.findIndex((entry) => entry.filePattern && entry.filePattern.test(filePath));
  if (index < 0) return false;
  usedAllowlistIndices.add(index);
  return true;
}

/**
 * Scan one file's already-read text for the banned prefixes, honoring the
 * allowlist. Exported separately so a caller (the test suite) can exercise
 * the line-matching logic without touching the filesystem or git.
 */
export function checkText(filePath, text, allowlist, usedAllowlistIndices) {
  const findings = [];
  if (fileAllowed(filePath, allowlist, usedAllowlistIndices)) return findings;
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    for (const prefix of SOURCE_ONLY_PREFIXES) {
      if (!line.includes(prefix)) continue;
      const allowIndex = allowlist.findIndex((entry) => entry.file === filePath && entry.match && line.includes(entry.match));
      if (allowIndex >= 0) {
        usedAllowlistIndices.add(allowIndex);
        continue;
      }
      findings.push(`${filePath}:${i + 1}: names source-only path prefix "${prefix}" -- ${line.trim()}`);
    }
  }
  return findings;
}

export function checkRepository(rootInput, options = {}) {
  const root = resolve(rootInput);
  const readText = options.readText ?? defaultReadText;
  const files = options.scanPaths ?? gitListPlugin(root);
  const allowlist = options.allowlist ?? ALLOWLIST;
  const usedAllowlistIndices = new Set();
  const findings = [];

  for (const file of files) {
    let text;
    try {
      text = readText(resolve(root, file));
    } catch (error) {
      findings.push(`${file}: could not read as UTF-8 text (${error.message}) -- excluded from this check, not silently passed`);
      continue;
    }
    findings.push(...checkText(file, text, allowlist, usedAllowlistIndices));
  }

  allowlist.forEach((entry, index) => {
    if (usedAllowlistIndices.has(index)) return;
    const label = entry.filePattern ? `filePattern ${entry.filePattern}` : `"${entry.match}" in ${entry.file}`;
    findings.push(`allowlist: entry for ${label} never matched anything -- remove it`);
  });

  findings.sort();
  return { findings, stats: { filesScanned: files.length, allowlistEntries: allowlist.length } };
}

function runCli() {
  const args = process.argv.slice(2);
  const rootIndex = args.indexOf("--root");
  if (args.length && (rootIndex < 0 || rootIndex !== 0 || args.length !== 2)) {
    process.stderr.write("usage: check-consumer-safe-paths.mjs [--root <repository>]\n");
    process.exit(2);
  }
  const defaultRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
  const root = rootIndex === 0 ? args[1] : defaultRoot;
  try {
    const result = checkRepository(root);
    if (result.findings.length) {
      for (const item of result.findings) process.stderr.write(`CONSUMER-PATH ${item}\n`);
      process.stderr.write(`Consumer-safe-path check failed: ${result.findings.length} finding(s).\n`);
      process.exit(2);
    }
    process.stdout.write(
      `Consumer-safe-path check passed: ${result.stats.filesScanned} tracked file(s) under ${SCAN_PREFIX}, ` +
        `${result.stats.allowlistEntries} allowlist entr${result.stats.allowlistEntries === 1 ? "y" : "ies"} (all used).\n`,
    );
  } catch (error) {
    process.stderr.write(`Consumer-safe-path check unavailable: ${error.message}\n`);
    process.exit(2);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) runCli();
