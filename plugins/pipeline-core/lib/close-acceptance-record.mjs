// SPDX-License-Identifier: SUL-1.0
/**
 * C22 (AC-108; CGR-06, CGF-12, CGF-29): the human acceptance of a feature package as one recorded answer, and the closed-state block of the handover.
 *
 * The one-shot close asks the human once, in one generated sentence, before its irreversible part. The answer is stored as a managed section of the
 * feature's tracked acceptance.md (the literal answer, the candidate commit, the open checks), labelled as an attribution record and not a signature.
 * A registered acceptance.md that the approval binds (authority) is never edited: its record goes to evidence/human-acceptance.md. A non-authority
 * entry (the Pipeline-generated pointer) keeps its registered digest honest through the package's own amendment record, so no signature is needed.
 * Every read splits on /\r?\n/ and every write keeps the line ending of the file it changes (Windows).
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

export const ACCEPTANCE_BEGIN = "<!-- close-acceptance:begin -->";
export const ACCEPTANCE_END = "<!-- close-acceptance:end -->";
export const CLOSED_BLOCK_BEGIN = "<!-- pipeline:closed-state:begin -->";
export const CLOSED_BLOCK_END = "<!-- pipeline:closed-state:end -->";
/** The standing open check: what a close can never observe about the product. Always part of the list the human is asked about. */
export const STANDING_OPEN_CHECK = "any manual or real-device check of the product, which this close does not run";
const FEATURE = /^[a-z][a-z0-9-]{2,63}$/u;
const sha256Hex = (bytes) => createHash("sha256").update(bytes).digest("hex");
const fallbackPath = (featureId) => `specs/${featureId}/evidence/human-acceptance.md`;
const lines = (text) => String(text).split(/\r?\n/u);

/** The checks the human is told are still open: the ones the caller named, then the standing one. */
export function openChecksOf(named) {
  const own = (Array.isArray(named) ? named : []).map((value) => String(value).replace(/\s+/gu, " ").trim().slice(0, 200)).filter((value) => value !== "").slice(0, 8);
  return [...own, STANDING_OPEN_CHECK];
}

/**
 * C28 (AC-108): the printed answer form of a yes (C29 widens what counts to the closed list below). The words come from the project's human-facing language as Continuity records it
 * (`continuity.runtime.humanFacingLanguage`), so a German-speaking human answers in German; every other language, and a project without a
 * Continuity binding, falls back to the English form. Only the form of the project's own language is a yes.
 */
export const ACCEPTANCE_YES_FORMS = Object.freeze({ en: "yes, I accept", de: "ja, ich akzeptiere" });
/**
 * Candidate 29 (Codex greenfield run 3, C8; PO tile 2026-11-13): a CLOSED list of clear yes answers per language. The run's human
 * answered "ja akzeptiert" and was told only "ja, ich akzeptiere" counts. Each list starts with the form the question prints; only the
 * list of the project's own language counts, a comma and repeated spaces do not matter (see yesKey), and nothing outside the list is a
 * yes: no keyword is searched in free text, so "ja, aber ..." or "yes, but ..." stays a decline.
 */
const ACCEPTANCE_YES_CORE = Object.freeze({
  en: Object.freeze(["yes, I accept", "yes", "yes, accepted", "accepted", "I accept"]),
  de: Object.freeze(["ja, ich akzeptiere", "ja", "ja, akzeptiert", "akzeptiert", "ich akzeptiere"]),
});
/**
 * PO decision 2026-11-17 ("gut" bzw. alles Positive soll als Abnahme gelten; the signature before a push remains the final gate): the closed list
 * grows by plainly positive answers. It is still a closed list, never a keyword search: "good, but ..." and "nicht gut" stay declines, and only the
 * core forms above are printed in the question (plus a few examples of the rest).
 */
