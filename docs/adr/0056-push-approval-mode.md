# ADR-0056: the push gate stays; how a human clears it becomes a configured mode

> Agent-Pipeline · Sprint Nova · as of 2026-08-06

**Status:** accepted · **Basis:** PO instruction, 2026-08-06 — *"das push Gate
grundsätzlich ja aber die externe Signierung muss konfigurierbar sein also entweder
human gate per chat oder harte Freigabe extern mit Signatur und das per
pipeline.user.yaml oder so konfiguriert"*. **Refines** [ADR-0055](0055-critical-human-proof-waiver.md).

## Context

[ADR-0055](0055-critical-human-proof-waiver.md) gave the Ed25519 gate an off-switch,
but got two things wrong for what the PO actually wanted.

**It was a switch, not a mode.** `waivedKinds` reads as "the gate is off here", when
the real choice is *which kind of human clearance* is demanded. The gate is not being
turned off in either setting — a human still clears every push, bound to the exact
candidate commit. What changes is whether that clearance is a detached cryptographic
proof or an in-session act.

**It lived in the wrong file.** `project/critical-human-proof.json` is an internal
policy artifact. ADR-0055's own rejected-alternatives section argued against
`pipeline.user.yaml` on the grounds that projecting a single setting would need new
plumbing. That reasoning optimised for implementation cost over the operator, and the
PO overruled it: the setting belongs in the source of truth the operator actually
edits.

## Decision

### 1. `gates.push_approval` in `pipeline.user.yaml`

```yaml
gates:
  claude_md_max_lines: 200
  dev_plan: "blocking"
  push: "blocking"
  push_approval: "signature"   # or "chat"; optional, default "signature"
  security: "blocking"
```

`gates.push` decides **whether** the push gate blocks. `gates.push_approval` decides
**how a human clears it**. Two separate questions, two separate settings; conflating
them is what made ADR-0055 necessary in the first place.

- **`signature`** — a detached Ed25519 proof, private key outside the repository,
  verified against an externally configured trust anchor. The agent can construct the
  intent; it cannot produce the proof.
- **`chat`** — the human clears the gate in-session by recording the approval
  themselves. No key, no ceremony.

### 2. `signature` is the default, and every failure resolves to it

Absent file, absent key, unparseable YAML, an unrecognised value, a symlinked source:
all mean `signature`. A gate whose configuration cannot be read sits at its strongest
setting, never its weakest. The key is optional in the schema so a
`pipeline.user.yaml` written before this ADR stays valid and keeps the strong default.

### 3. What `chat` does NOT relax

The mode changes exactly one thing. Everything else holds identically:

- the approval is still bound to the **exact candidate commit** — it never carries to
  the next one;
- the approval is still **attributed** (`--by`);
- Verify and Security evidence must still be green and candidate-bound;
- the record still **says what backed it** (`criticalProofWaiver` with
  `mode: "chat"` and its source), so a chat-cleared push is never byte-identical to a
  proof-backed one.

### 4. What `chat` honestly is, stated plainly

**It is an attribution record, not proof of a human.** In `signature` mode the agent
is cryptographically incapable of producing the clearance. In `chat` mode it is not —
the only thing separating a genuine clearance from a fabricated one is that the human
runs the approval command. This is a real and deliberate weakening, chosen for
ergonomics, and it is written into the record rather than glossed. Anyone reading
`mode: "chat"` in the state should read it as "a human said yes here", not as "a human
was proven present".

Be precise about what it still buys, because "weaker" is not "absent" (PO, 2026-08-06):
even in `chat` the clearance must **exist** — the agent cannot simply proceed without one,
and the record is still commit-bound, attributed and self-declaring. What `chat` no longer
resists is *intent*. It protects against forgetting the gate, working out of order, or
pushing a stale candidate; it does not protect against an agent that deliberately records
a clearance the human never gave. That is a violation, not a bypass, and it is the risk
the soft configuration knowingly accepts.

### 5. For `push`, the source wins; a contradiction fails closed

