// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { registerTestCaseCompletion } from "./test-case-completion.mjs";
const cases = [];
function test(name, run) { cases.push({ id: `PHD${String(cases.length + 1).padStart(3, "0")}`, name, run }); }
import { inspectPublicHandoverDuty, nextActionSection, updatePublicHandoverDuty } from "./onboarding-continuity.mjs";
import { run, statePath } from "../scripts/pipeline-state.mjs";

const repo = fileURLToPath(new URL("../../..", import.meta.url));
const scratch = join(repo, "scratch");
const state = { schema: "pipeline.state.v0", activeFeature: { id: "demo", planPath: "specs/demo/plan.md", phase: "design" }, planApproved: false };
function fixture(run) {
  mkdirSync(scratch, { recursive: true });
  const root = mkdtempSync(join(scratch, "public-handover-duty-"));
  mkdirSync(join(root, "docs"));
  try { run(root, join(root, "docs/state.md")); }
  finally { rmSync(root, { recursive: true, force: true }); }
}

test("missing structured public state is unavailable with an explicit agent update action", () => fixture((root, path) => {
  writeFileSync(path, "# State\n\n## Goal\n\nHuman notes.\n", "utf8");
  const before = readFileSync(path, "utf8");
  const duty = inspectPublicHandoverDuty(root, state);
  assert.equal(duty.status, "unavailable");
  assert.equal(duty.nextAction.kind, "agent-public-handover-update");
  assert.equal(readFileSync(path, "utf8"), before);
  assert.equal(updatePublicHandoverDuty(root, state).status, "unavailable");
  assert.equal(readFileSync(path, "utf8"), before);
}));

test("an explicit update follows feature and phase while preserving other handover prose", () => fixture((root, path) => {
  const prose = "## Goal\n\nHuman notes stay byte for byte.\n\n";
  writeFileSync(path, `# State\n\n${prose}## Next action\n\nOld lifecycle text.\n\n## Decisions\n\nKeep this.\n`, "utf8");
  assert.equal(inspectPublicHandoverDuty(root, state).status, "stale");
  assert.equal(updatePublicHandoverDuty(root, state).status, "current");
  const first = readFileSync(path, "utf8");
  assert.ok(first.includes(prose));
  assert.ok(first.includes("## Decisions\n\nKeep this.\n"));
  assert.ok(first.includes("**Lifecycle phase:** feature `demo` · phase `design`"));
  assert.ok(first.includes("## Next action\n\n**Lifecycle phase:**"));
  // D160 (PF-59): the update owns only the marked generated block; project text in the section is kept below it.
  assert.ok(first.includes("Old lifecycle text."));
  assert.ok(first.indexOf("<!-- pipeline:next-action:end -->") < first.indexOf("Old lifecycle text."));
  assert.equal(updatePublicHandoverDuty(root, state).status, "current");
  assert.equal(readFileSync(path, "utf8"), first);
  const implementing = { ...state, activeFeature: { ...state.activeFeature, phase: "implementation" } };
  assert.equal(inspectPublicHandoverDuty(root, implementing).status, "stale");
  assert.equal(updatePublicHandoverDuty(root, implementing).status, "current");
  const second = readFileSync(path, "utf8");
  assert.ok(second.includes("phase `implementation`"));
  assert.ok(!second.includes("phase `design`"));
  assert.ok(second.includes(prose));
}));

test("marker-like prose outside Next action remains byte-for-byte intact", () => fixture((root, path) => {
  const before = "# State\n\n## Notes\n\n**Lifecycle phase:** feature `historic` · phase `design`\n\nKeep the following blank line.\n\n";
  const after = "## Decisions\n\n**Lifecycle phase:** no active feature\n\nHuman decision remains.\n";
  writeFileSync(path, `${before}## Next action\n\nOld lifecycle text.\n\n${after}`, "utf8");
  assert.equal(inspectPublicHandoverDuty(root, state).status, "stale");
  assert.equal(updatePublicHandoverDuty(root, state).status, "current");
  const first = readFileSync(path, "utf8");
  assert.ok(first.startsWith(before));
  assert.ok(first.endsWith(after));
  assert.ok(first.includes("**Lifecycle phase:** feature `demo` · phase `design`"));
  assert.equal(updatePublicHandoverDuty(root, state).status, "current");
  assert.equal(readFileSync(path, "utf8"), first);
}));

test("a matching marker in Notes cannot make an unmarked Next action current", () => fixture((root, path) => {
  const notes = "## Notes\n\n**Lifecycle phase:** feature `demo` · phase `design`\n\n";
  writeFileSync(path, `# State\n\n${notes}${nextActionSection(state)}## Decisions\n\nKeep.\n`, "utf8");
  assert.equal(inspectPublicHandoverDuty(root, state).status, "stale");
  assert.equal(updatePublicHandoverDuty(root, state).status, "current");
  const updated = readFileSync(path, "utf8");
  assert.ok(updated.includes(notes));
  assert.equal(updated.split("**Lifecycle phase:**").length - 1, 2);
}));

