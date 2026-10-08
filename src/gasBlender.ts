/**
 * Gas Blender Calculator
 *
 * Uses real gas partial pressure calculations for accurate gas blending.
 *
 * Internal state is tracked as mole-equivalent pressures (MEP = n·R·T/V,
 * proportional to moles): absolute pressure divided by the mix's Z at that
 * absolute pressure (see realGas.ts). The atmosphere in an "empty" cylinder
 * counts as part of the mix.
 *
 * All inputs and outputs remain in gauge bar, as read on a pressure gauge.
 */

import { gaugeToMEP, mepToGauge } from "./realGas.ts";

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

interface Composition {
  o2: number;
  he: number;
  n2: number;
}

const gasComposition = (gas: Gas): Composition => ({
  o2: gas.o2 / 100,
  he: gas.he / 100,
  n2: (100 - gas.o2 - gas.he) / 100,
});

/**
 * Amounts of the three gases that together hold `want` (Cramer's rule).
 * Returns undefined when the gases are linearly dependent.
 */
function solveFills(
  gases: [Composition, Composition, Composition],
  want: Composition,
): [number, number, number] | undefined {
  const det = (a: Composition, b: Composition, c: Composition) =>
    a.o2 * (b.he * c.n2 - b.n2 * c.he) -
    b.o2 * (a.he * c.n2 - a.n2 * c.he) +
    c.o2 * (a.he * b.n2 - a.n2 * b.he);
  const [g0, g1, g2] = gases;
  const d = det(g0, g1, g2);
  if (Math.abs(d) < NEAR_ZERO) return undefined;
  return [det(want, g1, g2) / d, det(g0, want, g2) / d, det(g0, g1, want) / d];
}

/**
 * He source + pure O2 + topping gas: three fills for three component targets
 * plus the drain MEP — one degree of freedom. Each fill is linear in the MEP
 * kept and none may be negative, which bounds it. Keep the most the bounds
 * allow, so the tank is only drained when a component would overshoot.
 * Returns undefined when no amount kept works.
 */
function calcDrainMEP_withO2(
  ctx: DrainCalcCtx,
  currentMEP: number,
  heGas: Gas,
  o2Gas: Gas,
  topupGas: Gas,
): number | undefined {
  const { fractions, targetO2MEP, targetHeMEP, targetN2MEP } = ctx;
  const fills: [Composition, Composition, Composition] = [
    gasComposition(heGas),
    gasComposition(o2Gas),
    gasComposition(topupGas),
  ];
  // fill_i = fromEmpty_i − kept · perKept_i
  const fromEmpty = solveFills(fills, {
    o2: targetO2MEP,
    he: targetHeMEP,
    n2: targetN2MEP,
  });
  const perKept = solveFills(fills, fractions);
  if (!fromEmpty || !perKept) return undefined;
  let upper = currentMEP;
  let lower = 0;
  for (let i = 0; i < 3; i++) {
    const a = fromEmpty[i];
    const b = perKept[i];
    if (b > NEAR_ZERO) upper = Math.min(upper, a / b);
    else if (b < -NEAR_ZERO) lower = Math.max(lower, a / b);
    else if (a < -NEAR_ZERO) return undefined;
  }
  return lower <= upper + NEAR_ZERO ? upper : undefined;
}

/**
 * No helium step: optional pure O2, then a topping gas. The topping gas brings
 * O2 of its own, so keeping just the target O2 is not enough; keep the most
 * that leaves both fills non-negative. With only the topping gas the amount
 * kept is fixed exactly. Returns undefined when no amount kept works.
 */
