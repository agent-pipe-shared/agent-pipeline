#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

/** Model-free authority for the direct Codex host consult. */
export const ROUTES = Object.freeze({
  HOST: "host-bound-consult",
  NO_CONSENT: "disabled-no-consent",
  PROFILE: "disabled-by-profile",
});

const KEYS = ["consent", "profile", "runner"];
function invalid(message) {
  const error = new Error(message);
  error.code = "invalid-route-input";
  throw error;
}

export function selectHostAdvisorRoute(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)
    || JSON.stringify(Object.keys(input).sort()) !== JSON.stringify(KEYS)) invalid("input shape is unsupported");
  const { runner, profile, consent } = input;
  if (runner !== "codex") invalid("runner must be codex");
  if (!["epic", "feature", "mini"].includes(profile)) invalid("profile is invalid");
  if (!["default", "approved", "declined"].includes(consent)) invalid("consent is invalid");
  if (profile === "mini") return ROUTES.PROFILE;
  if (consent === "declined") return ROUTES.NO_CONSENT;
  return ROUTES.HOST;
}

// Compatibility name for callers that use the generic advisory terminology.
export const selectAdvisoryRoute = selectHostAdvisorRoute;

if (import.meta.url === `file://${process.argv[1]}`) {
  let text = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk) => { text += chunk; });
  process.stdin.on("end", () => { try { process.stdout.write(`${JSON.stringify({ route: selectHostAdvisorRoute(JSON.parse(text)) })}\n`); } catch { process.exitCode = 2; } });
}
