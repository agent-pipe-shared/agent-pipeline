#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { measureBootstrapBytes } from "../../lib/bootstrap-payload-budget.mjs";
import { DEFAULT_ENVELOPE } from "../../scripts/bootstrap-payload-measure.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const core = readFileSync(join(here, "SKILL.md"), "utf8");
const closeBlock = readFileSync(join(here, "..", "close-block", "SKILL.md"), "utf8");
// BOOTMOD-1 moved the kickoff-intake block out of the core verbatim, because the
// core is read at the start of every session and pays for every byte, including in
// the sessions that never reach a kickoff. Every phrase this suite pinned against
// the core for that block is pinned below against this file instead -- the same
// patterns, including the ones that span a line break, because the move preserved
// the wrapping. Retargeted, never dropped.
const kickoffDesign = readFileSync(join(here, "references", "kickoff-design.md"), "utf8");
const refs = ["onboarding-recovery.md", "private-overlay.md", "roles.md", "freshness.md", "failure-cases.md", "continuation.md", "push-approval.md", "kickoff-design.md"]
  .map((name) => readFileSync(join(here, "references", name), "utf8")).join("\n");
// Every reference the core's lazy-loading list names must exist and be readable.
// SETUP-3 shipped a bullet for a file SETUP-4 had not written yet; the dangling
// pointer survived a green suite because nothing checked the two agree. It does
// now, and the check is the cheap kind: read the core, extract the names, open
// each one.
const namedReferences = [...readFileSync(join(here, "SKILL.md"), "utf8").matchAll(/`references\/([a-z0-9-]+\.md)`/gu)].map((match) => match[1]);
assert.ok(namedReferences.length > 0, "the core must name at least one reference file");
for (const name of new Set(namedReferences)) {
  assert.ok(readFileSync(join(here, "references", name), "utf8").length > 0, `SKILL.md names references/${name}, which is missing or empty`);
}
const all = `${core}\n${refs}`;
// The budget is the emitted bootstrap payload, not the file alone: it is
// BOOTSTRAP_PAYLOAD_MAX_BYTES over the SUMMED segments (core skill + machine-
// readback envelope; lib/bootstrap-payload-budget.mjs, scripts/bootstrap-
// payload-measure.mjs). Asserting on `core` alone granted an author bytes that
// do not exist -- it stayed green at 14992 B while the payload measurement was
// already red. Measured against the production DEFAULT_ENVELOPE, so passing
// here implies passing bootstrap-payload-measure.test.mjs, never the reverse.
// (Supersedes an earlier core-alone byte check that lived here: raised
// 15,000 -> 18,000 on 2026-08-08, GF-057, PO-authorized; the number itself now
// lives in exactly one place, lib/bootstrap-payload-budget.mjs's
// BOOTSTRAP_PAYLOAD_MAX_BYTES, which this combined measurement also uses.)
const coreBudget = measureBootstrapBytes(
  Buffer.byteLength(core, "utf8") + Buffer.byteLength(JSON.stringify(DEFAULT_ENVELOPE), "utf8"),
  { mode: "normal" },
);
assert.ok(
  coreBudget.withinBudget,
  `core+envelope ${coreBudget.upperBoundUnits} B exceeds ${coreBudget.maxUpperBoundUnits} B`,
);
assert.match(core, /full Elephant bootstrap is session-bound/u);
assert.match(core, /never for an ordinary task, message, tool result, commit, test,/u);
assert.match(core, /does not trigger a second full Elephant bootstrap unless a real SessionStart or\n+typed recovery follows/u);
assert.match(core, /No happy-path reference is mandatory/u);
assert.match(core, /project-onboarding-v3\.mjs inspect --root "\$PWD" --intent bootstrap/u);
assert.match(core, /Agent Pipeline start: version/u);
assert.match(all, /codex-project-runtime-readback-host\.mjs/u);
assert.match(all, /pipeline\.codex-project-runtime-readback-status\.v1/u);
assert.match(all, /project-onboarding-v3\.mjs kickoff plan/u);
assert.match(all, /codex-host-repository-init\.mjs plan/u);
assert.match(all, /session-cleanup\.mjs plan-privatization/u);
assert.match(all, /pipeline\.session-cleanup-privatization-plan\.v1/u);
assert.match(all, /Agent Pipeline source: local-development/u);
assert.match(all, /pipeline\.start-preflight\.v1/u);
assert.match(all, /CR?PCR?-BLOCKED|PCR-DECISION-PENDING/u);
assert.match(all, /four|three|Verify|handover/u);
assert.match(core, /Operating Model, compiled runtime manifest and recorded active\nplan are the only gate authority/u);
assert.match(core, /scoped edits, focused tests, state\nreadback, one-line commits, Verify, Critic preparation/u);
assert.match(core, /A guard\ndenial alone is not a human gate/u);
assert.match(core, /\*\*and\n   before proposing, displaying, or performing any restart, session cut or\n   Compact after kickoff\*\*/u);
assert.match(core, /input received\n   after a short kickoff goal has already initialized the project/u);
assert.match(core, /do not;? ?\n?\s*reduce it to a new short kickoff goal or merely promise to remember it/u);
assert.match(core, /Read back `resume-hint\.mjs inspect` after a\n   successful capture/u);

