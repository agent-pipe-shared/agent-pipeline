# HGO: resolving the fail-closed-at-arming conflict, correcting digest-withholding documentation, and streamlining the ceremony

Status: proposed (design only — no implementation code in this dispatch).
Owner: PO.
Depends on: `docs/adr/0059-signed-human-guard-override.md`, `docs/adr/0058-guard-maintenance-window.md`,
`specs/sprint-phoenix-epic/design/gmw-hgo-evidence-intake-into-the-human-ledger.md` (§7.5, §8.1).
Touches (future implementation, not this dispatch): `plugins/pipeline-core/lib/human-guard-override.mjs`,
`plugins/pipeline-core/scripts/guard-human-override.mjs`.

## 0. What this document is

Three related, PO-requested problems in HGO, worked as one design pass because all three
touch the same two files and the PO asked for them bundled:

- **(A)** HGO's fail-closed-at-arming requirement (design §8.1) is currently unsatisfiable
  against HGO's own drift check — a real architectural conflict, reproduced live three times
  this session (once via `PHX-WP-HGO-LEDGER-EMISSION-V3`'s round-trip test, twice more during
  an unrelated ceremony this session).
- **(B)** `humanGuardRouteUnavailableReason`'s digest-withholding comment misrepresents a UX
  nudge as a security boundary. Documentation-only correction, PO-rescoped in-session.
- **(C)** The ceremony requires four PO-relayed command outputs; the PO asked for it to narrow
  to the one step that genuinely needs their private key.
- **(D)** Why the harness's Auto Mode classifier blocks HGO commands is investigated as far as
  this dispatch can go (evidence, not experiment — direct testing is out of scope).

All line numbers below were grepped against this checkout at commit `ec7c11d0` (the commit this
dispatch was pinned to) immediately before this document was finalized; see §6 for the exact
citations re-verified.

## 1. Part A — the fail-closed-at-arming vs. HGO-DRIFT conflict

### 1.1 The mechanism, verified against source

`recordHumanGuardDenial` (`lib/human-guard-override.mjs:1376`) captures a full
`repositoryObservation()` (`:472-482`: `fingerprintSha256`, `head`, `tree`, `statusSha256` —
the sha256 of `git status --porcelain=v1 --untracked-files=all` — and `state`) at the moment an
agent is first denied, and persists it inside the `request` record (`:1449-1468`,
`requestPath`/`writeExclusive` at `:1471`).

Every subsequent ceremony step re-derives a **fresh** `repositoryObservation()` and diffs it
against that frozen, denial-time snapshot:

- `planHumanGuardOverride` (`:1492`) calls `repositoryObservation()` fresh at `:1524` and fails
  `HGO-DRIFT` at `:1529` (`canonical(repository) !== canonical(request.repository)`, alongside
  plugin/policy) the instant anything differs.
- `prepareHumanGuardOverrideAuthorization` (`:1590`) calls `planHumanGuardOverride` again
  internally (`:1605-1613`) — a second fresh observation, same comparison.
- `authorizeHumanGuardOverride` (`:1661`) and `authorizeHumanGuardOverrideBySignature`
  (`:1827`) **each** call `prepareHumanGuardOverrideAuthorization` (which itself calls `plan…`)
  and then call `planHumanGuardOverride` a second time directly (`:1712-1720`, `:1850-1858`) to
  build `capabilityCore.repository` — a third and fourth fresh observation per arm attempt.

So every step from `plan` onward requires the **entire working tree's git-status fingerprint,
HEAD, and tree** to stay byte-identical to whatever it was at the original denial — for as long
as the human ceremony takes, which the PO's own signature step (external, unbounded duration)
guarantees will not be short.

**Both observed failure modes are this exact mechanism, not two different bugs:**

1. **Ledger-append-would-cause-drift** (`PHX-WP-HGO-LEDGER-EMISSION-V3`,
   `backlog/items/2026-08-07-gmw-hgo-evidence-must-reach-the-phoenix-audit-ledger.md`
   "Progress note" 2026-08-19): `appendHumanGovernanceDecision` writes into
   `governance/events/**` inside the tracked worktree without committing — any append between
   denial and the next `repositoryObservation()` call changes `statusSha256`, so
   append-before-arm was "unsatisfiable for every representable decision."