const ACCEPTANCE_YES_POSITIVE = Object.freeze({
  en: Object.freeze(["good", "very good", "great", "fine", "ok", "okay", "perfect", "excellent", "nice", "sounds good", "looks good", "all good", "lgtm",
    "approved", "I approve", "agreed", "I agree", "sure", "yep", "yeah", "yes please", "go ahead", "confirmed", "yes, good", "yes, ok", "yes, okay", "yes, great", "yes, perfect"]),
  de: Object.freeze(["gut", "sehr gut", "super", "prima", "perfekt", "passt", "ok", "okay", "top", "toll", "klar", "gerne", "einverstanden", "in ordnung", "alles gut",
    "sieht gut aus", "genehmigt", "freigegeben", "abgenommen", "bestätigt", "stimmt", "genau", "korrekt", "richtig", "sauber", "ja gerne", "ja bitte", "ja, gut", "ja, passt",
    "ja, ok", "ja, okay", "ja, super", "ja, perfekt", "ja, klar", "ja, einverstanden"]),
});
export const ACCEPTANCE_YES_ANSWERS = Object.freeze({
  en: Object.freeze([...ACCEPTANCE_YES_CORE.en, ...ACCEPTANCE_YES_POSITIVE.en]),
  de: Object.freeze([...ACCEPTANCE_YES_CORE.de, ...ACCEPTANCE_YES_POSITIVE.de]),
});
const ACCEPTANCE_YES_EXAMPLES = Object.freeze({ en: ["good", "ok", "approved"], de: ["gut", "passt", "ok"] });
const languageKey = (language) => {
  const key = typeof language === "string" ? language.trim().toLowerCase().split(/[-_]/u)[0] : "";
  return Object.hasOwn(ACCEPTANCE_YES_FORMS, key) ? key : "en";
};
export function acceptanceYesForm(language) { return ACCEPTANCE_YES_FORMS[languageKey(language)]; }
const formLanguage = (form) => Object.keys(ACCEPTANCE_YES_FORMS).find((key) => ACCEPTANCE_YES_FORMS[key] === form) ?? null;
const yesKey = (value) => String(value).trim().replace(/[.!]+$/u, "").replace(/,/gu, " ").replace(/\s+/gu, " ").trim().toLowerCase();
/**
 * An acceptance only for an answer on the closed list of the form's language (normalised for case, commas, inner and surrounding
 * space and a closing `.` or `!`), or for an answer whose FIRST SENTENCE is such a form (C30d, PO decision 2026-11-16, Antigravity
 * greenfield: "yes! now please push" is an acceptance followed by the next request). The first sentence ends at a `.`, `!` or a line
 * break; a `?` never ends an accepting sentence, and a comma continues the sentence, so "yes, but ..." stays a decline. What follows the
 * first sentence is recorded with the answer and never read: no keyword is searched anywhere. A form outside ACCEPTANCE_YES_FORMS
 * keeps the old one-form rule.
 */
export function isAcceptanceYes(answer, form) {
  if (typeof answer !== "string") return false;
  const language = formLanguage(form);
  const allowed = language === null ? [form] : ACCEPTANCE_YES_ANSWERS[language];
  const accepts = (value) => allowed.some((entry) => yesKey(value) === yesKey(entry));
  if (accepts(answer)) return true;
  const boundary = /([.!?]+)(?=\s)|\r?\n/u.exec(answer.trim());
  if (boundary === null || (boundary[1] !== undefined && boundary[1].includes("?"))) return false;
  return accepts(answer.trim().slice(0, boundary.index));
}
/** The clear yes answers of the form's language, quoted for a sentence. */
export function acceptanceYesAnswersText(form) {
  const language = formLanguage(form);
  if (language === null) return `"${form}"`;
  const quote = (entries) => entries.map((entry) => `"${entry}"`).join(", ");
  return `${quote(ACCEPTANCE_YES_CORE[language])}${language === "de" ? " oder eine andere eindeutig zustimmende Antwort wie " : ", or another plainly positive answer such as "}${quote(ACCEPTANCE_YES_EXAMPLES[language])}`;
}

/** The one sentence the agent asks the human in the chat, in the project's language (the form's language); it names the clear yes answers. */
export function acceptanceQuestion({ featureId, candidate, openChecks, form = ACCEPTANCE_YES_FORMS.en, verifyPassed = false }) {
  // C30G-E1: the question is asked after the candidate Verify, and says so (verifyPassed); a caller that did not run the Verify keeps the text as it was.
  if (formLanguage(form) === "de") {
    return `Nehmen Sie das Feature-Paket ${featureId} beim Kandidaten ${candidate} ab? ${verifyPassed ? "Der Kandidaten-Verify für diesen Kandidaten ist bestanden. " : ""}Der durchgeführte Close gilt als menschliche Abnahme dieses Feature-Pakets. Noch offene Prüfungen: ${openChecks.join("; ")}. Zur Abnahme antworten Sie mit einer dieser Formen: ${acceptanceYesAnswersText(form)}; steht eine dieser Formen als erster Satz, darf danach Ihr nächster Auftrag folgen (er wird festgehalten, nicht als Teil der Abnahme gelesen); jede andere Antwort ist keine Abnahme.`;
  }
  return `Do you accept the feature package ${featureId} at candidate ${candidate}? ${verifyPassed ? "The candidate Verify has passed for this candidate. " : ""}The performed close counts as the human acceptance of this feature package. Checks still open: ${openChecks.join("; ")}. To accept, answer with one of these forms: ${acceptanceYesAnswersText(form)}; when one of them is the first sentence, your next request may follow it (it is recorded, not read as part of the acceptance); any other answer is not an acceptance.`;
}

