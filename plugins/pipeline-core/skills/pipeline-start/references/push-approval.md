# The push-approval gate, and what a human actually has to do

Load this when a session reaches, explains, or is about to discuss the push
gate. Everything here is about the moment a **human** has to act; the session's
own job is to state it clearly and then wait.

> **Changed under [ADR-0061](../../../../../docs/adr/0061-uniform-human-approval-ceremony.md).**
> In `signature` mode the human's part is now **one command, the word
> `approve`, and the passphrase** — `authorize-critical` collapsed the old
> two-step `prepare-critical`/`approve-critical` shape into a single
> invocation. The sections below describe both the current shape and what it
> replaced, because a repository running an older plugin build still walks the
> old one. See `docs/push-release-flow.md` (repo-root path; a hosted project
> without that path reads the vendored copy at
> `${PIPELINE_PLUGIN_ROOT}/docs/push-release-flow.md` instead, per
> `pipeline-start` SKILL.md's canon-reference rule) for the full, canonical,
> layer-by-layer description this reference summarizes.

## The fast path to the signature (NVA-V4-PUSHDRIVER)

Before hand-running the layers below one at a time, one command chains the
preparatory push layers up to the point of signature:

```
node plugins/pipeline-core/scripts/push-init.mjs --root <repo> --by <name> --remote <remote> --destination refs/heads/<branch> [--base <ref> --candidate <ref> [--record-ref <ref>]]
```

It runs the same read-only checks documented in `docs/push-release-flow.md`
layer by layer, in their existing order, and reports the first one that is
not green — it never replaces those per-layer commands, only saves running
them one at a time when nothing needs individual attention. **It stops at
the signature and never executes it**: once every precondition is green it
prints the exact `authorize-critical` command below, already filled in, for
the human to run — the driver itself cannot sign it, approve it, or clear
any gate.

## The one setting

`gates.push_approval` in `pipeline.user.yaml` decides how a human clears a push.
Two supported values:

- **`signature`** (the default, and what an unreadable or unrecognised value
  resolves to): the human produces a detached Ed25519 proof with a private key
  that lives **outside** the repository. Presence of a valid, correctly-bound
  signature *is* the authorization — there is no in-session step that activates
  it afterwards.
- **`chat`**: the human clears it in the session. Still bound to the exact
  candidate commit, still labelled in the record — but it is an **attribution
  record, not a proof**.

Both stay commit-bound. Neither grants anything to the guard union's absolute
prohibitions: no force-push, no history rewrite, no deleted protected branch or
tag, no skipped hooks. Those have no route under either value.

**`chat` is a posture choice, not an escape hatch.** If a session hits a
confusing refusal under `signature`, the answer is to read the refusal, not to
change the mode. Proposing a downgrade because a ceremony was awkward teaches an
operator to weaken a gate whenever it is inconvenient, which is the one habit
this gate exists to prevent. A human may choose `chat` deliberately, for a
project where an attribution record is the honest level of assurance. That is
their decision to state, not a session's to suggest as a fix.

## `gates.push_approval` has already decided the route — walk it, do not offer alternatives

The setting is not a preference a session re-opens per push; it is a standing
decision the human already made. When a push needs clearing, the job is to
state which mode this repository runs, what that mode requires of the human,
and the exact command — then wait. It is not to lay out a menu of ways past
it. A session that offers alternatives is asking, in substance, to be let off
the route the human configured, and a human who then has to name the plain
route themselves ("I want to go the normal signature way — that's what it's
for") is proof the session failed at its one job here, not proof the route was
too heavy to state directly.

**What `signature` mode actually costs the human, stated plainly: one command,
the word `approve`, and the passphrase.** `authorize-critical` computes and
fills in every dynamic value (the subject hash, the candidate binding, the
expiry) before it ever reaches the human's terminal; the human's part is
typing `approve` and then their passphrase at the prompt. That is the whole
ceremony, and a session has no honest basis for describing it as complicated,
burdensome, or something to route around — it isn't, on the numbers above.

**Two evasions have already been observed, name them for what they are and
why each is worse than the ceremony it dodges, not merely disallowed:**

- **Proposing a mode change** (suggesting `chat` because `signature` felt
  awkward) is covered above — it trades real proof for an attribution record
  to make an inconvenience go away, which is exactly the habit the gate
  exists to prevent.
- **Offering to push it yourself, or having the human push instead of running
  the ceremony,** is a second, distinct evasion and is not a lighter path: it
  moves the actual work onto the human by hand, and it abandons the
  commit-bound record the gate exists to produce in the first place. A push
  made this way carries no proof and no attribution record — a worse outcome
  than either mode of the ceremony it was offered as an alternative to.

**An awkward or failed earlier ceremony is not evidence the route is wrong.**
The live failures this reference documents below (a prepared approval dying
under a fresh commit, a stale trust record, an unnamed proof file) each have a
specific, diagnosable cause. The correct response to a confusing refusal is to
diagnose it — read the refusal, check against the causes below, ask the
`repair-map.mjs` planner — never to propose changing the mode or shifting the
push onto the human because one attempt went badly.

## The classifier's refusal surface is wider than "push"

Do not assume the harness auto-mode classifier only watches `git push` and
`git restore` (the two actions `docs/push-release-flow.md` names as its
headline risk). A live session has also had it fire on a bare read-only
`Read` of a guard script while investigating how the push gate works —
escalating a routine look-around into a sub-agent dispatch the PO then
rejected as overkill. Expect it to be able to fire on read-only
investigation near this gate too, and do not treat a hit there as a sign
something is broken.

## Never guess whether a refusal can be lifted — ask

```
node <plugin-root>/scripts/repair-map.mjs
```

`<plugin-root>` is the absolute path the bootstrap printed as `plugin root`;
substitute it yourself. The guard admits that exact path and nothing else, so a
repository-relative form is refused — and a consumer project has no
`plugins/pipeline-core/` directory to point at in the first place.

It queries the real override planner at runtime and separates answers that all
look like "refused" from the outside. Do not restate its verdicts anywhere; a
second copy goes stale exactly when someone is stuck and least able to check it.

## Three things that will happen to the human, and are not their mistake

Measured during one live ceremony on 2026-08-08, in which the PO of this
repository needed **three attempts** to open a single maintenance window. Say
these *before* they happen, not after.

**1. A prepared approval dies if a commit lands before it is installed.** The
signed subject binds the candidate commit; the install step compares it against
the repository's current `HEAD` and refuses on any difference. The ceremony sends
the human to another terminal by design, and the session keeps working meanwhile.
So: **stop committing between preparing an approval and installing it**, and say
so when you hand the human the command. Uncommitted working-tree changes are
fine — only a new commit breaks it.

**2. A trust record written before `humanName` existed reports as a key
mismatch.** The refusal says the external trust policy does not match the local
public key. It can be true, and it can equally mean the key is correct and the
record is simply older than the field. The two digests are identical in that
case. The route that works is to move the trust record aside and re-run `setup`
with `--human-name`, which regenerates it from the same public key; re-running
`setup` on top of the existing record does **not** repair it.

**3. The signing step writes a proof file and does not name it.** It prints a
signer block and succeeds. The install step then asks for `--proof` and refuses
with a message about supplying it from outside the repository — a true statement
that answers a question nobody asked. The file is in the same external key
directory, named for the same subject. Look there.

## The commands, and who runs which

Everything a session may run is read-only or verify-only. The signing step is the
human's, in their own terminal, at their own prompt — a session never handles key
material and never types a passphrase.

### The human's one command (current shape)

```
node plugins/pipeline-core/scripts/po-human-approval.mjs authorize-critical \
  --repo-root <repo> --directory <external-po-dir> \
  --feature-id <featureId> \
  --plan <repo-relative-PRD-path> --spec <repo-relative-spec-path> \
  --kind push --subject-sha256 <hash> --expires-at <ISO-8601>
```

Prepares the candidate-bound request and signs **that** request in one
invocation, stating the action kind, candidate commit/tree, subject binding,
expiry, and what the approval does not cover immediately before the passphrase
prompt. The human types `approve`, then the passphrase. That is the whole human
ceremony. The agent cannot run it — signing needs the private key, and
`po-approval-gate.mjs` deliberately cannot reach `authorize-critical` at all.

**Do not hand-format this command.** It carries seven dynamic, hash-bearing
values, and hand-quoting/line-wrapping a long multi-flag command is exactly
the failure mode already found and fixed for the unrelated host-boundary
retry route (`codex-pretool-guard.mjs`'s `copyCommand`, GF-094) — corrupting a
human's real terminal is a worse outcome here, a signing ceremony, not a
kickoff retry. Call `authorizeCriticalPushCommand({ repoRoot, directory,
featureId, plan, spec, subjectSha256, expiresAt })`
(`plugins/pipeline-core/scripts/po-human-approval.mjs`) instead of composing
the command text yourself. It returns the exact assembled `argv` (with
`launcher` defaulted to the script's own resolved path — never a value you
could get wrong) and a `copyCommand` field shaped exactly like
`launch.copyCommand` in `project-onboarding-v3.mjs`'s `restartCopyCommands`
(`posix`/`powershell`/`cmd`, each bounded under `COPY_COMMAND_MAX_COLUMNS`).
Relay `copyCommand`'s rendering to the human VERBATIM, line for line, exactly
as the existing restart-process rule already requires (`SKILL.md`) — never
hand-reconstruct it from memory, even for a value seen before.

Two things to pass on to the human:

- **`--repo-root` must be an absolute path.** `.` is rejected, and the refusal is
  a bare usage dump that does not say why. `"$PWD"` works.
- **The key directory** is supplied with `--directory`, or resolved from the
  machine-scoped configuration plane, or from the documented environment
  variable — in that precedence. Recording it once in the machine plane removes
  the question permanently.

**When none of those sources resolve a value, this is a stop-and-ask
condition, never a guess.** `po-human-approval.mjs` itself already refuses
cleanly on a genuinely missing directory — a clear error naming all three
routes, not a silent default or invented path — but a session must not read
that refusal as license to invent a value either, and must not reach the
refusal at all before asking. The same as kickoff's goal/profile/language
questions (`pipeline-start` SKILL.md's kickoff-intake section): ask the PO
once, as a real question with context, before running the command — never
infer, default, or reuse a path the PO did not type, and never retry with a
different guessed path after a refusal. Ask, in substance: "Where should
your PO signing key material live? This directory holds the private key
that proves your approvals — it must live **outside** this repository (nothing
in it is ever committed), and if it is lost, that key can no longer sign
approvals and a new key/authority record has to be created instead."

### The two-step shape (superseded as a human step, still supported)

```
node plugins/pipeline-core/scripts/po-approval-gate.mjs prepare-critical ...
node plugins/pipeline-core/scripts/po-human-approval.mjs approve-critical \
  --repo-root <repo> --directory <external-po-dir> --kind push
```

Still exists and is unchanged for programmatic use, and is what a repository
running an older plugin build still walks. It is no longer the human's path: a
failed `prepare-critical` followed by a successful `approve-critical` can sign
the **stale** request still on disk, with a confirmation that looks entirely
normal — the failure mode `authorize-critical` removes by construction. Do not
offer this shape to a human as the current ceremony; `docs/push-release-flow.md`
carries the full detail (subject-sha256 computation, external-directory
verification, etc.) for whichever shape a given repository is actually running.

## What a session should say, and what it must not do

Say: which mode this project is in, what that requires of the human, the exact
command with the digest filled in, and the three warnings above that apply.

Do not: propose a mode change to get past a refusal, construct a workaround for a
guard, re-run a ceremony step the human already completed, or claim an approval
exists without reading it back.
