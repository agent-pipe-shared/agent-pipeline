# ADR-0064: release-preflight consent is a fourth critical-action kind, not a fourth ceremony

> Agent-Pipeline · Nova sprint (`sprint-nova-epic`) · as of 2026-08-16

**Status:** accepted (2026-08-17, PO instruction, chat: *"okay Freigabe für meine
Entscheidungen erteilt setze alles um"* — approval granted, implement
everything) · **Basis:** PO instruction, chat, 2026-08-16, answering a decision
matrix — build this now, and model the ceremony *"möglichst 1:1 mit
signature/chat funktion"* (as close to 1:1 as possible with the existing
push-approval signature/chat mechanism);
`specs/sprint-nova-epic/implementation/issue-acceptance-matrix.md` rows `#56`
(line 46) and `#98` (line 47); `specs/sprint-nova-epic/plans/nova-a.md` Slices
A6/A6R. **Constrained by** [ADR-0061](0061-uniform-human-approval-ceremony.md);
**refines** [ADR-0055](0055-critical-human-proof-waiver.md) and
[ADR-0056](0056-push-approval-mode.md) by adding a kind to their existing
machinery, changing neither.

**Governs:** project/critical-human-proof.json, plugins/pipeline-core/lib/critical-action-approval-request.mjs, plugins/pipeline-core/lib/critical-action-approval-request.test.mjs, plugins/pipeline-core/lib/critical-human-proof-policy.mjs, plugins/pipeline-core/lib/critical-human-proof-policy.test.mjs, plugins/pipeline-core/scripts/po-human-approval.mjs, plugins/pipeline-core/scripts/po-human-approval.test.mjs, plugins/pipeline-core/scripts/release-preflight.mjs, plugins/pipeline-core/scripts/release-preflight.test.mjs, plugins/pipeline-core/scripts/release-preflight-cli.mjs, plugins/pipeline-core/scripts/release-preflight-cli.test.mjs, plugins/pipeline-core/scripts/publication-executor.mjs, plugins/pipeline-core/scripts/publication-executor.test.mjs, plugins/pipeline-core/scripts/publication-gate-evidence.mjs, plugins/pipeline-core/scripts/publication-gate-evidence.test.mjs, plugins/pipeline-core/scripts/push-release-flow-docs-contract.test.mjs, docs/push-release-flow.md

## Context

`release-preflight.mjs` has validated a `consent` object since it shipped:
`validateConsent` demands exactly `{authoritySha256, decisionId, evaluatedAt,
expiresAt, status}` (lines 107-113), and `status !== "approved"` produces the
`consent-not-approved` blocker (line 169). `release-preflight-cli.mjs` reads that
object from `--consent <path>` and passes it through verbatim, with the explicit
comment "This tool never writes 'approved' itself" (line 166). Both halves work.
What does not exist anywhere in the repository is a producer of a *real* consent
object from an actual PO decision.

The gap is measured, not theorised. The only real release-preflight run ever
performed against this repository
(`specs/sprint-nova-epic/evidence/nova-a/a6/release-preflight-report-57ee7e9.json`)
records `"consentInputStatus": "declined"` and states plainly: *"No real PO
consent record exists for this dispatch. A synthetic input with status
'declined' was supplied so the tool never self-supplies 'approved' on the PO's
behalf."* Its consent input
(`specs/sprint-nova-epic/evidence/nova-a/a6/consent-input-57ee7e9.json`) is a
hand-written five-field JSON file. The matrix says the same twice: `#56`'s row
names "a genuinely clean+consented real run … no real PO consent record exists
yet" as an open gap, and `#98`'s row reports the delivery loop honestly stopping
at `prepare` partly because "the real release-preflight evidence … genuinely
reports `consent-not-approved` for this candidate — no PO consent artifact
exists, and none is derivable from anything in the repository."

Meanwhile the mechanism that produces exactly this class of artifact already
exists and is already ADR-0061-conformant for its collapsed prepare+sign step:
`po-human-approval.mjs authorize-critical` prepares a candidate-bound request and
signs that exact request in one invocation (lines 739-760), showing the human
what is being approved immediately before the passphrase prompt (lines 749-758).
`CRITICAL_ACTION_KINDS` (`critical-action-approval-request.mjs:12`) is the only
thing standing between that command and this gate: it is a closed enum of
`["push", "deploy", "publication"]`.

