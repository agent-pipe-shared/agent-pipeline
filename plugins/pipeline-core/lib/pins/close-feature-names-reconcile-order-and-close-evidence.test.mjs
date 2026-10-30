// SPDX-License-Identifier: SUL-1.0
// N31/N32/G12 (D210): the close-feature skill names the whole ordered route for a feature with active Continuity, the
// continuity-close request schema and the three closeEvidence rules, and carries a signature table whose every verb
// and flag exists in the script it names. The two refusal texts that fire on a wrong close request name the rule that
// failed and point at that section. Source-text pins on purpose: no CLI with top-level effects is imported.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

const read = (relative) => readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");
const SKILL = read("../../skills/close-feature/SKILL.md");
const BLOCK_SKILL = read("../../skills/close-block/SKILL.md");
const SOURCES = {
  "pipeline-state.mjs": read("../../scripts/pipeline-state.mjs"),
  "close-coordinator.mjs": read("../../scripts/close-coordinator.mjs"),
  "po-human-approval.mjs": read("../../scripts/po-human-approval.mjs"),
};

const ROUTE_HEADING = "## Closing a feature with active Continuity: the ordered route";
const TABLE_HEADING = "## Command signatures";

function section(heading) {
  const start = SKILL.indexOf(heading);
  assert.notEqual(start, -1, `close-feature SKILL.md carries the section "${heading}"`);
  const next = SKILL.indexOf("\n## ", start + heading.length);
  return SKILL.slice(start, next === -1 ? undefined : next);
}

test("the ordered route names every step, in order, with its command", () => {
  const route = section(ROUTE_HEADING);
  const steps = [
    "close-coordinator.mjs plan-start",
    "--phase checkpointed",
    "continuity-result-bootstrap-plan",
    "continuity-result-bootstrap-apply",
    "authorize-critical",
    "feature-package-reconcile",
    "--phase feature-close-prepared",
    "--continuity-close-request",
    "pipeline-state.mjs close-feature",
  ];
  let at = -1;
  for (const step of steps) {
    const found = route.indexOf(step, at + 1);
    assert.ok(found > at, `step "${step}" appears after the previous step in the ordered route`);
    at = found;
  }
  assert.match(route, /signatureCommand/u, "the reconcile signing command is the one the bootstrap completion prints");
  assert.match(route, /subjectSha256/u);
});

test("the route documents the continuity-close request schema and the three closeEvidence rules", () => {
  const route = section(ROUTE_HEADING);
  assert.match(route, /pipeline\.continuity-close\.v0/u);
  for (const key of ["schema", "featureId", "expectedRevision", "result", "closeEvidence"]) assert.ok(route.includes(`\`${key}\``), `request key ${key} is named`);
  assert.match(route, /\{ ?path, ?sha256 ?\}/u, "rule 1: closeEvidence is a { path, sha256 } binding");
  assert.match(route, /regular (?:repository-relative )?file/u, "rule 1: of a regular repository-relative file");
  assert.match(route, /repository-relative/u);
  assert.match(route, /different from `?result/u, "rule 2: it differs from result");
  assert.match(route, /unique across closed features/u, "rule 3: its path is unique across closed features");
  assert.match(route, /combined Verify\/Critic receipt/u, "the usual choice is named");
});

test("every documented verb and flag of the signature table exists in the script that is named", () => {
  const table = section(TABLE_HEADING);
  const rows = [...table.matchAll(/^\| `([a-z-]+\.mjs) ([a-z-]+)`[^|]*\|([^|]*)\|/gmu)].map((m) => ({ script: m[1], verb: m[2], flags: [...m[3].matchAll(/--[a-z][a-z0-9-]*/gu)].map((f) => f[0]) }));
  const required = [
    ["pipeline-state.mjs", "feature-package-status"], ["pipeline-state.mjs", "feature-package-reconcile"],
    ["pipeline-state.mjs", "continuity-result-bootstrap-plan"], ["pipeline-state.mjs", "continuity-result-bootstrap-apply"], ["pipeline-state.mjs", "close-feature"],
    ["close-coordinator.mjs", "inspect"], ["close-coordinator.mjs", "plan-start"], ["close-coordinator.mjs", "apply-start"],
    ["close-coordinator.mjs", "plan-transition"], ["close-coordinator.mjs", "apply-transition"], ["po-human-approval.mjs", "authorize-critical"],
  ];
  for (const [script, verb] of required) assert.ok(rows.some((row) => row.script === script && row.verb === verb), `the table has a row for ${script} ${verb}`);
  for (const row of rows) {
    const source = SOURCES[row.script];
    assert.notEqual(source, undefined, `${row.script} is a known script`);
    assert.ok(source.includes(`"${row.verb}"`) || source.includes(` ${row.verb} `) || source.includes(`.mjs ${row.verb}`), `${row.script} knows the verb ${row.verb}`);
    for (const flag of row.flags) {
      const name = flag.slice(2);
      assert.ok(source.includes(flag) || source.includes(`"${name}"`), `${row.script} ${row.verb} knows ${flag}`);
    }
  }
  const reconcile = rows.find((row) => row.verb === "feature-package-reconcile");
  for (const flag of ["--root", "--manifest", "--plan-sha256", "--by", "--proof-request", "--proof-authority", "--proof"]) assert.ok(reconcile.flags.includes(flag), `reconcile row names ${flag}`);
});

test("close-block routes a feature close to the ordered route", () => {
  assert.ok(BLOCK_SKILL.includes("close-feature"), "close-block names close-feature");
  assert.match(BLOCK_SKILL, /ordered route/u);
});

test("the two refusal texts name the rule that failed and the skill section", () => {
  for (const name of ["pipeline-state.mjs", "close-coordinator.mjs"]) {
    const source = SOURCES[name];
    assert.ok(source.includes("closeEvidence"), `${name}: the refusal names closeEvidence`);
    assert.ok(source.includes("unique across closed features"), `${name}: the uniqueness rule`);
    assert.ok(source.includes("close-feature skill"), `${name}: the pointer to the skill section`);
    assert.ok(source.includes("the ordered route"), `${name}: the section is named`);
  }
  assert.ok(SOURCES["close-coordinator.mjs"].includes("not bound to the exact close-ready State"), "the original wording is kept");
});
