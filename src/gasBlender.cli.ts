#!/usr/bin/env node
/**
 * CLI for Gas Blender
 * Can be used for debugging and standalone calculations
 *
 * Usage:
 *   npm run blend -- --start-o2 21 --start-he 0 --start-pressure 0 --start-volume 12 \
 *                    --target-o2 32 --target-he 0 --target-pressure 200
 *
 *   npm run blend -- --start 21/0@0 --volume 12 --target 32/0@200
 *
 *   npm run blend -- --preset nitrox32
 *
 *   npm run blend -- --help
 */

import {
  calculateBlendingSteps,
  type TankState,
  type TargetGas,
  type Gas,
} from "./gasBlender.js";

// Standard gas presets (matches UI defaults)
const STANDARD_GASES: Gas[] = [
  { name: "Air", o2: 21, he: 0 },
  { name: "O₂", o2: 100, he: 0 },
  { name: "He", o2: 0, he: 100 },
];

// Blend presets
const BLEND_PRESETS: Record<
  string,
  { start: string; target: string; volume: number }
> = {
  nitrox32: {
    start: "21/0@0",
    target: "32/0@200",
    volume: 12,
  },
  trimix3030: {
    start: "21/0@0",
    target: "30/30@200",
    volume: 24,
  },
  trimix1845: {
    start: "21/0@0",
    target: "18/45@200",
    volume: 24,
  },
  trimix2135: {
    start: "21/0@0",
    target: "21/35@200",
    volume: 24,
  },
  trimix1555: {
    start: "21/0@0",
    target: "15/55@200",
    volume: 24,
  },
};

interface CliOptions {
  startO2?: number;
  startHe?: number;
  startPressure?: number;
  startVolume?: number;
  targetO2?: number;
  targetHe?: number;
  targetPressure?: number;
  gases?: Gas[];
  preset?: string;
  verbose?: boolean;
  json?: boolean;
}

function parseGasString(
  str: string,
): { o2: number; he: number; pressure: number } | null {
  // Format: "o2/he@pressure" e.g., "21/0@50" or "32/25@200"
  const match = str.match(/^(\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)@(\d+(?:\.\d+)?)$/);
  if (!match) return null;

  return {
    o2: parseFloat(match[1]),
    he: parseFloat(match[2]),
    pressure: parseFloat(match[3]),
  };
}

function parseGasMix(str: string): { o2: number; he: number } | null {
  // Format: "o2/he" e.g., "21/0" or "32/25"
  const match = str.match(/^(\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)$/);
  if (!match) return null;

  return {
    o2: parseFloat(match[1]),
    he: parseFloat(match[2]),
  };
}

function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {
    gases: [...STANDARD_GASES],
  };

  let customGases: Gas[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const next = args[i + 1];

    switch (arg) {
      case "--start":
      case "-s":
        if (next) {
          const parsed = parseGasString(next);
          if (parsed) {
            options.startO2 = parsed.o2;
            options.startHe = parsed.he;
            options.startPressure = parsed.pressure;
            i++;
          }
        }
        break;

      case "--target":
      case "-t":
        if (next) {
          const parsed = parseGasString(next);
          if (parsed) {
            options.targetO2 = parsed.o2;
            options.targetHe = parsed.he;
            options.targetPressure = parsed.pressure;
            i++;
          }
        }
        break;

      case "--volume":
      case "-v":
        if (next) {
          options.startVolume = parseFloat(next);
          i++;
        }
        break;

      case "--start-o2":
        if (next) {
          options.startO2 = parseFloat(next);
          i++;
        }
        break;

      case "--start-he":
        if (next) {
          options.startHe = parseFloat(next);
          i++;
        }
        break;

      case "--start-pressure":
        if (next) {
          options.startPressure = parseFloat(next);
          i++;
        }
        break;

      case "--target-o2":
        if (next) {
          options.targetO2 = parseFloat(next);
          i++;
        }
        break;

      case "--target-he":
        if (next) {
          options.targetHe = parseFloat(next);
          i++;
        }
        break;

      case "--target-pressure":
        if (next) {
          options.targetPressure = parseFloat(next);
          i++;
        }
        break;

      case "--gas":
      case "-g":
        if (next) {
          const parsed = parseGasMix(next);
          if (parsed) {
            const gasName = `${parsed.o2}/${parsed.he}`;
            customGases.push({ name: gasName, o2: parsed.o2, he: parsed.he });
            i++;
          }
        }
        break;

      case "--preset":
      case "-p":
        if (next) {
          options.preset = next;
          i++;
        }
        break;

      case "--verbose":
        options.verbose = true;
        break;

      case "--json":
        options.json = true;
        break;

      case "--help":
      case "-h":
        printHelp();
        process.exit(0);
        break;
    }
  }

  // If custom gases are specified, use only those
  if (customGases.length > 0) {
    options.gases = customGases;
  }

  return options;
}

