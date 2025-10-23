# Gas Blender CLI

A command-line interface for the gas blender calculator. Useful for debugging, testing, and quick calculations.

## Installation

The CLI is already set up. Just make sure dependencies are installed:

```bash
npm install
```

## Usage

```bash
npm run blend -- [OPTIONS]
```

### Quick Start

```bash
# Use a preset
npm run blend -- --preset nitrox32

# Custom blend
npm run blend -- --start 21/0@0 --volume 12 --target 32/0@200

# Verbose output (shows detailed step info)
npm run blend -- --preset trimix1845 --verbose

# JSON output (for scripting)
npm run blend -- --preset nitrox32 --json
```

## Options

### Gas Format

Use the compact format `o2/he@pressure`:

- `21/0@50` = 21% O₂, 0% He, at 50 bar
- `18/35@200` = 18% O₂, 35% He, at 200 bar

### Command-Line Options

```
-s, --start <o2/he@pressure>     Starting gas (e.g., 21/0@0)
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
-h, --help                       Show help
```

## Presets

- `nitrox32` - Blend EAN32 from air (12L tank, 0→200 bar)
- `trimix3030` - Blend 30/30 trimix (24L tank, 0→200 bar)
- `trimix1845` - Blend 18/45 trimix (24L tank, 0→200 bar)
- `trimix2135` - Blend 21/35 trimix (24L tank, 0→200 bar)
- `trimix1555` - Blend 15/55 trimix (24L tank, 0→200 bar)

## Examples

### Nitrox 32

```bash
$ npm run blend -- --preset nitrox32

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                    GAS BLENDING CALCULATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

STARTING CONDITIONS:
  Tank:     12L
  Mix:      21/0
  Pressure: 0 bar

TARGET:
  Mix:      32/0
  Pressure: 200 bar

✓ BLENDING STEPS:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. Top up with EAN36
   50 → 200 bar (21/0 → 32.3/0)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FINAL RESULT:
  Mix:      32.3/0
  Pressure: 200 bar

GAS USAGE:
  EAN36      1800 L
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### Trimix 18/45 (Verbose)

```bash
$ npm run blend -- --preset trimix1845 --verbose

Shows detailed step information with exact pressures and volumes.
```

### Custom Blend

```bash
$ npm run blend -- --start 21/0@100 --volume 15 --target 28/20@220

Calculates blend for custom parameters.
```

### Custom Available Gases

```bash
# Use Air, O₂, and EAN32 (instead of defaults)
$ npm run blend -- --start 21/0@0 --volume 12 --target 32/0@200 \
  --gas 21/0 --gas 100/0 --gas 32/0

# Blend trimix with custom gas selection
$ npm run blend -- --start 21/0@0 --volume 24 --target 18/35@200 \
  --gas 21/0 --gas 100/0 --gas 0/100 --gas 18/45 --verbose
```

### JSON Output

```bash
$ npm run blend -- --preset nitrox32 --json > result.json

Outputs machine-readable JSON for scripting/automation.
```

## Exit Codes

- `0` - Success (blend calculation completed)
- `1` - Failure (unable to blend with available gases)

## Debugging

The CLI is perfect for debugging the gas blender algorithm:

1. **Test edge cases** - Try different starting/target combinations
2. **Verify calculations** - Compare with manual calculations
3. **Regression testing** - Use JSON output to verify algorithm changes
4. **Quick iterations** - Faster than running the web UI

## Available Gases

The CLI uses these standard gases by default:

- **Air** (21% O₂, 0% He)
- **O₂** (100% O₂, 0% He)
- **He** (0% O₂, 100% He)

This matches the default gases in the web UI.

### Customizing Available Gases

When you specify any `--gas` options, **only those gases** will be available for blending (the defaults are not included):

```bash
# Use Air, O₂, and EAN32
npm run blend -- --start 21/0@0 --volume 12 --target 32/0@200 \
  --gas 21/0 --gas 100/0 --gas 32/0

# Use Air, O₂, He, and custom trimix
npm run blend -- --start 21/0@0 --volume 24 --target 18/35@200 \
  --gas 21/0 --gas 100/0 --gas 0/100 --gas 18/45
```

This is useful for testing different blending scenarios or matching your actual gas availability at your dive shop.
