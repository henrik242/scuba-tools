/**
 * Real gas Z-factor calculations for scuba diving gases at 20°C.
 *
 * Uses empirical polynomial fits to NIST/literature data for O₂, N₂, and He
 * (valid 0–300 bar). Gas mixtures use Kay's rule (linear mole-fraction mixing).
 *
 * At 200 bar, O₂ deviates ~8% from ideal (Z ≈ 0.924). Ignoring this
 * causes a systematic O₂ enrichment of ~0.8% absolute in the final blend,
 * which exceeds the ±0.5% professional tolerance.
 *
 * Representative Z values at 20°C (computed from the polynomial fit below):
 *   O₂: Z(100)≈0.975  Z(200)≈0.924  Z(300)≈0.847
 *   N₂: Z(100)≈0.990  Z(200)≈0.978  Z(300)≈0.964
 *   He: Z(100)≈1.003  Z(200)≈1.006  Z(300)≈1.009  (nearly ideal)
 *
 * Note: NIST data for O₂ at 300 bar gives Z ≈ 0.87.  The quadratic fit
 * diverges slightly at the upper end of its validated range (0–300 bar).
 */

// Z(P) = 1 + a1·P + a2·P²  at 20°C (293 K), P in bar
const Z_COEFF = {
  o2: { a1: -1.2e-4, a2: -1.3e-6 },
  n2: { a1: -9.0e-5, a2: -1.0e-7 },
  he: { a1: 3.1e-5, a2: 0 },
} as const;

function pureZ(gas: keyof typeof Z_COEFF, pressure: number): number {
  if (pressure <= 0) return 1;
  const { a1, a2 } = Z_COEFF[gas];
  return 1 + a1 * pressure + a2 * pressure * pressure;
}

/**
 * Compressibility factor Z for a gas mixture at pressure P (bar).
 * Uses Kay's rule: Z_mix = Σ xᵢ·Zᵢ(P), where xᵢ are mole fractions.
 */
export function gasZ(o2Frac: number, heFrac: number, pressure: number): number {
  if (pressure <= 0) return 1;
  const n2Frac = Math.max(0, 1 - o2Frac - heFrac);
  return (
    o2Frac * pureZ("o2", pressure) +
    heFrac * pureZ("he", pressure) +
    n2Frac * pureZ("n2", pressure)
  );
}

/**
 * Convert total mole-equivalent pressure (MEP = n·R·T/V, proportional to
 * moles) to gauge pressure by solving P = Z(x, P) · MEP iteratively.
 * Converges in 2–3 steps since Z deviates only a few percent from 1.
 */
export function mepToGauge(
  totalMEP: number,
  o2Frac: number,
  heFrac: number,
): number {
  if (totalMEP <= 0) return 0;
  let P = totalMEP; // ideal-gas starting estimate
  for (let i = 0; i < 5; i++) {
    const next = gasZ(o2Frac, heFrac, P) * totalMEP;
    if (Math.abs(next - P) < 0.001) return next;
    P = next;
  }
  return P;
}
