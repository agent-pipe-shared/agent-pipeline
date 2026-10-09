// GREP-PUSH-F-20261009 scratch tool (git-ignored, NOT part of the commit). Run from the repo root:
//   node scratch/dispatch-wip/GREP-PUSH-F/build.mjs
// Builds the tranche-2 lib/git-cmd.mjs post-image from the live file (string replacements, each asserted), writes the
// redirect hook + runnable test bodies/entries for the WSL captures, then probes the post-image in a child node process
// that serves it under the live module URL (no live write), and runs the live lib git-cmd.test.mjs against it.
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, "..", "..", "..");
const TRANCHE = "specs/sprint-alfred-epic/signed-package/tranche-2/";
const sha = (v) => createHash("sha256").update(v).digest("hex");
const count = (t, n) => t.split(n).length - 1;
const BT = "`";
const live = readFileSync(join(repo, "plugins/pipeline-core/lib/git-cmd.mjs"), "utf8");
if (live.includes("\r")) throw new Error("CR in live git-cmd.mjs");
let text = live;
const once = (anchor, replacement) => {
  if (count(text, anchor) !== 1) throw new Error("anchor count " + count(text, anchor) + " for " + anchor.slice(0, 60));
  text = text.replace(anchor, () => replacement);
};

const PARA = String.raw` * GREP-PUSH-F (PO Ruling 157, on top of Ruling 81): the five characters $ @@BT@@ { ( ) are NOT a marker when the whole text is ONE
 * single-line command "git <sub> ..." with <sub> literally commit, grep, log, show, diff or status right after the git word and
 * every one of the characters sits inside a quoted span (see markerRuleIsInert). Outside quotes the command has no ; & | < > #
 * and no backslash, so there is no second command, redirect, process substitution or brace expansion; a global option before
 * the subcommand (git -c alias.x=... x) is never exempt; a command substitution inside a double-quoted span is exempt only when
 * it is a simple command of plain word characters that this function classifies recursively as not a push. So the quoted
 * git commit -m "$(date)" and git grep "(a|b)" are no longer false positives, while an unquoted $(...), a push hidden in a
 * substitution, a push-capable subcommand (push, remote, config, an alias form) and every non-character marker keep failing
 * closed. Only the MARKER reason is lifted: the rules after the marker rule still run on the same text.
 *
`.replaceAll("@@BT@@", BT);