2. **Unrelated commit lands between ceremony steps** (this session, twice, during the
   `hooks.json` author-repair ceremony): a commit landing anywhere in the repo between `plan`
   and `prepare-authorization`, or between `prepare-authorization` and `authorize`, changes
   `head`/`tree`/`statusSha256` and trips the identical `HGO-DRIFT` check — nothing to do with
   the ledger at all.

Both trace to the same root cause: **the comparison target is denial-time state, re-verified in
full at every step, for an unbounded ceremony duration.**

### 1.2 The GMW precedent — verified to actually avoid this, not just claimed to

`installGuardMaintenanceWindow` (`lib/guard-maintenance-window.mjs:503-533`) has its own drift
check (`GMW-DRIFT`, `:528` and `:532`), and it is narrow by construction:

```
repoFingerprintSha256 !== request.subject.repoFingerprintSha256   -> GMW-DRIFT (:527-528)
openingTreeSha256     !== request.subject.openingTreeSha256       -> GMW-DRIFT (:530-532)
```

`repoFingerprintSha256` is the physical root+common-dir identity (`repoFingerprint`, `:284`) —
does not change with commits or working-tree edits. `openingTreeSha256` is a digest of the
**plugin's own source tree** (`pluginTreeSha256`, `:264`, hashing `livePluginRoot`) — a
supply-chain integrity check on the code enforcing the window, not on the calling repository's
working tree at all. **GMW never re-observes the calling repository's HEAD, tree, or git-status
at install time.** The commit/tree pair GMW's signed intent is bound to
(`request.intent.value.candidate`) is captured **once**, at `prepareGuardMaintenanceWindowRequest`
(`:427-499`, `commit`/`tree` read at `:473-474`, folded into `intent` at `:475-484`, the whole
`request` persisted at `:498`), and `installGuardMaintenanceWindow` **reuses that frozen value
unchanged** (`:537-546`, `rebuiltIntent` built from `request.intent.value.candidate`, never from
a fresh `git rev-parse`) to rebuild the intent for signature verification.

This is exactly why GMW's own append-before-arm sequence
(`scripts/guard-maintenance-window.mjs:371-434`, ledger append at `:396-409` **before**
`installGuardMaintenanceWindow` is called at `:419`) does not hit the problem HGO hits: the
ledger append writes to `governance/events/**`, which is not part of `repoFingerprintSha256`
(pure path identity) and not part of `openingTreeSha256` (the plugin's own tree under
`plugins/pipeline-core/`, unrelated to `governance/events/**`). **GMW does not share HGO's
latent issue** — confirmed by tracing the actual check, not assumed from the pattern's name.

### 1.3 Candidates considered

**Candidate 1 — exclude `governance/events/**` from the `statusSha256` preimage.** (V3's own
first suggestion.) Rejected: fixes failure mode 1 only. It does nothing for failure mode 2 (an
unrelated commit landing anywhere else — `.claude/tmp/`, any other file, any other write path)
and would need to be rediscovered and re-patched the next time some other subsystem's
worktree-local write collides with the same check. A point patch on the symptom, not the
mechanism.

**Candidate 2 — commit the ledger append atomically with arming.** Rejected: does not address
failure mode 2 at all (unrelated commits have nothing to do with the ledger). It is also not
well-formed here: `appendHumanGovernanceDecision` is async, its target
(`governance/events/**`) is a tracked-but-uncommitted working-tree file, and HGO's own capability
write lives entirely outside the tracked tree (`.git/agent-pipeline/human-guard-overrides/...`,
`storage()` at `:315-330`). There is no single git commit that could contain both a
capability-arming write (which must never be git-visible — it is a private-directory secret, not
project content) and a ledger event. "Atomic with arming" conflates *durable* with *committed*,
which are not the same property for either artifact here.

**Candidate 3 — thread the pre-append repository observation through to the arm call instead of
re-deriving.** Closest of the three to the actual fix, but underspecified as stated: it does not
say *which* pre-append moment to thread (denial-time still has the whole-ceremony-duration
problem; a moment right before the *specific* append call is arbitrary and does not generalize
past the ledger case to the unrelated-commit case). §1.4 below is this candidate, generalized:
thread the **plan-time** observation, persisted once, reused for the rest of the ceremony, and
narrow what is still compared live.

### 1.4 Decision: persist the plan snapshot once; narrow what stays checked live

Mirror GMW's actual pattern (§1.2) rather than inventing a new one:

