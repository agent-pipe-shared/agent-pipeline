# ADR-0027: Gate philosophy — exactly 2 blocking human gates, hook-enforced, manifest modes as calibration

> _A German version follows below · Eine deutsche Fassung folgt weiter unten._

**Context:** The pipeline already had two human-gate precursors: the PRD-PO gate ([ADR-0021](0021-prd-po-gate.md), step 3b) and push approval ([ADR-0017](0017-push-policy-standing-approval.md), standing-approved in this repo). Both ran purely procedurally (prose/review discipline), never technically enforced. At the same time, the new manifest (`.claude/pipeline.yaml`, [ADR-0028](0028-manifest-approach.md)) introduces a per-gate `mode` (`blocking|warn|off`) — which at first glance conflicts with `guardrails/quality-gates.md` QG-06 ("gates are binary; warn-only needs an expiry date"). This conflict is deliberately named in the AP1 plan (guiding decision 5) and resolved here.

**Decision:** **Exactly two blocking human gates** in the pipeline, enforced deterministically by hooks instead of prose instruction:

1. **Dev-Plan Gate** (`guard-devplan.mjs`) — absorbs/reinforces the E21 PRD gate: PRD and plan are presented together; "approved" is booked deterministically via `node harness/scripts/pipeline-state.mjs approve-plan --by <name>` (the hook's basis, `docs/operating-model.md` §3.2 step 3b). An Edit/Write against a non-exempted path blocks as long as an active feature (`activeFeature`) does not yet carry `planApproved: true`.
2. **Push Gate** (`guard-push.mjs`) — checks evidence freshness (`evidence/verify-latest.json` + where applicable `evidence/security-latest.json`: `exitCode 0` AND `commit == HEAD`) plus the approval condition. In THIS repo, push human-approval is `standing-approved` ([ADR-0017](0017-push-policy-standing-approval.md)/E15) — the default template for new projects sets `required`.

**Step-9 human gate** (sign-off on the done-report, `docs/operating-model.md` §3.2) stays **non-blocking** (🟡-merge v2 unchanged) — it is not a third blocking gate type, just the existing sign-off semantics.

**Resolving the QG-06 conflict:** The manifest's gate modes `blocking|warn|off` are **PROJECT calibration**, not a loosening of the binary gate principle. QG-06 requires "binary, never warn-only without an expiry date" for ONE given gate in ONE given project state — the manifest makes that state explicit and documented instead of letting it silently lapse (documented configuration ≠ silent lapse, anti-pattern AP7). `mode: warn` additionally requires a justifying comment directly in the manifest (no `warn` without justification, mirroring QG-06's mandatory reason/owner/expiry fields in a leaner form at the manifest layer).

**Consequences:**
- *Positive:* Two procedural declarations of intent become two technically enforced gates — an edit before plan approval, or a push with stale/red evidence, is now a hook block (exit 2), not just a briefing prohibition a Goldfish could miss. The QG-06 conflict is cleanly resolved rather than silently ignored.
- *Negative:* Extra hook complexity (two new PreToolUse guards); an invalid or misconfigured manifest can fail into WARN instead of BLOCK (deliberately fail-open, [ADR-0028](0028-manifest-approach.md)).
- *Risk:* `mode: warn` could be abused as a convenient permanent state if the justification requirement isn't enforced. Mitigation: flanked by the Critic checklist (`governance` policies, [ADR-0030](0030-governance-layer.md)); QG-06 remains the canonical rule in `guardrails/quality-gates.md`, this ADR is only its application at the manifest layer.

**Rejected alternatives:**
- *More than two blocking human gates* (e.g. one gate per package) — rejected: the PO directive explicitly calls for "exactly two"; additional gates would throttle automode throughput against the principle established in [ADR-0017](0017-push-policy-standing-approval.md).
- *Loosen QG-06 because of the manifest modes (warn/off as equally valid permanent states)* — explicitly rejected; the modes remain calibration with a justification requirement, not a license for silent lapse.

**Status:** accepted (2026-07-07, PO plan approval "AP1 TUNING"); basis: `.claude/plans/2026-07-07-ap1-pipeline-tuning.md` guiding decision 5, [ADR-0017](0017-push-policy-standing-approval.md), [ADR-0021](0021-prd-po-gate.md), `guardrails/quality-gates.md` QG-06. No follow-up scheduled; first live probe of the two gate hooks: W-WIRE wave of the AP1 plan (`hooks.json` wiring).

<!-- DE-REFERENCE-BELOW | agents: skip everything below this line; it is a full German reference translation (redundant, wastes context). The authoritative content is the English above. Convention: CLAUDE.md (Language). -->

# ADR-0027: Gate-Philosophie — genau 2 blockierende Human-Gates, hook-durchgesetzt, Manifest-Modi als Kalibrierung

> Agent-Pipeline v0.1.0-draft · AP1-Tuning-Session · Stand 2026-07-07

