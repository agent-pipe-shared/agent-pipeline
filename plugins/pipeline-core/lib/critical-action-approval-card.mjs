// SPDX-License-Identifier: SUL-1.0
/**
 * C30I-S5 (AC-112, queue C30-20): the plain-language card that opens the attended signature confirmation of
 * `po-human-approval.mjs authorize-critical`, above the unchanged evidence lines and hashes. C30J-J12 adds the same card for the two
 * ceremonies that go through `sign-intent` (the guard-override signature digest and the design approval) as `signingCeremonyCard`.
 *
 * Pure and read-only: it is built ONLY from values the request already holds (the kind, the candidate commit and tree, the expiry, the
 * feature id and the subject preimage when `--subject` or a kind builder supplied one). It reads nothing, runs no git command and changes no
 * bound field: the request, the approval intent, its digest, the subject preimage and the proof are not its business.
 *
 * A fact the request does not hold is left out of the card, never guessed: every preimage field is rendered only when it is a single-line
 * string (or a list of them), and a sentence that needs a missing fact is dropped or says that the confirmation does not show it.
 *
 * Localization follows the existing frame mechanism of the confirmation (`humanFacingLanguage`, `en` or `de`; anything else is English);
 * names, paths, ids and hashes are data and are never translated.
 */

/** The fixed line that ends the card, so a reader (and a test) can tell the card from the evidence lines that follow it. */
export const CARD_END_LINE = "-----";

const LABELS = Object.freeze({
  en: ["WHAT YOU ARE SIGNING:", "WHY YOU ARE ASKED NOW:", "WHAT THIS ALLOWS, AND UNTIL WHEN:", "WHAT THIS DOES NOT ALLOW:", "IF YOU DECLINE:", "HOW TO READ THE LINES BELOW:"],
  de: ["WAS SIE UNTERSCHREIBEN:", "WARUM JETZT GEFRAGT WIRD:", "WAS DAS ERLAUBT, UND BIS WANN:", "WAS DAS NICHT ERLAUBT:", "WENN SIE ABLEHNEN:", "SO LESEN SIE DIE ZEILEN DARUNTER:"],
});

const MONTHS = Object.freeze({
  en: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
  de: ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"],
});

const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
/** A string that is safe to put in one card line: non-empty, bounded, no control character. */
const line = (value) => (typeof value === "string" && value.length > 0 && value.length <= 300 && !/[\u0000-\u001f\u007f]/u.test(value) ? value : null);
const short = (oid) => (typeof oid === "string" ? oid.slice(0, 12) : "");
const list = (value) => (Array.isArray(value) ? value : []);
const plural = (count, one, many) => (count === 1 ? one : many);

/** The stored ISO time next to a fixed-format UTC rendering in the human's language; identical on every machine. */
function expiryText(language, iso) {
  const parsed = Date.parse(iso);
  const stored = line(iso) ?? "unknown";
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== iso) return stored;
  const at = new Date(parsed);
  const clock = `${String(at.getUTCHours()).padStart(2, "0")}:${String(at.getUTCMinutes()).padStart(2, "0")}`;
  const month = MONTHS[language][at.getUTCMonth()];
  return language === "de"
    ? `${at.getUTCDate()}. ${month} ${at.getUTCFullYear()}, ${clock} Uhr UTC (gespeichert als ${stored})`
    : `${at.getUTCDate()} ${month} ${at.getUTCFullYear()}, ${clock} UTC (stored as ${stored})`;
}

/** "id1 (minor), id2 (minor) and 4 more" -- bounded, so a long list never floods the card. */
function boundedList(language, entries, limit = 10) {
  const shown = entries.slice(0, limit).join(", ");
  const rest = entries.length - limit;
  return rest > 0 ? `${shown} ${language === "de" ? "und" : "and"} ${rest} ${language === "de" ? "weitere" : "more"}` : shown;
}

