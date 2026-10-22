#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * git-cmd-push-classifier.test.mjs -- the second half of the commandIsGitPush classifier pins, split out of
 * git-cmd.test.mjs (architecture boundary ratchet: split it rather than raise it). The cases moved here
 * verbatim are the Q12-C, Q12-AF, Q12-VB, Q12-HD, Q12-EXE, Q12-CQ, GITCLS, GREP-PINS and AC238 tables; every
 * case id is unchanged. git-cmd.test.mjs keeps the helper unit cases and the earlier push-classifier tables.
 *
 * Run:   node plugins/pipeline-core/lib/git-cmd-push-classifier.test.mjs
 * Exit:  0 = all cases pass · 1 = at least one case failed (failure list on stdout).
 */
import { commandIsGitPush } from "./git-cmd.mjs";

let pass = 0;
const failures = [];
function record(id, ok, detail) {
  if (ok) {
    pass++;
    console.log(`PASS  ${id}`);
  } else {
    failures.push(`${id}: ${detail}`);
    console.log(`FAIL  ${id} -- ${detail}`);
  }
}

// Same table runner as git-cmd.test.mjs; `expected` is the classification the decided contract demands.
function recordQ12Table(prefix, expected, table) {
  for (const [cmd, why] of table) {
    const out = commandIsGitPush(cmd);
    record(`${prefix} ${JSON.stringify(cmd)}  ${why}`, out === expected, `cmd=${JSON.stringify(cmd)} expected=${expected} out=${out}`);
  }
}

// ---- commandIsGitPush: the four bypasses the Q12 Critic found in round 1, both sides (Q12-T4) ----
// Test-only pin, written BEFORE the fix (QG-04): on the classifier as committed, the four candidate tables below are RED and the
// control table is GREEN. Contract: PO decisions J, S and X, specs/sprint-alfred-epic/plans/po-decisions-2026-10-07.md rows J,
// S and X; findings F1-F4 of specs/sprint-alfred-epic/evidence/critic-2026-10-07/q12-round1.md. The second column of every row
// states the bash semantics that make the command a push (or, in the control table, data). Every command text below is DATA: it
// is handed to `commandIsGitPush` and never executed. Where a shape needs a backslash it is built at runtime from
// String.fromCharCode(92), so the source carries no escaping that could be misread; the other strings are ordinary JS strings.
// Every case id in this block starts with Q12-C: so one search over a run's output lists the state of all of them.
const Q12C_BS = String.fromCharCode(92);

// F1 (regression of d9b4bf031; decisions B and S): a git word spelled with quote characters is still the git word once bash
// removes the quotes, and an expansion after it can still produce the push word, so these are candidates.
const Q12C_F1_QUOTED_GIT_WORD_EXPANSION_TABLE = [
  ['g"i"t $(echo push) origin main', "bash removes the quotes so the command word is git; the $( ) substitution then yields the word push"],
  ['g"i"t `echo push` origin main', "bash removes the quotes so the command word is git; the backtick substitution then yields the word push"],
  ['g"i"t ${X:-push} origin main', "bash removes the quotes so the command word is git; the parameter expansion falls back to the word push"],
  ["g''it $(echo push) origin main", "an empty quote pair inside the word is removed by bash, so the command word is git; the substitution yields push"],
];
recordQ12Table("Q12-C: F1-QUOTED-GIT-WORD-EXPANSION-CANDIDATE", true, Q12C_F1_QUOTED_GIT_WORD_EXPANSION_TABLE);

// F2 (decision S, "a git word formed by brace expansion counts as a git word"): bash performs brace expansion BEFORE quote
// removal, so an alternative that carries quoting or a backslash is spelled out as separate words and then unquoted. Each
// command below becomes `git push origin main`, so each is a candidate.
const Q12C_F2_BRACE_QUOTED_ALTERNATIVE_TABLE = [
  ['{g"i"t,push} origin main', "brace expansion yields the words g\"i\"t and push; quote removal turns the first into git"],
  ["{g''it,push} origin main", "brace expansion yields the words g''it and push; quote removal turns the first into git"],
  ['{"g"it,push} origin main', "brace expansion yields the words \"g\"it and push; quote removal turns the first into git"],
  ["{g" + Q12C_BS + "it,push} origin main", "brace expansion yields the words g<backslash>it and push; the backslash escapes a plain letter, so the first word is git"],
];
recordQ12Table("Q12-C: F2-BRACE-QUOTED-ALTERNATIVE-CANDIDATE", true, Q12C_F2_BRACE_QUOTED_ALTERNATIVE_TABLE);

