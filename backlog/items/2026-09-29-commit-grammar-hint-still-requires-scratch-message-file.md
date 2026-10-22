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

## Triage

- **Decision:** fixed in source — closes after the 0.7.0 candidate host checklist (status stays `open` until then).
- **Rationale:** commit(s) `15722ce6a`.
- **Assignment (if accepted):** sprint-alfred-epic close-out batch.
- **Date:** 2026-10-08.

### Blocker analysis 2026-10-22

Read-only survey of the open clauses that the delivery remeasure assigned to native-host, verify-wsl, po-decision or po-signature (evidence: `specs/sprint-alfred-epic/evidence/blocker-analysis-2026-10-22/`). Status key: LINUX-RUN and WINDOWS-INTEROP-RUN are runs an agent can do from the WSL host; HOST-SESSION-NEEDED, PO-DECISION and PO-SIGNATURE are not agent work.

- **HOST-SESSION-NEEDED** — The 0.7.0 candidate host checklist (a real file-free commit on native Windows and the installed hosts) is still outstanding
  Fixed in source (15722ce6a); closure waits for the candidate host checklist: a real file-free multi-paragraph commit with trailers under the lifecycle guard in installed Claude, Codex and Antigravity sessions and on native Windows. The commit-message-policy suite can run on Linux and natively via interop, but the guard-in-host behaviour needs the installed candidate.