Two scoping facts, stated here so a later reader does not mistake this ADR's
silence for an oversight. First, `#98`'s remaining gaps — R3 (Verify-resume
exercise), R4 (release-path Critic delta lineage), R6 (integrated fixtures) — are
unrelated engineering work, not consent-ceremony design; this ADR does not touch
them, and closing it does not close `#98`. Second, `#98`'s R2 `prepare` leg has a
*second*, independent precondition this ADR also does not address: a
zero-findings native Critic evidence record, plus the fact that
`release-preflight-cli.mjs` emits `extensions.status: "none"` (line 173) while
`publication-executor.mjs` requires `"registered"` with an accepted
`publication-capability-preflight` requirement (lines 582-585). Real consent
unblocks one precondition of one leg; it is not the last one.

## Decision

Add `"release-preflight"` as a fourth `CRITICAL_ACTION_KIND` and derive
`release-preflight.mjs`'s `consent` object from a verified proof of that kind.
The human's part is byte-for-byte the ceremony they already perform for a push:
copy one command, type `approve`, enter the passphrase. No new script, no new
ritual, no new human-facing surface.

Clarification:

- **1. A new kind, not a reused one.** `"release-preflight"` joins `push`,
  `deploy` and `publication` in `CRITICAL_ACTION_KINDS`
  (`critical-action-approval-request.mjs:12`). Reusing `publication` — which
  `#98`'s R2 already uses for the actual publish execution — would collapse two
  decisions taken at two different times into one signature. The preflight
  consent is granted *before* the final gates: `release-preflight.mjs:23`
  registers `verify`/`security`/`critic`/`remote`/`human` and the reducer admits
  them only as `pending` (line 132). The `publication` authorization is granted
  *after* them: `publication-executor.mjs:577-580` requires every one of those
  gates already successful. Reusing `publication` would therefore force the PO to
  sign the publication approval before the gates that inform it, or force the
  preflight to wait for an approval that structurally cannot exist yet. It would
  also destroy the property that a preflight may be declined without touching the
  publish machinery at all. `deploy` is equally wrong: its signed subject is
  `{artifact, environment}` (`critical-action-authorization.mjs:337`) and its
  approvals are consumed by `checkDeployApprovals`. Cross-kind substitution is
  already refused — `kind` is inside the subject digest
  (`critical-action-approval-request.mjs:34`) and `verifySignedAction` rejects a
  kind mismatch outright (`critical-action-authorization.mjs:157`) — so a fourth
  kind adds a fourth binding, not a fourth hole.

