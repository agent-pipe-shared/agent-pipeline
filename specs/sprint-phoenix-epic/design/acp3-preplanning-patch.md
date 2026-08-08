# Staged patch — AC-P3's second clause, awaiting one TP-3 window

**Status: NOT APPLIED.** `harness/scripts/verify.mjs` is TP-3-protected. This
document stages the exact change so the window is spent on applying and
demonstrating it, not on designing it — the same shape
`verify-registration-patch.md` used for the 105 registration lines.

## What is unsatisfied, precisely

AC-P3: "A duplicate suite id in any registration array makes verify exit
non-zero with a message naming the duplicate — **rather than throwing before
planning, as it does today**."

| clause | state at `bcca6bb` |
|---|---|
| verify exits non-zero | already true |
| the message names the duplicate | **true since `27456fa`** — `VERIFY-JOURNAL-FAILED: Verify suite registration is invalid: duplicate suite id "…", registered again at index N` |
| reported rather than thrown before planning | **false** — `verify-resume.mjs:114` throws, `verify.mjs:617-620` catches, and zero suites run |

The consequence is not cosmetic. Because the throw happens inside
`runVerifyJournal`, the `verify-suite-registration-check` step — registered in
`TEST_SUITES` at `verify.mjs:540` — never executes for the duplicate class. The
check that R1.4 introduced to catch duplicates is structurally unreachable for
the defect it was written for. It fires only when a human runs the checker by
hand, which is the "appearance of coverage" this phase exists to remove.

## The change

Insert one block in `harness/scripts/verify.mjs` immediately **before** the
`try { verifyRun = runVerifyJournal({…}) }` at `:591`, inside the existing
`else` branch where `registeredSuites` has just been assembled at `:590`:

```js
      // AC-P3/R1.4: report a duplicate registration as a step rather than
      // letting planVerifyResume throw before any suite runs. Without this the
      // registration check below never executes for the defect class it was
      // written to catch, because the throw aborts the whole journal.
      const registrationDuplicates = duplicateSuiteIds(registeredSuites);
      if (registrationDuplicates.length > 0) {
        for (const duplicate of registrationDuplicates) {
          console.error(`VERIFY-REGISTRATION-DUPLICATE: suite id ${JSON.stringify(duplicate.id)} is registered ${duplicate.count} times`);
        }
        steps.push({ name: "verify-suite-registration-duplicates", exitCode: 1 });
      } else {
        try {
          verifyRun = runVerifyJournal({ /* unchanged */ });
          …
        } catch (error) { /* unchanged */ }
      }
```

`duplicateSuiteIds` is a new named export of
`harness/scripts/check-verify-suite-registration.mjs`, so the duplicate rule has
exactly one definition and the CLI and the gate cannot drift apart. It takes the
assembled `registeredSuites` array and returns `[{ id, count }]`, sorted by id.

**Deliberately not done this way:** calling the checker as a subprocess before
planning. It would re-read and re-parse `verify.mjs` from disk to rediscover
arrays the caller already holds in memory, and it would make the gate depend on
its own source text rather than on the values it is about to run.

## Why the demonstration also needs the window

AC-P2's clause — "demonstrated by deliberate break and restore, not asserted" —
carries over. Demonstrating this end to end means putting a real duplicate into
`verify.mjs`'s own registration arrays and running the real gate. That edit is
the protected one. A fixture cannot stand in: the whole finding is that the
fixture-level check passes while the gate-level path is unreachable.

## The window's contents, stated as a number

Two edits to one protected file: the block above, and the duplicate injected and
removed again by a capture script. Plus one unprotected file
(`check-verify-suite-registration.mjs`) gaining the shared export, which needs
no window. The prior window carried 105 lines; this one carries roughly 12.

## Acceptance for the window

1. `node harness/scripts/verify.mjs` with a duplicate present exits non-zero,
   prints a line naming the duplicated id, and its evidence artifact records
   `verify-suite-registration-duplicates` as the failing step.
2. Suites still run: the duplicate must not abort the journal, so the step list
   is longer than one entry.
3. Restore leaves `verify.mjs` byte-identical by sha256 with a clean porcelain.
4. The whole cycle is machine-captured, like
   `evidence/phx-acp2-demonstration.txt` and `evidence/phx-acp3-name.txt`.
