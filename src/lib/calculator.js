const ONE_DAY = 1 / 360;
const ONE_WEEK = 7 / 360;
const ONE_MONTH = 30 / 360;
const THREE_MONTHS = 90 / 360;
const SIX_MONTHS = 180 / 360;
const NINE_MONTHS = 270 / 360;

export const DEFAULT_SHOCK_PARAMETERS = {
  parallel: {
    up: 0.04,
    down: 0.04,
  },
  steepener: {
    decay: 4,
    shortWeight: -0.65,
    shortAmplitude: 0.05,
    longWeight: 0.9,
    longAmplitude: 0.03,
  },
  flattener: {
    decay: 4,
    shortWeight: 0.8,
    shortAmplitude: 0.05,
    longWeight: -0.6,
    longAmplitude: 0.03,
  },
  shortRate: {
    decay: 4,
    upAmplitude: 0.05,
    downAmplitude: 0.05,
  },
};

const bootstrappedBaseRows = [
  { label: "1D", t: ONE_DAY },
  { label: "1W", t: ONE_WEEK },
  { label: "1M", t: ONE_MONTH },
  { label: "3M", t: THREE_MONTHS },
  { label: "6M", t: SIX_MONTHS },
  { label: "9M", t: NINE_MONTHS },
  { label: "12M", t: 1 },
  { label: "18M", t: 1.5 },
  { label: "2Yrs", t: 2 },
  { label: "3Yrs", t: 3 },
  { label: "4Yrs", t: 4 },
  { label: "5Yrs", t: 5 },
  { label: "6Yrs", t: 6 },
  { label: "7Yrs", t: 7 },
  { label: "8Yrs", t: 8 },
  { label: "9Yrs", t: 9 },
  { label: "10Yrs", t: 10 },
];

function average(left, right) {
  return (left + right) / 2;
}

function weightedAverage(left, leftWeight, right, rightWeight) {
  return (left * leftWeight + right * rightWeight) / (leftWeight + rightWeight);
}

function toRate(value) {
  if (value == null || !Number.isFinite(value)) {
    return null;
  }

  return value / 100;
}

function assertFinite(value, label) {
  if (!Number.isFinite(value)) {
    throw new Error(`Missing or invalid value for ${label}.`);
  }

  return value;
}

function simpleDiscountFactor(rate, t) {
  return 1 / (1 + t * rate);
}

function zeroRateFromDiscount(discountFactor, t) {
  return -Math.log(discountFactor) / t;
}

function parCoupon(rate, t) {
  const totalPeriods = Math.round(t);
  let denominator = 0;

  for (let period = 1; period <= totalPeriods; period += 1) {
    denominator += Math.exp(-period * rate);
  }

  return (1 - Math.exp(-t * rate)) / denominator;
}

function maturityLabelFromYears(years) {
  if (years === 1) {
    return "12M";
  }

  return `${years}Yrs`;
}

function nelsonSiegelLoading(lambda, t) {
  const scaled = lambda * t;

  if (Math.abs(scaled) < 1e-8) {
    const factor1 = 1 - scaled / 2 + (scaled ** 2) / 6;
    const factor2 = scaled / 2 - (scaled ** 2) / 3;

    return { factor1, factor2 };
  }

  const exponential = Math.exp(-scaled);
  const factor1 = (1 - exponential) / scaled;
  const factor2 = factor1 - exponential;

  return { factor1, factor2 };
}

function nelsonSiegelYield(parameters, t) {
  const { beta0, beta1, beta2, lambda } = parameters;
  const { factor1, factor2 } = nelsonSiegelLoading(lambda, t);

  return beta0 + beta1 * factor1 + beta2 * factor2;
}

