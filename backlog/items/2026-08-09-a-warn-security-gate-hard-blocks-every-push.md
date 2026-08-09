---
schema: pipeline.backlog-item.v1
id: pipeline.warn-security-gate-hard-blocks-every-push
type: defect
owner: pipeline
status: open
created: 2026-08-09
source: "Found by measuring whether a freshly seeded consumer can satisfy a `security` gate, 2026-08-09, while closing `pipeline.push-gate-is-silent-in-every-consumer-project`."
due: 2026-08-16
---

# `gates.security.mode: warn` does not warn — it blocks, under the push gate's mode

## What happens

`guard-push.mjs` triggers its security checks whenever `gates.security` exists and
its mode is not `off`:

```js
const securityGate = gateConfig(manifest, "security");
if (securityGate && securityGate.mode !== "off") {
  failures.push(...checkSecurityEvidenceBinding());
  failures.push(...checkSecurityCompleteness({ … }));
}
```

Every finding goes into the **same `failures` array** as the verify and approval
findings. That array is then dispatched once, at the end, against
`pushGate.mode` — the **push** gate's mode, not the security gate's:

```js
if (pushGate.mode === "warn") emit(1, message);
emit(2, message); // blocking, or any unrecognized non-"off" value
```

So `security: {mode: warn}` beside `push: {mode: blocking}` produces exit 2. The
security gate's own mode is read exactly once, to decide whether to run the checks
at all. It has no say in what their findings cost.

## Measured

A fresh consumer with `security: {mode: warn, type: automated}` declared and no
security evidence:

```
exit=2
BLOCKED (guard-push): Push-Gate check failed (4 finding(s)):
  1. evidence/security-latest.json missing
  2. evidence/security-latest.v2.json missing
  3. evidence/security-latest.v2.verdict.json missing
  4. Push approval missing: …
```

Three of the four findings are the `warn` gate, and the push is refused.

## Why it matters

`warn` is the mode an adopter reaches for to *start* using a gate — see what it
would say before making it binding. Here it is indistinguishable from `blocking`,
so there is no on-ramp: a project either has no security gate or has a blocking
one. That is also why the 2026-08-09 candidate seeds `security: off` rather than
`warn`; seeding the honest-looking `warn` would have blocked every consumer push.

The `mode` values are documented in `pipeline-manifest.schema.json` as
"blocking: violations exit 2 · warn: violations exit 1, never block". For this
gate that documentation is false.

## Direction

Findings need to carry the mode of the gate that produced them, rather than being
merged into one list dispatched under one gate's mode. The smallest honest shape
is two lists — blocking findings and warning findings — with the exit derived from
whether the blocking list is empty, and the warnings always printed.

Worth checking in the same task whether any other gate's findings are dispatched
under a different gate's mode. The composition is easy to repeat.

## Why it is filed rather than fixed

`guard-push.test.mjs` and `guard-push-v2.test.mjs` are TP-5 protected, and the
session that measured this had just changed the seed of the hook they gate. A
behavioural change to the mode dispatch without being able to write its test is
exactly what TP-5 refuses (QG-04, `roles/goldfish.md` GF-04). It needs its own
briefed task with the clearance that requires.

## Related

- `2026-08-09-the-push-gate-is-silent-in-every-consumer-project.md` — closed; this
  was found while measuring its satisfying path.
- `2026-08-09-onboarding-sends-every-agent-to-a-directory-the-project-does-not-ignore.md`
  — the `.gitignore` gap, which is the first of the three reasons the security
  gate cannot be satisfied at all.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
