# Sprint Alfred Epic — consolidated design inputs

Status: proposed input index for the current design package. It links sourced
requirements without replacing historical inputs, transcripts, ledger
bindings, or approvals.

## Scope authority

The existing epic remains governed by ADR-0043's 2026-08-17 amendment and
GitHub #108, as recorded in [`prd_sprint-alfred-epic.md`](prd_sprint-alfred-epic.md)
and [`spec.md`](spec.md). Its five tracks and eighteen work packages remain
in scope. The 2026-09-27 greenfield remediation, 2026-09-28 activation,
topology and content-preserving uninstall extension, and design-workflow
requirements remain included. The 2026-10-03 recovery addition is bounded
and does not change backlog or sprint ownership.

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

The bounded interpretation is proposed in
[`design/recovery-availability-2026-10-03.md`](design/recovery-availability-2026-10-03.md):
known-shape intrinsic repair; existing scoped GMW/HGO while verifiable; and
an attended external route when the current verifier or lifecycle cannot
safely act. The external route is not an existing API or accepted policy.

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

## Provenance and readiness limits

The historical PO-input files are distilled records, not original transcript
bytes. This index does not recreate missing raw input. No approval, Advisor
result, independent readiness, Critic review, implementation authority,
native route attestation, host readback, source fix or test result is claimed.
The final workflow must bind actual preserved input bytes and current source
digests before readiness or PO review; this index is not that evidence.
