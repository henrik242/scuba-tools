/**
 * Real Gas Calculations using Compressibility Z-factors
 * Based on empirical data from NIST for N₂, O₂, and He
 * Temperature: 20°C (293K) - typical gas blending temperature
 */

// Z-factor lookup tables: [pressure (bar), Z-factor]
// Data source: NIST WebBook (interpolated for scuba pressures)

const Z_NITROGEN = [
  [0, 1.0],
  [10, 1.0017],
  [20, 1.0035],
  [30, 1.0053],
  [40, 1.0071],
  [50, 1.0088],
  [75, 1.0145],
  [100, 1.0251],
  [125, 1.0366],
  [150, 1.0482],
  [175, 1.0626],
  [200, 1.0771],
  [225, 1.0938],
  [250, 1.1108],
  [275, 1.1295],
  [300, 1.1485],
  [350, 1.189],
  [400, 1.2315],
];

const Z_OXYGEN = [
  [0, 1.0],
  [10, 0.9984],
  [20, 0.9968],
  [30, 0.9952],
  [40, 0.9937],
  [50, 0.9922],
  [75, 0.9864],
  [100, 0.9776],
  [125, 0.9706],
  [150, 0.9638],
  [175, 0.9585],
  [200, 0.9534],
  [225, 0.95],
  [250, 0.9468],
  [275, 0.9453],
  [300, 0.9439],
  [350, 0.9425],
  [400, 0.9428],
];

const Z_HELIUM = [
  [0, 1.0],
  [10, 1.0044],
  [20, 1.0091],
  [30, 1.014],
  [40, 1.0188],
  [50, 1.0236],
  [75, 1.038],
  [100, 1.0548],
  [125, 1.0722],
  [150, 1.09],
  [175, 1.1091],
  [200, 1.1285],
  [225, 1.1488],
  [250, 1.1695],
  [275, 1.1909],
  [300, 1.2126],
  [350, 1.2574],
  [400, 1.3038],
];

/**
 * Interpolate Z-factor for a given pressure
 * Uses linear interpolation between lookup table values
 */
export function interpolateZ(pressure: number, zTable: number[][]): number {
  // Handle edge cases
  if (pressure <= zTable[0][0]) return zTable[0][1];
  if (pressure >= zTable[zTable.length - 1][0]) {
    return zTable[zTable.length - 1][1];
  }

  // Find bracketing points
  for (let i = 0; i < zTable.length - 1; i++) {
    if (pressure >= zTable[i][0] && pressure <= zTable[i + 1][0]) {
      const p0 = zTable[i][0];
      const p1 = zTable[i + 1][0];
      const z0 = zTable[i][1];
      const z1 = zTable[i + 1][1];

      // Linear interpolation
      const t = (pressure - p0) / (p1 - p0);
      return z0 + t * (z1 - z0);
    }
  }

  return 1.0; // Fallback (should never reach here)
}

/**
 * Get Z-factor for pure nitrogen at given pressure
 */
export function getZNitrogen(pressure: number): number {
  return interpolateZ(pressure, Z_NITROGEN);
}

/**
 * Get Z-factor for pure oxygen at given pressure
 */
export function getZOxygen(pressure: number): number {
  return interpolateZ(pressure, Z_OXYGEN);
}

/**
 * Get Z-factor for pure helium at given pressure
 */
export function getZHelium(pressure: number): number {
  return interpolateZ(pressure, Z_HELIUM);
}

/**
 * Calculate mixture Z-factor using Kay's mixing rule
 * Z_mix = Σ (y_i × Z_i) where y_i is mole fraction
 *
 * @param o2Fraction - Oxygen mole fraction (0-1)
 * @param heFraction - Helium mole fraction (0-1)
 * @param pressure - Total pressure in bar
 * @returns Compressibility factor for the mixture
 */
export function calculateMixtureZ(
  o2Fraction: number,
  heFraction: number,
  pressure: number,
): number {
  const n2Fraction = Math.max(0, 1 - o2Fraction - heFraction);

  const z_o2 = getZOxygen(pressure);
  const z_he = getZHelium(pressure);
  const z_n2 = getZNitrogen(pressure);

  // Kay's Rule: weighted average by mole fraction
  return o2Fraction * z_o2 + heFraction * z_he + n2Fraction * z_n2;
}

/**
 * Calculate partial pressure from moles using real gas equation
 * P = nZRT/V
 *
 * Note: For partial pressures in a mixture, we use the mixture Z-factor
 * and calculate the partial pressure as the mole fraction times total pressure
 */
