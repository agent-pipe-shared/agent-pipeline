# Sprint Alfred Epic — consolidated design inputs

Status: proposed input index for the current design package. It links sourced
requirements without replacing historical inputs, transcripts, ledger
bindings, or approvals.

## Scope authority

The existing epic remains governed by ADR-0043's 2026-08-17 amendment and
GitHub #108, as recorded in [`prd_sprint-alfred-epic.md`](prd_sprint-alfred-epic.md)
and [`spec.md`](spec.md). Its five tracks and nineteen work packages (A1–A5,
B1–B3, C1–C3, D1–D4, E1–E4) remain in scope. The 2026-09-27 greenfield
remediation, 2026-09-28 activation, topology and content-preserving
uninstall extension, and design-workflow requirements remain included. The
2026-10-03 recovery addition is bounded and does not change backlog or sprint
ownership.

## Historical sources to preserve

- [`design/po-input-2026-08-27.md`](design/po-input-2026-08-27.md) and
  [`design/po-input-2026-08-28.md`](design/po-input-2026-08-28.md): historical
  distilled input and the later design-depth rejection/rework directive;
  neither is represented here as a verbatim transcript.
- [`design/issue-intake.md`](design/issue-intake.md),
  [`design/backlog-intake.md`](design/backlog-intake.md), and
  [`evidence/issues-snapshot-2026-08-27.md`](evidence/issues-snapshot-2026-08-27.md):
  issue/backlog provenance. The live sprint-assignment reader is authoritative
  over historical counts and snapshot membership.
- [`design/external-research.md`](design/external-research.md) and
  [`design/agent-first-architecture.md`](design/agent-first-architecture.md):
  research and normative architecture doctrine.
- [`design/design-advisory-workflow-input.md`](design/design-advisory-workflow-input.md):
  2026-09-19 distilled workflow input, explicitly not a transcript; it
  requires one Advisor cycle, independent readiness and one final PO package
  decision.
- [`design/greenfield-0.7-remediation-2026-09-27.md`](design/greenfield-0.7-remediation-2026-09-27.md)
  and [`design/greenfield-0.7-additional-scope-2026-09-28.md`](design/greenfield-0.7-additional-scope-2026-09-28.md):
  three-runner remediation and later activation/topology/content-preserving
  uninstall scope. Their evidence limitations remain in force; reports are
  not promoted to confirmed defects without reproduction.
- [`evidence/design-authoring-record.json`](evidence/design-authoring-record.json):
  historical authoring and commit record plus the PRD
  `technical-spec-sha256` invariant. This record is not modified here.

## Latest user requirement and handover

The latest recovery requirement is retained verbatim from the user request:

> dann mach das bitte heile und sorge dafür dass das nicht generell passieren kann. Es muss immer eine möglichkeit geben per maintaince window oder wie auch immer zu reparieren

