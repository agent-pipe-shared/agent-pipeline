// SPDX-License-Identifier: SUL-1.0
// ADR-0096 (D248): the close's gate-definition walk on real git histories. Proof readers of the device stores are injected.
import test, { after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ACKNOWLEDGEMENT_LABEL, CONFIGURE_VERIFY_LABEL, GATE_CHANGE_ACKNOWLEDGEMENT_KIND, buildGateChangeAcknowledgementSubject, describeGateDefinitionChange,
  gateChangeAcknowledgementConfirmationLines, gateChangeAcknowledgementRepair, gateChangeListDigest, gateDefinitionChangeReadback, gateDefinitionRuleFor, specDirectoryOf } from "./gate-definition-changes.mjs";

const roots = [];
after(() => { for (const root of roots) rmSync(root, { recursive: true, force: true }); });
const sha = (text) => createHash("sha256").update(text).digest("hex");

function repo() {
  const dir = mkdtempSync(join(tmpdir(), "gdc-"));
  roots.push(dir);
  const git = (...args) => {
    const result = spawnSync("git", ["-C", dir, "-c", "user.name=fixture", "-c", "user.email=fixture@example.invalid", "-c", "commit.gpgsign=false", ...args], { encoding: "utf8" });
    assert.equal(result.status, 0, `${args.join(" ")}: ${result.stderr}`);
    return result.stdout.trim();
  };
  git("init", "-q", "-b", "main");
  const put = (path, text) => { mkdirSync(join(dir, path, ".."), { recursive: true }); writeFileSync(join(dir, path), text); };
  const commit = (message, paths) => { git("add", "--all", "--", ...paths); git("commit", "-q", "--no-verify", "-m", message); return git("rev-parse", "HEAD"); };
  put("README.md", "x\n"); commit("chore: before the feature", ["README.md"]);
  put("specs/shop/prd.md", "prd\n"); commit("docs: feature starts", ["specs/shop/prd.md"]);
  return { dir, git, put, commit };
}
const none = { readOverrides: () => [], readConfigureVerify: () => [], readAcks: () => [] };
const readback = (r, extra = {}) => gateDefinitionChangeReadback({ rootDir: r.dir, featureId: "shop", commonDir: join(r.dir, ".git"), ...none, ...extra });

test("the set is the gate definitions only: plugin source, onboarding staging and ordinary files are not in it", () => {
  assert.equal(gateDefinitionRuleFor("architecture/boundary-policy.json").id, "GS-16");
  assert.equal(gateDefinitionRuleFor("architecture/fitness-model.json").id, "GS-17");
  assert.equal(gateDefinitionRuleFor("pipeline.user.yaml").id, "GS-1");
  for (const path of ["plugins/pipeline-core/lib/public-core-origin-allowlist.mjs", "project/.onboarding-staging/x.md", "src/app.js"]) assert.equal(gateDefinitionRuleFor(path), null, path);
});