1. **`planHumanGuardOverride` becomes get-or-create, not pure.** On the *first* successful call
   for a given `(requestSha256, authorSourceRoot)` pair, take `repositoryObservation()` once,
   check it against `request.repository` (frozen at denial) **narrowly** — `fingerprintSha256`
   and `policyIdentity` only, not `statusSha256`/`head`/`tree`/`state` — and persist the full
   plan payload to a new store (`storage()` gains a `plans` directory alongside `requests`/
   `capabilities`, written with the same `writeExclusive` discipline). Every later call for the
   same pair reads the persisted plan back unchanged (no new observation, no new comparison) —
   the same idempotency callers already rely on today, just backed by a file instead of
   recomputation.
2. **`prepareHumanGuardOverrideAuthorization`, `authorizeHumanGuardOverride`, and
   `authorizeHumanGuardOverrideBySignature` stop calling `planHumanGuardOverride` for a fresh
   observation.** They read the persisted plan (validating the supplied `planSha256` against its
   own stored digest, same defense they apply today). `repository`/`policy`/`plugin` — and, for
   the signed path, the intent's `candidate: {commit, tree}` — are therefore identical from
   `plan` through the PO's actual external signature, by construction, with zero opportunity for
   drift in between regardless of how long the external signing step takes.
3. **A separate, narrow freshness check runs at the moment of arming** (inside
   `authorizeHumanGuardOverride`/`authorizeHumanGuardOverrideBySignature`, after signature
   verification succeeds for the signed path): take **one** fresh `repositoryObservation()`,
   check only `fingerprintSha256` + `policyIdentity` against the persisted plan's values (exactly
   the same narrow shape as step 1), and use *this* fresh observation — not the plan-frozen one —
   as `capabilityCore.repository`. This keeps `capability.repository`'s meaning exactly what it
   is today ("what was live right when the capability armed"), which is what
   `consumeHumanGuardOverride`'s own drift check (`:2030-2037`) compares against next, and that
   comparison window (arm → the guard hook's own immediate retry) stays as tight as it is today —
   **`consumeHumanGuardOverride` needs no change at all**, matching ADR-0059 Decision 2's own
   standing principle ("the consuming side is untouched").
4. **The signed intent's `candidate` always uses the plan-persisted commit/tree, never a fresh
   one at arm time.** This is required, not optional: the PO's signature is over an intent built
   from a specific `(commit, tree)` pair; rebuilding the intent for verification from a
   *different*, freshly-observed pair would either spuriously fail verification (if HEAD moved
   during signing — arguably correct, but for the wrong reason: today's code fails this as
   `HGO-DRIFT` inside the `planHumanGuardOverride` call nested in `authorizeHumanGuardOverrideBySignature`,
   before signature verification is even attempted) or, worse, silently rebind an already-signed
   intent to a commit the PO never saw. Reusing the frozen candidate is the only construction
   under which "presence of a valid, correctly-bound signature IS the authorization" (ADR-0059
   Decision 1) stays true independent of ceremony duration.

### 1.5 Checked against both failure modes

- **Ledger append before arm:** with the fix, `plan`/`prepare-authorization`/(the new
  `prepare-for-signature`, §3) never re-observe after the persisted plan exists, and the arm-time
  freshness check (step 3) compares only `fingerprintSha256`+`policyIdentity` — neither of which
  `governance/events/**` touches (it is not part of physical-identity hashing and not one of
  `policyIdentity`'s five named project files, `:428-434`). A `requested`+`granted` ledger append
  placed between the persisted plan and the arm call, mirroring GMW's own sequence
  (`guard-maintenance-window.mjs:396-419`), can no longer trip a drift refusal. This directly
  closes the V3 blocker and makes design §8.1's fail-closed-at-arming wiring for HGO's `granted`
  transition buildable.
- **Unrelated commit between ceremony steps:** after the first successful `plan` call, no step
  before arming re-observes HEAD/tree/status at all (step 2); the one live check that remains
  (step 3, at arm time) does not look at HEAD/tree/status either — only physical identity and
  policy-file integrity, both of which an unrelated commit to, e.g., `docs/` or `backlog/` never
  touches. A commit landing between `plan` and `authorize`, or during the external signing wait,
  no longer forces a restart.

A fix that only handled one of these (candidates 1 or 2 above) would fail the DoD's explicit
dual-failure-mode check; this one is verified against the actual mechanism behind both, not
against either symptom individually.

### 1.6 What does not change (the security property this exists for)

- The thing actually being authorized — `toolName`, `toolInputSha256`, `denials`, `commandClass`,
  `eligiblePaths`, the rendered `decisionPreview` — is still taken unchanged from `request`
  (denial time) all the way through. Narrowing the *repository-freshness* check does not touch
  *what* the PO is asked to authorize, only *which live-repository snapshot* the arming decision
  is allowed to tolerate.
- `consumeHumanGuardOverride` is untouched: the tight, full-fidelity comparison right before the
  guarded action actually executes (`:2030-2037`, still comparing every field including
  `statusSha256`/`head`/`tree`) is exactly as strict as it is today. That is the correct place for
  the strict check — it is a short, same-session window, unlike the human-ceremony window the
  fix relaxes.
- `authorizeHumanGuardOverride`'s in-session `chat`-mode gate (`readPushApprovalMode` !== "chat"
  refusal, `:1684-1692`) is untouched.
- No capability arms without a durable record of the decision: the persisted `plan` file is
  itself a new durable artifact (written before any signing happens), and the fix is precisely
  what makes the *ledger* append-before-arm buildable, which is the stronger version of that
  property design §8.1 actually asks for.

### 1.7 Residual risk / open questions for the PO (Part A)

- The persisted `plans` store is a new artifact type. It needs its own retention/GC story
  (natural candidate: the same `expiresAt` the request already carries) — not designed here,
  flagged for the implementing dispatch.
- Keying: a plan should be looked up by `(requestSha256, authorSourceRoot)`, since
  `authorSourceRoot` changes `mode`/`sourceRoot` in the payload (`:1533-1541`). The implementing
  dispatch needs explicit test coverage for "same request, different `authorSourceRoot` values"
  not colliding.
- This is a deliberate loosening of a previously-strict check. It needs a regression test in both
  directions: (a) a `statusSha256`/`head`/`tree` change alone, with `fingerprintSha256` and
  `policyIdentity` unchanged, must **not** block `plan` (proves the fix); (b) a `policyIdentity`
  change must **still** block `plan` (proves the narrowing did not become "no check at all").
- The actual CLI-level wiring of append-before-arm for HGO's `granted` transition (a script-level
  orchestration mirroring `guard-maintenance-window.mjs`'s `install` case: append, call
  `authorize`/`authorize-by-signature`, catch and best-effort-revoke on arm failure) is not
  designed in full here — this document resolves the *architectural blocker* the V3 dispatch
  hit; the orchestration itself is the natural next implementation dispatch, now unblocked.

