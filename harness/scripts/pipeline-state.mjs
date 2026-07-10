#!/usr/bin/env node
/**
 * pipeline-state.mjs -- the ONLY sanctioned writer for `.claude/pipeline-state.json`
 * (schema `pipeline.state.v0`, AP1-P3 "DURIN").
 *
 * WHY THIS FILE EXISTS
 *   The Dev-Plan-Gate (guard-devplan.mjs) and the Push-Gate (guard-push.mjs) need a
 *   deterministic, git-committed record of "has the PO's plan approval already been
 *   verbucht" and "was the push approved for THIS commit" -- not a chat memory, not a
 *   free-hand edit of the state file (which would be exactly the kind of silent,
 *   unauditable state change the whole gate exists to prevent). This CLI is the single
 *   choke point: every state transition is one subcommand, one audit-friendly JSON
 *   write, pretty-printed and meant to be git-committed (same audit-trail philosophy
 *   as `.claude/guard-override.log.jsonl`).
 *
 * SCHEMA (`pipeline.state.v0`) -- the file this CLI reads/writes:
 *   {
 *     "schema": "pipeline.state.v0",
 *     "activeFeature": { "id": "<string>", "planPath": "<string>", "phase": "<string>" } | absent,
 *     "planApproved": true | false,
 *     "planApproval": { "approvedBy": "<string>", "approvedAt": "<ISO-8601>" } | absent,
 *     "planRevocation": { "revokedBy": "<string>", "revokedAt": "<ISO-8601>" } | absent,
 *     "pushApproval": {
 *       "lastApproved": { "approvedBy": "<string>", "approvedAt": "<ISO-8601>", "forCommit": "<sha>" }
 *     } | absent,
 *     "closedFeatures": [
 *       { "id": "<string>", "planPath": "<string>", "phaseAtClose": "<string>|null",
 *         "closedAt": "<ISO-8601>", "closedBy": "<string>", "forCommit": "<sha>|null" }
 *     ] | absent,
 *     "updatedAt": "<ISO-8601>"
 *   }
 *   Every field beyond `schema` is optional -- consumers (the two gate hooks) treat an
 *   absent field the same as "not yet set" (fail-open per their own contracts).
 *
 *   DEVIATION NOTE (declared during the F1 fix, commit 1c0a181 -- see the `set-feature`/
 *   `set-phase` entries below for that fix itself, which moved `phase` INSIDE
 *   `activeFeature`): `planApproved` lives TOP-LEVEL, deliberately -- ADR-0027
 *   (`docs/adr/0027-gate-philosophie.md`, line ~15: "...solange eine aktive Feature
 *   (`activeFeature`) noch keine `planApproved: true` trägt") reads as though
 *   `planApproved` sat INSIDE `activeFeature`; the plan sketch itself
 *   (`.claude/plans/2026-07-07-ap1-pipeline-tuning.md`) never says that -- it only
 *   names `planApproved`, without specifying placement. Unlike `phase`, `planApproved`
 *   is NOT being moved: all shipped readers (guard-devplan.mjs: `state.planApproved`)
 *   and every test fixture (guard-devplan.test.mjs, this file's own PS-suite) already
 *   depend on the top-level shape -- moving it now would recreate the exact
 *   writer/reader schema drift the F1 fix eliminated for `phase`, just in the opposite
 *   direction (there, the shipped writer was the deviant; here, the ADR-0027 WORDING
 *   is the deviant, and the wording loses).
 *
 * SUBCOMMANDS (argv[0])
 *   set-feature   --id <id> --plan-path <path>   Sets activeFeature={id,planPath,
 *                                                 phase:"design"}, planApproved=false.
 *                                                 Clears any prior planApproval/
 *                                                 planRevocation (a NEW feature starts
 *                                                 with a clean approval slate).
 *   set-phase     --phase <name>                 Sets activeFeature.phase=<name>.
 *                                                 Leaves everything else untouched
 *                                                 (F1 fix: phase lives INSIDE
 *                                                 activeFeature -- see stop-suggest.mjs,
 *                                                 which reads activeFeature.phase).
 *   approve-plan  --by <name>                     Sets planApproved=true, records
 *                                                 planApproval={approvedBy,approvedAt}.
 *                                                 Clears any prior planRevocation.
 *   revoke-plan   --by <name>                     Sets planApproved=false, records
 *                                                 planRevocation={revokedBy,revokedAt}.
 *   approve-push  --by <name>                     Records pushApproval.lastApproved =
 *                                                 {approvedBy, approvedAt, forCommit}
 *                                                 where forCommit is the CURRENT HEAD
 *                                                 (`git rev-parse HEAD`, spawned in the
 *                                                 target project dir).
 *   close-feature --by <name>                     Closes the current activeFeature:
 *                                                 appends {id, planPath, phaseAtClose,
 *                                                 closedAt, closedBy, forCommit} to
 *                                                 closedFeatures (existing entries kept,
 *                                                 append-only), deletes activeFeature,
 *                                                 sets planApproved=false, clears
 *                                                 planApproval/planRevocation.
 *                                                 pushApproval is left untouched. No
 *                                                 activeFeature present -> refused (German
 *                                                 error, exit 2, nothing written). See the
 *                                                 forCommit DEVIATION note in RULES below --
 *                                                 unlike approve-push, a git failure here is
 *                                                 NOT fatal.
 *
 * RULES (all five `--by`-taking subcommands: approve-plan/revoke-plan/approve-push/close-feature)
 *   - `--by` MUST be present and non-blank -- REFUSED otherwise (German error, exit 2,
 *     nothing written). An unattributed approval/revocation would be exactly the kind
 *     of unauditable state change this CLI exists to prevent.
 *   - A pre-existing state file that is NOT valid JSON, NOT a JSON object, or carries
 *     a `schema` field other than "pipeline.state.v0" is treated as MALFORMED: the CLI
 *     refuses to write ANYTHING (clear German error, exit 2) -- NEVER a silent
 *     overwrite of data that might still matter. Fix or deliberately delete the file
 *     first (same "the guard binds agents, not humans" escape hatch as the git-guard
 *     family: the PO can always edit/delete the file directly, outside this CLI).
 *   - Timestamps are ISO-8601 (`Date.prototype.toISOString()`).
 *   - The file is written pretty-printed (`JSON.stringify(..., null, 2)` + trailing
 *     newline) and is meant to be git-committed by design -- it IS the audit trail
 *     (mirrors `.claude/guard-override.log.jsonl`'s philosophy: state changes belong
 *     in history, not just on disk).
 *   - All CLI user-facing output (stdout confirmations, stderr errors) is German.
 *   - DEVIATION (close-feature only, declared deliberately): unlike approve-push, a failed
 *     `git rev-parse HEAD` is NOT fatal for close-feature -- forCommit is set to `null`, a
 *     warning goes to stderr, and the close still writes and exits 0. Rationale: for
 *     approve-push, forCommit IS the gate payload (the entire point of that command); for
 *     close-feature it is audit metadata on a cleanup action -- a transient git failure must
 *     not block a feature from closing.
 *
 * PATH LOOKUP (same convention as the guard family -- guard-git.mjs/guard-testpath.mjs):
 *   `$CLAUDE_PROJECT_DIR/.claude/pipeline-state.json`, falling back to
 *   `process.cwd()/.claude/pipeline-state.json` when the env var is unset (the normal
 *   case for a human/Goldfish running this CLI directly from the repo root).
 *
 * EXIT CODES: 0 = written / success. 2 = refused (bad usage, malformed pre-existing
 * file, `git rev-parse HEAD` failed for `approve-push`, or no `activeFeature` for
 * `close-feature`) -- nothing written. Note: a `git rev-parse HEAD` failure during
 * close-feature does NOT produce exit 2 -- see the DEVIATION note in RULES above.
 *
 * VERIFY: node harness/scripts/pipeline-state.test.mjs (this file's own behavior
 * suite, standalone-runnable; exit 0 = all cases pass). Running this CLI directly
 * without a subcommand exits 2 (usage error) -- see guard-devplan.test.mjs /
 * guard-push.test.mjs for the two hooks' own consumer-side coverage of this schema.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

export const SCHEMA_ID = "pipeline.state.v0";

/** Resolves the target project dir: $CLAUDE_PROJECT_DIR, else process.cwd(). */
export function projectDir() {
  return process.env.CLAUDE_PROJECT_DIR || process.cwd();
}

