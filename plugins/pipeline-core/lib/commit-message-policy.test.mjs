// SPDX-License-Identifier: SUL-1.0
/**
 * GIT-03 enforcement, unit level.
 *
 * The regression these exist for is concrete: 74 commits in one session carried
 * `Co-Authored-By: <provider>` and a session URL, 53 of them reached a public remote before
 * a human noticed by reading. CMP1 is that exact message.
 */
import { registerTestCaseCompletion } from "./test-case-completion.mjs";
import { after as afterTests } from "node:test";
const cases = [];
import assert from "node:assert/strict";

import {
  commitMessageFindings,
  commitTypeFindings,
  commitTypeFindingsForRange,
  finishedCommitMessageFindings,
  GIT01_COMMIT_TYPES,
  markerPolicyMode,
  parseCommitTrailerBlock,
  parseIntegrationTrailerBlock,
} from "./commit-message-policy.mjs";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let checks = 0;
const check = (label, fn) => { cases.push({ id: `CMP${String(cases.length + 1).padStart(3, "0")}`, name: label, run: async () => { await fn(); checks += 1; process.stdout.write(`ok ${label}\n`); } }); };
const codes = (result) => result.findings.map((f) => f.code).sort();

const CLEAN = "feat(x): do a thing\n\nWhy it matters.\n\nAI-Assisted: true\n";
const BOUND = "feat(x): do a thing\n\nWhy it matters.\n\nDispatch: NVA-CMP (goldfish)\nAI-Assisted: true\n";
const files = new Map();
const readFile = (path) => {
  if (!files.has(path)) throw new Error("ENOENT");
  return files.get(path);
};
const run = (cmd, options = {}) => commitMessageFindings(cmd, { readFile, ...options });

// CMP1 -- the actual regression, verbatim in shape.
check("CMP1 the provider co-author trailer that shipped 74 times is refused", () => {
  files.set("msg.txt", `${CLEAN}Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>\nClaude-Session: https://claude.ai/code/session_01Fx\n`);
  const result = run("git commit -F msg.txt");
  assert.equal(result.inspected, true);
  assert.deepEqual(codes(result), ["GIT-03-CORRELATION-TRAILER", "GIT-03-PROVIDER-COAUTHOR", "GIT-03-SESSION-URL"]);
});

// CMP2 -- keep the file route inspected for exceptional message content;
// ordinary commits use repeated -m and --trailer without a scratch file.
check("CMP2 a clean message via -F passes", () => {
  files.set("clean.txt", CLEAN);
  assert.deepEqual(codes(run("git commit -F clean.txt")), []);
});

check("CMP3 a clean inline message passes", () => {
  assert.deepEqual(codes(run('git commit -m "fix(y): tidy up" -m "AI-Assisted: true"')), []);
});

// A direct `--trailer` form is Git's own safe alternative to composing a
// multiline message through a shell pipeline.  The pre-tool inspection must
// reconstruct Git's final contiguous block, or GIT-03 itself forces needless
// scratch files and shell-grammar failures.
check("CMP3a Git trailers form one inspectable final provenance block", () => {
  const result = run('git commit -m "fix(y): tidy up" --trailer "AI-Assisted: true" --trailer "Dispatch: stage-0 (elephant)"', {
    requireMarker: true,
    requireDispatch: true,
  });
  assert.deepEqual(codes(result), []);
  assert.match(result.message, /\n\nAI-Assisted: true\nDispatch: stage-0 \(elephant\)$/u);
});

// The shell hands Git the decoded argv bytes for Bash's $'...' form.  PreTool
// receives the raw spelling, so the shared tokenizer must reconstruct that
// same final paragraph rather than reporting the two trailers as missing.
check("CMP3b a POSIX ANSI-C quoted final -m trailer block is accepted", () => {
  const result = run(String.raw`git commit -m "fix(y): tidy up" -m $'Why it matters.\n\nAI-Assisted: true\nDispatch: stage-0 (elephant)'`, {
    requireMarker: true,
    requireDispatch: true,
  });
  assert.deepEqual(codes(result), []);
  assert.match(result.message, /\n\nAI-Assisted: true\nDispatch: stage-0 \(elephant\)$/u);
});

