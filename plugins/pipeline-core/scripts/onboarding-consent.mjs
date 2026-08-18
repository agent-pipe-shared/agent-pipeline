#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

/**
 * PHX-WP-ONBOARDING-CONSENT-LOCK: the sanctioned call site for the
 * onboarding-consent marker (../lib/onboarding-consent-marker.mjs).
 *
 * `record` is meant to be invoked at the exact moment the PO gives consent
 * to adopt Agent Pipeline for this repository -- see
 * plugins/pipeline-core/skills/pipeline-start/SKILL.md, "One onboarding
 * consent, not a chain of prompts". Wiring this call into that live prose
 * flow is deliberately out of scope for the dispatch that introduced this
 * file (Forbidden section, PHX-WP-ONBOARDING-CONSENT-LOCK briefing); this
 * CLI exists and is tested so a follow-up dispatch can wire it in without
 * inventing the mechanism.
 *
 * `override-clear` is the explicit, PO-confirmed "work without Pipeline"
 * escape hatch. It records a free-text `--reason` but does NOT itself prove
 * PO identity (no HGO/GMW signature binding) -- see the lib module's own
 * "NOT COVERED" section for that limitation.
 *
 * Usage:
 *   node onboarding-consent.mjs record --root <repoRoot>
 *   node onboarding-consent.mjs status --root <repoRoot>
 *   node onboarding-consent.mjs override-clear --root <repoRoot> --reason "<text>"
 */
import { resolve } from "node:path";

import { isDirectInvocation } from "../lib/entrypoint.mjs";
import { clearConsentMarker, readConsentMarker, recordConsentGiven } from "../lib/onboarding-consent-marker.mjs";

export function argValue(args, name) {
  const index = args.indexOf(name);
  return index === -1 ? null : (args[index + 1] ?? null);
}

function requireRoot(args) {
  const root = argValue(args, "--root");
  if (typeof root !== "string" || root === "") {
    process.stderr.write("onboarding-consent.mjs: missing --root\n");
    process.exit(1);
  }
  return resolve(root);
}

export function runOnboardingConsentCli(argv) {
  const [command, ...rest] = argv;
  if (command === "record") {
    const rootDir = requireRoot(rest);
    const record = recordConsentGiven({ rootDir });
    process.stdout.write(`${JSON.stringify(record)}\n`);
    return 0;
  }
  if (command === "status") {
    const rootDir = requireRoot(rest);
    const state = readConsentMarker({ rootDir });
    process.stdout.write(`${JSON.stringify(state)}\n`);
    return 0;
  }
  if (command === "override-clear") {
    const rootDir = requireRoot(rest);
    const reason = argValue(rest, "--reason");
    if (typeof reason !== "string" || reason.trim() === "") {
      process.stderr.write("onboarding-consent.mjs: missing --reason (a PO-confirmed reason is required)\n");
      return 1;
    }
    const result = clearConsentMarker({ rootDir, reason: "po-explicit-override" });
    process.stdout.write(`${JSON.stringify({ ...result, statedReason: reason })}\n`);
    return 0;
  }
  process.stderr.write(
    "usage: onboarding-consent.mjs <record|status|override-clear> --root <repoRoot> [--reason <text>]\n",
  );
  return 1;
}

if (isDirectInvocation(import.meta.url)) {
  process.exit(runOnboardingConsentCli(process.argv.slice(2)));
}
