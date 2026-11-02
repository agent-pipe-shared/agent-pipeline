# w115 — g23-read-help and agy-item-delivery suites independent of the checkout location

Candidate 19, base `28060444a` (the candidate 18 stamp `63d505ca3` plus docs). Touches two test files only.

## Why

Full Verify 5 (and 2, 3) left two suites red in any clone below the home directory and green in the main tree. Both were called "clone-location effects" without a root cause; the cause is now measured.

- `agy-item-delivery-tests` (all six cases red, `EACCES` on `mkdir` of a `fixtures` folder directly below `/home`): the fixture parent was `new URL('../../../../../fixtures/', import.meta.url)`, five levels above the test file. For a checkout at `<home>/src/<name>` that is the home directory itself (it silently created `<home>/fixtures` on the PO machine); for a clone directly below the home directory it is the unwritable parent of the home directory. Fix: four levels up, the checkout's parent, still outside the repository tree. The OS temp folder was tried and does not work (AGYID04/05: the Source member reads `unavailable` there), so the fixture must stay outside `tmpdir()` and outside the checkout.
- `g23-read-help-tests`, case G23C001 (`ls -lh ../` expected refused): `ls` of a directory above the project root is refused by the passive read policy only when the listing would contain something it refuses (a credential-named file). The test's parent was the repository's own `scratch/`, which holds such files in a long-used checkout and nothing in a fresh clone. Measured with a probe: with a `.env` planted in the parent the command is refused in the clone too. Fix: the fixture owns its parent (`outer/project`) and plants the `.env` itself. The intent of the case (a listing above the root is refused) is kept; the assertion is not weakened.

## Evidence

- Before, in a clone directly below the home directory: agy 0 of 6 pass, g23 3 of 4 pass.
- After, in a clone directly below the home directory and in a clone nested under the main tree's `scratch/`: agy 6 of 6, g23 4 of 4.
- Not yet proven: a Full Verify run (both suites also run there) and the main tree, which only exists after the PO applies candidate 19.

## Follow-up

- The main tree will write the agy fixtures to `<home>/src/fixtures` instead of `<home>/fixtures` (both outside the repository; the old folder can be deleted by hand).
- The Critic preimage pin and `security-scan` stay open by design (PO re-pin, `--remote upstream`).
