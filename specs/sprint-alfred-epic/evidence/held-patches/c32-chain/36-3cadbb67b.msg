docs(backlog): the module and size bounds themselves are verified first, before any remediation of the Pipeline's own source

PO decision 2026-11-19: candidate 32 carries only the honest backlog item. Before anything is optimised, the bounds the Pipeline measures itself against need to be verified: a 1000-line limit may be too low for an agent (more files, more imports and more navigation can cost an agent as much as a big file), the five-module cut is an inherited default, and this repository is not a large project (a business system with many bounded contexts is the case the rules must hold for). The item now names that as step 0 with the evidence needed (external research on module and file sizing for agent-assisted development and large modular systems, checked against what the product implements) and says that the shipped default stays and is not presented as a validated figure until the bounds are decided; the staged remediation is to be re-cut against the decided bounds.

AI-Assisted: true
Dispatch: stage-0 (elephant)
