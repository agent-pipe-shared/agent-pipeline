#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
import { readFileSync, unlinkSync } from "node:fs";
import { resolve } from "node:path";
import { captureResumeHint, discardResumeHint, inspectResumeHint, verbatimMaterialRejection } from "../lib/resume-hint.mjs";
import {
  applyOnboardingIntakeCapture, applyOnboardingIntakeConsent,
  readOnboardingIntakeCheckpoint, readOnboardingIntakeMaterialInput,
} from "../lib/onboarding-continuity.mjs";

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
// NVA-RESUMEVERBATIM-1: two more OPTIONAL top-level keys, carried through this SAME one
// guard-admitted argv shape (never a new flag -- the briefing's own hard boundary), but
// NEVER forwarded to lib/resume-hint.mjs's distilled-card validator (which stays 4/5-key
// exact, unchanged): stripped off in main() below and routed instead into the ALREADY
// restart-resilient onboarding intake checkpoint (onboarding-continuity.mjs), the one
// storage this design reuses rather than inventing a new one. `materialInput` is an
// array of verbatim, unbounded, possibly multi-line strings -- the user's own material
// design input, one entry per captured chunk, never subject to the 4/4/3 short-string
// caps. `values` mirrors the checkpoint's own `{ gitAuthor, language, profile }` shape
// so it can be handed to applyOnboardingIntakeConsent almost unmodified.
const VERBATIM_CARD_KEYS = ["materialInput", "values"];
function contextCard(path) {
  const card = JSON.parse(readFileSync(resolve(path), "utf8"));
  const keys = card && typeof card === "object" && !Array.isArray(card) ? Object.keys(card) : null;
  const shaped = keys !== null
    && REQUIRED_CARD_KEYS.every((key) => keys.includes(key))
    && keys.every((key) => REQUIRED_CARD_KEYS.includes(key) || OPTIONAL_CARD_KEYS.includes(key) || VERBATIM_CARD_KEYS.includes(key));
  if (!shaped) throw new Error("RH-CARD-SCHEMA");
  return card;
}
function validMaterialInput(entries) {
  return entries === undefined
    || (Array.isArray(entries) && entries.length > 0 && entries.every((entry) => typeof entry === "string"));
}
function validGitAuthor(author) {
  if (author === undefined || author === null) return true;
  if (typeof author !== "object" || Array.isArray(author)) return false;
  const keys = Object.keys(author);
  return keys.every((key) => ["name", "email"].includes(key))
    && typeof author.name === "string" && author.name.trim().length > 0
    && typeof author.email === "string" && author.email.trim().length > 0;
}
function validValues(values) {
  if (values === undefined) return true;
  if (values === null || typeof values !== "object" || Array.isArray(values)) return false;
  const keys = Object.keys(values);
  if (!keys.every((key) => ["gitAuthor", "language", "profile"].includes(key))) return false;
  if (!validGitAuthor(values.gitAuthor)) return false;
  if (Object.hasOwn(values, "language") && values.language !== null && typeof values.language !== "string") return false;
  if (Object.hasOwn(values, "profile") && values.profile !== null && typeof values.profile !== "string") return false;
  return true;
}
function main() {
  const [command, ...args] = process.argv.slice(2); const root = value(args, "--root");
  if (!root || !["inspect", "capture", "discard"].includes(command)) throw new Error("usage: resume-hint.mjs <inspect|capture|discard> --root <project> [--card-file <json>] [--feature-id <id> --plan-sha256 <sha256> --spec-sha256 <sha256>");
  const rootDir = resolve(root); const observedBasis = basis(args);
  if (command === "inspect") {
    const hint = inspectResumeHint({ rootDir, basis: observedBasis });
    // NVA-RESUMEVERBATIM-1 AC-3/AC-4: the ANSWERED onboarding values (commit-author
    // name/email, operator language, PO profile) and the verbatim material-input
    // captured via `capture` below both live in the intake checkpoint, not in
    // project/resume-hint.json -- surfaced here so the ONE existing MUST-DO
    // consumption step (SKILL.md step 6) reads both in the same turn, instead of
    // the runner re-asking a value the checkpoint already answered. Absent
    // checkpoint state is not an error: both read calls return an empty/null
    // shape, safe to call unconditionally, including before any kickoff. A root
    // that is not (yet) git-initialized throws inside the private-state resolver
    // itself (readOnboardingIntakeCheckpoint has no git-free fallback) -- caught
    // here so `inspect` keeps its own existing contract: passive, read-only,
    // never throws.
    let intakeCheckpoint = { status: "unavailable", values: null, materialInput: [] };
    try {
      const checkpoint = readOnboardingIntakeCheckpoint({ rootDir });
      const material = readOnboardingIntakeMaterialInput({ rootDir });
      intakeCheckpoint = {
        status: checkpoint.status,
        values: checkpoint.status === "present" ? checkpoint.value.values : null,
        materialInput: material.chunks,
      };
    } catch {}
    return { ...hint, intakeCheckpoint };
  }
  if (command === "discard") return discardResumeHint({ rootDir });
  const cardFile = value(args, "--card-file");
  if (!cardFile) throw new Error("capture requires --card-file");
  const consumeCard = args.includes("--consume-card");
  try {
    const fullCard = contextCard(cardFile);
    const { materialInput, values, ...distilled } = fullCard;
    if (!validMaterialInput(materialInput)) throw new Error("RH-CARD-SCHEMA: materialInput must be a non-empty ARRAY of strings");
    if (!validValues(values)) throw new Error("RH-CARD-SCHEMA: values must be an object of gitAuthor/language/profile");
    if (materialInput !== undefined) {
      for (const text of materialInput) {
        const rejection = verbatimMaterialRejection(text);
        if (rejection) throw new Error(rejection);
      }
    }
    const captured = captureResumeHint({ rootDir, context: distilled, basis: observedBasis });
    if (materialInput === undefined && values === undefined) return captured;
    // Feed the ALREADY-idempotent base.values.X ?? X merge (applyOnboardingIntakeConsent)
    // rather than adding a second merge path -- a value already answered in an earlier
    // capture is never overwritten by a later one. `granted: true` mirrors this
    // function's own existing unconditional-consent behaviour; nothing here changes it.
    const consent = applyOnboardingIntakeConsent({
      rootDir, granted: true, activate: true,
      gitAuthor: values?.gitAuthor ?? null,
      language: values?.language ?? null,
      profile: values?.profile ?? null,
    });
    const intake = { consent };
    if (materialInput !== undefined) {
      intake.captures = materialInput.map((text) => applyOnboardingIntakeCapture({ rootDir, text, activate: true }));
    }
    return { ...captured, intake };
  } finally {
    if (consumeCard) {
      try { unlinkSync(resolve(cardFile)); }
      catch (error) { if (error?.code !== "ENOENT") throw error; }
    }
  }
}
try { process.stdout.write(`${JSON.stringify(main())}\n`); } catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 2; }
