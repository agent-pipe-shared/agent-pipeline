# ADR-0085 U1–U3 API contract (consistency check, review receipt, approval binding)

Read-only design pass, 2026-10-07 (design-tier model). Sources: [`adr-0085-implementation-plan.md`](adr-0085-implementation-plan.md),
[`po-decisions-2026-10-07.md`](po-decisions-2026-10-07.md) rows I, T–W, `docs/adr/0085-one-review-one-signature-design-approval.md`,
`lib/requirement-traceability.mjs`, `lib/po-gate-authority.mjs`, `lib/design-workflow-approval.mjs`, `lib/plan-spec-state-v2.mjs`,
`lib/po-approval-proof.mjs`, `lib/guard-maintenance-window.mjs`, QG-13. All module paths are under `plugins/pipeline-core/lib/`.
Tests sit next to each module and run alone with `node --test`; verify registration is protected slice P9.

Import rules (keep the P7 kernel list closed): U1 imports only `node:crypto`, `canonical` (`po-approval-proof.mjs`) and
`TECHNICAL_SPEC_MARKER` (`po-gate-authority.mjs`); U2 only `node:crypto` and `canonical`; U3 imports U1, U2 and
`po-approval-proof.mjs`. U1 never imports U2, so U1 ships first.

PO-pending items are marked **[PO-Q1]** / **[PO-Q2]** (see §6); everything else is settled.

## 1. Register (decision W)

`requirement-traceability.mjs` does not parse the Spec: it reads the opt-in sidecar `<spec-dir>/<spec-basename>.requirements.json`
(schema `pipeline.requirement-traceability.v1`, `criteria[]` with `id` matching `/^[A-Z][A-Z0-9]*(?:-[A-Z0-9]+){1,7}$/`, ≤ 80 chars,
unique, ≤ 64 entries, each with a `path-exists` / `file-contains-literal` predicate). Absent sidecar → `mode: "undeclared"`;
errors throw `RequirementTraceabilityError` (`RT-*`). No current Spec has a sidecar; the Alfred register (77 lowercase `K1-x` IDs)
cannot be expressed under that schema.

- **Register side:** the sidecar's `criteria[].id` set, obtained only through `evaluateRequirementTraceability(...)` (caller runs it on
  HEAD). Adapter `registerFromRequirementTraceability(resultOrError, mapPath)`:
  declared → `{ mode: "declared", mapPath, ids }`; undeclared → `{ mode: "undeclared", mapPath }`;
  caught `RequirementTraceabilityError` → `{ mode: "invalid", mapPath, rtCode }`. Predicate status is ignored.
