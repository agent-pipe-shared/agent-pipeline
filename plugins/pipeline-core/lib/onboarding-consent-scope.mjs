// SPDX-License-Identifier: SUL-1.0

/**
 * G20-45: ONE shared list of the agent steps the onboarding consent covers, and what it does not.
 *
 * Measured in a live Codex run: after the user said yes to installing the Pipeline, the runner's own escalation reviewer
 * rejected `bootstrap-bind-apply`, `submit-plan` and `prepare-seal` because "the user's approval covered local binding, not
 * this distinct submission". The operating model is that once the installation is approved, the next human approval is the
 * design approval. This module is the single place that states that scope, so the question the user is asked, the record
 * of the answer and the actions the Pipeline hands over all say the same thing.
 *
 *  - ONBOARDING_CONSENT_COVERED_STEPS / ONBOARDING_CONSENT_NOT_COVERED: the scope, in English and German (the operator
 *    language), each covered step with the script routes (script file + first argument) it is recognised by.
 *  - onboardingConsentQuestion(): the question text the agent relays verbatim (preflight result, start skill).
 *  - readOnboardingConsentRecord(): reads the session record scripts/onboarding-consent-mark.mjs wrote (v2, and a v1 record
 *    without a scope, which stays readable but covers nothing).
 *  - coverOnboardingOutput(): at an output edge, a consent-covered action prints `requiresConfirmation: false` with
 *    `coveredBy` (the consent, its record path and the step) and a one-line `escalationJustification` usable verbatim. An
 *    action is marked only when a recorded yes names its step: the design approval, push, release and any human-guard
 *    override are never in the list, so they keep their gate. No record, no claim.
 *
 * Imports node builtins only (it sits on the path of guard-adjacent scripts).
 */
import { lstatSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const ONBOARDING_CONSENT_MARK_SCHEMA_V1 = "pipeline.onboarding-consent-mark.v1";
export const ONBOARDING_CONSENT_MARK_SCHEMA_V2 = "pipeline.onboarding-consent-mark.v2";
export const ONBOARDING_CONSENT_QUESTION_SCHEMA = "pipeline.onboarding-consent-question.v1";
export const ONBOARDING_CONSENT_ID = "onboarding-consent";
export const ADVISOR_EXPORT_STEP_ID = "advisor-export";
export const ONBOARDING_CONSENT_QUOTE_MAX = 400;

const ONBOARDING = "project-onboarding-v3.mjs";
const STATE = "pipeline-state.mjs";

export const ONBOARDING_CONSENT_COVERED_STEPS = Object.freeze([
  Object.freeze({
    id: "install",
    en: "install the Pipeline (portable authority seed, runtime initialization, readbacks; on Windows the new project folder gets rights for you alone)",
    de: "die Pipeline installieren (portable Authority-Seed, Runtime-Initialisierung, Readbacks; unter Windows bekommt der neue Projektordner nur für Sie Rechte)",
    routes: Object.freeze([
      { script: ONBOARDING, verbs: ["plan", "apply-portable-seed", "initialize-runtime", "apply-readback"] },
      { script: "onboarding-init.mjs", verbs: null },
    ]),
  }),
  // C28-ONBOARDING-QUESTIONS (PO decision 2026-11-10): the Advisor export consent is part of THIS question, mandatory for the Pipeline, so it is never asked
  // as a question of its own later. It names no action route: it is a consent the first answer records (`advisorExportConsentFromRecord`).
  Object.freeze({
    id: ADVISOR_EXPORT_STEP_ID,
    en: "the same-runner Advisor read scoped repository material for a concrete consultation (part of using the Pipeline, not asked separately)",
    de: "dem Advisor der Pipeline (derselbe Runner) für eine konkrete Beratung ausgewählte Repository-Inhalte einzusehen (gehört zur Nutzung der Pipeline, nicht gesondert gefragt)",
    routes: Object.freeze([]),
  }),
  Object.freeze({
    id: "hooks",
    en: "activate and refresh git hooks and the runner's own refresh step",
    de: "Git-Hooks aktivieren und aktualisieren, dazu den Refresh-Schritt des Runners",
    routes: Object.freeze([
      { script: "clone-hook-readiness.mjs", verbs: null },
      { script: "refresh-mandatory-hooks.mjs", verbs: null },
    ]),
  }),
  // C28e (PO tiles 2026-11-12): the required tools are part of the first install. The agent checks them and shows the route; the person installs
  // in their own terminal or defers, and only the deferral record is a covered action (an old record without this id simply does not cover it).
  Object.freeze({
    id: "toolchain",
    en: "check the tools needed on this machine (Node.js, Git, gitleaks, osv-scanner, semgrep; Trivy where the project has infrastructure or container files; OpenSSL where you sign) and, for a missing one, show you its install route to run together or record you install it later",
    de: "die auf diesem Rechner benötigten Werkzeuge prüfen (Node.js, Git, gitleaks, osv-scanner, semgrep; Trivy, wo das Projekt Infrastruktur- oder Container-Dateien hat; OpenSSL dort, wo Sie signieren), und Ihnen für ein fehlendes den Installationsweg zeigen, den wir gemeinsam gehen, oder festhalten, dass Sie es später installieren",
    routes: Object.freeze([{ script: "toolchain-defer.mjs", verbs: null }]),
    // C30-1: the question shows this step as a lead line with one bullet per tool and a closing bullet; every item is a literal
    // substring of `en`/`de`, so the two renderings cannot drift on the tool list (pinned in onboarding-consent-mark.test.mjs).
    bullets: Object.freeze({
      en: Object.freeze({
        lead: "check the tools needed on this machine:",
        items: Object.freeze(["Node.js", "Git", "gitleaks", "osv-scanner", "semgrep", "Trivy where the project has infrastructure or container files", "OpenSSL where you sign"]),
        tail: "for a missing one, I show its install route to run together or record you install it later",
      }),
      de: Object.freeze({
        lead: "die auf diesem Rechner benötigten Werkzeuge prüfen:",
        items: Object.freeze(["Node.js", "Git", "gitleaks", "osv-scanner", "semgrep", "Trivy, wo das Projekt Infrastruktur- oder Container-Dateien hat", "OpenSSL dort, wo Sie signieren"]),
        tail: "bei einem fehlenden zeige ich den Installationsweg, den wir gemeinsam gehen, oder halte fest, dass Sie es später installieren",
      }),
    }),
  }),
  Object.freeze({
    id: "onboarding-commits",
    en: "make onboarding commits",
    de: "Onboarding-Commits anlegen",
    routes: Object.freeze([]),
  }),
  Object.freeze({
    id: "intake-kickoff",
    en: "write intake and kickoff artifacts",
    de: "Intake- und Kickoff-Artefakte schreiben",
    routes: Object.freeze([
      {
        script: ONBOARDING,
        verbs: [
          "kickoff", "intake-consent-apply", "intake-capture-apply", "intake-design-questions-apply", "intake-design-questions-replace",
          "intake-generate-plan", "intake-generate-apply", "intake-spec-marker-plan", "intake-spec-marker-apply",
        ],
      },
    ]),
  }),
  Object.freeze({
    id: "bind-draft",
    en: "bind PRD and Spec as an unsealed draft (bootstrap-bind-plan, bootstrap-bind-apply)",
    de: "PRD und Spec als unversiegelten Entwurf binden (bootstrap-bind-plan, bootstrap-bind-apply)",
    routes: Object.freeze([
      { script: ONBOARDING, verbs: ["bootstrap-bind-plan", "bootstrap-bind-apply", "kickoff-promote-plan", "kickoff-promote-apply"] },
    ]),
  }),
  Object.freeze({
    id: "design-review",
    en: "run design review, readiness and advisor rounds, recording receipts",
    de: "die Design-Review-, Readiness- und Advisor-Runden durchführen und Belege festhalten",
    routes: Object.freeze([
      { script: "design-review-receipt.mjs", verbs: null },
      { script: "design-course-session.mjs", verbs: null },
    ]),
  }),
  Object.freeze({
    id: "submit-plan",
    en: "register the feature, submit the plan (set-feature, submit-plan)",
    de: "Feature registrieren, Plan einreichen (set-feature, submit-plan)",
    routes: Object.freeze([{ script: STATE, verbs: ["set-feature", "submit-plan"] }]),
  }),
  Object.freeze({
    id: "prepare-seal",
    en: "prepare the seal plan (prepare-seal)",
    de: "Siegelplan vorbereiten (prepare-seal)",
    routes: Object.freeze([{ script: STATE, verbs: ["prepare-seal"] }]),
  }),
  Object.freeze({
    id: "present-plan",
    en: "present the design for your approval (present-plan)",
    de: "das Design zu Ihrer Freigabe vorlegen (present-plan)",
    routes: Object.freeze([{ script: STATE, verbs: ["present-plan"] }]),
  }),
]);

export const ONBOARDING_CONSENT_NOT_COVERED = Object.freeze([
  Object.freeze({ id: "design-approval", en: "your design approval", de: "Ihre Design-Freigabe" }),
  Object.freeze({ id: "push", en: "any push", de: "jeder Push" }),
  Object.freeze({ id: "release", en: "any release", de: "jedes Release" }),
  Object.freeze({ id: "guard-override", en: "any human-guard override", de: "jede menschliche Guard-Freigabe (Override)" }),
]);

// C30-1: the question is relayed as plain text (dash bullets and blank lines only, no tables or markup a terminal does not
// render): a short opening, the covered steps as bullets (the tool check with one sub-bullet per tool), the Advisor export as
// its own paragraph, and the exclusions as a closing bullet list. The scope itself is unchanged (ADR-0092, ADR-0103).
const bulletList = (entries) => entries.map((entry) => `- ${entry}`).join("\n");
const QUESTION_FRAME = Object.freeze({
  en: (covered, advisor, excluded) => `Should this project use Agent Pipeline, a structured, verifiable delivery workflow?\n\nIf you say yes, I do these steps without asking again:\n${covered}\n\nYour yes also lets ${advisor}.\n\nYour yes does not cover (your decisions):\n${excluded}`,
  de: (covered, advisor, excluded) => `Soll dieses Projekt Agent Pipeline nutzen, einen strukturierten, nachprüfbaren Lieferablauf?\n\nWenn Sie ja sagen, führe ich diese Schritte aus, ohne erneut zu fragen:\n${covered}\n\nIhr Ja erlaubt außerdem ${advisor}.\n\nIhr Ja deckt nicht ab (Ihre Entscheidungen):\n${excluded}`,
});

/** One covered step as a bullet; a step with `bullets` gets a lead line, one sub-bullet per item and a closing sub-bullet. */
function stepBullet(step, lang) {
  const parts = step.bullets?.[lang];
  if (parts === undefined) return `- ${step[lang]}`;
  return [`- ${parts.lead}`, ...parts.items.map((item) => `  - ${item}`), `  - ${parts.tail}`].join("\n");
}

/**
 * The consent question, in the operator language (`en`/`de`; anything else is English). `text` is relayed verbatim by the
 * agent, never paraphrased; `scope`/`notCovered` are the step ids the record of a yes will carry.
 */
export function onboardingConsentQuestion({ language = "en" } = {}) {
  const textFor = (lang) => QUESTION_FRAME[lang](
    ONBOARDING_CONSENT_COVERED_STEPS.filter((step) => step.id !== ADVISOR_EXPORT_STEP_ID).map((step) => stepBullet(step, lang)).join("\n"),
    ONBOARDING_CONSENT_COVERED_STEPS.find((step) => step.id === ADVISOR_EXPORT_STEP_ID)[lang],
    bulletList(ONBOARDING_CONSENT_NOT_COVERED.map((step) => step[lang])),
  );
  const chosen = language === "de" ? "de" : "en";
  return {
    schema: ONBOARDING_CONSENT_QUESTION_SCHEMA,
    language: chosen,
    text: textFor(chosen),
    textByLanguage: { en: textFor("en"), de: textFor("de") },
    scope: ONBOARDING_CONSENT_COVERED_STEPS.map((step) => step.id),
    notCovered: ONBOARDING_CONSENT_NOT_COVERED.map((step) => step.id),
  };
}

function scriptBase(path) {
  return String(path).split(/[\\/]/u).pop();
}

/** The covered step an action argv belongs to (`[script, verb, ...]`), or null. The design approval, push and release are never covered. */
export function coveringStepForArgv(argv) {
  if (!Array.isArray(argv) || argv.length === 0 || !argv.every((entry) => typeof entry === "string")) return null;
  const base = scriptBase(argv[0]);
  const verb = argv[1];
  for (const step of ONBOARDING_CONSENT_COVERED_STEPS) {
    for (const route of step.routes) {
      if (route.script !== base) continue;
      if (route.verbs === null || (typeof verb === "string" && route.verbs.includes(verb))) return step;
    }
  }
  return null;
}

const RECORD_FILE = /^\.pipeline-install-consent-(.+)\.json$/u;

function normalizeRecord(raw, path) {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return null;
  if (raw.schema !== ONBOARDING_CONSENT_MARK_SCHEMA_V1 && raw.schema !== ONBOARDING_CONSENT_MARK_SCHEMA_V2) return null;
  if (raw.answer !== "yes" && raw.answer !== "no") return null;
  if (typeof raw.recordedAt !== "string" || !Number.isFinite(Date.parse(raw.recordedAt))) return null;
  const strings = (value) => (Array.isArray(value) && value.every((entry) => typeof entry === "string") ? value : null);
  return {
    path,
    schema: raw.schema,
    sessionId: typeof raw.sessionId === "string" ? raw.sessionId : null,
    answer: raw.answer,
    recordedAt: raw.recordedAt,
    scope: raw.schema === ONBOARDING_CONSENT_MARK_SCHEMA_V2 ? strings(raw.scope) : null,
    notCovered: raw.schema === ONBOARDING_CONSENT_MARK_SCHEMA_V2 ? strings(raw.notCovered) : null,
    quote: raw.schema === ONBOARDING_CONSENT_MARK_SCHEMA_V2 && typeof raw.quote === "string" ? raw.quote : null,
  };
}

/** The newest readable onboarding-consent record of the project (any session), or null. Never throws. */
export function readOnboardingConsentRecord(rootDir) {
  if (typeof rootDir !== "string" || rootDir === "") return null;
  let names;
  try { names = readdirSync(join(rootDir, ".claude")); } catch { return null; }
  let newest = null;
  for (const name of names) {
    if (!RECORD_FILE.test(name)) continue;
    const full = join(rootDir, ".claude", name);
    try {
      const info = lstatSync(full);
      if (!info.isFile() || info.size > 16_384) continue;
      const record = normalizeRecord(JSON.parse(readFileSync(full, "utf8")), `.claude/${name}`);
      if (record !== null && (newest === null || Date.parse(record.recordedAt) >= Date.parse(newest.recordedAt))) newest = record;
    } catch { /* an unreadable record claims nothing */ }
  }
  return newest;
}

/**
 * C28-ONBOARDING-QUESTIONS: "approved" exactly when the newest readable consent record is a yes whose scope names the Advisor export, otherwise null.
 * A v1 record (no scope), an older v2 record that did not name it, a no or no record at all gives nothing: such a project keeps asking the Advisor
 * question as before and nothing is ever inferred as approved. Never throws. `readRecord` is a test seam.
 */
export function advisorExportConsentFromRecord(rootDir, { readRecord = readOnboardingConsentRecord } = {}) {
  let record = null;
  try { record = readRecord(rootDir); } catch { return null; }
  return record?.answer === "yes" && Array.isArray(record.scope) && record.scope.includes(ADVISOR_EXPORT_STEP_ID) ? "approved" : null;
}

export function onboardingConsentEscalationJustification(recordPath, step) {
  return `covered by the user's recorded onboarding consent (${recordPath}): ${step.en}; no further approval before the design approval`;
}

const COLLECT_INPUT_NAMED_VERBS = Object.freeze({ "DAB-REVIEW-RECEIPT-REQUIRED": Object.freeze(["prepare-seal", "present-plan"]) });

function isPlain(value) {
  if (value === null || typeof value !== "object") return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function cover(value, record, depth) {
  if (depth > 10) return value;
  if (Array.isArray(value)) return value.map((entry) => cover(entry, record, depth + 1));
  if (!isPlain(value)) return value;
  const copy = {};
  for (const [key, entry] of Object.entries(value)) copy[key] = cover(entry, record, depth + 1);
  // The review-receipt stop names prepare-seal / present-plan in its guidance text only; it carries their lines by verb.
  const named = value.kind === "collect-input" ? COLLECT_INPUT_NAMED_VERBS[value.code] : undefined;
  if (named !== undefined) {
    const steps = named.map((verb) => [verb, coveringStepForArgv([STATE, verb])]).filter(([, step]) => step !== null && record.scope.includes(step.id));
    if (steps.length > 0) {
      copy.coveredBy = { consent: ONBOARDING_CONSENT_ID, record: record.path, steps: steps.map(([, step]) => step.id), noFurtherApprovalBefore: "design-approval" };
      copy.escalationJustifications = Object.fromEntries(steps.map(([verb, step]) => [verb, onboardingConsentEscalationJustification(record.path, step)]));
    }
  }
  if (value.kind === "command" && value.invocation !== "user-copy-only") {
    const step = coveringStepForArgv(value.argv);
    if (step !== null && record.scope.includes(step.id)) {
      copy.requiresConfirmation = false;
      copy.coveredBy = { consent: ONBOARDING_CONSENT_ID, record: record.path, step: step.id, noFurtherApprovalBefore: "design-approval" };
      copy.escalationJustification = onboardingConsentEscalationJustification(record.path, step);
    }
  }
  return copy;
}

/**
 * Mark every consent-covered action inside `output` (any depth) as covered by the recorded yes. Pure: returns a copy.
 * With no record, a recorded no, a v1 record (no scope) or an unreadable one the output is returned unchanged.
 * `readRecord` is a test seam.
 */
export function coverOnboardingOutput(output, { rootDir, readRecord = readOnboardingConsentRecord } = {}) {
  let record = null;
  try { record = readRecord(rootDir); } catch { record = null; }
  if (record === null || record === undefined || record.answer !== "yes" || !Array.isArray(record.scope) || typeof record.path !== "string") return output;
  return cover(output, record, 0);
}