test("first creation is free; a later change, a deletion and a re-creation are unproven, and an exempt-field-only edit is no gate change", () => {
  const r = repo();
  r.put("architecture/boundary-policy.json", "{\"allow\":[]}\n"); const added = r.commit("feat: boundary baseline", ["architecture/boundary-policy.json"]);
  r.put("pipeline.user.yaml", "language:\n  human_facing: en\ngates:\n  push_approval: signature\n"); r.commit("chore: user config", ["pipeline.user.yaml"]);
  r.put("pipeline.user.yaml", "language:\n  human_facing: de\ngates:\n  push_approval: signature\n"); r.commit("chore: language only", ["pipeline.user.yaml"]);
  r.put("pipeline.user.yaml", "language:\n  human_facing: de\ngates:\n  push_approval: chat\n"); const weakened = r.commit("chore: push approval in chat", ["pipeline.user.yaml"]);
  r.put("architecture/boundary-policy.json", "{\"allow\":[\"*\"]}\n"); const widened = r.commit("chore: widen", ["architecture/boundary-policy.json"]);
  r.git("rm", "-q", "architecture/boundary-policy.json"); r.git("commit", "-q", "--no-verify", "-m", "chore: drop"); const dropped = r.git("rev-parse", "HEAD");
  r.put("architecture/boundary-policy.json", "{\"allow\":[\"**\"]}\n"); const recreated = r.commit("chore: re-create", ["architecture/boundary-policy.json"]);
  const result = readback(r);
  assert.equal(result.status, "unproven");
  const byCommit = Object.fromEntries(result.changes.map((change) => [`${change.commit}:${change.path}`, change]));
  assert.equal(byCommit[`${added}:architecture/boundary-policy.json`].proof.kind, "first-appearance");
  assert.equal(result.changes.filter((change) => change.path === "pipeline.user.yaml").length, 2, "the first appearance and the push_approval change; the language-only edit is not listed");
  assert.deepEqual(result.unproven.map((change) => `${change.commit}:${change.change}`), [`${weakened}:M`, `${widened}:M`, `${dropped}:D`, `${recreated}:A`]);
  assert.match(describeGateDefinitionChange(result.unproven[0]), /^GS-1 pipeline\.user\.yaml changed in [a-f0-9]{12}: no proof$/u);
});

test("the fitness model is proven by the committed materialization receipt naming its blob, not by a receipt for other bytes", () => {
  const r = repo();
  r.put("architecture/fitness-model.json", "{\"m\":1}\n"); r.commit("feat: first model", ["architecture/fitness-model.json"]);
  r.put("architecture/fitness-model.json", "{\"m\":2}\n");
  r.put("architecture/design-materialization.json", JSON.stringify({ schema: "x", designSha256: "d".repeat(64), targets: [{ path: "architecture/fitness-model.json", sha256: sha("{\"m\":2}\n") }] }));
  const good = r.commit("chore: materialize", ["architecture/fitness-model.json", "architecture/design-materialization.json"]);
  r.put("architecture/fitness-model.json", "{\"m\":3}\n"); const hand = r.commit("chore: hand edit", ["architecture/fitness-model.json"]);
  const result = readback(r);
  const proofOf = (commit) => result.changes.find((change) => change.commit === commit && change.ruleId === "GS-17").proof;
  assert.equal(proofOf(good).kind, "materialization");
  assert.equal(proofOf(good).ref, "d".repeat(64));
  assert.equal(proofOf(hand), null);
});

test("configure-verify counts with its label; an override counts only for its own next change of the path", () => {
  const r = repo();
  r.put("project/pipeline.json", "{\"verify\":null}\n"); r.commit("chore: calibration", ["project/pipeline.json"]);
  const parent = r.git("rev-parse", "HEAD");
  r.put("project/pipeline.json", "{\"verify\":\"npm test\"}\n"); const configured = r.commit("chore: configure project verification", ["project/pipeline.json"]);
  r.put("project/guard-config.json", "{\"a\":1}\n"); r.commit("chore: guard config", ["project/guard-config.json"]);
  const armedAt = r.git("rev-parse", "HEAD");
  r.put("project/guard-config.json", "{\"a\":2}\n"); const first = r.commit("chore: guard change with override", ["project/guard-config.json"]);
  r.put("project/guard-config.json", "{\"a\":3}\n"); const second = r.commit("chore: second guard change", ["project/guard-config.json"]);
  const result = readback(r, {
    readConfigureVerify: () => [{ id: "c".repeat(64), head: parent, entries: [{ path: "project/pipeline.json", afterSha256: sha("{\"verify\":\"npm test\"}\n") }] }],
    readOverrides: () => [{ planSha256: "e".repeat(64), eligiblePaths: ["project/guard-config.json"], head: armedAt, mode: "signature-verified", signedCandidate: null, consumedAt: null }],
  });
  const proofOf = (commit) => result.changes.find((change) => change.commit === commit).proof;
  assert.deepEqual(proofOf(configured), { kind: "configure-verify", ref: "c".repeat(64), label: CONFIGURE_VERIFY_LABEL });
  assert.equal(proofOf(first).kind, "human-guard-override");
  assert.equal(proofOf(first).label, null);
  assert.equal(proofOf(second), null, "one override admits one change of the path");
});