export const DECLINE_BEGIN = "<!-- close-decline:begin -->";
export const DECLINE_END = "<!-- close-decline:end -->";
/** Where the decline of this candidate with this answer is recorded: evidence, never one of the places `readAcceptanceRecord` reads. */
export function declineRecordPath({ featureId, candidate, answer }) {
  return `specs/${featureId}/evidence/human-decline-${candidate.slice(0, 12)}-${sha256Hex(Buffer.from(answer, "utf8")).slice(0, 8)}.md`;
}
export function renderDeclineRecord({ candidate, answer, openChecks, declinedAt }) {
  return [DECLINE_BEGIN, "## Human decline of this feature package", "",
    `- Candidate: \`${candidate}\``, `- Declined at: ${declinedAt}`, `- Answer (literal): ${JSON.stringify(answer)}`, "- Open checks:", ...openChecks.map((check) => `  - ${check}`),
    "- Record type: an attribution record of the human's answer in the chat. It is not an acceptance and not a signature; the feature returns to a correction round (correction dispatch, Critic delta round, then the close again) without reopening the design.",
    DECLINE_END, ""].join("\n");
}
/** The decline a text carries, or null. */
export function parseDeclineRecord(text) {
  const all = lines(text); const from = all.findIndex((line) => line.trim() === DECLINE_BEGIN); const to = all.findIndex((line, index) => index > from && line.trim() === DECLINE_END);
  if (from < 0 || to < 0) return null;
  const block = all.slice(from, to); let candidate = null; let answer = null;
  for (const line of block) {
    const found = /^- Candidate: `([0-9a-f]{40}|[0-9a-f]{64})`\s*$/u.exec(line); if (found) candidate = found[1];
    const literal = /^- Answer \(literal\): (".*")\s*$/u.exec(line); if (literal) { try { answer = JSON.parse(literal[1]); } catch { answer = null; } }
  }
  return candidate === null || typeof answer !== "string" ? null : { candidate, answer };
}
/** Writes (idempotently: the same candidate and answer keep their first record and time) the decline record. Returns its path and digest. */
export function writeDeclineRecord({ root, featureId, record, now = () => new Date().toISOString() }) {
  const path = declineRecordPath({ featureId, candidate: record.candidate, answer: record.answer }); const file = resolve(root, path);
  let existing = null; try { existing = parseDeclineRecord(readFileSync(file, "utf8")); } catch { existing = null; }
  if (existing === null || existing.candidate !== record.candidate || existing.answer !== record.answer) {
    mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, renderDeclineRecord({ ...record, declinedAt: now() }));
  }
  return { path, sha256: sha256Hex(readFileSync(file)) };
}

export function renderAcceptanceSection({ candidate, answer, openChecks }) {
  return [ACCEPTANCE_BEGIN, "## Human acceptance of this feature package", "",
    `- Candidate: \`${candidate}\``, `- Answer (literal): ${JSON.stringify(answer)}`, "- Open checks:", ...openChecks.map((check) => `  - ${check}`),
    "- Record type: an attribution record of the human's answer in the chat, not a signature and not proof; the performed close counts as the human acceptance of this feature package.",
    ACCEPTANCE_END].join("\n");
}

/** The record a text carries, or null. */
export function parseAcceptanceRecord(text) {
  const all = lines(text); const from = all.findIndex((line) => line.trim() === ACCEPTANCE_BEGIN); const to = all.findIndex((line, index) => index > from && line.trim() === ACCEPTANCE_END);
  if (from < 0 || to < 0) return null;
  const block = all.slice(from, to); const candidate = /^- Candidate: `([0-9a-f]{40}|[0-9a-f]{64})`\s*$/u; const answer = /^- Answer \(literal\): (".*")\s*$/u;
  const found = block.map((line) => candidate.exec(line)).find((match) => match !== null); let literal = null;
  for (const line of block) { const match = answer.exec(line); if (match !== null) { try { literal = JSON.parse(match[1]); } catch { literal = null; } } }
  if (!found || typeof literal !== "string" || literal.trim() === "") return null;
  const checksAt = block.findIndex((line) => line.trim() === "- Open checks:");
  const openChecks = checksAt < 0 ? [] : block.slice(checksAt + 1).filter((line) => /^ {2}- /u.test(line)).map((line) => line.slice(4).trim());
  return { candidate: found[1], answer: literal, openChecks };
}

