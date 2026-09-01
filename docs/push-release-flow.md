# Push & release flow — end to end, as it actually works today

> Read this once per session before a branch push or a `main` release. It
> exists because the 2026-08-07 0.5.2 release session rediscovered this same
> flow live, by trial and error, including two wrong assumptions corrected
> only by a failing guard message — see
> `backlog/items/2026-08-07-push-release-flow-unusable-for-third-party-adopters.md`
> for the finding this document is the first remediation step for.

> **Changed on 2026-08-07, after the 0.5.3 release, under
> [ADR-0061](adr/0061-uniform-human-approval-ceremony.md).** The human's part is
> now **one command, the word `approve`, and the passphrase** — layers 2 and 3
> collapsed into `authorize-critical`, and layer 5's `OVERRIDE GG-03` ritual is
> gone for a signed push. The sections below describe both the new shape and what
> it replaced, because a repository running an older plugin build still walks the
> old one. The version that ships this is `0.5.4`.

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
[ADR-0074](adr/0074-port-authorize-critical-ceremony.md).

## The five layers, in order

Five authorization layers, plus one preparatory step (1b) that authorizes
nothing and gates nothing at the push itself — it exists so that the range being
signed for has been compared against the decisions that govern it.

**One command drives layers 1b through the readiness check ahead of the
signature (NVA-V4-PUSHDRIVER):**

```
node plugins/pipeline-core/scripts/push-init.mjs --root <repo> --by <name> --remote <remote> --destination refs/heads/<branch> [--base <ref> --candidate <ref> [--record-ref <ref>]]
```

`push-init.mjs` chains Layer 1b (when `harness/scripts/check-doc-reconciliation.mjs`
exists in the target project; `--base` AND `--candidate` both become required
the moment it does — this driver never invents either, since which commit is
the candidate is exactly the same kind of domain decision as which commit is
the base), the cheap satisfiability preflight, and the full `push-prepare.mjs`
readiness report, in that fixed order, and reports the first precondition that
is not green. `--record-ref` stays optional and defaults to `HEAD`, matching
`check-doc-reconciliation.mjs`'s own default — the real flow commits the
substantive work as `<candidate>` first and the reconciliation record on top
as a later commit, which is where `HEAD` normally already points by the time
this driver runs (`--candidate` and `--record-ref` must therefore usually name
two DIFFERENT commits — see Layer 1b below for why). This is the fast path
over the per-layer commands below, not a
replacement for them — every step it runs is one of the same read-only
scripts documented layer by layer in this file, still runnable and still
documented individually for anyone who needs to run just one of them. **The
driver stops the instant every precondition is green: it prints the
`authorize-critical` command already filled in, and never executes it, signs
it, or clears any gate itself** — the human signature described under Layers
2+3 below is unchanged and is not something this driver can satisfy on a
human's behalf.

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
node harness/scripts/check-doc-reconciliation.mjs --base <base> --candidate <tip> [--record-ref <ref>]
```

Run this before preparing a request, not after. It fails when the range changed
a path some ADR declares it governs and no entry in `docs/doc-reconciliation.md`
names that exact candidate commit. `--base` and `--candidate` are both required
by design and every output repeats the resolved range: a reconciliation claim
that does not say which range it covers is not a claim.

`--record-ref` (optional, defaults to `HEAD`) is a SEPARATE ref from
`--candidate`, on purpose: the reconciliation record naming candidate `<tip>`
cannot live inside `<tip>`'s own tree, because writing the record changes the
tree, which changes `<tip>`'s own commit hash. So the shape is always: commit
the substantive work as `<tip>`, run this check with `--candidate <tip>`
against a `docs/doc-reconciliation.md` that does not exist yet, resolve every
finding, **commit the record last** as a new commit naming `<tip>` — writing it
moves `HEAD`, so the record names the tip of the substantive work below it and
the push carries one extra commit touching only that file — and `--record-ref`
then defaults to that new `HEAD`. `push-init.mjs` follows this exact contract
(see above): it stopped inventing `--candidate` as the literal `HEAD` because
that collapsed both refs onto the same commit and made the check unsatisfiable
by construction. The format and this write-order rule are documented in the
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
> [ADR-0074](adr/0074-port-authorize-critical-ceremony.md)) closes that gap by
> construction: it builds the request and signs *that exact object* inside one
> invocation, so nothing already sitting on disk can ever be the thing that
> gets signed. `prepare-critical`/`approve-critical` still exist in
> `po-human-approval.mjs` for scripted/two-step use, but this is now the
> command a session should hand the PO for push/deploy/publication approval.

**Run this FIRST, before anything below in this section**
(`plugins/pipeline-core/scripts/push-prepare.mjs`, backlog item
`pipeline.full-push-preflight-before-signature`): a single READ-ONLY report
that atomically checks a clean/unchanged working tree, canonical
candidate-bound verify evidence, the push threat-model artifact, and the
critical-human-proof trust-anchor posture (including the exact
`external-key-directory-vs-committed-trustAnchors` membership check the next
section describes by hand) — all BEFORE the passphrase prompt, not
discovered one layer at a time by trial and error. Only once every check is
green does it print the fully-formed `authorize-critical` command below,
with a correct `--subject-sha256` already computed.

```
node plugins/pipeline-core/scripts/push-prepare.mjs \
  --by <name> --remote <remote> --destination refs/heads/<branch>
