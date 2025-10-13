/**
 * Gas Blender Calculator - TypeScript Edition
 * Uses proper partial pressure calculations based on standard gas blending formulas
 * Reference: The partial pressure of each component must equal: fraction × total_pressure
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
}

export interface BlendingResult {
  steps: BlendingStep[];
  finalMix: {
    o2: number;
    he: number;
    pressure: number;
  };
  success: boolean;
  error?: string;
}

/**
 * Calculate required gas additions using proper partial pressure math
 * Order: 1) Drain (if needed), 2) Add Helium, 3) Add O2, 4) Add Air/Nitrox last
 */
export function calculateBlendingSteps(
  startingGas: TankState,
  targetGas: TargetGas,
  availableGases: Gas[]
): BlendingResult {
  const steps: BlendingStep[] = [];

  // Validate inputs
  if (targetGas.o2 + targetGas.he > 100) {
    return {
      steps: [],
      finalMix: {o2: startingGas.o2, he: startingGas.he, pressure: startingGas.pressure},
      success: false,
      error: 'Target O₂ + He exceeds 100%'
    };
  }

  // Current state
  let currentPressure = startingGas.pressure;
  let currentO2Fraction = startingGas.o2 / 100;
  let currentHeFraction = startingGas.he / 100;
  let currentN2Fraction = 1 - currentO2Fraction - currentHeFraction;

  // Target state
  const targetPressure = targetGas.pressure;
  const targetO2Fraction = targetGas.o2 / 100;
  const targetHeFraction = targetGas.he / 100;
  const targetN2Fraction = 1 - targetO2Fraction - targetHeFraction;

  // Calculate target partial pressures
  const targetO2PP = targetO2Fraction * targetPressure;
  const targetHePP = targetHeFraction * targetPressure;
  const targetN2PP = targetN2Fraction * targetPressure;

  // Calculate current partial pressures
  let currentO2PP = currentO2Fraction * currentPressure;
  let currentHePP = currentHeFraction * currentPressure;
  let currentN2PP = currentN2Fraction * currentPressure;

  // Calculate needed additions (delta partial pressures)
  let deltaHe = targetHePP - currentHePP;
  let deltaN2 = targetN2PP - currentN2PP;
  let deltaO2 = targetO2PP - currentO2PP;

  // STEP 0: Check if we need to drain (ALWAYS FIRST STEP if needed)
  if (deltaHe < -0.5 || deltaN2 < -0.5 || deltaO2 < -0.5) {
    let drainToPressure = currentPressure;
    let canPartialDrain = true;

    if (deltaHe < -0.5) {
      if (currentHeFraction > 0.001) {
        const maxPressureForHe = targetHePP / currentHeFraction;
        drainToPressure = Math.min(drainToPressure, maxPressureForHe);
      } else {
        canPartialDrain = false;
      }
    }
    if (deltaO2 < -0.5) {
      if (currentO2Fraction > 0.001) {
        const maxPressureForO2 = targetO2PP / currentO2Fraction;
        drainToPressure = Math.min(drainToPressure, maxPressureForO2);
      } else {
        canPartialDrain = false;
      }
    }
    if (deltaN2 < -0.5) {
      if (currentN2Fraction > 0.001) {
        const maxPressureForN2 = targetN2PP / currentN2Fraction;
        drainToPressure = Math.min(drainToPressure, maxPressureForN2);
      } else {
        canPartialDrain = false;
      }
    }

    drainToPressure = Math.max(0, Math.round(drainToPressure * 100) / 100);
    const drainAmount = currentPressure - drainToPressure;

    if (drainAmount > 0.5 && canPartialDrain && drainToPressure > 0) {
      steps.push({
        action: `Drain to ${drainToPressure} bar`,
        fromPressure: currentPressure,
        toPressure: drainToPressure,
        drainedPressure: drainAmount,
        currentMix: `${Math.round(startingGas.o2 * 10) / 10}/${Math.round(startingGas.he * 10) / 10}`,
        newMix: `${Math.round(currentO2Fraction * 1000) / 10}/${Math.round(currentHeFraction * 1000) / 10}`
      });

      currentPressure = drainToPressure;
      currentO2PP = currentO2Fraction * currentPressure;
      currentHePP = currentHeFraction * currentPressure;
      currentN2PP = currentN2Fraction * currentPressure;

      deltaHe = targetHePP - currentHePP;
      deltaN2 = targetN2PP - currentN2PP;
      deltaO2 = targetO2PP - currentO2PP;
    } else if (!canPartialDrain || drainAmount >= currentPressure - 0.5) {
      steps.push({
        action: 'Drain tank completely',
        fromPressure: currentPressure,
        toPressure: 0,
        drainedPressure: currentPressure,
        currentMix: `${Math.round(startingGas.o2 * 10) / 10}/${Math.round(startingGas.he * 10) / 10}`,
        newMix: '0/0'
      });

      currentPressure = 0;
      currentO2PP = 0;
      currentHePP = 0;
      currentN2PP = 0;
      deltaHe = targetHePP;
      deltaN2 = targetN2PP;
      deltaO2 = targetO2PP;
    }
  }

  // Get available gases
  const pureHe = availableGases.find(g => g.he > 95 && g.o2 < 5);
  const pureO2 = availableGases.find(g => g.o2 > 95 && g.he < 5);
  const trimixGases = availableGases.filter(g => g.he > 30).sort((a, b) => b.he - a.he);
  const airGases = availableGases.filter(g => g.he < 5 && g.o2 >= 19 && g.o2 <= 40).sort((a, b) => a.o2 - b.o2);

  // STEP 1: Add helium if needed (use pure He or trimix)
  if (deltaHe > 0.1) {
    const heGas = pureHe || trimixGases[0];

    if (heGas) {
      const heToAdd = Math.round((deltaHe / (heGas.he / 100)) * 100) / 100;

      const prevPressure = currentPressure;
      const prevO2Fraction = currentO2Fraction;
      const prevHeFraction = currentHeFraction;

      const o2Added = (heGas.o2 / 100) * heToAdd;
      const heAdded = (heGas.he / 100) * heToAdd;
      const n2Added = ((100 - heGas.o2 - heGas.he) / 100) * heToAdd;

      currentO2PP += o2Added;
      currentHePP += heAdded;
      currentN2PP += n2Added;
      currentPressure += heToAdd;

      const newO2Fraction = currentO2PP / currentPressure;
      const newHeFraction = currentHePP / currentPressure;

      steps.push({
        action: `Add ${heGas.name}`,
        gas: heGas.name,
        fromPressure: Math.round(prevPressure * 100) / 100,
        toPressure: Math.round(currentPressure * 100) / 100,
        addedPressure: heToAdd,
        currentMix: `${Math.round(prevO2Fraction * 1000) / 10}/${Math.round(prevHeFraction * 1000) / 10}`,
        newMix: `${Math.round(newO2Fraction * 1000) / 10}/${Math.round(newHeFraction * 1000) / 10}`
      });

      currentO2Fraction = newO2Fraction;
      currentHeFraction = newHeFraction;
      currentN2Fraction = 1 - currentO2Fraction - currentHeFraction;

      deltaN2 = targetN2PP - currentN2PP;
      deltaO2 = targetO2PP - currentO2PP;
    }
  }

  // STEP 2: Calculate how much air/nitrox we'll need to reach target pressure
  // We need to account for the O2 that the air will contribute BEFORE adding pure O2
  const remainingPressure = targetPressure - currentPressure;

  if (remainingPressure > 0.1) {
    // Special case: If we only have pure O2 available, just add it
    if (pureO2 && airGases.length === 0) {
      const o2ToAdd = Math.round(remainingPressure * 10) / 10;

      if (o2ToAdd > 0.1) {
        const prevPressure = currentPressure;
        const prevO2Fraction = currentO2Fraction;
        const prevHeFraction = currentHeFraction;

        currentO2PP += (pureO2.o2 / 100) * o2ToAdd;
        currentHePP += (pureO2.he / 100) * o2ToAdd;
        currentN2PP += ((100 - pureO2.o2 - pureO2.he) / 100) * o2ToAdd;
        currentPressure += o2ToAdd;

        const newO2Fraction = currentO2PP / currentPressure;
        const newHeFraction = currentHePP / currentPressure;

        steps.push({
          action: `Add ${pureO2.name}`,
          gas: pureO2.name,
          fromPressure: Math.round(prevPressure * 10) / 10,
          toPressure: Math.round(currentPressure * 10) / 10,
          addedPressure: o2ToAdd,
          currentMix: `${Math.round(prevO2Fraction * 100 * 10) / 10}/${Math.round(prevHeFraction * 100 * 10) / 10}`,
          newMix: `${Math.round(newO2Fraction * 100 * 10) / 10}/${Math.round(newHeFraction * 100 * 10) / 10}`
        });

        currentO2Fraction = newO2Fraction;
        currentHeFraction = newHeFraction;
        currentN2Fraction = 1 - currentO2Fraction - currentHeFraction;
      }
    } else if (airGases.length > 0) {
      // Find the best air/nitrox gas to get closest to target mix
      let bestAirGas = airGases[0];
      let bestDiff = Infinity;

      for (const airGas of airGases) {
        const testO2PP = currentO2PP + (airGas.o2 / 100) * remainingPressure;
        const testHePP = currentHePP + (airGas.he / 100) * remainingPressure;

        const testO2Fraction = testO2PP / targetPressure;
        const testHeFraction = testHePP / targetPressure;

        const diff = Math.abs(testO2Fraction * 100 - targetGas.o2) + Math.abs(testHeFraction * 100 - targetGas.he);

        if (diff < bestDiff) {
          bestDiff = diff;
          bestAirGas = airGas;
        }
      }

      // Special case: If we have pure O2 and a low-O2 gas (like Air),
      // solve the two-gas blending equation precisely
      if (pureO2 && bestAirGas && Math.abs(bestAirGas.o2 - pureO2.o2) > 10) {
        // Solve system of equations for two-gas blend:
        // Let x = pressure of O2, y = pressure of air/nitrox
        // x + y = remainingPressure
        // (pureO2.o2/100)*x + (airGas.o2/100)*y = neededO2PP

        const neededO2PP = targetO2PP - currentO2PP;
        const neededHePP = targetHePP - currentHePP;
        const neededN2PP = targetN2PP - currentN2PP;

        const o2GasFraction = pureO2.o2 / 100;
        const airGasFraction = bestAirGas.o2 / 100;
        const airHeGasFraction = bestAirGas.he / 100;
        const airN2GasFraction = (100 - bestAirGas.o2 - bestAirGas.he) / 100;

        // Solve for y (air/nitrox pressure) using N2 or O2 equation
        let airPressure: number;
        let o2Pressure: number;

        // If we need nitrogen, solve using the nitrogen equation
        if (neededN2PP > 0.1 && airN2GasFraction > 0.01) {
          airPressure = neededN2PP / airN2GasFraction;
          o2Pressure = remainingPressure - airPressure;
        } else {
          // Solve using O2 equation: neededO2PP = o2GasFraction*x + airGasFraction*y
          // where x + y = remainingPressure, so x = remainingPressure - y
          // neededO2PP = o2GasFraction*(remainingPressure - y) + airGasFraction*y
          // neededO2PP = o2GasFraction*remainingPressure - o2GasFraction*y + airGasFraction*y
          // neededO2PP = o2GasFraction*remainingPressure + y*(airGasFraction - o2GasFraction)
          // y = (neededO2PP - o2GasFraction*remainingPressure) / (airGasFraction - o2GasFraction)

          if (Math.abs(airGasFraction - o2GasFraction) > 0.01) {
            airPressure = (neededO2PP - o2GasFraction * remainingPressure) / (airGasFraction - o2GasFraction);
            o2Pressure = remainingPressure - airPressure;
          } else {
            // Gases too similar, use simpler approach
            airPressure = remainingPressure;
            o2Pressure = 0;
          }
        }

        // Clamp to valid ranges
        airPressure = Math.max(0, Math.min(remainingPressure, airPressure));
        o2Pressure = Math.max(0, Math.min(remainingPressure, o2Pressure));

        // Ensure they sum to remainingPressure
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
          const prevPressure = currentPressure;
          const prevO2Fraction = currentO2Fraction;
          const prevHeFraction = currentHeFraction;

          currentO2PP += (pureO2.o2 / 100) * o2Pressure;
          currentHePP += (pureO2.he / 100) * o2Pressure;
          currentN2PP += ((100 - pureO2.o2 - pureO2.he) / 100) * o2Pressure;
          currentPressure += o2Pressure;

          const newO2Fraction = currentO2PP / currentPressure;
          const newHeFraction = currentHePP / currentPressure;

          steps.push({
            action: `Add ${pureO2.name}`,
            gas: pureO2.name,
            fromPressure: Math.round(prevPressure * 10) / 10,
            toPressure: Math.round(currentPressure * 10) / 10,
            addedPressure: o2Pressure,
            currentMix: `${Math.round(prevO2Fraction * 100 * 10) / 10}/${Math.round(prevHeFraction * 100 * 10) / 10}`,
            newMix: `${Math.round(newO2Fraction * 100 * 10) / 10}/${Math.round(newHeFraction * 100 * 10) / 10}`
          });

          currentO2Fraction = newO2Fraction;
          currentHeFraction = newHeFraction;
          currentN2Fraction = 1 - currentO2Fraction - currentHeFraction;
        }

        // Then add air/nitrox
        if (airPressure > 0.1) {
          const prevPressure = currentPressure;
          const prevO2Fraction = currentO2Fraction;
          const prevHeFraction = currentHeFraction;

          currentO2PP += (bestAirGas.o2 / 100) * airPressure;
          currentHePP += (bestAirGas.he / 100) * airPressure;
          currentN2PP += ((100 - bestAirGas.o2 - bestAirGas.he) / 100) * airPressure;
          currentPressure += airPressure;

          const newO2Fraction = currentO2PP / currentPressure;
          const newHeFraction = currentHePP / currentPressure;

          steps.push({
            action: `Top up with ${bestAirGas.name}`,
            gas: bestAirGas.name,
            fromPressure: Math.round(prevPressure * 10) / 10,
            toPressure: Math.round(currentPressure * 10) / 10,
            addedPressure: airPressure,
            currentMix: `${Math.round(prevO2Fraction * 100 * 10) / 10}/${Math.round(prevHeFraction * 100 * 10) / 10}`,
            newMix: `${Math.round(newO2Fraction * 100 * 10) / 10}/${Math.round(newHeFraction * 100 * 10) / 10}`
          });

          currentO2Fraction = newO2Fraction;
          currentHeFraction = newHeFraction;
          currentN2Fraction = 1 - currentO2Fraction - currentHeFraction;
        }
      } else {
        // Original algorithm for cases without precise two-gas solution
        // Calculate how much O2 the air will contribute
        const o2FromAir = (bestAirGas.o2 / 100) * remainingPressure;
        const projectedO2PP = currentO2PP + o2FromAir;

        // Recalculate deltaO2 considering what air will add
        deltaO2 = targetO2PP - projectedO2PP;

        // STEP 2a: Add pure O2 ONLY if we still need more O2 after accounting for air
        if (deltaO2 > 0.1 && pureO2) {
          const o2ToAdd = Math.round(deltaO2 * 10) / 10;

          const prevPressure = currentPressure;
          const prevO2Fraction = currentO2Fraction;
          const prevHeFraction = currentHeFraction;

          currentO2PP += o2ToAdd;
          currentPressure += o2ToAdd;

          const newO2Fraction = currentO2PP / currentPressure;
          const newHeFraction = currentHePP / currentPressure;

          steps.push({
            action: `Add ${pureO2.name}`,
            gas: pureO2.name,
            fromPressure: Math.round(prevPressure * 10) / 10,
            toPressure: Math.round(currentPressure * 10) / 10,
            addedPressure: o2ToAdd,
            currentMix: `${Math.round(prevO2Fraction * 100 * 10) / 10}/${Math.round(prevHeFraction * 100 * 10) / 10}`,
            newMix: `${Math.round(newO2Fraction * 100 * 10) / 10}/${Math.round(newHeFraction * 100 * 10) / 10}`
          });

          currentO2Fraction = newO2Fraction;
          currentHeFraction = newHeFraction;
          currentN2Fraction = 1 - currentO2Fraction - currentHeFraction;
        }

        // STEP 3: Now add air/nitrox to reach target pressure (ALWAYS LAST)
        const finalRemainingPressure = Math.round((targetPressure - currentPressure) * 10) / 10;

        if (finalRemainingPressure > 0.1) {
          const prevPressure = currentPressure;
          const prevO2Fraction = currentO2Fraction;
          const prevHeFraction = currentHeFraction;

          currentO2PP += (bestAirGas.o2 / 100) * finalRemainingPressure;
          currentHePP += (bestAirGas.he / 100) * finalRemainingPressure;
          currentN2PP += ((100 - bestAirGas.o2 - bestAirGas.he) / 100) * finalRemainingPressure;
          currentPressure += finalRemainingPressure;

          const newO2Fraction = currentO2PP / currentPressure;
          const newHeFraction = currentHePP / currentPressure;

          steps.push({
            action: `Top up with ${bestAirGas.name}`,
            gas: bestAirGas.name,
            fromPressure: Math.round(prevPressure * 10) / 10,
            toPressure: Math.round(currentPressure * 10) / 10,
            addedPressure: finalRemainingPressure,
            currentMix: `${Math.round(prevO2Fraction * 100 * 10) / 10}/${Math.round(prevHeFraction * 100 * 10) / 10}`,
            newMix: `${Math.round(newO2Fraction * 100 * 10) / 10}/${Math.round(newHeFraction * 100 * 10) / 10}`
          });

          currentO2Fraction = newO2Fraction;
          currentHeFraction = newHeFraction;
          currentN2Fraction = 1 - currentO2Fraction - currentHeFraction;
        }
      }
    }
  }

  // Calculate final mix
  const finalMix = {
    o2: Math.round(currentO2Fraction * 1000) / 10,
    he: Math.round(currentHeFraction * 1000) / 10,
    pressure: Math.round(currentPressure * 10) / 10
  };

  // Check if we're close enough to target (more lenient tolerance)
  const o2Error = Math.abs(finalMix.o2 - targetGas.o2);
  const heError = Math.abs(finalMix.he - targetGas.he);
  const pressureError = Math.abs(finalMix.pressure - targetGas.pressure);

  if (o2Error > 0.5 || heError > 0.5 || pressureError > 1) {
    return {
      steps,
      finalMix,
      success: false,
      error: `Unable to reach target mix accurately. Final: ${finalMix.o2}/${finalMix.he} at ${finalMix.pressure} bar. Try adjusting available gases.`
    };
  }

  return {steps, finalMix, success: true};
}
