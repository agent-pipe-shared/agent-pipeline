// SPDX-License-Identifier: SUL-1.0

/**
 * Durable, runner-neutral design Advisor admission record.
 *
 * The record is deliberately separate from mutable pipeline State: State owns
 * the PO transition, while this record proves the required independent design
 * consultation (or its narrowly typed unavailable case) before product writes
 * are admitted.  A caller must independently validate the final PO authority
 * for the unavailable branch; this module never turns a boolean projection
 * such as `planApproved` into that authority.
 */
import { createHash } from "node:crypto";

import { evaluateDesignAdvisoryAdmission } from "./design-advisory-admission.mjs";

export const DESIGN_ADVISORY_RECORD_SCHEMA = "pipeline.design-advisory-admission-record.v1";
export const DESIGN_ADVISORY_RECORD_PATH = "project/design-advisory-admission.json";

const SHA256 = /^[a-f0-9]{64}$/u;
const PATH = /^(?!\/)(?!.*\\)(?!.*(?:^|\/)\.{1,2}(?:\/|$))[A-Za-z0-9._/@:-]+$/u;

function exact(value, names) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).length === names.length && names.every((name) => Object.hasOwn(value, name));
}

function fail(code) { return { ok: false, code }; }

/**
 * Validate a persisted record against the currently approved package bytes.
 * `finalApprovalValid` is deliberately supplied by an authority reader that
 * checks a real human-decision readback; a mutable State projection is never
 * accepted here as a substitute.
 */
export function evaluateDesignAdvisoryRecord({ record, featureId, planPath, specPath, planSha256, specSha256, finalApprovalValid = false } = {}) {
  if (!exact(record, ["schema", "featureId", "planPath", "specPath", "admission"])) return fail("design-advisor-record-shape");
  if (record.schema !== DESIGN_ADVISORY_RECORD_SCHEMA
    || typeof record.featureId !== "string" || record.featureId.length === 0
    || !PATH.test(record.planPath ?? "") || !PATH.test(record.specPath ?? "")
    || record.featureId !== featureId || record.planPath !== planPath || record.specPath !== specPath
    || !SHA256.test(planSha256 ?? "") || !SHA256.test(specSha256 ?? "")) return fail("design-advisor-record-binding");
  const evaluated = evaluateDesignAdvisoryAdmission(record.admission);
  if (!evaluated.ok) return fail(`design-advisor-${evaluated.code}`);
  const workflow = record.admission.workflow;
  if (workflow.designSha256 !== planSha256 || workflow.evidenceSha256 !== specSha256) {
    return fail("design-advisor-package-drift");
  }
  if (evaluated.mode === "advisor-unavailable-exception" && finalApprovalValid !== true) {
    return fail("design-advisor-unavailable-final-approval-unverified");
  }
  return { ok: true, mode: evaluated.mode, route: evaluated.route };
}

export function designAdvisoryRecordSha256(record) {
  return createHash("sha256").update(JSON.stringify(record)).digest("hex");
}
