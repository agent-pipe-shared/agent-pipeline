# w313 — the repeated grammar refusal is trimmed on Antigravity and across the four listing codes (candidate 31, C31-C3, recon item B1)

Delta on the base clone of candidate 31: apply the base clone first (`scratch/agent-out/c31/int` state), then this patch. It does not apply to the real checkout on its own, and its check test does not run `git apply`.
Closest existing accepted criterion: AC-112. The PRD and the Spec are unchanged.

## What it changes (protected guard files: the PO applies the chain)

- `lib/guard/denial-telemetry.mjs`
  - `denialClassesScopeKey` falls back to `antigravity_conversation_id` when there is no resolved subagent and no `session_id`. The id passes the same check as `resetDenialClassesForSession` (`^[A-Za-z0-9._-]{1,128}$`, not starting with `agent-`); both now share one helper, `isPlainScopeId`. An invalid id gives no key (full text, nothing stored).
  - A payload that carries `native_child_cwd` (a governed native child) gets no key. Whether such a child shares its parent's conversation id was not established, so it fails open to the full text: never a wrongly trimmed first refusal.
  - `isFirstDenialThisScope`: the four codes that print the complete listing (`GUARD-READ-COMMAND-UNSUPPORTED`, `GUARD-PARSE-UNSUPPORTED`, `GUARD-OPERATOR-UNAPPROVED`, `GUARD-REDIRECT-UNAPPROVED`, read from `READ_COMMAND_UNSUPPORTED_CODE` and the keys of `GRAMMAR_DENIAL_GUIDANCE`) are one class: once any of them printed the listing in a scope, the others render the short form. The stored value stays the raw code, appended as before (no new key shape, no new file kind; old state files keep working). `GUARD-READ-SCOPE-OUTSIDE-ROOT` and any other class keep their own behaviour, so a read-scope refusal never marks the listing as printed.
- `lib/guard/grammar-denials.mjs`: the short line now says "an earlier grammar refusal in this context window" instead of "the earlier denial of this kind this session", and names one admitted example (`rg -n needle probe.txt`), so the short form still names a runnable command.
- `lib/guard/evaluate.mjs`: not needed, no change. The five call sites pass the code; the shared class lives in the one function.
- New test file `lib/guard/denial-telemetry.test.mjs` (9 cases). It is NEW and therefore not yet registered in `harness/verify-suites.json` (TP-13, protected): it needs one registration row, or Verify will not run it.

## Why

The trim never fired on Antigravity (its adapter payload has a conversation id and no `session_id`), and the key was the code, so a different code printed the whole 3 KB listing again on every runner (recon section 4, 5, B1; decisions D1 and D2 taken by their defaults: yes to the shared key, no to shortening the first refusal).

## Test first

RED before the production edit (`denial-telemetry.test.mjs`, first 8 cases): 5 failed, 3 passed. Four failures are the defect (Antigravity input asked twice gave true, true; the four codes did not share a class; code A then code B rendered B full; the Antigravity-shaped rendered case printed the full listing twice). The fifth, the read-scope-first case, failed only on a wrong fixture command (the command it used was classified as an operator refusal); its fixture was replaced by a command that is refused as a read outside the root, in the same step as the production edit, and it passes both before and after the change (it guards against over-trimming, it is not a defect example). The redirect fixture was changed after the production edit (the first one was classified as a parse refusal, so the assertion on the redirect code could not hold); the assertions are unchanged and the justification is that the fixture, not the criterion, was wrong. GREEN after: all cases.

## Failure classes covered

Antigravity conversation key (valid, other conversation, invalid ids `../escape`, `agent-1`, empty, slash, 129 characters, non-string, null), session id taking precedence, native child, all four listing codes in both orders of first/repeat, read-scope first then a grammar code (full), an unrelated class keeps its own key, every store failure (write, mkdir, exists, no common dir) fails open to true, rendered stderr for Claude-shaped and Antigravity-shaped input (the retryActions line, the `Rejected element` line and the repeat override guidance stay; the first refusal in a scope is full; a new conversation starts full).

## Open item resolved: Antigravity compaction

The Antigravity hook entries (`plugins/pipeline-core/hooks.json`) are `PreToolUse`, `Stop` and `PreInvocation`. There is NO post-compaction hook there, so nothing clears the conversation-keyed file the way `post-compact-reground.mjs` clears the session-keyed one for Claude. A stale key never hides the first full text of a NEW conversation (the key is the conversation id). Residual risk, not proven either way: after a compaction inside one conversation the short form can point to a listing that has left the context. It is still actionable on its own (one-simple-command rule, an admitted example, the retryActions line, the rejected element); the full listing returns in the next conversation. No hook was added (outside the write list and a new behaviour).

## Pins that this change turns red (outside the write list: restate them in the same chain step, QG-04; never edited here)

Measured with the patch applied in the clone (one suite at a time): `hooks/guard-lifecycle-ready.test.mjs` 450 cases, 446 pass, 1 fail, 3 skipped; `lib/pins/grammar-listing-once-per-context-window.test.mjs` 4 cases, 3 pass, 1 fail; `lib/agent-pipeline-root-creation.test.mjs` 11 of 11 pass. All the reds are the one old wording and its mirror, nothing else:

- `lib/pins/grammar-listing-once-per-context-window.test.mjs` line 16 (`const SHORT`) and `hooks/guard-lifecycle-ready.test.mjs` line 10069 (the AC-1/AC-2/AC-3 case): the regex `already printed on the earlier denial of this kind this session`. Replacement: `/already printed on an earlier grammar refusal in this context window/u`.
- `hooks/guard-lifecycle-ready.test.mjs` lines 10081 to 10088, in the SAME case (it stops at line 10069 first, so this assertion was read from the code, not observed red): it asserts that a different code under the same session id prints the full listing. That is now the intended opposite. Restate it as `doesNotMatch` of the full header and `match` of the new short text, and keep the new code in the assertion. The AC-6 case (line 10159, the stored `seenClasses` list appends both raw codes) stays green on purpose.

No other text in `plugins`, `harness`, `templates` or `docs` carries the old wording (searched).

## Not changed / not proven

- The first refusal in a scope is still full (D2 stays no). `READ_SCOPE` and credential refusals are unchanged. No refusal changes which code is raised; no gate, signature, approval or stored status is touched.
- The override-guidance choice uses the same first-or-repeat boolean as the listing. New behaviour to name: after one grammar refusal in a scope (including a read-spelling refusal, which offers no override text at all), the first override-bearing refusal of a different code shows only the repeat form ("remains available; run this exact next command", with the request-bound `plan` step). The full ceremony text (who signs, the "repeat the IDENTICAL denied call" warning) is then not printed again in that scope; the plan JSON that command returns carries the mode-specific next action. Covered by one rendered case with an injected planned route; that the repeat form alone is enough for a reader who never saw the full text is judged, not proven.
- The shared class and the Antigravity key are not run against a real Antigravity host: the fixtures mirror the adapter payload (`cwd`, `tool_use_id`, `antigravity_conversation_id`, no `session_id`) and a UUID-shaped conversation id as the host sends it.
- Run mechanics: the big `guard-lifecycle-ready.test.mjs` run was moved to the background by the shell tool after 180 s (it printed at its end); it was awaited, not abandoned.
- The Critic is suspended by the PO for candidates of this repository and no Full Verify ran: this change is verified by tests only (the new file, `agent-pipeline-root-creation.test.mjs`, and the suites named in the report).