function solve3x3(matrix, vector) {
  const system = matrix.map((row, rowIndex) => [...row, vector[rowIndex]]);

  for (let pivot = 0; pivot < 3; pivot += 1) {
    let pivotRow = pivot;

    for (let row = pivot + 1; row < 3; row += 1) {
      if (Math.abs(system[row][pivot]) > Math.abs(system[pivotRow][pivot])) {
        pivotRow = row;
      }
    }

    if (Math.abs(system[pivotRow][pivot]) < 1e-12) {
      return null;
    }

    if (pivotRow !== pivot) {
      [system[pivot], system[pivotRow]] = [system[pivotRow], system[pivot]];
    }

    const pivotValue = system[pivot][pivot];

    for (let column = pivot; column < 4; column += 1) {
      system[pivot][column] /= pivotValue;
    }

    for (let row = 0; row < 3; row += 1) {
      if (row === pivot) {
        continue;
      }

      const factor = system[row][pivot];

      for (let column = pivot; column < 4; column += 1) {
        system[row][column] -= factor * system[pivot][column];
      }
    }
  }

  return [system[0][3], system[1][3], system[2][3]];
}

function fitBetasForLambda(points, lambda) {
  const xtx = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  const xty = [0, 0, 0];

  for (const point of points) {
    const { factor1, factor2 } = nelsonSiegelLoading(lambda, point.t);
    const features = [1, factor1, factor2];

    for (let row = 0; row < 3; row += 1) {
      xty[row] += features[row] * point.yield;

      for (let column = 0; column < 3; column += 1) {
        xtx[row][column] += features[row] * features[column];
      }
    }
  }

  const solution = solve3x3(xtx, xty);

  if (!solution) {
    return null;
  }

  const [beta0, beta1, beta2] = solution;

  let squaredError = 0;

  for (const point of points) {
    const fitted = nelsonSiegelYield({ beta0, beta1, beta2, lambda }, point.t);
    squaredError += (fitted - point.yield) ** 2;
  }

  return {
    beta0,
    beta1,
    beta2,
    lambda,
    squaredError,
    objective: squaredError * 10000,
  };
}

function logSpace(min, max, count) {
  const values = [];
  const logMin = Math.log(min);
  const logMax = Math.log(max);

  for (let index = 0; index < count; index += 1) {
    const weight = index / (count - 1);
    values.push(Math.exp(logMin + (logMax - logMin) * weight));
  }

  return values;
}

function goldenSectionSearch(fn, left, right, iterations = 48) {
  const goldenRatio = (Math.sqrt(5) - 1) / 2;
  let a = left;
  let b = right;
  let c = b - goldenRatio * (b - a);
  let d = a + goldenRatio * (b - a);
  let fc = fn(c);
  let fd = fn(d);

  for (let iteration = 0; iteration < iterations; iteration += 1) {
    if (fc.value <= fd.value) {
      b = d;
      d = c;
      fd = fc;
      c = b - goldenRatio * (b - a);
      fc = fn(c);
      continue;
    }

    a = c;
    c = d;
    fc = fd;
    d = a + goldenRatio * (b - a);
    fd = fn(d);
  }

  return fc.value <= fd.value ? fc.result : fd.result;
}

export function getAvailableDates(datasets) {
  const roBondsDates = new Set(datasets.roBonds.map((row) => row.date));

  return [...new Set(datasets.robor.map((row) => row.date))]
    .filter((date) => roBondsDates.has(date))
    .sort((left, right) => right.localeCompare(left));
}

export function indexRowsByDate(rows) {
  return new Map(rows.map((row) => [row.date, row]));
}

