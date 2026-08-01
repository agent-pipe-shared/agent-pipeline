#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

import { writeSync } from "node:fs";
import { diagnoseCodexOnboardingSessionCapability } from "../lib/codex-onboarding-capabilities.mjs";

const args = process.argv.slice(2);
if (args.length !== 2 || args[0] !== "--repo" || !args[1] || args[1].startsWith("--")) {
  writeSync(2, "Usage: session-capability-diagnose.mjs --repo <checkout>\n");
  process.exitCode = 2;
} else {
  writeSync(1, `${JSON.stringify(diagnoseCodexOnboardingSessionCapability({ rootDir: args[1] }))}\n`);
}
