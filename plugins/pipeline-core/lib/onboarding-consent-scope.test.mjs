// SPDX-License-Identifier: SUL-1.0
// C30K-K28 (PO tile 2026-11-18, AC-112): the first-round consent question is shorter and keeps every fact. The single source of its
// wording is lib/onboarding-consent-scope.mjs; these cases pin (1) the closed list of facts the CURRENT text really contains, (2) the
// hard length caps, (3) the unchanged record shape (the ids a yes records). The other consent tests derive their expectations from the
// same data and need no change when the words change.
import test from "node:test";
import assert from "node:assert/strict";

import { ONBOARDING_CONSENT_QUESTION_SCHEMA, onboardingConsentQuestion } from "./onboarding-consent-scope.mjs";

// Facts of the question text as measured BEFORE the shortening (en 1543, de 1740 characters): purpose, the question itself, no re-asking,
// install (seed, runtime initialization, readbacks, Windows rights), hooks (git hooks + the runner's own refresh), the seven tools with their
// Trivy and OpenSSL conditions, the missing-tool route (shown install route to run together, or recorded for later), onboarding commits,
// intake and kickoff, the unsealed draft bind with its two command names, review rounds with receipts, submit (two command names),
// seal (command name), present (command name), the Advisor consent (same runner, scoped material, concrete consultation, part of using the
// Pipeline, not asked separately) and the four exclusions.
const REQUIRED_FACTS = Object.freeze({
  en: [
    "structured, verifiable delivery workflow", "Should this project use", "without asking again",
    "install the Pipeline", "portable authority seed", "runtime initialization", "readbacks", "on Windows the new project folder gets rights for you alone",
    "git hooks", "runner's own refresh step",
    "on this machine", "  - Node.js\n", "  - Git\n", "gitleaks", "osv-scanner", "semgrep", "Trivy", "infrastructure or container files", "OpenSSL where you sign",
    "install route", "run together", "install it later",
    "onboarding commits", "intake and kickoff", "unsealed draft", "bootstrap-bind-plan", "bootstrap-bind-apply",
    "design review, readiness and advisor rounds", "receipts", "set-feature", "submit-plan", "prepare-seal", "present-plan", "your approval",
    "same-runner Advisor", "scoped repository material", "concrete consultation", "part of using the Pipeline", "not asked separately",
    "does not cover", "decisions", "any push", "any release", "any human-guard override",
  ],
  de: [
    "strukturierten, nachprüfbaren Lieferablauf", "Soll dieses Projekt", "ohne erneut zu fragen",
    "die Pipeline installieren (", "Authority-Seed", "Runtime-Initialisierung", "Readbacks", "unter Windows bekommt der neue Projektordner nur für Sie Rechte",
    "Git-Hooks", "Refresh-Schritt",
    "auf diesem Rechner", "  - Node.js\n", "  - Git\n", "gitleaks", "osv-scanner", "semgrep", "Trivy", "Infrastruktur- oder Container-Dateien", "OpenSSL dort, wo Sie signieren",
    "den Installationsweg, den wir gemeinsam gehen", "später installieren",
    "Onboarding-Commits", "Intake- und Kickoff-Artefakte", "unversiegelten Entwurf", "bootstrap-bind-plan", "bootstrap-bind-apply",
    "Design-Review-, Readiness- und Advisor-Runden", "Belege", "set-feature", "submit-plan", "prepare-seal", "present-plan", "Freigabe",
    "Advisor der Pipeline (derselbe Runner)", "Repository-Inhalte", "konkrete Beratung", "Nutzung der Pipeline", "gesondert gefragt",
    "deckt nicht ab", "Entscheidungen", "jeder Push", "jedes Release", "jede menschliche Guard-Freigabe (Override)",
  ],
});

// Measured before the change: en 1543, de 1740. PO tile 2026-11-18: about 85 percent with every fact kept; hard caps below.
const LENGTH_CAPS = Object.freeze({ en: 1300, de: 1500 });

// The record shape is unchanged: the ids a recorded yes carries (scope) and the exclusions (notCovered), byte for byte as before.
const SCOPE_IDS = Object.freeze([
  "install", "advisor-export", "hooks", "toolchain", "onboarding-commits", "intake-kickoff", "bind-draft", "design-review", "submit-plan", "prepare-seal", "present-plan",
]);
const NOT_COVERED_IDS = Object.freeze(["design-approval", "push", "release", "guard-override"]);

test("C30K-K28: the shortened consent question still names every fact of the current text, in English and German", () => {
  for (const language of ["en", "de"]) {
    const { text } = onboardingConsentQuestion({ language });
    for (const fact of REQUIRED_FACTS[language]) assert.ok(text.includes(fact), `${language}: the question keeps the fact "${fact}"`);
    // The four exclusions close the question as bullets, each naming its decision (the design approval is not the present-plan step).
    const closing = text.split("\n").slice(-4);
    const keywords = language === "en" ? [/design.*approval|approval.*design/u, /push/u, /release/u, /override/u] : [/Design.*Freigabe|Freigabe.*Design/u, /Push/u, /Release/u, /Override/u];
    keywords.forEach((pattern, index) => assert.match(closing[index], new RegExp(`^- .*${pattern.source}`, "u"), `${language}: closing bullet ${index + 1}`));
  }
});

test("C30K-K28: the question has the hard length caps (en <= 1300, de <= 1500; before: 1543 and 1740) and stays one question that opens with the decision", () => {
  const byLanguage = onboardingConsentQuestion().textByLanguage;
  for (const language of ["en", "de"]) {
    assert.ok(byLanguage[language].length <= LENGTH_CAPS[language], `${language}: ${byLanguage[language].length} characters (cap ${LENGTH_CAPS[language]})`);
    // One question: exactly one question mark, in the opening, before the first step.
    const text = byLanguage[language];
    assert.equal(text.split("?").length - 1, 1, `${language}: exactly one question`);
    assert.ok(text.indexOf("?") < text.indexOf("\n- "), `${language}: the decision comes before the first step`);
  }
});

test("C30K-K28: the record shape is unchanged: the same scope ids and exclusion ids, in the same order", () => {
  for (const language of ["en", "de", undefined]) {
    const question = onboardingConsentQuestion(language === undefined ? {} : { language });
    assert.equal(question.schema, ONBOARDING_CONSENT_QUESTION_SCHEMA);
    assert.deepEqual(Object.keys(question), ["schema", "language", "text", "textByLanguage", "scope", "notCovered"]);
    assert.deepEqual(question.scope, SCOPE_IDS);
    assert.deepEqual(question.notCovered, NOT_COVERED_IDS);
    assert.deepEqual(Object.keys(question.textByLanguage), ["en", "de"]);
  }
});