function printHelp() {
  console.log(`
Gas Blender CLI - Calculate gas blending steps for scuba diving

USAGE:
  gasBlender.cli.ts [OPTIONS]

OPTIONS:
  -s, --start <o2/he@pressure>     Starting gas (e.g., 21/0@50)
  -t, --target <o2/he@pressure>    Target gas (e.g., 32/0@200)
  -v, --volume <liters>            Tank volume in liters (e.g., 12)
  
  --start-o2 <percent>             Starting O₂ percentage
  --start-he <percent>             Starting He percentage
  --start-pressure <bar>           Starting pressure in bar
  --target-o2 <percent>            Target O₂ percentage
  --target-he <percent>            Target He percentage
  --target-pressure <bar>          Target pressure in bar
  
  -g, --gas <o2/he>                Specify available gas (e.g., 50/0 for EAN50)
                                   Can be specified multiple times
                                   If used, ONLY these gases will be available
  
  -p, --preset <name>              Use a preset blend
  --verbose                        Show detailed output
  --json                           Output as JSON
  -h, --help                       Show this help

PRESETS:
  nitrox32     - Blend EAN32 from air
  trimix3030   - Blend 30/30 trimix
  trimix1845   - Blend 18/45 trimix
  trimix2135   - Blend 21/35 trimix
  trimix1555   - Blend 15/55 trimix

EXAMPLES:
  # Blend nitrox 32 from air (uses default gases)
  gasBlender.cli.ts --start 21/0@0 --volume 12 --target 32/0@200
  
  # Blend trimix 18/35
  gasBlender.cli.ts --start 21/0@0 --volume 24 --target 18/35@200
  
  # Use a preset
  gasBlender.cli.ts --preset nitrox32
  
  # Use custom gases (Air, O₂, EAN32)
  gasBlender.cli.ts --start 21/0@0 --volume 12 --target 32/0@200 \\
    --gas 21/0 --gas 100/0 --gas 32/0
  
  # Blend trimix with specific gases
  gasBlender.cli.ts --start 21/0@0 --volume 24 --target 18/35@200 \\
    --gas 21/0 --gas 100/0 --gas 0/100 --gas 18/45
  
  # Detailed output
  gasBlender.cli.ts --preset trimix1845 --verbose
  
  # JSON output for scripting
  gasBlender.cli.ts --preset nitrox32 --json

DEFAULT GASES:
  Air (21/0), O₂ (100/0), He (0/100)
  
  These are used when no --gas options are specified.
  When --gas is used, ONLY the specified gases are available.
`);
}

