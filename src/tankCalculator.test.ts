import { describe, expect, it } from "vitest";
import {
  calculateTankMetric,
  calculateTankImperial,
  TankInput,
} from "./tankCalculator";

describe("Tank Calculator - Scuba Tank Calculations", () => {
  describe("Real-world Steel Tanks (Metric)", () => {
    it("should calculate buoyancy for standard 12L 232 bar steel tank (3kg empty weight)", () => {
      const input: TankInput = {
        liters: 12,
        bar: 232,
        kg: 14.5,
        cuft: 0,
        psi: 0,
        lbs: 0,
        isAluminium: false,
        isSaltWater: true,
        hasValve: true,
        isDoubles: false,
      };

      const result = calculateTankMetric(input);

      // Steel 12L should be approximately -1.5 to -2.5 kg negative when empty
      expect(result.emptyBuoyancyKg).toBeGreaterThan(-3);
      expect(result.emptyBuoyancyKg).toBeLessThan(-1);

      // When full, should be more negative due to air weight
      expect(result.fullBuoyancyKg).toBeLessThan(result.emptyBuoyancyKg);

      // Air in a 12L tank at 232 bar should weigh approximately 3.4 kg
      const airWeight = result.emptyBuoyancyKg - result.fullBuoyancyKg;
      expect(airWeight).toBeGreaterThan(3.0);
      expect(airWeight).toBeLessThan(3.8);
    });

    it("should calculate buoyancy for 15L 232 bar steel tank", () => {
      const input: TankInput = {
        liters: 15,
        bar: 232,
        kg: 16.8,
        cuft: 0,
        psi: 0,
        lbs: 0,
        isAluminium: false,
        isSaltWater: true,
        hasValve: true,
        isDoubles: false,
      };

      const result = calculateTankMetric(input);

      // 15L steel should be approximately neutral or slightly negative when empty
      expect(result.emptyBuoyancyKg).toBeGreaterThan(-1);
      expect(result.emptyBuoyancyKg).toBeLessThan(1);

      // Air weight should be approximately 4.3 kg
      const airWeight = result.emptyBuoyancyKg - result.fullBuoyancyKg;
      expect(airWeight).toBeGreaterThan(4.0);
      expect(airWeight).toBeLessThan(4.7);
    });

    it("should calculate buoyancy for twin 12L steel tanks with manifold", () => {
      const input: TankInput = {
        liters: 12,
        bar: 232,
        kg: 14.5,
        cuft: 0,
        psi: 0,
        lbs: 0,
        isAluminium: false,
        isSaltWater: true,
        hasValve: true,
        isDoubles: true,
      };

      const result = calculateTankMetric(input);

      // Doubles should have approximately 2x the buoyancy characteristics
      // Total tank weight should be doubled
      expect(result.kg).toBe(29);
      expect(result.liters).toBe(24);

      // Should be significantly negative when empty
      expect(result.emptyBuoyancyKg).toBeLessThan(-2);

      // Air weight should be approximately 2x single tank
      const airWeight = result.emptyBuoyancyKg - result.fullBuoyancyKg;
      expect(airWeight).toBeGreaterThan(6.5);
      expect(airWeight).toBeLessThan(7.5);
    });

    it("should calculate buoyancy for 10L 300 bar steel tank (high pressure)", () => {
      const input: TankInput = {
        liters: 10,
        bar: 300,
        kg: 14.2,
        cuft: 0,
        psi: 0,
        lbs: 0,
        isAluminium: false,
        isSaltWater: true,
        hasValve: true,
        isDoubles: false,
      };

      const result = calculateTankMetric(input);

      // High pressure 10L should have similar characteristics to 12L 232 bar
      expect(result.emptyBuoyancyKg).toBeLessThan(0);

      // Air weight at 300 bar should be approximately 3.7 kg
      const airWeight = result.emptyBuoyancyKg - result.fullBuoyancyKg;
      expect(airWeight).toBeGreaterThan(3.4);
      expect(airWeight).toBeLessThan(4.0);
    });
  });

  describe("Real-world Aluminum Tanks (Metric)", () => {
    it("should calculate buoyancy for 11L 207 bar aluminum tank", () => {
      const input: TankInput = {
        liters: 11,
        bar: 207,
        kg: 14.2,
        cuft: 0,
        psi: 0,
        lbs: 0,
        isAluminium: true,
        isSaltWater: true,
        hasValve: true,
        isDoubles: false,
      };

      const result = calculateTankMetric(input);

      // Aluminum tanks are typically slightly positive when empty
      expect(result.emptyBuoyancyKg).toBeGreaterThan(-0.5);
      expect(result.emptyBuoyancyKg).toBeLessThan(2.5);

      // When full, should be more negative
      expect(result.fullBuoyancyKg).toBeLessThan(result.emptyBuoyancyKg);

      // Air weight should be approximately 2.8 kg
      const airWeight = result.emptyBuoyancyKg - result.fullBuoyancyKg;
      expect(airWeight).toBeGreaterThan(2.5);
      expect(airWeight).toBeLessThan(3.1);
    });

    it("should calculate buoyancy for 13L 207 bar aluminum tank", () => {
      const input: TankInput = {
        liters: 13,
        bar: 207,
        kg: 16.5,
        cuft: 0,
        psi: 0,
        lbs: 0,
        isAluminium: true,
        isSaltWater: true,
        hasValve: true,
        isDoubles: false,
      };

      const result = calculateTankMetric(input);

      // Larger aluminum should be positive when empty
      expect(result.emptyBuoyancyKg).toBeGreaterThan(0.5);
      expect(result.emptyBuoyancyKg).toBeLessThan(3);

      // Air weight should be approximately 3.3 kg
      const airWeight = result.emptyBuoyancyKg - result.fullBuoyancyKg;
      expect(airWeight).toBeGreaterThan(3.0);
      expect(airWeight).toBeLessThan(3.6);
    });
  });

  describe("Real-world Imperial Tanks", () => {
    it("should calculate buoyancy for AL80 (Catalina)", () => {
      const input: TankInput = {
        liters: 0,
        bar: 0,
        kg: 0,
        cuft: 77.4, // Actual rated capacity
        psi: 3000,
        lbs: 31.4, // Actual weight without valve
        isAluminium: true,
        isSaltWater: true,
        hasValve: true,
        isDoubles: false,
      };

      const result = calculateTankImperial(input);

      // AL80 is famously positive when empty in salt water
      expect(result.emptyBuoyancyLbs).toBeGreaterThan(2);
      expect(result.emptyBuoyancyLbs).toBeLessThan(5);

      // When full, should be approximately -1.4 lbs
      expect(result.fullBuoyancyLbs).toBeLessThan(result.emptyBuoyancyLbs);
      expect(result.fullBuoyancyLbs).toBeGreaterThan(-3);
      expect(result.fullBuoyancyLbs).toBeLessThan(1);
    });

    it("should calculate buoyancy for HP100 steel tank", () => {
      const input: TankInput = {
        liters: 0,
        bar: 0,
        kg: 0,
        cuft: 100,
        psi: 3442,
        lbs: 33.2, // Typical HP100 weight without valve
        isAluminium: false,
        isSaltWater: true,
        hasValve: true,
        isDoubles: false,
      };

      const result = calculateTankImperial(input);

      // HP100 should be approximately -2 to -3 lbs when empty
      expect(result.emptyBuoyancyLbs).toBeLessThan(0);
      expect(result.emptyBuoyancyLbs).toBeGreaterThan(-4);

      // When full, should be even more negative
      expect(result.fullBuoyancyLbs).toBeLessThan(result.emptyBuoyancyLbs);

      // Air weight should be approximately 7.5 lbs
      const airWeight = result.emptyBuoyancyLbs - result.fullBuoyancyLbs;
      expect(airWeight).toBeGreaterThan(7.0);
      expect(airWeight).toBeLessThan(8.5);
    });

    it("should calculate buoyancy for HP120 steel tank", () => {
      const input: TankInput = {
        liters: 0,
        bar: 0,
        kg: 0,
        cuft: 120,
        psi: 3442,
        lbs: 38.9,
        isAluminium: false,
        isSaltWater: true,
        hasValve: true,
        isDoubles: false,
      };

      const result = calculateTankImperial(input);

      // HP120 should be approximately -1 to -2 lbs when empty
      expect(result.emptyBuoyancyLbs).toBeLessThan(0);
      expect(result.emptyBuoyancyLbs).toBeGreaterThan(-3);

      // Air weight should be approximately 9 lbs
      const airWeight = result.emptyBuoyancyLbs - result.fullBuoyancyLbs;
      expect(airWeight).toBeGreaterThan(8.5);
      expect(airWeight).toBeLessThan(10);
    });
  });

  describe("Fresh Water vs Salt Water", () => {
    it("should show more positive buoyancy in fresh water", () => {
      const baseInput: TankInput = {
        liters: 12,
        bar: 232,
        kg: 14.5,
        cuft: 0,
        psi: 0,
        lbs: 0,
        isAluminium: false,
        hasValve: true,
        isDoubles: false,
        isSaltWater: true,
      };

      const saltResult = calculateTankMetric(baseInput);
      const freshResult = calculateTankMetric({
        ...baseInput,
        isSaltWater: false,
      });

      // Fresh water provides less buoyancy, so tank should be more negative
      expect(freshResult.emptyBuoyancyKg).toBeLessThan(
        saltResult.emptyBuoyancyKg,
      );
      expect(freshResult.fullBuoyancyKg).toBeLessThan(
        saltResult.fullBuoyancyKg,
      );

      // Difference should be approximately 2.4% (salt water is 1.024 kg/L vs 1.0 kg/L)
      const difference =
        saltResult.emptyBuoyancyKg - freshResult.emptyBuoyancyKg;
      expect(difference).toBeGreaterThan(0.2);
      expect(difference).toBeLessThan(0.7);
    });
  });

  describe("Edge Cases and Validation", () => {
    it("should handle tanks without valves", () => {
      const input: TankInput = {
        liters: 12,
        bar: 232,
        kg: 14.5,
        cuft: 0,
        psi: 0,
        lbs: 0,
        isAluminium: false,
        isSaltWater: true,
        hasValve: false,
        isDoubles: false,
      };

      const result = calculateTankMetric(input);

      // Should still calculate, but buoyancy will be slightly different
      expect(result.emptyBuoyancyKg).toBeDefined();
      expect(result.fullBuoyancyKg).toBeDefined();
      expect(result.emptyBuoyancyKg).not.toBeNaN();
    });

    it("should handle very small pony bottles (3L)", () => {
      const input: TankInput = {
        liters: 3,
        bar: 232,
        kg: 3.2,
        cuft: 0,
        psi: 0,
        lbs: 0,
        isAluminium: false,
        isSaltWater: true,
        hasValve: true,
        isDoubles: false,
      };

      const result = calculateTankMetric(input);

      // Small tanks should still be slightly negative
      expect(result.emptyBuoyancyKg).toBeLessThan(0);

      // Air weight should be approximately 0.85 kg
      const airWeight = result.emptyBuoyancyKg - result.fullBuoyancyKg;
      expect(airWeight).toBeGreaterThan(0.7);
      expect(airWeight).toBeLessThan(1.0);
    });

    it("should handle large stage bottles (7L)", () => {
      const input: TankInput = {
        liters: 7,
        bar: 232,
        kg: 8.5,
        cuft: 0,
        psi: 0,
        lbs: 0,
        isAluminium: false,
        isSaltWater: true,
        hasValve: true,
        isDoubles: false,
      };

      const result = calculateTankMetric(input);

      // Should be negative when empty
      expect(result.emptyBuoyancyKg).toBeLessThan(0);

      // Air weight should be approximately 2.0 kg
      const airWeight = result.emptyBuoyancyKg - result.fullBuoyancyKg;
      expect(airWeight).toBeGreaterThan(1.8);
      expect(airWeight).toBeLessThan(2.3);
    });

    it("should handle low pressure (150 bar)", () => {
      const input: TankInput = {
        liters: 15,
        bar: 150,
        kg: 15.2,
        cuft: 0,
        psi: 0,
        lbs: 0,
        isAluminium: false,
        isSaltWater: true,
        hasValve: true,
        isDoubles: false,
      };

      const result = calculateTankMetric(input);

      // Air weight at lower pressure should be less
      const airWeight = result.emptyBuoyancyKg - result.fullBuoyancyKg;
      expect(airWeight).toBeGreaterThan(2.5);
      expect(airWeight).toBeLessThan(3.2);
    });
  });

  describe("Unit Conversions", () => {
    it("should correctly convert between metric and imperial", () => {
      const metricInput: TankInput = {
        liters: 12,
        bar: 232,
        kg: 14.5,
        cuft: 0,
        psi: 0,
        lbs: 0,
        isAluminium: false,
        isSaltWater: true,
        hasValve: true,
        isDoubles: false,
      };

      const result = calculateTankMetric(metricInput);

      // Check conversions are reasonable
      expect(result.psi).toBeGreaterThan(3300);
      expect(result.psi).toBeLessThan(3400);
      expect(result.lbs).toBeGreaterThan(31);
      expect(result.lbs).toBeLessThan(33);

      // Buoyancy conversions should match
      const convertedEmptyLbs = result.emptyBuoyancyKg * 2.20462;
      expect(
        Math.abs(result.emptyBuoyancyLbs - convertedEmptyLbs),
      ).toBeLessThan(0.2);
    });

    it("should maintain consistency between metric and imperial calculations", () => {
      // AL80: 11.1L at 207 bar, 31.4 lbs
      const metricInput: TankInput = {
        liters: 11.1,
        bar: 207,
        kg: 14.2,
        cuft: 0,
        psi: 0,
        lbs: 0,
        isAluminium: true,
        isSaltWater: true,
        hasValve: true,
        isDoubles: false,
      };

      const imperialInput: TankInput = {
        liters: 0,
        bar: 0,
        kg: 0,
        cuft: 77.4,
        psi: 3000,
        lbs: 31.4,
        isAluminium: true,
        isSaltWater: true,
        hasValve: true,
        isDoubles: false,
      };

      const metricResult = calculateTankMetric(metricInput);
      const imperialResult = calculateTankImperial(imperialInput);

      // Results should be reasonably close (within 10% due to rounding)
      const emptyDiff = Math.abs(
        metricResult.emptyBuoyancyKg - imperialResult.emptyBuoyancyKg,
      );
      expect(emptyDiff).toBeLessThan(0.5);

      const fullDiff = Math.abs(
        metricResult.fullBuoyancyKg - imperialResult.fullBuoyancyKg,
      );
      expect(fullDiff).toBeLessThan(0.5);
    });
  });

  describe("Material Density Validation", () => {
    it("should use correct steel density (7.85 kg/L for CrMo alloy)", () => {
      // Two identical tanks, but one is steel and one is aluminum
      // The aluminum should weigh less for same internal volume
      const steelInput: TankInput = {
        liters: 12,
        bar: 232,
        kg: 14.5,
        cuft: 0,
        psi: 0,
        lbs: 0,
        isAluminium: false,
        isSaltWater: true,
        hasValve: false,
        isDoubles: false,
      };

      const aluminumInput: TankInput = {
        liters: 12,
        bar: 232,
        kg: 14.5, // Same weight
        cuft: 0,
        psi: 0,
        lbs: 0,
        isAluminium: true,
        isSaltWater: true,
        hasValve: false,
        isDoubles: false,
      };

      const steelResult = calculateTankMetric(steelInput);
      const aluminumResult = calculateTankMetric(aluminumInput);

      // With same weight, aluminum tank displaces more water (less dense material)
      // So aluminum should be more positive
      expect(aluminumResult.emptyBuoyancyKg).toBeGreaterThan(
        steelResult.emptyBuoyancyKg,
      );

      // The difference should reflect density ratio (7.85/2.70 ≈ 2.9)
      const difference =
        aluminumResult.emptyBuoyancyKg - steelResult.emptyBuoyancyKg;
      expect(difference).toBeGreaterThan(3);
      expect(difference).toBeLessThan(6);
    });
  });

  describe("Calculation Text Output", () => {
    it("should generate detailed calculation steps", () => {
      const input: TankInput = {
        liters: 12,
        bar: 232,
        kg: 14.5,
        cuft: 0,
        psi: 0,
        lbs: 0,
        isAluminium: false,
        isSaltWater: true,
        hasValve: true,
        isDoubles: false,
      };

      const result = calculateTankMetric(input);

      // Check that calculation text contains key information
      expect(result.calculation).toContain("density");
      expect(result.calculation).toContain("7.85");
      expect(result.calculation).toContain("salt water");
      expect(result.calculation).toContain("buoyancy");
      expect(result.calculation).toContain("<b>");
    });
  });
});
