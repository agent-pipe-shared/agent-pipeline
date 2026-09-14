#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * architecture-remedy.mjs -- Remedy comparison generator with anti-fragmentation enforcement.
 * Proposes conformant architectural remedies with trade-off comparisons (AC-21, AC-22, WP-D2, Doctrine §5.3).
 */

export const REMEDY_PENALTY_FRAGMENTATION = 95;

/**
 * Checks whether proposed changes or remedy represent misleading tiny-module optimization.
 */
export function isMisleadingTinyModuleOptimization(remedyOrChanges) {
  if (!remedyOrChanges) return false;

  const id = (remedyOrChanges.id || "").toLowerCase();
  const desc = (remedyOrChanges.description || "").toLowerCase();
  const name = (remedyOrChanges.name || "").toLowerCase();
  const text = `${id} ${desc} ${name}`;

  const tinyIndicators = [
    "tiny-module",
    "tiny_module",
    "tiny module",
    "micro-module",
    "micro_module",
    "micro module",
    "tiny-file",
    "tiny file",
    "shred-topology",
    "shred topology",
    "shredding",
    "fragment-into-tiny",
    "fragment into tiny",
    "fragment-topology",
    "fragment topology",
    "fragmentation"
  ];

  if (tinyIndicators.some((kw) => text.includes(kw))) {
    return true;
  }

  if (remedyOrChanges.splitIntoTinyModules === true ||
      remedyOrChanges.shredTopology === true ||
      remedyOrChanges.strategy === "tiny-modules" ||
      remedyOrChanges.isTinyModuleOptimization === true) {
    return true;
  }

  return false;
}

/**
 * Evaluates architectural findings and proposes conformant remedies with trade-off comparisons.
 *
 * @param {Object} options
 * @param {string} options.findingType - Type of finding (e.g. 'contract-violation', 'boundary-crossing', etc.)
 * @param {Object|string} options.currentModule - Module ID or module record encountering the finding
 * @param {Array|Object} [options.proposedChanges] - Optional candidate changes proposed for review
 * @returns {Object} { remedies: Array<{ id, description, churnScore, conformant, recommendation }>, bestRemedy }
 */
export function compareRemedies({ findingType, currentModule, proposedChanges }) {
  const moduleId = typeof currentModule === "string" ? currentModule : (currentModule?.id || "unknown");
  const remedies = [];

  // Check if explicit candidate remedies were provided in proposedChanges
  const candidates = Array.isArray(proposedChanges)
    ? proposedChanges
    : (proposedChanges?.candidates || (proposedChanges?.id ? [proposedChanges] : []));

  if (candidates.length > 0) {
    for (const candidate of candidates) {
      const isFragmenting = isMisleadingTinyModuleOptimization(candidate);
      if (isFragmenting) {
        remedies.push({
          id: candidate.id || "tiny-module-optimization",
          description: candidate.description || "Split into tiny micro-modules to circumvent boundary metrics.",
          churnScore: REMEDY_PENALTY_FRAGMENTATION,
          conformant: false,
          recommendation: "Rejected per AC-21: misleading tiny-module optimization fragments topology without architectural justification."
        });
      } else {
        remedies.push({
          id: candidate.id || "proposed-remedy",
          description: candidate.description || "Custom proposed architectural change.",
          churnScore: Number.isFinite(candidate.churnScore) ? candidate.churnScore : 25,
          conformant: candidate.conformant !== false,
          recommendation: candidate.recommendation || "Evaluate trade-offs against module stability."
        });
      }
    }
  }

  // Generate standard conformant remedies based on findingType if none or additive
  if (findingType === "contract-violation" || findingType === "missing-contract" || findingType === "contract-mismatch") {
    remedies.push(
      {
        id: "clarify-and-generate-contract",
        description: `Declare and document public input/output/error contracts in ${moduleId} concept file frontmatter.`,
        churnScore: 10,
        conformant: true,
        recommendation: "(Recommended) Clarify public contract in module frontmatter; preserves stable boundaries with minimal churn."
      },
      {
        id: "introduce-stable-facade",
        description: `Introduce an explicit contract facade/adapter in ${moduleId} to shield caller from internals.`,
        churnScore: 30,
        conformant: true,
        recommendation: "Encapsulate cross-module communication inside a dedicated facade without modifying core boundary."
      },
      {
        id: "tiny-module-optimization",
        description: "Split module into micro-files to artificially satisfy contract locality metric.",
        churnScore: REMEDY_PENALTY_FRAGMENTATION,
        conformant: false,
        recommendation: "Rejected per AC-21: misleading tiny-module optimization fragments topology without architectural justification."
      }
    );
  } else if (findingType === "boundary-crossing" || findingType === "unauthorized-dependency" || findingType === "dependency-direction-violation") {
    remedies.push(
      {
        id: "invert-dependency",
        description: `Invert dependency direction via dependency injection, event dispatch, or contract callbacks in ${moduleId}.`,
        churnScore: 25,
        conformant: true,
        recommendation: "(Recommended) Invert dependency to preserve governed architectural flow."
      },
      {
        id: "record-adr-and-realign-boundary",
        description: "Propose an architectural decision record (ADR) under D1 to formally authorize the boundary crossing.",
        churnScore: 35,
        conformant: true,
        recommendation: "Formalize boundary evolution through durable ADR review and update allowedDependencies."
      },
      {
        id: "tiny-module-optimization",
        description: "Shred boundary-crossing code into micro-modules to evade dependency enforcement.",
        churnScore: REMEDY_PENALTY_FRAGMENTATION,
        conformant: false,
        recommendation: "Rejected per AC-21: misleading tiny-module optimization fragments topology without architectural justification."
      }
    );
  } else if (candidates.length === 0) {
    // Generic finding without candidate remedies
    remedies.push(
      {
        id: "localize-contract",
        description: `Localize contract and verification entry points within ${moduleId}.`,
        churnScore: 20,
        conformant: true,
        recommendation: "(Recommended) Address finding locally within declared module boundary."
      },
      {
        id: "realign-boundaries-via-adr",
        description: "Submit an ADR proposing an intentional boundary realignment.",
        churnScore: 40,
        conformant: true,
        recommendation: "Seek durable architectural decision approval before mutating topology."
      }
    );
  }

  // Anti-fragmentation filter & best remedy selection
  const conformantRemedies = remedies
    .filter((r) => r.conformant)
    .sort((a, b) => a.churnScore - b.churnScore);

  const bestRemedy = conformantRemedies.length > 0 ? conformantRemedies[0] : null;

  return {
    findingType,
    currentModule: moduleId,
    remedies,
    bestRemedy
  };
}
