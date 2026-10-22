#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
// Pin: pipeline.bounded-reader-terminal-binding (AC-118).
// A bounded 2+2 Reader course (four two-stage rounds, one terminal correction
// batch, no fifth dispatch) binds through the committed source checker:
//   - four rounds plus a fourth terminal correction pass with no fifth reader;
//   - an unresolved finding, a fifth round, a mismatched commit/digest, or a
//     changed covered document fails;
//   - malformed, missing or invented evidence fails closed;
//   - the actual course shape (15 -> 16 document scope, disclosed normalized
//     report, explicit policy transition) binds without fabricating a fresh
//     Reader verdict for the terminal snapshot.
// Everything runs through the real checker module and CLI over real committed
// Git repositories. RED proofs run the SAME committed candidates through a
// scratch mirror of the production verifier with one check disabled.
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { after, test } from "node:test";
import {
  READER_REVIEW_INPUT_PATHS, READER_REVIEW_PATHS, checkReaderBinding,
  snapshotHistoricalReaderDocumentation, snapshotReaderDocumentation,
} from "../../../../harness/scripts/check-doc-reader-binding.mjs";
import { TERMINAL_READER_SCHEMA } from "../../../../harness/scripts/doc-reader-terminal-binding.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..", "..", "..", "..");
// Host fact: fixtures live under the repository scratch/, never the OS temp dir.
const BASE = join(REPO, "scratch", "bounded-reader-terminal-pin");
const CHECKER_SRC = join(REPO, "harness", "scripts", "check-doc-reader-binding.mjs");
const TERMINAL_SRC = join(REPO, "harness", "scripts", "doc-reader-terminal-binding.mjs");
const PREFLIGHT_URL = pathToFileURL(join(REPO, "plugins", "pipeline-core", "scripts", "release-preflight.mjs")).href;
const GOVEVENT_URL = pathToFileURL(join(REPO, "plugins", "pipeline-core", "lib", "governance-event.mjs")).href;
const CLI_SRC = join(REPO, "plugins", "pipeline-core", "scripts", "release-preflight-cli.mjs");

mkdirSync(BASE, { recursive: true });
after(() => rmSync(BASE, { recursive: true, force: true, maxRetries: 3 }));

const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const api = { snapshotReaderDocumentation, snapshotHistoricalReaderDocumentation };

