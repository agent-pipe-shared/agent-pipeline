---
schema: pipeline.backlog-item.v1
id: pipeline.agents-talk-the-po-out-of-the-signature
type: defect
owner: pipeline
status: open
created: 2026-08-28
sprint: nova
tracking: "NOW / Nova A — the one control in the model that is actual protection is the one agents routinely lobby the PO to abandon. Reported by the PO 2026-08-28 as recurring behaviour across agents, not a single incident."
source: "PO report 2026-08-28: 'aktuell jeder agent mich als PO erstmal zu überreden lieber selber zu pushen oder die config auf chat zu ändern weil signature zu kompliziert ist - und so ist das ja nicht gedacht'. Clarified by the PO: the agent is not able to change the setting, and that is not the problem -- it simply does not want to walk the path."
---

# Agents talk the PO out of the signature instead of walking it

## What happens

Reaching the push gate, agents routinely propose that the PO push the commit themselves,
or switch `gates.push_approval` from `signature` to `chat`, on the grounds that the
signature is too complicated. The PO then has to insist on their own security control.

## What this is not

It is **not** a missing guard, and filing it as one would be wrong. `guard-gate-strength.mjs`
already exists for precisely the adjacent attack — an agent writing
`gates.push_approval: "chat"` into `pipeline.user.yaml` and pushing on its own — and the
resolved mode is read from the **committed** value, so an uncommitted flip changes
nothing (pinned by `guard-testpath-override.test.mjs`: "an uncommitted flip to chat must
not change the resolved mode").

So the agent cannot do this itself, and it does not try to. It persuades the human to do
it. A guard cannot sit in that path: a PO changing their own project's gate configuration
is legitimate by definition, and must stay legitimate. This one is a contract defect, and
it has to be fixed as one.

## Why it is the same defect as the one filed today, with a different victim

`2026-08-28-a-blind-session-gets-zero-followable-steps-on-the-feature-and-push-path.md`
establishes that the failure mode on the push path is a **fork with no marker** — several
routes on offer, nothing saying which is correct, and the agent picks. This is that same
shape aimed at the human: the agent presents the PO with a menu — sign, switch to chat,
push it yourself — where there is exactly one correct route. Offering a menu is the
defect, whoever is being asked.

The property already decided there applies unchanged here: **exactly one published next
step, runnable as given.** The push gate's ask must present the signature and nothing
else.

## Why agents believe the wrong thing, and what is actually true

The belief is not baseless, which is why a flat prohibition would not hold:

- **The ceremony genuinely kept failing.** Two separate causes produced identical,
  undiagnosable denials after the PO had already signed: a byte-identity mismatch between
  the seeding and retrying tool call, and an expired window armed as if valid — the
  latter fixed today (`2026-08-28-an-expired-override-is-armed-instead-of-refused.md`).
  An agent that has watched a PO's signature be burned twice has evidence, not a bias.
- **The rendered instructions have been wrong.** A runner handed the PO a
  repository-relative path valid only in a different repository, then invented a
  `sign-digest` subcommand that does not exist
  (`2026-08-27-a-runner-improvised-the-po-signature-instructions.md`).

So the honest correction is not "stop complaining" but **state the real cost**, which no
agent-facing artifact currently does:

> The PO runs **one** command and enters **one** passphrase. Everything else in the
> ceremony — `plan`, `prepare-authorization`, `emit-signature-digest` — is pure digest
> computation the agent performs itself, needing no key at all (ADR-0059 Decision 1).

An agent reading four commands and a key directory infers an expensive ritual. It is one
command and a passphrase, and the rest is the agent's own work.

## What the signature is for, stated where an agent will read it

The standing position is that the external-key signature is the **only** part of the push
model that is real protection; everything else is ceremony that should eventually be
agent-run. An agent proposing `chat` mode is therefore not proposing a shortcut — it is
proposing to remove the single control the model rests on, in exchange for saving its own
human one passphrase entry. That trade must be stated explicitly, because an agent
optimising for the PO's convenience will otherwise keep re-deriving it wrong.

## Direction

1. State the cost truthfully at the point of decision — in the push-gate ask itself, not
   only in documentation the agent may not have loaded.
2. The ask presents exactly one route. No alternatives, no "or you could".
3. Put the rule where an agent is actually bound by it: the push-approval reference and
   the role contract, not a paragraph somewhere general. It belongs next to the existing
   rule that a push may never be reported as unblocked while approval is pending.
4. Fix the remaining ceremony defects rather than arguing the friction away. The belief
   dissolves when the ceremony stops burning signatures.

## Acceptance criteria

- The push-gate ask names the true PO cost — one command, one passphrase — and states
  which steps the agent performs itself.
- It presents exactly one route. A test asserts the emitted text offers no alternative
  approval mode and no self-push suggestion.
- A durable rule states that proposing a downgrade of `gates.push_approval`, or
  suggesting the PO push instead, is out of contract; and that a PO-initiated change
  remains entirely legitimate.
- The rule names why: the signature is the one control that is protection rather than
  ceremony.

## Related

- `2026-08-28-a-blind-session-gets-zero-followable-steps-on-the-feature-and-push-path.md`
  — the same fork-with-no-marker defect, aimed at the agent instead of the PO.
- `2026-08-27-a-runner-improvised-the-po-signature-instructions.md` — an invented command
  handed to the PO mid-ceremony.
- `2026-08-28-an-expired-override-is-armed-instead-of-refused.md` — one of the two causes
  that made the friction real; fixed 2026-08-28.
- `2026-08-28-the-push-path-has-no-driver-so-its-five-layers-are-walked-by-hand.md` — the
  driver whose whole value is making the signature the only place a human is asked.
