#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

import assert from "node:assert/strict";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  ONBOARDING_CONSENT_MARK_SCHEMA,
  onboardingConsentMarkerPath,
  recordOnboardingConsent,
} from "./onboarding-consent-mark.mjs";

test("records a session-scoped yes/no marker atomically", () => {
  const root = mkdtempSync(join(tmpdir(), "onboarding-consent-mark-"));
  try {
    const result = recordOnboardingConsent(root, "session-1", "no", "2026-08-20T00:00:00.000Z");
    assert.equal(result.markerPath, onboardingConsentMarkerPath(root, "session-1"));
    assert.equal(existsSync(result.markerPath), true);
    assert.deepEqual(JSON.parse(readFileSync(result.markerPath, "utf8")), {
      schema: ONBOARDING_CONSENT_MARK_SCHEMA,
      sessionId: "session-1",
      answer: "no",
      recordedAt: "2026-08-20T00:00:00.000Z",
    });
  } finally { rmSync(root, { recursive: true, force: true }); }
});
