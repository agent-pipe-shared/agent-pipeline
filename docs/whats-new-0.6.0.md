# What's new in 0.6.0 (candidate)

`0.6.0` is the current local candidate. It is versioned in the source and
plugin manifests, but it is not a published release or an installation
recommendation yet.

## The Nova outcome: a usable Greenfield path

The public onboarding Driver is now the user-facing sequence owner. Starting
with an empty directory, it repeatedly inspects durable state, runs only its
own published safe steps, and stops only for a real human decision. When it
needs input, it returns one structured action. The runner uses that action as
given and replaces only its explicitly declared placeholders; it does not guess
or rebuild internal CLI sequences.

The tested path is:

1. choose installation and give the bundled initial project/author settings;
2. use an existing first trust-anchor key or create a new one;
3. provide the project description and design answers;
4. review and approve the plan;
5. give the real project verify command; and
6. receive `ready`, then create and verify the first implementation file.

The automated end-to-end test executes that contract for Claude, Codex, and
Antigravity. It deliberately follows returned actions only, so it checks that a
fresh runner can discover the next step rather than merely proving that an
expert can call the underlying scripts in the right order.

## The Phoenix outcome: keep the safety claim narrow and real

The candidate retains the fail-closed evidence model. Missing, stale,
malformed, skipped, or candidate-mismatched evidence is a typed non-success;
it is not converted into a green result to make a flow smoother. Human
approvals remain explicit and bound to their intended decision. The smoother
Driver path therefore removes sequencing friction without treating a guard,
signature, or release boundary as optional.

## What 0.6.0 does not claim yet

- It is not released, published, or recommended for production installation.
- Automated three-runner coverage is not a substitute for the three independent
  live Greenfield acceptances. Those remain release acceptance evidence.
- Any source change invalidates release evidence for an earlier candidate; the
  final candidate needs its own complete, candidate-bound Verify, security,
  review, and release evidence.
- A runner's route does not prove native sandbox isolation, model identity, or
  unmeasured platform support. Those claims require their own runner-specific
  evidence.

For the day-to-day entry path, see [Usage](usage.md). For the normative
contract, see the [Operating Model](operating-model.md). The detailed release
notes, migration guidance, and issue-by-issue record remain separate work; this
page is intentionally the high-level candidate boundary.

---

## Deutsche Lesefassung (nicht normativ)

`0.6.0` ist der aktuelle lokale Kandidat: Source und Plugin-Manifeste sind so
versioniert, aber es ist noch kein veröffentlichtes Release und keine
Installationsempfehlung. Nova liefert einen nutzbaren Greenfield-Weg. Der
öffentliche Onboarding-Driver führt aus einem leeren Verzeichnis über seine
eigenen veröffentlichten Schritte und hält nur bei echten menschlichen
Entscheidungen an. Bei Eingaben gibt er eine strukturierte Aktion zurück; der
Runner ersetzt nur deren explizite Platzhalter und errät keine internen
CLI-Sequenzen.

Der automatisierte Ende-zu-Ende-Test führt diesen Vertrag für Claude, Codex und
Antigravity aus: Installation und erste Projektdaten, vorhandener oder neuer
Trust Anchor, Intake/Design, Planfreigabe, echtes Verify-Kommando und die erste
geprüfte Implementierungsdatei. Phoenix hält die Sicherheitsgrenze eng: fehlende,
veraltete, fehlerhafte, übersprungene oder nicht zum Kandidaten passende Evidenz
bleibt ein typisierter Nicht-Erfolg. Dieser leichtere Ablauf lockert weder
Guardrails noch Signaturen oder Release-Gates.

Noch offen für eine Veröffentlichung sind die unabhängige Live-Greenfield-
Abnahme aller drei Runner und die vollständige kandidatengebundene Release-
Evidenz. Automatisierte Abdeckung ersetzt diese Abnahme nicht; eine Änderung am
Source entwertet Evidenz eines früheren Kandidaten. Native Sandbox,
Modellidentität und nicht gemessene Plattformunterstützung werden nicht allein
aus einem Runner-Weg behauptet.