test("State inspection offers the explicit public update and the consumer preserves State", () => fixture((root, path) => {
  mkdirSync(join(root, "project"));
  writeFileSync(join(root, "project/pipeline-state.json"), JSON.stringify(state));
  writeFileSync(path, "# State\n\n## Notes\n\nKeep.\n\n## Next action\n\nStale.\n");
  const before = readFileSync(statePath(root), "utf8");
  const original = console.log;
  let payload;
  try {
    console.log = text => { payload = JSON.parse(text); };
    assert.equal(run(["inspect"], { dir: root }), 0);
    assert.equal(payload.publicHandoverDuty.status, "stale");
    assert.equal(payload.publicHandoverDuty.nextAction.argv.at(-1), "update-public-handover");
    assert.ok(readFileSync(path, "utf8").includes("Stale."));
    assert.equal(run(["update-public-handover"], { dir: root }), 0);
    assert.equal(payload.status, "current");
    assert.equal(run(["update-public-handover", "--publish-private"], { dir: root }), 2);
    assert.equal(readFileSync(statePath(root), "utf8"), before);
    assert.ok(readFileSync(path, "utf8").includes("## Notes\n\nKeep.\n\n"));
  } finally { console.log = original; }
}));

test("an explicit public update refuses physical aliases without changing their target", () => fixture((root, path) => {
  const target = join(root, "private-fixture.md");
  const bytes = "# Private fixture\n\n## Next action\n\nMust remain unchanged.\n";
  writeFileSync(target, bytes);
  symlinkSync(target, path);
  assert.equal(inspectPublicHandoverDuty(root, state).status, "unavailable");
  assert.equal(updatePublicHandoverDuty(root, state).status, "unavailable");
  assert.equal(readFileSync(target, "utf8"), bytes);
}));

