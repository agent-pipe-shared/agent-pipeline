# ADR-0021: PRD-PO Gate Before the First Implementation Dispatch

> _A German version follows below · Eine deutsche Fassung folgt weiter unten._

**Status:** provisional ("let's test it this way for now", PO directive 2026-07-05, tuning session) · **Basis:** Register E21

## Context

Before Register E21 there was no binding product sign-off point between solution design and the first implementation dispatch. The PO introduced a PRD gate at the tuning session, explicitly as a trial.

## Decision (E21, verbatim in intent)

After solution design and passed readiness, and BEFORE the first implementation dispatch, the PO approves a German `prd_<topic>.md` — product rationale (what/why/scope/non-goals/risks/alternatives), NOT acceptance criteria (those stay agent-facing English in the spec; PRD and spec reference each other, no duplication). **Mandatory when rigor ≥1 OR classification high; a true stage-0 fast path no longer applies** (only small hotfixes without product relevance are exempt). Approval via EL-17a; "approved" is a gate, not a UI dialog. Filed at `specs/<task>/prd_<topic>.md`. `sdp_<topic>.md` is an optional companion artifact WITHOUT a gate (enterprise reservation). Implemented in: operating-model §3.2 (step 3b)/§3.1/§3.3, `roles/elephant.md` EL-19, `templates/prd.md`, kickoffs (commit `6b8b1c3`). Provisional ("let's test it this way for now"); full ADR formalization deferred to Phase 2.

**Addendum (PO finding 2026-07-05 evening, R-M14):** gate held ≠ gate fulfilled — the draft must henceforth be surfaced PROACTIVELY as a READABLE document on the device (a repo path alone is not a valid presentation), with explicit waiting for the literal word "approved"; a failure to present it counts as a process incident. EL-19 anchored in the bootstrap 1d list plus a third confirmation line (commit `fc725c6`).

## Consequences

**Positive:** binding product check before implementation cost is incurred; PRD and spec stay separate (product rationale vs. acceptance criteria) instead of duplicated maintenance.

**Negative:** an extra gate step before every rigor-≥1/classification-high effort; no true stage-0 fast path left for hotfixes with product relevance.

**Risk:** the gate gets held formally but isn't actually read ("gate held ≠ gate fulfilled"). The addendum responds directly to this: proactive readable presentation plus explicit waiting for the literal word "approved".

## Rejected alternatives

- **Moving acceptance criteria into the PRD instead of the spec** — rejected to avoid duplicated maintenance; PRD and spec reference each other.
- **A pure UI dialog as approval** — rejected; "approved" is a gate, not a UI mechanism.

## Status / follow-up

Formalization status provisional — confirmation/revision after practical experience from the feature phase; no fixed date named in the register.

## Addendum (2026-08-25, AGY-PRDGATE-1): the acknowledgement marker now requires the attended chat-gate ceremony

**This strengthens, it does not reverse, ADR-0021's own rejected alternative** ("a pure UI dialog as approval" — rejected above). The mechanism this addendum closes was still the exact shape ADR-0021 already rejected in spirit: `po-authority-acknowledge-apply` — the command that writes `PO_GATE_PRD_ACKNOWLEDGEMENT_MARKER` into the PRD — was an ORDINARY command a ready agent session could run itself, with `--by <name>` supplied by nothing more than the agent's own claim about what the PO said in chat. `plugins/pipeline-core/lib/po-gate-authority.mjs`'s own `ACKNOWLEDGEMENT_REPAIR` guidance already said "an agent must never add it on the PO's behalf without that review having actually happened" — a promise resting entirely on the agent's own discipline, mechanically unenforced. This is precisely the R-M14 addendum's risk ("gate held ≠ gate fulfilled") named above, restated for the acknowledgement route specifically, and it was never actually closed for that route until now.

