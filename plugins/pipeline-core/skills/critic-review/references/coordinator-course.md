# critic-review — Coordinator reference (moved verbatim from SKILL.md)

Loaded by the Coordinator (the Elephant that dispatches a Critic review) at the conditions `SKILL.md` names beside its pointers. A dispatched Critic never needs this file.
Every block below is the original text of the skill body, moved byte for byte (no rewording, no reordering inside a block); the comment line above each block names its place in the parent commit.

## A. Batch course and call site (opening paragraphs)

<!-- moved verbatim from the SKILL.md body of the parent commit, lines 14-27 -->
**Prospective batch course (PO-selected 2026-10-11):** the Elephant predeclares a meaningful delivery batch and review unit before the first item dispatch. After integration it freezes actual members and integrated scope before the full review; item completion does not automatically trigger a Critic. Each batch permits one full independent Critic review and correction-diff reviews until genuine PASS or an explicit PO decision (D190: no round or correction-commit count refuses a correction-diff review on its own); no full-review rerun is permitted. Each correction review starts at the exact immediately previous reviewed candidate and covers only the correction plus direct regressions. The original batch and continuous receipt/finding lineage cannot be reset by renaming, candidate/task/record/session changes, restarts or splitting. If corrections are needed, one fresh Correction Goldfish owns findings, tests, fixes and targeted checks for the coherent batch through the allowed delta reviews; do not dispatch a separate fix per item. Historical receipts remain readable but do not authorize another course. Source/runtime registration and admission must bind to this contract before enforcement is claimed. The documentation Reader keeps its separate two-plus-one budget.

The normal call site dispatches one fresh session Critic after the applicable
deterministic Critic-boundary checks and packet preflight pass. A passing
candidate-bound `--mode critic` Verify receipt may use impact selection; a
validated Critic diagnostic may instead disclose targeted failures and a
still-pending full Verify. Neither is a full release qualification. The full
`--mode release` Verify follows the first substantive Critic review and binds
its consumed packet; an unchanged deterministic rerun may use only the exact
content-bound Critic/Verify lifecycle receipt. It does not launch an external process, export
a separately assembled packet, or ask the PO for an additional review decision.
Runner-native hosts and external launchers remain available only when project
policy explicitly configures them or the user requests stronger or detached
execution. Their unavailability never invalidates the ordinary session route.

## B. Handing the briefing over (Elephant)

<!-- moved verbatim from the SKILL.md body of the parent commit, lines 60-67 -->
**Handing the briefing over (Elephant):** `scripts/prepare-dispatch.mjs critic` writes the filled briefing file under
`scratch/critic-briefing/`. On Claude, hand it to the Critic as a verified pointer, not as retyped text: run
`prepare-dispatch.mjs critic-fill --root <root> --briefing <that file> --fill MODEL_ID=<concrete model id> --fill EFFORT=<effort>`,
which accepts only those fixed-vocabulary values for the file's `<FILL ...>` slots, writes the final file with a Critic generator marker
and prints the two-line pointer prompt; pass it, alone and unchanged, as the prompt of a direct Claude Agent call of `pipeline-core:critic`.
The dispatch guard verifies the file against its marker and expands it, so the Critic receives the filled briefing exactly and every
dispatch check judges that text. A pointer carries no prose; a pointer plus inline text, an edited file or a Workflow carrier is refused.
The Antigravity and Codex carriers still carry the full briefing text.

## C. The finalization request file

<!-- moved verbatim from the SKILL.md body of the parent commit, lines 77-92 -->
The request file is closed `pipeline.session-critic-finalization-request.v1`
JSON with exactly `schema`, `taskId`, `projectId`, `sessionId`, `packetId`,
`trigger`, `route`, `review`, `verdictPath`, and `event`. `review` contains
exactly `base`, `candidate`, `specPath`, `guardrailPaths`, `evidencePaths`, and
`priorCriticEvidencePath`; `route` contains exactly `routeId`, `runner`,
`adapter`, `provider`, `modelTier`, and `effortTier`. `verdictPath` names the
bounded repository-relative JSON verdict that will be returned by this fresh
session; it need not exist for `admit`, but must exist for `finalize`.
`event` is either `null` or exactly `{ "eventOutPath": "...", "featureId":
"..." }`; use a `null` feature ID when none applies. `admit` emits one
`pipeline.session-critic-prelaunch-admission.v1` result; `finalize` emits one
`pipeline.session-critic-finalization.v1` result and exits 0 only for
`completed`; a durable review whose optional event write failed exits 2 with
`source-complete/event-unavailable` and an identical-only retry. Any malformed
argv, request, or verdict exits 2 with a closed
`pipeline.session-critic-finalization-error.v1` object.

