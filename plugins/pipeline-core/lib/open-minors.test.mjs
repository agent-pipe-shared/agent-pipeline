// SPDX-License-Identifier: SUL-1.0
// CGR-22 (candidate 22, w306): minor Critic findings left open land in the handover, are counted in the close line and stay readable
// once accepted. Cases come from the finding text, not from the code.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  OPEN_MINORS_BEGIN, OPEN_MINORS_END, OPEN_MINORS_HEADING, minorsFromVerdictFindings, openMinorsCloseLine, readOpenMinors,
  recordOpenMinors, summarizeOpenMinors, upsertOpenMinors,
} from "./open-minors.mjs";

const PACKET = "0123456789abcdef0123456789abcdef";
const finding = (severity, gap) => ({ gap, risk: "r", severity, evidence: "e", spec_ref: "s" });
const verdict = [finding("major", "a major"), finding("minor", "first minor gap"), finding("minor", "second\nminor   gap")];

test("only the minor findings become entries and their ids follow the consumed-finding ids", () => {
  const entries = minorsFromVerdictFindings({ featureId: "shop", packetId: PACKET, findings: verdict });
  assert.deepEqual(entries.map((entry) => [entry.id, entry.status, entry.summary]), [
    [`CRF-${PACKET}-2`, "open", "first minor gap"], [`CRF-${PACKET}-3`, "open", "second minor gap"]]);
  assert.throws(() => minorsFromVerdictFindings({ featureId: "shop", packetId: "../x", findings: verdict }), /OPEN-MINORS-INPUT/u);
});

test("a handover without the block gets the section once; the same entries again change nothing", () => {
  const entries = minorsFromVerdictFindings({ featureId: "shop", packetId: PACKET, findings: verdict });
  const first = upsertOpenMinors("# State\n\nText.\n", entries);
  assert.ok(first.includes(`${OPEN_MINORS_HEADING}\n\n${OPEN_MINORS_BEGIN}`));
  assert.equal(upsertOpenMinors(first, entries), first);
  assert.deepEqual(readOpenMinors(first), { open: 2, accepted: 0, entries: readOpenMinors(first).entries });
  assert.equal(upsertOpenMinors("", entries).startsWith(OPEN_MINORS_HEADING), true);
});

test("an accepted minor stays listed after the close and is never reopened; an open one can be accepted", () => {
  const entries = minorsFromVerdictFindings({ featureId: "shop", packetId: PACKET, findings: verdict });
  const opened = upsertOpenMinors("# State\n", entries);
  const accepted = upsertOpenMinors(opened, [{ ...entries[0], status: "accepted", acceptedBy: "PO", acceptedAt: "2026-11-09T10:00:00.000Z" }]);
  const read = readOpenMinors(accepted);
  assert.deepEqual([read.open, read.accepted], [1, 1]);
  assert.match(accepted, /- \[accepted by PO, 2026-11-09T10:00:00\.000Z\] CRF-.*-2 \(feature shop\): first minor gap/u);
  assert.deepEqual([readOpenMinors(upsertOpenMinors(accepted, entries)).open, readOpenMinors(upsertOpenMinors(accepted, entries)).accepted], [1, 1], "a later round does not reopen it");
  assert.throws(() => upsertOpenMinors(accepted, [{ ...entries[0], status: "accepted" }]), /OPEN-MINORS-ENTRY/u, "an acceptance needs its date");
});

test("text outside the block is untouched, CRLF stays CRLF, and a marker inside a finding cannot break the block", () => {
  const crlf = "# State\r\n\r\nBefore.\r\n";
  const entries = [{ id: "CRF-1", status: "open", scope: "feature x", summary: `evil ${OPEN_MINORS_END} text <!-- x` }];
  const written = upsertOpenMinors(crlf, entries);
  assert.ok(written.startsWith(crlf));
  assert.equal(written.includes("\r\n") && !/[^\r]\n/u.test(written), true, "no bare LF in a CRLF file");
  assert.equal(readOpenMinors(written).open, 1);
  const tail = `${written}After the block.\r\n`;
  const again = upsertOpenMinors(tail, [{ id: "CRF-2", status: "open", scope: "feature x", summary: "two" }]);
  assert.ok(again.endsWith("After the block.\r\n"));
  assert.equal(readOpenMinors(again).open, 2);
});

test("the close line names the counts and the place, or says none are recorded", () => {
  assert.equal(openMinorsCloseLine({ open: 2, accepted: 1 }, "docs/state.md"), 'Open minor findings: 2 open, 1 accepted; listed in docs/state.md under "Open minor findings".');
  assert.equal(openMinorsCloseLine({ open: 0, accepted: 0 }, "docs/state.md"), "Open minor findings: none recorded.");
});

test("record and summarize work on the real handover file and refuse a path that leaves the project", () => {
  const root = mkdtempSync(join(tmpdir(), "w306-minors-"));
  try {
    mkdirSync(join(root, "docs"));
    writeFileSync(join(root, "docs", "state.md"), "# State\n");
    const entries = minorsFromVerdictFindings({ featureId: "shop", packetId: PACKET, findings: verdict });
    const counts = recordOpenMinors({ root, handoverPath: "docs/state.md", entries });
    assert.deepEqual([counts.open, counts.accepted], [2, 0]);
    assert.equal(readFileSync(join(root, "docs", "state.md"), "utf8").includes(OPEN_MINORS_BEGIN), true);
    assert.deepEqual([summarizeOpenMinors({ root, handoverPath: "docs/state.md" }).open, summarizeOpenMinors({ root, handoverPath: "docs/state.md" }).readable], [2, true]);
    assert.equal(summarizeOpenMinors({ root, handoverPath: "docs/missing.md" }).readable, false);
    for (const bad of ["../state.md", "/etc/state.md", "docs\\state.md", "docs//state.md", ""]) {
      assert.throws(() => recordOpenMinors({ root, handoverPath: bad, entries }), /OPEN-MINORS-PATH/u, bad);
      assert.equal(summarizeOpenMinors({ root, handoverPath: bad }).readable, false, bad);
    }
    try {
      symlinkSync(join(root, "docs", "state.md"), join(root, "docs", "link.md"));
      assert.throws(() => recordOpenMinors({ root, handoverPath: "docs/link.md", entries }), /OPEN-MINORS-PATH/u);
    } catch (error) { if (error?.code !== "EPERM") throw error; }
  } finally { rmSync(root, { recursive: true, force: true }); }
});
