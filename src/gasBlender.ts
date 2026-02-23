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

/** Minimum gas addition worth recording (bar). */
const MIN_ADDITION_BAR = 0.1;

/** Minimum MEP difference treated as significant (bar-equivalent). */
const MIN_MEP_DELTA = 0.5;

/** Near-zero guard for linear-equation denominators and trivial thresholds. */
const NEAR_ZERO = 0.0001;

const roundTo = (value: number, decimals = 2): number => {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
};

const toPercentLabel = (fraction: number): number => roundTo(fraction * 100, 1);

const createMixLabel = (o2Fraction: number, heFraction: number): string =>
  `${toPercentLabel(o2Fraction)}/${toPercentLabel(heFraction)}`;

// ---------------------------------------------------------------------------
// Drain MEP helpers
//
// Each function solves for the drain MEP (mole-equivalent pressure to leave
// in the tank before adding He and topping up) such that after the full
// blending sequence the target MEPs are hit exactly.
// All algebra is in MEP space — the same as partial-pressure space but
// with MEP substituted for gauge pressure.
// Returns undefined when the system is degenerate (zero denominator).
// ---------------------------------------------------------------------------

interface DrainCalcCtx {
  fractions: { o2: number; he: number; n2: number };
  targetO2MEP: number;
  targetHeMEP: number;
  targetN2MEP: number;
  targetMEP: number;
}

/**
 * Pure He source, O2 + Air two-gas topping.
 * Falls back to the air-only formula when the two-gas system is degenerate
 * (e.g. starting O2% == topping gas O2%, so O2 balance gives a trivial row).
 */
function calcDrainMEP_pureHe_twoGas(
  ctx: DrainCalcCtx,
  airO2Frac: number,
  airN2Frac: number,
): number | undefined {
  const { fractions, targetO2MEP, targetHeMEP, targetN2MEP, targetMEP } = ctx;
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
  if (Math.abs(coeff) > NEAR_ZERO) {
    return rhs / coeff;
  }
  // Fallback: treat as air-only topping when the two-gas row is singular
  return calcDrainMEP_pureHe_airOnly(ctx, airO2Frac);
}

/**
 * Pure He source, single Air/Nitrox topping (no pure O2 available).
 */
function calcDrainMEP_pureHe_airOnly(
  ctx: DrainCalcCtx,
  airO2Frac: number,
): number | undefined {
  const { fractions, targetO2MEP, targetHeMEP, targetMEP } = ctx;
  const denominator = fractions.o2 - (1 - fractions.he) * airO2Frac;
  if (Math.abs(denominator) < NEAR_ZERO) return undefined;
  return (targetO2MEP - targetMEP * airO2Frac + targetHeMEP * airO2Frac) / denominator;
}

/**
 * Trimix He source, O2 + Air two-gas topping.
 * Uses the nitrogen balance to eliminate unknowns:
 *   drain·frac.n2 + heToAdd·heN2Frac = targetN2MEP
 *   heToAdd = (targetHeMEP − drain·frac.he) / heHeFrac
 */
function calcDrainMEP_trimixHe_twoGas(
  ctx: DrainCalcCtx,
  heGasHeFrac: number,
  heGasN2Frac: number,
): number | undefined {
  const { fractions, targetHeMEP, targetN2MEP } = ctx;
  const coeff = fractions.n2 - (fractions.he * heGasN2Frac) / heGasHeFrac;
  const rhs = targetN2MEP - (targetHeMEP * heGasN2Frac) / heGasHeFrac;
  if (Math.abs(coeff) < NEAR_ZERO) return undefined;
  return rhs / coeff;
}

/**
 * Trimix He source, single Air/Nitrox topping (no pure O2 available).
 * Uses O2 and MEP-total balances with He and Air as the two free variables.
 */
function calcDrainMEP_trimixHe_airOnly(
  ctx: DrainCalcCtx,
  heGasO2Frac: number,
  heGasHeFrac: number,
  airO2Frac: number,
): number | undefined {
  const { fractions, targetO2MEP, targetHeMEP, targetMEP } = ctx;
  // Eliminate heToAdd and airToAdd from the O2 balance using He and MEP-total
  const coeff =
    fractions.o2 -
    (fractions.he * heGasO2Frac) / heGasHeFrac -
    (1 - fractions.he / heGasHeFrac) * airO2Frac;
  const rhs =
    targetO2MEP -
    (targetHeMEP * heGasO2Frac) / heGasHeFrac -
    (targetMEP - targetHeMEP / heGasHeFrac) * airO2Frac;
  if (Math.abs(coeff) < NEAR_ZERO) return undefined;
  return rhs / coeff;
}

