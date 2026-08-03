import { LEVEL_RULES } from '../config/cecrl.js';
import { A1_PRIORITY_IRREGULARS } from '../config/a1Verbs.js';
import { GLOBAL_ALLOWED_VERBS } from '../config/allowedVerbs.js';
import { normalizeKey } from './normalize.js';
import verbs from './verbesData.js';

const QUESTION_TTL_MS = 1000 * 60 * 10;
const questionStore = new Map();
const DEFAULT_MODE = 'trouver_conjugaison';

const GAME_MODES = {
  trouver_conjugaison: { label: 'Trouver la conjugaison' },
  battre_la_montre: { label: 'Battre la montre', timeLimitSeconds: 12 },
  trouver_le_temps: { label: 'Trouver le temps' },
  trouver_infinitif: { label: "Trouver l'infinitif" }
};

const PERSON_LABELS = ['je', 'tu', 'il/elle', 'nous', 'vous', 'ils/elles'];
const ETRE_AUXILIARY_LEMMAS = new Set([
  'aller',
  'arriver',
  'descendre',
  'devenir',
  'entrer',
  'monter',
  'mourir',
  'naître',
  'partir',
  'passer',
  'rentrer',
  'rester',
  'retourner',
  'revenir',
  'sortir',
  'tomber',
  'venir'
]);
const DUAL_AUXILIARY_BASE_LEMMAS = ['entrer', 'sortir', 'retourner', 'passer', 'monter', 'descendre'];
const AUXILIARY_CONJUGATIONS = {
  avoir: {
    present: ['ai', 'as', 'a', 'avons', 'avez', 'ont'],
    imparfait: ['avais', 'avais', 'avait', 'avions', 'aviez', 'avaient'],
    passeSimple: ['eus', 'eus', 'eut', 'eûmes', 'eûtes', 'eurent'],
    futurSimple: ['aurai', 'auras', 'aura', 'aurons', 'aurez', 'auront'],
    subjonctifPresent: ['aie', 'aies', 'ait', 'ayons', 'ayez', 'aient'],
    subjonctifImparfait: ['eusse', 'eusses', 'eût', 'eussions', 'eussiez', 'eussent'],
    conditionnelPresent: ['aurais', 'aurais', 'aurait', 'aurions', 'auriez', 'auraient']
  },
  etre: {
    present: ['suis', 'es', 'est', 'sommes', 'êtes', 'sont'],
    imparfait: ['étais', 'étais', 'était', 'étions', 'étiez', 'étaient'],
    passeSimple: ['fus', 'fus', 'fut', 'fûmes', 'fûtes', 'furent'],
    futurSimple: ['serai', 'seras', 'sera', 'serons', 'serez', 'seront'],
    subjonctifPresent: ['sois', 'sois', 'soit', 'soyons', 'soyez', 'soient'],
    subjonctifImparfait: ['fusse', 'fusses', 'fût', 'fussions', 'fussiez', 'fussent'],
    conditionnelPresent: ['serais', 'serais', 'serait', 'serions', 'seriez', 'seraient']
  }
};
const COMPOUND_TENSE_BASES = {
  'indicatif:passe compose': 'present',
  'indicatif:plus que parfait': 'imparfait',
  'indicatif:passe anterieur': 'passeSimple',
  'indicatif:futur anterieur': 'futurSimple',
  'subjonctif:passe': 'subjonctifPresent',
  'subjonctif:plus que parfait': 'subjonctifImparfait',
  'conditionnel:passe 1ere forme': 'conditionnelPresent',
  'conditionnel:passe 2eme forme': 'subjonctifImparfait'
};

function ensureLevel(level) {
  return LEVEL_RULES[level] ? level : 'A1';
}

function ensureMode(mode) {
  return mode && GAME_MODES[mode] ? mode : DEFAULT_MODE;
}

function normalizeLemma(lemma) {
  return normalizeKey(lemma);
}