test("the PO acknowledgement covers exactly the listed changes; a later change needs a new one", () => {
  const r = repo();
  r.put("project/pipeline.yaml", "gates: {}\n"); r.commit("chore: manifest", ["project/pipeline.yaml"]);
  r.put("project/pipeline.yaml", "gates:\n  push:\n    approval: none\n"); r.commit("chore: weaken", ["project/pipeline.yaml"]);
  const toAcknowledge = readback(r, { excludeAcknowledgements: true }).unproven;
  assert.equal(toAcknowledge.length, 1);
  const { list, sha256: changesSha256 } = gateChangeListDigest(toAcknowledge);
  const acks = [{ changes: list, ref: "f".repeat(64), mode: "signature" }];
  const covered = readback(r, { readAcks: () => acks });
  assert.equal(covered.status, "proven");
  assert.equal(covered.changes.at(-1).proof.label, ACKNOWLEDGEMENT_LABEL);
  assert.match(changesSha256, /^[a-f0-9]{64}$/u);
  r.put("project/pipeline.yaml", "gates:\n  push:\n    approval: chat\n"); r.commit("chore: again", ["project/pipeline.yaml"]);
  assert.equal(readback(r, { readAcks: () => acks }).unproven.length, 1);
});

test("a merge counts with what it brings in, against its first parent", () => {
  const r = repo();
  r.git("checkout", "-q", "-b", "side");
  r.put("architecture/boundary-policy.json", "{\"allow\":[]}\n"); r.commit("feat: baseline on a side branch", ["architecture/boundary-policy.json"]);
  r.put("architecture/boundary-policy.json", "{\"allow\":[\"*\"]}\n"); r.commit("chore: widen on the side branch", ["architecture/boundary-policy.json"]);
  r.git("checkout", "-q", "main");
  r.put("src/a.js", "a\n"); r.commit("feat: main work", ["src/a.js"]);
  r.git("merge", "-q", "--no-ff", "--no-verify", "-m", "merge side", "side");
  const merge = r.git("rev-parse", "HEAD");
  const result = readback(r);
  assert.equal(result.changes.length, 1);
  assert.equal(result.changes[0].commit, merge);
  assert.equal(result.changes[0].proof.kind, "first-appearance", "the merge adds a path no first-parent ancestor named");
});

test("no range is a typed unavailable readback, never a pass", () => {
  const r = repo();
  const result = gateDefinitionChangeReadback({ rootDir: r.dir, featureId: "other", commonDir: join(r.dir, ".git"), ...none });
  assert.equal(result.status, "unavailable");
});

test("a dated Spec folder sets the range from its first commit; the folder of a Spec path is read strictly", () => {
  assert.equal(specDirectoryOf("specs/2026-11-01-shop-epic/spec.md"), "specs/2026-11-01-shop-epic");
  for (const path of ["specs/spec.md", "../specs/a/spec.md", "specs/a/b/spec.md", "docs/a/spec.md", null]) assert.equal(specDirectoryOf(path), null, String(path));
  const r = repo();
  r.put("architecture/boundary-policy.json", "{\"allow\":[]}\n"); r.commit("feat: baseline before the epic", ["architecture/boundary-policy.json"]);
  r.put("specs/2026-11-01-shop-epic/spec.md", "spec\n"); r.commit("docs: dated epic spec", ["specs/2026-11-01-shop-epic/spec.md"]);
  r.put("architecture/boundary-policy.json", "{\"allow\":[\"*\"]}\n"); const widened = r.commit("chore: widen inside the epic", ["architecture/boundary-policy.json"]);
  const plain = gateDefinitionChangeReadback({ rootDir: r.dir, featureId: "epic-2", commonDir: join(r.dir, ".git"), ...none });
  assert.equal(plain.status, "unavailable", "the feature id names no folder");
  const dated = gateDefinitionChangeReadback({ rootDir: r.dir, featureId: "epic-2", commonDir: join(r.dir, ".git"), specDirectory: "specs/2026-11-01-shop-epic", ...none });
  assert.deepEqual(dated.unproven.map((change) => change.commit), [widened], "the baseline before the folder is outside the range");
});