const PF59_BEGIN = "<!-- pipeline:next-action:begin -->";
const PF59_END = "<!-- pipeline:next-action:end -->";
const pf59Body = s => nextActionSection(s).replace(/^## Next action\n\n/, "").trimEnd();
const pf59Marker = "**Lifecycle phase:** feature `demo` · phase `design`";

test("PF-59 (D160): project prose and a push checklist inside Next action stay byte for byte below the generated block", () => fixture((root, path) => {
  const prose = "Our own plan text.\n\n### Push checklist\n\n- [ ] run verify\n- [ ] tag the release\n\n";
  writeFileSync(path, `# State\n\n## Goal\n\nG.\n\n## Next action\n\n${prose}## Decisions\n\nKeep this.\n`, "utf8");
  assert.equal(inspectPublicHandoverDuty(root, state).status, "stale");
  assert.equal(updatePublicHandoverDuty(root, state).status, "current");
  const first = readFileSync(path, "utf8");
  const expected = `# State\n\n## Goal\n\nG.\n\n## Next action\n\n${pf59Marker}\n\n${PF59_BEGIN}\n${pf59Body(state)}\n${PF59_END}\n\n${prose}## Decisions\n\nKeep this.\n`;
  assert.equal(first, expected);
  assert.equal(updatePublicHandoverDuty(root, state).status, "current");
  assert.equal(readFileSync(path, "utf8"), first);
}));

test("PF-59 (D160): a phase change rewrites only the marked block and the marker line, the prose stays", () => fixture((root, path) => {
  const prose = "Project text that must survive.\n\n- [ ] push checklist item\n\n";
  writeFileSync(path, `# State\n\n## Next action\n\n${prose}## Decisions\n\nKeep.\n`, "utf8");
  assert.equal(updatePublicHandoverDuty(root, state).status, "current");
  const implementing = { ...state, activeFeature: { ...state.activeFeature, phase: "implementation" } };
  assert.equal(inspectPublicHandoverDuty(root, implementing).status, "stale");
  assert.equal(updatePublicHandoverDuty(root, implementing).status, "current");
  const after = readFileSync(path, "utf8");
  assert.equal(after, `# State\n\n## Next action\n\n**Lifecycle phase:** feature \`demo\` · phase \`implementation\`\n\n${PF59_BEGIN}\n${pf59Body(implementing)}\n${PF59_END}\n\n${prose}## Decisions\n\nKeep.\n`);
  assert.notEqual(pf59Body(implementing), pf59Body(state));
  // A State whose generated body differs rewrites the block content too, and nothing else.
  const inactive = { schema: "pipeline.state.v0", activeFeature: null, planApproved: false };
  assert.notEqual(pf59Body(inactive), pf59Body(state));
  assert.equal(updatePublicHandoverDuty(root, inactive).status, "current");
  const idle = readFileSync(path, "utf8");
  assert.ok(idle.includes(`${PF59_BEGIN}\n${pf59Body(inactive)}\n${PF59_END}\n\n${prose}## Decisions`));
  assert.ok(idle.includes("**Lifecycle phase:** no active feature"));
  assert.ok(!idle.includes(pf59Body(implementing)));
}));

test("PF-59 (D160): an unmarked section that is exactly a legacy generated rendering is replaced wholly without duplicate text", () => fixture((root, path) => {
  const draftBody = pf59Body(state);
  const renderings = [
    `**Lifecycle phase:** feature \`demo\` · phase \`old\`\n\n${draftBody}\n\n`,
    `${draftBody}\n\n`,
    "No feature is currently active. Start the next one with\n`pipeline-state set-feature --id <id> --plan-path <path>`, or review closed\nfeature history in `project/pipeline-state.json` (`closedFeatures`).\n\n",
    "The plan is approved. Switch the feature to implementation with\n`pipeline-state set-phase --phase implementation`, then proceed with the\napproved implementation packages.\n\n",
    "Review the goal and establish the initial PRD and technical specification.\n\nThis tracked handover is a design snapshot. Run `pipeline-state inspect`\nfor the current typed next action; canonical pipeline state owns lifecycle\nauthority. Git-backed runtime transitions publish an advisory private\nhandover projection without rewriting this tracked file.\n\n",
  ];
  for (const legacy of renderings) {
    writeFileSync(path, `# State\n\n## Next action\n\n${legacy}## Decisions\n\nKeep.\n`, "utf8");
    assert.equal(updatePublicHandoverDuty(root, state).status, "current");
    assert.equal(readFileSync(path, "utf8"), `# State\n\n## Next action\n\n${pf59Marker}\n\n${PF59_BEGIN}\n${draftBody}\n${PF59_END}\n\n## Decisions\n\nKeep.\n`);
  }
}));

test("PF-59 (D160): a begin marker without an end marker, or two begin markers, is refused as unavailable and the file stays unchanged", () => fixture((root, path) => {
  const bodies = [
    `${PF59_BEGIN}\nGenerated.\n\nProject text.\n\n`,
    `${PF59_BEGIN}\nOne.\n${PF59_END}\n\n${PF59_BEGIN}\nTwo.\n${PF59_END}\n\n`,
    `${PF59_END}\nBackwards.\n${PF59_BEGIN}\n\n`,
    `Text.\n${PF59_END}\n\n`,
  ];
  for (const body of bodies) {
    const bytes = `# State\n\n## Next action\n\n${body}## Decisions\n\nKeep.\n`;
    writeFileSync(path, bytes, "utf8");
    const duty = inspectPublicHandoverDuty(root, state);
    assert.equal(duty.status, "unavailable");
    assert.equal(typeof duty.reason, "string");
    assert.ok(duty.reason.length > 0);
    const updated = updatePublicHandoverDuty(root, state);
    assert.equal(updated.status, "unavailable");
    assert.equal(typeof updated.reason, "string");
    assert.equal(readFileSync(path, "utf8"), bytes);
  }
}));

test("PF-59 (D160): the alias refusal and the Notes-marker rule still hold with a marked block present", () => fixture((root, path) => {
  const target = join(root, "private-fixture.md");
  const bytes = `# Private fixture\n\n## Next action\n\n${PF59_BEGIN}\nMust remain unchanged.\n${PF59_END}\n`;
  writeFileSync(target, bytes);
  symlinkSync(target, path);
  assert.equal(updatePublicHandoverDuty(root, state).status, "unavailable");
  assert.equal(readFileSync(target, "utf8"), bytes);
  rmSync(path);
  // Markers outside Next action neither count as malformed nor make the section current.
  const notes = `## Notes\n\n${PF59_BEGIN}\n\n**Lifecycle phase:** feature \`demo\` · phase \`design\`\n\n`;
  writeFileSync(path, `# State\n\n${notes}## Next action\n\nProject text.\n\n## Decisions\n\nKeep.\n`, "utf8");
  assert.equal(inspectPublicHandoverDuty(root, state).status, "stale");
  assert.equal(updatePublicHandoverDuty(root, state).status, "current");
  const updated = readFileSync(path, "utf8");
  assert.ok(updated.includes(notes));
  assert.ok(updated.includes("Project text.\n\n## Decisions\n\nKeep.\n"));
}));

if (cases.length !== 11) throw new Error("public-handover-duty-tests case count drift");
registerTestCaseCompletion({ cases, fd: Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD ?? "3"), maxBytes: 65536 });
