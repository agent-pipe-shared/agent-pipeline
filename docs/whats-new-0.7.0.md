# What's new in 0.7.0

> **Status.** `0.7.0` is not released: it is not tagged, not published and not a
> recommendation for production use. Full verification, the independent review
> and the final acceptance are still outstanding; this page names what changed,
> not what has been accepted. See the [overview](overview.md#the-next-release-line-070).

`0.7.0` turns the guided adoption of `0.6.0` into a path a new project can walk
from an idea to a signed design and on into implementation, on Claude Code,
Codex and Antigravity. At every stop the tool names the reason and the repair.

## What you can do now

- **Take a feature from an idea to a signed design.** The agent writes the
  requirements document (PRD) and the spec with you, an independent read-only
  reviewer reads them, and you sign once. The chapter
  [From an idea to the implementation phase](usage.md#from-an-idea-to-the-implementation-phase)
  walks the path and says who does each step.
- **A review with an upper bound.** One full review and at most two follow-up
  rounds. Findings that are still open after the third go to your signature
  instead of a fourth round.
- **Architecture decisions travel with the design.** A decision you accept with
  the design is recorded as a proposal and published by the same signature.
- **An architecture boundary check you can preview.** Before you sign a design
  that changes the architecture rules of existing code, the check shows what it
  would report, without a signature and without writing anything. It also reads
  the local `<script src>` of HTML files that belong to a module.
- **Restart without losing what you said.** Input you gave in the session is
  kept in a short, bounded note and read back at the start of the next session.
- **A quality readback at the close.** The close lists the acceptance criteria
  with their user journeys, the risk trace and the scanner results next to the
  Verify result, and asks one acceptance question once the Verify has passed.
- **A browser smoke step.** The Verify id `browser-smoke` is reserved: its
  command runs only behind a check for Playwright and Chromium. Without a
  launchable browser it stops with a typed "browser verification pending" and
  one human step.
- **Clear refusals.** A refusal now says what is wrong and where: the draft
  markers left in the PRD or Spec, the field and value in the architecture
  block, a missing output directory, or a stale scratch file.
- **`--help` on the close scripts**, and one rule for waiting on a signature:
  the agent waits in a few bounded windows and then tells you what is open.

## What remains open

`0.7.0` does not claim:

- publication, a Git tag, marketplace availability or production support;
- that the end-to-end runs substitute for full verification, security checks,
  independent review, your acceptance and the remote readback, none of which is
  complete;
- that every host and platform enforces the same way: runner evidence and
  platform evidence stay separate ([runner support](runner-support.md));
- native macOS support.

The [known issues](known-issues.md) list the limits you can meet on the path
today, each with its repair.

---

## Deutsche Lesefassung (nicht normativ)

`0.7.0` ist noch nicht veröffentlicht, nicht getaggt und keine Empfehlung für
den Produktivbetrieb. Vollständige Verifikation, unabhängiges Review und die
finale Abnahme stehen aus.

**Was jetzt geht:** Ein neues Projekt wird auf Claude Code, Codex und
Antigravity von der Idee über ein signiertes Design bis in die Implementierung
geführt. Der Agent schreibt PRD und Spec mit dir, ein unabhängiger lesender
Reviewer prüft sie, und du signierst einmal. Das Review hat eine Obergrenze: eine
volle Runde und höchstens zwei Folgerunden; danach gehen offene Befunde in deine
Signatur. Eine Architekturentscheidung, die du mit dem Design annimmst, wird mit
derselben Signatur veröffentlicht. Die Architekturgrenzprüfung lässt sich vor
der Signatur ansehen, ohne etwas zu schreiben, und liest auch lokale
`<script src>` in HTML-Dateien eines Moduls. Material aus der Sitzung bleibt über
einen Neustart in einer kurzen Notiz erhalten. Der Abschluss zeigt Kriterien,
Journeys, Risikospur und Scanner-Ergebnisse neben dem Verify und stellt die
Abnahmefrage einmal. Die Verify-ID `browser-smoke` ist reserviert und läuft nur
hinter dem Playwright-/Chromium-Check. Ablehnungen nennen jetzt, was und wo.

**Offen:** keine Veröffentlichung, kein Tag, keine Marketplace-Verfügbarkeit;
die Läufe ersetzen weder Full Verify noch Review, Abnahme und Remote-Readback;
Runner- und Plattformnachweise bleiben getrennt; keine native macOS-Unterstützung.
