// SPDX-License-Identifier: SUL-1.0
// C30I-S5 (AC-112, queue C30-20): pure unit cases of the plain-language card that opens the attended signature confirmation.
// The cases run against fixtures of what the request and the subject preimage hold; no key, no git, no OpenSSL.
// Registration note: this FILE is new and is not run by Verify until it is listed in harness/verify-suites.json (the Coordinator does that);
// the same criterion is also pinned by the registered cases in scripts/po-human-approval.test.mjs.
import assert from "node:assert/strict";
import test from "node:test";

import { CARD_END_LINE, CARD_KINDS, criticalActionApprovalCard } from "./critical-action-approval-card.mjs";

const CANDIDATE = Object.freeze({ commit: "a1b2c3d4e5f6".padEnd(40, "a"), tree: "0f9e8d7c6b5a".padEnd(40, "b") });
const EXPIRES = "2026-11-18T10:30:00.000Z";
const FEATURE = "feature-a";
const SHA = (c) => c.repeat(64);

const EN_LABELS = ["WHAT YOU ARE SIGNING:", "WHY YOU ARE ASKED NOW:", "WHAT THIS ALLOWS, AND UNTIL WHEN:", "WHAT THIS DOES NOT ALLOW:", "IF YOU DECLINE:", "HOW TO READ THE LINES BELOW:"];
const DE_LABELS = ["WAS SIE UNTERSCHREIBEN:", "WARUM JETZT GEFRAGT WIRD:", "WAS DAS ERLAUBT, UND BIS WANN:", "WAS DAS NICHT ERLAUBT:", "WENN SIE ABLEHNEN:", "SO LESEN SIE DIE ZEILEN DARUNTER:"];

// One fixture per kind: the preimage the request really holds, plus the facts the card must state from it.
const FIXTURES = Object.freeze({
  push: { subject: { sourceCommit: CANDIDATE.commit, remote: "origin", destination: "refs/heads/feature-a", threatModel: { path: "project/push-threat-model.md", sha256: SHA("1") } }, facts: ["origin", "refs/heads/feature-a", "a1b2c3d4e5f6"], ids: ["GIT-05", "ADR-0061"] },
  deploy: { subject: { target: "staging" }, facts: ["a1b2c3d4e5f6"], ids: ["ADR-0061"] },
  publication: { subject: { target: "registry" }, facts: ["a1b2c3d4e5f6"], ids: ["ADR-0075"] },
  "feature-package-reconcile": { subject: { anything: "x" }, facts: [FEATURE, "a1b2c3d4e5f6"], ids: ["ADR-0056"] },
  "release-preflight": { subject: { schema: "pipeline.release-preflight-consent-subject.v1", version: "1.4.0", base: { commit: "e".repeat(40), tree: "f".repeat(40) }, lifecycle: { featureId: "feature-b", manifestPath: "specs/feature-b/lifecycle.json", manifestSha256: SHA("1") }, retentionPolicySha256: SHA("2") }, facts: ["1.4.0", "feature-b"], ids: ["ADR-0064"] },
  "interruption-promotion": { subject: { baselineSha256: SHA("3"), registrySha256: SHA("4"), window: { start: { value: "2026-11-01T00:00:00.000Z", status: "measured" }, end: { value: "2026-11-10T00:00:00.000Z", status: "measured" } }, coverage: { receipts: "measured", followup: "measured" }, scope: { featureId: null, packageId: null, dispatchId: null }, limitations: [] }, facts: ["333333333333", "2026-11-01T00:00:00.000Z", "2026-11-10T00:00:00.000Z"], ids: ["AC-6"] },
  "accept-residual-critic-findings": { subject: { criticReceiptSha256: SHA("5"), findings: [{ severity: "minor", id: "F-101" }, { severity: "minor", id: "F-102" }] }, facts: ["2 ", "F-101", "F-102"], ids: ["D190"] },
  "acknowledge-caller-authored-critic": { subject: { packetId: "packet-feature-a-1", criticReceiptSha256: SHA("6") }, facts: ["packet-feature-a-1"], ids: ["C21B"] },
  "spec-addendum": { subject: { addendumPath: "specs/feature-a/addendum-1.md", addendumSha256: SHA("7"), specPath: "specs/feature-a/spec.md", specSha256: SHA("8"), packetId: "packet-feature-a-2", findingIds: ["F-7", "F-8", "F-9"] }, facts: ["specs/feature-a/addendum-1.md", "specs/feature-a/spec.md", "3 "], ids: ["ADR-0095"] },
  "acknowledge-gate-definition-changes": { subject: { featureId: FEATURE, rangeBase: "9".repeat(40), changesSha256: SHA("9"), changes: [{ path: "harness/a.json", change: "M", commit: "1".repeat(40) }, { path: "harness/b.json", change: "D", commit: "2".repeat(40) }, { path: "harness/a.json", change: "M", commit: "2".repeat(40) }] }, facts: ["3 gate-definition change", "2 file", "2 commit"], factsDe: ["3 Änderungen", "2 Dateien", "2 Commits"], ids: ["ADR-0096"] },
  "acknowledge-maintenance-red-check": { subject: { featureId: FEATURE, checksSha256: SHA("a"), checks: [{ check: { command: "one" }, observedExitCode: 1 }, { check: { command: "two" }, observedExitCode: 2 }] }, facts: ["2 check", FEATURE], factsDe: ["2 Prüfungen", FEATURE], ids: ["ADR-0097"] },
  "replace-verify-command": { subject: { featureId: FEATURE, previousCommand: "node old.mjs", verifyCommand: "node new.mjs", testRunSha256: SHA("b"), entries: [{ path: "project/pipeline.json", afterSha256: SHA("c") }, { path: ".claude/pipeline.json", afterSha256: SHA("d") }] }, facts: ["node new.mjs", "2 calibration file"], factsDe: ["node new.mjs", "2 Kalibrierungsdateien"], ids: ["ADR-0100"] },
});

