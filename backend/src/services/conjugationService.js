import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeKey } from "../utils/normalize.js";
import { detectVerbGroup, normalizeSelectedVerbGroups } from "../config/verbGroups.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_FILE = path.resolve(__dirname, "../../../verbes_lowercase.json");

const PERSON_LABELS = ["je", "tu", "il/elle", "nous", "vous", "ils/elles"];

function isSixPersonTense(forms) {
  return Array.isArray(forms) && forms.length === 6 && forms.every((form) => typeof form === "string");
}

function getLemma(entry) {
  return entry?.infinitif?.["présent"]?.[0] ?? "verbe inconnu";
}

function buildTenseIndex(entry) {
  const index = [];

  for (const [moodName, moodValue] of Object.entries(entry)) {
    if (!moodValue || typeof moodValue !== "object") {
      continue;
    }

    for (const [tenseName, forms] of Object.entries(moodValue)) {
      if (!isSixPersonTense(forms)) {
        continue;
      }

      index.push({
        mood: normalizeKey(moodName),
        tense: normalizeKey(tenseName),
        moodRaw: moodName,
        tenseRaw: tenseName,
        forms
      });
    }
  }

  return index;
}

class ConjugationService {
  constructor() {
    this.entries = [];
  }

  load() {
    const raw = fs.readFileSync(DATA_FILE, "utf8");
    const parsed = JSON.parse(raw);

    this.entries = parsed.map((entry) => {
      const lemma = getLemma(entry);
      return {
        lemma,
        tenses: buildTenseIndex(entry)
      };
    }).filter((entry) => entry.tenses.length > 0);
  }

  getStats() {
    return {
      verbs: this.entries.length
    };
  }

  pickQuestion(poolDefinitions, options = {}) {
    if (!Array.isArray(poolDefinitions) || poolDefinitions.length === 0) {
      return null;
    }

    const allowedSet = new Set((options.allowedLemmas ?? []).map((lemma) => normalizeKey(lemma)));
    const selectedVerbGroups = normalizeSelectedVerbGroups(options.verbGroups);
    const selectedGroupSet = new Set(selectedVerbGroups);
    const useGroupFilter = selectedGroupSet.size > 0;
    const useAllowedSet = allowedSet.size > 0;

    const eligible = [];

    for (const verb of this.entries) {
      const normalizedLemma = normalizeKey(verb.lemma);

      if (useAllowedSet && !allowedSet.has(normalizedLemma)) {
        continue;
      }

      if (useGroupFilter && !selectedGroupSet.has(detectVerbGroup(verb.lemma))) {
        continue;
      }

      for (const tense of verb.tenses) {
        const match = poolDefinitions.some((pool) => {
          return tense.mood === normalizeKey(pool.mood) && tense.tense === normalizeKey(pool.tense);
        });

        if (!match) {
          continue;
        }

        for (let personIndex = 0; personIndex < tense.forms.length; personIndex += 1) {
          const candidate = {
            lemma: verb.lemma,
            mood: tense.mood,
            tense: tense.tense,
            moodRaw: tense.moodRaw,
            tenseRaw: tense.tenseRaw,
            personIndex,
            personLabel: PERSON_LABELS[personIndex],
            expected: tense.forms[personIndex]
          };

          eligible.push(candidate);
        }
      }
    }

    if (eligible.length === 0) {
      return null;
    }

    const randomIndex = Math.floor(Math.random() * eligible.length);
    return eligible[randomIndex];
  }
}

export const conjugationService = new ConjugationService();
