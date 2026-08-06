// SPDX-License-Identifier: SUL-1.0
/**
 * Is this subagent dispatch built from its template, or freehand?
 *
 * WHY THIS EXISTS. On 2026-08-06 a Critic dispatch was written by hand. It carried a
 * "WHAT THE CHANGE CLAIMS" section listing five claims to verify, an "ADVERSARIAL FOCUS"
 * section listing eight places to look, and a list of test commands to re-run.
 * `templates/prompts/critic-review.md` §2 forbids all of it, and not vaguely — it rules out
 * "even a phrase like 'claims to verify independently'" in those exact words, its
 * EVIDENCE_PATHS field asks for paths rather than commands, and its skip rules already tell
 * the Critic to drop anything CI or verify enforces.
 *
 * So the instruction was not missing. It had no reader at the moment it mattered:
 * `roles/critic.md` is read by the Critic, and the template is read by whoever chooses to
 * open it. Nothing required opening it.
 *
 * What it cost: the hunt list did not add to the Critic's contractual search surface
 * (`roles/critic.md` §103), it replaced it. The report came back organised along the
 * dispatcher's claim list, and its one major finding was one of the dispatcher's own eight
 * bullets verbatim. A review that only looks where it was told to look is not a second pair
 * of eyes, and its silence about everything else carries no information.
 *
 * WHAT THIS CAN AND CANNOT DO, stated up front so nobody reads a structural check as a
 * semantic one. It matches phrases and required fields. It would have refused that briefing,
 * because the contamination was literal — the section was called "WHAT THE CHANGE CLAIMS".
 * A dispatcher who frames the same steer in fresh prose walks straight past it. This raises
 * the cost of the accident, which is the failure mode that actually happened; it does not
 * detect a determined one, and it is not a substitute for reading the template.
 */

const CRITIC_ROLES = /critic|readiness-reviewer|plan-verifier/i;
const GOLDFISH_ROLES = /goldfish/i;

/**
 * Phrases the Critic template names as contamination. Each carries the reason, because a
 * refusal that only says "contaminated" teaches nobody what to write instead.
 */
