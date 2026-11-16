#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  ONBOARDING_CONSENT_MARK_SCHEMA,
  ONBOARDING_CONSENT_MARK_SCHEMA_V1,
  onboardingConsentMarkerPath,
  recordOnboardingConsent,
} from "./onboarding-consent-mark.mjs";
import {
  ONBOARDING_CONSENT_COVERED_STEPS,
  ONBOARDING_CONSENT_NOT_COVERED,
  advisorExportConsentFromRecord,
  coverOnboardingOutput,
  coveringStepForArgv,
  onboardingConsentQuestion,
  readOnboardingConsentRecord,
} from "../lib/onboarding-consent-scope.mjs";
import { sanctionedOnboardingConsentMarkArgs } from "../lib/guard/sanctioned-args-scripts.mjs";

const MARK_SCRIPT = fileURLToPath(new URL("./onboarding-consent-mark.mjs", import.meta.url));
const STATE_SCRIPT = fileURLToPath(new URL("./pipeline-state.mjs", import.meta.url));
const ONBOARDING_SCRIPT = fileURLToPath(new URL("./project-onboarding-v3.mjs", import.meta.url));
const HOOK_SCRIPT = fileURLToPath(new URL("./clone-hook-readiness.mjs", import.meta.url));
const REFRESH_SCRIPT = fileURLToPath(new URL("./refresh-mandatory-hooks.mjs", import.meta.url));
const SHA = "a".repeat(64);

function withRoot(body) {
  const root = mkdtempSync(join(tmpdir(), "onboarding-consent-mark-"));
  try { return body(root); } finally { rmSync(root, { recursive: true, force: true }); }
}

const action = (script, ...rest) => ({
  kind: "command", executable: "node", argv: [script, ...rest], mutation: true, requiresConfirmation: true,
  expected: { schema: "x", statuses: ["ok"] },
});

test("records a session-scoped yes/no marker atomically", () => {
  withRoot((root) => {
    const result = recordOnboardingConsent(root, "session-1", "no", "2026-08-20T00:00:00.000Z");
    assert.equal(result.markerPath, onboardingConsentMarkerPath(root, "session-1"));
    assert.equal(existsSync(result.markerPath), true);
    // G20-45 (restated in place, QG-04): the record is schema v2 and additionally carries the consent scope and a bounded quote of the
    // answer. A "no" covers nothing, so its scope lists are empty and its quote is absent; sessionId, answer and recordedAt are unchanged.
    assert.deepEqual(JSON.parse(readFileSync(result.markerPath, "utf8")), {
      schema: ONBOARDING_CONSENT_MARK_SCHEMA,
      sessionId: "session-1",
      answer: "no",
      recordedAt: "2026-08-20T00:00:00.000Z",
      scope: [],
      notCovered: [],
      quote: null,
    });
    assert.equal(ONBOARDING_CONSENT_MARK_SCHEMA, "pipeline.onboarding-consent-mark.v2");
  });
});

test("G20-45: a yes record round-trips the scope list and a bounded verbatim quote, and the reader returns them with the repo-relative path", () => {
  withRoot((root) => {
    recordOnboardingConsent(root, "session-1", "yes", "2026-11-08T10:00:00.000Z", "ja bitte installieren");
    const record = readOnboardingConsentRecord(root);
    assert.equal(record.schema, ONBOARDING_CONSENT_MARK_SCHEMA);
    assert.equal(record.answer, "yes");
    assert.equal(record.path, ".claude/.pipeline-install-consent-session-1.json");
    assert.deepEqual(record.scope, ONBOARDING_CONSENT_COVERED_STEPS.map((step) => step.id));
    assert.deepEqual(record.notCovered, ONBOARDING_CONSENT_NOT_COVERED.map((step) => step.id));
    assert.equal(record.quote, "ja bitte installieren");
    // The quote is bounded and single-line: control characters collapse, an over-long answer is cut.
    recordOnboardingConsent(root, "session-2", "yes", "2026-11-08T11:00:00.000Z", `x\ny${"z".repeat(2000)}`);
    const bounded = JSON.parse(readFileSync(onboardingConsentMarkerPath(root, "session-2"), "utf8"));
    assert.ok(bounded.quote.length <= 400 && !/[\u0000-\u001f]/u.test(bounded.quote), bounded.quote.length);
    assert.ok(bounded.quote.startsWith("x y"));
    assert.throws(() => recordOnboardingConsent(root, "session-3", "maybe"), /answer must be yes or no/u);
  });
});

