---
schema: pipeline.backlog-item.v1
id: pipeline.signing-ceremony-designed-for-the-verifier-not-the-signer
type: improvement
owner: pipeline
status: open
created: 2026-08-08
due: 2026-09-05
source: "PO, 2026-08-08, forwarding findings from the Phoenix project as ONE package for Nova/0.5.4 rather than separate tickets. Trimmed 2026-08-09 on the PO's instruction — 'nur was du reproduzieren kannst, rest komplett verwerfen' — after the Elephant walked the whole ceremony live and measured every claim against this code."
---

# The signing ceremony is designed for the verifier, not for the person signing

## The shared cause, which is why this is one item

Every finding below is correct from the verifier's side. The subject is
digest-bound, the expiry is absolute and signed, the trust policy is a
fingerprint comparison — all of it is right, and none of it was designed for the
human who has to walk to another terminal, type a passphrase, and come back.

That asymmetry is the item. Fixing the findings individually produces one patch
per message. Fixing the cause means asking, at every step the ceremony hands to a
human, what that human can see at the moment they must decide — and printing it.

## Every finding here was reproduced against this code

The PO's instruction was to keep only what reproduces and discard the rest
completely. Two forwarded findings did not reproduce and are recorded as
discarded at the bottom, in one line each, so nobody re-files them. Everything
below was measured, most of it during a single live ceremony on the night of
2026-08-08 in which the PO tried to open a maintenance window and needed three
attempts.

### 1. A prepared window is killed by any commit, and nothing says so

`guard-maintenance-window.mjs:497` compares `git rev-parse HEAD` against the
signed candidate and fails with `GMW-CANDIDATE-COMMIT-MISMATCH`. The confirmation
block the human reads before typing their passphrase prints
`candidate commit: <sha>` — and never says that a commit arriving before `install`
invalidates the signature they are about to produce.

Observed exactly: the PO signed, an agent committed twice while they were in the
other terminal, and `install` refused. A second passphrase entry was the cost.

**The repair is disclosure, not removal, and the precedent is ours.** `23d93b0`
already removed a check for this class of reason — *"killed a signature for a
reason the PO was never asked about"*. One thing flips the conclusion here: that
check compared bytes under an unrelated directory, while this one compares the
repository's actual `HEAD` against what was signed. The comment at `:486`–`:494`
argues that distinction correctly and deliberately keeps uncommitted working-tree
bytes admissible. So the binding stays; `prepare` should print the invalidation
condition in the same output that sends the human away.

*Correction of record:* an earlier Elephant measurement in this same session said
this did **not** reproduce. That was wrong — it checked `openingTreeSha256`, which
`install` records rather than enforces (`:578`–`:582`), and inferred the same of
the candidate commit. It is not the same, and the live run proved it.

### 2. `PO-APPROVAL-TRUST-MISMATCH` names neither value it just compared

`po-approval-proof.mjs:35` returns `{ verified: false, code: "PO-APPROVAL-TRUST-MISMATCH" }`
and nothing else — no observed key digest, no expected one, no directory searched.
Both values are in hand at the moment it refuses.

### 3. The signing path reports a missing FIELD as a key mismatch

`po-human-approval.mjs:269`–`:270` requires the named authority shape
`{keyReference, publicKeySha256, humanName}` and, when `humanName` is absent,
fails with *"external trust policy does not match the local public key"*.

Measured against the PO's own key directory during the live run:

```
trust-policy.publicKeySha256 : f28988b2…73db14
sha256(po-public.pem)        : f28988b2…73db14
```

Identical. The key was correct; the record simply predated `humanName`. The
message sent the PO looking for a key problem that did not exist.

### 4. The same file already knows better, ten lines away

`setup` (`:347`–`:353`) splits exactly these two questions apart and says so in
its own comment: *"Two different questions, two different messages (FIXTURE-2):
is this the right key … and separately, does this record simply predate
`--human-name`"*. The signing path never received that split. The fix for finding
3 is therefore not new code — it is the code beside it.

### 5. `setup` names a repair it does not perform