export function computeMarketRates(roBondsRow, roborRow) {
  if (!roBondsRow || !roborRow) {
    throw new Error("The selected date is missing from RO Bonds or ROBOR.");
  }

  const deposit1D = assertFinite(
    toRate(roborRow.roborTomorrowNext),
    "ROBOR tomorrow next",
  );
  const deposit1W = assertFinite(toRate(roborRow.robor1W), "ROBOR 1W");
  const deposit1M = assertFinite(toRate(roborRow.robor1M), "ROBOR 1M");
  const deposit3M = assertFinite(toRate(roborRow.robor3M), "ROBOR 3M");
  const deposit6M = assertFinite(toRate(roborRow.robor6M), "ROBOR 6M");
  const deposit12M = assertFinite(toRate(roborRow.robor12M), "ROBOR 12M");
  const robor9M = toRate(roborRow.robor9M);
  const bond3Y = assertFinite(toRate(roBondsRow.tsBid3Y), "RO Bonds 3Y bid");
  const bond5Y = assertFinite(toRate(roBondsRow.tsBid5Y), "RO Bonds 5Y bid");
  const bond10Y = assertFinite(toRate(roBondsRow.tsBid10Y), "RO Bonds 10Y bid");

  const oneYearDiscountFactor = simpleDiscountFactor(deposit12M, 1);
  const oneYearZeroRate = zeroRateFromDiscount(oneYearDiscountFactor, 1);
  const bond2Y = average(bond3Y, oneYearZeroRate);
  const deposit9M = robor9M ?? average(deposit6M, deposit12M);
  const deposit18M = robor9M ?? average(deposit12M, bond2Y);
  const bond4Y = average(bond3Y, bond5Y);
  const bond6Y = weightedAverage(bond5Y, 4, bond10Y, 1);
  const bond7Y = weightedAverage(bond5Y, 3, bond10Y, 2);
  const bond8Y = weightedAverage(bond5Y, 2, bond10Y, 3);
  const bond9Y = weightedAverage(bond6Y, 1, bond10Y, 4);

  return [
    {
      product: "Deposit 1D",
      underlying: "ROBOR tomorrow next",
      fairRate: deposit1D,
    },
    {
      product: "Deposit 1W",
      underlying: "ROBOR 1W",
      fairRate: deposit1W,
    },
    {
      product: "Deposit 1M",
      underlying: "ROBOR 1M",
      fairRate: deposit1M,
    },
    {
      product: "Deposit 3M",
      underlying: "ROBOR 3M",
      fairRate: deposit3M,
    },
    {
      product: "Deposit 6M",
      underlying: "ROBOR 6M",
      fairRate: deposit6M,
    },
    {
      product: "Deposit 9M",
      underlying: "ROBOR 9M or interpolation",
      fairRate: deposit9M,
    },
    {
      product: "Deposit 12M",
      underlying: "ROBOR 12M",
      fairRate: deposit12M,
    },
    {
      product: "Deposit 18M",
      underlying: "Workbook fallback interpolation",
      fairRate: deposit18M,
    },
    {
      product: "Bond 2Y",
      underlying: "Interpolation",
      fairRate: bond2Y,
    },
    {
      product: "Bond 3Y",
      underlying: "RO Bonds 3Y bid",
      fairRate: bond3Y,
    },
    {
      product: "Bond 4Y",
      underlying: "Interpolation",
      fairRate: bond4Y,
    },
    {
      product: "Bond 5Y",
      underlying: "RO Bonds 5Y bid",
      fairRate: bond5Y,
    },
    {
      product: "Bond 6Y",
      underlying: "Interpolation",
      fairRate: bond6Y,
    },
    {
      product: "Bond 7Y",
      underlying: "Interpolation",
      fairRate: bond7Y,
    },
    {
      product: "Bond 8Y",
      underlying: "Interpolation",
      fairRate: bond8Y,
    },
    {
      product: "Bond 9Y",
      underlying: "Interpolation",
      fairRate: bond9Y,
    },
    {
      product: "Bond 10Y",
      underlying: "RO Bonds 10Y bid",
      fairRate: bond10Y,
    },
  ];
}

