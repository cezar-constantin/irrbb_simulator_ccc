const DATASETS_STORAGE_KEY = "irrbb-simulator-datasets";
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
        roBonds: datasets.metadata?.source?.roBonds ?? "Workbook seed",
        robor: datasets.metadata?.source?.robor ?? "Workbook seed",
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
  const rawValue = window.localStorage.getItem(DATASETS_STORAGE_KEY);

  if (!rawValue) {
    return getDefaultDatasets();
  }

  try {
    return Promise.resolve(hydrateDatasetMetadata(JSON.parse(rawValue)));
  } catch (error) {
    console.warn("Unable to restore persisted datasets, falling back to defaults.", error);
    return getDefaultDatasets();
  }
}

export function saveDatasets(datasets) {
  window.localStorage.setItem(DATASETS_STORAGE_KEY, JSON.stringify(datasets));
}

export function resetDatasets() {
  return getDefaultDatasets().then((defaults) => {
    saveDatasets(defaults);
    return defaults;
  });
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

export function buildUploadedDatasets(currentDatasets, patch) {
  const nextDatasets = {
    ...currentDatasets,
    ...patch,
    metadata: {
      ...currentDatasets.metadata,
      counts: {
        roBonds: patch.roBonds?.length ?? currentDatasets.roBonds.length,
        robor: patch.robor?.length ?? currentDatasets.robor.length,
      },
      ranges: {
        roBonds: summarizeDataset(patch.roBonds ?? currentDatasets.roBonds),
        robor: summarizeDataset(patch.robor ?? currentDatasets.robor),
      },
      source: {
        roBonds:
          patch.roBondsSource ??
          currentDatasets.metadata?.source?.roBonds ??
          "Workbook seed",
        robor:
          patch.roborSource ??
          currentDatasets.metadata?.source?.robor ??
          "Workbook seed",
        updatedAt: new Date().toISOString(),
      },
    },
  };

  delete nextDatasets.roBondsSource;
  delete nextDatasets.roborSource;

  return nextDatasets;
}
