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

### 1.4 Decision: persist the plan snapshot once; narrow what stays checked live — without decoupling the recorded candidate from what was actually signed, and without dropping the machinery's own code-integrity check

Mirror GMW's actual pattern (§1.2), but the mirror has to be exact, not approximate: GMW's
arm-time check (`installGuardMaintenanceWindow`, `guard-maintenance-window.mjs:503-533`)
re-verifies **two** things fresh, every time — `repoFingerprintSha256` (`:527-528`) and,
critically, `openingTreeSha256` (`:530-532`, `pluginTreeSha256(livePluginRoot)`), i.e. the
**plugin's own source-tree hash**, a code-tamper check on the machinery itself — and it *never*
re-derives the signed `candidate` (commit/tree), which is reused frozen from
`prepareGuardMaintenanceWindowRequest` (`:473-474`, folded into `intent` `:475-484`) all the way
through (`:537-546`, `rebuiltIntent` built from `request.intent.value?.candidate`). Revision 1 of
this section (§1.8) copies both of those properties; the version superseded below copied only the
first.

1. **`planHumanGuardOverride` becomes get-or-create, not pure.** On the *first* successful call
   for a given `(requestSha256, authorSourceRoot)` pair, take `repositoryObservation()` once,
   check it against `request.repository` (frozen at denial) **narrowly** — `fingerprintSha256`
   and `policyIdentity` only, not `statusSha256`/`head`/`tree`/`state` — and persist the full
   plan payload, including `plugin: pluginIdentity(pluginRoot)` (`:377-415`) in the same shape the
   payload already carries it today, to a new store (`storage()` gains a `plans` directory
   alongside `requests`/`capabilities`, written with the same `writeExclusive` discipline). Every
   later call for the same pair reads the persisted plan back unchanged (no new observation, no
   new comparison) — the same idempotency callers already rely on today, just backed by a file
   instead of recomputation.
2. **`prepareHumanGuardOverrideAuthorization`, `authorizeHumanGuardOverride`, and
   `authorizeHumanGuardOverrideBySignature` stop calling `planHumanGuardOverride` for a fresh
   *repository* observation.** They read the persisted plan (validating the supplied `planSha256`
   against its own stored digest, same defense they apply today). `repository`/`policy`/`plugin`
   — and, for the signed path, the intent's `candidate: {commit, tree}` — are therefore identical
   from `plan` through the PO's actual external signature, by construction, with zero opportunity
   for drift in between regardless of how long the external signing step takes.