**The fix:** `po-authority-acknowledge-apply` is wired through `requireAttendedChatGateConfirmation()` (`plugins/pipeline-core/lib/chat-gate-ceremony.mjs`) — the same primitive `approve-push` (AGY-CHATADAPTER-1) and kickoff (AGY-CHATADAPTER-2) already use, and the concrete instance of [ADR-0061](0061-uniform-human-approval-ceremony.md) Decision 2 ("the ceremony is invariant across gate kinds... a new gate that introduces its own ritual is, by this decision, incorrectly designed"). Before the marker is written, `isAttendedTerminal()` must observe a real TTY on file descriptor 0 — never true for an agent's own tool-calling harness, TTY or not on whatever it pipes into stdin — and the PO must retype the `--by` value shown back to them. `--by`, not a generated challenge code or the plan's digest, is the confirmed value: ADR-0061 Decision 1 forbids "a hash pasted from one output into another input," and `--by` is already the value the PO must personally attest to, so nothing new needs to be generated and no state needs to be held between calls (a stateless, single-call design, unlike `approve-push`'s persisted `pendingPushChallenge` — that persistence exists there only because a push approval is not otherwise a single self-contained value to retype).

**This is not a mode-branch.** Unlike push (`gates.push_approval`: `signature` or `chat`, [ADR-0056](0056-push-approval-mode.md)), this gate has no `signature` alternative and none is added here — the ceremony applies unconditionally, always, for every plan acknowledgement, regardless of any repository configuration.

**Scope, deliberately narrow:** only `po-authority-acknowledge-apply` is gated. `po-authority-acknowledge-plan` (the read-only, non-mutating preview step that only prints the digest an apply would need) stays ungated — it writes nothing, and the marker is inserted exclusively by the apply step this addendum covers.

Implemented in: `plugins/pipeline-core/scripts/pipeline-state.mjs` (`po-authority-acknowledge-apply` case), `plugins/pipeline-core/lib/po-gate-authority.mjs` (`ACKNOWLEDGEMENT_REPAIR` guidance text updated to describe the mechanical enforcement, not only the moral prohibition), `docs/operating-model.md` (§4 "Human plan gate" item).

## Addendum (2026-08-29, AGY-CF-BL15): the confirmed value is no longer `--by`

**Supersedes one specific claim in the addendum above, not the mechanism it describes.** The 2026-08-25 addendum said the PO "must retype the `--by` value shown back to them" and that `--by` "is the confirmed value." That was true at the time and is no longer: `--by` is a person's name — arbitrary Unicode, arbitrary length, and, as a Windows lockout later showed (`backlog/items/2026-08-28-a-chat-gate-is-unusable-with-a-non-ascii-name-on-windows.md`), not reliably reproducible through every terminal's input path. `requireAttendedChatGateConfirmation()`'s actual security property is TTY-ness of file descriptor 0 (an attended human is present), never secrecy of the compared string, so a short fixed ASCII literal proves the identical attendance without a name's encoding/normalization/homoglyph baggage (`backlog/items/2026-08-28-a-gate-should-not-demand-a-human-name-typed-byte-exactly.md`).

The compared value is now `PO_ACK_APPLY_CONFIRMATION_TOKEN` (`plugins/pipeline-core/scripts/pipeline-state.mjs`, literal `"CONFIRM"`) — a fixed literal baked into the code, never generated or persisted between calls, so it needs no exception to ADR-0061 Decision 1's "hash pasted from one output into another input" prohibition (nothing is pasted between calls; it is typed back within the same attended call that displays it). `--by` stays fully disclosed, unchanged, in the confirmation summary the human reads and in the durable `poGateAcknowledgement` record — only the COMPARED value changed. This converges `po-authority-acknowledge-apply` on the same short-bounded-ASCII-token shape kickoff's `--language`/`--profile` gate and `human-guard-override.mjs`'s activation gate already used, so it is no longer the odd one out among `requireAttendedChatGateConfirmation()` callers.

<!-- DE-REFERENCE-BELOW | agents: skip everything below this line; it is a full German reference translation (redundant, wastes context). The authoritative content is the English above. Convention: CLAUDE.md (Language). -->

# ADR-0021: PRD-PO-Gate vor dem ersten Implementierungs-Dispatch

> Agent-Pipeline v0.1.0-draft · Sprint 1 · Stand 2026-07-06

**Status:** provisorisch („testen wir erst mal so", the PO-Direktive 2026-07-05, Tuning-Session) · **Grundlage:** Register E21

## Kontext

Vor Register E21 gab es keinen verbindlichen Produkt-Freigabepunkt zwischen Lösungsdesign und erstem Implementierungs-Dispatch. the PO führte an der Tuning-Session ein PRD-Gate ein, ausdrücklich als Test.

## Entscheidung (E21, wortgetreu)

> PRD-PO-Gate (the PO-Direktive 2026-07-05, Tuning-Session): Nach Lösungs-Design + bestandenem Readiness und VOR dem ersten Implementierungs-Dispatch gibt the PO ein deutsches `prd_<topic>.md` frei — Produkt-Rationale (Was/Warum/Scope/Nicht-Ziele/Risiken/Alternativen), NICHT Akzeptanzkriterien (die bleiben agent-facing englisch in der Spec; PRD/Spec referenzieren einander, keine Doppelung). **Pflicht bei Rigor ≥1 ODER Klasse hoch; echter Stufe-0-Fast-Path entfällt** (kleine Hotfixe ohne Produkt-Review). Freigabe per EL-17a; „freigegeben" = Gate (kein UI-Dialog). Ablage `specs/<task>/prd_<topic>.md`. `sdp_<topic>.md` = optionales Begleitartefakt OHNE Gate (Enterprise-Vorbehalt). Umgesetzt: operating-model §3.2 (Schritt 3b)/§3.1/§3.3, roles/elephant.md EL-19, templates/prd.md, Kickoffs (Commit `6b8b1c3`). Provisorisch („testen wir erst mal so"). ADR-Formalisierung Phase 2. **Nachtrag (the PO-Befund 2026-07-05 abends, R-M14):** Gate gehalten ≠ Gate erfüllt — die Vorlage erfolgt künftig PROAKTIV als LESBARES Dokument aufs Gerät (Repo-Pfad allein ist keine Vorlage), mit explizitem Warten auf das wörtliche „freigegeben"; unterlassene Vorlage = Prozess-Inzident. EL-19 in Bootstrap-1d-Liste + dritte Bestätigungszeile verankert (Commit `fc725c6`)

## Konsequenzen

**Positiv:** Verbindlicher Produkt-Check vor Implementierungskosten; PRD und Spec bleiben getrennt (Produkt-Rationale vs. Akzeptanzkriterien) statt Doppelpflege.

**Negativ:** Zusätzlicher Gate-Schritt vor jedem Rigor-≥1-/Klasse-hoch-Vorhaben; kein echter Stufe-0-Fast-Path mehr für Hotfixe mit Produktrelevanz.

**Risiko:** Gate wird formal gehalten, aber nicht wirklich gelesen („Gate gehalten ≠ Gate erfüllt"). Der Nachtrag reagiert direkt darauf: proaktive lesbare Vorlage + explizites Warten auf das wörtliche „freigegeben".

## Verworfene Alternativen

- **Akzeptanzkriterien ins PRD verlagern statt in die Spec** — verworfen, um Doppelpflege zu vermeiden; PRD/Spec referenzieren einander.
- **Reiner UI-Dialog als Freigabe** — verworfen; „freigegeben" ist ein Gate, kein UI-Mechanismus.

## Wiedervorlage

Formalisierungsstatus provisorisch — Bestätigung/Revision nach Praxiserfahrung der Feature-Phase; kein festes Datum im Register genannt.
