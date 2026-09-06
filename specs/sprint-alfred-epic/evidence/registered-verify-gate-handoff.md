# Alfred registered Verify and gate handoff

Status on 2026-09-06: Full Verify passed after the approved exact scanner
exception. Independent T1 Critic review remains pending; the installed transport
repair has a confirmed installed-layout path failure. This document preserves
the result and routes the remaining work; it grants no repair authority,
exception approval, acceptance or feature close.

## Frozen candidate and completed registration

The registered run of `node harness/scripts/verify.mjs` is bound exactly to
commit `e23ff27e9fd318cbf4fd38c70ef8f61e5eec3340` and tree
`85002d1a60669d137bbf6178c3237633ef7753f4`. Its start and finish each report
`status: clean`, that same commit and tree, and `binding: exact`.
`evidence/alfred-registered-verify-summary.log` captures the machine evidence
summary: Full Verify exit **2**, **508 steps**, **507 green**, with only
`security-scan` exiting **2**. The summary extraction itself exits 0; that is
not a green Verify result. These results cover this frozen source candidate
only, not the later documentation commit containing this handoff.

[A1/C1 registration evidence](a1-registration-preparation.md) records that
commit `0a86cbdcb315ffff55e8788b420af16788b7a8b8` registered both suites and
their exact capability surfaces together under the signed TP-3 maintenance
window. Registration already succeeded. The sanctioned GMW close appended
the human revocation audit and returned an absent window; no maintenance lift
remains active. That earlier checkpoint's pending-Verify/normal-continuation
wording predates the results and blockers recorded here.

## Gate 1: exact scanner exception applied, candidate-bound Full Verify passed

The scanner reports `generic-api-key` at line **1**, column **1030**, in
`governance/events/human/14-evt-gmw-revoke-3de0bdca05a90ca795ac7696f4717abe-0.json`.
The matched value has **45 characters**. The read-only diagnostic captured in
`evidence/alfred-gmw-close-secret-diagnostic.log` exits 0 and verifies that
the match equals the producer-derived public revoke identifier, the event's
`payload.decisionId`, and its `idempotencyKey`.

The producer is
[`guard-authority-ledger-intake.mjs`](../../../plugins/pipeline-core/lib/guard-authority-ledger-intake.mjs),
lines 148–164: `i32 = intentSha256.slice(0, 32)` and the generation-bearing
formula is `${producer}-${kind}-${i32}-${generation}`.
`revokeDecisionId` selects kind `revoke`; producer defaults to `gmw` and this
event uses generation `0`. Thus `gmw-revoke-` + 32 public digest characters +
`-0` accounts for all 45 characters. This is a deterministic public audit ID,
not a private key. The historical scanner finding remains confirmed. The
authorized exact exception is now applied. The successful retry below supersedes
the old failure for its own exact candidate; the historical failed run remains
unchanged.

The PO explicitly approved a single exception in `.gitleaksignore` on
2026-09-06, bound to
the recognized content fingerprint, exact event path, rule, line and column.
`evidence/alfred-gmw-close-exception-proposal.log` exits 0 as a diagnostic and
reports the historical `proposal-not-applied` / `pending-human-decision`
status. That proposal predates the PO approval and application; its exact
authority line, now appended to `.gitleaksignore`, is:

```text
content-v1:88cc8879a89d4c3eec339244937908aee063293e59485562fd4a688130cc5944:governance/events/human/14-evt-gmw-revoke-3de0bdca05a90ca795ac7696f4717abe-0.json:generic-api-key:1:1030
```

The proposal binds event SHA-256
`5feee6b0930cc93ba9ea652aaec1c64e9434e6b8a3562c88ee3ff99f375231d4` and original
`.gitleaksignore` SHA-256
`3d45889c584908a4bf769561b25518715a710e532f0162969f89ac101e68810c`.
Both bindings were rechecked before application. The prior ignore bytes were
preserved and exactly this authority line plus its short rationale comment
were appended. The PO approval covers this content/path/rule/position-bound
exception only; it grants no path-wide or rule-wide exemption and changes no
scanner rule, threshold or governance event. Independent T1 Critic review is
still missing; the exception is unreviewed.

The retry's machine evidence, `evidence/alfred-exact-exception-verify.json`,
records exit **0**, **508 steps**, no failing steps, and exact clean start/finish
bindings to commit `ca886b926e6d902a8501e14996ba6213d9371aab`, tree
`d0b9c4ad67c5b8aba0720694dc09be1cae59a572`. Its file SHA-256 is
`948aa94f1a7dc3b01935f338405764b7b16d96f928ecb26db8ca49c162cf2e9c`.
`evidence/alfred-exact-exception-security.json` independently records exit 0
against that same clean candidate; its file SHA-256 is
`ed209f4890321f04a108ed98b98daebb01650b59c311351db48c98d3c6fd66d6`.
These results do not cover subsequent handoff edits or substitute for review.

## Gate 2: source-supported Critic transport gap

