docs(user): the overview and the what's-new page are written for an outside reader, and the Reader inputs follow the new classification

Second step of the user documentation rewrite (a developer in a regulated company who evaluates the product, few details, no internal history). overview.md opened with working names, a table of two internal product strands, a sprint name and three paragraphs of release disclaimers; it now says what the product is for, what you get, which runners it works with, what 0.7.0 adds, its status in one paragraph (the anchor the other pages link to is kept) and where to start. whats-new-0.7.0.md lost the section that listed the defects of the test runs and their fixes, which is history to a reader, and gained the two items of this release a user meets (the HTML script sources in the boundary check, the wait rule and --help on the close scripts); the German reader version follows the English one. known-issues.md drops the row about a defect that is fixed in the release and speaks of 0.7.0, not of a candidate. The documentation map describes the overview by what it holds.

sync-reader-inputs.mjs follows the classification change of the previous docs commit: the mirror of governance/observation-doc-governance.json, the manifest and the two pins.

AI-Assisted: true
Dispatch: stage-0 (elephant)
