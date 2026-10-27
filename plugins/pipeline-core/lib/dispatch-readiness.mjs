// Aggregate dispatch readiness (G18 Slice A). Pure: every probe is an injected observer.
// A probe is { area, observe() } where observe() returns { ok: true } or { code, nextAction }.
// All failing probes are listed in input order; a probe never aborts the assessment.
export const DISPATCH_READINESS_SCHEMA = "pipeline.dispatch-readiness.v1";

const nonEmpty = (value) => typeof value === "string" && value.trim().length > 0;

function observeOne(probe, index) {
  const area = nonEmpty(probe?.area) ? probe.area : `probe-${index}`;
  let observed;
  try {
    observed = probe.observe();
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return { area, code: "DR-PROBE-THREW", nextAction: `Repair the ${area} observer, which threw: ${detail}` };
  }
  if (observed !== null && typeof observed === "object" && observed.ok === true) return null;
  const code = nonEmpty(observed?.code) ? observed.code : "DR-PROBE-MALFORMED";
  if (!nonEmpty(observed?.nextAction)) {
    return { area, code: "DR-NEXT-ACTION-MISSING", nextAction: `The ${area} probe reported ${code} without a recovery action; add a nextAction to that probe` };
  }
  return { area, code, nextAction: observed.nextAction };
}

export function assessDispatchReadiness({ probes } = {}) {
  const blockers = [];
  (Array.isArray(probes) ? probes : []).forEach((probe, index) => {
    const blocker = observeOne(probe, index);
    if (blocker !== null) blockers.push(blocker);
  });
  return { schema: DISPATCH_READINESS_SCHEMA, status: blockers.length === 0 ? "ready" : "blocked", blockers };
}
