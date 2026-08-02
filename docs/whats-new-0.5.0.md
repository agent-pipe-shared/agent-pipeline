# What’s new in 0.5.0

0.5.0 makes the Cyborg security delivery shared product behaviour. It is a
security and delivery-quality release, not a demand for more human approvals.

## For users coming from 0.4.x

- Policy-complete evidence, AI-assisted hardening, finding lifecycle, and
  security-readiness suites run through the normal Verify gate.
- Missing, stale, skipped, malformed, or candidate-mismatched evidence fails
  explicitly instead of being represented as success.
- The portable approval helper keeps the private Ed25519 key and passphrase
  outside the repository. The agent prepares/verifies public proof; the human
  runs `approve-all` only at a configured human gate.
- Release readiness now has deterministic support/EOL, disclosure, response,
  rollback, provenance, and public-redaction boundaries.

## What 0.5.0 does not claim

The shipped CLI adapter is an encrypted Ed25519/SSH-style key. Passkey,
IAM/hardware-key adapters, and remote provisional codes are future adapters.
A secret pasted into the same agent chat is visible to the agent and cannot
replace final local proof for an irreversible action.

---

## Deutsche Lesefassung (nicht normativ)

0.5.0 integriert die Cyborg-Security-Lieferung in das gemeinsame Verify-Gate:
fehlende, veraltete, übersprungene oder nicht zum Kandidaten passende Evidenz
wird nicht mehr grün gerechnet. Der ausgelieferte Freigabeweg verwendet einen
externen verschlüsselten Ed25519/SSH-ähnlichen Schlüssel; Routinearbeit bleibt
ohne menschliche Zwischenschritte. Passkey/IAM und mobile Übergangscodes sind
noch keine 0.5.0-Funktion.