3. **A separate, narrow freshness check runs at the moment of arming** (inside
   `authorizeHumanGuardOverride`/`authorizeHumanGuardOverrideBySignature`, after signature
   verification succeeds for the signed path) — **revised to check three things, not two**,
   distinguishing what is safe to stop re-checking from what is not:
   - **(3a) The calling repository's working-tree state — safe to narrow; this is what caused
     HGO-DRIFT.** Take one fresh `repositoryObservation()` and compare only `fingerprintSha256`
     against the persisted plan's value; `statusSha256`/`head`/`tree`/`state` are not compared
     here.
   - **(3b) The project's guard/policy configuration — unchanged narrow check.** A fresh
     `policyIdentity(root, pluginRoot, denials)` (`:417-444`) compared against the persisted
     plan's `policy` field.
   - **(3c) NEW — the override machinery's OWN code identity — not safe to stop re-checking;
     restores Finding 2.** A fresh `pluginIdentity(pluginRoot)` (`:377-415`, hashing the plugin
     manifest, the Codex PreTool adapter, the guard-command grammar, `human-guard-override.mjs`
     itself, `windows-private-state.mjs`, and the CLI) compared against the persisted plan's
     `plugin` field. A mismatch fails closed with a new, distinct code, `HGO-PLUGIN-DRIFT`
     (deliberately not the reused `HGO-DRIFT`, so an audit reader can tell a machinery-tamper
     refusal apart from a repository-freshness refusal). This is exactly GMW's own
     `openingTreeSha256` check (`:530-532`) — a supply-chain integrity check on the code enforcing
     the ceremony, unrelated to the calling repository's HEAD/tree/status, and therefore free of
     the HGO-DRIFT problem for the same reason GMW's is: `pluginIdentity()` never reads the
     calling repository's git state at all (`repo`/`pluginRoot` are separate arguments; `:377-378`
     resolves only `pluginRoot`). Restoring this closes the gap the version superseded below
     opened: once step 2 stopped re-observing at every step, nothing re-verified
     `pluginIdentity()` between the first `plan` call and the final arm — an agent with any
     legitimately-obtained, still-live write channel to the plugin root (e.g. a prior GMW window)
     could have modified the override machinery's own code in that gap and gone undetected. It is
     now re-verified at the one point that matters most: immediately before arming.

   This one fresh `repositoryObservation()` (captured for 3a, full shape including
   `head`/`tree`/`statusSha256`/`state`) is what becomes `capabilityCore.repository` — this keeps
   `capability.repository`'s meaning "what was live right when the capability armed", which is
   what `consumeHumanGuardOverride`'s own drift check (`:2030-2037`) compares against next, and
   that comparison window (arm → the guard hook's own immediate retry) stays as tight as it is
   today — **`consumeHumanGuardOverride` needs no change at all**, matching ADR-0059 Decision 2's
   own standing principle ("the consuming side is untouched").
4. **The signed intent's `candidate` always uses the plan-persisted commit/tree, never a fresh
   one at arm time.** This is required, not optional: the PO's signature is over an intent built
   from a specific `(commit, tree)` pair; rebuilding the intent for verification from a
   *different*, freshly-observed pair would either spuriously fail verification (if HEAD moved
   during signing) or, worse, silently rebind an already-signed intent to a commit the PO never
   saw. Reusing the frozen candidate is the only construction under which "presence of a valid,
   correctly-bound signature IS the authorization" (ADR-0059 Decision 1) stays true independent of
   ceremony duration.
5. **NEW — closes Finding 1: `capabilityCore` for the signature path additionally persists the
   exact candidate the PO's signature covers, and arming refuses rather than silently substitutes
   if it no longer matches the live repository.** Add a field, `signedCandidate: { commit, tree }
   | null`, to `CAPABILITY_SCHEMA`'s record shape — populated, for
   `authorizeHumanGuardOverrideBySignature`, from the same plan-persisted values already used to
   build the verified intent in step 4 (`planned.repository.head`/`.tree` — i.e. what the PO
   actually signed, byte-identical by construction, no new observation); `null` for
   `authorizeHumanGuardOverride` (the chat path has no signed-intent concept — Finding 1 is scoped
   to the signature path only). Immediately after signature verification succeeds and the step-3
   fresh `repositoryObservation()` is taken, **for the signature path only**, compare that fresh
   observation's `head`/`tree` against `signedCandidate.commit`/`.tree`. If they diverge — meaning
   at least one commit landed on HEAD after the PO's signature was computed but before this arm
   call — fail closed with a new code, `HGO-CANDIDATE-DRIFT`, instructing the operator to re-run
   `prepare-for-signature` (§3) against the new HEAD and obtain a fresh signature; the capability
   is not written. If they match — the common case, since the tolerated ledger append (failure
   mode 1) never touches `head`/`tree` at all — arming proceeds exactly as before, and
   `capability.repository.head`/`.tree` is now **guaranteed by construction, not by hope,** to be
   bit-identical to `capability.signedCandidate`. This closes the gap at
   `gmw-hgo-evidence-intake-into-the-human-ledger.md:1121`: that document sources the ledger's
   permanent `scope.candidate` from `capability.repository.head`/`.tree` and (`:1138-1143`)
   forbids substituting anything else into it; with this refusal in place,
   `capability.repository.head`/`.tree` can never diverge from what was actually signed and
   survive to arming, so the ledger can never permanently name a commit the PO did not review and
   sign. `capability.signedCandidate` also stays in the persisted record after arming (not
   discarded), giving an independent auditor a self-evident, checkable invariant
   (`repository.head === signedCandidate.commit`) rather than only a runtime refusal to trust.

### 1.5 Checked against both failure modes (Revision 1)

- **Ledger append before arm:** unchanged in effect from the superseded design — `plan`/
  `prepare-authorization`/`prepare-for-signature` (§3) never re-observe after the persisted plan
  exists, and the step-3 checks (3a `fingerprintSha256`, 3b `policyIdentity`, 3c `pluginIdentity`)
  never look at `governance/events/**` (not part of physical identity, not one of `policyIdentity`'s
  five named project files, `:428-434`, and not part of the override machinery's own code tree
  `pluginIdentity()` hashes, `:377-415`). The new step-5 candidate check (`HGO-CANDIDATE-DRIFT`)
  compares only `head`/`tree`, which an uncommitted working-tree append never changes either. A
  `requested`+`granted` ledger append placed between the persisted plan and the arm call, mirroring
  GMW's own sequence (`guard-maintenance-window.mjs:396-419`), still cannot trip any refusal. This
  still closes the V3 blocker and still makes design §8.1's fail-closed-at-arming wiring for HGO's
  `granted` transition buildable.
- **Unrelated commit between ceremony steps:** for the **chat-mode** path, unchanged from the
  superseded design — no step before arming re-observes HEAD/tree/status at all (step 2), and step
  3's checks (3a/3b/3c) never look at HEAD/tree/status either, so an unrelated commit to, e.g.,
  `docs/` or `backlog/` never forces a restart at any point, including at arm time (chat-mode has no
  `signedCandidate`, so step 5 does not apply to it).
  For the **signature** path, this needs a narrower statement than the superseded design gave: an
  unrelated commit landing **before** the PO signs (i.e., before `prepare-for-signature` freezes the
  candidate that gets signed) is still fully tolerated — nothing re-observes HEAD/tree/status during
  that sequencing, exactly as for chat-mode. An unrelated commit landing **after** the PO has already
  signed a specific `(commit, tree)` pair but **before** the final `authorize-by-signature` arm call
  now correctly triggers `HGO-CANDIDATE-DRIFT` (step 5) instead of either the old, opaque,
  whole-ceremony `HGO-DRIFT` (the original bug) or a silent substitution of an unsigned commit into
  the permanent ledger (Finding 1's gap). This is not a reopening of the original problem: it is a
  materially narrower, later, and unavoidable consequence of what a commit-bound cryptographic
  signature *means* — the PO's signature cannot retroactively cover a commit it never saw, no matter
  how the ceremony is otherwise relaxed, and step 4 (unchanged) already relies on this same
  principle for verification. The operator-facing cost is a re-sign against the new HEAD, not a full
  restart of the ceremony from denial.

A fix that only handled one of these (candidates 1 or 2 above) would still fail the DoD's explicit
dual-failure-mode check; this revision is still verified against the actual mechanism behind both,
not against either symptom individually, and additionally closes the two gaps the superseded
version of this section left open (see §1.8).

### 1.6 What does not change (the security property this exists for) (Revision 1)

- *(Unchanged from the superseded design.)* The thing actually being authorized — `toolName`,
  `toolInputSha256`, `denials`, `commandClass`, `eligiblePaths`, the rendered `decisionPreview` —
  is still taken unchanged from `request` (denial time) all the way through. Narrowing the
  *repository-freshness* check does not touch *what* the PO is asked to authorize, only *which
  live-repository snapshot* the arming decision is allowed to tolerate.
- *(Unchanged, strengthened.)* `consumeHumanGuardOverride` is untouched: the tight, full-fidelity
  comparison right before the guarded action actually executes (`:2030-2037`, still comparing
  every field including `statusSha256`/`head`/`tree`) is exactly as strict as it is today, and now
  compares against a `capability.repository` that, for the signature path, is additionally
  guaranteed (step 5) to equal what was actually signed — a strictly stronger guarantee than the
  superseded design gave, not a weaker one.
- *(Unchanged.)* `authorizeHumanGuardOverride`'s in-session `chat`-mode gate
  (`readPushApprovalMode` !== "chat" refusal, `:1684-1692`) is untouched.
- *(Unchanged.)* No capability arms without a durable record of the decision: the persisted `plan`
  file is itself a new durable artifact (written before any signing happens), and the fix is
  precisely what makes the *ledger* append-before-arm buildable, which is the stronger version of
  that property design §8.1 actually asks for.
- **NEW, restored by this revision:** the override machinery's own code identity
  (`pluginIdentity()`) is re-verified fresh at every arm, not only at the first `plan` call —
  closing the window (Finding 2) in which the superseded design's step 2 had silently also stopped
  re-verifying the one thing GMW's own precedent (`installGuardMaintenanceWindow`'s
  `openingTreeSha256` check, `:530-532`) treats as *never* safe to stop checking; see also
  ADR-0058's own "recursive-verifier hole" concern (`docs/adr/0058-guard-maintenance-window.md:47-48`)
  — the window's/ceremony's own verifying code must itself stay permanently un-liftable from live
  re-verification — restored here for HGO's arm-time check.
- **NEW, restored by this revision:** `capability.repository.head`/`.tree` (the field
  `gmw-hgo-evidence-intake-into-the-human-ledger.md:1121` sources the ledger's `scope.candidate`
  from) can no longer diverge from what the PO's signature actually covers and still arm —
  enforced structurally by step 5's refusal, not left as a documented residual risk.

### 1.7 Residual risk / open questions for the PO (Part A) (Revision 1)

- *(Unchanged from the superseded design, still open.)* The persisted `plans` store is a new
  artifact type. It needs its own retention/GC story (natural candidate: the same `expiresAt` the
  request already carries) — not designed here, flagged for the implementing dispatch.
- *(Unchanged, still open.)* Keying: a plan should be looked up by `(requestSha256,
  authorSourceRoot)`, since `authorSourceRoot` changes `mode`/`sourceRoot` in the payload
  (`:1533-1541`). The implementing dispatch needs explicit test coverage for "same request,
  different `authorSourceRoot` values" not colliding.
- *(Unchanged, still open.)* This is a deliberate loosening of a previously-strict check. It
  needs a regression test in both directions: (a) a `statusSha256`/`head`/`tree` change alone,
  with `fingerprintSha256` and `policyIdentity` unchanged, must **not** block `plan` (proves the
  fix); (b) a `policyIdentity` change must **still** block `plan` (proves the narrowing did not
  become "no check at all").
- *(Unchanged, still open.)* The actual CLI-level wiring of append-before-arm for HGO's `granted`
  transition (a script-level orchestration mirroring `guard-maintenance-window.mjs`'s `install`
  case: append, call `authorize`/`authorize-by-signature`, catch and best-effort-revoke on arm
  failure) is not designed in full here — this document resolves the *architectural blocker* the
  V3 dispatch hit; the orchestration itself is the natural next implementation dispatch, now
  unblocked.
- **NEW:** `HGO-PLUGIN-DRIFT` and `HGO-CANDIDATE-DRIFT` need their own explicit, both-directions
  regression tests in the implementing dispatch: (a) a benign `statusSha256`/`head`/`tree`-only
  change between plan and arm must **not** trip either new code (proves steps 3c/5 stayed narrow);
  (b) a hand-tampered byte in any of `pluginIdentity()`'s six hashed files between plan and arm
  must trip `HGO-PLUGIN-DRIFT`; (c) a commit landing on HEAD between signing and arming, for the
  signature path only, must trip `HGO-CANDIDATE-DRIFT`, and the chat path must never be able to
  trip it (it has no `signedCandidate`).
- **NEW:** the operator-facing re-sign flow after an `HGO-CANDIDATE-DRIFT` refusal (re-run
  `prepare-for-signature` against the new HEAD, obtain a fresh signature) is not designed in
  CLI/UX detail here — a natural companion to the append-before-arm orchestration already flagged
  above, not blocking this document.
- **NEW:** adding `signedCandidate` is an additive field on the existing
  `pipeline.human-guard-override-capability.v2` shape (`CAPABILITY_SCHEMA`). Whether that warrants
  a `v3` schema bump or ships as a backward-compatible additive field on `v2` is a decision for the
  implementing dispatch, not resolved here; either way, existing `v2` readers that do not know the
  field must not fail on records that carry it.

### 1.8 Revision 1 — response to Critic round 1 findings

This subsection documents exactly what changed in §1.4 (and the downstream §1.5-§1.7) versus the
version reviewed in Critic round 1, mapped to the two blocker findings by the exact labels the
review used, so a re-reviewer can map this revision to what it fixes without re-deriving it.

**Finding 1 (blocker, signature path)** — "the design decouples the arm-time-fresh
`capabilityCore.repository`... from the plan-time-frozen signed-intent `candidate`... nothing in
the persisted `capabilityCore`... retains the actually-signed `candidate` for comparison... the
ledger's `granted` record can permanently name a commit the PO never reviewed or signed, with no
compensating detection."

Closed by revised §1.4 step 5: `capabilityCore` now carries a `signedCandidate: {commit, tree} |
null` field (signature path only), copied from the exact plan-persisted values already used to
build the verified intent (§1.4 step 4, unchanged) — never re-derived, so it is byte-identical to
what the PO signed by construction. Immediately after signature verification succeeds, the fresh
arm-time `repositoryObservation()` (already being taken for step 3a) is additionally compared,
`head`/`tree` only, against `signedCandidate`; a mismatch fails arming closed with a new code,
`HGO-CANDIDATE-DRIFT`, rather than arming with — and permanently recording, via
`gmw-hgo-evidence-intake-into-the-human-ledger.md:1121`'s `scope.candidate` sourcing — a commit the
PO never reviewed. On the match case (the common one), `capability.repository.head`/`.tree` is
bit-identical to `signedCandidate` by construction. This is the "detect and refuse" resolution the
finding explicitly accepted as sufficient; it is a structural refusal, not a documented residual
risk, and it is not listed in §1.7/§5's residual-risk sets.

**Finding 2 (blocker, both chat and signature paths)** — "`pluginIdentity()`... the check that
detects tampering with the override machinery's own code... [is] dropped... entirely after the
first `plan` call... an agent with any legitimately-obtained, still-live write channel to the
plugin root... could modify the override machinery's own code between plan-time and the final arm
call, and nothing would catch it."

Closed by revised §1.4 step 3c: a fresh `pluginIdentity(pluginRoot)` is now re-verified at every
arm call (both `authorizeHumanGuardOverride` and `authorizeHumanGuardOverrideBySignature`),
compared against the plan-persisted `plugin` field, failing closed with a new, distinct code
`HGO-PLUGIN-DRIFT` on mismatch. This restores, at arm time specifically, the exact property GMW's
own `installGuardMaintenanceWindow` re-verifies at every install via `openingTreeSha256`
(`guard-maintenance-window.mjs:530-532`) — a supply-chain check on the code enforcing the ceremony,
not on the calling repository's working tree, and therefore free of the HGO-DRIFT problem (§1.2)
for the identical reason GMW's is. §1.4 step 3 is now explicit that "the calling repository's
working-tree state" (3a — safe to narrow, correctly dropped, the actual HGO-DRIFT cause) and "the
override machinery's own code identity" (3c — never safe to drop) are two different things; the
superseded step 3 conflated them into one narrowing that dropped both together.

**What did not change:** §1.1-1.3 (problem statement, GMW precedent analysis, candidates
considered) are untouched by this revision — it does not reopen or reargue the original conflict,
only the mechanism that resolves it. §1.4 steps 1, 2, and 4 are unchanged from the superseded
design (still get-or-create plan persistence, still no fresh repository re-observation between
plan and arm, still the frozen candidate for signature verification). Part B (§2), Part C
(§3.1-3.3, 3.5) and Part D (§4) are untouched; §3.4 gets one clarifying addendum (below) for
consistency with the revised §1.4, not a rewrite.

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

**Revision 1 addendum:** the persisted plan `prepare-for-signature` creates is also the exact
source of `signedCandidate` (§1.4 step 5, §1.8) — no new call or artifact is needed;
`authorizeHumanGuardOverrideBySignature` populates `capabilityCore.signedCandidate` from the same
persisted-plan `repository.head`/`.tree` it already reads for intent verification (§1.4 step 4). If
`authorize-by-signature` fails with the new `HGO-CANDIDATE-DRIFT` code (a commit landed on HEAD
between signing and arming), the correct recovery is to re-run `prepare-for-signature` against the
new HEAD and obtain a fresh signature — retrying `authorize-by-signature` against the stale proof
cannot succeed.

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
- **(A, Revision 1)** `HGO-PLUGIN-DRIFT`/`HGO-CANDIDATE-DRIFT` both-directions regression tests,
  and the operator-facing re-sign UX after an `HGO-CANDIDATE-DRIFT` refusal, are flagged for the
  implementing dispatch, not designed in full here (§1.7, §1.8).
- **(A, Revision 1)** Whether `signedCandidate` ships as a `v3` schema bump or an additive `v2`
  field on `CAPABILITY_SCHEMA` is left to the implementing dispatch (§1.7).
- **(B)** No behavior change; only the risk of an implementing dispatch treating this as "nothing
  to verify" — a `node --check` pass on the touched file plus a fresh read-through confirming the
  corrected wording matches this document is the right bar, since there is no test to gate a
  comment.
- **(C)** `<external-po-material-directory>`/`<external-proof.json>` stay hand-filled by the PO;
  this is inherent (PO-local configuration this CLI cannot know), not a shortfall of the design.
- **(D)** Genuinely unresolved until tried live; do not let an implementing dispatch quietly
  upgrade this from hypothesis to fact without the confirming trial actually happening.

## 6. Citations re-verified against the pinned commit (`ec7c11d0`) before finalizing this document

**Revision 1 addendum:** the citations below marked "(Revision 1)" were newly introduced by
`PHX-WP-HGO-FAILCLOSED-DESIGN-REWORK1` and were opened and confirmed directly against this
checkout at commit `56cf4c43a46025a4b0ec814143e0e13dca837962` (the base this rework dispatch was
pinned to) before this revision was finalized; all other citations below were carried forward
unchanged from the original dispatch's own `ec7c11d0` verification.

`lib/human-guard-override.mjs`: `repositoryObservation` `:472-482`; `recordHumanGuardDenial`
`:1376`, request persistence `:1449-1471`; comment block `:1300-1321`; `humanGuardRouteUnavailableReason`
`:1357-1374`; `planHumanGuardOverride` `:1492`, drift fail `:1526-1529`; `prepareHumanGuardOverrideAuthorization`
`:1590`, reason check `:1601-1604`, nested plan call `:1605-1613` (Revision 1); `pluginIdentity`
`:377-415` (Revision 1); `policyIdentity` `:417-444` (Revision 1); `authorizeHumanGuardOverride`
`:1661`, chat-mode gate `:1675-1692`, nested prepare call `:1697-1707` (Revision 1), nested plan
call `:1712-1720` (Revision 1), capabilityCore build `:1725-1747` (Revision 1), reuse/write path
`:1748-1793` (Revision 1); `authorizeHumanGuardOverrideBySignature` `:1827`, docstring recipe
`:1811-1818`, nested prepare call `:1839-1849` (Revision 1), nested plan call `:1850-1858`
(Revision 1), intent build `:1862-1874`, trust-anchor resolution `:1882-1893`, verification
`:1894-1895` (Revision 1), capabilityCore build `:1902-1924` (Revision 1), reuse/write path
`:1925-1969` (Revision 1); `consumeHumanGuardOverride` drift check `:2030-2037`;
`HGO_SIGNATURE_REASON` `:68`; `storage()` `:315-330`; `requestPath` `:1002-1005`; `git()`
disclosure comment `:128`.

`lib/guard-maintenance-window.mjs`: `pluginTreeSha256` `:264`; `repoFingerprint` `:284`;
`prepareGuardMaintenanceWindowRequest` `:427-499`, commit/tree capture `:473-474`;
`installGuardMaintenanceWindow` `:503-533`, drift checks `:527-528`, `:530-532`, frozen-candidate
reuse `:537-546`.

`docs/adr/0058-guard-maintenance-window.md`: "recursive-verifier hole" `:47-48` (Revision 1).

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
