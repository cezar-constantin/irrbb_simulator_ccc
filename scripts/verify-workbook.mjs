import path from "node:path";
import XLSX from "xlsx";

import {
  DEFAULT_SHOCK_PARAMETERS,
  calculateSimulatorState,
} from "../src/lib/calculator.js";
import { defaultDatasets } from "../src/data/defaultData.js";

function workbookDate(value) {
  return XLSX.SSF.format("yyyy-mm-dd", value);
}

function almostEqual(left, right, tolerance = 1e-10) {
  return Math.abs(left - right) <= tolerance;
}

function assertMatch(label, left, right, tolerance = 1e-10) {
  if (!almostEqual(left, right, tolerance)) {
    throw new Error(`${label} mismatch: expected ${right}, received ${left}`);
  }
}

function getCellValue(sheet, address) {
  return sheet[address]?.v ?? null;
}

function main() {
  const workbook = XLSX.readFile(path.resolve("Yield curves.xls"), {
    cellFormula: true,
    raw: true,
  });

  const yieldSheet = workbook.Sheets["Yield curve"];
  const discountSheet = workbook.Sheets["Discount factors"];
  const bootstrappedSheet = workbook.Sheets["Bootstrapped yield curve"];
  const selectedDate = workbookDate(getCellValue(discountSheet, "D4"));
  const simulation = calculateSimulatorState(
    selectedDate,
    defaultDatasets,
    DEFAULT_SHOCK_PARAMETERS,
  );

  const marketRateChecks = [
    ["Deposit 1D", "G7"],
    ["Deposit 1W", "G8"],
    ["Deposit 1M", "G9"],
    ["Deposit 3M", "G10"],
    ["Deposit 6M", "G11"],
    ["Deposit 9M", "G12"],
    ["Deposit 12M", "G13"],
    ["Deposit 18M", "G14"],
    ["Bond 2Y", "G15"],
    ["Bond 3Y", "G16"],
    ["Bond 4Y", "G17"],
    ["Bond 5Y", "G18"],
    ["Bond 6Y", "G19"],
    ["Bond 7Y", "G20"],
    ["Bond 8Y", "G21"],
    ["Bond 9Y", "G22"],
    ["Bond 10Y", "G23"],
  ];

  for (const [product, address] of marketRateChecks) {
    const actual = simulation.marketRates.find((row) => row.product === product)?.fairRate;
    const expected = getCellValue(yieldSheet, address);
    assertMatch(`Market rate ${product}`, actual, expected);
  }

  simulation.yieldCurve.forEach((row, index) => {
    const sheetRow = index + 5;

    assertMatch(
      `Yield curve discount factor ${row.maturity}`,
      row.discountFactor,
      getCellValue(yieldSheet, `M${sheetRow}`),
    );

    const expectedCoupon = getCellValue(yieldSheet, `N${sheetRow}`);

    if (expectedCoupon != null) {
      assertMatch(`Yield curve coupon ${row.maturity}`, row.coupon, expectedCoupon);
    }

    assertMatch(
      `Yield curve zero rate ${row.maturity}`,
      row.yieldCurve,
      getCellValue(yieldSheet, `O${sheetRow}`),
    );
  });

  simulation.discountFactors.forEach((row, index) => {
    const sheetRow = index + 7;
    const shockSeries = row.shockSeries;

    assertMatch(
      `Parallel up shock ${row.maturity}`,
      shockSeries.parallelUp,
      getCellValue(discountSheet, `Q${sheetRow}`),
    );
    assertMatch(
      `Parallel down shock ${row.maturity}`,
      shockSeries.parallelDown,
      getCellValue(discountSheet, `R${sheetRow}`),
    );
    assertMatch(
      `Steepener shock ${row.maturity}`,
      shockSeries.steepener,
      getCellValue(discountSheet, `S${sheetRow}`),
    );
    assertMatch(
      `Flattener shock ${row.maturity}`,
      shockSeries.flattener,
      getCellValue(discountSheet, `T${sheetRow}`),
    );
    assertMatch(
      `Short-rate up shock ${row.maturity}`,
      shockSeries.shortRateUp,
      getCellValue(discountSheet, `U${sheetRow}`),
    );
    assertMatch(
      `Short-rate down shock ${row.maturity}`,
      shockSeries.shortRateDown,
      getCellValue(discountSheet, `V${sheetRow}`),
    );
  });

  const workbookObjective = getCellValue(bootstrappedSheet, "L8");
  const workbookLambda = getCellValue(bootstrappedSheet, "L7");

  console.log(`Verified workbook-equivalent formulas for ${selectedDate}.`);
  console.log(
    `Workbook cached objective: ${workbookObjective.toFixed(6)} at lambda ${workbookLambda.toFixed(6)}`,
  );
  console.log(
    `Simulator calibrated objective: ${simulation.calibration.objective.toFixed(6)} at lambda ${simulation.calibration.lambda.toFixed(6)}`,
  );
}

main();
