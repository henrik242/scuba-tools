/**
 * Gas Blender Calculator
 * Uses partial pressure calculations for accurate gas blending
 */

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

const roundTo = (value: number, decimals = 2): number => {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
};

const toPercentLabel = (fraction: number): number => roundTo(fraction * 100, 1);

const createMixLabel = (o2Fraction: number, heFraction: number): string =>
  `${toPercentLabel(o2Fraction)}/${toPercentLabel(heFraction)}`;

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
  if (targetGas.o2 + targetGas.he > 100) {
    return {
      steps: [],
      finalMix: {
        o2: startingGas.o2,
        he: startingGas.he,
        pressure: startingGas.pressure,
      },
      gasUsage: {},
      success: false,
      error: "Target O₂ + He exceeds 100%",
    };
  }

  // Target state
  const targetPressure = targetGas.pressure;
  const targetO2Fraction = targetGas.o2 / 100;
  const targetHeFraction = targetGas.he / 100;
  const targetN2Fraction = 1 - targetO2Fraction - targetHeFraction;

  // Calculate target partial pressures
  const targetO2PP = targetO2Fraction * targetPressure;
  const targetHePP = targetHeFraction * targetPressure;
  const targetN2PP = targetN2Fraction * targetPressure;

  // Current state represented by partial pressures
  let currentPressure = startingGas.pressure;
  let currentO2PP = (startingGas.o2 / 100) * currentPressure;
  let currentHePP = (startingGas.he / 100) * currentPressure;
  let currentN2PP = Math.max(0, currentPressure - currentO2PP - currentHePP);

  let deltaHe = 0;
  let deltaN2 = 0;
  let deltaO2 = 0;

  const getFractions = () => {
    if (currentPressure <= 0.0001) {
      return { o2: 0, he: 0, n2: 0 };
    }

    const o2 = currentO2PP / currentPressure;
    const he = currentHePP / currentPressure;
    const n2 = Math.max(0, 1 - o2 - he);

    return { o2, he, n2 };
  };

  const updateDeltas = () => {
    deltaHe = targetHePP - currentHePP;
    deltaN2 = targetN2PP - currentN2PP;
    deltaO2 = targetO2PP - currentO2PP;
  };

  const recordDrain = (toPressure: number, forceComplete = false) => {
    if (currentPressure <= toPressure) {
      return;
    }

    const previousPressure = currentPressure;
    const previousFractions = getFractions();
    const newPressure = forceComplete ? 0 : toPressure;
    const ratio = previousPressure > 0 ? newPressure / previousPressure : 0;

    currentPressure = newPressure;
    currentO2PP *= ratio;
    currentHePP *= ratio;
    currentN2PP *= ratio;

    const updatedFractions = getFractions();

    steps.push({
      action: forceComplete
        ? "Drain tank completely"
        : `Drain to ${roundTo(newPressure, 2)} bar`,
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

    const inertPercent = Math.max(0, 100 - gas.o2 - gas.he);
    const o2Added = (gas.o2 / 100) * roundedAmount;
    const heAdded = (gas.he / 100) * roundedAmount;
    const n2Added = (inertPercent / 100) * roundedAmount;

    currentO2PP += o2Added;
    currentHePP += heAdded;
    currentN2PP += n2Added;
    currentPressure += roundedAmount;

    currentN2PP = Math.max(0, currentN2PP);

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

  // STEP 0: Check if we need to drain and calculate drain pressure
  let needsDrain = false;
  let drainToPressure = currentPressure;
  const fractions = getFractions();

  // Get available gases
  const pureHe = availableGases.find((g) => g.he > 95 && g.o2 < 5);
  const pureO2 = availableGases.find((g) => g.o2 > 95 && g.he < 5);
  const airGases = availableGases
    .filter((g) => g.he < 5 && g.o2 >= 19 && g.o2 <= 40)
    .sort((a, b) => a.o2 - b.o2);

  // Check if we have too much of any component (need to remove gas)
  if (deltaHe < -0.5 || deltaN2 < -0.5 || deltaO2 < -0.5) {
    needsDrain = true;

    // Calculate maximum pressure we can keep for each component
    if (deltaHe < -0.5 && fractions.he > 0.001) {
      drainToPressure = Math.min(drainToPressure, targetHePP / fractions.he);
    }
    if (deltaO2 < -0.5 && fractions.o2 > 0.001) {
      drainToPressure = Math.min(drainToPressure, targetO2PP / fractions.o2);
    }
    if (deltaN2 < -0.5 && fractions.n2 > 0.001) {
      drainToPressure = Math.min(drainToPressure, targetN2PP / fractions.n2);
    }
  }

  // Get trimix gases for potential drain calculation
  const trimixGases = availableGases
    .filter((g) => g.he > 30)
    .sort((a, b) => b.he - a.he);

  // Calculate drain pressure for helium blending scenarios
  // Sequence: Drain → Add He → Top with Air/O2
  const heGasForCalc = pureHe || trimixGases[0];

  if (deltaHe > 0.5 && heGasForCalc && airGases.length > 0) {
    const heGasHeFrac = heGasForCalc.he / 100;
    const heGasN2Frac = (100 - heGasForCalc.o2 - heGasForCalc.he) / 100;

    const airGas = airGases[0];
    const airO2Frac = airGas.o2 / 100;
    const airN2Frac = (100 - airGas.o2 - airGas.he) / 100;

    let calculatedDrainPressure: number | undefined;

    if (pureO2) {
      // Two-gas topping (O2 + Air) for precise control
      // For trimix He sources (not pure He), we need to account for O2 and N2 in the He gas
      // Solve for P_drain where after adding He gas, then topping with O2+Air, we hit target

      if (pureHe) {
        // Pure helium case: original formula
        const coeff =
          fractions.o2 -
          1 +
          fractions.he -
          (fractions.n2 * (airO2Frac - 1)) / airN2Frac;
        const rhs =
          targetO2PP -
          targetPressure +
          targetHePP -
          (targetN2PP * (airO2Frac - 1)) / airN2Frac;

        if (Math.abs(coeff) > 0.0001) {
          calculatedDrainPressure = rhs / coeff;
        } else {
          // Fallback to air-only formula
          const denominator = fractions.o2 - (1 - fractions.he) * airO2Frac;
          if (Math.abs(denominator) > 0.0001) {
            calculatedDrainPressure =
              (targetO2PP -
                targetPressure * airO2Frac +
                targetHePP * airO2Frac) /
              denominator;
          }
        }
      } else {
        // Trimix He source: need to account for O2 and N2 in the He gas
        // Strategy: Use O2 for final topping to avoid adding more N2
        // After drain and adding He gas, top with pure O2 to reach target
        //
        // Solve using nitrogen balance equation:
        // P_drain * frac.n2 + heToAdd * heGasN2Frac = targetN2PP
        // where: heToAdd = (targetHePP - P_drain * frac.he) / heGasHeFrac
        //
        // Substituting and solving for P_drain:
        const coeff = fractions.n2 - (fractions.he * heGasN2Frac) / heGasHeFrac;
        const rhs = targetN2PP - (targetHePP * heGasN2Frac) / heGasHeFrac;

        if (Math.abs(coeff) > 0.0001) {
          calculatedDrainPressure = rhs / coeff;
        }
      }
    } else {
      // Single-gas topping (Air only)
      // After drain and He addition, top with air to reach target pressure
      // Solve: P_drain * fractions.o2 + air_amount * airO2Frac = targetO2PP
      const denominator = fractions.o2 - (1 - fractions.he) * airO2Frac;

      if (Math.abs(denominator) > 0.0001) {
        calculatedDrainPressure =
          (targetO2PP - targetPressure * airO2Frac + targetHePP * airO2Frac) /
          denominator;
      }
    }

    // Apply drain only if we got a valid calculation AND it makes sense
    if (
      calculatedDrainPressure !== undefined &&
      !isNaN(calculatedDrainPressure) &&
      isFinite(calculatedDrainPressure) &&
      calculatedDrainPressure > 0 &&
      (calculatedDrainPressure < currentPressure - 0.5 ||
        (currentPressure >= targetPressure - 0.5 && deltaHe > 0.5))
    ) {
      needsDrain = true;
      drainToPressure = Math.min(
        drainToPressure,
        Math.max(0, calculatedDrainPressure),
      );
    }
  }

  // Execute the drain
  if (needsDrain) {
    const targetDrainPressure = roundTo(Math.max(0, drainToPressure), 2);
    const drainedAmount = currentPressure - targetDrainPressure;

    if (drainedAmount > 0.5 && targetDrainPressure > 0.5) {
      recordDrain(targetDrainPressure);
    } else if (drainedAmount > 0.5) {
      recordDrain(0, true);
    }
  }

  // STEP 1: Add helium if needed
  if (deltaHe > 0.1) {
    const heGas = pureHe || trimixGases[0];

    if (heGas && heGas.he > 0) {
      const heFraction = heGas.he / 100;
      const heToAdd = deltaHe / heFraction;
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
        const testO2PP = currentO2PP + (airGas.o2 / 100) * remainingPressure;
        const testHePP = currentHePP + (airGas.he / 100) * remainingPressure;

        const testO2Fraction = testO2PP / targetPressure;
        const testHeFraction = testHePP / targetPressure;

        const diff =
          Math.abs(testO2Fraction * 100 - targetGas.o2) +
          Math.abs(testHeFraction * 100 - targetGas.he);

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

      // Two-gas blending for precise O2 control
      if (pureO2 && bestAirGas && Math.abs(bestAirGas.o2 - pureO2.o2) > 10) {
        // Solve for air and O2 amounts to hit exact target O2 and N2
        const neededO2PP = targetO2PP - currentO2PP;
        const neededN2PP = targetN2PP - currentN2PP;

        const o2GasFraction = pureO2.o2 / 100;
        const airGasFraction = bestAirGas.o2 / 100;
        const airN2GasFraction = (100 - bestAirGas.o2 - bestAirGas.he) / 100;

        let airPressure: number;
        let o2Pressure: number;

        // Use N2 equation if we need nitrogen, otherwise use O2 equation
        if (neededN2PP > 0.1 && airN2GasFraction > 0.01) {
          airPressure = neededN2PP / airN2GasFraction;
          o2Pressure = remainingPressure - airPressure;
        } else {
          // Solve: neededO2PP = o2Frac * o2Pressure + airFrac * airPressure
          // where: o2Pressure + airPressure = remainingPressure
          if (Math.abs(airGasFraction - o2GasFraction) > 0.01) {
            airPressure =
              (neededO2PP - o2GasFraction * remainingPressure) /
              (airGasFraction - o2GasFraction);
            o2Pressure = remainingPressure - airPressure;
          } else {
            // Gases too similar, just use air
            airPressure = remainingPressure;
            o2Pressure = 0;
          }
        }

        // Clamp to valid ranges
        airPressure = Math.max(0, Math.min(remainingPressure, airPressure));
        o2Pressure = Math.max(0, Math.min(remainingPressure, o2Pressure));

        // Normalize to sum to remainingPressure
        const total = airPressure + o2Pressure;
        if (total > 0.1) {
          airPressure = (airPressure / total) * remainingPressure;
          o2Pressure = (o2Pressure / total) * remainingPressure;
        }

        // Round to 0.1 bar precision
        o2Pressure = Math.round(o2Pressure * 10) / 10;
        airPressure = Math.round(airPressure * 10) / 10;

        // Add O2 first if needed
        if (o2Pressure > 0.1) {
          recordGasAddition(pureO2, o2Pressure, `Add ${pureO2.name}`);
        }

        // Then add air/nitrox
        if (airPressure > 0.1) {
          recordGasAddition(
            bestAirGas,
            airPressure,
            `Top up with ${bestAirGas.name}`,
          );
        }
      } else {
        // Single-gas topping: add O2 first, then air to reach target pressure
        const o2FromAir = (bestAirGas.o2 / 100) * remainingPressure;
        const projectedO2PP = currentO2PP + o2FromAir;
        deltaO2 = targetO2PP - projectedO2PP;

        // Add O2 if needed after accounting for O2 in air
        if (deltaO2 > 0.1 && pureO2) {
          recordGasAddition(pureO2, roundTo(deltaO2, 1), `Add ${pureO2.name}`);
        }

        // Top up with air to reach target pressure
        const finalRemainingPressure = roundTo(
          targetPressure - currentPressure,
          1,
        );
        if (finalRemainingPressure > 0.1) {
          recordGasAddition(
            bestAirGas,
            finalRemainingPressure,
            `Top up with ${bestAirGas.name}`,
          );
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

  // Check if we're close enough to target (lenient tolerance for rounding errors)
  const o2Error = Math.abs(finalMix.o2 - targetGas.o2);
  const heError = Math.abs(finalMix.he - targetGas.he);
  const pressureError = Math.abs(finalMix.pressure - targetGas.pressure);

  if (o2Error > 0.5 || heError > 0.5 || pressureError > 1) {
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
