// SPDX-License-Identifier: SUL-1.0
/**
 * Pin: acceptance criteria are examined as whole user journeys and state transitions, not only as units (C20 finding G20-27, AC-108).
 * Item: sprint-alfred-epic.c20-g2027-acceptance-criteria-are-examined-as-whole-user-journeys-and-state-transitions.
 *
 * Origin: the Codex greenfield report P0 row "Produktfehler und unzureichende Examiner" - green unit tests missed stored-HTML execution,
 * play without a timer, an overwrite after an import with the same revision and the loss of the rescue candidate.
 *
 * Points (each case is written from these, not from the code):
 *  J1 a Spec whose user-facing criterion names no journey is NOT ready: typed code PLR-HANDOFF-NO-JOURNEY at the plan hand-off,
 *     naming every such criterion and one runnable repair; a Spec that names journeys and the asserted effect is ready.
 *  J2 an effect that is only "text changed" does not count as an assertion on the actual effect.
 *  J3 a criterion is not user-facing only by an explicit, reasoned tag; a bare "not user-facing" tag is not an exemption.
 *  J4 the Spec template, the Critic review template and the Goldfish test-authorship briefing (template AND generated text) carry the
 *     duty, root and vendored copy byte-identical; the readiness reviewer asks the question.
 *  J5 the close readback reports journey coverage PER criterion as covered / not covered, never a bare count; unreadable is unknown.
 * Reads the real files; the Spec fixtures are written to a temporary project directory.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const read = (rel) => readFileSync(join(root, rel), "utf8").replace(/\r\n/g, "\n");
const flat = (text) => text.replace(/\s+/g, " ");
const has = (text, pattern, message) => assert.ok(pattern.test(text), message);
const load = async (rel) => {
  const mod = await import(new URL(`../../${rel}`, import.meta.url)).catch(() => null);
  assert.ok(mod, `plugins/pipeline-core/${rel} must exist and load`);
  return mod;
};

const TABLE_HEAD = ["# Spec", "", "## Acceptance criteria", "", "| # | Criterion | Evidence |", "|---|---|---|"];
const spec = (...rows) => [...TABLE_HEAD, ...rows, ""].join("\n");
const RELOAD = "WHEN the user imports a backup, THE SYSTEM SHALL keep the current candidate.";
const JOURNEYS = "Journeys: import from the menu and from the drop zone; reload in the middle of the import; a second import after an error; two imports at once. Asserts: the stored candidate still equals the pre-import candidate byte for byte.";
// The Evidence cell names no test path on purpose: a path would send the hand-off inspection to git, which a temporary directory is not.
const UNJOURNEYED = `| AC-1 | ${RELOAD} | named suite |`;
const JOURNEYED = `| AC-1 | ${RELOAD} ${JOURNEYS} | named suite |`;
const INTERNAL = "| AC-2 | WHEN the parser reads an empty list, THE SYSTEM SHALL return an empty list. | named suite |";

function withProject(specText, run) {
  const dir = mkdtempSync(join(tmpdir(), "g2027-"));
  try {
    mkdirSync(join(dir, "specs", "feat"), { recursive: true });
    writeFileSync(join(dir, "specs", "feat", "spec.md"), specText);
    return run(dir);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}
const handoff = async (specText) => {
  const { inspectPlanDeliveryHandoff } = await load("lib/plan-handoff-readiness.mjs");
  return withProject(specText, (dir) => inspectPlanDeliveryHandoff(
    { rootDir: dir, specPath: "specs/feat/spec.md", expectedSpecSha256: createHash("sha256").update(readFileSync(join(dir, "specs", "feat", "spec.md"))).digest("hex") },
    { observeScope: () => ({ requiresEnforcement: true }) }));
};

test("J1 a governed Spec whose user-facing criterion names no journey is not ready, with a typed code, the criterion and a repair", async () => {
  const { PLAN_HANDOFF_CODES, planHandoffRefusal } = await load("lib/plan-handoff-readiness.mjs");
  assert.ok(PLAN_HANDOFF_CODES.includes("PLR-HANDOFF-NO-JOURNEY"));
  const verdict = await handoff(spec(UNJOURNEYED, INTERNAL));
  assert.equal(verdict.ok, false, JSON.stringify(verdict));
  assert.equal(verdict.code, "PLR-HANDOFF-NO-JOURNEY");
  assert.match(verdict.message, /AC-1/u);
  assert.doesNotMatch(verdict.message, /AC-2/u, "an internal criterion is not accused");
  const text = planHandoffRefusal("submit-plan", verdict);
  assert.match(text, /Repair: .*Journeys:.*Asserts:/u, "the repair names the clause to add");
  assert.match(text, /then run submit-plan again/u);
});

test("J1 the same Spec with the journeys and the asserted effect is ready", async () => {
  const verdict = await handoff(spec(JOURNEYED, INTERNAL));
  assert.equal(verdict.ok, true, JSON.stringify(verdict));
  assert.equal(verdict.code, "PLR-HANDOFF-READY");
});

// C32 (Claude greenfield 2026-11-19): the Spec author read a plugin test file to learn the clause shape, because the reference only named it.
// The example row of the kickoff reference is a worked criterion: with its clauses the hand-off admits it, with the clauses cut it refuses it.
test("J8 the example criterion of the kickoff reference passes the hand-off, and the same row without its clauses does not", async () => {
  const reference = flat(read("plugins/pipeline-core/skills/pipeline-start/references/kickoff-design.md"));
  const example = reference.match(/`(\| AC-3 \|[^`]*?\|)`/u)?.[1];
  assert.ok(example, "the kickoff reference carries a worked criterion row (| AC-3 | ... |)");
  assert.match(example, /Journeys:.*Asserts:/u);
  const ready = await handoff(spec(example));
  assert.equal(ready.ok, true, JSON.stringify(ready));
  const bare = example.replace(/ Journeys:.*?(?= \| named suite \|$)/u, "");
  assert.doesNotMatch(bare, /Journeys:/u);
  const refused = await handoff(spec(bare));
  assert.equal(refused.code, "PLR-HANDOFF-NO-JOURNEY", JSON.stringify(refused));
});

// C29 G6 (Glossover): the hand-off admitted a Spec as soon as one row was locatable, so a row the registration cannot locate passed it,
// submit-plan's registration refused it afterwards, and the journey gaps only surfaced on the attempt after that.
test("J1/G6 a criterion row the registration cannot locate is refused at the hand-off, together with the journey gaps, in one refusal", async () => {
  const { PLAN_HANDOFF_CODES, planHandoffRefusal } = await load("lib/plan-handoff-readiness.mjs");
  assert.ok(PLAN_HANDOFF_CODES.includes("PLR-HANDOFF-CRITERION-UNSUPPORTED"));
  const unlocated = `- **AC-7 (part 1):** ${RELOAD}`;
  const verdict = await handoff(spec(UNJOURNEYED, INTERNAL, "", unlocated));
  assert.equal(verdict.ok, false, JSON.stringify(verdict));
  assert.equal(verdict.code, "PLR-HANDOFF-CRITERION-UNSUPPORTED");
  assert.match(verdict.message, /AC-7/u, "the unlocatable row is named");
  assert.match(verdict.message, /Also: .*AC-1/u, "the journey gap of the same Spec is named in the same refusal");
  const text = planHandoffRefusal("submit-plan", verdict);
  assert.match(text, /Repair: re-render every named criterion row/u);
  assert.match(text, /registration refuses the same rows as CAC-CRITERION-UNSUPPORTED/u, "the registration's own code is named");
  assert.match(text, /re-rendered user-facing row needs its `Journeys:` and `Asserts:`/u, "an unlocatable row's journey gap is not visible yet, so the repair names it");
  assert.match(text, /then run submit-plan again/u);
  const alone = await handoff(spec(JOURNEYED, INTERNAL, "", unlocated));
  assert.equal(alone.code, "PLR-HANDOFF-CRITERION-UNSUPPORTED");
  assert.doesNotMatch(alone.message, /Also:/u, "no journey clause when every user-facing criterion names its journeys");
});

test("J1 the clause works in a bullet criterion with an indented continuation line too", async () => {
  const { inspectSpecJourneys } = await load("lib/spec-journey-coverage.mjs");
  const body = (extra) => ["# Spec", "", "## Acceptance criteria", "", `- **AC-3:** ${RELOAD}`, ...extra, ""].join("\n");
  assert.deepEqual(inspectSpecJourneys(body([])).notCovered, ["AC-3"]);
  assert.deepEqual(inspectSpecJourneys(body([`  ${JOURNEYS}`])).notCovered, []);
});

test("J2 journeys without an effect assertion, or an effect that is only 'text changed', do not count", async () => {
  const { inspectSpecJourneys } = await load("lib/spec-journey-coverage.mjs");
  const only = (clause) => inspectSpecJourneys(spec(`| AC-1 | ${RELOAD} ${clause} | t |`)).criteria[0];
  assert.equal(only("Journeys: menu import; reload mid import.").status, "not-covered");
  assert.deepEqual(only("Journeys: menu import; reload mid import.").missing, ["effect"]);
  assert.equal(only("Journeys: menu import. Asserts: text changed.").status, "not-covered");
  assert.equal(only("Journeys: menu import. Asserts: the label is updated.").status, "not-covered");
  assert.equal(only("Asserts: the stored candidate is unchanged.").status, "not-covered");
  assert.deepEqual(only("Asserts: the stored candidate is unchanged.").missing, ["journeys"]);
  assert.equal(only("Journeys: <list the journeys>. Asserts: <effect>.").status, "not-covered", "a skeleton placeholder is no journey");
  assert.equal(only("Journeys: {{every entry path; reload}}. Asserts: {{the actual effect}}.").status, "not-covered", "the Spec template's own placeholder is no journey");
  assert.equal(only("Journeys: menu import. Asserts: the stored candidate is unchanged after reload.").status, "covered");
});

test("J3 only a reasoned 'not user-facing' tag exempts a criterion; the explicit user-facing tag forces the duty", async () => {
  const { inspectSpecJourneys } = await load("lib/spec-journey-coverage.mjs");
  const one = (text) => inspectSpecJourneys(spec(`| AC-1 | ${text} | t |`)).criteria[0];
  assert.equal(one("WHEN the user opens the page, THE SYSTEM SHALL show it. [not user-facing: logging only]").status, "not-user-facing");
  assert.equal(one("WHEN the user opens the page, THE SYSTEM SHALL show it. [not user-facing]").status, "not-covered", "no reason, no exemption");
  assert.equal(one("WHEN the user opens the page, THE SYSTEM SHALL show it. [not user-facing: {{reason}}]").status, "not-covered", "an unfilled reason exempts nothing");
  assert.equal(one("WHEN the cache expires, THE SYSTEM SHALL refill it. [user-facing]").status, "not-covered");
  assert.equal(one("WHEN the cache expires, THE SYSTEM SHALL refill it.").status, "not-user-facing");
  assert.equal(inspectSpecJourneys(spec()).criteria.length, 0);
});

test("J4 the Spec template, the Critic template and the Goldfish test-authorship briefing carry the journey duty (root = vendored copy)", () => {
  const spec = flat(read("templates/spec.md"));
  for (const needle of ["Journeys:", "Asserts:", "[user-facing]", "reload in the middle of a transition", "concurrent import", "every dynamic text context", "second action after an error"]) {
    assert.ok(spec.includes(needle), `templates/spec.md names "${needle}"`);
  }
  // `has` instead of assert.match: a failing assert.match prints the whole template.
  for (const rel of ["templates/prompts/critic-review.md", "plugins/pipeline-core/templates/prompts/critic-review.md"]) {
    const text = flat(read(rel));
    has(text, /Journey coverage/u, `${rel} names journey coverage`);
    has(text, /a missing journey is a finding/u, `${rel} makes a missing journey a finding`);
  }
  for (const rel of ["templates/prompts/goldfish-task.md", "plugins/pipeline-core/templates/prompts/goldfish-task.md"]) {
    const text = flat(read(rel));
    has(text, /Journey coverage/u, `${rel} names journey coverage`);
    has(text, /actual effect/u, `${rel} demands an assertion on the actual effect`);
    has(text, /not only "text changed"/u, `${rel} rules out "text changed" alone`);
    has(text, /Each finding is an example of its failure class/u, `${rel} makes a correction repair the failure class (PO tile 2026-11-09)`);
  }
  has(flat(read("plugins/pipeline-core/lib/dispatch-briefing-build.mjs")), /Failure classes: when this assignment repairs a review finding or a reported defect/u, "the generated briefing carries the failure-class duty on every runner");
  for (const name of ["critic-review", "goldfish-task"]) {
    assert.equal(read(`templates/prompts/${name}.md`), read(`plugins/pipeline-core/templates/prompts/${name}.md`), `${name}: root and vendored copy are byte-identical`);
  }
});

test("J4 the generated Goldfish briefing and the readiness reviewer carry the duty", () => {
  const build = flat(read("plugins/pipeline-core/lib/dispatch-briefing-build.mjs"));
  has(build, /whole user journeys/u, "the generated test-first block names whole user journeys");
  has(build, /actual effect/u, "the generated test-first block demands the actual effect");
  const reviewer = flat(read("plugins/pipeline-core/agents/readiness-reviewer.md"));
  has(reviewer, /PLR-HANDOFF-NO-JOURNEY/u, "the readiness reviewer names the typed code");
  has(reviewer, /journey/iu, "the readiness reviewer asks about journeys");
});

// Codex greenfield report (candidate 27): a valid but empty import replaced every stored record. A data operation's journeys
// name recoverability and unintended valid input, in the Spec template and in the readiness review (a question, not a block).
test("J6 a data operation's journeys name recoverability and unintended valid input in the Spec template and the readiness review", () => {
  const spec = flat(read("templates/spec.md"));
  has(spec, /deletes, replaces, imports or migrates stored data/u, "templates/spec.md names data operations");
  has(spec, /recoverability/u, "templates/spec.md asks for recoverability");
  has(spec, /unintended valid input/u, "templates/spec.md asks for unintended valid input");
  const reviewer = flat(read("plugins/pipeline-core/agents/readiness-reviewer.md"));
  has(reviewer, /recoverability and unintended valid input/u, "the readiness reviewer asks both questions");
  has(reviewer, /not a block/u, "the question never blocks");
});

// C31-B12 (AC-112, PO decision 2026-11-19): ONE fixed readiness question about an expensive decision no module declares in adrReferences.
test("J7 the readiness reviewer asks one fixed question about an expensive decision with no adrReferences entry, as a question with the create-adr command", () => {
  const reviewer = flat(read("plugins/pipeline-core/agents/readiness-reviewer.md"));
  has(reviewer, /expensive to reverse/u, "the item names the decision that is expensive to reverse");
  for (const kind of ["data shape", "public interface", "security boundary", "cross-module contract", "technology choice"]) {
    assert.ok(reviewer.includes(kind), `the item names "${kind}"`);
  }
  has(reviewer, /no entry in any module's `adrReferences`/u, "the item names adrReferences");
  has(reviewer, /DESIGN-QUESTION[^.]*never a blocking finding|question, never a blocking finding/u, "the answer is a question, never a blocking finding");
  has(reviewer, /create-adr\.mjs --root <root> --slug <slug> --title "<title>"/u, "the item names the create-adr command");
  has(reviewer, /--from-design/u, "the item names the --from-design form");
  has(reviewer, /says explicitly when there is none/u, "the reviewer says when there is none");
});

test("J5 the close readback reports journey coverage per criterion as covered / not covered, never a bare count", async () => {
  const { closeQualityReadback, QUALITY_ROW_IDS } = await load("lib/close-quality-readback.mjs");
  assert.ok(QUALITY_ROW_IDS.includes("journey-coverage"));
  const rowFor = (readers) => closeQualityReadback({ featureId: "feat", readers }).find((row) => row.id === "journey-coverage");
  const bytes = (text) => ({ readBytes: (rel) => { if (rel !== "specs/feat/spec.md") throw new Error("absent"); return Buffer.from(text); } });
  const mixed = rowFor(bytes(spec(JOURNEYED, UNJOURNEYED.replace("AC-1", "AC-4"), INTERNAL)));
  assert.equal(mixed.status, "missing");
  assert.match(mixed.evidence, /AC-1: covered/u);
  assert.match(mixed.evidence, /AC-4: not covered/u);
  assert.doesNotMatch(mixed.evidence, /AC-2/u);
  assert.match(mixed.remedy, /Journeys:/u);
  const covered = rowFor(bytes(spec(JOURNEYED, INTERNAL)));
  assert.equal(covered.status, "present");
  assert.match(covered.evidence, /AC-1: covered/u);
  assert.equal(rowFor(bytes(spec(INTERNAL))).status, "not-applicable");
  assert.equal(rowFor({}).status, "unknown", "no reader, no claim");
  assert.equal(rowFor({ readBytes: () => { throw new Error("x"); } }).status, "unknown");
});