`pipeline.user.yaml` is the operator-facing control for `push`. A policy-file waiver
for `push` alongside an explicit `signature` in the source is an ambiguous
configuration and is refused with `CRITICAL-PROOF-MODE-CONFLICT` rather than resolved
by precedence — two files disagreeing about a gate's strength is exactly the class of
defect ADR-0054 was written about, one level up.

`deploy` and `publication` keep ADR-0055's policy-file waiver: they have no
`pipeline.user.yaml` key, and inventing two more would widen the operator surface
without a request for it.

### 6. Read directly, not projected

The policy module reads `pipeline.user.yaml` itself. `gates` is **not** one of the V3
compiler's owned keys — the manifest's gate block is hand-maintained — so projecting
this one setting would mean extending the frozen owned-keys contract for it, and would
then need ADR-0054's tier-agreement treatment as well. Direct read, one source, no
second copy to drift.

### 7. `signature` becomes usable: an attested action is allowed, on both routes

Added 2026-08-06, on the PO's requirement that "every session must be able to push, on
every branch and on `main`, when the human clears it — by signature or by chat,
depending on the config."

The mode as originally shipped could not do that. `signature` reached a branch in
`guard-push.mjs` that refused **every** agent-issued push and pointed at the fixed
publication executor, which is a release path an ordinary feature branch has no business
entering. `main` was refused even earlier, by a separate boundary that fires before the
manifest is read at all. So the strong mode did not mean "a session can push what the
human signed"; it meant "no session can ever push", and the only way to work was to pick
the weaker mode.

Both routes now admit exactly one thing. **Not a record — a verified signature.**

`guard-push` rebuilds, from what it can observe about the push actually taking place, the
subject digest the key holder signed: the candidate commit, the candidate tree, the
remote, the destination ref, and the **current bytes** of the bound threat model. It
rebuilds the approval intent around that action — which draws in the plan/spec authority
— and checks the detached Ed25519 signature against a `trustAnchor` committed in
`project/critical-human-proof.json`. Redirect the remote, retarget the ref, push a
different tree, let the proof expire, or edit the threat model after approval, and the
signature stops matching.

**Why a committed anchor and not the state record.** `pushApproval.lastApproved` already
names the commit, the remote and the destination, so believing it looks sufficient. It is
not: `project/pipeline-state.json` is a mutable working-tree file. `guard-lifecycle-ready`
refuses an agent's Edit and Write to it, but a guard is not a signature — and a permission
built on that record would have turned `signature` into `chat` with nobody changing a
setting, which is the exact self-weakening this sprint's T2–T5 Critic rounds were spent
closing one module over. The anchor lives in the policy file because that file is
gate-strength protected (GS-2), so the agent can reach it through neither the write lane
nor the shell lane. It is public data — a key reference and a public key's digest — so
committing it costs nothing.

**`main` is not special-cased, and its boundary is not moved.** The destination ref is
part of what is signed, so `main` needs no separate permission. The boundary stays eager,
because it applies to a repository with no manifest and no push gate at all; deferring it
to the gate section would hand every ungoverned checkout a free push to `main`. Its
exception is deliberately *narrower* than the rule it excepts: only the explicit
`…:refs/heads/main` form is admitted. `git push origin main`, whose destination comes from
remote configuration rather than the command, stays refused — an attestation names a ref,
and a command that does not name one cannot be matched against it without guessing. The
publication executor keeps its exclusive claim on exact-candidate publication authority,
and the anonymous-public delivery path refuses `main` independently.

**The release route is in scope, not a sequel.** `checkDeployApprovals` matched a recorded
approval on `forArtifact`/`forEnvironment`/`!usedAt` and never read `criticalProof` at all.
Where a project demands a proof for `deploy`, the strongest thing that path could say
about an approval was that somebody had written one down. The same rebuild-and-verify now
applies over that route's own signed subject. An unreadable policy fails closed there,
unlike the state file beside it: a broken state file is a local accident and warns, a
policy whose strength cannot be read is a gate of unknown strength.