check("CMP3c a Windows git.exe command stays copy-safe with native trailer switches", () => {
  const result = run('git.exe commit -m "fix(y): tidy up" -m "Why it matters." --trailer "AI-Assisted: true" --trailer "Dispatch: stage-0 (elephant)"', {
    requireMarker: true,
    requireDispatch: true,
  });
  assert.deepEqual(codes(result), []);
});

check("CMP3d a split final repeated -m block remains refused", () => {
  const result = run(String.raw`git commit -m "fix(y): tidy up" -m $'AI-Assisted: true\n\nDispatch: stage-0 (elephant)'`, {
    requireMarker: true,
    requireDispatch: true,
  });
  assert.deepEqual(codes(result), ["GIT-03-MARKER-MISSING"]);
});

// CMP4 -- a HUMAN co-author is legitimate and common. A rule that refused all co-authorship
// would be switched off by its users, so the pattern keys on the vendor token.
check("CMP4 a human co-author is not a violation", () => {
  assert.deepEqual(codes(run('git commit -m "feat: pair work" -m "Co-Authored-By: Jane Roe <jane@example.org>"')), []);
});

check("CMP5 a session URL anywhere in the body is refused, trailer or not", () => {
  assert.deepEqual(codes(run('git commit -m "see https://claude.ai/code/session_01Fx for context"')), ["GIT-03-SESSION-URL"]);
});

check("CMP6 a heredoc body is inspected", () => {
  const cmd = "git commit -F - <<'EOF'\nfeat: x\n\nCo-Authored-By: Codex <bot@openai.com>\nEOF";
  assert.deepEqual(codes(run(cmd)), ["GIT-03-PROVIDER-COAUTHOR"]);
});

// CMP7 -- the honest gap, asserted so it cannot be mistaken for coverage. An editor commit
// has no message at PreToolUse time; the result says "not looked at", not "clean".
check("CMP7 an editor commit is reported as uninspected, never as clean", () => {
  const result = run("git commit");
  assert.equal(result.inspected, false);
  assert.deepEqual(result.findings, []);
});

// CMP8 -- F3, 2026-08-06 Critic round. A `-F <path>` IS a named message source even when the
// caller's readFile refuses it (out of bounds, gone, unreadable): an agent's scratch
// directory is the ordinary place a commit message gets composed and usually sits outside the
// project root the caller's readFile is scoped to. That must never collapse to the same
// `inspected: false` as an editor commit (CMP7, which never named a source at all) -- "no
// override for this rule" is not true if pointing `-F` at an unreadable path silently passes.
check("CMP8 a -F file the caller refuses to read is a blocking finding, not a silent pass", () => {
  const result = run("git commit -F does-not-exist.txt");
  assert.equal(result.inspected, true);
  assert.deepEqual(codes(result), ["GIT-03-UNREADABLE-MESSAGE-FILE"]);
});

// CMP9/CMP10 -- the marker half is config-gated, because switching it on unconditionally
// would refuse every ordinary commit in every project that has not adopted the trailer.
check("CMP9 a missing marker is not a finding by default", () => {
  assert.deepEqual(codes(run('git commit -m "chore: bump"')), []);
});

check("CMP10 a missing marker is a finding once the project demands it", () => {
  assert.deepEqual(codes(run('git commit -m "chore: bump"', { requireMarker: true })), ["GIT-03-MARKER-MISSING"]);
});

check("CMP11 the marker must be the exact line, not a mention of it", () => {
  assert.deepEqual(codes(run('git commit -m "chore: bump" -m "this commit is AI-Assisted: true-ish"', { requireMarker: true })), ["GIT-03-MARKER-MISSING"]);
});

check("CMP11b provenance is accepted only from one final Git trailer block", () => {
  files.set("bound.txt", BOUND);
  assert.deepEqual(codes(run("git commit -F bound.txt", { requireMarker: true, requireDispatch: true })), []);
  assert.deepEqual(parseCommitTrailerBlock(BOUND), [
    { key: "Dispatch", value: "NVA-CMP (goldfish)" },
    { key: "AI-Assisted", value: "true" },
  ]);
});

