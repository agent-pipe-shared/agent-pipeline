---
schema: pipeline.backlog-item.v1
id: pipeline.commit-grammar-hint-still-requires-scratch-message-file
type: workflow-improvement
owner: pipeline
status: open
created: 2026-09-29
sprint: alfred
done_when: manual
tracking: "The commit parser already accepts repeated -m and Git --trailer, but the lifecycle grammar denial and commit skill still direct ordinary multi-paragraph commits through a scratch message file."
source: "PO feedback on 2026-09-29; guard-lifecycle-ready.mjs commitMessageFileRemediation; commit-message-policy.test.mjs CMP3a/CMP3c."
---

# Normal commits still receive obsolete scratch-file guidance

The earlier closed trailer-authoring item established a file-free form using
repeated single-line `-m` arguments and native `--trailer` switches. The
lifecycle guard's literal-newline refusal still recommends writing a message
file and using `git commit -F`; the conventional-commit skill leaves `-F` as an
ordinary option. This creates avoidable scratch files and extra tool calls.

## Direction

Update both guidance surfaces to show a file-free command with exact pathspecs.
Keep the closed shell grammar and provenance validation unchanged. Preserve
`-F` for genuinely unsuitable single-line arguments.

## Acceptance criteria

- A normal subject, body and required trailers can be committed without a
  user-created message file on POSIX and Windows.
- A literal newline inside one shell argument remains refused, with a clear
  file-free remediation.
- The guard's allow or deny decision does not change as a result of guidance.