test("G20-45: an old v1 record is still read, but it recorded no scope, so it covers nothing", () => {
  withRoot((root) => {
    const path = onboardingConsentMarkerPath(root, "old");
    mkdirSync(join(root, ".claude"), { recursive: true });
    writeFileSync(path, `${JSON.stringify({ schema: ONBOARDING_CONSENT_MARK_SCHEMA_V1, sessionId: "old", answer: "yes", recordedAt: "2026-08-20T00:00:00.000Z" })}\n`);
    const record = readOnboardingConsentRecord(root);
    assert.equal(record.schema, "pipeline.onboarding-consent-mark.v1");
    assert.equal(record.answer, "yes");
    assert.equal(record.scope, null);
    assert.equal(record.quote, null);
    const output = { nextAction: action(STATE_SCRIPT, "submit-plan", "--by", "x", "--profile", "mini") };
    assert.deepEqual(coverOnboardingOutput(output, { rootDir: root }), output);
    assert.equal(readOnboardingConsentRecord(mkdtempSync(join(root, "empty-"))), null);
  });
});

test("G20-45: the rendered consent question names every covered step and every excluded decision, in English and German", () => {
  assert.ok(ONBOARDING_CONSENT_COVERED_STEPS.length >= 8);
  for (const language of ["en", "de"]) {
    const question = onboardingConsentQuestion({ language });
    assert.equal(question.schema, "pipeline.onboarding-consent-question.v1");
    assert.equal(question.language, language);
    for (const step of ONBOARDING_CONSENT_COVERED_STEPS) {
      const parts = step.bullets?.[language];
      if (parts === undefined) assert.ok(question.text.includes(step[language]), `${language}: ${step.id}`);
      // C30-1: a step shown as a lead line plus sub-bullets names every part, and every item is a literal part of the full step text.
      else for (const part of [parts.lead, parts.tail, ...parts.items]) assert.ok(question.text.includes(part), `${language}: ${step.id}: ${part}`);
      if (parts !== undefined) for (const item of parts.items) assert.ok(step[language].includes(item), `${language}: ${step.id}: ${item} is part of the full step text`);
    }
    for (const step of ONBOARDING_CONSENT_NOT_COVERED) assert.ok(question.text.includes(step[language]), `${language}: ${step.id}`);
    assert.deepEqual(question.scope, ONBOARDING_CONSENT_COVERED_STEPS.map((step) => step.id));
    assert.deepEqual(question.notCovered, ONBOARDING_CONSENT_NOT_COVERED.map((step) => step.id));
  }
  // The required scope: hooks, onboarding commits, intake/kickoff, the unsealed draft bind, the review rounds, submit, seal, present.
  const ids = ONBOARDING_CONSENT_COVERED_STEPS.map((step) => step.id);
  for (const id of ["hooks", "onboarding-commits", "intake-kickoff", "bind-draft", "design-review", "submit-plan", "prepare-seal", "present-plan"]) assert.ok(ids.includes(id), id);
  const excluded = ONBOARDING_CONSENT_NOT_COVERED.map((step) => step.id);
  for (const id of ["design-approval", "push", "release", "guard-override"]) assert.ok(excluded.includes(id), id);
  assert.equal(onboardingConsentQuestion({ language: "fr" }).language, "en");
  assert.equal(onboardingConsentQuestion().textByLanguage.de, onboardingConsentQuestion({ language: "de" }).text);
});