## 2. Part B — the digest-withholding comment

### 2.1 Verified facts

`humanGuardRouteUnavailableReason` (`:1357-1374`) never includes `requestSha256` in its output
for any status other than `planned` (which does not call this function at all — callers print
`{status, requestSha256}` directly for `planned`, e.g. `hooks/guard-gate-strength.mjs:227`). The
header comment above it (`:1300-1321`) claims: *"What it can disclose is bounded by construction
rather than by care."*

This is misleading. `recordHumanGuardDenial` (`:1449-1471`) writes the full request record to
`requestPath(paths, requestSha256)` — predictably named `<paths.requests>/<requestSha256>.json`
(`:1002-1005`) — **unconditionally**, before the status branch that decides whether to withhold
the digest from the rendered stderr text (`:1483-1489`). Any session with ordinary filesystem
read access to `.git/agent-pipeline/human-guard-overrides/requests/` can recover the digest by
reading the newest file there — confirmed live this session
(`backlog/items/2026-08-19-hgo-author-repair-digest-withholding-is-bypassable-by-reading-the-request-store.md`).
The withholding is a stderr-rendering choice, not an access boundary.

The PO's own assessment (2026-08-19, in-session, recorded in the backlog item's Triage section):
the real security property was never digest secrecy. `authorizeHumanGuardOverride` and
`authorizeHumanGuardOverrideBySignature` cannot arm a capability without, respectively, an
explicit in-session `activate: true` gated by `chat` mode (`:1675-1692`) or a genuine Ed25519
signature verified against the committed trust anchor (`:1894-1895`, `verifyAgainstTrustAnchors`)
— "presence of a valid, correctly-bound signature *is* the authorization" (ADR-0059 Decision 1,
`docs/adr/0059-signed-human-guard-override.md:58-64`). Knowing the plaintext digest lets an agent
construct the *next ceremony command*; it does not let it forge a signature or skip the
human-signing step.

