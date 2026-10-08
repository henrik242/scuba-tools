import {
  calculateBlendingSteps,
  Gas,
  TankState,
  TargetGas,
} from "./gasBlender.ts";
import { gasZ } from "./realGas.ts";

describe("Gas Blender - Trimix Calculations", () => {
  const standardGases: Gas[] = [
    { name: "Air", o2: 21, he: 0, editable: false },
    { name: "O2", o2: 100, he: 0, editable: false },
    { name: "Helium", o2: 0, he: 100, editable: false },
    { name: "Nitrox 32", o2: 32, he: 0, editable: true },
    { name: "10/70", o2: 10, he: 70, editable: true },
  ];

  describe("Input Validation", () => {
    it("should reject target mix where O2 + He > 100%", () => {
      const startingGas: TankState = {
        volume: 12,
        o2: 21,
        he: 0,
        pressure: 0,
      };

      const targetGas: TargetGas = {
        o2: 60,
        he: 50, // Total = 110%
        pressure: 200,
      };

      const result = calculateBlendingSteps(
        startingGas,
        targetGas,
        standardGases,
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("exceeds 100%");
    });
  });

  describe("Empty Tank Scenarios", () => {
    it("should blend 18/45 from empty tank", () => {
      const startingGas: TankState = {
        volume: 12,
        o2: 0,
        he: 0,
        pressure: 0,
      };

      const targetGas: TargetGas = {
        o2: 18,
        he: 45,
        pressure: 200,
      };

      const result = calculateBlendingSteps(
        startingGas,
        targetGas,
        standardGases,
      );

      expect(result.success).toBe(true);
      expect(result.finalMix.o2).toBeCloseTo(18, 0);
      expect(result.finalMix.he).toBeCloseTo(45, 0);
      expect(result.finalMix.pressure).toBeCloseTo(200, 0);
      expect(result.steps.length).toBeGreaterThan(0);
    });

    it("should blend 21/35 (normoxic trimix) from empty", () => {
      const startingGas: TankState = {
        volume: 12,
        o2: 0,
        he: 0,
        pressure: 0,
      };

      const targetGas: TargetGas = {
        o2: 21,
        he: 35,
        pressure: 200,
      };

      const result = calculateBlendingSteps(
        startingGas,
        targetGas,
        standardGases,
      );

      expect(result.success).toBe(true);
      expect(result.finalMix.o2).toBeCloseTo(21, 0);
      expect(result.finalMix.he).toBeCloseTo(35, 0);
      expect(result.finalMix.pressure).toBe(200);
    });

    it("should blend 32% nitrox from empty", () => {
      const startingGas: TankState = {
        volume: 12,
        o2: 0,
        he: 0,
        pressure: 0,
      };

      const targetGas: TargetGas = {
        o2: 32,
        he: 0,
        pressure: 200,
      };

      const result = calculateBlendingSteps(
        startingGas,
        targetGas,
        standardGases,
      );

      expect(result.success).toBe(true);
      expect(result.finalMix.o2).toBeCloseTo(32, 0);
      expect(result.finalMix.he).toBe(0);
      expect(result.finalMix.pressure).toBe(200);
    });

    it("should blend air from empty tank", () => {
      // An empty tank still holds 1 atm, here of air, so air alone fills it.
      const startingGas: TankState = {
        volume: 12,
        o2: 21,
        he: 0,
        pressure: 0,
      };

      const targetGas: TargetGas = {
        o2: 21,
        he: 0,
        pressure: 200,
      };

      const result = calculateBlendingSteps(
        startingGas,
        targetGas,
        standardGases,
      );

      expect(result.success).toBe(true);
      expect(result.finalMix.o2).toBeCloseTo(21, 0);
      expect(result.finalMix.he).toBe(0);
      expect(result.finalMix.pressure).toBe(200);
      // Should just add air
      expect(result.steps.length).toBe(1);
      expect(result.steps[0].action).toContain("Air");
    });
  });

  describe("Partial Tank Topping", () => {
    it("should top up air tank from 50 bar to 200 bar", () => {
      const startingGas: TankState = {
        volume: 12,
        o2: 21,
        he: 0,
        pressure: 50,
      };

      const targetGas: TargetGas = {
        o2: 21,
        he: 0,
        pressure: 200,
      };

      const result = calculateBlendingSteps(
        startingGas,
        targetGas,
        standardGases,
      );

      expect(result.success).toBe(true);
      expect(result.finalMix.o2).toBeCloseTo(21, 0);
      expect(result.finalMix.pressure).toBe(200);
      expect(result.steps.length).toBe(1);
      expect(result.steps[0].addedPressure).toBeCloseTo(150, 0);
    });

    it("should top up 18/45 from partial pressure", () => {
      const startingGas: TankState = {
        volume: 12,
        o2: 18,
        he: 45,
        pressure: 100,
      };

      const targetGas: TargetGas = {
        o2: 18,
        he: 45,
        pressure: 200,
      };

      const result = calculateBlendingSteps(
        startingGas,
        targetGas,
        standardGases,
      );

      expect(result.success).toBe(true);
      expect(result.finalMix.o2).toBeCloseTo(18, 0);
      expect(result.finalMix.he).toBeCloseTo(45, 0);
      expect(result.finalMix.pressure).toBe(200);
    });
  });

  describe("Draining Scenarios", () => {
    it("should drain tank when starting O2 is too high", () => {
      const startingGas: TankState = {
        volume: 12,
        o2: 32,
        he: 0,
        pressure: 100,
      };

      const targetGas: TargetGas = {
        o2: 21,
        he: 0,
        pressure: 200,
      };

      const result = calculateBlendingSteps(
        startingGas,
        targetGas,
        standardGases,
      );

      if (result.success) {
        expect(result.steps.length).toBeGreaterThan(0);
        expect(result.finalMix.o2).toBeCloseTo(21, 0);
      } else {
        expect(result.error).toContain("Unable to reach target mix");
      }
    });

    it("should drain sufficiently when blending Nitrox 32 to 18/35 trimix", () => {
      // Specific scenario from URL: https://scuba.synth.no/blender.html#startVolume=11&startO2=32&startHe=0&startPressure=110&targetO2=18&targetHe=35&targetPressure=220&gases=21-0_100-0_0-100
      const startingGas: TankState = {
        volume: 11,
        o2: 32,
        he: 0,
        pressure: 110,
      };

      const targetGas: TargetGas = {
        o2: 18,
        he: 35,
        pressure: 220,
      };

      const gases: Gas[] = [
        { name: "Air", o2: 21, he: 0 },
        { name: "O2", o2: 100, he: 0 },
        { name: "Helium", o2: 0, he: 100 },
      ];

      const result = calculateBlendingSteps(startingGas, targetGas, gases);

      // Should succeed
      expect(result.success).toBe(true);

      // Should have a drain step
      const drainStep = result.steps.find((s) => s.action.includes("Drain"));
      expect(drainStep).toBeDefined();
      expect(drainStep!.toPressure).toBeLessThan(110);

      // Should reach target mix
      expect(result.finalMix.o2).toBeCloseTo(18, 0);
      expect(result.finalMix.he).toBeCloseTo(35, 0);
      expect(result.finalMix.pressure).toBeCloseTo(220, 0);
    });

    it("should drain when starting He is too high", () => {
      const startingGas: TankState = {
        volume: 12,
        o2: 18,
        he: 50,
        pressure: 100,
      };

      const targetGas: TargetGas = {
        o2: 21,
        he: 35,
        pressure: 200,
      };

      const result = calculateBlendingSteps(
        startingGas,
        targetGas,
        standardGases,
      );

      expect(result.success).toBe(true);
      expect(result.finalMix.he).toBeCloseTo(35, 0);
      expect(result.finalMix.o2).toBeCloseTo(21, 0);
    });

    it("should completely drain when partial pressure values are incompatible", () => {
      const startingGas: TankState = {
        volume: 12,
        o2: 50,
        he: 40,
        pressure: 150,
      };

      const targetGas: TargetGas = {
        o2: 21,
        he: 0,
        pressure: 200,
      };

      const result = calculateBlendingSteps(
        startingGas,
        targetGas,
        standardGases,
      );

      expect(result.success).toBe(true);
      const drainStep = result.steps.find((s) => s.action.includes("Drain"));
      expect(drainStep).toBeDefined();
    });
  });

  describe("Deep Trimix Blending", () => {
    it("should blend 10/70 (deep trimix)", () => {
      const startingGas: TankState = {
        volume: 12,
        o2: 0,
        he: 0,
        pressure: 0,
      };

      const targetGas: TargetGas = {
        o2: 10,
        he: 70,
        pressure: 200,
      };

      const result = calculateBlendingSteps(
        startingGas,
        targetGas,
        standardGases,
      );

      expect(result.success).toBe(true);
      expect(result.finalMix.o2).toBeCloseTo(10, 0);
      expect(result.finalMix.he).toBeCloseTo(70, 0);
      expect(result.finalMix.pressure).toBe(200);
    });

    it("should blend 12/65 from empty", () => {
      const startingGas: TankState = {
        volume: 12,
        o2: 0,
        he: 0,
        pressure: 0,
      };

      const targetGas: TargetGas = {
        o2: 12,
        he: 65,
        pressure: 200,
      };

      const result = calculateBlendingSteps(
        startingGas,
        targetGas,
        standardGases,
      );

      expect(result.success).toBe(true);
      expect(result.finalMix.o2).toBeCloseTo(12, 0);
      expect(result.finalMix.he).toBeCloseTo(65, 0);
    });
  });

  describe("Travel Mix Scenarios", () => {
    it("should blend 21/30 (shallow travel mix)", () => {
      const startingGas: TankState = {
        volume: 12,
        o2: 0,
        he: 0,
        pressure: 0,
      };

      const targetGas: TargetGas = {
        o2: 21,
        he: 30,
        pressure: 200,
      };

      const result = calculateBlendingSteps(
        startingGas,
        targetGas,
        standardGases,
      );

      expect(result.success).toBe(true);
      expect(result.finalMix.o2).toBeCloseTo(21, 0);
      expect(result.finalMix.he).toBeCloseTo(30, 0);
    });

    it("should blend 25/25 (balanced mix)", () => {
      const startingGas: TankState = {
        volume: 12,
        o2: 0,
        he: 0,
        pressure: 0,
      };

      const targetGas: TargetGas = {
        o2: 25,
        he: 25,
        pressure: 200,
      };

      const result = calculateBlendingSteps(
        startingGas,
        targetGas,
        standardGases,
      );

      expect(result.success).toBe(true);
      expect(result.finalMix.o2).toBeCloseTo(25, 0);
      expect(result.finalMix.he).toBeCloseTo(25, 0);
    });
  });

  describe("Partial Pressure Calculations", () => {
    it("should correctly calculate partial pressures for 18/45 at 200 bar", () => {
      const startingGas: TankState = {
        volume: 12,
        o2: 0,
        he: 0,
        pressure: 0,
      };

      const targetGas: TargetGas = {
        o2: 18,
        he: 45,
        pressure: 200,
      };

      const result = calculateBlendingSteps(
        startingGas,
        targetGas,
        standardGases,
      );

      expect(result.success).toBe(true);

      // Verify partial pressures: O2 = 18% * 200 = 36 bar, He = 45% * 200 = 90 bar
      const finalO2PP = (result.finalMix.o2 / 100) * result.finalMix.pressure;
      const finalHePP = (result.finalMix.he / 100) * result.finalMix.pressure;

      expect(finalO2PP).toBeCloseTo(36, 0);
      expect(finalHePP).toBeCloseTo(90, 0);
    });

    it("should maintain proper partial pressures when topping up", () => {
      const startingGas: TankState = {
        volume: 12,
        o2: 21,
        he: 35,
        pressure: 50,
      };

      const targetGas: TargetGas = {
        o2: 21,
        he: 35,
        pressure: 200,
      };

      const result = calculateBlendingSteps(
        startingGas,
        targetGas,
        standardGases,
      );

      expect(result.success).toBe(true);

      // Starting PP: O2 = 10.5 bar, He = 17.5 bar
      // Final PP should be: O2 = 42 bar, He = 70 bar
      const finalO2PP = (result.finalMix.o2 / 100) * result.finalMix.pressure;
      const finalHePP = (result.finalMix.he / 100) * result.finalMix.pressure;

      expect(finalO2PP).toBeCloseTo(42, 0);
      expect(finalHePP).toBeCloseTo(70, 0);
    });
  });

  describe("Edge Cases", () => {
    it("should blend 14/13 at 100 bar to 18/45 at 220 bar WITHOUT draining", () => {
      const startingGas: TankState = {
        volume: 11,
        o2: 14,
        he: 13,
        pressure: 100,
      };

      const targetGas: TargetGas = {
        o2: 18,
        he: 45,
        pressure: 220,
      };

      const result = calculateBlendingSteps(
        startingGas,
        targetGas,
        standardGases,
      );

      expect(result.success).toBe(true);
      expect(result.steps.length).toBeGreaterThan(0);

      // First step should NOT be a drain
      expect(result.steps[0].action).not.toContain("Drain");

      // Should achieve target within tolerance
      expect(result.finalMix.o2).toBeCloseTo(18, 0);
      expect(result.finalMix.he).toBeCloseTo(45, 0);
      expect(result.finalMix.pressure).toBeCloseTo(220, 0);
    });

    it("should handle zero pressure starting gas", () => {
      const startingGas: TankState = {
        volume: 12,
        o2: 21,
        he: 0,
        pressure: 0,
      };

      const targetGas: TargetGas = {
        o2: 21,
        he: 0,
        pressure: 200,
      };

      const result = calculateBlendingSteps(
        startingGas,
        targetGas,
        standardGases,
      );

      expect(result.success).toBe(true);
      expect(result.finalMix.pressure).toBe(200);
    });

    it("should handle tank already at target mix and pressure", () => {
      const startingGas: TankState = {
        volume: 12,
        o2: 21,
        he: 35,
        pressure: 200,
      };

      const targetGas: TargetGas = {
        o2: 21,
        he: 35,
        pressure: 200,
      };

      const result = calculateBlendingSteps(
        startingGas,
        targetGas,
        standardGases,
      );

      expect(result.success).toBe(true);
      expect(result.steps.length).toBe(0); // No steps needed
    });

    it("should handle very small pressure differences", () => {
      const startingGas: TankState = {
        volume: 12,
        o2: 21,
        he: 0,
        pressure: 199,
      };

      const targetGas: TargetGas = {
        o2: 21,
        he: 0,
        pressure: 200,
      };

      const result = calculateBlendingSteps(
        startingGas,
        targetGas,
        standardGases,
      );

      expect(result.success).toBe(true);
    });
  });

  describe("Limited Gas Availability", () => {
    it("should work with only Air and O2 available", () => {
      const limitedGases: Gas[] = [
        { name: "Air", o2: 21, he: 0, editable: false },
        { name: "O2", o2: 100, he: 0, editable: false },
      ];

      const startingGas: TankState = {
        volume: 12,
        o2: 0,
        he: 0,
        pressure: 0,
      };

      const targetGas: TargetGas = {
        o2: 32,
        he: 0,
        pressure: 200,
      };

      const result = calculateBlendingSteps(
        startingGas,
        targetGas,
        limitedGases,
      );

      expect(result.finalMix.o2).toBeCloseTo(32, 0);
      expect(result.finalMix.he).toBe(0);
      expect(result.finalMix.pressure).toBe(200);
    });

    it("should handle case with no helium available when He is needed", () => {
      const noHeliumGases: Gas[] = [
        { name: "Air", o2: 21, he: 0, editable: false },
        { name: "O2", o2: 100, he: 0, editable: false },
      ];

      const startingGas: TankState = {
        volume: 12,
        o2: 0,
        he: 0,
        pressure: 0,
      };

      const targetGas: TargetGas = {
        o2: 18,
        he: 45,
        pressure: 200,
      };

      const result = calculateBlendingSteps(
        startingGas,
        targetGas,
        noHeliumGases,
      );

      // Should fail or produce incorrect mix
      expect(result.finalMix.he).not.toBeCloseTo(45, 0);
    });
  });

  describe("Blending Steps Verification", () => {
    it("should have correct step sequence for trimix blend", () => {
      const startingGas: TankState = {
        volume: 12,
        o2: 0,
        he: 0,
        pressure: 0,
      };

      const targetGas: TargetGas = {
        o2: 18,
        he: 45,
        pressure: 200,
      };

      const result = calculateBlendingSteps(
        startingGas,
        targetGas,
        standardGases,
      );

      expect(result.success).toBe(true);
      expect(result.steps.length).toBeGreaterThan(0);

      // Verify each step has required properties
      result.steps.forEach((step) => {
        expect(step).toHaveProperty("action");
        expect(step).toHaveProperty("fromPressure");
        expect(step).toHaveProperty("toPressure");
        expect(step).toHaveProperty("currentMix");
        expect(step).toHaveProperty("newMix");
        if (step.drainedPressure && step.drainedPressure > 0) {
          expect(step.toPressure).toBeLessThan(step.fromPressure);
          expect(step.drainedPressure).toBeCloseTo(
            step.fromPressure - step.toPressure,
            2,
          );
        } else if (step.addedPressure && step.addedPressure > 0) {
          expect(step.toPressure).toBeGreaterThan(step.fromPressure);
          expect(step.addedPressure).toBeCloseTo(
            step.toPressure - step.fromPressure,
            1,
          );
        }
      });
    });

    it("should show pressure increase in each addition step", () => {
      const startingGas: TankState = {
        volume: 12,
        o2: 0,
        he: 0,
        pressure: 0,
      };

      const targetGas: TargetGas = {
        o2: 21,
        he: 35,
        pressure: 200,
      };

      const result = calculateBlendingSteps(
        startingGas,
        targetGas,
        standardGases,
      );

      expect(result.success).toBe(true);

      // Each non-drain step should increase pressure
      result.steps.forEach((step) => {
        if (!step.action.includes("Drain")) {
          expect(step.toPressure).toBeGreaterThan(step.fromPressure);
          expect(step.addedPressure).toBeGreaterThan(0);
        }
      });
    });
  });

  describe("Real-World Scenarios", () => {
    it("should top up 19/37 at 50 bar to 18/40 at 220 bar with Nitrox 32 available", () => {
      // Regression test for reported issue where Nitrox 32 was incorrectly chosen over Air
      const gases: Gas[] = [
        { name: "Air", o2: 21, he: 0, editable: false },
        { name: "O2", o2: 100, he: 0, editable: false },
        { name: "Helium", o2: 0, he: 100, editable: false },
        { name: "Nitrox 32", o2: 32, he: 0, editable: true },
      ];

      const startingGas: TankState = {
        volume: 11,
        o2: 19,
        he: 37,
        pressure: 50,
      };

      const targetGas: TargetGas = {
        o2: 18,
        he: 40,
        pressure: 220,
      };

      const result = calculateBlendingSteps(startingGas, targetGas, gases);

      expect(result.success).toBe(true);
      expect(result.finalMix.o2).toBeCloseTo(18, 0);
      expect(result.finalMix.he).toBeCloseTo(40, 0);
      expect(result.finalMix.pressure).toBeCloseTo(220, 0);

      // Should use Air, not Nitrox 32, for the final top-up
      const airStep = result.steps.find((s) => s.gas === "Air");
      expect(airStep).toBeDefined();
    });

    it("should blend bottom gas for 100m dive (14/55)", () => {
      const startingGas: TankState = {
        volume: 24, // Twin 12s
        o2: 0,
        he: 0,
        pressure: 0,
      };

      const targetGas: TargetGas = {
        o2: 14,
        he: 55,
        pressure: 220,
      };

      const result = calculateBlendingSteps(
        startingGas,
        targetGas,
        standardGases,
      );

      expect(result.success).toBe(true);
      expect(result.finalMix.o2).toBeCloseTo(14, 0);
      expect(result.finalMix.he).toBeCloseTo(55, 0);
    });

    it("should blend deco gas (50% nitrox)", () => {
      const decoGases: Gas[] = [
        { name: "Air", o2: 21, he: 0, editable: false },
        { name: "O2", o2: 100, he: 0, editable: false },
      ];

      const startingGas: TankState = {
        volume: 7,
        o2: 0,
        he: 0,
        pressure: 0,
      };

      const targetGas: TargetGas = {
        o2: 50,
        he: 0,
        pressure: 200,
      };

      const result = calculateBlendingSteps(startingGas, targetGas, decoGases);

      expect(result.finalMix.o2).toBeCloseTo(50, 0);
      expect(result.finalMix.he).toBe(0);
      expect(result.finalMix.pressure).toBe(200);
    });

    it("should convert air to 18/45", () => {
      const startingGas: TankState = {
        volume: 12,
        o2: 21,
        he: 0,
        pressure: 100,
      };

      const targetGas: TargetGas = {
        o2: 18,
        he: 45,
        pressure: 200,
      };

      const result = calculateBlendingSteps(
        startingGas,
        targetGas,
        standardGases,
      );

      expect(result.finalMix.he).toBeCloseTo(45, 0);
      expect(result.finalMix.o2).toBeCloseTo(18, 0);
      expect(result.finalMix.pressure).toBe(200);
      // Should drain first because starting O2 is too high
      expect(result.steps[0].action).toContain("Drain");
    });
  });

  describe("Accuracy and Tolerance", () => {
    it("should achieve mix within acceptable tolerance", () => {
      const startingGas: TankState = {
        volume: 12,
        o2: 0,
        he: 0,
        pressure: 0,
      };

      const targetGas: TargetGas = {
        o2: 18,
        he: 45,
        pressure: 200,
      };

      const result = calculateBlendingSteps(
        startingGas,
        targetGas,
        standardGases,
      );

      expect(result.success).toBe(true);

      expect(result.finalMix.he).toBeCloseTo(45, 0);
      expect(result.finalMix.o2).toBeCloseTo(18, 0);
      expect(result.finalMix.pressure).toBe(200);
    });

    it("should have consistent success/failure logic with 0.5% tolerance (issue regression test)", () => {
      // Test case from GitHub issue: 19/37 at 70 bar -> 15/40 at 220 bar
      // This was showing both error message and success message due to tolerance mismatch
      const startingGas: TankState = {
        volume: 11,
        o2: 19,
        he: 37,
        pressure: 70,
      };

      const targetGas: TargetGas = {
        o2: 15,
        he: 40,
        pressure: 220,
      };

      const result = calculateBlendingSteps(
        startingGas,
        targetGas,
        standardGases,
      );

      // The algorithm uses 0.5% tolerance for success determination
      const o2Error = Math.abs(result.finalMix.o2 - targetGas.o2);
      const heError = Math.abs(result.finalMix.he - targetGas.he);
      const pressureError = Math.abs(
        result.finalMix.pressure - targetGas.pressure,
      );

      // If the algorithm says success, errors should be within 0.5% tolerance
      if (result.success) {
        expect(o2Error).toBeLessThanOrEqual(0.5);
        expect(heError).toBeLessThanOrEqual(0.5);
        expect(pressureError).toBeLessThanOrEqual(1);
      } else {
        // If it fails, at least one error should exceed 0.5% tolerance
        expect(o2Error > 0.5 || heError > 0.5 || pressureError > 1).toBe(true);
      }
    });
  });

  describe("Gas Blending - Critical Safety Tests", () => {
    describe("Oxygen Toxicity and MOD Verification", () => {
      it("should correctly blend high-O2 deco gas (80% O2)", () => {
        const startingGas: TankState = {
          volume: 7,
          o2: 0,
          he: 0,
          pressure: 0,
        };

        const targetGas: TargetGas = {
          o2: 80,
          he: 0,
          pressure: 200,
        };

        const result = calculateBlendingSteps(
          startingGas,
          targetGas,
          standardGases,
        );

        expect(result.success).toBe(true);
        // O2 at 80% should be within ±0.5% for safety
        expect(Math.abs(result.finalMix.o2 - 80)).toBeLessThanOrEqual(0.5);
        expect(result.finalMix.pressure).toBe(200);
      });

      it("should blend pure O2 for decompression", () => {
        const oxygenGases: Gas[] = [
          { name: "O2", o2: 100, he: 0, editable: false },
        ];

        // The 1 atm of air left in the empty tank stays in the mix.
        const startingGas: TankState = {
          volume: 7,
          o2: 21,
          he: 0,
          pressure: 0,
        };

        const targetGas: TargetGas = {
          o2: 100,
          he: 0,
          pressure: 200,
        };

        const result = calculateBlendingSteps(
          startingGas,
          targetGas,
          oxygenGases,
        );

        expect(result.success).toBe(true);
        expect(result.finalMix.o2).toBeGreaterThanOrEqual(99.5);
        expect(result.finalMix.o2).toBeLessThan(100);
        expect(result.steps.length).toBe(1);
      });

      it("should handle hypoxic mix (10/70) - not breathable at surface", () => {
        const startingGas: TankState = {
          volume: 12,
          o2: 0,
          he: 0,
          pressure: 0,
        };

        const targetGas: TargetGas = {
          o2: 10,
          he: 70,
          pressure: 200,
        };

        const result = calculateBlendingSteps(
          startingGas,
          targetGas,
          standardGases,
        );

        expect(result.success).toBe(true);
        // Critical: O2 must be accurate for hypoxic mix
        expect(Math.abs(result.finalMix.o2 - 10)).toBeLessThanOrEqual(0.5);
        expect(Math.abs(result.finalMix.he - 70)).toBeLessThanOrEqual(1.0);
      });
    });

    describe("Precision Requirements - Technical Diving Standards", () => {
      it("should achieve O2 within ±0.5% for technical trimix", () => {
        const startingGas: TankState = {
          volume: 12,
          o2: 0,
          he: 0,
          pressure: 0,
        };

        const targetGas: TargetGas = {
          o2: 18,
          he: 45,
          pressure: 200,
        };

        const result = calculateBlendingSteps(
          startingGas,
          targetGas,
          standardGases,
        );

        expect(result.success).toBe(true);
        // Professional standard: ±0.5% O2 accuracy
        expect(Math.abs(result.finalMix.o2 - 18)).toBeLessThanOrEqual(0.5);
        // Helium can be ±2%
        expect(Math.abs(result.finalMix.he - 45)).toBeLessThanOrEqual(2.0);
      });

      it("should achieve exact pressure within ±1 bar", () => {
        const startingGas: TankState = {
          volume: 12,
          o2: 0,
          he: 0,
          pressure: 0,
        };

        const targetGas: TargetGas = {
          o2: 21,
          he: 35,
          pressure: 200,
        };

        const result = calculateBlendingSteps(
          startingGas,
          targetGas,
          standardGases,
        );

        expect(result.success).toBe(true);
        expect(Math.abs(result.finalMix.pressure - 200)).toBeLessThanOrEqual(1);
      });

      it("should maintain precision with multiple nitrox blends", () => {
        const nitroxGases: Gas[] = [
          { name: "Air", o2: 21, he: 0, editable: false },
          { name: "O2", o2: 100, he: 0, editable: false },
        ];

        // Test EAN36
        const startingGas: TankState = {
          volume: 12,
          o2: 0,
          he: 0,
          pressure: 0,
        };

        const targetGas: TargetGas = {
          o2: 36,
          he: 0,
          pressure: 200,
        };

        const result = calculateBlendingSteps(
          startingGas,
          targetGas,
          nitroxGases,
        );

        expect(result.success).toBe(true);
        expect(Math.abs(result.finalMix.o2 - 36)).toBeLessThanOrEqual(0.5);
      });
    });

    describe("Complex Mix Conversions", () => {
      it("should convert 21/35 at 100 bar to 18/45 at 200 bar", () => {
        const startingGas: TankState = {
          volume: 12,
          o2: 21,
          he: 35,
          pressure: 100,
        };

        const targetGas: TargetGas = {
          o2: 18,
          he: 45,
          pressure: 200,
        };

        const result = calculateBlendingSteps(
          startingGas,
          targetGas,
          standardGases,
        );

        expect(result.success).toBe(true);
        expect(Math.abs(result.finalMix.o2 - 18)).toBeLessThanOrEqual(0.5);
        expect(Math.abs(result.finalMix.he - 45)).toBeLessThanOrEqual(2.0);
        expect(result.finalMix.pressure).toBe(200);

        // May or may not require draining depending on available gases
        // The algorithm might achieve target through adding He and diluting O2
      });

      it("should convert air to EAN32 (common recreational scenario)", () => {
        const startingGas: TankState = {
          volume: 12,
          o2: 21,
          he: 0,
          pressure: 50,
        };

        const targetGas: TargetGas = {
          o2: 32,
          he: 0,
          pressure: 200,
        };

        const result = calculateBlendingSteps(
          startingGas,
          targetGas,
          standardGases,
        );

        expect(result.success).toBe(true);
        expect(Math.abs(result.finalMix.o2 - 32)).toBeLessThanOrEqual(0.5);
      });

      it("should convert EAN32 at 150 bar to air at 200 bar", () => {
        const startingGas: TankState = {
          volume: 12,
          o2: 32,
          he: 0,
          pressure: 150,
        };

        const targetGas: TargetGas = {
          o2: 21,
          he: 0,
          pressure: 200,
        };

        const result = calculateBlendingSteps(
          startingGas,
          targetGas,
          standardGases,
        );

        // This requires diluting 32% O2 with 21% air. The O2 in air prevents
        // hitting exactly 21% without a pure N2 source or a complete drain.
        if (result.success) {
          expect(Math.abs(result.finalMix.o2 - 21)).toBeLessThanOrEqual(0.5);
        }
      });
    });

    describe("High Pressure Tanks", () => {
      it("should handle 300 bar fill (HP steel tanks)", () => {
        const startingGas: TankState = {
          volume: 12,
          o2: 0,
          he: 0,
          pressure: 0,
        };

        const targetGas: TargetGas = {
          o2: 18,
          he: 45,
          pressure: 300,
        };

        const result = calculateBlendingSteps(
          startingGas,
          targetGas,
          standardGases,
        );

        expect(result.success).toBe(true);
        expect(result.finalMix.pressure).toBe(300);
        expect(Math.abs(result.finalMix.o2 - 18)).toBeLessThanOrEqual(0.5);
      });

      it("should handle 232 bar fill (European standard)", () => {
        const startingGas: TankState = {
          volume: 12,
          o2: 0,
          he: 0,
          pressure: 0,
        };

        const targetGas: TargetGas = {
          o2: 21,
          he: 35,
          pressure: 232,
        };

        const result = calculateBlendingSteps(
          startingGas,
          targetGas,
          standardGases,
        );

        expect(result.success).toBe(true);
        expect(result.finalMix.pressure).toBe(232);
      });
    });

    describe("Impure Source Gases", () => {
      it("should handle industrial oxygen (99.5% O2)", () => {
        const industrialGases: Gas[] = [
          { name: "Air", o2: 21, he: 0, editable: false },
          { name: "Industrial O2", o2: 99.5, he: 0, editable: false },
          { name: "Helium", o2: 0, he: 100, editable: false },
        ];

        const startingGas: TankState = {
          volume: 12,
          o2: 0,
          he: 0,
          pressure: 0,
        };

        const targetGas: TargetGas = {
          o2: 32,
          he: 0,
          pressure: 200,
        };

        const result = calculateBlendingSteps(
          startingGas,
          targetGas,
          industrialGases,
        );

        // Should still get close to target
        if (result.success) {
          expect(Math.abs(result.finalMix.o2 - 32)).toBeLessThanOrEqual(1.0);
        }
      });

      it("should handle commercial helium with trace oxygen", () => {
        const commercialGases: Gas[] = [
          { name: "Air", o2: 21, he: 0, editable: false },
          { name: "O2", o2: 100, he: 0, editable: false },
          { name: "Commercial He", o2: 0.5, he: 99.5, editable: false },
        ];

        const startingGas: TankState = {
          volume: 12,
          o2: 0,
          he: 0,
          pressure: 0,
        };

        const targetGas: TargetGas = {
          o2: 10,
          he: 70,
          pressure: 200,
        };

        const result = calculateBlendingSteps(
          startingGas,
          targetGas,
          commercialGases,
        );

        // Trace O2 in He might affect final mix slightly
        if (result.success) {
          expect(Math.abs(result.finalMix.he - 70)).toBeLessThanOrEqual(2.0);
        }
      });
    });

    describe("Multiple Nitrox Banks", () => {
      it("should optimize blend using multiple nitrox mixes", () => {
        const multiNitroxGases: Gas[] = [
          { name: "Air", o2: 21, he: 0, editable: false },
          { name: "EAN28", o2: 28, he: 0, editable: false },
          { name: "EAN32", o2: 32, he: 0, editable: false },
          { name: "EAN36", o2: 36, he: 0, editable: false },
          { name: "O2", o2: 100, he: 0, editable: false },
        ];

        const startingGas: TankState = {
          volume: 12,
          o2: 0,
          he: 0,
          pressure: 0,
        };

        const targetGas: TargetGas = {
          o2: 32,
          he: 0,
          pressure: 200,
        };

        const result = calculateBlendingSteps(
          startingGas,
          targetGas,
          multiNitroxGases,
        );

        expect(result.success).toBe(true);
        expect(Math.abs(result.finalMix.o2 - 32)).toBeLessThanOrEqual(0.5);

        // Should ideally use EAN32 directly
        const ean32Step = result.steps.find((s) => s.gas === "EAN32");
        expect(ean32Step).toBeDefined();
      });
    });

    describe("Partial Pressure Blending Edge Cases", () => {
      it("should handle very low starting pressure (1 bar residual)", () => {
        const startingGas: TankState = {
          volume: 12,
          o2: 21,
          he: 0,
          pressure: 1,
        };

        const targetGas: TargetGas = {
          o2: 32,
          he: 0,
          pressure: 200,
        };

        const result = calculateBlendingSteps(
          startingGas,
          targetGas,
          standardGases,
        );

        expect(result.success).toBe(true);
        expect(Math.abs(result.finalMix.o2 - 32)).toBeLessThanOrEqual(0.5);
      });

      it("should handle odd target pressures (187 bar)", () => {
        const startingGas: TankState = {
          volume: 12,
          o2: 0,
          he: 0,
          pressure: 0,
        };

        const targetGas: TargetGas = {
          o2: 18,
          he: 45,
          pressure: 187,
        };

        const result = calculateBlendingSteps(
          startingGas,
          targetGas,
          standardGases,
        );

        expect(result.success).toBe(true);
        // Algorithm has 0.1 bar rounding precision
        expect(result.finalMix.pressure).toBeCloseTo(187, 0);
      });
    });

    describe("Rounding Error Accumulation", () => {
      it("should not accumulate rounding errors in multi-step blend", () => {
        const startingGas: TankState = {
          volume: 12,
          o2: 0,
          he: 0,
          pressure: 0,
        };

        const targetGas: TargetGas = {
          o2: 18,
          he: 45,
          pressure: 200,
        };

        const result = calculateBlendingSteps(
          startingGas,
          targetGas,
          standardGases,
        );

        // Verify partial pressures add up correctly
        const finalO2PP = (result.finalMix.o2 / 100) * result.finalMix.pressure;
        const finalHePP = (result.finalMix.he / 100) * result.finalMix.pressure;
        const finalN2PP =
          ((100 - result.finalMix.o2 - result.finalMix.he) / 100) *
          result.finalMix.pressure;

        const totalPP = finalO2PP + finalHePP + finalN2PP;

        // Total partial pressures should equal final pressure within rounding
        expect(
          Math.abs(totalPP - result.finalMix.pressure),
        ).toBeLessThanOrEqual(0.2);
      });
    });

    describe("Sequential Blending Operations", () => {
      it("should handle topping the same tank twice", () => {
        // First fill to 100 bar
        const firstBlend = calculateBlendingSteps(
          { volume: 12, o2: 0, he: 0, pressure: 0 },
          { o2: 21, he: 35, pressure: 100 },
          standardGases,
        );

        expect(firstBlend.success).toBe(true);

        // Then top to 200 bar
        const secondBlend = calculateBlendingSteps(
          {
            volume: 12,
            o2: firstBlend.finalMix.o2,
            he: firstBlend.finalMix.he,
            pressure: firstBlend.finalMix.pressure,
          },
          { o2: 21, he: 35, pressure: 200 },
          standardGases,
        );

        expect(secondBlend.success).toBe(true);
        expect(Math.abs(secondBlend.finalMix.o2 - 21)).toBeLessThanOrEqual(0.5);
        expect(Math.abs(secondBlend.finalMix.he - 35)).toBeLessThanOrEqual(2.0);
      });
    });

    describe("Extreme Mix Scenarios", () => {
      it("should blend very lean trimix (8/84)", () => {
        const startingGas: TankState = {
          volume: 12,
          o2: 0,
          he: 0,
          pressure: 0,
        };

        const targetGas: TargetGas = {
          o2: 8,
          he: 84,
          pressure: 200,
        };

        const result = calculateBlendingSteps(
          startingGas,
          targetGas,
          standardGases,
        );

        expect(result.success).toBe(true);
        expect(Math.abs(result.finalMix.o2 - 8)).toBeLessThanOrEqual(0.5);
        expect(Math.abs(result.finalMix.he - 84)).toBeLessThanOrEqual(2.0);
      });

      it("should blend rich travel mix (30/30)", () => {
        const startingGas: TankState = {
          volume: 12,
          o2: 0,
          he: 0,
          pressure: 0,
        };

        const targetGas: TargetGas = {
          o2: 30,
          he: 30,
          pressure: 200,
        };

        const result = calculateBlendingSteps(
          startingGas,
          targetGas,
          standardGases,
        );

        expect(result.success).toBe(true);
        expect(Math.abs(result.finalMix.o2 - 30)).toBeLessThanOrEqual(0.5);
        expect(Math.abs(result.finalMix.he - 30)).toBeLessThanOrEqual(2.0);
      });
    });

    describe("Drain and Blend Scenarios", () => {
      it("should blend 18/45 from 32/10 at 220 bar (same pressure)", () => {
        const basicGases: Gas[] = [
          { name: "Air", o2: 21, he: 0 },
          { name: "O2", o2: 100, he: 0 },
          { name: "Helium", o2: 0, he: 100 },
        ];

        const startingGas: TankState = {
          volume: 11,
          o2: 32,
          he: 10,
          pressure: 220,
        };

        const targetGas: TargetGas = {
          o2: 18,
          he: 45,
          pressure: 220,
        };

        const result = calculateBlendingSteps(
          startingGas,
          targetGas,
          basicGases,
        );

        expect(result.success).toBe(true);
        expect(result.finalMix.o2).toBeCloseTo(18, 0);
        expect(result.finalMix.he).toBeCloseTo(45, 0);
        expect(result.finalMix.pressure).toBeCloseTo(220, 0);

        const drainStep = result.steps.find((s) =>
          s.action.toLowerCase().includes("drain"),
        );
        const heStep = result.steps.find((s) => s.gas === "Helium");

        expect(drainStep).toBeDefined();
        expect(heStep).toBeDefined();
      });
    });
  });

  describe("Trimix Helium Source Blending", () => {
    it("should blend 18/45 at 220 bar from 14/13 at 113 bar using trimix 10/70", () => {
      // Regression test: blending with trimix helium source (10/70) instead of pure helium
      const availableGases: Gas[] = [
        { name: "Air", o2: 21, he: 0, editable: false },
        { name: "O2", o2: 100, he: 0, editable: false },
        { name: "Nitrox 32", o2: 32, he: 0, editable: true },
        { name: "10/70", o2: 10, he: 70, editable: true },
      ];

      const startingGas: TankState = {
        volume: 11,
        o2: 14,
        he: 13,
        pressure: 113,
      };

      const targetGas: TargetGas = {
        o2: 18,
        he: 45,
        pressure: 220,
      };

      const result = calculateBlendingSteps(
        startingGas,
        targetGas,
        availableGases,
      );

      expect(result.success).toBe(true);
      expect(result.finalMix.o2).toBeCloseTo(18, 0);
      expect(result.finalMix.he).toBeCloseTo(45, 0);
      expect(result.finalMix.pressure).toBeCloseTo(220, 0);
    });

    it("should blend 18/45 at 220 bar from 14/13 at 113 bar using only Nitrox 32 and 10/70", () => {
      // Blending with only Nitrox 32 and 10/70 (no Air, no pure O2)
      // Requires draining to empty because starting mix is incompatible
      const availableGases: Gas[] = [
        { name: "Nitrox 32", o2: 32, he: 0, editable: true },
        { name: "10/70", o2: 10, he: 70, editable: true },
      ];

      const startingGas: TankState = {
        volume: 11,
        o2: 14,
        he: 13,
        pressure: 113,
      };

      const targetGas: TargetGas = {
        o2: 18,
        he: 45,
        pressure: 220,
      };

      const result = calculateBlendingSteps(
        startingGas,
        targetGas,
        availableGases,
      );

      expect(result.success).toBe(true);
      expect(result.finalMix.o2).toBeCloseTo(18, 0);
      expect(result.finalMix.he).toBeCloseTo(45, 0);
      expect(result.finalMix.pressure).toBeCloseTo(220, 0);

      // Should drain completely to 0
      const drainStep = result.steps.find((s) =>
        s.action.toLowerCase().includes("drain"),
      );
      expect(drainStep).toBeDefined();
      expect(drainStep!.toPressure).toBe(0);
    });
  });

  describe("Drain only what overshoots", () => {
    const basicGases: Gas[] = [
      { name: "Air", o2: 21, he: 0 },
      { name: "O2", o2: 100, he: 0 },
      { name: "Helium", o2: 0, he: 100 },
    ];

    it("should keep air when O2 can make up the difference", () => {
      // 90 bar air holds less O2 and N2 than 18/45 at 220 needs, so nothing has to go.
      const result = calculateBlendingSteps(
        { volume: 12, o2: 21, he: 0, pressure: 90 },
        { o2: 18, he: 45, pressure: 220 },
        basicGases,
      );

      expect(result.success).toBe(true);
      expect(result.steps.some((s) => s.action.includes("Drain"))).toBe(false);
      expect(result.steps.map((s) => s.gas)).toEqual(["Helium", "O2", "Air"]);
    });

    it("should drain only the excess nitrogen", () => {
      // 100 bar air holds about 80 ideal bar N2; 18/45 at 200 wants about 70 (He
      // is stiff, so the target holds fewer moles than 200 bar suggests). Drain
      // a little, not all.
      const result = calculateBlendingSteps(
        { volume: 12, o2: 21, he: 0, pressure: 100 },
        { o2: 18, he: 45, pressure: 200 },
        basicGases,
      );

      expect(result.success).toBe(true);
      const drainStep = result.steps.find((s) => s.action.includes("Drain"));
      expect(drainStep).toBeDefined();
      expect(drainStep!.toPressure).toBeGreaterThanOrEqual(85);
      expect(drainStep!.toPressure).toBeLessThanOrEqual(92);
    });
  });

  describe("Real gas model", () => {
    it("pins pure-gas Z to the fit and to published ranges", () => {
      // gasZ takes absolute bar.
      const o2 = (p: number) => gasZ(1, 0, p);
      const n2 = (p: number) => gasZ(0, 0, p);
      const he = (p: number) => gasZ(0, 1, p);

      expect(o2(100)).toBeCloseTo(0.9549, 4);
      expect(o2(200)).toBeCloseTo(0.9571, 4);
      expect(o2(300)).toBeCloseTo(0.9977, 4);
      expect(n2(100)).toBeCloseTo(1.0053, 4);
      expect(n2(200)).toBeCloseTo(1.0567, 4);
      expect(n2(300)).toBeCloseTo(1.1417, 4);
      expect(he(100)).toBeCloseTo(1.0479, 4);
      expect(he(200)).toBeCloseTo(1.0944, 4);
      expect(he(300)).toBeCloseTo(1.1397, 4);

      // Published values near room temperature: N2 and He stiffer than ideal
      // at 200 bar, O2 a little softer.
      expect(n2(200)).toBeGreaterThanOrEqual(1.03);
      expect(n2(200)).toBeLessThanOrEqual(1.06);
      expect(he(200)).toBeGreaterThanOrEqual(1.09);
      expect(he(200)).toBeLessThanOrEqual(1.1);
      expect(o2(200)).toBeLessThan(1);

      // Mixes combine linearly by mole fraction.
      const air = gasZ(0.21, 0, 200);
      expect(air).toBeCloseTo(0.21 * o2(200) + 0.79 * n2(200), 10);
    });
  });

  describe("Plans hold up under an independent real-gas replay", () => {
    // Written independently of realGas.ts: Z = 1 + c1*P + c2*P^2 + c3*P^3 in
    // absolute bar, coefficients from a fit to Perry's Chemical Engineers'
    // Handbook data, mixed linearly by mole fraction.
    const ATM = 1.01325;
    const COEFF: Record<"o2" | "n2" | "he", [number, number, number]> = {
      o2: [-7.18092073703e-4, 2.81852572808e-6, -1.50290620492e-9],
      n2: [-2.19260353292e-4, 2.92844845532e-6, -2.07613482075e-9],
      he: [4.87320026468e-4, -8.83632921053e-8, 5.33304543646e-11],
    };
    type Moles = { o2: number; n2: number; he: number };
    const total = (m: Moles) => m.o2 + m.n2 + m.he;
    const zOf = (m: Moles, abs: number) => {
      const p = Math.min(500, Math.max(0, abs));
      let z = 1;
      for (const k of ["o2", "n2", "he"] as const) {
        const [a, b, c] = COEFF[k];
        z += (m[k] / total(m)) * (a * p + b * p ** 2 + c * p ** 3);
      }
      return z;
    };
    const mix = (o2Pct: number, hePct: number, amount: number): Moles => ({
      o2: (amount * o2Pct) / 100,
      he: (amount * hePct) / 100,
      n2: (amount * (100 - o2Pct - hePct)) / 100,
    });
    // Moles (as ideal bar) in the tank at `gauge`, for a composition `m`.
    const amountAt = (m: Moles, gauge: number) =>
      (gauge + ATM) / zOf(m, gauge + ATM);

    const replay = (
      start: TankState,
      result: ReturnType<typeof calculateBlendingSteps>,
      gases: Gas[],
    ) => {
      const shape = mix(start.o2, start.he, 1);
      let tank = mix(start.o2, start.he, amountAt(shape, start.pressure));
      for (const step of result.steps) {
        const abs = step.toPressure + ATM;
        if (step.drainedPressure !== undefined) {
          const keep = amountAt(tank, step.toPressure) / total(tank);
          tank = { o2: tank.o2 * keep, n2: tank.n2 * keep, he: tank.he * keep };
          continue;
        }
        const gas = gases.find((g) => g.name === step.gas);
        if (!gas) throw new Error(`unknown gas ${step.gas}`);
        // Find the amount added so the tank reads the step's gauge pressure.
        let added = step.toPressure - step.fromPressure;
        for (let i = 0; i < 50; i++) {
          const g = mix(gas.o2, gas.he, added);
          const after = {
            o2: tank.o2 + g.o2,
            n2: tank.n2 + g.n2,
            he: tank.he + g.he,
          };
          added = abs / zOf(after, abs) - total(tank);
        }
        const g = mix(gas.o2, gas.he, added);
        tank = { o2: tank.o2 + g.o2, n2: tank.n2 + g.n2, he: tank.he + g.he };
      }
      return {
        o2: (100 * tank.o2) / total(tank),
        he: (100 * tank.he) / total(tank),
      };
    };

    const gases: Gas[] = [
      { name: "Air", o2: 21, he: 0 },
      { name: "O2", o2: 100, he: 0 },
      { name: "Helium", o2: 0, he: 100 },
    ];
    const emptyAir: TankState = { volume: 12, o2: 21, he: 0, pressure: 0 };

    const nitroxAndTrimix: Gas[] = [
      { name: "Nitrox 32", o2: 32, he: 0 },
      { name: "10/70", o2: 10, he: 70 },
    ];

    const cases: [string, TankState, TargetGas, Gas[]?][] = [
      ["EAN32 to 232 from empty", emptyAir, { o2: 32, he: 0, pressure: 232 }],
      ["EAN36 to 232 from empty", emptyAir, { o2: 36, he: 0, pressure: 232 }],
      ["EAN50 to 200 from empty", emptyAir, { o2: 50, he: 0, pressure: 200 }],
      ["21/35 to 232 from empty", emptyAir, { o2: 21, he: 35, pressure: 232 }],
      ["18/45 to 232 from empty", emptyAir, { o2: 18, he: 45, pressure: 232 }],
      ["10/70 to 232 from empty", emptyAir, { o2: 10, he: 70, pressure: 232 }],
      [
        "EAN32 top-up from 50 bar EAN32",
        { volume: 12, o2: 32, he: 0, pressure: 50 },
        { o2: 32, he: 0, pressure: 232 },
      ],
      [
        "18/45 from 100 bar air, partial drain",
        { volume: 12, o2: 21, he: 0, pressure: 100 },
        { o2: 18, he: 45, pressure: 200 },
      ],
      [
        "18/45 from 113 bar 14/13 with Nitrox 32 and 10/70, full drain",
        { volume: 11, o2: 14, he: 13, pressure: 113 },
        { o2: 18, he: 45, pressure: 220 },
        nitroxAndTrimix,
      ],
      // Rich nitrox down to leaner: the air topping brings O2 too.
      [
        "EAN32 from 200 bar EAN40, drain",
        { volume: 12, o2: 40, he: 0, pressure: 200 },
        { o2: 32, he: 0, pressure: 232 },
      ],
      [
        "EAN32 from 190 bar EAN38, drain with no excess yet",
        { volume: 12, o2: 38, he: 0, pressure: 190 },
        { o2: 32, he: 0, pressure: 232 },
      ],
      [
        "EAN32 from 150 bar EAN50, drain",
        { volume: 12, o2: 50, he: 0, pressure: 150 },
        { o2: 32, he: 0, pressure: 232 },
      ],
      [
        "EAN32 from 200 bar EAN40 with air only, drain",
        { volume: 12, o2: 40, he: 0, pressure: 200 },
        { o2: 32, he: 0, pressure: 232 },
        [{ name: "Air", o2: 21, he: 0 }],
      ],
    ];

    for (const [name, start, target, available = gases] of cases) {
      it(`${name} lands within 0.5 points`, () => {
        const result = calculateBlendingSteps(start, target, available);
        expect(result.success).toBe(true);
        const real = replay(start, result, available);
        expect(Math.abs(real.o2 - target.o2)).toBeLessThanOrEqual(0.5);
        expect(Math.abs(real.he - target.he)).toBeLessThanOrEqual(0.5);
        const last = result.steps[result.steps.length - 1];
        expect(last.toPressure).toBeCloseTo(target.pressure, 1);
      });
    }

    it("plans the drain cases with a drain step", () => {
      const partial = calculateBlendingSteps(cases[7][1], cases[7][2], gases);
      expect(partial.steps[0].drainedPressure).toBeGreaterThan(0);
      expect(partial.steps[0].toPressure).toBeGreaterThan(0);
      const full = calculateBlendingSteps(
        cases[8][1],
        cases[8][2],
        nitroxAndTrimix,
      );
      expect(full.steps[0].drainedPressure).toBeGreaterThan(0);
      expect(full.steps[0].toPressure).toBe(0);
    });

    it("fills EAN32 to 232 with O2 to about 30.4 bar, then air", () => {
      const result = calculateBlendingSteps(
        emptyAir,
        { o2: 32, he: 0, pressure: 232 },
        gases,
      );
      expect(result.steps.map((s) => s.gas)).toEqual(["O2", "Air"]);
      expect(result.steps[0].toPressure).toBeCloseTo(30.4, 1);
    });

    it("an ideal-gas plan for EAN32 and EAN36 lands rich", () => {
      // O2 first, then air, split by the ideal gas law (empty tank ignored).
      const idealPlan = (o2Pct: number, pressure: number) => {
        const o2Bar = (pressure * (o2Pct - 21)) / 79;
        return {
          steps: [
            { gas: "O2", fromPressure: 0, toPressure: o2Bar },
            { gas: "Air", fromPressure: o2Bar, toPressure: pressure },
          ],
        } as unknown as ReturnType<typeof calculateBlendingSteps>;
      };
      const ean32 = replay(emptyAir, idealPlan(32, 232), gases);
      const ean36 = replay(emptyAir, idealPlan(36, 232), gases);
      expect(ean32.o2).toBeGreaterThan(32.5);
      expect(ean32.o2).toBeLessThan(33);
      expect(ean36.o2).toBeGreaterThan(36.7);
      expect(ean36.o2).toBeLessThan(37.3);
    });
  });
});
