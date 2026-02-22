# Synth Scuba

Web-based calculators for scuba diving, built with React + TypeScript + Vite.

Production site: **https://scuba.synth.no/**

## Tools

### Gas Blender

Calculates the step-by-step procedure to blend nitrox and trimix gases using partial-pressure methods. Supports:

- Configurable starting gas (volume, pressure, O₂%, He%)
- Configurable target gas (pressure, O₂%, He%)
- Multiple source gases: Air, O₂, Helium, Nitrox 32, custom trimix, and user-defined gases
- Automatic drain calculation when starting gas cannot reach target without reducing a component
- Gas usage summary (litres per gas type consumed)
- URL-shareable configurations

The algorithm works entirely in partial-pressure space (ideal gas law). Blending steps always follow the order: drain if needed → add helium → top up with O₂ and/or air. Tolerances are ±0.5% O₂, ±0.5% He, ±1 bar.

### Tank Calculator

Calculates buoyancy and specifications for common scuba tanks. Supports:

- Metric (litres, bar, kg) and Imperial (cu ft, psi, lbs) units
- Steel and aluminium tanks
- Single and double (twinset) configurations
- Salt and fresh water buoyancy
- 30+ predefined tanks (metric and imperial) plus manual entry
- Buoyancy shown for empty and full tanks

## Development

```bash
npm install        # install dependencies
npm run dev        # start dev server
npm test           # run tests
npm run build      # format, type-check, and build
```

The build copies `dist/index.html` to `dist/blender.html` and `dist/tanks.html` so each route works as a standalone page.

## License

Licensed under [GPLv3](LICENSE).