// node:test scopes after() inside a test to that test, so cleanup is registered once at file level.
const fixtureRoots = [];
after(() => { for (const root of fixtureRoots) rmSync(root, { recursive: true, force: true, maxRetries: 3 }); });
// Containment (incident 2026-10-16): a fixture git call must never discover the enclosing project repository.
// GIT_CEILING_DIRECTORIES stops upward discovery at the fixture's parent, and every git write first proves
// that the toplevel is exactly the fixture root (realpath, case-folded on win32); otherwise it throws.
const WRITE_SUBCOMMANDS = new Set(["add", "commit", "rm", "checkout", "reset", "fetch", "branch", "merge", "mv", "restore", "switch", "clean", "stash", "tag"]);
const sameDir = (a, b) => { const n = (p) => { const r = realpathSync.native(p); return process.platform === "win32" ? r.toLowerCase() : r; }; return n(a) === n(b); };
function containedGit(root) {
  const run = (args) => execFileSync("git", args, { cwd: root, encoding: "utf8", timeout: 20000, stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, GIT_CEILING_DIRECTORIES: dirname(root), GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null" } }).trim();
  const subcommand = (args) => { for (let i = 0; i < args.length; i++) { if (args[i] === "-c") { i++; continue; } if (!args[i].startsWith("-")) return args[i]; } return ""; };
  const assertContained = () => {
    let top; try { top = run(["rev-parse", "--show-toplevel"]); } catch (e) { throw new Error(`fixture containment: no git repository at ${root}: ${e.message}`); }
    if (!sameDir(top, root)) throw new Error(`fixture containment: git toplevel ${top} is not the fixture root ${root}`);
  };
  const git = (args) => { if (WRITE_SUBCOMMANDS.has(subcommand(args))) assertContained(); return run(args); };
  git.init = () => { run(["init", "-q", "--initial-branch=fixture"]); assertContained(); };
  return git;
}
function fixture(_t, { policyChange = false, scopeExpansion = false } = {}) {
  const home = { root: mkdtempSync(join(BASE, "fx-")) }; fixtureRoots.push(home.root);
  const root = home.root, gits = new Map();
  const git = (args) => { if (!gits.has(home.root)) gits.set(home.root, containedGit(home.root)); return gits.get(home.root)(args); };
  const write = (path, bytes) => { mkdirSync(dirname(join(home.root, path)), { recursive: true }); writeFileSync(join(home.root, path), bytes); };
  const json = (path, value) => write(path, JSON.stringify(value) + "\n");
  const read = (path) => readFileSync(join(home.root, path));
  const commit = (message) => { git(["add", "-A"]); git(["-c", "core.hooksPath=/dev/null", "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-qm", message]); return git(["rev-parse", "HEAD"]); };
  const featureId = "reader-terminal-fixture", prefix = `specs/${featureId}/evidence/reader-review/`;
  const scope = scopeExpansion ? READER_REVIEW_PATHS.filter((path) => path !== "PIPELINE_FLOW.de.md") : READER_REVIEW_PATHS;
  const declareScope = (paths) => write("harness/scripts/check-doc-reader-binding.mjs", `export const READER_REVIEW_PATHS = Object.freeze(${JSON.stringify(paths, null, 2)});\n`);
  declareScope(scope);
  for (const path of scope) write(path, `# ${path}\nSynthetic document fixture.\n`);
  for (const path of READER_REVIEW_INPUT_PATHS) write(path, path.endsWith(".json") ? "{}\n" : "# Synthetic protocol\n");
  const ownerSource = prefix + "course-decision-fixture.md";
  write(ownerSource, "# Synthetic owner decision\nAuthorize four rounds plus terminal correction, no fifth review.\n");
  gits.set(root, containedGit(root)); gits.get(root).init(); commit("Synthetic initial documentation");
  const snap = (historical = false) => {
    const c = git(["rev-parse", "HEAD"]);
    const s = (historical ? api.snapshotHistoricalReaderDocumentation : api.snapshotReaderDocumentation)({ root, candidate: c, featureId });
    return { commit: c, tree: git(["rev-parse", `${c}^{tree}`]), coverage: s.coverage, inputs: s.inputs, docsetSha256: s.docsetSha256 };
  };
  const rounds = [], correctionBatches = []; let final, policyTransition = null;
  for (let i = 0; i < 4; i++) {
    const round = { id: `round-${i + 1}`, mode: ["complete", "corrections-only", "complete", "corrections-only"][i], reviewed: snap(true) };
    for (const [field, phase] of [["phaseOne", "phase-one"], ["phaseTwo", "phase-two"]]) {
      const path = `${prefix}${phase}/${round.id}.md`, bytes = Buffer.from(`# Synthetic ${phase}\nFinding: change fixture paragraph.\n`);
      write(path, bytes);
      round[field] = { path, sha256: hash(bytes), publication: { kind: "raw", rawSha256: hash(bytes) } };
    }
    commit(`Synthetic round ${i + 1} reports`);
    write("README.md", `# README\nCorrection ${i + 1} for the synthetic finding.\n`);
    if (scopeExpansion && i === 0) { declareScope(READER_REVIEW_PATHS); write("PIPELINE_FLOW.de.md", "# Newly split German guide\n"); }
    if (policyChange && i === 3) write("harness/reader-review-protocol.md", "# Synthetic terminal policy transition\n");
    const resolutionCommit = commit(`Synthetic correction ${i + 1}`);
    correctionBatches.push({ afterRound: i + 1, commits: [resolutionCommit] });
    if (i === 3) { final = snap(); if (policyChange) policyTransition = { fromSha256: round.reviewed.inputs.readerProtocolSha256, toSha256: final.inputs.readerProtocolSha256, commit: resolutionCommit }; }
    const path = `${prefix}disposition/${round.id}.json`;
    json(path, { schema: "pipeline.doc-reader-terminal-disposition.v1", round: round.id, status: "resolved", findings: [{ id: "F1", class: "fileline", status: "resolved", resolutionCommit }] });
    round.disposition = { path, sha256: hash(read(path)) }; commit(`Synthetic disposition ${i + 1}`); rounds.push(round);
  }
  const ownerPath = prefix + "owner-decision.json";
  json(ownerPath, { schema: "pipeline.doc-reader-terminal-owner-decision.v1", courseId: "fixture-course", authority: "documentation-owner", by: "Synthetic fixture owner",
    decision: "authorize-terminal-correction", maxRounds: 4, maxCorrectionBatches: 4, prohibitFifthReview: true, fourthReviewedCommit: rounds[3].reviewed.commit,
    acceptedFindingIds: [], source: { path: ownerSource, sha256: hash(read(ownerSource)) } });
  const record = { schema: TERMINAL_READER_SCHEMA, courseId: "fixture-course", rounds, correctionBatches, ownerDecision: { path: ownerPath, sha256: hash(read(ownerPath)) }, final, policyTransition };
  const recordPath = prefix + "record.json"; json(recordPath, record); commit("Synthetic bounded terminal binding");
  const fx = {
    get root() { return home.root; }, git, write, json, read, commit, record, recordPath, ownerPath, prefix, featureId,
    refresh: () => { json(recordPath, record); return commit("Synthetic binding mutation"); },
    check: (impl = checkReaderBinding) => impl({ root: home.root, candidate: git(["rev-parse", "HEAD"]), featureId }),
  };
  fx.base = git(["rev-parse", "HEAD"]);
  // Apply a mutation on a PRIVATE root with its own `git init` (history imported from the passing fixture),
  // evaluate, then discard that root. The shared fixture is never mutated, so there is nothing to restore.
  fx.trial = (mutate, impls = [checkReaderBinding]) => {
    const origin = home.root, trialRoot = mkdtempSync(join(BASE, "trial-")); fixtureRoots.push(trialRoot);
    try {
      gits.set(trialRoot, containedGit(trialRoot)); gits.get(trialRoot).init();
      home.root = trialRoot;
      git(["fetch", "-q", origin, fx.base]); git(["checkout", "-q", "-B", "fixture", "FETCH_HEAD"]);
      assert.equal(git(["rev-parse", "HEAD"]), fx.base, "trial root starts at the passing candidate");
      mutate(fx); return impls.map((impl) => fx.check(impl));
    } finally { home.root = origin; rmSync(trialRoot, { recursive: true, force: true, maxRetries: 3 }); }
  };
  fx.editJson = (path, edit) => { const value = JSON.parse(read(path)); edit(value); json(path, value); return value; };
  fx.editRecord = (edit) => { fx.editJson(recordPath, edit); commit("Synthetic record mutation"); };
  fx.editDisposition = (roundIndex, edit) => {
    const path = `${prefix}disposition/round-${roundIndex + 1}.json`; fx.editJson(path, edit);
    fx.editJson(recordPath, (r) => { r.rounds[roundIndex].disposition.sha256 = hash(read(path)); }); commit("Synthetic disposition mutation");
  };
  return fx;
}

// Scratch mirror of the production verifier with exactly one check disabled. Production is never edited.
const mirrors = new Map();
async function mirror(name, edits = []) {
  if (mirrors.has(name)) return mirrors.get(name);
  const dir = join(BASE, `mirror-${name}`, "harness", "scripts"); mkdirSync(dir, { recursive: true });
  let terminal = readFileSync(TERMINAL_SRC, "utf8");
  assert.ok(terminal.includes("'../../plugins/pipeline-core/lib/governance-event.mjs'"), "mirror: governance import anchor present");
  terminal = terminal.replace("'../../plugins/pipeline-core/lib/governance-event.mjs'", `'${GOVEVENT_URL}'`);
  for (const [from, to] of edits) { assert.ok(terminal.includes(from), `mirror edit anchor missing: ${from}`); terminal = terminal.replaceAll(from, to); }
  let checker = readFileSync(CHECKER_SRC, "utf8");
  assert.ok(checker.includes('"../../plugins/pipeline-core/scripts/release-preflight.mjs"'), "mirror: preflight import anchor present");
  checker = checker.replace('"../../plugins/pipeline-core/scripts/release-preflight.mjs"', `"${PREFLIGHT_URL}"`);
  writeFileSync(join(dir, "doc-reader-terminal-binding.mjs"), terminal);
  writeFileSync(join(dir, "check-doc-reader-binding.mjs"), checker);
  const mod = await import(pathToFileURL(join(dir, "check-doc-reader-binding.mjs")).href);
  mirrors.set(name, mod.checkReaderBinding); return mod.checkReaderBinding;
}

const joined = (result) => result.findings.join("\n");
// One committed passing course is shared by the read-only/restore-before-yield trials; cleanup is file-level.
let sharedFixture = null;
const shared = () => (sharedFixture ??= fixture({ after }));

test("positive: four rounds plus a fourth terminal correction pass with no fifth reader, honestly labelled", () => {
  const fx = shared();
  const result = fx.check(); assert.equal(result.status, "passed", joined(result));
  const fourth = fx.record.rounds[3].reviewed;
  // The terminal correction is NOT presented as freshly read: the reviewed commit is the fourth reviewed snapshot,
  // while the bound document set is the final corrected one, and they differ.
  assert.equal(result.reviewedCommit, fourth.commit);
  assert.notEqual(result.reviewedCommit, fx.base);
  assert.equal(result.docsetSha256, fx.record.final.docsetSha256);
  assert.notEqual(fourth.docsetSha256, fx.record.final.docsetSha256);
  assert.equal(result.assurance, "committed-state-and-evidence-presence-only");
  // Exactly eight immutable reports (4 x two phases) and no fifth-round evidence anywhere in the tree.
  const reports = fx.git(["ls-tree", "-r", "--name-only", "HEAD", "--", `${fx.prefix}phase-one/`, `${fx.prefix}phase-two/`]).split("\n");
  assert.equal(reports.length, 8);
  assert.ok(reports.every((p) => /round-[1-4]\.md$/.test(p)));
});

test("the committed source checker CLI (the release-preflight reader gate's subprocess) accepts the terminal form", (t) => {
  // (skip-vs-run decided after the static release-preflight assertions below)
  const fx = shared(t);
  const run = (candidate, featureId) => spawnSync(process.execPath, [CHECKER_SRC, "--root", fx.root, "--candidate", candidate, "--feature-id", featureId], { encoding: "utf8", timeout: 60000 });
  // The release preflight gate must ship the terminal verifier as a required committed member (static, host independent).
  const cli = readFileSync(CLI_SRC, "utf8");
  assert.ok(/SOURCE_READER_REQUIRED_PATHS[\s\S]{0,600}harness\/scripts\/doc-reader-terminal-binding\.mjs/.test(cli), "release preflight requires the terminal verifier member");
  assert.ok(cli.includes('"pipeline.doc-reader-binding-check.v1"') && cli.includes("requireSourceReaderBinding(root"), "release preflight consumes the checker result");
  const ok = run(fx.base, fx.featureId);
  if (ok.status === 2 && /git ENOENT/.test(ok.stdout)) {
    return t.skip("host-limitation: the checker CLI runs git without a PATH-resolved executable on this native Windows host (spawnSync git ENOENT); owner Coordinator, due 2026-10-19 for the Linux/WSL run (PO decision K7); the in-process checker cases above exercise the same verifier");
  }
  assert.equal(ok.status, 0, ok.stderr + ok.stdout);
  const parsed = JSON.parse(ok.stdout);
  assert.equal(parsed.schema, "pipeline.doc-reader-binding-check.v1"); assert.equal(parsed.status, "passed");
  assert.equal(parsed.candidateCommit, fx.base); assert.equal(parsed.featureId, fx.featureId);
  assert.equal(parsed.reviewedCommit, fx.record.rounds[3].reviewed.commit); assert.match(parsed.docsetSha256, /^[a-f0-9]{64}$/);
  // A feature id with no committed record fails closed (nonzero exit), never a silent pass.
  const missing = run(fx.base, "no-such-feature"); assert.notEqual(missing.status, 0);
});

test("a fifth reader round fails, even when a later commit deletes it (RED: disabled check lets the deleted fifth through)", async (t) => {
  const fx = shared(t), path = `${fx.prefix}phase-one/round-5.md`;
  const mutated = await mirror("fifth", [["if(!expectedPaths.has(path))fail(v2?'unlisted fourth or renamed committed round':'unlisted fifth or renamed committed round');", "void 0;"]]);
  const control = await mirror("control");
  const [added] = fx.trial(() => { fx.write(path, "# Synthetic unwanted fifth review\n"); fx.commit("Synthetic fifth report"); });
  assert.equal(added.status, "failed", joined(added));
  const [deleted, redControl, red] = fx.trial(() => { fx.write(path, "# Synthetic unwanted fifth review\n"); fx.commit("Synthetic fifth report"); rmSync(join(fx.root, path)); fx.commit("Delete synthetic fifth report"); }, [checkReaderBinding, control, mutated]);
  assert.equal(deleted.status, "failed", joined(deleted));
  assert.match(joined(deleted), /unlisted fifth or renamed committed round/);
  assert.equal(redControl.status, "failed"); // mirror without the edit behaves like production
  assert.equal(red.status, "passed"); // RED: the case is meaningful
});

test("an unresolved finding or an invented resolution cannot close the course (RED: disabled check passes the open finding)", async (t) => {
  const fx = shared(t), mutated = await mirror("unresolved", [["else fail('unresolved finding');", "else void 0;"]]);
  const [open, red] = fx.trial(() => fx.editDisposition(3, (d) => { d.findings[0].status = "open"; }), [checkReaderBinding, mutated]);
  assert.equal(open.status, "failed", joined(open)); assert.match(joined(open), /unresolved finding/);
  assert.equal(red.status, "passed");
  const [invented] = fx.trial(() => fx.editDisposition(3, (d) => { d.findings[0].resolutionCommit = fx.record.rounds[0].reviewed.commit; }));
  assert.equal(invented.status, "failed", joined(invented)); assert.match(joined(invented), /resolution outside its correction batch/);
  const [fieldless] = fx.trial(() => fx.editDisposition(3, (d) => { d.findings = []; }));
  assert.equal(fieldless.status, "failed", joined(fieldless));
});

test("mismatched commit or digest evidence fails", (t) => {
  const fx = shared(t);
  const [finalDigest] = fx.trial(() => fx.editRecord((r) => { r.final.docsetSha256 = "f".repeat(64); }));
  assert.equal(finalDigest.status, "failed", joined(finalDigest));
  const [reviewedCommit] = fx.trial(() => fx.editRecord((r) => { r.rounds[3].reviewed.commit = r.rounds[2].reviewed.commit; }));
  assert.equal(reviewedCommit.status, "failed", joined(reviewedCommit));
  const [reportDigest] = fx.trial(() => fx.editRecord((r) => { r.rounds[1].phaseTwo.sha256 = "a".repeat(64); r.rounds[1].phaseTwo.publication.rawSha256 = "a".repeat(64); }));
  assert.equal(reportDigest.status, "failed", joined(reportDigest));
  const [dispositionDigest] = fx.trial(() => fx.editRecord((r) => { r.rounds[0].disposition.sha256 = "b".repeat(64); }));
  assert.equal(dispositionDigest.status, "failed", joined(dispositionDigest));
  const [correctionOmitted] = fx.trial(() => fx.editRecord((r) => { r.correctionBatches[0].commits = []; }));
  assert.equal(correctionOmitted.status, "failed", joined(correctionOmitted));
});

test("a changed covered document or input after closure fails (RED: disabled drift check passes the changed document)", async (t) => {
  const fx = shared(t), mutated = await mirror("drift", [["fail('post-closure document or input drift')", "void 0"]]);
  const [doc, red] = fx.trial(() => { fx.write("README.md", "# Changed after closure\n"); fx.commit("Synthetic drift"); }, [checkReaderBinding, mutated]);
  assert.equal(doc.status, "failed", joined(doc)); assert.match(joined(doc), /post-closure document or input drift/);
  assert.equal(red.status, "passed");
  const [governance] = fx.trial(() => { fx.write("governance/observation-doc-governance.json", '{"changed":true}\n'); fx.commit("Synthetic governance drift"); });
  assert.equal(governance.status, "failed", joined(governance)); assert.match(joined(governance), /post-closure document or input drift/);
});

test("an immutable report overwritten and byte-identically restored is still rejected (RED: disabled history check misses it)", async (t) => {
  const fx = shared(t), mutated = await mirror("immutable", [["fail(label+' immutable report changed')", "void 0"]]);
  const ref = fx.record.rounds[0].phaseOne;
  const [restored, red] = fx.trial(() => {
    const original = fx.read(ref.path);
    fx.write(ref.path, "# Temporarily overwritten report\n"); fx.commit("Synthetic intermediate report overwrite");
    fx.write(ref.path, original); fx.commit("Synthetic report restoration");
    assert.equal(hash(fx.read(ref.path)), ref.sha256);
  }, [checkReaderBinding, mutated]);
  assert.equal(restored.status, "failed", joined(restored)); assert.match(joined(restored), /immutable report changed/);
  assert.equal(red.status, "passed");
  const [rewritten] = fx.trial(() => {
    fx.write(ref.path, "# Rewritten synthetic report\n");
    fx.editRecord((r) => { const p = r.rounds[0].phaseOne; p.sha256 = hash(fx.read(ref.path)); p.publication.rawSha256 = p.sha256; });
  });
  assert.equal(rewritten.status, "failed", joined(rewritten)); assert.match(joined(rewritten), /immutable report changed/);
});

test("malformed, missing or invented terminal evidence fails closed", (t) => {
  const fx = shared(t);
  const [missingRecord] = fx.trial(() => { rmSync(join(fx.root, fx.recordPath)); fx.commit("Synthetic missing record"); });
  assert.equal(missingRecord.status, "failed", joined(missingRecord));
  const [truncated] = fx.trial(() => { fx.write(fx.recordPath, "{\n"); fx.commit("Synthetic malformed record"); });
  assert.equal(truncated.status, "failed", joined(truncated));
  const [duplicateKey] = fx.trial(() => { fx.write(fx.recordPath, JSON.stringify(fx.record).replace('"courseId":"fixture-course"', '"courseId":"other","courseId":"fixture-course"')); fx.commit("Synthetic duplicate fields"); });
  assert.equal(duplicateKey.status, "failed", joined(duplicateKey));
  const [inventedField] = fx.trial(() => fx.editRecord((r) => { r.freshReaderVerdict = "passed"; }));
  assert.equal(inventedField.status, "failed", joined(inventedField));
  const [borrowedId] = fx.trial(() => fx.editRecord((r) => { r.rounds[3].id = r.rounds[2].id; }));
  assert.equal(borrowedId.status, "failed", joined(borrowedId));
  const [fiveRoundRecord] = fx.trial(() => fx.editRecord((r) => { r.rounds.push(structuredClone(r.rounds[3])); r.correctionBatches.push({ afterRound: 5, commits: [r.correctionBatches[3].commits[0]] }); }));
  assert.equal(fiveRoundRecord.status, "failed", joined(fiveRoundRecord));
  const [threeRoundRecord] = fx.trial(() => fx.editRecord((r) => { r.rounds.pop(); r.correctionBatches.pop(); }));
  assert.equal(threeRoundRecord.status, "failed", joined(threeRoundRecord));
  const [badSchema] = fx.trial(() => fx.editRecord((r) => { r.schema = "pipeline.doc-reader-terminal-record.v9"; }));
  assert.equal(badSchema.status, "failed", joined(badSchema));
});

test("explicit owner acceptance is the only way to leave a finding unchanged", (t) => {
  const fx = shared(t);
  const [unaccepted] = fx.trial(() => fx.editDisposition(3, (d) => { Object.assign(d.findings[0], { status: "accepted", resolutionCommit: null }); }));
  assert.equal(unaccepted.status, "failed", joined(unaccepted));
  const [accepted] = fx.trial(() => {
    fx.editDisposition(3, (d) => { Object.assign(d.findings[0], { status: "accepted", resolutionCommit: null }); });
    fx.editJson(fx.ownerPath, (o) => { o.acceptedFindingIds = ["round-4/F1"]; });
    fx.editRecord((r) => { r.ownerDecision.sha256 = hash(fx.read(fx.ownerPath)); });
  });
  assert.equal(accepted.status, "passed", joined(accepted));
});

test("actual-course shape: explicit policy transition and a disclosed normalized public report bind truthfully", (t) => {
  const fx = fixture(t, { policyChange: true });
  fx.record.rounds[3].phaseOne.publication = { kind: "path-normalized", rawSha256: "a".repeat(64) }; fx.refresh();
  const result = fx.check(); assert.equal(result.status, "passed", joined(result));
  assert.equal(result.reviewedCommit, fx.record.rounds[3].reviewed.commit); // terminal snapshot is not claimed as read
  fx.record.policyTransition = null; fx.refresh(); assert.equal(fx.check().status, "failed"); // undisclosed policy change is refused
  fx.record.policyTransition = { fromSha256: "c".repeat(64), toSha256: fx.record.final.inputs.readerProtocolSha256, commit: fx.record.correctionBatches[3].commits[0] };
  fx.refresh(); assert.equal(fx.check().status, "failed"); // invented transition source digest is refused
});

test("actual-course shape: a 15-document first-round scope expands to 16 without inventing an earlier review", (t) => {
  const fx = fixture(t, { scopeExpansion: true }), result = fx.check();
  assert.equal(result.status, "passed", joined(result));
  assert.equal(fx.record.rounds[0].reviewed.coverage.length, 15); assert.equal(fx.record.rounds[1].reviewed.coverage.length, 16);
  fx.record.rounds[0].reviewed.coverage.push(fx.record.rounds[1].reviewed.coverage.find((e) => e.path === "PIPELINE_FLOW.de.md"));
  fx.refresh(); const forged = fx.check();
  assert.equal(forged.status, "failed"); assert.match(joined(forged), /snapshot digest mismatch/);
});

// Report-bound phase-two adjudication (ALF-K33). A phase-two Reader may expressly decline a phase-one finding; the
// closed form records that as `adjudicated`, bound to the round's OWN immutable phase-two report by path, digest and a
// literal quote from each report. It is neither a correction nor an owner acceptance, and it infers neither.
const adjudicated = (fx, index, over = {}) => {
  const ref = fx.record.rounds[index].phaseTwo;
  return { id: "F2", class: "reordering", status: "adjudicated", resolutionCommit: null,
    adjudication: { report: { path: ref.path, sha256: ref.sha256 }, phaseOneQuote: "# Synthetic phase-one", phaseTwoQuote: "# Synthetic phase-two", ...over } };
};

test("a phase-two no-change adjudication closes a finding without a resolution commit or owner acceptance (RED: unchanged checker has no such status)", (t) => {
  const fx = shared(t);
  const [ok] = fx.trial(() => fx.editDisposition(0, (d) => { d.findings.push(adjudicated(fx, 0)); }));
  assert.equal(ok.status, "passed", joined(ok));
  assert.deepEqual(JSON.parse(fx.read(fx.ownerPath)).acceptedFindingIds, []); // nothing was accepted on anyone's behalf
  const [onlyAdjudicated] = fx.trial(() => fx.editDisposition(3, (d) => { d.findings = [adjudicated(fx, 3)]; }));
  assert.equal(onlyAdjudicated.status, "passed", joined(onlyAdjudicated)); // the round's correction batch still exists and is checked
  const [ownerKey] = fx.trial(() => {
    fx.editDisposition(0, (d) => { d.findings.push(adjudicated(fx, 0)); });
    fx.editJson(fx.ownerPath, (o) => { o.acceptedFindingIds = ["round-1/F2"]; });
    fx.editRecord((r) => { r.ownerDecision.sha256 = hash(fx.read(fx.ownerPath)); });
  });
  assert.equal(ownerKey.status, "failed", joined(ownerKey)); // an adjudication is not an acceptance and may not be listed as one
});

test("an adjudication names no resolution and carries exactly its closed report binding (RED: disabled checks pass the forgery)", async (t) => {
  const fx = shared(t);
  const noCommit = await mirror("adj-commit", [["if(finding.resolutionCommit!==null)fail('adjudicated finding names a resolution');", "void 0;"]]);
  const [withCommit, redCommit] = fx.trial(() => fx.editDisposition(0, (d) => { d.findings.push({ ...adjudicated(fx, 0), resolutionCommit: fx.record.correctionBatches[0].commits[0] }); }), [checkReaderBinding, noCommit]);
  assert.equal(withCommit.status, "failed", joined(withCommit)); assert.match(joined(withCommit), /adjudicated finding names a resolution/);
  assert.equal(redCommit.status, "passed");
  const [missing] = fx.trial(() => fx.editDisposition(0, (d) => { const f = adjudicated(fx, 0); delete f.adjudication; d.findings.push(f); }));
  assert.equal(missing.status, "failed", joined(missing));
  const [extraOnResolved] = fx.trial(() => fx.editDisposition(0, (d) => { d.findings[0].adjudication = adjudicated(fx, 0).adjudication; }));
  assert.equal(extraOnResolved.status, "failed", joined(extraOnResolved)); // `adjudication` exists only on an adjudicated finding
  const [extraKey] = fx.trial(() => fx.editDisposition(0, (d) => { const f = adjudicated(fx, 0); f.adjudication.ownerApproved = true; d.findings.push(f); }));
  assert.equal(extraKey.status, "failed", joined(extraKey));
  const [extraReportKey] = fx.trial(() => fx.editDisposition(0, (d) => { const f = adjudicated(fx, 0); f.adjudication.report.line = 1; d.findings.push(f); }));
  assert.equal(extraReportKey.status, "failed", joined(extraReportKey));
});

test("an adjudication must cite the round's own phase-two report (RED: disabled binding passes a foreign or phase-one citation)", async (t) => {
  const fx = shared(t);
  const unbound = await mirror("adj-report", [["if(a.report.path!==round.phaseTwo.path||a.report.sha256!==round.phaseTwo.sha256)fail('adjudication outside its own phase-two report');", "void 0;"]]);
  const foreign = fx.record.rounds[1].phaseTwo, own = fx.record.rounds[0];
  const [otherRound, redOther] = fx.trial(() => fx.editDisposition(0, (d) => { d.findings.push(adjudicated(fx, 0, { report: { path: foreign.path, sha256: foreign.sha256 } })); }), [checkReaderBinding, unbound]);
  assert.equal(otherRound.status, "failed", joined(otherRound)); assert.match(joined(otherRound), /outside its own phase-two report/);
  assert.equal(redOther.status, "passed");
  const [phaseOne] = fx.trial(() => fx.editDisposition(0, (d) => { d.findings.push(adjudicated(fx, 0, { report: { path: own.phaseOne.path, sha256: own.phaseOne.sha256 } })); }));
  assert.equal(phaseOne.status, "failed", joined(phaseOne));
  const [staleDigest] = fx.trial(() => fx.editDisposition(0, (d) => { d.findings.push(adjudicated(fx, 0, { report: { path: own.phaseTwo.path, sha256: "e".repeat(64) } })); }));
  assert.equal(staleDigest.status, "failed", joined(staleDigest));
});

test("an adjudication quotes both immutable reports literally, once (RED: disabled quote checks pass an invented or reused quote)", async (t) => {
  const fx = shared(t);
  const unquoted = await mirror("adj-quote", [["||!text.includes(value)", ""]]);
  const [invented, redInvented] = fx.trial(() => fx.editDisposition(0, (d) => { d.findings.push(adjudicated(fx, 0, { phaseTwoQuote: "The reader never wrote this sentence." })); }), [checkReaderBinding, unquoted]);
  assert.equal(invented.status, "failed", joined(invented)); assert.match(joined(invented), /quote not found in its immutable report/);
  assert.equal(redInvented.status, "passed");
  const [inventedOne] = fx.trial(() => fx.editDisposition(0, (d) => { d.findings.push(adjudicated(fx, 0, { phaseOneQuote: "The reader never wrote this either." })); }));
  assert.equal(inventedOne.status, "failed", joined(inventedOne));
  for (const bad of ["too short", "x".repeat(301), "# Synthetic phase-one\nFinding: change fixture paragraph.", " # Synthetic phase-one", 7, null]) {
    const [rejected] = fx.trial(() => fx.editDisposition(0, (d) => { d.findings.push(adjudicated(fx, 0, { phaseOneQuote: bad })); }));
    assert.equal(rejected.status, "failed", `bad quote ${JSON.stringify(bad)}: ${joined(rejected)}`);
  }
  const unreused = await mirror("adj-reuse", [["||quotes.has(a.phaseOneQuote)", ""]]);
  const [reused, redReused] = fx.trial(() => fx.editDisposition(0, (d) => { d.findings.push(adjudicated(fx, 0), { ...adjudicated(fx, 0), id: "F3" }); }), [checkReaderBinding, unreused]);
  assert.equal(reused.status, "failed", joined(reused)); assert.match(joined(reused), /adjudication quote reused/);
  assert.equal(redReused.status, "passed");
  const [same] = fx.trial(() => fx.editDisposition(0, (d) => { d.findings.push(adjudicated(fx, 0, { phaseTwoQuote: "# Synthetic phase-one" })); }));
  assert.equal(same.status, "failed", joined(same)); // one sentence cannot stand for both reports; it would not be in the phase-two report either
});

test("unresolved, partial and unknown dispositions stay non-passing beside a valid adjudication (RED: disabled status gate passes them)", async (t) => {
  const fx = shared(t);
  const open = await mirror("adj-open", [["else fail('unresolved finding');", "else void 0;"]]);
  for (const status of ["open", "partial", "no-change", "adjudication-pending", "adjudicated "]) {
    const [result, red] = fx.trial(() => fx.editDisposition(0, (d) => { d.findings.push(adjudicated(fx, 0), { id: "F3", class: "cut", status, resolutionCommit: null }); }), [checkReaderBinding, open]);
    assert.equal(result.status, "failed", `${status}: ${joined(result)}`); assert.match(joined(result), /unresolved finding|field set/);
    if (status === "open") assert.equal(red.status, "passed");
  }
});
