/**
 * Scuba Tank Weight and Buoyancy Calculator
 * Based on the original calculator from https://henrik.synth.no/scuba/tanks.html
 */

// Constants for conversions
const BAR_PER_PSI = 0.06895;
const PSI_PER_ATM = 14.6959;
const LBS_PER_KG = 2.20462;
const LITERS_PER_CUFT = 28.31685;
const KG_LITER_IN_LBS_CUFT = LBS_PER_KG * LITERS_PER_CUFT;

// Density constants
const STEEL_DENSITY = 7.85; // kg/liter (Chrome-molybdenum steel used in scuba tanks)
const STEEL_DENSITY_IMP = STEEL_DENSITY * KG_LITER_IN_LBS_CUFT; // lbs/cuft
const ALU_DENSITY = 2.7; // kg/liter (6061-T6 aluminum alloy used in scuba tanks)
const ALU_DENSITY_IMP = ALU_DENSITY * KG_LITER_IN_LBS_CUFT; // lbs/cuft
const AIR_DENSITY = 0.001225; // kg/liter (at STP: 15°C, 1 bar)
const AIR_DENSITY_IMP = AIR_DENSITY * KG_LITER_IN_LBS_CUFT; // lbs/cuft
const SALT_DENSITY = 1.024; // kg/liter
const SALT_DENSITY_IMP = SALT_DENSITY * KG_LITER_IN_LBS_CUFT; // lbs/cuft
const FRESH_DENSITY = 1.0; // kg/liter
const FRESH_DENSITY_IMP = FRESH_DENSITY * KG_LITER_IN_LBS_CUFT; // lbs/cuft
const VALVE_WEIGHT = 0.9; // kg (typical DIN/yoke valve weight)
const MANIFOLD_WEIGHT = 1.5; // kg (additional weight for doubles manifold beyond two valves)

export interface TankInput {
  // Metric
  liters: number;
  bar: number;
  kg: number;
  // Imperial
  cuft: number;
  psi: number;
  lbs: number;
  // Options
  isAluminium: boolean;
  isSaltWater: boolean;
  hasValve: boolean;
  isDoubles: boolean;
}

export interface TankResult {
  // Metric
  liters: number;
  bar: number;
  kg: number;
  // Imperial
  cuft: number;
  psi: number;
  lbs: number;
  // Buoyancy results
  emptyBuoyancyKg: number;
  fullBuoyancyKg: number;
  emptyBuoyancyLbs: number;
  fullBuoyancyLbs: number;
  // Calculation details
  calculation: string;
}

function toDec(num: number, fourDigits = false): number {
  if (isNaN(num) || !isFinite(num)) return 0.0;
  if (fourDigits) return parseFloat(num.toFixed(4));
  if (num.toFixed(1).slice(-1) === "0") return parseFloat(num.toFixed(0));
  return parseFloat(num.toFixed(1));
}

export function calculateTankMetric(input: TankInput): TankResult {
  let { kg, liters, bar } = input;
  const { isAluminium, isSaltWater, hasValve, isDoubles } = input;

  // Calculate imperial equivalents
  const cuft = (liters / LITERS_PER_CUFT) * bar;
  const psi = bar / BAR_PER_PSI;
  const lbs = kg * LBS_PER_KG;

  // Calculate buoyancy
  const metal = isAluminium ? ALU_DENSITY : STEEL_DENSITY;
  const water = isSaltWater ? SALT_DENSITY : FRESH_DENSITY;
  let valve = hasValve ? VALVE_WEIGHT : 0;

  if (isDoubles) {
    // Doubles: 2 valves + manifold (more realistic than just 2x valve weight)
    valve = hasValve ? VALVE_WEIGHT * 2 + MANIFOLD_WEIGHT : 0;
    liters = liters * 2;
    kg = kg * 2;
  }

  const volMetal = kg / metal;
  const volValve = valve / STEEL_DENSITY;
  const volume = (volMetal + volValve + liters) * water;
  const air = AIR_DENSITY * bar * liters;
  const empty = volume - kg - valve;
  const full = volume - kg - valve - air;

  // Build calculation text
  let txt = `Steel has a density of ${STEEL_DENSITY} kg/liter`;
  if (metal !== STEEL_DENSITY) {
    txt += `, and aluminium is ${ALU_DENSITY} kg/liter`;
  }
  txt += `<br>The volume of the tank metal is ${kg} kg / ${metal} = <b>${toDec(volMetal, true)} liters</b><br>`;

  let plusValve = "";
  let minusValve = "";
  if (valve !== 0) {
    txt += `The volume of the valve is ${toDec(valve, true)} kg / ${STEEL_DENSITY} = <b>${toDec(volValve, true)} liters</b><br>`;
    plusValve = " + " + toDec(volValve, true);
    minusValve = " - " + toDec(valve, true);
  }

  if (water === SALT_DENSITY) {
    txt += `The density of salt water is ${SALT_DENSITY} kg/liter<br>`;
  } else {
    txt += `The density of fresh water is ${FRESH_DENSITY} kg/liter<br>`;
  }

  txt += `Total weight in water: (${liters} + ${toDec(volMetal, true)}${plusValve}) x ${water} = <b>${toDec(volume, true)} kg</b><br>`;
  txt += `Air has a density of ${AIR_DENSITY} kg/liter. <br>The air in a full tank weighs ${AIR_DENSITY} x ${liters} liters x ${bar} bar = <b>${toDec(air, true)} kg</b><br>`;
  txt += `<i>Tank buoyancy when empty: ${toDec(volume, true)} - ${kg}${minusValve} = <b>${toDec(empty)} kg</b></i><br>`;
  txt += `<i>Tank buoyancy when full: ${toDec(volume, true)} - ${kg}${minusValve} - ${toDec(air, true)} = <b>${toDec(full)} kg</b></i><br>`;

  return {
    liters: toDec(liters),
    bar: toDec(bar),
    kg: toDec(kg),
    cuft: toDec(cuft),
    psi: toDec(psi),
    lbs: toDec(lbs),
    emptyBuoyancyKg: toDec(empty),
    fullBuoyancyKg: toDec(full),
    emptyBuoyancyLbs: toDec(empty * LBS_PER_KG),
    fullBuoyancyLbs: toDec(full * LBS_PER_KG),
    calculation: txt,
  };
}