// F3 (decision X, the shell-receiver side): a pipe at the end of a line continues the pipeline on the next command line, and a
// here-document body is read after the line that opened it. So the body below reaches the `sh` that follows the terminator, and
// the shell runs it. The units of the command are separated by line breaks, but the pipeline is one command: a candidate.
const Q12C_F3_PIPELINE_ACROSS_LINE_BREAK_TABLE = [
  ["cat <<EOF |\ngit push origin main\nEOF\nsh", "cat forwards the body through the line-continued pipe into sh, which runs the body as commands"],
];
recordQ12Table("Q12-C: F3-PIPELINE-ACROSS-LINE-BREAK-CANDIDATE", true, Q12C_F3_PIPELINE_ACROSS_LINE_BREAK_TABLE);

// F4 (decision X, the shell-receiver side): a receiver named by a quoted path is still the receiver; the quotes only keep a
// space inside one word. The here-document body is the program that bash (or sh) reads from its standard input and runs.
const Q12C_F4_QUOTED_PATH_RECEIVER_TABLE = [
  ['"/c/Program Files/git/bin/bash" <<EOF\ngit push origin main\nEOF', "the double-quoted word is one path naming bash, which runs the here-document body"],
  ["'/c/Program Files/Git/bin/sh' <<EOF\ngit push origin main\nEOF", "the single-quoted word is one path naming sh, which runs the here-document body"],
];
recordQ12Table("Q12-C: F4-QUOTED-PATH-RECEIVER-CANDIDATE", true, Q12C_F4_QUOTED_PATH_RECEIVER_TABLE);

// Controls (decision X, the data side): whatever the fix does for F1-F4, a here-document that no shell or interpreter receives
// stays data and stays NOT a candidate. These are GREEN before the fix and must stay GREEN after it.
const Q12C_CONTROL_DATA_HEREDOC_TABLE = [
  ["git commit -F - <<'EOF'\nfix: push docs\nEOF", "git commit reads its message from the here-document: the body is data, a single-quoted delimiter so nothing in it is expanded"],
  ["cat <<EOF |\ntr a-z A-Z\nEOF", "cat only forwards the here-document body as data; no shell or interpreter receives it, the only command named after the pipe is tr"],
];
recordQ12Table("Q12-C: CONTROL-DATA-HEREDOC-NOT-CANDIDATE", false, Q12C_CONTROL_DATA_HEREDOC_TABLE);

// ---- commandIsGitPush: heredocs received by command runners, both sides (PO decision AF, Q12-T5) ----
// Test-only pin, written BEFORE the classifier fix (QG-04). Contract: PO decision AF (2026-10-07), recorded in
// specs/sprint-alfred-epic/plans/po-decisions-2026-10-07.md row AF, which extends the receiver list of decision X (row X): a
// here-document (`<<`, `<<-`) or here-string (`<<<`) received by a command RUNNER (a command that executes its input as
// commands, or as a program that can run commands) is treated like one received by a shell. The body is classified, and the
// command is a push candidate when the body, or the runner's argv joined with a body line (for example `xargs git` plus the
// body line `push origin main`), can push. Data here-documents to any other command stay data (decision X). Backlog item:
// backlog/items/2026-10-07-heredoc-fed-to-non-shell-command-runners-is-data-to-the-push-classifier.md.
// The second column of every row states the bash (or runner) semantics that make the command a push (or, in the control table,
// data). Every command text below is DATA: it is handed to `commandIsGitPush` and never executed. The candidate tables fail on a
// classifier that treats a heredoc fed to a non-shell command as plain data; the control table fails on a classifier that treats
// every heredoc as a marker. Every case id in this block starts with Q12-AF: so one search over a run's output lists all of them.

// The runner's argv and the body line together form the push: xargs appends the words it reads from standard input to its
// command, so `xargs git` plus the body line `push origin main` runs `git push origin main`. The here-string feeds the same words.
const Q12AF_ARGV_JOINED_TABLE = [
  ["xargs git <<EOF\npush origin main\nEOF", "xargs reads the words push origin main from the here-document and runs git push origin main"],
  ["xargs -n3 git <<EOF\npush origin main\nEOF", "xargs -n3 passes at most three words per run: it runs git push origin main with the three body words"],
  ['xargs git <<< "push origin main"', "the here-string supplies the same words on xargs standard input: xargs runs git push origin main"],
];
recordQ12Table("Q12-AF: ARGV-JOINED-RUNNER-CANDIDATE", true, Q12AF_ARGV_JOINED_TABLE);

