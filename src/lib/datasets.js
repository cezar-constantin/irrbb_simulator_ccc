const SHOCKS_STORAGE_KEY = "irrbb-simulator-shocks";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function hydrateDatasetMetadata(datasets) {
  return {
    ...datasets,
    metadata: {
      ...datasets.metadata,
      source: {
        roBonds: datasets.metadata?.source?.roBonds ?? "Information sourced from www.bnr.ro",
        robor: datasets.metadata?.source?.robor ?? "Information sourced from www.bnr.ro",
        updatedAt: datasets.metadata?.source?.updatedAt ?? null,
      },
    },
  };
}

export function getDefaultDatasets() {
  return import("../data/defaultData.js").then(({ defaultDatasets }) =>
    hydrateDatasetMetadata(clone(defaultDatasets)),
  );
}

export function loadDatasets() {
  return getDefaultDatasets();
}

export function loadShockParameters(defaultValue) {
  const rawValue = window.localStorage.getItem(SHOCKS_STORAGE_KEY);

  if (!rawValue) {
    return clone(defaultValue);
  }

  try {
    return {
      ...clone(defaultValue),
      ...JSON.parse(rawValue),
    };
  } catch (error) {
    console.warn("Unable to restore shock parameters, falling back to defaults.", error);
    return clone(defaultValue);
  }
}

export function saveShockParameters(parameters) {
  window.localStorage.setItem(SHOCKS_STORAGE_KEY, JSON.stringify(parameters));
}

export function summarizeDataset(rows) {
  const dates = rows.map((row) => row.date).sort();

  return {
    count: rows.length,
    first: dates[0] ?? null,
    last: dates.at(-1) ?? null,
  };
}