The bounded interpretation is specified in
[`design/recovery-availability-2026-10-03.md`](design/recovery-availability-2026-10-03.md)
and in `spec.md` §20: known-shape intrinsic repair; existing scoped GMW/HGO
while verifiable; and an attended external route when the current verifier or
lifecycle cannot safely act. The attended external route is an implemented
0.7.0 deliverable (PO decision 2026-10-04 #1), specified in full in Spec §20.1
and accepted by RV-8…RV-11 (Spec §20.3). "There must always be a repair route"
is read as PO decision #15 below states it.

The accompanying Toolbox information is a sanitized handover narrative, not
verified live tool output. It reports a Windows 11 Claude hard crash during
Verify-evidence push preparation, 11 commits, clean Git at abbreviated HEAD
`e564138`, partial recovery-unavailable cleanup, one orphan descriptor with
owner unavailable, retain-only human action, and a PO orphan-release CAS
conflict. Digests were shortened; complete argv and raw JSON were not
provided. This does not establish receipt truncation/staleness, owner death,
the orphan descriptor's schema, or a source fix. Source inspection separately
establishes current V2 null-owner as `unavailable` and V1 field-absent as
`unobserved`; the narrative cannot say which shape occurred. It also lists
R1–R5 and B2; R2/R3 specifics remain unconfirmed. The recovery design holds
P1 first and requires source confirmation before minor changes.

## 2026-10-03 findings round

After the three-runner greenfield tests (local mini HTML game), the PO
supplied observations and three runner analyses (Claude/Windows, Codex,
Antigravity). Live defects were also hit during this repository's bootstrap.
All are held as sanitized summaries with source verification in
[`design/greenfield-0.7-findings-round-2026-10-03.md`](design/greenfield-0.7-findings-round-2026-10-03.md),
and `traceability.md` maps every register ID to its owner and acceptance case
and to its own backlog item or `register only`. The full analysis reports stay
outside the repository because they reference private host material. The
register carries their findings, not their bytes. PO requirements from this
round:

- All three runners walk the happy path. Per feature (one feature, one design
  revision cycle, one push) the PO takes exactly two decisions: the final plan
  approval and the push approval. Each additional push costs one more approval.
  Repository enrollment consent and key setup are one-time acts outside that
  count.
- When a role route fails, an agent may self-dispatch the canonical Advisor
  template as a labelled, non-authorizing substitute. Readiness, Critic and
  plan-verifier evidence always needs a host-observed child.
- Every signature-mode push is signed.
- The round is folded into the complete Alfred scope.

**PO decisions on the revision (2026-10-03).** The PO decided, in chat, to
revise the five sources now, before approval, instead of deferring the
corrections to a document outside them. For the four blocking review points
the Elephant's defaults apply, and the PO may overrule any of them at the final
approval:

1. No post-approval binding document. Every register row is in scope and is
   mapped in `traceability.md`.
2. A fallback self-dispatch never satisfies readiness, Critic or
   plan-verifier; at most it is a labelled Advisor substitute.
3. Executing a `scratch/` script stays fail-closed; there is no content-based
   admission, and the denial names the human route.
4. Every signature-mode push needs a signature. "Two approvals" means the plan
   approval plus the approval of the single push on the happy path; enrollment
   consent and key setup are one-time acts outside the count.

There remains exactly one final PO approval per design. These decisions are
recorded here as PO input in distilled form, not as a transcript. They are not
an approval of the design and not readiness evidence.

### PO decisions of 2026-10-04 (chat, from mobile; options with impact and recommendation were presented)

1. Recovery route (Spec §20, RV-1…RV-11) is delivered completely in 0.7.0,
   including the signed legacy-custody transaction and the attended external
   source/install route.
2. Model-family approval is activated all-or-nothing across runners (no
   per-runner activation scope). When the newest release of an approved family
   is not selectable, the older selectable release is used; a later downgrade
   is refused.
3. Antigravity readiness, Critic and Advisor routes are enabled in 0.7.0
   without a prior host measurement; failures must be typed and visible, and
   the PO's Antigravity host run is the evidence.
4. An unmarked Codex Goldfish dispatch is refused before launch unless the
   briefing states `Host commit: not-requested (reason: …)`.
5. The signing window starts when the signing command is handed over: 60
   minutes by default (configurable 5–120).
6. Direct Elephant design commits use `Dispatch: stage-0 (elephant)` only.
7. Re-enrollment of a repository with retained history is one one-time
   enrollment act.
8. Antigravity lock freshness: session-bound when a session id exists; without
   one, the 30-minute window stays as a labelled compatibility fallback.
9. Uninstall with a foreign Git hook keeps refusing, with a clear code and
   instructions.
10. Chat-mode confirmations happen in the session itself, commit-bound and
    labelled as chat attribution.
11. `standing-approved` projects keep admitting checkpoint pushes without a
    per-push approval.
12. Everything is built to work for all runners and all platforms, in
    consuming user repositories as well, not only in this source checkout.

PO decisions of 2026-10-04, continued (answers to the second independent
readiness review):

13. The PO explicitly confirms a new Advisor course (child of the previous
    terminal course) for this revised design.
14. Critic and plan-verifier on Claude and Antigravity run as hook-observed
    native subagents; the hook coverage in subagents must be measured,
    otherwise the role is unavailable.
15. "There must always be a repair route" means: no dead end; where safe
    repair is impossible (unknown owner, missing proof/key/trust, ambiguous
    bytes) the Pipeline returns a typed result naming the concrete attended
    prerequisite, after which the route applies.
16. Everything during design is done by the agent; the PO signs only once,
    when everything is ready. No terminal command (`!`), no file placement
    and no intermediate signature is asked of the PO for course runs,
    evidence writes, continuity registration or revision cycles.

### PO decisions of 2026-10-06 (chat, during the device switch to the second PC)

Trigger: bringing the IC-2d candidate up on a second PC took hours of blocks
that no agent could clear on its own (toil log T1–T17: a Git for Windows
2.56.0 `NUL` regression hidden behind `GS-GIT-UNAVAILABLE`, pre-ready lockdown
preventing diagnosis, the approval-bound design package stored in the ignored
root `evidence/` and absent on the second device, backlog writes refused,
`reopen-design` as the only recovery, two signatures spent only on continuity
mechanics, signing failing on a missing key-directory setting and on `openssl`
not being on the signing terminal's PATH).

17. Product goal, binding for 0.7.0: the Pipeline is built so that an agent
    flows through bootstrap, install, recovery, device switch and lifecycle
    repair without hurdles. Every block comes with an agent-executable fix;
    the human is needed only where a real signature is required. This makes
    decisions 15 and 16 concrete and is not new authority.
18. The device-switch findings T1–T17 are fixed in the next candidate (0.7.0),
    not deferred: Git null-device handling that works across Git for Windows
    builds; diagnosable preflight failures with a typed read-only probe;
    approval-bound artifacts stored tracked and travelling with the branch,
    with an approval refused up front when a bound path is not tracked;
    backlog and documentation writes admitted in every lifecycle state; a
    rebind-on-another-device route instead of a forced `reopen-design` when
    PRD and spec are unchanged; sanctioned continuity verbs so supersede and
    re-registration need no signature; course outputs writable by the agent;
    lifecycle state committable through its own writer; handover/close
    listing every device-bound artifact; one machine-wide key-directory
    setting; the signing toolchain (`openssl`, key directory, trust anchor)
    checked before a ceremony and resolved by the Pipeline itself; one
    environment readiness report (known-bad Git versions, signing toolchain,
    pre-push hook, tracked digest-bound files) with a typed repair action per
    finding; the same denial and recovery route on the PowerShell and Bash
    lanes.
19. Environment prerequisites are checked at install and bootstrap, reported
    with a concrete repair action, and never discovered for the first time at
    a signature.

### PO decisions of 2026-10-07 (chat, morning; each followed the presented recommendation)

20. Decision #18's "signing toolchain resolved by the Pipeline itself" is
    delivered as a read-only signing-readiness probe with a typed repair the PO
    applies in their own shell; the Pipeline never chooses the executable that
    receives the PO's key.
21. A readiness check runs in the PO's signing terminal BEFORE the signing
    command is handed over, so a signature attempt never discovers a missing
    or unusable `openssl` first (decision #19).
22. A registered authoring dispatch with the same digests whose owner is
    `unobserved` may be superseded without a signature, because supersede is
    non-destructive (bytes and result namespace archived, the owner's later
    integration fails closed).
23. The same applies to a registration of another lineage or a later revision
    whose owner is positively `not-live` or `ended`.
24. The shipped attended orphan-archive route (one PO confirmation with
    attribution, no signature) stays for owners that are `unavailable` or
    `unobserved`; the zero-click route is added only for positively ended
    sessions.
25. A re-approval after a lost bound artifact does not reuse earlier course or
    readiness evidence (fail closed).
26. Parallel subagent dispatch is a required, supported mode on every runner
    and platform: the dispatch-budget accounting must never refuse a call
    because another dispatch holds its lock (toil T19), and this is fixed in
    0.7.0.

27. (Answer to the independent readiness review of 2026-10-07.) Supersede of
    an authoring registration without a signature stays within decisions #22
    and #23: a registration of an earlier revision with different digests is
    eligible only when its owner is positively `not-live` or `ended`; a `live`
    owner is never superseded, and an `unavailable` or `unobserved` owner of
    such a registration takes the §20.2 route.

28. (Decided 2026-10-06 in the morning chat, option "B: Writer exportieren
    (Recommended)", recorded at the time in
    `plans/po-decisions-2026-10-06.md`; carried here so the approved sources
    hold it.) The bootstrap receipt writer is exported in the signed guard
    package and the receipt is recorded by a SubagentStart hook, so the
    receipt means "started under the hook" and no preflight spelling matters
    (T20).

Each decision has an owner and an acceptance case in the "PO decisions → owner
and case" section of `traceability.md`.

## Provenance and readiness limits

The historical PO-input files are distilled records, not original transcript
bytes. This index does not recreate missing raw input. No approval, Advisor
result, independent readiness, Critic review, implementation authority,
native route attestation, host readback, source fix or test result is claimed.
The final workflow must bind actual preserved input bytes and current source
digests before readiness or PO review; this index is not that evidence.