// Each kind: (facts, language) -> { what, why, allows, limits, closed }. `facts` is { commit, tree, feature, subject } with `subject` the preimage or null.
// Sentences are chosen with `de ? ... : ...` so the English and German of one idea sit next to each other.
const SPECS = Object.freeze({
  push: (f, de) => {
    const remote = line(f.subject?.remote); const destination = line(f.subject?.destination);
    const target = [remote === null ? null : (de ? `an das Remote "${remote}"` : `to remote "${remote}"`), destination === null ? null : (de ? `auf den Ziel-Ref "${destination}"` : `to destination ref "${destination}"`)].filter(Boolean).join(", ");
    const hidden = remote === null || destination === null
      ? (de ? " Diese Bestätigung zeigt das Remote oder den Ziel-Ref nicht an; sie sind nur im Subject-Digest unten gebunden." : " This confirmation does not show the remote or the destination ref; they are only bound inside the subject digest below.")
      : "";
    return {
      what: de ? `Ein Push des Commits ${short(f.commit)} (Feature ${f.feature})${target === "" ? "" : ` ${target}`}.${hidden}` : `A push of commit ${short(f.commit)} (feature ${f.feature})${target === "" ? "" : ` ${target}`}.${hidden}`,
      why: de ? "Das Push-Gate (GIT-05, ADR-0061) lässt einen Push nur mit einer Freigabe zu, die genau für diesen Commit signiert wurde." : "The push gate (GIT-05, ADR-0061) admits a push only with an approval signed for exactly this commit.",
      allows: de ? "Der Agent darf genau diesen Commit pushen; der Push-Guard prüft die signierte Freigabe gegen Commit, Remote und Ziel-Ref." : "The agent may push exactly this commit; the push guard checks the signed approval against the commit, the remote and the destination ref.",
      limits: de ? "Ein anderer Commit, ein anderes Remote oder ein anderer Ziel-Ref ist nicht abgedeckt." : "A push of any other commit, to any other remote or destination ref, is not covered.",
      closed: de ? "der Push bleibt ohne Freigabe" : "the push stays without approval",
    };
  },
  deploy: (f, de) => ({
    what: de ? `Ein Deploy des Commits ${short(f.commit)} (Feature ${f.feature}).` : `A deploy of commit ${short(f.commit)} (feature ${f.feature}).`,
    why: de ? "Ein Deploy kann eine Wirkung nach außen auslösen; solche Aktionen brauchen eine signierte Freigabe des genauen Commits (ADR-0061)." : "A deploy can create an external effect; such an action needs a signed approval of the exact commit (ADR-0061).",
    allows: de ? "Der Agent darf genau diesen Commit deployen, so wie der Subject-Digest unten ihn bindet." : "The agent may deploy exactly this commit, as the subject digest below binds it.",
    limits: de ? "Ein anderer Commit, ein anderes Ziel oder eine andere Art von Aktion ist nicht abgedeckt." : "Any other commit, target or kind of action is not covered.",
    closed: de ? "der Deploy bleibt ohne Freigabe" : "the deploy stays without approval",
  }),
  publication: (f, de) => ({
    what: de ? `Eine Veröffentlichung des Commits ${short(f.commit)} (Feature ${f.feature}).` : `A publication of commit ${short(f.commit)} (feature ${f.feature}).`,
    why: de ? "Eine Veröffentlichung kann eine Wirkung nach außen auslösen; solche Aktionen brauchen eine signierte Freigabe des genauen Commits (ADR-0061, ADR-0075)." : "A publication can create an external effect; such an action needs a signed approval of the exact commit (ADR-0061, ADR-0075).",
    allows: de ? "Der Agent darf genau diesen Commit veröffentlichen, so wie der Subject-Digest unten ihn bindet." : "The agent may publish exactly this commit, as the subject digest below binds it.",
    limits: de ? "Ein anderer Commit, ein anderes Ziel oder eine andere Art von Aktion ist nicht abgedeckt." : "Any other commit, target or kind of action is not covered.",
    closed: de ? "die Veröffentlichung bleibt ohne Freigabe" : "the publication stays without approval",
  }),
  "feature-package-reconcile": (f, de) => ({
    what: de ? `Der Abgleich (Reconcile) des freigegebenen Pakets von Feature ${f.feature} auf den Commit ${short(f.commit)}.` : `The reconcile of the approved package of feature ${f.feature} at commit ${short(f.commit)}.`,
    why: de ? "Der Paket-Abgleich ist ein Gate mit menschlicher Signatur (ADR-0056, Nachtrag vom 2026-08-11)." : "The package reconcile is a human-signed gate (ADR-0056, follow-up of 2026-08-11).",
    allows: de ? "Der Agent darf genau diesen Abgleich für diesen Commit und dieses Subject festhalten." : "The agent may record exactly this reconcile for this commit and subject.",
    limits: de ? "Ein anderer Commit, ein anderes Subject oder eine andere Art von Aktion ist nicht abgedeckt." : "Any other commit, subject or kind of action is not covered.",
    closed: de ? "der Abgleich bleibt ohne Freigabe" : "the reconcile stays without approval",
  }),
  "release-preflight": (f, de) => {
    const version = line(f.subject?.version); const lifecycle = line(f.subject?.lifecycle?.featureId);
    return {
      what: de
        ? `Ihre Zustimmung, dass ein Release-Versuch${version === null ? "" : ` für Version ${version}`}${lifecycle === null ? "" : ` (Lifecycle-Feature ${lifecycle})`} aus dem Commit ${short(f.commit)} vorbereitet werden darf.`
        : `Your consent that a release attempt${version === null ? "" : ` for version ${version}`}${lifecycle === null ? "" : ` (lifecycle feature ${lifecycle})`} may be prepared from commit ${short(f.commit)}.`,
      why: de ? "Das Release-Gate fragt nach Ihrer Zustimmung, bevor ein Release-Versuch vorbereitet und zu den unabhängig betriebenen Abschluss-Gates geführt wird (ADR-0064)." : "The release gate asks for your consent before a release attempt is prepared and taken to the independently operated final gates (ADR-0064).",
      allows: de ? "Der Agent darf den Release-Versuch für genau dieses Subject vorbereiten und zu den Abschluss-Gates führen." : "The agent may prepare the release attempt for exactly this subject and take it to the final gates.",
      limits: de ? "Es gibt nichts frei und veröffentlicht nichts und besteht kein Abschluss-Gate." : "It releases and publishes nothing and passes no final gate.",
      closed: de ? "der Release-Versuch bleibt ohne Zustimmung" : "the release attempt stays without consent",
    };
  },
  "interruption-promotion": (f, de) => {
    const baseline = line(f.subject?.baselineSha256); const start = line(f.subject?.window?.start?.value); const end = line(f.subject?.window?.end?.value);
    const measured = start !== null && end !== null ? (de ? `, gemessen von ${start} bis ${end}` : `, measured from ${start} to ${end}`) : "";
    return {
      what: de ? `Die Übernahme einer gemessenen Unterbrechungs-Baseline${baseline === null ? "" : ` (sha256 ${short(baseline)})`}${measured} als aktuelle Baseline, am Commit ${short(f.commit)}.` : `The promotion of a measured interruption baseline${baseline === null ? "" : ` (sha256 ${short(baseline)})`}${measured} as the current baseline, at commit ${short(f.commit)}.`,
      why: de ? "Erst Ihre Signatur macht eine gemessene Baseline zur aktuellen (AC-6, N12)." : "Only your signature turns a measured baseline into the current one (AC-6, N12).",
      allows: de ? "Der Agent darf genau diese Baseline übernehmen; ihre Bytes sind gebunden." : "The agent may promote exactly this baseline; its bytes are bound.",
      limits: de ? "Eine geänderte Baseline macht diese Freigabe ungültig." : "A changed baseline invalidates this approval.",
      closed: de ? "die Baseline wird nicht übernommen" : "the baseline is not promoted",
    };
  },
  "accept-residual-critic-findings": (f, de) => {
    const findings = list(f.subject?.findings).map((entry) => (isObject(entry) && line(entry.id) !== null && line(entry.severity) !== null ? `${entry.id} (${entry.severity})` : null)).filter(Boolean);
    const named = findings.length === 0 ? "" : (de ? ` ${findings.length} offene Critic-${plural(findings.length, "Feststellung", "Feststellungen")}: ${boundedList("de", findings)}` : ` ${findings.length} open Critic ${plural(findings.length, "finding", "findings")}: ${boundedList("en", findings)}`);
    return {
      what: de ? `Die Annahme als Rest (residual) für den Commit ${short(f.commit)}:${named === "" ? " der offenen Critic-Feststellungen dieses Pakets." : named}.` : `Accepting as residual for commit ${short(f.commit)}:${named === "" ? " the open Critic findings of this packet." : named}.`,
      why: de ? "Ein Kandidat mit offenen Critic-Feststellungen braucht Ihre Signatur, um die genannten als Rest zu tragen (D190)." : "A candidate with open Critic findings needs your signature to carry the listed ones as residual (D190).",
      allows: de ? "Der Agent darf genau diese Feststellungen für diesen Commit als akzeptierten Rest festhalten." : "The agent may record exactly these findings as accepted residual for this commit.",
      limits: de ? "Keine nicht genannte Feststellung wird akzeptiert, ein Blocker wird nie akzeptiert, eine neue Feststellung blockiert wieder; das ist kein Critic-Bestanden." : "No finding that is not listed is accepted, a blocker is never accepted, and a new finding blocks again; this is not a Critic pass.",
      closed: de ? "die Feststellungen bleiben offen" : "the findings stay open",
    };
  },
  "acknowledge-caller-authored-critic": (f, de) => {
    const packet = line(f.subject?.packetId);
    return {
      what: de ? `Die Kenntnisnahme, dass das Critic-Urteil${packet === null ? "" : ` des Pakets ${packet}`} vom aufrufenden Agenten geliefert wurde und nicht vom eigenen Stopp eines Critic-Subagenten (Commit ${short(f.commit)}).` : `Acknowledging that the Critic verdict${packet === null ? "" : ` of packet ${packet}`} was supplied by the calling agent, not by a Critic subagent's own stop (commit ${short(f.commit)}).`,
      why: de ? "Ein Urteil, das der aufrufende Agent selbst geliefert hat, wird so gekennzeichnet und braucht Ihre Kenntnisnahme (C21B)." : "A verdict the calling agent supplied itself is labelled as such and needs your acknowledgement (C21B).",
      allows: de ? "Der Agent darf die Kenntnisnahme für dieses Paket festhalten; der Abschluss behält die Kennzeichnung." : "The agent may record the acknowledgement for this packet; the close record keeps the label.",
      limits: de ? "Es macht das Urteil nicht unabhängig und prüft die Arbeit nicht." : "It does not make the verdict independent and does not review the work.",
      closed: de ? "das Urteil bleibt ohne Kenntnisnahme" : "the verdict stays unacknowledged",
    };
  },
  "spec-addendum": (f, de) => {
    const addendum = line(f.subject?.addendumPath); const spec = line(f.subject?.specPath);
    const count = list(f.subject?.findingIds).filter((id) => line(id) !== null).length;
    return {
      what: de
        ? `Die Annahme${addendum === null ? " eines Spec-Nachtrags" : ` des Spec-Nachtrags ${addendum}`} als Korrektur der freigegebenen Spec${spec === null ? "" : ` ${spec}`}, die unverändert bleibt${count === 0 ? "" : `; ${count} ${plural(count, "Feststellung", "Feststellungen")} betroffen`}.`
        : `Accepting${addendum === null ? " a Spec addendum" : ` the Spec addendum ${addendum}`} as a correction of the approved Spec${spec === null ? "" : ` ${spec}`}, which stays unchanged${count === 0 ? "" : `; ${count} ${plural(count, "finding", "findings")} concerned`}.`,
      why: de ? "Eine Korrektur der freigegebenen Spec während der Umsetzung ist ein signierter Nachtrag (ADR-0095)." : "A correction of the approved Spec during implementation is a signed addendum (ADR-0095).",
      allows: de ? "Der Agent darf genau diesen Nachtrag als freigegeben festhalten; die nächste Critic-Runde prüft die Korrektur." : "The agent may record exactly this addendum as approved; the next Critic round reviews the correction.",
      limits: de ? "Nur dieser Nachtrag und nur innerhalb der bestehenden Kriterien; die Design-Freigabe wird nicht neu geöffnet." : "Only this addendum and only inside the existing criteria; the design approval is not reopened.",
      closed: de ? "die Spec bleibt unkorrigiert" : "the Spec stays uncorrected",
    };
  },
  "acknowledge-gate-definition-changes": (f, de) => {
    const changes = list(f.subject?.changes).filter((entry) => isObject(entry) && line(entry.path) !== null && line(entry.commit) !== null);
    const files = new Set(changes.map((entry) => entry.path)).size; const commits = new Set(changes.map((entry) => entry.commit)).size;
    const feature = line(f.subject?.featureId) ?? f.feature;
    return {
      what: changes.length === 0
        ? (de ? `Die Kenntnisnahme von Änderungen der Gate-Definition ohne Nachweis im Bereich von Feature ${feature}.` : `Acknowledging gate-definition changes without a proof in the range of feature ${feature}.`)
        : (de ? `Die Kenntnisnahme von ${changes.length} ${plural(changes.length, "Änderung", "Änderungen")} der Gate-Definition ohne Nachweis in ${files} ${plural(files, "Datei", "Dateien")} aus ${commits} ${plural(commits, "Commit", "Commits")} von Feature ${feature}.`
          : `Acknowledging ${changes.length} gate-definition ${plural(changes.length, "change", "changes")} without a proof in ${files} ${plural(files, "file", "files")} across ${commits} ${plural(commits, "commit", "commits")} of feature ${feature}.`),
      why: de ? "Eine Änderung, wie stark ein Gate ist, braucht einen gebundenen Nachweis; wo keiner existiert, fragt der Abschluss nach Ihrer Kenntnisnahme (ADR-0096)." : "A change of how strong a gate is needs a bound proof; where none exists, the close asks for your acknowledgement (ADR-0096).",
      allows: de ? "Der Agent darf genau diese Änderungen nachträglich als zur Kenntnis genommen festhalten, damit der Abschluss weitergehen kann." : "The agent may record exactly these changes as acknowledged after the fact, so that the close can go on.",
      limits: de ? "Es beurteilt nicht, ob eine Änderung vertretbar ist, und eine spätere Änderung braucht eine neue Kenntnisnahme." : "It does not judge whether any change is sound, and a later change needs a new acknowledgement.",
      closed: de ? "der Abschluss bleibt an diesen Änderungen stehen" : "the close stays held at these changes",
    };
  },
  "acknowledge-maintenance-red-check": (f, de) => {
    const count = list(f.subject?.checks).length; const feature = line(f.subject?.featureId) ?? f.feature;
    return {
      what: count === 0
        ? (de ? `Die Kenntnisnahme, dass Prüfungen ohne Spec-Kriterium schon vor Feature ${feature} rot waren.` : `Acknowledging that checks without a Spec criterion were already red before feature ${feature}.`)
        : (de ? `Die Kenntnisnahme, dass ${count} ${plural(count, "Prüfung", "Prüfungen")} ohne Spec-Kriterium schon vor Feature ${feature} rot ${plural(count, "war", "waren")}.` : `Acknowledging that ${count} ${plural(count, "check", "checks")} without a Spec criterion ${plural(count, "was", "were")} already red before feature ${feature}.`),
      why: de ? "Eine Prüfung, die schon vor dem Feature rot war, darf eine Wartungs-Dispatch erst nach Ihrer Kenntnisnahme reparieren (ADR-0097)." : "A check that was red before the feature may be repaired by a maintenance dispatch only after your acknowledgement (ADR-0097).",
      allows: de ? "Eine Wartungs-Dispatch darf sie danach nur in Test- oder Werkzeugpfaden reparieren, für den Rest dieses Features unter dieser Plan-Freigabe." : "A maintenance dispatch may then repair them in test or tooling paths only, for the rest of this feature under this plan approval.",
      limits: de ? "Der Critic prüft die Reparatur weiterhin, und jede Reparatur muss die Prüfung grün machen; eine rote Prüfung wird damit nicht für in Ordnung erklärt." : "The Critic still reviews the fix and every repair still has to turn the check green; a red check is not declared fine.",
      closed: de ? "die Prüfungen bleiben ohne Kenntnisnahme" : "the checks stay unacknowledged",
    };
  },
  "replace-verify-command": (f, de) => {
    const command = line(f.subject?.verifyCommand); const files = list(f.subject?.entries).filter((entry) => isObject(entry) && line(entry.path) !== null).length;
    return {
      what: command === null
        ? (de ? "Der Austausch des konfigurierten Verify-Befehls." : "The replacement of the configured verify command.")
        : (de ? `Der Austausch des konfigurierten Verify-Befehls durch "${command}"${files === 0 ? "" : ` in ${files} ${plural(files, "Kalibrierungsdatei", "Kalibrierungsdateien")}`}.` : `The replacement of the configured verify command with "${command}"${files === 0 ? "" : ` in ${files} calibration ${plural(files, "file", "files")}`}.`),
      why: de ? "Den Befehl zu ändern, der entscheidet, ob ein Feature grün ist, braucht eine Signatur (ADR-0100)." : "Changing the command that decides whether a feature is green needs one signature (ADR-0100).",
      allows: de ? "Der configure-verify-Weg darf genau die unten aufgeführten Dateien mit genau den signierten Bytes schreiben." : "The configure-verify route may write exactly the files listed below with exactly the signed bytes.",
      limits: de ? "Sonst wird nichts geschrieben; ein anderer Befehl oder andere Bytes brauchen eine neue Signatur." : "Nothing else is written; a different command or different bytes need a new signature.",
      closed: de ? "der Verify-Befehl bleibt wie er ist" : "the verify command stays as it is",
    };
  },
});

