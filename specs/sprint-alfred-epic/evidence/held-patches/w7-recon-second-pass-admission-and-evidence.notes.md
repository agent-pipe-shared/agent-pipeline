# Recon notes, second pass: PF-86 lock call site, D31/D32 grant arithmetic, D47 line endings, D41 SKILL digest pin

Status: read-only recon, notes only, NO patch, no clone made (the briefing asks for notes). Candidate cb051a3a3. Paths are
repository-relative; `lib/` is `plugins/pipeline-core/lib/`, `scripts/` is `plugins/pipeline-core/scripts/`. Continues
`w7-recon-dispatch-admission-queue.notes.md` and `w7-recon-critic-evidence-and-crlf.notes.md`. The first notes named the grant script as
`scripts/dispatch-budget-grant.mjs` at the repository root; it lives at `plugins/pipeline-core/scripts/dispatch-budget-grant.mjs`
(correction of a path, not of a finding). Several `rg` spellings (`-g`, `--glob '!...'`, multi-root with a quoted paren) are refused by the
shell grammar; this cost budget and left D47 only partly surveyed (see item 3).

## 1. PF-86: lock call site and the DBG-RULESET-LOCK-HELD producer

Grounded:
- Call site: `lib/native-goldfish-host-state.mjs` line 737, inside `publishNativeAuthorityState` (defined line 719), `return
  withSessionAuthorityBoundary({repository}, boundary => {...})`. The only caller is line 251 (the PreToolUse admission, with an
  `admissionDeadline` and a `createAdmissionCheckpoint` at line 720). The callback body, lines 738-782, holds the registry lock for: queue
  re-resolve (`resolveGovernedItemQueue`, 740), `readNativeIntegratedSlices` (749), the commit-evidence read (750, memoised per admission
  by `memoPerAdmission`), the Agy inventory and producer-record reads (753-756), `readSettledItemSliceIds` (764), the owner/criterion/scope
  collision loops (765-770), and a full `nativeAuthorityScan(owner)` plus per-pending-entry loop (771-781). Everything after 782 (PF-55
  pre-reserve checks, reservation) is also inside the callback. So the whole read-heavy admission is the critical section.
- Only the compare facts are state-dependent: `governed.sha256 === state.delivery.queueSha256` (741) is already a compare-and-swap on
  the queue; `item-delivery-owner-unbound` (742) and `item-delivery-not-ready` (744) read the same governed snapshot.
- `DBG-RULESET-LOCK-HELD` is NOT an admission/lock-taking producer. It is produced by the briefing generator,
  `scripts/dispatch-briefing.mjs` lines 797 and 803, in the ruleset-identity lookup (lines 784-806). It does not take the lock; it only
  observes it (`lockOf(root)` = `deps.registryLock ?? defaultRegistryLock`) and waits in a 50 ms poll loop up to
  `REGISTRY_LOCK_WAIT_MS` (line 791, 794) when the preflight observation could not give an `available` ruleset identity. Line 797: lock
  still held after the wait. Line 803: after `observeOnce()` the observation itself fault is `SDC-LOCK-HELD`. Tests: K12 in
  `scripts/dispatch-briefing.test.mjs` lines 393-422.
