# IRRBB Yield Curve Simulator

This project turns the `Yield curves.xls` workbook into a browser-based simulator with four tabs:

- `Data update`: review the seeded RO Bonds / ROBOR history and upload fresh CSV files
- `Yield curve`: rebuild the workbook's market-rates and yield-curve tables for a selected date
- `Bootstrapped curve`: calibrate `beta0`, `beta1`, `beta2`, and `lambda` with squared-error minimization
- `Discount factors`: apply editable stress-shock functions and view shocked yield curves and discount factors

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

## Workbook translation notes

- The seed data is extracted from the `RO Bonds` and `Robor` sheets by `scripts/generate-default-data.mjs`.
- `scripts/verify-workbook.mjs` checks that the workbook-equivalent market-rate, yield-curve, and stress-shock formulas match the cached Excel outputs for the default date.
- The simulator extends the workbook by calibrating `lambda` as well. The original workbook's cached Solver setup only adjusted the beta terms.
- Uploaded CSV files are stored in browser local storage so refreshed data remains available after page reloads.
