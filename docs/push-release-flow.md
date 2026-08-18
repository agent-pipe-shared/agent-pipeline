# Push & release flow — end to end, as it actually works today

> Read this once per session before a branch push or a `main` release. It
> exists because the 2026-08-07 0.5.2 release session rediscovered this same
> flow live, by trial and error, including two wrong assumptions corrected
> only by a failing guard message — see
> `backlog/items/2026-08-07-push-release-flow-unusable-for-third-party-adopters.md`
> for the finding this document is the first remediation step for.

This repo's own `pipeline.user.yaml` sets `gates.push_approval: signature`
([ADR-0056](adr/0056-push-approval-mode.md)) — the strictest of the two
supported modes. Everything below describes that mode. A repo configured for
`chat` mode skips layers 2+3 entirely: `pipeline-state.mjs approve-push`
takes only `--by --remote --destination`, no proof files, and the human
clears it by typing a confirmation in-session rather than signing anything.

**2026-08-18 update (PHX-WP-PORT-ADR0061-AUTHORIZE-CRITICAL):** layers 2 and 3
below are now collapsed into `authorize-critical`, and layer 5's `OVERRIDE
GG-03` ritual is unaffected by this port (that layer's own design question is
still tracked in
`backlog/items/2026-08-07-push-release-flow-unusable-for-third-party-adopters.md`
candidates #2-#4 and this port's own forbidden-scope note) — see
[ADR-0065](adr/0065-port-authorize-critical-ceremony.md).

## The five layers, in order

Five authorization layers, plus one preparatory step (1b) that authorizes
nothing and gates nothing at the push itself — it exists so that the range being
signed for has been compared against the decisions that govern it.

### Layer 1 — decide a push needs a signature at all

Governed by `gates.push_approval` in `pipeline.user.yaml`. In `signature`
mode (this repo), every push to a gated destination needs a detached Ed25519
proof, signed with a private key that lives **outside this checkout**, before
`git push` will be allowed through. This is intentional and load-bearing:
the agent is cryptographically incapable of producing this proof by design
(`docs/adr/0055-critical-human-proof-waiver.md`,
`docs/adr/0056-push-approval-mode.md`).

### Layer 1b — reconcile the range against the decisions that govern it (agent work, before anything is signed)

```
node harness/scripts/check-doc-reconciliation.mjs --base <base> --candidate <tip>
```

Run this before preparing a request, not after. It fails when the range changed
a path some ADR declares it governs and no entry in `docs/doc-reconciliation.md`
names that exact candidate commit. Both arguments are required by design and
every output repeats the resolved range: a reconciliation claim that does not
say which range it covers is not a claim.

Resolve each finding either by amending the ADR or by recording it as checked,
then **commit the record last** — writing it moves `HEAD`, so the record names
the tip of the substantive work and the push carries one extra commit touching
only that file. The format and this write-order rule are documented in the
record file itself.

Why this sits before the signature rather than in a checklist: the session that
prepares a push is routinely not the session that did the work, and a compact
sits between them more often than not. An obligation recorded in the handover
lasts one context window; one bound to a commit does not expire. What it buys is
that nobody can *skip* the question — it cannot establish that the answer was
given carefully.

### Layers 2+3 — prepare and sign the request, in one command (human-only; ADR-0061 port)

> **PHX-WP-PORT-ADR0061-AUTHORIZE-CRITICAL (2026-08-18):** the old two-step
> `prepare-critical`/`approve-critical` split described below this note used to
> be the only path. It had a demonstrated failure mode — a failed
> `prepare-critical` left a stale request on disk that a later, decoupled
> `approve-critical` then silently signed, because the two commands never bound
> to the same in-memory request. `authorize-critical` (ported from
> origin/main's ADR-0061, "one ceremony for every human gate" — not tracked on
> this branch, hence no link here; this
> repo's own port is recorded in
> [ADR-0065](adr/0065-port-authorize-critical-ceremony.md)) closes that gap by
> construction: it builds the request and signs *that exact object* inside one
> invocation, so nothing already sitting on disk can ever be the thing that
> gets signed. `prepare-critical`/`approve-critical` still exist in
> `po-human-approval.mjs` for scripted/two-step use, but this is now the
> command a session should hand the PO for push/deploy/publication approval.

```
node plugins/pipeline-core/scripts/po-human-approval.mjs authorize-critical \
  --repo-root <repo> --directory <external-po-dir> \
  --feature-id <featureId> \
  --plan <repo-relative-PRD-path> --spec <repo-relative-spec-path> \
  --kind push --subject-sha256 <hash> --expires-at <ISO-8601>