## D. Export, named-requirement admission, evidence shape, diagnostic route

<!-- moved verbatim from the SKILL.md body of the parent commit, lines 98-147 -->
The Critic stays read-only toward tracked files: its report lives in ignored
`scratch/` and its receipt in the git-private journal, so neither survives as
project evidence. After a consumed `finalize`, the Coordinator exports them:

```bash
node "${PIPELINE_PLUGIN_ROOT}/scripts/session-critic-finalizer.mjs" export --root "$PWD" --request scratch/session-critic-export-request.json
```

The request is closed `pipeline.session-critic-export-request.v1` JSON with
exactly `schema`, `packetId`, `reportPath` (the Critic's repository-relative
notes file) and `outDir`, which must be `specs/<segment>/evidence/critic/<packetId>`.
`export` reads only a consumed packet's receipt and the report, creates `outDir`
exclusively (an existing one is refused) and writes `receipt.json`, `report.md`
and `index.json`; it runs no git and stages nothing. A review with findings
exports too (`reviewPass: false` in the index). The Coordinator commits those
three files with the reviewed change or the next lifecycle commit. A refusal
exits 2 with a typed `SCF-EXPORT-*` code.

**Opt-in named-requirement admission:** a feature Spec may place
`<spec-basename>.requirements.json` beside itself. When present, the preflight
reads that closed map and all targets from the exact candidate tree, requires
its `specSha256` to match the exact candidate Spec bytes, evaluates
only its allowlisted `path-exists` and `file-contains-literal` predicates, and
rejects `CDP-REQUIREMENT-ABSENT` with the missing criterion ids before this
Critic is dispatched. The map is included in the returned candidate guardrail
paths. Never execute or infer a requirement from its prose. An absent map keeps
the existing review behavior.

**Evidence artifact shape (hard — not free-form text):** each
`evidence:{{PATH}}` must be JSON bound to the exact frozen candidate commit
and tree that this preflight resolves. Only the validated
`pipeline.verify-evidence.v0` Critic-mode receipt (top-level commit/tree and
selection) or `pipeline.critic-diagnostic-evidence.v1` (nested candidate,
source digests, targeted log and pending full-Verify status) is accepted.
Security/gate-shaped JSON, a bare `{commit, tree}` assertion and an
implementor-written status claim are not substitute evidence, even when their
commit/tree values match. A mismatched candidate fails binding; an unsupported
schema fails schema admission. Recompute the candidate binding for each review
and let preflight validate the concrete artifact before dispatch.

**Diagnostic evidence route (in this order):** produce the artifact with
`scripts/critic-diagnostic-evidence.mjs`, register it (uncommitted; registration reads the
working tree) with
`scripts/register-feature-package.mjs --root <root> --add-diagnostic-evidence <path>`,
commit the artifact, its log and the manifest in ONE evidence-only commit, then rerun
`scripts/critic-dispatch-preflight.mjs` with `--registration-commit` naming that commit.
A delta request that is impact-ambiguous is admitted as an
effective full round of the same course (`RE-DELTA-FALLBACK-FULL`, the whole feature range
is reviewed); the next correction is an ordinary diff round again. Script paths resolve under
the plugin root the bootstrap prints, never a machine-specific path.

## E. Which record admits the first review (PF-70), and real commits after a consumed PASS (D199)

<!-- moved verbatim from the SKILL.md body of the parent commit, lines 156-194 -->
## Which record admits the first review (PF-70)

`CPP-REVIEW-ADMISSION` reads dispatch records (`evidence/dispatch-record-<TASK_ID>.json`), not queue
reservations. A foreground Goldfish dispatch leaves that record through the host commit; nobody writes it by
hand. A background dispatch gets no host-commit completion (`NGHF-PENDING-UNAVAILABLE`), so the review is
refused for want of a record even when the commits carry the right `Dispatch:` trailer. The Elephant then
writes an orchestrator-attested record, which is admitted as weaker assurance than a host-observed one:

`node <plugin-root>/scripts/dispatch-record-write.mjs --repo-root <root> --attested-request <request.json>`

The request is one closed JSON object: `schema` `pipeline.dispatch-attested-request.v1`, `briefingPath` (the
generated briefing, which must carry a required-review `criticDecision`), `handbackPath` (the hand-back text
the Elephant received) and `commits` (full 40-hex shas in chain order). Both paths are repository-relative
under `scratch/`, `evidence/` or `specs/`. Every path the commits changed must lie inside the briefing's
`allowedPaths`, otherwise the writer refuses with `attested-scope`; nothing is defaulted. `allowedPaths` holds exact
files: `dispatch-briefing.mjs binding` resolves a directory given as `--path` to the files it holds at that moment (and
says so), so a file created there later needs a new briefing, not a looser match. For a runner other than `claude`
(Codex; the generated Codex briefing names the agent by `role`) the record carries `attestation.modelAssurance:
declared-unobserved`: its model and effort are the briefing's declaration, never an observation, and it does not satisfy
any host-observed predicate. Use the task id of
that record for every round (next section).