/** Path to the state file under a given project dir. */
export function statePath(dir = projectDir()) {
  return join(dir, ".claude", "pipeline-state.json");
}

/**
 * Reads the state file. Never throws.
 * Returns one of:
 *   { status: "absent" }
 *   { status: "ok", state }
 *   { status: "malformed", error: "<German reason>" }
 */
export function readState(dir = projectDir()) {
  const p = statePath(dir);
  let raw;
  try {
    raw = readFileSync(p, "utf8");
  } catch {
    return { status: "absent" };
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    return { status: "malformed", error: `ungültiges JSON (${e.message})` };
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { status: "malformed", error: "Inhalt ist kein JSON-Objekt auf oberster Ebene" };
  }
  if (parsed.schema !== undefined && parsed.schema !== SCHEMA_ID) {
    return { status: "malformed", error: `unbekanntes Schema "${parsed.schema}" (erwartet "${SCHEMA_ID}")` };
  }
  return { status: "ok", state: parsed };
}

function writeState(dir, state) {
  const claudeDir = join(dir, ".claude");
  if (!existsSync(claudeDir)) mkdirSync(claudeDir, { recursive: true });
  writeFileSync(statePath(dir), JSON.stringify(state, null, 2) + "\n", "utf8");
}

/** Minimal `--flag value` argv parser (subcommand already stripped by the caller). */
function parseFlags(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      out[a.slice(2)] = argv[i + 1];
      i++;
    }
  }
  return out;
}