No equivalent claim exists elsewhere in this file — grepped for "bounded by construction",
"disclos", "withhold", "security-by-obscurity"; the only hits are this one comment block and one
unrelated use of "disclosing" in `git()`'s error-message comment (`:128`), which makes a narrower,
accurate claim about argv-only error labels and is not affected by this fix. There is no separate
module-level docstring making the same claim to also correct.

### 2.2 Decision

Documentation-only correction to the comment block at `:1300-1321`. No behavior change. No new
mechanism. Candidate directions that would try to actually hide the digest (encrypt the request
store, add a second factor) are explicitly withdrawn per the PO's own re-scoping — hardening a
boundary that was never the real one.

### 2.3 Near-final replacement wording

Replace the two sentences carrying the misleading framing (the rest of the comment — the "only
two tokens" mechanism description — is accurate and unchanged):

**Current** (`:1316-1320`):

```
// What it can disclose is bounded by construction rather than by care. Only two tokens ever
// reach the output, each rendered only if it matches a typed-token shape and is short --
// so no `/`, `\`, `:`, whitespace or newline can pass -- plus a fixed clause selected by
// the observed status. No error message, no stack, no digest, no path. `candidateSourceRoot`
// (the one field of a non-planned outcome carrying an absolute host path) is never read.
```

**Proposed:**

```
// The digest omission below is a UX/attention nudge, not a security boundary: it is meant to
// make a human notice and personally drive a non-planned (e.g. author-repair) ceremony, not to
// keep an agent from learning requestSha256. It does not, because it cannot -- the underlying
// request record is written unconditionally to
// `<paths.requests>/<requestSha256>.json` before this function ever runs (`:1471`), and any
// session with ordinary filesystem read access can recover the digest from there. The real
// security boundary is downstream and unrelated to this rendering: authorizeHumanGuardOverride()
// and authorizeHumanGuardOverrideBySignature() cannot arm a capability without, respectively, an
// in-session activation gated to `chat` mode, or a genuine Ed25519 signature verified against the
// committed trust anchor (ADR-0059) -- neither of which knowing this digest grants. What this
// function still bounds, for its own sake (defense in depth, not the actual access control): only
// two tokens ever reach the output, each rendered only if it matches a typed-token shape and is
// short -- so no `/`, `\`, `:`, whitespace or newline can pass -- plus a fixed clause selected by
// the observed status. No error message, no stack, no digest, no path. `candidateSourceRoot`
// (the one field of a non-planned outcome carrying an absolute host path) is never read.
```

This keeps the accurate mechanical claim (still true and still worth stating) but stops implying
that mechanism is *why* the digest is safe. An implementing dispatch should also sanity-check
`hooks/guard-testpath.mjs:278`'s inline comment ("see its header for the disclosure bound") still
reads correctly against the corrected header — it references the mechanism, which is unchanged,
so no edit is expected there, but it is one hop away and cheap to re-read.

Not required by this fix, but worth carrying forward per the backlog item's own Triage
("Candidate 4… still stands"): a role-contract prohibition against an agent reading the
`human-guard-overrides/requests/` store to *skip asking the PO* (as distinct from reading it
*after* the PO has already authorized proceeding, which is what happened this session) remains a
cheap, real belt-and-braces addition — separate from this documentation fix, and not blocking it.

## 3. Part C — ceremony streamlining

### 3.1 Verified facts, including one discrepancy in the briefing/backlog framing

The CLI (`scripts/guard-human-override.mjs:21-29`) has exactly **five** subcommands today:
`plan`, `prepare-authorization`, `authorize`, `authorize-by-signature`, `verify-audit`. **There is
no `emit-signature-digest` subcommand or exported library function anywhere in
`plugins/pipeline-core/`** — grepped for `emit-signature-digest`/`emitSignatureDigest` across the
plugin tree; zero hits in any `.mjs` file. The name appears only in narrative prose (this
dispatch's own briefing, `backlog/items/2026-08-19-hgo-ceremony-should-reduce-po-involvement-to-only-the-external-signing-step.md`,
and `docs/state.md`), describing a step that was in fact performed **ad hoc** this session — the
digest that gets handed to `po-human-approval.mjs sign-intent --intent-sha256 <sha256>`
(`scripts/po-human-approval.mjs:33`, `:157`) is `createPoApprovalIntent(...).sha256`
(`lib/po-approval-proof.mjs:30`), and nothing in the CLI computes and prints that value today.
The recipe exists only as prose in `authorizeHumanGuardOverrideBySignature`'s own docstring
(`:1811-1818`).

This is a genuine finding, not a nitpick: Part C's new subcommand does not just "collapse three
existing subcommands" — it formalizes a step (digest emission) that currently has **no** CLI form
at all, using the exact recipe already documented in `:1811-1818` and already implemented once,
correctly, inside `authorizeHumanGuardOverrideBySignature` itself (`:1862-1874`).

Also verified: `--reason` on `prepare-authorization` accepts any non-empty ≤500-byte string with
no content validation (`:1601-1604`), which is why `authorizeHumanGuardOverrideBySignature`
already hard-codes `HGO_SIGNATURE_REASON` (`:68`, `:1844`) rather than accepting a caller-supplied
reason for the signed path — the new subcommand follows the same precedent.

### 3.2 Decision: a new `prepare-for-signature` subcommand

Add one subcommand to `scripts/guard-human-override.mjs` that performs, as one call: `plan` (or,
per Part A, reads the already-persisted plan if one exists) → `prepare-authorization` with the
fixed `HGO_SIGNATURE_REASON` → the (newly formalized) digest-emission step, using exactly the
recipe already proven in `authorizeHumanGuardOverrideBySignature` (`:1862-1874`) — and emits only
the final `intentSha256` plus two ready-to-copy command lines. It changes **nothing** about
signature custody: it performs "pure digest computation against data already in the repository"
(ADR-0059 Decision 1's own words, quoted in
`backlog/items/2026-08-19-hgo-ceremony-should-reduce-po-involvement-to-only-the-external-signing-step.md:23`),
never touches a private key, and cannot produce a proof — exactly as true of `plan` and
`prepare-authorization` today.

### 3.3 Exact CLI shape

```
guard-human-override.mjs prepare-for-signature --repo <absolute-root> --request-sha256 <64hex> [--author-source-root <absolute-root>]
```

Flag validation mirrors the existing `plan`/`prepare-authorization` handlers exactly
(`exactFlagSet`, `SHA256.test`, `:92-123`): `repo` and `request-sha256` required,
`author-source-root` optional and, if present, forwarded unchanged to `planHumanGuardOverride`.
No `--reason` flag — the fixed `HGO_SIGNATURE_REASON` constant (`:68`) is used internally,
exactly as `authorizeHumanGuardOverrideBySignature` already does (`:1844`), closing the
unvalidated-`--reason` surface named in §3.1 for this path.

**Output** (new schema `pipeline.human-guard-override-prepare-for-signature.v1`):

```json
{
  "schema": "pipeline.human-guard-override-prepare-for-signature.v1",
  "status": "prepared",
  "root": "<repo.root>",
  "requestSha256": "<64hex>",
  "planSha256": "<64hex>",
  "selectionSha256": "<64hex>",
  "reasonSha256": "<sha256 of HGO_SIGNATURE_REASON>",
  "intentSha256": "<64hex>",
  "expiresAt": "<ISO-8601>",
  "signIntentCommand": {
    "executable": "<process.execPath>",
    "argv": ["<po-human-approval.mjs path>", "sign-intent", "--repo-root", "<repo.root>", "--directory", "<external-po-material-directory>", "--intent-sha256", "<intentSha256>"],
    "mutation": false,
    "requiresConfirmation": true,
    "executionBoundary": "attended-external-terminal"
  },
  "authorizeBySignatureCommand": {
    "executable": "<process.execPath>",
    "argv": ["<guard-human-override.mjs path>", "authorize-by-signature", "--repo", "<repo.root>", "--request-sha256", "<requestSha256>", "--plan-sha256", "<planSha256>", "--proof", "<external-proof.json>"],
    "mutation": true,
    "requiresConfirmation": true,
    "executionBoundary": "local-process"
  }
}
```

`<external-po-material-directory>` and `<external-proof.json>` stay literal placeholders — the
PO's own external signing directory and the proof file it produces are not knowable to this CLI
(same reason `prepareAuthorizationAction`'s existing `argv` already carries a literal
`<human-reason>` placeholder, `:1576`). This is the one field the PO still fills in by hand,
unavoidably: it is PO-local configuration, not ceremony state.

This reduces the PO's own required command-runs from four (`plan`, `prepare-authorization`,
the ad hoc digest step, `authorize-by-signature`) to two (`prepare-for-signature`, then
`sign-intent` + `authorize-by-signature` using the two argv blocks handed back verbatim) —
matching the PO's own framing in the triggering backlog item.