export function computeYieldCurveTable(marketRateRows) {
  const rateByProduct = new Map(
    marketRateRows.map((row) => [row.product, row.fairRate]),
  );

  const rows = [];

  for (const baseRow of bootstrappedBaseRows) {
    if (baseRow.t <= 1.5) {
      const product =
        baseRow.label === "1D"
          ? "Deposit 1D"
          : baseRow.label === "1W"
            ? "Deposit 1W"
            : baseRow.label === "1M"
              ? "Deposit 1M"
              : baseRow.label === "3M"
                ? "Deposit 3M"
                : baseRow.label === "6M"
                  ? "Deposit 6M"
                  : baseRow.label === "9M"
                    ? "Deposit 9M"
                    : baseRow.label === "12M"
                      ? "Deposit 12M"
                      : "Deposit 18M";

      const fairRate = assertFinite(rateByProduct.get(product), product);
      const discountFactor = simpleDiscountFactor(fairRate, baseRow.t);
      const yieldCurve = zeroRateFromDiscount(discountFactor, baseRow.t);

      rows.push({
        maturity: baseRow.label,
        t: baseRow.t,
        discountFactor,
        coupon: null,
        yieldCurve,
      });

      continue;
    }

    const product = `Bond ${baseRow.t}Y`;
    const fairRate = assertFinite(rateByProduct.get(product), product);
    const coupon = parCoupon(fairRate, baseRow.t);
    let previousDiscounts = 0;

    for (let previousYear = 1; previousYear < baseRow.t; previousYear += 1) {
      const previousLabel = maturityLabelFromYears(previousYear);
      const previousRow = rows.find((row) => row.maturity === previousLabel);

      previousDiscounts += assertFinite(
        previousRow?.discountFactor,
        `${previousLabel} discount factor`,
      );
    }

    const discountFactor = (1 - coupon * previousDiscounts) / (1 + coupon);
    const yieldCurve = zeroRateFromDiscount(discountFactor, baseRow.t);

    rows.push({
      maturity: baseRow.label,
      t: baseRow.t,
      discountFactor,
      coupon,
      yieldCurve,
    });
  }

  return rows;
}

export function calibrateNelsonSiegel(yieldCurveRows) {
  const observedPoints = yieldCurveRows.map((row) => ({
    label: row.maturity,
    t: row.t,
    yield: row.yieldCurve,
  }));

  const lambdaGrid = logSpace(0.001, 5, 320);
  let bestIndex = 0;
  let bestResult = null;

  lambdaGrid.forEach((lambda, index) => {
    const result = fitBetasForLambda(observedPoints, lambda);

    if (!result) {
      return;
    }

    if (!bestResult || result.objective < bestResult.objective) {
      bestResult = result;
      bestIndex = index;
    }
  });

  if (!bestResult) {
    throw new Error("Unable to calibrate the Nelson-Siegel curve.");
  }

  const leftIndex = Math.max(bestIndex - 1, 0);
  const rightIndex = Math.min(bestIndex + 1, lambdaGrid.length - 1);
  const left = lambdaGrid[leftIndex];
  const right = lambdaGrid[rightIndex];

  const refinedResult =
    left === right
      ? bestResult
      : goldenSectionSearch((lambda) => {
          const result = fitBetasForLambda(observedPoints, lambda) ?? bestResult;

          return {
            value: result.objective,
            result,
          };
        }, left, right);

  return {
    ...refinedResult,
    rmse: Math.sqrt(refinedResult.squaredError / observedPoints.length),
  };
}

export function buildBootstrappedCurve(yieldCurveRows, calibration) {
  const rows = yieldCurveRows.map((row) => {
    const interpolation = nelsonSiegelYield(calibration, row.t);
    const error = (interpolation - row.yieldCurve) ** 2 * 10000;

    return {
      maturity: row.maturity,
      t: row.t,
      observedYield: row.yieldCurve,
      interpolatedYield: interpolation,
      error,
    };
  });

  for (let year = 11; year <= 30; year += 1) {
    const maturity = `${year}Yrs`;
    const t = year;
    const interpolatedYield = nelsonSiegelYield(calibration, t);

    rows.push({
      maturity,
      t,
      observedYield: interpolatedYield,
      interpolatedYield,
      error: null,
    });
  }

  return rows;
}

