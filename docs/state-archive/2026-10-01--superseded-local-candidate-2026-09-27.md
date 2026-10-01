# Handover archive -- Historischer Übergang — lokaler 0.7-Kandidat, 2026-09-27

> Rotated from `docs/state.md` on 2026-10-01 by `plugins/pipeline-core/scripts/handover-rotate.mjs` (ADR-0066).
> Section(s) archived: Historischer Übergang — lokaler 0.7-Kandidat, 2026-09-27.
> Summary: Überholter Kandidaten-Checkpoint; offene Abnahme und Installationsreihenfolge bleiben im aktuellen Abschnitt erhalten.
> Append-only once written; never edited by hand.
> Content below is verbatim except that relative markdown link target(s) were rewritten to keep resolving correctly at this file's directory depth (link text and all other content are untouched).

## Historischer Übergang — lokaler 0.7-Kandidat, 2026-09-27

Alfred ist jetzt die aktive 0.7-Arbeitslinie; die älteren Nova-/Alfred-
Abschnitte weiter unten sind historische Checkpoints, keine Anweisung, die
Nova-Quelle erneut zu mergen. Der PO übernimmt die lokale Installation selbst.
Danach setzt eine **neue Codex-Session** die Abnahme und den getrennten
Release-Pfad fort. Diese Übergabe ist kein Feature-Close und keine Freigabe
zum Push, Tag, Release oder zur Marketplace-Veröffentlichung.

- Gestempelter Drei-Runner-Pluginstand: Commit
  `3f29294f7a3cfec334a899e292920d729b011a09`, Tree
  `135124a3bc13f7bbaae20ebe726edd2abe02bf70`, Build-Identität
  `20260927174722.15c963ef`. Der Checkout war nach dem normalen
  Stempel-Commit sauber; Manifest-Parität grün. Das Stempelskript hat
  nichts installiert. Der Quellcommit `ef471b03` wurde gegen die exakte
  PO-Signatur materialisiert; `15c963ef` band danach das Capability-Inventar.
- Work Verify auf `15c963ef`: 93/93 ausgewählte Suiten grün; Inventar-Suite
  nach Commit 30/30. **Kein** Full-Verify-, Security-, Reader- oder
  unabhängiger Critic-PASS für den gestempelten Commit. Der lokale Readiness-
  Status ist `not-yet-qualified`, ohne technischen Source-Blocker. Ein
  dokumentarischer Übergabe-Nachfolgecommit ändert HEAD; finale Gate-Belege
  müssen deshalb den dann aktuellen Commit/Tree nennen.
- Die [ausführliche 0.7-Übergabe samt Alfred-AC-Abschlussmatrix](../../specs/sprint-alfred-epic/evidence/0.7-local-candidate-handover-2026-09-27.md)
  ist die aktuelle Fortsetzungsreferenz. 25 Alfred-ACs + 4 Incident-Kriterien
  sind vollständig definiert, aber am finalen 0.7-Kandidaten noch **nicht
  einzeln abgenommen**. Der [Abschlussplan](../../specs/sprint-alfred-epic/design/local-candidate-completion-plan.md)
  lässt 21 volle Abnahmezeilen offen. Nova zählt 20 globale und 164 Issue-
  Kriterien in 17 Issues; die [Nova-Issue-Matrix](../../specs/sprint-nova-epic/implementation/issue-acceptance-matrix.md)
  trennt historische Lieferung von gegenwärtiger 0.7-Abnahme. Die
  NVA-A8-Bindung ist stale. Geschlossene Backlog-Items ersetzen keinen AC-
  oder GitHub-Issue-Abnahmebeleg.
- Nächster Einstieg: `pipeline-core:pipeline-start`, diese operative State-
  Notiz und die verlinkte Matrix lesen; nach PO-Installation den echten
  Installed-Host-Stand feststellen. AC-24/E3 bleibt ohne aktuellen A1-
  Runner-Beleg `unavailable`; AC-19 braucht zwei frische Runner-Readbacks;
  AC-25 braucht je Runner echte Host-Beobachtung. Danach finalen Verify,
  Security, Reader, Critic, AC-/Issue-Reconciliation und separate PO-Release-
  Autorität in der im Übergabedokument festgelegten Reihenfolge erledigen.