**Status:** akzeptiert (2026-07-07, the PO-Plan-Freigabe „AP1 TUNING") · **Grundlage:** `.claude/plans/2026-07-07-ap1-pipeline-tuning.md` Leitentscheidung 5, [ADR-0017](0017-push-policy-standing-approval.md), [ADR-0021](0021-prd-po-gate.md), `guardrails/quality-gates.md` QG-06

## Kontext

Die Pipeline kennt bereits zwei Human-Gate-Vorläufer: das PRD-PO-Gate ([ADR-0021](0021-prd-po-gate.md), Schritt 3b) und die Push-Freigabe ([ADR-0017](0017-push-policy-standing-approval.md), in diesem Repo standing-approved). Beide liefen bisher rein prozessual (Prosa/Prüfweise), nie technisch durchgesetzt. Zugleich führt das neue Manifest (`.claude/pipeline.yaml`, [ADR-0028](0028-manifest-approach.md)) je Gate einen `mode` (`blocking|warn|off`) ein — das kollidiert auf den ersten Blick mit `guardrails/quality-gates.md` QG-06 („Gates sind binär; warn-only braucht ein Ablaufdatum"). Dieser Konflikt ist im AP1-Plan bewusst benannt (Leitentscheidung 5) und wird hier aufgelöst.

## Entscheidung

**Genau zwei blockierende Human-Gates** in der Pipeline, deterministisch durch Hooks durchgesetzt statt durch Prosa-Anweisung:

1. **Dev-Plan-Gate** (`guard-devplan.mjs`) — absorbiert/verstärkt das E21-PRD-Gate: PRD und Plan werden zusammen vorgelegt; „freigegeben" wird deterministisch verbucht via `node harness/scripts/pipeline-state.mjs approve-plan --by <name>` (Grundlage des Hooks, `docs/operating-model.md` §3.2 Schritt 3b). Ein Edit/Write gegen einen nicht-exemptierten Pfad blockt, solange eine aktive Feature (`activeFeature`) noch keine `planApproved: true` trägt.
2. **Push-Gate** (`guard-push.mjs`) — prüft Evidenz-Frische (`evidence/verify-latest.json` + ggf. `evidence/security-latest.json`: `exitCode 0` UND `commit == HEAD`) sowie die Approval-Bedingung. In DIESEM Repo ist die Push-Human-Approval `standing-approved` ([ADR-0017](0017-push-policy-standing-approval.md)/E15) — das Default-Template für neue Projekte setzt `required`.

**Schritt-9-Human-Gate** (Abnahme der Erledigt-Meldung, `docs/operating-model.md` §3.2) bleibt **nicht-blockierend** (🟡-Merge v2 unverändert) — es ist kein dritter blockierender Gate-Typ, sondern die bestehende Abnahme-Semantik.

**Auflösung des QG-06-Konflikts:** Die Manifest-Gate-Modi `blocking|warn|off` sind **PROJEKT-Kalibrierung**, keine Aufweichung des binären Gate-Prinzips. QG-06 verlangt „binär, nie warn-only ohne Verfallsdatum" für EIN gegebenes Gate in EINEM gegebenen Projektzustand — das Manifest macht diesen Zustand explizit und dokumentiert statt ihn stillschweigend verfallen zu lassen (dokumentierte Konfiguration ≠ stiller Verfall, Anti-Pattern AP7). `mode: warn` verlangt zusätzlich einen begründeten Kommentar direkt im Manifest (kein `warn` ohne Begründung, spiegelt QG-06s Pflichtfelder Grund/Owner/Ablaufdatum in schlankerer Form für die Manifest-Ebene).

## Konsequenzen

**Positiv:** Aus zwei prozessualen Absichtserklärungen werden zwei technisch erzwungene Gates — ein Edit vor Plan-Freigabe oder ein Push mit veralteter/roter Evidenz ist jetzt ein Hook-Block (exit 2), nicht mehr nur ein Briefing-Verbot, das ein Goldfish übersehen könnte. Der QG-06-Konflikt ist sauber aufgelöst statt stillschweigend ignoriert.

**Negativ:** Zusätzliche Hook-Komplexität (zwei neue PreToolUse-Guards); ein invalides oder fehlkonfiguriertes Manifest kann im Fehlerfall zu WARN statt BLOCK führen (bewusst fail-open, [ADR-0028](0028-manifest-approach.md)).

**Risiko:** `mode: warn` könnte als bequemer Dauerzustand missbraucht werden, wenn die Begründungspflicht nicht durchgesetzt wird. Mitigation: Critic-Checkliste flankiert (`governance`-Policies, [ADR-0030](0030-governance-layer.md)); QG-06 bleibt in `guardrails/quality-gates.md` die kanonische Regel, dieses ADR ist nur ihre Anwendung auf die Manifest-Ebene.

## Verworfene Alternativen

- **Mehr als zwei blockierende Human-Gates** (z. B. je Paket ein eigenes Gate) — verworfen: the PO-Direktive verlangt ausdrücklich „genau zwei", zusätzliche Gates würden den Automode-Durchsatz gegen den in [ADR-0017](0017-push-policy-standing-approval.md) etablierten Grundsatz ausbremsen.
- **QG-06 wegen der Manifest-Modi aufweichen (warn/off als gleichwertige Dauerzustände)** — ausdrücklich verworfen; die Modi bleiben Kalibrierung mit Begründungspflicht, kein Freibrief für stillen Verfall.

## Wiedervorlage

Keine. Erste Live-Probe der beiden Gate-Hooks: W-WIRE-Welle des AP1-Plans (`hooks.json`-Verdrahtung).
