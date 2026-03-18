import "./styles.css";

import {
  DEFAULT_SHOCK_PARAMETERS,
  calculateSimulatorState,
  getAvailableDates,
} from "./lib/calculator.js";
import { parseRoBondsCsv, parseRoborCsv } from "./lib/csv.js";
import {
  buildUploadedDatasets,
  loadDatasets,
  loadShockParameters,
  resetDatasets,
  saveDatasets,
  saveShockParameters,
  summarizeDataset,
} from "./lib/datasets.js";
import { renderLineChart } from "./lib/charts.js";
import {
  escapeHtml,
  formatDateLabel,
  formatDecimal,
  formatNumber,
  formatPercentage,
} from "./lib/formatters.js";

const app = document.querySelector("#app");

const state = {
  activeTab: "data",
  datasets: null,
  shockParameters: loadShockParameters(DEFAULT_SHOCK_PARAMETERS),
  selectedDate: null,
  pendingFiles: {
    roBonds: null,
    robor: null,
  },
  message: "",
  error: "",
};

function syncSelectedDate() {
  if (!state.datasets) {
    state.selectedDate = null;
    return;
  }

  const availableDates = getAvailableDates(state.datasets);

  if (!availableDates.length) {
    state.selectedDate = null;
    return;
  }

  if (!state.selectedDate || !availableDates.includes(state.selectedDate)) {
    state.selectedDate = availableDates[0];
  }
}

function setMessage(message) {
  state.message = message;
  state.error = "";
}

function setError(message) {
  state.error = message;
  state.message = "";
}

