// SPDX-License-Identifier: SUL-1.0
// The guard alone owns activation and branding. Evidence hashes are descriptive.
import { readOwnedDispatchBudgetLaunchObservation } from "../hooks/guard-dispatch-budget.mjs";

export function readDispatchBudgetLaunchObservation(input = {}) {
  return readOwnedDispatchBudgetLaunchObservation(input);
}
