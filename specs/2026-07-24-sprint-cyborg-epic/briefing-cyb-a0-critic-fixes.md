# Prepared Goldfish briefing — CYB-A0: fix fresh Critic findings (recovery-preview attestation)

> **Status: DISPATCHING NOW.** This is CYB-A0's step 2 (per
> `cyb-a0-feature-spec.md` §2): a fresh, independent, full Critic review of
> `plugins/pipeline-core/lib/recovery-preview-attestation.mjs` against the
> backlog item's acceptance boundary just completed with **verdict: FAIL** —
> 1 major finding + 4 minor findings, disclosed below verbatim (no prior
> narrative, this is the Critic's actual report). Fixing all 5 closes CYB-A0's
> code gap; step 3 (a second Critic pass) follows once this lands.
> Ruleset SHA `b18863a` on `feat/sprint-cyborg-claude`.
> **Worktree: no** — run directly in the main checkout.

---

You are a **Goldfish** of the Agent-Pipeline: fresh context, exactly ONE task,
"follow the plan exactly". This briefing and the files listed in field 2 are
your ONLY input. You have no memory and use none; do not read handover/state
files or session history — this briefing replaces them.

First output line (compact bootstrap confirmation):

> Bootstrap check passed: ruleset b18863a loaded · Project agent-pipeline · Calibration .claude/pipeline.json · State briefing CYB-A0-critic-fixes/2026-07-27 · Role Goldfish (deep)

---

## Briefing CYB-A0: fix all 5 findings from the fresh Critic review

### 1. Goal

Fix the following 5 findings, exactly as scoped. Each maps to a specific gap
the Critic found by reading the real code — do not re-litigate the finding
itself (trust it), but DO verify the current line numbers yourself before
editing, since they may have shifted slightly from the report below.

**Finding 1 (major) — replay defense is implemented in the module but inert
in the only production consumer.**

`attestRecoveryPreviewDelivery`'s replay rejection (`usedAcknowledgementIds`)
only works if the caller threads returned ids into the next call. The sole
consumer, `authorizePendingTransactionRecoveryV3`
(`plugins/pipeline-core/lib/runner-profile-migration-v3.mjs:890-923`), never
does — every call starts from an implicit fresh `[]`. Worse, the invocation
identity it constructs is deterministic per journal state
(`invocationId: \`recovery-${state.journalSha256}\`` at line ~897), not
per-invocation-unique, so a caller-supplied `deliverPreview` that simply
returns a cached/stale acknowledgement from an earlier delivery attempt for
the same still-unchanged journal will be accepted again, producing an
unearned `RP-DELIVERY-ATTESTED` → a fresh `authorized` result — exactly the
false-success boundary this P1 backlog item exists to close.

**Required fix:** make the invocation identity fresh on every call to
`authorizePendingTransactionRecoveryV3`, not just a function of journal state.
Add a random, unpredictable component to the `invocationId` string
constructed at line ~897 (e.g. via `randomUUID()` from `node:crypto`,
combined with the existing `state.journalSha256` for correlation/debuggability
— exact format is your call. `SAFE_ID` permits an ASCII letter or digit first,
then up to 99 ASCII letters, digits, dots, underscores, or hyphens). This means a stale
acknowledgement carrying an old invocation's id will now fail
`RP-INVOCATION-MISMATCH` on any subsequent call, because each real
authorization attempt gets a genuinely fresh, unguessable identity that a
cached ack cannot coincidentally match. **Do not simply thread
`usedAcknowledgementIds` as the only fix** — that only helps if the SAME
process instance and SAME call site persist state across calls, which is a
weaker, more fragile guarantee than making each invocation's identity
inherently fresh; the nonce approach is the primary, required fix.
(You may additionally thread `usedAcknowledgementIds` via a small
per-plan/per-journal cache, e.g. reusing the pattern of the existing
`AUTHENTICATED_RECOVERY_AUTHORIZATIONS` `WeakMap`, as genuine defense-in-depth
— that is optional, latitude is yours, but the nonce fix is mandatory and
must land regardless.)

Add a new consumer-level regression test in
`plugins/pipeline-core/lib/runner-profile-migration-v3.test.mjs` proving:
call `authorizePendingTransactionRecoveryV3` once successfully (capture the
acknowledgement `deliverPreview` returned), then call it again for the exact
same plan/journal with a `deliverPreview` that returns that SAME cached
acknowledgement object (not a freshly-constructed matching one) — assert the
second call now fails (does NOT reach `authorized` status), proving the
replay/staleness gap is closed. Match the existing test style in that file
(search for the existing "stale, wrong-plan, and replayed recovery
authorizations fail closed" test near line 363 for precedent, though that
test covers a different mechanism — do not confuse the two, your new test is
about the acknowledgement/invocation-identity layer, not the
`AUTHENTICATED_RECOVERY_AUTHORIZATIONS` layer).

**Finding 2 (minor) — negative-test coverage has untested branches.**

In `plugins/pipeline-core/lib/recovery-preview-attestation.test.mjs`, add or
strengthen assertions so every one of these is independently, exactly
asserted (not just "delivered: false" or "not the success code"):
- the duplicate-entry branch of `usedAcknowledgementIds` validation (line
  ~56, `new Set(...).size !== length`) — currently untested (only the
  `SAFE_ID` malformed-entry branch at test line ~105 is covered).
- within the malformed-ack block (source lines ~75-79): the ack `schema`
  mismatch branch and the bad-`acknowledgementId` branch, each individually
  (currently only `delivery: ""` is exercised, at test line ~82).
- `RP-CALLBACK-ABSENT` and `RP-CALLBACK-THREW` (currently only asserted via
  `delivered === false` / `notEqual(..., "RP-DELIVERY-ATTESTED")` in the
  shared loop at test lines ~31-37) — add or split out assertions on the
  EXACT code for each of the three cases in that loop (undefined callback →
  `RP-CALLBACK-ABSENT`; empty-return callback → whichever code that
  legitimately produces per the real code, verify it yourself; throwing
  callback → `RP-CALLBACK-THREW`).

**Finding 3 (minor) — a throwing property getter on the acknowledgement
escapes as an untyped exception.**

`plugins/pipeline-core/lib/recovery-preview-attestation.mjs`: the
acknowledgement-inspection block (lines ~70-82, the `exactKeys`/schema/
`delivery`/`acknowledgementId` checks and the mismatch/replay checks after
it) sits OUTSIDE the `try` block that guards the callback invocation itself
(lines ~64-69). An acknowledgement object with a throwing property getter
(e.g. a getter on `.schema` or `.delivery`) propagates an uncaught exception
out of `attestRecoveryPreviewDelivery` — violating the module's own contract
that every failure path returns a typed non-success result, and potentially
leaking caller-supplied error text via an uncaught stack trace. **Required
fix:** widen the existing `try`/`catch` (or add a second one) to cover the
acknowledgement-inspection block too, mapping any exception there to a typed
code (reusing `RP-ACK-MALFORMED` is reasonable and simplest, since a
throwing-getter object is arguably malformed by construction — your call if
you prefer a distinct code, but do not invent an entirely new export/constant
without a clear reason). Add a test proving a throwing-getter acknowledgement
now returns a typed non-success result instead of throwing.

**Finding 4 (minor) — the "bounded synchronous callback timeout" claim
overstates what the mechanism does.**

`callbackExceeded()` is evaluated only AFTER the callback has already
returned or thrown (source lines ~63-70) — it is a post-hoc classification,
not a pre-emptive bound; a synchronous callback that never returns hangs the
process and is never classified at all (a JS single-thread reality, not a
bug to fix in code). **Required fix is documentation-only:** correct the
header comment in `recovery-preview-attestation.mjs` (currently implies a
"bounded synchronous callback timeout" without qualification) and the
`$comment` in `plugins/pipeline-core/scripts/recovery-preview-attestation.schema.json`
(currently says "accepts optional callbackTimeoutMs as a synchronous callback
bound") to accurately state that this is a POST-HOC classification applied
after the callback returns/throws, not a pre-emptive interrupt — a callback
that never returns is never classified and will hang the calling process.
Do not change the runtime behavior; only correct the two prose claims to be
honest about the mechanism's real limits (guardrail QG-05: document what a
gate does NOT check).

**Finding 5 (minor) — published JSON schema and enforcing validator disagree
on type.**

The schema (`recovery-preview-attestation.schema.json`) declares
`invocationId`/`previewDigest`/`acknowledgementId` as `"type": "string"`, but
the validator in `recovery-preview-attestation.mjs` only regex-tests
(`SAFE_ID.test(value)`/`SHA256.test(value)`), and JS `RegExp.test()` coerces
non-string arguments via `String(value)` first — so e.g.
`createRecoveryPreviewInvocation({ invocationId: 12345, ... })` currently
returns a "valid" invocation with a numeric id. **Required fix:** add an
explicit `typeof value === "string"` check before each regex test (in
`validInvocation()` and in the acknowledgement-shape checks), so a non-string
id/digest is rejected outright, matching the schema's declared type. Add a
test proving a numeric `invocationId`/`previewDigest` is now rejected.

### 2. Context files

- `plugins/pipeline-core/lib/recovery-preview-attestation.mjs` (read fully) —
  primary file for findings 3, 4 (partial), 5.
- `plugins/pipeline-core/lib/recovery-preview-attestation.test.mjs` (read
  fully) — extend for findings 2, 3, 5.
- `plugins/pipeline-core/lib/runner-profile-migration-v3.mjs` (read the
  `authorizePendingTransactionRecoveryV3`/`applyPendingTransactionRecoveryV3`
  functions around lines 879-958, plus enough surrounding context —
  `AUTHENTICATED_RECOVERY_AUTHORIZATIONS`, `authenticatedRecovery`,
  `recoveryResult`, `diagnostic` — to understand the call shape) — primary
  file for finding 1.
- `plugins/pipeline-core/lib/runner-profile-migration-v3.test.mjs` (read the
  existing recovery-authorization test block near line 342-419 for style
  precedent) — add the new replay regression test here.
- `plugins/pipeline-core/scripts/recovery-preview-attestation.schema.json`
  (read fully, short) — wording fix for finding 4.
- `specs/2026-07-24-sprint-cyborg-epic/cyb-a0-feature-spec.md` §3 — the
  acceptance boundary these fixes serve.
- `backlog/items/2026-07-20-recovery-preview-callback-attestation.md` — the
  originating backlog item (context only, do not edit).

### 3. DoD checks

- All 5 findings addressed as scoped above; no other behavior changed.
- `node --test plugins/pipeline-core/lib/recovery-preview-attestation.test.mjs`
  exits 0, with new/strengthened assertions for findings 2, 3, 5.
- `node --test plugins/pipeline-core/lib/runner-profile-migration-v3.test.mjs`
  exits 0, including the new replay-regression test for finding 1.
- **Regression (mandatory, run yourself before reporting done):**
  `node harness/scripts/verify.mjs` for at minimum the
  `recovery-preview-attestation-tests` and any `runner-profile-migration`
  related suite it registers — confirm no suite that was passing before your
  change starts failing. If the full aggregate run is noisy for unrelated,
  already-documented reasons (native-Windows environment failures,
  cross-branch `gitleaks` false positive), name exactly which lines you
  expect noisy and confirm nothing NEW appears.
- `createRecoveryPreviewInvocation({ invocationId: 12345, previewDigest: ... })`
  (or the equivalent path through `attestRecoveryPreviewDelivery`) now
  returns rejection, not a numeric-id "valid" object — prove this with a test,
  not just a manual check.
- The new consumer-level replay test in `runner-profile-migration-v3.test.mjs`
  genuinely fails on the PRE-fix code and passes on the POST-fix code — verify
  this yourself (e.g. by temporarily reverting your `runner-profile-migration-v3.mjs`
  change locally, confirming the new test fails, then restoring your fix) —
  this is the single most important verification in this whole briefing, since
  it is proof the fix actually closes the gap rather than just adding an
  inert nonce.
- Machine-written test output is your evidence artifact — never prose you
  compose.

### 4. Forbidden

- Scope: edit ONLY the 5 files named in field 2 that are marked "primary
  file" or "add the new... test here" above:
  `plugins/pipeline-core/lib/recovery-preview-attestation.mjs`,
  `plugins/pipeline-core/lib/recovery-preview-attestation.test.mjs`,
  `plugins/pipeline-core/lib/runner-profile-migration-v3.mjs`,
  `plugins/pipeline-core/lib/runner-profile-migration-v3.test.mjs`,
  `plugins/pipeline-core/scripts/recovery-preview-attestation.schema.json`.
- Do NOT touch any CYB-1/CYB-2 file, `security-scan.mjs`, `guard-push.mjs`,
  or any file outside the above list.
- Do NOT change `attestRecoveryPreviewDelivery`'s existing exported function
  signature or the shape of its return value — only its internal robustness
  (finding 3, 5) and the exactness of test coverage (finding 2). Do NOT
  change `RECOVERY_PREVIEW_SCHEMA`/`RECOVERY_PREVIEW_ACK_SCHEMA`/
  `RECOVERY_PREVIEW_DEFAULT_CALLBACK_TIMEOUT_MS`'s values.
- Do NOT weaken, skip, or delete any existing passing test to make a new one
  pass.
- **Commit discipline:** never `git add -A` / a bare `git commit` — only
  `git commit -- <exact files touched>`.
- **Commit trailer:** end your commit message with the line
  `AI-Assisted: true` on its own line. Do NOT include any `Co-Authored-By`,
  `Claude-Session`, or other provider/session-identifying trailer
  (`guardrails/git.md` GIT-03).

### 5. Stop conditions

- More than 2 failed attempts at the same problem — report the failure
  state.
- The task requires touching a file outside field 4's scope — stop and
  report.
- A previously-passing test starts failing and you cannot determine within
  budget whether it's a real regression from your change or something
  unrelated — stop and report, do not guess.
- Missing access/tool/permission.
- Tool budget reached or clearly about to be exceeded.

### 6. Dispatch metadata

- Ruleset SHA/version: `b18863a` on `feat/sprint-cyborg-claude`.
- Model/effort: `goldfish-deep` / high. Rationale: fixes a real false-success
  boundary in a security-adjacent recovery path (finding 1 in particular is a
  genuine design decision, not mechanical), touches a live production
  consumer file with existing tests that must keep passing.
- Worktree: no — run directly in the main checkout.
- Profile: standard.
- Tool budget: ≤40 tool uses.
- Dispatch record: write `dispatch-record.json` to your own scratchpad
  location, fields `taskId: "CYB-A0-critic-fixes"`, `model`, `rulesetSha`,
  `dispatcher`, `outcome`.

---

At the end, report back: the diff summary per finding (5 findings, confirm
each addressed), the exact test commands you ran and their exit codes/output
for all 4 affected test files (including the mandatory pre-fix/post-fix
replay-test verification for finding 1), and confirm the commit SHA you
produced (or a clean stop with the reason, per field 5).
