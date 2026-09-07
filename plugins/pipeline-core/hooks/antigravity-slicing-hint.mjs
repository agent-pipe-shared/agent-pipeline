#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/** Native Antigravity ADR-0080 observer/delivery hook. It is advisory only. */
import { readFileSync } from "node:fs";
import { isDirectInvocation } from "../lib/entrypoint.mjs";
import { deliverAntigravitySlicing, observeAntigravitySlicing } from "./native-slicing.mjs";

export function antigravitySlicingOutput(input, phase = "observe") {
  const result = phase === "deliver"
    ? deliverAntigravitySlicing(input)
    : observeAntigravitySlicing(input);
  if (!result.output) return "";
  return JSON.stringify({ injectSteps: [{ ephemeralMessage: result.output }] });
}

if (isDirectInvocation(import.meta.url)) {
  try {
    const input = JSON.parse(readFileSync(0, "utf8"));
    const output = antigravitySlicingOutput(input, process.argv[2] ?? "observe");
    if (output) process.stdout.write(output);
  } catch {
    // An advisory cannot deny, escalate, or launch work when its storage fails.
  }
}