### 3.4 Interaction with Part A's fix

`prepare-for-signature` becomes the normal path by which the persisted plan (§1.4 step 1) gets
created: `plan` and `prepare-authorization` now happen inside one function call instead of two
CLI invocations separated by however long it takes to relay output back to the Elephant, which
means the persisted plan's frozen `repository`/`candidate` snapshot is captured essentially
atomically with the moment the PO ends up signing — closing even the small window that existed
*between* the three collapsed sub-steps themselves. `authorize-by-signature`, called later
(possibly much later, after the external signing wait), reads that same persisted plan per §1.4
step 2 rather than re-observing — so no matter how long signing takes, arming depends only on
`fingerprintSha256`/`policyIdentity` still matching (§1.4 step 3), not on HEAD/tree/status. If a
plan was instead created by a direct, un-collapsed `plan` call (still supported, unchanged usage,
`:92-106`), the same persisted-plan artifact is what `prepare-for-signature` and
`authorize-by-signature` both read — one persistence implementation, not two, is an explicit
implementation invariant for whoever builds this.

### 3.5 What does not change

- Who holds the private key: unchanged. `sign-intent` (`po-human-approval.mjs`) is untouched,
  still PO-run, still the only step that needs the external Ed25519 key.
- `authorize-by-signature` is untouched beyond Part A's internal refactor (§1.4) — it still only
  verifies and arms, still "structurally incapable of producing" a valid signature (ADR-0059
  Decision 1).