check("CMP11c body mentions do not satisfy either required provenance trailer", () => {
  files.set("body-only.txt", "feat(x): do a thing\n\nDispatch: NVA-CMP (goldfish)\nAI-Assisted: true\n\nordinary body text\n");
  assert.deepEqual(codes(run("git commit -F body-only.txt", { requireMarker: true, requireDispatch: true })), [
    "GIT-03-DISPATCH-MISSING",
    "GIT-03-MARKER-MISSING",
  ]);
});

check("CMP11d a blank line inside the trailer block is rejected", () => {
  files.set("split.txt", "feat(x): do a thing\n\nDispatch: NVA-CMP (goldfish)\n\nAI-Assisted: true\n");
  assert.deepEqual(codes(run("git commit -F split.txt", { requireMarker: true, requireDispatch: true })), ["GIT-03-DISPATCH-MISSING"]);
});

// Candidate 29 (AGY run 3, R8): the refusal after split -m trailers names why and the -F form; an absent Dispatch line names the form.
check("CMP11d2 a Dispatch line split away from the last block is named, with the git commit -F repair", () => {
  const opts = { requireMarker: true, requireDispatch: true };
  const split = finishedCommitMessageFindings("feat(x): do a thing\n\nDispatch: stage-0 (elephant)\n\nAI-Assisted: true\n", opts).findings
    .find((finding) => finding.code === "GIT-03-DISPATCH-MISSING");
  assert.match(split.detail, /a blank line separates it from the last block/u);
  assert.match(split.detail, /git commit -F scratch\/<message-file>/u);
  const absent = finishedCommitMessageFindings("feat(x): x\n\nAI-Assisted: true\n", opts).findings
    .find((finding) => finding.code === "GIT-03-DISPATCH-MISSING");
  assert.doesNotMatch(absent.detail, /blank line separates/u);
  assert.match(absent.detail, /Dispatch: stage-0 \(elephant\)/u);
});

check("CMP11e absent, duplicate and malformed dispatch bindings are distinct findings", () => {
  const cases = [
    ["feat(x): x\n\nAI-Assisted: true\n", "GIT-03-DISPATCH-MISSING"],
    ["feat(x): x\n\nDispatch: A (goldfish)\nDispatch: B (critic)\nAI-Assisted: true\n", "GIT-03-DISPATCH-AMBIGUOUS"],
    ["feat(x): x\n\nDispatch: invented (elephant)\nAI-Assisted: true\n", "GIT-03-DISPATCH-MALFORMED"],
  ];
  for (const [message, expected] of cases) {
    files.set("case.txt", message);
    assert.deepEqual(codes(run("git commit -F case.txt", { requireMarker: true, requireDispatch: true })), [expected]);
  }
});

// D55 (Q12): a recorded PO exception to EL-01 is declared by its decision id, and only in that exact shape.
check("CMP11f the elephant-exception binding admits only a D<n> decision id", () => {
  files.set("exception.txt", "fix(x): x\n\nDispatch: D54 (elephant-exception)\nAI-Assisted: true\n");
  assert.deepEqual(codes(run("git commit -F exception.txt", { requireMarker: true, requireDispatch: true })), []);
  for (const value of ["D0 (elephant-exception)", "X54 (elephant-exception)", "D54 (elephant-exceptions)", "D12345 (elephant-exception)", "D54(elephant-exception)"]) {
    files.set("exception.txt", `fix(x): x\n\nDispatch: ${value}\nAI-Assisted: true\n`);
    assert.deepEqual(codes(run("git commit -F exception.txt", { requireMarker: true, requireDispatch: true })), ["GIT-03-DISPATCH-MALFORMED"], value);
  }
});

// CMP12 -- global options may sit before the verb; a check that missed them would be
// bypassed by `git -C . commit`.
check("CMP12 global git options before the subcommand do not hide the commit", () => {
  assert.deepEqual(codes(run('git -C /some/repo commit -m "x" -m "Claude-Session: abc"')), ["GIT-03-CORRELATION-TRAILER"]);
});

// CMP12b/CMP12c -- an env-assignment prefix, and the `env` wrapper. Both made the first
// token something other than `git`, so the commit went uninspected and the entire rule was
// one `FOO=bar ` away from silent. Found by the hook-level case GIT03-5, which was written
// to prove something else.
check("CMP12b an env-assignment prefix does not hide the commit", () => {
  assert.deepEqual(codes(run('FOO=bar git commit -m "x" -m "Claude-Session: abc"')), ["GIT-03-CORRELATION-TRAILER"]);
});

