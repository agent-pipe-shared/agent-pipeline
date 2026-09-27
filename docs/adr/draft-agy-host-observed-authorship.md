# Draft: Runner-native host-observed authorship and portable evidence

## Status

Proposed on 2026-09-25 for Agy. On 2026-09-27, the PO explicitly extended the
validated-return Host-Commit rule to direct Claude and Codex Goldfish routes,
with independent runner-native event binding for each. This draft is not an
accepted ADR, schema, signer, export format or activation authority. It records
that scope decision; it does not by itself approve architecture activation or
any live runner claim.

## Date

2026-09-25.

## Context

The Antigravity implementation host validates a same-dispatch stream, an exact
structured result file, current attended consent and the Git diff before a
Host-Commit. Claude and Codex expose different native lifecycle events, so a
common dispatcher-authored string cannot establish which child ran, which model
it resolved, or whether its returned bytes belong to that dispatch. The v4
record writer's prior Claude-frontmatter comparison likewise cannot establish
an Agy model: a record-local `modelOverride` is self-declaration, not
independent evidence. ADR-0031 and ADR-0036 distinguish a requested model from
a same-invocation host-observed effective model; none claims cryptographic
provider identity. ADR-0063 places private runtime receipts under
`.git/agent-pipeline/`, which a fresh GitHub clone does not receive. An ignored
`evidence/dispatch-record-*.json` file alone is not a portable model-authority
source.

## Decision proposed

1. Name the strongest attainable claim `host-observed-model`, never
   `provider-attested-model`. The host must bind the same invocation's session,
   runner, role, exact requested and observed model, effort, route-policy
   identity, runner-specific launch authority (including Agy's attended
   consent subject), result-file bytes, final-report digest, admitted paths,
   and the read-back Git commit/parent/tree. Missing, stale or contradictory
   links fail closed.
2. Only a host-owned writer path may publish an authored v4 record after those
   bindings and the normal-hook Host-Commit have been checked. Agy, Claude and
   Codex each require their own native event correlation; one runner's evidence
   cannot authorize another. The public JSON request writer cannot obtain this
   authority by including witness fields, `modelOverride`, or a caller-supplied
   file path. Legacy v3 behavior remains unchanged.
3. The local verifier may report a host-observed binding only by independently
   reading the bounded, physical private host receipt and rechecking its
   hashes, applicable launch authority, result and commit bindings. A valid
   record with a missing private receipt is `UNVERIFIABLE`, never `PASS` by
   self-description. The
   Agy host writes `Agy-Host-Observed: v1`; Claude and Codex write the exact
   `Native-Host-Observed: v1 (<runner>)` marker. Each marker is a routing hint,
   not proof: it can only yield `UNVERIFIABLE` without its applicable local
   receipt or separately approved portable export.
4. A release or external clone that needs portable readback uses a redacted,
   immutable export of the verified local receipt plus its explicit approving
   authority and digest binding. Export approval attests the recorded
   observation and its source, not the provider's cryptographic model identity.
   The PO confirmed the local host-observation plus separately signed,
   redacted-export split. This confirms the policy, not any particular export.
   The `portable-agy-authorship-export.v1` contract now derives its subject
   only after a local Agy authorship PASS, and a clone checks committed bytes,
   Git objects and a proof against the PO trust anchor committed before the
   Agy commit. The actual export still requires its own later PO signature
   and publication; a fixture proof is not release evidence.
   Without that export, a fresh clone
   reports `UNVERIFIABLE` even when local verification had succeeded. That
   portable contract is Agy-specific; a Claude/Codex signed export is not
   provided by this source extension, so those records remain
   `UNVERIFIABLE` in a fresh clone until a separately approved compatible
   export contract exists.
5. Transaction order for each supported host path is validated runner-native
   return → rechecked admission and exact diff → normal-hook Host-Commit →
   exact commit readback → private local observation → exclusive v4 record →
   independent verification. A timeout, changed/unreadable HEAD, commit
   readback mismatch, or record-publication failure after the commit is a
   typed recovery state. It must never publish a no-delivery record or claim
   that the commit did not occur.
