// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import test from "node:test";
import { runConsentCommand } from "./agy-session-consent.mjs";

test("consent CLI requires an explicit command, repository and session", async () => {
  await assert.rejects(() => runConsentCommand([]), /Usage/u);
  await assert.rejects(() => runConsentCommand(["inspect", "--root", "/does/not/exist", "--session-id", "s"]), /ENOENT|WT-REPOSITORY/u);
});