export function molestoPartialPressure(
  moles: number,
  totalMoles: number,
  totalPressure: number,
): number {
  if (totalMoles <= 0) return 0;
  return (moles / totalMoles) * totalPressure;
}

/**
 * Calculate moles from pressure using real gas equation
 * n = PV/(ZRT)
 *
 * For simplicity, we work with "pressure-volumes" (PV) which is proportional to moles
 * This eliminates the need to track R, T, and V explicitly
 * The ratio of moles is preserved through mole fractions
 */
export function pressureToMoleFraction(
  partialPressure: number,
  zFactor: number,
): number {
  // Moles ∝ P/Z (when V, R, T are constant)
  // We return P/Z as a "mole equivalent"
  return partialPressure / zFactor;
}

/**
 * Convert gas composition and pressure to mole equivalents
 * Returns object with O2, He, N2 mole amounts (proportional to actual moles)
 *
 * For a gas mixture: n_total = P_total * V / (Z_mix * R * T)
 * For component i: n_i = y_i * n_total where y_i is mole fraction
 *
 * We use P*V/(Z*R*T) as "mole equivalent" to avoid tracking V, R, T explicitly
 */
export function gasToMoleEquivalents(
  o2Percent: number,
  hePercent: number,
  pressure: number,
): { o2: number; he: number; n2: number; total: number } {
  const o2Frac = o2Percent / 100;
  const heFrac = hePercent / 100;
  const n2Frac = Math.max(0, 1 - o2Frac - heFrac);

  // Get mixture Z-factor at this pressure and composition
  const zMix = calculateMixtureZ(o2Frac, heFrac, pressure);

  // Total mole equivalent: P*V/(Z*R*T) ≈ P/Z (when V, R, T are constant)
  const totalMoleEquiv = pressure / zMix;

  // Individual component mole equivalents = mole fraction × total moles
  const o2Moles = o2Frac * totalMoleEquiv;
  const heMoles = heFrac * totalMoleEquiv;
  const n2Moles = n2Frac * totalMoleEquiv;

  return {
    o2: o2Moles,
    he: heMoles,
    n2: n2Moles,
    total: totalMoleEquiv,
  };
}

/**
 * Convert mole equivalents back to gas composition at a given pressure
 * This is simpler than it seems: mole equivalents already preserve composition
 * The mole fractions directly give us the gas percentages
 */
export function moleEquivalentsToGas(
  o2Moles: number,
  heMoles: number,
  n2Moles: number,
  targetPressure: number,
): { o2Percent: number; hePercent: number; n2Percent: number } {
  const totalMoles = o2Moles + heMoles + n2Moles;

  if (totalMoles <= 0) {
    return { o2Percent: 0, hePercent: 0, n2Percent: 0 };
  }

  // Mole fractions = composition percentages
  // This works because our "mole equivalents" preserve the actual mole ratios
  const o2Frac = o2Moles / totalMoles;
  const heFrac = heMoles / totalMoles;
  const n2Frac = n2Moles / totalMoles;

  return {
    o2Percent: o2Frac * 100,
    hePercent: heFrac * 100,
    n2Percent: n2Frac * 100,
  };
}

/**
 * Solve for the pressure to add to reach target total moles
 * This accounts for real gas Z-factor effects
 *
 * @param currentO2Moles - Current O2 mole equivalents in tank
 * @param currentHeMoles - Current He mole equivalents in tank
 * @param currentN2Moles - Current N2 mole equivalents in tank
 * @param currentPressure - Current total pressure
 * @param addGasO2Percent - O2 percentage in gas being added
 * @param addGasHePercent - He percentage in gas being added
 * @param targetTotalMoles - Target total mole equivalents after addition
 * @returns Pressure to add (in bar)
 */
