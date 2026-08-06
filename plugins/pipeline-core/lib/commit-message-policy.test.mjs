// SPDX-License-Identifier: SUL-1.0
/**
 * GIT-03 enforcement, unit level.
 *
 * The regression these exist for is concrete: 74 commits in one session carried
 * `Co-Authored-By: <provider>` and a session URL, 53 of them reached a public remote before
 * a human noticed by reading. CMP1 is that exact message.
 */
import assert from "node:assert/strict";

import { commitMessageFindings, markerPolicyMode } from "./commit-message-policy.mjs";

let checks = 0;
const check = (label, fn) => { fn(); checks += 1; process.stdout.write(`ok ${label}\n`); };
const codes = (result) => result.findings.map((f) => f.code).sort();

const CLEAN = "feat(x): do a thing\n\nWhy it matters.\n\nAI-Assisted: true\n";
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

// CMP2 -- the `-F` route is the one this repository actually uses, so a check that only
// read `-m` would have missed every commit it was written for.
check("CMP2 a clean message via -F passes", () => {
  files.set("clean.txt", CLEAN);
  assert.deepEqual(codes(run("git commit -F clean.txt")), []);
});

check("CMP3 a clean inline message passes", () => {
  assert.deepEqual(codes(run('git commit -m "fix(y): tidy up" -m "AI-Assisted: true"')), []);
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

check("CMP8 an unreadable -F file is uninspected, not silently passed", () => {
  const result = run("git commit -F does-not-exist.txt");
  assert.equal(result.inspected, false);
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

// CMP14 -- unknown or absent config reads as off; the convention half is opt-in.
check("CMP14 the marker policy defaults to off on anything unrecognised", () => {
  assert.equal(markerPolicyMode(undefined), "off");
  assert.equal(markerPolicyMode({ commitTrailerPolicy: "nonsense" }), "off");
  assert.equal(markerPolicyMode({ commitTrailerPolicy: "blocking" }), "blocking");
  assert.equal(markerPolicyMode({ commitTrailerPolicy: "warn" }), "warn");
});

process.stdout.write(`\n${checks}/${checks} commit-message policy checks passed\n`);