/** The kinds `authorize-critical` accepts; each has a card. A test pins this list to the command's own kind list. */
export const CARD_KINDS = Object.freeze(Object.keys(SPECS));

// C30J-J12 (queue C30-20 gap): the two ceremonies that go through `sign-intent` instead of `authorize-critical`. They have their own table so the
// twelve kinds above stay exactly as they were. Each entry is (facts, de) -> { what, why, allows, limits, closed }, and `facts` holds only what the
// request already carries: a fact that is absent or malformed is left out, never guessed. A count must be a positive safe integer to be stated.
const count = (value) => (Number.isSafeInteger(value) && value > 0 ? value : null);

const CEREMONY_SPECS = Object.freeze({
  // The signature digest of a guard override: facts { toolName, commandClass, expiresAt, pathCount } from the structured plan the request resolves to.
  "guard-override": (f, de, language) => {
    const tool = line(f.toolName); const klass = line(f.commandClass); const paths = count(f.pathCount); const expiry = line(f.expiresAt);
    const call = [tool === null ? null : (de ? `Werkzeug "${tool}"` : `tool "${tool}"`), klass === null ? null : (de ? `Befehlsklasse "${klass}"` : `command class "${klass}"`)].filter(Boolean).join(", ");
    const until = expiry === null
      ? (de ? "Diese Bestätigung zeigt den Ablauf nicht an." : "This confirmation does not show the expiry.")
      : (de ? `Das gilt bis ${expiryText(language, expiry)}; danach ist eine neue Anfrage mit neuer Signatur nötig.` : `This holds until ${expiryText(language, expiry)}; after that a new request and a new signature are needed.`);
    return {
      what: de
        ? `Ihre Signatur unter eine Freigabe, mit der der Agent genau einen von einem Guard abgelehnten Werkzeugaufruf${call === "" ? "" : ` (${call})`} wiederholen darf${paths === null ? "" : `; ${paths} ${plural(paths, "zulässiger Pfad", "zulässige Pfade")} stehen unten`}.`
        : `Your signature on an authorization that lets the agent retry exactly one tool call that a guard denied${call === "" ? "" : ` (${call})`}${paths === null ? "" : `; ${paths} eligible ${plural(paths, "path is", "paths are")} listed below`}.`,
      why: de ? "Eine Ablehnung durch einen Guard lässt sich nur mit Ihrer Signatur unter genau diese Anfrage aufheben (ADR-0059, ADR-0061)." : "A guard denial can be lifted only by your signature on exactly this request (ADR-0059, ADR-0061).",
      allows: de
        ? `Danach darf der Agent authorize-by-signature ausführen; das schaltet die Freigabe für eine einzige Verwendung genau dieses Aufrufs in identischen Bytes scharf, und die erste Verwendung verbraucht sie. ${until}`
        : `After you sign, the agent may run authorize-by-signature, which arms the override for one use of that byte-identical call; the first use consumes it. ${until}`,
      limits: de ? "Ein anderer Werkzeugaufruf, eine andere Befehlsklasse, eine zweite Verwendung oder ein Aufruf nach dem Ablauf ist nicht abgedeckt; es ist keine Push-, Release- oder Design-Freigabe." : "A different tool call, another command class, a second use or a call after the expiry is not covered; it is not a push, release or design approval.",
      closed: de ? "die Ablehnung des Guards und der blockierte Aufruf bleiben bestehen" : "the guard denial and the blocked call stay as they are",
      reading: de
        ? "Die Zeilen oben sind die Bedeutung. Die Zeilen darunter sind der Beleg, an den die Signatur gebunden ist: der Intent-Digest, den Ihr Schlüssel signiert, die aufgezeichnete Anfrage, die zulässigen Pfade, die Begründung des ablehnenden Guards und der signierte Ablauf sowie Pfad und Digest des vollständigen Prüfmaterials."
        : "The lines above are the meaning. The lines below are the evidence this signature is bound to: the intent digest your key signs, the recorded request, the eligible paths, the denying guard's rationale and the signed expiry, and the path and digest of the full review material.",
    };
  },
  // The design approval: facts { featureId, prdPath, specPath, companionCount, receiptCount, verdict, openFindingCount, candidateCommit } from its binding.
  "design-approval": (f, de) => {
    const feature = line(f.featureId); const prd = line(f.prdPath); const spec = line(f.specPath); const commit = line(f.candidateCommit);
    const companions = count(f.companionCount); const receipts = count(f.receiptCount); const open = f.verdict === "open-findings" ? count(f.openFindingCount) : null;
    const package_ = [prd === null ? null : `PRD ${prd}`, spec === null ? null : `Spec ${spec}`].filter(Boolean).join(de ? " und " : " and ");
    const extras = [
      companions === null ? null : (de ? `${companions} ${plural(companions, "Begleitdatei", "Begleitdateien")}` : `${companions} ${plural(companions, "companion file", "companion files")}`),
      receipts === null ? null : (de ? `${receipts} ${plural(receipts, "Bereitschafts-Prüfrunde", "Bereitschafts-Prüfrunden")}` : `${receipts} readiness ${plural(receipts, "review round", "review rounds")}`),
      commit === null ? null : (de ? `Commit ${short(commit)}` : `commit ${short(commit)}`),
    ].filter(Boolean).join(", ");
    return {
      what: de
        ? `Ihre Freigabe des geprüften Designs${feature === null ? "" : ` von Feature ${feature}`}${package_ === "" ? "" : `: ${package_}`}${extras === "" ? "" : ` (${extras})`}.`
        : `Your approval of the reviewed design${feature === null ? "" : ` of feature ${feature}`}${package_ === "" ? "" : `: ${package_}`}${extras === "" ? "" : ` (${extras})`}.`,
      why: de ? "Der Schritt vom Design zur Umsetzung braucht Ihre Signatur unter genau das geprüfte Paket (ADR-0085); kein Agent kann sie für Sie geben." : "The step from design to implementation needs your signature on exactly the reviewed package (ADR-0085); no agent can give it for you.",
      allows: (de
        ? "Der Agent darf diese signierte Entscheidung zu approve-plan bringen, das sie unabhängig verbrauchen muss, damit die Umsetzung unter dem unten gebundenen Paket beginnen kann. Die Anfrage trägt keinen Ablauf; sie gilt genau für diese Quellen, Prüfberichte und diesen Commit, und jede Änderung daran braucht eine neue Freigabe."
        : "The agent may take this signed decision to approve-plan, which must consume it independently, so that implementation can start under the package bound below. The request carries no expiry; it holds for exactly these sources, reviews and this commit, and a change of any of them needs a new approval.")
        + (open === null ? "" : (de ? ` Sie signieren über ${open} blockierende ${plural(open, "Feststellung", "Feststellungen")}, die nach der letzten erlaubten Prüfrunde offen ${plural(open, "ist", "sind")}; die Signatur nimmt sie wissentlich hin.` : ` You sign over ${open} blocking ${plural(open, "finding", "findings")} still open after the last allowed review round; signing accepts ${plural(open, "it", "them")} knowingly.`)),
      limits: de ? "Es ist keine Push-, Release- oder Veröffentlichungs-Freigabe und keine Guard-Freigabe, und es ändert weder PRD noch Spec." : "It is not a push, release or publication approval and not a guard override, and it changes neither the PRD nor the Spec.",
      closed: de ? "der Plan bleibt ohne Freigabe und approve-plan hat keine signierte Entscheidung zu verbrauchen" : "the plan stays unapproved and approve-plan has no signed decision to consume",
      reading: de
        ? "Die Zeilen oben sind die Bedeutung. Die Zeilen darunter sind der Beleg, an den die Signatur gebunden ist: der Intent-Digest, den Ihr Schlüssel signiert, Commit und Tree des Kandidaten, der Digest der Design-Bindung, die Prüfberichte und die vollständige begrenzte Design-Bindung."
        : "The lines above are the meaning. The lines below are the evidence this signature is bound to: the intent digest your key signs, the candidate commit and tree, the design binding digest, the review reports and the complete bounded design binding.",
    };
  },
});

