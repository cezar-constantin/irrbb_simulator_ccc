import { escapeHtml, formatPercentage } from "./formatters.js";

const palette = [
  "#2f69c7",
  "#2dc3d6",
  "#2397c9",
  "#244c97",
  "#4f8fd8",
  "#1c3568",
  "#66d2df",
];

function buildPath(points, dimensions, xMin, xMax, yMin, yMax) {
  const { width, height, margin } = dimensions;
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const scaleX = (value) =>
    margin.left + ((value - xMin) / (xMax - xMin || 1)) * plotWidth;
  const scaleY = (value) =>
    margin.top + plotHeight - ((value - yMin) / (yMax - yMin || 1)) * plotHeight;

  return points
    .map((point, index) => {
      const x = scaleX(point.x).toFixed(2);
      const y = scaleY(point.y).toFixed(2);
      return `${index === 0 ? "M" : "L"} ${x} ${y}`;
    })
    .join(" ");
}

function buildXTicks(chartSeries, maxTicks = 7) {
  const referencePoints = chartSeries[0]?.points ?? [];

  if (!referencePoints.length) {
    return [];
  }

  if (referencePoints.length <= maxTicks) {
    return referencePoints;
  }

  const tickIndexes = new Set([0, referencePoints.length - 1]);
  const denominator = maxTicks - 1;

  for (let index = 1; index < denominator; index += 1) {
    tickIndexes.add(
      Math.round((index * (referencePoints.length - 1)) / denominator),
    );
  }

  return [...tickIndexes]
    .sort((left, right) => left - right)
    .map((index) => referencePoints[index]);
}

export function renderLineChart({ title, subtitle, series, xAxisTitle = "Maturity (T)" }) {
  const chartSeries = series.filter((entry) => entry.points.length > 1);

  if (!chartSeries.length) {
    return `<div class="empty-chart">No chart data is available for the selected inputs.</div>`;
  }

  const dimensions = {
    width: 960,
    height: 440,
    margin: {
      top: 18,
      right: 20,
      bottom: 64,
      left: 92,
    },
  };
  const { width, height, margin } = dimensions;
  const plotHeight = height - margin.top - margin.bottom;
  const xValues = chartSeries.flatMap((entry) => entry.points.map((point) => point.x));
  const yValues = chartSeries.flatMap((entry) => entry.points.map((point) => point.y));
  const xMin = Math.min(...xValues);
  const xMax = Math.max(...xValues);
  const yMin = Math.min(...yValues);
  const yMax = Math.max(...yValues);
  const padding = Math.max((yMax - yMin) * 0.12, 0.0015);
  const viewYMin = yMin - padding;
  const viewYMax = yMax + padding;
  const horizontalGuides = 5;
  const guideRows = Array.from({ length: horizontalGuides }, (_, index) => {
    const value =
      viewYMax - ((viewYMax - viewYMin) / (horizontalGuides - 1)) * index;
    const y = (margin.top + (plotHeight / (horizontalGuides - 1)) * index).toFixed(2);

    return {
      value,
      y,
    };
  });
  const plotWidth = width - margin.left - margin.right;
  const xTicks = buildXTicks(chartSeries);
  const scaleX = (value) =>
    margin.left + ((value - xMin) / (xMax - xMin || 1)) * plotWidth;

  return `
    <div class="chart-card">
      <div class="chart-header">
        <div>
          <h3>${escapeHtml(title)}</h3>
          <p>${escapeHtml(subtitle)}</p>
        </div>
        <div class="chart-legend">
          ${chartSeries
            .map(
              (entry, index) => `
                <span class="legend-item">
                  <span class="legend-swatch" style="--swatch:${palette[index % palette.length]}"></span>
                  ${escapeHtml(entry.label)}
                </span>
              `,
            )
            .join("")}
        </div>
      </div>
      <div class="chart-shell">
        <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(title)}">
          ${guideRows
            .map(
              (guide) => `
                <line x1="${margin.left}" x2="${width - margin.right}" y1="${guide.y}" y2="${guide.y}" class="chart-grid-line" />
                <text x="${margin.left - 12}" y="${Number(guide.y) + 4}" text-anchor="end" class="chart-axis-label">
                  ${formatPercentage(guide.value, 2)}
                </text>
              `,
            )
            .join("")}
          <line
            x1="${margin.left}"
            x2="${width - margin.right}"
            y1="${height - margin.bottom}"
            y2="${height - margin.bottom}"
            class="chart-axis-line"
          />
          ${xTicks
            .map(
              (point) => `
                <line
                  x1="${scaleX(point.x)}"
                  x2="${scaleX(point.x)}"
                  y1="${height - margin.bottom}"
                  y2="${height - margin.bottom + 8}"
                  class="chart-axis-line"
                />
                <text
                  x="${scaleX(point.x)}"
                  y="${height - margin.bottom + 24}"
                  text-anchor="middle"
                  class="chart-axis-label"
                >
                  ${escapeHtml(point.label ?? String(point.x))}
                </text>
              `,
            )
            .join("")}
          <text
            x="${width / 2}"
            y="${height - 14}"
            text-anchor="middle"
            class="chart-axis-title"
          >
            ${escapeHtml(xAxisTitle)}
          </text>
          ${chartSeries
            .map(
              (entry, index) => `
                <path
                  d="${buildPath(
                    entry.points,
                    dimensions,
                    xMin,
                    xMax,
                    viewYMin,
                    viewYMax,
                  )}"
                  fill="none"
                  stroke="${palette[index % palette.length]}"
                  stroke-width="3"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              `,
            )
            .join("")}
        </svg>
      </div>
    </div>
  `;
}