test("the acknowledgement subject names the unproven changes at the clean HEAD and reads the Spec folder from the State", () => {
  const r = repo();
  const quiet = { readOverrides: () => [], readConfigureVerify: () => [] };
  r.put("specs/2026-11-01-shop-epic/spec.md", "spec\n");
  r.put("project/pipeline-state.json", JSON.stringify({ schema: "pipeline.state.v0", planApproval: { poGateAuthority: { specPath: "specs/2026-11-01-shop-epic/spec.md" } } }));
  r.commit("docs: dated epic spec", ["specs/2026-11-01-shop-epic/spec.md", "project/pipeline-state.json"]);
  const nothing = buildGateChangeAcknowledgementSubject({ root: r.dir, featureId: "epic-2", commonDir: join(r.dir, ".git"), ...quiet });
  assert.deepEqual([nothing.ok, nothing.code], [false, "GCA-NOTHING-TO-ACKNOWLEDGE"]);
  r.put("project/pipeline.yaml", "gates: {}\n"); r.commit("chore: manifest", ["project/pipeline.yaml"]);
  r.put("project/pipeline.yaml", "gates:\n  push:\n    approval: none\n"); const weakened = r.commit("chore: weaken", ["project/pipeline.yaml"]);
  const built = buildGateChangeAcknowledgementSubject({ root: r.dir, featureId: "epic-2", commonDir: join(r.dir, ".git"), ...quiet });
  assert.equal(built.ok, true, built.detail);
  assert.deepEqual(built.candidate, { commit: weakened, tree: r.git("rev-parse", "HEAD^{tree}") });
  assert.equal(built.subject.schema, "pipeline.gate-change-acknowledgement-subject.v1");
  assert.deepEqual(built.subject.changes.map((change) => change.commit), [weakened]);
  assert.equal(built.subject.changesSha256, gateChangeListDigest(built.subject.changes).sha256);
  assert.equal(GATE_CHANGE_ACKNOWLEDGEMENT_KIND, "acknowledge-gate-definition-changes");
  const lines = gateChangeAcknowledgementConfirmationLines(built.subject);
  assert.match(lines.join("\n"), /project\/pipeline\.yaml changed in [a-f0-9]{12}/u);
  assert.match(lines.at(-1), /acknowledged after the fact/u);
});

test("C30G-D2: the repair of an unproven gate-definition change orders the clean-tree route: the Pipeline's own outputs in, the rest out, the signature at the current HEAD, the rerun", () => {
  const text = gateChangeAcknowledgementRepair({ stateWriter: "state.mjs", commitOwned: "owned.mjs" });
  assert.match(text, /run node state\.mjs approve-gate-change-acknowledgement --by <the label the PO gives for this command>/u, "the signing route is unchanged");
  const order = [/commit the Pipeline's own outputs with node owned\.mjs --root <the project root> --agent/u, /move everything else out of the work tree/u, /signs at the current HEAD/u, /commits? nothing between the signature and its command/u, /rerun the identical close command/u];
  let from = 0;
  for (const part of order) { const found = part.exec(text.slice(from)); assert.ok(found, `${part} in order`); from += found.index + found[0].length; }
  assert.match(gateChangeAcknowledgementRepair(), /commit-pipeline-owned\.mjs --root/u, "the default spelling names the script");
});