function clearFeedback() {
  state.message = "";
  state.error = "";
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function setNestedValue(target, path, nextValue) {
  const keys = path.split(".");
  let cursor = target;

  for (let index = 0; index < keys.length - 1; index += 1) {
    cursor = cursor[keys[index]];
  }

  cursor[keys.at(-1)] = nextValue;
}

function buildTable(columns, rows) {
  return `
    <div class="table-shell">
      <table>
        <thead>
          <tr>
            ${columns
              .map((column) => `<th>${escapeHtml(column.label)}</th>`)
              .join("")}
          </tr>
        </thead>
        <tbody>
          ${rows
            .map(
              (row) => `
                <tr>
                  ${columns
                    .map((column) => `<td>${column.render(row)}</td>`)
                    .join("")}
                </tr>
              `,
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderPill(label, value) {
  return `
    <div class="metric-pill">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </div>
  `;
}

function renderUploadSummary(label, summary, sourceLabel, pendingUpload) {
  const pendingLabel = pendingUpload
    ? `<p class="pending-upload">Ready to apply: <strong>${escapeHtml(
        pendingUpload.name,
      )}</strong> (${pendingUpload.rows.length} rows)</p>`
    : "";

  return `
    <div class="data-card">
      <div class="section-header compact">
        <div>
          <h3>${escapeHtml(label)}</h3>
          <p>${escapeHtml(sourceLabel)}</p>
        </div>
        <span class="data-count">${summary.count} rows</span>
      </div>
      <div class="data-grid">
        <div>
          <span class="label">First date</span>
          <strong>${escapeHtml(formatDateLabel(summary.first))}</strong>
        </div>
        <div>
          <span class="label">Last date</span>
          <strong>${escapeHtml(formatDateLabel(summary.last))}</strong>
        </div>
      </div>
      ${pendingLabel}
    </div>
  `;
}

function renderPreviewTables(datasets) {
  const roBondsPreview = datasets.roBonds.slice(0, 5);
  const roborPreview = datasets.robor.slice(0, 5);

  return `
    <div class="panel-grid">
      <section class="panel">
        <div class="section-header compact">
          <div>
            <h3>RO Bonds Preview</h3>
            <p>Latest bond bid inputs driving the curve construction.</p>
          </div>
        </div>
        ${buildTable(
          [
            {
              label: "Date",
              render: (row) => escapeHtml(formatDateLabel(row.date)),
            },
            {
              label: "3Y Bid",
              render: (row) => escapeHtml(formatNumber(row.tsBid3Y ?? 0, 2)),
            },
            {
              label: "5Y Bid",
              render: (row) => escapeHtml(formatNumber(row.tsBid5Y ?? 0, 2)),
            },
            {
              label: "10Y Bid",
              render: (row) => escapeHtml(formatNumber(row.tsBid10Y ?? 0, 2)),
            },
          ],
          roBondsPreview,
        )}
      </section>
      <section class="panel">
        <div class="section-header compact">
          <div>
            <h3>ROBOR Preview</h3>
            <p>Money-market fixings used in the market-rates section.</p>
          </div>
        </div>
        ${buildTable(
          [
            {
              label: "Date",
              render: (row) => escapeHtml(formatDateLabel(row.date)),
            },
            {
              label: "TN",
              render: (row) => escapeHtml(formatNumber(row.roborTomorrowNext ?? 0, 2)),
            },
            {
              label: "1W",
              render: (row) => escapeHtml(formatNumber(row.robor1W ?? 0, 2)),
            },
            {
              label: "3M",
              render: (row) => escapeHtml(formatNumber(row.robor3M ?? 0, 2)),
            },
            {
              label: "12M",
              render: (row) => escapeHtml(formatNumber(row.robor12M ?? 0, 2)),
            },
          ],
          roborPreview,
        )}
      </section>
    </div>
  `;
}

function renderDataTab(datasets, availableDates) {
  const roBondsSummary = summarizeDataset(datasets.roBonds);
  const roborSummary = summarizeDataset(datasets.robor);

  return `
    <section class="panel stack">
      <div class="section-header">
        <div>
          <h2>Data Update</h2>
          <p>
            The simulator ships with the workbook seed data and can be refreshed with new CSV files.
            Uploaded files are stored in your browser so the web app stays usable after deployment.
          </p>
        </div>
        <div class="metric-pills">
          ${renderPill("Common dates", String(availableDates.length))}
          ${renderPill("Active market date", formatDateLabel(state.selectedDate))}
        </div>
      </div>
      <div class="panel-grid">
        ${renderUploadSummary(
          "RO Bonds",
          roBondsSummary,
          datasets.metadata?.source?.roBonds ?? "Workbook seed",
          state.pendingFiles.roBonds,
        )}
        ${renderUploadSummary(
          "ROBOR",
          roborSummary,
          datasets.metadata?.source?.robor ?? "Workbook seed",
          state.pendingFiles.robor,
        )}
      </div>
      <div class="upload-strip">
        <label class="upload-field">
          <span>RO Bonds CSV</span>
          <input data-file-kind="roBonds" type="file" accept=".csv,text/csv" />
        </label>
        <label class="upload-field">
          <span>ROBOR CSV</span>
          <input data-file-kind="robor" type="file" accept=".csv,text/csv" />
        </label>
        <button class="button button-primary" data-action="apply-uploads">Apply update</button>
        <button class="button" data-action="reset-data">Reset workbook seed</button>
      </div>
      <div class="callout">
        <strong>Workbook compatibility note.</strong>
        The market-rate functions mirror the spreadsheet lookups exactly, including the workbook's
        9M fallback logic used in the 18M step.
      </div>
      ${renderPreviewTables(datasets)}
    </section>
  `;
}

function renderYieldCurveTab(simulation) {
  const marketRatesTable = buildTable(
    [
      {
        label: "Product",
        render: (row) => escapeHtml(row.product),
      },
      {
        label: "Underlying",
        render: (row) => escapeHtml(row.underlying),
      },
      {
        label: "Fair rate",
        render: (row) => escapeHtml(formatPercentage(row.fairRate, 3)),
      },
    ],
    simulation.marketRates,
  );

  const yieldCurveTable = buildTable(
    [
      {
        label: "Maturity",
        render: (row) => escapeHtml(row.maturity),
      },
      {
        label: "T",
        render: (row) => escapeHtml(formatDecimal(row.t, 6)),
      },
      {
        label: "Discount factor",
        render: (row) => escapeHtml(formatDecimal(row.discountFactor, 6)),
      },
      {
        label: "Coupon",
        render: (row) =>
          row.coupon == null ? "—" : escapeHtml(formatPercentage(row.coupon, 3)),
      },
      {
        label: "Yield curve",
        render: (row) => escapeHtml(formatPercentage(row.yieldCurve, 3)),
      },
    ],
    simulation.yieldCurve,
  );

  const chart = renderLineChart({
    title: "Observed zero-coupon curve",
    subtitle: "Workbook-equivalent market-rate transformations for the selected date.",
    series: [
      {
        label: "Yield curve",
        points: simulation.yieldCurve.map((row) => ({
          x: row.t,
          y: row.yieldCurve,
        })),
      },
    ],
  });

  return `
    <section class="panel stack">
      <div class="section-header">
        <div>
          <h2>Yield Curve</h2>
          <p>
            This tab reproduces the workbook's market-rate table and the yield-curve table from the
            selected market date.
          </p>
        </div>
      </div>
      ${chart}
      <div class="panel-grid">
        <section class="panel secondary">
          <div class="section-header compact">
            <div>
              <h3>Market rates</h3>
              <p>ROBOR and RO Bonds inputs transformed into annualized fair rates.</p>
            </div>
          </div>
          ${marketRatesTable}
        </section>
        <section class="panel secondary">
          <div class="section-header compact">
            <div>
              <h3>Yield curve table</h3>
              <p>Discount factors and zero rates derived from the market-rate table.</p>
            </div>
          </div>
          ${yieldCurveTable}
        </section>
      </div>
    </section>
  `;
}

function renderBootstrappedTab(simulation) {
  const { calibration } = simulation;
  const table = buildTable(
    [
      {
        label: "Maturity",
        render: (row) => escapeHtml(row.maturity),
      },
      {
        label: "T",
        render: (row) => escapeHtml(formatDecimal(row.t, 6)),
      },
      {
        label: "Yield curve",
        render: (row) => escapeHtml(formatPercentage(row.observedYield, 3)),
      },
      {
        label: "Interpolation",
        render: (row) => escapeHtml(formatPercentage(row.interpolatedYield, 3)),
      },
      {
        label: "Error",
        render: (row) =>
          row.error == null ? "—" : escapeHtml(formatDecimal(row.error, 6)),
      },
    ],
    simulation.bootstrappedCurve,
  );

  const chart = renderLineChart({
    title: "Bootstrapped vs calibrated curve",
    subtitle:
      "Observed zero rates are matched with a four-parameter Nelson-Siegel fit and extended to 30 years.",
    series: [
      {
        label: "Observed curve",
        points: simulation.yieldCurve.map((row) => ({
          x: row.t,
          y: row.yieldCurve,
        })),
      },
      {
        label: "Calibrated curve",
        points: simulation.bootstrappedCurve.map((row) => ({
          x: row.t,
          y: row.interpolatedYield,
        })),
      },
    ],
  });

  return `
    <section class="panel stack">
      <div class="section-header">
        <div>
          <h2>Bootstrapped Yield Curve</h2>
          <p>
            The fitted curve extends the workbook logic by calibrating <em>beta 0</em>, <em>beta 1</em>,
            <em>beta 2</em>, and <em>lambda</em> through squared-error minimization.
          </p>
        </div>
        <div class="metric-pills">
          ${renderPill("Beta 0", formatDecimal(calibration.beta0, 6))}
          ${renderPill("Beta 1", formatDecimal(calibration.beta1, 6))}
          ${renderPill("Beta 2", formatDecimal(calibration.beta2, 6))}
          ${renderPill("Lambda", formatDecimal(calibration.lambda, 6))}
          ${renderPill("Objective", formatDecimal(calibration.objective, 6))}
        </div>
      </div>
      ${chart}
      <div class="callout">
        <strong>Calibration note.</strong>
        The original workbook's cached Solver setup only adjusted the beta terms. This simulator also
        optimizes lambda, as requested, while keeping the Nelson-Siegel functional form intact.
      </div>
      <section class="panel secondary">
        <div class="section-header compact">
          <div>
            <h3>Bootstrapped table</h3>
            <p>Observed points, fitted points, and squared errors scaled the same way as the sheet.</p>
          </div>
        </div>
        ${table}
      </section>
    </section>
  `;
}

function renderShockControls(parameters) {
  const groups = [
    {
      title: "Parallel shifts",
      fields: [
        ["parallel.up", "Up shock", parameters.parallel.up],
        ["parallel.down", "Down shock", parameters.parallel.down],
      ],
    },
    {
      title: "Steepener",
      fields: [
        ["steepener.shortWeight", "Short weight", parameters.steepener.shortWeight],
        ["steepener.shortAmplitude", "Short amplitude", parameters.steepener.shortAmplitude],
        ["steepener.longWeight", "Long weight", parameters.steepener.longWeight],
        ["steepener.longAmplitude", "Long amplitude", parameters.steepener.longAmplitude],
        ["steepener.decay", "Decay", parameters.steepener.decay],
      ],
    },
    {
      title: "Flattener",
      fields: [
        ["flattener.shortWeight", "Short weight", parameters.flattener.shortWeight],
        ["flattener.shortAmplitude", "Short amplitude", parameters.flattener.shortAmplitude],
        ["flattener.longWeight", "Long weight", parameters.flattener.longWeight],
        ["flattener.longAmplitude", "Long amplitude", parameters.flattener.longAmplitude],
        ["flattener.decay", "Decay", parameters.flattener.decay],
      ],
    },
    {
      title: "Short-rate shocks",
      fields: [
        ["shortRate.upAmplitude", "Up amplitude", parameters.shortRate.upAmplitude],
        ["shortRate.downAmplitude", "Down amplitude", parameters.shortRate.downAmplitude],
        ["shortRate.decay", "Decay", parameters.shortRate.decay],
      ],
    },
  ];

  return `
    <div class="panel-grid">
      ${groups
        .map(
          (group) => `
            <section class="panel secondary">
              <div class="section-header compact">
                <div>
                  <h3>${escapeHtml(group.title)}</h3>
                  <p>Editable parameters feeding the stress-shock functions.</p>
                </div>
              </div>
              <div class="field-grid">
                ${group.fields
                  .map(
                    ([path, label, value]) => `
                      <label class="field">
                        <span>${escapeHtml(label)}</span>
                        <input
                          data-shock-path="${escapeHtml(path)}"
                          type="number"
                          step="0.0001"
                          value="${escapeHtml(String(value))}"
                        />
                      </label>
                    `,
                  )
                  .join("")}
              </div>
            </section>
          `,
        )
        .join("")}
    </div>
  `;
}

function renderDiscountFactorsTab(simulation) {
  const shockRows = simulation.discountFactors.map((row) => ({
    maturity: row.maturity,
    t: row.t,
    ...row.shockSeries,
  }));

  const shockTable = buildTable(
    [
      {
        label: "Maturity",
        render: (row) => escapeHtml(row.maturity),
      },
      {
        label: "T",
        render: (row) => escapeHtml(formatDecimal(row.t, 6)),
      },
      {
        label: "Parallel up",
        render: (row) => escapeHtml(formatPercentage(row.parallelUp, 3)),
      },
      {
        label: "Parallel down",
        render: (row) => escapeHtml(formatPercentage(row.parallelDown, 3)),
      },
      {
        label: "Steepener",
        render: (row) => escapeHtml(formatPercentage(row.steepener, 3)),
      },
      {
        label: "Flattener",
        render: (row) => escapeHtml(formatPercentage(row.flattener, 3)),
      },
      {
        label: "Short up",
        render: (row) => escapeHtml(formatPercentage(row.shortRateUp, 3)),
      },
      {
        label: "Short down",
        render: (row) => escapeHtml(formatPercentage(row.shortRateDown, 3)),
      },
    ],
    shockRows,
  );

  const discountTable = buildTable(
    [
      {
        label: "Maturity",
        render: (row) => escapeHtml(row.maturity),
      },
      {
        label: "Current",
        render: (row) => escapeHtml(formatDecimal(row.currentDiscountFactor, 6)),
      },
      {
        label: "Parallel up",
        render: (row) => escapeHtml(formatDecimal(row.parallelShockUp, 6)),
      },
      {
        label: "Parallel down",
        render: (row) => escapeHtml(formatDecimal(row.parallelShockDown, 6)),
      },
      {
        label: "Steepener",
        render: (row) => escapeHtml(formatDecimal(row.steepenerShock, 6)),
      },
      {
        label: "Flattener",
        render: (row) => escapeHtml(formatDecimal(row.flattenerShock, 6)),
      },
      {
        label: "Short up",
        render: (row) => escapeHtml(formatDecimal(row.shortRatesShockUp, 6)),
      },
      {
        label: "Short down",
        render: (row) => escapeHtml(formatDecimal(row.shortRatesShockDown, 6)),
      },
    ],
    simulation.discountFactors,
  );

  const chart = renderLineChart({
    title: "Shocked yield curves",
    subtitle:
      "Base bootstrapped yields shifted by the editable stress-shock functions from the Discount factors sheet.",
    series: [
      {
        label: "Current",
        points: simulation.discountFactors.map((row) => ({
          x: row.t,
          y: row.shockedYields.current,
        })),
      },
      {
        label: "Parallel up",
        points: simulation.discountFactors.map((row) => ({
          x: row.t,
          y: row.shockedYields.parallelUp,
        })),
      },
      {
        label: "Parallel down",
        points: simulation.discountFactors.map((row) => ({
          x: row.t,
          y: row.shockedYields.parallelDown,
        })),
      },
      {
        label: "Steepener",
        points: simulation.discountFactors.map((row) => ({
          x: row.t,
          y: row.shockedYields.steepener,
        })),
      },
      {
        label: "Flattener",
        points: simulation.discountFactors.map((row) => ({
          x: row.t,
          y: row.shockedYields.flattener,
        })),
      },
      {
        label: "Short up",
        points: simulation.discountFactors.map((row) => ({
          x: row.t,
          y: row.shockedYields.shortRateUp,
        })),
      },
      {
        label: "Short down",
        points: simulation.discountFactors.map((row) => ({
          x: row.t,
          y: row.shockedYields.shortRateDown,
        })),
      },
    ],
  });

  return `
    <section class="panel stack">
      <div class="section-header">
        <div>
          <h2>Discount Factors</h2>
          <p>
            Stress shocks are applied to the bootstrapped curve and converted into shocked yield curves
            and discount-factor tables. All shock-function parameters are editable.
          </p>
        </div>
      </div>
      ${renderShockControls(state.shockParameters)}
      ${chart}
      <div class="panel-grid">
        <section class="panel secondary">
          <div class="section-header compact">
            <div>
              <h3>Stress shock series</h3>
              <p>Scenario shifts as a function of maturity.</p>
            </div>
          </div>
          ${shockTable}
        </section>
        <section class="panel secondary">
          <div class="section-header compact">
            <div>
              <h3>Discount factors</h3>
              <p>Current and stressed discount factors derived from the shifted curves.</p>
            </div>
          </div>
          ${discountTable}
        </section>
      </div>
    </section>
  `;
}

function renderTabs() {
  const tabs = [
    ["data", "Data update"],
    ["yield", "Yield curve"],
    ["bootstrapped", "Bootstrapped curve"],
    ["discount", "Discount factors"],
  ];

  return `
    <div class="tab-bar">
      ${tabs
        .map(
          ([id, label]) => `
            <button class="tab ${state.activeTab === id ? "is-active" : ""}" data-tab="${id}">
              ${escapeHtml(label)}
            </button>
          `,
        )
        .join("")}
    </div>
  `;
}

function renderFeedback() {
  if (state.error) {
    return `<div class="banner error">${escapeHtml(state.error)}</div>`;
  }

  if (state.message) {
    return `<div class="banner success">${escapeHtml(state.message)}</div>`;
  }

  return "";
}

function render() {
  if (!state.datasets) {
    app.innerHTML = `
      <div class="layout">
        <section class="panel">
          <span class="eyebrow">IRRBB simulator</span>
          <h2>Loading workbook seed data...</h2>
          <p>The RO Bonds and ROBOR history is being prepared for the online simulator.</p>
        </section>
      </div>
    `;
    return;
  }

  syncSelectedDate();

  const availableDates = getAvailableDates(state.datasets);
  let simulation = null;
  let simulationError = "";

  if (state.selectedDate) {
    try {
      simulation = calculateSimulatorState(
        state.selectedDate,
        state.datasets,
        state.shockParameters,
      );
    } catch (error) {
      simulationError = error instanceof Error ? error.message : String(error);
    }
  }

  const hero = `
    <header class="hero">
      <div class="hero-copy">
        <span class="eyebrow">IRRBB simulator</span>
        <h1>Romanian yield curves, bootstrapping, and stress shocks in the browser.</h1>
        <p>
          This web simulator mirrors the workbook flow using RO Bonds and ROBOR inputs, adds uploadable
          CSV refreshes, and calibrates the Nelson-Siegel parameters online.
        </p>
      </div>
      <div class="hero-card">
        <label class="date-picker">
          <span>Market date</span>
          <input type="date" value="${escapeHtml(state.selectedDate ?? "")}" />
        </label>
        <div class="hero-meta">
          ${renderPill("Latest overlap", formatDateLabel(availableDates[0]))}
          ${renderPill("Seed timezone", state.datasets.metadata?.calendarTimeZone ?? "Europe/Bucharest")}
          ${renderPill("Stored datasets", `${state.datasets.roBonds.length + state.datasets.robor.length} rows`)}
        </div>
      </div>
    </header>
  `;

  let activePanel = "";

  if (!availableDates.length) {
    activePanel = `
      <section class="panel">
        <h2>No common dates found</h2>
        <p>Upload RO Bonds and ROBOR CSVs that share at least one market date to run the simulator.</p>
      </section>
    `;
  } else if (simulationError) {
    activePanel = `
      <section class="panel">
        <h2>Calculation issue</h2>
        <p>${escapeHtml(simulationError)}</p>
      </section>
    `;
  } else if (state.activeTab === "data") {
    activePanel = renderDataTab(state.datasets, availableDates);
  } else if (state.activeTab === "yield") {
    activePanel = renderYieldCurveTab(simulation);
  } else if (state.activeTab === "bootstrapped") {
    activePanel = renderBootstrappedTab(simulation);
  } else {
    activePanel = renderDiscountFactorsTab(simulation);
  }

  app.innerHTML = `
    <div class="layout">
      ${hero}
      ${renderFeedback()}
      ${renderTabs()}
      ${activePanel}
    </div>
  `;
}

async function handleFileUpload(kind, file) {
  if (!file) {
    state.pendingFiles[kind] = null;
    render();
    return;
  }

  const text = await file.text();
  const rows =
    kind === "roBonds" ? parseRoBondsCsv(text) : parseRoborCsv(text);

  if (!rows.length) {
    throw new Error(`The ${kind === "roBonds" ? "RO Bonds" : "ROBOR"} CSV is empty.`);
  }

  state.pendingFiles[kind] = {
    name: file.name,
    rows,
  };

  setMessage(
    `${kind === "roBonds" ? "RO Bonds" : "ROBOR"} upload parsed successfully with ${rows.length} rows.`,
  );
}

async function onChange(event) {
  const target = event.target;

  if (!(target instanceof HTMLElement)) {
    return;
  }

  if (target.matches('input[type="date"]')) {
    const nextDate = target.value;

    if (!nextDate) {
      return;
    }

    const availableDates = getAvailableDates(state.datasets);

    if (!availableDates.includes(nextDate)) {
      setError("The selected date is not available in both RO Bonds and ROBOR.");
      render();
      return;
    }

    clearFeedback();
    state.selectedDate = nextDate;
    render();
    return;
  }

  if (target.matches("input[data-file-kind]")) {
    const fileKind = target.getAttribute("data-file-kind");
    const file = target instanceof HTMLInputElement ? target.files?.[0] : null;

    try {
      clearFeedback();
      await handleFileUpload(fileKind, file);
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    }

    render();
    return;
  }

  if (target.matches("input[data-shock-path]")) {
    const path = target.getAttribute("data-shock-path");
    const nextValue = Number(target.value);

    if (!path || !Number.isFinite(nextValue)) {
      return;
    }

    const nextParameters = clone(state.shockParameters);
    setNestedValue(nextParameters, path, nextValue);
    state.shockParameters = nextParameters;
    saveShockParameters(nextParameters);
    clearFeedback();
    render();
  }
}

async function onClick(event) {
  const target = event.target;

  if (!(target instanceof HTMLElement)) {
    return;
  }

  const tab = target.getAttribute("data-tab");

  if (tab) {
    state.activeTab = tab;
    render();
    return;
  }

  const action = target.getAttribute("data-action");

  if (action === "apply-uploads") {
    if (!state.pendingFiles.roBonds && !state.pendingFiles.robor) {
      setError("Upload at least one CSV before applying a data refresh.");
      render();
      return;
    }

    state.datasets = buildUploadedDatasets(state.datasets, {
      roBonds: state.pendingFiles.roBonds?.rows,
      robor: state.pendingFiles.robor?.rows,
      roBondsSource: state.pendingFiles.roBonds?.name,
      roborSource: state.pendingFiles.robor?.name,
    });

    saveDatasets(state.datasets);
    state.pendingFiles = { roBonds: null, robor: null };
    syncSelectedDate();
    setMessage("Uploaded CSV data has been applied to the simulator.");
    render();
    return;
  }

  if (action === "reset-data") {
    state.datasets = await resetDatasets();
    state.pendingFiles = { roBonds: null, robor: null };
    syncSelectedDate();
    setMessage("The workbook seed data has been restored.");
    render();
  }
}

app.addEventListener("change", onChange);
app.addEventListener("click", onClick);

render();

loadDatasets()
  .then((datasets) => {
    state.datasets = datasets;
    syncSelectedDate();
    render();
  })
  .catch((error) => {
    setError(
      error instanceof Error ? error.message : "Unable to load the workbook seed data.",
    );
    state.datasets = { metadata: {}, roBonds: [], robor: [] };
    render();
  });
