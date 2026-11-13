fix(gh-cmd): a gh data value passed to a node script file is no gh invocation

Codex greenfield run 3 (C5): `node <plugin>/scripts/<driver>.mjs ...
--transport-reference gh` was refused as an unclassified gh use, because
every word after an interpreter that equals `gh` counted as a gh call
handed to the interpreter. For `node` with a script file as its first
argument (no -e/-p/--eval/--print or other option before it) the
arguments are data, so only the fail-closed marker rule applies: a gh
word followed by pr/api/release/... stays unclassified. `node -e`,
`node --eval` and other interpreters keep the old rule.

Checkpoint-Intent: candidate 29, Codex run 3 C5
AI-Assisted: true
Dispatch: stage-0 (elephant)