`evidence/dispatch-record-ALF-CRITIC-TRANSPORT-READINESS.json` is bounded source
discovery, not a live transport receipt. It found a JSON-lines
`execution.launch` producer and `execution.result` reader in
[`codex-critic-host.mjs`](../../../plugins/pipeline-core/scripts/codex-critic-host.mjs),
lines 125–184, with the `selected --input <json>` CLI wired at lines 1790–1835.
The bridge emits the selection, requested route, references, profile and
scratch binding, waits for a matching response, and returns that response's
execution object. This seam does not itself launch the Critic.

At that earlier discovery checkpoint, no production consumer was found that
consumes that selected launch request and launches the actual Critic. This is a source-supported transport
gap, not a claimed live `host-mode-unavailable` result. No selected Critic
started and no live selected transport receipt was obtained. Source tests and
caller-supplied receipt-shaped values do not establish actual execution.

### Installed repair inspection, 2026-09-06

The current installed `0.6.1` distribution now includes
`scripts/codex-critic-selected-host.mjs`, `scripts/codex-critic-app-server.mjs`
and `scripts/codex-critic-app-server-child.mjs`. The first exports
`runSelectedCriticHost`, composing an in-process launch/finalize bridge with
the selected sandbox transport. The adapter builds the sandbox invocation and
spawns the child; the child starts a fresh App-Server Critic turn. This changes
the earlier source finding: a consumer implementation is now present. It does
not establish a successful live review or validate the whole repair.

The installed adapter bytes have SHA-256
`5e60295bfd6ed7d92e95759fdaf15b479599b54b780e309a536447647b081ed0`.
In those bytes, `PIPELINE_ROOT = resolve(HERE, "..", "..", "..")` assumes a
source-checkout layout. From an installed plugin's `scripts/` directory this
resolves two levels above the plugin root. Read-only existence checks found
all three computed targets absent: `roles/critic.md`,
`templates/prompts/critic-review.md`, and
`plugins/pipeline-core/scripts/critic-verdict.schema.json`.
`physicalRulesetFile()` calls `lstatSync` on those targets before the spawn;
therefore this installed invocation cannot reach the child as written.

The other Elephant owns the Pipeline repair, per the PO's explicit boundary.
Required follow-up: resolve canonical references for both source and installed
layouts, add installed-layout regression coverage, and demonstrate an actual
selected Critic run with matching execution and duty receipts. No local repair,
cache mutation, alternate runner bypass or review-success claim is authorized
by this handoff. Inspection did not launch a Critic.

The installed `pipeline-core:critic-review` skill requires a bounded
`codex-app-server-health.mjs --critic-ready` model-start check before selection;
health admission alone proves only local model admission. It cannot substitute
for selected transport readiness or execution evidence. Packet admission is
also insufficient: `packet-ready` carries `spawnAuthorized: false`.

Proposed downstream owner: the pipeline-core Codex Critic host adapter
maintainer, coordinated by the Alfred Elephant. This is an owner/routing
proposal only; it gives no authority to change Nova, plugin code or guards.
A separately authorized adapter package must satisfy all of these criteria:

1. Consume the selected `execution.launch` request and launch the actual Critic
   under the selected sandbox, bound executable and exact sandbox-state/profile
   and coordinator scratch bindings. A model admission probe is insufficient.
2. Supply one fresh independent Critic with refs-only input, a fixed candidate
   commit/tree and diff, declared guardrail/evidence references, no chat history
   or implementor reasoning, and the required read-only review contract and T1
   route. Produce the required structured verdict.
3. Observe real execution, termination and cleanup; return matching
   `execution.result` evidence in `pipeline.codex-sandbox-execution-receipt.v1`,
   bound to selection, dispatch/request and requested route. Successful terminal
   evidence must reflect `childStarted: true`, `exitCode: 0`, complete stdio
   and complete cleanup, with a bound `pipeline.critic-receipt.v1` duty receipt
   hash and `status: reviewed`. Receipt fields must describe observed work.
4. Preserve the exact assurance
   `sandbox-read-only-except-coordinator-scratch; input/network isolation not asserted`.
   Fail closed on unavailable or mismatched transport/evidence; never use generic
   `codex exec` as a fallback or substitute the advisory payload for Critic duty.

## Continuation and limits

The exact exception has PO approval, is applied, and its frozen candidate has
green Full Verify as recorded above. Later changes need their own applicable
candidate-bound verification. Critic work waits for usable selected adapter
availability, green deterministic gates, and fresh candidate-bound readiness;
it then needs the actual independent T1 review. No new signature ceremony is
requested automatically by this handoff.

Per [Alfred Spec](../spec.md) §§4.1, 6.1, 12–13, native A1 observations,
C1 emission/aggregation and the measured 14-day baseline remain outstanding.
Registration and this historical Verify run do not complete A1, C1, Wave 0 or
the epic. Alfred remains implementing and PO acceptance is open; no feature
close is performed.

This tracked handoff follows
[ADR-0063](../../../docs/adr/0063-repository-directory-contract.md).
Root `evidence/` logs and dispatch records are ignored machine artifacts,
available in this checkout and subject to regeneration; this file durably
preserves their bounded findings. Documentation validation belongs to
`evidence/alfred-gate-handoff-*.log` and
`evidence/dispatch-record-ALF-VERIFY-GATE-HANDOFF.json`; it establishes neither
a new Full Verify result nor a Critic verdict.
