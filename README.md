# CCC IRRBB Simulator

This project turns the `Yield curves.xls` workbook into a browser-based simulator with the same dark, portfolio-style presentation language used in `neural_network_ccc`. The app keeps four analytical tabs:

- `Input data`: review the integrated RO Bonds / ROBOR history used by the simulator
- `Yield curve`: rebuild the workbook's market-rates and yield-curve tables for a selected date
- `Bootstrapped curve`: calibrate `beta0`, `beta1`, `beta2`, and `lambda` with squared-error minimization
- `Stress tests`: apply editable stress-shock functions and view shocked yield curves and discount factors

## Run locally

```bash
npm install --cache .npm-cache
npm run generate-data
npm run verify
npm run dev
```

Open the local Vite URL shown in the terminal.

## Production build

```bash
npm run build
```

The static build is written to `dist/` and can be deployed to Netlify, Vercel, GitHub Pages, or any static web host.

For GitHub Pages in this copied repository, the Vite base path is configured for `/irrbb_simulator_ccc/`.

## Workbook translation notes

- The seed data is extracted from the `RO Bonds` and `Robor` sheets by `scripts/generate-default-data.mjs`.
- The bundled historical series is extended with `data/ro_bonds.csv` and `data/robor.csv`, which take the market history from August 2024 through March 2026.
- `scripts/verify-workbook.mjs` checks that the workbook-equivalent market-rate, yield-curve, and stress-shock formulas match the cached Excel outputs for the default date.
- The simulator extends the workbook by calibrating `lambda` as well. The original workbook's cached Solver setup only adjusted the beta terms.
