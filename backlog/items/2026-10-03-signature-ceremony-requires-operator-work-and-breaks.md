---
schema: pipeline.backlog-item.v1
id: pipeline.signature-ceremony-requires-operator-work-and-breaks
type: defect
owner: pipeline
status: open
created: 2026-10-03
source: "0.7.0 three-runner greenfield analyses 2026-10-03: Antigravity report §5.2/E25, Codex report (P1 'PO had to run recovery commands', HGO-SIGNATURE-INTENT-INVALID, HGO-DRIFT), Claude report §4/E25."
sprint: alfred
done_when: manual
---

# Signature ceremonies demand operator work beyond signing and break on common states

## Description

In signature mode, the human should only run one final, wrap-safe signing
command. In all three greenfield runs the PO had to do considerably more:

- **Unborn HEAD:** `prepare-for-signature` fails with
  `HGO-SIGNATURE-INTENT-INVALID` in a repository without an initial commit,
  because the intent binds `HEAD:tree` (Antigravity §5.2; Codex, twice).
- **Multi-line commands:** a backslash-continued command broke when pasted into
  the PO's WSL terminal (Antigravity; PO: "gib mir den Befehl noch mal in einer
  Zeile").
- **Preparation pushed to the PO:** the PO ran `prepare-for-signature`,
  `refreeze-plan` and an external directory diagnosis, and copied JSON results
  back into the chat (Codex; Claude §4 rows 5/6, with a 30-minute window). The
  operating model requires agent-side preparation and only the terminal
  signature from the human (`roles/elephant.md` EL signature-mode rule).
- **Stale request handed over:** `HGO-DRIFT: override request preimage drifted`
  after a refreeze (Codex), and a burnt signature through a digest change
  (Claude, item `2026-10-03-guard-override-request-digest-drifts-after-arming.md`).
- **Override cancelled by the system it unblocks:** an Antigravity override
  edited `pipeline.user.yaml` routes. `guard-lifecycle-ready` then treated the
  edited routing as a stale registry projection, and the prescribed migration
  rewrote it back (Antigravity Befund 5).

## Acceptance

- The agent validates candidate, HEAD (including unborn), paths and request
  digest before handing anything to the PO. The PO receives exactly one
  single-line signing command per approval and nothing else.
- Signing works in an unborn-HEAD repository.
- No JSON copy-back into the chat: the agent imports the proof itself.
- A PO-signed configuration override is a durable layer that later migrations
  respect, or the override route is refused up front with the real alternative.
- Covered by the end-to-end test of
  `2026-10-03-three-runner-happy-path-with-two-po-approvals.md`.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
