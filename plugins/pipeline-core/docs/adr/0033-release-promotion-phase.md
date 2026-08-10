# ADR-0033: Release/Promotion Phase — Optional, Adapter-Based SDLC Tail Phase

> _A German version follows below · Eine deutsche Fassung folgt weiter unten._

> Agent-Pipeline v0.1.0-draft · SDLC Release/Deploy extension · as of 2026-07-11

**Status:** accepted (2026-07-11, sub-spec `specs/2026-07-11-sdlc-release-deploy/spec_s1-canon.md`, umbrella `specs/2026-07-11-sdlc-release-deploy/spec.md` §2.1/§2.5) · **Basis:** `docs/operating-model.md` §3.1/§3.5, PO decisions (2026-07-11)

## Context

The SDLC flow (`docs/operating-model.md` §3.1) today ends at "merge + docs sync → delivered → feedback loop." No modeled path exists from "merged" to "running in prod": no release phase, no environment promotion (test → prod), no deploy gates, no deploy evidence. Deploy shows up only as a side condition at the merge node ("external effect/live deploy stays consent-gated"). Every project hosted so far solved deploy ad hoc, unguarded, and undocumented — exactly the state the pipeline exists to remove. The PO's framing decision: don't prescribe one standard deploy path; instead, analogous to the design pre-stage, MODEL a phase and let the concrete technique hook in via project-owned adapters.

## Decision

An OPTIONAL tail phase **Release/Promotion**, activated by a `release` section in the project manifest (`.claude/pipeline.yaml`). Flow (detail: `docs/operating-model.md` §3.1/§3.5):

Merge → `deploy:test` (adapter) → test gate (health/smoke evidence, machine-checked) → `promote:prod` (human gate) → `deploy:prod` (build-once-promote, the same artifact) → operate check → evidence + a standardized deploy-log entry.

Deploy is a **project adapter/contract**: the pipeline defines WHAT is guaranteed (evidence before prod, a human gate before prod, a named rollback, a standardized log); the project delivers HOW that happens technically (executor `ci` or `local`).

Three shapes are equal-rank and map onto the SAME nodes: (a) full test→prod; (b) release-without-server-deploy = tag/publish (the OSS shape — `deploy:test` = build/package + pre-check, the test gate = its evidence, `promote:prod` = the publish/tag release, `deploy:prod` = the publish itself, the operate check = post-publish verification); (c) no deploy/no `release` section = the default, zero-cost.

**Build-once-promote:** The artifact identity (tag/immutable reference) travels through the environments; prod never rebuilds. Sign-offs and evidence bind to the ARTIFACT, never to a moving HEAD.

**Prod rollback is modeled and pre-authorized:** The `promote:prod` sign-off EXPLICITLY names both directions ("deploy artifact X to prod; on a red health check, roll back to artifact Y") — which is exactly why an automated rollback to this pre-named target is not a new, uncovered context under the relevant guardrail clarification lines (see the corresponding clarification lines in `guardrails/global.md` / `guardrails/security.md`).

## Consequences

**Positive:** The SDLC story is complete (left: plan → build → verify → review → merge; now right: release → deploy → operate); opt-in means zero cost for projects without environments (no `release` section = unchanged behavior). Introduces the adapter contract (schema/loader: a follow-up slice of the release/deploy extension), the evidence + deploy-log requirement, and the guard extension (each a follow-up slice).

**Negative:** The local executor class (`executor: local`, e.g. an on-prem box) ships in v1 specified-but-untested — an honest gap, no v1 worked example exercises it (`docs/deploy/README.md` flags this).

## Rejected alternatives

- **Deploy stays outside the pipeline** (external CI/CD, merge is the end) — rejected: leaves exactly the blind spot this extension exists to close.
- **A hardwired standard deploy path** (e.g. one cloud provider baked in) — rejected: breaks the deliberate multi-scenario flexibility across hosted-project variety.
- **Just a bigger "external-effect gate" button at merge, no phase model** — rejected: delivers no test→prod promotion, no operate model — only a bigger consent button.

## Status / follow-up

First live probe of an adapter — neither v1 worked example exercises the `local` executor class; revisit once a real local deploy target is on the table.

<!-- DE-REFERENCE-BELOW | agents: skip everything below this line; it is a full German reference translation (redundant, wastes context). The authoritative content is the English above. Convention: CLAUDE.md (Language). -->

# ADR-0033: Release/Promotion-Phase — optionale, adapter-basierte SDLC-Tail-Phase

> Agent-Pipeline v0.1.0-draft · SDLC-Release/Deploy-Erweiterung · Stand 2026-07-11

**Status:** akzeptiert (2026-07-11, Sub-Spec `specs/2026-07-11-sdlc-release-deploy/spec_s1-canon.md`, Umbrella `specs/2026-07-11-sdlc-release-deploy/spec.md` §2.1/§2.5) · **Grundlage:** `docs/operating-model.md` §3.1/§3.5, PO-Entscheidungen (2026-07-11)

