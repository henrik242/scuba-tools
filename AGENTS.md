# AGENTS.md — Synth Scuba

Guidelines for AI agents working on this codebase.

## Project overview

Web-based scuba diving calculators built with React + TypeScript + Vite. Two tools:

- **Gas Blender** — partial-pressure gas blending calculator for nitrox and trimix
- **Tank Calculator** — buoyancy and specification calculator for common scuba tanks

Production site: https://scuba.synth.no/

## Repository layout

```
src/
  gasBlender.ts         # Core blending algorithm (pure functions, no React)
  gasBlender.test.ts    # ~1600 lines of tests — run these after any logic change
  GasBlender.tsx        # React UI for the blender
  tankCalculator.ts     # Buoyancy/spec calculations (pure functions)
  tankCalculator.test.ts
  gasUsage.test.ts      # Gas consumption tracking tests
  TankCalculator.tsx    # React UI for tank calculator
  AppRouter.tsx         # Top-level routing and nav
  main.tsx              # Entry point, PWA service worker registration
  App.css               # All component styles
  index.css             # Global resets
index.html
vite.config.ts          # Includes PWA plugin (vite-plugin-pwa)
```

## Essential commands

```bash
bun install          # install deps
bun test             # run all tests (bun test)
bun run dev          # dev server
bun run build        # format + type-check + vite build + postbuild copies
bun run format       # prettier
```

`bun run build` runs Prettier automatically — do not worry about formatting before building.

After a build, `dist/` contains `index.html`, `blender.html`, and `tanks.html` (the latter two are copies of `index.html` produced by the `postbuild` script).

## Architecture & key invariants

### Separation of concerns

The algorithm files (`gasBlender.ts`, `tankCalculator.ts`) are **pure TypeScript with no React dependencies**. Keep them that way. The UI components consume their return values and own all state/URL persistence.

### Ideal gas law

The blender uses **partial pressures**, not volumetric fractions directly. For a tank at pressure P with O₂ fraction f:

```
O₂ partial pressure = f × P
```

All deltas and additions are computed in partial-pressure space (bar), then converted back to percentages for display. Tolerances for a successful blend are ±0.5% O₂, ±0.5% He, ±1 bar pressure.

### Blending step order

The algorithm always proceeds in this order:

1. **Drain** — if any component is in excess, drain to a calculated pressure
2. **Add helium** — from pure He or a trimix source
3. **Top up** — with O₂ and/or air/nitrox to reach target pressure

Do not reorder these steps without updating the drain calculation formulas.

### Drain calculation

The drain target is solved analytically (not iteratively) from simultaneous partial-pressure balance equations. There are three code paths depending on available gases:

- Pure He + pure O₂ available
- Trimix He source + pure O₂
- Trimix He source + only air/nitrox

If you modify this section, re-run the full test suite — drain edge cases have many interactions.

### URL state

Both UIs persist full state in the URL hash (`#key=value&…`) so configurations can be shared by copy-pasting a URL. State is read on mount and written on every change. Do not replace this with localStorage or session storage.

### PWA / service worker

The app registers a service worker (Workbox via `vite-plugin-pwa`). The service worker caches assets and Google Fonts. Changes to the build output structure may require updating cache strategies in `vite.config.ts`.

## Domain knowledge

A few scuba-specific things to keep in mind:

- **O₂ + He must never exceed 100%** — always validate this; the algorithm rejects invalid inputs.
- **Hypoxic mixes** (O₂ < 18%) are valid trimix blends used by technical divers; do not treat them as errors.
- **Recreational nitrox** is typically EAN32 or EAN36 (21–40% O₂, 0% He).
- **Trimix** examples in tests include 10/70, 12/65, 18/45 (O₂/He notation).
- The ±0.5% O₂ tolerance exists for diver safety — do not loosen it.

## Testing guidelines

- Run `npm test` after **any** change to `gasBlender.ts` or `tankCalculator.ts`.
- The test suite (`gasBlender.test.ts`) covers ~100 scenarios including edge cases and real-world blends. If a new algorithm path is added, add corresponding tests.
- Tests use `bun test` with plain `expect` assertions — no mocking framework is needed for the pure-function files.
- Gas usage is tracked as `pressure × tank volume` (in litres); the `gasUsage.test.ts` file verifies this separately.

## What to avoid

- Do not introduce iterative solvers where the drain pressure is currently solved analytically.
- Do not add runtime dependencies without a clear reason — the dependency list is intentionally lean.
- Do not store state outside of React hooks and the URL hash.
- Do not break the `postbuild` step; the three HTML files must exist in `dist/` for the router to work.
