# The push-approval gate, and what a human actually has to do

Load this when a session reaches, explains, or is about to discuss the push
gate. Everything here is about the moment a **human** has to act; the session's
own job is to state it clearly and then wait.

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

```
node plugins/pipeline-core/scripts/po-human-approval.mjs
```

Run it with no arguments to see the current subcommand set rather than trusting a
list written here; the set has changed before, and a stale command in a shipped
file is worse than none. Two things to pass on to the human when you do:

- **`--repo-root` must be an absolute path.** `.` is rejected, and the refusal is
  a bare usage dump that does not say why. `"$PWD"` works.
- **The key directory** is supplied with `--directory`, or resolved from the
  machine-scoped configuration plane, or from the documented environment
  variable — in that precedence. Recording it once in the machine plane removes
  the question permanently.

## What a session should say, and what it must not do

Say: which mode this project is in, what that requires of the human, the exact
command with the digest filled in, and the three warnings above that apply.

Do not: propose a mode change to get past a refusal, construct a workaround for a
guard, re-run a ceremony step the human already completed, or claim an approval
exists without reading it back.