const HELPER = String.raw`// ---- GREP-PUSH-F (PO Ruling 157, built on Ruling 81): the marker exemption for a plain read/commit subcommand ------------------
// Option B keeps $, a backtick, { , ( and ) fail-closed for every command that names git. Ruling 157 accepts, for ONE shape,
// that those characters are data: a single-line command that is exactly "git <sub> ..." with <sub> one of commit, grep, log,
// show, diff or status written literally right after the git word, and in which every marker character sits inside a quoted
// span. The trade is bought back by three conditions, each one a place a push could still hide:
//   - the text is ONE simple command: outside quotes there is no ; & | < > # and none of the five characters, and the text
//     holds no backslash and no line break, so there is no second command, no redirect, no process substitution, no brace
//     expansion and no here-document;
//   - the git word is followed DIRECTLY by the subcommand: a global option before it (-c alias.x=!..., -C, --git-dir) is never
//     exempt, so an alias cannot rename a push;
//   - every command substitution inside a double-quoted span ($( ) or a backtick pair) is a SIMPLE command of plain word
//     characters that commandIsGitPushAt itself classifies as not a push; a substitution with quotes, a nested one, an
//     assignment form (the dollar-brace default-assign) or any other construct is not modelled and is not exempt. A
//     single-quoted span is literal text.
// Only the MARKER reason is lifted. A non-character marker (non-ASCII quote, nested shell, here-document receiver) is never
// exempt here, and the rest of commandIsGitPushAt (runner receivers, env -S, classifyPush under three readings) still runs.
const MARKER_EXEMPT_SUBCOMMANDS = new Set(["commit", "grep", "log", "show", "diff", "status"]);
const MARKER_EXEMPT_UNQUOTED_FORBIDDEN_RE = /[$@@BT@@{}()<>;&|#\\\r\n]/u;
const MARKER_EXEMPT_PAYLOAD_RE = /^[A-Za-z0-9_./:@%+,\- ]*$/u;
const MARKER_EXEMPT_MAX_LENGTH = 8192;

/** The payloads of the command substitutions inside one double-quoted span, or null when the span holds anything this rule does not model. */
function doubleQuotedSubstitutions(content) {
  const payloads = [];
  let parenDepth = 0;
  for (let i = 0; i < content.length; i += 1) {
    const ch = content[i];
    if (ch === "@@BT@@") {
      const close = content.indexOf("@@BT@@", i + 1);
      if (close === -1) return null;
      payloads.push(content.slice(i + 1, close));
      i = close;
    } else if (ch === "$") {
      const next = content[i + 1];
      if (next === "(") {
        let depth = 1;
        let j = i + 2;
        for (; j < content.length && depth > 0; j += 1) {
          if (content[j] === "(") depth += 1;
          else if (content[j] === ")") depth -= 1;
        }
        if (depth !== 0) return null;
        payloads.push(content.slice(i + 2, j - 1));
        i = j - 1;
      } else if (next === undefined || !/[A-Za-z_]/u.test(next)) return null;
      // A plain $NAME is data: a variable can only be read here, never assigned.
    } else if (ch === "(") parenDepth += 1;
    else if (ch === ")") {
      if (parenDepth === 0) return null;
      parenDepth -= 1;
    }
  }
  return parenDepth === 0 ? payloads : null;
}

/** True when the marker characters of cmd are inert data (see the block comment above); the caller still runs the rest of the rule. */
function markerRuleIsInert(cmd, depth) {
  if (depth >= INNER_COMMAND_MAX_DEPTH || cmd.length > MARKER_EXEMPT_MAX_LENGTH) return false;
  if (/[\\\r\n‘-‟]/u.test(cmd)) return false;
  if (NESTED_POSIX_SHELL_RE.test(cmd) || NESTED_WINDOWS_SHELL_RE.test(cmd) || hasShellHeredocReceiver(cmd)) return false;
  const words = [];
  const payloads = [];
  let word = "";
  const endWord = () => {
    if (word !== "") words.push(word);
    word = "";
  };
  for (let i = 0; i < cmd.length; ) {
    const ch = cmd[i];
    if (ch === " " || ch === "\t") {
      endWord();
      i += 1;
      continue;
    }
    if (ch === "'" || ch === '"') {
      const close = cmd.indexOf(ch, i + 1);
      if (close === -1) return false;
      if (ch === '"') {
        const found = doubleQuotedSubstitutions(cmd.slice(i + 1, close));
        if (found === null) return false;
        payloads.push(...found);
      }
      word += cmd.slice(i, close + 1);
      i = close + 1;
      continue;
    }
    if (MARKER_EXEMPT_UNQUOTED_FORBIDDEN_RE.test(ch)) return false;
    word += ch;
    i += 1;
  }
  endWord();
  if (words.length < 2 || words[0] !== "git" || !MARKER_EXEMPT_SUBCOMMANDS.has(words[1])) return false;
  for (const payload of payloads) {
    if (!MARKER_EXEMPT_PAYLOAD_RE.test(payload)) return false;
    if (commandIsGitPushAt(payload.trim(), depth + 1)) return false;
  }
  return true;
}

`.replaceAll("@@BT@@", BT);

once("function hasFailClosedMarker(cmd) {", "export function hasFailClosedMarker(cmd) {");
once("  if (hasGitWord(cmd) && hasFailClosedMarker(cmd)) return true;", "  if (hasGitWord(cmd) && hasFailClosedMarker(cmd) && !markerRuleIsInert(cmd, depth)) return true;");
once("// ---- GITCLS-F: a command line handed to a shell by ", HELPER + "// ---- GITCLS-F: a command line handed to a shell by ");
once(" * Without a marker the three branches of ", PARA + " * Without a marker the three branches of ");

const postPath = join(repo, TRANCHE, "lib/git-cmd.mjs");
mkdirSync(dirname(postPath), { recursive: true });
writeFileSync(postPath, text, "utf8");
const baseBlob = spawnSync("git", ["hash-object", "plugins/pipeline-core/lib/git-cmd.mjs"], { cwd: repo, encoding: "utf8" }).stdout.trim();
const lines = (s) => s.split("\n").length - 1;

