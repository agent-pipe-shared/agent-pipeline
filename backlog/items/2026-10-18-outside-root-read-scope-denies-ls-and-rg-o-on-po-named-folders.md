---
schema: pipeline.backlog-item.v1
id: pipeline.outside-root-read-scope-denies-ls-and-rg-o-on-po-named-folders
type: defect
owner: pipeline
status: open
created: 2026-10-18
source: "real greenfield project report 2026-10-18 (PF-02)"
sprint: none
done_when: manual
---

# Outside-root read scope denies `ls` and `rg -o` on folders the PO named

## Description

`GUARD-READ-SCOPE-OUTSIDE-ROOT` refused an `ls` on a key folder the PO had named in chat. An
`rg -n -o "<pattern>"` over two plugin directories was refused as well, while other `rg` and
`cat` reads inside the plugin directory passed. The refusal is inconsistent across read shapes
that are equally read-only.

## Triggering situation

A real greenfield project on WSL with Claude, lifecycle before binding. Guard:
`hooks/guard-lifecycle-ready.mjs`.

## Proposal

Make the outside-root read scope treat `ls` and `rg -o` like the already admitted read shapes,
and let a path the PO named explicitly in the session count as an admitted read target. The
refusal text should name the rule that fired.

## Acceptance

- `ls <PO-named folder>` and `rg -n -o <pattern> <plugin dirs>` are admitted or refused with a
  message naming the exact rule and a typed retry action.
- A regression test pins both shapes.
