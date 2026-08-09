---
schema: pipeline.backlog-item.v1
id: pipeline.resume-hint-opaque-token-rejects-hyphenated-english
type: defect
owner: pipeline
status: open
created: 2026-08-09
source: "Found via a purpose-written probe script isolating which of twelve candidate strings caused `resume-hint.mjs capture` to fail; confirmed at source (plugins/pipeline-core/lib/resume-hint.mjs) under dispatch PHX-BL2 (2026-08-09)."
due: 2026-09-08
---

# The resume-hint validator rejects ordinary English as credential-shaped, and fails without saying why

## Description

`opaqueToken()` in `plugins/pipeline-core/lib/resume-hint.mjs` treats a
whitespace-delimited token of 24+ characters that contains `-`, `_`, or `=`
as an opaque (credential-shaped) value and rejects it via `validText()`. This
rejects ordinary hyphenated English compound words that happen to be long
enough, with no way to tell that from a real token. Two distinct defects, not
one: the false positive itself, and that `capture` fails with a bare
`RH-SCHEMA` code naming neither the offending field nor the rule that
rejected it — the second is arguably worse than the first, since the first
only costs a rewrite once found, while the second cost a purpose-written
probe script and a bisect through twelve candidate strings to find which one
was at fault.

## Triggering situation

Verified at source, quoted directly
(`plugins/pipeline-core/lib/resume-hint.mjs:31-37`):

```
function opaqueToken(value) {
  return value.split(/\s+/).some((token) => {
    const compact = token.replace(/[^A-Za-z0-9_=-]/g, "");
    if (compact.length < 16) return false;
    const hasLower = /[a-z]/.test(compact); const hasUpper = /[A-Z]/.test(compact); const hasDigit = /\d/.test(compact);
    return /^[A-Z0-9]{16,}$/.test(compact) || (hasLower && hasUpper && hasDigit) || (compact.length >= 24 && (hasDigit || /[_=-]/.test(compact)));
  });
}
```

Two confirmed instances, both ordinary lowercase hyphenated English
compounds with no digits, both 28 characters (confirmed by direct length
check, `node -e` on each literal):

- `documentation-reconciliation` — length 28.
- `checked-and-divergence-filed` — length 28.

Each, used as a word inside a `context` field value, causes
`resume-hint.mjs`'s `captureResumeHint`/`buildResumeHint` path to throw
`RH-SCHEMA` via `validateResumeHint`, because `compact.length >= 24 &&
/[_=-]/.test(compact)` is true for a plain hyphenated compound of that
length — no digit, no case-mixing, no credential shape beyond "long and
hyphenated". `validateResumeHint` on rejection returns only `{ ok: false,
code: "RH-SCHEMA" }` (line 54) — the same code covers schema-shape failure,
context-size overflow, timestamp failure, basis failure, *and* this
opaque-token failure, with no field name or rule identifier distinguishing
any of them. `buildResumeHint` (line 63) surfaces this as `throw new
Error(checked.code)` — literally the string `RH-SCHEMA` and nothing else.

## Affected artifact

`plugins/pipeline-core/lib/resume-hint.mjs` — `opaqueToken()` (detector),
`validateResumeHint()` (the single undifferentiated `RH-SCHEMA` failure
path), `buildResumeHint()` (propagates the bare code with no context).

## Proposal

Two separable proposals, deliberately not one fix:

1. **Diagnostic half (low risk, propose directly):** name the field and the
   specific rule that rejected it in the failure — e.g. distinguish
   `RH-SCHEMA` outcomes by which `exact(...)`/`validText`/`opaqueToken`/etc.
   check failed, and for an `opaqueToken` rejection specifically, include
   which token and which of the three disjuncts (`/^[A-Z0-9]{16,}$/`,
   mixed-case+digit, or `length >= 24` with digit/`[_=-]`) matched. This is
   what would have turned the twelve-string bisect into a direct read.

2. **Detector half (do not propose a specific relaxation without evidence):**
   a length-plus-alphabet heuristic cannot distinguish a long compound word
   from an opaque token by construction — both are "long, contains `-`, no
   whitespace". Widening the heuristic (e.g. requiring a digit unconditionally,
   or raising the length floor) risks the opposite error, letting an actual
   opaque token (many of which are exactly this length and shape, per the
   module's own `SENSITIVE_OR_CONTROLLED_TEXT` regex neighbors like
   `[0-9a-f]{16,}` or `ghp_`/`sk-` prefixes) through unflagged. This item
   files the defect and its evidence; it does not propose a replacement rule.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