/** The ceremony kinds `sign-intent` can open with a card; kept apart from CARD_KINDS (the twelve `authorize-critical` kinds). */
export const CEREMONY_CARD_KINDS = Object.freeze(Object.keys(CEREMONY_SPECS));

/**
 * The card for a `sign-intent` ceremony, as lines ending in CARD_END_LINE; an unknown kind has no card (empty list). `facts` is what the request
 * holds for that kind (see CEREMONY_SPECS); the decline part covers both ways of saying no, since a passphrase-protected key has no typed token.
 */
export function signingCeremonyCard({ kind, facts, language } = {}) {
  const spec = Object.hasOwn(CEREMONY_SPECS, kind) ? CEREMONY_SPECS[kind] : null;
  if (spec === null) return [];
  const lang = Object.hasOwn(LABELS, language) ? language : "en";
  const de = lang === "de";
  const labels = LABELS[lang];
  const parts = spec(isObject(facts) ? facts : {}, de, lang);
  const decline = de
    ? `Nichts wird signiert und kein Nachweis geschrieben, solange Sie nicht bestätigen (bei einem passphrasengeschützten Schlüssel: solange Sie die Passphrase nicht eingeben). Die Anfrage bleibt ohne Signatur in scratch/ und gewährt nichts; ${parts.closed}.`
    : `Nothing is signed and no proof is written unless you confirm (with a passphrase-protected key: unless you enter the passphrase). The request file stays in scratch/ without a signature and grants nothing; ${parts.closed}.`;
  return [
    `${labels[0]} ${parts.what}`,
    `${labels[1]} ${parts.why}`,
    `${labels[2]} ${parts.allows}`,
    `${labels[3]} ${parts.limits}`,
    `${labels[4]} ${decline}`,
    `${labels[5]} ${parts.reading}`,
    CARD_END_LINE,
  ];
}

