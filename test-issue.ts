import { calculateBlendingSteps, Gas, TankState, TargetGas } from "./src/gasBlender";

// Reproduce the reported issue
// Starting: 50 bar with 19/37 mix
// Target: 220 bar with 18/40 mix  
// Available gases: Air, O2, Helium

const startingGas: TankState = {
  volume: 11,
  o2: 19,
  he: 37,
  pressure: 50
};

const targetGas: TargetGas = {
  o2: 18,
  he: 40,
  pressure: 220
};

// First test WITHOUT Nitrox 32
const gasesWithoutNitrox: Gas[] = [
  { name: "Air", o2: 21, he: 0, editable: false },
  { name: "O2", o2: 100, he: 0, editable: false },
  { name: "Helium", o2: 0, he: 100, editable: false }
];

console.log("\n=== WITHOUT Nitrox 32 ===");
const resultWithout = calculateBlendingSteps(startingGas, targetGas, gasesWithoutNitrox);
console.log("Success:", resultWithout.success);
console.log("Final mix:", resultWithout.finalMix);
console.log("Error:", resultWithout.error);
console.log("Steps:", resultWithout.steps.length);
resultWithout.steps.forEach((step, i) => {
  console.log(`  ${i+1}. ${step.action} - ${step.currentMix} → ${step.newMix}`);
});

// Now test WITH Nitrox 32 (the problematic case)
const gasesWithNitrox: Gas[] = [
  { name: "Air", o2: 21, he: 0, editable: false },
  { name: "O2", o2: 100, he: 0, editable: false },
  { name: "Helium", o2: 0, he: 100, editable: false },
  { name: "Nitrox 32", o2: 32, he: 0, editable: true }
];

console.log("\n=== WITH Nitrox 32 (Reported Issue) ===");
const resultWith = calculateBlendingSteps(startingGas, targetGas, gasesWithNitrox);
console.log("Success:", resultWith.success);
console.log("Final mix:", resultWith.finalMix);
console.log("Error:", resultWith.error);
console.log("Steps:", resultWith.steps.length);
resultWith.steps.forEach((step, i) => {
  console.log(`  ${i+1}. ${step.action} - ${step.currentMix} → ${step.newMix}`);
});
