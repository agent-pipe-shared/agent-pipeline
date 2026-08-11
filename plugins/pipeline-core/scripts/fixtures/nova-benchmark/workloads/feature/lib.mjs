// SPDX-License-Identifier: SUL-1.0
// NVA-A8-RUNNER "feature" workload: one pure function imported by task.mjs.
export function clampToRange(value, min, max) {
  return Math.min(Math.max(value, min), max);
}
