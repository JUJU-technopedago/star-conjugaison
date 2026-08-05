import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import xlsx from "xlsx";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "../..");
const EXCEL_FILE = path.resolve(ROOT_DIR, "base_verbes.xlsx");
const FRONT_CONFIG_DIR = path.resolve(ROOT_DIR, "frontend/src/config");
const BACK_CONFIG_DIR = path.resolve(ROOT_DIR, "backend/src/config");
const LEVEL_ORDER = ["A1", "A2", "B1", "B2", "C1"];
const GROUP_KEYS = ["group1", "group2", "group3"];

const HEADER_ALIASES = {
  INFINITIF: "infinitif",
  NIVEAU: "niveau",
  GROUPE: "groupe",
  PRONOMINAL: "pronominal",
  PARTICIPEPASSE: "participePasse",
  PARTICIPEPRESENT: "participePresent",
  IMPERSONNEL: "impersonnel",
  DEFECTIF: "defectif",
  AUXILIAIRE1: "auxiliaire1",
  AUXILIAIRE2: "auxiliaire2",
  DIFFICULTE: "difficulte",
  ER: "er",
  IR: "ir",
  OIR: "oir",
  ENDRE: "endre",
  EINDRE: "eindre",
  OUDRE: "oudre",
  GER: "ger",
  CER: "cer",
  IER: "ier"
};