function expandReflexiveVariants(lemmas) {
  const expanded = new Set();
  for (const lemma of lemmas) {
    expanded.add(lemma);
    const normalized = normalizeLemma(lemma);
    if (normalized.startsWith('se ')) {
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

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function formatVerbForPrompt(lemma) {
  return escapeHtml(String(lemma).toLocaleUpperCase('fr-FR'));
}

function formatModeAndTenseForPrompt(mood, tense) {
  return escapeHtml(`${String(mood).toLocaleLowerCase('fr-FR')} ${String(tense).toLocaleLowerCase('fr-FR')}`);
}

function formatModeAndTenseWithArticle(mood, tense) {
  const moodLower = String(mood).toLocaleLowerCase('fr-FR');
  const tenseLower = String(tense).toLocaleLowerCase('fr-FR');
  const article = moodLower === 'conditionnel' || moodLower === 'subjonctif' ? 'au ' : "à l'";
  return `${article}${moodLower} ${tenseLower}`;
}

function formatPersonForPrompt(person) {
  return escapeHtml(String(person));
}

function getSubjectVariants(personLabel) {
  switch (personLabel) {
    case 'je':
      return ['je', "j'"];
    case 'tu':
    case 'nous':
    case 'vous':
      return [personLabel];
    case 'il/elle':
      return ['il', 'elle', 'on'];
    case 'ils/elles':
      return ['ils', 'elles'];
    default:
      return [];
  }
}

function normalizeSpaces(value) {
  return String(value).trim().replace(/\s+/g, ' ');
}

function maybeAddAgreementVariants(participle, usesEtre) {
  if (!usesEtre) {
    return [participle];
  }

  const variants = new Set([participle]);
  if (!/[sx]$/i.test(participle)) {
    // Masculine singular: generate all four agreement forms
    variants.add(`${participle}e`);
    variants.add(`${participle}s`);
    variants.add(`${participle}es`);
  } else if (/[^sx]s$/i.test(participle)) {
    // Masculine plural (e.g. "venus"): derive the singular base and add missing feminine forms
    const base = participle.slice(0, -1);
    variants.add(base);
    variants.add(`${base}e`);
    variants.add(`${base}es`);
  }
  return Array.from(variants);
}

function isReflexiveLemma(normalizedLemma) {
  return normalizedLemma.startsWith('se ') || normalizedLemma.startsWith("s'");
}

function isDualAuxiliaryLemma(lemma) {
  const normalizedLemma = normalizeLemma(lemma);
  if (isReflexiveLemma(normalizedLemma)) {
    return false;
  }

  return DUAL_AUXILIARY_BASE_LEMMAS.some((baseLemma) => {
    return normalizedLemma === baseLemma || normalizedLemma.endsWith(baseLemma);
  });
}

function getAuxiliaryKeys(lemma) {
  const normalizedLemma = normalizeLemma(lemma);
  if (isReflexiveLemma(normalizedLemma)) {
    return ['etre'];
  }

  if (isDualAuxiliaryLemma(normalizedLemma)) {
    return ['etre', 'avoir'];
  }

  return ETRE_AUXILIARY_LEMMAS.has(normalizedLemma) ? ['etre'] : ['avoir'];
}

function getCompoundTenseBase(moodRaw, tenseRaw) {
  return COMPOUND_TENSE_BASES[`${normalizeKey(moodRaw)}:${normalizeKey(tenseRaw)}`] ?? null;
}

function buildExpectedAnswers(selected) {
  const compoundBase = getCompoundTenseBase(selected.moodRaw, selected.tenseRaw);
  if (!compoundBase) {
    return [normalizeSpaces(selected.expected)];
  }

  const auxiliaryKeys = getAuxiliaryKeys(selected.lemma);
  const subjectVariants = getSubjectVariants(selected.personLabel);
  const answers = new Set();
  const normalizedParticiple = normalizeSpaces(selected.expected);

  for (const auxiliaryKey of auxiliaryKeys) {
    const auxiliaryForms = AUXILIARY_CONJUGATIONS[auxiliaryKey]?.[compoundBase];
    if (!auxiliaryForms) {
      continue;
    }

    const auxiliaryForm = auxiliaryForms[selected.personIndex];
    const participleVariants = maybeAddAgreementVariants(normalizedParticiple, auxiliaryKey === 'etre');

    for (const participle of participleVariants) {
      answers.add(normalizeSpaces(`${auxiliaryForm} ${participle}`));
      for (const subject of subjectVariants) {
        if (subject.endsWith("'")) {
          answers.add(normalizeSpaces(`${subject}${auxiliaryForm} ${participle}`));
        } else {
          answers.add(normalizeSpaces(`${subject} ${auxiliaryForm} ${participle}`));
        }
      }
    }
  }

  if (answers.size === 0) {
    return [normalizedParticiple];
  }

  return Array.from(answers);
}

function buildQuestionByMode(mode, selected) {
  const verbPrompt = formatVerbForPrompt(selected.lemma);
  const moodAndTenseWithArticle = formatModeAndTenseWithArticle(selected.moodRaw, selected.tenseRaw);
  const personPrompt = formatPersonForPrompt(selected.personLabel);
  const expectedAnswers = buildExpectedAnswers(selected);

  if (mode === 'trouver_le_temps') {
    return {
      prompt: `Trouve le temps de "${selected.expected}" (${selected.personLabel}) pour ${selected.lemma}`,
      promptHtml: `Trouve le temps de <strong>"${escapeHtml(selected.expected)}"</strong> pour le verbe <strong>"${verbPrompt}"</strong>, à la personne <strong>"${personPrompt}"</strong>`,
      expected: selected.tenseRaw,
      matchStrategy: 'key',
      details: {
        conjugatedForm: selected.expected,
        person: selected.personLabel
      }
    };
  }

  if (mode === 'trouver_infinitif') {
    return {
      prompt: `Trouve l'infinitif de "${selected.expected}" (${selected.personLabel}, ${selected.moodRaw} ${selected.tenseRaw})`,
      promptHtml: `Trouve l'infinitif de <strong>"${escapeHtml(selected.expected)}"</strong>, conjugué <strong>${escapeHtml(moodAndTenseWithArticle)}</strong>, à la personne <strong>"${personPrompt}"</strong>`,
      expected: selected.lemma,
      matchStrategy: 'key',
      details: {
        conjugatedForm: selected.expected,
        person: selected.personLabel,
        mood: selected.moodRaw,
        tense: selected.tenseRaw
      }
    };
  }

  return {
    prompt: `Conjugue le verbe "${String(selected.lemma).toLocaleUpperCase('fr-FR')}" ${moodAndTenseWithArticle}, à la personne "${selected.personLabel}"`,
    promptHtml: `Conjugue le verbe <strong>"${verbPrompt}"</strong> <strong>${escapeHtml(moodAndTenseWithArticle)}</strong>, à la personne <strong>"${personPrompt}"</strong>`,
    expected: expectedAnswers[0],
    acceptedAnswers: expectedAnswers,
    matchStrategy: 'text',
    details: {
      person: selected.personLabel,
      mood: selected.moodRaw,
      tense: selected.tenseRaw
    }
  };
}

function isAnswerCorrect(expected, answer, strategy) {
  if (Array.isArray(expected)) {
    return expected.some((candidate) => isAnswerCorrect(candidate, answer, strategy));
  }

  const cleanExpected = normalizeSpaces(expected);
  const cleanAnswer = normalizeSpaces(answer);

  if (strategy === 'key') {
    return cleanExpected === cleanAnswer;
  }
  return cleanExpected === cleanAnswer;
}

function cleanExpiredQuestions() {
  const now = Date.now();
  for (const [id, value] of questionStore.entries()) {
    if (now - value.createdAt > QUESTION_TTL_MS) {
      questionStore.delete(id);
    }
  }
}

function getLemma(entry) {
  return (
    entry?.infinitif?.['présent']?.[0] ??
    entry?.Infinitif?.['Présent']?.[0] ??
    entry?.infinitif?.['Present']?.[0] ??
    entry?.Infinitif?.['Present']?.[0] ??
    'verbe inconnu'
  );
}

function isSixPersonTense(forms) {
  return Array.isArray(forms) && forms.length === 6 && forms.every((form) => typeof form === 'string');
}

function buildTenseIndex(entry) {
  const index = [];
  for (const [moodName, moodValue] of Object.entries(entry)) {
    if (!moodValue || typeof moodValue !== 'object') {
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

function getEntries() {
  return (verbs ?? []).map((entry) => {
    const lemma = getLemma(entry);
    return {
      lemma,
      tenses: buildTenseIndex(entry)
    };
  }).filter((entry) => entry.tenses.length > 0);
}

function pickQuestion(poolDefinitions, options = {}) {
  const entries = getEntries();
  if (!Array.isArray(poolDefinitions) || poolDefinitions.length === 0 || entries.length === 0) {
    return null;
  }

  const allowedSet = new Set((options.allowedLemmas ?? []).map((lemma) => normalizeLemma(lemma)));
  const prioritySet = new Set((options.prioritizedLemmas ?? []).map((lemma) => normalizeLemma(lemma)));
  const useAllowedSet = allowedSet.size > 0;

  const eligible = [];
  const priorityEligible = [];

  for (const verb of entries) {
    const normalizedLemma = normalizeLemma(verb.lemma);
    if (useAllowedSet && !allowedSet.has(normalizedLemma)) {
      continue;
    }

    for (const tense of verb.tenses) {
      const match = poolDefinitions.some((pool) => tense.mood === normalizeKey(pool.mood) && tense.tense === normalizeKey(pool.tense));
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
        if (prioritySet.has(normalizedLemma)) {
          priorityEligible.push(candidate);
        }
      }
    }
  }

  if (eligible.length === 0) {
    return null;
  }

  const priorityWeight = Number.isFinite(options.priorityWeight) ? options.priorityWeight : 0;
  const shouldPickPriority = priorityEligible.length > 0 && priorityWeight > 0 && (options.random?.() ?? Math.random()) < Math.min(Math.max(priorityWeight, 0), 1);

  const source = shouldPickPriority ? priorityEligible : eligible;
  const randomIndex = Math.floor((options.random?.() ?? Math.random()) * source.length);
  return source[randomIndex];
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
  const configuredPool = Array.isArray(options.poolDefinitions) && options.poolDefinitions.length > 0
    ? options.poolDefinitions
    : LEVEL_RULES[safeLevel].pools;

  const pickOptions = {
    allowedLemmas: expandGloballyAllowedVerbs()
  };

  if (safeLevel === 'A1') {
    pickOptions.prioritizedLemmas = A1_PRIORITY_IRREGULARS;
    pickOptions.priorityWeight = 0.55;
  }

  const selected = pickQuestion(configuredPool, { ...pickOptions, ...options });
  if (!selected) {
    return null;
  }

  const modeQuestion = buildQuestionByMode(safeMode, selected);
  const questionId = crypto.randomUUID();

  questionStore.set(questionId, {
    createdAt: Date.now(),
    expected: modeQuestion.acceptedAnswers ?? modeQuestion.expected,
    displayExpected: modeQuestion.expected,
    level: safeLevel,
    mode: safeMode,
    matchStrategy: modeQuestion.matchStrategy
  });

  return {
    questionId,
    level: safeLevel,
    mode: safeMode,
    lemma: selected.lemma,
    mood: selected.moodRaw,
    tense: selected.tenseRaw,
    person: selected.personLabel,
    prompt: modeQuestion.prompt,
    timeLimitSeconds: GAME_MODES[safeMode].timeLimitSeconds ?? null,
    details: modeQuestion.details,
    expected: modeQuestion.expected
  };
}

export function checkAnswer(questionId, answer) {
  cleanExpiredQuestions();
  const snapshot = questionStore.get(questionId);
  if (!snapshot) {
    return { error: 'QUESTION_EXPIREE' };
  }

  questionStore.delete(questionId);
  return {
    correct: isAnswerCorrect(snapshot.expected, answer, snapshot.matchStrategy),
    expected: snapshot.displayExpected ?? (Array.isArray(snapshot.expected) ? snapshot.expected[0] : snapshot.expected),
    answer: typeof answer === 'string' ? answer : '',
    level: snapshot.level,
    mode: snapshot.mode
  };
}

export function computeProgression(level, history) {
  const safeLevel = ensureLevel(level);
  const currentIndex = Object.keys(LEVEL_RULES).indexOf(safeLevel);
  const nextLevel = Object.keys(LEVEL_RULES)[currentIndex + 1] ?? null;
  const rules = LEVEL_RULES[safeLevel];

  if (!history.length) {
    return { nextLevel, promoted: false, successRate: 0 };
  }

  const total = history.length;
  const successCount = history.filter(Boolean).length;
  const successRate = successCount / total;
  const promoted = Boolean(nextLevel && total >= rules.minQuestions && successRate >= rules.successRateToPromote);

  return {
    nextLevel,
    promoted,
    successRate
  };
}