- **Traceability side:** `<dirname(specPath)>/traceability.md`, parsed by pure `parseTraceabilityIds(text)`: UTF-8; split on `/\r?\n/`;
  a line whose trimmed start is ```` ``` ```` or `~~~` toggles a fence (fenced lines skipped); a table row is a line whose trim starts
  with `|`; its first cell (between the first and second `|`, trimmed, one surrounding backtick pair removed) is collected if it fully
  matches the ID pattern and is ≤ 80 chars; document order, duplicates kept.
- **Reconciliation (declared only):** an ID more than once in T → `DCC-ID-DUPLICATE`; R∖set(T) or set(T)∖R → `DCC-COUNT-MISMATCH`.
- **Undeclared [PO-Q1]:** option A — skipped, visible as `register.mode: "undeclared"`, no code; option B — `DCC-REGISTER-UNDECLARED`.
- **Invalid:** one `DCC-REGISTER-INVALID`; no count/duplicate checks.

## 2. U1 — `design-consistency-check.mjs`

```
export const DESIGN_CONSISTENCY_CHECK_SCHEMA = "pipeline.design-consistency-check.v1";
export const DESIGN_CONSISTENCY_CODES;            // frozen array, table order below
export class DesignConsistencyCheckError extends Error { code /* always "DCC-INPUT" */ }
export function checkDesignConsistency(input) -> Result
export function registerFromRequirementTraceability(resultOrError, mapPath) -> RegisterInput
export function parseTraceabilityIds(text) -> string[]
export function currentDesignSources({ submission, prdBytes, specBytes, companions, pathStates }) -> SourceSet
export function reviewChainInconsistencies({ featureId, receipts, currentSources }) -> Entry[]   // single implementation; U3 imports it
```

**SafePath:** string 1–240 chars, equal to its trim; no `\`, no `\0`; not starting with `/`; not matching `/^[A-Za-z]:/`; not ending
with `/`; no empty, `.` or `..` segment.

**SourceSet:** `{ "prd": { "path", "sha256" }, "spec": { "path", "sha256" }, "companions": [ { "path", "sha256" | null } ] }` —
companions sorted by path (code-unit), unique, 0–64, never the PRD/Spec path; equality = `canonical(a) === canonical(b)`; `null`
sha256 only inside a current SourceSet for an absent file.

**ReceiptSummary** (from U2 `summarizeDesignReviewReceipt`, closed keys): `{ "path", "sha256", "featureId", "kind": "initial"|"delta",
"round": 1|2, "previousReceiptPath": SafePath|null, "previousReceiptSha256": hex64|null, "sources": SourceSet,
"report": { "path", "sha256" }, "verdict": "pass"|"open-findings", "openFindingIds": string[] }`. A refusal stub
`{ "path", "refusal": "DRR-..." }` may stand in its place.

**Input** (pure data, no fs/git):

```
{ submission: { featureId, planPath, planSha256, specPath, specSha256 },
  prdBytes: Uint8Array, specBytes: Uint8Array,
  companions: SafePath[],
  traceability: { path, bytes } | null,
  register: { mode: "declared", mapPath, ids } | { mode: "undeclared", mapPath } | { mode: "invalid", mapPath, rtCode },
  pathStates: [ { path, tracked, modified, ignored, regular, sha256: hex64|null } ],
  reviewReceipts: null | Array<ReceiptSummary | { path, refusal }> }
```

`modified` = worktree or index differs from HEAD; `ignored` = untracked and matches an ignore rule; `regular: false` = symlink,
gitlink, directory or other non-regular entry; `sha256` = current worktree bytes or `null` if absent. **Bound paths:** planPath,
specPath, every companion, every receipt path, every valid summary's `report.path`.

**Thrown `DCC-INPUT`** (caller error, never an inconsistency): missing/wrong-typed field or unknown top-level key; duplicate companions
or companions containing planPath/specPath; `pathStates` not exactly one entry per bound path; `tracked && ignored`;
`pathStates` sha256 for planPath/specPath/traceability.path ≠ sha256 of the supplied bytes; summary `sha256` ≠ its pathStates sha256;
`register.mode !== "undeclared"` with `traceability: null`; `traceability.path` ≠ `<dirname(specPath)>/traceability.md`;
`register.ids` breaking the pattern, not unique or > 64; a ReceiptSummary breaking its invariants (closed keys; initial ⇔ round 1 ⇔
both previous null; delta ⇔ round 2 ⇔ both non-null).

**Result** (closed keys):

```
{ "schema": "pipeline.design-consistency-check.v1", "ok": boolean, "featureId": string, "sources": SourceSet,
  "register": { "mode", "mapPath", "registerCount": int|null, "traceabilityCount": int|null },   // counts only when declared; traceabilityCount counts duplicates
  "review": null | { "rounds", "latestReceiptSha256", "verdict", "openFindingIds" },             // only when review clauses and report drift produced no entry
  "inconsistencies": [ Entry ] }