assert.match(core, /checkpoint-origin material chunks are the original\n   product-material record/u);
assert.match(core, /retain their bytes and capture order, do not\n   recapture an existing chunk merely to satisfy a tool ritual/u);
assert.match(core, /answered onboarding values separate from product requirements/u);
assert.match(core, /label it as a recovered\n   summary with its available source pointer; never manufacture a verbatim\n   `materialInput` chunk from that summary/u);
assert.match(core, /collect the specific missing confirmation together rather than\n   silently substituting settings as requirements/u);
assert.match(core, /Follow the current returned\n   `nextAction` from onboarding inspection/u);
assert.match(core, /do not add `pipeline-state inspect`\n   or an Operating Model hash as an unavailable pre-binding prerequisite/u);
assert.match(core, /State\/authority orientation follows ready binding/u);

// RHSHAPE-1. The skill's description of the card must be a shape the validator
// actually accepts. It was not: it called all four keys "a short distilled
// statement", a reader built four strings, and `buildResumeHint` rejected it with
// the four bare characters `RH-SCHEMA` -- so on 2026-08-09 the one carrier of
// material input across a session boundary was never written in either greenfield
// run. Asserting the prose is not enough on its own; the card built to match the
// prose is driven through the real validator below, which is the assertion that
// would have failed before the fix.
assert.match(core, /`intent` is one string; the other three are \*\*arrays\*\* of\n   short strings, at most 4, 4 and 3 entries/u);

