---
schema: pipeline.backlog-item.v1
id: pipeline.single-trust-anchor-excludes-key-rotation-and-teams
type: defect
owner: pipeline
status: closed
closed_at: 2026-08-11
closure_repository: self
closure_commit: 4a61bf1d099da48e33f37b356021e1e78a0c6141
closure_evidence: specs/sprint-nova-epic/evidence/backlog/2026-08-11-pareto-triage-report.md
created: 2026-08-08
due: 2026-08-22
source: "PO, 2026-08-08, on reading that a lost key has no signature path back: 'auch im team werden ja verschiedene schlüssel benutzt. Meine Erwartungshaltung war hier, dass wir sicherstellen das ein mensch auditiert aber bewusst nicht welcher. Sprich für eine neue freigabe muss auch ein neuer human key funktionieren den es vorher nicht gab.'"
---

# One committed trust anchor makes key rotation, key loss and teams structurally impossible

## What is there

`project/critical-human-proof.json` pins exactly one key:

```json
"trustAnchor": { "keyReference": "local-po-key", "publicKeySha256": "…" }
```

`critical-human-proof-policy.mjs` validates it as a single object with exactly two
fields (`exactKeys(anchor, ["keyReference", "publicKeySha256"])`). There is no
set, no list, and no "any key" mode.

## Three consequences, none of them intended

1. **A new key does not work.** Any key created after the anchor was written fails
   the check, so a human cannot approve with a key the repository has not already
   seen.
2. **A lost key is a dead end.** The signature path cannot be re-entered. This was
   recorded as an open question in
   `specs/sprint-nova-epic/plans/nova-setup-bootstrap.md` §5 before the cause was
   known; §5a now identifies it.
3. **Teams are excluded structurally, not merely unimplemented.** One anchor admits
   one holder. Two people with two keys cannot both approve, whatever else is
   configured.

## The property the PO expects, and why it is the better one

> the system must assure that **a** human audited, deliberately **not which** one

The anchor implements "*this* key holder audited". The gap is not a bug in the
anchor's logic; the anchor answers a question nobody needs answered.

**What the signature actually defends against is an agent approving its own work.**
An agent cannot produce one, because the key lives outside the checkout and the
passphrase is typed at a human's terminal. That holds for *any* key. A freshly
created key defends exactly as well as the pinned one. So the anchor returns
nothing against the threat while costing rotation, recovery and teams.

**What is given up, stated rather than glossed:** the claim weakens from "the PO
approved" to "a human approved". An attacker with shell access on the machine could
create a key and approve — but an attacker with shell access can already do worse,
and the pinned anchor does not stop them either (they can read the same
configuration and would need the same passphrase-protected key regardless).

## The distinction that must survive the change

**Not restricted is not the same as not recorded.** Any well-formed key may sign,
and the approval record must capture which public key did. "Who approved this"
stays answerable after the fact even though it is not constrained beforehand.
Losing that would be the real regression, and it is easy to lose by accident while
removing the anchor.

## Direction, not a design

1. **Optional anchor set.** Absent or empty means any well-formed key — the PO's
   intended default. A populated set enforces membership, for projects that want
   the stronger claim. One mechanism, two postures.
2. **Record the signer always.** Every approval record carries the signing key's
   `publicKeySha256` and its human-supplied `keyReference`, whether or not a set is
   configured.
3. **Version the schema, do not edit it in place.** Existing repositories carry
   `pipeline.critical-human-proof-policy.v1` with a single anchor. A new reader must
   not silently change their behaviour; a v2 with the set, and an explicit
   migration, keeps the change auditable.
4. **Re-check the downgrade rule against this.** `nova-setup-bootstrap.md` §5 says
   leaving `signature` on a repository with signed history requires a signature.
   Under an any-key policy that is still meaningful — it proves a human is present —
   but it no longer proves the *same* human. Decide whether that is acceptable or
   whether the downgrade is the one operation an anchor set should govern.

## Related

- `specs/sprint-nova-epic/plans/nova-setup-bootstrap.md` §5a — the design record.
- `2026-08-08-an-installing-consumer-is-never-asked-any-setup-decision.md` — the
  setup work this surfaced from.
- `2026-08-05-critical-human-proof-not-wired-to-push-and-prd-gates.md`

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
