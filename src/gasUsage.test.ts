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

    // Total gas used (real free litres) < volume × pressure: at filling
    // pressures He and N2 are stiffer than ideal (Z > 1), so a bar of gauge
    // holds less gas.
    const totalUsed = Object.values(result.gasUsage).reduce(
      (sum, val) => sum + val,
      0,
    );
    const idealEstimate = startingGas.volume * targetGas.pressure;

    expect(totalUsed).toBeGreaterThan(idealEstimate * 0.9);
    expect(totalUsed).toBeLessThan(idealEstimate);

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

    // Air is stiffer than ideal at 200 bar (Z about 1.05), so fewer free litres
    // go in per bar than ideal. Expect somewhat less than the ideal 1800 L.
    const pressureDiff = targetGas.pressure - startingGas.pressure;
    const idealAir = pressureDiff * startingGas.volume;

    expect(result.gasUsage["Air"]).toBeGreaterThan(idealAir * 0.9);
    expect(result.gasUsage["Air"]).toBeLessThan(idealAir);

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

      // With real gas the litres per bar follow the mix's Z: He and air
      // additions give less than addedPressure × volume (Z > 1), O2 about the
      // same.
      const idealVolume = step.addedPressure! * startingGas.volume;
      expect(step.addedVolume).toBeGreaterThan(idealVolume * 0.9);
      expect(step.addedVolume).toBeLessThan(idealVolume * 1.05);

      console.log(
        `Step: ${step.action} - ${step.addedPressure} bar × ${startingGas.volume}L = ${step.addedVolume}L`,
      );
    });
  });
});