check("CMP12c the env wrapper does not hide the commit", () => {
  assert.deepEqual(codes(run('env -i FOO=bar git commit -m "x" -m "Session-Id: abc"')), ["GIT-03-CORRELATION-TRAILER"]);
});

// CMP13 -- a non-commit command is not this rule's business at all.
check("CMP13 a non-commit git command is untouched", () => {
  const result = run('git log --format="Co-Authored-By: Claude"');
  assert.equal(result.inspected, false);
});

// CMP14 -- unknown or absent config fails closed to the mandatory all-project rule.
check("CMP14 the marker policy defaults to blocking unless explicitly weakened", () => {
  assert.equal(markerPolicyMode(undefined), "blocking");
  assert.equal(markerPolicyMode({ commitTrailerPolicy: "nonsense" }), "blocking");
  assert.equal(markerPolicyMode({ commitTrailerPolicy: "off" }), "off");
  assert.equal(markerPolicyMode({ commitTrailerPolicy: "blocking" }), "blocking");
  assert.equal(markerPolicyMode({ commitTrailerPolicy: "warn" }), "warn");
});

check("CMP15 the finished-message boundary completes any declared provenance block", () => {
  assert.deepEqual(codes(finishedCommitMessageFindings(BOUND, { requireProvenanceWhenSignaled: true })), []);
  assert.deepEqual(
    codes(finishedCommitMessageFindings("feat: x\n\nDispatch: NVA-CMP (goldfish)\n\nAI-Assisted: true\n", { requireProvenanceWhenSignaled: true })),
    ["GIT-03-DISPATCH-MISSING"],
  );
  assert.deepEqual(
    codes(finishedCommitMessageFindings("feat: x\n\nAI-Assisted: true\n", { requireProvenanceWhenSignaled: true })),
    ["GIT-03-DISPATCH-MISSING"],
  );
});

check("CMP16 the finished-message boundary leaves signal-free human commits alone", () => {
  assert.deepEqual(
    codes(finishedCommitMessageFindings("docs: explain the release\n", { requireProvenanceWhenSignaled: true })),
    [],
  );
});

// GIT-01 -- the second gap this test file exists to close. `6decf59` used commit type
// `design`, which `guardrails/git.md:16` does not admit, and nothing deterministic caught
// it -- this test file unit-tested GIT-03 only, so CMT1 is that exact regression, verbatim
// in shape (backlog/items/2026-08-08-orchestrator-authored-production-commits-have-no-deterministic-control.md).
check("CMT1 the undeclared type that shipped uncaught (`design`) is refused", () => {
  assert.deepEqual(codes(commitTypeFindings("design(hgo): tighten override binding")), ["GIT-01-UNKNOWN-TYPE"]);
});

check("CMT2 every admitted GIT-01 type passes, bare and scoped", () => {
  for (const type of GIT01_COMMIT_TYPES) {
    assert.deepEqual(commitTypeFindings(`${type}: do a thing`).findings, [], `${type}: bare`);
    assert.deepEqual(commitTypeFindings(`${type}(scope): do a thing`).findings, [], `${type}: scoped`);
  }
});

check("CMT3 a breaking-change `!` is not itself a violation", () => {
  assert.deepEqual(commitTypeFindings("feat(api)!: drop the v1 endpoint").findings, []);
});

check("CMT4 an unknown type is refused with the vocabulary in the detail", () => {
  const result = commitTypeFindings("wip: half-done thing");
  assert.deepEqual(codes(result), ["GIT-01-UNKNOWN-TYPE"]);
  for (const type of GIT01_COMMIT_TYPES) assert.ok(result.findings[0].detail.includes(type));
});

check("CMT5 a type-looking prefix with no colon is not a match (no partial credit)", () => {
  assert.deepEqual(codes(commitTypeFindings("feature: not actually the admitted type")), ["GIT-01-UNKNOWN-TYPE"]);
});

check("CMT6 a colon with no space after it does not pass (subject glued on)", () => {
  assert.deepEqual(codes(commitTypeFindings("feat:no space")), ["GIT-01-UNKNOWN-TYPE"]);
});

