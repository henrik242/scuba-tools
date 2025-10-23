/**
 * Gas Blender Calculator with Real Gas Behavior (Z-factors)
 * Uses compressibility factors for accurate gas blending at high pressures
 */

import {
  gasToMoleEquivalents,
  moleEquivalentsToGas,
  addGasToTank,
  drainTank,
  solveForComponentAddPressure,
  solveForAddPressure,
} from "./realGas";

export interface Gas {
  name: string;
  o2: number;
  he: number;
  editable?: boolean;
}

export interface TankState {
  volume: number;
  o2: number;
  he: number;
  pressure: number;
}

export interface TargetGas {
  o2: number;
  he: number;
  pressure: number;
}

export interface BlendingStep {
  action: string;
  gas?: string;
  fromPressure: number;
  toPressure: number;
  addedPressure?: number;
  drainedPressure?: number;
  currentMix: string;
  newMix: string;
  addedVolume?: number;
}

export interface BlendingResult {
  steps: BlendingStep[];
  finalMix: {
    o2: number;
    he: number;
    pressure: number;
  };
  gasUsage: Record<string, number>;
  success: boolean;
  error?: string;
}

// Constants for drain calculations
const DRAIN_THRESHOLD_MOLES = 0.5; // Minimum mole difference to trigger drain
const DRAIN_MIN_FRACTION = 0.001; // Minimum fraction to consider component present
const DRAIN_RATIO_STEP = 0.05; // Step size for drain ratio search
const DRAIN_MAX_RATIO = 0.95; // Maximum drain ratio (keep 5% minimum)
const COMPOSITION_TOLERANCE = 1.0; // Tolerance for O2/He percentage match (%)
const BLENDING_ERROR_THRESHOLD = 2.0; // Max acceptable error for blend simulation
const MIN_PRESSURE_CHANGE = 0.1; // Minimum pressure change to consider (bar)
const MIN_DRAIN_AMOUNT = 0.5; // Minimum drain amount to execute (bar)

const roundTo = (value: number, decimals = 2): number => {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
};

const toPercentLabel = (fraction: number): number => roundTo(fraction * 100, 1);

const createMixLabel = (o2Fraction: number, heFraction: number): string =>
  `${toPercentLabel(o2Fraction)}/${toPercentLabel(heFraction)}`;

/**
 * Helper function to simulate blending after draining to a specific pressure
 * Returns the error between simulated result and target composition
 */
interface DrainSimulationParams {
  currentO2Moles: number;
  currentHeMoles: number;
  currentN2Moles: number;
  currentPressure: number;
  drainPressure: number;
  heGas: Gas;
  topGasO2: number;
  targetHeMoles: number;
  targetO2Pct: number;
  targetHePct: number;
  targetPressure: number;
}

function simulateBlendWithDrain(params: DrainSimulationParams): number {
  const {
    currentO2Moles,
    currentHeMoles,
    currentN2Moles,
    currentPressure,
    drainPressure,
    heGas,
    topGasO2,
    targetHeMoles,
    targetO2Pct,
    targetHePct,
    targetPressure,
  } = params;

  // Simulate draining
  const drainedState = drainTank(
    currentO2Moles,
    currentHeMoles,
    currentN2Moles,
    currentPressure,
    drainPressure,
  );

  // Add helium to reach target He moles
  const heToAdd = solveForComponentAddPressure(
    drainedState.o2Moles,
    drainedState.heMoles,
    drainedState.n2Moles,
    drainedState.newPressure,
    heGas.o2,
    heGas.he,
    targetHeMoles,
    "he",
  );

  if (heToAdd < 0 || heToAdd > targetPressure) {
    return Infinity;
  }

  const withHe = addGasToTank(
    drainedState.o2Moles,
    drainedState.heMoles,
    drainedState.n2Moles,
    drainedState.newPressure,
    heGas.o2,
    heGas.he,
    heToAdd,
  );

  // Top with the specified gas
  const remainingP = targetPressure - withHe.newPressure;
  if (remainingP <= MIN_PRESSURE_CHANGE) {
    return Infinity;
  }

  const final = addGasToTank(
    withHe.o2Moles,
    withHe.heMoles,
    withHe.n2Moles,
    withHe.newPressure,
    topGasO2,
    0,
    remainingP,
  );

  const finalComp = moleEquivalentsToGas(
    final.o2Moles,
    final.heMoles,
    final.n2Moles,
  );

  return (
    Math.abs(finalComp.o2Percent - targetO2Pct) +
    Math.abs(finalComp.hePercent - targetHePct)
  );
}

