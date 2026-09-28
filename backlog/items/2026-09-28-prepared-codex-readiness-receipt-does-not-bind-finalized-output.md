---
schema: pipeline.backlog-item.v1
id: pipeline.codex-readiness-private-receipt-omits-output-custody
type: defect
owner: pipeline
status: open
created: 2026-09-28
source: "Independent first_restart review of the prepared 22-surface minimal Readiness activation; confirmed source callsites and actual host baseline 44/44 including the owned-empty-process synthetic positive fixture. Retained detailed component review is attached; separate new exploit execution remains pending."
sprint: none
done_when: manual
---

# Prepared Codex Readiness receipt proves process ownership without independent output and control custody

## Description

The prepared Codex tool-free Readiness activation binds a managed process,
request and executable to a private ownership journal, but its durable
Readiness receipt does not independently establish that the process produced
the accepted response, completed the reported session, or applied the claimed
tool-free controls. This is a significant authority-contract gap in the
prepared implementation. A closed owned process is necessary process evidence;
it cannot by itself establish a successful independent Readiness review.

In `scratch/minimal-readiness-activation-6aab/post-7.txt:113`, response and duty
digests are calculated from the returned report. Lines 115–121 construct
freshness and terminal claims, including literal `freshThreadStarted: true`,
`ephemeralRequested: true` and `stdioStatus: 'complete'`. Lines 122–124 then
derive the store's `expected` values from that same record. The structured
host already returns `observed.outputCustody` in `post-6.txt:318–326`, but this
record-construction and store path does not bind or verify it.

The prepared validator (`post-0.txt:18–64`) checks the closed record shape and
required values; the private store (`post-17.txt:89–98`) independently verifies
the intent/bound-process/terminal ownership chain. Neither supplies a durable,
independently reconstructed binding from observed output bytes and session
admission readbacks to the claimed report/control fields. Re-reading an
immutable record twice detects changes to its bytes, but cannot establish the
origin of claims that were unsupported when the record was first written.

The existing positive fixture in `post-8.txt:15–58` makes this boundary concrete:
its managed Node script only drains stdin and exits zero, with no model report.
The fixture creates invented response/duty digests, session IDs, successful
control values and completed-stdio claims, copies them to `expected`, and
expects store write/read acceptance. The complete physical fixture closure's
actual host baseline passed all 44 tests, including this store fixture, as
recorded in `host-tests.evidence.json`. This is labelled synthetic contract data
and does not claim a real model review. It nevertheless demonstrates that the
current positive contract is process ownership plus caller-supplied claims,
rather than independent custody of a review result. A newly executed exploit
through a fresh reader/package path has not yet been recorded and must not be
reported as reproduced until that evidence exists.

## Affected artifact

Prepared activation only: `scratch/minimal-readiness-activation-6aab/manifest.json`
maps the relevant postimages to prospective targets:

- `lib/codex-readiness-host-record.mjs` — `post-0.txt`.
- `lib/codex-isolated-structured-host.mjs` — `post-6.txt`.
- `lib/codex-tool-free-design-readiness.mjs` — `post-7.txt`.
- `lib/codex-design-readiness-host-store.test.mjs` — `post-8.txt`.
- `lib/codex-design-readiness-host-store.mjs` — `post-17.txt`.

All target paths above are relative to `plugins/pipeline-core`. This intake
does not assert that this prepared path is shipped or installed. Activation is
held pending correction; neither a Scratch test nor a draft receipt is a gate
PASS, PO decision or implementation authorization.

## Proposal

Persist host-observed output and control custody in the sanctioned private
journal and bind the Readiness record to it. Preserve distinct observed frame,
raw report and canonical report digests instead of treating one caller-chosen
digest as all three. Bind completion and fresh-session facts to observed
thread/turn lifecycle and admitted configuration/profile/MCP readbacks. Carry
actual terminal and stream completion/error facts through the recorder; missing
or failed custody must remain unavailable and must never become literal
successful fields.

Have store reads and the fresh package verifier reconstruct these bindings from
physical private evidence and independently selected repository/candidate,
route, executable and source context. A returned `expected` object, matching
JSON or model-authored booleans must not substitute for that evidence. Keep raw
report content and credentials private; expose only the necessary sanitized
digest-bound receipt. Do not add provider or OS attestation claims that this
local host path cannot prove.

## Acceptance

- A controlled real child generates a valid previously unknown report through
  the observed protocol; its actual frame/raw bytes, parsed canonical report,
  thread/turn lifecycle, terminal streams and tool-free admission readbacks are
  durably bound to the same registered process and request.
- A fresh independent reader reconstructs the record from the private journal
  without the producer's returned `expected` object, mutable closures or
  model-authored authority. Missing, stale, replaced, malformed, aliased or
  drifted custody/control evidence fails closed on publication and re-read.
