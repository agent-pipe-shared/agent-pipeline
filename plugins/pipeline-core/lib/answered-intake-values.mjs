// SPDX-License-Identifier: SUL-1.0
/**
 * C20 G20-30 (AC-108): the one typed readback of every intake value the PO has already answered, and the typed refusal to ask one
 * of them again. Nothing here stores an answer: each key is read from the place it already lives (the private intake checkpoint,
 * project/pipeline.json), and the readback names that place so a restarted session finds the answer instead of asking.
 *
 * Keys: gitAuthor, language, profile (intake checkpoint `values`), designAnswers (the checkpoint's bundled design-question round,
 * including its explicit no-open-questions disposition), verifyCommand (project/pipeline.json once it is no longer the placeholder).
 * Product questions (designAnswers) and technical settings (the rest) stay separate keys.
 */
import { readOnboardingIntakeCheckpoint } from "./onboarding-continuity.mjs";
import { intakeGitAuthor } from "./project-onboarding-v3-author-identity.mjs";
import { heldIdentityChoice } from "./pipeline-actor-assignment.mjs";
import { checkVerifyContractConfigured } from "../scripts/push-gate-satisfiability.mjs";

export const ANSWERED_VALUES_SCHEMA = "pipeline.answered-intake-values.v1";
export const REASK_REFUSED_CODE = "INTAKE-REASK-REFUSED";
export const ANSWERED_KEYS = Object.freeze(["gitAuthor", "language", "profile", "designAnswers", "verifyCommand"]);

/** The collect-input input names that ask each key (every asking site in lib/project-onboarding-v3.mjs). */
const KEY_OF_INPUT = Object.freeze({
  gitAuthorName: "gitAuthor", gitAuthorEmail: "gitAuthor", language: "language", profile: "profile",
  answersJson: "designAnswers", verifyCommand: "verifyCommand",
});

const unanswered = () => ({ answered: false, source: null });
const answeredAt = (source, value) => ({ answered: true, source, ...(value === undefined ? {} : { value }) });

/** Reads every key; an unreadable store answers nothing (an answer is never guessed), so the question stays askable. */
export function readAnsweredIntakeValues({ rootDir, deps = {} } = {}) {
  const result = Object.fromEntries(ANSWERED_KEYS.map((key) => [key, unanswered()]));
  let checkpoint = null;
  try { checkpoint = (deps.readOnboardingIntakeCheckpoint ?? readOnboardingIntakeCheckpoint)({ rootDir }); } catch { checkpoint = null; }
  if (checkpoint?.status === "present") {
    const values = checkpoint.value?.values ?? {};
    const author = intakeGitAuthor(checkpoint);
    if (author !== null) result.gitAuthor = answeredAt("intake-checkpoint:values.gitAuthor", author);
    for (const key of ["language", "profile"]) {
      if (typeof values[key] === "string" && values[key] !== "") result[key] = answeredAt(`intake-checkpoint:values.${key}`, values[key]);
    }
    if (Array.isArray(checkpoint.value?.designQuestions)) result.designAnswers = answeredAt("intake-checkpoint:designQuestions");
  }
  if (result.gitAuthor.answered !== true) {
    // The author given in the first onboarding answers lives in the root-bound receipt; the checkpoint can stay null (all three greenfields, 2026-11-08).
    try {
      const held = (deps.heldIdentityChoice ?? heldIdentityChoice)(rootDir)?.gitAuthor ?? null;
      if (held !== null) result.gitAuthor = answeredAt("initial-answers-receipt:gitAuthor", held);
    } catch { /* an unreadable receipt answers nothing */ }
  }
  try {
    // `ok` alone is also true for the baseline-only placeholder; only a real configured command is an answer.
    if ((deps.checkVerifyContractConfigured ?? checkVerifyContractConfigured)(rootDir)?.status === "configured") {
      result.verifyCommand = answeredAt("project/pipeline.json:verify");
    }
  } catch { /* an unreadable calibration answers nothing */ }
  return result;
}

/** `{ ok: true }` when the key may be asked; otherwise the typed refusal naming where the answer lives. */
export function refuseReask(answered, key) {
  const entry = answered?.[key];
  if (entry?.answered !== true) return { ok: true };
  return {
    ok: false, code: REASK_REFUSED_CODE, key, answerLives: entry.source,
    repair: `do not ask ${key} again: it is already answered and lives in ${entry.source}; read it from answeredValues.${key} (node <plugin-root>/scripts/resume-hint.mjs inspect --root <this project>) and use it`,
  };
}

/** Every answered key a set of collect-input actions (primary `input`/`inputs`) would ask again, once per key and action. */
export function reaskViolations(actions, answered) {
  const found = [];
  for (const action of actions ?? []) {
    if (action === null || typeof action !== "object") continue;
    const names = [action.input?.name, ...(Array.isArray(action.inputs) ? action.inputs.map((input) => input?.name) : [])];
    const keys = new Set();
    for (const name of names) {
      const key = KEY_OF_INPUT[name];
      if (key === undefined || keys.has(key)) continue;
      keys.add(key);
      const refusal = refuseReask(answered, key);
      if (!refusal.ok) found.push({ ...refusal, input: name });
    }
  }
  return found;
}
