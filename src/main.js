import "./styles.css";

import {
  DEFAULT_SHOCK_PARAMETERS,
  calculateSimulatorState,
  getAvailableDates,
} from "./lib/calculator.js";
import {
  loadDatasets,
  loadShockParameters,
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
  selectedScenarios: [
    "parallelUp",
    "parallelDown",
    "steepener",
    "flattener",
    "shortRateUp",
    "shortRateDown",
  ],
  message: "",
  error: "",
};

const STRESS_SCENARIOS = [
  {
    key: "parallelUp",
    label: "Parallel up",
    shockField: "parallelUp",
    yieldField: "parallelUp",
    discountField: "parallelShockUp",
  },
  {
    key: "parallelDown",
    label: "Parallel down",
    shockField: "parallelDown",
    yieldField: "parallelDown",
    discountField: "parallelShockDown",
  },
  {
    key: "steepener",
    label: "Steepener",
    shockField: "steepener",
    yieldField: "steepener",
    discountField: "steepenerShock",
  },
  {
    key: "flattener",
    label: "Flattener",
    shockField: "flattener",
    yieldField: "flattener",
    discountField: "flattenerShock",
  },
  {
    key: "shortRateUp",
    label: "Short up",
    shockField: "shortRateUp",
    yieldField: "shortRateUp",
    discountField: "shortRatesShockUp",
  },
  {
    key: "shortRateDown",
    label: "Short down",
    shockField: "shortRateDown",
    yieldField: "shortRateDown",
    discountField: "shortRatesShockDown",
  },
];

const HISTORY_WINDOWS = [
  { key: "all", label: "Full history", days: null },
  { key: "3m", label: "3M", days: 92 },
  { key: "6m", label: "6M", days: 183 },
  { key: "1y", label: "1Y", days: 366 },
  { key: "2y", label: "2Y", days: 731 },
  { key: "5y", label: "5Y", days: 1827 },
];

