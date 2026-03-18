import fs from "node:fs/promises";
import path from "node:path";
import XLSX from "xlsx";

const workbookPath = path.resolve("Yield curves.xls");
const outputPath = path.resolve("src/data/defaultData.js");

const roBondsColumns = [
  ["tsBid6M", 1],
  ["tsBid12M", 2],
  ["tsBid3Y", 3],
  ["tsBid5Y", 4],
  ["tsBid10Y", 5],
  ["tsAsk6M", 6],
  ["tsAsk12M", 7],
  ["tsAsk3Y", 8],
  ["tsAsk5Y", 9],
  ["tsAsk10Y", 10],
];

const roborColumns = [
  ["robidOvernight", 1],
  ["robidTomorrowNext", 2],
  ["robid1W", 3],
  ["robid1M", 4],
  ["robid3M", 5],
  ["robid6M", 6],
  ["robid9M", 7],
  ["robid12M", 8],
  ["roborOvernight", 9],
  ["roborTomorrowNext", 10],
  ["robor1W", 11],
  ["robor1M", 12],
  ["robor3M", 13],
  ["robor6M", 14],
  ["robor9M", 15],
  ["robor12M", 16],
];

function excelSerialToDate(value) {
  if (typeof value !== "number") {
    return normalizeDate(value);
  }

  return XLSX.SSF.format("yyyy-mm-dd", value);
}

function normalizeDate(value) {
  if (value == null || value === "") {
    return null;
  }

  if (typeof value === "number") {
    return excelSerialToDate(value);
  }

  const text = String(value).trim();

  if (!text) {
    return null;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return text;
  }

  if (/^\d+(\.\d+)?$/.test(text)) {
    return excelSerialToDate(Number(text));
  }

  const parsed = new Date(text);

  if (Number.isNaN(parsed.getTime())) {
    return text;
  }

  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Bucharest",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(parsed);
}

function normalizeNumber(value) {
  if (value == null || value === "") {
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

function extractRows(sheet, columns) {
  const matrix = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    raw: true,
    defval: null,
  });

  const rows = [];

  for (let rowIndex = 8; rowIndex < matrix.length; rowIndex += 1) {
    const row = matrix[rowIndex];
    const date = normalizeDate(row?.[0]);

    if (!date) {
      continue;
    }

    const entry = { date };

    for (const [field, columnIndex] of columns) {
      entry[field] = normalizeNumber(row?.[columnIndex]);
    }

    rows.push(entry);
  }

  return rows;
}

function buildMetadata(roBonds, robor) {
  const availableDates = [...new Set(roBonds.map((row) => row.date))].sort();
  const roborDates = [...new Set(robor.map((row) => row.date))].sort();

  return {
    workbook: "Yield curves.xls",
    generatedAt: new Date().toISOString(),
    calendarTimeZone: "Europe/Bucharest",
    counts: {
      roBonds: roBonds.length,
      robor: robor.length,
    },
    ranges: {
      roBonds: {
        first: availableDates[0] ?? null,
        last: availableDates.at(-1) ?? null,
      },
      robor: {
        first: roborDates[0] ?? null,
        last: roborDates.at(-1) ?? null,
      },
    },
  };
}

async function main() {
  const workbook = XLSX.readFile(workbookPath, {
    cellFormula: false,
    cellNF: false,
    cellStyles: false,
    raw: true,
  });

  const roBonds = extractRows(workbook.Sheets["RO Bonds"], roBondsColumns);
  const robor = extractRows(workbook.Sheets.Robor, roborColumns);
  const metadata = buildMetadata(roBonds, robor);

  const moduleSource = `export const defaultDatasets = ${JSON.stringify(
    { metadata, roBonds, robor },
    null,
    2,
  )};\n`;

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, moduleSource, "utf8");

  console.log(
    `Generated ${path.relative(process.cwd(), outputPath)} with ${roBonds.length} RO Bonds rows and ${robor.length} ROBOR rows.`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