export function calculateTankImperial(input: TankInput): TankResult {
  let { lbs, cuft, psi } = input;
  const { isAluminium, isSaltWater, hasValve, isDoubles } = input;

  // Calculate metric equivalents
  const liters = (cuft / (psi * BAR_PER_PSI)) * LITERS_PER_CUFT;
  const bar = psi * BAR_PER_PSI;
  const kg = lbs / LBS_PER_KG;

  // Calculate buoyancy
  const metal = isAluminium ? ALU_DENSITY_IMP : STEEL_DENSITY_IMP;
  const water = isSaltWater ? SALT_DENSITY_IMP : FRESH_DENSITY_IMP;
  let valve = hasValve ? VALVE_WEIGHT * LBS_PER_KG : 0;

  if (isDoubles) {
    // Doubles: 2 valves + manifold (more realistic than just 2x valve weight)
    valve = hasValve ? (VALVE_WEIGHT * 2 + MANIFOLD_WEIGHT) * LBS_PER_KG : 0;
    cuft = cuft * 2;
    lbs = lbs * 2;
  }

  const volInner = (cuft / psi) * PSI_PER_ATM;
  const volMetal = lbs / metal;
  const volValve = valve / STEEL_DENSITY_IMP;
  const volume = (volInner + volMetal + volValve) * water;
  const air = AIR_DENSITY_IMP * cuft;
  const empty = volume - lbs - valve;
  const full = volume - lbs - valve - air;

  // Build calculation text
  let txt = `<br><br>Air has a pressure of ${PSI_PER_ATM} psi at 1 ATM.<br>Tank inner volume is ${cuft} cuft / ${psi} psi x ${PSI_PER_ATM} = <b>${toDec(volInner, true)} cuft</b><br>`;
  txt += `Steel has a density of ${toDec(STEEL_DENSITY_IMP, true)} lbs/cuft`;

  if (metal !== STEEL_DENSITY_IMP) {
    txt += `, and aluminium is ${toDec(ALU_DENSITY_IMP, true)} lbs/cuft`;
  }

  txt += `<br>The volume of the tank metal is ${lbs} lbs / ${toDec(metal, true)} = <b>${toDec(volMetal, true)} cuft</b><br>`;

  let plusValve = "";
  let minusValve = "";
  if (valve !== 0) {
    txt += `The volume of the valve is ${toDec(valve, true)} lbs / ${toDec(STEEL_DENSITY_IMP, true)} = <b>${toDec(volValve, true)} cuft</b><br>`;
    plusValve = " + " + toDec(volValve, true);
    minusValve = " - " + toDec(valve, true);
  }

  if (water === SALT_DENSITY_IMP) {
    txt += `The density of salt water is ${toDec(SALT_DENSITY_IMP, true)} lbs/cuft<br>`;
  } else {
    txt += `The density of fresh water is ${toDec(FRESH_DENSITY_IMP, true)} lbs/cuft<br>`;
  }

  txt += `Total weight in water: (${toDec(volInner, true)} + ${toDec(volMetal, true)}${plusValve}) x ${toDec(water, true)} = <b>${toDec(volume, true)} lbs</b><br>`;
  txt += `Air has a density of ${toDec(AIR_DENSITY_IMP, true)} lbs/cuft. <br>The air in a full tank weighs ${toDec(AIR_DENSITY_IMP, true)} x ${cuft} cuft = <b>${toDec(air, true)} lbs</b><br>`;
  txt += `Tank buoyancy when empty: ${toDec(volume, true)} - ${lbs}${minusValve} = <b>${toDec(empty)} lbs</b><br>`;
  txt += `Tank buoyancy when full: ${toDec(volume, true)} - ${lbs}${minusValve} - ${toDec(air, true)} = <b>${toDec(full)} lbs</b><br>`;

  return {
    liters: toDec(liters),
    bar: toDec(bar),
    kg: toDec(kg),
    cuft: toDec(cuft),
    psi: toDec(psi),
    lbs: toDec(lbs),
    emptyBuoyancyKg: toDec(empty / LBS_PER_KG),
    fullBuoyancyKg: toDec(full / LBS_PER_KG),
    emptyBuoyancyLbs: toDec(empty),
    fullBuoyancyLbs: toDec(full),
    calculation: txt,
  };
}