// Schedulers read a command script from standard input and run it with a shell.
const Q12AF_SCHEDULER_TABLE = [
  ["at now <<EOF\ngit push origin main\nEOF", "at reads the here-document as a job script and runs it with sh at the given time (now): it runs git push origin main"],
  ["batch <<EOF\ngit push origin main\nEOF", "batch reads the here-document as a job script and runs it with sh when the load permits: it runs git push origin main"],
];
recordQ12Table("Q12-AF: SCHEDULER-CANDIDATE", true, Q12AF_SCHEDULER_TABLE);

// Line editors read editor commands from standard input; a line starting with ! runs the rest as a shell command.
const Q12AF_LINE_EDITOR_TABLE = [
  ["ed -s <<EOF\n!git push origin main\nq\nEOF", "ed reads editor commands from the here-document; the ! command runs git push origin main in a shell, then q quits"],
  ["ex -s <<EOF\n!git push origin main\nEOF", "ex reads editor commands from the here-document; the ! command runs git push origin main in a shell"],
];
recordQ12Table("Q12-AF: LINE-EDITOR-CANDIDATE", true, Q12AF_LINE_EDITOR_TABLE);

// The sqlite3 shell reads SQL and dot-commands from standard input; the .shell dot-command runs the rest in a shell.
const Q12AF_SQLITE3_TABLE = [
  ["sqlite3 <<EOF\n.shell git push origin main\nEOF", "the sqlite3 shell reads dot-commands from the here-document; .shell runs git push origin main"],
];
recordQ12Table("Q12-AF: SQLITE3-CANDIDATE", true, Q12AF_SQLITE3_TABLE);

// Scripting languages whose program is the here-document: php with no file argument, lua with no script, awk with -f - or
// -f /dev/stdin all read the program from standard input, and the program calls the language's own shell-out function.
const Q12AF_SCRIPT_LANGUAGE_TABLE = [
  // body contains marker characters — pins the end state, not the receiver rule alone
  ['php <<EOF\n<?php system("git push origin main");\nEOF', "php reads its program from standard input; system() runs git push origin main"],
  ['lua <<EOF\nos.execute("git push origin main")\nEOF', "lua reads its program from standard input; os.execute runs git push origin main"],
  ['awk -f - <<EOF\nBEGIN { system("git push origin main") }\nEOF', "awk -f - reads the program from standard input; the BEGIN block calls system(), which runs git push origin main"],
  ['awk -f /dev/stdin <<EOF\nBEGIN { system("git push origin main") }\nEOF', "awk -f /dev/stdin reads the program from standard input; the BEGIN block calls system(), which runs git push origin main"],
];
recordQ12Table("Q12-AF: SCRIPT-LANGUAGE-CANDIDATE", true, Q12AF_SCRIPT_LANGUAGE_TABLE);

// The interpreters decision X already names, reading the program from - (standard input): the program shells out to git push.
const Q12AF_INTERPRETER_STDIN_TABLE = [
  // body contains marker characters — pins the end state, not the receiver rule alone
  ['perl - <<EOF\nsystem("git push origin main")\nEOF', "perl - reads the program from standard input; system() runs git push origin main"],
  ['python - <<EOF\nimport os; os.system("git push origin main")\nEOF', "python - reads the program from standard input; os.system runs git push origin main"],
  ["ruby - <<EOF\n`git push origin main`\nEOF", "ruby - reads the program from standard input; the backtick literal runs git push origin main"],
  ['node - <<EOF\nrequire("child_process").execSync("git push origin main")\nEOF', "node - reads the program from standard input; execSync runs git push origin main"],
];
recordQ12Table("Q12-AF: INTERPRETER-STDIN-CANDIDATE", true, Q12AF_INTERPRETER_STDIN_TABLE);