const INPUT_HISTORY_CHARTS = {
  roBonds: {
    rowsKey: "roBonds",
    title: "RO Bonds Time Series",
    subtitle:
      "Historical Romanian government bond quotes ending at the selected market date.",
    xAxisTitle: "Date",
    series: [
      { key: "tsBid3Y", label: "3Y Bid" },
      { key: "tsBid5Y", label: "5Y Bid" },
      { key: "tsBid10Y", label: "10Y Bid" },
    ],
  },
  robor: {
    rowsKey: "robor",
    title: "ROBOR Time Series",
    subtitle:
      "Historical ROBOR fixings ending at the selected market date.",
    xAxisTitle: "Date",
    series: [
      { key: "roborTomorrowNext", label: "TN" },
      { key: "robor1W", label: "1W" },
      { key: "robor1M", label: "1M" },
      { key: "robor3M", label: "3M" },
      { key: "robor6M", label: "6M" },
      { key: "robor12M", label: "12M" },
    ],
  },
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

function getNestedValue(target, path) {
  return path.split(".").reduce((cursor, key) => cursor?.[key], target);
}

function getScenarioDefinition(key) {
  return STRESS_SCENARIOS.find((scenario) => scenario.key === key);
}

function buildDefaultHistoryCharts() {
  return Object.fromEntries(
    Object.entries(INPUT_HISTORY_CHARTS).map(([chartKey, config]) => [
      chartKey,
      {
        window: "all",
        series: config.series.map((entry) => entry.key),
      },
    ]),
  );
}

state.historyCharts = buildDefaultHistoryCharts();

function parseDateToTimestamp(value) {
  const [year, month, day] = String(value)
    .split("-")
    .map((part) => Number(part));

  return Date.UTC(year, month - 1, day);
}

function getPreviewWindow(rows, selectedDate, count = 5) {
  const visibleRows = selectedDate
    ? rows.filter((row) => row.date <= selectedDate)
    : rows;

  return visibleRows.slice(0, count);
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

function renderDatasetSummary(label, summary, sourceLabel) {
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
    </div>
  `;
}

function formatRateLabel(value) {
  if (value == null || !Number.isFinite(value)) {
    return "-";
  }

  return `${formatNumber(value, 2)}%`;
}

function getHistoryRows(rows, selectedDate, windowKey) {
  const boundedRows = selectedDate
    ? rows.filter((row) => row.date <= selectedDate)
    : rows;

  if (!boundedRows.length) {
    return [];
  }

  const windowDefinition = HISTORY_WINDOWS.find((entry) => entry.key === windowKey);

  if (!windowDefinition || windowDefinition.days == null) {
    return [...boundedRows].reverse();
  }

  const endTimestamp = parseDateToTimestamp(boundedRows[0].date);
  const windowStart = endTimestamp - windowDefinition.days * 24 * 60 * 60 * 1000;

  return boundedRows
    .filter((row) => parseDateToTimestamp(row.date) >= windowStart)
    .reverse();
}

function renderHistoryControls(chartKey, selection, config) {
  return `
    <div class="chart-controls">
      <label class="field chart-control-field">
        <span>Time window</span>
        <select data-history-window="${escapeHtml(chartKey)}">
          ${HISTORY_WINDOWS.map(
            (window) => `
              <option value="${escapeHtml(window.key)}" ${
                selection.window === window.key ? "selected" : ""
              }>
                ${escapeHtml(window.label)}
              </option>
            `,
          ).join("")}
        </select>
      </label>
      <div class="chart-series-picker">
        <span class="label">Visible series</span>
        <div class="chart-series-options">
          ${config.series
            .map(
              (entry) => `
                <label class="chart-series-option">
                  <input
                    type="checkbox"
                    data-history-chart="${escapeHtml(chartKey)}"
                    data-history-series="${escapeHtml(entry.key)}"
                    ${selection.series.includes(entry.key) ? "checked" : ""}
                  />
                  <span>${escapeHtml(entry.label)}</span>
                </label>
              `,
            )
            .join("")}
        </div>
      </div>
    </div>
  `;
}

function renderInputHistoryChart(chartKey, datasets, selectedDate) {
  const config = INPUT_HISTORY_CHARTS[chartKey];
  const selection = state.historyCharts[chartKey];
  const rows = getHistoryRows(datasets[config.rowsKey], selectedDate, selection.window);
  const series = config.series
    .filter((entry) => selection.series.includes(entry.key))
    .map((entry) => ({
      label: entry.label,
      points: rows
        .filter((row) => Number.isFinite(row[entry.key]))
        .map((row) => ({
          x: parseDateToTimestamp(row.date),
          y: row[entry.key],
          label: row.date,
        })),
    }));

  return renderLineChart({
    title: config.title,
    subtitle: `${config.subtitle} Use the controls to shorten the horizon or hide individual series.`,
    xAxisTitle: config.xAxisTitle,
    formatYValue: formatRateLabel,
    formatXTick: (point) => formatDateLabel(point.label),
    emptyMessage: "Select at least one series to display the historical time series.",
    controlsHtml: renderHistoryControls(chartKey, selection, config),
    series,
  });
}

function renderPreviewTables(datasets, selectedDate) {
  const roBondsPreview = getPreviewWindow(datasets.roBonds, selectedDate);
  const roborPreview = getPreviewWindow(datasets.robor, selectedDate);

  return `
    <div class="panel-grid">
      <section class="panel">
        <div class="section-header compact">
          <div>
            <h3>RO Bonds Preview</h3>
            <p>Last 5 available bond dates at or before the selected market date.</p>
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
            <p>Last 5 available ROBOR dates at or before the selected market date.</p>
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
          <h2>Input Data</h2>
          <p>
            The simulator is built on integrated ROBOR and Romanian Bonds history. The bundled market
            series extends from the workbook seed through March 2026, so the analytics run directly on
            the built-in data without manual uploads.
          </p>
        </div>
        <div class="metric-pills">
          ${renderPill("Common dates", String(availableDates.length))}
          ${renderPill("Active market date", formatDateLabel(state.selectedDate))}
        </div>
      </div>
      <div class="panel-grid">
        ${renderDatasetSummary(
          "RO Bonds",
          roBondsSummary,
          datasets.metadata?.source?.roBonds ?? "Bundled historical series",
        )}
        ${renderDatasetSummary(
          "ROBOR",
          roborSummary,
          datasets.metadata?.source?.robor ?? "Bundled historical series",
        )}
      </div>
      ${renderPreviewTables(datasets, state.selectedDate)}
      <div class="panel-grid">
        ${renderInputHistoryChart("roBonds", datasets, state.selectedDate)}
        ${renderInputHistoryChart("robor", datasets, state.selectedDate)}
      </div>
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
          row.coupon == null ? "-" : escapeHtml(formatPercentage(row.coupon, 3)),
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
    subtitle: "Select a new date to update the yield curve",
    xAxisTitle: "Time to maturity",
    series: [
      {
        label: "Yield curve",
        points: simulation.yieldCurve.map((row) => ({
          x: row.t,
          y: row.yieldCurve,
          label: row.maturity,
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
            In this section we show how the market rates from the Robor and Romanian Bonds market can
            be used to bootstrap a yield curve for the Romanian RON.
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
          row.error == null ? "-" : escapeHtml(formatDecimal(row.error, 6)),
      },
    ],
    simulation.bootstrappedCurve,
  );

  const chart = renderLineChart({
    title: "Bootstrapped vs calibrated curve",
    subtitle:
      "Observed zero rates are matched with a four-parameter Nelson-Siegel fit and extended to 30 years.",
    xAxisTitle: "Time to maturity",
    series: [
      {
        label: "Observed curve",
        points: simulation.yieldCurve.map((row) => ({
          x: row.t,
          y: row.yieldCurve,
          label: row.maturity,
        })),
      },
      {
        label: "Calibrated curve",
        points: simulation.bootstrappedCurve.map((row) => ({
          x: row.t,
          y: row.interpolatedYield,
          label: row.maturity,
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
            In this section we show a continous version of the yield curve, based on a interpolated
            function with 5 parameters.
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

function renderScenarioSelector(selectedScenarios) {
  return `
    <details class="scenario-picker">
      <summary>
        Stress scenarios
        <span>${selectedScenarios.length} selected</span>
      </summary>
      <div class="scenario-options">
        ${STRESS_SCENARIOS.map(
          (scenario) => `
            <label class="scenario-option">
              <input
                data-scenario-key="${escapeHtml(scenario.key)}"
                type="checkbox"
                ${selectedScenarios.includes(scenario.key) ? "checked" : ""}
              />
              <span>${escapeHtml(scenario.label)}</span>
            </label>
          `,
        ).join("")}
      </div>
    </details>
  `;
}

function renderShockControls(parameters, selectedScenarios) {
  const groups = [
    {
      title: "Parallel shifts",
      fields: [
        {
          path: "parallel.up",
          label: "Up shock",
          show: () => selectedScenarios.includes("parallelUp"),
        },
        {
          path: "parallel.down",
          label: "Down shock",
          show: () => selectedScenarios.includes("parallelDown"),
        },
      ],
    },
    {
      title: "Steepener",
      fields: [
        { path: "steepener.shortWeight", label: "Short weight", show: () => selectedScenarios.includes("steepener") },
        { path: "steepener.shortAmplitude", label: "Short amplitude", show: () => selectedScenarios.includes("steepener") },
        { path: "steepener.longWeight", label: "Long weight", show: () => selectedScenarios.includes("steepener") },
        { path: "steepener.longAmplitude", label: "Long amplitude", show: () => selectedScenarios.includes("steepener") },
        { path: "steepener.decay", label: "Decay", show: () => selectedScenarios.includes("steepener") },
      ],
    },
    {
      title: "Flattener",
      fields: [
        { path: "flattener.shortWeight", label: "Short weight", show: () => selectedScenarios.includes("flattener") },
        { path: "flattener.shortAmplitude", label: "Short amplitude", show: () => selectedScenarios.includes("flattener") },
        { path: "flattener.longWeight", label: "Long weight", show: () => selectedScenarios.includes("flattener") },
        { path: "flattener.longAmplitude", label: "Long amplitude", show: () => selectedScenarios.includes("flattener") },
        { path: "flattener.decay", label: "Decay", show: () => selectedScenarios.includes("flattener") },
      ],
    },
    {
      title: "Short-rate shocks",
      fields: [
        {
          path: "shortRate.upAmplitude",
          label: "Up amplitude",
          show: () => selectedScenarios.includes("shortRateUp"),
        },
        {
          path: "shortRate.downAmplitude",
          label: "Down amplitude",
          show: () => selectedScenarios.includes("shortRateDown"),
        },
        {
          path: "shortRate.decay",
          label: "Decay",
          show: () =>
            selectedScenarios.includes("shortRateUp") ||
            selectedScenarios.includes("shortRateDown"),
        },
      ],
    },
  ]
    .map((group) => ({
      ...group,
      fields: group.fields.filter((field) => field.show()),
    }))
    .filter((group) => group.fields.length);

  if (!groups.length) {
    return `
      <div class="callout">
        <strong>No stress scenario selected.</strong>
        Choose one or more scenarios from the dropdown to display the relevant controls and charts.
      </div>
    `;
  }

  return `
    <div class="panel-grid">
      ${groups
        .map(
          (group) => `
            <section class="panel secondary">
              <div class="section-header compact">
                <div>
                  <h3>${escapeHtml(group.title)}</h3>
                  <p>Editable parameters feeding the selected stress-shock functions.</p>
                </div>
              </div>
              <div class="field-grid">
                ${group.fields
                  .map(
                    (field) => `
                      <label class="field">
                        <span>${escapeHtml(field.label)}</span>
                        <input
                          data-shock-path="${escapeHtml(field.path)}"
                          type="number"
                          step="0.0001"
                          value="${escapeHtml(String(getNestedValue(parameters, field.path)))}"
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
  const selectedScenarioDefinitions = state.selectedScenarios
    .map((key) => getScenarioDefinition(key))
    .filter(Boolean);
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
      ...selectedScenarioDefinitions.map((scenario) => ({
        label: scenario.label,
        render: (row) => escapeHtml(formatPercentage(row[scenario.shockField], 3)),
      })),
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
      ...selectedScenarioDefinitions.map((scenario) => ({
        label: scenario.label,
        render: (row) => escapeHtml(formatDecimal(row[scenario.discountField], 6)),
      })),
    ],
    simulation.discountFactors,
  );

  const shockedYieldChart = renderLineChart({
    title: "Shocked yield curves",
    subtitle:
      "Base bootstrapped yields shifted by the selected stress-shock functions.",
    xAxisTitle: "Time to maturity",
    series: [
      {
        label: "Current",
        points: simulation.discountFactors.map((row) => ({
          x: row.t,
          y: row.shockedYields.current,
          label: row.maturity,
        })),
      },
      ...selectedScenarioDefinitions.map((scenario) => ({
        label: scenario.label,
        points: simulation.discountFactors.map((row) => ({
          x: row.t,
          y: row.shockedYields[scenario.yieldField],
          label: row.maturity,
        })),
      })),
    ],
  });

  const discountFactorsChart = renderLineChart({
    title: "Shocked discount factors",
    subtitle:
      "Current discount factors and the selected stressed discount-factor curves over the maturity axis.",
    xAxisTitle: "Time to maturity",
    series: [
      {
        label: "Current",
        points: simulation.discountFactors.map((row) => ({
          x: row.t,
          y: row.currentDiscountFactor,
          label: row.maturity,
        })),
      },
      ...selectedScenarioDefinitions.map((scenario) => ({
        label: scenario.label,
        points: simulation.discountFactors.map((row) => ({
          x: row.t,
          y: row[scenario.discountField],
          label: row.maturity,
        })),
      })),
    ],
  });

  return `
    <section class="panel stack">
      <div class="section-header">
        <div>
          <h2>Stress Tests</h2>
          <p>
            Choose one or more stress scenarios, adjust only the relevant parameters, and review the
            resulting shocked yield curves and discount factors.
          </p>
        </div>
      </div>
      ${renderScenarioSelector(state.selectedScenarios)}
      ${renderShockControls(state.shockParameters, state.selectedScenarios)}
      <div class="panel-grid">
        ${shockedYieldChart}
        ${discountFactorsChart}
      </div>
      <div class="panel-grid">
        <section class="panel secondary">
          <div class="section-header compact">
            <div>
              <h3>Stress shock series</h3>
              <p>Scenario shifts as a function of maturity for the selected stresses.</p>
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
    ["data", "Input data"],
    ["yield", "Yield curve"],
    ["bootstrapped", "Bootstrapped curve"],
    ["discount", "Stress tests"],
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
          <h2>Loading historical market data...</h2>
          <p>The integrated RO Bonds and ROBOR history is being prepared for the simulator.</p>
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
        <h1>Romanian yield curves, bootstrapping, and stress test simulator.</h1>
        <p>
          This web simulator uses Robor and Romanian Bonds inputs, boostraps the yield curve and
          calibrates a continous time version to the observed market quotes.
        </p>
        <p>
          Additionally, stressed discount factors are calculated based on the user input, for
          parallel shifts, steepener, flattener and short up/down scenarios.
        </p>
      </div>
      <div class="hero-card hero-toolbar">
        <label class="date-picker">
          <span>Market date</span>
          <input type="date" value="${escapeHtml(state.selectedDate ?? "")}" />
        </label>
        <div class="hero-meta">
          ${renderPill("Latest overlap", formatDateLabel(availableDates[0]))}
          ${renderPill("Seed timezone", state.datasets.metadata?.calendarTimeZone ?? "Europe/Bucharest")}
          ${renderPill("Historical rows", `${state.datasets.roBonds.length + state.datasets.robor.length} rows`)}
        </div>
      </div>
    </header>
  `;

  let activePanel = "";

  if (!availableDates.length) {
    activePanel = `
      <section class="panel">
        <h2>No common dates found</h2>
        <p>The bundled RO Bonds and ROBOR histories do not currently share a common market date.</p>
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

  if (target.matches("select[data-history-window]")) {
    const chartKey = target.getAttribute("data-history-window");
    const nextWindow = target.value;

    if (!chartKey || !INPUT_HISTORY_CHARTS[chartKey]) {
      return;
    }

    state.historyCharts = {
      ...state.historyCharts,
      [chartKey]: {
        ...state.historyCharts[chartKey],
        window: nextWindow,
      },
    };

    clearFeedback();
    render();
    return;
  }

  if (target.matches("input[data-history-series]")) {
    const chartKey = target.getAttribute("data-history-chart");
    const seriesKey = target.getAttribute("data-history-series");

    if (!chartKey || !seriesKey || !INPUT_HISTORY_CHARTS[chartKey]) {
      return;
    }

    const chartConfig = INPUT_HISTORY_CHARTS[chartKey];
    const nextSeries = chartConfig.series
      .map((entry) => entry.key)
      .filter((key) =>
        key === seriesKey
          ? target.checked
          : state.historyCharts[chartKey].series.includes(key),
      );

    state.historyCharts = {
      ...state.historyCharts,
      [chartKey]: {
        ...state.historyCharts[chartKey],
        series: nextSeries,
      },
    };

    clearFeedback();
    render();
    return;
  }

  if (target.matches("input[data-scenario-key]")) {
    const scenarioKey = target.getAttribute("data-scenario-key");

    if (!scenarioKey) {
      return;
    }

    state.selectedScenarios = STRESS_SCENARIOS
      .map((scenario) => scenario.key)
      .filter((key) =>
        key === scenarioKey
          ? target.checked
          : state.selectedScenarios.includes(key),
      );

    clearFeedback();
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
      error instanceof Error ? error.message : "Unable to load the built-in historical market data.",
    );
    state.datasets = { metadata: {}, roBonds: [], robor: [] };
    render();
  });