/**
 * Calculate gas blending steps
 * Algorithm: 1) Drain, 2) Add Helium, 3) Add O2, 4) Add Air/Nitrox
 */
export function calculateBlendingSteps(
  startingGas: TankState,
  targetGas: TargetGas,
  availableGases: Gas[],
): BlendingResult {
  const steps: BlendingStep[] = [];
  const gasUsage: Record<string, number> = {};

  // Validate inputs
  if (
    Number.isFinite(targetGas.o2) &&
    Number.isFinite(targetGas.he) &&
    targetGas.o2 + targetGas.he > 100
  ) {
    return {
      steps: [],
      finalMix: {
        o2: startingGas.o2,
        he: startingGas.he,
        pressure: startingGas.pressure,
      },
      gasUsage: {},
      success: false,
      error: `Target O₂ (${targetGas.o2}%) + He (${targetGas.he}%) exceeds 100%`,
    };
  }

  // Target state
  const targetPressure = targetGas.pressure;

  // Convert current tank state to mole equivalents (real gas)
  let currentPressure = startingGas.pressure;
  let currentMoles = gasToMoleEquivalents(
    startingGas.o2,
    startingGas.he,
    currentPressure,
  );
  let currentO2Moles = currentMoles.o2;
  let currentHeMoles = currentMoles.he;
  let currentN2Moles = currentMoles.n2;

  // Calculate target mole equivalents
  const targetMoles = gasToMoleEquivalents(
    targetGas.o2,
    targetGas.he,
    targetPressure,
  );
  const targetO2Moles = targetMoles.o2;
  const targetHeMoles = targetMoles.he;
  const targetN2Moles = targetMoles.n2;

  let deltaHe = targetHeMoles - currentHeMoles;
  let deltaN2 = targetN2Moles - currentN2Moles;
  let deltaO2 = targetO2Moles - currentO2Moles;

  const getFractions = () => {
    if (currentPressure <= 0.0001) {
      return { o2: 0, he: 0, n2: 0 };
    }

    const gas = moleEquivalentsToGas(
      currentO2Moles,
      currentHeMoles,
      currentN2Moles,
    );

    return {
      o2: gas.o2Percent / 100,
      he: gas.hePercent / 100,
      n2: gas.n2Percent / 100,
    };
  };

  const updateDeltas = () => {
    deltaHe = targetHeMoles - currentHeMoles;
    deltaN2 = targetN2Moles - currentN2Moles;
    deltaO2 = targetO2Moles - currentO2Moles;
  };

  const recordDrain = (toPressure: number, forceComplete = false) => {
    if (currentPressure <= toPressure) {
      return;
    }

    const previousPressure = currentPressure;
    const previousFractions = getFractions();
    const newPressure = forceComplete ? 0 : toPressure;

    // Use real gas drain function
    const drained = drainTank(
      currentO2Moles,
      currentHeMoles,
      currentN2Moles,
      currentPressure,
      newPressure,
    );

    currentPressure = drained.newPressure;
    currentO2Moles = drained.o2Moles;
    currentHeMoles = drained.heMoles;
    currentN2Moles = drained.n2Moles;

    const updatedFractions = getFractions();

    steps.push({
      action: forceComplete
        ? "Drain tank completely"
        : `Drain to ${roundTo(newPressure, 1)} bar`,
      fromPressure: roundTo(previousPressure, 2),
      toPressure: roundTo(newPressure, 2),
      drainedPressure: roundTo(previousPressure - newPressure, 2),
      currentMix: createMixLabel(previousFractions.o2, previousFractions.he),
      newMix: createMixLabel(updatedFractions.o2, updatedFractions.he),
    });

    updateDeltas();
  };

  const recordGasAddition = (
    gas: Gas,
    amount: number,
    label: string,
    decimals = 1,
  ) => {
    const roundedAmount = roundTo(amount, decimals);

    if (roundedAmount <= 0) {
      return;
    }

    const previousPressure = currentPressure;
    const previousFractions = getFractions();

    // Use real gas addition function
    const added = addGasToTank(
      currentO2Moles,
      currentHeMoles,
      currentN2Moles,
      currentPressure,
      gas.o2,
      gas.he,
      roundedAmount,
    );

    currentPressure = added.newPressure;
    currentO2Moles = added.o2Moles;
    currentHeMoles = added.heMoles;
    currentN2Moles = added.n2Moles;

    const updatedFractions = getFractions();

    // Calculate volume in liters (pressure × volume)
    const addedVolume = roundTo(roundedAmount * startingGas.volume, 1);

    // Track gas usage
    if (!gasUsage[gas.name]) {
      gasUsage[gas.name] = 0;
    }
    gasUsage[gas.name] += addedVolume;

    steps.push({
      action: label,
      gas: gas.name,
      fromPressure: roundTo(previousPressure, 2),
      toPressure: roundTo(currentPressure, 2),
      addedPressure: roundedAmount,
      addedVolume,
      currentMix: createMixLabel(previousFractions.o2, previousFractions.he),
      newMix: createMixLabel(updatedFractions.o2, updatedFractions.he),
    });

    updateDeltas();
  };

  updateDeltas();

  // Check if we need to drain and calculate drain pressure
  let needsDrain = false;
  let drainToPressure = currentPressure;
  const fractions = getFractions();

  // Get available gases
  const pureHe = availableGases.find((g) => g.he > 95 && g.o2 < 5);
  const pureO2 = availableGases.find((g) => g.o2 > 95 && g.he < 5);
  const airGases = availableGases
    .filter((g) => g.he < 5 && g.o2 >= 19 && g.o2 <= 40)
    .sort((a, b) => a.o2 - b.o2);
  const trimixGases = availableGases
    .filter((g) => g.he > 30)
    .sort((a, b) => b.he - a.he);

  // Check if we have too much of any component (need to remove gas)
  if (
    deltaHe < -DRAIN_THRESHOLD_MOLES ||
    deltaN2 < -DRAIN_THRESHOLD_MOLES ||
    deltaO2 < -DRAIN_THRESHOLD_MOLES
  ) {
    needsDrain = true;

    // Calculate maximum pressure we can keep for each component
    if (deltaHe < -DRAIN_THRESHOLD_MOLES && fractions.he > DRAIN_MIN_FRACTION) {
      const maxPressureForHe =
        (targetHeMoles / fractions.he) *
        (currentPressure / (currentO2Moles + currentHeMoles + currentN2Moles));
      drainToPressure = Math.min(drainToPressure, maxPressureForHe);
    }
    if (deltaO2 < -DRAIN_THRESHOLD_MOLES && fractions.o2 > DRAIN_MIN_FRACTION) {
      const maxPressureForO2 =
        (targetO2Moles / fractions.o2) *
        (currentPressure / (currentO2Moles + currentHeMoles + currentN2Moles));
      drainToPressure = Math.min(drainToPressure, maxPressureForO2);
    }
    if (deltaN2 < -DRAIN_THRESHOLD_MOLES && fractions.n2 > DRAIN_MIN_FRACTION) {
      const maxPressureForN2 =
        (targetN2Moles / fractions.n2) *
        (currentPressure / (currentO2Moles + currentHeMoles + currentN2Moles));
      drainToPressure = Math.min(drainToPressure, maxPressureForN2);
    }
  }

  // CRITICAL: Also check if current percentages are too high to reach target
  // This handles cases like converting 32% O2 to 18% O2 at higher pressure
  const targetO2Pct = targetGas.o2;
  const targetHePct = targetGas.he;
  const currentO2Pct = fractions.o2 * 100;
  const currentHePct = fractions.he * 100;

  // If current O2% is higher than target and we can't dilute enough with available gases
  if (currentO2Pct > targetO2Pct + COMPOSITION_TOLERANCE) {
    const lowestO2Gas =
      airGases.length > 0
        ? Math.min(...airGases.map((g) => g.o2))
        : pureHe
          ? 0
          : 21; // Use He if available, else Air

    // Check if we can dilute by adding to target pressure
    const remainingPressure = targetPressure - currentPressure;
    if (remainingPressure > 0) {
      const simulated = addGasToTank(
        currentO2Moles,
        currentHeMoles,
        currentN2Moles,
        currentPressure,
        lowestO2Gas,
        0,
        remainingPressure,
      );
      const simulatedComp = moleEquivalentsToGas(
        simulated.o2Moles,
        simulated.heMoles,
        simulated.n2Moles,
      );

      // If we still have too much O2 after filling with lowest O2 gas, we need to drain
      if (simulatedComp.o2Percent > targetO2Pct + COMPOSITION_TOLERANCE * 0.5) {
        needsDrain = true;

        // More sophisticated drain calculation:
        // We need final O2% = targetO2Pct
        // After draining to pressure P_drain, we'll have O2 moles = currentO2Moles * (P_drain / currentPressure)
        // Then we'll add helium and possibly other gases to reach target

        // Strategy: Calculate drain pressure such that after adding required helium + topping gas,
        // we reach target O2%

        // Required helium moles
        const heNeeded = targetHeMoles;

        // After drain and He addition, we want enough room to adjust O2 with final gas
        // Try to drain so that current O2% allows reaching target when mixed with He and top gas

        // Iterative approach: try different drain pressures (including complete drain to 0)
        let bestDrainP = currentPressure * 0.5;
        let bestError = Infinity;

        // Test drain ratios from 0 (complete drain) to DRAIN_MAX_RATIO
        for (
          let drainRatio = 0;
          drainRatio <= DRAIN_MAX_RATIO;
          drainRatio += DRAIN_RATIO_STEP
        ) {
          const testDrainP = currentPressure * drainRatio;
          const error = simulateBlendWithDrain({
            currentO2Moles,
            currentHeMoles,
            currentN2Moles,
            currentPressure,
            drainPressure: testDrainP,
            heGas: {
              name: "He",
              o2: pureHe ? 0 : trimixGases[0]?.o2 || 0,
              he: pureHe ? 100 : trimixGases[0]?.he || 0,
            },
            topGasO2: lowestO2Gas,
            targetHeMoles: heNeeded,
            targetO2Pct,
            targetHePct,
            targetPressure,
          });

          if (error < bestError) {
            bestError = error;
            bestDrainP = testDrainP;
          }
        }

        drainToPressure = Math.min(drainToPressure, bestDrainP);
      }
    }
  }

  // Similar check for helium percentage
  if (
    currentHePct > targetHePct + COMPOSITION_TOLERANCE &&
    currentPressure > 1
  ) {
    needsDrain = true;
    const targetRatio =
      ((targetHePct / 100) * (targetO2Moles + targetHeMoles + targetN2Moles)) /
      Math.max(currentHeMoles, DRAIN_MIN_FRACTION);
    const drainToByHe = currentPressure * Math.min(targetRatio, 0.9);
    drainToPressure = Math.min(drainToPressure, drainToByHe);
  }

  // If we're at/near target pressure but need to add helium, we must drain first
  const heGasForCalc = pureHe || trimixGases[0];
  if (
    deltaHe > DRAIN_THRESHOLD_MOLES &&
    heGasForCalc &&
    currentPressure >= targetPressure - 10
  ) {
    needsDrain = true;
    // Leave room for helium addition
    drainToPressure = Math.min(drainToPressure, targetPressure * 0.5);
  }

  // COMPREHENSIVE DRAIN SEARCH: When we have limited gas selection that makes blending difficult
  // Only use this when we don't have ideal gas sources (pure He + pure O2) or when we suspect
  // the available gases won't allow reaching target without draining
  const hasIdealGases = pureHe && pureO2;
  const hasLimitedGases =
    !hasIdealGases &&
    (deltaHe > DRAIN_THRESHOLD_MOLES ||
      currentO2Pct < targetO2Pct - COMPOSITION_TOLERANCE);

  if (hasLimitedGases && heGasForCalc) {
    // We need to add helium and/or adjust O2, but don't have ideal gas sources
    // Test if draining (including to zero) would allow us to reach target
    const highestO2Gas =
      airGases.length > 0
        ? Math.max(...airGases.map((g) => g.o2))
        : pureO2
          ? 100
          : 21;

    let bestSimDrainP = drainToPressure;
    let bestSimError = Infinity;
    let foundViableSolution = false;

    // First, test WITHOUT draining to see if it's even necessary
    let noDrainError = Infinity;
    if (deltaHe > DRAIN_THRESHOLD_MOLES) {
      const heToAdd = solveForComponentAddPressure(
        currentO2Moles,
        currentHeMoles,
        currentN2Moles,
        currentPressure,
        heGasForCalc.o2,
        heGasForCalc.he,
        targetHeMoles,
        "he",
      );

      if (
        heToAdd >= 0 &&
        heToAdd <= targetPressure &&
        currentPressure + heToAdd <= targetPressure
      ) {
        const withHe = addGasToTank(
          currentO2Moles,
          currentHeMoles,
          currentN2Moles,
          currentPressure,
          heGasForCalc.o2,
          heGasForCalc.he,
          heToAdd,
        );
        const remainingP = targetPressure - withHe.newPressure;

        if (remainingP > MIN_PRESSURE_CHANGE) {
          const final = addGasToTank(
            withHe.o2Moles,
            withHe.heMoles,
            withHe.n2Moles,
            withHe.newPressure,
            highestO2Gas,
            0,
            remainingP,
          );
          const finalComp = moleEquivalentsToGas(
            final.o2Moles,
            final.heMoles,
            final.n2Moles,
          );
          noDrainError =
            Math.abs(finalComp.o2Percent - targetO2Pct) +
            Math.abs(finalComp.hePercent - targetHePct);
        }
      }
    }

    // Only search for drain solutions if NO DRAIN approach won't work
    if (noDrainError > BLENDING_ERROR_THRESHOLD) {
      // Test drain ratios from 0 (complete drain) to DRAIN_MAX_RATIO
      for (
        let drainRatio = 0;
        drainRatio <= DRAIN_MAX_RATIO;
        drainRatio += DRAIN_RATIO_STEP
      ) {
        const testDrainP = currentPressure * drainRatio;
        const error = simulateBlendWithDrain({
          currentO2Moles,
          currentHeMoles,
          currentN2Moles,
          currentPressure,
          drainPressure: testDrainP,
          heGas: heGasForCalc,
          topGasO2: highestO2Gas,
          targetHeMoles,
          targetO2Pct,
          targetHePct,
          targetPressure,
        });

        if (error < bestSimError) {
          bestSimError = error;
          bestSimDrainP = testDrainP;
          // Consider solution viable if error is acceptable
          if (error < BLENDING_ERROR_THRESHOLD) {
            foundViableSolution = true;
          }
        }
      }

      // If we found a viable solution through draining that's better than no drain, use it
      if (foundViableSolution && bestSimError < noDrainError) {
        needsDrain = true;
        drainToPressure = Math.min(drainToPressure, bestSimDrainP);
      }
    }
  }

  // Execute the drain
  if (needsDrain) {
    const targetDrainPressure = roundTo(Math.max(0, drainToPressure), 2);
    const drainedAmount = currentPressure - targetDrainPressure;

    if (
      drainedAmount > MIN_DRAIN_AMOUNT &&
      targetDrainPressure > MIN_DRAIN_AMOUNT
    ) {
      recordDrain(targetDrainPressure);
    } else if (drainedAmount > MIN_DRAIN_AMOUNT) {
      recordDrain(0, true);
    }
  }

  // STEP 1: Add helium if needed
  if (deltaHe > MIN_PRESSURE_CHANGE) {
    const heGas = pureHe || trimixGases[0];

    if (heGas && heGas.he > 0) {
      // Use solver to find correct pressure to add (accounts for Z-factors)
      const heToAdd = solveForComponentAddPressure(
        currentO2Moles,
        currentHeMoles,
        currentN2Moles,
        currentPressure,
        heGas.o2,
        heGas.he,
        targetHeMoles,
        "he",
      );
      recordGasAddition(heGas, heToAdd, `Add ${heGas.name}`, 2);
    }
  }

  // STEP 2: Top up to target pressure
  const remainingPressure = targetPressure - currentPressure;

  if (remainingPressure > 0.1) {
    if (pureO2 && airGases.length === 0) {
      const o2ToAdd = roundTo(remainingPressure, 1);

      if (o2ToAdd > 0.1) {
        recordGasAddition(pureO2, o2ToAdd, `Add ${pureO2.name}`);
      }
    } else if (airGases.length > 0) {
      let bestAirGas = airGases[0];
      let bestDiff = Infinity;

      for (const airGas of airGases) {
        // Simulate adding this air gas to see how close we get
        const testAdded = addGasToTank(
          currentO2Moles,
          currentHeMoles,
          currentN2Moles,
          currentPressure,
          airGas.o2,
          airGas.he,
          remainingPressure,
        );

        const testGas = moleEquivalentsToGas(
          testAdded.o2Moles,
          testAdded.heMoles,
          testAdded.n2Moles,
        );

        const diff =
          Math.abs(testGas.o2Percent - targetGas.o2) +
          Math.abs(testGas.hePercent - targetGas.he);

        if (diff < bestDiff) {
          bestDiff = diff;
          bestAirGas = airGas;
        }
      }

      // When we have pure O2 available and the best gas doesn't get us very close,
      // prefer the LOWEST O2 gas (typically Air) because the two-gas blending
      // algorithm can achieve better precision
      if (pureO2 && bestDiff > 0.7) {
        bestAirGas = airGases.reduce((lowest, current) =>
          current.o2 < lowest.o2 ? current : lowest,
        );
      }

      // Two-gas blending for precise O2 control using real gas mole equivalents
      if (pureO2 && bestAirGas && Math.abs(bestAirGas.o2 - pureO2.o2) > 10) {
        // Use iterative search to find optimal O2 and Air amounts
        // This accounts for real gas Z-factors properly
        const airForBlending = bestAirGas;

        // Strategy: Add O2 first to reach target O2 moles, then top with air
        // But we need to account that air also contains O2

        // Solve using iterative approach
        let bestO2P = 0;
        let bestAirP = 0;
        let bestError = Infinity;

        // Try different ratios of O2 to Air
        const steps = 50;
        for (let i = 0; i <= steps; i++) {
          const ratio = i / steps; // 0 = all air, 1 = all O2

          // Calculate target moles for each gas
          // We want: currentMoles + o2Added + airAdded = targetMoles
          const totalMolesToAdd =
            targetO2Moles + targetN2Moles - currentO2Moles - currentN2Moles;

          if (totalMolesToAdd <= 0) continue;

          // Estimate moles from each source
          const molesToAddAsO2 = totalMolesToAdd * ratio;
          const molesToAddAsAir = totalMolesToAdd * (1 - ratio);

          // Solve for pressures
          const o2P =
            molesToAddAsO2 > 0
              ? solveForAddPressure(
                  currentO2Moles,
                  currentHeMoles,
                  currentN2Moles,
                  currentPressure,
                  100,
                  0,
                  currentO2Moles +
                    currentHeMoles +
                    currentN2Moles +
                    molesToAddAsO2,
                )
              : 0;

          const sim1 =
            o2P > 0
              ? addGasToTank(
                  currentO2Moles,
                  currentHeMoles,
                  currentN2Moles,
                  currentPressure,
                  100,
                  0,
                  o2P,
                )
              : {
                  o2Moles: currentO2Moles,
                  heMoles: currentHeMoles,
                  n2Moles: currentN2Moles,
                  newPressure: currentPressure,
                };

          const airP =
            molesToAddAsAir > 0
              ? solveForAddPressure(
                  sim1.o2Moles,
                  sim1.heMoles,
                  sim1.n2Moles,
                  sim1.newPressure,
                  airForBlending.o2,
                  airForBlending.he,
                  sim1.o2Moles + sim1.heMoles + sim1.n2Moles + molesToAddAsAir,
                )
              : 0;

          const sim2 =
            airP > 0
              ? addGasToTank(
                  sim1.o2Moles,
                  sim1.heMoles,
                  sim1.n2Moles,
                  sim1.newPressure,
                  airForBlending.o2,
                  airForBlending.he,
                  airP,
                )
              : sim1;

          // Check how close we are
          const o2Err = Math.abs(targetO2Moles - sim2.o2Moles);
          const n2Err = Math.abs(targetN2Moles - sim2.n2Moles);
          const pressureErr = Math.abs(targetPressure - sim2.newPressure);
          const totalErr = o2Err + n2Err + pressureErr * 0.01;

          if (totalErr < bestError) {
            bestError = totalErr;
            bestO2P = o2P;
            bestAirP = airP;
          }
        }

        // Add O2 first if needed
        if (bestO2P > 0.1) {
          recordGasAddition(pureO2, bestO2P, `Add ${pureO2.name}`);
        }

        // Then add air/nitrox
        if (bestAirP > 0.1) {
          recordGasAddition(
            bestAirGas,
            bestAirP,
            `Top up with ${bestAirGas.name}`,
          );
        }
      } else {
        // Single-gas topping
        const topPressure = roundTo(remainingPressure, 1);
        if (topPressure > 0.1) {
          recordGasAddition(bestAirGas, topPressure, `Add ${bestAirGas.name}`);
        }
      }
    }
  }

  // Calculate final mix
  const finalFractions = getFractions();
  const finalMix = {
    o2: toPercentLabel(finalFractions.o2),
    he: toPercentLabel(finalFractions.he),
    pressure: roundTo(currentPressure, 1),
  };

  // Check if we're close enough to target (lenient tolerance for real gas with rounding)
  const o2Error = Math.abs(finalMix.o2 - targetGas.o2);
  const heError = Math.abs(finalMix.he - targetGas.he);
  const pressureError = Math.abs(finalMix.pressure - targetGas.pressure);

  // Real gas: allow up to 1% composition error and 2 bar pressure error
  if (o2Error > 1.0 || heError > 1.0 || pressureError > 2) {
    return {
      steps,
      finalMix,
      gasUsage,
      success: false,
      error: `Unable to reach target mix accurately. Final: ${finalMix.o2}/${finalMix.he} at ${finalMix.pressure} bar. Try adjusting available gases.`,
    };
  }

  return { steps, finalMix, gasUsage, success: true };
}
