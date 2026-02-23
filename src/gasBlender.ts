/**
 * Gas Blender Calculator
 *
 * Uses real gas partial pressure calculations for accurate gas blending.
 *
 * Internal state is tracked as mole-equivalent pressures (MEP = n·R·T/V,
 * proportional to moles). This corrects for the non-ideal behaviour of
 * O₂ and N₂ at high pressures (van der Waals Z ≠ 1). He is nearly ideal.
 *
 * All inputs and outputs remain in gauge bar, as read on a pressure gauge.
 */

import { gasZ, mepToGauge } from "./realGas.ts";

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
 * Calculate gas blending steps.
 * Algorithm: 1) Drain if needed, 2) Add Helium, 3) Add O2 and/or Air/Nitrox.
 *
 * Internal computation uses mole-equivalent pressures (MEP) to account for
 * real gas compressibility. Step pressures shown to the user are gauge bar.
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

  // Target state — compute MEPs (mole-equivalent pressures) using real gas Z
  const targetPressure = targetGas.pressure;
  const targetO2Fraction = targetGas.o2 / 100;
  const targetHeFraction = targetGas.he / 100;
  const targetN2Fraction = 1 - targetO2Fraction - targetHeFraction;

  const targetMEP =
    targetPressure / gasZ(targetO2Fraction, targetHeFraction, targetPressure);
  const targetO2MEP = targetO2Fraction * targetMEP;
  const targetHeMEP = targetHeFraction * targetMEP;
  const targetN2MEP = targetN2Fraction * targetMEP;

  // Current state — convert gauge partial pressures to MEPs
  let currentPressure = startingGas.pressure;
  const startO2Frac = startingGas.o2 / 100;
  const startHeFrac = startingGas.he / 100;
  const startMEP =
    currentPressure <= 0
      ? 0
      : currentPressure / gasZ(startO2Frac, startHeFrac, currentPressure);
  let currentO2MEP = startO2Frac * startMEP;
  let currentHeMEP = startHeFrac * startMEP;
  let currentN2MEP = Math.max(0, (1 - startO2Frac - startHeFrac) * startMEP);

  // Delta MEPs (positive = need to add, negative = need to remove)
  let deltaHe = 0;
  let deltaN2 = 0;
  let deltaO2 = 0;

  // Mole fractions from current MEP state
  const getFractions = () => {
    const totalMEP = currentO2MEP + currentHeMEP + currentN2MEP;
    if (totalMEP <= 0.0001) {
      return { o2: 0, he: 0, n2: 0 };
    }
    return {
      o2: currentO2MEP / totalMEP,
      he: currentHeMEP / totalMEP,
      n2: Math.max(0, currentN2MEP / totalMEP),
    };
  };

  const updateDeltas = () => {
    deltaHe = targetHeMEP - currentHeMEP;
    deltaN2 = targetN2MEP - currentN2MEP;
    deltaO2 = targetO2MEP - currentO2MEP;
  };

  const recordDrain = (toPressure: number, forceComplete = false) => {
    if (currentPressure <= toPressure) {
      return;
    }

    const previousPressure = currentPressure;
    const previousFractions = getFractions();
    const newPressure = forceComplete ? 0 : toPressure;

    // Scale MEPs: composition unchanged, moles reduce as (newMEP / oldMEP)
    // MEP_total = gauge / Z(composition, gauge), so ratio = (new/Z_new) / (old/Z_old)
    const Z_before = gasZ(
      previousFractions.o2,
      previousFractions.he,
      previousPressure,
    );
    const Z_after =
      newPressure <= 0
        ? 1
        : gasZ(previousFractions.o2, previousFractions.he, newPressure);
    const mepRatio =
      previousPressure <= 0
        ? 0
        : newPressure / Z_after / (previousPressure / Z_before);

    currentO2MEP *= mepRatio;
    currentHeMEP *= mepRatio;
    currentN2MEP *= mepRatio;
    currentPressure = newPressure;

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

    // Real gas correction: convert gauge bar added → mole-equivalent pressure
    const newPressure = currentPressure + roundedAmount;
    const Z_gas = gasZ(gas.o2 / 100, gas.he / 100, newPressure);
    const deltaMEP = roundedAmount / Z_gas;

    const inertFrac = Math.max(0, (100 - gas.o2 - gas.he) / 100);
    currentO2MEP += (gas.o2 / 100) * deltaMEP;
    currentHeMEP += (gas.he / 100) * deltaMEP;
    currentN2MEP += inertFrac * deltaMEP;
    currentN2MEP = Math.max(0, currentN2MEP);
    currentPressure = newPressure;

    const updatedFractions = getFractions();

    // Free litres consumed = MEP added × tank volume (real gas corrected)
    const addedVolume = roundTo(deltaMEP * startingGas.volume, 1);

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

  // STEP 0: Check if we need to drain and calculate drain MEP
  let needsDrain = false;
  const currentTotalMEP = currentO2MEP + currentHeMEP + currentN2MEP;
  let drainToMEP = currentTotalMEP; // default: no drain
  const fractions = getFractions();

  // Get available gases
  const pureHe = availableGases.find((g) => g.he > 95 && g.o2 < 5);
  const pureO2 = availableGases.find((g) => g.o2 > 95 && g.he < 5);
  const airGases = availableGases
    .filter((g) => g.he < 5 && g.o2 >= 19 && g.o2 <= 40)
    .sort((a, b) => a.o2 - b.o2);

  // Check if any component is in excess — compute max MEP we can keep
  if (deltaHe < -0.5 || deltaN2 < -0.5 || deltaO2 < -0.5) {
    needsDrain = true;

    if (deltaHe < -0.5 && fractions.he > 0.001) {
      drainToMEP = Math.min(drainToMEP, targetHeMEP / fractions.he);
    }
    if (deltaO2 < -0.5 && fractions.o2 > 0.001) {
      drainToMEP = Math.min(drainToMEP, targetO2MEP / fractions.o2);
    }
    if (deltaN2 < -0.5 && fractions.n2 > 0.001) {
      drainToMEP = Math.min(drainToMEP, targetN2MEP / fractions.n2);
    }
  }

  // Get trimix gases for potential drain calculation
  const trimixGases = availableGases
    .filter((g) => g.he > 30)
    .sort((a, b) => b.he - a.he);

  // Calculate drain MEP for helium blending scenarios.
  // Sequence: Drain → Add He → Top with Air/O2.
  // All formulas are in MEP space (same algebra as PP, different units).
  const heGasForCalc = pureHe || trimixGases[0];

  if (deltaHe > 0.5 && heGasForCalc && airGases.length > 0) {
    const heGasHeFrac = heGasForCalc.he / 100;
    const heGasN2Frac = (100 - heGasForCalc.o2 - heGasForCalc.he) / 100;

    const airGas = airGases[0];
    const airO2Frac = airGas.o2 / 100;
    const airN2Frac = (100 - airGas.o2 - airGas.he) / 100;

    let calculatedDrainMEP: number | undefined;

    if (pureO2) {
      // Two-gas topping (O2 + Air): solve for drain MEP such that after adding
      // He gas and topping with O2 + Air we hit the target MEPs.

      if (pureHe) {
        // Pure helium case
        const coeff =
          fractions.o2 -
          1 +
          fractions.he -
          (fractions.n2 * (airO2Frac - 1)) / airN2Frac;
        const rhs =
          targetO2MEP -
          targetMEP +
          targetHeMEP -
          (targetN2MEP * (airO2Frac - 1)) / airN2Frac;

        if (Math.abs(coeff) > 0.0001) {
          calculatedDrainMEP = rhs / coeff;
        } else {
          // Fallback to air-only formula
          const denominator = fractions.o2 - (1 - fractions.he) * airO2Frac;
          if (Math.abs(denominator) > 0.0001) {
            calculatedDrainMEP =
              (targetO2MEP - targetMEP * airO2Frac + targetHeMEP * airO2Frac) /
              denominator;
          }
        }
      } else {
        // Trimix He source: solve using nitrogen MEP balance.
        // drain_MEP * frac.n2 + heToAdd * heGasN2Frac = targetN2MEP
        // where heToAdd = (targetHeMEP - drain_MEP * frac.he) / heGasHeFrac
        const coeff = fractions.n2 - (fractions.he * heGasN2Frac) / heGasHeFrac;
        const rhs = targetN2MEP - (targetHeMEP * heGasN2Frac) / heGasHeFrac;

        if (Math.abs(coeff) > 0.0001) {
          calculatedDrainMEP = rhs / coeff;
        }
      }
    } else {
      // Single-gas topping (Nitrox/Air only, no pure O2)

      if (pureHe) {
        // Pure helium + air/nitrox topping
        const denominator = fractions.o2 - (1 - fractions.he) * airO2Frac;
        if (Math.abs(denominator) > 0.0001) {
          calculatedDrainMEP =
            (targetO2MEP - targetMEP * airO2Frac + targetHeMEP * airO2Frac) /
            denominator;
        }
      } else {
        // Trimix He source + nitrox/air topping.
        // He balance:  drain_MEP*frac.he + heToAdd*heGasHeFrac = targetHeMEP
        // O2 balance:  drain_MEP*frac.o2 + heToAdd*heGasO2Frac + airToAdd*airO2Frac = targetO2MEP
        // N2 balance:  drain_MEP*frac.n2 + heToAdd*heGasN2Frac + airToAdd*airN2Frac = targetN2MEP
        // MEP total:   drain_MEP + heToAdd + airToAdd = targetMEP
        const heGasO2Frac = heGasForCalc.o2 / 100;

        const coeff =
          fractions.o2 -
          (fractions.he * heGasO2Frac) / heGasHeFrac -
          (1 - fractions.he / heGasHeFrac) * airO2Frac;
        const rhs =
          targetO2MEP -
          (targetHeMEP * heGasO2Frac) / heGasHeFrac -
          (targetMEP - targetHeMEP / heGasHeFrac) * airO2Frac;

        if (Math.abs(coeff) > 0.0001) {
          calculatedDrainMEP = rhs / coeff;
        }
      }
    }

    // Apply drain only if we got a valid calculation AND it makes sense
    if (
      calculatedDrainMEP !== undefined &&
      !isNaN(calculatedDrainMEP) &&
      isFinite(calculatedDrainMEP)
    ) {
      if (calculatedDrainMEP <= 0.5 && !pureHe && !pureO2) {
        needsDrain = true;
        drainToMEP = 0;
      } else if (
        calculatedDrainMEP > 0.5 &&
        (calculatedDrainMEP < currentTotalMEP - 0.5 ||
          (currentPressure >= targetPressure - 0.5 && deltaHe > 0.5))
      ) {
        needsDrain = true;
        drainToMEP = Math.min(drainToMEP, calculatedDrainMEP);
      }
    } else if (calculatedDrainMEP === undefined) {
      // Drain formula was degenerate (e.g. starting gas O2% equals topping
      // gas O2%, so the residual cannot be corrected by the topping gas).
      // Must drain to zero so the target composition can be achieved.
      needsDrain = true;
      drainToMEP = 0;
    }
  }

  // Execute the drain — convert drain MEP back to gauge pressure
  if (needsDrain) {
    const drainFracs = getFractions();
    const drainToGauge = roundTo(
      drainToMEP <= 0
        ? 0
        : mepToGauge(drainToMEP, drainFracs.o2, drainFracs.he),
      1,
    );
    const drainedAmount = currentPressure - drainToGauge;

    if (drainedAmount > 0.5 && drainToGauge > 0.5) {
      recordDrain(drainToGauge);
    } else if (drainedAmount > 0.5) {
      recordDrain(0, true);
    }
  }

  // STEP 1: Add helium if needed
  if (deltaHe > 0.1) {
    const heGas = pureHe || trimixGases[0];

    if (heGas && heGas.he > 0) {
      const heFraction = heGas.he / 100;
      // deltaHe is MEP; find the gauge bar addition that yields exactly
      // deltaHe/heFraction MEP of He source gas.  Use the mixture Z at the
      // new composition so the gauge amount is accurate even for large He
      // additions into O₂/N₂-rich mixtures (Z_mix ≠ Z_heGas).
      const heMEPtoAdd = deltaHe / heFraction;
      const totalMEP_old = currentO2MEP + currentHeMEP + currentN2MEP;
      const totalMEP_target = totalMEP_old + heMEPtoAdd;
      const tO2 =
        (currentO2MEP + (heGas.o2 / 100) * heMEPtoAdd) / totalMEP_target;
      const tHe = (currentHeMEP + heFraction * heMEPtoAdd) / totalMEP_target;
      // Solve P = Z_mix(composition, P) × totalMEP_target iteratively
      let P_he = currentPressure + heMEPtoAdd; // initial estimate
      for (let i = 0; i < 6; i++) {
        const next = gasZ(tO2, tHe, P_he) * totalMEP_target;
        if (Math.abs(next - P_he) < 0.001) {
          P_he = next;
          break;
        }
        P_he = next;
      }
      const heGaugeToAdd = P_he - currentPressure;
      recordGasAddition(heGas, heGaugeToAdd, `Add ${heGas.name}`);
    }
  }

  // STEP 2: Top up to target pressure
  const remainingPressure = targetPressure - currentPressure;

  if (remainingPressure > 0.1) {
    if (pureO2 && airGases.length === 0) {
      // Only O2 available
      const o2ToAdd = roundTo(remainingPressure, 1);
      if (o2ToAdd > 0.1) {
        recordGasAddition(pureO2, o2ToAdd, `Add ${pureO2.name}`);
      }
    } else if (airGases.length > 0) {
      // Select best air/nitrox gas: find which single gas gets closest to target
      let bestAirGas = airGases[0];
      let bestDiff = Infinity;

      for (const airGas of airGases) {
        const Z_gas = gasZ(airGas.o2 / 100, airGas.he / 100, targetPressure);
        const addedMEP = remainingPressure / Z_gas;
        const totalMEPtest =
          currentO2MEP + currentHeMEP + currentN2MEP + addedMEP;
        const testO2Frac =
          (currentO2MEP + (airGas.o2 / 100) * addedMEP) / totalMEPtest;
        const testHeFrac =
          (currentHeMEP + (airGas.he / 100) * addedMEP) / totalMEPtest;

        const diff =
          Math.abs(testO2Frac * 100 - targetGas.o2) +
          Math.abs(testHeFrac * 100 - targetGas.he);

        if (diff < bestDiff) {
          bestDiff = diff;
          bestAirGas = airGas;
        }
      }

      // When pure O2 is available and best single gas isn't close enough,
      // prefer the lowest-O2 gas so the two-gas algorithm can compensate.
      if (pureO2 && bestDiff > 0.7) {
        bestAirGas = airGases.reduce((lowest, current) =>
          current.o2 < lowest.o2 ? current : lowest,
        );
      }

      // Two-gas blending for precise O2 control
      if (pureO2 && bestAirGas && Math.abs(bestAirGas.o2 - pureO2.o2) > 10) {
        // Solve directly in gauge space for the O2/Air split that hits the
        // target O2 mole fraction. Air goes in last (to targetPressure) so
        // Z_Air is evaluated at the known final pressure — no approximation.
        // O2 goes in first; Z_O2 depends on the answer, so iterate 2–3 times.
        const Z_Air = gasZ(
          bestAirGas.o2 / 100,
          bestAirGas.he / 100,
          targetPressure,
        );
        const q = bestAirGas.o2 / 100; // Air O2 mole fraction
        const f = targetO2Fraction; // target O2 mole fraction
        const T0 = currentO2MEP + currentHeMEP + currentN2MEP;

        let Z_O2 = gasZ(pureO2.o2 / 100, pureO2.he / 100, targetPressure);
        let o2Pressure = 0;
        for (let i = 0; i < 3; i++) {
          const denom = (1 - f) / Z_O2 - (q - f) / Z_Air;
          if (Math.abs(denom) < 0.0001) break;
          const numer =
            f * T0 - currentO2MEP - (remainingPressure * (q - f)) / Z_Air;
          const candidate = numer / denom;
          Z_O2 = gasZ(
            pureO2.o2 / 100,
            pureO2.he / 100,
            currentPressure + Math.max(0, candidate),
          );
          o2Pressure = candidate;
        }

        // Air fills the remainder; round O2 first so Air absorbs rounding error.
        // Cap O2 at remainingPressure: rounding/approximation can push o2Pressure
        // slightly above remainingPressure, which would overshoot targetPressure.
        const o2Rounded = Math.max(
          0,
          Math.min(
            remainingPressure,
            Math.round(Math.max(0, o2Pressure) * 10) / 10,
          ),
        );
        const airRounded = Math.max(
          0,
          Math.round((remainingPressure - o2Rounded) * 10) / 10,
        );

        if (o2Rounded > 0.1) {
          recordGasAddition(pureO2, o2Rounded, `Add ${pureO2.name}`);
        }
        if (airRounded > 0.1) {
          recordGasAddition(
            bestAirGas,
            airRounded,
            `Top up with ${bestAirGas.name}`,
          );
        }
      } else {
        // Single-gas topping: add pure O2 boost (if needed and available),
        // then fill the rest with bestAirGas.
        if (pureO2 && bestAirGas) {
          const Z_Air = gasZ(
            bestAirGas.o2 / 100,
            bestAirGas.he / 100,
            targetPressure,
          );
          const q = bestAirGas.o2 / 100;
          const f = targetO2Fraction;
          const T0 = currentO2MEP + currentHeMEP + currentN2MEP;
          const Z_O2 = gasZ(pureO2.o2 / 100, pureO2.he / 100, targetPressure);
          const denom = (1 - f) / Z_O2 - (q - f) / Z_Air;
          if (Math.abs(denom) > 0.0001) {
            const numer =
              f * T0 - currentO2MEP - (remainingPressure * (q - f)) / Z_Air;
            const extraO2Gauge = roundTo(Math.max(0, numer / denom), 1);
            if (extraO2Gauge > 0.1) {
              recordGasAddition(pureO2, extraO2Gauge, `Add ${pureO2.name}`);
            }
          }
        }

        // Top up with air/nitrox to reach target pressure
        const finalRemainingPressure = roundTo(
          targetPressure - currentPressure,
          1,
        );
        if (finalRemainingPressure > 0.1 && bestAirGas) {
          recordGasAddition(
            bestAirGas,
            finalRemainingPressure,
            `Top up with ${bestAirGas.name}`,
          );
        } else if (finalRemainingPressure > 0.1 && pureO2) {
          recordGasAddition(
            pureO2,
            finalRemainingPressure,
            `Add ${pureO2.name}`,
          );
        }
      }
    }
  }

  // Calculate final mix from mole fractions
  const finalFractions = getFractions();
  const finalMix = {
    o2: toPercentLabel(finalFractions.o2),
    he: toPercentLabel(finalFractions.he),
    pressure: roundTo(currentPressure, 1),
  };

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