check("CMT7 an empty or whitespace-only subject is its own finding, not a silent pass", () => {
  assert.deepEqual(codes(commitTypeFindings("")), ["GIT-01-EMPTY-SUBJECT"]);
  assert.deepEqual(codes(commitTypeFindings("   ")), ["GIT-01-EMPTY-SUBJECT"]);
  assert.deepEqual(codes(commitTypeFindings(undefined)), ["GIT-01-EMPTY-SUBJECT"]);
});

check("CMT8 case matters -- GIT-01's vocabulary is lowercase, `Feat:` is not an admitted type", () => {
  assert.deepEqual(codes(commitTypeFindings("Feat: capitalized type")), ["GIT-01-UNKNOWN-TYPE"]);
});

check("CMT9 leading/trailing whitespace on the subject does not defeat the check", () => {
  assert.deepEqual(commitTypeFindings("  fix(x): trim me  ").findings, []);
});

// CMT10/CMT11 -- the range-mode entry point: pure over an already-enumerated commit set,
// same order in, same order out, no git invocation of its own.
check("CMT10 the range entry point flags only the offending commits, in order", () => {
  const commits = [
    { sha: "aaa1111", subject: "feat: clean one" },
    { sha: "bbb2222", subject: "design: the actual GF-056 regression shape" },
    { sha: "ccc3333", subject: "fix(guard): clean two" },
  ];
  const result = commitTypeFindingsForRange(commits);
  assert.equal(result.length, 3);
  assert.deepEqual(result.map((r) => r.sha), ["aaa1111", "bbb2222", "ccc3333"]);
  assert.deepEqual(result[0].findings, []);
  assert.deepEqual(result[1].findings.map((f) => f.code), ["GIT-01-UNKNOWN-TYPE"]);
  assert.deepEqual(result[2].findings, []);
});

check("CMT11 the range entry point on an empty or non-array input is empty, not a throw", () => {
  assert.deepEqual(commitTypeFindingsForRange([]), []);
  assert.deepEqual(commitTypeFindingsForRange(undefined), []);
  assert.deepEqual(commitTypeFindingsForRange(null), []);
});

check("integration trailer parser admits only the exact two-line package binding",()=>{
  const message="chore: integrate reviewed package\n\nDispatch: quality-package-"+"a".repeat(64)+" (integration)\nAI-Assisted: true\n";
  assert.deepEqual(parseIntegrationTrailerBlock(message),{ok:true,intentSha256:"a".repeat(64)});
  assert.equal(codes(finishedCommitMessageFindings(message)).includes("GIT-03-INTEGRATION-EVIDENCE-REQUIRED"),true);
  const admitted={schema:"pipeline.signed-quality-package-integration-evidence.v1",intentSha256:"a".repeat(64),messageSha256:createHash("sha256").update(message.replace(/\r\n/gu,"\n")).digest("hex"),phase:"precommit",code:"QUALITY-PACKAGE-INTEGRATION-PRECOMMIT-VERIFIED"};
  assert.deepEqual(finishedCommitMessageFindings(message,{integrationAdmission:admitted}).findings,[]);
});

check("integration trailer parser rejects malformed, duplicate and extended blocks",()=>{
  const id="quality-package-"+"b".repeat(64)+" (integration)";
  for(const message of [
    `chore: x\n\nDispatch: ${id}\n`,
    `chore: x\n\nDispatch: ${id}\nAI-Assisted: true\nAI-Assisted: true\n`,
    `chore: x\n\nDispatch: ${id}\nAI-Assisted: true\nReview: required\n`,
    `chore: x\n\nDispatch: quality-package-ABC (integration)\nAI-Assisted: true\n`,
  ])assert.equal(parseIntegrationTrailerBlock(message).ok,false);
});

check("CMP17 the exact AI-Assisted plus Checkpoint-Act pair is admitted without a Dispatch entry", () => {
  const pair = "chore(state): checkpoint\n\nBody.\n\nAI-Assisted: true\nCheckpoint-Act: elephant\n";
  assert.deepEqual(finishedCommitMessageFindings(pair, { requireMarker: true, requireDispatch: true, requireProvenanceWhenSignaled: true }).findings, []);
  assert.deepEqual(finishedCommitMessageFindings(pair, { requireProvenanceWhenSignaled: true }).findings, []);
});