/** The text with the managed section replaced (or appended), in the line ending the text already uses; a missing text becomes a small document. */
export function applyAcceptanceSection(existing, section) {
  const eol = typeof existing === "string" && existing.includes("\r\n") ? "\r\n" : "\n"; const block = section.split("\n").join(eol);
  if (typeof existing !== "string") return `# Human acceptance${eol}${eol}${block}${eol}`;
  const all = existing.split(eol); const from = all.findIndex((line) => line.trim() === ACCEPTANCE_BEGIN); const to = all.findIndex((line, index) => index > from && line.trim() === ACCEPTANCE_END);
  if (from >= 0 && to >= 0) return [...all.slice(0, from), ...block.split(eol), ...all.slice(to + 1)].join(eol);
  return `${existing.replace(/\s+$/u, "")}${eol}${eol}${block}${eol}`;
}

/** Where the record belongs: the registered acceptance.md, unless the approval binds it (authority), then the evidence file. `entry` is the package entry to keep honest, else null. */
export function acceptanceTarget(root, featureId) {
  const manifestPath = `specs/${featureId}/lifecycle.json`; let entry = null;
  try { entry = JSON.parse(readFileSync(resolve(root, manifestPath), "utf8")).artifacts.find((item) => item?.class === "acceptance") ?? null; } catch { entry = null; }
  const safe = typeof entry?.path === "string" && entry.path.startsWith(`specs/${featureId}/`) && !entry.path.split("/").includes("..") && !entry.path.includes("\\");
  if (entry !== null && entry.authority === true) return { path: fallbackPath(featureId), manifestPath, entry: null };
  return { path: safe ? entry.path : `specs/${featureId}/acceptance.md`, manifestPath, entry: safe ? entry : null };
}

/** The recorded acceptance of the feature (either place), or null. */
export function readAcceptanceRecord(root, featureId) {
  for (const path of [acceptanceTarget(root, featureId).path, `specs/${featureId}/acceptance.md`, fallbackPath(featureId)]) {
    try { const record = parseAcceptanceRecord(readFileSync(resolve(root, path), "utf8")); if (record !== null) return { ...record, path }; } catch { /* next place */ }
  }
  return null;
}

/**
 * C28 (AC-108, Codex run): ONE status vocabulary, four facts shown apart where the State inspector and the close print status. After a design reopen the package's lifecycle record
 * still said `completed` next to State design/draft, and reports mixed 'package registered', 'implementation delivered', 'technically qualified' and 'human-accepted'.
 * Every projection derives from this one function, so a reopen (phase design) or a declined acceptance (the bound Result retired: `resultBound` false) moves all of them together:
 * a reopened or declined feature is never delivered, qualified or human-accepted. `packageState` is what the package's lifecycle record says (null: none).
 * `headCandidate` is the commit an acceptance must name: null skips the comparison (a closed feature: the acceptance names the candidate it was given for); the empty string
 * (HEAD unreadable) can never match, so an acceptance that cannot be shown to name this candidate is not reported as one. `resultBound` null: no Continuity binding to read.
 */
export function featureStatusVocabulary({ packageState = null, phase = null, resultBound = null, closed = false, acceptedCandidate = null, headCandidate = null } = {}) {
  const registered = typeof packageState === "string" && packageState !== "";
  const delivered = registered && (closed === true || phase !== "design") && ["verifying", "completed"].includes(packageState) && resultBound !== false;
  const qualified = delivered && packageState === "completed";
  const accepted = qualified && typeof acceptedCandidate === "string" && (headCandidate === null || acceptedCandidate === headCandidate);
  const recordLag = packageState === "completed" && !delivered
    ? { packageState, reason: `the package's lifecycle record still says completed, but the feature is ${phase === "design" ? "back in design (reopened)" : resultBound === false ? "back in a correction round (the acceptance was declined and the Result retired)" : "not delivered"}; read the four statuses, not the record` }
    : null;
  const yn = (value) => (value ? "yes" : "no");
  return { schema: "pipeline.feature-status.v1",
    packageRegistered: { reached: registered, state: registered ? packageState : null },
    implementationDelivered: { reached: delivered },
    technicallyQualified: { reached: qualified },
    humanAccepted: { reached: accepted, candidate: accepted ? acceptedCandidate : null },
    recordLag,
    summary: `package registered: ${registered ? packageState : "no"}; implementation delivered: ${yn(delivered)}; technically qualified: ${yn(qualified)}; human-accepted: ${yn(accepted)}` };
}

