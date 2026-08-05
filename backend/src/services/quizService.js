import crypto from "node:crypto";
import { LEVEL_ORDER, LEVEL_RULES } from "../config/cecrl.js";
import { GLOBAL_ALLOWED_VERBS } from "../config/allowedVerbs.js";
import { PRONOMINAL_LEMMAS } from "../config/verbBase.generated.js";
import { normalizeKey, normalizeText } from "../utils/normalize.js";
import { conjugationService } from "./conjugationService.js";

const QUESTION_TTL_MS = 1000 * 60 * 10;
const questionStore = new Map();
const DEFAULT_MODE = "trouver_conjugaison";
const NORMALIZED_PRONOMINAL_LEMMAS = new Set(Array.from(PRONOMINAL_LEMMAS, (lemma) => normalizeKey(lemma)));

const GAME_MODES = {
  trouver_conjugaison: {
    label: "Trouver la conjugaison"
  },
  battre_la_montre: {
    label: "Battre la montre",
    timeLimitSeconds: 12
  },
  trouver_le_temps: {
    label: "Trouver le temps"
  },
  trouver_infinitif: {
    label: "Trouver l'infinitif"
  }
};
const AUXILIARY_CONJUGATIONS = {
  avoir: {
    present: ["ai", "as", "a", "avons", "avez", "ont"],
    imparfait: ["avais", "avais", "avait", "avions", "aviez", "avaient"],
    passeSimple: ["eus", "eus", "eut", "eûmes", "eûtes", "eurent"],
    futurSimple: ["aurai", "auras", "aura", "aurons", "aurez", "auront"],
    subjonctifPresent: ["aie", "aies", "ait", "ayons", "ayez", "aient"],
    subjonctifImparfait: ["eusse", "eusses", "eût", "eussions", "eussiez", "eussent"],
    conditionnelPresent: ["aurais", "aurais", "aurait", "aurions", "auriez", "auraient"]
  },
  etre: {
    present: ["suis", "es", "est", "sommes", "êtes", "sont"],
    imparfait: ["étais", "étais", "était", "étions", "étiez", "étaient"],
    passeSimple: ["fus", "fus", "fut", "fûmes", "fûtes", "furent"],
    futurSimple: ["serai", "seras", "sera", "serons", "serez", "seront"],
    subjonctifPresent: ["sois", "sois", "soit", "soyons", "soyez", "soient"],
    subjonctifImparfait: ["fusse", "fusses", "fût", "fussions", "fussiez", "fussent"],
    conditionnelPresent: ["serais", "serais", "serait", "serions", "seriez", "seraient"]
  }
};
const COMPOUND_TENSE_BASES = {
  "indicatif:passe compose": "present",
  "indicatif:plus que parfait": "imparfait",
  "indicatif:passe anterieur": "passeSimple",
  "indicatif:futur anterieur": "futurSimple",
  "subjonctif:passe": "subjonctifPresent",
  "subjonctif:plus que parfait": "subjonctifImparfait",
  "conditionnel:passe 1ere forme": "conditionnelPresent",
  "conditionnel:passe 2eme forme": "subjonctifImparfait"
};
const ETRE_AUXILIARY_LEMMAS = new Set([
  "aller",
  "arriver",
  "parvenir",
  "descendre",
  "devenir",
  "entrer",
  "monter",
  "mourir",
  "naître",
  "partir",
  "passer",
  "rentrer",
  "rester",
  "retourner",
  "revenir",
  "sortir",
  "tomber",
  "venir"
]);
const DUAL_AUXILIARY_BASE_LEMMAS = ["entrer", "sortir", "retourner", "passer", "monter", "descendre"];
const REFLEXIVE_PRONOUN_BY_PERSON = {
  je: { full: "me", elided: "m'" },
  tu: { full: "te", elided: "t'" },
  "il/elle": { full: "se", elided: "s'" },
  nous: { full: "nous", elided: "nous" },
  vous: { full: "vous", elided: "vous" },
  "ils/elles": { full: "se", elided: "s'" }
};

