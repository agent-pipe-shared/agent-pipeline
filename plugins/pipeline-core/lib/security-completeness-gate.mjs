// SPDX-License-Identifier: SUL-1.0
/**
 * security-completeness-gate.mjs -- shared v2 policy-complete verdict consult, extracted
 * from `plugins/pipeline-core/hooks/guard-push.mjs`'s former private `checkSecurityEvidenceV2`
 * function (CYB-2I-0, Sprint Cyborg Wave 6 foundation).
 *
 * WHY THIS EXISTS (AC8, cyb-2-feature-spec.md): Push/PR/Close/Release must all consult the
 * SAME completeness evaluator -- no parallel duplicate evaluator per call site. Before this
 * extraction, the logic below lived as a private, non-exported function inside guard-push.mjs
 * that closed over that file's own module-level `sourceCommit`/`evidenceProjectDir`/
 * `readEvidence()` -- nothing outside guard-push.mjs could call it. This module reproduces that
 * exact logic, unchanged, but takes its inputs as explicit parameters instead of closed-over
 * outer scope, so CYB-2I-1 (PR), CYB-2I-2 (Close) and CYB-2I-3 (Release) can each import and
 * call this exact same function later instead of hand-rolling their own copy.
 *
 * DEPENDENCY DISCIPLINE: this module has ZERO import relationship with any `hooks/*.mjs` file.
 * It imports only `evaluateAllCapabilities`/`aggregateVerdict`/`validateSecurityEvidenceV2`
 * from the sibling `security-evidence-evaluator.mjs` (the same pure L3 evaluator
 * `security-scan.mjs` itself calls to produce the persisted evidence this module re-checks) --
 * see PROVENANCE below for what did NOT come along in the extraction and why.
 *
 * PROVENANCE / WHAT STAYED BEHIND (do not re-add here):
 *   - `resolveSourceTree()` (former guard-push.mjs ~line 1244) stays in guard-push.mjs,
 *     unchanged -- it is a memoized, SHARED `git rev-parse ...^{tree}` call also used by
 *     `checkSecurityEvidenceBinding` (the v1-only check), so it must not be duplicated here.
 *     Resolving `tree` is entirely the CALLER's job; this module never runs `git` itself.
 *   - `sourceCommit`/`evidenceProjectDir` are now the explicit `commit`/`projectDir`
 *     parameters below -- no module-level closure anywhere in this file.
 *   - The old function's evidence-file paths were hard-coded relative literals
 *     (`evidence/security-latest.v2.json` / `evidence/security-latest.v2.verdict.json`).
 *     They are now `envelopePath`/`verdictPath` parameters, defaulting to those exact
 *     literals so today's caller (guard-push.mjs) does not need to repeat them, but
 *     overridable for a future call site that binds against a different candidate location
 *     (e.g. a PR's own detached-worktree candidate directory). Failure-message text below
 *     therefore names the ACTUAL `envelopePath`/`verdictPath` passed in, not a hard-coded
 *     string -- for today's default-path caller this produces byte-identical text to the
 *     pre-extraction function (the default literal IS the string that used to be hard-coded);
 *     a future custom-path caller gets messages that correctly name ITS OWN path instead of a
 *     stale, misleading default.
 *
 * BINDING PROOF (ported from the pre-extraction header comment, CYB-2F briefing Field 1
 * items 1-3 -- this institutional knowledge is why the checks below are shaped the way they
 * are, not merely what they do):
 *   1. The envelope (`envelopePath`) must itself bind to the pushed source via
 *      `input.commit`/`input.tree`, exactly like the v1 candidate binding
 *      `checkSecurityEvidenceBinding` performs in guard-push.mjs -- using the CALLER's
 *      already-resolved `tree` (no `git rev-parse` inside this module; `commit` is likewise
 *      supplied by the caller, never re-derived here).
 *   2. The verdict document's (`verdictPath`) `capabilityOutcomes`/`verdict` must be
 *      reconcilable against the envelope's OWN `capabilities[].status`/`.classification`:
 *      this function feeds the envelope's capability records (capabilityId/tool/status/
 *      classification/reason only -- nothing else) plus the verdict's own persisted
 *      `plan.required`/`plan.optional` into the SAME pure, exported
 *      `evaluateAllCapabilities`/`aggregateVerdict` functions security-scan.mjs itself calls
 *      to produce these fields, and requires the recomputed PER-CAPABILITY outcome map to
 *      match the persisted `capabilityOutcomes` map exactly for every capabilityId present on
 *      either side, tolerating only the `{"invalid","execution-unavailable"}` pair as mutually
 *      equivalent (see the comparison block below for why that ONE pair alone is
 *      unreconstructable from persisted data) -- plus an independent `blocking` boolean match.
 *      A verdict document produced by an earlier/different run than the fresh envelope sitting
 *      next to it (or hand-edited independently of it) will, with overwhelming likelihood, fail
 *      this reconstruction, because the recomputed verdict reflects the FRESH envelope's own
 *      capability records, not whatever the stale/tampered verdict document separately claims --
 *      a genuine cross-run staleness/tamper proof, not merely a schema-shape check.
 *   3. Any failure above (envelope missing/stale/mismatched, verdict document missing/
 *      malformed/schema-wrong, or the reconstruction failing to match) is returned as its OWN
 *      failure line and short-circuits before the `verdict.blocking` check below runs at all --
 *      kept distinct from a `verdict.blocking === true` failure so a `blocking` reading is never
 *      surfaced from evidence this function cannot itself vouch for.
 *
 * MISSING-EVIDENCE DEFAULT: the v2 pair (envelope OR verdict) being absent entirely is
 * fail-closed here too, the same "never silent-block, never silent-pass" doctrine the v1
 * candidate-binding check already applies to a missing v1 evidence file.
 *
 * VERIFY: node plugins/pipeline-core/lib/security-completeness-gate.test.mjs (this module's own
 * unit tests) + node plugins/pipeline-core/hooks/guard-push.test.mjs +
 * node plugins/pipeline-core/hooks/guard-push-v2.test.mjs (end-to-end regression proof that the
 * extraction changed nothing observable about guard-push.mjs's own behavior).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { evaluateAllCapabilities, aggregateVerdict, validateSecurityEvidenceV2 } from "./security-evidence-evaluator.mjs";

const DEFAULT_ENVELOPE_PATH = "evidence/security-latest.v2.json";
const DEFAULT_VERDICT_PATH = "evidence/security-latest.v2.verdict.json";

/** Reads + JSON-parses an evidence file relative to `projectDir`; returns {ok:true, data} | {ok:false, reason}. */
function readEvidence(projectDir, relPath) {
  const p = join(projectDir, relPath);
  let raw;
  try {
    raw = readFileSync(p, "utf8");
  } catch {
    return { ok: false, reason: `${relPath} missing` };
  }
  let data;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    return { ok: false, reason: `${relPath} is corrupted (invalid JSON: ${e.message})` };
  }
  return { ok: true, data, relPath };
}

