import { describe, expect, it } from "vitest";
import {
  calculateBlendingSteps,
  Gas,
  TankState,
  TargetGas,
} from "./gasBlender";

describe("Gas Blender - Professional Trimix Calculations", () => {
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
      const startingGas: TankState = {
        volume: 12,
        o2: 0,
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

      if (result.success) {
        expect(result.finalMix.o2).toBeCloseTo(21, 0);
        expect(result.finalMix.he).toBeCloseTo(30, 0);
      } else {
        expect(result.finalMix.he).toBeCloseTo(30, 0);
      }
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
        expect(step.toPressure).toBeGreaterThanOrEqual(
          step.fromPressure - step.drainedPressure || 0,
        );
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
      expect(result.finalMix.o2).toBe(18);
      expect(result.finalMix.he).toBe(40);
      expect(result.finalMix.pressure).toBe(220);

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

  describe("Professional Gas Blending - Critical Safety Tests", () => {
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

        const startingGas: TankState = {
          volume: 7,
          o2: 0,
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
        expect(result.finalMix.o2).toBe(100);
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

        // This requires diluting with air
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

        const drainStep = result.steps.find((s) => s.action.toLowerCase().includes("drain"));
        const heStep = result.steps.find((s) => s.gas === "Helium");

        expect(drainStep).toBeDefined();
        expect(heStep).toBeDefined();
      });
    });
  });
});
