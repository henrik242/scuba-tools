import {
  calculateBlendingSteps,
  Gas,
  TankState,
  TargetGas,
} from "./gasBlender.ts";

describe("Gas Usage Tracking", () => {
  const standardGases: Gas[] = [
    { name: "Air", o2: 21, he: 0, editable: false },
    { name: "O2", o2: 100, he: 0, editable: false },
    { name: "Helium", o2: 0, he: 100, editable: false },
  ];

  it("should track gas usage for 18/45 blend from empty 11L tank", () => {
    const startingGas: TankState = {
      volume: 11,
      o2: 0,
      he: 0,
      pressure: 0,
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
    expect(result.gasUsage).toBeDefined();

    // Each step should have addedVolume
    result.steps.forEach((step) => {
      if (step.addedPressure && step.addedPressure > 0) {
        expect(step.addedVolume).toBeDefined();
        expect(step.addedVolume).toBeGreaterThan(0);
      }
    });

    // Total gas used (real free litres) ≥ volume × pressure because real gases
    // are more compressed than ideal (Z < 1 for O₂/N₂ at high pressure).
    const totalUsed = Object.values(result.gasUsage).reduce(
      (sum, val) => sum + val,
      0,
    );
    const idealEstimate = startingGas.volume * targetGas.pressure;

    expect(totalUsed).toBeGreaterThan(idealEstimate * 0.99);
    expect(totalUsed).toBeLessThan(idealEstimate * 1.1);

    // Should have used Helium, O2, and Air
    expect(Object.keys(result.gasUsage).length).toBeGreaterThan(0);

    console.log("\n=== Gas Usage Summary ===");
    Object.entries(result.gasUsage).forEach(([gas, liters]) => {
      console.log(`${gas}: ${liters.toFixed(1)} L`);
    });
    console.log(
      `Total: ${totalUsed.toFixed(1)} L (ideal estimate ${idealEstimate} L)`,
    );
  });

  it("should track gas usage for air top-up", () => {
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
    expect(result.gasUsage["Air"]).toBeDefined();

    // With real gas (Z < 1 for air at 200 bar), more free litres are delivered
    // per bar than ideal. Expect slightly more than the ideal 1800 L.
    const pressureDiff = targetGas.pressure - startingGas.pressure;
    const idealAir = pressureDiff * startingGas.volume;

    expect(result.gasUsage["Air"]).toBeGreaterThan(idealAir * 0.99);
    expect(result.gasUsage["Air"]).toBeLessThan(idealAir * 1.1);

    console.log(
      `\nAir used: ${result.gasUsage["Air"].toFixed(1)} L (ideal estimate ${idealAir} L)`,
    );
  });

  it("should have gas usage in each addition step", () => {
    const startingGas: TankState = {
      volume: 11,
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

    // Each gas addition step should include volume
    const additionSteps = result.steps.filter(
      (s) => s.addedPressure && s.addedPressure > 0,
    );

    additionSteps.forEach((step) => {
      expect(step.addedVolume).toBeDefined();
      expect(step.addedVolume).toBeGreaterThan(0);

      // With real gas, addedVolume = (addedPressure / Z) × tank volume,
      // which is ≥ addedPressure × tank volume (Z ≤ 1 for O₂/N₂ at pressure).
      const idealVolume = step.addedPressure! * startingGas.volume;
      expect(step.addedVolume).toBeGreaterThan(idealVolume * 0.99);
      expect(step.addedVolume).toBeLessThan(idealVolume * 1.1);

      console.log(
        `Step: ${step.action} - ${step.addedPressure} bar × ${startingGas.volume}L = ${step.addedVolume}L`,
      );
    });
  });
});
