# What's new in 0.7.0 (release candidate)

> **Status.** `0.7.0` is a release candidate on a local development branch. It
> is not tagged, not published and not a production-installation
> recommendation. The independent Critic review, the Full Verify of the
> installed candidate and the PO's acceptance have not been completed; this page
> names what changed, not what has been accepted. The release status is in the
> [overview](overview.md#the-next-release-line-070).

`0.7.0` (working name *Alfred*) is the scope that turns the guided adoption of
`0.6.0` into a path a fresh project can walk from an idea to a signed design and
on into implementation, on Claude Code, Codex and Antigravity, with a typed
reason and a repair at every stop. Each of the three runners ran a greenfield
project against the candidate; what those runs found, not a review of the code,
is what this page reports. No run has been accepted as a release proof.

## What you can do now

- **Take a feature from an idea to a signed design.** The agent writes the PRD
  and the Spec with you, an independent read-only reviewer reads them, and you
  sign once. The chapter [From an idea to the implementation phase](usage.md#from-an-idea-to-the-implementation-phase)
  walks the path and says who does each step.
- **One review course with a cap.** One full design review and at most two delta
  rounds. After the third round the findings that are still open go to your
  signature instead of a fourth round.
- **Decisions travel with the design.** An architecture decision you accept with
  the design is recorded as a proposal first and is published by the same one
  design signature; there is no separate approval step for it.
- **An architecture boundary check you can preview.** Before you sign a design
  that changes the architecture rules of existing code, the check reports what it
  would say, without a signature and without writing anything.
- **Restart without losing what you said.** Material input given in the session
  is captured in a bounded resume hint and read back at the start of the next
  session.
- **A quality readback at the close.** The close lists the acceptance criteria
  with their journeys, the risk trace and the scanner results next to the Verify
  result, and asks one acceptance question once the Verify has passed.
- **A browser smoke step.** The Verify id `browser-smoke` is reserved: its
  command runs only behind a preflight for Playwright and Chromium, and without a
  launchable browser it stops with a typed "browser verification pending" and one
  human step.

## What the runs changed

The greenfield runs found blockades that no unit test had; each is fixed in the
candidate and pinned by a test:

- The design approval of a run with a third review round could not be read back
  after signing, because the retained record was bounded at two receipts while the
  review course allows three. The bound is now three, and the refusal names the
  cause.
- A review report whose findings were resolved in the same report no longer
  counts as open, and a review round whose sources were corrected before its
  receipt existed can be bound with `design-review-receipt.mjs create
  --sources-at <commit>`.
- A second `present-plan` of the same design after a commit is refused with the
  reason: the scratch request binds the commit it was presented at, so it is
  stale; delete that one file and run again.
- The refusals that used to say only that something was wrong now say what and
  where: the draft markers still left in the PRD or Spec, the field and the
  rejected value in the architecture block, the unbound ADR proposal and its
  carrier file, the missing output directory of a receipt export, the long
  hyphenated word in a resume-hint field, and what the session id of a resume
  hint is.
- The override planning's git calls share one time budget, so a slow repository
  ends in a typed refusal inside the hook's time limit.

## What remains open

`0.7.0` does not claim:

- publication, a Git tag, marketplace availability or production support;
- that the three greenfield runs substitute for the candidate-bound Full Verify,
  security checks, independent Critic review, your acceptance and the remote
  readback, none of which has been completed for this candidate;
- that every host and platform enforces the same way: runner evidence and
  platform evidence stay separate ([runner support](runner-support.md));
- native macOS support.

The [known issues](known-issues.md) list the limits you can meet on the path
today, each with its repair.

---

## Deutsche Lesefassung (nicht normativ)

`0.7.0` (Arbeitsname *Alfred*) ist ein Release-Kandidat auf einem lokalen
Entwicklungszweig. Er ist weder getaggt noch veröffentlicht und keine Empfehlung
für eine Produktivinstallation. Das unabhängige Critic-Review, der Full Verify
des installierten Kandidaten und die Abnahme durch den PO sind nicht
abgeschlossen; diese Seite nennt, was sich geändert hat, nicht, was abgenommen
ist.

**Was jetzt geht:** Ein frisches Projekt soll auf Claude Code, Codex und
Antigravity von der Idee über ein signiertes Design bis in die Implementierung
geführt werden können; jeder der drei Runner hat ein Greenfield-Projekt gegen
den Kandidaten laufen lassen, keiner dieser Läufe ist als Release-Nachweis
abgenommen. Der Agent schreibt PRD und Spec mit dem PO, ein unabhängiger
lesender Reviewer prüft sie, und der PO signiert einmal. Das Review hat eine
Obergrenze: eine volle Runde und höchstens zwei Delta-Runden; nach der dritten
gehen offene Befunde in die Signatur. Eine Architekturentscheidung, die der PO
mit dem Design annimmt, wird zuerst als Vorschlag erfasst und mit derselben
Design-Signatur veröffentlicht. Die Architekturgrenzprüfung lässt sich vor der
Signatur ansehen, ohne etwas zu schreiben. Material aus der Sitzung bleibt über
einen Neustart in einem begrenzten Resume-Hinweis erhalten. Der Abschluss zeigt
Kriterien, Journeys, Risikospur und Scanner-Ergebnisse neben dem Verify und
stellt die Abnahmefrage einmal. Die Verify-ID `browser-smoke` ist reserviert und
läuft nur hinter dem Playwright-/Chromium-Preflight.

**Was die Läufe geändert haben:** Die Greenfield-Läufe fanden Blockaden, die
kein Unit-Test fand: Die Design-Freigabe eines Laufs mit dritter Review-Runde
ließ sich nach der Signatur nicht mehr lesen (Aufbewahrungsgrenze zwei statt
drei Belege), ein Review-Bericht mit im selben Bericht gelösten Befunden zählte
als offen, und ein zweites `present-plan` nach einem Commit wurde ohne Grund
abgelehnt. Die Ablehnungen nennen jetzt, was und wo, und alle Git-Aufrufe der
Override-Planung teilen sich ein Zeitbudget.

**Offen:** keine Veröffentlichung, kein Tag, keine Marketplace-Verfügbarkeit;
die Greenfield-Läufe ersetzen weder Full Verify noch Critic-Review, Abnahme und
Remote-Readback; Runner- und Plattformnachweise bleiben getrennt; keine native
macOS-Unterstützung.
