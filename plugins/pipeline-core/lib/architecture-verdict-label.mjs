// SPDX-License-Identifier: SUL-1.0
/**
 * CGF-08 / CGF-23 (AC-108): the one label every architecture verdict carries, so a reader can tell which candidate it was observed
 * at, when, over what scope, whether it blocks or only reports, and whether it is still current. Pure: nothing here reads or writes
 * a store, and a value that was not observed is typed null / "unobserved", never guessed.
 *
 * The label is attached to OUTPUT objects only. The stored rigor history, the closed feature entry and the close readback rows are
 * hashed or closed-shape records; a new key there would invalidate rows that already exist, so those surfaces carry the label as
 * text in their free `evidence` string (see close-quality-readback.mjs) or are labelled by a function over the record.
 *
 * The one current projection (`currentArchitectureProjection`, below) is read by the preflight orientation and the Verify output. PO
 * decision (CGF-08): the blocking check alone decides the gate verdict of a candidate; the recorded fitness observation stays beside it
 * as a report-only label and never changes the gate.
 */
export const ARCHITECTURE_VERDICT_LABEL_SCHEMA = "pipeline.architecture-verdict-label.v1";
export const ARCHITECTURE_PROJECTION_SCHEMA = "pipeline.architecture-projection.v1";
export const VERDICT_EFFECTS = Object.freeze(["blocking", "report-only"]);
export const VERDICT_CURRENCIES = Object.freeze(["current", "superseded", "unobserved"]);

const OID = /^[a-f0-9]{40}(?:[a-f0-9]{24})?$/u;
const invalid = (field) => new Error(`AVL-INVALID: ${field}`);
const text = (value) => typeof value === "string" && value.trim() !== "";
const canonicalIso = (value) => typeof value === "string" && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;

/** A frozen, validated label. `candidate` and `observedAt` are null when they were not observed. */
export function architectureVerdictLabel({ source, verdict, candidate = null, observedAt = null, scope, effect, currency, reportOnlyOpen = [] } = {}) {
  if (!text(source)) throw invalid("source");
  if (!text(verdict)) throw invalid("verdict");
  if (!(candidate === null || (typeof candidate === "string" && OID.test(candidate)))) throw invalid("candidate");
  if (!(observedAt === null || canonicalIso(observedAt))) throw invalid("observedAt");
  if (!text(scope)) throw invalid("scope");
  if (!VERDICT_EFFECTS.includes(effect)) throw invalid("effect");
  if (!VERDICT_CURRENCIES.includes(currency)) throw invalid("currency");
  if (!Array.isArray(reportOnlyOpen) || !reportOnlyOpen.every((entry) => entry !== null && typeof entry === "object"
    && (typeof entry.classId === "string" || Number.isSafeInteger(entry.classId)) && Number.isSafeInteger(entry.open) && entry.open >= 0 && text(entry.detail))) throw invalid("reportOnlyOpen");
  return Object.freeze({
    schema: ARCHITECTURE_VERDICT_LABEL_SCHEMA, source, verdict, candidate, observedAt, scope, effect, currency,
    reportOnlyOpen: Object.freeze(reportOnlyOpen.map(({ classId, open, detail }) => Object.freeze({ classId, open, detail }))),
  });
}

/** The label as one line of text, for the places whose shape is closed and carries only a free evidence string. */
export function describeVerdictLabel(label) {
  const open = label.reportOnlyOpen.length === 0 ? "no open report-only class"
    : `open report-only: ${label.reportOnlyOpen.map((entry) => `${entry.classId} (${entry.open})`).join(", ")}`;
  return `${label.verdict} (${label.effect}, ${label.currency}); candidate ${label.candidate === null ? "unobserved" : label.candidate.slice(0, 12)}; `
    + `observed ${label.observedAt ?? "unobserved"}; scope ${label.scope}; ${open}`;
}

const nonPass = (rows) => (Array.isArray(rows) ? rows.filter((row) => row?.outcome !== "pass") : []);

