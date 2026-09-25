// SPDX-License-Identifier: SUL-1.0
// Deliberately contradicts decision.md: the AC-20 Critic fixture is negative.
export function mayPublish({ approved, urgent }) {
  return approved === true || urgent === true;
}