export function solveForAddPressure(
  currentO2Moles: number,
  currentHeMoles: number,
  currentN2Moles: number,
  currentPressure: number,
  addGasO2Percent: number,
  addGasHePercent: number,
  targetTotalMoles: number,
): number {
  const currentTotalMoles = currentO2Moles + currentHeMoles + currentN2Moles;
  const deltaMoles = targetTotalMoles - currentTotalMoles;

  if (deltaMoles <= 0) {
    return 0;
  }

  // Initial guess based on ideal gas (will be refined)
  let addPressure = deltaMoles * 1.0; // rough estimate

  // Iteratively solve for correct add pressure
  for (let iter = 0; iter < 30; iter++) {
    const result = addGasToTank(
      currentO2Moles,
      currentHeMoles,
      currentN2Moles,
      currentPressure,
      addGasO2Percent,
      addGasHePercent,
      addPressure,
    );

    const resultTotalMoles = result.o2Moles + result.heMoles + result.n2Moles;
    const error = resultTotalMoles - targetTotalMoles;

    // Converged?
    if (Math.abs(error) < 0.01) {
      return addPressure;
    }

    // Adjust pressure proportionally to error
    // If error is positive, we added too much, reduce pressure
    // If error is negative, we didn't add enough, increase pressure
    const adjustmentFactor =
      deltaMoles / (resultTotalMoles - currentTotalMoles);
    addPressure *= adjustmentFactor;

    // Safety bounds
    addPressure = Math.max(0.01, Math.min(addPressure, 500));
  }

  return addPressure;
}

/**
 * Solve for the pressure to add a specific amount of ONE component
 * (e.g., add helium to reach target helium moles)
 *
 * @param currentO2Moles - Current O2 mole equivalents
 * @param currentHeMoles - Current He mole equivalents
 * @param currentN2Moles - Current N2 mole equivalents
 * @param currentPressure - Current pressure
 * @param addGasO2Percent - O2% in gas being added
 * @param addGasHePercent - He% in gas being added
 * @param targetComponentMoles - Target moles for the specific component
 * @param component - Which component: 'o2', 'he', or 'n2'
 * @returns Pressure to add
 */
export function solveForComponentAddPressure(
  currentO2Moles: number,
  currentHeMoles: number,
  currentN2Moles: number,
  currentPressure: number,
  addGasO2Percent: number,
  addGasHePercent: number,
  targetComponentMoles: number,
  component: "o2" | "he" | "n2",
): number {
  const addGasN2Percent = Math.max(0, 100 - addGasO2Percent - addGasHePercent);

  const currentComponent =
    component === "o2"
      ? currentO2Moles
      : component === "he"
        ? currentHeMoles
        : currentN2Moles;

  const deltaMoles = targetComponentMoles - currentComponent;

  if (deltaMoles <= 0) {
    return 0;
  }

  // Initial guess
  const componentFraction =
    component === "o2"
      ? addGasO2Percent / 100
      : component === "he"
        ? addGasHePercent / 100
        : addGasN2Percent / 100;

  if (componentFraction <= 0.001) {
    return 0; // Can't add this component with this gas
  }

  let addPressure = deltaMoles / componentFraction;

  // Iteratively refine
  for (let iter = 0; iter < 30; iter++) {
    const result = addGasToTank(
      currentO2Moles,
      currentHeMoles,
      currentN2Moles,
      currentPressure,
      addGasO2Percent,
      addGasHePercent,
      addPressure,
    );

    const resultComponent =
      component === "o2"
        ? result.o2Moles
        : component === "he"
          ? result.heMoles
          : result.n2Moles;

    const error = resultComponent - targetComponentMoles;

    if (Math.abs(error) < 0.01) {
      return addPressure;
    }

    // Adjust
    const adjustmentFactor = deltaMoles / (resultComponent - currentComponent);
    addPressure *= adjustmentFactor;

    addPressure = Math.max(0.01, Math.min(addPressure, 500));
  }

  return addPressure;
}

/**
 * Add gas to tank using real gas calculations
 * Returns updated mole equivalents
 *
 * CRITICAL: The addPressure represents the desired pressure increase in the tank.
 * We solve iteratively to find the exact amount of moles to add such that
 * the final pressure = currentPressure + addPressure (accounting for Z-factors).
 */