/**
 * The label of a close architecture-fitness disposition (`closeArchitectureFitnessDisposition`). Report-only: those classes never
 * block. A source that drifted since the observation makes it superseded; no recorded projection leaves it unobserved.
 */
export function closeFitnessVerdictLabel(disposition, { observedAt = null } = {}) {
  const status = disposition?.status;
  const commit = typeof disposition?.candidate?.commit === "string" ? disposition.candidate.commit : null;
  const observed = status !== "unavailable";
  return architectureVerdictLabel({
    source: "close-architecture-fitness", verdict: status, candidate: observed ? commit : null, observedAt: observed ? observedAt : null,
    scope: "fitness property classes, pre-close observation", effect: "report-only",
    currency: !observed ? "unobserved" : status === "source-drift" ? "superseded" : "current",
    reportOnlyOpen: (disposition?.dispositions ?? []).map((row) => ({ classId: row.classId, open: 1, detail: `${row.propertyId}: ${row.observedOutcome}` })),
  });
}

/**
 * The label of one recorded pre-close observation (a rigor-history body that carries a fitness projection). The source currency is not
 * re-checked here, so it stays "unobserved"; the close disposition is the place that re-reads the bindings.
 */
export function fitnessObservationVerdictLabel(body) {
  const open = nonPass(body?.fitnessProjection?.outcomes);
  const commit = typeof body?.candidate?.commit === "string" ? body.candidate.commit : null;
  return architectureVerdictLabel({
    source: "recorded-fitness-observation",
    verdict: !Array.isArray(body?.fitnessProjection?.outcomes) ? "no-outcomes-recorded" : open.length === 0 ? "observed-pass" : "observed-open",
    candidate: commit !== null && OID.test(commit) ? commit : null, observedAt: canonicalIso(body?.observedAt) ? body.observedAt : null,
    scope: "fitness property classes, latest recorded observation of the feature", effect: "report-only", currency: "unobserved",
    reportOnlyOpen: open.map((row) => ({ classId: row.classId, open: 1, detail: `${row.propertyId}: ${row.outcome}` })),
  });
}

/**
 * The one current architecture projection (CGF-08, PO decision). `boundaryVerdict` is the label of the blocking boundary check, or
 * null/absent when none was observed; `fitnessLabel` is the label of the stored fitness observation, or null/absent. The gate part is
 * the blocking label verbatim (a typed "no-blocking-result", candidate and date null, when there is none: nothing is claimed). The
 * report-only part is the fitness label verbatim, with its observation date and open classes: never hidden by a PASS, and it never
 * upgrades or downgrades the gate. A label of the wrong effect is refused, not reinterpreted. Pure: no store, no clock.
 */
export function currentArchitectureProjection({ boundaryVerdict = null, fitnessLabel = null } = {}) {
  const asLabel = (value, effect, field) => {
    try {
      if (value === null || typeof value !== "object" || value.effect !== effect) throw invalid(field);
      return architectureVerdictLabel(value);
    } catch { throw invalid(field); }
  };
  const gate = boundaryVerdict === null ? architectureVerdictLabel({
    source: "architecture-boundary-check", verdict: "no-blocking-result", scope: "no stored blocking result for this candidate", effect: "blocking", currency: "unobserved",
  }) : asLabel(boundaryVerdict, "blocking", "boundaryVerdict");
  const reportOnly = fitnessLabel === null ? null : asLabel(fitnessLabel, "report-only", "fitnessLabel");
  return Object.freeze({
    schema: ARCHITECTURE_PROJECTION_SCHEMA, decidedBy: boundaryVerdict === null ? "none" : "blocking-check", gate, reportOnly,
    summary: Object.freeze([
      `gate: ${describeVerdictLabel(gate)}`,
      reportOnly === null ? "report-only: no recorded observation" : `report-only: ${describeVerdictLabel(reportOnly)}`,
    ]),
  });
}