const CONTAMINATION = Object.freeze([
  Object.freeze({
    id: "CLAIMS-LIST",
    test: /\b(?:what the (?:change|diff|implementation) claims|claims? to verify|verify (?:each|these) claims?)\b/i,
    why: "a claims-to-verify list replaces the Critic's own search surface with yours (critic-review.md §2)",
  }),
  Object.freeze({
    id: "HUNT-LIST",
    test: /\b(?:adversarial focus|focus (?:areas?|on these)|hunt (?:for|list)|pay (?:special )?attention to)\b/i,
    why: "a hunt list steers the review to where you already suspect a problem, and its silence elsewhere then means nothing",
  }),
  Object.freeze({
    id: "EXPECTATION",
    test: /\b(?:none expected|no (?:findings|issues) expected|expected (?:conclusion|outcome|verdict)|judge on the merits|should pass)\b/i,
    why: "an expectation-conclusion tells the reviewer what answer you want (critic-review.md §2)",
  }),
  Object.freeze({
    id: "IMPLEMENTOR-CHARACTERIZATION",
    test: /\b(?:flagged by the implement(?:or|er)|the implement(?:or|er) (?:believes|thinks|notes|disclosed)|already (?:reviewed|checked) by)\b/i,
    why: "an implementor characterization smuggles in a source-credibility frame the Critic did not build itself",
  }),
  Object.freeze({
    id: "RERUN-COMMANDS",
    test: /^\s*(?:EVIDENCE|VERIFY)[^\n]*\(\s*(?:reproduce|re-?run|execute)/im,
    why: "evidence reaches a Critic as artifact PATHS; re-running suites you already ran spends its budget on being a second CI (critic-review.md EVIDENCE_PATHS)",
  }),
]);

/** The six fields a Goldfish briefing is not dispatchable without. */
const GOLDFISH_FIELDS = Object.freeze([
  Object.freeze({ id: "GOAL", test: /^\s*#{0,4}\s*(?:1[.)]\s*)?goal\b/im }),
  Object.freeze({ id: "CONTEXT-FILES", test: /^\s*#{0,4}\s*(?:2[.)]\s*)?context files\b/im }),
  Object.freeze({ id: "DOD-CHECKS", test: /^\s*#{0,4}\s*(?:3[.)]\s*)?dod checks\b/im }),
  Object.freeze({ id: "FORBIDDEN", test: /^\s*#{0,4}\s*(?:4[.)]\s*)?(?:forbidden|prohibitions)\b/im }),
  Object.freeze({ id: "STOP-CONDITIONS", test: /^\s*#{0,4}\s*(?:5[.)]\s*)?stop conditions\b/im }),
  Object.freeze({ id: "DISPATCH-METADATA", test: /^\s*#{0,4}\s*(?:6[.)]\s*)?dispatch[- ]metadat/im }),
]);

/**
 * Every dispatch names its model explicitly; silent inheritance is the MP-05 failure.
 *
 * Keyed on an actual model token rather than on `model:` punctuation. The first version
 * required a colon and would have reported the 2026-08-06 briefing as naming no model,
 * which it did — `DISPATCH METADATA: model claude-opus-5, effort high`. A gate that cries
 * wolf on a compliant field is worse than none: it trains the dispatcher to ignore it.
 */
const NAMES_MODEL = /\bmodel\b\s*[:=]?\s*["']?(?:claude|gpt|o[0-9]|gemini|sonnet|opus|haiku|fable|codex)[-a-z0-9.[\]]*/i;
const NAMES_RULESET = /\bruleset[- ]?sha\s*[:=]\s*\S/i;

/**
 * @param {{subagentType: string, prompt: string}} dispatch
 * @returns {{role: "critic"|"goldfish"|"other", findings: {code: string, why: string}[]}}
 */
export function dispatchFindings({ subagentType, prompt } = {}) {
  const text = typeof prompt === "string" ? prompt : "";
  const type = typeof subagentType === "string" ? subagentType : "";
  const findings = [];

  if (CRITIC_ROLES.test(type)) {
    for (const rule of CONTAMINATION) {
      if (rule.test.test(text)) findings.push({ code: `DISPATCH-CONTAMINATION-${rule.id}`, why: rule.why });
    }
    if (!NAMES_RULESET.test(text)) {
      findings.push({
        code: "DISPATCH-NO-RULESET-SHA",
        why: "the task frame requires a ruleset SHA; without one the Critic cannot state which ruleset it measured against and will emit NOT-PROVIDED-BY-DISPATCH",
      });
    }
    if (!NAMES_MODEL.test(text)) {
      findings.push({ code: "DISPATCH-NO-MODEL", why: "every dispatch names its model explicitly (MP-05); subagents otherwise inherit the session's silently" });
    }
    return { role: "critic", findings };
  }

  if (GOLDFISH_ROLES.test(type)) {
    const missing = GOLDFISH_FIELDS.filter((field) => !field.test.test(text)).map((field) => field.id);
    if (missing.length > 0) {
      findings.push({
        code: "DISPATCH-INCOMPLETE-BRIEFING",
        why: `an incomplete briefing is not dispatchable (goldfish-task.md §1); missing: ${missing.join(", ")}`,
      });
    }
    if (!NAMES_MODEL.test(text)) {
      findings.push({ code: "DISPATCH-NO-MODEL", why: "every dispatch names its model explicitly (MP-05); subagents otherwise inherit the session's silently" });
    }
    return { role: "goldfish", findings };
  }

  // Roles with no template contract carry no requirement. Inventing one here would refuse
  // ordinary work in the name of a rule nobody wrote.
  return { role: "other", findings: [] };
}
