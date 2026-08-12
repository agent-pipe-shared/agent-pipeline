#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
import { readFileSync, unlinkSync } from "node:fs";
import { resolve } from "node:path";
import { captureResumeHint, discardResumeHint, inspectResumeHint } from "../lib/resume-hint.mjs";

function value(args, flag) { const index = args.indexOf(flag); return index < 0 ? null : args[index + 1] ?? null; }
function basis(args) {
  const featureId = value(args, "--feature-id"); const planSha256 = value(args, "--plan-sha256"); const specSha256 = value(args, "--spec-sha256");
  return [featureId, planSha256, specSha256].every((entry) => entry === null) ? null : { featureId, planSha256, specSha256 };
}
// NVA-BL-72: `progress` is an OPTIONAL fifth key (lib/resume-hint.mjs's CONTEXT_OPTIONAL_KEYS)
// -- a card carrying it must reach the real validator (buildResumeHint/validContext), not be
// turned away here on a stale exact-4-key gate. Missing it would make the new field
// unreachable through the one argv shape isRestartResumeHintCapture() admits pre-restart.
const REQUIRED_CARD_KEYS = ["constraints", "intent", "questions", "scope"];
const OPTIONAL_CARD_KEYS = ["progress"];
function contextCard(path) {
  const card = JSON.parse(readFileSync(resolve(path), "utf8"));
  const keys = card && typeof card === "object" && !Array.isArray(card) ? Object.keys(card) : null;
  const shaped = keys !== null
    && REQUIRED_CARD_KEYS.every((key) => keys.includes(key))
    && keys.every((key) => REQUIRED_CARD_KEYS.includes(key) || OPTIONAL_CARD_KEYS.includes(key));
  if (!shaped) throw new Error("RH-CARD-SCHEMA");
  return card;
}
function main() {
  const [command, ...args] = process.argv.slice(2); const root = value(args, "--root");
  if (!root || !["inspect", "capture", "discard"].includes(command)) throw new Error("usage: resume-hint.mjs <inspect|capture|discard> --root <project> [--card-file <json>] [--feature-id <id> --plan-sha256 <sha256> --spec-sha256 <sha256>");
  const rootDir = resolve(root); const observedBasis = basis(args);
  if (command === "inspect") return inspectResumeHint({ rootDir, basis: observedBasis });
  if (command === "discard") return discardResumeHint({ rootDir });
  const cardFile = value(args, "--card-file");
  if (!cardFile) throw new Error("capture requires --card-file");
  const consumeCard = args.includes("--consume-card");
  try {
    return captureResumeHint({ rootDir, context: contextCard(cardFile), basis: observedBasis });
  } finally {
    if (consumeCard) {
      try { unlinkSync(resolve(cardFile)); }
      catch (error) { if (error?.code !== "ENOENT") throw error; }
    }
  }
}
try { process.stdout.write(`${JSON.stringify(main())}\n`); } catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 2; }