```

A red check names its own remedy; nothing below this line needs running
until the report is fully green.

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

**This signing step needs a real, attended terminal window — never an
in-session `!` route.** OpenSSL runs its own interactive passphrase prompt on
whatever process spawns it; a route with no controlling terminal (such as an
agent session's `!` command) has nowhere for that prompt to go, and the
failure it produces reads exactly like a rejected passphrase even though
nothing was mistyped (`pipeline.signing-requires-attended-terminal`,
`po-human-approval.mjs`). When handing over a command that reaches
`signIntentIntoProof` (`sign-intent`, `authorize-critical`), say explicitly
that it must run in a terminal window, not through the session.

**`--directory` has an optional environment fallback.** Every
`po-human-approval.mjs` subcommand accepts the approval directory from
`$PIPELINE_PO_APPROVAL_DIRECTORY` when `--directory` is not passed explicitly;
an explicit `--directory` always overrides it and behaves exactly as before.
Export the variable once in your shell profile so the ceremony stops requiring
this path to be retyped or re-located every time — the value itself is
machine-specific and must never be committed (`pipeline.user.yaml` is tracked,
and CLAUDE.md forbids machine-specific absolute paths in commits, docs, or
prompts), so it belongs in shell configuration, never in this repository.

**`--repo-root` must be a checkout that is clean including untracked files**
(`observeCleanCandidate`). In this repository the main checkout can never
satisfy that: `.claude/settings.json` and `project/pipeline-state.json` are
tracked and permanently modified. `project/resume-hint.json` is NOT tracked —
`.gitignore` excludes it as a "bounded non-authoritative restart aid" that must
never enter history — so it never dirties this check; but because a fresh
clone therefore carries no live card, a resume-hint check can be red in the
working checkout and green in a fresh clone of the same commit. Point
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
`threatModel` is the fixed, project-relative `project/push-threat-model.md`
binding (`PUSH_THREAT_MODEL_DEFAULT_PATH` in `pipeline-state.mjs`) — the same
path in every project, including a consumer's, never a sprint-specific one.
If that file does not exist yet in the target project, create it first with:

```
node plugins/pipeline-core/scripts/pipeline-state.mjs materialize-push-threat-model
```

Takes no flags — run it from the project directory (or with
`CLAUDE_PROJECT_DIR` set); there is no `--dir` flag on this script.

which copies the plugin's shipped template into place (refuses if the file
already exists, since overwriting it would invalidate any push proof already
bound to its current bytes — move or remove it yourself first if you mean to
replace it). Compute the hash by **importing the real function** in a
throwaway script (`scratch/`, gitignored) — never hand-roll the hash. A wrong
hash fails closed at verification, it does not silently accept.

### A fourth kind: `release-preflight` (ADR-0064)

`authorize-critical` also accepts `--kind release-preflight` — the release
gate's consent, produced by the identical three-act ceremony above (copy the
command, type `approve`, enter the passphrase), never a fourth ritual. The
only difference from the `push` example: this kind adds an additive,
kind-agnostic `--subject <repo-relative path>` flag, so the confirmation
decodes the release version, base commit, lifecycle feature/manifest and
retention-policy digest instead of showing a bare hash
([ADR-0064](adr/0064-release-preflight-consent-reuses-the-uniform-approval-ceremony.md)
Decision 4). When `--subject` is supplied, `--subject-sha256` becomes
optional and derived from it.

```
node plugins/pipeline-core/scripts/po-human-approval.mjs authorize-critical \
  --repo-root <repo> --directory <external-po-dir> --feature-id <id> \
  --plan <repo-path> --spec <repo-path> \
  --kind release-preflight --subject <repo-path> --expires-at <ISO-8601>