// bodies contain no fail-closed marker characters, so these rows prove the AF receiver rule, not the marker
const Q12AF_MARKER_FREE_BODY_TABLE = [
  ['lua <<EOF\nos.execute "git push origin main"\nEOF', "marker-free body: lua reads its program from standard input; os.execute runs git push origin main"],
  ['perl - <<EOF\nsystem "git push origin main"\nEOF', "marker-free body: perl - reads the program from standard input; system runs git push origin main"],
  ['ruby - <<EOF\nsystem "git push origin main"\nEOF', "marker-free body: ruby - reads the program from standard input; system runs git push origin main"],
  ['perl <<EOF\nsystem "git push origin main"\nEOF', "marker-free body: perl with no - and no file argument reads its program from standard input; system runs git push origin main"],
];
recordQ12Table("Q12-AF: MARKER-FREE-BODY-CANDIDATE", true, Q12AF_MARKER_FREE_BODY_TABLE);

// Controls (decision X, the data side, kept by decision AF): a here-document that no shell, interpreter or command runner runs
// as commands stays data and stays NOT a candidate, even when it names the push phrase.
const Q12AF_CONTROL_DATA_HEREDOC_TABLE = [
  ["xargs echo <<EOF\nhello\nEOF", "xargs runs echo with the word hello: nothing git-related is run, the body is only an argument"],
  ["sqlite3 db.sqlite <<EOF\nselect 1;\nEOF", "sqlite3 runs the SQL statement select 1; against db.sqlite: plain SQL, no .shell dot-command"],
  // `{` on argv is a fail-closed marker regardless of the heredoc (option B; decision S accepted that cost), so the previous row was a briefing error
  ["awk NF <<EOF\ngit push origin main\nEOF", "the awk program NF is on argv; the here-document is only its input data, which awk filters and never runs"],
  ["git commit -F - <<'EOF'\nfix: push docs\nEOF", "git commit reads its message from the here-document: the body is data, a single-quoted delimiter so nothing in it is expanded"],
];
recordQ12Table("Q12-AF: CONTROL-DATA-HEREDOC-NOT-CANDIDATE", false, Q12AF_CONTROL_DATA_HEREDOC_TABLE);

// ---- commandIsGitPush: vim/vi/ex ex-mode and busybox shell applets fed a heredoc (Q12-T11) ----
// Test-only pin, written BEFORE any classifier change (QG-04); candidate rows are expected RED, controls GREEN. Backlog item:
// backlog/items/2026-10-07-vim-es-and-busybox-heredoc-runners-are-data-to-the-push-classifier.md.
// Every command text below is DATA: it is handed to `commandIsGitPush` and never executed. Case ids start with Q12-VB.
const Q12VB_VIM_BUSYBOX_TABLE = [
  ["vim -es <<EOF\n!git push origin main\nEOF", "vim -es runs in ex mode reading commands from the here-document; the ! command runs git push origin main in a shell"],
  ["vi -e <<EOF\n!git push origin main\nEOF", "vi -e runs in ex mode reading commands from the here-document; the ! command runs git push origin main in a shell"],
  ["ex -s <<EOF\n!git push origin main\nEOF", "ex -s reads editor commands from the here-document; the ! command runs git push origin main in a shell"],
  ["vim -E -s <<EOF\n!git push origin main\nEOF", "vim -E -s runs in ex mode silently reading commands from the here-document; the ! command runs git push origin main"],
  ["busybox sh <<EOF\ngit push origin main\nEOF", "busybox sh is the shell applet reading the here-document as commands: it runs git push origin main"],
  ["busybox ash <<'EOF'\ngit push origin main\nEOF", "busybox ash is a shell applet reading the here-document as commands: it runs git push origin main"],
];
recordQ12Table("Q12-VB: VIM-BUSYBOX-CANDIDATE", true, Q12VB_VIM_BUSYBOX_TABLE);

const Q12VB_CONTROL_TABLE = [
  ["vim -es <<EOF\n:wq\nEOF", "vim -es reads ex commands from the here-document; :wq only writes and quits, nothing runs git"],
  ["busybox ls <<EOF\ngit push origin main\nEOF", "busybox ls is not a shell applet: the here-document is only unused standard input, nothing runs git push"],
];
recordQ12Table("Q12-VB: CONTROL-NOT-CANDIDATE", false, Q12VB_CONTROL_TABLE);