## Kontext

Der SDLC-Fluss (`docs/operating-model.md` §3.1) endet heute bei „Merge + Doku-Sync → Erledigt → Feedback-Loop". Es existiert kein modellierter Pfad von „gemerged" zu „läuft in Prod": keine Release-Phase, keine Umgebungs-Promotion (test → prod), keine Deploy-Gates, keine Deploy-Evidenz. Deploy taucht nur als Nebenbedingung am Merge-Knoten auf („Außenwirkung/Live-Deploy bleibt zustimmungspflichtig"). Jedes bisher gehostete Projekt löst Deploy ad hoc, unguardet und undokumentiert — genau der Zustand, den die Pipeline abschaffen soll. Die Rahmen-Entscheidung des PO: keinen Standard-Deploy-Pfad vorschreiben, sondern analog zur Design-Vorstufe eine Phase MODELLIEREN und die konkrete Technik über projekteigene Adapter einhängen.

## Entscheidung

Eine OPTIONALE Tail-Phase **Release/Promotion**, aktiviert durch eine `release`-Sektion im Projekt-Manifest (`.claude/pipeline.yaml`). Fluss (Detail: `docs/operating-model.md` §3.1/§3.5):

Merge → `deploy:test` (Adapter) → Test-Gate (Health-/Smoke-Evidenz, maschinell) → `promote:prod` (Human-Gate) → `deploy:prod` (build-once-promote, dasselbe Artefakt) → Operate-Check → Evidenz + standardisierter Deploy-Log-Eintrag.

Deploy ist ein **Projekt-Adapter/Vertrag**: die Pipeline definiert, WAS garantiert wird (Evidenz vor Prod, Human-Gate vor Prod, benannter Rollback, standardisierter Log), das Projekt liefert, WIE es technisch geschieht (Executor `ci` oder `local`).

Drei Ausprägungen sind gleichrangig und bilden auf DIESELBEN Knoten ab: (a) volles test→prod; (b) Release-ohne-Server-Deploy = Tag/Publish (die OSS-Ausprägung — `deploy:test` = Build/Package + Vorab-Verifikation, Test-Gate = deren Evidenz, `promote:prod` = die Publish-/Tag-Freigabe, `deploy:prod` = das Publish selbst, Operate-Check = Post-Publish-Verifikation); (c) kein Deploy/kein `release`-Abschnitt = Default, kostenlos.

**Build-once-promote:** Die Artefakt-Identität (Tag/unveränderliche Referenz) wandert durch die Umgebungen; Prod baut nie neu. Freigaben und Evidenz binden sich an das ARTEFAKT, nie an einen wandernden HEAD.

**Prod-Rollback ist modelliert und vorab autorisiert:** Die `promote:prod`-Freigabe nennt EXPLIZIT beide Richtungen („Deploy Artefakt X nach Prod; bei rotem Health-Check Rollback auf Artefakt Y") — genau deshalb ist ein automatisierter Rollback auf dieses vorab genannte Ziel kein neuer, ungedeckter Kontext unter den entsprechenden Klarstellungs-Zeilen (siehe dazu `guardrails/global.md` / `guardrails/security.md`).

## Konsequenzen

**Positiv:** Die SDLC-Geschichte ist komplett (links Plan→Build→Verify→Review→Merge, jetzt rechts Release→Deploy→Operate); Opt-in heißt Null-Kosten für Projekte ohne Umgebungen (kein `release`-Abschnitt = unverändertes Verhalten). Führt den Adapter-Vertrag ein (Schema/Loader: Folge-Slice der Release/Deploy-Erweiterung), die Evidenz- + Deploy-Log-Pflicht sowie die Guard-Erweiterung (jeweils Folge-Slices).

**Negativ:** Die lokale Executor-Klasse (`executor: local`, z. B. eine On-Prem-Box) läuft in v1 spezifiziert-aber-ungetestet — ehrliche Lücke, kein v1-Worked-Example übt sie aus (`docs/deploy/README.md` flaggt das).

## Verworfene Alternativen

- **Deploy bleibt außerhalb der Pipeline** (fremdes CI/CD, Merge ist das Ende) — verworfen: lässt genau den blinden Fleck offen, den diese Erweiterung schließen soll.
- **Ein fest verdrahteter Standard-Deploy-Pfad** (z. B. ein Cloud-Anbieter hart codiert) — verworfen: bricht die bewusste Mehr-Szenario-Flexibilität über die Vielfalt gehosteter Projekte hinweg.
- **Nur ein größerer „Außenwirkungs-Gate"-Knopf am Merge, kein Phasenmodell** — verworfen: liefert keine test→prod-Promotion, kein Operate-Modell — nur einen größeren Zustimmungs-Knopf.

## Wiedervorlage

Erste Live-Probe eines Adapters — keines der beiden v1-Worked-Examples übt die `local`-Executor-Klasse aus; das nachholen, sobald ein reales lokales Deploy-Ziel ansteht.
