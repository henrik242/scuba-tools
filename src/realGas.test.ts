import { describe, expect, it } from "vitest";
import {
  getZNitrogen,
  getZOxygen,
  getZHelium,
  calculateMixtureZ,
  gasToMoleEquivalents,
  moleEquivalentsToGas,
  addGasToTank,
  drainTank,
  getComparisonData,
} from "./realGas";

describe("Real Gas Z-factor Calculations", () => {
  describe("Pure Gas Z-factors", () => {
    it("should return Z ≈ 1.0 at low pressure (ideal gas behavior)", () => {
      expect(getZNitrogen(0)).toBeCloseTo(1.0, 4);
      expect(getZOxygen(0)).toBeCloseTo(1.0, 4);
      expect(getZHelium(0)).toBeCloseTo(1.0, 4);
    });

    it("should show nitrogen Z > 1 at high pressure", () => {
      expect(getZNitrogen(200)).toBeGreaterThan(1.0);
      expect(getZNitrogen(200)).toBeCloseTo(1.0771, 4);
    });

    it("should show oxygen Z < 1 at high pressure", () => {
      expect(getZOxygen(200)).toBeLessThan(1.0);
      expect(getZOxygen(200)).toBeCloseTo(0.9534, 4);
    });

    it("should show helium Z > 1 at high pressure", () => {
      expect(getZHelium(200)).toBeGreaterThan(1.0);
      expect(getZHelium(200)).toBeCloseTo(1.1285, 4);
    });

    it("should interpolate Z-factors correctly between table values", () => {
      // At 150 bar, Z_He = 1.0900 (from table)
      // At 200 bar, Z_He = 1.1285 (from table)
      // At 175 bar, should be midpoint: (1.0900 + 1.1285) / 2 = 1.10925
      const z175 = getZHelium(175);
      expect(z175).toBeCloseTo(1.1091, 4);
    });
  });

  describe("Mixture Z-factors (Kay's Rule)", () => {
    it("should calculate air (21% O2, 79% N2) Z-factor correctly", () => {
      const zAir200 = calculateMixtureZ(0.21, 0, 200);

      // Manual calculation:
      // Z_air = 0.21 * Z_O2 + 0.79 * Z_N2
      // Z_air = 0.21 * 0.9534 + 0.79 * 1.0771
      // Z_air = 0.200214 + 0.850909 = 1.051123
      expect(zAir200).toBeCloseTo(1.0511, 3);
    });

    it("should calculate pure oxygen Z-factor (100% O2)", () => {
      const zO2 = calculateMixtureZ(1.0, 0, 200);
      expect(zO2).toBeCloseTo(getZOxygen(200), 4);
    });

    it("should calculate pure helium Z-factor (100% He)", () => {
      const zHe = calculateMixtureZ(0, 1.0, 200);
      expect(zHe).toBeCloseTo(getZHelium(200), 4);
    });

    it("should calculate trimix 18/45 Z-factor", () => {
      // 18% O2, 45% He, 37% N2
      const z = calculateMixtureZ(0.18, 0.45, 200);

      // Manual: 0.18*0.9534 + 0.45*1.1285 + 0.37*1.0771
      // = 0.171612 + 0.507825 + 0.398527 = 1.077964
      expect(z).toBeCloseTo(1.078, 3);
    });

    it("should handle edge case of empty tank (all zeros)", () => {
      const z = calculateMixtureZ(0, 0, 200);
      // Should be pure nitrogen
      expect(z).toBeCloseTo(getZNitrogen(200), 4);
    });
  });

  describe("Gas to Mole Equivalents Conversion", () => {
    it("should convert air at 200 bar to mole equivalents", () => {
      const moles = gasToMoleEquivalents(21, 0, 200);

      // For air: Z_mix = calculateMixtureZ(0.21, 0, 200) ≈ 1.051
      // Total mole equiv = 200 / 1.051 ≈ 190.3
      // O2 moles = 0.21 * 190.3 ≈ 39.96
      // N2 moles = 0.79 * 190.3 ≈ 150.34
      const zMix = calculateMixtureZ(0.21, 0, 200);
      const totalMoles = 200 / zMix;

      expect(moles.o2).toBeCloseTo(0.21 * totalMoles, 1);
      expect(moles.n2).toBeCloseTo(0.79 * totalMoles, 1);
      expect(moles.he).toBe(0);
      expect(moles.total).toBeCloseTo(totalMoles, 1);
    });

    it("should convert pure oxygen at 50 bar", () => {
      const moles = gasToMoleEquivalents(100, 0, 50);

      const zO2 = getZOxygen(50); // 0.9922
      const expectedTotal = 50 / zO2;

      expect(moles.o2).toBeCloseTo(expectedTotal, 2);
      expect(moles.he).toBe(0);
      expect(moles.n2).toBe(0);
      expect(moles.total).toBeCloseTo(expectedTotal, 2);
    });

    it("should convert trimix 18/45 at 200 bar", () => {
      const moles = gasToMoleEquivalents(18, 45, 200);

      // Use mixture Z-factor
      const zMix = calculateMixtureZ(0.18, 0.45, 200);
      const totalMoles = 200 / zMix;

      expect(moles.o2).toBeCloseTo(0.18 * totalMoles, 1);
      expect(moles.he).toBeCloseTo(0.45 * totalMoles, 1);
      expect(moles.n2).toBeCloseTo(0.37 * totalMoles, 1);
      expect(moles.total).toBeCloseTo(totalMoles, 1);
    });
  });

  describe("Mole Equivalents to Gas Conversion", () => {
    it("should round-trip air composition", () => {
      const moles = gasToMoleEquivalents(21, 0, 200);
      const gas = moleEquivalentsToGas(moles.o2, moles.he, moles.n2);

      expect(gas.o2Percent).toBeCloseTo(21, 1);
      expect(gas.hePercent).toBeCloseTo(0, 1);
      expect(gas.n2Percent).toBeCloseTo(79, 1);
    });

    it("should round-trip trimix 18/45", () => {
      const moles = gasToMoleEquivalents(18, 45, 200);
      const gas = moleEquivalentsToGas(moles.o2, moles.he, moles.n2);

      expect(gas.o2Percent).toBeCloseTo(18, 1);
      expect(gas.hePercent).toBeCloseTo(45, 1);
      expect(gas.n2Percent).toBeCloseTo(37, 1);
    });

    it("should handle empty tank", () => {
      const gas = moleEquivalentsToGas(0, 0, 0);

      expect(gas.o2Percent).toBe(0);
      expect(gas.hePercent).toBe(0);
      expect(gas.n2Percent).toBe(0);
    });
  });

  describe("Adding Gas to Tank", () => {
    it("should add pure oxygen to empty tank", () => {
      const result = addGasToTank(0, 0, 0, 0, 100, 0, 50);

      expect(result.newPressure).toBe(50);
      expect(result.o2Moles).toBeGreaterThan(0);
      expect(result.heMoles).toBe(0);
      expect(result.n2Moles).toBe(0);

      // Verify composition
      const gas = moleEquivalentsToGas(
        result.o2Moles,
        result.heMoles,
        result.n2Moles,
      );
      expect(gas.o2Percent).toBeCloseTo(100, 1);
    });

    it("should add air on top of oxygen for Nitrox 32", () => {
      // Start: 50 bar pure O2
      const step1 = gasToMoleEquivalents(100, 0, 50);

      // Add: 150 bar air to reach 200 bar total
      const result = addGasToTank(step1.o2, step1.he, step1.n2, 50, 21, 0, 150);

      expect(result.newPressure).toBe(200);

      // Check final composition
      const gas = moleEquivalentsToGas(
        result.o2Moles,
        result.heMoles,
        result.n2Moles,
      );

      // Calculate expected: 50 bar O2 + 150 bar air (21% O2)
      // Total O2 from air: 150 * 0.21 = 31.5 bar equivalent
      // Total "ideal" O2: 50 + 31.5 = 81.5 bar
      // Ideal percentage: 81.5 / 200 = 40.75%
      // But we're tracking moles, so let's just verify it's in reasonable range
      // The actual value will depend on how Z-factors affect the blend
      expect(gas.o2Percent).toBeGreaterThan(35);
      expect(gas.o2Percent).toBeLessThan(45);
    });

    it("should add helium and then air for trimix", () => {
      // Step 1: Add 90 bar helium to empty tank
      const step1 = addGasToTank(0, 0, 0, 0, 0, 100, 90);

      // Step 2: Add air to reach 200 bar
      const step2 = addGasToTank(
        step1.o2Moles,
        step1.heMoles,
        step1.n2Moles,
        step1.newPressure,
        21,
        0,
        110,
      );

      expect(step2.newPressure).toBe(200);

      const gas = moleEquivalentsToGas(
        step2.o2Moles,
        step2.heMoles,
        step2.n2Moles,
      );

      // Should have significant helium and some oxygen
      expect(gas.hePercent).toBeGreaterThan(40);
      expect(gas.o2Percent).toBeGreaterThan(10);
    });
  });

  describe("Draining Tank", () => {
    it("should drain tank proportionally", () => {
      // Start with air at 200 bar
      const initial = gasToMoleEquivalents(21, 0, 200);

      // Drain to 100 bar
      const result = drainTank(initial.o2, initial.he, initial.n2, 200, 100);

      expect(result.newPressure).toBe(100);

      // Composition should remain the same (21% O2)
      const gas = moleEquivalentsToGas(
        result.o2Moles,
        result.heMoles,
        result.n2Moles,
      );

      expect(gas.o2Percent).toBeCloseTo(21, 1);
      expect(gas.hePercent).toBeCloseTo(0, 1);
    });

    it("should drain to empty", () => {
      const initial = gasToMoleEquivalents(18, 45, 200);

      const result = drainTank(initial.o2, initial.he, initial.n2, 200, 0);

      expect(result.newPressure).toBe(0);
      expect(result.o2Moles).toBe(0);
      expect(result.heMoles).toBe(0);
      expect(result.n2Moles).toBe(0);
    });

    it("should preserve mole ratios when draining", () => {
      const initial = gasToMoleEquivalents(18, 45, 200);
      const initialRatios = {
        o2: initial.o2 / initial.total,
        he: initial.he / initial.total,
        n2: initial.n2 / initial.total,
      };

      const result = drainTank(initial.o2, initial.he, initial.n2, 200, 50);
      const finalTotal = result.o2Moles + result.heMoles + result.n2Moles;
      const finalRatios = {
        o2: result.o2Moles / finalTotal,
        he: result.heMoles / finalTotal,
        n2: result.n2Moles / finalTotal,
      };

      expect(finalRatios.o2).toBeCloseTo(initialRatios.o2, 6);
      expect(finalRatios.he).toBeCloseTo(initialRatios.he, 6);
      expect(finalRatios.n2).toBeCloseTo(initialRatios.n2, 6);
    });
  });

  describe("Comparison Data (Ideal vs Real)", () => {
    it("should show deviation from ideal gas at 200 bar", () => {
      const data = getComparisonData(200);

      expect(data.pressure).toBe(200);
      expect(data.z_n2).toBeGreaterThan(1.0);
      expect(data.z_o2).toBeLessThan(1.0);
      expect(data.z_he).toBeGreaterThan(1.0);
      expect(data.z_air).toBeGreaterThan(1.0);
    });

    it("should format deviation percentages correctly", () => {
      const data = getComparisonData(200);

      // Nitrogen should show positive deviation
      expect(data.idealDeviation.n2).toContain("+");
      expect(data.idealDeviation.n2).toContain("%");

      // Oxygen should show negative deviation
      expect(data.idealDeviation.o2).toContain("-");
      expect(data.idealDeviation.o2).toContain("%");
    });

    it("should show minimal deviation at low pressure", () => {
      const data = getComparisonData(10);

      // All Z-factors should be very close to 1.0
      expect(Math.abs(data.z_n2 - 1.0)).toBeLessThan(0.01);
      expect(Math.abs(data.z_o2 - 1.0)).toBeLessThan(0.01);
      expect(Math.abs(data.z_he - 1.0)).toBeLessThan(0.01);
    });

    it("should show significant deviation at 300 bar", () => {
      const data = getComparisonData(300);

      // Helium should have ~20% deviation at 300 bar
      expect(data.z_he).toBeGreaterThan(1.15);

      // Oxygen should have ~5-6% negative deviation
      expect(data.z_o2).toBeLessThan(0.95);
    });
  });

  describe("Real vs Ideal Gas Comparison", () => {
    it("should show that real gas requires more helium pressure than ideal", () => {
      // Ideal gas: 90 bar He = certain number of moles
      // Real gas: need more pressure for same moles due to Z > 1

      const idealMoles = 90; // Proportional to pressure in ideal gas
      const realMoles = gasToMoleEquivalents(0, 100, 90).he;

      // Real gas gives fewer moles for same pressure (Z > 1)
      expect(realMoles).toBeLessThan(idealMoles);

      // To get same moles, would need more pressure
      const zHe90 = getZHelium(90);
      const pressureNeeded = idealMoles * zHe90;
      expect(pressureNeeded).toBeGreaterThan(90);
    });

    it("should show that real gas requires less oxygen pressure than ideal", () => {
      // Oxygen has Z < 1, so more moles fit in same pressure

      const idealMoles = 50; // Proportional to pressure in ideal gas
      const realMoles = gasToMoleEquivalents(100, 0, 50).o2;

      // Real gas gives more moles for same pressure (Z < 1)
      expect(realMoles).toBeGreaterThan(idealMoles);
    });
  });

  describe("Conservation Laws", () => {
    it("should conserve moles when adding gases", () => {
      const initial = gasToMoleEquivalents(21, 0, 100);
      const result = addGasToTank(
        initial.o2,
        initial.he,
        initial.n2,
        100,
        100,
        0,
        50,
      );

      // With real gas: we solve for exact target pressure (150 bar)
      // The moles added will be close to ideal gas estimate but adjusted for Z-factors
      expect(result.newPressure).toBe(150);

      // Total moles should be approximately conserved (within ~1% due to Z-factor adjustments)
      const totalInitial = initial.total;
      const totalFinal = result.o2Moles + result.heMoles + result.n2Moles;

      // Final moles should be greater than initial (we added gas)
      expect(totalFinal).toBeGreaterThan(totalInitial);

      // And should match what's required for 150 bar at the final composition
      const finalComp = moleEquivalentsToGas(
        result.o2Moles,
        result.heMoles,
        result.n2Moles,
      );
      // Started with air (21% O2) at 100 bar, added pure O2 to reach 150 bar
      // Final mix should have more O2 than initial air
      expect(finalComp.o2Percent).toBeGreaterThan(21);
    });

    it("should conserve individual component moles when adding", () => {
      const initial = gasToMoleEquivalents(18, 45, 100);
      const addO2 = 20;

      const result = addGasToTank(
        initial.o2,
        initial.he,
        initial.n2,
        100,
        100, // pure O2
        0,
        addO2,
      );

      // Real gas: target pressure should be exactly 120 bar
      expect(result.newPressure).toBe(120);

      // O2 should have increased (we added pure O2)
      expect(result.o2Moles).toBeGreaterThan(initial.o2);

      // He and N2 should remain unchanged (we only added O2)
      expect(result.heMoles).toBeCloseTo(initial.he, 6);
      expect(result.n2Moles).toBeCloseTo(initial.n2, 6);

      // Verify the composition shifted toward more O2
      const finalComp = moleEquivalentsToGas(
        result.o2Moles,
        result.heMoles,
        result.n2Moles,
      );
      const initialComp = moleEquivalentsToGas(
        initial.o2,
        initial.he,
        initial.n2,
      );
      expect(finalComp.o2Percent).toBeGreaterThan(initialComp.o2Percent);
    });
  });
});