export function computeStressShockSeries(t, parameters) {
  const parallelUp = parameters.parallel.up;
  const parallelDown = -Math.abs(parameters.parallel.down);
  const steepenerDecay = Math.max(parameters.steepener.decay, 1e-6);
  const flattenerDecay = Math.max(parameters.flattener.decay, 1e-6);
  const shortRateDecay = Math.max(parameters.shortRate.decay, 1e-6);

  const steepenerExp = Math.exp(-t / steepenerDecay);
  const flattenerExp = Math.exp(-t / flattenerDecay);
  const shortRateExp = Math.exp(-t / shortRateDecay);

  const steepener =
    parameters.steepener.shortWeight *
      steepenerExp *
      parameters.steepener.shortAmplitude +
    parameters.steepener.longWeight *
      (1 - steepenerExp) *
      parameters.steepener.longAmplitude;

  const flattener =
    parameters.flattener.shortWeight *
      flattenerExp *
      parameters.flattener.shortAmplitude +
    parameters.flattener.longWeight *
      (1 - flattenerExp) *
      parameters.flattener.longAmplitude;

  const shortRateUp = shortRateExp * parameters.shortRate.upAmplitude;
  const shortRateDown = -shortRateExp * parameters.shortRate.downAmplitude;

  return {
    parallelUp,
    parallelDown,
    steepener,
    flattener,
    shortRateUp,
    shortRateDown,
  };
}

export function computeDiscountFactorTable(bootstrappedRows, parameters) {
  return bootstrappedRows.map((row) => {
    const baseYield = row.interpolatedYield;
    const currentDiscountFactor = Math.exp(-row.t * baseYield);
    const shocks = computeStressShockSeries(row.t, parameters);

    return {
      maturity: row.maturity,
      t: row.t,
      baseYield,
      currentDiscountFactor,
      parallelShockUp: Math.exp(-row.t * shocks.parallelUp) * currentDiscountFactor,
      parallelShockDown:
        Math.exp(-row.t * shocks.parallelDown) * currentDiscountFactor,
      steepenerShock:
        Math.exp(-row.t * shocks.steepener) * currentDiscountFactor,
      flattenerShock:
        Math.exp(-row.t * shocks.flattener) * currentDiscountFactor,
      shortRatesShockUp:
        Math.exp(-row.t * shocks.shortRateUp) * currentDiscountFactor,
      shortRatesShockDown:
        Math.exp(-row.t * shocks.shortRateDown) * currentDiscountFactor,
      shockSeries: shocks,
      shockedYields: {
        current: baseYield,
        parallelUp: baseYield + shocks.parallelUp,
        parallelDown: baseYield + shocks.parallelDown,
        steepener: baseYield + shocks.steepener,
        flattener: baseYield + shocks.flattener,
        shortRateUp: baseYield + shocks.shortRateUp,
        shortRateDown: baseYield + shocks.shortRateDown,
      },
    };
  });
}

export function calculateSimulatorState(date, datasets, shockParameters) {
  const roBondsIndex = indexRowsByDate(datasets.roBonds);
  const roborIndex = indexRowsByDate(datasets.robor);
  const roBondsRow = roBondsIndex.get(date);
  const roborRow = roborIndex.get(date);
  const marketRates = computeMarketRates(roBondsRow, roborRow);
  const yieldCurve = computeYieldCurveTable(marketRates);
  const calibration = calibrateNelsonSiegel(yieldCurve);
  const bootstrappedCurve = buildBootstrappedCurve(yieldCurve, calibration);
  const discountFactors = computeDiscountFactorTable(
    bootstrappedCurve,
    shockParameters,
  );

  return {
    marketRates,
    yieldCurve,
    calibration,
    bootstrappedCurve,
    discountFactors,
  };
}