```

`--subject` must be a **repository-relative path to a JSON preimage that is
gitignored but present** — never a tracked file. Building it (the
release-preflight consent-subject JSON `release-preflight-cli.mjs` itself
rebuilds and verifies against: `{schema, version, base, lifecycle,
retentionPolicySha256}`) must not dirty the tree before the human signs, so
it belongs under `/evidence/` (`.gitignore:39`), the same ignored-but-present
location every other pre-signature scratch artifact in this flow already
uses.

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
noticing the subject had changed — measured live in the 0.5.2 release
session, at the cost of a wasted signature. `authorize-critical` above
removes that failure mode by construction rather than by ordering, and
replaces this for ordinary use; the two-step form remains for any caller
that genuinely needs prepare and sign as separate steps (e.g. scripted
preparation with signing deferred to later).

```
node plugins/pipeline-core/scripts/po-approval-gate.mjs prepare-critical \
  --repo-root <repo> --directory <external-po-dir> \
  --feature-id <featureId> \
  --plan <repo-relative-PRD-path> --spec <repo-relative-spec-path> \
  --kind push --subject-sha256 <hash> --expires-at <ISO-8601>
node plugins/pipeline-core/scripts/po-human-approval.mjs approve-critical \
  --repo-root <repo> --directory <external-po-dir> --kind push