- **2. What the consent binds.** `criticalActionSubjectSha256({kind, candidate,
  subject})` already carries the candidate outside `subject` (line 34), exactly
  as for `push` and `deploy`. For this kind the `subject` is:

  ```
  { schema: "pipeline.release-preflight-consent-subject.v1",
    version,                                              // VERSION at the candidate
    base: { commit, tree },
    lifecycle: { featureId, manifestPath, manifestSha256 },
    retentionPolicySha256 }
  ```

  Every field is one `release-preflight-cli.mjs` already observes or receives:
  `version` from the VERSION file (line 95), `base` from `--base` resolved
  through `git rev-parse` (lines 141, 149), `lifecycle` from the lifecycle
  manifest and its digest (lines 154-159), `retentionPolicySha256` from
  `--retention-policy` (line 199). The CLI **rebuilds** this subject from its own
  observations and refuses when the rebuilt digest differs from
  `action.subjectSha256`, mirroring the rebuild-and-verify discipline in
  `critical-action-authorization.mjs:167-179` rather than trusting a recorded
  value. Two deliberate exclusions: `preflightId` is a caller-chosen label
  (`release-preflight.mjs:159`), not a decision, so binding it would only make
  the signature brittle; and the *bound* version is `candidateVersion` (the
  VERSION file's bytes), never the derived `targetVersion`, because
  `release-preflight-cli.mjs:107` deliberately bumps `targetVersion` when the
  three version surfaces disagree — binding that would turn an honest
  `version-decision-mismatch` blocker into a signature failure. Documentation
  digests are not in the subject: they live in the candidate tree, which
  `candidate` already binds.

- **3. The human's part, unchanged.** The command is the one already documented
  in `docs/push-release-flow.md:37-51`, with one flag value changed:

  ```
  node plugins/pipeline-core/scripts/po-human-approval.mjs authorize-critical \
    --repo-root <repo> --directory <external-po-dir> --feature-id <id> \
    --plan <repo-path> --spec <repo-path> \
    --kind release-preflight --subject <repo-path> --expires-at <ISO-8601>
  ```

  Three acts. `parseHumanArgs` accepts the kind through the same single
  membership check it already applies to every `-critical` command
  (`po-human-approval.mjs:354`); the artifact filenames follow the same
  `-critical-${kind}` suffix rule (line 655); the clean-candidate requirement,
  the confirmation token, the passphrase prompt and the proof/signer artifacts
  are all untouched.

- **4. What the command shows at the moment of approval, and the one deviation.**
  ADR-0061 Decision 4 requires the single command's own output to state what is
  being approved. Today `authorize-critical` shows the subject only as a digest
  (`po-human-approval.mjs:753`) — adequate for `push` only because
  `docs/push-release-flow.md:103-110` documents that shape out of band. For this
  kind that is not adequate, so `authorize-critical` gains **one additive,
  kind-agnostic input**: `--subject <repo-relative path>`, a JSON preimage read
  through the existing `readPublicRepositoryFile` primitive
  (`threat-model-approval-request.mjs:30`, already used for `--plan`/`--spec` at
  `po-human-approval.mjs:524-525`). The command recomputes
  `criticalActionSubjectSha256` from that preimage and refuses if it disagrees
  with `--subject-sha256`; when `--subject` is supplied, `--subject-sha256`
  becomes optional and derived, which also retires the "compute the hash by
  importing the real function in a throwaway script" step that
  `docs/push-release-flow.md:120-122` currently instructs an agent to perform.
  This costs the human **zero additional actions** — the agent constructs the
  command either way — and it is optional for `push`/`deploy`/`publication`, so
  no existing invocation changes. This is the minimum necessary deviation from a
  literal 1:1 copy, and it is a strict improvement for the existing kinds too.

  With it, the confirmation summary for this kind reads out the decoded subject
  (release version, base commit, lifecycle feature and manifest, retention policy
  digest) beside the fields already shown, plus a kind-specific scope sentence:
  this consents that a release attempt for the candidate above may be
  **prepared** and taken to the independently operated final gates; it is not a
  release, not a publication authorization, and not a pass of any of those gates
  — `nova-a.md:221` already states "preflight `ready` is not a final gate pass",
  and publication remains a separate `publication`-kind approval. Everything
  displayed is read from the preimage the digest is computed over, never composed
  as a guess, following the discipline `sign-intent` already applies
  (`po-human-approval.mjs:782-792`): the summary is disclosure, the digest is
  authority.

- **5. The field mapping, exactly.** `release-preflight-cli.mjs` gains one input
  pair — the recorded request and the detached proof, both **outside** the
  repository as every PO artifact is (`po-approval-request.mjs:45-49`) — and
  calls `verifyCriticalActionApprovalRequest`
  (`critical-action-approval-request.mjs:81`) with `expectedCandidate` set to its
  own observed HEAD candidate (`release-preflight-cli.mjs:142`), `expectedAction`
  set to the recorded action with its `subjectSha256` **rebuilt** per Decision 2,
  `trustPolicy` resolved from the committed anchors in
  `project/critical-human-proof.json` via `readCriticalHumanProofPolicy`
  (`critical-human-proof-policy.mjs:255`) — never from the external directory,
  per ADR-0056's governing-session rule — and `now` from the wall clock. The
  five-field `consent` object is then:

  | consent field | source |
  |---|---|
  | `authoritySha256` | `verified.proofSha256` (`critical-action-approval-request.mjs:112`) — the digest of the exact signed proof artifact that is the authority |
  | `decisionId` | `request.approvalIntent.sha256` — the intent digest, one per (candidate, action); the same value `authorize-critical` shows the human as "approval intent sha256" (`po-human-approval.mjs:756`) and returns as `intentSha256` (line 760), so a human can match record to ceremony |
  | `evaluatedAt` | the `now` passed to verification, as `Date#toISOString()` |
  | `expiresAt` | `request.action.expiresAt` verbatim — already canonicalised by `criticalRequestFieldError` (`po-human-approval.mjs:507`) and already the field verification enforces (`critical-action-approval-request.mjs:93`) |
  | `status` | `"approved"` **only** on `code === "CRITICAL-ACTION-PROOF-VERIFIED"`; `"expired"` on `CRITICAL-ACTION-PROOF-EXPIRED`; every other code writes nothing and exits non-zero |

  Both digest fields are 64-hex by construction and satisfy `validateConsent`
  (`release-preflight.mjs:109`); both timestamps satisfy its `ISO` regex (line
  21) and its `expiry >= evaluatedAt` rule (line 111). The same values flow into
  `version.decisionId`/`decisionSha256` through the CLI's existing wiring (lines
  110, 152), so the version decision and the consent decision are provably the
  same decision. `"declined"` stays a legal value of the reducer's enum that
  this producer never writes: a cancelled ceremony leaves no proof at all
  (`po-human-approval.mjs:478`), and a producer that cannot tell "cancelled" from
  "never run" must not claim either. Absence and `expired` both reach the same
  `consent-not-approved` blocker (`release-preflight.mjs:169`), so nothing is
  lost. `release-preflight.mjs` itself is **not modified** — it observes no
  clock by design (its docstring, lines 5-11), and expiry enforcement stays where
  the clock already is.

