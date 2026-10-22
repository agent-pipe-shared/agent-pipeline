#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

/** Model-free route authority used only after a valid on-demand trigger. */
import { isDirectInvocation } from "../lib/entrypoint.mjs";
import { readFileSync } from "node:fs";
import { release as osRelease } from "node:os";
import { validatePreflightReceipt } from "./codex-sandbox-preflight.mjs";

export const ROUTES = Object.freeze({
  HOST: "host-bound-consult",
  NO_CONSENT: "disabled-no-consent",
  PROFILE: "disabled-by-profile",
  WSL_UNAVAILABLE: "advisory-unavailable-wsl-native-deferred",
});
export const HOST_ADVISOR_POLICY = Object.freeze({
  schema: "pipeline.codex-host-advisor-policy.v1",
  maxAttempts: 1,
  timeoutMs: 180_000,
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

export function isWslHostObservation(observation) {
  if (!observation || typeof observation !== "object" || Array.isArray(observation)) return false;
  const platform = observation.platform;
  const release = observation.release;
  const wslDistroName = observation.wslDistroName;
  return platform === "linux" && (
    (typeof release === "string" && /(?:microsoft|wsl)/iu.test(release))
    || (typeof wslDistroName === "string" && wslDistroName.length > 0)
  );
}

function currentHostObservation() {
  return {
    platform: process.platform,
    release: osRelease(),
    wslDistroName: process.env.WSL_DISTRO_NAME,
  };
}

/** The one runnable repair for the WSL deferral: the existing sandbox preflight, which writes the receipt that lifts it. */
export const WSL_PREFLIGHT_REPAIR = "node <plugin-root>/scripts/codex-sandbox-preflight.mjs --run --kind intermediate --codex <absolute-codex-path> --receipt <absolute-new-receipt-path>";
export const WSL_PREFLIGHT_REASON = "wsl-sandbox-preflight-not-passed";

/**
 * True only for a valid, existing pipeline.codex-sandbox-preflight.v1 receipt that
 * a real run on a WSL2 kernel reported as an intermediate "ok" with unchanged canaries.
 * Anything else, including a malformed receipt, is false and keeps the deferral.
 */
export function isPassingWslSandboxPreflight(receipt) {
  try {
    validatePreflightReceipt(receipt);
    return receipt.eligibility === "intermediate" && receipt.terminalCode === "ok"
      && receipt.platform.kernelClass === "wsl2" && receipt.canaries.unchanged === true;
  } catch { return false; }
}

export function selectHostAdvisorRouteForHost(input, hostObservation, sandboxPreflight = null) {
  const route = selectHostAdvisorRouteWithoutHost(input);
  if (route === ROUTES.HOST && isWslHostObservation(hostObservation) && !isPassingWslSandboxPreflight(sandboxPreflight)) return ROUTES.WSL_UNAVAILABLE;
  return route;
}

function selectHostAdvisorRouteWithoutHost(input) {
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

export function selectHostAdvisorRoute(input, sandboxPreflight = null) {
  return selectHostAdvisorRouteForHost(input, currentHostObservation(), sandboxPreflight);
}

// Compatibility name for callers that use the generic advisory terminology.
export const selectAdvisoryRoute = selectHostAdvisorRoute;

export function resolveHostAdvisorRouteForHost(input, hostObservation, sandboxPreflight = null) {
  const route = selectHostAdvisorRouteForHost(input, hostObservation, sandboxPreflight);
  return {
    route,
    policy: route === ROUTES.HOST ? HOST_ADVISOR_POLICY : null,
    ...(route === ROUTES.WSL_UNAVAILABLE ? { reason: WSL_PREFLIGHT_REASON, repair: WSL_PREFLIGHT_REPAIR } : {}),
  };
}

export function resolveHostAdvisorRoute(input, sandboxPreflight = null) {
  return resolveHostAdvisorRouteForHost(input, currentHostObservation(), sandboxPreflight);
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

function writeRoute(input, write, sandboxPreflight = null) {
  write(`${JSON.stringify(resolveHostAdvisorRoute(input, sandboxPreflight))}\n`);
}

/** Optional trailing `--sandbox-preflight <receipt.json>`: the receipt a real preflight run wrote; unreadable means absent. */
function splitPreflightArgs(argv) {
  if (argv.length !== 8 || argv[6] !== "--sandbox-preflight") return { routeArgv: argv, sandboxPreflight: null };
  let sandboxPreflight = null;
  try { sandboxPreflight = JSON.parse(readFileSync(argv[7], "utf8")); } catch { sandboxPreflight = null; }
  return { routeArgv: argv.slice(0, 6), sandboxPreflight };
}

if (isDirectInvocation(import.meta.url)) {
  const argv = process.argv.slice(2);
  if (argv.length > 0) {
    if (argv.length === 1 && argv[0] === "--help") {
      process.stdout.write(`${USAGE}\n`);
    } else {
      try {
        const { routeArgv, sandboxPreflight } = splitPreflightArgs(argv);
        writeRoute(parseHostAdvisorRouteArgs(routeArgv), process.stdout.write.bind(process.stdout), sandboxPreflight);
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