When the feature replaces a feature that was discarded, register it with `register-feature-package.mjs --root <root> --supersedes <predecessor feature id>` so the first full review starts before the inherited implementation without any review-time flag; a feature already registered without it still names the predecessor with `--successor-of <feature id of the discarded predecessor>` on the first round.

## Real commits after a consumed PASS (D199)

A consumed PASS ends the course only for the same candidate. Real (non-evidence) commits after the passed
candidate are reviewed as one more diff round whose parent is the passed record; no round or
correction-commit count refuses it (D190), and the rounds repeat until a PASS. Order:

1. The passed round's lineage must be registered. If it is missing, run
   `register-feature-package.mjs --root <root> --add-review-lineage --packet <packetId>` and commit the
   manifest and the lineage file it names (a round past 2 needs no exception binding).
2. The base is the passed round's candidate, never a later commit; evidence-only commits inside the range
   carry forward. A request whose base is another commit is refused `CCA-PARENT`.
3. Continue as in the next section: `--add-delta-request <input.json>`, preflight with the registered delta
   request path, `session-critic-finalizer.mjs admit`, finalize, then register that round's lineage.

A re-review of the same candidate, or a range with no real commit after the passed candidate, still ends
with `RE-CONSUMED-PACKAGE-PASS` / `CGB-PASS-STOPS`.


## F. Generic exact-range batch registration (Coordinator only)

<!-- moved verbatim from the SKILL.md body of the parent commit, lines 420-430 -->
## Generic exact-range batch registration (Coordinator only)

The Coordinator performs this bounded metadata step inline. It creates no additional Human approval, signing ceremony, product-write permission or reviewer dialogue. Retain the returned source-issued batch reference across restarts and corrections. Do not place private registration, parent verdict, accounting metadata or implementer reasoning in the Critic's refs-only input.

For a new generic batch, before the first item dispatch the Coordinator commits the meaningful review-unit declaration at the batch base. Register the batch with the shipped `scripts/session-critic-finalizer.mjs register-batch --root <physical repository> --request scratch/<registration>.json` before `admit`. The source-issued registration binds the declaration, candidate and actual public references to one immutable batch. A declaration names the coherent feature section, related-fixes group, independent delivery, or urgent isolated risk; it includes the logical work and criteria, spec, integrated Main boundary, and singleton rationale when applicable. After integration and before the full Critic, freeze actual members and integrated scope. A generic batch is not one item by default. Colliding logical work or origin is an existing batch or a conflict, never a fresh budget. Verify the source contract and use its current closed request schema; do not invent fields or treat caller-supplied JSON as authority.

Generic `admit` and `finalize` use `pipeline.session-critic-finalization-request.v3`. Preserve the ordinary outer request fields and the existing review fields; add only `review.genericBatchRef: {batchId, registrationSha256, memberSha256}`. This is distinct from FeatureV2 `review.courseContext`. The source claims the real packet and durably reserves ordinal 1/full before returning `admitted`. An exact already-admitted replay returns `already-admitted` with `replay:true`; it does not authorize another child. Unknown reservations remain held. Missing generic registration is a typed prelaunch refusal. The ordinary fresh read-only Critic and genuine finalizer result/claim/consume/receipt checks remain required.

After an actual consumed non-PASS full review, the Coordinator creates one fresh Correction Goldfish task for the whole frozen batch. It owns the coherent findings, tests, fixes and targeted checks, then remains in that same task and context for subsequent correction-diff findings through genuine PASS or an explicit PO decision. Register each correction against the original source-issued batch reference and immediately preceding consumed review receipt. The source derives actual changed paths and correction commits and reuses its impact, invariant and executed-diagnostic predicates. Caller-supplied parent or PASS flags, fake receipt JSON, widened ranges, and missing or failed diagnostics grant nothing. Correction reviews are delta-only; a second full review or a new correction identity to reset the budget is refused.

Registration, immutable review-unit membership, origin/logical indexes, shared round accounting (one full round, then diff rounds with no count limit) and exclusive launch slots live in the canonical private Git-common-dir packet store. Read-only inspection never creates empty history or refunds a reservation. Existing in-flight generic packets require a demonstrably complete adoption; do not silently register a fresh budget. This is Source enforcement of Coordinator-declared membership, not universal host enforcement or proof of semantic coherence. Do not claim the operating policy is enforced until the admitted source/runtime contract is verified.