/**
 * The card as lines (without indentation), ending in CARD_END_LINE. An unknown kind has no card (empty list).
 * `subject` is the subject preimage the request holds (or null); `language` is the resolved human-facing language.
 */
export function criticalActionApprovalCard({ kind, candidate, expiresAt, featureId, subject, language } = {}) {
  const spec = Object.hasOwn(SPECS, kind) ? SPECS[kind] : null;
  if (spec === null || !isObject(candidate)) return [];
  const lang = Object.hasOwn(LABELS, language) ? language : "en";
  const de = lang === "de";
  const labels = LABELS[lang];
  const parts = spec({ commit: candidate.commit, tree: candidate.tree, feature: line(featureId) ?? "?", subject: isObject(subject) ? subject : null }, de);
  const allows = `${parts.allows} ${de ? `Das gilt bis ${expiryText(lang, expiresAt)}; danach ist eine neue Freigabe nötig.` : `This holds until ${expiryText(lang, expiresAt)}; after that a new approval is needed.`}`;
  const decline = de
    ? `Es wird nichts signiert und kein Nachweis geschrieben; der Befehl endet mit "approval cancelled". Die unsignierte Anfrage bleibt ohne jede Freigabe im Freigabe-Verzeichnis und wird beim nächsten Lauf überschrieben; ${parts.closed}.`
    : `Nothing is signed and no proof is written; the command stops with "approval cancelled". The unsigned request stays in the approval directory without any approval and is overwritten by the next run; ${parts.closed}.`;
  const reading = de
    ? "Die Zeilen oben sind die Bedeutung. Die Zeilen darunter sind der Beleg, an den die Signatur gebunden ist: Commit- und Tree-Hashes, der Subject-Digest und der Digest der Freigabe-Absicht; Ihr Schlüssel signiert diesen Digest."
    : "The lines above are the meaning. The lines below are the evidence this signature is bound to: the commit and tree hashes, the subject digest and the approval intent digest; your key signs that digest.";
  return [
    `${labels[0]} ${parts.what}`,
    `${labels[1]} ${parts.why}`,
    `${labels[2]} ${allows}`,
    `${labels[3]} ${parts.limits}`,
    `${labels[4]} ${decline}`,
    `${labels[5]} ${reading}`,
    CARD_END_LINE,
  ];
}