/**
 * Per-capabilityId outcome comparison (Finding 2, CYB-2F self-application Critic review
 * 2026-07-30 -- narrows a prior, over-broad tolerance). `evaluateCapability`'s ERROR-status
 * branch alone picks "invalid" vs "execution-unavailable" based on `capability.raw` (the
 * scanner's captured raw output), a field the persisted v2 envelope schema (`v2CapabilityRecord`,
 * security-scan.mjs) never carries -- it is never written to disk at all, only used transiently
 * inside security-scan.mjs's own original computation. This reconstruction therefore always
 * evaluates `raw` as absent for an ERROR-status capability, so ONLY the
 * `{"invalid","execution-unavailable"}` pair is genuinely unreconstructable from persisted data
 * and must be tolerated, in EITHER direction. Every OTHER outcome value across the full
 * ten-member RUN_OUTCOMES vocabulary is fully and unambiguously derivable from persisted
 * `status`+`required` alone -- a mismatch on any of those (e.g. a persisted "unsupported"
 * against a recomputed "required-capability-missing") is a genuine staleness/tamper signal and
 * must BLOCK, not be silently tolerated. Comparing only `blocking` + the capabilityId SET (the
 * prior approach) accidentally tolerated exactly this kind of non-ERROR divergence too, because
 * a lied outcome string never changes which capabilityId is offending nor the aggregate
 * `blocking` boolean -- only the label.
 */
const AMBIGUOUS_ERROR_OUTCOMES = new Set(["invalid", "execution-unavailable"]);
function outcomeMatches(recomputedOutcome, persistedOutcome) {
  if (recomputedOutcome === persistedOutcome) return true;
  return AMBIGUOUS_ERROR_OUTCOMES.has(recomputedOutcome) && AMBIGUOUS_ERROR_OUTCOMES.has(persistedOutcome);
}

/**
 * Checks the v2 policy-complete verdict pair (candidate-bound envelope + reconciled verdict)
 * for one project directory / source commit+tree. Returns a `string[]` of failure reasons
 * (empty array = pass). Pure with respect to this module's own state -- reads exactly the two
 * files named by `envelopePath`/`verdictPath` (relative to `projectDir`) and nothing else; runs
 * no `git` command; the caller is responsible for resolving `tree` (mirrors
 * `resolveSourceTree()` staying in guard-push.mjs, unchanged) and for gating WHEN this function
 * is called at all (e.g. only while a security gate is configured and active).
 *
 * @param {object} params
 * @param {string} params.projectDir - directory the evidence files are read relative to.
 * @param {string} params.commit - the pushed/candidate source commit OID to bind against.
 * @param {string|null} params.tree - the pushed/candidate source tree OID to bind against
 *   (caller-resolved; a falsy value always fails the tree-binding check, matching the
 *   pre-extraction function's `!sourceTree` guard).
 * @param {string} [params.envelopePath] - path to the v2 evidence envelope, relative to
 *   `projectDir`. Defaults to "evidence/security-latest.v2.json".
 * @param {string} [params.verdictPath] - path to the v2 policy-complete verdict document,
 *   relative to `projectDir`. Defaults to "evidence/security-latest.v2.verdict.json".
 * @returns {string[]} failure reasons; empty = pass.
 */