```

This is **one PO-run command, not two.** Unlike the old `prepare-critical`
step, `authorize-critical` is not agent-eligible even in design intent — it
reads the private key and prompts for the passphrase, so it belongs on the
approving human's terminal from the start (`po-approval-gate.mjs`, the
agent-facing control plane, deliberately cannot reach it at all — same as
`setup`/`approve`/`approve-critical`/`sign-intent`). The agent still
constructs the exact command and computes `--subject-sha256`; the PO copies
it, types `approve` at the confirmation prompt (which states the action kind,
candidate commit/tree, subject digest, feature id and expiry, and explicitly
what the approval does *not* cover, before asking for the passphrase — ADR-0061
Decision 4), and enters the OpenSSL passphrase. That is the entire human part.

**`--repo-root` must be a checkout that is clean including untracked files**
(`observeCleanCandidate`). In this repository the main checkout can never
satisfy that: `.claude/settings.json`, `project/pipeline-state.json` and
`project/resume-hint.json` are tracked and permanently modified. Point
`--repo-root` at the detached verify worktree instead, after moving it to the
candidate — that is what it exists for.

**`--expires-at` is normalized, not rejected**, as long as `Date.parse` accepts
it — pass any parseable ISO-8601 timestamp; the command canonicalizes it to the
exact round-trip form before computing the digest.

Computing `--subject-sha256` correctly matters: it is
`criticalActionSubjectSha256({kind, candidate:{commit,tree}, subject})` from
`plugins/pipeline-core/lib/critical-action-approval-request.mjs`, and for
`kind: "push"` the exact bound `subject` shape (from
`authorizeRecordedPush` in `critical-action-authorization.mjs`) is
`{ sourceCommit, remote, destination, threatModel: { path, sha256 } }` where
`threatModel` is the fixed, repo-relative
`specs/sprint-nova-epic/implementation/critical-action-authorization-threat-model.md`
binding. Compute it by **importing the real function** in a throwaway script
(`scratch/`, gitignored) — never hand-roll the hash. A wrong hash fails
closed at verification, it does not silently accept.

**Finding the right external directory:** more than one candidate directory
may exist on a machine (e.g. one per repo this Pipeline governs). Verify by
comparing that directory's `po-public.pem` SHA-256 against this repo's own
committed `project/critical-human-proof.json` → `trustAnchor.publicKeySha256`
— **never** by filesystem timestamps or guessing from directory naming. A
mismatch fails closed with `CRITICAL-PROOF-TRUST-ANCHOR-MISMATCH`; treat that
error as the check, not a surprise.

<details>
<summary>Superseded — the old two-step form (kept for reference; still callable, no longer the recommended path)</summary>

`prepare-critical` (agent-eligible by design, guard-blocked in practice —
`<external-po-dir>` sits outside the project root, so
`guard-lifecycle-ready.mjs`'s cross-repository-mutation check refuses the
write regardless of the script's own intent) wrote a public,
candidate-bound `request-critical-<kind>.json`; `approve-critical` then
separately read *whatever* file was sitting at that path and signed it. The
two commands never shared state beyond the filesystem, which is exactly what
made the stale-request failure mode possible: a failed `prepare-critical` left
the previous run's request on disk, and `approve-critical` signed it without
noticing the subject had changed. `authorize-critical` above replaces this for
ordinary use; the two-step form remains for any caller that genuinely needs
prepare and sign as separate steps (e.g. scripted preparation with signing
deferred to later).

```
node plugins/pipeline-core/scripts/po-approval-gate.mjs prepare-critical \
  --repo-root <repo> --directory <external-po-dir> \
  --feature-id <featureId> \
  --plan <repo-relative-PRD-path> --spec <repo-relative-spec-path> \
  --kind push --subject-sha256 <hash> --expires-at <ISO-8601>
node plugins/pipeline-core/scripts/po-human-approval.mjs approve-critical \
  --repo-root <repo> --directory <external-po-dir> --kind push
```

</details>

### Layer 4 — consume the proof into pipeline state (agent work)

```
node plugins/pipeline-core/scripts/pipeline-state.mjs approve-push \
  --by <name> --remote <remote> --destination refs/heads/<branch> \
  --proof-request <path-to-request-critical-push.json> \
  --proof-authority <path-to-trust-policy.json> \
  --proof <path-to-proof-critical-push.json>
