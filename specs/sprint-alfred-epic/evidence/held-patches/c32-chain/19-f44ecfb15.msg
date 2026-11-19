fix(resume-hint): a capitalised German compound with hyphens is no key

A second Antigravity greenfield report: capturing a resume hint was refused because the project name "Familien-Küchen-Tablet-App" read as an opaque token. The length-24 rule of the token check fires on any word of 24 or more characters joined by hyphens, and its ASCII-only normalisation dropped the umlaut. In candidate 32 only the refusal text was improved; the PO decided on 2026-11-19 that ordinary German must pass.

A token that is capitalised words, short capital abbreviations and one- or two-digit numbers joined by hyphens (umlauts and ß count as letters) is not opaque. Random keys are not capitalised word by word, so keys with digits inside a segment, hex tails, vendor prefixes and lower-case hyphenated words (documentation-reconciliation-status) are still refused, and the length-24 diagnosis no longer fires on an admitted compound. A case pins the admitted and the refused shapes.

The earlier diagnosis case used the same compound as its "refused" example; it is restated with a lower-case hyphenated word (a changed requirement, QG-04), and a new case asserts that the compound is admitted and needs no hint.

AI-Assisted: true
Dispatch: stage-0 (elephant)