export function checkSecurityCompleteness({
  projectDir,
  commit,
  tree,
  envelopePath = DEFAULT_ENVELOPE_PATH,
  verdictPath = DEFAULT_VERDICT_PATH,
}) {
  const failures = [];
  const envelopeRead = readEvidence(projectDir, envelopePath);
  const verdictRead = readEvidence(projectDir, verdictPath);
  if (!envelopeRead.ok) failures.push(envelopeRead.reason);
  if (!verdictRead.ok) failures.push(verdictRead.reason);
  if (!envelopeRead.ok || !verdictRead.ok) return failures;

  const envelope = envelopeRead.data;
  const verdictDoc = verdictRead.data;

  // Envelope schema-shape validation (Finding 6, CYB-2F self-application Critic review
  // 2026-07-30): reuses the real exported full-schema validator (PART A of
  // security-evidence-evaluator.mjs) instead of a hand-rolled narrow subset that previously
  // checked only the schema string + a non-empty `capabilities` array, silently trusting the
  // rest of the envelope's shape (policy/environment identity, per-capability
  // tool/rulePack/findings/coverage shape). The candidate-BINDING checks right below
  // (commit/tree matching the pushed source) stay hand-rolled: they are this gate's own job,
  // not generic schema shape -- the real validator has no notion of "the pushed source" to
  // check field values against.
  const envelopeValidation = validateSecurityEvidenceV2(envelope);
  if (!envelopeValidation.valid) {
    failures.push(
      `${envelopePath}: envelope schema is invalid (${envelopeValidation.errors.map((e) => e.message).join("; ")})`,
    );
  }
  if (envelope?.input?.commit !== commit) {
    failures.push(`${envelopePath}: input commit does not match the pushed source`);
  }
  if (!tree || envelope?.input?.tree !== tree) {
    failures.push(`${envelopePath}: input tree does not match the pushed source`);
  }
  if (verdictDoc?.schema !== "pipeline.security-verdict.v2") {
    failures.push(`${verdictPath}: exact policy-complete verdict v2 schema is required`);
  }
  const plan = verdictDoc?.plan;
  if (!plan || !Array.isArray(plan.required) || !Array.isArray(plan.optional)) {
    failures.push(`${verdictPath}: plan.required/plan.optional is missing or malformed`);
  }
  const verdictBlock = verdictDoc?.verdict;
  if (typeof verdictBlock?.blocking !== "boolean" || !Array.isArray(verdictBlock?.offendingCapabilities)) {
    failures.push(`${verdictPath}: verdict.blocking/offendingCapabilities shape is invalid`);
  }
  const persistedOutcomes = verdictDoc?.capabilityOutcomes;
  if (!persistedOutcomes || typeof persistedOutcomes !== "object" || Array.isArray(persistedOutcomes)) {
    failures.push(`${verdictPath}: capabilityOutcomes map is missing or malformed`);
  }
  if (failures.length > 0) return failures;

  let recomputed;
  let recomputedOutcomes;
  try {
    const evalCandidate = {
      capabilities: envelope.capabilities.map((c) => ({
        id: c?.capabilityId,
        tool: c?.tool?.name,
        status: c?.status,
        classification: c?.classification,
        reason: c?.reason ?? null,
      })),
    };
    const planForEval = { required: plan.required, optional: plan.optional };
    recomputedOutcomes = evaluateAllCapabilities(evalCandidate, planForEval);
    recomputed = aggregateVerdict(recomputedOutcomes, planForEval);
  } catch (e) {
    return [
      `${verdictPath}: capabilityOutcomes could not be reconciled against ${envelopePath}'s capability records (${e.message})`,
    ];
  }

  // Per-capabilityId outcome comparison -- see `outcomeMatches`'s own doc comment above for the
  // full rationale. Comparing only `blocking` + the capabilityId SET (the prior approach)
  // accidentally tolerated non-ERROR outcome-label divergence too; this compares every
  // capabilityId present on EITHER side of the persisted `capabilityOutcomes` map against the
  // freshly recomputed per-capability outcome map. The actual reported outcome string in the
  // failure line below still always comes from the PERSISTED verdict, never from this
  // reconstruction.
  const outcomeCapabilityIds = new Set([...Object.keys(recomputedOutcomes), ...Object.keys(persistedOutcomes)]);
  const outcomesConsistent = [...outcomeCapabilityIds].every((capabilityId) =>
    outcomeMatches(recomputedOutcomes[capabilityId], persistedOutcomes[capabilityId]),
  );
  const isConsistent = recomputed.blocking === verdictBlock.blocking && outcomesConsistent;
  if (!isConsistent) {
    return [`${verdictPath}: verdict is not consistent with ${envelopePath}'s capability records (stale or mismatched pair)`];
  }

  if (verdictBlock.blocking === true) {
    for (const offender of verdictBlock.offendingCapabilities) {
      failures.push(
        `${verdictPath}: required capability ${offender?.capabilityId} did not reach an accepted state (outcome=${offender?.outcome})`,
      );
    }
  }
  return failures;
}
