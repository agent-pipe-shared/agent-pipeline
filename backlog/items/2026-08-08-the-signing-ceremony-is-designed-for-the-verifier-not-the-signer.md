---
schema: pipeline.backlog-item.v1
id: pipeline.signing-ceremony-designed-for-the-verifier-not-the-signer
type: improvement
owner: pipeline
status: open
created: 2026-08-08
due: 2026-09-05
source: "PO, 2026-08-08, forwarding five findings from the Phoenix project as ONE package for Nova/0.5.4 rather than five tickets, with the shared cause named: 'die Zeremonie ist aus Sicht des Prüfers entworfen, nicht aus Sicht dessen, der unterschreibt.' Two of the five were measured against this repository and do not reproduce here; recorded below rather than dropped."
---

# The signing ceremony is designed for the verifier, not for the person signing

## The shared cause, which is why this is one item

Every one of the findings below is correct from the verifier's side. The subject
is digest-bound, the expiry is absolute and signed, the trust policy is a
fingerprint comparison — all of it is right, and none of it was designed for the
human who has to walk to another terminal, type a passphrase, and come back.

That asymmetry is the item. Fixing the five individually produces five patches
that each make one message longer. Fixing the cause means asking, at every step
the ceremony hands to a human, what that human can see at the moment they must
decide — and printing it.

## The five findings, as reported

1. **A prepared window can be invalidated by an unrelated commit, silently.**
   The ceremony sends the signer to another terminal by design, and the
   repository keeps moving while they are gone. They find out from a five-word
   code *after* typing the passphrase.
2. **A 5-minute TTL on the human-guard-override plan** — too short for a human
   with a passphrase in another window.
3. **The intent digest the tooling never prints**, so the signer cannot check
   what they are signing against what was prepared.
4. **`PO-APPROVAL-TRUST-MISMATCH` names neither the key nor the directory** it
   looked in.
5. **The capability store falls silent entirely because of one v1 record**,
   rather than skipping the record it cannot read.

## The repair for (1) is disclosure, not removal — and the precedent is ours

The PO's reasoning, recorded because it decides the shape: `23d93b0` already
removed a check for this exact class of reason ("killed a signature for a reason
the PO was never asked about"). The same argument applies here, but with one
difference that flips the conclusion: **this time the invalidating write is not
unrelated to the subject.** So the fix is for `prepare` to print the bound
candidate and the invalidation condition itself, at prepare time, in the same
output that sends the human away. That costs nothing and removes the surprise
without removing the binding.

## Measured against this repository before assigning: two do not reproduce here

Filed as measurements, not as corrections of the Phoenix report — the finding may
be entirely real in that project's version, and the point of recording it is that
Nova must not go fix a condition this code does not have.

- **(2) does not reproduce.** `lib/human-guard-override.mjs:56` sets
  `DEFAULT_TTL_MS = 30 * 60_000` — thirty minutes, not five. Nothing under
  `plugins/pipeline-core/` (excluding tests) carries a five-minute TTL at all; the
  only `5 * 60 * 1000` is `CHANNEL_FETCH_SKEW_MS` in `release-version-plan.mjs`,
  which is unrelated. **Before designing a fix, locate which artifact actually
  carries the five minutes** — it may be a CLI default, a private overlay, or
  Phoenix's own pinned version.
- **(1)'s mechanism does not reproduce in the maintenance window.**
  `prepare` binds `openingTreeSha256 = pluginTreeSha256(livePluginRoot)` into the
  signed subject (`lib/guard-maintenance-window.mjs:440`), but `install` writes
  both halves as `preparedTreeSha256` / `observedTreeSha256` with the comment
  *"recorded rather than enforced"* (`:578`–`:582`). A tree change between prepare
  and install therefore does **not** kill the window here. The commit-bound
  artifact in this repository is the **push approval**, which binds the exact
  candidate commit. So the disclosure fix is still right — it just belongs at
  whichever `prepare` actually enforces the binding, and that has to be
  established first.

## Three more, from one attempt to actually sign something (2026-08-08, same day)

The PO tried to sign a guard-maintenance-window intent so a session could edit a
protected path. It failed. Every step below was measured, and together they are
the strongest argument that this is one item and not five tickets — three
independent defects surfaced in a single ceremony, and every one of them is the
same asymmetry.

**6. The refusal claims a key mismatch where a FIELD is missing, and prints
neither value.** `sign-intent` failed with *"external trust policy does not match
the local public key"*. Measured against the PO's own key directory:

```
trust-policy.publicKeySha256 : f28988b2…73db14
sha256(po-public.pem)        : f28988b2…73db14
```

Identical. The key is correct. What the record lacks is `humanName`: it carries
the pre-`humanName` shape `{keyReference, publicKeySha256}`, and
`po-human-approval.mjs:269`–`:270` requires the named shape, then reports the
failure as an identity mismatch. The comparison it just performed has both
digests in hand and prints neither — the same shape as finding 4, in a second
place.

**7. The same file already knows better, ten lines away.** `setup`
(`:347`–`:353`) splits exactly these two questions apart and says so in its own
comment: *"Two different questions, two different messages (FIXTURE-2): is this
the right key … and separately, does this record simply predate `--human-name`"*.
The signing path never received that split. The fix for finding 6 is therefore
not new code; it is the code beside it.

**8. `setup` names a repair it does not perform — worse than naming none.** Its
message says to *"run setup again with `--human-name`"*. Re-running it takes the
branch at `:341` (all three files present), fails at `:352`, and **never rewrites
the record**. The only route out is for the human to move the file aside so the
`:333` branch (keys present, authority absent) regenerates it from the same
public key. That route is correct, safe and undocumented; the documented one is a
loop. This is the sharpest instance in this item of a refusal pointing at a
closed door.

**And a fourth, on the way in:** `--repo-root .` is rejected with the bare usage
dump (`:163`), while `--directory` two lines above (`:160`–`:161`) explains
exactly what is wrong and lists the three ways to supply it. Same parser, same
function, two quality levels.

## Measured and confirmed here

- **(4) reproduces exactly.** `lib/po-approval-proof.mjs:35` returns
  `{ verified: false, code: "PO-APPROVAL-TRUST-MISMATCH" }` and nothing else — no
  observed key digest, no expected one, no directory searched. The comparison it
  just performed has both values in hand at the moment it refuses, and prints
  neither. That is the cheapest fix in the package and the most representative:
  the verifier needs a boolean, the signer needs the two values.
- **(3) and (5) are unverified here** — no measurement was taken. They are
  carried forward as reported, and whoever picks this up measures them first, the
  same way (2) and (1) were measured.

## Direction

1. **One pass, one question, at every human handoff:** what can the person see at
   the moment they must decide? Print that. The four disclosure findings (1, 3, 4)
   are the same fix applied at three places.
2. **(5) is a different shape** — a store that fails closed over one unreadable
   record is a robustness defect, not a disclosure one. A v1 record it cannot read
   should be skipped and named, not silence the store.
3. **Do not fix (2) or (1) until the artifact carrying them is located.** Two
   measurements above say this code is not where they are.

## Related

- `2026-08-08-agents-are-judged-by-rules-no-artifact-ever-tells-them.md` — the
  same shape one layer down: a rule that is correct from the enforcer's side and
  invisible from the side that has to comply with it.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