// RHRESTART-1. The capture command the skill prints for the pre-restart state must
// be one the lifecycle guard admits THERE. Measured on 2026-08-09: a greenfield
// Codex run reached `restart-required`, was given material design input in the same
// breath, ran `resume-hint.mjs --help` to learn the card shape, and was refused with
// GUARD-LIFECYCLE-NOT-READY. It issued no further command; the input was lost at the
// restart. The guard admits exactly one argv shape there, with the card at a fixed
// path that appeared in no artifact any agent reads -- so the §6 duty was
// unsatisfiable in precisely the state that imposes it.
{
  const guard = await import("../../hooks/guard-lifecycle-ready.mjs");
  const pluginRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
  const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
  const printed = /`(node <plugin-root>\/scripts\/resume-hint\.mjs capture [^`]+)`/u.exec(core);
  assert.ok(printed, "§6 must print the exact pre-restart capture command");
  const resolved = printed[1]
    .replace("<plugin-root>", pluginRoot)
    .replaceAll("<root>", projectRoot);
  assert.equal(
    guard.isRestartResumeHintCapture(resolved, projectRoot), true,
    `the guard refuses the pre-restart capture the skill prints: ${resolved}`,
  );
  // The shape the run actually tried, and a freely chosen card path, both stay
  // refused -- which is why naming the exact one is the whole fix.
  assert.equal(guard.isRestartResumeHintCapture(`node ${pluginRoot}/scripts/resume-hint.mjs --help`, projectRoot), false);
  assert.equal(
    guard.isRestartResumeHintCapture(`node ${pluginRoot}/scripts/resume-hint.mjs capture --root ${projectRoot} --card-file ${projectRoot}/scratch/card.json --consume-card`, projectRoot),
    false,
    "a freely chosen card path is refused before a restart",
  );
}
{
  const { buildResumeHint, validateResumeHint } = await import("../../lib/resume-hint.mjs");
  const documented = {
    intent: "Deliver the described project.",
    scope: ["One distilled scope statement.", "A second one."],
    constraints: ["One distilled constraint."],
    questions: ["One open question?"],
  };
  assert.equal(validateResumeHint(buildResumeHint({ context: documented })).ok, true,
    "the card shape this skill describes must be one the validator accepts");
  assert.throws(() => buildResumeHint({ context: { ...documented, scope: "a single string" } }),
    /RH-SCHEMA: scope must be an ARRAY/u,
    "and the shape it no longer describes must be refused with a message naming the field");
}
assert.match(kickoffDesign, /obtain both a single-line project goal and an\nexplicit PO profile: `epic`, `feature`, or `mini`/u);
assert.match(kickoffDesign, /Never infer, silently select, or retrospectively claim a profile/u);
assert.match(kickoffDesign, /`specs\/kickoff-\*` files are provisional bootstrap\nanchors, not the standard long-term design location/u);
assert.match(kickoffDesign, /`specs\/YYYY-MM-DD_short-topic\/`/u);
assert.match(kickoffDesign, /`prd_short-topic\.md`, `spec\.md`, and `design-input\.md`/u);
assert.match(kickoffDesign, /The PRD and Spec both\nlink to it and carry a compact traceability table/u);
assert.match(kickoffDesign, /include a valid Mermaid flow\/sequence\/state diagram wherever it materially\nclarifies that flow/u);
assert.match(kickoffDesign, /Treat that named package as a pre-authority staging set/u);
assert.match(kickoffDesign, /only its digest-bound `kickoff promote apply` to bind the PRD\/Spec in State\nand the source-evidence path\/hash in the same immutable continuity transaction\./u);
assert.match(kickoffDesign, /Do not invoke a repair, generic continuity CAS, manifest\nrepair, or hash-rebinding cascade solely because a new design package was\ncreated/u);
assert.match(kickoffDesign, /The source-evidence file is immutable after its PRD\/Spec reference is bound/u);
assert.match(core, /Normal restart is handover-only/u);
assert.match(core, /Never invoke `close-block`, `close-feature`, or the close\n   coordinator merely to start a new chat/u);
assert.match(closeBlock, /Hard entry gate — never close a normal restart/u);
assert.match(closeBlock, /CLOSE-INTENT-REQUIRED/u);
assert.match(closeBlock, /`durable-stop` or `runtime-transfer`/u);
assert.match(closeBlock, /Do \*\*not\*\* invoke `close-block`, `close-feature`, `close-coordinator`, Verify/u);
// SETUP-3: bootstrap questions (language, profile) come before any artifact
// is written, and are shaped problem/options/cost/recommendation -- never a
// bare setting name. BOOTMOD-1 moved their full wording into the reference; the
// claims are unchanged and are pinned there now.
assert.match(kickoffDesign, /Bootstrap questions are answered before any artifact is written/u);
assert.match(kickoffDesign, /never\ninferred from the greeting, the repository's contents, or the runner's\nlocale/u);
assert.match(kickoffDesign, /problem, options, cost, recommendation — never a bare setting name/u);
assert.match(kickoffDesign, /Recommendation: match the language you would already write the PRD/u);
assert.match(kickoffDesign, /Bind the answer into `<!-- po-language: \(de\|en\) -->` before drafting/u);
assert.match(kickoffDesign, /Recommendation: `feature` unless the work is visibly cross-package or\ntrivially small\./u);
assert.ok(!core.includes("Set gates.push_approval?"), "a question must not be posed as a bare setting name");
assert.ok(!kickoffDesign.includes("Set gates.push_approval?"), "a question must not be posed as a bare setting name");
// SETUP-4: the push-approval reference. These pin the claims an operator acts
// on, not the prose around them -- each one is either a fact about the gate or a
// warning derived from the live 2026-08-08 ceremony that took three attempts.
// Matched against a whitespace-flattened copy on purpose. Pinning a phrase that
// happens to span a line break makes the test fail on a reflow that changed no
// meaning -- which cost this file two fix-and-rerun cycles today. The claim is
// what is pinned, not the wrapping.
const pushApproval = readFileSync(join(here, "references", "push-approval.md"), "utf8").replace(/\s+/gu, " ");
// Both supported values named, and the default stated as the fail-closed one.
assert.match(pushApproval, /`signature`/u);
assert.match(pushApproval, /`chat`/u);
assert.match(pushApproval, /unreadable or unrecognised value resolves to/u);
// The signature route's defining property: the proof IS the authorization.
assert.match(pushApproval, /there is no in-session step that activates it afterwards/u);
// chat is bounded, and explicitly not a workaround. The negative pin matters
// more than the positive one: it is what stops a session offering a gate
// downgrade as the fix for a confusing refusal.
assert.match(pushApproval, /attribution record, not a proof/u);
assert.match(pushApproval, /posture choice, not an escape hatch/u);
assert.match(pushApproval, /Do not: propose a mode change to get past a refusal/u);
// The absolute prohibitions gain nothing from either value.
assert.match(pushApproval, /no force-push, no history rewrite/u);
// Liftability is delegated at runtime, never restated.
assert.match(pushApproval, /repair-map\.mjs/u);
assert.doesNotMatch(pushApproval, /\bHGO-[A-Z-]+\b/u, "the reference must not restate the repair map's codes");
// The three live-ceremony warnings, each pinned by its operative instruction.
assert.match(pushApproval, /stop committing between preparing an approval and installing it/u);
assert.match(pushApproval, /older than the field/u);
assert.match(pushApproval, /writes a proof file and does not name it/u);
// The two argument traps, both met live.
assert.match(pushApproval, /`--repo-root` must be an absolute path/u);
assert.match(pushApproval, /machine-scoped configuration plane/u);
// A shipped file must not pin a subcommand list that has changed before (it
// used to point agents at `--help` instead of a hardcoded list; ADR-0061
// replaced that with naming the current canonical command directly, the same
// strategy the actively-maintained docs/push-release-flow.md already uses —
// pinned by requiring the same cross-reference here, not a `--help` deferral).
assert.match(pushApproval, /authorize-critical/u);
assert.match(pushApproval, /docs\/push-release-flow\.md/u);

// BOOTMOD-1: the failure class modularization creates, pinned.
//
// Moving content out of the core is only safe while the core keeps the CONDITION
// that says the content is needed. Move the condition out with it and nothing goes
// red: a session in that state never learns it must load the file, skips the step,
// and reports success. An oversized core is visible in a byte count; a silently
// skipped step is visible nowhere.
//
// This is deliberately NOT "the core still names the file" -- the existence check
// at the top of this file already does that, and it is exactly the check that
// stays green through this failure. What is pinned here is that the directive
// naming the reference also names the states that send a reader to it, in the same
// paragraph, so a session cannot meet the pointer without meeting its trigger.
const KICKOFF_REFERENCE = "`references/kickoff-design.md`";
const kickoffTriggerStates = [
  { state: "a pristine project", pattern: /pristine/u },
  { state: "a first `kickoff plan`", pattern: /first `kickoff plan`/u },
  { state: "material design input has arrived", pattern: /material design input/u },
  { state: "a design package is being created or promoted", pattern: /promot/u },
];
const kickoffDirectives = (text) => text.split(/\n{2,}/u).filter((paragraph) => paragraph.includes(KICKOFF_REFERENCE));
function assertKickoffPointerCarriesItsTrigger(text) {
  const directives = kickoffDirectives(text);
  assert.ok(directives.length > 0, `the core must name ${KICKOFF_REFERENCE}`);
  const missingPerDirective = directives.map((paragraph) =>
    kickoffTriggerStates.filter(({ pattern }) => !pattern.test(paragraph)).map(({ state }) => state));
  const missing = missingPerDirective.reduce((best, current) => (current.length < best.length ? current : best));
  assert.equal(missing.length, 0,
    `the core names ${KICKOFF_REFERENCE}, but no single directive names the states that need it: ${missing.join("; ")}. A session in that state cannot know it has to load the file, and skipping it fails silently.`);
}
assertKickoffPointerCarriesItsTrigger(core);
// Proof that the pin above is about the trigger and not about the file name,
// carried in the suite rather than asserted in a report: a core that names the
// reference with no condition attached must fail it.
assert.throws(
  () => assertKickoffPointerCarriesItsTrigger(core.replace(kickoffDirectives(core)[0], () => `Load ${KICKOFF_REFERENCE}.`)),
  /no single directive names the states that need it/u,
  "the trigger pin must go red on a core that names the reference without its condition",
);
// The three rules the move deliberately left in the core, because a session that
// never loads the reference is still bound by them. These are decisions (whether
// something applies), not elaboration, and moving them would be the failure above.
assert.match(core, /No artifact of a pristine project is written before\nits bootstrap questions are answered/u);
assert.match(core, /never inferred, defaulted, or claimed after the fact/u);
assert.match(core, /`specs\/kickoff-\*` files a bootstrap transaction creates are provisional anchors\nonly/u);

// PHX-SKILL — obligations of harness/session-bootstrap.md that the skill must
// carry. Steps 1d and 6 are pinned against `core`: the spec requires them
// embedded, without a runtime file read. Steps 3, 4 and 5b are pinned against
// `all`, because lazy relocation into a typed reference is legitimate there.
assert.match(core, /Bootstrap check passed: ruleset \{\{VERSION_OR_SHA\}\} loaded/u);
assert.match(core, /Never print it without Steps 1–5/u);
assert.match(core, /Role prohibitions loaded: EL-01\/EL-02\/EL-03\/EL-04\/EL-16\/EL-18\/EL-19/u);
assert.match(core, /read no file for this/u);
for (const el of ["EL-01", "EL-02", "EL-03", "EL-04", "EL-16", "EL-18", "EL-19"]) {
  assert.ok(core.includes(el), `${el} must stay embedded in SKILL.md`);
}
assert.match(all, /`project\/pipeline\.json`, else the legacy/u);
assert.match(all, /denies do not live in that file/u);
assert.match(all, /sole authoritative state source/u);
assert.match(all, /\$driftThreshold/u);
assert.match(all, /briefing replaces the handover/u);
assert.match(all, /`\/reload-plugins`/u);
assert.match(all, /Staleness unchecked \(offline, cache state\)/u);
assert.match(all, /MISSING \(F4\)/u);
assert.match(all, /State briefing \{\{TASK_ID_OR_DATE\}\}/u);
assert.match(all, /State n\/a \(Critic sees no history\)/u);
process.stdout.write("pipeline-start V3: core budget and lazy-reference checks passed\n");