function isBlank(v) {
  return v === undefined || v === null || String(v).trim() === "";
}

/** Default `git rev-parse HEAD` runner; injectable for tests. Never throws. */
function defaultGitHead(dir) {
  const res = spawnSync("git", ["rev-parse", "HEAD"], { cwd: dir, encoding: "utf8" });
  if (res.error) return { ok: false, error: res.error.message };
  if (res.status !== 0 || !res.stdout || res.stdout.trim() === "") {
    return { ok: false, error: (res.stderr || `git rev-parse HEAD exited ${res.status}`).trim() };
  }
  return { ok: true, commit: res.stdout.trim() };
}

/**
 * Runs the CLI logic. Never calls process.exit itself (testable); returns the exit
 * code. `deps` allows tests to inject `dir`, `now`, and `gitHead` without touching the
 * real filesystem/clock/git.
 */
export function run(argv = process.argv.slice(2), deps = {}) {
  const dir = deps.dir ?? projectDir();
  const now = deps.now ?? (() => new Date().toISOString());
  const gitHead = deps.gitHead ?? defaultGitHead;

  const [sub, ...rest] = argv;
  const flags = parseFlags(rest);

  const existing = readState(dir);
  if (existing.status === "malformed") {
    console.error(`Fehler: bestehende Statusdatei ist ungültig (${existing.error}) -- Abbruch OHNE Änderung.`);
    console.error(`Datei: ${statePath(dir)}`);
    console.error(`Behebe die Datei manuell (oder lösche sie bewusst), bevor pipeline-state.mjs erneut schreibt.`);
    return 2;
  }
  const base = existing.status === "ok" ? existing.state : { schema: SCHEMA_ID };

  switch (sub) {
    case "set-feature": {
      const id = flags.id;
      const planPath = flags["plan-path"];
      if (isBlank(id) || isBlank(planPath)) {
        console.error('Fehler: set-feature benötigt --id <id> und --plan-path <pfad> (beide nicht leer).');
        return 2;
      }
      const timestamp = now();
      const next = {
        ...base,
        schema: SCHEMA_ID,
        activeFeature: { id, planPath, phase: "design" },
        planApproved: false,
        updatedAt: timestamp,
      };
      delete next.planApproval;
      delete next.planRevocation;
      delete next.phase; // F1 fix: strip any legacy top-level `phase` left over from a
      // pre-fix file -- phase now lives exclusively at activeFeature.phase.
      writeState(dir, next);
      console.log(`Feature "${id}" gesetzt. Plan-Pfad: ${planPath}. planApproved=false, phase="design".`);
      return 0;
    }

    case "set-phase": {
      const phase = flags.phase;
      if (isBlank(phase)) {
        console.error('Fehler: set-phase benötigt --phase <name> (nicht leer).');
        return 2;
      }
      const baseActiveFeature = base.activeFeature && typeof base.activeFeature === "object" ? base.activeFeature : {};
      const next = {
        ...base,
        schema: SCHEMA_ID,
        activeFeature: { ...baseActiveFeature, phase },
        updatedAt: now(),
      };
      delete next.phase; // F1 fix: strip any legacy top-level `phase` left over from a
      // pre-fix file -- phase now lives exclusively at activeFeature.phase.
      writeState(dir, next);
      console.log(`Phase gesetzt: "${phase}".`);
      return 0;
    }

    case "approve-plan": {
      const by = flags.by;
      if (isBlank(by)) {
        console.error('Fehler: approve-plan benötigt --by <name> (nicht leer) -- eine unbenannte Freigabe wird verweigert.');
        return 2;
      }
      const approvedAt = now();
      const next = {
        ...base,
        schema: SCHEMA_ID,
        planApproved: true,
        planApproval: { approvedBy: by, approvedAt },
        updatedAt: approvedAt,
      };
      delete next.planRevocation;
      writeState(dir, next);
      console.log(`Plan freigegeben durch "${by}" am ${approvedAt}.`);
      return 0;
    }

    case "revoke-plan": {
      const by = flags.by;
      if (isBlank(by)) {
        console.error('Fehler: revoke-plan benötigt --by <name> (nicht leer) -- ein unbenannter Widerruf wird verweigert.');
        return 2;
      }
      const revokedAt = now();
      const next = {
        ...base,
        schema: SCHEMA_ID,
        planApproved: false,
        planRevocation: { revokedBy: by, revokedAt },
        updatedAt: revokedAt,
      };
      writeState(dir, next);
      console.log(`Plan-Freigabe widerrufen durch "${by}" am ${revokedAt}.`);
      return 0;
    }

    case "approve-push": {
      const by = flags.by;
      if (isBlank(by)) {
        console.error('Fehler: approve-push benötigt --by <name> (nicht leer) -- eine unbenannte Freigabe wird verweigert.');
        return 2;
      }
      const head = gitHead(dir);
      if (!head.ok) {
        console.error(`Fehler: aktueller Commit (git rev-parse HEAD) konnte nicht ermittelt werden: ${head.error}`);
        console.error("Push-Freigabe NICHT verbucht -- ohne bekannten Commit ist forCommit sinnlos.");
        return 2;
      }
      const approvedAt = now();
      const next = {
        ...base,
        schema: SCHEMA_ID,
        pushApproval: { lastApproved: { approvedBy: by, approvedAt, forCommit: head.commit } },
        updatedAt: approvedAt,
      };
      writeState(dir, next);
      console.log(`Push freigegeben durch "${by}" für Commit ${head.commit} (${approvedAt}).`);
      return 0;
    }

    case "close-feature": {
      const by = flags.by;
      if (isBlank(by)) {
        console.error('Fehler: close-feature benötigt --by <name> (nicht leer) -- ein unbenannter Abschluss wird verweigert.');
        return 2;
      }
      const activeFeature = base.activeFeature;
      if (!activeFeature || typeof activeFeature !== "object") {
        console.error('Fehler: kein aktives Feature vorhanden -- nichts zu schließen.');
        return 2;
      }
      // DEVIATION vs. approve-push (declared in the header): a git failure here is NOT fatal --
      // forCommit becomes null, a warning goes to stderr, and the close proceeds (exit 0).
      const head = gitHead(dir);
      let forCommit = null;
      if (head.ok) {
        forCommit = head.commit;
      } else {
        console.error(`Warnung: aktueller Commit (git rev-parse HEAD) konnte nicht ermittelt werden: ${head.error}.`);
        console.error("close-feature läuft trotzdem weiter -- forCommit wird als null vermerkt.");
      }
      const closedAt = now();
      const priorClosed = Array.isArray(base.closedFeatures) ? base.closedFeatures : [];
      const closedEntry = {
        id: activeFeature.id,
        planPath: activeFeature.planPath,
        phaseAtClose: activeFeature.phase ?? null,
        closedAt,
        closedBy: by,
        forCommit,
      };
      const next = {
        ...base,
        schema: SCHEMA_ID,
        closedFeatures: [...priorClosed, closedEntry],
        planApproved: false,
        updatedAt: closedAt,
      };
      delete next.activeFeature;
      delete next.planApproval;
      delete next.planRevocation;
      writeState(dir, next);
      console.log(
        `Feature "${activeFeature.id}" geschlossen durch "${by}" (Commit ${forCommit ?? "—"}, ${closedAt}). activeFeature entfernt, planApproved=false.`,
      );
      return 0;
    }

    default: {
      console.error(
        `Fehler: unbekanntes Kommando "${sub ?? ""}". Erlaubt: set-feature, set-phase, approve-plan, revoke-plan, approve-push, close-feature.`,
      );
      return 2;
    }
  }
}

const isDirectRun = (() => {
  try {
    return Boolean(process.argv[1]) && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
})();
if (isDirectRun) {
  process.exit(run());
}