```

**Entry** keys exactly `{ "code", "path", "ids", "expected", "observed" }` (`path` SafePath|null; `ids` sorted array, `[]` if n/a;
`expected`/`observed` string|null). No message/prose/finding field.

| # | Code | Trigger | Entry |
|---|---|---|---|
| 1 | `DCC-PATH-UNSAFE` | bound path fails SafePath, or `regular: false`; suppresses 2–4 for that path | path |
| 2 | `DCC-PATH-IGNORED` | `ignored`; suppresses 3–4 | path |
| 3 | `DCC-PATH-UNTRACKED` | `tracked: false` (absent included); suppresses 4 | path |
| 4 | `DCC-PATH-MODIFIED` | `tracked && modified` | path |
| 5 | `DCC-PRD-DIGEST-DRIFT` | `sha256(prdBytes) !== submission.planSha256` | path=planPath, expected, observed |
| 6 | `DCC-SPEC-DIGEST-DRIFT` | `sha256(specBytes) !== submission.specSha256` | path=specPath, expected, observed |
| 7 | `DCC-PRD-MARKER-MISSING` | zero `TECHNICAL_SPEC_MARKER` matches (`matchAll` on UTF-8 PRD text) | path=planPath |
| 8 | `DCC-PRD-MARKER-DUPLICATE` | ≥ 2 matches | path=planPath, observed=String(count) |
| 9 | `DCC-PRD-MARKER-STALE` | exactly one match, digest ≠ `sha256(specBytes)` | path=planPath, expected, observed |
| 10 | `DCC-COMPANION-UNBOUND` | `traceability.path`, or `register.mapPath` when not undeclared, not in companions | path |
| 11 | `DCC-REGISTER-INVALID` | `register.mode === "invalid"`; skips 12–13 | path=mapPath, observed=rtCode |
| 11a | `DCC-REGISTER-UNDECLARED` | **[PO-Q1] option B only**: `register.mode === "undeclared"` | path=mapPath |
| 12 | `DCC-ID-DUPLICATE` | declared: an ID ≥ 2 times in `parseTraceabilityIds` | path=traceability.path, ids |
| 13 | `DCC-COUNT-MISMATCH` | declared: (a) R∖set(T) → path=traceability.path, ids; (b) set(T)∖R → path=mapPath, ids | path, ids |
| 14 | `DCC-REVIEW-RECEIPT-MISSING` | `reviewReceipts` null or `[]` | — |
| 15 | `DCC-REVIEW-RECEIPT-BINDING` | review clauses | path, expected, observed |
| 16 | `DCC-REVIEW-ROUND-EXCEEDED` | `reviewReceipts.length > 2` | observed=String(length) |
| 17 | `DCC-REVIEW-DELTA-CHAIN` | review clauses | path, expected, observed |

Marker regex is line-anchored (`gmu`) and used as is (parity with po-gate-authority; pinned). Correction 2026-10-07 (U1-T
finding): JavaScript treats `\r` as a line terminator in multiline mode, so a CRLF PRD matches exactly once — the earlier
"CRLF yields MISSING" sentence was wrong; the test pins parity with the real regex, not a CRLF refusal.

**Review clauses** (`reviewChainInconsistencies`, in order): (1) receipts null/`[]` → MISSING, stop. (2) each refusal stub → BINDING
(path=stub.path, observed=stub.refusal); any stub → stop. (3) summary `featureId` ≠ featureId → BINDING (expected/observed).
(4) > 2 receipts → ROUND-EXCEEDED, stop. (5) chain (index 0 oldest): `[0].kind !== "initial"` → DELTA-CHAIN (path=[0].path); if `[1]`
exists and (`[1].kind !== "delta"` or `[1].previousReceiptSha256 !== [0].sha256` or `[1].previousReceiptPath !== [0].path` or prd/spec
path differs) → DELTA-CHAIN (path=[1].path, expected=[0].sha256, observed=[1].previousReceiptSha256); if `[1]` sources canonically equal
`[0]` sources → DELTA-CHAIN (nulls). (6) source drift: `canonical(latest.sources) !== canonical(currentSources)` → BINDING
(path=latest.path, expected=sha256(canonical(current)), observed=sha256(canonical(latest.sources))) **[PO-Q2]**. Plus, in
`checkDesignConsistency` only, report drift: `pathStates[report.path].sha256 !== summary.report.sha256` → BINDING (path=report.path).

**Determinism:** all clauses run (except review "stop" points); sort by code index, then path (null first, code-unit), then
`ids.join(",")`; ids sorted; no timestamps; independent of input order; same input → deep-equal result.

## 3. U2 — `design-review-receipt.mjs`

```
export const DESIGN_REVIEW_RECEIPT_SCHEMA = "pipeline.design-review-receipt.v1";
export const DESIGN_REVIEW_MAX_ROUNDS = 2;
export const DESIGN_REVIEW_RECEIPT_MAX_BYTES = 65536;
export function createDesignReviewReceipt({ featureId, previous, sources, reviewer, report, openFindingIds, reviewedAt })
  -> { ok: true, receipt, bytes, sha256 } | { ok: false, code }