```

The sign step (`approve-critical`) reads the private key from
`<external-po-dir>` (passphrase-protected, `openssl genpkey -algorithm
ED25519 -aes-256-cbc`), signs the request, and writes
`proof-critical-<kind>.json`. It is intentionally human-only in the script's
own docstring — do not look for a way around it; there is not supposed to be
one.

</details>

### Ordering rule — the handover commit comes BEFORE the signature (interim workflow measure)

A signature binds one exact commit and tree (`--subject-sha256` is computed
over `{sourceCommit, remote, destination, threatModel}`, and `approve-push`
fails closed the instant the observed candidate's commit differs from what
the signature covers, `gitCandidate(dir).commit !== head.commit`). The
practical consequence: the handover/documentation commit for a release
**MUST** land before Layers 2-3 run, and **nothing MUST be committed between
signing and pushing** — including a documentation-only commit. Every commit
after signing, however small, voids the approval and costs another signing
ceremony (private key, passphrase, human ceremony, all over again).

This is a workflow rule, not a mechanism, and it is explicitly labelled as an
**interim measure**: the durable fix — an approval that survives a bounded,
declared change (e.g. a documented-in-advance handover-only commit) — is a
separate, unstarted design. Until that exists, sequence is the only
protection: finalize everything that will be committed, commit it, THEN
start Layer 2/3.

### The identical binding applies to `guard-human-override.mjs`'s general override ceremony

The `plan` / `prepare-authorization` / `emit-signature-digest` /
`authorize-by-signature` chain in
`plugins/pipeline-core/lib/human-guard-override.mjs` (CLI wrapper:
`scripts/guard-human-override.mjs`) — used to obtain a signed PO override for
an arbitrary guard denial (e.g. an edit to a protected path like
`.claude/settings.json`/`hooks.json`), not specifically a push — binds the
PO's signature to the repository's exact whole-tree HEAD (`{commit, tree}`
from `git rev-parse HEAD` / `git rev-parse HEAD^{tree}`) at `plan` time, the
same way `approve-push` does above. `authorize-by-signature` re-checks this
at arm time and refuses with `HGO-CANDIDATE-DRIFT` on any mismatch.

**This is stricter than the push-approval case above in one important way:
it is NOT limited to the operator's own commits.** Any commit landing on
HEAD before `authorize-by-signature` consumes the signature — including a
totally unrelated, concurrent background dispatch's commit that touches
different files entirely — invalidates the ceremony and forces
`refreeze-plan` plus a brand-new PO signature for the byte-identical edit
(live-reproduced 2026-08-30,
`backlog/items/2026-08-30-hgo-candidate-drift-invalidates-ceremony-on-any-concurrent-commit.md`).

**Why the binding stays whole-tree, not narrowed to the target path:** the
frozen plan also freezes a safety analysis of the specific override being
granted (`eligiblePaths`/`preview`/`denials`) that is never recomputed at
arm time, and `signedCandidate` is not only an internal freshness check — it
is baked directly into the PO's own Ed25519-signed intent. Narrowing what it
binds to would change what the PO is cryptographically attesting to, and
proving that only the target path's bytes can affect the frozen safety
analysis (no interaction via shared directory components, symlink
placement, or path classification elsewhere in the tree) is a security claim
that has not been verified — so the strict, whole-tree invariant is kept by
design rather than narrowed speculatively (see the code comment at the
`HGO-CANDIDATE-DRIFT` `fail()` site in `human-guard-override.mjs`).

**Practical mitigation, until a narrower binding is proven safe:**
- Treat an open HGO signature ceremony (between `plan` and
  `authorize-by-signature`) exactly like the push-approval ordering rule
  above: avoid committing anything yourself, and avoid launching or letting
  other concurrent dispatches/sessions land commits, while the ceremony is
  open.
- `guard-human-override.mjs plan` prints a best-effort ADVISORY on stderr
  naming this risk every time, plus a heightened one when `git worktree
  list` shows other worktrees present. That heightened signal is partial
  only — it does not detect a concurrent commit landing directly into the
  SAME (shared) checkout, which has been the more common case in this
  repository's own history.
- Seed the request, get the PO's signature, and consume it with
  `authorize-by-signature` as one uninterrupted sequence — do not interleave
  other work (including writing a briefing) between
  `prepare-for-signature`/`emit-signature-digest` and
  `authorize-by-signature`.

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

Once `approve-push` succeeds, the actual `git push` passes through
`guard-git.mjs`'s `GG-03`. **Since 0.5.4 this needs no second human act:** when
`GG-03` is the only matching rule and `authorizeRecordedPush` verifies the
recorded approval for this exact candidate, remote and destination ref, the
guard admits the push with no arming, no token and no typed phrase, and writes
an audit entry naming the authorization it relied on. A denial names the
returned `PUSH-PROOF-*` code. The push must write out its destination ref
(`HEAD:refs/heads/<branch>` or `<sha>:refs/heads/<branch>`); a `--force` or
`+refspec` push also matches `GG-01`/`GG-02` and still blocks, approval or not.

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

The old route — the agent explains the command/reason/risk, the PO replies the
literal `OVERRIDE GG-03`, the agent arms
`PIPELINE_GUARD_OVERRIDE="GG-03|<token>|<reason>" git push ...` — remains for
every rule that has no signature route, and for a `GG-03` push with no approval.
Its token is no longer burned by an attempt that never ran: an arming is bound
to the exact command, the observed candidate and a lifetime, and a byte-identical
re-presentation at the same `HEAD` inside that lifetime is admitted as a retry.
That matters because the harness classifier and the remote both refuse *after*
the guard has already consumed the token — which cost two armings in the 0.5.3
release.

**Separately, and invisibly to the Pipeline**, Claude Code's own harness-level
"auto mode classifier" may refuse the actual `git push`/`git restore`
invocation regardless of Pipeline-side clearance — this is outside the
Pipeline's control or visibility, undiscoverable except by attempting the
exact command. This compounding is tracked as its own finding:
`backlog/items/2026-08-07-push-release-flow-unusable-for-third-party-adopters.md`.

**Resolved for `git push` on 2026-08-16 (PO decision):** `.claude/settings.json`
now carries a single narrow `permissions.allow` entry, `Bash(git push *)`, so
the Pipeline's own hook chain is the authority for a push rather than being
overruled by a second gate that adds nothing to it. This is safe for a checked
reason, not an optimistic one, and the layer actually doing the checking for an
ordinary branch push is **not** `GG-03`: `GG-01`/`GG-02` (`guard-git.mjs`)
still block every `--force` and `+refspec` push unconditionally, approval or
not, but `GG-03` matches only a `--delete`/`-d`/`:refspec` deletion or
overwrite of `main`/`master` — it is never even evaluated for an ordinary
push to a feature branch, so its signed-push admission route (reachable only
when `GG-03` is the sole matching rule) is correspondingly unreachable there
too, and `guard-git.mjs` simply lets such a push through. What actually
enforces the recorded push approval for an ordinary push is a separate hook,
`guard-push.mjs`, which runs after `guard-git.mjs`: its approval check
requires, under `gates.push.approval: "required"`, that
`state.pushApproval.lastApproved.forCommit` equal the pushed source commit
and that `authorizeRecordedPush` independently verify the recorded approval
for this exact candidate, remote and destination ref; a failure there is
reported under `gates.push.mode`. The entry deliberately covers `git push`
alone — never `git *` — so no other command gains anything.

Two things about that change are worth keeping. First, `git restore` is **not**
covered and can still be refused this way; the fallback below still applies to
it. Second, and more instructive: **an agent cannot make this change itself.**
The dispatch that was briefed to add the entry had its edit to
`.claude/settings.json` refused by the classifier it was about to relax
("Permission for this action was denied by the Claude Code auto mode
classifier"), and correctly stopped rather than seeking an override. The layer
is self-sealing — a human must edit the file. When any classifier refusal fires
for something not covered by an allow entry, the resolution remains the PO
running the identical, already-Pipeline-authorized command in their own
terminal.

### Layer 6 — the GitHub repository ruleset (outside this repo, discovered by rejection)

Everything above can pass and the remote can still refuse. `main` is covered by
the repository ruleset `protect-main` (`gh api
repos/<owner>/<repo>/rules/branches/main` lists what actually applies to a ref).
It currently enforces `deletion` and `non_fast_forward` — both deliberate, both
aligned with this repo's own hard rules. Since 2026-08-28 it also enforces
`required_status_checks` on context `verify`, with `bypass_actors: []` and
`current_user_can_bypass: "never"`. In practice: nothing reaches `main` while
that check is red.

It also carried `required_linear_history` until the v0.5.3 release, where that
rule rejected the push with `GH013` because the candidate contained the
Guard-Maintenance-Window worktree merge (`8bc5ceb`). That is a structural
conflict, not a one-off: the Pipeline's own `isolation: worktree` dispatch flow
produces merge commits, and the two ways to linearize a candidate are both
closed here — rebase/force-push is forbidden outright, and squashing destroys the
per-commit granularity that candidate binding, signatures and Critic reviews all
depend on. The PO's decision was to drop the rule permanently:

```
gh api repos/<owner>/<repo>/rulesets/<id> --method PUT --input <ruleset.json>
```

with `rules` reduced to `deletion` and `non_fast_forward`. Merge commits on
`main` still carry a known internal cost — they break the Codex Critic isolation
fixture (`backlog/items/2026-08-07-codex-critic-isolation-fixture-rejects-merge-commit-head.md`)
— but that is a Pipeline-side problem to fix on its own terms, not something a
branch rule was ever going to solve.

**Check this layer before starting a release**, not after the push: one
read-only `gh api …/rules/branches/main` call costs nothing and is the only way
to see it.

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
| — | `push-init.mjs --root … --by … --remote … --destination … [--base …]` — fast path chaining 1b through the readiness check; stops at the signature | Agent |
| 1 | Policy already set in `pipeline.user.yaml` | n/a (config, not a per-push action) |
| 1b | `check-doc-reconciliation.mjs --base … --candidate …` | Agent |
| 2+3 | `authorize-critical` (prepare + sign, one invocation) | **PO only** — one command, `approve`, passphrase. The agent constructs the command and computes `--subject-sha256`. |
| 4 | `pipeline-state.mjs approve-push` | Agent |
| 5a | `git push` (non-main, proof valid) | Agent, subject to the harness classifier |
| 5b | `git push` to `main`/protected (GG-03) | Agent — the verified approval *is* the confirmation; no `OVERRIDE GG-03`. Still subject to the harness classifier. |
| 6 | GitHub repository ruleset on the target ref | Repo admin (PO); agent can read it, not change it without an explicit decision |
| 7 | `gh release create` (tag + release) | Agent |

The old rows 2 and 3 (`prepare-critical`, then `approve-critical`) and the old
row 5b (`OVERRIDE GG-03` plus an armed token) are retained above as the
superseded shape: still supported, no longer the human's path.

Layer 2+3's signature and the harness classifier's block are the two points in
this flow that are not resolvable by the agent under any configuration —
everything else above them is either config (layer 1) or, per the open
finding this document is a partial remediation for, a candidate for
narrowing.

**Two ordering facts, both learned by being burned:**

- A harness-classifier denial arrives *after* `guard-git.mjs` has already
  consumed the one-time `GG-03` token. The token is spent, the push did not
  happen, and the retry needs a fresh token. Do not assume a blocked command
  left the ledger untouched — read `project/guard-override.log.jsonl`.
- `approve-push` writes into the tracked `project/pipeline-state.json`, so the
  tree is dirty from that moment on. **Commit nothing between `approve-push` and
  the push**: every commit moves `HEAD` past the `forCommit` the signature
  names and voids the approval. Verify has to run *before* the approval, and the
  state record's write is committed *after* the push -- not by this push
  itself (which only ever pushes the already-signed `HEAD`, unchanged), but by
  the **next** `push-prepare.mjs` run, automatically. This is finding 7c of
  `backlog/items/2026-08-07-push-release-flow-unusable-for-third-party-adopters.md`;
  as of NVA-PUSHFOLD-1
  (`backlog/items/2026-08-26-push-approval-record-always-trails-the-signed-commit.md`,
  PO decision 2026-08-29) it is a self-limiting lag, not a manual chore:
  `pushPrepareReport()` now runs `foldPendingPushApprovalWrite()` at the very
  start of its own run, BEFORE evaluating any precondition (including
  `checkWorkingTreeClean`) that assumes a clean tree. When the resolved state
  file is the SOLE dirty path in the working tree, it clears the upfront hint
  below and commits the file; any other dirty path alongside it, or a dirty
  tree that isn't this exact file, is left completely untouched, and every
  precondition below behaves exactly as before. Until that next run happens,
  a session on a different machine that only pulled the pushed commit has no
  way to see this pending record yet (nothing about it can be part of the
  push itself -- see the backlog item for why); the record itself carries the
  upfront, immediately-visible hint that closes that gap locally in the
  meantime: `pushApproval.lastApproved.pendingAuditWrite: true` is stamped by
  `approve-push` onto its own write, and is only ever `true` while genuinely
  uncommitted -- the fold clears it to `false` the moment it actually lands
  in a commit, so it is never stale.

Whatever replaces this flow is bound by
[ADR-0061](adr/0061-uniform-human-approval-ceremony.md): three human acts, the
same three for every gate.
