const BUCHAREST_DATE_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Bucharest",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function normalizeKey(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function detectDelimiter(sample) {
  const candidates = [",", ";", "\t", "|"];
  const rows = sample.split(/\r?\n/).slice(0, 12);
  let bestDelimiter = ",";
  let bestScore = -1;

  for (const delimiter of candidates) {
    const score = rows.reduce((total, row) => {
      const matches = row.match(new RegExp(`\\${delimiter}`, "g"));
      return total + (matches?.length ?? 0);
    }, 0);

    if (score > bestScore) {
      bestScore = score;
      bestDelimiter = delimiter;
    }
  }

  return bestDelimiter;
}

export function parseCsv(text) {
  const delimiter = detectDelimiter(text);
  const rows = [];
  let row = [];
  let value = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    const nextCharacter = text[index + 1];

    if (character === "\"") {
      if (inQuotes && nextCharacter === "\"") {
        value += "\"";
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }

      continue;
    }

    if (!inQuotes && character === delimiter) {
      row.push(value);
      value = "";
      continue;
    }

    if (!inQuotes && (character === "\n" || character === "\r")) {
      if (character === "\r" && nextCharacter === "\n") {
        index += 1;
      }

      row.push(value);
      rows.push(row);
      row = [];
      value = "";
      continue;
    }

    value += character;
  }

  if (value !== "" || row.length) {
    row.push(value);
    rows.push(row);
  }

  return rows.filter((csvRow) =>
    csvRow.some((cell) => String(cell ?? "").trim().length > 0),
  );
}

export function normalizeDate(value) {
  if (value == null) {
    return null;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    const epoch = Math.round((value - 25569) * 86400 * 1000);
    return BUCHAREST_DATE_FORMATTER.format(new Date(epoch));
  }

  const text = String(value).trim();

  if (!text) {
    return null;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return text;
  }

  if (/^\d+(\.\d+)?$/.test(text)) {
    return normalizeDate(Number(text));
  }

  const parsed = new Date(text);

  if (Number.isNaN(parsed.getTime())) {
    const dateMatch = text.match(/(\d{4}-\d{2}-\d{2})/);
    return dateMatch?.[1] ?? null;
  }

  return BUCHAREST_DATE_FORMATTER.format(parsed);
}

export function normalizeNumber(value) {
  if (value == null) {
    return null;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  const text = String(value).trim();

  if (!text || text === "-") {
    return null;
  }

  const cleaned = text.replace(/%/g, "").replace(/\s+/g, "").replace(",", ".");
  const numeric = Number(cleaned);

  return Number.isFinite(numeric) ? numeric : null;
}

function findHeaderRow(rows, aliasesByField) {
  let bestMatch = null;

  rows.forEach((row, rowIndex) => {
    const fieldColumns = {};
    let matchCount = 0;

    row.forEach((cell, columnIndex) => {
      const normalizedCell = normalizeKey(cell);

      for (const [field, aliases] of Object.entries(aliasesByField)) {
        if (fieldColumns[field] != null) {
          continue;
        }

        if (aliases.some((alias) => alias === normalizedCell)) {
          fieldColumns[field] = columnIndex;
          matchCount += 1;
        }
      }
    });

    if (!bestMatch || matchCount > bestMatch.matchCount) {
      bestMatch = { rowIndex, fieldColumns, matchCount };
    }
  });

  return bestMatch && bestMatch.matchCount >= 4 ? bestMatch : null;
}

function extractTypedRows(rows, aliasesByField, requiredFields) {
  const header = findHeaderRow(rows, aliasesByField);

  if (!header) {
    throw new Error("Could not identify the expected header row in the CSV.");
  }

  const missingRequired = requiredFields.filter(
    (field) => header.fieldColumns[field] == null,
  );

  if (missingRequired.length) {
    throw new Error(`Missing required columns: ${missingRequired.join(", ")}.`);
  }

  const typedRows = [];

  for (let rowIndex = header.rowIndex + 1; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex];
    const date = normalizeDate(row?.[header.fieldColumns.date]);

    if (!date) {
      continue;
    }

    const entry = { date };
    let hasAnyNumericValue = false;

    for (const [field, columnIndex] of Object.entries(header.fieldColumns)) {
      if (field === "date" || columnIndex == null) {
        continue;
      }

      const numericValue = normalizeNumber(row?.[columnIndex]);
      entry[field] = numericValue;
      hasAnyNumericValue ||= numericValue != null;
    }

    if (hasAnyNumericValue) {
      typedRows.push(entry);
    }
  }

  return typedRows.sort((left, right) => right.date.localeCompare(left.date));
}

const RO_BONDS_ALIASES = {
  date: ["data", "date"],
  tsBid6M: ["tsbid6luni", "tsfz6mbid"],
  tsBid12M: ["tsbid12luni", "tsfz12mbid"],
  tsBid3Y: ["tsbid3ani", "tsfz3ybid"],
  tsBid5Y: ["tsbid5ani", "tsfz5ybid"],
  tsBid10Y: ["tsbid10ani", "tsfz10ybid"],
  tsAsk6M: ["tsask6luni", "tsfz6mask"],
  tsAsk12M: ["tsask12luni", "tsfz12mask"],
  tsAsk3Y: ["tsask3ani", "tsfz3yask"],
  tsAsk5Y: ["tsask5ani", "tsfz5yask"],
  tsAsk10Y: ["tsask10ani", "tsfz10yask"],
};

const ROBOR_ALIASES = {
  date: ["date", "data"],
  robidOvernight: ["robidovernight", "bbzbidon"],
  robidTomorrowNext: ["robidtomorrownext", "bbzbidtm"],
  robid1W: ["robid1w", "bbzbid1w"],
  robid1M: ["robid1m", "bbzbid1m"],
  robid3M: ["robid3m", "bbzbid3m"],
  robid6M: ["robid6m", "bbzbid6m"],
  robid9M: ["robid9m", "bbzbid9m"],
  robid12M: ["robid12m", "bbzbid12m"],
  roborOvernight: ["roborovernight", "bbzboron"],
  roborTomorrowNext: ["robortomorrownext", "bbzbortm"],
  robor1W: ["robor1w", "bbzbor1w"],
  robor1M: ["robor1m", "bbzbor1m"],
  robor3M: ["robor3m", "bbzbor3m"],
  robor6M: ["robor6m", "bbzbor6m"],
  robor9M: ["robor9m", "bbzbor9m"],
  robor12M: ["robor12m", "bbzbor12m"],
};

export function parseRoBondsCsv(text) {
  return extractTypedRows(parseCsv(text), RO_BONDS_ALIASES, [
    "date",
    "tsBid3Y",
    "tsBid5Y",
    "tsBid10Y",
  ]);
}

export function parseRoborCsv(text) {
  return extractTypedRows(parseCsv(text), ROBOR_ALIASES, [
    "date",
    "roborTomorrowNext",
    "robor1W",
    "robor1M",
    "robor3M",
    "robor6M",
    "robor12M",
  ]);
}