export function parseDesignReviewReceipt(bytes) -> { ok: true, receipt, sha256 } | { ok: false, code }
export function summarizeDesignReviewReceipt({ path, bytes }) -> { ok: true, summary } | { ok: false, code }
export function checkDesignReviewReceiptSources({ summary, currentSources }) -> { ok: true } | { ok: false, code: "DRR-SOURCE-DRIFT", nextRound: 2 | null }
```

Receipt (closed keys; extra key → `DRR-SHAPE`): `schema`; `featureId` `^[a-z][a-z0-9-]{0,63}$`; `kind` initial|delta; `round` 1|2;
`previousReceiptPath` null|SafePath; `previousReceiptSha256` null|hex64; `sources` SourceSet (no null sha256); `reviewer`
`{ runner: ^[a-z][a-z0-9-]{0,63}$, model: ^[A-Za-z0-9][A-Za-z0-9._:\[\]-]{0,127}$ }`; `report` `{ path, sha256 }`; `verdict`
pass|open-findings; `openFindingIds` (ID pattern, ≤ 80 chars, sorted, unique, 0–64); `reviewedAt` (`new Date(x).toISOString() === x`).
Invariants: initial ⇔ round 1 ⇔ previous null; delta ⇔ round 2 ⇔ previous non-null; `pass` ⇔ `openFindingIds: []` (decision U; the
list is the complete open set after this round); `report.path` ≠ PRD, Spec, any companion, previousReceiptPath. No dispatch, course,
authoring or candidate field. Bytes are exactly `canonical(receipt) + "\n"`; receipt sha256 = sha256(file bytes).

Create: sorts IDs and companions, rejects duplicates, derives `verdict`. `previous: null` → initial. `previous: { path, bytes }`:
unparseable → `DRR-DELTA-CHAIN`; previous round 2 → `DRR-ROUND-EXCEEDED`; featureId/prd path/spec path differ → `DRR-DELTA-CHAIN`;
identical sources → `DRR-DELTA-UNCHANGED`; else delta round 2 with previous path and sha256(previous.bytes).
Summary = `{ path, sha256 }` + every receipt field except `schema`, `reviewer`, `reviewedAt`.
Source drift: canonical sources differ → `DRR-SOURCE-DRIFT`, `nextRound` 2 after an initial, `null` after a delta **[PO-Q2]**.

Refusal codes, checked in this order: `DRR-SIZE` (0 or > 65536 bytes), `DRR-JSON`, `DRR-NONCANONICAL`, `DRR-SHAPE`, `DRR-PATH`
(SafePath or report-path collision), `DRR-SOURCES` (companions unsorted/duplicated/> 64/overlapping prd or spec; prd = spec),
`DRR-FINDING-IDS`, `DRR-VERDICT`, `DRR-KIND-ROUND`, `DRR-ROUND-EXCEEDED` (round > 2 at parse; delta on delta), `DRR-DELTA-CHAIN`,
`DRR-DELTA-UNCHANGED`, `DRR-SOURCE-DRIFT`.

## 4. U3 — `design-approval-binding.mjs`

```
export const DESIGN_APPROVAL_BINDING_SCHEMA = "pipeline.design-approval-binding.v1";
export const DESIGN_APPROVAL_REQUEST_SCHEMA = "pipeline.design-approval-request.v1";
export const DESIGN_APPROVAL_RECORD_SCHEMA  = "pipeline.design-approval.v1";     // reserved for P1
export const DESIGN_APPROVAL_INTENT_KIND    = "design-approval";
export const DESIGN_APPROVAL_POLICY_REVISION = "design-approval-v1";
export function createDesignApprovalBinding({ featureId, receipts /* [{path, bytes}] chain order */, currentSources }) -> { ok: true, binding, bindingSha256 } | Refusal
export function validateDesignApprovalBinding(binding) -> { ok: true, bindingSha256 } | Refusal
export function createDesignApprovalRequest({ binding, candidate }) -> { ok: true, request, intentSha256 } | Refusal
export function verifyDesignApprovalRequest({ request, featureId, receipts, currentSources }) -> { ok: true, bindingSha256, intentSha256, candidate, verdict, openFindingIds } | Refusal
export function classifyDesignApprovalIntent(intent) -> "design-approval" | "legacy-design-workflow-package" | "unknown"
export function classifyDesignApprovalRecord(record) -> "design-approval" | "legacy-design-workflow-package" | "invalid" | "unknown"
```

Refusal = `{ ok: false, code, causes: string[] }` (sorted; `[]` unless stated). Binding (closed keys): `schema`, `featureId`,
`sources` (latest receipt's = current; no null sha256), `reviewReceipts` `[{ path, sha256, round }]` (1–2, ascending round), `verdict`,
`openFindingIds` (latest receipt, exactly). No dispatch ids, course id, `packageSha256`, `advisorException` or candidate (the candidate
lives in the intent). `bindingSha256 = sha256(utf8(canonical(binding)))` with `canonical` from `po-approval-proof.mjs` (not
`plan-spec-state-v2` `canonicalJson`).

Create: (1) summarize each receipt (U2) — refusal → `DAB-RECEIPT` (causes = DRR codes); (2) `reviewChainInconsistencies` (U1) — any entry
→ `DAB-REVIEW-CHAIN` (causes = unique DCC codes); (3) build from the latest summary; (4) validate — failure → `DAB-SHAPE`.
Request (closed keys): `{ schema, binding, bindingSha256, approvalIntent: { value, sha256 } }`, intent only via
`createPoApprovalIntent({ kind: "design-approval", featureId, planSha256: sources.prd.sha256, specSha256: sources.spec.sha256,
candidate, policyRevision: "design-approval-v1", subjectSha256: bindingSha256, decision: "approve" })`; a thrown TypeError → `DAB-INTENT`.
Verify (first failure wins): (1) request keys or binding invalid → `DAB-SHAPE`; (2) intent classifier: legacy → `DAB-LEGACY-KIND`
(remedy: `DWP2-LEGACY-APPROVED-REREAD`, decision T), unknown → `DAB-KIND`; (3) featureId mismatch → `DAB-REVIEW-CHAIN`
(`["DCC-REVIEW-RECEIPT-BINDING"]`); (4) recompute binding (refusal passed through); (5) canonical/sha mismatch → `DAB-BINDING-DRIFT`;
(6) recompute intent with the request's candidate: difference → `DAB-INTENT-DRIFT`, throw → `DAB-INTENT`. Candidate-vs-HEAD and
signature checks belong to P1/P3.

Legacy distinction: intent `kind: "design-workflow-package"` with policyRevision `design-workflow-package-v1|-v2` → legacy;
`kind: "design-approval"` + `design-approval-v1` + schema `pipeline.po-approval-intent.v1` → new; else unknown. Request schema
`pipeline.design-approval-request.v1` vs `pipeline.design-workflow-package-approval-request.v1`. Record schema
`pipeline.design-approval.v1` (P1 keys: `schema, mode: "signature", approvedBy, approvedAt, bindingSha256, intentSha256, proofSha256,
proof`; no chat mode) vs `pipeline.design-workflow-package-approval.v1`; a new-schema record carrying `packageSha256` or
`advisorException` → `"invalid"`.

## 5. Test matrix

Shared fixture F: featureId `feat-x`; PRD `specs/feat-x/prd_feat-x.md` with exactly one correct marker; Spec `specs/feat-x/spec.md`;
companions `specs/feat-x/design.md`, `specs/feat-x/spec.requirements.json`, `specs/feat-x/traceability.md`; register declared
`["AC-ONE","AC-THREE","AC-TWO"]`, one traceability row per ID; all pathStates tracked/clean/regular with correct digests; one initial
PASS summary bound to current sources, report `specs/feat-x/review/design-review-1.md`; submission digests = byte digests.

**U1** (`design-consistency-check.test.mjs`): 1 consistent fixture → ok, counts 3/3, review filled. 2 marker missing → only MISSING.
3 two markers → only DUPLICATE observed "2". 4 stale marker → only STALE. 5 marker regex parity with `TECHNICAL_SPEC_MARKER`; CRLF PRD →
MISSING. 6 PRD digest drift. 7 Spec digest drift. 8 `AC-TWO` row removed → COUNT-MISMATCH path=traceability ids `["AC-TWO"]`, count 2.
9 extra `AC-FOUR` row → COUNT-MISMATCH path=sidecar ids `["AC-FOUR"]`. 10 `AC-ONE` twice → only ID-DUPLICATE, count 4. 11 parser:
backticked ID, header/separator rows, fenced row, `K1-x` row, prose cell → only the valid IDs in order. 12 undeclared register →
**[PO-Q1]** A: ok, mode undeclared, counts null; B: exactly `[DCC-REGISTER-UNDECLARED]`. 13 invalid register → only REGISTER-INVALID
observed `"RT-MAP-SPEC-DIGEST"`. 14 adapter: declared, undeclared, error → the three shapes. 15 traceability not in companions →
COMPANION-UNBOUND. 16 five extra companions (untracked; modified; ignored; non-regular; `specs/feat-x/../x.md` untracked) → UNSAFE ×2,
IGNORED, UNTRACKED, MODIFIED, sorted; unsafe path has no UNTRACKED. 17 `reviewReceipts: null` → exactly MISSING, review null.
18 three summaries → ROUND-EXCEEDED "3", no DELTA-CHAIN. 19 chain/binding: (a) wrong previous sha → DELTA-CHAIN; (b) delta sources equal
initial → DELTA-CHAIN nulls; (c) latest bound to old design.md digest → BINDING with canonical-set digests; (d) report bytes changed →
BINDING path=report; (e) refusal stub → only BINDING observed `"DRR-NONCANONICAL"`. 20 determinism under shuffled inputs; exact result
and Entry key sets; `DCC-INPUT` throws (missing Spec pathState; tracked&&ignored; PRD sha ≠ bytes).

**U2** (`design-review-receipt.test.mjs`): 1 create initial PASS (bytes = canonical+"\n", sha). 2 IDs sorted / duplicates →
DRR-FINDING-IDS. 3 parse round-trip. 4 pretty-printed → DRR-NONCANONICAL. 5 extra `dispatchId` / missing reviewer → DRR-SHAPE.
6 verdict mismatch both ways → DRR-VERDICT. 7 lowercase / unsorted / 65 IDs → DRR-FINDING-IDS. 8 backslash companion, `../r.md` report,
`C:/x` spec, report = design.md → DRR-PATH. 9 companions unsorted / duplicated / containing spec → DRR-SOURCES. 10 initial with previous,
delta with round 1 → DRR-KIND-ROUND; round 3 → DRR-ROUND-EXCEEDED. 11 create delta (spec sha changed, `["F-3"]`). 12 delta with identical
sources → DRR-DELTA-UNCHANGED. 13 delta on delta → DRR-ROUND-EXCEEDED. 14 previous with other featureId / other prd path / unparseable →
DRR-DELTA-CHAIN. 15 source check: equal ok; drift after initial nextRound 2; after delta nextRound null **[PO-Q2]**. 16 empty / 65537
bytes → DRR-SIZE; `{` → DRR-JSON. 17 `featureId: "Feat_X"`, non-toISOString `reviewedAt` → DRR-SHAPE. 18 summary exact key set and sha.

**U3** (`design-approval-binding.test.mjs`): 1 binding from initial PASS. 2 initial + delta with `["F-3"]` → open-findings, two entries.
3 `bindingSha256 = sha256(canonical(binding))`, key-order independent. 4 binding + `authoringDispatchId` / `courseId` /
`packageSha256` → DAB-SHAPE. 5 pretty-printed receipt → DAB-RECEIPT `["DRR-NONCANONICAL"]`. 6 changed design.md digest →
DAB-REVIEW-CHAIN `["DCC-REVIEW-RECEIPT-BINDING"]` **[PO-Q2]**. 7 `[]` / three receipts → causes MISSING / ROUND-EXCEEDED. 8 featureId
`feat-y` → DAB-REVIEW-CHAIN. 9 request and exact intent value; `intentSha256` = `createPoApprovalIntent(...).sha256`. 10 commit = tree /
39-hex commit → DAB-INTENT. 11 verify happy path. 12 emptied `openFindingIds` (sha recomputed) → DAB-BINDING-DRIFT. 13 altered
`bindingSha256` → DAB-BINDING-DRIFT. 14 intent `decision: "reject"` / altered `subjectSha256` → DAB-INTENT-DRIFT. 15 legacy intent →
DAB-LEGACY-KIND; kind `other` → DAB-KIND. 16 intent classifier (new, legacy v1, legacy v2, wrong policy). 17 record classifier (new,
legacy, new + `packageSha256`, new + `advisorException`, other). 18 request + `advisorException` / without `bindingSha256` → DAB-SHAPE.

## 6. PO answers (2026-10-07)

- **PO-Q1 → option A** (decision Y): sidecar optional; undeclared is a visible skip; `DCC-REGISTER-UNDECLARED` is NOT added (U1 test 12
  pins option A).
- **PO-Q2 → option b** (decision Z). Contract changes: in review clause (6), when the latest receipt is a delta (round 2), a source
  drift produces NO entry; instead `result.review.unreviewedSourceDelta` = `[{ path, reviewedSha256, currentSha256 }]` sorted by path
  (paths whose digest differs between the latest receipt's sources and the current sources; an absent current file has
  `currentSha256: null`), and `ok` stays true; when there is no drift the key is `[]`. After an initial receipt, drift stays
  `DCC-REVIEW-RECEIPT-BINDING`. `result.review` gains that key (always present when `review` is non-null). U2 is unchanged
  (`nextRound: null` after a delta). U3: `reviewChainInconsistencies` follows the same rule; the binding's `sources` are the CURRENT
  sources and the binding gains the optional key `unreviewedSourceDelta` (present only when non-empty, same shape, sorted); a binding
  with that key whose latest receipt is round 1 is invalid (`DAB-SHAPE`). Extra tests: U1 19(f) delta + drift → ok, delta listed;
  U1 19(g) initial + drift → BINDING (as 19c); U3 6b delta + drift → binding carries `unreviewedSourceDelta`; U3 6c that key with a
  round-1 latest receipt → DAB-SHAPE.

## 7. Original PO questions (resolved above)

- **[PO-Q1]** Decision W cannot be implemented exactly as worded (the module reads an opt-in sidecar, not the Spec). A (recommended):
  the sidecar's IDs are the register; undeclared is a visible skip. B: the sidecar is mandatory (`DCC-REGISTER-UNDECLARED`).
- **[PO-Q2]** Sources changed after the round-2 (delta) review: (a) hard stop; (b, recommended) the PO may sign knowingly over the
  unreviewed change — the binding gains optional `unreviewedSourceDelta: [{ path, reviewedSha256, currentSha256 }]` and U1 reports it as
  a visible state only when the latest receipt is round 2; (c) a third review round with PO consent (contradicts QG-13).

Dispatcher assumptions: bound companions = the latest receipt's `sources.companions` (no hard-coded names); featureId pattern as
`createPoApprovalIntent`; `DCC-COMPANION-UNBOUND` and `DCC-REGISTER-INVALID` are additions to the plan's code list; `DCC-INPUT` only
on a thrown caller error.
