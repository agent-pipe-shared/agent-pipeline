#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const scriptDirectory = resolve(fileURLToPath(new URL(".", import.meta.url)));
const document = readFileSync(resolve(scriptDirectory, "../../../docs/phoenix-governance-threat-model.md"), "utf8");

test("PHX-0/PHX-1 governance threat model inventories transport and event-store trust boundaries", () => {
  for (const required of [
    "## Assets and trust boundaries",
    "## Abuse cases and mitigations",
    "## Operating and recovery rules",
    "AC13 — transport binding",
    "AC14 — privacy/output",
    "boundary ID",
    "request hash",
    "host-transport-required",
    "HOME, cache, credential, private remote",
    "Dev-Plan State authority",
    "readProjectAuthority()",
    "legacy-path fallback",
    "Portable governance events",
    "Restricted governance record",
    "Restricted key material",
    "default-deny capture policy",
    "prefix-valid",
    "write-ahead journal",
    "destroy-key",
    "K-AC-01 — portable admission",
    "K-AC-07 — recovery and restricted operations",
  ]) assert.equal(document.includes(required), true, `missing governed threat-model inventory: ${required}`);
});