// ---- commandIsGitPush: a push that follows a heredoc opener on the same line (Q12-T7) ----
// Test-only pin, written BEFORE any classifier change (QG-04); at the commit that adds it several rows are expected RED, and
// the per-row state is recorded in the evidence of the dispatch that added it. Contract: PO decisions X and AF,
// specs/sprint-alfred-epic/plans/po-decisions-2026-10-07.md rows X and AF. A here-document (`<<`, `<<-`) or here-string (`<<<`)
// fed to a command that is not a shell, interpreter or command runner is data (row X): the body is read after the line that
// opened it and belongs to the FIRST command only. A control operator on the opener line (`&&`, `;`, `||`, `&`) then starts a
// separate command, and a push that follows the opener on the same line, or on the line after the terminator, is a real
// push. The second column of every row states the bash semantics. Every command text below is DATA: it is handed to
// `commandIsGitPush` and never executed. Every case id in this block starts with Q12-HD: so one search over a run's output
// lists all of them. The data side of the same shapes (no push anywhere) is already held by the Q12-X, Q12-C and Q12-AF
// controls above, so this table is the candidate side only.
const Q12HD_PUSH_AFTER_HEREDOC_OPENER_TABLE = [
  ["cat <<EOF && git push origin main\nbody\nEOF", "the heredoc only feeds cat; && then runs git push origin main as its own command"],
  ["cat <<EOF; git push origin main\nbody\nEOF", "the heredoc only feeds cat; the semicolon then runs git push origin main as its own command"],
  ["cat <<'EOF' || git push origin main\nbody\nEOF", "the heredoc only feeds cat; || runs git push origin main as its own command when cat fails"],
  ["git commit -F - <<EOF && git push origin main\nmsg\nEOF", "the heredoc only feeds git commit; && then runs git push origin main as its own command"],
  ["cat <<-EOF & git push origin main\n\tbody\n\tEOF", "the tab-stripping heredoc only feeds cat; & backgrounds cat and runs git push origin main as its own command"],
  ['cat <<< "x" && git push origin main', "the here-string only feeds cat; && then runs git push origin main as its own command"],
  ["git push origin main <<EOF\nbody\nEOF", "the push itself carries the heredoc; git push origin main runs and merely has an unused standard input"],
  ["cat <<EOF\nbody\nEOF\ngit push origin main", "the heredoc ends at the terminator; the next line runs git push origin main as its own command"],
];
recordQ12Table("Q12-HD: PUSH-AFTER-HEREDOC-OPENER", true, Q12HD_PUSH_AFTER_HEREDOC_OPENER_TABLE);

// ---- commandIsGitPush: a git.exe (or other git spelling) push that is not the first command (Q12-T8) ----
// Test-only pin, written BEFORE any classifier change (QG-04); at the commit that adds it several rows are expected RED, and
// the per-row state is recorded in the evidence of the dispatch that added it. Contract: PO decision Q12 option B, "fail-closed
// marker" (specs/sprint-alfred-epic/plans/po-decisions-2026-10-06.md row Q12). The executable word of a git command may be spelled
// git, git.exe, GIT.EXE, a quoted Windows path ending in git.exe, or a POSIX path ending in git; the same spelling that is already a
// candidate as the FIRST command of a line (Q12 and GPGL tables above) must also be a candidate when it follows a control operator
// (`&&`, `;`, `||`, `|`) or a heredoc opener on the same line. The second column of every row states the bash semantics. Every
// command text below is DATA: it is handed to `commandIsGitPush` and never executed. Every case id in this block starts with
// Q12-EXE: so one search over a run's output lists all of them.
const Q12EXE_NEGATIVE_ROWS = [
  ["echo ok && xgit.exe push origin main", "xgit.exe is a different program; no git command runs"],
  ["echo ok && git.exe.bak push origin main", "git.exe.bak is a different program; no git command runs"],
  ["echo ok && gitk push origin main", "gitk is a different program; no git command runs"],
];
const Q12EXE_NON_LEADING_GIT_EXE_PUSH_TABLE = [
  ["echo ok && git.exe push origin main", "echo succeeds; && then runs git.exe push origin main as its own command"],
  ["echo ok; git.exe push origin main", "the semicolon ends echo; git.exe push origin main then runs as its own command"],
  ["true || git.exe push origin main", "true succeeds so || would skip it, but git.exe push origin main is still a command the shell may run"],
  ["echo ok | git.exe push origin main", "each pipeline stage is its own command; git.exe push origin main runs as the second stage with echo output on its standard input"],
  ["cat <<EOF && git.exe push origin main\nbody\nEOF", "the heredoc only feeds cat; && then runs git.exe push origin main as its own command"],
  ["echo ok && GIT.EXE push origin main", "on a case-insensitive file system (Windows) GIT.EXE resolves to git.exe; the second command then pushes"],
  ['echo ok && "C:/Program Files/Git/cmd/git.exe" push origin main', "the double-quoted word is one path naming git.exe; the second command pushes"],
  ["echo ok && /usr/bin/git push origin main", "an absolute POSIX path ending in git is the executable of the second command, which pushes"],
  ["echo ok && git.exe -C . push origin main", "git.exe with a -C option before the subcommand; the second command still runs push origin main"],
];
recordQ12Table("Q12-EXE: NON-LEADING-GIT-EXE-PUSH", true, Q12EXE_NON_LEADING_GIT_EXE_PUSH_TABLE);
recordQ12Table("Q12-EXE: NON-GIT-LOOKALIKE", false, Q12EXE_NEGATIVE_ROWS);

