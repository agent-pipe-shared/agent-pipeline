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
`chat` mode skips layers 2-3 entirely: `pipeline-state.mjs approve-push`
takes only `--by --remote --destination`, no proof files, and the human
clears it by typing a confirmation in-session rather than signing anything.

## The five layers, in order

### Layer 1 — decide a push needs a signature at all

Governed by `gates.push_approval` in `pipeline.user.yaml`. In `signature`
mode (this repo), every push to a gated destination needs a detached Ed25519
proof, signed with a private key that lives **outside this checkout**, before
`git push` will be allowed through. This is intentional and load-bearing:
the agent is cryptographically incapable of producing this proof by design
(`docs/adr/0055-critical-human-proof-waiver.md`,
`docs/adr/0056-push-approval-mode.md`).

### Layer 2 — prepare the request (agent-eligible by design, guard-blocked in practice)

```
node plugins/pipeline-core/scripts/po-approval-gate.mjs prepare-critical \
  --repo-root <repo> --directory <external-po-dir> \
  --feature-id <featureId> \
  --plan <repo-relative-PRD-path> --spec <repo-relative-spec-path> \
  --kind push --subject-sha256 <hash> --expires-at <ISO-8601>
```

The script's own docstring frames this as the "public control-plane half" —
agent work, since it only writes a public candidate-bound request file
(`request-critical-<kind>.json`) and cannot access a private key. **In
practice this is agent-blocked anyway**: `<external-po-dir>` is, by design,
outside the project root (it holds the private key and must never be
committed), so `guard-lifecycle-ready.mjs`'s cross-repository-mutation check
refuses the write (`GUARD-CROSS-REPO-MUTATION`) regardless of the script's
own intent. Until that gap is resolved
(`backlog/items/2026-08-07-gs6-blocks-inert-plugin-metadata-in-self-hosted-sessions.md`
is the adjacent, not identical, filed gap — this exact one is not yet filed
separately as of this writing), **the PO runs this step**, using the exact
command the agent constructs and hands over — never freehand.

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

### Layer 3 — sign it (human-only, by design — no override exists or should exist)

```
node plugins/pipeline-core/scripts/po-human-approval.mjs approve-critical \
  --repo-root <repo> --directory <external-po-dir> --kind push
```

Reads the private key from `<external-po-dir>` (passphrase-protected,
`openssl genpkey -algorithm ED25519 -aes-256-cbc`), signs the request, writes
`proof-critical-<kind>.json`. This step is intentionally human-only in the
script's own docstring — do not look for a way around it; there is not
supposed to be one.

**Finding the right external directory:** more than one candidate directory
may exist on a machine (e.g. one per repo this Pipeline governs). Verify by
comparing that directory's `po-public.pem` SHA-256 against this repo's own
committed `project/critical-human-proof.json` → `trustAnchor.publicKeySha256`
— **never** by filesystem timestamps or guessing from directory naming. A
mismatch fails closed with `CRITICAL-PROOF-TRUST-ANCHOR-MISMATCH`; treat that
error as the check, not a surprise.

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
| 2 | `prepare-critical` | Agent-eligible by design; **PO in practice** (guard-blocked) |
| 3 | `approve-critical` | **PO only** (private key, by design) |
| 4 | `pipeline-state.mjs approve-push` | Agent |
| 5a | `git push` (non-main, proof valid) | Agent, subject to the harness classifier |
| 5b | `git push` to `main`/protected (GG-03) | Agent, after PO's literal `OVERRIDE GG-03`, subject to the harness classifier |
| 6 | `gh release create` (tag + release) | Agent |

Layers 3 and the harness classifier's block are the two points in this flow
that are not resolvable by the agent under any configuration — everything
else above them is either config (layer 1) or, per the open finding this
document is a partial remediation for, a candidate for narrowing.