Its message says to *"run setup again with `--human-name`"*. Re-running it takes
the branch at `:341` (all three files present), fails the same check at `:352`,
and **never rewrites the record**. The only route out is for the human to move
the record aside so the `:333` branch (keys present, authority absent)
regenerates it from the same public key — correct, safe, and undocumented, while
the documented one is a loop.

This is the sharpest instance in the item: a refusal pointing at a closed door is
worse than a refusal pointing nowhere, because the reader spends their time on
the door.

### 6. One unreadable capability record silences the whole store

`human-guard-override.mjs:1967`–`:1975` lists every capability file and validates
them in a loop. `validatedCapability` rejects anything whose `schema` is not the
current `pipeline.human-guard-override-capability.v2` (`:1255`), and the loop's
`catch` returns `{ status: "invalid", code: "HGO-CAPABILITY" }` **for the whole
store** rather than skipping the record it could not read. A single leftover v1
file therefore hides a perfectly valid armed capability that sorts after it, and
the operator is told the store is invalid rather than which record is.

### 7. `sign-intent` writes the proof and does not say where

The command succeeds, prints its `signer` block, and never names the file it just
wrote. `install` then refuses with *"authority and proof must be supplied outside
the repository"* — a true statement that answers a question the operator did not
ask. The path is derived from a suffix rule (`:315`) the operator cannot be
expected to know.

### 8. Two arguments, two qualities, in the same function

`--repo-root .` is rejected with the bare usage dump (`:163`), while `--directory`
two lines above (`:160`–`:161`) explains precisely what is wrong and lists all
three ways to supply it.

## The PO's own conclusion after walking it, and it outranks the individual fixes

> *"mE auch quark dass ich 2 sachen eingeben muss. Ich denke es braucht für diese
> ganzen Sachen ein verlässliches Skript `.sh`, was man immer aufruft und was
> dann alles sauber managed."* — PO, 2026-08-08, immediately after completing the
> ceremony on the third attempt.

That is the right shape and it is worth more than fixing eight messages. Walking
the ceremony by hand makes the human hold state the tooling already has: which
digest is current, where the proof was written, whether `HEAD` moved since
prepare. Every finding above is an instance of the human being made the
integrator. A single entry point — prepare, present, sign, install, verify, and
say plainly what happened — removes the class rather than its symptoms, and
findings 1, 3, 5 and 7 stop being *situations* rather than becoming better
*messages*.

Two constraints it must not break, both of which the current design gets right
and a convenience wrapper could easily lose:

- **The passphrase prompt stays a real, attended OpenSSL prompt.** The value of
  the ceremony is that a human sees what they are signing; a wrapper that hid the
  confirmation block would be worse than the friction it removes.
- **One human decision, not zero.** The goal is one entry point, not one
  keystroke. The confirmation display — digest, scope, expiry, candidate — must
  survive verbatim.

## Direction

1. **Build the single entry point first.** It subsumes findings 1, 3, 5 and 7 and
   is the PO's own stated need.
2. **Then the disclosure fixes** (2, 3, 8): print the values already in hand at
   the moment of refusal, and name the failing argument. Finding 4 says where the
   pattern to copy already lives.
3. **Finding 6 is a different shape** — a store failing closed over one unreadable
   record is a robustness defect, not a disclosure one. Skip the record it cannot
   read and name it; do not silence the store.

## Discarded (measured against this code, did not reproduce)

- **A 5-minute TTL on the human-guard-override plan.** `human-guard-override.mjs:56`
  sets `DEFAULT_TTL_MS = 30 * 60_000`. Nothing under `plugins/pipeline-core/`
  carries a five-minute TTL; the only `5 * 60 * 1000` is an unrelated
  `CHANNEL_FETCH_SKEW_MS`.
- **The intent digest the tooling never prints.** It does. The confirmation block
  opens with `intent sha256: <digest>`, observed verbatim in the live run.

## Related

- `2026-08-08-agents-are-judged-by-rules-no-artifact-ever-tells-them.md` — the
  same shape one layer down: a rule that is correct from the enforcer's side and
  invisible from the side that must comply.
- `2026-08-08-the-grammar-refusal-does-not-say-which-part-of-the-command-failed.md`
  — the same shape again, in a guard rather than a ceremony.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