6. A child interruption *before* Host-Commit is not `completed-undelivered`:
   that kind states the invocation completed without a delivered Final Return.
   The local candidate uses the existing v4 `stopped-without-commit` kind for
   a separate non-authoring, Critic-required host report with an enumerated
   sanitized reason and dispatch/attempt identity in its bounded log. It may
   be published only after the host independently confirms that HEAD still
   equals the captured pre-launch commit; dirty or untrusted worktree paths
   remain recovery evidence, not claimed delivery. If HEAD changed or cannot
   be read, or if a Host-Commit may already have happened, publish no
   no-commit observation and enter typed recovery instead. This does not
   relabel `completed-undelivered`: an interrupted invocation has a distinct
   outcome, a host-authored report digest, and still requires independent
   Critic resolution. It is source-candidate behavior, not installed-runner
   or provider-backed acceptance evidence. The PO approved this exact
   interruption/no-commit split in chat on 2026-09-25; the decision does not
   itself certify an installed host or authorize a release.

## Consequences

The local candidate can distinguish requested, host-observed and unavailable
model evidence without pretending provider attestation. Claude and Codex
receive no host-commit authority for unmarked, ambiguous, unsupported, or
unvalidated dispatch shapes. Remote clones cannot rederive `.git` host
observations merely from an ignored dispatch record; a portable export is an
additional evidence/approval step. The current v4 schema, writer, verifier and
runner hooks need a coordinated change and an exact candidate-bound review
before any positive authored path is accepted.

## Current implementation boundary

The live host's in-memory model witness now names the exact dispatch,
pre-launch candidate commit and tree, session descriptor and route-policy digest
as well as the observed model, consent subject, exact result-file path, byte
length and digest. The post-commit draft rejects cross-boundary substitutions
of these fields before it can return a record draft. A separate receipt-shape
contract also binds the exact consent scope and record digest, observation
time, and the read-back commit to serialized authored-record bytes. A private
store helper publishes those bytes exclusively under a supplied physical Git
common directory and detects altered bytes or aliases on readback. A new local
reader derives that directory from the primary repository and independently
reopens the descriptor, current signed consent, result bytes, and Git objects;
its temporary-repository test also proves that a fresh clone without the
private receipt remains unverifiable. A distinct host-only writer invokes
that reader before exclusive authored-v4 publication, while the public writer
still rejects it. The Agy route orders validated return, normal-hook
Host-Commit, private receipt, and host-only writer. The PO-directed
Claude/Codex source extension uses its own PostToolUse or
SubagentStart/SubagentStop binding, validates the structured return and
model/session identity, commits only the admitted diff with normal hooks, then
persists private evidence and publishes the v4 record last. Its real
temporary-Git, hook-denial and end-to-end fixtures pass. The general Git-backed
authorship verifier reads the private evidence; an authored record remains
Critic-pending until an independently bound immutable Critic addendum resolves
it. No real provider-backed run, installed-hook observation or final-candidate
independent review has qualified these paths. Consent rotation can make
historical local readback unavailable. This is not a portable export or
provider attestation.

## Rejected alternatives

- Accept a record-local model override or copied witness as proof: the
  producer could mint its own authority.
- Call the Agy model cryptographically provider-attested: the host stream does
  not provide that guarantee.
- Write `completed-undelivered` after an uncertain or observed Host-Commit:
  that would contradict Git history and obstruct recovery.
- Reuse `completed-undelivered` for a child timeout, crash or failed launch:
  that would conflate completed observation with interrupted execution and
  could hide an unexpected child-side commit.

## Affected contracts

- ADR-0031 routing authority; ADR-0036 effective-model observation and trust
  boundary; ADR-0063 private versus portable evidence placement.
- Agy, Claude and Codex native return correlation, Host-Commit admission,
  recovery, and private observation readback.
- v4 dispatch-record schema, exclusive writer, authorship verifier and Critic
  coverage consumers; no legacy v3 semantic change.
- Final candidate evidence export and PO acceptance, if portability is chosen.

## Required verification

For Agy, Claude and Codex independently prove Host-Commit binds exact paths,
result bytes, model/session identity and Git tree; reject forged or switched
models, stale bindings, replaced results, a self-declared override, a
mismatched commit and an inaccessible private receipt. For Claude, exercise
the exact Task/PostToolUse correlation; for Codex, exercise exact
SubagentStart/SubagentStop association, true ambiguity and stale-start expiry.
For every route, exercise normal-hook denial, commit-success/process-error,
timeout and post-commit record-publication failure as recoverable
non-no-delivery states. Before any
pre-commit interruption observation, verify unchanged HEAD and reject changed
or unreadable HEAD, missing attempt identity, fabricated completion, and
automatic retry after a possible child-side mutation. A fresh clone
without a portable export must be `UNVERIFIABLE`; a tampered or wrongly signed
export must not restore `PASS`. None of these fixtures substitutes for one
authorized installed-runner observation per claimed runner and
independent final-candidate Critic review.