check("CMP18 any other Checkpoint-Act combination stays refused as before", () => {
  const opts = { requireMarker: true, requireDispatch: true, requireProvenanceWhenSignaled: true };
  const refused = [
    "chore: x\n\nAI-Assisted: true\nCheckpoint-Act: elephant\nCheckpoint-Act: elephant\n",
    "chore: x\n\nAI-Assisted: true\nCheckpoint-Act: elephant\nDispatch: not-admitted\n",
    "chore: x\n\nAI-Assisted: true\nCheckpoint-Act: goldfish\n",
    "chore: x\n\nCheckpoint-Act: elephant\n",
    "chore: x\n\nAI-Assisted: true\nCheckpoint-Act: elephant\nReview: required\n",
  ];
  for (const message of refused) assert.notDeepEqual(finishedCommitMessageFindings(message, opts).findings, [], message);
  assert.ok(codes(finishedCommitMessageFindings(refused[0], opts)).includes("GIT-03-DISPATCH-MISSING"));
});

// AC-136 -- the conventional-commit skill prints the guard-conformant trailer set per context.
// The examples are read FROM the skill text and judged by the same validator the guard uses.
check("CMP19 every trailer example in the conventional-commit skill is accepted by the GIT-03 validator and the runner-attribution example is refused", async () => {
  const { readFileSync } = await import("node:fs");
  const skill = readFileSync(new URL("../skills/conventional-commit/SKILL.md", import.meta.url), "utf8").replace(/\r\n/gu, "\n");
  const blocks = (info) => [...skill.matchAll(new RegExp(`\`\`\`${info}\\n([\\s\\S]*?)\\n\`\`\``, "gu"))].map((m) => m[1]);
  const opts = { requireMarker: true, requireDispatch: true, requireProvenanceWhenSignaled: true };
  const wrap = (block) => `feat(x): do a thing\n\nWhy it matters.\n\n${block}\n`;
  const accepted = blocks("trailers-ok");
  assert.equal(accepted.length, 3, "one accepted example per context: stage-0, dispatched Goldfish, orchestrator finishing a Goldfish result");
  assert.ok(accepted.some((b) => /^Dispatch: stage-0 \(elephant\)$/mu.test(b)));
  assert.ok(accepted.some((b) => /^Dispatch: \S+ \(goldfish\)$/mu.test(b) && !/Commit-Act/u.test(b)));
  assert.ok(accepted.some((b) => /^Dispatch: \S+ \(goldfish\)$/mu.test(b) && /^Commit-Act: orchestrator$/mu.test(b)));
  for (const block of accepted) {
    assert.deepEqual(finishedCommitMessageFindings(wrap(block), opts).findings, [], block);
    assert.match(block, /^AI-Assisted: true$/mu);
  }
  const refused = blocks("trailers-refused");
  assert.equal(refused.length, 1);
  assert.ok(codes(finishedCommitMessageFindings(wrap(refused[0]), opts)).includes("GIT-03-PROVIDER-COAUTHOR"));
  assert.ok(codes(finishedCommitMessageFindings(wrap("AI-Assisted: true"), opts)).includes("GIT-03-DISPATCH-MISSING"));
  for (const code of ["GIT-03-PROVIDER-COAUTHOR", "GIT-03-DISPATCH-MISSING"]) assert.ok(skill.includes(code), code);
  assert.match(skill, /must NOT be added/u);
});