export function addGasToTank(
  currentO2Moles: number,
  currentHeMoles: number,
  currentN2Moles: number,
  currentPressure: number,
  addGasO2Percent: number,
  addGasHePercent: number,
  addPressure: number,
): {
  o2Moles: number;
  heMoles: number;
  n2Moles: number;
  newPressure: number;
} {
  if (addPressure <= 0) {
    return {
      o2Moles: currentO2Moles,
      heMoles: currentHeMoles,
      n2Moles: currentN2Moles,
      newPressure: currentPressure,
    };
  }

  const targetPressure = currentPressure + addPressure;
  const addO2Frac = addGasO2Percent / 100;
  const addHeFrac = addGasHePercent / 100;
  const addN2Frac = Math.max(0, 1 - addO2Frac - addHeFrac);

  // Iteratively solve for the amount of moles to add
  // Target: Find deltaMoles such that after adding, pressure = targetPressure

  // Initial guess: use addPressure directly (ideal gas approximation)
  let deltaTotalMoles = addPressure;

  for (let iter = 0; iter < 30; iter++) {
    // Calculate moles from delta
    const deltaO2Moles = addO2Frac * deltaTotalMoles;
    const deltaHeMoles = addHeFrac * deltaTotalMoles;
    const deltaN2Moles = addN2Frac * deltaTotalMoles;

    // New moles after adding
    const newO2Moles = currentO2Moles + deltaO2Moles;
    const newHeMoles = currentHeMoles + deltaHeMoles;
    const newN2Moles = currentN2Moles + deltaN2Moles;
    const totalNewMoles = newO2Moles + newHeMoles + newN2Moles;

    if (totalNewMoles <= 0) {
      return {
        o2Moles: 0,
        heMoles: 0,
        n2Moles: 0,
        newPressure: 0,
      };
    }

    // Calculate composition
    const newO2Frac = newO2Moles / totalNewMoles;
    const newHeFrac = newHeMoles / totalNewMoles;

    // Get Z-factor at target pressure
    const zMix = calculateMixtureZ(newO2Frac, newHeFrac, targetPressure);

    // Required total moles to reach target pressure: n = P/Z
    const requiredTotalMoles = targetPressure / zMix;

    const error = totalNewMoles - requiredTotalMoles;

    // Converged?
    if (Math.abs(error) < 0.001) {
      return {
        o2Moles: newO2Moles,
        heMoles: newHeMoles,
        n2Moles: newN2Moles,
        newPressure: targetPressure,
      };
    }

    // Adjust deltaTotalMoles
    // We need to add (requiredTotalMoles - currentTotalMoles) total moles
    const currentTotalMoles = currentO2Moles + currentHeMoles + currentN2Moles;
    deltaTotalMoles = requiredTotalMoles - currentTotalMoles;

    // Safety bounds
    if (deltaTotalMoles < 0) deltaTotalMoles = 0;
  }

  // Final calculation (should have converged)
  const deltaO2Moles = addO2Frac * deltaTotalMoles;
  const deltaHeMoles = addHeFrac * deltaTotalMoles;
  const deltaN2Moles = addN2Frac * deltaTotalMoles;

  return {
    o2Moles: currentO2Moles + deltaO2Moles,
    heMoles: currentHeMoles + deltaHeMoles,
    n2Moles: currentN2Moles + deltaN2Moles,
    newPressure: targetPressure,
  };
}

/**
 * Drain tank by a given ratio using real gas calculations
 * When draining, all components are removed proportionally
 */
export function drainTank(
  currentO2Moles: number,
  currentHeMoles: number,
  currentN2Moles: number,
  currentPressure: number,
  targetPressure: number,
): {
  o2Moles: number;
  heMoles: number;
  n2Moles: number;
  newPressure: number;
} {
  if (currentPressure <= 0) {
    return {
      o2Moles: currentO2Moles,
      heMoles: currentHeMoles,
      n2Moles: currentN2Moles,
      newPressure: 0,
    };
  }

  const ratio = targetPressure / currentPressure;

  return {
    o2Moles: currentO2Moles * ratio,
    heMoles: currentHeMoles * ratio,
    n2Moles: currentN2Moles * ratio,
    newPressure: targetPressure,
  };
}

/**
 * Get comparison data: Ideal vs Real gas Z-factors
 * Useful for debugging and understanding the differences
 */
export function getComparisonData(pressure: number): {
  pressure: number;
  z_n2: number;
  z_o2: number;
  z_he: number;
  z_air: number;
  idealDeviation: {
    n2: string;
    o2: string;
    he: string;
    air: string;
  };
} {
  const z_n2 = getZNitrogen(pressure);
  const z_o2 = getZOxygen(pressure);
  const z_he = getZHelium(pressure);
  const z_air = calculateMixtureZ(0.21, 0, pressure); // Air is 21% O2, 0% He

  const formatDeviation = (z: number) => {
    const percentNum = (z - 1) * 100;
    const percent = percentNum.toFixed(2);
    return `${percentNum > 0 ? "+" : ""}${percent}%`;
  };

  return {
    pressure,
    z_n2,
    z_o2,
    z_he,
    z_air,
    idealDeviation: {
      n2: formatDeviation(z_n2),
      o2: formatDeviation(z_o2),
      he: formatDeviation(z_he),
      air: formatDeviation(z_air),
    },
  };
}