- Meaning for PF-86: while any admission (or a long running agent's registry boundary, if one is held that long) holds the lock, the
  BUILD path refuses instead of falling back to a lesser identity. That fallback refusal is deliberate (K12 comment, lines 784-786).
  A bounded retry in the build path already exists (the 50 ms loop up to `REGISTRY_LOCK_WAIT_MS`); the refusal text already names the
  longer wait `session-authority-repair.mjs wait --timeout 120` and `release-lock`. Raising `REGISTRY_LOCK_WAIT_MS` only converts
  refusals into a longer wait; it does not shorten the admission critical section. The wait value in the registry itself is
  `SESSION_AUTHORITY_LOCK_WAIT_MS = 1500` (first notes).
- What a bounded retry would change: the build-side refusal rate when the holder is a short admission (seconds); nothing when the holder
  is a long running dispatch or a crashed owner (`lock.owner` dead case is excluded from the wait at line 794 already).
- NOT checked: the value of `REGISTRY_LOCK_WAIT_MS` and `defaultRegistryLock` (constants not read, budget).

Gap list:

| # | Gap | Tag |
|---|---|---|
| 1a | Move the read-only scans (lines 749-781: integration read, Agy inventory, settled set, collision pre-check) before the lock; keep under the lock only the CAS (`governed.sha256`, registry generation) and the final collision re-check against the delta | code-fixable-here (protected native authority path; Critic batch gate) |
| 1b | Build-side `DBG-RULESET-LOCK-HELD`: the briefing could retry the identity read for the dispatch window without raising the registry wait | code-fixable-here, low value until 1a lands |
| 1c | Whether four parallel PreToolUse hooks of one message can ever be admitted together | native-host-only |
| 1d | Accept shortening the critical section as a safety-relevant change | po-decision |

Minimal slice (1a): files `lib/native-goldfish-host-state.mjs`, `lib/native-goldfish-host-state.test.mjs`. RED: two admissions that
overlap in time on disjoint scope and distinct items, both admitted, the second observing the first reservation in the delta recheck;
and an admission whose queue digest changes between pre-scan and publish is refused `item-delivery-queue-drift`. Commit subject:
`perf(dispatch): scan outside the registry lock and publish by compare-and-swap (PF-86)`. Confidence: medium-high for sites, medium
for the design (the registry generation counter API was not read).

## 2. D31/D32: the arithmetic of the budget grant

Grounded, source `lib/dispatch-budget-core.mjs` and `scripts/dispatch-budget-grant.mjs`:
- `CLOSING_ALLOWANCE = 5`, `SAFETY_MARGIN = 10` (core lines 16-17).
- `dispatchWorkingCap(maxTurns) = max(0, maxTurns - (5 + 10))` (49-52). For the implementor, `maxTurns = 50` gives tier cap 35, which is
  the "35 tool uses" of the briefing.
- `effectiveDispatchBaseCap(baseCalls, maxTurns) = min(baseCalls, tierCap)` (55-60).
- `dispatchGrantHeadroom(baseCalls, maxTurns) = max(0, maxTurns - CLOSING_ALLOWANCE - 1 - base)` (127-131). With maxTurns 50 and base 35:
  50 - 5 - 1 - 35 = 9. That is the source of the headroom of 9: the grant ceiling is `maxTurns - 6 = 44` (line 122,
  `ceiling = maxTurns - CLOSING_ALLOWANCE - 1`), i.e. the SAFETY_MARGIN of 10 is partly given back, down to a margin of 1 below the
  harness `maxTurns` cliff. A Critic with maxTurns 65 and a base cap of 50 would get 65-6-50 = 9 as well; with base 35 it would get 24.
- `effectiveDispatchWorkingCap(base, maxTurns, granted) = max(base, min(base + granted, ceiling))` (118-124). After the working cap, only
  closing acts are admitted for the next 5 calls (94-96); `decideDispatchBudgetCall` counts denied attempts too.
- Grant script (`scripts/dispatch-budget-grant.mjs`): `--extra` 1..`MAX_GRANT_EXTRA_PER_CALL = 40` (core 107); refuses
  `grant-exceeds-headroom` when `extra > headroom` (script line 128-130); returns headroom 0 when `counter.workingCap > tierCap`
  (117); refuses a SECOND grant for the same agent id with `grant-already-recorded` (line 122-127, "one grant per continuation, D75 B"),
  leaving "dispatch a successor slice from the continuation card" as the only next step. The grant store is
  `<git-common-dir>/agent-pipeline/dispatch-budget/grants/<agentId>.json`, digest chained (`appendGrant`, `MAX_GRANT_ENTRIES = 20` allows
  a chain, but the script itself forbids a second entry); the counter is `<agentId>.json` in the same directory (line 109).
- What a `--continuation-of` reference could reuse: a continuation runs under a NEW agent id and hence a new counter (script line 110
  requires an existing counter for the id granted), so a continuation reference would be a new SLICE-level binding (the PF-85 slice from
  the first notes), not a grant parameter. The grant record has `reason` (max 500, `MAX_GRANT_REASON_LENGTH`) only; no field carries a
  predecessor slice id.
- Which line would give a larger or staged grant:
  - Larger: lower `SAFETY_MARGIN` (core line 17) or change the ceiling expression at core line 122 and the headroom expression at line
    130 together (they must stay equal; headroom and ceiling are the same formula in two places). Both are inside the
    budget-guard core, a protected authority surface.
  - Staged: remove the one-grant rule at script lines 122-127 and compute `alreadyGranted` from `existing.totalExtra` (line 121 currently
    hard-codes `alreadyGranted = 0`; `validateGrantRecord` already returns `checked.totalExtra`) and make headroom
    `ceiling - (base + totalExtra)`. The record chain (`appendGrant` with an existing record, `MAX_GRANT_ENTRIES = 20`) already supports
    several entries; only the script policy (D75 B) forbids it.
- Interaction with the Elephant's native resume: not read.

Gap list:

| # | Gap | Tag |
|---|---|---|
| 2a | Staged grants (second grant allowed while total stays at or below the ceiling) | po-decision (reverses D75 B) then code-fixable-here, script + test |
| 2b | Larger ceiling by lowering `SAFETY_MARGIN` | po-decision (safety versus harness cliff) |
| 2c | A slice-level continuation reference carrying budget history to a new agent id | code-fixable-here, same slice as PF-85 1a |
| 2d | Runner adapters (Codex, Antigravity) | native-host-only |

Recommendation for 2a: staged grants within the SAME ceiling (no change to the cliff), because the arithmetic proves the cliff is the
limit and the one-grant rule only wastes headroom when a first grant is below 9. Slice: files
`plugins/pipeline-core/scripts/dispatch-budget-grant.mjs`, `scripts/dispatch-budget-grant.test.mjs` (the test file name is assumed, not
checked). RED: first grant 4 then second grant 5 within headroom is granted; second grant above remaining headroom is refused
`grant-exceeds-headroom`. Commit subject: `feat(budget): allow staged grants within the agent headroom (D31)`. Confidence: high for the
arithmetic, medium for the test file name.

## 3. D47: line-ending sensitive comparisons (PARTIAL; budget)

Grounded:
- `.gitattributes` at the repository root already pins `* text=auto eol=lf`, `*.mjs/.js/.json/.md/.yaml/.yml/.sh text eol=lf`; only
  `*.cmd`/`*.ps1` are `eol=crlf` (lines 2-18). In THIS repository `core.autocrlf=true` is therefore overridden for every evidence JSON,
  log (`.log` is NOT listed explicitly; it falls under `* text=auto eol=lf`) and markdown file. D47 can only bite a consumer project
  that has no such `.gitattributes`, or a path whose attribute is `-text`/unset (not checked for `evidence/` logs).
- Worktree-vs-blob comparison, the single most likely failing one: `lib/critic-diagnostic-evidence.mjs` `readDiagnosticArtifact`
  (line 18-25) reads the WORKTREE bytes (`readFileSync(absolute)`), while `source()` (58-61) and the producer's twin
  (`lib/critic-diagnostic-producer.mjs` line 33) hash `git show <candidate>:<path>` (blob) bytes. The `fullVerify.evidence.sha256` check
  at line 100 (`diagnosticDigest(bytes) !== value.fullVerify.evidence.sha256` -> `CDI-DIGEST`) therefore compares a worktree read against a
  digest written when the evidence file was produced (LF, written by Node). With `core.autocrlf=true` and no `eol=lf` attribute, a later
  checkout re-materializes the evidence file with CRLF and the worktree digest no longer matches: `CDI-DIGEST`. The same applies to the
  captured targeted-log read through `readArtifact` (the target of `validateCaptureHeader`, lines 73-86).
- A second, stricter failure of the same cause: `validateCaptureHeader` (line 73-86) matches with `\n` only (`[^\r\n]+\n`,
  `"--- stdout ---\n"`, `"\n--- stderr ---\n"`). A CRLF copy of the capture log fails the header check outright (returns false) even if
  the digest were somehow accepted. That is `CDI-CAPTURE`-class (name not read).
- The registrar `scripts/register-feature-package.mjs`: `rg` for `readFileSync|sha256|"show"|\r` returned no hit, so it hashes via a
  library (not located; `readDiagnosticArtifact` callers were not enumerated because the last two searches were refused by the grammar).
  `harness/scripts/verify.mjs` and `lib/critic-diagnostic-producer.mjs`: `rg` for `autocrlf|eol|crlf` returned no hit in either.
- NOT surveyed: Verify evidence binding beyond the above, `critic-course-admission.mjs` worktree reads, spec/guardrail digests
  (those use `git show`, so they are blob-based and CRLF-safe).

Fixture that would show it (no patch made): in a temp repo with no `.gitattributes`, `git config core.autocrlf true`, produce an evidence
file with LF through the producer, register it, commit, then re-checkout the file (`git checkout -- <path>` after `rm`) so the worktree
copy has CRLF; call `validateCriticDiagnostic` with `readArtifact` default. Expected today: `CDI-DIGEST` (fullVerify evidence) and a
`validateCaptureHeader` false for the targeted log. A unit-level equivalent without git config: pass a `readArtifact` stub returning
`bytes.toString().replace(/\n/g, "\r\n")` for the fullVerify evidence (path/sha unchanged) and assert `CDI-DIGEST`; for the log, a
CRLF-converted capture text to `validateCaptureHeader`. This fits `lib/critic-diagnostic-evidence.test.mjs` (the package's check file)
with an injected `readArtifact`, since `validateCriticDiagnostic` already exposes that dependency (line 87).

Gap list:

| # | Gap | Tag |
|---|---|---|
| 3a | Worktree read versus blob digest in `readDiagnosticArtifact`; fix by hashing/reading the blob at the candidate (`git show`) or by normalising CRLF to LF on read for the digest and for the capture header | code-fixable-here (po-decision on byte-exactness: normalise-on-read weakens exactness) |
| 3b | `.gitattributes eol=lf` (or `-text`) for `evidence/` and `specs/*/evidence/` in CONSUMER projects (the onboarding writes none here; not checked) | po-decision; onboarding change is code-fixable-here |
| 3c | A true Windows run without `core.autocrlf=input` | native-host-only |

Minimal slice (3a): files `lib/critic-diagnostic-evidence.mjs`, `lib/critic-diagnostic-evidence.test.mjs`. RED: stubbed CRLF
`readArtifact` for the fullVerify file is accepted (via blob read), the capture header accepts a CRLF copy, and a content change still
refuses `CDI-DIGEST`. Commit subject: `fix(critic): bind diagnostic evidence to blob bytes so CRLF checkouts verify (D47)`. Confidence:
medium for the failing comparison (reading-based, not reproduced), low for caller coverage (not enumerated).

## 4. D41: the pinned digest of skills/critic-review/SKILL.md

Grounded:
- Pin: `plugins/pipeline-core/scripts/codex-isolated-critic-protected-preimage.v1.json`, `files[]` entry with `path`
  `plugins/pipeline-core/skills/critic-review/SKILL.md` and `rawSha256` `60cd00b9281b4522eff1bb2f176555084d032d54598bfca22d85223e8d92efab`
  (JSON lines 33-36). Sibling pins in the same file: `templates/prompts/critic-review.md`, `roles/critic.md`,
  `plugins/pipeline-core/agents/critic.md`, `harness/review-protocol.md`, and four `scripts/*` schemas/host files. Schema
  `pipeline.codex-isolated-critic-protected-preimage.v1`, baseline label `nova-autonomous-critic-review-policy`.
- Test that pins it: `scripts/codex-isolated-critic-protected-preimage.test.mjs`. It lists the SKILL path at line 21, checks the entry
  key shape `["path","rawSha256"]` at line 48, and compares the actual file hash with `entry.rawSha256` at line 66 (mismatches collected).
  Other tests reference the same path: `scripts/codex-isolated-critic-contract.test.mjs`, `scripts/session-critic-finalizer.test.mjs`,
  `lib/critic-packet-governance.test.mjs` (governed paths), `install-agy.test.mjs`, `install-agy.inline-candidate.test.mjs`,
  `lib/pins/agy-managed-copy-first-start-lacks-attestation.test.mjs`,
  `lib/pins/antigravity-global-refresh-recovers-and-installs-a-runner-view.test.mjs` (the last four copy or install the file; their
  expectation on bytes was not read).
- `reader-inputs/product-capability-inventory.json` lines 1600 and 1645 also list the SKILL path (inventory, not a digest; whether a
  digest of the inventory entry exists was not checked).
- Exact steps for a later SKILL.md paragraph slice: (1) edit `skills/critic-review/SKILL.md` (add the evidence-route paragraph near
  lines 116-126, the accepted evidence shape); (2) recompute the sha256 of the new raw bytes and replace `rawSha256` on JSON line 35; (3)
  run `scripts/codex-isolated-critic-protected-preimage.test.mjs`, `lib/critic-packet-governance.test.mjs`, the contract and finalizer
  tests and the two agy pin tests; (4) check whether the inventory/capability digest or any generated copy (`install-agy*`) needs
  regenerating. The preimage JSON is a "protected preimage" of a policy baseline: changing a digest there is changing a protection pin;
  whether the guard config treats it as protected was not checked against `project/guard-config.json` (13 `TP-` entries listed in
  `templates/prompts/agent-obligations.md` section 2 do not name it).

Gap list:

| # | Gap | Tag |
|---|---|---|
| 4a | SKILL.md evidence-route paragraph plus the digest update in the preimage JSON and any dependent test expectations | code-fixable-here (not on the TP list; possibly Critic-gated because it re-baselines a protected preimage) |
| 4b | Whether re-baselining that preimage requires a PO decision (the label says nova autonomous Critic review policy) | po-decision |
| 4c | The `--help` text in the three scripts (G5 of the first notes) is independent of the SKILL.md pin and can ship first | code-fixable-here |

Minimal slice (4a): files `plugins/pipeline-core/skills/critic-review/SKILL.md`,
`plugins/pipeline-core/scripts/codex-isolated-critic-protected-preimage.v1.json`; RED: the preimage test's mismatch assertion after the
SKILL edit and before the pin update. Commit subject: `docs(critic): state the diagnostic evidence route in the Critic skill (D41)`.
Confidence: high for the pin location and the pinning test, low for the dependent copy tests.

## Checks

No production or test file was changed. The briefed "new cases RED before/GREEN after", "baseline versus patched failing-name sets" and
"apply check in clone2" targeted checks do not apply to a notes-only recon and were not run. No clone was created.
Used about 22 tool calls; no tool budget cap was exceeded.

CONTINUATION CARD, remaining: enumerate `readDiagnosticArtifact` callers and the registrar's hash route (blocked by shell grammar
refusals on `-g`), read `REGISTRY_LOCK_WAIT_MS`/`defaultRegistryLock` in `scripts/dispatch-briefing.mjs`, name the real test file for the
grant script, and check `guard-config.json` for the preimage JSON.