// ---- commandIsGitPush: comments and quote characters that carry a push bypass (Q12-T9) ----
// Test-only pin, written BEFORE any classifier change (QG-04); several candidate rows are expected RED at the commit that adds it,
// and the per-row state is recorded in the evidence of the dispatch that added it. Contract: PO decision Q12 option B,
// "fail-closed marker". A comment (# at a word start) or a quote character inside a comment or heredoc body must not hide a later
// line that runs a push, and an unbalanced quote inside a comment must not swallow the lines after it. Every command text below is
// DATA: it is handed to `commandIsGitPush` and never executed. Every case id starts with Q12-CQ so one search lists all of them.
const Q12CQ_COMMENTS_AND_QUOTE_CHARS_TABLE = [
  ["cat <<EOF | # c\ngit push origin main\nEOF\nsh", "the heredoc body feeds cat, whose output pipes into sh after the terminator; sh runs git push origin main"],
  ["cat <<EOF |\ngit push origin main\nEOF\n# c\nsh", "the pipe continues past the heredoc and the comment line; sh receives the body and runs git push origin main"],
  ["cat <<EOF |   # trailing comment\n\ngit push origin main\nEOF\nbash", "a trailing comment after the pipe and a blank line; bash receives the body and runs git push origin main"],
  ["xargs git <<EOF | # c\npush origin main\nEOF", "the heredoc body becomes xargs arguments for git, so git push origin main runs; the comment does not change that"],
  ["cat <<EOF\ndon't\nEOF\ng\"i\"t $(echo push) origin main", "the apostrophe is heredoc data; after the terminator g\"i\"t is git and the substitution yields push"],
  ["cat <<EOF\ndon't\nEOF\n{g\"i\"t,push} origin main", "the apostrophe is heredoc data; after the terminator brace expansion yields git push origin main"],
  ["# don't\ng\"i\"t $(echo push) origin main", "the first line is a comment, so its apostrophe opens no quote; line two runs git push origin main"],
  ["true # don't\ng\"i\"t $(echo push) origin main", "the comment starts at the word-initial # so its apostrophe opens no quote; line two runs git push origin main"],
  ["# x\"\ng\"i\"t $(echo push) origin main", "the double quote sits inside a comment and opens no quote; line two runs git push origin main"],
  ["echo \"it's\" # it's\ng''it push origin main", "the apostrophe in the double quotes and in the comment open no quote; g''it is git on line two and pushes"],
  // unterminated single quote: bash refuses the line; fail-closed → candidate (decisions B/S)
  ["echo '# don't' && git status", "the quote is unterminated so bash refuses the line and the classifier fails closed"],
];
recordQ12Table("Q12-CQ: COMMENTS-AND-QUOTE-CHARS", true, Q12CQ_COMMENTS_AND_QUOTE_CHARS_TABLE);
const Q12CQ_CONTROL_TABLE = [
  ["# git push origin main", "a comment only; no command runs"],
];
recordQ12Table("Q12-CQ: CONTROL-NOT-CANDIDATE", false, Q12CQ_CONTROL_TABLE);

