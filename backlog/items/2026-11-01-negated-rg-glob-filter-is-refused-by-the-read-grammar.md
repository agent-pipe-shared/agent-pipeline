---
schema: pipeline.backlog-item.v1
id: pipeline.negated-rg-glob-filter-is-refused-by-the-read-grammar
type: workflow-improvement
owner: pipeline
status: open
done_when: manual
release: 0.7.1
created: 2026-11-01
sprint: alfred
source: "PO instruction (2026-11-01): glob and ls are only reads, allow them. Measured: a negated rg glob is refused; ls -lh on an admitted directory is already admitted."
---

# A negated rg glob filter is refused by the closed read grammar

## What happened

`rg -l <pattern> <dir> --glob '!*.patch'` ends in `GUARD-READ-COMMAND-UNSUPPORTED`. `isBoundedFilenameFilter` (`hooks/guard-command-grammar.mjs`)
admits only `*.ext` and `*.test.ext`; two pins (`g23-read-help.test.mjs`, AP3 of `claude-windows-guard-refuses-every-in-repo-read.test.mjs`) named
`!*.md` as refused. A negated filter only excludes, so it narrows the traversal and cannot reach a hidden, credential or parent path.

The PO named `ls` as well. In the source grammar `ls -l`, `-h`, `-lh` on an admitted directory is already admitted (generic read lane); nothing was
changed there. Where `ls` was refused is not established.

## Delivery

Held patch `w11-rg-negated-glob-filters-are-read-only-d232` (decision D232): negated bounded filters admitted, positive filters unchanged.

## Open (PO tiles)

- Where was `ls` refused (runner, Windows PowerShell, the native Glob tool, an older installed hook)? The exact command and the denial text decide.
- Positive filters beyond the closed extension grammar (`**/*.md`, `*.tar.gz`, `*.{md,txt}`): admit, and how far (they override ignore rules).