- **6. No new `pipeline.user.yaml` key.** `gates.push_approval`
  (`pipeline.user.yaml:34`) stays exactly what ADR-0056 Decision 1 made it: the
  operator-facing control for **`push`**. ADR-0056 Decision 5 already settled the
  rule for every other kind — "`deploy` and `publication` … have no
  `pipeline.user.yaml` key, and inventing two more would widen the operator
  surface without a request for it" — and `release-preflight` follows it. The
  signature/chat choice for this kind is therefore expressed where it already is
  for the other non-push kinds: `project/critical-human-proof.json`'s
  `requiredKinds`/`waivedKinds`, whose parser accepts the new value the moment
  the enum widens (`critical-human-proof-policy.mjs:283`), and whose waiver route
  `criticalProofWaiverFor` already serves generically (line 342, with the
  `push`-only special case at line 349 untouched). This repository's own policy
  file (lines 3-7) is **not** changed by this ADR; it is GS-2 protected and
  editing it is an operator act outside an agent session (ADR-0056 Decision 7).

  One consequence of that, and it is the one change here that is a tightening
  rather than an addition: once this lands, `release-preflight-cli.mjs` admits a
  hand-supplied `--consent` file carrying `status: "approved"` **only** when the
  project has recorded an explicit, committed, attributed `waivedKinds` entry for
  `release-preflight`. A hand-supplied `declined` or `expired` stays accepted
  unchanged, so the existing sealed evidence run and its
  `consent-input-57ee7e9.json` remain valid and reproducible. An unreadable or
  unparseable policy is not a waiver (`critical-human-proof-policy.mjs:335-336`),
  and resolves to demanding the proof — ADR-0056 Decision 2's "a gate whose
  configuration cannot be read sits at its strongest setting."

- **7. Scope.** This ADR authorizes the consent mechanism. It closes neither
  `#56` nor `#98`. `#56` additionally needs a positive GG-03 binding run and
  NVA-A56-7/8, which live in `publication-executor.mjs`, not in this producer;
  `#98` additionally needs R3, R4, R6 and a zero-findings Critic record. Both
  rows move only on their own Verify/Security/Critic-bound evidence.

## Consequences

**Positive:** the last consent-shaped blocker in Nova A becomes producible by the
ceremony the PO already performs, with the human's part unchanged at three acts —
the first new gate designed *under* ADR-0061 rather than retrofitted against it.
The mechanical footprint is four membership checks and one usage string: the enum
(`critical-action-approval-request.mjs:12`), `criticalActionSubjectSha256` (line
30), `actionValid` (line 52), `parseHumanArgs` (`po-human-approval.mjs:354`) and
`USAGE` (line 35) — `pipeline-state.mjs:355` imports the constant and never uses
it. The `--subject` preimage input makes ADR-0061 Decision 4 satisfiable for
every kind, not just this one. The consent lands inside the preflight record
(`release-preflight.mjs:182`), which is the artifact already sealed as evidence,
so no new durable artifact home is introduced.