// C30-19 (one plain command with its provenance trailers): the guard must judge the bytes REAL Git writes. These cases run
// real `git commit` in a throwaway repository with an injected hook-free config and compare. Git appends `--trailer` entries to
// the LAST paragraph when that paragraph is itself a trailer block (all lines `Token: value`, or a recognised prefix such as
// `Signed-off-by:` on at least a quarter of the lines); only otherwise does it insert a blank line first.
const POSIX_QUOTE = (value) => `'${String(value).replace(/'/gu, `'\\''`)}'`;
const PROVENANCE_ARGS = ["--trailer", "AI-Assisted: true", "--trailer", "Dispatch: C30I-S4 (goldfish)"];
const oneCommandArgs = (subject, bodies = []) => ["-m", subject, ...bodies.flatMap((body) => ["-m", body]), ...PROVENANCE_ARGS];
const oneCommandText = (args) => `git commit ${args.map(POSIX_QUOTE).join(" ")}`;
const STRICT = { requireMarker: true, requireDispatch: true };
function realGitMessage(args) {
  const dir = mkdtempSync(join(tmpdir(), "cmp-real-git-"));
  try {
    const env = {
      PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, HOME: dir, USERPROFILE: dir,
      GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: join(dir, "gitconfig"), GIT_TERMINAL_PROMPT: "0",
    };
    writeFileSync(join(dir, "gitconfig"), "");
    const git = (gitArgs) => {
      const result = spawnSync("git", gitArgs, { cwd: dir, env, encoding: "utf8", shell: false });
      assert.equal(result.status, 0, `git ${gitArgs[0]}: ${result.stderr}`);
      return result.stdout;
    };
    git(["init", "-q"]);
    git(["-c", "user.name=probe", "-c", "user.email=probe@example.invalid", "-c", `core.hooksPath=${join(dir, "no-hooks")}`,
      "-c", "commit.gpgsign=false", "commit", "-q", "--allow-empty", ...args]);
    const raw = git(["cat-file", "commit", "HEAD"]);
    return raw.slice(raw.indexOf("\n\n") + 2);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

check("CMP044 the accepted one-command spelling is admitted and the guard's message equals the bytes real Git writes", () => {
  const prose = [
    [], ["Explains why."], ["Explains why.", ""], ["para one.", "para two."], ["Why: x\nbecause plain prose."],
    ["- bullet: x"], ["my_key: x"], ["see https://x.invalid now"], ["Why: x\n  continued\nthen prose."],
  ];
  for (const bodies of prose) {
    const args = oneCommandArgs("feat(x): do a thing", bodies);
    const result = run(oneCommandText(args), STRICT);
    assert.deepEqual(codes(result), [], JSON.stringify(bodies));
    const real = realGitMessage(args);
    assert.equal(`${result.message}\n`, real, JSON.stringify(bodies));
    assert.match(real, /\n\nAI-Assisted: true\nDispatch: C30I-S4 \(goldfish\)\n$/u, "real Git keeps the blank separator");
    assert.deepEqual(parseCommitTrailerBlock(result.message), [
      { key: "AI-Assisted", value: "true" }, { key: "Dispatch", value: "C30I-S4 (goldfish)" },
    ], JSON.stringify(bodies));
  }
});

check("CMP045 a body whose last paragraph Git reads as a trailer block is refused with the typed repair, on Git's real bytes", () => {
  // Git also rewrites some glued lines (`Note : x` -> `Note: x`, `https://x` -> `https: //x`): those are refused, their bytes need not match.
  const rewritten = [["https://x.invalid"], ["Note : x"], ["Why:x"]];
  const glued = [
    ["Why: x"], ["Note: a\nNote2: b"], ["Why: x\n  continued"], ["Why:"], ["Why: x\n# remark"],
    ["Signed-off-by: A <a@example.invalid>\nprose one\nprose two"], ...rewritten,
  ];
  for (const bodies of glued) {
    const args = oneCommandArgs("feat(x): do a thing", bodies);
    const result = run(oneCommandText(args), STRICT);
    const real = realGitMessage(args);
    assert.doesNotMatch(real, /\n\nAI-Assisted: true\n/u, `real Git glues the trailers to the body for ${JSON.stringify(bodies)}`);
    if (!rewritten.includes(bodies)) assert.equal(`${result.message}\n`, real, JSON.stringify(bodies));
    const finding = result.findings.find((entry) => entry.code === "GIT-03-TRAILERS-GLUED-TO-BODY");
    assert.ok(finding, JSON.stringify(bodies));
    assert.match(finding.detail, /git commit -m <subject> \[-m <body>\] --trailer "AI-Assisted: true" --trailer "Dispatch: <id>"/u);
    assert.match(finding.detail, /plain prose/u);
    assert.match(finding.detail, /git commit -F scratch\/<message-file>/u);
  }
});