- The trust anchor resolution (`project/critical-human-proof.json`, `:1882-1893`) and the
  deliberate absence of a caller-suppliable `--authority` override
  (`scripts/guard-human-override.mjs:150-168`) are untouched.

## 4. Part D — why the Auto Mode classifier blocks HGO commands (hypothesis, not a finding)

**This is an evidence-backed hypothesis, explicitly not a confirmed root cause. It cannot be
confirmed from inside this repository, and this dispatch did not attempt to (out of scope,
per its own Forbidden list).**

Evidence available, all from prose in the two 2026-08-19 backlog items (not independently
re-verified by this dispatch — see the caveat below):

- **Blocked, this session, every time:** direct `guard-human-override.mjs plan` invocation by the
  Elephant ("Permission for this action was denied by the Claude Code auto mode
  classifier... Blocked by classifier"); the same pattern for GMW/push signing ceremonies earlier
  in the session.
- **Not blocked, this session:** ordinary `git`, `node --test`, and other
  `pipeline-state.mjs` invocations (per this dispatch's own briefing).

Candidate hypotheses, none confirmed:

1. Keyed on the script's **path/filename** — anything under
   `scripts/guard-human-override.mjs`/`scripts/guard-maintenance-window.mjs`/
   `scripts/po-human-approval.mjs` (a "signing/authorization family" name pattern) is refused
   regardless of subcommand.
2. Keyed on the **subcommand name** specifically — `plan`/`authorize`/`authorize-by-signature`
   refused, but e.g. `status`/`verify-audit` (read-only, no mutation) might pass; untested this
   session.
3. Keyed on **argv shape** generically — any `node <script under scripts/>` invocation matching
   some broader pattern, independent of which script.
4. Keyed on something outside argv entirely — e.g., a classification of the command's apparent
   intent from surrounding context, which this repo cannot observe or influence.

**Caveat on this dispatch's own evidence quality:** during this dispatch's own background
research, several of *this session's* Bash tool calls were blocked — but by
`guard-lifecycle-ready` (this repo's own in-repo Pipeline guard: `GUARD-PARSE-UNSUPPORTED` for a
`;`-composed command, `GUARD-OPERATOR-UNAPPROVED` for a `|` pipe, `GUARD-REDIRECT-UNAPPROVED` for
`2>`), not by the harness's Auto Mode classifier the briefing and backlog items describe. This
dispatch never itself attempted `guard-human-override.mjs` (forbidden by its own Forbidden list),
so it contributes no new, independently-verified evidence toward Part D — everything in this
section is carried forward from the earlier session's own record, and should be labeled as such
if it is ever cited from this document going forward.

**What would actually confirm this:** trying the built `prepare-for-signature` command (§3) once
it exists, run directly by an agent rather than relayed by the PO, and recording whether it is
blocked and, if so, with what exact classifier message. Until then, the honest state is: HGO
commands are blocked, ordinary commands are not, and the discriminator is unknown.

## 5. Residual risk / open questions for the PO (all parts)

- **(A)** Retention/GC policy for the new `plans` store; exact keying discipline for
  `(requestSha256, authorSourceRoot)`; explicit two-direction regression tests for the narrowed
  check (§1.7). None of these change the recommended direction, all need resolving before or
  during implementation.
- **(A)** The full CLI-level append-before-arm orchestration for HGO's `granted` transition
  (mirroring `guard-maintenance-window.mjs`'s `install` case) is not designed here in
  implementation detail — this document closes the architectural blocker; the orchestration is
  the natural next dispatch.
- **(B)** No behavior change; only the risk of an implementing dispatch treating this as "nothing
  to verify" — a `node --check` pass on the touched file plus a fresh read-through confirming the
  corrected wording matches this document is the right bar, since there is no test to gate a
  comment.
- **(C)** `<external-po-material-directory>`/`<external-proof.json>` stay hand-filled by the PO;
  this is inherent (PO-local configuration this CLI cannot know), not a shortfall of the design.
- **(D)** Genuinely unresolved until tried live; do not let an implementing dispatch quietly
  upgrade this from hypothesis to fact without the confirming trial actually happening.

## 6. Citations re-verified against the pinned commit (`ec7c11d0`) before finalizing this document

`lib/human-guard-override.mjs`: `repositoryObservation` `:472-482`; `recordHumanGuardDenial`
`:1376`, request persistence `:1449-1471`; comment block `:1300-1321`; `humanGuardRouteUnavailableReason`
`:1357-1374`; `planHumanGuardOverride` `:1492`, drift fail `:1529`; `prepareHumanGuardOverrideAuthorization`
`:1590`, reason check `:1601-1604`; `authorizeHumanGuardOverride` `:1661`, chat-mode gate
`:1675-1692`; `authorizeHumanGuardOverrideBySignature` `:1827`, docstring recipe `:1811-1818`,
intent build `:1862-1874`, trust-anchor resolution `:1882-1893`; `consumeHumanGuardOverride`
drift check `:2030-2037`; `HGO_SIGNATURE_REASON` `:68`; `storage()` `:315-330`; `requestPath`
`:1002-1005`; `git()` disclosure comment `:128`.

`lib/guard-maintenance-window.mjs`: `pluginTreeSha256` `:264`; `repoFingerprint` `:284`;
`prepareGuardMaintenanceWindowRequest` `:427-499`, commit/tree capture `:473-474`;
`installGuardMaintenanceWindow` `:503-533`, drift checks `:527-528`, `:530-532`, frozen-candidate
reuse `:537-546`.

`scripts/guard-maintenance-window.mjs`: append-before-install sequence `:371-434`, ledger append
`:396-409`, install call `:419`, best-effort revoke `:420-433`.

`scripts/guard-human-override.mjs`: usage/subcommand list `:21-29`; `plan` handler `:92-106`;
`prepare-authorization` handler `:107-124`; `authorize` handler `:125-149`; `--authority` removal
rationale `:150-168`; `authorize-by-signature` handler `:169-188`.

`scripts/po-human-approval.mjs`: usage string `:33`; `sign-intent` validation `:157`; `sign-intent`
branch `:359-360`.

`lib/po-approval-proof.mjs`: `createPoApprovalIntent` `:30`.

`docs/adr/0059-signed-human-guard-override.md`: Decision 1 `:44-64`; Decision 2 `:66-71`.

`specs/sprint-phoenix-epic/design/gmw-hgo-evidence-intake-into-the-human-ledger.md`: §7.5
`:1118-1194` (candidate source `:1121`, HGO transition table `:1177-1183`); §8.1 `:1198-1251`.

`backlog/items/2026-08-07-gmw-hgo-evidence-must-reach-the-phoenix-audit-ledger.md`: V3 progress
note `:305-345`.

`backlog/items/2026-08-19-hgo-author-repair-digest-withholding-is-bypassable-by-reading-the-request-store.md`:
Triage `:109-139`.

`backlog/items/2026-08-19-hgo-ceremony-should-reduce-po-involvement-to-only-the-external-signing-step.md`:
Description `:13-39`, Proposal `:60-91`.