**Negative:** the closed enum stops being three and starts being four, and any
future reader must check the per-kind subject shape in two places instead of one
(`docs/push-release-flow.md:103-110` for `push`, this ADR for
`release-preflight`). The ordering constraint the push flow already carries
applies here identically and is unforgiving: the signature binds the exact clean
candidate (`po-approval-request.mjs:36-43` refuses a dirty tree with
`--untracked-files=all`), so every commit between signing and running the
preflight voids it — the interim workflow rule at
`docs/push-release-flow.md:145-162`, unchanged and no better here. The
`--subject` preimage must therefore be readable without dirtying the tree, which
means an ignored location: `/evidence/` (`.gitignore:39`, the machine-regenerated
row of ADR-0063's table).

**Risk:** the projection is the new trust boundary — a bug that maps a
non-verified result onto `status: "approved"` would fabricate exactly the consent
this whole mechanism exists to make unfabricable, and it would look identical in
the sealed record. Mitigated by deriving `approved` from one branch on one
returned code (`CRITICAL-ACTION-PROOF-VERIFIED`), by rebuilding the subject from
observations rather than reading it back (Decision 2), and by requiring the
negative corpus — wrong candidate, wrong kind, expired proof, edited subject
preimage, unknown trust anchor, absent proof — to be exercised before `#56`'s row
moves. Secondary risk: widening `requiredKinds`'s accepted value set means a
project could list `release-preflight` and discover an availability break at
release time, the same class ADR-0056 documented landing on `deploy`; stated here
so it is chosen deliberately rather than discovered.

## Alternatives considered

- **Keep the hand-written `--consent` JSON and call it the PO's decision.**
  Rejected: it is what exists today, and the sealed evidence record already
  refuses to use it for a positive verdict, calling a self-supplied "approved"
  a fabricated positive claim. A gate whose artifact the agent can author is not
  a gate (ADR-0056's rejected alternative: "the agent would control both sides of
  its own gate").
- **Reuse `kind: "publication"` for the preflight consent.** Rejected on
  sequencing evidence, not taste: `publication-executor.mjs:577-580` demands all
  four local gates already successful, while the preflight registers them as
  `pending` (`release-preflight.mjs:132`). One signature cannot honestly cover
  both ends of that ordering.
- **A dedicated `release-preflight-consent.mjs` command for the human.**
  Rejected by ADR-0061 Decision 2 in its own words: "a new gate that introduces
  its own ritual is, by this decision, incorrectly designed." The PO's 2026-08-16
  instruction says the same thing from the other side.
- **A new `gates.release_preflight_approval` key in `pipeline.user.yaml`.**
  Rejected per Decision 6: ADR-0056 Decision 5 already declined to invent
  per-kind keys for `deploy`/`publication`, for the same reason, without a PO
  request. The waiver route is the existing chat-equivalent for non-push kinds.
- **Extend this ADR to cover `#98`'s R3/R4/R6.** Rejected: Verify-resume
  evidence, Critic delta lineage and integrated fixtures are engineering gaps
  with no consent-ceremony content. Bundling them would make an ADR about a human
  gate the gating document for three unrelated dispatches, and would leave a
  future reader unable to tell which part was actually decided here.
- **Put the projection inside `authorize-critical`, so the human's command emits
  the consent file directly.** Rejected by ADR-0061 Decision 3: the projection is
  computable, therefore it is the agent's part. It would also put a kind-specific
  repository write inside the one command that must look identical for every
  kind.

## Follow-up

Proposed 2026-08-16; a human must accept it before it is cited. On acceptance,
dispatch the implementation as one candidate: widen the enum and its four
membership checks, add `--subject` to `authorize-critical` with the kind-specific
confirmation lines, and wire the verified-proof route plus the `approved`-needs-
proof-or-waiver tightening into `release-preflight-cli.mjs` — each with its
negative corpus, then a real attended run producing a genuinely `ready` record
for a clean candidate. Update `docs/adr/README.md` and
`docs/push-release-flow.md` (and its plugin copy) with the fourth kind and the
`--subject` input. `#56`'s and `#98`'s matrix rows move only on their own
Verify/Security/Critic-bound evidence, and `#98` stays open on R3/R4/R6
regardless.
