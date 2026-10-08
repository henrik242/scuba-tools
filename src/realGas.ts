/**
 * Real gas compressibility (Z factor) for scuba blending gases near room
 * temperature (about 300 K).
 *
 * Each pure gas uses a cubic virial fit Z = 1 + c1*P + c2*P^2 + c3*P^3 with P
 * in absolute bar. The coefficients are a least-squares fit to the tabulated
 * O2, N2 and He data in Perry's Chemical Engineers' Handbook, 7th ed. (helium
 * interpolated between its 273 K and 323 K isotherms to 300 K). Mixtures
 * combine the pure-gas deviations linearly by mole fraction:
 * Z_mix = 1 + sum(x_i * (Z_i - 1)).
 *
 * At filling pressures N2 and He are stiffer than an ideal gas and O2 a little
 * softer. Representative values (absolute bar):
 *   O2: Z(100)~0.955  Z(200)~0.957  Z(300)~0.998
 *   N2: Z(100)~1.005  Z(200)~1.057  Z(300)~1.142
 *   He: Z(100)~1.048  Z(200)~1.094  Z(300)~1.140
 *
 * Air therefore holds fewer moles per bar than an ideal gas at 200 bar while O2
 * holds slightly more. A blend planned with the ideal gas law (O2 first, then
 * air) lands rich: EAN32 or EAN36 filled to 232 bar comes out about 32.7 % or
 * 37 % O2.
 *
 * Gas amounts are tracked as "ideal bar": absolute pressure divided by Z at
 * that absolute pressure, which is proportional to moles in a fixed volume.
 * Gauge pressure is absolute minus one standard atmosphere, so the atmosphere
 * left in an "empty" cylinder is part of the mix.
 */

/** One standard atmosphere in bar; gauge = absolute - ATM_BAR. */
export const ATM_BAR = 1.01325;

/** Upper bound of the fitted range (absolute bar). */
const MAX_FIT_BAR = 500;

const Z_COEFF = {
  o2: { c1: -7.18092073703e-4, c2: 2.81852572808e-6, c3: -1.50290620492e-9 },
  n2: { c1: -2.19260353292e-4, c2: 2.92844845532e-6, c3: -2.07613482075e-9 },
  he: { c1: 4.87320026468e-4, c2: -8.83632921053e-8, c3: 5.33304543646e-11 },
} as const;

/** Z - 1 for a pure gas at absolute pressure `absBar`. */
function pureDeviation(gas: keyof typeof Z_COEFF, absBar: number): number {
  const p = Math.min(MAX_FIT_BAR, Math.max(0, absBar));
  const { c1, c2, c3 } = Z_COEFF[gas];
  return p * (c1 + p * (c2 + p * c3));
}

/**
 * Compressibility factor of an O2/He/N2 mix at absolute pressure `absBar`.
 * Fractions are mole fractions (0..1); N2 is the remainder.
 */
export function gasZ(o2Frac: number, heFrac: number, absBar: number): number {
  const n2Frac = Math.max(0, 1 - o2Frac - heFrac);
  return (
    1 +
    o2Frac * pureDeviation("o2", absBar) +
    heFrac * pureDeviation("he", absBar) +
    n2Frac * pureDeviation("n2", absBar)
  );
}

/**
 * Amount of gas, in ideal bar (absolute / Z), in a cylinder at `gaugeBar`.
 */
export function gaugeToMEP(
  gaugeBar: number,
  o2Frac: number,
  heFrac: number,
): number {
  const abs = Math.max(0, gaugeBar + ATM_BAR);
  return abs / gasZ(o2Frac, heFrac, abs);
}

/**
 * Gauge pressure of a cylinder holding `mep` ideal bar of the given mix:
 * solves P_abs = Z(P_abs) * mep by fixed-point iteration, then subtracts one
 * atmosphere. Negative when the cylinder holds less than 1 atm.
 */
export function mepToGauge(
  mep: number,
  o2Frac: number,
  heFrac: number,
): number {
  if (mep <= 0) return -ATM_BAR;
  let abs = mep;
  for (let i = 0; i < 20; i++) {
    const next = gasZ(o2Frac, heFrac, abs) * mep;
    const done = Math.abs(next - abs) < 1e-7;
    abs = next;
    if (done) break;
  }
  return abs - ATM_BAR;
}