// ---- GITCLS-T: env -S strings and editor bang commands ------------------------------------
// Backlog 2026-10-08-git-push-classifier-misses-env-s-and-editor-bang. DATA only: handed to
// `commandIsGitPush`, never executed.
const GITCLS_T_PUSH_TABLE = [
  ["env -S 'git push origin main'", "env -S splits its single-quoted string into a command; git push runs"],
  ['env -S "git push origin main"', "env -S splits its double-quoted string into a command; git push runs"],
  ["env -S'git push origin main'", "attached form of env -S; git push runs"],
  ["vim -c '!git push origin main'", "vim -c with an ex bang runs git push through the shell"],
  ["vi -c '!git push origin main'", "vi -c with an ex bang runs git push through the shell"],
  ["nvim -c ':!git push origin main'", "nvim -c with a colon-prefixed ex bang runs git push through the shell"],
  ["vim +'!git push origin main'", "vim +cmd with an ex bang runs git push through the shell"],
];
for (const [cmd, why] of GITCLS_T_PUSH_TABLE) {
  const out = commandIsGitPush(cmd);
  record(`GITCLS-T: ${JSON.stringify(cmd)} is a push  ${why}`, out === true, `cmd=${JSON.stringify(cmd)} out=${out}`);
}
const GITCLS_T_NEGATIVE_TABLE = [
  ["env -S 'git status'", "env -S running git status is not a push"],
  ["vim -c ':wq' notes.txt", "an ex write-quit command is not a push"],
];
for (const [cmd, why] of GITCLS_T_NEGATIVE_TABLE) {
  const out = commandIsGitPush(cmd);
  record(`GITCLS-T: ${JSON.stringify(cmd)} is not a push  ${why}`, out === false, `cmd=${JSON.stringify(cmd)} out=${out}`);
}

// GITCLS-T2 (Critic GITCLS-D1, ruling 48): remaining ruling-42 forms and the env -S trailing-operand push.
const GITCLS_T2_PUSH_TABLE = [
  ["env --split-string='git push origin main'", "long attached form of env -S; git push runs"],
  ["env --split-string 'git push origin main'", "long separate form of env -S; git push runs"],
  ["env -iS 'git push origin main'", "clustered -iS short flags end in -S; git push runs"],
  ["view -c '!git push origin main'", "view -c with an ex bang runs git push through the shell"],
  ["ex -c '!git push origin main'", "ex -c with a bang runs git push through the shell"],
  ["vim --cmd '!git push origin main'", "vim --cmd with an ex bang runs git push through the shell"],
  ["vim -c'!git push origin main'", "attached form of vim -c; git push runs"],
  ["env -S 'git push \"unterminated'", "unparseable env -S payload fails closed"],
  ["env -Sgit push origin main", "ruling 48: the -S string joins the trailing operands, so git push runs"],
];
for (const [cmd, why] of GITCLS_T2_PUSH_TABLE) {
  const out = commandIsGitPush(cmd);
  record(`GITCLS-T2: ${JSON.stringify(cmd)} is a push  ${why}`, out === true, `cmd=${JSON.stringify(cmd)} out=${out}`);
}
const GITCLS_T2_NEGATIVE_TABLE = [
  ["env --split-string='git status'", "long env -S form running git status is not a push"],
  ["view -c ':q'", "an ex quit command is not a push"],
  ["env -S 'git log' --oneline", "env -S git log with a trailing operand is not a push"],
];
for (const [cmd, why] of GITCLS_T2_NEGATIVE_TABLE) {
  const out = commandIsGitPush(cmd);
  record(`GITCLS-T2: ${JSON.stringify(cmd)} is not a push  ${why}`, out === false, `cmd=${JSON.stringify(cmd)} out=${out}`);
}

