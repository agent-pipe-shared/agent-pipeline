// SPDX-License-Identifier: SUL-1.0
// ALF-C-P1-24C patch check. The change itself (the dispatch-record claim reader,
// physicalCreationFile(), replaces its POSIX-only mode/uid term by the repository's
// native private-state assessment on win32, plus the OWN-7 regression case) lives in
// guard paths that the installed guard refuses to edit in place, so it ships as
// ALF-C-P1-24C.patch for the PO to apply from a terminal. This test proves that
// artifact is well-formed, touches only the paths the dispatch may touch, keeps the
// POSIX expression and the fail-closed shape, removes no existing test, and applies
// to the working tree (`git apply --check`: no side effects). Once the PO has applied
// the patch, the reverse check holds instead.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repository = fileURLToPath(new URL("../../../../../", import.meta.url));
const patchPath = fileURLToPath(new URL("./ALF-C-P1-24C.patch", import.meta.url));

// The paths the briefing allows a patch to touch, and the two this slice touches.
const ALLOWED = [
  "plugins/pipeline-core/lib/guard/dispatch-record-lane.mjs",
  "plugins/pipeline-core/lib/pins/dispatch-record-ownership-binds-an-attempted-creation.test.mjs",
];
const EXPECTED = [...ALLOWED];
const LANE = ALLOWED[0];
const PIN = ALLOWED[1];
// The original POSIX refusal expression, which must survive textually unchanged inside the new conditional.
const POSIX_TERM = '((before.mode & 0o022) !== 0 || (typeof process.getuid === "function" && before.uid !== process.getuid()))';

function parsePatch(text) {
  const lines = text.split("\n");
  if (lines.at(-1) === "") lines.pop();
  const files = [];
  let current = null;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const header = /^diff --git a\/(\S+) b\/(\S+)$/u.exec(line);
    if (header) {
      current = { a: header[1], b: header[2], isNew: false, minus: null, plus: null, hunks: [] };
      files.push(current);
      continue;
    }
    if (current === null) throw new Error(`content before the first file header at line ${index + 1}`);
    if (/^(?:index |old mode |new mode )/u.test(line)) continue;
    if (line.startsWith("new file mode ")) { current.isNew = true; continue; }
    if (current.hunks.length === 0 && line.startsWith("--- ")) { current.minus = line.slice(4); continue; }
    if (current.hunks.length === 0 && line.startsWith("+++ ")) { current.plus = line.slice(4); continue; }
    const hunk = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/u.exec(line);
    if (!hunk) throw new Error(`unexpected line ${index + 1} outside a hunk: ${line.slice(0, 60)}`);
    let oldLeft = hunk[2] === undefined ? 1 : Number(hunk[2]);
    let newLeft = hunk[4] === undefined ? 1 : Number(hunk[4]);
    const body = { oldStart: Number(hunk[1]), oldCount: oldLeft, newStart: Number(hunk[3]), newCount: newLeft, added: [], removed: [] };
    index += 1;
    while (oldLeft > 0 || newLeft > 0) {
      const text = lines[index];
      if (text === undefined) throw new Error(`hunk at line ${index} ends before its declared counts`);
      const tag = text[0];
      if (tag === " ") { oldLeft -= 1; newLeft -= 1; }
      else if (tag === "-") { oldLeft -= 1; body.removed.push(text.slice(1)); }
      else if (tag === "+") { newLeft -= 1; body.added.push(text.slice(1)); }
      else throw new Error(`malformed hunk body at line ${index + 1}: ${text.slice(0, 60)}`);
      index += 1;
    }
    if (oldLeft !== 0 || newLeft !== 0) throw new Error(`hunk counts are inconsistent near line ${index}`);
    while (lines[index]?.startsWith("\\")) index += 1;
    index -= 1;
    current.hunks.push(body);
  }
  return files;
}

const patchText = readFileSync(patchPath, "utf8");
const parsed = parsePatch(patchText);
const targetHashes = () => EXPECTED.map((path) => {
  const full = join(repository, path);
  return existsSync(full) ? createHash("sha256").update(readFileSync(full)).digest("hex") : "absent";
});
const applyCheck = (extra = []) => spawnSync("git", ["apply", "--check", ...extra, patchPath], { cwd: repository, encoding: "utf8" });
const fileOf = (path) => parsed.find((file) => file.b === path);
const addedOf = (file) => file.hunks.flatMap((hunk) => hunk.added);
const removedOf = (file) => file.hunks.flatMap((hunk) => hunk.removed);

test("the patch is a well-formed LF-only unified diff", () => {
  assert.ok(patchText.length > 0, "the patch must not be empty");
  assert.ok(patchText.endsWith("\n"), "the patch must end with a newline");
  assert.equal(patchText.includes("\r"), false, "the patch must carry LF endings only");
  assert.ok(parsed.length > 0, "the patch must contain at least one file diff");
  for (const file of parsed) {
    assert.ok(file.hunks.length > 0, `${file.b} has no hunk`);
    assert.equal(file.a, file.b, "a rename/copy is not a permitted shape");
    assert.equal(file.plus, `b/${file.b}`);
    assert.equal(file.minus, file.isNew ? "/dev/null" : `a/${file.a}`);
    assert.equal(/^(?:\/|[A-Za-z]:|.*\.\.)/u.test(file.b) || file.b.includes("\\"), false, "repository-relative POSIX path required");
  }
});