const card = (kind, subject, language = "en") => criticalActionApprovalCard({ kind, candidate: CANDIDATE, expiresAt: EXPIRES, featureId: FEATURE, subject, language }).join("\n");

test("C30I-S5: the card table covers exactly the twelve kinds authorize-critical accepts, and the fixtures cover every one", () => {
  const commandKinds = ["push", "deploy", "publication", "feature-package-reconcile", "release-preflight", "interruption-promotion", "accept-residual-critic-findings",
    "acknowledge-caller-authored-critic", "spec-addendum", "acknowledge-gate-definition-changes", "acknowledge-maintenance-red-check", "replace-verify-command"];
  assert.deepEqual([...CARD_KINDS].sort(), [...commandKinds].sort());
  assert.deepEqual(Object.keys(FIXTURES).sort(), [...commandKinds].sort());
});

for (const kind of Object.keys(FIXTURES)) {
  test(`C30I-S5: kind ${kind} opens with all six labelled parts, the concrete facts of its fixture and the stored expiry, and no placeholder`, () => {
    const { subject, ids } = FIXTURES[kind];
    for (const language of ["en", "de"]) {
      const facts = language === "de" && FIXTURES[kind].factsDe ? FIXTURES[kind].factsDe : FIXTURES[kind].facts;
      const text = card(kind, subject, language);
      const labels = language === "en" ? EN_LABELS : DE_LABELS;
      let at = -1;
      for (const label of labels) { const found = text.indexOf(label); assert.ok(found > at, `${language}/${kind}: label ${label} missing or out of order`); at = found; }
      assert.ok(text.includes(EXPIRES), `${language}/${kind}: the stored ISO expiry must be stated`);
      for (const fact of facts) assert.ok(text.includes(fact), `${language}/${kind}: fact ${JSON.stringify(fact)} missing`);
      for (const id of ids) assert.ok(text.includes(id), `${language}/${kind}: id ${id} missing`);
      assert.ok(!/undefined|\bnull\b|NaN|\[object|\$\{|<[a-z-]+>/u.test(text), `${language}/${kind}: no placeholder may appear`);
      assert.ok(!/\r|\u0000/u.test(text));
    }
  });
}

test("C30I-S5: the German card is real German and the English card is real English for every kind (no shared wording)", () => {
  for (const [kind, { subject }] of Object.entries(FIXTURES)) {
    const de = card(kind, subject, "de"); const en = card(kind, subject, "en");
    assert.notEqual(de, en, kind);
    assert.match(de, /Sie|Ihr/u, `${kind}: German card addresses the human formally`);
    assert.doesNotMatch(en, /\b(Sie|Ihr|nicht|und)\b/u, `${kind}: English card must hold no German word`);
  }
});

test("C30I-S5: an unknown language falls back to the English card; an unknown kind yields no card", () => {
  assert.equal(card("push", FIXTURES.push.subject, "fr"), card("push", FIXTURES.push.subject, "en"));
  assert.deepEqual(criticalActionApprovalCard({ kind: "no-such-kind", candidate: CANDIDATE, expiresAt: EXPIRES, featureId: FEATURE, subject: null, language: "en" }), []);
});

test("C30I-S5: a card ends in the fixed delimiter line and never contains it earlier", () => {
  for (const [kind, { subject }] of Object.entries(FIXTURES)) {
    const lines = criticalActionApprovalCard({ kind, candidate: CANDIDATE, expiresAt: EXPIRES, featureId: FEATURE, subject, language: "en" });
    assert.equal(lines.at(-1), CARD_END_LINE);
    assert.equal(lines.filter((line) => line === CARD_END_LINE).length, 1);
  }
});

test("C30I-S5: when the request lacks a fact the card says nothing about it (bare digest, null or malformed preimage)", () => {
  // Push without --subject: no remote, no destination, no counts are invented; the card says only that they are not shown.
  const bare = card("push", null);
  assert.ok(!/origin|refs\/heads|\b\d+ (commits?|files?)\b/u.test(bare), "no remote, ref or count may be invented");
  assert.match(bare, /a1b2c3d4e5f6/u);
  assert.match(bare, /does not show the remote or the destination ref/u);
  // A push preimage that holds only a remote states the remote and still says the ref is not shown.
  const partial = card("push", { remote: "origin" });
  assert.match(partial, /remote "origin"/u);
  assert.match(partial, /does not show the remote or the destination ref/u);
  assert.ok(!partial.includes("refs/heads"));
  // Release without a preimage: no version, no lifecycle feature.
  const release = card("release-preflight", null);
  assert.ok(!/version/iu.test(release.split("\n").find((line) => line.startsWith("WHAT YOU ARE SIGNING:"))), "no version without a preimage");
  assert.ok(!release.includes("lifecycle"));
  // Malformed field types and multi-line strings are never rendered.
  const malformed = card("release-preflight", { version: 5, lifecycle: { featureId: "x\ny" } });
  assert.ok(!malformed.includes("x\ny") && !/\b5\b/u.test(malformed));
  assert.ok(!card("acknowledge-gate-definition-changes", { featureId: FEATURE, changes: "not-an-array" }).includes("0 gate"));
  assert.ok(!/ 0 /u.test(card("accept-residual-critic-findings", { findings: [] })), "an empty list yields no count sentence");
  assert.ok(!card("interruption-promotion", null).includes("window"), "no measurement window without a preimage");
  assert.ok(!card("replace-verify-command", { entries: [] }).includes("calibration file"));
  // Every kind still yields a complete card without any preimage and states the expiry.
  for (const kind of Object.keys(FIXTURES)) {
    const text = card(kind, null);
    for (const label of EN_LABELS) assert.ok(text.includes(label), `${kind}: ${label}`);
    assert.ok(text.includes(EXPIRES) && !/undefined|\bnull\b|NaN|\[object/u.test(text), kind);
  }
});

test("C30I-S5: the decline part says only what the code does -- nothing signed, no proof written -- and promises no message to the agent", () => {
  for (const kind of Object.keys(FIXTURES)) {
    const text = card(kind, FIXTURES[kind].subject);
    const line = text.split("\n").find((entry) => entry.startsWith("IF YOU DECLINE:"));
    assert.match(line, /Nothing is signed and no proof is written/u, kind);
    assert.match(line, /approval cancelled/u, kind);
    assert.doesNotMatch(line, /agent is told|notif/iu, kind);
  }
});

test("C30I-S5: the expiry is rendered the same on every machine (UTC, fixed month names), in the human's language, next to the stored ISO time", () => {
  assert.match(card("push", null, "en"), /18 November 2026, 10:30 UTC \(stored as 2026-11-18T10:30:00\.000Z\)/u);
  assert.match(card("push", null, "de"), /18\. November 2026, 10:30 Uhr UTC \(gespeichert als 2026-11-18T10:30:00\.000Z\)/u);
  const odd = criticalActionApprovalCard({ kind: "push", candidate: CANDIDATE, expiresAt: "not a time", featureId: FEATURE, subject: null, language: "en" }).join("\n");
  assert.ok(odd.includes("not a time") && !/NaN|undefined/u.test(odd));
});

test("C30I-S5: kind-specific limits the code knows are stated", () => {
  assert.match(card("acknowledge-gate-definition-changes", FIXTURES["acknowledge-gate-definition-changes"].subject), /does not judge whether any change is sound/u);
  assert.match(card("spec-addendum", FIXTURES["spec-addendum"].subject), /design approval is not reopened/u);
  assert.match(card("accept-residual-critic-findings", FIXTURES["accept-residual-critic-findings"].subject), /blocker is never accepted/u);
  assert.match(card("acknowledge-maintenance-red-check", FIXTURES["acknowledge-maintenance-red-check"].subject), /test or tooling paths only/u);
});

test("C30I-S5: a long finding list or change list is bounded and says how many were left out", () => {
  const findings = Array.from({ length: 14 }, (_, index) => ({ severity: "minor", id: `F-${index + 1}` }));
  const text = card("accept-residual-critic-findings", { findings });
  assert.match(text, /14 /u);
  assert.match(text, /and 4 more/u);
  assert.ok(!text.includes("F-14"));
});