// ---- redirect + entries ----
writeFileSync(join(here, "register.mjs"), 'import { register } from "node:module";\nregister("./redirect-hooks.mjs", import.meta.url);\n', "utf8");
writeFileSync(join(here, "redirect-hooks.mjs"), String.raw`import { appendFileSync, readFileSync } from "node:fs";
const root = new URL("../../../", import.meta.url);
const TRANCHE = "specs/sprint-alfred-epic/signed-package/tranche-2/";
const map = {
  "plugins/pipeline-core/lib/git-cmd.mjs": TRANCHE + "lib/git-cmd.mjs",
  "plugins/pipeline-core/hooks/guard-push.mjs": TRANCHE + "hooks/guard-push.mjs",
  "plugins/pipeline-core/hooks/guard-git.mjs": TRANCHE + "hooks/guard-git.mjs",
};
const served = new Map(Object.entries(map).map(([liveRel, src]) => [new URL(liveRel, root).href, [new URL(src, root), liveRel]]));
export async function load(url, context, nextLoad) {
  const hit = served.get(url);
  if (hit === undefined) return nextLoad(url, context);
  appendFileSync(new URL("./fired.log", import.meta.url), hit[1] + "\n");
  return { format: "module", source: readFileSync(hit[0]), shortCircuit: true };
}
`, "utf8");
const entry = (name, body) => `import { existsSync, readFileSync, rmSync } from "node:fs";
const sidecar = new URL("./fired.log", import.meta.url);
rmSync(sidecar, { force: true });
process.env.NODE_OPTIONS = ((process.env.NODE_OPTIONS ?? "") + " --import=" + new URL("./register.mjs", import.meta.url).href).trim();
process.on("exit", () => {
  const hits = existsSync(sidecar) ? readFileSync(sidecar, "utf8").split("\\n").filter(Boolean) : [];
  const by = {};
  for (const h of hits) by[h] = (by[h] ?? 0) + 1;
  console.error((hits.length > 0 ? "GREPPUSHF-REDIRECT-FIRED " : "GREPPUSHF-REDIRECT-NOT-FIRED ") + "${name} " + JSON.stringify(by));
});
await import("./${body}");
`;
const bodies = [];
for (const [name, rel, nLib] of [["guard-push", "hooks/guard-push.test.mjs", 5], ["guard-git", "hooks/guard-git.test.mjs", 3]]) {
  let body = readFileSync(join(repo, TRANCHE, rel), "utf8");
  const libN = count(body, '"../lib/');
  const urlLive = `new URL("./${name}.mjs", import.meta.url)`;
  if (count(body, urlLive) !== 1) throw new Error(name + " GUARD url count " + count(body, urlLive));
  body = body.split('"../lib/').join('"../../../plugins/pipeline-core/lib/').split(urlLive).join(`new URL("../../../plugins/pipeline-core/hooks/${name}.mjs", import.meta.url)`);
  writeFileSync(join(here, `${name}.body.mjs`), body, "utf8");
  writeFileSync(join(here, `${name}.f.test.mjs`), entry(name + ".mjs", `${name}.body.mjs`), "utf8");
  const leftovers = [...body.matchAll(/"\.\.?\/[^"]*"|import\.meta\.url/gu)].map((m) => m[0]).filter((v) => !v.includes("plugins/pipeline-core")).slice(0, 12);
  bodies.push({ name, libImports: libN, expectedLibImports: nLib, leftovers });
}

// ---- probe (child process, post-image served under the live URL) ----
const testText = readFileSync(join(repo, TRANCHE, "hooks/guard-push.test.mjs"), "utf8");
const cut = (a, b) => testText.slice(testText.indexOf(a), testText.indexOf(b));
const pgmCode = cut("const PGM_PUSH =", "  for (const [id, label, command] of PGM_ADMITTED)") + cut("const PGM_REFUSED = [", "  for (const [id, label, command] of PGM_REFUSED)") + "\nreturn { PGM_ADMITTED, PGM_REFUSED };";
const { PGM_ADMITTED, PGM_REFUSED } = new Function(pgmCode)();
const X = "$";
const adversarial = [
  ['git commit -m "(x)"; git push origin main', true],
  ['git commit -m "(x)" && git push origin main', true],
  ['git commit -m "' + X + '{X:=git push origin main}' + X + '(eval ' + X + 'X)"', true],
  ['git commit -m "' + X + '(X=git;' + X + 'X push origin main)"', true],
  ['git commit -m "' + X + '(sudo git push origin main)"', true],
  ['git commit -m "' + X + '(xargs git push origin main)"', true],
  ['git commit -m "' + X + '(env git push origin main)"', true],
  ['git commit -m "' + X + '(command git push origin main)"', true],
  ['git commit -m "' + X + '(git --no-pager push origin main)"', true],
  ['git log --grep="' + X + '(git -C . push origin main)"', true],
  ['git commit -m "' + X + '(echo ' + X + '(git push origin main))"', true],
  ['git status ' + X + '(git push origin main)', true],
  ['git commit -m "(x)" # git push origin main', true],
  ["git commit -q -F - <<EOF\nfix: (x)\nEOF", true],
  ["git -c alias.ps='!git push origin main' ps -- \"(x)\"", true],
  ["git status 'unterminated (x)", true],
  ['git grep -n -e "\\(a\\|b\\)" -- README.md', true],
  ['git commit -m "a)"', true],
  ['git commit -m "' + X + '(date)" ; git push origin main', true],
  ["bash -c 'git status \"(x)\"'", true],
  ['git push origin "main:refs/heads/f(x)"', true],
  ['git commit -m "' + X + '(date)"', false],
  ['git diff "' + X + '(git merge-base HEAD main)" -- README.md', false],
  ['git commit -m "x (y)" --amend', false],
];
writeFileSync(join(here, "probe.mjs"), `import { commandIsGitPush, hasFailClosedMarker } from "../../../plugins/pipeline-core/lib/git-cmd.mjs";
const input = JSON.parse(process.argv[2]);
const wrong = { admitted: [], refused: [], adversarial: [] };
for (const [id, , command] of input.admitted) if (commandIsGitPush(command) !== false) wrong.admitted.push(id);
for (const [id, , command] of input.refused) if (commandIsGitPush(command) !== true) wrong.refused.push(id);
for (const [command, expected] of input.adversarial) if (commandIsGitPush(command) !== expected) wrong.adversarial.push(command);
console.log(JSON.stringify({ exportsHasFailClosedMarker: typeof hasFailClosedMarker, wrong, counts: { admitted: input.admitted.length, refused: input.refused.length, adversarial: input.adversarial.length } }));
`, "utf8");
const env = { ...process.env, NODE_OPTIONS: ("--import=" + new URL("./register.mjs", "file:///" + here.replaceAll("\\", "/") + "/").href) };
const probe = spawnSync(process.execPath, [join(here, "probe.mjs"), JSON.stringify({ admitted: PGM_ADMITTED, refused: PGM_REFUSED, adversarial })], { cwd: repo, env, encoding: "utf8", timeout: 120000 });
const libTest = spawnSync(process.execPath, ["--test", "plugins/pipeline-core/lib/git-cmd.test.mjs"], { cwd: repo, env, encoding: "utf8", timeout: 400000, maxBuffer: 64 * 1024 * 1024 });
const notOk = (libTest.stdout ?? "").split("\n").filter((l) => /^\s*not ok /u.test(l) || /^# (tests|pass|fail) /u.test(l)).slice(0, 60);
console.log(JSON.stringify({
  baseBlob, base: { sha256: sha(live), bytes: Buffer.byteLength(live), lines: lines(live) },
  post: { sha256: sha(text), bytes: Buffer.byteLength(text), lines: lines(text) }, insertedLines: lines(text) - lines(live),
  bodies,
  probe: { status: probe.status, stdout: (probe.stdout ?? "").trim().slice(0, 3000), stderr: (probe.stderr ?? "").slice(0, 600) },
  libTest: { status: libTest.status, summary: notOk, stderr: (libTest.stderr ?? "").slice(0, 400) },
}, null, 2));