/** Writes (idempotently) the record and, for a registered non-authority entry, rebinds its digest with the package's amendment record. Returns the paths written. */
export function writeAcceptanceRecord({ root, featureId, record, now = () => new Date().toISOString() }) {
  const target = acceptanceTarget(root, featureId); const file = resolve(root, target.path); const written = [];
  let before = null; try { before = readFileSync(file, "utf8"); } catch { before = null; }
  const text = applyAcceptanceSection(before, renderAcceptanceSection(record));
  if (text !== before) { mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, text); written.push(target.path); }
  if (target.entry !== null) {
    const manifestFile = resolve(root, target.manifestPath); const manifest = JSON.parse(readFileSync(manifestFile, "utf8")); const index = manifest.artifacts.findIndex((item) => item?.class === "acceptance");
    const digest = sha256Hex(readFileSync(file));
    if (index >= 0 && manifest.artifacts[index].sha256 !== digest) {
      const previous = manifest.artifacts[index].sha256;
      manifest.artifacts[index] = { ...manifest.artifacts[index], sha256: digest, amendment: { at: now(), reason: "close acceptance record: the human's answer was recorded in this acceptance file (attribution record, no signature)", previousSha256: previous } };
      writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`); written.push(target.manifestPath);
    }
  }
  return written;
}

/**
 * The technical-close line, read from the recorded close entry of Pipeline State (C22B, CGF-12) instead of stating "done" from memory. This text is committed in
 * the close commit, before the freeze, the final Verify and the cleanup, so it names only what the entry records: when, by whom, the close lifecycle and the
 * phase the State close recorded. An entry that carries none of them is named as such.
 */
function technicalCloseLine(entry) {
  const recorded = typeof entry?.closedAt === "string" && entry.closedAt !== "" ? entry.closedAt : null;
  const lifecycle = typeof entry?.coordinatorClose?.lifecycleId === "string" ? entry.coordinatorClose.lifecycleId : null;
  const phase = typeof entry?.coordinatorClose?.phase === "string" ? entry.coordinatorClose.phase : null;
  const by = typeof entry?.closedBy === "string" && entry.closedBy !== "" ? entry.closedBy : null;
  const tail = "The freeze, the final Verify and the cleanup follow this text in the close and are not claimed here; it says nothing about product acceptance or push.";
  if (recorded === null || lifecycle === null) return `**Technical close:** recorded in Pipeline State, but the entry's close time or close lifecycle is not readable here. ${tail}`;
  return `**Technical close:** recorded in Pipeline State at \`${recorded}\`${by === null ? "" : ` by \`${by}\``}, close lifecycle \`${lifecycle}\`${phase === null ? "" : `, recorded phase \`${phase}\``}. ${tail}`;
}

/** The generated closed-state lines of the handover (technical close, product acceptance and push as three different facts), or null when the feature has no readable package. `entry` is the feature's closedFeatures entry. */
export function closedHandoverLines(root, featureId, entry = null) {
  if (!FEATURE.test(featureId ?? "")) return null;
  let candidate = null; try { const value = JSON.parse(readFileSync(resolve(root, `specs/${featureId}/lifecycle.json`), "utf8"))?.candidate?.commit; candidate = typeof value === "string" ? value : null; } catch { candidate = null; }
  const record = readAcceptanceRecord(root, featureId);
  return [`Feature \`${featureId}\` is closed locally; its verified candidate is ${candidate === null ? "not readable from its package" : `\`${candidate}\``}, and the close commit that carries this text is the one the close then freezes as the candidate.`,
    technicalCloseLine(entry),
    record === null ? "**Product acceptance:** not recorded in this feature's acceptance record; the human has not answered the acceptance question through the close."
      : `**Product acceptance:** recorded in \`${record.path}\` for candidate \`${record.candidate}\` (an attribution record of the human's answer, not a signature); open checks: ${record.openChecks.join("; ")}.`,
    "**Push:** not done by the close. Publication and push are separate human-gated steps. This sentence is written before any push and is not updated by one: what a remote holds is read with `<plugin-root>/scripts/publication-readback.mjs inspect --root <repo>`."];
}