// ---------------------------------------------------------------------------
// Two-gas O2 / topup-gas split solver
// ---------------------------------------------------------------------------

/**
 * Solve for how many gauge bar of pure O2 to add first so that filling the
 * remainder to targetPressure with topupGas hits exactly targetO2Frac.
 *
 * topupGas goes in last (to a known final pressure) so Z_topup is evaluated
 * at targetPressure — no approximation needed.  O2 goes in first; Z_O2
 * depends on the answer, so we iterate 3 times.
 *
 * Z is evaluated at the endpoint of each addition, consistent with how
 * recordGasAddition computes deltaMEP.
 *
 * Returns the O2 gauge bar to add (may be negative — caller should clamp to 0).
 */
function solveO2Pressure(
  currentO2MEP: number,
  currentHeMEP: number,
  currentN2MEP: number,
  currentPressure: number,
  remainingPressure: number,
  targetO2Frac: number,
  pureO2: Gas,
  topupGas: Gas,
): number {
  const targetPressure = currentPressure + remainingPressure;
  const Z_topup = gasZ(topupGas.o2 / 100, topupGas.he / 100, targetPressure);
  const q = topupGas.o2 / 100;
  const f = targetO2Frac;
  const T0 = currentO2MEP + currentHeMEP + currentN2MEP;

  let Z_O2 = gasZ(pureO2.o2 / 100, pureO2.he / 100, targetPressure);
  let o2Pressure = 0;
  for (let i = 0; i < 3; i++) {
    const denom = (1 - f) / Z_O2 - (q - f) / Z_topup;
    if (Math.abs(denom) < NEAR_ZERO) break;
    const numer = f * T0 - currentO2MEP - (remainingPressure * (q - f)) / Z_topup;
    const candidate = numer / denom;
    Z_O2 = gasZ(
      pureO2.o2 / 100,
      pureO2.he / 100,
      currentPressure + Math.max(0, candidate),
    );
    o2Pressure = candidate;
  }
  return o2Pressure;
}

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
    if (totalMEP <= NEAR_ZERO) {
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

  const recordGasAddition = (gas: Gas, amount: number, label: string) => {
    const roundedAmount = roundTo(amount, 1);

    if (roundedAmount <= 0) {
      return;
    }

    const previousPressure = currentPressure;
    const previousFractions = getFractions();

    // Real gas correction: convert gauge bar added → mole-equivalent pressure.
    // Z is evaluated at the endpoint pressure, consistent with the two-gas
    // formula derivation in solveO2Pressure.
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
  const topupGases = availableGases
    .filter((g) => g.he < 5 && g.o2 >= 19 && g.o2 <= 40)
    .sort((a, b) => a.o2 - b.o2);

  // Check if any component is in excess — compute max MEP we can keep
  if (deltaHe < -MIN_MEP_DELTA || deltaN2 < -MIN_MEP_DELTA || deltaO2 < -MIN_MEP_DELTA) {
    needsDrain = true;

    if (deltaHe < -MIN_MEP_DELTA && fractions.he > 0.001) {
      drainToMEP = Math.min(drainToMEP, targetHeMEP / fractions.he);
    }
    if (deltaO2 < -MIN_MEP_DELTA && fractions.o2 > 0.001) {
      drainToMEP = Math.min(drainToMEP, targetO2MEP / fractions.o2);
    }
    if (deltaN2 < -MIN_MEP_DELTA && fractions.n2 > 0.001) {
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

  if (deltaHe > MIN_MEP_DELTA && heGasForCalc && topupGases.length > 0) {
    const heGasHeFrac = heGasForCalc.he / 100;
    const heGasN2Frac = (100 - heGasForCalc.o2 - heGasForCalc.he) / 100;
    const heGasO2Frac = heGasForCalc.o2 / 100;

    const topupGas = topupGases[0];
    const airO2Frac = topupGas.o2 / 100;
    const airN2Frac = (100 - topupGas.o2 - topupGas.he) / 100;

    const drainCtx: DrainCalcCtx = {
      fractions,
      targetO2MEP,
      targetHeMEP,
      targetN2MEP,
      targetMEP,
    };

    const calculatedDrainMEP: number | undefined = pureO2
      ? pureHe
        ? calcDrainMEP_pureHe_twoGas(drainCtx, airO2Frac, airN2Frac)
        : calcDrainMEP_trimixHe_twoGas(drainCtx, heGasHeFrac, heGasN2Frac)
      : pureHe
        ? calcDrainMEP_pureHe_airOnly(drainCtx, airO2Frac)
        : calcDrainMEP_trimixHe_airOnly(
            drainCtx,
            heGasO2Frac,
            heGasHeFrac,
            airO2Frac,
          );

    // Apply drain only if we got a valid finite result that makes sense
    if (Number.isFinite(calculatedDrainMEP)) {
      const drainMEP = calculatedDrainMEP!;
      if (drainMEP <= MIN_MEP_DELTA && !pureHe && !pureO2) {
        needsDrain = true;
        drainToMEP = 0;
      } else if (
        drainMEP > MIN_MEP_DELTA &&
        (drainMEP < currentTotalMEP - MIN_MEP_DELTA ||
          (currentPressure >= targetPressure - MIN_MEP_DELTA && deltaHe > MIN_MEP_DELTA))
      ) {
        needsDrain = true;
        drainToMEP = Math.min(drainToMEP, drainMEP);
      }
    } else {
      // Drain formula was degenerate (undefined, NaN, or Infinity): e.g. starting
      // gas O2% equals topping gas O2%, so the residual cannot be corrected by
      // the topping gas. Must drain to zero so the target composition can be achieved.
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

    if (drainedAmount > MIN_MEP_DELTA && drainToGauge > MIN_MEP_DELTA) {
      recordDrain(drainToGauge);
    } else if (drainedAmount > MIN_MEP_DELTA) {
      recordDrain(0, true);
    }
  }

  // STEP 1: Add helium if needed
  if (deltaHe > MIN_ADDITION_BAR) {
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

  if (remainingPressure > MIN_ADDITION_BAR) {
    if (pureO2 && topupGases.length === 0) {
      // Only O2 available
      const o2ToAdd = roundTo(remainingPressure, 1);
      if (o2ToAdd > MIN_ADDITION_BAR) {
        recordGasAddition(pureO2, o2ToAdd, `Add ${pureO2.name}`);
      }
    } else if (topupGases.length > 0) {
      // Select best topup gas: find which single gas gets closest to target
      let bestTopupGas = topupGases[0];
      let bestDiff = Infinity;

      for (const topupGas of topupGases) {
        const Z_gas = gasZ(topupGas.o2 / 100, topupGas.he / 100, targetPressure);
        const addedMEP = remainingPressure / Z_gas;
        const totalMEPtest =
          currentO2MEP + currentHeMEP + currentN2MEP + addedMEP;
        const testO2Frac =
          (currentO2MEP + (topupGas.o2 / 100) * addedMEP) / totalMEPtest;
        const testHeFrac =
          (currentHeMEP + (topupGas.he / 100) * addedMEP) / totalMEPtest;

        const diff =
          Math.abs(testO2Frac * 100 - targetGas.o2) +
          Math.abs(testHeFrac * 100 - targetGas.he);

        if (diff < bestDiff) {
          bestDiff = diff;
          bestTopupGas = topupGas;
        }
      }

      // When pure O2 is available and best single gas isn't close enough,
      // prefer the lowest-O2 gas so the two-gas algorithm can compensate.
      if (pureO2 && bestDiff > 0.7) {
        bestTopupGas = topupGases.reduce((lowest, current) =>
          current.o2 < lowest.o2 ? current : lowest,
        );
      }

      // Two-gas blending for precise O2 control (O2 first, topup gas to target)
      if (pureO2 && Math.abs(bestTopupGas.o2 - pureO2.o2) > 10) {
        const o2Pressure = solveO2Pressure(
          currentO2MEP,
          currentHeMEP,
          currentN2MEP,
          currentPressure,
          remainingPressure,
          targetO2Fraction,
          pureO2,
          bestTopupGas,
        );

        // Topup gas fills the remainder; round O2 first so topup gas absorbs
        // rounding error. Cap O2 at remainingPressure: rounding/approximation
        // can push o2Pressure slightly above remainingPressure, which would
        // overshoot targetPressure.
        const o2Rounded = Math.max(
          0,
          Math.min(
            remainingPressure,
            Math.round(Math.max(0, o2Pressure) * 10) / 10,
          ),
        );
        const topupRounded = Math.max(
          0,
          Math.round((remainingPressure - o2Rounded) * 10) / 10,
        );

        if (o2Rounded > MIN_ADDITION_BAR) {
          recordGasAddition(pureO2, o2Rounded, `Add ${pureO2.name}`);
        }
        if (topupRounded > MIN_ADDITION_BAR) {
          recordGasAddition(
            bestTopupGas,
            topupRounded,
            `Top up with ${bestTopupGas.name}`,
          );
        }
      } else {
        // Single-gas topping: fill to target pressure with bestTopupGas
        const finalRemainingPressure = roundTo(targetPressure - currentPressure, 1);
        if (finalRemainingPressure > MIN_ADDITION_BAR) {
          recordGasAddition(
            bestTopupGas,
            finalRemainingPressure,
            `Top up with ${bestTopupGas.name}`,
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