// ---- GREP-PINS-R2: independent quoted non-push acceptance and fail-closed controls ----
// These strings are classifier inputs only; no shell command or substitution is executed.
const GREP_PINS_R2_ACCEPT_TABLE = [
  ["git grep '(alpha|beta)' -- a.mjs", "single-quoted regex parentheses and pipe are data"],
  ['git grep "(alpha|beta)" -- a.mjs', "double-quoted regex parentheses and pipe are data"],
  ["git log --grep='cost $5 {item} (note) `literal`'", "single-quoted marker characters are inert"],
  ["git show 'HEAD:dir/(item){x}$file'", "quoted revision path markers are data"],
  ["git diff -- 'dir/(item){x}$file'", "quoted pathspec markers are data"],
  ["git status -- 'dir/(item){x}$file'", "quoted status pathspec markers are data"],
  ["git commit -m 'cost $5 {item} (note) `literal`'", "single-quoted commit markers are inert"],
  ['git log --grep="$(date)"', "plain non-push substitution in double quotes"],
  ['git grep "$(git status)" -- a.mjs', "recursive plain read substitution"],
  ['git show "$(git log)"', "recursive log substitution"],
  ['git diff -- "$NAME"', "plain variable in double quotes"],
  ['git status -- "(dir){x}"', "double-quoted balanced parentheses and brace"],
];
// ALF-C-I19 re-base: these quoted-marker shapes were once expected plain (a quoted-data exemption that Ruling 157 rejected and
// the source no longer carries). Under the decided Q12 allowlist a marker anywhere with a git word is a candidate routed to
// guard-push, which refuses every non-exact push form; the accepted cost is a false positive, never a missed push.
recordQ12Table("GREP-PINS-R2: QUOTED-MARKER-CANDIDATE", true, GREP_PINS_R2_ACCEPT_TABLE);
const GREP_PINS_R2_DENY_TABLE = [
  ["git push origin main", "literal real push stays a candidate"],
  ["git push 'origin' 'main'", "quoted real push operands stay candidates"],
  ['git commit -m "$(git push origin main)"', "real push inside substitution stays a candidate"],
  ['git grep "`git push origin main`"', "push in backtick substitution stays a candidate"],
  ['git status -- "${NAME:-push}"', "parameter operator remains ambiguous"],
  ['git grep "$(date; git push origin main)"', "composed substitution remains a candidate"],
  ["git grep (alpha)", "unquoted parentheses remain ambiguous"],
  ["git log --grep={alpha,beta}", "unquoted brace expansion remains ambiguous"],
  ["git grep '$NAME' && git push origin main", "composition cannot gain the exemption"],
  ["git grep '(alpha)' > result.txt", "redirect cannot gain the exemption"],
  ["git grep '(alpha)' | cat", "pipeline cannot gain the exemption"],
  ["git grep '(alpha)' # comment", "comment cannot gain the exemption"],
  ["git grep '(alpha)'\ngit push origin main", "multiple lines cannot gain the exemption"],
  ["git -c alias.x=status x '(alpha)'", "global option and alias remain ambiguous"],
  ["git remote '(alpha)'", "push-capable subcommand is excluded"],
  ["git config '(alpha)'", "configuration subcommand is excluded"],
  ["git grep '(alpha)", "unterminated quote remains ambiguous"],
  ["bash -c 'git grep (alpha)'", "nested shell remains ambiguous"],
];
recordQ12Table("GREP-PINS-R2: DENY", true, GREP_PINS_R2_DENY_TABLE);

// ---- commandIsGitPush: redirect before the push word, nested quotes in a substitution, accepted false positives (AC-238) ----
// Pins the residual shapes of the backlog item push-classifier-misses-nested-quotes-and-redirect-before-push. Every command text
// is DATA handed to `commandIsGitPush`, never executed. Fail closed: a missed push is the failure, a false positive is accepted.
const AC238_REDIRECT_BEFORE_PUSH_TABLE = [
  ["git 2>&1 push origin main", "a fd-duplication redirect between git and the push word"],
  ["git >out push origin main", "an output redirect between git and the push word"],
  ["git <in push origin main", "an input redirect between git and the push word"],
  ["git 2>&1 --config-env=x=y push origin main", "a redirect followed by a global option before the push word"],
];
recordQ12Table("AC238-REDIRECT-BEFORE-PUSH", true, AC238_REDIRECT_BEFORE_PUSH_TABLE);
const AC238_NESTED_QUOTE_SUBSTITUTION_TABLE = [
  ['echo "$(echo "a"; git push origin main)"', "inner double quotes would end the outer span early for a naive scanner, hiding the push statement"],
  ['x="$(echo "a" && git push origin main)"', "the same nesting inside an assignment"],
];
recordQ12Table("AC238-NESTED-QUOTE-SUBSTITUTION", true, AC238_NESTED_QUOTE_SUBSTITUTION_TABLE);
// ACCEPTED false positives: benign, but routed to the push gate by design (fail closed). Pinned so a later narrowing is a
// deliberate decision, not a silent behaviour change.
const AC238_ACCEPTED_FALSE_POSITIVE_TABLE = [
  ['git diff "$(git merge-base HEAD main)"', "ACCEPTED false positive: git diff with a substituted merge-base"],
  ["git commit -m \"$(cat <<'EOF'\nfix: explain the git push gate\nEOF\n)\"", "ACCEPTED false positive: heredoc commit message inside a quoted substitution containing a boundary git word"],
];
recordQ12Table("AC238-ACCEPTED-FP", true, AC238_ACCEPTED_FALSE_POSITIVE_TABLE);

// ---- Summary ------------------------------------------------------------------------------
const total = pass + failures.length;
console.log(`\n${pass}/${total} cases passed.`);
if (failures.length > 0) {
  console.log("Failures:");
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
process.exit(0);