```

`--destination` must match `^refs/heads/[A-Za-z0-9._/-]{1,200}$` — **tags
are structurally out of scope for this mechanism** (see Release addendum
below). The candidate commit/tree observed at run time must exactly match
what the signature was computed over, or this fails closed
(`gitCandidate(dir).commit !== head.commit`). This step is ordinary agent
work — no human action needed here beyond having already produced the proof.

### Layer 5 — execute the push (dual-gated: Pipeline + Claude Code harness)

**The push command's refspec must be the full `<source>:refs/heads/<branch>`
form**, matching what `approve-push` already recorded via its own
`--destination refs/heads/<branch>`. A bare branch name (`git push origin
<branch>`, no colon) leaves the push guard's own refspec parser unable to
populate a destination, and `authorizeRecordedPush` then fails its
input-validation guard and returns `PUSH-PROOF-INPUT-INVALID` — a code that
reads like "the recorded approval is malformed" but actually means "the push
command left its destination implicit." The identical push written as
`git push origin <branch>:refs/heads/<branch>` succeeds against the exact
same recorded approval
(`backlog/items/2026-08-09-bare-branch-name-in-git-push-fails-approval-with-a-misleading-code.md`).

Once `approve-push` succeeds, the actual `git push` still passes through
`guard-git.mjs`'s `GG-03` (refuses any direct write to `main`/protected
branches without the documented double-confirmation override —
`guardrails/git.md` §"Double-confirmation override procedure": the agent
explains the command/reason/risk, the PO replies the literal `OVERRIDE
GG-03`, the agent arms `PIPELINE_GUARD_OVERRIDE="GG-03|<token>|<reason>" git
push ...` with a one-time `YYYYMMDD-<n>` token, logged to
`project/guard-override.log.jsonl`). A push to a **non-`main`** branch with a
valid `approve-push` record does not need this — GG-03 is specifically the
`main`/protected-branch line of defense, a second, independent check beyond
the signature already verified in Layer 3-4.

**Separately, and invisibly to the Pipeline**, Claude Code's own harness-level
"auto mode classifier" may refuse the actual `git push`/`git restore`
invocation regardless of Pipeline-side clearance — this is outside the
Pipeline's control or visibility, undiscoverable except by attempting the
exact command. When it fires, the only resolution today is the PO running
the identical, already-Pipeline-authorized command in their own terminal.
This compounding is tracked as its own finding:
`backlog/items/2026-08-07-push-release-flow-unusable-for-third-party-adopters.md`.

## Release addendum — tag + GitHub release

`approve-push`'s destination regex only ever matches `refs/heads/*`, so a
`git push origin <tag>` is refused (`PUSH-PROOF-INPUT-INVALID`) no matter how
it's signed. The working path used for `v0.5.2` was `gh release create`,
which is **not intercepted by any push guard** (it calls the GitHub API
directly, not `git push`) and creates both the remote tag and the GitHub
release in one step:

```
gh release create <tag> --target <sha> --title <title> --notes <notes>
```

This is agent-executable once `main` (or whatever ref `<sha>` lives on) is
already correctly published — it does not itself need a `push`-kind proof,
because it structurally isn't one.

## Quick reference — who runs each layer

| Layer | Step | Runs as |
|---|---|---|
| 1 | Policy already set in `pipeline.user.yaml` | n/a (config, not a per-push action) |
| 1b | `check-doc-reconciliation.mjs --base … --candidate …` | Agent |
| 2+3 | `authorize-critical` (prepare + sign, one invocation) | **PO only** — one command, `approve`, passphrase. The agent constructs the command and computes `--subject-sha256`. |
| 4 | `pipeline-state.mjs approve-push` | Agent |
| 5a | `git push` (non-main, proof valid) | Agent, subject to the harness classifier |
| 5b | `git push` to `main`/protected (GG-03) | Agent, after PO's literal `OVERRIDE GG-03`, subject to the harness classifier |
| 6 | `gh release create` (tag + release) | Agent |

Layer 2+3's signature and the harness classifier's block are the two points in
this flow that are not resolvable by the agent under any configuration —
everything else above them is either config (layer 1) or, per the open
finding this document is a partial remediation for, a candidate for
narrowing.
