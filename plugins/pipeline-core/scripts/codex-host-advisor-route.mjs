#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

/** Model-free route authority used only after a valid on-demand trigger. */
import { isDirectInvocation } from "../lib/entrypoint.mjs";

export const ROUTES = Object.freeze({
  HOST: "host-bound-consult",
  NO_CONSENT: "disabled-no-consent",
  PROFILE: "disabled-by-profile",
});
export const HOST_ADVISOR_POLICY = Object.freeze({
  schema: "pipeline.codex-host-advisor-policy.v1",
  maxAttempts: 2,
  primary: Object.freeze({
    agentName: "consult-advisor",
    model: "gpt-5.6-sol",
    effort: "max",
    timeoutMs: 180_000,
  }),
  fallback: Object.freeze({
    agentName: "consult-advisor-fast",
    model: "gpt-5.6-terra",
    effort: "high",
    timeoutMs: 90_000,
    forkTurns: "none",
  }),
  workspaceGuard: "sha256-before-between-after",
  exhausted: "continue-advisory-unavailable",
});

const KEYS = ["consent", "profile", "runner"];
export const USAGE = "Usage: codex-host-advisor-route.mjs --runner codex --profile <epic|feature|mini> --consent <default|approved|declined>";
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

export function resolveHostAdvisorRoute(input) {
  const route = selectHostAdvisorRoute(input);
  return {
    route,
    policy: route === ROUTES.HOST ? HOST_ADVISOR_POLICY : null,
  };
}

export function parseHostAdvisorRouteArgs(argv) {
  if (!Array.isArray(argv) || argv.length !== 6) invalid(USAGE);
  const input = {};
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!["--runner", "--profile", "--consent"].includes(flag)
      || Object.prototype.hasOwnProperty.call(input, flag.slice(2))
      || typeof value !== "string"
      || value === "") invalid(USAGE);
    input[flag.slice(2)] = value;
  }
  return input;
}

function writeRoute(input, write) {
  write(`${JSON.stringify(resolveHostAdvisorRoute(input))}\n`);
}

if (isDirectInvocation(import.meta.url)) {
  const argv = process.argv.slice(2);
  if (argv.length > 0) {
    if (argv.length === 1 && argv[0] === "--help") {
      process.stdout.write(`${USAGE}\n`);
    } else {
      try {
        writeRoute(parseHostAdvisorRouteArgs(argv), process.stdout.write.bind(process.stdout));
      } catch {
        process.stderr.write(`${USAGE}\n`);
        process.exitCode = 2;
      }
    }
  } else {
    let text = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => { text += chunk; });
    process.stdin.on("end", () => {
      try {
        writeRoute(JSON.parse(text), process.stdout.write.bind(process.stdout));
      } catch {
        process.exitCode = 2;
      }
    });
  }
}