function cleanExpiredQuestions() {
  const now = Date.now();
  for (const [id, value] of questionStore.entries()) {
    if (now - value.createdAt > QUESTION_TTL_MS) {
      questionStore.delete(id);
    }
  }
}

function ensureLevel(level) {
  if (LEVEL_RULES[level]) {
    return level;
  }
  return "A1";
}

function ensureMode(mode) {
  if (mode && GAME_MODES[mode]) {
    return mode;
  }
  return DEFAULT_MODE;
}

function expandReflexiveVariants(lemmas) {
  const expanded = new Set();

  for (const lemma of lemmas) {
    expanded.add(lemma);

    const normalized = normalizeKey(lemma);
    if (normalized.startsWith("se ")) {
      expanded.add(lemma.slice(3));
    }

    if (normalized.startsWith("s'")) {
      expanded.add(lemma.slice(2));
    }
  }

  return Array.from(expanded);
}

function expandGloballyAllowedVerbs() {
  return expandReflexiveVariants(GLOBAL_ALLOWED_VERBS);
}

function normalizeSpaces(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

function startsWithVowelOrH(word) {
  return /^[aeiouyhàâäéèêëîïôöùûüœ]/i.test(String(word ?? "").trim());
}

function maybeAddAgreementVariants(participle, usesEtre) {
  if (!usesEtre) {
    return [participle];
  }

  const variants = new Set([participle]);
  if (!/[sx]$/i.test(participle)) {
    variants.add(`${participle}e`);
    variants.add(`${participle}s`);
    variants.add(`${participle}es`);
  } else if (/[^sx]s$/i.test(participle)) {
    const base = participle.slice(0, -1);
    variants.add(base);
    variants.add(`${base}e`);
    variants.add(`${base}es`);
  }

  return Array.from(variants);
}

function isReflexiveLemma(normalizedLemma) {
  return normalizedLemma.startsWith("se ") || normalizedLemma.startsWith("s'");
}

function isPronominalLemma(lemma) {
  const normalizedLemma = normalizeKey(lemma);
  return (
    NORMALIZED_PRONOMINAL_LEMMAS.has(normalizedLemma) ||
    NORMALIZED_PRONOMINAL_LEMMAS.has(`se ${normalizedLemma}`) ||
    isReflexiveLemma(normalizedLemma)
  );
}

function getDisplayLemma(lemma) {
  const rawLemma = String(lemma ?? "").trim().toLocaleLowerCase("fr-FR");
  const normalizedLemma = normalizeKey(rawLemma);

  if (isReflexiveLemma(normalizedLemma)) {
    return rawLemma;
  }

  if (NORMALIZED_PRONOMINAL_LEMMAS.has(`se ${normalizedLemma}`)) {
    return `se ${rawLemma}`;
  }

  return rawLemma;
}

function isDualAuxiliaryLemma(lemma) {
  const normalizedLemma = normalizeKey(lemma);
  if (isReflexiveLemma(normalizedLemma)) {
    return false;
  }

  return DUAL_AUXILIARY_BASE_LEMMAS.some((baseLemma) => {
    return normalizedLemma === baseLemma || normalizedLemma.endsWith(baseLemma);
  });
}

function getReflexivePronounForms(personLabel, nextWord) {
  const pronoun = REFLEXIVE_PRONOUN_BY_PERSON[personLabel];
  if (!pronoun) {
    return [];
  }

  if (pronoun.full === pronoun.elided) {
    return [pronoun.full];
  }

  return startsWithVowelOrH(nextWord) ? [pronoun.elided] : [pronoun.full];
}

function addReflexiveSequence(answers, reflexivePronoun, chunks) {
  const tail = chunks.join(" ");
  if (reflexivePronoun.endsWith("'")) {
    answers.add(normalizeSpaces(`${reflexivePronoun}${tail}`));
    return;
  }

  answers.add(normalizeSpaces(`${reflexivePronoun} ${tail}`));
}

function buildPronominalImperativeAnswers(verbForm, personLabel) {
  if (personLabel === "tu") {
    return [`${verbForm}-toi`];
  }

  if (personLabel === "nous") {
    return [`${verbForm}-nous`];
  }

  if (personLabel === "vous") {
    return [`${verbForm}-vous`];
  }

  return [];
}

function getAuxiliaryKeys(lemma) {
  const normalizedLemma = normalizeKey(lemma);
  if (isPronominalLemma(normalizedLemma)) {
    return ["etre"];
  }

  if (isDualAuxiliaryLemma(normalizedLemma)) {
    return ["etre", "avoir"];
  }

  return ETRE_AUXILIARY_LEMMAS.has(normalizedLemma) ? ["etre"] : ["avoir"];
}

function getCompoundTenseBase(moodRaw, tenseRaw) {
  return COMPOUND_TENSE_BASES[`${normalizeKey(moodRaw)}:${normalizeKey(tenseRaw)}`] ?? null;
}

function buildExpectedAnswers(selected) {
  const compoundBase = getCompoundTenseBase(selected.moodRaw, selected.tenseRaw);
  const pronominal = isPronominalLemma(selected.lemma);

  if (!compoundBase && pronominal) {
    const baseForm = normalizeSpaces(selected.expected);
    if (selected.mood === "imperatif") {
      const imperativeAnswers = buildPronominalImperativeAnswers(baseForm, selected.personLabel);
      if (imperativeAnswers.length > 0) {
        return imperativeAnswers;
      }
    }

    const pronounForms = getReflexivePronounForms(selected.personLabel, baseForm);
    const answers = new Set();
    for (const pronoun of pronounForms) {
      addReflexiveSequence(answers, pronoun, [baseForm]);
    }

    return answers.size > 0 ? Array.from(answers) : [baseForm];
  }

  if (!compoundBase) {
    return [normalizeSpaces(selected.expected)];
  }

  const normalizedParticiple = normalizeSpaces(selected.expected);
  const answers = new Set();
  const auxiliaryKeys = getAuxiliaryKeys(selected.lemma);

  for (const auxiliaryKey of auxiliaryKeys) {
    const auxiliaryForms = AUXILIARY_CONJUGATIONS[auxiliaryKey]?.[compoundBase];
    if (!auxiliaryForms) {
      continue;
    }

    const auxiliaryForm = auxiliaryForms[selected.personIndex];
    const participleVariants = maybeAddAgreementVariants(normalizedParticiple, auxiliaryKey === "etre");

    for (const participle of participleVariants) {
      if (pronominal) {
        const pronounForms = getReflexivePronounForms(selected.personLabel, auxiliaryForm);
        for (const pronoun of pronounForms) {
          addReflexiveSequence(answers, pronoun, [auxiliaryForm, participle]);
        }
        continue;
      }

      answers.add(normalizeSpaces(`${auxiliaryForm} ${participle}`));
    }
  }

  return answers.size > 0 ? Array.from(answers) : [normalizedParticiple];
}

function buildQuestionByMode(mode, selected) {
  const displayLemma = getDisplayLemma(selected.lemma);

  if (mode === "trouver_le_temps") {
    return {
      prompt: `Trouve le temps de "${selected.expected}" (${selected.personLabel}) pour ${displayLemma}`,
      expected: selected.tenseRaw,
      matchStrategy: "key",
      details: {
        conjugatedForm: selected.expected,
        person: selected.personLabel,
        displayLemma
      }
    };
  }

  if (mode === "trouver_infinitif") {
    return {
      prompt: `Trouve l'infinitif de "${selected.expected}" (${selected.personLabel}, ${selected.moodRaw} ${selected.tenseRaw})`,
      expected: displayLemma,
      matchStrategy: "key",
      details: {
        conjugatedForm: selected.expected,
        person: selected.personLabel,
        mood: selected.moodRaw,
        tense: selected.tenseRaw,
        displayLemma
      }
    };
  }

  const expectedAnswers = buildExpectedAnswers(selected);

  return {
    prompt: `Conjugue ${displayLemma} - ${selected.moodRaw} ${selected.tenseRaw} - ${selected.personLabel}`,
    expected: expectedAnswers[0],
    acceptedAnswers: expectedAnswers,
    matchStrategy: "text",
    details: {
      person: selected.personLabel,
      mood: selected.moodRaw,
      tense: selected.tenseRaw,
      displayLemma
    }
  };
}

function isAnswerCorrect(expected, answer, strategy) {
  if (Array.isArray(expected)) {
    return expected.some((candidate) => isAnswerCorrect(candidate, answer, strategy));
  }

  if (strategy === "key") {
    return normalizeKey(expected) === normalizeKey(answer);
  }

  return normalizeText(expected) === normalizeText(answer);
}

export function getLevelRules() {
  return LEVEL_RULES;
}

export function getGameModes() {
  return GAME_MODES;
}

export function createQuestion(level, mode, options = {}) {
  cleanExpiredQuestions();

  const safeLevel = ensureLevel(level);
  const safeMode = ensureMode(mode);
  const pool = LEVEL_RULES[safeLevel].pools;

  const pickOptions = {
    allowedLemmas: expandGloballyAllowedVerbs(),
    verbGroups: options.verbGroups
  };

  const selected = conjugationService.pickQuestion(pool, pickOptions);

  if (!selected) {
    return null;
  }

  const modeQuestion = buildQuestionByMode(safeMode, selected);

  const questionId = crypto.randomUUID();

  questionStore.set(questionId, {
    createdAt: Date.now(),
    expected: modeQuestion.acceptedAnswers ?? modeQuestion.expected,
    level: safeLevel,
    mode: safeMode,
    matchStrategy: modeQuestion.matchStrategy
  });

  return {
    questionId,
    level: safeLevel,
    mode: safeMode,
    lemma: selected.lemma,
    displayLemma: modeQuestion.details?.displayLemma ?? selected.lemma,
    mood: selected.moodRaw,
    tense: selected.tenseRaw,
    person: selected.personLabel,
    prompt: modeQuestion.prompt,
    timeLimitSeconds: GAME_MODES[safeMode].timeLimitSeconds ?? null,
    details: modeQuestion.details
  };
}

export function checkAnswer(questionId, answer) {
  cleanExpiredQuestions();

  const snapshot = questionStore.get(questionId);
  if (!snapshot) {
    return { error: "QUESTION_EXPIREE" };
  }

  questionStore.delete(questionId);

  const isCorrect = isAnswerCorrect(snapshot.expected, answer, snapshot.matchStrategy);

  return {
    correct: isCorrect,
    expected: snapshot.expected,
    answer: typeof answer === "string" ? answer : "",
    level: snapshot.level,
    mode: snapshot.mode
  };
}

export function computeProgression(level, history) {
  const safeLevel = ensureLevel(level);
  const currentIndex = LEVEL_ORDER.indexOf(safeLevel);
  const nextLevel = LEVEL_ORDER[currentIndex + 1] ?? null;
  const rules = LEVEL_RULES[safeLevel];

  if (!history.length) {
    return { nextLevel, promoted: false, successRate: 0 };
  }

  const total = history.length;
  const successCount = history.filter(Boolean).length;
  const successRate = successCount / total;

  const promoted = Boolean(
    nextLevel &&
    total >= rules.minQuestions &&
    successRate >= rules.successRateToPromote
  );

  return {
    nextLevel,
    promoted,
    successRate
  };
}