function calcDrainMEP_noHe(
  ctx: DrainCalcCtx,
  currentMEP: number,
  o2Gas: Gas | undefined,
  topupGas: Gas,
): number | undefined {
  const { fractions, targetO2MEP, targetN2MEP, targetMEP } = ctx;
  const top = gasComposition(topupGas);
  if (!o2Gas) {
    const denominator = fractions.o2 - top.o2;
    if (Math.abs(denominator) < NEAR_ZERO) return undefined;
    const kept = (targetO2MEP - targetMEP * top.o2) / denominator;
    return kept >= -NEAR_ZERO && kept <= currentMEP + NEAR_ZERO
      ? Math.max(0, kept)
      : undefined;
  }
  // N2 comes only from what is kept and the topping gas; O2 makes up the rest.
  // topping = (targetN2 - kept·n2) / top.n2, O2 fill = targetO2 - kept·o2 - topping·top.o2
  if (top.n2 < NEAR_ZERO) return undefined;
  const ratio = top.o2 / top.n2;
  let upper = currentMEP;
  let lower = 0;
  if (fractions.n2 > NEAR_ZERO)
    upper = Math.min(upper, targetN2MEP / fractions.n2);
  const perKept = fractions.o2 - fractions.n2 * ratio;
  const fromEmpty = targetO2MEP - targetN2MEP * ratio;
  if (perKept > NEAR_ZERO) upper = Math.min(upper, fromEmpty / perKept);
  else if (perKept < -NEAR_ZERO) lower = Math.max(lower, fromEmpty / perKept);
  else if (fromEmpty < -NEAR_ZERO) return undefined;
  return lower <= upper + NEAR_ZERO ? Math.max(0, upper) : undefined;
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
  return (
    (targetO2MEP - targetMEP * airO2Frac + targetHeMEP * airO2Frac) /
    denominator
  );
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

interface MEPState {
  o2: number;
  he: number;
  n2: number;
}

/**
 * MEP of `gas` that brings a tank holding `state` from `fromPressure` to
 * `toPressure` gauge bar. The gauge follows the Z of the resulting mix (Kay's
 * rule), as for the start, drain and target, so iterate on the mix.
 */
function mepToReach(
  state: MEPState,
  fromPressure: number,
  gas: Gas,
  toPressure: number,
): number {
  const gasO2 = gas.o2 / 100;
  const gasHe = gas.he / 100;
  const now = state.o2 + state.he + state.n2;
  let amount = toPressure - fromPressure;
  for (let i = 0; i < 10; i++) {
    const after = now + amount;
    const next =
      gaugeToMEP(
        toPressure,
        (state.o2 + gasO2 * amount) / after,
        (state.he + gasHe * amount) / after,
      ) - now;
    if (Math.abs(next - amount) < 1e-6) return next;
    amount = next;
  }
  return amount;
}

/**
 * Gauge pressure to fill pure O2 to, so that topping up with topupGas to
 * targetPressure lands exactly on targetO2Frac. The final MEP depends on the
 * Z of the final mix, so iterate. Undefined when both gases hold the same O2.
 */
function solveO2FillPressure(
  state: MEPState,
  targetPressure: number,
  targetO2Frac: number,
  targetMEP: number,
  pureO2: Gas,
  topupGas: Gas,
): number | undefined {
  const oxyO2 = pureO2.o2 / 100;
  const oxyHe = pureO2.he / 100;
  const topO2 = topupGas.o2 / 100;
  const topHe = topupGas.he / 100;
  if (Math.abs(oxyO2 - topO2) < NEAR_ZERO) return undefined;
  const now = state.o2 + state.he + state.n2;
  let finalMEP = targetMEP;
  let o2MEP = 0;
  for (let i = 0; i < 8; i++) {
    // O2 balance: o2 + oxyO2·o2MEP + topO2·(final − now − o2MEP) = f·final
    o2MEP =
      (targetO2Frac * finalMEP - state.o2 - topO2 * (finalMEP - now)) /
      (oxyO2 - topO2);
    const heFinal =
      (state.he + oxyHe * o2MEP + topHe * (finalMEP - now - o2MEP)) / finalMEP;
    finalMEP = gaugeToMEP(targetPressure, targetO2Frac, heFinal);
  }
  const added = Math.max(0, o2MEP);
  const after = now + added;
  if (after <= 0) return 0;
  return Math.max(
    0,
    mepToGauge(
      after,
      (state.o2 + oxyO2 * added) / after,
      (state.he + oxyHe * added) / after,
    ),
  );
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

  const targetMEP = gaugeToMEP(
    targetPressure,
    targetO2Fraction,
    targetHeFraction,
  );
  const targetO2MEP = targetO2Fraction * targetMEP;
  const targetHeMEP = targetHeFraction * targetMEP;
  const targetN2MEP = targetN2Fraction * targetMEP;

  // Current state — convert gauge partial pressures to MEPs
  let currentPressure = startingGas.pressure;
  const startO2Frac = startingGas.o2 / 100;
  const startHeFrac = startingGas.he / 100;
  const startMEP = gaugeToMEP(
    Math.max(0, currentPressure),
    startO2Frac,
    startHeFrac,
  );
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

    // Composition is unchanged; moles scale by the ratio of MEPs at the two
    // gauge pressures. Draining completely leaves 1 atm in the tank.
    const mepBefore = currentO2MEP + currentHeMEP + currentN2MEP;
    const mepAfter = gaugeToMEP(
      newPressure,
      previousFractions.o2,
      previousFractions.he,
    );
    const mepRatio = mepBefore <= 0 ? 0 : Math.min(1, mepAfter / mepBefore);

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

    // Real gas correction: the MEP added is what brings the mix to the new
    // gauge pressure, by the Z of the resulting mix.
    const newPressure = currentPressure + roundedAmount;
    const deltaMEP = mepToReach(
      { o2: currentO2MEP, he: currentHeMEP, n2: currentN2MEP },
      currentPressure,
      gas,
      newPressure,
    );

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
  if (
    deltaHe < -MIN_MEP_DELTA ||
    deltaN2 < -MIN_MEP_DELTA ||
    deltaO2 < -MIN_MEP_DELTA
  ) {
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

  // Nitrox (no helium step): the topping gas adds O2 too, so the plain excess
  // bounds above can keep too much, or miss a needed drain altogether.
  if (
    deltaHe <= MIN_MEP_DELTA &&
    targetHeMEP <= MIN_MEP_DELTA &&
    topupGases.length > 0
  ) {
    const kept = calcDrainMEP_noHe(
      { fractions, targetO2MEP, targetHeMEP, targetN2MEP, targetMEP },
      currentTotalMEP,
      pureO2,
      topupGases[0],
    );
    if (kept !== undefined && kept < currentTotalMEP - MIN_MEP_DELTA) {
      needsDrain = true;
      drainToMEP = Math.min(drainToMEP, kept);
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
    const heGasO2Frac = heGasForCalc.o2 / 100;

    const topupGas = topupGases[0];
    const airO2Frac = topupGas.o2 / 100;

    const drainCtx: DrainCalcCtx = {
      fractions,
      targetO2MEP,
      targetHeMEP,
      targetN2MEP,
      targetMEP,
    };

    const calculatedDrainMEP: number | undefined = pureO2
      ? calcDrainMEP_withO2(
          drainCtx,
          currentTotalMEP,
          heGasForCalc,
          pureO2,
          topupGas,
        )
      : pureHe
        ? calcDrainMEP_pureHe_airOnly(drainCtx, airO2Frac)
        : calcDrainMEP_trimixHe_airOnly(
            drainCtx,
            heGasO2Frac,
            heGasHeFrac,
            airO2Frac,
          );

    // Apply drain only if we got a valid finite result that makes sense
    if (
      calculatedDrainMEP !== undefined &&
      Number.isFinite(calculatedDrainMEP) &&
      calculatedDrainMEP > MIN_MEP_DELTA
    ) {
      const drainMEP = calculatedDrainMEP;
      if (
        drainMEP < currentTotalMEP - MIN_MEP_DELTA ||
        (currentPressure >= targetPressure - MIN_MEP_DELTA &&
          deltaHe > MIN_MEP_DELTA)
      ) {
        needsDrain = true;
        drainToMEP = Math.min(drainToMEP, drainMEP);
      }
    } else {
      // No amount kept works (or next to nothing): start from an empty tank.
      needsDrain = true;
      drainToMEP = 0;
    }
  }

  // Execute the drain — convert drain MEP back to gauge pressure
  if (needsDrain) {
    const drainFracs = getFractions();
    const drainToGauge = roundTo(
      Math.max(0, mepToGauge(drainToMEP, drainFracs.o2, drainFracs.he)),
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
      const P_he = mepToGauge(totalMEP_target, tO2, tHe);
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
        const addedMEP = mepToReach(
          { o2: currentO2MEP, he: currentHeMEP, n2: currentN2MEP },
          currentPressure,
          topupGas,
          targetPressure,
        );
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
        const o2FillTo = solveO2FillPressure(
          { o2: currentO2MEP, he: currentHeMEP, n2: currentN2MEP },
          targetPressure,
          targetO2Fraction,
          targetMEP,
          pureO2,
          bestTopupGas,
        );
        const o2Pressure =
          o2FillTo === undefined ? 0 : o2FillTo - currentPressure;

        // Topup gas fills the remainder; round O2 first so topup gas absorbs
        // rounding error. Cap O2 at remainingPressure: rounding/approximation
        // can push o2Pressure slightly above remainingPressure, which would
        // overshoot targetPressure.
        let o2Rounded = Math.max(
          0,
          Math.min(
            remainingPressure,
            Math.round(Math.max(0, o2Pressure) * 10) / 10,
          ),
        );
        let topupRounded = Math.max(
          0,
          Math.round((remainingPressure - o2Rounded) * 10) / 10,
        );
        // A top-up too small to make would leave the tank short; O2 takes it.
        if (o2Rounded > MIN_ADDITION_BAR && topupRounded <= MIN_ADDITION_BAR) {
          o2Rounded = roundTo(remainingPressure, 1);
          topupRounded = 0;
        }

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
        const finalRemainingPressure = roundTo(
          targetPressure - currentPressure,
          1,
        );
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