- A genuinely owned, cleanly closed Node process that emits no report cannot
  satisfy store publication, `readForBinding`, or the complete design-workflow
  package verifier by supplying invented but shape-valid response digests,
  session IDs, successful controls and complete-stdio fields.
- Tests reject a substituted report, wrong frame/raw/canonical digest, truncated
  or failed stdout/stderr, incomplete turn, inherited/unexpected tools, MCP or
  server requests, absent fresh-thread admission, and control/profile readback
  drift even when ownership and request bindings remain valid.
- The independently selected executable path/hash/file identity, physical
  repository identity, registered route, candidate commit/tree and all five
  committed source paths/bytes remain bound before and after execution and
  fresh re-read. Another valid owned process or matching caller JSON cannot
  supply these facts.
- Exercise the complete productive candidate path through the sanctioned
  Readiness host/store and `readDesignWorkflowPackageFromRepository`, with the
  default execution verification enabled. A genuine review can qualify the
  exact current package; missing/forged custody cannot qualify it. These tests
  and receipts grant neither PO approval nor implementation authority.
- The receipt reader rejects a stat-declared oversize file before allocation;
  concurrent growth is read with an actual 524,288-byte cap plus one overflow
  byte, with before/after FD/path/identity checks. Test this reader itself,
  separately from the already bounded process-journal reader.
- Record targeted test output, exact source/candidate/input hashes and fresh
  reviewer disposition. Close manually only after the correction is integrated
  and the actual relevant candidate path is independently verified.

## Evidence and triage

Confirmed from prepared source callsites and the existing positive fixture
contract, now observed passing at the actual host boundary with the complete
physical fixture closure. `scratch/minimal-readiness-activation-6aab/host-tests.evidence.json`
records 44/44 passes across six suites, exit 0, no models, and
`activationAllowed: false`. Its SHA256 is
`8358c5672116bf8deccc9365c575b0f5be533bbdbc4cf2e8c270ebbf7ffc57dd`.
`scratch/minimal-readiness-activation-6aab/review-summary.md` preserves the held
baseline's scope and blocker; SHA256
`a8547f3363c99814fada0b025328f9c76f663be80fe0219788e702489867840a`.
This is confirmation of the existing positive fixture's acceptance contract,
not a newly executed attack against canonical installed code. The independent
reviewer's detailed report is retained at
`scratch/minimal-readiness-component-review-6aab.md`, SHA256
`9197559f6a5f32fed48f7737420e1128a199d9f3c2f45d49714865127411cbbe`.
A separate new end-to-end exploit execution remains pending; do not upgrade
that pending execution to a reproduced exploit claim. Retain its eventual
exact path/digest at intake commit/reconciliation time.

The same report identifies a related bounded-read issue in the new store:
`checkedFile` uses `readFileSync(fd)` after a size check. Concurrent growth can
allocate beyond the declared cap before the final drift check. The correction
must cap actual allocation and reads at the 524,288-byte limit plus one overflow
byte, with physical FD/path/identity checks. Passing generic journal-reader
tests cannot substitute for this receipt-reader negative.

Frozen prepared manifest SHA256:
`c6e748c0cc36c7d0de6516663c724e972c044f6d4181322faaaf5398cb2b26ec`.
Relevant postimage SHA256 values:

- `post-0.txt`: `96fd7e1471cc93f8bf557314e249dc28636ff950e93dd88b8905ca19770966e2`.
- `post-6.txt`: `d282b305f12859d14ac62e64359e21b03c11a0c3e7884d58347884c703f96861`.
- `post-7.txt`: `9eb157a24887abedfc4e5309de8df4f625b30a6f4261509cbf2b34950c5ec1c1`.
- `post-8.txt`: `1b045cf5af2957840ab834dbebef2f4c23665447c4f3af5c6173c01e9f41b601`.
- `post-17.txt`: `85a3db0d5a78a18a57ba0fb37dfbe46bbadc57eecd3b2d1ecdfaf6623f2c882b`.

`scratch/minimal-readiness-component-review-6aab-audit.json` records the
prepared surface/import audit; its HEAD subprocess returned EPERM, so it does
not independently prove a live HEAD. The separately observed canonical attempt
in `scratch/codex-native-readiness-6aab6da-20260928-attempt.json` returned
`CODEX-READINESS-BOOTSTRAP-FAILED` / `readiness review is not execution-bound`
and published no Readiness receipt. That is a separate observation: this
prepared-code custody gap does not establish the cause of that native failure,
its child/model effects, or a defect in the installed producer.

This open source item records the confirmed prepared-code finding while
candidate `6aab6da07234a50c7c501cd3d2edf3ca4a366a77` remains frozen.
Source commit and canonical ledger/projection reconciliation are pending the
Root's candidate-freeze sequence. Creating this item changes neither shipped
code nor HEAD and claims no completed correction or qualification.