function printResult(
  startingGas: TankState,
  targetGas: TargetGas,
  result: ReturnType<typeof calculateBlendingSteps>,
  options: CliOptions,
) {
  if (options.json) {
    console.log(
      JSON.stringify(
        {
          input: { startingGas, targetGas },
          result,
        },
        null,
        2,
      ),
    );
    return;
  }

  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("                    GAS BLENDING CALCULATION");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  console.log("STARTING CONDITIONS:");
  console.log(`  Tank:     ${startingGas.volume}L`);
  console.log(`  Mix:      ${startingGas.o2}/${startingGas.he}`);
  console.log(`  Pressure: ${startingGas.pressure} bar`);

  console.log("\nTARGET:");
  console.log(`  Mix:      ${targetGas.o2}/${targetGas.he}`);
  console.log(`  Pressure: ${targetGas.pressure} bar`);

  if (options.verbose && options.gases) {
    console.log("\nAVAILABLE GASES:");
    options.gases.forEach((gas) => {
      console.log(`  ${gas.name.padEnd(10)} (${gas.o2}% O₂, ${gas.he}% He)`);
    });
  }

  if (!result.success) {
    console.log("\n❌ BLENDING FAILED");
    console.log(`   ${result.error}`);
    console.log(
      "\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n",
    );
    return;
  }

  console.log("\n✓ BLENDING STEPS:");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  result.steps.forEach((step, index) => {
    console.log(`\n${index + 1}. ${step.action}`);

    if (options.verbose) {
      console.log(`   From: ${step.fromPressure} bar (${step.currentMix})`);
      console.log(`   To:   ${step.toPressure} bar (${step.newMix})`);

      if (step.gas && step.addedPressure) {
        console.log(
          `   Added: ${step.addedPressure} bar = ${step.addedVolume}L of ${step.gas}`,
        );
      }
      if (step.drainedPressure) {
        console.log(`   Drained: ${step.drainedPressure} bar`);
      }
    } else {
      if (step.addedPressure) {
        console.log(
          `   ${step.fromPressure} → ${step.toPressure} bar (${step.currentMix} → ${step.newMix})`,
        );
      } else {
        console.log(`   ${step.fromPressure} → ${step.toPressure} bar`);
      }
    }
  });

  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("FINAL RESULT:");
  console.log(`  Mix:      ${result.finalMix.o2}/${result.finalMix.he}`);
  console.log(`  Pressure: ${result.finalMix.pressure} bar`);

  console.log("\nGAS USAGE:");
  const gasNames = Object.keys(result.gasUsage).sort();
  if (gasNames.length === 0) {
    console.log("  (No gases added)");
  } else {
    gasNames.forEach((name) => {
      console.log(`  ${name.padEnd(10)} ${result.gasUsage[name]} L`);
    });
  }

  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
}

function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    printHelp();
    process.exit(0);
  }

  const options = parseArgs(args);

  // Apply preset if specified
  if (options.preset) {
    const preset = BLEND_PRESETS[options.preset.toLowerCase()];
    if (!preset) {
      console.error(`❌ Unknown preset: ${options.preset}`);
      console.error(
        `Available presets: ${Object.keys(BLEND_PRESETS).join(", ")}`,
      );
      process.exit(1);
    }

    const start = parseGasString(preset.start);
    const target = parseGasString(preset.target);

    if (start) {
      options.startO2 = start.o2;
      options.startHe = start.he;
      options.startPressure = start.pressure;
    }
    if (target) {
      options.targetO2 = target.o2;
      options.targetHe = target.he;
      options.targetPressure = target.pressure;
    }
    options.startVolume = preset.volume;
  }

  // Validate required options
  if (
    options.startO2 === undefined ||
    options.startHe === undefined ||
    options.startPressure === undefined ||
    options.startVolume === undefined ||
    options.targetO2 === undefined ||
    options.targetHe === undefined ||
    options.targetPressure === undefined
  ) {
    console.error("❌ Missing required parameters");
    console.error("   Use --help to see usage information");
    process.exit(1);
  }

  const startingGas: TankState = {
    volume: options.startVolume,
    o2: options.startO2,
    he: options.startHe,
    pressure: options.startPressure,
  };

  const targetGas: TargetGas = {
    o2: options.targetO2,
    he: options.targetHe,
    pressure: options.targetPressure,
  };

  const result = calculateBlendingSteps(
    startingGas,
    targetGas,
    options.gases || STANDARD_GASES,
  );

  printResult(startingGas, targetGas, result, options);

  process.exit(result.success ? 0 : 1);
}

// Only run if this is the main module
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { main, parseArgs, parseGasString, BLEND_PRESETS, STANDARD_GASES };