function normalizeApostrophes(value) {
  return String(value ?? "").replace(/[’´`]/g, "'");
}

function normalizeHeader(value) {
  return normalizeApostrophes(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function normalizeVerb(value) {
  return normalizeApostrophes(value)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function normalizeAux(value) {
  const normalized = normalizeVerb(value);
  if (!normalized) {
    return "";
  }
  return normalized
    .replace(/\betre\b/g, "être")
    .replace(/\bavoir\b/g, "avoir");
}

function parseBoolean(value) {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return value !== 0;
  }

  const normalized = normalizeHeader(value);
  return normalized === "VRAI" || normalized === "TRUE" || normalized === "OUI" || normalized === "1";
}

function parseGroup(value) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? Math.trunc(value) : null;
  }

  const normalized = String(value ?? "").trim();
  const asNumber = Number.parseInt(normalized, 10);
  if (!Number.isNaN(asNumber)) {
    return asNumber;
  }

  return null;
}

function mapGroupKey(groupNumber) {
  if (groupNumber === 1) {
    return "group1";
  }
  if (groupNumber === 2) {
    return "group2";
  }
  return "group3";
}

function toPrintableJson(value) {
  return JSON.stringify(value, null, 2);
}

function buildGroupedLevels(entries) {
  const byLevelGroup = {};

  for (const level of LEVEL_ORDER) {
    byLevelGroup[level] = {
      group1: [],
      group2: [],
      group3: []
    };
  }

  for (const entry of entries) {
    if (!byLevelGroup[entry.niveau]) {
      continue;
    }

    byLevelGroup[entry.niveau][entry.groupKey].push(entry.infinitif);
  }

  for (const level of LEVEL_ORDER) {
    for (const groupKey of GROUP_KEYS) {
      byLevelGroup[level][groupKey] = Array.from(new Set(byLevelGroup[level][groupKey])).sort((a, b) => a.localeCompare(b, "fr"));
    }
  }

  return byLevelGroup;
}

function fileHeader(sourceCount = null) {
  const isoNow = new Date().toISOString();
  const sourceLine = Number.isInteger(sourceCount)
    ? `// Auto-generated from base_verbes.xlsx (${sourceCount} rows)\n`
    : "// Auto-generated from base_verbes.xlsx\n";
  return `${sourceLine}// Generated at ${isoNow}. Do not edit manually.\n`;
}

function generateVerbBaseModule(entries) {
  const verbBase = entries.map((entry) => ({
    infinitif: entry.infinitif,
    niveau: entry.niveau,
    groupe: entry.groupe,
    pronominal: entry.pronominal,
    participePasse: entry.participePasse,
    participePresent: entry.participePresent,
    impersonnel: entry.impersonnel,
    defectif: entry.defectif,
    auxiliaire1: entry.auxiliaire1,
    auxiliaire2: entry.auxiliaire2,
    difficulte: entry.difficulte,
    terminaisons: {
      er: entry.er,
      ir: entry.ir,
      oir: entry.oir,
      endre: entry.endre,
      eindre: entry.eindre,
      oudre: entry.oudre,
      ger: entry.ger,
      cer: entry.cer,
      ier: entry.ier
    }
  }));

  const grouped = buildGroupedLevels(entries);
  const levelAllowed = {};
  for (const level of LEVEL_ORDER) {
    levelAllowed[level] = Array.from(new Set([
      ...grouped[level].group1,
      ...grouped[level].group2,
      ...grouped[level].group3
    ])).sort((a, b) => a.localeCompare(b, "fr"));
  }

  const globalAllowed = Array.from(new Set(entries.map((entry) => entry.infinitif))).sort((a, b) => a.localeCompare(b, "fr"));
  const impersonalLemmas = globalAllowed.filter((lemma) => entries.some((entry) => entry.infinitif === lemma && entry.impersonnel));
  const pronominalLemmas = globalAllowed.filter((lemma) => entries.some((entry) => entry.infinitif === lemma && entry.pronominal));
  const defectiveLemmas = globalAllowed.filter((lemma) => entries.some((entry) => entry.infinitif === lemma && entry.defectif));

  return `${fileHeader(entries.length)}
export const VERB_BASE = ${toPrintableJson(verbBase)};

export const LEVEL_ALLOWED_VERBS = ${toPrintableJson(levelAllowed)};

export const LEVEL_GROUP_ALLOWED_VERBS = ${toPrintableJson(grouped)};

export const GLOBAL_ALLOWED_VERBS = ${toPrintableJson(globalAllowed)};

export const IMPERSONAL_LEMMAS = new Set(${toPrintableJson(impersonalLemmas)});

export const PRONOMINAL_LEMMAS = new Set(${toPrintableJson(pronominalLemmas)});

export const DEFECTIVE_LEMMAS = new Set(${toPrintableJson(defectiveLemmas)});
`;
}

function generateLevelConfigModule(levelKey, includeAllowedExport) {
  const allowedName = `${levelKey}_ALLOWED_VERBS`;
  return `${fileHeader()}
import { LEVEL_GROUP_ALLOWED_VERBS${includeAllowedExport ? ", LEVEL_ALLOWED_VERBS" : ""} } from './verbBase.generated.js';

export const group1verbs = [...LEVEL_GROUP_ALLOWED_VERBS.${levelKey}.group1];
export const group2verbs = [...LEVEL_GROUP_ALLOWED_VERBS.${levelKey}.group2];
export const group3verbs = [...LEVEL_GROUP_ALLOWED_VERBS.${levelKey}.group3];
${includeAllowedExport ? `\nexport const ${allowedName} = [...LEVEL_ALLOWED_VERBS.${levelKey}];\n` : ""}`;
}

function generateAllowedVerbsModule() {
  return `${fileHeader()}
import { GLOBAL_ALLOWED_VERBS as GENERATED_GLOBAL_ALLOWED_VERBS } from './verbBase.generated.js';

export const GLOBAL_ALLOWED_VERBS = [...GENERATED_GLOBAL_ALLOWED_VERBS];
`;
}

function writeConfigSet(targetDir, entries) {
  const verbBaseModule = generateVerbBaseModule(entries);
  fs.writeFileSync(path.join(targetDir, "verbBase.generated.js"), verbBaseModule, "utf8");

  fs.writeFileSync(path.join(targetDir, "a1Verbs.js"), generateLevelConfigModule("A1", false), "utf8");
  fs.writeFileSync(path.join(targetDir, "a2Verbs.js"), generateLevelConfigModule("A2", true), "utf8");
  fs.writeFileSync(path.join(targetDir, "b1Verbs.js"), generateLevelConfigModule("B1", true), "utf8");
  fs.writeFileSync(path.join(targetDir, "b2Verbs.js"), generateLevelConfigModule("B2", true), "utf8");
  fs.writeFileSync(path.join(targetDir, "c1Verbs.js"), generateLevelConfigModule("C1", true), "utf8");
  fs.writeFileSync(path.join(targetDir, "allowedVerbs.js"), generateAllowedVerbsModule(), "utf8");
}

function extractEntries() {
  if (!fs.existsSync(EXCEL_FILE)) {
    throw new Error(`Excel file not found: ${EXCEL_FILE}`);
  }

  const workbook = xlsx.readFile(EXCEL_FILE, { cellDates: false });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    throw new Error("No sheet found in base_verbes.xlsx");
  }

  const sheet = workbook.Sheets[firstSheetName];
  const rawRows = xlsx.utils.sheet_to_json(sheet, { defval: "" });

  const entries = [];

  for (const rawRow of rawRows) {
    const mappedRow = {};

    for (const [header, value] of Object.entries(rawRow)) {
      const normalizedHeader = normalizeHeader(header);
      const mappedField = HEADER_ALIASES[normalizedHeader];
      if (!mappedField) {
        continue;
      }
      mappedRow[mappedField] = value;
    }

    const infinitif = normalizeVerb(mappedRow.infinitif);
    const niveau = String(mappedRow.niveau ?? "").trim().toUpperCase();
    const groupe = parseGroup(mappedRow.groupe);

    if (!infinitif || !LEVEL_ORDER.includes(niveau) || !groupe || groupe < 1 || groupe > 3) {
      continue;
    }

    const pronominalFromColumn = parseBoolean(mappedRow.pronominal);
    const pronominalFromLemma = infinitif.startsWith("se ") || infinitif.startsWith("s'");

    entries.push({
      infinitif,
      niveau,
      groupe,
      groupKey: mapGroupKey(groupe),
      pronominal: pronominalFromColumn || pronominalFromLemma,
      participePasse: normalizeVerb(mappedRow.participePasse),
      participePresent: normalizeVerb(mappedRow.participePresent),
      impersonnel: parseBoolean(mappedRow.impersonnel),
      defectif: parseBoolean(mappedRow.defectif),
      auxiliaire1: normalizeAux(mappedRow.auxiliaire1),
      auxiliaire2: normalizeAux(mappedRow.auxiliaire2),
      difficulte: Number.parseInt(String(mappedRow.difficulte ?? "").trim(), 10) || null,
      er: parseBoolean(mappedRow.er),
      ir: parseBoolean(mappedRow.ir),
      oir: parseBoolean(mappedRow.oir),
      endre: parseBoolean(mappedRow.endre),
      eindre: parseBoolean(mappedRow.eindre),
      oudre: parseBoolean(mappedRow.oudre),
      ger: parseBoolean(mappedRow.ger),
      cer: parseBoolean(mappedRow.cer),
      ier: parseBoolean(mappedRow.ier)
    });
  }

  const deduped = new Map();
  for (const entry of entries) {
    deduped.set(entry.infinitif, entry);
  }

  return Array.from(deduped.values()).sort((a, b) => a.infinitif.localeCompare(b.infinitif, "fr"));
}

function main() {
  const entries = extractEntries();

  if (entries.length === 0) {
    throw new Error("No valid verb entries found in base_verbes.xlsx");
  }

  writeConfigSet(FRONT_CONFIG_DIR, entries);
  writeConfigSet(BACK_CONFIG_DIR, entries);

  console.log(`Verb base synchronized from Excel: ${entries.length} verbs exported.`);
}

main();