**What this does not claim.** The private key is what protects the action. Nothing here
defends against an operator who signs the wrong thing, and none of it applies in `chat`
mode or under an ADR-0055 waiver, where a recorded approval is an attribution and decision
4 above stands unchanged.

**Two tightenings, and one workflow change.** A `deploy` approval is now bound to the
commit it was approved for; it previously survived arbitrary later commits. And an approval
recorded before this decision carries a digest but no proof object, so it cannot authorize
a raw push — it must be re-recorded.

**What a project must do to use it.** Add `trustAnchor: {keyReference, publicKeySha256}`
to `project/critical-human-proof.json`, matching the external `trust-policy.json`. Without
it the route is simply unavailable (`PUSH-PROOF-TRUST-ANCHOR-MISSING`), never open. Because
the file is GS-2 protected, this is an operator action performed outside an agent session —
by design.

**The anchor is read from the governing session, not from the pushed repository.** Stated
because the first implementation did the opposite and it was a blocker (T6 Critic, F1).
The whole justification above is that the policy file is GS-2 protected — but GS-2 matches
an exact repository-relative path against the *session* root, so `<root>/sub/project/…` is
not a gate-strength path at all, and an agent able to create a nested repository could mint
its own anchor and have the guard verify it. Measured, not theorised: the fixtures exited 0.
This does not forbid a cross-repository push; it requires that one carry a signature under
the **governing** project's key, over the target's candidate. The same rule applies to the
proof waiver and to the deploy policy — otherwise the pushed repository would decide
whether it needs a proof at all.

**Availability consequence, and it lands on `deploy` first.** A project that lists `deploy`
in `requiredKinds` without an ADR-0055 waiver will find **every** deploy-triggering push
refused with `DEPLOY-PROOF-TRUST-ANCHOR-MISSING` until an operator commits the anchor. This
is fail-closed, not a weakening, but it is an availability break that arrives at push time,
and it is stated here because the anchor requirement was originally documented only for the
push route (T6 Critic, F3). A project not ready to install an anchor should record the
ADR-0055 waiver deliberately rather than discovering the gate at the worst moment.

## Consequences

**Positive.** The operator sets this where they already set everything else, in one
word, and both settings keep a real human gate. The strong default survives an
unconfigured, misconfigured or damaged source. The weaker mode is self-declaring in
the durable record.

**Negative.** `chat` is genuinely weaker and a reader must know what it means — hence
decision 4 being explicit rather than diplomatic. The setting is read directly rather
than compiled, so it is one more file the guard consults at runtime; that is accepted
because the alternative is a projected copy that can go stale, which is the failure
this sprint has already paid for twice.

## Rejected alternatives

- **Keep `waivedKinds` as the only control.** Rejected by the PO: it is an internal
  artifact, and "waiver" frames a mode choice as an exception.
- **Drop to `gates.push.approval: standing-approved` for the soft mode.** Rejected:
  that removes the human gate entirely. The PO asked for a *human gate per chat*, not
  for no gate.
- **Project the setting into the compiled manifest.** Rejected for now, per decision 6.
- **Let `chat` mean "the agent asks and records the answer".** Rejected: the agent
  would control both sides of its own gate, which is not a gate. The human must
  perform the recording act.

## Follow-up

- `deploy` and `publication` have no source-of-truth mode. If an operator ever asks
  for one, the shape is already proven here.
- The `chat` mode makes a session-level attestation plausible (a signed session
  transcript reference, say). Not built, not needed for the ask.
- **Open, from the T5 Critic (F4).** Decision 5 describes the conflict rule as "a
  policy-file waiver alongside an explicit `signature` in the source". The implementation
  is deliberately wider: it refuses whenever the mode could not be *established* — every
  source except `default` — because enumerating the one safe value is what makes a future
  source value fail closed instead of open. The prose and the code therefore disagree in
  the safe direction, and the prose is the one that should move.
- `publication` keeps its own external-verification route through the fixed executor and
  was not brought onto decision 7's rebuild-and-verify. It is not weaker for it — the
  executor verifies externally at consumption — but the two now differ in shape, and one
  shape would be better than two.