check("CMP046 the guard's glue verdict agrees with real Git for each shape of last body paragraph", () => {
  const shapes = [
    "plain prose.", "Why: x\nplain prose.", "Why: x\nWhat: y", "intro\n  indented: x", "# remark", "Why: x\n# remark", "# remark\nWhy: x",
    "prose.\n# remark", "# remark\nprose.", "# a\n\n# b", "para\n\n# tail comment", "Reviewed-by: A\nprose", "Signed-off-by: A\nx\nx\nx", "Signed-off-by: A\nx\nx\nx\nx", "(cherry picked from commit abc)\nprose\nprose",
    ": x", "a b: c", "key_with_underscore: x", "-x: y", "Why: x\n\nplain closing paragraph.",
    // The two real bodies of the 2026-11-17 commits that exposed the defect: the first starts `C30-19:` (a valid token, so Git glued
    // the trailers on), the second starts with a sentence that merely contains a colon (blank line kept).
    "C30-19: the guard already admits the one-command commit with --trailer; the refusal text still teaches the message file.",
    "Found on the first real commit with the form: Git appended the trailers directly under the body paragraph.",
  ];
  for (const shape of shapes) {
    const args = oneCommandArgs("feat(x): do a thing", [shape]);
    const result = run(oneCommandText(args), STRICT);
    const real = realGitMessage(args);
    const realGlued = !/\n\nAI-Assisted: true\n/u.test(real);
    assert.equal(result.findings.some((entry) => entry.code === "GIT-03-TRAILERS-GLUED-TO-BODY"), realGlued, JSON.stringify(shape));
    // Git drops a `#` line that sits inside a glued trailer block, so only that one shape differs in bytes (it is refused either way).
    if (shape !== "# remark\nWhy: x") assert.equal(`${result.message}\n`, real, JSON.stringify(shape));
  }
});

check("CMP047 the one-command spelling keeps every other GIT-03 refusal exactly as before", () => {
  const withArgs = (extra, bodies = []) => run(oneCommandText([...oneCommandArgs("feat(x): do a thing", bodies), ...extra]), STRICT);
  assert.deepEqual(codes(withArgs(["--trailer", "AI-Assisted: true"])), ["GIT-03-MARKER-AMBIGUOUS"]);
  assert.deepEqual(codes(withArgs(["--trailer", "Dispatch: C30I-S4 (goldfish)"])), ["GIT-03-DISPATCH-AMBIGUOUS"]);
  assert.deepEqual(codes(run(oneCommandText(["-m", "feat(x): do a thing", "--trailer", "AI-Assisted: true"]), STRICT)), ["GIT-03-DISPATCH-MISSING"]);
  assert.deepEqual(codes(run(oneCommandText(["-m", "feat(x): do a thing", "--trailer", "Dispatch: C30I-S4 (goldfish)"]), STRICT)), ["GIT-03-MARKER-MISSING"]);
  assert.deepEqual(codes(withArgs(["--trailer", "Co-Authored-By: Claude <noreply@anthropic.com>"])), ["GIT-03-PROVIDER-COAUTHOR"]);
  assert.deepEqual(codes(withArgs([], ["see https://claude.ai/code/session_01ABC"])), ["GIT-03-SESSION-URL"]);
  assert.deepEqual(codes(withArgs(["--trailer", "Dispatch: invented (elephant)"])), ["GIT-03-DISPATCH-AMBIGUOUS"]);
});

check("CMP048 the Dispatch-missing repair names the one-command --trailer form first and the message file as the fallback", () => {
  for (const message of ["feat(x): x\n\nDispatch: stage-0 (elephant)\n\nAI-Assisted: true\n", "feat(x): x\n\nAI-Assisted: true\n"]) {
    const finding = finishedCommitMessageFindings(message, STRICT).findings.find((entry) => entry.code === "GIT-03-DISPATCH-MISSING");
    const oneCommand = finding.detail.indexOf('git commit -m <subject> [-m <body>] --trailer "AI-Assisted: true" --trailer "Dispatch: <id>"');
    const fileRoute = finding.detail.indexOf("git commit -F scratch/<message-file>");
    assert.ok(oneCommand >= 0 && fileRoute > oneCommand, message);
  }
});

afterTests(() => {
process.stdout.write(`\n${checks}/${checks} commit-message policy checks passed\n`);
});
registerTestCaseCompletion({ cases, fd: 3, maxBytes: 65536 });
