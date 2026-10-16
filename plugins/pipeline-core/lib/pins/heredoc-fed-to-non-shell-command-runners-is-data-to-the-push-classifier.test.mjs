// Regression pin: ALF-C-P7-03 / AC-199
// Item: pipeline.heredoc-fed-to-non-shell-command-runners-is-data-to-the-push-classifier (PO decision AF).
// Acceptance: a heredoc / here-string received by a command RUNNER (xargs, at, batch, ed, ex, sqlite3, php, lua,
// `awk -f -`, perl/python/ruby/node reading stdin) is no longer data: `commandIsGitPush` routes it to guard-push
// when the runner's argv joined with a body line (or the body itself) can push; data heredocs to any other command
// stay data; the busybox/unlisted-receiver boundary is documented in the function header.
// The real exported classifier is exercised; no behavior is mocked. The RED proof runs the same positive cases against a
// scratch mirror of git-cmd.mjs with the decision-AF rule removed (production is never edited).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { commandIsGitPush } from "../git-cmd.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const sourcePath = path.join(here, "..", "git-cmd.mjs");
const repoRoot = path.resolve(here, "..", "..", "..", "..");

const POSITIVE = [
  ["xargs git <<EOF\npush origin main\nEOF", "xargs argv + body line = git push origin main (the item's own example)"],
  ['xargs git <<< "push origin main"', "xargs fed a here-string"],
  ["at now <<EOF\ngit push origin main\nEOF", "at hands the body to a shell as a job"],
  ["batch <<EOF\ngit push origin main\nEOF", "batch hands the body to a shell as a job"],
  ["ed <<EOF\n!git push origin main\nw\nq\nEOF", "ed runs !command"],
  ["ex <<EOF\n!git push origin main\nq\nEOF", "ex runs !command"],
  ["sqlite3 <<EOF\n.shell git push origin main\nEOF", "sqlite3 .shell"],
  ['php <<EOF\n<?php system("git push origin main");\nEOF', "php program shells out"],
  ['lua <<EOF\nos.execute("git push origin main")\nEOF', "lua program shells out"],
  ['awk -f - <<EOF\nBEGIN { system("git push origin main") }\nEOF', "awk -f - reads program from stdin"],
  ['awk -f /dev/stdin <<EOF\nBEGIN { system("git push origin main") }\nEOF', "awk -f /dev/stdin"],
  ["/usr/bin/xargs git <<EOF\npush origin main\nEOF", "receiver found through a path"],
  ["sudo xargs git <<EOF\npush origin main\nEOF", "receiver found behind a wrapper word"],
  ["cat <<EOF | xargs git\npush origin main\nEOF", "heredoc piped into the runner"],
  ["python - <<EOF\nimport os; os.system('git push origin main')\nEOF", "interpreter reading stdin (decision X/AF)"],
];

const NEGATIVE = [
  ["git commit -F - <<EOF\nfix: update the push docs\nEOF", "decision X: git commit -F - receives data"],
  ["cat <<EOF > notes.txt\ngit push origin main\nEOF", "data heredoc to cat stays data"],
  ["xargs echo <<EOF\nhello\nEOF", "runner but nothing git-related"],
  ["sqlite3 db.sqlite <<EOF\nselect 1;\nEOF", "plain SQL"],
  ["awk NF <<EOF\nhello world\nEOF", "awk input heredoc is data, not a program"],
  ["grep push <<EOF\nhello\nEOF", "other command stays data"],
];

test("every decision-AF runner heredoc shape is a push candidate", () => {
  for (const [cmd, why] of POSITIVE) assert.equal(commandIsGitPush(cmd), true, `${why}: ${JSON.stringify(cmd)}`);
});

test("heredocs to non-runner commands and git-free runner programs stay data", () => {
  for (const [cmd, why] of NEGATIVE) assert.equal(commandIsGitPush(cmd), false, `${why}: ${JSON.stringify(cmd)}`);
});

test("accepted false positive of the rule is still documented as such (runner text merely mentioning git)", () => {
  assert.equal(commandIsGitPush("xargs echo <<EOF\ngit status\nEOF"), true);
});

test("the busybox / unlisted receiver boundary stays documented in the classifier header", () => {
  const source = fs.readFileSync(sourcePath, "utf8");
  assert.match(source, /busybox/u);
  assert.match(source, /an extension of the receiver list is a new PO decision/u);
});

test("RED proof: the same positive cases fail against a scratch mirror without the decision-AF rule", async () => {
  const source = fs.readFileSync(sourcePath, "utf8");
  const rule = "  if (hasRunnerHeredocReceiver(cmd) && hasRunnerGitWord(cmd)) return true;\n";
  assert.ok(source.includes(rule), "decision-AF rule line must exist in the production source");
  const dir = path.join(repoRoot, "scratch", `alf-c-p7-03-${process.pid}`);
  fs.mkdirSync(dir, { recursive: true });
  try {
    const mirror = path.join(dir, "git-cmd-mirror.mjs");
    fs.writeFileSync(mirror, source.replace(rule, ""));
    const mod = await import(pathToFileURL(mirror).href);
    const stillCaught = POSITIVE.filter(([cmd]) => mod.commandIsGitPush(cmd) === true).length;
    const flipped = POSITIVE.length - stillCaught;
    // Cases the pre-existing shell-marker rule already catches (python stdin, wrapper words) may remain true; the
    // pure runner cases must flip to false, proving the positive cases examine the AF rule.
    assert.ok(flipped >= 8, `expected the AF-only cases to turn red in the mirror, flipped=${flipped}`);
    assert.equal(mod.commandIsGitPush(POSITIVE[0][0]), false, "the item's own xargs example is unrouted without the rule");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