// C30-1 (PO 2026-11-15): the consent question is scannable. A short opening, one dash bullet per covered step (the tool check with
// sub-bullets), the Advisor export as its own paragraph, a closing bullet list of what the yes does not cover, no line wider than
// the start skill relays without wrapping trouble, and plain text only (no table or markup a terminal does not render).
test("C30-1: the consent question is a short opening, bulleted steps, an Advisor paragraph and a closing exclusions list", () => {
  for (const language of ["en", "de"]) {
    const { text } = onboardingConsentQuestion({ language });
    const lines = text.split("\n");
    const covered = ONBOARDING_CONSENT_COVERED_STEPS.filter((step) => step.id !== "advisor-export");
    // One top-level bullet per covered step except the Advisor export (which is a paragraph); sub-bullets are indented.
    assert.equal(lines.filter((line) => /^- /u.test(line)).length, covered.length + ONBOARDING_CONSENT_NOT_COVERED.length, `${language}: top-level bullets`);
    const advisor = ONBOARDING_CONSENT_COVERED_STEPS.find((step) => step.id === "advisor-export")[language];
    assert.ok(lines.some((line) => line.includes(advisor) && !/^\s*-/u.test(line)), `${language}: the Advisor export is its own paragraph, not a bullet`);
    const toolchain = ONBOARDING_CONSENT_COVERED_STEPS.find((step) => step.id === "toolchain");
    assert.equal(lines.filter((line) => /^ {2}- /u.test(line)).length, toolchain.bullets[language].items.length + 1, `${language}: one sub-bullet per tool plus the closing one`);
    const firstBullet = lines.findIndex((line) => /^- /u.test(line));
    const lastExclusion = lines.length - 1;
    assert.ok(firstBullet > 0 && firstBullet <= 4, `${language}: a short opening comes first`);
    for (const step of ONBOARDING_CONSENT_NOT_COVERED) assert.ok(lines.slice(lastExclusion - ONBOARDING_CONSENT_NOT_COVERED.length + 1).includes(`- ${step[language]}`), `${language}: ${step.id} closes the question as a bullet`);
    assert.ok(lines.every((line) => line.length <= 300), `${language}: no line is wider than 300 characters`);
    assert.doesNotMatch(text, /[|#*`>]/u, `${language}: plain text only`);
  }
});

// C28-ONBOARDING-QUESTIONS (AC-108), friction 1 (PO decision 2026-11-10): the Advisor export consent is part of the FIRST consent question. Agreeing
// activates it, so no separate Advisor question follows; a record that does not name it (v1, an older v2, a no) never reads as approved.
test("C28-ONBOARDING-QUESTIONS: the first consent question lists the Advisor export among what agreeing activates, and a yes records it in the same record", () => {
  const ids = ONBOARDING_CONSENT_COVERED_STEPS.map((step) => step.id);
  assert.ok(ids.includes("advisor-export"), "the Advisor export is a covered item of the one consent");
  assert.equal(coveringStepForArgv([STATE_SCRIPT, "submit-plan"])?.id, "submit-plan");
  for (const route of ONBOARDING_CONSENT_COVERED_STEPS.find((step) => step.id === "advisor-export").routes) assert.fail(`the Advisor export names no action route: ${JSON.stringify(route)}`);
  for (const language of ["en", "de"]) {
    const question = onboardingConsentQuestion({ language });
    assert.match(question.text, /Advisor/u, language);
    assert.ok(question.scope.includes("advisor-export"), language);
    assert.ok(question.text.length <= 2600, `${language}: the relayed question stays one short message (${question.text.length})`);
  }
  assert.match(onboardingConsentQuestion({ language: "en" }).text, /mandatory|part of using|agreeing/iu);
  withRoot((root) => {
    recordOnboardingConsent(root, "onboarding", "yes", "2026-11-11T10:00:00.000Z", "yes");
    assert.ok(readOnboardingConsentRecord(root).scope.includes("advisor-export"), "the same record carries the Advisor export");
    assert.equal(advisorExportConsentFromRecord(root), "approved");
  });
});

test("C28-ONBOARDING-QUESTIONS: only a recorded yes that names the Advisor export reads as approved; every other record or none reads as not given", () => {
  withRoot((root) => {
    assert.equal(advisorExportConsentFromRecord(root), null, "no record");
    assert.equal(advisorExportConsentFromRecord(""), null);
    assert.equal(advisorExportConsentFromRecord(undefined), null);
    mkdirSync(join(root, ".claude"), { recursive: true });
    const put = (name, body) => writeFileSync(onboardingConsentMarkerPath(root, name), `${JSON.stringify(body)}\n`);
    put("v1", { schema: ONBOARDING_CONSENT_MARK_SCHEMA_V1, sessionId: "v1", answer: "yes", recordedAt: "2026-08-20T00:00:00.000Z" });
    assert.equal(advisorExportConsentFromRecord(root), null, "v1 yes recorded no scope");
    put("v1", { schema: ONBOARDING_CONSENT_MARK_SCHEMA, sessionId: "v1", answer: "yes", recordedAt: "2026-10-01T00:00:00.000Z", scope: ["install", "hooks"], notCovered: ["push"], quote: null });
    assert.equal(advisorExportConsentFromRecord(root), null, "an older v2 yes did not name the Advisor export (existing records stay valid, nothing is inferred)");
    put("no", { schema: ONBOARDING_CONSENT_MARK_SCHEMA, sessionId: "no", answer: "no", recordedAt: "2026-11-11T02:00:00.000Z", scope: [], notCovered: [], quote: null });
    assert.equal(advisorExportConsentFromRecord(root), null, "a no never approves");
    put("new", { schema: ONBOARDING_CONSENT_MARK_SCHEMA, sessionId: "new", answer: "yes", recordedAt: "2026-11-11T01:00:00.000Z", scope: ["install", "advisor-export"], notCovered: ["push"], quote: "ok" });
    assert.equal(advisorExportConsentFromRecord(root), null, "the newest record is the later no");
    put("no", { schema: ONBOARDING_CONSENT_MARK_SCHEMA, sessionId: "no", answer: "no", recordedAt: "2026-11-10T00:00:00.000Z", scope: [], notCovered: [], quote: null });
    assert.equal(advisorExportConsentFromRecord(root), "approved", "the newest record is the yes that names it");
  });
});

test("G20-45: with a recorded yes, every consent-covered action prints requiresConfirmation false, coveredBy with the record path and a verbatim escalation line", () => {
  withRoot((root) => {
    recordOnboardingConsent(root, "session-1", "yes", "2026-11-08T10:00:00.000Z", "ich folge deinen empfehlungen");
    const output = {
      schema: "x",
      nextAction: action(ONBOARDING_SCRIPT, "bootstrap-bind-apply", "--root", root, "--runner", "codex", "--plan-sha256", SHA, "--activate"),
      applyAction: action(STATE_SCRIPT, "submit-plan", "--by", "Jordan", "--profile", "mini"),
      nested: { items: [action(STATE_SCRIPT, "present-plan", "--by", "Jordan"), action(HOOK_SCRIPT, "--root", root, "--apply")] },
      sealing: action(STATE_SCRIPT, "prepare-seal", "--review-receipt", "scratch/r.json"),
      refresh: action(REFRESH_SCRIPT, "--root", root),
    };
    const covered = coverOnboardingOutput(output, { rootDir: root });
    const all = [covered.nextAction, covered.applyAction, ...covered.nested.items, covered.sealing, covered.refresh];
    const stepIds = ["bind-draft", "submit-plan", "present-plan", "hooks", "prepare-seal", "hooks"];
    all.forEach((entry, index) => {
      assert.equal(entry.requiresConfirmation, false, entry.argv.join(" "));
      assert.equal(entry.mutation, true);
      assert.equal(entry.coveredBy.consent, "onboarding-consent");
      assert.equal(entry.coveredBy.record, ".claude/.pipeline-install-consent-session-1.json");
      assert.equal(entry.coveredBy.step, [stepIds[0], stepIds[1], stepIds[2], stepIds[3], stepIds[4], stepIds[5]][index]);
      const step = ONBOARDING_CONSENT_COVERED_STEPS.find((candidate) => candidate.id === entry.coveredBy.step);
      assert.equal(entry.escalationJustification,
        `covered by the user's recorded onboarding consent (.claude/.pipeline-install-consent-session-1.json): ${step.en}; no further approval before the design approval`);
    });
    // Pure: the input was not mutated, and no further field leaks into the action.
    assert.equal(output.nextAction.requiresConfirmation, true);
    assert.equal(output.nextAction.coveredBy, undefined);
    assert.deepEqual(Object.keys(covered.nextAction).sort(), [...Object.keys(output.nextAction), "coveredBy", "escalationJustification"].sort());
  });
});

test("G20-45: the review-receipt stop that names prepare-seal and present-plan carries their escalation lines, and only with a recorded yes", () => {
  withRoot((root) => {
    const stop = { kind: "collect-input", mutation: false, requiresConfirmation: false, code: "DAB-REVIEW-RECEIPT-REQUIRED", guidance: "Run present-plan --review-receipt" };
    assert.deepEqual(coverOnboardingOutput({ nextAction: stop }, { rootDir: root }), { nextAction: stop });
    recordOnboardingConsent(root, "session-1", "yes", "2026-11-08T10:00:00.000Z");
    const covered = coverOnboardingOutput({ nextAction: stop }, { rootDir: root }).nextAction;
    assert.deepEqual(covered.coveredBy.steps, ["prepare-seal", "present-plan"]);
    assert.match(covered.escalationJustifications["prepare-seal"], /^covered by the user's recorded onboarding consent \(\.claude\/\.pipeline-install-consent-session-1\.json\): prepare the seal plan \(prepare-seal\); no further approval before the design approval$/u);
    assert.match(covered.escalationJustifications["present-plan"], /present the design to you for approval \(present-plan\); no further approval/u);
    const other = { kind: "collect-input", code: "SOMETHING-ELSE" };
    assert.deepEqual(coverOnboardingOutput({ nextAction: other }, { rootDir: root }), { nextAction: other });
  });
});

test("G20-45: the design approval, push, release and a human-guard override keep their gate unchanged even with a recorded yes", () => {
  withRoot((root) => {
    recordOnboardingConsent(root, "session-1", "yes", "2026-11-08T10:00:00.000Z");
    const gated = [
      action(STATE_SCRIPT, "approve-plan", "--by", "po", "--design-approval-request", "scratch/request.json"),
      action(STATE_SCRIPT, "seal-plan-approval"),
      action(STATE_SCRIPT, "set-phase", "--phase", "implementation"),
      action(STATE_SCRIPT, "approve-push"),
      action(ONBOARDING_SCRIPT, "bootstrap-acknowledge-chat-apply", "--root", root, "--plan-sha256", SHA, "--activate"),
      action(ONBOARDING_SCRIPT, "bootstrap-acknowledge-apply", "--root", root, "--plan-sha256", SHA, "--proof", "p", "--activate"),
      action(fileURLToPath(new URL("./po-human-approval.mjs", import.meta.url)), "sign-intent", "--repo-root", root),
      action(fileURLToPath(new URL("./guard-human-override.mjs", import.meta.url)), "authorize-by-signature"),
      action(fileURLToPath(new URL("./push-init.mjs", import.meta.url)), "--root", root),
      action(fileURLToPath(new URL("./publication-executor.mjs", import.meta.url)), "release"),
    ];
    for (const entry of gated) {
      assert.equal(coveringStepForArgv(entry.argv), null, entry.argv.join(" "));
      assert.deepEqual(coverOnboardingOutput({ nextAction: entry }, { rootDir: root }).nextAction, entry, entry.argv.join(" "));
    }
    // An action that never named a covered route is left alone even when it nests a covered one as data.
    const wrapper = { kind: "collect-input", requiresConfirmation: false, applyAction: gated[0] };
    assert.deepEqual(coverOnboardingOutput(wrapper, { rootDir: root }), wrapper);
  });
});

test("G20-45: no recorded yes means nothing is claimed as covered (absent record, a recorded no, an unreadable record)", () => {
  withRoot((root) => {
    const output = { nextAction: action(STATE_SCRIPT, "submit-plan", "--by", "x", "--profile", "mini") };
    assert.deepEqual(coverOnboardingOutput(output, { rootDir: root }), output);
    recordOnboardingConsent(root, "session-no", "no", "2026-11-08T10:00:00.000Z");
    assert.deepEqual(coverOnboardingOutput(output, { rootDir: root }), output);
    writeFileSync(onboardingConsentMarkerPath(root, "session-bad"), "{not json");
    assert.deepEqual(coverOnboardingOutput(output, { rootDir: root }), output);
    assert.deepEqual(coverOnboardingOutput(output, { rootDir: root, readRecord: () => ({ answer: "yes", scope: ["submit-plan"], path: ".claude/r.json" }) }).nextAction.coveredBy.step, "submit-plan");
  });
});

test("G20-45: the record command accepts an optional --quote on the command line and prints the stored record", () => {
  withRoot((root) => {
    const run = spawnSync(process.execPath, [MARK_SCRIPT, "record", "--root", root, "--session-id", "s1", "--answer", "yes", "--quote", "ja bitte installieren"], { encoding: "utf8" });
    assert.equal(run.status, 0, run.stderr);
    const printed = JSON.parse(run.stdout);
    assert.equal(printed.schema, ONBOARDING_CONSENT_MARK_SCHEMA);
    assert.equal(printed.quote, "ja bitte installieren");
    assert.deepEqual(printed.scope, ONBOARDING_CONSENT_COVERED_STEPS.map((step) => step.id));
    const legacy = spawnSync(process.execPath, [MARK_SCRIPT, "record", "--root", root, "--session-id", "s2", "--answer", "no"], { encoding: "utf8" });
    assert.equal(legacy.status, 0, legacy.stderr);
    assert.equal(JSON.parse(legacy.stdout).quote, null);
  });
});

test("G20-45: the guard admits the record command with an optional bounded single-line --quote and nothing else", () => {
  const root = tmpdir();
  const base = ["record", "--root", root, "--session-id", "s1", "--answer", "yes"];
  assert.equal(sanctionedOnboardingConsentMarkArgs(base, root), true);
  assert.equal(sanctionedOnboardingConsentMarkArgs([...base, "--quote", "ja bitte installieren"], root), true);
  assert.equal(sanctionedOnboardingConsentMarkArgs([...base, "--quote", ""], root), false);
  assert.equal(sanctionedOnboardingConsentMarkArgs([...base, "--quote", "x".repeat(401)], root), false);
  assert.equal(sanctionedOnboardingConsentMarkArgs([...base, "--quote", "a\nb"], root), false);
  assert.equal(sanctionedOnboardingConsentMarkArgs([...base, "--quote"], root), false);
  assert.equal(sanctionedOnboardingConsentMarkArgs([...base, "--note", "x"], root), false);
  assert.equal(sanctionedOnboardingConsentMarkArgs([...base, "--quote", "x", "--extra", "y"], root), false);
});

test("G20-45: the onboarding CLI output passes through the coverage edge (recorded yes: covered; no record: untouched)", async () => {
  const { main } = await import("./project-onboarding-v3.mjs");
  withRoot((root) => {
    const run = (deps) => {
      let out = "";
      main(["inspect", "--root", root, "--runner", "claude"], { write: (text) => { out += text; }, writeError: (text) => { out += text; }, deps });
      return JSON.parse(out);
    };
    const plain = run(undefined);
    assert.equal(plain.nextAction.argv[1], "plan");
    assert.equal(plain.nextAction.coveredBy, undefined);
    const covered = run({ readOnboardingConsentRecord: () => ({ answer: "yes", scope: ONBOARDING_CONSENT_COVERED_STEPS.map((step) => step.id), path: ".claude/.pipeline-install-consent-s1.json" }) });
    assert.equal(covered.nextAction.coveredBy.step, "install");
    assert.equal(covered.nextAction.requiresConfirmation, false);
    assert.match(covered.nextAction.escalationJustification, /^covered by the user's recorded onboarding consent \(\.claude\/\.pipeline-install-consent-s1\.json\): .+; no further approval before the design approval$/u);
  });
});

test("G20-45: the start skill and its happy-path reference tell the agent to relay the question verbatim and to use the escalation line", () => {
  const skills = fileURLToPath(new URL("../skills/pipeline-start/", import.meta.url));
  const skill = readFileSync(join(skills, "SKILL.md"), "utf8");
  assert.match(skill, /relaying `consentQuestion\.text` verbatim/u);
  assert.match(skill, /never paraphrased/u);
  assert.match(skill, /`consentRecordAction`/u);
  assert.match(skill, /`escalationJustification` line verbatim/u);
  assert.match(skill, /design approval, push, release and any human-guard override are never covered/u);
  const happy = readFileSync(join(skills, "references", "happy-path.md"), "utf8");
  assert.match(happy, /`escalationJustification`: when a runner's escalation review asks for a reason/u);
  assert.match(happy, /give that line verbatim/u);
  const recovery = readFileSync(join(skills, "references", "onboarding-recovery.md"), "utf8");
  assert.match(recovery, /lib\/onboarding-consent-scope\.mjs/u);
});

test("G20-45: the covering step is decided by the script and verb, not by a loose substring", () => {
  assert.equal(coveringStepForArgv([STATE_SCRIPT, "submit-plan", "--by", "x"]).id, "submit-plan");
  assert.equal(coveringStepForArgv([STATE_SCRIPT, "prepare-seal"]).id, "prepare-seal");
  assert.equal(coveringStepForArgv([STATE_SCRIPT, "present-plan", "--by", "x"]).id, "present-plan");
  assert.equal(coveringStepForArgv([ONBOARDING_SCRIPT, "bootstrap-bind-plan", "--root", "r"]).id, "bind-draft");
  assert.equal(coveringStepForArgv([ONBOARDING_SCRIPT, "intake-generate-apply", "--root", "r"]).id, "intake-kickoff");
  assert.equal(coveringStepForArgv([join(tmpdir(), "other.mjs"), "submit-plan"]), null);
  assert.equal(coveringStepForArgv([STATE_SCRIPT, "--note", "submit-plan"]), null);
  assert.equal(coveringStepForArgv([]), null);
  assert.equal(coveringStepForArgv(null), null);
});