test("the patch touches only the allowed target paths, and exactly the two of this slice", () => {
  const touched = parsed.map((file) => file.b);
  assert.equal(new Set(touched).size, touched.length, "no path may appear twice");
  for (const path of touched) assert.ok(ALLOWED.includes(path), `${path} is outside the allowed target paths`);
  assert.deepEqual([...touched].sort(), [...EXPECTED].sort());
  for (const file of parsed) assert.equal(file.isNew, false, `${file.b} must be modified in place, not created`);
});

test("the lane change swaps only the platform term, keeps the POSIX expression verbatim and refuses unless the native assessment is secure", () => {
  const lane = fileOf(LANE);
  const added = addedOf(lane);
  const removed = removedOf(lane);
  // The one removed line is the original single-line refusal tail, and it carries the POSIX term verbatim.
  assert.equal(removed.length, 1, "exactly one lane line is replaced");
  assert.ok(removed[0].includes(POSIX_TERM.slice(1, -1)), "the removed line is the original POSIX mode/uid refusal");
  assert.ok(removed[0].includes('creationFailure("DRO-RECORD")'));
  // The replacement keeps the POSIX term textually unchanged on every non-win32 platform.
  const replacement = added.find((line) => line.includes('process.platform === "win32"'));
  assert.ok(replacement, "the platform conditional must be added");
  assert.ok(replacement.includes(` : ${POSIX_TERM}`), "the POSIX branch must be the original expression, textually unchanged");
  assert.ok(replacement.includes('creationFailure("DRO-RECORD")'), "the refusal code is unchanged");
  // Fail-closed: only an exact `secure` verdict admits the claim on win32; unavailable/insecure/anything else refuses.
  assert.ok(replacement.includes('assessWindowsPrivatePath(path).status !== "secure"'), "win32 refuses unless the assessment is exactly secure");
  assert.equal(/status\s*===\s*"(?:insecure|unavailable)"/u.test(replacement), false, "no allow-list of non-secure statuses");
  // Exactly the import plus the conditional; nothing else is added to the lane.
  assert.equal(added.length, 2, "the lane gains only the import and the conditional");
  assert.ok(added.includes('import { assessWindowsPrivatePath } from "../windows-private-state.mjs";'));
  // The lane stays inside the guard kernel closure: no new top-level declaration is introduced.
  assert.equal(added.some((line) => /^(?:export\s+)?(?:async\s+)?(?:function|const|let|var|class)\b/u.test(line)), false, "no top-level declaration is added");
});

test("the pin gains OWN-7 and removes no existing case; only its import line is widened", () => {
  const pin = fileOf(PIN);
  const added = addedOf(pin);
  const removed = removedOf(pin);
  assert.equal(removed.some((line) => /\btest\s*\(|assert\./u.test(line)), false, "no existing test or assertion is removed");
  assert.equal(removed.length, 1, "only the node:fs import line is replaced");
  assert.match(removed[0], /^import \{ existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync \} from "node:fs";$/u);
  assert.ok(added.some((line) => /^import \{ chmodSync, existsSync, /u.test(line)), "the node:fs import gains chmodSync");
  assert.ok(added.includes('import { hardenWindowsPrivateDirectory } from "../windows-private-state.mjs";'));
  const cases = added.filter((line) => /^test\(/u.test(line));
  assert.equal(cases.length, 1, "exactly one case is added");
  assert.match(cases[0], /^test\("OWN-7 /u);
  const body = added.join("\n");
  assert.match(body, /claimDispatchRecordOwnership\(/u, "the owner claim is made through the production function");
  const code = added.filter((line) => !line.startsWith("//")).join("\n");
  assert.match(code, /const production = \{ gitCommitForTaskIdFn: \(\) => null \};/u, "OWN-7 injects nothing but the commit lookup");
  assert.doesNotMatch(code, /readFileSyncFn\s*[:=]/u, "OWN-7 uses the production claim reader, no readFileSync seam");
  assert.match(body, /collideProduction\(fx, fx\.a, id, OWNER\), null/u, "the owner is admitted");
  assert.match(body, /owned by dispatch agent ownership-agent-owner/u, "a foreign/orchestrator caller is refused with the owner reason");
  assert.match(body, /an attacker-writable claim is never honoured, not even for the owner/u, "an attacker-writable claim is refused for everyone");
});

test("the patch carries no secret or machine-specific absolute path", () => {
  const addedLines = parsed.flatMap((file) => file.hunks.flatMap((hunk) => hunk.added));
  for (const line of addedLines) {
    assert.equal(/[A-Za-z]:[\\/]{1,2}(?:Users|Dev|Windows)\b|\/(?:home|Users)\/[^\s/]+/u.test(line), false, `machine-specific path in: ${line.slice(0, 80)}`);
    assert.equal(/(?:BEGIN [A-Z ]*PRIVATE KEY|ghp_[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16})/u.test(line), false, "secret-shaped content");
  }
});

test("git apply --check accepts the patch against the working tree, with no side effect", () => {
  const before = targetHashes();
  const forward = applyCheck();
  let applied = false;
  if (forward.status !== 0) {
    // Not applicable forward: acceptable only when the PO already applied it,
    // i.e. the reverse application checks out exactly.
    const reverse = applyCheck(["--reverse"]);
    applied = reverse.status === 0;
    assert.ok(applied, `git apply --check failed (exit ${forward.status}): ${String(forward.stderr).slice(0, 400)}`);
  }
  assert.deepEqual(targetHashes(), before, "git apply --check must not modify any target path");
  assert.ok(forward.status === 0 || applied);
});
