export function formatPercentage(value, digits = 4) {
  if (value == null || !Number.isFinite(value)) {
    return "—";
  }

  return `${(value * 100).toFixed(digits)}%`;
}

export function formatShift(value, digits = 2) {
  if (value == null || !Number.isFinite(value)) {
    return "—";
  }

  return `${(value * 100).toFixed(digits)} bp`;
}

export function formatDecimal(value, digits = 6) {
  if (value == null || !Number.isFinite(value)) {
    return "—";
  }

  return value.toFixed(digits);
}

export function formatNumber(value, digits = 6) {
  if (value == null || !Number.isFinite(value)) {
    return "—";
  }

  return value.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function formatDateLabel(value) {
  if (!value) {
    return "—";
  }

  const parsed = new Date(`${value}T00:00:00`);

  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleDateString("en-GB", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
}

export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#039;");
}
