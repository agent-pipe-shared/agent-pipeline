// SPDX-License-Identifier: SUL-1.0
/**
 * C22 (CGF-03, CGF-20, AC-108): the assurance a Critic route will really deliver, stated BEFORE the dispatch. The Codex greenfield run learned that its
 * Critic was caller-authored (receipt: freshContext false, historyInherited true, `caller-authored-fallback`) only at the close, which then asked for a
 * PO acknowledgement nobody had planned for. This module reads the planned route and states, in the receipt's own vocabulary and never a stronger word,
 * what the finalized receipt will say and whether the close will need its own acknowledgement. Pure: no I/O, no state, never throws.
 *
 * It is a notice, not a gate. A route below the critical profile is not refused here: the one exception route that already exists for it is the PO
 * acknowledgement of exactly this packet at the close (`pipeline-state.mjs approve-critic-acknowledgement`, critic-acknowledgement.mjs), so the rule
 * never deadlocks, and the close gate (close-coordinator.mjs `assertCriticIndependenceForClose`) stays the one enforcing check.
 */
const RECEIPT_SOURCE = Object.freeze({ independence: "source-issued-origin", freshContext: true, historyInherited: false });
const RECEIPT_FALLBACK = Object.freeze({ independence: "caller-authored-fallback", freshContext: false, historyInherited: true });
const CRITICAL_TRIGGERS = Object.freeze(["T1", "T2"]);
const PACKET_ID = /^[a-f0-9]{32}$/u;

export const CRITIC_ROUTE_ASSURANCE_SCHEMA = "pipeline.critic-route-assurance.v1";

/** The runner of the calling session from its own markers; `unknown` when none is present (the assurance then promises nothing). */
export function criticRunnerFromEnv(env) {
  const source = env !== null && typeof env === "object" ? env : {};
  if (source.CODEX_SESSION_ID !== undefined || source.CODEX_THREAD_ID !== undefined) return "codex";
  if (source.ANTIGRAVITY_AGENT !== undefined || source.AI_AGENT === "antigravity") return "antigravity";
  if (source.CLAUDECODE !== undefined || source.CLAUDE_CODE_SESSION_ID !== undefined) return "claude";
  return "unknown";
}

// What the finalized receipt will carry, from the planned route. Null where no route is decided yet: nothing stronger than the floor is promised.
function expectedReceipt(runner, launchRoute) {
  if (runner === "claude" || runner === "antigravity") return RECEIPT_SOURCE;
  if (runner !== "codex" || launchRoute === null || typeof launchRoute !== "object" || typeof launchRoute.agentType !== "string") return null;
  return launchRoute.sandboxed === true ? RECEIPT_SOURCE : RECEIPT_FALLBACK;
}

/**
 * @param {{ runner?: string, trigger?: string, rigor?: number|null, packetId?: string, launchRoute?: object|null }} input `launchRoute` is the output of
 *   decideCodexCriticLaunchRoute (Codex only); `rigor` is the feature package's rigor when readable, else null.
 */
export function describeCriticRouteAssurance(input) {
  const { runner = "unknown", trigger = "T1", rigor = null, packetId = null, launchRoute = null } = input !== null && typeof input === "object" ? input : {};
  const expected = expectedReceipt(runner, launchRoute);
  const critical = CRITICAL_TRIGGERS.includes(trigger) || !["T1", "T2", "T3"].includes(trigger);
  // The close rule (close-coordinator.mjs): a caller-authored round satisfies the close only at rigor 0 and low risk; the critical profile is the high-risk duty.
  const whenFallback = critical || (Number.isInteger(rigor) && rigor >= 1) ? true : rigor === 0 ? false : "unknown";
  const required = expected === null ? (whenFallback === false ? false : "conditional") : expected === RECEIPT_FALLBACK ? whenFallback : false;
  const packet = typeof packetId === "string" && PACKET_ID.test(packetId) ? packetId : "<packet-id>";
  const command = `node \${PIPELINE_PLUGIN_ROOT}/scripts/pipeline-state.mjs approve-critic-acknowledgement --by <name> --critic-packet ${packet}`;
  const status = !critical ? "not-critical" : expected === null ? "conditional" : expected === RECEIPT_SOURCE ? "meets" : "below-required";
  const exception = status === "below-required" || status === "conditional"
    ? Object.freeze({ route: "po-acknowledgement", command, note: "a deliberate, recorded exception for exactly this packet and its candidate; never inferred, never generic" }) : null;
  const unknownRoute = expected === null
    ? (runner === "codex" ? "the Codex launch route is decided at launch from this machine's sandbox receipt: a sandboxed role gives a source-issued round, the default route gives the caller-authored fallback"
      : "no Critic route is known for this runner")
    : null;
  const words = (value) => `${value.independence} (freshContext ${value.freshContext}, historyInherited ${value.historyInherited})`;
  const notice = [
    expected === null ? `No Critic assurance is promised yet: ${unknownRoute}; the floor is ${words(RECEIPT_FALLBACK)}.`
      : `The planned Critic route will be recorded as ${words(expected)}${expected === RECEIPT_FALLBACK ? ", protected by instruction only" : ""}.`,
    required === true ? `The close will need the PO acknowledgement of this round (${critical ? "critical profile" : "rigor 1 or more"}): ${command}.`
      : required === "conditional" || required === "unknown" ? `If the round is recorded as the fallback, the close will need the PO acknowledgement of this round: ${command}.`
        : "The close needs no separate acknowledgement unless the round is finalized as the fallback.",
    status === "below-required" ? "This is below the critical profile; the acknowledgement above is the deliberate exception." : "",
  ].filter(Boolean).join(" ");
  return Object.freeze({
    schema: CRITIC_ROUTE_ASSURANCE_SCHEMA,
    runner: typeof runner === "string" ? runner : "unknown",
    plannedRoute: Object.freeze({ agentType: typeof launchRoute?.agentType === "string" ? launchRoute.agentType : null, sandboxed: typeof launchRoute?.sandboxed === "boolean" ? launchRoute.sandboxed : null }),
    expected,
    floor: RECEIPT_FALLBACK,
    profile: Object.freeze({ name: critical ? "critical" : "standard", status }),
    closeAcknowledgement: Object.freeze({ required, whenFallback, command }),
    exception,
    notice,
  });
}
